import { useEffect, useMemo, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, ScrollTrigger, Flip, useGSAP, MOTION_OK, scrollToId, prefersReducedMotion } from "../lib/gsap.js";

export default function Modules() {
  const { MODULE_LIST, MODULE_PILLARS, PILLAR_FILTERS } = useBP();
  const root = useRef(null);
  const flipState = useRef(null);
  const [pillar, setPillar] = useState(null);
  const [active, setActive] = useState("M1");

  const visible = useMemo(
    () => (pillar ? MODULE_LIST.filter((m) => MODULE_PILLARS[m.id].includes(pillar)) : MODULE_LIST),
    [pillar]
  );

  const { contextSafe } = useGSAP({ scope: root });

  // Mode strip (≤1100px): geser indeks horizontal agar modul aktif tetap terlihat.
  useEffect(() => {
    const list = root.current?.querySelector(".mod-index ol");
    const link = list?.querySelector(".is-active");
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const left = link.offsetLeft - list.clientWidth / 2 + link.offsetWidth / 2;
    list.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active]);

  const choose = contextSafe((code) => {
    flipState.current = Flip.getState(".mod-index__item");
    setPillar(code);
  });

  // FLIP: indeks modul bergeser ke posisi baru setelah filter berubah.
  useGSAP(
    () => {
      const state = flipState.current;
      flipState.current = null;
      ScrollTrigger.refresh();
      if (!state || prefersReducedMotion()) return;
      Flip.from(state, {
        duration: 0.5,
        ease: "power2.inOut",
        targets: ".mod-index__item",
        onEnter: (els) => gsap.fromTo(els, { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.4 }),
      });
      gsap.fromTo(".mod-article", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 });
    },
    { dependencies: [pillar], scope: root }
  );

  // Penanda modul aktif + reveal; dibangun ulang tiap filter berubah.
  useGSAP(
    () => {
      gsap.utils.toArray(".mod-article").forEach((el) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 40%",
          end: "bottom 40%",
          onToggle: (self) => self.isActive && setActive(el.dataset.id),
        });
      });

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".mod-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".mod-head", start: "top 82%", once: true },
        });
        gsap.utils.toArray(".mod-group").forEach((el) => {
          gsap.from(el, { y: 14, opacity: 0, duration: 0.55, scrollTrigger: { trigger: el, start: "top 90%", once: true } });
        });
      });
    },
    { dependencies: [pillar], scope: root, revertOnUpdate: true }
  );

  return (
    <section className="section section--modules" id="modul" ref={root} aria-labelledby="modul-title">
      <div className="wrap">
        <header className="mod-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />Bab II · Dekomposisi modul</p>
          <h2 id="modul-title">Dua belas modul, satu basis data.</h2>
          <p className="section-head__lede">
            Spesifikasi fungsional setiap modul. Saring per pilar untuk melihat modul yang dibutuhkan satu
            jenis usaha. Modul bertanda revisi memuat risiko kepatuhan atau ketergantungan pihak ketiga.
          </p>
          <div className="lens" role="group" aria-label="Saring modul per pilar">
            <span className="lens__label">Pilar</span>
            <button type="button" className="chip" aria-pressed={pillar === null} onClick={() => choose(null)}>
              Semua <span className="chip__count">×{MODULE_LIST.length}</span>
            </button>
            {PILLAR_FILTERS.map((p) => (
              <button type="button" key={p.code} className="chip" aria-pressed={pillar === p.code} onClick={() => choose(p.code)}>
                <span className="chip__code">{p.code}</span> {p.name}
              </button>
            ))}
          </div>
        </header>

        <div className="mod-stack">
          <nav className="mod-index" aria-label="Indeks modul">
            <ol>
              {visible.map((m) => (
                <li key={m.id} className="mod-index__item" data-flip-id={m.id}>
                  <a
                    href={`#modul-${m.id}`}
                    className={active === m.id ? "is-active" : undefined}
                    aria-current={active === m.id ? "location" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToId(`modul-${m.id}`);
                    }}
                  >
                    <span className="mod-index__code">{m.id}</span>
                    <span className="mod-index__name">{m.name}</span>
                    {m.revisi && <span className="mod-index__dot" aria-label="memuat revisi" />}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mod-articles">
            {visible.map((m) => (
              <article className="mod-article" id={`modul-${m.id}`} data-id={m.id} key={m.id} aria-labelledby={`t-${m.id}`}>
                <header className="mod-article__head">
                  <p className="mod-article__code">{m.id}</p>
                  <div>
                    <h3 id={`t-${m.id}`}>{m.name}</h3>
                    <p className="mod-article__en">{m.en}</p>
                  </div>
                  <ul className="mod-article__pillars" aria-label="Pilar pengguna">
                    {MODULE_PILLARS[m.id].length ? (
                      MODULE_PILLARS[m.id].map((p) => <li key={p}>{p}</li>)
                    ) : (
                      <li>Lintas pilar</li>
                    )}
                  </ul>
                </header>

                <div className="mod-groups">
                  {m.groups.map((g) => (
                    <section className="mod-group" key={g.title}>
                      <h4>{g.title}</h4>
                      <ul className="specs">
                        {g.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>

                {m.revisi && (
                  <div className="revisi" role="note">
                    <p className="revisi__tag">Revisi</p>
                    <p>{m.revisi}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
