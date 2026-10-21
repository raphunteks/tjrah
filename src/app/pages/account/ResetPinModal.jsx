import { useState, useEffect } from "react";
import { Modal } from "../../ui/index.jsx";
import {
  generateAlphanumericOtp,
  sendPinResetOtp,
  saveUserPin
} from "../../../api/swallet.js";

/**
 * Modal Interaktif Reset PIN Transaksi 6-Digit via Kode OTP Alfanumerik
 * Saluran Pengiriman: Email Resmi atau Hermes WhatsApp
 * Format OTP: SW-XXXXXX (kombinasi 6 huruf kapital dan angka)
 */
export default function ResetPinModal({ open, onClose, user, api, onSuccess }) {
  const [step, setStep] = useState(1); // 1 = Pilih Saluran, 2 = Input OTP & PIN Baru
  const [channel, setChannel] = useState("email");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState("");

  const [otpInput, setOtpInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const targetEmail = user?.email || "owner@demo.tijarah.id";
  const defaultHermesPhone = (typeof import.meta !== "undefined" && import.meta.env?.VITE_HERMES_DEFAULT_PHONE) || "6285256739684";
  const targetPhone = user?.phone || user?.whatsapp_owner || defaultHermesPhone;
  const userName = user?.full_name || user?.name || user?.email?.split("@")[0] || "Pemilik Akun";

  // Hitung mundur resend OTP
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Reset state saat modal dibuka/ditutup
  useEffect(() => {
    if (open) {
      setStep(1);
      setNotice(null);
      setError("");
      setOtpInput("");
      setNewPin("");
      setConfirmPin("");
      setIsSubmitting(false);
    }
  }, [open]);

  // Handler input OTP fleksibel (menerima SW-XXXXXX atau XXXXXX)
  const handleOtpChange = (e) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (val.length > 9) val = val.slice(0, 9);
    setOtpInput(val);
  };

  // Eksekusi pengiriman OTP
  const handleDispatchOtp = async (selectedChannel) => {
    setChannel(selectedChannel);
    setIsSending(true);
    setError("");
    setNotice(null);

    const otpCode = generateAlphanumericOtp();
    const expires = Date.now() + 5 * 60 * 1000;
    setGeneratedOtp(otpCode);
    setOtpExpiresAt(expires);

    const targetDestination = selectedChannel === "email" ? targetEmail : targetPhone;

    const res = await sendPinResetOtp({
      channel: selectedChannel,
      target: targetDestination,
      otpCode,
      userName
    });

    setIsSending(false);
    if (res.ok) {
      setNotice({
        type: "ok",
        msg: res.message,
        channel: selectedChannel,
        target: targetDestination
      });
      setResendCooldown(60);
      setStep(2);
    } else {
      setError(res.error || "Gagal mengirimkan kode OTP. Silakan coba kembali.");
    }
  };

  // Verifikasi OTP & Simpan PIN Baru
  const handleSubmitReset = (e) => {
    e.preventDefault();
    setError("");

    // 1. Validasi Kode OTP
    let cleanInputOtp = otpInput.trim().toUpperCase().replace(/\s+/g, "");
    if (!cleanInputOtp.startsWith("SW-") && !cleanInputOtp.startsWith("SW")) {
      cleanInputOtp = `SW-${cleanInputOtp}`;
    } else if (cleanInputOtp.startsWith("SW") && !cleanInputOtp.startsWith("SW-")) {
      cleanInputOtp = `SW-${cleanInputOtp.slice(2)}`;
    }

    if (!cleanInputOtp || cleanInputOtp === "SW-") {
      setError("Kode verifikasi OTP wajib diisi.");
      return;
    }

    if (Date.now() > otpExpiresAt) {
      setError("Kode OTP telah kedaluwarsa. Silakan klik 'Kirim Ulang OTP'.");
      return;
    }

    if (cleanInputOtp !== generatedOtp.toUpperCase()) {
      setError("Kode OTP salah atau tidak cocok. Silakan periksa kembali pesan masuk pada " + (channel === "email" ? "Email Resmi Anda." : "Hermes WhatsApp Anda."));
      return;
    }

    // 2. Validasi Format PIN Baru
    const cleanPin = newPin.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      setError("PIN Transaksi baru wajib terdiri dari tepat 6 angka.");
      return;
    }

    if (cleanPin !== confirmPin.replace(/\D/g, "")) {
      setError("Konfirmasi PIN baru tidak sesuai.");
      return;
    }

    setIsSubmitting(true);

    const saved = saveUserPin({
      userId: user?.id,
      email: user?.email,
      pin: cleanPin,
      api
    });

    setIsSubmitting(false);

    if (saved) {
      setNotice({
        type: "success",
        msg: "PIN Transaksi 6-Digit berhasil diperbarui dan siap digunakan untuk otorisasi transfer S-Wallet."
      });
      onSuccess?.(cleanPin);
      setTimeout(() => {
        onClose?.();
      }, 1600);
    } else {
      setError("Gagal menyimpan PIN baru ke sistem.");
    }
  };

  const isPinMatching = newPin.length === 6 && confirmPin.length === 6 && newPin === confirmPin;
  const isOtpValidLength = otpInput.trim().length >= 6;

  return (
    <Modal
      open={open}
      title="Reset PIN Transaksi S-Wallet"
      onClose={onClose}
      footer={
        step === 1 ? (
          <button type="button" className="d-btn d-btn--ghost" onClick={onClose} disabled={isSending}>
            Tutup
          </button>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "0.5rem" }}>
            <button
              type="button"
              className="d-btn d-btn--ghost d-btn--sm"
              onClick={() => handleDispatchOtp(channel)}
              disabled={resendCooldown > 0 || isSending}
            >
              <i className="fa-solid fa-rotate-right" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {resendCooldown > 0 ? `Kirim Ulang (${resendCooldown}s)` : "Kirim Ulang OTP"}
            </button>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={onClose} disabled={isSubmitting}>
                Batal
              </button>
              <button
                type="submit"
                form="swallet-reset-pin-form"
                className="tjr-pay-btn-primary"
                disabled={isSubmitting || !isOtpValidLength || !isPinMatching}
                title={!isPinMatching ? "PIN Baru dan Konfirmasi PIN wajib sama persis (6 digit)" : "Simpan PIN Baru"}
              >
                <i className="fa-solid fa-lock" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                {isSubmitting ? "Menyimpan PIN..." : "Simpan PIN Baru"}
              </button>
            </div>
          </div>
        )
      }
    >
      {/* ──────── TAHAP 1: PILIH SALURAN PENGIRIMAN OTP ──────── */}
      {step === 1 && (
        <div>
          <p className="d-text" style={{ margin: "0 0 1rem", fontSize: "0.88rem", color: "var(--color-ink)" }}>
            Pilih saluran pengiriman kode verifikasi OTP alfanumerik untuk mengatur ulang <strong>PIN Transaksi 6-Digit</strong> S-Wallet Anda:
          </p>

          {error && (
            <div className="d-alert d-alert--danger" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              <span>{error}</span>
            </div>
          )}

          <div className="swallet-otp-choice-grid">
            {/* OPSI 1: EMAIL RESMI */}
            <button
              type="button"
              className="swallet-otp-channel-card"
              onClick={() => handleDispatchOtp("email")}
              disabled={isSending}
            >
              <div className="swallet-otp-channel-icon is-email">
                <i className="fa-solid fa-envelope" aria-hidden="true" />
              </div>
              <h4 className="swallet-otp-channel-title">Kirim OTP via Email Resmi</h4>
              <span className="swallet-otp-channel-target">
                {targetEmail}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: 600, marginTop: "auto" }}>
                Gunakan Saluran Ini <i className="fa-solid fa-arrow-right" aria-hidden="true" style={{ marginLeft: "0.2rem" }} />
              </span>
            </button>

            {/* OPSI 2: HERMES WHATSAPP */}
            <button
              type="button"
              className="swallet-otp-channel-card"
              onClick={() => handleDispatchOtp("whatsapp")}
              disabled={isSending}
            >
              <div className="swallet-otp-channel-icon is-wa">
                <i className="fa-brands fa-whatsapp" aria-hidden="true" />
              </div>
              <h4 className="swallet-otp-channel-title">Kirim OTP via Hermes WhatsApp</h4>
              <span className="swallet-otp-channel-target">
                {targetPhone}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 600, marginTop: "auto" }}>
                Gunakan Saluran Ini <i className="fa-solid fa-arrow-right" aria-hidden="true" style={{ marginLeft: "0.2rem" }} />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ──────── TAHAP 2: VERIFIKASI OTP & INPUT PIN BARU ──────── */}
      {step === 2 && (
        <div>
          {/* BANNER NOTIFIKASI DISPATCH OTP (AMAN TANPA MEMBOCORKAN KODE KE LAYAR) */}
          <div className="d-alert d-alert--info" style={{ marginBottom: "1.25rem", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" style={{ color: "var(--brand-emerald)" }} />
              <strong>Kode OTP Berhasil Dikirimkan</strong>
            </div>
            <p style={{ margin: "0", fontSize: "0.84rem", lineHeight: 1.5 }}>
              Kode verifikasi telah dikirimkan ke <strong>{channel === "email" ? "Email Resmi" : "Hermes WhatsApp"}</strong> ({notice?.target}). Berlaku selama 5 menit.
            </p>
          </div>

          {error && (
            <div className="d-alert d-alert--danger" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              <span>{error}</span>
            </div>
          )}

          {notice?.type === "success" && (
            <div className="d-alert d-alert--success" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              <span>{notice.msg}</span>
            </div>
          )}

          <form id="swallet-reset-pin-form" onSubmit={handleSubmitReset} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="otp-input" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Kode OTP Verifikasi
              </label>
              <input
                id="otp-input"
                type="text"
                className="d-input"
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  letterSpacing: "2.5px",
                  textTransform: "uppercase"
                }}
                placeholder="SW-XXXXXX"
                maxLength={9}
                value={otpInput}
                onChange={handleOtpChange}
                autoFocus
                required
              />
              <span style={{ display: "block", marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--color-muted)" }}>
                Contoh format: <strong>SW-12AS44</strong> (Dapat disalin langsung dari pesan masuk email/WhatsApp).
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
              <div>
                <label htmlFor="new-pin-input" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                  PIN 6-Digit Baru
                </label>
                <input
                  id="new-pin-input"
                  type="password"
                  inputMode="numeric"
                  className="d-input"
                  placeholder="••••••"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm-pin-input" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                  Konfirmasi PIN Baru
                </label>
                <input
                  id="confirm-pin-input"
                  type="password"
                  inputMode="numeric"
                  className="d-input"
                  placeholder="••••••"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
