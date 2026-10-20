// Vercel Serverless Function: Validasi Token Reset Kata Sandi (2 Menit)
import { verifyPasswordResetToken } from "../src/server/inviteService.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { token, email } = req.body || {};
    const result = await verifyPasswordResetToken({ token, email });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[api/verify-reset-token] Error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
