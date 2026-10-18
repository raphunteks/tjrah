// Membuat 7 akun demo (satu per peran + kasir & owner klinik untuk Alur 4) di Supabase Auth + profilnya,
// lalu MEMBUKTIKAN bahwa tiap akun benar-benar bisa masuk (login → baca profil lewat RLS → status akses).
//
//   npm run demo:users            (membaca .env.local)
//   Urutan yang benar:  npm run db:setup  →  npm run demo:users      (atau sekaligus: npm run setup:demo)
//
// Idempoten: dijalankan ulang akan MENYAMAKAN kata sandi semua akun demo dengan DEMO_PASSWORD saat ini
// (inilah penyebab "tidak bisa login" bila DEMO_PASSWORD pernah diubah) dan mengaktifkan kembali profilnya.
// Service role key hanya dipakai di mesin lokal Anda — jangan pernah taruh di frontend atau commit.
import "./_env.mjs";
const real = (v) => (v && !/x{6,}|\.\.\.$/i.test(v) ? v : "");
const URL_ = (real(process.env.SUPABASE_URL) || real(process.env.NEXT_PUBLIC_SUPABASE_URL) || real(process.env.VITE_SUPABASE_URL)).replace(/\/+$/, "");
const KEY = real(process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANON = real(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || real(process.env.VITE_SUPABASE_ANON_KEY);
const PASSWORD = process.env.DEMO_PASSWORD ?? "";

const die = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };
const jwt = (t) => { try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()); } catch { return null; } };

// ── 1 · Pemeriksaan konfigurasi ──
if (!URL_ || !KEY) die("SUPABASE_URL (atau NEXT_PUBLIC_SUPABASE_URL) dan SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local.");
if (PASSWORD.length < 8) die(`DEMO_PASSWORD wajib diisi, minimal 8 karakter (sekarang ${PASSWORD.length}).`);
const refOf = (u) => /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(u)?.[1];
const sk = jwt(KEY), ak = ANON ? jwt(ANON) : null;
if (sk && sk.role !== "service_role") die(`SUPABASE_SERVICE_ROLE_KEY berisi kunci peran "${sk.role}", bukan service_role. Ambil dari Dashboard → Project Settings → API → service_role (secret).`);
if (ak && ak.role === "service_role") die("Kunci anon (NEXT_PUBLIC_/VITE_SUPABASE_ANON_KEY) berisi kunci service_role — itu rahasia dan tidak boleh ada di sisi browser. Ganti dengan kunci anon/public.");
const ref = refOf(URL_);
for (const [n, k] of [["SUPABASE_SERVICE_ROLE_KEY", sk], ["kunci anon", ak]]) {
  if (k?.ref && ref && k.ref !== ref) die(`${n} milik proyek "${k.ref}", tetapi URL menunjuk proyek "${ref}". URL dan kunci harus dari proyek yang sama.`);
}
if (PASSWORD.length < 12) console.warn(`⚠ DEMO_PASSWORD hanya ${PASSWORD.length} karakter — cukup untuk demo, tetapi jangan dipakai di proyek produksi.`);

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const USERS = [
  { email: "superadmin@demo.harum.in", role: "superadmin", full_name: "Superadmin Demo", tenant_id: null, branch_id: null },
  { email: "owner@demo.harum.in", role: "owner", full_name: "Owner Demo", tenant_id: T1, branch_id: null },
  { email: "gm@demo.harum.in", role: "gm", full_name: "GM Demo", tenant_id: T1, branch_id: null, pin: "246810" },
  { email: "staff@demo.harum.in", role: "staff", full_name: "Staff Demo", tenant_id: T1, branch_id: "00000000-0000-0000-0000-0000000000b1" },
  { email: "dokter@demo.harum.in", role: "dokter", full_name: "drg. Demo", tenant_id: T2, branch_id: "00000000-0000-0000-0000-0000000000b3",
    extra: { commission_rate: 0.3, nik: "7371990101800009" } },
  { email: "kasir.klinik@demo.harum.in", role: "staff", full_name: "Kasir Klinik Demo", tenant_id: T2, branch_id: "00000000-0000-0000-0000-0000000000b3" },
  { email: "owner.klinik@demo.harum.in", role: "owner", full_name: "Owner Klinik Demo", tenant_id: T2, branch_id: null },
  { email: "member@demo.harum.in", role: "member", full_name: "Hasan (Member Demo)", tenant_id: T1, branch_id: null, customer_phone: process.env.DEMO_MEMBER_PHONE || process.env.HERMES_DEFAULT_PHONE || "081234567890" },
];

// ── 2 · HTTP ──
const svc = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function http(path, { method = "GET", headers = svc, body } = {}) {
  let res;
  try {
    res = await fetch(`${URL_}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  } catch (e) {
    die(`Tidak bisa menghubungi ${URL_} (${e.cause?.code ?? e.message}). Periksa koneksi internet dan URL proyek.`);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, text };
}
const errText = (r) => (r.data && typeof r.data === "object" ? r.data.message ?? r.data.msg ?? r.data.error_description ?? r.data.error ?? r.text : r.text) || `HTTP ${r.status}`;
const must = (r, what) => { if (!r.ok) die(`${what} → ${r.status} ${errText(r)}`); return r.data; };

// ── 3 · Pra-syarat: skema & seed harus sudah ada ──
const SETUP_HINT = "Jalankan dulu:  npm run db:doctor   (diagnosis)   lalu   npm run db:setup   (migrasi + data demo).";
{
  const t = await http(`/rest/v1/tenants?id=in.(${T1},${T2})&select=id`);
  if (!t.ok) {
    const m = errText(t);
    if (t.status === 404 || /PGRST205|42P01|schema cache|does not exist/i.test(`${t.text} ${m}`)) die(`Tabel Harum.in belum ada di proyek ini (${m}).\n  ${SETUP_HINT}`);
    if (t.status === 401 || t.status === 403) die(`Supabase menolak service role key (${t.status} ${m}). Salin ulang kunci service_role dari Dashboard → Project Settings → API.`);
    die(`Pemeriksaan tabel tenants gagal: ${t.status} ${m}\n  ${SETUP_HINT}`);
  }
  if (t.data.length < 2) die(`Data demo (tenant & cabang) belum ada — profil akun butuh tenant ini.\n  Jalankan:  npm run db:seed   (atau  npm run db:setup)`);
  const p = await http("/rest/v1/profiles?select=branch_id,is_active,last_login_at&limit=0");
  if (!p.ok) die(`Skema profiles belum lengkap (${errText(p)}).\n  Bila pesannya menyebut "schema cache": jalankan  npm run db:reload.\n  Bila kolom memang tidak ada: ${SETUP_HINT}`);
}

// ── 4 · Buat / samakan akun ──
async function findUserId(email) {
  for (let page = 1; page <= 20; page++) {
    const r = must(await http(`/auth/v1/admin/users?page=${page}&per_page=200`), "Daftar pengguna Auth");
    const hit = (r.users ?? []).find((x) => x.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (!r.users?.length || r.users.length < 200) break;
  }
  return null;
}

console.log(`\nProyek ${ref ?? URL_} — menyiapkan ${USERS.length} akun demo\n`);
const made = [];
for (const u of USERS) {
  let id, state;
  const c = await http("/auth/v1/admin/users", { method: "POST", body: { email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: u.full_name } } });
  if (c.ok) { id = c.data.id; state = "dibuat"; }
  else if (c.status === 422 || /already|registered|exists/i.test(errText(c))) {
    id = await findUserId(u.email);
    if (!id) die(`${u.email}: Supabase bilang sudah terdaftar tetapi tidak ditemukan di daftar Auth.`);
    must(await http(`/auth/v1/admin/users/${id}`, { method: "PUT", body: { password: PASSWORD, email_confirm: true, ban_duration: "none" } }), `${u.email}: menyamakan kata sandi`);
    state = "diperbarui";
  } else die(`${u.email}: pembuatan akun Auth gagal → ${c.status} ${errText(c)}`);

  const extra = { ...(u.extra ?? {}) };
  if (u.role === "member" && u.customer_phone) {
    const cust = await http(`/rest/v1/customers?tenant_id=eq.${u.tenant_id}&phone=eq.${u.customer_phone}&select=id`);
    if (cust.ok && cust.data?.[0]?.id) extra.customer_id = cust.data[0].id;
  }

  must(await http("/rest/v1/profiles?on_conflict=id", {
    method: "POST", headers: { ...svc, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: { id, email: u.email, role: u.role, full_name: u.full_name, tenant_id: u.tenant_id, branch_id: u.branch_id,
      is_active: true, deactivated_at: null, deactivated_by: null, deactivation_reason: null, ...extra },
  }), `${u.email}: menyimpan profil`);
  if (u.pin) must(await http("/rest/v1/rpc/admin_set_pin", { method: "POST", body: { p_user: id, p_pin: u.pin } }), `${u.email}: mengatur PIN`);
  made.push({ ...u, id, state });
  console.log(`  ✓ ${u.role.padEnd(10)} ${u.email.padEnd(30)} ${state}${u.pin ? `   PIN void: ${u.pin}` : ""}`);
}

// ── 5 · Bukti: login sungguhan → profil terbaca lewat RLS → status akses ──
console.log("");
if (!ANON) {
  console.warn("⚠ Kunci anon tidak ditemukan di .env.local → verifikasi login dilewati. (Isi NEXT_PUBLIC_SUPABASE_ANON_KEY atau VITE_SUPABASE_ANON_KEY.)");
} else {
  console.log("Verifikasi login (memakai kunci anon, persis seperti browser):");
  let bad = 0;
  for (const u of made) {
    const anon = { apikey: ANON, "Content-Type": "application/json" };
    const s = await http("/auth/v1/token?grant_type=password", { method: "POST", headers: anon, body: { email: u.email, password: PASSWORD } });
    if (!s.ok) { bad++; console.log(`  ✗ ${u.email.padEnd(30)} login ditolak: ${errText(s)}`); continue; }
    const auth = { ...anon, Authorization: `Bearer ${s.data.access_token}` };
    const p = await http(`/rest/v1/profiles?id=eq.${u.id}&select=role,tenant_id,is_active`, { headers: auth });
    const row = p.ok && Array.isArray(p.data) ? p.data[0] : null;
    if (!row) { bad++; console.log(`  ✗ ${u.email.padEnd(30)} login OK, tetapi profil TIDAK terbaca oleh RLS (${p.ok ? "0 baris" : errText(p)})`); continue; }
    if (row.role !== u.role) { bad++; console.log(`  ✗ ${u.email.padEnd(30)} peran di database "${row.role}", seharusnya "${u.role}"`); continue; }
    const a = await http("/rest/v1/rpc/my_access_state", { method: "POST", headers: auth, body: {} });
    const st = a.ok ? a.data : null;
    if (!a.ok || st?.ok === false) { bad++; console.log(`  ✗ ${u.email.padEnd(30)} akses ditolak: ${a.ok ? st.reason : errText(a)}`); continue; }
    console.log(`  ✓ ${u.email.padEnd(30)} login ✓  profil ✓  akses ✓`);
  }
  if (bad) die(`${bad} akun gagal verifikasi. Jalankan  npm run db:doctor  untuk melihat penyebabnya.`);
}

console.log(`
Siap. Masuk di http://localhost:5173/masuk
  Email     : salah satu email di atas
  Kata sandi: isi DEMO_PASSWORD di .env.local (${PASSWORD.length} karakter) — sama untuk semua akun demo
  PIN GM    : 246810 (untuk approval void / otorisasi)
`);
