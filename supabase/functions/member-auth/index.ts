// Masuk Member dengan Kode Masuk (OTP) lewat WhatsApp. Publik (tanpa JWT): pemanggil belum login.
// Aturan (kedaluwarsa, batas percobaan, batas laju, penautan Pelanggan, Persetujuan Data) ada di fungsi SQL
// member_otp_issue / member_otp_verify / member_complete (khusus service_role) dan diuji di supabase/tests/member_login.sql.
// Fungsi ini hanya: (1) mengirim kode lewat Hermes, (2) membuat akun Auth + sesi setelah kode benar.
//
//   POST { action: "request", tenant_slug, phone, device_id, consent_data: true, consent_marketing?: boolean }
//   POST { action: "verify",  tenant_slug, phone, device_id, code, name? }  →  { token_hash }  (klien: supabase.auth.verifyOtp)
//
// Secret: HERMES_WEBHOOK_URL, HERMES_TOKEN (opsional), MEMBER_OTP_SIMULATE=1 (hanya untuk pengembangan: kode dikembalikan di respons).
// @ts-nocheck
declare const Deno: any;

import { json, corsHeaders } from "../_shared/cors.ts";
import { admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method tidak didukung" }, 405);

  const b = await req.json().catch(() => ({}));
  const action = clean(b.action, 20);
  const slug = clean(b.tenant_slug, 80);
  const phone = clean(b.phone, 30);
  const device = clean(b.device_id, 100);
  if (!slug || !phone || !device) return json(req, { error: "tenant_slug, phone, dan device_id wajib" }, 400);

  // Lapis kedua di depan batas laju SQL (per nomor/perangkat/Tenant). Redis mati tidak boleh menutup login.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  try {
    if (!(await rateLimit(`member-auth:${ip}`, 30, 600))) return json(req, { error: "Terlalu banyak permintaan. Coba lagi nanti." }, 429);
  } catch { /* batas laju SQL tetap berlaku */ }

  const db = admin();
  const { data: tenant } = await db.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
  if (!tenant) return json(req, { error: "Tenant tidak ditemukan" }, 404);

  if (action === "request") {
    const { data: issued, error } = await db.rpc("member_otp_issue", {
      p_tenant: tenant.id, p_phone: phone, p_device: device,
      p_consent_data: b.consent_data === true, p_consent_marketing: b.consent_marketing === true,
    });
    if (error) return json(req, { error: error.message }, /terlalu banyak/i.test(error.message) ? 429 : 400);

    const hook = Deno.env.get("HERMES_WEBHOOK_URL");
    const { data: integ } = await db.from("tenant_integrations").select("hermes_enabled").eq("tenant_id", tenant.id).maybeSingle();
    const live = Boolean(hook && integ?.hermes_enabled);
    const message = `Kode masuk ${tenant.name}: ${issued.code}. Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`;

    if (!live) {
      if (Deno.env.get("MEMBER_OTP_SIMULATE") !== "1") return json(req, { error: "WhatsApp belum diaktifkan oleh Superadmin untuk Tenant ini" }, 503);
      // Mode simulasi: SENGAJA terlihat jelas dan tidak mengirim apa pun.
      return json(req, { sent: false, simulated: true, dev_code: issued.code, expires_at: issued.expires_at });
    }
    const res = await fetch(hook!, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("HERMES_TOKEN") ?? ""}` },
      body: JSON.stringify({ tenant_id: tenant.id, channel: "whatsapp", target: `62${String(issued.phone).slice(1)}`, kind: "member_otp", message, payload: {} }),
    }).catch(() => null);
    // Catatan audit tanpa kode: hermes_events dapat dibaca Owner/GM, jadi kode TIDAK ditulis ke sana.
    await db.from("hermes_events").insert({
      tenant_id: tenant.id, channel: "whatsapp", target: issued.phone, kind: "member_otp",
      message: "Kode Masuk Member dikirim", status: res?.ok ? "sent" : "failed",
    });
    if (!res?.ok) return json(req, { error: "Gagal mengirim WhatsApp. Coba lagi." }, 502);
    return json(req, { sent: true, simulated: false, expires_at: issued.expires_at });
  }

  if (action === "verify") {
    const { data: v, error } = await db.rpc("member_otp_verify", { p_tenant: tenant.id, p_phone: phone, p_code: clean(b.code, 10), p_device: device });
    if (error) return json(req, { error: error.message }, 400);
    if (!v?.ok) return json(req, { error: "Kode salah atau kedaluwarsa", reason: v?.reason, attempts_left: v?.attempts_left ?? 0 }, 400);

    let email: string | null = v.email ?? null;
    let userId: string | null = v.profile_id ?? null;
    if (v.is_new) {
      email = `member-${v.otp_id}@member.harum.in`;   // alamat sintetis; tidak pernah menerima email
      const { data: made, error: cerr } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "member" } });
      if (cerr || !made.user) return json(req, { error: "Akun tidak dapat dibuat" }, 502);
      userId = made.user.id;
    }
    const { data: done, error: derr } = await db.rpc("member_complete", { p_otp: v.otp_id, p_user: v.is_new ? userId : null, p_name: clean(b.name, 80) || null });
    if (derr) return json(req, { error: derr.message }, 400);
    const { data: link, error: lerr } = await db.auth.admin.generateLink({ type: "magiclink", email: done.email ?? email! });
    if (lerr || !link?.properties?.hashed_token) return json(req, { error: "Sesi tidak dapat dibuat" }, 502);
    return json(req, { token_hash: link.properties.hashed_token, type: "magiclink", is_new: done.is_new, points: done.points });
  }

  return json(req, { error: "action tidak dikenal" }, 400);
});
