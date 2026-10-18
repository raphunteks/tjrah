-- Harum.in · FASE 1 (1.4, 1.5, 1.6) — Penegakan Kebijakan Operasional di RPC POS & Persetujuan
-- Menyelesaikan Kriteria 9.3 (Batas Diskon & Otorisasi PIN) dan 9.5 (Validasi Shift Open, Max Void Bebas PIN, Eskalasi Owner).

-- ══════════════════════════════════════════════════════════════════════════════
-- 0. Bersihkan overload fungsi lama agar tidak ambigu di PostgREST
-- ══════════════════════════════════════════════════════════════════════════════
drop function if exists public.pay_order(uuid, jsonb, text);
drop function if exists public.request_void(uuid, text, text);

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Tambah Akun 4102 (Potongan Penjualan / Diskon) pada Helper CoA
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public._acc(p_tenant uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid;
  names jsonb := '{"1101":["Kas","asset"],"1102":["Bank, EDC & QRIS","asset"],"1301":["Persediaan Bahan Baku","asset"],
    "2101":["Utang Dagang","liability"],"2102":["Utang Pajak Penjualan","liability"],"2103":["Utang Gaji","liability"],
    "3101":["Modal Pemilik","equity"],"4101":["Pendapatan Penjualan","revenue"],"4102":["Potongan Penjualan (Diskon)","revenue"],
    "5101":["Harga Pokok Penjualan","cogs"],"6101":["Beban Gaji","expense"],"6102":["Beban Sewa","expense"],
    "6103":["Beban Listrik & Internet","expense"],"6104":["Beban Waste & Susut","expense"],"6105":["Beban Kas Kecil Outlet","expense"]}';
begin
  select id into a from accounts where tenant_id = p_tenant and code = p_code;
  if a is null then
    insert into accounts (tenant_id, code, name, type)
    values (p_tenant, p_code, names->p_code->>0, (names->p_code->>1)::account_type) returning id into a;
  end if;
  return a;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Penegakan Jam Operasional pada Shift Kasir (open_shift)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.open_shift(p_branch uuid, p_opening numeric) returns shifts
language plpgsql security definer set search_path = public as $$
declare
  t uuid := _branch_guard(p_branch);
  s shifts;
  pol jsonb;
  v_lock boolean;
  v_start time;
  v_end time;
  v_now time := current_time;
begin
  perform _need(5, 'c');
  if p_opening is null or p_opening < 0 then raise exception 'Modal awal wajib diisi'; end if;

  -- Evaluasi kebijakan operasional (Lapis 3 -> 2 -> 1)
  pol := get_effective_policy(t, p_branch, current_app_role());
  if pol is not null then
    v_lock := coalesce((pol->>'enforce_shift_lock')::boolean, true);
    if v_lock then
      v_start := (pol->>'operating_hours_start')::time;
      v_end := (pol->>'operating_hours_end')::time;
      if v_start <= v_end then
        if v_now < v_start or v_now > v_end then
          raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %)', v_start, v_end;
        end if;
      else
        -- Rentang operasional melewati tengah malam
        if v_now < v_start and v_now > v_end then
          raise exception 'Shift terkunci oleh kebijakan: di luar jam operasional (% - %)', v_start, v_end;
        end if;
      end if;
    end if;
  end if;

  insert into shifts (tenant_id, branch_id, cashier_id, opening_cash)
  values (t, p_branch, auth.uid(), p_opening)
  returning * into s;

  return s;
exception when unique_violation then
  raise exception 'Anda masih punya shift yang terbuka';
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Kriteria 9.3: RPC Penerapan Diskon POS & Otorisasi PIN (apply_order_discount)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.apply_order_discount(
  p_order uuid,
  p_discount numeric,
  p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare
  o orders;
  pol jsonb;
  disc_pct numeric;
  max_disc numeric;
  v_tax numeric;
  v_taxable numeric;
begin
  perform _need(5, 'u');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah tidak terbuka'; end if;
  if p_discount is null or p_discount < 0 then raise exception 'Nominal diskon tidak valid'; end if;
  if p_discount > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal pesanan'; end if;

  if p_discount > 0 and o.subtotal > 0 then
    disc_pct := round((p_discount / o.subtotal) * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    max_disc := coalesce((pol->>'max_discount_pct')::numeric, 15.00);

    if disc_pct > max_disc then
      -- Membutuhkan PIN otorisasi GM atau Owner
      if p_pin is null or length(btrim(p_pin)) = 0 then
        raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN otorisasi GM/Owner.', disc_pct || '%', max_disc || '%';
      end if;

      if not exists (
        select 1 from profiles
        where tenant_id = o.tenant_id
          and role in ('gm', 'owner', 'superadmin')
          and pin_hash is not null
          and crypt(p_pin, pin_hash) = pin_hash
      ) then
        raise exception 'PIN otorisasi GM/Owner salah';
      end if;
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - p_discount);
  v_tax := round(v_taxable * 0.10);

  update orders set
    discount = p_discount,
    tax = v_tax,
    total = v_taxable + v_tax,
    updated_at = now()
  where id = o.id returning * into o;

  return o;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Kriteria 9.3: Penegakan Diskon & Otorisasi PIN di Pembayaran (pay_order)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.pay_order(
  p_order uuid,
  p_payments jsonb,
  p_customer_phone text default null,
  p_discount numeric default null,
  p_pin text default null
) returns orders
language plpgsql security definer set search_path = public, extensions as $$
declare
  o orders;
  pay jsonb;
  paid numeric := 0;
  cash numeric := 0;
  noncash numeric := 0;
  v_tax numeric;
  v_taxable numeric;
  v_total numeric;
  change numeric;
  hpp numeric := 0;
  bl record;
  lvl numeric;
  it record;
  sid uuid;
  pol jsonb;
  disc_amt numeric;
  disc_pct numeric;
  max_disc numeric;
  jlines jsonb;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  disc_amt := coalesce(p_discount, o.discount, 0);
  if disc_amt > o.subtotal then raise exception 'Diskon tidak boleh melebihi subtotal'; end if;

  -- Kriteria 9.3: Evaluasi kebijakan diskon
  if disc_amt > 0 and o.subtotal > 0 then
    disc_pct := round((disc_amt / o.subtotal) * 100, 2);
    pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
    max_disc := coalesce((pol->>'max_discount_pct')::numeric, 15.00);

    if disc_pct > max_disc then
      if p_pin is null or length(btrim(p_pin)) = 0 then
        raise exception 'Diskon % melebihi batas kebijakan (%). Diperlukan PIN otorisasi GM/Owner.', disc_pct || '%', max_disc || '%';
      end if;

      if not exists (
        select 1 from profiles
        where tenant_id = o.tenant_id
          and role in ('gm', 'owner', 'superadmin')
          and pin_hash is not null
          and crypt(p_pin, pin_hash) = pin_hash
      ) then
        raise exception 'PIN otorisasi GM/Owner salah';
      end if;
    end if;
  end if;

  v_taxable := greatest(0, o.subtotal - disc_amt);
  v_tax := round(v_taxable * 0.10);          -- PB1 10%
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

  -- Potong stok sesuai resep (BOM) dan hitung HPP riil
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

  update orders set
    status = 'paid', paid_at = now(),
    discount = disc_amt, tax = v_tax, total = v_total,
    cogs = round(hpp), shift_id = sid,
    customer_phone = coalesce(p_customer_phone, customer_phone),
    updated_at = now()
  where id = o.id returning * into o;

  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;

  -- Jurnal Penjualan PSAK Seimbang
  if disc_amt > 0 then
    jlines := jsonb_build_array(
      jsonb_build_object('code', '1101', 'dr', cash),
      jsonb_build_object('code', '1102', 'dr', noncash),
      jsonb_build_object('code', '4102', 'dr', disc_amt),
      jsonb_build_object('code', '4101', 'cr', o.subtotal),
      jsonb_build_object('code', '2102', 'cr', v_tax),
      jsonb_build_object('code', '5101', 'dr', round(hpp)),
      jsonb_build_object('code', '1301', 'cr', round(hpp))
    );
  else
    jlines := jsonb_build_array(
      jsonb_build_object('code', '1101', 'dr', cash),
      jsonb_build_object('code', '1102', 'dr', noncash),
      jsonb_build_object('code', '4101', 'cr', o.subtotal),
      jsonb_build_object('code', '2102', 'cr', v_tax),
      jsonb_build_object('code', '5101', 'dr', round(hpp)),
      jsonb_build_object('code', '1301', 'cr', round(hpp))
    );
  end if;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jlines);

  return o;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Kriteria 9.5: Penyempurnaan request_void (Shift Open, Bebas PIN, Eskalasi Owner)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.request_void(
  p_order uuid,
  p_reason text,
  p_note text,
  p_option text default 'restock'
) returns approvals
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  a approvals;
  pol jsonb;
  max_void numeric;
  is_escalated boolean := false;
  req_title text;
begin
  if not (has_perm(6, 'q') or has_perm(6, 'c')) then raise exception 'Akses ditolak: fitur 6'; end if;
  select * into o from orders where id = p_order;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'paid' then raise exception 'Hanya transaksi lunas yang bisa di-void'; end if;
  if p_reason not in ('Salah Input Kasir', 'Pelanggan Membatalkan', 'Masakan Rusak') then raise exception 'Alasan tidak valid'; end if;

  -- 1. Kriteria 9.5a: Cek shift transaksi masih terbuka
  if not exists (select 1 from shifts where id = o.shift_id and status = 'open') then
    raise exception 'Void hanya dapat dilakukan pada transaksi dalam shift yang masih terbuka';
  end if;

  if exists (select 1 from approvals where kind = 'void' and status = 'pending' and detail->>'order_id' = o.id::text) then
    raise exception 'Permintaan void untuk transaksi ini sudah menunggu';
  end if;

  -- 2. Kriteria 9.5b: Evaluasi max_void_without_pin dari kebijakan 3 lapis
  pol := get_effective_policy(o.tenant_id, o.branch_id, current_app_role());
  max_void := coalesce((pol->>'max_void_without_pin')::numeric, 50000.00);

  if o.total <= max_void then
    -- Transaksi di bawah atau sama dengan batas max_void_without_pin:
    -- Pembatalan langsung dieksekusi tanpa perlu menunggu approval / PIN GM
    perform _apply_void(o.id, coalesce(p_option, 'restock'), coalesce(p_note, p_reason));

    insert into approvals (
      tenant_id, branch_id, feature, kind, ref, title, amount, status, detail,
      requested_by, decided_by, decided_at, decision_note
    ) values (
      o.tenant_id, o.branch_id, 6, 'void', o.code,
      'Void mandiri (dalam batas tanpa PIN) · ' || lower(p_reason),
      o.total, 'approved',
      jsonb_build_object(
        'order_id', o.id, 'alasan', p_reason, 'catatan', p_note,
        'option', coalesce(p_option, 'restock'), 'auto_approved', true,
        'max_void_limit', max_void
      ),
      auth.uid(), auth.uid(), now(),
      'Disetujui otomatis sesuai kebijakan: nominal transaksi (' || _rp(o.total) || ') <= batas tanpa PIN (' || _rp(max_void) || ')'
    ) returning * into a;

    return a;
  end if;

  -- 3. Kriteria 9.5c: Eskalasi ke Owner jika di atas batas kewenangan GM (Rp 500.000 atau GM request)
  if o.total > 500000 or current_app_role() = 'gm' then
    is_escalated := true;
    req_title := 'Void transaksi (Eskalasi Owner) · ' || lower(p_reason);
  else
    req_title := 'Void transaksi · ' || lower(p_reason);
  end if;

  insert into approvals (
    tenant_id, branch_id, feature, kind, ref, title, amount, status, detail, requested_by
  ) values (
    o.tenant_id, o.branch_id, 6, 'void', o.code, req_title, o.total, 'pending',
    jsonb_build_object(
      'order_id', o.id, 'alasan', p_reason, 'catatan', p_note,
      'option', coalesce(p_option, 'restock'),
      'escalated_to_owner', is_escalated,
      'max_void_limit', max_void
    ),
    auth.uid()
  ) returning * into a;

  return a;
end $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Penegakan Wewenang Eskalasi Owner pada decide_approval
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.decide_approval(
  p_id uuid,
  p_decision public.approval_status,
  p_note text default null,
  p_pin text default null,
  p_option text default null
) returns public.approvals
language plpgsql security definer set search_path = public, extensions as $$
declare
  a approvals;
  needs_pin boolean;
  my_hash text;
begin
  select * into a from approvals where id = p_id for update;
  if not found or not tenant_ok(a.tenant_id) then raise exception 'Persetujuan tidak ditemukan'; end if;
  if a.status <> 'pending' then raise exception 'Sudah diputuskan'; end if;
  if p_decision = 'pending' then raise exception 'Keputusan tidak valid'; end if;
  if not has_perm(a.feature, 'a') then raise exception 'Peran Anda tidak memiliki hak Approval untuk fitur %', a.feature; end if;

  -- Cegah GM memutuskan persetujuan yang dieskalasi ke Owner
  if (a.detail->>'escalated_to_owner')::boolean is true and current_app_role() = 'gm' then
    raise exception 'Persetujuan void ini telah dieskalasi ke Owner (melebihi batas kewenangan GM)';
  end if;

  select label like '%PIN%' into needs_pin from rbac_matrix where feature = a.feature and role = current_app_role();
  if needs_pin then
    select pin_hash into my_hash from profiles where id = auth.uid();
    if my_hash is null or p_pin is null or crypt(p_pin, my_hash) <> my_hash then raise exception 'PIN otorisasi salah'; end if;
  end if;

  if a.kind = 'void' and coalesce(btrim(p_note), '') = '' then raise exception 'Catatan alasan wajib diisi untuk void'; end if;
  if a.kind = 'void' and p_decision = 'approved' and coalesce(p_option, '') not in ('restock', 'waste') then
    raise exception 'Pilih: kembalikan bahan ke stok atau catat sebagai waste';
  end if;

  update approvals set
    status = p_decision,
    decided_by = auth.uid(),
    decided_at = now(),
    decision_note = p_note,
    detail = detail || jsonb_build_object('option', p_option)
  where id = p_id returning * into a;

  -- Efek samping keputusan berdasarkan jenis alur bisnis:
  if a.kind = 'void' and p_decision = 'approved' and a.detail ? 'order_id' then
    perform _apply_void((a.detail->>'order_id')::uuid, p_option, p_note);
  elsif a.kind = 'po' and a.detail ? 'po_id' then
    update purchase_orders set status = case when p_decision = 'approved' then 'approved' else 'draft' end
    where id = (a.detail->>'po_id')::uuid;
  elsif a.kind = 'sto' and a.detail ? 'sto_id' then
    update stock_transfers set status = case when p_decision = 'approved' then 'approved' else 'cancelled' end, approved_by = auth.uid()
    where id = (a.detail->>'sto_id')::uuid;
  elsif a.kind = 'payroll' and a.detail ? 'run_id' then
    update payroll_runs set status = case when p_decision = 'approved' then 'approved' else 'rejected' end
    where id = (a.detail->>'run_id')::uuid;
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


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Grant Hak Eksekusi ke authenticated
-- ══════════════════════════════════════════════════════════════════════════════
grant execute on function public.open_shift to authenticated;
grant execute on function public.apply_order_discount to authenticated;
grant execute on function public.pay_order to authenticated;
grant execute on function public.request_void to authenticated;
grant execute on function public.decide_approval to authenticated;
