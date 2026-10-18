-- Harum.in · Migrasi 15 — FASE 2.2–2.6: celah nyata yang ditemukan lewat audit (bukan fitur kosong; halamannya sudah ada).
--
--  2.2 Absensi   : akurasi GPS, radius dari kebijakan, urutan masuk→pulang, selfie dengan persetujuan (PDP), telat & lembur,
--                  koreksi absen oleh GM/Owner dengan alasan + audit, opsi "wajib absen sebelum buka shift".
--  2.3 Payroll   : kasbon sungguhan (staff_loans) yang dipotong otomatis; lembur & denda telat dari absensi;
--                  baris payroll TERKUNCI setelah diajukan (sebelumnya GM bisa mengubah angka setelah Owner diminta menyetujui);
--                  jurnal payroll memisahkan beban kotor, utang gaji, dan piutang karyawan.
--  2.4 CRM       : poin tidak bisa diubah manual oleh siapa pun (sebelumnya GM/Owner bisa menaikkan, Kasir bisa menurunkan tanpa jejak);
--                  penukaran poin lewat redeem_points() dengan audit.
--  2.5 Kas kecil : foto nota wajib, batas nominal per tenant, validasi memeriksa cabang, tidak boleh memvalidasi pengajuan sendiri,
--                  alasan penolakan wajib.
--  2.6 Capital   : status pengajuan hanya bisa diputuskan Superadmin/lender; Owner & GM tidak bisa menyetujui diri sendiri
--                  dan tidak bisa mengubah nominal setelah dikirim.
--
-- Tidak mengubah baris matriks RBAC (versi asli tetap).

-- ══════════════════════════════════════════════════════════════════════════════
-- 0 · Pengaturan per tenant
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.tenants
  add column if not exists attendance_selfie_required boolean not null default false,
  add column if not exists attendance_before_shift boolean not null default false,
  add column if not exists late_grace_min int not null default 10 check (late_grace_min between 0 and 120),
  add column if not exists late_penalty_per_min numeric(12,2) not null default 0 check (late_penalty_per_min >= 0),
  add column if not exists overtime_rate_per_hour numeric(12,2) not null default 0 check (overtime_rate_per_hour >= 0),
  add column if not exists petty_limit numeric(14,2) not null default 500000 check (petty_limit > 0),
  add column if not exists loan_max_multiple numeric(4,2) not null default 1 check (loan_max_multiple between 0 and 6);
comment on column public.tenants.attendance_before_shift is 'Kasir wajib absen masuk sebelum membuka shift.';
comment on column public.tenants.petty_limit is 'Batas satu pengajuan kas kecil. Di atas ini gunakan Pembelian/PO.';
comment on column public.tenants.loan_max_multiple is 'Total kasbon berjalan per karyawan maksimal sekian × gaji pokok.';

alter table public.profiles add column if not exists attendance_consent_at timestamptz;
comment on column public.profiles.attendance_consent_at is 'Persetujuan karyawan atas pemrosesan selfie & lokasi absensi (UU PDP). Selfie ditolak bila kosong.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 1 · 2.2 Absensi
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.attendance
  add column if not exists accuracy_m int,
  add column if not exists late_min int not null default 0,
  add column if not exists overtime_min int not null default 0,
  add column if not exists corrected_by uuid references public.profiles(id),
  add column if not exists correction_reason text;

-- Menit telat (setelah toleransi) untuk absen masuk, lembur (setelah jam selesai) untuk absen pulang — jam lokal tenant.
create or replace function public._att_calc(p_tenant uuid, p_profile uuid, p_kind text, p_at timestamptz, out late int, out ot int)
language plpgsql stable security definer set search_path = public as $$
declare tz text; grace int; loc timestamp; ws record;
begin
  late := 0; ot := 0;
  select coalesce(timezone, 'Asia/Jakarta'), late_grace_min into tz, grace from tenants where id = p_tenant;
  loc := p_at at time zone tz;
  select start_time, end_time into ws from work_shifts where profile_id = p_profile and work_date = loc::date order by start_time limit 1;
  if not found then return; end if;
  if p_kind = 'in' then
    late := greatest(0, floor(extract(epoch from (loc::time - ws.start_time)) / 60)::int - grace);
  elsif ws.end_time > ws.start_time then
    ot := greatest(0, floor(extract(epoch from (loc::time - ws.end_time)) / 60)::int);
  end if;
exception when others then
  late := 0; ot := 0;
end $$;
revoke execute on function public._att_calc(uuid, uuid, text, timestamptz) from public, anon, authenticated;

create or replace function public.give_attendance_consent() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz := now();
begin
  update profiles set attendance_consent_at = coalesce(attendance_consent_at, ts) where id = auth.uid();
  return (select attendance_consent_at from profiles where id = auth.uid());
end $$;
grant execute on function public.give_attendance_consent() to authenticated;

drop function if exists public.clock(text, double precision, double precision);
create or replace function public.clock(
  p_kind text, p_lat double precision, p_lng double precision, p_accuracy int default null, p_selfie text default null
) returns attendance
language plpgsql security definer set search_path = public as $$
declare me profiles; b branches; t tenants; d numeric; a attendance; pol jsonb; radius numeric; lastk text; calc record; tzday date;
begin
  perform _need(13, 'c');
  if p_kind not in ('in', 'out') then raise exception 'Jenis absen tidak valid'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Koordinat tidak valid'; end if;
  select * into me from profiles where id = auth.uid();
  select * into b from branches where id = me.branch_id;
  select * into t from tenants where id = me.tenant_id;
  if b.id is null or b.lat is null then raise exception 'Akun belum ditautkan ke cabang dengan koordinat'; end if;
  if p_accuracy is not null and p_accuracy > 100 then
    raise exception 'Akurasi GPS terlalu rendah (± % m). Pindah ke tempat terbuka lalu coba lagi.', p_accuracy;
  end if;

  -- Radius: kebijakan tersimpan (Fase 1.4) bila ada, jika tidak titik cabang
  pol := get_effective_policy(me.tenant_id, b.id, me.role);
  radius := case when coalesce((pol->>'layer')::int, 0) > 0 then (pol->>'geofence_radius_meters')::numeric else b.geofence_m end;
  d := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - b.lat) / 2), 2)
       + cos(radians(b.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - b.lng) / 2), 2)));
  if d > radius then raise exception 'Anda berada % m dari %, di luar radius % m', round(d), b.name, round(radius); end if;

  -- Selfie: wajib bila tenant meminta; hanya diterima dengan persetujuan karyawan (PDP)
  if t.attendance_selfie_required and (p_selfie is null or btrim(p_selfie) = '') then raise exception 'Selfie wajib untuk absen di tenant ini'; end if;
  if p_selfie is not null and btrim(p_selfie) <> '' and me.attendance_consent_at is null then
    raise exception 'Setujui dulu penggunaan foto selfie untuk absensi (UU PDP)';
  end if;

  -- Urutan masuk → pulang pada hari lokal tenant
  tzday := (now() at time zone coalesce(t.timezone, 'Asia/Jakarta'))::date;
  select kind into lastk from attendance
   where profile_id = me.id and (created_at at time zone coalesce(t.timezone, 'Asia/Jakarta'))::date = tzday order by created_at desc limit 1;
  if p_kind = 'in' and lastk = 'in' then raise exception 'Anda sudah absen masuk hari ini. Absen pulang dulu.'; end if;
  if p_kind = 'out' and coalesce(lastk, 'out') = 'out' then raise exception 'Belum ada absen masuk yang terbuka hari ini'; end if;

  select * into calc from _att_calc(me.tenant_id, me.id, p_kind, now());
  insert into attendance (tenant_id, branch_id, profile_id, kind, lat, lng, distance_m, accuracy_m, selfie_path, late_min, overtime_min)
  values (me.tenant_id, b.id, me.id, p_kind, p_lat, p_lng, round(d), p_accuracy, nullif(btrim(coalesce(p_selfie, '')), ''), calc.late, calc.ot)
  returning * into a;
  return a;
end $$;
grant execute on function public.clock(text, double precision, double precision, int, text) to authenticated;

-- Koreksi absen: GM/Owner, alasan wajib, tidak boleh mengoreksi absen sendiri, tercatat di audit.
create or replace function public.correct_attendance(p_id uuid, p_at timestamptz, p_reason text) returns attendance
language plpgsql security definer set search_path = public as $$
declare a attendance; calc record;
begin
  perform _need(13, 'u');
  if coalesce(length(btrim(p_reason)), 0) < 5 then raise exception 'Alasan koreksi wajib diisi (min. 5 karakter)'; end if;
  select * into a from attendance where id = p_id for update;
  if not found or not tenant_ok(a.tenant_id) or not branch_ok(a.branch_id) then raise exception 'Data absen tidak ditemukan'; end if;
  if a.profile_id = auth.uid() then raise exception 'Anda tidak dapat mengoreksi absen Anda sendiri'; end if;
  if p_at > now() then raise exception 'Waktu koreksi tidak boleh di masa depan'; end if;
  select * into calc from _att_calc(a.tenant_id, a.profile_id, a.kind, p_at);
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (a.tenant_id, auth.uid(), current_app_role(), 'attendance_corrected', 'attendance', a.id::text,
          jsonb_build_object('before', a.created_at, 'after', p_at, 'reason', p_reason, 'profile', a.profile_id));
  update attendance set created_at = p_at, late_min = calc.late, overtime_min = calc.ot, corrected_by = auth.uid(), correction_reason = p_reason
  where id = p_id returning * into a;
  return a;
end $$;
grant execute on function public.correct_attendance(uuid, timestamptz, text) to authenticated;

-- open_shift = versi 14 + syarat absen masuk (bila tenant mengaktifkannya)
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  s shifts; pol jsonb; v_start time; v_end time; v_now time := _tenant_now(t)::time; outside boolean; tn tenants; lastk text;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;
  select * into tn from tenants where id = t;

  pol := get_effective_policy(t, p_branch, current_app_role());
  if pol is not null and coalesce((pol->>'layer')::int, 0) > 0 and coalesce((pol->>'enforce_shift_lock')::boolean, false) then
    v_start := (pol->>'operating_hours_start')::time;
    v_end := (pol->>'operating_hours_end')::time;
    outside := case when v_start <= v_end then (v_now < v_start or v_now > v_end) else (v_now < v_start and v_now > v_end) end;
    if outside then
      raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %, waktu setempat sekarang %)', v_start, v_end, to_char(v_now, 'HH24:MI');
    end if;
  end if;

  if tn.attendance_before_shift then
    select kind into lastk from attendance
     where profile_id = auth.uid() and (created_at at time zone tn.timezone)::date = (now() at time zone tn.timezone)::date
     order by created_at desc limit 1;
    if coalesce(lastk, 'out') <> 'in' then raise exception 'Absen masuk dulu sebelum membuka shift (kebijakan tenant)'; end if;
  end if;

  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash) values (t, p_branch, auth.uid(), p_opening) returning * into s;
  return s;
exception when unique_violation then
  raise exception 'Anda masih punya shift yang terbuka';
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2 · 2.3 Payroll: kasbon, lembur, denda, penguncian baris
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public._acc(p_tenant uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid;
  names jsonb := '{"1101":["Kas","asset"],"1102":["Bank, EDC & QRIS","asset"],"1104":["Piutang Karyawan (Kasbon)","asset"],"1301":["Persediaan Bahan Baku","asset"],
    "2101":["Utang Dagang","liability"],"2102":["Utang Pajak Penjualan","liability"],"2103":["Utang Gaji","liability"],
    "3101":["Modal Pemilik","equity"],"4101":["Pendapatan Penjualan","revenue"],"4102":["Potongan Penjualan (Diskon)","revenue"],
    "5101":["Harga Pokok Penjualan","cogs"],"6101":["Beban Gaji","expense"],"6102":["Beban Sewa","expense"],
    "6103":["Beban Listrik & Internet","expense"],"6104":["Beban Waste & Susut","expense"],"6105":["Beban Kas Kecil Outlet","expense"]}';
begin
  select id into a from accounts where tenant_id = p_tenant and code = p_code;
  if a is null then
    insert into accounts (tenant_id, code, name, type)
    values (p_tenant, p_code, names->p_code->>0, (names->p_code->>1)::account_type) returning id into a;
  end if;
  return a;
end $$;

create table if not exists public.staff_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  installments int not null check (installments between 1 and 24),
  monthly numeric(14,2) not null check (monthly > 0),
  remaining numeric(14,2) not null check (remaining >= 0),
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.staff_loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.staff_loans(id) on delete cascade,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (loan_id, run_id)
);
create index if not exists staff_loans_profile_idx on public.staff_loans(profile_id, status);
alter table public.staff_loans enable row level security;
alter table public.staff_loan_payments enable row level security;
-- Tulis HANYA lewat RPC. Baca: GM/Owner/Superadmin se-tenant, atau pemilik kasbon itu sendiri.
create policy loans_read on public.staff_loans for select using (
  tenant_ok(tenant_id) and has_perm(14, 'r') and (profile_id = auth.uid() or current_app_role()::text in ('superadmin', 'owner', 'gm')));
create policy loanpay_read on public.staff_loan_payments for select using (
  exists (select 1 from public.staff_loans l where l.id = loan_id and tenant_ok(l.tenant_id) and has_perm(14, 'r')
          and (l.profile_id = auth.uid() or current_app_role()::text in ('superadmin', 'owner', 'gm'))));

create or replace function public.grant_loan(p_profile uuid, p_amount numeric, p_installments int, p_note text default null) returns staff_loans
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); tgt profiles; ten tenants; outstanding numeric; cap numeric; l staff_loans;
begin
  perform _need(14, 'c');
  if t is null then raise exception 'Kasbon dicatat dari akun tenant'; end if;
  select * into tgt from profiles where id = p_profile and tenant_id = t and is_active;
  if not found or tgt.role not in ('gm', 'staff', 'dokter') then raise exception 'Karyawan tidak ditemukan'; end if;
  if tgt.id = auth.uid() then raise exception 'Anda tidak dapat mencatat kasbon untuk diri sendiri'; end if;
  if tgt.role = 'gm' and current_app_role() = 'gm' then raise exception 'Kasbon GM dicatat Owner/Superadmin'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal kasbon tidak valid'; end if;
  if p_installments is null or p_installments not between 1 and 24 then raise exception 'Cicilan 1–24 bulan'; end if;
  select * into ten from tenants where id = t;
  if coalesce(tgt.base_salary, 0) <= 0 then raise exception 'Gaji pokok % belum diisi, batas kasbon tidak dapat dihitung', tgt.full_name; end if;
  select coalesce(sum(remaining), 0) into outstanding from staff_loans where profile_id = tgt.id and status = 'active';
  cap := tgt.base_salary * ten.loan_max_multiple;
  if outstanding + p_amount > cap then
    raise exception 'Melebihi batas kasbon (% × gaji pokok = %). Sisa kasbon berjalan %', ten.loan_max_multiple, _rp(cap), _rp(outstanding);
  end if;
  insert into staff_loans (tenant_id, profile_id, amount, installments, monthly, remaining, note, created_by)
  values (t, tgt.id, p_amount, p_installments, ceil(p_amount / p_installments), p_amount, p_note, auth.uid()) returning * into l;
  perform _journal(t, tgt.branch_id, 'Kasbon ' || tgt.full_name, 'loan', l.id, jsonb_build_array(
    jsonb_build_object('code', '1104', 'dr', p_amount), jsonb_build_object('code', '1101', 'cr', p_amount)));
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'loan_granted', 'staff_loans', l.id::text, jsonb_build_object('profile', tgt.id, 'amount', p_amount, 'installments', p_installments));
  return l;
end $$;
grant execute on function public.grant_loan(uuid, numeric, int, text) to authenticated;

create or replace function public.cancel_loan(p_loan uuid) returns staff_loans
language plpgsql security definer set search_path = public as $$
declare l staff_loans;
begin
  perform _need(14, 'u');
  select * into l from staff_loans where id = p_loan for update;
  if not found or not tenant_ok(l.tenant_id) then raise exception 'Kasbon tidak ditemukan'; end if;
  if l.status <> 'active' then raise exception 'Kasbon sudah tidak aktif'; end if;
  if exists (select 1 from staff_loan_payments where loan_id = l.id) then raise exception 'Kasbon sudah mulai dipotong; tidak dapat dibatalkan'; end if;
  update staff_loans set status = 'cancelled' where id = l.id returning * into l;
  perform _journal(l.tenant_id, null, 'Pembatalan kasbon', 'loan', l.id, jsonb_build_array(
    jsonb_build_object('code', '1101', 'dr', l.amount), jsonb_build_object('code', '1104', 'cr', l.amount)));
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (l.tenant_id, auth.uid(), current_app_role(), 'loan_cancelled', 'staff_loans', l.id::text, '{}');
  return l;
end $$;
grant execute on function public.cancel_loan(uuid) to authenticated;

-- Baris payroll: hanya bisa berubah saat run berstatus draft/rejected; kasbon hanya diisi sistem.
create or replace function public.payroll_lines_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; sysm boolean := coalesce(current_setting('harumin.sys', true), '') = '1';
begin
  select status into st from payroll_runs where id = case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  if st not in ('draft', 'rejected') and not sysm then
    raise exception 'Payroll berstatus % tidak dapat diubah. Tolak dulu bila perlu direvisi.', coalesce(st, '?');
  end if;
  if tg_op = 'UPDATE' and new.kasbon <> old.kasbon and not sysm then
    raise exception 'Potongan kasbon dihitung otomatis dari data kasbon aktif';
  end if;
  if tg_op = 'INSERT' and new.kasbon <> 0 and not sysm then
    raise exception 'Potongan kasbon dihitung otomatis dari data kasbon aktif';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists payroll_lines_guard on public.payroll_lines;
create trigger payroll_lines_guard before insert or update or delete on public.payroll_lines for each row execute function public.payroll_lines_guard();

-- create_payroll_run v3 = komisi dokter (migrasi 8) + lembur & denda dari absensi + kasbon aktif
create or replace function public.create_payroll_run(p_period date) returns payroll_runs
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r payroll_runs; d0 date := date_trunc('month', p_period)::date; ten tenants; ts timestamptz; te timestamptz;
begin
  perform _need(14, 'c');
  if t is null then raise exception 'Payroll dibuat dari akun tenant'; end if;
  select * into ten from tenants where id = t;
  ts := (d0::timestamp) at time zone ten.timezone;
  te := ((d0 + interval '1 month')::timestamp) at time zone ten.timezone;
  insert into payroll_runs (tenant_id, period) values (t, d0) returning * into r;
  perform set_config('harumin.sys', '1', true);
  insert into payroll_lines (tenant_id, run_id, profile_id, base, commission, overtime, late_penalty, kasbon)
  select t, r.id, pf.id, pf.base_salary,
         round(pf.commission_rate * coalesce((select sum(i.qty * i.price) from orders o join order_items i on i.order_id = o.id
            join products pr on pr.id = i.product_id
            where o.practitioner_id = pf.id and o.status = 'paid' and pr.category in ('Tindakan', 'Konsultasi')
              and o.paid_at >= ts and o.paid_at < te), 0)),
         round(coalesce((select sum(a.overtime_min) from attendance a where a.profile_id = pf.id and a.created_at >= ts and a.created_at < te), 0) / 60.0 * ten.overtime_rate_per_hour),
         coalesce((select sum(a.late_min) from attendance a where a.profile_id = pf.id and a.created_at >= ts and a.created_at < te), 0) * ten.late_penalty_per_min,
         0
  from profiles pf where pf.tenant_id = t and pf.role in ('gm', 'staff', 'dokter') and pf.is_active;
  -- kasbon: cicilan bulanan tiap kasbon aktif, tidak boleh membuat gaji bersih negatif
  update payroll_lines pl set kasbon = least(
      coalesce((select sum(least(l.monthly, l.remaining)) from staff_loans l where l.profile_id = pl.profile_id and l.status = 'active'), 0),
      greatest(0, pl.base + pl.allowance + pl.overtime + pl.commission - pl.late_penalty))
  where pl.run_id = r.id;
  perform set_config('harumin.sys', '', true);
  return r;
exception when unique_violation then raise exception 'Payroll periode ini sudah ada';
end $$;

-- Efek pengesahan payroll: kasbon dipotong (tertua dulu) + jurnal beban kotor / utang gaji / piutang karyawan
create or replace function public._on_payroll_approved(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r payroll_runs; ln record; lo record; left_ numeric; take_ numeric; net_t numeric; kas_t numeric;
begin
  select * into r from payroll_runs where id = p_run;
  perform set_config('harumin.sys', '1', true);
  for ln in select profile_id, kasbon from payroll_lines where run_id = p_run and kasbon > 0 loop
    left_ := ln.kasbon;
    for lo in select id, remaining from staff_loans where profile_id = ln.profile_id and status = 'active' order by created_at for update loop
      exit when left_ <= 0;
      take_ := least(left_, lo.remaining);
      insert into staff_loan_payments (loan_id, run_id, amount) values (lo.id, p_run, take_) on conflict do nothing;
      update staff_loans set remaining = remaining - take_, status = case when remaining - take_ <= 0 then 'paid' else status end where id = lo.id;
      left_ := left_ - take_;
    end loop;
  end loop;
  perform set_config('harumin.sys', '', true);
  select coalesce(sum(net), 0), coalesce(sum(kasbon), 0) into net_t, kas_t from payroll_lines where run_id = p_run;
  perform _journal(r.tenant_id, null, 'Payroll ' || to_char(r.period, 'MM/YYYY'), 'payroll', p_run,
    jsonb_build_array(jsonb_build_object('code', '6101', 'dr', net_t + kas_t), jsonb_build_object('code', '2103', 'cr', net_t))
    || case when kas_t > 0 then jsonb_build_array(jsonb_build_object('code', '1104', 'cr', kas_t)) else '[]'::jsonb end);
end $$;
revoke execute on function public._on_payroll_approved(uuid) from public, anon, authenticated;

-- decide_approval v3 = v14 + payroll lewat _on_payroll_approved (jurnal lama memakai total bersih saja)
create or replace function public.decide_approval(
  p_id uuid, p_decision public.approval_status, p_note text default null, p_pin text default null, p_option text default null
) returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare a approvals; needs_pin boolean; my_hash text;
begin
  select tenant_id into a.tenant_id from approvals where id = p_id;
  if a.tenant_id is not null and tenant_ok(a.tenant_id) then perform _escalate_stale(a.tenant_id); end if;

  select * into a from approvals where id = p_id for update;
  if not found or not tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;
  if a.kind = 'void' and a.requested_by = auth.uid() then raise exception 'Anda tidak dapat memutuskan permintaan void yang Anda ajukan sendiri'; end if;
  if a.kind = 'void' and current_app_role() = 'gm' and (
       coalesce((a.detail->>'escalated_to_owner')::boolean, false)
       or a.requested_at < now() - make_interval(mins => (select void_escalate_minutes from tenants where id = a.tenant_id))) then
    raise exception 'Void ini dieskalasi ke Owner (melebihi kewenangan GM atau melewati batas waktu)';
  end if;

  select label like '%PIN%' into needs_pin from rbac_matrix where feature = a.feature and role = current_app_role();
  if needs_pin then
    select pin_hash into my_hash from profiles where id = auth.uid();
    if my_hash is null or p_pin is null or crypt(p_pin, my_hash) <> my_hash then raise exception 'PIN otorisasi salah'; end if;
  end if;

  if a.kind = 'void' and coalesce(btrim(p_note), '') = '' then raise exception 'Catatan alasan wajib diisi untuk void'; end if;
  if a.kind = 'void' and p_decision = 'approved' and coalesce(p_option, '') not in ('restock', 'waste') then
    raise exception 'Pilih: kembalikan bahan ke stok atau catat sebagai waste';
  end if;

  update approvals set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
         detail = detail || jsonb_build_object('option', p_option)
  where id = p_id returning * into a;

  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, p_option, p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid() where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end where id = (a.detail->>'run_id')::uuid;
    if p_decision = 'approved' then perform _on_payroll_approved((a.detail->>'run_id')::uuid); end if;
  elsif a.kind = 'supplies' then
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (a.tenant_id, auth.uid(), current_app_role(), 'supplies_approval', 'approvals', a.id::text,
            jsonb_build_object('decision', p_decision, 'amount', a.amount, 'note', p_note));
  end if;
  return a;
end $$;
grant execute on function public.decide_approval(uuid, public.approval_status, text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3 · 2.4 CRM: poin tidak bisa diubah manual
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.customers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare sysm boolean := coalesce(current_setting('harumin.sys', true), '') = '1';
begin
  if new.points <> old.points and not sysm then
    raise exception 'Poin hanya berubah lewat transaksi lunas (bertambah) atau penukaran resmi (berkurang)';
  end if;
  if (new.total_spent <> old.total_spent or new.visits <> old.visits) and not sysm then raise exception 'Total belanja & kunjungan diisi sistem'; end if;
  new.phone := old.phone;   -- nomor = kunci pelanggan
  return new;
end $$;

create or replace function public.redeem_points(p_customer uuid, p_points int, p_note text default null) returns customers
language plpgsql security definer set search_path = public as $$
declare c customers;
begin
  perform _need(15, 'u');
  select * into c from customers where id = p_customer for update;
  if not found or not tenant_ok(c.tenant_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  if p_points is null or p_points < 1 then raise exception 'Jumlah poin tidak valid'; end if;
  if p_points > c.points then raise exception 'Saldo poin hanya %', c.points; end if;
  perform set_config('harumin.sys', '1', true);
  update customers set points = points - p_points where id = c.id returning * into c;
  perform set_config('harumin.sys', '', true);
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (c.tenant_id, auth.uid(), current_app_role(), 'points_redeemed', 'customers', c.id::text,
          jsonb_build_object('points', p_points, 'balance_after', c.points, 'note', p_note));
  return c;
end $$;
grant execute on function public.redeem_points(uuid, int, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4 · 2.5 Kas kecil
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.petty_cash add column if not exists reject_reason text;

create or replace function public.petty_cash_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim numeric;
begin
  if auth.uid() is null then return new; end if;     -- jalur sistem (seed/service_role)
  if new.receipt_path is null or btrim(new.receipt_path) = '' then raise exception 'Foto nota wajib dilampirkan'; end if;
  select petty_limit into lim from tenants where id = new.tenant_id;
  if new.amount > lim then raise exception 'Melebihi batas kas kecil % per pengajuan. Gunakan Pembelian/PO.', _rp(lim); end if;
  new.status := 'submitted';                 -- status awal tidak bisa ditentukan pengaju
  new.created_by := auth.uid();
  return new;
end $$;
drop trigger if exists petty_cash_guard on public.petty_cash;
create trigger petty_cash_guard before insert on public.petty_cash for each row execute function public.petty_cash_guard();

drop function if exists public.validate_petty(uuid, boolean);
create or replace function public.validate_petty(p_id uuid, p_ok boolean, p_reason text default null) returns petty_cash
language plpgsql security definer set search_path = public as $$
declare p petty_cash;
begin
  perform _need(12, 'u');
  select * into p from petty_cash where id = p_id for update;
  if not found or not tenant_ok(p.tenant_id) or not branch_ok(p.branch_id) or p.status <> 'submitted' then raise exception 'Pengajuan tidak ditemukan'; end if;
  if p.created_by = auth.uid() then raise exception 'Anda tidak dapat memvalidasi pengajuan Anda sendiri'; end if;
  if not p_ok and coalesce(btrim(p_reason), '') = '' then raise exception 'Alasan penolakan wajib diisi'; end if;
  update petty_cash set status = case when p_ok then 'validated' else 'rejected' end, validated_by = auth.uid(), validated_at = now(),
         reject_reason = case when p_ok then null else p_reason end
  where id = p_id returning * into p;
  if p_ok then
    perform _journal(p.tenant_id, p.branch_id, 'Kas kecil: ' || p.description, 'petty', p.id, jsonb_build_array(
      jsonb_build_object('code', '6105', 'dr', p.amount), jsonb_build_object('code', '1101', 'cr', p.amount)));
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p.tenant_id, auth.uid(), current_app_role(), case when p_ok then 'petty_validated' else 'petty_rejected' end, 'petty_cash', p.id::text,
          jsonb_build_object('amount', p.amount, 'reason', p_reason));
  return p;
end $$;
grant execute on function public.validate_petty(uuid, boolean, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5 · 2.6 Capital: keputusan hanya oleh Superadmin (lender)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.capital_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := coalesce(current_app_role()::text, '');
begin
  if me = 'superadmin' or auth.uid() is null then return new; end if;   -- Superadmin & jalur sistem (seed/service_role)
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'submitted') then raise exception 'Status awal pengajuan harus draf atau diajukan'; end if;
    return new;
  end if;
  if new.status is distinct from old.status and not (old.status = 'draft' and new.status = 'submitted') then
    raise exception 'Status pengajuan diputuskan tim Harum.in (lender), bukan oleh tenant';
  end if;
  if old.status <> 'draft' and (new.amount, new.tenor_months, new.purpose) is distinct from (old.amount, old.tenor_months, old.purpose) then
    raise exception 'Pengajuan yang sudah dikirim tidak dapat diubah';
  end if;
  return new;
end $$;
drop trigger if exists capital_guard on public.capital_applications;
create trigger capital_guard before insert or update on public.capital_applications for each row execute function public.capital_guard();

create or replace function public.decide_capital(p_id uuid, p_status text, p_note text default null) returns capital_applications
language plpgsql security definer set search_path = public as $$
declare c capital_applications;
begin
  if current_app_role()::text <> 'superadmin' then raise exception 'Hanya tim Harum.in yang dapat memutuskan pengajuan modal'; end if;
  if p_status not in ('review', 'approved', 'rejected') then raise exception 'Status tidak valid'; end if;
  select * into c from capital_applications where id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if c.status = 'draft' then raise exception 'Pengajuan belum dikirim tenant'; end if;
  update capital_applications set status = p_status where id = p_id returning * into c;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (c.tenant_id, auth.uid(), 'superadmin', 'capital_' || p_status, 'capital_applications', c.id::text, jsonb_build_object('note', p_note, 'amount', c.amount));
  return c;
end $$;
grant execute on function public.decide_capital(uuid, text, text) to authenticated;
