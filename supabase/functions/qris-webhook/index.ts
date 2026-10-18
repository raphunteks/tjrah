// Webhook notifikasi pembayaran untuk QRIS. Publik (tanpa JWT):
// 1. Pakasir: Keaslian diverifikasi lewat header X-Secret (mencocokkan WEBHOOK_SECRET_PAKASIR).
// 2. Midtrans: Keaslian dibuktikan lewat signature_key = SHA512(order_id + status_code + gross_amount + ServerKey).
//
// Melunasi Pesanan lewat SQL qris_settle (idempotent): pengiriman ulang tidak melunasi dua kali.
// Daftarkan URL ini di dashboard Pakasir:
//   <SUPABASE_URL>/functions/v1/qris-webhook
// @ts-nocheck
declare const Deno: any;

import { json, corsHeaders } from "../_shared/cors.ts";
import { admin } from "../_shared/auth.ts";

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha512 = async (s: string) => hex(await crypto.subtle.digest("SHA-512", enc.encode(s)));

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const midtransBase = () => (Deno.env.get("MIDTRANS_ENV") === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method tidak didukung" }, 405);

  const sys = admin();

  // ───────────────────────── 1. Jalur Pakasir (X-Secret) ─────────────────────────
  const secretHeader = req.headers.get("x-secret") || req.headers.get("X-Secret");
  const pakasirSecret = Deno.env.get("PAKASIR_WEBHOOK_SECRET") || Deno.env.get("WEBHOOK_SECRET_PAKASIR") || "";

  if (secretHeader && pakasirSecret) {
    if (!safeEqual(secretHeader.trim(), pakasirSecret.trim())) {
      return json(req, { error: "X-Secret tidak valid" }, 401);
    }

    const n = await req.json().catch(() => null);
    if (!n || typeof n.order_id !== "string" || !n.status) {
      return json(req, { error: "Payload Pakasir tidak valid" }, 400);
    }

    const status = String(n.status).toLowerCase();
    const ref = n.order_id;
    const raw = { ...n, gateway: "pakasir", received_at: new Date().toISOString() };

    if (status === "completed") {
      const { data, error } = await sys.rpc("qris_settle", {
        p_provider: "pakasir",
        p_ref: ref,
        p_amount: Number(n.amount),
        p_raw: raw,
      });
      if (error) {
        console.error("Pakasir qris_settle error:", error);
        return json(req, { error: error.message }, 500);
      }
      return json(req, { ok: true, status: "completed", result: data });
    }

    if (status === "canceled" || status === "cancelled") {
      const { data } = await sys.rpc("qris_mark", {
        p_provider: "pakasir",
        p_ref: ref,
        p_status: "cancelled",
        p_raw: raw,
      });
      return json(req, { ok: true, status: "cancelled", result: data });
    }

    return json(req, { ok: true, ignored: status });
  }

  // ───────────────────────── 2. Jalur Midtrans (signature_key) ─────────────────────────
  const n = await req.json().catch(() => null);
  if (!n || typeof n.order_id !== "string" || !UUID.test(n.order_id) || typeof n.signature_key !== "string") {
    return json(req, { error: "Payload atau header webhook tidak dikenali" }, 400);
  }

  const { data: ch } = await sys.from("payment_charges").select("id, tenant_id, amount, provider, status").eq("id", n.order_id).maybeSingle();
  if (!ch || ch.provider !== "midtrans") {
    return json(req, { ok: true, ignored: "tagihan bukan Midtrans atau tidak ditemukan" });
  }

  const { data: tenantKey } = await sys.rpc("qris_server_key", { p_tenant: ch.tenant_id });
  const serverKey: string | undefined = tenantKey || Deno.env.get("MIDTRANS_SERVER_KEY") || undefined;
  if (!serverKey) return json(req, { error: "Kunci penyedia belum diset" }, 500);

  const expected = await sha512(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey}`);
  if (!safeEqual(expected, n.signature_key.toLowerCase())) return json(req, { error: "Tanda tangan tidak valid" }, 401);

  // Konfirmasi ulang langsung ke Midtrans status API
  const res = await fetch(`${midtransBase()}/v2/${n.order_id}/status`, {
    headers: { Accept: "application/json", Authorization: `Basic ${btoa(serverKey + ":")}` },
  }).catch(() => null);
  if (!res) return json(req, { error: "Penyedia tidak dapat dihubungi" }, 502);

  const st = await res.json().catch(() => ({}));
  const status = String(st.transaction_status ?? "");
  const raw = {
    transaction_status: status,
    transaction_id: st.transaction_id ?? n.transaction_id ?? null,
    gross_amount: st.gross_amount ?? null,
    payment_type: st.payment_type ?? null,
  };

  if (status === "settlement" && (st.fraud_status === undefined || st.fraud_status === "accept")) {
    const { data, error } = await sys.rpc("qris_settle", {
      p_provider: "midtrans",
      p_ref: n.order_id,
      p_amount: Number(st.gross_amount),
      p_raw: raw,
    });
    if (error) return json(req, { error: error.message }, 500);
    return json(req, data);
  }

  const map: Record<string, string> = { expire: "expired", cancel: "cancelled", deny: "failed", failure: "failed" };
  if (map[status]) {
    const { data } = await sys.rpc("qris_mark", {
      p_provider: "midtrans",
      p_ref: n.order_id,
      p_status: map[status],
      p_raw: raw,
    });
    return json(req, data);
  }

  return json(req, { ok: true, ignored: status || "tanpa status" });
});
