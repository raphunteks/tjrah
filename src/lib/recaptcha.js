// Client-Side Helper Google reCAPTCHA v3 untuk Proteksi Autentikasi Tijarah OS

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-v3-script";

/**
 * Muat skrip Google reCAPTCHA v3 secara asinkron
 */
export function loadRecaptchaScript(siteKey) {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      return resolve(null);
    }

    if (window.grecaptcha) {
      return resolve(window.grecaptcha);
    }

    const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.grecaptcha));
      existingScript.addEventListener("error", (err) => reject(err));
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = (err) => reject(new Error("Gagal memuat skrip keamanan Google reCAPTCHA"));
    document.head.appendChild(script);
  });
}

/**
 * Dapatkan token reCAPTCHA v3 untuk aksi tertentu (misal: "login")
 */
export async function getRecaptchaToken(action = "login") {
  const siteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();
  const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

  // Graceful fallback jika reCAPTCHA dinonaktifkan atau site key belum dipasang
  if (!enabled || !siteKey) {
    return { ok: true, token: null, bypassed: true };
  }

  try {
    await loadRecaptchaScript(siteKey);

    return new Promise((resolve) => {
      if (!window.grecaptcha) {
        return resolve({ ok: false, error: "Layanan Google reCAPTCHA tidak tersedia." });
      }

      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(siteKey, { action });
          resolve({ ok: true, token });
        } catch (err) {
          console.warn("[reCAPTCHA] Eksekusi token gagal:", err);
          // Bila di domain tidak terdaftar saat dev, jangan kuncikan akses
          resolve({ ok: true, token: null, bypassed: true, warning: err.message });
        }
      });
    });
  } catch (err) {
    console.warn("[reCAPTCHA] Gagal inisialisasi:", err);
    return { ok: true, token: null, bypassed: true, warning: err.message };
  }
}

/**
 * Verifikasi token reCAPTCHA ke backend server /api/verify-recaptcha
 */
export async function verifyRecaptchaServer(token, action = "login") {
  if (!token) {
    return { ok: true, bypassed: true };
  }

  try {
    const res = await fetch("/api/verify-recaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Verifikasi reCAPTCHA gagal (HTTP ${res.status}).`,
        status: res.status
      };
    }

    return { ok: true, score: data.score, bypassed: data.bypassed };
  } catch (err) {
    console.error("[reCAPTCHA] Gagal menghubungi endpoint server:", err);
    return { ok: false, error: "Gagal memverifikasi keamanan reCAPTCHA dengan server." };
  }
}

/**
 * Fungsi komprehensif: ambil token lalu verifikasi ke backend
 */
export async function executeRecaptchaVerification(action = "login") {
  const tokenRes = await getRecaptchaToken(action);
  if (!tokenRes.ok) {
    return tokenRes;
  }

  if (tokenRes.bypassed || !tokenRes.token) {
    return { ok: true, bypassed: true };
  }

  return await verifyRecaptchaServer(tokenRes.token, action);
}
