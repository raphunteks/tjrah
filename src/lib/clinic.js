// Konstanta klinik: odontogram FDI, validasi NIK, dan pembungkus FHIR (SATUSEHAT) untuk mode demo.
// Aturan yang sama ditegakkan di SQL (supabase/migrations/*_clinic.sql).

// ── Odontogram FDI ──
// Gigi permanen 11–48, gigi sulung 51–85. Baris atas = rahang atas, kiri layar = kanan pasien.
export const PERMANENT = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};
export const DECIDUOUS = {
  upper: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  lower: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};
export const ALL_TEETH = [...PERMANENT.upper, ...PERMANENT.lower, ...DECIDUOUS.upper, ...DECIDUOUS.lower];
export const isValidTooth = (n) => ALL_TEETH.includes(Number(n));
export const isUpper = (n) => [1, 2, 5, 6].includes(Math.floor(n / 10));
export const isAnterior = (n) => n % 10 <= 3;
export const isDeciduous = (n) => Math.floor(n / 10) >= 5;
/** Sisi kanan pasien (kuadran 1, 4, 5, 8) tampil di kiri layar → mesial menghadap ke kanan. */
export const mesialRight = (n) => [1, 4, 5, 8].includes(Math.floor(n / 10));

// Permukaan: M mesial, D distal, O oklusal (posterior) / I insisal (anterior), V vestibular (bukal/labial), L lingual/palatal.
export const SURFACES = { M: "Mesial", D: "Distal", O: "Oklusal", I: "Insisal", V: "Bukal/labial", L: "Lingual/palatal" };
export const centerSurface = (n) => (isAnterior(n) ? "I" : "O");

// Kondisi mengikuti singkatan odontogram yang lazim dipakai di Indonesia.
export const CONDITIONS = [
  { code: "car", label: "Karies", level: "surface", color: "var(--od-car)" },
  { code: "amf", label: "Tambalan amalgam", level: "surface", color: "var(--od-amf)" },
  { code: "cof", label: "Tambalan komposit", level: "surface", color: "var(--od-cof)" },
  { code: "fis", label: "Sealant fisura", level: "surface", color: "var(--od-fis)" },
  { code: "sou", label: "Sehat / dipulihkan", level: "surface", color: "transparent" },
  { code: "nvt", label: "Non-vital", level: "tooth" },
  { code: "rct", label: "Perawatan saluran akar", level: "tooth" },
  { code: "poc", label: "Mahkota", level: "tooth" },
  { code: "ipx", label: "Implan", level: "tooth" },
  { code: "prd", label: "Gigi tiruan lepasan", level: "tooth" },
  { code: "mis", label: "Hilang", level: "tooth" },
  { code: "rrx", label: "Sisa akar", level: "tooth" },
  { code: "cfr", label: "Fraktur", level: "tooth" },
  { code: "une", label: "Belum erupsi", level: "tooth" },
  { code: "pre", label: "Erupsi sebagian", level: "tooth" },
];
export const CONDITION = Object.fromEntries(CONDITIONS.map((c) => [c.code, c]));

/** Status terkini per gigi dari riwayat entri (entri terbaru menang per permukaan / per gigi). */
export function chartState(entries) {
  const state = {};
  const sorted = [...entries].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const e of sorted) {
    const t = (state[e.tooth] ??= { surfaces: {}, tooth: null });
    const c = CONDITION[e.condition];
    if (!c) continue;
    if (c.level === "tooth") t.tooth = e.condition;
    else for (const s of e.surfaces ?? []) t.surfaces[s] = e.condition === "sou" ? null : e.condition;
    if (e.condition === "sou" && !(e.surfaces ?? []).length) { t.tooth = null; t.surfaces = {}; }
  }
  return state;
}

// ── NIK (Nomor Induk Kependudukan) ──
// 16 digit: 6 kode wilayah, 6 tanggal lahir (DDMMYY, perempuan DD+40), 4 nomor urut.
export function checkNik(nik) {
  const s = String(nik ?? "").trim();
  if (!/^\d{16}$/.test(s)) return { ok: false, reason: "NIK harus 16 digit angka" };
  const prov = Number(s.slice(0, 2));
  if (prov < 11 || prov > 94) return { ok: false, reason: "Kode provinsi NIK tidak dikenal" };
  let dd = Number(s.slice(6, 8));
  const mm = Number(s.slice(8, 10));
  const yy = Number(s.slice(10, 12));
  const female = dd > 40;
  if (female) dd -= 40;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return { ok: false, reason: "Tanggal lahir di NIK tidak valid" };
  if (Number(s.slice(12)) === 0) return { ok: false, reason: "Nomor urut NIK tidak valid" };
  const nowYY = new Date().getFullYear() % 100;
  const year = yy > nowYY ? 1900 + yy : 2000 + yy;
  const birth = `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const dt = new Date(`${birth}T00:00:00Z`);
  if (dt.getUTCDate() !== dd || dt.getUTCMonth() + 1 !== mm) return { ok: false, reason: "Tanggal lahir di NIK tidak valid" };
  return { ok: true, sex: female ? "female" : "male", birth };
}

/** "Tidak ada", "-", "nihil" = sudah ditanyakan, tidak alergi. Kosong = belum ditanyakan. */
export const NO_ALLERGY = /^\s*(tidak ada|tidak|tak ada|nihil|none|no|-|—)\s*\.?\s*$/i;
export const allergyState = (a) => (!a?.trim() ? "unknown" : NO_ALLERGY.test(a) ? "none" : "yes");

export const SEX = { male: "Laki-laki", female: "Perempuan" };
export const ageFrom = (birth) => {
  if (!birth) return null;
  const b = new Date(birth), n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
};

// ── FHIR R4 Bundle (struktur sama dengan fungsi SQL public._fhir_bundle) ──
const ref = (kind, ihs, nik) => `${kind}/${ihs ?? (nik ? `NIK:${nik}` : "UNRESOLVED")}`;
export function buildFhirBundle({ visit, patient, practitioner, branch, orgId, diagnoses, procedures, rxItems }) {
  const enc = `urn:uuid:${visit.id}`; // URN UUID murni (id baris = UUID di database)
  const subject = { reference: ref("Patient", patient.satusehat_ihs, patient.nik), display: patient.name };
  const entry = [];
  entry.push({
    fullUrl: enc,
    resource: {
      resourceType: "Encounter",
      identifier: [{ system: `http://sys-ids.kemkes.go.id/encounter/${orgId ?? "ORG-BELUM-DIATUR"}`, value: visit.id }],
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
      subject,
      participant: [{
        type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "ATND", display: "attender" }] }],
        individual: { reference: ref("Practitioner", practitioner.satusehat_ihs, practitioner.nik), display: practitioner.full_name },
      }],
      period: { start: visit.started_at, end: visit.closed_at },
      location: [{ location: { reference: `Location/${branch.satusehat_location_id ?? "LOC-BELUM-DIATUR"}`, display: branch.name } }],
      diagnosis: diagnoses.map((d, i) => ({
        condition: { reference: `urn:uuid:${d.id}`, display: d.display },
        use: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/diagnosis-role", code: "DD", display: "Discharge diagnosis" }] },
        rank: i + 1,
      })),
      statusHistory: [
        { status: "arrived", period: { start: visit.arrived_at ?? visit.started_at, end: visit.started_at } },
        { status: "in-progress", period: { start: visit.started_at, end: visit.closed_at } },
        { status: "finished", period: { start: visit.closed_at, end: visit.closed_at } },
      ],
      serviceProvider: { reference: `Organization/${orgId ?? "ORG-BELUM-DIATUR"}` },
    },
    request: { method: "POST", url: "Encounter" },
  });
  for (const d of diagnoses) entry.push({
    fullUrl: `urn:uuid:${d.id}`,
    resource: {
      resourceType: "Condition",
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active", display: "Active" }] },
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "encounter-diagnosis", display: "Encounter Diagnosis" }] }],
      code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10", code: d.code, display: d.display }] },
      subject,
      encounter: { reference: enc },
    },
    request: { method: "POST", url: "Condition" },
  });
  for (const p of procedures) entry.push({
    fullUrl: `urn:uuid:${p.id}`,
    resource: {
      resourceType: "Procedure",
      status: "completed",
      code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-9-cm", code: p.code, display: p.display }] },
      subject,
      encounter: { reference: enc },
      performedPeriod: { start: visit.started_at, end: visit.closed_at },
      ...(p.tooth ? { bodySite: [{ text: `Gigi ${p.tooth} (FDI)` }] } : {}),
    },
    request: { method: "POST", url: "Procedure" },
  });
  for (const r of rxItems) entry.push({
    fullUrl: `urn:uuid:${r.id}`,
    resource: {
      resourceType: "MedicationRequest",
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: r.name },
      subject,
      encounter: { reference: enc },
      authoredOn: visit.closed_at,
      dosageInstruction: [{ text: `${r.signa}${r.days ? ` selama ${r.days} hari` : ""}` }],
      dispenseRequest: { quantity: { value: Number(r.qty) } },
    },
    request: { method: "POST", url: "MedicationRequest" },
  });
  return { resourceType: "Bundle", type: "transaction", entry };
}
