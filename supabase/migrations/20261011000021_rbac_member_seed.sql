-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari MEMBER_ACCESS di src/lib/rbac-matrix.js — jangan edit manual.
-- Peran Member (L5): 20 baris tambahan. Matriks asli 20×5 (migrasi 4) tidak diubah.
insert into public.rbac_matrix (feature, feature_name, role, label, can_create, can_read, can_update, can_delete, can_approve, can_request, scope) values
  (1, 'Konfigurasi Tenant, 9router & Hermes', 'member', '-', false, false, false, false, false, false, null),
  (2, 'Dashboard Eksekutif & Laba Riil', 'member', '-', false, false, false, false, false, false, null),
  (3, 'Master Produk, Varian & Harga Jual', 'member', 'R (Katalog)', false, true, false, false, false, false, 'katalog'),
  (4, 'Resep & Bill of Materials (BOM)', 'member', '-', false, false, false, false, false, false, null),
  (5, 'Register Transaksi POS & Struk', 'member', 'R (Pesanan Sendiri)', false, true, false, false, false, false, 'pesanan_sendiri'),
  (6, 'Otorisasi Void, Refund & Diskon', 'member', '-', false, false, false, false, false, false, null),
  (7, 'Denah Meja, Kiosk & QR E-Menu', 'member', 'Create (Pesanan Sendiri)', true, false, false, false, false, false, 'pesanan_sendiri'),
  (8, 'Antrean Pesanan Dapur & Status Masak', 'member', 'R (Status Sendiri)', false, true, false, false, false, false, 'status_sendiri'),
  (9, 'Purchase Order (PO) & Vendor Supplier', 'member', '-', false, false, false, false, false, false, null),
  (10, 'Mutasi Stok, Opname & Susut/Waste', 'member', '-', false, false, false, false, false, false, null),
  (11, 'Akuntansi, Jurnal & Neraca PSAK', 'member', '-', false, false, false, false, false, false, null),
  (12, 'Buku Kas, Rekonsiliasi & Settlement', 'member', '-', false, false, false, false, false, false, null),
  (13, 'Master Karyawan, Shift & Geofencing', 'member', '-', false, false, false, false, false, false, null),
  (14, 'Payroll, Komisi & Kasbon Karyawan', 'member', '-', false, false, false, false, false, false, null),
  (15, 'Database CRM & Poin Loyalitas', 'member', 'RU (Data Pribadi)', false, true, true, false, false, false, 'data_pribadi'),
  (16, 'Integrasi Omnichannel & Marketplace', 'member', '-', false, false, false, false, false, false, null),
  (17, 'Rekam Medis & SATUSEHAT Kemenkes', 'member', 'R (Jadwal, Resep, Tagihan Pribadi)', false, true, false, false, false, false, 'rme_pribadi'),
  (18, 'Reservasi & Antrean Ruang Tunggu', 'member', 'CRUD (Milik Sendiri)', true, true, true, true, false, false, 'milik_sendiri'),
  (19, 'Pengajuan Harum.in Capital & Payout', 'member', '-', false, false, false, false, false, false, null),
  (20, 'Pengadaan Bahan Harum.in Supplies', 'member', '-', false, false, false, false, false, false, null)
on conflict (feature, role) do update set label = excluded.label, can_create = excluded.can_create, can_read = excluded.can_read,
  can_update = excluded.can_update, can_delete = excluded.can_delete, can_approve = excluded.can_approve, can_request = excluded.can_request, scope = excluded.scope;
