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
     'low_stock_alert', true));

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
