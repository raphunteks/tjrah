-- Tiket 09 · QRIS dinamis di pembayaran Pesanan.
-- 1) pay_order dipecah: pembungkus (izin, shift, diskon+PIN) + _pay_core (pajak, Pembayaran, stok, CRM, Jurnal). Perilaku pay_order TIDAK berubah.
-- 2) payment_charges: satu tagihan QRIS per Pesanan; penyedia (Midtrans, atau simulasi) hanya mengonfirmasi lewat webhook bertanda tangan.
-- 3) qris_settle (khusus service_role): idempotent, memakai _pay_core, sehingga Pembayaran, stok, poin, dan Jurnal sama persis dengan kasir.

insert into public.feature_flags (key, description, default_enabled, plans)
values ('qris_dynamic', 'QRIS dinamis di layar bayar', false, '{growth,enterprise}')
on conflict (key) do nothing;

create or replace function public._pay_core(p_o orders, p_payments jsonb, p_customer_phone text, p_disc numeric, p_sid uuid) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders := p_o; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric; v_taxable numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid := p_sid; v_phone text; pts int;
        disc numeric := p_disc; jl jsonb;
begin
  -- Pajak dari pengaturan tenant (Fase 0.8) atas nilai setelah diskon; tagihan klinik selalu tanpa pajak.
  v_taxable := o.subtotal - disc;
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  v_total := v_taxable + v_tax;

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

  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, o.customer_phone, ''), '[^0-9+]', '', 'g'), '');
  update orders set status = 'paid', paid_at = now(), discount = disc, tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000 dari total yang dibayar; poin hanya naik lewat transaksi (customers_guard).
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  -- Jurnal: diskon dicatat sebagai potongan penjualan (4102) agar pendapatan kotor tetap = subtotal.
  jl := jsonb_build_array(jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash));
  if disc > 0 then jl := jl || jsonb_build_array(jsonb_build_object('code', '4102', 'dr', disc)); end if;
  jl := jl || jsonb_build_array(
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp)));
  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jl);
  return o;
end $$;

create or replace function public.pay_order(
  p_order uuid, p_payments jsonb, p_customer_phone text default null, p_discount numeric default null, p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric; v_taxable numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
        disc numeric; pct numeric; mx numeric; pol jsonb; auth_id uuid; jl jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Diskon: di atas batas efektif (Tenant → Cabang → Peran) wajib PIN GM cabang / Owner
  disc := coalesce(p_discount, o.discount, 0);
  if disc < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if disc > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;
  if disc > 0 and o.subtotal > 0 then
    pct := round(disc / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx and not (o.voucher_code is not null and p_discount is null and disc = o.discount) then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  return public._pay_core(o, p_payments, p_customer_phone, disc, sid);
end $$;
revoke all on function public._pay_core(orders, jsonb, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.pay_order(uuid, jsonb, text, numeric, text) to authenticated;

-- ───────── Tagihan QRIS ─────────
create table if not exists public.payment_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text check (provider in ('pakasir', 'midtrans', 'sim')),
  provider_ref text,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'failed', 'needs_review')),
  qr_string text,                  -- isi QR (EMV) bila penyedia memberikannya
  qr_url text,                     -- atau URL gambar QR dari penyedia (https)
  expires_at timestamptz,
  paid_at timestamptz,
  shift_id uuid references public.shifts(id),
  created_by uuid default auth.uid(),
  note text,
  last_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_charges_ref_uq on public.payment_charges (provider, provider_ref) where provider_ref is not null;
create unique index if not exists payment_charges_one_pending on public.payment_charges (order_id) where status = 'pending';
create index if not exists payment_charges_order_idx on public.payment_charges (order_id);
alter table public.payment_charges enable row level security;
revoke all on public.payment_charges from anon;
drop policy if exists pc_read on public.payment_charges;
create policy pc_read on public.payment_charges for select using (public.feat_ok(tenant_id, branch_id, 5, 'r'));
-- Tidak ada kebijakan tulis: hanya fungsi di bawah (security definer) yang mengubah tabel ini.

create or replace function public._qris_amount(o orders) returns numeric
language sql stable security definer set search_path = public as $$
  select (o.subtotal - coalesce(o.discount, 0))
       + case when o.channel = 'clinic' then 0 else round((o.subtotal - coalesce(o.discount, 0)) * public.tenant_tax_rate(o.tenant_id)) end
$$;

create or replace function public._qris_json(c payment_charges) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', c.id, 'order_id', c.order_id, 'status', c.status, 'amount', c.amount, 'provider', c.provider,
    'qr_string', c.qr_string, 'qr_url', c.qr_url, 'expires_at', c.expires_at, 'paid_at', c.paid_at, 'note', c.note)
$$;

-- Staff memulai tagihan. Jumlah = total Pesanan SAAT INI (diskon yang sudah menempel di Pesanan, mis. voucher; PIN diskon manual lewat kasir biasa).
create or replace function public.qris_start(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; c payment_charges; sid uuid; amt numeric;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if not has_flag(o.tenant_id, 'qris_dynamic') then raise exception 'QRIS dinamis belum aktif untuk Paket ini'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;
  amt := public._qris_amount(o);
  if amt <= 0 then raise exception 'Total Pesanan nol; tidak perlu QRIS'; end if;

  update payment_charges set status = 'expired', updated_at = now() where order_id = o.id and status = 'pending' and expires_at is not null and expires_at <= now();
  select * into c from payment_charges where order_id = o.id and status = 'pending';
  if found then
    if c.amount = amt then return public._qris_json(c); end if;
    update payment_charges set status = 'cancelled', note = 'Total Pesanan berubah', updated_at = now() where id = c.id;
  end if;
  insert into payment_charges (tenant_id, branch_id, order_id, amount, shift_id) values (o.tenant_id, o.branch_id, o.id, amt, sid) returning * into c;
  return public._qris_json(c);
end $$;

create or replace function public.qris_status(p_charge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c payment_charges;
begin
  perform _need(5, 'r');
  select * into c from payment_charges where id = p_charge;
  if not found or not tenant_ok(c.tenant_id) or not branch_ok(c.branch_id) then raise exception 'Tagihan tidak ditemukan'; end if;
  if c.status = 'pending' and c.expires_at is not null and c.expires_at <= now() then
    update payment_charges set status = 'expired', updated_at = now() where id = c.id returning * into c;
  end if;
  return public._qris_json(c);
end $$;

create or replace function public.qris_cancel(p_charge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c payment_charges;
begin
  perform _need(5, 'c');
  select * into c from payment_charges where id = p_charge for update;
  if not found or not tenant_ok(c.tenant_id) or not branch_ok(c.branch_id) then raise exception 'Tagihan tidak ditemukan'; end if;
  if c.status <> 'pending' then raise exception 'Tagihan sudah %', c.status; end if;
  update payment_charges set status = 'cancelled', updated_at = now() where id = c.id returning * into c;
  return public._qris_json(c);
end $$;

-- ───────── Khusus service_role (Edge Function) ─────────
create or replace function public.qris_attach(p_charge uuid, p_provider text, p_ref text, p_qr text, p_expires timestamptz, p_qr_url text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c payment_charges;
begin
  if p_qr_url is not null and p_qr_url !~ '^https://[^\s<>"'']{4,500}$' then raise exception 'URL QR tidak valid'; end if;
  update payment_charges set provider = p_provider, provider_ref = p_ref, qr_string = p_qr, qr_url = p_qr_url, expires_at = p_expires, updated_at = now()
   where id = p_charge and status = 'pending' returning * into c;
  if not found then raise exception 'Tagihan tidak dalam status pending'; end if;
  return public._qris_json(c);
end $$;

create or replace function public.qris_fail(p_charge uuid, p_reason text) returns void
language sql security definer set search_path = public as $$
  update payment_charges set status = 'failed', note = left(p_reason, 300), updated_at = now() where id = p_charge and status = 'pending'
$$;

create or replace function public._qris_review(c payment_charges, p_reason text, p_raw jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update payment_charges set status = 'needs_review', note = left(p_reason, 300), last_event = p_raw, updated_at = now() where id = c.id;
  insert into audit_logs (tenant_id, actor_role, action, entity, entity_id, detail)
  values (c.tenant_id, null, 'qris_needs_review', 'payment_charges', c.id::text, jsonb_build_object('reason', p_reason, 'amount', c.amount, 'ref', c.provider_ref));
  perform _hermes(c.tenant_id, 'whatsapp', 'Owner & GM', 'qris_review',
    format('QRIS %s perlu dicek: %s (Rp%s).', coalesce(c.provider_ref, c.id::text), p_reason, to_char(c.amount, 'FM999G999G999')));
  return jsonb_build_object('ok', false, 'review', true, 'reason', p_reason);
end $$;

-- Penyedia mengonfirmasi uang masuk. Aman dikirim ulang: kedua kali hanya mengembalikan duplicate.
create or replace function public.qris_settle(p_provider text, p_ref text, p_amount numeric, p_raw jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c payment_charges; o orders; sid uuid;
begin
  select * into c from payment_charges where (provider = p_provider and (provider_ref = p_ref or id::text = p_ref)) for update;
  if not found then
    select * into c from payment_charges where id::text = p_ref for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'unknown', true); end if;
  if c.status = 'paid' then return jsonb_build_object('ok', true, 'duplicate', true, 'order_id', c.order_id); end if;
  if p_amount is distinct from c.amount then return public._qris_review(c, 'Nominal dari penyedia tidak sama dengan tagihan', p_raw); end if;

  select * into o from orders where id = c.order_id for update;
  if not found or o.status <> 'open' then return public._qris_review(c, 'Uang masuk tetapi Pesanan tidak lagi terbuka (sudah dibayar lain atau dibatalkan)', p_raw); end if;
  if public._qris_amount(o) <> c.amount then return public._qris_review(c, 'Pesanan berubah setelah QR dibuat', p_raw); end if;

  select id into sid from shifts where id = c.shift_id and status = 'open';
  begin
    o := public._pay_core(o, jsonb_build_array(jsonb_build_object('method', 'qris', 'amount', c.amount, 'reference', coalesce(c.provider_ref, p_ref))), null, coalesce(o.discount, 0), sid);
  exception when others then
    return public._qris_review(c, 'Gagal melunasi Pesanan: ' || sqlerrm, p_raw);
  end;
  update payment_charges set status = 'paid', paid_at = now(), last_event = p_raw, updated_at = now() where id = c.id;
  insert into audit_logs (tenant_id, actor_role, action, entity, entity_id, detail)
  values (c.tenant_id, null, 'qris_paid', 'payment_charges', c.id::text, jsonb_build_object('order', o.code, 'amount', c.amount, 'ref', coalesce(c.provider_ref, p_ref)));
  return jsonb_build_object('ok', true, 'order_id', o.id, 'code', o.code);
end $$;

-- Kejadian non-lunas dari penyedia (expire, cancel, deny). Tidak pernah menurunkan tagihan yang sudah lunas atau perlu dicek.
create or replace function public.qris_mark(p_provider text, p_ref text, p_status text, p_raw jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare c payment_charges;
begin
  if p_status not in ('expired', 'cancelled', 'failed') then raise exception 'Status tidak dikenal'; end if;
  update payment_charges set status = p_status, last_event = p_raw, updated_at = now()
   where (provider = p_provider and (provider_ref = p_ref or id::text = p_ref)) and status = 'pending' returning * into c;
  if not found then
    update payment_charges set status = p_status, last_event = p_raw, updated_at = now()
     where id::text = p_ref and status = 'pending' returning * into c;
  end if;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public._qris_amount(orders), public._qris_json(payment_charges), public._qris_review(payment_charges, text, jsonb) from public, anon, authenticated;
revoke all on function public.qris_start(uuid), public.qris_status(uuid), public.qris_cancel(uuid) from public, anon;
grant execute on function public.qris_start(uuid), public.qris_status(uuid), public.qris_cancel(uuid) to authenticated;
revoke all on function public.qris_attach(uuid, text, text, text, timestamptz, text), public.qris_fail(uuid, text),
  public.qris_settle(text, text, numeric, jsonb), public.qris_mark(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.qris_attach(uuid, text, text, text, timestamptz, text), public.qris_fail(uuid, text),
  public.qris_settle(text, text, numeric, jsonb), public.qris_mark(text, text, text, jsonb) to service_role;

select public.member_lockdown();

-- Kunci server penyedia per Tenant: uang QRIS harus masuk ke akun merchant Tenant itu, bukan ke platform.
-- Dicari di Supabase Vault dengan nama midtrans_server_key_<tenant_id>; bila tidak ada, Edge Function memakai secret MIDTRANS_SERVER_KEY (pilot satu merchant).
create or replace function public.qris_server_key(p_tenant uuid) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'midtrans_server_key_' || p_tenant::text;
  return k;
exception when others then
  return null;   -- Vault tidak tersedia / rahasia belum ada
end $$;
revoke all on function public.qris_server_key(uuid) from public, anon, authenticated;
grant execute on function public.qris_server_key(uuid) to service_role;
