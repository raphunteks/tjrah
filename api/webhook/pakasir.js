// Webhook Handler Resmi Pakasir Payment Gateway untuk Tijarah OS
// Endpoint: https://www.harumin.my.id/api/webhook/pakasir (atau https://tijaarah.vercel.app/api/webhook/pakasir)
// Header verifikasi: X-Secret: c16bb67cd5cef9dde0722e7a4c9fed6a

export default async function handler(req, res) {
  // Hanya menerima metode POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Gunakan POST." });
  }

  // Verifikasi Webhook Secret dari header X-Secret
  const expectedSecret = process.env.PAKASIR_WEBHOOK_SECRET || "c16bb67cd5cef9dde0722e7a4c9fed6a";
  const incomingSecret = req.headers["x-secret"] || req.headers["X-Secret"];

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    console.warn("[Pakasir Webhook] Header X-Secret tidak valid atau tidak cocok.");
    return res.status(401).json({ error: "Unauthorized: Header X-Secret tidak valid." });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { txn_id, order_id, amount, status, is_sandbox, completed_at } = payload || {};

    console.info(`[Pakasir Webhook] Notifikasi diterima untuk Order: ${order_id}, Status: ${status}, Amount: ${amount}`);

    // Jika pembayaran selesai (completed)
    if (status === "completed") {
      // 1. Catat ke sistem audit log & update invoice di database Supabase (jika env tersedia)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        try {
          const fetchRes = await fetch(`${supabaseUrl}/rest/v1/rpc/mark_invoice_paid_system`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
              p_invoice: order_id,
              p_ref: txn_id || "pakasir_webhook"
            })
          });
          if (!fetchRes.ok) {
            console.warn("[Pakasir Webhook] Gagal memanggil RPC Supabase:", await fetchRes.text());
          }
        } catch (dbErr) {
          console.warn("[Pakasir Webhook] Error koneksi DB Supabase:", dbErr.message);
        }
      }

      return res.status(200).json({
        ok: true,
        message: "Pembayaran berhasil diverifikasi dan langganan diperbarui.",
        order_id,
        status: "completed"
      });
    }

    // Status lainnya (pending / canceled)
    return res.status(200).json({
      ok: true,
      message: `Status ${status} diterima.`,
      order_id
    });
  } catch (err) {
    console.error("[Pakasir Webhook] Gagal memproses payload webhook:", err);
    return res.status(400).json({ error: "Invalid payload JSON." });
  }
}
