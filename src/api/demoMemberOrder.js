// Tiruan RPC pesan & reservasi Member untuk mode demo. Aturan SAMA dengan supabase/migrations/…025_member_order_reserve.sql.
// Beda yang disengaja: NIK cukup 16 digit (di database juga dicek kode provinsi dan tanggal lahir).
export const MEMBER_LIMIT = { open_orders: 3, orders_per_hour: 8, orders_branch_hr: 60, order_lines: 20, line_qty: 20, active_bookings: 3, bookings_per_hour: 5 };
const HOUR = 3600e3, MIN = 60e3, DAY = 86400e3;

/** Status yang dilihat Member, dihitung dari item dapur. */
export function trackOf(order, items) {
  if (order.status === "void") return "dibatalkan";
  if (order.status === "refunded") return "dikembalikan";
  if (order.status === "paid") return "selesai";
  const n = items.length;
  const c = (s) => items.filter((i) => i.kitchen_status === s).length;
  if (n === 0) return "diterima";
  if (c("served") === n) return "diantar";
  if (c("ready") + c("served") === n) return "siap";
  if (c("cooking") + c("ready") + c("served") > 0) return "dimasak";
  return "diterima";
}

export function createMemberOrderRpc({ db, ctx, fail, now, normPhone }) {
  const iso = (t = now()) => new Date(t).toISOString();
  const pillarOf = (u) => db.tenants.find((t) => t.id === u.tenant_id)?.pillar;
  const branchOf = (u, id) => db.branches.find((b) => b.id === id && b.tenant_id === u.tenant_id) ?? fail("Cabang tidak ditemukan");
  const mine = (c) => (db.orders ?? []).filter((o) => o.tenant_id === c.tenant_id && normPhone(o.customer_phone) && normPhone(o.customer_phone) === normPhone(c.phone));
  const orderJson = (o) => {
    const items = (db.order_items ?? []).filter((i) => i.order_id === o.id);
    return { id: o.id, code: o.code, status: o.status, track: trackOf(o, items), channel: o.channel, table_label: o.table_label, subtotal: o.subtotal, total: o.total, created_at: o.created_at, paid_at: o.paid_at,
      items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, note: i.note, kitchen_status: i.kitchen_status })) };
  };
  const bookingJson = (q) => ({ id: q.id, kind: q.kind, status: q.status, branch: db.branches.find((b) => b.id === q.branch_id)?.name, branch_id: q.branch_id, scheduled_at: q.scheduled_at, party_size: q.party_size, note: q.complaint, queue_no: q.queue_no });
  const bookingCheck = (at, party, kind) => {
    const t = new Date(at).getTime();
    if (!Number.isFinite(t) || t < now() + 30 * MIN) fail("Reservasi minimal 30 menit dari sekarang");
    if (t > now() + 60 * DAY) fail("Reservasi maksimal 60 hari ke depan");
    if (kind === "table" && !(Number.isInteger(party) && party >= 1 && party <= 20)) fail("Jumlah tamu 1–20");
  };
  const ownBooking = (c, id) => (db.queue_entries ?? []).find((q) => q.id === id && q.customer_id === c.id) ?? fail("Reservasi tidak ditemukan");

  return {
    member_menu() {
      const { u } = ctx();
      const pil = pillarOf(u);
      return { pillar: pil, can_order: pil !== "health", can_book_table: ["fnb", "omni"].includes(pil), can_book_clinic: ["health", "omni"].includes(pil),
        branches: db.branches.filter((b) => b.tenant_id === u.tenant_id && !b.is_warehouse).map((b) => ({ id: b.id, name: b.name })),
        products: pil === "health" ? [] : db.products.filter((p) => p.tenant_id === u.tenant_id).map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price, is_available: p.is_available })) };
    },
    member_place_order({ p_branch, p_items, p_table_label = null }) {
      const { u, c } = ctx();
      if (pillarOf(u) === "health") fail("Tenant ini tidak menerima pesanan menu");
      const b = branchOf(u, p_branch);
      if (!Array.isArray(p_items) || !p_items.length) fail("Keranjang kosong");
      if (p_items.length > MEMBER_LIMIT.order_lines) fail(`Maksimal ${MEMBER_LIMIT.order_lines} baris per pesanan`);
      const lbl = String(p_table_label ?? "").trim() || null;
      if (lbl && (lbl.length > 20 || /[<>]/.test(lbl))) fail("Nomor meja tidak valid");
      const all = (db.orders ?? []).filter((o) => o.channel === "member");
      const own = all.filter((o) => o.customer_id === c.id);
      const open = own.filter((o) => o.status === "open").length;
      if (open >= MEMBER_LIMIT.open_orders) fail(`Masih ada ${open} pesanan yang belum dibayar. Selesaikan dulu di kasir.`);
      const since = now() - HOUR;
      if (own.filter((o) => new Date(o.created_at).getTime() > since).length >= MEMBER_LIMIT.orders_per_hour) fail("Terlalu banyak pesanan dalam satu jam. Coba lagi nanti.");
      if (all.filter((o) => o.branch_id === b.id && new Date(o.created_at).getTime() > since).length >= MEMBER_LIMIT.orders_branch_hr) fail("Cabang sedang menerima banyak pesanan. Pesan langsung ke kasir.");
      // Validasi seluruh baris dulu supaya kegagalan tidak meninggalkan pesanan setengah jadi.
      const lines = p_items.map((it) => {
        const p = db.products.find((x) => x.id === it.product_id && x.tenant_id === u.tenant_id);
        if (!p) fail("Produk tidak ditemukan");
        const qty = Number(it.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > MEMBER_LIMIT.line_qty) fail(`Jumlah per item 1–${MEMBER_LIMIT.line_qty}`);
        if (!p.is_available) fail(`${p.name} sedang habis`);
        if (String(it.note ?? "").length > 100) fail("Catatan item maksimal 100 karakter");
        return { p, qty, note: String(it.note ?? "").trim() || null };
      });
      const d = new Date(now());
      const code = `ORD-${iso(now()).slice(2, 10).replaceAll("-", "")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6)}`;
      const o = { id: crypto.randomUUID(), tenant_id: u.tenant_id, branch_id: b.id, code, status: "open", channel: "member", table_id: null, table_label: lbl ?? "Ambil sendiri",
        subtotal: 0, discount: 0, tax: 0, total: 0, cogs: 0, cashier_id: null, shift_id: null, customer_id: c.id, customer_phone: c.phone, customer_name: c.name ?? u.full_name, created_at: iso(), paid_at: null };
      db.orders.unshift(o);
      for (const { p, qty, note } of lines) {
        db.order_items.push({ id: crypto.randomUUID(), tenant_id: u.tenant_id, branch_id: b.id, order_id: o.id, product_id: p.id, name: p.name, qty, price: p.price, station: p.station, note, kitchen_status: "new", created_at: iso() });
      }
      o.subtotal = o.total = db.order_items.filter((i) => i.order_id === o.id).reduce((a, i) => a + i.qty * i.price, 0);
      return orderJson(o);
    },
    member_orders() {
      const { c } = ctx();
      return mine(c).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 30).map(orderJson);
    },
    member_cancel_order({ p_order }) {
      const { u, c } = ctx();
      const o = mine(c).find((x) => x.id === p_order) ?? fail("Pesanan tidak ditemukan");
      if (o.channel !== "member") fail("Hanya pesanan yang dibuat lewat aplikasi yang bisa dibatalkan di sini");
      if (o.status !== "open") fail("Pesanan sudah dibayar atau dibatalkan");
      if ((db.order_items ?? []).some((i) => i.order_id === o.id && i.kitchen_status !== "new")) fail("Pesanan sudah diproses dapur. Hubungi kasir untuk membatalkan.");
      o.status = "void";
      db.audit?.unshift?.({ id: Date.now(), tenant_id: u.tenant_id, actor_id: u.id, actor_role: "member", action: "member_cancel_order", entity: "orders", entity_id: o.id, detail: { code: o.code }, created_at: iso() });
      return orderJson(o);
    },
    member_reservation_create({ p_branch, p_kind, p_at, p_party = null, p_note = null, p_nik = null }) {
      const { u, c } = ctx();
      const pil = pillarOf(u);
      if (!["table", "clinic"].includes(p_kind)) fail("Jenis reservasi tidak dikenal");
      if (p_kind === "table" && !["fnb", "omni"].includes(pil)) fail("Tenant ini tidak menerima reservasi meja");
      if (p_kind === "clinic" && !["health", "omni"].includes(pil)) fail("Tenant ini tidak menerima janji klinik");
      const b = branchOf(u, p_branch);
      bookingCheck(p_at, p_party, p_kind);
      if (String(p_note ?? "").length > 200) fail("Catatan maksimal 200 karakter");
      if (p_kind === "clinic" && !/^\d{16}$/.test(String(p_nik ?? ""))) fail("NIK tidak valid: harus 16 digit");
      const q0 = (db.queue_entries ??= []).filter((q) => q.customer_id === c.id);
      if (q0.filter((q) => q.status === "booked" && new Date(q.scheduled_at).getTime() > now()).length >= MEMBER_LIMIT.active_bookings) fail(`Maksimal ${MEMBER_LIMIT.active_bookings} reservasi aktif. Batalkan salah satu dulu.`);
      if (q0.filter((q) => new Date(q.created_at).getTime() > now() - HOUR).length >= MEMBER_LIMIT.bookings_per_hour) fail("Terlalu banyak reservasi dalam satu jam. Coba lagi nanti.");
      const day = iso(new Date(p_at).getTime()).slice(0, 10);
      const seq = db.queue_entries.filter((q) => q.branch_id === b.id && q.kind === p_kind && String(q.scheduled_at).slice(0, 10) === day).reduce((m, q) => Math.max(m, q.queue_no ?? 0), 0) + 1;
      const q = { id: crypto.randomUUID(), tenant_id: u.tenant_id, branch_id: b.id, kind: p_kind, queue_no: seq, name: (c.name || u.full_name || "Member").padEnd(2, " "), phone: c.phone,
        nik: p_kind === "clinic" ? p_nik : null, birth_date: null, sex: null, complaint: String(p_note ?? "").trim() || null, party_size: p_kind === "table" ? p_party : null,
        table_id: null, scheduled_at: iso(new Date(p_at).getTime()), status: "booked", patient_id: null, visit_id: null, practitioner_id: null, created_by: u.id, created_at: iso(), customer_id: c.id };
      db.queue_entries.unshift(q);
      return bookingJson(q);
    },
    member_reservations() {
      const { c } = ctx();
      return (db.queue_entries ?? []).filter((q) => q.customer_id === c.id && new Date(q.scheduled_at).getTime() > now() - 60 * DAY)
        .sort((a, b) => (a.scheduled_at < b.scheduled_at ? 1 : -1)).slice(0, 30).map(bookingJson);
    },
    member_reservation_update({ p_id, p_at, p_party = null, p_note = null }) {
      const { c } = ctx();
      const q = ownBooking(c, p_id);
      if (q.status !== "booked") fail("Reservasi ini sudah tidak bisa diubah");
      bookingCheck(p_at, p_party ?? q.party_size, q.kind);
      if (String(p_note ?? "").length > 200) fail("Catatan maksimal 200 karakter");
      q.scheduled_at = iso(new Date(p_at).getTime());
      if (q.kind === "table" && p_party != null) q.party_size = p_party;
      if (p_note != null) q.complaint = String(p_note).trim() || null;
      return bookingJson(q);
    },
    member_reservation_cancel({ p_id }) {
      const { c } = ctx();
      const q = ownBooking(c, p_id);
      if (q.status !== "booked") fail("Reservasi ini sudah tidak bisa dibatalkan di sini");
      q.status = "cancelled";
      return bookingJson(q);
    },
    reservationsOf: (c) => (db.queue_entries ?? []).filter((q) => q.customer_id === c.id),
  };
}
