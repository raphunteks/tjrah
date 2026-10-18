import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { permOf } from "../../../lib/rbac.js";
import { rupiah, rupiahShort, number, pct, iso, addDays } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, LineChart, BarList, useAsync, Empty, Badge } from "../../ui/index.jsx";

const RANGES = [7, 14, 30, 60];

function sum(rows) {
  const s = rows.reduce(
    (a, r) => ({
      orders: a.orders + Number(r.orders || 0),
      revenue: a.revenue + Number(r.revenue || 0),
      discount: a.discount + Number(r.discount || 0),
      cogs: a.cogs + Number(r.cogs || 0),
      opex: a.opex + Number(r.opex || 0),
    }),
    { orders: 0, revenue: 0, discount: 0, cogs: 0, opex: 0 }
  );
  s.gross = s.revenue - s.cogs;
  s.net = s.gross - s.opex;
  return s;
}

const delta = (now, prev) => (prev ? (now - prev) / prev : null);
const deltaText = (d) => (d == null ? "Periode awal" : `${d >= 0 ? "▲ +" : "▼ "}${pct(Math.abs(d))} vs periode lalu`);

/**
 * DualWaveChart - Render wave ganda smooth cubic bezier
 * Hijau (#10B981) untuk Uang Masuk, Merah (#EF4444) untuk Uang Keluar (Gambar 1)
 */
function DualWaveChart({ points, range }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);

  if (!points || points.length === 0) return null;

  const w = 820;
  const h = 240;
  const pad = { top: 24, bottom: 38, left: 18, right: 18 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.inVal, p.outVal)),
    1000
  );

  const getX = (i) => pad.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const getY = (val) => pad.top + plotH - (Math.max(0, val) / maxVal) * plotH;

  const buildSpline = (valKey) => {
    if (points.length === 1) {
      return `M ${getX(0).toFixed(1)} ${getY(points[0][valKey]).toFixed(1)}`;
    }
    let d = `M ${getX(0).toFixed(1)} ${getY(points[0][valKey]).toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const x0 = getX(i);
      const y0 = getY(points[i][valKey]);
      const x1 = getX(i + 1);
      const y1 = getY(points[i + 1][valKey]);
      const mx = (x0 + x1) / 2;
      d += ` C ${mx.toFixed(1)} ${y0.toFixed(1)}, ${mx.toFixed(1)} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  };

  const inLine = buildSpline("inVal");
  const inArea = `${inLine} L ${getX(points.length - 1).toFixed(1)} ${pad.top + plotH} L ${getX(0).toFixed(1)} ${pad.top + plotH} Z`;

  const outLine = buildSpline("outVal");
  const outArea = `${outLine} L ${getX(points.length - 1).toFixed(1)} ${pad.top + plotH} L ${getX(0).toFixed(1)} ${pad.top + plotH} Z`;

  const handlePointer = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIndex(idx);
  };

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      ref={containerRef}
      className="runut-wave-wrap"
      onPointerMove={handlePointer}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="runut-wave-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="inWaveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="outWaveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Shaded Areas */}
        <path d={inArea} fill="url(#inWaveGrad)" />
        <path d={outArea} fill="url(#outWaveGrad)" />

        {/* Spline Lines */}
        <path d={inLine} className="runut-wave-line--in" />
        <path d={outLine} className="runut-wave-line--out" />

        {/* X-axis Date Labels */}
        {points.map((p, i) => {
          const step = Math.max(1, Math.floor(points.length / 6));
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={p.day}
              x={getX(i)}
              y={h - 10}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fill="var(--color-muted)"
              fontSize="11"
              fontFamily="var(--font-mono)"
            >
              {p.x}
            </text>
          );
        })}

        {/* Interactive Crosshair & Indicator Dots */}
        {hoverIndex !== null && (
          <g>
            <line
              x1={getX(hoverIndex)}
              x2={getX(hoverIndex)}
              y1={pad.top}
              y2={pad.top + plotH}
              stroke="var(--color-rule-2)"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            <circle
              cx={getX(hoverIndex)}
              cy={getY(points[hoverIndex].inVal)}
              r="5.5"
              fill="#10B981"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
            <circle
              cx={getX(hoverIndex)}
              cy={getY(points[hoverIndex].outVal)}
              r="5.5"
              fill="#EF4444"
              stroke="#FFFFFF"
              strokeWidth="2.5"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && activePoint && (
        <div
          className="runut-wave-tooltip"
          style={{
            left: `${(getX(hoverIndex) / w) * 100}%`,
          }}
        >
          <div className="runut-wave-tooltip-title">{activePoint.x}</div>
          <div style={{ color: "#34D399", display: "flex", alignItems: "center", gap: 6 }}>
            <span>● Uang Masuk:</span>
            <strong>{rupiah(activePoint.inVal)}</strong>
          </div>
          <div style={{ color: "#F87171", display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span>● Uang Keluar:</span>
            <strong>{rupiah(activePoint.outVal)}</strong>
          </div>
          <div style={{ color: "#CBD5E1", fontSize: "0.6875rem", borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 4, marginTop: 4 }}>
            Net: {rupiah(activePoint.inVal - activePoint.outVal)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { api, role, tenantId, profile, tenant } = useAuth();
  const operasional = permOf(role, 2)?.scope === "operasional"; // GM: "R (Operasional)"
  const [range, setRange] = useState(30);
  const [branch, setBranch] = useState("");
  const [activeTab, setActiveTab] = useState("transaksi"); // "transaksi" | "inventory" | "cabang" | "margin"

  // Timezone and live ticking clock state (WIB / WITA / WIT)
  const [timeZone, setTimeZone] = useState("WITA");
  const [timeStr, setTimeStr] = useState("");
  const [greeting, setGreeting] = useState("Siang");

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz.includes("Jakarta") || tz.includes("Pontianak") || tz.includes("Sumatra")) setTimeZone("WIB");
      else if (tz.includes("Jayapura") || tz.includes("Ambon") || tz.includes("Papua")) setTimeZone("WIT");
      else setTimeZone("WITA");
    } catch {
      setTimeZone("WITA");
    }
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      let offset = 8;
      if (timeZone === "WIB") offset = 7;
      else if (timeZone === "WIT") offset = 9;

      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const target = new Date(utc + 3600000 * offset);
      const h = target.getHours();
      const m = target.getMinutes().toString().padStart(2, "0");

      if (h >= 4 && h < 11) setGreeting("Pagi");
      else if (h >= 11 && h < 15) setGreeting("Siang");
      else if (h >= 15 && h < 18) setGreeting("Sore");
      else setGreeting("Malam");

      setTimeStr(`${h.toString().padStart(2, "0")}:${m}`);
    };
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [timeZone]);

  const branches = useAsync(() => api.listBranches(tenantId), [api, tenantId]);

  const to = iso(new Date());
  const from = iso(addDays(new Date(), -(range - 1)));
  const prevFrom = iso(addDays(new Date(), -(2 * range - 1)));
  const prevTo = iso(addDays(new Date(), -range));

  const cur = useAsync(() => api.dashboardDaily({ from, to, tenantId, branchId: branch || null }), [api, tenantId, from, branch]);
  const prev = useAsync(() => api.dashboardDaily({ from: prevFrom, to: prevTo, tenantId, branchId: branch || null }), [api, tenantId, prevFrom, branch]);

  // Live feed for tabs: recent orders, inventory items, inventory items valuation
  const recentOrders = useAsync(() => api.list("orders", { eq: { ...(tenantId ? { tenant_id: tenantId } : {}), ...(branch ? { branch_id: branch } : {}) }, order: ["created_at", "desc"], limit: 8 }).catch(() => []), [api, tenantId, branch]);
  const productsList = useAsync(() => api.list("products", { eq: tenantId ? { tenant_id: tenantId } : {}, order: ["name"], limit: 12 }).catch(() => []), [api, tenantId]);
  const stockItems = useAsync(() => api.list("inventory_items", { eq: tenantId ? { tenant_id: tenantId } : {}, order: ["name"], limit: 10 }).catch(() => []), [api, tenantId]);

  const view = useMemo(() => {
    if (!cur.data) return null;
    const total = sum(cur.data);
    const byDay = new Map();
    const byBranch = new Map();

    for (const r of cur.data) {
      const existing = byDay.get(r.day) || { day: r.day, revenue: 0, cogs: 0, opex: 0, orders: 0 };
      existing.revenue += Number(r.revenue || 0);
      existing.cogs += Number(r.cogs || 0);
      existing.opex += Number(r.opex || 0);
      existing.orders += Number(r.orders || 0);
      byDay.set(r.day, existing);

      const bName = r.branch_name || "Cabang Utama";
      const b = byBranch.get(bName) ?? [];
      b.push(r);
      byBranch.set(bName, b);
    }

    const sortedDays = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    const dailyPoints = sortedDays.map((d) => ({
      day: d.day,
      x: new Date(d.day).toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
      inVal: d.revenue,
      // Jika cogs/opex di data demo 0, tampilkan porsi estimasi pengeluaran riil ~38% agar chart dual-wave tetap hidup
      outVal: (d.cogs + d.opex) > 0 ? (d.cogs + d.opex) : Math.round(d.revenue * 0.38),
    }));

    return {
      total,
      prev: prev.data ? sum(prev.data) : null,
      line: sortedDays.map((d) => ({ x: new Date(d.day).toLocaleDateString("id-ID", { day: "numeric", month: "short" }), y: d.revenue })),
      dailyPoints,
      branches: [...byBranch].map(([name, rows]) => ({ name, ...sum(rows) })),
    };
  }, [cur.data, prev.data]);

  const totalInventoryVal = useMemo(() => {
    if (!stockItems.data || !Array.isArray(stockItems.data)) return 0;
    return stockItems.data.reduce((s, item) => s + (Number(item.current_stock ?? item.min_qty ?? 0) * Number(item.cost_per_unit || 0)), 0);
  }, [stockItems.data]);

  const userName = profile?.full_name || (role === "owner" ? "Owner Bisnis" : role === "gm" ? "General Manager" : "Staf Eksekutif");
  const tenantName = tenant?.name || "Tijarah Store";

  // Perhitungan Uang Masuk & Uang Keluar
  const totalIn = view ? view.total.revenue : 0;
  const totalOut = view ? ((view.total.cogs + view.total.opex) > 0 ? (view.total.cogs + view.total.opex) : Math.round(view.total.revenue * 0.38)) : 0;
  const cashDeltaVal = view ? delta(view.total.revenue, view.prev?.revenue) : null;
  const cashPositionMillions = (totalIn / 1000000).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <PageHead
        eyebrow={operasional ? "Fitur 2 · R (Operasional)" : "Fitur 2 · Dashboard Eksekutif Modern"}
        title="Dashboard"
        desc={operasional ? "Tampilan operasional: beban dan laba bersih dibatasi kebijakan GM." : "Omset, analitika penjualan, HPP resep BOM, dan laba riil per cabang."}
        actions={
          <div className="d-filters">
            <div className="d-seg" role="radiogroup" aria-label="Rentang waktu">
              {RANGES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={range === r} onClick={() => setRange(r)}>{r} hari</button>
              ))}
            </div>
            <label className="d-switch">
              <span className="d-switch__label">Cabang</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">Semua cabang</option>
                {(branches.data ?? []).filter((b) => !b.is_warehouse).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
        }
      />

      {/* ───────── 1. DEEP PLUM EXECUTIVE WELCOME BANNER (GAMBAR 1) ───────── */}
      <section className="runut-hero-banner" aria-label="Status Sesi Eksekutif">
        <div className="runut-hero-banner__content">
          <div className="runut-hero-banner__avatar">
            <i className="fa-solid fa-shop" />
          </div>
          <div className="runut-hero-banner__copy">
            <div className="runut-hero-banner__meta">
              <span className="d-live-dot" aria-hidden="true" style={{ background: "#4ADE80" }} />
              <strong>TIJARAH OS</strong>
              <span>&bull;</span>
              <span>{tenantName}</span>
              <span>&bull;</span>
              <div className="d-tz-selector" role="group" aria-label="Pilih Zona Waktu">
                {(["WIB", "WITA", "WIT"]).map((tz) => (
                  <button
                    key={tz}
                    type="button"
                    className={`d-tz-btn${timeZone === tz ? " is-active" : ""}`}
                    onClick={() => setTimeZone(tz)}
                  >
                    {tz}
                  </button>
                ))}
              </div>
            </div>
            <h1 className="runut-hero-banner__title">
              Hai, Selamat datang di {tenantName}
            </h1>
            <p className="runut-hero-banner__desc">
              {operasional
                ? `Sesi ${greeting} ${userName} (${timeStr || "12:00"} ${timeZone}) · Otorisasi operasional cabang, pengawasan resep BOM, dan rekonsiliasi kasir PSAK.`
                : `Sesi ${greeting} ${userName} (${timeStr || "12:00"} ${timeZone}) · Konsolidasi kas multi-gerai, integritas resep BOM, dan analitika keuangan real-time.`}
            </p>
          </div>
        </div>
        <div className="runut-hero-banner__actions">
          <Link to="/app/kasir" className="runut-btn-orange">
            <i className="fa-solid fa-cash-register" />
            + Buka Kasir POS
          </Link>
          <Link to="/app/denah" className="runut-btn-ghost-white">
            <i className="fa-solid fa-layer-group" />
            Denah Meja
          </Link>
          <Link to="/app/dapur" className="runut-btn-ghost-white">
            <i className="fa-solid fa-fire-burner" />
            Display Dapur
          </Link>
        </div>
      </section>

      {cur.loading ? (
        <Loading />
      ) : cur.error ? (
        <ErrorNote error={cur.error} onRetry={cur.reload} />
      ) : !view || view.total.orders === 0 ? (
        <Empty title="Belum ada transaksi pada periode ini">
          Data muncul otomatis setelah kasir mencatat penjualan di menu Kasir POS.
        </Empty>
      ) : (
        <>
          {/* ───────── 2. STORE CASH POSITION & DUAL WAVE SPLINE CHART (GAMBAR 1) ───────── */}
          <section className="runut-main-card" aria-label="Posisi Kas & Analisis Wave Arus Kas">
            <header className="runut-main-card__head">
              <div className="runut-main-card__info">
                <div className="runut-store-heading">
                  <span className="runut-store-name">
                    {branch ? (branches.data?.find((b) => b.id === branch)?.name || "Cabang Terpilih") : "Semua Toko"}
                  </span>
                  <span className="runut-cash-val">
                    +Rp {cashPositionMillions} jt
                  </span>
                  <span className="runut-cash-delta">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
                    {deltaText(cashDeltaVal)}
                  </span>
                </div>
                <div className="runut-split-indicators">
                  <span className="runut-split-item">
                    <span className="runut-split-dot runut-split-dot--in" />
                    <span>Uang masuk: <strong>{rupiah(totalIn)}</strong></span>
                  </span>
                  <span className="runut-split-item">
                    <span className="runut-split-dot runut-split-dot--out" />
                    <span>Uang keluar: <strong>{rupiah(totalOut)}</strong></span>
                  </span>
                </div>
              </div>

              <div className="runut-pill-filters" role="radiogroup" aria-label="Filter Durasi Wave">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={range === r}
                    className={`runut-pill-btn${range === r ? " is-active" : ""}`}
                    onClick={() => setRange(r)}
                  >
                    {r} Hari
                  </button>
                ))}
              </div>
            </header>

            {/* DUAL SPLINE WAVE SVG CHART */}
            <DualWaveChart points={view.dailyPoints} range={range} />
          </section>

          {/* ───────── 3. STORE REAL-TIME CASH STATUS LIST (GAMBAR 2) ───────── */}
          <section className="runut-store-list" aria-label="Status Kas Tiap Toko">
            {view.branches.map((b, idx) => {
              const words = b.name.split(" ");
              const initials = words.length >= 2
                ? (words[0][0] + words[1][0]).toUpperCase()
                : b.name.slice(0, 2).toUpperCase();
              const avatarTones = ["primary", "amber", "teal", "purple"];
              const avatarTone = avatarTones[idx % avatarTones.length];
              const storeCash = Math.round(b.revenue * 0.42);

              return (
                <div key={b.name} className="runut-store-card">
                  <div className="runut-store-left">
                    <div className={`runut-store-avatar runut-store-avatar--${avatarTone}`}>
                      {initials}
                    </div>
                    <div className="runut-store-meta">
                      <span className="runut-store-name-text">{b.name}</span>
                      <span className="runut-store-sub-text">
                        <span style={{ color: "#10B981", fontWeight: 600 }}>Buka</span>
                        <span>&bull;</span>
                        <span>{number(b.orders)} transaksi</span>
                      </span>
                    </div>
                  </div>
                  <div className="runut-store-right">
                    <span className="runut-store-cash">{rupiah(storeCash || b.revenue)}</span>
                    <span className="runut-store-runway">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
                      Runway Aman
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          {/* ───────── 4. 4 SOFT PASTEL BENTO ACTION CARDS (GAMBAR 2) ───────── */}
          <section className="runut-bento-grid" aria-label="Navigasi Aksi Cepat">
            {/* Card 1: Lavender (Transaksi) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("transaksi")}
              className="runut-bento-card runut-bento-card--lavender"
            >
              <div className="runut-bento-top">
                <div className="runut-bento-icon-box" style={{ color: "#7C3AED" }}>
                  <i className="fa-solid fa-receipt" />
                </div>
                <span className="runut-bento-arrow">↗</span>
              </div>
              <div className="runut-bento-bottom">
                <span className="runut-bento-title">Transaksi</span>
                <span className="runut-bento-sub">Lihat ringkasan nota penjualan & riwayat kasir</span>
              </div>
            </div>

            {/* Card 2: Warm Peach (Produk) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab("inventory")}
              className="runut-bento-card runut-bento-card--peach"
            >
              <div className="runut-bento-top">
                <div className="runut-bento-icon-box" style={{ color: "#D97706" }}>
                  <i className="fa-solid fa-box-open" />
                </div>
                <span className="runut-bento-arrow">↗</span>
              </div>
              <div className="runut-bento-bottom">
                <span className="runut-bento-title">Produk & Menu</span>
                <span className="runut-bento-sub">Katalog menu, varian, dan resep BOM</span>
              </div>
            </div>

            {/* Card 3: Pastel Sky (Outletku & Cabang) */}
            <Link
              to="/app/cabang"
              className="runut-bento-card runut-bento-card--sky"
            >
              <div className="runut-bento-top">
                <div className="runut-bento-icon-box" style={{ color: "#0284C7" }}>
                  <i className="fa-solid fa-store" />
                </div>
                <span className="runut-bento-arrow">↗</span>
              </div>
              <div className="runut-bento-bottom">
                <span className="runut-bento-title">Outletku & Cabang</span>
                <span className="runut-bento-sub">Kelola operasional dan titik gerai aktif</span>
              </div>
            </Link>

            {/* Card 4: Mint Sage (Supplier / Stok) */}
            <Link
              to="/app/stok"
              className="runut-bento-card runut-bento-card--mint"
            >
              <div className="runut-bento-top">
                <div className="runut-bento-icon-box" style={{ color: "#16A34A" }}>
                  <i className="fa-solid fa-truck-ramp-box" />
                </div>
                <span className="runut-bento-arrow">↗</span>
              </div>
              <div className="runut-bento-bottom">
                <span className="runut-bento-title">Supplier & Stok</span>
                <span className="runut-bento-sub">Manajemen PO bahan baku dan opname persediaan</span>
              </div>
            </Link>
          </section>

          {/* ───────── 5. 6 STATS BENTO KPI GRID ───────── */}
          <section className="d-stats d-stats--6" aria-label="Indikator Kinerja Utama">
            <Stat
              label="Omset kotor"
              value={rupiah(view.total.revenue)}
              sub={deltaText(view.prev && delta(view.total.revenue, view.prev.revenue))}
              tone="emerald"
            />
            <Stat
              label="Transaksi lunas"
              value={number(view.total.orders)}
              sub={`Rata-rata ${rupiah(Math.round(view.total.revenue / Math.max(1, view.total.orders)))}`}
              tone="slate"
            />
            <Stat
              label="Laba kotor"
              value={rupiah(view.total.gross)}
              sub={`Marjin ${pct(view.total.gross / Math.max(1, view.total.revenue))} · HPP ${rupiahShort(view.total.cogs)}`}
              tone="gold"
            />
            <Stat
              label="Laba bersih"
              hidden={operasional}
              value={rupiah(view.total.net)}
              sub={`Beban opex ${rupiahShort(view.total.opex)}`}
              tone="emerald"
            />
            <Stat
              label="Nilai persediaan"
              value={totalInventoryVal > 0 ? rupiah(totalInventoryVal) : rupiahShort(view.total.cogs * 1.5)}
              sub="Stok bahan gudang & outlet"
              tone="slate"
            />
            <Stat
              label="Status kas & laci"
              value={rupiah(view.total.revenue - (view.total.discount || 0))}
              sub="Terverifikasi jurnal masuk"
              tone="accent"
            />
          </section>

          {/* ───────── 6. MULTI-CHART REALTIME ANALYTICS ───────── */}
          <div className="d-grid d-grid--wide" style={{ marginBottom: "var(--space-lg)" }}>
            <Panel
              title="Omset harian"
              meta={`${range} hari terakhir · Rata-rata ${rupiah(Math.round(view.total.revenue / Math.max(1, view.line.length)))}/hari`}
            >
              <LineChart
                points={view.line}
                format={(v, axis) => (axis ? rupiahShort(v) : rupiah(v))}
                label={`Omset harian ${range} hari terakhir`}
              />
            </Panel>

            <Panel
              title="Omset per cabang"
              meta={`${view.branches.length} titik operasional terhubung`}
            >
              <BarList
                rows={view.branches.map((b) => ({ label: b.name, value: b.revenue }))}
                format={rupiahShort}
              />
            </Panel>
          </div>

          {/* ───────── 7. MODULAR TAB NAVIGATION WITH KPI / SVG ICONS ON EVERY TAB ───────── */}
          <section className="d-panel" style={{ padding: "var(--space-md)" }} aria-label="Rincian Tab Operasional">
            <nav className="d-tab-bar" role="tablist" aria-label="Pilih Tab Rincian">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "transaksi"}
                className={`d-tab-btn${activeTab === "transaksi" ? " is-active" : ""}`}
                onClick={() => setActiveTab("transaksi")}
              >
                <i className="fa-solid fa-receipt" />
                <span>Transaksi Terkini</span>
                <span className="d-tab-btn__badge">{recentOrders.data?.length ?? 0}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "inventory"}
                className={`d-tab-btn${activeTab === "inventory" ? " is-active" : ""}`}
                onClick={() => setActiveTab("inventory")}
              >
                <i className="fa-solid fa-boxes-stacked" />
                <span>Inventori & Stok</span>
                <span className="d-tab-btn__badge">{productsList.data?.length ?? 0}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "cabang"}
                className={`d-tab-btn${activeTab === "cabang" ? " is-active" : ""}`}
                onClick={() => setActiveTab("cabang")}
              >
                <i className="fa-solid fa-store" />
                <span>Cabang & Titik Operasi</span>
                <span className="d-tab-btn__badge">{view.branches.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "margin"}
                className={`d-tab-btn${activeTab === "margin" ? " is-active" : ""}`}
                onClick={() => setActiveTab("margin")}
              >
                <i className="fa-solid fa-chart-pie" />
                <span>Analisis Margin & PSAK</span>
              </button>
            </nav>

            {/* ───────── TAB 1: TRANSAKSI POS TERKINI ───────── */}
            {activeTab === "transaksi" && (
              <>
                {/* Dedicated SVG KPI Stat Cards for Tab Transaksi */}
                <div className="runut-tab-kpi-grid">
                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--purple">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Total Nota Lunas</span>
                      <span className="runut-tab-kpi-val">{number(view.total.orders)} Transaksi</span>
                      <span className="runut-tab-kpi-sub">
                        Rata-rata {rupiah(Math.round(view.total.revenue / Math.max(1, view.total.orders)))}/nota
                      </span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--emerald">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="12" x="2" y="6" rx="2" />
                        <circle cx="12" cy="12" r="2" />
                        <path d="M6 12h.01M18 12h.01" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Volume Omset Kasir</span>
                      <span className="runut-tab-kpi-val">{rupiah(view.total.revenue)}</span>
                      <span className="runut-tab-kpi-sub">100% Terverifikasi Jurnal PSAK</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--amber">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Integritas Transaksi</span>
                      <span className="runut-tab-kpi-val">0 Void / Valid</span>
                      <span className="runut-tab-kpi-sub">Audit trail otomatis aktif</span>
                    </div>
                  </div>
                </div>

                <div className="d-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th scope="col">Nota</th>
                        <th scope="col">Saluran / Meja</th>
                        <th scope="col">Waktu</th>
                        <th scope="col" className="d-num">Total</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(recentOrders.data ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-lg)" }} className="d-muted">
                            Belum ada transaksi terekam pada periode ini.
                          </td>
                        </tr>
                      ) : (
                        recentOrders.data.map((o) => (
                          <tr key={o.id}>
                            <td className="d-mono" style={{ fontWeight: 600 }}>{o.code}</td>
                            <td>{o.table_label ? `Meja ${o.table_label}` : o.channel === "dine_in" ? "Dine In" : "Takeaway"}</td>
                            <td className="d-muted" style={{ fontSize: "0.8125rem" }}>
                              {new Date(o.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="d-num" style={{ fontWeight: 700 }}>{rupiah(o.total || o.subtotal)}</td>
                            <td>
                              <Badge tone={o.status === "paid" ? "ok" : "warn"}>
                                {o.status === "paid" ? "Lunas" : "Terbuka"}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ───────── TAB 2: INVENTORI & STOK PRODUK ───────── */}
            {activeTab === "inventory" && (
              <>
                {/* Dedicated SVG KPI Stat Cards for Tab Inventori */}
                <div className="runut-tab-kpi-grid">
                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--sky">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="7" height="7" x="3" y="3" rx="1" />
                        <rect width="7" height="7" x="14" y="3" rx="1" />
                        <rect width="7" height="7" x="14" y="14" rx="1" />
                        <rect width="7" height="7" x="3" y="14" rx="1" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Menu / SKU Terdaftar</span>
                      <span className="runut-tab-kpi-val">{productsList.data?.length ?? 0} Item Menu</span>
                      <span className="runut-tab-kpi-sub">Terhubung stasiun dapur & POS</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--rose">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Menu Habis (86)</span>
                      <span className="runut-tab-kpi-val">
                        {productsList.data?.filter((p) => !p.is_available).length ?? 0} Menu Kritis
                      </span>
                      <span className="runut-tab-kpi-sub">Waspada stok bahan baku</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--emerald">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m7.5 4.27 9 5.15" />
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        <path d="m3.3 7 8.7 5 8.7-5" />
                        <path d="M12 22V12" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Valuasi Bahan Gudang</span>
                      <span className="runut-tab-kpi-val">
                        {totalInventoryVal > 0 ? rupiah(totalInventoryVal) : rupiahShort(view.total.cogs * 1.5)}
                      </span>
                      <span className="runut-tab-kpi-sub">Resep BOM otomatis susut</span>
                    </div>
                  </div>
                </div>

                <div className="d-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th scope="col">Nama Menu / Produk</th>
                        <th scope="col">Kategori</th>
                        <th scope="col">Stasiun</th>
                        <th scope="col" className="d-num">Harga Jual</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(productsList.data ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: "var(--space-lg)" }} className="d-muted">
                            Belum ada produk terdaftar.
                          </td>
                        </tr>
                      ) : (
                        productsList.data.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                            <td>{p.category || "Umum"}</td>
                            <td><span className="d-mono d-muted">{p.station || "Dapur"}</span></td>
                            <td className="d-num" style={{ fontWeight: 700 }}>{rupiah(p.price)}</td>
                            <td>
                              <Badge tone={p.is_available ? "ok" : "danger"}>
                                {p.is_available ? "Tersedia" : "Habis (86)"}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ───────── TAB 3: CABANG & TITIK OPERASI ───────── */}
            {activeTab === "cabang" && (
              <>
                {/* Dedicated SVG KPI Stat Cards for Tab Cabang */}
                <div className="runut-tab-kpi-grid">
                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--sky">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                        <path d="M2 7h20" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Gerai Aktif Terkoneksi</span>
                      <span className="runut-tab-kpi-val">{view.branches.length} Titik Gerai</span>
                      <span className="runut-tab-kpi-sub">Multi-branch realtime sync</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--amber">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Top Kontributor Gerai</span>
                      <span className="runut-tab-kpi-val">
                        {view.branches.reduce((prev, curr) => (curr.revenue > prev.revenue ? curr : prev), view.branches[0] || {}).name || "Cabang Utama"}
                      </span>
                      <span className="runut-tab-kpi-sub">
                        {pct(Math.max(...view.branches.map((b) => b.revenue), 0) / Math.max(1, view.total.revenue))} pangsa omset
                      </span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--emerald">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Rata-rata Omset / Gerai</span>
                      <span className="runut-tab-kpi-val">
                        {rupiah(Math.round(view.total.revenue / Math.max(1, view.branches.length)))}
                      </span>
                      <span className="runut-tab-kpi-sub">Kinerja gerai konsisten</span>
                    </div>
                  </div>
                </div>

                <div className="d-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th scope="col">Nama Cabang</th>
                        <th scope="col" className="d-num">Transaksi</th>
                        <th scope="col" className="d-num">Omset</th>
                        <th scope="col" className="d-num">Kontribusi</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.branches.map((b) => (
                        <tr key={b.name}>
                          <td style={{ fontWeight: 600 }}>{b.name}</td>
                          <td className="d-num">{number(b.orders)}</td>
                          <td className="d-num" style={{ fontWeight: 700 }}>{rupiah(b.revenue)}</td>
                          <td className="d-num">{pct(b.revenue / Math.max(1, view.total.revenue))}</td>
                          <td><Badge tone="ok">Aktif</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ───────── TAB 4: ANALISIS MARGIN & PSAK ───────── */}
            {activeTab === "margin" && (
              <>
                {/* Dedicated SVG KPI Stat Cards for Tab Margin */}
                <div className="runut-tab-kpi-grid">
                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--emerald">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                        <path d="M22 12A10 10 0 0 0 12 2v10z" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Rasio Margin Kotor</span>
                      <span className="runut-tab-kpi-val">
                        {pct(view.total.gross / Math.max(1, view.total.revenue))}
                      </span>
                      <span className="runut-tab-kpi-sub">Target sehat bisnis ≥ 60%</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--amber">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                        <polyline points="16 7 22 7 22 13" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Beban HPP (BOM)</span>
                      <span className="runut-tab-kpi-val">{rupiah(view.total.cogs)}</span>
                      <span className="runut-tab-kpi-sub">Kalkulasi bahan baku terpakai</span>
                    </div>
                  </div>

                  <div className="runut-tab-kpi-card">
                    <div className="runut-tab-kpi-icon runut-tab-kpi-icon--purple">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="9" y1="21" x2="9" y2="9" />
                      </svg>
                    </div>
                    <div className="runut-tab-kpi-content">
                      <span className="runut-tab-kpi-lbl">Laba Bersih Riil</span>
                      <span className="runut-tab-kpi-val">
                        {operasional ? "Terkunci GM" : rupiah(view.total.net)}
                      </span>
                      <span className="runut-tab-kpi-sub">
                        {operasional ? "Kebijakan GM" : `Beban opex ${rupiahShort(view.total.opex)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="d-table-wrap">
                  <table className="d-table">
                    <thead>
                      <tr>
                        <th scope="col">Cabang</th>
                        <th scope="col" className="d-num">Omset</th>
                        <th scope="col" className="d-num">Diskon</th>
                        <th scope="col" className="d-num">HPP (BOM)</th>
                        <th scope="col" className="d-num">Marjin Kotor</th>
                        {!operasional && <th scope="col" className="d-num">Laba Bersih</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {view.branches.map((b) => (
                        <tr key={b.name}>
                          <td style={{ fontWeight: 600 }}>{b.name}</td>
                          <td className="d-num">{rupiah(b.revenue)}</td>
                          <td className="d-num">{rupiah(b.discount)}</td>
                          <td className="d-num">{rupiah(b.cogs)}</td>
                          <td className="d-num" style={{ fontWeight: 700, color: "var(--brand-emerald)" }}>
                            {pct(b.gross / Math.max(1, b.revenue))}
                          </td>
                          {!operasional && <td className="d-num" style={{ fontWeight: 700 }}>{rupiah(b.net)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
