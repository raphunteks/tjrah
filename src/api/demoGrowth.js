// Fase 3, 4 & 5 di mode DEMO: tiruan RPC dari supabase/migrations/*_fase3_value_add, *_fase4_platform, *_fase5_hardening.
// Pesan galat & aturan MENYALIN fungsi SQL-nya; angka historis berasal dari data penjualan demo (SALES), hanya baseline demo.
import { can } from "../lib/rbac.js";

const T1 = "t1";
const DAY = 864e5;
const BASE_QTY = { e001: 210, e002: 90, e003: 120, e004: 260, e005: 180, e006: 70, e007: 25, e008: 60, e009: 140 };   // porsi/30 hari (demo)
const MONTH = (d) => `${d.slice(0, 7)}-01`;
const PLAN_AI = { starter: 0, growth: 250, enterprise: null };

const TEMPLATES = {
  fnb_cafe: { name: "Kafe & Resto", pillar: "fnb", products: [["KP-001", "Kopi Susu", "Kopi", 22000, "barista"], ["KP-002", "Americano", "Kopi", 18000, "barista"], ["NM-001", "Teh Lemon", "Non-Kopi", 15000, "barista"], ["MK-001", "Nasi Goreng", "Makanan", 32000, "dapur"], ["MK-002", "Mie Goreng", "Makanan", 30000, "dapur"], ["SN-001", "Kentang Goreng", "Camilan", 20000, "dapur"]],
    checklists: { open: ["Area kasir & meja bersih", "Suhu kulkas aman", "Uang modal dihitung"], close: ["Kompor & gas dimatikan", "Kas dihitung & dicocokkan", "Sampah dibuang"] },
    reports: [["daily_sales", "daily", 21, null], ["margin_watch", "weekly", 9, 1]], margin: 38 },
  retail_toko: { name: "Toko Retail", pillar: "retail", products: [["UM-001", "Barang Contoh A", "Umum", 25000, "dapur"], ["UM-002", "Barang Contoh B", "Umum", 50000, "dapur"]],
    checklists: { open: ["Rak & display rapi", "Uang modal dihitung"], close: ["Kas dihitung & dicocokkan", "Pintu & gudang terkunci"] }, reports: [["daily_sales", "daily", 21, null]], margin: 70 },
  service_salon: { name: "Salon & Layanan", pillar: "service", products: [["SV-001", "Potong Rambut", "Layanan", 50000, "dapur"], ["SV-002", "Creambath", "Layanan", 90000, "dapur"], ["SV-003", "Manicure", "Layanan", 70000, "dapur"]],
    checklists: { open: ["Alat disterilisasi", "Area kerja bersih"], close: ["Kas dihitung & dicocokkan", "Alat dibersihkan"] }, reports: [["daily_sales", "daily", 20, null]], margin: 50 },
  health_klinik_gigi: { name: "Klinik Gigi", pillar: "health", products: [["KG-001", "Konsultasi", "Layanan", 75000, "dapur"], ["KG-002", "Scaling", "Tindakan", 350000, "dapur"], ["KG-003", "Tambal Gigi", "Tindakan", 300000, "dapur"]],
    checklists: { open: ["Instrumen steril tersedia", "Dental unit berfungsi"], close: ["Limbah medis dipisah", "Kas dihitung & dicocokkan"] }, reports: [["daily_sales", "daily", 20, null]], margin: 60 },
};

export function createGrowth(ctx) {
  const { db, user, emit, persist, audit, err, need, tenantOk, branchOk, id, nowIso, sales, hermes, call, rp } = ctx;
  const role = () => user()?.role;
  const isSA = () => role() === "superadmin";
  const me = () => user();
  const todayStr = () => nowIso().slice(0, 10);
  const addDaysStr = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
  const done = (v, tables = []) => { persist(); tables.forEach(emit); return structuredClone(v); };
  const tenantId = () => (isSA() ? err("Pilih tenant terlebih dahulu") : me().tenant_id);
  const tenantRow = (t) => db.tenants.find((x) => x.id === t);
  const planOf = (t) => db.plans.find((p) => p.id === tenantRow(t)?.plan_id);

  // ── Seed (idempotent; muncul sekali per penyimpanan browser) ──
  db.promos ??= [{ id: "pr1", tenant_id: T1, branch_id: null, code: "HEMAT10", name: "Hemat 10% akhir pekan", kind: "pct", value: 10, min_spend: 50000, max_discount: 20000,
    starts_at: nowIso(), ends_at: null, usage_limit: null, used_count: 3, active: true, created_at: nowIso() }];
  db.promo_redemptions ??= [];
  db.branch_targets ??= [{ id: "bt1", tenant_id: T1, branch_id: "b1", month: MONTH(todayStr()), revenue_target: 90000000, max_cogs_pct: 38, max_void_pct: 2 },
    { id: "bt2", tenant_id: T1, branch_id: "b2", month: MONTH(todayStr()), revenue_target: 60000000, max_cogs_pct: 38, max_void_pct: 2 }];
  db.report_schedules ??= [{ id: "rs1", tenant_id: T1, kind: "daily_sales", freq: "daily", hour: 21, weekday: null, channel: "whatsapp", target: "Owner", active: true, last_run_at: null }];
  db.checklist_templates ??= [{ id: "ct1", tenant_id: T1, branch_id: null, kind: "close", active: true,
    items: [{ key: "kompor", label: "Kompor & gas dimatikan", required: true }, { key: "kas", label: "Kas dihitung & dicocokkan", required: true }, { key: "sampah", label: "Sampah dibuang", required: false }] }];
  db.shift_checklists ??= [];
  db.shift_swaps ??= [];
  db.feature_flags ??= [
    { key: "menu_engineering", description: "Menu engineering & peringatan margin", default_enabled: true, plans: [], rollout_pct: 100 },
    { key: "vouchers", description: "Promo & voucher", default_enabled: true, plans: [], rollout_pct: 100 },
    { key: "cash_projection", description: "Proyeksi arus kas", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 },
    { key: "ai_copilot", description: "AI Copilot Owner", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 },
    { key: "benchmark", description: "Benchmark anonim antar-tenant", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 },
    { key: "offline_pos", description: "Mode offline kasir", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 },
    { key: "qris_dynamic", description: "QRIS dinamis di layar bayar", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 },
    { key: "online_orders", description: "Pesanan online (omnichannel)", default_enabled: false, plans: ["growth", "enterprise"], rollout_pct: 100 }];
  db.tenant_flag_overrides ??= [];
  db.ai_usage ??= [{ tenant_id: T1, month: MONTH(todayStr()), calls: 14, tokens: 83200 }];
  db.copilot_logs ??= [];
  db.resellers ??= [];
  db.reseller_commissions ??= [];
  db.industry_templates = Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, pillar: t.pillar }));
  db.billing_on ??= true;                                  // demo: penagihan otomatis menyala agar alurnya bisa dicoba
  db.offline_refs ??= [];
  db.margin_alerts ??= {};
  for (const i of db.invoices) { i.reminder_stage ??= 0; i.due_date ??= addDaysStr(String(i.period).slice(0, 10), 7); }

  // ── Visibilitas tabel (meniru policy RLS) ──
  const visible = (table, row) => {
    const r = role();
    if (table === "feature_flags" || table === "industry_templates") return true;
    if (table === "tenant_flag_overrides" || table === "resellers" || table === "reseller_commissions") return r === "superadmin";
    if (table === "ai_usage") return r === "superadmin" || (tenantOk(row.tenant_id) && can(r, 1, "r"));
    if (table === "promos") return tenantOk(row.tenant_id) && can(r, 3, "r");
    if (table === "branch_targets") return tenantOk(row.tenant_id) && branchOk(row.branch_id) && can(r, 2, "r");
    if (table === "report_schedules" || table === "promo_redemptions") return tenantOk(row.tenant_id) && can(r, 2, "r");
    if (table === "copilot_logs") return tenantOk(row.tenant_id) && can(r, 2, "r") && ["owner", "superadmin"].includes(r);
    if (table === "checklist_templates") return tenantOk(row.tenant_id) && (!row.branch_id || branchOk(row.branch_id)) && can(r, 5, "r");
    if (table === "shift_checklists") return tenantOk(row.tenant_id) && branchOk(row.branch_id) && can(r, 5, "r");
    if (table === "shift_swaps") return tenantOk(row.tenant_id) && (row.requester_id === me().id || row.target_id === me().id || (["owner", "gm"].includes(r) && can(r, 13, "r") && branchOk(row.branch_id)));
    return false;
  };
  const TABLES = ["feature_flags", "industry_templates", "tenant_flag_overrides", "resellers", "reseller_commissions", "ai_usage", "promos", "branch_targets",
    "report_schedules", "promo_redemptions", "copilot_logs", "checklist_templates", "shift_checklists", "shift_swaps"];

  // ── Biaya resep (sama dengan _item_cost/_product_cost) ──
  const itemCost = (iid, depth = 0) => {
    const sub = db.bom_lines.filter((b) => b.parent_item_id === iid);
    if (depth < 5 && sub.length) return sub.reduce((a, b) => a + b.qty * itemCost(b.component_id, depth + 1), 0) / Math.max(Math.max(...sub.map((b) => b.yield_qty || 1)), 1);
    return db.items.find((i) => i.id === iid)?.cost_per_unit ?? 0;
  };
  const productCost = (pid) => db.bom_lines.filter((b) => b.product_id === pid).reduce((a, b) => a + b.qty * itemCost(b.component_id), 0);

  // ── Aliran flag ──
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const hasFlag = (t, key) => {
    const o = db.tenant_flag_overrides.find((x) => x.tenant_id === t && x.key === key);
    if (o) return o.enabled;
    const f = db.feature_flags.find((x) => x.key === key);
    if (!f) return false;
    const pc = planOf(t)?.code;
    if (!(f.default_enabled || (pc && f.plans.includes(pc)))) return false;
    return hash(t + key) % 100 < f.rollout_pct;
  };
  const needFlag = (t, key, msg) => { if (!hasFlag(t, key)) err(`${msg} tidak termasuk paket tenant ini`); };
  const aiQuota = (t) => { const tr = tenantRow(t); if (tr.ai_quota_override != null) return tr.ai_quota_override; const c = planOf(t)?.code; return c in PLAN_AI ? PLAN_AI[c] : 0; };
  const aiUsed = (t) => db.ai_usage.find((x) => x.tenant_id === t && x.month === MONTH(todayStr()))?.tokens ?? 0;

  // ── Agregat penjualan bulan tertentu (SALES demo + order live) ──
  function monthAgg(t, month) {
    const out = {};
    const add = (b, k, v) => { out[b] ??= { revenue: 0, orders: 0, cogs: 0, discount: 0, voids: 0, all: 0 }; out[b][k] += v; };
    if (t === T1) for (const r of sales.filter((r) => MONTH(r.day) === month && branchOk(r.branch_id))) {
      add(r.branch_id, "revenue", r.revenue); add(r.branch_id, "orders", r.orders); add(r.branch_id, "cogs", r.cogs); add(r.branch_id, "discount", r.discount); add(r.branch_id, "all", r.orders);
    }
    for (const o of db.orders.filter((o) => o.tenant_id === t && MONTH(o.created_at.slice(0, 10)) === month && branchOk(o.branch_id))) {
      if (o.status === "paid") { add(o.branch_id, "revenue", o.total); add(o.branch_id, "orders", 1); add(o.branch_id, "cogs", o.cogs); add(o.branch_id, "discount", o.discount); add(o.branch_id, "all", 1); }
      if (o.status === "void") { add(o.branch_id, "voids", 1); add(o.branch_id, "all", 1); }
    }
    return out;
  }
  const avgByWeekday = (t) => {   // rata-rata penjualan per hari-dalam-minggu (28 hari terakhir)
    const w = Array(7).fill(0);
    if (t !== T1) return w;
    const from = addDaysStr(todayStr(), -28);
    for (const r of sales.filter((r) => r.day >= from && branchOk(r.branch_id))) w[new Date(`${r.day}T00:00:00Z`).getUTCDay()] += r.revenue / 4;
    return w;
  };

  const kpi = (month) => {
    const t = tenantId();
    const m = MONTH(month ?? todayStr());
    const agg = monthAgg(t, m);
    const dAll = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    const dPass = m === MONTH(todayStr()) ? Math.max(+todayStr().slice(8, 10), 1) : dAll;
    return db.branches.filter((b) => b.tenant_id === t && !b.is_warehouse && branchOk(b.id)).sort((a, b) => a.name.localeCompare(b.name)).map((b) => {
      const k = agg[b.id] ?? { revenue: 0, orders: 0, cogs: 0, discount: 0, voids: 0, all: 0 };
      const g = db.branch_targets.find((x) => x.branch_id === b.id && x.month === m);
      const proj = Math.round((k.revenue / dPass) * dAll);
      const flags = [];
      if (g && k.revenue > 0 && (k.cogs / k.revenue) * 100 > g.max_cogs_pct) flags.push("HPP di atas batas");
      if (g && k.all > 0 && (k.voids / k.all) * 100 > g.max_void_pct) flags.push("Void di atas batas");
      return { branch_id: b.id, branch: b.name, revenue: k.revenue, orders: k.orders, avg_ticket: k.orders ? Math.round(k.revenue / k.orders) : 0,
        cogs_pct: k.revenue ? Math.round((k.cogs / k.revenue) * 1000) / 10 : 0, void_pct: k.all ? Math.round((k.voids / k.all) * 1000) / 10 : 0,
        discount_pct: k.revenue + k.discount ? Math.round((k.discount / (k.revenue + k.discount)) * 1000) / 10 : 0,
        revenue_target: g?.revenue_target ?? null, attainment_pct: g?.revenue_target ? Math.round((k.revenue / g.revenue_target) * 1000) / 10 : null,
        projected_revenue: proj, status: !g ? "tanpa_target" : proj >= g.revenue_target ? "on_track" : "di_bawah_target", flags };
    });
  };

  function menuRows(branch, days) {
    const t = tenantId();
    if (!Number.isInteger(days) || days < 1 || days > 365) err("Rentang hari harus 1–365");
    if (branch && (!branchOk(branch) || db.branches.find((b) => b.id === branch)?.tenant_id !== t)) err("Cabang tidak dapat diakses");
    const from = Date.now() - days * DAY;
    const sold = {};
    for (const it of db.order_items) {
      const o = db.orders.find((x) => x.id === it.order_id);
      if (o && o.tenant_id === t && o.status === "paid" && new Date(o.paid_at).getTime() >= from && branchOk(o.branch_id) && (!branch || o.branch_id === branch)) sold[it.product_id] = (sold[it.product_id] ?? 0) + it.qty;
    }
    const me_ = db.products.filter((p) => p.tenant_id === t).map((p) => {
      const q = Math.round(((BASE_QTY[p.id] ?? 0) * days) / 30) + (sold[p.id] ?? 0);
      const uc = productCost(p.id);
      return { product_id: p.id, name: p.name, category: p.category, price: p.price, unit_cost: Math.round(uc * 100) / 100, cost_pct: p.price > 0 ? Math.round((uc / p.price) * 1000) / 10 : null,
        margin: Math.round((p.price - uc) * 100) / 100, qty: q, revenue: q * p.price, contribution: Math.round(q * (p.price - uc) * 100) / 100 };
    });
    const sellers = me_.filter((r) => r.qty > 0);
    const totQ = sellers.reduce((a, r) => a + r.qty, 0);
    const popCut = sellers.length ? (0.7 * totQ) / sellers.length : 0;
    const avgM = totQ ? sellers.reduce((a, r) => a + r.qty * r.margin, 0) / totQ : 0;
    const ADV = { star: "Pertahankan kualitas, tampilkan menonjol.", plowhorse: "Laris tapi margin tipis: naikkan harga sedikit atau kurangi porsi/bahan.",
      puzzle: "Margin bagus tapi jarang dipesan: promosikan atau ubah posisi di menu.", dog: "Kurang laris dan margin rendah: pertimbangkan hapus atau resep ulang.",
      belum_laku: "Belum terjual pada periode ini; tinjau posisi di menu atau hapus." };
    return me_.map((r) => {
      const cls = r.qty === 0 ? "belum_laku" : r.qty >= popCut ? (r.margin >= avgM ? "star" : "plowhorse") : r.margin >= avgM ? "puzzle" : "dog";
      return { ...r, class: cls, advice: ADV[cls] };
    }).sort((a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name));
  }

  function promoCheck(t, branch, code, subtotal) {
    const p = db.promos.find((x) => x.tenant_id === t && x.code.toUpperCase() === String(code ?? "").trim().toUpperCase());
    if (!p || !p.active) err("Kode promo tidak dikenal atau tidak aktif");
    if (p.branch_id && p.branch_id !== branch) err("Promo tidak berlaku di cabang ini");
    if (Date.now() < new Date(p.starts_at).getTime()) err("Promo belum dimulai");
    if (p.ends_at && Date.now() > new Date(p.ends_at).getTime()) err("Promo sudah berakhir");
    if (p.usage_limit != null && p.used_count >= p.usage_limit) err("Kuota promo sudah habis");
    if (subtotal < p.min_spend) err(`Belanja minimal ${rp(p.min_spend)} untuk promo ini`);
    return p;
  }
  const promoDisc = (p, sub) => Math.min(p.max_discount != null ? Math.min(p.kind === "pct" ? Math.round((sub * p.value) / 100) : p.value, p.max_discount) : p.kind === "pct" ? Math.round((sub * p.value) / 100) : p.value, sub);
  const retax = (o, disc) => {
    const rate = Number(tenantRow(o.tenant_id)?.tax_rate ?? 0.1);
    const taxable = Math.max(0, o.subtotal - disc);
    o.discount = disc; o.tax = o.channel === "clinic" ? 0 : Math.round(taxable * rate); o.total = taxable + o.tax;
  };

  function swapCheck(s) {
    const a = db.work_shifts.find((w) => w.id === s.my_shift);
    if (!a || a.profile_id !== s.requester_id) err("Shift pemohon sudah berubah");
    if (a.work_date <= todayStr()) err("Hanya shift yang belum berlangsung yang bisa ditukar");
    const overlap = (pid, w, ignore) => db.work_shifts.some((x) => x.profile_id === pid && x.work_date === w.work_date && !ignore.includes(x.id) && x.start_time < w.end_time && w.start_time < x.end_time);
    if (!s.their_shift) { if (overlap(s.target_id, a, [a.id])) err("Tujuan sudah punya shift yang bentrok pada jam itu"); return; }
    const b = db.work_shifts.find((w) => w.id === s.their_shift);
    if (!b || b.profile_id !== s.target_id) err("Shift tujuan sudah berubah");
    if (b.work_date <= todayStr()) err("Hanya shift yang belum berlangsung yang bisa ditukar");
    if (b.branch_id !== a.branch_id) err("Tukar shift hanya antar karyawan di cabang yang sama");
    if (overlap(s.target_id, a, [a.id, b.id])) err("Tujuan bentrok pada jam shift pemohon");
    if (overlap(s.requester_id, b, [a.id, b.id])) err("Pemohon bentrok pada jam shift tujuan");
  }

  const hours = (a, b) => (new Date(`1970-01-01T${b.slice(0, 8)}Z`) - new Date(`1970-01-01T${a.slice(0, 8)}Z`)) / 36e5;

  function cashProjection(days, apDays) {
    const t = tenantId();
    need(12, "r");
    if (!["owner", "gm", "superadmin"].includes(role())) err("Proyeksi kas hanya untuk Owner/GM");
    needFlag(t, "cash_projection", "Proyeksi kas");
    if (!(days >= 7 && days <= 90)) err("Horizon 7–90 hari");
    let opening = 0, fixed = 0;
    if (t === T1) for (const r of sales) opening += r.revenue - r.tax - 2230000;
    for (const e of db.journal_entries.filter((e) => e.tenant_id === t)) for (const l of e.lines) if (l.code === "1101" || l.code === "1102") opening += l.dr - l.cr;
    const sales28 = t === T1 ? sales.filter((r) => r.day >= addDaysStr(todayStr(), -28)) : [];
    const rev = sales28.reduce((a, r) => a + r.revenue, 0), cg = sales28.reduce((a, r) => a + r.cogs, 0);
    const ratio = rev ? cg / rev : 0;
    fixed = t === T1 ? (600000 + 180000) * 2 / 2 : 0;   // sewa + listrik per hari (alokasi demo)
    const payroll = t === T1 ? 1450000 : 0, pday = 25;
    const w = avgByWeekday(t);
    let bal = opening, minb = opening, firstNeg = null;
    const rows = [];
    for (let i = 1; i <= days; i++) {
      const d = addDaysStr(todayStr(), i);
      const inflow = w[new Date(`${d}T00:00:00Z`).getUTCDay()];
      let outflow = inflow * ratio + fixed;
      if (+d.slice(8, 10) === pday) outflow += payroll;
      bal += inflow - outflow; minb = Math.min(minb, bal);
      if (bal < 0 && !firstNeg) firstNeg = d;
      rows.push({ date: d, inflow: Math.round(inflow), outflow: Math.round(outflow), balance: Math.round(bal) });
    }
    return { opening: Math.round(opening), min_balance: Math.round(minb), first_negative_date: firstNeg, ending: Math.round(bal), days,
      assumptions: ["Penjualan = rata-rata per hari-dalam-minggu dari 28 hari terakhir (tanpa tren musiman).", `Pembelian bahan = ${Math.round(ratio * 1000) / 10}% dari penjualan (HPP historis).`,
        `Beban tetap rata-rata ${rp(Math.round(fixed))} per hari, di luar gaji dan waste.`, `Gaji ${rp(payroll)} dibayar tanggal ${pday} tiap bulan (dari jurnal gaji terakhir).`,
        `Utang dagang ${rp(0)} dibayar hari ke-${apDays}.`], rows };
  }

  function markPaid(inv, ref) {
    if (inv.status === "paid") return inv;
    if (inv.status === "void") err("Tagihan sudah dibatalkan");
    Object.assign(inv, { status: "paid", paid_at: nowIso(), payment_ref: ref });
    const t = tenantRow(inv.tenant_id);
    const end = addDaysStr(String(inv.period).slice(0, 7) + "-28", 4).slice(0, 7) + "-01";
    if (!t.current_period_end || t.current_period_end < end) t.current_period_end = end;
    const overdue = db.invoices.some((x) => x.tenant_id === t.id && x.status === "unpaid" && x.due_date < todayStr());
    if (!overdue) {
      if (t.status === "past_due") t.status = "active";
      else if (t.status === "suspended" && String(t.suspended_reason ?? "").startsWith("Tagihan menunggak")) {
        t.status = ["active", "trial"].includes(t.status_before_suspend) ? t.status_before_suspend : "active";
        t.suspended_reason = null; t.suspended_at = null; t.status_before_suspend = null;
      }
    }
    const rs = t.reseller_id && db.resellers.find((r) => r.id === t.reseller_id && r.status === "active");
    if (rs && !db.reseller_commissions.some((c) => c.invoice_id === inv.id)) {
      db.reseller_commissions.unshift({ id: id(), reseller_id: rs.id, tenant_id: t.id, invoice_id: inv.id, base_amount: inv.amount, pct: rs.commission_pct,
        amount: Math.round((inv.amount * rs.commission_pct) / 100), status: "accrued", created_at: nowIso(), paid_at: null });
    }
    audit("invoice_paid", "invoices", inv.id, { ref, amount: inv.amount }, t.id);
    return inv;
  }
  const needSA = (m = "Hanya Superadmin") => { if (!isSA()) err(m); };

  const RPC = {
    // ═══ 3.1 Menu engineering ═══
    menu_engineering({ p_branch = null, p_days = 30 } = {}) { need(2, "r"); tenantId(); return structuredClone(menuRows(p_branch, p_days)); },
    check_margin_alerts() {
      need(2, "r"); const t = tenantId(); const lim = Number(tenantRow(t).margin_alert_pct ?? 40); let n = 0;
      for (const p of db.products.filter((x) => x.tenant_id === t && x.is_available && x.price > 0)) {
        const c = productCost(p.id);
        if (c > 0 && (c / p.price) * 100 > lim && !(db.margin_alerts[p.id] > Date.now() - 7 * DAY)) {
          db.margin_alerts[p.id] = Date.now(); n++;
          hermes(t, "whatsapp", "Owner", "margin_drop", `Margin menu "${p.name}" menipis: HPP ${Math.round((c / p.price) * 1000) / 10}% dari harga jual (batas ${lim}%).`, { product_id: p.id });
        }
      }
      return done(n);
    },
    // ═══ 3.2 KPI ═══
    set_branch_target({ p_branch, p_month, p_revenue, p_max_cogs_pct = 35, p_max_void_pct = 2 }) {
      need(2, "c");
      const b = db.branches.find((x) => x.id === p_branch);
      if (!b || !tenantOk(b.tenant_id) || !branchOk(b.id)) err("Cabang tidak dapat diakses");
      if (!(p_revenue >= 0)) err("Target omzet tidak valid");
      const m = MONTH(String(p_month));
      let r = db.branch_targets.find((x) => x.branch_id === b.id && x.month === m);
      if (!r) db.branch_targets.push((r = { id: id(), tenant_id: b.tenant_id, branch_id: b.id, month: m }));
      Object.assign(r, { revenue_target: p_revenue, max_cogs_pct: p_max_cogs_pct ?? 35, max_void_pct: p_max_void_pct ?? 2 });
      audit("target_set", "branch_targets", r.id, { month: m, revenue: p_revenue }, b.tenant_id);
      return done(r, ["branch_targets"]);
    },
    branch_kpi({ p_month = null } = {}) { need(2, "r"); return structuredClone(kpi(p_month)); },
    // ═══ 3.3 Laporan terjadwal ═══
    save_report_schedule({ p_kind, p_freq, p_hour, p_weekday = null, p_channel = "whatsapp", p_active = true }) {
      need(2, "c"); const t = tenantId();
      if (!["daily_sales", "weekly_kpi", "margin_watch"].includes(p_kind)) err("Jenis laporan tidak valid");
      if (p_freq === "weekly" && p_weekday == null) err("Laporan mingguan butuh hari");
      let r = db.report_schedules.find((x) => x.tenant_id === t && x.kind === p_kind);
      if (!r) db.report_schedules.push((r = { id: id(), tenant_id: t, kind: p_kind, target: "Owner", last_run_at: null }));
      Object.assign(r, { freq: p_freq, hour: p_hour, weekday: p_freq === "weekly" ? p_weekday : null, channel: p_channel, active: p_active });
      return done(r, ["report_schedules"]);
    },
    // ═══ 3.4 Checklist ═══
    save_checklist_template({ p_branch = null, p_kind, p_items, p_active = true }) {
      need(13, "u");
      if (!["owner", "gm"].includes(role())) err("Hanya Owner/GM yang mengatur checklist");
      const t = p_branch ? db.branches.find((b) => b.id === p_branch && tenantOk(b.tenant_id) && branchOk(b.id))?.tenant_id ?? err("Cabang tidak dapat diakses") : tenantId();
      if (!Array.isArray(p_items)) err("Daftar butir harus berupa array");
      if (p_items.some((i) => !String(i.key ?? "").trim() || !String(i.label ?? "").trim())) err("Setiap butir wajib punya key dan label");
      let r = db.checklist_templates.find((x) => x.tenant_id === t && (x.branch_id ?? null) === (p_branch ?? null) && x.kind === p_kind);
      if (!r) db.checklist_templates.push((r = { id: id(), tenant_id: t, branch_id: p_branch ?? null, kind: p_kind }));
      Object.assign(r, { items: p_items, active: p_active });
      return done(r, ["checklist_templates"]);
    },
    submit_checklist({ p_shift, p_kind, p_answers, p_note = null }) {
      need(5, "c");
      const s = db.shifts.find((x) => x.id === p_shift);
      if (!s || !tenantOk(s.tenant_id) || !branchOk(s.branch_id)) err("Shift tidak ditemukan");
      if (s.cashier_id !== me().id && !["owner", "gm"].includes(role())) err("Checklist hanya diisi kasir shift ini atau GM");
      if (!["open", "close", "handover"].includes(p_kind)) err("Jenis checklist tidak valid");
      if (s.status === "closed" && p_kind !== "close") err("Shift sudah ditutup");
      const tpl = db.checklist_templates.filter((x) => x.tenant_id === s.tenant_id && x.kind === p_kind && x.active && (x.branch_id === s.branch_id || !x.branch_id)).sort((a, b) => (b.branch_id ? 1 : 0) - (a.branch_id ? 1 : 0))[0];
      if (tpl) {
        const missing = tpl.items.filter((i) => i.required !== false && !(p_answers ?? {})[i.key]).map((i) => i.label);
        if (missing.length) err(`Butir wajib belum dipenuhi: ${missing.join(", ")}`);
      }
      if (p_kind === "handover" && String(p_note ?? "").trim().length < 10) err("Catatan serah terima minimal 10 karakter");
      let r = db.shift_checklists.find((x) => x.shift_id === s.id && x.kind === p_kind);
      if (!r) db.shift_checklists.unshift((r = { id: id(), tenant_id: s.tenant_id, branch_id: s.branch_id, shift_id: s.id, kind: p_kind }));
      Object.assign(r, { answers: p_answers ?? {}, note: String(p_note ?? "").trim() || null, submitted_by: me().id, created_at: nowIso() });
      return done(r, ["shift_checklists"]);
    },
    // ═══ 3.5 Promo ═══
    upsert_promo({ p_code, p_name, p_kind, p_value, p_min_spend = 0, p_max_discount = null, p_starts = null, p_ends = null, p_limit = null, p_branch = null, p_active = true, p_id = null }) {
      need(3, "c"); const t = tenantId();
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(String(p_code ?? "").trim())) err("Kode promo 3–20 karakter (huruf, angka, - atau _)");
      if (!["pct", "amount"].includes(p_kind) || !(p_value > 0) || (p_kind === "pct" && p_value > 100)) err("Nilai promo tidak valid");
      const code = p_code.trim().toUpperCase();
      if (db.promos.some((x) => x.tenant_id === t && x.code === code && x.id !== p_id)) err("Kode promo sudah dipakai");
      let r;
      if (p_id) { r = db.promos.find((x) => x.id === p_id && x.tenant_id === t); if (!r) err("Promo tidak ditemukan"); }
      else db.promos.unshift((r = { id: id(), tenant_id: t, code, used_count: 0, created_at: nowIso() }));
      Object.assign(r, { branch_id: p_branch, name: p_name, kind: p_kind, value: p_value, min_spend: p_min_spend ?? 0, max_discount: p_max_discount, starts_at: p_starts ?? r.starts_at ?? nowIso(), ends_at: p_ends, usage_limit: p_limit, active: p_active });
      audit("promo_saved", "promos", r.id, { code: r.code, kind: r.kind, value: r.value }, t);
      return done(r, ["promos"]);
    },
    validate_promo({ p_code, p_subtotal, p_branch }) {
      need(5, "r");
      const b = db.branches.find((x) => x.id === p_branch);
      if (!b || !tenantOk(b.tenant_id) || !branchOk(b.id)) err("Cabang tidak dapat diakses");
      const p = promoCheck(b.tenant_id, p_branch, p_code, p_subtotal);
      return { code: p.code, name: p.name, discount: promoDisc(p, p_subtotal) };
    },
    apply_voucher({ p_order, p_code }) {
      need(5, "u");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      if (o.status !== "open") err("Pesanan sudah tidak terbuka");
      const p = promoCheck(o.tenant_id, o.branch_id, p_code, o.subtotal);
      retax(o, promoDisc(p, o.subtotal)); o.voucher_code = p.code;
      audit("voucher_applied", "orders", o.id, { code: p.code, discount: o.discount }, o.tenant_id);
      return done(o, ["orders"]);
    },
    remove_voucher({ p_order }) {
      need(5, "u");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      if (o.status !== "open") err("Pesanan sudah tidak terbuka");
      retax(o, 0); o.voucher_code = null;
      return done(o, ["orders"]);
    },
    // ═══ 3.6 / 3.7 ═══
    cash_projection({ p_days = 30, p_ap_days = 14 } = {}) { return structuredClone(cashProjection(p_days, p_ap_days)); },
    copilot_snapshot() {
      need(2, "r");
      if (!["owner", "superadmin"].includes(role())) err("Copilot hanya untuk Owner");
      const t = tenantId(); needFlag(t, "ai_copilot", "AI Copilot");
      const mr = menuRows(null, 30);
      const pick = (c) => mr.filter((r) => c.includes(r.class)).slice(0, 5).map((r) => r.name);
      return structuredClone({ generated_at: nowIso(), kpi_bulan_ini: kpi(null), menu: { bintang: pick(["star"]), laris_margin_tipis: pick(["plowhorse"]), perlu_dievaluasi: pick(["dog", "belum_laku"]) },
        kas: (({ rows, ...k }) => k)(cashProjection(30, 14)), persetujuan_menunggu: db.approvals.filter((a) => a.tenant_id === t && a.status === "pending").length,
        stok_di_bawah_minimum: db.stock_levels.filter((s) => { const i = db.items.find((x) => x.id === s.item_id); return i && i.tenant_id === t && i.min_qty > 0 && s.qty < i.min_qty; }).length,
        void_7_hari: db.orders.filter((o) => o.tenant_id === t && o.status === "void" && Date.now() - new Date(o.created_at).getTime() < 7 * DAY).length });
    },
    log_copilot({ p_question, p_answer, p_tokens = null }) {
      need(2, "r"); if (role() !== "owner") err("Copilot hanya untuk Owner");
      db.copilot_logs.unshift({ id: id(), tenant_id: me().tenant_id, user_id: me().id, question: String(p_question).slice(0, 2000), answer: String(p_answer).slice(0, 8000), tokens: p_tokens, created_at: nowIso() });
      return done(null, ["copilot_logs"]);
    },
    /** Pengganti Edge Function owner-copilot di mode demo: jawaban deterministik dari snapshot, kuota & log sama seperti produksi. */
    copilot_ask_demo({ p_question }) {
      const q = String(p_question ?? "").trim();
      if (q.length < 3 || q.length > 1000) err("Pertanyaan 3–1000 karakter");
      const snap = RPC.copilot_snapshot(); const t = tenantId();
      const quota = aiQuota(t);
      if (quota != null && quota <= 0) err("Kuota token AI paket ini 0 — upgrade paket atau minta tambahan kuota");
      if (quota != null && aiUsed(t) >= quota) err("Kuota token AI bulan ini habis");
      const kp = Array.isArray(snap.kpi_bulan_ini) ? snap.kpi_bulan_ini : [];
      const kas = snap.kas ?? {};
      const lines = [`Ringkasan demo (bukan jawaban model sungguhan) untuk: “${q}”`,
        `• Persetujuan menunggu: ${snap.persetujuan_menunggu}; stok di bawah minimum: ${snap.stok_di_bawah_minimum}; void 7 hari: ${snap.void_7_hari}.`,
        `• Menu bintang: ${snap.menu.bintang.join(", ") || "—"}; perlu dievaluasi: ${snap.menu.perlu_dievaluasi.join(", ") || "—"}.`,
        `• Kas: saldo ${rp(kas.opening ?? 0)} → ${rp(kas.ending ?? 0)} dalam ${kas.days ?? 30} hari (terendah ${rp(kas.min_balance ?? 0)}${kas.first_negative_date ? `, negatif mulai ${kas.first_negative_date}` : ", tidak pernah negatif"}).`,
        ...kp.map((c) => `• ${c.branch}: omzet ${rp(c.revenue)}${c.attainment_pct != null ? ` (${c.attainment_pct}% dari target)` : ""}, HPP ${c.cogs_pct}%, void ${c.void_pct}%${c.flags.length ? ` — perhatian: ${c.flags.join(", ")}` : ""}.`)];
      const answer = lines.join("\n"); const tokens = Math.ceil((q.length + answer.length) / 3);
      RPC.log_copilot({ p_question: q, p_answer: answer, p_tokens: tokens });
      RPC.ai_record_usage_demo(t, tokens);
      return { answer, snapshot_at: snap.generated_at };
    },
    // ═══ 4.1 Tagihan ═══
    generate_invoices({ p_period = null } = {}) {
      needSA("Hanya untuk Superadmin/sistem");
      if (!db.billing_on) return 0;
      const per = MONTH(String(p_period ?? todayStr())); let n = 0;
      for (const t of db.tenants.filter((x) => ["active", "past_due"].includes(x.status))) {
        const price = db.plans.find((p) => p.id === t.plan_id)?.price_month;
        if (!price || db.invoices.some((i) => i.tenant_id === t.id && String(i.period).slice(0, 10) === per && i.status !== "void")) continue;
        const dd = addDaysStr(per, 7), min = addDaysStr(todayStr(), 7);
        db.invoices.unshift({ id: id(), tenant_id: t.id, period: per, amount: price, status: "unpaid", due_date: dd > min ? dd : min, reminder_stage: 0 }); n++;
      }
      return done(n, ["invoices"]);
    },
    run_dunning() {
      needSA("Hanya untuk Superadmin/sistem");
      if (!db.billing_on) return 0;
      let n = 0;
      for (const i of db.invoices.filter((x) => x.status === "unpaid")) {
        const t = tenantRow(i.tenant_id);
        if (!t || !["active", "past_due"].includes(t.status)) continue;
        const d = Math.floor((new Date(`${todayStr()}T00:00:00Z`) - new Date(`${i.due_date}T00:00:00Z`)) / DAY);
        const stage = d >= 14 ? 4 : d >= 7 ? 3 : d >= 3 ? 2 : d >= 1 ? 1 : 0;
        if (stage <= i.reminder_stage) continue;
        const per = String(i.period).slice(0, 7);
        const msg = [null, `Pengingat: tagihan Tijarah ${per} sebesar ${rp(i.amount)} jatuh tempo ${i.due_date}. Mohon segera dibayar.`,
          `Tagihan ${per} (${rp(i.amount)}) terlambat ${d} hari. Akun masuk status tertunggak.`,
          `PERINGATAN AKHIR: tagihan ${per} (${rp(i.amount)}) terlambat ${d} hari. Akun akan ditangguhkan pada H+14 jika belum dibayar.`,
          `Akun ${t.name} ditangguhkan karena tagihan ${per} (${rp(i.amount)}) belum dibayar. Hubungi tim Tijarah untuk mengaktifkan kembali.`][stage];
        hermes(t.id, "whatsapp", "Owner", "dunning", msg, { invoice_id: i.id, stage });
        i.reminder_stage = stage;
        if (stage >= 2 && t.status === "active") t.status = "past_due";
        if (stage === 4) { Object.assign(t, { status_before_suspend: t.status, status: "suspended", suspended_reason: "Tagihan menunggak (otomatis)", suspended_at: nowIso() }); audit("tenant_suspended_dunning", "invoices", i.id, {}, t.id); }
        n++;
      }
      return done(n, ["invoices"]);
    },
    mark_invoice_paid({ p_invoice, p_ref = null }) {
      needSA("Hanya Superadmin yang mengonfirmasi pembayaran");
      const i = db.invoices.find((x) => x.id === p_invoice); if (!i) err("Tagihan tidak ditemukan");
      return done(markPaid(i, p_ref ?? "manual"), ["invoices"]);
    },
    void_invoice({ p_invoice, p_reason }) {
      needSA();
      if (String(p_reason ?? "").trim().length < 5) err("Alasan pembatalan wajib");
      const i = db.invoices.find((x) => x.id === p_invoice);
      if (!i || i.status === "void") err("Tagihan tidak ditemukan");
      if (i.status === "paid") err("Tagihan lunas tidak bisa dibatalkan");
      i.status = "void"; audit("invoice_void", "invoices", i.id, { reason: p_reason }, i.tenant_id);
      return done(i, ["invoices"]);
    },
    billing_status() {
      need(1, "r"); const t = tenantId(); const tr = tenantRow(t);
      return { status: tr.status, period_end: tr.current_period_end, unpaid: db.invoices.filter((i) => i.tenant_id === t && i.status === "unpaid").map((i) => ({
        id: i.id, period: i.period, amount: i.amount, due: i.due_date, days_overdue: Math.max(Math.floor((new Date(`${todayStr()}T00:00:00Z`) - new Date(`${i.due_date}T00:00:00Z`)) / DAY), 0), suspend_on: addDaysStr(i.due_date, 14) })) };
    },
    // ═══ 4.2 Flags ═══
    my_flags() { const t = isSA() ? null : me().tenant_id; return Object.fromEntries(db.feature_flags.map((f) => [f.key, t ? hasFlag(t, f.key) : false])); },
    set_feature_flag({ p_key, p_description, p_default, p_plans, p_rollout = 100 }) {
      needSA("Hanya Superadmin yang mengelola feature flag");
      if (!/^[a-z][a-z0-9_]{2,40}$/.test(p_key ?? "")) err("Kunci flag tidak valid");
      if (!(p_rollout >= 0 && p_rollout <= 100)) err("Rollout 0–100");
      let f = db.feature_flags.find((x) => x.key === p_key);
      if (!f) db.feature_flags.push((f = { key: p_key }));
      Object.assign(f, { description: p_description, default_enabled: !!p_default, plans: p_plans ?? [], rollout_pct: p_rollout });
      audit("flag_saved", "feature_flags", p_key, { ...f }, null);
      return done(f, ["feature_flags"]);
    },
    set_flag_override({ p_tenant, p_key, p_enabled, p_reason = null }) {
      needSA("Hanya Superadmin yang mengelola feature flag");
      db.tenant_flag_overrides = db.tenant_flag_overrides.filter((x) => !(x.tenant_id === p_tenant && x.key === p_key));
      if (p_enabled != null) db.tenant_flag_overrides.push({ tenant_id: p_tenant, key: p_key, enabled: p_enabled, reason: p_reason, updated_at: nowIso() });
      audit("flag_override", "feature_flags", p_key, { enabled: p_enabled, reason: p_reason }, p_tenant);
      return done(null, ["tenant_flag_overrides"]);
    },
    // ═══ 4.3 AI ═══
    ai_usage_summary() {
      need(1, "r"); const t = tenantId(); const q = aiQuota(t); const u = db.ai_usage.find((x) => x.tenant_id === t && x.month === MONTH(todayStr()));
      return { month: MONTH(todayStr()), calls: u?.calls ?? 0, tokens: u?.tokens ?? 0, quota: q, pct: q ? Math.round(((u?.tokens ?? 0) / q) * 1000) / 10 : null };
    },
    set_ai_quota({ p_tenant, p_tokens }) { needSA(); tenantRow(p_tenant).ai_quota_override = p_tokens; audit("ai_quota_set", "tenants", p_tenant, { tokens: p_tokens }, p_tenant); return done(null, ["tenants"]); },
    ai_record_usage_demo(t, tokens) {
      let u = db.ai_usage.find((x) => x.tenant_id === t && x.month === MONTH(todayStr()));
      if (!u) db.ai_usage.push((u = { tenant_id: t, month: MONTH(todayStr()), calls: 0, tokens: 0 }));
      u.calls++; u.tokens += tokens; persist();
    },
    // ═══ 4.4 Template ═══
    apply_industry_template({ p_key, p_apply_settings = false }) {
      need(3, "c"); if (role() !== "owner") err("Hanya Owner yang menerapkan template industri");
      const t = tenantId(); const tp = TEMPLATES[p_key]; if (!tp) err("Template tidak ditemukan");
      if (tp.pillar !== tenantRow(t).pillar) err(`Template ${tp.name} untuk jenis usaha lain`);
      let np = 0, nc = 0, nr = 0;
      for (const [sku, name, category, price, station] of tp.products) if (!db.products.some((p) => p.tenant_id === t && p.sku === sku)) { db.products.push({ id: id(), tenant_id: t, sku, name, category, price, station, is_available: true, barcode: null }); np++; }
      for (const [kind, labels] of Object.entries(tp.checklists)) if (!db.checklist_templates.some((c) => c.tenant_id === t && !c.branch_id && c.kind === kind)) {
        db.checklist_templates.push({ id: id(), tenant_id: t, branch_id: null, kind, active: true, items: labels.map((label, i) => ({ key: `k${i + 1}`, label, required: true })) }); nc++;
      }
      for (const [kind, freq, hour, weekday] of tp.reports) if (!db.report_schedules.some((r) => r.tenant_id === t && r.kind === kind)) { db.report_schedules.push({ id: id(), tenant_id: t, kind, freq, hour, weekday, channel: "whatsapp", target: "Owner", active: true, last_run_at: null }); nr++; }
      if (p_apply_settings) tenantRow(t).margin_alert_pct = tp.margin;
      audit("template_applied", "industry_templates", p_key, { products: np, checklists: nc, reports: nr }, t);
      return done({ products: np, checklists: nc, reports: nr }, ["products", "checklist_templates", "report_schedules"]);
    },
    // ═══ 4.5 Offline ═══
    sync_offline_orders({ p_device, p_batch }) {
      need(5, "c"); const t = tenantId();
      if (!Array.isArray(p_batch)) err("Batch harus berupa array");
      if (p_batch.length > 50) err("Maksimal 50 transaksi per sinkronisasi");
      needFlag(t, "offline_pos", "Mode offline");
      const res = [];
      for (const e of p_batch) {
        const ref = String(e.client_ref ?? "").trim().slice(0, 80);
        if (!ref) { res.push({ client_ref: null, status: "error", error: "client_ref wajib" }); continue; }
        const ex = db.orders.find((o) => o.tenant_id === t && o.client_ref === ref);
        if (ex) { res.push({ client_ref: ref, status: "duplicate", code: ex.code }); continue; }
        try {
          const o = call("create_order", { p_branch: e.branch_id, p_items: e.items });
          const paid = call("pay_order", { p_order: o.id, p_payments: e.payments, p_customer_phone: e.customer_phone || null, p_discount: e.discount ?? null, p_pin: e.pin || null });
          const row = db.orders.find((x) => x.id === paid.id); row.client_ref = ref;
          const at = e.created_at ? new Date(e.created_at).getTime() : Date.now();
          const diff = (e.expected_total ?? paid.total) - paid.total;
          res.push({ client_ref: ref, status: "ok", code: paid.code, total: paid.total, total_diff: diff, time_suspect: at > Date.now() || at < Date.now() - 72 * 36e5 });
          audit("offline_sync", "orders", paid.id, { device: String(p_device).slice(0, 60), diff }, t);
        } catch (x) { res.push({ client_ref: ref, status: "error", error: x.message }); }
      }
      return done(res, ["orders"]);
    },
    // ═══ 4.6 Benchmark ═══
    set_benchmark_opt_in({ p_on }) { need(2, "c"); if (role() !== "owner") err("Hanya Owner"); tenantRow(me().tenant_id).benchmark_opt_in = !!p_on; audit("benchmark_opt_in", "tenants", me().tenant_id, { on: p_on }, me().tenant_id); return done(!!p_on, ["tenants"]); },
    my_benchmark() {
      need(2, "r"); if (role() !== "owner") err("Benchmark hanya untuk Owner");
      const t = tenantId(); needFlag(t, "benchmark", "Benchmark");
      if (!tenantRow(t).benchmark_opt_in) return { available: false, reason: "Aktifkan partisipasi benchmark terlebih dahulu" };
      const last = new Date(); last.setUTCMonth(last.getUTCMonth() - 1);
      const k = Object.values(monthAgg(t, MONTH(last.toISOString().slice(0, 10)))).reduce((a, r) => ({ revenue: a.revenue + r.revenue, orders: a.orders + r.orders, cogs: a.cogs + r.cogs, discount: a.discount + r.discount, voids: a.voids + r.voids, all: a.all + r.all }), { revenue: 0, orders: 0, cogs: 0, discount: 0, voids: 0, all: 0 });
      const nb = Math.max(db.branches.filter((b) => b.tenant_id === t && !b.is_warehouse).length, 1);
      const mine = { avg_ticket: k.orders ? k.revenue / k.orders : 0, cogs_pct: k.revenue ? (k.cogs / k.revenue) * 100 : 0, void_pct: k.all ? (k.voids / k.all) * 100 : 0, discount_pct: k.revenue + k.discount ? (k.discount / (k.revenue + k.discount)) * 100 : 0, revenue_per_branch: k.revenue / nb };
      const peers = [[118000, 33, 1.2, 2.5, 52e6], [132000, 31, 0.8, 3.1, 61e6], [145000, 35, 1.9, 4.0, 74e6], [101000, 29, 0.6, 1.8, 43e6]];   // kohort contoh (demo)
      const cols = ["avg_ticket", "cogs_pct", "void_pct", "discount_pct", "revenue_per_branch"];
      const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
      const metrics = Object.fromEntries(cols.map((c, j) => { const all = [mine[c], ...peers.map((p) => p[j])]; return [c, { mine: Math.round(mine[c] * 10) / 10, p25: Math.round(q(all, 0.25) * 10) / 10, median: Math.round(q(all, 0.5) * 10) / 10, p75: Math.round(q(all, 0.75) * 10) / 10, rank_pct: Math.round((100 * all.filter((v) => v < mine[c]).length) / all.length) }]; }));
      return { available: true, month: MONTH(last.toISOString().slice(0, 10)), cohort_size: 5, metrics };
    },
    // ═══ 4.7 Reseller ═══
    create_reseller({ p_code, p_name, p_email = null, p_pct = 20 }) {
      needSA("Hanya Superadmin yang mengelola reseller");
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(p_code ?? "")) err("Kode reseller tidak valid");
      if (!(p_pct >= 0 && p_pct <= 50)) err("Komisi 0–50%");
      if (db.resellers.some((r) => r.code === p_code.toUpperCase())) err("Kode reseller sudah dipakai");
      const r = { id: id(), code: p_code.toUpperCase(), name: String(p_name).trim(), contact_email: p_email, commission_pct: p_pct, status: "active", created_at: nowIso() };
      db.resellers.unshift(r); audit("reseller_created", "resellers", r.id, { code: r.code, pct: r.commission_pct }, null);
      return done(r, ["resellers"]);
    },
    assign_reseller({ p_tenant, p_reseller }) {
      needSA("Hanya Superadmin yang mengelola reseller");
      if (p_reseller && !db.resellers.some((r) => r.id === p_reseller && r.status === "active")) err("Reseller tidak aktif");
      const t = tenantRow(p_tenant); if (!t) err("Tenant tidak ditemukan");
      t.reseller_id = p_reseller ?? null; audit("reseller_assigned", "tenants", p_tenant, { reseller: p_reseller }, p_tenant);
      return done(t, ["tenants"]);
    },
    reseller_statement({ p_reseller }) {
      needSA("Hanya Superadmin yang melihat laporan reseller");
      const r = db.resellers.find((x) => x.id === p_reseller);
      const cs = db.reseller_commissions.filter((c) => c.reseller_id === p_reseller);
      const sum = (s) => cs.filter((c) => c.status === s).reduce((a, c) => a + c.amount, 0);
      return structuredClone({ reseller: r, tenants_aktif: db.tenants.filter((t) => t.reseller_id === p_reseller && ["active", "past_due"].includes(t.status)).length, accrued: sum("accrued"), paid: sum("paid"),
        lines: cs.map((c) => ({ tenant: tenantRow(c.tenant_id)?.name, invoice_period: db.invoices.find((i) => i.id === c.invoice_id)?.period, base: c.base_amount, pct: c.pct, amount: c.amount, status: c.status })) });
    },
    pay_reseller_commissions({ p_reseller }) {
      needSA("Hanya Superadmin yang membayar komisi");
      let total = 0; for (const c of db.reseller_commissions.filter((x) => x.reseller_id === p_reseller && x.status === "accrued")) { c.status = "paid"; c.paid_at = nowIso(); total += c.amount; }
      audit("reseller_paid", "resellers", p_reseller, { amount: total }, null);
      return done(total, ["reseller_commissions"]);
    },
    // ═══ 5.2 Tukar shift ═══
    request_swap({ p_my_shift, p_target, p_their_shift = null, p_reason = null }) {
      if (!["staff", "dokter", "gm"].includes(role())) err("Peran ini tidak menukar shift");
      const a = db.work_shifts.find((w) => w.id === p_my_shift);
      if (!a || a.profile_id !== me().id || !tenantOk(a.tenant_id)) err("Shift tidak ditemukan");
      if (String(p_reason ?? "").trim().length < 5) err("Alasan minimal 5 karakter");
      const tg = db.profiles.find((p) => p.id === p_target && p.tenant_id === a.tenant_id && p.is_active !== false);
      if (!tg || tg.id === me().id) err("Karyawan tujuan tidak valid");
      if (tg.role !== role()) err("Tukar shift hanya antar peran yang sama");
      if (!(tg.branch_id === a.branch_id || db.member_branches.some((m) => m.profile_id === tg.id && m.branch_id === a.branch_id))) err("Karyawan tujuan tidak ditugaskan di cabang ini");
      if (db.shift_swaps.some((x) => x.my_shift === p_my_shift && ["requested", "accepted"].includes(x.status))) err("Shift ini sudah punya permintaan tukar yang berjalan");
      const s = { id: id(), tenant_id: a.tenant_id, branch_id: a.branch_id, requester_id: me().id, target_id: p_target, my_shift: p_my_shift, their_shift: p_their_shift, reason: p_reason.trim(), status: "requested", decided_by: null, decision_note: null, created_at: nowIso(), decided_at: null };
      swapCheck(s); db.shift_swaps.unshift(s);
      return done(s, ["shift_swaps"]);
    },
    respond_swap({ p_swap, p_accept }) {
      const s = db.shift_swaps.find((x) => x.id === p_swap);
      if (!s || s.target_id !== me().id) err("Permintaan tidak ditemukan");
      if (s.status !== "requested") err(`Permintaan sudah ${s.status}`);
      if (p_accept) swapCheck(s);
      s.status = p_accept ? "accepted" : "declined";
      if (p_accept) hermes(s.tenant_id, "whatsapp", "GM", "inquiry", "Ada permintaan tukar shift yang menunggu persetujuan GM.", { swap_id: s.id });
      return done(s, ["shift_swaps"]);
    },
    cancel_swap({ p_swap }) {
      const s = db.shift_swaps.find((x) => x.id === p_swap);
      if (!s || s.requester_id !== me().id) err("Permintaan tidak ditemukan");
      if (!["requested", "accepted"].includes(s.status)) err(`Permintaan sudah ${s.status}`);
      s.status = "cancelled"; return done(s, ["shift_swaps"]);
    },
    decide_swap({ p_swap, p_approve, p_note = null }) {
      need(13, "u"); if (!["owner", "gm"].includes(role())) err("Hanya GM/Owner yang memutuskan tukar shift");
      const s = db.shift_swaps.find((x) => x.id === p_swap);
      if (!s || !tenantOk(s.tenant_id) || !branchOk(s.branch_id)) err("Permintaan tidak ditemukan");
      if (s.status !== "accepted") err(`Permintaan belum disetujui rekan atau sudah diputuskan (${s.status})`);
      if (!p_approve && String(p_note ?? "").trim().length < 5) err("Alasan penolakan wajib diisi");
      if (p_approve) {
        swapCheck(s);
        db.work_shifts.find((w) => w.id === s.my_shift).profile_id = s.target_id;
        if (s.their_shift) db.work_shifts.find((w) => w.id === s.their_shift).profile_id = s.requester_id;
      }
      Object.assign(s, { status: p_approve ? "approved" : "rejected", decided_by: me().id, decision_note: String(p_note ?? "").trim() || null, decided_at: nowIso() });
      audit(p_approve ? "swap_approved" : "swap_rejected", "shift_swaps", s.id, { requester: s.requester_id, target: s.target_id }, s.tenant_id);
      return done(s, ["shift_swaps", "work_shifts"]);
    },
    swap_candidates({ p_my_shift }) {
      if (!["staff", "dokter", "gm"].includes(role())) err("Peran ini tidak menukar shift");
      const a = db.work_shifts.find((w) => w.id === p_my_shift);
      if (!a || a.profile_id !== me().id || !tenantOk(a.tenant_id)) err("Shift tidak ditemukan");
      const lim = addDaysStr(todayStr(), 30);
      return structuredClone(db.profiles.filter((p) => p.tenant_id === a.tenant_id && p.is_active !== false && p.id !== me().id && p.role === role()
        && (p.branch_id === a.branch_id || db.member_branches.some((m) => m.profile_id === p.id && m.branch_id === a.branch_id)))
        .map((p) => ({ profile_id: p.id, full_name: p.full_name, shifts: db.work_shifts.filter((w) => w.profile_id === p.id && w.branch_id === a.branch_id && w.work_date > todayStr() && w.work_date <= lim)
          .sort((x, y) => (x.work_date + x.start_time).localeCompare(y.work_date + y.start_time)).map((w) => ({ id: w.id, work_date: w.work_date, start_time: w.start_time, end_time: w.end_time })) })));
    },
    my_swaps() {
      const nm = (i) => db.profiles.find((p) => p.id === i)?.full_name ?? null;
      const sh = (i) => { const w = i && db.work_shifts.find((x) => x.id === i); return w ? { id: w.id, work_date: w.work_date, start_time: w.start_time, end_time: w.end_time } : null; };
      return structuredClone(db.shift_swaps.filter((s) => visible("shift_swaps", s)).map((s) => ({ id: s.id, status: s.status, reason: s.reason, decision_note: s.decision_note, created_at: s.created_at,
        requester_id: s.requester_id, target_id: s.target_id, branch_id: s.branch_id, requester: nm(s.requester_id), target: nm(s.target_id), my_shift: sh(s.my_shift), their_shift: sh(s.their_shift) })));
    },
    // ═══ 5.3 Labour cost ═══
    labour_cost_estimate({ p_from, p_to, p_branch = null }) {
      need(13, "r"); if (!["owner", "gm", "superadmin"].includes(role())) err("Estimasi labour cost hanya untuk Owner/GM");
      const t = tenantId();
      const span = (new Date(p_to) - new Date(p_from)) / DAY;
      if (!p_from || !p_to || span < 0 || span > 62) err("Rentang tanggal 1–62 hari");
      if (p_branch && !branchOk(p_branch)) err("Cabang tidak dapat diakses");
      const w = avgByWeekday(t);
      const byDay = {}; const missing = new Set();
      for (const s of db.work_shifts.filter((x) => x.tenant_id === t && x.work_date >= p_from && x.work_date <= p_to && branchOk(x.branch_id) && (!p_branch || x.branch_id === p_branch))) {
        const pr = db.profiles.find((p) => p.id === s.profile_id); const h = hours(s.start_time, s.end_time);
        const d = (byDay[s.work_date] ??= { hours: 0, cost: 0, people: new Set() });
        d.hours += h; d.cost += (h * (pr?.base_salary ?? 0)) / 173; d.people.add(s.profile_id);
        if (!(pr?.base_salary > 0)) missing.add(pr?.full_name ?? "?");
      }
      const rows = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => {
        const fs = w[new Date(`${date}T00:00:00Z`).getUTCDay()];
        return { date, hours: Math.round(d.hours * 10) / 10, people: d.people.size, cost: Math.round(d.cost), forecast_sales: Math.round(fs), labour_pct: fs > 0 ? Math.round((d.cost / fs) * 1000) / 10 : null };
      });
      const tc = rows.reduce((a, r) => a + r.cost, 0), ts = rows.reduce((a, r) => a + r.forecast_sales, 0);
      return { rows, total_cost: tc, total_forecast_sales: ts, labour_pct: ts > 0 ? Math.round((tc / ts) * 1000) / 10 : null, missing_salary: [...missing] };
    },
  };

  /** Dipanggil pay_order/applyVoid demo agar pemakaian voucher mengikuti status lunas. */
  const onPaid = (o) => {
    if (!o.voucher_code) return;
    const p = db.promos.find((x) => x.tenant_id === o.tenant_id && x.code === o.voucher_code);
    if (p && !db.promo_redemptions.some((r) => r.order_id === o.id)) { db.promo_redemptions.push({ id: id(), tenant_id: o.tenant_id, promo_id: p.id, order_id: o.id, discount: o.discount, created_at: nowIso() }); p.used_count++; }
  };
  const onVoid = (o) => {
    const i = db.promo_redemptions.findIndex((r) => r.order_id === o.id);
    if (i >= 0) { const p = db.promos.find((x) => x.id === db.promo_redemptions[i].promo_id); db.promo_redemptions.splice(i, 1); if (p) p.used_count = Math.max(p.used_count - 1, 0); }
  };
  return { RPC, visible, TABLES, onPaid, onVoid, hasFlag };
}
