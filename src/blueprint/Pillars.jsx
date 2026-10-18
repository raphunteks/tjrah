import { useMemo, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK } from "../lib/gsap.js";

export default function Pillars() {
  const { PILLARS, MODULES } = useBP();
  const root = useRef(null);
  const [lens, setLens] = useState(null);

  const usage = useMemo(() => {
    const u = {};
    PILLARS.forEach((p) => p.modules.forEach((m) => (u[m] = (u[m] || 0) + 1)));
    return u;
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".section-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".section-head", start: "top 82%", once: true },
        });
        gsap.set(".pillar", { opacity: 0, y: 14 });
        ScrollTrigger.batch(".pillar", {
          start: "top 88%",
          once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, stagger: 0.07, overwrite: true }),
        });
      });
    },
    { scope: root }
  );

  const lensed = (p) => lens && p.modules.includes(lens);

  return (
    <section className="section" id="pilar" ref={root} aria-labelledby="pilar-title">
      <div className="wrap">
        <header className="section-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />1.1 · Visi &amp; cakupan</p>
          <h2 id="pilar-title">Enam industri, satu inti modul.</h2>
          <p className="section-head__lede">
            Setiap pilar adalah kombinasi modul yang sama. Pilih modul untuk melihat industri mana yang
            bergantung padanya. Itu yang perlu dibangun paling dulu.
          </p>
        </header>

        <div className="lens" role="group" aria-label="Sorot pilar berdasarkan modul">
          <span className="lens__label">Sorot modul</span>
          {Object.entries(MODULES)
            .filter(([m]) => usage[m])
            .sort((a, b) => usage[b[0]] - usage[a[0]])
            .map(([m, name]) => (
              <button
                type="button"
                key={m}
                className="chip"
                aria-pressed={lens === m}
                onClick={() => setLens(lens === m ? null : m)}
              >
                <span className="chip__code">{m}</span> {name}
                <span className="chip__count" aria-label={`dipakai ${usage[m]} pilar`}>×{usage[m]}</span>
              </button>
            ))}
        </div>

        <ol className="pillars" data-lens={lens ? "on" : "off"}>
          {PILLARS.map((p) => (
            <li key={p.id} className={`pillar${lensed(p) ? " is-lit" : ""}`}>
              <span className="pillar__code">{p.code}</span>
              <div className="pillar__main">
                <h3>{p.name}</h3>
                <p>{p.segments}</p>
              </div>
              <p className="pillar__sig">{p.signature}</p>
              <ul className="pillar__mods" aria-label="Modul inti">
                {p.modules.map((m) => (
                  <li key={m} className={lens === m ? "is-match" : undefined} title={MODULES[m]}>
                    {m}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
