// Vercel Serverless Function: Verifikasi Google reCAPTCHA v3 Server-Side dengan In-Memory IP Rate Limiting
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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
    const { token, action } = payload || {};

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const enabled = process.env.VITE_RECAPTCHA_ENABLED !== "false";

    // Jika fitur dinonaktifkan atau secret key belum terkonfigurasi, izinkan akses secara aman
    if (!enabled || !secretKey) {
      return res.status(200).json({ ok: true, score: 1.0, bypassed: true });
    }

    if (!token) {
      return res.status(400).json({ ok: false, error: "Token verifikasi reCAPTCHA wajib disertakan." });
    }

    const params = new URLSearchParams();
    params.append("secret", secretKey);
    params.append("response", token);
    if (clientIp) {
      params.append("remoteip", clientIp);
    }

    const googleRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    if (!googleRes.ok) {
      throw new Error(`Google reCAPTCHA HTTP ${googleRes.status}`);
    }

    const data = await googleRes.json();

    // Untuk reCAPTCHA v3, score berkisar 0.0 (bot) sampai 1.0 (manusia)
    // Ambang batas aman standar: >= 0.5
    if (data.success && (data.score === undefined || data.score >= 0.5)) {
      return res.status(200).json({
        ok: true,
        score: data.score ?? 1.0,
        action: data.action || action,
        hostname: data.hostname
      });
    }

    return res.status(403).json({
      ok: false,
      error: "Verifikasi reCAPTCHA mendeteksi aktivitas mencurigakan atau skor risiko tinggi.",
      score: data.score ?? 0,
      codes: data["error-codes"] || []
    });
  } catch (err) {
    console.error("[reCAPTCHA Serverless Error]", err);
    return res.status(500).json({
      ok: false,
      error: "Gagal memverifikasi token ke server Google. Silakan coba kembali."
    });
  }
}
