// Vercel Serverless Function: Eksekusi Reset Kata Sandi di Supabase
import { executePasswordReset } from "../src/server/inviteService.js";

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
    const { token, email, newPassword } = req.body || {};
    const result = await executePasswordReset({ token, email, newPassword });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[api/reset-password] Error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
