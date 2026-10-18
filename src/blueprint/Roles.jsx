import { useEffect, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, MOTION_OK, scrollToId, scrollToY } from "../lib/gsap.js";

const PINNED = `(min-width: 1024px) and ${MOTION_OK}`;

export default function Roles({ focusRole }) {
  const { ROLES } = useBP();
  const root = useRef(null);
  const viewport = useRef(null);
  const track = useRef(null);
  const pinST = useRef(null);
  const [active, setActive] = useState(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        gsap.from(".roles-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".roles-head", start: "top 82%", once: true },
        });
      });

      // Desktop: viewport dipin, lima kartu digeser horizontal sesuai scroll.
      mm.add(PINNED, () => {
        const distance = () => track.current.scrollWidth - viewport.current.clientWidth;
        const slide = gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: viewport.current,
            start: "top 18%",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            snap: { snapTo: 1 / (ROLES.length - 1), duration: { min: 0.2, max: 0.5 }, ease: "power1.inOut" },
            onUpdate: (self) => setActive(Math.round(self.progress * (ROLES.length - 1))),
          },
        });
        pinST.current = slide.scrollTrigger;

        // Isi kartu menyala saat kartu masuk ke tengah, relatif ke animasi horizontal.
        gsap.utils.toArray(".role-card").forEach((card) => {
          gsap.fromTo(
            card.querySelectorAll(".role-card__body > *"),
            { opacity: 0.25, y: 8 },
            {
              opacity: 1,
              y: 0,
              stagger: 0.05,
              ease: "power1.out",
              scrollTrigger: { trigger: card, containerAnimation: slide, start: "left 85%", end: "left 45%", scrub: true },
            }
          );
        });

        return () => {
          pinST.current = null;
        };
      });

      // Mobile / reduced motion: tumpukan vertikal, penanda aktif per kartu.
      mm.add(`not all and (min-width: 1024px), (prefers-reduced-motion: reduce)`, () => {
        gsap.utils.toArray(".role-card").forEach((card, i) => {
          gsap.timeline({
            scrollTrigger: { trigger: card, start: "top 55%", end: "bottom 55%", onToggle: (s) => s.isActive && setActive(i) },
          });
        });
      });
    },
    { scope: root }
  );

  const goTo = (i) => {
    const st = pinST.current;
    if (st) scrollToY(st.start + (st.end - st.start) * (i / (ROLES.length - 1)));
    else scrollToId(`peran-${ROLES[i].id}`);
  };

  useEffect(() => {
    if (!focusRole) return;
    const i = ROLES.findIndex((r) => r.id === focusRole);
    if (i >= 0) requestAnimationFrame(() => goTo(i));
  }, [focusRole]);

  return (
    <section className="section section--roles" id="peran" ref={root} aria-labelledby="peran-title">
      <div className="wrap">
        <header className="roles-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />Bab III · Struktur peran</p>
          <h2 id="peran-title">Lima peran. Tidak ada yang memegang semuanya.</h2>
          <p className="section-head__lede">
            Hierarki dipadatkan menjadi lima tingkat. Dua peran membawa revisi karena aksesnya melampaui
            tanggung jawabnya, dan satu peran perlu atribut tambahan agar alur void bisa berjalan di cabang.
          </p>
        </header>

        <ol className="role-rail" aria-label="Lompat ke peran">
          {ROLES.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className={i === active ? "is-active" : undefined}
                aria-current={i === active ? "step" : undefined}
                onClick={() => goTo(i)}
              >
                <span className="role-rail__lv">{r.level}</span>
                <span className="role-rail__name">{r.short}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="roles-viewport" ref={viewport}>
        <ol className="roles-track" ref={track}>
          {ROLES.map((r) => (
            <li className={`role-card${r.revisi ? " has-revisi" : ""}`} id={`peran-${r.id}`} key={r.id}>
              <header className="role-card__head">
                <span className="role-card__lv">{r.level}</span>
                <h3>{r.name}</h3>
                <p className="role-card__domain">{r.domain}</p>
              </header>
              <div className="role-card__body">
                <dl className="role-card__meta">
                  <dt>Perangkat</dt>
                  <dd>{r.device}</dd>
                </dl>
                <ul className="specs">
                  {r.duties.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                {r.revisi && (
                  <div className="revisi" role="note">
                    <p className="revisi__tag">Revisi</p>
                    <p>{r.revisi}</p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
