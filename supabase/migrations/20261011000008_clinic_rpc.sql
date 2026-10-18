-- Harum.in · FASE 3: RPC klinik, CRM, dan penyesuaian pay_order / payroll.
-- Pola sama dengan FASE 2: periksa matriks (has_perm) dulu, baru efek samping sistem.

-- ═════════ Fitur 17 + 18 · Mulai pemeriksaan dari antrean ═════════
-- Registrasi antrean (NIK) oleh Staff (fitur 18). Kartu rekam medis pasien dibuat/ditautkan DI SINI oleh Dokter,
-- karena matriks asli hanya memberi Staff "R (Billing Obat)" pada fitur 17.
create or replace function public.start_visit(p_queue uuid) returns visits
language plpgsql security definer set search_path = public as $$
declare q queue_entries; p patients; v visits; seq int;
begin
  perform _need(17, 'c');
  perform _need(18, 'u');
  select * into q from queue_entries where id = p_queue for update;
  if not found or not tenant_ok(q.tenant_id) or not branch_ok(q.branch_id) then raise exception 'Antrean tidak ditemukan'; end if;
  if q.kind <> 'clinic' then raise exception 'Bukan antrean klinik'; end if;
  if q.status not in ('waiting', 'called') then raise exception 'Pasien berstatus % tidak bisa diperiksa', q.status; end if;
  if exists (select 1 from visits where practitioner_id = auth.uid() and status = 'in_progress') and current_app_role() = 'dokter' then
    raise exception 'Tutup dulu kunjungan yang sedang berjalan';
  end if;

  select * into p from patients where tenant_id = q.tenant_id and nik = q.nik;
  if not found then
    select count(*) + 1 into seq from patients where tenant_id = q.tenant_id;
    insert into patients (tenant_id, mrn, nik, name, birth_date, sex, phone)
    values (q.tenant_id, 'RM-' || lpad(seq::text, 6, '0'), q.nik, q.name, q.birth_date, q.sex, q.phone)
    returning * into p;
  end if;

  insert into visits (tenant_id, branch_id, patient_id, practitioner_id, queue_id, arrived_at, subjective)
  values (q.tenant_id, q.branch_id, p.id, auth.uid(), q.id, q.created_at, nullif(btrim(q.complaint), ''))
  returning * into v;
  insert into prescriptions (tenant_id, branch_id, visit_id, patient_name, practitioner_name)
  values (q.tenant_id, q.branch_id, v.id, p.name, (select full_name from profiles where id = auth.uid()));
  update queue_entries set status = 'in_exam', patient_id = p.id, visit_id = v.id, practitioner_id = auth.uid() where id = q.id;
  return v;
end $$;

-- ═════════ FHIR R4 Bundle untuk SATUSEHAT (struktur sama dengan src/lib/clinic.js) ═════════
create or replace function public._fhir_bundle(p_visit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v visits; p patients; doc profiles; br branches; org text; enc text; subj jsonb; entries jsonb := '[]';
begin
  select * into v from visits where id = p_visit;
  select * into p from patients where id = v.patient_id;
  select * into doc from profiles where id = v.practitioner_id;
  select * into br from branches where id = v.branch_id;
  select coalesce(satusehat_org_id, 'ORG-BELUM-DIATUR') into org from tenant_integrations where tenant_id = v.tenant_id;
  org := coalesce(org, 'ORG-BELUM-DIATUR');
  enc := 'urn:uuid:' || v.id;   -- fullUrl wajib URN UUID murni (RFC 4122)
  subj := jsonb_build_object('reference', 'Patient/' || coalesce(p.satusehat_ihs, 'NIK:' || p.nik), 'display', p.name);

  entries := entries || jsonb_build_array(jsonb_build_object(
    'fullUrl', enc,
    'resource', jsonb_build_object(
      'resourceType', 'Encounter',
      'identifier', jsonb_build_array(jsonb_build_object('system', 'http://sys-ids.kemkes.go.id/encounter/' || org, 'value', v.id)),
      'status', 'finished',
      'class', jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-ActCode', 'code', 'AMB', 'display', 'ambulatory'),
      'subject', subj,
      'participant', jsonb_build_array(jsonb_build_object(
        'type', jsonb_build_array(jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
          'system', 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', 'code', 'ATND', 'display', 'attender')))),
        'individual', jsonb_build_object('reference', 'Practitioner/' || coalesce(doc.satusehat_ihs, 'NIK:' || doc.nik, 'UNRESOLVED'), 'display', doc.full_name))),
      'period', jsonb_build_object('start', v.started_at, 'end', v.closed_at),
      'location', jsonb_build_array(jsonb_build_object('location', jsonb_build_object(
        'reference', 'Location/' || coalesce(br.satusehat_location_id, 'LOC-BELUM-DIATUR'), 'display', br.name))),
      'diagnosis', coalesce((select jsonb_agg(jsonb_build_object(
          'condition', jsonb_build_object('reference', 'urn:uuid:' || d.id, 'display', d.display),
          'use', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
            'system', 'http://terminology.hl7.org/CodeSystem/diagnosis-role', 'code', 'DD', 'display', 'Discharge diagnosis'))),
          'rank', d.rn) order by d.rn)
        from (select *, row_number() over (order by is_primary desc, created_at) rn from visit_diagnoses where visit_id = v.id) d), '[]'),
      'statusHistory', jsonb_build_array(
        jsonb_build_object('status', 'arrived', 'period', jsonb_build_object('start', coalesce(v.arrived_at, v.started_at), 'end', v.started_at)),
        jsonb_build_object('status', 'in-progress', 'period', jsonb_build_object('start', v.started_at, 'end', v.closed_at)),
        jsonb_build_object('status', 'finished', 'period', jsonb_build_object('start', v.closed_at, 'end', v.closed_at))),
      'serviceProvider', jsonb_build_object('reference', 'Organization/' || org)),
    'request', jsonb_build_object('method', 'POST', 'url', 'Encounter')));

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || d.id,
    'resource', jsonb_build_object(
      'resourceType', 'Condition',
      'clinicalStatus', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
        'system', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'code', 'active', 'display', 'Active'))),
      'category', jsonb_build_array(jsonb_build_object('coding', jsonb_build_array(jsonb_build_object(
        'system', 'http://terminology.hl7.org/CodeSystem/condition-category', 'code', 'encounter-diagnosis', 'display', 'Encounter Diagnosis')))),
      'code', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://hl7.org/fhir/sid/icd-10', 'code', d.code, 'display', d.display))),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc)),
    'request', jsonb_build_object('method', 'POST', 'url', 'Condition')) order by d.is_primary desc, d.created_at)
    from visit_diagnoses d where d.visit_id = v.id), '[]');

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || x.id,
    'resource', jsonb_build_object(
      'resourceType', 'Procedure', 'status', 'completed',
      'code', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://hl7.org/fhir/sid/icd-9-cm', 'code', x.code, 'display', x.display))),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc),
      'performedPeriod', jsonb_build_object('start', v.started_at, 'end', v.closed_at))
      || case when x.tooth is not null then jsonb_build_object('bodySite', jsonb_build_array(jsonb_build_object('text', 'Gigi ' || x.tooth || ' (FDI)'))) else '{}' end,
    'request', jsonb_build_object('method', 'POST', 'url', 'Procedure')) order by x.created_at)
    from visit_procedures x where x.visit_id = v.id), '[]');

  entries := entries || coalesce((select jsonb_agg(jsonb_build_object(
    'fullUrl', 'urn:uuid:' || i.id,
    'resource', jsonb_build_object(
      'resourceType', 'MedicationRequest', 'status', 'active', 'intent', 'order',
      'medicationCodeableConcept', jsonb_build_object('text', i.name),
      'subject', subj, 'encounter', jsonb_build_object('reference', enc), 'authoredOn', v.closed_at,
      'dosageInstruction', jsonb_build_array(jsonb_build_object('text', i.signa || coalesce(' selama ' || i.days || ' hari', ''))),
      'dispenseRequest', jsonb_build_object('quantity', jsonb_build_object('value', i.qty))),
    'request', jsonb_build_object('method', 'POST', 'url', 'MedicationRequest')) order by i.created_at)
    from prescription_items i join prescriptions r on r.id = i.prescription_id where r.visit_id = v.id), '[]');

  return jsonb_build_object('resourceType', 'Bundle', 'type', 'transaction', 'entry', entries);
end $$;

-- ═════════ Tutup kunjungan: kunci RME, terbitkan e-resep + tagihan, antre SATUSEHAT ═════════
create or replace function public.close_visit(p_visit uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v visits; p patients; o orders; rx prescriptions; n_items int := 0; ob uuid; kons products; x record;
begin
  perform _need(17, 'u');
  select * into v from visits where id = p_visit for update;
  if not found or not tenant_ok(v.tenant_id) or not branch_ok(v.branch_id) then raise exception 'Kunjungan tidak ditemukan'; end if;
  if v.status <> 'in_progress' then raise exception 'Kunjungan sudah ditutup'; end if;
  if current_app_role() = 'dokter' and v.practitioner_id <> auth.uid() then raise exception 'Hanya dokter pemeriksa yang bisa menutup kunjungan'; end if;
  if coalesce(btrim(v.subjective), '') = '' or coalesce(btrim(v.assessment), '') = '' then
    raise exception 'Lengkapi SOAP minimal S (anamnesis) dan A (penilaian)';
  end if;
  if not exists (select 1 from visit_diagnoses where visit_id = v.id) then raise exception 'Tambahkan minimal satu diagnosis ICD-10'; end if;
  select * into p from patients where id = v.patient_id;
  select * into rx from prescriptions where visit_id = v.id for update;

  -- Tagihan: konsultasi + tindakan bertarif + obat dari e-resep. Kasir yang menerima pembayaran (fitur 5).
  insert into orders (tenant_id, branch_id, code, status, channel, customer_name, customer_phone, practitioner_id, visit_id)
  values (v.tenant_id, v.branch_id, 'INV-' || to_char(now(), 'YYMMDD-HH24MISS') || '-' || substr(md5(random()::text), 1, 3),
          'open', 'clinic', p.name, p.phone, v.practitioner_id, v.id)
  returning * into o;
  select * into kons from products where tenant_id = v.tenant_id and sku = 'KNS-01' and is_available;
  if found then
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, kons.id, kons.name, 1, kons.price, kons.station, 'served');
  end if;
  for x in select pr.id, pr.name, pr.price, pr.station, sum(vp.qty) q from visit_procedures vp join products pr on pr.id = vp.product_id
           where vp.visit_id = v.id and pr.tenant_id = v.tenant_id group by pr.id, pr.name, pr.price, pr.station loop
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, x.id, x.name, x.q, x.price, x.station, 'served');
  end loop;
  for x in select pr.id, pr.name, pr.price, pr.station, ceil(sum(i.qty))::int q from prescription_items i join products pr on pr.id = i.product_id
           where i.prescription_id = rx.id and pr.tenant_id = v.tenant_id group by pr.id, pr.name, pr.price, pr.station loop
    insert into order_items (tenant_id, branch_id, order_id, product_id, name, qty, price, station, kitchen_status)
    values (v.tenant_id, v.branch_id, o.id, x.id, x.name, x.q, x.price, x.station, 'served');
    n_items := n_items + 1;
  end loop;
  update orders set subtotal = coalesce((select sum(qty * price) from order_items where order_id = o.id), 0) where id = o.id returning * into o;
  if o.subtotal = 0 then delete from orders where id = o.id; o := null; end if;

  update prescriptions set status = case when n_items > 0 then 'sent' else 'cancelled' end, sent_at = now(), order_id = o.id where id = rx.id;
  update visits set status = 'closed', closed_at = now(), order_id = o.id where id = v.id;
  update queue_entries set status = 'done' where id = v.queue_id;

  -- SATUSEHAT: dikirim saat kunjungan ditutup, tidak menunggu pelunasan (revisi Bab V).
  insert into satusehat_outbox (tenant_id, visit_id, payload) values (v.tenant_id, v.id, _fhir_bundle(v.id)) returning id into ob;
  return jsonb_build_object('visit_id', v.id, 'order_id', o.id, 'order_code', o.code, 'subtotal', coalesce(o.subtotal, 0),
                            'rx_items', n_items, 'outbox_id', ob);
end $$;

create or replace function public.retry_satusehat(p_outbox uuid) returns satusehat_outbox
language plpgsql security definer set search_path = public as $$
declare s satusehat_outbox;
begin
  perform _need(17, 'u');
  update satusehat_outbox set status = 'queued', error = null where id = p_outbox and tenant_ok(tenant_id) and status = 'failed'
  returning * into s;
  if not found then raise exception 'Hanya kiriman yang gagal yang bisa diulang'; end if;
  return s;
end $$;

-- ═════════ Fitur 14 · komisi pribadi (Dokter/Terapis: R Komisi Pribadi) ═════════
create or replace function public.my_commission(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rate numeric; svc numeric; n int;
begin
  perform _need(14, 'r');
  select commission_rate into rate from profiles where id = auth.uid();
  select coalesce(sum(i.qty * i.price), 0), count(distinct o.id) into svc, n
  from orders o join order_items i on i.order_id = o.id join products pr on pr.id = i.product_id
  where o.practitioner_id = auth.uid() and o.status = 'paid' and o.paid_at::date between p_from and p_to
    and pr.category in ('Tindakan', 'Konsultasi');
  return jsonb_build_object('rate', coalesce(rate, 0), 'services', svc, 'orders', n, 'commission', round(svc * coalesce(rate, 0)));
end $$;

create or replace function public.create_payroll_run(p_period date) returns payroll_runs
language plpgsql security definer set search_path = public as $$
declare t uuid := current_tenant_id(); r payroll_runs; d0 date := date_trunc('month', p_period)::date;
begin
  perform _need(14, 'c');
  if t is null then raise exception 'Payroll dibuat dari akun tenant'; end if;
  insert into payroll_runs (tenant_id, period) values (t, d0) returning * into r;
  insert into payroll_lines (tenant_id, run_id, profile_id, base, commission)
  select t, r.id, pf.id, pf.base_salary,
         round(pf.commission_rate * coalesce((select sum(i.qty * i.price) from orders o join order_items i on i.order_id = o.id
            join products pr on pr.id = i.product_id
            where o.practitioner_id = pf.id and o.status = 'paid' and pr.category in ('Tindakan', 'Konsultasi')
              and o.paid_at >= d0 and o.paid_at < d0 + interval '1 month'), 0))
  from profiles pf where pf.tenant_id = t and pf.role in ('gm', 'staff', 'dokter');
  return r;
exception when unique_violation then raise exception 'Payroll periode ini sudah ada';
end $$;

-- ═════════ pay_order v3: PB1 hanya untuk F&B; resep tandai diserahkan; poin CRM; struk WhatsApp ═════════
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

  -- PB1 10% hanya untuk makanan/minuman; jasa pelayanan kesehatan medis bukan objek PB1.
  v_tax := case when o.channel = 'clinic' then 0 else round(o.subtotal * 0.10) end;
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

-- Fitur 15: Staff punya RU, tetapi poin hanya boleh NAIK lewat transaksi lunas (pay_order) atau oleh Owner/GM/Superadmin.
-- Staff tetap bisa menukar (mengurangi) poin dan mengubah nama/catatan.
create or replace function public.customers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.points > old.points and coalesce(current_setting('harumin.sys', true), '') <> '1'
     and coalesce(current_app_role()::text, '') not in ('superadmin', 'owner', 'gm') then
    raise exception 'Poin hanya bertambah lewat transaksi lunas';
  end if;
  if new.total_spent <> old.total_spent or new.visits <> old.visits then
    if coalesce(current_setting('harumin.sys', true), '') <> '1' then raise exception 'Total belanja & kunjungan diisi sistem'; end if;
  end if;
  new.phone := old.phone;   -- nomor = kunci pelanggan
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function public.customers_guard();

-- Hermes: jenis pesan baru + status 'sending' (klaim baris oleh Edge Function hermes-dispatch).
comment on column public.hermes_events.kind is 'z_report | low_stock | void_alert | margin_drop | inquiry | receipt | satusehat';
alter table public.hermes_events drop constraint if exists hermes_events_status_check;
alter table public.hermes_events add constraint hermes_events_status_check check (status in ('queued', 'sending', 'sent', 'failed', 'simulated'));

-- Kredensial SATUSEHAT per tenant dari Supabase Vault (nama secret: satusehat_client_id:<tenant_id>,
-- satusehat_client_secret:<tenant_id>). Hanya service_role (Edge Function) yang boleh memanggil.
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $f$
      create or replace function public.satusehat_credentials(p_tenant uuid) returns table (client_id text, client_secret text)
      language sql stable security definer set search_path = public, vault as $q$
        select (select decrypted_secret from vault.decrypted_secrets where name = 'satusehat_client_id:' || p_tenant),
               (select decrypted_secret from vault.decrypted_secrets where name = 'satusehat_client_secret:' || p_tenant)
      $q$;
      revoke execute on function public.satusehat_credentials(uuid) from public, anon, authenticated;
      grant execute on function public.satusehat_credentials(uuid) to service_role;
    $f$;
  end if;
end $$;

revoke execute on function public._fhir_bundle from public, anon, authenticated;
grant execute on function public.start_visit, public.close_visit, public.retry_satusehat, public.my_commission,
  public.create_payroll_run, public.pay_order, public.valid_nik to authenticated;
