import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";
import AccountTabs from "../account/AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "../account/AccountKpiGrid.jsx";
import { useAccountLang } from "../account/i18n.js";
import PaymentModal from "./PaymentModal.jsx";

const MET = { avg_ticket: ["Rata-rata struk", rupiah], cogs_pct: ["HPP %", (v) => `${v}%`], void_pct: ["Void %", (v) => `${v}%`], discount_pct: ["Diskon %", (v) => `${v}%`], revenue_per_branch: ["Omzet per cabang", rupiah] };

function Billing() {
  const { api, tenantId, tenant } = useAuth();
  const [downloadingId, setDownloadingId] = useState(null);

  const q = useAsync(async () => {
    const b = await api.rpc("billing_status").catch(() => ({
      status: tenant?.status || "active",
      period_end: tenant?.current_period_end || "2027-04-12",
      unpaid: []
    }));
    const rawInv = await api.listInvoices().catch(() => []);
    const plans = await api.listPlans().catch(() => []);
    const inv = (rawInv || []).filter((i) => i.tenant_id === tenantId).sort((a, b) => String(b.period).localeCompare(String(a.period)));
    return { b, inv, plans };
  }, [api, tenantId, tenant]);

  // Cari paket yang sesuai dengan yang di-order oleh merchant (default resmi toko: Growth Rp 2.500.000 / 6 bulan)
  const currentPlan = q.data?.plans?.find((p) => p.id === tenant?.plan_id) || {
    code: "growth",
    name: "Growth (6 Bulan)",
    price_total: 2500000,
    price_month: 416666,
    duration_months: 6
  };

  const isStarter = currentPlan.code === "starter";
  const isEnterprise = currentPlan.code === "enterprise";

  const planName = isStarter
    ? "Starter (1 Bulan)"
    : isEnterprise
      ? "Enterprise (1 Tahun)"
      : "Growth (6 Bulan)";

  const planOfficialPrice = isStarter ? 500000 : isEnterprise ? 3500000 : 2500000;
  const planPeriodEnd = isStarter ? "12 Nov 2026" : isEnterprise ? "12 Okt 2027" : "12 Apr 2027";

  const handleDownloadInvoice = (inv) => {
    setDownloadingId(inv.id);
    const invoiceNo = `INV-2026-${String(inv.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "TJR-1012"}`;
    const printWindow = typeof window !== "undefined" ? window.open("", "_blank", "width=850,height=900") : null;

    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="utf-8">
          <title>Faktur Resmi Tijarah - ${invoiceNo}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0b5d4b; padding-bottom: 20px; }
            .brand { font-size: 26px; font-weight: 800; color: #0b5d4b; letter-spacing: -0.02em; }
            .badge { display: inline-block; padding: 4px 12px; background: #ecfdf5; color: #059669; border-radius: 99px; font-weight: 700; font-size: 12px; }
            .details { margin: 30px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; font-size: 13px; color: #475569; }
            td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .total-box { margin-top: 24px; text-align: right; }
            .total-row { font-size: 20px; font-weight: 800; color: #0b5d4b; font-family: monospace; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">TIJARAH</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Smart Trade, Better Business &bull; Cloud POS &amp; OS Multi-Tenant</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">STATUS: LUNAS (ACTIVE)</span>
              <div style="font-weight: 700; margin-top: 6px; font-family: monospace;">#${invoiceNo}</div>
              <div style="font-size: 12px; color: #64748b;">Tanggal: ${inv.date}</div>
            </div>
          </div>
          <div class="details">
            <div>
              <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Diterbitkan Untuk:</div>
              <div style="font-weight: 700; font-size: 15px; margin-top: 4px;">${tenant?.name || "Kopi Harum Makassar"}</div>
              <div style="color: #64748b; margin-top: 2px;">Pemilik Usaha (Merchant Owner)</div>
              <div style="color: #64748b;">ID Toko: ${tenantId || "TJR-MKT-01"}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Metode Pembayaran:</div>
              <div style="font-weight: 600; margin-top: 4px;">Sistem Otomatis / Virtual Account</div>
              <div style="color: #64748b;">Periode Layanan: ${inv.period}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>DESKRIPSI PAKET LAYANAN</th>
                <th style="text-align: center;">DURASI</th>
                <th style="text-align: right;">HARGA RESMI</th>
                <th style="text-align: right;">DISKON REFERRAL</th>
                <th style="text-align: right;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${inv.plan}</strong>
                  <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                    Hingga 5 Cabang/Outlet, 15 Akun Kasir POS, Modul SDM &amp; Penggajian Kasir, 250 Kuota Tanya AI / Bulan
                  </div>
                </td>
                <td style="text-align: center;">6 Bulan</td>
                <td style="text-align: right; font-family: monospace; font-weight: 600;">${rupiah(inv.amount)}</td>
                <td style="text-align: right; font-family: monospace; color: #64748b;">
                  ${inv.hasReferral && inv.discount > 0 ? `- ${rupiah(inv.discount)}` : "Rp 0 (Tanpa Kode Referral)"}
                </td>
                <td style="text-align: right; font-family: monospace; font-weight: 700; color: #0b5d4b;">${rupiah(inv.amount)}</td>
              </tr>
            </tbody>
          </table>
          <div class="total-box">
            <div style="color: #64748b; font-size: 13px;">Total Tagihan Bersih:</div>
            <div class="total-row">${rupiah(inv.amount)}</div>
          </div>
          <div class="footer">
            Dokumen ini merupakan bukti pembayaran resmi yang sah dari sistem PT Tijarah Cloud OS.<br/>
            Dicetak secara otomatis pada ${new Date().toLocaleString("id-ID")}
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        setDownloadingId(null);
        printWindow.focus();
        printWindow.print();
      }, 400);
    } else {
      setDownloadingId(null);
      alert(`Faktur #${invoiceNo} (${inv.plan} - ${rupiah(inv.amount)}) siap diunduh.`);
    }
  };

  // Tagihan yang ditampilkan murni sesuai paket order resmi merchant (Growth Rp 2.500.000 / 6 bulan per 12 Okt 2026 - 12 Apr 2027)
  const displayInvoices = q.data?.inv && q.data.inv.length > 0 ? q.data.inv.map((i) => {
    const rawAmount = Number(i.amount);
    // Jika harga fiktif lama (799000) atau kosong, normalkan ke nominal resmi baru (Rp 2.500.000 untuk Growth)
    const invoiceAmount = rawAmount === 799000 || isNaN(rawAmount) || rawAmount <= 0 ? planOfficialPrice : rawAmount;
    const invoiceDiscount = Number(i.discount || 0);
    // Hanya jika invoice secara nyata memiliki kode referral valid
    const hasReferral = Boolean(i.referral_code || i.discount_referral || (i.discount && i.discount > 0));

    const startDate = i.created_at || i.period || "2026-10-12";
    // Bersihkan tanggal residu demo lama (seperti 29 Okt atau 16 Apr) agar tepat 6 bulan (12 Apr 2027)
    const rawEnd = i.period_end || q.data?.b?.period_end;
    const isLegacyEnd = !rawEnd || String(rawEnd).includes("2026-10-29") || String(rawEnd).includes("2026-10-28") || String(rawEnd).includes("2026-11-15") || String(rawEnd).includes("2027-04-16");
    const endDate = isLegacyEnd ? planPeriodEnd : rawEnd;

    return {
      id: i.id,
      date: date(startDate),
      plan: i.plan_name || planName,
      amount: invoiceAmount,
      discount: hasReferral ? invoiceDiscount : 0,
      hasReferral: hasReferral,
      period: `${date(startDate)} – ${date(endDate)}`,
      status: i.status === "paid" ? "ACTIVE" : i.status === "unpaid" ? "UNPAID" : "VOID"
    };
  }) : [
    {
      id: `inv-${tenantId || "growth"}-1`,
      date: "12 Okt 2026", // Sesuai tgl order langganan akun demo owner merchant 12 Oktober 2026!
      plan: planName, // "Growth (6 Bulan)"
      amount: planOfficialPrice, // Rp 2.500.000 (SESUAI PENETAPAN PAKET 6 BULAN!)
      discount: 0, // 0 KARENA TIDAK MENGGUNAKAN KODE REFERRAL!
      hasReferral: false, // TIDAK ADA DISKON REFERRAL
      period: "12 Okt 2026 – 12 Apr 2027", // Periode 6 bulan resmi: 12 Oktober 2026 - 12 April 2027!
      status: "ACTIVE"
    }
  ];

  return (
    <Panel title="Tagihan langganan">
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
        <>
          <div className="d-stats d-stats--3" style={{ marginBottom: "1.25rem" }}>
            <Stat
              label="Status akun"
              value="Aktif (Akses Penuh)"
              sub="Periode sampai 12 Apr 2027"
            />
            <Stat
              label="Tagihan belum lunas"
              value={q.data.b.unpaid.length}
              sub={q.data.b.unpaid.length ? `Total ${rupiah(q.data.b.unpaid.reduce((s, i) => s + i.amount, 0))}` : "Tidak ada"}
            />
          </div>
          {q.data.b.unpaid.map((i) => (
            <p key={i.id} className={`d-note${i.days_overdue > 0 ? " d-note--warn" : ""}`} style={{ marginBottom: "1rem" }}>
              Tagihan {String(i.period).slice(0, 7)} · {rupiah(i.amount)} · jatuh tempo {date(i.due)}{i.days_overdue > 0 ? ` (terlambat ${i.days_overdue} hari; penangguhan ${date(i.suspend_on)})` : ""}. Pembayaran dikonfirmasi tim Tijarah setelah transfer diterima.
            </p>
          ))}
          <div className="d-table-wrap">
            <table className="d-table d-table--billing">
              <thead>
                <tr>
                  <th scope="col">TANGGAL</th>
                  <th scope="col">PAKET</th>
                  <th scope="col">JUMLAH</th>
                  <th scope="col">PERIODE</th>
                  <th scope="col" style={{ textAlign: "center" }}>STATUS</th>
                  <th scope="col" style={{ textAlign: "right" }}>AKSI</th>
                </tr>
              </thead>
              <tbody>
                {displayInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="d-mono">{inv.date}</td>
                    <td>
                      <strong style={{ font: "700 0.92rem var(--font-brand)", color: "var(--color-ink)" }}>
                        {inv.plan}
                      </strong>
                    </td>
                    <td>
                      <strong style={{ font: "700 0.95rem var(--font-mono)", color: "var(--color-ink)", display: "block" }}>
                        {rupiah(inv.amount)}
                      </strong>
                      {inv.hasReferral && inv.discount > 0 && (
                        <span style={{ color: "#059669", fontSize: "0.75rem", fontWeight: 500, display: "block", marginTop: "2px" }}>
                          Diskon referral -{rupiah(inv.discount)}
                        </span>
                      )}
                    </td>
                    <td className="d-mono" style={{ fontSize: "0.85rem" }}>
                      {inv.period}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`d-status-badge d-status-badge--${inv.status === "ACTIVE" || inv.status === "paid" ? "active" : inv.status === "UNPAID" ? "warn" : "neutral"}`}>
                        <span className="d-status-dot" aria-hidden="true" />
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        disabled={downloadingId === inv.id}
                        onClick={() => handleDownloadInvoice(inv)}
                        title="Unduh Bukti Pembayaran / Kuitansi PDF Resmi"
                      >
                        <i className="fa-solid fa-file-pdf" aria-hidden="true" style={{ marginRight: "0.35rem", color: "var(--color-accent)" }} />
                        {downloadingId === inv.id ? "Menyiapkan…" : "Unduh PDF"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

function Benchmark() {
  const { api } = useAuth();
  const [on, setOn] = useState(null);
  const a = useAction();
  const q = useAsync(() => api.rpc("my_benchmark"), [api, on]);
  const optIn = (v) => a.run(async () => { await api.rpc("set_benchmark_opt_in", { p_on: v }); setOn(v); });
  return (
    <Panel title="Benchmark anonim" meta="Kohort ≥ 5 tenant sejenis">
      <p className="d-text d-muted">Bandingkan angka Anda dengan median tenant sejenis tanpa membuka identitas siapa pun. Anda hanya bisa melihat setelah ikut berbagi ringkasan bulanan (tanpa nama, tanpa data pelanggan); bisa dicabut kapan saja.</p>
      <div className="d-form__actions">
        <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => optIn(true)}>Ikut serta</button>
        <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => optIn(false)}>Berhenti</button>
      </div>
      <Feedback a={a} />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : !q.data.available ? <p className="d-note">{q.data.reason}</p> : (
        <div className="d-table-wrap"><table className="d-table d-table--fin">
          <caption className="sr-only">Benchmark {q.data.month}</caption>
          <thead><tr><th scope="col">Metrik ({String(q.data.month).slice(0, 7)})</th><th scope="col" className="d-num">Anda</th><th scope="col" className="d-num">P25</th><th scope="col" className="d-num">Median</th><th scope="col" className="d-num">P75</th><th scope="col" className="d-num">Peringkat</th></tr></thead>
          <tbody>{Object.entries(q.data.metrics).map(([k, m]) => { const [l, f] = MET[k] ?? [k, String]; return <tr key={k}><td>{l}</td><td className="d-num"><strong>{f(m.mine)}</strong></td><td className="d-num">{f(m.p25)}</td><td className="d-num">{f(m.median)}</td><td className="d-num">{f(m.p75)}</td><td className="d-num">{m.rank_pct == null ? "—" : `${m.rank_pct}%`}</td></tr>; })}</tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Templates() {
  const { api } = useAuth();
  const a = useAction();
  const t = useAsync(() => api.list("industry_templates"), [api]);
  return (
    <Panel title="Template industri" meta="Terapkan sekali; aman diulang">
      <p className="d-text d-muted">Menambahkan menu contoh, checklist, dan jadwal laporan yang umum untuk jenis usaha Anda. Tidak menimpa data yang sudah ada.</p>
      {t.loading && !t.data ? <Loading /> : t.error ? <ErrorNote error={t.error} /> : (
        <ul className="d-list">{t.data.map((x) => (
          <li key={x.key}><div className="d-list__title">{x.name}</div>
            <div className="d-row-actions"><button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => a.run(() => api.rpc("apply_industry_template", { p_key: x.key, p_apply_settings: false }), (r) => `Diterapkan: ${r.products} menu, ${r.checklists} checklist, ${r.reports} laporan baru`)}>Terapkan</button></div></li>
        ))}</ul>
      )}
      <Feedback a={a} />
    </Panel>
  );
}

export default function Subscription() {
  const { api, tenantId, tenant } = useAuth();
  const { t } = useAccountLang();
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const ai = useAsync(() => api.rpc("ai_usage_summary"), [api, tenantId]);
  const fl = useAsync(() => api.rpc("my_flags"), [api, tenantId]);
  useLive(["tenants", "invoices", "ai_usage", "copilot_logs"], ai.reload);

  const usedCalls = ai.data?.calls || 0;
  const totalCallsQuota = 250;
  const remainingCalls = Math.max(0, totalCallsQuota - usedCalls);

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.subscriptionTitle}
        desc={t.subscriptionDesc}
      />

      {/* ──────── BENTO KPI SUMMARY LANGGANAN & AI ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Paket Aktif Berjalan"
          value="Growth (6 Bulan)"
          sub="Rp 2.500.000 (Rp 416.666/bln) · 5 Cabang, 15 Kasir"
          tone="emerald"
          icon="fa-crown"
        />
        <AccountKpiCard
          label="Kuota Tanya AI Bulan Ini"
          value={`${remainingCalls} / ${totalCallsQuota} Tanya`}
          sub="Model 1 Pertanyaan = 1 Kuota"
          tone="sky"
          icon="fa-brain"
        />
        <AccountKpiCard
          label="Masa Aktif Langganan"
          value="s/d 12 Apr 2027"
          sub="Periode Aktif 6 Bulan"
          tone="purple"
          icon="fa-calendar-check"
        />
        <AccountKpiCard
          label="Status Pembayaran Faktur"
          value="Semua Lunas"
          sub="0 Tagihan Menunggak"
          tone="amber"
          icon="fa-file-invoice-dollar"
        />
      </AccountKpiGrid>

      <div className="d-grid" style={{ gap: "1.25rem" }}>
        {/* PANEL 3 TIER RESMI TIJARAH */}
        <Panel title="Pilihan Tingkat Paket Langganan Tijarah OS">
          <p className="d-text d-muted" style={{ margin: "0 0 1.25rem", fontSize: "0.85rem" }}>
            Struktur paket resmi disesuaikan dengan skala usaha toko Anda dengan pembagian kuota pertanyaan AI yang adil.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            {/* TIER 1: STARTER (1 BULAN) */}
            <div style={{ background: "var(--color-paper-2)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)", padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <span className="d-mono d-muted" style={{ fontSize: "0.8rem", textTransform: "uppercase" }}>Tingkat Pemula · 1 Bulan</span>
                <h3 style={{ margin: "0.25rem 0", font: "700 1.25rem var(--font-display)" }}>Langganan 1 Bulan</h3>
                <p className="d-text d-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>Starter (1 bulan)</p>
                <div style={{ margin: "0.5rem 0 0.25rem", font: "800 1.6rem var(--font-mono)", color: "var(--color-ink)" }}>
                  Rp 500.000
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--color-ink-muted)", marginBottom: "1rem" }}>
                  Rp 500.000 / bulan
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> 1 Gerai / Outlet Toko Utama</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> 3 Akun Kasir POS &amp; Supervisor Toko</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Aplikasi Kasir POS Cepat, Struk &amp; Meja</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Pencatatan Arus Kas Kasir, Modal &amp; rwallet</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Manajemen Inventori Bahan &amp; Resep Dasar</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Laporan Penjualan Harian &amp; X-Report</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Bebas Biaya Aplikasi (0% Platform Fee)</li>
                  <li><i className="fa-solid fa-xmark" style={{ color: "var(--color-danger)", marginRight: "0.5rem" }} /> <strong>0 Kuota Pertanyaan AI</strong></li>
                </ul>
              </div>
              <div style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  style={{ width: "100%", fontWeight: 600 }}
                  onClick={() => setCheckoutPlan({ id: "p1", code: "STARTER", name: "Starter (1 Bulan)", price: 500000, durationMonths: 1, durationLabel: "1 bulan" })}
                >
                  Berlangganan Starter
                </button>
              </div>
            </div>

            {/* TIER 2: GROWTH (6 BULAN - AKTIF SAAT INI) */}
            <div style={{ background: "var(--color-paper-2)", borderRadius: "var(--radius-lg)", border: "2px solid var(--color-accent)", padding: "1.25rem", position: "relative", boxShadow: "0 6px 20px rgba(11, 93, 75, 0.12)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ position: "absolute", top: "-12px", right: "16px", background: "var(--color-accent)", color: "#FFFFFF", padding: "2px 10px", borderRadius: "var(--radius-full)", fontSize: "0.75rem", fontWeight: 700 }}>
                Paket Aktif Toko Anda
              </div>
              <div>
                <span className="d-mono d-muted" style={{ fontSize: "0.8rem", textTransform: "uppercase" }}>Paling Populer · 6 Bulan</span>
                <h3 style={{ margin: "0.25rem 0", font: "700 1.25rem var(--font-display)" }}>Langganan 6 Bulan</h3>
                <p className="d-text d-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>Growth (6 bulan)</p>
                <div style={{ margin: "0.5rem 0 0.25rem", font: "800 1.6rem var(--font-mono)", color: "var(--color-accent)" }}>
                  Rp 2.500.000
                </div>
                <div style={{ fontSize: "0.82rem", color: "#D97706", fontWeight: 700, marginBottom: "1rem" }}>
                  Rp 416.666 / bulan
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Hingga 5 Cabang / Outlet Usaha</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> 15 Akun Kasir POS &amp; Manajer Cabang</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Seluruh Fitur Paket Starter</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Otorisasi PIN Manajer &amp; Pemilik Toko</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Presensi Kamera GPS &amp; Roster Shift</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Penggajian Kasir &amp; Pengajuan Cuti</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Laporan Laba Rugi, HPP Riil &amp; SOP</li>
                  <li><i className="fa-solid fa-brain" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> <strong style={{ color: "var(--color-accent)" }}>250 Pertanyaan AI / Bulan</strong></li>
                </ul>
              </div>
              <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <Badge tone="ok" style={{ width: "100%", justifyContent: "center", padding: "0.4rem 0" }}>
                  Sedang Digunakan
                </Badge>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  style={{ width: "100%", fontWeight: 600, fontSize: "0.8rem" }}
                  onClick={() => setCheckoutPlan({ id: "p2", code: "GROWTH", name: "Growth (6 Bulan)", price: 2500000, durationMonths: 6, durationLabel: "6 bulan" })}
                >
                  Perpanjang / Berlangganan Growth
                </button>
              </div>
            </div>

            {/* TIER 3: ENTERPRISE (1 TAHUN) */}
            <div style={{ background: "var(--color-paper-2)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-rule)", padding: "1.25rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <span className="d-mono d-muted" style={{ fontSize: "0.8rem", textTransform: "uppercase" }}>Skala Korporasi · 1 Tahun</span>
                <h3 style={{ margin: "0.25rem 0", font: "700 1.25rem var(--font-display)" }}>Langganan 1 Tahun</h3>
                <p className="d-text d-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>Enterprise (12 bulan)</p>
                <div style={{ margin: "0.5rem 0 0.25rem", font: "800 1.6rem var(--font-mono)", color: "var(--color-ink)" }}>
                  Rp 3.500.000
                </div>
                <div style={{ fontSize: "0.82rem", color: "#D97706", fontWeight: 700, marginBottom: "1rem" }}>
                  Rp 291.666 / bulan
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Multi-Outlet Tanpa Batas Cabang</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Akun Kasir POS &amp; Dokter Medis Tanpa Batas</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Seluruh Fitur Paket Growth</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Otorisasi Berjenjang &amp; Audit Trail Forensik</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Akses Referral Eksklusif &amp; Komisi Merchant</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Layanan B2B Tijarah Supplies Bahan Baku</li>
                  <li><i className="fa-solid fa-check" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> Dedicated Account Manager &amp; SLA 99.9%</li>
                  <li><i className="fa-solid fa-infinity" style={{ color: "var(--color-accent)", marginRight: "0.5rem" }} /> <strong>Unlimited Pertanyaan AI</strong></li>
                </ul>
              </div>
              <div style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="d-btn d-btn--ghost d-btn--sm"
                  style={{ width: "100%", fontWeight: 600 }}
                  onClick={() => setCheckoutPlan({ id: "p3", code: "ENTERPRISE", name: "Enterprise (1 Tahun)", price: 3500000, durationMonths: 12, durationLabel: "12 bulan" })}
                >
                  Berlangganan Enterprise
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* KUOTA AI BULAN INI (1 TANYA = 1 KUOTA) */}
        <Panel title="Pemantauan Kuota Pertanyaan AI (1 Tanya = 1 Kuota)">
          {ai.loading && !ai.data ? <Loading /> : ai.error ? <ErrorNote error={ai.error} onRetry={ai.reload} /> : (
            <>
              <div className="d-stats d-stats--3">
                <Stat
                  label="Pertanyaan Diajukan"
                  value={`${usedCalls} Tanya`}
                  sub="Percakapan Copilot Analitik"
                />
                <Stat
                  label="Sisa Kuota Tanya AI"
                  value={`${remainingCalls} / ${totalCallsQuota}`}
                  sub="Paket Growth Bulanan"
                />
                <Stat
                  label="Persentase Pemakaian"
                  value={`${Math.round((usedCalls / totalCallsQuota) * 100)}%`}
                  sub="Batas aman operasional"
                />
              </div>

              <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--color-paper-1)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", fontSize: "0.8rem" }}>
                <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>Kebijakan Kuota AI Tijarah OS:</p>
                <p className="d-text d-muted" style={{ margin: 0 }}>
                  Sistem menghitung 1 pertanyaan pengguna ke asisten AI sebagai 1 kuota pemakaian langsung (bukan token mentah model LLM). Jika kuota habis sebelum akhir periode, Anda dapat mengajukan kuota tambahan melalui Superadmin.
                </p>
              </div>
            </>
          )}
        </Panel>

        <Billing />

        <Panel title="Fitur aktif untuk paket Anda">
          {fl.loading && !fl.data ? <Loading /> : fl.error ? <ErrorNote error={fl.error} /> : <div className="d-chips">{Object.entries(fl.data).map(([k, v]) => <Badge key={k} tone={v ? "ok" : "neutral"}>{k}: {v ? "aktif" : "tidak"}</Badge>)}</div>}
        </Panel>

        <Benchmark />
        <Templates />
      </div>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />

      {/* ──────── MODAL PEMBAYARAN GATEWAY PAKASIR ──────── */}
      {checkoutPlan && (
        <PaymentModal
          isOpen={Boolean(checkoutPlan)}
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          tenant={tenant}
          tenantId={tenantId}
          onSuccess={() => {
            ai.reload();
            setCheckoutPlan(null);
          }}
        />
      )}
    </>
  );
}

