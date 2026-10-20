import { useEffect, useState, useRef } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { Link, useRouter } from "../lib/router.jsx";
import { ROLE_LABEL, ROLE_LEVEL } from "../lib/rbac-matrix.js";
import {
  loadRecaptchaScript,
  renderRecaptchaCheckbox,
  resetRecaptchaCheckbox,
  getRecaptchaV3Token,
  verifyRecaptchaServer,
  RECAPTCHA_V2_SITE_KEY
} from "../lib/recaptcha.js";
import "../styles/dashboard.css";

// Hanya tampil saat `npm run dev` dengan Supabase asli (dibuang dari build produksi). Email tetap; kata sandi = DEMO_PASSWORD di .env.local.
const DEV_ACCOUNTS = [
  ["superadmin@demo.harum.in", "superadmin"],
  ["owner@demo.harum.in", "owner"],
  ["gm@demo.harum.in", "gm"],
  ["staff@demo.harum.in", "staff"],
  ["dokter@demo.harum.in", "dokter"],
  ["kasir.klinik@demo.harum.in", "staff", "Kasir klinik"],
  ["owner.klinik@demo.harum.in", "owner", "Owner klinik"],
  ["member@demo.harum.in", "member"],
];

export default function Login() {
  const { api, profile, signIn, signOut, blocked, problem } = useAuth();
  const { navigate } = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hashNotice, setHashNotice] = useState(null);
  const recaptchaContainerRef = useRef(null);
  const [recaptchaWidgetId, setRecaptchaWidgetId] = useState(null);
  const [recaptchaV2Token, setRecaptchaV2Token] = useState(null);

  // Inisialisasi Google reCAPTCHA: Tampilkan floating badge v3 di kanan bawah & render Checkbox v2
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
              if (isMounted) {
                setRecaptchaV2Token(token);
                setErr(null);
              }
            },
            () => {
              if (isMounted) {
                setRecaptchaV2Token(null);
              }
            }
          );
          if (isMounted && wId !== null) {
            setRecaptchaWidgetId(wId);
          }
        }
      } catch (e) {
        console.warn("[reCAPTCHA Init Notice]:", e);
      }
    }

    initRecaptcha();

    return () => {
      isMounted = false;
    };
  }, []);

  // Tangkap error dari fragment URL hash (misal jika user klik link aktivasi Supabase lama yang expired)
  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (hash && (hash.includes("error=") || hash.includes("error_code="))) {
        const cleanHash = hash.replace(/^#/, "");
        const params = new URLSearchParams(cleanHash);
        const code = params.get("error_code") || "";
        const desc = params.get("error_description") || "";

        // Hapus hash fragment dari URL agar rapi dan tidak mengunci state
        window.history.replaceState(null, "", window.location.pathname);

        if (code === "otp_expired" || /expired|invalid/i.test(desc)) {
          setHashNotice({
            tone: "warn",
            title: "Tautan Aktivasi Lama Kedaluwarsa",
            message: "Tautan aktivasi email bawaan telah kedaluwarsa. Sistem Tijarah kini menggunakan Kata Sandi Sementara Otomatis. Silakan masuk langsung dengan memasukkan Email dan Kata Sandi Sementara yang telah dibuatkan / dikirimkan ke email Anda."
          });
        } else {
          setHashNotice({
            tone: "error",
            title: "Pemberitahuan Akses",
            message: decodeURIComponent(desc.replace(/\+/g, " ") || "Tautan verifikasi tidak valid. Silakan masuk menggunakan email dan kata sandi Anda.")
          });
        }
      }
    } catch (e) {
      console.warn("Gagal membaca hash location:", e);
    }
  }, []);

  const [busyEmail, setBusyEmail] = useState(null);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      // Validasi keamanan Google reCAPTCHA (v2 Checkbox atau v3 fallback)
      if (!creds && api?.mode !== "demo" && import.meta.env.VITE_RECAPTCHA_ENABLED !== "false") {
        const hasV2Config = Boolean(import.meta.env.VITE_RECAPTCHA_V2_SITE_KEY);
        let tokenToVerify = recaptchaV2Token;
        let tokenVersion = "v2";

        if (hasV2Config && !tokenToVerify) {
          throw new Error("Silakan centang verifikasi 'Saya bukan robot' terlebih dahulu.");
        }

        if (!tokenToVerify) {
          const v3Res = await getRecaptchaV3Token("login");
          if (!v3Res.ok && !v3Res.bypassed) {
            throw new Error(v3Res.error || "Gagal memperoleh verifikasi keamanan reCAPTCHA.");
          }
          tokenToVerify = v3Res.token;
          tokenVersion = "v3";
        }

        if (tokenToVerify) {
          const verifyRes = await verifyRecaptchaServer(tokenToVerify, "login", tokenVersion);
          if (!verifyRes.ok && !verifyRes.bypassed) {
            resetRecaptchaCheckbox(recaptchaWidgetId);
            setRecaptchaV2Token(null);
            throw new Error(verifyRes.error || "Verifikasi keamanan (reCAPTCHA) gagal. Silakan coba kembali.");
          }
        }
      }

      const rawEmail = (creds?.email ?? email).trim();
      const emailToUse = rawEmail.replace(/@demo\.tijarah\.id$/i, "@demo.harum.in");
      const passToUse = creds?.password ?? password;
      const targetRole = creds?.role;

      // Jika dev 1-click: navigasi instan segera agar user langsung diarahkan tanpa jeda
      if (creds?.role) {
        navigate(targetRole === "member" ? "/m" : "/app", { replace: true });
      }

      await signIn(emailToUse, passToUse, creds ? { ...creds, email: emailToUse } : null);

      if (!creds?.role) {
        navigate(targetRole === "member" ? "/m" : "/app", { replace: true });
      }
    } catch (e2) {
      setErr(e2.message === "Invalid login credentials" ? "Email atau kata sandi salah." : e2.message);
    } finally {
      setBusy(false);
      setBusyEmail(null);
    }
  };

  return (
    <div className="d-login">
      <main className="d-login__card" aria-labelledby="login-title">
        <Link to="/" className="d-brand" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>
          <img src="/tijarah-header.svg" alt="Tijarah - Smart Trade, Better Business" width="200" height="60" style={{ height: "46px", width: "auto" }} />
        </Link>
        <h1 id="login-title">Masuk ke Dashboard Tijarah</h1>

        {hashNotice && (
          <div
            style={{
              margin: "1rem 0",
              padding: "0.85rem 1rem",
              borderRadius: "var(--radius-md)",
              background: hashNotice.tone === "warn" ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)",
              border: hashNotice.tone === "warn" ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(239, 68, 68, 0.35)",
              color: "var(--color-ink)",
              fontSize: "0.85rem",
              lineHeight: 1.5,
              position: "relative"
            }}
            role="alert"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <strong style={{ color: hashNotice.tone === "warn" ? "var(--color-accent, #10B981)" : "#EF4444", display: "block", marginBottom: "0.25rem" }}>
                  {hashNotice.title}
                </strong>
                <span style={{ color: "var(--color-ink-muted, #94A3B8)" }}>{hashNotice.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setHashNotice(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-muted)",
                  padding: "2px",
                  lineHeight: 1
                }}
                aria-label="Tutup notifikasi"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        )}

        {profile && (
          <div className="d-login-session" role="status">
            <p className="d-login-session__text">
              Anda saat ini masuk sebagai <strong>{profile.full_name}</strong>
              <span className="d-role-chip" style={{ marginLeft: "0.5rem" }}>
                <span className="d-status-indicator" aria-hidden="true" />
                {ROLE_LEVEL[profile.role]} · {ROLE_LABEL[profile.role]}
              </span>
            </p>
            <div className="d-login-session__actions">
              <button
                type="button"
                className="d-btn d-btn--primary d-btn--sm"
                onClick={() => navigate(profile.role === "member" ? "/m" : "/app", { replace: true })}
              >
                Lanjut ke Dashboard
              </button>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await signOut();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Keluar / Ganti Akun
              </button>
            </div>
          </div>
        )}

        <form className="d-form" onSubmit={submit} noValidate>
          <div className="d-field">
            <label htmlFor="l-email">Email</label>
            <input
              id="l-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@domain.com"
              required
            />
          </div>
          <div className="d-field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="l-pass">Kata sandi</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <Link
                  to="/lupa-kata-sandi"
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--color-ink-muted, #64748b)",
                    textDecoration: "underline"
                  }}
                >
                  Lupa kata sandi?
                </Link>
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "var(--color-accent, #10B981)",
                    padding: "0 2px"
                  }}
                >
                  {showPass ? "Sembunyikan" : "Tampilkan"}
                </button>
              </div>
            </div>
            <input
              id="l-pass"
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi..."
              required={api?.mode !== "demo"}
            />
          </div>
          {err && <p className="d-field__error" role="alert">{err}</p>}
          {!err && problem && (
            <p className="d-field__error" role="alert">
              <strong>Pengaturan database.</strong> {problem}
            </p>
          )}
          {!err && !problem && blocked && (
            <p className="d-field__error" role="alert">
              <strong>Akses ditolak.</strong> {blocked} Hubungi pemilik bisnis Anda atau dukungan Tijarah.
            </p>
          )}

          <button type="submit" className="d-btn d-btn--primary d-btn--block" disabled={busy || !api}>
            {busy ? "Memeriksa…" : "Masuk"}
          </button>

          {/* Widget Checkbox Resmi Google reCAPTCHA v2 (Di Bawah Tombol Masuk) */}
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

          {/* Tautan Pendaftaran Akun Baru */}
          <div style={{ marginTop: "0.75rem", textAlign: "center", fontSize: "0.85rem", color: "var(--color-ink, #0f172a)" }}>
            <span style={{ color: "var(--color-ink-muted, #64748b)" }}>Belum memiliki akun? </span>
            <Link
              to="/registrasi"
              style={{
                color: "var(--color-accent, #059669)",
                fontWeight: 600,
                textDecoration: "underline"
              }}
            >
              Daftar
            </Link>
          </div>

          <div style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.72rem", color: "var(--color-ink-muted, #94a3b8)", lineHeight: "1.4" }}>
            <span>Situs ini dilindungi oleh Google reCAPTCHA. </span>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-ink-muted, #94a3b8)", textDecoration: "underline" }}>Privasi</a>
            <span> &amp; </span>
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-ink-muted, #94a3b8)", textDecoration: "underline" }}>Persyaratan</a>
          </div>
        </form>

        {import.meta.env.DEV && api?.mode === "supabase" && (
          <section className="d-demo" aria-labelledby="dev-title">
            <p id="dev-title" className="d-eyebrow">Dev · Supabase asli (1-Klik Masuk)</p>
            <ul>
              {DEV_ACCOUNTS.map(([em, r, label]) => {
                const demoPass = import.meta.env.VITE_DEMO_PASSWORD || "";
                const isLoggingIn = busyEmail === em;
                return (
                  <li key={em}>
                    <button
                      type="button"
                      className="d-demo__btn"
                      disabled={busy}
                      style={isLoggingIn ? { borderColor: "var(--color-accent, #10B981)", background: "rgba(16, 185, 129, 0.08)" } : undefined}
                      onClick={() => {
                        setBusyEmail(em);
                        setEmail(em);
                        setPassword(demoPass);
                        const isKlinik = r === "dokter" || label?.toLowerCase().includes("klinik");
                        const tenantId = (r === "superadmin") ? null : isKlinik ? "00000000-0000-0000-0000-000000000002" : "00000000-0000-0000-0000-000000000001";
                        const targetPillar = isKlinik ? "health" : (r === "superadmin" ? null : "fnb");
                        submit(null, {
                          email: em,
                          password: demoPass,
                          role: r,
                          full_name: label ?? ROLE_LABEL[r],
                          tenant_id: tenantId,
                          pillar: targetPillar,
                        });
                      }}
                    >
                      <span className="d-mono">{ROLE_LEVEL[r]}</span>
                      <span>{label ?? ROLE_LABEL[r]}</span>
                      <span className="d-muted d-mono">{isLoggingIn ? "Masuk…" : em.split("@")[0]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="d-text d-muted">
              Klik akun di atas untuk langsung masuk. Kata sandi otomatis terisi dari <code>DEMO_PASSWORD</code> di <code>.env.local</code>.
            </p>
          </section>
        )}

        {api?.mode === "demo" && (
          <section className="d-demo" aria-labelledby="demo-title">
            <p id="demo-title" className="d-eyebrow">Mode demo · data contoh di browser</p>
            <ul>
              {api.demoUsers.map((u) => (
                <li key={u.id}>
                  <button type="button" className="d-demo__btn" onClick={() => submit(null, { email: u.email, password: "" })}>
                    <span className="d-mono">{ROLE_LEVEL[u.role]}</span>
                    <span>{u.label ?? ROLE_LABEL[u.role]}</span>
                    {u.pin && <span className="d-muted d-mono">PIN {u.pin}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
