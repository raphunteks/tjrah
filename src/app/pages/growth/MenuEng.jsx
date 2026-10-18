import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useBranch, BranchSelect } from "../../ops.jsx";

const CL = { star: ["Bintang", "ok"], plowhorse: ["Kuda beban", "warn"], puzzle: ["Teka-teki", "neutral"], dog: ["Anjing", "danger"], belum_laku: ["Belum laku", "neutral"] };
const LABEL = { star: "Laris & margin tinggi", plowhorse: "Laris, margin tipis", puzzle: "Margin tinggi, jarang dipesan", dog: "Kurang laris & margin rendah", belum_laku: "Belum terjual" };

export default function MenuEng() {
  const { api, role, tenantId } = useAuth();
  const b = useBranch();
  const [days, setDays] = useState(30);
  const [cls, setCls] = useState("all");
  const a = useAction();
  const q = useAsync(() => api.rpc("menu_engineering", { p_branch: b.branchId, p_days: days }), [api, days, b.branchId, tenantId]);
  const rows = (q.data ?? []).filter((r) => cls === "all" || r.class === cls);
  const count = (c) => (q.data ?? []).filter((r) => r.class === c).length;
  return (
    <>
      <PageHead eyebrow="Fitur 2 · Menu engineering" title="Menu engineering"
        desc="Klasifikasi Kasavana–Smith: popularitas (≥70% dari rata-rata) × margin kontribusi vs rata-rata tertimbang. Biaya dari resep (BOM) terkini."
        actions={<>
          <BranchSelect b={b} />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Rentang hari"><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select>
          {can(role, 2, "r") && <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => a.run(async () => api.rpc("check_margin_alerts"), (n) => `${n} peringatan margin dikirim ke Owner lewat Hermes`)}>Cek margin menipis</button>}
        </>} />
      <Feedback a={a} />
      <div className="d-chips" role="group" aria-label="Filter kelas">
        <button type="button" className={`d-chip${cls === "all" ? " is-on" : ""}`} aria-pressed={cls === "all"} onClick={() => setCls("all")}>Semua</button>
        {Object.entries(CL).map(([c, [l]]) => <button key={c} type="button" className={`d-chip${cls === c ? " is-on" : ""}`} aria-pressed={cls === c} onClick={() => setCls(c)}>{l} · {count(c)}</button>)}
      </div>
      <Panel>
        {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : rows.length === 0 ? <Empty title="Tidak ada menu">Ubah filter atau tambah menu.</Empty> : (
          <div className="d-table-wrap"><table className="d-table d-table--fin">
            <thead><tr><th scope="col">Menu</th><th scope="col">Kelas</th><th scope="col" className="d-num">Terjual</th><th scope="col" className="d-num">Harga</th><th scope="col" className="d-num">HPP</th><th scope="col" className="d-num">HPP %</th><th scope="col" className="d-num">Margin</th><th scope="col" className="d-num">Kontribusi</th><th scope="col">Saran</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.product_id}><td>{r.name}<div className="d-muted">{r.category}</div></td><td><Badge tone={CL[r.class][1]}>{CL[r.class][0]}</Badge><div className="d-muted">{LABEL[r.class]}</div></td>
                <td className="d-num">{r.qty}</td><td className="d-num">{rupiah(r.price)}</td><td className="d-num">{rupiah(r.unit_cost)}</td><td className="d-num">{r.cost_pct == null ? "—" : `${r.cost_pct}%`}</td>
                <td className="d-num">{rupiah(r.margin)}</td><td className="d-num">{rupiah(r.contribution)}</td><td>{r.advice}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
