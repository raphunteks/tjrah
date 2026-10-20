import { useState, useEffect } from "react";
import { Link, useRouter } from "../lib/router.jsx";
import PasswordStrengthChecklist, { checkPasswordCriteria } from "./PasswordStrengthChecklist.jsx";
import "../styles/dashboard.css";

export default function ResetPassword() {
  const { navigate } = useRouter();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(true);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [tokenError, setTokenError] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [remainingSec, setRemainingSec] = useState(120);

  // Parse token & email dari URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token") || "";
    const em = params.get("email") || "";
    setToken(t);
    setEmail(em);

    if (!t) {
      setVerifying(false);
      setTokenError("Tautan atur ulang tidak memiliki token verifikasi.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/verify-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t, email: em })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          if (data.expired) {
            setTokenExpired(true);
          } else {
            setTokenError(data.error || "Tautan atur ulang tidak valid atau sudah digunakan.");
          }
        } else {
          if (data.email) {
            setEmail(data.email);
          }
          setRemainingSec(data.remainingSeconds || 120);
        }
      } catch (err) {
        setTokenError("Gagal menghubungi server untuk memverifikasi token.");
      } finally {
        setVerifying(false);
      }
    }

    verify();
  }, []);

  // Timer hitung mundur 2 menit
  useEffect(() => {
    if (verifying || tokenExpired || tokenError || success) return;

    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTokenExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [verifying, tokenExpired, tokenError, success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const { isValid } = checkPasswordCriteria(newPassword);
    if (!isValid) {
      setError("Kata sandi belum memenuhi seluruh 5 kriteria kombinasi.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi kata sandi tidak cocok dengan kata sandi baru.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          newPassword
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        if (data.expired) {
          setTokenExpired(true);
        } else {
          setError(data.error || "Gagal memperbarui kata sandi.");
        }
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error("[ResetPassword] Error:", err);
      setError("Terjadi kesalahan jaringan saat memperbarui kata sandi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-login">
      <main className="d-login__card" aria-labelledby="reset-title" style={{ maxWidth: "460px" }}>
        <Link to="/" className="d-brand" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>
          <img src="/tijarah-header.svg" alt="Tijarah - Smart Trade, Better Business" width="200" height="60" style={{ height: "46px", width: "auto" }} />
        </Link>

        <h1 id="reset-title" style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Atur Ulang Kata Sandi
        </h1>

        {verifying && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <p style={{ color: "var(--color-ink-muted, #64748b)", fontSize: "0.9rem" }}>
              Memeriksa keabsahan tautan atur ulang...
            </p>
          </div>
        )}

        {!verifying && tokenExpired && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem"
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ef4444", marginBottom: "0.5rem" }}>
              Tautan Kedaluwarsa
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Tautan atur ulang kata sandi ini telah melewati batas waktu <strong>2 menit</strong> demi perlindungan akun Anda.
            </p>
            <button
              type="button"
              className="d-btn d-btn--primary d-btn--block"
              onClick={() => navigate("/lupa-kata-sandi")}
            >
              Minta Tautan Baru
            </button>
          </div>
        )}

        {!verifying && !tokenExpired && tokenError && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem"
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#ef4444", marginBottom: "0.5rem" }}>
              Tautan Tidak Sah
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              {tokenError}
            </p>
            <button
              type="button"
              className="d-btn d-btn--primary d-btn--block"
              onClick={() => navigate("/lupa-kata-sandi")}
            >
              Minta Tautan Baru
            </button>
          </div>
        )}

        {!verifying && !tokenExpired && !tokenError && !success && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--radius-md)",
                fontSize: "0.82rem",
                color: "#d97706",
                marginBottom: "1rem"
              }}
            >
              <span>Sisa masa berlaku tautan:</span>
              <strong>{remainingSec} detik</strong>
            </div>

            <form className="d-form" onSubmit={handleSubmit} noValidate>
              <div className="d-field">
                <label>Email Akun</label>
                <input type="text" value={email} readOnly disabled style={{ opacity: 0.8 }} />
              </div>

              <div className="d-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label htmlFor="r-pass">Kata Sandi Baru</label>
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
                  id="r-pass"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Ketik kata sandi baru..."
                  required
                />
              </div>

              {/* Live Password Checklist Dinamis (Gambar 2) */}
              <PasswordStrengthChecklist password={newPassword} />

              <div className="d-field">
                <label htmlFor="r-conf">Konfirmasi Kata Sandi Baru</label>
                <input
                  id="r-conf"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi baru..."
                  required
                />
              </div>

              {error && <p className="d-field__error" role="alert">{error}</p>}

              <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy}>
                {busy ? "Menyimpan Sandi…" : "Simpan Kata Sandi Baru"}
              </button>
            </form>
          </>
        )}

        {!verifying && success && (
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
              Kata Sandi Berhasil Diperbarui!
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--color-ink-muted, #64748b)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Kata sandi akun Anda telah berhasil diubah di database Supabase. Anda sekarang dapat masuk menggunakan kata sandi baru.
            </p>
            <button
              type="button"
              className="d-btn d-btn--primary d-btn--block"
              onClick={() => navigate("/masuk")}
            >
              Masuk Sekarang
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
