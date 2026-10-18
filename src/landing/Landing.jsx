import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "../lib/router.jsx";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK, MOTION_REDUCED, scrollToId } from "../lib/gsap.js";
import { NAV, INDUSTRIES, MODULES, STEPS, ROLES, PLANS, FAQ } from "./content.js";
import "../styles/landing.css";

const TABLES = ["01", "02", "03", "04", "05", "06", "07", "08"];
const STATUS = [
  { k: "available", label: "Kosong" },
  { k: "occupied", label: "Terisi" },
  { k: "cooking", label: "Diproses dapur" },
  { k: "reserved", label: "Reservasi" },
  { k: "dirty", label: "Perlu dibersihkan" },
];
const START = ["occupied", "available", "cooking", "available", "reserved", "occupied", "dirty", "available"];

/* ───────── Denah meja: komponen nyata, bukan gambar ───────── */
function FloorDemo() {
  const root = useRef(null);
  const [state, setState] = useState(START);

  // Simulasi layanan: status meja berganti berkala, berhenti saat di luar layar.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        let i = 0;
        const order = [0, 1, 2, 4, 6, 3, 5, 7];
        const tick = gsap.delayedCall(1.6, function step() {
          const t = order[i++ % order.length];
          setState((s) => s.map((v, j) => (j === t ? STATUS[(STATUS.findIndex((x) => x.k === v) + 1) % STATUS.length].k : v)));
          tick.restart(true);
        });
        ScrollTrigger.create({
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => (self.isActive ? tick.resume() : tick.pause()),
        });
      });
    },
    { scope: root }
  );

  const cycle = (i) => setState((s) => s.map((v, j) => (j === i ? STATUS[(STATUS.findIndex((x) => x.k === v) + 1) % STATUS.length].k : v)));
  const count = (k) => state.filter((v) => v === k).length;

  return (
    <figure className="lp-floor" ref={root} aria-labelledby="floor-cap">
      <div className="lp-floor__head">
        <p id="floor-cap" className="lp-floor__title">Denah meja · Lantai 1</p>
        <p className="lp-floor__hint">Klik meja untuk mengubah status</p>
      </div>
      <ul className="lp-floor__grid">
        {TABLES.map((t, i) => (
          <li key={t}>
            <button
              type="button"
              className={`lp-table lp-table--${state[i]}${i === 0 || i === 5 ? " lp-table--wide" : ""}`}
              onClick={() => cycle(i)}
              aria-label={`Meja ${t}: ${STATUS.find((s) => s.k === state[i]).label}`}
            >
              <span className="lp-table__no">{t}</span>
              <span className="lp-table__st">{STATUS.find((s) => s.k === state[i]).label}</span>
            </button>
          </li>
        ))}
      </ul>
      <ul className="lp-floor__legend" aria-label="Ringkasan status">
        {STATUS.map((s) => (
          <li key={s.k}><span className={`lp-dot lp-dot--${s.k}`} aria-hidden="true" />{s.label} <strong>{count(s.k)}</strong></li>
        ))}
      </ul>
    </figure>
  );
}

/* ───────── Nav N1b ───────── */
function Nav() {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useGSAP(() => {
    ScrollTrigger.create({ start: 8, end: "max", toggleClass: { targets: root.current, className: "is-scrolled" } });
  }, { scope: root });
  const go = (e, id) => {
    e.preventDefault();
    setOpen(false);
    scrollToId(id);
  };
  return (
    <header className={`lp-nav${open ? " is-open" : ""}`} ref={root}>
      <div className="lp-wrap lp-nav__inner">
        <a href="/" className="lp-brand" onClick={(e) => go(e, "top")}>
          <img src="/tijarah-logo.svg" alt="Tijarah" width="28" height="28" style={{ width: "28px", height: "28px", borderRadius: "4px" }} />
          <span>Tijarah</span>
        </a>
        <nav className="lp-nav__links" aria-label="Utama" id="lp-menu">
          {NAV.map((n) => <a key={n.id} href={`#${n.id}`} onClick={(e) => go(e, n.id)}>{n.label}</a>)}
          <Link to="/masuk" className="lp-nav__login lp-only-mobile">Masuk</Link>
        </nav>
        <div className="lp-nav__actions">
          <Link to="/masuk" className="lp-link lp-hide-mobile">Masuk</Link>
          <Link to="/masuk" className="lp-btn lp-btn--primary lp-btn--sm">Coba demo</Link>
          <button type="button" className="lp-burger" aria-expanded={open} aria-controls="lp-menu" onClick={() => setOpen((o) => !o)}>
            <span className="sr-only">{open ? "Tutup menu" : "Buka menu"}</span>
            <span aria-hidden="true">{open ? "×" : "≡"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <main className="lp-404">
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat ini tidak ada di Tijarah.</p>
      <Link to="/" className="lp-btn lp-btn--primary">Kembali ke beranda</Link>
    </main>
  );
}

export default function Landing() {
  const { path } = useRouter();
  const root = useRef(null);
  const [ind, setInd] = useState(INDUSTRIES[0].id);
  const industry = INDUSTRIES.find((i) => i.id === ind);

  useEffect(() => {
    document.title = "Tijarah · Smart Trade, Better Business — Cloud OS & POS Multi-Tenant";
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.timeline({ defaults: { ease: "expo.out" } })
          .from(".lp-hero__eyebrow", { y: 10, opacity: 0, duration: 0.5 })
          .from(".lp-hero__word", { yPercent: 105, duration: 0.9, stagger: 0.045 }, "<0.05")
          .from(".lp-hero__lede, .lp-hero__cta", { y: 12, opacity: 0, duration: 0.6, stagger: 0.08 }, "-=0.6")
          .from(".lp-floor", { y: 18, opacity: 0, duration: 0.8 }, "-=0.6");

        gsap.utils.toArray(".lp-reveal").forEach((el) => {
          gsap.from(el, { y: 16, opacity: 0, duration: 0.7, scrollTrigger: { trigger: el, start: "top 86%", once: true } });
        });
        ScrollTrigger.batch(".lp-mod", {
          start: "top 90%",
          once: true,
          onEnter: (els) => gsap.from(els, { y: 14, opacity: 0, stagger: 0.05, duration: 0.55, overwrite: true }),
        });
        // Garis progres langkah, di-scrub ke scroll.
        gsap.fromTo(".lp-steps__rail-fill", { scaleY: 0 }, {
          scaleY: 1, ease: "none",
          scrollTrigger: { trigger: ".lp-steps", start: "top 70%", end: "bottom 60%", scrub: 0.4 },
        });
        // Langkah redup lalu menyala saat tiba di garis baca; tanpa JS semuanya tampil penuh.
        gsap.utils.toArray(".lp-step").forEach((el) => {
          gsap.fromTo(el, { opacity: 0.4 }, {
            opacity: 1, duration: 0.5, ease: "power1.out",
            scrollTrigger: { trigger: el, start: "top 65%", toggleActions: "play none none reverse" },
          });
        });
      });
    },
    { scope: root }
  );

  // Ganti industri: konten panel masuk dengan crossfade singkat.
  useGSAP(
    () => {
      if (window.matchMedia(MOTION_REDUCED).matches) return;
      gsap.fromTo(".lp-ind__panel > *", { opacity: 0, y: 8 }, { opacity: 1, y: 0, stagger: 0.04, duration: 0.35, overwrite: true });
    },
    { dependencies: [ind], scope: root }
  );

  if (path !== "/") return <NotFound />;

  const onTabKey = (e, i) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = INDUSTRIES[(i + dir + INDUSTRIES.length) % INDUSTRIES.length];
    setInd(next.id);
    requestAnimationFrame(() => document.getElementById(`ind-${next.id}`)?.focus());
  };

  return (
    <div className="lp" ref={root} id="top">
      <a className="skip-link" href="#konten">Lompat ke konten</a>
      <Nav />
      <main id="konten">
        {/* ───────── Hero (Workbench: produk nyata di kanan) ───────── */}
        <section className="lp-hero" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__copy">
              <p className="lp-eyebrow lp-hero__eyebrow">Kasir & ERP untuk usaha Indonesia</p>
              <h1 id="lp-title" className="lp-hero__title">
                {"Jualan, stok, dan laba dalam satu kasir.".split(" ").map((w, i, a) => (
                  <span key={i}><span className="lp-hero__mask"><span className="lp-hero__word">{w}</span></span>{i < a.length - 1 ? " " : ""}</span>
                ))}
              </h1>
              <p className="lp-hero__lede">
                Tijarah menyatukan kasir POS, dapur, gudang berbasis resep, akuntansi PSAK, SDM, dan pelanggan. Setiap porsi yang terjual
                langsung memotong stok bahan dan tercatat di buku besar, untuk satu outlet maupun puluhan cabang.
              </p>
              <div className="lp-hero__cta">
                <Link to="/masuk" className="lp-btn lp-btn--primary">Coba dashboard demo</Link>
                <a href="#fitur" className="lp-link" onClick={(e) => { e.preventDefault(); scrollToId("fitur"); }}>Lihat 12 modul</a>
              </div>
            </div>
            <FloorDemo />
          </div>
        </section>

        {/* ───────── Industri (tab) ───────── */}
        <section className="lp-sec" id="industri" aria-labelledby="ind-title">
          <div className="lp-wrap">
            <header className="lp-sec__head lp-reveal">
              <h2 id="ind-title">Satu sistem untuk enam jenis usaha.</h2>
              <p>Modulnya sama, susunannya berbeda. Pilih jenis usaha Anda.</p>
            </header>
            <div className="lp-ind lp-reveal">
              <div className="lp-ind__tabs" role="tablist" aria-label="Jenis usaha" aria-orientation="vertical">
                {INDUSTRIES.map((x, i) => (
                  <button key={x.id} id={`ind-${x.id}`} type="button" role="tab" aria-selected={ind === x.id} aria-controls="ind-panel"
                    tabIndex={ind === x.id ? 0 : -1} onClick={() => setInd(x.id)} onKeyDown={(e) => onTabKey(e, i)}>
                    {x.name}
                  </button>
                ))}
              </div>
              <div className="lp-ind__panel" id="ind-panel" role="tabpanel" aria-labelledby={`ind-${ind}`}>
                <p className="lp-ind__who">{industry.who}</p>
                <h3>{industry.name}</h3>
                <ul>
                  {industry.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Modul (bento) ───────── */}
        <section className="lp-sec lp-sec--tint" id="fitur" aria-labelledby="mod-title">
          <div className="lp-wrap">
            <header className="lp-sec__head lp-reveal">
              <h2 id="mod-title">Dua belas modul, satu basis data.</h2>
              <p>Tidak ada ekspor-impor antar aplikasi. Kasir, gudang, dan akuntansi membaca data yang sama.</p>
            </header>
            <ul className="lp-bento">
              {MODULES.map((m) => (
                <li key={m.code} className={`lp-mod lp-mod--${m.size}`}>
                  <p className="lp-mod__code">{m.code}</p>
                  <h3>{m.name}</h3>
                  <p>{m.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── Cara kerja ───────── */}
        <section className="lp-sec" id="cara-kerja" aria-labelledby="how-title">
          <div className="lp-wrap lp-how">
            <header className="lp-sec__head lp-how__head lp-reveal">
              <h2 id="how-title">Dari daftar sampai laporan, empat langkah.</h2>
              <p>Setiap orang di tim melihat menu sesuai perannya. Kasir tidak melihat laba, Owner tidak perlu membuka kasir.</p>
              <ul className="lp-roles">
                {ROLES.map((r) => (
                  <li key={r.lv}><strong>{r.lv}</strong> {r.text}</li>
                ))}
              </ul>
            </header>
            <div className="lp-steps">
              <span className="lp-steps__rail" aria-hidden="true"><span className="lp-steps__rail-fill" /></span>
              <ol className="lp-steps__list">
              {STEPS.map((s) => (
                <li key={s.n} className="lp-step">
                  <span className="lp-step__n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ───────── Paket ───────── */}
        <section className="lp-sec lp-sec--tint" id="harga" aria-labelledby="plan-title">
          <div className="lp-wrap">
            <header className="lp-sec__head lp-reveal">
              <h2 id="plan-title">Paket mengikuti ukuran usaha.</h2>
              <p>Harga diumumkan saat peluncuran. Semua paket memakai sistem yang sama, yang berbeda hanya modul dan jumlah cabang.</p>
            </header>
            <ul className="lp-plans">
              {PLANS.map((p) => (
                <li key={p.name} className={`lp-plan lp-reveal${p.featured ? " lp-plan--featured" : ""}`}>
                  <h3>{p.name}</h3>
                  <p className="lp-plan__for">{p.for}</p>
                  <p className="lp-plan__price">Harga segera</p>
                  <p className="lp-plan__br">{p.branches}</p>
                  <ul>{p.modules.map((m) => <li key={m}>{m}</li>)}</ul>
                  <Link to="/masuk" className={`lp-btn ${p.featured ? "lp-btn--primary" : "lp-btn--ghost"}`}>Coba demo {p.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ───────── FAQ ───────── */}
        <section className="lp-sec" id="faq" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq">
            <header className="lp-sec__head lp-reveal">
              <h2 id="faq-title">Pertanyaan yang sering muncul.</h2>
            </header>
            <div className="lp-faq__list">
              {FAQ.map((f) => (
                <details key={f.q} className="lp-qa">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── CTA ───────── */}
        <section className="lp-cta" aria-labelledby="cta-title">
          <div className="lp-wrap lp-cta__inner lp-reveal">
            <h2 id="cta-title">Lihat dashboard Owner, GM, dan kasir sekarang.</h2>
            <p>Mode demo memakai data contoh dan langsung bisa dicoba, tanpa mendaftar.</p>
            <Link to="/masuk" className="lp-btn lp-btn--light">Buka dashboard demo</Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__inner">
          <p className="lp-brand">
            <img src="/tijarah-logo.svg" alt="Tijarah" width="24" height="24" style={{ width: "24px", height: "24px", borderRadius: "4px" }} />
            <span>Tijarah</span>
          </p>
          <p className="lp-foot__line">Smart Trade, Better Business · Cloud OS & POS Multi-Tenant</p>
          <Link to="/masuk" className="lp-link">Masuk</Link>
        </div>
      </footer>
    </div>
  );
}
