-- Migrasi 20261017000005: Kolom notes & address pada attendance serta validasi jendela jam pulang kasir
-- Menambahkan kolom catatan dan alamat geocoding pada absensi serta memvalidasi waktu clock-out kasir.

alter table public.attendance add column if not exists notes text default '-';
alter table public.attendance add column if not exists address text;

create or replace function public.clock(
  p_kind text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy int default null,
  p_selfie text default null,
  p_notes text default '-',
  p_address text default null
) returns attendance
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  b branches;
  t tenants;
  d numeric;
  a attendance;
  pol jsonb;
  radius numeric;
  lastk text;
  calc record;
  tzday date;
  ws record;
  v_now_time time;
  v_early_sec int;
begin
  perform _need(13, 'c');
  if p_kind not in ('in', 'out') then raise exception 'Jenis absen tidak valid'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'Koordinat tidak valid'; end if;
  select * into me from profiles where id = auth.uid();
  select * into b from branches where id = me.branch_id;
  select * into t from tenants where id = me.tenant_id;
  if b.id is null or b.lat is null then raise exception 'Akun belum ditautkan ke cabang dengan koordinat'; end if;
  if p_accuracy is not null and p_accuracy > 100 then
    raise exception 'Akurasi GPS terlalu rendah (± % m). Pindah ke tempat terbuka lalu coba lagi.', p_accuracy;
  end if;

  -- Radius geofencing per cabang / kebijakan
  pol := get_effective_policy(me.tenant_id, b.id, me.role);
  radius := case when coalesce((pol->>'layer')::int, 0) > 0 then (pol->>'geofence_radius_meters')::numeric else b.geofence_m end;
  d := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - b.lat) / 2), 2)
       + cos(radians(b.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - b.lng) / 2), 2)));
  if d > radius then raise exception 'Anda berada % m dari %, di luar radius % m', round(d), b.name, round(radius); end if;

  -- Selfie verification & PDP consent
  if t.attendance_selfie_required and (p_selfie is null or btrim(p_selfie) = '') then raise exception 'Selfie wajib untuk absen di tenant ini'; end if;
  if p_selfie is not null and btrim(p_selfie) <> '' and me.attendance_consent_at is null then
    raise exception 'Setujui dulu penggunaan foto selfie untuk absensi (UU PDP)';
  end if;

  -- Sequence validation: in -> out
  tzday := (now() at time zone coalesce(t.timezone, 'Asia/Jakarta'))::date;
  select kind into lastk from attendance
   where profile_id = me.id and (created_at at time zone coalesce(t.timezone, 'Asia/Jakarta'))::date = tzday
   order by created_at desc limit 1;
  if p_kind = 'in' and lastk = 'in' then raise exception 'Anda sudah absen masuk hari ini. Absen pulang dulu.'; end if;
  if p_kind = 'out' and coalesce(lastk, 'out') = 'out' then raise exception 'Belum ada absen masuk yang terbuka hari ini'; end if;

  -- Validasi batasan waktu pulang (Clock-out Window) untuk kasir/staf
  if p_kind = 'out' and me.role = 'staff' then
    select * into ws from work_shifts
     where profile_id = me.id and work_date = tzday
     order by start_time limit 1;
    if ws.id is not null and ws.end_time is not null then
      v_now_time := (now() at time zone coalesce(t.timezone, 'Asia/Jakarta'))::time;
      v_early_sec := extract(epoch from (ws.end_time - v_now_time))::int;
      -- Jika lebih awal dari 15 menit sebelum shift berakhir dan tanpa catatan izin khusus
      if v_early_sec > 900 and (p_notes is null or p_notes = '-' or length(btrim(p_notes)) < 5) then
        raise exception 'Belum waktu absen pulang. Shift Anda berakhir pukul %. Silakan absen mendekati jam pulang atau cantumkan alasan izin darurat pada catatan.', to_char(ws.end_time, 'HH24:MI');
      end if;
    end if;
  end if;

  select * into calc from _att_calc(me.tenant_id, me.id, p_kind, now());

  insert into attendance (
    tenant_id, branch_id, profile_id, kind, lat, lng, distance_m, accuracy_m,
    selfie_path, late_min, overtime_min, notes, address
  )
  values (
    me.tenant_id, b.id, me.id, p_kind, p_lat, p_lng, round(d), p_accuracy,
    nullif(btrim(coalesce(p_selfie, '')), ''), calc.late, calc.ot,
    coalesce(nullif(btrim(p_notes), ''), '-'), nullif(btrim(coalesce(p_address, '')), '')
  )
  returning * into a;

  return a;
end $$;

grant execute on function public.clock(text, double precision, double precision, int, text, text, text) to authenticated;
