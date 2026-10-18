import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { permOf } from "../../../lib/rbac.js";
import { rupiah, pct, iso, addDays } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync, Empty } from "../../ui/index.jsx";

const PERIODS = [
  { k: "mtd", label: "Bulan ini", from: () => { const d = new Date(); d.setDate(1); return iso(d); } },
  { k: "30", label: "30 hari", from: () => iso(addDays(new Date(), -29)) },
  { k: "60", label: "60 hari", from: () => iso(addDays(new Date(), -59)) },
];

export default function ProfitLoss() {
  const { api, role, tenantId } = useAuth();
  const [k, setK] = useState("mtd");
  const from = PERIODS.find((p) => p.k === k).from();
  const to = iso(new Date());
  const r = useAsync(() => api.profitLoss({ from, to, tenantId }), [api, tenantId, from]);
  const label = permOf(role, 11)?.label;

  const by = (t) => (r.data ?? []).filter((x) => x.type === t);
  const total = (t) => by(t).reduce((a, x) => a + Number(x.amount), 0);
  const rev = total("revenue"), cogs = total("cogs"), exp = total("expense");
  const gross = rev - cogs, net = gross - exp;

  const Row = ({ code, name, amount, strong, indent }) => (
    <tr className={strong ? "is-total" : undefined}>
      <td className="d-mono d-muted">{code}</td>
      <td className={indent ? "d-indent" : undefined}>{name}</td>
      <td className="d-num">{rupiah(amount)}</td>
      <td className="d-num d-muted">{rev ? pct(amount / rev) : "—"}</td>
    </tr>
  );

  return (
    <>
      <PageHead
        eyebrow={`Fitur 11 · ${label}`}
        title="Laba rugi"
        desc="Disusun dari jurnal otomatis (PSAK): penjualan POS, HPP berbasis resep, dan beban operasional."
        actions={
          <div className="d-seg" role="radiogroup" aria-label="Periode">
            {PERIODS.map((p) => <button key={p.k} type="button" role="radio" aria-checked={k === p.k} onClick={() => setK(p.k)}>{p.label}</button>)}
          </div>
        }
      />
      <Panel>
        {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : rev === 0 ? (
          <Empty title="Belum ada jurnal pada periode ini" />
        ) : (
          <div className="d-table-wrap">
            <table className="d-table d-table--fin">
              <thead><tr><th scope="col">Akun</th><th scope="col">Uraian</th><th scope="col" className="d-num">Jumlah</th><th scope="col" className="d-num">% omset</th></tr></thead>
              <tbody>
                {by("revenue").map((x) => <Row key={x.code} {...x} indent />)}
                <Row name="Total pendapatan" amount={rev} strong />
                {by("cogs").map((x) => <Row key={x.code} {...x} indent />)}
                <Row name="Laba kotor" amount={gross} strong />
                {by("expense").map((x) => <Row key={x.code} {...x} indent />)}
                <Row name="Total beban operasional" amount={exp} strong />
                <Row name="Laba bersih operasional" amount={net} strong />
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
