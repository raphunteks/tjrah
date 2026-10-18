import { Link, useRouter } from "../../../lib/router.jsx";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { SERVICE_TABS } from "./tabs.js";
import { Badge } from "../../ui/index.jsx";
import { HEALTH_LEVEL } from "../../../lib/watch.js";

/** Bilah sub-tab di atas setiap halaman Layanan & Akses (deep-link: tiap sub-tab punya URL sendiri). */
export function ServiceTabs() {
  const { role } = useAuth();
  const { path } = useRouter();
  const tabs = SERVICE_TABS[role] ?? [];
  return (
    <nav className="svc-tabs" aria-label="Layanan & Akses">
      <p className="svc-tabs__label">Layanan &amp; Akses</p>
      <ul>
        {tabs.map((t) => (
          <li key={t.path}>
            <Link to={t.path} className={t.path === path ? "is-active" : undefined} aria-current={t.path === path ? "page" : undefined}>{t.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "5 mnt lalu", "3 jam lalu", "2 hari lalu". */
export function ago(iso, now = Date.now()) {
  if (!iso) return "belum pernah";
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export function HealthPill({ health }) {
  const l = HEALTH_LEVEL[health.level];
  return <Badge tone={l.tone}>{health.score == null ? l.label : `${health.score} · ${l.label}`}</Badge>;
}

/** Cabang yang melekat pada seseorang: GM/Owner tanpa penugasan = null (semua cabang). */
export function branchesOfPerson(p, memberBranches) {
  const ids = memberBranches.filter((m) => m.profile_id === p.id).map((m) => m.branch_id);
  if (p.role === "gm" || p.role === "owner") return ids.length ? ids : null;
  return [...new Set([p.branch_id, ...ids].filter(Boolean))];
}
