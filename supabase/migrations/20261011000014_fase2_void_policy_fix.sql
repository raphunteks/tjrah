-- Harum.in · Migrasi 14 — PERBAIKAN regresi migrasi 13 + Fase 2.1 (request void → PIN GM → eskalasi Owner)
--
-- Mengapa migrasi baru, bukan menyunting 13: migrasi 13 mungkin sudah terpasang di Supabase; riwayat yang sudah dipasang tidak diubah.
-- Yang diperbaiki (semuanya direproduksi dan diverifikasi di Postgres 16 lokal sebelum migrasi ini ditulis):
--   1. pay_order / apply_order_discount memakai kolom orders.updated_at yang TIDAK ADA  → setiap pembayaran gagal.
--   2. pay_order versi 13 membuang: pajak per tenant (Fase 0.8), nol pajak tagihan klinik, poin CRM (F15), resep "diserahkan",
--      struk WhatsApp, dan normalisasi nomor telepon. Di sini dikembalikan, ditambah diskon berkebijakan.
--   3. open_shift membandingkan jam operasional dengan zona waktu SERVER (UTC di Supabase) → kasir WIB terkunci di pagi hari.
--      Sekarang memakai tenants.timezone, dan kunci shift hanya berlaku bila tenant PUNYA kebijakan tersimpan.
--   4. request_void versi 13 membatalkan nota ≤ Rp50.000 TANPA persetujuan siapa pun — bertentangan dengan kriteria 9.5
--      ("status Menunggu GM", "Kasir tidak bisa membatalkan nota sendiri") dan dengan matriks (void GM = PIN). Dikembalikan ke
--      alur persetujuan; ambang eskalasi Owner kini milik tenant (bukan angka 500000 yang tertulis di kode) + eskalasi karena waktu.
--   5. Verifikasi PIN diskon menerima PIN GM/Owner mana pun di tenant, tanpa jejak. Sekarang: Owner, atau GM yang berhak atas
--      cabang itu, dan siapa yang mengotorisasi dicatat di audit_logs.

-- ══════════════════════════════════════════════════════════════════════════════
-- 0 · Pengaturan tenant: zona waktu & aturan eskalasi void
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.tenants add column if not exists timezone text not null default 'Asia/Jakarta';
alter table public.tenants add column if not exists void_owner_threshold numeric(14,2) not null default 500000 check (void_owner_threshold >= 0);
alter table public.tenants add column if not exists void_escalate_minutes int not null default 30 check (void_escalate_minutes between 1 and 1440);
comment on column public.tenants.timezone is 'Zona waktu IANA tenant (Asia/Jakarta, Asia/Makassar, Asia/Jayapura). Dipakai untuk jam operasional shift.';
comment on column public.tenants.void_owner_threshold is 'Void dengan total di atas nilai ini diputuskan Owner, bukan GM.';
comment on column public.tenants.void_escalate_minutes is 'Void yang belum diputuskan GM setelah sekian menit naik ke Owner.';

create or replace function public._tenant_now(p_tenant uuid) returns timestamp
language plpgsql stable security definer set search_path = public as $$
declare tz text;
begin
  select timezone into tz from tenants where id = p_tenant;
  return now() at time zone coalesce(tz, 'Asia/Jakarta');
exception when others then            -- nama zona tidak dikenal → jangan memblokir kasir
  return now() at time zone 'Asia/Jakarta';
end $$;
revoke execute on function public._tenant_now(uuid) from public, anon;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1 · Otorisasi PIN (GM cabang / Owner) + jejak audit
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public._pin_authorizer(p_tenant uuid, p_branch uuid, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  if p_pin is null or btrim(p_pin) = '' then return null; end if;
  for r in select id, role, pin_hash from profiles
           where tenant_id = p_tenant and role in ('gm', 'owner') and is_active and pin_hash is not null loop
    if crypt(p_pin, r.pin_hash) = r.pin_hash then
      if r.role = 'owner'
         or not exists (select 1 from member_branches where profile_id = r.id)             -- GM tanpa batasan = semua cabang
         or exists (select 1 from member_branches where profile_id = r.id and branch_id = p_branch) then
        return r.id;
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public._pin_authorizer(uuid, uuid, text) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2 · open_shift: jam operasional menurut zona waktu tenant
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  s shifts; pol jsonb; v_start time; v_end time; v_now time := _tenant_now(t)::time; outside boolean;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;

  pol := get_effective_policy(t, p_branch, current_app_role());
  -- layer 0 = belum ada kebijakan tersimpan → tidak ada kunci (perilaku sebelum Fase 1.4)
  if pol is not null and coalesce((pol->>'layer')::int, 0) > 0 and coalesce((pol->>'enforce_shift_lock')::boolean, false) then
    v_start := (pol->>'operating_hours_start')::time;
    v_end := (pol->>'operating_hours_end')::time;
    outside := case when v_start <= v_end then (v_now < v_start or v_now > v_end)
                    else (v_now < v_start and v_now > v_end) end;          -- rentang melewati tengah malam
    if outside then
      raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %, waktu setempat sekarang %)', v_start, v_end, to_char(v_now, 'HH24:MI');
    end if;
  end if;

  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash) values (t, p_branch, auth.uid(), p_opening) returning * into s;
  return s;
exception when unique_violation then
  raise exception 'Anda masih punya shift yang terbuka';
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3 · apply_order_discount (tanpa updated_at, pajak per tenant)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.apply_order_discount(p_order uuid, p_discount numeric, p_pin text default null) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare o orders; pol jsonb; pct numeric; mx numeric; auth_id uuid; v_tax numeric; v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    pct := round(p_discount / o.subtotal * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    mx := coalesce((pol->>'max_discount_pct')::numeric, 15);
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := case when o.channel = 'clinic' then 0 else round(v_taxable * public.tenant_tax_rate(o.tenant_id)) end;
  update orders set discount = p_discount, tax = v_tax, total = v_taxable + v_tax where id = o.id returning * into o;
  return o;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4 · pay_order = migrasi 10 (pajak tenant, klinik, CRM, resep, WhatsApp) + diskon berkebijakan
-- ══════════════════════════════════════════════════════════════════════════════
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
    if pct > mx then
      if p_pin is null or btrim(p_pin) = '' then raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN GM/Owner.', pct || '%', mx || '%'; end if;
      auth_id := _pin_authorizer(o.tenant_id, o.branch_id, p_pin);
      if auth_id is null then raise exception 'PIN otorisasi GM/Owner salah'; end if;
      insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
      values (o.tenant_id, auth.uid(), current_app_role(), 'discount_authorized', 'orders', o.id::text,
              jsonb_build_object('pct', pct, 'limit', mx, 'authorized_by', auth_id, 'order', o.code));
    end if;
  end if;

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

-- ══════════════════════════════════════════════════════════════════════════════
-- 5 · Fitur 6 — request void → PIN GM → eskalasi Owner
-- ══════════════════════════════════════════════════════════════════════════════
-- Eskalasi karena waktu: void milik GM-tidak-bertindak naik ke Owner setelah tenants.void_escalate_minutes.
create or replace function public._escalate_stale(p_tenant uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    select a.id, a.ref, a.amount from approvals a join tenants t on t.id = a.tenant_id
    where a.tenant_id = p_tenant and a.kind = 'void' and a.status = 'pending'
      and coalesce((a.detail->>'escalated_to_owner')::boolean, false) = false
      and a.requested_at < now() - make_interval(mins => t.void_escalate_minutes)
    for update of a skip locked
  loop
    update approvals set detail = detail || jsonb_build_object('escalated_to_owner', true, 'escalated_at', now(), 'escalation_reason', 'timeout'),
           title = replace(title, 'Void transaksi ·', 'Void transaksi (Eskalasi Owner) ·') where id = r.id;
    perform _hermes(p_tenant, 'whatsapp', 'Owner', 'void_alert', format('Void %s (%s) belum diputuskan GM dan naik ke Owner.', r.ref, _rp(r.amount)));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._escalate_stale(uuid) from public, anon, authenticated;

create or replace function public.escalate_stale_approvals() returns int
language plpgsql security definer set search_path = public as $$
begin
  if public.current_tenant_id() is null then return 0; end if;
  return _escalate_stale(public.current_tenant_id());
end $$;
revoke execute on function public.escalate_stale_approvals() from public, anon;
grant execute on function public.escalate_stale_approvals() to authenticated;

create or replace function public.request_void(p_order uuid, p_reason text, p_note text, p_option text default 'restock') returns approvals
language plpgsql security definer set search_path = public as $$
declare o orders; a approvals; pol jsonb; t tenants; esc boolean; why text; me public.app_role := current_app_role();
begin
  if not (has_perm(6, 'q') or has_perm(6, 'c')) then raise exception 'Akses ditolak: fitur 6'; end if;
  select * into o from orders where id = p_order;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'paid' then raise exception 'Hanya transaksi lunas yang bisa di-void'; end if;
  if p_reason not in ('Salah Input Kasir', 'Pelanggan Membatalkan', 'Masakan Rusak') then raise exception 'Alasan tidak valid'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Catatan alasan wajib diisi'; end if;
  if coalesce(p_option, 'restock') not in ('restock', 'waste') then raise exception 'Pilihan stok tidak valid'; end if;
  -- 9.5a · hanya nota milik shift yang masih terbuka
  if not exists (select 1 from shifts where id = o.shift_id and status = 'open') then
    raise exception 'Void hanya dapat diajukan pada transaksi dalam shift yang masih terbuka';
  end if;
  -- 9.5 · kasir hanya boleh mengajukan void untuk nota shift-nya sendiri
  if me = 'staff' and not exists (select 1 from shifts where id = o.shift_id and cashier_id = auth.uid()) then
    raise exception 'Anda hanya dapat mengajukan void untuk transaksi pada shift Anda sendiri';
  end if;
  if exists (select 1 from approvals where kind = 'void' and status = 'pending' and detail->>'order_id' = o.id::text) then
    raise exception 'Permintaan void untuk transaksi ini sudah menunggu';
  end if;

  select * into t from tenants where id = o.tenant_id;
  pol := get_effective_policy(o.tenant_id, o.branch_id, me);
  -- 9.5c · Owner memutuskan bila: nominal melewati ambang tenant, atau pemohonnya GM sendiri (GM tidak menyetujui voidnya sendiri)
  esc := o.total > t.void_owner_threshold or me = 'gm';
  why := case when me = 'gm' then 'diajukan GM' when o.total > t.void_owner_threshold then 'melewati ambang' end;

  insert into approvals (tenant_id, branch_id, feature, kind, ref, title, amount, detail, requested_by)
  values (o.tenant_id, o.branch_id, 6, 'void', o.code,
          'Void transaksi' || case when esc then ' (Eskalasi Owner)' else '' end || ' · ' || lower(p_reason), o.total,
          jsonb_build_object('order_id', o.id, 'alasan', p_reason, 'catatan', p_note, 'option', coalesce(p_option, 'restock'),
                             'escalated_to_owner', esc, 'escalation_reason', why, 'owner_threshold', t.void_owner_threshold,
                             'escalate_after_min', t.void_escalate_minutes),
          auth.uid())
  returning * into a;
  perform _hermes(o.tenant_id, 'whatsapp', case when esc then 'Owner' else 'GM' end, 'void_alert',
                  format('Permintaan void %s (%s): %s.', o.code, _rp(o.total), lower(p_reason)));
  return a;
end $$;

-- decide_approval = versi 13 + eskalasi waktu dijalankan lebih dulu + Owner/GM tidak memutuskan void yang dimohonnya sendiri
create or replace function public.decide_approval(
  p_id uuid, p_decision public.approval_status, p_note text default null, p_pin text default null, p_option text default null
) returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare a approvals; needs_pin boolean; my_hash text;
begin
  select tenant_id into a.tenant_id from approvals where id = p_id;
  if a.tenant_id is not null and tenant_ok(a.tenant_id) then perform _escalate_stale(a.tenant_id); end if;

  select * into a from approvals where id = p_id for update;
  if not found or not tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;
  if a.kind = 'void' and a.requested_by = auth.uid() then raise exception 'Anda tidak dapat memutuskan permintaan void yang Anda ajukan sendiri'; end if;
  -- Dihitung dari data, bukan dari penanda tersimpan: raise di bawah me-rollback transaksi ini, jadi penanda yang baru
  -- ditulis oleh _escalate_stale() tidak akan bertahan. Penanda dipersistenkan oleh escalate_stale_approvals() (dipanggil UI).
  if a.kind = 'void' and current_app_role() = 'gm' and (
       coalesce((a.detail->>'escalated_to_owner')::boolean, false)
       or a.requested_at < now() - make_interval(mins => (select void_escalate_minutes from tenants where id = a.tenant_id))) then
    raise exception 'Void ini dieskalasi ke Owner (melebihi kewenangan GM atau melewati batas waktu)';
  end if;

  select label like '%PIN%' into needs_pin from rbac_matrix where feature = a.feature and role = current_app_role();
  if needs_pin then
    select pin_hash into my_hash from profiles where id = auth.uid();
    if my_hash is null or p_pin is null or crypt(p_pin, my_hash) <> my_hash then raise exception 'PIN otorisasi salah'; end if;
  end if;

  if a.kind = 'void' and coalesce(btrim(p_note), '') = '' then raise exception 'Catatan alasan wajib diisi untuk void'; end if;
  if a.kind = 'void' and p_decision = 'approved' and coalesce(p_option, a.detail->>'option', '') not in ('restock', 'waste') then
    raise exception 'Pilih: kembalikan bahan ke stok atau catat sebagai waste';
  end if;

  update approvals set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = p_note,
         detail = detail || jsonb_build_object('option', coalesce(p_option, a.detail->>'option'))
  where id = p_id returning * into a;

  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, a.detail->>'option', p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid() where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end where id = (a.detail->>'run_id')::uuid;
    if p_decision = 'approved' then
      perform _journal(a.tenant_id, null, 'Payroll ' || a.ref, 'payroll', (a.detail->>'run_id')::uuid, jsonb_build_array(
        jsonb_build_object('code', '6101', 'dr', a.amount), jsonb_build_object('code', '2103', 'cr', a.amount)));
    end if;
  elsif a.kind = 'supplies' then
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (a.tenant_id, auth.uid(), current_app_role(), 'supplies_approval', 'approvals', a.id::text,
            jsonb_build_object('decision', p_decision, 'amount', a.amount, 'note', p_note));
  end if;
  return a;
end $$;

grant execute on function public.open_shift(uuid, numeric) to authenticated;
grant execute on function public.apply_order_discount(uuid, numeric, text) to authenticated;
grant execute on function public.pay_order(uuid, jsonb, text, numeric, text) to authenticated;
grant execute on function public.request_void(uuid, text, text, text) to authenticated;
grant execute on function public.decide_approval(uuid, public.approval_status, text, text, text) to authenticated;
