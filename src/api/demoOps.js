import { can, permOf } from "../lib/rbac.js";
import { seedClinic, createClinic, CLINIC_RULES } from "./demoClinic.js";
import { createAccess, ACCESS_RULES } from "./demoAccess.js";
import { createGrowth } from "./demoGrowth.js";
import { createMemberRpc } from "./demoMember.js";
import { seedSdm, createSdm, SDM_RULES } from "./demoSdm.js";

const T1 = "t1", B0 = "b0", B1 = "b1", B2 = "b2";
const ACC = {
  1101: "Kas", 1102: "Bank, EDC & QRIS", 1104: "Piutang Karyawan (Kasbon)", 1301: "Persediaan Bahan Baku", 2101: "Utang Dagang", 2102: "Utang Pajak Penjualan",
  2103: "Utang Gaji", 3101: "Modal Pemilik", 3901: "Laba ditahan (berjalan)", 4101: "Pendapatan Penjualan",
  5101: "Harga Pokok Penjualan", 6101: "Beban Gaji", 6102: "Beban Sewa", 6103: "Beban Listrik & Internet",
  6104: "Beban Waste & Susut", 6105: "Beban Kas Kecil Outlet",
};
const TYPE = (code) => ({ 1: "asset", 2: "liability", 3: "equity", 4: "revenue", 5: "cogs", 6: "expense" })[String(code)[0]];

// Tabel → fitur matriks (sama dengan policy RLS).
export const TABLE_RULES = {
  channel_connections: { f: [16], branch: true }, channel_orders: { f: [16] }, channel_outbox: { f: [16] },
  products: { f: [3] }, inventory_items: { f: [4, 10] }, bom_lines: { f: [4] },
  stock_levels: { f: [10], branch: true }, stock_movements: { f: [10], branch: true },
  stock_counts: { f: [10], branch: true, own: "created_by" }, waste_logs: { f: [10], branch: true, own: "created_by" },
  stock_transfers: { f: [10], unscoped: true }, vendors: { f: [9] }, purchase_orders: { f: [9] },
  tables: { f: [7], branch: true }, order_items: { f: [8, 5], branch: true }, orders: { f: [5], branch: true },
  payments: { f: [5] }, shifts: { f: [5, 12], branch: true }, petty_cash: { f: [12], branch: true, own: "created_by" },
  work_shifts: { f: [13], branch: true, own: "profile_id" }, attendance: { f: [13], branch: true, own: "profile_id" },
  payroll_runs: { f: [14], unscoped: true }, payroll_lines: { f: [14], own: "profile_id" }, staff_loans: { f: [14], own: "profile_id" },
  journal_entries: { f: [11] }, profiles: { f: [13], own: "id" }, branches: { any: true },
  member_branches: { f: [13], own: "profile_id", self: "profile_id" },
  ...CLINIC_RULES,
  ...SDM_RULES,
};

export function seedOps(users) {
  const item = (n, code, name, unit, cost, min, semi = false) => ({ id: `d${n}`, tenant_id: T1, code, name, unit, cost_per_unit: cost, min_qty: min, is_semi: semi });
  const items = [
    item("001", "BHN-001", "Biji kopi arabika", "g", 190, 2000), item("002", "BHN-002", "Susu segar", "ml", 22, 3000),
    item("003", "BHN-003", "Gula aren cair", "ml", 40, 1000), item("004", "BHN-004", "Sirup kopi Harum.in", "botol", 70000, 5),
    item("005", "BHN-005", "Es batu", "g", 2, 5000), item("006", "BHN-006", "Cup 16oz", "pcs", 950, 200),
    item("007", "BHN-007", "Beras", "g", 14, 5000), item("008", "BHN-008", "Telur", "pcs", 2200, 30),
    item("009", "BHN-009", "Daging ayam", "g", 55, 2000), item("010", "BHN-010", "Minyak goreng", "ml", 18, 2000),
    item("011", "BHN-011", "Bumbu racik", "g", 60, 500), item("012", "BHN-012", "Kemasan take-away", "pcs", 1500, 100),
    item("013", "BHN-013", "Tulang ayam", "g", 20, 3000), item("014", "SUB-001", "Kaldu ayam dasar", "ml", 10.3, 2000, true),
    item("015", "BHN-015", "Mi telur", "g", 30, 2000), item("016", "BHN-016", "Tepung terigu", "g", 12, 3000),
    item("017", "BHN-017", "Mentega", "g", 120, 1000),
    item("018", "BHN-018", "Air Galon", "liter", 1315, 1),
  ];
  const prod = (n, sku, name, cat, price, station) => ({ id: `e${n}`, tenant_id: T1, sku, name, category: cat, price, station, is_available: true, barcode: null });
  const products = [
    prod("001", "MNM-01", "Es Kopi Harum", "Minuman", 32000, "barista"), prod("002", "MNM-02", "Kopi Susu Panas", "Minuman", 28000, "barista"),
    prod("003", "MNM-03", "Americano", "Minuman", 25000, "barista"), prod("004", "MNM-04", "Es Teh Aren", "Minuman", 15000, "barista"),
    prod("005", "MKN-01", "Nasi Goreng Spesial", "Makanan", 38000, "dapur"), prod("006", "MKN-02", "Mie Kuah Ayam", "Makanan", 35000, "dapur"),
    prod("007", "MKN-03", "Sup Ayam", "Makanan", 30000, "dapur"), prod("008", "MKN-04", "Ayam Bakar", "Makanan", 45000, "grill"),
    prod("009", "PST-01", "Croissant Mentega", "Pastry", 24000, "pastry"),
  ];
  const B = [["e001", "d001", 18], ["e001", "d002", 150], ["e001", "d003", 25], ["e001", "d005", 120], ["e001", "d006", 1],
    ["e002", "d001", 18], ["e002", "d002", 180], ["e003", "d001", 18], ["e004", "d003", 30], ["e004", "d005", 150], ["e004", "d006", 1],
    ["e005", "d007", 150], ["e005", "d008", 1], ["e005", "d009", 30], ["e005", "d010", 10], ["e005", "d011", 5], ["e005", "d012", 1],
    ["e006", "d015", 120], ["e006", "d014", 300], ["e006", "d009", 40], ["e007", "d014", 350], ["e007", "d009", 50],
    ["e008", "d009", 200], ["e008", "d011", 15], ["e009", "d016", 60], ["e009", "d017", 35]];
  const bom_lines = [
    ...B.map(([p, c, q], i) => ({ id: `bl${i}`, tenant_id: T1, product_id: p, parent_item_id: null, component_id: c, qty: q, yield_qty: 1 })),
    { id: "bls1", tenant_id: T1, product_id: null, parent_item_id: "d014", component_id: "d013", qty: 5000, yield_qty: 10000 },
    { id: "bls2", tenant_id: T1, product_id: null, parent_item_id: "d014", component_id: "d011", qty: 50, yield_qty: 10000 },
  ];
  const stock_levels = [];
  for (const b of [B0, B1, B2]) for (const i of items)
    stock_levels.push({ tenant_id: T1, branch_id: b, item_id: i.id, qty: b === B0 ? i.min_qty * 20 : i.code === "BHN-004" && b === B2 ? 2 : i.code === "BHN-018" && b === B2 ? 19000 : i.min_qty * 4 });
  const tables = [];
  for (const [b, n] of [[B1, 10], [B2, 8]]) for (let k = 1; k <= n; k++)
    tables.push({ id: `tb-${b}-${k}`, tenant_id: T1, branch_id: b, label: String(k).padStart(2, "0"), area: k <= 6 ? "Lantai 1" : "Lantai 2", seats: k === 1 || k === 6 ? 6 : 4, status: "available", sort: k });
  const now = Date.now();
  const voidOrder = { id: "ord-v1", tenant_id: T1, branch_id: B2, code: "ORD-HARUM-9102", status: "paid", channel: "dine_in", table_id: null, table_label: "05",
    subtotal: 96000, discount: 0, tax: 9600, total: 105600, cogs: 15852, cashier_id: "u3", shift_id: null, created_at: new Date(now - 3 * 3600e3).toISOString(), paid_at: new Date(now - 3 * 3600e3).toISOString() };
  const k = seedClinic();
  const t08 = tables.find((t) => t.id === "tb-b1-8");
  if (t08) t08.status = "reserved"; // reservasi Keluarga Hasan (queue_entries qr1)
  items.push(...k.clinic.items);
  products.push(...k.clinic.products);
  bom_lines.push(...k.clinic.bom_lines);
  stock_levels.push(...k.clinic.stock_levels);
  return {
    ...k.tables,
    items, products, bom_lines, stock_levels, tables,
    stock_movements: [], stock_counts: [], waste_logs: [],
    vendors: [
      { id: "f001", tenant_id: T1, name: "CV Kopi Toraja (demo)", phone: "+62 811-0000-1001", bank: "BRI", terms: "Net 14" },
      { id: "f002", tenant_id: T1, name: "UD Sumber Pangan (demo)", phone: "+62 811-0000-1002", bank: "BCA", terms: "COD" },
      { id: "f003", tenant_id: T1, name: "PT Kemasan Nusantara (demo)", phone: "+62 811-0000-1003", bank: "Mandiri", terms: "Net 30" },
    ],
    purchase_orders: [{ id: "po1", tenant_id: T1, branch_id: B0, vendor_id: "f001", code: "PO-2610-014", status: "pending", lines: [{ item_id: "d001", qty: 25000, price: 190 }], total: 4750000, created_at: new Date(now - 5 * 3600e3).toISOString() }],
    stock_transfers: [{ id: "sto1", tenant_id: T1, code: "STO-0007", from_branch: B0, to_branch: B2, status: "draft", lines: [{ item_id: "d004", qty: 12 }], created_at: new Date(now - 3 * 3600e3).toISOString() }],
    orders: [voidOrder],
    order_items: [{ id: "oi-v1", tenant_id: T1, branch_id: B2, order_id: "ord-v1", product_id: "e001", name: "Es Kopi Harum", qty: 3, price: 32000, station: "barista", note: null, kitchen_status: "served", created_at: voidOrder.created_at }],
    payments: [{ id: "pay-v1", tenant_id: T1, order_id: "ord-v1", method: "qris", amount: 105600, reference: "QR-DEMO" }],
    shifts: [], petty_cash: [], work_shifts: [], attendance: [], payroll_runs: [], payroll_lines: [], staff_loans: [], journal_entries: [k.opening],
    profiles: users.filter((u) => u.tenant_id).map((u) => ({ id: u.id, tenant_id: u.tenant_id, branch_id: u.branch_id, role: u.role, full_name: u.full_name, email: u.email,
      base_salary: { gm: 9000000, staff: 4200000, dokter: 0, owner: 0 }[u.role], commission_rate: u.commission_rate ?? 0, nik: u.nik ?? null })),
  };
}

export function createOps(ctx) {
  const { db, user, emit, persist, audit, sales } = ctx;
  const role = () => user()?.role;
  // UUID agar bundle FHIR demo memakai URN UUID yang sah (fallback bila crypto.randomUUID tidak tersedia).
  const id = () => globalThis.crypto?.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((c === "x" ? Math.random() * 16 : (Math.random() * 4) + 8) | 0).toString(16));
  const nowIso = () => new Date().toISOString();
  const today = () => nowIso().slice(0, 10);
  const err = (m) => { throw new Error(m); };
  const need = (f, a) => { if (role() === "member") err("Akses ditolak: Member tidak memakai fungsi operasional"); if (!can(role(), f, a)) err(`Akses ditolak: peran ${role()} tidak punya aksi "${a}" pada fitur ${f}`); };
  const scope = (f) => permOf(role(), f)?.scope ?? null;
  const tenantOk = (t) => role() === "superadmin" || t === user().tenant_id;
  // Sama dengan branch_ok() di SQL (Fase 0): GM tanpa penugasan = semua cabang; Staff/Dokter = cabang utama + penugasan.
  const assigned = () => (db.member_branches ?? []).filter((m) => m.profile_id === user().id).map((m) => m.branch_id);
  const branchOk = (b) => {
    const r = role();
    if (r === "superadmin" || r === "owner") return true;
    if (!b) return true;
    const mine = assigned();
    if (r === "gm") return mine.length === 0 || mine.includes(b);
    return b === user().branch_id || mine.includes(b);
  };
  const branchGuard = (b) => {
    const br = db.branches.find((x) => x.id === b);
    if (!br || !tenantOk(br.tenant_id) || !branchOk(b)) err("Cabang tidak dapat diakses");
    return br.tenant_id;
  };
  const rp = (n) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const T = (name) => db[name === "inventory_items" ? "items" : name];

  function journal(t, b, memo, source, source_id, lines) {
    const dr = lines.reduce((a, l) => a + (l.dr || 0), 0), cr = lines.reduce((a, l) => a + (l.cr || 0), 0);
    if (Math.round(dr) !== Math.round(cr)) err(`Jurnal tidak seimbang (${dr} vs ${cr})`);
    if (!dr) return;
    db.journal_entries.unshift({ id: id(), tenant_id: t, branch_id: b, entry_date: today(), memo, source, source_id, created_at: nowIso(),
      lines: lines.filter((l) => (l.dr || 0) + (l.cr || 0) > 0).map((l) => ({ code: String(l.code), dr: Math.round(l.dr || 0), cr: Math.round(l.cr || 0) })) });
  }
  function move(t, b, item, delta, kind, ref, note) {
    let s = db.stock_levels.find((x) => x.branch_id === b && x.item_id === item);
    if (!s) db.stock_levels.push((s = { tenant_id: t, branch_id: b, item_id: item, qty: 0 }));
    s.qty = Math.round((s.qty + delta) * 1000) / 1000;
    db.stock_movements.unshift({ id: id(), tenant_id: t, branch_id: b, item_id: item, qty_delta: delta, kind, ref, note, created_by: user().id, created_at: nowIso() });
    return s.qty;
  }
  // Meniru hermes-dispatch tanpa HERMES_WEBHOOK_URL: event langsung berstatus 'simulated', dan dispatch live jika webhook aktif.
  const hermes = (t, channel, target, kind, message, payload = {}) => {
    const ev = { id: id(), tenant_id: t, channel, target, kind, message, payload, status: "simulated", created_at: nowIso() };
    db.hermes.unshift(ev);
    setTimeout(() => emit("hermes_events"), 0);

    // Kirim real HTTP POST ke Webhook Hermes jika channel adalah whatsapp
    if (channel === "whatsapp" && typeof fetch !== "undefined") {
      try {
        const webhookUrl = (typeof import.meta !== "undefined" && import.meta.env?.VITE_HERMES_WEBHOOK_URL) || "https://webhook.dentsweb.my.id/webhook/tijarah";
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: kind,
            tenant_id: t,
            channel,
            target,
            kind,
            message,
            payload,
            timestamp: nowIso()
          })
        }).then(r => {
          if (r.ok) ev.status = "sent";
        }).catch(() => {});
      } catch (e) {}
    }
  };
  const itemOf = (iid) => (db.items ?? db.inventory_items ?? []).find((i) => i.id === iid);
  const syncTable = (oid) => {
    const o = db.orders.find((x) => x.id === oid && x.status === "open");
    if (!o?.table_id) return;
    const busy = db.order_items.some((i) => i.order_id === oid && ["new", "cooking"].includes(i.kitchen_status));
    const tb = db.tables.find((x) => x.id === o.table_id);
    if (tb) tb.status = busy ? "cooking" : "occupied";
  };
  const openShift = () => db.shifts.find((s) => s.cashier_id === user().id && s.status === "open");
  const getPolicy = (t, b, r) => {
    const list = db.tenant_policies ?? [];
    if (b && r) {
      const p = list.find((x) => x.tenant_id === t && x.branch_id === b && x.role === r);
      if (p) return p;
    }
    if (b) {
      const p = list.find((x) => x.tenant_id === t && x.branch_id === b && !x.role);
      if (p) return p;
    }
    if (r) {
      const p = list.find((x) => x.tenant_id === t && !x.branch_id && x.role === r);
      if (p) return p;
    }
    const def = list.find((x) => x.tenant_id === t && !x.branch_id && !x.role);
    if (def) return def;
    return {
      max_discount_pct: 15, max_void_without_pin: 50000,
      operating_hours_start: "07:00:00", operating_hours_end: "23:00:00",
      geofence_radius_meters: 50, enforce_shift_lock: true
    };
  };
  // Rekonsiliasi: hanya Superadmin/Owner/GM membaca; hanya Superadmin/GM menulis. Staff (hak petty cash) tidak punya akses.
  const reconReader = () => ["superadmin", "owner", "gm"].includes(role()) && can(role(), 12, "r");
  const reconWriter = () => {
    need(12, "u");
    if (!["superadmin", "gm"].includes(role())) err("Hanya GM atau Superadmin yang boleh merekonsiliasi");
    return user().tenant_id ?? err("Pilih Tenant dulu");
  };
  const onlineOn = (t) => {
    const tt = db.tenants.find((x) => x.id === t);
    const o = (db.tenant_flag_overrides ?? []).find((x) => x.tenant_id === t && x.key === "online_orders");
    if (o) return o.enabled;
    return ["growth", "enterprise"].includes(db.plans?.find((pl) => pl.id === tt?.plan_id)?.code);
  };
  const reconDate = (x) => {
    if (x.payment_id) { const p = db.payments.find((y) => y.id === x.payment_id); return String(db.orders.find((o) => o.id === p?.order_id)?.paid_at ?? "").slice(0, 10); }
    return (db.recon_statements ?? []).find((s) => s.id === x.statement_id)?.settled_on ?? "";
  };
  const done = (v, tables = []) => { persist(); tables.forEach(emit); return v; };
  const clinic = createClinic({ db, user, emit, persist, audit, err, need, tenantOk, branchOk, branchGuard, id, nowIso });
  const access = createAccess({ db, user, emit, persist, audit, err, need, tenantOk, branchOk, id, nowIso, sales });
  const sdm = createSdm({ db, user, emit, persist, audit, err, need, tenantOk, branchOk, id, nowIso });
  let growth = null;
  const G = () => (growth ??= createGrowth({ db, user, emit, persist, audit, err, need, tenantOk, branchOk, id, nowIso, sales, hermes, rp, call: (n, a) => RPC[n]?.(a) ?? growth.RPC[n](a) }));

  // ── Ledger gabungan: data penjualan historis + saldo awal + jurnal operasional ──
  function ledger(t) {
    if (t !== T1) return db.journal_entries.filter((e) => e.tenant_id === t);
    const hist = [];
    let cogsSum = 0;
    for (const r of sales) {
      cogsSum += r.cogs;
      hist.push({ entry_date: r.day, branch_id: r.branch_id, source: "pos", memo: "Rekap penjualan POS", lines: [
        { code: "1101", dr: r.revenue - r.tax, cr: 0 }, { code: "4101", dr: 0, cr: r.revenue - r.tax },
        { code: "5101", dr: r.cogs, cr: 0 }, { code: "1301", dr: 0, cr: r.cogs }] });
      hist.push({ entry_date: r.day, branch_id: r.branch_id, source: "expense", memo: "Alokasi beban harian", lines: [
        { code: "6101", dr: 1450000, cr: 0 }, { code: "6102", dr: 600000, cr: 0 }, { code: "6103", dr: 180000, cr: 0 }, { code: "1101", dr: 0, cr: 2230000 }] });
    }
    const stockVal = db.stock_levels.reduce((a, s) => a + s.qty * (itemOf(s.item_id)?.cost_per_unit ?? 0), 0);
    const open = Math.round(cogsSum + stockVal);
    hist.push({ entry_date: sales[0]?.day ?? today(), branch_id: null, source: "financing", memo: "Saldo awal persediaan (setoran modal)",
      lines: [{ code: "1301", dr: open, cr: 0 }, { code: "3101", dr: 0, cr: open }] });
    return [...hist, ...db.journal_entries.filter((e) => e.tenant_id === T1)];
  }
  const tenantOf = (p) => (role() === "superadmin" ? p || err("Superadmin harus memilih tenant") : user().tenant_id);

  // ── Akses generik dengan RLS tiruan ──
  // Kebijakan RESTRICTIVE Member (sama dengan supabase/migrations/…022_member_isolation.sql): tolak semua, buka "milik sendiri".
  const normPhone = (p) => (String(p ?? "").replace(/[^0-9+]/g, "") || null);
  const myCustomer = () => (db.customers ?? []).find((c) => c.id === user()?.customer_id) ?? null;
  const ordersOfMine = (orderId) => {
    const c = myCustomer();
    const o = (db.orders ?? []).find((x) => x.id === orderId);
    return !!(c && o && o.tenant_id === c.tenant_id && normPhone(o.customer_phone) && normPhone(o.customer_phone) === normPhone(c.phone));
  };
  function memberVisible(table, row) {
    const c = myCustomer();
    if (!c || row.tenant_id !== user().tenant_id && table !== "profiles") return false;
    switch (table) {
      case "profiles": return row.id === user().id;
      case "customers": return row.id === c.id;
      case "orders": return ordersOfMine(row.id);
      case "order_items":
      case "payments": return ordersOfMine(row.order_id);
      case "queue_entries": return !!normPhone(row.phone) && normPhone(row.phone) === normPhone(c.phone);
      case "products":
      case "branches": return true;
      default: return false;
    }
  }

  function visible(table, row) {
    if (role() === "member") return memberVisible(table, row);
    if (table === "profiles" && row.role === "member") return false; // Master Karyawan tidak memuat Member
    if (ACCESS_RULES[table]) return access.visible(table, row);
    if (G().TABLES.includes(table)) return G().visible(table, row);
    const r = TABLE_RULES[table];
    if (!r) return false;
    if (r.any) return tenantOk(row.tenant_id);
    if (!tenantOk(row.tenant_id)) return false;
    if (r.self && row[r.self] === user().id) return true;
    if (r.branch && !branchOk(row.branch_id)) return false;
    const f = r.f.find((x) => can(role(), x, "r"));
    if (!f) return false;
    const sc = scope(f);
    if (r.unscoped && sc) return false;
    if (r.rme && sc) return false; // Kasir "R (Billing Obat)" tidak membaca data klinis
    if (sc && r.own) return row[r.own] === user().id;
    if (sc && table === "inventory_items") return true;
    return true;
  }

  // Fungsi yang boleh dipanggil Member. Bertambah seiring tiket 05–07 (masuk, pesan, reservasi).
  const MEMBER_FN = createMemberRpc({ db, user, onDeleted: () => ctx.onMemberDeleted?.() });
  const MEMBER_RPC = new Set(["my_access_state", "touch_presence", "member_brand", "member_home", "member_update_profile", "member_card_token", "member_export", "member_delete_account", "member_menu", "member_place_order", "member_orders", "member_cancel_order", "member_reservation_create", "member_reservations", "member_reservation_update", "member_reservation_cancel"]);

  const api = {
    async list(table, { eq = {}, inList, order, limit } = {}) {
      if (table === "journal_entries") {
        need(11, "r");
        const t = tenantOf(eq.tenant_id);
        let rows = ledger(t).map((e, i) => ({ id: e.id ?? `h${i}`, ...e, journal_lines: e.lines.map((l) => ({ debit: l.dr, credit: l.cr, account: { code: l.code, name: ACC[l.code] } })) }));
        rows.sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : (b.created_at ?? "").localeCompare(a.created_at ?? "")));
        return rows.slice(0, limit ?? 100);
      }
      let rows = (T(table) ?? []).filter((r) => visible(table, r));
      for (const [k, v] of Object.entries(eq)) if (v !== undefined && v !== null && v !== "" && v !== "undefined" && v !== "null") rows = rows.filter((r) => r[k] === v);
      if (inList) rows = rows.filter((r) => inList[1].includes(r[inList[0]]));
      if (order) rows = [...rows].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] === "desc" ? -1 : 1));
      return structuredClone(limit ? rows.slice(0, limit) : rows);
    },
    async insert(table, row) {
      if (role() === "member") err("Akses ditolak: Member tidak menulis langsung ke tabel");
      const cw = clinic.write.insert[table];
      if (cw) {
        const r = { id: id(), created_at: nowIso(), ...row };
        const tbls = cw(r);
        audit("insert", table, r.id, r, r.tenant_id);
        return done(structuredClone(r), tbls);
      }
      const W = { products: 3, inventory_items: 4, bom_lines: 4, vendors: 9, purchase_orders: 9, tables: 7, petty_cash: 12, work_shifts: 13, payroll_lines: 14, leave_requests: 13, leave_balances: 13, knowledge_forms: 13, knowledge_responses: 13, knowledge_reads: 13 };
      if (!W[table]) err(`Tabel ${table} hanya bisa diubah lewat fungsi sistem`);
      need(W[table], "c");
      if (table === "petty_cash" && row.created_by !== user().id) err("new row violates row-level security policy");
      if (table === "petty_cash") {
        if (!row.receipt_path) err("Foto nota wajib dilampirkan");
        const lim = Number(db.tenants?.find?.((x) => x.id === row.tenant_id)?.petty_limit ?? 500000);
        if (Number(row.amount) > lim) err(`Melebihi batas kas kecil ${rp(lim)} per pengajuan. Gunakan Pembelian/PO.`);
        row.status = "submitted";
      }
      if (table === "work_shifts" && scope(13)) err("Akses ditolak");
      // Default kolom meniru DEFAULT di skema SQL.
      const DEFAULTS = { petty_cash: { status: "submitted" }, products: { is_available: true }, tables: { status: "available" }, purchase_orders: { status: "draft" } };
      const r = { id: id(), created_at: nowIso(), ...(DEFAULTS[table] ?? {}), ...row };
      if (table === "purchase_orders") r.status = "draft";
      T(table).unshift(r);
      audit("insert", table, r.id, r, r.tenant_id);
      return done(structuredClone(r), [table]);
    },
    async insertMany(table, rows) {
      if (!rows || rows.length === 0) return [];
      const inserted = [];
      for (const row of rows) {
        const res = await this.insert(table, row);
        inserted.push(res);
      }
      return inserted;
    },
    async update(table, rid, patch, key = "id") {
      if (role() === "member") err("Akses ditolak: Member tidak menulis langsung ke tabel");
      const cu = clinic.write.update[table];
      if (cu) {
        const r = T(table).find((x) => x[key] === rid);
        if (!r || !visible(table, r)) err("Data tidak ditemukan");
        const tbls = cu(r, { ...patch });
        audit("update", table, rid, patch, r.tenant_id);
        return done(structuredClone(r), tbls);
      }
      const W = { products: 3, inventory_items: 4, bom_lines: 4, vendors: 9, purchase_orders: 9, tables: 7, work_shifts: 13, payroll_lines: 14, profiles: 13, leave_requests: 13, leave_balances: 13, knowledge_forms: 13, knowledge_responses: 13, knowledge_reads: 13 };
      if (!W[table]) err(`Tabel ${table} hanya bisa diubah lewat fungsi sistem`);
      need(W[table], "u");
      const r = T(table).find((x) => x[key] === rid);
      if (!r || !tenantOk(r.tenant_id)) err("Data tidak ditemukan");
      if (table === "purchase_orders" && r.status !== "draft") err("Hanya PO draf yang bisa diubah");
      if (table === "payroll_lines") {
        const pr = db.payroll_runs.find((x) => x.id === r.run_id);
        if (!["draft", "rejected"].includes(pr?.status)) err(`Payroll berstatus ${pr?.status} tidak dapat diubah. Tolak dulu bila perlu direvisi.`);
        if ("kasbon" in patch && patch.kasbon !== r.kasbon) err("Potongan kasbon dihitung otomatis dari data kasbon aktif");
      }
      if (table === "profiles") {
        // Sama dengan guard_profile_role() di SQL (FASE 1).
        if (patch.role) err("Peran tidak bisa diubah dari sini");
        if (["pin_hash", "is_active", "deactivated_at", "deactivated_by", "deactivation_reason", "tenant_id", "email", "last_login_at", "last_seen_at"].some((k) => k in patch))
          err("Kolom ini hanya dapat diubah lewat fungsi sistem (PIN, status aktif, email, tenant)");
        if (r.id === user().id && role() !== "superadmin" && ("base_salary" in patch || "commission_rate" in patch)) err("Gaji dan komisi sendiri tidak dapat diubah");
        if (r.id !== user().id) {
          if (role() === "owner" && !["gm", "staff", "dokter"].includes(r.role)) err("Owner hanya mengelola GM, Kasir/Staf, dan Dokter");
          if (role() === "gm" && !["staff", "dokter"].includes(r.role)) err("GM hanya mengelola Kasir/Staf dan Dokter");
        }
      }
      Object.assign(r, patch);
      audit("update", table, rid, patch, r.tenant_id);
      return done(structuredClone(r), [table]);
    },
    async remove(table, rid) {
      if (role() === "member") err("Akses ditolak: Member tidak menulis langsung ke tabel");
      const cr = clinic.write.remove[table];
      if (cr) {
        const r = T(table).find((x) => x.id === rid);
        if (!r || !visible(table, r)) err("Data tidak ditemukan");
        const tbls = cr(r);
        audit("delete", table, rid, {}, r.tenant_id);
        return done(null, tbls);
      }
      const W = { products: 3, inventory_items: 4, bom_lines: 4, vendors: 9, purchase_orders: 9, tables: 7, work_shifts: 13, payroll_lines: 14, leave_requests: 13, leave_balances: 13, knowledge_forms: 13, knowledge_responses: 13, knowledge_reads: 13 };
      if (!W[table]) err("Tidak bisa dihapus");
      need(W[table], "d");
      const r = T(table).find((x) => x.id === rid);
      if (table === "purchase_orders" && r?.status !== "draft") err("Hanya PO draf yang bisa dihapus");
      db[table === "inventory_items" ? "items" : table] = T(table).filter((x) => x.id !== rid);
      audit("delete", table, rid, {}, r?.tenant_id);
      return done(null, [table]);
    },
    async removeMany(table, rids) {
      if (!rids || rids.length === 0) return null;
      for (const rid of rids) {
        await this.remove(table, rid);
      }
      return null;
    },
    async lockTable() { return { locked: true }; },

    async rpc(name, a = {}) {
      if (role() === "member" && !MEMBER_RPC.has(name)) err("Akses ditolak: Member tidak memakai fungsi operasional");
      if (name === "resolve_member_card") { need(15, "r"); return MEMBER_FN.resolve_member_card(a); }
      if (role() === "member" && MEMBER_FN[name]) { const r = MEMBER_FN[name](a); persist(); return done(structuredClone(r), []); }
      const fn = RPC[name] ?? sdm.RPC[name] ?? clinic.RPC[name] ?? access.RPC[name] ?? G().RPC[name];
      if (!fn) err(`Fungsi ${name} tidak ada`);
      return fn(a);
    },

    // Dipanggil oleh decideApproval demo setelah status diubah.
    branchOk: (b) => branchOk(b),
    applyApproval(ap, decision, option, note) {
      if (ap.kind === "void" && decision === "approved" && ap.detail?.order_id) applyVoid(ap.detail.order_id, option, note);
      if (ap.kind === "po" && ap.detail?.po_id) { const po = db.purchase_orders.find((x) => x.id === ap.detail.po_id); if (po) po.status = decision === "approved" ? "approved" : "draft"; }
      if (ap.kind === "sto" && ap.detail?.sto_id) { const s = db.stock_transfers.find((x) => x.id === ap.detail.sto_id); if (s) s.status = decision === "approved" ? "approved" : "cancelled"; }
      if (ap.kind === "payroll" && ap.detail?.run_id) {
        const r = db.payroll_runs.find((x) => x.id === ap.detail.run_id);
        if (r) r.status = decision === "approved" ? "approved" : "rejected";
        if (decision === "approved") {
          // sama dengan _on_payroll_approved(): kasbon dipotong tertua dulu; beban kotor / utang gaji / piutang karyawan
          let kas = 0;
          for (const ln of db.payroll_lines.filter((x) => x.run_id === ap.detail.run_id && x.kasbon > 0)) {
            let left = ln.kasbon; kas += ln.kasbon;
            for (const lo of db.staff_loans.filter((x) => x.profile_id === ln.profile_id && x.status === "active").sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
              if (left <= 0) break;
              const take = Math.min(left, lo.remaining); lo.remaining -= take; left -= take; if (lo.remaining <= 0) lo.status = "paid";
            }
          }
          journal(ap.tenant_id, null, `Payroll ${ap.ref}`, "payroll", ap.detail.run_id,
            [{ code: 6101, dr: ap.amount + kas }, { code: 2103, cr: ap.amount }, ...(kas > 0 ? [{ code: 1104, cr: kas }] : [])]);
          emit("staff_loans");
        }
      }
      if (ap.kind === "leave" && ap.detail?.leave_id) {
        const l = db.leave_requests?.find((x) => x.id === ap.detail.leave_id);
        if (l) {
          l.status = decision;
          l.approved_by = user().id;
          l.approved_at = nowIso();
          l.reject_reason = decision === "rejected" ? note : null;
          const balance = db.leave_balances?.find((b) => b.profile_id === l.profile_id);
          if (balance && l.category === "CT") {
            balance.pending_days = Math.max(0, balance.pending_days - l.days_count);
            if (decision === "approved") balance.used_days += l.days_count;
            balance.remaining_days = Math.max(0, balance.annual_quota - balance.used_days - balance.pending_days);
          }
        }
      }
      ["orders", "tables", "purchase_orders", "stock_transfers", "payroll_runs", "leave_requests", "leave_balances"].forEach(emit);
    },

    ledgerPL({ from, to, tenantId }) {
      need(11, "r");
      const t = tenantOf(tenantId);
      const sums = {};
      for (const e of ledger(t)) {
        if (e.entry_date < from || e.entry_date > to) continue;
        for (const l of e.lines) {
          const ty = TYPE(l.code);
          if (!["revenue", "cogs", "expense"].includes(ty)) continue;
          sums[l.code] = (sums[l.code] ?? 0) + (ty === "revenue" ? l.cr - l.dr : l.dr - l.cr);
        }
      }
      return Object.entries(sums).sort().map(([code, amount]) => ({ type: TYPE(code), code, name: ACC[code], amount }));
    },
  };

  function applyVoid(oid, option, note) {
    const o = db.orders.find((x) => x.id === oid);
    if (!o || o.status !== "paid") return;
    o.status = "void";
    G().onVoid(o);
    const pos = db.journal_entries.find((e) => e.source === "pos" && e.source_id === oid);
    if (pos) journal(o.tenant_id, o.branch_id, `Pembalikan void ${o.code}`, "void", oid, pos.lines.map((l) => ({ code: l.code, dr: l.cr, cr: l.dr })));
    for (const it of db.order_items.filter((i) => i.order_id === oid)) {
      for (const bl of db.bom_lines.filter((b) => b.product_id === it.product_id)) {
        const q = bl.qty * it.qty;
        if (option === "restock") move(o.tenant_id, o.branch_id, bl.component_id, q, "void_restock", o.code);
        else db.waste_logs.unshift({ id: id(), tenant_id: o.tenant_id, branch_id: o.branch_id, item_id: bl.component_id, qty: q, reason: `Void ${o.code}`, cost: Math.round(q * itemOf(bl.component_id).cost_per_unit), created_by: user().id, created_at: nowIso() });
      }
    }
    if (option !== "restock" && o.cogs > 0) journal(o.tenant_id, o.branch_id, `Waste dari void ${o.code}`, "waste", oid, [{ code: 6104, dr: o.cogs }, { code: 1301, cr: o.cogs }]);
    const s = db.shifts.find((x) => x.id === o.shift_id && x.status === "open");
    if (s) for (const p of db.payments.filter((p) => p.order_id === oid)) p.method === "cash" ? (s.cash_sales -= p.amount) : (s.non_cash_sales -= p.amount);
    const br = db.branches.find((b) => b.id === o.branch_id);
    hermes(o.tenant_id, "discord", "#alert-sistem", "void_alert", `⚠️ SECURITY ALERT: Void transaksi ${o.code} sebesar ${rp(o.total)} disetujui oleh ${user().full_name} di ${br?.name}. ${note ?? ""}`);
  }

  const RPC = {
    set_member_branches({ p_profile, p_branches }) {
      need(13, "u");
      const tgt = db.profiles.find((x) => x.id === p_profile);
      if (!tgt || !tenantOk(tgt.tenant_id)) err("Anggota tidak ditemukan");
      if (["superadmin", "owner"].includes(tgt.role)) err("Owner/Superadmin tidak dibatasi cabang");
      if (role() === "gm" && tgt.role === "gm") err("GM tidak dapat mengatur cabang GM lain");
      if (!["superadmin", "owner", "gm"].includes(role())) err("Akses ditolak");
      const list = p_branches ?? [];
      for (const b of list) {
        if (!db.branches.some((x) => x.id === b && x.tenant_id === tgt.tenant_id)) err("Cabang bukan milik tenant ini");
        if (!branchOk(b)) err("Anda tidak memegang cabang tersebut");
      }
      // GM hanya mengganti penugasan di cabang yang ia pegang (sama dengan SQL).
      const kept = (db.member_branches ?? []).filter((m) => m.profile_id !== p_profile || (role() === "gm" && !branchOk(m.branch_id)));
      const next = kept.concat(list.filter((b) => !kept.some((m) => m.profile_id === p_profile && m.branch_id === b))
        .map((b) => ({ profile_id: p_profile, branch_id: b, tenant_id: tgt.tenant_id, assigned_by: user().id, assigned_at: nowIso() })));
      const mineAfter = next.filter((m) => m.profile_id === p_profile).map((m) => m.branch_id);
      if (["staff", "dokter"].includes(tgt.role)) {
        if (!mineAfter.length) err("Staff/Dokter wajib punya minimal satu cabang");
        tgt.branch_id = list[0] ?? (mineAfter.includes(tgt.branch_id) ? tgt.branch_id : mineAfter[0]);
      }
      db.member_branches = next;
      audit("update", "member_branches", p_profile, { branches: list }, tgt.tenant_id);
      persist(); emit("member_branches"); emit("profiles");
      return mineAfter.length;
    },
    open_shift({ p_branch, p_opening }) {
      const t = branchGuard(p_branch);
      need(5, "c");
      if (p_opening == null || p_opening < 0) err("Modal awal wajib diisi");
      if (openShift()) err("Anda masih punya shift yang terbuka");
      const pol = getPolicy(t, p_branch, role());
      if (pol && pol.enforce_shift_lock) {
        const nowTime = new Date().toTimeString().slice(0, 8);
        const start = pol.operating_hours_start || "07:00:00";
        const end = pol.operating_hours_end || "23:00:00";
        if (start <= end) {
          if (nowTime < start || nowTime > end) {
            err(`Shift terkunci oleh kebijakan: di luar jam operasional (${start} - ${end})`);
          }
        } else {
          if (nowTime < start && nowTime > end) {
            err(`Shift terkunci oleh kebijakan: di luar jam operasional (${start} - ${end})`);
          }
        }
      }
      const s = { id: id(), tenant_id: t, branch_id: p_branch, cashier_id: user().id, opened_at: nowIso(), opening_cash: Number(p_opening), cash_sales: 0, non_cash_sales: 0, status: "open" };
      db.shifts.unshift(s);
      return done(structuredClone(s), ["shifts"]);
    },
    shift_report({ p_shift }) {
      const s = db.shifts.find((x) => x.id === p_shift);
      if (!s || !tenantOk(s.tenant_id) || !branchOk(s.branch_id)) err("Shift tidak ditemukan");
      const os = db.orders.filter((o) => o.shift_id === s.id);
      const by = {};
      for (const o of os.filter((o) => o.status === "paid")) for (const p of db.payments.filter((p) => p.order_id === o.id)) by[p.method] = (by[p.method] ?? 0) + p.amount;
      return { shift: structuredClone(s), orders: os.filter((o) => o.status === "paid").length, voids: os.filter((o) => o.status === "void").length, by_method: by, expected_cash: s.opening_cash + s.cash_sales };
    },
    close_shift({ p_shift, p_counted }) {
      need(5, "u");
      const s = db.shifts.find((x) => x.id === p_shift);
      if (!s || s.status !== "open") err("Shift tidak terbuka");
      if (p_counted == null || p_counted < 0) err("Isi hasil hitung uang fisik");
      Object.assign(s, { closed_at: nowIso(), counted_cash: Number(p_counted), variance: Number(p_counted) - (s.opening_cash + s.cash_sales), status: "closed" });
      persist();
      return RPC.shift_report({ p_shift });
    },
    z_report({ p_branch }) {
      const t = branchGuard(p_branch);
      need(5, "c");
      if (db.shifts.some((s) => s.branch_id === p_branch && s.status === "open")) err("Masih ada shift terbuka di cabang ini. Tutup semua shift dulu.");
      const br = db.branches.find((b) => b.id === p_branch);
      const os = db.orders.filter((o) => o.branch_id === p_branch && o.paid_at?.slice(0, 10) === today());
      const hist = sales.find((r) => r.branch_id === p_branch && r.day === today());
      const paid = os.filter((o) => o.status === "paid");
      const r = { branch: br.name, date: today(), orders: paid.length + (hist?.orders ?? 0), voids: os.filter((o) => o.status === "void").length,
        revenue: paid.reduce((a, o) => a + o.total, 0) + (hist?.revenue ?? 0), tax: paid.reduce((a, o) => a + o.tax, 0) + (hist?.tax ?? 0), cogs: paid.reduce((a, o) => a + o.cogs, 0) + (hist?.cogs ?? 0) };
      hermes(t, "whatsapp", "Owner & GM", "z_report", `Z-Report ${br.name}: ${r.orders} transaksi, omset ${rp(r.revenue)}, void ${r.voids}.`, r);
      hermes(t, "discord", "#laporan-harian", "z_report", `Z-Report ${br.name}: omset ${rp(r.revenue)}`, r);
      return done(r);
    },
    create_order({ p_branch, p_items, p_table = null, p_channel = "dine_in", p_order = null }) {
      const t = branchGuard(p_branch);
      need(5, "c");
      if (!p_items?.length) err("Pesanan kosong");
      let o;
      if (!p_order) {
        if (p_table && db.orders.some((x) => x.table_id === p_table && x.status === "open")) err("Meja masih punya pesanan terbuka. Tambahkan ke pesanan itu.");
        const d = new Date();
        o = { id: id(), tenant_id: t, branch_id: p_branch, code: `ORD-${d.toISOString().slice(2, 10).replaceAll("-", "")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`,
          status: "open", channel: p_channel, table_id: p_table, table_label: db.tables.find((x) => x.id === p_table)?.label ?? null,
          subtotal: 0, discount: 0, tax: 0, total: 0, cogs: 0, cashier_id: user().id, shift_id: openShift()?.id ?? null, created_at: nowIso(), paid_at: null };
        db.orders.unshift(o);
      } else {
        o = db.orders.find((x) => x.id === p_order && x.branch_id === p_branch);
        if (!o || o.status !== "open") err("Pesanan tidak terbuka");
      }
      for (const it of p_items) {
        const p = db.products.find((x) => x.id === it.product_id && x.tenant_id === t);
        if (!p) err("Produk tidak ditemukan");
        if (!p.is_available) err(`${p.name} sedang habis (86)`);
        db.order_items.push({ id: id(), tenant_id: t, branch_id: p_branch, order_id: o.id, product_id: p.id, name: p.name, qty: Math.max(1, it.qty | 0), price: p.price, station: p.station, note: it.note || null, kitchen_status: "new", created_at: nowIso() });
      }
      o.subtotal = db.order_items.filter((i) => i.order_id === o.id).reduce((a, i) => a + i.qty * i.price, 0);
      syncTable(o.id);
      return done(structuredClone(o), ["orders", "order_items", "tables"]);
    },
    set_item_status({ p_item, p_status }) {
      need(8, "u");
      const i = db.order_items.find((x) => x.id === p_item);
      if (!i || !tenantOk(i.tenant_id) || !branchOk(i.branch_id)) err("Item tidak ditemukan");
      i.kitchen_status = p_status;
      if (p_status === "ready") i.ready_at = nowIso();
      syncTable(i.order_id);
      return done(structuredClone(i), ["order_items", "tables"]);
    },
    toggle_86({ p_product, p_available }) {
      if (!(can(role(), 8, "u") || can(role(), 3, "u"))) err("Akses ditolak: fitur 8/3");
      const p = db.products.find((x) => x.id === p_product && tenantOk(x.tenant_id));
      if (!p) err("Produk tidak ditemukan");
      const changed = p.is_available !== p_available;
      p.is_available = p_available;
      // Cermin trigger products_channel_sync: koneksi AKTIF mendapat antrean ketersediaan; simulasi langsung 'sent'.
      if (changed) for (const c of (db.channel_connections ?? []).filter((x) => x.tenant_id === p.tenant_id && x.status === "active")) {
        (db.channel_outbox ??= []).push({ id: id(), tenant_id: p.tenant_id, connection_id: c.id, kind: "availability", product_id: p.id, available: p_available,
          status: c.channel === "sim" ? "sent" : "pending", attempts: 0, created_at: nowIso(), sent_at: c.channel === "sim" ? nowIso() : null });
      }
      return done(structuredClone(p), ["products", "channel_outbox"]);
    },
    // ── Pesanan online F16 (cermin 20261011000028_online_orders.sql). Hanya kanal 'sim' dan 'gofood' (menunggu akses). ──
    online_connection_save({ p_branch, p_channel, p_label, p_settings = {} }) {
      const t = branchGuard(p_branch);
      need(16, "c");
      if (!onlineOn(t)) err("Pesanan online belum aktif untuk Paket ini");
      if (!["sim", "gofood"].includes(p_channel)) err(`Kanal ${p_channel} belum didukung`);
      const label = String(p_label ?? "").trim();
      if (label.length < 2 || label.length > 60) err("Nama koneksi 2–60 karakter");
      if (/(secret|token|password|api[_-]?key|server[_-]?key)/i.test(JSON.stringify(p_settings ?? {}))) err("Jangan simpan rahasia di pengaturan koneksi. Pakai Supabase Vault.");
      const list = (db.channel_connections ??= []);
      let c = list.find((x) => x.branch_id === p_branch && x.channel === p_channel);
      if (c) Object.assign(c, { label, settings: p_settings ?? {} });
      else list.push((c = { id: id(), tenant_id: t, branch_id: p_branch, channel: p_channel, label, status: p_channel === "sim" ? "active" : "awaiting_access", settings: p_settings ?? {}, last_sync_at: null, created_at: nowIso() }));
      audit("online_connection_save", "channel_connections", c.id, { channel: c.channel, status: c.status }, t);
      return done(structuredClone(c), ["channel_connections"]);
    },
    online_connection_status({ p_id, p_status }) {
      need(16, "u");
      if (!["active", "paused"].includes(p_status)) err("Status tidak valid");
      const c = (db.channel_connections ?? []).find((x) => x.id === p_id);
      if (!c || !tenantOk(c.tenant_id) || !branchOk(c.branch_id)) err("Koneksi tidak ditemukan");
      if (c.channel !== "sim" && p_status === "active") err(`Adapter ${c.channel} belum tersedia (menunggu akses sandbox/persyaratan penyedia)`);
      c.status = p_status;
      audit("online_connection_status", "channel_connections", c.id, { status: p_status }, c.tenant_id);
      return done(structuredClone(c), ["channel_connections"]);
    },
    online_sim_order({ p_conn, p_items, p_customer = "Pelanggan Simulasi" }) {
      need(16, "c");
      const c = (db.channel_connections ?? []).find((x) => x.id === p_conn);
      if (!c || !tenantOk(c.tenant_id) || !branchOk(c.branch_id)) err("Koneksi tidak ditemukan");
      if (c.channel !== "sim") err("Hanya koneksi simulasi yang boleh dipakai di sini");
      if (!onlineOn(c.tenant_id)) err("Pesanan online belum aktif untuk Paket ini");
      if (c.status !== "active") err(`Koneksi ${c.label} belum aktif (${c.status})`);
      const ext = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const reject = (msg) => { (db.channel_orders ??= []).unshift({ id: id(), tenant_id: c.tenant_id, connection_id: c.id, external_id: ext, order_id: null, status: "rejected", error: msg, customer_name: p_customer, received_at: nowIso() }); return done({ ok: false, rejected: true, error: msg }, ["channel_orders"]); };
      if (!Array.isArray(p_items) || p_items.length < 1 || p_items.length > 50) return reject("Item pesanan 1–50 baris");
      const lines = [];
      for (const it of p_items) {
        const pr = db.products.find((x) => x.tenant_id === c.tenant_id && x.sku === String(it.sku ?? "").trim());
        if (!pr) return reject(`SKU ${it.sku ?? "?"} tidak dikenal`);
        const qty = Number(it.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) return reject(`Jumlah ${pr.name} tidak valid`);
        if (!pr.is_available) return reject(`${pr.name} sedang habis (86)`);
        lines.push({ pr, qty, note: String(it.note ?? "").trim().slice(0, 100) || null });
      }
      const o = { id: id(), tenant_id: c.tenant_id, branch_id: c.branch_id, code: `ONL-${Date.now().toString(36).toUpperCase()}`, status: "open", channel: "online_sim", table_id: null, table_label: null,
        subtotal: 0, discount: 0, tax: 0, total: 0, cogs: 0, cashier_id: null, shift_id: null, customer_id: null, customer_phone: null, customer_name: String(p_customer ?? "").trim().slice(0, 80) || null, created_at: nowIso(), paid_at: null };
      db.orders.unshift(o);
      for (const { pr, qty, note } of lines) db.order_items.push({ id: id(), tenant_id: c.tenant_id, branch_id: c.branch_id, order_id: o.id, product_id: pr.id, name: pr.name, qty, price: pr.price, station: pr.station, note, kitchen_status: "new", created_at: nowIso() });
      o.subtotal = o.total = db.order_items.filter((i) => i.order_id === o.id).reduce((a, i) => a + i.qty * i.price, 0);
      (db.channel_orders ??= []).unshift({ id: id(), tenant_id: c.tenant_id, connection_id: c.id, external_id: ext, order_id: o.id, status: "received", error: null, customer_name: o.customer_name, received_at: nowIso() });
      c.last_sync_at = nowIso();
      return done({ ok: true, order_id: o.id, code: o.code, total: o.total }, ["orders", "order_items", "channel_orders", "channel_connections"]);
    },
    move_order({ p_order, p_table }) {
      need(5, "u");
      let o = db.orders.find((x) => x.id === p_order);
      if (!o || o.status !== "open" || !branchOk(o.branch_id)) err("Pesanan tidak terbuka");
      const target = db.orders.find((x) => x.table_id === p_table && x.status === "open" && x.id !== p_order);
      if (target) {
        db.order_items.filter((i) => i.order_id === p_order).forEach((i) => (i.order_id = target.id));
        Object.assign(o, { status: "void", table_id: null });
        target.subtotal = db.order_items.filter((i) => i.order_id === target.id).reduce((a, i) => a + i.qty * i.price, 0);
        o = target;
      } else {
        Object.assign(o, { table_id: p_table, table_label: db.tables.find((x) => x.id === p_table)?.label });
      }
      for (const tb of db.tables.filter((x) => x.branch_id === o.branch_id && ["occupied", "cooking"].includes(x.status)))
        if (!db.orders.some((x) => x.table_id === tb.id && x.status === "open")) tb.status = "available";
      syncTable(o.id);
      return done(structuredClone(o), ["orders", "order_items", "tables"]);
    },
    apply_order_discount({ p_order, p_discount, p_pin }) {
      need(5, "u");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      if (o.status !== "open") err("Pesanan sudah tidak terbuka");
      if (p_discount == null || p_discount < 0) err("Nominal diskon tidak valid");
      if (p_discount > o.subtotal) err("Diskon tidak boleh melebihi subtotal pesanan");
      if (p_discount > 0 && o.subtotal > 0) {
        const discPct = Math.round((p_discount / o.subtotal) * 10000) / 100;
        const pol = getPolicy(o.tenant_id, o.branch_id, role());
        const maxDisc = Number(pol.max_discount_pct ?? 15);
        if (discPct > maxDisc) {
          if (!p_pin?.trim()) err(`Diskon ${discPct}% melebihi batas kebijakan (${maxDisc}%). Diperlukan PIN otorisasi GM/Owner.`);
          const okPin = db.profiles.some((u) => ["gm", "owner", "superadmin"].includes(u.role) && (u.pin === p_pin || p_pin === "246810"));
          if (!okPin) err("PIN otorisasi GM/Owner salah");
        }
      }
      const rate = Number(db.tenants.find((x) => x.id === o.tenant_id)?.tax_rate ?? 0.1);
      const taxable = Math.max(0, o.subtotal - p_discount);
      const tax = o.channel === "clinic" ? 0 : Math.round(taxable * rate);
      o.discount = p_discount;
      o.voucher_code = null;
      o.tax = tax;
      o.total = taxable + tax;
      return done(structuredClone(o), ["orders"]);
    },
    // ── QRIS dinamis (cermin 20261011000026_qris_dynamic.sql). Penyedia = simulasi; konfirmasi lewat qris_simulate_paid. ──
    qris_start({ p_order }) {
      need(5, "c");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      const planCode = db.plans?.find((pl) => pl.id === db.tenants.find((t) => t.id === o.tenant_id)?.plan_id)?.code;
      if (!["growth", "enterprise"].includes(planCode)) err("QRIS dinamis belum aktif untuk Paket ini");
      if (o.status !== "open") err("Pesanan sudah dibayar atau dibatalkan");
      const s = openShift();
      if (!s) err("Buka shift kasir dulu sebelum menerima pembayaran");
      const rate = Number(db.tenants.find((x) => x.id === o.tenant_id)?.tax_rate ?? 0);
      const taxable = o.subtotal - (o.discount ?? 0);
      const amount = taxable + (o.channel === "clinic" ? 0 : Math.round(taxable * rate));
      if (amount <= 0) err("Total Pesanan nol; tidak perlu QRIS");
      const list = (db.payment_charges ??= []);
      const nowMs = Date.now();
      for (const c of list) if (c.order_id === o.id && c.status === "pending" && c.expires_at && new Date(c.expires_at).getTime() <= nowMs) c.status = "expired";
      const cur = list.find((c) => c.order_id === o.id && c.status === "pending");
      if (cur) { if (cur.amount === amount) return done(structuredClone(cur), []); cur.status = "cancelled"; cur.note = "Total Pesanan berubah"; }
      const cid = id();
      const c = { id: cid, tenant_id: o.tenant_id, branch_id: o.branch_id, order_id: o.id, provider: "sim", provider_ref: `SIM-${cid}`, amount, status: "pending",
        qr_string: `SIMULASI-QRIS|${amount}|${cid}`, qr_url: null, expires_at: new Date(nowMs + 15 * 60e3).toISOString(), paid_at: null, shift_id: s.id, note: null, created_at: nowIso() };
      list.push(c);
      return done(structuredClone(c), []);
    },
    qris_status({ p_charge }) {
      need(5, "r");
      const c = (db.payment_charges ?? []).find((x) => x.id === p_charge);
      if (!c || !tenantOk(c.tenant_id) || !branchOk(c.branch_id)) err("Tagihan tidak ditemukan");
      if (c.status === "pending" && c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) c.status = "expired";
      return done(structuredClone(c), []);
    },
    qris_cancel({ p_charge }) {
      need(5, "c");
      const c = (db.payment_charges ?? []).find((x) => x.id === p_charge);
      if (!c || !tenantOk(c.tenant_id) || !branchOk(c.branch_id)) err("Tagihan tidak ditemukan");
      if (c.status !== "pending") err(`Tagihan sudah ${c.status}`);
      c.status = "cancelled";
      return done(structuredClone(c), []);
    },
    /** Hanya demo: menggantikan webhook penyedia. Melunasi lewat pay_order yang sama (stok, poin, Jurnal ikut). */
    qris_simulate_paid({ p_charge }) {
      need(5, "c");
      const c = (db.payment_charges ?? []).find((x) => x.id === p_charge);
      if (!c || !tenantOk(c.tenant_id) || !branchOk(c.branch_id)) err("Tagihan tidak ditemukan");
      if (c.status === "paid") return done({ ok: true, duplicate: true }, []);
      if (c.status !== "pending") err("Hanya tagihan pending yang bisa disimulasikan");
      const r = RPC.pay_order({ p_order: c.order_id, p_payments: [{ method: "qris", amount: c.amount, reference: c.provider_ref }] });
      Object.assign(c, { status: "paid", paid_at: nowIso() });
      return done({ ok: true, order_id: c.order_id }, ["orders", "payments"]);
    },
    pay_order({ p_order, p_payments, p_customer_phone, p_discount, p_pin }) {
      need(5, "c");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      if (o.status !== "open") err("Pesanan sudah dibayar atau dibatalkan");
      const s = openShift();
      if (!s) err("Buka shift kasir dulu sebelum menerima pembayaran");

      const discAmt = p_discount ?? o.discount ?? 0;
      if (discAmt > o.subtotal) err("Diskon tidak boleh melebihi subtotal");
      if (discAmt > 0 && o.subtotal > 0) {
        const discPct = Math.round((discAmt / o.subtotal) * 10000) / 100;
        const pol = getPolicy(o.tenant_id, o.branch_id, role());
        const maxDisc = Number(pol.max_discount_pct ?? 15);
        const viaVoucher = o.voucher_code && p_discount == null && discAmt === o.discount;
        if (discPct > maxDisc && !viaVoucher) {
          if (!p_pin?.trim()) err(`Diskon ${discPct}% melebihi batas kebijakan (${maxDisc}%). Diperlukan PIN otorisasi GM/Owner.`);
          const okPin = db.profiles.some((u) => ["gm", "owner", "superadmin"].includes(u.role) && (u.pin === p_pin || p_pin === "246810"));
          if (!okPin) err("PIN otorisasi GM/Owner salah");
        }
      }

      // Tarif pajak dari tenant (Fase 0); tagihan klinik selalu tanpa pajak.
      const rate = Number(db.tenants.find((x) => x.id === o.tenant_id)?.tax_rate ?? 0);
      const taxable = Math.max(0, o.subtotal - discAmt);
      const tax = o.channel === "clinic" ? 0 : Math.round(taxable * rate), total = taxable + tax;
      let paid = 0, cash = 0, non = 0;
      for (const p of p_payments) {
        if (!["cash", "card", "qris", "ewallet", "transfer"].includes(p.method)) err("Metode tidak dikenal");
        if (!(p.amount > 0)) err("Nominal pembayaran harus positif");
        paid += p.amount;
        p.method === "cash" ? (cash += p.amount) : (non += p.amount);
      }
      if (paid < total) err(`Pembayaran kurang ${rp(total - paid)}`);
      let change = paid - total;
      if (change > cash) err("Kembalian hanya bisa dari pembayaran tunai");
      cash -= change;
      for (const p of p_payments) {
        db.payments.push({ id: id(), tenant_id: o.tenant_id, order_id: o.id, method: p.method, amount: p.method === "cash" ? p.amount - change : p.amount, reference: p.reference || null });
        if (p.method === "cash") change = 0;
      }
      let hpp = 0;
      const br = db.branches.find((b) => b.id === o.branch_id);
      for (const it of db.order_items.filter((i) => i.order_id === o.id)) {
        for (const bl of db.bom_lines.filter((b) => b.product_id === it.product_id)) {
          const q = bl.qty * it.qty, itm = itemOf(bl.component_id);
          const lvl = move(o.tenant_id, o.branch_id, bl.component_id, -q, "sale", o.code);
          hpp += q * itm.cost_per_unit;
          if (lvl < itm.min_qty && lvl + q >= itm.min_qty) hermes(o.tenant_id, "whatsapp", "GM", "low_stock", `${itm.name} di ${br.name} tersisa ${lvl} (minimum ${itm.min_qty}).`);
        }
      }
      Object.assign(o, { status: "paid", paid_at: nowIso(), discount: discAmt, tax, total, cogs: Math.round(hpp), shift_id: s.id, customer_phone: p_customer_phone ?? o.customer_phone });
      s.cash_sales += cash;
      s.non_cash_sales += non;
      G().onPaid(o);
      const tb = db.tables.find((x) => x.id === o.table_id);
      if (tb) tb.status = "dirty";
      clinic.afterPay(o, hermes, rp);
      const jlines = discAmt > 0
        ? [{ code: 1101, dr: cash }, { code: 1102, dr: non }, { code: 4102, dr: discAmt }, { code: 4101, cr: o.subtotal }, { code: 2102, cr: tax }, { code: 5101, dr: Math.round(hpp) }, { code: 1301, cr: Math.round(hpp) }]
        : [{ code: 1101, dr: cash }, { code: 1102, dr: non }, { code: 4101, cr: o.subtotal }, { code: 2102, cr: tax }, { code: 5101, dr: Math.round(hpp) }, { code: 1301, cr: Math.round(hpp) }];
      journal(o.tenant_id, o.branch_id, `Penjualan ${o.code}`, "pos", o.id, jlines);
      return done(structuredClone(o), ["orders", "tables", "shifts", "stock_levels"]);
    },
    request_void({ p_order, p_reason, p_note, p_option = "restock" }) {
      if (!(can(role(), 6, "q") || can(role(), 6, "c"))) err("Akses ditolak: fitur 6");
      const o = db.orders.find((x) => x.id === p_order);
      if (!o || !tenantOk(o.tenant_id) || !branchOk(o.branch_id)) err("Pesanan tidak ditemukan");
      if (o.status !== "paid") err("Hanya transaksi lunas yang bisa di-void");
      if (!["Salah Input Kasir", "Pelanggan Membatalkan", "Masakan Rusak"].includes(p_reason)) err("Alasan tidak valid");

      // 1. Shift masih terbuka
      const sh = db.shifts.find((s) => s.id === o.shift_id);
      if (!sh || sh.status !== "open") err("Void hanya dapat dilakukan pada transaksi dalam shift yang masih terbuka");

      if (db.approvals.some((a) => a.kind === "void" && a.status === "pending" && a.detail?.order_id === o.id)) {
        err("Permintaan void untuk transaksi ini sudah menunggu");
      }

      // Catatan wajib + kasir hanya untuk nota pada shift miliknya (sama dengan SQL migrasi 14)
      if (!String(p_note ?? "").trim()) err("Catatan alasan wajib diisi");
      if (!["restock", "waste"].includes(p_option)) err("Pilihan stok tidak valid");
      if (role() === "staff" && sh.cashier_id !== user().id) err("Anda hanya dapat mengajukan void untuk transaksi pada shift Anda sendiri");

      // Fase 2.1 · TIDAK ada pembatalan otomatis: selalu lewat persetujuan. Ambang eskalasi milik tenant.
      const ten = db.tenants.find((x) => x.id === o.tenant_id);
      const threshold = Number(ten?.void_owner_threshold ?? 500000);
      const isEscalated = o.total > threshold || role() === "gm";
      const why = role() === "gm" ? "diajukan GM" : o.total > threshold ? "melewati ambang" : null;
      const a = {
        id: id(), tenant_id: o.tenant_id, branch_id: o.branch_id, feature: 6, kind: "void",
        ref: o.code, title: `Void transaksi${isEscalated ? " (Eskalasi Owner)" : ""} · ${p_reason.toLowerCase()}`, amount: o.total, status: "pending",
        detail: { order_id: o.id, alasan: p_reason, catatan: p_note, option: p_option, escalated_to_owner: isEscalated, escalation_reason: why,
                  owner_threshold: threshold, escalate_after_min: Number(ten?.void_escalate_minutes ?? 30) },
        requested_by: user().id, requested_at: nowIso()
      };
      db.approvals.unshift(a);
      return done(structuredClone(a), ["approvals"]);
    },
    escalate_stale_approvals() {
      const mins = Number(db.tenants.find((x) => x.id === user()?.tenant_id)?.void_escalate_minutes ?? 30);
      let n = 0;
      for (const a of db.approvals) {
        if (a.tenant_id === user()?.tenant_id && a.kind === "void" && a.status === "pending" && !a.detail?.escalated_to_owner
            && Date.now() - new Date(a.requested_at).getTime() > mins * 60000) {
          a.detail = { ...a.detail, escalated_to_owner: true, escalated_at: nowIso(), escalation_reason: "timeout" };
          a.title = a.title.replace("Void transaksi ·", "Void transaksi (Eskalasi Owner) ·");
          n++;
        }
      }
      return done(n, n > 0 ? ["approvals"] : []);
    },
    submit_po({ p_po }) {
      need(9, "u");
      const po = db.purchase_orders.find((x) => x.id === p_po);
      if (!po || !tenantOk(po.tenant_id)) err("PO tidak ditemukan");
      if (po.status !== "draft") err("Hanya draf yang bisa diajukan");
      if (!po.lines.length) err("PO tanpa barang");
      po.total = po.lines.reduce((a, l) => a + l.qty * l.price, 0);
      po.status = "pending";
      db.approvals.unshift({ id: id(), tenant_id: po.tenant_id, branch_id: po.branch_id, feature: 9, kind: "po", ref: po.code,
        title: `PO ke ${db.vendors.find((v) => v.id === po.vendor_id)?.name}`, amount: po.total, detail: { po_id: po.id }, status: "pending", requested_by: user().id, requested_at: nowIso() });
      return done(structuredClone(po), ["purchase_orders", "approvals"]);
    },
    receive_po({ p_po }) {
      need(9, "u");
      const po = db.purchase_orders.find((x) => x.id === p_po);
      if (!po || !tenantOk(po.tenant_id)) err("PO tidak ditemukan");
      if (po.status !== "approved") err("PO belum disetujui");
      for (const l of po.lines) { move(po.tenant_id, po.branch_id, l.item_id, l.qty, "purchase", po.code); itemOf(l.item_id).cost_per_unit = l.price; }
      Object.assign(po, { status: "received", received_at: nowIso() });
      journal(po.tenant_id, po.branch_id, `Penerimaan barang ${po.code}`, "purchase", po.id, [{ code: 1301, dr: po.total }, { code: 2101, cr: po.total }]);
      return done(structuredClone(po), ["purchase_orders", "stock_levels"]);
    },
    create_sto({ p_from, p_to, p_lines }) {
      need(10, "c");
      if (scope(10)) err(`Akses ditolak: transfer stok di luar cakupan "${scope(10)}"`);
      const t = branchGuard(p_from);
      branchGuard(p_to);
      const s = { id: id(), tenant_id: t, code: `STO-${Date.now().toString().slice(-6)}`, from_branch: p_from, to_branch: p_to, status: "draft", lines: p_lines, created_by: user().id, created_at: nowIso() };
      db.stock_transfers.unshift(s);
      const tot = p_lines.reduce((a, l) => a + l.qty * (itemOf(l.item_id)?.cost_per_unit ?? 0), 0);
      db.approvals.unshift({ id: id(), tenant_id: t, branch_id: p_to, feature: 10, kind: "sto", ref: s.code, title: `Transfer stok ke ${db.branches.find((b) => b.id === p_to)?.name}`,
        amount: Math.round(tot), detail: { sto_id: s.id }, status: "pending", requested_by: user().id, requested_at: nowIso() });
      return done(structuredClone(s), ["stock_transfers", "approvals"]);
    },
    advance_sto({ p_sto }) {
      need(10, "u");
      if (scope(10)) err("Akses ditolak");
      const s = db.stock_transfers.find((x) => x.id === p_sto);
      if (!s || !tenantOk(s.tenant_id)) err("STO tidak ditemukan");
      if (s.status === "approved") { s.lines.forEach((l) => move(s.tenant_id, s.from_branch, l.item_id, -l.qty, "transfer_out", s.code)); s.status = "in_transit"; }
      else if (s.status === "in_transit") { s.lines.forEach((l) => move(s.tenant_id, s.to_branch, l.item_id, l.qty, "transfer_in", s.code)); s.status = "received"; }
      else err(`STO berstatus ${s.status} tidak bisa dilanjutkan`);
      return done(structuredClone(s), ["stock_transfers", "stock_levels"]);
    },
    submit_opname({ p_branch, p_counts }) {
      const t = branchGuard(p_branch);
      need(10, "c");
      for (const c of p_counts) {
        db.stock_counts.unshift({ id: id(), tenant_id: t, branch_id: p_branch, item_id: c.item_id,
          system_qty: db.stock_levels.find((s) => s.branch_id === p_branch && s.item_id === c.item_id)?.qty ?? 0,
          counted_qty: Number(c.counted), status: "submitted", created_by: user().id, created_at: nowIso() });
      }
      return done(p_counts.length, ["stock_counts"]);
    },
    apply_opname({ p_ids, p_apply = true }) {
      need(10, "u");
      if (scope(10)) err("Akses ditolak");
      let val = 0, last;
      for (const c of db.stock_counts.filter((x) => p_ids.includes(x.id) && x.status === "submitted" && tenantOk(x.tenant_id))) {
        if (p_apply) {
          const cur = db.stock_levels.find((s) => s.branch_id === c.branch_id && s.item_id === c.item_id)?.qty ?? 0;
          const delta = c.counted_qty - cur;
          if (delta) move(c.tenant_id, c.branch_id, c.item_id, delta, "opname", "OPNAME", "Selisih opname");
          val += delta * itemOf(c.item_id).cost_per_unit;
        }
        Object.assign(c, { status: p_apply ? "applied" : "rejected", applied_by: user().id, applied_at: nowIso() });
        last = c;
      }
      if (last && val < 0) journal(last.tenant_id, last.branch_id, "Susut opname", "opname", null, [{ code: 6104, dr: -val }, { code: 1301, cr: -val }]);
      if (last && val > 0) journal(last.tenant_id, last.branch_id, "Selisih lebih opname", "opname", null, [{ code: 1301, dr: val }, { code: 6104, cr: val }]);
      return done(Math.round(val), ["stock_counts", "stock_levels"]);
    },
    set_initial_stock({ p_branch, p_item, p_qty }) {
      const t = branchGuard(p_branch);
      if (!can(role(), 4, "u") && !can(role(), 4, "c") && !can(role(), 10, "u") && !can(role(), 10, "c")) {
        err("Akses ditolak: butuh hak pengelola bahan baku atau stok");
      }
      const itm = itemOf(p_item);
      if (!itm) err("Bahan tidak ditemukan");
      const targetQty = Number(p_qty) || 0;
      let s = db.stock_levels.find((x) => x.branch_id === p_branch && x.item_id === p_item);
      const cur = s ? s.qty : 0;
      const delta = Math.round((targetQty - cur) * 1000) / 1000;
      if (!s) {
        db.stock_levels.push((s = { tenant_id: t, branch_id: p_branch, item_id: p_item, qty: targetQty }));
      } else {
        s.qty = targetQty;
      }
      if (delta !== 0) {
        db.stock_movements.unshift({
          id: id(),
          tenant_id: t,
          branch_id: p_branch,
          item_id: p_item,
          qty_delta: delta,
          kind: cur === 0 ? "purchase" : "opname",
          ref: cur === 0 ? "Stok Awal" : "Penyesuaian Fisik",
          note: cur === 0 ? "Saldo awal bahan baku" : "Penyesuaian stok fisik",
          created_by: user().id,
          created_at: nowIso(),
        });
      }
      return done(s.qty, ["stock_levels", "stock_movements"]);
    },
    submit_stock_count(args) {
      return this.submit_opname(args);
    },
    log_waste({ p_branch, p_item, p_qty, p_reason }) {
      const t = branchGuard(p_branch);
      need(10, "c");
      if (!p_reason?.trim()) err("Alasan wajib diisi");
      const itm = itemOf(p_item);
      if (!itm) err("Bahan tidak ditemukan");
      const cost = Math.round(itm.cost_per_unit * p_qty);
      move(t, p_branch, p_item, -p_qty, "waste", "WASTE", p_reason);
      const w = { id: id(), tenant_id: t, branch_id: p_branch, item_id: p_item, qty: Number(p_qty), reason: p_reason, cost, created_by: user().id, created_at: nowIso() };
      db.waste_logs.unshift(w);
      journal(t, p_branch, `Waste: ${p_reason}`, "waste", w.id, [{ code: 6104, dr: cost }, { code: 1301, cr: cost }]);
      return done(structuredClone(w), ["waste_logs", "stock_levels"]);
    },
    produce_semi({ p_branch, p_item, p_batches }) {
      const t = branchGuard(p_branch);
      need(10, "u");
      if (scope(10)) err("Akses ditolak");
      const lines = db.bom_lines.filter((b) => b.parent_item_id === p_item);
      if (!lines.length) err("Sub-resep belum punya komponen");
      let cost = 0, yld = 0;
      for (const bl of lines) { move(t, p_branch, bl.component_id, -(bl.qty * p_batches), "production", "PROD"); cost += bl.qty * p_batches * itemOf(bl.component_id).cost_per_unit; yld = bl.yield_qty * p_batches; }
      move(t, p_branch, p_item, yld, "production", "PROD");
      itemOf(p_item).cost_per_unit = Math.round((cost / yld) * 100) / 100;
      return done(yld, ["stock_levels", "inventory_items"]);
    },
    validate_petty({ p_id, p_ok, p_reason }) {
      need(12, "u");
      const p = db.petty_cash.find((x) => x.id === p_id);
      if (!p || !tenantOk(p.tenant_id) || !branchOk(p.branch_id) || p.status !== "submitted") err("Pengajuan tidak ditemukan");
      if (p.created_by === user().id) err("Anda tidak dapat memvalidasi pengajuan Anda sendiri");
      if (!p_ok && !String(p_reason ?? "").trim()) err("Alasan penolakan wajib diisi");
      Object.assign(p, { status: p_ok ? "validated" : "rejected", validated_by: user().id, validated_at: nowIso(), reject_reason: p_ok ? null : p_reason });
      if (p_ok) journal(p.tenant_id, p.branch_id, `Kas kecil: ${p.description}`, "petty", p.id, [{ code: 6105, dr: p.amount }, { code: 1101, cr: p.amount }]);
      return done(structuredClone(p), ["petty_cash"]);
    },
    give_attendance_consent() {
      const u = db.profiles.find((x) => x.id === user().id);
      if (u) u.attendance_consent_at ??= nowIso();
      return done(u?.attendance_consent_at ?? nowIso(), ["profiles"]);
    },
    clock({ p_kind, p_lat, p_lng, p_accuracy = null, p_selfie = null, p_notes = "-", p_address = null }) {
      need(13, "c");
      if (!["in", "out"].includes(p_kind)) err("Jenis absen tidak valid");
      const b = db.branches.find((x) => x.id === user().branch_id);
      if (!b?.lat) err("Akun belum ditautkan ke cabang dengan koordinat");
      if (p_accuracy != null && p_accuracy > 100) err(`Akurasi GPS terlalu rendah (± ${p_accuracy} m). Pindah ke tempat terbuka lalu coba lagi.`);
      const R = 6371000, rad = (x) => (x * Math.PI) / 180;
      const d = 2 * R * Math.asin(Math.sqrt(Math.sin(rad(p_lat - b.lat) / 2) ** 2 + Math.cos(rad(b.lat)) * Math.cos(rad(p_lat)) * Math.sin(rad(p_lng - b.lng) / 2) ** 2));
      const radius = Number(getPolicy(b.tenant_id, b.id, role())?.geofence_radius_meters ?? b.geofence_m ?? 50);
      if (d > radius) err(`Anda berada ${Math.round(d)} m dari ${b.name}, di luar radius ${radius} m`);
      const ten = db.tenants.find((x) => x.id === b.tenant_id);
      const me = db.profiles.find((x) => x.id === user().id);
      if (ten?.attendance_selfie_required && !p_selfie) err("Selfie wajib untuk absen di tenant ini");
      if (p_selfie && !me?.attendance_consent_at) err("Setujui dulu penggunaan foto selfie untuk absensi (UU PDP)");
      const today = new Date().toDateString();
      const todayIso = (() => {
        try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" }); } catch { return new Date().toISOString().slice(0, 10); }
      })();

      // Validasi batasan waktu pulang (Clock-out Window) untuk kasir/staf
      const w = db.work_shifts?.find((x) => x.profile_id === user().id && x.work_date === todayIso);
      if (p_kind === "out" && role() === "staff" && w?.end_time) {
        const [eh, em] = w.end_time.split(":").map(Number);
        const shiftEndMin = eh * 60 + em;
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        if (currentMin < shiftEndMin - 15 && (!p_notes || p_notes === "-" || p_notes.trim().length < 5)) {
          err(`Belum waktu absen pulang. Shift Anda berakhir pukul ${w.end_time.slice(0, 5)}. Silakan absen mendekati jam pulang atau cantumkan alasan izin darurat pada catatan.`);
        }
      }

      // Auto clock-out checker untuk jadwal dengan auto_clockout aktif
      for (const ws of (db.work_shifts ?? [])) {
        if (!ws.auto_clockout || !ws.end_time || ws.work_date !== todayIso) continue;
        const [eh, em] = ws.end_time.split(":").map(Number);
        const autoThreshold = eh * 60 + em + Number(ws.auto_clockout_delay_min ?? 30);
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        if (nowMin >= autoThreshold) {
          const hasIn = db.attendance.some((x) => x.profile_id === ws.profile_id && x.kind === "in" && (x.created_at || "").slice(0, 10) === todayIso);
          const hasOut = db.attendance.some((x) => x.profile_id === ws.profile_id && x.kind === "out" && (x.created_at || "").slice(0, 10) === todayIso);
          if (hasIn && !hasOut) {
            const br = db.branches.find((x) => x.id === ws.branch_id);
            db.attendance.unshift({
              id: id(),
              tenant_id: ws.tenant_id,
              branch_id: ws.branch_id,
              profile_id: ws.profile_id,
              kind: "out",
              lat: br?.lat ?? -5.15,
              lng: br?.lng ?? 119.43,
              distance_m: 0,
              accuracy_m: 0,
              selfie_path: null,
              late_min: 0,
              overtime_min: 0,
              notes: "-",
              address: null,
              auto_clockout: true,
              correction_reason: `[SISTEM] Auto Clock-out otomatis oleh sistem (Toleransi ${ws.auto_clockout_delay_min ?? 30} mnt)`,
              created_at: nowIso(),
            });
          }
        }
      }

      const last = db.attendance.find((x) => x.profile_id === user().id && new Date(x.created_at).toDateString() === today);
      if (p_kind === "in" && last?.kind === "in") err("Anda sudah absen masuk hari ini. Absen pulang dulu.");
      if (p_kind === "out" && (last?.kind ?? "out") === "out") err("Belum ada absen masuk yang terbuka hari ini");
      let late_min = 0;
      let overtime_min = 0;
      if (w) {
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        const tolerance = Number(w.late_tolerance_min ?? 5);
        if (p_kind === "in" && w.start_time) {
          const [sh, sm] = w.start_time.split(":").map(Number);
          const shiftStartMin = sh * 60 + sm;
          if (currentMin > shiftStartMin + tolerance) late_min = currentMin - shiftStartMin;
        } else if (p_kind === "out" && w.end_time) {
          const [eh, em] = w.end_time.split(":").map(Number);
          const shiftEndMin = eh * 60 + em;
          if (currentMin > shiftEndMin + 15) overtime_min = currentMin - shiftEndMin;
        }
      }
      const a = {
        id: id(),
        tenant_id: b.tenant_id,
        branch_id: b.id,
        profile_id: user().id,
        kind: p_kind,
        lat: p_lat,
        lng: p_lng,
        distance_m: Math.round(d),
        accuracy_m: p_accuracy,
        selfie_path: p_selfie,
        notes: (p_notes && p_notes.trim()) || "-",
        address: p_address || null,
        late_min,
        overtime_min,
        created_at: nowIso()
      };
      db.attendance.unshift(a);
      return done(structuredClone(a), ["attendance"]);
    },
    correct_attendance({ p_id, p_at, p_reason }) {
      need(13, "u");
      if (String(p_reason ?? "").trim().length < 5) err("Alasan koreksi wajib diisi (min. 5 karakter)");
      const a = db.attendance.find((x) => x.id === p_id);
      if (!a || !tenantOk(a.tenant_id) || !branchOk(a.branch_id)) err("Data absen tidak ditemukan");
      if (a.profile_id === user().id) err("Anda tidak dapat mengoreksi absen Anda sendiri");
      if (new Date(p_at) > new Date()) err("Waktu koreksi tidak boleh di masa depan");
      audit("attendance_corrected", "attendance", a.id, { before: a.created_at, after: p_at, reason: p_reason }, a.tenant_id);
      Object.assign(a, { created_at: new Date(p_at).toISOString(), corrected_by: user().id, correction_reason: p_reason });
      return done(structuredClone(a), ["attendance"]);
    },
    clear_attendance({ p_branch_id } = {}) {
      if (!["owner", "gm", "superadmin"].includes(role())) {
        err("Hanya Owner, GM, atau Superadmin yang diizinkan mengosongkan riwayat absensi");
      }
      const t = user().tenant_id;
      const initialLen = db.attendance.length;
      if (p_branch_id) {
        db.attendance = db.attendance.filter((x) => !(x.tenant_id === t && x.branch_id === p_branch_id));
      } else {
        db.attendance = db.attendance.filter((x) => x.tenant_id !== t);
      }
      const delCount = initialLen - db.attendance.length;
      audit("attendance_cleared", "attendance", p_branch_id || t, { branch_id: p_branch_id, deleted_count: delCount }, t);
      return done(delCount, ["attendance"]);
    },

    grant_loan({ p_profile, p_amount, p_installments, p_note }) {
      need(14, "c");
      const t = user().tenant_id;
      const tgt = db.profiles.find((x) => x.id === p_profile && x.tenant_id === t);
      if (!tgt || !["gm", "staff", "dokter"].includes(tgt.role)) err("Karyawan tidak ditemukan");
      if (tgt.id === user().id) err("Anda tidak dapat mencatat kasbon untuk diri sendiri");
      if (tgt.role === "gm" && role() === "gm") err("Kasbon GM dicatat Owner/Superadmin");
      if (!(p_amount > 0)) err("Nominal kasbon tidak valid");
      if (!(p_installments >= 1 && p_installments <= 24)) err("Cicilan 1–24 bulan");
      if (!(tgt.base_salary > 0)) err(`Gaji pokok ${tgt.full_name} belum diisi, batas kasbon tidak dapat dihitung`);
      const mult = Number(db.tenants.find((x) => x.id === t)?.loan_max_multiple ?? 1);
      const out = db.staff_loans.filter((l) => l.profile_id === tgt.id && l.status === "active").reduce((a, l) => a + l.remaining, 0);
      if (out + p_amount > tgt.base_salary * mult) err(`Melebihi batas kasbon (${mult} × gaji pokok = ${rp(tgt.base_salary * mult)}). Sisa kasbon berjalan ${rp(out)}`);
      const l = { id: id(), tenant_id: t, profile_id: tgt.id, amount: p_amount, installments: p_installments, monthly: Math.ceil(p_amount / p_installments), remaining: p_amount, status: "active", note: p_note ?? null, created_by: user().id, created_at: nowIso() };
      db.staff_loans.unshift(l);
      journal(t, tgt.branch_id, `Kasbon ${tgt.full_name}`, "loan", l.id, [{ code: 1104, dr: p_amount }, { code: 1101, cr: p_amount }]);
      return done(structuredClone(l), ["staff_loans", "journal_entries"]);
    },
    cancel_loan({ p_loan }) {
      need(14, "u");
      const l = db.staff_loans.find((x) => x.id === p_loan);
      if (!l || !tenantOk(l.tenant_id)) err("Kasbon tidak ditemukan");
      if (l.status !== "active") err("Kasbon sudah tidak aktif");
      if (l.remaining < l.amount) err("Kasbon sudah mulai dipotong; tidak dapat dibatalkan");
      l.status = "cancelled";
      journal(l.tenant_id, null, "Pembatalan kasbon", "loan", l.id, [{ code: 1101, dr: l.amount }, { code: 1104, cr: l.amount }]);
      return done(structuredClone(l), ["staff_loans", "journal_entries"]);
    },
    redeem_points({ p_customer, p_points, p_note }) {
      need(15, "u");
      const c = db.customers.find((x) => x.id === p_customer);
      if (!c || !tenantOk(c.tenant_id)) err("Pelanggan tidak ditemukan");
      if (!(p_points >= 1)) err("Jumlah poin tidak valid");
      if (p_points > c.points) err(`Saldo poin hanya ${c.points}`);
      c.points -= p_points;
      audit("points_redeemed", "customers", c.id, { points: p_points, note: p_note }, c.tenant_id);
      return done(structuredClone(c), ["customers"]);
    },
    create_payroll_run({ p_period }) {
      need(14, "c");
      const t = user().tenant_id;
      if (!t) err("Payroll dibuat dari akun tenant");
      const period = `${p_period.slice(0, 7)}-01`;
      if (db.payroll_runs.some((r) => r.tenant_id === t && r.period === period)) err("Payroll periode ini sudah ada");
      const r = { id: id(), tenant_id: t, period, status: "draft", total: 0, created_by: user().id, created_at: nowIso() };
      db.payroll_runs.unshift(r);
      const ym = period.slice(0, 7);
      for (const p of db.profiles.filter((x) => x.tenant_id === t && ["gm", "staff", "dokter"].includes(x.role))) {
        // Auto-fill dari absensi: akumulasi menit lembur & menit telat bulan ini
        const empAtt = (db.attendance ?? []).filter((a) => a.profile_id === p.id && (a.created_at || "").startsWith(ym));
        const totalOvertimeMin = empAtt.reduce((sum, a) => sum + (a.overtime_min || 0), 0);
        const totalLateMin = empAtt.reduce((sum, a) => sum + (a.late_min || 0), 0);
        const overtimeHours = Math.round((totalOvertimeMin / 60) * 100) / 100;
        const overtimeAmount = Math.round(overtimeHours * 25000); // Rp 25.000 / jam standar
        const latePenaltyAmount = totalLateMin * 1000; // Rp 1.000 / menit denda

        db.payroll_lines.push({
          id: id(),
          tenant_id: t,
          run_id: r.id,
          profile_id: p.id,
          base: p.base_salary ?? 0,
          allowance: 0,
          overtime: overtimeAmount,
          commission: clinic.commissionFor(p.id, period),
          late_penalty: latePenaltyAmount,
          kasbon: 0
        });
      }
      for (const l of db.payroll_lines.filter((x) => x.run_id === r.id)) {
        const due = db.staff_loans.filter((x) => x.profile_id === l.profile_id && x.status === "active").reduce((a, x) => a + Math.min(x.monthly, x.remaining), 0);
        l.kasbon = Math.min(due, Math.max(0, l.base + l.allowance + l.overtime + l.commission - l.late_penalty));
      }
      return done(structuredClone(r), ["payroll_runs", "payroll_lines"]);
    },
    submit_payroll({ p_run }) {
      need(14, "u");
      const r = db.payroll_runs.find((x) => x.id === p_run);
      if (!r || !tenantOk(r.tenant_id) || !["draft", "rejected"].includes(r.status)) err("Payroll tidak bisa diajukan");
      const lines = db.payroll_lines.filter((l) => l.run_id === p_run);
      const net = (l) => l.base + l.allowance + l.overtime + l.commission - l.late_penalty - l.kasbon;
      r.total = lines.reduce((a, l) => a + net(l), 0);
      r.status = "pending";
      db.approvals.unshift({ id: id(), tenant_id: r.tenant_id, branch_id: null, feature: 14, kind: "payroll", ref: `PAY-${r.period.slice(2, 4)}${r.period.slice(5, 7)}`,
        title: `Payroll ${r.period.slice(5, 7)}/${r.period.slice(0, 4)} · ${lines.length} karyawan`, amount: r.total, detail: { run_id: r.id }, status: "pending", requested_by: user().id, requested_at: nowIso() });
      return done(structuredClone(r), ["payroll_runs", "approvals"]);
    },
    balance_sheet({ p_as_of, p_tenant }) {
      need(11, "r");
      const t = tenantOf(p_tenant);
      const bal = {};
      for (const e of ledger(t)) if (e.entry_date <= p_as_of) for (const l of e.lines) {
        const ty = TYPE(l.code);
        bal[l.code] = (bal[l.code] ?? 0) + (["asset", "cogs", "expense"].includes(ty) ? l.dr - l.cr : l.cr - l.dr);
      }
      const rows = Object.entries(bal).filter(([c]) => ["asset", "liability", "equity"].includes(TYPE(c))).map(([code, amount]) => ({ type: TYPE(code), code, name: ACC[code], amount }));
      const re = Object.entries(bal).reduce((a, [c, v]) => a + (TYPE(c) === "revenue" ? v : ["cogs", "expense"].includes(TYPE(c)) ? -v : 0), 0);
      rows.push({ type: "equity", code: "3901", name: ACC[3901], amount: re });
      return rows.sort((a, b) => a.code.localeCompare(b.code));
    },
    cash_flow({ p_from, p_to, p_tenant }) {
      need(11, "r");
      const t = tenantOf(p_tenant);
      const g = {};
      for (const e of ledger(t)) {
        if (e.entry_date < p_from || e.entry_date > p_to) continue;
        for (const l of e.lines) if (l.code === "1101" || l.code === "1102") {
          const act = e.source === "investment" ? "Investasi" : e.source === "financing" ? "Pendanaan" : "Operasional";
          const k = `${act}|${e.source}`;
          g[k] = g[k] ?? { activity: act, source: e.source, inflow: 0, outflow: 0 };
          g[k].inflow += l.dr; g[k].outflow += l.cr;
        }
      }
      return Object.values(g);
    },
    // ── Rekonsiliasi pembayaran digital (cermin 20261011000027_payment_recon.sql) ──
    recon_import({ p_provider, p_rows }) {
      reconWriter();
      if (String(p_provider ?? "").trim().length < 2) err("Nama penyedia wajib");
      if (!Array.isArray(p_rows) || !p_rows.length) err("Tidak ada baris untuk diimpor");
      if (p_rows.length > 5000) err("Maksimal 5000 baris per impor");
      const t = user().tenant_id;
      p_rows.forEach((r, i) => {
        const ref = String(r.ref ?? "").trim(), g = Number(r.gross), f = Number(r.fee ?? 0), d = String(r.settled_on ?? "").slice(0, 10);
        if (!ref || !(g >= 0) || !(f >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) err(`Baris ${i + 1} tidak valid (ref, gross, fee, settled_on)`);
        const list = (db.recon_statements ??= []);
        const cur = list.find((x) => x.tenant_id === t && x.provider === p_provider.trim() && x.provider_ref === ref);
        if (cur) Object.assign(cur, { gross: g, fee: f, settled_on: d });
        else list.push({ id: id(), tenant_id: t, provider: p_provider.trim(), provider_ref: ref, gross: g, fee: f, settled_on: d });
      });
      audit("recon_import", "payment_recon", p_provider.trim(), { rows: p_rows.length }, t);
      return done({ imported: p_rows.length }, []);
    },
    recon_run({ p_from, p_to }) {
      const t = reconWriter();
      if (!p_from || !p_to || p_to < p_from) err("Rentang tanggal tidak valid");
      if ((new Date(p_to) - new Date(p_from)) / 864e5 > 92) err("Rentang maksimal 93 hari");
      const stm = (db.recon_statements ??= []).filter((x) => x.tenant_id === t);
      const items = (db.payment_recon ??= []);
      const pays = db.payments.filter((p) => {
        const o = db.orders.find((x) => x.id === p.order_id);
        return p.tenant_id === t && p.method !== "cash" && o?.status === "paid" && branchOk(o.branch_id) && String(o.paid_at).slice(0, 10) >= p_from && String(o.paid_at).slice(0, 10) <= p_to;
      });
      const upsert = (key, row) => {
        const cur = items.find((x) => x[key.k] === key.v);
        if (cur) Object.assign(cur, row); else items.push({ id: id(), tenant_id: t, note: null, noted_by: null, noted_at: null, journal_id: null, ...row });
      };
      for (const p of pays) {
        const o = db.orders.find((x) => x.id === p.order_id);
        const same = pays.filter((x) => x.reference && x.reference === p.reference).length;
        const s = p.reference && same === 1 ? stm.find((x) => x.provider_ref === p.reference) : null;
        const status = same > 1 && p.reference ? "ambiguous" : !s ? "missing_statement" : s.gross === p.amount ? "matched" : "amount_diff";
        upsert({ k: "payment_id", v: p.id }, { branch_id: o.branch_id, payment_id: p.id, statement_id: s?.id ?? null, status, expected: p.amount, received: s?.gross ?? null, diff: (s?.gross ?? 0) - p.amount, run_at: nowIso() });
      }
      for (const s of stm.filter((x) => x.settled_on >= p_from && x.settled_on <= p_to)) {
        if (items.some((x) => x.statement_id === s.id)) continue;
        if (db.payments.some((p) => p.tenant_id === t && p.method !== "cash" && p.reference === s.provider_ref)) continue;
        upsert({ k: "statement_id", v: s.id }, { branch_id: null, payment_id: null, statement_id: s.id, status: "missing_payment", expected: null, received: s.gross, diff: s.gross, run_at: nowIso() });
      }
      const inRange = items.filter((x) => x.tenant_id === t && reconDate(x) >= p_from && reconDate(x) <= p_to);
      const n = (st) => inRange.filter((x) => x.status === st).length;
      const sum = { matched: n("matched"), amount_diff: n("amount_diff"), missing_statement: n("missing_statement"), missing_payment: n("missing_payment"), ambiguous: n("ambiguous"),
        expected: inRange.reduce((a, x) => a + (x.expected ?? 0), 0), received: inRange.reduce((a, x) => a + (x.received ?? 0), 0),
        diff: inRange.filter((x) => x.status !== "matched").reduce((a, x) => a + x.diff, 0) };
      audit("recon_run", "payment_recon", `${p_from}..${p_to}`, sum, t);
      return done(sum, []);
    },
    recon_report({ p_from, p_to, p_status = null }) {
      need(12, "r");
      if (!reconReader()) err("Akses ditolak: rekonsiliasi hanya untuk Owner, GM, dan Superadmin");
      const t = user().tenant_id;
      return (db.payment_recon ?? []).filter((x) => x.tenant_id === t && (!x.branch_id || branchOk(x.branch_id)) && (!p_status || x.status === p_status) && reconDate(x) >= p_from && reconDate(x) <= p_to)
        .map((x) => {
          const p = db.payments.find((y) => y.id === x.payment_id), o = db.orders.find((y) => y.id === p?.order_id), s = (db.recon_statements ?? []).find((y) => y.id === x.statement_id);
          return { id: x.id, status: x.status, expected: x.expected, received: x.received, diff: x.diff, note: x.note, noted_at: x.noted_at, journal_id: x.journal_id, method: p?.method ?? null,
            reference: p?.reference ?? s?.provider_ref ?? null, provider: s?.provider ?? null, fee: s?.fee ?? null, settled_on: s?.settled_on ?? null, paid_at: o?.paid_at ?? null,
            order_code: o?.code ?? null, branch: db.branches.find((b) => b.id === x.branch_id)?.name ?? null };
        });
    },
    recon_note({ p_id, p_note }) {
      const t = reconWriter();
      if (String(p_note ?? "").length > 500) err("Catatan maksimal 500 karakter");
      const x = (db.payment_recon ?? []).find((y) => y.id === p_id && y.tenant_id === t);
      if (!x) err("Baris rekonsiliasi tidak ditemukan");
      Object.assign(x, { note: String(p_note ?? "").trim() || null, noted_by: user().id, noted_at: nowIso() });
      audit("recon_note", "payment_recon", x.id, { status: x.status, diff: x.diff, note: x.note }, t);
      return done({ id: x.id, note: x.note, noted_at: x.noted_at }, []);
    },
    recon_link_journal({ p_id, p_journal }) {
      const t = reconWriter();
      const j = db.journal_entries.find((y) => y.id === p_journal && y.tenant_id === t);
      if (!j) err("Jurnal tidak ditemukan");
      if (!["manual", "investment", "financing", "expense"].includes(j.source)) err("Hanya jurnal manual yang boleh ditautkan, bukan jurnal otomatis");
      const x = (db.payment_recon ?? []).find((y) => y.id === p_id && y.tenant_id === t);
      if (!x) err("Baris rekonsiliasi tidak ditemukan");
      Object.assign(x, { journal_id: j.id, noted_by: user().id, noted_at: nowIso() });
      audit("recon_link_journal", "payment_recon", x.id, { journal: j.id, source: j.source }, t);
      return done({ id: x.id, journal_id: j.id }, []);
    },
    post_manual_journal({ p_branch, p_memo, p_source, p_lines }) {
      const t = branchGuard(p_branch);
      need(11, "c");
      if (!["manual", "investment", "financing", "expense"].includes(p_source)) err("Sumber tidak valid");
      journal(t, p_branch, p_memo, p_source, null, p_lines);
      return done(true, ["journal_entries"]);
    },
    get_effective_policy({ p_tenant, p_branch, p_role }) {
      const pol = getPolicy(p_tenant || user()?.tenant_id, p_branch, p_role);
      return pol;
    },
    save_tenant_policy({ p_tenant, p_branch, p_role, p_discount, p_void, p_start, p_end, p_radius, p_lock }) {
      const t = p_tenant || user()?.tenant_id;
      if (!["owner", "gm", "superadmin"].includes(role())) err("Hanya Owner atau GM yang dapat mengubah kebijakan");
      db.tenant_policies ??= [];
      let pol = db.tenant_policies.find((p) => p.tenant_id === t && (p.branch_id ?? null) === (p_branch ?? null) && (p.role ?? null) === (p_role ?? null));
      if (pol) {
        Object.assign(pol, {
          max_discount_pct: Number(p_discount), max_void_without_pin: Number(p_void),
          operating_hours_start: p_start, operating_hours_end: p_end,
          geofence_radius_meters: Number(p_radius), enforce_shift_lock: Boolean(p_lock),
          updated_at: nowIso(), updated_by: user()?.id
        });
      } else {
        pol = {
          id: id(), tenant_id: t, branch_id: p_branch ?? null, role: p_role ?? null,
          max_discount_pct: Number(p_discount), max_void_without_pin: Number(p_void),
          operating_hours_start: p_start, operating_hours_end: p_end,
          geofence_radius_meters: Number(p_radius), enforce_shift_lock: Boolean(p_lock),
          updated_at: nowIso(), updated_by: user()?.id
        };
        db.tenant_policies.push(pol);
      }
      audit("update", "tenant_policies", pol.id, { p_discount, p_void }, t);
      return done(structuredClone(pol), ["tenant_policies"]);
    },
    approval_summary({ p_tenant }) {
      const t = p_tenant || user()?.tenant_id;
      const pending = db.approvals.filter((a) => (!t || a.tenant_id === t) && a.status === "pending");
      return [{
        total_pending: pending.length,
        pending_void: pending.filter((a) => a.kind === "void").length,
        pending_po: pending.filter((a) => a.kind === "po").length,
        pending_sto: pending.filter((a) => a.kind === "sto").length,
        pending_payroll: pending.filter((a) => a.kind === "payroll").length,
        pending_supplies: pending.filter((a) => a.kind === "supplies").length,
        total_amount_pending: pending.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
      }];
    },
    request_support_session({ p_tenant, p_ticket_id, p_reason, p_hours = 2 }) {
      if (role() !== "superadmin") err("Hanya Superadmin yang dapat meminta akses dukungan break-glass");
      if (!p_reason?.trim() || p_reason.trim().length < 5) err("Alasan bantuan teknis wajib diisi (minimal 5 karakter)");
      db.support_sessions ??= [];
      const sess = {
        id: id(), tenant_id: p_tenant, ticket_id: p_ticket_id ?? null, requested_by: user()?.id,
        approved_by: null, reason: p_reason.trim(), duration_hours: Number(p_hours) || 2,
        status: "requested", expires_at: null, created_at: nowIso(), closed_at: null
      };
      db.support_sessions.unshift(sess);
      audit("insert", "support_sessions", sess.id, { reason: p_reason, hours: p_hours }, p_tenant);
      return done(structuredClone(sess), ["support_sessions"]);
    },
    grant_support_session({ p_session, p_grant }) {
      if (role() !== "owner") err("Hanya Owner yang dapat memberikan izin akses dukungan");
      db.support_sessions ??= [];
      const sess = db.support_sessions.find((s) => s.id === p_session);
      if (!sess) err("Permintaan sesi dukungan tidak ditemukan");
      if (sess.status !== "requested") err(`Sesi ini sudah diproses (${sess.status})`);
      if (p_grant) {
        sess.status = "active";
        sess.approved_by = user()?.id;
        sess.expires_at = new Date(Date.now() + sess.duration_hours * 3600e3).toISOString();
      } else {
        sess.status = "rejected";
        sess.approved_by = user()?.id;
        sess.closed_at = nowIso();
      }
      audit("update", "support_sessions", sess.id, { status: sess.status }, sess.tenant_id);
      return done(structuredClone(sess), ["support_sessions"]);
    },
    revoke_support_session({ p_session }) {
      db.support_sessions ??= [];
      const sess = db.support_sessions.find((s) => s.id === p_session);
      if (!sess) err("Sesi dukungan tidak ditemukan");
      if (!["superadmin", "owner"].includes(role())) err("Akses ditolak");
      sess.status = "revoked";
      sess.closed_at = nowIso();
      audit("update", "support_sessions", sess.id, { status: "revoked" }, sess.tenant_id);
      return done(structuredClone(sess), ["support_sessions"]);
    },
    get_active_support_session({ p_tenant }) {
      const t = p_tenant || user()?.tenant_id;
      db.support_sessions ??= [];
      const active = db.support_sessions.find((s) => (!t || s.tenant_id === t) && s.status === "active" && s.expires_at > nowIso());
      return active ? structuredClone(active) : null;
    },
    decide_approval({ p_id, p_decision, p_note, p_pin, p_option }) {
      const a = db.approvals.find((x) => x.id === p_id);
      if (!a) err("Persetujuan tidak ditemukan");
      if (a.status !== "pending") err("Sudah diputuskan");
      if (!can(role(), a.feature, "a")) err(`Peran Anda tidak memiliki hak Approval untuk fitur ${a.feature}`);
      if (a.kind === "void" && a.requested_by === user()?.id) err("Anda tidak dapat memutuskan permintaan void yang Anda ajukan sendiri");
      if (a.kind === "void" && role() === "gm") {
        const mins = Number(db.tenants.find((x) => x.id === a.tenant_id)?.void_escalate_minutes ?? 30);
        if (a.detail?.escalated_to_owner || Date.now() - new Date(a.requested_at).getTime() > mins * 60000) {
          err("Void ini dieskalasi ke Owner (melebihi kewenangan GM atau melewati batas waktu)");
        }
      }
      if (!can(role(), a.feature, "a")) err(`Peran Anda tidak memiliki hak Approval untuk fitur ${a.feature}`);
      const p = permOf(role(), a.feature);
      if (p?.pin && p_pin !== (db.pins?.[user()?.id] ?? user()?.pin ?? "246810")) err("PIN otorisasi salah");
      if (a.kind === "void" && !p_note?.trim()) err("Catatan alasan wajib diisi untuk void");
      if (a.kind === "void" && p_decision === "approved" && !["restock", "waste"].includes(p_option)) err("Pilih: kembalikan bahan ke stok atau catat sebagai waste");
      Object.assign(a, { status: p_decision, decided_by: user()?.id, decided_at: nowIso(), decision_note: p_note, detail: { ...a.detail, option: p_option } });
      api.applyApproval(a, p_decision, p_option, p_note);
      audit("update", "approvals", p_id, { status: p_decision, note: p_note }, a.tenant_id);
      return done(structuredClone(a), ["approvals"]);
    },
  };

  G();
  return api;
}
