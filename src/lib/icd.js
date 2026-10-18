// Katalog kode ICD-10 (diagnosis) dan ICD-9-CM (tindakan) — SUBSET yang relevan untuk klinik gigi
// & praktik umum. Bukan katalog lengkap: untuk produksi, impor tabel resmi ke public.icd_codes
// (scripts/gen-seed.mjs menulis subset ini ke seed). `display` = nama resmi (Inggris), `id` = label Indonesia.
export const ICD10 = [
  ["K00.0", "Anodontia", "Anodonsia"],
  ["K00.6", "Disturbances in tooth eruption", "Gangguan erupsi gigi"],
  ["K01.1", "Impacted teeth", "Gigi impaksi"],
  ["K02.0", "Caries limited to enamel", "Karies terbatas email"],
  ["K02.1", "Caries of dentine", "Karies dentin"],
  ["K02.2", "Caries of cementum", "Karies sementum"],
  ["K02.3", "Arrested dental caries", "Karies terhenti"],
  ["K02.9", "Dental caries, unspecified", "Karies gigi, tidak spesifik"],
  ["K03.0", "Excessive attrition of teeth", "Atrisi gigi berlebih"],
  ["K03.1", "Abrasion of teeth", "Abrasi gigi"],
  ["K03.2", "Erosion of teeth", "Erosi gigi"],
  ["K03.6", "Deposits [accretions] on teeth", "Deposit/kalkulus pada gigi"],
  ["K04.0", "Pulpitis", "Pulpitis"],
  ["K04.1", "Necrosis of pulp", "Nekrosis pulpa"],
  ["K04.4", "Acute apical periodontitis of pulpal origin", "Periodontitis apikalis akut"],
  ["K04.5", "Chronic apical periodontitis", "Periodontitis apikalis kronis"],
  ["K04.6", "Periapical abscess with sinus", "Abses periapikal dengan sinus"],
  ["K04.7", "Periapical abscess without sinus", "Abses periapikal tanpa sinus"],
  ["K04.8", "Radicular cyst", "Kista radikular"],
  ["K05.0", "Acute gingivitis", "Gingivitis akut"],
  ["K05.1", "Chronic gingivitis", "Gingivitis kronis"],
  ["K05.2", "Acute periodontitis", "Periodontitis akut"],
  ["K05.3", "Chronic periodontitis", "Periodontitis kronis"],
  ["K06.0", "Gingival recession", "Resesi gingiva"],
  ["K06.1", "Gingival enlargement", "Pembesaran gingiva"],
  ["K07.3", "Anomalies of tooth position", "Anomali posisi gigi"],
  ["K07.6", "Temporomandibular joint disorders", "Gangguan sendi temporomandibular"],
  ["K08.1", "Loss of teeth due to accident, extraction or local periodontal disease", "Kehilangan gigi"],
  ["K08.3", "Retained dental root", "Sisa akar gigi"],
  ["K12.0", "Recurrent oral aphthae", "Stomatitis aftosa rekuren (sariawan)"],
  ["K12.1", "Other forms of stomatitis", "Stomatitis lain"],
  ["K13.0", "Diseases of lips", "Penyakit bibir"],
  ["S02.5", "Fracture of tooth", "Fraktur gigi"],
  ["Z01.2", "Dental examination", "Pemeriksaan gigi rutin"],
  ["J00", "Acute nasopharyngitis [common cold]", "Common cold"],
  ["J06.9", "Acute upper respiratory infection, unspecified", "ISPA, tidak spesifik"],
  ["I10", "Essential (primary) hypertension", "Hipertensi esensial"],
  ["E11.9", "Type 2 diabetes mellitus without complications", "Diabetes melitus tipe 2 tanpa komplikasi"],
  ["K30", "Functional dyspepsia", "Dispepsia fungsional"],
  ["R51", "Headache", "Sakit kepala"],
  ["A09.9", "Gastroenteritis and colitis of unspecified origin", "Gastroenteritis"],
  ["M54.5", "Low back pain", "Nyeri punggung bawah"],
  ["L70.0", "Acne vulgaris", "Akne vulgaris"],
  ["L81.1", "Chloasma", "Melasma"],
];

export const ICD9CM = [
  ["89.31", "Dental examination", "Pemeriksaan gigi"],
  ["89.7", "General physical examination", "Pemeriksaan fisik umum"],
  ["87.11", "Full-mouth x-ray of teeth", "Rontgen gigi seluruh rahang"],
  ["87.12", "Other dental x-ray", "Rontgen gigi (periapikal)"],
  ["96.54", "Dental scaling, polishing, and debridement", "Scaling & polishing"],
  ["23.01", "Extraction of deciduous tooth", "Cabut gigi sulung"],
  ["23.09", "Extraction of other tooth", "Cabut gigi permanen"],
  ["23.11", "Removal of residual root", "Pengambilan sisa akar"],
  ["23.19", "Other surgical extraction of tooth", "Odontektomi / cabut bedah"],
  ["23.2", "Restoration of tooth by filling", "Penambalan gigi"],
  ["23.3", "Restoration of tooth by inlay", "Inlay"],
  ["23.41", "Application of crown", "Pemasangan mahkota"],
  ["23.42", "Insertion of fixed bridge", "Gigi tiruan jembatan cekat"],
  ["23.43", "Insertion of removable bridge", "Gigi tiruan lepasan"],
  ["23.6", "Prosthetic dental implant", "Implan gigi"],
  ["23.70", "Root canal, not otherwise specified", "Perawatan saluran akar"],
  ["23.71", "Root canal therapy with irrigation", "PSA dengan irigasi"],
  ["23.73", "Apicoectomy", "Apikoektomi"],
  ["24.0", "Incision of gum or alveolar bone", "Insisi gusi / drainase abses"],
  ["24.7", "Application of orthodontic appliance", "Pemasangan alat ortodonti"],
  ["99.29", "Injection or infusion of other therapeutic or prophylactic substance", "Injeksi zat terapeutik"],
];

const norm = (s) => s.toLowerCase().normalize("NFKD");

/** Cari kode atau nama (Inggris/Indonesia). system: "icd10" | "icd9cm". */
export function searchIcd(system, q, limit = 12) {
  const list = system === "icd10" ? ICD10 : ICD9CM;
  const n = norm(q.trim());
  const rows = list.map(([code, display, label]) => ({ system, code, display, label }));
  if (!n) return rows.slice(0, limit);
  return rows
    .map((r) => ({ r, s: norm(r.code).startsWith(n) ? 0 : norm(r.label).includes(n) ? 1 : norm(r.display).includes(n) ? 2 : 9 }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.r.code.localeCompare(b.r.code))
    .slice(0, limit)
    .map((x) => x.r);
}

export const icdLabel = (system, code) => (system === "icd10" ? ICD10 : ICD9CM).find((x) => x[0] === code)?.[2] ?? null;
