-- Tiket 07 · Member memesan sendiri, melacak status, dan reservasi. Bayar tetap di kasir.
-- Semua tulis lewat RPC security-definer yang memanggil _member_ctx() (Member aktif + Saklar Fitur member_dashboard).
-- Pelanggan tanpa akun tidak punya jalur masuk: fungsi-fungsi ini menolak siapa pun selain profil ber-role member.

alter table public.queue_entries add column if not exists customer_id uuid references public.customers(id) on delete set null;
create index if not exists queue_entries_customer_idx on public.queue_entries (customer_id) where customer_id is not null;

-- Batas laju (hitung dari tabel, tanpa tabel baru). Angka sengaja di satu tempat.
create or replace function public._member_limit(p_what text) returns int language sql immutable as $$
  select case p_what
    when 'open_orders'      then 3     -- Pesanan terbuka bersamaan per Member
    when 'orders_per_hour'  then 8     -- Pesanan baru per Member per jam
    when 'orders_branch_hr' then 60    -- Pesanan Member per Cabang per jam
    when 'order_lines'      then 20    -- baris per Pesanan
    when 'line_qty'         then 20    -- jumlah per baris
    when 'active_bookings'  then 3     -- reservasi aktif per Member
    when 'bookings_per_hour' then 5    -- reservasi baru per Member per jam
  end
$$;

create or replace function public._member_branch(p_branch uuid, p_tenant uuid) returns branches
language plpgsql stable security definer set search_path = public as $$
declare b branches;
begin
  select * into b from branches where id = p_branch and tenant_id = p_tenant;
  if not found then raise exception 'Cabang tidak ditemukan'; end if;
  return b;
end $$;

-- ───────── Menu ─────────
create or replace function public.member_menu(p_branch uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx(); pil text;
begin
  select pillar::text into pil from tenants where id = p.tenant_id;
  return jsonb_build_object(
    'pillar', pil,
    'can_order', pil <> 'health',
    'can_book_table', pil in ('fnb', 'omni'),
    'can_book_clinic', pil in ('health', 'omni'),
    'branches', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from branches where tenant_id = p.tenant_id), '[]'::jsonb),
    'products', case when pil = 'health' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category, 'price', price, 'is_available', is_available) order by category, name)
                  from products where tenant_id = p.tenant_id), '[]'::jsonb) end);
end $$;

-- ───────── Status terhitung dari item dapur ─────────
create or replace function public._member_track(p_order uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when o.status = 'void' then 'dibatalkan'
    when o.status = 'refunded' then 'dikembalikan'
    when o.status = 'paid' then 'selesai'
    when n = 0 then 'diterima'
    when served = n then 'diantar'
    when ready + served = n then 'siap'
    when cooking + ready + served > 0 then 'dimasak'
    else 'diterima' end
  from orders o,
   lateral (select count(*)::int n,
                   count(*) filter (where kitchen_status = 'cooking')::int cooking,
                   count(*) filter (where kitchen_status = 'ready')::int ready,
                   count(*) filter (where kitchen_status = 'served')::int served
            from order_items where order_id = o.id) c
  where o.id = p_order
$$;

create or replace function public._member_order_json(o orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'track', public._member_track(o.id), 'channel', o.channel,
    'table_label', o.table_label, 'subtotal', o.subtotal, 'total', o.total, 'created_at', o.created_at, 'paid_at', o.paid_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price, 'note', i.note, 'kitchen_status', i.kitchen_status) order by i.created_at) from order_items i where i.order_id = o.id), '[]'::jsonb))
$$;

-- ───────── Memesan ─────────
-- p_items: [{"product_id": "...", "qty": 2, "note": "kurang manis"}]. Harga dan ketersediaan dari server.
create or replace function public.member_place_order(p_branch uuid, p_items jsonb, p_table_label text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); c customers; b branches; o orders; it jsonb; pr products; v_qty int; n int;
        lbl text := nullif(btrim(coalesce(p_table_label, '')), ''); pil text; tries int := 0;
begin
  select pillar::text into pil from tenants where id = p.tenant_id;
  if pil = 'health' then raise exception 'Tenant ini tidak menerima pesanan menu'; end if;
  b := public._member_branch(p_branch, p.tenant_id);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Keranjang kosong'; end if;
  if jsonb_array_length(p_items) > public._member_limit('order_lines') then raise exception 'Maksimal % baris per pesanan', public._member_limit('order_lines'); end if;
  if lbl is not null and (length(lbl) > 20 or lbl ~ '[<>]') then raise exception 'Nomor meja tidak valid'; end if;

  -- Serialisasi per Member agar batas laju tidak bisa dilewati dengan permintaan paralel.
  perform pg_advisory_xact_lock(hashtextextended('member_order:' || p.id::text, 0));
  select count(*) into n from orders where customer_id = p.customer_id and channel = 'member' and status = 'open';
  if n >= public._member_limit('open_orders') then raise exception 'Masih ada % pesanan yang belum dibayar. Selesaikan dulu di kasir.', n; end if;
  select count(*) into n from orders where customer_id = p.customer_id and channel = 'member' and created_at > now() - interval '1 hour';
  if n >= public._member_limit('orders_per_hour') then raise exception 'Terlalu banyak pesanan dalam satu jam. Coba lagi nanti.'; end if;
  select count(*) into n from orders where branch_id = b.id and channel = 'member' and created_at > now() - interval '1 hour';
  if n >= public._member_limit('orders_branch_hr') then raise exception 'Cabang sedang menerima banyak pesanan. Pesan langsung ke kasir.'; end if;

  select * into c from customers where id = p.customer_id;
  loop
    begin
      insert into orders (tenant_id, branch_id, code, status, channel, table_label, customer_id, customer_phone, customer_name)
      values (p.tenant_id, b.id, 'ORD-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 4), 'open', 'member',
              coalesce(lbl, 'Ambil sendiri'), c.id, c.phone, coalesce(c.name, p.full_name))
      returning * into o;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (it->>'qty')::int;
      select * into pr from products where id = (it->>'product_id')::uuid and tenant_id = p.tenant_id;
    exception when others then raise exception 'Item pesanan tidak valid';
    end;
    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if v_qty is null or v_qty < 1 or v_qty > public._member_limit('line_qty') then raise exception 'Jumlah per item 1–%', public._member_limit('line_qty'); end if;
    if not pr.is_available then raise exception '% sedang habis', pr.name; end if;
    if length(coalesce(it->>'note', '')) > 100 then raise exception 'Catatan item maksimal 100 karakter'; end if;
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, note)
    values (p.tenant_id, b.id, o.id, pr.id, pr.name, v_qty, pr.price, pr.station, nullif(btrim(coalesce(it->>'note', '')), ''));
  end loop;
  update orders set subtotal = (select sum(i.qty * i.price) from order_items i where i.order_id = o.id), total = (select sum(i.qty * i.price) from order_items i where i.order_id = o.id)
   where id = o.id returning * into o;
  return public._member_order_json(o);
end $$;

create or replace function public.member_orders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx();
begin
  return coalesce((select jsonb_agg(public._member_order_json(o) order by o.created_at desc)
    from (select * from orders where customer_id = p.customer_id order by created_at desc limit 30) o), '[]'::jsonb);
end $$;

-- Batal hanya selama belum disentuh dapur. Setelahnya harus lewat kasir (kebijakan void yang berlaku).
create or replace function public.member_cancel_order(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); o orders;
begin
  select * into o from orders where id = p_order and customer_id = p.customer_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.channel <> 'member' then raise exception 'Hanya pesanan yang dibuat lewat aplikasi yang bisa dibatalkan di sini'; end if;
  if o.status <> 'open' then raise exception 'Pesanan sudah dibayar atau dibatalkan'; end if;
  if exists (select 1 from order_items where order_id = o.id and kitchen_status <> 'new') then
    raise exception 'Pesanan sudah diproses dapur. Hubungi kasir untuk membatalkan.';
  end if;
  update orders set status = 'void' where id = o.id returning * into o;
  insert into audit_logs (tenant_id, actor_id, actor_role, action, entity, entity_id, detail)
  values (o.tenant_id, p.id, 'member', 'member_cancel_order', 'orders', o.id::text, jsonb_build_object('code', o.code));
  return public._member_order_json(o);
end $$;

-- ───────── Reservasi ─────────
create or replace function public._member_booking_json(q queue_entries) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', q.id, 'kind', q.kind, 'status', q.status, 'branch', (select name from branches where id = q.branch_id), 'branch_id', q.branch_id,
    'scheduled_at', q.scheduled_at, 'party_size', q.party_size, 'note', q.complaint, 'queue_no', q.queue_no)
$$;

create or replace function public._member_booking_check(p_at timestamptz, p_party int, p_kind text) returns void
language plpgsql stable as $$
begin
  if p_at is null or p_at < now() + interval '30 minutes' then raise exception 'Reservasi minimal 30 menit dari sekarang'; end if;
  if p_at > now() + interval '60 days' then raise exception 'Reservasi maksimal 60 hari ke depan'; end if;
  if p_kind = 'table' and (p_party is null or p_party not between 1 and 20) then raise exception 'Jumlah tamu 1–20'; end if;
end $$;

create or replace function public.member_reservation_create(p_branch uuid, p_kind text, p_at timestamptz, p_party int default null,
                                                           p_note text default null, p_nik text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); c customers; b branches; pil text; q queue_entries; n int; nm text;
begin
  select pillar::text into pil from tenants where id = p.tenant_id;
  if p_kind not in ('table', 'clinic') then raise exception 'Jenis reservasi tidak dikenal'; end if;
  if p_kind = 'table' and pil not in ('fnb', 'omni') then raise exception 'Tenant ini tidak menerima reservasi meja'; end if;
  if p_kind = 'clinic' and pil not in ('health', 'omni') then raise exception 'Tenant ini tidak menerima janji klinik'; end if;
  b := public._member_branch(p_branch, p.tenant_id);
  perform public._member_booking_check(p_at, p_party, p_kind);
  if length(coalesce(p_note, '')) > 200 then raise exception 'Catatan maksimal 200 karakter'; end if;
  if p_kind = 'clinic' and not coalesce(public.valid_nik(p_nik), false) then raise exception 'NIK tidak valid: harus 16 digit'; end if;

  perform pg_advisory_xact_lock(hashtextextended('member_book:' || p.id::text, 0));
  select count(*) into n from queue_entries where customer_id = p.customer_id and status = 'booked' and scheduled_at > now();
  if n >= public._member_limit('active_bookings') then raise exception 'Maksimal % reservasi aktif. Batalkan salah satu dulu.', n; end if;
  select count(*) into n from queue_entries where customer_id = p.customer_id and created_at > now() - interval '1 hour';
  if n >= public._member_limit('bookings_per_hour') then raise exception 'Terlalu banyak reservasi dalam satu jam. Coba lagi nanti.'; end if;

  select * into c from customers where id = p.customer_id;
  nm := coalesce(nullif(btrim(c.name), ''), nullif(btrim(p.full_name), ''), 'Member');
  if length(nm) < 2 then nm := nm || ' '; nm := 'Member ' || btrim(nm); end if;
  insert into queue_entries (tenant_id, branch_id, kind, name, phone, nik, complaint, party_size, scheduled_at, status, customer_id, created_by)
  values (p.tenant_id, b.id, p_kind, nm, c.phone, case when p_kind = 'clinic' then p_nik end, nullif(btrim(coalesce(p_note, '')), ''),
          case when p_kind = 'table' then p_party end, p_at, 'booked', c.id, p.id)
  returning * into q;
  return public._member_booking_json(q);
end $$;

create or replace function public.member_reservations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p profiles := public._member_ctx();
begin
  return coalesce((select jsonb_agg(public._member_booking_json(q) order by q.scheduled_at desc)
    from (select * from queue_entries where customer_id = p.customer_id and scheduled_at > now() - interval '60 days' order by scheduled_at desc limit 30) q), '[]'::jsonb);
end $$;

create or replace function public.member_reservation_update(p_id uuid, p_at timestamptz, p_party int default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); q queue_entries;
begin
  select * into q from queue_entries where id = p_id and customer_id = p.customer_id for update;
  if not found then raise exception 'Reservasi tidak ditemukan'; end if;
  if q.status <> 'booked' then raise exception 'Reservasi ini sudah tidak bisa diubah'; end if;
  perform public._member_booking_check(p_at, coalesce(p_party, q.party_size), q.kind);
  if length(coalesce(p_note, '')) > 200 then raise exception 'Catatan maksimal 200 karakter'; end if;
  update queue_entries set scheduled_at = p_at, party_size = case when kind = 'table' then coalesce(p_party, party_size) end,
         complaint = case when p_note is null then complaint else nullif(btrim(p_note), '') end
   where id = q.id returning * into q;
  return public._member_booking_json(q);
end $$;

create or replace function public.member_reservation_cancel(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public._member_ctx(); q queue_entries;
begin
  select * into q from queue_entries where id = p_id and customer_id = p.customer_id for update;
  if not found then raise exception 'Reservasi tidak ditemukan'; end if;
  if q.status <> 'booked' then raise exception 'Reservasi ini sudah tidak bisa dibatalkan di sini'; end if;
  update queue_entries set status = 'cancelled' where id = q.id returning * into q;
  return public._member_booking_json(q);
end $$;

-- Unduhan data kini memuat reservasi (tanpa NIK).
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
    'reservasi', coalesce((select jsonb_agg(jsonb_build_object('jenis', q.kind, 'status', q.status, 'jadwal', q.scheduled_at, 'tamu', q.party_size, 'catatan', q.complaint) order by q.scheduled_at desc)
      from queue_entries q where q.customer_id = c.id), '[]'::jsonb),
    'persetujuan', coalesce((select jsonb_agg(jsonb_build_object('jenis', k.kind, 'diberikan', k.granted, 'versi_kebijakan', k.policy_version, 'waktu', k.recorded_at) order by k.recorded_at) from member_consents k where k.profile_id = p.id), '[]'::jsonb),
    'catatan', 'Rekam medis (bila ada) dikelola klinik dan tidak termasuk dalam berkas ini.');
end $$;

revoke all on function public._member_limit(text), public._member_branch(uuid, uuid), public._member_track(uuid), public._member_order_json(orders),
  public._member_booking_json(queue_entries), public._member_booking_check(timestamptz, int, text) from public, anon, authenticated;
revoke all on function public.member_menu(uuid), public.member_place_order(uuid, jsonb, text), public.member_orders(), public.member_cancel_order(uuid),
  public.member_reservation_create(uuid, text, timestamptz, int, text, text), public.member_reservations(),
  public.member_reservation_update(uuid, timestamptz, int, text), public.member_reservation_cancel(uuid), public.member_export() from public, anon;
grant execute on function public.member_menu(uuid), public.member_place_order(uuid, jsonb, text), public.member_orders(), public.member_cancel_order(uuid),
  public.member_reservation_create(uuid, text, timestamptz, int, text, text), public.member_reservations(),
  public.member_reservation_update(uuid, timestamptz, int, text), public.member_reservation_cancel(uuid), public.member_export() to authenticated;
