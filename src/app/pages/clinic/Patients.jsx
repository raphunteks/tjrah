import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { dateTime } from "../../../lib/format.js";
import { SEX, ageFrom, CONDITION, allergyState } from "../../../lib/clinic.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, useAsync } from "../../ui/index.jsx";
import { useLive, useAction, Feedback } from "../../ops.jsx";
import Odontogram from "./Odontogram.jsx";
import { SatusehatBadge, FhirViewer } from "./shared.jsx";

const maskNik = (n) => `${n.slice(0, 6)}••••••${n.slice(-4)}`;
const RX = { draft: ["Draf", "neutral"], sent: ["Di kasir", "warn"], dispensed: ["Diserahkan", "ok"], cancelled: ["Tanpa obat", "neutral"] };

/** Satu kunjungan lengkap: SOAP, diagnosis, tindakan, resep, odontogram kunjungan, status SATUSEHAT. */
function VisitCard({ v, dx, px, rx, rxItems, odo, outbox, canRetry, onRetry, busy }) {
  return (
    <article className="visit">
      <header className="visit__head">
        <div>
          <p className="visit__date d-mono">{dateTime(v.started_at)}</p>
          <p className="d-list__meta">{v.status === "in_progress" ? "Sedang diperiksa" : `Ditutup ${dateTime(v.closed_at)}`}</p>
        </div>
        <div className="d-row-actions">
          {v.status === "in_progress" ? <Badge tone="accent">Berjalan</Badge> : <Badge>Terkunci</Badge>}
          {outbox && <SatusehatBadge row={outbox} />}
        </div>
      </header>
      <dl className="soap">
        <div><dt>S</dt><dd>{v.subjective || "—"}</dd></div>
        <div><dt>O</dt><dd>{v.objective || "—"}</dd></div>
        <div><dt>A</dt><dd>{v.assessment || "—"}</dd></div>
        <div><dt>P</dt><dd>{v.plan || "—"}</dd></div>
      </dl>
      <div className="visit__codes">
        <section>
          <h4>Diagnosis ICD-10</h4>
          {dx.length ? <ul>{dx.map((d) => <li key={d.id}><span className="d-mono">{d.code}</span> {d.display}{d.is_primary && " · utama"}</li>)}</ul> : <p className="d-muted">—</p>}
        </section>
        <section>
          <h4>Tindakan ICD-9-CM</h4>
          {px.length ? <ul>{px.map((p) => <li key={p.id}><span className="d-mono">{p.code}</span> {p.display}{p.tooth ? ` · gigi ${p.tooth}` : ""}</li>)}</ul> : <p className="d-muted">—</p>}
        </section>
        <section>
          <h4>E-resep {rx && <Badge tone={RX[rx.status][1]}>{RX[rx.status][0]}</Badge>}</h4>
          {rxItems.length ? <ul>{rxItems.map((i) => <li key={i.id}>R/ {i.name} · {Number(i.qty)} <span className="d-muted">S. {i.signa}</span></li>)}</ul> : <p className="d-muted">—</p>}
        </section>
        <section>
          <h4>Odontogram kunjungan ini</h4>
          {odo.length ? <ul>{odo.map((o) => <li key={o.id}>Gigi <span className="d-mono">{o.tooth}</span>{o.surfaces.length ? ` ${o.surfaces.join("")}` : ""} · {CONDITION[o.condition]?.label ?? o.condition}</li>)}</ul> : <p className="d-muted">—</p>}
        </section>
      </div>
      {outbox && (
        <div className="visit__ss">
          <FhirViewer payload={outbox.payload} />
          {outbox.status === "failed" && canRetry && (
            <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={busy} onClick={() => onRetry(outbox)}>Kirim ulang</button>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ patient }) {
  const { api, role } = useAuth();
  const a = useAction();
  const ref = useRef(null);
  const data = useAsync(async () => {
    const [visits, odo] = await Promise.all([
      api.list("visits", { eq: { patient_id: patient.id }, order: ["started_at", "desc"] }),
      api.list("odontogram_entries", { eq: { patient_id: patient.id }, order: ["created_at"] }),
    ]);
    const ids = visits.map((v) => v.id);
    if (!ids.length) return { visits, odo, dx: [], px: [], rxs: [], items: [], outbox: [] };
    const [dx, px, rxs, outbox] = await Promise.all([
      api.list("visit_diagnoses", { inList: ["visit_id", ids], order: ["created_at"] }),
      api.list("visit_procedures", { inList: ["visit_id", ids], order: ["created_at"] }),
      api.list("prescriptions", { inList: ["visit_id", ids] }),
      api.list("satusehat_outbox", { inList: ["visit_id", ids], order: ["created_at", "desc"] }),
    ]);
    const items = rxs.length ? await api.list("prescription_items", { inList: ["prescription_id", rxs.map((r) => r.id)], order: ["created_at"] }) : [];
    return { visits, odo, dx, px, rxs, items, outbox };
  }, [api, patient.id]);
  useLive(["visits", "satusehat_outbox", "prescriptions", "odontogram_entries"], data.reload);

  useGSAP(() => {
    if (prefersReducedMotion() || !ref.current) return;
    gsap.fromTo(ref.current, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out", clearProps: "transform" });
  }, { dependencies: [patient.id], scope: ref });

  const retry = (ob) => a.run(() => api.rpc("retry_satusehat", { p_outbox: ob.id }), "Diantrekan ulang ke SATUSEHAT").then(data.reload);
  const d = data.data;
  return (
    <div className="pt-detail" ref={ref}>
      <Panel title={patient.name} meta={`${patient.mrn} · ${SEX[patient.sex] ?? "—"}, ${ageFrom(patient.birth_date) ?? "?"} th`}>
        <dl className="pt-facts">
          <div><dt>NIK</dt><dd className="d-mono">{maskNik(patient.nik)}</dd></div>
          <div><dt>Tanggal lahir</dt><dd>{patient.birth_date ?? "—"}</dd></div>
          <div><dt>WhatsApp</dt><dd>{patient.phone ?? "—"}</dd></div>
          <div><dt>ID SATUSEHAT</dt><dd className="d-mono">{patient.satusehat_ihs ?? "belum ditautkan"}</dd></div>
        </dl>
        <p className={`allergy allergy--${allergyState(patient.allergies)}`}><strong>Alergi:</strong>&nbsp;{patient.allergies ?? <span className="d-muted">belum ditanyakan</span>}</p>
      </Panel>
      {data.loading && !d ? <Loading /> : data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : (
        <>
          <Panel title="Odontogram terkini" meta="Gabungan semua kunjungan; entri terbaru menang">
            <Odontogram entries={d.odo} />
          </Panel>
          <Panel title="Riwayat kunjungan" meta={`${d.visits.length} kunjungan`}>
            <Feedback a={a} />
            {d.visits.length === 0 ? <Empty title="Belum ada kunjungan" /> : (
              <div className="visits">
                {d.visits.map((v) => {
                  const rx = d.rxs.find((r) => r.visit_id === v.id);
                  return (
                    <VisitCard key={v.id} v={v} busy={a.busy}
                      dx={d.dx.filter((x) => x.visit_id === v.id)} px={d.px.filter((x) => x.visit_id === v.id)}
                      rx={rx} rxItems={rx ? d.items.filter((i) => i.prescription_id === rx.id) : []}
                      odo={d.odo.filter((o) => o.visit_id === v.id)} outbox={d.outbox.find((o) => o.visit_id === v.id)}
                      canRetry={can(role, 17, "u")} onRetry={retry} />
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

function Outbox() {
  const { api, role } = useAuth();
  const a = useAction();
  const q = useAsync(() => api.list("satusehat_outbox", { order: ["created_at", "desc"], limit: 20 }), [api]);
  useLive(["satusehat_outbox"], q.reload);
  const rows = q.data ?? [];
  const n = (s) => rows.filter((r) => r.status === s).length;
  return (
    <Panel title="Kiriman SATUSEHAT" meta={`${n("queued") + n("sending")} antre · ${n("failed")} gagal`}>
      <p className="d-text d-muted">Encounter dikirim saat dokter menutup kunjungan, tanpa menunggu pelunasan. Tanpa kredensial, Edge Function berjalan dalam mode simulasi.</p>
      <Feedback a={a} />
      {q.loading && !q.data ? <Loading /> : rows.length === 0 ? <Empty title="Belum ada kiriman" /> : (
        <ul className="d-list">
          {rows.map((r) => (
            <li key={r.id}>
              <div>
                <p className="d-list__title">{r.payload?.entry?.[0]?.resource?.subject?.display ?? "Pasien"}</p>
                <p className="d-list__meta">{dateTime(r.created_at)} · {r.payload?.entry?.length ?? 0} resource · percobaan {r.attempts}</p>
              </div>
              <div className="d-row-actions">
                <SatusehatBadge row={r} />
                {r.status === "failed" && can(role, 17, "u") && (
                  <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy}
                    onClick={() => a.run(() => api.rpc("retry_satusehat", { p_outbox: r.id }), "Diantrekan ulang").then(q.reload)}>Kirim ulang</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Patients() {
  const { api } = useAuth();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const list = useAsync(() => api.list("patients", { order: ["name"] }), [api]);
  useLive(["patients"], list.reload);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = list.data ?? [];
    if (!t) return all;
    return all.filter((p) => p.name.toLowerCase().includes(t) || p.mrn.toLowerCase().includes(t) || p.nik.endsWith(t));
  }, [list.data, q]);
  const current = (list.data ?? []).find((p) => p.id === sel) ?? null;

  return (
    <>
      <PageHead eyebrow="Fitur 17 · Rekam medis & SATUSEHAT" title="Pasien & rekam medis"
        desc="Rekam medis yang sudah ditutup terkunci; setiap perubahan tercatat di audit log. Kasir hanya melihat e-resep, bukan isi rekam medis." />
      <div className="pt-layout">
        <Panel title="Pasien" meta={`${list.data?.length ?? 0} terdaftar`} className="pt-list">
          <label className="d-switch pt-search"><span className="d-switch__label">Cari</span>
            <input type="search" placeholder="Nama, No. RM, atau 4 digit akhir NIK" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {list.loading && !list.data ? <Loading /> : list.error ? <ErrorNote error={list.error} onRetry={list.reload} /> : rows.length === 0 ? (
            <Empty title={q ? "Tidak ditemukan" : "Belum ada pasien"}>Kartu rekam medis dibuat saat dokter memulai pemeriksaan dari antrean.</Empty>
          ) : (
            <ul className="pt-items" role="listbox" aria-label="Daftar pasien">
              {rows.map((p) => (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={p.id === sel} className={p.id === sel ? "is-on" : undefined} onClick={() => setSel(p.id)}>
                    <span className="pt-name">{p.name}</span>
                    <span className="d-list__meta"><span className="d-mono">{p.mrn}</span> · {SEX[p.sex] ?? "—"}, {ageFrom(p.birth_date) ?? "?"} th{allergyState(p.allergies) === "yes" ? " · alergi" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="pt-main">
          {current ? <Detail key={current.id} patient={current} /> : <Outbox />}
        </div>
      </div>
    </>
  );
}

