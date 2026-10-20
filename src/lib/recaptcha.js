// Client-Side Helper Google reCAPTCHA (v2 Checkbox + v3 Floating Badge) untuk Tijarah OS

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-script";

/**
 * Muat skrip Google reCAPTCHA segera di awal halaman agar:
 * 1. Badge resmi Google reCAPTCHA (logo segitiga SVG) langsung muncul melayang di pojok kanan bawah.
 * 2. API grecaptcha siap untuk merender Checkbox v2.
 */
export function loadRecaptchaScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.grecaptcha && window.grecaptcha.render) return resolve(window.grecaptcha);

    const siteKeyV3 = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();
    const siteKeyV2 = (import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || "").trim();
    const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

    if (!enabled || (!siteKeyV3 && !siteKeyV2)) {
      return resolve(null);
    }

    const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existingScript) {
      if (window.grecaptcha) return resolve(window.grecaptcha);
      existingScript.addEventListener("load", () => resolve(window.grecaptcha));
      existingScript.addEventListener("error", (err) => reject(err));
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    // Parameter render=siteKeyV3 mengaktifkan floating badge v3 di kanan bawah secara instan
    const renderParam = siteKeyV3 ? `render=${encodeURIComponent(siteKeyV3)}` : "render=explicit";
    script.src = `https://www.google.com/recaptcha/api.js?${renderParam}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.grecaptcha) {
        window.grecaptcha.ready(() => resolve(window.grecaptcha));
      } else {
        resolve(null);
      }
    };
    script.onerror = (err) => reject(new Error("Gagal memuat skrip resmi Google reCAPTCHA"));
    document.head.appendChild(script);
  });
}

/**
 * Render widget Checkbox v2 ("Saya bukan robot") secara eksplisit ke dalam elemen DOM
 */
export async function renderRecaptchaCheckbox(containerElement, onVerifyCallback, onExpiredCallback) {
  const siteKeyV2 = (import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || "").trim();
  const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

  if (!enabled || !siteKeyV2 || !containerElement) {
    return null;
  }

  try {
    await loadRecaptchaScript();
    if (!window.grecaptcha || typeof window.grecaptcha.render !== "function") {
      return null;
    }

    return new Promise((resolve) => {
      window.grecaptcha.ready(() => {
        try {
          // Bersihkan kontainer jika sebelumnya sudah ada iframe
          containerElement.innerHTML = "";
          const widgetId = window.grecaptcha.render(containerElement, {
            sitekey: siteKeyV2,
            theme: "light",
            callback: (token) => {
              if (typeof onVerifyCallback === "function") {
                onVerifyCallback(token);
              }
            },
            "expired-callback": () => {
              if (typeof onExpiredCallback === "function") {
                onExpiredCallback();
              }
            }
          });
          resolve(widgetId);
        } catch (err) {
          console.warn("[reCAPTCHA v2 Checkbox Render Error]:", err);
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.warn("[reCAPTCHA v2 Checkbox Load Error]:", err);
    return null;
  }
}

/**
 * Reset widget checkbox jika diperlukan (misal setelah login gagal)
 */
export function resetRecaptchaCheckbox(widgetId) {
  try {
    if (window.grecaptcha && typeof window.grecaptcha.reset === "function") {
      if (widgetId !== null && widgetId !== undefined) {
        window.grecaptcha.reset(widgetId);
      } else {
        window.grecaptcha.reset();
      }
    }
  } catch (e) {
    // Abaikan reset error
  }
}

/**
 * Dapatkan token reCAPTCHA v3 untuk fallback atau aksi otomatis
 */
export async function getRecaptchaV3Token(action = "login") {
  const siteKeyV3 = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();
  const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

  if (!enabled || !siteKeyV3) {
    return { ok: true, token: null, bypassed: true };
  }

  try {
    await loadRecaptchaScript();
    return new Promise((resolve) => {
      if (!window.grecaptcha || typeof window.grecaptcha.execute !== "function") {
        return resolve({ ok: true, token: null, bypassed: true });
      }

      window.grecaptcha.ready(async () => {
        try {
          const token = await window.grecaptcha.execute(siteKeyV3, { action });
          resolve({ ok: true, token });
        } catch (err) {
          console.warn("[reCAPTCHA v3] Execute warning:", err);
          resolve({ ok: true, token: null, bypassed: true, warning: err.message });
        }
      });
    });
  } catch (err) {
    return { ok: true, token: null, bypassed: true, warning: err.message };
  }
}

/**
 * Kirim token ke backend /api/verify-recaptcha
 */
export async function verifyRecaptchaServer(token, action = "login", version = "v2") {
  if (!token) {
    return { ok: true, bypassed: true };
  }

  try {
    const res = await fetch("/api/verify-recaptcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action, version })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Verifikasi reCAPTCHA gagal (HTTP ${res.status}).`,
        status: res.status
      };
    }

    return { ok: true, score: data.score, version: data.version, bypassed: data.bypassed };
  } catch (err) {
    console.error("[reCAPTCHA] Gagal menghubungi backend:", err);
    return { ok: false, error: "Gagal memverifikasi keamanan reCAPTCHA dengan server." };
  }
}
