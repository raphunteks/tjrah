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
    format('⚠️ SECURITY ALERT: Void transaksi %s sebesar %s disetujui oleh %s di %s. %s',
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

create or replace function public.set_initial_stock(p_branch uuid, p_item uuid, p_qty numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  cur numeric;
  delta numeric;
begin
  if not (has_perm(4, 'c') or has_perm(4, 'u') or has_perm(10, 'u') or has_perm(10, 'c')) then
    raise exception 'Akses ditolak: butuh hak pengelola bahan baku atau stok';
  end if;
  select coalesce(qty, 0) into cur from stock_levels where branch_id = p_branch and item_id = p_item;
  delta := p_qty - coalesce(cur, 0);
  if delta <> 0 then
    perform _move(t, p_branch, p_item, delta, case when cur is null or cur = 0 then 'purchase' else 'opname' end, case when cur is null or cur = 0 then 'Stok Awal' else 'Penyesuaian Fisik' end, 'Penetapan stok bahan baku');
  end if;
  return p_qty;
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
  public.receive_po, public.create_sto, public.advance_sto, public.submit_opname, public.apply_opname, public.set_initial_stock, public.log_waste,
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
