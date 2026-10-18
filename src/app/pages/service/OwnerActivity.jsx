import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiahShort, number, dateTime } from "../../../lib/format.js";
import { healthOf, auditText, HEALTH_LEVEL } from "../../../lib/watch.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Badge, Empty, useAsync } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";
import { ServiceTabs, HealthPill, ago } from "./shared.jsx";

const SECURITY = [
  ["pin_reset", "PIN GM diatur ulang"], ["invite_revoke", "Undangan dicabut"], ["deactivate", "Akun dinonaktifkan"], ["suspend", "Tenant ditangguhkan"],
];
const kindOf = (x) => {
  const after = x.detail?.after ?? x.detail ?? {};
  if (x.action === "pin_reset") return "pin_reset";
  if (x.action === "invite_revoke") return "invite_revoke";
  if (x.entity === "profiles" && x.action === "update" && after.is_active === false) return "deactivate";
  if (x.entity === "tenants" && after.status === "suspended") return "suspend";
  return null;
};

/** Superadmin · Monitoring Aktivitas Owner: kesehatan tenant, risiko churn, feed aktivitas, sinyal keamanan. */
export default function OwnerActivity() {
  const { api } = useAuth();
  const r = useAsync(async () => {
    const [health, audit] = await Promise.all([api.rpc("tenant_health"), api.listAudit({ limit: 300 })]);
    return { health, audit };
  }, [api]);
  useLive(["tenants", "profiles", "support_tickets"], r.reload);
  const [fTenant, setFTenant] = useState("");
  const [fKind, setFKind] = useState("");

  const rows = useMemo(() => (r.data?.health ?? []).map((t) => ({ t, h: healthOf(t) }))
    .sort((a, b) => (a.h.score ?? 101) - (b.h.score ?? 101)), [r.data]);
  const byLevel = (l) => rows.filter((x) => x.h.level === l).length;
  const gmv = rows.reduce((a, x) => a + (x.t.gmv_28d ?? 0), 0);
  const churn = rows.filter((x) => x.h.risks.length && x.t.status !== "suspended");
  const names = Object.fromEntries(rows.map((x) => [x.t.tenant_id, x.t.name]));

  const feed = useMemo(() => (r.data?.audit ?? []).filter((x) =>
    (!fTenant || x.tenant_id === fTenant)
    && (fKind === "" ? ["owner", "superadmin"].includes(x.actor_role) || x.action === "access"
      : fKind === "login" ? x.action === "login" && x.actor_role === "owner" : kindOf(x) === fKind)).slice(0, 40), [r.data, fTenant, fKind]);
  const week = Date.now() - 7 * 86400e3;
  const signals = SECURITY.map(([k, label]) => [label, (r.data?.audit ?? []).filter((x) => kindOf(x) === k && new Date(x.created_at).getTime() >= week).length]);

  return (
    <>
      <PageHead eyebrow="Superadmin · Layanan & Akses" title="Monitoring Aktivitas Owner"
        desc="Pantau kesehatan setiap merchant dari login Owner, transaksi, tagihan, dan tiket. Hanya angka agregat — baris transaksi tenant tidak dibuka." />
      <ServiceTabs />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <div className="d-stats">
            <Stat label="Sehat" value={byLevel("sehat")} sub="skor ≥ 75" />
            <Stat label="Waspada" value={byLevel("waspada")} sub="skor 50–74" />
            <Stat label="Berisiko" value={byLevel("berisiko")} sub="skor < 50" />
            <Stat label="GMV 28 hari (agregat)" value={rupiahShort(gmv)} sub={`${rows.length} merchant`} />
          </div>
          <div className="d-grid d-grid--wide">
            <Panel title="Kesehatan per tenant" meta="Urut dari skor terendah. Bobot skor adalah titik awal (belum dikalibrasi).">
              <div className="d-table-wrap"><table className="d-table">
                <thead><tr><th scope="col">Tenant</th><th scope="col">Skor</th><th scope="col">Owner masuk</th><th scope="col" className="d-num">Transaksi 7h / 28h</th><th scope="col" className="d-num">Tiket</th><th scope="col">Alasan</th></tr></thead>
                <tbody>{rows.map(({ t, h }) => (
                  <tr key={t.tenant_id}>
                    <td>{t.name}<p className="d-list__meta">{t.plan_name ?? "tanpa paket"}</p></td>
                    <td><HealthPill health={h} /></td>
                    <td>{t.owner_id ? ago(t.owner_last_login) : "—"}</td>
                    <td className="d-num">{number(t.orders_7d)} / {number(t.orders_28d)}</td>
                    <td className="d-num">{t.open_tickets}</td>
                    <td className="svc-reason-cell">{h.reasons.length ? h.reasons.join(" · ") : <span className="d-muted">Tidak ada catatan</span>}</td>
                  </tr>))}</tbody>
              </table></div>
            </Panel>
            <div className="d-grid">
              <Panel title="Risiko churn" meta="Owner diam 14+ hari, tanpa transaksi 7 hari, atau tagihan lewat jatuh tempo">
                {churn.length === 0 ? <Empty title="Tidak ada tenant berisiko churn" /> : (
                  <ul className="d-list">{churn.map(({ t, h }) => (
                    <li key={t.tenant_id}><div><p className="d-list__title">{t.name}</p><p className="d-list__meta">{h.risks.join(" · ")}</p></div><Badge tone={HEALTH_LEVEL[h.level].tone}>{h.score}</Badge></li>))}</ul>
                )}
              </Panel>
              <Panel title="Sinyal keamanan · 7 hari" meta="Dari log audit">
                <ul className="d-list">{signals.map(([label, n]) => <li key={label}><span>{label}</span><Badge tone={n ? "warn" : "neutral"}>{n}</Badge></li>)}</ul>
                <p className="d-text d-muted svc-foot">Login gagal, perangkat baru, dan lonjakan void belum terpantau: Supabase Auth tidak menulis ke tabel aplikasi, dan Superadmin tidak punya hak baca transaksi.</p>
              </Panel>
            </div>
          </div>
          <Panel title="Feed aktivitas" meta="Tindakan Owner dan Superadmin pada tenant" actions={
            <div className="d-filters">
              <select className="d-date" aria-label="Tenant" value={fTenant} onChange={(e) => setFTenant(e.target.value)}>
                <option value="">Semua tenant</option>{rows.map(({ t }) => <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>)}
              </select>
              <select className="d-date" aria-label="Jenis" value={fKind} onChange={(e) => setFKind(e.target.value)}>
                <option value="">Semua tindakan</option><option value="login">Login Owner</option>
                {SECURITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>}>
            {feed.length === 0 ? <Empty title="Belum ada aktivitas yang cocok" /> : (
              <ul className="d-feed">{feed.map((x) => (
                <li key={x.id} className="d-feed__item">
                  <p className="d-feed__meta"><strong>{names[x.tenant_id] ?? "Platform"}</strong> · {x.actor_role ?? "sistem"} · {dateTime(x.created_at)}</p>
                  <p className="d-feed__msg">{auditText(x)}</p>
                </li>))}</ul>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
