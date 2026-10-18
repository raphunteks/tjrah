import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, date, number } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Stat, Modal, Field, useAsync } from "../../ui/index.jsx";
import { useLive, useAction, Feedback } from "../../ops.jsx";

const SORTS = [["points", "Poin"], ["total_spent", "Belanja"], ["last_visit_at", "Terakhir datang"]];

function EditModal({ row, mode, tenantId, onClose, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [f, setF] = useState(() => ({ phone: row?.phone ?? "", name: row?.name ?? "", note: row?.note ?? "", redeem: "" }));
  const redeem = Number(f.redeem) || 0;
  const submit = () => a.run(async () => {
    if (mode === "new") await api.insert("customers", { tenant_id: tenantId, phone: f.phone.replace(/[^\d+]/g, ""), name: f.name.trim() || null, note: f.note.trim() || null });
    else if (mode === "redeem") await api.rpc("redeem_points", { p_customer: row.id, p_points: redeem, p_note: null });
    else await api.update("customers", row.id, { name: f.name.trim() || null, note: f.note.trim() || null });
    onSaved();
    onClose();
  });
  const title = mode === "new" ? "Pelanggan baru" : mode === "redeem" ? `Tukar poin · ${row.name ?? row.phone}` : `Ubah · ${row.name ?? row.phone}`;
  const valid = mode === "new" ? f.phone.replace(/\D/g, "").length >= 9 : mode === "redeem" ? redeem > 0 && redeem <= row.points : true;
  return (
    <Modal open title={title} onClose={onClose} footer={(
      <>
        <button type="button" className="d-btn d-btn--ghost" onClick={onClose}>Batal</button>
        <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !valid} onClick={submit}>Simpan</button>
      </>
    )}>
      <div className="d-form">
        {mode === "new" && (
          <Field label="WhatsApp" id="cu-p" hint="Nomor ini kunci pelanggan; poin bertambah otomatis saat kasir mengisinya di pembayaran.">
            <input id="cu-p" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, "") })} />
          </Field>
        )}
        {mode === "redeem" ? (
          <Field label={`Poin ditukar (saldo ${number(row.points)})`} id="cu-r" hint="Poin hanya bertambah lewat transaksi lunas; di sini hanya bisa dikurangi.">
            <input id="cu-r" type="number" min="1" max={row.points} value={f.redeem} onChange={(e) => setF({ ...f, redeem: e.target.value })} />
          </Field>
        ) : (
          <>
            <Field label="Nama" id="cu-n"><input id="cu-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Catatan" id="cu-note" hint="Mis. preferensi, alergi makanan, tanggal spesial."><textarea id="cu-note" rows="2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </>
        )}
        <Feedback a={a} />
      </div>
    </Modal>
  );
}

export default function Crm() {
  const { api, role, tenantId } = useAuth();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("points");
  const [modal, setModal] = useState(null);
  const a = useAction();
  const data = useAsync(() => api.list("customers", { eq: { tenant_id: tenantId }, order: ["points", "desc"] }), [api, tenantId]);
  useLive(["customers"], data.reload);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data.data ?? [])
      .filter((c) => !t || c.phone.includes(t.replace(/\D/g, "") || "§") || (c.name ?? "").toLowerCase().includes(t))
      .sort((x, y) => ((y[sort] ?? "") > (x[sort] ?? "") ? 1 : -1));
  }, [data.data, q, sort]);
  const all = data.data ?? [];
  const canC = can(role, 15, "c"), canU = can(role, 15, "u"), canD = can(role, 15, "d");

  return (
    <>
      <PageHead eyebrow="Fitur 15 · CRM & poin loyalitas" title="Pelanggan & poin"
        desc="1 poin per Rp10.000 transaksi lunas. Kasir mengisi nomor WhatsApp saat pembayaran; struk digital dikirim lewat Hermes."
        actions={canC && <button type="button" className="d-btn d-btn--primary" onClick={() => setModal({ mode: "new" })}>Pelanggan baru</button>} />
      <div className="d-stats d-stats--3">
        <Stat label="Pelanggan" value={number(all.length)} />
        <Stat label="Poin beredar" value={number(all.reduce((s, c) => s + c.points, 0))} sub="kewajiban loyalitas" />
        <Stat label="Kembali > 1×" value={number(all.filter((c) => c.visits > 1).length)} sub={all.length ? `${Math.round((100 * all.filter((c) => c.visits > 1).length) / all.length)}% pelanggan` : "—"} />
      </div>
      <Panel title="Daftar pelanggan" meta={`${rows.length} ditampilkan`}
        actions={(
          <div className="crm-tools">
            <input type="search" aria-label="Cari pelanggan" placeholder="Nama atau nomor" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="d-seg" role="radiogroup" aria-label="Urutkan">
              {SORTS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)}>{l}</button>)}
            </div>
          </div>
        )}>
        <Feedback a={a} />
        {data.loading && !data.data ? <Loading /> : data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : rows.length === 0 ? (
          <Empty title="Belum ada pelanggan">Pelanggan tercatat otomatis saat nomor WhatsApp diisi di pembayaran.</Empty>
        ) : (
          <div className="d-table-wrap">
            <table className="d-table">
              <thead><tr><th scope="col">Pelanggan</th><th scope="col" className="d-num">Poin</th><th scope="col" className="d-num">Belanja</th><th scope="col" className="d-num">Kunjungan</th><th scope="col">Terakhir</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><p className="d-list__title">{c.name ?? <span className="d-muted">Tanpa nama</span>}</p><p className="d-list__meta d-mono">{c.phone}</p>{c.note && <p className="d-list__meta">{c.note}</p>}</td>
                    <td className="d-num">{number(c.points)}</td>
                    <td className="d-num">{rupiah(c.total_spent)}</td>
                    <td className="d-num">{c.visits}</td>
                    <td>{c.last_visit_at ? date(c.last_visit_at) : "—"}</td>
                    <td>
                      <div className="d-row-actions">
                        {canU && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setModal({ mode: "edit", row: c })}>Ubah</button>}
                        {canU && c.points > 0 && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setModal({ mode: "redeem", row: c })}>Tukar poin</button>}
                        {canD && <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy}
                          onClick={() => window.confirm?.(`Hapus ${c.name ?? c.phone}? Poin ikut hilang.`) !== false && a.run(() => api.remove("customers", c.id), "Pelanggan dihapus").then(data.reload)}>Hapus</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {modal && <EditModal row={modal.row} mode={modal.mode} tenantId={tenantId} onClose={() => setModal(null)} onSaved={data.reload} />}
    </>
  );
}
