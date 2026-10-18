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
  end_time time not null
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
  created_at timestamptz not null default now()
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
