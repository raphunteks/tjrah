import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useAction, Feedback, useIndex, qtyFmt, useLive } from "../../ops.jsx";

const ST = { draft: ["Draf", "neutral"], pending: ["Menunggu Owner", "warn"], approved: ["Disetujui", "accent"], received: ["Diterima", "ok"], cancelled: ["Batal", "danger"] };

export default function Purchasing() {
  const { api, role, tenantId } = useAuth();
  const r = useAsync(async () => {
    if (!api || !tenantId) return null;
    const [pos, vendors, items, branches] = await Promise.all([
      api.list("purchase_orders", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }).catch(() => []),
      api.list("vendors", { eq: { tenant_id: tenantId }, order: ["name"] }).catch(() => []),
      api.list("inventory_items", { eq: { tenant_id: tenantId }, order: ["name"] }).catch(() => []),
      api.list("branches", { eq: { tenant_id: tenantId } }).catch(() => []),
    ]);
    return { pos: pos || [], vendors: vendors || [], items: items || [], branches: branches || [] };
  }, [api, tenantId], { key: tenantId ? `purchasing@${tenantId}` : null });
  useLive(["purchase_orders", "vendors", "inventory_items", "branches"], r.reload);
  const [po, setPo] = useState(null);
  const [vendor, setVendor] = useState(null);
  const a = useAction();
  const items = useIndex(r.data?.items), vendors = useIndex(r.data?.vendors), branches = useIndex(r.data?.branches);

  const savePo = () => a.run(async () => {
    const lines = po.lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty), price: Number(l.price) }));
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    if (po.id) await api.update("purchase_orders", po.id, { vendor_id: po.vendor_id, branch_id: po.branch_id, lines, total });
    else await api.insert("purchase_orders", { tenant_id: tenantId, vendor_id: po.vendor_id, branch_id: po.branch_id, code: `PO-${Date.now().toString().slice(-7)}`, lines, total, status: "draft" });
    setPo(null);
    r.reload();
  });
  const saveVendor = () => a.run(async () => {
    const { id, ...row } = vendor;
    if (id) await api.update("vendors", id, row); else await api.insert("vendors", { ...row, tenant_id: tenantId });
    setVendor(null);
    r.reload();
  });

  return (
    <>
      <PageHead eyebrow={`Fitur 9 · ${permOf(role, 9)?.label}`} title="Pembelian" desc="Draf PO → diajukan → disetujui Owner → barang diterima (stok & utang dagang tercatat otomatis)."
        actions={can(role, 9, "c") && <><button type="button" className="d-btn d-btn--ghost" onClick={() => setVendor({ name: "", phone: "", bank: "", terms: "COD" })}>Tambah vendor</button>
          <button type="button" className="d-btn d-btn--primary" disabled={!r.data} onClick={() => setPo({ vendor_id: r.data?.vendors?.[0]?.id ?? "", branch_id: r.data?.branches?.find((x) => x.is_warehouse)?.id ?? r.data?.branches?.[0]?.id, lines: [{ item_id: "", qty: "", price: "" }] })}>Buat PO</button></>} />
      {r.loading && !r.data ? <Loading /> : r.error && !r.data ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? <Loading /> : (
        <div className="d-grid d-grid--wide">
          <Panel title="Purchase order">
            {r.data.pos.length === 0 ? <Empty title="Belum ada PO" /> : (
              <ul className="d-approvals">{r.data.pos.map((p) => (
                <li key={p.id} className="d-approval">
                  <div className="d-approval__main">
                    <p className="d-approval__kind"><span className="d-mono">{p.code}</span> · {vendors[p.vendor_id]?.name}</p>
                    <p className="d-list__title">{p.lines.map((l) => `${items[l.item_id]?.name} ${qtyFmt(l.qty, items[l.item_id]?.unit)}`).join(", ")}</p>
                    <p className="d-list__meta">Ke {branches[p.branch_id]?.name} · {date(p.created_at)}</p>
                  </div>
                  <p className="d-approval__amt">{rupiah(p.total)}</p>
                  <div className="d-approval__act">
                    <Badge tone={ST[p.status][1]}>{ST[p.status][0]}</Badge>
                    {p.status === "draft" && can(role, 9, "u") && <>
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setPo({ ...p, lines: p.lines.map((l) => ({ ...l })) })}>Ubah</button>
                      <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => a.run(async () => { await api.rpc("submit_po", { p_po: p.id }); r.reload(); }, "PO diajukan ke Owner")}>Ajukan</button>
                    </>}
                    {p.status === "approved" && can(role, 9, "u") && <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => a.run(async () => { await api.rpc("receive_po", { p_po: p.id }); r.reload(); }, "Barang diterima, stok bertambah")}>Terima barang</button>}
                  </div>
                </li>
              ))}</ul>
            )}
            <Feedback a={a} />
          </Panel>
          <Panel title="Vendor">
            <ul className="d-list">{r.data.vendors.map((v) => (
              <li key={v.id}><div><p className="d-list__title">{v.name}</p><p className="d-list__meta">{v.phone} · {v.bank} · {v.terms}</p></div>
                {can(role, 9, "u") && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setVendor({ ...v })}>Ubah</button>}</li>
            ))}</ul>
          </Panel>
        </div>
      )}
      <Modal open={Boolean(po)} title={po?.id ? "Ubah PO" : "Buat PO"} onClose={() => setPo(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setPo(null)}>Batal</button><button type="button" className="d-btn d-btn--primary" disabled={a.busy || !po?.vendor_id} onClick={savePo}>Simpan draf</button></>}>
        {po && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Vendor" id="po-v"><select id="po-v" value={po.vendor_id} onChange={(e) => setPo({ ...po, vendor_id: e.target.value })}>{r.data.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
              <Field label="Kirim ke" id="po-b"><select id="po-b" value={po.branch_id} onChange={(e) => setPo({ ...po, branch_id: e.target.value })}>{r.data.branches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            </div>
            {po.lines.map((l, i) => (
              <div key={i} className="d-form__row d-form__row--3">
                <Field label="Bahan" id={`po-i${i}`}><select id={`po-i${i}`} value={l.item_id} onChange={(e) => setPo({ ...po, lines: po.lines.map((x, j) => (j === i ? { ...x, item_id: e.target.value, price: x.price || items[e.target.value]?.cost_per_unit || "" } : x)) })}><option value="">Pilih…</option>{r.data.items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}</select></Field>
                <Field label="Jumlah" id={`po-q${i}`}><input id={`po-q${i}`} inputMode="decimal" value={l.qty} onChange={(e) => setPo({ ...po, lines: po.lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "") } : x)) })} /></Field>
                <Field label="Harga / satuan" id={`po-p${i}`}><input id={`po-p${i}`} inputMode="decimal" value={l.price} onChange={(e) => setPo({ ...po, lines: po.lines.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x)) })} /></Field>
              </div>
            ))}
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setPo({ ...po, lines: [...po.lines, { item_id: "", qty: "", price: "" }] })}>+ Baris</button>
            <p className="d-text">Total {rupiah(po.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0))}</p>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
      <Modal open={Boolean(vendor)} title={vendor?.id ? "Ubah vendor" : "Tambah vendor"} onClose={() => setVendor(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setVendor(null)}>Batal</button><button type="button" className="d-btn d-btn--primary" disabled={a.busy || !vendor?.name} onClick={saveVendor}>Simpan vendor</button></>}>
        {vendor && (
          <div className="d-form">
            <Field label="Nama" id="vd-n"><input id="vd-n" value={vendor.name} onChange={(e) => setVendor({ ...vendor, name: e.target.value })} /></Field>
            <div className="d-form__row">
              <Field label="Telepon" id="vd-p"><input id="vd-p" value={vendor.phone ?? ""} onChange={(e) => setVendor({ ...vendor, phone: e.target.value })} /></Field>
              <Field label="Bank" id="vd-b"><input id="vd-b" value={vendor.bank ?? ""} onChange={(e) => setVendor({ ...vendor, bank: e.target.value })} /></Field>
            </div>
            <Field label="Termin" id="vd-t"><select id="vd-t" value={vendor.terms} onChange={(e) => setVendor({ ...vendor, terms: e.target.value })}>{["COD", "Net 14", "Net 30"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </>
  );
}
