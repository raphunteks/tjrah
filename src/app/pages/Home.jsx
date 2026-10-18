import { useAuth } from "../../auth/AuthProvider.jsx";
import { Link } from "../../lib/router.jsx";
import { ROLE_LABEL } from "../../lib/rbac-matrix.js";
import { readableFeatures } from "../../lib/rbac.js";
import { pagesFor } from "../pages.js";
import { PageHead, Panel } from "../ui/index.jsx";
import { FLOWS, stepsFor } from "./flows-data.js";

export default function Home() {
  const { profile, role, pillar } = useAuth();
  const pages = pagesFor(role, pillar).filter((p) => p.path !== "/app" && p.path !== "/app/alur");
  const features = readableFeatures(role);
  const mine = FLOWS.filter((f) => !pillar || f.pillar === pillar).map((f) => ({ f, steps: stepsFor(f, role) })).filter((x) => x.steps.length);
  return (
    <>
      <PageHead
        eyebrow={ROLE_LABEL[role]}
        title={`Halo, ${profile.full_name}${profile.full_name.endsWith(".") ? "" : "."}`}
        desc={`Peran Anda memberi akses ke ${features.length} dari 20 fitur di matriks RBAC.`}
      />
      <div className="d-grid d-grid--2">
        <Panel title="Mulai dari sini">
          <ul className="d-links">
            {pages.map((p) => (
              <li key={p.path}>
                <Link to={p.path}>
                  <span>{p.label}</span>
                  <span className="d-nav__code">{p.code}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Tugas Anda di alur kerja" actions={<Link to="/app/alur" className="d-link">Lihat semua alur</Link>}>
          {mine.length === 0 ? (
            <p className="d-text d-muted">Peran Anda tidak menjalankan langkah operasional di empat alur Bab V; Anda memantau hasilnya.</p>
          ) : (
            <ul className="d-list">
              {mine.map(({ f, steps }) => (
                <li key={f.id}>
                  <div>
                    <p className="d-list__title">{f.title}</p>
                    <p className="d-list__meta">{steps.map((s) => s.title).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
