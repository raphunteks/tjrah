import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { PageHead, Panel, Loading, ErrorNote, Modal, Field, useAsync, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback, useLive } from "../../ops.jsx";
import { qrSvg } from "../../../lib/qr.js";

const ST = { available: "Kosong", occupied: "Terisi", cooking: "Diproses dapur", reserved: "Reservasi", dirty: "Perlu dibersihkan" };

function TableQrCard({ table, tenantName }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/m/pesan?table=${table.id}&meja=${encodeURIComponent(table.label)}`;
  let svg = null;
  try {
    svg = qrSvg(url);
  } catch {
    svg = null;
  }

  return (
    <article className="table-qr-card">
      <div className="table-qr-card__brand">
        <img src="/tijarah-logo.svg" alt="Tijarah" className="table-qr-card__brand-logo" />
        <span className="table-qr-card__brand-name">{tenantName || "Tijarah Cloud"}</span>
      </div>
      <span className="table-qr-card__badge">E-Menu & Self Order</span>
      <h3 className="table-qr-card__title">Meja {table.label}</h3>
      <p className="table-qr-card__area">{table.area} · Kapasitas {table.seats} Kursi</p>
      {svg ? (
        <div className="table-qr-card__qr">
          <svg viewBox={`0 0 ${svg.size} ${svg.size}`} width="170" height="170" shapeRendering="crispEdges">
            <path d={svg.d} fill="#0B5D4B" />
          </svg>
        </div>
      ) : (
        <p className="d-field__error">Gagal menghasilkan QR</p>
      )}
      <p className="table-qr-card__instruct">Pindai kamera untuk membuka menu & pesan seketika dari meja</p>
      <p className="table-qr-card__link">{url}</p>
    </article>
  );
}

export default function Floor() {
  const { api, role, tenant } = useAuth();
  const b = useBranch();
  const r = useAsync(() => (!api || !b.branchId ? null : api.list("tables", { eq: { branch_id: b.branchId }, order: ["sort"] }).catch(() => [])), [api, b.branchId], { key: b.branchId ? `floor@${b.branchId}` : null });
  useLive(["tables"], r.reload);
  const [edit, setEdit] = useState(null);
  const [qrView, setQrView] = useState(null); // null | table object | "ALL"
  const a = useAction();
  const save = () => a.run(async () => {
    const { id, ...row } = edit;
    if (id) await api.update("tables", id, { label: row.label, area: row.area, seats: Number(row.seats), status: row.status });
    else await api.insert("tables", { ...row, seats: Number(row.seats), tenant_id: b.branch.tenant_id, branch_id: b.branchId, sort: (r.data?.length ?? 0) + 1 });
    setEdit(null);
    r.reload();
  });
  const areas = [...new Set((r.data ?? []).map((t) => t.area))];
  const tables = r.data ?? [];

  return (
    <>
      <PageHead
        eyebrow="Fitur 7 · Denah meja, kiosk & QR e-menu"
        title="Denah meja"
        desc="Susun area (lantai, outdoor, VIP) dan meja. Cetak stiker QR untuk pemesanan mandiri oleh tamu dari meja."
        actions={
          <>
            {tables.length > 0 && (
              <button type="button" className="d-btn d-btn--ghost" onClick={() => setQrView("ALL")}>
                Cetak Stiker Meja ({tables.length})
              </button>
            )}
            {can(role, 7, "c") && (
              <button type="button" className="d-btn d-btn--primary" onClick={() => setEdit({ label: "", area: areas[0] ?? "Lantai 1", seats: 4, status: "available" })}>
                Tambah meja
              </button>
            )}
            <BranchSelect b={b} />
          </>
        }
      />

      {b.loading || (r.loading && !r.data) ? (
        <Loading />
      ) : b.error || r.error ? (
        <ErrorNote error={b.error || r.error} onRetry={() => { b.reload?.(); r.reload(); }} />
      ) : !b.branchId ? (
        <Empty title="Pilih Cabang Operasional">
          {b.options.length === 0
            ? "Belum ada cabang terdaftar untuk toko Anda. Silakan tambahkan cabang di Pengaturan Toko terlebih dahulu."
            : "Silakan pilih lokasi cabang di pemilih lokasi atas untuk menampilkan denah meja."}
        </Empty>
      ) : !r.data ? (
        <Loading />
      ) : tables.length === 0 ? (
        <Empty title="Belum Ada Meja">
          Belum ada denah meja untuk cabang ini. Tambahkan meja baru untuk mulai mengatur tata letak ruangan.
        </Empty>
      ) : (
        areas.map((area) => (
        <Panel key={area} title={area}>
          <ul className="pos-floor pos-floor--wide">
            {tables.filter((t) => t.area === area).map((t) => (
              <li key={t.id}>
                <button type="button" className={`pos-table st--${t.status}`} onClick={() => can(role, 7, "u") && setEdit({ ...t })}>
                  <span className="pos-table__no">{t.label}</span>
                  <span className="pos-table__st">{ST[t.status]} · {t.seats} kursi</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )))}

      {/* MODAL EDIT / TAMBAH MEJA */}
      <Modal
        open={Boolean(edit)}
        title={edit?.id ? `Meja ${edit.label}` : "Tambah meja"}
        onClose={() => setEdit(null)}
        footer={
          <>
            {edit?.id && (
              <button type="button" className="d-btn d-btn--ghost" onClick={() => { setQrView(edit); setEdit(null); }}>
                Lihat Stiker QR
              </button>
            )}
            {edit?.id && can(role, 7, "d") && (
              <button type="button" className="d-btn d-btn--danger-ghost" onClick={() => a.run(async () => { await api.remove("tables", edit.id); setEdit(null); r.reload(); })}>
                Hapus meja
              </button>
            )}
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>Batal</button>
            <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !edit?.label} onClick={save}>Simpan</button>
          </>
        }
      >
        {edit && (
          <div className="d-form">
            <div className="d-form__row d-form__row--3">
              <Field label="Nomor" id="fl-l"><input id="fl-l" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
              <Field label="Area" id="fl-a"><input id="fl-a" list="fl-areas" value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value })} /><datalist id="fl-areas">{["Lantai 1", "Lantai 2", "Outdoor", "Area merokok", "VIP", ...areas].map((x) => <option key={x} value={x} />)}</datalist></Field>
              <Field label="Kursi" id="fl-s"><input id="fl-s" type="number" min="1" value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: e.target.value })} /></Field>
            </div>
            {edit.id && <Field label="Status" id="fl-st"><select id="fl-st" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
            <Feedback a={a} />
          </div>
        )}
      </Modal>

      {/* MODAL CETAK STIKER QR MEJA */}
      <Modal
        open={Boolean(qrView)}
        title={qrView === "ALL" ? `Stiker QR Semua Meja (${tables.length})` : qrView ? `Stiker QR Meja ${qrView.label}` : ""}
        onClose={() => setQrView(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--primary" onClick={() => window.print()}>
              Cetak Stiker (Print / PDF)
            </button>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setQrView(null)}>
              Tutup
            </button>
          </>
        }
      >
        {qrView && (
          <div>
            <p className="d-text d-muted" style={{ marginBottom: "var(--space-md)" }}>
              Stiker ini dapat ditempel di meja fisik atau dipasang pada standee akrilik. Tamu cukup memindai dengan kamera ponsel untuk memesan mandiri.
            </p>
            {qrView === "ALL" ? (
              <div className="table-qr-grid">
                {tables.map((t) => (
                  <TableQrCard key={t.id} table={t} tenantName={tenant?.name} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <TableQrCard table={qrView} tenantName={tenant?.name} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
