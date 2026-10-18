import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED } from "../lib/gsap.js";

const ROWS = [["edge"], ["hal", "spa", "ext"], ["ai", "api", "hermes"], ["data"]];

function route(a, b, box) {
  const ax = a.left + a.width / 2 - box.left;
  const ay = a.top + a.height / 2 - box.top;
  const bx = b.left + b.width / 2 - box.left;
  const by = b.top + b.height / 2 - box.top;
  const vertical = Math.abs(by - ay) > Math.abs(bx - ax) * 0.6;

  if (vertical) {
    const down = by > ay;
    const y1 = down ? a.bottom - box.top : a.top - box.top;
    const y2 = down ? b.top - box.top : b.bottom - box.top;
    const x1 = Math.min(Math.max(bx, a.left - box.left + 16), a.right - box.left - 16);
    const x2 = Math.min(Math.max(ax, b.left - box.left + 16), b.right - box.left - 16);
    const ym = (y1 + y2) / 2;
    return { d: `M${x1},${y1} V${ym} H${x2} V${y2}`, lx: (x1 + x2) / 2, ly: ym };
  }
  const right = bx > ax;
  const x1 = right ? a.right - box.left : a.left - box.left;
  const x2 = right ? b.left - box.left : b.right - box.left;
  const xm = (x1 + x2) / 2;
  return { d: `M${x1},${ay} H${xm} V${by} H${x2}`, lx: xm, ly: (ay + by) / 2 };
}

export default function TopologyMap({ focusNode }) {
  const { NODES, EDGES } = useBP();
  const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const root = useRef(null);
  const board = useRef(null);
  const panel = useRef(null);
  const nodeRefs = useRef({});
  const [geom, setGeom] = useState({ w: 0, h: 0, paths: {} });
  const [sel, setSel] = useState("api");

  useEffect(() => {
    if (focusNode) setSel(focusNode);
  }, [focusNode]);

  const measure = useCallback(() => {
    const el = board.current;
    if (!el) return;
    // offset* mengabaikan transform GSAP, jadi geometri tetap benar saat animasi berjalan.
    const box = { left: 0, top: 0 };
    const rect = (n) =>
      n && { left: n.offsetLeft, top: n.offsetTop, width: n.offsetWidth, height: n.offsetHeight,
             right: n.offsetLeft + n.offsetWidth, bottom: n.offsetTop + n.offsetHeight };
    const paths = {};
    EDGES.forEach((e) => {
      const a = rect(nodeRefs.current[e.from]);
      const b = rect(nodeRefs.current[e.to]);
      if (a && b && a.width && b.width) paths[`${e.from}-${e.to}`] = route(a, b, box);
    });
    setGeom({ w: el.offsetWidth, h: el.offsetHeight, paths });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  // Gambar peta: lapis demi lapis, lalu jalur koneksi.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".topo-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".topo-head", start: "top 82%", once: true },
        });

        const tl = gsap.timeline({
          scrollTrigger: { trigger: board.current, start: "top 75%", once: true },
        });
        ROWS.forEach((row, i) => {
          tl.from(
            row.map((id) => nodeRefs.current[id]),
            { opacity: 0, y: 14, scale: 0.98, duration: 0.55, stagger: 0.06 },
            i === 0 ? 0 : "-=0.35"
          );
        });
        tl.fromTo(
          ".topo-edge",
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.7, ease: "power2.inOut", stagger: 0.08 },
          "-=0.2"
        ).from(".topo-label", { opacity: 0, duration: 0.3, stagger: 0.05 }, "-=0.5");
      });
      mm.add(MOTION_REDUCED, () => gsap.set(".topo-edge", { strokeDashoffset: 0 }));
    },
    { scope: root }
  );

  // Pergantian node terpilih: crossfade panel detail.
  useGSAP(
    () => {
      if (window.matchMedia(MOTION_REDUCED).matches) return;
      gsap.fromTo(panel.current.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, overwrite: true });
    },
    { dependencies: [sel], scope: root }
  );

  const node = BY_ID[sel];
  const links = EDGES.filter((e) => e.from === sel || e.to === sel).map((e) => ({
    other: BY_ID[e.from === sel ? e.to : e.from],
    label: e.label,
  }));

  const onKey = (e, id) => {
    const order = ROWS.flat();
    const i = order.indexOf(id);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nodeRefs.current[order[(i + 1) % order.length]]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nodeRefs.current[order[(i - 1 + order.length) % order.length]]?.focus();
    }
  };

  return (
    <section className="section section--topo" id="topologi" ref={root} aria-labelledby="topo-title">
      <div className="wrap">
        <header className="topo-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />1.2 · Topologi arsitektur</p>
          <h2 id="topo-title">Edge → SPA → API → Data. AI dan agen di sisi.</h2>
          <p className="section-head__lede">
            Delapan blok, tujuh jalur. Pilih blok untuk membaca spesifikasinya. Blok bertanda revisi
            memuat koreksi atas dokumen asli.
          </p>
        </header>

        <div className="topo">
          <div className="topo__board" ref={board}>
            <svg className="topo__wires" width={geom.w} height={geom.h} viewBox={`0 0 ${geom.w || 1} ${geom.h || 1}`} aria-hidden="true">
              {EDGES.map((e) => {
                const k = `${e.from}-${e.to}`;
                const p = geom.paths[k];
                const hot = e.from === sel || e.to === sel;
                return (
                  <g key={k} className={hot ? "is-hot" : undefined}>
                    <path className="topo-edge" d={p?.d || "M0,0"} pathLength="1" />
                    {p && (
                      <text className="topo-label" x={p.lx} y={p.ly} dy="-6" textAnchor="middle">
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {NODES.map((n) => (
              <button
                key={n.id}
                type="button"
                ref={(el) => (nodeRefs.current[n.id] = el)}
                className={`node node--${n.id}${sel === n.id ? " is-selected" : ""}`}
                style={{ gridArea: n.area }}
                aria-pressed={sel === n.id}
                aria-controls="topo-detail"
                onClick={() => setSel(n.id)}
                onKeyDown={(e) => onKey(e, n.id)}
              >
                <span className="node__layer">{n.layer}</span>
                <span className="node__title">{n.title}</span>
                <span className="node__tag">{n.tag}</span>
                {n.revisi && <span className="node__flag">revisi</span>}
              </button>
            ))}
          </div>

          <aside className="topo__detail" id="topo-detail" aria-live="polite" ref={panel}>
            <p className="eyebrow eyebrow--plain">{node.layer}</p>
            <h3>{node.title}</h3>
            <ul className="specs">
              {node.specs.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="detail__links">
              <p className="detail__label">Terhubung ke</p>
              <ul>
                {links.map((l) => (
                  <li key={l.other.id}>
                    <button type="button" className="link link--btn" onClick={() => setSel(l.other.id)}>
                      {l.other.title}
                    </button>
                    <span className="detail__proto">{l.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            {node.revisi && (
              <div className="revisi" role="note">
                <p className="revisi__tag">Revisi</p>
                <p>{node.revisi}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
