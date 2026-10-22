// Vercel Serverless Function: Permintaan Reset Kata Sandi via Email SMTP Gmail
import { requestPasswordResetToken } from "../src/server/inviteService.js";

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
    const origin = req.headers.origin || `https://${req.headers.host}`;
    const { email } = req.body || {};
    const result = await requestPasswordResetToken({ email, origin });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[api/request-password-reset] Error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
