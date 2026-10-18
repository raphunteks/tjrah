// Runner database Harum.in — TANPA psql dan TANPA Supabase CLI. Hanya butuh Node 20+ dan paket `pg`.
//
//   npm run db:doctor    periksa koneksi, skema, seed, akun demo (hanya membaca, aman dijalankan kapan saja)
//   npm run db:migrate   pasang migrasi yang belum terpasang (tiap berkas = 1 transaksi; gagal = tidak ada yang berubah)
//   npm run db:seed      isi data demo (dilewati bila sudah ada)
//   npm run db:setup     migrate + seed
//   npm run db:audit     audit RLS akun demo × tabel (pengganti `psql -f rls_audit.sql`)
//   npm run db:reload    minta PostgREST memuat ulang skema (mengatasi "schema cache" basi)
//   npm run db:wipe -- --confirm=<ref-proyek>   HAPUS skema public (hanya untuk proyek khusus Harum.in)
//
// Pencatatan migrasi memakai tabel yang sama dengan Supabase CLI (supabase_migrations.schema_migrations),
// jadi `supabase db push` di kemudian hari tetap kompatibel. Kredensial dibaca dari .env.local
// (DATABASE_URL_DIRECT, lalu DATABASE_URL). Password database TIDAK PERNAH dicetak.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { OVERRIDE_ACTIVE } from "./_env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");
const SEED_FILE = path.join(ROOT, "supabase", "seed.sql");
const AUDIT_FILE = path.join(ROOT, "supabase", "tests", "rls_audit.sql");
const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const DEMO_EMAILS = ["superadmin", "owner", "gm", "staff", "dokter", "kasir.klinik", "owner.klinik"].map((x) => `${x}@demo.harum.in`);
// Migrasi terakhir menambahkan fungsi ini; bila ada, skema dianggap lengkap.
const LATEST_PROBE = "public.my_access_state()";

const [cmd = "help", ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));

const c = { ok: (s) => `  ✓ ${s}`, bad: (s) => `  ✗ ${s}`, warn: (s) => `  ⚠ ${s}`, info: (s) => `    ${s}` };
const say = (...a) => console.log(...a);
const die = (msg, code = 1) => { console.error(`\n✗ ${msg}\n`); process.exit(code); };

// ───────────────────────── koneksi ─────────────────────────
function parseUrl(raw) {
  // Regex (bukan new URL) agar password yang memuat @ # ? mentah tetap terbaca.
  const m = /^postgres(?:ql)?:\/\/([^:@/?#]+)(?::(.*))?@([^@/?#]+?)(?::(\d+))?(?:\/([^?]*))?(?:\?.*)?$/.exec(raw.trim());
  if (!m) return null;
  let password = m[2] ?? "";
  try { password = decodeURIComponent(password); } catch { /* password mentah */ }
  return { user: decodeURIComponent(m[1]), password, host: m[3], port: Number(m[4] || 5432), database: m[5] || "postgres" };
}
const isLocal = (h) => ["localhost", "127.0.0.1", "::1"].includes(h) || h.startsWith("/");
const hostKind = (h) => (/\.pooler\.supabase\.com$/.test(h) ? "pooler" : /^db\.[a-z0-9]+\.supabase\.co$/.test(h) ? "direct" : isLocal(h) ? "local" : "lain");
const projectRef = (cfg) => (cfg.user.startsWith("postgres.") ? cfg.user.slice(9) : /^db\.([a-z0-9]+)\.supabase\.co$/.exec(cfg.host)?.[1] ?? cfg.database);

function candidates() {
  const out = [];
  for (const k of ["DATABASE_URL_DIRECT", "DATABASE_URL"]) {
    const v = process.env[k];
    if (!v) continue;
    if (/\[YOUR-PASSWORD\]|x{6,}/i.test(v)) { out.push({ key: k, error: "masih berisi placeholder [YOUR-PASSWORD]" }); continue; }
    const cfg = parseUrl(v);
    out.push(cfg ? { key: k, cfg } : { key: k, error: "format bukan postgresql://user:password@host:port/db" });
  }
  return out;
}

const NET = new Set(["ENOTFOUND", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "EAI_AGAIN"]);
function explain(e, cfg) {
  const kind = cfg ? hostKind(cfg.host) : "lain";
  if (NET.has(e.code)) {
    return `Tidak bisa menjangkau ${cfg?.host}:${cfg?.port} (${e.code}).` +
      (kind === "direct" ? "\n    Host `db.<ref>.supabase.co` hanya IPv6; banyak jaringan rumah/kantor belum mendukungnya." : "") +
      "\n    Solusi: Dashboard Supabase → tombol Connect → **Session pooler** → salin URL-nya (…pooler.supabase.com:5432, user `postgres.<ref>`)\n    ke DATABASE_URL_DIRECT di .env.local, lalu ulangi.";
  }
  if (e.code === "28P01" || /password authentication failed/i.test(e.message)) return "Password database salah. Ini password DATABASE (bukan DEMO_PASSWORD). Reset: Dashboard → Project Settings → Database → Reset database password, lalu perbarui URL di .env.local.";
  if (/Tenant or user not found/i.test(e.message)) return "Pooler menolak user/region. Salin ulang URL Session pooler utuh dari Dashboard → Connect (user harus `postgres.<ref>`, bukan `postgres`).";
  if (/SSL|certificate/i.test(e.message)) return `Masalah SSL: ${e.message}`;
  return e.message;
}

async function connect() {
  const list = candidates();
  if (!list.length) die("DATABASE_URL_DIRECT / DATABASE_URL tidak ada di .env.local.\n  Isi dari Dashboard Supabase → Connect → Session pooler (ganti [YOUR-PASSWORD] dengan password database Anda).");
  let last;
  for (const cand of list) {
    if (cand.error) { last = new Error(`${cand.key}: ${cand.error}`); say(c.warn(`${cand.key}: ${cand.error}`)); continue; }
    const { cfg } = cand;
    const client = new pg.Client({ ...cfg, ssl: process.env.HARUMIN_DB_SSL === "off" || isLocal(cfg.host) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 12000, statement_timeout: 0 });
    client.on("error", () => {});
    try {
      await client.connect();
      client.cfg = cfg; client.cfgKey = cand.key;
      return client;
    } catch (e) {
      last = e; last.explained = explain(e, cfg);
      say(c.warn(`${cand.key} (${cfg.host}) gagal: ${e.code ?? e.message}`));
      try { await client.end(); } catch { /* abaikan */ }
      if (!NET.has(e.code)) break; // salah password dsb: jangan coba URL lain
    }
  }
  die(last?.explained ?? last?.message ?? "Tidak bisa terhubung ke database.");
}

// ───────────────────────── util SQL ─────────────────────────
const q = (db, sql, params) => db.query(sql, params);
const one = async (db, sql, params) => (await q(db, sql, params)).rows[0];
const lineAt = (text, pos) => (pos ? text.slice(0, Number(pos)).split("\n").length : null);

async function runFile(db, file, label) {
  const sql = readFileSync(file, "utf8");
  try {
    await q(db, "begin");
    await q(db, sql);
    return { sql };
  } catch (e) {
    try { await q(db, "rollback"); } catch { /* koneksi sudah putus */ }
    const ln = lineAt(sql, e.position);
    throw Object.assign(e, { where: `${label}${ln ? `, sekitar baris ${ln}` : ""}` });
  }
}
function reportSqlError(e) {
  say(c.bad(`Gagal di ${e.where ?? "SQL"}`));
  say(c.info(`Pesan : ${e.message}`));
  if (e.detail) say(c.info(`Detail: ${e.detail}`));
  if (e.hint) say(c.info(`Saran : ${e.hint}`));
  say(c.info("Transaksi dibatalkan: tidak ada perubahan dari berkas ini."));
}

async function ensureTracking(db) {
  await q(db, `create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`);
}
const localMigrations = () => readdirSync(MIG_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort().map((f) => ({ file: f, version: f.split("_")[0], name: f.replace(/^\d+_/, "").replace(/\.sql$/, "") }));
const appliedVersions = async (db) => new Set((await q(db, "select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version));
const reloadRest = (db) => q(db, "notify pgrst, 'reload schema'; notify pgrst, 'reload config';");

async function publicTables(db) {
  const { rows } = await q(db, "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1");
  const out = [];
  for (const { table_name } of rows) {
    const r = await one(db, `select count(*)::int n from public."${table_name.replace(/"/g, '""')}"`).catch(() => ({ n: "?" }));
    out.push({ name: table_name, rows: r.n });
  }
  return out;
}
async function schemaIsComplete(db) {
  const r = await one(db, `select to_regprocedure('${LATEST_PROBE}') is not null as fn,
      to_regclass('public.rbac_matrix') is not null as rbac,
      exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='branch_id') as branch`);
  if (!r.fn || !r.rbac || !r.branch) return false;
  const m = await one(db, "select count(*)::int n from public.rbac_matrix");
  return m.n >= 100;
}

// ───────────────────────── perintah ─────────────────────────
async function migrate(db) {
  say("\n▶ Migrasi");
  await ensureTracking(db);
  const files = localMigrations();
  let applied = await appliedVersions(db);

  if (applied.size === 0) {
    const tables = await publicTables(db);
    if (tables.length) {
      if (await schemaIsComplete(db)) {
        say(c.ok("Skema Harum.in sudah lengkap (dipasang manual lewat SQL Editor/CLI lain) → dicatat sebagai terpasang."));
        for (const f of files) await q(db, "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1,$2,$3) on conflict do nothing", [f.version, f.name, []]);
        await reloadRest(db);
        say(c.ok("Skema PostgREST dimuat ulang."));
        return { adopted: true };
      }
      say(c.bad("Skema `public` berisi tabel yang BUKAN milik Harum.in (atau pemasangan setengah jalan):"));
      for (const t of tables.slice(0, 25)) say(c.info(`${t.name.padEnd(32)} ${String(t.rows).padStart(7)} baris`));
      if (tables.length > 25) say(c.info(`… +${tables.length - 25} tabel lain`));
      const prof = (await q(db, "select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position")).rows.map((r) => r.column_name);
      if (prof.length) say(c.info(`Kolom profiles saat ini: ${prof.join(", ")}`));
      say("");
      say("  Migrasi DIBATALKAN — tidak ada yang diubah. Pilih salah satu:");
      say("   1) [Disarankan] Buat proyek Supabase BARU khusus Harum.in (gratis), isi ulang .env.local, jalankan `npm run setup:demo`.");
      say("      Proyek lama (mis. HARUMINS/Next.js) aman karena tidak disentuh.");
      say("   2) Bila proyek ini memang khusus Harum.in dan datanya boleh hilang: `npm run db:wipe -- --confirm=" + projectRef(db.cfg) + "` lalu `npm run db:setup`.");
      process.exit(2);
    }
  }

  const todo = files.filter((f) => !applied.has(f.version));
  if (!todo.length) { say(c.ok(`Semua ${files.length} migrasi sudah terpasang.`)); await reloadRest(db); return { applied: 0 }; }
  for (const f of todo) {
    const t0 = Date.now();
    try {
      await runFile(db, path.join(MIG_DIR, f.file), f.file);
      await q(db, "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1,$2,$3)", [f.version, f.name, []]);
      await q(db, "commit");
      say(c.ok(`${f.file}  (${Date.now() - t0} ms)`));
    } catch (e) {
      reportSqlError(e);
      die(`Berhenti di ${f.file}. Perbaiki lalu jalankan ulang \`npm run db:migrate\` — berkas sebelumnya tidak diulang.`);
    }
  }
  await reloadRest(db);
  say(c.ok(`${todo.length} migrasi terpasang. Skema PostgREST dimuat ulang.`));
  return { applied: todo.length };
}

async function seed(db) {
  say("\n▶ Data demo");
  const has = await one(db, "select to_regclass('public.tenants') is not null as t");
  if (!has.t) die("Tabel belum ada. Jalankan `npm run db:migrate` dulu.");
  const t1 = await one(db, "select count(*)::int n from public.tenants where id = $1", [T1]);
  if (t1.n) { say(c.ok("Data demo sudah ada — dilewati.")); return; }
  const other = await one(db, "select count(*)::int n from public.tenants");
  if (other.n) die(`Tabel tenants sudah berisi ${other.n} baris lain. Seed dibatalkan agar tidak bentrok dengan data Anda.`);
  try {
    await runFile(db, SEED_FILE, "supabase/seed.sql");
    await q(db, "commit");
  } catch (e) { reportSqlError(e); die("Seed gagal; tidak ada data yang tersimpan."); }
  const n = await one(db, "select (select count(*) from public.tenants)::int t, (select count(*) from public.branches)::int b, (select count(*) from public.products)::int p");
  say(c.ok(`Seed masuk: ${n.t} tenant, ${n.b} cabang, ${n.p} produk.`));
}

function prepareAudit(sql) {
  // Berkas audit ditulis untuk psql. Di sini meta-command diterjemahkan agar bisa dijalankan driver `pg`.
  return sql
    .replace(/^\\if[^\n]*\n[\s\S]*?^\\endif[^\n]*\n/m, "")
    .replace(/:emails\b/g, "'%@demo.harum.in'")
    .replace(/\s*\\g\s+\/dev\/null/g, ";")
    .replace(/^\\echo\s+'([^']*)'\s*$/gm, (_, t) => `select '${t.replace(/'/g, "''")}' as "—";`);
}
async function audit(db) {
  say("\n▶ Audit RLS (akun demo × tabel; semua dibatalkan oleh ROLLBACK)");
  const ok = await schemaIsComplete(db);
  if (!ok) die("Skema belum lengkap. Jalankan `npm run db:setup` dulu.");
  const acc = await one(db, "select count(*)::int n from public.profiles where email like '%@demo.harum.in'");
  if (!acc.n) die("Belum ada akun demo. Jalankan `npm run demo:users` dulu.");
  const notices = [];
  db.on("notice", (n) => notices.push(n.message));
  let res;
  try { res = await db.query(prepareAudit(readFileSync(AUDIT_FILE, "utf8"))); }
  catch (e) {
    try { await q(db, "rollback"); } catch { /* sudah putus */ }
    for (const m of notices) say(c.info(m));
    say(c.bad(e.message)); if (e.where) say(c.info(e.where));
    process.exit(1);
  }
  for (const r of [].concat(res)) {
    if (!r.fields?.length || !r.rows?.length) continue;
    if (r.fields[0].name === "set_config") continue;
    if (r.fields.length === 1 && r.fields[0].name === "—") { say(`\n${r.rows[0]["—"]}`); continue; }
    for (const row of r.rows) say(c.info(Object.values(row).join("  ")));
  }
  for (const m of notices) say(c.ok(m));
}

async function reload(db) { await reloadRest(db); say(c.ok("PostgREST diminta memuat ulang skema (butuh ±2 detik).")); }

async function wipe(db) {
  const ref = projectRef(db.cfg);
  if (flags.confirm !== ref) die(`Perintah ini MENGHAPUS seluruh skema public.\n  Ulangi dengan:  npm run db:wipe -- --confirm=${ref}`);
  const tables = await publicTables(db);
  const withData = tables.filter((t) => t.rows !== 0);
  if (withData.length && !flags["drop-data"]) {
    say(c.bad("Ada tabel berisi data — dibatalkan:"));
    for (const t of withData) say(c.info(`${t.name.padEnd(32)} ${t.rows} baris`));
    die("Jika memang boleh hilang, tambahkan --drop-data. Tidak ada yang diubah.");
  }
  say(`\n▶ Menghapus skema public (${tables.length} tabel) di proyek ${ref}`);
  await q(db, `begin;
    drop schema public cascade; create schema public;
    grant usage on schema public to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
    delete from supabase_migrations.schema_migrations where version like '20261011%';
    commit;`);
  await reloadRest(db);
  say(c.ok("Skema public kosong. Lanjut: npm run db:setup"));
}

async function doctor(db) {
  const cfg = db.cfg;
  say("\n▶ Diagnosis Harum.in");
  const v = await one(db, "select version() v, current_user u, current_database() d");
  say(c.ok(`Koneksi OK — ${db.cfgKey} → ${cfg.host}:${cfg.port} (${hostKind(cfg.host)}), proyek ${projectRef(cfg)}`));
  say(c.info(v.v.split(",")[0]));
  if (OVERRIDE_ACTIVE) say(c.info("Memakai .env.development.local (proyek hasil `npm run supabase:create`) di atas .env.local."));
  const problems = [];
  const todo = [];

  const tables = await publicTables(db);
  const names = new Set(tables.map((t) => t.name));
  const hasProfiles = names.has("profiles");
  const cols = hasProfiles ? (await q(db, "select column_name from information_schema.columns where table_schema='public' and table_name='profiles'")).rows.map((r) => r.column_name) : [];
  const tracked = await one(db, "select to_regclass('supabase_migrations.schema_migrations') is not null as t");
  const applied = tracked.t ? await appliedVersions(db) : new Set();
  const files = localMigrations();
  const pending = files.filter((f) => !applied.has(f.version));
  const complete = await schemaIsComplete(db).catch(() => false);

  say("\nSkema");
  if (!tables.length) { say(c.bad("Skema public kosong — migrasi belum pernah dijalankan.")); todo.push("npm run db:setup"); }
  else if (complete) {
    const m = await one(db, "select count(*)::int n from public.rbac_matrix");
    say(c.ok(`Skema Harum.in lengkap (${tables.length} tabel, rbac_matrix ${m.n} sel)`));
    if (pending.length) { say(c.warn(`${pending.length} migrasi belum tercatat (dipasang manual) → jalankan db:migrate agar tercatat`)); todo.push("npm run db:migrate"); }
    else say(c.ok(`${files.length}/${files.length} migrasi tercatat`));
    if (!cols.includes("branch_id")) problems.push("profiles.branch_id tidak ada");
  } else if (hasProfiles && cols.length && !cols.includes("branch_id")) {
    say(c.bad(`public.profiles ADA tetapi bukan skema Harum.in (kolom: ${cols.slice(0, 10).join(", ")}${cols.length > 10 ? "…" : ""})`));
    say(c.info(`${tables.length} tabel di public: ${tables.slice(0, 12).map((t) => t.name).join(", ")}${tables.length > 12 ? "…" : ""}`));
    say(c.info("Inilah penyebab error `Could not find the 'branch_id' column of 'profiles'`."));
    say(c.info("Kemungkinan besar proyek ini dipakai aplikasi lain (mis. HARUMINS). Jangan dijalankan di atasnya."));
    todo.push("Buat proyek Supabase BARU khusus Harum.in, perbarui .env.local, lalu `npm run setup:demo`  (atau db:wipe bila datanya boleh hilang)");
  } else {
    say(c.bad(`Skema tidak lengkap (${tables.length} tabel, ${applied.size}/${files.length} migrasi tercatat)`));
    todo.push("npm run db:migrate  (bila menolak karena tabel asing, ikuti petunjuk yang tampil)");
  }

  if (complete) {
    say("\nData demo");
    const t = await one(db, "select (select count(*) from public.tenants where id in ($1,$2))::int n, (select count(*) from public.branches)::int b", [T1, T2]);
    if (t.n === 2) say(c.ok(`Tenant demo ada (${t.b} cabang)`)); else { say(c.bad("Seed demo belum masuk")); todo.push("npm run db:seed"); }

    say("\nAkun demo");
    const au = await q(db, "select email, (encrypted_password is not null and encrypted_password <> '') as pw, email_confirmed_at is not null as conf from auth.users where email = any($1)", [DEMO_EMAILS]);
    const pr = await q(db, "select email, role, is_active from public.profiles where email = any($1)", [DEMO_EMAILS]);
    const A = new Map(au.rows.map((r) => [r.email, r])), P = new Map(pr.rows.map((r) => [r.email, r]));
    let missing = 0;
    for (const e of DEMO_EMAILS) {
      const a = A.get(e), p = P.get(e);
      const st = !a ? "belum ada di Auth" : !p ? "ada di Auth, PROFIL belum ada" : p.is_active === false ? "profil NONAKTIF" : !a.conf ? "email belum dikonfirmasi" : "siap";
      say(st === "siap" ? c.ok(`${e.padEnd(30)} ${p.role}`) : c.bad(`${e.padEnd(30)} ${st}`));
      if (st !== "siap") missing++;
    }
    if (missing) todo.push("npm run demo:users");
  }

  say("\nHasil");
  if (!todo.length && !problems.length) say(c.ok("Semua siap. Login di http://localhost:5173/masuk dengan email di atas + DEMO_PASSWORD dari .env.local."));
  else {
    for (const p of problems) say(c.bad(p));
    say("  Langkah berikutnya, berurutan:");
    todo.forEach((t, i) => say(`   ${i + 1}. ${t}`));
  }
  say("");
}

// ───────────────────────── main ─────────────────────────
const HELP = `Perintah: doctor | migrate | seed | setup | audit | reload | wipe
Contoh  : npm run db:doctor`;
if (!["doctor", "migrate", "seed", "setup", "audit", "reload", "wipe"].includes(cmd)) { say(HELP); process.exit(cmd === "help" ? 0 : 1); }

const db = await connect();
try {
  if (cmd === "doctor") await doctor(db);
  else if (cmd === "migrate") await migrate(db);
  else if (cmd === "seed") await seed(db);
  else if (cmd === "setup") {
    const r = await migrate(db);
    void r; await seed(db);
    say("\nLanjut: npm run demo:users   (membuat 7 akun demo di Supabase Auth + profil)\n");
  } else if (cmd === "audit") await audit(db);
  else if (cmd === "reload") await reload(db);
  else if (cmd === "wipe") await wipe(db);
} catch (e) {
  say(c.bad(e.where ? `${e.where}: ${e.message}` : e.message));
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
