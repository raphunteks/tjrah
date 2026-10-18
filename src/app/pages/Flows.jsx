import { useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { Link } from "../../lib/router.jsx";
import { ROLE_LABEL } from "../../lib/rbac-matrix.js";
import { can, permOf } from "../../lib/rbac.js";
import { dateTime } from "../../lib/format.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../lib/gsap.js";
import { pagesFor, findPage } from "../pages.js";
import { PageHead, Badge, useAsync } from "../ui/index.jsx";
import { useLive } from "../ops.jsx";
import { SatusehatBadge } from "./clinic/shared.jsx";
import { FLOWS, LANE } from "./flows-data.js";

// Jenis event Hermes yang menjadi bukti tiap alur.
const KINDS = { dinein: ["z_report", "receipt"], void: ["void_alert"], supply: ["low_stock"], medis: ["satusehat", "receipt"] };

/** Jejak sistem nyata dari alur terpilih: pesan Hermes (fitur 2) dan, untuk Alur 4, kiriman SATUSEHAT (fitur 17). */
function Trail({ flow }) {
  const { api, role, tenantId } = useAuth();
  const hermesOk = can(role, 2, "r");
  const rmeOk = flow.id === "medis" && can(role, 17, "r") && !permOf(role, 17)?.scope;
  const data = useAsync(async () => {
    if (!tenantId) return null;
    const [hermes, outbox] = await Promise.all([
      hermesOk ? api.listHermes(tenantId) : [],
      rmeOk ? api.list("satusehat_outbox", { order: ["created_at", "desc"], limit: 5 }) : [],
    ]);
    return { hermes: hermes.filter((h) => KINDS[flow.id].includes(h.kind)).slice(0, 6), outbox };
  }, [api, tenantId, flow.id, hermesOk, rmeOk]);
  useLive(["hermes_events", "satusehat_outbox"], data.reload);
  if (!hermesOk && !rmeOk) return null;
  const d = data.data;
  return (
    <section className="d-panel" aria-labelledby="trail-h">
      <header className="d-panel__head"><div><h2 id="trail-h">Jejak sistem terbaru</h2><p className="d-panel__meta">Bukti alur ini berjalan di tenant Anda</p></div></header>
      {!d ? <p className="d-text d-muted">Memuat…</p> : !d.hermes.length && !d.outbox.length ? (
        <p className="d-text d-muted">Belum ada jejak. Jalankan alur ini dari akun peran terkait, lalu kembali ke sini.</p>
      ) : (
        <ul className="d-list trail">
          {d.outbox.map((o) => (
            <li key={o.id}><div><p className="d-list__title">SATUSEHAT · {o.payload?.entry?.[0]?.resource?.subject?.display ?? "pasien"}</p><p className="d-list__meta">{dateTime(o.created_at)} · {o.payload?.entry?.length ?? 0} resource FHIR</p></div><SatusehatBadge row={o} /></li>
          ))}
          {d.hermes.map((h) => (
            <li key={h.id}><div><p className="d-list__title">Hermes → {h.channel === "whatsapp" ? "WhatsApp" : "Discord"} {h.target}</p><p className="d-list__meta">{dateTime(h.created_at)} · {h.message}</p></div><Badge tone={h.status === "sent" ? "ok" : h.status === "failed" ? "danger" : "accent"}>{h.status}</Badge></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Flows() {
  const { role, pillar } = useAuth();
  const flows = FLOWS.filter((f) => !pillar || f.pillar === pillar);
  const [cur, setCur] = useState(flows[0]?.id);
  const flow = flows.find((f) => f.id === cur) ?? flows[0];
  const reachable = new Set(pagesFor(role, pillar).map((p) => p.path));
  const list = useRef(null);

  useGSAP(() => {
    if (prefersReducedMotion() || !list.current) return;
    gsap.from(list.current.children, { opacity: 0, x: -8, stagger: 0.04, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
  }, { dependencies: [cur], scope: list });

  return (
    <>
      <PageHead
        eyebrow="Bab V · rantai kerja antar-peran"
        title="Alur kerja"
        desc={`Langkah bertanda “Anda” dijalankan oleh ${ROLE_LABEL[role]}. Pembagian peran mengikuti matriks RBAC asli; perbedaan dengan narasi Bab V ditandai.`}
      />
      <div className="d-seg flow-tabs" role="tablist" aria-label="Pilih alur">
        {flows.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={f.id === flow.id} aria-checked={f.id === flow.id} onClick={() => setCur(f.id)}>
            {f.code}
          </button>
        ))}
      </div>
      <section className="d-panel" aria-labelledby="flow-title">
        <header className="d-panel__head"><div><h2 id="flow-title">{flow.title}</h2><p className="d-panel__meta">{flow.steps.length} langkah</p></div></header>
        <ol className="flow" ref={list}>
          {flow.steps.map((s, i) => {
            const mine = s.by.includes(role);
            const page = s.path && findPage(s.path);
            return (
              <li key={i} className={`flow-step${mine ? " is-mine" : ""}`}>
                <span className="flow-step__no d-mono" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <div className="flow-step__body">
                  <p className="flow-step__lanes">
                    {s.by.map((b) => <Badge key={b} tone={b === role ? "accent" : "neutral"}>{LANE[b]}</Badge>)}
                    {mine && <Badge tone="ok">Anda</Badge>}
                  </p>
                  <h3>{s.title}</h3>
                  <p className="d-text">{s.text}</p>
                  {s.matriks && <p className="flow-step__note"><strong>Matriks asli:</strong> {s.matriks}</p>}
                  {page && reachable.has(s.path) && <Link to={s.path} className="d-link">Buka {page.label}</Link>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <Trail flow={flow} />
    </>
  );
}
