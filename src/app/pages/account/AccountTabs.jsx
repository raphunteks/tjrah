import { Link, useRouter } from "../../../lib/router.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useAccountLang } from "./i18n.js";

export default function AccountTabs() {
  const { path } = useRouter();
  const { role } = useAuth();
  const { t } = useAccountLang();

  // Konfigurasi 8 Kartu Navigasi Bento sesuai RBAC & Gambar 2
  const CARDS = [
    {
      path: "/app/akun/profil",
      title: t.navProfileTitle,
      desc: t.navProfileDesc,
      badge: t.navProfileBadge,
      icon: "fa-user-gear",
      color: "#059669",
      bg: "rgba(16, 185, 129, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    },
    {
      path: "/app/akun/keamanan",
      title: t.navSecurityTitle,
      desc: t.navSecurityDesc,
      badge: t.navSecurityBadge,
      icon: "fa-shield-halved",
      color: "#0284c7",
      bg: "rgba(56, 189, 248, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    },
    {
      path: "/app/akun/tampilan",
      title: t.navAppearanceTitle,
      desc: t.navAppearanceDesc,
      badge: t.navAppearanceBadge,
      icon: "fa-palette",
      color: "#d97706",
      bg: "rgba(245, 158, 11, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    },
    {
      path: "/app/akun/notifikasi",
      title: t.navNotificationsTitle,
      desc: t.navNotificationsDesc,
      badge: t.navNotificationsBadge,
      icon: "fa-bell",
      color: "#e11d48",
      bg: "rgba(244, 63, 94, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    },
    {
      path: "/app/akun/akses",
      title: t.navAccessTitle,
      desc: t.navAccessDesc,
      badge: t.navAccessBadge,
      icon: "fa-key",
      color: "#7c3aed",
      bg: "rgba(139, 92, 246, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    },
    {
      path: "/app/langganan",
      title: t.navSubscriptionTitle,
      desc: t.navSubscriptionDesc,
      badge: t.navSubscriptionBadge,
      icon: "fa-bolt",
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.12)",
      roles: ["owner", "superadmin"] // Khusus Owner & Superadmin
    },
    {
      path: "/app/akun/referral",
      title: t.navReferralTitle,
      desc: t.navReferralDesc,
      badge: t.navReferralBadge,
      icon: "fa-bullhorn",
      color: "#0d9488",
      bg: "rgba(20, 184, 166, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff"] // Semua kecuali dokter
    },
    {
      path: "/app/akun/wallet",
      title: t.navWalletTitle,
      desc: t.navWalletDesc,
      badge: t.navWalletBadge,
      icon: "fa-wallet",
      color: "#0d9488",
      bg: "rgba(20, 184, 166, 0.12)",
      roles: ["owner", "gm", "superadmin", "staff", "dokter"]
    }
  ];

  const allowedCards = CARDS.filter((c) => c.roles.includes(role));

  return (
    <div className="sdm-bento-dock-wrap" aria-label="Pusat Navigasi Akun">
      {/* HEADER DOCK TATA KELOLA AKUN */}
      <div className="sdm-bento-dock-header">
        <span className="sdm-bento-dock-title">
          Pusat Navigasi Akun &amp; Tata Kelola Sistem (RBAC)
        </span>
      </div>

      {/* ──────── 8 KARTU BENTO NAVIGASI RINGKAS DOCK BAWAH PERSIS GBR 2 ──────── */}
      <div
        className="sdm-bento-nav-grid--compact"
        aria-label="Navigasi Bento Modul Akun"
      >
        {allowedCards.map((c) => {
          const isActive = path === c.path;
          return (
            <Link
              key={c.path}
              to={c.path}
              className={`sdm-bento-nav-card sdm-bento-nav-card--compact${isActive ? " is-active" : ""}`}
              style={{
                border: isActive ? "2px solid var(--color-accent)" : "1px solid var(--color-rule)",
                background: isActive ? "var(--color-paper-2)" : "var(--color-paper)",
                boxShadow: isActive ? "0 4px 12px rgba(11, 93, 75, 0.12)" : undefined
              }}
            >
              <div className="sdm-bento-nav-top">
                <div className="sdm-bento-nav-icon" style={{ background: c.bg, color: c.color }}>
                  <i className={`fa-solid ${c.icon}`} />
                </div>
                <i
                  className="fa-solid fa-arrow-up-right-from-square sdm-bento-nav-arrow"
                  style={{ color: isActive ? "var(--color-accent)" : undefined }}
                />
              </div>

              <h3 className="sdm-bento-nav-title">{c.title}</h3>
              <p className="sdm-bento-nav-desc">{c.desc}</p>

              <div className="sdm-bento-nav-footer">
                <span className="sdm-bento-nav-badge" style={{ background: c.bg, color: c.color }}>
                  <i className={`fa-solid ${c.icon}`} /> {c.badge}
                </span>
                <span style={{ fontWeight: isActive ? 700 : 500, color: isActive ? "var(--color-accent)" : undefined }}>
                  {isActive ? (
                    <>{t.currentTab} <i className="fa-solid fa-check" aria-hidden="true" /></>
                  ) : (
                    <>{t.openTab} <i className="fa-solid fa-arrow-right" aria-hidden="true" /></>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
