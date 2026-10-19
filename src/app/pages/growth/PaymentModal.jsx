import { useEffect, useMemo, useState } from "react";
import { rupiah } from "../../../lib/format.js";
import {
  PAYMENT_CHANNELS,
  calculateChannelFees,
  createPakasirTransaction,
  checkPakasirStatus,
  cancelPakasirTransaction,
  updateTransactionStatus,
  getPakasirConfig
} from "../../../api/pakasir.js";
import "../../../styles/dashboard.css";

export default function PaymentModal({ isOpen, onClose, plan, onSuccess, tenant, tenantId }) {
  if (!isOpen || !plan) return null;

  const [selectedMethod, setSelectedMethod] = useState("mandiri_va");
  const [fees, setFees] = useState({});
  const [loadingFees, setLoadingFees] = useState(true);
  const [referralCode, setReferralCode] = useState("");
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralApplied, setReferralApplied] = useState(false);
  const [referralNotice, setReferralNotice] = useState(null);

  const [stage, setStage] = useState("select"); // "select" | "instruction" | "success"
  const [busy, setBusy] = useState(false);
  const [txData, setTxData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedVa, setCopiedVa] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [countdownSec, setCountdownSec] = useState(15 * 60);

  const basePrice = Number(plan.price) || 2500000;
  const planDurationLabel = plan.durationLabel || `${plan.durationMonths || 6} bulan`;
  const isUpgrade = plan.code?.toLowerCase().includes("growth") || plan.code?.toLowerCase().includes("enterprise");
  const modalTitle = isUpgrade ? `Upgrade ke Langganan ${plan.name}` : `Berlangganan ${plan.name}`;

  const [cfg, setCfg] = useState(() => getPakasirConfig());

  // Hitung perkiraan biaya dari kalkulator fee Pakasir (dinamis / kustom)
  useEffect(() => {
    let active = true;

    const refreshFeeData = () => {
      setLoadingFees(true);
      calculateChannelFees(basePrice)
        .then((calc) => {
          if (active) {
            setFees(calc);
            setLoadingFees(false);
          }
        })
        .catch(() => {
          if (active) setLoadingFees(false);
        });
      setCfg(getPakasirConfig());
    };

    refreshFeeData();

    // Dengarkan event sinkronisasi dinamis dari Superadmin / Dev
    const handleFeesUpdated = () => {
      refreshFeeData();
    };

    window.addEventListener("tijarah:fees_updated", handleFeesUpdated);
    return () => {
      active = false;
      window.removeEventListener("tijarah:fees_updated", handleFeesUpdated);
    };
  }, [basePrice]);

  // Hitung mundur untuk layar instruksi
  useEffect(() => {
    if (stage !== "instruction") return;
    const interval = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const activeChannel = useMemo(() => {
    return PAYMENT_CHANNELS.find((c) => c.id === selectedMethod) || PAYMENT_CHANNELS[0];
  }, [selectedMethod]);

  const gatewayFee = fees[selectedMethod] != null ? fees[selectedMethod] : activeChannel.defaultFee;
  const feePaidByCustomer =
    cfg.feePayer === "merchant"
      ? 0
      : cfg.feePayer === "split"
      ? Math.round(gatewayFee / 2)
      : gatewayFee;
  const totalAmount = Math.max(0, basePrice - referralDiscount + feePaidByCustomer);

  const handleApplyReferral = (e) => {
    e.preventDefault();
    const code = referralCode.trim().toUpperCase();
    if (!code) {
      setReferralNotice({ tone: "error", text: "Silakan masukkan kode referral." });
      return;
    }
    // Diskon standar 10% jika kode referral dimasukkan
    const disc = Math.round(basePrice * 0.1);
    setReferralDiscount(disc);
    setReferralApplied(true);
    setReferralNotice({
      tone: "ok",
      text: `Kode "${code}" berhasil diterapkan! Diskon 10% (- ${rupiah(disc)}) telah dipotong.`
    });
  };

  const handleProceedPayment = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const orderId = `INV-${Date.now().toString().slice(-8)}-${(tenantId || "T1").slice(-2)}`;
      const customerInfo = {
        tenantName: tenant?.name || "Kopi Harum Makassar",
        tenantId: tenantId || "T1",
        planCode: plan.code,
        planName: plan.name,
      };

      const res = await createPakasirTransaction({
        orderId,
        method: selectedMethod,
        amount: totalAmount,
        customerInfo
      });

      setTxData(res);
      setCountdownSec(selectedMethod === "qris" ? 15 * 60 : 24 * 3600);
      setStage("instruction");
    } catch (err) {
      setErrorMsg(err.message || "Gagal memproses transaksi ke gateway Pakasir.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!txData) return;
    setBusy(true);
    try {
      const res = await checkPakasirStatus(txData.txn_id, txData.order_id);
      if (res.status === "completed" || res.status === "paid") {
        setStage("success");
        if (onSuccess) onSuccess(txData);
      } else {
        alert("Pembayaran belum terdeteksi. Silakan selesaikan pembayaran terlebih dahulu.");
      }
    } catch (err) {
      alert("Gagal memeriksa status: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSimulatePaid = () => {
    if (!txData) return;
    updateTransactionStatus(txData.order_id, "completed", new Date().toISOString());
    setStage("success");
    if (onSuccess) onSuccess({ ...txData, status: "completed" });
  };

  const handleCancelPayment = async () => {
    if (txData?.txn_id) {
      await cancelPakasirTransaction(txData.txn_id, txData.order_id).catch(() => {});
    }
    onClose();
  };

  const formatCountdown = (totalSec) => {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
      return `${hours}j ${mins}m ${secs}d`;
    }
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        overflowY: "auto"
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "var(--radius-xl, 16px)",
          maxWidth: "540px",
          width: "100%",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          color: "var(--color-ink, #0f172a)"
        }}
      >
        {/* HEADER MODAL */}
        <div
          style={{
            padding: "1.25rem 1.5rem 0.75rem",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--color-rule, #e2e8f0)"
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--color-ink, #0f172a)" }}>
              {stage === "success" ? "Pembayaran Dikonfirmasi" : modalTitle}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--color-muted, #64748b)" }}>
              {stage === "success"
                ? "Paket langganan toko Anda telah resmi diperpanjang"
                : `${planDurationLabel} · sekali bayar`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "1.25rem",
              padding: "4px 8px",
              lineHeight: 1
            }}
            aria-label="Tutup modal"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {/* KONTEN BODY MODAL */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {errorMsg && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                borderRadius: "8px",
                padding: "0.65rem 0.85rem",
                fontSize: "0.82rem",
                marginBottom: "1rem"
              }}
            >
              <strong>Perhatian:</strong> {errorMsg}
            </div>
          )}

          {/* TAHAP 1: PILIH METODE PEMBAYARAN */}
          {stage === "select" && (
            <>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "var(--color-muted, #64748b)",
                  textTransform: "uppercase",
                  marginBottom: "0.75rem"
                }}
              >
                Metode Pembayaran
              </div>

              {/* LIST CHANNEL PEMBAYARAN SESUAI GAMBAR 1 & 2 */}
              <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }}>
                {PAYMENT_CHANNELS.map((ch) => {
                  const isSel = selectedMethod === ch.id;
                  const channelFee = fees[ch.id] != null ? fees[ch.id] : ch.defaultFee;
                  return (
                    <div
                      key={ch.id}
                      className={`tjr-pay-channel-card ${isSel ? "tjr-pay-channel-card--active" : ""}`}
                      onClick={() => setSelectedMethod(ch.id)}
                      role="radio"
                      aria-checked={isSel}
                      tabIndex={0}
                    >
                      <div className="tjr-pay-channel-left">
                        <div className="tjr-pay-channel-logo-wrap">
                          <img src={ch.icon} alt={ch.name} className="tjr-pay-channel-logo" />
                        </div>
                        <div className="tjr-pay-channel-info">
                          <span className="tjr-pay-channel-name">{ch.name}</span>
                          <span className="tjr-pay-channel-fee">
                            {cfg.feePayer === "merchant"
                              ? "Gratis (Biaya Ditanggung)"
                              : cfg.feePayer === "split"
                              ? `Biaya ${rupiah(Math.round(channelFee / 2))} (Subsidi 50%)`
                              : `Biaya ${rupiah(channelFee)}`}
                          </span>
                        </div>
                      </div>
                      <div className="tjr-pay-radio-dot">
                        {isSel && <div className="tjr-pay-radio-inner" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BAGIAN KODE REFERRAL (SESUAI GAMBAR 2) */}
              <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--color-rule, #e2e8f0)" }}>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: "var(--color-muted, #64748b)",
                    textTransform: "uppercase",
                    marginBottom: "0.5rem"
                  }}
                >
                  Kode Referral
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <i
                      className="fa-solid fa-ticket"
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#94a3b8",
                        fontSize: "0.85rem"
                      }}
                    />
                    <input
                      type="text"
                      placeholder="KODE REFERRAL (OPSIONAL)"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      disabled={referralApplied}
                      style={{
                        width: "100%",
                        padding: "0.55rem 0.75rem 0.55rem 34px",
                        borderRadius: "var(--radius-full, 9999px)",
                        border: "1px solid var(--color-rule, #cbd5e1)",
                        fontSize: "0.82rem",
                        letterSpacing: "0.03em"
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyReferral}
                    disabled={referralApplied}
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid var(--color-rule, #cbd5e1)",
                      borderRadius: "var(--radius-full, 9999px)",
                      padding: "0.55rem 1.25rem",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                      cursor: referralApplied ? "not-allowed" : "pointer",
                      color: "var(--color-ink, #0f172a)"
                    }}
                  >
                    {referralApplied ? "Diterapkan" : "Terapkan"}
                  </button>
                </div>

                {referralNotice && (
                  <p
                    style={{
                      margin: "0.4rem 0 0",
                      fontSize: "0.75rem",
                      color: referralNotice.tone === "ok" ? "#0b5d4b" : "#b91c1c",
                      fontWeight: 500
                    }}
                  >
                    {referralNotice.text}
                  </p>
                )}

                <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--color-muted, #64748b)" }}>
                  Jika kode referral kamu memenuhi syarat, diskon dipotong otomatis dari tagihan.
                </p>
              </div>

              {/* RINCIAN TAGIHAN (SESUAI GAMBAR 2) */}
              <div
                style={{
                  marginTop: "1.25rem",
                  paddingTop: "1rem",
                  borderTop: "1px solid var(--color-rule, #e2e8f0)",
                  fontSize: "0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.4rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted, #64748b)" }}>
                  <span>{plan.name} · {planDurationLabel}</span>
                  <span style={{ fontWeight: 600, color: "var(--color-ink, #0f172a)" }}>{rupiah(basePrice)}</span>
                </div>

                {referralDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#0b5d4b" }}>
                    <span>Diskon Referral (10%)</span>
                    <span style={{ fontWeight: 600 }}>- {rupiah(referralDiscount)}</span>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted, #64748b)" }}>
                  <span>
                    Biaya {activeChannel.name}
                    {cfg.feePayer === "merchant" ? " (Ditanggung)" : cfg.feePayer === "split" ? " (Subsidi 50%)" : ""}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: feePaidByCustomer === 0 ? "#16a34a" : "var(--color-ink, #0f172a)"
                    }}
                  >
                    {feePaidByCustomer === 0 ? "Gratis" : rupiah(feePaidByCustomer)}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginTop: "0.6rem",
                    paddingTop: "0.75rem",
                    borderTop: "1px solid var(--color-rule, #e2e8f0)"
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Total dibayar hari ini</span>
                  <span style={{ fontWeight: 800, fontSize: "1.35rem", color: "var(--color-ink, #0f172a)" }}>
                    {rupiah(totalAmount)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* TAHAP 2: INSTRUKSI PEMBAYARAN */}
          {stage === "instruction" && txData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center" }}>
              <div
                style={{
                  background: "#fffaf0",
                  border: "1px solid #fed7aa",
                  color: "#c2410c",
                  borderRadius: "var(--radius-full, 9999px)",
                  padding: "4px 14px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem"
                }}
              >
                <i className="fa-solid fa-clock" aria-hidden="true" />
                Sisa Waktu Pembayaran: {formatCountdown(countdownSec)}
              </div>

              {/* JIKA METODE QRIS */}
              {selectedMethod === "qris" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      background: "#FFFFFF",
                      padding: "12px",
                      borderRadius: "12px",
                      border: "2px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)"
                    }}
                  >
                    {/* Render QR image menggunakan online generator untuk string qris resmi */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(txData.qr_string || "00020101021226")}`}
                      alt="QRIS Tijarah"
                      style={{ width: "200px", height: "200px", display: "block" }}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--color-muted, #64748b)" }}>
                    Pindai QRIS di atas melalui BCA Mobile, GoPay, OVO, ShopeePay, DANA, atau Livin' Mandiri.
                  </p>
                </div>
              ) : (
                /* JIKA METODE VIRTUAL ACCOUNT */
                <div style={{ width: "100%", textAlign: "left", background: "#f8fafc", borderRadius: "12px", padding: "1rem", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div className="tjr-pay-channel-logo-wrap" style={{ width: "42px", height: "32px" }}>
                      <img src={activeChannel.icon} alt={activeChannel.name} className="tjr-pay-channel-logo" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{activeChannel.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Virtual Account Otomatis</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                      Nomor Virtual Account
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                      <span style={{ font: "800 1.25rem var(--font-mono, monospace)", color: "#0f172a" }}>
                        {txData.va_number || "88091234567890"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(txData.va_number || "88091234567890");
                          setCopiedVa(true);
                          setTimeout(() => setCopiedVa(false), 2000);
                        }}
                        className="d-btn d-btn--ghost d-btn--sm"
                        style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                      >
                        {copiedVa ? "Tersalin!" : "Salin"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                      Total Pembayaran Pas
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                      <span style={{ font: "800 1.15rem var(--font-mono, monospace)", color: "#f97316" }}>
                        {rupiah(txData.total_payment || totalAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(txData.total_payment || totalAmount));
                          setCopiedAmount(true);
                          setTimeout(() => setCopiedAmount(false), 2000);
                        }}
                        className="d-btn d-btn--ghost d-btn--sm"
                        style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                      >
                        {copiedAmount ? "Tersalin!" : "Salin"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: "0.8rem", color: "#64748b", background: "#f1f5f9", padding: "0.6rem 0.85rem", borderRadius: "8px", width: "100%" }}>
                No. Order: <strong>{txData.order_id}</strong> &bull; Gateway: Pakasir Cloud
              </div>

              {/* TOMBOL SIMULASI CEPAT UNTUK DEMO & DEV */}
              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={busy}
                  style={{
                    flex: 1,
                    background: "#0f172a",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "var(--radius-full, 9999px)",
                    padding: "0.65rem 1rem",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer"
                  }}
                >
                  <i className="fa-solid fa-arrows-rotate" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {busy ? "Memeriksa..." : "Cek Status Pembayaran"}
                </button>
                <button
                  type="button"
                  onClick={handleSimulatePaid}
                  title="Simulasi Lunas Instan untuk lingkungan pengujian dev"
                  style={{
                    background: "#10b981",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "var(--radius-full, 9999px)",
                    padding: "0.65rem 0.85rem",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap"
                  }}
                >
                  Simulasi Bayar Lunas
                </button>
              </div>
            </div>
          )}

          {/* TAHAP 3: PEMBAYARAN SUKSES */}
          {stage === "success" && (
            <div style={{ textAlign: "center", padding: "1.5rem 0.5rem" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "#ecfdf5",
                  color: "#059669",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.75rem",
                  margin: "0 auto 1rem"
                }}
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
              </div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
                Pembayaran Berhasil!
              </h3>
              <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.5 }}>
                Terima kasih! Langganan <strong>{plan.name}</strong> untuk toko Anda telah aktif dan kuota AI langsung ditambahkan ke akun. Faktur kuitansi resmi telah dicatat ke riwayat tagihan.
              </p>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "var(--color-accent, #0b5d4b)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "var(--radius-full, 9999px)",
                  padding: "0.65rem 2rem",
                  fontWeight: 700,
                  fontSize: "0.88rem",
                  cursor: "pointer"
                }}
              >
                Tutup &amp; Perbarui Dashboard
              </button>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS MODAL (TAHAP 1) */}
        {stage === "select" && (
          <div
            style={{
              padding: "0.85rem 1.5rem 1.25rem",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              background: "#FFFFFF",
              borderTop: "1px solid var(--color-rule, #e2e8f0)"
            }}
          >
            <button
              type="button"
              onClick={handleCancelPayment}
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--color-rule, #cbd5e1)",
                borderRadius: "var(--radius-full, 9999px)",
                padding: "0.65rem 1.5rem",
                fontWeight: 600,
                fontSize: "0.88rem",
                color: "var(--color-ink, #0f172a)",
                cursor: "pointer"
              }}
            >
              Batalkan
            </button>
            <button
              type="button"
              onClick={handleProceedPayment}
              disabled={busy || loadingFees}
              style={{
                background: "#f97316",
                border: "none",
                borderRadius: "var(--radius-full, 9999px)",
                padding: "0.65rem 1.75rem",
                fontWeight: 700,
                fontSize: "0.88rem",
                color: "#FFFFFF",
                boxShadow: "0 4px 12px rgba(249, 115, 22, 0.28)",
                cursor: busy || loadingFees ? "not-allowed" : "pointer"
              }}
            >
              {busy ? "Menghubungkan..." : `Bayar ${rupiah(totalAmount)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
