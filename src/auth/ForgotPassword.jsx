import { useState, useRef, useEffect } from "react";
import { Link, useRouter } from "../lib/router.jsx";
import {
  loadRecaptchaScript,
  renderRecaptchaCheckbox,
  resetRecaptchaCheckbox,
  verifyRecaptchaServer,
  RECAPTCHA_V2_SITE_KEY
} from "../lib/recaptcha.js";
import "../styles/dashboard.css";

export default function ForgotPassword() {
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState(null);

  const recaptchaContainerRef = useRef(null);
  const recaptchaWidgetIdRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function initRecaptcha() {
      try {
        await loadRecaptchaScript();
        if (!isMounted) return;

        if (recaptchaContainerRef.current) {
          const wId = await renderRecaptchaCheckbox(
            recaptchaContainerRef.current,
            (token) => {
              if (isMounted) setRecaptchaToken(token);
            },
            () => {
              if (isMounted) setRecaptchaToken(null);
            }
          );
          recaptchaWidgetIdRef.current = wId;
        }
      } catch (err) {
        console.warn("[reCAPTCHA ForgotPassword] Init error:", err);
      }
    }

    initRecaptcha();

    return () => {
      isMounted = false;
    };
  }, [success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = String(email || "").trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    if (RECAPTCHA_V2_SITE_KEY && !recaptchaToken) {
      setError("Harap centang kotak 'Saya bukan robot' terlebih dahulu.");
      return;
    }

    setBusy(true);

    try {
      if (recaptchaToken) {
        const verifyRes = await verifyRecaptchaServer(recaptchaToken, "forgot_password", "v2");
        if (!verifyRes.ok) {
          setError(verifyRes.error || "Verifikasi keamanan reCAPTCHA gagal.");
          setBusy(false);
          return;
        }
      }

      const res = await fetch("/api/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal memproses permintaan atur ulang kata sandi.");
        resetRecaptchaCheckbox(recaptchaWidgetIdRef.current);
        setRecaptchaToken(null);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error("[ForgotPassword] Error:", err);
      setError("Terjadi kesalahan jaringan. Pastikan koneksi internet Anda aktif.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-login">
      <main className="d-login__card" aria-labelledby="forgot-title" style={{ maxWidth: "420px" }}>
        <Link to="/" className="d-brand" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>
          <img src="/tijarah-header.svg" alt="Tijarah - Smart Trade, Better Business" width="200" height="60" style={{ height: "46px", width: "auto" }} />
        </Link>

        <h1 id="forgot-title" style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Atur Ulang Kata Sandi
        </h1>

        {!success ? (
          <>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Masukkan alamat email akun Tijarah Anda. Kami akan mengirimkan tautan aman untuk mengatur ulang kata sandi (berlaku selama 2 menit).
            </p>

            <form className="d-form" onSubmit={handleSubmit} noValidate>
              <div className="d-field">
                <label htmlFor="f-email">Email Terdaftar</label>
                <input
                  id="f-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@domain.com"
                  required
                />
              </div>

              {error && <p className="d-field__error" role="alert">{error}</p>}

              <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy}>
                {busy ? "Mengirimkan Tautan…" : "Atur Ulang Kata Sandi"}
              </button>

              {/* Widget Checkbox Resmi Google reCAPTCHA v2 */}
              {Boolean(RECAPTCHA_V2_SITE_KEY) && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "1rem 0 0.5rem",
                    minHeight: "78px"
                  }}
                >
                  <div ref={recaptchaContainerRef} id="recaptcha-v2-container"></div>
                </div>
              )}

              <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.85rem" }}>
                <Link to="/masuk" style={{ color: "var(--color-ink-muted, #64748b)", textDecoration: "underline" }}>
                  Kembali ke Halaman Masuk
                </Link>
              </div>
            </form>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                color: "var(--color-accent, #059669)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem"
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Tautan Terkirim!
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1rem" }}>
              Kami telah mengirimkan tautan atur ulang kata sandi ke <strong>{email}</strong>.
            </p>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem",
                fontSize: "0.82rem",
                color: "#d97706",
                textAlign: "left",
                marginBottom: "1.25rem",
                lineHeight: 1.4
              }}
            >
              <strong>PENTING:</strong> Tautan ini hanya berlaku selama <strong>2 menit</strong> sejak email dikirimkan. Segera periksa kotak masuk atau folder spam Anda.
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={() => setSuccess(false)}
              >
                Kirim Ulang
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary d-btn--sm"
                onClick={() => navigate("/masuk")}
              >
                Kembali ke Masuk
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
