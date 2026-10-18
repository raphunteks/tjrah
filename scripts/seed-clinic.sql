-- ═══════════ DATA DEMO KLINIK, RESERVASI & CRM (FASE 3) ═══════════
-- Semua nama, NIK, dan nomor telepon di bawah FIKTIF (kode kecamatan 99 sengaja tidak dipakai wilayah nyata).

-- Tarif layanan & obat Klinik Gigi Senyum (tenant 2).
insert into public.products (id, tenant_id, sku, name, category, price, station, icd9_code) values
  ('00000000-0000-0000-0000-00000002e001', '00000000-0000-0000-0000-000000000002', 'KNS-01', 'Konsultasi dokter gigi', 'Konsultasi', 150000, 'klinik', '89.31'),
  ('00000000-0000-0000-0000-00000002e002', '00000000-0000-0000-0000-000000000002', 'TND-01', 'Scaling & polishing', 'Tindakan', 350000, 'klinik', '96.54'),
  ('00000000-0000-0000-0000-00000002e003', '00000000-0000-0000-0000-000000000002', 'TND-02', 'Tambalan komposit (per gigi)', 'Tindakan', 300000, 'klinik', '23.2'),
  ('00000000-0000-0000-0000-00000002e004', '00000000-0000-0000-0000-000000000002', 'TND-03', 'Cabut gigi permanen', 'Tindakan', 250000, 'klinik', '23.09'),
  ('00000000-0000-0000-0000-00000002e005', '00000000-0000-0000-0000-000000000002', 'TND-04', 'Cabut gigi sulung', 'Tindakan', 150000, 'klinik', '23.01'),
  ('00000000-0000-0000-0000-00000002e006', '00000000-0000-0000-0000-000000000002', 'TND-05', 'Perawatan saluran akar (per kunjungan)', 'Tindakan', 600000, 'klinik', '23.70'),
  ('00000000-0000-0000-0000-00000002e007', '00000000-0000-0000-0000-000000000002', 'TND-06', 'Rontgen periapikal', 'Tindakan', 100000, 'klinik', '87.12'),
  ('00000000-0000-0000-0000-00000002e008', '00000000-0000-0000-0000-000000000002', 'TND-07', 'Odontektomi', 'Tindakan', 1500000, 'klinik', '23.19'),
  ('00000000-0000-0000-0000-00000002e011', '00000000-0000-0000-0000-000000000002', 'OBT-01', 'Amoksisilin 500 mg (tablet)', 'Obat', 2500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e012', '00000000-0000-0000-0000-000000000002', 'OBT-02', 'Asam mefenamat 500 mg (tablet)', 'Obat', 1500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e013', '00000000-0000-0000-0000-000000000002', 'OBT-03', 'Parasetamol 500 mg (tablet)', 'Obat', 1000, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e014', '00000000-0000-0000-0000-000000000002', 'OBT-04', 'Metronidazol 500 mg (tablet)', 'Obat', 2000, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e015', '00000000-0000-0000-0000-000000000002', 'OBT-05', 'Ibuprofen 400 mg (tablet)', 'Obat', 1500, 'farmasi', null),
  ('00000000-0000-0000-0000-00000002e016', '00000000-0000-0000-0000-000000000002', 'OBT-06', 'Klorheksidin 0,2% obat kumur 150 ml', 'Obat', 45000, 'farmasi', null);

insert into public.inventory_items (id, tenant_id, code, name, unit, cost_per_unit, min_qty) values
  ('00000000-0000-0000-0000-00000002d011', '00000000-0000-0000-0000-000000000002', 'OBT-001', 'Amoksisilin 500 mg', 'tablet', 900, 100),
  ('00000000-0000-0000-0000-00000002d012', '00000000-0000-0000-0000-000000000002', 'OBT-002', 'Asam mefenamat 500 mg', 'tablet', 500, 100),
  ('00000000-0000-0000-0000-00000002d013', '00000000-0000-0000-0000-000000000002', 'OBT-003', 'Parasetamol 500 mg', 'tablet', 300, 100),
  ('00000000-0000-0000-0000-00000002d014', '00000000-0000-0000-0000-000000000002', 'OBT-004', 'Metronidazol 500 mg', 'tablet', 700, 100),
  ('00000000-0000-0000-0000-00000002d015', '00000000-0000-0000-0000-000000000002', 'OBT-005', 'Ibuprofen 400 mg', 'tablet', 500, 100),
  ('00000000-0000-0000-0000-00000002d016', '00000000-0000-0000-0000-000000000002', 'OBT-006', 'Klorheksidin 0,2% 150 ml', 'botol', 22000, 5);

-- Obat → stok: BOM 1:1, sehingga pembayaran di kasir memotong stok obat otomatis.
insert into public.bom_lines (tenant_id, product_id, component_id, qty)
select '00000000-0000-0000-0000-000000000002', ('00000000-0000-0000-0000-00000002e0' || n)::uuid, ('00000000-0000-0000-0000-00000002d0' || n)::uuid, 1
from unnest(array['11', '12', '13', '14', '15', '16']) n;

insert into public.stock_levels (tenant_id, branch_id, item_id, qty)
select tenant_id, '00000000-0000-0000-0000-0000000000b3', id, case when unit = 'botol' then 20 else 500 end
from public.inventory_items where tenant_id = '00000000-0000-0000-0000-000000000002';

insert into public.accounts (tenant_id, code, name, type) values
  ('00000000-0000-0000-0000-000000000002', '1301', 'Persediaan Obat & BHP', 'asset'),
  ('00000000-0000-0000-0000-000000000002', '3101', 'Modal Pemilik', 'equity');
with e as (
  insert into public.journal_entries (tenant_id, branch_id, entry_date, memo, source)
  values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', current_date - 20, 'Saldo awal persediaan obat (setoran modal)', 'financing')
  returning id
), v as (
  select round(sum(s.qty * i.cost_per_unit)) amt from public.stock_levels s join public.inventory_items i on i.id = s.item_id
  where s.tenant_id = '00000000-0000-0000-0000-000000000002'
)
insert into public.journal_lines (tenant_id, entry_id, account_id, debit, credit)
select '00000000-0000-0000-0000-000000000002', e.id, a.id, case when a.code = '1301' then v.amt else 0 end, case when a.code = '3101' then v.amt else 0 end
from e, v, public.accounts a where a.tenant_id = '00000000-0000-0000-0000-000000000002' and a.code in ('1301', '3101');

update public.tenant_integrations set satusehat_enabled = true where tenant_id = '00000000-0000-0000-0000-000000000002';

-- Pasien lama dengan riwayat kunjungan & odontogram (kunjungan 30 hari lalu, sudah terkunci).
insert into public.patients (id, tenant_id, mrn, nik, name, birth_date, sex, phone, allergies) values
  ('00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-000000000002', 'RM-000001', '7371991204900001', 'Andi Rahmat (demo)', '1990-04-12', 'male', '081100000201', 'Penisilin (ruam kulit)'),
  ('00000000-0000-0000-0000-00000002a002', '00000000-0000-0000-0000-000000000002', 'RM-000002', '7371994308950002', 'Nurul Aini (demo)', '1995-08-03', 'female', '081100000202', null);

insert into public.visits (id, tenant_id, branch_id, patient_id, status, arrived_at, started_at, closed_at, subjective, objective, assessment, plan) values
  ('00000000-0000-0000-0000-00000002f001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000002a001',
   'closed', now() - interval '30 days 20 minutes', now() - interval '30 days', now() - interval '30 days' + interval '35 minutes',
   'Ngilu pada geraham kiri bawah saat minum dingin, 2 minggu.', 'Karies oklusal 36 mencapai dentin, tes dingin (+) singkat, perkusi (−).',
   'Karies dentin 36 (pulpitis reversibel).', 'Tambalan komposit 36. Kontrol 6 bulan.');
insert into public.odontogram_entries (tenant_id, patient_id, visit_id, tooth, surfaces, condition, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 36, '{O}', 'car', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 36, '{O}', 'cof', now() - interval '30 days' + interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 46, '{O,D}', 'amf', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 18, '{}', 'mis', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002a001', '00000000-0000-0000-0000-00000002f001', 15, '{M}', 'car', now() - interval '30 days');
insert into public.visit_diagnoses (tenant_id, visit_id, code, display, is_primary) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', 'K02.1', 'Caries of dentine', true);
insert into public.visit_procedures (tenant_id, visit_id, code, display, tooth, product_id) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', '23.2', 'Restoration of tooth by filling', 36, '00000000-0000-0000-0000-00000002e003');
insert into public.prescriptions (tenant_id, branch_id, visit_id, patient_name, status, sent_at, dispensed_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-00000002f001', 'Andi Rahmat (demo)', 'cancelled', now() - interval '30 days', null);
insert into public.satusehat_outbox (tenant_id, visit_id, payload, status, attempts, encounter_id, sent_at)
select '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000002f001', public._fhir_bundle('00000000-0000-0000-0000-00000002f001'),
       'simulated', 1, 'SIM-ENC-0001', now() - interval '30 days' + interval '36 minutes';

-- Antrean hari ini (diregistrasi Staff · fitur 18). Fikri: anak, gigi sulung.
insert into public.queue_entries (tenant_id, branch_id, kind, name, phone, nik, complaint, scheduled_at, status, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Budi Santoso (demo)', '081100000203', '7371992511870003',
   'Geraham kanan bawah sakit berdenyut sejak 3 hari, bengkak ringan.', now() - interval '25 minutes', 'waiting', now() - interval '25 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Nurul Aini (demo)', '081100000202', '7371994308950002',
   'Kontrol karang gigi.', now() - interval '15 minutes', 'waiting', now() - interval '15 minutes'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b3', 'clinic', 'Fikri Ramadhan (demo)', '081100000204', '7371990906180005',
   'Gigi susu depan bawah goyang, gigi tetap sudah tumbuh di belakangnya.', now() - interval '5 minutes', 'waiting', now() - interval '5 minutes');

-- Reservasi meja (F&B) & pelanggan CRM Kopi Harum.
insert into public.queue_entries (tenant_id, branch_id, kind, name, phone, party_size, table_id, scheduled_at, status)
select '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'table', 'Keluarga Hasan (demo)', '081100000301', 5, t.id,
       date_trunc('day', now()) + interval '19 hours', 'booked'
from public.tables t where t.branch_id = '00000000-0000-0000-0000-0000000000b1' and t.label = '08';

insert into public.customers (tenant_id, phone, name, points, total_spent, visits, last_visit_at) values
  ('00000000-0000-0000-0000-000000000001', '081100000301', 'Hasan (demo)', 46, 468500, 9, now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000001', '081100000302', 'Mega (demo)', 12, 124300, 3, now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000000001', '081100000303', null, 3, 38500, 1, now() - interval '20 days');
