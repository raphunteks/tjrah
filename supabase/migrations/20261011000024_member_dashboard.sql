-- Dashboard Member v1: merek Tenant, Kartu Member (QR berumur pendek), profil, ekspor dan penghapusan data.
-- Member tidak membaca tabel kecuali "milik sendiri" (migrasi 22); semua yang lain lewat fungsi di bawah.

-- ───────── Merek per Tenant ─────────
create table if not exists public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 60),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text check (logo_url is null or logo_url ~ '^https://[^\s]{4,250}$'),
  welcome_text text check (welcome_text is null or length(welcome_text) <= 160),
  updated_at timestamptz not null default now()
);
alter table public.tenant_branding enable row level security;
create policy branding_read on public.tenant_branding for select using (public.tenant_ok(tenant_id));
create policy branding_write on public.tenant_branding for all
  using (public.tenant_ok(tenant_id) and public.current_app_role() in ('owner', 'superadmin'))
  with check (public.tenant_ok(tenant_id) and public.current_app_role() in ('owner', 'superadmin'));

-- Catatan milik Member (alergi, preferensi) terpisah dari catatan internal staf (customers.note).
alter table public.customers add column if not exists member_note text check (member_note is null or length(member_note) <= 300);

-- ───────── Kunci kartu (tidak pernah keluar dari database) ─────────
create table if not exists public.member_card_keys (id int primary key default 1 check (id = 1), secret text not null);
insert into public.member_card_keys (id, secret) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;
alter table public.member_card_keys enable row level security;   -- tanpa kebijakan

select public.member_lockdown();

-- ───────── Pembantu ─────────
create or replace function public._member_ctx() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid() and role = 'member' and coalesce(is_active, true);
  if not found then raise exception 'Akses ditolak: khusus Member'; end if;
  if not has_flag(p.tenant_id, 'member_dashboard') then raise exception 'Dashboard Member belum diaktifkan untuk Tenant ini'; end if;
  return p;
end $$;

-- ───────── Merek dan beranda ─────────
create or replace function public.member_brand() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx(); t tenants; b tenant_branding;
begin
  select * into t from tenants where id = p.tenant_id;
  select * into b from tenant_branding where tenant_id = p.tenant_id;
  return jsonb_build_object('tenant_name', t.name, 'slug', t.slug, 'pillar', t.pillar,
    'display_name', coalesce(b.display_name, t.name), 'accent_color', b.accent_color, 'logo_url', b.logo_url,
    'welcome_text', b.welcome_text);
end $$;

create or replace function public.member_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx(); c customers; promos_json jsonb; last_o jsonb;
begin
  select * into c from customers where id = p.customer_id;
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'kind', kind, 'value', value, 'min_spend', min_spend, 'ends_at', ends_at) order by ends_at nulls last), '[]'::jsonb)
    into promos_json from promos
   where tenant_id = p.tenant_id and active and starts_at <= now() and (ends_at is null or ends_at > now()) and (usage_limit is null or used_count < usage_limit);
  select jsonb_build_object('code', code, 'total', total, 'paid_at', paid_at) into last_o
    from orders where customer_id = c.id and status = 'paid' order by paid_at desc limit 1;
  return jsonb_build_object('name', coalesce(c.name, p.full_name), 'phone', c.phone, 'points', c.points, 'visits', c.visits,
    'total_spent', c.total_spent, 'last_visit_at', c.last_visit_at, 'member_note', c.member_note, 'promos', promos_json, 'last_order', last_o,
    'marketing', coalesce((select granted from member_consents where profile_id = p.id and kind = 'marketing_whatsapp' order by recorded_at desc limit 1), false));
end $$;

-- ───────── Profil ─────────
create or replace function public.member_update_profile(p_name text, p_note text, p_marketing boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); cur boolean;
begin
  if p_name is not null and length(btrim(p_name)) not between 1 and 80 then raise exception 'Nama 1–80 karakter'; end if;
  if p_note is not null and length(p_note) > 300 then raise exception 'Catatan maksimal 300 karakter'; end if;
  perform set_config('harumin.rpc', 'on', true);
  update customers set name = coalesce(nullif(btrim(p_name), ''), name), member_note = p_note where id = p.customer_id;
  update profiles set full_name = coalesce(nullif(btrim(p_name), ''), full_name) where id = p.id;
  select granted into cur from member_consents where profile_id = p.id and kind = 'marketing_whatsapp' order by recorded_at desc limit 1;
  if p_marketing is not null and p_marketing is distinct from coalesce(cur, false) then
    insert into member_consents (tenant_id, profile_id, customer_id, kind, granted, policy_version, source, recorded_at)
    values (p.tenant_id, p.id, p.customer_id, 'marketing_whatsapp', p_marketing, '2026-10', 'profil', clock_timestamp());
  end if;
  return public.member_home();
end $$;

-- ───────── Kartu Member: token berumur 90 detik, ditandatangani di database ─────────
create or replace function public.member_card_token() returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare p profiles := public._member_ctx(); exp bigint := floor(extract(epoch from now()))::bigint + 90; body text; sec text;
begin
  select secret into sec from member_card_keys where id = 1;
  body := 'HIN1.' || p.customer_id::text || '.' || exp::text;
  return body || '.' || encode(extensions.hmac(body, sec, 'sha256'), 'hex');
end $$;

-- Staf memindai kartu → Pelanggan. Hanya peran yang boleh membaca CRM (fitur 15); Member ditolak oleh _need().
create or replace function public.resolve_member_card(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare parts text[] := string_to_array(coalesce(p_token, ''), '.'); sec text; body text; c customers;
begin
  perform _need(15, 'r');
  if array_length(parts, 1) <> 4 or parts[1] <> 'HIN1' then raise exception 'Kartu tidak dikenali'; end if;
  select secret into sec from member_card_keys where id = 1;
  body := parts[1] || '.' || parts[2] || '.' || parts[3];
  if encode(extensions.hmac(body, sec, 'sha256'), 'hex') <> parts[4] then raise exception 'Kartu tidak sah'; end if;
  if parts[3]::bigint < floor(extract(epoch from now()))::bigint then raise exception 'Kartu kedaluwarsa. Minta Member memuat ulang kartunya.'; end if;
  select * into c from customers where id = parts[2]::uuid and tenant_ok(tenant_id);
  if not found then raise exception 'Pelanggan tidak ditemukan'; end if;
  return jsonb_build_object('customer_id', c.id, 'name', c.name, 'phone', c.phone, 'points', c.points);
end $$;

-- ───────── Privasi: unduh dan hapus ─────────
create or replace function public.member_export() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx(); c customers;
begin
  select * into c from customers where id = p.customer_id;
  return jsonb_build_object(
    'diekspor_pada', now(),
    'profil', jsonb_build_object('id', p.id, 'nama', p.full_name, 'dibuat', p.created_at),
    'pelanggan', jsonb_build_object('telepon', c.phone, 'nama', c.name, 'poin', c.points, 'total_belanja', c.total_spent, 'kunjungan', c.visits, 'terakhir_berkunjung', c.last_visit_at, 'catatan_saya', c.member_note),
    'pesanan', coalesce((select jsonb_agg(jsonb_build_object('kode', o.code, 'status', o.status, 'subtotal', o.subtotal, 'diskon', o.discount, 'pajak', o.tax, 'total', o.total, 'dibayar', o.paid_at,
        'item', coalesce((select jsonb_agg(jsonb_build_object('nama', i.name, 'jumlah', i.qty, 'harga', i.price)) from order_items i where i.order_id = o.id), '[]'::jsonb),
        'pembayaran', coalesce((select jsonb_agg(jsonb_build_object('metode', y.method, 'jumlah', y.amount)) from payments y where y.order_id = o.id), '[]'::jsonb)) order by o.created_at desc)
      from orders o where o.customer_id = c.id), '[]'::jsonb),
    'persetujuan', coalesce((select jsonb_agg(jsonb_build_object('jenis', k.kind, 'diberikan', k.granted, 'versi_kebijakan', k.policy_version, 'waktu', k.recorded_at) order by k.recorded_at) from member_consents k where k.profile_id = p.id), '[]'::jsonb),
    'catatan', 'Rekam medis (bila ada) dikelola klinik dan tidak termasuk dalam berkas ini.');
end $$;

create or replace function public.member_delete_account(p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); n_orders int;
begin
  if p_confirm is distinct from 'HAPUS' then raise exception 'Ketik HAPUS untuk mengonfirmasi'; end if;
  perform set_config('harumin.rpc', 'on', true);
  perform set_config('harumin.sys', '1', true);
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (p.tenant_id, p.id, 'member', 'delete_account', 'profiles', p.id::text, jsonb_build_object('customer_id', p.customer_id));
  -- Pesanan tetap ada untuk pembukuan, tetapi tidak lagi menunjuk orang ini.
  update orders set customer_id = null, customer_phone = null where customer_id = p.customer_id;
  get diagnostics n_orders = row_count;
  update queue_entries set phone = null, name = 'Dihapus' where tenant_id = p.tenant_id and public.norm_phone(phone) = public.norm_phone((select phone from customers where id = p.customer_id));
  delete from member_consents where profile_id = p.id;
  delete from profiles where id = p.id;
  delete from customers where id = p.customer_id;
  delete from auth.users where id = p.id;
  return jsonb_build_object('dihapus', true, 'pesanan_dianonimkan', n_orders,
    'catatan', 'Pesanan dipertahankan tanpa identitas untuk pembukuan. Rekam medis (bila ada) dikelola klinik sesuai kewajiban penyimpanan.');
end $$;

revoke all on function public._member_ctx() from public, anon, authenticated;
revoke all on function public.member_brand(), public.member_home(), public.member_update_profile(text, text, boolean),
  public.member_card_token(), public.resolve_member_card(text), public.member_export(), public.member_delete_account(text) from public, anon;
grant execute on function public.member_brand(), public.member_home(), public.member_update_profile(text, text, boolean),
  public.member_card_token(), public.resolve_member_card(text), public.member_export(), public.member_delete_account(text) to authenticated;
