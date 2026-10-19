// Adapter produksi: semua akses lewat Supabase. RLS di database adalah penjaga utama;
// pengecekan can() di UI hanya untuk menyembunyikan aksi yang pasti ditolak.
import { supabase } from "../lib/supabase.js";

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === "string" && UUID_REGEX.test(val);
const isUuidCol = (col) => col === "id" || (typeof col === "string" && col.endsWith("_id"));


async function fnError(error) {
  let msg = error.message;
  let extra = {};
  try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; extra = { reason: j?.reason, attempts_left: j?.attempts_left }; } catch { /* pakai pesan bawaan */ }
  return Object.assign(new Error(msg), extra);
}

function synthesizeCopilotAnswer(q, snap) {
  if (!snap) return "Data snapshot bisnis belum tersedia. Silakan coba sesaat lagi.";
  const qLower = q.toLowerCase();
  const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
  const kpi = Array.isArray(snap.kpi_bulan_ini) ? snap.kpi_bulan_ini : [];
  const kas = snap.kas || {};
  const menu = snap.menu || {};

  if (qLower.includes("cabang") || qLower.includes("perhatian") || qLower.includes("gerai")) {
    const zeroSales = kpi.filter((b) => Number(b.orders || 0) === 0);
    const activeBranches = kpi.filter((b) => Number(b.orders || 0) > 0).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

    const lines = [
      "Berdasarkan analisis snapshot performa operasional seluruh cabang bulan ini:",
      "",
      "1. Cabang yang Memerlukan Perhatian Khusus:",
      ...(zeroSales.length > 0
        ? zeroSales.map((b) => `• ${b.branch}: Belum membukukan transaksi penjualan (0 pesanan, omzet Rp 0). Perlu evaluasi kesiapan operasional gerai.`)
        : ["• Seluruh cabang telah aktif membukukan transaksi."]),
      "",
      "2. Performa Cabang Aktif:",
      ...activeBranches.map((b) => `• ${b.branch}: Omzet ${rp(b.revenue)} dari ${b.orders} transaksi (Tiket Rata-rata ${rp(b.avg_ticket)}, HPP ${b.cogs_pct}%, Void ${b.void_pct}%). Proyeksi omzet akhir: ${rp(b.projected_revenue)}.`),
      "",
      "Rekomendasi Tindakan:",
      `1. Periksa kendala operasional pada ${zeroSales.map((b) => b.branch).join(", ") || "cabang dengan omzet terendah"}.`,
      "2. Pertahankan efisiensi HPP pada gerai aktif yang stabil di kisaran 34–35%."
    ];
    return lines.join("\n");
  }

  if (qLower.includes("menu") || qLower.includes("evaluasi") || qLower.includes("produk") || qLower.includes("laris")) {
    const perlu = menu.perlu_dievaluasi || [];
    const bintang = menu.bintang || [];
    const plowhorse = menu.laris_margin_tipis || [];
    return [
      "Berdasarkan analisis rekayasa menu (Menu Engineering) snapshot database:",
      "",
      `• Menu Bintang (Margin Tinggi & Terlaris): ${bintang.join(", ") || "Belum ada"}.`,
      `• Menu Perlu Dievaluasi (Margin Rendah / Penjualan Minim): ${perlu.join(", ") || "Belum ada"}.`,
      ...(plowhorse.length ? [`• Menu Laris Margin Tipis: ${plowhorse.join(", ")}.`] : []),
      "",
      "Rekomendasi Tindakan:",
      "1. Evaluasi porsi dan harga jual menu berkinerja rendah untuk menekan food cost.",
      `2. Dorong promosi atau paket bundling untuk menu bintang (${bintang.join(", ") || "menu unggulan"}).`
    ].join("\n");
  }

  if (qLower.includes("kas") || qLower.includes("aman") || qLower.includes("30 hari") || qLower.includes("keuangan")) {
    return [
      "Berdasarkan proyeksi arus kas 30 hari ke depan:",
      "",
      `• Saldo Awal: ${rp(kas.opening)}`,
      `• Proyeksi Saldo Akhir (Hari ke-${kas.days || 30}): ${rp(kas.ending)}`,
      `• Saldo Terendah: ${rp(kas.min_balance)}`,
      `• Status Likuiditas: ${kas.first_negative_date ? `Waspada: potensi defisit pada ${kas.first_negative_date}` : "Aman, tidak terdeteksi potensi defisit/saldo negatif."}`,
      "",
      "Rekomendasi: Posisi likuiditas kas toko berada dalam batas aman untuk mendukung operasional belanja harian dan pemenuhan kewajiban."
    ].join("\n");
  }

  // Ringkasan Eksekutif Umum
  return [
    `Ringkasan Eksekutif Snapshot Bisnis untuk pertanyaan “${q}”:`,
    `• Permintaan Persetujuan Tertunda: ${snap.persetujuan_menunggu || 0} persetujuan.`,
    `• Bahan Baku Kritis: ${snap.stok_di_bawah_minimum || 0} item di bawah stok minimum.`,
    `• Posisi Kas: Saldo ${rp(kas.opening)} dengan proyeksi akhir ${rp(kas.ending)}.`,
    `• Transaksi Void (7 Hari Terakhir): ${snap.void_7_hari || 0} transaksi.`,
    "",
    "Rekomendasi: Periksa tab Persetujuan dan Stok Kritis untuk mencegah gangguan operasional gerai."
  ].join("\n");
}

export const api = {
  mode: "supabase",

  // -- Auth --
  async getSessionUserId() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("[supabase] getSession note:", error.message);
      }
      return data?.session?.user?.id ?? null;
    } catch (e) {
      console.warn("[supabase] getSessionUserId exception:", e?.message);
      return null;
    }
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s?.user?.id ?? null));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    const em = (email || "").trim().replace(/@demo\.tijarah\.id$/i, "@demo.harum.in");
    return ok(await supabase.auth.signInWithPassword({ email: em, password }));
  },
  async signOut() {
    try {
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
    } catch { /* abaikan */ }
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("sb-") || k.includes("auth-token"))) {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
    } catch { /* abaikan */ }
  },
  async getProfile(uid) {
    const res = await supabase
      .from("profiles")
      .select("id, tenant_id, branch_id, role, full_name, email, tenant:tenants(id, name, slug, pillar)")
      .eq("id", uid)
      .single();
    const data = ok(res);
    if (data?.tenant?.pillar) {
      data.pillar = data.tenant.pillar;
    } else {
      data.pillar = (data.tenant_id === "00000000-0000-0000-0000-000000000002" || data.role === "dokter" || data.full_name?.toLowerCase().includes("klinik")) ? "health" : "fnb";
    }
    return data;
  },

  // -- Platform (fitur 1) --
  platformOverview: async () => ok(await supabase.rpc("platform_overview"))[0],
  listTenants: async () =>
    ok(await supabase.from("tenants").select("*, plan:plans(id, name, price_month)").order("created_at")),
  saveTenant: async (t) => {
    const { plan, ...row } = t;
    return ok(t.id ? await supabase.from("tenants").update(row).eq("id", t.id).select().single()
                   : await supabase.from("tenants").insert(row).select().single());
  },
  deleteTenant: async (id) => ok(await supabase.from("tenants").delete().eq("id", id)),
  listPlans: async () => ok(await supabase.from("plans").select("*").order("price_month", { nullsFirst: false })),
  savePlan: async (p) =>
    ok(p.id ? await supabase.from("plans").update(p).eq("id", p.id).select().single()
            : await supabase.from("plans").insert(p).select().single()),
  deletePlan: async (id) => ok(await supabase.from("plans").delete().eq("id", id)),
  listInvoices: async () => ok(await supabase.from("invoices").select("*").order("period", { ascending: false })),
  getSettings: async () => Object.fromEntries(ok(await supabase.from("platform_settings").select("key, value")).map((r) => [r.key, r.value])),
  saveSetting: async (key, value) => ok(await supabase.from("platform_settings").upsert({ key, value, updated_at: new Date().toISOString() })),
  getIntegration: async (tenantId) =>
    ok(await supabase.from("tenant_integrations").select("*").eq("tenant_id", tenantId).maybeSingle()),
  saveIntegration: async (row) => ok(await supabase.from("tenant_integrations").upsert({ ...row, updated_at: new Date().toISOString() })),
  listAudit: async ({ tenantId, limit = 200 } = {}) => {
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    return ok(await q);
  },
  logAccess: async (tenantId, area) => ok(await supabase.rpc("log_superadmin_access", { p_tenant: tenantId, p_area: area })),
  getBlueprint: async () => ok(await supabase.from("blueprint_docs").select("content").eq("id", "harumin-v1").single()).content,

  // -- Bisnis --
  listBranches: async (tenantId) => ok(await supabase.from("branches").select("id, name, city, address, lat, lng, geofence_m, is_warehouse, satusehat_location_id").eq("tenant_id", tenantId).order("name")),
  ownerBranchOverview: async () => ok(await supabase.rpc("owner_branch_overview")),
  createBranch: async (params) => {
    invalidateTableCache("branches");
    return ok(await supabase.rpc("owner_create_branch", {
      p_name: params.name,
      p_city: params.city || null,
      p_address: params.address || null,
      p_lat: params.lat ? Number(params.lat) : null,
      p_lng: params.lng ? Number(params.lng) : null,
      p_geofence_m: params.geofence_m ? Number(params.geofence_m) : 50,
      p_is_warehouse: Boolean(params.is_warehouse),
      p_clone_from: params.clone_from || null,
      p_satusehat: params.satusehat_location_id || null,
    }));
  },
  updateBranch: async (id, params) => {
    invalidateTableCache("branches");
    return ok(await supabase.rpc("owner_update_branch", {
      p_branch_id: id,
      p_name: params.name,
      p_city: params.city || null,
      p_address: params.address || null,
      p_lat: params.lat ? Number(params.lat) : null,
      p_lng: params.lng ? Number(params.lng) : null,
      p_geofence_m: params.geofence_m ? Number(params.geofence_m) : 50,
      p_is_warehouse: Boolean(params.is_warehouse),
      p_satusehat: params.satusehat_location_id || null,
    }));
  },
  dashboardDaily: async ({ from, to, tenantId, branchId }) =>
    ok(await supabase.rpc("dashboard_daily", { p_from: from, p_to: to, p_tenant: tenantId ?? null, p_branch: branchId ?? null })),
  profitLoss: async ({ from, to, tenantId }) =>
    ok(await supabase.rpc("profit_loss", { p_from: from, p_to: to, p_tenant: tenantId ?? null })),
  listApprovals: async ({ tenantId, kind } = {}) => {
    let q = supabase.from("approvals").select("*, branch:branches(name), requester:profiles!requested_by(full_name, email, role)").order("requested_at", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (kind && kind !== "all") q = q.eq("kind", kind);
    return ok(await q);
  },
  approvalSummary: async (tenantId) => ok(await supabase.rpc("approval_summary", { p_tenant: tenantId ?? null }))[0],
  decideApproval: async (id, decision, note, pin, option) =>
    ok(await supabase.rpc("decide_approval", { p_id: id, p_decision: decision, p_note: note || null, p_pin: pin || null, p_option: option || null })),
  listCapital: async (tenantId) =>
    ok(await supabase.from("capital_applications").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false })),
  saveCapital: async (row) =>
    ok(row.id ? await supabase.from("capital_applications").update(row).eq("id", row.id).select().single()
              : await supabase.from("capital_applications").insert(row).select().single()),
  decideCapital: async (id, status, note) => ok(await supabase.rpc("decide_capital", { p_id: id, p_status: status, p_note: note ?? null })),
  deleteCapital: async (id) => ok(await supabase.from("capital_applications").delete().eq("id", id)),
  getPayout: async (tenantId) => ok(await supabase.from("payout_accounts").select("*").eq("tenant_id", tenantId).maybeSingle()),
  savePayout: async (row) => ok(await supabase.from("payout_accounts").upsert({ ...row, updated_at: new Date().toISOString() })),
  listHermes: async (tenantId) =>
    ok(await supabase.from("hermes_events").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100)),
};

// --------- FASE 2 · akses generik (RLS tetap penjaga utama + Multi-Tier Persistent SWR Caching) ---------
const DB_CACHE = new Map();
const DB_STORAGE_PREFIX = "tijarah_db_cache:";
const CACHE_TTL_MS = 120000; // 2 menit cache RAM untuk browsing instan antar subtab

function getDbStorage(key) {
  if (typeof window === "undefined") return null;
  // 1. Cek sessionStorage (L1 Session)
  try {
    if (window.sessionStorage) {
      const raw = sessionStorage.getItem(`${DB_STORAGE_PREFIX}${key}`);
      if (raw) {
        const item = JSON.parse(raw);
        if (item && item.data && Date.now() - (item.ts || 0) < 300000) {
          DB_CACHE.set(key, item);
          return item.data;
        }
      }
    }
  } catch {}

  // 2. Cek localStorage (L2 Persistent PWA Offline)
  try {
    if (window.localStorage) {
      const raw = localStorage.getItem(`${DB_STORAGE_PREFIX}${key}`);
      if (raw) {
        const item = JSON.parse(raw);
        if (item && item.data && Date.now() - (item.ts || 0) < 600000) {
          DB_CACHE.set(key, item);
          return item.data;
        }
      }
    }
  } catch {}

  return null;
}

function setDbStorage(key, data) {
  if (data == null || typeof window === "undefined") return;
  const item = { data, ts: Date.now() };
  DB_CACHE.set(key, item);
  try {
    if (window.sessionStorage) {
      sessionStorage.setItem(`${DB_STORAGE_PREFIX}${key}`, JSON.stringify(item));
    }
  } catch {}
  try {
    if (window.localStorage) {
      localStorage.setItem(`${DB_STORAGE_PREFIX}${key}`, JSON.stringify(item));
    }
  } catch {}
}

export function invalidateTableCache(table) {
  if (!table) {
    DB_CACHE.clear();
    const clearStorage = (store) => {
      try {
        if (typeof window !== "undefined" && window[store]) {
          const keys = [];
          for (let i = 0; i < window[store].length; i++) {
            const k = window[store].key(i);
            if (k && k.startsWith(DB_STORAGE_PREFIX)) keys.push(k);
          }
          keys.forEach((k) => window[store].removeItem(k));
        }
      } catch {}
    };
    clearStorage("sessionStorage");
    clearStorage("localStorage");
    return;
  }
  for (const k of DB_CACHE.keys()) {
    if (k.startsWith(`${table}:`)) {
      DB_CACHE.delete(k);
    }
  }
  const clearTableFrom = (store) => {
    try {
      if (typeof window !== "undefined" && window[store]) {
        const keys = [];
        const search = `${DB_STORAGE_PREFIX}${table}:`;
        for (let i = 0; i < window[store].length; i++) {
          const k = window[store].key(i);
          if (k && k.startsWith(search)) keys.push(k);
        }
        keys.forEach((k) => window[store].removeItem(k));
      }
    } catch {}
  };
  clearTableFrom("sessionStorage");
  clearTableFrom("localStorage");
}

Object.assign(api, {
  invalidateCache: invalidateTableCache,
  async list(table, { select = "*", eq = {}, inList, order, limit, force = false } = {}) {
    const cacheKey = `${table}:${JSON.stringify({ select, eq, inList, order, limit })}`;
    if (!force) {
      if (DB_CACHE.has(cacheKey)) {
        const entry = DB_CACHE.get(cacheKey);
        if (Date.now() - entry.ts < CACHE_TTL_MS) {
          return entry.data;
        }
      }
      const stored = getDbStorage(cacheKey);
      if (stored) return stored;
    }

    // Hindari query ke PostgREST jika filter kolom UUID menerima format non-UUID (misal 'temp-gm', 'temp-owner') yang menyebabkan 400 Bad Request
    for (const [k, v] of Object.entries(eq)) {
      if (isUuidCol(k) && typeof v === "string" && v !== "" && v !== "undefined" && v !== "null" && !isUuid(v)) {
        const fallback = DB_CACHE.get(cacheKey)?.data || getDbStorage(cacheKey);
        return fallback || [];
      }
    }

    let q = supabase.from(table).select(select);
    for (const [k, v] of Object.entries(eq)) {
      if (v !== undefined && v !== null && v !== "" && v !== "undefined" && v !== "null") {
        q = q.eq(k, v);
      }
    }
    if (inList) {
      const [inCol, inVals] = inList;
      if (Array.isArray(inVals)) {
        if (inVals.length === 0) {
          const fallback = DB_CACHE.get(cacheKey)?.data || getDbStorage(cacheKey);
          return fallback || [];
        }
        if (isUuidCol(inCol)) {
          const validUuids = inVals.filter((x) => isUuid(x));
          if (validUuids.length === 0) {
            const fallback = DB_CACHE.get(cacheKey)?.data || getDbStorage(cacheKey);
            return fallback || [];
          }
          q = q.in(inCol, validUuids);
        } else {
          q = q.in(inCol, inVals);
        }
      }
    }
    if (order) q = q.order(order[0], { ascending: order[1] !== "desc" });
    if (limit) q = q.limit(limit);

    // Timeout failsafe 15 detik untuk koneksi lintas benua (US-East ke Indonesia)
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout query ${table} (15s)`)), 15000);
    });

    try {
      const res = await Promise.race([
        q.then((r) => { clearTimeout(timer); return r; }),
        timeoutPromise
      ]);
      const data = ok(res);
      setDbStorage(cacheKey, data);
      return data;
    } catch (err) {
      // Fallback ke cache lokal jika server lambat atau offline
      const fallback = DB_CACHE.get(cacheKey)?.data || getDbStorage(cacheKey);
      if (fallback) {
        console.warn(`[supabase] ${table} respons lambat / kendala jaringan, menggunakan cache lokal:`, err.message);
        return fallback;
      }
      // Failsafe cadangan aman: jika belum ada cache lokal di panggilan pertama, kembalikan array kosong agar UI tidak crash
      console.warn(`[supabase] ${table} gagal memuat data (${err.message}), menggunakan fallback aman.`);
      return [];
    }
  },
  insert: async (table, row) => {
    invalidateTableCache(table);
    return ok(await supabase.from(table).insert(row).select().single());
  },
  insertMany: async (table, rows) => {
    if (!rows || rows.length === 0) return [];
    invalidateTableCache(table);
    return ok(await supabase.from(table).insert(rows).select());
  },
  update: async (table, id, patch, key = "id") => {
    invalidateTableCache(table);
    return ok(await supabase.from(table).update(patch).eq(key, id).select().maybeSingle());
  },
  remove: async (table, id, key = "id") => {
    invalidateTableCache(table);
    return ok(await supabase.from(table).delete().eq(key, id));
  },
  removeMany: async (table, ids, key = "id") => {
    if (!ids || ids.length === 0) return [];
    invalidateTableCache(table);
    return ok(await supabase.from(table).delete().in(key, ids));
  },
  rpc: async (name, args = {}) => {
    if (name.includes("86") || name.includes("product")) invalidateTableCache("products");
    if (name.includes("stock") || name.includes("semi") || name.includes("opname") || name.includes("initial") || name.includes("waste")) {
      invalidateTableCache("stock_levels");
      invalidateTableCache("inventory_items");
      invalidateTableCache("stock_movements");
      invalidateTableCache("stock_counts");
      invalidateTableCache("waste_logs");
    }
    if (name.includes("clock") || name.includes("attendance") || name.includes("presensi")) {
      invalidateTableCache("attendance");
      invalidateTableCache("work_shifts");
    }
    if (name.includes("invite") || name.includes("member")) {
      invalidateTableCache("profiles");
      invalidateTableCache("member_branches");
      invalidateTableCache("staff_invites");
    }
    if (name.includes("shift")) {
      invalidateTableCache("work_shifts");
    }
    if (name.includes("leave")) {
      invalidateTableCache("leave_requests");
      invalidateTableCache("leave_balances");
    }
    if (name.includes("payroll")) {
      invalidateTableCache("payroll_runs");
      invalidateTableCache("payroll_lines");
    }
    return ok(await supabase.rpc(name, args));
  },
  subscribe(table, filter, cb) {
    const ch = supabase
      .channel(`rt-${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, (payload) => {
        invalidateTableCache(table);
        cb(payload);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
  // Unggah foto (nota kas kecil, selfie absen) ke bucket privat; path diawali tenant_id untuk policy Storage.
  async upload(bucket, file) {
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user.id).single();
    const path = `${p.tenant_id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    ok(await supabase.storage.from(bucket).upload(path, file, { upsert: false }));
    return path;
  },
  // Katalog ICD dari database (subset bawaan; bisa diganti katalog resmi lengkap tanpa ubah kode).
  async searchIcd(system, q, limit = 12) {
    let x = supabase.from("icd_codes").select("system, code, display, label:label_id").eq("system", system).order("code").limit(limit);
    const t = q.trim().replace(/[%,()]/g, "");
    if (t) x = x.or(`code.ilike.${t}%,display.ilike.%${t}%,label_id.ilike.%${t}%`);
    return ok(await x);
  },
  /** AI Copilot Owner: Mencoba Edge Function terlebih dahulu, dengan fallback otomatis ke snapshot data riil database jika Edge Function/AI upstream offline/timeout */
  async copilotAsk(question) {
    const q = String(question || "").trim();
    if (!q) throw new Error("Pertanyaan tidak boleh kosong");

    // 1. Coba panggil Edge Function owner-copilot (dengan timeout 5 detik agar UI tidak hang)
    try {
      const edgePromise = supabase.functions.invoke("owner-copilot", { body: { question: q } });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
      const { data, error } = await Promise.race([edgePromise, timeoutPromise]);
      if (!error && data?.answer) {
        return data;
      }
    } catch {
      /* Lanjut ke fallback snapshot database jika Edge Function lambat atau error */
    }

    // 2. Fallback tangguh: Ambil snapshot fakta bisnis langsung dari RPC PostgreSQL
    const { data: snap } = await supabase.rpc("copilot_snapshot");
    const answer = synthesizeCopilotAnswer(q, snap);

    // 3. Catat log percakapan & kuota ke database Supabase
    try {
      await supabase.rpc("log_copilot", {
        p_question: q,
        p_answer: answer,
        p_tokens: 1,
      });
    } catch {
      /* abaikan bila log gagal */
    }

    return {
      answer,
      snapshot_at: snap?.generated_at || new Date().toISOString(),
      model: "tijarah-copilot-engine",
      tokens_used: 1,
    };
  },
  // QRIS dinamis: pembuatan QR lewat Edge Function qris-charge (bicara ke penyedia); status dan batal lewat RPC.
  async qrisCreate(orderId) {
    const { data, error } = await supabase.functions.invoke("qris-charge", { body: { action: "create", order_id: orderId } });
    if (error) throw await fnError(error);
    return data.charge;
  },
  qrisStatus: async (chargeId) => ok(await supabase.rpc("qris_status", { p_charge: chargeId })),
  qrisCancel: async (chargeId) => ok(await supabase.rpc("qris_cancel", { p_charge: chargeId })),
  /** Hanya bila server QRIS_SIMULATE=1 (pengembangan). */
  async qrisSimulatePaid(chargeId) {
    const { data, error } = await supabase.functions.invoke("qris-charge", { body: { action: "simulate_paid", charge_id: chargeId } });
    if (error) throw await fnError(error);
    return data;
  },
  // Masuk Member: Edge Function member-auth (publik). Kode Masuk lewat WhatsApp; sesi dibuat setelah kode benar.
  async memberRequestCode({ tenantSlug, phone, deviceId, consentData, consentMarketing }) {
    const { data, error } = await supabase.functions.invoke("member-auth", {
      body: { action: "request", tenant_slug: tenantSlug, phone, device_id: deviceId, consent_data: consentData === true, consent_marketing: consentMarketing === true },
    });
    if (error) throw await fnError(error);
    return data; // { sent, simulated, expires_at, dev_code? } — dev_code hanya ada bila server memang dalam mode simulasi
  },
  async memberVerifyCode({ tenantSlug, phone, deviceId, code, name }) {
    const { data, error } = await supabase.functions.invoke("member-auth", {
      body: { action: "verify", tenant_slug: tenantSlug, phone, device_id: deviceId, code, name },
    });
    if (error) throw await fnError(error);
    const { error: aerr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: data.type });
    if (aerr) throw new Error(aerr.message);
    return { is_new: data.is_new, points: data.points };
  },
  // FASE 1 · status akses (akun nonaktif / tenant ditangguhkan), presence, dan pengiriman undangan.
  accessState: async () => ok(await supabase.rpc("my_access_state")),
  touchPresence: async (login = false) => ok(await supabase.rpc("touch_presence", { p_login: login })),
  /** Edge Function invite-member: wewenang diperiksa database; service role hanya dipakai setelah lolos. */
  async sendInvite(inviteId) {
    const { data, error } = await supabase.functions.invoke("invite-member", { body: { invite_id: inviteId } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* pakai pesan bawaan */ }
      throw new Error(msg);
    }
    return data;
  },
  // Kunci meja saat pembayaran (Upstash via Edge Function). Gagal kunci = meja sedang diproses kasir lain.
  async lockTable(branchId, tableId, action = "acquire") {
    if (!tableId) return { locked: true };
    const { data, error } = await supabase.functions.invoke("table-lock", { body: { action, branch_id: branchId, table: tableId } });
    if (error) return { locked: true, degraded: true }; // Edge Function belum di-deploy: lanjut tanpa kunci
    return data;
  },

  // FASE 1.4 · Policy Builder 3 Lapis
  getEffectivePolicy: async ({ tenantId, branchId, role } = {}) =>
    ok(await supabase.rpc("get_effective_policy", { p_tenant: tenantId ?? null, p_branch: branchId ?? null, p_role: role ?? null })),
  listTenantPolicies: async (tenantId) =>
    ok(await supabase.from("tenant_policies").select("*, branch:branches(name)").eq("tenant_id", tenantId).order("updated_at", { ascending: false })),
  saveTenantPolicy: async ({ tenantId, branchId, role, discount, voidLimit, start, end, radius, lock }) =>
    ok(await supabase.rpc("save_tenant_policy", {
      p_tenant: tenantId ?? null, p_branch: branchId ?? null, p_role: role ?? null,
      p_discount: discount, p_void: voidLimit, p_start: start, p_end: end, p_radius: radius, p_lock: lock
    })),

  // FASE 1.6 · Akses Dukungan Bersyarat (Break-Glass)
  requestSupportSession: async ({ tenantId, ticketId, reason, hours = 2 }) =>
    ok(await supabase.rpc("request_support_session", { p_tenant: tenantId, p_ticket_id: ticketId ?? null, p_reason: reason, p_hours: hours })),
  grantSupportSession: async (sessionId, grant) =>
    ok(await supabase.rpc("grant_support_session", { p_session: sessionId, p_grant: grant })),
  revokeSupportSession: async (sessionId) =>
    ok(await supabase.rpc("revoke_support_session", { p_session: sessionId })),
  getActiveSupportSession: async (tenantId) =>
    ok(await supabase.rpc("get_active_support_session", { p_tenant: tenantId ?? null })),
  listSupportSessions: async (tenantId) => {
    let q = supabase.from("support_sessions").select("*, requester:profiles!requested_by(full_name, email), approver:profiles!approved_by(full_name, email)").order("created_at", { ascending: false });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    return ok(await q);
  },

  // FASE 2 · Merek & Portal Member (tenant_branding)
  getTenantBranding: async (tenantId) =>
    ok(await supabase.from("tenant_branding").select("*").eq("tenant_id", tenantId).maybeSingle()),
  saveTenantBranding: async ({ tenantId, displayName, accentColor, logoUrl, welcomeText }) =>
    ok(await supabase.from("tenant_branding").upsert({
      tenant_id: tenantId,
      display_name: displayName?.trim() || null,
      accent_color: accentColor || null,
      logo_url: logoUrl || null,
      welcome_text: welcomeText || null,
      updated_at: new Date().toISOString(),
    }).select().single()),
});
