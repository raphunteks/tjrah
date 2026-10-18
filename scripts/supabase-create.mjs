// Membuat proyek Supabase BARU khusus Harum.in lewat Management API, memasang skema + data demo, membuat 7 akun demo,
// dan menyambungkan `npm run dev` ke proyek itu — satu perintah.
//
//   read -s "?Token Supabase (sbp_…): " T; echo; SUPABASE_ACCESS_TOKEN=$T npm run supabase:create
//
// Token pribadi dibuat di https://supabase.com/dashboard/account/tokens (hanya dipakai skrip ini, tidak disimpan).
// Opsi : --org=<slug>        wajib bila akun punya lebih dari satu organisasi
//        --region=<kode>     bawaan ap-southeast-1 (Singapura, terdekat dari Makassar)
//        --name=<nama>       bawaan harum-in
//        --force             tulis ulang .env.development.local yang sudah ada (JANGAN bila proyek lama masih dipakai)
//
// Yang ditulis: HANYA berkas baru .env.development.local (Vite memuatnya di atas .env.local). .env.local & .env.example tidak disentuh.
// Kata sandi demo diambil dari DEMO_PASSWORD di .env.local.
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { ROOT, OVERRIDE_FILE } from "./_env.mjs";

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? true]; }));
const API = (process.env.SUPABASE_MGMT_URL || "https://api.supabase.com").replace(/\/+$/, "");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const NAME = flags.name || "harum-in";
const REGION = flags.region || "ap-southeast-1";
const POLL_MS = Number(process.env.HARUMIN_POLL_MS || 5000);
const projectUrl = (ref) => (process.env.HARUMIN_PROJECT_URL_TEMPLATE || "https://{ref}.supabase.co").replace("{ref}", ref);

const say = (s = "") => console.log(s);
const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) die(`SUPABASE_ACCESS_TOKEN belum diisi.\n  1) Buat token: https://supabase.com/dashboard/account/tokens\n  2) Jalankan (token tidak tersimpan di berkas):\n     read -s "?Token (sbp_…): " T; echo; SUPABASE_ACCESS_TOKEN=$T npm run supabase:create`);
if (!/^sbp_/.test(TOKEN)) console.warn("⚠ Token biasanya diawali sbp_ — pastikan ini Personal Access Token, bukan anon/service_role key.");
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "";
if (DEMO_PASSWORD.length < 8) die("DEMO_PASSWORD di .env.local wajib ada, minimal 8 karakter (dipakai sebagai kata sandi 7 akun demo).");
if (existsSync(OVERRIDE_FILE) && !flags.force) die(`.env.development.local sudah ada — proyek sudah pernah dibuat.\n  Lanjutkan pemasangan di proyek itu dengan:  npm run setup:demo\n  Atau buat proyek lain dengan --force (berkas itu akan ditimpa).`);

async function api(method, p, body) {
  let res;
  try {
    res = await fetch(`${API}${p}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  } catch (e) { die(`Tidak bisa menghubungi ${API} (${e.cause?.code ?? e.message}). Periksa koneksi internet.`); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, text };
}
const msg = (r) => (r.data && typeof r.data === "object" ? r.data.message ?? r.data.error ?? JSON.stringify(r.data) : r.text) || `HTTP ${r.status}`;

// ── 1 · Organisasi ──
say("\n▶ Supabase Management API");
const orgs = await api("GET", "/v1/organizations");
if (orgs.status === 401) die("Token ditolak (401). Buat token baru di https://supabase.com/dashboard/account/tokens");
if (!orgs.ok) die(`Gagal membaca organisasi: ${orgs.status} ${msg(orgs)}`);
const list = Array.isArray(orgs.data) ? orgs.data : [];
if (!list.length) die("Akun ini belum punya organisasi di Supabase. Buat satu di https://supabase.com/dashboard lalu ulangi.");
let org = flags.org ? list.find((o) => o.slug === flags.org || o.id === flags.org) : list.length === 1 ? list[0] : null;
if (!org) die(`Ada ${list.length} organisasi — pilih dengan --org=<slug>:\n${list.map((o) => `   --org=${o.slug}   (${o.name})`).join("\n")}`);
say(`  ✓ Organisasi: ${org.name} (${org.slug})`);

// ── 2 · Buat proyek ──
const dbPass = randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 24).padEnd(24, "x");
const existing = await api("GET", "/v1/projects");
if (existing.ok && Array.isArray(existing.data) && existing.data.some((p) => p.name === NAME && p.status !== "REMOVED"))
  die(`Sudah ada proyek bernama "${NAME}" di akun ini. Pakai --name=<nama lain>, atau hapus/ganti nama proyek itu di Dashboard.`);
let created = await api("POST", "/v1/projects", { name: NAME, organization_slug: org.slug, db_pass: dbPass, region_selection: { type: "specific", code: REGION } });
if (!created.ok && created.status === 400) created = await api("POST", "/v1/projects", { name: NAME, organization_slug: org.slug, db_pass: dbPass, region: REGION, plan: "free" });
if (!created.ok) {
  const m = msg(created);
  if (/limit|maximum|quota|402|free project/i.test(`${created.status} ${m}`)) die(`Batas proyek gratis tercapai (${m}).\n  Jeda/hapus satu proyek yang tidak dipakai di Dashboard, lalu ulangi.`);
  die(`Gagal membuat proyek: ${created.status} ${m}`);
}
const ref = created.data.ref ?? created.data.id;
say(`  ✓ Proyek dibuat: ${ref} (${REGION}) — menunggu siap, biasanya 1–3 menit`);

// ── 3 · Tunggu aktif ──
let status = created.data.status;
for (let i = 0; i < 90 && status !== "ACTIVE_HEALTHY"; i++) {
  await sleep(POLL_MS);
  const g = await api("GET", `/v1/projects/${ref}`);
  if (g.ok) status = g.data.status;
  if (["INIT_FAILED", "REMOVED", "GOING_DOWN"].includes(status)) die(`Proyek gagal diinisialisasi (status ${status}). Cek Dashboard.`);
  if (i % 6 === 5) say(`    …status ${status}`);
}
if (status !== "ACTIVE_HEALTHY") die(`Proyek belum aktif setelah menunggu (status ${status}). Tunggu sebentar lalu jalankan:  npm run db:doctor  (proyek ${ref} sudah dibuat; jangan jalankan perintah ini lagi).`);
say("  ✓ Proyek aktif");

// ── 4 · Kunci API & koneksi database ──
const keys = await api("GET", `/v1/projects/${ref}/api-keys?reveal=true`);
if (!keys.ok) die(`Gagal membaca kunci API: ${keys.status} ${msg(keys)}\n  Proyek ${ref} sudah dibuat; salin kunci dari Dashboard → Project Settings → API.`);
const K = Array.isArray(keys.data) ? keys.data : [];
const pick = (name, prefix) => K.find((k) => k.name === name && k.api_key)?.api_key ?? K.find((k) => k.api_key?.startsWith(prefix))?.api_key;
const anon = pick("anon", "sb_publishable_") ?? K.find((k) => /^eyJ/.test(k.api_key ?? "") && /anon/.test(k.name ?? ""))?.api_key;
const service = pick("service_role", "sb_secret_");
if (!anon || !service) die(`Kunci anon/service_role tidak ditemukan di respons API (nama: ${K.map((k) => k.name).join(", ")}). Salin manual dari Dashboard.`);

let host, user = `postgres.${ref}`, port = 5432, dbname = "postgres";
const pool = await api("GET", `/v1/projects/${ref}/config/database/pooler`);
const pc = pool.ok && Array.isArray(pool.data) ? (pool.data.find((p) => p.database_type === "PRIMARY" && p.pool_mode === "session") ?? pool.data.find((p) => p.database_type === "PRIMARY") ?? pool.data[0]) : null;
if (pc?.db_host) {
  host = pc.db_host; user = pc.db_user ?? user; dbname = pc.db_name ?? dbname;
  port = /pooler\.supabase\.com$/.test(host) ? 5432 : pc.db_port ?? 5432; // Session pooler (IPv4) = 5432
} else { host = `db.${ref}.supabase.co`; user = "postgres"; say("  ⚠ Konfigurasi pooler tidak tersedia — memakai host direct (IPv6)."); }
const dbUrl = (p) => `postgresql://${user}:${dbPass}@${host}:${p}/${dbname}`;

// ── 5 · Tulis .env.development.local SEBELUM langkah berat, agar bisa dilanjutkan bila ada yang gagal ──
const env = `# Dibuat oleh scripts/supabase-create.mjs — proyek ${ref}. Dimuat Vite DI ATAS .env.local (.env.local tidak diubah).
# Hapus berkas ini untuk kembali ke proyek di .env.local.
VITE_SUPABASE_URL=${projectUrl(ref)}
VITE_SUPABASE_ANON_KEY=${anon}
NEXT_PUBLIC_SUPABASE_URL=${projectUrl(ref)}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
SUPABASE_URL=${projectUrl(ref)}
SUPABASE_SERVICE_ROLE_KEY=${service}
DATABASE_URL_DIRECT=${dbUrl(port)}
DATABASE_URL=${dbUrl(port === 5432 && /pooler/.test(host) ? 6543 : port)}
`;
writeFileSync(OVERRIDE_FILE, env, { mode: 0o600 });
try { chmodSync(OVERRIDE_FILE, 0o600); } catch { /* abaikan */ }
say(`  ✓ Menulis .env.development.local (izin 600) — .env.local tidak disentuh`);
Object.assign(process.env, Object.fromEntries(env.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])));

// ── 6 · Tunggu database menerima koneksi (pooler butuh ±1 menit setelah proyek aktif) ──
say("\n▶ Menunggu database menerima koneksi");
let up = false, lastErr = "";
for (let i = 0; i < 40 && !up; i++) {
  const m = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(.+)$/.exec(process.env.DATABASE_URL_DIRECT);
  const client = new pg.Client({ user: m[1], password: m[2], host: m[3], port: Number(m[4]), database: m[5], ssl: process.env.HARUMIN_DB_SSL === "off" ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  try { await client.connect(); await client.query("select 1"); up = true; } catch (e) { lastErr = e.code ?? e.message; await sleep(POLL_MS); } finally { await client.end().catch(() => {}); }
}
if (!up) die(`Database belum bisa dihubungi (${lastErr}). Tunggu 1–2 menit lalu jalankan:  npm run setup:demo  (proyek ${ref} dan .env.development.local sudah siap).`);
say("  ✓ Database siap");

// ── 7 · Skema + data demo, lalu 7 akun + verifikasi login ──
const run = (script, args = []) => spawnSync(process.execPath, [path.join(ROOT, "scripts", script), ...args], { stdio: "inherit", env: process.env, cwd: ROOT }).status;
if (run("db.mjs", ["setup"]) !== 0) die(`Pemasangan skema gagal. Perbaiki lalu jalankan:  npm run setup:demo   (proyek ${ref} sudah ada; jangan jalankan supabase:create lagi).`);
if (run("create-demo-users.mjs") !== 0) die("Pembuatan akun demo gagal. Jalankan:  npm run db:doctor  lalu  npm run demo:users");

say(`\n✓ Selesai. Proyek ${ref} siap dan terhubung.
  Jalankan:  npm run dev   (bila sudah berjalan, Vite me-restart sendiri) → http://localhost:5173/masuk
  Dashboard: https://supabase.com/dashboard/project/${ref}
  Edge Function (undangan, kunci meja, AI) belum dideploy — tidak dibutuhkan untuk login.
`);
