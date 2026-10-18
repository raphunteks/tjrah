import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Badge } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const STATIONS = ["dapur", "barista", "grill", "pastry"];
const EMPTY = { sku: "", name: "", category: "Makanan", price: "", station: "dapur", barcode: "" };

export default function Products() {
  const { api, role, tenantId } = useAuth();
  const r = useAsync(() => api.list("products", { eq: { tenant_id: tenantId }, order: ["category"] }), [api, tenantId], { key: `products@${tenantId}` });
  useLive(["products"], r.reload);
  const [edit, setEdit] = useState(null);
  const a = useAction();
  const save = () => a.run(async () => {
    const row = { ...edit, price: Number(edit.price), barcode: edit.barcode || null };
    if (row.id) { const { id, created_at, tenant_id, ...patch } = row; await api.update("products", id, patch); }
    else await api.insert("products", { ...row, tenant_id: tenantId, is_available: true });
    setEdit(null);
    r.reload();
  });
  return (
    <>
      <PageHead eyebrow={`Fitur 3 · ${permOf(role, 3)?.label}`} title="Menu & harga jual" desc="Harga dihitung di server saat pesanan dibuat; kasir tidak bisa mengubah harga."
        actions={can(role, 3, "c") && <button type="button" className="d-btn d-btn--primary" onClick={() => setEdit({ ...EMPTY })}>Tambah menu</button>} />
      <Panel>
        {r.loading && !r.data ? <Loading /> : r.error && !r.data ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? null : (
          <div className="d-table-wrap"><table className="d-table">
            <thead><tr><th scope="col">SKU</th><th scope="col">Menu</th><th scope="col">Kategori</th><th scope="col">Stasiun</th><th scope="col" className="d-num">Harga</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>{r.data.map((p) => (
              <tr key={p.id}><td className="d-mono">{p.sku}</td><td>{p.name}</td><td>{p.category}</td><td className="d-mono">{p.station}</td><td className="d-num">{rupiah(p.price)}</td>
                <td><Badge tone={p.is_available ? "ok" : "danger"}>{p.is_available ? "Tersedia" : "Habis (86)"}</Badge></td>
                <td className="d-row-actions">
                  {can(role, 3, "u") && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => a.run(async () => { await api.rpc("toggle_86", { p_product: p.id, p_available: !p.is_available }); r.reload(); })}>{p.is_available ? "Tandai habis" : "Tersedia lagi"}</button>}
                  {can(role, 3, "u") && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setEdit({ ...p, barcode: p.barcode ?? "" })}>Ubah</button>}
                  {can(role, 3, "d") && <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => a.run(async () => { await api.remove("products", p.id); r.reload(); })}>Hapus</button>}
                </td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Feedback a={a} />
      </Panel>
      <Modal open={Boolean(edit)} title={edit?.id ? "Ubah menu" : "Tambah menu"} onClose={() => setEdit(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>Batal</button><button type="button" className="d-btn d-btn--primary" disabled={a.busy || !edit?.name || !edit?.sku || edit?.price === ""} onClick={save}>Simpan menu</button></>}>
        {edit && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="SKU" id="p-sku"><input id="p-sku" value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value.toUpperCase() })} /></Field>
              <Field label="Barcode (opsional)" id="p-bc"><input id="p-bc" value={edit.barcode} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} /></Field>
            </div>
            <Field label="Nama menu" id="p-n"><input id="p-n" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="d-form__row">
              <Field label="Kategori" id="p-c"><input id="p-c" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
              <Field label="Stasiun dapur" id="p-s"><select id="p-s" value={edit.station} onChange={(e) => setEdit({ ...edit, station: e.target.value })}>{STATIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Harga jual (Rp, sebelum pajak)" id="p-p"><input id="p-p" inputMode="numeric" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value.replace(/\D/g, "") })} /></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </>
  );
}
