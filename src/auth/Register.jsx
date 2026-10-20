import { useState, useRef, useEffect } from "react";
import { Link, useRouter } from "../lib/router.jsx";
import PasswordStrengthChecklist, { checkPasswordCriteria } from "./PasswordStrengthChecklist.jsx";
import {
  loadRecaptchaScript,
  renderRecaptchaCheckbox,
  resetRecaptchaCheckbox,
  verifyRecaptchaServer,
  RECAPTCHA_V2_SITE_KEY
} from "../lib/recaptcha.js";
import "../styles/dashboard.css";

export default function Register() {
  const { navigate } = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [showReferral, setShowReferral] = useState(false);
  const [referralCode, setReferralCode] = useState("");

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
        console.warn("[reCAPTCHA Register] Init error:", err);
      }
    }

    initRecaptcha();

    return () => {
      isMounted = false;
    };
  }, [success]);

  const handlePhoneChange = (e) => {
    let val = e.target.value.replace(/[^0-9]/g, "");
    if (val.startsWith("0")) {
      val = "62" + val.slice(1);
    }
    setPhone(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanName = String(fullName || "").trim();
    const cleanEmail = String(email || "").trim();

    if (!cleanName) {
      setError("Nama lengkap wajib diisi.");
      return;
    }

    if (!phone || phone.length < 10) {
      setError("Nomor WhatsApp/Telepon tidak valid. Masukkan nomor yang diawali 62.");
      return;
    }

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Alamat email tidak valid.");
      return;
    }

    const { isValid } = checkPasswordCriteria(password);
    if (!isValid) {
      setError("Kata sandi belum memenuhi seluruh 5 kriteria kombinasi.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok dengan kata sandi.");
      return;
    }

    if (RECAPTCHA_V2_SITE_KEY && !recaptchaToken) {
      setError("Harap centang kotak 'Saya bukan robot' terlebih dahulu.");
      return;
    }

    setBusy(true);

    try {
      if (recaptchaToken) {
        const verifyRes = await verifyRecaptchaServer(recaptchaToken, "register", "v2");
        if (!verifyRes.ok) {
          setError(verifyRes.error || "Verifikasi keamanan reCAPTCHA gagal.");
          setBusy(false);
          return;
        }
      }

      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: cleanName,
          phone,
          email: cleanEmail,
          password,
          referralCode: showReferral ? referralCode : ""
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal mendaftarkan akun baru.");
        resetRecaptchaCheckbox(recaptchaWidgetIdRef.current);
        setRecaptchaToken(null);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error("[Register] Error:", err);
      setError("Terjadi kesalahan jaringan saat mendaftarkan akun.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-login">
      <main className="d-login__card" aria-labelledby="register-title" style={{ maxWidth: "460px" }}>
        <Link to="/" className="d-brand" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>
          <img src="/tijarah-header.svg" alt="Tijarah - Smart Trade, Better Business" width="200" height="60" style={{ height: "46px", width: "auto" }} />
        </Link>

        <h1 id="register-title" style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          Daftar Akun Tijarah
        </h1>
        <p style={{ fontSize: "0.85rem", color: "var(--color-ink-muted, #64748b)", marginBottom: "1.25rem" }}>
          Mulai kelola operasional dan pertumbuhan bisnis Anda secara cerdas.
        </p>

        {!success ? (
          <form className="d-form" onSubmit={handleSubmit} noValidate>
            <div className="d-field">
              <label htmlFor="reg-name">Nama Lengkap</label>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama lengkap Anda..."
                required
              />
            </div>

            <div className="d-field">
              <label htmlFor="reg-phone">No. Telp / WhatsApp (62+ xxx)</label>
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="6281234567890"
                required
              />
            </div>

            <div className="d-field">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@domain.com"
                required
              />
            </div>

            <div className="d-field">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label htmlFor="reg-pass">Kata Sandi</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "var(--color-accent, #10B981)",
                    padding: "0 2px"
                  }}
                >
                  {showPassword ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
              <input
                id="reg-pass"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Buat kata sandi..."
                required
              />
            </div>

            <div className="d-field">
              <label htmlFor="reg-conf">Konfirmasi Kata Sandi</label>
              <input
                id="reg-conf"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang kata sandi..."
                required
              />
            </div>

            {/* Live Password Checklist Dinamis Format 2 2 1 di Bawah Konfirmasi Kata Sandi */}
            <PasswordStrengthChecklist password={password} />

            {/* Punya Kode Referral? */}
            <div style={{ margin: "0.5rem 0 1rem" }}>
              {!showReferral ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.82rem" }}>
                  <span style={{ color: "var(--color-ink-muted, #64748b)" }}>Punya kode referral?</span>
                  <button
                    type="button"
                    onClick={() => setShowReferral(true)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--color-accent, #059669)",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline"
                    }}
                  >
                    Gunakan?
                  </button>
                </div>
              ) : (
                <div className="d-field" style={{ marginTop: "0.25rem" }}>
                  <label htmlFor="reg-ref">Kode Referral (Opsional)</label>
                  <input
                    id="reg-ref"
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Masukkan kode referral..."
                  />
                </div>
              )}
            </div>

            {error && <p className="d-field__error" role="alert">{error}</p>}

            <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy}>
              {busy ? "Mendaftarkan Akun…" : "Daftar Sekarang"}
            </button>

            {/* Widget Checkbox Resmi Google reCAPTCHA v2 (Di Bawah Tombol) */}
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

            <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.85rem", color: "var(--color-ink, #0f172a)" }}>
              <span style={{ color: "var(--color-ink-muted, #64748b)" }}>Sudah memiliki akun? </span>
              <Link to="/masuk" style={{ color: "var(--color-accent, #059669)", fontWeight: 600, textDecoration: "underline" }}>
                Masuk
              </Link>
            </div>

            <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.72rem", color: "var(--color-ink-muted, #94a3b8)", lineHeight: "1.4" }}>
              <span>Situs ini dilindungi oleh Google reCAPTCHA. </span>
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-ink-muted, #94a3b8)", textDecoration: "underline" }}>Privasi</a>
              <span> &amp; </span>
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-ink-muted, #94a3b8)", textDecoration: "underline" }}>Persyaratan</a>
            </div>
          </form>
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
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--color-accent, #059669)", marginBottom: "0.5rem" }}>
              Pendaftaran Berhasil!
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Akun Anda dengan email <strong>{email}</strong> telah berhasil dibuat. Silakan masuk untuk mengakses dashboard bisnis Anda.
            </p>
            <button
              type="button"
              className="d-btn d-btn--primary d-btn--block"
              onClick={() => navigate("/masuk")}
            >
              Masuk ke Dashboard
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
