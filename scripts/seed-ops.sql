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
