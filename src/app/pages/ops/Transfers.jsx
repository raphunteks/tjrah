import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex, qtyFmt, useLive } from "../../ops.jsx";
import { Link } from "../../../lib/router.jsx";

const ST = { draft: ["Menunggu persetujuan", "warn"], approved: ["Disetujui", "accent"], in_transit: ["Dalam perjalanan", "accent"], received: ["Diterima", "ok"], cancelled: ["Batal", "danger"] };
const FLOW = ["draft", "approved", "in_transit", "received"];

export default function Transfers() {
  const { api, role, tenantId } = useAuth();
  const r = useAsync(async () => {
    const [stos, items, branches] = await Promise.all([
      api.list("stock_transfers", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }),
      api.list("inventory_items", { eq: { tenant_id: tenantId }, order: ["name"] }),
      api.list("branches", { eq: { tenant_id: tenantId } }),
    ]);
    return { stos, items, branches };
  }, [api, tenantId], { key: `transfers@${tenantId}` });
  useLive(["stock_transfers", "inventory_items", "branches"], r.reload);
  const [form, setForm] = useState(null);
  const a = useAction();
  const items = useIndex(r.data?.items), br = useIndex(r.data?.branches);
  return (
    <>
      <PageHead eyebrow="Fitur 10 · Mutasi stok" title="Transfer antar-gudang" desc="Surat jalan: Draft → Approved → In Transit → Received. Persetujuan dilakukan di halaman Persetujuan."
        actions={can(role, 10, "c") && <button type="button" className="d-btn d-btn--primary" disabled={!r.data} onClick={() => setForm({ from: r.data?.branches?.find((x) => x.is_warehouse)?.id ?? "", to: "", lines: [{ item_id: "", qty: "" }] })}>Buat transfer</button>} />
      {r.loading && !r.data ? <Loading /> : r.error && !r.data ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? null : (
        <Panel>
          {r.data.stos.length === 0 ? <Empty title="Belum ada transfer" /> : (
            <ul className="d-approvals">{r.data.stos.map((s) => (
              <li key={s.id} className="d-approval">
                <div className="d-approval__main">
                  <p className="d-approval__kind"><span className="d-mono">{s.code}</span> · {br[s.from_branch]?.name} → {br[s.to_branch]?.name}</p>
                  <p className="d-list__title">{s.lines.map((l) => `${items[l.item_id]?.name} ${qtyFmt(l.qty, items[l.item_id]?.unit)}`).join(", ")}</p>
                  <ol className="sto-flow" aria-label="Tahap">{FLOW.map((f) => <li key={f} className={FLOW.indexOf(f) <= FLOW.indexOf(s.status) ? "is-done" : undefined}>{ST[f][0]}</li>)}</ol>
                  <p className="d-list__meta">{date(s.created_at)}</p>
                </div>
                <div className="d-approval__act">
                  <Badge tone={ST[s.status][1]}>{ST[s.status][0]}</Badge>
                  {s.status === "draft" && <Link className="d-link" to="/app/persetujuan">Ke persetujuan</Link>}
                  {s.status === "approved" && can(role, 10, "u") && <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => a.run(async () => { await api.rpc("advance_sto", { p_sto: s.id }); r.reload(); }, "Surat jalan diterbitkan, stok asal berkurang")}>Kirim</button>}
                  {s.status === "in_transit" && can(role, 10, "u") && <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => a.run(async () => { await api.rpc("advance_sto", { p_sto: s.id }); r.reload(); }, "Barang diterima di tujuan")}>Terima</button>}
                </div>
              </li>
            ))}</ul>
          )}
          <Feedback a={a} />
        </Panel>
      )}
      <Modal open={Boolean(form)} title="Buat transfer stok" onClose={() => setForm(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setForm(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !form?.from || !form?.to || form?.from === form?.to}
            onClick={() => a.run(async () => { await api.rpc("create_sto", { p_from: form.from, p_to: form.to, p_lines: form.lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })) }); setForm(null); r.reload(); }, "Transfer dibuat dan masuk antrean persetujuan")}>Ajukan transfer</button></>}>
        {form && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Dari" id="st-f"><select id="st-f" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}><option value="">Pilih…</option>{r.data.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Ke" id="st-t"><select id="st-t" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}><option value="">Pilih…</option>{r.data.branches.filter((x) => x.id !== form.from).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </div>
            {form.lines.map((l, i) => (
              <div key={i} className="d-form__row">
                <Field label="Bahan" id={`st-i${i}`}><select id={`st-i${i}`} value={l.item_id} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)) })}><option value="">Pilih…</option>{r.data.items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}</select></Field>
                <Field label="Jumlah" id={`st-q${i}`}><input id={`st-q${i}`} inputMode="decimal" value={l.qty} onChange={(e) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x)) })} /></Field>
              </div>
            ))}
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setForm({ ...form, lines: [...form.lines, { item_id: "", qty: "" }] })}>+ Baris</button>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </>
  );
}
