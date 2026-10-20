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
import { getWalletProfile, paySubscriptionWithWallet } from "../../../api/swallet.js";
import "../../../styles/dashboard.css";

export default function PaymentModal({ isOpen, onClose, plan, onSuccess, tenant, tenantId }) {
  if (!isOpen || !plan) return null;

  const [selectedMethod, setSelectedMethod] = useState("swallet");
  const [swallet, setSwallet] = useState(null);
  const [swalletPin, setSwalletPin] = useState("");
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

  // Hitung perkiraan biaya dari kalkulator fee gateway (dinamis / kustom)
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

  // Hitung mundur dan Auto-Polling Status Pembayaran Real-Time (Gateway Live & Sandbox)
  useEffect(() => {
    if (stage !== "instruction" || !txData) return;

    // 1. Timer hitung mundur kadaluarsa pembayaran
    const intervalCountdown = setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    // 2. Auto-polling status ke API gateway tiap 3.5 detik (Real-Time Detection)
    let checking = false;
    const intervalPoll = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await checkPakasirStatus(txData.txn_id, txData.order_id);
        if (res.status === "completed" || res.status === "paid") {
          setStage("success");
          if (onSuccess) onSuccess({ ...txData, ...res, status: "completed" });
        }
      } catch {
        // Lanjutkan polling di interval berikutnya
      } finally {
        checking = false;
      }
    }, 3500);

    // 3. Listener event real-time jika pembayaran diselesaikan di tab lain atau simulasi webhook
    const handleTxnUpdated = () => {
      try {
        const raw = localStorage.getItem("tijarah:pakasir_transactions");
        if (raw) {
          const list = JSON.parse(raw);
          const found = list.find((t) => t.order_id === txData.order_id);
          if (found && (found.status === "completed" || found.status === "paid")) {
            setStage("success");
            if (onSuccess) onSuccess({ ...txData, ...found, status: "completed" });
          }
        }
      } catch {}
    };
    window.addEventListener("tijarah:fees_updated", handleTxnUpdated);

    return () => {
      clearInterval(intervalCountdown);
      clearInterval(intervalPoll);
      window.removeEventListener("tijarah:fees_updated", handleTxnUpdated);
    };
  }, [stage, txData, onSuccess]);

  // Load S-Wallet saldo merchant
  useEffect(() => {
    let active = true;
    getWalletProfile(null, tenantId || "owner-demo").then((w) => {
      if (active) setSwallet(w);
    });
    return () => {
      active = false;
    };
  }, [tenantId]);

  const activeChannel = useMemo(() => {
    if (selectedMethod === "swallet") {
      return { id: "swallet", name: "S-Wallet Saldo Merchant", defaultFee: 0 };
    }
    return PAYMENT_CHANNELS.find((c) => c.id === selectedMethod) || PAYMENT_CHANNELS[0];
  }, [selectedMethod]);

  const gatewayFee = selectedMethod === "swallet" ? 0 : (fees[selectedMethod] != null ? fees[selectedMethod] : activeChannel.defaultFee);
  const feePaidByCustomer =
    selectedMethod === "swallet" || cfg.feePayer === "merchant"
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
      if (selectedMethod === "swallet") {
        const bal = swallet?.balance ?? 0;
        if (bal < totalAmount) {
          throw new Error(`Saldo S-Wallet Anda (${rupiah(bal)}) tidak mencukupi untuk pembayaran sebesar ${rupiah(totalAmount)}. Silakan top-up terlebih dahulu di menu Akun > S-Wallet.`);
        }
        if (!swalletPin || swalletPin.length < 6) {
          throw new Error("Silakan masukkan 6 digit PIN S-Wallet untuk memproses pembayaran.");
        }
        const payRes = await paySubscriptionWithWallet({
          userId: tenantId || "owner-demo",
          amount: totalAmount,
          planName: plan.name,
          planCode: plan.code,
          pin: swalletPin
        });
        if (!payRes.ok) {
          throw new Error(payRes.error || "Gagal memproses pembayaran via S-Wallet.");
        }
        const completedTx = {
          order_id: payRes.ref_no,
          txn_id: payRes.ref_no,
          method: "swallet",
          amount: totalAmount,
          status: "completed",
          created_at: new Date().toISOString()
        };
        setTxData(completedTx);
        setStage("success");
        if (onSuccess) onSuccess(completedTx);
        return;
      }

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
      setErrorMsg(err.message || "Gagal memproses transaksi ke gateway pembayaran digital.");
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
    <div className="tjr-modal-backdrop" role="dialog" aria-modal="true">
      <div className="tjr-modal-dialog">
        {/* HEADER MODAL */}
        <div className="tjr-modal-header">
          <div>
            <h2 className="tjr-modal-title">
              {stage === "success" ? "Pembayaran Dikonfirmasi" : modalTitle}
            </h2>
            <p className="tjr-modal-subtitle">
              {stage === "success"
                ? "Paket langganan toko Anda telah resmi diperpanjang"
                : `${planDurationLabel} · sekali bayar`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tjr-modal-close"
            aria-label="Tutup modal"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {/* KONTEN BODY MODAL */}
        <div className="tjr-modal-body">
          {errorMsg && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 1rem",
                fontSize: "0.85rem",
                marginBottom: "1rem"
              }}
            >
              <strong>Perhatian:</strong> {errorMsg}
            </div>
          )}

          {/* TAHAP 1: PILIH METODE PEMBAYARAN */}
          {stage === "select" && (
            <>
              <div className="tjr-pay-section-label">
                Metode Pembayaran
              </div>

              {/* LIST CHANNEL PEMBAYARAN RESMI GATEWAY DIGITAL */}
              <div style={{ maxHeight: "320px", overflowY: "auto", paddingRight: "4px" }}>
                {/* KELOMPOK 0: S-WALLET MERCHANT (REKOMENDASI INSTAN) */}
                <div className="tjr-pay-section-label">
                  Dompet Digital S-Wallet (Instan &amp; Bebas Biaya)
                </div>
                <div className="tjr-pay-channel-list">
                  <div
                    className={`tjr-pay-channel-row ${selectedMethod === "swallet" ? "tjr-pay-channel-row--active" : ""}`}
                    onClick={() => setSelectedMethod("swallet")}
                    role="radio"
                    aria-checked={selectedMethod === "swallet"}
                    tabIndex={0}
                  >
                    <div className="tjr-pay-channel-left">
                      <div className="tjr-pay-channel-logo-wrap" style={{ background: "var(--brand-emerald-surface)", color: "var(--brand-emerald)" }}>
                        <i className="fa-solid fa-wallet" style={{ fontSize: "1.15rem" }} aria-hidden="true" />
                      </div>
                      <div className="tjr-pay-channel-info">
                        <span className="tjr-pay-channel-name">S-Wallet Saldo Merchant</span>
                        <span className="tjr-pay-channel-fee" style={{ color: "var(--brand-emerald)", fontWeight: 600 }}>
                          Saldo: {rupiah(swallet?.balance ?? 0)} · Bebas Biaya Admin
                        </span>
                      </div>
                    </div>
                    <div className="tjr-pay-radio-dot">
                      {selectedMethod === "swallet" && <div className="tjr-pay-radio-inner" />}
                    </div>
                  </div>
                </div>

                {selectedMethod === "swallet" && (
                  <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "0.85rem", marginTop: "0.5rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 600 }}>Status Saldo:</span>
                      {(swallet?.balance ?? 0) >= totalAmount ? (
                        <span style={{ fontSize: "0.75rem", background: "var(--brand-emerald-surface)", color: "var(--brand-emerald)", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                          Saldo Mencukupi
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.75rem", background: "#fef2f2", color: "#b91c1c", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                          Saldo Kurang
                        </span>
                      )}
                    </div>
                    <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-ink)", marginBottom: "0.35rem" }}>
                      Otorisasi PIN Transaksi S-Wallet (6 Digit)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Masukkan 6 Digit PIN"
                      value={swalletPin}
                      onChange={(e) => setSwalletPin(e.target.value.replace(/\D/g, ""))}
                      className="swallet-code-input"
                      style={{ width: "100%", height: "40px", fontSize: "1.1rem", letterSpacing: "0.2em", textAlign: "center" }}
                    />
                  </div>
                )}

                {/* KELOMPOK 1: INSTAN & DIGITAL */}
                <div className="tjr-pay-section-label" style={{ marginTop: "1rem" }}>
                  Instan &amp; Digital
                </div>
                <div className="tjr-pay-channel-list">
                  {PAYMENT_CHANNELS.filter((ch) => ch.type === "qris" || ch.type === "link").map((ch) => {
                    const isSel = selectedMethod === ch.id;
                    const channelFee = fees[ch.id] != null ? fees[ch.id] : ch.defaultFee;
                    return (
                      <div
                        key={ch.id}
                        className={`tjr-pay-channel-row ${isSel ? "tjr-pay-channel-row--active" : ""}`}
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

                {/* KELOMPOK 2: VIRTUAL ACCOUNT BANK */}
                <div className="tjr-pay-section-label" style={{ marginTop: "1rem" }}>
                  Virtual Account Bank Otomatis
                </div>
                <div className="tjr-pay-channel-list">
                  {PAYMENT_CHANNELS.filter((ch) => ch.type === "va").map((ch) => {
                    const isSel = selectedMethod === ch.id;
                    const channelFee = fees[ch.id] != null ? fees[ch.id] : ch.defaultFee;
                    return (
                      <div
                        key={ch.id}
                        className={`tjr-pay-channel-row ${isSel ? "tjr-pay-channel-row--active" : ""}`}
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
              </div>

              {/* BAGIAN KODE REFERRAL */}
              <div className="tjr-referral-wrap">
                <div className="tjr-pay-section-label">
                  Kode Referral
                </div>

                <div className="tjr-referral-input-group">
                  <div className="tjr-referral-input-wrap">
                    <i
                      className="fa-solid fa-ticket tjr-referral-input-icon"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      placeholder="KODE REFERRAL (OPSIONAL)"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value)}
                      disabled={referralApplied}
                      className="tjr-referral-input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyReferral}
                    disabled={referralApplied}
                    className="tjr-referral-btn"
                  >
                    {referralApplied ? "Diterapkan" : "Terapkan"}
                  </button>
                </div>

                {referralNotice && (
                  <p
                    style={{
                      margin: "0.4rem 0 0",
                      fontSize: "0.78rem",
                      color: referralNotice.tone === "ok" ? "var(--brand-emerald)" : "var(--color-danger)",
                      fontWeight: 600
                    }}
                  >
                    {referralNotice.text}
                  </p>
                )}

                <p className="tjr-referral-hint">
                  Jika kode referral kamu memenuhi syarat, diskon dipotong otomatis dari tagihan.
                </p>
              </div>

              {/* RINCIAN TAGIHAN */}
              <div className="tjr-billing-summary">
                <div className="tjr-billing-row">
                  <span>{plan.name} · {planDurationLabel}</span>
                  <strong>{rupiah(basePrice)}</strong>
                </div>

                {referralDiscount > 0 && (
                  <div className="tjr-billing-row tjr-billing-row--discount">
                    <span>Diskon Referral (10%)</span>
                    <span>- {rupiah(referralDiscount)}</span>
                  </div>
                )}

                <div className="tjr-billing-row">
                  <span>
                    Biaya {activeChannel.name}
                    {cfg.feePayer === "merchant" ? " (Ditanggung)" : cfg.feePayer === "split" ? " (Subsidi 50%)" : ""}
                  </span>
                  <strong
                    style={{
                      color: feePaidByCustomer === 0 ? "var(--brand-emerald)" : "var(--color-ink)"
                    }}
                  >
                    {feePaidByCustomer === 0 ? "Gratis" : rupiah(feePaidByCustomer)}
                  </strong>
                </div>

                <div className="tjr-billing-row--total">
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Total dibayar hari ini</span>
                  <span className="tjr-billing-total-val">
                    {rupiah(totalAmount)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* TAHAP 2: INSTRUKSI PEMBAYARAN */}
          {stage === "instruction" && txData && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", alignItems: "center", textAlign: "center" }}>
              <div className="tjr-pay-countdown-pill">
                <i className="fa-solid fa-clock" aria-hidden="true" />
                Sisa Waktu Pembayaran: {formatCountdown(countdownSec)}
              </div>

              {/* JIKA METODE QRIS */}
              {selectedMethod === "qris" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                  <div className="tjr-pay-qr-card">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(txData.qr_string || "00020101021226")}`}
                      alt="QRIS Tijarah"
                      style={{ width: "200px", height: "200px", display: "block" }}
                    />
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-muted)", lineHeight: 1.5 }}>
                    Pindai QRIS di atas melalui BCA Mobile, GoPay, OVO, ShopeePay, DANA, atau Livin' Mandiri.
                  </p>
                </div>
              ) : selectedMethod === "payment_link" ? (
                /* JIKA METODE PAYMENT LINK */
                <div style={{ width: "100%", textAlign: "left", background: "var(--color-paper-3)", borderRadius: "var(--radius-lg)", padding: "1.25rem", border: "1px solid var(--color-rule)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div className="tjr-pay-channel-logo-wrap" style={{ width: "42px", height: "42px" }}>
                      <img src={activeChannel.icon} alt={activeChannel.name} className="tjr-pay-channel-logo" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{activeChannel.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Tautan Pembayaran Digital Resmi</div>
                    </div>
                  </div>

                  <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--color-ink-2)", lineHeight: 1.5 }}>
                    Silakan buka tautan pembayaran resmi di bawah ini untuk menyelesaikan tagihan secara instan:
                  </p>

                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                    <input
                      readOnly
                      value={txData.payment_url || `https://app.pakasir.com/pay/${cfg.slug || "harumin"}/${txData.order_id}`}
                      style={{
                        flex: 1,
                        padding: "0.5rem 0.75rem",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-rule-2)",
                        fontSize: "0.82rem",
                        fontFamily: "var(--font-mono)",
                        background: "#ffffff"
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const link = txData.payment_url || `https://app.pakasir.com/pay/${cfg.slug || "harumin"}/${txData.order_id}`;
                        navigator.clipboard?.writeText(link);
                        setCopiedVa(true);
                        setTimeout(() => setCopiedVa(false), 2000);
                      }}
                      className="tjr-pay-copy-btn"
                    >
                      {copiedVa ? "Tersalin!" : "Salin"}
                    </button>
                  </div>

                  <a
                    href={txData.payment_url || `https://app.pakasir.com/pay/${cfg.slug || "harumin"}/${txData.order_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tjr-pay-btn-primary"
                    style={{ display: "inline-flex", width: "100%", justifyContent: "center", textDecoration: "none" }}
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" style={{ marginRight: "0.5rem" }} />
                    Buka Halaman Pembayaran
                  </a>
                </div>
              ) : (
                /* JIKA METODE VIRTUAL ACCOUNT */
                <div style={{ width: "100%", textAlign: "left", background: "var(--color-paper-3)", borderRadius: "var(--radius-lg)", padding: "1.25rem", border: "1px solid var(--color-rule)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem" }}>
                    <div className="tjr-pay-channel-logo-wrap" style={{ width: "42px", height: "32px" }}>
                      <img src={activeChannel.icon} alt={activeChannel.name} className="tjr-pay-channel-logo" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{activeChannel.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Virtual Account Otomatis</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: "0.85rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      Nomor Virtual Account
                    </div>
                    <div className="tjr-pay-va-box" style={{ marginTop: "4px" }}>
                      <span className="tjr-pay-va-num">
                        {txData.va_number || "88091234567890"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(txData.va_number || "88091234567890");
                          setCopiedVa(true);
                          setTimeout(() => setCopiedVa(false), 2000);
                        }}
                        className="tjr-pay-copy-btn"
                      >
                        {copiedVa ? "Tersalin!" : "Salin"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      Total Pembayaran Pas
                    </div>
                    <div className="tjr-pay-va-box" style={{ marginTop: "4px" }}>
                      <span className="tjr-pay-va-num" style={{ color: "var(--brand-emerald)" }}>
                        {rupiah(txData.total_payment || totalAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(txData.total_payment || totalAmount));
                          setCopiedAmount(true);
                          setTimeout(() => setCopiedAmount(false), 2000);
                        }}
                        className="tjr-pay-copy-btn"
                      >
                        {copiedAmount ? "Tersalin!" : "Salin"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ fontSize: "0.82rem", color: "var(--color-muted)", background: "var(--color-paper-3)", padding: "0.65rem 1rem", borderRadius: "var(--radius-md)", width: "100%" }}>
                No. Order: <strong>{txData.order_id}</strong> &bull; Gateway: Pembayaran Digital Terverifikasi
              </div>

              {/* TOMBOL SIMULASI CEPAT UNTUK DEMO & DEV */}
              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <button
                  type="button"
                  onClick={handleCheckStatus}
                  disabled={busy}
                  className="tjr-pay-btn-secondary"
                  style={{ flex: 1 }}
                >
                  <i className="fa-solid fa-arrows-rotate" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {busy ? "Memeriksa..." : "Cek Status Pembayaran"}
                </button>
                <button
                  type="button"
                  onClick={handleSimulatePaid}
                  title="Simulasi Lunas Instan untuk lingkungan pengujian dev"
                  className="tjr-pay-btn-primary"
                  style={{ whiteSpace: "nowrap" }}
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
                  background: "var(--brand-emerald-surface)",
                  color: "var(--brand-emerald)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.75rem",
                  margin: "0 auto 1rem",
                  border: "1px solid var(--brand-emerald-border)"
                }}
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
              </div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem", fontWeight: 700, color: "var(--color-ink)" }}>
                Pembayaran Berhasil!
              </h3>
              <p style={{ margin: "0 0 1.25rem", fontSize: "0.875rem", color: "var(--color-muted)", lineHeight: 1.6, maxWidth: "45ch", marginLeft: "auto", marginRight: "auto" }}>
                Terima kasih! Langganan <strong>{plan.name}</strong> untuk toko Anda telah aktif dan kuota AI langsung ditambahkan ke akun. Faktur kuitansi resmi telah dicatat ke riwayat tagihan.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="tjr-pay-btn-primary"
              >
                Tutup &amp; Perbarui Dashboard
              </button>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS MODAL (TAHAP 1) */}
        {stage === "select" && (
          <div className="tjr-modal-footer">
            <button
              type="button"
              onClick={handleCancelPayment}
              className="tjr-pay-btn-secondary"
            >
              Batalkan
            </button>
            <button
              type="button"
              onClick={handleProceedPayment}
              disabled={busy || (selectedMethod !== "swallet" && loadingFees)}
              className="tjr-pay-btn-primary"
            >
              {busy ? "Memproses..." : selectedMethod === "swallet" ? `Bayar Instan S-Wallet (${rupiah(totalAmount)})` : `Bayar ${rupiah(totalAmount)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
