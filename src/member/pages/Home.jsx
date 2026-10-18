import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAsync, Loading, ErrorNote, Empty } from "../../app/ui/index.jsx";
import { Link } from "../../lib/router.jsx";
import { rupiah, number, date } from "../../lib/format.js";

export default function Home({ brand }) {
  const { api } = useAuth();
  const q = useAsync(() => api.rpc("member_home"), [api]);
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorNote error={q.error} onRetry={q.reload} />;
  const h = q.data;
  return (
    <>
      <section className="m-hero" aria-labelledby="m-hello">
        <p className="d-eyebrow">{brand.welcome_text ?? "Selamat datang kembali"}</p>
        <h1 id="m-hello">Halo, {h.name ?? "Member"}</h1>
        <p className="m-points"><span className="m-points__n">{number(h.points)}</span> <span>poin</span></p>
        <dl className="m-facts">
          <div><dt>Kunjungan</dt><dd>{number(h.visits)}</dd></div>
          <div><dt>Total belanja</dt><dd>{rupiah(h.total_spent)}</dd></div>
          <div><dt>Terakhir</dt><dd>{h.last_visit_at ? date(h.last_visit_at) : "—"}</dd></div>
        </dl>
        <Link to="/m/kartu" className="d-btn d-btn--primary">Tampilkan kartu member</Link>
      </section>

      <section className="m-section" aria-labelledby="m-promo">
        <h2 id="m-promo">Promo berlaku</h2>
        {h.promos.length === 0 ? <Empty title="Belum ada promo">Promo yang berlaku akan muncul di sini.</Empty> : (
          <ul className="m-list">
            {h.promos.map((p) => (
              <li key={p.code} className="m-card">
                <p className="m-card__title">{p.name}</p>
                <p className="d-muted">{p.kind === "pct" ? `${p.value}%` : rupiah(p.value)}{p.min_spend > 0 ? ` · min. belanja ${rupiah(p.min_spend)}` : ""}{p.ends_at ? ` · sampai ${date(p.ends_at)}` : ""}</p>
                <p className="m-code">Sebutkan kode <code>{p.code}</code> di kasir</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {h.last_order && (
        <section className="m-section" aria-labelledby="m-last">
          <h2 id="m-last">Pesanan terakhir</h2>
          <p className="m-card"><span className="d-mono">{h.last_order.code}</span> · {rupiah(h.last_order.total)} · {date(h.last_order.paid_at)} <Link to="/m/riwayat">Lihat riwayat</Link></p>
        </section>
      )}
    </>
  );
}
