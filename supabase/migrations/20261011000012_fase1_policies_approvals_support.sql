-- Harum.in · FASE 1 (1.4, 1.5, 1.6) — Policy Builder 3 Lapis, Pusat Persetujuan Terpadu, Akses Dukungan Bersyarat
-- Memperkuat keamanan, fleksibilitas operasional per cabang, persetujuan lintas fungsi, dan break-glass support.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1.4 · POLICY BUILDER 3 LAPIS (Kebijakan Berjenjang)
--   Lapis 1: Default Tenant (toko)
--   Lapis 2: Per Cabang (jam buka-tutup, radius presensi GPS)
--   Lapis 3: Per Peran / Kasir (batas diskon mandiri, batas void tanpa PIN GM)
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.tenant_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null = default tenant
  role public.app_role, -- null = default semua peran
  max_discount_pct numeric(5,2) not null default 15.00 check (max_discount_pct between 0 and 100),
  max_void_without_pin numeric(14,2) not null default 50000.00 check (max_void_without_pin >= 0),
  operating_hours_start time not null default '07:00:00',
  operating_hours_end time not null default '23:00:00',
  geofence_radius_meters int not null default 50 check (geofence_radius_meters between 10 and 1000),
  enforce_shift_lock boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create unique index if not exists tenant_policies_layer_idx on public.tenant_policies (
  tenant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(role, 'superadmin'::public.app_role)
);

alter table public.tenant_policies enable row level security;

create policy tpolicies_read on public.tenant_policies for select using (
  public.tenant_ok(tenant_id) or public.is_superadmin()
);

create policy tpolicies_write on public.tenant_policies for all using (
  (public.tenant_ok(tenant_id) and public.current_app_role() in ('owner', 'gm')) or public.is_superadmin()
);

-- RPC Resolusi Kebijakan 3 Lapis:
-- Prioritas:
-- 1. Lapis 3: Kebijakan Cabang + Peran spesifik
-- 2. Lapis 2: Kebijakan Cabang (tanpa peran) atau Lapis Role Tenant
-- 3. Lapis 1: Kebijakan Tenant Utama
create or replace function public.get_effective_policy(
  p_tenant uuid default null,
  p_branch uuid default null,
  p_role public.app_role default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t uuid := coalesce(p_tenant, public.current_tenant_id());
  b uuid := coalesce(p_branch, public.current_branch_id());
  r public.app_role := coalesce(p_role, public.current_app_role());
  pol record;
  def_start time := '07:00:00';
  def_end time := '23:00:00';
begin
  if t is null then return null; end if;

  -- 1. Lapis 3: Cabang + Peran
  if b is not null and r is not null then
    select * into pol from tenant_policies where tenant_id = t and branch_id = b and role = r limit 1;
    if pol.id is not null then
      return jsonb_build_object(
        'layer', 3, 'layer_name', 'Cabang & Peran',
        'max_discount_pct', pol.max_discount_pct,
        'max_void_without_pin', pol.max_void_without_pin,
        'operating_hours_start', pol.operating_hours_start,
        'operating_hours_end', pol.operating_hours_end,
        'geofence_radius_meters', pol.geofence_radius_meters,
        'enforce_shift_lock', pol.enforce_shift_lock,
        'policy_id', pol.id
      );
    end if;
  end if;

  -- 2. Lapis 2a: Cabang spesifik
  if b is not null then
    select * into pol from tenant_policies where tenant_id = t and branch_id = b and role is null limit 1;
    if pol.id is not null then
      return jsonb_build_object(
        'layer', 2, 'layer_name', 'Cabang',
        'max_discount_pct', pol.max_discount_pct,
        'max_void_without_pin', pol.max_void_without_pin,
        'operating_hours_start', pol.operating_hours_start,
        'operating_hours_end', pol.operating_hours_end,
        'geofence_radius_meters', pol.geofence_radius_meters,
        'enforce_shift_lock', pol.enforce_shift_lock,
        'policy_id', pol.id
      );
    end if;
  end if;

  -- 2. Lapis 2b: Peran spesifik (tingkat Tenant)
  if r is not null then
    select * into pol from tenant_policies where tenant_id = t and branch_id is null and role = r limit 1;
    if pol.id is not null then
      return jsonb_build_object(
        'layer', 2, 'layer_name', 'Peran (Tenant)',
        'max_discount_pct', pol.max_discount_pct,
        'max_void_without_pin', pol.max_void_without_pin,
        'operating_hours_start', pol.operating_hours_start,
        'operating_hours_end', pol.operating_hours_end,
        'geofence_radius_meters', pol.geofence_radius_meters,
        'enforce_shift_lock', pol.enforce_shift_lock,
        'policy_id', pol.id
      );
    end if;
  end if;

  -- 3. Lapis 1: Default Tenant
  select * into pol from tenant_policies where tenant_id = t and branch_id is null and role is null limit 1;
  if pol.id is not null then
    return jsonb_build_object(
      'layer', 1, 'layer_name', 'Default Tenant',
      'max_discount_pct', pol.max_discount_pct,
      'max_void_without_pin', pol.max_void_without_pin,
      'operating_hours_start', pol.operating_hours_start,
      'operating_hours_end', pol.operating_hours_end,
      'geofence_radius_meters', pol.geofence_radius_meters,
      'enforce_shift_lock', pol.enforce_shift_lock,
      'policy_id', pol.id
    );
  end if;

  -- Fallback Bawaan Sistem bila belum pernah dikonfigurasi
  return jsonb_build_object(
    'layer', 0, 'layer_name', 'Bawaan Sistem',
    'max_discount_pct', 15.00,
    'max_void_without_pin', 50000.00,
    'operating_hours_start', def_start,
    'operating_hours_end', def_end,
    'geofence_radius_meters', 50,
    'enforce_shift_lock', true,
    'policy_id', null
  );
end $$;

-- Simpan / Ubah Kebijakan Berjenjang
create or replace function public.save_tenant_policy(
  p_tenant uuid default null,
  p_branch uuid default null,
  p_role public.app_role default null,
  p_discount numeric default 15.00,
  p_void numeric default 50000.00,
  p_start time default '07:00:00',
  p_end time default '23:00:00',
  p_radius int default 50,
  p_lock boolean default true
) returns public.tenant_policies
language plpgsql security definer set search_path = public as $$
declare
  t uuid := coalesce(p_tenant, public.current_tenant_id());
  me public.app_role := public.current_app_role();
  res public.tenant_policies;
begin
  if me is null then raise exception 'Akses ditolak'; end if;
  if me = 'superadmin' then
    perform _need(1, 'u');
  elsif me = 'owner' then
    perform _need(13, 'u');
  elsif me = 'gm' then
    perform _need(13, 'u');
    if p_branch is null or not public.branch_ok(p_branch) then
      raise exception 'GM hanya dapat mengatur kebijakan cabang yang ditugaskan';
    end if;
  else
    raise exception 'Hanya Owner atau GM yang dapat mengubah kebijakan';
  end if;

  if t is null or not public.tenant_ok(t) then raise exception 'Tenant tidak valid'; end if;

  insert into public.tenant_policies (
    tenant_id, branch_id, role,
    max_discount_pct, max_void_without_pin,
    operating_hours_start, operating_hours_end,
    geofence_radius_meters, enforce_shift_lock,
    updated_at, updated_by
  ) values (
    t, p_branch, p_role,
    p_discount, p_void,
    p_start, p_end,
    p_radius, p_lock,
    now(), auth.uid()
  )
  on conflict (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(role, 'superadmin'::public.app_role))
  do update set
    max_discount_pct = excluded.max_discount_pct,
    max_void_without_pin = excluded.max_void_without_pin,
    operating_hours_start = excluded.operating_hours_start,
    operating_hours_end = excluded.operating_hours_end,
    geofence_radius_meters = excluded.geofence_radius_meters,
    enforce_shift_lock = excluded.enforce_shift_lock,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into res;

  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), me, 'update_policy', 'tenant_policies', res.id::text,
          jsonb_build_object('branch_id', p_branch, 'role', p_role, 'discount', p_discount, 'void_limit', p_void));

  return res;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 1.5 · PUSAT PERSETUJUAN TERPADU (Unified Approvals Hub)
--   Mendukung 5 Alur Bisnis:
--     1. Void Nota (F6 · Approval PIN GM/Owner)
--     2. Purchase Order Supplier (F9 · Approval Owner)
--     3. Transfer Stok / STO (F10 · Approval GM/Owner)
--     4. Payroll Run (F14 · Approval Owner)
--     5. Supplies Pengadaan Bahan (F20 · Approval Owner)
-- ══════════════════════════════════════════════════════════════════════════════

-- Rekap / Dashboard Pusat Persetujuan Terpadu
create or replace function public.approval_summary(p_tenant uuid default null)
returns table (
  total_pending int,
  pending_void int,
  pending_po int,
  pending_sto int,
  pending_payroll int,
  pending_supplies int,
  total_amount_pending numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  t uuid := coalesce(p_tenant, public.current_tenant_id());
begin
  if not (public.is_superadmin() or (t is not null and public.tenant_ok(t))) then
    raise exception 'Akses ditolak';
  end if;

  return query
  select
    count(*)::int as total_pending,
    count(*) filter (where a.kind = 'void')::int as pending_void,
    count(*) filter (where a.kind = 'po')::int as pending_po,
    count(*) filter (where a.kind = 'sto')::int as pending_sto,
    count(*) filter (where a.kind = 'payroll')::int as pending_payroll,
    count(*) filter (where a.kind = 'supplies')::int as pending_supplies,
    coalesce(sum(a.amount) filter (where a.amount is not null), 0)::numeric as total_amount_pending
  from public.approvals a
  where (t is null or a.tenant_id = t) and a.status = 'pending';
end $$;

-- Update decide_approval agar juga menangani F20 (supplies) secara elegan
create or replace function public.decide_approval(
  p_id uuid,
  p_decision public.approval_status,
  p_note text default null,
  p_pin text default null,
  p_option text default null
) returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare
  a approvals;
  needs_pin boolean;
  my_hash text;
begin
  select * into a from approvals where id = p_id for update;
  if not found or not tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;

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

  -- Efek keputusan berdasarkan alur bisnis:
  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, p_option, p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end
    where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid()
    where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end
    where id = (a.detail->>'run_id')::uuid;
    if p_decision = 'approved' then
      perform _journal(a.tenant_id, null, 'Payroll ' || a.ref, 'payroll', (a.detail->>'run_id')::uuid, jsonb_build_array(
        jsonb_build_object('code', '6101', 'dr', a.amount), jsonb_build_object('code', '2103', 'cr', a.amount)));
    end if;
  elsif a.kind = 'supplies' then
    -- Fitur 20: Persetujuan pengadaan bahan supplies dari distributor pusat
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (a.tenant_id, auth.uid(), current_app_role(), 'supplies_approval', 'approvals', a.id::text,
            jsonb_build_object('decision', p_decision, 'amount', a.amount, 'note', p_note));
  end if;

  return a;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 1.6 · AKSES DUKUNGAN BERSYARAT (Break-Glass Support Access)
--   Superadmin meminta akses investigasi berbatas waktu (misal 2 jam).
--   Owner menyetujui langsung dari dashboard.
--   Akses otomatis kedaluwarsa, seluruh aktivitas tercatat di audit log.
--   Data klinis/rekam medis (F17) TETAP diproteksi/disamarkan (masking PII).
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  duration_hours int not null default 2 check (duration_hours between 1 and 24),
  status text not null default 'requested' check (status in ('requested', 'active', 'expired', 'revoked', 'rejected')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists support_sessions_tenant_idx on public.support_sessions (tenant_id, status);

alter table public.support_sessions enable row level security;

create policy ssessions_read on public.support_sessions for select using (
  public.is_superadmin() or (public.current_app_role() = 'owner' and tenant_id = public.current_tenant_id())
);

-- Superadmin meminta sesi dukungan break-glass
create or replace function public.request_support_session(
  p_tenant uuid,
  p_reason text,
  p_ticket_id uuid default null,
  p_hours int default 2
) returns public.support_sessions
language plpgsql security definer set search_path = public as $$
declare
  sess public.support_sessions;
begin
  if not public.is_superadmin() then raise exception 'Hanya Superadmin yang dapat meminta akses dukungan break-glass'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Alasan bantuan teknis wajib diisi (minimal 5 karakter)'; end if;
  if not exists (select 1 from tenants where id = p_tenant) then raise exception 'Tenant tidak ditemukan'; end if;

  insert into public.support_sessions (tenant_id, ticket_id, requested_by, reason, duration_hours, status)
  values (p_tenant, p_ticket_id, auth.uid(), btrim(p_reason), greatest(1, least(p_hours, 12)), 'requested')
  returning * into sess;

  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), 'superadmin', 'break_glass_requested', 'support_sessions', sess.id::text,
          jsonb_build_object('ticket_id', p_ticket_id, 'reason', p_reason, 'duration_hours', sess.duration_hours));

  return sess;
end $$;

-- Owner menyetujui / menolak sesi dukungan
create or replace function public.grant_support_session(
  p_session uuid,
  p_grant boolean
) returns public.support_sessions
language plpgsql security definer set search_path = public as $$
declare
  sess public.support_sessions;
begin
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat memberikan izin akses dukungan'; end if;
  select * into sess from support_sessions where id = p_session and tenant_id = public.current_tenant_id() for update;
  if not found then raise exception 'Permintaan sesi dukungan tidak ditemukan'; end if;
  if sess.status <> 'requested' then raise exception 'Sesi ini sudah diproses (% )', sess.status; end if;

  if p_grant then
    update support_sessions set
      status = 'active',
      approved_by = auth.uid(),
      expires_at = now() + (sess.duration_hours || ' hours')::interval
    where id = p_session returning * into sess;

    insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (sess.tenant_id, auth.uid(), 'owner', 'break_glass_granted', 'support_sessions', sess.id::text,
            jsonb_build_object('expires_at', sess.expires_at, 'duration_hours', sess.duration_hours));
  else
    update support_sessions set
      status = 'rejected',
      approved_by = auth.uid(),
      closed_at = now()
    where id = p_session returning * into sess;

    insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (sess.tenant_id, auth.uid(), 'owner', 'break_glass_rejected', 'support_sessions', sess.id::text, '{}'::jsonb);
  end if;

  return sess;
end $$;

-- Cabut sesi dukungan aktif lebih awal (bisa oleh Owner atau Superadmin)
create or replace function public.revoke_support_session(p_session uuid)
returns public.support_sessions
language plpgsql security definer set search_path = public as $$
declare
  sess public.support_sessions;
begin
  select * into sess from support_sessions where id = p_session for update;
  if not found or not (public.is_superadmin() or (public.current_app_role() = 'owner' and sess.tenant_id = public.current_tenant_id())) then
    raise exception 'Sesi dukungan tidak ditemukan';
  end if;

  update support_sessions set status = 'revoked', closed_at = now() where id = p_session returning * into sess;

  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (sess.tenant_id, auth.uid(), public.current_app_role(), 'break_glass_revoked', 'support_sessions', sess.id::text, '{}'::jsonb);

  return sess;
end $$;

-- Status Sesi Dukungan Aktif (untuk bilah atas / indikator live di UI)
create or replace function public.get_active_support_session(p_tenant uuid default null)
returns public.support_sessions
language plpgsql stable security definer set search_path = public as $$
declare
  t uuid := coalesce(p_tenant, public.current_tenant_id());
  sess public.support_sessions;
begin
  select * into sess from support_sessions
  where (t is null or tenant_id = t) and status = 'active' and expires_at > now()
  order by expires_at desc limit 1;
  return sess;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS KE AUTHENTICATED
-- ══════════════════════════════════════════════════════════════════════════════
grant execute on function public.get_effective_policy to authenticated;
grant execute on function public.save_tenant_policy to authenticated;
grant execute on function public.approval_summary to authenticated;
grant execute on function public.decide_approval to authenticated;
grant execute on function public.request_support_session to authenticated;
grant execute on function public.grant_support_session to authenticated;
grant execute on function public.revoke_support_session to authenticated;
grant execute on function public.get_active_support_session to authenticated;

-- Masukkan tabel ke publikasi Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tenant_policies, public.support_sessions;
  end if;
end $$;
