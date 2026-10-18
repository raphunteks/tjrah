import { useRef } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK } from "../lib/gsap.js";

export default function Decisions() {
  const { DECISIONS } = useBP();
  const root = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from(".band-head > *", {
          y: 12,
          opacity: 0,
          stagger: 0.08,
          scrollTrigger: { trigger: ".band-head", start: "top 80%", once: true },
        });
        gsap.set(".decision", { opacity: 0, y: 16 });
        ScrollTrigger.batch(".decision", {
          start: "top 88%",
          once: true,
          onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, stagger: 0.09, overwrite: true }),
        });
        // Garis penghubung "asli → usul" digambar saat kartu masuk viewport.
        gsap.utils.toArray(".decision__arrow").forEach((el) => {
          gsap.fromTo(
            el,
            { scaleX: 0 },
            { scaleX: 1, duration: 0.6, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%", once: true } }
          );
        });
      });
    },
    { scope: root }
  );

  return (
    <section className="band" id="keputusan" ref={root} aria-labelledby="band-title">
      <div className="wrap">
        <header className="band-head">
          <p className="eyebrow eyebrow--dark"><span className="eyebrow__tick" aria-hidden="true" />1.3 · Keputusan terbuka</p>
          <h2 id="band-title">Empat hal di Bab I yang harus dikunci sebelum menulis kode.</h2>
          <p className="band-head__lede">
            Teks asli dipertahankan di kiri. Usulan revisi di kanan, beserta risiko jika dibiarkan.
            Revisi hak akses (Superadmin atas rekam medis, role Supervisor yang tidak ada, celah Goods
            Receipt) dibahas pada Matriks RBAC.
          </p>
        </header>

        <ol className="decisions">
          {DECISIONS.map((d) => (
            <li className="decision" key={d.id}>
              <p className="decision__id">{d.id}</p>
              <h3>{d.title}</h3>
              <div className="decision__pair">
                <p className="decision__asli"><span className="decision__k">Asli</span>{d.asli}</p>
                <span className="decision__arrow" aria-hidden="true" />
                <p className="decision__usul"><span className="decision__k decision__k--usul">Revisi</span>{d.usul}</p>
              </div>
              <p className="decision__risk"><span className="decision__k">Risiko</span>{d.risiko}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
