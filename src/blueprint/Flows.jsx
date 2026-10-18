import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from "../lib/gsap.js";

const STEP_HOLD = 1.15; // detik per langkah saat diputar

export default function Flows() {
  const { FLOWS } = useBP();
  const root = useRef(null);
  const lanesRef = useRef(null);
  const stepRefs = useRef([]);
  const tlRef = useRef(null);
  const seen = useRef(false);
  const [fid, setFid] = useState(FLOWS[0].id);
  const [active, setActive] = useState(0);
  const [geo, setGeo] = useState({ w: 0, h: 0, d: "" });

  const flow = FLOWS.find((f) => f.id === fid);

  const measure = useCallback(() => {
    const box = lanesRef.current;
    if (!box) return;
    const pts = stepRefs.current
      .slice(0, flow.steps.length)
      .filter(Boolean)
      .map((el) => [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2]);
    const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `H${(pts[i - 1][0] + x) / 2} V${y} H${x}`)).join(" ");
    setGeo({ w: box.offsetWidth, h: box.offsetHeight, d });
  }, [flow]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(lanesRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Satu timeline per alur: langkah muncul berurutan, jalur ikut tergambar.
  useGSAP(
    () => {
      const n = flow.steps.length;
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        if (!seen.current) {
          gsap.from(".flows-head > *", {
            y: 12,
            opacity: 0,
            stagger: 0.08,
            scrollTrigger: { trigger: ".flows-head", start: "top 82%", once: true },
          });
        }
        const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
        tl.set(".lane-step", { opacity: 0.18, y: 8 }).set(".flow-path", { strokeDashoffset: 1 });
        for (let i = 0; i < n; i++) {
          const at = i * STEP_HOLD;
          tl.call(() => setActive(i), null, at)
            .to(stepRefs.current[i], { opacity: 1, y: 0, duration: 0.45 }, at)
            .to(".flow-path", { strokeDashoffset: 1 - i / Math.max(n - 1, 1), duration: 0.5, ease: "power1.inOut" }, at);
        }
        tlRef.current = tl;

        if (seen.current) tl.play(0);
        else
          gsap.timeline({
            scrollTrigger: {
              trigger: lanesRef.current,
              start: "top 70%",
              once: true,
              onEnter: () => {
                seen.current = true;
                tl.play(0);
              },
            },
          });
      });

      mm.add(MOTION_REDUCED, () => {
        tlRef.current = null;
        gsap.set(".flow-path", { strokeDashoffset: 0 });
      });
    },
    { dependencies: [fid], scope: root, revertOnUpdate: true }
  );

  const pick = (id) => {
    if (id === fid) return;
    seen.current = true;
    setActive(0);
    setFid(id);
  };

  const replay = () => tlRef.current?.play(0);

  const focusStep = (i) => {
    tlRef.current?.progress(1).pause();
    setActive(i);
  };

  const onTabKey = (e, i) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = FLOWS[(i + dir + FLOWS.length) % FLOWS.length];
    pick(next.id);
    requestAnimationFrame(() => root.current.querySelector(`#tab-${next.id}`)?.focus());
  };

  const step = flow.steps[active];

  return (
    <section className="section section--flows" id="alur" ref={root} aria-labelledby="alur-title">
      <div className="wrap">
        <header className="flows-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />Bab V · Alur kerja antar-peran</p>
          <h2 id="alur-title">Empat alur, dari meja kasir sampai SATUSEHAT.</h2>
          <p className="section-head__lede">
            Setiap alur diputar langkah demi langkah di jalurnya masing-masing. Pilih langkah untuk membaca
            rinciannya. Langkah bertanda revisi sudah diselaraskan dengan Matriks Bab IV.
          </p>
        </header>

        <div className="flow-tabs" role="tablist" aria-label="Pilih alur">
          {FLOWS.map((f, i) => (
            <button
              key={f.id}
              id={`tab-${f.id}`}
              type="button"
              role="tab"
              aria-selected={f.id === fid}
              aria-controls="flow-panel"
              tabIndex={f.id === fid ? 0 : -1}
              className="flow-tab"
              onClick={() => pick(f.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span className="flow-tab__code">{f.code}</span>
              <span className="flow-tab__title">{f.short}</span>
            </button>
          ))}
        </div>

        <div className="flow-panel" id="flow-panel" role="tabpanel" aria-labelledby={`tab-${fid}`}>
          <div className="lanes-wrap">
            <p className="lanes-title">{flow.title}</p>
            <div
              className="lanes"
              ref={lanesRef}
              style={{ "--steps": flow.steps.length, "--lanes": flow.lanes.length }}
            >
              <svg className="lanes__wire" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w || 1} ${geo.h || 1}`} aria-hidden="true">
                <path key={fid} className="flow-path" d={geo.d || "M0,0"} pathLength="1" />
              </svg>
              {flow.lanes.map((l, li) => (
                <div className="lane" key={l} style={{ gridRow: li + 1 }}>
                  <span className="lane__label">{l}</span>
                </div>
              ))}
              {flow.steps.map((s, i) => (
                <button
                  type="button"
                  key={`${fid}-${i}`}
                  ref={(el) => (stepRefs.current[i] = el)}
                  className={`lane-step${i === active ? " is-active" : ""}${s.revisi ? " has-rev" : ""}`}
                  style={{ gridColumn: i + 2, gridRow: flow.lanes.indexOf(s.lane) + 1 }}
                  aria-pressed={i === active}
                  onClick={() => focusStep(i)}
                >
                  <span className="lane-step__n">{i + 1}</span>
                  <span className="lane-step__t">{s.title}</span>
                  <span className="lane-step__lane">{s.lane}</span>
                  <span className="lane-step__x">{s.text}</span>
                  {s.revisi && <span className="lane-step__rev">Revisi · {s.revisi}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flow-caption" aria-live="polite">
            <p className="flow-caption__meta">
              Langkah {active + 1} / {flow.steps.length} · {step.lane}
            </p>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            {step.revisi && (
              <div className="revisi" role="note">
                <p className="revisi__tag">Revisi</p>
                <p>{step.revisi}</p>
              </div>
            )}
            <button type="button" className="link link--btn flow-replay" onClick={replay}>
              Putar ulang alur
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
