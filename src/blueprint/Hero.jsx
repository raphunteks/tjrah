import { useRef } from "react";
import { useBP } from "./BlueprintData.jsx";
import { gsap, useGSAP, MOTION_OK, MOTION_REDUCED, scrollToId } from "../lib/gsap.js";

export default function Hero() {
  const { HERO } = useBP();
  const { title: TITLE, ask: ASK, facts: FACTS } = HERO;
  const root = useRef(null);
  const typed = useRef(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        typed.current.textContent = "";
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from(".hero__eyebrow", { y: 10, opacity: 0, duration: 0.5 })
          .from(".hero__word", { yPercent: 110, duration: 0.9, stagger: 0.05 }, "<0.05")
          .from(".hero__lede, .hero__cta", { y: 12, opacity: 0, duration: 0.6, stagger: 0.08 }, "-=0.55")
          .from(".code", { y: 16, opacity: 0, duration: 0.8 }, "-=0.6")
          .from(".fact", { y: 10, opacity: 0, duration: 0.5, stagger: 0.06 }, "-=0.5");

        // Ketik satu baris sekali, lalu statis.
        const state = { n: 0 };
        tl.to(
          state,
          {
            n: ASK.length,
            duration: ASK.length * 0.028,
            ease: "none",
            onUpdate: () => {
              typed.current.textContent = ASK.slice(0, Math.round(state.n));
            },
          },
          "-=0.3"
        )
          .from(".code__resp", { opacity: 0, y: 6, duration: 0.5, stagger: 0.12 })
          .set(".code__caret", { autoAlpha: 0 });
      });

      mm.add(MOTION_REDUCED, () => {
        typed.current.textContent = ASK;
        gsap.set(".code__caret", { autoAlpha: 0 });
      });
    },
    { scope: root }
  );

  return (
    <section className="hero" id="ringkasan" ref={root} aria-labelledby="hero-title">
      <div className="wrap hero__grid">
        <div className="hero__copy">
          <p className="eyebrow hero__eyebrow">
            <span className="eyebrow__tick" aria-hidden="true" />
            Blueprint arsitektur · Bab I–VI
          </p>
          <h1 className="hero__title" id="hero-title">
            {TITLE.map((w, i) => (
              <span key={i}>
                <span className="hero__mask"><span className="hero__word">{w}</span></span>{i < TITLE.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
          <p className="hero__lede">{HERO.lede}</p>
          <div className="hero__cta">
            <a className="btn btn--primary" href="#topologi" onClick={(e) => { e.preventDefault(); scrollToId("topologi"); }}>
              Telusuri topologi
            </a>
            <a className="link" href="#keputusan" onClick={(e) => { e.preventDefault(); scrollToId("keputusan"); }}>
              4 keputusan arsitektur terbuka
            </a>
          </div>
        </div>

        <figure className="code" aria-label="Contoh permintaan Owner lewat Hermes Agent ke 9router">
          <figcaption className="code__head">
            <span className="code__file">hermes → 9router /v1/chat/completions</span>
            <span className="status status--ok">200 OK</span>
          </figcaption>
          <pre className="code__body">
            <code>
              <span className="tok-muted"># WhatsApp Owner → Hermes Agent</span>{"\n"}
              <span className="tok-key">POST</span> {HERO.endpoint}{"\n"}
              <span className="tok-punc">{"{"}</span>{"\n"}
              {"  "}<span className="tok-key">"model"</span><span className="tok-punc">:</span> <span className="tok-str">"auto"</span><span className="tok-punc">,</span>{"\n"}
              {"  "}<span className="tok-key">"messages"</span><span className="tok-punc">: [{"{"}</span> <span className="tok-key">"role"</span><span className="tok-punc">:</span> <span className="tok-str">"user"</span><span className="tok-punc">,</span>{"\n"}
              {"    "}<span className="tok-key">"content"</span><span className="tok-punc">:</span> <span className="tok-str">"<span ref={typed}>{ASK}</span>"</span><span className="code__caret" aria-hidden="true">▍</span>{"\n"}
              {"  "}<span className="tok-punc">{"}]"}</span>{"\n"}
              <span className="tok-punc">{"}"}</span>{"\n"}
              {"\n"}
              <span className="code__resp"><span className="tok-muted"># 9router: claude → gemini (failover)</span>{"\n"}</span>
              <span className="code__resp"><span className="tok-key">tool</span> harum.sales.summary<span className="tok-punc">(</span><span className="tok-str">branch="makassar"</span><span className="tok-punc">,</span> <span className="tok-str">date="today"</span><span className="tok-punc">)</span>{"\n"}</span>
              <span className="code__resp"><span className="tok-muted"># → dibalas ke WhatsApp Owner</span></span>
            </code>
          </pre>
        </figure>
      </div>

      <div className="wrap">
        <dl className="facts" aria-label="Cakupan dokumen">
          {FACTS.map((f) => (
            <div className="fact" key={f.l}>
              <dt>
                <span className="fact__n">{f.n}</span> {f.l}
              </dt>
              <dd>{f.d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
