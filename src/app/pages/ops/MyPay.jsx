import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, iso, pct } from "../../../lib/format.js";
import { printPayslip } from "../../../lib/payslip.js";
import { PageHead, Panel, Loading, ErrorNote, useAsync, Empty, Stat } from "../../ui/index.jsx";

/** Komisi berjalan bulan ini (Dokter/Terapis): jasa konsultasi & tindakan lunas × tarif komisi. */
function RunningCommission() {
  const { api } = useAuth();
  const d = new Date();
  const from = iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const c = useAsync(() => api.rpc("my_commission", { p_from: from, p_to: iso(d) }), [api, from]);
  if (c.loading || c.error || !c.data || !Number(c.data.rate)) return null;
  return (
    <div className="d-stats d-stats--3">
      <Stat label="Komisi berjalan" value={rupiah(c.data.commission)} sub={`Bulan ini · tarif ${pct(Number(c.data.rate))}`} />
      <Stat label="Jasa lunas" value={rupiah(c.data.services)} sub="Konsultasi & tindakan; obat tidak dihitung" />
      <Stat label="Tagihan lunas" value={c.data.orders} sub="Masuk payroll saat GM menyusun periode ini" />
    </div>
  );
}

export default function MyPay() {
  const { api, profile, tenant } = useAuth();
  const r = useAsync(() => api.list("payroll_lines"), [api]);
  const net = (l) => Number(l.net ?? l.base + l.allowance + l.overtime + l.commission - l.late_penalty - l.kasbon);
  return (
    <>
      <PageHead eyebrow="Fitur 14 · R (Komisi Pribadi)" title="Komisi & slip gaji" desc="Hanya baris milik Anda yang bisa dibaca; RLS menyaring di database." />
      <RunningCommission />
      <Panel>
        {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : r.data.length === 0 ? <Empty title="Belum ada slip">Slip muncul setelah GM menyusun payroll bulan berjalan.</Empty> : (
          <div className="d-table-wrap"><table className="d-table d-table--fin">
            <thead><tr><th scope="col">Gaji pokok</th><th scope="col" className="d-num">Tunjangan</th><th scope="col" className="d-num">Lembur</th><th scope="col" className="d-num">Komisi</th><th scope="col" className="d-num">Denda</th><th scope="col" className="d-num">Kasbon</th><th scope="col" className="d-num">Diterima</th><th scope="col"><span className="sr-only">Slip</span></th></tr></thead>
            <tbody>{r.data.map((l) => (
              <tr key={l.id}><td>{rupiah(l.base)}</td><td className="d-num">{rupiah(l.allowance)}</td><td className="d-num">{rupiah(l.overtime)}</td><td className="d-num">{rupiah(l.commission)}</td><td className="d-num">−{rupiah(l.late_penalty)}</td><td className="d-num">−{rupiah(l.kasbon)}</td><td className="d-num"><strong>{rupiah(net(l))}</strong></td><td><button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => printPayslip({ tenant, employee: profile, period: l.period ?? l.created_at ?? new Date().toISOString(), line: l })}>Cetak slip</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
    </>
  );
}
