// Klinik, antrean/reservasi & CRM mode DEMO: tiruan tabel + RPC dari
// supabase/migrations/*_clinic.sql dan *_clinic_rpc.sql. Pesan error disalin dari SQL.
import { can, permOf } from "../lib/rbac.js";
import { checkNik, isValidTooth, CONDITION, buildFhirBundle } from "../lib/clinic.js";
import { ICD10, ICD9CM } from "../lib/icd.js";

const T1 = "t1", T2 = "t2", B1 = "b1", B3 = "b3";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60e3, DAY = 864e5;

export function seedClinic() {
  const P = (n, sku, name, category, price, station, icd9 = null) => ({ id: `k${n}`, tenant_id: T2, sku, name, category, price, station, icd9_code: icd9, is_available: true, barcode: null });
  const products = [
    P("001", "KNS-01", "Konsultasi dokter gigi", "Konsultasi", 150000, "klinik", "89.31"),
    P("002", "TND-01", "Scaling & polishing", "Tindakan", 350000, "klinik", "96.54"),
    P("003", "TND-02", "Tambalan komposit (per gigi)", "Tindakan", 300000, "klinik", "23.2"),
    P("004", "TND-03", "Cabut gigi permanen", "Tindakan", 250000, "klinik", "23.09"),
    P("005", "TND-04", "Cabut gigi sulung", "Tindakan", 150000, "klinik", "23.01"),
    P("006", "TND-05", "Perawatan saluran akar (per kunjungan)", "Tindakan", 600000, "klinik", "23.70"),
    P("007", "TND-06", "Rontgen periapikal", "Tindakan", 100000, "klinik", "87.12"),
    P("008", "TND-07", "Odontektomi", "Tindakan", 1500000, "klinik", "23.19"),
    P("011", "OBT-01", "Amoksisilin 500 mg (tablet)", "Obat", 2500, "farmasi"),
    P("012", "OBT-02", "Asam mefenamat 500 mg (tablet)", "Obat", 1500, "farmasi"),
    P("013", "OBT-03", "Parasetamol 500 mg (tablet)", "Obat", 1000, "farmasi"),
    P("014", "OBT-04", "Metronidazol 500 mg (tablet)", "Obat", 2000, "farmasi"),
    P("015", "OBT-05", "Ibuprofen 400 mg (tablet)", "Obat", 1500, "farmasi"),
    P("016", "OBT-06", "Klorheksidin 0,2% obat kumur 150 ml", "Obat", 45000, "farmasi"),
  ];
  const I = (n, code, name, unit, cost, min) => ({ id: `m${n}`, tenant_id: T2, code, name, unit, cost_per_unit: cost, min_qty: min, is_semi: false });
  const items = [
    I("011", "OBT-001", "Amoksisilin 500 mg", "tablet", 900, 100), I("012", "OBT-002", "Asam mefenamat 500 mg", "tablet", 500, 100),
    I("013", "OBT-003", "Parasetamol 500 mg", "tablet", 300, 100), I("014", "OBT-004", "Metronidazol 500 mg", "tablet", 700, 100),
    I("015", "OBT-005", "Ibuprofen 400 mg", "tablet", 500, 100), I("016", "OBT-006", "Klorheksidin 0,2% 150 ml", "botol", 22000, 5),
  ];
  const bom_lines = items.map((it, i) => ({ id: `blk${i}`, tenant_id: T2, product_id: `k0${it.id.slice(2)}`, parent_item_id: null, component_id: it.id, qty: 1, yield_qty: 1 }));
  const stock_levels = items.map((it) => ({ tenant_id: T2, branch_id: B3, item_id: it.id, qty: it.unit === "botol" ? 20 : 500 }));
  const stockVal = stock_levels.reduce((a, s) => a + s.qty * items.find((i) => i.id === s.item_id).cost_per_unit, 0);

  const v0 = Date.now() - 30 * DAY;
  const at = (ms) => new Date(v0 + ms).toISOString();
  const patients = [
    { id: "pa1", tenant_id: T2, mrn: "RM-000001", nik: "7371991204900001", name: "Andi Rahmat (demo)", birth_date: "1990-04-12", sex: "male", phone: "081100000201", address: null, allergies: "Penisilin (ruam kulit)", satusehat_ihs: null, created_at: at(-20 * MIN) },
    { id: "pa2", tenant_id: T2, mrn: "RM-000002", nik: "7371994308950002", name: "Nurul Aini (demo)", birth_date: "1995-08-03", sex: "female", phone: "081100000202", address: null, allergies: null, satusehat_ihs: null, created_at: at(-10 * DAY) },
  ];
  const visits = [{
    id: "vi1", tenant_id: T2, branch_id: B3, patient_id: "pa1", practitioner_id: null, queue_id: null, status: "closed",
    arrived_at: at(-20 * MIN), started_at: at(0), closed_at: at(35 * MIN),
    subjective: "Ngilu pada geraham kiri bawah saat minum dingin, 2 minggu.", objective: "Karies oklusal 36 mencapai dentin, tes dingin (+) singkat, perkusi (−).",
    assessment: "Karies dentin 36 (pulpitis reversibel).", plan: "Tambalan komposit 36. Kontrol 6 bulan.", vitals: {}, order_id: null,
  }];
  const O = (id, tooth, surfaces, condition, ms) => ({ id, tenant_id: T2, patient_id: "pa1", visit_id: "vi1", tooth, surfaces, condition, note: null, created_at: at(ms) });
  const odontogram_entries = [O("od1", 36, ["O"], "car", 0), O("od2", 36, ["O"], "cof", 30 * MIN), O("od3", 46, ["O", "D"], "amf", 0), O("od4", 18, [], "mis", 0), O("od5", 15, ["M"], "car", 0)];
  const visit_diagnoses = [{ id: "dx1", tenant_id: T2, visit_id: "vi1", system: "icd10", code: "K02.1", display: "Caries of dentine", is_primary: true, created_at: at(10 * MIN) }];
  const visit_procedures = [{ id: "px1", tenant_id: T2, visit_id: "vi1", system: "icd9cm", code: "23.2", display: "Restoration of tooth by filling", tooth: 36, product_id: "k003", qty: 1, created_at: at(20 * MIN) }];
  const prescriptions = [{ id: "rx1", tenant_id: T2, branch_id: B3, visit_id: "vi1", patient_name: "Andi Rahmat (demo)", practitioner_name: null, status: "cancelled", order_id: null, created_at: at(0), sent_at: at(35 * MIN), dispensed_at: null }];
  const Q = (id, no, name, phone, nik, complaint, minsAgo) => {
    const n = checkNik(nik);
    return { id, tenant_id: T2, branch_id: B3, kind: "clinic", queue_no: no, name, phone, nik, birth_date: n.birth, sex: n.sex, complaint, party_size: null, table_id: null,
      scheduled_at: ago(minsAgo * MIN), status: "waiting", patient_id: null, visit_id: null, practitioner_id: null, created_by: "u5", created_at: ago(minsAgo * MIN) };
  };
  const tonight = new Date(); tonight.setHours(19, 0, 0, 0);
  const queue_entries = [
    Q("q1", 1, "Budi Santoso (demo)", "081100000203", "7371992511870003", "Geraham kanan bawah sakit berdenyut sejak 3 hari, bengkak ringan.", 25),
    Q("q2", 2, "Nurul Aini (demo)", "081100000202", "7371994308950002", "Kontrol karang gigi.", 15),
    Q("q3", 3, "Fikri Ramadhan (demo)", "081100000204", "7371990906180005", "Gigi susu depan bawah goyang, gigi tetap sudah tumbuh di belakangnya.", 5),
    { id: "qr1", tenant_id: T1, branch_id: B1, kind: "table", queue_no: 1, name: "Keluarga Hasan (demo)", phone: "081100000301", nik: null, birth_date: null, sex: null, complaint: null,
      party_size: 5, table_id: "tb-b1-8", scheduled_at: tonight.toISOString(), status: "booked", patient_id: null, visit_id: null, practitioner_id: null, created_by: "u3", created_at: ago(DAY) },
  ];
  const customers = [
    { id: "cu1", tenant_id: T1, phone: "081100000301", name: "Hasan (demo)", points: 46, total_spent: 468500, visits: 9, last_visit_at: ago(3 * DAY), note: null, created_at: ago(90 * DAY) },
    { id: "cu2", tenant_id: T1, phone: "081100000302", name: "Mega (demo)", points: 12, total_spent: 124300, visits: 3, last_visit_at: ago(9 * DAY), note: null, created_at: ago(40 * DAY) },
    { id: "cu3", tenant_id: T1, phone: "081100000303", name: null, points: 3, total_spent: 38500, visits: 1, last_visit_at: ago(20 * DAY), note: null, created_at: ago(20 * DAY) },
  ];
  return {
    clinic: { products, items, bom_lines, stock_levels },
    tables: {
      patients, visits, odontogram_entries, visit_diagnoses, visit_procedures, prescriptions, prescription_items: [],
      satusehat_outbox: [], queue_entries, customers,
    },
    opening: { id: "je-t2-open", tenant_id: T2, branch_id: B3, entry_date: new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10), memo: "Saldo awal persediaan obat (setoran modal)", source: "financing", source_id: null,
      created_at: ago(20 * DAY), lines: [{ code: "1301", dr: Math.round(stockVal), cr: 0 }, { code: "3101", dr: 0, cr: Math.round(stockVal) }] },
  };
}

/** Lengkapi outbox riwayat setelah seed (butuh pembungkus FHIR). */
export function seedOutbox(db) {
  const v = db.visits.find((x) => x.id === "vi1");
  if (!v || db.satusehat_outbox.length) return;
  db.satusehat_outbox.push({ id: "ss1", tenant_id: T2, visit_id: "vi1", payload: bundleFor(db, v), status: "simulated", attempts: 1, encounter_id: "SIM-ENC-0001",
    response: { note: "Mode simulasi" }, error: null, created_at: v.closed_at, sent_at: v.closed_at });
}

function bundleFor(db, v) {
  const patient = db.patients.find((p) => p.id === v.patient_id);
  const practitioner = db.profiles.find((p) => p.id === v.practitioner_id) ?? { full_name: "drg. (riwayat)", nik: null };
  const branch = db.branches.find((b) => b.id === v.branch_id);
  const orgId = db.integrations?.find((i) => i.tenant_id === v.tenant_id)?.satusehat_org_id ?? null;
  const rx = db.prescriptions.find((r) => r.visit_id === v.id);
  return buildFhirBundle({
    visit: v, patient, practitioner, branch, orgId,
    diagnoses: db.visit_diagnoses.filter((d) => d.visit_id === v.id).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    procedures: db.visit_procedures.filter((p) => p.visit_id === v.id),
    rxItems: rx ? db.prescription_items.filter((i) => i.prescription_id === rx.id) : [],
  });
}

export const CLINIC_RULES = {
  customers: { f: [15] }, queue_entries: { f: [18], branch: true },
  patients: { f: [17], rme: true }, visits: { f: [17], branch: true, rme: true }, odontogram_entries: { f: [17], rme: true },
  visit_diagnoses: { f: [17], rme: true }, visit_procedures: { f: [17], rme: true }, satusehat_outbox: { f: [17], rme: true },
  prescriptions: { f: [17], branch: true }, prescription_items: { f: [17] },
};

export function createClinic(ctx) {
  const { db, user, emit, persist, audit, err, need, tenantOk, branchOk, branchGuard, id, nowIso } = ctx;
  const role = () => user()?.role;
  const scope = (f) => permOf(role(), f)?.scope ?? null;
  const done = (v, tables = []) => { persist(); tables.forEach(emit); return structuredClone(v); };
  const visitOpen = (vid) => db.visits.some((v) => v.id === vid && v.status === "in_progress");
  const rxDraft = (rid) => db.prescriptions.some((r) => r.id === rid && r.status === "draft");

  const queueBefore = (r) => {
    if (r.kind === "clinic") {
      const n = checkNik(r.nik);
      if (!n.ok) err(n.reason === "Tanggal lahir di NIK tidak valid" ? n.reason : "NIK tidak valid: harus 16 digit dengan kode provinsi dan tanggal lahir yang benar");
      r.birth_date ??= n.birth;
      r.sex ??= n.sex;
    }
    if (r.kind === "table" && !r.party_size) err("Jumlah tamu wajib diisi untuk reservasi meja");
    if (!r.name || r.name.trim().length < 2) err("Nama wajib diisi");
  };
  const tableSync = (r) => {
    if (r.kind !== "table" || !r.table_id) return;
    const t = db.tables.find((x) => x.id === r.table_id);
    if (!t) return;
    if (r.status === "booked" && t.status === "available") t.status = "reserved";
    if (["waiting", "cancelled", "no_show", "done"].includes(r.status) && t.status === "reserved") t.status = "available";
  };

  // Tulis tabel: [fitur, cek tambahan]
  const write = {
    insert: {
      queue_entries(r) {
        need(18, "c");
        if (!tenantOk(r.tenant_id) || !branchOk(r.branch_id)) err('new row violates row-level security policy for table "queue_entries"');
        r.kind ??= "clinic"; r.status ??= "waiting"; r.scheduled_at ??= nowIso();
        queueBefore(r);
        const day = r.scheduled_at.slice(0, 10);
        r.queue_no = 1 + Math.max(0, ...db.queue_entries.filter((q) => q.branch_id === r.branch_id && q.kind === r.kind && q.scheduled_at.slice(0, 10) === day).map((q) => q.queue_no ?? 0));
        r.created_by = user().id;
        db.queue_entries.unshift(r);
        tableSync(r);
        return ["queue_entries", "tables"];
      },
      customers(r) {
        need(15, "c");
        if (db.customers.some((c) => c.tenant_id === r.tenant_id && c.phone === r.phone)) err("Nomor sudah terdaftar");
        Object.assign(r, { points: r.points ?? 0, total_spent: 0, visits: 0 });
        db.customers.unshift(r);
        return ["customers"];
      },
      odontogram_entries(r) {
        need(17, "c");
        if (!visitOpen(r.visit_id)) err('new row violates row-level security policy for table "odontogram_entries"');
        if (!isValidTooth(r.tooth)) err("Nomor gigi bukan notasi FDI yang valid");
        if (!CONDITION[r.condition]) err("Kondisi tidak dikenal");
        r.surfaces ??= [];
        db.odontogram_entries.push(r);
        return ["odontogram_entries"];
      },
      visit_diagnoses(r) {
        need(17, "c");
        if (!visitOpen(r.visit_id)) err('new row violates row-level security policy for table "visit_diagnoses"');
        const c = ICD10.find((x) => x[0] === r.code);
        if (!c) err('insert or update on table "visit_diagnoses" violates foreign key constraint "visit_diagnoses_system_code_fkey"');
        if (db.visit_diagnoses.some((d) => d.visit_id === r.visit_id && d.code === r.code)) err("Diagnosis sudah ada");
        Object.assign(r, { system: "icd10", display: c[1], is_primary: r.is_primary ?? !db.visit_diagnoses.some((d) => d.visit_id === r.visit_id) });
        db.visit_diagnoses.push(r);
        return ["visit_diagnoses"];
      },
      visit_procedures(r) {
        need(17, "c");
        if (!visitOpen(r.visit_id)) err('new row violates row-level security policy for table "visit_procedures"');
        const c = ICD9CM.find((x) => x[0] === r.code);
        if (!c) err('insert or update on table "visit_procedures" violates foreign key constraint');
        Object.assign(r, { system: "icd9cm", display: c[1], qty: r.qty ?? 1 });
        db.visit_procedures.push(r);
        return ["visit_procedures"];
      },
      prescription_items(r) {
        need(17, "c");
        if (!rxDraft(r.prescription_id)) err('new row violates row-level security policy for table "prescription_items"');
        if (!(Number(r.qty) > 0)) err("Jumlah obat harus lebih dari 0");
        if (!r.signa?.trim()) err("Aturan pakai (signa) wajib diisi");
        db.prescription_items.push(r);
        return ["prescription_items"];
      },
    },
    update: {
      queue_entries(r, patch) {
        need(18, "u");
        if (!branchOk(r.branch_id)) err("Data tidak ditemukan");
        const next = { ...r, ...patch };
        queueBefore(next);
        Object.assign(r, patch);
        tableSync(r);
        return ["queue_entries", "tables"];
      },
      customers(r, patch) {
        need(15, "u");
        if (patch.points != null && patch.points !== r.points) err("Poin hanya berubah lewat transaksi lunas (bertambah) atau penukaran resmi (berkurang)");
        if ((patch.total_spent ?? r.total_spent) !== r.total_spent || (patch.visits ?? r.visits) !== r.visits) err("Total belanja & kunjungan diisi sistem");
        delete patch.phone;
        Object.assign(r, patch);
        return ["customers"];
      },
      patients(r, patch) { need(17, "u"); if (scope(17)) err("Data tidak ditemukan"); delete patch.nik; delete patch.mrn; Object.assign(r, patch); return ["patients"]; },
      visits(r, patch) {
        need(17, "u");
        if (scope(17) || r.status !== "in_progress") err("Kunjungan sudah ditutup; rekam medis terkunci");
        if (patch.status) err("Menutup kunjungan hanya lewat tombol Tutup kunjungan");
        Object.assign(r, patch);
        return ["visits"];
      },
      visit_diagnoses(r, patch) {
        need(17, "u");
        if (!visitOpen(r.visit_id)) err("Kunjungan sudah ditutup");
        if (patch.is_primary) db.visit_diagnoses.filter((d) => d.visit_id === r.visit_id).forEach((d) => (d.is_primary = false));
        Object.assign(r, patch);
        return ["visit_diagnoses"];
      },
      prescription_items(r, patch) { need(17, "u"); if (!rxDraft(r.prescription_id)) err("Resep sudah diterbitkan"); Object.assign(r, patch); return ["prescription_items"]; },
    },
    remove: {
      queue_entries(r) { need(18, "d"); db.queue_entries = db.queue_entries.filter((x) => x.id !== r.id); return ["queue_entries"]; },
      customers(r) { need(15, "d"); db.customers = db.customers.filter((x) => x.id !== r.id); return ["customers"]; },
      odontogram_entries(r) { need(17, "d"); if (!visitOpen(r.visit_id)) err("Kunjungan sudah ditutup"); db.odontogram_entries = db.odontogram_entries.filter((x) => x.id !== r.id); return ["odontogram_entries"]; },
      visit_diagnoses(r) { need(17, "d"); if (!visitOpen(r.visit_id)) err("Kunjungan sudah ditutup"); db.visit_diagnoses = db.visit_diagnoses.filter((x) => x.id !== r.id); return ["visit_diagnoses"]; },
      visit_procedures(r) { need(17, "d"); if (!visitOpen(r.visit_id)) err("Kunjungan sudah ditutup"); db.visit_procedures = db.visit_procedures.filter((x) => x.id !== r.id); return ["visit_procedures"]; },
      prescription_items(r) { need(17, "d"); if (!rxDraft(r.prescription_id)) err("Resep sudah diterbitkan"); db.prescription_items = db.prescription_items.filter((x) => x.id !== r.id); return ["prescription_items"]; },
    },
  };

  function simulateSend(ob) {
    // Edge Function satusehat-sync dalam mode simulasi: kirim asinkron ±1,5 detik setelah antre.
    setTimeout(() => {
      const row = db.satusehat_outbox.find((x) => x.id === ob.id);
      if (!row || row.status !== "queued") return;
      Object.assign(row, { status: "simulated", attempts: row.attempts + 1, encounter_id: `SIM-${Math.random().toString(16).slice(2, 10)}`,
        response: { note: "Mode simulasi: tidak ada data yang dikirim ke Kemenkes." }, sent_at: nowIso() });
      persist();
      emit("satusehat_outbox");
    }, 1500);
  }

  const RPC = {
    start_visit({ p_queue }) {
      need(17, "c");
      need(18, "u");
      const q = db.queue_entries.find((x) => x.id === p_queue);
      if (!q || !tenantOk(q.tenant_id) || !branchOk(q.branch_id)) err("Antrean tidak ditemukan");
      if (q.kind !== "clinic") err("Bukan antrean klinik");
      if (!["waiting", "called"].includes(q.status)) err(`Pasien berstatus ${q.status} tidak bisa diperiksa`);
      if (role() === "dokter" && db.visits.some((v) => v.practitioner_id === user().id && v.status === "in_progress")) err("Tutup dulu kunjungan yang sedang berjalan");
      let p = db.patients.find((x) => x.tenant_id === q.tenant_id && x.nik === q.nik);
      if (!p) {
        const seq = db.patients.filter((x) => x.tenant_id === q.tenant_id).length + 1;
        p = { id: id(), tenant_id: q.tenant_id, mrn: `RM-${String(seq).padStart(6, "0")}`, nik: q.nik, name: q.name, birth_date: q.birth_date, sex: q.sex, phone: q.phone,
          address: null, allergies: null, satusehat_ihs: null, created_by: user().id, created_at: nowIso() };
        db.patients.push(p);
        audit("insert", "patients", p.id, { mrn: p.mrn }, p.tenant_id);
      }
      const v = { id: id(), tenant_id: q.tenant_id, branch_id: q.branch_id, patient_id: p.id, practitioner_id: user().id, queue_id: q.id, status: "in_progress",
        arrived_at: q.created_at, started_at: nowIso(), closed_at: null, subjective: q.complaint?.trim() || null, objective: null, assessment: null, plan: null, vitals: {}, order_id: null };
      db.visits.unshift(v);
      db.prescriptions.unshift({ id: id(), tenant_id: q.tenant_id, branch_id: q.branch_id, visit_id: v.id, patient_name: p.name, practitioner_name: user().full_name,
        status: "draft", order_id: null, created_at: nowIso(), sent_at: null, dispensed_at: null });
      Object.assign(q, { status: "in_exam", patient_id: p.id, visit_id: v.id, practitioner_id: user().id });
      audit("insert", "visits", v.id, { patient: p.mrn }, v.tenant_id);
      return done(v, ["visits", "queue_entries", "patients", "prescriptions"]);
    },
    close_visit({ p_visit }) {
      need(17, "u");
      const v = db.visits.find((x) => x.id === p_visit);
      if (!v || !tenantOk(v.tenant_id) || !branchOk(v.branch_id)) err("Kunjungan tidak ditemukan");
      if (v.status !== "in_progress") err("Kunjungan sudah ditutup");
      if (role() === "dokter" && v.practitioner_id !== user().id) err("Hanya dokter pemeriksa yang bisa menutup kunjungan");
      if (!v.subjective?.trim() || !v.assessment?.trim()) err("Lengkapi SOAP minimal S (anamnesis) dan A (penilaian)");
      if (!db.visit_diagnoses.some((d) => d.visit_id === v.id)) err("Tambahkan minimal satu diagnosis ICD-10");
      const p = db.patients.find((x) => x.id === v.patient_id);
      const rx = db.prescriptions.find((r) => r.visit_id === v.id);
      const prod = (pid) => db.products.find((x) => x.id === pid && x.tenant_id === v.tenant_id);
      const d = new Date();
      const o = { id: id(), tenant_id: v.tenant_id, branch_id: v.branch_id, code: `INV-${d.toISOString().slice(2, 10).replaceAll("-", "")}-${d.toTimeString().slice(0, 8).replaceAll(":", "")}`,
        status: "open", channel: "clinic", table_id: null, table_label: null, customer_name: p.name, customer_phone: p.phone, practitioner_id: v.practitioner_id, visit_id: v.id,
        subtotal: 0, discount: 0, tax: 0, total: 0, cogs: 0, cashier_id: null, shift_id: null, created_at: nowIso(), paid_at: null };
      const lines = [];
      const add = (pr, qty) => {
        const ex = lines.find((l) => l.product_id === pr.id);
        if (ex) ex.qty += qty; else lines.push({ product_id: pr.id, name: pr.name, qty, price: pr.price, station: pr.station });
      };
      const kons = db.products.find((x) => x.tenant_id === v.tenant_id && x.sku === "KNS-01" && x.is_available);
      if (kons) add(kons, 1);
      for (const px of db.visit_procedures.filter((x) => x.visit_id === v.id && x.product_id)) { const pr = prod(px.product_id); if (pr) add(pr, px.qty); }
      let rxCount = 0;
      const rxLines = [];
      for (const it of db.prescription_items.filter((x) => x.prescription_id === rx?.id)) { const pr = prod(it.product_id); if (pr) { const e = rxLines.find((l) => l.pr.id === pr.id); e ? (e.q += Number(it.qty)) : rxLines.push({ pr, q: Number(it.qty) }); } }
      for (const l of rxLines) { add(l.pr, Math.ceil(l.q)); rxCount++; }
      for (const l of lines) db.order_items.push({ id: id(), tenant_id: v.tenant_id, branch_id: v.branch_id, order_id: o.id, ...l, note: null, kitchen_status: "served", created_at: nowIso() });
      o.subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
      const hasOrder = o.subtotal > 0;
      if (hasOrder) db.orders.unshift(o);
      if (rx) Object.assign(rx, { status: rxCount ? "sent" : "cancelled", sent_at: nowIso(), order_id: hasOrder ? o.id : null });
      Object.assign(v, { status: "closed", closed_at: nowIso(), order_id: hasOrder ? o.id : null });
      const q = db.queue_entries.find((x) => x.id === v.queue_id);
      if (q) q.status = "done";
      const ob = { id: id(), tenant_id: v.tenant_id, visit_id: v.id, payload: bundleFor(db, v), status: "queued", attempts: 0, encounter_id: null, response: null, error: null, created_at: nowIso(), sent_at: null };
      db.satusehat_outbox.unshift(ob);
      audit("update", "visits", v.id, { status: "closed" }, v.tenant_id);
      simulateSend(ob);
      return done({ visit_id: v.id, order_id: hasOrder ? o.id : null, order_code: hasOrder ? o.code : null, subtotal: o.subtotal, rx_items: rxCount, outbox_id: ob.id },
        ["visits", "queue_entries", "prescriptions", "orders", "satusehat_outbox"]);
    },
    retry_satusehat({ p_outbox }) {
      need(17, "u");
      const s = db.satusehat_outbox.find((x) => x.id === p_outbox && tenantOk(x.tenant_id) && x.status === "failed");
      if (!s) err("Hanya kiriman yang gagal yang bisa diulang");
      Object.assign(s, { status: "queued", error: null });
      simulateSend(s);
      return done(s, ["satusehat_outbox"]);
    },
    my_commission({ p_from, p_to }) {
      need(14, "r");
      const me = db.profiles.find((x) => x.id === user().id);
      const rate = me?.commission_rate ?? 0;
      let svc = 0; const ids = new Set();
      for (const o of db.orders.filter((o) => o.practitioner_id === user().id && o.status === "paid" && o.paid_at.slice(0, 10) >= p_from && o.paid_at.slice(0, 10) <= p_to)) {
        for (const i of db.order_items.filter((i) => i.order_id === o.id)) {
          const pr = db.products.find((p) => p.id === i.product_id);
          if (["Tindakan", "Konsultasi"].includes(pr?.category)) { svc += i.qty * i.price; ids.add(o.id); }
        }
      }
      return { rate, services: svc, orders: ids.size, commission: Math.round(svc * rate) };
    },
  };

  /** Komisi per profil untuk create_payroll_run (bulan periode). */
  function commissionFor(profileId, period) {
    const pf = db.profiles.find((x) => x.id === profileId);
    if (!pf?.commission_rate) return 0;
    const m = period.slice(0, 7);
    let svc = 0;
    for (const o of db.orders.filter((o) => o.practitioner_id === profileId && o.status === "paid" && o.paid_at.slice(0, 7) === m))
      for (const i of db.order_items.filter((i) => i.order_id === o.id))
        if (["Tindakan", "Konsultasi"].includes(db.products.find((p) => p.id === i.product_id)?.category)) svc += i.qty * i.price;
    return Math.round(svc * pf.commission_rate);
  }

  /** Efek tambahan pay_order: resep diserahkan + poin CRM + struk WhatsApp. */
  function afterPay(o, hermes, rp) {
    for (const r of db.prescriptions.filter((r) => r.order_id === o.id && r.status === "sent")) Object.assign(r, { status: "dispensed", dispensed_at: nowIso() });
    const phone = (o.customer_phone ?? "").replace(/[^\d+]/g, "") || null;
    o.customer_phone = phone;
    if (!phone) return;
    const pts = Math.floor(o.total / 10000);
    let c = db.customers.find((x) => x.tenant_id === o.tenant_id && x.phone === phone);
    if (!c) db.customers.unshift((c = { id: id(), tenant_id: o.tenant_id, phone, name: o.customer_name ?? null, points: 0, total_spent: 0, visits: 0, last_visit_at: null, note: null, created_at: nowIso() }));
    Object.assign(c, { points: c.points + pts, total_spent: c.total_spent + o.total, visits: c.visits + 1, last_visit_at: nowIso(), name: c.name ?? o.customer_name ?? null });
    hermes(o.tenant_id, "whatsapp", `Pelanggan ${phone.slice(0, 4)}••••${phone.slice(-3)}`, "receipt", `Struk ${o.code}: total ${rp(o.total)}. +${pts} poin Harum.in.`);
    emit("customers");
    emit("prescriptions");
  }

  return { write, RPC, commissionFor, afterPay, rmeHidden: () => Boolean(scope(17)), canRead: (f) => can(role(), f, "r") };
}
