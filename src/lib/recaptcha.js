// Client-Side Helper Google reCAPTCHA (v2 Checkbox + v3 Floating Badge) untuk Tijarah OS

export const RECAPTCHA_V2_SITE_KEY = (import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY || "").trim();
export const RECAPTCHA_V3_SITE_KEY = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-script";

/**
 * Muat skrip Google reCAPTCHA secara eksplisit agar grecaptcha.render siap
 * merender widget Checkbox v2 ("Saya bukan robot") secara stabil di semua domain.
 */
export function loadRecaptchaScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
      return resolve(window.grecaptcha);
    }

    const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";
    if (!enabled || (!RECAPTCHA_V2_SITE_KEY && !RECAPTCHA_V3_SITE_KEY)) {
      return resolve(null);
    }

    const existingScript = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existingScript) {
      if (window.grecaptcha) return resolve(window.grecaptcha);
      existingScript.addEventListener("load", () => {
        if (window.grecaptcha?.ready) {
          window.grecaptcha.ready(() => resolve(window.grecaptcha));
        } else {
          resolve(window.grecaptcha);
        }
      });
      existingScript.addEventListener("error", (err) => reject(err));
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    // Parameter render=RECAPTCHA_V3_SITE_KEY memunculkan floating badge resmi reCAPTCHA di pojok kanan bawah
    const renderParam = RECAPTCHA_V3_SITE_KEY ? `render=${encodeURIComponent(RECAPTCHA_V3_SITE_KEY)}` : "render=explicit";
    script.src = `https://www.google.com/recaptcha/api.js?${renderParam}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(() => resolve(window.grecaptcha));
      } else {
        resolve(window.grecaptcha);
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
  const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

  if (!enabled || !RECAPTCHA_V2_SITE_KEY || !containerElement) {
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
          containerElement.innerHTML = "";
          const widgetId = window.grecaptcha.render(containerElement, {
            sitekey: RECAPTCHA_V2_SITE_KEY,
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
  const enabled = import.meta.env.VITE_RECAPTCHA_ENABLED !== "false";

  if (!enabled || !RECAPTCHA_V3_SITE_KEY) {
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
          const token = await window.grecaptcha.execute(RECAPTCHA_V3_SITE_KEY, { action });
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
