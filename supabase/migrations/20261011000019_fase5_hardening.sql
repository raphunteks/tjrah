-- ════════════════════════════════════════════════════════════════════════════
-- FASE 5A — Hardening & utang teknis
--  5.1 Pembatasan tebakan PIN otorisasi (diskon/void)   _pin_authorizer v2
--  5.2 Tukar shift antar karyawan (persetujuan GM)       shift_swaps, request_swap/respond_swap/decide_swap/cancel_swap
--  5.3 Estimasi labour cost vs proyeksi penjualan         labour_cost_estimate()
-- Tidak mengubah matriks RBAC.
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ 5.1 PIN: batas tebakan ══════════════════════════════════════════════════
-- Catatan teknis: RAISE membatalkan seluruh transaksi, jadi penghitung gagal-PIN di tabel akan ikut hilang (tak bisa dipersistenkan tanpa
-- transaksi otonom). Sebagai gantinya, pemeriksaan PIN diserialkan per tenant dengan advisory lock dan tiap tebakan SALAH menahan lock 1,5 detik:
-- maksimal ±40 tebakan/menit per tenant berapa pun koneksi paralelnya (PIN 6 digit ≈ 12 hari untuk menyapu seluruh ruang tebakan).
-- Tebakan benar tidak ditahan. Penyerang yang menumpuk koneksi hanya menumpuk antrean (dipotong statement_timeout).
create or replace function public._pin_authorizer(p_tenant uuid, p_branch uuid, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r record; found_id uuid;
begin
  if p_pin is null or btrim(p_pin) = '' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('pin:' || p_tenant::text, 0));
  for r in select id, role, pin_hash from profiles
           where tenant_id = p_tenant and role in ('gm', 'owner') and is_active and pin_hash is not null loop
    if crypt(p_pin, r.pin_hash) = r.pin_hash then
      if r.role = 'owner'
         or not exists (select 1 from member_branches where profile_id = r.id)
         or exists (select 1 from member_branches where profile_id = r.id and branch_id = p_branch) then
        found_id := r.id; exit;
      end if;
    end if;
  end loop;
  if found_id is null then perform pg_sleep(1.5); end if;
  return found_id;
end $$;
revoke execute on function public._pin_authorizer(uuid, uuid, text) from public, anon, authenticated;

-- ═══ 5.2 Tukar shift ═════════════════════════════════════════════════════════
create table if not exists public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  my_shift uuid not null references public.work_shifts(id) on delete cascade,
  their_shift uuid references public.work_shifts(id) on delete cascade,        -- null = serah-terima (target mengambil shift, tanpa imbalan)
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'accepted', 'declined', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles(id),
  decision_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (requester_id <> target_id)
);
create index if not exists shift_swaps_tenant_idx on public.shift_swaps (tenant_id, status);
alter table public.shift_swaps enable row level security;
create policy shift_swaps_read on public.shift_swaps for select using (
  tenant_ok(tenant_id) and (requester_id = auth.uid() or target_id = auth.uid()
    or (current_app_role()::text in ('owner', 'gm') and has_perm(13, 'r') and branch_ok(branch_id))));

create or replace function public._shift_overlap(p_profile uuid, p_date date, p_start time, p_end time, p_ignore uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from work_shifts w where w.profile_id = p_profile and w.work_date = p_date and w.id <> all (p_ignore)
                   and w.start_time < p_end and p_start < w.end_time) $$;
revoke execute on function public._shift_overlap(uuid, date, time, time, uuid[]) from public, anon, authenticated;

create or replace function public._swap_check(s shift_swaps) returns void
language plpgsql stable security definer set search_path = public as $$
declare a work_shifts; b work_shifts;
begin
  select * into a from work_shifts where id = s.my_shift;
  if not found or a.profile_id <> s.requester_id then raise exception 'Shift pemohon sudah berubah'; end if;
  if a.work_date <= _tenant_now(s.tenant_id)::date then raise exception 'Hanya shift yang belum berlangsung yang bisa ditukar'; end if;
  if s.their_shift is null then
    if _shift_overlap(s.target_id, a.work_date, a.start_time, a.end_time, array[a.id]) then raise exception 'Tujuan sudah punya shift yang bentrok pada jam itu'; end if;
  else
    select * into b from work_shifts where id = s.their_shift;
    if not found or b.profile_id <> s.target_id then raise exception 'Shift tujuan sudah berubah'; end if;
    if b.work_date <= _tenant_now(s.tenant_id)::date then raise exception 'Hanya shift yang belum berlangsung yang bisa ditukar'; end if;
    if b.branch_id <> a.branch_id then raise exception 'Tukar shift hanya antar karyawan di cabang yang sama'; end if;
    if _shift_overlap(s.target_id, a.work_date, a.start_time, a.end_time, array[a.id, b.id]) then raise exception 'Tujuan bentrok pada jam shift pemohon'; end if;
    if _shift_overlap(s.requester_id, b.work_date, b.start_time, b.end_time, array[a.id, b.id]) then raise exception 'Pemohon bentrok pada jam shift tujuan'; end if;
  end if;
end $$;
revoke execute on function public._swap_check(shift_swaps) from public, anon, authenticated;

create or replace function public.request_swap(p_my_shift uuid, p_target uuid, p_their_shift uuid default null, p_reason text default null)
returns shift_swaps language plpgsql security definer set search_path = public as $$
declare a work_shifts; tg profiles; s shift_swaps;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if current_app_role()::text not in ('staff', 'dokter', 'gm') then raise exception 'Peran ini tidak menukar shift'; end if;
  select * into a from work_shifts where id = p_my_shift;
  if not found or a.profile_id <> auth.uid() or not tenant_ok(a.tenant_id) then raise exception 'Shift tidak ditemukan'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Alasan minimal 5 karakter'; end if;
  select * into tg from profiles where id = p_target and tenant_id = a.tenant_id and is_active;
  if not found or tg.id = auth.uid() then raise exception 'Karyawan tujuan tidak valid'; end if;
  if tg.role::text <> current_app_role()::text then raise exception 'Tukar shift hanya antar peran yang sama'; end if;
  if not (tg.branch_id = a.branch_id or exists (select 1 from member_branches m where m.profile_id = tg.id and m.branch_id = a.branch_id)) then
    raise exception 'Karyawan tujuan tidak ditugaskan di cabang ini';
  end if;
  if exists (select 1 from shift_swaps x where x.my_shift = p_my_shift and x.status in ('requested', 'accepted')) then raise exception 'Shift ini sudah punya permintaan tukar yang berjalan'; end if;
  insert into shift_swaps (tenant_id, branch_id, requester_id, target_id, my_shift, their_shift, reason)
  values (a.tenant_id, a.branch_id, auth.uid(), p_target, p_my_shift, p_their_shift, btrim(p_reason)) returning * into s;
  perform _swap_check(s);                                   -- gagal cepat bila bentrok/di masa lalu (insert ikut dibatalkan)
  return s;
end $$;

create or replace function public.respond_swap(p_swap uuid, p_accept boolean) returns shift_swaps
language plpgsql security definer set search_path = public as $$
declare s shift_swaps;
begin
  select * into s from shift_swaps where id = p_swap for update;
  if not found or s.target_id <> auth.uid() then raise exception 'Permintaan tidak ditemukan'; end if;
  if s.status <> 'requested' then raise exception 'Permintaan sudah %', s.status; end if;
  if p_accept then perform _swap_check(s); end if;
  update shift_swaps set status = case when p_accept then 'accepted' else 'declined' end where id = s.id returning * into s;
  if p_accept then
    perform _hermes(s.tenant_id, 'whatsapp', 'GM', 'inquiry', 'Ada permintaan tukar shift yang menunggu persetujuan GM.', jsonb_build_object('swap_id', s.id));
  end if;
  return s;
end $$;

create or replace function public.cancel_swap(p_swap uuid) returns shift_swaps
language plpgsql security definer set search_path = public as $$
declare s shift_swaps;
begin
  select * into s from shift_swaps where id = p_swap for update;
  if not found or s.requester_id <> auth.uid() then raise exception 'Permintaan tidak ditemukan'; end if;
  if s.status not in ('requested', 'accepted') then raise exception 'Permintaan sudah %', s.status; end if;
  update shift_swaps set status = 'cancelled' where id = s.id returning * into s;
  return s;
end $$;

create or replace function public.decide_swap(p_swap uuid, p_approve boolean, p_note text default null) returns shift_swaps
language plpgsql security definer set search_path = public as $$
declare s shift_swaps;
begin
  perform _need(13, 'u');
  if current_app_role()::text not in ('owner', 'gm') then raise exception 'Hanya GM/Owner yang memutuskan tukar shift'; end if;
  select * into s from shift_swaps where id = p_swap for update;
  if not found or not tenant_ok(s.tenant_id) or not branch_ok(s.branch_id) then raise exception 'Permintaan tidak ditemukan'; end if;
  if s.status <> 'accepted' then raise exception 'Permintaan belum disetujui rekan atau sudah diputuskan (%)', s.status; end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) < 5 then raise exception 'Alasan penolakan wajib diisi'; end if;
  if p_approve then
    perform _swap_check(s);
    update work_shifts set profile_id = s.target_id where id = s.my_shift;
    if s.their_shift is not null then update work_shifts set profile_id = s.requester_id where id = s.their_shift; end if;
  end if;
  update shift_swaps set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decision_note = nullif(btrim(p_note), ''), decided_at = now()
   where id = s.id returning * into s;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (s.tenant_id, auth.uid(), current_app_role(), case when p_approve then 'swap_approved' else 'swap_rejected' end, 'shift_swaps', s.id::text,
          jsonb_build_object('requester', s.requester_id, 'target', s.target_id));
  return s;
end $$;

-- ═══ 5.3 Estimasi labour cost ════════════════════════════════════════════════
-- Biaya per jam = gaji pokok ÷ 173 (pembagi jam kerja bulanan umum). Penjualan = rata-rata hari-dalam-minggu yang sama, 28 hari terakhir.
-- Karyawan tanpa gaji pokok tidak dihitung dan dilaporkan di missing_salary (angkanya jadi batas bawah).
create or replace function public.labour_cost_estimate(p_from date, p_to date, p_branch uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); rows jsonb; missing jsonb; tot_c numeric; tot_s numeric;
begin
  perform _need(13, 'r');
  if current_app_role()::text not in ('owner', 'gm', 'superadmin') then raise exception 'Estimasi labour cost hanya untuk Owner/GM'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'Rentang tanggal 1–62 hari'; end if;
  if p_branch is not null then perform _branch_guard(p_branch); end if;
  with sh as (
    select w.work_date d, w.branch_id, w.profile_id, extract(epoch from (w.end_time - w.start_time)) / 3600 hrs, pr.base_salary
    from work_shifts w join profiles pr on pr.id = w.profile_id
    where w.tenant_id = t and w.work_date between p_from and p_to and branch_ok(w.branch_id) and (p_branch is null or w.branch_id = p_branch)),
  hist as (
    select extract(dow from o.paid_at at time zone (select timezone from tenants where id = t))::int dw, sum(o.total) / 4 avg_sales
    from orders o where o.tenant_id = t and o.status = 'paid' and o.paid_at >= now() - interval '28 days' and branch_ok(o.branch_id) and (p_branch is null or o.branch_id = p_branch)
    group by 1),
  day as (
    select d, sum(hrs) hrs, sum(hrs * coalesce(base_salary, 0) / 173) cost, count(distinct profile_id) people from sh group by d)
  select coalesce(jsonb_agg(jsonb_build_object('date', d.d, 'hours', round(d.hrs, 1), 'people', d.people, 'cost', round(d.cost),
           'forecast_sales', round(coalesce(h.avg_sales, 0)), 'labour_pct', case when coalesce(h.avg_sales, 0) > 0 then round(d.cost / h.avg_sales * 100, 1) end) order by d.d), '[]'),
         coalesce(sum(d.cost), 0), coalesce(sum(h.avg_sales), 0)
    into rows, tot_c, tot_s
  from day d left join hist h on h.dw = extract(dow from d.d)::int;
  select coalesce(jsonb_agg(distinct pr.full_name), '[]') into missing
    from work_shifts w join profiles pr on pr.id = w.profile_id
   where w.tenant_id = t and w.work_date between p_from and p_to and coalesce(pr.base_salary, 0) = 0 and branch_ok(w.branch_id) and (p_branch is null or w.branch_id = p_branch);
  return jsonb_build_object('rows', rows, 'total_cost', round(tot_c), 'total_forecast_sales', round(tot_s),
                            'labour_pct', case when tot_s > 0 then round(tot_c / tot_s * 100, 1) end, 'missing_salary', missing);
end $$;

grant execute on function public.request_swap(uuid, uuid, uuid, text), public.respond_swap(uuid, boolean), public.cancel_swap(uuid),
  public.decide_swap(uuid, boolean, text), public.labour_cost_estimate(date, date, uuid) to authenticated;

-- ═════════ 5.2b · Direktori tukar shift (Staff/Dokter tidak boleh membaca profil & jadwal rekan lewat RLS) ═════════
-- Hanya mengembalikan nama + shift mendatang rekan SEPERAN di cabang yang sama; tidak membuka gaji/kontak.
create or replace function public.swap_candidates(p_my_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a work_shifts;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi'; end if;
  if current_app_role()::text not in ('staff', 'dokter', 'gm') then raise exception 'Peran ini tidak menukar shift'; end if;
  select * into a from work_shifts where id = p_my_shift;
  if not found or a.profile_id <> auth.uid() or not tenant_ok(a.tenant_id) then raise exception 'Shift tidak ditemukan'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('profile_id', p.id, 'full_name', p.full_name,
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'work_date', w.work_date, 'start_time', w.start_time, 'end_time', w.end_time) order by w.work_date, w.start_time)
                            from work_shifts w where w.profile_id = p.id and w.branch_id = a.branch_id and w.work_date > _tenant_now(a.tenant_id)::date and w.work_date <= _tenant_now(a.tenant_id)::date + 30), '[]'::jsonb))
      order by p.full_name)
    from profiles p
   where p.tenant_id = a.tenant_id and p.is_active and p.id <> auth.uid() and p.role::text = current_app_role()::text
     and (p.branch_id = a.branch_id or exists (select 1 from member_branches m where m.profile_id = p.id and m.branch_id = a.branch_id))), '[]'::jsonb);
end $$;

-- Daftar permintaan beserta nama & jam shift. Definer agar rekan terbaca namanya; baris dibatasi sama persis dengan policy shift_swaps_read.
create or replace function public.my_swaps() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'reason', s.reason, 'decision_note', s.decision_note, 'created_at', s.created_at,
      'requester_id', s.requester_id, 'target_id', s.target_id, 'branch_id', s.branch_id,
      'requester', (select full_name from profiles where id = s.requester_id), 'target', (select full_name from profiles where id = s.target_id),
      'my_shift', (select jsonb_build_object('id', w.id, 'work_date', w.work_date, 'start_time', w.start_time, 'end_time', w.end_time) from work_shifts w where w.id = s.my_shift),
      'their_shift', (select jsonb_build_object('id', w.id, 'work_date', w.work_date, 'start_time', w.start_time, 'end_time', w.end_time) from work_shifts w where w.id = s.their_shift))
      order by s.created_at desc), '[]'::jsonb)
  from shift_swaps s
 where auth.uid() is not null and tenant_ok(s.tenant_id)
   and (s.requester_id = auth.uid() or s.target_id = auth.uid()
        or (current_app_role()::text in ('owner', 'gm') and has_perm(13, 'r') and branch_ok(s.branch_id)));
$$;

grant execute on function public.swap_candidates(uuid), public.my_swaps() to authenticated;

-- ═════════ 5.4 · Hardening menyeluruh: kunci publik (anon) tidak boleh menjalankan RPC apa pun ═════════
-- Di Supabase fungsi baru otomatis dapat EXECUTE untuk anon. Beberapa fungsi memperlakukan auth.uid() IS NULL sebagai "jalur sistem"
-- (generate_invoices, run_dunning, refresh_benchmark, dst.) sehingga anon bisa memicunya. Semua RPC hanya untuk pengguna masuk & service_role.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke execute on function public._promo_discount(public.promos, numeric) from public, anon, authenticated;
