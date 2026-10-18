// Tes kontrak RBAC: tanpa basis data. Jalankan: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MATRIX, ROLES, ALL_ROLES, MEMBER_ACCESS, memberLabel, parseLabel } from "../src/lib/rbac-matrix.js";
import { can } from "../src/lib/rbac.js";
import { PAGES } from "../src/app/pages.js";

const sql = readFileSync(new URL("../supabase/migrations/20261011000004_rbac_matrix.sql", import.meta.url), "utf8");

// (no, 'nama', 'peran', 'label', c, r, u, d, a, q, scope)
const ROW = /^\s*\((\d+), '((?:[^']|'')*)', '(\w+)', '((?:[^']|'')*)', (true|false), (true|false), (true|false), (true|false), (true|false), (true|false), (null|'[^']*')\)/;
const seed = new Map();
for (const line of sql.split("\n")) {
  const m = ROW.exec(line);
  if (m) seed.set(`${m[1]}:${m[3]}`, { name: m[2].replace(/''/g, "'"), label: m[4].replace(/''/g, "'"), flags: m.slice(5, 11).map((x) => x === "true"), scope: m[11] === "null" ? null : m[11].slice(1, -1) });
}

test("matriks: 20 fitur × 5 peran, semua label dikenali", () => {
  assert.equal(MATRIX.length, 20);
  for (const row of MATRIX) {
    assert.equal(row.length, 2 + ROLES.length, `fitur ${row[0]} harus punya ${ROLES.length} peran`);
    for (const label of row.slice(2)) assert.doesNotThrow(() => parseLabel(label));
  }
});

test("seed SQL (migrasi 4) identik dengan src/lib/rbac-matrix.js", () => {
  assert.equal(seed.size, MATRIX.length * ROLES.length, "jumlah baris seed");
  for (const row of MATRIX) {
    ROLES.forEach((role, ri) => {
      const s = seed.get(`${row[0]}:${role}`);
      assert.ok(s, `seed hilang: fitur ${row[0]} / ${role}`);
      const p = parseLabel(row[2 + ri]);
      assert.equal(s.name, row[1], `nama fitur ${row[0]}`);
      assert.equal(s.label, row[2 + ri], `label ${row[0]}/${role}`);
      assert.deepEqual(s.flags, [p.c, p.r, p.u, p.d, p.a, p.q], `aksi ${row[0]}/${role}`);
      assert.equal(s.scope, p.scope, `scope ${row[0]}/${role}`);
    });
  }
});

test("setiap halaman: gate berupa fungsi dan tidak melebihi izin matriks bagi peran tanpa akses", () => {
  for (const p of PAGES) assert.equal(typeof p.gate, "function", p.path);
  // Peran tanpa baca/buat apa pun pada suatu fitur tidak boleh melihat halaman yang digerbang fitur itu saja.
  assert.equal(can("staff", 1, "r"), false);
  assert.ok(!PAGES.filter((p) => p.platform).some((p) => p.gate("staff") || p.gate("dokter")), "halaman platform bukan untuk Staff/Dokter");
});

test("daftar halaman per peran sama dengan snapshot (ubah snapshot hanya dengan sengaja)", () => {
  const golden = JSON.parse(readFileSync(new URL("./fixtures/pages-by-role.json", import.meta.url), "utf8"));
  for (const r of ALL_ROLES) assert.deepEqual(PAGES.filter((p) => p.gate(r)).map((p) => p.path), golden[r], `halaman untuk ${r}`);
});

test("pages.js tidak membandingkan peran secara langsung (pakai is()/can()/permOf())", () => {
  const src = readFileSync(new URL("../src/app/pages.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\br\s*(===|!==)\s*"/);
});

test("Member (L5): seed SQL migrasi 21 identik dengan MEMBER_ACCESS, matriks asli tidak berubah", () => {
  const msql = readFileSync(new URL("../supabase/migrations/20261011000021_rbac_member_seed.sql", import.meta.url), "utf8");
  const rows = new Map();
  for (const line of msql.split("\n")) { const m = ROW.exec(line); if (m) rows.set(Number(m[1]), { label: m[4].replace(/''/g, "'"), flags: m.slice(5, 11).map((x) => x === "true"), scope: m[11] === "null" ? null : m[11].slice(1, -1) }); }
  assert.equal(rows.size, 20);
  for (const row of MATRIX) {
    const p = parseLabel(memberLabel(row[0]));
    const s = rows.get(row[0]);
    assert.ok(s, `fitur ${row[0]}`);
    assert.equal(s.label, memberLabel(row[0]));
    assert.deepEqual(s.flags, [p.c, p.r, p.u, p.d, p.a, p.q]);
    assert.equal(s.scope, p.scope);
  }
  assert.equal(ROLES.length, 5, "matriks asli tetap 5 peran");
  for (const f of Object.keys(MEMBER_ACCESS)) assert.ok(MATRIX.some((r) => r[0] === Number(f)), `fitur ${f} ada`);
});

test("Member tidak pernah menerima Approval, Request, atau akses Konfigurasi/Laporan/Keuangan", () => {
  for (const [f] of MATRIX) {
    const p = parseLabel(memberLabel(f));
    assert.equal(p.a || p.q, false, `fitur ${f}`);
  }
  for (const f of [1, 2, 4, 6, 9, 10, 11, 12, 13, 14, 16, 19, 20]) assert.equal(memberLabel(f), "-", `fitur ${f} harus "-"`);
});
