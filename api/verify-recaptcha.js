// Vercel Serverless Function: Verifikasi Google reCAPTCHA v2 (Checkbox) & v3 Server-Side
// Endpoint: https://www.harumin.my.id/api/verify-recaptcha

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 menit
const MAX_ATTEMPTS_PER_WINDOW = 5; // Maks 5 percobaan per menit per IP

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const history = rateLimitMap.get(ip) || [];
  const validHistory = history.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (validHistory.length >= MAX_ATTEMPTS_PER_WINDOW) {
    rateLimitMap.set(ip, validHistory);
    return true;
  }

  validHistory.push(now);
  rateLimitMap.set(ip, validHistory);
  return false;
}

async function verifyWithGoogle(secretKey, token, clientIp) {
  const params = new URLSearchParams();
  params.append("secret", secretKey);
  params.append("response", token);
  if (clientIp) {
    params.append("remoteip", clientIp);
  }

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  if (!res.ok) {
    throw new Error(`Google reCAPTCHA HTTP ${res.status}`);
  }

  return await res.json();
}

import { setCorsHeaders } from "./_cors.js";

export default async function handler(req, res) {
  setCorsHeaders(req, res, "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed. Gunakan POST." });
  }

  const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "127.0.0.1";

  // Periksa Rate Limiter
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      ok: false,
      error: "Terlalu banyak percobaan masuk dari alamat IP ini. Silakan tunggu 1 menit sebelum mencoba kembali."
    });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { token, action, version } = payload || {};

    const secretKeyV3 = process.env.RECAPTCHA_SECRET_KEY;
    const secretKeyV2 = process.env.RECAPTCHA_V2_SECRET_KEY || process.env.SECRET_KEY_RECAPTCHAV2;
    const enabled = process.env.VITE_RECAPTCHA_ENABLED !== "false";

    // Jika fitur dinonaktifkan atau kedua kunci belum dikonfigurasi, izinkan akses secara aman
    if (!enabled || (!secretKeyV3 && !secretKeyV2)) {
      return res.status(200).json({ ok: true, score: 1.0, bypassed: true });
    }

    if (!token) {
      return res.status(400).json({ ok: false, error: "Token verifikasi reCAPTCHA wajib disertakan." });
    }

    // Pilih kunci utama sesuai versi
    const primaryKey = (version === "v2" && secretKeyV2) ? secretKeyV2 : (secretKeyV3 || secretKeyV2);
    let googleRes = await verifyWithGoogle(primaryKey, token, clientIp);

    // Fallback: Jika gagal dengan primaryKey dan versi lain tersedia, uji kunci alternatif
    if (!googleRes.success && secretKeyV2 && secretKeyV3) {
      const alternateKey = primaryKey === secretKeyV2 ? secretKeyV3 : secretKeyV2;
      try {
        const fallbackRes = await verifyWithGoogle(alternateKey, token, clientIp);
        if (fallbackRes.success) {
          googleRes = fallbackRes;
        }
      } catch (e) {
        // Abaikan error fallback
      }
    }

    // Untuk v2, Google mengembalikan { success: true }.
    // Untuk v3, Google mengembalikan { success: true, score: 0.9 }.
    if (googleRes.success && (googleRes.score === undefined || googleRes.score >= 0.5)) {
      return res.status(200).json({
        ok: true,
        score: googleRes.score ?? 1.0,
        version: googleRes.score !== undefined ? "v3" : "v2",
        action: googleRes.action || action,
        hostname: googleRes.hostname
      });
    }

    return res.status(403).json({
      ok: false,
      error: "Verifikasi reCAPTCHA mendeteksi aktivitas mencurigakan atau skor risiko tinggi.",
      score: googleRes.score ?? 0,
      codes: googleRes["error-codes"] || []
    });
  } catch (err) {
    console.error("[reCAPTCHA Serverless Error]", err);
    return res.status(500).json({
      ok: false,
      error: "Gagal memverifikasi token ke server Google. Silakan coba kembali."
    });
  }
}
