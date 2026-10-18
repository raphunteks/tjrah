import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, iso, addDays } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync } from "../../ui/index.jsx";
import { useLive } from "../../ops.jsx";

const GROUP = [["asset", "Aset"], ["liability", "Kewajiban"], ["equity", "Ekuitas"]];
const SRC = { pos: "Penjualan POS", void: "Pembalikan void", expense: "Beban operasional", petty: "Kas kecil", purchase: "Pembelian", payroll: "Payroll", manual: "Manual", financing: "Setoran / pinjaman", investment: "Pembelian aset" };

export default function Balance() {
  const { api, tenantId } = useAuth();
  const [asOf, setAsOf] = useState(iso(new Date()));
  const bs = useAsync(() => api.rpc("balance_sheet", { p_as_of: asOf, p_tenant: tenantId }), [api, asOf, tenantId], { key: `balance_sheet@${tenantId}@${asOf}` });
  const cf = useAsync(() => api.rpc("cash_flow", { p_from: iso(addDays(new Date(asOf), -29)), p_to: asOf, p_tenant: tenantId }), [api, asOf, tenantId], { key: `cash_flow@${tenantId}@${asOf}` });
  useLive(["journal_entries", "journal_lines"], () => { bs.reload(); cf.reload(); });
  const sum = (t) => (bs.data ?? []).filter((x) => x.type === t).reduce((s, x) => s + Number(x.amount), 0);
  const diff = sum("asset") - sum("liability") - sum("equity");
  return (
    <>
      <PageHead eyebrow="Fitur 11 · PSAK" title="Neraca & arus kas" desc="Disusun dari buku besar yang sama dengan laba rugi."
        actions={<label className="d-switch"><span className="d-switch__label">Per tanggal</span><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="d-date" /></label>} />
      <div className="d-grid d-grid--2">
        <Panel title="Neraca" meta={Math.round(diff) === 0 ? "Seimbang: aset = kewajiban + ekuitas" : `Selisih ${rupiah(diff)}`}>
          {bs.loading && !bs.data ? <Loading /> : bs.error && !bs.data ? <ErrorNote error={bs.error} onRetry={bs.reload} /> : !bs.data ? null : (
            <div className="d-table-wrap"><table className="d-table d-table--fin"><tbody>
              {GROUP.map(([t, l]) => [
                ...bs.data.filter((x) => x.type === t).map((x) => <tr key={x.code}><td className="d-mono d-muted">{x.code}</td><td className="d-indent">{x.name}</td><td className="d-num">{rupiah(x.amount)}</td></tr>),
                <tr key={t} className="is-total"><td /><td>Total {l.toLowerCase()}</td><td className="d-num">{rupiah(sum(t))}</td></tr>,
              ])}
            </tbody></table></div>
          )}
        </Panel>
        <Panel title="Arus kas" meta="30 hari sampai tanggal terpilih">
          {cf.loading && !cf.data ? <Loading /> : cf.error && !cf.data ? <ErrorNote error={cf.error} onRetry={cf.reload} /> : !cf.data ? null : (
            <div className="d-table-wrap"><table className="d-table d-table--fin">
              <thead><tr><th scope="col">Aktivitas</th><th scope="col">Sumber</th><th scope="col" className="d-num">Masuk</th><th scope="col" className="d-num">Keluar</th></tr></thead>
              <tbody>
                {cf.data.map((x, i) => <tr key={i}><td>{x.activity}</td><td>{SRC[x.source] ?? x.source}</td><td className="d-num">{rupiah(x.inflow)}</td><td className="d-num">{rupiah(x.outflow)}</td></tr>)}
                <tr className="is-total"><td>Kas bersih</td><td /><td className="d-num" colSpan={2}>{rupiah(cf.data.reduce((s, x) => s + Number(x.inflow) - Number(x.outflow), 0))}</td></tr>
              </tbody>
            </table></div>
          )}
        </Panel>
      </div>
    </>
  );
}
