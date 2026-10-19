// Layanan & Akses (FASE 1) di mode DEMO: tiruan tabel & RPC dari supabase/migrations/*_access.sql.
// Aturan hierarki, pesan galat, dan alur status MENYALIN fungsi SQL; uji SQL-nya ada di supabase/tests.
// Angka historis kartu skor dibangun dari data penjualan demo (SALES) — hanya baseline demo, bukan data nyata.
import { permOf } from "../lib/rbac.js";

const T1 = "t1", T2 = "t2", T3 = "t3", T4 = "t4", B1 = "b1", B2 = "b2";
const HOUR = 3600e3, DAY = 24 * HOUR;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const CATEGORIES = ["Tagihan", "Teknis", "Data", "Integrasi", "SATUSEHAT", "Lainnya"];

export const ACCESS_RULES = { staff_invites: true, tenant_notes: true, support_tickets: true, ticket_messages: true };

export function seedAccess(db, users) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const last = { u0: 0.4, u1: 1.5, u2: 3, u3: 5, u4: 20, u5: 6, u6: 30 };
  db.profiles.forEach((p) => {
    Object.assign(p, { is_active: true, deactivated_at: null, deactivation_reason: null, phone: null,
      last_login_at: iso(now - (last[p.id] ?? 8) * HOUR), last_seen_at: iso(now - (last[p.id] ?? 8) * HOUR + 600e3) });
  });
  // Owner tenant lain (tanpa tombol demo): memberi sinyal churn pada Monitoring Aktivitas Owner.
  db.profiles.push(
    { id: "u7", tenant_id: T3, branch_id: null, role: "owner", full_name: "Pak Jaya (Toko Bangunan)", email: "admin@tbjaya.test", base_salary: 0, commission_rate: 0, nik: null,
      is_active: true, phone: null, last_login_at: iso(now - 19 * DAY), last_seen_at: iso(now - 19 * DAY) },
    { id: "u8", tenant_id: T4, branch_id: null, role: "owner", full_name: "Bu Ayu (Salon Ayu)", email: "ayu@salon.test", base_salary: 0, commission_rate: 0, nik: null,
      is_active: true, phone: null, last_login_at: iso(now - 90 * DAY), last_seen_at: iso(now - 90 * DAY) },
  );
  db.pins = {};
  db.tenant_notes = [
    { id: "n1", tenant_id: T3, author_id: "u0", body: "Owner minta keringanan: bayar setelah panen musim ini. Tunggu konfirmasi finance.", created_at: iso(now - 3 * DAY) },
  ];
  db.staff_invites = [
    { id: "iv1", tenant_id: T1, email: "kasir.baru@kopiharum.test", full_name: "Rina Kasir Baru", phone: null, role: "staff", branch_ids: [B2],
      invited_by: "u1", auth_user_id: null, sent_at: iso(now - 5 * HOUR), expires_at: iso(now + 43 * HOUR), accepted_at: null, revoked_at: null, created_at: iso(now - 5 * HOUR) },
    { id: "iv2", tenant_id: T3, email: "owner.kedua@tbjaya.test", full_name: "Bu Jaya", phone: null, role: "owner", branch_ids: [],
      invited_by: "u0", auth_user_id: null, sent_at: iso(now - 4 * DAY), expires_at: iso(now - 2 * DAY), accepted_at: null, revoked_at: null, created_at: iso(now - 4 * DAY) },
  ];
  const msg = (i, ticket_id, tenant_id, author_role, body, ago, internal = false) =>
    ({ id: `tm${i}`, ticket_id, tenant_id, author_id: author_role === "owner" ? "u1" : "u0", author_role, body, internal, created_at: iso(now - ago) });
  db.support_tickets = [
    { id: "tk1", code: "TKT-0001", tenant_id: T1, opened_by: "u1", category: "Tagihan", priority: "normal", status: "resolved", subject: "Faktur Agustus belum ada nomor pajak",
      assigned_to: "u0", sla_due_at: iso(now - 9 * DAY + 8 * HOUR), first_response_at: iso(now - 9 * DAY + 2 * HOUR), csat: 5, csat_note: "Cepat dan jelas",
      created_at: iso(now - 9 * DAY), updated_at: iso(now - 8 * DAY), closed_at: iso(now - 8 * DAY) },
    { id: "tk2", code: "TKT-0002", tenant_id: T2, opened_by: "u6", category: "SATUSEHAT", priority: "urgent", status: "waiting_owner", subject: "Kredensial SATUSEHAT sandbox ditolak",
      assigned_to: "u0", sla_due_at: iso(now - 26 * HOUR + 2 * HOUR), first_response_at: iso(now - 25 * HOUR), csat: null, csat_note: null,
      created_at: iso(now - 26 * HOUR), updated_at: iso(now - 20 * HOUR), closed_at: null },
    { id: "tk3", code: "TKT-0003", tenant_id: T1, opened_by: "u1", category: "Teknis", priority: "high", status: "new", subject: "Printer struk Cabang Panakkukang tidak mau mencetak",
      assigned_to: null, sla_due_at: iso(now - 1 * HOUR), first_response_at: null, csat: null, csat_note: null,
      created_at: iso(now - 5 * HOUR), updated_at: iso(now - 5 * HOUR), closed_at: null },
  ];
  db.ticket_messages = [
    msg(1, "tk1", T1, "owner", "Faktur bulan Agustus belum mencantumkan nomor faktur pajak. Mohon dibantu.", 9 * DAY),
    msg(2, "tk1", T1, "superadmin", "Sudah kami terbitkan ulang, silakan cek di menu Paket & tagihan.", 9 * DAY - 2 * HOUR),
    msg(3, "tk2", T2, "owner", "Org ID dan client secret sandbox sudah diisi, tetapi sinkronisasi selalu 401.", 26 * HOUR),
    msg(4, "tk2", T2, "superadmin", "Cek dulu: environment di integrasi harus 'sandbox' dan secret dari portal sandbox, bukan produksi.", 25 * HOUR),
    msg(5, "tk2", T2, "superadmin", "Internal: kemungkinan salah tempel secret produksi. Minta screenshot field (tanpa nilai).", 24 * HOUR, true),
    msg(6, "tk3", T1, "owner", "Sejak pagi printer di Panakkukang tidak merespons, kasir terpaksa menulis manual.", 5 * HOUR),
  ];
}

export function createAccess(ctx) {
  const { db, user, emit, persist, audit, err, need, tenantOk, branchOk, id, nowIso, sales } = ctx;
  const role = () => user()?.role;
  const done = (v, tables = []) => { persist(); tables.forEach(emit); return structuredClone(v); };
  const tenantRow = (t) => db.tenants.find((x) => x.id === t);
  const addHours = (h) => new Date(Date.now() + h * HOUR).toISOString();

  /** Sama dengan _can_manage() di SQL. */
  const canManage = (r, branches) => {
    const me = role();
    if (me === "superadmin") return r === "owner";
    if (me === "owner") return ["gm", "staff", "dokter"].includes(r);
    if (me === "gm") return ["staff", "dokter"].includes(r) && (branches ?? []).length > 0 && (branches ?? []).every((b) => branchOk(b));
    return false;
  };
  const inviteOf = (iid) => db.staff_invites.find((x) => x.id === iid);
  const inviteAuth = (iid) => {
    const inv = inviteOf(iid);
    if (!inv || !tenantOk(inv.tenant_id) || !canManage(inv.role, inv.branch_ids)) err("Undangan tidak ditemukan");
    return inv;
  };
  const audit2 = (action, entity, entity_id, detail, tenant) => audit(action, entity, entity_id, detail, tenant);

  // ── Visibilitas tabel (meniru policy RLS) ──
  const visible = (table, row) => {
    const me = role();
    if (table === "tenant_notes") return me === "superadmin";
    if (table === "support_tickets") return me === "superadmin" || (me === "owner" && row.tenant_id === user().tenant_id);
    if (table === "ticket_messages") return me === "superadmin" || (me === "owner" && row.tenant_id === user().tenant_id && !row.internal);
    if (table === "staff_invites") {
      if (!tenantOk(row.tenant_id) || permOf(me, 13)?.scope || !permOf(me, 13)?.r) return false;
      if (me === "superadmin") return true;
      if (me === "owner") return row.role !== "owner";
      if (me === "gm") return ["staff", "dokter"].includes(row.role) && row.branch_ids.some((b) => branchOk(b));
    }
    return false;
  };

  // ── Hitungan kartu skor (baseline demo dari SALES + data hidup) ──
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
  const inRange = (iso, from, to) => iso && dayKey(iso) >= from && dayKey(iso) <= to;
  function baseline(profile, from, to) {
    // Kasir demo u3 memegang Cabang Pettarani: angka historisnya = rekap penjualan harian cabang tsb.
    if (profile.id !== "u3") return { orders: 0, revenue: 0, discount: 0, subtotal: 0, voids: 0, shifts: 0, variance: 0, short: 0 };
    const rows = (sales ?? []).filter((r) => r.branch_id === B1 && r.day >= from && r.day <= to);
    const orders = rows.reduce((a, r) => a + r.orders, 0);
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    const discount = rows.reduce((a, r) => a + r.discount, 0);
    const subtotal = rows.reduce((a, r) => a + Math.round(r.revenue / (1 + (tenantRow(T1)?.tax_rate ?? 0.1))) + r.discount, 0);
    const shifts = rows.length;
    const short = Math.floor(shifts / 9);
    return { orders, revenue, discount, subtotal, voids: Math.round(orders * 0.011), shifts, variance: short ? -(short * 7500) + Math.round(shifts / 10) * 2000 : 0, short };
  }

  const RPC = {
    // ───────── akun & undangan ─────────
    my_access_state() {
      const u = user();
      const p = db.profiles.find((x) => x.id === u?.id);
      const t = p && tenantRow(p.tenant_id);
      if (!p) return u?.role === "superadmin" ? { ok: true } : { ok: false, code: "missing", reason: "Akun tidak ditemukan." };
      if (p.is_active === false) return { ok: false, code: "deactivated", reason: p.deactivation_reason ?? "Akun dinonaktifkan." };
      if (p.role !== "superadmin" && t?.status === "suspended") return { ok: false, code: "suspended", reason: t.suspended_reason ?? "Langganan tenant ditangguhkan." };
      return { ok: true };
    },
    touch_presence({ p_login = false } = {}) {
      const p = db.profiles.find((x) => x.id === user()?.id);
      if (!p || p.is_active === false) return;
      p.last_seen_at = nowIso();
      if (p_login) {
        p.last_login_at = nowIso();
        audit("login", "session", p.id, {}, p.tenant_id);
        for (const iv of db.staff_invites) if (iv.auth_user_id === p.id && !iv.accepted_at && !iv.revoked_at) iv.accepted_at = nowIso();
      }
      persist();
    },
    create_invite({ p_email, p_full_name, p_role, p_branches = [], p_phone = null, p_tenant = null }) {
      const me = role();
      if (!me) err("Akses ditolak");
      let t;
      if (me === "superadmin") { need(1, "c"); t = p_tenant; } else { need(13, "c"); t = user().tenant_id; }
      if (!t) err("Tenant wajib dipilih");
      if (!tenantRow(t)) err("Tenant tidak ditemukan");
      if (!canManage(p_role, p_branches)) err(`Peran ${me} tidak dapat mengundang ${p_role}`);
      const em = String(p_email ?? "").trim().toLowerCase();
      if (!EMAIL.test(em)) err("Format email tidak valid");
      if (String(p_full_name ?? "").trim().length < 2) err("Nama lengkap wajib diisi");
      if (p_phone && !/^\+?[0-9 -]{8,20}$/.test(p_phone)) err("Nomor telepon tidak valid");
      if (db.profiles.some((p) => (p.email ?? "").toLowerCase() === em)) err("Email sudah terdaftar");
      if (db.staff_invites.some((i) => i.tenant_id === t && i.email === em && !i.accepted_at && !i.revoked_at)) err("Undangan untuk email ini masih aktif — kirim ulang atau cabut dulu");
      if (p_role === "dokter" && tenantRow(t).pillar !== "health") err("Peran Dokter hanya untuk tenant layanan kesehatan");
      if (["staff", "dokter"].includes(p_role) && !p_branches.length) err("Pilih minimal satu cabang");
      if (p_branches.some((b) => !db.branches.some((x) => x.id === b && x.tenant_id === t))) err("Cabang bukan milik tenant ini");
      const inv = { id: id(), tenant_id: t, email: em, full_name: String(p_full_name).trim(), phone: p_phone?.trim() || null, role: p_role,
        branch_ids: p_role === "owner" ? [] : [...p_branches], invited_by: user().id, auth_user_id: null, sent_at: null, expires_at: addHours(48), accepted_at: null, revoked_at: null, created_at: nowIso() };
      db.staff_invites.unshift(inv);
      audit2("invite", "staff_invites", inv.id, { role: p_role, email: em, branches: inv.branch_ids }, t);
      return done(inv, ["staff_invites"]);
    },
    resend_invite({ p_id }) {
      const inv = inviteAuth(p_id);
      if (inv.accepted_at) err("Undangan sudah diterima");
      if (inv.revoked_at) err("Undangan sudah dicabut");
      Object.assign(inv, { expires_at: addHours(48), sent_at: null });
      audit2("invite_resend", "staff_invites", inv.id, {}, inv.tenant_id);
      return done(inv, ["staff_invites"]);
    },
    revoke_invite({ p_id }) {
      const inv = inviteAuth(p_id);
      if (inv.accepted_at) err("Undangan sudah diterima — nonaktifkan akunnya");
      inv.revoked_at = nowIso();
      const p = inv.auth_user_id && db.profiles.find((x) => x.id === inv.auth_user_id);
      if (p && !p.last_login_at) Object.assign(p, { is_active: false, deactivated_at: nowIso(), deactivation_reason: "Undangan dicabut" });
      audit2("invite_revoke", "staff_invites", inv.id, {}, inv.tenant_id);
      return done(inv, ["staff_invites", "profiles"]);
    },
    /** Pengganti Edge Function invite-member di demo: akun langsung dibuat, email TIDAK dikirim. */
    prepare_invite_send({ p_id }) {
      const inv = inviteAuth(p_id);
      if (inv.accepted_at) err("Undangan sudah diterima");
      if (inv.revoked_at) err("Undangan sudah dicabut");
      if (new Date(inv.expires_at) < new Date()) err("Undangan kedaluwarsa — gunakan Kirim ulang");
      let p = db.profiles.find((x) => x.id === inv.auth_user_id);
      if (!p) {
        p = { id: id(), tenant_id: inv.tenant_id, branch_id: ["gm", "owner"].includes(inv.role) ? null : inv.branch_ids[0] ?? null, role: inv.role, full_name: inv.full_name,
          email: inv.email, phone: inv.phone, base_salary: 0, commission_rate: 0, nik: null, is_active: true, deactivated_at: null, deactivation_reason: null, last_login_at: null, last_seen_at: null };
        db.profiles.push(p);
        if (inv.role !== "owner") for (const b of inv.branch_ids) db.member_branches.push({ profile_id: p.id, branch_id: b, tenant_id: inv.tenant_id, assigned_by: user().id, assigned_at: nowIso() });
      }
      Object.assign(inv, { sent_at: nowIso(), auth_user_id: p.id });
      return done(inv, ["staff_invites", "profiles", "member_branches"]);
    },
    set_member_active({ p_profile, p_active, p_reason = null }) {
      const me = role();
      if (!me) err("Akses ditolak");
      need(me === "superadmin" ? 1 : 13, "u");
      const tgt = db.profiles.find((x) => x.id === p_profile);
      if (!tgt || !tgt.tenant_id || !tenantOk(tgt.tenant_id)) err("Anggota tidak ditemukan");
      if (tgt.id === user().id) err("Tidak dapat menonaktifkan akun sendiri");
      const reach = me === "gm" && (branchOk(tgt.branch_id) || db.member_branches.some((m) => m.profile_id === tgt.id && branchOk(m.branch_id)));
      const okRole = me === "superadmin" ? tgt.role === "owner" : me === "owner" ? ["gm", "staff", "dokter"].includes(tgt.role)
        : me === "gm" ? ["staff", "dokter"].includes(tgt.role) && reach : false;
      if (!okRole) err("Anda tidak berwenang mengubah status akun ini");
      if (!p_active) {
        if (String(p_reason ?? "").trim().length < 3) err("Alasan wajib diisi");
        if (db.shifts.some((s) => s.cashier_id === tgt.id && s.status === "open")) err("Akun ini masih punya shift kasir terbuka — tutup shift dulu");
      }
      Object.assign(tgt, p_active ? { is_active: true, deactivated_at: null, deactivated_by: null, deactivation_reason: null }
        : { is_active: false, deactivated_at: nowIso(), deactivated_by: user().id, deactivation_reason: String(p_reason).trim() });
      audit2("update", "profiles", tgt.id, { is_active: p_active, reason: p_reason }, tgt.tenant_id);
      return done(tgt, ["profiles"]);
    },
    reset_member_pin({ p_profile, p_pin }) {
      need(13, "u");
      if (role() !== "owner") err("Hanya Owner yang dapat mengatur ulang PIN GM");
      if (!/^[0-9]{6}$/.test(p_pin ?? "")) err("PIN harus 6 digit angka");
      const tgt = db.profiles.find((x) => x.id === p_profile);
      if (!tgt || tgt.role !== "gm" || !tenantOk(tgt.tenant_id)) err("GM tidak ditemukan");
      db.pins[tgt.id] = p_pin;
      audit2("pin_reset", "profiles", tgt.id, {}, tgt.tenant_id);
      return done(null);
    },

    // ───────── tenant (Superadmin) ─────────
    create_tenant_with_owner({ p_name, p_slug, p_pillar, p_plan = null, p_owner_name, p_owner_email, p_owner_phone = null, p_trial_days = 14, p_branches = ["Cabang Utama"] }) {
      if (role() !== "superadmin") err("Akses ditolak");
      need(1, "c");
      if (String(p_name ?? "").trim().length < 2) err("Nama usaha wajib diisi");
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p_slug ?? "")) err("Slug hanya huruf kecil, angka, dan tanda hubung");
      if (!(p_trial_days >= 0 && p_trial_days <= 90)) err("Masa uji coba 0–90 hari");
      if (p_plan && !db.plans.some((x) => x.id === p_plan)) err("Paket tidak ditemukan");
      if (db.tenants.some((t) => t.slug === p_slug) || db.tenants.some((t) => (t.owner_email ?? "").toLowerCase() === String(p_owner_email).toLowerCase())) err("Slug atau email sudah dipakai");
      const DEF = { fnb: ["PBJT", 0.1], health: ["Tanpa pajak", 0], retail: ["PPN", 0.11] };
      const [tax_label, tax_rate] = DEF[p_pillar] ?? ["Pajak", 0];
      const t = { id: id(), name: p_name.trim(), slug: p_slug, pillar: p_pillar, tax_label, tax_rate, status: "trial", plan_id: p_plan,
        current_period_end: new Date(Date.now() + p_trial_days * DAY).toISOString().slice(0, 10), owner_email: String(p_owner_email).trim().toLowerCase(), created_at: nowIso(),
        suspended_reason: null, suspended_at: null, status_before_suspend: null, timezone: "Asia/Makassar" };
      // Validasi undangan dulu agar gagal tidak meninggalkan tenant setengah jadi (setara transaksi SQL).
      db.tenants.push(t);
      try {
        for (const b of p_branches) if (String(b).trim()) db.branches.push({ id: id(), tenant_id: t.id, name: String(b).trim(), city: null, lat: null, lng: null, geofence_m: 50, is_warehouse: false });
        const inv = RPC.create_invite({ p_email: p_owner_email, p_full_name: p_owner_name, p_role: "owner", p_branches: [], p_phone: p_owner_phone, p_tenant: t.id });
        audit2("insert", "tenants", t.id, t, t.id);
        return done({ tenant_id: t.id, invite_id: inv.id }, ["tenants", "branches", "staff_invites"]);
      } catch (e) {
        db.tenants = db.tenants.filter((x) => x.id !== t.id);
        db.branches = db.branches.filter((x) => x.tenant_id !== t.id);
        db.staff_invites = db.staff_invites.filter((x) => x.tenant_id !== t.id);
        throw e;
      }
    },
    set_tenant_suspended({ p_tenant, p_suspend, p_reason = null }) {
      if (role() !== "superadmin") err("Akses ditolak");
      need(1, "u");
      const t = tenantRow(p_tenant);
      if (!t) err("Tenant tidak ditemukan");
      if (p_suspend) {
        if (String(p_reason ?? "").trim().length < 3) err("Alasan penangguhan wajib diisi");
        if (t.status === "suspended") err("Tenant sudah ditangguhkan");
        Object.assign(t, { status_before_suspend: t.status, status: "suspended", suspended_reason: String(p_reason).trim(), suspended_at: nowIso() });
      } else {
        if (t.status !== "suspended") err("Tenant tidak sedang ditangguhkan");
        Object.assign(t, { status: t.status_before_suspend ?? "active", status_before_suspend: null, suspended_reason: null, suspended_at: null });
      }
      audit2("update", "tenants", t.id, { status: t.status, reason: p_reason }, t.id);
      return done(t, ["tenants"]);
    },
    extend_trial({ p_tenant, p_days }) {
      if (role() !== "superadmin") err("Akses ditolak");
      need(1, "u");
      if (!(p_days >= 1 && p_days <= 60)) err("Perpanjangan 1–60 hari");
      const t = tenantRow(p_tenant);
      if (!t || !["trial", "past_due"].includes(t.status)) err("Hanya tenant trial atau telat bayar yang dapat diperpanjang");
      const base = Math.max(new Date(t.current_period_end ?? Date.now()).getTime(), new Date(new Date().toISOString().slice(0, 10)).getTime());
      t.current_period_end = new Date(base + p_days * DAY).toISOString().slice(0, 10);
      audit2("update", "tenants", t.id, { current_period_end: t.current_period_end }, t.id);
      return done(t, ["tenants"]);
    },
    add_tenant_note({ p_tenant, p_body }) {
      if (role() !== "superadmin") err("Akses ditolak");
      need(1, "c");
      if (!String(p_body ?? "").trim() || String(p_body).trim().length > 2000) err("Catatan 1–2000 karakter");
      const n = { id: id(), tenant_id: p_tenant, author_id: user().id, body: String(p_body).trim(), created_at: nowIso() };
      db.tenant_notes.unshift(n);
      return done(n, ["tenant_notes"]);
    },

    // ───────── tiket CS ─────────
    open_ticket({ p_category, p_subject, p_body }) {
      if (role() !== "owner") err("Hanya Owner yang dapat membuat tiket");
      if (!CATEGORIES.includes(p_category)) err("Kategori tidak dikenal");
      const subject = String(p_subject ?? "").trim();
      if (subject.length < 3 || subject.length > 140) err("Judul 3–140 karakter");
      if (String(p_body ?? "").trim().length < 5) err("Jelaskan kendala Anda (minimal 5 karakter)");
      const t = tenantRow(user().tenant_id);
      const plan = db.plans.find((p) => p.id === t?.plan_id);
      const big = !plan || plan.price_month == null || plan.max_branches >= 99;
      let pr = ["Teknis", "Integrasi", "SATUSEHAT"].includes(p_category) ? "high" : "normal";
      if (big) pr = pr === "high" ? "urgent" : "high";
      const hrs = { urgent: 2, high: 4, normal: 8, low: 24 }[pr];
      const n = db.support_tickets.length + 1;
      const tk = { id: id(), code: `TKT-${String(n).padStart(4, "0")}`, tenant_id: t.id, opened_by: user().id, category: p_category, priority: pr, status: "new", subject,
        assigned_to: null, sla_due_at: addHours(hrs), first_response_at: null, csat: null, csat_note: null, created_at: nowIso(), updated_at: nowIso(), closed_at: null };
      db.support_tickets.unshift(tk);
      db.ticket_messages.push({ id: id(), ticket_id: tk.id, tenant_id: t.id, author_id: user().id, author_role: "owner", body: String(p_body).trim(), internal: false, created_at: nowIso() });
      audit2("insert", "support_tickets", tk.id, { subject, category: p_category }, t.id);
      return done(tk, ["support_tickets", "ticket_messages"]);
    },
    reply_ticket({ p_ticket, p_body, p_internal = false }) {
      const me = role();
      const tk = db.support_tickets.find((x) => x.id === p_ticket);
      if (!tk || !(me === "superadmin" || (me === "owner" && tk.tenant_id === user().tenant_id))) err("Tiket tidak ditemukan");
      if (!String(p_body ?? "").trim()) err("Pesan kosong");
      if (me === "owner" && p_internal) err("Catatan internal hanya untuk tim Tijarah");
      db.ticket_messages.push({ id: id(), ticket_id: tk.id, tenant_id: tk.tenant_id, author_id: user().id, author_role: me, body: String(p_body).trim(), internal: Boolean(p_internal), created_at: nowIso() });
      tk.updated_at = nowIso();
      if (me === "owner") { tk.status = tk.status === "new" ? "new" : "in_progress"; tk.closed_at = null; }
      else if (!p_internal) {
        tk.first_response_at ??= nowIso();
        tk.assigned_to ??= user().id;
        if (["new", "in_progress"].includes(tk.status)) tk.status = "waiting_owner";
      }
      return done(tk, ["support_tickets", "ticket_messages"]);
    },
    set_ticket_status({ p_ticket, p_status }) {
      if (role() !== "superadmin") err("Akses ditolak");
      if (!["new", "in_progress", "waiting_owner", "resolved"].includes(p_status)) err("Status tidak dikenal");
      const tk = db.support_tickets.find((x) => x.id === p_ticket);
      if (!tk) err("Tiket tidak ditemukan");
      Object.assign(tk, { status: p_status, assigned_to: tk.assigned_to ?? user().id, updated_at: nowIso(), closed_at: p_status === "resolved" ? nowIso() : null });
      return done(tk, ["support_tickets"]);
    },
    rate_ticket({ p_ticket, p_score, p_note = null }) {
      if (role() !== "owner") err("Hanya Owner yang dapat menilai");
      const tk = db.support_tickets.find((x) => x.id === p_ticket && x.tenant_id === user().tenant_id);
      if (!tk) err("Tiket tidak ditemukan");
      if (tk.status !== "resolved") err("Penilaian hanya setelah tiket selesai");
      if (tk.csat != null) err("Tiket ini sudah dinilai");
      if (!(p_score >= 1 && p_score <= 5)) err("Nilai 1–5");
      Object.assign(tk, { csat: p_score, csat_note: String(p_note ?? "").trim() || null });
      return done(tk, ["support_tickets"]);
    },

    // ───────── monitoring ─────────
    tenant_health() {
      if (role() !== "superadmin") err("Akses ditolak");
      need(1, "r");
      const D7 = Date.now() - 7 * DAY, D28 = Date.now() - 28 * DAY;
      const cut7 = new Date(D7).toISOString().slice(0, 10), cut28 = new Date(D28).toISOString().slice(0, 10);
      return structuredClone(db.tenants.map((t) => {
        const plan = db.plans.find((p) => p.id === t.plan_id);
        const ow = db.profiles.filter((p) => p.tenant_id === t.id && p.role === "owner").sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))[0];
        const live = db.orders.filter((o) => o.tenant_id === t.id && o.status === "paid" && o.paid_at);
        const hist = t.id === T1 ? (sales ?? []) : [];
        const o7 = live.filter((o) => o.paid_at.slice(0, 10) >= cut7).length + hist.filter((r) => r.day >= cut7).reduce((a, r) => a + r.orders, 0);
        const o28 = live.filter((o) => o.paid_at.slice(0, 10) >= cut28).length + hist.filter((r) => r.day >= cut28).reduce((a, r) => a + r.orders, 0);
        const gmv = live.filter((o) => o.paid_at.slice(0, 10) >= cut28).reduce((a, o) => a + o.total, 0) + hist.filter((r) => r.day >= cut28).reduce((a, r) => a + r.revenue, 0);
        const inv = db.invoices.filter((i) => i.tenant_id === t.id && i.status === "unpaid");
        return { tenant_id: t.id, name: t.name, slug: t.slug, pillar: t.pillar, status: t.status, plan_name: plan?.name ?? null, plan_price: plan?.price_month ?? null,
          period_end: t.current_period_end, created_at: t.created_at, suspended_reason: t.suspended_reason ?? null,
          owner_id: ow?.id ?? null, owner_name: ow?.full_name ?? null, owner_email: ow?.email ?? t.owner_email ?? null, owner_active: ow?.is_active ?? null, owner_last_login: ow?.last_login_at ?? null,
          branches: db.branches.filter((b) => b.tenant_id === t.id).length,
          staff: db.profiles.filter((p) => p.tenant_id === t.id && ["gm", "staff", "dokter"].includes(p.role) && p.is_active !== false).length,
          orders_7d: o7, orders_28d: o28, gmv_28d: gmv, open_tickets: db.support_tickets.filter((s) => s.tenant_id === t.id && s.status !== "resolved").length,
          unpaid_amount: inv.reduce((a, i) => a + i.amount, 0), overdue_invoices: inv.filter((i) => i.period < new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10)).length };
      }));
    },
    on_duty({ p_branch = null } = {}) {
      if (!permOf(role(), 5)?.r || !["owner", "gm"].includes(role())) err("Akses ditolak");
      const rows = db.shifts.filter((s) => s.status === "open" && s.tenant_id === user().tenant_id && branchOk(s.branch_id) && (!p_branch || s.branch_id === p_branch));
      return structuredClone(rows.map((s) => {
        const cashier = db.profiles.find((p) => p.id === s.cashier_id);
        const orders = db.orders.filter((o) => o.shift_id === s.id);
        const paid = orders.filter((o) => o.status === "paid");
        const times = orders.map((o) => o.paid_at ?? o.created_at).filter(Boolean).concat(s.opened_at).sort();
        return { shift_id: s.id, cashier_id: s.cashier_id, cashier_name: cashier?.full_name ?? "—", branch_id: s.branch_id, branch_name: db.branches.find((b) => b.id === s.branch_id)?.name ?? "—",
          opened_at: s.opened_at, opening_cash: s.opening_cash, cash_sales: s.cash_sales, non_cash_sales: s.non_cash_sales,
          orders_paid: paid.length, open_orders: db.orders.filter((o) => o.cashier_id === s.cashier_id && o.status === "open" && o.branch_id === s.branch_id).length,
          voids: orders.filter((o) => o.status === "void").length, discount_total: paid.reduce((a, o) => a + (o.discount ?? 0), 0),
          pending_void_requests: db.approvals.filter((a) => a.kind === "void" && a.status === "pending" && a.requested_by === s.cashier_id).length,
          last_activity: times[times.length - 1] };
      }));
    },
    staff_scorecard({ p_from, p_to }) {
      if (!permOf(role(), 13)?.r || !["owner", "gm"].includes(role()) || permOf(role(), 13)?.scope) err("Akses ditolak");
      const reach = (p) => branchOk(p.branch_id) || db.member_branches.some((m) => m.profile_id === p.id && branchOk(m.branch_id));
      const people = db.profiles.filter((p) => p.tenant_id === user().tenant_id && ["staff", "gm"].includes(p.role) && (role() === "owner" || p.role === "staff") && reach(p));
      return structuredClone(people.map((p) => {
        const b = baseline(p, p_from, p_to);
        const os = db.orders.filter((o) => o.cashier_id === p.id && o.paid_at && inRange(o.paid_at, p_from, p_to));
        const paid = os.filter((o) => o.status === "paid");
        const sh = db.shifts.filter((s) => s.cashier_id === p.id && inRange(s.opened_at, p_from, p_to));
        const closed = sh.filter((s) => s.status === "closed");
        const ins = db.attendance.filter((a) => a.profile_id === p.id && a.kind === "in" && inRange(a.created_at, p_from, p_to));
        const late = ins.filter((a) => {
          const w = db.work_shifts.find((x) => x.profile_id === p.id && x.work_date === dayKey(a.created_at));
          if (!w) return false;
          const [h, m] = w.start_time.split(":").map(Number);
          const t = new Date(a.created_at);
          return t.getHours() * 60 + t.getMinutes() > h * 60 + m + 10;
        }).length;
        const decided = db.approvals.filter((a) => a.decided_by === p.id && a.decided_at && inRange(a.decided_at, p_from, p_to));
        return { profile_id: p.id, full_name: p.full_name, role: p.role, branch_id: p.branch_id, is_active: p.is_active !== false,
          shifts: sh.length + b.shifts, orders_paid: paid.length + b.orders, revenue: paid.reduce((a, o) => a + o.total, 0) + b.revenue,
          voids: os.filter((o) => o.status === "void").length + b.voids, discount_total: paid.reduce((a, o) => a + (o.discount ?? 0), 0) + b.discount,
          subtotal_total: paid.reduce((a, o) => a + o.subtotal, 0) + b.subtotal, cash_variance: closed.reduce((a, s) => a + (s.variance ?? 0), 0) + b.variance,
          short_shifts: closed.filter((s) => (s.variance ?? 0) < 0).length + b.short, clock_ins: ins.length, late_ins: late,
          approvals_decided: decided.length, avg_decision_min: decided.length ? Math.round(decided.reduce((a, x) => a + (new Date(x.decided_at) - new Date(x.requested_at)) / 60000, 0) / decided.length * 10) / 10 : null };
      }));
    },
  };

  return { RPC, visible };
}

/** Jadwal & absensi 10 hari untuk kasir demo (mengisi hitungan keterlambatan). Tidak menyentuh penjualan/ledger. */
export function seedRoster(db) {
  const rnd = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; })();
  const todayMakassar = (() => {
    try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" }); } catch { return new Date().toISOString().slice(0, 10); }
  })();
  db.work_shifts.push({ id: "rw0", tenant_id: T1, branch_id: B1, profile_id: "u3", work_date: todayMakassar, start_time: "08:00:00", end_time: "16:00:00", late_tolerance_min: 15, auto_clockout: false, auto_clockout_delay_min: 30 });
  for (let n = 1; n <= 10; n++) {
    const d = day(n), date = d.toISOString().slice(0, 10);
    db.work_shifts.push({ id: `rw${n}`, tenant_id: T1, branch_id: B1, profile_id: "u3", work_date: date, start_time: "08:00:00", end_time: "16:00:00", late_tolerance_min: 15, auto_clockout: false, auto_clockout_delay_min: 30 });
    const delay = Math.round(rnd() * 22) - 4; // menit terhadap jam 08:00 (negatif = lebih awal)
    const inAt = new Date(d); inAt.setHours(8, 0, 0, 0); inAt.setMinutes(delay);
    const outAt = new Date(d); outAt.setHours(16, 5, 0, 0);
    db.attendance.push({ id: `ra${n}i`, tenant_id: T1, branch_id: B1, profile_id: "u3", kind: "in", lat: -5.1561, lng: 119.4363, distance_m: 12, selfie_path: null, created_at: inAt.toISOString() });
    db.attendance.push({ id: `ra${n}o`, tenant_id: T1, branch_id: B1, profile_id: "u3", kind: "out", lat: -5.1561, lng: 119.4363, distance_m: 9, selfie_path: null, created_at: outAt.toISOString() });
  }
}
