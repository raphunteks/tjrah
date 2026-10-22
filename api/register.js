// Vercel Serverless Function: Pendaftaran Akun Baru Tijarah
import { registerNewAccount } from "../src/server/inviteService.js";

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
    const { fullName, phone, email, password, referralCode } = req.body || {};
    const result = await registerNewAccount({ fullName, phone, email, password, referralCode });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[api/register] Error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Internal server error" });
  }
}
