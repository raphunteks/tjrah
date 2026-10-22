// Vercel Serverless Function: Proxy Dispatch Notifikasi WhatsApp Hermes ke Webhook n8n
// Endpoint: https://www.harumin.my.id/api/hermes-dispatch

import { setCorsHeaders } from "./_cors.js";

export default async function handler(req, res) {
  setCorsHeaders(req, res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const defaultPhone = process.env.HERMES_DEFAULT_PHONE || "6285256739684";
    if (!body.target && !body.target_phone && !body.phone) {
      body.target = defaultPhone;
      body.target_phone = defaultPhone;
    }

    const testUrl = process.env.HERMES_WEBHOOK_TEST_URL || "https://webhook.dentsweb.my.id/webhook-test/tijarah";
    const prodUrl = process.env.HERMES_WEBHOOK_URL || "https://webhook.dentsweb.my.id/webhook/tijarah";

    // Coba testUrl dulu jika n8n canvas sedang dalam mode 'Execute workflow'
    let n8nRes = await fetch(testUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).catch(() => null);

    let modeUsed = "test";
    if (!n8nRes || !n8nRes.ok) {
      n8nRes = await fetch(prodUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).catch(() => null);
      modeUsed = "production";
    }

    if (n8nRes && n8nRes.ok) {
      const data = await n8nRes.json().catch(() => ({ status: "success" }));
      return res.status(200).json({ ok: true, mode: modeUsed, data });
    } else {
      return res.status(200).json({ ok: false, mode: modeUsed, message: "Webhook n8n dihubungi" });
    }
  } catch (err) {
    console.error("[api/hermes-dispatch] Error:", err);
    return res.status(200).json({ ok: false, error: err.message || "Internal server error" });
  }
}
