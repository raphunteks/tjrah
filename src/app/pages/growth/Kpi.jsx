import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const KINDS = [["daily_sales", "Penjualan harian"], ["weekly_kpi", "KPI mingguan"], ["margin_watch", "Pantau margin"]];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ST = { on_track: ["Sesuai target", "ok"], di_bawah_target: ["Di bawah target", "warn"], tanpa_target: ["Tanpa target", "neutral"] };

export default function Kpi() {
  const { api, role, tenantId } = useAuth();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const a = useAction(), s = useAction();
  const canSet = can(role, 2, "c");
  const k = useAsync(() => api.rpc("branch_kpi", { p_month: `${month}-01` }), [api, month, tenantId]);
  const sch = useAsync(() => api.list("report_schedules", { eq: { tenant_id: tenantId } }), [api, tenantId]);
  useLive(["branch_targets", "report_schedules", "orders"], () => { k.reload(); sch.reload(); });
  const [tg, setTg] = useState({});
  const saveTarget = (r) => a.run(async () => {
    const t = tg[r.branch_id] ?? {};
    await api.rpc("set_branch_target", { p_branch: r.branch_id, p_month: `${month}-01`, p_revenue: Number(t.rev ?? r.revenue_target ?? 0), p_max_cogs_pct: Number(t.cogs ?? 35), p_max_void_pct: Number(t.void ?? 2) });
    k.reload();
  }, "Target disimpan");
  const sched = (kind) => sch.data?.find((x) => x.kind === kind);
  const saveSched = (kind, patch) => s.run(async () => {
    const cur = sched(kind) ?? { freq: "daily", hour: 21, weekday: null, channel: "whatsapp", active: true };
    const n = { ...cur, ...patch };
    await api.rpc("save_report_schedule", { p_kind: kind, p_freq: n.freq, p_hour: Number(n.hour), p_weekday: n.freq === "weekly" ? Number(n.weekday ?? 1) : null, p_channel: n.channel, p_active: n.active });
    sch.reload();
  }, "Jadwal disimpan");
  const total = (k.data ?? []).reduce((x, r) => ({ rev: x.rev + r.revenue, tgt: x.tgt + (r.revenue_target ?? 0), proj: x.proj + r.projected_revenue }), { rev: 0, tgt: 0, proj: 0 });
  return (
    <>
      <PageHead eyebrow="Fitur 2 · KPI cabang" title="KPI, target & laporan terjadwal" desc="Omzet vs target per cabang, proyeksi akhir bulan, dan batas HPP/void. Laporan terjadwal dikirim lewat Hermes."
        actions={<input type="month" className="d-date" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Bulan" />} />
      {k.loading && !k.data ? <Loading /> : k.error ? <ErrorNote error={k.error} onRetry={k.reload} /> : (
        <>
          <div className="d-stats d-stats--3">
            <Stat label="Omzet bulan ini" value={rupiah(total.rev)} sub={total.tgt ? `Target ${rupiah(total.tgt)}` : "Belum ada target"} />
            <Stat label="Proyeksi akhir bulan" value={rupiah(total.proj)} sub="Tren harian berjalan" />
            <Stat label="Capaian" value={total.tgt ? `${Math.round((total.rev / total.tgt) * 1000) / 10}%` : "—"} sub="Omzet ÷ target" />
          </div>
          <Panel title="Per cabang">
            {k.data.length === 0 ? <Empty title="Tidak ada cabang" /> : (
              <div className="d-table-wrap"><table className="d-table d-table--fin">
                <thead><tr><th scope="col">Cabang</th><th scope="col" className="d-num">Omzet</th><th scope="col" className="d-num">Struk</th><th scope="col" className="d-num">Rata-rata</th><th scope="col" className="d-num">HPP</th><th scope="col" className="d-num">Void</th><th scope="col" className="d-num">Capaian</th><th scope="col">Status</th>{canSet && <th scope="col">Target (Rp · HPP% · void%)</th>}</tr></thead>
                <tbody>{k.data.map((r) => (
                  <tr key={r.branch_id}><td>{r.branch}</td><td className="d-num">{rupiah(r.revenue)}</td><td className="d-num">{r.orders}</td><td className="d-num">{rupiah(r.avg_ticket)}</td>
                    <td className="d-num">{r.cogs_pct}%</td><td className="d-num">{r.void_pct}%</td><td className="d-num">{r.attainment_pct == null ? "—" : `${r.attainment_pct}%`}</td>
                    <td><Badge tone={ST[r.status][1]}>{ST[r.status][0]}</Badge>{r.flags.map((f) => <div key={f}><Badge tone="warn">{f}</Badge></div>)}</td>
                    {canSet && <td><div className="d-row-actions">
                      <input className="d-cell-input" inputMode="numeric" aria-label={`Target omzet ${r.branch}`} defaultValue={r.revenue_target ?? ""} placeholder="Rp" onChange={(e) => setTg({ ...tg, [r.branch_id]: { ...tg[r.branch_id], rev: e.target.value } })} />
                      <input className="d-cell-input" inputMode="decimal" aria-label={`Batas HPP ${r.branch}`} defaultValue="35" onChange={(e) => setTg({ ...tg, [r.branch_id]: { ...tg[r.branch_id], cogs: e.target.value } })} />
                      <input className="d-cell-input" inputMode="decimal" aria-label={`Batas void ${r.branch}`} defaultValue="2" onChange={(e) => setTg({ ...tg, [r.branch_id]: { ...tg[r.branch_id], void: e.target.value } })} />
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => saveTarget(r)}>Simpan</button></div></td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <Feedback a={a} />
          </Panel>
        </>
      )}
      <Panel title="Laporan terjadwal" meta="Hermes · WhatsApp/Discord">
        {sch.loading && !sch.data ? <Loading /> : sch.error ? <ErrorNote error={sch.error} onRetry={sch.reload} /> : (
          <ul className="d-list">{KINDS.map(([kind, label]) => {
            const r = sched(kind);
            return (
              <li key={kind}><div className="d-list__title">{label}</div>
                <div className="d-row-actions">
                  <select aria-label={`Frekuensi ${label}`} disabled={!canSet} value={r?.freq ?? "daily"} onChange={(e) => saveSched(kind, { freq: e.target.value })}><option value="daily">Harian</option><option value="weekly">Mingguan</option></select>
                  {(r?.freq ?? "daily") === "weekly" && <select aria-label={`Hari ${label}`} disabled={!canSet} value={r?.weekday ?? 1} onChange={(e) => saveSched(kind, { weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
                  <select aria-label={`Jam ${label}`} disabled={!canSet} value={r?.hour ?? 21} onChange={(e) => saveSched(kind, { hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
                  <select aria-label={`Kanal ${label}`} disabled={!canSet} value={r?.channel ?? "whatsapp"} onChange={(e) => saveSched(kind, { channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="discord">Discord</option></select>
                  <label className="d-check"><input type="checkbox" disabled={!canSet} checked={Boolean(r?.active)} onChange={(e) => saveSched(kind, { active: e.target.checked })} /> Aktif</label>
                </div>
              </li>
            );
          })}</ul>
        )}
        <Feedback a={s} />
      </Panel>
    </>
  );
}
