import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Badge, Modal, Field, useAsync, Empty } from "../../ui/index.jsx";

const STATUS = { draft: ["Draf", "neutral"], submitted: ["Diajukan", "accent"], review: ["Ditinjau lender", "warn"], approved: ["Disetujui", "ok"], rejected: ["Ditolak", "danger"] };

function Payout() {
  const { api, role, tenantId } = useAuth();
  const r = useAsync(() => api.getPayout(tenantId), [api, tenantId]);
  const [row, setRow] = useState(null);
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => setRow(r.data ?? { tenant_id: tenantId, bank: "", account_name: "", account_last4: "", verified: false }), [r.data, tenantId]);
  if (r.loading || !row) return <Loading />;
  const editable = can(role, 19, "u");
  const save = async () => {
    setErr(null);
    if (!/^\d{4}$/.test(row.account_last4)) return setErr("Isi 4 digit terakhir nomor rekening.");
    try {
      await api.savePayout({ ...row, verified: false });
      setSaved(new Date());
      r.reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <Panel title="Rekening payout" meta={row.verified ? "Terverifikasi" : "Belum terverifikasi"}>
      <fieldset className="d-form" disabled={!editable}>
        <div className="d-form__row">
          <Field label="Bank" id="po-bank"><input id="po-bank" value={row.bank} onChange={(e) => setRow({ ...row, bank: e.target.value })} /></Field>
          <Field label="4 digit terakhir" id="po-l4" hint="Nomor lengkap diverifikasi oleh mitra pembayaran">
            <input id="po-l4" inputMode="numeric" maxLength={4} value={row.account_last4} onChange={(e) => setRow({ ...row, account_last4: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <Field label="Nama pemilik rekening" id="po-name"><input id="po-name" value={row.account_name} onChange={(e) => setRow({ ...row, account_name: e.target.value })} /></Field>
      </fieldset>
      {editable && (
        <div className="d-form__actions">
          {err && <p className="d-field__error" role="alert">{err}</p>}
          {saved && <p className="d-saved" role="status">Tersimpan, menunggu verifikasi</p>}
          <button type="button" className="d-btn d-btn--primary" onClick={save}>Simpan rekening</button>
        </div>
      )}
    </Panel>
  );
}

export default function Capital() {
  const { api, role, tenantId } = useAuth();
  const r = useAsync(() => api.listCapital(tenantId), [api, tenantId]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);

  const save = async () => {
    const amount = Number(edit.amount);
    if (!amount || amount < 1000000) return setErr("Jumlah minimal Rp 1.000.000.");
    if (!edit.purpose.trim()) return setErr("Tujuan penggunaan dana wajib diisi.");
    try {
      await api.saveCapital({ ...edit, amount, tenor_months: Number(edit.tenor_months), tenant_id: tenantId });
      setEdit(null);
      r.reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={`Fitur 19 · ${permOf(role, 19)?.label}`}
        title="Capital & payout"
        desc="Pengajuan modal kerja diteruskan ke lembaga keuangan berizin OJK berdasarkan histori omset. Keputusan kredit ada di lender."
        actions={can(role, 19, "c") && <button type="button" className="d-btn d-btn--primary" onClick={() => { setErr(null); setEdit({ amount: "", tenor_months: 12, purpose: "", status: "draft" }); }}>Ajukan modal</button>}
      />
      <div className="d-grid d-grid--wide">
        <Panel title="Pengajuan">
          {r.loading ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : r.data.length === 0 ? (
            <Empty title="Belum ada pengajuan" />
          ) : (
            <ul className="d-list">
              {r.data.map((c) => (
                <li key={c.id}>
                  <div>
                    <p className="d-list__title">{rupiah(c.amount)} · {c.tenor_months} bulan</p>
                    <p className="d-list__meta">{c.purpose} · {date(c.created_at)}</p>
                  </div>
                  <div className="d-row-actions">
                    <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                    {role === "superadmin" && ["submitted", "review"].includes(c.status) && (
                      <>
                        {c.status === "submitted" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={async () => { await api.decideCapital(c.id, "review"); r.reload(); }}>Tinjau</button>}
                        <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={async () => { await api.decideCapital(c.id, "rejected"); r.reload(); }}>Tolak</button>
                        <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={async () => { await api.decideCapital(c.id, "approved"); r.reload(); }}>Setujui</button>
                      </>
                    )}
                    {c.status === "draft" && can(role, 19, "u") && (
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => { setErr(null); setEdit({ ...c }); }}>Ubah</button>
                    )}
                    {c.status === "draft" && can(role, 19, "u") && (
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={async () => { await api.saveCapital({ id: c.id, status: "submitted", tenant_id: tenantId }); r.reload(); }}>Kirim</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Payout />
      </div>

      <Modal
        open={Boolean(edit)}
        title={edit?.id ? "Ubah pengajuan" : "Ajukan modal kerja"}
        onClose={() => setEdit(null)}
        footer={<>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => setEdit(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" onClick={save}>Simpan sebagai draf</button>
        </>}
      >
        {edit && (
          <div className="d-form">
            <div className="d-form__row">
              <Field label="Jumlah (Rp)" id="c-amt"><input id="c-amt" inputMode="numeric" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value.replace(/\D/g, "") })} autoFocus /></Field>
              <Field label="Tenor" id="c-ten">
                <select id="c-ten" value={edit.tenor_months} onChange={(e) => setEdit({ ...edit, tenor_months: e.target.value })}>
                  {[3, 6, 12, 18, 24, 36].map((n) => <option key={n} value={n}>{n} bulan</option>)}
                </select>
              </Field>
            </div>
            <Field label="Tujuan penggunaan dana" id="c-pur"><textarea id="c-pur" rows="3" value={edit.purpose} onChange={(e) => setEdit({ ...edit, purpose: e.target.value })} /></Field>
            {err && <p className="d-field__error" role="alert">{err}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
