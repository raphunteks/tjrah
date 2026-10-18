import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { useRouter } from "../../../lib/router.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { SEX, ageFrom, isValidTooth, allergyState } from "../../../lib/clinic.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, Field, useAsync } from "../../ui/index.jsx";
import { useLive, useAction, Feedback, useNow, minutesSince } from "../../ops.jsx";
import Odontogram from "./Odontogram.jsx";
import IcdPicker from "./IcdPicker.jsx";
import { SatusehatBadge, FhirViewer, VisitHistory } from "./shared.jsx";

const TABS = [["soap", "SOAP"], ["odonto", "Odontogram"], ["dx", "Diagnosis & tindakan"], ["rx", "E-resep"], ["tutup", "Tutup kunjungan"]];
const SIGNA = ["3×1 sesudah makan", "2×1 sesudah makan", "1×1 sesudah makan", "3×1 bila nyeri", "Kumur 2×sehari, 15 ml"];

function Soap({ visit, onSaved }) {
  const { api } = useAuth();
  const [f, setF] = useState(() => ({ subjective: visit.subjective ?? "", objective: visit.objective ?? "", assessment: visit.assessment ?? "", plan: visit.plan ?? "",
    td: visit.vitals?.td ?? "", nadi: visit.vitals?.nadi ?? "", suhu: visit.vitals?.suhu ?? "" }));
  const a = useAction();
  const dirty = ["subjective", "objective", "assessment", "plan"].some((k) => (visit[k] ?? "") !== f[k])
    || ["td", "nadi", "suhu"].some((k) => (visit.vitals?.[k] ?? "") !== f[k]);
  const save = () => a.run(async () => {
    await api.update("visits", visit.id, { subjective: f.subjective, objective: f.objective, assessment: f.assessment, plan: f.plan,
      vitals: { ...(visit.vitals ?? {}), td: f.td, nadi: f.nadi, suhu: f.suhu } });
    onSaved();
  }, "SOAP tersimpan");
  const T = (k, label, hint) => (
    <Field label={label} id={`soap-${k}`} hint={hint}>
      <textarea id={`soap-${k}`} rows="3" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="d-form">
      {T("subjective", "S · Subjektif (keluhan & anamnesis)", "Keluhan utama dari registrasi terisi otomatis.")}
      <div className="d-form__row d-form__row--3">
        <Field label="Tekanan darah" id="v-td"><input id="v-td" placeholder="120/80" value={f.td} onChange={(e) => setF({ ...f, td: e.target.value })} /></Field>
        <Field label="Nadi (×/mnt)" id="v-n"><input id="v-n" inputMode="numeric" value={f.nadi} onChange={(e) => setF({ ...f, nadi: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Suhu (°C)" id="v-s"><input id="v-s" inputMode="decimal" value={f.suhu} onChange={(e) => setF({ ...f, suhu: e.target.value.replace(/[^\d.,]/g, "") })} /></Field>
      </div>
      {T("objective", "O · Objektif (pemeriksaan klinis)")}
      {T("assessment", "A · Asesmen", "Diagnosis berkode tetap diisi di tab Diagnosis & tindakan.")}
      {T("plan", "P · Rencana")}
      <Feedback a={a} />
      <div className="d-form__actions">
        {dirty && <span className="d-muted d-text">Ada perubahan belum disimpan</span>}
        <button type="button" className="d-btn d-btn--primary" disabled={a.busy || !dirty} onClick={save}>Simpan SOAP</button>
      </div>
    </div>
  );
}

function DxPx({ visit, dx, px, products, tenantId, reload }) {
  const { api } = useAuth();
  const a = useAction();
  const [tooth, setTooth] = useState("");
  const tarif = products.filter((p) => p.category === "Tindakan");
  const addDx = (r) => a.run(() => api.insert("visit_diagnoses", { tenant_id: tenantId, visit_id: visit.id, system: "icd10", code: r.code, display: r.display, is_primary: dx.length === 0 }), `${r.code} ditambahkan`).then(reload);
  const addPx = (r) => {
    const t = tooth ? Number(tooth) : null;
    if (t && !isValidTooth(t)) { a.setError("Nomor gigi bukan notasi FDI (11–48 atau 51–85)"); return false; }
    const pr = tarif.find((p) => p.icd9_code === r.code);
    a.run(() => api.insert("visit_procedures", { tenant_id: tenantId, visit_id: visit.id, system: "icd9cm", code: r.code, display: r.display, tooth: t, product_id: pr?.id ?? null, qty: 1 }),
      pr ? `${r.code} · ditagihkan ${pr.name} ${rupiah(pr.price)}` : `${r.code} dicatat (belum ada tarif, tidak ditagihkan)`).then(() => { setTooth(""); reload(); });
  };
  return (
    <div className="dx-grid">
      <section aria-labelledby="dx-h">
        <h3 id="dx-h" className="dx-h">Diagnosis ICD-10</h3>
        <IcdPicker system="icd10" label="Tambah diagnosis" onPick={addDx} disabled={a.busy} />
        {dx.length === 0 ? <p className="d-text d-muted">Minimal satu diagnosis untuk menutup kunjungan.</p> : (
          <ul className="d-list">
            {dx.map((d) => (
              <li key={d.id}>
                <div><p className="d-list__title"><span className="d-mono">{d.code}</span> {d.display}</p>{d.is_primary && <Badge tone="accent">Utama</Badge>}</div>
                <div className="d-row-actions">
                  {!d.is_primary && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => a.run(() => api.update("visit_diagnoses", d.id, { is_primary: true })).then(reload)}>Jadikan utama</button>}
                  <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" aria-label={`Hapus ${d.code}`} onClick={() => a.run(() => api.remove("visit_diagnoses", d.id)).then(reload)}>Hapus</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="px-h">
        <h3 id="px-h" className="dx-h">Tindakan ICD-9-CM</h3>
        <div className="px-add">
          <label className="d-switch"><span className="d-switch__label">Gigi (FDI)</span>
            <input className="px-tooth d-mono" inputMode="numeric" maxLength={2} placeholder="—" value={tooth} onChange={(e) => { setTooth(e.target.value.replace(/\D/g, "")); a.setError(null); }}
              aria-invalid={tooth.length === 2 && !isValidTooth(Number(tooth))} /></label>
          <IcdPicker system="icd9cm" label="Tambah tindakan" onPick={addPx} disabled={a.busy} />
        </div>
        {px.length === 0 ? <p className="d-text d-muted">Tindakan bertarif otomatis masuk tagihan kasir.</p> : (
          <ul className="d-list">
            {px.map((p) => {
              const pr = products.find((x) => x.id === p.product_id);
              return (
                <li key={p.id}>
                  <div><p className="d-list__title"><span className="d-mono">{p.code}</span> {p.display}{p.tooth ? ` · gigi ${p.tooth}` : ""}</p>
                    <p className="d-list__meta">{pr ? `${pr.name} · ${rupiah(pr.price)}` : "Tanpa tarif"}</p></div>
                  <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" aria-label={`Hapus ${p.code}`} onClick={() => a.run(() => api.remove("visit_procedures", p.id)).then(reload)}>Hapus</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Feedback a={a} />
    </div>
  );
}

function Rx({ rx, items, products, patient, tenantId, reload }) {
  const { api } = useAuth();
  const a = useAction();
  const drugs = products.filter((p) => p.category === "Obat" && p.is_available);
  const [f, setF] = useState({ product: "", qty: 10, signa: SIGNA[0], days: 3 });
  const add = (e) => {
    e.preventDefault();
    const pr = drugs.find((p) => p.id === f.product);
    a.run(() => api.insert("prescription_items", { tenant_id: tenantId, prescription_id: rx.id, product_id: pr.id, name: pr.name, qty: Number(f.qty), signa: f.signa, days: Number(f.days) || null }),
      `${pr.name} ditambahkan`).then(() => { setF({ ...f, product: "" }); reload(); });
  };
  return (
    <div className="d-form">
      {allergyState(patient.allergies) === "yes" && <p className="d-note d-note--warn"><strong>Alergi:</strong> {patient.allergies}. Periksa ulang sebelum meresepkan.</p>}
      {allergyState(patient.allergies) === "unknown" && <p className="d-note">Riwayat alergi belum ditanyakan.</p>}
      <form className="rx-add" onSubmit={add}>
        <Field label="Obat" id="rx-p">
          <select id="rx-p" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
            <option value="">Pilih obat…</option>
            {drugs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Jumlah" id="rx-q"><input id="rx-q" type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Aturan pakai (signa)" id="rx-s">
          <input id="rx-s" list="rx-signa" value={f.signa} onChange={(e) => setF({ ...f, signa: e.target.value })} />
          <datalist id="rx-signa">{SIGNA.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Hari" id="rx-d"><input id="rx-d" type="number" min="1" max="90" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
        <button type="submit" className="d-btn d-btn--primary d-self-end" disabled={a.busy || !f.product || !(f.qty > 0) || !f.signa.trim() || rx.status !== "draft"}>Tambah</button>
      </form>
      {items.length === 0 ? <p className="d-text d-muted">Resep kosong. Kunjungan tanpa obat tetap bisa ditutup.</p> : (
        <ul className="d-list">
          {items.map((i) => (
            <li key={i.id}>
              <div><p className="d-list__title">R/ {i.name} · {Number(i.qty)}</p><p className="d-list__meta">S. {i.signa}{i.days ? ` · ${i.days} hari` : ""}</p></div>
              <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" aria-label={`Hapus ${i.name}`} onClick={() => a.run(() => api.remove("prescription_items", i.id)).then(reload)}>Hapus</button>
            </li>
          ))}
        </ul>
      )}
      <Feedback a={a} />
    </div>
  );
}

function CloseVisit({ visit, dx, px, items, products, onClosed }) {
  const { api } = useAuth();
  const a = useAction();
  const kons = products.find((p) => p.sku === "KNS-01" && p.is_available);
  const lines = [
    ...(kons ? [[kons.name, 1, kons.price]] : []),
    ...px.filter((p) => p.product_id).map((p) => { const pr = products.find((x) => x.id === p.product_id); return [pr?.name ?? p.code, 1, pr?.price ?? 0]; }),
    ...items.map((i) => [i.name, Math.ceil(Number(i.qty)), products.find((x) => x.id === i.product_id)?.price ?? 0]),
  ];
  const total = lines.reduce((s, [, q, p]) => s + q * p, 0);
  const checks = [
    ["Anamnesis (S) terisi", Boolean(visit.subjective?.trim())],
    ["Asesmen (A) terisi", Boolean(visit.assessment?.trim())],
    ["Minimal satu diagnosis ICD-10", dx.length > 0],
  ];
  const ready = checks.every(([, ok]) => ok);
  const close = () => a.run(async () => { const r = await api.rpc("close_visit", { p_visit: visit.id }); onClosed(r); return r; });
  return (
    <div className="d-grid d-grid--2">
      <div className="d-form">
        <ul className="close-checks">
          {checks.map(([l, ok]) => <li key={l} className={ok ? "is-ok" : "is-miss"}><span aria-hidden="true">{ok ? "✓" : "•"}</span> {l}<span className="sr-only">{ok ? " (lengkap)" : " (belum)"}</span></li>)}
        </ul>
        <p className="d-text d-muted">Setelah ditutup, rekam medis terkunci. E-resep dan tagihan terbit ke kasir; encounter langsung diantrekan ke SATUSEHAT tanpa menunggu pelunasan.</p>
        <Feedback a={a} />
        <button type="button" className="d-btn d-btn--primary" disabled={!ready || a.busy} onClick={close}>{a.busy ? "Menutup…" : "Tutup kunjungan & terbitkan"}</button>
      </div>
      <div>
        <p className="d-nav__label">Perkiraan tagihan</p>
        <ul className="pos-lines">
          {lines.map(([n, q, p], i) => <li key={i}><span>{q}× {n}</span><span /><span className="d-num">{rupiah(q * p)}</span></li>)}
        </ul>
        <dl className="pos-sum"><div className="is-total"><dt>Total (tanpa pajak)</dt><dd>{rupiah(total)}</dd></div></dl>
      </div>
    </div>
  );
}

function Waiting({ onStart, busy }) {
  const { api } = useAuth();
  const now = useNow(30000);
  const q = useAsync(() => api.list("queue_entries", { eq: { kind: "clinic" }, order: ["scheduled_at"] }), [api]);
  useLive(["queue_entries"], q.reload);
  const rows = (q.data ?? []).filter((r) => ["waiting", "called"].includes(r.status) && r.scheduled_at.slice(0, 10) === new Date().toISOString().slice(0, 10));
  return q.loading && !q.data ? <Loading /> : q.error ? <ErrorNote error={q.error} onRetry={q.reload} /> : rows.length === 0 ? <Empty title="Tidak ada pasien menunggu">Pasien muncul di sini setelah Staff mendaftarkannya di antrean.</Empty> : (
    <ul className="d-list">
      {rows.map((r) => (
        <li key={r.id}>
          <div><p className="d-list__title"><span className="d-mono">{String(r.queue_no).padStart(3, "0")}</span> {r.name}</p>
            <p className="d-list__meta">{SEX[r.sex]}, {ageFrom(r.birth_date)} th · menunggu {minutesSince(r.created_at, now)} mnt{r.complaint ? ` · ${r.complaint}` : ""}</p></div>
          <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={busy} onClick={() => onStart(r)}>Periksa</button>
        </li>
      ))}
    </ul>
  );
}

export default function Exam() {
  const { api, profile, role, tenantId } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState("soap");
  const [closed, setClosed] = useState(null);
  const a = useAction();
  const body = useRef(null);

  const data = useAsync(async () => {
    const open = (await api.list("visits", { eq: { status: "in_progress" }, order: ["started_at", "desc"] }))
      .filter((v) => role !== "dokter" || v.practitioner_id === profile.id);
    const v = open[0];
    const products = await api.list("products", { order: ["name"] });
    if (!v) return { v: null, products };
    const [patients, odo, dx, px, rxs, history] = await Promise.all([
      api.list("patients", { eq: { id: v.patient_id } }),
      api.list("odontogram_entries", { eq: { patient_id: v.patient_id }, order: ["created_at"] }),
      api.list("visit_diagnoses", { eq: { visit_id: v.id }, order: ["created_at"] }),
      api.list("visit_procedures", { eq: { visit_id: v.id }, order: ["created_at"] }),
      api.list("prescriptions", { eq: { visit_id: v.id } }),
      api.list("visits", { eq: { patient_id: v.patient_id, status: "closed" }, order: ["started_at", "desc"], limit: 5 }),
    ]);
    const rx = rxs[0];
    const items = rx ? await api.list("prescription_items", { eq: { prescription_id: rx.id }, order: ["created_at"] }) : [];
    return { v, patient: patients[0], odo, dx, px, rx, items, products, history };
  }, [api, profile.id, role]);
  useLive(["visits", "odontogram_entries", "visit_diagnoses", "visit_procedures", "prescription_items", "patients"], data.reload);

  const d = data.data;
  useGSAP(() => {
    if (prefersReducedMotion() || !body.current) return;
    gsap.fromTo(body.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out", clearProps: "transform" });
  }, { dependencies: [tab, d?.v?.id], scope: body });

  const start = (r) => a.run(async () => { await api.rpc("start_visit", { p_queue: r.id }); setClosed(null); setTab("soap"); await data.reload(); });
  const canWrite = can(role, 17, "u");

  if (data.loading && !d) return <><PageHead eyebrow="Fitur 17 · Rekam medis elektronik" title="Pemeriksaan" /><Loading /></>;
  if (data.error) return <><PageHead eyebrow="Fitur 17 · Rekam medis elektronik" title="Pemeriksaan" /><ErrorNote error={data.error} onRetry={data.reload} /></>;

  if (!d.v) {
    return (
      <>
        <PageHead eyebrow="Fitur 17 · Rekam medis elektronik" title="Pemeriksaan" desc="Mulai pemeriksaan dari antrean. Kartu rekam medis dibuat atau ditautkan otomatis dari NIK." />
        {closed && <ClosedSummary r={closed} onDone={() => setClosed(null)} />}
        <Panel title="Pasien menunggu">
          <Feedback a={a} />
          <Waiting onStart={start} busy={a.busy} />
        </Panel>
      </>
    );
  }

  const { v, patient } = d;
  const reload = data.reload;
  return (
    <>
      <PageHead eyebrow="Fitur 17 · Rekam medis elektronik" title={patient.name}
        desc={`${patient.mrn} · ${SEX[patient.sex] ?? "—"}, ${ageFrom(patient.birth_date) ?? "?"} th · mulai ${dateTime(v.started_at)}`}
        actions={<button type="button" className="d-btn d-btn--ghost" onClick={() => navigate("/app/antrean")}>Ke antrean</button>} />
      <Allergy patient={patient} canWrite={canWrite} reload={reload} />
      <div className="d-seg exam-tabs" role="tablist" aria-label="Bagian rekam medis">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-checked={tab === k} onClick={() => setTab(k)}>
            {l}{k === "dx" && d.dx.length > 0 ? ` · ${d.dx.length}` : ""}{k === "rx" && d.items.length > 0 ? ` · ${d.items.length}` : ""}
          </button>
        ))}
      </div>
      <div className="exam" ref={body}>
        <Panel className="exam-main">
          {tab === "soap" && <Soap key={v.id} visit={v} onSaved={reload} />}
          {tab === "odonto" && (
            <>
              <Odontogram entries={d.odo} editable={canWrite} busy={a.busy}
                onApply={(list) => a.run(async () => { for (const it of list) await api.insert("odontogram_entries", { tenant_id: tenantId, patient_id: patient.id, visit_id: v.id, ...it }); await reload(); }, "Odontogram diperbarui")} />
              <Feedback a={a} />
              {d.odo.some((o) => o.visit_id === v.id) && (
                <details className="pos-recent" open>
                  <summary>Dicatat di kunjungan ini</summary>
                  <ul className="d-list">
                    {d.odo.filter((o) => o.visit_id === v.id).map((o) => (
                      <li key={o.id}><div><p className="d-list__title">Gigi {o.tooth}{o.surfaces.length ? ` · ${o.surfaces.join("")}` : ""} · <span className="d-mono">{o.condition}</span></p></div>
                        <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => a.run(() => api.remove("odontogram_entries", o.id)).then(reload)}>Hapus</button></li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {tab === "dx" && <DxPx visit={v} dx={d.dx} px={d.px} products={d.products} tenantId={tenantId} reload={reload} />}
          {tab === "rx" && d.rx && <Rx rx={d.rx} items={d.items} products={d.products} patient={patient} tenantId={tenantId} reload={reload} />}
          {tab === "tutup" && <CloseVisit visit={v} dx={d.dx} px={d.px} items={d.items} products={d.products} onClosed={(r) => { setClosed(r); setTab("soap"); a.setOk(null); a.setError(null); reload(); }} />}
        </Panel>
        <Panel title="Riwayat kunjungan" className="exam-side">
          <VisitHistory visits={d.history} compact />
        </Panel>
      </div>
    </>
  );
}

function Allergy({ patient, canWrite, reload }) {
  const { api } = useAuth();
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(patient.allergies ?? "");
  useEffect(() => setVal(patient.allergies ?? ""), [patient.allergies]);
  const a = useAction();
  return (
    <div className={`allergy allergy--${allergyState(patient.allergies)}`} role={allergyState(patient.allergies) === "yes" ? "alert" : undefined}>
      {edit ? (
        <form className="allergy__form" onSubmit={(e) => { e.preventDefault(); a.run(() => api.update("patients", patient.id, { allergies: val.trim() || null })).then(() => { setEdit(false); reload(); }); }}>
          <label htmlFor="alg" className="d-switch__label">Riwayat alergi</label>
          <input id="alg" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Mis. penisilin, lateks, atau “Tidak ada”" />
          <button type="submit" className="d-btn d-btn--primary d-btn--sm" disabled={a.busy}>Simpan</button>
          <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setEdit(false)}>Batal</button>
        </form>
      ) : (
        <>
          <p><strong>Alergi:</strong> {patient.allergies ?? <span className="d-muted">belum ditanyakan</span>}</p>
          {canWrite && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setEdit(true)}>Ubah</button>}
        </>
      )}
      <Feedback a={a} />
    </div>
  );
}

function ClosedSummary({ r, onDone }) {
  const { api } = useAuth();
  const ob = useAsync(() => api.list("satusehat_outbox", { eq: { id: r.outbox_id } }), [api, r.outbox_id]);
  useLive(["satusehat_outbox"], ob.reload);
  const row = ob.data?.[0];
  const ref = useRef(null);
  useGSAP(() => { if (!prefersReducedMotion()) gsap.from(ref.current, { opacity: 0, y: -6, duration: 0.3 }); }, { scope: ref });
  return (
    <section className="d-panel closed-sum" ref={ref} aria-live="polite">
      <header className="d-panel__head"><div><h2>Kunjungan ditutup</h2><p className="d-panel__meta">Rekam medis terkunci</p></div>
        <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={onDone}>Tutup ringkasan</button></header>
      <dl className="pos-sum">
        <div><dt>Tagihan ke kasir</dt><dd>{r.order_code ? `${r.order_code} · ${rupiah(r.subtotal)}` : "Tidak ada tagihan"}</dd></div>
        <div><dt>E-resep</dt><dd>{r.rx_items ? `${r.rx_items} obat diteruskan ke kasir` : "Tanpa obat"}</dd></div>
        <div><dt>SATUSEHAT</dt><dd>{row ? <SatusehatBadge row={row} /> : "…"}</dd></div>
      </dl>
      {row && <FhirViewer payload={row.payload} />}
    </section>
  );
}
