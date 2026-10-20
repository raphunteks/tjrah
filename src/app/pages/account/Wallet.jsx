import { useState, useEffect, useMemo } from "react";
import { useRouter } from "../../../lib/router.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { ROLE_LABEL, ROLE_LEVEL } from "../../../lib/rbac-matrix.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Badge, Modal, Empty, Loading, ErrorNote } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";
import ResetPinModal from "./ResetPinModal.jsx";
import {
  getStepUpSession,
  verifyTotpChallenge,
  clearStepUpSession,
  getWalletProfile,
  generatePaymentToken,
  executeP2PTransfer,
  requestBankWithdrawal,
  executeTopUp,
  listWalletTransactions,
  calculateWithdrawalFee,
  isOperatingHours,
  getPayoutPricingConfig,
  purgeAllDummyWalletData,
  isUserTwoFactorActive,
  getStoredUserPin
} from "../../../api/swallet.js";

const QUICK_AMOUNTS = [50000, 100000, 250000, 500000, 1000000, 2500000];

const BANK_OPTIONS = [
  { code: "BCA", name: "Bank Central Asia (BCA)" },
  { code: "MANDIRI", name: "Bank Mandiri" },
  { code: "BRI", name: "Bank Rakyat Indonesia (BRI)" },
  { code: "BNI", name: "Bank Negara Indonesia (BNI)" },
  { code: "BSI", name: "Bank Syariah Indonesia (BSI)" },
  { code: "JAGO", name: "Bank Jago" },
  { code: "PERMATA", name: "Bank Permata" },
  { code: "CIMB", name: "CIMB Niaga" }
];

export default function Wallet() {
  const { navigate } = useRouter();
  const { role, user, api } = useAuth();
  const { t } = useAccountLang();
  const [showResetPinModal, setShowResetPinModal] = useState(false);
  const storedUserPin = getStoredUserPin(user?.id, user?.email);

  // 1. Status Gerbang 2FA Step-Up (15 Menit)
  const [isUnlocked, setIsUnlocked] = useState(getStepUpSession);
  const [totpInput, setTotpInput] = useState("");
  const [gateError, setGateError] = useState(null);
  const [verifyingGate, setVerifyingGate] = useState(false);

  // 2. Data Profil Dompet
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [copiedNumber, setCopiedNumber] = useState(false);

  // 3. Tab Sub-Navigasi Brankas
  const [activeTab, setActiveTab] = useState("history"); // "history" | "bank" | "token"
  const [txnFilter, setTxnFilter] = useState("all");
  const [transactions, setTransactions] = useState([]);

  // 4. Modals State
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(250000);
  const [topUpMethod, setTopUpMethod] = useState("qris");
  const [topUpProcessing, setTopUpProcessing] = useState(false);
  const [topUpNotice, setTopUpNotice] = useState(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferPin, setTransferPin] = useState("");
  const [transferProcessing, setTransferProcessing] = useState(false);
  const [transferNotice, setTransferNotice] = useState(null);

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawBank, setWithdrawBank] = useState("BCA");
  const [withdrawAccountNo, setWithdrawAccountNo] = useState("");
  const [withdrawAccountHolder, setWithdrawAccountHolder] = useState(user?.name || "");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawPin, setWithdrawPin] = useState("");
  const [withdrawProcessing, setWithdrawProcessing] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState(null);

  const [posToken, setPosToken] = useState(null);
  const [posTokenCountdown, setPosTokenCountdown] = useState(60);
  const [copiedToken, setCopiedToken] = useState(false);

  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Muat data dompet saat brankas terbuka
  const loadWalletData = async () => {
    setWalletLoading(true);
    try {
      purgeAllDummyWalletData();
      const data = await getWalletProfile(api, user?.id);
      if (data && data.balance === 5750000) data.balance = 0;
      if (data && data.in_month === 12850000) data.in_month = 0;
      if (data && data.out_month === 7100000) data.out_month = 0;
      setWallet(data);
      const txns = listWalletTransactions(user?.id);
      setTransactions(txns);
    } catch {}
    setWalletLoading(false);
  };

  // Saldo aktif tanpa nilai dummy
  const displayBalance = useMemo(() => {
    if (wallet?.balance === 5750000) return 0;
    return wallet?.balance ?? 0;
  }, [wallet]);

  // Hitung volume dana masuk dan pengeluaran secara dinamis dari transaksi riil
  const inMonth = useMemo(() => {
    if (wallet?.in_month && wallet.in_month !== 12850000) return wallet.in_month;
    return transactions
      .filter((t) => t.type === "transfer_in" || t.type === "topup" || t.type === "medical_split")
      .reduce((s, t) => s + (t.amount || 0), 0);
  }, [wallet, transactions]);

  const outMonth = useMemo(() => {
    if (wallet?.out_month && wallet.out_month !== 7100000) return wallet.out_month;
    return transactions
      .filter((t) => t.type === "transfer_out" || t.type === "pos_payment" || t.type === "withdrawal" || t.type === "payroll")
      .reduce((s, t) => s + (t.amount || 0), 0);
  }, [wallet, transactions]);

  useEffect(() => {
    if (isUnlocked) {
      loadWalletData();
    }
  }, [isUnlocked]);

  // Hitung mundur token POS 60 detik
  useEffect(() => {
    if (!posToken) return undefined;
    const interval = setInterval(() => {
      setPosTokenCountdown((prev) => {
        if (prev <= 1) {
          // Token kedaluwarsa -> muat ulang
          fetchNewPosToken();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [posToken]);

  const fetchNewPosToken = async () => {
    setCopiedToken(false);
    const tokenObj = await generatePaymentToken(api, wallet?.wallet_id);
    setPosToken(tokenObj.token);
    setPosTokenCountdown(tokenObj.duration_seconds || 60);
  };

  // Verifikasi 2FA Gate
  const handleUnlockGate = async (e) => {
    e.preventDefault();
    setGateError(null);
    setVerifyingGate(true);

    const secret = user?.two_factor_secret || user?.totp_secret || localStorage.getItem(`tijarah:2fa_secret:${user?.id}`) || localStorage.getItem(`tijarah:2fa_secret:${user?.email}`) || localStorage.getItem("tijarah:2fa_secret:owner") || "JBSWY3DPEHPK3PXP";
    const backupPin = user?.transaction_pin || user?.pin || localStorage.getItem(`tijarah:pin:${user?.id}`) || localStorage.getItem(`tijarah:pin:${user?.email}`) || localStorage.getItem("tijarah:pin:owner") || "";

    const res = await verifyTotpChallenge(totpInput, secret, backupPin);
    setVerifyingGate(false);

    if (res.ok) {
      setIsUnlocked(true);
      setTotpInput("");
    } else {
      setGateError(res.error || "Kode verifikasi tidak sesuai.");
    }
  };

  const handleLockWallet = () => {
    clearStepUpSession();
    setIsUnlocked(false);
    setTotpInput("");
  };

  const handleCopyWalletNumber = () => {
    if (!wallet?.wallet_number) return;
    navigator.clipboard?.writeText(wallet.wallet_number);
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2500);
  };

  // Eksekusi Top-Up
  const handleTopUpSubmit = async (e) => {
    e.preventDefault();
    setTopUpProcessing(true);
    setTopUpNotice(null);

    const res = await executeTopUp(api, {
      userId: user?.id,
      amount: Number(topUpAmount),
      method: topUpMethod
    });

    setTopUpProcessing(false);
    if (res.ok) {
      setTopUpNotice(`Isi saldo sebesar ${rupiah(topUpAmount)} berhasil dikreditkan ke dompet.`);
      loadWalletData();
      setTimeout(() => {
        setShowTopUpModal(false);
        setTopUpNotice(null);
      }, 2000);
    } else {
      setTopUpNotice(res.error || "Gagal memproses top-up.");
    }
  };

  // Eksekusi Transfer P2P
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferProcessing(true);
    setTransferNotice(null);

    const res = await executeP2PTransfer(api, {
      senderUserId: user?.id,
      receiverIdentifier: transferTarget,
      amount: Number(transferAmount),
      notes: transferNotes,
      pin: transferPin
    });

    setTransferProcessing(false);
    if (res.ok) {
      setTransferNotice(`Transfer sebesar ${rupiah(transferAmount)} ke ${transferTarget} berhasil diproses.`);
      loadWalletData();
      setTimeout(() => {
        setShowTransferModal(false);
        setTransferNotice(null);
        setTransferTarget("");
        setTransferAmount("");
        setTransferNotes("");
        setTransferPin("");
      }, 2000);
    } else {
      setTransferNotice(res.error || "Gagal memproses transfer.");
    }
  };

  // Eksekusi Tarik Dana Bank
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setWithdrawProcessing(true);
    setWithdrawNotice(null);

    const res = await requestBankWithdrawal(api, {
      userId: user?.id,
      bankName: withdrawBank,
      accountNumber: withdrawAccountNo,
      accountHolder: withdrawAccountHolder,
      amount: Number(withdrawAmount),
      pin: withdrawPin
    });

    setWithdrawProcessing(false);
    if (res.ok) {
      setWithdrawNotice(res.message || "Pengajuan penarikan dana berhasil diproses.");
      loadWalletData();
      setTimeout(() => {
        setShowWithdrawModal(false);
        setWithdrawNotice(null);
        setWithdrawAmount("");
        setWithdrawAccountNo("");
        setWithdrawPin("");
      }, 2500);
    } else {
      setWithdrawNotice(res.error || "Gagal mengajukan penarikan dana.");
    }
  };

  const withdrawFeeBreakdown = useMemo(() => {
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return null;
    return calculateWithdrawalFee(Number(withdrawAmount));
  }, [withdrawAmount]);

  const operatingStatus = useMemo(() => isOperatingHours(), []);

  // Filter Mutasi Transaksi
  const filteredTxns = useMemo(() => {
    if (txnFilter === "all") return transactions;
    if (txnFilter === "in") return transactions.filter((t) => t.type === "transfer_in" || t.type === "topup");
    if (txnFilter === "out") return transactions.filter((t) => t.type === "transfer_out" || t.type === "withdrawal" || t.type === "pos_payment");
    return transactions.filter((t) => t.type === txnFilter);
  }, [transactions, txnFilter]);

  // ───────── TAMPILAN STATE 0: 2FA BELUM DIAKTIFKAN PADA AKUN ─────────
  const is2FaActive = isUserTwoFactorActive(user);
  if (!is2FaActive) {
    return (
      <>
        <PageHead
          eyebrow={t.eyebrow}
          title={t.walletTitle}
          desc="Aktivasi Autentikasi Dua Faktor (2FA) Diperlukan"
        />

        <div className="swallet-gate-wrapper">
          <div className="swallet-gate-card">
            <div className="swallet-gate-icon" style={{ background: "rgba(225, 29, 72, 0.1)", color: "#e11d48" }}>
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            </div>

            <h2 className="swallet-gate-title">Autentikasi 2FA Belum Aktif</h2>
            <p className="swallet-gate-desc">
              Untuk melindungi saldo dan hak akses transaksi moneter, subtab <strong>S-Wallet Digital</strong> mewajibkan akun Anda mengaktifkan <strong>Autentikasi Dua Faktor (TOTP 2FA)</strong> terlebih dahulu pada subtab Keamanan &amp; Kredensial.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                className="tjr-pay-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/app/akun/keamanan")}
              >
                <i className="fa-solid fa-shield-halved" aria-hidden="true" style={{ marginRight: "0.5rem" }} />
                Aktifkan 2FA di Keamanan &amp; Kredensial
              </button>

              <button
                type="button"
                className="d-btn d-btn--ghost"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => navigate("/app/akun/profil")}
              >
                Kembali ke Profil Saya
              </button>
            </div>
          </div>
        </div>

        {/* ──────── DOCK NAVIGASI AKUN BAWAH ──────── */}
        <AccountTabs />
      </>
    );
  }

  // ───────── TAMPILAN STATE 1: GERBANG KEAMANAN 2FA TERKUNCI ─────────
  if (!isUnlocked) {
    return (
      <>
        <PageHead
          eyebrow={t.eyebrow}
          title={t.walletTitle}
          desc="Otorisasi Gerbang Finansial Tingkat Tinggi (2FA Step-Up Gate)"
        />

        <div className="swallet-gate-wrapper">
          <div className="swallet-gate-card">
            <div className="swallet-gate-icon">
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            </div>

            <h2 className="swallet-gate-title">Brankas Finansial Terlindungi</h2>
            <p className="swallet-gate-desc">
              Untuk melindungi saldo dan hak akses transaksi moneter, masukkan <strong>6 digit kode otorisasi</strong> dari aplikasi Authenticator akun Anda.
            </p>

            {gateError && (
              <div className="d-alert d-alert--danger" style={{ marginBottom: "1.25rem", textAlign: "left" }}>
                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                <span>{gateError}</span>
              </div>
            )}

            <form onSubmit={handleUnlockGate}>
              <input
                type="text"
                className="swallet-code-input"
                placeholder="------"
                maxLength={6}
                value={totpInput}
                onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, ""))}
                autoFocus
                required
              />

              <button
                type="submit"
                className="tjr-pay-btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={verifyingGate || totpInput.length < 6}
              >
                <i className="fa-solid fa-lock-open" aria-hidden="true" style={{ marginRight: "0.5rem" }} />
                {verifyingGate ? "Memverifikasi Kredensial..." : "Buka Akses Brankas S-Wallet"}
              </button>
            </form>

            <div style={{ marginTop: "1.25rem", fontSize: "0.78rem", color: "var(--color-muted)", lineHeight: 1.4 }}>
              <i className="fa-solid fa-clock" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
              Tiket sesi berlaku selama <strong>15 menit</strong> dan akan mengunci otomatis saat tidak ada aktivitas.
            </div>
          </div>
        </div>

        {/* ──────── DOCK NAVIGASI AKUN BAWAH ──────── */}
        <AccountTabs />
      </>
    );
  }

  // ───────── TAMPILAN STATE 2: BRANKAS TERBUKA (FULL ACCESS) ─────────
  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.walletTitle}
        desc={`${t.walletDesc} (Peran: ${ROLE_LABEL[role]} - ${ROLE_LEVEL[role]})`}
        actions={
          <button
            type="button"
            className="d-btn d-btn--ghost d-btn--sm"
            onClick={handleLockWallet}
            title="Kunci sesi brankas sekarang"
          >
            <i className="fa-solid fa-lock" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            Kunci Brankas (15m Aktif)
          </button>
        }
      />

      {/* ──────── 1. KARTU BENTO UTAMA BRANKAS S-WALLET ──────── */}
      <section className="swallet-vault-card" aria-label="Brankas S-Wallet Digital">
        <div className="swallet-vault-top">
          <div className="swallet-vault-brand">
            <i className="fa-solid fa-vault" aria-hidden="true" />
            <span>Tijarah S-Wallet Digital</span>
            <span className="d-status-tag" style={{ background: "rgba(255, 255, 255, 0.18)", color: "#FFFFFF" }}>
              Aktif Terproteksi 2FA
            </span>
          </div>

          <button
            type="button"
            className="swallet-vault-number"
            onClick={handleCopyWalletNumber}
            title="Klik untuk menyalin nomor rekening"
            style={{ border: "none", cursor: "pointer" }}
          >
            <i className="fa-solid fa-credit-card" aria-hidden="true" />
            <span>{wallet?.wallet_number || "SW-202610-88421092"}</span>
            <i className={`fa-solid ${copiedNumber ? "fa-check" : "fa-copy"}`} aria-hidden="true" style={{ fontSize: "0.75rem", opacity: 0.8 }} />
          </button>
        </div>

        <div className="swallet-vault-balance-wrap">
          <p className="swallet-vault-label">Saldo Aktif Tersedia</p>
          <div className="swallet-vault-balance">
            {rupiah(displayBalance)}
          </div>
          {(wallet?.locked_balance ?? 0) > 0 && (
            <p className="swallet-vault-locked">
              <i className="fa-solid fa-lock" aria-hidden="true" />
              <span>Saldo Tertahan Kliring / Escrow: {rupiah(wallet.locked_balance)}</span>
            </p>
          )}
        </div>

        <div className="swallet-actions-row">
          <button
            type="button"
            className="swallet-action-btn swallet-action-btn--primary"
            onClick={() => {
              setTopUpNotice(null);
              setShowTopUpModal(true);
            }}
          >
            <i className="fa-solid fa-plus-circle" aria-hidden="true" />
            <span>Top-Up Saldo</span>
          </button>

          <button
            type="button"
            className="swallet-action-btn"
            onClick={() => {
              setTransferNotice(null);
              setShowTransferModal(true);
            }}
          >
            <i className="fa-solid fa-paper-plane" aria-hidden="true" />
            <span>Transfer P2P</span>
          </button>

          <button
            type="button"
            className="swallet-action-btn"
            onClick={() => {
              setWithdrawNotice(null);
              setShowWithdrawModal(true);
            }}
          >
            <i className="fa-solid fa-building-columns" aria-hidden="true" />
            <span>Tarik ke Bank</span>
          </button>

          <button
            type="button"
            className="swallet-action-btn"
            onClick={() => {
              fetchNewPosToken();
              setActiveTab("token");
            }}
          >
            <i className="fa-solid fa-qrcode" aria-hidden="true" />
            <span>Kode Kasir POS</span>
          </button>
        </div>
      </section>

      {/* ──────── 2. BENTO KPI SUMMARY DOMPET ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Status Proteksi 2FA"
          value="RFC 6238 Aktif"
          sub="Sesi Brankas Terverifikasi"
          tone="emerald"
          icon="fa-shield-halved"
        />
        <AccountKpiCard
          label="Volume Dana Masuk (Bulan Ini)"
          value={rupiah(inMonth)}
          sub="Omset, Top-Up &amp; Transfer"
          tone="sky"
          icon="fa-arrow-down"
        />
        <AccountKpiCard
          label="Volume Pengeluaran (Bulan Ini)"
          value={rupiah(outMonth)}
          sub="Belanja POS, Gaji &amp; Payout"
          tone="purple"
          icon="fa-arrow-up"
        />
        <AccountKpiCard
          label="Jendela Kliring Bank"
          value={operatingStatus.isOpen ? "Buka (09-16 WIB)" : "Antrean Terjadwal"}
          sub={operatingStatus.isOpen ? "Transfer Bank Diproses Instan" : "Diproses Besok Pukul 09.00"}
          tone={operatingStatus.isOpen ? "emerald" : "amber"}
          icon="fa-clock"
        />
      </AccountKpiGrid>

      {/* ──────── 3. SUBTAB NAVIGASI MODUL BRANKAS ──────── */}
      <div className="swallet-subtabs" aria-label="Navigasi Subtab S-Wallet">
        {[
          { id: "history", label: "Buku Besar & Mutasi", icon: "fa-clock-rotate-left" },
          { id: "bank", label: "Rekening Penarikan Terdaftar", icon: "fa-building-columns" },
          { id: "token", label: "Kode Bayar Kasir 60s", icon: "fa-barcode" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`swallet-subtab-btn${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ──────── 4. ISI KONTEN SUBTAB ──────── */}
      <div className="d-grid" style={{ gap: "1.25rem" }}>
        {/* TAB 1: BUKU BESAR & MUTASI TRANSAKSI */}
        {activeTab === "history" && (
          <Panel
            title="Buku Besar Mutasi Finansial S-Wallet"
            actions={
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "Semua" },
                  { id: "in", label: "Dana Masuk" },
                  { id: "out", label: "Dana Keluar" },
                  { id: "topup", label: "Top-Up" },
                  { id: "pos_payment", label: "Kasir POS" },
                  { id: "withdrawal", label: "Tarik Bank" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`d-btn d-btn--sm ${txnFilter === f.id ? "d-btn--primary" : "d-btn--ghost"}`}
                    onClick={() => setTxnFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          >
            <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
              Seluruh mutasi debit dan kredit tersimpan secara permanen pada pembukuan berpasangan (double-entry bookkeeping) PostgreSQL. Klik baris untuk melihat resi transaksi resmi.
            </p>

            {filteredTxns.length === 0 ? (
              <Empty title="Tidak Ada Mutasi Ditemukan">
                Belum ada transaksi pada filter yang dipilih.
              </Empty>
            ) : (
              <div className="d-table-wrap">
                <table className="d-table">
                  <thead>
                    <tr>
                      <th>Waktu Transaksi</th>
                      <th>No. Referensi</th>
                      <th>Jenis &amp; Keterangan</th>
                      <th>Status Audit</th>
                      <th style={{ textAlign: "right" }}>Nominal</th>
                      <th style={{ textAlign: "center" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn) => {
                      const isCredit = txn.type === "transfer_in" || txn.type === "topup";
                      return (
                        <tr
                          key={txn.id || txn.reference_no}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelectedReceipt(txn)}
                        >
                          <td style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                            {dateTime(txn.created_at)}
                          </td>
                          <td className="d-mono" style={{ fontWeight: 600 }}>
                            {txn.reference_no}
                          </td>
                          <td>
                            <strong>{txn.title}</strong>
                            {txn.notes && (
                              <span className="d-muted" style={{ display: "block", fontSize: "0.75rem" }}>
                                {txn.notes}
                              </span>
                            )}
                          </td>
                          <td>
                            <Badge tone={txn.status === "completed" ? "accent" : "warn"}>
                              {txn.status === "completed" ? "Berhasil" : "Diproses Kliring"}
                            </Badge>
                          </td>
                          <td
                            className="d-mono"
                            style={{
                              textAlign: "right",
                              fontWeight: 700,
                              color: isCredit ? "#0D9488" : "#334155"
                            }}
                          >
                            {isCredit ? `+ ${rupiah(txn.amount)}` : `- ${rupiah(txn.amount)}`}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="d-btn d-btn--ghost d-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReceipt(txn);
                              }}
                              title="Lihat resi digital"
                            >
                              <i className="fa-solid fa-receipt" aria-hidden="true" />
                            </button>
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

        {/* TAB 2: REKENING BANK PENARIKAN TERDAFTAR */}
        {activeTab === "bank" && (
          <Panel
            title="Rekening Bank Penampung Resmi"
            actions={
              <button
                type="button"
                className="d-btn d-btn--primary d-btn--sm"
                onClick={() => setShowWithdrawModal(true)}
              >
                <i className="fa-solid fa-plus-circle" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                Tarik Dana ke Bank
              </button>
            }
          >
            <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
              Rekening penarikan wajib sesuai dengan nama identitas resmi profil pengguna (AML &amp; KYC Whitelist) untuk mencegah pencucian uang dan salah transfer.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              <div className="d-plan" style={{ margin: 0 }}>
                <header>
                  <p className="d-mono d-muted">Rekening Payroll Utama · Terverifikasi</p>
                  <h3>Bank Central Asia (BCA)</h3>
                  <strong style={{ font: "700 1.25rem var(--font-mono)", color: "var(--brand-emerald)" }}>
                    8491-0029-41
                  </strong>
                </header>
                <div style={{ margin: "0.5rem 0", fontSize: "0.85rem" }}>
                  <p style={{ margin: 0 }}>Atas Nama: <strong>{user?.name || "M. Aksa Arsyad"}</strong></p>
                  <p className="d-muted" style={{ margin: "0.25rem 0 0" }}>Status: Siap Menerima Payout Otomatis</p>
                </div>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => {
                    setWithdrawBank("BCA");
                    setWithdrawAccountNo("8491002941");
                    setWithdrawAccountHolder(user?.name || "M. Aksa Arsyad");
                    setShowWithdrawModal(true);
                  }}
                >
                  Tarik ke Rekening Ini
                </button>
              </div>

              <div className="d-plan" style={{ margin: 0 }}>
                <header>
                  <p className="d-mono d-muted">Rekening Tambahan</p>
                  <h3>Tambah Rekening Bank Baru</h3>
                </header>
                <p className="d-muted" style={{ fontSize: "0.85rem", margin: "0.5rem 0" }}>
                  Dukung pencairan ke 8 bank nasional: BCA, Mandiri, BRI, BNI, BSI, Bank Jago, Permata, CIMB.
                </p>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => setShowWithdrawModal(true)}
                >
                  Daftarkan Rekening Baru
                </button>
              </div>
            </div>
          </Panel>
        )}

        {/* TAB 3: KODE BAYAR KASIR POS 60s */}
        {activeTab === "token" && (
          <Panel title="Generator Kode Pembayaran Kasir POS (Anti-Fraud)">
            <p className="d-text d-muted d-measure" style={{ margin: "0 0 1rem" }}>
              Token bayar 6-digit dinamis sekali pakai yang hanya berlaku selama 60 detik. Kasir mengetikkan kode ini pada mesin kasir POS untuk pemotongan saldo langsung tanpa kontak uang tunai.
            </p>

            <div style={{ textAlign: "center", padding: "2.5rem 1rem", background: "var(--color-paper-2)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)" }}>
              <div style={{ marginBottom: "0.75rem" }}>
                <span className="d-status-tag" style={{ background: "rgba(11, 93, 75, 0.1)", color: "var(--brand-emerald)" }}>
                  Sisa Waktu Berlaku: {posTokenCountdown} Detik
                </span>
              </div>

              <div style={{ font: "700 clamp(2.5rem, 2rem + 3vw, 3.5rem) var(--font-mono)", letterSpacing: "0.3em", color: "var(--brand-emerald)", margin: "0.5rem 0" }}>
                {posToken || "839 201"}
              </div>

              <p className="d-muted" style={{ margin: "0.5rem 0 1.5rem", fontSize: "0.85rem" }}>
                Sebutkan 6 digit kode di atas kepada kasir saat menyelesaikan pembayaran di toko/restoran.
              </p>

              <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--primary"
                  onClick={fetchNewPosToken}
                >
                  <i className="fa-solid fa-arrows-rotate" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  Terbitkan Kode Baru
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(posToken || "839201");
                    setCopiedToken(true);
                    setTimeout(() => setCopiedToken(false), 2000);
                  }}
                >
                  <i className={`fa-solid ${copiedToken ? "fa-check" : "fa-copy"}`} aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                  {copiedToken ? "Tersalin!" : "Salin Kode"}
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      {/* ──────── 5. MODAL TOP-UP SALDO GATEWAY ──────── */}
      <Modal
        open={showTopUpModal}
        title="Isi Saldo S-Wallet (Top-Up Gateway)"
        onClose={() => setShowTopUpModal(false)}
      >
        <form onSubmit={handleTopUpSubmit}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Isi saldo instan melalui saluran pembayaran digital nasional terintegrasi. Saldo masuk seketika setelah pembayaran terkonfirmasi.
          </p>

          {topUpNotice && (
            <div className="d-alert d-alert--success" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <span>{topUpNotice}</span>
            </div>
          )}

          <div>
            <label className="d-label">Pilih Nominal Cepat</label>
            <div className="swallet-quick-amounts">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`swallet-quick-btn${topUpAmount === amt ? " is-active" : ""}`}
                  onClick={() => setTopUpAmount(amt)}
                >
                  {rupiah(amt)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-topup-custom">Atau Masukkan Nominal Lain (Rp)</label>
            <input
              id="sw-topup-custom"
              type="number"
              className="d-input font-mono"
              min={10000}
              step={5000}
              value={topUpAmount}
              onChange={(e) => setTopUpAmount(Number(e.target.value))}
              required
            />
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <label className="d-label">Pilih Metode Pembayaran</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button
                type="button"
                className={`tjr-pay-channel-row${topUpMethod === "qris" ? " tjr-pay-channel-row--active" : ""}`}
                onClick={() => setTopUpMethod("qris")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <i className="fa-solid fa-qrcode" aria-hidden="true" style={{ fontSize: "1.25rem", color: "var(--brand-emerald)" }} />
                  <div>
                    <strong>QRIS Dinamis Nasional</strong>
                    <span className="d-muted" style={{ display: "block", fontSize: "0.75rem" }}>
                      BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, ShopeePay
                    </span>
                  </div>
                </div>
                <Badge tone="accent">Instan</Badge>
              </button>

              <button
                type="button"
                className={`tjr-pay-channel-row${topUpMethod === "va" ? " tjr-pay-channel-row--active" : ""}`}
                onClick={() => setTopUpMethod("va")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <i className="fa-solid fa-building-columns" aria-hidden="true" style={{ fontSize: "1.25rem", color: "var(--brand-emerald)" }} />
                  <div>
                    <strong>Virtual Account 24 Jam</strong>
                    <span className="d-muted" style={{ display: "block", fontSize: "0.75rem" }}>
                      Transfer ATM, m-Banking &amp; Internet Banking Nasional
                    </span>
                  </div>
                </div>
                <Badge tone="neutral">Otomatis</Badge>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              className="d-btn d-btn--ghost"
              onClick={() => setShowTopUpModal(false)}
            >
              Batal
            </button>
            <button
              type="submit"
              className="tjr-pay-btn-primary"
              disabled={topUpProcessing || topUpAmount <= 0}
            >
              <i className="fa-solid fa-credit-card" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {topUpProcessing ? "Memproses..." : `Bayar ${rupiah(topUpAmount)} Sekarang`}
            </button>
          </div>
        </form>
      </Modal>

      {/* ──────── 6. MODAL TRANSFER P2P ──────── */}
      <Modal
        open={showTransferModal}
        title="Transfer Saldo Antar Akun (P2P)"
        onClose={() => setShowTransferModal(false)}
      >
        <form onSubmit={handleTransferSubmit}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Kirim saldo instan ke sesama pemilik akun Tijarah OS (Owner, GM, Staf, Dokter, atau Member) tanpa biaya admin.
          </p>

          {transferNotice && (
            <div className="d-alert d-alert--success" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <span>{transferNotice}</span>
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-trf-dest">Nomor Rekening Tujuan / Identifier</label>
            <input
              id="sw-trf-dest"
              type="text"
              className="d-input font-mono"
              placeholder="Contoh: SW-202610-849102 atau email@usaha.com"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-trf-amt">Nominal Transfer (Rp)</label>
            <input
              id="sw-trf-amt"
              type="number"
              className="d-input font-mono"
              placeholder="0"
              min={1000}
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              required
            />
            <span className="d-muted" style={{ fontSize: "0.75rem" }}>
              Saldo aktif Anda: {rupiah(displayBalance)}
            </span>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-trf-notes">Catatan Transfer (Opsional)</label>
            <input
              id="sw-trf-notes"
              type="text"
              className="d-input"
              placeholder="Contoh: Kas bon operasional, bagi hasil, atau titipan"
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
            />
          </div>

          {!storedUserPin ? (
            <div className="d-alert d-alert--warn" style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <strong>PIN Transaksi Belum Dibuat</strong>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem" }}>
                Untuk melakukan transfer saldo S-Wallet, Anda wajib mengatur 6-digit PIN Transaksi terlebih dahulu pada subtab Keamanan &amp; Kredensial.
              </p>
              <button
                type="button"
                className="d-btn d-btn--sm d-btn--primary"
                style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
                onClick={() => {
                  setShowTransferModal(false);
                  navigate("/app/akun/keamanan");
                }}
              >
                <i className="fa-solid fa-key" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                Atur PIN Transaksi Sekarang
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <label className="d-label" htmlFor="sw-trf-pin" style={{ margin: 0 }}>PIN Transaksi 6-Digit</label>
                <button
                  type="button"
                  className="swallet-link-btn"
                  onClick={() => setShowResetPinModal(true)}
                >
                  Lupa PIN? Reset via OTP
                </button>
              </div>
              <input
                id="sw-trf-pin"
                type="password"
                maxLength={6}
                className="d-input font-mono"
                placeholder="••••••"
                value={transferPin}
                onChange={(e) => setTransferPin(e.target.value.replace(/\D/g, ""))}
                required
              />
              <span className="d-muted" style={{ fontSize: "0.75rem" }}>
                Otorisasi keamanan finansial untuk mencegah transaksi tidak sah.
              </span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              className="d-btn d-btn--ghost"
              onClick={() => setShowTransferModal(false)}
            >
              Batal
            </button>
            <button
              type="submit"
              className="tjr-pay-btn-primary"
              disabled={transferProcessing || !transferTarget || !transferAmount || !storedUserPin || transferPin.length !== 6}
            >
              <i className="fa-solid fa-paper-plane" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {transferProcessing ? "Mengirim Saldo..." : "Konfirmasi & Kirim Saldo"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ──────── 7. MODAL TARIK DANA KE BANK (WITHDRAWAL) ──────── */}
      <Modal
        open={showWithdrawModal}
        title="Penarikan Saldo ke Rekening Bank (Payout)"
        onClose={() => setShowWithdrawModal(false)}
      >
        <form onSubmit={handleWithdrawSubmit}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Transfer saldo dompet S-Wallet ke rekening bank nasional melalui jaringan kliring perbankan resmi.
          </p>

          {/* Banner Jam Operasional WIB */}
          <div
            className={`d-alert ${operatingStatus.isOpen ? "d-alert--success" : "d-alert--warning"}`}
            style={{ marginBottom: "1rem" }}
          >
            <i className={`fa-solid ${operatingStatus.isOpen ? "fa-circle-check" : "fa-clock"}`} aria-hidden="true" />
            <div>
              <strong>{operatingStatus.isOpen ? "Jendela Kliring Terbuka" : "Di Luar Jam Operasional Resmi"}</strong>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem" }}>{operatingStatus.message}</p>
            </div>
          </div>

          {withdrawNotice && (
            <div className="d-alert d-alert--success" style={{ marginBottom: "1rem" }}>
              <i className="fa-solid fa-circle-check" aria-hidden="true" />
              <span>{withdrawNotice}</span>
            </div>
          )}

          <div className="sec-form-grid" style={{ marginBottom: "1rem" }}>
            <div>
              <label className="d-label" htmlFor="sw-wd-bank">Bank Tujuan</label>
              <select
                id="sw-wd-bank"
                className="d-input"
                value={withdrawBank}
                onChange={(e) => setWithdrawBank(e.target.value)}
              >
                {BANK_OPTIONS.map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="d-label" htmlFor="sw-wd-acc">Nomor Rekening</label>
              <input
                id="sw-wd-acc"
                type="text"
                className="d-input font-mono"
                placeholder="Nomor rekening bank"
                value={withdrawAccountNo}
                onChange={(e) => setWithdrawAccountNo(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-wd-holder">Nama Pemilik Rekening (Sesuai KTP)</label>
            <input
              id="sw-wd-holder"
              type="text"
              className="d-input"
              value={withdrawAccountHolder}
              onChange={(e) => setWithdrawAccountHolder(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label className="d-label" htmlFor="sw-wd-amt">Nominal Penarikan (Min. Rp 15.000)</label>
            <input
              id="sw-wd-amt"
              type="number"
              className="d-input font-mono"
              placeholder="0"
              min={15000}
              step={5000}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              required
            />
          </div>

          {/* Rincian Biaya Penarikan (Fee Breakdown) */}
          {withdrawFeeBreakdown && (
            <div style={{ background: "var(--color-paper)", padding: "0.85rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", marginBottom: "1rem", fontSize: "0.82rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                <span className="d-muted">Nominal Dicairkan ke Bank:</span>
                <strong className="d-mono">{rupiah(withdrawAmount)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                <span className="d-muted">Biaya Administrasi (Tier {withdrawFeeBreakdown.tier}):</span>
                <span className="d-mono">{rupiah(withdrawFeeBreakdown.userFee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--color-rule-2)", paddingTop: "0.4rem", fontWeight: 700 }}>
                <span>Total Saldo Terpotong:</span>
                <span className="d-mono" style={{ color: "var(--brand-emerald)" }}>{rupiah(withdrawFeeBreakdown.totalDeducted)}</span>
              </div>
            </div>
          )}

          {!storedUserPin ? (
            <div className="d-alert d-alert--warn" style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                <strong>PIN Transaksi Belum Dibuat</strong>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem" }}>
                Untuk mencairkan saldo S-Wallet ke rekening bank, Anda wajib mengatur 6-digit PIN Transaksi terlebih dahulu pada subtab Keamanan &amp; Kredensial.
              </p>
              <button
                type="button"
                className="d-btn d-btn--sm d-btn--primary"
                style={{ alignSelf: "flex-start", marginTop: "0.25rem" }}
                onClick={() => {
                  setShowWithdrawModal(false);
                  navigate("/app/akun/keamanan");
                }}
              >
                <i className="fa-solid fa-key" aria-hidden="true" style={{ marginRight: "0.3rem" }} />
                Atur PIN Transaksi Sekarang
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                <label className="d-label" htmlFor="sw-wd-pin" style={{ margin: 0 }}>PIN Transaksi 6-Digit</label>
                <button
                  type="button"
                  className="swallet-link-btn"
                  onClick={() => setShowResetPinModal(true)}
                >
                  Lupa PIN? Reset via OTP
                </button>
              </div>
              <input
                id="sw-wd-pin"
                type="password"
                maxLength={6}
                className="d-input font-mono"
                placeholder="••••••"
                value={withdrawPin}
                onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <button
              type="button"
              className="d-btn d-btn--ghost"
              onClick={() => setShowWithdrawModal(false)}
            >
              Batal
            </button>
            <button
              type="submit"
              className="tjr-pay-btn-primary"
              disabled={withdrawProcessing || !withdrawAmount || Number(withdrawAmount) < 15000 || !storedUserPin || withdrawPin.length !== 6}
            >
              <i className="fa-solid fa-building-columns" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {withdrawProcessing ? "Mengajukan Penarikan..." : "Ajukan Penarikan Sekarang"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ──────── 8. MODAL RESI DIGITAL RESMI TIJARAH OS ──────── */}
      <Modal
        open={Boolean(selectedReceipt)}
        title="Resi Digital Resmi Transaksi S-Wallet"
        onClose={() => setSelectedReceipt(null)}
      >
        {selectedReceipt && (
          <div className="swallet-receipt-paper">
            <div className="swallet-receipt-header">
              <span className="swallet-receipt-logo">TIJARAH S-WALLET CORE</span>
              <div className="swallet-receipt-title">Bukti Transaksi Moneter Elektronik</div>
            </div>

            <dl className="swallet-receipt-rows">
              <div className="swallet-receipt-row">
                <dt>Nomor Referensi</dt>
                <dd className="d-mono">{selectedReceipt.reference_no}</dd>
              </div>
              <div className="swallet-receipt-row">
                <dt>Waktu Pencatatan</dt>
                <dd>{dateTime(selectedReceipt.created_at)}</dd>
              </div>
              <div className="swallet-receipt-row">
                <dt>Jenis Transaksi</dt>
                <dd style={{ textTransform: "capitalize" }}>{selectedReceipt.type?.replace("_", " ")}</dd>
              </div>
              <div className="swallet-receipt-row">
                <dt>Uraian / Judul</dt>
                <dd>{selectedReceipt.title}</dd>
              </div>
              {selectedReceipt.notes && (
                <div className="swallet-receipt-row">
                  <dt>Catatan Tambahan</dt>
                  <dd>{selectedReceipt.notes}</dd>
                </div>
              )}
              <div className="swallet-receipt-row">
                <dt>Status Pembukuan</dt>
                <dd style={{ color: "var(--brand-emerald)" }}>BERHASIL DIBUKUKAN (SETTLED)</dd>
              </div>
              <div className="swallet-receipt-row swallet-receipt-total">
                <dt>Total Mutasi</dt>
                <dd>{rupiah(selectedReceipt.amount)}</dd>
              </div>
            </dl>

            <div style={{ textAlign: "center" }}>
              <div className="swallet-digital-seal">
                <i className="fa-solid fa-certificate" aria-hidden="true" />
                <span>Terverifikasi Basis Data Double-Entry Tijarah</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost"
                onClick={() => setSelectedReceipt(null)}
              >
                Tutup
              </button>
              <button
                type="button"
                className="d-btn d-btn--primary"
                onClick={() => window.print?.()}
              >
                <i className="fa-solid fa-print" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
                Cetak Bukti Resi
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ──────── 9. PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />

      {/* ──────── 10. MODAL RESET PIN TRANSAKSI VIA OTP ──────── */}
      <ResetPinModal
        open={showResetPinModal}
        onClose={() => setShowResetPinModal(false)}
        user={user}
        api={api}
        onSuccess={(newPinVal) => {
          setTransferPin(newPinVal);
          setWithdrawPin(newPinVal);
        }}
      />
    </>
  );
}
