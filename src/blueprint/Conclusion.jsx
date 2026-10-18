import { useRef } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, MOTION_OK, scrollToId } from "../lib/gsap.js";

export default function Conclusion() {
  const { NODES, DECISIONS, PILLARS, MODULES, MODULE_LIST, ROLES, RBAC_CHANGED, FLOWS } = useBP();
  const count = (arr) => arr.filter((x) => x.revisi).length;

  const LEDGER = [
    { where: "Bab I · Topologi", what: "blok arsitektur dengan catatan", n: count(NODES), target: "topologi" },
    { where: "Bab I · Keputusan", what: "keputusan arsitektur terbuka", n: DECISIONS.length, target: "keputusan" },
    { where: "Bab II · Modul", what: "modul dengan risiko kepatuhan / pihak ketiga", n: count(MODULE_LIST), target: "modul" },
    { where: "Bab III · Peran", what: "peran dengan batas akses baru", n: count(ROLES), target: "peran" },
    { where: "Bab IV · RBAC", what: "sel matriks yang diubah", n: RBAC_CHANGED, target: "rbac" },
    { where: "Bab V · Alur", what: "langkah alur yang diselaraskan", n: FLOWS.reduce((a, f) => a + count(f.steps), 0), target: "alur" },
  ];

  // Urutan bangun diturunkan dari data: modul yang dipakai paling banyak pilar didahulukan.
  const usage = {};
  PILLARS.forEach((p) => p.modules.forEach((m) => (usage[m] = (usage[m] || 0) + 1)));
  const ORDER = Object.keys(MODULES)
    .map((m) => ({ id: m, name: MODULES[m], n: usage[m] || 0 }))
    .sort((a, b) => b.n - a.n || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  const root = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 70%", once: true } });
        tl.from(".end-head > *", { y: 12, opacity: 0, stagger: 0.08 })
          .from(".ledger li", { y: 10, opacity: 0, stagger: 0.05, duration: 0.45 }, "-=0.3")
          .from(".build-order li", { x: -10, opacity: 0, stagger: 0.04, duration: 0.4 }, "-=0.35")
          .fromTo(".build-order__bar", { scaleX: 0 }, { scaleX: 1, stagger: 0.04, duration: 0.5, ease: "power2.out" }, "<");
      });
    },
    { scope: root }
  );

  const total = LEDGER.reduce((a, l) => a + l.n, 0);
  const max = Math.max(...ORDER.map((o) => o.n), 1);

  return (
    <section className="section section--end" id="kesimpulan" ref={root} aria-labelledby="end-title">
      <div className="wrap">
        <header className="end-head">
          <p className="eyebrow"><span className="eyebrow__tick" aria-hidden="true" />Bab VI · Kesimpulan</p>
          <h2 id="end-title">Siap dibangun, setelah empat keputusan dikunci.</h2>
          <p className="section-head__lede">
            Blueprint asli menyimpulkan bahwa lima peran, 9router sebagai gerbang AI, dan Hermes Agent di
            WhatsApp dan Discord membuat Harum.in cepat, hemat biaya VPS, dan siap diskalakan. Kesimpulan itu
            berlaku dengan {total} catatan revisi di bawah ini.
          </p>
        </header>

        <div className="end-grid">
          <div>
            <h3 className="end-sub">Buku revisi</h3>
            <ol className="ledger">
              {LEDGER.map((l) => (
                <li key={l.where}>
                  <a
                    href={`#${l.target}`}
                    onClick={(e) => {
                      e.preventDefault();
                      scrollToId(l.target);
                    }}
                  >
                    <span className="ledger__n">{l.n}</span>
                    <span className="ledger__what">
                      <span className="ledger__where">{l.where}</span>
                      {l.what}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="end-sub">Urutan bangun yang diusulkan</h3>
            <p className="end-note">Diurutkan dari jumlah pilar industri yang memakai setiap modul (data Bab I).</p>
            <ol className="build-order">
              {ORDER.map((o) => (
                <li key={o.id}>
                  <span className="build-order__id">{o.id}</span>
                  <span className="build-order__name">{o.name}</span>
                  <span className="build-order__track" aria-hidden="true">
                    <span className="build-order__bar" style={{ "--w": o.n / max }} />
                  </span>
                  <span className="build-order__n">{o.n ? `${o.n} pilar` : "lintas"}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
