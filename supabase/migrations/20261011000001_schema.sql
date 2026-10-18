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
