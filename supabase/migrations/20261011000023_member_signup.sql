-- Masuk Member dengan Kode Masuk (OTP) lewat WhatsApp + Persetujuan Data.
-- Aturan (kedaluwarsa, batas percobaan, batas laju, penautan Pelanggan, persetujuan) ada di SQL agar bisa diuji;
-- Edge Function member-auth hanya mengirim pesan WhatsApp dan membuat sesi. Semua fungsi di bawah KHUSUS service_role.

-- Saklar Fitur Paket: dashboard Member tersedia di Growth dan Enterprise.
insert into public.feature_flags (key, description, default_enabled, plans)
values ('member_dashboard', 'Dashboard Member (pelanggan)', false, '{growth,enterprise}')
on conflict (key) do nothing;

create table if not exists public.member_otps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,               -- bentuk lokal 08…
  code_hash text not null,           -- bcrypt; kode asli tidak pernah disimpan
  device_id text not null,
  consent_data boolean not null,
  consent_marketing boolean not null default false,
  policy_version text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz
);
create index if not exists member_otps_phone_idx on public.member_otps (tenant_id, phone, created_at desc);
create index if not exists member_otps_device_idx on public.member_otps (device_id, created_at desc);
alter table public.member_otps enable row level security;   -- tanpa kebijakan: hanya service_role

-- Riwayat persetujuan (hanya tambah). Status terkini = baris terbaru per (profile, kind).
create table if not exists public.member_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null check (kind in ('data_processing', 'marketing_whatsapp')),
  granted boolean not null,
  policy_version text not null,
  source text not null default 'signup',
  recorded_at timestamptz not null default now()
);
create index if not exists member_consents_profile_idx on public.member_consents (profile_id, kind, recorded_at desc);
alter table public.member_consents enable row level security;
create policy mconsent_own_read on public.member_consents for select using (profile_id = auth.uid());
create policy mconsent_staff_read on public.member_consents for select using (not public.is_member() and public.feat_ok(tenant_id, null, 15, 'r'));

select public.member_lockdown();

-- ───────── Nomor telepon ─────────
-- Terima 08…, 628…, +628…, 8…; kembalikan bentuk lokal 08… atau error. Pelanggan lama yang disimpan staf dalam bentuk
-- apa pun (08…, +62…, 62…) tetap ditemukan lewat phone_variants().
create or replace function public.phone_local(p text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d like '62%' then d := '0' || substr(d, 3);
  elsif d like '8%' then d := '0' || d; end if;
  if d !~ '^08[0-9]{8,12}$' then raise exception 'Nomor WhatsApp tidak valid'; end if;
  return d;
end $$;

create or replace function public.phone_variants(p text) returns text[]
language sql immutable as $$
  select array[public.phone_local(p), '+62' || substr(public.phone_local(p), 2), '62' || substr(public.phone_local(p), 2)]
$$;

-- ───────── 1 · Minta kode ─────────
create or replace function public.member_otp_issue(p_tenant uuid, p_phone text, p_device text, p_consent_data boolean, p_consent_marketing boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ph text := public.phone_local(p_phone); code text; oid uuid; exp timestamptz := now() + interval '5 minutes';
begin
  if coalesce(p_consent_data, false) is not true then raise exception 'Persetujuan pengolahan data wajib diberikan'; end if;
  if coalesce(length(btrim(p_device)), 0) < 8 then raise exception 'Perangkat tidak dikenali'; end if;
  if not exists (select 1 from tenants where id = p_tenant and status <> 'suspended') then raise exception 'Tenant tidak ditemukan'; end if;
  if not has_flag(p_tenant, 'member_dashboard') then raise exception 'Dashboard Member belum diaktifkan untuk Tenant ini'; end if;
  if (select count(*) from member_otps where tenant_id = p_tenant and phone = ph and created_at > now() - interval '15 minutes') >= 3
    then raise exception 'Terlalu banyak permintaan kode untuk nomor ini. Coba lagi beberapa menit lagi.'; end if;
  if (select count(*) from member_otps where device_id = p_device and created_at > now() - interval '1 hour') >= 10
    then raise exception 'Terlalu banyak permintaan kode dari perangkat ini. Coba lagi nanti.'; end if;
  if (select count(*) from member_otps where tenant_id = p_tenant and created_at > now() - interval '1 hour') >= 300
    then raise exception 'Terlalu banyak permintaan kode. Coba lagi nanti.'; end if;
  code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into member_otps (tenant_id, phone, code_hash, device_id, consent_data, consent_marketing, policy_version, expires_at, created_at)
  values (p_tenant, ph, extensions.crypt(code, extensions.gen_salt('bf', 6)), p_device, true, coalesce(p_consent_marketing, false), '2026-10', exp, clock_timestamp())
  returning id into oid;
  return jsonb_build_object('otp_id', oid, 'code', code, 'phone', ph, 'expires_at', exp);
end $$;

-- ───────── 2 · Periksa kode ─────────
-- Kegagalan DIKEMBALIKAN (bukan exception) agar hitungan percobaan tetap tersimpan.
create or replace function public.member_otp_verify(p_tenant uuid, p_phone text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare ph text := public.phone_local(p_phone); o member_otps; c customers; pr profiles;
begin
  select * into o from member_otps
   where tenant_id = p_tenant and phone = ph and consumed_at is null and verified_at is null
   order by created_at desc limit 1 for update;
  if not found or o.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'kedaluwarsa'); end if;
  if o.attempts >= 5 then return jsonb_build_object('ok', false, 'reason', 'terkunci'); end if;
  update member_otps set attempts = attempts + 1 where id = o.id;
  if o.device_id <> p_device or o.code_hash <> extensions.crypt(coalesce(p_code, ''), o.code_hash) then
    return jsonb_build_object('ok', false, 'reason', 'salah', 'attempts_left', 5 - (o.attempts + 1));
  end if;
  update member_otps set verified_at = now() where id = o.id;
  select * into c from customers where tenant_id = p_tenant and public.norm_phone(phone) = any (public.phone_variants(ph)) order by created_at limit 1;
  if found then select * into pr from profiles where customer_id = c.id and role = 'member'; end if;
  return jsonb_build_object('ok', true, 'otp_id', o.id, 'customer_id', c.id, 'profile_id', pr.id, 'email', pr.email,
                            'is_new', pr.id is null, 'name', c.name);
end $$;

-- ───────── 3 · Selesaikan: tautkan Pelanggan, buat profil Member, catat Persetujuan Data ─────────
create or replace function public.member_complete(p_otp uuid, p_user uuid, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare o member_otps; c customers; pr profiles; made boolean := false; em text;
begin
  select * into o from member_otps where id = p_otp and verified_at is not null and consumed_at is null
     and verified_at > now() - interval '10 minutes' for update;
  if not found then raise exception 'Verifikasi kedaluwarsa. Minta kode baru.'; end if;
  perform set_config('harumin.rpc', 'on', true);

  select * into c from customers where tenant_id = o.tenant_id and public.norm_phone(phone) = any (public.phone_variants(o.phone)) order by created_at limit 1;
  if not found then
    insert into customers (tenant_id, phone, name) values (o.tenant_id, o.phone, nullif(btrim(coalesce(p_name, '')), '')) returning * into c;
  end if;
  select * into pr from profiles where customer_id = c.id and role = 'member';
  if not found then
    if p_user is null then raise exception 'Akun belum dibuat'; end if;
    select email into em from auth.users where id = p_user;
    insert into profiles (id, tenant_id, branch_id, role, full_name, email, customer_id)
    values (p_user, o.tenant_id, null, 'member', coalesce(nullif(btrim(coalesce(p_name, '')), ''), c.name, 'Member'), em, c.id)
    returning * into pr;
    made := true;
    insert into member_consents (tenant_id, profile_id, customer_id, kind, granted, policy_version) values
      (o.tenant_id, pr.id, c.id, 'data_processing', true, o.policy_version),
      (o.tenant_id, pr.id, c.id, 'marketing_whatsapp', o.consent_marketing, o.policy_version);
    insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
    values (o.tenant_id, pr.id, 'member', 'signup', 'profiles', pr.id::text, jsonb_build_object('customer_id', c.id, 'marketing', o.consent_marketing));
  end if;
  update member_otps set consumed_at = now() where id = o.id;
  return jsonb_build_object('profile_id', pr.id, 'customer_id', c.id, 'points', c.points, 'is_new', made, 'email', pr.email);
end $$;

create or replace function public.member_otp_purge() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from member_otps where created_at < now() - interval '1 day' returning 1) select count(*)::int from d
$$;

revoke all on function public.phone_local(text), public.phone_variants(text),
  public.member_otp_issue(uuid, text, text, boolean, boolean), public.member_otp_verify(uuid, text, text, text),
  public.member_complete(uuid, uuid, text), public.member_otp_purge() from public, anon, authenticated;
grant execute on function public.member_otp_issue(uuid, text, text, boolean, boolean), public.member_otp_verify(uuid, text, text, text),
  public.member_complete(uuid, uuid, text), public.member_otp_purge(), public.phone_local(text), public.phone_variants(text) to service_role;
