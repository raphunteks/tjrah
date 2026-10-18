// Komponen bersama klinik: status SATUSEHAT, penampil bundle FHIR, riwayat kunjungan.
import { dateTime, date } from "../../../lib/format.js";
import { Badge } from "../../ui/index.jsx";

const SS = {
  queued: ["Diantrekan", "warn"],
  sending: ["Mengirim…", "accent"],
  sent: ["Terkirim", "ok"],
  simulated: ["Simulasi", "accent"],
  failed: ["Gagal", "danger"],
};

/** Status kiriman SATUSEHAT. "Simulasi" = Edge Function berjalan tanpa kredensial; tidak ada data ke Kemenkes. */
export function SatusehatBadge({ row }) {
  const [label, tone] = SS[row.status] ?? [row.status, "neutral"];
  return (
    <span className="ss-badge">
      <Badge tone={tone}>{label}</Badge>
      {row.encounter_id && <span className="d-mono ss-badge__id" title="ID Encounter">{row.encounter_id}</span>}
      {row.status === "failed" && row.error && <span className="ss-badge__err">{row.error}</span>}
    </span>
  );
}

const codeOf = (r) => r.code?.coding?.[0] ?? null;

/** Ringkasan isi bundle FHIR R4 + JSON mentah (untuk audit integrasi). */
export function FhirViewer({ payload }) {
  const entries = payload?.entry ?? [];
  return (
    <details className="fhir">
      <summary>Bundle FHIR R4 · {entries.length} resource</summary>
      <ul className="fhir-list">
        {entries.map((e) => {
          const r = e.resource;
          const c = codeOf(r);
          const detail = r.resourceType === "Encounter" ? `${r.subject?.reference} · ${r.class?.display}`
            : r.resourceType === "MedicationRequest" ? `${r.medicationCodeableConcept?.text} · ${r.dosageInstruction?.[0]?.text ?? ""}`
            : c ? `${c.code} · ${c.display}` : "";
          return (
            <li key={e.fullUrl}>
              <span className="fhir-type d-mono">{r.resourceType}</span>
              <span className="fhir-detail">{detail}{r.bodySite?.[0]?.text ? ` · ${r.bodySite[0].text}` : ""}</span>
            </li>
          );
        })}
      </ul>
      <details className="fhir-raw">
        <summary>JSON</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </details>
  );
}

/** Riwayat kunjungan tertutup (terbaru dulu). */
export function VisitHistory({ visits, compact = false }) {
  if (!visits?.length) return <p className="d-text d-muted">Kunjungan pertama. Tanyakan riwayat alergi.</p>;
  return (
    <ol className={`vh${compact ? " vh--compact" : ""}`}>
      {visits.map((v) => (
        <li key={v.id}>
          <p className="vh-date d-mono">{compact ? date(v.started_at) : dateTime(v.started_at)}</p>
          <p className="vh-a">{v.assessment ?? "—"}</p>
          {!compact && v.plan && <p className="d-list__meta">P: {v.plan}</p>}
        </li>
      ))}
    </ol>
  );
}
