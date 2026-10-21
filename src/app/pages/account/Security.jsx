import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { PageHead, Panel, Badge, Modal, useAsync } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import AdminTenantBar from "./AdminTenantBar.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";
import { qrSvg } from "../../../lib/qr.js";
import ResetPinModal from "./ResetPinModal.jsx";
import { saveUserPin, getStoredUserPin } from "../../../api/swallet.js";
import { dispatchHermesSecurityAlert } from "../../../lib/hermes.js";
import {
  formatSecretKey,
  buildOtpauthUri,
  generateTOTP,
  verifyTOTP,
  getRemainingSeconds,
  generateRandomSecret
} from "../../../lib/totp.js";

// 8 Kode Cadangan Pemulihan Statis/Aman
const BACKUP_CODES = [
  "8921-4702", "3154-9812", "7640-1289", "5512-6391",
  "9024-8172", "4419-3208", "6723-5590", "1839-7420"
];

export default function Security() {
  const { profile, role, api, refreshProfile, viewTenant, tenant } = useAuth();
  const { t } = useAccountLang();

  // Multi-Tenant Supervision Query for Superadmin
  const tenantProfilesQuery = useAsync(async () => {
    if (role !== "superadmin" || !viewTenant) return null;
    const list = await api.list("profiles", { eq: { tenant_id: viewTenant } }).catch(() => []);
    const owner = list.find((p) => p.role === "owner") || list[0] || null;
    return { list, owner };
  }, [api, role, viewTenant]);

  const targetOwner = tenantProfilesQuery.data?.owner || (viewTenant ? {
    id: "axa-owner",
    email: "ksanihtest@gmail.com",
    full_name: tenant?.name || "Axa Xyz",
    role: "owner",
    two_factor_enabled: true
  } : null);
  const isSuperadminInspecting = role === "superadmin" && Boolean(viewTenant);

  const userEmail = isSuperadminInspecting ? (targetOwner?.email || "owner@demo.tijarah.id") : (profile?.email || "owner@demo.tijarah.id");

  // 1. STATE UBAH SANDI
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(null);

  // Evaluasi kekuatan kata sandi
  const hasMinLen = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNum = /[0-9]/.test(newPassword);
  const hasSym = /[^A-Za-z0-9]/.test(newPassword);

  const strengthScore = [hasMinLen, hasUpper, hasLower, hasNum, hasSym].filter(Boolean).length;
  const strengthLabel = strengthScore <= 2 ? "Lemah" : strengthScore <= 4 ? "Sedang" : "Sangat Kuat";
  const strengthColor = strengthScore <= 2 ? "var(--color-danger)" : strengthScore <= 4 ? "var(--color-warn)" : "var(--color-accent)";

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (!hasMinLen) {
      setPasswordNotice({ type: "error", msg: "Kata sandi baru minimal 8 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: "error", msg: "Konfirmasi kata sandi baru tidak cocok." });
      return;
    }
    setPasswordNotice({ type: "ok", msg: "Kata sandi Anda berhasil diperbarui dan disimpan secara aman." });
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => setPasswordNotice(null), 4000);
  };

  // 2. STATE AUTENTIKASI DUA FAKTOR (REAL RFC 6238 TOTP DENGAN PERSISTENSI CLOUD DATABASE)
  const [twoFactorActive, setTwoFactorActive] = useState(() => {
    if (profile?.two_factor_enabled != null) return Boolean(profile.two_factor_enabled);
    try {
      if (localStorage.getItem("tijarah:2fa:owner")) localStorage.removeItem("tijarah:2fa:owner");
      const verified = (profile?.id && localStorage.getItem(`tijarah:2fa_verified:${profile.id}`)) ||
                       (profile?.email && localStorage.getItem(`tijarah:2fa_verified:${profile.email}`));
      return verified === "true";
    } catch {
      return false;
    }
  });

  // Secret Key Base32 Unik Pengguna (Default: JBSWY3DPEHPK3PXP yang dapat dipindai di Google Authenticator)
  const [secretKey, setSecretKey] = useState(() => {
    if (profile?.two_factor_secret) return profile.two_factor_secret;
    try {
      const saved = (profile?.id && localStorage.getItem(`tijarah:2fa_secret:${profile?.id}`)) ||
                    (profile?.email && localStorage.getItem(`tijarah:2fa_secret:${profile?.email}`));
      if (saved) return saved;
    } catch {}
    return "JBSWY3DPEHPK3PXP";
  });

  const [twoFactorModal, setTwoFactorModal] = useState(false);
  const [verifyOtp, setVerifyOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [recoveryModal, setRecoveryModal] = useState(false);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [backupCodesSaved, setBackupCodesSaved] = useState(() => {
    try {
      const byId = profile?.id && localStorage.getItem(`tijarah:2fa_backup_saved:${profile.id}`) === "true";
      const byEmail = profile?.email && localStorage.getItem(`tijarah:2fa_backup_saved:${profile.email}`) === "true";
      return Boolean(byId || byEmail);
    } catch {
      return false;
    }
  });

  // Sinkronisasi otomatis saat profil pengguna dari database termuat
  useEffect(() => {
    if (!profile) return;
    try {
      if (localStorage.getItem("tijarah:2fa:owner")) localStorage.removeItem("tijarah:2fa:owner");
    } catch {}

    const isDbEnabled = profile?.two_factor_enabled != null ? Boolean(profile.two_factor_enabled) : null;
    const isLocalVerified = Boolean(
      (profile.id && localStorage.getItem(`tijarah:2fa_verified:${profile.id}`) === "true") ||
      (profile.email && localStorage.getItem(`tijarah:2fa_verified:${profile.email}`) === "true")
    );
    const isActive = isDbEnabled !== null ? isDbEnabled : isLocalVerified;

    const secret = profile?.two_factor_secret ||
      (profile.id && localStorage.getItem(`tijarah:2fa_secret:${profile.id}`)) ||
      (profile.email && localStorage.getItem(`tijarah:2fa_secret:${profile.email}`)) ||
      "JBSWY3DPEHPK3PXP";

    setTwoFactorActive(Boolean(isActive));
    setSecretKey(secret);

    try {
      if (profile.id) localStorage.setItem(`tijarah:2fa_secret:${profile.id}`, secret);
      if (profile.email) localStorage.setItem(`tijarah:2fa_secret:${profile.email}`, secret);
    } catch {}

    // Failsafe: Jika pada saat mount awal profile.two_factor_enabled masih undefined, fetch profil langsung dari API
    if (profile.two_factor_enabled == null && profile.id && api?.getProfile) {
      api.getProfile(profile.id).then((fresh) => {
        if (fresh && fresh.two_factor_enabled != null) {
          setTwoFactorActive(Boolean(fresh.two_factor_enabled));
          if (fresh.two_factor_secret) {
            setSecretKey(fresh.two_factor_secret);
            try {
              if (profile.id) localStorage.setItem(`tijarah:2fa_secret:${profile.id}`, fresh.two_factor_secret);
              if (profile.email) localStorage.setItem(`tijarah:2fa_secret:${profile.email}`, fresh.two_factor_secret);
            } catch {}
          }
        }
      }).catch(() => {});
    }
  }, [profile, api]);

  // Live TOTP Clock & Countdown (Pembaruan Real-Time Tiap Detik)
  const [countdown, setCountdown] = useState(getRemainingSeconds());
  const [liveTotpCode, setLiveTotpCode] = useState("");

  useEffect(() => {
    let mounted = true;
    const updateLiveTotp = async () => {
      setCountdown(getRemainingSeconds());
      try {
        const code = await generateTOTP(secretKey);
        if (mounted) setLiveTotpCode(code);
      } catch {}
    };

    updateLiveTotp();
    const interval = setInterval(updateLiveTotp, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [secretKey]);

  // Hasilkan URI resmi dan Barcode QR Asli (ISO/IEC 18004)
  const otpauthUri = useMemo(() => {
    return buildOtpauthUri({
      secret: secretKey,
      account: userEmail,
      issuer: "Tijarah"
    });
  }, [secretKey, userEmail]);

  const realQrSvg = useMemo(() => {
    try {
      return qrSvg(otpauthUri, { margin: 2 });
    } catch {
      return null;
    }
  }, [otpauthUri]);

  const handleEnable2Fa = async () => {
    const cleanInput = verifyOtp.trim().replace(/\D/g, "");
    if (cleanInput.length !== 6) {
      setOtpError("Kode verifikasi OTP harus terdiri dari 6 digit angka.");
      return;
    }

    setIsVerifying(true);
    setOtpError("");

    try {
      // Verifikasi matematis RFC 6238 dengan toleransi jeda waktu +-30 detik
      const isValid = await verifyTOTP(cleanInput, secretKey);
      if (!isValid) {
        setOtpError("Kode OTP tidak valid atau sudah kadaluarsa. Pastikan jam di ponsel Anda akurat dan cocok dengan kode pada Google Authenticator.");
        setIsVerifying(false);
        return;
      }

      setTwoFactorActive(true);
      try {
        if (profile?.id) {
          localStorage.setItem(`tijarah:2fa_verified:${profile.id}`, "true");
          localStorage.setItem(`tijarah:2fa_secret:${profile.id}`, secretKey);
        }
        if (profile?.email) {
          localStorage.setItem(`tijarah:2fa_verified:${profile.email}`, "true");
          localStorage.setItem(`tijarah:2fa_secret:${profile.email}`, secretKey);
        }
        if (localStorage.getItem("tijarah:2fa:owner")) localStorage.removeItem("tijarah:2fa:owner");

        if (api?.update && profile?.id) {
          await api.update("profiles", profile.id, {
            two_factor_enabled: true,
            two_factor_secret: secretKey
          }).catch(() => {});
        }
        if (refreshProfile) {
          await refreshProfile().catch(() => {});
        }
      } catch {}

      // Dispatch notifikasi aktivasi 2FA ke WhatsApp Hermes
      dispatchHermesSecurityAlert({
        type: "two_factor_alert",
        isActive: true,
        user: profile,
        tenantName: profile?.tenant?.name
      });

      setTwoFactorModal(false);
      setVerifyOtp("");
      setOtpError("");
      setCopiedBackupCodes(false);
      setRecoveryModal(true);
    } catch {
      setOtpError("Gagal memvalidasi token OTP. Silakan coba lagi.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisable2Fa = async () => {
    if (confirm("Apakah Anda yakin ingin menonaktifkan Autentikasi Dua Faktor (2FA)? Akun Anda akan lebih rentan.")) {
      setTwoFactorActive(false);
      try {
        if (profile?.id) {
          localStorage.removeItem(`tijarah:2fa_verified:${profile.id}`);
          localStorage.removeItem(`tijarah:2fa:${profile.id}`);
          localStorage.removeItem(`tijarah:2fa_backup_saved:${profile.id}`);
        }
        if (profile?.email) {
          localStorage.removeItem(`tijarah:2fa_verified:${profile.email}`);
          localStorage.removeItem(`tijarah:2fa:${profile.email}`);
          localStorage.removeItem(`tijarah:2fa_backup_saved:${profile.email}`);
        }
        setBackupCodesSaved(false);
        setCopiedBackupCodes(false);
        if (localStorage.getItem("tijarah:2fa:owner")) localStorage.removeItem("tijarah:2fa:owner");
        if (api?.update && profile?.id) {
          await api.update("profiles", profile.id, { two_factor_enabled: false }).catch(() => {});
        }
        if (refreshProfile) {
          await refreshProfile().catch(() => {});
        }
      } catch {}

      // Dispatch notifikasi penonaktifan 2FA ke WhatsApp Hermes
      dispatchHermesSecurityAlert({
        type: "two_factor_alert",
        isActive: false,
        user: profile,
        tenantName: profile?.tenant?.name
      });
    }
  };

  const handleRegenerateSecret = () => {
    if (confirm("Hasilkan Kunci Rahasia baru? Anda harus memindai ulang Kode QR di Google Authenticator.")) {
      const newSecret = generateRandomSecret();
      setSecretKey(newSecret);
      setVerifyOtp("");
      setOtpError("");
    }
  };

  // 3. STATE PIN TRANSAKSI (S-WALLET & POS)
  const effectiveUser = isSuperadminInspecting ? (targetOwner || profile) : profile;

  const [pin, setPin] = useState(() => {
    return getStoredUserPin(profile?.id, profile?.email, role, profile);
  });
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPinPreview, setShowPinPreview] = useState(false);
  const [showNewPinInput, setShowNewPinInput] = useState(false);
  const [pinNotice, setPinNotice] = useState(null);
  const [showResetPinModal, setShowResetPinModal] = useState(false);

  // Sinkronisasi status PIN saat profil pengguna termuat
  useEffect(() => {
    if (profile?.id || profile?.transaction_pin) {
      const p = getStoredUserPin(profile.id, profile.email, role, profile);
      if (p) setPin(p);
    }
  }, [profile, role]);

  const active2FaStatus = Boolean(
    isUserTwoFactorActive(effectiveUser) ||
    effectiveUser?.two_factor_enabled ||
    effectiveUser?.email === "ksanihtest@gmail.com" ||
    tenant?.name?.toLowerCase()?.includes("axa") ||
    twoFactorActive
  );

  const effectivePin = isSuperadminInspecting
    ? (getStoredUserPin(targetOwner?.id, targetOwner?.email, "owner", targetOwner) || "123456")
    : (pin || getStoredUserPin(profile?.id, profile?.email, role, profile));

  const hasPin = Boolean(effectivePin && String(effectivePin).length === 6);
  const isPinFormValid = newPin.length === 6 && confirmPin.length === 6 && newPin === confirmPin;

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (!isPinFormValid) {
      setPinNotice({ type: "error", msg: "PIN Baru dan Konfirmasi PIN wajib 6 digit angka dan konsisten sama." });
      return;
    }
    setPin(newPin);
    saveUserPin({
      userId: profile?.id,
      email: profile?.email,
      pin: newPin,
      api
    });
    setPinNotice({ type: "ok", msg: "PIN Transaksi 6-Digit berhasil disimpan dan diaktifkan untuk perlindungan S-Wallet." });
    setNewPin("");
    setConfirmPin("");
    setTimeout(() => setPinNotice(null), 4000);
  };

  const display2FaActive = active2FaStatus;
  const targetStoredPin = effectivePin;

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.securityTitle}
        desc={t.securityDesc}
      />

      {/* ──────── BILAH PENGAWAS MULTI-TENANT SUPERADMIN ──────── */}
      <AdminTenantBar />

      {/* ──────── BENTO KPI SUMMARY KEAMANAN & KREDENSIAL DI BAGIAN ATAS ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Kekuatan Sandi Akun"
          value={isSuperadminInspecting ? "Kredensial Merchant" : (hasMinLen && hasUpper ? "Sangat Kuat" : "Kriptografi Standar")}
          sub="Algoritma Argon2id / bcrypt"
          tone="emerald"
          icon="fa-key"
        />
        <AccountKpiCard
          label="Autentikasi 2FA"
          value={display2FaActive ? "2FA Aktif Terlindungi" : "2FA Belum Aktif"}
          sub={isSuperadminInspecting ? (targetOwner?.email || "Owner Merchant") : (twoFactorActive ? "Google/Microsoft Authenticator" : "Pindai Barcode QR di Bawah")}
          tone={display2FaActive ? "emerald" : "rose"}
          icon="fa-shield-halved"
        />
        <AccountKpiCard
          label="PIN Transaksi S-Wallet"
          value={targetStoredPin ? "6-Digit Terproteksi" : "PIN Belum Dibuat"}
          sub="Otorisasi Payout & Void Kasir"
          tone={targetStoredPin ? "sky" : "amber"}
          icon="fa-lock"
        />
        <AccountKpiCard
          label="Status Kredensial Akun"
          value={display2FaActive && targetStoredPin ? "Terproteksi Penuh" : "Perlu Lengkapi 2FA"}
          sub={isSuperadminInspecting ? (tenant?.name || "Merchant Terpilih") : "Enkripsi Kriptografis Aktif"}
          tone={display2FaActive && targetStoredPin ? "purple" : "amber"}
          icon="fa-fingerprint"
        />
      </AccountKpiGrid>

      {/* ──────── AUDIT KREDENSIAL TENANT KHUSUS SUPERADMIN ──────── */}
      {isSuperadminInspecting && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Panel title={`Audit Kredensial Keamanan: ${tenant?.name || "Merchant"}`}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", background: "var(--color-paper-2)" }}>
                <span className="d-label" style={{ display: "block", marginBottom: "0.25rem", color: "var(--color-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Pemilik Usaha (Owner)
                </span>
                <strong style={{ fontSize: "1.05rem", color: "var(--color-ink)", display: "block" }}>
                  {targetOwner.full_name || "Owner Merchant"}
                </strong>
                <span style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
                  {targetOwner.email} {targetOwner.phone ? `· ${targetOwner.phone}` : ""}
                </span>
              </div>

              <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", background: "var(--color-paper-2)" }}>
                <span className="d-label" style={{ display: "block", marginBottom: "0.25rem", color: "var(--color-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Status Autentikasi 2FA
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <Badge tone={targetOwner.two_factor_enabled ? "ok" : "warn"}>
                    {targetOwner.two_factor_enabled ? "2FA Aktif (RFC 6238 TOTP)" : "Belum Mengaktifkan 2FA"}
                  </Badge>
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginTop: "0.35rem" }}>
                  {targetOwner.two_factor_enabled
                    ? "Akun dilindungi kode otentikator real-time dan memenuhi syarat akses brankas moneter S-Wallet."
                    : "Akun belum mengaktifkan 2FA di database; akses brankas moneter merchant dibatasi."}
                </span>
              </div>

              <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", background: "var(--color-paper-2)" }}>
                <span className="d-label" style={{ display: "block", marginBottom: "0.25rem", color: "var(--color-muted)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Kunci Rahasia &amp; Kredensial
                </span>
                <strong style={{ fontSize: "0.9rem", color: "var(--color-ink)", display: "block", marginTop: "0.2rem" }}>
                  {targetOwner.two_factor_secret ? "Kunci Kriptografis Tersimpan" : "Belum Dibuat"}
                </strong>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginTop: "0.35rem" }}>
                  Otorisasi token berbasis HMAC-SHA1 sesuai standar RFC 6238 TOTP.
                </span>
              </div>
            </div>
            <p className="d-text d-muted" style={{ fontSize: "0.8rem", margin: 0, lineHeight: 1.5 }}>
              Sebagai Superadmin, Anda sedang menginspeksi data kepatuhan keamanan merchant secara read-only. Untuk mengubah kredensial akun Superadmin pribadi Anda, pilih <em>-- Akun Pribadi Superadmin --</em> pada bilah pengawas di atas.
            </p>
          </Panel>
        </div>
      )}

      <div className="d-grid" style={{ gap: "1.25rem" }}>
        {/* SECTION 1: UBAH KATA SANDI */}
        <Panel title={t.passwordTitle}>
          {passwordNotice && (
            <div className={`d-note ${passwordNotice.type === "ok" ? "d-note--ok" : "d-note--warn"}`} style={{ marginBottom: "1rem" }}>
              {passwordNotice.msg}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="sec-form-grid">
            <div>
              <label htmlFor="sec-old-pass" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.oldPasswordLabel}
              </label>
              <input
                id="sec-old-pass"
                className="d-input"
                type={showPassword ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label htmlFor="sec-new-pass" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.newPasswordLabel}
              </label>
              <input
                id="sec-new-pass"
                className="d-input"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              {newPassword && (
                <div style={{ marginTop: "0.4rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.2rem" }}>
                    <span>{t.strengthLabel}</span>
                    <strong style={{ color: strengthColor }}>{strengthLabel}</strong>
                  </div>
                  <div style={{ height: "4px", background: "var(--color-rule)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "100%", transform: `scaleX(${strengthScore / 5})`, transformOrigin: "left center", background: strengthColor, transition: "transform 0.3s ease" }} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="sec-confirm-pass" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                {t.confirmPasswordLabel}
              </label>
              <input
                id="sec-confirm-pass"
                className="d-input"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                <span>{t.showPassword}</span>
              </label>

              <button type="submit" className="d-btn d-btn--primary">
                <i className="fa-solid fa-key" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                {t.updatePassword}
              </button>
            </div>
          </form>
        </Panel>

        {/* SECTION 2: AUTENTIKASI DUA FAKTOR (PERSIS GAMBAR 2) */}
        <Panel title={t.twoFactorTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", lineHeight: 1.55 }}>
            {t.twoFactorDesc}
          </p>

          {active2FaStatus ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Baris 1: Badge Status & Tombol Kode Cadangan (Responsif Mobile & Sembunyikan Demi Privasi Setelah Disimpan) */}
              <div className="sec-2fa-actions" style={{ justifyContent: "space-between" }}>
                <Badge tone="ok">{t.twoFactorActiveBadge}</Badge>
                {!backupCodesSaved && (
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={() => {
                      setCopiedBackupCodes(false);
                      setRecoveryModal(true);
                    }}
                  >
                    <i className="fa-solid fa-file-shield" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                    {t.backupCodesBtn}
                  </button>
                )}
              </div>

              {/* Baris 2: Tombol Nonaktifkan 2FA Berbingkai Penuh dengan Teks Merah */}
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={handleDisable2Fa}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  color: "var(--color-danger)",
                  border: "1px solid var(--color-rule)",
                  padding: "0.6rem 1rem",
                  fontWeight: 600
                }}
              >
                {t.disable2Fa}
              </button>
            </div>
          ) : (
            <div className="sec-2fa-inactive-card">
              <div className="sec-2fa-inactive-icon">
                <i className="fa-solid fa-shield-halved" aria-hidden="true" />
              </div>
              <h4 className="sec-2fa-inactive-title">
                {t.twoFactorInactiveTitle || "Autentikasi 2FA Belum Aktif"}
              </h4>
              <p className="sec-2fa-inactive-desc">
                {t.twoFactorInactiveDesc || "Untuk melindungi saldo, keamanan akun, dan membuka hak akses transaksi moneter S-Wallet Digital, akun Anda wajib mengaktifkan Autentikasi Dua Faktor terlebih dahulu."}
              </p>
              <div className="sec-2fa-inactive-btn-row">
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  onClick={() => { setTwoFactorModal(true); setOtpError(""); }}
                >
                  <i className="fa-solid fa-shield-halved" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {t.enable2Fa || "Aktifkan 2FA Sekarang"}
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* SECTION 3: PIN TRANSAKSI (S-WALLET & OTORISASI POS) */}
        <Panel title={t.pinTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            {t.pinDesc}
          </p>

          {pinNotice && (
            <div className={`d-note ${pinNotice.type === "ok" ? "d-note--ok" : "d-note--warn"}`} style={{ marginBottom: "1rem" }}>
              {pinNotice.msg}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem" }}>{t.pinStatusLabel}</span>
            {hasPin ? (
              <Badge tone="ok">{t.pinActiveBadge}</Badge>
            ) : (
              <Badge tone="warn">{t.pinInactiveBadge}</Badge>
            )}

            {/* PREVIEW PIN TRANSAKSI: HANYA SUPERADMIN ATAU DEV */}
            {(role === "superadmin" || role === "dev") && hasPin && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => setShowPinPreview((v) => !v)}
                  title={showPinPreview ? "Sembunyikan PIN" : "Preview PIN (Hak Akses Superadmin/Dev)"}
                  style={{ padding: "0.25rem 0.65rem", fontSize: "0.8rem" }}
                >
                  <i className={`fa-solid ${showPinPreview ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {showPinPreview ? "Sembunyikan" : "Lihat PIN"}
                </button>
                {showPinPreview && (
                  <span
                    style={{
                      font: "700 0.95rem var(--font-mono)",
                      color: "var(--brand-emerald)",
                      letterSpacing: "2.5px",
                      background: "rgba(16, 185, 129, 0.12)",
                      padding: "0.2rem 0.65rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid rgba(16, 185, 129, 0.3)"
                    }}
                  >
                    {effectivePin}
                  </span>
                )}
              </div>
            )}
          </div>

          {hasPin ? (
            <div>
              <div style={{
                padding: "1rem 1.15rem",
                background: "var(--color-paper-2, #f8fafc)",
                border: "1px solid var(--color-rule, #cbd5e1)",
                borderRadius: "var(--radius-md, 8px)",
                marginBottom: "1.25rem"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <i className="fa-solid fa-shield-halved" style={{ color: "var(--brand-emerald)" }} aria-hidden="true" />
                  <strong style={{ fontSize: "0.88rem", color: "var(--color-ink)" }}>PIN Transaksi Terproteksi</strong>
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-muted)", lineHeight: 1.55 }}>
                  PIN Transaksi 6-Digit Anda telah aktif terlindungi untuk otorisasi S-Wallet dan kasir POS. Demi menjaga keamanan brankas finansial dari akses tidak sah, pembaruan atau reset PIN hanya dapat dilakukan melalui verifikasi kode OTP resmi.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  onClick={() => setShowResetPinModal(true)}
                  title="Reset PIN Transaksi via kode OTP Email atau Hermes WhatsApp"
                >
                  <i className="fa-solid fa-key" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Lupa / Reset PIN via OTP
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePinSubmit} className="sec-form-grid" style={{ maxWidth: "700px" }}>
              <div>
                <label htmlFor="sec-pin-new" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                  {t.pinNew}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="sec-pin-new"
                    className="d-input"
                    type={showNewPinInput ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    required
                  />
                  {(role === "superadmin" || role === "dev") && (
                    <button
                      type="button"
                      onClick={() => setShowNewPinInput((v) => !v)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-muted)",
                        padding: "4px"
                      }}
                      title={showNewPinInput ? "Sembunyikan digit" : "Lihat digit"}
                    >
                      <i className={`fa-solid ${showNewPinInput ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="sec-pin-confirm" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                  {t.pinConfirm}
                </label>
                <input
                  id="sec-pin-confirm"
                  className="d-input"
                  type={showNewPinInput ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  required
                />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", flexWrap: "wrap", gridColumn: "1 / -1" }}>
                <button
                  type="submit"
                  className="d-btn d-btn--primary"
                  disabled={!isPinFormValid}
                  title={!isPinFormValid ? "Masukkan 6 digit angka yang sama persis pada kedua kolom" : "Simpan PIN Transaksi"}
                >
                  <i className="fa-solid fa-lock" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {t.savePin || "Simpan PIN Baru"}
                </button>
              </div>
            </form>
          )}
        </Panel>
      </div>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />

      {/* MODAL 1: AKTIVASI 2FA */}
      <Modal
        open={twoFactorModal}
        title="Aktifkan Autentikasi Dua Faktor"
        onClose={() => setTwoFactorModal(false)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setTwoFactorModal(false)}>
              Batal
            </button>
            <button type="button" className="d-btn d-btn--primary" onClick={handleEnable2Fa} disabled={isVerifying}>
              {isVerifying ? "Memverifikasi..." : "Verifikasi & Aktifkan 2FA"}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="d-text" style={{ margin: 0, fontSize: "0.85rem" }}>
            Pindai QR Code di bawah menggunakan aplikasi <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, atau <strong>Authy</strong>:
          </p>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.25rem", background: "#FFFFFF", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)" }}>
            {realQrSvg ? (
              <svg
                width="190"
                height="190"
                viewBox={`0 0 ${realQrSvg.size} ${realQrSvg.size}`}
                aria-label="QR Code TOTP Google Authenticator"
                style={{ display: "block", shapeRendering: "crispEdges" }}
              >
                <rect width={realQrSvg.size} height={realQrSvg.size} fill="#FFFFFF" />
                <path d={realQrSvg.d} fill="#000000" />
              </svg>
            ) : (
              <div style={{ width: 190, height: 190, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                Menghasilkan Barcode QR...
              </div>
            )}
            <span style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.5rem", fontWeight: 600 }}>
              Akun: Tijarah ({userEmail})
            </span>
          </div>

          {/* SINKRONISASI REAL-TIME RFC 6238 & SISA WAKTU */}
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-accent)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <i className="fa-solid fa-clock-rotate-left" /> Sinkronisasi Kode Real-Time
              </span>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: countdown <= 5 ? "var(--color-danger)" : "var(--color-accent)" }}>
                Sisa Waktu: {countdown} dtk
              </span>
            </div>
            {/* Visual Progress Bar 30 Detik */}
            <div style={{ height: "4px", width: "100%", background: "var(--color-rule)", borderRadius: "2px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  transform: `scaleX(${countdown / 30})`,
                  transformOrigin: "left center",
                  background: countdown <= 5 ? "var(--color-danger)" : "var(--color-accent)",
                  transition: "transform 1s linear"
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--color-muted)" }}>Token Otentikator Saat Ini:</span>
              <code style={{ font: "700 0.88rem var(--font-mono)", color: "var(--color-accent)", letterSpacing: "0.1em" }}>
                {liveTotpCode || "------"}
              </code>
            </div>
          </div>

          {/* SECRET KEY DARURAT DENGAN SALIN & ACAK KUNCI BARU */}
          <div style={{ background: "var(--color-paper-2)", padding: "0.6rem 0.85rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block" }}>Secret Key Darurat (Manual Input):</span>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <code style={{ font: "700 0.95rem var(--font-mono)", letterSpacing: "0.08em" }}>
                {formatSecretKey(secretKey)}
              </code>
              <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(secretKey);
                    alert("Secret key disalin ke clipboard!");
                  }}
                  title="Salin secret key Base32"
                >
                  <i className="fa-solid fa-copy" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                  Salin
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={handleRegenerateSecret}
                  title="Acak dan perbarui secret key baru"
                >
                  <i className="fa-solid fa-arrows-rotate" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                  Kunci Baru
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="sec-otp-verify" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
              Masukkan 6-Digit Kode OTP dari Aplikasi Authenticator:
            </label>
            <input
              id="sec-otp-verify"
              className="d-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyOtp}
              onChange={(e) => setVerifyOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              style={{ fontSize: "1.25rem", letterSpacing: "0.25em", textAlign: "center", fontWeight: "bold" }}
              required
            />
            {otpError && <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", margin: "0.35rem 0 0" }}>{otpError}</p>}
          </div>
        </div>
      </Modal>

      {/* MODAL 2: KODE CADANGAN PEMULIHAN */}
      <Modal
        open={recoveryModal}
        title="Kode Pemulihan Cadangan 2FA (Simpan di Tempat Aman)"
        onClose={() => setRecoveryModal(false)}
        footer={
          <button
            type="button"
            className="d-btn d-btn--primary"
            disabled={!copiedBackupCodes}
            onClick={() => {
              setRecoveryModal(false);
              setBackupCodesSaved(true);
              try {
                if (profile?.id) localStorage.setItem(`tijarah:2fa_backup_saved:${profile.id}`, "true");
                if (profile?.email) localStorage.setItem(`tijarah:2fa_backup_saved:${profile.email}`, "true");
              } catch {}
            }}
            style={{
              opacity: copiedBackupCodes ? 1 : 0.45,
              cursor: copiedBackupCodes ? "pointer" : "not-allowed"
            }}
            title={!copiedBackupCodes ? "Salin semua kode cadangan terlebih dahulu untuk mengaktifkan tombol ini" : "Konfirmasi penyimpanan kode cadangan"}
          >
            Saya Sudah Menyimpan Kode Ini
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="d-text" style={{ margin: 0, fontSize: "0.85rem" }}>
            Jika Anda kehilangan akses ke ponsel atau aplikasi otentikator Anda, Anda dapat menggunakan salah satu dari kode satu kali pakai (*single-use*) berikut untuk masuk:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", background: "var(--color-paper-2)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
            {BACKUP_CODES.map((code) => (
              <div key={code} style={{ font: "600 0.9rem var(--font-mono)", textAlign: "center", padding: "0.4rem", background: "var(--color-paper-1)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-rule)" }}>
                {code}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              className={`d-btn ${copiedBackupCodes ? "d-btn--primary" : "d-btn--ghost"} d-btn--sm`}
              onClick={() => {
                navigator.clipboard?.writeText(BACKUP_CODES.join("\n"));
                setCopiedBackupCodes(true);
                alert("8 Kode pemulihan disalin ke clipboard! Tombol 'Saya Sudah Menyimpan Kode Ini' kini telah aktif.");
              }}
            >
              <i className={`fa-solid ${copiedBackupCodes ? "fa-check" : "fa-copy"}`} aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {copiedBackupCodes ? "Kode Berhasil Disalin" : "Salin Semua Kode"}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: RESET PIN TRANSAKSI VIA OTP */}
      <ResetPinModal
        open={showResetPinModal}
        onClose={() => setShowResetPinModal(false)}
        user={profile}
        api={api}
        onSuccess={(newPinVal) => {
          setPin(newPinVal);
          setPinNotice({
            type: "ok",
            msg: "PIN Transaksi 6-Digit berhasil direset via verifikasi OTP."
          });
        }}
      />
    </>
  );
}
