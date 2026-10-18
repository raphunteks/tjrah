import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const blank = { id: null, code: "", name: "", kind: "pct", value: "", min_spend: "0", max_discount: "", ends: "", limit: "", active: true };

function PromoModal({ row, onClose, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [f, setF] = useState(() => row ? { id: row.id, code: row.code, name: row.name, kind: row.kind, value: String(row.value), min_spend: String(row.min_spend ?? 0), max_discount: row.max_discount ?? "", ends: row.ends_at?.slice(0, 10) ?? "", limit: row.usage_limit ?? "", active: row.active } : blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = () => a.run(async () => {
    await api.rpc("upsert_promo", { p_id: f.id, p_code: f.code.trim(), p_name: f.name.trim(), p_kind: f.kind, p_value: Number(f.value), p_min_spend: Number(f.min_spend) || 0,
      p_max_discount: f.max_discount === "" ? null : Number(f.max_discount), p_ends: f.ends ? `${f.ends}T23:59:59Z` : null, p_limit: f.limit === "" ? null : Number(f.limit), p_active: f.active });
    onSaved(); onClose();
  });
  return (
    <Modal open title={row ? `Ubah ${row.code}` : "Promo baru"} onClose={onClose} footer={<>
      <button type="button" className="d-btn d-btn--ghost" onClick={onClose}>Batal</button>
      <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !f.code || !f.name || !(Number(f.value) > 0)} onClick={save}>Simpan</button></>}>
      <div className="d-form">
        <div className="d-form__row">
          <Field label="Kode" id="pm-code"><input id="pm-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} disabled={Boolean(row)} /></Field>
          <Field label="Nama" id="pm-name"><input id="pm-name" value={f.name} onChange={set("name")} /></Field>
        </div>
        <div className="d-form__row">
          <Field label="Jenis" id="pm-kind"><select id="pm-kind" value={f.kind} onChange={set("kind")}><option value="pct">Persen (%)</option><option value="amount">Nominal (Rp)</option></select></Field>
          <Field label={f.kind === "pct" ? "Persen" : "Nominal"} id="pm-val"><input id="pm-val" type="number" min="1" value={f.value} onChange={set("value")} /></Field>
        </div>
        <div className="d-form__row">
          <Field label="Belanja minimal (Rp)" id="pm-min"><input id="pm-min" type="number" min="0" value={f.min_spend} onChange={set("min_spend")} /></Field>
          <Field label="Potongan maksimal (Rp)" id="pm-max" hint="Kosongkan bila tanpa batas."><input id="pm-max" type="number" min="0" value={f.max_discount} onChange={set("max_discount")} /></Field>
        </div>
        <div className="d-form__row">
          <Field label="Berakhir" id="pm-end"><input id="pm-end" type="date" value={f.ends} onChange={set("ends")} /></Field>
          <Field label="Kuota pakai" id="pm-lim"><input id="pm-lim" type="number" min="1" value={f.limit} onChange={set("limit")} /></Field>
        </div>
        <label className="d-check"><input type="checkbox" checked={f.active} onChange={set("active")} /> Aktif</label>
        <Feedback a={a} />
      </div>
    </Modal>
  );
}

export default function Promos() {
  const { api, tenantId } = useAuth();
  const [modal, setModal] = useState(null);
  const q = useAsync(() => api.list("promos", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"] }), [api, tenantId]);
  useLive(["promos"], q.reload);
  return (
    <>
      <PageHead eyebrow="Fitur 3 · Promo & voucher" title="Promo & voucher" desc="Kasir memasukkan kode di layar pembayaran. Diskon voucher dihitung server dan tidak melewati batas diskon manual; pemakaian dicatat saat pesanan lunas dan dikembalikan bila di-void."
        actions={<button type="button" className="d-btn d-btn--primary" onClick={() => setModal({ row: null })}>Promo baru</button>} />
      <Panel>
        {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : q.data.length === 0 ? <Empty title="Belum ada promo">Buat kode pertama, mis. HEMAT10.</Empty> : (
          <div className="d-table-wrap"><table className="d-table">
            <thead><tr><th scope="col">Kode</th><th scope="col">Nama</th><th scope="col">Nilai</th><th scope="col" className="d-num">Min. belanja</th><th scope="col">Berakhir</th><th scope="col" className="d-num">Terpakai</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>{q.data.map((p) => (
              <tr key={p.id}><td className="d-mono">{p.code}</td><td>{p.name}</td>
                <td>{p.kind === "pct" ? `${p.value}%` : rupiah(p.value)}{p.max_discount != null && <span className="d-muted"> · maks {rupiah(p.max_discount)}</span>}</td>
                <td className="d-num">{rupiah(p.min_spend)}</td><td>{p.ends_at ? date(p.ends_at) : "—"}</td>
                <td className="d-num">{p.used_count}{p.usage_limit != null ? ` / ${p.usage_limit}` : ""}</td>
                <td><Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "Aktif" : "Nonaktif"}</Badge></td>
                <td><button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setModal({ row: p })}>Ubah</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Panel>
      {modal && <PromoModal row={modal.row} onClose={() => setModal(null)} onSaved={q.reload} />}
    </>
  );
}
