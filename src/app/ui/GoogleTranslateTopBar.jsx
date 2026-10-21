import { useAccountLang } from "../pages/account/i18n.js";

/**
 * GoogleTranslateTopBar
 * Bilah pita Google Translate widget di paling atas halaman (standby & runtut ID ➔ EN).
 * Sinkron 100% dengan Google Chrome Translate, useAccountLang(), dan document.cookie "googtrans".
 */
export default function GoogleTranslateTopBar({ collapsed, onToggleCollapsed }) {
  const { lang, setLang } = useAccountLang();

  const switchToId = () => {
    setLang("id");
    try {
      // Hapus cookie translasi Google Translate agar kembali ke bahasa asli
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`;
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = "id";
      }
    } catch {}
  };

  const switchToEn = () => {
    setLang("en");
    try {
      // Set standar cookie Google Translate resmi /id/en
      document.cookie = "googtrans=/id/en; path=/;";
      document.cookie = `googtrans=/id/en; path=/; domain=${window.location.hostname};`;
      if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = "en";
      }
    } catch {}
  };

  if (collapsed) {
    return (
      <aside
        className="d-translate-pill"
        role="region"
        aria-label="Pintasan Google Translate"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="d-translate-pill__btn"
          title="Buka Bilah Google Translate (ID ➔ EN)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ color: "#4285F4" }}>
            <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
          </svg>
          <span className="d-translate-pill__text">
            Translate: <strong>{lang === "id" ? "ID" : "EN"}</strong>
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="d-translate-bar"
      role="region"
      aria-label="Bilah Google Translate Widget"
    >
      <div className="d-translate-bar__inner">
        {/* Brand Kiri */}
        <div className="d-translate-bar__brand">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="d-translate-bar__gicon">
            <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
          </svg>
          <span className="d-translate-bar__title">
            Google Terjemahan
          </span>
          <span className="d-translate-bar__badge">
            Auto-Sync
          </span>
        </div>

        <div className="d-translate-bar__divider" aria-hidden="true" />

        {/* Alur Runut ID ➔ EN */}
        <div className="d-translate-bar__flow" aria-label="Alur translasi bahasa runtut">
          {/* Asal: Indonesia */}
          <button
            type="button"
            onClick={switchToId}
            className={`d-translate-bar__lang-btn${lang === "id" ? " is-active" : ""}`}
            title="Tampilkan dalam Bahasa Indonesia (Asli)"
            aria-pressed={lang === "id"}
          >
            <svg width="16" height="12" viewBox="0 0 640 480" className="d-translate-bar__flag" aria-hidden="true">
              <rect width="640" height="240" fill="#e70011" />
              <rect y="240" width="640" height="240" fill="#ffffff" />
            </svg>
            <span className="d-translate-bar__lang-name">Indonesia</span>
            <span className="d-translate-bar__lang-tag">{lang === "id" ? "Asli" : "ID"}</span>
          </button>

          {/* Panah Alur Runut */}
          <div className="d-translate-bar__arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <polyline points="13 5 20 12 13 19" />
            </svg>
          </div>

          {/* Tujuan: English */}
          <button
            type="button"
            onClick={switchToEn}
            className={`d-translate-bar__lang-btn${lang === "en" ? " is-active" : ""}`}
            title="Translate to English (Terjemahan)"
            aria-pressed={lang === "en"}
          >
            <svg width="16" height="12" viewBox="0 0 640 480" className="d-translate-bar__flag" aria-hidden="true">
              <rect width="640" height="480" fill="#bd3d44" />
              <path stroke="#fff" strokeWidth="37" d="M0 55h640M0 129h640M0 203h640M0 277h640M0 351h640M0 425h640" />
              <rect width="260" height="221" fill="#192f5d" />
              <circle cx="130" cy="110" r="8" fill="#fff" />
            </svg>
            <span className="d-translate-bar__lang-name">English</span>
            <span className="d-translate-bar__lang-tag">{lang === "en" ? "Active" : "EN"}</span>
          </button>
        </div>

        {/* Aksi Cepat & Status Kanan */}
        <div className="d-translate-bar__actions">
          {lang === "id" ? (
            <button
              type="button"
              onClick={switchToEn}
              className="d-translate-bar__cta-btn d-translate-bar__cta-btn--translate"
              title="Terjemahkan antarmuka ke Bahasa Inggris"
            >
              <span>Terjemahkan ke EN</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={switchToId}
              className="d-translate-bar__cta-btn d-translate-bar__cta-btn--original"
              title="Kembalikan antarmuka ke Bahasa Indonesia asli"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Bahasa Asli (ID)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleCollapsed}
            className="d-translate-bar__close-btn"
            title="Ciutkan bilah Google Translate"
            aria-label="Ciutkan bilah"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
