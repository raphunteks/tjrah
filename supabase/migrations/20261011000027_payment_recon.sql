-- Tiket 10 · Rekonsiliasi pembayaran digital.
-- GM dan Superadmin mengimpor laporan penyedia, menjalankan pencocokan, dan memberi catatan pada selisih.
-- Owner hanya membaca. Staff tidak punya akses (walau punya hak petty cash di Fitur 12). Member ditolak oleh _need().
-- Rekonsiliasi TIDAK PERNAH menulis Jurnal. Selisih dibereskan lewat jurnal manual yang sah (post_manual_journal),
-- yang hanya boleh ditautkan ke baris rekonsiliasi (recon_link_journal).

create table if not exists public.recon_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (length(btrim(provider)) between 2 and 40),
  provider_ref text not null check (length(btrim(provider_ref)) between 1 and 100),
  gross numeric(14,2) not null check (gross >= 0),
  fee numeric(14,2) not null default 0 check (fee >= 0),
  settled_on date not null,
  imported_by uuid default auth.uid(),
  imported_at timestamptz not null default now(),
  unique (tenant_id, provider, provider_ref)
);

create table if not exists public.payment_recon (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  statement_id uuid references public.recon_statements(id) on delete cascade,
  status text not null check (status in ('matched', 'amount_diff', 'missing_statement', 'missing_payment', 'ambiguous')),
  expected numeric(14,2),
  received numeric(14,2),
  diff numeric(14,2) not null default 0,
  note text check (note is null or length(note) <= 500),
  noted_by uuid,
  noted_at timestamptz,
  journal_id uuid references public.journal_entries(id) on delete set null,
  run_at timestamptz not null default now(),
  check (payment_id is not null or statement_id is not null)
);
create unique index if not exists payment_recon_payment_uq on public.payment_recon (payment_id) where payment_id is not null;
create unique index if not exists payment_recon_statement_uq on public.payment_recon (statement_id) where statement_id is not null;

alter table public.recon_statements enable row level security;
alter table public.payment_recon enable row level security;
revoke all on public.recon_statements, public.payment_recon from anon;

create or replace function public._recon_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role()::text in ('superadmin', 'owner', 'gm') and public.has_perm(12, 'r')
$$;
drop policy if exists rs_read on public.recon_statements;
create policy rs_read on public.recon_statements for select using (public._recon_reader() and public.tenant_ok(tenant_id));
drop policy if exists pr_read on public.payment_recon;
create policy pr_read on public.payment_recon for select using (public._recon_reader() and public.tenant_ok(tenant_id) and (branch_id is null or public.branch_ok(branch_id)));
-- Tanpa kebijakan tulis: semua perubahan lewat fungsi di bawah.

create or replace function public._recon_writer() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.current_tenant_id();
begin
  perform _need(12, 'u');
  if public.current_app_role()::text not in ('superadmin', 'gm') then raise exception 'Hanya GM atau Superadmin yang boleh merekonsiliasi'; end if;
  if t is null then raise exception 'Pilih Tenant dulu'; end if;
  return t;
end $$;

create or replace function public._recon_audit(p_tenant uuid, p_action text, p_entity_id text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), public.current_app_role(), p_action, 'payment_recon', p_entity_id, p_detail)
$$;

-- Impor laporan penyedia. rows: [{"ref": "...", "gross": 44000, "fee": 300, "settled_on": "2026-10-14"}]. Impor ulang memperbarui baris yang sama.
create or replace function public.recon_import(p_provider text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := public._recon_writer(); r jsonb; n int := 0; ref text; g numeric; f numeric; d date;
begin
  if length(btrim(coalesce(p_provider, ''))) < 2 then raise exception 'Nama penyedia wajib'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Tidak ada baris untuk diimpor'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Maksimal 5000 baris per impor'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      ref := btrim(r->>'ref'); g := (r->>'gross')::numeric; f := coalesce((r->>'fee')::numeric, 0); d := (r->>'settled_on')::date;
    exception when others then raise exception 'Baris % tidak valid (ref, gross, fee, settled_on)', n + 1;
    end;
    if ref is null or ref = '' or g is null or g < 0 or f < 0 or d is null then raise exception 'Baris % tidak valid (ref, gross, fee, settled_on)', n + 1; end if;
    insert into recon_statements (tenant_id, provider, provider_ref, gross, fee, settled_on)
    values (t, btrim(p_provider), ref, g, f, d)
    on conflict (tenant_id, provider, provider_ref) do update set gross = excluded.gross, fee = excluded.fee, settled_on = excluded.settled_on, imported_by = auth.uid(), imported_at = now();
    n := n + 1;
  end loop;
  perform public._recon_audit(t, 'recon_import', btrim(p_provider), jsonb_build_object('rows', n));
  return jsonb_build_object('imported', n);
end $$;

-- Cocokkan Pembayaran nontunai (kartu, QRIS, e-wallet, transfer) pada rentang tanggal dengan laporan penyedia. Catatan yang sudah ada dipertahankan.
create or replace function public.recon_run(p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := public._recon_writer(); sm jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Rentang tanggal tidak valid'; end if;
  if p_to - p_from > 92 then raise exception 'Rentang maksimal 93 hari'; end if;

  -- 1) Setiap Pembayaran nontunai: satu baris hasil.
  with pay as (
    select p.id, p.amount, p.reference, o.branch_id,
           count(*) over (partition by p.reference) as same_ref
      from payments p join orders o on o.id = p.order_id
     where p.tenant_id = t and p.method <> 'cash' and o.status = 'paid'
       and p.created_at::date between p_from and p_to and public.branch_ok(o.branch_id)
  ), m as (
    select pay.*, s.id as sid, s.gross
      from pay left join recon_statements s on s.tenant_id = t and s.provider_ref = pay.reference and pay.same_ref = 1
  )
  insert into payment_recon (tenant_id, branch_id, payment_id, statement_id, status, expected, received, diff, run_at)
  select t, branch_id, id, sid,
         case when same_ref > 1 then 'ambiguous' when sid is null then 'missing_statement' when gross = amount then 'matched' else 'amount_diff' end,
         amount, gross, coalesce(gross, 0) - amount, now()
    from m
  on conflict (payment_id) where payment_id is not null do update
    set statement_id = excluded.statement_id, status = excluded.status, expected = excluded.expected, received = excluded.received, diff = excluded.diff, run_at = now();

  -- 2) Baris laporan penyedia tanpa Pembayaran yang cocok.
  insert into payment_recon (tenant_id, branch_id, payment_id, statement_id, status, expected, received, diff, run_at)
  select t, null, null, s.id, 'missing_payment', null, s.gross, s.gross, now()
    from recon_statements s
   where s.tenant_id = t and s.settled_on between p_from and p_to
     and not exists (select 1 from payment_recon x where x.statement_id = s.id)
     and not exists (select 1 from payments p where p.tenant_id = t and p.method <> 'cash' and p.reference = s.provider_ref)
  on conflict (statement_id) where statement_id is not null do nothing;

  select jsonb_build_object(
    'matched', count(*) filter (where status = 'matched'), 'amount_diff', count(*) filter (where status = 'amount_diff'),
    'missing_statement', count(*) filter (where status = 'missing_statement'), 'missing_payment', count(*) filter (where status = 'missing_payment'),
    'ambiguous', count(*) filter (where status = 'ambiguous'),
    'expected', coalesce(sum(expected), 0), 'received', coalesce(sum(received), 0), 'diff', coalesce(sum(diff) filter (where status <> 'matched'), 0))
  into sm
  from payment_recon x
  where x.tenant_id = t
    and ((x.payment_id is not null and exists (select 1 from payments p where p.id = x.payment_id and p.created_at::date between p_from and p_to))
      or (x.payment_id is null and exists (select 1 from recon_statements s where s.id = x.statement_id and s.settled_on between p_from and p_to)));
  perform public._recon_audit(t, 'recon_run', p_from::text || '..' || p_to::text, sm);
  return sm;
end $$;

-- Hasil untuk layar GM/Owner.
create or replace function public.recon_report(p_from date, p_to date, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.current_tenant_id();
begin
  perform _need(12, 'r');
  if not public._recon_reader() then raise exception 'Akses ditolak: rekonsiliasi hanya untuk Owner, GM, dan Superadmin'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'Rentang tanggal tidak valid'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'expected', x.expected, 'received', x.received, 'diff', x.diff, 'note', x.note,
        'noted_at', x.noted_at, 'journal_id', x.journal_id, 'method', p.method, 'reference', coalesce(p.reference, s.provider_ref), 'provider', s.provider,
        'fee', s.fee, 'settled_on', s.settled_on, 'paid_at', o.paid_at, 'order_code', o.code, 'branch', b.name) order by x.status, o.paid_at nulls last)
      from payment_recon x
      left join payments p on p.id = x.payment_id left join orders o on o.id = p.order_id
      left join recon_statements s on s.id = x.statement_id left join branches b on b.id = x.branch_id
     where x.tenant_id = t and tenant_ok(x.tenant_id) and (x.branch_id is null or branch_ok(x.branch_id))
       and (p_status is null or x.status = p_status)
       and ((p.id is not null and p.created_at::date between p_from and p_to) or (p.id is null and s.settled_on between p_from and p_to))
  ), '[]'::jsonb);
end $$;

create or replace function public.recon_note(p_id uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := public._recon_writer(); x payment_recon;
begin
  if length(coalesce(p_note, '')) > 500 then raise exception 'Catatan maksimal 500 karakter'; end if;
  update payment_recon set note = nullif(btrim(coalesce(p_note, '')), ''), noted_by = auth.uid(), noted_at = now()
   where id = p_id and tenant_id = t and (branch_id is null or branch_ok(branch_id)) returning * into x;
  if not found then raise exception 'Baris rekonsiliasi tidak ditemukan'; end if;
  perform public._recon_audit(t, 'recon_note', x.id::text, jsonb_build_object('status', x.status, 'diff', x.diff, 'note', x.note));
  return jsonb_build_object('id', x.id, 'note', x.note, 'noted_at', x.noted_at);
end $$;

-- Tautkan jurnal manual yang sudah diposting (bukan jurnal otomatis POS) sebagai bukti penyelesaian selisih. Tidak membuat Jurnal apa pun.
create or replace function public.recon_link_journal(p_id uuid, p_journal uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := public._recon_writer(); j journal_entries; x payment_recon;
begin
  select * into j from journal_entries where id = p_journal and tenant_id = t;
  if not found then raise exception 'Jurnal tidak ditemukan'; end if;
  if j.source not in ('manual', 'investment', 'financing', 'expense') then raise exception 'Hanya jurnal manual yang boleh ditautkan, bukan jurnal otomatis'; end if;
  update payment_recon set journal_id = j.id, noted_by = auth.uid(), noted_at = now()
   where id = p_id and tenant_id = t and (branch_id is null or branch_ok(branch_id)) returning * into x;
  if not found then raise exception 'Baris rekonsiliasi tidak ditemukan'; end if;
  perform public._recon_audit(t, 'recon_link_journal', x.id::text, jsonb_build_object('journal', j.id, 'source', j.source));
  return jsonb_build_object('id', x.id, 'journal_id', x.journal_id);
end $$;

revoke all on function public._recon_reader(), public._recon_writer(), public._recon_audit(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public._recon_reader() to authenticated;   -- dipakai kebijakan RLS
revoke all on function public.recon_import(text, jsonb), public.recon_run(date, date), public.recon_report(date, date, text),
  public.recon_note(uuid, text), public.recon_link_journal(uuid, uuid) from public, anon;
grant execute on function public.recon_import(text, jsonb), public.recon_run(date, date), public.recon_report(date, date, text),
  public.recon_note(uuid, text), public.recon_link_journal(uuid, uuid) to authenticated;

select public.member_lockdown();
