import { useAuth } from "../../../auth/AuthProvider.jsx";
import { MATRIX, ROLE_LABEL, ROLE_LEVEL } from "../../../lib/rbac-matrix.js";
import { permOf } from "../../../lib/rbac.js";
import { PageHead, Panel, Badge } from "../../ui/index.jsx";
import AccountTabs from "./AccountTabs.jsx";
import { AccountKpiGrid, AccountKpiCard } from "./AccountKpiGrid.jsx";
import { useAccountLang } from "./i18n.js";

const ACTIONS = [
  ["c", "Buat (Create)"],
  ["r", "Baca (Read)"],
  ["u", "Ubah (Update)"],
  ["d", "Hapus (Delete)"],
  ["a", "Setujui (Approval)"],
  ["q", "Ajukan (Request)"]
];

export default function Access() {
  const { role } = useAuth();
  const { t } = useAccountLang();

  const accessibleCount = MATRIX.filter(([no]) => {
    const p = permOf(role, no);
    return ACTIONS.some(([k]) => p[k]);
  }).length;

  return (
    <>
      <PageHead
        eyebrow={t.eyebrow}
        title={t.accessTitle}
        desc={`${t.accessDesc} (Peran: ${ROLE_LABEL[role]} - ${ROLE_LEVEL[role]})`}
      />

      {/* ──────── BENTO KPI SUMMARY HAK AKSES ──────── */}
      <AccountKpiGrid>
        <AccountKpiCard
          label="Peran Akun Aktif"
          value={ROLE_LABEL[role] || role}
          sub={`Tingkat Hierarki ${ROLE_LEVEL[role] || "L3"}`}
          tone="emerald"
          icon="fa-id-badge"
        />
        <AccountKpiCard
          label="Cakupan Fitur Modul"
          value={`${accessibleCount} dari 20 Fitur`}
          sub="Otorisasi RBAC Terverifikasi"
          tone="sky"
          icon="fa-shield-halved"
        />
        <AccountKpiCard
          label="Keamanan Basis Data"
          value="PostgreSQL RLS"
          sub="Isolasi Tenant & Sesi JWT"
          tone="purple"
          icon="fa-database"
        />
        <AccountKpiCard
          label="Validitas Token Akses"
          value="Sesi Aktif RS256"
          sub="Terotentikasi Kredensial"
          tone="amber"
          icon="fa-lock"
        />
      </AccountKpiGrid>

      <div className="d-grid" style={{ gap: "1.25rem" }}>
        {/* TABEL MATRIKS 20 FITUR */}
        <Panel title={t.accessMatrixTitle}>
          <p className="d-text d-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Tabel di bawah menyajikan hak aksi resmi yang diberikan platform kepada akun Anda. Fitur yang tidak memiliki hak aksi ditandai nonaktif.
          </p>

          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "60px" }}>No</th>
                  <th scope="col">Nama Modul Fitur</th>
                  <th scope="col">Label Dokumen</th>
                  <th scope="col">Hak Aksi Resmi yang Diizinkan</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map(([no, name]) => {
                  const p = permOf(role, no);
                  const acts = ACTIONS.filter(([k]) => p[k]);
                  return (
                    <tr key={no} className={acts.length ? undefined : "is-off"}>
                      <td className="d-mono">{String(no).padStart(2, "0")}</td>
                      <td>
                        <strong>{name}</strong>
                      </td>
                      <td className="d-mono">{p.label}</td>
                      <td>
                        {acts.length ? (
                          <span className="d-chips">
                            {acts.map(([k, l]) => (
                              <Badge key={k} tone={k === "a" ? "accent" : "neutral"}>
                                {l}
                              </Badge>
                            ))}
                            {p.scope && (
                              <Badge tone="warn">
                                Batasan: {p.scope.replace("_", " ")}
                              </Badge>
                            )}
                          </span>
                        ) : (
                          <span className="d-muted" style={{ fontSize: "0.8rem" }}>Tidak memiliki hak akses</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* ──────── PUSAT NAVIGASI AKUN & TATA KELOLA SISTEM (DOCK BAWAH) ──────── */}
      <AccountTabs />
    </>
  );
}
