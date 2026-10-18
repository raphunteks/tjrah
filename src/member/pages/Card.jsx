import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { qrSvg } from "../../lib/qr.js";
import { Loading, ErrorNote } from "../../app/ui/index.jsx";

const TTL = 90;

/** Kartu Member: QR berumur 90 detik, diperbarui otomatis. Staf memindainya di kasir untuk memilih Pelanggan. */
export default function Card() {
  const { api } = useAuth();
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [left, setLeft] = useState(TTL);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    api.rpc("member_card_token").then((t) => { if (live) { setToken(t); setLeft(TTL); } }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [api, tick]);

  useEffect(() => {
    if (!token) return undefined;
    const id = setInterval(() => setLeft((s) => { if (s <= 1) { setTick((n) => n + 1); return TTL; } return s - 1; }), 1000);
    return () => clearInterval(id);
  }, [token]);

  const qr = useMemo(() => (token ? qrSvg(token, { margin: 2 }) : null), [token]);
  if (error) return <ErrorNote error={error} onRetry={() => setTick((n) => n + 1)} />;
  if (!qr) return <Loading />;
  return (
    <section className="m-card-wrap" aria-labelledby="m-card-t">
      <h1 id="m-card-t">Kartu member</h1>
      <figure className="m-qr">
        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="Kode QR kartu member" shapeRendering="crispEdges">
          <rect width={qr.size} height={qr.size} fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
        <figcaption>Tunjukkan ke kasir. Kode diperbarui otomatis dalam <strong>{left}</strong> detik.</figcaption>
      </figure>
      <button type="button" className="d-btn d-btn--ghost" onClick={() => setTick((n) => n + 1)}>Muat ulang kode</button>
    </section>
  );
}
