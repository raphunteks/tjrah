-- Peran Member (L5): akun pelanggan yang hanya bertindak atas data miliknya sendiri.
-- Prinsip: tolak-dulu. Kebijakan RESTRICTIVE membatasi Member di SEMUA tabel; hanya tabel "milik sendiri" yang terbuka,
-- dan hanya untuk baca. Semua tulisan Member lewat RPC khusus (tiket berikutnya), tidak pernah lewat tabel langsung.

-- ───────── 1 · Profil Member terikat ke satu Tenant dan satu Pelanggan ─────────
alter table public.profiles add column if not exists customer_id uuid references public.customers(id) on delete set null;
create unique index if not exists profiles_customer_uniq on public.profiles (customer_id) where customer_id is not null;
alter table public.profiles drop constraint if exists member_needs_customer;
alter table public.profiles add constraint member_needs_customer
  check (role <> 'member' or (tenant_id is not null and customer_id is not null)) not valid;

-- ───────── 2 · Pembantu identitas ─────────
create or replace function public.norm_phone(p text) returns text
language sql immutable as $$ select nullif(regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g'), '') $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'member')
$$;

create or replace function public.current_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from public.profiles where id = auth.uid() and role = 'member'
$$;

create or replace function public.current_customer_phone() returns text
language sql stable security definer set search_path = public as $$
  select phone from public.customers where id = public.current_customer_id()
$$;
grant execute on function public.is_member(), public.current_customer_id(), public.current_customer_phone(), public.norm_phone(text) to authenticated;

-- Profil Member harus menunjuk Pelanggan di Tenant yang sama.
create or replace function public.member_profile_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' and not exists (select 1 from public.customers c where c.id = new.customer_id and c.tenant_id = new.tenant_id) then
    raise exception 'Pelanggan Member harus berada di Tenant yang sama';
  end if;
  return new;
end $$;
drop trigger if exists profiles_member_check on public.profiles;
create trigger profiles_member_check before insert or update on public.profiles
  for each row execute function public.member_profile_check();

-- ───────── 3 · Pesanan tertaut ke Pelanggan (dasar "pesanan sendiri") ─────────
alter table public.orders add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists orders_customer_idx on public.orders (customer_id) where customer_id is not null;

create or replace function public.orders_link_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is null and public.norm_phone(new.customer_phone) is not null then
    select id into new.customer_id from public.customers
      where tenant_id = new.tenant_id and public.norm_phone(phone) = public.norm_phone(new.customer_phone);
  end if;
  return new;
end $$;
drop trigger if exists orders_link_customer on public.orders;
create trigger orders_link_customer before insert or update of customer_phone on public.orders
  for each row execute function public.orders_link_customer();

-- Pelanggan baru: tautkan Pesanan lama bernomor sama.
create or replace function public.customers_link_orders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set customer_id = new.id
   where tenant_id = new.tenant_id and customer_id is null and public.norm_phone(customer_phone) = public.norm_phone(new.phone);
  return new;
end $$;
drop trigger if exists customers_link_orders on public.customers;
create trigger customers_link_orders after insert on public.customers
  for each row execute function public.customers_link_orders();

update public.orders o set customer_id = c.id
  from public.customers c
 where o.customer_id is null and c.tenant_id = o.tenant_id
   and public.norm_phone(o.customer_phone) is not null and public.norm_phone(c.phone) = public.norm_phone(o.customer_phone);

-- ───────── 4 · Cabang: Member bekerja lintas cabang Tenant-nya (dibatasi kebijakan milik sendiri) ─────────
create or replace function public.branch_ok(p_branch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_app_role()
    when 'superadmin' then true
    when 'owner' then true
    when 'member' then true
    when 'gm' then p_branch is null
      or not exists (select 1 from member_branches where profile_id = auth.uid())
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
    else p_branch is null or p_branch = public.current_branch_id()
      or exists (select 1 from member_branches where profile_id = auth.uid() and branch_id = p_branch)
  end
$$;

-- ───────── 5 · Fungsi operasional menolak Member ─────────
create or replace function public._need(p_feature integer, p_action text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_member() then
    raise exception 'Akses ditolak: Member tidak memakai fungsi operasional';
  end if;
  if not has_perm(p_feature, p_action) then
    raise exception 'Akses ditolak: peran % tidak punya aksi "%" pada fitur %', current_app_role(), p_action, p_feature;
  end if;
end $$;

create or replace function public.escalate_stale_approvals() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if public.is_member() or public.current_tenant_id() is null then return 0; end if;
  return _escalate_stale(public.current_tenant_id());
end $$;

-- Akun Member hanya lahir dari pendaftaran Member (RPC yang mengaktifkan harumin.rpc), tidak dari Master Karyawan.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me public.app_role := public.current_app_role();
  via_rpc boolean := coalesce(current_setting('harumin.rpc', true), '') = 'on';
begin
  if auth.uid() is null then return new; end if; -- service role / seed
  if not via_rpc and new.role = 'member' and (tg_op = 'INSERT' or old.role <> 'member') then
    raise exception 'Akun Member hanya dibuat lewat pendaftaran Member';
  end if;
  if not via_rpc and tg_op = 'UPDATE' and new.customer_id is distinct from old.customer_id then
    raise exception 'Tautan Pelanggan hanya dapat diubah lewat fungsi sistem';
  end if;
  if tg_op = 'UPDATE' then
    if new.id = auth.uid() and new.role <> old.role then raise exception 'Tidak boleh mengubah peran sendiri'; end if;
    if not via_rpc and (
         new.pin_hash is distinct from old.pin_hash or new.is_active is distinct from old.is_active
      or new.deactivated_at is distinct from old.deactivated_at or new.deactivated_by is distinct from old.deactivated_by
      or new.deactivation_reason is distinct from old.deactivation_reason or new.tenant_id is distinct from old.tenant_id
      or new.email is distinct from old.email or new.last_login_at is distinct from old.last_login_at
      or new.last_seen_at is distinct from old.last_seen_at) then
      raise exception 'Kolom ini hanya dapat diubah lewat fungsi sistem (PIN, status aktif, email, tenant)';
    end if;
    if new.id = auth.uid() and me <> 'superadmin'
       and (new.base_salary is distinct from old.base_salary or new.commission_rate is distinct from old.commission_rate) then
      raise exception 'Gaji dan komisi sendiri tidak dapat diubah';
    end if;
    if new.id <> auth.uid() then
      if me = 'owner' and old.role not in ('gm', 'staff', 'dokter') then raise exception 'Owner hanya mengelola GM, Kasir/Staf, dan Dokter'; end if;
      if me = 'gm' and old.role not in ('staff', 'dokter') then raise exception 'GM hanya mengelola Kasir/Staf dan Dokter'; end if;
    end if;
  end if;
  if (tg_op = 'INSERT' or new.role <> old.role) then
    if me <> 'superadmin' and new.role in ('superadmin', 'owner') then
      raise exception 'Hanya Superadmin yang dapat menetapkan peran %', new.role;
    end if;
    if me = 'gm' and new.role = 'gm' then raise exception 'GM tidak dapat mengangkat GM lain'; end if;
  end if;
  return new;
end $$;

-- ───────── 6 · Kebijakan RESTRICTIVE: tolak Member di semua tabel, buka hanya yang milik sendiri (baca) ─────────
-- Idempoten: dijalankan lagi oleh migrasi yang menambah tabel baru (tabel baru otomatis tertutup bagi Member).
create or replace function public.member_lockdown() returns void
language plpgsql as $$
declare
  t text;
  own text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname not in ('rbac_matrix', 'plans', 'icd_codes', 'feature_flags', 'industry_templates')
  loop
    own := case t
      when 'profiles'        then 'id = auth.uid()'
      when 'customers'       then 'id = public.current_customer_id()'
      when 'orders'          then 'customer_id = public.current_customer_id()'
      when 'order_items'     then 'order_id in (select id from public.orders where customer_id = public.current_customer_id())'
      when 'payments'        then 'order_id in (select id from public.orders where customer_id = public.current_customer_id())'
      when 'queue_entries'   then 'public.norm_phone(phone) is not null and public.norm_phone(phone) = public.norm_phone(public.current_customer_phone())'
      when 'member_consents' then 'profile_id = auth.uid()'
      when 'products'        then 'true'
      when 'branches'        then 'true'
      else 'false'
    end;
    execute format('drop policy if exists member_ro on public.%I', t);
    execute format('create policy member_ro on public.%I as restrictive for select using (not public.is_member() or (%s))', t, own);
    execute format('drop policy if exists member_no_ins on public.%I', t);
    execute format('create policy member_no_ins on public.%I as restrictive for insert with check (not public.is_member())', t);
    execute format('drop policy if exists member_no_upd on public.%I', t);
    execute format('create policy member_no_upd on public.%I as restrictive for update using (not public.is_member())', t);
    execute format('drop policy if exists member_no_del on public.%I', t);
    execute format('create policy member_no_del on public.%I as restrictive for delete using (not public.is_member())', t);
  end loop;
end $$;
select public.member_lockdown();

-- Akun Member tidak muncul di Master Karyawan (Owner/GM/Staf tidak melihat profil Member; Pelanggan ada di CRM).
drop policy if exists profiles_hide_members on public.profiles;
create policy profiles_hide_members on public.profiles as restrictive for select
  using (role <> 'member' or id = auth.uid());
