-- Tiket 11 · Pesanan online masuk ke Layar Dapur lewat Fitur 16 (Integrasi Omnichannel & Marketplace).
-- Seam kanal: `_online_ingest` adalah satu-satunya pintu masuk Pesanan online. Adapter simulasi memanggilnya lewat RPC (online_sim_order);
-- adapter nyata (GoFood, nanti) akan memanggil `online_ingest` dari Edge Function dengan service_role. GrabFood dan ShopeeFood belum dibangun.
-- Harga dan ketersediaan SELALU dari tabel products Tenant (satu harga, satu stok); platform tidak menentukan harga.

insert into public.feature_flags (key, description, default_enabled, plans)
values ('online_orders', 'Pesanan online (omnichannel)', false, '{growth,enterprise}')
on conflict (key) do nothing;

create table if not exists public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  channel text not null check (channel in ('sim', 'gofood')),
  label text not null check (length(btrim(label)) between 2 and 60),
  status text not null default 'awaiting_access' check (status in ('active', 'awaiting_access', 'paused')),
  settings jsonb not null default '{}',          -- ID toko dsb. JANGAN simpan kunci/rahasia di sini (Vault)
  last_sync_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (branch_id, channel)
);
create table if not exists public.channel_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 100),
  order_id uuid references public.orders(id) on delete set null,
  status text not null check (status in ('received', 'rejected')),
  error text,
  customer_name text,
  received_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
create table if not exists public.channel_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  kind text not null default 'availability' check (kind in ('availability')),
  product_id uuid references public.products(id) on delete cascade,
  available boolean not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists channel_outbox_pending_idx on public.channel_outbox (connection_id) where status = 'pending';

alter table public.channel_connections enable row level security;
alter table public.channel_orders enable row level security;
alter table public.channel_outbox enable row level security;
revoke all on public.channel_connections, public.channel_orders, public.channel_outbox from anon;
drop policy if exists cc_read on public.channel_connections;
create policy cc_read on public.channel_connections for select using (public.feat_ok(tenant_id, branch_id, 16, 'r'));
drop policy if exists co_read on public.channel_orders;
create policy co_read on public.channel_orders for select using (
  exists (select 1 from public.channel_connections c where c.id = connection_id and public.feat_ok(c.tenant_id, c.branch_id, 16, 'r')));
drop policy if exists cx_read on public.channel_outbox;
create policy cx_read on public.channel_outbox for select using (
  exists (select 1 from public.channel_connections c where c.id = connection_id and public.feat_ok(c.tenant_id, c.branch_id, 16, 'r')));
-- Tanpa kebijakan tulis: semua perubahan lewat fungsi.

-- Owner/GM/Superadmin mengatur koneksi. Kanal sim langsung aktif; kanal nyata tanpa adapter dibuat 'awaiting_access'.
create or replace function public.online_connection_save(p_branch uuid, p_channel text, p_label text, p_settings jsonb default '{}') returns channel_connections
language plpgsql security definer set search_path = public as $$
declare t uuid := _branch_guard(p_branch); c channel_connections;
begin
  perform _need(16, 'c');
  if not has_flag(t, 'online_orders') then raise exception 'Pesanan online belum aktif untuk Paket ini'; end if;
  if p_channel not in ('sim', 'gofood') then raise exception 'Kanal % belum didukung', p_channel; end if;
  if jsonb_typeof(coalesce(p_settings, '{}')) <> 'object' then raise exception 'Pengaturan harus berupa objek'; end if;
  if p_settings::text ~* '(secret|token|password|api[_-]?key|server[_-]?key)' then raise exception 'Jangan simpan rahasia di pengaturan koneksi. Pakai Supabase Vault.'; end if;
  insert into channel_connections (tenant_id, branch_id, channel, label, status, settings)
  values (t, p_branch, p_channel, btrim(p_label), case when p_channel = 'sim' then 'active' else 'awaiting_access' end, coalesce(p_settings, '{}'))
  on conflict (branch_id, channel) do update set label = excluded.label, settings = excluded.settings
  returning * into c;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (t, auth.uid(), current_app_role(), 'online_connection_save', 'channel_connections', c.id::text, jsonb_build_object('channel', c.channel, 'branch', p_branch, 'status', c.status));
  return c;
end $$;

create or replace function public.online_connection_status(p_id uuid, p_status text) returns channel_connections
language plpgsql security definer set search_path = public as $$
declare c channel_connections;
begin
  perform _need(16, 'u');
  if p_status not in ('active', 'paused') then raise exception 'Status tidak valid'; end if;
  select * into c from channel_connections where id = p_id for update;
  if not found or not tenant_ok(c.tenant_id) or not branch_ok(c.branch_id) then raise exception 'Koneksi tidak ditemukan'; end if;
  if c.channel <> 'sim' and p_status = 'active' then raise exception 'Adapter % belum tersedia (menunggu akses sandbox/persyaratan penyedia)', c.channel; end if;
  update channel_connections set status = p_status where id = c.id returning * into c;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (c.tenant_id, auth.uid(), current_app_role(), 'online_connection_status', 'channel_connections', c.id::text, jsonb_build_object('status', p_status));
  return c;
end $$;

create or replace function public._online_channel(p_channel text) returns text language sql immutable as $$
  select case p_channel when 'sim' then 'online_sim' else p_channel end
$$;

-- Pintu tunggal Pesanan online. items: [{"sku": "...", "qty": 2, "note": "..."}].
create or replace function public._online_ingest(p_conn uuid, p_external text, p_customer text, p_items jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c channel_connections; prev channel_orders; o orders; it jsonb; pr products; v_qty int; tries int := 0; msg text;
begin
  select * into c from channel_connections where id = p_conn for update;
  if not found then raise exception 'Koneksi tidak ditemukan'; end if;
  if not has_flag(c.tenant_id, 'online_orders') then raise exception 'Pesanan online belum aktif untuk Paket ini'; end if;
  if c.status <> 'active' then raise exception 'Koneksi % belum aktif (%)', c.label, c.status; end if;
  if length(coalesce(p_external, '')) not between 1 and 100 then raise exception 'ID pesanan eksternal tidak valid'; end if;

  select * into prev from channel_orders where connection_id = c.id and external_id = p_external;
  if found then
    return jsonb_build_object('ok', prev.status = 'received', 'duplicate', true, 'order_id', prev.order_id, 'error', prev.error);
  end if;

  begin
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Item pesanan 1–50 baris'; end if;
    -- Validasi semua baris dulu supaya penolakan tidak meninggalkan Pesanan setengah jadi.
    for it in select * from jsonb_array_elements(p_items) loop
      select * into pr from products where tenant_id = c.tenant_id and sku = btrim(it->>'sku');
      if not found then raise exception 'SKU % tidak dikenal', coalesce(it->>'sku', '?'); end if;
      v_qty := (it->>'qty')::int;
      if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'Jumlah % tidak valid', pr.name; end if;
      if not pr.is_available then raise exception '% sedang habis (86)', pr.name; end if;
    end loop;
    loop
      begin
        insert into orders (tenant_id, branch_id, code, status, channel, customer_name)
        values (c.tenant_id, c.branch_id, 'ONL-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 4), 'open',
                public._online_channel(c.channel), left(nullif(btrim(coalesce(p_customer, '')), ''), 80)) returning * into o;
        exit;
      exception when unique_violation then
        tries := tries + 1; if tries > 5 then raise; end if;
      end;
    end loop;
    for it in select * from jsonb_array_elements(p_items) loop
      select * into pr from products where tenant_id = c.tenant_id and sku = btrim(it->>'sku');
      insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, note)
      values (c.tenant_id, c.branch_id, o.id, pr.id, pr.name, (it->>'qty')::int, pr.price, pr.station,
              nullif(left(btrim(coalesce(it->>'note', coalesce(p_note, '')) ), 100), ''));
    end loop;
    update orders set subtotal = (select sum(i.qty * i.price) from order_items i where i.order_id = o.id),
                      total = (select sum(i.qty * i.price) from order_items i where i.order_id = o.id)
     where id = o.id returning * into o;
  exception when others then
    get stacked diagnostics msg = message_text;
    insert into channel_orders (tenant_id, connection_id, external_id, status, error, customer_name) values (c.tenant_id, c.id, p_external, 'rejected', left(msg, 300), left(p_customer, 80));
    return jsonb_build_object('ok', false, 'rejected', true, 'error', msg);
  end;
  insert into channel_orders (tenant_id, connection_id, external_id, order_id, status, customer_name) values (c.tenant_id, c.id, p_external, o.id, 'received', left(p_customer, 80));
  update channel_connections set last_sync_at = now() where id = c.id;
  return jsonb_build_object('ok', true, 'order_id', o.id, 'code', o.code, 'total', o.total);
end $$;

-- Untuk Edge Function adapter nyata (service_role).
create or replace function public.online_ingest(p_conn uuid, p_external text, p_customer text, p_items jsonb, p_note text default null) returns jsonb
language sql security definer set search_path = public as $$
  select public._online_ingest(p_conn, p_external, p_customer, p_items, p_note)
$$;

-- Adapter simulasi: Owner/GM menguji alur tanpa platform sungguhan.
create or replace function public.online_sim_order(p_conn uuid, p_items jsonb, p_customer text default 'Pelanggan Simulasi') returns jsonb
language plpgsql security definer set search_path = public as $$
declare c channel_connections;
begin
  perform _need(16, 'c');
  select * into c from channel_connections where id = p_conn;
  if not found or not tenant_ok(c.tenant_id) or not branch_ok(c.branch_id) then raise exception 'Koneksi tidak ditemukan'; end if;
  if c.channel <> 'sim' then raise exception 'Hanya koneksi simulasi yang boleh dipakai di sini'; end if;
  return public._online_ingest(c.id, 'SIM-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS') || '-' || substr(md5(random()::text), 1, 4), p_customer, p_items);
end $$;

-- Produk Habis (86) ikut menyinkronkan ketersediaan ke setiap koneksi AKTIF. Simulasi langsung 'sent'; kanal nyata menunggu Edge Function.
create or replace function public._channel_availability_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_available is distinct from old.is_available then
    insert into channel_outbox (tenant_id, connection_id, product_id, available, status, sent_at)
    select new.tenant_id, c.id, new.id, new.is_available, case when c.channel = 'sim' then 'sent' else 'pending' end, case when c.channel = 'sim' then now() end
      from channel_connections c where c.tenant_id = new.tenant_id and c.status = 'active';
  end if;
  return new;
end $$;
drop trigger if exists products_channel_sync on public.products;
create trigger products_channel_sync after update of is_available on public.products for each row execute function public._channel_availability_sync();

create or replace function public.online_outbox_mark(p_id uuid, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  update channel_outbox set status = case when p_ok then 'sent' else 'failed' end, attempts = attempts + 1, sent_at = case when p_ok then now() end where id = p_id and status = 'pending'
$$;

revoke all on function public._online_channel(text), public._online_ingest(uuid, text, text, jsonb, text), public._channel_availability_sync() from public, anon, authenticated;
revoke all on function public.online_connection_save(uuid, text, text, jsonb), public.online_connection_status(uuid, text), public.online_sim_order(uuid, jsonb, text) from public, anon;
grant execute on function public.online_connection_save(uuid, text, text, jsonb), public.online_connection_status(uuid, text), public.online_sim_order(uuid, jsonb, text) to authenticated;
revoke all on function public.online_ingest(uuid, text, text, jsonb, text), public.online_outbox_mark(uuid, boolean) from public, anon, authenticated;
grant execute on function public.online_ingest(uuid, text, text, jsonb, text), public.online_outbox_mark(uuid, boolean) to service_role;

select public.member_lockdown();
