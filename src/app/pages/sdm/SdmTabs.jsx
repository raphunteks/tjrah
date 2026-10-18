import { Link, useRouter } from "../../../lib/router.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";

const TABS = [
  { path: "/app/sdm", label: "Dashboard SDM", icon: "fa-chart-pie", roles: ["owner", "gm", "superadmin"] },
  { path: "/app/karyawan", label: "Kelola Kasir", icon: "fa-users", roles: ["owner", "gm", "superadmin"] },
  { path: "/app/tukar-shift", label: "Jadwal & Tukar Shift", icon: "fa-calendar-days", roles: ["owner", "gm", "superadmin", "staff"] },
  { path: "/app/absen", label: "Absensi", icon: "fa-fingerprint", roles: ["owner", "gm", "superadmin", "staff"] },
  { path: "/app/sdm/cuti", label: "Cuti & Izin", icon: "fa-plane-departure", roles: ["owner", "gm", "superadmin", "staff"] },
  { path: "/app/penggajian", label: "Penggajian", icon: "fa-wallet", roles: ["owner", "gm", "superadmin"] },
  { path: "/app/sdm/pengetahuan", label: "Pengetahuan & Form", icon: "fa-book-bookmark", roles: ["owner", "gm", "superadmin", "staff"] },
  { path: "/app/persetujuan", label: "Persetujuan", icon: "fa-scale-balanced", roles: ["owner", "gm", "superadmin"] },
  { path: "/app/sdm/laporan", label: "Laporan SDM", icon: "fa-file-invoice", roles: ["owner", "gm", "superadmin"] }
];


export default function SdmTabs() {
  const { path } = useRouter();
  const { role } = useAuth();

  const allowedTabs = TABS.filter((t) => t.roles.includes(role));

  return (
    <nav className="sdm-tabs-nav" aria-label="Navigasi Modul SDM">
      {allowedTabs.map((t) => {
        const isActive = path === t.path;
        return (
          <Link
            key={t.path}
            to={t.path}
            className={`sdm-tab-item ${isActive ? "sdm-tab-item--active" : ""}`}
          >
            <i className={`fa-solid ${t.icon}`} aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

