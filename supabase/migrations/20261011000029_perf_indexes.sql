-- 20261011000029_perf_indexes.sql
-- Optimasi performa Paripurna Harum.in:
-- 1. Partial & Composite Indexes untuk query Kasir POS, Layar Dapur, Absensi, Kas Kecil, CRM, dll.
-- 2. InitPlan Subquery RLS Optimization pada tabel `orders` & `order_items` untuk mencegah
--    evaluasi RLS berulang puluhan ribu kali per baris yang menyebabkan "statement timeout".
-- 3. ANALYZE statistik tabel.

-- ─────────────────────────────────────────────────────────────
-- 1. INDEX PERFORMA OPERASIONAL
-- ─────────────────────────────────────────────────────────────

-- Orders: Kasir POS mencari pesanan aktif (open) pada cabang kasir
create index if not exists orders_open_branch_created_idx
  on public.orders (branch_id, created_at)
  where status = 'open';

-- Orders: Kasir POS mencari 8 transaksi terakhir yang sudah lunas (paid)
create index if not exists orders_paid_branch_paid_at_idx
  on public.orders (branch_id, paid_at desc)
  where status = 'paid';

-- Orders: Layar Dapur & umum mencari pesanan berdasarkan cabang urut waktu terbaru
create index if not exists orders_branch_created_idx
  on public.orders (branch_id, created_at desc);

-- Orders: Multi-tenant filtering cabang urut waktu terbaru
create index if not exists orders_tenant_branch_created_idx
  on public.orders (tenant_id, branch_id, created_at desc);

-- Orders: Filter channel (dine_in, takeaway, online, clinic)
create index if not exists orders_branch_channel_created_idx
  on public.orders (branch_id, channel, created_at desc);

-- Orders: Customer history untuk portal member
create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;

-- Order items: Layar Dapur (KDS) stasiun masak
create index if not exists order_items_branch_kitchen_created_idx
  on public.order_items (branch_id, kitchen_status, created_at);

-- Kas Kecil: Pengeluaran per cabang & tenant urut tanggal
create index if not exists petty_cash_branch_created_idx
  on public.petty_cash (branch_id, created_at desc);

create index if not exists petty_cash_tenant_created_idx
  on public.petty_cash (tenant_id, created_at desc);

-- Absensi: Riwayat absensi per cabang & tenant urut tanggal
create index if not exists attendance_tenant_created_idx
  on public.attendance (tenant_id, created_at desc);

create index if not exists attendance_branch_created_idx
  on public.attendance (branch_id, created_at desc);

-- Stok: Opname & waste per cabang & status
create index if not exists stock_counts_branch_status_created_idx
  on public.stock_counts (branch_id, status, created_at desc);

-- CRM: Pelanggan per tenant urut poin tertinggi
create index if not exists customers_tenant_points_idx
  on public.customers (tenant_id, points desc);

-- Produk: Katalog produk per tenant urut nama
create index if not exists products_tenant_name_idx
  on public.products (tenant_id, name);

-- Shift: Riwayat shift per tenant urut dibuka
create index if not exists shifts_tenant_status_opened_idx
  on public.shifts (tenant_id, status, opened_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2. RLS POLICY SUBQUERY OPTIMIZATION (INITPLAN)
-- ─────────────────────────────────────────────────────────────
-- Membungkus fungsi pemeriksa izin & identitas dalam subquery (SELECT ...)
-- agar PostgreSQL mengeksekusinya 1x sebagai InitPlan di awal query,
-- BUKAN ribuan kali per baris data.

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select using (
  (select public.has_perm(5, 'r'::text))
  and (
    (select public.is_superadmin())
    or (tenant_id = (select public.current_tenant_id()))
  )
  and (
    public.branch_ok(branch_id)
  )
);

drop policy if exists member_ro on public.orders;
create policy member_ro on public.orders as restrictive for select using (
  (select not public.is_member())
  or (customer_id = (select public.current_customer_id()))
);

drop policy if exists member_ro on public.order_items;
create policy member_ro on public.order_items as restrictive for select using (
  (select not public.is_member())
  or (order_id in (select orders.id from public.orders where orders.customer_id = (select public.current_customer_id())))
);

-- ─────────────────────────────────────────────────────────────
-- 3. ANALYZE STATISTIK TABEL
-- ─────────────────────────────────────────────────────────────
analyze public.orders;
analyze public.order_items;
analyze public.shifts;
analyze public.tables;
analyze public.products;
analyze public.petty_cash;
analyze public.attendance;
analyze public.stock_counts;
analyze public.customers;
