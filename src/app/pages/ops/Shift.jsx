import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, dateTime } from "../../../lib/format.js";
import { can } from "../../../lib/rbac.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Stat, Badge, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback } from "../../ops.jsx";
import { dispatchHermesZReport } from "../../../lib/hermes.js";

const M = { cash: "Tunai", card: "Kartu", qris: "QRIS", ewallet: "E-wallet", transfer: "Transfer" };

function Report({ rep, title }) {
  const s = rep.shift;
  return (
    <Panel title={title} meta={`Dibuka ${dateTime(s.opened_at)}${s.closed_at ? ` · ditutup ${dateTime(s.closed_at)}` : ""}`}>
      <div className="d-stats d-stats--inner">
        <Stat label="Transaksi lunas" value={rep.orders} sub={`${rep.voids} void`} />
        <Stat label="Kas diharapkan di laci" value={rupiah(rep.expected_cash)} sub={`Modal ${rupiah(s.opening_cash)} + tunai ${rupiah(s.cash_sales)}`} />
        <Stat label="Non-tunai" value={rupiah(s.non_cash_sales)} />
        {s.status === "closed" && <Stat label="Selisih kas" value={rupiah(s.variance)} sub={s.variance === 0 ? "Pas" : s.variance > 0 ? "Lebih" : "Kurang"} />}
      </div>
      <ul className="d-list">
        {Object.entries(rep.by_method).map(([k, v]) => <li key={k}><span>{M[k] ?? k}</span><span className="d-mono">{rupiah(v)}</span></li>)}
      </ul>
    </Panel>
  );
}

export default function Shift() {
  const { api, profile, role } = useAuth();
  const b = useBranch();
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [closed, setClosed] = useState(null);
  const [z, setZ] = useState(null);
  const a = useAction();
  const r = useAsync(async () => {
    if (!api || !b.branchId) return null;
    const open = await api.list("shifts", { eq: { branch_id: b.branchId, status: "open" } }).catch(() => []);
    const mine = (open || []).find((s) => s.cashier_id === profile?.id);
    return { open: open || [], mine, rep: mine ? await api.rpc("shift_report", { p_shift: mine.id }).catch(() => null) : null };
  }, [api, b.branchId, profile?.id], { key: b.branchId ? `shift@${b.branchId}@${profile?.id}` : null });

  const canOpen = can(role, 5, "c");
  return (
    <>
      <PageHead eyebrow="Fitur 5 · Buka/tutup kasir" title="Shift & laporan" desc="Modal awal wajib sebelum transaksi pertama. Tutup shift dengan menghitung uang fisik; Z-Report mengunci hari dan dikirim Hermes ke WhatsApp Owner & GM." actions={<BranchSelect b={b} />} />
      {b.loading || (r.loading && !r.data) ? (
        <Loading />
      ) : b.error || r.error ? (
        <ErrorNote error={b.error || r.error} onRetry={() => { b.reload?.(); r.reload(); }} />
      ) : !b.branchId ? (
        <Empty title="Pilih Cabang Operasional">
          {b.options.length === 0
            ? "Belum ada cabang terdaftar untuk toko Anda. Silakan tambahkan cabang di Pengaturan Toko terlebih dahulu."
            : "Silakan pilih lokasi cabang di pemilih lokasi atas untuk mengelola shift kasir."}
        </Empty>
      ) : !r.data ? (
        <Loading />
      ) : (
        <div className="d-grid d-grid--wide">
          <div className="d-grid">
            {r.data.mine ? (
              <>
                <Report rep={r.data.rep} title="X-Report berjalan" />
                <Panel title="Tutup shift">
                  <div className="d-form">
                    <Field label="Hasil hitung uang fisik di laci (Rp)" id="sh-c"><input id="sh-c" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ""))} /></Field>
                    <button type="button" className="d-btn d-btn--primary" disabled={!counted || a.busy}
                      onClick={() => a.run(async () => { const rep = await api.rpc("close_shift", { p_shift: r.data.mine.id, p_counted: Number(counted) }); setClosed(rep); setCounted(""); r.reload(); }, "Shift ditutup")}>Tutup shift & cetak X-Report</button>
                  </div>
                </Panel>
              </>
            ) : (
              <Panel title="Buka shift">
                {canOpen ? (
                  <div className="d-form">
                    <Field label="Modal awal uang kecil di laci (Rp)" id="sh-o"><input id="sh-o" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ""))} /></Field>
                    <button type="button" className="d-btn d-btn--primary" disabled={opening === "" || a.busy}
                      onClick={() => a.run(async () => { await api.rpc("open_shift", { p_branch: b.branchId, p_opening: Number(opening) }); setOpening(""); setClosed(null); r.reload(); }, "Shift dibuka")}>Buka shift</button>
                  </div>
                ) : <p className="d-text d-muted">Peran Anda tidak membuka shift kasir.</p>}
              </Panel>
            )}
            {closed && <Report rep={closed} title="X-Report shift yang baru ditutup" />}
            <Feedback a={a} />
          </div>
          <Panel title="Z-Report harian" meta={`${r.data.open.length} shift masih terbuka di cabang ini`}>
            <p className="d-text">Mengunci total transaksi hari ini untuk {b.branch?.name}. Semua shift harus sudah ditutup.</p>
            {canOpen && (
              <button type="button" className="d-btn d-btn--ghost" disabled={a.busy}
                onClick={() => a.run(async () => {
                  const res = await api.rpc("z_report", { p_branch: b.branchId });
                  setZ(res);
                  // Dispatch Z-Report resmi ke WhatsApp Hermes Owner & GM
                  dispatchHermesZReport({
                    branchName: b.branch?.name || "Cabang Utama",
                    tenantName: b.branch?.tenant_name || "Tijarah Merchant",
                    orders: res?.orders || 0,
                    revenue: res?.revenue || 0,
                    tax: res?.tax || 0,
                    cogs: res?.cogs || 0,
                    voids: res?.voids || 0,
                    cashActual: res?.cash_actual || 0,
                    whatsappOwner: b.branch?.whatsapp_owner,
                    whatsappGm: b.branch?.whatsapp_gm
                  });
                }, "Z-Report dikunci dan diantrekan ke Hermes")}>Kunci & kirim Z-Report</button>
            )}
            {z && (
              <ul className="d-list">
                <li><span>Transaksi</span><span className="d-mono">{z.orders}</span></li>
                <li><span>Omset</span><span className="d-mono">{rupiah(z.revenue)}</span></li>
                <li><span>Pajak penjualan</span><span className="d-mono">{rupiah(z.tax)}</span></li>
                <li><span>HPP</span><span className="d-mono">{rupiah(z.cogs)}</span></li>
                <li><span>Void</span><span className="d-mono">{z.voids}</span></li>
                <li><span>Hermes</span><Badge tone="accent">WhatsApp Owner & GM · Discord #laporan-harian</Badge></li>
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
