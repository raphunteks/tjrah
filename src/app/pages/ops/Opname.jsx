import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback, useIndex, qtyFmt } from "../../ops.jsx";

export default function Opname() {
  const { api } = useAuth();
  const b = useBranch();
  const [tab, setTab] = useState("waste");
  const [w, setW] = useState({ item: "", qty: "", reason: "" });
  const [counts, setCounts] = useState({});
  const a = useAction();
  const r = useAsync(async () => {
    if (!b.branchId) return null;
    const [items, waste, mine] = await Promise.all([
      api.list("inventory_items", { order: ["name"] }),
      api.list("waste_logs", { eq: { branch_id: b.branchId }, order: ["created_at", "desc"], limit: 20 }),
      api.list("stock_counts", { eq: { branch_id: b.branchId }, order: ["created_at", "desc"], limit: 20 }),
    ]);
    return { items, waste, mine };
  }, [api, b.branchId]);
  const idx = useIndex(r.data?.items);

  return (
    <>
      <PageHead eyebrow="Fitur 10 · Create (Opname/Waste)" title="Opname & waste"
        desc="Catat bahan rusak, tumpah, atau kedaluwarsa, dan hitung stok fisik. GM meninjau selisih opname sebelum stok disesuaikan."
        actions={<><div className="d-seg" role="radiogroup" aria-label="Bagian"><button type="button" role="radio" aria-checked={tab === "waste"} onClick={() => setTab("waste")}>Waste</button><button type="button" role="radio" aria-checked={tab === "opname"} onClick={() => setTab("opname")}>Opname</button></div><BranchSelect b={b} /></>} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? null : tab === "waste" ? (
        <div className="d-grid d-grid--wide">
          <Panel title="Waste terakhir">
            {r.data.waste.length === 0 ? <Empty title="Belum ada catatan waste" /> : (
              <ul className="d-list">{r.data.waste.map((x) => (
                <li key={x.id}><div><p className="d-list__title">{idx[x.item_id]?.name} · {qtyFmt(x.qty, idx[x.item_id]?.unit)}</p><p className="d-list__meta">{x.reason} · {dateTime(x.created_at)}</p></div><span className="d-mono">{rupiah(x.cost)}</span></li>
              ))}</ul>
            )}
          </Panel>
          <Panel title="Catat waste">
            <div className="d-form">
              <Field label="Bahan" id="w-i"><select id="w-i" value={w.item} onChange={(e) => setW({ ...w, item: e.target.value })}><option value="">Pilih bahan…</option>{r.data.items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
              <Field label={`Jumlah${w.item ? ` (${idx[w.item]?.unit})` : ""}`} id="w-q"><input id="w-q" inputMode="decimal" value={w.qty} onChange={(e) => setW({ ...w, qty: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
              <Field label="Alasan" id="w-r"><input id="w-r" placeholder="Tumpah, kedaluwarsa, gosong…" value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })} /></Field>
              {w.item && w.qty && <p className="d-text d-muted">Nilai kerugian ≈ {rupiah(Number(w.qty) * (idx[w.item]?.cost_per_unit ?? 0))}</p>}
              <button type="button" className="d-btn d-btn--primary" disabled={!w.item || !w.qty || !w.reason || a.busy}
                onClick={() => a.run(async () => { await api.rpc("log_waste", { p_branch: b.branchId, p_item: w.item, p_qty: Number(w.qty), p_reason: w.reason }); setW({ item: "", qty: "", reason: "" }); r.reload(); }, "Waste tercatat, stok & jurnal diperbarui")}>Simpan waste</button>
              <Feedback a={a} />
            </div>
          </Panel>
        </div>
      ) : (
        <div className="d-grid d-grid--wide">
          <Panel title="Hitung fisik" meta="Hitung buta: angka sistem tidak ditampilkan">
            <div className="d-table-wrap">
              <table className="d-table">
                <thead><tr><th scope="col">Bahan</th><th scope="col">Satuan</th><th scope="col" className="d-num">Hasil hitung</th></tr></thead>
                <tbody>{r.data.items.map((i) => (
                  <tr key={i.id}><td>{i.name}</td><td className="d-mono">{i.unit}</td>
                    <td className="d-num"><input className="d-cell-input" inputMode="decimal" aria-label={`Hitung ${i.name}`} value={counts[i.id] ?? ""} onChange={(e) => setCounts({ ...counts, [i.id]: e.target.value.replace(/[^\d.]/g, "") })} /></td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="d-form__actions">
              <Feedback a={a} />
              <button type="button" className="d-btn d-btn--primary" disabled={!Object.values(counts).some((v) => v !== "") || a.busy}
                onClick={() => a.run(async () => {
                  const n = await api.rpc("submit_opname", { p_branch: b.branchId, p_counts: Object.entries(counts).filter(([, v]) => v !== "").map(([item_id, v]) => ({ item_id, counted: Number(v) })) });
                  setCounts({}); r.reload(); return n;
                }, (n) => `${n} hitungan dikirim ke GM`)}>Kirim hasil opname</button>
            </div>
          </Panel>
          <Panel title="Kiriman saya">
            {r.data.mine.length === 0 ? <Empty title="Belum ada" /> : (
              <ul className="d-list">{r.data.mine.map((c) => (
                <li key={c.id}><div><p className="d-list__title">{idx[c.item_id]?.name}</p><p className="d-list__meta">{qtyFmt(c.counted_qty, idx[c.item_id]?.unit)} · {dateTime(c.created_at)}</p></div>
                  <Badge tone={c.status === "applied" ? "ok" : c.status === "rejected" ? "danger" : "warn"}>{c.status === "applied" ? "Diterapkan" : c.status === "rejected" ? "Ditolak" : "Menunggu GM"}</Badge></li>
              ))}</ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
