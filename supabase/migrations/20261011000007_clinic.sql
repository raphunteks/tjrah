-- Harum.in · FASE 3: klinik (RME, odontogram, ICD, e-resep, SATUSEHAT), reservasi & antrean, CRM.
-- Tabel dipetakan ke fitur matriks ASLI: 15 CRM, 17 Rekam Medis & SATUSEHAT, 18 Reservasi & Antrean.

-- ───────── Kolom tambahan pada tabel yang sudah ada ─────────
alter table public.products add column if not exists icd9_code text;          -- tarif tindakan ↔ kode ICD-9-CM
do $$ declare c text; begin
  select conname into c from pg_constraint where conrelid = 'public.products'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%station%';
  if c is not null then execute format('alter table public.products drop constraint %I', c); end if;
end $$;
alter table public.products add constraint products_station_check check (station in ('dapur', 'barista', 'grill', 'pastry', 'klinik', 'farmasi'));

alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists practitioner_id uuid references public.profiles(id);
alter table public.orders add column if not exists visit_id uuid;

alter table public.profiles add column if not exists commission_rate numeric(5,4) not null default 0 check (commission_rate between 0 and 1);
alter table public.profiles add column if not exists nik text;                 -- NIK nakes, untuk lookup Practitioner SATUSEHAT
alter table public.profiles add column if not exists satusehat_ihs text;

alter table public.branches add column if not exists satusehat_location_id text;
alter table public.tenant_integrations add column if not exists satusehat_enabled boolean not null default false;
alter table public.tenant_integrations add column if not exists satusehat_org_id text;   -- ID Organization dari SATUSEHAT
alter table public.tenant_integrations add column if not exists satusehat_env text not null default 'sandbox' check (satusehat_env in ('sandbox', 'production'));

-- ───────── Validasi NIK (16 digit, kode provinsi, tanggal lahir DDMMYY, perempuan DD+40) ─────────
create or replace function public.valid_nik(p text) returns boolean language plpgsql immutable as $$
declare dd int; mm int;
begin
  if p is null or p !~ '^\d{16}$' then return false; end if;
  if substr(p, 1, 2)::int not between 11 and 94 then return false; end if;
  dd := substr(p, 7, 2)::int; mm := substr(p, 9, 2)::int;
  if dd > 40 then dd := dd - 40; end if;
  return mm between 1 and 12 and dd between 1 and 31 and substr(p, 13, 4)::int > 0;
end $$;

-- ───────── Referensi ICD (diisi dari src/lib/icd.js lewat seed) ─────────
create table public.icd_codes (
  system text not null check (system in ('icd10', 'icd9cm')),
  code text not null,
  display text not null,
  label_id text,
  primary key (system, code)
);

-- ═════════ Fitur 15 · CRM & poin loyalitas ═════════
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone text not null,
  name text,
  points int not null default 0 check (points >= 0),
  total_spent numeric(14,2) not null default 0,
  visits int not null default 0,
  last_visit_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

-- ═════════ Fitur 18 · Reservasi meja & antrean ruang tunggu ═════════
create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  kind text not null default 'clinic' check (kind in ('clinic', 'table')),
  queue_no int,
  name text not null check (length(btrim(name)) > 1),
  phone text,
  nik text,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  complaint text,
  party_size int check (party_size between 1 and 50),
  table_id uuid references public.tables(id) on delete set null,
  scheduled_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('booked', 'waiting', 'called', 'in_exam', 'done', 'cancelled', 'no_show')),
  patient_id uuid,
  visit_id uuid,
  practitioner_id uuid references public.profiles(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- Antrean klinik wajib NIK valid (registrasi SATUSEHAT); reservasi meja wajib jumlah tamu.
  check (kind <> 'clinic' or public.valid_nik(nik)),
  check (kind <> 'table' or party_size is not null)
);
create index on public.queue_entries (branch_id, scheduled_at);

-- ═════════ Fitur 17 · Rekam medis elektronik ═════════
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mrn text not null,                        -- nomor rekam medis
  nik text not null check (public.valid_nik(nik)),
  name text not null,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  phone text,
  address text,
  allergies text,                           -- riwayat alergi (wajib ditanya di kunjungan pertama)
  satusehat_ihs text,                       -- ID Patient SATUSEHAT setelah lookup NIK
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (tenant_id, nik),
  unique (tenant_id, mrn)
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  practitioner_id uuid references public.profiles(id),
  queue_id uuid references public.queue_entries(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'closed', 'cancelled')),
  arrived_at timestamptz,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  subjective text,      -- S: keluhan & anamnesis
  objective text,       -- O: pemeriksaan
  assessment text,      -- A: penilaian
  plan text,            -- P: rencana
  vitals jsonb not null default '{}',
  order_id uuid references public.orders(id) on delete set null
);
create index on public.visits (patient_id, started_at desc);

create table public.odontogram_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  tooth smallint not null check (
    (tooth / 10 between 1 and 4 and tooth % 10 between 1 and 8) or (tooth / 10 between 5 and 8 and tooth % 10 between 1 and 5)),
  surfaces text[] not null default '{}' check (surfaces <@ array['M', 'D', 'O', 'I', 'V', 'L']),
  condition text not null check (condition in ('car', 'amf', 'cof', 'fis', 'sou', 'nvt', 'rct', 'poc', 'ipx', 'prd', 'mis', 'rrx', 'cfr', 'une', 'pre')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.odontogram_entries (patient_id, created_at);

create table public.visit_diagnoses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  system text not null default 'icd10' check (system = 'icd10'),
  code text not null,
  display text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (system, code) references public.icd_codes (system, code),
  unique (visit_id, code)
);

create table public.visit_procedures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  system text not null default 'icd9cm' check (system = 'icd9cm'),
  code text not null,
  display text not null,
  tooth smallint,
  product_id uuid references public.products(id) on delete set null,  -- tarif yang ditagihkan (opsional)
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now(),
  foreign key (system, code) references public.icd_codes (system, code)
);

-- E-resep: dipisah dari kunjungan agar Kasir (R · Billing Obat) bisa membaca resep tanpa membaca SOAP.
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  visit_id uuid not null unique references public.visits(id) on delete cascade,
  patient_name text not null,
  practitioner_name text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'dispensed', 'cancelled')),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dispensed_at timestamptz
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  qty numeric(10,2) not null check (qty > 0),
  signa text not null check (length(btrim(signa)) > 0),   -- aturan pakai, mis. 3×1 sesudah makan
  days int check (days between 1 and 90),
  created_at timestamptz not null default now()
);

-- Antrean kirim ke SATUSEHAT (HL7 FHIR R4). Diisi saat dokter menutup kunjungan; dikirim Edge Function satusehat-sync.
create table public.satusehat_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visit_id uuid not null references public.visits(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'simulated', 'failed')),
  attempts int not null default 0,
  encounter_id text,
  response jsonb,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.satusehat_outbox (status, created_at);

-- ═════════ RLS ═════════
do $$
declare t text;
begin
  foreach t in array array['icd_codes','customers','queue_entries','patients','visits','odontogram_entries','visit_diagnoses',
                           'visit_procedures','prescriptions','prescription_items','satusehat_outbox']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

create policy icd_read on public.icd_codes for select to authenticated using (true);

-- Fitur 15 · CRM (Staff: RU)
create policy cust_r on public.customers for select using (public.feat_ok(tenant_id, null, 15, 'r'));
create policy cust_c on public.customers for insert with check (public.feat_ok(tenant_id, null, 15, 'c'));
create policy cust_u on public.customers for update using (public.feat_ok(tenant_id, null, 15, 'u'));
create policy cust_d on public.customers for delete using (public.feat_ok(tenant_id, null, 15, 'd'));

-- Fitur 18 · Reservasi & antrean (Staff: CRUD, Dokter: RU)
create policy q_r on public.queue_entries for select using (public.feat_ok(tenant_id, branch_id, 18, 'r'));
create policy q_c on public.queue_entries for insert with check (public.feat_ok(tenant_id, branch_id, 18, 'c'));
create policy q_u on public.queue_entries for update using (public.feat_ok(tenant_id, branch_id, 18, 'u'));
create policy q_d on public.queue_entries for delete using (public.feat_ok(tenant_id, branch_id, 18, 'd'));

-- Fitur 17 · data klinis: baca butuh R tanpa cakupan (Kasir "R (Billing Obat)" TIDAK membaca SOAP/odontogram).
create or replace function public.rme_read(p_tenant uuid, p_branch uuid) returns boolean language sql stable as $$
  select public.feat_ok(p_tenant, p_branch, 17, 'r') and public.perm_scope(17) is null
$$;
-- Tulis data klinis hanya selama kunjungan masih berjalan; setelah ditutup, rekam medis terkunci (jejak tetap di audit_logs).
create or replace function public.visit_open(p_visit uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits where id = p_visit and status = 'in_progress')
$$;

create policy pat_r on public.patients for select using (public.rme_read(tenant_id, null));
create policy pat_c on public.patients for insert with check (public.feat_ok(tenant_id, null, 17, 'c'));
create policy pat_u on public.patients for update using (public.feat_ok(tenant_id, null, 17, 'u'));

create policy vis_r on public.visits for select using (public.rme_read(tenant_id, branch_id));
create policy vis_u on public.visits for update using (public.feat_ok(tenant_id, branch_id, 17, 'u') and status = 'in_progress')
  with check (status = 'in_progress');   -- menutup kunjungan hanya lewat RPC close_visit()

create policy odo_r on public.odontogram_entries for select using (public.rme_read(tenant_id, null));
create policy odo_c on public.odontogram_entries for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy odo_d on public.odontogram_entries for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

create policy dx_r on public.visit_diagnoses for select using (public.rme_read(tenant_id, null));
create policy dx_c on public.visit_diagnoses for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy dx_u on public.visit_diagnoses for update using (public.feat_ok(tenant_id, null, 17, 'u') and public.visit_open(visit_id));
create policy dx_d on public.visit_diagnoses for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

create policy px_r on public.visit_procedures for select using (public.rme_read(tenant_id, null));
create policy px_c on public.visit_procedures for insert with check (public.feat_ok(tenant_id, null, 17, 'c') and public.visit_open(visit_id));
create policy px_d on public.visit_procedures for delete using (public.feat_ok(tenant_id, null, 17, 'd') and public.visit_open(visit_id));

-- Resep: semua pemegang R fitur 17 (termasuk Kasir · Billing Obat) boleh membaca.
create policy rx_r on public.prescriptions for select using (public.feat_ok(tenant_id, branch_id, 17, 'r'));
create policy rxi_r on public.prescription_items for select
  using (public.feat_ok(tenant_id, null, 17, 'r') and exists (select 1 from public.prescriptions p where p.id = prescription_id and public.branch_ok(p.branch_id)));
create policy rxi_c on public.prescription_items for insert with check (public.feat_ok(tenant_id, null, 17, 'c')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));
create policy rxi_u on public.prescription_items for update using (public.feat_ok(tenant_id, null, 17, 'u')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));
create policy rxi_d on public.prescription_items for delete using (public.feat_ok(tenant_id, null, 17, 'd')
  and exists (select 1 from public.prescriptions p where p.id = prescription_id and p.status = 'draft'));

create policy ss_r on public.satusehat_outbox for select using (public.rme_read(tenant_id, null));

-- Jejak audit rekam medis (siapa mengubah apa, kapan).
do $$
declare t text;
begin
  foreach t in array array['patients','visits','odontogram_entries','visit_diagnoses','visit_procedures','prescriptions',
                           'prescription_items','queue_entries','customers']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- Nomor antrean harian per cabang & sinkron status meja reservasi.
create or replace function public.queue_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.queue_no is null then
    select coalesce(max(queue_no), 0) + 1 into new.queue_no from queue_entries
    where branch_id = new.branch_id and kind = new.kind and scheduled_at::date = new.scheduled_at::date;
  end if;
  if new.kind = 'clinic' and not coalesce(public.valid_nik(new.nik), false) then
    raise exception 'NIK tidak valid: harus 16 digit dengan kode provinsi dan tanggal lahir yang benar';
  end if;
  if new.kind = 'clinic' and new.birth_date is null then
    new.birth_date := make_date(
      case when substr(new.nik, 11, 2)::int > extract(year from now())::int % 100 then 1900 else 2000 end + substr(new.nik, 11, 2)::int,
      substr(new.nik, 9, 2)::int, substr(new.nik, 7, 2)::int % 40);
    new.sex := coalesce(new.sex, case when substr(new.nik, 7, 2)::int > 40 then 'female' else 'male' end);
  end if;
  return new;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Tanggal lahir di NIK tidak valid';
end $$;
create trigger queue_before before insert or update on public.queue_entries for each row execute function public.queue_before();

create or replace function public.queue_table_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'table' or new.table_id is null then return new; end if;
  if new.status = 'booked' then
    update tables set status = 'reserved' where id = new.table_id and status = 'available';
  elsif new.status in ('waiting', 'cancelled', 'no_show', 'done') then
    update tables set status = 'available' where id = new.table_id and status = 'reserved';
  end if;
  return new;
end $$;
create trigger queue_table_sync after insert or update of status on public.queue_entries for each row execute function public.queue_table_sync();

-- Realtime: antrean & resep ikut berubah di layar Staff/Dokter tanpa muat ulang.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.queue_entries, public.prescriptions, public.satusehat_outbox;
  end if;
end $$;
