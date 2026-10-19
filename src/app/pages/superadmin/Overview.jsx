import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { rupiah, date, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, useAsync, Empty } from "../../ui/index.jsx";

export const STATUS_TONE = { active: "ok", trial: "accent", past_due: "warn", suspended: "danger" };
export const STATUS_LABEL = { active: "Aktif", trial: "Trial", past_due: "Tunggakan", suspended: "Ditangguhkan" };

export default function Overview() {
  const { api } = useAuth();
  const ov = useAsync(() => api.platformOverview(), [api]);
  const tenants = useAsync(() => api.listTenants(), [api]);
  const audit = useAsync(() => api.listAudit({ limit: 8 }), [api]);

  if (ov.loading) return <Loading />;
  if (ov.error) return <ErrorNote error={ov.error} onRetry={ov.reload} />;
  const o = ov.data;
  const attention = (tenants.data ?? []).filter((t) => t.status === "past_due" || t.status === "suspended" || t.status === "trial");

  return (
    <>
      <PageHead eyebrow="Superadmin · Fitur 1" title="Ringkasan platform" desc="Kesehatan langganan seluruh tenant Tijarah." />
      <div className="d-stats">
        <Stat label="Tenant" value={o.tenants} sub={`${o.active} aktif · ${o.trial} trial`} />
        <Stat label="MRR (tenant aktif)" value={rupiah(o.mrr)} sub="Dari harga paket" />
        <Stat label="Tagihan belum dibayar" value={rupiah(o.unpaid)} />
        <Stat label="Perlu tindakan" value={o.past_due + o.suspended} sub={`${o.past_due} tunggakan · ${o.suspended} ditangguhkan`} />
      </div>
      <div className="d-grid d-grid--2">
        <Panel title="Perlu perhatian" actions={<Link className="d-link" to="/app/tenant">Kelola tenant</Link>}>
          {attention.length === 0 ? (
            <Empty title="Semua tenant aktif" />
          ) : (
            <ul className="d-list">
              {attention.map((t) => (
                <li key={t.id}>
                  <div>
                    <p className="d-list__title">{t.name}</p>
                    <p className="d-list__meta">{t.plan?.name ?? "Tanpa paket"} · periode s.d. {t.current_period_end ? date(t.current_period_end) : "—"}</p>
                  </div>
                  <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Aktivitas terbaru" actions={<Link className="d-link" to="/app/audit">Audit log</Link>}>
          {audit.loading ? <Loading /> : (audit.data ?? []).length === 0 ? (
            <Empty title="Belum ada aktivitas">Perubahan data akan tercatat otomatis.</Empty>
          ) : (
            <ul className="d-list">
              {audit.data.map((a) => (
                <li key={a.id}>
                  <div>
                    <p className="d-list__title"><span className="d-mono">{a.action}</span> · {a.entity}</p>
                    <p className="d-list__meta">{a.actor_role ?? "sistem"} · {dateTime(a.created_at)}</p>
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
