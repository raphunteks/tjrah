import { useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Badge, Empty, Modal } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback, useIndex } from "../../ops.jsx";

const ST = { submitted: ["Menunggu validasi", "warn"], validated: ["Divalidasi", "ok"], rejected: ["Ditolak", "danger"] };

export default function Cash() {
  const { api, role, profile, tenantId } = useAuth();
  const b = useBranch();
  const scoped = Boolean(permOf(role, 12)?.scope);
  const [f, setF] = useState({ amount: "", description: "", file: null });
  const a = useAction();
  const [rej, setRej] = useState(null); // { p, reason }
  // Staff: cabangnya sendiri. GM/Owner/Superadmin: semua cabang tenant, supaya tak ada pengajuan terlewat.
  const r = useAsync(async () => {
    if (!api || (!tenantId && !b.branchId)) return null;
    const where = b.locked ? { branch_id: b.branchId } : { tenant_id: tenantId };
    const [petty, shifts] = await Promise.all([
      api.list("petty_cash", { eq: where, order: ["created_at", "desc"], limit: 80 }).catch(() => []),
      scoped ? Promise.resolve([]) : api.list("shifts", { eq: { ...where, status: "closed" }, order: ["closed_at", "desc"], limit: 30 }).catch(() => []),
    ]);
    return { petty: petty || [], shifts: shifts || [] };
  }, [api, b.branchId, tenantId, b.locked, scoped], { key: `cash@${tenantId}@${b.branchId}@${b.locked}` });
  const br = useIndex(b.all);

  const submit = () => a.run(async () => {
    let receipt_path = null;
    if (f.file && api.upload) receipt_path = await api.upload("receipts", f.file);
    await api.insert("petty_cash", { tenant_id: b.branch.tenant_id, branch_id: b.branchId, amount: Number(f.amount), description: f.description, created_by: profile.id, receipt_path: receipt_path ?? (f.file ? f.file.name : null) });
    setF({ amount: "", description: "", file: null });
    r.reload();
  }, "Pengeluaran diajukan ke GM");

  return (
    <>
      <PageHead eyebrow={`Fitur 12 · ${permOf(role, 12)?.label}`} title={scoped ? "Kas kecil" : "Kas & settlement"}
        desc="Pengeluaran tak terduga outlet dengan foto nota, divalidasi GM lalu otomatis dijurnal." actions={b.locked ? <BranchSelect b={b} /> : <div className="d-branch-badge"><i className="fa-solid fa-store" aria-hidden="true" /><span>Semua Cabang</span></div>} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : !r.data ? <Loading /> : (
        <div className="d-grid d-grid--wide">
          <div className="d-grid">
            <Panel title={scoped ? "Pengajuan saya" : "Pengajuan kas kecil"}>
              {!b.locked && <Feedback a={a} />}
              {r.data.petty.length === 0 ? <Empty title="Belum ada pengajuan" /> : (
                <ul className="d-list">{r.data.petty.map((p) => (
                  <li key={p.id}>
                    <div><p className="d-list__title">{p.description}</p><p className="d-list__meta">{rupiah(p.amount)} · {!b.locked && `${br[p.branch_id]?.name} · `}{dateTime(p.created_at)}{p.receipt_path && " · nota terlampir"}{p.status === "rejected" && p.reject_reason && ` · ditolak: ${p.reject_reason}`}</p></div>
                    {p.status === "submitted" && can(role, 12, "u") ? (
                      <div className="d-row-actions">
                        <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setRej({ p, reason: "" })}>Tolak</button>
                        <button type="button" className="d-btn d-btn--primary d-btn--sm" onClick={() => a.run(async () => { await api.rpc("validate_petty", { p_id: p.id, p_ok: true }); r.reload(); }, "Divalidasi & dijurnal")}>Validasi</button>
                      </div>
                    ) : <Badge tone={ST[p.status][1]}>{ST[p.status][0]}</Badge>}
                  </li>
                ))}</ul>
              )}
            </Panel>
            {!scoped && (
              <Panel title="Rekonsiliasi shift" meta="Selisih kas fisik vs sistem per shift">
                {r.data.shifts.length === 0 ? <Empty title="Belum ada shift ditutup" /> : (
                  <div className="d-table-wrap"><table className="d-table">
                    <thead><tr><th scope="col">Cabang</th><th scope="col">Ditutup</th><th scope="col" className="d-num">Modal</th><th scope="col" className="d-num">Tunai</th><th scope="col" className="d-num">Non-tunai</th><th scope="col" className="d-num">Dihitung</th><th scope="col" className="d-num">Selisih</th></tr></thead>
                    <tbody>{r.data.shifts.map((s) => (
                      <tr key={s.id}><td>{br[s.branch_id]?.name}</td><td>{dateTime(s.closed_at)}</td><td className="d-num">{rupiah(s.opening_cash)}</td><td className="d-num">{rupiah(s.cash_sales)}</td><td className="d-num">{rupiah(s.non_cash_sales)}</td><td className="d-num">{rupiah(s.counted_cash)}</td>
                        <td className="d-num"><Badge tone={Number(s.variance) === 0 ? "ok" : "warn"}>{rupiah(s.variance)}</Badge></td></tr>
                    ))}</tbody>
                  </table></div>
                )}
              </Panel>
            )}
          </div>
          {can(role, 12, "c") && b.locked && b.branch && (
            <Panel title="Ajukan pengeluaran">
              <div className="d-form">
                <Field label="Nominal (Rp)" id="pc-a"><input id="pc-a" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></Field>
                <Field label="Keperluan" id="pc-d"><input id="pc-d" placeholder="Es batu darurat, galon, sabun…" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
                <Field label="Foto nota (wajib)" id="pc-f" hint="Disimpan di bucket privat. Batas per pengajuan mengikuti pengaturan tenant."><input id="pc-f" type="file" accept="image/*" capture="environment" onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null })} /></Field>
                <button type="button" className="d-btn d-btn--primary" disabled={!f.amount || !f.description || !f.file || a.busy} onClick={submit}>Ajukan</button>
                <Feedback a={a} />
              </div>
            </Panel>
          )}
        </div>
      )}
      <Modal open={Boolean(rej)} title="Tolak pengajuan kas kecil" onClose={() => setRej(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setRej(null)}>Batal</button>
          <button type="button" className="d-btn d-btn--danger" disabled={a.busy || !(rej?.reason ?? "").trim()} onClick={() => a.run(async () => { await api.rpc("validate_petty", { p_id: rej.p.id, p_ok: false, p_reason: rej.reason }); setRej(null); r.reload(); }, "Pengajuan ditolak")}>Tolak</button></>}>
        {rej && <div className="d-form"><p className="d-text">{rej.p.description} · {rupiah(rej.p.amount)}</p>
          <Field label="Alasan penolakan (wajib)" id="pc-rj"><textarea id="pc-rj" rows="2" value={rej.reason} onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field></div>}
      </Modal>
    </>
  );
}
