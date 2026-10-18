import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback, useLive, useIndex } from "../../ops.jsx";

const KINDS = [["open", "Buka toko"], ["close", "Tutup toko"], ["handover", "Serah terima shift"]];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "butir";
const toText = (items) => (items ?? []).map((i) => `${i.label}${i.required === false ? " ?" : ""}`).join("\n");
const fromText = (t) => {
  const seen = new Set();
  return t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const opt = /\s\?$/.test(l); const label = l.replace(/\s\?$/, "").trim();
    let key = slug(label); while (seen.has(key)) key += "_x"; seen.add(key);
    return { key, label, required: !opt };
  });
};

function Fill({ shift, tpl, kind, done, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [ans, setAns] = useState(done?.answers ?? {});
  const [note, setNote] = useState(done?.note ?? "");
  const items = tpl?.items ?? [];
  const miss = items.filter((i) => i.required !== false && !ans[i.key]).length;
  return (
    <div className="d-form">
      {items.length === 0 && <p className="d-text d-muted">Belum ada butir untuk jenis ini; GM/Owner dapat menambahkannya di bawah.</p>}
      <ul className="d-checks">{items.map((i) => (
        <li key={i.key}><label className="d-check"><input type="checkbox" checked={Boolean(ans[i.key])} onChange={(e) => setAns({ ...ans, [i.key]: e.target.checked })} /> {i.label}{i.required === false && <span className="d-muted"> (opsional)</span>}</label></li>
      ))}</ul>
      <Field label={kind === "handover" ? "Catatan serah terima (min. 10 karakter)" : "Catatan"} id={`cl-note-${kind}`}>
        <textarea id={`cl-note-${kind}`} rows="2" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="d-form__actions">
        <button type="button" className="d-btn d-btn--primary" disabled={a.busy || miss > 0} onClick={() => a.run(async () => { await api.rpc("submit_checklist", { p_shift: shift.id, p_kind: kind, p_answers: ans, p_note: note.trim() || null }); onSaved(); }, "Checklist tersimpan")}>
          {done ? "Perbarui" : "Kirim"} {miss > 0 && `(${miss} butir wajib belum)`}
        </button>
        {done && <Badge tone="ok">Terkirim {dateTime(done.created_at)}</Badge>}
      </div>
      <Feedback a={a} />
    </div>
  );
}

function TemplateEditor({ kind, label, tpl, onSaved }) {
  const { api } = useAuth();
  const a = useAction();
  const [t, setT] = useState(toText(tpl?.items));
  return (
    <div className="d-form">
      <Field label={`${label} — satu butir per baris (akhiri " ?" bila opsional)`} id={`tp-${kind}`}>
        <textarea id={`tp-${kind}`} rows="4" value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
      <div className="d-form__actions">
        <button type="button" className="d-btn d-btn--ghost" disabled={a.busy} onClick={() => a.run(async () => { await api.rpc("save_checklist_template", { p_branch: null, p_kind: kind, p_items: fromText(t), p_active: true }); onSaved(); }, "Template disimpan")}>Simpan template</button>
      </div>
      <Feedback a={a} />
    </div>
  );
}

export default function Checklist() {
  const { api, role, tenantId, profile } = useAuth();
  const [kind, setKind] = useState("open");
  const q = useAsync(async () => {
    const [shifts, tpls, done, people] = await Promise.all([
      api.list("shifts", { eq: { tenant_id: tenantId }, order: ["opened_at", "desc"], limit: 30 }).catch(() => []),
      api.list("checklist_templates", { eq: { tenant_id: tenantId } }),
      api.list("shift_checklists", { eq: { tenant_id: tenantId }, order: ["created_at", "desc"], limit: 50 }),
      api.list("profiles", { eq: { tenant_id: tenantId } }).catch(() => []),
    ]);
    return { shifts, tpls, done, people };
  }, [api, tenantId]);
  useLive(["shifts", "shift_checklists", "checklist_templates"], q.reload);
  const ppl = useIndex(q.data?.people);
  const shift = useMemo(() => {
    const open = (q.data?.shifts ?? []).filter((s) => s.status === "open");
    return open.find((s) => s.cashier_id === profile?.id) ?? open[0] ?? null;
  }, [q.data, profile?.id]);
  const tplOf = (k) => (q.data?.tpls ?? []).filter((x) => x.kind === k && x.active && (!x.branch_id || x.branch_id === shift?.branch_id)).sort((a, b) => (b.branch_id ? 1 : 0) - (a.branch_id ? 1 : 0))[0];
  const canEdit = ["owner", "gm"].includes(role) && can(role, 13, "u");
  const canFill = can(role, 5, "c");
  return (
    <>
      <PageHead eyebrow="Fitur 5 · Checklist shift" title="Checklist buka, tutup & serah terima" desc="Shift tidak bisa ditutup sebelum butir wajib checklist tutup terpenuhi (bila diwajibkan di pengaturan tenant)." />
      {q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : (
        <div className="d-grid">
          {canFill && (
            <Panel title={shift ? `Shift berjalan · ${ppl[shift.cashier_id]?.full_name ?? "kasir"}` : "Isi checklist"}>
              {!shift ? <Empty title="Tidak ada shift terbuka">Buka shift di halaman Shift & Z-Report terlebih dahulu.</Empty> : (
                <>
                  <div className="d-chips" role="group" aria-label="Jenis checklist">
                    {KINDS.map(([k, l]) => <button key={k} type="button" className={`d-chip${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
                  </div>
                  <Fill key={`${shift.id}-${kind}`} shift={shift} tpl={tplOf(kind)} kind={kind} done={q.data.done.find((d) => d.shift_id === shift.id && d.kind === kind)} onSaved={q.reload} />
                </>
              )}
            </Panel>
          )}
          {canEdit && (
            <Panel title="Template (seluruh cabang)">
              {KINDS.map(([k, l]) => <TemplateEditor key={`${k}-${tplOf(k)?.id ?? 0}`} kind={k} label={l} tpl={(q.data.tpls ?? []).find((x) => x.kind === k && !x.branch_id)} onSaved={q.reload} />)}
            </Panel>
          )}
          <Panel title="Riwayat pengisian">
            {q.data.done.length === 0 ? <Empty title="Belum ada checklist terkirim" /> : (
              <ul className="d-list">{q.data.done.map((d) => (
                <li key={d.id}><div className="d-list__title">{KINDS.find((k) => k[0] === d.kind)?.[1]} <span className="d-muted">· {ppl[d.submitted_by]?.full_name ?? "—"}</span></div>
                  <div className="d-list__meta">{dateTime(d.created_at)} · {Object.values(d.answers ?? {}).filter(Boolean).length} butir dicentang{d.note ? ` · ${d.note}` : ""}</div></li>
              ))}</ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
