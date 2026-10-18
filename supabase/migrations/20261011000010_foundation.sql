-- Harum.in · FASE 0 (fondasi): pajak per tenant, penugasan cabang, dashboard menghormati cabang GM.
-- Matriks RBAC asli tidak berubah. Pajak = konfigurasi tenant (fitur 1: Superadmin CRUD, Owner R).

-- ═════════ 1 · Pajak penjualan per tenant ═════════
alter table public.tenants add column if not exists tax_label text not null default 'Pajak';
alter table public.tenants add column if not exists tax_rate numeric(5,4) not null default 0
  check (tax_rate >= 0 and tax_rate <= 0.5);
comment on column public.tenants.tax_rate is
  'Tarif pajak penjualan non-klinik, mis. 0.10 = 10%. F&B: PBJT makanan/minuman (maks. 10% per UU 1/2022, tarif riil per Perda). Konfirmasi ke konsultan pajak.';

-- Nilai awal per pilar. Hanya mengisi tenant yang belum pernah diatur (label masih default).
update public.tenants set tax_label = 'PBJT', tax_rate = 0.10 where pillar = 'fnb' and tax_label = 'Pajak';
update public.tenants set tax_label = 'Tanpa pajak', tax_rate = 0 where pillar = 'health' and tax_label = 'Pajak';
update public.tenants set tax_label = 'PPN', tax_rate = 0.11 where pillar = 'retail' and tax_label = 'Pajak';

-- Tenant baru: default pajak mengikuti pilar bila Superadmin belum mengisi (label masih 'Pajak').
create or replace function public.tenant_tax_default() returns trigger language plpgsql as $$
begin
  if new.tax_label = 'Pajak' and new.tax_rate = 0 then
    select l, r into new.tax_label, new.tax_rate from (values
      ('fnb'::pillar, 'PBJT', 0.10), ('health'::pillar, 'Tanpa pajak', 0), ('retail'::pillar, 'PPN', 0.11)) v(p, l, r)
    where v.p = new.pillar;
    new.tax_label := coalesce(new.tax_label, 'Pajak');
    new.tax_rate := coalesce(new.tax_rate, 0);
  end if;
  return new;
end $$;
create trigger tenant_tax_default before insert on public.tenants for each row execute function public.tenant_tax_default();

create or replace function public.tenant_tax_rate(p_tenant uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select tax_rate from tenants where id = p_tenant), 0)
$$;
revoke execute on function public.tenant_tax_rate(uuid) from public, anon;
grant execute on function public.tenant_tax_rate(uuid) to authenticated;

-- Nama akun pajak netral (sebelumnya "Utang Pajak PB1").
update public.accounts set name = 'Utang Pajak Penjualan' where code = '2102' and name = 'Utang Pajak PB1';

-- ═════════ 2 · Penugasan cabang (member_branches) ═════════
-- GM tanpa baris di sini = semua cabang tenant (perilaku lama). GM dengan baris = hanya cabang itu.
-- Staff/Dokter: profiles.branch_id tetap cabang utama; baris tambahan = cabang lain yang boleh dilayani.
create table if not exists public.member_branches (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assigned_by uuid default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (profile_id, branch_id)
);
create index if not exists member_branches_branch on public.member_branches (branch_id);
alter table public.member_branches enable row level security;
-- Baca: setiap orang melihat penugasannya sendiri (termasuk Dokter, yang tidak punya akses fitur 13);
-- pemegang R fitur 13 tanpa cakupan (Owner/GM) melihat semua penugasan tenant. Tulis: hanya lewat set_member_branches().
create policy mb_read on public.member_branches for select using (
  profile_id = auth.uid()
  or (public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null));

create or replace function public.branch_ok(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_app_role()
    when 'superadmin' then true
    when 'owner' then true
    when 'gm' then p_branch is null
      or not exists (select 1 from member_branches where profile_id = auth.uid())
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
    else p_branch is null or p_branch = public.current_branch_id()
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
  end
$$;

-- Owner/Superadmin menugaskan GM, Staff, Dokter. GM hanya menugaskan Staff/Dokter ke cabang yang ia pegang.
create or replace function public.set_member_branches(p_profile uuid, p_branches uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare tgt profiles; me app_role := current_app_role(); b uuid; n int := 0;
begin
  perform _need(13, 'u');
  select * into tgt from profiles where id = p_profile;
  if not found or tgt.tenant_id is null or not tenant_ok(tgt.tenant_id) then raise exception 'Anggota tidak ditemukan'; end if;
  if tgt.role in ('superadmin', 'owner') then raise exception 'Owner/Superadmin tidak dibatasi cabang'; end if;
  if me = 'gm' and tgt.role = 'gm' then raise exception 'GM tidak dapat mengatur cabang GM lain'; end if;
  if me not in ('superadmin', 'owner', 'gm') then raise exception 'Akses ditolak'; end if;
  foreach b in array coalesce(p_branches, '{}') loop
    if not exists (select 1 from branches where id = b and tenant_id = tgt.tenant_id) then raise exception 'Cabang bukan milik tenant ini'; end if;
    if not branch_ok(b) then raise exception 'Anda tidak memegang cabang tersebut'; end if;
  end loop;
  -- GM hanya mengganti penugasan di cabang yang ia pegang; penugasan Owner di cabang lain tetap utuh.
  delete from member_branches where profile_id = p_profile and (me <> 'gm' or branch_ok(branch_id));
  insert into member_branches (profile_id, branch_id, tenant_id)
  select p_profile, x, tgt.tenant_id from unnest(coalesce(p_branches, '{}')) x
  on conflict do nothing;
  select count(*) into n from member_branches where profile_id = p_profile;
  if tgt.role in ('staff', 'dokter') then
    if n = 0 then raise exception 'Staff/Dokter wajib punya minimal satu cabang'; end if;
    -- Cabang utama: pilihan pertama bila ada; bila cabang utama lama tidak lagi ditugaskan, pindah ke salah satu penugasan.
    update profiles set branch_id = coalesce(p_branches[1],
        case when exists (select 1 from member_branches where profile_id = p_profile and branch_id = tgt.branch_id) then tgt.branch_id end,
        (select branch_id from member_branches where profile_id = p_profile order by assigned_at limit 1))
    where id = p_profile;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (tgt.tenant_id, auth.uid(), me, 'update', 'member_branches', p_profile::text, jsonb_build_object('branches', p_branches));
  return n;
end $$;
revoke execute on function public.set_member_branches(uuid, uuid[]) from public, anon;
grant execute on function public.set_member_branches(uuid, uuid[]) to authenticated;

-- ═════════ 3 · pay_order v4: tarif pajak dari tenant ═════════
create or replace function public.pay_order(p_order uuid, p_payments jsonb, p_customer_phone text default null) returns orders
language plpgsql security definer set search_path = public as $$
declare o orders; pay jsonb; paid numeric := 0; cash numeric := 0; noncash numeric := 0; v_tax numeric; v_total numeric;
        change numeric; hpp numeric := 0; bl record; lvl numeric; it record; sid uuid; v_phone text; pts int;
begin
  perform _need(5, 'c');
  select * into o from orders where id = p_order for update;
  if not found or not tenant_ok(o.tenant_id) or not branch_ok(o.branch_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  select id into sid from shifts where cashier_id = auth.uid() and status = 'open';
  if sid is null then raise exception 'Buka shift kasir dulu sebelum menerima pembayaran'; end if;

  -- Tarif & nama pajak dari pengaturan tenant (Fase 0). Tagihan klinik (jasa kesehatan medis) selalu tanpa pajak.
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * public.tenant_tax_rate(o.tenant_id)) end;
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
  update orders set status = 'paid', paid_at = now(), tax = v_tax, total = v_total, cogs = round(hpp), shift_id = sid, customer_phone = v_phone
  where id = o.id returning * into o;
  update shifts set cash_sales = cash_sales + cash, non_cash_sales = non_cash_sales + noncash where id = sid;
  update tables set status = 'dirty' where id = o.table_id;
  update prescriptions set status = 'dispensed', dispensed_at = now() where order_id = o.id and status = 'sent';

  -- CRM (fitur 15): 1 poin per Rp10.000; struk digital diantrekan ke WhatsApp pelanggan lewat Hermes.
  if v_phone is not null then
    pts := floor(v_total / 10000);
    perform set_config('harumin.sys', '1', true);   -- izinkan kenaikan poin oleh sistem (lihat customers_guard)
    insert into customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at)
    values (o.tenant_id, v_phone, o.customer_name, pts, v_total, 1, now())
    on conflict (tenant_id, phone) do update set points = customers.points + excluded.points,
      total_spent = customers.total_spent + excluded.total_spent, visits = customers.visits + 1, last_visit_at = now(),
      name = coalesce(customers.name, excluded.name);
    perform set_config('harumin.sys', '', true);
    perform _hermes(o.tenant_id, 'whatsapp', 'Pelanggan ' || left(v_phone, 4) || '••••' || right(v_phone, 3), 'receipt',
      format('Struk %s: total %s. +%s poin Harum.in.', o.code, _rp(v_total), pts));
  end if;

  perform _journal(o.tenant_id, o.branch_id, 'Penjualan ' || o.code, 'pos', o.id, jsonb_build_array(
    jsonb_build_object('code', '1101', 'dr', cash), jsonb_build_object('code', '1102', 'dr', noncash),
    jsonb_build_object('code', '4101', 'cr', o.subtotal), jsonb_build_object('code', '2102', 'cr', o.tax),
    jsonb_build_object('code', '5101', 'dr', round(hpp)), jsonb_build_object('code', '1301', 'cr', round(hpp))));
  return o;
end $$;

-- ═════════ 4 · dashboard_daily: hormati cabang GM ═════════
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
    and public.branch_ok(br.id)   -- GM yang dibatasi cabang hanya melihat cabangnya
  order by 1, 3;
end $$;
