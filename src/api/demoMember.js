// Tiruan alur masuk Member untuk mode demo. Aturan SAMA dengan supabase/migrations/…023_member_signup.sql
// (kedaluwarsa 5 menit, 5 percobaan, 3 permintaan/15 menit per nomor, 10/jam per perangkat, Persetujuan Data wajib).
// Beda yang disengaja dan terlihat: kode dikembalikan di respons (simulated: true) karena tidak ada WhatsApp.

export function phoneLocal(p) {
  let d = String(p ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("62")) d = "0" + d.slice(2);
  else if (d.startsWith("8")) d = "0" + d;
  if (!/^08[0-9]{8,12}$/.test(d)) throw new Error("Nomor WhatsApp tidak valid");
  return d;
}
export const phoneVariants = (p) => { const l = phoneLocal(p); return [l, "+62" + l.slice(1), "62" + l.slice(1)]; };
import { createMemberOrderRpc } from "./demoMemberOrder.js";
const normPhone = (p) => String(p ?? "").replace(/[^0-9+]/g, "") || null;

const MIN = 60_000;
export function createMemberAuth(db, { now = () => Date.now(), code = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"), id = () => crypto.randomUUID() } = {}) {
  db.member_otps ??= [];
  db.member_consents ??= [];
  const fail = (m) => { throw new Error(m); };
  const hasMemberFeature = (tenant) => {
    const code_ = db.plans?.find((p) => p.id === tenant.plan_id)?.code;
    return code_ === "growth" || code_ === "enterprise";
  };
  const customerOf = (tenantId, phone) => {
    const vs = phoneVariants(phone);
    return (db.customers ?? []).find((c) => c.tenant_id === tenantId && vs.includes(normPhone(c.phone)));
  };
  const profileOf = (customerId) => (db.profiles ?? []).find((p) => p.customer_id === customerId && p.role === "member");

  return {
    request({ tenantId, phone, device, consentData, consentMarketing = false }) {
      const ph = phoneLocal(phone);
      if (consentData !== true) fail("Persetujuan pengolahan data wajib diberikan");
      if (!device || String(device).trim().length < 8) fail("Perangkat tidak dikenali");
      const tenant = db.tenants?.find((t) => t.id === tenantId);
      if (!tenant || tenant.status === "suspended") fail("Tenant tidak ditemukan");
      if (!hasMemberFeature(tenant)) fail("Dashboard Member belum diaktifkan untuk Tenant ini");
      const t = now();
      const recent = (f, ms) => db.member_otps.filter((o) => f(o) && o.created_at > t - ms).length;
      if (recent((o) => o.tenant_id === tenantId && o.phone === ph, 15 * MIN) >= 3) fail("Terlalu banyak permintaan kode untuk nomor ini. Coba lagi beberapa menit lagi.");
      if (recent((o) => o.device_id === device, 60 * MIN) >= 10) fail("Terlalu banyak permintaan kode dari perangkat ini. Coba lagi nanti.");
      const c = code();
      const row = { id: id(), tenant_id: tenantId, phone: ph, code: c, device_id: device, consent_marketing: consentMarketing === true,
        attempts: 0, created_at: t, expires_at: t + 5 * MIN, verified_at: null, consumed_at: null };
      db.member_otps.push(row);
      return { otp_id: row.id, code: c, phone: ph, expires_at: new Date(row.expires_at).toISOString(), simulated: true };
    },

    verify({ tenantId, phone, code: given, device }) {
      const ph = phoneLocal(phone);
      const o = [...db.member_otps].reverse().find((x) => x.tenant_id === tenantId && x.phone === ph && !x.consumed_at && !x.verified_at);
      if (!o || o.expires_at < now()) return { ok: false, reason: "kedaluwarsa" };
      if (o.attempts >= 5) return { ok: false, reason: "terkunci" };
      o.attempts += 1;
      if (o.device_id !== device || o.code !== String(given ?? "")) return { ok: false, reason: "salah", attempts_left: 5 - o.attempts };
      o.verified_at = now();
      const c = customerOf(tenantId, ph);
      const pr = c && profileOf(c.id);
      return { ok: true, otp_id: o.id, customer_id: c?.id ?? null, profile_id: pr?.id ?? null, is_new: !pr, name: c?.name ?? null };
    },

    complete({ otpId, name }) {
      const o = db.member_otps.find((x) => x.id === otpId && x.verified_at && !x.consumed_at && x.verified_at > now() - 10 * MIN);
      if (!o) fail("Verifikasi kedaluwarsa. Minta kode baru.");
      let c = customerOf(o.tenant_id, o.phone);
      if (!c) {
        c = { id: id(), tenant_id: o.tenant_id, phone: o.phone, name: (name ?? "").trim() || null, points: 0, total_spent: 0, visits: 0, last_visit_at: null, note: null, created_at: new Date(now()).toISOString() };
        db.customers.unshift(c);
      }
      let pr = profileOf(c.id);
      let made = false;
      if (!pr) {
        pr = { id: "mb-" + id().slice(0, 8), tenant_id: o.tenant_id, branch_id: null, role: "member", full_name: (name ?? "").trim() || c.name || "Member",
          email: `member-${o.id}@member.tijarah.id`, customer_id: c.id, is_active: true };
        db.profiles.push(pr);
        const at = new Date(now()).toISOString();
        db.member_consents.push(
          { id: id(), tenant_id: o.tenant_id, profile_id: pr.id, customer_id: c.id, kind: "data_processing", granted: true, policy_version: "2026-10", recorded_at: at },
          { id: id(), tenant_id: o.tenant_id, profile_id: pr.id, customer_id: c.id, kind: "marketing_whatsapp", granted: o.consent_marketing, policy_version: "2026-10", recorded_at: at },
        );
        made = true;
      }
      o.consumed_at = now();
      return { profile: pr, customer: c, is_new: made };
    },
  };
}

// ───────── RPC dashboard Member (cermin migrasi …024_member_dashboard.sql) ─────────
const b64 = (s) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s).toString("base64"));
const demoSig = (body) => b64(body).replace(/[^A-Za-z0-9]/g, "").slice(-16); // tiruan; di produksi HMAC-SHA256 di database

export function createMemberRpc({ db, user, now = () => Date.now(), onDeleted }) {
  const fail = (m) => { throw new Error(m); };
  const hasFeature = (tenantId) => {
    const t = db.tenants.find((x) => x.id === tenantId);
    const code = db.plans?.find((p) => p.id === t?.plan_id)?.code;
    return code === "growth" || code === "enterprise";
  };
  const ctx = () => {
    const u = user();
    if (!u || u.role !== "member") fail("Akses ditolak: khusus Member");
    if (!hasFeature(u.tenant_id)) fail("Dashboard Member belum diaktifkan untuk Tenant ini");
    const c = db.customers.find((x) => x.id === u.customer_id);
    if (!c) fail("Pelanggan tidak ditemukan");
    return { u, c };
  };
  const consentNow = (profileId) =>
    [...(db.member_consents ?? [])].reverse().find((k) => k.profile_id === profileId && k.kind === "marketing_whatsapp")?.granted ?? false;
  const myOrders = (c) => (db.orders ?? []).filter((o) => o.tenant_id === c.tenant_id && normPhone(o.customer_phone) && normPhone(o.customer_phone) === normPhone(c.phone));

  const OR = createMemberOrderRpc({ db, ctx, fail, now, normPhone });
  const { reservationsOf, ...ORDER_RPC } = OR;
  return {
    ...ORDER_RPC,
    member_brand() {
      const { u } = ctx();
      const t = db.tenants.find((x) => x.id === u.tenant_id);
      const b = (db.tenant_branding ?? []).find((x) => x.tenant_id === u.tenant_id) ?? {};
      return { tenant_name: t.name, slug: t.slug, pillar: t.pillar, display_name: b.display_name ?? t.name, accent_color: b.accent_color ?? null, logo_url: b.logo_url ?? null, welcome_text: b.welcome_text ?? null };
    },
    member_home() {
      const { u, c } = ctx();
      const t = now();
      const promos = (db.promos ?? []).filter((p) => p.tenant_id === u.tenant_id && p.active !== false && (!p.ends_at || new Date(p.ends_at).getTime() > t))
        .map((p) => ({ code: p.code, name: p.name, kind: p.kind, value: p.value, min_spend: p.min_spend ?? 0, ends_at: p.ends_at ?? null }));
      const last = myOrders(c).filter((o) => o.status === "paid").sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))[0];
      return { name: c.name ?? u.full_name, phone: c.phone, points: c.points, visits: c.visits, total_spent: c.total_spent, last_visit_at: c.last_visit_at,
        member_note: c.member_note ?? null, promos, last_order: last ? { code: last.code, total: last.total, paid_at: last.paid_at } : null, marketing: consentNow(u.id) };
    },
    member_update_profile({ p_name, p_note, p_marketing }) {
      const { u, c } = ctx();
      if (p_name != null && (p_name.trim().length < 1 || p_name.length > 80)) fail("Nama 1–80 karakter");
      if (p_note != null && p_note.length > 300) fail("Catatan maksimal 300 karakter");
      if (p_name?.trim()) { c.name = p_name.trim(); const pr = db.profiles.find((x) => x.id === u.id); if (pr) pr.full_name = c.name; }
      c.member_note = p_note ?? null;
      if (p_marketing != null && p_marketing !== consentNow(u.id)) {
        (db.member_consents ??= []).push({ id: crypto.randomUUID(), tenant_id: u.tenant_id, profile_id: u.id, customer_id: c.id, kind: "marketing_whatsapp", granted: p_marketing, policy_version: "2026-10", source: "profil", recorded_at: new Date(now()).toISOString() });
      }
      return this.member_home();
    },
    member_card_token() {
      const { c } = ctx();
      const exp = Math.floor(now() / 1000) + 90;
      const body = `HIN1.${c.id}.${exp}`;
      return `${body}.${demoSig(body)}`;
    },
    resolve_member_card({ p_token }) {
      const parts = String(p_token ?? "").split(".");
      if (parts.length !== 4 || parts[0] !== "HIN1") fail("Kartu tidak dikenali");
      if (demoSig(parts.slice(0, 3).join(".")) !== parts[3]) fail("Kartu tidak sah");
      if (Number(parts[2]) < Math.floor(now() / 1000)) fail("Kartu kedaluwarsa. Minta Member memuat ulang kartunya.");
      const u = user();
      const c = db.customers.find((x) => x.id === parts[1] && (u.role === "superadmin" || x.tenant_id === u.tenant_id));
      if (!c) fail("Pelanggan tidak ditemukan");
      return { customer_id: c.id, name: c.name, phone: c.phone, points: c.points };
    },
    member_export() {
      const { u, c } = ctx();
      const orders = myOrders(c).map((o) => ({
        kode: o.code, status: o.status, subtotal: o.subtotal, diskon: o.discount, pajak: o.tax, total: o.total, dibayar: o.paid_at,
        item: (db.order_items ?? []).filter((i) => i.order_id === o.id).map((i) => ({ nama: i.name, jumlah: i.qty, harga: i.price })),
        pembayaran: (db.payments ?? []).filter((p) => p.order_id === o.id).map((p) => ({ metode: p.method, jumlah: p.amount })),
      }));
      return {
        diekspor_pada: new Date(now()).toISOString(),
        profil: { id: u.id, nama: u.full_name },
        pelanggan: { telepon: c.phone, nama: c.name, poin: c.points, total_belanja: c.total_spent, kunjungan: c.visits, terakhir_berkunjung: c.last_visit_at, catatan_saya: c.member_note ?? null },
        pesanan: orders,
        reservasi: reservationsOf(c).map((q) => ({ jenis: q.kind, status: q.status, jadwal: q.scheduled_at, tamu: q.party_size, catatan: q.complaint })),
        persetujuan: (db.member_consents ?? []).filter((k) => k.profile_id === u.id).map((k) => ({ jenis: k.kind, diberikan: k.granted, versi_kebijakan: k.policy_version, waktu: k.recorded_at })),
        catatan: "Rekam medis (bila ada) dikelola klinik dan tidak termasuk dalam berkas ini.",
      };
    },
    member_delete_account({ p_confirm }) {
      const { u, c } = ctx();
      if (p_confirm !== "HAPUS") fail("Ketik HAPUS untuk mengonfirmasi");
      const mine = myOrders(c);
      for (const o of mine) { o.customer_phone = null; o.customer_id = null; }
      for (const q of db.queue_entries ?? []) if (q.tenant_id === c.tenant_id && (q.customer_id === c.id || normPhone(q.phone) === normPhone(c.phone))) { q.phone = null; q.name = "Dihapus"; q.customer_id = null; }
      db.member_consents = (db.member_consents ?? []).filter((k) => k.profile_id !== u.id);
      db.profiles = db.profiles.filter((p) => p.id !== u.id);
      db.customers = db.customers.filter((x) => x.id !== c.id);
      db.audit?.unshift?.({ id: Date.now(), tenant_id: u.tenant_id, actor_id: u.id, actor_role: "member", action: "delete_account", entity: "profiles", entity_id: u.id, detail: { customer_id: c.id }, created_at: new Date(now()).toISOString() });
      onDeleted?.();
      return { dihapus: true, pesanan_dianonimkan: mine.length, catatan: "Pesanan dipertahankan tanpa identitas untuk pembukuan. Rekam medis (bila ada) dikelola klinik sesuai kewajiban penyimpanan." };
    },
  };
}
