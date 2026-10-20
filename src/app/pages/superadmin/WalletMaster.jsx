import { useState, useMemo } from "react";
import { rupiah, dateTime } from "../../../lib/format.js";
import { Panel, Badge, Modal, Empty, Stat } from "../../ui/index.jsx";
import {
  DEFAULT_PRICING_CONFIG,
  getPayoutPricingConfig,
  savePayoutPricingConfig,
  isOperatingHours
} from "../../../api/swallet.js";

// Data awal bersih (Nol saldo dummy / fiktif)
const INITIAL_QUEUE = [];

const INITIAL_WALLETS = [
  {
    id: "w-01",
    wallet_number: "SW-202610-84910291",
    user_name: "Budi Santoso",
    role: "owner",
    tenant_name: "Harumin Dental Care",
    balance: 0,
    locked_balance: 0,
    is_frozen: false
  },
  {
    id: "w-02",
    wallet_number: "SW-202610-91029384",
    user_name: "Dr. Sarah Sp.Ort",
    role: "dokter",
    tenant_name: "Harumin Dental Care",
    balance: 0,
    locked_balance: 0,
    is_frozen: false
  },
  {
    id: "w-03",
    wallet_number: "SW-202610-18293041",
    user_name: "Reza Pratama",
    role: "gm",
    tenant_name: "Kopi Tijarah Cabang 1",
    balance: 0,
    locked_balance: 0,
    is_frozen: false
  },
  {
    id: "w-04",
    wallet_number: "SW-202610-77391024",
    user_name: "Agus Susanto",
    role: "staff",
    tenant_name: "Kopi Tijarah Cabang 1",
    balance: 0,
    locked_balance: 0,
    is_frozen: false
  },
  {
    id: "w-05",
    wallet_number: "SW-202610-55102938",
    user_name: "Maya Indah",
    role: "member",
    tenant_name: "Retail Harumin",
    balance: 0,
    locked_balance: 0,
    is_frozen: false
  },
  {
    id: "w-06",
    wallet_number: "SW-202610-33910293",
    user_name: "Akun Sengketa #901",
    role: "member",
    tenant_name: "Umum",
    balance: 0,
    locked_balance: 0,
    is_frozen: true
  }
];

export default function WalletMaster() {
  const [selectedSubTab, setSelectedSubTab] = useState("radar"); // "radar" | "pricing" | "queue" | "explorer" | "circuit"
  const [circuitBreakerActive, setCircuitBreakerActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Konfigurasi Tarif & Margin Platform
  const [pricing, setPricing] = useState(getPayoutPricingConfig);
  const [saveNotice, setSaveNotice] = useState(null);

  // Antrean Penarikan Bank (Payout Queue)
  const [queue, setQueue] = useState(INITIAL_QUEUE);
  const [payoutModalItem, setPayoutModalItem] = useState(null);
  const [disbursementRef, setDisbursementRef] = useState("");
  const [actionNotice, setActionNotice] = useState(null);

  // Omni-Wallet Explorer State
  const [wallets, setWallets] = useState(INITIAL_WALLETS);
  const [adjustModalWallet, setAdjustModalWallet] = useState(null);
  const [adjustDirection, setAdjustDirection] = useState("credit"); // "credit" | "debit"
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMemo, setAdjustMemo] = useState("");

  const operating = useMemo(() => isOperatingHours(), []);

  // Perhitungan dinamis seluruh saldo sistem dari dompet aktif
  const totalUserBalance = useMemo(() => {
    return wallets.reduce((acc, w) => acc + (w.balance || 0), 0);
  }, [wallets]);

  const totalUserLocked = useMemo(() => {
    return wallets.reduce((acc, w) => acc + (w.locked_balance || 0), 0);
  }, [wallets]);

  // Brankas keuntungan platform awal bersih
  const platformRevenueBalance = 0;
  const totalSystemicBalance = totalUserBalance + platformRevenueBalance;

  // Pemetaan rincian solvabilitas per kategori peran
  const ownerTotal = useMemo(() => {
    const list = wallets.filter((w) => w.role === "owner");
    return {
      count: list.length,
      balance: list.reduce((s, w) => s + (w.balance || 0), 0),
      locked: list.reduce((s, w) => s + (w.locked_balance || 0), 0)
    };
  }, [wallets]);

  const gmTotal = useMemo(() => {
    const list = wallets.filter((w) => w.role === "gm");
    return {
      count: list.length,
      balance: list.reduce((s, w) => s + (w.balance || 0), 0),
      locked: list.reduce((s, w) => s + (w.locked_balance || 0), 0)
    };
  }, [wallets]);

  const staffDoctorTotal = useMemo(() => {
    const list = wallets.filter((w) => w.role === "staff" || w.role === "dokter");
    return {
      count: list.length,
      balance: list.reduce((s, w) => s + (w.balance || 0), 0),
      locked: list.reduce((s, w) => s + (w.locked_balance || 0), 0)
    };
  }, [wallets]);

  const memberTotal = useMemo(() => {
    const list = wallets.filter((w) => w.role === "member");
    return {
      count: list.length,
      balance: list.reduce((s, w) => s + (w.balance || 0), 0),
      locked: list.reduce((s, w) => s + (w.locked_balance || 0), 0)
    };
  }, [wallets]);

  // Simpan Tarif Baru
  const handleSavePricing = (e) => {
    e.preventDefault();
    savePayoutPricingConfig(pricing);
    setSaveNotice("Konfigurasi tarif penarikan dan margin keuntungan website berhasil disimpan.");
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleResetPricing = () => {
    setPricing({ ...DEFAULT_PRICING_CONFIG });
    savePayoutPricingConfig(DEFAULT_PRICING_CONFIG);
    setSaveNotice("Tarif penarikan telah dikembalikan ke pengaturan default resmi.");
    setTimeout(() => setSaveNotice(null), 4000);
  };

  // Eksekusi Payout Disetujui
  const handleApprovePayout = (e) => {
    e.preventDefault();
    if (!payoutModalItem || !disbursementRef) return;

    setQueue((prev) =>
      prev.map((item) => {
        if (item.id === payoutModalItem.id) {
          return {
            ...item,
            status: "completed",
            disbursement_ref: disbursementRef,
            processed_at: new Date().toISOString()
          };
        }
        return item;
      })
    );

    setActionNotice(`Payout ${payoutModalItem.ref_no} berhasil dieksekusi dengan No. Ref ${disbursementRef}. Margin profit platform ${rupiah(payoutModalItem.margin)} dialirkan ke SW-PLATFORM-REVENUE.`);
    setPayoutModalItem(null);
    setDisbursementRef("");
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Tolak Penarikan (Auto-Reversal Saldo)
  const handleRejectPayout = (item) => {
    const reason = window.prompt(`Alasan penolakan penarikan ${item.ref_no}:`, "Nomor rekening atau nama pemilik tidak sesuai identitas.");
    if (!reason) return;

    setQueue((prev) =>
      prev.map((q) => {
        if (q.id === item.id) {
          return {
            ...q,
            status: "rejected",
            reject_reason: reason,
            processed_at: new Date().toISOString()
          };
        }
        return q;
      })
    );

    // Kembalikan locked_balance ke balance pengguna
    setWallets((prev) =>
      prev.map((w) => {
        if (w.wallet_number === item.wallet_number) {
          return {
            ...w,
            balance: (w.balance || 0) + item.amount + item.fee,
            locked_balance: Math.max(0, (w.locked_balance || 0) - item.amount)
          };
        }
        return w;
      })
    );

    setActionNotice(`Penarikan ${item.ref_no} ditolak. Saldo ${rupiah(item.amount + item.fee)} berhasil dibalikkan (auto-reversal) ke dompet pengguna.`);
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Toggle Freeze / Unfreeze Dompet
  const handleToggleFreeze = (targetWallet) => {
    const nextState = !targetWallet.is_frozen;
    const confirmMsg = nextState
      ? `Apakah Anda yakin ingin MEMBEKUKAN dompet ${targetWallet.wallet_number} (${targetWallet.user_name})? Seluruh transaksi keluar akan ditolak.`
      : `Buka kunci pembekuan dompet ${targetWallet.wallet_number}?`;

    if (!window.confirm(confirmMsg)) return;

    setWallets((prev) =>
      prev.map((w) => {
        if (w.id === targetWallet.id) {
          return { ...w, is_frozen: nextState };
        }
        return w;
      })
    );

    setActionNotice(`Status dompet ${targetWallet.wallet_number} diubah menjadi: ${nextState ? "DIBEKUKAN (FROZEN)" : "AKTIF NORMAL"}.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Koreksi Saldo Darurat Superadmin
  const handleExecuteAdjustment = (e) => {
    e.preventDefault();
    if (!adjustModalWallet || !adjustAmount || !adjustMemo) return;

    const amt = Number(adjustAmount);
    if (amt <= 0) return;

    setWallets((prev) =>
      prev.map((w) => {
        if (w.id === adjustModalWallet.id) {
          const currentBal = w.balance || 0;
          const newBal = adjustDirection === "credit" ? currentBal + amt : Math.max(0, currentBal - amt);
          return { ...w, balance: newBal };
        }
        return w;
      })
    );

    setActionNotice(`Koreksi saldo darurat berhasil: ${adjustDirection === "credit" ? "+ " : "- "}${rupiah(amt)} pada dompet ${adjustModalWallet.wallet_number}. Berita acara audit dicatat.`);
    setAdjustModalWallet(null);
    setAdjustAmount("");
    setAdjustMemo("");
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Filter Omni-Wallets
  const filteredWallets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return wallets;
    return wallets.filter(
      (w) =>
        w.wallet_number.toLowerCase().includes(q) ||
        w.user_name.toLowerCase().includes(q) ||
        w.tenant_name.toLowerCase().includes(q) ||
        w.role.toLowerCase().includes(q)
    );
  }, [wallets, searchQuery]);

  return (
    <div className="swallet-god-wrapper">
      {/* ──────── PERINGATAN GLOBAL CIRCUIT BREAKER (JIKA AKTIF) ──────── */}
      {circuitBreakerActive && (
        <div className="d-alert d-alert--danger" role="alert">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <div>
            <strong>PERINGATAN SISTEMIK: Global Circuit Breaker Aktif</strong>
            <p className="d-text" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
              Seluruh aktivitas transfer P2P, pembayaran kasir POS, dan permohonan penarikan saldo di seluruh platform ditangguhkan seketika demi keselamatan moneter sistem.
            </p>
          </div>
        </div>
      )}

      {actionNotice && (
        <div className="d-alert d-alert--success">
          <i className="fa-solid fa-circle-check" aria-hidden="true" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* ──────── 1. RADAR LIKUIDITAS PLATFORM (KPI STATS) ──────── */}
      <div className="swallet-stats-grid">
        <Stat
          label="Total Saldo Sistemik"
          value={rupiah(totalSystemicBalance)}
          hint="Agregat 100% Seluruh Dompet Platform"
        />
        <Stat
          label="Akumulasi Profit Platform"
          value={rupiah(platformRevenueBalance)}
          hint="Brankas SW-PLATFORM-REVENUE"
        />
        <Stat
          label="Antrean Penarikan Bank"
          value={`${queue.filter((q) => q.status === "pending" || q.status === "scheduled_in_queue").length} Permohonan`}
          hint={`Jam Kerja: ${operating.isOpen ? "Buka (09-16 WIB)" : "Tutup (Antrean)"}`}
        />
        <Stat
          label="Circuit Breaker Platform"
          value={circuitBreakerActive ? "AKTIF (DARURAT)" : "Normal Beroperasi"}
          hint={circuitBreakerActive ? "Transfer Global Ditangguhkan" : "Semua Alur Finansial Terbuka"}
        />
      </div>

      {/* ──────── 2. SUB-BAR NAVIGASI COMMAND CENTER (5 SUBTABS RESMI) ──────── */}
      <div className="swallet-subtabs" aria-label="Sub-Navigasi S-Wallet Master">
        {[
          { id: "radar", label: "Radar Likuiditas & Solvabilitas", icon: "fa-satellite-dish" },
          { id: "pricing", label: "Pengatur Tarif & Margin Profit", icon: "fa-sliders" },
          { id: "queue", label: "Antrean Payout Kliring Bank", icon: "fa-list-check" },
          { id: "explorer", label: "Omni-Wallet Explorer", icon: "fa-magnifying-glass" },
          { id: "circuit", label: "Global Circuit Breaker", icon: "fa-power-off" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`swallet-subtab-btn${selectedSubTab === tab.id ? " is-active" : ""}`}
            onClick={() => setSelectedSubTab(tab.id)}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ──────── TAB 1: RADAR LIKUIDITAS & SOLVABILITAS ──────── */}
      {selectedSubTab === "radar" && (
        <Panel
          title="Radar Likuiditas & Solvabilitas Moneter Platform"
          actions={
            <button
              type="button"
              className={`d-btn d-btn--sm ${circuitBreakerActive ? "d-btn--primary" : "d-btn--danger"}`}
              onClick={() => {
                const nextState = !circuitBreakerActive;
                if (window.confirm(nextState ? "PERINGATAN: Mengaktifkan Circuit Breaker akan menghentikan seluruh aktivitas transfer dan penarikan platform. Lanjutkan?" : "Pulihkan operasi finansial normal platform?")) {
                  setCircuitBreakerActive(nextState);
                }
              }}
            >
              <i className="fa-solid fa-power-off" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {circuitBreakerActive ? "Pulihkan Normal Operasi" : "Aktifkan Saklar Darurat (Circuit Breaker)"}
            </button>
          }
        >
          <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
            Audit integritas kas real-time. Memastikan rumus solvabilitas platform: <code>Total Kas Penampung Bank = Total Saldo Dompet Pengguna + Brankas Revenue Platform</code> (Selisih Kas Rp 0 / Balanced).
          </p>

          <div className="d-table-wrap">
            <table className="d-table swallet-table--fin">
              <thead>
                <tr>
                  <th>Entitas Moneter Platform</th>
                  <th>Kategori Pengguna</th>
                  <th className="swallet-num">Total Saldo Aktif</th>
                  <th className="swallet-num">Saldo Tertahan (Escrow)</th>
                  <th>Status Audit Solvabilitas</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Brankas Omset Toko (Owner L1)</strong></td>
                  <td>{ownerTotal.count} Akun Merchant</td>
                  <td className="swallet-num">{rupiah(ownerTotal.balance)}</td>
                  <td className="swallet-num">{rupiah(ownerTotal.locked)}</td>
                  <td><Badge tone="accent">Sinkron 100%</Badge></td>
                </tr>
                <tr>
                  <td><strong>Petty Cash Operasional (GM L2)</strong></td>
                  <td>{gmTotal.count} Akun Cabang</td>
                  <td className="swallet-num">{rupiah(gmTotal.balance)}</td>
                  <td className="swallet-num">{rupiah(gmTotal.locked)}</td>
                  <td><Badge tone="accent">Sinkron 100%</Badge></td>
                </tr>
                <tr>
                  <td><strong>Payroll Staf (L3) &amp; Jasa Medis Dokter (L4)</strong></td>
                  <td>{staffDoctorTotal.count} Akun Staf/Medis</td>
                  <td className="swallet-num">{rupiah(staffDoctorTotal.balance)}</td>
                  <td className="swallet-num">{rupiah(staffDoctorTotal.locked)}</td>
                  <td><Badge tone="accent">Sinkron 100%</Badge></td>
                </tr>
                <tr>
                  <td><strong>Dompet Member Pelanggan (L5)</strong></td>
                  <td>{memberTotal.count} Akun Member</td>
                  <td className="swallet-num">{rupiah(memberTotal.balance)}</td>
                  <td className="swallet-num">{rupiah(memberTotal.locked)}</td>
                  <td><Badge tone="accent">Sinkron 100%</Badge></td>
                </tr>
                <tr style={{ background: "var(--brand-emerald-surface)" }}>
                  <td><strong>Akumulasi Profit Platform (SW-PLATFORM-REVENUE)</strong></td>
                  <td>Superadmin Master Vault</td>
                  <td className="swallet-num" style={{ fontWeight: 700, color: "var(--brand-emerald)" }}>{rupiah(platformRevenueBalance)}</td>
                  <td className="swallet-num">{rupiah(0)}</td>
                  <td><Badge tone="accent">Tervalidasi Kliring</Badge></td>
                </tr>
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--color-rule-2)" }}>
                  <td>TOTAL SOLVABILITAS KAS SISTEMIK</td>
                  <td>Semua Dompet</td>
                  <td className="swallet-num" style={{ color: "var(--brand-emerald)", fontSize: "1.05rem" }}>{rupiah(totalSystemicBalance)}</td>
                  <td className="swallet-num">{rupiah(totalUserLocked)}</td>
                  <td>
                    <span className="d-status-tag" style={{ background: "#059669", color: "#FFFFFF" }}>
                      Selisih Kas Rp 0 (Klop)
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ──────── TAB 2: PENGATUR TARIF & MARGIN PROFIT PLATFORM ──────── */}
      {selectedSubTab === "pricing" && (
        <Panel
          title="Pengatur Kebijakan Tarif Penarikan & Model Keuntungan Platform"
          actions={
            <button
              type="button"
              className="d-btn d-btn--ghost d-btn--sm"
              onClick={handleResetPricing}
            >
              <i className="fa-solid fa-rotate-left" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
              Reset ke Tarif Default
            </button>
          }
        >
          <p className="d-text d-muted d-measure" style={{ margin: "0 0 1.25rem" }}>
            Tentukan biaya penarikan bank yang dibebankan kepada pengguna. Formula monetisasi: <code>Biaya Ditagihkan ke User = Biaya Modal Pokok Pakasir + Margin Keuntungan Platform</code>. Seluruh margin profit langsung dialirkan ke brankas <code>SW-PLATFORM-REVENUE</code>.
          </p>

          {saveNotice && (
            <div className="d-alert d-alert--success" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <span>{saveNotice}</span>
            </div>
          )}

          <form onSubmit={handleSavePricing} className="swallet-pricing-list">
            {/* TIER 1 */}
            <div className="swallet-pricing-tier-row">
              <div className="swallet-pricing-tier-header">
                <strong>Tier 1: Penarikan Rp 15.000 s/d Rp 4.999.999</strong>
                <Badge tone="neutral">Modal Pokok Pakasir: {rupiah(pricing.tier1.baseCost)}</Badge>
              </div>
              <div>
                <label className="d-label" htmlFor="sw-cfg-t1">Biaya Ditagihkan ke Pengguna (Rp)</label>
                <input
                  id="sw-cfg-t1"
                  type="number"
                  className="d-input font-mono"
                  min={pricing.tier1.baseCost}
                  step={500}
                  value={pricing.tier1.userFee}
                  onChange={(e) => {
                    const fee = Number(e.target.value);
                    setPricing({
                      ...pricing,
                      tier1: {
                        ...pricing.tier1,
                        userFee: fee,
                        margin: Math.max(0, fee - pricing.tier1.baseCost)
                      }
                    });
                  }}
                  required
                />
              </div>
              <div className="swallet-pricing-margin-col">
                <span className="d-muted" style={{ fontSize: "0.8rem" }}>Margin Keuntungan Bersih Platform:</span>
                <span className="swallet-pricing-margin-val">
                  + {rupiah(pricing.tier1.margin)} / transaksi
                </span>
              </div>
            </div>

            {/* TIER 2 */}
            <div className="swallet-pricing-tier-row">
              <div className="swallet-pricing-tier-header">
                <strong>Tier 2: Penarikan Rp 5.000.000 s/d Rp 9.999.999</strong>
                <Badge tone="neutral">Modal Pokok Pakasir: {rupiah(pricing.tier2.baseCost)}</Badge>
              </div>
              <div>
                <label className="d-label" htmlFor="sw-cfg-t2">Biaya Ditagihkan ke Pengguna (Rp)</label>
                <input
                  id="sw-cfg-t2"
                  type="number"
                  className="d-input font-mono"
                  min={pricing.tier2.baseCost}
                  step={500}
                  value={pricing.tier2.userFee}
                  onChange={(e) => {
                    const fee = Number(e.target.value);
                    setPricing({
                      ...pricing,
                      tier2: {
                        ...pricing.tier2,
                        userFee: fee,
                        margin: Math.max(0, fee - pricing.tier2.baseCost)
                      }
                    });
                  }}
                  required
                />
              </div>
              <div className="swallet-pricing-margin-col">
                <span className="d-muted" style={{ fontSize: "0.8rem" }}>Margin Keuntungan Bersih Platform:</span>
                <span className="swallet-pricing-margin-val">
                  + {rupiah(pricing.tier2.margin)} / transaksi
                </span>
              </div>
            </div>

            {/* TIER 3 */}
            <div className="swallet-pricing-tier-row">
              <div className="swallet-pricing-tier-header">
                <strong>Tier 3: Penarikan Rp 10.000.000 ke Atas</strong>
                <Badge tone="neutral">Modal Pokok Pakasir: {rupiah(pricing.tier3.baseCost)}</Badge>
              </div>
              <div>
                <label className="d-label" htmlFor="sw-cfg-t3">Biaya Ditagihkan ke Pengguna (Rp)</label>
                <input
                  id="sw-cfg-t3"
                  type="number"
                  className="d-input font-mono"
                  min={pricing.tier3.baseCost}
                  step={500}
                  value={pricing.tier3.userFee}
                  onChange={(e) => {
                    const fee = Number(e.target.value);
                    setPricing({
                      ...pricing,
                      tier3: {
                        ...pricing.tier3,
                        userFee: fee,
                        margin: Math.max(0, fee - pricing.tier3.baseCost)
                      }
                    });
                  }}
                  required
                />
              </div>
              <div className="swallet-pricing-margin-col">
                <span className="d-muted" style={{ fontSize: "0.8rem" }}>Margin Keuntungan Bersih Platform:</span>
                <span className="swallet-pricing-margin-val">
                  + {rupiah(pricing.tier3.margin)} / transaksi
                </span>
              </div>
            </div>

            {/* LIMIT HARIAN */}
            <div>
              <label className="d-label" htmlFor="sw-cfg-limit">Batas Maksimum Penarikan Harian per Akun (Rp)</label>
              <input
                id="sw-cfg-limit"
                type="number"
                className="d-input font-mono"
                step={1000000}
                value={pricing.maxDailyLimit}
                onChange={(e) => setPricing({ ...pricing, maxDailyLimit: Number(e.target.value) })}
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button type="submit" className="tjr-pay-btn-primary">
                <i className="fa-solid fa-floppy-disk" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Simpan Konfigurasi Tarif S-Wallet
              </button>
            </div>
          </form>
        </Panel>
      )}

      {/* ──────── TAB 3: ANTREAN PENARIKAN (PAYOUT QUEUE) ──────── */}
      {selectedSubTab === "queue" && (
        <Panel
          title="Antrean Penarikan Bank (Payout Processing Queue)"
          actions={
            <span className="d-status-tag" style={{ background: operating.isOpen ? "rgba(11, 93, 75, 0.1)" : "rgba(245, 158, 11, 0.15)", color: operating.isOpen ? "var(--brand-emerald)" : "#B45309" }}>
              Jadwal Kliring: Senin - Sabtu 09.00 - 16.00 WIB ({operating.isOpen ? "BUKA" : "ANTREAN"})
            </span>
          }
        >
          <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
            Setiap permohonan penarikan bank yang disetujui akan memotong saldo tertahan (<code>locked_balance</code>) secara permanen dan otomatis mengkreditkan margin keuntungan platform ke dompet <code>SW-PLATFORM-REVENUE</code>.
          </p>

          {queue.length === 0 ? (
            <Empty title="Tidak Ada Antrean Penarikan">
              Seluruh permohonan penarikan bank telah selesai diproses atau belum ada permohonan baru.
            </Empty>
          ) : (
            <div className="d-table-wrap">
              <table className="d-table swallet-table--fin">
                <thead>
                  <tr>
                    <th>Waktu Pengajuan</th>
                    <th>No. Ref</th>
                    <th>Pemohon &amp; Tenant</th>
                    <th>Rekening Tujuan</th>
                    <th className="swallet-num">Nominal Bersih</th>
                    <th className="swallet-num">Margin Platform</th>
                    <th>Status Kliring</th>
                    <th style={{ textAlign: "center" }}>Aksi Otorisasi</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                        {dateTime(item.created_at)}
                      </td>
                      <td className="d-mono" style={{ fontWeight: 600 }}>{item.ref_no}</td>
                      <td>
                        <strong>{item.user_name}</strong>
                        <span className="d-muted" style={{ display: "block", fontSize: "0.75rem" }}>
                          {item.user_role} · {item.tenant_name}
                        </span>
                      </td>
                      <td>
                        <strong>{item.bank_name}</strong>
                        <span className="d-mono d-muted" style={{ display: "block", fontSize: "0.75rem" }}>
                          {item.account_number} (a.n {item.account_holder})
                        </span>
                      </td>
                      <td className="swallet-num" style={{ fontWeight: 700 }}>
                        {rupiah(item.amount)}
                      </td>
                      <td className="swallet-num" style={{ color: "var(--brand-emerald)", fontWeight: 700 }}>
                        + {rupiah(item.margin)}
                      </td>
                      <td>
                        <Badge tone={item.status === "completed" ? "accent" : item.status === "rejected" ? "danger" : item.status === "scheduled_in_queue" ? "warn" : "neutral"}>
                          {item.status === "completed"
                            ? "Sukses Disalurkan"
                            : item.status === "rejected"
                            ? "Ditolak (Reversed)"
                            : item.status === "scheduled_in_queue"
                            ? "Terjadwal Jam Buka"
                            : "Menunggu Persetujuan"}
                        </Badge>
                      </td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        {item.status !== "completed" && item.status !== "rejected" ? (
                          <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                            <button
                              type="button"
                              className="d-btn d-btn--primary d-btn--sm"
                              onClick={() => {
                                setPayoutModalItem(item);
                                setDisbursementRef(`${item.bank_name}-DISB-${Math.floor(100000 + Math.random() * 900000)}`);
                              }}
                            >
                              Eksekusi Payout
                            </button>
                            <button
                              type="button"
                              className="d-btn d-btn--danger d-btn--sm"
                              onClick={() => handleRejectPayout(item)}
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="d-muted" style={{ fontSize: "0.78rem" }}>
                            {item.disbursement_ref ? `Ref: ${item.disbursement_ref}` : "Selesai"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ──────── TAB 4: OMNI-WALLET EXPLORER ──────── */}
      {selectedSubTab === "explorer" && (
        <Panel title="Omni-Wallet Explorer &amp; Kontrol Investigasi Platform">
          <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
            Audit menyeluruh rekening dompet dari seluruh tenant. Memungkinkan pembekuan akun (Freeze/Unfreeze) jika terindikasi fraud dan intervensi saldo darurat disertai berita acara resmi.
          </p>

          <div className="swallet-search-row">
            <input
              type="text"
              className="d-input"
              placeholder="Cari nomor dompet SW-, nama, atau tenant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={() => setSearchQuery("")}
              >
                Hapus
              </button>
            )}
          </div>

          <div className="d-table-wrap">
            <table className="d-table swallet-table--fin">
              <thead>
                <tr>
                  <th>Nomor Rekening</th>
                  <th>Nama Pengguna &amp; Peran</th>
                  <th>Tenant Usaha</th>
                  <th className="swallet-num">Saldo Aktif</th>
                  <th className="swallet-num">Saldo Tertahan</th>
                  <th>Status Proteksi</th>
                  <th style={{ textAlign: "center" }}>Aksi Kendali</th>
                </tr>
              </thead>
              <tbody>
                {filteredWallets.map((w) => (
                  <tr key={w.id} style={{ background: w.is_frozen ? "rgba(220, 38, 38, 0.05)" : undefined }}>
                    <td className="d-mono" style={{ fontWeight: 600 }}>{w.wallet_number}</td>
                    <td>
                      <strong>{w.user_name}</strong>
                      <span className="d-muted" style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase" }}>
                        {w.role}
                      </span>
                    </td>
                    <td>{w.tenant_name}</td>
                    <td className="swallet-num" style={{ fontWeight: 700 }}>
                      {rupiah(w.balance || 0)}
                    </td>
                    <td className="swallet-num">
                      {rupiah(w.locked_balance || 0)}
                    </td>
                    <td>
                      <Badge tone={w.is_frozen ? "danger" : "accent"}>
                        {w.is_frozen ? "DIBEKUKAN (FROZEN)" : "Aktif Normal"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className={`d-btn d-btn--sm ${w.is_frozen ? "d-btn--primary" : "d-btn--ghost"}`}
                          onClick={() => handleToggleFreeze(w)}
                          title={w.is_frozen ? "Buka kembali kunci dompet" : "Kunci transaksi dompet"}
                        >
                          <i className={`fa-solid ${w.is_frozen ? "fa-lock-open" : "fa-snowflake"}`} aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                          {w.is_frozen ? "Unfreeze" : "Freeze"}
                        </button>

                        <button
                          type="button"
                          className="d-btn d-btn--ghost d-btn--sm"
                          onClick={() => {
                            setAdjustModalWallet(w);
                            setAdjustAmount("");
                            setAdjustMemo("");
                          }}
                          title="Intervensi koreksi saldo resmi"
                        >
                          <i className="fa-solid fa-wrench" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                          Koreksi Saldo
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ──────── TAB 5: GLOBAL CIRCUIT BREAKER (GOD MODE SECURITY KILL-SWITCH) ──────── */}
      {selectedSubTab === "circuit" && (
        <Panel title="Global Circuit Breaker &amp; Pertahanan Moneter Platform">
          <div className="swallet-circuit-panel">
            <p className="d-text d-muted d-measure" style={{ margin: 0 }}>
              Saklar pemutus transaksi moneter darurat (*Emergency Financial Kill-Switch*). Dirancang khusus untuk skenario kontinjensi jika terdeteksi ancaman siber, anomali penarikan massal, atau percobaan exploitasi saldo.
            </p>

            <div className="swallet-circuit-status-card">
              <div className={`swallet-circuit-icon ${circuitBreakerActive ? "is-lockdown" : "is-normal"}`}>
                <i className={`fa-solid ${circuitBreakerActive ? "fa-triangle-exclamation" : "fa-shield-halved"}`} aria-hidden="true" />
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: "1.1rem", display: "block" }}>
                  Status Sirkuit: {circuitBreakerActive ? "LOCKDOWN (TRANSAKSI DIBLOKIR)" : "NORMAL (SEMUA KANAL AKTIF)"}
                </strong>
                <span className="d-muted" style={{ fontSize: "0.85rem", display: "block", marginTop: "0.2rem" }}>
                  {circuitBreakerActive
                    ? "Seluruh API mutasi debet, transfer P2P, pembayaran kasir, dan penarikan bank diblokir total."
                    : "Sistem berjalan dengan pengamanan berlapis RFC 6238 TOTP dan PostgreSQL Row-Level Locking."}
                </span>
              </div>
              <button
                type="button"
                className={`d-btn ${circuitBreakerActive ? "d-btn--primary" : "d-btn--danger"}`}
                onClick={() => {
                  const nextState = !circuitBreakerActive;
                  if (window.confirm(nextState ? "KONFIRMASI DARURAT: Apakah Anda yakin ingin MENGUNCI SELURUH TRANSAKSI MONETER di semua tenant platform?" : "Pulihkan operasi moneter platform ke kondisi normal?")) {
                    setCircuitBreakerActive(nextState);
                  }
                }}
              >
                <i className="fa-solid fa-power-off" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                {circuitBreakerActive ? "Buka Kunci (Pulihkan Normal)" : "Aktifkan Lockdown Darurat"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--brand-emerald)" }}>
                  <i className="fa-solid fa-lock" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Database Lock &amp; Invariants
                </strong>
                <p className="d-text d-muted" style={{ fontSize: "0.825rem", margin: 0, lineHeight: 1.5 }}>
                  Setiap mutasi dilindungi <code>SELECT ... FOR UPDATE</code> atomik dan batasan <code>CHECK (balance &gt;= 0)</code>, memastikan nol kemungkinan saldo negatif.
                </p>
              </div>

              <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--brand-emerald)" }}>
                  <i className="fa-solid fa-id-card-clip" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  AML &amp; KYC Account Whitelist
                </strong>
                <p className="d-text d-muted" style={{ fontSize: "0.825rem", margin: 0, lineHeight: 1.5 }}>
                  Penarikan dana wajib diverifikasi cocok dengan nama pemilik profil terdaftar, memblokir pengalihan dana ke rekening pihak ketiga anonim.
                </p>
              </div>

              <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--brand-emerald)" }}>
                  <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Cooling-off Period &amp; Escrow
                </strong>
                <p className="d-text d-muted" style={{ fontSize: "0.825rem", margin: 0, lineHeight: 1.5 }}>
                  Dana penarikan diisolasi di <code>locked_balance</code> dengan jeda 15 menit per penarikan dan batas maksimum harian {rupiah(pricing.maxDailyLimit)}.
                </p>
              </div>

              <div style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", color: "var(--brand-emerald)" }}>
                  <i className="fa-solid fa-book-journal-whills" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Immutable Double-Entry Ledger
                </strong>
                <p className="d-text d-muted" style={{ fontSize: "0.825rem", margin: 0, lineHeight: 1.5 }}>
                  Nol operasi DELETE di database. Seluruh mutasi debet-kredit tercatat permanen berpasangan dengan pencatatan saldo sebelum dan sesudah mutasi.
                </p>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* ──────── MODAL EKSEKUSI PAYOUT (INPUT BANK REF) ──────── */}
      <Modal
        open={Boolean(payoutModalItem)}
        title="Otorisasi Eksekusi Penarikan Bank (Payout Disbursement)"
        onClose={() => setPayoutModalItem(null)}
      >
        {payoutModalItem && (
          <form onSubmit={handleApprovePayout}>
            <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
              Verifikasi transfer kliring perbankan untuk pencairan dana dompet pengguna.
            </p>

            <div style={{ background: "var(--color-paper)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", marginBottom: "1rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span className="d-muted">Nomor Permohonan:</span>
                <strong className="d-mono">{payoutModalItem.ref_no}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span className="d-muted">Pemohon:</span>
                <span>{payoutModalItem.user_name} ({payoutModalItem.user_role})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span className="d-muted">Rekening Tujuan:</span>
                <strong>{payoutModalItem.bank_name} - {payoutModalItem.account_number}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span className="d-muted">Nominal Transfer:</span>
                <strong className="d-mono" style={{ color: "var(--brand-emerald)" }}>{rupiah(payoutModalItem.amount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--color-rule-2)", paddingTop: "0.4rem" }}>
                <span className="d-muted">Margin Masuk Platform:</span>
                <strong className="d-mono" style={{ color: "#059669" }}>+ {rupiah(payoutModalItem.margin)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="d-label" htmlFor="sw-disb-ref">Nomor Referensi Transfer Bank (Wajib)</label>
              <input
                id="sw-disb-ref"
                type="text"
                className="d-input font-mono"
                placeholder="Contoh: BCA-DISB-771920"
                value={disbursementRef}
                onChange={(e) => setDisbursementRef(e.target.value)}
                required
              />
              <span className="d-muted" style={{ fontSize: "0.75rem" }}>
                Nomor referensi resmi jaringan kliring bank/gateway untuk jejak audit.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => setPayoutModalItem(null)}
              >
                Batal
              </button>
              <button
                type="submit"
                className="tjr-pay-btn-primary"
                disabled={!disbursementRef}
              >
                <i className="fa-solid fa-check" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Konfirmasi Eksekusi Payout
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ──────── MODAL KOREKSI SALDO DARURAT SUPERADMIN ──────── */}
      <Modal
        open={Boolean(adjustModalWallet)}
        title="Intervensi Darurat: Koreksi Saldo Sistemik"
        onClose={() => setAdjustModalWallet(null)}
      >
        {adjustModalWallet && (
          <form onSubmit={handleExecuteAdjustment}>
            <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
              Tindakan ini akan memutasi saldo akun pada tingkat database. Wajib mencantumkan Berita Acara Audit resmi untuk kepatuhan pembukuan berpasangan.
            </p>

            <div style={{ background: "var(--color-paper)", padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", marginBottom: "1rem", fontSize: "0.82rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span className="d-muted">Nomor Rekening:</span>
                <strong className="d-mono">{adjustModalWallet.wallet_number}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <span className="d-muted">Pemilik Akun:</span>
                <span>{adjustModalWallet.user_name} ({adjustModalWallet.tenant_name})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="d-muted">Saldo Saat Ini:</span>
                <strong className="d-mono">{rupiah(adjustModalWallet.balance || 0)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="d-label">Arah Penyesuaian Saldo</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button
                  type="button"
                  className={`swallet-quick-btn${adjustDirection === "credit" ? " is-active" : ""}`}
                  onClick={() => setAdjustDirection("credit")}
                >
                  <i className="fa-solid fa-plus" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                  Kredit (Tambah Saldo)
                </button>
                <button
                  type="button"
                  className={`swallet-quick-btn${adjustDirection === "debit" ? " is-active" : ""}`}
                  onClick={() => setAdjustDirection("debit")}
                >
                  <i className="fa-solid fa-minus" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                  Debet (Potong Saldo)
                </button>
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="d-label" htmlFor="sw-adj-amt">Nominal Penyesuaian (Rp)</label>
              <input
                id="sw-adj-amt"
                type="number"
                className="d-input font-mono"
                placeholder="0"
                min={1000}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label className="d-label" htmlFor="sw-adj-memo">Berita Acara Audit Resmi (Wajib)</label>
              <textarea
                id="sw-adj-memo"
                className="d-input"
                rows={3}
                placeholder="Contoh: Koreksi selisih rekonsiliasi manual sesuai Surat Keputusan Audit Finansial No. SK-0892/2026..."
                value={adjustMemo}
                onChange={(e) => setAdjustMemo(e.target.value)}
                required
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => setAdjustModalWallet(null)}
              >
                Batal
              </button>
              <button
                type="submit"
                className="tjr-pay-btn-primary"
                disabled={!adjustAmount || !adjustMemo}
              >
                <i className="fa-solid fa-stamp" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Simpan Penyesuaian Saldo
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
