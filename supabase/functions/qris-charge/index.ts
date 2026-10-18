// QRIS dinamis: Staff membuat tagihan untuk sebuah Pesanan, memeriksa status, membatalkan,
// atau (hanya mode simulasi) mensimulasikan pembayaran.
// Mendukung penyedia Pakasir (v2 API) sebagai gateway utama, Midtrans, dan simulasi internal.
// Aturan bisnis ada di SQL (qris_start / qris_attach / qris_settle, diuji di Postgres).
//
//   POST { action: "create", order_id }         → { charge }   (QR: charge.qr_string atau charge.qr_url)
//   POST { action: "check_status", charge_id }  → { charge }   (mengecek status langsung ke API penyedia)
//   POST { action: "cancel", charge_id }        → { charge }   (membatalkan tagihan ke penyedia dan DB)
//   POST { action: "fee", amount }              → { fees }     (estimasi biaya Pakasir)
//   POST { action: "simulate_paid", charge_id } → { ok }       (hanya bila QRIS_SIMULATE=1)
//
// Alamat webhook yang didaftarkan di dashboard Pakasir: <SUPABASE_URL>/functions/v1/qris-webhook
// @ts-nocheck
declare const Deno: any;

import { json, corsHeaders } from "../_shared/cors.ts";
import { userContext, admin } from "../_shared/auth.ts";
import { rateLimit } from "../_shared/redis.ts";

const midtransBase = () => (Deno.env.get("MIDTRANS_ENV") === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com");
const WIB = 7 * 3600 * 1000;
/** Midtrans memberi waktu "YYYY-MM-DD HH:mm:ss" dalam WIB. */
function parseWib(s: unknown): string | null {
  const m = typeof s === "string" ? s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/) : null;
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - WIB).toISOString();
}

const pakasirBase = () => (Deno.env.get("PAKASIR_API_BASE") || Deno.env.get("API_BASE_PAKASIR") || "https://app.pakasir.com/api/v2").replace(/\/+$/, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method tidak didukung" }, 405);
  const ctx = await userContext(req);
  if (!ctx) return json(req, { error: "Tidak terautentikasi" }, 401);
  const { db, profile } = ctx;
  if (!profile.tenant_id || profile.role === "member") return json(req, { error: "Akses ditolak" }, 403);
  try {
    if (!(await rateLimit(`qris:${profile.id}`, 60, 60))) return json(req, { error: "Terlalu banyak permintaan" }, 429);
  } catch { /* batas lain tetap berlaku di SQL */ }

  const b = await req.json().catch(() => ({}));
  const sys = admin();
  const simulate = Deno.env.get("QRIS_SIMULATE") === "1";

  // Estimasi biaya Pakasir
  if (b.action === "fee") {
    const amt = Math.round(Number(b.amount || 0));
    if (amt <= 0) return json(req, { error: "amount tidak valid" }, 400);
    const res = await fetch(`${pakasirBase()}/payment-fee/${amt}`).catch(() => null);
    const fees = res ? await res.json().catch(() => ({})) : {};
    return json(req, fees);
  }

  // Simulasi pembayaran lunas (khusus development/pengujian)
  if (b.action === "simulate_paid") {
    if (!simulate) return json(req, { error: "Simulasi tidak aktif" }, 403);
    const { data: ch, error } = await db.rpc("qris_status", { p_charge: b.charge_id });
    if (error) return json(req, { error: error.message }, 400);
    const { data: row } = await sys.from("payment_charges").select("id, provider, provider_ref, amount, status").eq("id", ch.id).single();
    if (!row || row.status !== "pending") return json(req, { error: "Hanya tagihan yang masih pending" }, 400);
    const { data, error: e2 } = await sys.rpc("qris_settle", {
      p_provider: row.provider || "sim",
      p_ref: row.provider_ref || row.id,
      p_amount: row.amount,
      p_raw: { simulated: true, simulated_at: new Date().toISOString() },
    });
    if (e2) return json(req, { error: e2.message }, 400);
    return json(req, data);
  }

  // Cek status langsung ke penyedia (manual trigger / sync)
  if (b.action === "check_status") {
    if (typeof b.charge_id !== "string") return json(req, { error: "charge_id wajib" }, 400);
    const { data: row } = await sys.from("payment_charges").select("id, provider, provider_ref, amount, status").eq("id", b.charge_id).maybeSingle();
    if (!row) return json(req, { error: "Tagihan tidak ditemukan" }, 404);

    if (row.provider === "pakasir" && row.provider_ref && row.status === "pending") {
      const pakasirKey = Deno.env.get("PAKASIR_API_KEY") || Deno.env.get("APIKEY_PAKASIR") || "";
      const pakasirSlug = Deno.env.get("PAKASIR_SLUG") || Deno.env.get("SLUG_PAKASIR") || "harumin";
      if (pakasirKey) {
        const res = await fetch(`${pakasirBase()}/transaction-status/${pakasirSlug}/${row.provider_ref}`, {
          headers: { "X-Api-Key": pakasirKey },
        }).catch(() => null);
        const st = res ? await res.json().catch(() => ({})) : {};
        if (st.status === "completed") {
          await sys.rpc("qris_settle", { p_provider: "pakasir", p_ref: row.provider_ref, p_amount: Number(st.amount), p_raw: st });
        } else if (st.status === "canceled") {
          await sys.rpc("qris_mark", { p_provider: "pakasir", p_ref: row.provider_ref, p_status: "cancelled", p_raw: st });
        }
      }
    }
    const { data: latest } = await db.rpc("qris_status", { p_charge: row.id });
    return json(req, { charge: latest });
  }

  // Batalkan tagihan
  if (b.action === "cancel") {
    if (typeof b.charge_id !== "string") return json(req, { error: "charge_id wajib" }, 400);
    const { data: row } = await sys.from("payment_charges").select("id, provider, provider_ref, status").eq("id", b.charge_id).maybeSingle();
    if (row && row.provider === "pakasir" && row.provider_ref && row.status === "pending") {
      const pakasirKey = Deno.env.get("PAKASIR_API_KEY") || Deno.env.get("APIKEY_PAKASIR") || "";
      const pakasirSlug = Deno.env.get("PAKASIR_SLUG") || Deno.env.get("SLUG_PAKASIR") || "harumin";
      if (pakasirKey) {
        await fetch(`${pakasirBase()}/cancel-transaction/${pakasirSlug}/${row.provider_ref}`, {
          method: "POST",
          headers: { "X-Api-Key": pakasirKey },
        }).catch(() => null);
      }
    }
    const { data: c, error } = await db.rpc("qris_cancel", { p_charge: b.charge_id });
    if (error) return json(req, { error: error.message }, 400);
    return json(req, { charge: c });
  }

  // Buat tagihan QRIS baru
  if (b.action !== "create" || typeof b.order_id !== "string") return json(req, { error: "action/order_id tidak valid" }, 400);

  // Semua izin (peran, Cabang, Saklar Fitur Paket, shift terbuka, Pesanan terbuka) diputuskan SQL atas nama pengguna.
  const { data: ch, error } = await db.rpc("qris_start", { p_order: b.order_id });
  if (error) return json(req, { error: error.message }, 400);
  if (ch.qr_string || ch.qr_url) return json(req, { charge: ch }); // sudah ada QR yang masih berlaku

  const { data: tenantKey } = await sys.rpc("qris_server_key", { p_tenant: profile.tenant_id });
  const midtransServerKey: string | undefined = tenantKey || Deno.env.get("MIDTRANS_SERVER_KEY") || undefined;
  const pakasirKey = Deno.env.get("PAKASIR_API_KEY") || Deno.env.get("APIKEY_PAKASIR") || "";
  const pakasirSlug = Deno.env.get("PAKASIR_SLUG") || Deno.env.get("SLUG_PAKASIR") || "harumin";

  // Prioritas provider: QRIS_PROVIDER env → Pakasir (bila ada API key) → Midtrans → Sim
  const want = Deno.env.get("QRIS_PROVIDER") ?? (pakasirKey ? "pakasir" : midtransServerKey ? "midtrans" : simulate ? "sim" : "");
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Mode Simulasi
  if (want === "sim") {
    if (!simulate) return json(req, { error: "Mode simulasi tidak aktif" }, 503);
    const { data, error: e } = await sys.rpc("qris_attach", {
      p_charge: ch.id,
      p_provider: "sim",
      p_ref: `SIM-${ch.id}`,
      p_qr: `SIMULASI-QRIS|${ch.amount}|${ch.id}`,
      p_expires: expires,
    });
    if (e) return json(req, { error: e.message }, 400);
    return json(req, { charge: data, simulated: true });
  }

  // Mode Pakasir (v2)
  if (want === "pakasir") {
    if (!pakasirKey) {
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: "API Key Pakasir belum dikonfigurasi" });
      return json(req, { error: "QRIS Pakasir belum dikonfigurasi (kunci penyedia belum diset)" }, 503);
    }
    const gross = Math.round(Number(ch.amount));
    if (gross !== Number(ch.amount) || gross < 500) {
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: "Nominal harus bilangan bulat rupiah (min Rp500)" });
      return json(req, { error: "Nominal bukan bilangan bulat rupiah atau di bawah minimal Rp500" }, 400);
    }

    const res = await fetch(`${pakasirBase()}/create-transaction/${pakasirSlug}/${ch.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": pakasirKey,
      },
      body: JSON.stringify({
        method: "qris",
        amount: gross,
      }),
    }).catch(() => null);

    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || !out.qr_string) {
      const reason = String(out.message || out.error || "Gagal membuat transaksi Pakasir").slice(0, 150);
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: `Pakasir: ${reason}` });
      return json(req, { error: `Penyedia pembayaran (Pakasir) menolak: ${reason}` }, 502);
    }

    const { data, error: e3 } = await sys.rpc("qris_attach", {
      p_charge: ch.id,
      p_provider: "pakasir",
      p_ref: out.txn_id || ch.id,
      p_qr: out.qr_string,
      p_expires: out.expired_at || expires,
      p_qr_url: null,
    });
    if (e3) return json(req, { error: e3.message }, 400);

    return json(req, {
      charge: data,
      txn_id: out.txn_id,
      fee: out.fee,
      total_payment: out.total_payment,
      is_sandbox: Boolean(out.is_sandbox),
    });
  }

  // Mode Midtrans
  if (want === "midtrans") {
    if (!midtransServerKey) {
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: "Penyedia pembayaran belum dikonfigurasi" });
      return json(req, { error: "QRIS belum dikonfigurasi untuk Tenant ini (kunci penyedia belum diset)" }, 503);
    }
    const gross = Math.round(Number(ch.amount));
    if (gross !== Number(ch.amount)) {
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: "Nominal harus bilangan bulat rupiah" });
      return json(req, { error: "Nominal bukan bilangan bulat rupiah" }, 400);
    }
    const res = await fetch(`${midtransBase()}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${btoa(midtransServerKey + ":")}`,
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: ch.id, gross_amount: gross },
        qris: { acquirer: "gopay" },
      }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    const act = Array.isArray(out.actions) ? out.actions : [];
    const qrUrl: string | null = (act.find((a: any) => a.name === "generate-qr-code-v2") ?? act.find((a: any) => a.name === "generate-qr-code"))?.url ?? null;
    if (!res || !String(out.status_code ?? "").startsWith("2") || !(out.qr_string || qrUrl)) {
      await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: `Penyedia menolak: ${String(out.status_message ?? "tidak ada respons").slice(0, 150)}` });
      return json(req, { error: "Penyedia pembayaran tidak dapat membuat QR. Coba lagi atau bayar dengan metode lain." }, 502);
    }
    const { data, error: e3 } = await sys.rpc("qris_attach", {
      p_charge: ch.id,
      p_provider: "midtrans",
      p_ref: ch.id,
      p_qr: out.qr_string ?? null,
      p_expires: parseWib(out.expiry_time) ?? expires,
      p_qr_url: qrUrl,
    });
    if (e3) return json(req, { error: e3.message }, 400);
    return json(req, { charge: data });
  }

  await sys.rpc("qris_fail", { p_charge: ch.id, p_reason: "Tidak ada penyedia QRIS aktif" });
  return json(req, { error: "Tidak ada penyedia QRIS yang dikonfigurasi" }, 503);
});
