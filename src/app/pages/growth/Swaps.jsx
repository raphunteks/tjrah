import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { iso, date } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive } from "../../ops.jsx";

const ST = { requested: ["Menunggu rekan", "warn"], accepted: ["Menunggu GM", "warn"], declined: ["Ditolak rekan", "neutral"], approved: ["Disetujui", "ok"], rejected: ["Ditolak GM", "danger"], cancelled: ["Dibatalkan", "neutral"] };
const sh = (w) => (w ? `${date(w.work_date)} · ${String(w.start_time).slice(0, 5)}–${String(w.end_time).slice(0, 5)}` : "tanpa imbalan (serah-terima)");

function Request({ mine, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [f, setF] = useState({ shift: "", target: "", their: "", reason: "" });
  const cand = useAsync(() => (f.shift ? api.rpc("swap_candidates", { p_my_shift: f.shift }) : Promise.resolve([])), [api, f.shift]);
  const tg = (cand.data ?? []).find((c) => c.profile_id === f.target);
  return (
    <Panel title="Ajukan tukar shift">
      {mine.length === 0 ? <Empty title="Tidak ada shift mendatang">Hanya shift yang belum berlangsung yang bisa ditukar.</Empty> : (
        <div className="d-form">
          <Field label="Shift saya" id="sw-my"><select id="sw-my" value={f.shift} onChange={(e) => setF({ shift: e.target.value, target: "", their: "", reason: f.reason })}><option value="">Pilih shift…</option>{mine.map((w) => <option key={w.id} value={w.id}>{sh(w)}</option>)}</select></Field>
          <Field label="Rekan tujuan" id="sw-tg" hint="Seperan dan di cabang yang sama.">
            <select id="sw-tg" value={f.target} disabled={!f.shift} onChange={(e) => setF({ ...f, target: e.target.value, their: "" })}><option value="">Pilih rekan…</option>{(cand.data ?? []).map((c) => <option key={c.profile_id} value={c.profile_id}>{c.full_name}</option>)}</select>
          </Field>
          <Field label="Shift rekan yang diambil" id="sw-their" hint="Kosongkan bila hanya menyerahkan shift Anda.">
            <select id="sw-their" value={f.their} disabled={!tg} onChange={(e) => setF({ ...f, their: e.target.value })}><option value="">Tanpa imbalan</option>{(tg?.shifts ?? []).map((w) => <option key={w.id} value={w.id}>{sh(w)}</option>)}</select>
          </Field>
          <Field label="Alasan (min. 5 karakter)" id="sw-why"><textarea id="sw-why" rows="2" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <div className="d-form__actions"><button type="button" className="d-btn d-btn--primary" disabled={a.busy || !f.shift || !f.target || f.reason.trim().length < 5}
            onClick={() => a.run(async () => { await api.rpc("request_swap", { p_my_shift: f.shift, p_target: f.target, p_their_shift: f.their || null, p_reason: f.reason.trim() }); setF({ shift: "", target: "", their: "", reason: "" }); onSaved(); }, "Permintaan dikirim ke rekan")}>Kirim permintaan</button></div>
          <Feedback a={a} />
        </div>
      )}
    </Panel>
  );
}

export default function Swaps() {
  const { api, role, profile, tenantId } = useAuth();
  const [note, setNote] = useState({});
  const a = useAction();
  const q = useAsync(async () => {
    const [swaps, ws] = await Promise.all([api.rpc("my_swaps"), api.list("work_shifts", { eq: { tenant_id: tenantId } }).catch(() => [])]);
    return { swaps, ws };
  }, [api, tenantId]);
  useLive(["shift_swaps", "work_shifts"], q.reload);
  const today = iso(new Date());
  const mine = useMemo(() => (q.data?.ws ?? []).filter((w) => w.profile_id === profile?.id && w.work_date > today).sort((x, y) => x.work_date.localeCompare(y.work_date)), [q.data, profile?.id, today]);
  const isMgr = ["owner", "gm"].includes(role) && can(role, 13, "u");
  const act = (fn, msg) => a.run(async () => { await fn(); q.reload(); }, msg);
  const incoming = (q.data?.swaps ?? []).filter((s) => s.target_id === profile?.id && s.status === "requested");
  const outgoing = (q.data?.swaps ?? []).filter((s) => s.requester_id === profile?.id);
  const toDecide = isMgr ? (q.data?.swaps ?? []).filter((s) => s.status === "accepted") : [];
  return (
    <>
      <PageHead eyebrow="Fitur 13 · Tukar shift" title="Tukar shift" desc="Alur dua tahap: rekan menerima, lalu GM menyetujui. Sistem menolak bila bentrok jam atau shift sudah lewat; jadwal baru bertukar setelah GM menyetujui." />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
        <div className="d-grid">
          {["staff", "dokter", "gm"].includes(role) && <Request mine={mine} onSaved={q.reload} />}
          <Panel title="Menunggu jawaban saya">
            {incoming.length === 0 ? <Empty title="Tidak ada permintaan masuk" /> : (
              <ul className="d-list">{incoming.map((s) => (
                <li key={s.id}><div className="d-list__title">{s.requester} ingin menukar</div>
                  <div className="d-list__meta">Shift {s.requester}: {sh(s.my_shift)} ⇄ shift Anda: {sh(s.their_shift)} · “{s.reason}”</div>
                  <div className="d-row-actions"><button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => act(() => api.rpc("respond_swap", { p_swap: s.id, p_accept: true }), "Diterima; menunggu persetujuan GM")}>Terima</button>
                    <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => act(() => api.rpc("respond_swap", { p_swap: s.id, p_accept: false }), "Ditolak")}>Tolak</button></div></li>
              ))}</ul>
            )}
          </Panel>
          {isMgr && (
            <Panel title="Menunggu persetujuan GM/Owner">
              {toDecide.length === 0 ? <Empty title="Tidak ada yang menunggu" /> : (
                <ul className="d-list">{toDecide.map((s) => (
                  <li key={s.id}><div className="d-list__title">{s.requester} ⇄ {s.target}</div>
                    <div className="d-list__meta">{sh(s.my_shift)} ⇄ {sh(s.their_shift)} · “{s.reason}”</div>
                    <div className="d-row-actions">
                      <input className="d-cell-input" aria-label={`Catatan ${s.requester}`} placeholder="Catatan (wajib bila menolak)" value={note[s.id] ?? ""} onChange={(e) => setNote({ ...note, [s.id]: e.target.value })} />
                      <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy} onClick={() => act(() => api.rpc("decide_swap", { p_swap: s.id, p_approve: true, p_note: note[s.id] || null }), "Disetujui; jadwal bertukar")}>Setujui</button>
                      <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" disabled={a.busy} onClick={() => act(() => api.rpc("decide_swap", { p_swap: s.id, p_approve: false, p_note: note[s.id] || null }), "Ditolak")}>Tolak</button></div></li>
                ))}</ul>
              )}
            </Panel>
          )}
          <Panel title={isMgr ? "Semua permintaan" : "Permintaan saya"}>
            {(isMgr ? q.data.swaps : outgoing).length === 0 ? <Empty title="Belum ada permintaan" /> : (
              <ul className="d-list">{(isMgr ? q.data.swaps : outgoing).map((s) => (
                <li key={s.id}><div className="d-list__title">{s.requester} → {s.target} <Badge tone={ST[s.status][1]}>{ST[s.status][0]}</Badge></div>
                  <div className="d-list__meta">{sh(s.my_shift)} ⇄ {sh(s.their_shift)}{s.decision_note ? ` · catatan: ${s.decision_note}` : ""}</div>
                  {s.requester_id === profile?.id && ["requested", "accepted"].includes(s.status) && <div className="d-row-actions"><button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy} onClick={() => act(() => api.rpc("cancel_swap", { p_swap: s.id }), "Dibatalkan")}>Batalkan</button></div>}</li>
              ))}</ul>
            )}
            <Feedback a={a} />
          </Panel>
        </div>
      )}
    </>
  );
}
