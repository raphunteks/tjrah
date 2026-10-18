// Adapter DEMO: meniru skema & RLS Supabase di memori browser, untuk mencoba dashboard
// tanpa kredensial. Hanya dimuat saat `npm run dev` tanpa .env (atau VITE_ALLOW_DEMO=1).
// Semua angka di sini adalah DATA DEMO.
import { createMemberAuth } from "./demoMember.js";
import { can, permOf } from "../lib/rbac.js";
import { iso, addDays } from "../lib/format.js";
import { seedOps, createOps } from "./demoOps.js";
import { seedOutbox } from "./demoClinic.js";
import { seedAccess, seedRoster } from "./demoAccess.js";
import { seedSdm } from "./demoSdm.js";
import { searchIcd } from "../lib/icd.js";

const T1 = "t1", T2 = "t2", T3 = "t3", T4 = "t4";
const B1 = "b1", B2 = "b2", B3 = "b3";
const STORE_KEY = "harumin-demo-v6"; // v6: paket resmi (Starter 500k, Growth 2.5jt 6 bln 12 Okt 2026 - 12 Apr 2027, Enterprise 3.5jt)
const SESSION_KEY = "harumin-demo-session";

export const DEMO_USERS = [
  { id: "u0", email: "superadmin@demo.harum.in", role: "superadmin", full_name: "Superadmin Demo", tenant_id: null, branch_id: null },
  { id: "u1", email: "owner@demo.harum.in", role: "owner", full_name: "Owner Demo", tenant_id: T1, branch_id: null },
  { id: "u2", email: "gm@demo.harum.in", role: "gm", full_name: "GM Demo", tenant_id: T1, branch_id: null, pin: "246810" },
  { id: "u3", email: "staff@demo.harum.in", role: "staff", full_name: "Staff Demo", tenant_id: T1, branch_id: B1 },
  { id: "u4", email: "dokter@demo.harum.in", role: "dokter", full_name: "drg. Demo", tenant_id: T2, branch_id: B3, commission_rate: 0.3, nik: "7371990101800009" },
  { id: "u5", email: "kasir.klinik@demo.harum.in", role: "staff", full_name: "Kasir Klinik Demo", tenant_id: T2, branch_id: B3, label: "Kasir klinik" },
  { id: "u6", email: "owner.klinik@demo.harum.in", role: "owner", full_name: "Owner Klinik Demo", tenant_id: T2, branch_id: null, label: "Owner klinik" },
  // Member (L5): terikat ke satu Pelanggan (cu1/cu2 di data demo). Masuk lewat Kode Masuk di dunia nyata; di demo cukup pilih akun.
  { id: "um1", email: "member@demo.harum.in", role: "member", full_name: "Hasan (demo)", tenant_id: T1, branch_id: null, customer_id: "cu1", label: "Member" },
  { id: "um2", email: "member2@demo.harum.in", role: "member", full_name: "Mega (demo)", tenant_id: T1, branch_id: null, customer_id: "cu2", label: "Member 2" },
];

// ── RNG deterministik ──
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const today = new Date();
const ago = (n) => iso(addDays(today, -n));

function seed() {
  return {
    plans: [
      { id: "p1", code: "starter", name: "Starter (1 Bulan)", price_month: 500000, price_total: 500000, duration_months: 1, max_branches: 1, max_cashiers: 3, ai_queries_month: 0, modules: ["M1", "M2", "M3", "M6"], is_active: true },
      { id: "p2", code: "growth", name: "Growth (6 Bulan)", price_month: 416666, price_total: 2500000, duration_months: 6, max_branches: 5, max_cashiers: 15, ai_queries_month: 250, modules: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"], is_active: true },
      { id: "p3", code: "enterprise", name: "Enterprise (1 Tahun)", price_month: 291666, price_total: 3500000, duration_months: 12, max_branches: 99, max_cashiers: null, ai_queries_month: null, modules: ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"], is_active: true },
    ],
    tenants: [
      { id: T1, name: "Kopi Harum Makassar", slug: "kopi-harum", pillar: "fnb", tax_label: "PBJT", tax_rate: 0.1, status: "active", plan_id: "p2", current_period_end: "2027-04-12", owner_email: "owner@demo.harum.in", created_at: "2026-10-12" },
      { id: T2, name: "Klinik Gigi Senyum", slug: "klinik-senyum", pillar: "health", tax_label: "Tanpa pajak", tax_rate: 0, status: "trial", plan_id: "p3", current_period_end: "2027-10-12", owner_email: "drg@klinik-senyum.test", created_at: ago(20) },
      { id: T3, name: "Toko Bangunan Jaya", slug: "tb-jaya", pillar: "retail", tax_label: "PPN", tax_rate: 0.11, status: "past_due", plan_id: "p1", current_period_end: ago(4), owner_email: "admin@tbjaya.test", created_at: ago(120) },
      { id: T4, name: "Salon Ayu", slug: "salon-ayu", pillar: "service", tax_label: "Pajak", tax_rate: 0, status: "suspended", plan_id: "p1", current_period_end: ago(40), owner_email: "ayu@salon.test", created_at: ago(300) },
    ],
    invoices: [
      { id: "i1", tenant_id: T1, period: "2026-10-12", period_end: "2027-04-12", amount: 2500000, plan_name: "Growth (6 Bulan)", status: "paid" },
      { id: "i2", tenant_id: T3, period: "2026-10-12", period_end: "2026-11-12", amount: 500000, plan_name: "Starter (1 Bulan)", status: "unpaid" },
      { id: "i3", tenant_id: T4, period: ago(40), period_end: ago(10), amount: 500000, plan_name: "Starter (1 Bulan)", status: "unpaid" },
    ],
    branches: [
      { id: "b0", tenant_id: T1, name: "Gudang Pusat", city: "Makassar", address: "Jl. Perintis Kemerdekaan KM 10", lat: -5.13, lng: 119.49, geofence_m: 50, is_warehouse: true },
      { id: B1, tenant_id: T1, name: "Cabang Pettarani", city: "Makassar", address: "Jl. Andi Tonro No. 15", lat: -5.171306, lng: 119.417312, geofence_m: 50, is_warehouse: false },
      { id: B2, tenant_id: T1, name: "Cabang Panakkukang", city: "Makassar", address: "Jl. Boulevard No. 12", lat: -5.153610, lng: 119.436406, geofence_m: 50, is_warehouse: false },
      { id: B3, tenant_id: T2, name: "Klinik Utama", city: "Makassar", address: "Jl. Sam Ratulangi No. 40", lat: -5.146, lng: 119.415, geofence_m: 50, is_warehouse: false },
    ],
    settings: {
      ai_gateway: { base_url: "http://127.0.0.1:20128/v1", default_model: "auto", fallback_chain: ["claude", "gemini", "openai", "deepseek"], timeout_ms: 20000, secret_name: "NINEROUTER_API_KEY" },
      hermes: { webhook_url_secret: "HERMES_WEBHOOK_URL", token_secret: "HERMES_TOKEN", z_report_hour: 23, low_stock_alert: true },
    },
    integrations: [
      { tenant_id: T1, hermes_enabled: true, whatsapp_owner: "+62 811-0000-0001 (demo)", whatsapp_gm: "+62 811-0000-0002 (demo)", discord_alert_channel: "#alert-sistem", discord_report_channel: "#laporan-harian", ai_enabled: true },
      { tenant_id: T2, hermes_enabled: false, whatsapp_owner: null, whatsapp_gm: null, discord_alert_channel: "#alert-sistem", discord_report_channel: "#laporan-harian", ai_enabled: false,
        satusehat_enabled: true, satusehat_org_id: null, satusehat_env: "sandbox" },
    ],
    approvals: [
      { id: "a1", tenant_id: T1, branch_id: B1, feature: 9, kind: "po", ref: "PO-2610-014", title: "PO biji kopi arabika Toraja 25 kg", amount: 4750000, detail: { po_id: "po1", vendor: "CV Kopi Toraja (demo)", termin: "Net 14" }, status: "pending", requested_at: new Date(Date.now() - 5 * 3600e3).toISOString() },
      { id: "a2", tenant_id: T1, branch_id: null, feature: 14, kind: "payroll", ref: "PAY-2609", title: "Payroll September · 14 karyawan", amount: 52300000, detail: { karyawan: 14 }, status: "pending", requested_at: new Date(Date.now() - 26 * 3600e3).toISOString() },
      { id: "a3", tenant_id: T1, branch_id: B2, feature: 6, kind: "void", ref: "ORD-HARUM-9102", title: "Void transaksi · salah input kasir", amount: 105600, detail: { order_id: "ord-v1", alasan: "Salah Input Kasir", catatan: "Jumlah es kopi tertulis 3, seharusnya 2" }, status: "pending", requested_at: new Date(Date.now() - 2 * 3600e3).toISOString(), requested_by: "u3" },
      { id: "a4", tenant_id: T1, branch_id: null, feature: 20, kind: "supplies", ref: "SUP-0031", title: "Harum.in Supplies · cup 16oz 2.000 pcs", amount: 1900000, detail: { distributor: "demo" }, status: "pending", requested_at: new Date(Date.now() - 50 * 3600e3).toISOString() },
      { id: "a5", tenant_id: T1, branch_id: B2, feature: 10, kind: "sto", ref: "STO-0007", title: "Transfer stok sirup kopi 12 botol ke Panakkukang", amount: 840000, detail: { sto_id: "sto1", dari: "Gudang Pusat", ke: "Cabang Panakkukang" }, status: "pending", requested_at: new Date(Date.now() - 3 * 3600e3).toISOString() },
    ],
    capital: [{ id: "c1", tenant_id: T1, amount: 75000000, tenor_months: 12, purpose: "Renovasi cabang ketiga (demo)", status: "review", created_at: ago(6) }],
    tenant_policies: [
      { id: "pol-1", tenant_id: T1, branch_id: null, role: null, max_discount_pct: 15, max_void_without_pin: 50000, operating_hours_start: "07:00:00", operating_hours_end: "23:00:00", geofence_radius_meters: 50, enforce_shift_lock: true, updated_at: ago(5) },
      { id: "pol-2", tenant_id: T1, branch_id: B2, role: null, max_discount_pct: 10, max_void_without_pin: 75000, operating_hours_start: "08:00:00", operating_hours_end: "22:00:00", geofence_radius_meters: 60, enforce_shift_lock: true, updated_at: ago(2) },
      { id: "pol-3", tenant_id: T1, branch_id: null, role: "staff", max_discount_pct: 5, max_void_without_pin: 25000, operating_hours_start: "07:00:00", operating_hours_end: "23:00:00", geofence_radius_meters: 50, enforce_shift_lock: true, updated_at: ago(3) },
    ],
    support_sessions: [
      { id: "sess-1", tenant_id: T1, ticket_id: "tk1", requested_by: "u0", approved_by: null, reason: "Investigasi anomali selisih kas fisik shift malam", duration_hours: 2, status: "requested", expires_at: null, created_at: new Date(Date.now() - 30 * 60e3).toISOString(), closed_at: null }
    ],
    payout: [{ tenant_id: T1, bank: "BCA", account_name: "PT Kopi Harum (demo)", account_last4: "4821", verified: true }],
    hermes: [
      { id: "h1", tenant_id: T1, channel: "whatsapp", target: "Owner", kind: "z_report", message: "Z-Report kemarin terkirim: ringkasan 2 cabang.", status: "simulated", created_at: new Date(Date.now() - 9 * 3600e3).toISOString() },
      { id: "h2", tenant_id: T1, channel: "whatsapp", target: "GM", kind: "low_stock", message: "Sirup Kopi Cabang Panakkukang tersisa 2 botol (minimum 5).", status: "simulated", created_at: new Date(Date.now() - 5 * 3600e3).toISOString() },
      { id: "h3", tenant_id: T1, channel: "discord", target: "#alert-sistem", kind: "void_alert", message: "Permintaan void ORD-HARUM-9102 Rp 185.000 menunggu otorisasi.", status: "simulated", created_at: new Date(Date.now() - 2 * 3600e3).toISOString() },
      { id: "h4", tenant_id: T1, channel: "discord", target: "#laporan-harian", kind: "margin_drop", message: "Marjin kotor Cabang Panakkukang turun dibanding rata-rata 7 hari.", status: "simulated", created_at: new Date(Date.now() - 40 * 60e3).toISOString() },
    ],
    tenant_branding: [
      { tenant_id: T1, display_name: "Kopi Harum", accent_color: "#059669", logo_url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=120", welcome_text: "Selamat datang di Kopi Harum! Kumpulkan poin dan nikmati promo eksklusif." }
    ],
    audit: [],
    ...seedOps(DEMO_USERS),
  };
}

// ── Penjualan & beban 60 hari (deterministik) ──
const SALES = (() => {
  const rnd = mulberry32(42);
  const rows = [];
  for (let back = 59; back >= 0; back--) {
    const d = addDays(today, -back);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    for (const b of [{ id: B1, name: "Cabang Pettarani", base: 55 }, { id: B2, name: "Cabang Panakkukang", base: 38 }]) {
      const n = b.base + Math.floor(rnd() * 25) + (weekend ? 18 : 0);
      let revenue = 0, discount = 0, cogs = 0;
      for (let i = 0; i < n; i++) {
        const sub = Math.round((28000 + rnd() * 160000) / 500) * 500;
        const disc = rnd() < 0.12 ? Math.round(sub * 0.1) : 0;
        revenue += Math.round((sub - disc) * 1.1);
        discount += disc;
        cogs += Math.round(sub * (0.34 + rnd() * 0.08));
      }
      rows.push({ day: iso(d), branch_id: b.id, branch_name: b.name, orders: n, revenue, discount, cogs, opex: 2230000, tax: Math.round(revenue / 11) });
    }
  }
  return rows;
})();

// ── Penyimpanan ──
let db;
let ops;
const bus = new Map();
const emitTable = (t) => (bus.get(t) ?? new Set()).forEach((cb) => { try { cb({ table: t }); } catch { /* abaikan */ } });
function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    db = raw ? JSON.parse(raw) : seed();
  } catch {
    db = seed();
  }
  db.member_branches ??= [];
  db.tenant_branding ??= [
    { tenant_id: T1, display_name: "Kopi Harum", accent_color: "#059669", logo_url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=120", welcome_text: "Selamat datang di Kopi Harum! Kumpulkan poin dan nikmati promo eksklusif." }
  ];
  db.tenant_policies ??= [
    { id: "pol-1", tenant_id: T1, branch_id: null, role: null, max_discount_pct: 15, max_void_without_pin: 50000, operating_hours_start: "07:00:00", operating_hours_end: "23:00:00", geofence_radius_meters: 50, enforce_shift_lock: true, updated_at: ago(5) },
    { id: "pol-2", tenant_id: T1, branch_id: B2, role: null, max_discount_pct: 10, max_void_without_pin: 75000, operating_hours_start: "08:00:00", operating_hours_end: "22:00:00", geofence_radius_meters: 60, enforce_shift_lock: true, updated_at: ago(2) },
    { id: "pol-3", tenant_id: T1, branch_id: null, role: "staff", max_discount_pct: 5, max_void_without_pin: 25000, operating_hours_start: "07:00:00", operating_hours_end: "23:00:00", geofence_radius_meters: 50, enforce_shift_lock: true, updated_at: ago(3) },
  ];
  db.support_sessions ??= [
    { id: "sess-1", tenant_id: T1, ticket_id: "tk1", requested_by: "u0", approved_by: null, reason: "Investigasi anomali selisih kas fisik shift malam", duration_hours: 2, status: "requested", expires_at: null, created_at: new Date(Date.now() - 30 * 60e3).toISOString(), closed_at: null }
  ];
  if (!db.staff_invites) { seedAccess(db, DEMO_USERS); seedRoster(db); }
  seedSdm(db, DEMO_USERS);
  seedOutbox(db);

  // Normalisasi akun demo Owner Merchant (Kopi Harum Makassar) ke paket Growth resmi 6 bulan
  const t1 = db.tenants?.find((t) => t.id === T1);
  if (t1) {
    t1.plan_id = "p2";
    t1.created_at = "2026-10-12";
    t1.current_period_end = "2027-04-12";
    t1.status = "active";
  }
  const inv1 = db.invoices?.find((i) => i.tenant_id === T1);
  if (inv1) {
    inv1.period = "2026-10-12";
    inv1.period_end = "2027-04-12";
    inv1.amount = 2500000;
    inv1.plan_name = "Growth (6 Bulan)";
    inv1.status = "paid";
  }

  // Sinkronisasi bahan Air Galon (BHN-018) ke 19.000 liter di Cabang Panakkukang (B2)
  const airGalon = db.items?.find((i) => i.code === "BHN-018" || i.name?.toLowerCase().includes("air galon"));
  if (airGalon) {
    db.stock_levels ??= [];
    let sl = db.stock_levels.find((s) => s.branch_id === B2 && s.item_id === airGalon.id);
    if (!sl) {
      db.stock_levels.push({ tenant_id: T1, branch_id: B2, item_id: airGalon.id, qty: 19000 });
    } else if (Number(sl.qty) === 0) {
      sl.qty = 19000;
    }
    db.stock_movements ??= [];
    const hasMove = db.stock_movements.some((m) => m.branch_id === B2 && m.item_id === airGalon.id);
    if (!hasMove) {
      db.stock_movements.unshift({
        id: "sm-air-init",
        tenant_id: T1,
        branch_id: B2,
        item_id: airGalon.id,
        qty_delta: 19000,
        kind: "purchase",
        ref: "Stok Awal",
        note: "Saldo awal bahan baku (19.000 liter)",
        created_by: "u1",
        created_at: new Date().toISOString(),
      });
    }
  }

  ops = createOps({ db, user: liveUser, emit: emitTable, persist: () => persist(), audit: (...a) => audit(...a), sales: SALES });
  return db;
}
const O = () => (load(), ops);
let _memberAuth;
const memberAuth = () => (_memberAuth ??= createMemberAuth(load()));
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch { /* penyimpanan tidak tersedia: tetap di memori */ }
}

let currentUser = null;
try {
  const id = sessionStorage.getItem(SESSION_KEY);
  currentUser = DEMO_USERS.find((u) => u.id === id) ?? null;
} catch { /* abaikan */ }
// Pengguna aktif = akun statis + baris profilnya yang hidup (nama, cabang utama, status) agar perubahan terbawa.
const liveUser = () => {
  if (!currentUser) return null;
  const p = db?.profiles?.find((x) => x.id === currentUser.id);
  return p ? { ...currentUser, ...p } : currentUser;
};
const listeners = new Set();
const emit = () => listeners.forEach((cb) => cb(currentUser?.id ?? null));

const role = () => currentUser?.role;
function need(feature, action) {
  if (currentUser?.role === "member") throw new Error("Akses ditolak: Member tidak memakai fungsi operasional");
  if (!currentUser || !can(role(), feature, action)) {
    throw new Error(`Akses ditolak: peran ${role() ?? "tamu"} tidak punya aksi "${action}" pada fitur ${feature}`);
  }
}
const isSA = () => role() === "superadmin";
function tenantOf(tenantId) {
  if (isSA()) {
    if (!tenantId) throw new Error("Superadmin harus memilih tenant");
    return tenantId;
  }
  return currentUser.tenant_id;
}
function audit(action, entity, entity_id, detail = {}, tenant_id = currentUser?.tenant_id ?? null) {
  load().audit.unshift({ id: Date.now() + Math.random(), tenant_id, actor_id: currentUser?.id, actor_role: role(), action, entity, entity_id, detail, created_at: new Date().toISOString() });
  db.audit = db.audit.slice(0, 500);
}
const uid = () => Math.random().toString(36).slice(2, 10);
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120));

export const api = {
  mode: "demo",
  demoUsers: DEMO_USERS,
  list: (...a) => O().list(...a),
  insert: (...a) => O().insert(...a),
  update: (...a) => O().update(...a),
  remove: (...a) => O().remove(...a),
  rpc: async (n, a) => O().rpc(n, a),
  /** Owner Copilot: Edge Function di produksi, tiruan deterministik di demo. */
  copilotAsk: async (question) => O().rpc("copilot_ask_demo", { p_question: question }),
  searchIcd: async (system, q, limit) => searchIcd(system, q, limit),
  lockTable: async () => ({ locked: true }),
  qrisCreate: async (orderId) => O().rpc("qris_start", { p_order: orderId }),
  qrisStatus: async (chargeId) => O().rpc("qris_status", { p_charge: chargeId }),
  qrisCancel: async (chargeId) => O().rpc("qris_cancel", { p_charge: chargeId }),
  qrisSimulatePaid: async (chargeId) => O().rpc("qris_simulate_paid", { p_charge: chargeId }),
  subscribe(table, _filter, cb) {
    if (!bus.has(table)) bus.set(table, new Set());
    bus.get(table).add(cb);
    return () => bus.get(table).delete(cb);
  },

  async getSessionUserId() { return currentUser?.id ?? null; },
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async signIn(email) {
    const em = email.trim().toLowerCase();
    const prof = load().profiles.find((x) => (x.email ?? "").toLowerCase() === em);
    const base = DEMO_USERS.find((x) => x.email === em);
    const u = base ?? (prof && { id: prof.id, email: prof.email, role: prof.role, full_name: prof.full_name, tenant_id: prof.tenant_id, branch_id: prof.branch_id });
    if (!u) throw new Error("Akun demo tidak ditemukan. Gunakan salah satu akun demo atau email undangan yang sudah dikirim.");
    // Sama dengan my_access_state() di SQL: akun nonaktif / tenant ditangguhkan ditolak beserta alasannya.
    const t = db.tenants.find((x) => x.id === u.tenant_id);
    if (prof?.is_active === false) throw new Error(prof.deactivation_reason ?? "Akun dinonaktifkan.");
    if (u.role !== "superadmin" && t?.status === "suspended") throw new Error(t.suspended_reason ?? "Langganan tenant ditangguhkan.");
    currentUser = u;
    try { sessionStorage.setItem(SESSION_KEY, u.id); } catch { /* abaikan */ }
    emit();
  },
  /** Masuk Member (tiruan): kode dikembalikan di respons karena tidak ada WhatsApp (simulated: true). */
  async memberRequestCode({ tenantSlug, phone, deviceId, consentData, consentMarketing }) {
    const t = load().tenants.find((x) => x.slug === tenantSlug);
    if (!t) throw new Error("Tenant tidak ditemukan");
    const r = memberAuth().request({ tenantId: t.id, phone, device: deviceId, consentData, consentMarketing });
    persist();
    return { sent: false, simulated: true, dev_code: r.code, expires_at: r.expires_at };
  },
  async memberVerifyCode({ tenantSlug, phone, deviceId, code, name }) {
    const t = load().tenants.find((x) => x.slug === tenantSlug);
    if (!t) throw new Error("Tenant tidak ditemukan");
    const v = memberAuth().verify({ tenantId: t.id, phone, code, device: deviceId });
    persist();
    if (!v.ok) { const e = new Error("Kode salah atau kedaluwarsa"); e.reason = v.reason; e.attempts_left = v.attempts_left ?? 0; throw e; }
    const { profile, customer, is_new } = memberAuth().complete({ otpId: v.otp_id, name });
    persist();
    currentUser = { id: profile.id, email: profile.email, role: "member", full_name: profile.full_name, tenant_id: profile.tenant_id, branch_id: null, customer_id: customer.id };
    try { sessionStorage.setItem(SESSION_KEY, currentUser.id); } catch { /* abaikan */ }
    emit();
    return { is_new, points: customer.points };
  },
  async signOut() {
    currentUser = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* abaikan */ }
    emit();
  },
  async getProfile(id) {
    const base = DEMO_USERS.find((u) => u.id === id);
    const live = load().profiles.find((u) => u.id === id);
    const { pin, ...p } = { ...(base ?? {}), ...(live ?? {}) };
    if (!p.id) throw new Error("Profil tidak ditemukan");
    const t = load().tenants.find((t) => t.id === p.tenant_id);
    const pil = t?.pillar || (p.tenant_id === T2 || p.role === "dokter" || p.full_name?.toLowerCase().includes("klinik") ? "health" : "fnb");
    return { ...p, pillar: pil, tenant: t || null };
  },
  accessState: async () => O().rpc("my_access_state"),
  touchPresence: async (login = false) => O().rpc("touch_presence", { p_login: login }),
  /** Demo: menggantikan Edge Function invite-member — akun dibuat langsung, email tidak benar-benar dikirim. */
  sendInvite: async (inviteId) => O().rpc("prepare_invite_send", { p_id: inviteId }),

  // ── Platform ──
  async platformOverview() {
    if (!isSA()) throw new Error("Akses ditolak");
    const { tenants, plans, invoices } = load();
    const price = (t) => plans.find((p) => p.id === t.plan_id)?.price_month ?? 0;
    return delay({
      tenants: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      trial: tenants.filter((t) => t.status === "trial").length,
      past_due: tenants.filter((t) => t.status === "past_due").length,
      suspended: tenants.filter((t) => t.status === "suspended").length,
      mrr: tenants.filter((t) => t.status === "active").reduce((a, t) => a + price(t), 0),
      unpaid: invoices.filter((i) => i.status === "unpaid").reduce((a, i) => a + i.amount, 0),
    });
  },
  async listTenants() {
    if (currentUser?.role === "member") throw new Error("Akses ditolak");
    const { tenants, plans } = load();
    const rows = isSA() ? tenants : tenants.filter((t) => t.id === currentUser.tenant_id);
    return delay(rows.map((t) => ({ ...t, plan: plans.find((p) => p.id === t.plan_id) ?? null })));
  },
  async saveTenant(t) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, t.id ? "u" : "c");
    const { plan, ...row } = t;
    load();
    if (row.id) db.tenants = db.tenants.map((x) => (x.id === row.id ? { ...x, ...row } : x));
    else {
      // Sama dengan trigger tenant_tax_default di SQL.
      const DEF = { fnb: ["PBJT", 0.1], health: ["Tanpa pajak", 0], retail: ["PPN", 0.11] };
      if ((row.tax_label ?? "Pajak") === "Pajak" && !Number(row.tax_rate) && DEF[row.pillar]) [row.tax_label, row.tax_rate] = DEF[row.pillar];
      db.tenants.push({ tax_label: "Pajak", tax_rate: 0, ...row, id: uid(), created_at: new Date().toISOString() });
    }
    audit(t.id ? "update" : "insert", "tenants", row.id ?? "baru", row, row.id ?? null);
    persist();
    return delay(row);
  },
  async deleteTenant(id) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, "d");
    load().tenants = db.tenants.filter((t) => t.id !== id);
    audit("delete", "tenants", id, {}, id);
    persist();
  },
  async listPlans() { return delay([...load().plans]); },
  async savePlan(p) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, p.id ? "u" : "c");
    load();
    if (p.id) db.plans = db.plans.map((x) => (x.id === p.id ? { ...x, ...p } : x));
    else db.plans.push({ ...p, id: uid() });
    audit(p.id ? "update" : "insert", "plans", p.id ?? p.code, p, null);
    persist();
  },
  async deletePlan(id) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, "d");
    if (load().tenants.some((t) => t.plan_id === id)) throw new Error("Paket masih dipakai tenant");
    db.plans = db.plans.filter((p) => p.id !== id);
    audit("delete", "plans", id, {}, null);
    persist();
  },
  async listInvoices() {
    need(1, "r");
    const rows = load().invoices;
    return delay(isSA() ? rows : rows.filter((i) => i.tenant_id === currentUser.tenant_id));
  },
  async getSettings() {
    if (!isSA()) throw new Error("Akses ditolak");
    return delay(structuredClone(load().settings));
  },
  async saveSetting(key, value) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, "u");
    load().settings[key] = value;
    audit("update", "platform_settings", key, value, null);
    persist();
  },
  async getIntegration(tenantId) {
    need(1, "r");
    const t = tenantOf(tenantId);
    return delay(load().integrations.find((i) => i.tenant_id === t) ?? null);
  },
  async saveIntegration(row) {
    if (!isSA()) throw new Error("Akses ditolak");
    need(1, "u");
    load();
    const i = db.integrations.findIndex((x) => x.tenant_id === row.tenant_id);
    if (i >= 0) db.integrations[i] = row; else db.integrations.push(row);
    audit("update", "tenant_integrations", row.tenant_id, row, row.tenant_id);
    persist();
  },
  async listAudit({ tenantId } = {}) {
    need(1, "r");
    let rows = load().audit;
    if (!isSA()) rows = rows.filter((r) => r.tenant_id === currentUser.tenant_id);
    if (tenantId) rows = rows.filter((r) => r.tenant_id === tenantId);
    return delay(rows.slice(0, 200));
  },
  async logAccess(tenantId, area) {
    if (!isSA()) return;
    audit("access", "tenant_context", null, { area }, tenantId);
    persist();
  },
  async getBlueprint() {
    if (!isSA()) throw new Error("Akses ditolak");
    return (await import("../demo/blueprint.json")).default;
  },

  // ── Bisnis ──
  async listBranches(tenantId) {
    const t = isSA() ? tenantId : currentUser.tenant_id;
    return delay(load().branches.filter((b) => b.tenant_id === t));
  },
  async ownerBranchOverview() {
    need(1, "r");
    const t = currentUser.tenant_id;
    const { branches, profiles = [], orders = [], plans, tenants } = load();
    const tenant = tenants.find((x) => x.id === t);
    const plan = plans.find((p) => p.id === tenant?.plan_id) || { max_branches: 5, name: "Growth (demo)" };
    const myBranches = branches.filter((b) => b.tenant_id === t).map((b) => {
      const staffCount = profiles.filter((p) => p.tenant_id === t && p.branch_id === b.id).length;
      const today = iso(new Date());
      const todayOrders = orders.filter((o) => o.branch_id === b.id && o.created_at?.slice(0, 10) === today);
      const todaySales = todayOrders.filter((o) => o.status === "paid").reduce((s, o) => s + (o.total || 0), 0);
      return {
        ...b,
        staff_count: staffCount,
        today_orders: todayOrders.length,
        today_sales: todaySales,
      };
    });
    return delay({
      quota: {
        used: myBranches.length,
        max: plan.max_branches ?? 5,
        plan_name: plan.name ?? "Growth",
      },
      branches: myBranches,
    });
  },
  async createBranch(params) {
    need(1, "u");
    const t = currentUser.tenant_id;
    const { branches, plans, tenants } = load();
    const tenant = tenants.find((x) => x.id === t);
    const plan = plans.find((p) => p.id === tenant?.plan_id) || { max_branches: 5, name: "Growth" };
    const currentCount = branches.filter((b) => b.tenant_id === t).length;
    if (currentCount >= (plan.max_branches ?? 5)) {
      throw new Error(`Batas kuota cabang (${plan.max_branches}) untuk paket ${plan.name} telah tercapai.`);
    }
    const newBranch = {
      id: id(),
      tenant_id: t,
      name: params.name.trim(),
      city: params.city || null,
      address: params.address || null,
      lat: params.lat ? Number(params.lat) : null,
      lng: params.lng ? Number(params.lng) : null,
      geofence_m: params.geofence_m ? Number(params.geofence_m) : 50,
      is_warehouse: Boolean(params.is_warehouse),
      satusehat_location_id: params.satusehat_location_id || null,
      created_at: nowIso(),
    };
    branches.push(newBranch);
    save();
    return delay(newBranch);
  },
  async updateBranch(branchId, params) {
    need(1, "u");
    const t = currentUser.tenant_id;
    const { branches } = load();
    const b = branches.find((x) => x.id === branchId && x.tenant_id === t);
    if (!b) throw new Error("Cabang tidak ditemukan.");
    Object.assign(b, {
      name: params.name ? params.name.trim() : b.name,
      city: params.city !== undefined ? params.city : b.city,
      address: params.address !== undefined ? params.address : b.address,
      lat: params.lat ? Number(params.lat) : b.lat,
      lng: params.lng ? Number(params.lng) : b.lng,
      geofence_m: params.geofence_m ? Number(params.geofence_m) : b.geofence_m,
      is_warehouse: params.is_warehouse !== undefined ? Boolean(params.is_warehouse) : b.is_warehouse,
      satusehat_location_id: params.satusehat_location_id !== undefined ? params.satusehat_location_id : b.satusehat_location_id,
    });
    save();
    return delay(b);
  },
  async dashboardDaily({ from, to, tenantId, branchId }) {
    need(2, "r");
    const t = tenantOf(tenantId);
    if (t !== T1) {
      // Tenant lain: dihitung langsung dari transaksi lunas di browser.
      const br = load().branches.filter((b) => b.tenant_id === t && !b.is_warehouse && (!branchId || b.id === branchId));
      const out = [];
      for (let d = new Date(from); iso(d) <= to; d = addDays(d, 1))
        for (const b of br) {
          const os = db.orders.filter((o) => o.status === "paid" && o.branch_id === b.id && o.paid_at.slice(0, 10) === iso(d));
          out.push({ day: iso(d), branch_id: b.id, branch_name: b.name, orders: os.length, revenue: os.reduce((a, o) => a + o.total, 0), discount: 0, cogs: os.reduce((a, o) => a + o.cogs, 0), opex: 0, tax: os.reduce((a, o) => a + o.tax, 0) });
        }
      return delay(out.filter((r) => O().branchOk(r.branch_id)));
    }
    // GM yang dibatasi cabang hanya melihat cabangnya (sama dengan dashboard_daily di SQL).
    const rows = SALES.filter((r) => r.day >= from && r.day <= to && (!branchId || r.branch_id === branchId) && O().branchOk(r.branch_id)).map((r) => ({ ...r }));
    for (const o of load().orders.filter((o) => o.status === "paid" && o.id !== "ord-v1" && o.paid_at.slice(0, 10) >= from && o.paid_at.slice(0, 10) <= to)) {
      const r = rows.find((x) => x.day === o.paid_at.slice(0, 10) && x.branch_id === o.branch_id);
      if (r) { r.orders += 1; r.revenue += o.total; r.cogs += o.cogs; }
    }
    return delay(rows);
  },
  async profitLoss(args) {
    return delay(O().ledgerPL(args));
  },
  async listApprovals({ tenantId }) {
    const t = tenantOf(tenantId);
    const { approvals, branches } = load();
    return delay(
      approvals
        .filter((a) => a.tenant_id === t)
        .filter((a) => {
          const p = permOf(role(), a.feature);
          return (p?.r && !p.scope) || a.requested_by === currentUser.id;
        })
        .map((a) => ({ ...a, branch: branches.find((b) => b.id === a.branch_id) ?? null }))
        .sort((x, y) => (x.requested_at < y.requested_at ? 1 : -1))
    );
  },
  async decideApproval(id, decision, note, pin, option) {
    const a = load().approvals.find((x) => x.id === id);
    if (!a) throw new Error("Persetujuan tidak ditemukan");
    if (a.status !== "pending") throw new Error("Sudah diputuskan");
    if (a.kind === "void" && role() === "gm") {
      const mins = Number(load().tenants?.find?.((x) => x.id === a.tenant_id)?.void_escalate_minutes ?? 30);
      if (a.detail?.escalated_to_owner || Date.now() - new Date(a.requested_at).getTime() > mins * 60000) {
        throw new Error("Void ini dieskalasi ke Owner (melebihi kewenangan GM atau melewati batas waktu)");
      }
    }
    const p = permOf(role(), a.feature);
    if (!p?.a) throw new Error(`Peran Anda tidak memiliki hak Approval untuk fitur ${a.feature}`);
    if (p.pin && pin !== (load().pins?.[currentUser.id] ?? currentUser.pin)) throw new Error("PIN otorisasi salah");
    if (a.kind === "void" && !note?.trim()) throw new Error("Catatan alasan wajib diisi untuk void");
    if (a.kind === "void" && decision === "approved" && !["restock", "waste"].includes(option)) throw new Error("Pilih: kembalikan bahan ke stok atau catat sebagai waste");
    Object.assign(a, { status: decision, decided_by: currentUser.id, decided_at: new Date().toISOString(), decision_note: note, detail: { ...a.detail, option } });
    O().applyApproval(a, decision, option, note);
    audit("update", "approvals", id, { status: decision, note }, a.tenant_id);
    persist();
    return delay(a);
  },

  // FASE 1.4 · Policy Builder 3 Lapis
  async getEffectivePolicy({ tenantId, branchId, role } = {}) {
    const t = tenantOf(tenantId);
    const b = branchId ?? null;
    const r = role ?? null;
    const { tenant_policies = [] } = load();

    // 1. Layer 3: Branch + Role
    if (b && r) {
      const pol = tenant_policies.find((p) => p.tenant_id === t && p.branch_id === b && p.role === r);
      if (pol) return delay({ layer: 3, layer_name: "Cabang & Peran", policy_id: pol.id, ...pol });
    }
    // 2a. Layer 2a: Branch only
    if (b) {
      const pol = tenant_policies.find((p) => p.tenant_id === t && p.branch_id === b && !p.role);
      if (pol) return delay({ layer: 2, layer_name: "Cabang", policy_id: pol.id, ...pol });
    }
    // 2b. Layer 2b: Role only
    if (r) {
      const pol = tenant_policies.find((p) => p.tenant_id === t && !p.branch_id && p.role === r);
      if (pol) return delay({ layer: 2, layer_name: "Peran (Tenant)", policy_id: pol.id, ...pol });
    }
    // 3. Layer 1: Default Tenant
    const def = tenant_policies.find((p) => p.tenant_id === t && !p.branch_id && !p.role);
    if (def) return delay({ layer: 1, layer_name: "Default Tenant", policy_id: def.id, ...def });

    // Fallback bawaan sistem
    return delay({
      layer: 0, layer_name: "Bawaan Sistem",
      max_discount_pct: 15, max_void_without_pin: 50000,
      operating_hours_start: "07:00:00", operating_hours_end: "23:00:00",
      geofence_radius_meters: 50, enforce_shift_lock: true, policy_id: null
    });
  },
  async listTenantPolicies(tenantId) {
    const t = tenantOf(tenantId);
    const { tenant_policies = [], branches = [] } = load();
    const rows = tenant_policies
      .filter((p) => !t || p.tenant_id === t)
      .map((p) => ({ ...p, branch: branches.find((b) => b.id === p.branch_id) ?? null }))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return delay(rows);
  },
  async saveTenantPolicy({ tenantId, branchId, role, discount, voidLimit, start, end, radius, lock }) {
    const t = tenantOf(tenantId);
    if (!["owner", "gm", "superadmin"].includes(currentUser?.role)) throw new Error("Hanya Owner atau GM yang dapat mengubah kebijakan");
    const { tenant_policies = [] } = load();
    let pol = tenant_policies.find((p) => p.tenant_id === t && (p.branch_id ?? null) === (branchId ?? null) && (p.role ?? null) === (role ?? null));
    if (pol) {
      Object.assign(pol, {
        max_discount_pct: Number(discount), max_void_without_pin: Number(voidLimit),
        operating_hours_start: start, operating_hours_end: end,
        geofence_radius_meters: Number(radius), enforce_shift_lock: Boolean(lock),
        updated_at: new Date().toISOString(), updated_by: currentUser.id
      });
    } else {
      pol = {
        id: uid(), tenant_id: t, branch_id: branchId ?? null, role: role ?? null,
        max_discount_pct: Number(discount), max_void_without_pin: Number(voidLimit),
        operating_hours_start: start, operating_hours_end: end,
        geofence_radius_meters: Number(radius), enforce_shift_lock: Boolean(lock),
        updated_at: new Date().toISOString(), updated_by: currentUser.id
      };
      tenant_policies.push(pol);
    }
    audit("update", "tenant_policies", pol.id, { discount, voidLimit }, t);
    persist();
    emitTable("tenant_policies");
    return delay(pol);
  },

  // FASE 2 · Merek & Portal Member (tenant_branding)
  async getTenantBranding(tenantId) {
    const t = tenantOf(tenantId);
    const { tenant_branding = [] } = load();
    const b = tenant_branding.find((x) => x.tenant_id === t);
    return delay(b ? structuredClone(b) : null);
  },
  async saveTenantBranding({ tenantId, displayName, accentColor, logoUrl, welcomeText }) {
    const t = tenantOf(tenantId);
    if (!["owner", "superadmin"].includes(currentUser?.role)) throw new Error("Hanya Owner atau Superadmin yang dapat mengubah merek Tenant");
    if (displayName && (displayName.trim().length < 1 || displayName.length > 60)) throw new Error("Nama tampilan harus 1–60 karakter");
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) throw new Error("Warna aksen harus format hex 6-digit (misal: #059669)");
    if (logoUrl && !/^https:\/\/\S{4,250}$/.test(logoUrl)) throw new Error("Logo harus berupa URL https:// yang sah (maks 250 karakter)");
    if (welcomeText && welcomeText.length > 160) throw new Error("Teks sambutan maksimal 160 karakter");
    const { tenant_branding = [] } = load();
    db.tenant_branding ??= tenant_branding;
    let b = db.tenant_branding.find((x) => x.tenant_id === t);
    if (b) {
      Object.assign(b, {
        display_name: displayName ? displayName.trim() : null,
        accent_color: accentColor || null,
        logo_url: logoUrl || null,
        welcome_text: welcomeText || null,
        updated_at: new Date().toISOString(),
      });
    } else {
      b = {
        tenant_id: t,
        display_name: displayName ? displayName.trim() : null,
        accent_color: accentColor || null,
        logo_url: logoUrl || null,
        welcome_text: welcomeText || null,
        updated_at: new Date().toISOString(),
      };
      db.tenant_branding.push(b);
    }
    audit("update", "tenant_branding", t, { displayName, accentColor }, t);
    persist();
    emitTable("tenant_branding");
    return delay(structuredClone(b));
  },

  // FASE 1.5 · Rekap Pusat Persetujuan Terpadu
  async approvalSummary(tenantId) {
    const t = tenantOf(tenantId);
    const { approvals = [] } = load();
    const pending = approvals.filter((a) => (!t || a.tenant_id === t) && a.status === "pending");
    return delay({
      total_pending: pending.length,
      pending_void: pending.filter((a) => a.kind === "void").length,
      pending_po: pending.filter((a) => a.kind === "po").length,
      pending_sto: pending.filter((a) => a.kind === "sto").length,
      pending_payroll: pending.filter((a) => a.kind === "payroll").length,
      pending_supplies: pending.filter((a) => a.kind === "supplies").length,
      total_amount_pending: pending.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    });
  },

  // FASE 1.6 · Akses Dukungan Bersyarat (Break-Glass Support Sessions)
  async requestSupportSession({ tenantId, ticketId, reason, hours = 2 }) {
    if (currentUser?.role !== "superadmin") throw new Error("Hanya Superadmin yang dapat meminta akses dukungan break-glass");
    if (!reason?.trim() || reason.trim().length < 5) throw new Error("Alasan bantuan teknis wajib diisi (minimal 5 karakter)");
    const t = tenantOf(tenantId);
    const { support_sessions = [] } = load();
    const sess = {
      id: uid(), tenant_id: t, ticket_id: ticketId ?? null, requested_by: currentUser.id,
      approved_by: null, reason: reason.trim(), duration_hours: Number(hours) || 2,
      status: "requested", expires_at: null, created_at: new Date().toISOString(), closed_at: null
    };
    support_sessions.unshift(sess);
    audit("insert", "support_sessions", sess.id, { reason, hours }, t);
    persist();
    emitTable("support_sessions");
    return delay(sess);
  },
  async grantSupportSession(sessionId, grant) {
    if (currentUser?.role !== "owner") throw new Error("Hanya Owner yang dapat memberikan izin akses dukungan");
    const { support_sessions = [] } = load();
    const sess = support_sessions.find((s) => s.id === sessionId);
    if (!sess) throw new Error("Permintaan sesi dukungan tidak ditemukan");
    if (sess.status !== "requested") throw new Error(`Sesi ini sudah diproses (${sess.status})`);
    if (grant) {
      sess.status = "active";
      sess.approved_by = currentUser.id;
      sess.expires_at = new Date(Date.now() + sess.duration_hours * 3600e3).toISOString();
    } else {
      sess.status = "rejected";
      sess.approved_by = currentUser.id;
      sess.closed_at = new Date().toISOString();
    }
    audit("update", "support_sessions", sess.id, { status: sess.status }, sess.tenant_id);
    persist();
    emitTable("support_sessions");
    return delay(sess);
  },
  async revokeSupportSession(sessionId) {
    const { support_sessions = [] } = load();
    const sess = support_sessions.find((s) => s.id === sessionId);
    if (!sess) throw new Error("Sesi dukungan tidak ditemukan");
    if (!["superadmin", "owner"].includes(currentUser?.role)) throw new Error("Akses ditolak");
    sess.status = "revoked";
    sess.closed_at = new Date().toISOString();
    audit("update", "support_sessions", sess.id, { status: "revoked" }, sess.tenant_id);
    persist();
    emitTable("support_sessions");
    return delay(sess);
  },
  async getActiveSupportSession(tenantId) {
    const t = tenantOf(tenantId);
    const { support_sessions = [] } = load();
    const now = new Date().toISOString();
    const active = support_sessions.find((s) => (!t || s.tenant_id === t) && s.status === "active" && s.expires_at > now);
    return delay(active ?? null);
  },
  async listSupportSessions(tenantId) {
    const t = isSA() && !tenantId ? null : tenantOf(tenantId);   // Superadmin tanpa tenant = semua sesi (sama dengan Supabase)
    const { support_sessions = [], profiles = [] } = load();
    const rows = support_sessions
      .filter((s) => !t || s.tenant_id === t)
      .map((s) => ({
        ...s,
        requester: profiles.find((p) => p.id === s.requested_by) ?? null,
        approver: profiles.find((p) => p.id === s.approved_by) ?? null
      }))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return delay(rows);
  },
  async listCapital(tenantId) {
    need(19, "r");
    const t = tenantOf(tenantId);
    return delay(load().capital.filter((c) => c.tenant_id === t));
  },
  async saveCapital(row) {
    need(19, row.id ? "u" : "c");
    load();
    if (currentUser.role !== "superadmin") {   // sama dengan capital_guard() di SQL
      const old = row.id ? db.capital.find((x) => x.id === row.id) : null;
      if (!old && row.status && !["draft", "submitted"].includes(row.status)) throw new Error("Status awal pengajuan harus draf atau diajukan");
      if (old && row.status && row.status !== old.status && !(old.status === "draft" && row.status === "submitted")) throw new Error("Status pengajuan diputuskan tim Harum.in (lender), bukan oleh tenant");
      if (old && old.status !== "draft" && ["amount", "tenor_months", "purpose"].some((k) => k in row && row[k] !== old[k])) throw new Error("Pengajuan yang sudah dikirim tidak dapat diubah");
    }
    if (row.id) db.capital = db.capital.map((x) => (x.id === row.id ? { ...x, ...row } : x));
    else db.capital.unshift({ ...row, id: uid(), status: row.status ?? "draft", created_at: new Date().toISOString(), created_by: currentUser.id });
    audit(row.id ? "update" : "insert", "capital_applications", row.id ?? "baru", row, row.tenant_id);
    persist();
  },
  async decideCapital(id, status, note) {
    load();
    if (currentUser.role !== "superadmin") throw new Error("Hanya tim Harum.in yang dapat memutuskan pengajuan modal");
    if (!["review", "approved", "rejected"].includes(status)) throw new Error("Status tidak valid");
    const c = db.capital.find((x) => x.id === id);
    if (!c) throw new Error("Pengajuan tidak ditemukan");
    if (c.status === "draft") throw new Error("Pengajuan belum dikirim tenant");
    c.status = status;
    audit("update", "capital_applications", id, { status, note }, c.tenant_id);
    persist();
    return c;
  },
  async deleteCapital(id) {
    need(19, "d");
    const c = load().capital.find((x) => x.id === id);
    db.capital = db.capital.filter((x) => x.id !== id);
    audit("delete", "capital_applications", id, {}, c?.tenant_id);
    persist();
  },
  async getPayout(tenantId) {
    need(19, "r");
    const t = tenantOf(tenantId);
    return delay(load().payout.find((p) => p.tenant_id === t) ?? null);
  },
  async savePayout(row) {
    need(19, "u");
    load();
    const i = db.payout.findIndex((x) => x.tenant_id === row.tenant_id);
    if (i >= 0) db.payout[i] = row; else db.payout.push(row);
    audit("update", "payout_accounts", row.tenant_id, { bank: row.bank, account_last4: row.account_last4 }, row.tenant_id);
    persist();
  },
  async listHermes(tenantId) {
    need(2, "r");
    const t = tenantOf(tenantId);
    return delay(load().hermes.filter((h) => h.tenant_id === t));
  },
};
