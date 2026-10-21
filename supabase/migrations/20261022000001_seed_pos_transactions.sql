-- ═══════════════════════════════════════════════════════════════════════════════
-- Migrasi 20261022000001: Pemulihan & Seed Data Riwayat Transaksi POS Realistis
-- Menyediakan data transaksi lengkap dengan tabel orders, order_items, dan payments
-- untuk seluruh outlet aktif (Cabang Anton, Pettarani, dan Panakkukang).
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists payment_method text default 'cash';

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_prod_kopi uuid := '00000000-0000-0000-0000-00000000e001';
  v_prod_susu uuid := '00000000-0000-0000-0000-00000000e002';
  v_prod_amer uuid := '00000000-0000-0000-0000-00000000e003';
  v_prod_teh  uuid := '00000000-0000-0000-0000-00000000e004';
  
  v_b_anton uuid := '75af2ba8-22a9-4fbd-ab2c-22a58ab9b564';
  v_b_petta uuid := '00000000-0000-0000-0000-0000000000b1';
  v_b_panak uuid := '00000000-0000-0000-0000-0000000000b2';
  
  v_ord_id uuid;
begin
  -- 1. SEED DATA UNTUK CABANG ANTON (Cabang Baru yang Masih 0 Transaksi)
  if exists (select 1 from public.branches where id = v_b_anton) then
    -- Transaksi 1: Tunai Takeaway
    v_ord_id := gen_random_uuid();
    insert into public.orders (id, tenant_id, branch_id, code, status, channel, payment_method, subtotal, discount, tax, total, customer_name, customer_phone, created_at, paid_at)
    values (v_ord_id, v_tenant, v_b_anton, 'ORD-261022-AN-001', 'paid', 'takeaway', 'cash', 64000, 0, 6400, 70400, 'Budi Santoso', '081234567890', now() - interval '4 hours', now() - interval '3 hours 58 minutes');
    
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_kopi, 'Es Kopi Harum', 2, 32000, 'barista', 'Less sugar, less ice', 'ready', now() - interval '4 hours');

    insert into public.payments (id, tenant_id, order_id, method, amount, reference, created_at)
    values (gen_random_uuid(), v_tenant, v_ord_id, 'cash', 70400, 'KASIR-TUNAI', now() - interval '3 hours 58 minutes');

    -- Transaksi 2: QRIS Dinamis Dine In
    v_ord_id := gen_random_uuid();
    insert into public.orders (id, tenant_id, branch_id, code, status, channel, payment_method, subtotal, discount, tax, total, customer_name, customer_phone, created_at, paid_at)
    values (v_ord_id, v_tenant, v_b_anton, 'ORD-261022-AN-002', 'paid', 'dine_in', 'qris', 53000, 0, 5300, 58300, 'Siti Rahmawati', '085299887766', now() - interval '3 hours', now() - interval '2 hours 55 minutes');
    
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_susu, 'Kopi Susu Panas', 1, 28000, 'barista', 'Extra hot', 'ready', now() - interval '3 hours'),
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_amer, 'Americano', 1, 25000, 'barista', 'No sugar', 'ready', now() - interval '3 hours');

    insert into public.payments (id, tenant_id, order_id, method, amount, reference, created_at)
    values (gen_random_uuid(), v_tenant, v_ord_id, 'qris', 58300, 'QRIS-BCA-981273', now() - interval '2 hours 55 minutes');

    -- Transaksi 3: Transfer VA 9 Bank
    v_ord_id := gen_random_uuid();
    insert into public.orders (id, tenant_id, branch_id, code, status, channel, payment_method, subtotal, discount, tax, total, customer_name, customer_phone, created_at, paid_at)
    values (v_ord_id, v_tenant, v_b_anton, 'ORD-261022-AN-003', 'paid', 'takeaway', 'va', 79000, 5000, 7400, 81400, 'Ahmad Fauzi', '082155443322', now() - interval '2 hours', now() - interval '1 hour 56 minutes');
    
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_kopi, 'Es Kopi Harum', 2, 32000, 'barista', 'Normal', 'ready', now() - interval '2 hours'),
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_teh, 'Es Teh Aren', 1, 15000, 'barista', 'Manis', 'ready', now() - interval '2 hours');

    insert into public.payments (id, tenant_id, order_id, method, amount, reference, created_at)
    values (gen_random_uuid(), v_tenant, v_ord_id, 'transfer', 81400, 'VA-MANDIRI-88391', now() - interval '1 hour 56 minutes');

    -- Transaksi 4: S-Wallet Member Drive Thru
    v_ord_id := gen_random_uuid();
    insert into public.orders (id, tenant_id, branch_id, code, status, channel, payment_method, subtotal, discount, tax, total, customer_name, customer_phone, created_at, paid_at)
    values (v_ord_id, v_tenant, v_b_anton, 'ORD-261022-AN-004', 'paid', 'drive_thru:DD-1455-XX', 'swallet', 96000, 10000, 8600, 94600, 'Dewi Sartika', '081377889900', now() - interval '1 hour', now() - interval '55 minutes');
    
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_kopi, 'Es Kopi Harum', 3, 32000, 'barista', 'Cup takeaway', 'ready', now() - interval '1 hour');

    insert into public.payments (id, tenant_id, order_id, method, amount, reference, created_at)
    values (gen_random_uuid(), v_tenant, v_ord_id, 'ewallet', 94600, 'SWALLET-MEMBER', now() - interval '55 minutes');

    -- Transaksi 5: Tunai Kasir Terbaru
    v_ord_id := gen_random_uuid();
    insert into public.orders (id, tenant_id, branch_id, code, status, channel, payment_method, subtotal, discount, tax, total, customer_name, customer_phone, created_at, paid_at)
    values (v_ord_id, v_tenant, v_b_anton, 'ORD-261022-AN-005', 'paid', 'takeaway', 'cash', 47000, 0, 4700, 51700, 'Rahmat Hidayat', '089611223344', now() - interval '25 minutes', now() - interval '20 minutes');
    
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_kopi, 'Es Kopi Harum', 1, 32000, 'barista', 'Extra shot', 'ready', now() - interval '25 minutes'),
      (gen_random_uuid(), v_tenant, v_b_anton, v_ord_id, v_prod_teh, 'Es Teh Aren', 1, 15000, 'barista', 'Standard', 'ready', now() - interval '25 minutes');

    insert into public.payments (id, tenant_id, order_id, method, amount, reference, created_at)
    values (gen_random_uuid(), v_tenant, v_ord_id, 'cash', 51700, 'KASIR-TUNAI', now() - interval '20 minutes');
  end if;

  -- 2. PASTIKAN CABANG PETTARANI MEMILIKI ORDER ITEMS LENGKAP PADA 15 TRANSAKSI TERBARU
  for v_ord_id in (
    select id from public.orders 
    where branch_id = v_b_petta and status = 'paid' 
      and not exists (select 1 from public.order_items oi where oi.order_id = orders.id)
    order by created_at desc 
    limit 15
  ) loop
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_petta, v_ord_id, v_prod_kopi, 'Es Kopi Harum', 1, 32000, 'barista', 'Normal ice', 'ready', now() - interval '1 day'),
      (gen_random_uuid(), v_tenant, v_b_petta, v_ord_id, v_prod_susu, 'Kopi Susu Panas', 1, 28000, 'barista', 'Hangat', 'ready', now() - interval '1 day');
  end loop;

  -- 3. PASTIKAN CABANG PANAKKUKANG MEMILIKI ORDER ITEMS LENGKAP PADA 15 TRANSAKSI TERBARU
  for v_ord_id in (
    select id from public.orders 
    where branch_id = v_b_panak and status = 'paid' 
      and not exists (select 1 from public.order_items oi where oi.order_id = orders.id)
    order by created_at desc 
    limit 15
  ) loop
    insert into public.order_items (id, tenant_id, branch_id, order_id, product_id, name, qty, price, station, note, kitchen_status, created_at) values
      (gen_random_uuid(), v_tenant, v_b_panak, v_ord_id, v_prod_amer, 'Americano', 1, 25000, 'barista', 'No sugar', 'ready', now() - interval '1 day'),
      (gen_random_uuid(), v_tenant, v_b_panak, v_ord_id, v_prod_teh, 'Es Teh Aren', 2, 15000, 'barista', 'Dingin segar', 'ready', now() - interval '1 day');
  end loop;
end $$;
