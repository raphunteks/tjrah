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
    <div className="account-bento-dock" aria-label="Pusat Navigasi Akun">
      {/* HEADER DOCK TATA KELOLA AKUN */}
      <div className="account-bento-dock-header">
        <span className="account-bento-dock-title">
          Pusat Navigasi Akun &amp; Tata Kelola Sistem (RBAC)
        </span>
      </div>

      {/* ──────── 8 KARTU UNIFIED BENTO KPI GRID (ANTI AI-SLOP) ──────── */}
      <div
        className="account-bento-grid"
        aria-label="Navigasi Bento Modul Akun"
      >
        {allowedCards.map((c) => {
          const isActive = path === c.path;
          return (
            <Link
              key={c.path}
              to={c.path}
              className={`account-bento-cell${isActive ? " is-active" : ""}`}
            >
              <div className="account-bento-cell-head">
                <span className="account-bento-cell-kicker">{c.badge}</span>
                <div className="account-bento-cell-icon" style={{ background: c.bg, color: c.color }}>
                  <i className={`fa-solid ${c.icon}`} aria-hidden="true" />
                </div>
              </div>

              <h3 className="account-bento-cell-title">{c.title}</h3>
              <p className="account-bento-cell-desc">{c.desc}</p>

              <div className="account-bento-cell-status">
                {isActive ? (
                  <>
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                    <span>{t.currentTab || "Sedang Aktif"}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--color-muted)", fontWeight: 500 }}>
                    {t.openTab || "Buka Modul"}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
