import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAccountLang, t } from "../pages/account/i18n.js";

// ───────── Error Boundary Pelindung Layar Putih (White-Screen Shield) ─────────
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[Tijarah ErrorBoundary]: Terjadi galat pada komponen:", error, errorInfo);
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }
  reset = () => {
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError) {
      return (
        <section className="d-panel" style={{ margin: "1.5rem auto", maxWidth: "640px", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "var(--radius-lg, 12px)", background: "var(--color-paper-2, #ffffff)", padding: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: "1.5rem", color: "var(--color-danger, #ef4444)" }} aria-hidden="true" />
            <h2 style={{ fontSize: "1.2rem", margin: 0, color: "var(--color-ink, #0f172a)" }}>Gagal Memuat Sub-Halaman Ini</h2>
          </div>
          <p style={{ color: "var(--color-muted, #64748b)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
            {this.state.error?.message || "Terjadi kesalahan internal saat memuat data modul. Silakan muat ulang atau pilih menu lain pada navigasi samping."}
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => { this.reset(); window.location.reload(); }}>
              Muat Ulang Halaman
            </button>
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={this.reset}>
              Coba Lagi
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

// ───────── Multi-Tier Persistent SWR Cache (L1 RAM + L2 LocalStorage) untuk Respon Kilat 0ms ─────────
const ASYNC_CACHE = new Map();
const CACHE_PREFIX = "tijarah_async_cache:";

function getStorageCache(key) {
  if (!key || typeof window === "undefined" || !window.localStorage) return undefined;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "_ts" in parsed && "data" in parsed) {
      ASYNC_CACHE.set(key, parsed.data);
      return parsed.data;
    }
    ASYNC_CACHE.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

function setStorageCache(key, data) {
  if (!key || data == null || typeof window === "undefined" || !window.localStorage) return;
  try {
    ASYNC_CACHE.set(key, data);
    localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ _ts: Date.now(), data })
    );
  } catch {
    // Quota exceeded atau private browsing: data tetap di RAM
  }
}

export function clearAsyncCache(prefix) {
  if (!prefix) {
    ASYNC_CACHE.clear();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    return;
  }
  for (const k of ASYNC_CACHE.keys()) {
    if (k.startsWith(prefix)) ASYNC_CACHE.delete(k);
  }
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const keysToRemove = [];
      const search = `${CACHE_PREFIX}${prefix}`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(search)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }
}

export function useAsync(fn, deps = [], options = {}) {
  // Serialisasi deps untuk cache key deterministik
  const fnKey = fn.name || (fn.toString ? fn.toString().slice(0, 60) : "");
  const depsKey = deps.map((d) => (d && typeof d === "object" ? (d.id || d.branchId || d.tenantId || Object.keys(d).length) : String(d))).join("::");
  const cacheKey = options.key || (depsKey ? `${fnKey}@${depsKey}` : (typeof window !== "undefined" ? `page@${window.location.pathname}` : null));

  // Periksa L1 (RAM), jika kosong segera hydrate dari L2 (LocalStorage Persistent)
  const initialCached = cacheKey
    ? ASYNC_CACHE.has(cacheKey)
      ? ASYNC_CACHE.get(cacheKey)
      : getStorageCache(cacheKey)
    : undefined;

  const [state, setState] = useState(() => ({
    data: initialCached !== undefined ? initialCached : null,
    error: null,
    loading: initialCached === undefined,
  }));

  const prevKeyRef = useRef(cacheKey);
  useEffect(() => {
    if (prevKeyRef.current !== cacheKey) {
      prevKeyRef.current = cacheKey;
      const cached = cacheKey ? (ASYNC_CACHE.get(cacheKey) || getStorageCache(cacheKey)) : undefined;
      if (cached !== undefined) {
        setState({ data: cached, loading: false, error: null });
      }
    }
  }, [cacheKey]);

  const seq = useRef(0);
  const run = useCallback(() => {
    const n = ++seq.current;
    const currentCached = cacheKey ? (ASYNC_CACHE.get(cacheKey) || getStorageCache(cacheKey)) : undefined;

    // Jika data sudah ada di L1/L2, tampilkan data dan jangan tampilkan spinner kosong
    setState((s) => ({
      data: currentCached !== undefined ? currentCached : s.data,
      loading: currentCached === undefined && s.data == null,
      error: null
    }));

    // Timeout failsafe 18 detik untuk latensi antar-benua
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Waktu tunggu server melebihi batas (18s). Menggunakan data lokal offline."));
      }, 18000);
    });

    const fnPromise = Promise.resolve().then(fn).then((res) => {
      clearTimeout(timer);
      if (n === seq.current) {
        if (cacheKey && res != null) {
          setStorageCache(cacheKey, res);
        }
        setState((s) => ({
          data: res != null ? res : s.data,
          error: null,
          loading: false
        }));
      }
      return res;
    });

    Promise.race([fnPromise, timeoutPromise]).catch((error) => {
      if (n === seq.current) {
        const fallback = (cacheKey && (ASYNC_CACHE.get(cacheKey) || getStorageCache(cacheKey))) || null;
        if (fallback != null) {
          setState({ data: fallback, error: null, loading: false });
        } else {
          setState((s) => ({
            data: s.data,
            error: s.data == null ? error : null,
            loading: false,
          }));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { ...state, reload: run };
}

// ───────── Layout halaman dengan Auto-i18n Realtime ─────────
export function PageHead({ eyebrow, title, desc, actions }) {
  const { lang } = useAccountLang();
  return (
    <header className="d-head">
      <div className="d-head__copy">
        {eyebrow && <p className="d-eyebrow">{t(eyebrow, lang)}</p>}
        <h1>{t(title, lang)}</h1>
        {desc && <p className="d-head__desc">{t(desc, lang)}</p>}
      </div>
      {actions && <div className="d-head__actions">{actions}</div>}
    </header>
  );
}

export function Panel({ title, meta, desc, actions, children, className = "" }) {
  const { lang } = useAccountLang();
  return (
    <section className={`d-panel ${className}`}>
      {(title || actions || meta || desc) && (
        <header className="d-panel__head">
          <div>
            {title && <h2>{t(title, lang)}</h2>}
            {meta && <p className="d-panel__meta">{t(meta, lang)}</p>}
            {desc && <p className="d-panel__desc" style={{ fontSize: "0.8125rem", color: "var(--color-muted, #64748b)", margin: "2px 0 0" }}>{t(desc, lang)}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

function getKpiSvg(type) {
  switch (type) {
    case "revenue":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="22" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "orders":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case "gross":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "net":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "users":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "stock":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case "cash":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case "target":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "alert":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
      );
  }
}

function detectKpiType(label = "") {
  const l = label.toLowerCase();
  if (l.includes("omset") || l.includes("omzet") || l.includes("revenue") || l.includes("gmv") || l.includes("penjualan") || l.includes("mrr")) return "revenue";
  if (l.includes("transaksi") || l.includes("pesanan") || l.includes("order") || l.includes("tiket")) return "orders";
  if (l.includes("laba kotor") || l.includes("gross") || l.includes("margin") || l.includes("capaian") || l.includes("proyeksi")) return "gross";
  if (l.includes("laba bersih") || l.includes("net") || l.includes("keuntungan")) return "net";
  if (l.includes("staf") || l.includes("anggota") || l.includes("pelanggan") || l.includes("merchant") || l.includes("tenant") || l.includes("member") || l.includes("pasien")) return "users";
  if (l.includes("stok") || l.includes("persediaan") || l.includes("gudang") || l.includes("waste") || l.includes("barang")) return "stock";
  if (l.includes("kas") || l.includes("laci") || l.includes("tunai") || l.includes("komisi") || l.includes("tagihan")) return "cash";
  if (l.includes("target") || l.includes("kuota") || l.includes("poin")) return "target";
  if (l.includes("telat") || l.includes("waspada") || l.includes("berisiko") || l.includes("tunggakan") || l.includes("bahaya") || l.includes("minimum")) return "alert";
  return "default";
}

export function Stat({ label, title, value, sub, note, hidden, icon, tone }) {
  const { lang } = useAccountLang();
  const rawLabel = label || title || "";
  const rawSub = sub || note || "";
  const displayLabel = t(rawLabel, lang);
  const displaySub = t(rawSub, lang);
  const kpiType = icon ? null : detectKpiType(rawLabel);
  const iconNode = icon || getKpiSvg(kpiType);
  const resolvedTone = tone || (["revenue", "net", "cash"].includes(kpiType) ? "emerald" : ["gross", "target"].includes(kpiType) ? "gold" : kpiType === "alert" ? "warn" : "slate");

  return (
    <div className={`d-stat d-stat--${resolvedTone}`}>
      <div className="d-stat__header">
        <span className="d-stat__label">{displayLabel}</span>
        {iconNode && <span className="d-stat__icon" aria-hidden="true">{iconNode}</span>}
      </div>
      <p className="d-stat__value">{hidden ? <span className="d-muted">{lang === "en" ? "Restricted access" : "Tidak termasuk hak akses"}</span> : value}</p>
      {displaySub && !hidden && <p className="d-stat__sub">{displaySub}</p>}
    </div>
  );
}

export function Loading({ label = "Memuat data…" }) {
  const { lang } = useAccountLang();
  const displayLabel = label === "Memuat data…" ? (lang === "en" ? "Loading data…" : "Memuat data…") : t(label, lang);
  return (
    <div className="d-loading" role="status" style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "1rem 0" }}>
      <i className="fa-solid fa-circle-notch fa-spin" style={{ color: "var(--color-accent, #059669)", fontSize: "1rem" }} aria-hidden="true" />
      <span className="d-loading__bar" aria-hidden="true" />
      <span style={{ fontSize: "0.9rem", color: "var(--color-muted, #64748b)" }}>{displayLabel}</span>
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  const { lang } = useAccountLang();
  const rawMsg = error?.message ?? String(error);
  return (
    <div className="d-error" role="alert">
      <p><strong>{lang === "en" ? "Failed to load." : "Gagal memuat."}</strong> {t(rawMsg, lang)}</p>
      {onRetry && <button type="button" className="d-btn d-btn--ghost" onClick={onRetry}>{lang === "en" ? "Retry" : "Coba lagi"}</button>}
    </div>
  );
}

export function Empty({ title, children }) {
  const { lang } = useAccountLang();
  const displayTitle = title ? t(title, lang) : (lang === "en" ? "No data available" : "Belum ada data");
  return (
    <div className="d-empty">
      <p className="d-empty__title">{displayTitle}</p>
      {children && <p>{typeof children === "string" ? t(children, lang) : children}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }) {
  return <span className={`d-badge d-badge--${tone}`}>{children}</span>;
}

// ───────── Form ─────────
export function Field({ label, hint, error, children, id }) {
  const { lang } = useAccountLang();
  return (
    <div className={`d-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label ? t(label, lang) : label}</label>
      {children}
      {hint && !error && <p className="d-field__hint">{t(hint, lang)}</p>}
      {error && <p className="d-field__error" role="alert">{t(error, lang)}</p>}
    </div>
  );
}

// Dialog native: fokus terkunci & Esc ditangani browser.
export function Modal({ open, hidden = false, title, onClose, children, footer, style }) {
  const { lang } = useAccountLang();
  const ref = useRef(null);
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`d-modal ${hidden ? "d-modal--behind" : ""}`}
      style={{
        ...(hidden ? { visibility: "hidden", pointerEvents: "none", opacity: 0 } : {}),
        ...style,
      }}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="d-modal-title"
    >
      {open && (
        <form
          method="dialog"
          className="d-modal__inner"
          onSubmit={(e) => e.preventDefault()}
        >
          <header className="d-modal__head">
            <h2 id="d-modal-title">{title ? t(title, lang) : ""}</h2>
            <button type="button" className="d-icon-btn" onClick={onClose} aria-label={lang === "en" ? "Close" : "Tutup"}>×</button>
          </header>
          <div className="d-modal__body">{children}</div>
          {footer && <footer className="d-modal__foot">{footer}</footer>}
        </form>
      )}
    </dialog>
  );
}

// ───────── Grafik ─────────
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Satu seri garis + crosshair/tooltip. points: [{ x: label, y: number }] */
export function LineChart({ points, format, label, height = 220 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const pad = { l: 68, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(...points.map((p) => p.y), 1);
  const niceMax = (() => {
    const mag = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / mag) * mag;
  })();
  const X = (i) => pad.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v) => pad.t + ih - (v / niceMax) * ih;
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${X(points.length - 1)},${pad.t + ih} L${X(0)},${pad.t + ih} Z`;
  const ticks = [0, 0.5, 1].map((f) => niceMax * f);
  const xi = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left - pad.l;
    const i = Math.round((x / iw) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <figure className="d-chart" ref={ref}>
      <svg width={w} height={height} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="d-chart__grid" x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} />
            <text className="d-chart__tick" x={pad.l - 8} y={Y(t)} dy="0.32em" textAnchor="end">{format(t, true)}</text>
          </g>
        ))}
        {xi.map((i) => points[i] && (
          <text key={i} className="d-chart__tick" x={X(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
            {points[i].x}
          </text>
        ))}
        <path className="d-chart__area" d={area} />
        <path className="d-chart__line" d={d} />
        {hover != null && (
          <g>
            <line className="d-chart__cross" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={pad.t + ih} />
            <circle className="d-chart__dot" cx={X(hover)} cy={Y(points[hover].y)} r="4.5" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="d-chart__tip" style={{ left: Math.min(Math.max(X(hover), 70), w - 70) }}>
          <span>{points[hover].x}</span>
          <strong>{format(points[hover].y)}</strong>
        </div>
      )}
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

/** Batang horizontal satu warna; identitas dibawa label, bukan warna. */
export function BarList({ rows, format }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="d-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <span className="d-bars__label">{r.label}</span>
          <span className="d-bars__track" aria-hidden="true">
            <span className="d-bars__fill" style={{ "--w": r.value / max }} />
          </span>
          <span className="d-bars__value">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
