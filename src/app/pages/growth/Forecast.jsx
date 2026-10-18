import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, iso, addDays, date } from "../../../lib/format.js";
import { PageHead, Panel, Stat, Loading, ErrorNote, Empty, Badge, LineChart, useAsync } from "../../ui/index.jsx";

function Cash() {
  const { api, tenantId } = useAuth();
  const [days, setDays] = useState(30);
  const q = useAsync(() => api.rpc("cash_projection", { p_days: days, p_ap_days: 14 }), [api, days, tenantId]);
  return (
    <Panel title="Proyeksi kas" actions={<select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Horizon"><option value={14}>14 hari</option><option value={30}>30 hari</option><option value={60}>60 hari</option><option value={90}>90 hari</option></select>}>
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
        <>
          <div className="d-stats d-stats--3">
            <Stat label="Saldo kas & bank kini" value={rupiah(q.data.opening)} />
            <Stat label={`Saldo ${q.data.days} hari lagi`} value={rupiah(q.data.ending)} sub={`Terendah ${rupiah(q.data.min_balance)}`} />
            <Stat label="Saldo negatif pertama" value={q.data.first_negative_date ? date(q.data.first_negative_date) : "Tidak ada"} sub={q.data.first_negative_date ? "Siapkan tambahan kas" : "Aman pada asumsi di bawah"} />
          </div>
          <LineChart points={q.data.rows.map((r) => ({ x: r.date, y: r.balance, label: r.date }))} format={rupiah} label="Proyeksi saldo kas" />
          <ul className="d-list">{q.data.assumptions.map((s) => <li key={s} className="d-text d-muted">{s}</li>)}</ul>
          <p className="d-text d-muted">Ini perkiraan berbasis rata-rata historis, bukan jaminan; tidak memuat tren musiman, kenaikan harga bahan, atau pembayaran tak terduga.</p>
        </>
      )}
    </Panel>
  );
}

function Labour() {
  const { api, tenantId } = useAuth();
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(addDays(new Date(), 6)));
  const q = useAsync(() => api.rpc("labour_cost_estimate", { p_from: from, p_to: to, p_branch: null }), [api, from, to, tenantId]);
  return (
    <Panel title="Labour cost terjadwal vs proyeksi penjualan" actions={<>
      <input type="date" className="d-date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Dari" />
      <input type="date" className="d-date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sampai" /></>}>
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : q.data.rows.length === 0 ? <Empty title="Belum ada shift terjadwal pada rentang ini">Susun jadwal di Karyawan & jadwal.</Empty> : (
        <>
          <div className="d-stats d-stats--3">
            <Stat label="Biaya tenaga kerja" value={rupiah(q.data.total_cost)} sub="Gaji pokok ÷ 173 jam × jam terjadwal" />
            <Stat label="Proyeksi penjualan" value={rupiah(q.data.total_forecast_sales)} sub="Rata-rata 28 hari per hari-dalam-minggu" />
            <Stat label="Labour cost %" value={q.data.labour_pct == null ? "—" : `${q.data.labour_pct}%`} sub="Wajar F&B sekitar 20–30%" />
          </div>
          {q.data.missing_salary.length > 0 && <p className="d-note d-note--warn">Gaji pokok belum diisi: {q.data.missing_salary.join(", ")} — biayanya terhitung Rp 0.</p>}
          <div className="d-table-wrap"><table className="d-table d-table--fin">
            <thead><tr><th scope="col">Tanggal</th><th scope="col" className="d-num">Orang</th><th scope="col" className="d-num">Jam</th><th scope="col" className="d-num">Biaya</th><th scope="col" className="d-num">Proyeksi penjualan</th><th scope="col" className="d-num">Labour %</th></tr></thead>
            <tbody>{q.data.rows.map((r) => (
              <tr key={r.date}><td>{date(r.date)}</td><td className="d-num">{r.people}</td><td className="d-num">{r.hours}</td><td className="d-num">{rupiah(r.cost)}</td><td className="d-num">{rupiah(r.forecast_sales)}</td>
                <td className="d-num">{r.labour_pct == null ? "—" : <Badge tone={r.labour_pct > 35 ? "warn" : "ok"}>{r.labour_pct}%</Badge>}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </Panel>
  );
}

export default function Forecast() {
  return (
    <>
      <PageHead eyebrow="Fitur 12 · 13 · Perencanaan" title="Proyeksi kas & labour cost" desc="Hanya Owner dan GM. Proyeksi kas mengikuti paket langganan (fitur flag cash_projection)." />
      <div className="d-grid"><Cash /><Labour /></div>
    </>
  );
}
