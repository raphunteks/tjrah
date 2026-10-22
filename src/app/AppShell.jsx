import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { Link, useRouter } from "../lib/router.jsx";
import { ROLE_LABEL, ROLE_LEVEL } from "../lib/rbac-matrix.js";
import { pagesFor, findPage, pillarOk } from "./pages.js";
import { Loading, useAsync, ErrorBoundary } from "./ui/index.jsx";
import { NavIcon } from "./NavIcons.jsx";
import { gsap, useGSAP, prefersReducedMotion } from "../lib/gsap.js";
import { useAccountLang, GROUP_TRANSLATIONS, ROLE_TRANSLATIONS, PAGE_TRANSLATIONS } from "./pages/account/i18n.js";
import { getSavedTheme, applyTheme } from "../lib/theme.js";
import { requestBrowserNotification, isPWAStandalone } from "../lib/notifications.js";
import { requestDeviceLocation } from "../lib/geo.js";
import { loadGoogleMaps } from "../lib/googleMaps.js";
import "../styles/dashboard.css";
import "../styles/clinic.css";
import "../styles/service.css";

function TenantSwitcher() {
  const { viewTenant, chooseTenant, tenants } = useAuth();
  const { lang } = useAccountLang();
  return (
    <label className="d-switch">
      <span className="d-switch__label">Tenant</span>
      <select value={viewTenant ?? ""} onChange={(e) => chooseTenant(e.target.value || null)}>
        <option value="">{lang === "en" ? "-- Select Tenant / Platform --" : "-- Pilih Tenant / Platform --"}</option>
        {(tenants ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.pillar ? t.pillar.toUpperCase() : "TENANT"})
          </option>
        ))}
      </select>
    </label>
  );
}

function TenantName() {
  const { tenant } = useAuth();
  return <p className="d-top__tenant">{tenant?.name ?? "…"}</p>;
}

function NeedTenant() {
  const { lang } = useAccountLang();
  return (
    <div className="d-empty d-empty--page">
      <h1 className="d-empty__title">{lang === "en" ? "Select a tenant first" : "Pilih tenant terlebih dahulu"}</h1>
      <p>{lang === "en" ? "This page displays business data for a single merchant. Select a tenant in the top bar; access is recorded in the audit log." : "Halaman ini menampilkan data bisnis satu merchant. Pilih tenant di bilah atas; aksesnya dicatat di audit log."}</p>
    </div>
  );
}

function Denied() {
  const { lang } = useAccountLang();
  return (
    <div className="d-empty d-empty--page">
      <h1 className="d-empty__title">{lang === "en" ? "This page is outside your role's access permissions" : "Halaman ini di luar hak akses peran Anda"}</h1>
      <p>{lang === "en" ? "See My Access Rights for a list of available features." : "Lihat Hak akses saya untuk daftar fitur yang tersedia."}</p>
    </div>
  );
}

function SidebarToggleIcon({ collapsed = false, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="d-side-toggle-svg"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="4" />
      <path d="M9 3v18" />
      {collapsed ? (
        <path d="m12 9 3 3-3 3" />
      ) : (
        <path d="m15 9-3 3 3 3" />
      )}
    </svg>
  );
}

const GROUP_ICONS = {
  "Umum": "fa-solid fa-compass",
  "SDM": "fa-solid fa-users",
  "SDM & HRIS": "fa-solid fa-users",
  "Bisnis": "fa-solid fa-chart-line",
  "Operasional": "fa-solid fa-cash-register",
  "Gudang & menu": "fa-solid fa-boxes-stacked",
  "Keuangan": "fa-solid fa-vault",
  "Layanan & Akses": "fa-solid fa-handshake",
  "Platform": "fa-solid fa-server",
  "Klinik": "fa-solid fa-hospital-user",
  "Akun": "fa-solid fa-circle-user",
};

const getGroupLabel = (g, pillar = null) => {
  if (g === "SDM" || g === "SDM & HRIS") return "SDM & HRIS";
  if (pillar === "health" && (g === "Gudang & menu" || g === "Gudang & Menu")) {
    return "Gudang & Farmasi";
  }
  return g;
};

function SidebarUserFooter({ profile, role, roleLabel, collapsed, lang, setLang, onSignOut, loggingOut }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [theme, setTheme] = useState(() => getSavedTheme());
  const popoverRef = useRef(null);
  const { navigate } = useRouter();

  const [avatar, setAvatar] = useState(() => {
    try {
      return (
        (profile?.id && localStorage.getItem(`tijarah:avatar:${profile.id}`)) ||
        localStorage.getItem("tijarah:avatar") ||
        profile?.avatar_url ||
        "/tijarah-logo.svg"
      );
    } catch {
      return "/tijarah-logo.svg";
    }
  });

  useEffect(() => {
    try {
      const saved =
        (profile?.id && localStorage.getItem(`tijarah:avatar:${profile.id}`)) ||
        localStorage.getItem("tijarah:avatar") ||
        profile?.avatar_url ||
        "/tijarah-logo.svg";
      setAvatar(saved);
    } catch {}
  }, [profile?.id, profile?.avatar_url]);

  useEffect(() => {
    const handleAvatarChange = (e) => {
      if (e.detail) setAvatar(e.detail);
    };
    const handleStorage = (e) => {
      if (e.key && e.key.includes("avatar")) {
        setAvatar(e.newValue || "/tijarah-logo.svg");
      }
    };
    window.addEventListener("tijarah:avatar_change", handleAvatarChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("tijarah:avatar_change", handleAvatarChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const handleThemeChange = (e) => setTheme(e.detail || getSavedTheme());
    window.addEventListener("tijarah:theme_change", handleThemeChange);
    return () => {
      window.removeEventListener("tijarah:theme_change", handleThemeChange);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopoverOpen(false);
      }
    };
    if (popoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [popoverOpen]);

  const handleSelectTheme = (t) => {
    applyTheme(t);
    setTheme(t);
  };

  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isPWAStandalone()) return;

    const handler = (e) => {
      // Simpan event instalasi tanpa memanggil preventDefault dini agar Chromium tidak mencetak warning di console
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstallPrompt(null));
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const handleNavigateProfile = () => {
    setPopoverOpen(false);
    navigate("/app/akun/profil");
  };

  const isSvgLogo = !avatar || avatar === "/tijarah-logo.svg";

  return (
    <div className="d-side__foot" ref={popoverRef}>
      <div className="d-user-footer-wrap">
        {/* Tombol Kartu Profil Pengguna Interaktif (Gambar 4 & 5) */}
        <button
          type="button"
          className={`d-user-card-btn${popoverOpen ? " is-active" : ""}`}
          onClick={() => setPopoverOpen((prev) => !prev)}
          title={`${profile?.full_name || "Pengguna"} (${ROLE_LEVEL[role]} · ${roleLabel})`}
          aria-expanded={popoverOpen}
          aria-haspopup="true"
        >
          <div className="d-user-card-left">
            <img
              src={avatar || "/tijarah-logo.svg"}
              alt={profile?.full_name || "Foto Profil"}
              className="d-user-avatar-img"
              style={{
                objectFit: isSvgLogo ? "contain" : "cover",
                padding: isSvgLogo ? "3px" : "0",
                background: "var(--color-paper-3)"
              }}
              onError={(e) => {
                if (!e.currentTarget.src.endsWith("/tijarah-logo.svg")) {
                  e.currentTarget.src = "/tijarah-logo.svg";
                  e.currentTarget.style.objectFit = "contain";
                  e.currentTarget.style.padding = "3px";
                }
              }}
            />
            <div className="d-user-meta">
              <span className="d-user-name">{profile?.full_name || "Pengguna"}</span>
              <span className="d-user-role-sub">{ROLE_LEVEL[role]} · {roleLabel}</span>
            </div>
          </div>
          <span className="d-user-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={popoverOpen ? "6 9 12 15 18 9" : "18 15 12 9 6 15"} />
            </svg>
          </span>
        </button>

        {/* Floating Upward Popover Menu */}
        {popoverOpen && (
          <div className="d-user-popover" role="menu">
            {/* Header Profil Pengguna Aktif */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0.65rem", borderBottom: "1px solid var(--color-rule)", marginBottom: "0.35rem" }}>
              <img
                src={avatar || "/tijarah-logo.svg"}
                alt={profile?.full_name || "Foto Profil"}
                style={{
                  width: "2.1rem",
                  height: "2.1rem",
                  borderRadius: "50%",
                  objectFit: isSvgLogo ? "contain" : "cover",
                  padding: isSvgLogo ? "2px" : "0",
                  border: "1.5px solid var(--color-rule)",
                  background: "var(--color-paper-3)",
                  flexShrink: 0
                }}
              />
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ font: "600 0.85rem var(--font-display)", color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {profile?.full_name || "Pengguna"}
                </div>
                <div style={{ font: "500 0.6875rem var(--font-mono)", color: "var(--color-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ROLE_LEVEL[role]} · {roleLabel}
                </div>
              </div>
            </div>

            {/* 1. Navigasi ke Profil Saya */}
            <button
              type="button"
              className="d-popover-item"
              onClick={handleNavigateProfile}
              role="menuitem"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{lang === "en" ? "My Profile" : "Profil Saya"}</span>
            </button>

            {/* 2. Pemilih Mode Tema (3 SVG: Terang, Gelap, Sistem) */}
            <div className="d-popover-section-label">
              {lang === "en" ? "Theme" : "Tema"}
            </div>
            <div className="d-popover-theme-grid">
              <button
                type="button"
                className={`d-popover-theme-btn${theme === "light" ? " is-active" : ""}`}
                onClick={() => handleSelectTheme("light")}
                title={lang === "en" ? "Light Mode" : "Mode Terang"}
                aria-label="Light Theme"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              </button>
              <button
                type="button"
                className={`d-popover-theme-btn${theme === "dark" ? " is-active" : ""}`}
                onClick={() => handleSelectTheme("dark")}
                title={lang === "en" ? "Dark Mode" : "Mode Gelap"}
                aria-label="Dark Theme"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              </button>
              <button
                type="button"
                className={`d-popover-theme-btn${theme === "system" ? " is-active" : ""}`}
                onClick={() => handleSelectTheme("system")}
                title={lang === "en" ? "System Default" : "Sistem OS"}
                aria-label="System Theme"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="14" x="2" y="3" rx="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
              </button>
            </div>

            {/* 3. Pemilih Bahasa (Kiri: EN · Kanan: ID berdampingan seperti baris Tema) */}
            <div className="d-popover-section-label">
              {lang === "en" ? "Language" : "Bahasa"}
            </div>
            <div className="d-popover-lang-grid">
              {/* Kiri: SVG Bendera Indonesia (ID) */}
              <button
                type="button"
                className={`d-popover-lang-btn${lang === "id" ? " is-active" : ""}`}
                onClick={() => setLang("id")}
                title="Bahasa Indonesia (ID)"
                aria-label="Bahasa Indonesia (ID)"
              >
                <svg width="18" height="12" viewBox="0 0 640 480" style={{ borderRadius: "2px", flexShrink: 0, border: "0.5px solid rgba(0,0,0,0.18)" }} aria-hidden="true">
                  <rect width="640" height="240" fill="#e70011" />
                  <rect y="240" width="640" height="240" fill="#ffffff" />
                </svg>
                <span>ID</span>
              </button>

              {/* Kanan: SVG Bendera English (EN) */}
              <button
                type="button"
                className={`d-popover-lang-btn${lang === "en" ? " is-active" : ""}`}
                onClick={() => setLang("en")}
                title="English (EN)"
                aria-label="English (EN)"
              >
                <svg width="18" height="12" viewBox="0 0 640 480" style={{ borderRadius: "2px", flexShrink: 0, border: "0.5px solid rgba(0,0,0,0.18)" }} aria-hidden="true">
                  <rect width="640" height="480" fill="#bd3d44" />
                  <path stroke="#fff" strokeWidth="37" d="M0 55h640M0 129h640M0 203h640M0 277h640M0 351h640M0 425h640" />
                  <rect width="260" height="221" fill="#192f5d" />
                  <circle cx="130" cy="110" r="8" fill="#fff" />
                </svg>
                <span>EN</span>
              </button>
            </div>

            <div className="d-popover-divider" />

            {/* 4. Pasang Aplikasi (PWA) jika didukung peramban */}
            {installPrompt && (
              <button
                type="button"
                className="d-popover-install-btn"
                onClick={handleInstallPWA}
                role="menuitem"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{lang === "en" ? "Install App (PWA)" : "Pasang Aplikasi (PWA)"}</span>
              </button>
            )}

            {/* 5. Keluar / Sign Out */}
            <button
              type="button"
              className="d-popover-logout-btn"
              disabled={loggingOut}
              onClick={onSignOut}
              role="menuitem"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>{loggingOut ? (lang === "en" ? "Signing out…" : "Keluar…") : (lang === "en" ? "Sign Out" : "Keluar")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppShell() {
  const { profile, role, tenantId, signOut, api, pillar, tenant } = useAuth();
  const { path, navigate } = useRouter();
  const { lang, setLang } = useAccountLang();
  const [navOpen, setNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return (sessionStorage.getItem("tijarah:sidebar_collapsed") ?? sessionStorage.getItem("harumin:sidebar_collapsed")) === "1";
    } catch {
      return false;
    }
  });

  const roleLabel = ROLE_TRANSLATIONS[role]?.[lang] || ROLE_LABEL[role];

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 960) {
      setNavOpen(false);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("tijarah:sidebar_collapsed", next ? "1" : "0");
      } catch {
        /* abaikan */
      }
      return next;
    });
  };

  const main = useRef(null);
  const pages = pagesFor(role, pillar).filter((p) => {
    // Sembunyikan Layar Dapur (KDS) dari sidebar jika tenant menonaktifkan KDS
    if (p.path === "/app/dapur" && tenant && tenant.kds_enabled === false) {
      return false;
    }
    // Sembunyikan Reservasi dari sidebar jika dinonaktifkan di Pengaturan Dapur & KDS (khusus non-klinik)
    if (p.path === "/app/antrean" && pillar !== "health" && tenant) {
      const isReservationDisabled =
        tenant.reservation_enabled === false ||
        (tenant.kds_enabled === false && tenant.reservation_enabled !== true);
      if (isReservationDisabled) {
        return false;
      }
    }
    return true;
  });
  const page = findPage(path);
  const allowed = page && page.gate(role) && pillarOk(page, pillar);

  const currentGroup = page?.group;
  const [openGroups, setOpenGroups] = useState(() => {
    return { [currentGroup || "SDM"]: true };
  });

  useEffect(() => {
    if (currentGroup) {
      setOpenGroups((prev) => ({ ...prev, [currentGroup]: true }));
    }
  }, [currentGroup]);

  const toggleGroup = (g) => {
    if (collapsed) {
      setCollapsed(false);
      try {
        sessionStorage.setItem("tijarah:sidebar_collapsed", "0");
      } catch {}
    }
    setOpenGroups((prev) => ({
      ...prev,
      [g]: !prev[g],
    }));
  };

  useEffect(() => setNavOpen(false), [path]);

  // Meminta izin lokasi GPS & notifikasi peramban secara otomatis saat masuk dashboard
  useEffect(() => {
    // 1. Geolokasi real-time untuk akurasi cabang & outlet owner
    requestDeviceLocation().catch(() => {});

    // 2. Pre-load Google Maps SDK & Places Library di latar belakang (0ms saat cari lokasi)
    loadGoogleMaps().catch(() => {});

    // 3. Izin notifikasi browser
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        requestBrowserNotification(true).catch(() => {});
      }
    }
  }, []);

  // Transisi halaman: fade + naik 8px, hanya transform/opacity.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(main.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "transform" });
    },
    { dependencies: [path], scope: main }
  );

  const groups = [...new Set(pages.map((p) => p.group))];
  const Comp = page?.Comp;

  // ─────────────────────────────────────────────────────────────────────────────
  // KEEP-ALIVE SUBTAB POOL (VIRTUAL VIEWPORT PERSISTENCE)
  // Menjaga subtab yang pernah dikunjungi tetap aktif di memori (display: none).
  // Berpindah subtab (Jurnal -> Neraca -> Meja -> SDM -> Meja) instan 0ms
  // tanpa merender ulang, tanpa unmount, dan listener Realtime tetap aktif di background.
  // ─────────────────────────────────────────────────────────────────────────────
  const [cachedTabs, setCachedTabs] = useState(() => {
    if (page && allowed && (!page.tenant || tenantId) && page?.Comp) {
      return new Map([[path, { path, Comp: page.Comp }]]);
    }
    return new Map();
  });

  useEffect(() => {
    if (page && allowed && (!page.tenant || tenantId) && Comp) {
      setCachedTabs((prev) => {
        if (prev.has(path) && prev.get(path).Comp === Comp) return prev;
        const next = new Map(prev);
        next.set(path, { path, Comp });
        return next;
      });
    }
  }, [path, page, allowed, tenantId, Comp]);

  // Reset tab pool jika tenant atau role berganti demi kepatuhan isolasi multi-tenant & RBAC
  useEffect(() => {
    if (page && allowed && (!page.tenant || tenantId) && Comp) {
      setCachedTabs(new Map([[path, { path, Comp }]]));
    } else {
      setCachedTabs(new Map());
    }
  }, [tenantId, role]);

  return (
    <div className={`d-app${navOpen ? " nav-open" : ""}${collapsed ? " d-app--collapsed" : ""}`}>
      <a className="skip-link" href="#d-main">{lang === "en" ? "Skip to content" : "Lompat ke konten"}</a>
      <aside className="d-side" aria-label={lang === "en" ? "Application navigation" : "Navigasi aplikasi"}>
        <div className="d-side__head">
          <Link to="/app" className="d-brand" title={collapsed ? "Tijarah" : undefined}>
            {collapsed ? (
              <img src="/tijarah-logo.svg" alt="Tijarah" width="32" height="32" className="d-brand__icon" />
            ) : (
              <div className="d-brand__full">
                <img src="/tijarah-header.svg" alt="Tijarah" className="d-brand__header-img" />
                {api?.mode === "demo" && <span className="d-brand__sub">Demo</span>}
              </div>
            )}
          </Link>
          <button
            type="button"
            className="d-side__toggle"
            onClick={toggleSidebar}
            title={collapsed ? (lang === "en" ? "Expand sidebar ( > )" : "Buka sidebar ( > )") : (lang === "en" ? "Collapse sidebar ( < )" : "Tutup sidebar ( < )")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SidebarToggleIcon collapsed={collapsed} size={18} />
          </button>
        </div>
        <nav className="d-nav">
          {groups.map((g) => {
            const groupPages = pages.filter((p) => p.group === g);
            const isOpen = !!openGroups[g];
            const groupLabel = GROUP_TRANSLATIONS[g]?.[lang] || getGroupLabel(g, pillar);

            return (
              <div key={g} className="d-nav__group">
                <button
                  type="button"
                  className={`d-nav__header-btn ${isOpen ? "is-open" : ""}`}
                  onClick={() => toggleGroup(g)}
                  title={isOpen ? `${lang === "en" ? "Close" : "Tutup"} ${groupLabel}` : `${lang === "en" ? "Open" : "Buka"} ${groupLabel}`}
                  aria-expanded={isOpen}
                >
                  <span className="d-nav__header-title">{groupLabel}</span>
                  <span className="d-nav__header-chevron" aria-hidden="true">
                    <i className={isOpen ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-right"} />
                  </span>
                </button>

                {(isOpen || collapsed) && (
                  <ul>
                    {groupPages.map((p) => {
                      let pageLabel = PAGE_TRANSLATIONS[p.path]?.[lang] || p.label;
                      if (pillar === "health") {
                        if (p.path === "/app/produk") {
                          pageLabel = lang === "en" ? "Medicines & Services" : "Katalog Obat & Layanan";
                        } else if (p.path === "/app/karyawan") {
                          pageLabel = lang === "en" ? "Medical Staff" : "Staf & Paramedis";
                        } else if (p.path === "/app/crm") {
                          pageLabel = lang === "en" ? "Patients & Loyalty" : "Pasien & Loyalitas";
                        } else if (p.path === "/app/antrean") {
                          pageLabel = lang === "en" ? "Clinic Queue" : "Antrean Pasien";
                        }
                      } else if (p.path === "/app/antrean") {
                        pageLabel = lang === "en" ? "Reservations" : "Reservasi";
                      }
                      return (
                        <li key={p.path}>
                          <Link
                            to={p.path}
                            className={p.path === path ? "is-active" : undefined}
                            aria-current={p.path === path ? "page" : undefined}
                            title={collapsed ? pageLabel : undefined}
                          >
                            <span className="d-nav__icon" aria-hidden="true">
                              <NavIcon path={p.path} code={p.code} size={18} />
                            </span>
                            <span className="d-nav__text">{pageLabel}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
        <SidebarUserFooter
          profile={profile}
          role={role}
          roleLabel={roleLabel}
          collapsed={collapsed}
          lang={lang}
          setLang={setLang}
          loggingOut={loggingOut}
          onSignOut={async () => {
            setLoggingOut(true);
            try {
              await signOut();
            } finally {
              navigate("/masuk", { replace: true });
            }
          }}
        />
      </aside>
      <button type="button" className="d-scrim" aria-label={lang === "en" ? "Close menu" : "Tutup menu"} onClick={() => setNavOpen(false)} tabIndex={navOpen ? 0 : -1} />

      <div className="d-body">
        <header className="d-top">
          <button
            type="button"
            className="d-icon-btn d-top__menu"
            aria-label={lang === "en" ? "Open menu" : "Buka menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <SidebarToggleIcon collapsed={!navOpen} size={18} />
          </button>
          {role === "superadmin" ? <TenantSwitcher /> : <TenantName />}
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            {/* REAL-TIME LANGUAGE SWITCHER (ID / EN) DI HEADER */}
            <div style={{ display: "inline-flex", background: "var(--color-paper-2)", borderRadius: "var(--radius-md)", padding: "2px", border: "1px solid var(--color-rule)" }}>
              <button
                type="button"
                onClick={() => setLang("id")}
                title="Beralih ke Bahasa Indonesia"
                style={{
                  padding: "2px 7px",
                  fontSize: "0.6875rem",
                  fontWeight: lang === "id" ? 700 : 500,
                  color: lang === "id" ? "#FFFFFF" : "var(--color-muted)",
                  background: lang === "id" ? "var(--color-accent)" : "transparent",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1.2,
                  transition: "all 0.15s ease"
                }}
              >
                ID
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                title="Switch to English"
                style={{
                  padding: "2px 7px",
                  fontSize: "0.6875rem",
                  fontWeight: lang === "en" ? 700 : 500,
                  color: lang === "en" ? "#FFFFFF" : "var(--color-muted)",
                  background: lang === "en" ? "var(--color-accent)" : "transparent",
                  borderRadius: "var(--radius-xs)",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1.2,
                  transition: "all 0.15s ease"
                }}
              >
                EN
              </button>
            </div>

            <span className="d-role-chip" style={{ margin: 0 }}>
              <span className="d-status-indicator" aria-hidden="true" />
              {ROLE_LEVEL[role]} · {roleLabel}
            </span>
          </div>
        </header>
        <main id="d-main" className="d-main" ref={main} tabIndex={-1}>
          {!page || !allowed ? (
            <Denied />
          ) : page.tenant && !tenantId ? (
            <NeedTenant />
          ) : (
            (() => {
              const entries = new Map(cachedTabs);
              if (Comp && !entries.has(path)) {
                entries.set(path, { path, Comp });
              }
              return Array.from(entries.values()).map(({ path: pPath, Comp: PageComp }) => {
                const isActive = pPath === path;
                return (
                  <div
                    key={`${pPath}-${tenantId ?? "platform"}`}
                    style={{ display: isActive ? "contents" : "none" }}
                    aria-hidden={!isActive}
                  >
                    <ErrorBoundary resetKey={`${pPath}-${tenantId ?? "platform"}`}>
                      <Suspense fallback={<Loading />}>
                        <PageComp />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                );
              });
            })()
          )}
        </main>
      </div>
    </div>
  );
}
