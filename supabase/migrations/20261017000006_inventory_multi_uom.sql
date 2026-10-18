-- ───────── Multi-UoM (Satuan Kemasan Beli & Rasio Konversi) ─────────
-- Menambahkan kolom pendukung konversi satuan kemasan beli ke satuan dasar pakai/resep pada tabel inventory_items
alter table public.inventory_items
  add column if not exists pack_unit text,
  add column if not exists pack_ratio numeric(14,3),
  add column if not exists pack_price numeric(14,2),
  add column if not exists template_id text;

comment on column public.inventory_items.pack_unit is 'Satuan beli/kemasan kulakan, misal: galon, botol, karung, dus, karton, box';
comment on column public.inventory_items.pack_ratio is 'Isi per kemasan dalam satuan dasar/resep, misal 19000 untuk galon 19L ke ml';
comment on column public.inventory_items.pack_price is 'Harga beli per kemasan kulakan dalam Rupiah';
comment on column public.inventory_items.template_id is 'ID preset templat kemasan F&B atau gudangku';
