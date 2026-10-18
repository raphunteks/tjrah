// Webhook pembayaran tagihan Harum.in → menandai tagihan lunas (idempotent) dan mengaktifkan kembali tenant yang ditangguhkan.
// Autentikasi: header x-signature = HMAC-SHA256 hex dari body mentah dengan secret BILLING_WEBHOOK_SECRET.
// Format payload generik: {"invoice_id": "<uuid>", "status": "paid", "reference": "<id transaksi gateway>"}.
// Gateway sungguhan (Midtrans/Xendit/dll.) punya format & tanda tangan sendiri: sesuaikan bagian verifikasi, jangan melonggarkannya.
import { json, corsHeaders } from "../_shared/cors.ts";
import { admin } from "../_shared/auth.ts";

const enc = new TextEncoder();
async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Metode tidak didukung" }, 405);
  const secret = Deno.env.get("BILLING_WEBHOOK_SECRET");
  if (!secret) return json(req, { error: "BILLING_WEBHOOK_SECRET belum diset" }, 500);
  const raw = await req.text();
  const sig = (req.headers.get("x-signature") ?? "").toLowerCase();
  if (!safeEqual(sig, await hmacHex(secret, raw))) return json(req, { error: "Tanda tangan tidak valid" }, 401);

  let body: { invoice_id?: string; status?: string; reference?: string };
  try { body = JSON.parse(raw); } catch { return json(req, { error: "JSON tidak valid" }, 400); }
  if (!body.invoice_id || !/^[0-9a-f-]{36}$/i.test(body.invoice_id)) return json(req, { error: "invoice_id tidak valid" }, 400);
  if (body.status !== "paid") return json(req, { ok: true, ignored: body.status ?? null });   // status lain (pending/expired) diabaikan

  const { data, error } = await admin().rpc("mark_invoice_paid_system", { p_invoice: body.invoice_id, p_ref: body.reference ?? "webhook" });
  if (error) return json(req, { error: error.message }, 400);
  return json(req, { ok: true, status: data?.status });
});
