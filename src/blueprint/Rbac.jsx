import { Fragment, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK, prefersReducedMotion } from "../lib/gsap.js";
import { kindOf } from "./kindOf.js";

export default function Rbac() {
  const { RBAC, RBAC_ROLES, RBAC_LEGEND, RBAC_CHANGED } = useBP();
  const root = useRef(null);
  const [mode, setMode] = useState("revisi");
  const [focus, setFocus] = useState(null);
  const [open, setOpen] = useState(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".rbac-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".rbac-head", start: "top 82%", once: true },
        });
        gsap.set(".rbac-row", { opacity: 0, y: 8 });
        ScrollTrigger.batch(".rbac-row", {
          start: "top 92%",
          once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.45, stagger: 0.03, overwrite: true }),
        });
      });
    },
    { scope: root }
  );

  // Pergantian asli ↔ revisi: hanya sel yang berubah yang bergerak.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        ".is-changed .badge",
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.012, ease: "power2.out", overwrite: true }
      );
    },
    { dependencies: [mode], scope: root }
  );

  const cell = (row, rid) => {
    const rev = mode === "revisi" && row.revisi?.[rid];
    return { value: rev ? rev[0] : row.asli[rid], changed: Boolean(row.revisi?.[rid]), note: row.revisi?.[rid]?.[1] };
  };

  return (
    <section className="section section--rbac" id="rbac" ref={root} aria-labelledby="rbac-title">
      <div className="wrap">
        <header className="rbac-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />Bab IV · Matriks hak akses</p>
          <h2 id="rbac-title">Dua puluh fitur, lima peran, satu aturan: akses sebatas tugas.</h2>
          <p className="section-head__lede">
            Tampilan revisi mengubah {RBAC_CHANGED} sel dari matriks asli. Sebagian besar menutup akses
            Superadmin ke data bisnis tenant; sisanya menyelaraskan matriks dengan alur kerja di Bab V.
            Pilih baris bertanda untuk membaca alasannya.
          </p>
        </header>

        <div className="rbac-controls">
          <div className="seg" role="radiogroup" aria-label="Versi matriks">
            {[
              ["revisi", "Revisi"],
              ["asli", "Asli dokumen"],
            ].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} className="seg__btn" onClick={() => setMode(v)}>
                {l}
              </button>
            ))}
          </div>
          <p className="rbac-hint">Klik kepala kolom untuk menyorot satu peran.</p>
        </div>

        <div className="lens rbac-mroles" role="group" aria-label="Pilih peran yang ditampilkan">
          {RBAC_ROLES.map((r) => (
            <button key={r.id} type="button" className="chip" aria-pressed={(focus || "st") === r.id} onClick={() => setFocus(r.id)}>
              <span className="chip__code">{r.level}</span> {r.label}
            </button>
          ))}
        </div>

        <div className="rbac-scroll" tabIndex={0} role="region" aria-label="Matriks RBAC, dapat digeser horizontal">
          <table className="rbac" data-focus={focus || undefined} data-mode={mode} data-mcol={focus || "st"}>
            <thead>
              <tr>
                <th scope="col" className="rbac__feat">Modul / fitur</th>
                {RBAC_ROLES.map((r) => (
                  <th scope="col" key={r.id} data-col={r.id} className={focus === r.id ? "is-focus" : undefined}>
                    <button type="button" aria-pressed={focus === r.id} onClick={() => setFocus(focus === r.id ? null : r.id)}>
                      <span className="rbac__lv">{r.level}</span>
                      {r.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RBAC.map((row) => {
                const has = Boolean(row.revisi);
                const isOpen = open === row.no;
                return (
                  <Fragment key={row.no}>
                    <tr className={`rbac-row${has ? " has-rev" : ""}`}>
                      <th scope="row" className="rbac__feat">
                        <span className="rbac__no">{String(row.no).padStart(2, "0")}</span>
                        {has ? (
                          <button
                            type="button"
                            className="rbac__toggle"
                            aria-expanded={isOpen}
                            aria-controls={`note-${row.no}`}
                            onClick={() => setOpen(isOpen ? null : row.no)}
                          >
                            {row.name}
                            <span className="rbac__mark" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                          </button>
                        ) : (
                          <span>{row.name}</span>
                        )}
                      </th>
                      {RBAC_ROLES.map((r) => {
                        const c = cell(row, r.id);
                        return (
                          <td key={r.id} data-col={r.id} className={`${c.changed ? "is-changed" : ""}${focus === r.id ? " is-focus" : ""}`}>
                            <span className={`badge badge--${kindOf(c.value)}`}>{c.value}</span>
                          </td>
                        );
                      })}
                    </tr>
                    {has && isOpen && (
                      <tr className="rbac-note" id={`note-${row.no}`}>
                        <td colSpan={6}>
                          <ul>
                            {Object.entries(row.revisi).map(([rid, [val, why]]) => (
                              <li key={rid}>
                                <p className="rbac-note__who">
                                  {RBAC_ROLES.find((r) => r.id === rid).label}:{" "}
                                  <span className="rbac-note__from">{row.asli[rid]}</span> → <strong>{val}</strong>
                                </p>
                                <p>{why}</p>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <dl className="legend">
          {RBAC_LEGEND.map((l) => (
            <div key={l.code}>
              <dt><span className={`badge badge--${kindOf(l.code)}`}>{l.code}</span></dt>
              <dd>{l.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
