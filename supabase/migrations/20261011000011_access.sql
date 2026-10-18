-- Harum.in · FASE 1 — Layanan & Akses
-- Matriks RBAC asli TIDAK berubah. Semua aturan di bawah mempersempit atau menegakkan hierarki di atas matriks:
--   Superadmin → mengelola Owner (fitur 1) · Owner → GM/Staf/Dokter (fitur 13) · GM → Staf/Dokter di cabangnya (fitur 13).
-- Tiket CS memakai lapisan platform di luar 20 fitur (keputusan K1 dokumen brainstorm).

-- ═════════ 1 · Siklus hidup akun & tenant ═════════
alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid,
  add column if not exists deactivation_reason text,
  add column if not exists last_login_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists phone text;
alter table public.tenants
  add column if not exists suspended_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists status_before_suspend public.tenant_status,
  add column if not exists timezone text not null default 'Asia/Makassar';

-- Akun nonaktif atau tenant ditangguhkan → peran "hilang" → has_perm() false → RLS menolak semuanya seketika.
-- (JWT tetap berlaku hingga kedaluwarsa, tetapi tidak ada data yang bisa dibaca/ditulis.)
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.current_tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.tenant_id from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.current_branch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.branch_id from public.profiles p left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid() and p.is_active and (p.role = 'superadmin' or t.status <> 'suspended')
$$;
create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' and is_active from public.profiles where id = auth.uid()), false)
$$;

-- Status akses untuk klien: alasan yang bisa ditampilkan saat login ditolak.
create or replace function public.my_access_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null then jsonb_build_object('ok', false, 'code', 'missing', 'reason', 'Akun tidak ditemukan.')
    when not p.is_active then jsonb_build_object('ok', false, 'code', 'deactivated', 'reason', coalesce(p.deactivation_reason, 'Akun dinonaktifkan.'))
    when p.role <> 'superadmin' and t.status = 'suspended' then jsonb_build_object('ok', false, 'code', 'suspended', 'reason', coalesce(t.suspended_reason, 'Langganan tenant ditangguhkan.'))
    else jsonb_build_object('ok', true) end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
  left join public.tenants t on t.id = p.tenant_id
$$;

-- Audit: denyut presence tidak dicatat sebagai perubahan profil.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  t_id uuid;
begin
  if tg_table_name = 'profiles' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'last_seen_at' - 'last_login_at') = (to_jsonb(old) - 'last_seen_at' - 'last_login_at') then
    return new;
  end if;
  t_id := case when rec ? 'tenant_id' then (rec->>'tenant_id')::uuid
               when tg_table_name = 'tenants' then (rec->>'id')::uuid end;
  rec := rec - 'pin_hash'; -- jangan pernah salin hash PIN ke log
  insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t_id, auth.uid(), public.current_app_role(), lower(tg_op), tg_table_name, rec->>'id',
          case when tg_op = 'UPDATE' then jsonb_build_object('after', rec) else rec end);
  return coalesce(new, old);
end $$;

-- ═════════ 2 · Penjaga hierarki & kolom sensitif pada profiles ═════════
-- Kolom di bawah hanya boleh berubah lewat fungsi sistem (yang menyalakan harumin.rpc), bukan UPDATE langsung.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me public.app_role := public.current_app_role();
  via_rpc boolean := coalesce(current_setting('harumin.rpc', true), '') = 'on';
begin
  if auth.uid() is null then return new; end if; -- service role / seed
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
    -- Hierarki: Owner hanya menyentuh GM/Staf/Dokter; GM hanya Staf/Dokter. Diri sendiri hanya data non-sensitif.
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

-- Akun dibuat lewat undangan (Edge Function dengan service role) dan dinonaktifkan, bukan dihapus.
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create or replace function public.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update public.profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = auth.uid();
end $$;

-- Presence: dipanggil klien saat masuk (p_login = true) dan berkala. Mencatat login ke audit dan menandai undangan diterima.
create or replace function public.touch_presence(p_login boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then return; end if;
  perform set_config('harumin.rpc', 'on', true);
  update public.profiles set last_seen_at = now(), last_login_at = case when p_login then now() else last_login_at end
    where id = auth.uid() and is_active returning * into me;
  if me.id is null then return; end if;
  if p_login then
    insert into public.audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (me.tenant_id, me.id, me.role, 'login', 'session', me.id::text, '{}'::jsonb);
    update public.staff_invites set accepted_at = now() where auth_user_id = me.id and accepted_at is null and revoked_at is null;
  end if;
end $$;

-- ═════════ 3 · Undangan akun berjenjang ═════════
create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  role public.app_role not null check (role in ('owner', 'gm', 'staff', 'dokter')),
  branch_ids uuid[] not null default '{}',
  invited_by uuid references public.profiles(id) on delete set null default auth.uid(),
  auth_user_id uuid,
  sent_at timestamptz,
  expires_at timestamptz not null default now() + interval '48 hours',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists staff_invites_open on public.staff_invites (tenant_id, lower(email)) where accepted_at is null and revoked_at is null;
alter table public.staff_invites enable row level security;
-- Superadmin melihat semua; Owner melihat undangan GM/Staf/Dokter tenantnya; GM hanya Staf/Dokter di cabang yang ia pegang.
create policy invites_read on public.staff_invites for select using (
  public.tenant_ok(tenant_id) and public.has_perm(13, 'r') and public.perm_scope(13) is null and (
    public.is_superadmin()
    or (public.current_app_role() = 'owner' and role <> 'owner')
    or (public.current_app_role() = 'gm' and role in ('staff', 'dokter')
        and exists (select 1 from unnest(branch_ids) b where public.branch_ok(b)))));

-- Boleh tidaknya peran pemanggil mengelola akun berperan p_role dengan cabang p_branches.
create or replace function public._can_manage(p_role public.app_role, p_branches uuid[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return case public.current_app_role()
    when 'superadmin' then p_role = 'owner'
    when 'owner' then p_role in ('gm', 'staff', 'dokter')
    when 'gm' then p_role in ('staff', 'dokter') and cardinality(coalesce(p_branches, '{}')) > 0
                   and not exists (select 1 from unnest(p_branches) b where not public.branch_ok(b))
    else false end;
end $$;

create or replace function public._valid_email(p text) returns boolean language sql immutable as $$
  select p ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and length(p) <= 254
$$;

create or replace function public.create_invite(p_email text, p_full_name text, p_role public.app_role,
  p_branches uuid[] default '{}', p_phone text default null, p_tenant uuid default null) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); t uuid; em text := lower(btrim(p_email)); inv public.staff_invites; pil public.pillar;
begin
  if me is null then raise exception 'Akses ditolak'; end if;
  if me = 'superadmin' then perform _need(1, 'c'); t := p_tenant; else perform _need(13, 'c'); t := public.current_tenant_id(); end if;
  if t is null then raise exception 'Tenant wajib dipilih'; end if;
  if not exists (select 1 from tenants where id = t) then raise exception 'Tenant tidak ditemukan'; end if;
  if not public._can_manage(p_role, p_branches) then
    raise exception 'Peran % tidak dapat mengundang %', me, p_role;
  end if;
  if not public._valid_email(em) then raise exception 'Format email tidak valid'; end if;
  if length(btrim(coalesce(p_full_name, ''))) < 2 then raise exception 'Nama lengkap wajib diisi'; end if;
  if p_phone is not null and p_phone !~ '^\+?[0-9 \-]{8,20}$' then raise exception 'Nomor telepon tidak valid'; end if;
  if exists (select 1 from profiles where lower(email) = em) then raise exception 'Email sudah terdaftar'; end if;
  if exists (select 1 from staff_invites where tenant_id = t and lower(email) = em and accepted_at is null and revoked_at is null) then
    raise exception 'Undangan untuk email ini masih aktif — kirim ulang atau cabut dulu';
  end if;
  select pillar into pil from tenants where id = t;
  if p_role = 'dokter' and pil <> 'health' then raise exception 'Peran Dokter hanya untuk tenant layanan kesehatan'; end if;
  if p_role in ('staff', 'dokter') and cardinality(coalesce(p_branches, '{}')) = 0 then raise exception 'Pilih minimal satu cabang'; end if;
  if exists (select 1 from unnest(coalesce(p_branches, '{}')) b where not exists (select 1 from branches where id = b and tenant_id = t)) then
    raise exception 'Cabang bukan milik tenant ini';
  end if;
  insert into staff_invites (tenant_id, email, full_name, phone, role, branch_ids)
  values (t, em, btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''), p_role, case when p_role = 'owner' then '{}' else coalesce(p_branches, '{}') end)
  returning * into inv;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), me, 'invite', 'staff_invites', inv.id::text, jsonb_build_object('role', p_role, 'email', em, 'branches', inv.branch_ids));
  return inv;
end $$;

-- Dipanggil Edge Function invite-member atas nama pemanggil: memvalidasi wewenang sebelum service role membuat akun Auth.
create or replace function public.prepare_invite_send(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then
    raise exception 'Undangan tidak ditemukan';
  end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima'; end if;
  if inv.revoked_at is not null then raise exception 'Undangan sudah dicabut'; end if;
  if inv.expires_at < now() then raise exception 'Undangan kedaluwarsa — gunakan Kirim ulang'; end if;
  return to_jsonb(inv);
end $$;

create or replace function public.resend_invite(p_id uuid) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then raise exception 'Undangan tidak ditemukan'; end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima'; end if;
  if inv.revoked_at is not null then raise exception 'Undangan sudah dicabut'; end if;
  update staff_invites set expires_at = now() + interval '48 hours', sent_at = null where id = p_id returning * into inv;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (inv.tenant_id, auth.uid(), public.current_app_role(), 'invite_resend', 'staff_invites', inv.id::text, '{}'::jsonb);
  return inv;
end $$;

create or replace function public.revoke_invite(p_id uuid) returns public.staff_invites
language plpgsql security definer set search_path = public as $$
declare inv public.staff_invites;
begin
  select * into inv from staff_invites where id = p_id;
  if not found or not public.tenant_ok(inv.tenant_id) or not public._can_manage(inv.role, inv.branch_ids) then raise exception 'Undangan tidak ditemukan'; end if;
  if inv.accepted_at is not null then raise exception 'Undangan sudah diterima — nonaktifkan akunnya'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update staff_invites set revoked_at = now() where id = p_id returning * into inv;
  if inv.auth_user_id is not null then
    update profiles set is_active = false, deactivated_at = now(), deactivated_by = auth.uid(), deactivation_reason = 'Undangan dicabut'
      where id = inv.auth_user_id and last_login_at is null;
  end if;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (inv.tenant_id, auth.uid(), public.current_app_role(), 'invite_revoke', 'staff_invites', inv.id::text, '{}'::jsonb);
  return inv;
end $$;

-- ═════════ 4 · Nonaktifkan / aktifkan akun, reset PIN ═════════
create or replace function public.set_member_active(p_profile uuid, p_active boolean, p_reason text default null) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); tgt public.profiles;
begin
  if me is null then raise exception 'Akses ditolak'; end if;
  if me = 'superadmin' then perform _need(1, 'u'); else perform _need(13, 'u'); end if;
  select * into tgt from profiles where id = p_profile for update;
  if not found or tgt.tenant_id is null or not public.tenant_ok(tgt.tenant_id) then raise exception 'Anggota tidak ditemukan'; end if;
  if tgt.id = auth.uid() then raise exception 'Tidak dapat menonaktifkan akun sendiri'; end if;
  if not (case me
      when 'superadmin' then tgt.role = 'owner'
      when 'owner' then tgt.role in ('gm', 'staff', 'dokter')
      when 'gm' then tgt.role in ('staff', 'dokter') and (public.branch_ok(tgt.branch_id)
                     or exists (select 1 from member_branches m where m.profile_id = tgt.id and public.branch_ok(m.branch_id)))
      else false end) then
    raise exception 'Anda tidak berwenang mengubah status akun ini';
  end if;
  if not p_active then
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Alasan wajib diisi'; end if;
    if exists (select 1 from shifts where cashier_id = tgt.id and status = 'open') then
      raise exception 'Akun ini masih punya shift kasir terbuka — tutup shift dulu';
    end if;
  end if;
  perform set_config('harumin.rpc', 'on', true);
  update profiles set is_active = p_active,
    deactivated_at = case when p_active then null else now() end,
    deactivated_by = case when p_active then null else auth.uid() end,
    deactivation_reason = case when p_active then null else btrim(p_reason) end
  where id = p_profile returning * into tgt;
  return tgt;
end $$;

-- Owner mengatur ulang PIN otorisasi GM. PIN baru tidak pernah masuk log.
create or replace function public.reset_member_pin(p_profile uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare tgt public.profiles;
begin
  perform _need(13, 'u');
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat mengatur ulang PIN GM'; end if;
  if p_pin !~ '^[0-9]{6}$' then raise exception 'PIN harus 6 digit angka'; end if;
  select * into tgt from profiles where id = p_profile;
  if not found or tgt.role <> 'gm' or not public.tenant_ok(tgt.tenant_id) then raise exception 'GM tidak ditemukan'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update profiles set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_profile;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (tgt.tenant_id, auth.uid(), 'owner', 'pin_reset', 'profiles', p_profile::text, '{}'::jsonb);
end $$;

-- ═════════ 5 · Siklus hidup tenant (Superadmin) ═════════
create table if not exists public.tenant_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.tenant_notes enable row level security;
-- Catatan internal CS: hanya Superadmin. Owner tidak pernah melihatnya.
create policy tnotes_r on public.tenant_notes for select using (public.is_superadmin() and public.has_perm(1, 'r'));
create policy tnotes_c on public.tenant_notes for insert with check (public.is_superadmin() and public.has_perm(1, 'c'));

create or replace function public.create_tenant_with_owner(p_name text, p_slug text, p_pillar public.pillar, p_plan uuid,
  p_owner_name text, p_owner_email text, p_owner_phone text default null, p_trial_days int default 14,
  p_branches text[] default array['Cabang Utama']) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid; inv public.staff_invites; b text;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'c');
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Nama usaha wajib diisi'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Slug hanya huruf kecil, angka, dan tanda hubung'; end if;
  if p_trial_days not between 0 and 90 then raise exception 'Masa uji coba 0–90 hari'; end if;
  if p_plan is not null and not exists (select 1 from plans where id = p_plan) then raise exception 'Paket tidak ditemukan'; end if;
  insert into tenants (name, slug, pillar, status, plan_id, current_period_end, owner_email)
  values (btrim(p_name), p_slug, p_pillar, 'trial', p_plan, current_date + p_trial_days, lower(btrim(p_owner_email)))
  returning id into t;
  foreach b in array coalesce(p_branches, '{}') loop
    if length(btrim(b)) > 0 then insert into branches (tenant_id, name) values (t, btrim(b)); end if;
  end loop;
  inv := public.create_invite(p_owner_email, p_owner_name, 'owner', '{}', p_owner_phone, t);
  return jsonb_build_object('tenant_id', t, 'invite_id', inv.id);
exception when unique_violation then
  raise exception 'Slug atau email sudah dipakai';
end $$;

create or replace function public.set_tenant_suspended(p_tenant uuid, p_suspend boolean, p_reason text default null) returns public.tenants
language plpgsql security definer set search_path = public as $$
declare t public.tenants;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'u');
  select * into t from tenants where id = p_tenant for update;
  if not found then raise exception 'Tenant tidak ditemukan'; end if;
  if p_suspend then
    if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Alasan penangguhan wajib diisi'; end if;
    if t.status = 'suspended' then raise exception 'Tenant sudah ditangguhkan'; end if;
    update tenants set status_before_suspend = status, status = 'suspended', suspended_reason = btrim(p_reason), suspended_at = now()
      where id = p_tenant returning * into t;
  else
    if t.status <> 'suspended' then raise exception 'Tenant tidak sedang ditangguhkan'; end if;
    update tenants set status = coalesce(status_before_suspend, 'active'), status_before_suspend = null, suspended_reason = null, suspended_at = null
      where id = p_tenant returning * into t;
  end if;
  return t;
end $$;

create or replace function public.extend_trial(p_tenant uuid, p_days int) returns public.tenants
language plpgsql security definer set search_path = public as $$
declare t public.tenants;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'u');
  if p_days not between 1 and 60 then raise exception 'Perpanjangan 1–60 hari'; end if;
  update tenants set current_period_end = greatest(coalesce(current_period_end, current_date), current_date) + p_days
    where id = p_tenant and status in ('trial', 'past_due') returning * into t;
  if not found then raise exception 'Hanya tenant trial atau telat bayar yang dapat diperpanjang'; end if;
  return t;
end $$;

create or replace function public.add_tenant_note(p_tenant uuid, p_body text) returns public.tenant_notes
language plpgsql security definer set search_path = public as $$
declare n public.tenant_notes;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  perform _need(1, 'c');
  insert into tenant_notes (tenant_id, body) values (p_tenant, btrim(p_body)) returning * into n;
  return n;
end $$;

-- ═════════ 6 · Tiket bantuan CS (lapisan platform, di luar matriks) ═════════
create sequence if not exists public.ticket_no;
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'TKT-' || lpad(nextval('public.ticket_no')::text, 4, '0'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null default auth.uid(),
  category text not null check (category in ('Tagihan', 'Teknis', 'Data', 'Integrasi', 'SATUSEHAT', 'Lainnya')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting_owner', 'resolved')),
  subject text not null check (length(btrim(subject)) between 3 and 140),
  assigned_to uuid references public.profiles(id) on delete set null,
  sla_due_at timestamptz not null,
  first_response_at timestamptz,
  csat smallint check (csat between 1 and 5),
  csat_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_tenant on public.support_tickets (tenant_id, status);
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  author_role public.app_role not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket on public.ticket_messages (ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
-- Superadmin: semua. Owner: tiket tenantnya. Tulis hanya lewat fungsi di bawah.
create policy tickets_read on public.support_tickets for select using (
  public.is_superadmin() or (public.current_app_role() = 'owner' and tenant_id = public.current_tenant_id()));
-- Pesan internal tidak pernah terlihat Owner.
create policy tmsg_read on public.ticket_messages for select using (
  public.is_superadmin() or (public.current_app_role() = 'owner' and tenant_id = public.current_tenant_id() and not internal));

create or replace function public.open_ticket(p_category text, p_subject text, p_body text) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare t uuid := public.current_tenant_id(); tk public.support_tickets; pr text; hrs int; big boolean;
begin
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat membuat tiket'; end if;
  if length(btrim(coalesce(p_body, ''))) < 5 then raise exception 'Jelaskan kendala Anda (minimal 5 karakter)'; end if;
  select (pl.price_month is null or pl.max_branches >= 99) into big from tenants tn left join plans pl on pl.id = tn.plan_id where tn.id = t;
  -- Prioritas awal: kategori teknis/integrasi lebih tinggi; paket Enterprise naik satu tingkat. SLA respons pertama berjalan dalam jam kalender.
  pr := case when p_category in ('Teknis', 'Integrasi', 'SATUSEHAT') then 'high' else 'normal' end;
  if coalesce(big, false) then pr := case pr when 'high' then 'urgent' else 'high' end; end if;
  hrs := case pr when 'urgent' then 2 when 'high' then 4 when 'normal' then 8 else 24 end;
  insert into support_tickets (tenant_id, category, priority, subject, sla_due_at)
  values (t, p_category, pr, btrim(p_subject), now() + make_interval(hours => hrs)) returning * into tk;
  insert into ticket_messages (ticket_id, tenant_id, author_role, body) values (tk.id, t, 'owner', btrim(p_body));
  return tk;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text, p_internal boolean default false) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare me public.app_role := public.current_app_role(); tk public.support_tickets;
begin
  select * into tk from support_tickets where id = p_ticket for update;
  if not found or me is null or not (me = 'superadmin' or (me = 'owner' and tk.tenant_id = public.current_tenant_id())) then raise exception 'Tiket tidak ditemukan'; end if;
  if me not in ('superadmin', 'owner') then raise exception 'Akses ditolak'; end if;
  if length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Pesan kosong'; end if;
  if me = 'owner' and p_internal then raise exception 'Catatan internal hanya untuk tim Harum.in'; end if;
  insert into ticket_messages (ticket_id, tenant_id, author_role, body, internal) values (tk.id, tk.tenant_id, me, btrim(p_body), p_internal);
  if me = 'owner' then
    update support_tickets set status = case when status = 'new' then 'new' else 'in_progress' end, closed_at = null, updated_at = now()
      where id = tk.id returning * into tk;
  elsif not p_internal then
    update support_tickets set first_response_at = coalesce(first_response_at, now()), assigned_to = coalesce(assigned_to, auth.uid()),
      status = case when status in ('new', 'in_progress') then 'waiting_owner' else status end, updated_at = now()
      where id = tk.id returning * into tk;
  else
    update support_tickets set updated_at = now() where id = tk.id returning * into tk;
  end if;
  return tk;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare tk public.support_tickets;
begin
  if not public.is_superadmin() then raise exception 'Akses ditolak'; end if;
  if p_status not in ('new', 'in_progress', 'waiting_owner', 'resolved') then raise exception 'Status tidak dikenal'; end if;
  update support_tickets set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now(),
    closed_at = case when p_status = 'resolved' then now() else null end
  where id = p_ticket returning * into tk;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  return tk;
end $$;

create or replace function public.rate_ticket(p_ticket uuid, p_score int, p_note text default null) returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare tk public.support_tickets;
begin
  if public.current_app_role() <> 'owner' then raise exception 'Hanya Owner yang dapat menilai'; end if;
  select * into tk from support_tickets where id = p_ticket and tenant_id = public.current_tenant_id() for update;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;
  if tk.status <> 'resolved' then raise exception 'Penilaian hanya setelah tiket selesai'; end if;
  if tk.csat is not null then raise exception 'Tiket ini sudah dinilai'; end if;
  if p_score not between 1 and 5 then raise exception 'Nilai 1–5'; end if;
  update support_tickets set csat = p_score, csat_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_ticket returning * into tk;
  return tk;
end $$;

-- Judul tiket tercatat di audit; isi pesan (termasuk catatan internal) sengaja TIDAK dipasang trigger audit.
create trigger support_tickets_audit after insert or update on public.support_tickets for each row execute function public.audit_row();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_tickets, public.ticket_messages;
  end if;
end $$;

-- ═════════ 7 · Monitoring ═════════
-- Superadmin: metrik AGREGAT per tenant (hitungan & GMV; tanpa baris transaksi). Fitur 5 tetap "-" bagi Superadmin pada matriks.
create or replace function public.tenant_health() returns table (
  tenant_id uuid, name text, slug text, pillar public.pillar, status public.tenant_status, plan_name text, plan_price numeric,
  period_end date, created_at timestamptz, suspended_reason text,
  owner_id uuid, owner_name text, owner_email text, owner_active boolean, owner_last_login timestamptz,
  branches int, staff int, orders_7d int, orders_28d int, gmv_28d numeric,
  open_tickets int, unpaid_amount numeric, overdue_invoices int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_superadmin() and public.has_perm(1, 'r')) then raise exception 'Akses ditolak'; end if;
  return query
  select t.id, t.name, t.slug, t.pillar, t.status, pl.name, pl.price_month, t.current_period_end, t.created_at, t.suspended_reason,
    ow.id, ow.full_name, ow.email, ow.is_active, ow.last_login_at,
    (select count(*)::int from branches b where b.tenant_id = t.id and b.name is not null),
    (select count(*)::int from profiles p where p.tenant_id = t.id and p.role in ('gm', 'staff', 'dokter') and p.is_active),
    (select count(*)::int from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '7 days'),
    (select count(*)::int from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '28 days'),
    (select coalesce(sum(o.total), 0) from orders o where o.tenant_id = t.id and o.status = 'paid' and o.paid_at >= now() - interval '28 days'),
    (select count(*)::int from support_tickets s where s.tenant_id = t.id and s.status <> 'resolved'),
    (select coalesce(sum(i.amount), 0) from invoices i where i.tenant_id = t.id and i.status = 'unpaid'),
    (select count(*)::int from invoices i where i.tenant_id = t.id and i.status = 'unpaid' and i.period < current_date - 7)
  from tenants t
  left join plans pl on pl.id = t.plan_id
  left join lateral (select p.id, p.full_name, p.email, p.is_active, p.last_login_at from profiles p
                     where p.tenant_id = t.id and p.role = 'owner' order by p.is_active desc, p.created_at limit 1) ow on true
  order by t.created_at;
end $$;

-- Siapa bertugas sekarang: shift terbuka + angka berjalan. SECURITY INVOKER → RLS (cabang GM, hak fitur 5) tetap berlaku.
create or replace function public.on_duty(p_branch uuid default null) returns table (
  shift_id uuid, cashier_id uuid, cashier_name text, branch_id uuid, branch_name text, opened_at timestamptz,
  opening_cash numeric, cash_sales numeric, non_cash_sales numeric, orders_paid int, open_orders int, voids int,
  discount_total numeric, pending_void_requests int, last_activity timestamptz)
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.has_perm(5, 'r') or public.current_app_role() not in ('owner', 'gm') then raise exception 'Akses ditolak'; end if;
  return query
  select s.id, s.cashier_id, p.full_name, s.branch_id, b.name, s.opened_at, s.opening_cash, s.cash_sales, s.non_cash_sales,
    (select count(*)::int from orders o where o.shift_id = s.id and o.status = 'paid'),
    (select count(*)::int from orders o where o.cashier_id = s.cashier_id and o.status = 'open' and o.branch_id = s.branch_id),
    (select count(*)::int from orders o where o.shift_id = s.id and o.status = 'void'),
    (select coalesce(sum(o.discount), 0) from orders o where o.shift_id = s.id and o.status = 'paid'),
    (select count(*)::int from approvals a where a.kind = 'void' and a.status = 'pending' and a.requested_by = s.cashier_id),
    greatest(s.opened_at, (select max(coalesce(o.paid_at, o.created_at)) from orders o where o.shift_id = s.id))
  from shifts s
  join profiles p on p.id = s.cashier_id
  join branches b on b.id = s.branch_id
  where s.status = 'open' and s.tenant_id = public.current_tenant_id() and (p_branch is null or s.branch_id = p_branch)
  order by s.opened_at;
end $$;

-- Kartu skor Kasir (transaksi, void, diskon, selisih kas, keterlambatan) dan GM (kecepatan approval).
-- Toleransi terlambat 10 menit dari jadwal shift, memakai zona waktu tenant.
create or replace function public.staff_scorecard(p_from date, p_to date) returns table (
  profile_id uuid, full_name text, role public.app_role, branch_id uuid, is_active boolean,
  shifts int, orders_paid int, revenue numeric, voids int, discount_total numeric, subtotal_total numeric,
  cash_variance numeric, short_shifts int, clock_ins int, late_ins int,
  approvals_decided int, avg_decision_min numeric)
language plpgsql stable security invoker set search_path = public as $$
declare tz text;
begin
  if not public.has_perm(13, 'r') or public.current_app_role() not in ('owner', 'gm') or public.perm_scope(13) is not null then raise exception 'Akses ditolak'; end if;
  select timezone into tz from tenants where id = public.current_tenant_id();
  return query
  select p.id, p.full_name, p.role, p.branch_id, p.is_active,
    (select count(*)::int from shifts s where s.cashier_id = p.id and s.opened_at::date between p_from and p_to),
    (select count(*)::int from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.total), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select count(*)::int from orders o where o.cashier_id = p.id and o.status = 'void' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.discount), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(o.subtotal), 0) from orders o where o.cashier_id = p.id and o.status = 'paid' and o.paid_at::date between p_from and p_to),
    (select coalesce(sum(s.variance), 0) from shifts s where s.cashier_id = p.id and s.status = 'closed' and s.opened_at::date between p_from and p_to),
    (select count(*)::int from shifts s where s.cashier_id = p.id and s.status = 'closed' and s.variance < 0 and s.opened_at::date between p_from and p_to),
    (select count(*)::int from attendance a where a.profile_id = p.id and a.kind = 'in' and a.created_at::date between p_from and p_to),
    (select count(*)::int from attendance a join work_shifts w on w.profile_id = a.profile_id and w.work_date = (a.created_at at time zone tz)::date
      where a.profile_id = p.id and a.kind = 'in' and a.created_at::date between p_from and p_to
        and (a.created_at at time zone tz)::time > w.start_time + interval '10 minutes'),
    (select count(*)::int from approvals x where x.decided_by = p.id and x.decided_at::date between p_from and p_to),
    (select round(avg(extract(epoch from x.decided_at - x.requested_at) / 60)::numeric, 1) from approvals x where x.decided_by = p.id and x.decided_at::date between p_from and p_to)
  from profiles p
  where p.tenant_id = public.current_tenant_id() and p.role in ('staff', 'gm')
    and (public.current_app_role() = 'owner' or p.role = 'staff')
    and (public.branch_ok(p.branch_id) or exists (select 1 from member_branches m where m.profile_id = p.id and public.branch_ok(m.branch_id)))
  order by p.role, p.full_name;
end $$;

-- ═════════ 8 · Hak eksekusi ═════════
do $$
declare f text;
begin
  foreach f in array array[
    'my_access_state()', 'touch_presence(boolean)', 'create_invite(text,text,app_role,uuid[],text,uuid)', 'prepare_invite_send(uuid)',
    'resend_invite(uuid)', 'revoke_invite(uuid)', 'set_member_active(uuid,boolean,text)', 'reset_member_pin(uuid,text)',
    'create_tenant_with_owner(text,text,pillar,uuid,text,text,text,int,text[])', 'set_tenant_suspended(uuid,boolean,text)',
    'extend_trial(uuid,int)', 'add_tenant_note(uuid,text)', 'open_ticket(text,text,text)', 'reply_ticket(uuid,text,boolean)',
    'set_ticket_status(uuid,text)', 'rate_ticket(uuid,int,text)', 'tenant_health()', 'on_duty(uuid)', 'staff_scorecard(date,date)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke execute on function public._can_manage(public.app_role, uuid[]) from public, anon;
grant execute on function public._can_manage(public.app_role, uuid[]) to authenticated;
