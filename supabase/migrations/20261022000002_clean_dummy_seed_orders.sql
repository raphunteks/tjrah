-- ═══════════════════════════════════════════════════════════════════════════════
-- Migrasi 20261022000002: Pembersihan Total Data Dummy Fiktif Transaksi POS
-- Menghapus seluruh order dummy sintetis yang digenerate oleh seed.sql
-- sehingga Riwayat Transaksi hanya menampilkan transaksi kasir POS yang asli.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_dummy_count int;
begin
  -- 1. Hapus relasi order_items dari order dummy
  delete from public.order_items
  where order_id in (
    select id from public.orders 
    where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
       or code like 'ORD-261022-AN-%'
  );

  -- 2. Hapus relasi payments dari order dummy
  delete from public.payments
  where order_id in (
    select id from public.orders 
    where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
       or code like 'ORD-261022-AN-%'
  );

  -- 3. Hapus relasi payment_charges dari order dummy
  delete from public.payment_charges
  where order_id in (
    select id from public.orders 
    where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
       or code like 'ORD-261022-AN-%'
  );

  -- 4. Hapus relasi promo_redemptions dari order dummy
  delete from public.promo_redemptions
  where order_id in (
    select id from public.orders 
    where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
       or code like 'ORD-261022-AN-%'
  );

  -- 5. Hapus relasi channel_orders dari order dummy
  delete from public.channel_orders
  where order_id in (
    select id from public.orders 
    where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
       or code like 'ORD-261022-AN-%'
  );

  -- 6. Hapus order dummy dari tabel public.orders
  delete from public.orders
  where code ~ '^ORD-[0-9]{6}-[a-z0-9]{2}-[0-9]{3}$' 
     or code like 'ORD-261022-AN-%';

  get diagnostics v_dummy_count = row_count;
  raise notice 'Pembersihan selesai: % order dummy fiktif berhasil dihapus.', v_dummy_count;
end $$;
