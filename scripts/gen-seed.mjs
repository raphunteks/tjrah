// Generate: (1) migrasi rbac_matrix dari src/lib/rbac-matrix.js, (2) supabase/seed.sql
// (data demo + blueprint privat), (3) src/demo/blueprint.json untuk mode demo lokal.
// Jalankan: node scripts/gen-seed.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MATRIX, ROLES, MEMBER_ACCESS, memberLabel, parseLabel } from "../src/lib/rbac-matrix.js";
import * as bab1 from "../supabase/blueprint/bab1.js";
import * as bab2 from "../supabase/blueprint/bab2.js";
import * as bab3 from "../supabase/blueprint/bab3.js";
import * as bab4 from "../supabase/blueprint/bab4.js";
import * as bab5 from "../supabase/blueprint/bab5.js";
import { ICD10, ICD9CM } from "../src/lib/icd.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);

// 1 · RBAC
const rows = [];
for (const [no, name, ...labels] of MATRIX) {
  labels.forEach((label, i) => {
    const p = parseLabel(label);
    rows.push(`  (${no}, ${q(name)}, '${ROLES[i]}', ${q(label)}, ${p.c}, ${p.r}, ${p.u}, ${p.d}, ${p.a}, ${p.q}, ${q(p.scope)})`);
  });
}
writeFileSync(
  join(root, "supabase/migrations/20261011000004_rbac_matrix.sql"),
  `-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari src/lib/rbac-matrix.js — jangan edit manual.
-- Matriks RBAC VERSI ASLI dokumen (20 fitur × 5 peran = ${rows.length} baris).
truncate public.rbac_matrix;
insert into public.rbac_matrix (feature, feature_name, role, label, can_create, can_read, can_update, can_delete, can_approve, can_request, scope) values
${rows.join(",\n")};
`
);

// 1a · Peran Member (L5): baris tambahan, matriks asli tidak disentuh
const mrows = MATRIX.map(([no, name]) => {
  const label = memberLabel(no);
  const p = parseLabel(label);
  return `  (${no}, ${q(name)}, 'member', ${q(label)}, ${p.c}, ${p.r}, ${p.u}, ${p.d}, ${p.a}, ${p.q}, ${q(p.scope)})`;
});
writeFileSync(
  join(root, "supabase/migrations/20261011000021_rbac_member_seed.sql"),
  `-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari MEMBER_ACCESS di src/lib/rbac-matrix.js — jangan edit manual.
-- Peran Member (L5): ${mrows.length} baris tambahan. Matriks asli 20×5 (migrasi 4) tidak diubah.
insert into public.rbac_matrix (feature, feature_name, role, label, can_create, can_read, can_update, can_delete, can_approve, can_request, scope) values
${mrows.join(",\n")}
on conflict (feature, role) do update set label = excluded.label, can_create = excluded.can_create, can_read = excluded.can_read,
  can_update = excluded.can_update, can_delete = excluded.can_delete, can_approve = excluded.can_approve, can_request = excluded.can_request, scope = excluded.scope;
`
);

// 1b · Referensi ICD (subset) → migrasi data
const icd = [...ICD10.map((r) => ["icd10", ...r]), ...ICD9CM.map((r) => ["icd9cm", ...r])];
writeFileSync(
  join(root, "supabase/migrations/20261011000009_icd_codes.sql"),
  `-- AUTO-GENERATED oleh scripts/gen-seed.mjs dari src/lib/icd.js — jangan edit manual.
-- SUBSET ICD-10 & ICD-9-CM (${icd.length} kode). Untuk produksi, impor katalog resmi lengkap ke tabel ini.
insert into public.icd_codes (system, code, display, label_id) values
${icd.map(([s, c, d, l]) => `  (${q(s)}, ${q(c)}, ${q(d)}, ${q(l)})`).join(",\n")}
on conflict (system, code) do update set display = excluded.display, label_id = excluded.label_id;
`
);

// 2 · Blueprint (data murni, tanpa fungsi)
const pick = (mod) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(mod).filter(([, v]) => typeof v !== "function"))));
const doc = { bab1: pick(bab1), bab2: { MODULE_LIST: bab2.MODULE_LIST }, bab3: pick(bab3), bab4: { RBAC_ROLES: bab4.RBAC_ROLES, RBAC: bab4.RBAC, RBAC_LEGEND: bab4.RBAC_LEGEND }, bab5: pick(bab5) };
const json = JSON.stringify(doc);
mkdirSync(join(root, "src/demo"), { recursive: true });
writeFileSync(join(root, "src/demo/blueprint.json"), json);

// 3 · seed.sql
const demo = readFileSync(join(root, "scripts/seed-demo.sql"), "utf8") + "\n" + readFileSync(join(root, "scripts/seed-ops.sql"), "utf8") + "\n" + readFileSync(join(root, "scripts/seed-clinic.sql"), "utf8");
writeFileSync(
  join(root, "supabase/seed.sql"),
  `-- AUTO-GENERATED oleh scripts/gen-seed.mjs. Dijalankan otomatis oleh \`supabase db reset\`.
${demo}
-- ═══════════ BLUEPRINT PRIVAT (RLS: hanya Superadmin) ═══════════
insert into public.blueprint_docs (id, content) values ('harumin-v1', ${q(json)}::jsonb)
on conflict (id) do update set content = excluded.content, updated_at = now();
`
);
console.log(`icd: ${icd.length} · rbac rows: ${rows.length} · blueprint: ${(json.length / 1024).toFixed(1)} KB`);
