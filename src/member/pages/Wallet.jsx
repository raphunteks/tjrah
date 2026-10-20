import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { rupiah, number } from "../../lib/format.js";
import { Empty } from "../../app/ui/index.jsx";

export default function Wallet({ brand }) {
  const { user } = useAuth();
  const [showCode, setShowCode] = useState(false);
  const [codeTimer, setCodeTimer] = useState(60);

  const balance = user?.wallet_balance ?? 0;
  const points = user?.points ?? 0;
  const walletNumber = user?.wallet_number ?? "SW-MEMBER-0001";

  const handleGenerateCode = () => {
    setShowCode(true);
    setCodeTimer(60);
  };

  return (
    <>
      <section className="m-hero" aria-labelledby="m-wallet-heading">
        <h1 id="m-wallet-heading">S-Wallet Mandiri</h1>
        <div className="m-points">
          <span className="m-points__n">{rupiah(balance)}</span>
          <span style={{ fontSize: "0.9rem", color: "var(--color-muted)", alignSelf: "center" }}>Saldo Aktif</span>
        </div>

        <dl className="m-facts">
          <div>
            <dt>Nomor Akun</dt>
            <dd style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{walletNumber}</dd>
          </div>
          <div>
            <dt>Poin Loyalitas</dt>
            <dd>{number(points)} pts</dd>
          </div>
          <div>
            <dt>Status Proteksi</dt>
            <dd style={{ color: "var(--color-accent)" }}>Aktif 100%</dd>
          </div>
        </dl>
      </section>

      {/* ──────── TINDAKAN CEPAT MEMBER ──────── */}
      <section className="m-section" aria-labelledby="m-actions-t">
        <h2 id="m-actions-t">Transaksi Cepat</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
          <button
            type="button"
            className="d-btn d-btn--primary"
            onClick={handleGenerateCode}
            style={{ justifyContent: "center" }}
          >
            <i className="fa-solid fa-qrcode" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            Kode Bayar POS
          </button>
          <button
            type="button"
            className="d-btn d-btn--ghost"
            style={{ justifyContent: "center" }}
          >
            <i className="fa-solid fa-plus-circle" aria-hidden="true" style={{ marginRight: "0.4rem" }} />
            Isi Saldo (Top-Up)
          </button>
        </div>
      </section>

      {/* ──────── GENERATOR KODE BAYAR POS 60s ──────── */}
      {showCode && (
        <section className="m-section" aria-labelledby="m-otp-t">
          <div className="m-card" style={{ textAlign: "center", padding: "1.5rem" }}>
            <h3 id="m-otp-t" style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
              Kode Pembayaran Kasir Toko
            </h3>
            <p className="d-muted" style={{ fontSize: "0.82rem", margin: "0 0 1rem" }}>
              Sebutkan 6 digit kode ini kepada kasir. Berlaku selama <strong>{codeTimer} detik</strong>.
            </p>
            <div style={{ font: "700 2.25rem var(--font-mono)", letterSpacing: "0.25em", color: "var(--color-accent)" }}>
              839 201
            </div>
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="d-btn d-btn--ghost d-btn--sm"
                onClick={() => setCodeTimer(60)}
              >
                Muat Ulang Kode Baru
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ──────── MUTASI TRANSAKSI TERAKHIR ──────── */}
      <section className="m-section" aria-labelledby="m-history-t">
        <h2 id="m-history-t">Riwayat Belanja &amp; Saldo</h2>
        <div className="m-card">
          <Empty title="Belum Ada Transaksi S-Wallet">
            Mutasi pembayaran di kasir POS dan isi ulang saldo QRIS Anda akan tercatat rapi di sini.
          </Empty>
        </div>
      </section>
    </>
  );
}
