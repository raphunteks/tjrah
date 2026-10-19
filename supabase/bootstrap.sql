-- Harum.in — BOOTSTRAP proyek Supabase BARU (di-generate oleh scripts/gen-bootstrap.mjs; jangan diedit manual).
--
-- CARA PAKAI
--   1. Buat proyek Supabase BARU khusus Harum.in (jangan proyek yang dipakai aplikasi lain).
--   2. Ganti 'GANTI-PASSWORD-DEMO' di bawah ini dengan kata sandi demo Anda (min. 8 karakter). Hanya itu yang perlu diubah.
--   3. Tempel SELURUH berkas di Dashboard → SQL Editor → Run.  (Mac: pbcopy < supabase/bootstrap.sql)
--   4. Samakan DEMO_PASSWORD di .env.local dengan kata sandi tadi, dan isi URL/anon/service_role proyek baru.
--
-- KEAMANAN: berhenti otomatis bila schema public sudah berisi tabel apa pun. Seluruhnya satu transaksi.
begin;

-- ▼▼▼ SATU-SATUNYA YANG PERLU DIUBAH ▼▼▼
create temp table _demo_cfg on commit drop as select 'GANTI-PASSWORD-DEMO'::text as pw;
-- ▲▲▲ ─────────────────────────────── ▲▲▲

do $$
declare n int; names text;
begin
  if (select pw from _demo_cfg) = 'GANTI-PASSWORD-DEMO' or length((select pw from _demo_cfg)) < 8 then
    raise exception 'Ganti ''GANTI-PASSWORD-DEMO'' di bagian atas berkas dengan kata sandi demo Anda (min. 8 karakter), lalu jalankan ulang.';
  end if;
  select count(*), string_agg(table_name, ', ' order by table_name) into n, names
  from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
  if n > 0 then
    raise exception 'DIBATALKAN: schema public sudah berisi % tabel (%). Ini proyek yang dipakai aplikasi lain. Jalankan berkas ini hanya di proyek Supabase BARU.', n, left(names, 160);
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000001_schema.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · Skema inti multi-tenant (FASE 1)
-- Isolasi tenant: Row-Level Security dengan tenant_id di setiap tabel bisnis.

create extension if not exists pgcrypto;

-- ───────── Enum ─────────
create type public.app_role as enum ('superadmin', 'owner', 'gm', 'staff', 'dokter');
create type public.pillar as enum ('fnb', 'retail', 'service', 'health', 'mfg', 'omni');
create type public.tenant_status as enum ('trial', 'active', 'past_due', 'suspended');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.order_status as enum ('open', 'paid', 'void', 'refunded');
create type public.pay_method as enum ('cash', 'card', 'qris', 'ewallet', 'transfer');
create type public.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'cogs', 'expense');

-- ───────── Platform (dikelola Superadmin) ─────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  price_month numeric(14,2),            -- null = harga belum ditetapkan
  max_branches int not null default 1,
  modules text[] not null default '{}', -- kode modul M1..M12
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  pillar public.pillar not null default 'fnb',
  status public.tenant_status not null default 'trial',
  plan_id uuid references public.plans(id),
  current_period_end date,
  owner_email text,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period date not null,
  amount numeric(14,2) not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
  created_at timestamptz not null default now()
);

-- Nilai rahasia (API key 9router, token Hermes) TIDAK disimpan di sini.
-- Rahasia ada di Supabase Edge Function secrets; tabel ini hanya menyimpan konfigurasi non-rahasia.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  city text,
  address text,
  lat double precision,
  lng double precision,
  geofence_m int not null default 50,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade, -- null untuk superadmin
  branch_id uuid references public.branches(id) on delete set null,
  role public.app_role not null,
  full_name text not null,
  email text,
  pin_hash text,  -- PIN otorisasi (bcrypt via pgcrypto), hanya GM
  created_at timestamptz not null default now(),
  constraint superadmin_no_tenant check ((role = 'superadmin') = (tenant_id is null))
);

create table public.tenant_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  hermes_enabled boolean not null default false,
  whatsapp_owner text,
  whatsapp_gm text,
  discord_alert_channel text default '#alert-sistem',
  discord_report_channel text default '#laporan-harian',
  ai_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────── Matriks RBAC (diisi dari src/lib/rbac-matrix.js) ─────────
create table public.rbac_matrix (
  feature smallint not null,
  feature_name text not null,
  role public.app_role not null,
  label text not null,
  can_create boolean not null default false,
  can_read boolean not null default false,
  can_update boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  can_request boolean not null default false,
  scope text,
  primary key (feature, role)
);

-- ───────── Operasional (ditulis POS di FASE 2, dibaca dashboard sekarang) ─────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  status public.order_status not null default 'open',
  channel text not null default 'dine_in',
  table_label text,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  cogs numeric(14,2) not null default 0,   -- HPP dari BOM saat penjualan
  cashier_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (tenant_id, code)
);
create index on public.orders (tenant_id, branch_id, paid_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.pay_method not null,
  amount numeric(14,2) not null,
  reference text,   -- nomor approval / trace; JANGAN simpan nomor kartu penuh
  created_at timestamptz not null default now()
);

-- ───────── Akuntansi (PSAK) ─────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type public.account_type not null,
  unique (tenant_id, code)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id),
  entry_date date not null,
  memo text,
  source text,      -- 'pos', 'purchase', 'expense', 'manual'
  source_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.journal_entries (tenant_id, entry_date);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0))
);

-- ───────── Persetujuan lintas modul ─────────
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id),
  feature smallint not null,          -- nomor fitur matriks (6, 9, 10, 14, 20, ...)
  kind text not null,                 -- 'void', 'po', 'sto', 'payroll', 'supplies'
  ref text not null,
  title text not null,
  amount numeric(14,2),
  detail jsonb not null default '{}',
  status public.approval_status not null default 'pending',
  requested_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text
);
create index on public.approvals (tenant_id, status);

-- ───────── Capital & payout ─────────
create table public.capital_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  tenor_months int not null check (tenor_months between 1 and 36),
  purpose text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'review', 'approved', 'rejected')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.payout_accounts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  bank text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'), -- hanya 4 digit akhir
  verified boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────── Hermes Agent & audit ─────────
create table public.hermes_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'discord')),
  target text not null,
  kind text not null,   -- 'z_report', 'low_stock', 'void_alert', 'margin_drop', 'inquiry'
  message text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'simulated')),
  created_at timestamptz not null default now()
);
create index on public.hermes_events (tenant_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_id uuid,
  actor_role public.app_role,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (tenant_id, created_at desc);

-- ───────── Blueprint privat (hanya Superadmin) ─────────
create table public.blueprint_docs (
  id text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now()
);

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000002_rbac_rls.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · Fungsi RBAC + Row-Level Security
-- Setiap policy memanggil has_perm(fitur, aksi) yang membaca tabel rbac_matrix (versi ASLI dokumen).

-- ───────── Helper identitas (security definer → aman dari rekursi RLS profiles) ─────────
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid()), false)
$$;

-- has_perm(7, 'r') → apakah role pengguna saat ini punya aksi tsb pada fitur 7.
create or replace function public.has_perm(p_feature int, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p_action
      when 'c' then can_create when 'r' then can_read when 'u' then can_update
      when 'd' then can_delete when 'a' then can_approve when 'q' then can_request
      else false end
    from public.rbac_matrix
    where feature = p_feature and role = public.current_app_role()
  ), false)
$$;

create or replace function public.perm_scope(p_feature int) returns text
language sql stable security definer set search_path = public as $$
  select scope from public.rbac_matrix where feature = p_feature and role = public.current_app_role()
$$;

-- Superadmin melihat lintas tenant; role lain hanya tenant-nya.
create or replace function public.tenant_ok(p_tenant uuid) returns boolean
language sql stable as $$
  select public.is_superadmin() or p_tenant = public.current_tenant_id()
$$;

-- Staff & Dokter terbatas pada cabangnya; Owner/GM/Superadmin seluruh cabang.
create or replace function public.branch_ok(p_branch uuid) returns boolean
language sql stable as $$
  select public.current_app_role() in ('superadmin', 'owner', 'gm')
      or p_branch is null or p_branch = public.current_branch_id()
$$;

-- ───────── Aktifkan RLS ─────────
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.invoices enable row level security;
alter table public.platform_settings enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_integrations enable row level security;
alter table public.rbac_matrix enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.approvals enable row level security;
alter table public.capital_applications enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.hermes_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.blueprint_docs enable row level security;

-- ───────── Fitur 1 · Konfigurasi Tenant, 9router & Hermes ─────────
-- plans: paket aktif terbaca publik (landing page); tulis hanya pemilik CRUD fitur 1.
create policy plans_read on public.plans for select using (is_active or public.has_perm(1, 'r'));
create policy plans_write on public.plans for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy tenants_read on public.tenants for select using (public.tenant_ok(id));
create policy tenants_insert on public.tenants for insert with check (public.is_superadmin() and public.has_perm(1, 'c'));
create policy tenants_update on public.tenants for update using (public.is_superadmin() and public.has_perm(1, 'u'));
create policy tenants_delete on public.tenants for delete using (public.is_superadmin() and public.has_perm(1, 'd'));

create policy invoices_read on public.invoices for select using (public.tenant_ok(tenant_id) and public.has_perm(1, 'r'));
create policy invoices_write on public.invoices for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy settings_all on public.platform_settings for all
  using (public.is_superadmin() and public.has_perm(1, 'r'))
  with check (public.is_superadmin() and public.has_perm(1, 'u'));

create policy integrations_read on public.tenant_integrations for select using (public.tenant_ok(tenant_id) and public.has_perm(1, 'r'));
create policy integrations_write on public.tenant_integrations for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

create policy branches_read on public.branches for select using (public.tenant_ok(tenant_id));
create policy branches_write on public.branches for all
  using (public.is_superadmin() and public.has_perm(1, 'u'))
  with check (public.is_superadmin() and public.has_perm(1, 'c'));

-- ───────── Fitur 13 · Master Karyawan (profiles) ─────────
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or (public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null));
create policy profiles_insert on public.profiles for insert
  with check (public.tenant_ok(tenant_id) and public.has_perm(13, 'c'));
create policy profiles_update on public.profiles for update
  using (public.tenant_ok(tenant_id) and public.has_perm(13, 'u'));
create policy profiles_delete on public.profiles for delete
  using (public.tenant_ok(tenant_id) and public.has_perm(13, 'd') and id <> auth.uid());

-- Cegah eskalasi peran: hanya Superadmin yang boleh membuat superadmin/owner,
-- dan tidak ada yang boleh mengubah perannya sendiri.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role();
begin
  if auth.uid() is null then return new; end if; -- service role / seed
  if tg_op = 'UPDATE' and new.id = auth.uid() and new.role <> old.role then
    raise exception 'Tidak boleh mengubah peran sendiri';
  end if;
  if me <> 'superadmin' and new.role in ('superadmin', 'owner') then
    raise exception 'Hanya Superadmin yang dapat menetapkan peran %', new.role;
  end if;
  if me = 'gm' and new.role = 'gm' and (tg_op = 'INSERT' or old.role <> 'gm') then
    raise exception 'GM tidak dapat mengangkat GM lain';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- ───────── Matriks: terbaca semua pengguna login, tidak bisa diubah dari klien ─────────
create policy rbac_read on public.rbac_matrix for select to authenticated using (true);

-- ───────── Fitur 5 · Register Transaksi POS ─────────
create policy orders_read on public.orders for select
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'r'));
create policy orders_insert on public.orders for insert
  with check (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'c'));
create policy orders_update on public.orders for update
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'u'));
create policy orders_delete on public.orders for delete
  using (public.tenant_ok(tenant_id) and public.branch_ok(branch_id) and public.has_perm(5, 'd'));

create policy payments_read on public.payments for select using (public.tenant_ok(tenant_id) and public.has_perm(5, 'r'));
create policy payments_write on public.payments for insert with check (public.tenant_ok(tenant_id) and public.has_perm(5, 'c'));

-- ───────── Fitur 11 · Akuntansi, Jurnal & Neraca ─────────
create policy accounts_read on public.accounts for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy accounts_write on public.accounts for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));
create policy je_read on public.journal_entries for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy je_write on public.journal_entries for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));
create policy jl_read on public.journal_lines for select using (public.tenant_ok(tenant_id) and public.has_perm(11, 'r'));
create policy jl_write on public.journal_lines for all
  using (public.tenant_ok(tenant_id) and public.has_perm(11, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(11, 'c'));

-- ───────── Persetujuan (fitur mengikuti kolom `feature`) ─────────
create policy approvals_read on public.approvals for select
  using (public.tenant_ok(tenant_id) and (
    (public.has_perm(feature, 'r') and public.perm_scope(feature) is null)
    or requested_by = auth.uid()));
create policy approvals_insert on public.approvals for insert
  with check (public.tenant_ok(tenant_id) and (public.has_perm(feature, 'c') or public.has_perm(feature, 'q')));
-- Tidak ada policy UPDATE: keputusan hanya lewat RPC decide_approval().

-- ───────── Fitur 19 · Capital & Payout ─────────
create policy capital_read on public.capital_applications for select using (public.tenant_ok(tenant_id) and public.has_perm(19, 'r'));
create policy capital_insert on public.capital_applications for insert with check (public.tenant_ok(tenant_id) and public.has_perm(19, 'c'));
create policy capital_update on public.capital_applications for update using (public.tenant_ok(tenant_id) and public.has_perm(19, 'u'));
create policy capital_delete on public.capital_applications for delete using (public.tenant_ok(tenant_id) and public.has_perm(19, 'd'));
create policy payout_read on public.payout_accounts for select using (public.tenant_ok(tenant_id) and public.has_perm(19, 'r'));
create policy payout_write on public.payout_accounts for all
  using (public.tenant_ok(tenant_id) and public.has_perm(19, 'u'))
  with check (public.tenant_ok(tenant_id) and public.has_perm(19, 'c'));

-- ───────── Fitur 2 · Hermes feed (bagian dashboard eksekutif) ─────────
create policy hermes_read on public.hermes_events for select using (public.tenant_ok(tenant_id) and public.has_perm(2, 'r'));
-- INSERT hanya dari Edge Function (service role melewati RLS).

-- ───────── Audit log ─────────
create policy audit_read on public.audit_logs for select
  using (public.is_superadmin() or (tenant_id = public.current_tenant_id() and public.has_perm(1, 'r')));

-- ───────── Blueprint: hanya Superadmin ─────────
create policy blueprint_read on public.blueprint_docs for select using (public.is_superadmin());

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000003_functions.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · Audit trail + RPC dashboard & persetujuan

-- ───────── Audit trigger generik ─────────
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  t_id uuid;
begin
  t_id := case when rec ? 'tenant_id' then (rec->>'tenant_id')::uuid
               when tg_table_name = 'tenants' then (rec->>'id')::uuid end;
  -- Jangan pernah salin hash PIN ke log.
  rec := rec - 'pin_hash';
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t_id, auth.uid(), public.current_app_role(), lower(tg_op), tg_table_name, rec->>'id',
          case when tg_op = 'UPDATE' then jsonb_build_object('after', rec) else rec end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['tenants','plans','platform_settings','tenant_integrations','branches','profiles',
                           'approvals','capital_applications','payout_accounts','journal_entries','invoices']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Superadmin membuka konteks tenant → dicatat (hak akses tetap sesuai matriks asli).
create or replace function public.log_superadmin_access(p_tenant uuid, p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then return; end if;
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, detail)
  values (p_tenant, auth.uid(), 'superadmin', 'access', 'tenant_context', jsonb_build_object('area', p_area));
end $$;

-- Tenant efektif: Superadmin wajib menyebut tenant, role lain selalu tenant-nya sendiri.
create or replace function public.effective_tenant(p_tenant uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_superadmin() then
    if p_tenant is null then raise exception 'Superadmin harus memilih tenant'; end if;
    return p_tenant;
  end if;
  return public.current_tenant_id();
end $$;

-- ───────── Fitur 2 · Dashboard harian per cabang ─────────
create or replace function public.dashboard_daily(p_from date, p_to date, p_tenant uuid default null, p_branch uuid default null)
returns table (day date, branch_id uuid, branch_name text, orders bigint, revenue numeric, discount numeric, cogs numeric, opex numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(2, 'r') then raise exception 'Akses ditolak: fitur 2'; end if;
  return query
  with days as (select generate_series(p_from, p_to, interval '1 day')::date d),
  sales as (
    select o.paid_at::date d, o.branch_id b, count(*) n, sum(o.total) rev, sum(o.discount) disc, sum(o.cogs) hpp
    from public.orders o
    where o.tenant_id = t and o.status = 'paid' and o.paid_at::date between p_from and p_to
      and (p_branch is null or o.branch_id = p_branch)
    group by 1, 2
  ),
  costs as (
    select e.entry_date d, e.branch_id b, sum(l.debit - l.credit) amt
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
    join public.accounts a on a.id = l.account_id and a.type = 'expense'
    where e.tenant_id = t and e.entry_date between p_from and p_to
      and (p_branch is null or e.branch_id = p_branch)
    group by 1, 2
  )
  select days.d, br.id, br.name,
         coalesce(s.n, 0), coalesce(s.rev, 0), coalesce(s.disc, 0), coalesce(s.hpp, 0), coalesce(c.amt, 0)
  from days
  cross join public.branches br
  left join sales s on s.d = days.d and s.b = br.id
  left join costs c on c.d = days.d and c.b = br.id
  where br.tenant_id = t and (p_branch is null or br.id = p_branch)
  order by 1, 3;
end $$;

-- ───────── Fitur 11 · Laba rugi per akun ─────────
create or replace function public.profit_loss(p_from date, p_to date, p_tenant uuid default null)
returns table (type public.account_type, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(11, 'r') then raise exception 'Akses ditolak: fitur 11'; end if;
  return query
  select a.type, a.code, a.name,
         case when a.type = 'revenue' then sum(l.credit - l.debit) else sum(l.debit - l.credit) end
  from public.accounts a
  join public.journal_lines l on l.account_id = a.id
  join public.journal_entries e on e.id = l.entry_id and e.entry_date between p_from and p_to
  where a.tenant_id = t and a.type in ('revenue', 'cogs', 'expense')
  group by a.type, a.code, a.name
  order by a.code;
end $$;

-- ───────── Superadmin · ringkasan platform ─────────
create or replace function public.platform_overview()
returns table (tenants bigint, active bigint, trial bigint, past_due bigint, suspended bigint, mrr numeric, unpaid numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_superadmin() and public.has_perm(1, 'r')) then raise exception 'Akses ditolak'; end if;
  return query
  select count(*),
         count(*) filter (where t.status = 'active'),
         count(*) filter (where t.status = 'trial'),
         count(*) filter (where t.status = 'past_due'),
         count(*) filter (where t.status = 'suspended'),
         coalesce(sum(p.price_month) filter (where t.status = 'active'), 0),
         (select coalesce(sum(amount), 0) from public.invoices where status = 'unpaid')
  from public.tenants t left join public.plans p on p.id = t.plan_id;
end $$;

-- ───────── Persetujuan ─────────
create or replace function public.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

create or replace function public.decide_approval(p_id uuid, p_decision public.approval_status, p_note text default null, p_pin text default null)
returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.approvals;
  needs_pin boolean;
  my_hash text;
begin
  select * into a from public.approvals where id = p_id for update;
  if not found or not public.tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not public.has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;

  -- Matriks asli: GM pada fitur 6 = "Approval (PIN/Otorisasi)".
  select label like '%PIN%' into needs_pin from public.rbac_matrix where feature = a.feature and role = public.current_app_role();
  if needs_pin then
    select pin_hash into my_hash from public.profiles where id = auth.uid();
    if my_hash is null or p_pin is null or crypt(p_pin, my_hash) <> my_hash then
      raise exception 'PIN otorisasi salah';
    end if;
  end if;
  if a.kind = 'void' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Catatan alasan wajib diisi untuk void';
  end if;

  update public.approvals
     set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where id = p_id returning * into a;
  return a;
end $$;

grant execute on function public.dashboard_daily, public.profit_loss, public.platform_overview,
  public.decide_approval, public.set_my_pin, public.log_superadmin_access to authenticated;

-- PIN GM untuk akun demo — hanya bisa dipanggil service_role (scripts/create-demo-users.mjs).
create or replace function public.admin_set_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_user;
end $$;
revoke all on function public.admin_set_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_pin(uuid, text) to service_role;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000004_rbac_matrix.sql
-- ══════════════════════════════════════════════════════════════════════
-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari src/lib/rbac-matrix.js — jangan edit manual.
-- Matriks RBAC VERSI ASLI dokumen (20 fitur × 5 peran = 100 baris).
truncate public.rbac_matrix;
insert into public.rbac_matrix (feature, feature_name, role, label, can_create, can_read, can_update, can_delete, can_approve, can_request, scope) values
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'owner', 'R', false, true, false, false, false, false, null),
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'gm', '-', false, false, false, false, false, false, null),
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'staff', '-', false, false, false, false, false, false, null),
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'dokter', '-', false, false, false, false, false, false, null),
  (2, 'Dashboard Eksekutif & Laba Riil', 'superadmin', 'R', false, true, false, false, false, false, null),
  (2, 'Dashboard Eksekutif & Laba Riil', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (2, 'Dashboard Eksekutif & Laba Riil', 'gm', 'R (Operasional)', false, true, false, false, false, false, 'operasional'),
  (2, 'Dashboard Eksekutif & Laba Riil', 'staff', '-', false, false, false, false, false, false, null),
  (2, 'Dashboard Eksekutif & Laba Riil', 'dokter', '-', false, false, false, false, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'staff', 'R', false, true, false, false, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'dokter', 'R', false, true, false, false, false, false, null),
  (4, 'Resep & Bill of Materials (BOM)', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (4, 'Resep & Bill of Materials (BOM)', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (4, 'Resep & Bill of Materials (BOM)', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (4, 'Resep & Bill of Materials (BOM)', 'staff', 'R', false, true, false, false, false, false, null),
  (4, 'Resep & Bill of Materials (BOM)', 'dokter', '-', false, false, false, false, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'superadmin', '-', false, false, false, false, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'owner', 'R', false, true, false, false, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'gm', 'R', false, true, false, false, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'staff', 'CRUD', true, true, true, true, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'dokter', '-', false, false, false, false, false, false, null),
  (6, 'Otorisasi Void, Refund & Diskon', 'superadmin', '-', false, false, false, false, false, false, null),
  (6, 'Otorisasi Void, Refund & Diskon', 'owner', 'Approval', false, true, false, false, true, false, null),
  (6, 'Otorisasi Void, Refund & Diskon', 'gm', 'Approval (PIN/Otorisasi)', false, true, false, false, true, false, null),
  (6, 'Otorisasi Void, Refund & Diskon', 'staff', 'Request', false, true, false, false, false, true, 'own'),
  (6, 'Otorisasi Void, Refund & Diskon', 'dokter', '-', false, false, false, false, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'staff', 'RU', false, true, true, false, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'dokter', '-', false, false, false, false, false, false, null),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'owner', 'R', false, true, false, false, false, false, null),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'gm', 'R', false, true, false, false, false, false, null),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'staff', 'CRUD', true, true, true, true, false, false, null),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'dokter', '-', false, false, false, false, false, false, null),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'owner', 'Approval', false, true, false, false, true, false, null),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'staff', '-', false, false, false, false, false, false, null),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'dokter', '-', false, false, false, false, false, false, null),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'owner', 'R', false, true, false, false, false, false, null),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'gm', 'Approval & CRUD', true, true, true, true, true, false, null),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'staff', 'Create (Opname/Waste)', true, true, false, false, false, false, 'opname_waste'),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'dokter', '-', false, false, false, false, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'owner', 'R', false, true, false, false, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'staff', '-', false, false, false, false, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'dokter', '-', false, false, false, false, false, false, null),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'owner', 'R', false, true, false, false, false, false, null),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'staff', 'Input Petty Cash', true, true, false, false, false, false, 'petty_cash'),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'dokter', '-', false, false, false, false, false, false, null),
  (13, 'Master Karyawan, Shift & Geofencing', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (13, 'Master Karyawan, Shift & Geofencing', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (13, 'Master Karyawan, Shift & Geofencing', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (13, 'Master Karyawan, Shift & Geofencing', 'staff', 'Absen GPS Masuk/Pulang', true, true, false, false, false, false, 'own_attendance'),
  (13, 'Master Karyawan, Shift & Geofencing', 'dokter', '-', false, false, false, false, false, false, null),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'owner', 'Approval', false, true, false, false, true, false, null),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'staff', 'R (Komisi Pribadi)', false, true, false, false, false, false, 'own'),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'dokter', 'R (Komisi Pribadi)', false, true, false, false, false, false, 'own'),
  (15, 'Database CRM & Poin Loyalitas', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (15, 'Database CRM & Poin Loyalitas', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (15, 'Database CRM & Poin Loyalitas', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (15, 'Database CRM & Poin Loyalitas', 'staff', 'RU', false, true, true, false, false, false, null),
  (15, 'Database CRM & Poin Loyalitas', 'dokter', '-', false, false, false, false, false, false, null),
  (16, 'Integrasi Omnichannel & Marketplace', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (16, 'Integrasi Omnichannel & Marketplace', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (16, 'Integrasi Omnichannel & Marketplace', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (16, 'Integrasi Omnichannel & Marketplace', 'staff', 'R (Proses Pesanan)', false, true, false, false, false, false, 'proses_pesanan'),
  (16, 'Integrasi Omnichannel & Marketplace', 'dokter', '-', false, false, false, false, false, false, null),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'owner', 'R', false, true, false, false, false, false, null),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'gm', 'R', false, true, false, false, false, false, null),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'staff', 'R (Billing Obat)', false, true, false, false, false, false, 'billing_obat'),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'dokter', 'CRUD', true, true, true, true, false, false, null),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'staff', 'CRUD', true, true, true, true, false, false, null),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'dokter', 'RU', false, true, true, false, false, false, null),
  (19, 'Pengajuan Tijarah Capital & Payout', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (19, 'Pengajuan Tijarah Capital & Payout', 'owner', 'CRUD', true, true, true, true, false, false, null),
  (19, 'Pengajuan Tijarah Capital & Payout', 'gm', 'RU', false, true, true, false, false, false, null),
  (19, 'Pengajuan Tijarah Capital & Payout', 'staff', '-', false, false, false, false, false, false, null),
  (19, 'Pengajuan Tijarah Capital & Payout', 'dokter', '-', false, false, false, false, false, false, null),
  (20, 'Pengadaan Bahan Tijarah Supplies', 'superadmin', 'CRUD', true, true, true, true, false, false, null),
  (20, 'Pengadaan Bahan Tijarah Supplies', 'owner', 'Approval', false, true, false, false, true, false, null),
  (20, 'Pengadaan Bahan Tijarah Supplies', 'gm', 'CRUD', true, true, true, true, false, false, null),
  (20, 'Pengadaan Bahan Tijarah Supplies', 'staff', '-', false, false, false, false, false, false, null),
  (20, 'Pengadaan Bahan Tijarah Supplies', 'dokter', '-', false, false, false, false, false, false, null);

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000005_operations.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 2: tabel operasional (POS, dapur, stok, pembelian, kas, SDM)
-- Setiap tabel dipetakan ke satu nomor fitur matriks ASLI; RLS memanggil has_perm().

alter table public.branches add column if not exists is_warehouse boolean not null default false;

-- ───────── Fitur 3 · Master produk ─────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  name text not null,
  category text not null default 'Umum',
  price numeric(14,2) not null check (price >= 0),
  station text not null default 'dapur' check (station in ('dapur', 'barista', 'grill', 'pastry')),
  is_available boolean not null default true,   -- sakelar 86
  barcode text,
  created_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

-- ───────── Fitur 4 · Bahan & resep (BOM bertingkat) ─────────
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  unit text not null,                    -- g, ml, pcs, botol
  cost_per_unit numeric(14,4) not null default 0,
  min_qty numeric(14,3) not null default 0,
  is_semi boolean not null default false, -- barang setengah jadi (punya resep sendiri)
  pack_unit text,                         -- satuan beli/kemasan kulakan (galon, botol, karung, dus)
  pack_ratio numeric(14,3),               -- rasio isi per kemasan dalam satuan dasar
  pack_price numeric(14,2),               -- harga beli per kemasan kulakan
  template_id text,                       -- preset template kemasan Multi-UoM
  unique (tenant_id, code)
);

create table public.bom_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  parent_item_id uuid references public.inventory_items(id) on delete cascade, -- resep sub-item
  component_id uuid not null references public.inventory_items(id) on delete restrict,
  qty numeric(14,4) not null check (qty > 0),
  yield_qty numeric(14,3) not null default 1, -- untuk sub-resep: hasil per batch
  check ((product_id is null) <> (parent_item_id is null))
);

-- ───────── Fitur 10 · Stok, mutasi, opname, waste ─────────
create table public.stock_levels (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  qty numeric(14,3) not null default 0,
  primary key (branch_id, item_id)
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  qty_delta numeric(14,3) not null,
  kind text not null check (kind in ('sale', 'waste', 'opname', 'transfer_in', 'transfer_out', 'purchase', 'production', 'void_restock')),
  ref text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.stock_movements (tenant_id, branch_id, created_at desc);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  system_qty numeric(14,3) not null,
  counted_qty numeric(14,3) not null check (counted_qty >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'applied', 'rejected')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  applied_by uuid,
  applied_at timestamptz
);

create table public.waste_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  qty numeric(14,3) not null check (qty > 0),
  reason text not null,
  cost numeric(14,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  from_branch uuid not null references public.branches(id),
  to_branch uuid not null references public.branches(id),
  status text not null default 'draft' check (status in ('draft', 'approved', 'in_transit', 'received', 'cancelled')),
  lines jsonb not null default '[]',   -- [{item_id, qty}]
  created_by uuid default auth.uid(),
  approved_by uuid,
  created_at timestamptz not null default now(),
  check (from_branch <> to_branch)
);

-- ───────── Fitur 9 · Vendor & Purchase Order ─────────
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  bank text,
  terms text not null default 'COD' check (terms in ('COD', 'Net 14', 'Net 30'))
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  vendor_id uuid not null references public.vendors(id),
  code text not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'received', 'cancelled')),
  lines jsonb not null default '[]',   -- [{item_id, qty, price}]
  total numeric(14,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz
);

-- ───────── Fitur 7 · Denah meja ─────────
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  label text not null,
  area text not null default 'Lantai 1',
  seats int not null default 4,
  status text not null default 'available' check (status in ('available', 'occupied', 'cooking', 'reserved', 'dirty')),
  sort int not null default 0,
  unique (branch_id, label)
);

-- ───────── Fitur 5 & 8 · Item pesanan + antrean dapur ─────────
alter table public.orders add column if not exists table_id uuid references public.tables(id) on delete set null;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shift_id uuid;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  qty int not null check (qty > 0),
  price numeric(14,2) not null,
  station text not null,
  note text,
  kitchen_status text not null default 'new' check (kitchen_status in ('new', 'cooking', 'ready', 'served')),
  created_at timestamptz not null default now(),
  ready_at timestamptz
);
create index on public.order_items (branch_id, kitchen_status);

-- ───────── Fitur 5 · Shift kasir ─────────
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  cashier_id uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(14,2) not null check (opening_cash >= 0),
  cash_sales numeric(14,2) not null default 0,
  non_cash_sales numeric(14,2) not null default 0,
  closed_at timestamptz,
  counted_cash numeric(14,2),
  variance numeric(14,2),
  status text not null default 'open' check (status in ('open', 'closed'))
);
create unique index one_open_shift_per_cashier on public.shifts (cashier_id) where status = 'open';

-- ───────── Fitur 12 · Kas kecil ─────────
create table public.petty_cash (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  receipt_path text,   -- path di Supabase Storage (bucket privat)
  status text not null default 'submitted' check (status in ('submitted', 'validated', 'rejected')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  validated_by uuid,
  validated_at timestamptz
);

-- ───────── Fitur 13 · Jadwal shift & absensi GPS ─────────
create table public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  late_tolerance_min int default 15,
  auto_clockout boolean default false,
  auto_clockout_delay_min int default 30
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  lat double precision not null,
  lng double precision not null,
  distance_m int not null,
  selfie_path text,
  created_at timestamptz not null default now(),
  auto_clockout boolean default false,
  notes text default '-',
  address text
);

-- ───────── Fitur 14 · Payroll & komisi ─────────
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period date not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  total numeric(14,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, period)
);

create table public.payroll_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  base numeric(14,2) not null default 0,
  allowance numeric(14,2) not null default 0,
  overtime numeric(14,2) not null default 0,
  commission numeric(14,2) not null default 0,
  late_penalty numeric(14,2) not null default 0,
  kasbon numeric(14,2) not null default 0,
  net numeric(14,2) generated always as (base + allowance + overtime + commission - late_penalty - kasbon) stored
);

-- ═════════ RLS ═════════
do $$
declare t text;
begin
  foreach t in array array['products','inventory_items','bom_lines','stock_levels','stock_movements','stock_counts','waste_logs',
                           'stock_transfers','vendors','purchase_orders','tables','order_items','shifts','petty_cash',
                           'work_shifts','attendance','payroll_runs','payroll_lines']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Pola baku: baca/tulis per fitur, terbatas tenant (+ cabang untuk Staff/Dokter).
create or replace function public.feat_ok(p_tenant uuid, p_branch uuid, p_feature int, p_action text) returns boolean
language sql stable as $$
  select public.tenant_ok(p_tenant) and public.branch_ok(p_branch) and public.has_perm(p_feature, p_action)
$$;

-- Fitur 3 · produk (Staff & Dokter: R)
create policy products_r on public.products for select using (public.feat_ok(tenant_id, null, 3, 'r'));
create policy products_c on public.products for insert with check (public.feat_ok(tenant_id, null, 3, 'c'));
create policy products_u on public.products for update using (public.feat_ok(tenant_id, null, 3, 'u'));
create policy products_d on public.products for delete using (public.feat_ok(tenant_id, null, 3, 'd'));

-- Fitur 4 · bahan & resep
create policy items_r on public.inventory_items for select using (public.feat_ok(tenant_id, null, 4, 'r') or public.feat_ok(tenant_id, null, 10, 'r'));
create policy items_c on public.inventory_items for insert with check (public.feat_ok(tenant_id, null, 4, 'c'));
create policy items_u on public.inventory_items for update using (public.feat_ok(tenant_id, null, 4, 'u'));
create policy items_d on public.inventory_items for delete using (public.feat_ok(tenant_id, null, 4, 'd'));
create policy bom_r on public.bom_lines for select using (public.feat_ok(tenant_id, null, 4, 'r'));
create policy bom_c on public.bom_lines for insert with check (public.feat_ok(tenant_id, null, 4, 'c'));
create policy bom_u on public.bom_lines for update using (public.feat_ok(tenant_id, null, 4, 'u'));
create policy bom_d on public.bom_lines for delete using (public.feat_ok(tenant_id, null, 4, 'd'));

-- Fitur 10 · stok (perubahan stok hanya lewat RPC; tabel hanya dibaca)
create policy levels_r on public.stock_levels for select using (public.feat_ok(tenant_id, branch_id, 10, 'r'));
create policy moves_r on public.stock_movements for select using (public.feat_ok(tenant_id, branch_id, 10, 'r'));
create policy counts_r on public.stock_counts for select
  using (public.feat_ok(tenant_id, branch_id, 10, 'r') and (public.perm_scope(10) is null or created_by = auth.uid()));
create policy waste_r on public.waste_logs for select
  using (public.feat_ok(tenant_id, branch_id, 10, 'r') and (public.perm_scope(10) is null or created_by = auth.uid()));
create policy sto_r on public.stock_transfers for select
  using (public.tenant_ok(tenant_id) and public.has_perm(10, 'r') and public.perm_scope(10) is null);

-- Fitur 9 · vendor & PO
create policy vendors_r on public.vendors for select using (public.feat_ok(tenant_id, null, 9, 'r'));
create policy vendors_c on public.vendors for insert with check (public.feat_ok(tenant_id, null, 9, 'c'));
create policy vendors_u on public.vendors for update using (public.feat_ok(tenant_id, null, 9, 'u'));
create policy vendors_d on public.vendors for delete using (public.feat_ok(tenant_id, null, 9, 'd'));
create policy po_r on public.purchase_orders for select using (public.feat_ok(tenant_id, null, 9, 'r'));
create policy po_c on public.purchase_orders for insert with check (public.feat_ok(tenant_id, null, 9, 'c') and status = 'draft');
create policy po_u on public.purchase_orders for update using (public.feat_ok(tenant_id, null, 9, 'u') and status = 'draft');
create policy po_d on public.purchase_orders for delete using (public.feat_ok(tenant_id, null, 9, 'd') and status = 'draft');

-- Fitur 7 · denah meja (Staff: RU)
create policy tables_r on public.tables for select using (public.feat_ok(tenant_id, branch_id, 7, 'r'));
create policy tables_c on public.tables for insert with check (public.feat_ok(tenant_id, branch_id, 7, 'c'));
create policy tables_u on public.tables for update using (public.feat_ok(tenant_id, branch_id, 7, 'u'));
create policy tables_d on public.tables for delete using (public.feat_ok(tenant_id, branch_id, 7, 'd'));

-- Fitur 8 · antrean dapur (Staff: CRUD) — status masak diubah langsung
create policy oi_r on public.order_items for select using (public.feat_ok(tenant_id, branch_id, 8, 'r') or public.feat_ok(tenant_id, branch_id, 5, 'r'));
create policy oi_u on public.order_items for update using (public.feat_ok(tenant_id, branch_id, 8, 'u'));

-- Fitur 5 · shift
create policy shifts_r on public.shifts for select using (public.feat_ok(tenant_id, branch_id, 5, 'r') or public.feat_ok(tenant_id, branch_id, 12, 'r'));

-- Fitur 12 · kas kecil (Staff: input + baca miliknya)
create policy petty_r on public.petty_cash for select
  using (public.feat_ok(tenant_id, branch_id, 12, 'r') and (public.perm_scope(12) is null or created_by = auth.uid()));
create policy petty_c on public.petty_cash for insert
  with check (public.feat_ok(tenant_id, branch_id, 12, 'c') and status = 'submitted' and created_by = auth.uid());

-- Fitur 13 · jadwal & absensi (Staff: absen miliknya)
create policy ws_r on public.work_shifts for select
  using (public.feat_ok(tenant_id, branch_id, 13, 'r') and (public.perm_scope(13) is null or profile_id = auth.uid()));
create policy ws_c on public.work_shifts for insert with check (public.feat_ok(tenant_id, branch_id, 13, 'c') and public.perm_scope(13) is null);
create policy ws_u on public.work_shifts for update using (public.feat_ok(tenant_id, branch_id, 13, 'u') and public.perm_scope(13) is null);
create policy ws_d on public.work_shifts for delete using (public.feat_ok(tenant_id, branch_id, 13, 'd') and public.perm_scope(13) is null);
create policy att_r on public.attendance for select
  using (public.feat_ok(tenant_id, branch_id, 13, 'r') and (public.perm_scope(13) is null or profile_id = auth.uid()));

-- Fitur 14 · payroll (Staff & Dokter: komisi pribadi)
create policy pr_r on public.payroll_runs for select using (public.tenant_ok(tenant_id) and public.has_perm(14, 'r') and public.perm_scope(14) is null);
create policy pr_c on public.payroll_runs for insert with check (public.feat_ok(tenant_id, null, 14, 'c'));
create policy pr_d on public.payroll_runs for delete using (public.feat_ok(tenant_id, null, 14, 'd') and status = 'draft');
create policy pl_r on public.payroll_lines for select
  using (public.tenant_ok(tenant_id) and public.has_perm(14, 'r') and (public.perm_scope(14) is null or profile_id = auth.uid()));
create policy pl_c on public.payroll_lines for insert with check (public.feat_ok(tenant_id, null, 14, 'c'));
create policy pl_u on public.payroll_lines for update using (public.feat_ok(tenant_id, null, 14, 'u'));
create policy pl_d on public.payroll_lines for delete using (public.feat_ok(tenant_id, null, 14, 'd'));

-- Realtime untuk denah meja & antrean dapur (abaikan bila publikasi belum ada, mis. Postgres lokal).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tables, public.order_items;
  end if;
end $$;

-- Storage: bucket privat untuk nota kas kecil & selfie absen; folder pertama = tenant_id.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false), ('selfies', 'selfies', false)
    on conflict (id) do nothing;
    execute $p$create policy "tenant upload receipts" on storage.objects for insert to authenticated
      with check (bucket_id in ('receipts', 'selfies') and (storage.foldername(name))[1] = public.current_tenant_id()::text)$p$;
    execute $p$create policy "tenant read receipts" on storage.objects for select to authenticated
      using (bucket_id in ('receipts', 'selfies') and (storage.foldername(name))[1] = public.current_tenant_id()::text
             and (public.has_perm(12, 'r') or public.has_perm(13, 'r')))$p$;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000006_operations_rpc.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 2: RPC operasional. Semua efek samping sistem (potong stok BOM, jurnal PSAK,
-- alert Hermes) terjadi di sini dengan SECURITY DEFINER, SETELAH has_perm() memeriksa matriks asli.

alter table public.profiles add column if not exists base_salary numeric(14,2) not null default 0;

-- ───────── Helper internal (tidak di-grant ke klien) ─────────
create or replace function public._acc(p_tenant uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid;
  names jsonb := '{"1101":["Kas","asset"],"1102":["Bank, EDC & QRIS","asset"],"1301":["Persediaan Bahan Baku","asset"],
    "2101":["Utang Dagang","liability"],"2102":["Utang Pajak Penjualan","liability"],"2103":["Utang Gaji","liability"],
    "3101":["Modal Pemilik","equity"],"4101":["Pendapatan Penjualan","revenue"],"5101":["Harga Pokok Penjualan","cogs"],
    "6101":["Beban Gaji","expense"],"6102":["Beban Sewa","expense"],"6103":["Beban Listrik & Internet","expense"],
    "6104":["Beban Waste & Susut","expense"],"6105":["Beban Kas Kecil Outlet","expense"]}';
begin
  select id into a from accounts where tenant_id = p_tenant and code = p_code;
  if a is null then
    insert into accounts (tenant_id, code, name, type)
    values (p_tenant, p_code, names->p_code->>0, (names->p_code->>1)::account_type) returning id into a;
  end if;
  return a;
end $$;

-- lines: [{"code":"1101","dr":100}, {"code":"4101","cr":100}] — wajib seimbang.
create or replace function public._journal(p_tenant uuid, p_branch uuid, p_memo text, p_source text, p_source_id uuid, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare e uuid; l jsonb; dr numeric := 0; cr numeric := 0;
begin
  for l in select * from jsonb_array_elements(p_lines) loop
    dr := dr + coalesce((l->>'dr')::numeric, 0); cr := cr + coalesce((l->>'cr')::numeric, 0);
  end loop;
  if round(dr, 2) <> round(cr, 2) then raise exception 'Jurnal tidak seimbang (% vs %)', dr, cr; end if;
  if dr = 0 then return null; end if;
  insert into journal_entries (tenant_id, branch_id, entry_date, memo, source, source_id, created_by)
  values (p_tenant, p_branch, current_date, p_memo, p_source, p_source_id, auth.uid()) returning id into e;
  insert into journal_lines (tenant_id, entry_id, account_id, debit, credit)
  select p_tenant, e, _acc(p_tenant, x->>'code'), round(coalesce((x->>'dr')::numeric, 0), 2), round(coalesce((x->>'cr')::numeric, 0), 2)
  from jsonb_array_elements(p_lines) x
  where coalesce((x->>'dr')::numeric, 0) + coalesce((x->>'cr')::numeric, 0) > 0;
  return e;
end $$;

create or replace function public._move(p_tenant uuid, p_branch uuid, p_item uuid, p_delta numeric, p_kind text, p_ref text, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare q numeric;
begin
  insert into stock_levels (tenant_id, branch_id, item_id, qty) values (p_tenant, p_branch, p_item, p_delta)
  on conflict (branch_id, item_id) do update set qty = stock_levels.qty + excluded.qty
  returning qty into q;
  insert into stock_movements (tenant_id, branch_id, item_id, qty_delta, kind, ref, note, created_by)
  values (p_tenant, p_branch, p_item, p_delta, p_kind, p_ref, p_note, auth.uid());
  return q;
end $$;

create or replace function public._need(p_feature int, p_action text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_perm(p_feature, p_action) then
    raise exception 'Akses ditolak: peran % tidak punya aksi "%" pada fitur %', current_app_role(), p_action, p_feature;
  end if;
end $$;

create or replace function public._branch_guard(p_branch uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  select tenant_id into t from branches where id = p_branch;
  if t is null or not tenant_ok(t) or not branch_ok(p_branch) then raise exception 'Cabang tidak dapat diakses'; end if;
  return t;
end $$;

create or replace function public._hermes(p_tenant uuid, p_channel text, p_target text, p_kind text, p_msg text, p_payload jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  -- Antre sebagai 'queued'; Edge Function hermes-dispatch (via Database Webhook) yang mengirim.
  insert into hermes_events (tenant_id, channel, target, kind, message, payload, status)
  values (p_tenant, p_channel, p_target, p_kind, p_msg, p_payload, 'queued');
$$;

create or replace function public._rp(n numeric) returns text language sql immutable as $$
  select 'Rp ' || replace(to_char(round(n), 'FM999G999G999G990'), ',', '.')
$$;

-- ═════════ Fitur 5 · Shift kasir ═════════
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); s shifts;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;
  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash) values (t, p_branch, auth.uid(), p_opening) returning * into s;
  return s;
exception when unique_violation then raise exception 'Anda masih punya shift yang terbuka';
end $$;

create or replace function public.shift_report(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s shifts; r jsonb;
begin
  select * into s from shifts where id = p_shift;
  if not found or not tenant_ok(s.tenant_id) or not branch_ok(s.branch_id) then raise exception 'Shift tidak ditemukan'; end if;
  if not (has_perm(5, 'r') or has_perm(12, 'r')) then raise exception 'Akses ditolak'; end if;
  select jsonb_build_object(
    'shift', to_jsonb(s),
    'orders', (select count(*) from orders where shift_id = s.id and status = 'paid'),
    'voids', (select count(*) from orders where shift_id = s.id and status = 'void'),
    'by_method', coalesce((select jsonb_object_agg(method, amt) from (
        select p.method, sum(p.amount) amt from payments p join orders o on o.id = p.order_id
        where o.shift_id = s.id and o.status = 'paid' group by p.method) m), '{}'),
    'expected_cash', s.opening_cash + s.cash_sales
  ) into r;
  return r;
end $$;

create or replace function public.close_shift(p_shift uuid, p_counted numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s shifts;
begin
  perform _need(5, 'u');
  select * into s from shifts where id = p_shift for update;
  if not found or s.status <> 'open' then raise exception 'Shift tidak terbuka'; end if;
  if s.cashier_id <> auth.uid() and current_app_role() = 'staff' then raise exception 'Hanya kasir pemilik shift'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Isi hasil hitung uang fisik'; end if;
  update shifts set closed_at = now(), counted_cash = p_counted, variance = p_counted - (opening_cash + cash_sales), status = 'closed'
  where id = p_shift;
  return shift_report(p_shift);
end $$;

-- Z-Report: kunci hari, kirim ringkasan ke Owner & GM lewat Hermes.
create or replace function public.z_report(p_branch uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); r jsonb; b text;
begin
  perform _need(5, 'c');
  if exists (select 1 from shifts where branch_id = p_branch and status = 'open') then
    raise exception 'Masih ada shift terbuka di cabang ini. Tutup semua shift dulu.';
  end if;
  select name into b from branches where id = p_branch;
  select jsonb_build_object('branch', b, 'date', current_date,
      'orders', count(*) filter (where status = 'paid'), 'voids', count(*) filter (where status = 'void'),
      'revenue', coalesce(sum(total) filter (where status = 'paid'), 0),
      'tax', coalesce(sum(tax) filter (where status = 'paid'), 0),
      'cogs', coalesce(sum(cogs) filter (where status = 'paid'), 0))
  into r from orders where branch_id = p_branch and paid_at::date = current_date;
  perform _hermes(t, 'whatsapp', 'Owner & GM', 'z_report',
    format('Z-Report %s %s: %s transaksi, omset %s, void %s.', b, to_char(current_date, 'DD/MM'), r->>'orders', _rp((r->>'revenue')::numeric), r->>'voids'), r);
  perform _hermes(t, 'discord', '#laporan-harian', 'z_report', format('Z-Report %s: omset %s', b, _rp((r->>'revenue')::numeric)), r);
  return r;
end $$;

-- ═════════ Fitur 5 + 8 · Pesanan ═════════
create or replace function public._sync_table(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tid uuid; busy boolean;
begin
  select table_id into tid from orders where id = p_order and status = 'open';
  if tid is null then return; end if;
  select exists (select 1 from order_items where order_id = p_order and kitchen_status in ('new', 'cooking')) into busy;
  update tables set status = case when busy then 'cooking' else 'occupied' end where id = tid;
end $$;

-- items: [{"product_id": "...", "qty": 2, "note": "pedas"}]. Harga diambil dari server, bukan klien.
create or replace function public.create_order(p_branch uuid, p_items jsonb, p_table uuid default null,
                                               p_channel text default 'dine_in', p_order uuid default null)
returns orders language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); o orders; it jsonb; p products; sid uuid;
begin
  perform _need(5, 'c');
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Pesanan kosong'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if p_order is null then
    if p_table is not null and exists (select 1 from orders where table_id = p_table and status = 'open') then
      raise exception 'Meja masih punya pesanan terbuka. Tambahkan ke pesanan itu.';
    end if;
    insert into orders (tenant_id, branch_id, code, status, channel, table_id, table_label, cashier_id, shift_id)
    values (t, p_branch, 'ORD-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 3),
            'open', p_channel, p_table, (select label from tables where id = p_table), auth.uid(), sid)
    returning * into o;
  else
    select * into o from orders where id = p_order and branch_id = p_branch for update;
    if not found or o.status <> 'open' then raise exception 'Pesanan tidak terbuka'; end if;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = (it->>'product_id')::uuid and tenant_id = t;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if not p.is_available then raise exception '% sedang habis (86)', p.name; end if;
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, note)
    values (t, p_branch, o.id, p.id, p.name, greatest((it->>'qty')::int, 1), p.price, p.station, nullif(it->>'note', ''));
  end loop;
  update orders set subtotal = (select sum(qty * price) from order_items where order_id = o.id) where id = o.id returning * into o;
  perform _sync_table(o.id);
  return o;
end $$;

create or replace function public.set_item_status(p_item uuid, p_status text) returns order_items
language plpgsql security definer set search_path = public as $$
declare i order_items;
begin
  perform _need(8, 'u');
  select * into i from order_items where id = p_item;
  if not found or not tenant_ok(i.tenant_id) or not branch_ok(i.branch_id) then raise exception 'Item tidak ditemukan'; end if;
  if p_status not in ('new', 'cooking', 'ready', 'served') then raise exception 'Status tidak valid'; end if;
  update order_items set kitchen_status = p_status, ready_at = case when p_status = 'ready' then now() else ready_at end
  where id = p_item returning * into i;
  perform _sync_table(i.order_id);
  return i;
end $$;

-- Sakelar 86: bagian dari antrean dapur (fitur 8) atau master produk (fitur 3).
create or replace function public.toggle_86(p_product uuid, p_available boolean) returns products
language plpgsql security definer set search_path = public as $$
declare p products;
begin
  if not (has_perm(8, 'u') or has_perm(3, 'u')) then raise exception 'Akses ditolak: fitur 8/3'; end if;
  update products set is_available = p_available where id = p_product and tenant_ok(tenant_id) returning * into p;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  return p;
end $$;

create or replace function public.move_order(p_order uuid, p_table uuid) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; target_open uuid;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'open' or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak terbuka'; end if;
  select id into target_open from orders where table_id = p_table and status = 'open' and id <> p_order;
  if target_open is not null then
    -- Gabung tagihan: pindahkan item ke pesanan di meja tujuan.
    update order_items set order_id = target_open where order_id = p_order;
    update orders set status = 'void', table_id = null where id = p_order;
    update orders set subtotal = (select sum(qty * price) from order_items where order_id = target_open) where id = target_open returning * into o;
  else
    update orders set table_id = p_table, table_label = (select label from tables where id = p_table) where id = p_order returning * into o;
  end if;
  update tables t set status = 'available' where t.branch_id = o.branch_id
    and not exists (select 1 from orders x where x.table_id = t.id and x.status = 'open') and t.status in ('occupied', 'cooking');
  perform _sync_table(o.id);
  return o;
end $$;

-- payments: [{"method":"cash","amount":200000}, {"method":"qris","amount":50000,"reference":"QR-..."}]
create or replace function public.pay_order(p_order uuid, p_payments jsonb, p_customer_phone text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  v_tax := round(o.subtotal * 0.10);          -- PB1 10%
  v_total := o.subtotal + v_tax;
  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  -- Potong stok sesuai resep (BOM) dan hitung HPP riil.
  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  update orders set status = 'paid', paid_at = now(), tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid,
         customer_phone = coalesce(p_customer_phone, customer_phone)
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jsonb_build_array(
    jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash),
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp))));
  return o;
end $$;

-- ═════════ Fitur 6 · Void ═════════
create or replace function public.request_void(p_order uuid, p_reason text, p_note text) returns approvals
language plpgsql security definer set search_path = public as $$
declare o orders; a approvals;
begin
  if not (has_perm(6, 'q') or has_perm(6, 'c')) then raise exception 'Akses ditolak: fitur 6'; end if;
  select * into o from orders where id = p_order;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'paid' then raise exception 'Hanya transaksi lunas yang bisa di-void'; end if;
  if p_reason not in ('Salah Input Kasir', 'Pelanggan Membatalkan', 'Masakan Rusak') then raise exception 'Alasan tidak valid'; end if;
  if exists (select 1 from approvals where kind = 'void' and status = 'pending' and detail->>'order_id' = o.id::text) then
    raise exception 'Permintaan void untuk transaksi ini sudah menunggu';
  end if;
  insert into approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail, requested_by)
  values (o.tenant_id, o.branch_id, 6, 'void', o.code, 'Void transaksi · ' || lower(p_reason), o.total,
          jsonb_build_object('order_id', o.id, 'alasan', p_reason, 'catatan', p_note), auth.uid())
  returning * into a;
  return a;
end $$;

create or replace function public._apply_void(p_order uuid, p_option text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders; it record; bl record;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.status <> 'paid' then return; end if;
  update orders set status = 'void' where id = o.id;
  -- Balik jurnal penjualan.
  insert into journal_entries (tenant_id, branch_id, entry_date, memo, source, source_id, created_by)
  select o.tenant_id, o.branch_id, current_date, 'Pembalikan void ' || o.code, 'void', o.id, auth.uid()
  where exists (select 1 from journal_entries where source = 'pos' and source_id = o.id);
  insert into journal_lines (tenant_id, entry_id, account_id, debit, credit)
  select o.tenant_id, (select id from journal_entries where source = 'void' and source_id = o.id order by created_at desc limit 1),
         l.account_id, l.credit, l.debit
  from journal_lines l join journal_entries e on e.id = l.entry_id where e.source = 'pos' and e.source_id = o.id;
  -- Bahan: kembali ke stok, atau dicatat waste (beban).
  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit from bom_lines b join inventory_items i on i.id = b.component_id
              where b.product_id = it.product_id loop
      if p_option = 'restock' then
        perform _move(o.tenant_id, o.branch_id, bl.component_id, bl.qty * it.q, 'void_restock', o.code);
      else
        insert into waste_logs (tenant_id, branch_id, item_id, qty, reason, cost)
        values (o.tenant_id, o.branch_id, bl.component_id, bl.qty * it.q, 'Void ' || o.code, round(bl.qty * it.q * bl.cost_per_unit));
      end if;
    end loop;
  end loop;
  if coalesce(p_option, 'waste') <> 'restock' and o.cogs > 0 then
    perform _journal(o.tenant_id, o.branch_id, 'Waste dari void ' || o.code, 'waste', o.id, jsonb_build_array(
      jsonb_build_object('code', '6104', 'dr', o.cogs), jsonb_build_object('code', '1301', 'cr', o.cogs)));
  end if;
  update shifts s set cash_sales = cash_sales - coalesce((select sum(amount) from payments where order_id = o.id and method = 'cash'), 0),
                      non_cash_sales = non_cash_sales - coalesce((select sum(amount) from payments where order_id = o.id and method <> 'cash'), 0)
  where s.id = o.shift_id and s.status = 'open';
  perform _hermes(o.tenant_id, 'discord', '#alert-sistem', 'void_alert',
    format('[SECURITY ALERT] Void transaksi %s sebesar %s disetujui oleh %s di %s. %s',
      o.code, _rp(o.total), (select full_name from profiles where id = auth.uid()),
      (select name from branches where id = o.branch_id), coalesce(p_note, '')));
end $$;

-- ═════════ Fitur 9 · Purchase Order ═════════
create or replace function public.submit_po(p_po uuid) returns purchase_orders
language plpgsql security definer set search_path = public as $$
declare po purchase_orders; tot numeric;
begin
  perform _need(9, 'u');
  select * into po from purchase_orders where id = p_po for update;
  if not found or not tenant_ok(po.tenant_id) then raise exception 'PO tidak ditemukan'; end if;
  if po.status <> 'draft' then raise exception 'Hanya draf yang bisa diajukan'; end if;
  if jsonb_array_length(po.lines) = 0 then raise exception 'PO tanpa barang'; end if;
  select sum((l->>'qty')::numeric * (l->>'price')::numeric) into tot from jsonb_array_elements(po.lines) l;
  update purchase_orders set status = 'pending', total = tot where id = p_po returning * into po;
  insert into approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail, requested_by)
  values (po.tenant_id, po.branch_id, 9, 'po', po.code,
          'PO ke ' || (select name from vendors where id = po.vendor_id), tot, jsonb_build_object('po_id', po.id), auth.uid());
  return po;
end $$;

create or replace function public.receive_po(p_po uuid) returns purchase_orders
language plpgsql security definer set search_path = public as $$
declare po purchase_orders; l jsonb;
begin
  perform _need(9, 'u');
  select * into po from purchase_orders where id = p_po for update;
  if not found or not tenant_ok(po.tenant_id) then raise exception 'PO tidak ditemukan'; end if;
  if po.status <> 'approved' then raise exception 'PO belum disetujui'; end if;
  for l in select * from jsonb_array_elements(po.lines) loop
    perform _move(po.tenant_id, po.branch_id, (l->>'item_id')::uuid, (l->>'qty')::numeric, 'purchase', po.code);
    update inventory_items set cost_per_unit = (l->>'price')::numeric where id = (l->>'item_id')::uuid;
  end loop;
  update purchase_orders set status = 'received', received_at = now() where id = p_po returning * into po;
  perform _journal(po.tenant_id, po.branch_id, 'Penerimaan barang ' || po.code, 'purchase', po.id, jsonb_build_array(
    jsonb_build_object('code', '1301', 'dr', po.total), jsonb_build_object('code', '2101', 'cr', po.total)));
  return po;
end $$;

-- ═════════ Fitur 10 · Transfer stok, opname, waste, produksi sub-resep ═════════
create or replace function public.create_sto(p_from uuid, p_to uuid, p_lines jsonb) returns stock_transfers
language plpgsql security definer set search_path = public as $$
declare t uuid; s stock_transfers; tot numeric;
begin
  perform _need(10, 'c');
  if perm_scope(10) is not null then raise exception 'Akses ditolak: transfer stok di luar cakupan "%"', perm_scope(10); end if;
  t := _branch_guard(p_from);
  perform _branch_guard(p_to);
  insert into stock_transfers (tenant_id, code, from_branch, to_branch, lines)
  values (t, 'STO-' || to_char(now(), 'YYMMDD-HH24MISS'), p_from, p_to, p_lines) returning * into s;
  select coalesce(sum((l->>'qty')::numeric * i.cost_per_unit), 0) into tot
  from jsonb_array_elements(p_lines) l join inventory_items i on i.id = (l->>'item_id')::uuid;
  insert into approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail, requested_by)
  values (t, p_to, 10, 'sto', s.code, 'Transfer stok ke ' || (select name from branches where id = p_to), tot,
          jsonb_build_object('sto_id', s.id), auth.uid());
  return s;
end $$;

create or replace function public.advance_sto(p_sto uuid) returns stock_transfers
language plpgsql security definer set search_path = public as $$
declare s stock_transfers; l jsonb;
begin
  perform _need(10, 'u');
  if perm_scope(10) is not null then raise exception 'Akses ditolak'; end if;
  select * into s from stock_transfers where id = p_sto for update;
  if not found or not tenant_ok(s.tenant_id) then raise exception 'STO tidak ditemukan'; end if;
  if s.status = 'approved' then
    for l in select * from jsonb_array_elements(s.lines) loop
      perform _move(s.tenant_id, s.from_branch, (l->>'item_id')::uuid, -(l->>'qty')::numeric, 'transfer_out', s.code);
    end loop;
    update stock_transfers set status = 'in_transit' where id = s.id returning * into s;
  elsif s.status = 'in_transit' then
    for l in select * from jsonb_array_elements(s.lines) loop
      perform _move(s.tenant_id, s.to_branch, (l->>'item_id')::uuid, (l->>'qty')::numeric, 'transfer_in', s.code);
    end loop;
    update stock_transfers set status = 'received' where id = s.id returning * into s;
  else
    raise exception 'STO berstatus % tidak bisa dilanjutkan', s.status;
  end if;
  return s;
end $$;

-- counts: [{"item_id":"...","counted":12.5}]
create or replace function public.submit_opname(p_branch uuid, p_counts jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); c jsonb; n int := 0;
begin
  perform _need(10, 'c');
  for c in select * from jsonb_array_elements(p_counts) loop
    insert into stock_counts (tenant_id, branch_id, item_id, system_qty, counted_qty)
    values (t, p_branch, (c->>'item_id')::uuid,
            coalesce((select qty from stock_levels where branch_id = p_branch and item_id = (c->>'item_id')::uuid), 0),
            (c->>'counted')::numeric);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.apply_opname(p_ids uuid[], p_apply boolean default true) returns numeric
language plpgsql security definer set search_path = public as $$
declare c stock_counts; cur numeric; delta numeric; val numeric := 0; cost numeric;
begin
  perform _need(10, 'u');
  if perm_scope(10) is not null then raise exception 'Akses ditolak'; end if;
  for c in select * from stock_counts where id = any(p_ids) and status = 'submitted' for update loop
    if not tenant_ok(c.tenant_id) then continue; end if;
    if p_apply then
      select coalesce(qty, 0) into cur from stock_levels where branch_id = c.branch_id and item_id = c.item_id;
      delta := c.counted_qty - coalesce(cur, 0);
      if delta <> 0 then perform _move(c.tenant_id, c.branch_id, c.item_id, delta, 'opname', 'OPNAME', 'Selisih opname'); end if;
      select cost_per_unit into cost from inventory_items where id = c.item_id;
      val := val + delta * cost;
    end if;
    update stock_counts set status = case when p_apply then 'applied' else 'rejected' end, applied_by = auth.uid(), applied_at = now() where id = c.id;
  end loop;
  if val < 0 then
    perform _journal(c.tenant_id, c.branch_id, 'Susut opname', 'opname', null, jsonb_build_array(
      jsonb_build_object('code', '6104', 'dr', -val), jsonb_build_object('code', '1301', 'cr', -val)));
  elsif val > 0 then
    perform _journal(c.tenant_id, c.branch_id, 'Selisih lebih opname', 'opname', null, jsonb_build_array(
      jsonb_build_object('code', '1301', 'dr', val), jsonb_build_object('code', '6104', 'cr', val)));
  end if;
  return round(val);
end $$;

create or replace function public.log_waste(p_branch uuid, p_item uuid, p_qty numeric, p_reason text) returns waste_logs
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); w waste_logs; cost numeric;
begin
  perform _need(10, 'c');
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Alasan wajib diisi'; end if;
  select cost_per_unit * p_qty into cost from inventory_items where id = p_item and tenant_id = t;
  if cost is null then raise exception 'Bahan tidak ditemukan'; end if;
  perform _move(t, p_branch, p_item, -p_qty, 'waste', 'WASTE', p_reason);
  insert into waste_logs (tenant_id, branch_id, item_id, qty, reason, cost) values (t, p_branch, p_item, p_qty, p_reason, round(cost)) returning * into w;
  perform _journal(t, p_branch, 'Waste: ' || p_reason, 'waste', w.id, jsonb_build_array(
    jsonb_build_object('code', '6104', 'dr', round(cost)), jsonb_build_object('code', '1301', 'cr', round(cost))));
  return w;
end $$;

-- Produksi barang setengah jadi (mis. kaldu): potong komponen, tambah stok sub-item.
create or replace function public.produce_semi(p_branch uuid, p_item uuid, p_batches numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); bl record; yield numeric := 0; cost numeric := 0;
begin
  perform _need(10, 'u');
  if perm_scope(10) is not null then raise exception 'Akses ditolak'; end if;
  for bl in select b.*, i.cost_per_unit from bom_lines b join inventory_items i on i.id = b.component_id where b.parent_item_id = p_item loop
    perform _move(t, p_branch, bl.component_id, -(bl.qty * p_batches), 'production', 'PROD');
    yield := bl.yield_qty * p_batches;
    cost := cost + bl.qty * p_batches * bl.cost_per_unit;
  end loop;
  if yield = 0 then raise exception 'Sub-resep belum punya komponen'; end if;
  perform _move(t, p_branch, p_item, yield, 'production', 'PROD');
  update inventory_items set cost_per_unit = cost / yield where id = p_item;
  return yield;
end $$;

-- ═════════ Fitur 12 · Kas kecil ═════════
create or replace function public.validate_petty(p_id uuid, p_ok boolean) returns petty_cash
language plpgsql security definer set search_path = public as $$
declare p petty_cash;
begin
  perform _need(12, 'u');
  select * into p from petty_cash where id = p_id for update;
  if not found or not tenant_ok(p.tenant_id) or p.status <> 'submitted' then raise exception 'Pengajuan tidak ditemukan'; end if;
  update petty_cash set status = case when p_ok then 'validated' else 'rejected' end, validated_by = auth.uid(), validated_at = now()
  where id = p_id returning * into p;
  if p_ok then
    perform _journal(p.tenant_id, p.branch_id, 'Kas kecil: ' || p.description, 'petty', p.id, jsonb_build_array(
      jsonb_build_object('code', '6105', 'dr', p.amount), jsonb_build_object('code', '1101', 'cr', p.amount)));
  end if;
  return p;
end $$;

-- ═════════ Fitur 13 · Absensi GPS geofencing ═════════
create or replace function public.clock(p_kind text, p_lat double precision, p_lng double precision) returns attendance
language plpgsql security definer set search_path = public as $$
declare me profiles; b branches; d numeric; a attendance;
begin
  perform _need(13, 'c');
  select * into me from profiles where id = auth.uid();
  select * into b from branches where id = me.branch_id;
  if b.id is null or b.lat is null then raise exception 'Akun belum ditautkan ke cabang dengan koordinat'; end if;
  d := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - b.lat) / 2), 2)
       + cos(radians(b.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - b.lng) / 2), 2)));
  if d > b.geofence_m then raise exception 'Anda berada % m dari %, di luar radius %m', round(d), b.name, b.geofence_m; end if;
  insert into attendance (tenant_id, branch_id, profile_id, kind, lat, lng, distance_m)
  values (me.tenant_id, b.id, me.id, p_kind, p_lat, p_lng, round(d)) returning * into a;
  return a;
end $$;

-- ═════════ Fitur 14 · Payroll ═════════
create or replace function public.create_payroll_run(p_period date) returns payroll_runs
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r payroll_runs;
begin
  perform _need(14, 'c');
  if t is null then raise exception 'Payroll dibuat dari akun tenant'; end if;
  insert into payroll_runs (tenant_id, period) values (t, date_trunc('month', p_period)::date) returning * into r;
  insert into payroll_lines (tenant_id, run_id, profile_id, base)
  select t, r.id, id, base_salary from profiles where tenant_id = t and role in ('gm', 'staff', 'dokter');
  return r;
exception when unique_violation then raise exception 'Payroll periode ini sudah ada';
end $$;

create or replace function public.submit_payroll(p_run uuid) returns payroll_runs
language plpgsql security definer set search_path = public as $$
declare r payroll_runs; tot numeric; n int;
begin
  perform _need(14, 'u');
  select * into r from payroll_runs where id = p_run for update;
  if not found or not tenant_ok(r.tenant_id) or r.status not in ('draft', 'rejected') then raise exception 'Payroll tidak bisa diajukan'; end if;
  select coalesce(sum(net), 0), count(*) into tot, n from payroll_lines where run_id = p_run;
  update payroll_runs set status = 'pending', total = tot where id = p_run returning * into r;
  insert into approvals (tenant_id, feature, kind, ref, title, amount, detail, requested_by)
  values (r.tenant_id, 14, 'payroll', 'PAY-' || to_char(r.period, 'YYMM'),
          format('Payroll %s · %s karyawan', to_char(r.period, 'MM/YYYY'), n), tot, jsonb_build_object('run_id', r.id), auth.uid());
  return r;
end $$;

-- ═════════ Fitur 11 · Neraca & arus kas ═════════
create or replace function public.balance_sheet(p_as_of date, p_tenant uuid default null)
returns table (type account_type, code text, name text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := effective_tenant(p_tenant);
begin
  perform _need(11, 'r');
  return query
  with bal as (
    select a.type, a.code, a.name,
      case when a.type in ('asset', 'cogs', 'expense') then sum(l.debit - l.credit) else sum(l.credit - l.debit) end amt
    from accounts a join journal_lines l on l.account_id = a.id
    join journal_entries e on e.id = l.entry_id and e.entry_date <= p_as_of
    where a.tenant_id = t group by a.type, a.code, a.name
  )
  select b.type, b.code, b.name, b.amt from bal b where b.type in ('asset', 'liability', 'equity')
  union all
  select 'equity'::account_type, '3901', 'Laba ditahan (berjalan)',
    coalesce(sum(case when b.type = 'revenue' then b.amt else -b.amt end), 0)
  from bal b where b.type in ('revenue', 'cogs', 'expense')
  order by 2;
end $$;

create or replace function public.cash_flow(p_from date, p_to date, p_tenant uuid default null)
returns table (activity text, source text, inflow numeric, outflow numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := effective_tenant(p_tenant);
begin
  perform _need(11, 'r');
  return query
  select case when e.source in ('pos', 'void', 'expense', 'petty', 'purchase', 'payroll', 'waste') then 'Operasional'
              when e.source = 'investment' then 'Investasi' when e.source = 'financing' then 'Pendanaan' else 'Operasional' end,
         coalesce(e.source, 'manual'), sum(l.debit), sum(l.credit)
  from journal_lines l join journal_entries e on e.id = l.entry_id
  join accounts a on a.id = l.account_id and a.code in ('1101', '1102')
  where e.tenant_id = t and e.entry_date between p_from and p_to
  group by 1, 2 order by 1, 2;
end $$;

-- Jurnal manual (GM/Owner/Superadmin CRUD fitur 11).
create or replace function public.post_manual_journal(p_branch uuid, p_memo text, p_source text, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch);
begin
  perform _need(11, 'c');
  if p_source not in ('manual', 'investment', 'financing', 'expense') then raise exception 'Sumber tidak valid'; end if;
  return _journal(t, p_branch, p_memo, p_source, null, p_lines);
end $$;

-- ═════════ decide_approval v2: menjalankan efek dari setiap jenis persetujuan ═════════
drop function if exists public.decide_approval(uuid, public.approval_status, text, text);
create or replace function public.decide_approval(p_id uuid, p_decision public.approval_status, p_note text default null,
                                                  p_pin text default null, p_option text default null)
returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare a approvals; needs_pin boolean; my_hash text;
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

  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, p_option, p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid()
    where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end where id = (a.detail->>'run_id')::uuid;
    if p_decision = 'approved' then
      perform _journal(a.tenant_id, null, 'Payroll ' || a.ref, 'payroll', (a.detail->>'run_id')::uuid, jsonb_build_array(
        jsonb_build_object('code', '6101', 'dr', a.amount), jsonb_build_object('code', '2103', 'cr', a.amount)));
    end if;
  end if;
  return a;
end $$;

-- Grant: hanya RPC publik; helper berawalan _ tidak bisa dipanggil klien.
revoke execute on function public._acc, public._journal, public._move, public._hermes, public._apply_void,
  public._sync_table, public._branch_guard, public._need from public, anon, authenticated;
grant execute on function public.open_shift, public.shift_report, public.close_shift, public.z_report, public.create_order,
  public.set_item_status, public.toggle_86, public.move_order, public.pay_order, public.request_void, public.submit_po,
  public.receive_po, public.create_sto, public.advance_sto, public.submit_opname, public.apply_opname, public.log_waste,
  public.produce_semi, public.validate_petty, public.clock, public.create_payroll_run, public.submit_payroll,
  public.balance_sheet, public.cash_flow, public.post_manual_journal, public.decide_approval to authenticated;

-- Dashboard: gudang pusat bukan titik penjualan → dikeluarkan dari rincian cabang.
create or replace function public.dashboard_daily(p_from date, p_to date, p_tenant uuid default null, p_branch uuid default null)
returns table (day date, branch_id uuid, branch_name text, orders bigint, revenue numeric, discount numeric, cogs numeric, opex numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(2, 'r') then raise exception 'Akses ditolak: fitur 2'; end if;
  return query
  with days as (select generate_series(p_from, p_to, interval '1 day')::date d),
  sales as (
    select o.paid_at::date d, o.branch_id b, count(*) n, sum(o.total) rev, sum(o.discount) disc, sum(o.cogs) hpp
    from public.orders o
    where o.tenant_id = t and o.status = 'paid' and o.paid_at::date between p_from and p_to
      and (p_branch is null or o.branch_id = p_branch)
    group by 1, 2
  ),
  costs as (
    select e.entry_date d, e.branch_id b, sum(l.debit - l.credit) amt
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
    join public.accounts a on a.id = l.account_id and a.type = 'expense'
    where e.tenant_id = t and e.entry_date between p_from and p_to
      and (p_branch is null or e.branch_id = p_branch)
    group by 1, 2
  )
  select days.d, br.id, br.name,
         coalesce(s.n, 0), coalesce(s.rev, 0), coalesce(s.disc, 0), coalesce(s.hpp, 0), coalesce(c.amt, 0)
  from days
  cross join public.branches br
  left join sales s on s.d = days.d and s.b = br.id
  left join costs c on c.d = days.d and c.b = br.id
  where br.tenant_id = t and not br.is_warehouse and (p_branch is null or br.id = p_branch)
  order by 1, 3;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000007_clinic.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 3: klinik (RME, odontogram, ICD, e-resep, SATUSEHAT), reservasi & antrean, CRM.
-- Tabel dipetakan ke fitur matriks ASLI: 15 CRM, 17 Rekam Medis & SATUSEHAT, 18 Reservasi & Antrean.

-- ───────── Kolom tambahan pada tabel yang sudah ada ─────────
alter table public.products add column if not exists icd9_code text;          -- tarif tindakan ↔ kode ICD-9-CM
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.products'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%station%';
  if c is not null then execute format('alter table public.products drop constraint %I', c); end if;
end $$;
alter table public.products add constraint products_station_check check (station in ('dapur', 'barista', 'grill', 'pastry', 'klinik', 'farmasi'));

alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists practitioner_id uuid references public.profiles(id);
alter table public.orders add column if not exists visit_id uuid;

alter table public.profiles add column if not exists commission_rate numeric(5,4) not null default 0 check (commission_rate between 0 and 1);
alter table public.profiles add column if not exists nik text;                 -- NIK nakes, untuk lookup Practitioner SATUSEHAT
alter table public.profiles add column if not exists satusehat_ihs text;

alter table public.branches add column if not exists satusehat_location_id text;
alter table public.tenant_integrations add column if not exists satusehat_enabled boolean not null default false;
alter table public.tenant_integrations add column if not exists satusehat_org_id text;   -- ID Organization dari SATUSEHAT
alter table public.tenant_integrations add column if not exists satusehat_env text not null default 'sandbox' check (satusehat_env in ('sandbox', 'production'));

-- ───────── Validasi NIK (16 digit, kode provinsi, tanggal lahir DDMMYY, perempuan DD+40) ─────────
create or replace function public.valid_nik(p text) returns boolean language plpgsql immutable as $$
declare dd int; mm int;
begin
  if p is null or p !~ '^\d{16}$' then return false; end if;
  if substr(p, 1, 2)::int not between 11 and 94 then return false; end if;
  dd := substr(p, 7, 2)::int; mm := substr(p, 9, 2)::int;
  if dd > 40 then dd := dd - 40; end if;
  return mm between 1 and 12 and dd between 1 and 31 and substr(p, 13, 4)::int > 0;
end $$;

-- ───────── Referensi ICD (diisi dari src/lib/icd.js lewat seed) ─────────
create table public.icd_codes (
  system text not null check (system in ('icd10', 'icd9cm')),
  code text not null,
  display text not null,
  label_id text,
  primary key (system, code)
);

-- ═════════ Fitur 15 · CRM & poin loyalitas ═════════
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  name text,
  points int not null default 0 check (points >= 0),
  total_spent numeric(14,2) not null default 0,
  visits int not null default 0,
  last_visit_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

-- ═════════ Fitur 18 · Reservasi meja & antrean ruang tunggu ═════════
create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  kind text not null default 'clinic' check (kind in ('clinic', 'table')),
  queue_no int,
  name text not null check (length(btrim(name)) > 1),
  phone text,
  nik text,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  complaint text,
  party_size int check (party_size between 1 and 50),
  table_id uuid references public.tables(id) on delete set null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('booked', 'waiting', 'called', 'in_exam', 'done', 'cancelled', 'no_show')),
  patient_id uuid,
  visit_id uuid,
  practitioner_id uuid references public.profiles(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- Antrean klinik wajib NIK valid (registrasi SATUSEHAT); reservasi meja wajib jumlah tamu.
  check (kind <> 'clinic' or public.valid_nik(nik)),
  check (kind <> 'table' or party_size is not null)
);
create index on public.queue_entries (branch_id, scheduled_at);

-- ═════════ Fitur 17 · Rekam medis elektronik ═════════
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mrn text not null,                        -- nomor rekam medis
  nik text not null check (public.valid_nik(nik)),
  name text not null,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  phone text,
  address text,
  allergies text,                           -- riwayat alergi (wajib ditanya di kunjungan pertama)
  satusehat_ihs text,                       -- ID Patient SATUSEHAT setelah lookup NIK
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, nik),
  unique (tenant_id, mrn)
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  practitioner_id uuid references public.profiles(id),
  queue_id uuid references public.queue_entries(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'closed', 'cancelled')),
  arrived_at timestamptz,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  subjective text,      -- S: keluhan & anamnesis
  objective text,       -- O: pemeriksaan
  assessment text,      -- A: penilaian
  plan text,            -- P: rencana
  vitals jsonb not null default '{}',
  order_id uuid references public.orders(id) on delete set null
);
create index on public.visits (patient_id, started_at desc);

create table public.odontogram_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  tooth smallint not null check (
    (tooth / 10 between 1 and 4 and tooth % 10 between 1 and 8) or (tooth / 10 between 5 and 8 and tooth % 10 between 1 and 5)),
  surfaces text[] not null default '{}' check (surfaces <@ array['M', 'D', 'O', 'I', 'V', 'L']),
  condition text not null check (condition in ('car', 'amf', 'cof', 'fis', 'sou', 'nvt', 'rct', 'poc', 'ipx', 'prd', 'mis', 'rrx', 'cfr', 'une', 'pre')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.odontogram_entries (patient_id, created_at);

create table public.visit_diagnoses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  system text not null default 'icd10' check (system = 'icd10'),
  code text not null,
  display text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (system, code) references public.icd_codes (system, code),
  unique (visit_id, code)
);

create table public.visit_procedures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  system text not null default 'icd9cm' check (system = 'icd9cm'),
  code text not null,
  display text not null,
  tooth smallint,
  product_id uuid references public.products(id) on delete set null,  -- tarif yang ditagihkan (opsional)
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  foreign key (system, code) references public.icd_codes (system, code)
);

-- E-resep: dipisah dari kunjungan agar Kasir (R · Billing Obat) bisa membaca resep tanpa membaca SOAP.
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  patient_name text not null,
  practitioner_name text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'dispensed', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dispensed_at timestamptz
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  qty numeric(10,2) not null check (qty > 0),
  signa text not null check (length(btrim(signa)) > 0),   -- aturan pakai, mis. 3×1 sesudah makan
  days int check (days between 1 and 90),
  created_at timestamptz not null default now()
);

-- Antrean kirim ke SATUSEHAT (HL7 FHIR R4). Diisi saat dokter menutup kunjungan; dikirim Edge Function satusehat-sync.
create table public.satusehat_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'simulated', 'failed')),
  attempts int not null default 0,
  encounter_id text,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.satusehat_outbox (status, created_at);

-- ═════════ RLS ═════════
do $$
declare t text;
begin
  foreach t in array array['icd_codes','customers','queue_entries','patients','visits','odontogram_entries','visit_diagnoses',
                           'visit_procedures','prescriptions','prescription_items','satusehat_outbox']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy icd_read on public.icd_codes for select to authenticated using (true);

-- Fitur 15 · CRM (Staff: RU)
create policy cust_r on public.customers for select using (public.feat_ok(tenant_id, null, 15, 'r'));
create policy cust_c on public.customers for insert with check (public.feat_ok(tenant_id, null, 15, 'c'));
create policy cust_u on public.customers for update using (public.feat_ok(tenant_id, null, 15, 'u'));
create policy cust_d on public.customers for delete using (public.feat_ok(tenant_id, null, 15, 'd'));

-- Fitur 18 · Reservasi & antrean (Staff: CRUD, Dokter: RU)
create policy q_r on public.queue_entries for select using (public.feat_ok(tenant_id, branch_id, 18, 'r'));
create policy q_c on public.queue_entries for insert with check (public.feat_ok(tenant_id, branch_id, 18, 'c'));
create policy q_u on public.queue_entries for update using (public.feat_ok(tenant_id, branch_id, 18, 'u'));
create policy q_d on public.queue_entries for delete using (public.feat_ok(tenant_id, branch_id, 18, 'd'));

-- Fitur 17 · data klinis: baca butuh R tanpa cakupan (Kasir "R (Billing Obat)" TIDAK membaca SOAP/odontogram).
create or replace function public.rme_read(p_tenant uuid, p_branch uuid) returns boolean language sql stable as $$
  select public.feat_ok(p_tenant, p_branch, 17, 'r') and public.perm_scope(17) is null
$$;
-- Tulis data klinis hanya selama kunjungan masih berjalan; setelah ditutup, rekam medis terkunci (jejak tetap di audit_logs).
create or replace function public.visit_open(p_visit uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits where id = p_visit and status = 'in_progress')
$$;

create policy pat_r on public.patients for select using (public.rme_read(tenant_id, null));
create policy pat_c on public.patients for insert with check (public.feat_ok(tenant_id, null, 17, 'c'));
create policy pat_u on public.patients for update using (public.feat_ok(tenant_id, null, 17, 'u'));

create policy vis_r on public.visits for select using (public.rme_read(tenant_id, branch_id));
create policy vis_u on public.visits for update using (public.feat_ok(tenant_id, branch_id, 17, 'u') and status = 'in_progress')
  with check (status = 'in_progress');   -- menutup kunjungan hanya lewat RPC close_visit()

create policy odo_r on public.odontogram_entries for select using (public.rme_read(tenant_id, null));
create policy odo_c on public.odontogram_entries for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy odo_d on public.odontogram_entries for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

create policy dx_r on public.visit_diagnoses for select using (public.rme_read(tenant_id, null));
create policy dx_c on public.visit_diagnoses for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy dx_u on public.visit_diagnoses for update using (public.feat_ok(tenant_id, null, 17, 'u') and public.visit_open(visit_id));
create policy dx_d on public.visit_diagnoses for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

create policy px_r on public.visit_procedures for select using (public.rme_read(tenant_id, null));
create policy px_c on public.visit_procedures for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy px_d on public.visit_procedures for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

-- Resep: semua pemegang R fitur 17 (termasuk Kasir · Billing Obat) boleh membaca.
create policy rx_r on public.prescriptions for select using (public.feat_ok(tenant_id, branch_id, 17, 'r'));
create policy rxi_r on public.prescription_items for select
  using (public.feat_ok(tenant_id, null, 17, 'r') and exists (select 1 from public.prescriptions p where p.id = prescription_id and public.branch_ok(p.branch_id)));
create policy rxi_c on public.prescription_items for insert with check (public.feat_ok(tenant_id, null, 17, 'c')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));
create policy rxi_u on public.prescription_items for update using (public.feat_ok(tenant_id, null, 17, 'u')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));
create policy rxi_d on public.prescription_items for delete using (public.feat_ok(tenant_id, null, 17, 'd')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));

create policy ss_r on public.satusehat_outbox for select using (public.rme_read(tenant_id, null));

-- Jejak audit rekam medis (siapa mengubah apa, kapan).
do $$
declare t text;
begin
  foreach t in array array['patients','visits','odontogram_entries','visit_diagnoses','visit_procedures','prescriptions',
                           'prescription_items','queue_entries','customers']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Nomor antrean harian per cabang & sinkron status meja reservasi.
create or replace function public.queue_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.queue_no is null then
    select coalesce(max(queue_no), 0) + 1 into new.queue_no from queue_entries
    where branch_id = new.branch_id and kind = new.kind and scheduled_at::date = new.scheduled_at::date;
  end if;
  if new.kind = 'clinic' and not coalesce(public.valid_nik(new.nik), false) then
    raise exception 'NIK tidak valid: harus 16 digit dengan kode provinsi dan tanggal lahir yang benar';
  end if;
  if new.kind = 'clinic' and new.birth_date is null then
    new.birth_date := make_date(
      case when substr(new.nik, 11, 2)::int > extract(year from now())::int % 100 then 1900 else 2000 end + substr(new.nik, 11, 2)::int,
      substr(new.nik, 9, 2)::int, substr(new.nik, 7, 2)::int % 40);
    new.sex := coalesce(new.sex, case when substr(new.nik, 7, 2)::int > 40 then 'female' else 'male' end);
  end if;
  return new;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Tanggal lahir di NIK tidak valid';
end $$;
create trigger queue_before before insert or update on public.queue_entries for each row execute function public.queue_before();

create or replace function public.queue_table_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'table' or new.table_id is null then return new; end if;
  if new.status = 'booked' then
    update tables set status = 'reserved' where id = new.table_id and status = 'available';
  elsif new.status in ('waiting', 'cancelled', 'no_show', 'done') then
    update tables set status = 'available' where id = new.table_id and status = 'reserved';
  end if;
  return new;
end $$;
create trigger queue_table_sync after insert or update of status on public.queue_entries for each row execute function public.queue_table_sync();

-- Realtime: antrean & resep ikut berubah di layar Staff/Dokter tanpa muat ulang.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.queue_entries, public.prescriptions, public.satusehat_outbox;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000008_clinic_rpc.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 3: RPC klinik, CRM, dan penyesuaian pay_order / payroll.
-- Pola sama dengan FASE 2: periksa matriks (has_perm) dulu, baru efek samping sistem.

-- ═════════ Fitur 17 + 18 · Mulai pemeriksaan dari antrean ═════════
-- Registrasi antrean (NIK) oleh Staff (fitur 18). Kartu rekam medis pasien dibuat/ditautkan DI SINI oleh Dokter,
-- karena matriks asli hanya memberi Staff "R (Billing Obat)" pada fitur 17.
create or replace function public.start_visit(p_queue uuid) returns visits
language plpgsql security definer set search_path = public as $$
declare q queue_entries; p patients; v visits; seq int;
begin
  perform _need(17, 'c');
  perform _need(18, 'u');
  select * into q from queue_entries where id = p_queue for update;
  if not found or not tenant_ok(q.tenant_id) or not branch_ok(q.branch_id) then raise exception 'Antrean tidak ditemukan'; end if;
  if q.kind <> 'clinic' then raise exception 'Bukan antrean klinik'; end if;
  if q.status not in ('waiting', 'called') then raise exception 'Pasien berstatus % tidak bisa diperiksa', q.status; end if;
  if exists (select 1 from visits where practitioner_id = auth.uid() and status = 'in_progress') and current_app_role() = 'dokter' then
    raise exception 'Tutup dulu kunjungan yang sedang berjalan';
  end if;

  select * into p from patients where tenant_id = q.tenant_id and nik = q.nik;
  if not found then
    select count(*) + 1 into seq from patients where tenant_id = q.tenant_id;
    insert into patients (tenant_id, mrn, nik, name, birth_date, sex, phone)
    values (q.tenant_id, 'RM-' || lpad(seq::text, 6, '0'), q.nik, q.name, q.birth_date, q.sex, q.phone)
    returning * into p;
  end if;

  insert into visits (tenant_id, branch_id, patient_id, practitioner_id, queue_id, arrived_at, subjective)
  values (q.tenant_id, q.branch_id, p.id, auth.uid(), q.id, q.created_at, nullif(btrim(q.complaint), ''))
  returning * into v;
  insert into prescriptions (tenant_id, branch_id, visit_id, patient_name, practitioner_name)
  values (q.tenant_id, q.branch_id, v.id, p.name, (select full_name from profiles where id = auth.uid()));
  update queue_entries set status = 'in_exam', patient_id = p.id, visit_id = v.id, practitioner_id = auth.uid() where id = q.id;
  return v;
end $$;

-- ═════════ FHIR R4 Bundle untuk SATUSEHAT (struktur sama dengan src/lib/clinic.js) ═════════
create or replace function public._fhir_bundle(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v visits; p patients; doc profiles; br branches; org text; enc text; subj jsonb; entries jsonb := '[]';
begin
  select * into v from visits where id = p_visit;
  select * into p from patients where id = v.patient_id;
  select * into doc from profiles where id = v.practitioner_id;
  select * into br from branches where id = v.branch_id;
  select coalesce(satusehat_org_id, 'ORG-BELUM-DIATUR') into org from tenant_integrations where tenant_id = v.tenant_id;
  org := coalesce(org, 'ORG-BELUM-DIATUR');
  enc := 'urn:uuid:' || v.id;   -- fullUrl wajib URN UUID murni (RFC 4122)
  subj := jsonb_build_object('reference', 'Patient/' || coalesce(p.satusehat_ihs, 'NIK:' || p.nik), 'display', p.name);

  entries := entries || jsonb_build_array(jsonb_build_object(
    'fullUrl', enc,
    'resource', jsonb_build_object(
      'resourceType', 'Encounter',
      'identifier', jsonb_build_array(jsonb_build_object('system', 'http://sys-ids.kemkes.go.id/encounter/' || org, 'value', v.id)),
      'status', 'finished',
      'class', jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-ActCode', 'code', 'AMB', 'display', 'ambulatory'),
      'subject', subj,
      'participant', jsonb_build_array(jsonb_build_object(
        'type', jsonb_build_array(jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
          'system', 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', 'code', 'ATND', 'display', 'attender')))),
        'individual', jsonb_build_object('reference', 'Practitioner/' || coalesce(doc.satusehat_ihs, 'NIK:' || doc.nik, 'UNRESOLVED'), 'display', doc.full_name))),
      'period', jsonb_build_object('start', v.started_at, 'end', v.closed_at),
      'location', jsonb_build_array(jsonb_build_object('location', jsonb_build_object(
        'reference', 'Location/' || coalesce(br.satusehat_location_id, 'LOC-BELUM-DIATUR'), 'display', br.name))),
      'diagnosis', coalesce((select jsonb_agg(jsonb_build_object(
          'condition', jsonb_build_object('reference', 'urn:uuid:' || d.id, 'display', d.display),
          'use', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
            'system', 'http://terminology.hl7.org/CodeSystem/diagnosis-role', 'code', 'DD', 'display', 'Discharge diagnosis'))),
          'rank', d.rn) order by d.rn)
        from (select *, row_number() over (order by is_primary desc, created_at) rn from visit_diagnoses where visit_id = v.id) d), '[]'),
      'statusHistory', jsonb_build_array(
        jsonb_build_object('status', 'arrived', 'period', jsonb_build_object('start', coalesce(v.arrived_at, v.started_at), 'end', v.started_at)),
        jsonb_build_object('status', 'in-progress', 'period', jsonb_build_object('start', v.started_at, 'end', v.closed_at)),
        jsonb_build_object('status', 'finished', 'period', jsonb_build_object('start', v.closed_at, 'end', v.closed_at))),
      'serviceProvider', jsonb_build_object('reference', 'Organization/' || org)),
    'request', jsonb_build_object('method', 'POST', 'url', 'Encounter')));

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || d.id,
    'resource', jsonb_build_object(
      'resourceType', 'Condition',
      'clinicalStatus', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
        'system', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'code', 'active', 'display', 'Active'))),
      'category', jsonb_build_array(jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
        'system', 'http://terminology.hl7.org/CodeSystem/condition-category', 'code', 'encounter-diagnosis', 'display', 'Encounter Diagnosis')))),
      'code', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://hl7.org/fhir/sid/icd-10', 'code', d.code, 'display', d.display))),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc)),
    'request', jsonb_build_object('method', 'POST', 'url', 'Condition')) order by d.is_primary desc, d.created_at)
    from visit_diagnoses d where d.visit_id = v.id), '[]');

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || x.id,
    'resource', jsonb_build_object(
      'resourceType', 'Procedure', 'status', 'completed',
      'code', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://hl7.org/fhir/sid/icd-9-cm', 'code', x.code, 'display', x.display))),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc),
      'performedPeriod', jsonb_build_object('start', v.started_at, 'end', v.closed_at))
      || case when x.tooth is not null then jsonb_build_object('bodySite', jsonb_build_array(jsonb_build_object('text', 'Gigi ' || x.tooth || ' (FDI)'))) else '{}' end,
    'request', jsonb_build_object('method', 'POST', 'url', 'Procedure')) order by x.created_at)
    from visit_procedures x where x.visit_id = v.id), '[]');

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || i.id,
    'resource', jsonb_build_object(
      'resourceType', 'MedicationRequest', 'status', 'active', 'intent', 'order',
      'medicationCodeableConcept', jsonb_build_object('text', i.name),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc), 'authoredOn', v.closed_at,
      'dosageInstruction', jsonb_build_array(jsonb_build_object('text', i.signa || coalesce(' selama ' || i.days || ' hari', ''))),
      'dispenseRequest', jsonb_build_object('quantity', jsonb_build_object('value', i.qty))),
    'request', jsonb_build_object('method', 'POST', 'url', 'MedicationRequest')) order by i.created_at)
    from prescription_items i join prescriptions r on r.id = i.prescription_id where r.visit_id = v.id), '[]');

  return jsonb_build_object('resourceType', 'Bundle', 'type', 'transaction', 'entry', entries);
end $$;

-- ═════════ Tutup kunjungan: kunci RME, terbitkan e-resep + tagihan, antre SATUSEHAT ═════════
create or replace function public.close_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; p patients; o orders; rx prescriptions; n_items int := 0; ob uuid; kons products; x record;
begin
  perform _need(17, 'u');
  select * into v from visits where id = p_visit for update;
  if not found or not tenant_ok(v.tenant_id) or not branch_ok(v.branch_id) then raise exception 'Kunjungan tidak ditemukan'; end if;
  if v.status <> 'in_progress' then raise exception 'Kunjungan sudah ditutup'; end if;
  if current_app_role() = 'dokter' and v.practitioner_id <> auth.uid() then raise exception 'Hanya dokter pemeriksa yang bisa menutup kunjungan'; end if;
  if coalesce(btrim(v.subjective), '') = '' or coalesce(btrim(v.assessment), '') = '' then
    raise exception 'Lengkapi SOAP minimal S (anamnesis) dan A (penilaian)';
  end if;
  if not exists (select 1 from visit_diagnoses where visit_id = v.id) then raise exception 'Tambahkan minimal satu diagnosis ICD-10'; end if;
  select * into p from patients where id = v.patient_id;
  select * into rx from prescriptions where visit_id = v.id for update;

  -- Tagihan: konsultasi + tindakan bertarif + obat dari e-resep. Kasir yang menerima pembayaran (fitur 5).
  insert into orders (tenant_id, branch_id, code, status, channel, customer_name, customer_phone, practitioner_id, visit_id)
  values (v.tenant_id, v.branch_id, 'INV-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 3),
          'open', 'clinic', p.name, p.phone, v.practitioner_id, v.id)
  returning * into o;
  select * into kons from products where tenant_id = v.tenant_id and sku = 'KNS-01' and is_available;
  if found then
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, kons.id, kons.name, 1, kons.price, kons.station, 'served');
  end if;
  for x in select pr.id, pr.name, pr.price, pr.station, sum(vp.qty) q from visit_procedures vp join products pr on pr.id = vp.product_id
           where vp.visit_id = v.id and pr.tenant_id = v.tenant_id group by pr.id, pr.name, pr.price, pr.station loop
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, x.id, x.name, x.q, x.price, x.station, 'served');
  end loop;
  for x in select pr.id, pr.name, pr.price, pr.station, ceil(sum(i.qty))::int q from prescription_items i join products pr on pr.id = i.product_id
           where i.prescription_id = rx.id and pr.tenant_id = v.tenant_id group by pr.id, pr.name, pr.price, pr.station loop
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, x.id, x.name, x.q, x.price, x.station, 'served');
    n_items := n_items + 1;
  end loop;
  update orders set subtotal = coalesce((select sum(qty * price) from order_items where order_id = o.id), 0) where id = o.id returning * into o;
  if o.subtotal = 0 then delete from orders where id = o.id; o := null; end if;

  update prescriptions set status = case when n_items > 0 then 'sent' else 'cancelled' end, sent_at = now(), order_id = o.id where id = rx.id;
  update visits set status = 'closed', closed_at = now(), order_id = o.id where id = v.id;
  update queue_entries set status = 'done' where id = v.queue_id;

  -- SATUSEHAT: dikirim saat kunjungan ditutup, tidak menunggu pelunasan (revisi Bab V).
  insert into satusehat_outbox (tenant_id, visit_id, payload) values (v.tenant_id, v.id, _fhir_bundle(v.id)) returning id into ob;
  return jsonb_build_object('visit_id', v.id, 'order_id', o.id, 'order_code', o.code, 'subtotal', coalesce(o.subtotal, 0),
                            'rx_items', n_items, 'outbox_id', ob);
end $$;

create or replace function public.retry_satusehat(p_outbox uuid) returns satusehat_outbox
language plpgsql security definer set search_path = public as $$
declare s satusehat_outbox;
begin
  perform _need(17, 'u');
  update satusehat_outbox set status = 'queued', error = null where id = p_outbox and tenant_ok(tenant_id) and status = 'failed'
  returning * into s;
  if not found then raise exception 'Hanya kiriman yang gagal yang bisa diulang'; end if;
  return s;
end $$;

-- ═════════ Fitur 14 · komisi pribadi (Dokter/Terapis: R Komisi Pribadi) ═════════
create or replace function public.my_commission(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rate numeric; svc numeric; n int;
begin
  perform _need(14, 'r');
  select commission_rate into rate from profiles where id = auth.uid();
  select coalesce(sum(i.qty * i.price), 0), count(distinct o.id) into svc, n
  from orders o join order_items i on i.order_id = o.id join products pr on pr.id = i.product_id
  where o.practitioner_id = auth.uid() and o.status = 'paid' and o.paid_at::date between p_from and p_to
    and pr.category in ('Tindakan', 'Konsultasi');
  return jsonb_build_object('rate', coalesce(rate, 0), 'services', svc, 'orders', n, 'commission', round(svc * coalesce(rate, 0)));
end $$;

create or replace function public.create_payroll_run(p_period date) returns payroll_runs
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r payroll_runs; d0 date := date_trunc('month', p_period)::date;
begin
  perform _need(14, 'c');
  if t is null then raise exception 'Payroll dibuat dari akun tenant'; end if;
  insert into payroll_runs (tenant_id, period) values (t, d0) returning * into r;
  insert into payroll_lines (tenant_id, run_id, profile_id, base, commission)
  select t, r.id, pf.id, pf.base_salary,
         round(pf.commission_rate * coalesce((select sum(i.qty * i.price) from orders o join order_items i on i.order_id = o.id
            join products pr on pr.id = i.product_id
            where o.practitioner_id = pf.id and o.status = 'paid' and pr.category in ('Tindakan', 'Konsultasi')
              and o.paid_at >= d0 and o.paid_at < d0 + interval '1 month'), 0))
  from profiles pf where pf.tenant_id = t and pf.role in ('gm', 'staff', 'dokter');
  return r;
exception when unique_violation then raise exception 'Payroll periode ini sudah ada';
end $$;

-- ═════════ pay_order v3: PB1 hanya untuk F&B; resep tandai diserahkan; poin CRM; struk WhatsApp ═════════
create or replace function public.pay_order(p_order uuid, p_payments jsonb, p_customer_phone text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- PB1 10% hanya untuk makanan/minuman; jasa pelayanan kesehatan medis bukan objek PB1.
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * 0.10) end;
  v_total := o.subtotal + v_tax;
  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000; struk digital diantrekan ke WhatsApp pelanggan lewat Hermes.
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);   -- izinkan kenaikan poin oleh sistem (lihat customers_guard)
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jsonb_build_array(
    jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash),
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp))));
  return o;
end $$;

-- Fitur 15: Staff punya RU, tetapi poin hanya boleh NAIK lewat transaksi lunas (pay_order) atau oleh Owner/GM/Superadmin.
-- Staff tetap bisa menukar (mengurangi) poin dan mengubah nama/catatan.
create or replace function public.customers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.points > old.points and coalesce(current_setting('harumin.sys', true), '') <> '1'
     and coalesce(current_app_role()::text, '') not in ('superadmin', 'owner', 'gm') then
    raise exception 'Poin hanya bertambah lewat transaksi lunas';
  end if;
  if new.total_spent <> old.total_spent or new.visits <> old.visits then
    if coalesce(current_setting('harumin.sys', true), '') <> '1' then raise exception 'Total belanja & kunjungan diisi sistem'; end if;
  end if;
  new.phone := old.phone;   -- nomor = kunci pelanggan
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function public.customers_guard();

-- Hermes: jenis pesan baru + status 'sending' (klaim baris oleh Edge Function hermes-dispatch).
comment on column public.hermes_events.kind is 'z_report | low_stock | void_alert | margin_drop | inquiry | receipt | satusehat';
alter table public.hermes_events drop constraint if exists hermes_events_status_check;
alter table public.hermes_events add constraint hermes_events_status_check check (status in ('queued', 'sending', 'sent', 'failed', 'simulated'));

-- Kredensial SATUSEHAT per tenant dari Supabase Vault (nama secret: satusehat_client_id:<tenant_id>,
-- satusehat_client_secret:<tenant_id>). Hanya service_role (Edge Function) yang boleh memanggil.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $f$
      create or replace function public.satusehat_credentials(p_tenant uuid) returns table (client_id text, client_secret text)
      language sql stable security definer set search_path = public, vault as $q$
        select (select decrypted_secret from vault.decrypted_secrets where name = 'satusehat_client_id:' || p_tenant),
               (select decrypted_secret from vault.decrypted_secrets where name = 'satusehat_client_secret:' || p_tenant)
      $q$;
      revoke execute on function public.satusehat_credentials(uuid) from public, anon, authenticated;
      grant execute on function public.satusehat_credentials(uuid) to service_role;
    $f$;
  end if;
end $$;

revoke execute on function public._fhir_bundle from public, anon, authenticated;
grant execute on function public.start_visit, public.close_visit, public.retry_satusehat, public.my_commission,
  public.create_payroll_run, public.pay_order, public.valid_nik to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000009_icd_codes.sql
-- ══════════════════════════════════════════════════════════════════════
-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari src/lib/icd.js — jangan edit manual.
-- SUBSET ICD-10 & ICD-9-CM (65 kode). Untuk produksi, impor katalog resmi lengkap ke tabel ini.
insert into public.icd_codes (system, code, display, label_id) values
  ('icd10', 'K00.0', 'Anodontia', 'Anodonsia'),
  ('icd10', 'K00.6', 'Disturbances in tooth eruption', 'Gangguan erupsi gigi'),
  ('icd10', 'K01.1', 'Impacted teeth', 'Gigi impaksi'),
  ('icd10', 'K02.0', 'Caries limited to enamel', 'Karies terbatas email'),
  ('icd10', 'K02.1', 'Caries of dentine', 'Karies dentin'),
  ('icd10', 'K02.2', 'Caries of cementum', 'Karies sementum'),
  ('icd10', 'K02.3', 'Arrested dental caries', 'Karies terhenti'),
  ('icd10', 'K02.9', 'Dental caries, unspecified', 'Karies gigi, tidak spesifik'),
  ('icd10', 'K03.0', 'Excessive attrition of teeth', 'Atrisi gigi berlebih'),
  ('icd10', 'K03.1', 'Abrasion of teeth', 'Abrasi gigi'),
  ('icd10', 'K03.2', 'Erosion of teeth', 'Erosi gigi'),
  ('icd10', 'K03.6', 'Deposits [accretions] on teeth', 'Deposit/kalkulus pada gigi'),
  ('icd10', 'K04.0', 'Pulpitis', 'Pulpitis'),
  ('icd10', 'K04.1', 'Necrosis of pulp', 'Nekrosis pulpa'),
  ('icd10', 'K04.4', 'Acute apical periodontitis of pulpal origin', 'Periodontitis apikalis akut'),
  ('icd10', 'K04.5', 'Chronic apical periodontitis', 'Periodontitis apikalis kronis'),
  ('icd10', 'K04.6', 'Periapical abscess with sinus', 'Abses periapikal dengan sinus'),
  ('icd10', 'K04.7', 'Periapical abscess without sinus', 'Abses periapikal tanpa sinus'),
  ('icd10', 'K04.8', 'Radicular cyst', 'Kista radikular'),
  ('icd10', 'K05.0', 'Acute gingivitis', 'Gingivitis akut'),
  ('icd10', 'K05.1', 'Chronic gingivitis', 'Gingivitis kronis'),
  ('icd10', 'K05.2', 'Acute periodontitis', 'Periodontitis akut'),
  ('icd10', 'K05.3', 'Chronic periodontitis', 'Periodontitis kronis'),
  ('icd10', 'K06.0', 'Gingival recession', 'Resesi gingiva'),
  ('icd10', 'K06.1', 'Gingival enlargement', 'Pembesaran gingiva'),
  ('icd10', 'K07.3', 'Anomalies of tooth position', 'Anomali posisi gigi'),
  ('icd10', 'K07.6', 'Temporomandibular joint disorders', 'Gangguan sendi temporomandibular'),
  ('icd10', 'K08.1', 'Loss of teeth due to accident, extraction or local periodontal disease', 'Kehilangan gigi'),
  ('icd10', 'K08.3', 'Retained dental root', 'Sisa akar gigi'),
  ('icd10', 'K12.0', 'Recurrent oral aphthae', 'Stomatitis aftosa rekuren (sariawan)'),
  ('icd10', 'K12.1', 'Other forms of stomatitis', 'Stomatitis lain'),
  ('icd10', 'K13.0', 'Diseases of lips', 'Penyakit bibir'),
  ('icd10', 'S02.5', 'Fracture of tooth', 'Fraktur gigi'),
  ('icd10', 'Z01.2', 'Dental examination', 'Pemeriksaan gigi rutin'),
  ('icd10', 'J00', 'Acute nasopharyngitis [common cold]', 'Common cold'),
  ('icd10', 'J06.9', 'Acute upper respiratory infection, unspecified', 'ISPA, tidak spesifik'),
  ('icd10', 'I10', 'Essential (primary) hypertension', 'Hipertensi esensial'),
  ('icd10', 'E11.9', 'Type 2 diabetes mellitus without complications', 'Diabetes melitus tipe 2 tanpa komplikasi'),
  ('icd10', 'K30', 'Functional dyspepsia', 'Dispepsia fungsional'),
  ('icd10', 'R51', 'Headache', 'Sakit kepala'),
  ('icd10', 'A09.9', 'Gastroenteritis and colitis of unspecified origin', 'Gastroenteritis'),
  ('icd10', 'M54.5', 'Low back pain', 'Nyeri punggung bawah'),
  ('icd10', 'L70.0', 'Acne vulgaris', 'Akne vulgaris'),
  ('icd10', 'L81.1', 'Chloasma', 'Melasma'),
  ('icd9cm', '89.31', 'Dental examination', 'Pemeriksaan gigi'),
  ('icd9cm', '89.7', 'General physical examination', 'Pemeriksaan fisik umum'),
  ('icd9cm', '87.11', 'Full-mouth x-ray of teeth', 'Rontgen gigi seluruh rahang'),
  ('icd9cm', '87.12', 'Other dental x-ray', 'Rontgen gigi (periapikal)'),
  ('icd9cm', '96.54', 'Dental scaling, polishing, and debridement', 'Scaling & polishing'),
  ('icd9cm', '23.01', 'Extraction of deciduous tooth', 'Cabut gigi sulung'),
  ('icd9cm', '23.09', 'Extraction of other tooth', 'Cabut gigi permanen'),
  ('icd9cm', '23.11', 'Removal of residual root', 'Pengambilan sisa akar'),
  ('icd9cm', '23.19', 'Other surgical extraction of tooth', 'Odontektomi / cabut bedah'),
  ('icd9cm', '23.2', 'Restoration of tooth by filling', 'Penambalan gigi'),
  ('icd9cm', '23.3', 'Restoration of tooth by inlay', 'Inlay'),
  ('icd9cm', '23.41', 'Application of crown', 'Pemasangan mahkota'),
  ('icd9cm', '23.42', 'Insertion of fixed bridge', 'Gigi tiruan jembatan cekat'),
  ('icd9cm', '23.43', 'Insertion of removable bridge', 'Gigi tiruan lepasan'),
  ('icd9cm', '23.6', 'Prosthetic dental implant', 'Implan gigi'),
  ('icd9cm', '23.70', 'Root canal, not otherwise specified', 'Perawatan saluran akar'),
  ('icd9cm', '23.71', 'Root canal therapy with irrigation', 'PSA dengan irigasi'),
  ('icd9cm', '23.73', 'Apicoectomy', 'Apikoektomi'),
  ('icd9cm', '24.0', 'Incision of gum or alveolar bone', 'Insisi gusi / drainase abses'),
  ('icd9cm', '24.7', 'Application of orthodontic appliance', 'Pemasangan alat ortodonti'),
  ('icd9cm', '99.29', 'Injection or infusion of other therapeutic or prophylactic substance', 'Injeksi zat terapeutik')
on conflict (system, code) do update set display = excluded.display, label_id = excluded.label_id;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000010_foundation.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 0 (fondasi): pajak per tenant, penugasan cabang, dashboard menghormati cabang GM.
-- Matriks RBAC asli tidak berubah. Pajak = konfigurasi tenant (fitur 1: Superadmin CRUD, Owner R).

-- ═════════ 1 · Pajak penjualan per tenant ═════════
alter table public.tenants add column if not exists tax_label text not null default 'Pajak';
alter table public.tenants add column if not exists tax_rate numeric(5,4) not null default 0
  check (tax_rate >= 0 and tax_rate <= 0.5);
comment on column public.tenants.tax_rate is
  'Tarif pajak penjualan non-klinik, mis. 0.10 = 10%. F&B: PBJT makanan/minuman (maks. 10% per UU 1/2022, tarif riil per Perda). Konfirmasi ke konsultan pajak.';

-- Nilai awal per pilar. Hanya mengisi tenant yang belum pernah diatur (label masih default).
update public.tenants set tax_label = 'PBJT', tax_rate = 0.10 where pillar = 'fnb' and tax_label = 'Pajak';
update public.tenants set tax_label = 'Tanpa pajak', tax_rate = 0 where pillar = 'health' and tax_label = 'Pajak';
update public.tenants set tax_label = 'PPN', tax_rate = 0.11 where pillar = 'retail' and tax_label = 'Pajak';

-- Tenant baru: default pajak mengikuti pilar bila Superadmin belum mengisi (label masih 'Pajak').
create or replace function public.tenant_tax_default() returns trigger language plpgsql as $$
begin
  if new.tax_label = 'Pajak' and new.tax_rate = 0 then
    select l, r into new.tax_label, new.tax_rate from (values
      ('fnb'::pillar, 'PBJT', 0.10), ('health'::pillar, 'Tanpa pajak', 0), ('retail'::pillar, 'PPN', 0.11)) v(p, l, r)
    where v.p = new.pillar;
    new.tax_label := coalesce(new.tax_label, 'Pajak');
    new.tax_rate := coalesce(new.tax_rate, 0);
  end if;
  return new;
end $$;
create trigger tenant_tax_default before insert on public.tenants for each row execute function public.tenant_tax_default();

create or replace function public.tenant_tax_rate(p_tenant uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select tax_rate from tenants where id = p_tenant), 0)
$$;
revoke execute on function public.tenant_tax_rate(uuid) from public, anon;
grant execute on function public.tenant_tax_rate(uuid) to authenticated;

-- Nama akun pajak netral (sebelumnya "Utang Pajak PB1").
update public.accounts set name = 'Utang Pajak Penjualan' where code = '2102' and name = 'Utang Pajak PB1';

-- ═════════ 2 · Penugasan cabang (member_branches) ═════════
-- GM tanpa baris di sini = semua cabang tenant (perilaku lama). GM dengan baris = hanya cabang itu.
-- Staff/Dokter: profiles.branch_id tetap cabang utama; baris tambahan = cabang lain yang boleh dilayani.
create table if not exists public.member_branches (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assigned_by uuid default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (profile_id, branch_id)
);
create index if not exists member_branches_branch on public.member_branches (branch_id);
alter table public.member_branches enable row level security;
-- Baca: setiap orang melihat penugasannya sendiri (termasuk Dokter, yang tidak punya akses fitur 13);
-- pemegang R fitur 13 tanpa cakupan (Owner/GM) melihat semua penugasan tenant. Tulis: hanya lewat set_member_branches().
create policy mb_read on public.member_branches for select using (
  profile_id = auth.uid()
  or (public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null));

create or replace function public.branch_ok(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_app_role()
    when 'superadmin' then true
    when 'owner' then true
    when 'gm' then p_branch is null
      or not exists (select 1 from member_branches where profile_id = auth.uid())
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
    else p_branch is null or p_branch = public.current_branch_id()
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
  end
$$;

-- Owner/Superadmin menugaskan GM, Staff, Dokter. GM hanya menugaskan Staff/Dokter ke cabang yang ia pegang.
create or replace function public.set_member_branches(p_profile uuid, p_branches uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare tgt profiles; me app_role := current_app_role(); b uuid; n int := 0;
begin
  perform _need(13, 'u');
  select * into tgt from profiles where id = p_profile;
  if not found or tgt.tenant_id is null or not tenant_ok(tgt.tenant_id) then raise exception 'Anggota tidak ditemukan'; end if;
  if tgt.role in ('superadmin', 'owner') then raise exception 'Owner/Superadmin tidak dibatasi cabang'; end if;
  if me = 'gm' and tgt.role = 'gm' then raise exception 'GM tidak dapat mengatur cabang GM lain'; end if;
  if me not in ('superadmin', 'owner', 'gm') then raise exception 'Akses ditolak'; end if;
  foreach b in array coalesce(p_branches, '{}') loop
    if not exists (select 1 from branches where id = b and tenant_id = tgt.tenant_id) then raise exception 'Cabang bukan milik tenant ini'; end if;
    if not branch_ok(b) then raise exception 'Anda tidak memegang cabang tersebut'; end if;
  end loop;
  -- GM hanya mengganti penugasan di cabang yang ia pegang; penugasan Owner di cabang lain tetap utuh.
  delete from member_branches where profile_id = p_profile and (me <> 'gm' or branch_ok(branch_id));
  insert into member_branches (profile_id, branch_id, tenant_id)
  select p_profile, x, tgt.tenant_id from unnest(coalesce(p_branches, '{}')) x
  on conflict do nothing;
  select count(*) into n from member_branches where profile_id = p_profile;
  if tgt.role in ('staff', 'dokter') then
    if n = 0 then raise exception 'Staff/Dokter wajib punya minimal satu cabang'; end if;
    -- Cabang utama: pilihan pertama bila ada; bila cabang utama lama tidak lagi ditugaskan, pindah ke salah satu penugasan.
    update profiles set branch_id = coalesce(p_branches[1],
        case when exists (select 1 from member_branches where profile_id = p_profile and branch_id = tgt.branch_id) then tgt.branch_id end,
        (select branch_id from member_branches where profile_id = p_profile order by assigned_at limit 1))
    where id = p_profile;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (tgt.tenant_id, auth.uid(), me, 'update', 'member_branches', p_profile::text, jsonb_build_object('branches', p_branches));
  return n;
end $$;
revoke execute on function public.set_member_branches(uuid, uuid[]) from public, anon;
grant execute on function public.set_member_branches(uuid, uuid[]) to authenticated;

-- ═════════ 3 · pay_order v4: tarif pajak dari tenant ═════════
create or replace function public.pay_order(p_order uuid, p_payments jsonb, p_customer_phone text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Tarif & nama pajak dari pengaturan tenant (Fase 0). Tagihan klinik (jasa kesehatan medis) selalu tanpa pajak.
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * public.tenant_tax_rate(o.tenant_id)) end;
  v_total := o.subtotal + v_tax;
  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000; struk digital diantrekan ke WhatsApp pelanggan lewat Hermes.
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);   -- izinkan kenaikan poin oleh sistem (lihat customers_guard)
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jsonb_build_array(
    jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash),
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp))));
  return o;
end $$;

-- ═════════ 4 · dashboard_daily: hormati cabang GM ═════════
create or replace function public.dashboard_daily(p_from date, p_to date, p_tenant uuid default null, p_branch uuid default null)
returns table (day date, branch_id uuid, branch_name text, orders bigint, revenue numeric, discount numeric, cogs numeric, opex numeric)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := public.effective_tenant(p_tenant);
begin
  if not public.has_perm(2, 'r') then raise exception 'Akses ditolak: fitur 2'; end if;
  return query
  with days as (select generate_series(p_from, p_to, interval '1 day')::date d),
  sales as (
    select o.paid_at::date d, o.branch_id b, count(*) n, sum(o.total) rev, sum(o.discount) disc, sum(o.cogs) hpp
    from public.orders o
    where o.tenant_id = t and o.status = 'paid' and o.paid_at::date between p_from and p_to
      and (p_branch is null or o.branch_id = p_branch)
    group by 1, 2
  ),
  costs as (
    select e.entry_date d, e.branch_id b, sum(l.debit - l.credit) amt
    from public.journal_entries e
    join public.journal_lines l on l.entry_id = e.id
    join public.accounts a on a.id = l.account_id and a.type = 'expense'
    where e.tenant_id = t and e.entry_date between p_from and p_to
      and (p_branch is null or e.branch_id = p_branch)
    group by 1, 2
  )
  select days.d, br.id, br.name,
         coalesce(s.n, 0), coalesce(s.rev, 0), coalesce(s.disc, 0), coalesce(s.hpp, 0), coalesce(c.amt, 0)
  from days
  cross join public.branches br
  left join sales s on s.d = days.d and s.b = br.id
  left join costs c on c.d = days.d and c.b = br.id
  where br.tenant_id = t and not br.is_warehouse and (p_branch is null or br.id = p_branch)
    and public.branch_ok(br.id)   -- GM yang dibatasi cabang hanya melihat cabangnya
  order by 1, 3;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000011_access.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 1 — Layanan & Akses
-- Matriks RBAC asli TIDAK berubah. Semua aturan di bawah mempersempit atau menegakkan hierarki di atas matriks:
--   Superadmin → mengelola Owner (fitur 1) · Owner → GM/Staf/Dokter (fitur 13) · GM → Staf/Dokter di cabangnya (fitur 13).
-- Tiket CS memakai lapisan platform di luar 20 fitur (keputusan K1 dokumen brainstorm).

-- ═════════ 1 · Siklus hidup akun & tenant ═════════
alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid,
  add column if not exists deactivation_reason text,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists phone text;
alter table public.tenants
  add column if not exists suspended_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists status_before_suspend public.tenant_status,
  add column if not exists timezone text not null default 'Asia/Makassar';

-- Akun nonaktif atau tenant ditangguhkan → peran "hilang" → has_perm() false → RLS menolak semuanya seketika.
-- (JWT tetap berlaku hingga kedaluwarsa, tetapi tidak ada data yang bisa dibaca/ditulis.)
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.tenant_id from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.branch_id from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' and is_active from public.profiles where id = auth.uid()), false)
$$;

-- Status akses untuk klien: alasan yang bisa ditampilkan saat login ditolak.
create or replace function public.my_access_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null then jsonb_build_object('ok', false, 'code', 'missing', 'reason', 'Akun tidak ditemukan.')
    when not p.is_active then jsonb_build_object('ok', false, 'code', 'deactivated', 'reason', coalesce(p.deactivation_reason, 'Akun dinonaktifkan.'))
    when p.role <> 'superadmin' and t.status = 'suspended' then jsonb_build_object('ok', false, 'code', 'suspended', 'reason', coalesce(t.suspended_reason, 'Langganan tenant ditangguhkan.'))
    else jsonb_build_object('ok', true) end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join public.tenants t on t.id = p.tenant_id
$$;

-- Audit: denyut presence tidak dicatat sebagai perubahan profil.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  t_id uuid;
begin
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'last_seen_at' - 'last_login_at') = (to_jsonb(old) - 'last_seen_at' - 'last_login_at') then
    return new;
  end if;
  t_id := case when rec ? 'tenant_id' then (rec->>'tenant_id')::uuid
               when tg_table_name = 'tenants' then (rec->>'id')::uuid end;
  rec := rec - 'pin_hash'; -- jangan pernah salin hash PIN ke log
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t_id, auth.uid(), public.current_app_role(), lower(tg_op), tg_table_name, rec->>'id',
          case when tg_op = 'UPDATE' then jsonb_build_object('after', rec) else rec end);
  return coalesce(new, old);
end $$;

-- ═════════ 2 · Penjaga hierarki & kolom sensitif pada profiles ═════════
-- Kolom di bawah hanya boleh berubah lewat fungsi sistem (yang menyalakan harumin.rpc), bukan UPDATE langsung.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me public.app_role := public.current_app_role();
  via_rpc boolean := coalesce(current_setting('harumin.rpc', true), '') = 'on';
begin
  if auth.uid() is null then return new; end if; -- service role / seed
  if tg_op = 'UPDATE' then
    if new.id = auth.uid() and new.role <> old.role then raise exception 'Tidak boleh mengubah peran sendiri'; end if;
    if not via_rpc and (
         new.pin_hash is distinct from old.pin_hash or new.is_active is distinct from old.is_active
      or new.deactivated_at is distinct from old.deactivated_at or new.deactivated_by is distinct from old.deactivated_by
      or new.deactivation_reason is distinct from old.deactivation_reason or new.tenant_id is distinct from old.tenant_id
      or new.email is distinct from old.email or new.last_login_at is distinct from old.last_login_at
      or new.last_seen_at is distinct from old.last_seen_at) then
      raise exception 'Kolom ini hanya dapat diubah lewat fungsi sistem (PIN, status aktif, email, tenant)';
    end if;
    if new.id = auth.uid() and me <> 'superadmin'
       and (new.base_salary is distinct from old.base_salary or new.commission_rate is distinct from old.commission_rate) then
      raise exception 'Gaji dan komisi sendiri tidak dapat diubah';
    end if;
    -- Hierarki: Owner hanya menyentuh GM/Staf/Dokter; GM hanya Staf/Dokter. Diri sendiri hanya data non-sensitif.
    if new.id <> auth.uid() then
      if me = 'owner' and old.role not in ('gm', 'staff', 'dokter') then raise exception 'Owner hanya mengelola GM, Kasir/Staf, dan Dokter'; end if;
      if me = 'gm' and old.role not in ('staff', 'dokter') then raise exception 'GM hanya mengelola Kasir/Staf dan Dokter'; end if;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.role <> old.role) then
    if me <> 'superadmin' and new.role in ('superadmin', 'owner') then
      raise exception 'Hanya Superadmin yang dapat menetapkan peran %', new.role;
    end if;
    if me = 'gm' and new.role = 'gm' then raise exception 'GM tidak dapat mengangkat GM lain'; end if;
  end if;
  return new;
end $$;

-- Akun dibuat lewat undangan (Edge Function dengan service role) dan dinonaktifkan, bukan dihapus.
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create or replace function public.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

-- Presence: dipanggil klien saat masuk (p_login = true) dan berkala. Mencatat login ke audit dan menandai undangan diterima.
create or replace function public.touch_presence(p_login boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then return; end if;
  perform set_config('harumin.rpc', 'on', true);
  update public.profiles set last_seen_at = now(), last_login_at = case when p_login then now() else last_login_at end
    where id = auth.uid() and is_active returning * into me;
  if me.id is null then return; end if;
  if p_login then
    insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (me.tenant_id, me.id, me.role, 'login', 'session', me.id::text, '{}'::jsonb);
    update public.staff_invites set accepted_at = now() where auth_user_id = me.id and accepted_at is null and revoked_at is null;
  end if;
end $$;

-- ═════════ 3 · Undangan akun berjenjang ═════════
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  role public.app_role not null check (role in ('owner', 'gm', 'staff', 'dokter')),
  branch_ids uuid[] not null default '{}',
  invited_by uuid references public.profiles(id) on delete set null default auth.uid(),
  auth_user_id uuid,
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '48 hours',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists staff_invites_open on public.staff_invites (tenant_id, lower(email)) where accepted_at is null and revoked_at is null;
alter table public.staff_invites enable row level security;
-- Superadmin melihat semua; Owner melihat undangan GM/Staf/Dokter tenantnya; GM hanya Staf/Dokter di cabang yang ia pegang.
create policy invites_read on public.staff_invites for select using (
  public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null and (
    public.is_superadmin()
    or (public.current_app_role() = 'owner' and role <> 'owner')
    or (public.current_app_role() = 'gm' and role in ('staff', 'dokter')
        and exists (select 1 from unnest(branch_ids) b where public.branch_ok(b)))));

-- Boleh tidaknya peran pemanggil mengelola akun berperan p_role dengan cabang p_branches.
create or replace function public._can_manage(p_role public.app_role, p_branches uuid[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return case public.current_app_role()
    when 'superadmin' then p_role = 'owner'
    when 'owner' then p_role in ('gm', 'staff', 'dokter')
    when 'gm' then p_role in ('staff', 'dokter') and cardinality(coalesce(p_branches, '{}')) > 0
                   and not exists (select 1 from unnest(p_branches) b where not public.branch_ok(b))
    else false end;
end $$;

create or replace function public._valid_email(p text) returns boolean language sql immutable as $$
  select p ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and length(p) <= 254
$$;

create or replace function public.create_invite(p_email text, p_full_name text, p_role public.app_role,
  p_branches uuid[] default '{}', p_phone text default null, p_tenant uuid default null) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); t uuid; em text := lower(btrim(p_email)); inv public.staff_invites; pil public.pillar;
begin
  if me is null then raise exception 'Akses ditolak'; end if;
  if me = 'superadmin' then perform _need(1, 'c'); t := p_tenant; else perform _need(13, 'c'); t := public.current_tenant_id(); end if;
  if t is null then raise exception 'Tenant wajib dipilih'; end if;
  if not exists (select 1 from tenants where id = t) then raise exception 'Tenant tidak ditemukan'; end if;
  if not public._can_manage(p_role, p_branches) then
    raise exception 'Peran % tidak dapat mengundang %', me, p_role;
  end if;
  if not public._valid_email(em) then raise exception 'Format email tidak valid'; end if;
  if length(btrim(coalesce(p_full_name, ''))) < 2 then raise exception 'Nama lengkap wajib diisi'; end if;
  if p_phone is not null and p_phone !~ '^\+?[0-9 \-]{8,20}$' then raise exception 'Nomor telepon tidak valid'; end if;
  if exists (select 1 from profiles where lower(email) = em) then raise exception 'Email sudah terdaftar'; end if;
  if exists (select 1 from staff_invites where tenant_id = t and lower(email) = em and accepted_at is null and revoked_at is null) then
    raise exception 'Undangan untuk email ini masih aktif — kirim ulang atau cabut dulu';
  end if;
  select pillar into pil from tenants where id = t;
  if p_role = 'dokter' and pil <> 'health' then raise exception 'Peran Dokter hanya untuk tenant layanan kesehatan'; end if;
  if p_role in ('staff', 'dokter') and cardinality(coalesce(p_branches, '{}')) = 0 then raise exception 'Pilih minimal satu cabang'; end if;
  if exists (select 1 from unnest(coalesce(p_branches, '{}')) b where not exists (select 1 from branches where id = b and tenant_id = t)) then
    raise exception 'Cabang bukan milik tenant ini';
  end if;
  insert into staff_invites (tenant_id, email, full_name, phone, role, branch_ids)
  values (t, em, btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''), p_role, case when p_role = 'owner' then '{}' else coalesce(p_branches, '{}') end)
  returning * into inv;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), me, 'invite', 'staff_invites', inv.id::text, jsonb_build_object('role', p_role, 'email', em, 'branches', inv.branch_ids));
  return inv;
end $$;

-- Dipanggil Edge Function invite-member atas nama pemanggil: memvalidasi wewenang sebelum service role membuat akun Auth.
create or replace function public.prepare_invite_send(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then
    raise exception 'Undangan tidak ditemukan';
  end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima'; end if;
  if inv.revoked_at is not null then raise exception 'Undangan sudah dicabut'; end if;
  if inv.expires_at < now() then raise exception 'Undangan kedaluwarsa — gunakan Kirim ulang'; end if;
  return to_jsonb(inv);
end $$;

create or replace function public.resend_invite(p_id uuid) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then raise exception 'Undangan tidak ditemukan'; end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima'; end if;
  if inv.revoked_at is not null then raise exception 'Undangan sudah dicabut'; end if;
  update staff_invites set expires_at = now() + interval '48 hours', sent_at = null where id = p_id returning * into inv;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (inv.tenant_id, auth.uid(), public.current_app_role(), 'invite_resend', 'staff_invites', inv.id::text, '{}'::jsonb);
  return inv;
end $$;

create or replace function public.revoke_invite(p_id uuid) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then raise exception 'Undangan tidak ditemukan'; end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima — nonaktifkan akunnya'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update staff_invites set revoked_at = now() where id = p_id returning * into inv;
  if inv.auth_user_id is not null then
    update profiles set is_active = false, deactivated_at = now(), deactivated_by = auth.uid(), deactivation_reason = 'Undangan dicabut'
      where id = inv.auth_user_id and last_login_at is null;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (inv.tenant_id, auth.uid(), public.current_app_role(), 'invite_revoke', 'staff_invites', inv.id::text, '{}'::jsonb);
  return inv;
end $$;

-- ═════════ 4 · Nonaktifkan / aktifkan akun, reset PIN ═════════
create or replace function public.set_member_active(p_profile uuid, p_active boolean, p_reason text default null) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); tgt public.profiles;
begin
  if me is null then raise exception 'Akses ditolak'; end if;
  if me = 'superadmin' then perform _need(1, 'u'); else perform _need(13, 'u'); end if;
  select * into tgt from profiles where id = p_profile for update;
  if not found or tgt.tenant_id is null or not public.tenant_ok(tgt.tenant_id) then raise exception 'Anggota tidak ditemukan'; end if;
  if tgt.id = auth.uid() then raise exception 'Tidak dapat menonaktifkan akun sendiri'; end if;
  if not (case me
      when 'superadmin' then tgt.role = 'owner'
      when 'owner' then tgt.role in ('gm', 'staff', 'dokter')
      when 'gm' then tgt.role in ('staff', 'dokter') and (public.branch_ok(tgt.branch_id)
                     or exists (select 1 from member_branches m where m.profile_id = tgt.id and public.branch_ok(m.branch_id)))
      else false end) then
    raise exception 'Anda tidak berwenang mengubah status akun ini';
  end if;
  if not p_active then
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Alasan wajib diisi'; end if;
    if exists (select 1 from shifts where cashier_id = tgt.id and status = 'open') then
      raise exception 'Akun ini masih punya shift kasir terbuka — tutup shift dulu';
    end if;
  end if;
  perform set_config('harumin.rpc', 'on', true);
  update profiles set is_active = p_active,
    deactivated_at = case when p_active then null else now() end,
    deactivated_by = case when p_active then null else auth.uid() end,
    deactivation_reason = case when p_active then null else btrim(p_reason) end
  where id = p_profile returning * into tgt;
  return tgt;
end $$;

-- Owner mengatur ulang PIN otorisasi GM. PIN baru tidak pernah masuk log.
create or replace function public.reset_member_pin(p_profile uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare tgt public.profiles;
begin
  perform _need(13, 'u');
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat mengatur ulang PIN GM'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  select * into tgt from profiles where id = p_profile;
  if not found or tgt.role <> 'gm' or not public.tenant_ok(tgt.tenant_id) then raise exception 'GM tidak ditemukan'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_profile;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (tgt.tenant_id, auth.uid(), 'owner', 'pin_reset', 'profiles', p_profile::text, '{}'::jsonb);
end $$;

-- ═════════ 5 · Siklus hidup tenant (Superadmin) ═════════
create table if not exists public.tenant_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.tenant_notes enable row level security;
-- Catatan internal CS: hanya Superadmin. Owner tidak pernah melihatnya.
create policy tnotes_r on public.tenant_notes for select using (public.is_superadmin() and public.has_perm(1, 'r'));
create policy tnotes_c on public.tenant_notes for insert with check (public.is_superadmin() and public.has_perm(1, 'c'));

create or replace function public.create_tenant_with_owner(p_name text, p_slug text, p_pillar public.pillar, p_plan uuid,
  p_owner_name text, p_owner_email text, p_owner_phone text default null, p_trial_days int default 14,
  p_branches text[] default array['Cabang Utama']) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid; inv public.staff_invites; b text;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'c');
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Nama usaha wajib diisi'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug hanya huruf kecil, angka, dan tanda hubung'; end if;
  if p_trial_days not between 0 and 90 then raise exception 'Masa uji coba 0–90 hari'; end if;
  if p_plan is not null and not exists (select 1 from plans where id = p_plan) then raise exception 'Paket tidak ditemukan'; end if;
  insert into tenants (name, slug, pillar, status, plan_id, current_period_end, owner_email)
  values (btrim(p_name), p_slug, p_pillar, 'trial', p_plan, current_date + p_trial_days, lower(btrim(p_owner_email)))
  returning id into t;
  foreach b in array coalesce(p_branches, '{}') loop
    if length(btrim(b)) > 0 then insert into branches (tenant_id, name) values (t, btrim(b)); end if;
  end loop;
  inv := public.create_invite(p_owner_email, p_owner_name, 'owner', '{}', p_owner_phone, t);
  return jsonb_build_object('tenant_id', t, 'invite_id', inv.id);
exception when unique_violation then
  raise exception 'Slug atau email sudah dipakai';
end $$;

create or replace function public.set_tenant_suspended(p_tenant uuid, p_suspend boolean, p_reason text default null) returns public.tenants
language plpgsql security definer set search_path = public as $$
declare t public.tenants;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'u');
  select * into t from tenants where id = p_tenant for update;
  if not found then raise exception 'Tenant tidak ditemukan'; end if;
  if p_suspend then
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Alasan penangguhan wajib diisi'; end if;
    if t.status = 'suspended' then raise exception 'Tenant sudah ditangguhkan'; end if;
    update tenants set status_before_suspend = status, status = 'suspended', suspended_reason = btrim(p_reason), suspended_at = now()
      where id = p_tenant returning * into t;
  else
    if t.status <> 'suspended' then raise exception 'Tenant tidak sedang ditangguhkan'; end if;
    update tenants set status = coalesce(status_before_suspend, 'active'), status_before_suspend = null, suspended_reason = null, suspended_at = null
      where id = p_tenant returning * into t;
  end if;
  return t;
end $$;

create or replace function public.extend_trial(p_tenant uuid, p_days int) returns public.tenants
language plpgsql security definer set search_path = public as $$
declare t public.tenants;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'u');
  if p_days not between 1 and 60 then raise exception 'Perpanjangan 1–60 hari'; end if;
  update tenants set current_period_end = greatest(coalesce(current_period_end, current_date), current_date) + p_days
    where id = p_tenant and status in ('trial', 'past_due') returning * into t;
  if not found then raise exception 'Hanya tenant trial atau telat bayar yang dapat diperpanjang'; end if;
  return t;
end $$;

create or replace function public.add_tenant_note(p_tenant uuid, p_body text) returns public.tenant_notes
language plpgsql security definer set search_path = public as $$
declare n public.tenant_notes;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'c');
  insert into tenant_notes (tenant_id, body) values (p_tenant, btrim(p_body)) returning * into n;
  return n;
end $$;

-- ═════════ 6 · Tiket bantuan CS (lapisan platform, di luar matriks) ═════════
create sequence if not exists public.ticket_no;
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'TKT-' || lpad(nextval('public.ticket_no')::text, 4, '0'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null default auth.uid(),
  category text not null check (category in ('Tagihan', 'Teknis', 'Data', 'Integrasi', 'SATUSEHAT', 'Lainnya')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_owner', 'resolved')),
  subject text not null check (length(btrim(subject)) between 3 and 140),
  assigned_to uuid references public.profiles(id) on delete set null,
  sla_due_at timestamptz not null,
  first_response_at timestamptz,
  csat smallint check (csat between 1 and 5),
  csat_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_tenant on public.support_tickets (tenant_id, status);
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  author_role public.app_role not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket on public.ticket_messages (ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
-- Superadmin: semua. Owner: tiket tenantnya. Tulis hanya lewat fungsi di bawah.
create policy tickets_read on public.support_tickets for select using (
  public.is_superadmin() or (public.current_app_role() = 'owner' and tenant_id = public.current_tenant_id()));
-- Pesan internal tidak pernah terlihat Owner.
create policy tmsg_read on public.ticket_messages for select using (
  public.is_superadmin() or (public.current_app_role() = 'owner' and tenant_id = public.current_tenant_id() and not internal));

create or replace function public.open_ticket(p_category text, p_subject text, p_body text) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare t uuid := public.current_tenant_id(); tk public.support_tickets; pr text; hrs int; big boolean;
begin
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat membuat tiket'; end if;
  if length(btrim(coalesce(p_body, ''))) < 5 then raise exception 'Jelaskan kendala Anda (minimal 5 karakter)'; end if;
  select (pl.price_month is null or pl.max_branches >= 99) into big from tenants tn left join plans pl on pl.id = tn.plan_id where tn.id = t;
  -- Prioritas awal: kategori teknis/integrasi lebih tinggi; paket Enterprise naik satu tingkat. SLA respons pertama berjalan dalam jam kalender.
  pr := case when p_category in ('Teknis', 'Integrasi', 'SATUSEHAT') then 'high' else 'normal' end;
  if coalesce(big, false) then pr := case pr when 'high' then 'urgent' else 'high' end; end if;
  hrs := case pr when 'urgent' then 2 when 'high' then 4 when 'normal' then 8 else 24 end;
  insert into support_tickets (tenant_id, category, priority, subject, sla_due_at)
  values (t, p_category, pr, btrim(p_subject), now() + make_interval(hours => hrs)) returning * into tk;
  insert into ticket_messages (ticket_id, tenant_id, author_role, body) values (tk.id, t, 'owner', btrim(p_body));
  return tk;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text, p_internal boolean default false) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); tk public.support_tickets;
begin
  select * into tk from support_tickets where id = p_ticket for update;
  if not found or me is null or not (me = 'superadmin' or (me = 'owner' and tk.tenant_id = public.current_tenant_id())) then raise exception 'Tiket tidak ditemukan'; end if;
  if me not in ('superadmin', 'owner') then raise exception 'Akses ditolak'; end if;
  if length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Pesan kosong'; end if;
  if me = 'owner' and p_internal then raise exception 'Catatan internal hanya untuk tim Harum.in'; end if;
  insert into ticket_messages (ticket_id, tenant_id, author_role, body, internal) values (tk.id, tk.tenant_id, me, btrim(p_body), p_internal);
  if me = 'owner' then
    update support_tickets set status = case when status = 'new' then 'new' else 'in_progress' end, closed_at = null, updated_at = now()
      where id = tk.id returning * into tk;
  elsif not p_internal then
    update support_tickets set first_response_at = coalesce(first_response_at, now()), assigned_to = coalesce(assigned_to, auth.uid()),
      status = case when status in ('new', 'in_progress') then 'waiting_owner' else status end, updated_at = now()
      where id = tk.id returning * into tk;
  else
    update support_tickets set updated_at = now() where id = tk.id returning * into tk;
  end if;
  return tk;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare tk public.support_tickets;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  if p_status not in ('new', 'in_progress', 'waiting_owner', 'resolved') then raise exception 'Status tidak dikenal'; end if;
  update support_tickets set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now(),
    closed_at = case when p_status = 'resolved' then now() else null end
  where id = p_ticket returning * into tk;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  return tk;
end $$;

create or replace function public.rate_ticket(p_ticket uuid, p_score int, p_note text default null) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare tk public.support_tickets;
begin
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat menilai'; end if;
  select * into tk from support_tickets where id = p_ticket and tenant_id = public.current_tenant_id() for update;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  if tk.status <> 'resolved' then raise exception 'Penilaian hanya setelah tiket selesai'; end if;
  if tk.csat is not null then raise exception 'Tiket ini sudah dinilai'; end if;
  if p_score not between 1 and 5 then raise exception 'Nilai 1–5'; end if;
  update support_tickets set csat = p_score, csat_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_ticket returning * into tk;
  return tk;
end $$;

-- Judul tiket tercatat di audit; isi pesan (termasuk catatan internal) sengaja TIDAK dipasang trigger audit.
create trigger support_tickets_audit after insert or update on public.support_tickets for each row execute function public.audit_row();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_tickets, public.ticket_messages;
  end if;
end $$;

-- ═════════ 7 · Monitoring ═════════
-- Superadmin: metrik AGREGAT per tenant (hitungan & GMV; tanpa baris transaksi). Fitur 5 tetap "-" bagi Superadmin pada matriks.
create or replace function public.tenant_health() returns table (
  tenant_id uuid, name text, slug text, pillar public.pillar, status public.tenant_status, plan_name text, plan_price numeric,
  period_end date, created_at timestamptz, suspended_reason text,
  owner_id uuid, owner_name text, owner_email text, owner_active boolean, owner_last_login timestamptz,
  branches int, staff int, orders_7d int, orders_28d int, gmv_28d numeric,
  open_tickets int, unpaid_amount numeric, overdue_invoices int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_superadmin() and public.has_perm(1, 'r')) then raise exception 'Akses ditolak'; end if;
  return query
  select t.id, t.name, t.slug, t.pillar, t.status, pl.name, pl.price_month, t.current_period_end, t.created_at, t.suspended_reason,
    ow.id, ow.full_name, ow.email, ow.is_active, ow.last_login_at,
    (select count(*)::int from branches b where b.tenant_id = t.id and b.name is not null),
    (select count(*)::int from profiles p where p.tenant_id = t.id and p.role in ('gm', 'staff', 'dokter') and p.is_active),
    (select count(*)::int from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '7 days'),
    (select count(*)::int from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '28 days'),
    (select coalesce(sum(o.total), 0) from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '28 days'),
    (select count(*)::int from support_tickets s where s.tenant_id = t.id and s.status <> 'resolved'),
    (select coalesce(sum(i.amount), 0) from invoices i where i.tenant_id = t.id and i.status = 'unpaid'),
    (select count(*)::int from invoices i where i.tenant_id = t.id and i.status = 'unpaid' and i.period < current_date - 7)
  from tenants t
  left join plans pl on pl.id = t.plan_id
  left join lateral (select p.id, p.full_name, p.email, p.is_active, p.last_login_at from profiles p
                     where p.tenant_id = t.id and p.role = 'owner' order by p.is_active desc, p.created_at limit 1) ow on true
  order by t.created_at;
end $$;

-- Siapa bertugas sekarang: shift terbuka + angka berjalan. SECURITY INVOKER → RLS (cabang GM, hak fitur 5) tetap berlaku.
create or replace function public.on_duty(p_branch uuid default null) returns table (
  shift_id uuid, cashier_id uuid, cashier_name text, branch_id uuid, branch_name text, opened_at timestamptz,
  opening_cash numeric, cash_sales numeric, non_cash_sales numeric, orders_paid int, open_orders int, voids int,
  discount_total numeric, pending_void_requests int, last_activity timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.has_perm(5, 'r') or public.current_app_role() not in ('owner', 'gm') then raise exception 'Akses ditolak'; end if;
  return query
  select s.id, s.cashier_id, p.full_name, s.branch_id, b.name, s.opened_at, s.opening_cash, s.cash_sales, s.non_cash_sales,
    (select count(*)::int from orders o where o.shift_id = s.id and o.status = 'paid'),
    (select count(*)::int from orders o where o.cashier_id = s.cashier_id and o.status = 'open' and o.branch_id = s.branch_id),
    (select count(*)::int from orders o where o.shift_id = s.id and o.status = 'void'),
    (select coalesce(sum(o.discount), 0) from orders o where o.shift_id = s.id and o.status = 'paid'),
    (select count(*)::int from approvals a where a.kind = 'void' and a.status = 'pending' and a.requested_by = s.cashier_id),
    greatest(s.opened_at, (select max(coalesce(o.paid_at, o.created_at)) from orders o where o.shift_id = s.id))
  from shifts s
  join profiles p on p.id = s.cashier_id
  join branches b on b.id = s.branch_id
  where s.status = 'open' and s.tenant_id = public.current_tenant_id() and (p_branch is null or s.branch_id = p_branch)
  order by s.opened_at;
end $$;

-- Kartu skor Kasir (transaksi, void, diskon, selisih kas, keterlambatan) dan GM (kecepatan approval).
-- Toleransi terlambat 10 menit dari jadwal shift, memakai zona waktu tenant.
create or replace function public.staff_scorecard(p_from date, p_to date) returns table (
  profile_id uuid, full_name text, role public.app_role, branch_id uuid, is_active boolean,
  shifts int, orders_paid int, revenue numeric, voids int, discount_total numeric, subtotal_total numeric,
  cash_variance numeric, short_shifts int, clock_ins int, late_ins int,
  approvals_decided int, avg_decision_min numeric)
language plpgsql stable security invoker set search_path = public as $$
declare tz text;
begin
  if not public.has_perm(13, 'r') or public.current_app_role() not in ('owner', 'gm') or public.perm_scope(13) is not null then raise exception 'Akses ditolak'; end if;
  select timezone into tz from tenants where id = public.current_tenant_id();
  return query
  select p.id, p.full_name, p.role, p.branch_id, p.is_active,
    (select count(*)::int from shifts s where s.cashier_id = p.id and s.opened_at::date between p_from and p_to),
    (select count(*)::int from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.total), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select count(*)::int from orders o where o.cashier_id = p.id and o.status = 'void' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.discount), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.subtotal), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(s.variance), 0) from shifts s where s.cashier_id = p.id and s.status = 'closed' and s.opened_at::date between p_from and p_to),
    (select count(*)::int from shifts s where s.cashier_id = p.id and s.status = 'closed' and s.variance < 0 and s.opened_at::date between p_from and p_to),
    (select count(*)::int from attendance a where a.profile_id = p.id and a.kind = 'in' and a.created_at::date between p_from and p_to),
    (select count(*)::int from attendance a join work_shifts w on w.profile_id = a.profile_id and w.work_date = (a.created_at at time zone tz)::date
      where a.profile_id = p.id and a.kind = 'in' and a.created_at::date between p_from and p_to
        and (a.created_at at time zone tz)::time > w.start_time + interval '10 minutes'),
    (select count(*)::int from approvals x where x.decided_by = p.id and x.decided_at::date between p_from and p_to),
    (select round(avg(extract(epoch from x.decided_at - x.requested_at) / 60)::numeric, 1) from approvals x where x.decided_by = p.id and x.decided_at::date between p_from and p_to)
  from profiles p
  where p.tenant_id = public.current_tenant_id() and p.role in ('staff', 'gm')
    and (public.current_app_role() = 'owner' or p.role = 'staff')
    and (public.branch_ok(p.branch_id) or exists (select 1 from member_branches m where m.profile_id = p.id and public.branch_ok(m.branch_id)))
  order by p.role, p.full_name;
end $$;

-- ═════════ 8 · Hak eksekusi ═════════
do $$
declare f text;
begin
  foreach f in array array[
    'my_access_state()', 'touch_presence(boolean)', 'create_invite(text,text,app_role,uuid[],text,uuid)', 'prepare_invite_send(uuid)',
    'resend_invite(uuid)', 'revoke_invite(uuid)', 'set_member_active(uuid,boolean,text)', 'reset_member_pin(uuid,text)',
    'create_tenant_with_owner(text,text,pillar,uuid,text,text,text,int,text[])', 'set_tenant_suspended(uuid,boolean,text)',
    'extend_trial(uuid,int)', 'add_tenant_note(uuid,text)', 'open_ticket(text,text,text)', 'reply_ticket(uuid,text,boolean)',
    'set_ticket_status(uuid,text)', 'rate_ticket(uuid,int,text)', 'tenant_health()', 'on_duty(uuid)', 'staff_scorecard(date,date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._can_manage(public.app_role, uuid[]) from public, anon;
grant execute on function public._can_manage(public.app_role, uuid[]) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000012_fase1_policies_approvals_support.sql
-- ══════════════════════════════════════════════════════════════════════
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

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000013_fase1_policy_enforcement.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · FASE 1 (1.4, 1.5, 1.6) — Penegakan Kebijakan Operasional di RPC POS & Persetujuan
-- Menyelesaikan Kriteria 9.3 (Batas Diskon & Otorisasi PIN) dan 9.5 (Validasi Shift Open, Max Void Bebas PIN, Eskalasi Owner).

-- ══════════════════════════════════════════════════════════════════════════════
-- 0. Bersihkan overload fungsi lama agar tidak ambigu di PostgREST
-- ══════════════════════════════════════════════════════════════════════════════
drop function if exists public.pay_order(uuid, jsonb, text);
drop function if exists public.request_void(uuid, text, text);

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Tambah Akun 4102 (Potongan Penjualan / Diskon) pada Helper CoA
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public._acc(p_tenant uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid;
  names jsonb := '{"1101":["Kas","asset"],"1102":["Bank, EDC & QRIS","asset"],"1301":["Persediaan Bahan Baku","asset"],
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


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Penegakan Jam Operasional pada Shift Kasir (open_shift)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  s shifts;
  pol jsonb;
  v_lock boolean;
  v_start time;
  v_end time;
  v_now time := current_time;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;

  -- Evaluasi kebijakan operasional (Lapis 3 -> 2 -> 1)
  pol := get_effective_policy(t, p_branch, current_app_role());
  if pol is not null then
    v_lock := coalesce((pol->>'enforce_shift_lock')::boolean, true);
    if v_lock then
      v_start := (pol->>'operating_hours_start')::time;
      v_end := (pol->>'operating_hours_end')::time;
      if v_start <= v_end then
        if v_now < v_start or v_now > v_end then
          raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %)', v_start, v_end;
        end if;
      else
        -- Rentang operasional melewati tengah malam
        if v_now < v_start and v_now > v_end then
          raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %)', v_start, v_end;
        end if;
      end if;
    end if;
  end if;

  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash)
  values (t, p_branch, auth.uid(), p_opening)
  returning * into s;

  return s;
exception when unique_violation then
  raise exception 'Anda masih punya shift yang terbuka';
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Kriteria 9.3: RPC Penerapan Diskon POS & Otorisasi PIN (apply_order_discount)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.apply_order_discount(
  p_order uuid,
  p_discount numeric,
  p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare
  o orders;
  pol jsonb;
  disc_pct numeric;
  max_disc numeric;
  v_tax numeric;
  v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    disc_pct := round((p_discount / o.subtotal) * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    max_disc := coalesce((pol->>'max_discount_pct')::numeric, 15.00);

    if disc_pct > max_disc then
      -- Membutuhkan PIN otorisasi GM atau Owner
      if p_pin is null or length(btrim(p_pin)) = 0 then
        raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN otorisasi GM/Owner.', disc_pct || '%', max_disc || '%';
      end if;

      if not exists (
        select 1 from profiles
        where tenant_id = o.tenant_id
          and role in ('gm', 'owner', 'superadmin')
          and pin_hash is not null
          and crypt(p_pin, pin_hash) = pin_hash
      ) then
        raise exception 'PIN otorisasi GM/Owner salah';
      end if;
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := round(v_taxable * 0.10);

  update orders set
    discount = p_discount,
    tax = v_tax,
    total = v_taxable + v_tax,
    updated_at = now()
  where id = o.id returning * into o;

  return o;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Kriteria 9.3: Penegakan Diskon & Otorisasi PIN di Pembayaran (pay_order)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.pay_order(
  p_order uuid,
  p_payments jsonb,
  p_customer_phone text default null,
  p_discount numeric default null,
  p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare
  o orders;
  pay jsonb;
  paid numeric := 0;
  cash numeric := 0;
  noncash numeric := 0;
  v_tax numeric;
  v_taxable numeric;
  v_total numeric;
  change numeric;
  hpp numeric := 0;
  bl record;
  lvl numeric;
  it record;
  sid uuid;
  pol jsonb;
  disc_amt numeric;
  disc_pct numeric;
  max_disc numeric;
  jlines jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  disc_amt := coalesce(p_discount, o.discount, 0);
  if disc_amt > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;

  -- Kriteria 9.3: Evaluasi kebijakan diskon
  if disc_amt > 0 and o.subtotal > 0 then
    disc_pct := round((disc_amt / o.subtotal) * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    max_disc := coalesce((pol->>'max_discount_pct')::numeric, 15.00);

    if disc_pct > max_disc then
      if p_pin is null or length(btrim(p_pin)) = 0 then
        raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN otorisasi GM/Owner.', disc_pct || '%', max_disc || '%';
      end if;

      if not exists (
        select 1 from profiles
        where tenant_id = o.tenant_id
          and role in ('gm', 'owner', 'superadmin')
          and pin_hash is not null
          and crypt(p_pin, pin_hash) = pin_hash
      ) then
        raise exception 'PIN otorisasi GM/Owner salah';
      end if;
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - disc_amt);
  v_tax := round(v_taxable * 0.10);          -- PB1 10%
  v_total := v_taxable + v_tax;

  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;

  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  -- Potong stok sesuai resep (BOM) dan hitung HPP riil
  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  update orders set
    status = 'paid', paid_at = now(),
    discount = disc_amt, tax = v_tax, total = v_total,
    cogs = round(hpp), shift_id = sid,
    customer_phone = coalesce(p_customer_phone, customer_phone),
    updated_at = now()
  where id = o.id returning * into o;

  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;

  -- Jurnal Penjualan PSAK Seimbang
  if disc_amt > 0 then
    jlines := jsonb_build_array(
      jsonb_build_object('code', '1101', 'dr', cash),
      jsonb_build_object('code', '1102', 'dr', noncash),
      jsonb_build_object('code', '4102', 'dr', disc_amt),
      jsonb_build_object('code', '4101', 'cr', o.subtotal),
      jsonb_build_object('code', '2102', 'cr', v_tax),
      jsonb_build_object('code', '5101', 'dr', round(hpp)),
      jsonb_build_object('code', '1301', 'cr', round(hpp))
    );
  else
    jlines := jsonb_build_array(
      jsonb_build_object('code', '1101', 'dr', cash),
      jsonb_build_object('code', '1102', 'dr', noncash),
      jsonb_build_object('code', '4101', 'cr', o.subtotal),
      jsonb_build_object('code', '2102', 'cr', v_tax),
      jsonb_build_object('code', '5101', 'dr', round(hpp)),
      jsonb_build_object('code', '1301', 'cr', round(hpp))
    );
  end if;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jlines);

  return o;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Kriteria 9.5: Penyempurnaan request_void (Shift Open, Bebas PIN, Eskalasi Owner)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.request_void(
  p_order uuid,
  p_reason text,
  p_note text,
  p_option text default 'restock'
) returns approvals
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  a approvals;
  pol jsonb;
  max_void numeric;
  is_escalated boolean := false;
  req_title text;
begin
  if not (has_perm(6, 'q') or has_perm(6, 'c')) then raise exception 'Akses ditolak: fitur 6'; end if;
  select * into o from orders where id = p_order;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'paid' then raise exception 'Hanya transaksi lunas yang bisa di-void'; end if;
  if p_reason not in ('Salah Input Kasir', 'Pelanggan Membatalkan', 'Masakan Rusak') then raise exception 'Alasan tidak valid'; end if;

  -- 1. Kriteria 9.5a: Cek shift transaksi masih terbuka
  if not exists (select 1 from shifts where id = o.shift_id and status = 'open') then
    raise exception 'Void hanya dapat dilakukan pada transaksi dalam shift yang masih terbuka';
  end if;

  if exists (select 1 from approvals where kind = 'void' and status = 'pending' and detail->>'order_id' = o.id::text) then
    raise exception 'Permintaan void untuk transaksi ini sudah menunggu';
  end if;

  -- 2. Kriteria 9.5b: Evaluasi max_void_without_pin dari kebijakan 3 lapis
  pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
  max_void := coalesce((pol->>'max_void_without_pin')::numeric, 50000.00);

  if o.total <= max_void then
    -- Transaksi di bawah atau sama dengan batas max_void_without_pin:
    -- Pembatalan langsung dieksekusi tanpa perlu menunggu approval / PIN GM
    perform _apply_void(o.id, coalesce(p_option, 'restock'), coalesce(p_note, p_reason));

    insert into approvals (
      tenant_id, branch_id, feature, kind, ref, title, amount, status, detail,
      requested_by, decided_by, decided_at, decision_note
    ) values (
      o.tenant_id, o.branch_id, 6, 'void', o.code,
      'Void mandiri (dalam batas tanpa PIN) · ' || lower(p_reason),
      o.total, 'approved',
      jsonb_build_object(
        'order_id', o.id, 'alasan', p_reason, 'catatan', p_note,
        'option', coalesce(p_option, 'restock'), 'auto_approved', true,
        'max_void_limit', max_void
      ),
      auth.uid(), auth.uid(), now(),
      'Disetujui otomatis sesuai kebijakan: nominal transaksi (' || _rp(o.total) || ') <= batas tanpa PIN (' || _rp(max_void) || ')'
    ) returning * into a;

    return a;
  end if;

  -- 3. Kriteria 9.5c: Eskalasi ke Owner jika di atas batas kewenangan GM (Rp 500.000 atau GM request)
  if o.total > 500000 or current_app_role() = 'gm' then
    is_escalated := true;
    req_title := 'Void transaksi (Eskalasi Owner) · ' || lower(p_reason);
  else
    req_title := 'Void transaksi · ' || lower(p_reason);
  end if;

  insert into approvals (
    tenant_id, branch_id, feature, kind, ref, title, amount, status, detail, requested_by
  ) values (
    o.tenant_id, o.branch_id, 6, 'void', o.code, req_title, o.total, 'pending',
    jsonb_build_object(
      'order_id', o.id, 'alasan', p_reason, 'catatan', p_note,
      'option', coalesce(p_option, 'restock'),
      'escalated_to_owner', is_escalated,
      'max_void_limit', max_void
    ),
    auth.uid()
  ) returning * into a;

  return a;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Penegakan Wewenang Eskalasi Owner pada decide_approval
-- ══════════════════════════════════════════════════════════════════════════════
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

  -- Cegah GM memutuskan persetujuan yang dieskalasi ke Owner
  if (a.detail->>'escalated_to_owner')::boolean is true and current_app_role() = 'gm' then
    raise exception 'Persetujuan void ini telah dieskalasi ke Owner (melebihi batas kewenangan GM)';
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

  update approvals set
    status = p_decision,
    decided_by = auth.uid(),
    decided_at = now(),
    decision_note = p_note,
    detail = detail || jsonb_build_object('option', p_option)
  where id = p_id returning * into a;

  -- Efek samping keputusan berdasarkan jenis alur bisnis:
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
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (a.tenant_id, auth.uid(), current_app_role(), 'supplies_approval', 'approvals', a.id::text,
            jsonb_build_object('decision', p_decision, 'amount', a.amount, 'note', p_note));
  end if;

  return a;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Grant Hak Eksekusi ke authenticated
-- ══════════════════════════════════════════════════════════════════════════════
grant execute on function public.open_shift to authenticated;
grant execute on function public.apply_order_discount to authenticated;
grant execute on function public.pay_order to authenticated;
grant execute on function public.request_void to authenticated;
grant execute on function public.decide_approval to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000014_fase2_void_policy_fix.sql
-- ══════════════════════════════════════════════════════════════════════
-- Harum.in · Migrasi 14 — PERBAIKAN regresi migrasi 13 + Fase 2.1 (request void → PIN GM → eskalasi Owner)
--
-- Mengapa migrasi baru, bukan menyunting 13: migrasi 13 mungkin sudah terpasang di Supabase; riwayat yang sudah dipasang tidak diubah.
-- Yang diperbaiki (semuanya direproduksi dan diverifikasi di Postgres 16 lokal sebelum migrasi ini ditulis):
--   1. pay_order / apply_order_discount memakai kolom orders.updated_at yang TIDAK ADA  → setiap pembayaran gagal.
--   2. pay_order versi 13 membuang: pajak per tenant (Fase 0.8), nol pajak tagihan klinik, poin CRM (F15), resep "diserahkan",
--      struk WhatsApp, dan normalisasi nomor telepon. Di sini dikembalikan, ditambah diskon berkebijakan.
--   3. open_shift membandingkan jam operasional dengan zona waktu SERVER (UTC di Supabase) → kasir WIB terkunci di pagi hari.
--      Sekarang memakai tenants.timezone, dan kunci shift hanya berlaku bila tenant PUNYA kebijakan tersimpan.
--   4. request_void versi 13 membatalkan nota ≤ Rp50.000 TANPA persetujuan siapa pun — bertentangan dengan kriteria 9.5
--      ("status Menunggu GM", "Kasir tidak bisa membatalkan nota sendiri") dan dengan matriks (void GM = PIN). Dikembalikan ke
--      alur persetujuan; ambang eskalasi Owner kini milik tenant (bukan angka 500000 yang tertulis di kode) + eskalasi karena waktu.
--   5. Verifikasi PIN diskon menerima PIN GM/Owner mana pun di tenant, tanpa jejak. Sekarang: Owner, atau GM yang berhak atas
--      cabang itu, dan siapa yang mengotorisasi dicatat di audit_logs.

-- ══════════════════════════════════════════════════════════════════════════════
-- 0 · Pengaturan tenant: zona waktu & aturan eskalasi void
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.tenants add column if not exists timezone text not null default 'Asia/Jakarta';
alter table public.tenants add column if not exists void_owner_threshold numeric(14,2) not null default 500000 check (void_owner_threshold >= 0);
alter table public.tenants add column if not exists void_escalate_minutes int not null default 30 check (void_escalate_minutes between 1 and 1440);
comment on column public.tenants.timezone is 'Zona waktu IANA tenant (Asia/Jakarta, Asia/Makassar, Asia/Jayapura). Dipakai untuk jam operasional shift.';
comment on column public.tenants.void_owner_threshold is 'Void dengan total di atas nilai ini diputuskan Owner, bukan GM.';
comment on column public.tenants.void_escalate_minutes is 'Void yang belum diputuskan GM setelah sekian menit naik ke Owner.';

create or replace function public._tenant_now(p_tenant uuid) returns timestamp
language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  select timezone into tz from tenants where id = p_tenant;
  return now() at time zone coalesce(tz, 'Asia/Jakarta');
exception when others then            -- nama zona tidak dikenal → jangan memblokir kasir
  return now() at time zone 'Asia/Jakarta';
end $$;
revoke execute on function public._tenant_now(uuid) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1 · Otorisasi PIN (GM cabang / Owner) + jejak audit
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public._pin_authorizer(p_tenant uuid, p_branch uuid, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if p_pin is null or btrim(p_pin) = '' then return null; end if;
  for r in select id, role, pin_hash from profiles
           where tenant_id = p_tenant and role in ('gm', 'owner') and is_active and pin_hash is not null loop
    if crypt(p_pin, r.pin_hash) = r.pin_hash then
      if r.role = 'owner'
         or not exists (select 1 from member_branches where profile_id = r.id)             -- GM tanpa batasan = semua cabang
         or exists (select 1 from member_branches where profile_id = r.id and branch_id = p_branch) then
        return r.id;
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public._pin_authorizer(uuid, uuid, text) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2 · open_shift: jam operasional menurut zona waktu tenant
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  s shifts; pol jsonb; v_start time; v_end time; v_now time := _tenant_now(t)::time; outside boolean;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;

  pol := get_effective_policy(t, p_branch, current_app_role());
  -- layer 0 = belum ada kebijakan tersimpan → tidak ada kunci (perilaku sebelum Fase 1.4)
  if pol is not null and coalesce((pol->>'layer')::int, 0) > 0 and coalesce((pol->>'enforce_shift_lock')::boolean, false) then
    v_start := (pol->>'operating_hours_start')::time;
    v_end := (pol->>'operating_hours_end')::time;
    outside := case when v_start <= v_end then (v_now < v_start or v_now > v_end)
                    else (v_now < v_start and v_now > v_end) end;          -- rentang melewati tengah malam
    if outside then
      raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %, waktu setempat sekarang %)', v_start, v_end, to_char(v_now, 'HH24:MI');
    end if;
  end if;

  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash) values (t, p_branch, auth.uid(), p_opening) returning * into s;
  return s;
exception when unique_violation then
  raise exception 'Anda masih punya shift yang terbuka';
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3 · apply_order_discount (tanpa updated_at, pajak per tenant)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.apply_order_discount(p_order uuid, p_discount numeric, p_pin text default null) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pol jsonb; pct numeric; mx numeric; auth_id uuid; v_tax numeric; v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    pct := round(p_discount / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = p_discount, tax = v_tax, total = v_taxable + v_tax where id = o.id returning * into o;
  return o;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4 · pay_order = migrasi 10 (pajak tenant, klinik, CRM, resep, WhatsApp) + diskon berkebijakan
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.pay_order(
  p_order uuid, p_payments jsonb, p_customer_phone text default null, p_discount numeric default null, p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric; v_taxable numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
        disc numeric; pct numeric; mx numeric; pol jsonb; auth_id uuid; jl jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Diskon: di atas batas efektif (Tenant → Cabang → Peran) wajib PIN GM cabang / Owner
  disc := coalesce(p_discount, o.discount, 0);
  if disc < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if disc > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  if disc > 0 and o.subtotal > 0 then
    pct := round(disc / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  -- Pajak dari pengaturan tenant (Fase 0.8) atas nilai setelah diskon; tagihan klinik selalu tanpa pajak.
  v_taxable := o.subtotal - disc;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  v_total := v_taxable + v_tax;

  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), discount = disc, tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000 dari total yang dibayar; poin hanya naik lewat transaksi (customers_guard).
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  -- Jurnal: diskon dicatat sebagai potongan penjualan (4102) agar pendapatan kotor tetap = subtotal.
  jl := jsonb_build_array(jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash));
  if disc > 0 then jl := jl || jsonb_build_array(jsonb_build_object('code', '4102', 'dr', disc)); end if;
  jl := jl || jsonb_build_array(
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp)));
  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jl);
  return o;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5 · Fitur 6 — request void → PIN GM → eskalasi Owner
-- ══════════════════════════════════════════════════════════════════════════════
-- Eskalasi karena waktu: void milik GM-tidak-bertindak naik ke Owner setelah tenants.void_escalate_minutes.
create or replace function public._escalate_stale(p_tenant uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    select a.id, a.ref, a.amount from approvals a join tenants t on t.id = a.tenant_id
    where a.tenant_id = p_tenant and a.kind = 'void' and a.status = 'pending'
      and coalesce((a.detail->>'escalated_to_owner')::boolean, false) = false
      and a.requested_at < now() - make_interval(mins => t.void_escalate_minutes)
    for update of a skip locked
  loop
    update approvals set detail = detail || jsonb_build_object('escalated_to_owner', true, 'escalated_at', now(), 'escalation_reason', 'timeout'),
           title = replace(title, 'Void transaksi ·', 'Void transaksi (Eskalasi Owner) ·') where id = r.id;
    perform _hermes(p_tenant, 'whatsapp', 'Owner', 'void_alert', format('Void %s (%s) belum diputuskan GM dan naik ke Owner.', r.ref, _rp(r.amount)));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._escalate_stale(uuid) from public, anon, authenticated;

create or replace function public.escalate_stale_approvals() returns int
language plpgsql security definer set search_path = public as $$
begin
  if public.current_tenant_id() is null then return 0; end if;
  return _escalate_stale(public.current_tenant_id());
end $$;
revoke execute on function public.escalate_stale_approvals() from public, anon;
grant execute on function public.escalate_stale_approvals() to authenticated;

create or replace function public.request_void(p_order uuid, p_reason text, p_note text, p_option text default 'restock') returns approvals
language plpgsql security definer set search_path = public as $$
declare o orders; a approvals; pol jsonb; t tenants; esc boolean; why text; me public.app_role := current_app_role();
begin
  if not (has_perm(6, 'q') or has_perm(6, 'c')) then raise exception 'Akses ditolak: fitur 6'; end if;
  select * into o from orders where id = p_order;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'paid' then raise exception 'Hanya transaksi lunas yang bisa di-void'; end if;
  if p_reason not in ('Salah Input Kasir', 'Pelanggan Membatalkan', 'Masakan Rusak') then raise exception 'Alasan tidak valid'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Catatan alasan wajib diisi'; end if;
  if coalesce(p_option, 'restock') not in ('restock', 'waste') then raise exception 'Pilihan stok tidak valid'; end if;
  -- 9.5a · hanya nota milik shift yang masih terbuka
  if not exists (select 1 from shifts where id = o.shift_id and status = 'open') then
    raise exception 'Void hanya dapat diajukan pada transaksi dalam shift yang masih terbuka';
  end if;
  -- 9.5 · kasir hanya boleh mengajukan void untuk nota shift-nya sendiri
  if me = 'staff' and not exists (select 1 from shifts where id = o.shift_id and cashier_id = auth.uid()) then
    raise exception 'Anda hanya dapat mengajukan void untuk transaksi pada shift Anda sendiri';
  end if;
  if exists (select 1 from approvals where kind = 'void' and status = 'pending' and detail->>'order_id' = o.id::text) then
    raise exception 'Permintaan void untuk transaksi ini sudah menunggu';
  end if;

  select * into t from tenants where id = o.tenant_id;
  pol := get_effective_policy(o.tenant_id, o.branch_id, me);
  -- 9.5c · Owner memutuskan bila: nominal melewati ambang tenant, atau pemohonnya GM sendiri (GM tidak menyetujui voidnya sendiri)
  esc := o.total > t.void_owner_threshold or me = 'gm';
  why := case when me = 'gm' then 'diajukan GM' when o.total > t.void_owner_threshold then 'melewati ambang' end;

  insert into approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail, requested_by)
  values (o.tenant_id, o.branch_id, 6, 'void', o.code,
          'Void transaksi' || case when esc then ' (Eskalasi Owner)' else '' end || ' · ' || lower(p_reason), o.total,
          jsonb_build_object('order_id', o.id, 'alasan', p_reason, 'catatan', p_note, 'option', coalesce(p_option, 'restock'),
                             'escalated_to_owner', esc, 'escalation_reason', why, 'owner_threshold', t.void_owner_threshold,
                             'escalate_after_min', t.void_escalate_minutes),
          auth.uid())
  returning * into a;
  perform _hermes(o.tenant_id, 'whatsapp', case when esc then 'Owner' else 'GM' end, 'void_alert',
                  format('Permintaan void %s (%s): %s.', o.code, _rp(o.total), lower(p_reason)));
  return a;
end $$;

-- decide_approval = versi 13 + eskalasi waktu dijalankan lebih dulu + Owner/GM tidak memutuskan void yang dimohonnya sendiri
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
  -- Dihitung dari data, bukan dari penanda tersimpan: raise di bawah me-rollback transaksi ini, jadi penanda yang baru
  -- ditulis oleh _escalate_stale() tidak akan bertahan. Penanda dipersistenkan oleh escalate_stale_approvals() (dipanggil UI).
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
  if a.kind = 'void' and p_decision = 'approved' and coalesce(p_option, a.detail->>'option', '') not in ('restock', 'waste') then
    raise exception 'Pilih: kembalikan bahan ke stok atau catat sebagai waste';
  end if;

  update approvals set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
         detail = detail || jsonb_build_object('option', coalesce(p_option, a.detail->>'option'))
  where id = p_id returning * into a;

  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, a.detail->>'option', p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid() where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end where id = (a.detail->>'run_id')::uuid;
    if p_decision = 'approved' then
      perform _journal(a.tenant_id, null, 'Payroll ' || a.ref, 'payroll', (a.detail->>'run_id')::uuid, jsonb_build_array(
        jsonb_build_object('code', '6101', 'dr', a.amount), jsonb_build_object('code', '2103', 'cr', a.amount)));
    end if;
  elsif a.kind = 'supplies' then
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (a.tenant_id, auth.uid(), current_app_role(), 'supplies_approval', 'approvals', a.id::text,
            jsonb_build_object('decision', p_decision, 'amount', a.amount, 'note', p_note));
  end if;
  return a;
end $$;

grant execute on function public.open_shift(uuid, numeric) to authenticated;
grant execute on function public.apply_order_discount(uuid, numeric, text) to authenticated;
grant execute on function public.pay_order(uuid, jsonb, text, numeric, text) to authenticated;
grant execute on function public.request_void(uuid, text, text, text) to authenticated;
grant execute on function public.decide_approval(uuid, public.approval_status, text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000015_fase2_hardening.sql
-- ══════════════════════════════════════════════════════════════════════
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

  -- Validasi batasan waktu pulang (Clock-out Window) untuk kasir/staf
  if p_kind = 'out' and me.role = 'staff' then
    declare
      ws record;
      v_now_time time := (now() at time zone coalesce(t.timezone, 'Asia/Jakarta'))::time;
      v_early_sec int;
    begin
      select * into ws from work_shifts
       where profile_id = me.id and work_date = tzday
       order by start_time limit 1;
      if ws.id is not null and ws.end_time is not null then
        v_early_sec := extract(epoch from (ws.end_time - v_now_time))::int;
        if v_early_sec > 900 and (p_notes is null or p_notes = '-' or length(btrim(p_notes)) < 5) then
          raise exception 'Belum waktu absen pulang. Shift Anda berakhir pukul %. Silakan absen mendekati jam pulang atau cantumkan alasan izin darurat pada catatan.', to_char(ws.end_time, 'HH24:MI');
        end if;
      end if;
    end;
  end if;

  select * into calc from _att_calc(me.tenant_id, me.id, p_kind, now());
  insert into attendance (tenant_id, branch_id, profile_id, kind, lat, lng, distance_m, accuracy_m, selfie_path, late_min, overtime_min, notes, address)
  values (me.tenant_id, b.id, me.id, p_kind, p_lat, p_lng, round(d), p_accuracy, nullif(btrim(coalesce(p_selfie, '')), ''), calc.late, calc.ot, coalesce(nullif(btrim(p_notes), ''), '-'), nullif(btrim(coalesce(p_address, '')), ''))
  returning * into a;
  return a;
end $$;
grant execute on function public.clock(text, double precision, double precision, int, text, text, text) to authenticated;

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

-- Mengosongkan riwayat absensi: Owner/GM/Superadmin, tercatat di audit log
create or replace function public.clear_attendance(p_branch_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  del_count int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'Tidak terautentikasi'; end if;
  if me.role not in ('owner', 'gm', 'superadmin') then
    raise exception 'Hanya Owner, GM, atau Superadmin yang diizinkan mengosongkan riwayat absensi';
  end if;

  if p_branch_id is not null then
    delete from attendance where tenant_id = me.tenant_id and branch_id = p_branch_id;
  else
    delete from attendance where tenant_id = me.tenant_id;
  end if;
  get diagnostics del_count = row_count;

  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (
    me.tenant_id, me.id, me.role, 'attendance_cleared', 'attendance',
    coalesce(p_branch_id::text, me.tenant_id::text),
    jsonb_build_object('branch_id', p_branch_id, 'deleted_count', del_count, 'cleared_at', now())
  );
  return del_count;
end $$;
grant execute on function public.clear_attendance(uuid) to authenticated;


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

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000016_fase3_value_add.sql
-- ══════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
-- FASE 3 — Nilai tambah. Hanya logika & skrip (RPC, tabel, trigger); UI belum dibuat.
--  3.1 Menu engineering & peringatan margin   menu_engineering(), check_margin_alerts()
--  3.2 Target & KPI cabang                     branch_targets, set_branch_target(), branch_kpi()
--  3.3 Laporan terjadwal Hermes                report_schedules, save_report_schedule(), run_due_reports()
--  3.4 Checklist & serah terima shift          checklist_templates, shift_checklists, submit_checklist()
--  3.5 Promo & voucher                         promos, upsert_promo(), validate_promo(), apply_voucher()
--  3.6 Proyeksi arus kas                       cash_projection()
--  3.7 AI Copilot Owner                        copilot_snapshot(), log_copilot()
-- Tidak mengubah matriks RBAC (versi asli). Memakai fitur yang sudah ada:
--  F2 dashboard (Owner CRUD, GM R), F3 produk, F5 POS, F12 buku kas, F13 shift/karyawan.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists margin_alert_pct numeric(5,2) not null default 40 check (margin_alert_pct between 1 and 100),
  add column if not exists payroll_day smallint not null default 25 check (payroll_day between 1 and 28),
  add column if not exists require_close_checklist boolean not null default false;

-- ── Biaya resep (HPP per porsi), rekursif untuk barang setengah jadi ─────────
create or replace function public._item_cost(p_item uuid, p_depth int default 0) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c numeric; y numeric;
begin
  if p_depth < 5 and exists (select 1 from bom_lines where parent_item_id = p_item) then
    select sum(qty * _item_cost(component_id, p_depth + 1)), max(yield_qty) into c, y from bom_lines where parent_item_id = p_item;
    return coalesce(c, 0) / greatest(coalesce(y, 1), 1);
  end if;
  return coalesce((select cost_per_unit from inventory_items where id = p_item), 0);
end $$;

create or replace function public._product_cost(p_product uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty * public._item_cost(component_id)), 0) from bom_lines where product_id = p_product $$;
revoke execute on function public._item_cost(uuid, int), public._product_cost(uuid) from public, anon, authenticated;

-- ═══ 3.1 Menu engineering (Kasavana–Smith) ═══════════════════════════════════
-- Populer  = porsi terjual ≥ 70% dari rata-rata bagi-rata; Margin tinggi = margin/porsi ≥ rata-rata tertimbang.
create or replace function public.menu_engineering(p_branch uuid default null, p_days int default 30)
returns table (product_id uuid, name text, category text, price numeric, unit_cost numeric, cost_pct numeric, margin numeric,
               qty bigint, revenue numeric, contribution numeric, class text, advice text)
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id();
begin
  perform _need(2, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'Rentang hari harus 1–365'; end if;
  if p_branch is not null then perform _branch_guard(p_branch); end if;
  return query
  with me as (
    select p.id pid, p.name::text nm, p.category::text cat, p.price pr, _product_cost(p.id) uc, coalesce(s.q, 0)::bigint q, coalesce(s.rev, 0) rev
    from products p
    left join lateral (
      select sum(oi.qty) q, sum(oi.qty * oi.price) rev
      from order_items oi join orders o on o.id = oi.order_id
      where oi.product_id = p.id and o.status = 'paid' and o.paid_at >= now() - make_interval(days => p_days)
        and branch_ok(o.branch_id) and (p_branch is null or o.branch_id = p_branch)) s on true
    where p.tenant_id = t),
  agg as (
    select case when count(*) filter (where q > 0) > 0 then 0.7 * sum(q)::numeric / count(*) filter (where q > 0) else 0 end pop_cut,
           case when sum(q) > 0 then sum(q * (pr - uc)) / sum(q) else 0 end avg_margin from me)
  select m.pid, m.nm, m.cat, m.pr, round(m.uc, 2), case when m.pr > 0 then round(m.uc / m.pr * 100, 1) else null end,
         round(m.pr - m.uc, 2), m.q, m.rev, round(m.q * (m.pr - m.uc), 2),
         case when m.q = 0 then 'belum_laku'
              when m.q >= g.pop_cut and (m.pr - m.uc) >= g.avg_margin then 'star'
              when m.q >= g.pop_cut then 'plowhorse'
              when (m.pr - m.uc) >= g.avg_margin then 'puzzle'
              else 'dog' end,
         case when m.q = 0 then 'Belum terjual pada periode ini; tinjau posisi di menu atau hapus.'
              when m.q >= g.pop_cut and (m.pr - m.uc) >= g.avg_margin then 'Pertahankan kualitas, tampilkan menonjol.'
              when m.q >= g.pop_cut then 'Laris tapi margin tipis: naikkan harga sedikit atau kurangi porsi/bahan.'
              when (m.pr - m.uc) >= g.avg_margin then 'Margin bagus tapi jarang dipesan: promosikan atau ubah posisi di menu.'
              else 'Kurang laris dan margin rendah: pertimbangkan hapus atau resep ulang.' end
  from me m cross join agg g order by (m.q * (m.pr - m.uc)) desc, m.nm;
end $$;

-- Produk yang HPP-nya melewati ambang tenant → Hermes (satu kali per produk per 7 hari).
create or replace function public._margin_alerts(p_tenant uuid) returns int
language plpgsql security definer set search_path = public as $$
declare lim numeric; n int := 0; r record;
begin
  select margin_alert_pct into lim from tenants where id = p_tenant;
  for r in select p.id, p.name, p.price, _product_cost(p.id) as uc from products p where p.tenant_id = p_tenant and p.is_available and p.price > 0
  loop
    if r.uc > 0 and r.uc / r.price * 100 > lim
       and not exists (select 1 from hermes_events h where h.tenant_id = p_tenant and h.kind = 'margin_drop'
                       and h.payload->>'product_id' = r.id::text and h.created_at > now() - interval '7 days') then
      perform _hermes(p_tenant, 'whatsapp', 'Owner', 'margin_drop',
        format('Margin menu "%s" menipis: HPP %s%% dari harga jual (batas %s%%).', r.name, round(r.uc / r.price * 100, 1), lim),
        jsonb_build_object('product_id', r.id, 'cost_pct', round(r.uc / r.price * 100, 1)));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public._margin_alerts(uuid) from public, anon, authenticated;

create or replace function public.check_margin_alerts() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'r');
  if current_tenant_id() is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  return _margin_alerts(current_tenant_id());
end $$;

-- ═══ 3.2 Target & KPI cabang ═════════════════════════════════════════════════
create table if not exists public.branch_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  revenue_target numeric(14,2) not null check (revenue_target >= 0),
  max_cogs_pct numeric(5,2) not null default 35 check (max_cogs_pct between 1 and 100),
  max_void_pct numeric(5,2) not null default 2 check (max_void_pct between 0 and 100),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (branch_id, month)
);
alter table public.branch_targets enable row level security;
create policy branch_targets_read on public.branch_targets for select using (tenant_ok(tenant_id) and branch_ok(branch_id) and has_perm(2, 'r'));

create or replace function public.set_branch_target(p_branch uuid, p_month date, p_revenue numeric, p_max_cogs_pct numeric default 35, p_max_void_pct numeric default 2)
returns branch_targets language plpgsql security definer set search_path = public as $$
declare t uuid; r branch_targets; m date := date_trunc('month', p_month)::date;
begin
  perform _need(2, 'c');                         -- matriks asli: hanya Owner CRUD di fitur 2
  t := _branch_guard(p_branch);
  if p_revenue is null or p_revenue < 0 then raise exception 'Target omzet tidak valid'; end if;
  insert into branch_targets (tenant_id, branch_id, month, revenue_target, max_cogs_pct, max_void_pct, created_by)
  values (t, p_branch, m, p_revenue, coalesce(p_max_cogs_pct, 35), coalesce(p_max_void_pct, 2), auth.uid())
  on conflict (branch_id, month) do update set revenue_target = excluded.revenue_target, max_cogs_pct = excluded.max_cogs_pct,
        max_void_pct = excluded.max_void_pct, updated_at = now()
  returning * into r;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'target_set', 'branch_targets', r.id::text, jsonb_build_object('month', m, 'revenue', p_revenue));
  return r;
end $$;

create or replace function public._kpi(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (branch_id uuid, revenue numeric, orders bigint, cogs numeric, discount numeric, void_count bigint, all_count bigint)
language sql stable security definer set search_path = public as $$
  select o.branch_id,
         coalesce(sum(o.total) filter (where o.status = 'paid'), 0), count(*) filter (where o.status = 'paid'),
         coalesce(sum(o.cogs) filter (where o.status = 'paid'), 0), coalesce(sum(o.discount) filter (where o.status = 'paid'), 0),
         count(*) filter (where o.status = 'void'), count(*) filter (where o.status in ('paid', 'void'))
  from orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to group by o.branch_id $$;
revoke execute on function public._kpi(uuid, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.branch_kpi(p_month date default null)
returns table (branch_id uuid, branch text, revenue numeric, orders bigint, avg_ticket numeric, cogs_pct numeric, void_pct numeric,
               discount_pct numeric, revenue_target numeric, attainment_pct numeric, projected_revenue numeric, status text, flags text[])
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); tz timestamp; m date; d_pass int; d_all int;
begin
  perform _need(2, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  tz := _tenant_now(t);
  m := date_trunc('month', coalesce(p_month, tz::date))::date;
  d_all := extract(day from (m + interval '1 month' - interval '1 day'))::int;
  d_pass := case when m = date_trunc('month', tz)::date then greatest(extract(day from tz)::int, 1) else d_all end;
  return query
  select b.id, b.name::text, coalesce(k.revenue, 0), coalesce(k.orders, 0),
         case when coalesce(k.orders, 0) > 0 then round(k.revenue / k.orders, 0) else 0 end,
         case when coalesce(k.revenue, 0) > 0 then round(k.cogs / k.revenue * 100, 1) else 0 end,
         case when coalesce(k.all_count, 0) > 0 then round(k.void_count::numeric / k.all_count * 100, 1) else 0 end,
         case when coalesce(k.revenue + k.discount, 0) > 0 then round(k.discount / (k.revenue + k.discount) * 100, 1) else 0 end,
         g.revenue_target,
         case when coalesce(g.revenue_target, 0) > 0 then round(coalesce(k.revenue, 0) / g.revenue_target * 100, 1) end,
         round(coalesce(k.revenue, 0) / d_pass * d_all, 0),
         case when g.id is null then 'tanpa_target'
              when coalesce(k.revenue, 0) / d_pass * d_all >= g.revenue_target then 'on_track' else 'di_bawah_target' end,
         array_remove(array[
           case when g.id is not null and coalesce(k.revenue, 0) > 0 and k.cogs / k.revenue * 100 > g.max_cogs_pct then 'HPP di atas batas' end,
           case when g.id is not null and coalesce(k.all_count, 0) > 0 and k.void_count::numeric / k.all_count * 100 > g.max_void_pct then 'Void di atas batas' end
         ], null)
  from branches b
  left join lateral (select * from _kpi(t, m::timestamptz, (m + interval '1 month')::timestamptz) x where x.branch_id = b.id) k on true
  left join branch_targets g on g.branch_id = b.id and g.month = m
  where b.tenant_id = t and branch_ok(b.id) order by b.name;
end $$;

-- ═══ 3.3 Laporan terjadwal Hermes ════════════════════════════════════════════
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('daily_sales', 'weekly_kpi', 'margin_watch')),
  freq text not null check (freq in ('daily', 'weekly')),
  hour smallint not null check (hour between 0 and 23),
  weekday smallint check (weekday between 0 and 6),     -- 0 = Minggu (untuk weekly)
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'discord')),
  target text not null default 'Owner',
  active boolean not null default true,
  last_run_at timestamptz,
  unique (tenant_id, kind),
  check (freq = 'daily' or weekday is not null)
);
alter table public.report_schedules enable row level security;
create policy report_schedules_read on public.report_schedules for select using (tenant_ok(tenant_id) and has_perm(2, 'r'));

create or replace function public.save_report_schedule(p_kind text, p_freq text, p_hour int, p_weekday int default null,
                                                       p_channel text default 'whatsapp', p_active boolean default true)
returns report_schedules language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r report_schedules;
begin
  perform _need(2, 'c');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_freq = 'weekly' and p_weekday is null then raise exception 'Laporan mingguan butuh hari'; end if;
  insert into report_schedules (tenant_id, kind, freq, hour, weekday, channel, active)
  values (t, p_kind, p_freq, p_hour, case when p_freq = 'weekly' then p_weekday end, p_channel, p_active)
  on conflict (tenant_id, kind) do update set freq = excluded.freq, hour = excluded.hour, weekday = excluded.weekday,
        channel = excluded.channel, active = excluded.active
  returning * into r;
  return r;
end $$;

create or replace function public._build_report(p_tenant uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare nowl timestamp := _tenant_now(p_tenant); d0 timestamptz; d1 timestamptz; k record; k0 record; top text; low text; n int;
begin
  if p_kind = 'daily_sales' then
    d1 := date_trunc('day', nowl)::timestamptz; d0 := d1 - interval '1 day';
    select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord, coalesce(sum(cogs), 0) cogs, coalesce(sum(void_count), 0) v into k from _kpi(p_tenant, d0, d1);
    return format('Laporan harian %s: omzet %s dari %s transaksi (rata-rata %s), HPP %s%%, void %s.',
      to_char(nowl::date - 1, 'DD Mon YYYY'), _rp(k.rev), k.ord, _rp(case when k.ord > 0 then k.rev / k.ord else 0 end),
      case when k.rev > 0 then round(k.cogs / k.rev * 100, 1) else 0 end, k.v);
  elsif p_kind = 'weekly_kpi' then
    d1 := date_trunc('day', nowl)::timestamptz; d0 := d1 - interval '7 days';
    select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord into k from _kpi(p_tenant, d0, d1);
    select coalesce(sum(revenue), 0) rev into k0 from _kpi(p_tenant, d0 - interval '7 days', d0);
    select string_agg(nm || ' (' || q || ')', ', ') into top from (
      select p.name nm, sum(oi.qty) q from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
      where o.tenant_id = p_tenant and o.status = 'paid' and o.paid_at >= d0 and o.paid_at < d1 group by p.name order by sum(oi.qty) desc limit 3) s;
    return format('Ringkasan mingguan: omzet %s (%s dibanding minggu sebelumnya), %s transaksi. Menu terlaris: %s.',
      _rp(k.rev), case when k0.rev > 0 then (case when k.rev >= k0.rev then '+' else '' end) || round((k.rev - k0.rev) / k0.rev * 100, 1) || '%' else 'tanpa pembanding' end,
      k.ord, coalesce(top, 'belum ada penjualan'));
  else
    select count(*) into n from products p, lateral (select _product_cost(p.id) c) x
     where p.tenant_id = p_tenant and p.is_available and p.price > 0 and x.c > 0 and x.c / p.price * 100 > (select margin_alert_pct from tenants where id = p_tenant);
    perform _margin_alerts(p_tenant);
    return format('Pantauan margin: %s menu aktif melewati batas HPP.', n);
  end if;
end $$;
revoke execute on function public._build_report(uuid, text) from public, anon, authenticated;

-- Dipanggil cron (hermes-dispatch, service role). Idempoten: tiap jadwal jalan sekali per hari/minggu lokal tenant.
create or replace function public.run_due_reports() returns int
language plpgsql security definer set search_path = public as $$
declare s record; nowl timestamp; n int := 0; last_local date;
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  for s in select r.*, t.status as tenant_status from report_schedules r join tenants t on t.id = r.tenant_id where r.active loop
    continue when s.tenant_status is distinct from 'active';
    nowl := _tenant_now(s.tenant_id);
    last_local := case when s.last_run_at is null then null else (s.last_run_at at time zone (select timezone from tenants where id = s.tenant_id))::date end;
    continue when extract(hour from nowl)::int < s.hour;
    continue when s.freq = 'weekly' and extract(dow from nowl)::int <> s.weekday;
    continue when last_local = nowl::date;
    perform _hermes(s.tenant_id, s.channel, s.target, case when s.kind = 'margin_watch' then 'margin_drop' else 'z_report' end,
                    _build_report(s.tenant_id, s.kind), jsonb_build_object('report_kind', s.kind));
    update report_schedules set last_run_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.run_due_reports() from public, anon, authenticated;

-- ═══ 3.4 Checklist & serah terima shift ══════════════════════════════════════
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  kind text not null check (kind in ('open', 'close', 'handover')),
  items jsonb not null default '[]',                    -- [{"key":"kulkas","label":"Suhu kulkas aman","required":true}]
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists checklist_tpl_uq on public.checklist_templates (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind);
create table if not exists public.shift_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  kind text not null check (kind in ('open', 'close', 'handover')),
  answers jsonb not null default '{}',
  note text,
  submitted_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (shift_id, kind)
);
alter table public.checklist_templates enable row level security;
alter table public.shift_checklists enable row level security;
create policy checklist_tpl_read on public.checklist_templates for select using (tenant_ok(tenant_id) and (branch_id is null or branch_ok(branch_id)) and has_perm(5, 'r'));
create policy shift_checklists_read on public.shift_checklists for select using (tenant_ok(tenant_id) and branch_ok(branch_id) and has_perm(5, 'r'));

create or replace function public.save_checklist_template(p_branch uuid, p_kind text, p_items jsonb, p_active boolean default true)
returns checklist_templates language plpgsql security definer set search_path = public as $$
declare t uuid; r checklist_templates; it jsonb;
begin
  perform _need(13, 'u');
  if current_app_role()::text not in ('owner', 'gm') then raise exception 'Hanya Owner/GM yang mengatur checklist'; end if;
  t := case when p_branch is null then current_tenant_id() else _branch_guard(p_branch) end;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Daftar butir harus berupa array'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'key'), '') = '' or coalesce(btrim(it->>'label'), '') = '' then raise exception 'Setiap butir wajib punya key dan label'; end if;
  end loop;
  insert into checklist_templates (tenant_id, branch_id, kind, items, active) values (t, p_branch, p_kind, p_items, p_active)
  on conflict (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), kind)
  do update set items = excluded.items, active = excluded.active, updated_at = now()
  returning * into r;
  return r;
end $$;

create or replace function public.submit_checklist(p_shift uuid, p_kind text, p_answers jsonb, p_note text default null)
returns shift_checklists language plpgsql security definer set search_path = public as $$
declare s shifts; tpl checklist_templates; it jsonb; missing text[] := '{}'; r shift_checklists;
begin
  perform _need(5, 'c');
  select * into s from shifts where id = p_shift;
  if not found or not tenant_ok(s.tenant_id) or not branch_ok(s.branch_id) then raise exception 'Shift tidak ditemukan'; end if;
  if s.cashier_id <> auth.uid() and current_app_role()::text not in ('owner', 'gm') then raise exception 'Checklist hanya diisi kasir shift ini atau GM'; end if;
  if p_kind not in ('open', 'close', 'handover') then raise exception 'Jenis checklist tidak valid'; end if;
  if s.status = 'closed' and p_kind <> 'close' then raise exception 'Shift sudah ditutup'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Jawaban harus berupa objek'; end if;
  select * into tpl from checklist_templates
   where tenant_id = s.tenant_id and kind = p_kind and active and (branch_id = s.branch_id or branch_id is null)
   order by branch_id nulls last limit 1;
  if found then
    for it in select * from jsonb_array_elements(tpl.items) loop
      if coalesce((it->>'required')::boolean, true) and coalesce(p_answers->>(it->>'key'), 'false') in ('false', '') then
        missing := missing || (it->>'label');
      end if;
    end loop;
    if array_length(missing, 1) > 0 then raise exception 'Butir wajib belum dipenuhi: %', array_to_string(missing, ', '); end if;
  end if;
  if p_kind = 'handover' and length(btrim(coalesce(p_note, ''))) < 10 then raise exception 'Catatan serah terima minimal 10 karakter'; end if;
  insert into shift_checklists (tenant_id, branch_id, shift_id, kind, answers, note, submitted_by)
  values (s.tenant_id, s.branch_id, s.id, p_kind, coalesce(p_answers, '{}'), nullif(btrim(p_note), ''), auth.uid())
  on conflict (shift_id, kind) do update set answers = excluded.answers, note = excluded.note, submitted_by = auth.uid(), created_at = now()
  returning * into r;
  return r;
end $$;

-- Opsional per tenant (require_close_checklist): shift tidak bisa ditutup tanpa checklist tutup bila templatnya ada.
create or replace function public._shift_close_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status = 'open' and auth.uid() is not null
     and (select require_close_checklist from tenants where id = new.tenant_id)
     and exists (select 1 from checklist_templates c where c.tenant_id = new.tenant_id and c.kind = 'close' and c.active and (c.branch_id = new.branch_id or c.branch_id is null))
     and not exists (select 1 from shift_checklists sc where sc.shift_id = new.id and sc.kind = 'close') then
    raise exception 'Isi checklist tutup shift terlebih dahulu';
  end if;
  return new;
end $$;
drop trigger if exists shifts_close_guard on public.shifts;
create trigger shifts_close_guard before update on public.shifts for each row execute function public._shift_close_guard();

-- ═══ 3.5 Promo & voucher ═════════════════════════════════════════════════════
create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('pct', 'amount')),
  value numeric(14,2) not null check (value > 0),
  min_spend numeric(14,2) not null default 0 check (min_spend >= 0),
  max_discount numeric(14,2) check (max_discount > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit int check (usage_limit > 0),
  used_count int not null default 0,
  active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check (kind <> 'pct' or value <= 100),
  check (ends_at is null or ends_at > starts_at)
);
create unique index if not exists promos_code_uq on public.promos (tenant_id, upper(code));
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  promo_id uuid not null references public.promos(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  discount numeric(14,2) not null,
  created_at timestamptz not null default now()
);
alter table public.promos enable row level security;
alter table public.promo_redemptions enable row level security;
create policy promos_read on public.promos for select using (tenant_ok(tenant_id) and has_perm(3, 'r'));
create policy promo_red_read on public.promo_redemptions for select using (tenant_ok(tenant_id) and has_perm(2, 'r'));
alter table public.orders add column if not exists voucher_code text;

create or replace function public.upsert_promo(p_code text, p_name text, p_kind text, p_value numeric, p_min_spend numeric default 0,
  p_max_discount numeric default null, p_starts timestamptz default null, p_ends timestamptz default null, p_limit int default null,
  p_branch uuid default null, p_active boolean default true, p_id uuid default null)
returns promos language plpgsql security definer set search_path = public as $$
declare t uuid; r promos;
begin
  perform _need(3, 'c');                                 -- Owner/GM/Superadmin CRUD; kasir hanya baca
  t := case when p_branch is null then current_tenant_id() else _branch_guard(p_branch) end;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if coalesce(btrim(p_code), '') !~ '^[A-Za-z0-9_-]{3,20}$' then raise exception 'Kode promo 3–20 karakter (huruf, angka, - atau _)'; end if;
  if p_id is null then
    insert into promos (tenant_id, branch_id, code, name, kind, value, min_spend, max_discount, starts_at, ends_at, usage_limit, active)
    values (t, p_branch, upper(btrim(p_code)), p_name, p_kind, p_value, coalesce(p_min_spend, 0), p_max_discount, coalesce(p_starts, now()), p_ends, p_limit, p_active)
    returning * into r;
  else
    update promos set name = p_name, kind = p_kind, value = p_value, min_spend = coalesce(p_min_spend, 0), max_discount = p_max_discount,
           starts_at = coalesce(p_starts, starts_at), ends_at = p_ends, usage_limit = p_limit, active = p_active
     where id = p_id and tenant_id = t returning * into r;
    if not found then raise exception 'Promo tidak ditemukan'; end if;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'promo_saved', 'promos', r.id::text, jsonb_build_object('code', r.code, 'kind', r.kind, 'value', r.value));
  return r;
end $$;

create or replace function public._promo_discount(p promos, p_subtotal numeric) returns numeric
language plpgsql immutable as $$
declare d numeric;
begin
  d := case when p.kind = 'pct' then round(p_subtotal * p.value / 100, 0) else p.value end;
  if p.max_discount is not null then d := least(d, p.max_discount); end if;
  return least(d, p_subtotal);
end $$;

create or replace function public._promo_check(p_tenant uuid, p_branch uuid, p_code text, p_subtotal numeric) returns promos
language plpgsql stable security definer set search_path = public as $$
declare p promos;
begin
  select * into p from promos where tenant_id = p_tenant and upper(code) = upper(btrim(coalesce(p_code, '')));
  if not found or not p.active then raise exception 'Kode promo tidak dikenal atau tidak aktif'; end if;
  if p.branch_id is not null and p.branch_id <> p_branch then raise exception 'Promo tidak berlaku di cabang ini'; end if;
  if now() < p.starts_at then raise exception 'Promo belum dimulai'; end if;
  if p.ends_at is not null and now() > p.ends_at then raise exception 'Promo sudah berakhir'; end if;
  if p.usage_limit is not null and p.used_count >= p.usage_limit then raise exception 'Kuota promo sudah habis'; end if;
  if p_subtotal < p.min_spend then raise exception 'Belanja minimal % untuk promo ini', _rp(p.min_spend); end if;
  return p;
end $$;
revoke execute on function public._promo_check(uuid, uuid, text, numeric) from public, anon, authenticated;

create or replace function public.validate_promo(p_code text, p_subtotal numeric, p_branch uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid; p promos;
begin
  perform _need(5, 'r');
  t := _branch_guard(p_branch);
  p := _promo_check(t, p_branch, p_code, p_subtotal);
  return jsonb_build_object('code', p.code, 'name', p.name, 'discount', _promo_discount(p, p_subtotal));
end $$;

-- Terapkan ke pesanan terbuka. Catatan: pay_order tetap menerapkan batas diskon kebijakan (PIN bila persentase melewati batas).
create or replace function public.apply_voucher(p_order uuid, p_code text) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; p promos; d numeric; v_taxable numeric; v_tax numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  p := _promo_check(o.tenant_id, o.branch_id, p_code, o.subtotal);
  d := _promo_discount(p, o.subtotal);
  v_taxable := o.subtotal - d;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = d, tax = v_tax, total = v_taxable + v_tax, voucher_code = p.code where id = o.id returning * into o;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (o.tenant_id, auth.uid(), current_app_role(), 'voucher_applied', 'orders', o.id::text, jsonb_build_object('code', p.code, 'discount', d));
  return o;
end $$;

create or replace function public.remove_voucher(p_order uuid) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; v_tax numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = 0, tax = v_tax, total = o.subtotal + v_tax, voucher_code = null where id = o.id returning * into o;
  return o;
end $$;

-- Diskon dari voucher sudah diotorisasi Owner/GM saat promo dibuat, jadi tidak lagi memicu PIN kebijakan di kasir.
-- Syarat pengecualian: voucher_code terisi (hanya apply_voucher yang mengisinya), kasir tidak menimpa nominal diskon,
-- dan diskon yang tersimpan = hasil hitung voucher. Diskon manual (apply_order_discount) menghapus voucher_code.
-- (Salinan pay_order & apply_order_discount dari migrasi 14 dengan satu perubahan syarat tiap fungsi.)
create or replace function public.apply_order_discount(p_order uuid, p_discount numeric, p_pin text default null) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pol jsonb; pct numeric; mx numeric; auth_id uuid; v_tax numeric; v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    pct := round(p_discount / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = p_discount, tax = v_tax, total = v_taxable + v_tax, voucher_code = null where id = o.id returning * into o;
  return o;
end $$;

create or replace function public.pay_order(
  p_order uuid, p_payments jsonb, p_customer_phone text default null, p_discount numeric default null, p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric; v_taxable numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
        disc numeric; pct numeric; mx numeric; pol jsonb; auth_id uuid; jl jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Diskon: di atas batas efektif (Tenant → Cabang → Peran) wajib PIN GM cabang / Owner
  disc := coalesce(p_discount, o.discount, 0);
  if disc < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if disc > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  if disc > 0 and o.subtotal > 0 then
    pct := round(disc / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx and not (o.voucher_code is not null and p_discount is null and disc = o.discount) then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  -- Pajak dari pengaturan tenant (Fase 0.8) atas nilai setelah diskon; tagihan klinik selalu tanpa pajak.
  v_taxable := o.subtotal - disc;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  v_total := v_taxable + v_tax;

  for pay in select * from jsonb_array_elements(p_payments) loop
    if (pay->>'method') not in ('cash', 'card', 'qris', 'ewallet', 'transfer') then raise exception 'Metode tidak dikenal'; end if;
    if (pay->>'amount')::numeric <= 0 then raise exception 'Nominal pembayaran harus positif'; end if;
    paid := paid + (pay->>'amount')::numeric;
    if pay->>'method' = 'cash' then cash := cash + (pay->>'amount')::numeric; else noncash := noncash + (pay->>'amount')::numeric; end if;
  end loop;
  if paid < v_total then raise exception 'Pembayaran kurang %', _rp(v_total - paid); end if;
  change := paid - v_total;
  if change > cash then raise exception 'Kembalian hanya bisa dari pembayaran tunai'; end if;
  cash := cash - change;

  for pay in select * from jsonb_array_elements(p_payments) loop
    insert into payments (tenant_id, order_id, method, amount, reference)
    values (o.tenant_id, o.id, (pay->>'method')::pay_method,
            case when pay->>'method' = 'cash' then (pay->>'amount')::numeric - change else (pay->>'amount')::numeric end,
            nullif(pay->>'reference', ''));
    if pay->>'method' = 'cash' then change := 0; end if;
  end loop;

  for it in select product_id, sum(qty) q from order_items where order_id = o.id group by product_id loop
    for bl in select b.component_id, b.qty, i.cost_per_unit, i.min_qty, i.name from bom_lines b
              join inventory_items i on i.id = b.component_id where b.product_id = it.product_id loop
      lvl := _move(o.tenant_id, o.branch_id, bl.component_id, -(bl.qty * it.q), 'sale', o.code);
      hpp := hpp + bl.qty * it.q * bl.cost_per_unit;
      if lvl < bl.min_qty and lvl + bl.qty * it.q >= bl.min_qty then
        perform _hermes(o.tenant_id, 'whatsapp', 'GM', 'low_stock',
          format('%s di %s tersisa %s (minimum %s).', bl.name, (select name from branches where id = o.branch_id), round(lvl, 2), bl.min_qty));
      end if;
    end loop;
  end loop;

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), discount = disc, tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000 dari total yang dibayar; poin hanya naik lewat transaksi (customers_guard).
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  -- Jurnal: diskon dicatat sebagai potongan penjualan (4102) agar pendapatan kotor tetap = subtotal.
  jl := jsonb_build_array(jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash));
  if disc > 0 then jl := jl || jsonb_build_array(jsonb_build_object('code', '4102', 'dr', disc)); end if;
  jl := jl || jsonb_build_array(
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp)));
  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jl);
  return o;
end $$;

-- Hitung pemakaian hanya saat transaksi LUNAS; kembalikan kuota bila di-void/refund.
create or replace function public._voucher_redeem() returns trigger language plpgsql security definer set search_path = public as $$
declare p promos;
begin
  if new.voucher_code is null then return new; end if;
  select * into p from promos where tenant_id = new.tenant_id and upper(code) = upper(new.voucher_code);
  if not found then return new; end if;
  if new.status = 'paid' and old.status <> 'paid' then
    insert into promo_redemptions (tenant_id, promo_id, order_id, discount) values (new.tenant_id, p.id, new.id, new.discount) on conflict (order_id) do nothing;
    if found then update promos set used_count = used_count + 1 where id = p.id; end if;
  elsif new.status in ('void', 'refunded') and old.status = 'paid' then
    delete from promo_redemptions where order_id = new.id;
    if found then update promos set used_count = greatest(used_count - 1, 0) where id = p.id; end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_voucher_redeem on public.orders;
create trigger orders_voucher_redeem after update of status on public.orders for each row execute function public._voucher_redeem();

-- ═══ 3.6 Proyeksi arus kas ═══════════════════════════════════════════════════
-- Model sederhana & transparan: penjualan = rata-rata per hari-dalam-minggu 28 hari terakhir; HPP/pembelian = persentase HPP historis;
-- beban tetap = rata-rata beban 6xxx (di luar gaji & waste) per hari; gaji = jurnal gaji terakhir pada tanggal gaji tenant;
-- utang dagang berjalan dibayar pada hari ke-p_ap_days. Saldo awal = akun kas + bank.
create or replace function public.cash_projection(p_days int default 30, p_ap_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); today date; opening numeric; ap numeric; payroll numeric; pday int; sales28 numeric; cogs28 numeric;
        fixed_day numeric; cogs_ratio numeric; bal numeric; i int; d date; inflow numeric; outflow numeric; wd numeric[] := array_fill(0::numeric, array[7]);
        wdn int[] := array_fill(0, array[7]); rows jsonb := '[]'; minbal numeric; first_neg date; r record; assumptions jsonb;
begin
  perform _need(12, 'r');
  if current_app_role()::text not in ('owner', 'gm', 'superadmin') then raise exception 'Proyeksi kas hanya untuk Owner/GM'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if p_days not between 7 and 90 then raise exception 'Horizon 7–90 hari'; end if;
  today := _tenant_now(t)::date;
  select coalesce(sum(l.debit - l.credit), 0) into opening from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code in ('1101', '1102');
  select coalesce(sum(l.credit - l.debit), 0) into ap from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code = '2101';
  select coalesce(max(l.debit), 0) into payroll from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.code = '6101' and e.entry_date >= today - 62;
  select payroll_day into pday from tenants where id = t;
  for r in select extract(dow from o.paid_at at time zone (select timezone from tenants where id = t))::int dw, sum(o.total) s from orders o
            where o.tenant_id = t and o.status = 'paid' and o.paid_at >= now() - interval '28 days' group by 1 loop
    wd[r.dw + 1] := r.s / 4;                             -- 28 hari = 4 kali tiap hari-dalam-minggu
  end loop;
  select coalesce(sum(total), 0), coalesce(sum(cogs), 0) into sales28, cogs28 from orders where tenant_id = t and status = 'paid' and paid_at >= now() - interval '28 days';
  cogs_ratio := case when sales28 > 0 then cogs28 / sales28 else 0 end;
  select coalesce(sum(l.debit - l.credit), 0) / 28 into fixed_day from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.type = 'expense' and a.code not in ('6101', '6104') and e.entry_date >= today - 28;
  bal := opening; minbal := opening;
  for i in 1..p_days loop
    d := today + i;
    inflow := wd[extract(dow from d)::int + 1];
    outflow := inflow * cogs_ratio + fixed_day;
    if extract(day from d)::int = pday then outflow := outflow + payroll; end if;
    if i = p_ap_days then outflow := outflow + greatest(ap, 0); end if;
    bal := bal + inflow - outflow;
    minbal := least(minbal, bal);
    if bal < 0 and first_neg is null then first_neg := d; end if;
    rows := rows || jsonb_build_array(jsonb_build_object('date', d, 'inflow', round(inflow), 'outflow', round(outflow), 'balance', round(bal)));
  end loop;
  assumptions := jsonb_build_array(
    'Penjualan = rata-rata per hari-dalam-minggu dari 28 hari terakhir (tanpa tren musiman).',
    format('Pembelian bahan = %s%% dari penjualan (HPP historis).', round(cogs_ratio * 100, 1)),
    format('Beban tetap rata-rata %s per hari, di luar gaji dan waste.', _rp(round(fixed_day))),
    format('Gaji %s dibayar tanggal %s tiap bulan (dari jurnal gaji terakhir).', _rp(payroll), pday),
    format('Utang dagang %s dibayar hari ke-%s.', _rp(greatest(ap, 0)), p_ap_days));
  return jsonb_build_object('opening', round(opening), 'min_balance', round(minbal), 'first_negative_date', first_neg,
                            'ending', round(bal), 'days', p_days, 'assumptions', assumptions, 'rows', rows);
end $$;

-- ═══ 3.7 AI Copilot Owner ════════════════════════════════════════════════════
-- Database menyiapkan FAKTA terukur; model hanya merangkum. Edge Function owner-copilot memanggil ini dengan JWT Owner,
-- sehingga RLS dan matriks RBAC tetap berlaku. Jangan menaruh PII pelanggan/pasien di sini.
create table if not exists public.copilot_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id),
  question text not null,
  answer text,
  tokens int,
  created_at timestamptz not null default now()
);
alter table public.copilot_logs enable row level security;
create policy copilot_logs_read on public.copilot_logs for select using (tenant_ok(tenant_id) and has_perm(2, 'r') and current_app_role()::text in ('owner', 'superadmin'));

create or replace function public.copilot_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); kpi jsonb; menu jsonb; cash jsonb; pend int; lowstock int; voids7 int;
begin
  perform _need(2, 'r');
  if current_app_role()::text not in ('owner', 'superadmin') then raise exception 'Copilot hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  select coalesce(jsonb_agg(to_jsonb(k)), '[]') into kpi from branch_kpi() k;
  select jsonb_build_object(
      'bintang', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'star' limit 5) x), '[]'),
      'laris_margin_tipis', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'plowhorse' limit 5) x), '[]'),
      'perlu_dievaluasi', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class in ('dog', 'belum_laku') limit 5) x), '[]'))
    into menu;
  cash := cash_projection(30, 14) - 'rows';
  select count(*) into pend from approvals where tenant_id = t and status = 'pending';
  select count(*) into lowstock from stock_levels s join inventory_items i on i.id = s.item_id where i.tenant_id = t and i.min_qty > 0 and s.qty < i.min_qty;
  select count(*) into voids7 from orders where tenant_id = t and status = 'void' and created_at > now() - interval '7 days';
  return jsonb_build_object('generated_at', now(), 'kpi_bulan_ini', kpi, 'menu', menu, 'kas', cash,
                            'persetujuan_menunggu', pend, 'stok_di_bawah_minimum', lowstock, 'void_7_hari', voids7);
end $$;

create or replace function public.log_copilot(p_question text, p_answer text, p_tokens int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'r');
  if current_app_role()::text <> 'owner' then raise exception 'Copilot hanya untuk Owner'; end if;
  insert into copilot_logs (tenant_id, question, answer, tokens) values (current_tenant_id(), left(p_question, 2000), left(p_answer, 8000), p_tokens);
end $$;

-- ═══ Hak eksekusi ════════════════════════════════════════════════════════════
grant execute on function public.menu_engineering(uuid, int), public.check_margin_alerts(), public.set_branch_target(uuid, date, numeric, numeric, numeric),
  public.branch_kpi(date), public.save_report_schedule(text, text, int, int, text, boolean), public.save_checklist_template(uuid, text, jsonb, boolean),
  public.submit_checklist(uuid, text, jsonb, text), public.upsert_promo(text, text, text, numeric, numeric, numeric, timestamptz, timestamptz, int, uuid, boolean, uuid),
  public.validate_promo(text, numeric, uuid), public.apply_voucher(uuid, text), public.remove_voucher(uuid),
  public.cash_projection(int, int), public.copilot_snapshot(), public.log_copilot(text, text, int) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000017_fase4_platform.sql
-- ══════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
-- FASE 4 — Pertumbuhan platform. Logika & skrip (tabel, RPC, trigger, Edge); UI belum dibuat.
--  4.1 Tagihan & dunning otomatis      generate_invoices(), run_dunning(), mark_invoice_paid(), billing_status()
--  4.2 Feature flags                    feature_flags, has_flag(), my_flags(), set_feature_flag(), set_flag_override()
--  4.3 Metering AI                      ai_usage, ai_quota_check(), ai_record_usage(), ai_usage_summary()
--  4.4 Template industri                industry_templates, apply_industry_template()
--  4.5 Mode offline                     orders.client_ref, sync_offline_orders()  (+ src/lib/offlineQueue.js)
--  4.6 Benchmark anonim                 benchmark_monthly, refresh_benchmark(), my_benchmark()  (opt-in, kohort ≥ 5)
--  4.7 Reseller                         resellers, reseller_commissions, assign_reseller(), reseller_statement()
-- Tidak mengubah matriks RBAC. Operasi platform = Superadmin (is_superadmin()); jalur sistem = auth.uid() null / service_role.
-- ════════════════════════════════════════════════════════════════════════════

-- ═══ 4.7 (lebih dulu: dirujuk tagihan) Reseller ══════════════════════════════
create table if not exists public.resellers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{3,20}$'),
  name text not null,
  contact_email text,
  commission_pct numeric(5,2) not null default 20 check (commission_pct between 0 and 50),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);
alter table public.tenants add column if not exists reseller_id uuid references public.resellers(id) on delete set null;
create table if not exists public.reseller_commissions (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null unique references public.invoices(id) on delete cascade,
  base_amount numeric(14,2) not null,
  pct numeric(5,2) not null,
  amount numeric(14,2) not null,
  status text not null default 'accrued' check (status in ('accrued', 'paid', 'void')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.resellers enable row level security;
alter table public.reseller_commissions enable row level security;
create policy resellers_sa on public.resellers for select using (is_superadmin());
create policy reseller_comm_sa on public.reseller_commissions for select using (is_superadmin());

create or replace function public.create_reseller(p_code text, p_name text, p_email text default null, p_pct numeric default 20)
returns resellers language plpgsql security definer set search_path = public as $$
declare r resellers;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola reseller'; end if;
  insert into resellers (code, name, contact_email, commission_pct) values (upper(btrim(p_code)), btrim(p_name), p_email, p_pct) returning * into r;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'reseller_created', 'resellers', r.id::text, jsonb_build_object('code', r.code, 'pct', r.commission_pct));
  return r;
end $$;

create or replace function public.assign_reseller(p_tenant uuid, p_reseller uuid) returns tenants
language plpgsql security definer set search_path = public as $$
declare t tenants;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola reseller'; end if;
  if p_reseller is not null and not exists (select 1 from resellers where id = p_reseller and status = 'active') then raise exception 'Reseller tidak aktif'; end if;
  update tenants set reseller_id = p_reseller where id = p_tenant returning * into t;
  if not found then raise exception 'Tenant tidak ditemukan'; end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'reseller_assigned', 'tenants', p_tenant::text, jsonb_build_object('reseller', p_reseller));
  return t;
end $$;

create or replace function public.reseller_statement(p_reseller uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang melihat laporan reseller'; end if;
  return jsonb_build_object(
    'reseller', (select to_jsonb(r) - 'contact_email' from resellers r where r.id = p_reseller),
    'tenants_aktif', (select count(*) from tenants where reseller_id = p_reseller and status in ('active', 'past_due')),
    'accrued', coalesce((select sum(amount) from reseller_commissions where reseller_id = p_reseller and status = 'accrued'), 0),
    'paid', coalesce((select sum(amount) from reseller_commissions where reseller_id = p_reseller and status = 'paid'), 0),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('tenant', t.name, 'invoice_period', i.period, 'base', c.base_amount, 'pct', c.pct, 'amount', c.amount, 'status', c.status) order by c.created_at desc)
                       from reseller_commissions c join tenants t on t.id = c.tenant_id join invoices i on i.id = c.invoice_id where c.reseller_id = p_reseller), '[]'));
end $$;

create or replace function public.pay_reseller_commissions(p_reseller uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare total numeric;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang membayar komisi'; end if;
  with u as (update reseller_commissions set status = 'paid', paid_at = now() where reseller_id = p_reseller and status = 'accrued' returning amount)
  select coalesce(sum(amount), 0) into total from u;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'reseller_paid', 'resellers', p_reseller::text, jsonb_build_object('amount', total));
  return total;
end $$;

-- ═══ 4.1 Tagihan & dunning ═══════════════════════════════════════════════════
alter table public.invoices
  add column if not exists due_date date,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_ref text,
  add column if not exists reminder_stage smallint not null default 0;
alter table public.plans add column if not exists ai_quota_tokens bigint not null default 0 check (ai_quota_tokens >= 0),
  add column if not exists ai_unlimited boolean not null default false;   -- paket baru: AI mati sampai kuota diisi (aman secara bawaan)
alter table public.tenants add column if not exists ai_quota_override bigint check (ai_quota_override >= 0);
update public.plans set ai_quota_tokens = case code when 'growth' then 500000 else 0 end, ai_unlimited = (code = 'enterprise') where code in ('starter', 'growth', 'enterprise');

-- Saklar penagihan otomatis (bawaan MATI). Aktifkan hanya setelah tagihan manual yang ada dirapikan:
--   insert into platform_settings(key,value) values ('billing','{"enabled":true}') on conflict (key) do update set value = excluded.value;
create or replace function public._billing_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean from platform_settings where key = 'billing'), false) $$;
revoke execute on function public._billing_on() from public, anon, authenticated;

-- Satu tagihan per tenant per bulan (idempotent); hanya tenant berbayar dengan harga paket terisi.
create or replace function public.generate_invoices(p_period date default null) returns int
language plpgsql security definer set search_path = public as $$
declare per date; n int := 0; r record;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  if not _billing_on() then return 0; end if;
  per := date_trunc('month', coalesce(p_period, current_date))::date;
  perform pg_advisory_xact_lock(hashtext('generate_invoices'));
  for r in select t.id, p.price_month from tenants t join plans p on p.id = t.plan_id
           where t.status in ('active', 'past_due') and p.price_month is not null and p.price_month > 0
             and not exists (select 1 from invoices i where i.tenant_id = t.id and i.period = per and i.status <> 'void') loop
    insert into invoices (tenant_id, period, amount, due_date) values (r.id, per, r.price_month, greatest(per + 7, current_date + 7));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._suspend_for_dunning(p_tenant uuid, p_inv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tenants set status_before_suspend = status, status = 'suspended', suspended_reason = 'Tagihan menunggak (otomatis)', suspended_at = now()
   where id = p_tenant and status <> 'suspended';
  insert into audit_logs (tenant_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, 'superadmin', 'tenant_suspended_dunning', 'invoices', p_inv::text, '{}');
end $$;
revoke execute on function public._suspend_for_dunning(uuid, uuid) from public, anon, authenticated;

-- Jadwal: H+1 pengingat · H+3 tenant 'past_due' · H+7 peringatan akhir · H+14 ditangguhkan. Tiap tahap sekali.
create or replace function public.run_dunning() returns int
language plpgsql security definer set search_path = public as $$
declare r record; d int; stage int; n int := 0; msg text;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  if not _billing_on() then return 0; end if;
  for r in select i.id, i.tenant_id, i.amount, i.period, i.reminder_stage, coalesce(i.due_date, i.period + 7) as due, t.name, t.status as tstatus
           from invoices i join tenants t on t.id = i.tenant_id
           where i.status = 'unpaid' and t.status in ('active', 'past_due') for update of i skip locked loop
    d := _tenant_now(r.tenant_id)::date - r.due;
    stage := case when d >= 14 then 4 when d >= 7 then 3 when d >= 3 then 2 when d >= 1 then 1 else 0 end;
    continue when stage <= r.reminder_stage;
    msg := case stage
      when 1 then format('Pengingat: tagihan Harum.in %s sebesar %s jatuh tempo %s. Mohon segera dibayar.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), to_char(r.due, 'DD Mon'))
      when 2 then format('Tagihan %s (%s) terlambat %s hari. Akun masuk status tertunggak.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), d)
      when 3 then format('PERINGATAN AKHIR: tagihan %s (%s) terlambat %s hari. Akun akan ditangguhkan pada H+14 jika belum dibayar.', to_char(r.period, 'Mon YYYY'), _rp(r.amount), d)
      else format('Akun %s ditangguhkan karena tagihan %s (%s) belum dibayar. Hubungi tim Harum.in untuk mengaktifkan kembali.', r.name, to_char(r.period, 'Mon YYYY'), _rp(r.amount)) end;
    perform _hermes(r.tenant_id, 'whatsapp', 'Owner', 'dunning', msg, jsonb_build_object('invoice_id', r.id, 'stage', stage));
    update invoices set reminder_stage = stage where id = r.id;
    if stage >= 2 and r.tstatus = 'active' then update tenants set status = 'past_due' where id = r.tenant_id; end if;
    if stage = 4 then perform _suspend_for_dunning(r.tenant_id, r.id); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._mark_paid(p_inv uuid, p_ref text) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices; t tenants; rs resellers;
begin
  select * into i from invoices where id = p_inv for update;
  if not found then raise exception 'Tagihan tidak ditemukan'; end if;
  if i.status = 'paid' then return i; end if;                              -- idempotent (webhook bisa terkirim ulang)
  if i.status = 'void' then raise exception 'Tagihan sudah dibatalkan'; end if;
  update invoices set status = 'paid', paid_at = now(), payment_ref = left(p_ref, 120) where id = i.id returning * into i;
  select * into t from tenants where id = i.tenant_id for update;
  update tenants set current_period_end = greatest(coalesce(current_period_end, current_date), (i.period + interval '1 month')::date) where id = t.id;
  if not exists (select 1 from invoices x where x.tenant_id = t.id and x.status = 'unpaid' and coalesce(x.due_date, x.period + 7) < _tenant_now(t.id)::date) then
    if t.status = 'past_due' then update tenants set status = 'active' where id = t.id;
    elsif t.status = 'suspended' and t.suspended_reason like 'Tagihan menunggak%' then
      update tenants set status = case when status_before_suspend in ('active', 'trial') then status_before_suspend else 'active' end,
             suspended_reason = null, suspended_at = null, status_before_suspend = null where id = t.id;
    end if;
  end if;
  if t.reseller_id is not null then
    select * into rs from resellers where id = t.reseller_id;
    if found and rs.status = 'active' then
      insert into reseller_commissions (reseller_id, tenant_id, invoice_id, base_amount, pct, amount)
      values (rs.id, t.id, i.id, i.amount, rs.commission_pct, round(i.amount * rs.commission_pct / 100, 0)) on conflict (invoice_id) do nothing;
    end if;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t.id, auth.uid(), current_app_role(), 'invoice_paid', 'invoices', i.id::text, jsonb_build_object('ref', p_ref, 'amount', i.amount));
  return i;
end $$;
revoke execute on function public._mark_paid(uuid, text) from public, anon, authenticated;

create or replace function public.mark_invoice_paid(p_invoice uuid, p_ref text default null) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengonfirmasi pembayaran'; end if;
  return _mark_paid(p_invoice, coalesce(p_ref, 'manual'));
end $$;

-- Untuk webhook payment gateway (Edge Function billing-webhook, service_role). Tidak diberikan ke authenticated.
create or replace function public.mark_invoice_paid_system(p_invoice uuid, p_ref text) returns invoices
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  return _mark_paid(p_invoice, p_ref);
end $$;
revoke execute on function public.mark_invoice_paid_system(uuid, text) from public, anon, authenticated;

create or replace function public.void_invoice(p_invoice uuid, p_reason text) returns invoices
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Alasan pembatalan wajib'; end if;
  select * into i from invoices where id = p_invoice for update;
  if not found or i.status = 'void' then raise exception 'Tagihan tidak ditemukan'; end if;
  if i.status = 'paid' then raise exception 'Tagihan lunas tidak bisa dibatalkan'; end if;
  update invoices set status = 'void' where id = i.id returning * into i;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (i.tenant_id, auth.uid(), current_app_role(), 'invoice_void', 'invoices', i.id::text, jsonb_build_object('reason', p_reason));
  return i;
end $$;

create or replace function public.billing_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id();
begin
  perform _need(1, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  return jsonb_build_object(
    'status', (select status from tenants where id = t), 'period_end', (select current_period_end from tenants where id = t),
    'unpaid', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'period', i.period, 'amount', i.amount, 'due', coalesce(i.due_date, i.period + 7),
                'days_overdue', greatest(_tenant_now(t)::date - coalesce(i.due_date, i.period + 7), 0),
                'suspend_on', coalesce(i.due_date, i.period + 7) + 14) order by i.period) from invoices i where i.tenant_id = t and i.status = 'unpaid'), '[]'));
end $$;

-- ═══ 4.2 Feature flags ═══════════════════════════════════════════════════════
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  description text,
  default_enabled boolean not null default false,
  plans text[] not null default '{}',                    -- kode paket yang otomatis mendapat fitur ini
  rollout_pct smallint not null default 100 check (rollout_pct between 0 and 100),
  updated_at timestamptz not null default now()
);
create table if not exists public.tenant_flag_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null references public.feature_flags(key) on delete cascade,
  enabled boolean not null,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
alter table public.feature_flags enable row level security;
alter table public.tenant_flag_overrides enable row level security;
create policy flags_read on public.feature_flags for select using (auth.uid() is not null);
create policy flag_over_sa on public.tenant_flag_overrides for select using (is_superadmin());

insert into public.feature_flags (key, description, default_enabled, plans) values
  ('menu_engineering', 'Menu engineering & peringatan margin', true, '{}'),
  ('vouchers', 'Promo & voucher', true, '{}'),
  ('cash_projection', 'Proyeksi arus kas', false, '{growth,enterprise}'),
  ('ai_copilot', 'AI Copilot Owner', false, '{growth,enterprise}'),
  ('benchmark', 'Benchmark anonim antar-tenant', false, '{growth,enterprise}'),
  ('offline_pos', 'Mode offline kasir', false, '{growth,enterprise}')
on conflict (key) do nothing;

-- Urutan: override tenant → (default atau paket) → persentase rollout (hash stabil per tenant).
create or replace function public.has_flag(p_tenant uuid, p_key text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare f feature_flags; o boolean; pc text;
begin
  select enabled into o from tenant_flag_overrides where tenant_id = p_tenant and key = p_key;
  if found then return o; end if;
  select * into f from feature_flags where key = p_key;
  if not found then return false; end if;
  select p.code into pc from tenants t join plans p on p.id = t.plan_id where t.id = p_tenant;
  if not (f.default_enabled or (pc is not null and pc = any(f.plans))) then return false; end if;
  return ((hashtextextended(p_tenant::text || p_key, 0) & 2147483647) % 100) < f.rollout_pct;
end $$;

create or replace function public.my_flags() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, case when current_tenant_id() is null then false else has_flag(current_tenant_id(), key) end), '{}') from feature_flags $$;

create or replace function public.set_feature_flag(p_key text, p_description text, p_default boolean, p_plans text[], p_rollout int default 100)
returns feature_flags language plpgsql security definer set search_path = public as $$
declare f feature_flags;
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola feature flag'; end if;
  insert into feature_flags (key, description, default_enabled, plans, rollout_pct) values (p_key, p_description, p_default, coalesce(p_plans, '{}'), p_rollout)
  on conflict (key) do update set description = excluded.description, default_enabled = excluded.default_enabled, plans = excluded.plans,
        rollout_pct = excluded.rollout_pct, updated_at = now() returning * into f;
  insert into audit_logs (actor_id, actor_role, action, entity, entity_id, detail)
  values (auth.uid(), current_app_role(), 'flag_saved', 'feature_flags', p_key, to_jsonb(f));
  return f;
end $$;

create or replace function public.set_flag_override(p_tenant uuid, p_key text, p_enabled boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin yang mengelola feature flag'; end if;
  if p_enabled is null then
    delete from tenant_flag_overrides where tenant_id = p_tenant and key = p_key;
  else
    insert into tenant_flag_overrides (tenant_id, key, enabled, reason) values (p_tenant, p_key, p_enabled, p_reason)
    on conflict (tenant_id, key) do update set enabled = excluded.enabled, reason = excluded.reason, updated_at = now();
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'flag_override', 'feature_flags', p_key, jsonb_build_object('enabled', p_enabled, 'reason', p_reason));
end $$;

-- Terapkan flag pada fitur Fase 3/4 yang berbayar (copilot_snapshot = salinan migrasi 16 + satu syarat).
create or replace function public.copilot_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); kpi jsonb; menu jsonb; cash jsonb; pend int; lowstock int; voids7 int;
begin
  perform _need(2, 'r');
  if current_app_role()::text not in ('owner', 'superadmin') then raise exception 'Copilot hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'ai_copilot') then raise exception 'AI Copilot tidak termasuk paket tenant ini'; end if;
  select coalesce(jsonb_agg(to_jsonb(k)), '[]') into kpi from branch_kpi() k;
  select jsonb_build_object(
      'bintang', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'star' limit 5) x), '[]'),
      'laris_margin_tipis', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class = 'plowhorse' limit 5) x), '[]'),
      'perlu_dievaluasi', coalesce((select jsonb_agg(name) from (select name from menu_engineering(null, 30) where class in ('dog', 'belum_laku') limit 5) x), '[]'))
    into menu;
  cash := cash_projection(30, 14) - 'rows';
  select count(*) into pend from approvals where tenant_id = t and status = 'pending';
  select count(*) into lowstock from stock_levels s join inventory_items i on i.id = s.item_id where i.tenant_id = t and i.min_qty > 0 and s.qty < i.min_qty;
  select count(*) into voids7 from orders where tenant_id = t and status = 'void' and created_at > now() - interval '7 days';
  return jsonb_build_object('generated_at', now(), 'kpi_bulan_ini', kpi, 'menu', menu, 'kas', cash,
                            'persetujuan_menunggu', pend, 'stok_di_bawah_minimum', lowstock, 'void_7_hari', voids7);
end $$;

create or replace function public.cash_projection(p_days int default 30, p_ap_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); today date; opening numeric; ap numeric; payroll numeric; pday int; sales28 numeric; cogs28 numeric;
        fixed_day numeric; cogs_ratio numeric; bal numeric; i int; d date; inflow numeric; outflow numeric; wd numeric[] := array_fill(0::numeric, array[7]);
        wdn int[] := array_fill(0, array[7]); rows jsonb := '[]'; minbal numeric; first_neg date; r record; assumptions jsonb;
begin
  perform _need(12, 'r');
  if current_app_role()::text not in ('owner', 'gm', 'superadmin') then raise exception 'Proyeksi kas hanya untuk Owner/GM'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'cash_projection') then raise exception 'Proyeksi kas tidak termasuk paket tenant ini'; end if;
  if p_days not between 7 and 90 then raise exception 'Horizon 7–90 hari'; end if;
  today := _tenant_now(t)::date;
  select coalesce(sum(l.debit - l.credit), 0) into opening from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code in ('1101', '1102');
  select coalesce(sum(l.credit - l.debit), 0) into ap from journal_lines l join accounts a on a.id = l.account_id where a.tenant_id = t and a.code = '2101';
  select coalesce(max(l.debit), 0) into payroll from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.code = '6101' and e.entry_date >= today - 62;
  select payroll_day into pday from tenants where id = t;
  for r in select extract(dow from o.paid_at at time zone (select timezone from tenants where id = t))::int dw, sum(o.total) s from orders o
            where o.tenant_id = t and o.status = 'paid' and o.paid_at >= now() - interval '28 days' group by 1 loop
    wd[r.dw + 1] := r.s / 4;                             -- 28 hari = 4 kali tiap hari-dalam-minggu
  end loop;
  select coalesce(sum(total), 0), coalesce(sum(cogs), 0) into sales28, cogs28 from orders where tenant_id = t and status = 'paid' and paid_at >= now() - interval '28 days';
  cogs_ratio := case when sales28 > 0 then cogs28 / sales28 else 0 end;
  select coalesce(sum(l.debit - l.credit), 0) / 28 into fixed_day from journal_lines l join journal_entries e on e.id = l.entry_id join accounts a on a.id = l.account_id
   where a.tenant_id = t and a.type = 'expense' and a.code not in ('6101', '6104') and e.entry_date >= today - 28;
  bal := opening; minbal := opening;
  for i in 1..p_days loop
    d := today + i;
    inflow := wd[extract(dow from d)::int + 1];
    outflow := inflow * cogs_ratio + fixed_day;
    if extract(day from d)::int = pday then outflow := outflow + payroll; end if;
    if i = p_ap_days then outflow := outflow + greatest(ap, 0); end if;
    bal := bal + inflow - outflow;
    minbal := least(minbal, bal);
    if bal < 0 and first_neg is null then first_neg := d; end if;
    rows := rows || jsonb_build_array(jsonb_build_object('date', d, 'inflow', round(inflow), 'outflow', round(outflow), 'balance', round(bal)));
  end loop;
  assumptions := jsonb_build_array(
    'Penjualan = rata-rata per hari-dalam-minggu dari 28 hari terakhir (tanpa tren musiman).',
    format('Pembelian bahan = %s%% dari penjualan (HPP historis).', round(cogs_ratio * 100, 1)),
    format('Beban tetap rata-rata %s per hari, di luar gaji dan waste.', _rp(round(fixed_day))),
    format('Gaji %s dibayar tanggal %s tiap bulan (dari jurnal gaji terakhir).', _rp(payroll), pday),
    format('Utang dagang %s dibayar hari ke-%s.', _rp(greatest(ap, 0)), p_ap_days));
  return jsonb_build_object('opening', round(opening), 'min_balance', round(minbal), 'first_negative_date', first_neg,
                            'ending', round(bal), 'days', p_days, 'assumptions', assumptions, 'rows', rows);
end $$;

-- ═══ 4.3 Metering AI ═════════════════════════════════════════════════════════
-- Kuota token per bulan: tenants.ai_quota_override, kalau kosong plans.ai_quota_tokens; plans.ai_unlimited = tanpa batas.
-- Soft limit: cek sebelum panggilan, catat sesudahnya (satu panggilan terakhir boleh melewati kuota).
create table if not exists public.ai_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month date not null,
  calls int not null default 0,
  tokens bigint not null default 0,
  primary key (tenant_id, month)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_read on public.ai_usage for select using (is_superadmin() or (tenant_ok(tenant_id) and has_perm(1, 'r')));

create or replace function public._ai_quota(p_tenant uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select case when t.ai_quota_override is not null then t.ai_quota_override when p.ai_unlimited then null else coalesce(p.ai_quota_tokens, 0) end
  from tenants t left join plans p on p.id = t.plan_id where t.id = p_tenant $$;
revoke execute on function public._ai_quota(uuid) from public, anon, authenticated;

create or replace function public.ai_quota_check(p_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q bigint; u bigint;
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  q := _ai_quota(p_tenant);
  select coalesce(tokens, 0) into u from ai_usage where tenant_id = p_tenant and month = date_trunc('month', now())::date;
  u := coalesce(u, 0);
  return jsonb_build_object('allowed', q is null or u < q, 'used', u, 'quota', q);
end $$;

create or replace function public.ai_record_usage(p_tenant uuid, p_tokens bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then raise exception 'Hanya untuk jalur sistem'; end if;
  insert into ai_usage (tenant_id, month, calls, tokens) values (p_tenant, date_trunc('month', now())::date, 1, greatest(coalesce(p_tokens, 0), 0))
  on conflict (tenant_id, month) do update set calls = ai_usage.calls + 1, tokens = ai_usage.tokens + greatest(coalesce(p_tokens, 0), 0);
end $$;
revoke execute on function public.ai_quota_check(uuid), public.ai_record_usage(uuid, bigint) from public, anon, authenticated;

create or replace function public.ai_usage_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); q bigint; u ai_usage;
begin
  perform _need(1, 'r');
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  q := _ai_quota(t);
  select * into u from ai_usage where tenant_id = t and month = date_trunc('month', now())::date;
  return jsonb_build_object('month', date_trunc('month', now())::date, 'calls', coalesce(u.calls, 0), 'tokens', coalesce(u.tokens, 0), 'quota', q,
                            'pct', case when q is null or q = 0 then null else round(coalesce(u.tokens, 0)::numeric / q * 100, 1) end);
end $$;

create or replace function public.set_ai_quota(p_tenant uuid, p_tokens bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_superadmin() then raise exception 'Hanya Superadmin'; end if;
  update tenants set ai_quota_override = p_tokens where id = p_tenant;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p_tenant, auth.uid(), current_app_role(), 'ai_quota_set', 'tenants', p_tenant::text, jsonb_build_object('tokens', p_tokens));
end $$;

-- ═══ 4.4 Template industri ═══════════════════════════════════════════════════
create table if not exists public.industry_templates (
  key text primary key,
  name text not null,
  pillar public.pillar not null,
  spec jsonb not null
);
alter table public.industry_templates enable row level security;
create policy industry_tpl_read on public.industry_templates for select using (auth.uid() is not null);

insert into public.industry_templates (key, name, pillar, spec) values
 ('fnb_cafe', 'Kafe & Resto', 'fnb', $j${
   "products": [
     {"sku":"KP-001","name":"Kopi Susu","category":"Kopi","price":22000,"station":"barista"},
     {"sku":"KP-002","name":"Americano","category":"Kopi","price":18000,"station":"barista"},
     {"sku":"NM-001","name":"Teh Lemon","category":"Non-Kopi","price":15000,"station":"barista"},
     {"sku":"MK-001","name":"Nasi Goreng","category":"Makanan","price":32000,"station":"dapur"},
     {"sku":"MK-002","name":"Mie Goreng","category":"Makanan","price":30000,"station":"dapur"},
     {"sku":"SN-001","name":"Kentang Goreng","category":"Camilan","price":20000,"station":"dapur"}],
   "checklists": [
     {"kind":"open","items":[{"key":"bersih","label":"Area kasir & meja bersih"},{"key":"kulkas","label":"Suhu kulkas aman"},{"key":"modal","label":"Uang modal dihitung"}]},
     {"kind":"close","items":[{"key":"kompor","label":"Kompor & gas dimatikan"},{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"sampah","label":"Sampah dibuang"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":21},{"kind":"margin_watch","freq":"weekly","hour":9,"weekday":1}],
   "settings": {"margin_alert_pct": 38}}$j$),
 ('retail_toko', 'Toko Retail', 'retail', $j${
   "products": [
     {"sku":"UM-001","name":"Barang Contoh A","category":"Umum","price":25000},
     {"sku":"UM-002","name":"Barang Contoh B","category":"Umum","price":50000}],
   "checklists": [
     {"kind":"open","items":[{"key":"rak","label":"Rak & display rapi"},{"key":"modal","label":"Uang modal dihitung"}]},
     {"kind":"close","items":[{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"kunci","label":"Pintu & gudang terkunci"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":21}],
   "settings": {"margin_alert_pct": 70}}$j$),
 ('service_salon', 'Salon & Layanan', 'service', $j${
   "products": [
     {"sku":"SV-001","name":"Potong Rambut","category":"Layanan","price":50000},
     {"sku":"SV-002","name":"Creambath","category":"Layanan","price":90000},
     {"sku":"SV-003","name":"Manicure","category":"Layanan","price":70000}],
   "checklists": [
     {"kind":"open","items":[{"key":"alat","label":"Alat disterilisasi"},{"key":"bersih","label":"Area kerja bersih"}]},
     {"kind":"close","items":[{"key":"kas","label":"Kas dihitung & dicocokkan"},{"key":"alat","label":"Alat dibersihkan"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":20}],
   "settings": {"margin_alert_pct": 50}}$j$),
 ('health_klinik_gigi', 'Klinik Gigi', 'health', $j${
   "products": [
     {"sku":"KG-001","name":"Konsultasi","category":"Layanan","price":75000},
     {"sku":"KG-002","name":"Scaling","category":"Tindakan","price":350000},
     {"sku":"KG-003","name":"Tambal Gigi","category":"Tindakan","price":300000}],
   "checklists": [
     {"kind":"open","items":[{"key":"steril","label":"Instrumen steril tersedia"},{"key":"unit","label":"Dental unit berfungsi"}]},
     {"kind":"close","items":[{"key":"limbah","label":"Limbah medis dipisah"},{"key":"kas","label":"Kas dihitung & dicocokkan"}]}],
   "reports": [{"kind":"daily_sales","freq":"daily","hour":20}],
   "settings": {"margin_alert_pct": 60}}$j$)
on conflict (key) do nothing;

-- Idempotent: tidak menimpa data yang sudah ada (SKU/checklist/jadwal yang sama dilewati). Pengaturan hanya bila diminta.
create or replace function public.apply_industry_template(p_key text, p_apply_settings boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); tp industry_templates; pil public.pillar; it jsonb; cl jsonb; rp jsonb; np int := 0; nc int := 0; nr int := 0; k int;
begin
  perform _need(3, 'c');
  if current_app_role()::text <> 'owner' then raise exception 'Hanya Owner yang menerapkan template industri'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  select * into tp from industry_templates where key = p_key;
  if not found then raise exception 'Template tidak ditemukan'; end if;
  select pillar into pil from tenants where id = t;
  if tp.pillar <> pil then raise exception 'Template % untuk jenis usaha lain', tp.name; end if;
  for it in select * from jsonb_array_elements(tp.spec->'products') loop
    insert into products (tenant_id, sku, name, category, price, station)
    values (t, it->>'sku', it->>'name', coalesce(it->>'category', 'Umum'), (it->>'price')::numeric, coalesce(it->>'station', 'dapur')) on conflict (tenant_id, sku) do nothing;
    get diagnostics k = row_count; np := np + k;
  end loop;
  for cl in select * from jsonb_array_elements(coalesce(tp.spec->'checklists', '[]')) loop
    insert into checklist_templates (tenant_id, branch_id, kind, items) values (t, null, cl->>'kind', cl->'items') on conflict do nothing;
    get diagnostics k = row_count; nc := nc + k;
  end loop;
  for rp in select * from jsonb_array_elements(coalesce(tp.spec->'reports', '[]')) loop
    insert into report_schedules (tenant_id, kind, freq, hour, weekday) values (t, rp->>'kind', rp->>'freq', (rp->>'hour')::int, nullif(rp->>'weekday', '')::int) on conflict (tenant_id, kind) do nothing;
    get diagnostics k = row_count; nr := nr + k;
  end loop;
  if p_apply_settings and tp.spec->'settings' ? 'margin_alert_pct' then
    update tenants set margin_alert_pct = (tp.spec->'settings'->>'margin_alert_pct')::numeric where id = t;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), 'owner', 'template_applied', 'industry_templates', p_key, jsonb_build_object('products', np, 'checklists', nc, 'reports', nr));
  return jsonb_build_object('products', np, 'checklists', nc, 'reports', nr);
end $$;

-- ═══ 4.5 Mode offline ════════════════════════════════════════════════════════
-- Klien menyimpan penjualan di antrean lokal (src/lib/offlineQueue.js) lalu mengirim batch saat online.
-- Idempotent lewat client_ref; tiap transaksi diproses terpisah (satu gagal tidak menggagalkan yang lain).
alter table public.orders add column if not exists client_ref text;
create unique index if not exists orders_client_ref_uq on public.orders (tenant_id, client_ref) where client_ref is not null;

create or replace function public.sync_offline_orders(p_device text, p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e jsonb; o orders; res jsonb := '[]'; ref text; ex orders; at_ timestamptz; t uuid; diff numeric; flagged boolean;
begin
  perform _need(5, 'c');
  if jsonb_typeof(p_batch) <> 'array' then raise exception 'Batch harus berupa array'; end if;
  if jsonb_array_length(p_batch) > 50 then raise exception 'Maksimal 50 transaksi per sinkronisasi'; end if;
  t := current_tenant_id();
  if t is null or not has_flag(t, 'offline_pos') then raise exception 'Mode offline tidak termasuk paket tenant ini'; end if;
  for e in select * from jsonb_array_elements(p_batch) loop
    ref := left(btrim(coalesce(e->>'client_ref', '')), 80);
    if ref = '' then res := res || jsonb_build_array(jsonb_build_object('client_ref', null, 'status', 'error', 'error', 'client_ref wajib')); continue; end if;
    select * into ex from orders where tenant_id = t and client_ref = ref;
    if found then res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'duplicate', 'code', ex.code)); continue; end if;
    begin
      o := create_order((e->>'branch_id')::uuid, e->'items', null, 'dine_in', null);
      o := pay_order(o.id, e->'payments', nullif(e->>'customer_phone', ''), nullif(e->>'discount', '')::numeric, nullif(e->>'pin', ''));
      at_ := coalesce((e->>'created_at')::timestamptz, now());
      flagged := at_ > now() or at_ < now() - interval '72 hours';
      update orders set client_ref = ref where id = o.id returning * into o;
      diff := coalesce(nullif(e->>'expected_total', '')::numeric, o.total) - o.total;
      res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'ok', 'code', o.code, 'total', o.total,
                'total_diff', diff, 'time_suspect', flagged));
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (t, auth.uid(), current_app_role(), 'offline_sync', 'orders', o.id::text, jsonb_build_object('device', left(p_device, 60), 'client_at', at_, 'diff', diff, 'suspect', flagged));
    exception when others then
      res := res || jsonb_build_array(jsonb_build_object('client_ref', ref, 'status', 'error', 'error', sqlerrm));
    end;
  end loop;
  return res;
end $$;

-- ═══ 4.6 Benchmark anonim ════════════════════════════════════════════════════
-- Opt-in per tenant. Hanya rasio (bukan angka mutlak) yang dibandingkan, per jenis usaha, dan hanya bila kohort ≥ 5 tenant.
alter table public.tenants add column if not exists benchmark_opt_in boolean not null default false;
create table if not exists public.benchmark_monthly (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  month date not null,
  pillar public.pillar not null,
  avg_ticket numeric, cogs_pct numeric, void_pct numeric, discount_pct numeric, revenue_per_branch numeric,
  primary key (tenant_id, month)
);
alter table public.benchmark_monthly enable row level security;      -- tanpa policy: tidak ada yang bisa membaca langsung

create or replace function public.set_benchmark_opt_in(p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform _need(2, 'c');
  if current_app_role()::text <> 'owner' then raise exception 'Hanya Owner'; end if;
  update tenants set benchmark_opt_in = coalesce(p_on, false) where id = current_tenant_id();
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (current_tenant_id(), auth.uid(), 'owner', 'benchmark_opt_in', 'tenants', current_tenant_id()::text, jsonb_build_object('on', p_on));
  return coalesce(p_on, false);
end $$;

create or replace function public.refresh_benchmark(p_month date default null) returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', coalesce(p_month, now() - interval '1 month'))::date; n int := 0; r record;
begin
  if auth.uid() is not null and not is_superadmin() then raise exception 'Hanya untuk Superadmin/sistem'; end if;
  for r in select t.id, t.pillar, count(distinct b.id) nb from tenants t join branches b on b.tenant_id = t.id where t.benchmark_opt_in and t.status in ('active', 'past_due') group by t.id, t.pillar loop
    with k as (select coalesce(sum(revenue), 0) rev, coalesce(sum(orders), 0) ord, coalesce(sum(cogs), 0) cg, coalesce(sum(discount), 0) dc,
                      coalesce(sum(void_count), 0) vc, coalesce(sum(all_count), 0) ac from _kpi(r.id, m::timestamptz, (m + interval '1 month')::timestamptz))
    insert into benchmark_monthly (tenant_id, month, pillar, avg_ticket, cogs_pct, void_pct, discount_pct, revenue_per_branch)
    select r.id, m, r.pillar, case when ord > 0 then rev / ord end, case when rev > 0 then cg / rev * 100 end, case when ac > 0 then vc::numeric / ac * 100 end,
           case when rev + dc > 0 then dc / (rev + dc) * 100 end, rev / r.nb from k where ord > 0
    on conflict (tenant_id, month) do update set avg_ticket = excluded.avg_ticket, cogs_pct = excluded.cogs_pct, void_pct = excluded.void_pct,
         discount_pct = excluded.discount_pct, revenue_per_branch = excluded.revenue_per_branch, pillar = excluded.pillar;
    n := n + 1;
  end loop;
  delete from benchmark_monthly b using tenants t where t.id = b.tenant_id and not t.benchmark_opt_in;      -- cabut opt-in → data ikut hilang
  return n;
end $$;

create or replace function public.my_benchmark(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid := current_tenant_id(); m date := date_trunc('month', coalesce(p_month, now() - interval '1 month'))::date; me benchmark_monthly; n int; out jsonb := '{}'; piece jsonb; col text;
begin
  perform _need(2, 'r');
  if current_app_role()::text <> 'owner' then raise exception 'Benchmark hanya untuk Owner'; end if;
  if t is null then raise exception 'Pilih tenant terlebih dahulu'; end if;
  if not has_flag(t, 'benchmark') then raise exception 'Benchmark tidak termasuk paket tenant ini'; end if;
  if not (select benchmark_opt_in from tenants where id = t) then return jsonb_build_object('available', false, 'reason', 'Aktifkan partisipasi benchmark terlebih dahulu'); end if;
  select * into me from benchmark_monthly where tenant_id = t and month = m;
  if not found then return jsonb_build_object('available', false, 'reason', 'Data bulan ini belum dihitung'); end if;
  select count(*) into n from benchmark_monthly where pillar = me.pillar and month = m and tenant_id <> t;
  if n < 4 then return jsonb_build_object('available', false, 'reason', 'Kohort belum cukup (minimal 5 tenant sejenis)'); end if;
  foreach col in array array['avg_ticket', 'cogs_pct', 'void_pct', 'discount_pct', 'revenue_per_branch'] loop
    execute format($q$select jsonb_build_object('mine', round(($1).%I::numeric, 1),
        'p25', round(percentile_cont(0.25) within group (order by %I)::numeric, 1), 'median', round(percentile_cont(0.5) within group (order by %I)::numeric, 1),
        'p75', round(percentile_cont(0.75) within group (order by %I)::numeric, 1),
        'rank_pct', round(100.0 * count(*) filter (where %I < ($1).%I) / count(*), 0))
      from benchmark_monthly where pillar = ($1).pillar and month = ($1).month$q$, col, col, col, col, col, col) using me into piece;
    out := out || jsonb_build_object(col, piece);
  end loop;
  return jsonb_build_object('available', true, 'month', m, 'cohort_size', n + 1, 'metrics', out);
end $$;

-- ═══ Hak eksekusi ════════════════════════════════════════════════════════════
grant execute on function public.create_reseller(text, text, text, numeric), public.assign_reseller(uuid, uuid), public.reseller_statement(uuid),
  public.pay_reseller_commissions(uuid), public.generate_invoices(date), public.run_dunning(), public.mark_invoice_paid(uuid, text), public.void_invoice(uuid, text),
  public.billing_status(), public.my_flags(), public.set_feature_flag(text, text, boolean, text[], int), public.set_flag_override(uuid, text, boolean, text),
  public.ai_usage_summary(), public.set_ai_quota(uuid, bigint), public.apply_industry_template(text, boolean), public.sync_offline_orders(text, jsonb),
  public.set_benchmark_opt_in(boolean), public.refresh_benchmark(date), public.my_benchmark(date) to authenticated;
-- run_dunning / generate_invoices / refresh_benchmark: Superadmin atau sistem. service_role memanggil tanpa JWT (auth.uid() null).
grant execute on function public.generate_invoices(date), public.run_dunning(), public.refresh_benchmark(date), public.ai_quota_check(uuid),
  public.ai_record_usage(uuid, bigint), public.mark_invoice_paid_system(uuid, text) to service_role;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000018_realtime_publications.sql
-- ══════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 18: Publikasi Supabase Realtime & Sinkronisasi Platform Settings
-- Mengaktifkan event WebSocket real-time untuk semua tabel operasional & master,
-- memastikan tidak ada ketergantungan pada localStorage / cache lokal usang.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Pastikan platform_settings tersinkronisasi dengan konfigurasi 9router
insert into public.platform_settings (key, value, updated_at)
values (
  'ai_gateway',
  jsonb_build_object(
    'base_url', 'http://43.134.43.146:20128/v1',
    'default_model', 'harumin-combos',
    'fallback_chain', jsonb_build_array('hermes-combos', 'bemfkgumi-combos'),
    'timeout_ms', 10000,
    'secret_name', 'NINEROUTER_API_KEY'
  ),
  now()
)
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

-- 2. Atur REPLICA IDENTITY FULL untuk tabel-tabel utama agar payload UPDATE/DELETE lengkap di Realtime
alter table public.orders replica identity full;
alter table public.order_items replica identity full;
alter table public.tables replica identity full;
alter table public.queue_entries replica identity full;
alter table public.approvals replica identity full;
alter table public.shifts replica identity full;
alter table public.attendance replica identity full;
alter table public.stock_levels replica identity full;
alter table public.platform_settings replica identity full;
alter table public.tenant_integrations replica identity full;
alter table public.tenant_policies replica identity full;
alter table public.support_tickets replica identity full;
alter table public.ticket_messages replica identity full;
alter table public.support_sessions replica identity full;

-- 3. Tambahkan semua tabel operasional & master ke publikasi supabase_realtime
do $$
declare
  t text;
  pub_tables text[] := array[
    'orders', 'order_items', 'tables', 'products', 'customers',
    'stock_levels', 'stock_counts', 'stock_movements', 'stock_transfers', 'purchase_orders',
    'profiles', 'member_branches', 'staff_invites', 'tenants', 'branches',
    'shifts', 'attendance', 'approvals', 'petty_cash', 'payments',
    'support_tickets', 'ticket_messages', 'support_sessions', 'tenant_policies',
    'platform_settings', 'tenant_integrations', 'hermes_events',
    'queue_entries', 'visits', 'patients', 'prescriptions', 'prescription_items',
    'odontogram_entries', 'visit_diagnoses', 'visit_procedures', 'satusehat_outbox',
    'invoices', 'plans', 'resellers', 'reseller_commissions'
  ];
begin
  foreach t in array pub_tables loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end if;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- MIGRASI 20261011000019_fase5_hardening.sql
-- ══════════════════════════════════════════════════════════════════════
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

-- ══════════════════════════════════════════════════════════════════════
-- DATA DEMO (supabase/seed.sql)
-- ══════════════════════════════════════════════════════════════════════
-- AUTO-GENERATED oleh scripts/gen-seed.mjs. Dijalankan otomatis oleh `supabase db reset`.
-- ═══════════ DATA DEMO ═══════════
-- Semua angka di bawah adalah DATA DEMO untuk mencoba dashboard, bukan data bisnis nyata.
select setseed(0.42);

insert into public.plans (id, code, name, price_month, max_branches, modules) values
  ('00000000-0000-0000-0000-0000000000a1', 'starter',    'Starter (1 Bulan)',    500000,  1, '{M1,M2,M3,M6}'),
  ('00000000-0000-0000-0000-0000000000a2', 'growth',     'Growth (6 Bulan)',     2500000, 5, '{M1,M2,M3,M4,M5,M6,M7,M8}'),
  ('00000000-0000-0000-0000-0000000000a3', 'enterprise', 'Enterprise (1 Tahun)', 3500000, 99, '{M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12}');

insert into public.tenants (id, name, slug, pillar, status, plan_id, current_period_end, owner_email) values
  ('00000000-0000-0000-0000-000000000001', 'Kopi Harum Makassar', 'kopi-harum', 'fnb', 'active',
   '00000000-0000-0000-0000-0000000000a2', '2027-04-12', 'owner@demo.harum.in'),
  ('00000000-0000-0000-0000-000000000002', 'Klinik Gigi Senyum', 'klinik-senyum', 'health', 'trial',
   '00000000-0000-0000-0000-0000000000a3', '2027-10-12', 'drg@klinik-senyum.test'),
  ('00000000-0000-0000-0000-000000000003', 'Toko Bangunan Jaya', 'tb-jaya', 'retail', 'past_due',
   '00000000-0000-0000-0000-0000000000a1', current_date - 4, 'admin@tbjaya.test'),
  ('00000000-0000-0000-0000-000000000004', 'Salon Ayu', 'salon-ayu', 'service', 'suspended',
   '00000000-0000-0000-0000-0000000000a1', current_date - 40, 'ayu@salon.test');

insert into public.invoices (tenant_id, period, amount, status) values
  ('00000000-0000-0000-0000-000000000001', '2026-10-12'::date, 2500000, 'paid'),
  ('00000000-0000-0000-0000-000000000003', '2026-10-12'::date, 500000, 'unpaid'),
  ('00000000-0000-0000-0000-000000000004', '2026-09-12'::date, 500000, 'unpaid');

insert into public.branches (id, tenant_id, name, city, address, lat, lng) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', 'Cabang Pettarani', 'Makassar', 'Jl. A. P. Pettarani', -5.1561, 119.4363),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', 'Cabang Panakkukang', 'Makassar', 'Jl. Boulevard', -5.1530, 119.4470),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000002', 'Klinik Utama', 'Makassar', 'Jl. Sam Ratulangi', -5.1460, 119.4150);

insert into public.platform_settings (key, value) values
  ('ai_gateway', jsonb_build_object(
     'base_url', 'http://127.0.0.1:20128/v1',
     'default_model', 'auto',
     'fallback_chain', jsonb_build_array('claude', 'gemini', 'openai', 'deepseek'),
     'timeout_ms', 20000,
     'secret_name', 'NINEROUTER_API_KEY')),
  ('hermes', jsonb_build_object(
     'webhook_url_secret', 'HERMES_WEBHOOK_URL',
     'token_secret', 'HERMES_TOKEN',
     'z_report_hour', 23,
     'low_stock_alert', true))
on conflict (key) do nothing;   -- migrasi realtime_publications sudah menyisipkan ai_gateway; jangan menimpa/gagal

insert into public.tenant_integrations (tenant_id, hermes_enabled, whatsapp_owner, whatsapp_gm, ai_enabled) values
  ('00000000-0000-0000-0000-000000000001', true, '+62 811-0000-0001 (demo)', '+62 811-0000-0002 (demo)', true),
  ('00000000-0000-0000-0000-000000000002', false, null, null, false);

-- Bagan akun ringkas (PSAK) untuk tenant demo utama.
insert into public.accounts (id, tenant_id, code, name, type) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', '1101', 'Kas & Bank', 'asset'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000001', '1301', 'Persediaan Bahan Baku', 'asset'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000001', '2101', 'Utang Dagang', 'liability'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-000000000001', '3101', 'Modal Pemilik', 'equity'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000001', '4101', 'Pendapatan Penjualan', 'revenue'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000001', '5101', 'Harga Pokok Penjualan', 'cogs'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-000000000001', '6101', 'Beban Gaji', 'expense'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-000000000001', '6102', 'Beban Sewa', 'expense'),
  ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-000000000001', '6103', 'Beban Listrik & Internet', 'expense');

-- 60 hari transaksi demo per cabang.
insert into public.orders (tenant_id, branch_id, code, status, channel, subtotal, discount, tax, total, cogs, created_at, paid_at)
select '00000000-0000-0000-0000-000000000001', b.id,
       'ORD-' || to_char(d, 'YYMMDD') || '-' || right(b.id::text, 2) || '-' || lpad(n::text, 3, '0'),
       'paid', (array['dine_in','takeaway','online'])[1 + floor(random() * 3)::int],
       sub, disc, round((sub - disc) * 0.10), round((sub - disc) * 1.10), round(sub * (0.34 + random() * 0.08)),
       ts.at, ts.at
from generate_series(current_date - 59, current_date, interval '1 day') d
cross join public.branches b
cross join lateral generate_series(1, (case when b.name like '%Pettarani%' then 55 else 38 end)
                                      + floor(random() * 25)::int
                                      + (case when extract(isodow from d) >= 6 then 18 else 0 end)) n
cross join lateral (select round((28000 + random() * 160000) / 500) * 500 as sub) s
cross join lateral (select case when random() < 0.12 then round(s.sub * 0.1) else 0 end as disc) dd
cross join lateral (select d + interval '8 hours' + random() * interval '13 hours' as at) ts
where b.tenant_id = '00000000-0000-0000-0000-000000000001';

-- Jurnal harian otomatis dari penjualan (Dr Kas / Cr Pendapatan; Dr HPP / Cr Persediaan).
with daily as (
  select paid_at::date d, branch_id b, sum(total - tax) rev, sum(cogs) hpp
  from public.orders where tenant_id = '00000000-0000-0000-0000-000000000001' group by 1, 2
), je as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  select '00000000-0000-0000-0000-000000000001', b, d, 'Rekap penjualan POS', 'pos' from daily
  returning id, branch_id, entry_date
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000001', je.id, x.acc, x.dr, x.cr
from je join daily on daily.d = je.entry_date and daily.b = je.branch_id
cross join lateral (values
  ('00000000-0000-0000-0000-0000000000c1'::uuid, daily.rev, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c5'::uuid, 0::numeric, daily.rev),
  ('00000000-0000-0000-0000-0000000000c6'::uuid, daily.hpp, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c2'::uuid, 0::numeric, daily.hpp)) x(acc, dr, cr);

-- Beban operasional harian per cabang (gaji, sewa, listrik) dibagi rata.
with je as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  select '00000000-0000-0000-0000-000000000001', b.id, d::date, 'Alokasi beban harian', 'expense'
  from generate_series(current_date - 59, current_date, interval '1 day') d
  cross join public.branches b where b.tenant_id = '00000000-0000-0000-0000-000000000001'
  returning id, branch_id
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000001', je.id, x.acc, x.dr, x.cr
from je cross join lateral (values
  ('00000000-0000-0000-0000-0000000000c7'::uuid, 1450000::numeric, 0::numeric),
  ('00000000-0000-0000-0000-0000000000c8'::uuid, 600000, 0),
  ('00000000-0000-0000-0000-0000000000c9'::uuid, 180000, 0),
  ('00000000-0000-0000-0000-0000000000c1'::uuid, 0, 2230000)) x(acc, dr, cr);

-- Void menunggu otorisasi, terhubung ke transaksi nyata hari ini di Cabang Panakkukang.
insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail)
select o.tenant_id, o.branch_id, 6, 'void', o.code, 'Void transaksi · salah input kasir', o.total,
       jsonb_build_object('order_id', o.id, 'alasan', 'Salah Input Kasir', 'catatan', 'Jumlah es kopi tertulis 3, seharusnya 2')
from public.orders o where o.branch_id = '00000000-0000-0000-0000-0000000000b2' and o.paid_at::date = current_date
order by o.paid_at desc limit 1;

insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail) values
  ('00000000-0000-0000-0000-000000000001', null, 20, 'supplies', 'SUP-0031',
   'Harum.in Supplies · cup 16oz 2.000 pcs', 1900000, '{"distributor": "demo"}');

insert into public.capital_applications (tenant_id, amount, tenor_months, purpose, status) values
  ('00000000-0000-0000-0000-000000000001', 75000000, 12, 'Renovasi cabang ketiga (demo)', 'review');

insert into public.payout_accounts (tenant_id, bank, account_name, account_last4, verified) values
  ('00000000-0000-0000-0000-000000000001', 'BCA', 'PT Kopi Harum (demo)', '4821', true);

insert into public.hermes_events (tenant_id, channel, target, kind, message, status, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'whatsapp', 'Owner', 'z_report', 'Z-Report kemarin terkirim: ringkasan 2 cabang.', 'simulated', now() - interval '9 hours'),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp', 'GM', 'low_stock', 'Sirup Kopi Cabang Panakkukang tersisa 2 botol (minimum 5).', 'simulated', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-000000000001', 'discord', '#alert-sistem', 'void_alert', 'Permintaan void ORD-HARUM-9102 Rp 185.000 menunggu otorisasi.', 'simulated', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000001', 'discord', '#laporan-harian', 'margin_drop', 'Marjin kotor Cabang Panakkukang turun dibanding rata-rata 7 hari.', 'simulated', now() - interval '40 minutes');

-- ═══════════ DATA DEMO OPERASIONAL (FASE 2) ═══════════
insert into public.branches (id, tenant_id, name, city, address, lat, lng, is_warehouse) values
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000001', 'Gudang Pusat', 'Makassar', 'Jl. Perintis Kemerdekaan', -5.1300, 119.4900, true);

insert into public.accounts (tenant_id, code, name, type) values
  ('00000000-0000-0000-0000-000000000001', '1102', 'Bank, EDC & QRIS', 'asset'),
  ('00000000-0000-0000-0000-000000000001', '2102', 'Utang Pajak Penjualan', 'liability'),
  ('00000000-0000-0000-0000-000000000001', '2103', 'Utang Gaji', 'liability'),
  ('00000000-0000-0000-0000-000000000001', '6104', 'Beban Waste & Susut', 'expense'),
  ('00000000-0000-0000-0000-000000000001', '6105', 'Beban Kas Kecil Outlet', 'expense');

-- Bahan baku (biaya per satuan terkecil).
insert into public.inventory_items (id, tenant_id, code, name, unit, cost_per_unit, min_qty, is_semi) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-000000000001', 'BHN-001', 'Biji kopi arabika', 'g', 190, 2000, false),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-000000000001', 'BHN-002', 'Susu segar', 'ml', 22, 3000, false),
  ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-000000000001', 'BHN-003', 'Gula aren cair', 'ml', 40, 1000, false),
  ('00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-000000000001', 'BHN-004', 'Sirup kopi Harum.in', 'botol', 70000, 5, false),
  ('00000000-0000-0000-0000-00000000d005', '00000000-0000-0000-0000-000000000001', 'BHN-005', 'Es batu', 'g', 2, 5000, false),
  ('00000000-0000-0000-0000-00000000d006', '00000000-0000-0000-0000-000000000001', 'BHN-006', 'Cup 16oz', 'pcs', 950, 200, false),
  ('00000000-0000-0000-0000-00000000d007', '00000000-0000-0000-0000-000000000001', 'BHN-007', 'Beras', 'g', 14, 5000, false),
  ('00000000-0000-0000-0000-00000000d008', '00000000-0000-0000-0000-000000000001', 'BHN-008', 'Telur', 'pcs', 2200, 30, false),
  ('00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-000000000001', 'BHN-009', 'Daging ayam', 'g', 55, 2000, false),
  ('00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-000000000001', 'BHN-010', 'Minyak goreng', 'ml', 18, 2000, false),
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-000000000001', 'BHN-011', 'Bumbu racik', 'g', 60, 500, false),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-000000000001', 'BHN-012', 'Kemasan take-away', 'pcs', 1500, 100, false),
  ('00000000-0000-0000-0000-00000000d013', '00000000-0000-0000-0000-000000000001', 'BHN-013', 'Tulang ayam', 'g', 20, 3000, false),
  ('00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-000000000001', 'SUB-001', 'Kaldu ayam dasar', 'ml', 10.3, 2000, true),
  ('00000000-0000-0000-0000-00000000d015', '00000000-0000-0000-0000-000000000001', 'BHN-015', 'Mi telur', 'g', 30, 2000, false),
  ('00000000-0000-0000-0000-00000000d016', '00000000-0000-0000-0000-000000000001', 'BHN-016', 'Tepung terigu', 'g', 12, 3000, false),
  ('00000000-0000-0000-0000-00000000d017', '00000000-0000-0000-0000-000000000001', 'BHN-017', 'Mentega', 'g', 120, 1000, false);

insert into public.products (id, tenant_id, sku, name, category, price, station) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000001', 'MNM-01', 'Es Kopi Harum', 'Minuman', 32000, 'barista'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-000000000001', 'MNM-02', 'Kopi Susu Panas', 'Minuman', 28000, 'barista'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-000000000001', 'MNM-03', 'Americano', 'Minuman', 25000, 'barista'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-000000000001', 'MNM-04', 'Es Teh Aren', 'Minuman', 15000, 'barista'),
  ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-000000000001', 'MKN-01', 'Nasi Goreng Spesial', 'Makanan', 38000, 'dapur'),
  ('00000000-0000-0000-0000-00000000e006', '00000000-0000-0000-0000-000000000001', 'MKN-02', 'Mie Kuah Ayam', 'Makanan', 35000, 'dapur'),
  ('00000000-0000-0000-0000-00000000e007', '00000000-0000-0000-0000-000000000001', 'MKN-03', 'Sup Ayam', 'Makanan', 30000, 'dapur'),
  ('00000000-0000-0000-0000-00000000e008', '00000000-0000-0000-0000-000000000001', 'MKN-04', 'Ayam Bakar', 'Makanan', 45000, 'grill'),
  ('00000000-0000-0000-0000-00000000e009', '00000000-0000-0000-0000-000000000001', 'PST-01', 'Croissant Mentega', 'Pastry', 24000, 'pastry');

-- Resep (BOM). Nasi Goreng Spesial persis contoh dokumen.
insert into public.bom_lines (tenant_id, product_id, component_id, qty)
select '00000000-0000-0000-0000-000000000001', ('00000000-0000-0000-0000-00000000' || p)::uuid, ('00000000-0000-0000-0000-00000000' || c)::uuid, q
from (values
  ('e001','d001',18), ('e001','d002',150), ('e001','d003',25), ('e001','d005',120), ('e001','d006',1),
  ('e002','d001',18), ('e002','d002',180),
  ('e003','d001',18),
  ('e004','d003',30), ('e004','d005',150), ('e004','d006',1),
  ('e005','d007',150), ('e005','d008',1), ('e005','d009',30), ('e005','d010',10), ('e005','d011',5), ('e005','d012',1),
  ('e006','d015',120), ('e006','d014',300), ('e006','d009',40),
  ('e007','d014',350), ('e007','d009',50),
  ('e008','d009',200), ('e008','d011',15),
  ('e009','d016',60), ('e009','d017',35)) v(p, c, q);

-- Sub-resep: 10 liter kaldu dari 5 kg tulang + 50 g bumbu.
insert into public.bom_lines (tenant_id, parent_item_id, component_id, qty, yield_qty) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-00000000d013', 5000, 10000),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-00000000d011', 50, 10000);

-- Stok awal: gudang pusat besar, cabang sedang; sirup kopi Panakkukang 2 botol (contoh Alur 3).
insert into public.stock_levels (tenant_id, branch_id, item_id, qty)
select '00000000-0000-0000-0000-000000000001', b.id, i.id,
  case when b.is_warehouse then i.min_qty * 20 when i.code = 'BHN-004' and b.id = '00000000-0000-0000-0000-0000000000b2' then 2 else i.min_qty * 4 end
from public.branches b cross join public.inventory_items i
where b.tenant_id = '00000000-0000-0000-0000-000000000001' and i.tenant_id = b.tenant_id;

insert into public.tables (tenant_id, branch_id, label, area, seats, sort)
select '00000000-0000-0000-0000-000000000001', b, lpad(n::text, 2, '0'), case when n <= 6 then 'Lantai 1' else 'Lantai 2' end,
       case when n in (1, 6) then 6 else 4 end, n
from (values ('00000000-0000-0000-0000-0000000000b1'::uuid, 10), ('00000000-0000-0000-0000-0000000000b2'::uuid, 8)) v(b, cnt),
     generate_series(1, cnt) n;

insert into public.vendors (id, tenant_id, name, phone, bank, terms) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-000000000001', 'CV Kopi Toraja (demo)', '+62 811-0000-1001', 'BRI', 'Net 14'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-000000000001', 'UD Sumber Pangan (demo)', '+62 811-0000-1002', 'BCA', 'COD'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-000000000001', 'PT Kemasan Nusantara (demo)', '+62 811-0000-1003', 'Mandiri', 'Net 30');

-- PO menunggu persetujuan Owner (fitur 9).
with po as (
  insert into public.purchase_orders (tenant_id, branch_id, vendor_id, code, status, lines, total)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000f001',
          'PO-2610-014', 'pending', '[{"item_id":"00000000-0000-0000-0000-00000000d001","qty":25000,"price":190}]', 4750000)
  returning id, tenant_id, branch_id, code, total
)
insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail)
select tenant_id, branch_id, 9, 'po', code, 'PO biji kopi arabika Toraja 25 kg', total, jsonb_build_object('po_id', id) from po;

-- STO menunggu persetujuan GM (fitur 10: Approval & CRUD).
with s as (
  insert into public.stock_transfers (tenant_id, code, from_branch, to_branch, lines)
  values ('00000000-0000-0000-0000-000000000001', 'STO-0007', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b2',
          '[{"item_id":"00000000-0000-0000-0000-00000000d004","qty":12}]')
  returning id, tenant_id, to_branch, code
)
insert into public.approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail)
select tenant_id, to_branch, 10, 'sto', code, 'Transfer stok sirup kopi 12 botol ke Panakkukang', 840000, jsonb_build_object('sto_id', id) from s;

-- Saldo awal persediaan (modal pemilik), agar neraca demo masuk akal: menutup HPP historis + nilai stok saat ini.
with v as (
  select coalesce((select sum(l.credit - l.debit) from public.journal_lines l join public.accounts a on a.id = l.account_id
                   where a.tenant_id = '00000000-0000-0000-0000-000000000001' and a.code = '1301'), 0)
       + (select coalesce(sum(s.qty * i.cost_per_unit), 0) from public.stock_levels s join public.inventory_items i on i.id = s.item_id
          where s.tenant_id = '00000000-0000-0000-0000-000000000001') as amt
), e as (
  insert into public.journal_entries (tenant_id, entry_date, memo, source)
  values ('00000000-0000-0000-0000-000000000001', current_date - 60, 'Saldo awal persediaan (setoran modal)', 'financing')
  returning id
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000001', e.id, a.id,
       case when a.code = '1301' then round(v.amt) else 0 end, case when a.code = '3101' then round(v.amt) else 0 end
from e, v, public.accounts a where a.tenant_id = '00000000-0000-0000-0000-000000000001' and a.code in ('1301', '3101');

-- ═══════════ DATA DEMO KLINIK, RESERVASI & CRM (FASE 3) ═══════════
-- Semua nama, NIK, dan nomor telepon di bawah FIKTIF (kode kecamatan 99 sengaja tidak dipakai wilayah nyata).

-- Tarif layanan & obat Klinik Gigi Senyum (tenant 2).
insert into public.products (id, tenant_id, sku, name, category, price, station, icd9_code) values
  ('00000000-0000-0000-0000-00000002e001', '00000000-0000-0000-0000-000000000002', 'KNS-01', 'Konsultasi dokter gigi', 'Konsultasi', 150000, 'klinik', '89.31'),
  ('00000000-0000-0000-0000-00000002e002', '00000000-0000-0000-0000-000000000002', 'TND-01', 'Scaling & polishing', 'Tindakan', 350000, 'klinik', '96.54'),
  ('00000000-0000-0000-0000-00000002e003', '00000000-0000-0000-0000-000000000002', 'TND-02', 'Tambalan komposit (per gigi)', 'Tindakan', 300000, 'klinik', '23.2'),
  ('00000000-0000-0000-0000-00000002e004', '00000000-0000-0000-0000-000000000002', 'TND-03', 'Cabut gigi permanen', 'Tindakan', 250000, 'klinik', '23.09'),
  ('00000000-0000-0000-0000-00000002e005', '00000000-0000-0000-0000-000000000002', 'TND-04', 'Cabut gigi sulung', 'Tindakan', 150000, 'klinik', '23.01'),
  ('00000000-0000-0000-0000-00000002e006', '00000000-0000-0000-0000-000000000002', 'TND-05', 'Perawatan saluran akar (per kunjungan)', 'Tindakan', 600000, 'klinik', '23.70'),
  ('00000000-0000-0000-0000-00000002e007', '00000000-0000-0000-0000-000000000002', 'TND-06', 'Rontgen periapikal', 'Tindakan', 100000, 'klinik', '87.12'),
  ('00000000-0000-0000-0000-00000002e008', '00000000-0000-0000-0000-000000000002', 'TND-07', 'Odontektomi', 'Tindakan', 1500000, 'klinik', '23.19'),
  ('00000000-0000-0000-0000-00000002e011', '00000000-0000-0000-0000-000000000002', 'OBT-01', 'Amoksisilin 500 mg (tablet)', 'Obat', 2500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e012', '00000000-0000-0000-0000-000000000002', 'OBT-02', 'Asam mefenamat 500 mg (tablet)', 'Obat', 1500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e013', '00000000-0000-0000-0000-000000000002', 'OBT-03', 'Parasetamol 500 mg (tablet)', 'Obat', 1000, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e014', '00000000-0000-0000-0000-000000000002', 'OBT-04', 'Metronidazol 500 mg (tablet)', 'Obat', 2000, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e015', '00000000-0000-0000-0000-000000000002', 'OBT-05', 'Ibuprofen 400 mg (tablet)', 'Obat', 1500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e016', '00000000-0000-0000-0000-000000000002', 'OBT-06', 'Klorheksidin 0,2% obat kumur 150 ml', 'Obat', 45000, 'farmasi', null);

insert into public.inventory_items (id, tenant_id, code, name, unit, cost_per_unit, min_qty) values
  ('00000000-0000-0000-0000-00000002d011', '00000000-0000-0000-0000-000000000002', 'OBT-001', 'Amoksisilin 500 mg', 'tablet', 900, 100),
  ('00000000-0000-0000-0000-00000002d012', '00000000-0000-0000-0000-000000000002', 'OBT-002', 'Asam mefenamat 500 mg', 'tablet', 500, 100),
  ('00000000-0000-0000-0000-00000002d013', '00000000-0000-0000-0000-000000000002', 'OBT-003', 'Parasetamol 500 mg', 'tablet', 300, 100),
  ('00000000-0000-0000-0000-00000002d014', '00000000-0000-0000-0000-000000000002', 'OBT-004', 'Metronidazol 500 mg', 'tablet', 700, 100),
  ('00000000-0000-0000-0000-00000002d015', '00000000-0000-0000-0000-000000000002', 'OBT-005', 'Ibuprofen 400 mg', 'tablet', 500, 100),
  ('00000000-0000-0000-0000-00000002d016', '00000000-0000-0000-0000-000000000002', 'OBT-006', 'Klorheksidin 0,2% 150 ml', 'botol', 22000, 5);

-- Obat → stok: BOM 1:1, sehingga pembayaran di kasir memotong stok obat otomatis.
insert into public.bom_lines (tenant_id, product_id, component_id, qty)
select '00000000-0000-0000-0000-000000000002', ('00000000-0000-0000-0000-00000002e0' || n)::uuid, ('00000000-0000-0000-0000-00000002d0' || n)::uuid, 1
from unnest(array['11', '12', '13', '14', '15', '16']) n;

insert into public.stock_levels (tenant_id, branch_id, item_id, qty)
select tenant_id, '00000000-0000-0000-0000-0000000000b3', id, case when unit = 'botol' then 20 else 500 end
from public.inventory_items where tenant_id = '00000000-0000-0000-0000-000000000002';

insert into public.accounts (tenant_id, code, name, type) values
  ('00000000-0000-0000-0000-000000000002', '1301', 'Persediaan Obat & BHP', 'asset'),
  ('00000000-0000-0000-0000-000000000002', '3101', 'Modal Pemilik', 'equity');
with e as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', current_date - 20, 'Saldo awal persediaan obat (setoran modal)', 'financing')
  returning id
), v as (
  select round(sum(s.qty * i.cost_per_unit)) amt from public.stock_levels s join public.inventory_items i on i.id = s.item_id
  where s.tenant_id = '00000000-0000-0000-0000-000000000002'
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000002', e.id, a.id, case when a.code = '1301' then v.amt else 0 end, case when a.code = '3101' then v.amt else 0 end
from e, v, public.accounts a where a.tenant_id = '00000000-0000-0000-0000-000000000002' and a.code in ('1301', '3101');

update public.tenant_integrations set satusehat_enabled = true where tenant_id = '00000000-0000-0000-0000-000000000002';

-- Pasien lama dengan riwayat kunjungan & odontogram (kunjungan 30 hari lalu, sudah terkunci).
insert into public.patients (id, tenant_id, mrn, nik, name, birth_date, sex, phone, allergies) values
  ('00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-000000000002', 'RM-000001', '7371991204900001', 'Andi Rahmat (demo)', '1990-04-12', 'male', '081100000201', 'Penisilin (ruam kulit)'),
  ('00000000-0000-0000-0000-00000002a002', '00000000-0000-0000-0000-000000000002', 'RM-000002', '7371994308950002', 'Nurul Aini (demo)', '1995-08-03', 'female', '081100000202', null);

insert into public.visits (id, tenant_id, branch_id, patient_id, status, arrived_at, started_at, closed_at, subjective, objective, assessment, plan) values
  ('00000000-0000-0000-0000-00000002f001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000002a001',
   'closed', now() - interval '30 days 20 minutes', now() - interval '30 days', now() - interval '30 days' + interval '35 minutes',
   'Ngilu pada geraham kiri bawah saat minum dingin, 2 minggu.', 'Karies oklusal 36 mencapai dentin, tes dingin (+) singkat, perkusi (−).',
   'Karies dentin 36 (pulpitis reversibel).', 'Tambalan komposit 36. Kontrol 6 bulan.');
insert into public.odontogram_entries (tenant_id, patient_id, visit_id, tooth, surfaces, condition, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 36, '{O}', 'car', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 36, '{O}', 'cof', now() - interval '30 days' + interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 46, '{O,D}', 'amf', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 18, '{}', 'mis', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 15, '{M}', 'car', now() - interval '30 days');
insert into public.visit_diagnoses (tenant_id, visit_id, code, display, is_primary) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', 'K02.1', 'Caries of dentine', true);
insert into public.visit_procedures (tenant_id, visit_id, code, display, tooth, product_id) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', '23.2', 'Restoration of tooth by filling', 36, '00000000-0000-0000-0000-00000002e003');
insert into public.prescriptions (tenant_id, branch_id, visit_id, patient_name, status, sent_at, dispensed_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000002f001', 'Andi Rahmat (demo)', 'cancelled', now() - interval '30 days', null);
insert into public.satusehat_outbox (tenant_id, visit_id, payload, status, attempts, encounter_id, sent_at)
select '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', public._fhir_bundle('00000000-0000-0000-0000-00000002f001'),
       'simulated', 1, 'SIM-ENC-0001', now() - interval '30 days' + interval '36 minutes';

-- Antrean hari ini (diregistrasi Staff · fitur 18). Fikri: anak, gigi sulung.
insert into public.queue_entries (tenant_id, branch_id, kind, name, phone, nik, complaint, scheduled_at, status, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Budi Santoso (demo)', '081100000203', '7371992511870003',
   'Geraham kanan bawah sakit berdenyut sejak 3 hari, bengkak ringan.', now() - interval '25 minutes', 'waiting', now() - interval '25 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Nurul Aini (demo)', '081100000202', '7371994308950002',
   'Kontrol karang gigi.', now() - interval '15 minutes', 'waiting', now() - interval '15 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Fikri Ramadhan (demo)', '081100000204', '7371990906180005',
   'Gigi susu depan bawah goyang, gigi tetap sudah tumbuh di belakangnya.', now() - interval '5 minutes', 'waiting', now() - interval '5 minutes');

-- Reservasi meja (F&B) & pelanggan CRM Kopi Harum.
insert into public.queue_entries (tenant_id, branch_id, kind, name, phone, party_size, table_id, scheduled_at, status)
select '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'table', 'Keluarga Hasan (demo)', '081100000301', 5, t.id,
       date_trunc('day', now()) + interval '19 hours', 'booked'
from public.tables t where t.branch_id = '00000000-0000-0000-0000-0000000000b1' and t.label = '08';

insert into public.customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at) values
  ('00000000-0000-0000-0000-000000000001', '081100000301', 'Hasan (demo)', 46, 468500, 9, now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001', '081100000302', 'Mega (demo)', 12, 124300, 3, now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000000001', '081100000303', null, 3, 38500, 1, now() - interval '20 days');

-- ═══════════ BLUEPRINT PRIVAT (RLS: hanya Superadmin) ═══════════
insert into public.blueprint_docs (id, content) values ('harumin-v1', '{"bab1":{"DECISIONS":[{"id":"D1","title":"Supabase atau PostgreSQL mandiri","asli":"Blueprint: PostgreSQL + Redis dikelola sendiri.","usul":"Supabase (Postgres + RLS + Auth) sebagai data layer; Redis terpisah hanya untuk lock & antrean.","risiko":"Dua sumber kebenaran skema bila keduanya dibangun paralel."},{"id":"D2","title":"Satu runtime backend","asli":"Blueprint: kluster Node.js & Go.","usul":"Node.js/TypeScript dulu. Go hanya untuk worker yang terukur lambat.","risiko":"Biaya pemeliharaan ganda sebelum ada beban yang membenarkannya."},{"id":"D3","title":"Satu model isolasi tenant","asli":"Blueprint: RLS & schema isolation.","usul":"RLS dengan tenant_id di setiap tabel + policy per role.","risiko":"Migrasi skema per tenant sulit dikelola pada ratusan merchant."},{"id":"D4","title":"Data finansial di kanal chat","asli":"Blueprint: audit log void & selisih kas dikirim ke Discord.","usul":"Kirim ringkasan + tautan ke dashboard; nominal penuh hanya di aplikasi.","risiko":"Kebocoran data bila server Discord atau grup WhatsApp disusupi."}],"EDGES":[{"from":"edge","to":"spa","label":"HTTPS"},{"from":"hal","to":"spa","label":"driver"},{"from":"spa","to":"api","label":"REST · wss"},{"from":"api","to":"ai","label":"API key"},{"from":"api","to":"hermes","label":"webhook"},{"from":"api","to":"data","label":"SQL · RLS"},{"from":"api","to":"ext","label":"webhook"}],"HERO":{"title":["Satu","kasir.","Satu","buku","besar.","Enam","industri."],"ask":"Hermes, berapa omset cabang Makassar hari ini?","endpoint":"http://127.0.0.1:20128/v1/chat/completions","lede":"Harum.in adalah platform POS & ERP multi-tenant untuk UMKM sampai jaringan multi-cabang. Kasir, dapur, gudang, akuntansi, SDM, CRM, sampai rekam medis berjalan di satu basis data, dengan 9router sebagai gerbang AI dan Hermes Agent yang melapor ke WhatsApp dan Discord.","facts":[{"n":"2","l":"domain","d":"harum.in · dashboard.harum.in"},{"n":"6","l":"pilar industri","d":"FnB sampai omnichannel"},{"n":"12","l":"modul fungsional","d":"POS sampai Capital"},{"n":"5","l":"peran pengguna","d":"Superadmin sampai Dokter"},{"n":"4","l":"alur lintas peran","d":"Dine-in, void, pasok, medis"}]},"MODULES":{"M1":"Kasir POS","M2":"Dapur & KDS","M3":"Inventori & BOM","M4":"Akuntansi PSAK","M5":"SDM & Payroll","M6":"CRM & Loyalti","M7":"Omnichannel","M8":"Reservasi Jasa","M9":"RME & SATUSEHAT","M10":"Ritel & Grosir","M11":"Manufaktur","M12":"Capital & Supplies"},"NODES":[{"id":"edge","area":"edge","layer":"Perimeter","title":"Cloudflare Edge","tag":"WAF · TLS 1.3","specs":["Cloudflare Edge WAF dan TLS 1.3 strict","Enkripsi at-rest AES-256 dan in-transit","CSP dengan nonce kriptografis dinamis","Proteksi SQL injection, XSS, CSRF","Rate-limiting API granular"]},{"id":"hal","area":"hal","layer":"Perangkat","title":"Hardware Abstraction Layer","tag":"ESC/POS · HAL","specs":["Printer struk ESC/POS: Bluetooth, USB, LAN, Wi-Fi","Customer Facing Display (monitor ganda)","Laci kasir elektronik, scanner 1D/2D QR","Timbangan digital, soundbox audio QRIS","Kitchen / production display"]},{"id":"spa","area":"spa","layer":"Presentation","title":"React SPA · harum-ui","tag":"wss:// · code-split","specs":["Single Page Application React dengan komponen modular harum-ui","Code-splitting dinamis per bundel fitur","Cache lokal untuk respons tanpa jeda","WebSocket dua arah (wss://) untuk sinkron meja & antrean","Dua domain: harum.in (publik) dan dashboard.harum.in (aplikasi)"]},{"id":"ext","area":"ext","layer":"Integrasi eksternal","title":"Gateway & Mitra","tag":"QRIS · FHIR · Marketplace","specs":["Payment gateway: QRIS dinamis, EDC bank, e-wallet via webhook","SATUSEHAT Kemenkes RI (HL7 FHIR JSON)","GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee","Kurir: GoSend, GrabExpress, JNE, SiCepat"]},{"id":"ai","area":"ai","layer":"AI Gateway","title":"9router","tag":"/v1 · failover","specs":["Base API http://127.0.0.1:20128/v1 atau proxy resmi, autentikasi API key","Load balancer antar-LLM: OpenAI, Claude, Gemini, DeepSeek","Failover otomatis bila satu penyedia gagal","Dipakai untuk NLP, ekstraksi struk/nota, peramalan inventori"],"revisi":"127.0.0.1 hanya valid bila 9router satu host dengan API. Pada kluster multi-node, pakai endpoint jaringan privat + API key; jangan pernah diekspos publik."},{"id":"api","area":"api","layer":"Services","title":"API Cluster","tag":"REST · BullMQ","specs":["Kluster API RESTful terdistribusi (Node.js & Go)","Antrean asinkron Redis Streams / BullMQ","Latensi rendah dan efisiensi RAM untuk antrean transaksi kasir","Webhook dua arah ke Hermes Agent"],"revisi":"Dua runtime (Node.js + Go) berarti dua toolchain, dua pipeline CI, dua set ORM. Mulai dengan satu runtime; pecah ke Go hanya untuk worker yang terbukti bottleneck."},{"id":"hermes","area":"hermes","layer":"Agentic Ops","title":"Hermes Agent","tag":"WhatsApp · Discord","specs":["WhatsApp Executive Bot: Z-Report, stok menipis, penurunan marjin","Discord #alert-sistem dan #laporan-harian: void, perubahan BOM, selisih kas","Tanya-jawab: \"Hermes, berapa omset cabang Makassar hari ini?\"","Struk digital ke WhatsApp pelanggan"],"revisi":"Pesan ke Discord membawa nominal & nama staf. Batasi channel privat, masking PII, dan catat setiap pertanyaan Owner di audit log."},{"id":"data","area":"data","layer":"Data","title":"PostgreSQL + Redis","tag":"RLS · locks","specs":["PostgreSQL relasional, isolasi tenant via Row-Level Security","Redis in-memory: distributed lock transaksi","State denah meja dan keranjang kasir di cache"],"revisi":"Dokumen menyebut RLS dan schema isolation sekaligus — pilih satu. Proyek berjalan memakai Supabase: RLS shared-schema adalah pilihan alaminya."}],"PILLARS":[{"id":"fnb","code":"P1","name":"Food & Beverages","segments":"Restoran kasual, fine dining, kafe, bakery, bar, fast food, food court, cloud kitchen","modules":["M1","M2","M3","M6","M7"],"signature":"Denah meja real-time, tiket dapur per stasiun, potong stok berbasis resep"},{"id":"retail","code":"P2","name":"Retail & Distribusi","segments":"Kelontong, minimarket, fashion, toko bangunan, pet shop, elektronik, grosir","modules":["M1","M3","M10","M6"],"signature":"Scan barcode, harga bertingkat kuantitas, barang konsinyasi"},{"id":"service","code":"P3","name":"Hospitality & Personal Care","segments":"Salon, barbershop, spa, refleksi, car wash, detailing, bengkel","modules":["M8","M1","M5","M6"],"signature":"Booking slot, pilih terapis favorit, komisi per layanan"},{"id":"health","code":"P4","name":"Healthcare & Medis Pratama","segments":"Praktik dokter gigi/umum, klinik estetika, klinik pratama","modules":["M9","M8","M1","M3"],"signature":"RME SOAP, odontogram FDI, ICD-10/ICD-9-CM, bridging SATUSEHAT"},{"id":"mfg","code":"P5","name":"Manufaktur & Produksi Ringan","segments":"Central kitchen, makanan beku, perakitan, konveksi, katering korporat","modules":["M11","M3","M4"],"signature":"Work order, HPP bahan + upah + overhead"},{"id":"omni","code":"P6","name":"E-Commerce & Omnichannel","segments":"Toko online domain kustom, e-menu QR meja, kurir, marketplace & food aggregator","modules":["M7","M6","M1"],"signature":"Satu monitor kasir untuk GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee"}]},"bab2":{"MODULE_LIST":[{"id":"M1","name":"Kasir POS & Front-Office","en":"POS & Front-Office Engine","groups":[{"title":"Pembayaran terintegrasi (Harum.in Pay)","items":["Tunai: tombol denominasi cepat (pas, 50rb, 100rb), kembalian otomatis, peringatan batas uang di laci","Debit & kredit: integrasi EDC BCA, Mandiri, BRI, BNI, nomor approval trace, pemisahan biaya MDR","QRIS dinamis per invoice di layar kasir, monitor pelanggan, dan soundbox audio","E-wallet GoPay, OVO, DANA, ShopeePay, LinkAja dengan konfirmasi webhook otomatis","Split payment: satu tagihan, dua metode atau lebih","Uang muka & cicilan untuk katering, venue, paket perawatan, dengan pelacakan sisa piutang"]},{"title":"Denah meja interaktif (FnB)","items":["Editor denah visual: lantai 1–2, area merokok, outdoor, VIP","Status warna: hijau kosong, merah terisi, kuning diproses dapur, biru reservasi, abu-abu perlu dibersihkan","Split bill per menu atau rata, merge bill antar-meja, pindah meja tanpa cetak ulang tiket dapur","Hold & recall pesanan"]},{"title":"Shift & penutupan kasir","items":["Wajib input modal awal (starting cash float) sebelum transaksi pertama","Cash count akhir shift, selisih lebih/kurang tercatat, cetak X-Report","Z-Report harian dikunci dan dikirim Hermes Agent ke WhatsApp Owner & GM"]},{"title":"Struk & nota digital","items":["Kustomisasi logo, alamat, telepon, footer, media sosial, nomor izin usaha","Struk digital ke WhatsApp pelanggan lewat Hermes"]}],"revisi":"Simpan hanya 4 digit akhir kartu dan kode approval. Menyimpan nomor kartu penuh membawa sistem ke lingkup audit PCI-DSS."},{"id":"M2","name":"Dapur & Produksi","en":"Kitchen Display & Workstations","groups":[{"title":"Antrean tiket digital","items":["Pesanan dari kasir atau scan QR langsung tampil di layar produksi","Routing per stasiun: Dapur Utama, Barista, Grill, Pastry"]},{"title":"Siklus masak","items":["Status Baru → Sedang Dimasak → Siap Saji, terlihat oleh kasir & pelayan","Timer SLA: hijau aman, kuning mendekati batas, merah berkedip bila lewat 15 menit"]},{"title":"Siap saji & layar pelanggan","items":["Tombol Ready memicu notifikasi ke tablet pelayan","Customer Order Display menampilkan nomor antrean yang sudah siap"]},{"title":"Kontrol bahan","items":["Sakelar 86 / habis: satu klik mengunci menu di POS dan e-menu QR","Log waste & spoilage dengan alasan, untuk menghitung nilai kerugian riil"]}]},{"id":"M3","name":"Inventori, Gudang & Rantai Pasok","en":"Inventory & Supply Chain","groups":[{"title":"Resep bertingkat (multi-level BOM)","items":["Penjualan 1 porsi memotong bahan mentah otomatis (contoh: Nasi Goreng Spesial → beras, telur, ayam, minyak, bumbu, kemasan)","Sub-resep barang setengah jadi: kaldu 10 liter memotong tulang & bumbu, lalu dipotong per mangkuk"]},{"title":"Multi-gudang & multi-cabang","items":["Gudang pusat / central kitchen dan gudang per gerai, diawasi GM","Stock Transfer Order: Draft → Approved → In Transit → Received"]},{"title":"Opname & anti-fraud","items":["Hitung fisik dengan scanner kamera tablet","Laporan shrinkage & variance: selisih fisik vs sistem dalam rupiah"]},{"title":"Pengadaan & vendor","items":["Database supplier: rekening, termin (COD, Net 14, Net 30), histori harga","Purchase Order ke PDF, email, atau WhatsApp","Goods Receipt: cocokkan PO, kuantitas, nomor batch, tanggal kedaluwarsa","Reorder point otomatis dengan alert WhatsApp ke GM"]}],"revisi":"Alur STO tidak menyebut siapa yang menyetujui bila GM sendiri yang membuat draft. Perlu aturan: pembuat tidak boleh menyetujui dokumennya sendiri."},{"id":"M4","name":"Akuntansi & Laporan Finansial","en":"Accounting & 30+ Reports","groups":[{"title":"Jurnal otomatis","items":["Penjualan, retur, HPP, pembelian, dan biaya toko otomatis menjadi jurnal debit-kredit sesuai PSAK"]},{"title":"Laporan inti","items":["Laba/rugi real-time: omset, diskon, HPP berbasis BOM, beban operasional, laba bersih harian & bulanan","Arus kas: operasional, investasi, pendanaan","Neraca: aset lancar, aset tetap minus penyusutan, kewajiban, ekuitas"]},{"title":"Kas kecil & pajak","items":["Petty cash outlet dengan foto nota, diajukan kasir, divalidasi GM","PB1 10% dan PPN transparan di struk, ekspor rekap untuk Bapenda / DJP"]}]},{"id":"M5","name":"SDM, Presensi & Penggajian","en":"Mini HRIS & Payroll","groups":[{"title":"Presensi & jadwal","items":["Absen GPS geofencing radius maksimal 50 meter + foto selfie","Kalender shift pagi, siang, malam, dan tukar shift antar-cabang"]},{"title":"Komisi & payroll","items":["Komisi persentase per menu atau nominal tetap per layanan (terapis, kapster, montir, dokter gigi)","Slip gaji: gaji pokok + tunjangan + lembur + komisi − denda telat − kasbon, disetujui GM, disahkan Owner"]}],"revisi":"Foto wajah dan lokasi karyawan adalah data pribadi menurut UU PDP. Perlu persetujuan tertulis, masa simpan yang dibatasi, dan akses hanya untuk HR."},{"id":"M6","name":"Pelanggan, CRM & Loyalti","en":"CRM & Loyalty","groups":[{"title":"Data & membership","items":["Profil pelanggan: nama, WhatsApp, email, gender, tanggal lahir, preferensi, customer lifetime value","Poin otomatis (misal Rp 10.000 = 1 poin), ditukar voucher","Tier Bronze → Silver → Gold → Platinum, naik otomatis"]},{"title":"Promosi & komunikasi","items":["Diskon %, nominal, Buy 1 Get 1, bundling, happy hour, kupon unik","Pesan WhatsApp otomatis via Hermes: sambutan, info poin, voucher ulang tahun","Survei bintang 1–5 di nota digital per cabang"]}]},{"id":"M7","name":"Toko Online & Omnichannel","en":"Online Store & Omnichannel","groups":[{"title":"Kanal milik sendiri","items":["Web order domain kustom: dine-in scan QR, takeaway, delivery, tanpa komisi pihak ketiga","Ongkir real-time & resi: GoSend, GrabExpress, JNE, SiCepat"]},{"title":"Kanal pihak ketiga","items":["Pesanan & stok GrabFood, GoFood, ShopeeFood, Tokopedia, Shopee di satu monitor kasir"]}],"revisi":"Integrasi aggregator bergantung pada akses API mitra yang tidak terbuka untuk semua merchant. Perlakukan sebagai fase lanjutan, bukan janji peluncuran."},{"id":"M8","name":"Reservasi & Booking Jasa","en":"Service POS","groups":[{"title":"Jadwal & praktisi","items":["Kalender slot untuk barbershop, salon, spa, cuci mobil, klinik","Pelanggan memilih kapster, terapis, atau teknisi favorit","Layar ruang tunggu: nomor yang sedang dilayani dan estimasi giliran"]}]},{"id":"M9","name":"Klinik & SATUSEHAT","en":"Healthcare & SATUSEHAT","groups":[{"title":"Rekam Medis Elektronik","items":["Anamnesis SOAP, riwayat alergi, tanda vital, catatan perkembangan","Odontogram digital FDI: gigi permanen 11–48, gigi sulung 51–85, status tambalan, karies, hilang, implan, mahkota","Pencarian kode diagnosis ICD-10 dan tindakan ICD-9-CM"]},{"title":"Integrasi & farmasi","items":["Bridging SATUSEHAT Kemenkes RI dengan HL7 FHIR JSON terenkripsi","E-resep langsung ke kasir/instalasi obat, stok obat terpotong otomatis"]}],"revisi":"Pengiriman encounter ke SATUSEHAT tidak boleh menunggu pelunasan. Kirim saat kunjungan ditutup dokter; status pembayaran adalah urusan terpisah."},{"id":"M10","name":"Ritel, Grosir & Distribusi","en":"Retail & Distribution","groups":[{"title":"Fitur ritel","items":["Barcode scanner 1D/2D dan cetak label harga rak","Harga bertingkat kuantitas (contoh: 1–5 pcs Rp 50.000, 6–20 pcs Rp 45.000, >20 pcs Rp 40.000)","Konsinyasi: stok titipan supplier dengan bagi hasil otomatis saat terjual"]}]},{"id":"M11","name":"Manufaktur Ringan","en":"Light Manufacturing","groups":[{"title":"Produksi","items":["Work order / production batch: bahan mentah → barang jadi, tahapan dipantau GM","HPP produksi: bahan riil + upah langsung + alokasi listrik & penyusutan mesin"]}]},{"id":"M12","name":"Capital, Supplies & Ads","en":"Financial & Growth Services","groups":[{"title":"Layanan tambahan","items":["Harum.in Capital: pinjaman modal tanpa agunan dari lembaga berizin OJK berdasarkan histori omset, diajukan Owner","Harum.in Supplies: belanja bahan grosir dari distributor tangan pertama, dikelola GM","Harum.in Ads: kampanye Facebook, Instagram, Google Ads dari dashboard"]}],"revisi":"Capital mensyaratkan kemitraan resmi dengan lender berizin OJK dan persetujuan merchant untuk berbagi data omset. Tidak bisa dibangun sepihak oleh tim produk."}]},"bab3":{"ROLES":[{"id":"superadmin","level":"L0","name":"Superadmin / Developer","short":"Superadmin","domain":"Penyedia platform","device":"Web admin terminal / cloud console","duties":["Mengelola tenant, paket langganan, billing SaaS","Konfigurasi 9router API base & API key","Integrasi webhook Hermes Agent (WhatsApp & Discord)","Audit log global dan pembaruan sistem"],"revisi":"Superadmin mengelola platform, bukan isi bisnis tenant. Akses ke data merchant (keuangan, resep, rekam medis) hanya lewat mode break-glass: berbatas waktu, wajib alasan, tercatat di audit log, dan diberitahukan ke Owner."},{"id":"owner","level":"L1","name":"Owner Merchant","short":"Owner","domain":"Pemilik bisnis","device":"Executive web dashboard & mobile app","duties":["Akses tertinggi atas seluruh cabang bisnisnya","Laba rugi konsolidasi, neraca, arus kas","Persetujuan akhir payroll, harga jual, dividen, rekening payout","Pengajuan Harum.in Capital","Menerima laporan Hermes Agent di WhatsApp / Discord"]},{"id":"gm","level":"L2","name":"General Manager","short":"GM","domain":"Operasional, keuangan, SDM, rantai pasok","device":"Portal operasional & akuntansi","duties":["Pembukuan PSAK, jurnal umum, utang/piutang supplier","Master resep BOM","Jadwal shift dan payroll staf","Persetujuan PO dan transfer stok antar-gudang","Otorisasi void nota darurat dengan PIN","Pengadaan bahan baku"],"revisi":"Satu orang memegang pembukuan, pengadaan, dan persetujuan stok adalah celah fraud. Pemisahan tugas: dokumen yang dibuat GM disetujui Owner, dan GM tidak bisa menyetujui draft miliknya sendiri."},{"id":"staff","level":"L3","name":"Cashier / Staff Operasional","short":"Staff","domain":"Front-office & operasional harian","device":"Tablet POS / smartphone staf","duties":["Mengoperasikan kasir, pembayaran multi-metode, cetak struk","Reservasi meja dan layar antrean dapur","Mencatat waste dan pengeluaran kas kecil","Absensi GPS geofencing"],"revisi":"Dokumen meminta PIN “GM / Supervisor” untuk void, tetapi role Supervisor tidak ada dan GM tidak selalu ada di cabang. Usulan tanpa menambah role: atribut Kepala Shift pada akun Staff, dengan PIN override terbatas nominal dan tercatat di audit log."},{"id":"dokter","level":"L4","name":"Dokter / Terapis","short":"Dokter","domain":"Layanan klinis & jasa spesialis","device":"Workstation dokter / tablet medis","duties":["Rekam medis elektronik format SOAP","Odontogram gigi FDI","Diagnosis ICD-10 dan tindakan ICD-9-CM","Penerbitan e-resep farmasi","Sinkronisasi SATUSEHAT Kemenkes RI"]}]},"bab4":{"RBAC_ROLES":[{"id":"sa","label":"Superadmin","level":"L0"},{"id":"ow","label":"Owner","level":"L1"},{"id":"gm","label":"General Manager","level":"L2"},{"id":"st","label":"Cashier / Staff","level":"L3"},{"id":"dr","label":"Dokter / Terapis","level":"L4"}],"RBAC":[{"no":1,"name":"Konfigurasi tenant, 9router & Hermes","asli":{"sa":"CRUD","ow":"R","gm":"–","st":"–","dr":"–"}},{"no":2,"name":"Dashboard eksekutif & laba riil","asli":{"sa":"R","ow":"CRUD","gm":"R (Operasional)","st":"–","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":3,"name":"Master produk, varian & harga jual","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"R","dr":"R"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":4,"name":"Resep & Bill of Materials (BOM)","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"R","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":5,"name":"Register transaksi POS & struk","asli":{"sa":"–","ow":"R","gm":"R","st":"CRUD","dr":"–"}},{"no":6,"name":"Otorisasi void, refund & diskon","asli":{"sa":"–","ow":"Approval","gm":"Approval (PIN)","st":"Request","dr":"–"},"revisi":{"st":["Request · Approval (Kepala Shift, ≤ batas)","Alur 2 meminta PIN Supervisor, padahal role itu tidak ada. Akun Staff berstatus Kepala Shift boleh menyetujui void di bawah batas nominal; di atas batas tetap GM."]}},{"no":7,"name":"Denah meja, kiosk & QR e-menu","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"RU","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":8,"name":"Antrean pesanan dapur & status masak","asli":{"sa":"CRUD","ow":"R","gm":"R","st":"CRUD","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":9,"name":"Purchase Order & vendor supplier","asli":{"sa":"CRUD","ow":"Approval","gm":"CRUD","st":"–","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."],"st":["Create (Goods Receipt)","Alur 3 menyuruh Staff mengonfirmasi penerimaan barang, tetapi matriks asli tidak memberi akses apa pun."]}},{"no":10,"name":"Mutasi stok, opname & susut/waste","asli":{"sa":"CRUD","ow":"R","gm":"Approval & CRUD","st":"Create (Opname/Waste)","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."],"ow":["Approval (STO buatan GM)","Pemisahan tugas: dokumen yang dibuat GM disetujui Owner."],"gm":["CRUD · Approval (bukan draft sendiri)","Pembuat dokumen tidak boleh menyetujui dokumennya sendiri."]}},{"no":11,"name":"Akuntansi, jurnal & neraca PSAK","asli":{"sa":"CRUD","ow":"R","gm":"CRUD","st":"–","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":12,"name":"Buku kas, rekonsiliasi & settlement","asli":{"sa":"CRUD","ow":"R","gm":"CRUD","st":"Input petty cash","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":13,"name":"Master karyawan, shift & geofencing","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"Absen GPS masuk/pulang","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":14,"name":"Payroll, komisi & kasbon karyawan","asli":{"sa":"CRUD","ow":"Approval","gm":"CRUD","st":"R (Komisi pribadi)","dr":"R (Komisi pribadi)"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":15,"name":"Database CRM & poin loyalitas","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"RU","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":16,"name":"Integrasi omnichannel & marketplace","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"R (Proses pesanan)","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":17,"name":"Rekam medis & SATUSEHAT Kemenkes","asli":{"sa":"CRUD","ow":"R","gm":"R","st":"R (Billing obat)","dr":"CRUD"},"revisi":{"sa":["–","Penyedia platform tidak boleh membaca atau mengubah rekam medis, termasuk lewat break-glass. Dukungan teknis memakai data tersamarkan."],"ow":["R (Agregat & billing)","Pemilik bisnis tidak memerlukan catatan klinis pasien. Cukup statistik kunjungan dan tagihan."],"gm":["R (Agregat & billing)","Sama dengan Owner: catatan SOAP dan diagnosis hanya untuk tenaga medis."],"st":["Create (Registrasi pasien) · R (Billing obat)","Alur 4 meminta Staff mendaftarkan pasien dengan NIK, yang butuh hak membuat data pasien."]}},{"no":18,"name":"Reservasi & antrean ruang tunggu","asli":{"sa":"CRUD","ow":"CRUD","gm":"CRUD","st":"CRUD","dr":"RU"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":19,"name":"Pengajuan Harum.in Capital & payout","asli":{"sa":"CRUD","ow":"CRUD","gm":"RU","st":"–","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}},{"no":20,"name":"Pengadaan bahan Harum.in Supplies","asli":{"sa":"CRUD","ow":"Approval","gm":"CRUD","st":"–","dr":"–"},"revisi":{"sa":["Break-glass","Superadmin adalah penyedia platform. Akses ke data bisnis tenant hanya lewat sesi break-glass: berbatas waktu, wajib alasan, tercatat, dan Owner diberi tahu."]}}],"RBAC_LEGEND":[{"code":"CRUD","label":"Create, Read, Update, Delete"},{"code":"RU","label":"Baca & ubah"},{"code":"R","label":"Baca saja"},{"code":"Create","label":"Membuat entri tertentu"},{"code":"Request","label":"Mengajukan permintaan"},{"code":"Approval","label":"Menyetujui atau menolak"},{"code":"Break-glass","label":"Akses darurat berbatas waktu, tercatat"},{"code":"–","label":"Tidak ada akses"}]},"bab5":{"FLOWS":[{"id":"dinein","code":"Alur 1","short":"Dine-in & Z-Report","title":"Dine-in, dapur, penjurnalan & laporan Hermes","lanes":["Staff","Sistem","Hermes"],"steps":[{"lane":"Staff","title":"Pilih Meja 08","text":"Status meja di denah berubah dari hijau (kosong) ke merah (terisi)."},{"lane":"Staff","title":"Input pesanan","text":"2 Nasi Goreng Spesial, 2 Es Kopi. Tiket muncul di layar dapur; Cooking → Ready to Serve, lalu diantar."},{"lane":"Sistem","title":"Potong stok BOM","text":"Bahan baku di gudang cabang terpotong sesuai resep yang dikonfigurasi GM."},{"lane":"Staff","title":"Bayar QRIS","text":"Buka tagihan Meja 08, input WhatsApp pelanggan untuk poin CRM, tampilkan QRIS dinamis."},{"lane":"Sistem","title":"Transaksi selesai","text":"Webhook memverifikasi dana, struk tercetak, meja kembali bersih, jurnal masuk buku besar."},{"lane":"Hermes","title":"Z-Report","text":"Saat tutup hari, ringkasan dikirim ke WhatsApp Owner & GM dan Discord #laporan-harian."}]},{"id":"void","code":"Alur 2","short":"Otorisasi void","title":"Mitigasi kesalahan & otorisasi void nota","lanes":["Staff","Otorisator","Sistem","Hermes"],"steps":[{"lane":"Staff","title":"Salah input","text":"Jumlah pesanan salah dan struk telanjur tercetak."},{"lane":"Sistem","title":"Void terkunci","text":"Tombol void/refund meminta PIN otorisasi.","revisi":"Dokumen menyebut PIN “GM / Supervisor”; role Supervisor tidak ada. Revisi: PIN Kepala Shift untuk nominal di bawah batas, GM untuk di atasnya."},{"lane":"Otorisator","title":"Periksa fisik","text":"Memeriksa pesanan dan nota yang salah cetak di meja kasir."},{"lane":"Otorisator","title":"PIN + alasan","text":"Pilih alasan: Salah Input Kasir, Pelanggan Membatalkan, atau Masakan Rusak. Catatan wajib diisi."},{"lane":"Otorisator","title":"Restock / waste","text":"Menentukan apakah bahan yang terpotong dikembalikan ke stok atau dicatat sebagai waste."},{"lane":"Sistem","title":"Audit trail","text":"Mencatat waktu, nama kasir, pemberi otorisasi, alasan, dan nominal pembatalan."},{"lane":"Hermes","title":"Alert Discord","text":"Contoh dari dokumen: “Void ORD-HARUM-9102 sebesar Rp 185.000 disetujui di Cabang Makassar. Alasan: Salah Input Kasir.”"}]},{"id":"supply","code":"Alur 3","short":"Pengadaan & STO","title":"Pengadaan bahan & transfer antar-gudang","lanes":["Sistem","Hermes","Staff","GM","Owner"],"steps":[{"lane":"Sistem","title":"Stok di bawah minimum","text":"Sirup Kopi di Cabang Makassar tersisa 2 botol; batas aman 5 botol."},{"lane":"Hermes","title":"Alert WhatsApp","text":"Pengingat stok dikirim ke WhatsApp GM."},{"lane":"Staff","title":"Lapor kebutuhan","text":"Staff melaporkan kebutuhan barang ke GM."},{"lane":"GM","title":"Draft STO / PO","text":"GM membuat Stock Transfer Order atau Purchase Order ke vendor."},{"lane":"Owner","title":"Setujui","text":"Persetujuan transfer, surat jalan dicetak, status In Transit.","revisi":"Dokumen asli: GM membuat sekaligus menyetujui. Revisi: persetujuan oleh orang selain pembuat draft (Owner)."},{"lane":"Staff","title":"Goods Receipt","text":"Barang tiba; Staff memeriksa fisik dan jumlah, lalu mengonfirmasi penerimaan.","revisi":"Matriks asli tidak memberi Staff akses ke PO/GR. Revisi Bab IV menambahkan hak Create (Goods Receipt)."},{"lane":"Sistem","title":"Sinkron stok & akun","text":"Stok cabang bertambah, gudang pusat berkurang, nilai persediaan di akuntansi diperbarui."}]},{"id":"medis","code":"Alur 4","short":"Layanan medis","title":"Pelayanan medis, tindakan klinis & SATUSEHAT","lanes":["Staff","Dokter","Sistem"],"steps":[{"lane":"Staff","title":"Registrasi NIK","text":"Pasien didaftarkan dengan NIK KTP; identitas divalidasi."},{"lane":"Dokter","title":"Pemeriksaan","text":"RME: riwayat alergi, anamnesis SOAP, odontogram FDI (kasus dental), diagnosis ICD-10, tindakan ICD-9-CM."},{"lane":"Dokter","title":"E-resep","text":"Resep elektronik diteruskan ke instalasi obat klinik."},{"lane":"Sistem","title":"Kirim ke SATUSEHAT","text":"Data dibungkus FHIR JSON, dikirim asinkron, ID encounter dicatat.","revisi":"Dokumen asli mengirim setelah pembayaran lunas. Revisi: kirim saat dokter menutup kunjungan, karena pelaporan klinis tidak bergantung pada pembayaran."},{"lane":"Staff","title":"Obat & tagihan","text":"Obat disiapkan (stok terpotong otomatis), tagihan tindakan diproses."},{"lane":"Staff","title":"Pelunasan","text":"Pembayaran pasien diterima di kasir."}]}]}}'::jsonb)
on conflict (id) do update set content = excluded.content, updated_at = now();

-- ══════════════════════════════════════════════════════════════════════
-- PENCATATAN MIGRASI (kompatibel dengan Supabase CLI & npm run db:migrate)
-- ══════════════════════════════════════════════════════════════════════

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20261011000001', 'schema', '{}'),
  ('20261011000002', 'rbac_rls', '{}'),
  ('20261011000003', 'functions', '{}'),
  ('20261011000004', 'rbac_matrix', '{}'),
  ('20261011000005', 'operations', '{}'),
  ('20261011000006', 'operations_rpc', '{}'),
  ('20261011000007', 'clinic', '{}'),
  ('20261011000008', 'clinic_rpc', '{}'),
  ('20261011000009', 'icd_codes', '{}'),
  ('20261011000010', 'foundation', '{}'),
  ('20261011000011', 'access', '{}'),
  ('20261011000012', 'fase1_policies_approvals_support', '{}'),
  ('20261011000013', 'fase1_policy_enforcement', '{}'),
  ('20261011000014', 'fase2_void_policy_fix', '{}'),
  ('20261011000015', 'fase2_hardening', '{}'),
  ('20261011000016', 'fase3_value_add', '{}'),
  ('20261011000017', 'fase4_platform', '{}'),
  ('20261011000018', 'realtime_publications', '{}'),
  ('20261011000019', 'fase5_hardening', '{}')
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- AKUN DEMO — 7 akun (Auth + identitas + profil), kata sandi = nilai di bagian atas berkas
-- ══════════════════════════════════════════════════════════════════════

set local search_path = public, extensions, pg_catalog;  -- pgcrypto (crypt, gen_salt) ada di schema extensions pada Supabase

do $$
declare
  pw text := (select pw from _demo_cfg);
  r record;
  now_ timestamptz := now();
begin
  -- Bersihkan akun demo lama dengan email sama tetapi id berbeda (mis. sisa percobaan sebelumnya).
  delete from auth.users where email in ('superadmin@demo.harum.in','owner@demo.harum.in','gm@demo.harum.in','staff@demo.harum.in','dokter@demo.harum.in','kasir.klinik@demo.harum.in','owner.klinik@demo.harum.in')
    and id::text not like '00000000-0000-0000-0000-0000000000e_';

  for r in select * from (values
    ('00000000-0000-0000-0000-0000000000e0'::uuid, 'superadmin@demo.harum.in', 'superadmin'::public.app_role, 'Superadmin Demo', null::uuid, null::uuid, 0::numeric, null::text, null::text),
    ('00000000-0000-0000-0000-0000000000e1', 'owner@demo.harum.in',        'owner',  'Owner Demo',        '00000000-0000-0000-0000-000000000001', null, 0, null, null),
    ('00000000-0000-0000-0000-0000000000e2', 'gm@demo.harum.in',           'gm',     'GM Demo',           '00000000-0000-0000-0000-000000000001', null, 0, null, '246810'),
    ('00000000-0000-0000-0000-0000000000e3', 'staff@demo.harum.in',        'staff',  'Staff Demo',        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 0, null, null),
    ('00000000-0000-0000-0000-0000000000e4', 'dokter@demo.harum.in',       'dokter', 'drg. Demo',         '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 0.3, '7371990101800009', null),
    ('00000000-0000-0000-0000-0000000000e5', 'kasir.klinik@demo.harum.in', 'staff',  'Kasir Klinik Demo', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 0, null, null),
    ('00000000-0000-0000-0000-0000000000e6', 'owner.klinik@demo.harum.in', 'owner',  'Owner Klinik Demo', '00000000-0000-0000-0000-000000000002', null, 0, null, null)
  ) as t(id, email, role, full_name, tenant_id, branch_id, commission_rate, nik, pin)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email, crypt(pw, gen_salt('bf')), now_,
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.full_name), now_, now_, '', '', '', '')
    on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = now_, updated_at = now_;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.id, r.id::text, jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true, 'phone_verified', false), 'email', now_, now_, now_)
    on conflict (provider_id, provider) do nothing;

    insert into public.profiles (id, email, role, full_name, tenant_id, branch_id, commission_rate, nik, pin_hash, is_active)
    values (r.id, r.email, r.role, r.full_name, r.tenant_id, r.branch_id, r.commission_rate, r.nik,
            case when r.pin is null then null else crypt(r.pin, gen_salt('bf')) end, true)
    on conflict (id) do update set email = excluded.email, role = excluded.role, full_name = excluded.full_name, tenant_id = excluded.tenant_id,
      branch_id = excluded.branch_id, is_active = true, deactivated_at = null, deactivation_reason = null;
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
-- VERIFIKASI — harus 7 baris, semua kolom 'siap' = true
-- ══════════════════════════════════════════════════════════════════════

commit;

select u.email, p.role, (u.encrypted_password is not null) as sandi, (u.email_confirmed_at is not null) as terkonfirmasi,
       exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email') as identitas,
       p.is_active as profil_aktif,
       (u.encrypted_password is not null and u.email_confirmed_at is not null and p.is_active
        and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')) as siap
from auth.users u join public.profiles p on p.id = u.id
where u.email like '%@demo.harum.in' order by p.role, u.email;
