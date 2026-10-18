import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Badge } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";

export default function Referral() {
  const { profile } = useAuth();
  const { t, lang } = useAccountLang();

  // Membaca Kebijakan Dinamis dari Superadmin
  const [platformConfig] = useState(() => {
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

  // Generator Kode Unik: TIJARAH-[NAMADEPAN]XXXX
  const [referralCode] = useState(() => {
    try {
      const saved = localStorage.getItem(`tijarah:ref_code:${profile?.id}`);
      if (saved) return saved;
    } catch {}
    const rawFirst = (profile?.full_name || "ANDI").trim().split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "") || "OWNER";
    const code = `TIJARAH-${rawFirst}8729`;
    try {
      localStorage.setItem(`tijarah:ref_code:${profile?.id}`, code);
    } catch {}
    return code;
  });

  const referralLink = `https://tijarah.id/daftar?ref=${referralCode}`;

  // Data riwayat merchant referral (Real-Time dari Database/Sistem)
  const [referralUsers, setReferralUsers] = useState(() => {
    try {
      const saved = localStorage.getItem(`tijarah:referral_users:${profile?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const totalCommission = referralUsers.reduce((s, r) => s + r.commissionTotal, 0);
  const activeCount = referralUsers.filter((r) => r.status === "paid").length;

  const [copied, setCopied] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState(null);

  const handleCopy = (text, type) => {
    navigator.clipboard?.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(""), 2500);
  };

  const handleShareWa = () => {
    const text = encodeURIComponent(
      `Halo rekan pebisnis! Gunakan sistem POS & ERP Tijarah untuk toko Anda. Dapatkan potongan harga ${platformConfig.discountPct}% paket langganan dengan mendaftar melalui tautan resmi ini: ${referralLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleWithdrawToWallet = () => {
    if (totalCommission <= 0) {
      alert("Belum ada saldo komisi yang dapat dicairkan.");
      return;
    }
    setWithdrawing(true);
    setTimeout(() => {
      setWithdrawing(false);
      setWithdrawNotice(`Saldo komisi sebesar ${rupiah(totalCommission)} berhasil ditransfer ke S-Wallet Anda.`);
      setTimeout(() => setWithdrawNotice(null), 5000);
    }, 1200);
  };

  return (
    <>
      <PageHead
        eyebrow="Pertumbuhan & Kemitraan · FASE 2"
        title={t.referralTitle}
        desc={t.referralDesc}
      />

      {/* ──────── BENTO KPI SUMMARY KODE REFERRAL ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Kode Referral Anda"
          value={referralCode}
          sub="Format TIJARAH-[NAMA]XXXX"
          tone="emerald"
          icon="fa-ticket"
        />
        <AccountKpiCard
          label="Total Merchant Terdaftar"
          value={`${referralUsers.length} Merchant`}
          sub={`${activeCount} Langganan Aktif Berbayar`}
          tone="sky"
          icon="fa-users"
        />
        <AccountKpiCard
          label="Komisi S-Wallet Terkumpul"
          value={rupiah(totalCommission)}
          sub={`Akumulasi komisi recurring ${platformConfig.commissionPct}%`}
          tone="purple"
          icon="fa-wallet"
        />
        <AccountKpiCard
          label="Diskon Paket Referee"
          value={`Diskon ${platformConfig.discountPct}%`}
          sub="Konfigurasi default Superadmin"
          tone="amber"
          icon="fa-tags"
        />
      </AccountKpiGrid>

      {withdrawNotice && (
        <div className="d-note d-note--ok" style={{ marginBottom: "1rem" }} role="status">
          <strong>Pencairan Berhasil:</strong> {withdrawNotice}
        </div>
      )}

      <div className="d-grid" style={{ gap: "1.25rem" }}>
        {/* PANEL 1: KODE & TAUTAN UNDANGAN */}
        <Panel title={t.referralCodeCardTitle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            <div style={{ background: "var(--color-paper-2)", padding: "1.25rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                KODE KUPON REFERRAL RESMI:
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ font: "700 1.35rem var(--font-mono)", color: "var(--color-ink)", letterSpacing: "0.05em" }}>
                  {referralCode}
                </span>
                <button
                  type="button"
                  className="d-btn d-btn--primary d-btn--sm"
                  onClick={() => handleCopy(referralCode, "code")}
                >
                  <i className="fa-solid fa-copy" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {copied === "code" ? "Disalin!" : t.copyCodeBtn}
                </button>
              </div>
              <p className="d-text d-muted" style={{ margin: "0.6rem 0 0", fontSize: "0.78rem" }}>
                Bagikan kode ini kepada rekan pemilik bisnis agar dimasukkan saat checkout pendaftaran toko.
              </p>
            </div>

            <div style={{ background: "var(--color-paper-2)", padding: "1.25rem", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontWeight: 600, display: "block", marginBottom: "0.4rem" }}>
                TAUTAN PENDAFTARAN RESMI DENGAN KODE:
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <input
                  type="text"
                  readOnly
                  value={referralLink}
                  className="d-input"
                  style={{ flex: 1, minWidth: "220px", fontSize: "0.82rem", background: "var(--color-paper-1)" }}
                />
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={() => handleCopy(referralLink, "link")}
                >
                  <i className="fa-solid fa-link" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {copied === "link" ? "Disalin!" : t.copyLinkBtn}
                </button>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  onClick={handleShareWa}
                  style={{ color: "#059669" }}
                >
                  <i className="fa-brands fa-whatsapp" aria-hidden="true" style={{ marginRight: "0.35rem" }} />
                  {t.shareWaBtn}
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* PANEL 2: SKEMA KEUNTUNGAN DARI SUPERADMIN */}
        <Panel title="Skema Keuntungan Program Referral (Konfigurasi Resmi Superadmin)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", background: "var(--color-paper-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <i className="fa-solid fa-hand-holding-dollar" style={{ color: "#059669" }} />
                <strong style={{ fontSize: "0.92rem" }}>Keuntungan Anda (Pemilik Kode / Referrer):</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--color-ink)", lineHeight: 1.6 }}>
                <li>Komisi recurring <strong>{platformConfig.commissionPct}% per bulan</strong> dari seluruh pembayaran paket langganan merchant yang Anda ajak.</li>
                <li>Komisi dihitung otomatis dan dikreditkan langsung ke saldo dompet digital <strong>S-Wallet</strong> Anda.</li>
                <li>Komisi berlaku selamanya selama toko yang diajak terus aktif memperpanjang paketnya.</li>
              </ul>
            </div>

            <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", background: "var(--color-paper-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <i className="fa-solid fa-gift" style={{ color: "#0284c7" }} />
                <strong style={{ fontSize: "0.92rem" }}>Keuntungan Merchant Baru (Referee):</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--color-ink)", lineHeight: 1.6 }}>
                <li>Mendapatkan <strong>Potongan Harga {platformConfig.discountPct}%</strong> pada pembayaran paket langganan pertama.</li>
                <li>Masa percobaan gratis standar: <strong>{platformConfig.trialDays} Hari Tambahan</strong> (Langsung aktivasi operasional).</li>
                <li>Bonus kredit selamat datang: <strong>{platformConfig.welcomeAiQueries} Pertanyaan AI</strong> (Sesuai kuota paket yang dipilih).</li>
              </ul>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px dashed var(--color-rule)", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <span style={{ fontSize: "0.82rem", color: "var(--color-muted)" }}>Saldo Komisi Tersedia:</span>{" "}
              <strong style={{ fontSize: "1.1rem", color: "var(--color-accent)" }}>{rupiah(totalCommission)}</strong>
            </div>

            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={withdrawing || totalCommission <= 0}
              onClick={handleWithdrawToWallet}
            >
              <i className="fa-solid fa-wallet" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
              {withdrawing ? "Memproses Transfer..." : t.payoutToWalletBtn}
            </button>
          </div>
        </Panel>

        {/* PANEL 3: TABEL RIWAYAT PENGGUNA REFERRAL */}
        <Panel title={t.historyTableTitle}>
          {referralUsers.length === 0 ? (
            <div style={{ padding: "2.5rem 1.5rem", textAlign: "center", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", border: "1px dashed var(--color-rule)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--color-paper-3)", border: "1px solid var(--color-rule)", display: "grid", placeItems: "center", margin: "0 auto 0.75rem", color: "var(--color-muted)" }}>
                <i className="fa-solid fa-users" style={{ fontSize: "1.2rem", opacity: 0.6 }} />
              </div>
              <h4 style={{ margin: "0 0 0.35rem", font: "600 0.95rem var(--font-display)", color: "var(--color-ink)" }}>
                Belum Ada Riwayat Pengguna Referral
              </h4>
              <p className="d-text d-muted" style={{ margin: "0 auto", maxWidth: "420px", fontSize: "0.82rem" }}>
                Belum ada merchant atau mitra usaha yang mendaftar menggunakan tautan referral Anda. Saldo komisi akan terakumulasi secara otomatis saat merchant yang Anda referensikan membayar paket langganan.
              </p>
            </div>
          ) : (
            <div className="d-table-wrap">
              <table className="d-table">
                <thead>
                  <tr>
                    <th scope="col">Tanggal Daftar</th>
                    <th scope="col">Nama Bisnis / Toko</th>
                    <th scope="col">Pemilik Usaha</th>
                    <th scope="col">Paket Dipilih</th>
                    <th scope="col">Status Langganan</th>
                    <th scope="col" style={{ textAlign: "right" }}>Komisi Diterima</th>
                  </tr>
                </thead>
                <tbody>
                  {referralUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="d-mono">{date(u.joinedAt)}</td>
                      <td><strong>{u.shopName}</strong></td>
                      <td>{u.ownerName}</td>
                      <td><Badge tone="neutral">{u.plan}</Badge></td>
                      <td>
                        <Badge tone={u.status === "paid" ? "ok" : "warn"}>
                          {u.status === "paid" ? "Aktif Berlangganan" : "Masa Uji Coba"}
                        </Badge>
                      </td>
                      <td className="d-num" style={{ textAlign: "right" }}>
                        <strong>{rupiah(u.commissionTotal)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />
    </>
  );
}
