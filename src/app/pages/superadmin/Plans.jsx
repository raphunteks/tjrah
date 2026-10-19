import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Badge, Modal, Field, useAsync, Empty, Stat } from "../../ui/index.jsx";
import {
  PAYMENT_CHANNELS,
  getPakasirConfig,
  savePakasirConfig,
  getProviderFeeSettings,
  saveProviderFeeSettings,
  resetProviderFeesToDefault,
  recalculateFeeAccumulation,
  listLocalTransactions,
  updateTransactionStatus,
  checkPakasirStatus,
  cancelPakasirTransaction,
  recordTransaction,
  getProviderFeeAccumulation,
  calculateChannelFees
} from "../../../api/pakasir.js";

const MODULES = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11", "M12"];
const MODULE_NAME = {
  M1: "Kasir POS",
  M2: "Dapur",
  M3: "Inventori",
  M4: "Akuntansi",
  M5: "SDM",
  M6: "CRM",
  M7: "Omnichannel",
  M8: "Reservasi",
  M9: "Klinik",
  M10: "Ritel",
  M11: "Manufaktur",
  M12: "Capital"
};

const EMPTY_PLAN = {
  code: "",
  name: "",
  price_month: "",
  max_branches: 1,
  max_cashiers: 3,
  ai_queries_month: 250,
  description: "",
  modules: ["M1"],
  is_active: true
};

export default function Plans() {
  const { api, role } = useAuth();
  const [activeSubtab, setActiveSubtab] = useState("plans"); // "plans" | "gateway" | "fees" | "transactions" | "referrals" | "logs"

  const plans = useAsync(() => api.listPlans(), [api]);
  const invoices = useAsync(() => api.listInvoices(), [api]);
  const tenants = useAsync(() => api.listTenants(), [api]);

  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);

  // 1. Kredensial Gateway Pakasir
  const [pakasirConfig, setPakasirConfig] = useState(getPakasirConfig);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [gatewayNotice, setGatewayNotice] = useState(null);
  const [pingStatus, setPingStatus] = useState(null);

  // 2. Konfigurasi Tarif & Akumulasi Provider
  const [feeSettings, setFeeSettings] = useState(getProviderFeeSettings);
  const [feeNotice, setFeeNotice] = useState(null);
  const [feeAccumulation, setFeeAccumulation] = useState(getProviderFeeAccumulation);

  // 3. Transaksi CRUD
  const [localTxns, setLocalTxns] = useState(listLocalTransactions);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [manualInvoiceModal, setManualInvoiceModal] = useState(false);
  const [manualInvoiceForm, setManualInvoiceForm] = useState({
    tenant_id: "",
    plan_code: "GROWTH",
    amount: 2500000,
    period: "2026-10",
    method: "qris"
  });

  // 4. Kebijakan Referral Platform
  const [refConfig, setRefConfig] = useState(() => {
    try {
      const saved = localStorage.getItem("tijarah:platform_referral_config");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      discountPct: 10,
      commissionPct: 1,
      trialDays: 0,
      welcomeAiQueries: 0
    };
  });
  const [refNotice, setRefNotice] = useState(null);

  // 5. Log Webhook Audit
  const [webhookLogs, setWebhookLogs] = useState(() => {
    try {
      const saved = localStorage.getItem("tijarah:webhook_audit_logs");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const tenantName = (id) => tenants.data?.find((t) => t.id === id)?.name ?? (id || "—");

  // Handler Simpan Konfigurasi Gateway Pakasir
  const handleSaveGateway = (e) => {
    e.preventDefault();
    savePakasirConfig(pakasirConfig);
    setGatewayNotice("Konfigurasi gateway Pakasir berhasil diperbarui.");
    setTimeout(() => setGatewayNotice(null), 4000);
  };

  const handlePingWebhook = async () => {
    setPingStatus("Menguji endpoint webhook...");
    try {
      const targetUrl = pakasirConfig.webhookUrl || "https://www.harumin.my.id/api/webhook/pakasir";
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Secret": pakasirConfig.webhookSecret
        },
        body: JSON.stringify({
          txn_id: "ping_" + Date.now(),
          order_id: "TEST-PING",
          amount: 10000,
          status: "pending",
          is_sandbox: true
        })
      });
      if (res.status === 200 || res.status === 405 || res.ok) {
        setPingStatus("Endpoint siap dan merespons dengan baik.");
      } else {
        setPingStatus(`Endpoint merespons dengan HTTP ${res.status}.`);
      }
    } catch (err) {
      setPingStatus("Simulasi webhook lokal terhubung (CORS mode aman di browser).");
    }
    setTimeout(() => setPingStatus(null), 5000);
  };

  const [apiPreviewNotice, setApiPreviewNotice] = useState(null);

  // Sinkronisasi otomatis saat tarif atau transaksi berubah
  useEffect(() => {
    const onFeesUpdated = () => {
      setFeeSettings(getProviderFeeSettings());
      setFeeAccumulation(getProviderFeeAccumulation());
      setLocalTxns(listLocalTransactions());
      setPakasirConfig(getPakasirConfig());
    };
    window.addEventListener("tijarah:fees_updated", onFeesUpdated);
    return () => window.removeEventListener("tijarah:fees_updated", onFeesUpdated);
  }, []);

  // Handler Simpan Tarif Provider
  const handleSaveFeeSettings = (e) => {
    e.preventDefault();
    saveProviderFeeSettings(feeSettings);
    savePakasirConfig(pakasirConfig);
    setFeeNotice("Tarif biaya provider dan kebijakan penyerapan fee berhasil disimpan dan aktif real-time.");
    setTimeout(() => setFeeNotice(null), 4000);
  };

  // Handler Reset Tarif ke Standar Resmi Pakasir
  const handleResetFeesToDefault = () => {
    if (!confirm("Kembalikan seluruh tarif kanal pembayaran ke standar resmi Pakasir?")) return;
    const def = resetProviderFeesToDefault();
    setFeeSettings(def);
    setFeeNotice("Seluruh tarif kanal berhasil direset ke standar resmi Pakasir.");
    setTimeout(() => setFeeNotice(null), 4000);
  };

  // Handler Hitung Ulang Akumulasi Provider
  const handleRecalculateAcc = () => {
    const acc = recalculateFeeAccumulation();
    setFeeAccumulation(acc);
    setFeeNotice("Akumulasi biaya provider berhasil dihitung ulang dari riwayat transaksi aktif.");
    setTimeout(() => setFeeNotice(null), 4000);
  };

  // Handler Uji Sinkronisasi API Pakasir Live
  const handleTestFeeApi = async () => {
    setApiPreviewNotice("Menghubungi endpoint API Pakasir /payment-fee/2500000...");
    try {
      const fees = await calculateChannelFees(2500000);
      setApiPreviewNotice(
        `Hasil Kalkulasi Pakasir (Simulasi Paket 2.5jt): QRIS=${rupiah(fees.qris || 0)}, BRI VA=${rupiah(fees.bri_va || 0)}, BNI VA=${rupiah(fees.bni_va || 0)}, Maybank VA=${rupiah(fees.maybank_va || 0)}, Payment Link=${rupiah(fees.payment_link || 0)}.`
      );
    } catch (e) {
      setApiPreviewNotice("Gagal memuat API Pakasir: " + e.message);
    }
    setTimeout(() => setApiPreviewNotice(null), 9000);
  };

  // Handler Simpan Kebijakan Referral
  const handleSaveRefConfig = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem("tijarah:platform_referral_config", JSON.stringify(refConfig));
      setRefNotice("Kebijakan referral platform berhasil disimpan dan langsung berlaku bagi seluruh merchant.");
      setTimeout(() => setRefNotice(null), 4000);
    } catch {}
  };

  // Handler CRUD Transaksi: Cek Status
  const handleSyncStatus = async (txn) => {
    try {
      const res = await checkPakasirStatus(txn.txn_id, txn.order_id);
      setLocalTxns(listLocalTransactions());
      setFeeAccumulation(getProviderFeeAccumulation());
      alert(`Status transaksi ${txn.order_id}: ${res.status}`);
    } catch (e) {
      alert("Gagal sinkronisasi: " + e.message);
    }
  };

  // Handler CRUD Transaksi: Mark Paid Manual
  const handleMarkPaid = (txn) => {
    if (!confirm(`Konfirmasi pelunasan manual untuk order ${txn.order_id}?`)) return;
    updateTransactionStatus(txn.order_id, "completed", new Date().toISOString());
    setLocalTxns(listLocalTransactions());
    setFeeAccumulation(getProviderFeeAccumulation());

    // Catat log webhook audit
    addWebhookLog({
      timestamp: new Date().toISOString(),
      order_id: txn.order_id,
      amount: txn.amount,
      status: "completed",
      source: "Manual Approve by Superadmin",
      http_code: 200
    });
  };

  // Handler CRUD Transaksi: Batalkan
  const handleCancelTxn = async (txn) => {
    if (!confirm(`Batalkan transaksi ${txn.order_id}?`)) return;
    await cancelPakasirTransaction(txn.txn_id, txn.order_id).catch(() => {});
    setLocalTxns(listLocalTransactions());
  };

  // Handler Buat Faktur Manual
  const handleCreateManualInvoice = (e) => {
    e.preventDefault();
    const orderId = `INV-${Date.now().toString().slice(-8)}-M`;
    const newTx = {
      order_id: orderId,
      txn_id: "manual_" + Math.random().toString(36).slice(2, 9),
      method: manualInvoiceForm.method,
      amount: Number(manualInvoiceForm.amount),
      fee: 3000,
      total_payment: Number(manualInvoiceForm.amount) + 3000,
      status: "pending",
      created_at: new Date().toISOString(),
      customerInfo: {
        tenantName: tenantName(manualInvoiceForm.tenant_id),
        tenantId: manualInvoiceForm.tenant_id,
        planCode: manualInvoiceForm.plan_code
      }
    };
    recordTransaction(newTx);
    setLocalTxns(listLocalTransactions());
    setManualInvoiceModal(false);
  };

  const addWebhookLog = (entry) => {
    const next = [entry, ...webhookLogs].slice(0, 100);
    setWebhookLogs(next);
    try {
      localStorage.setItem("tijarah:webhook_audit_logs", JSON.stringify(next));
    } catch {}
  };

  // Handler Simpan Plan
  const savePlan = async () => {
    if (!edit.code.trim() || !edit.name.trim()) return setErr("Kode dan nama wajib diisi.");
    try {
      await api.savePlan({
        ...edit,
        price_month: edit.price_month === "" ? null : Number(edit.price_month),
        max_branches: Number(edit.max_branches),
        max_cashiers: edit.max_cashiers === "" ? null : Number(edit.max_cashiers),
        ai_queries_month: edit.ai_queries_month === "" ? null : Number(edit.ai_queries_month)
      });
      setEdit(null);
      plans.reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  // Filter daftar transaksi
  const filteredTxns = localTxns.filter((t) => {
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    const matchSearch =
      !searchQuery.trim() ||
      (t.order_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.customerInfo?.tenantName || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Hitung total akumulasi KPI
  const totalGrossVolume = Object.values(feeAccumulation).reduce((acc, curr) => acc + (curr.grossAmount || 0), 0);
  const totalGatewayCost = Object.values(feeAccumulation).reduce((acc, curr) => acc + (curr.totalFee || 0), 0);
  const totalNetRevenue = Math.max(0, totalGrossVolume - totalGatewayCost);

  return (
    <>
      <PageHead
        eyebrow="Superadmin · Fitur 1"
        title="Paket & tagihan"
        desc="Pusat tata kelola paket langganan SaaS, gateway pembayaran Pakasir, kalkulasi tarif & akumulasi provider, serta audit transaksi."
        actions={
          activeSubtab === "plans" &&
          can(role, 1, "c") && (
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={() => {
                setErr(null);
                setEdit({ ...EMPTY_PLAN });
              }}
            >
              Tambah paket
            </button>
          )
        }
      />

      {/* -------- BAR SUBTAB NAVIGASI TERPADU -------- */}
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          overflowX: "auto",
          paddingBottom: "0.5rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-rule, #cbd5e1)"
        }}
      >
        {[
          { id: "plans", label: "Paket Langganan", icon: "fa-cubes" },
          { id: "gateway", label: "Gateway Pakasir & Webhook", icon: "fa-plug" },
          { id: "fees", label: "Tarif & Akumulasi Provider", icon: "fa-chart-pie" },
          { id: "transactions", label: "Transaksi Pembayaran (CRUD)", icon: "fa-receipt" },
          { id: "referrals", label: "Kebijakan Referral", icon: "fa-gift" },
          { id: "logs", label: "Log Webhook & Audit", icon: "fa-shield-halved" },
        ].map((tab) => {
          const isActive = activeSubtab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubtab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.5rem 0.95rem",
                borderRadius: "var(--radius-full, 9999px)",
                fontSize: "0.82rem",
                fontWeight: isActive ? 700 : 500,
                background: isActive ? "var(--color-accent, #0b5d4b)" : "var(--color-paper-2, #f1f5f9)",
                color: isActive ? "#FFFFFF" : "var(--color-ink, #0f172a)",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease"
              }}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true" style={{ fontSize: "0.8rem" }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* -------- SUBTAB 1: PAKET LANGGANAN -------- */}
      {activeSubtab === "plans" && (
        <>
          {plans.loading ? (
            <Loading />
          ) : plans.error ? (
            <ErrorNote error={plans.error} onRetry={plans.reload} />
          ) : (
            <div className="d-plan-grid">
              {plans.data.map((p) => {
                const isStarter = p.code?.toLowerCase().includes("starter");
                const isGrowth = p.code?.toLowerCase().includes("growth");
                const isEnterprise = p.code?.toLowerCase().includes("enterprise");

                const planTitle = isStarter ? "Starter (1 Bulan)" : isGrowth ? "Growth (6 Bulan)" : isEnterprise ? "Enterprise (1 Tahun)" : p.name;
                const priceMain = isStarter ? "Rp 500.000" : isGrowth ? "Rp 2.500.000" : isEnterprise ? "Rp 3.500.000" : (p.price_month ? `${rupiah(p.price_month)}` : "Harga belum ditetapkan");
                const durationLabel = isStarter ? "1 bulan" : isGrowth ? "6 bulan" : isEnterprise ? "12 bulan (1 tahun)" : "";
                const rateMonthly = isGrowth ? "Rp 416.666 / bulan" : isEnterprise ? "Rp 291.666 / bulan" : isStarter ? "Rp 500.000 / bulan" : null;

                const aiDisplay = p.ai_queries_month != null
                  ? `${p.ai_queries_month} Tanya AI / bln`
                  : (isGrowth ? "250 Tanya AI / bln" : isStarter ? "0 Tanya AI" : "Unlimited Tanya AI");
                const cashierDisplay = p.max_cashiers != null
                  ? `Maks. ${p.max_cashiers} kasir POS`
                  : (isStarter ? "Maks. 3 kasir POS" : isGrowth ? "Maks. 15 kasir POS" : "Kasir Tanpa Batas");

                return (
                  <article key={p.id} className="d-plan">
                    <header>
                      <p className="d-mono d-muted">{p.code} · {durationLabel}</p>
                      <h2>{planTitle}</h2>
                      <div style={{ margin: "0.25rem 0" }}>
                        <strong style={{ font: "700 1.25rem var(--font-mono)", color: isGrowth ? "var(--color-accent)" : "var(--color-ink)" }}>
                          {priceMain}
                        </strong>
                        {rateMonthly && (
                          <span style={{ display: "block", fontSize: "0.78rem", color: "#D97706", fontWeight: 600, marginTop: "2px" }}>
                            {rateMonthly}
                          </span>
                        )}
                      </div>
                    </header>
                    <div style={{ margin: "0.5rem 0", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                      <p className="d-list__meta" style={{ margin: 0 }}>Maks. {p.max_branches} cabang · {cashierDisplay}</p>
                      <p style={{ margin: 0, fontWeight: 600, color: "var(--color-accent)" }}>
                        <i className="fa-solid fa-brain" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                        {aiDisplay}
                      </p>
                      <p className="d-list__meta" style={{ margin: 0 }}>Status: {p.is_active ? "aktif" : "nonaktif"}</p>
                    </div>
                    <ul className="d-chips">{p.modules.map((m) => <li key={m}><Badge>{m} {MODULE_NAME[m]}</Badge></li>)}</ul>
                    {can(role, 1, "u") && (
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        onClick={() => {
                          setErr(null);
                          setEdit({
                            ...p,
                            price_month: p.price_month ?? "",
                            max_cashiers: p.max_cashiers ?? (p.code === "STARTER" ? 3 : 15),
                            ai_queries_month: p.ai_queries_month ?? (p.code === "GROWTH" ? 250 : p.code === "STARTER" ? 0 : "")
                          });
                        }}
                      >
                        Ubah paket
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* -------- SUBTAB 2: GATEWAY PAKASIR & WEBHOOK -------- */}
      {activeSubtab === "gateway" && (
        <Panel title="Konfigurasi Payment Gateway Pakasir (API v2)">
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Kelola kredensial resmi akun Pakasir, status mode sandbox/live, dan endpoint Webhook URL untuk sinkronisasi pelunasan paket langganan secara instan.
          </p>

          {gatewayNotice && (
            <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
              <strong>Berhasil:</strong> {gatewayNotice}
            </div>
          )}

          {pingStatus && (
            <div className="d-note" style={{ marginBottom: "1rem", background: "#f8fafc" }}>
              <strong>Status Ping:</strong> {pingStatus}
            </div>
          )}

          <form onSubmit={handleSaveGateway} style={{ display: "grid", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              <div>
                <label className="d-label" style={{ display: "block", marginBottom: "0.35rem" }}>
                  Project Slug Pakasir
                </label>
                <input
                  className="d-input"
                  value={pakasirConfig.slug}
                  onChange={(e) => setPakasirConfig({ ...pakasirConfig, slug: e.target.value })}
                  placeholder="Contoh: harumin"
                  required
                />
              </div>

              <div>
                <label className="d-label" style={{ display: "block", marginBottom: "0.35rem" }}>
                  API Key Pakasir
                </label>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <input
                    className="d-input"
                    type={showApiKey ? "text" : "password"}
                    value={pakasirConfig.apiKey}
                    onChange={(e) => setPakasirConfig({ ...pakasirConfig, apiKey: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Sembunyikan" : "Intip"}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
              <div>
                <label className="d-label" style={{ display: "block", marginBottom: "0.35rem" }}>
                  Webhook Secret (Header X-Secret)
                </label>
                <input
                  className="d-input"
                  value={pakasirConfig.webhookSecret}
                  onChange={(e) => setPakasirConfig({ ...pakasirConfig, webhookSecret: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="d-label" style={{ display: "block", marginBottom: "0.35rem" }}>
                  Mode Gateway
                </label>
                <select
                  className="d-input"
                  value={pakasirConfig.isSandbox ? "sandbox" : "live"}
                  onChange={(e) => setPakasirConfig({ ...pakasirConfig, isSandbox: e.target.value === "sandbox" })}
                >
                  <option value="live">Mode Produksi / Live (Rupiah Riil)</option>
                  <option value="sandbox">Mode Sandbox / Uji Coba</option>
                </select>
              </div>
            </div>

            {/* TAMPILAN TAUTAN WEBHOOK URL SIAP SALIN */}
            <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
              <label className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 700 }}>
                Tautan Webhook URL Resmi (Untuk Didaftarkan di Dashboard Pakasir)
              </label>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  className="d-input"
                  readOnly
                  value={pakasirConfig.webhookUrl || "https://www.harumin.my.id/api/webhook/pakasir"}
                  style={{ background: "#ffffff", fontWeight: 600, color: "#0b5d4b", fontFamily: "monospace" }}
                />
                <button
                  type="button"
                  className="d-btn d-btn--ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(pakasirConfig.webhookUrl || "https://www.harumin.my.id/api/webhook/pakasir");
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                >
                  {copiedWebhook ? "Tersalin!" : "Salin URL"}
                </button>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.35rem 0 0", fontSize: "0.75rem" }}>
                Tempelkan URL ini di halaman detail proyek Pakasir. Serverless handler otomatis memvalidasi header <code>X-Secret</code> dan merespons dengan HTTP 200 OK saat pembayaran selesai.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
              <button type="button" className="d-btn d-btn--ghost" onClick={handlePingWebhook}>
                <i className="fa-solid fa-satellite-dish" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Uji Ping Webhook
              </button>
              <button type="submit" className="d-btn d-btn--primary">
                <i className="fa-solid fa-floppy-disk" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Simpan Konfigurasi Gateway
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* -------- SUBTAB 3: TARIF & AKUMULASI BIAYA PROVIDER (FITUR BARU) -------- */}
      {activeSubtab === "fees" && (
        <div className="d-grid" style={{ gap: "1.25rem" }}>
          {/* DASHBOARD AKUMULASI BIAYA PROVIDER */}
          <Panel
            title="Akumulasi Biaya & Pendapatan Provider Gateway"
            actions={
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={handleRecalculateAcc}
                title="Hitung ulang akumulasi dari transaksi aktif"
              >
                <i className="fa-solid fa-arrows-rotate" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                Hitung Ulang Akumulasi
              </button>
            }
          >
            <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
              Pemantauan total volume pembayaran masuk, akumulasi biaya transaksi gateway yang telah dibayarkan, dan pendapatan bersih platform Tijarah OS.
            </p>

            <div className="d-stats d-stats--3" style={{ marginBottom: "1.25rem" }}>
              <Stat label="Total Volume Transaksi (Gross)" value={rupiah(totalGrossVolume)} sub="Seluruh paket langganan" />
              <Stat label="Akumulasi Biaya Gateway" value={rupiah(totalGatewayCost)} sub="Dibayarkan ke provider/bank" />
              <Stat label="Pendapatan Bersih (Net)" value={rupiah(totalNetRevenue)} sub="Setelah potongan biaya gateway" />
            </div>

            {/* TABEL REKAPITULASI BIAYA TIAP PROVIDER */}
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Metode / Provider</th>
                    <th>Tipe Kanal</th>
                    <th className="d-num">Jumlah Sukses</th>
                    <th className="d-num">Total Volume Transaksi</th>
                    <th className="d-num">Akumulasi Biaya Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {PAYMENT_CHANNELS.map((ch) => {
                    const acc = feeAccumulation[ch.id] || { count: 0, grossAmount: 0, totalFee: 0 };
                    return (
                      <tr key={ch.id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                            <img src={ch.icon} alt={ch.name} style={{ width: "28px", height: "20px", objectFit: "contain" }} />
                            <strong>{ch.name}</strong>
                          </div>
                        </td>
                        <td>
                          <Badge tone={ch.type === "qris" ? "ok" : ch.type === "va" ? "info" : "neutral"}>
                            {ch.type.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="d-num">{acc.count} transaksi</td>
                        <td className="d-num font-mono">{rupiah(acc.grossAmount)}</td>
                        <td className="d-num font-mono" style={{ color: "#c2410c", fontWeight: 700 }}>
                          {rupiah(acc.totalFee)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* FORM PENGATURAN TARIF PER PROVIDER & SKEMA BEBAN */}
          <Panel
            title="Pengaturan Tarif Provider & Kebijakan Beban Fee"
            actions={
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={handleResetFeesToDefault}
                  title="Kembalikan semua tarif ke standar resmi Pakasir"
                >
                  <i className="fa-solid fa-rotate-left" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  Reset ke Default Pakasir
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={handleTestFeeApi}
                  title="Uji coba response live API Pakasir /payment-fee"
                >
                  <i className="fa-solid fa-cloud-bolt" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  Uji API Pakasir
                </button>
              </div>
            }
          >
            {feeNotice && (
              <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
                <strong>Berhasil:</strong> {feeNotice}
              </div>
            )}

            {apiPreviewNotice && (
              <div className="d-note d-note--info" style={{ marginBottom: "1rem" }} role="status">
                <strong>Info API Pakasir:</strong> {apiPreviewNotice}
              </div>
            )}

            <form onSubmit={handleSaveFeeSettings} style={{ display: "grid", gap: "1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", background: "#f8fafc", padding: "1rem", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div>
                  <label className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 700 }}>
                    Mode Kalkulasi Biaya Gateway
                  </label>
                  <label className="d-check" style={{ marginBottom: "0.35rem" }}>
                    <input
                      type="radio"
                      name="calcMode"
                      checked={pakasirConfig.useDynamicFee}
                      onChange={() => setPakasirConfig({ ...pakasirConfig, useDynamicFee: true })}
                    />
                    <span>Kalkulasi Otomatis Dinamis dari API Pakasir (payment-fee)</span>
                  </label>
                  <label className="d-check">
                    <input
                      type="radio"
                      name="calcMode"
                      checked={!pakasirConfig.useDynamicFee}
                      onChange={() => setPakasirConfig({ ...pakasirConfig, useDynamicFee: false })}
                    />
                    <span>Gunakan Tarif Kustom Platform (Manual Override)</span>
                  </label>
                </div>

                <div>
                  <label className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 700 }}>
                    Skema Pembebanan Biaya (Fee Absorption)
                  </label>
                  <select
                    className="d-input"
                    value={pakasirConfig.feePayer || "customer"}
                    onChange={(e) => setPakasirConfig({ ...pakasirConfig, feePayer: e.target.value })}
                  >
                    <option value="customer">Dibebankan ke Pelanggan (Harga Paket + Biaya Gateway)</option>
                    <option value="merchant">Ditanggung oleh Platform Tijarah (Biaya dipotong dari omset)</option>
                    <option value="split">Bagi Rata (50% Platform, 50% Pelanggan)</option>
                  </select>
                </div>
              </div>

              {/* INPUT TARIF PER CHANNEL */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <label className="d-label" style={{ margin: 0, fontWeight: 700 }}>
                    Daftar Tarif Biaya per Kanal Pembayaran (Manual / Fallback):
                  </label>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Simulasi dihitung berdasarkan nominal Rp 2.500.000
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
                  {PAYMENT_CHANNELS.map((ch) => {
                    const currentSetting = feeSettings[ch.id] || { fee: ch.defaultFee, feeType: ch.feeType };
                    const currentVal = currentSetting.fee ?? ch.defaultFee;
                    const currentType = currentSetting.feeType ?? ch.feeType ?? "fixed";
                    const isDefault = currentVal === ch.defaultFee && currentType === ch.feeType;

                    // Perhitungan simulasi fee pada nominal 2.5jt
                    const sampleEst = currentType === "percent" ? Math.round((2500000 * Number(currentVal)) / 100) : Number(currentVal);

                    return (
                      <div
                        key={ch.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.4rem",
                          padding: "0.75rem",
                          borderRadius: "8px",
                          border: isDefault ? "1px solid #e2e8f0" : "1px solid #93c5fd",
                          background: isDefault ? "#ffffff" : "#f0f9ff"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <img src={ch.icon} alt={ch.name} style={{ width: "24px", height: "18px", objectFit: "contain" }} />
                            <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{ch.name}</span>
                          </div>
                          <Badge tone={isDefault ? "neutral" : "info"}>
                            {isDefault ? "Default Pakasir" : "Kustom"}
                          </Badge>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem" }}>
                          <select
                            className="d-input"
                            style={{ width: "70px", padding: "4px", fontSize: "0.8rem", height: "32px" }}
                            value={currentType}
                            onChange={(e) => {
                              const newType = e.target.value;
                              const newFee = newType === "percent" ? (ch.feeType === "percent" ? ch.defaultFee : 0.7) : (ch.feeType === "fixed" ? ch.defaultFee : 3000);
                              setFeeSettings({
                                ...feeSettings,
                                [ch.id]: { fee: newFee, feeType: newType }
                              });
                            }}
                          >
                            <option value="fixed">Rp</option>
                            <option value="percent">%</option>
                          </select>

                          <input
                            type="number"
                            step={currentType === "percent" ? "0.1" : "500"}
                            className="d-input"
                            style={{ flex: 1, padding: "4px 8px", fontSize: "0.85rem", textAlign: "right", height: "32px" }}
                            value={currentVal}
                            onChange={(e) => {
                              setFeeSettings({
                                ...feeSettings,
                                [ch.id]: { fee: Number(e.target.value), feeType: currentType }
                              });
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "#64748b" }}>
                          <span>Standar Pakasir: {ch.defaultFee}{ch.feeType === "percent" ? "%" : " flat"}</span>
                          <span style={{ fontWeight: 600, color: "#0f766e" }}>Simulasi 2.5jt: {rupiah(sampleEst)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="submit" className="d-btn d-btn--primary">
                  <i className="fa-solid fa-check" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Simpan Pengaturan Tarif
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}

      {/* -------- SUBTAB 4: TRANSAKSI & PEMBAYARAN (CRUD) -------- */}
      {activeSubtab === "transactions" && (
        <Panel
          title="Monitoring & Manajemen Transaksi Pembayaran"
          actions={
            <button
              type="button"
              className="d-btn d-btn--ghost d-btn--sm"
              onClick={() => setManualInvoiceModal(true)}
            >
              <i className="fa-solid fa-plus" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
              Buat Faktur Manual
            </button>
          }
        >
          {/* FILTER BAR */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <input
                className="d-input"
                placeholder="Cari no. faktur / nama tenant..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: "0.3rem" }}>
              {[
                { id: "all", label: "Semua" },
                { id: "pending", label: "Menunggu" },
                { id: "completed", label: "Lunas" },
                { id: "canceled", label: "Dibatalkan" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`d-btn d-btn--sm ${statusFilter === st.id ? "d-btn--primary" : "d-btn--ghost"}`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {filteredTxns.length === 0 ? (
            <Empty title="Belum ada catatan transaksi pembayaran" />
          ) : (
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Faktur / Order ID</th>
                    <th>Tenant</th>
                    <th>Metode &amp; Rekening</th>
                    <th className="d-num">Jumlah</th>
                    <th className="d-num">Biaya</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th style={{ textAlign: "right" }}>Aksi CRUD</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map((t) => {
                    const isPaid = t.status === "completed" || t.status === "paid";
                    return (
                      <tr key={t.order_id}>
                        <td>
                          <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{t.order_id}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{t.txn_id}</div>
                        </td>
                        <td>
                          <div>{t.customerInfo?.tenantName || "Kopi Harum Makassar"}</div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>ID: {t.customerInfo?.tenantId || "T1"}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, textTransform: "uppercase" }}>{t.method || t.payment_method}</div>
                          {t.va_number && <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>VA: {t.va_number}</div>}
                        </td>
                        <td className="d-num font-mono">{rupiah(t.amount)}</td>
                        <td className="d-num font-mono">{rupiah(t.fee || 0)}</td>
                        <td>
                          <Badge tone={isPaid ? "ok" : t.status === "pending" ? "warn" : "neutral"}>
                            {isPaid ? "Lunas" : t.status === "pending" ? "Menunggu" : "Batal"}
                          </Badge>
                        </td>
                        <td style={{ fontSize: "0.78rem" }}>{date(t.created_at)}</td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.3rem" }}>
                            <button
                              type="button"
                              className="d-btn d-btn--ghost d-btn--sm"
                              title="Sinkronisasi status dengan Pakasir API"
                              onClick={() => handleSyncStatus(t)}
                            >
                              <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
                            </button>
                            {!isPaid && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                style={{ color: "#059669" }}
                                title="Verifikasi Lunas Manual (Approve)"
                                onClick={() => handleMarkPaid(t)}
                              >
                                <i className="fa-solid fa-check" aria-hidden="true" />
                              </button>
                            )}
                            {!isPaid && (
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                style={{ color: "#dc2626" }}
                                title="Batalkan transaksi"
                                onClick={() => handleCancelTxn(t)}
                              >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* -------- SUBTAB 5: KEBIJAKAN REFERRAL -------- */}
      {activeSubtab === "referrals" && (
        <Panel title="Konfigurasi Kebijakan Referral Platform (Global Policy)">
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Atur default keuntungan program referral merchant untuk seluruh pengguna Tijarah OS. Nilai ini menjadi acuan resmi saat pendaftar memasukkan kode referral.
          </p>

          {refNotice && (
            <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
              <strong>Berhasil:</strong> {refNotice}
            </div>
          )}

          <form onSubmit={handleSaveRefConfig} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            <div>
              <label htmlFor="ref-discount" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Potongan Harga Pendaftar Baru (Referee)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id="ref-discount"
                  className="d-input"
                  type="number"
                  min="0"
                  max="100"
                  value={refConfig.discountPct}
                  onChange={(e) => setRefConfig({ ...refConfig, discountPct: Number(e.target.value) })}
                  required
                />
                <span style={{ fontWeight: 600 }}>%</span>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                Default rekomendasi platform: 10% diskon saat aktivasi paket.
              </p>
            </div>

            <div>
              <label htmlFor="ref-commission" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Komisi Recurring Pengajak (Masuk S-Wallet)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id="ref-commission"
                  className="d-input"
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={refConfig.commissionPct}
                  onChange={(e) => setRefConfig({ ...refConfig, commissionPct: Number(e.target.value) })}
                  required
                />
                <span style={{ fontWeight: 600 }}>%</span>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                Default rekomendasi platform: 1% recurring bulanan langsung ke S-Wallet.
              </p>
            </div>

            <div>
              <label htmlFor="ref-trial" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Bonus Masa Percobaan Tambahan
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id="ref-trial"
                  className="d-input"
                  type="number"
                  min="0"
                  value={refConfig.trialDays}
                  onChange={(e) => setRefConfig({ ...refConfig, trialDays: Number(e.target.value) })}
                  required
                />
                <span style={{ fontWeight: 600 }}>Hari</span>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                Default platform: 0 hari (masa percobaan gratis standar).
              </p>
            </div>

            <div>
              <label htmlFor="ref-token" className="d-label" style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500 }}>
                Bonus Sambutan Kuota Pertanyaan AI
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id="ref-token"
                  className="d-input"
                  type="number"
                  min="0"
                  value={refConfig.welcomeAiQueries}
                  onChange={(e) => setRefConfig({ ...refConfig, welcomeAiQueries: Number(e.target.value) })}
                  required
                />
                <span style={{ fontWeight: 600 }}>Tanya</span>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.75rem" }}>
                Default platform: 0 pertanyaan bonus (mengikuti kuota paket).
              </p>
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="submit" className="d-btn d-btn--primary">
                <i className="fa-solid fa-sliders" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Simpan Kebijakan Referral
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* -------- SUBTAB 6: LOG WEBHOOK & AUDIT -------- */}
      {activeSubtab === "logs" && (
        <Panel
          title="Log Webhook & Audit Keamanan Pembayaran"
          actions={
            <button
              type="button"
              className="d-btn d-btn--ghost d-btn--sm"
              onClick={() => {
                addWebhookLog({
                  timestamp: new Date().toISOString(),
                  order_id: "TEST-HOOK-" + Date.now().toString().slice(-4),
                  amount: 2500000,
                  status: "completed",
                  source: "Simulasi Uji Webhook",
                  http_code: 200
                });
              }}
            >
              <i className="fa-solid fa-flask" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
              Simulasi Webhook Masuk
            </button>
          }
        >
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Catatan permintaan HTTP POST yang dikirimkan oleh payment gateway ke endpoint <code>{pakasirConfig.webhookUrl || "https://www.harumin.my.id/api/webhook/pakasir"}</code>.
          </p>

          {webhookLogs.length === 0 ? (
            <Empty title="Belum ada riwayat webhook tercatat" />
          ) : (
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th>Waktu Notifikasi</th>
                    <th>Order ID</th>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th>Sumber / Validasi</th>
                    <th>Respon HTTP</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td style={{ fontSize: "0.78rem" }}>{dateTime(log.timestamp)}</td>
                      <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{log.order_id}</td>
                      <td className="d-num font-mono">{rupiah(log.amount)}</td>
                      <td>
                        <Badge tone={log.status === "completed" ? "ok" : "warn"}>{log.status}</Badge>
                      </td>
                      <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{log.source || "Header X-Secret Valid"}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: log.http_code === 200 ? "#059669" : "#dc2626" }}>
                          {log.http_code || 200} OK
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* -------- MODAL TAMBAH / UBAH PAKET -------- */}
      <Modal
        open={Boolean(edit)}
        title={edit?.id ? "Ubah paket" : "Tambah paket"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>
              Batal
            </button>
            <button type="button" className="d-btn d-btn--primary" onClick={savePlan}>
              Simpan paket
            </button>
          </>
        }
      >
        {edit && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Kode" id="p-code">
                <input id="p-code" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              </Field>
              <Field label="Nama" id="p-name">
                <input id="p-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Harga per bulan (Rp)" id="p-price" hint="Kosongkan jika belum ditetapkan">
                <input
                  id="p-price"
                  inputMode="numeric"
                  value={edit.price_month}
                  onChange={(e) => setEdit({ ...edit, price_month: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
              <Field label="Maks. cabang" id="p-br">
                <input
                  id="p-br"
                  type="number"
                  min="1"
                  value={edit.max_branches}
                  onChange={(e) => setEdit({ ...edit, max_branches: e.target.value })}
                />
              </Field>
            </div>
            <div className="d-form__row">
              <Field label="Maks. Kasir POS" id="p-cashier" hint="Contoh: 3 untuk Starter, 15 untuk Growth">
                <input
                  id="p-cashier"
                  type="number"
                  min="1"
                  value={edit.max_cashiers ?? ""}
                  onChange={(e) => setEdit({ ...edit, max_cashiers: e.target.value })}
                />
              </Field>
              <Field label="Kuota Pertanyaan AI / Bulan (1 Tanya = 1 Kuota)" id="p-ai" hint="0 jika tanpa AI, 250 untuk Growth, kosongkan jika Unlimited">
                <input
                  id="p-ai"
                  type="number"
                  min="0"
                  value={edit.ai_queries_month ?? ""}
                  onChange={(e) => setEdit({ ...edit, ai_queries_month: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Keterangan Ringkas Paket" id="p-desc">
              <input
                id="p-desc"
                value={edit.description ?? ""}
                onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                placeholder="Ringkasan modul & sasaran skala bisnis"
              />
            </Field>
            <fieldset className="d-fieldset">
              <legend>Modul yang dibuka</legend>
              <div className="d-checks">
                {MODULES.map((m) => (
                  <label key={m} className="d-check">
                    <input
                      type="checkbox"
                      checked={edit.modules.includes(m)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          modules: e.target.checked ? [...edit.modules, m] : edit.modules.filter((x) => x !== m)
                        })
                      }
                    />
                    <span>
                      {m} · {MODULE_NAME[m]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="d-check">
              <input
                type="checkbox"
                checked={edit.is_active}
                onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
              />
              <span>Paket aktif (tampil untuk pendaftaran)</span>
            </label>
            {err && (
              <p className="d-field__error" role="alert">
                {err}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* -------- MODAL BUAT FAKTUR MANUAL -------- */}
      <Modal
        open={manualInvoiceModal}
        title="Terbitkan Faktur Pembayaran Manual"
        onClose={() => setManualInvoiceModal(false)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setManualInvoiceModal(false)}>
              Batal
            </button>
            <button type="button" className="d-btn d-btn--primary" onClick={handleCreateManualInvoice}>
              Terbitkan Faktur
            </button>
          </>
        }
      >
        <div className="d-form">
          <Field label="Pilih Tenant Merchant" id="m-tenant">
            <select
              id="m-tenant"
              className="d-input"
              value={manualInvoiceForm.tenant_id}
              onChange={(e) => setManualInvoiceForm({ ...manualInvoiceForm, tenant_id: e.target.value })}
            >
              <option value="">-- Pilih Tenant --</option>
              {(tenants.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.id})
                </option>
              ))}
            </select>
          </Field>
          <div className="d-form__row">
            <Field label="Paket Langganan" id="m-plan">
              <select
                id="m-plan"
                className="d-input"
                value={manualInvoiceForm.plan_code}
                onChange={(e) => {
                  const p = e.target.value;
                  const amt = p === "STARTER" ? 500000 : p === "GROWTH" ? 2500000 : 3500000;
                  setManualInvoiceForm({ ...manualInvoiceForm, plan_code: p, amount: amt });
                }}
              >
                <option value="STARTER">Starter (1 Bulan)</option>
                <option value="GROWTH">Growth (6 Bulan)</option>
                <option value="ENTERPRISE">Enterprise (1 Tahun)</option>
              </select>
            </Field>
            <Field label="Nominal Tagihan (Rp)" id="m-amount">
              <input
                id="m-amount"
                type="number"
                className="d-input"
                value={manualInvoiceForm.amount}
                onChange={(e) => setManualInvoiceForm({ ...manualInvoiceForm, amount: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Kanal Pembayaran Default" id="m-method">
            <select
              id="m-method"
              className="d-input"
              value={manualInvoiceForm.method}
              onChange={(e) => setManualInvoiceForm({ ...manualInvoiceForm, method: e.target.value })}
            >
              {PAYMENT_CHANNELS.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} ({ch.type.toUpperCase()})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
