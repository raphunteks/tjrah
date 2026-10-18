import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync, Empty, Badge } from "../../ui/index.jsx";

export default function Audit() {
  const { api, role, viewTenant } = useAuth();
  const scoped = role === "superadmin" ? viewTenant : null;
  const r = useAsync(() => api.listAudit({ tenantId: scoped }), [api, scoped]);
  const [entity, setEntity] = useState("");
  const entities = useMemo(() => [...new Set((r.data ?? []).map((a) => a.entity))].sort(), [r.data]);
  const rows = (r.data ?? []).filter((a) => !entity || a.entity === entity);

  return (
    <>
      <PageHead
        eyebrow="Fitur 1"
        title="Audit log"
        desc={role === "superadmin" ? (scoped ? "Disaring ke tenant yang dipilih." : "Seluruh platform, 200 entri terbaru.") : "Aktivitas tenant Anda, 200 entri terbaru."}
        actions={
          <label className="d-switch">
            <span className="d-switch__label">Entitas</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Semua</option>
              {entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        }
      />
      <Panel>
        {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : rows.length === 0 ? (
          <Empty title="Belum ada entri">Setiap perubahan tenant, paket, persetujuan, dan akses Superadmin tercatat di sini.</Empty>
        ) : (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Aksi</th><th scope="col">Entitas</th><th scope="col">ID</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="d-nowrap">{dateTime(a.created_at)}</td>
                    <td>{a.actor_role ?? "sistem"}</td>
                    <td><Badge tone={a.action === "delete" ? "danger" : a.action === "access" ? "warn" : "neutral"}>{a.action}</Badge></td>
                    <td className="d-mono">{a.entity}</td>
                    <td className="d-mono d-muted d-trunc">{a.entity_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
