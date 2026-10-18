import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, dateTime } from "../../../lib/format.js";
import { Badge } from "../../ui/index.jsx";
import { qrSvg } from "../../../lib/qr.js";

const DONE = new Set(["paid", "expired", "cancelled", "failed", "needs_review"]);
const LABEL = {
  pending: ["Menunggu pembayaran", "accent"], paid: ["Lunas", "ok"], expired: ["Kedaluwarsa", "neutral"], cancelled: ["Dibatalkan", "neutral"],
  failed: ["Gagal", "neutral"], needs_review: ["Perlu dicek GM/Owner", "warn"],
};

/** QR dari isi EMV bila muat di encoder kita; selain itu gambar QR dari penyedia (hanya https). */
function QrView({ charge }) {
  const svg = useMemo(() => { try { return charge.qr_string ? qrSvg(charge.qr_string) : null; } catch { return null; } }, [charge.qr_string]);
  if (svg) return <svg className="pos-qr pos-qr--real" viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label="QRIS untuk dipindai pelanggan" shapeRendering="crispEdges"><path d={svg.d} fill="#000" /></svg>;
  if (charge.qr_url && /^https:\/\//.test(charge.qr_url)) return <img className="pos-qr pos-qr--real" src={charge.qr_url} alt="QRIS untuk dipindai pelanggan" referrerPolicy="no-referrer" />;
  return <p className="d-field__error">QR tidak dapat ditampilkan. Buat ulang atau pilih metode lain.</p>;
}

/**
 * QRIS dinamis: Staff membuat QR, pelanggan memindai, dan Pesanan lunas otomatis saat penyedia mengonfirmasi (webhook).
 * Panel ini hanya menampilkan dan menunggu; pelunasan dilakukan server (qris_settle).
 */
export default function QrisPanel({ order, onPaid, disabled }) {
  const { api } = useAuth();
  const [charge, setCharge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);
  const settled = useRef(false);

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  useEffect(() => { stop(); setCharge(null); setErr(null); settled.current = false; }, [order?.id]);

  const poll = useCallback((id) => {
    stop();
    timer.current = setInterval(async () => {
      try {
        const c = await api.qrisStatus(id);
        setCharge(c);
        if (DONE.has(c.status)) {
          stop();
          if (c.status === "paid" && !settled.current) { settled.current = true; onPaid?.(c); }
        }
      } catch (e) { setErr(e.message); }
    }, 3000);
  }, [api, onPaid]);

  const create = async () => {
    setBusy(true); setErr(null); settled.current = false;
    try { const c = await api.qrisCreate(order.id); setCharge(c); if (!DONE.has(c.status)) poll(c.id); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const act = async (fn) => {
    setBusy(true); setErr(null);
    try { const r = await fn(); if (r?.id) setCharge(r); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const [text, tone] = LABEL[charge?.status] ?? ["", "neutral"];
  return (
    <section className="pos-qris pos-qris--dyn" aria-label="QRIS dinamis">
      {!charge ? (
        <div className="d-form">
          <p className="d-text">QRIS dinamis: pelanggan memindai, Pesanan lunas otomatis saat dana dikonfirmasi penyedia. Jumlah mengikuti total Pesanan{" "}
            <span className="d-muted">(diskon voucher ikut; diskon manual dengan PIN dibayar lewat kasir biasa).</span></p>
          <button type="button" className="d-btn d-btn--primary" disabled={busy || disabled} onClick={create}>{busy ? "Membuat QR…" : "QRIS dinamis"}</button>
        </div>
      ) : (
        <div className="d-form" aria-live="polite">
          <p style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", flexWrap: "wrap" }}>
            {charge.status === "pending" && <span className="pos-qris__pulse-dot" aria-hidden="true" />}
            <Badge tone={tone}>{text}</Badge>
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(charge.amount)}</strong>
            {charge.expires_at && charge.status === "pending" && (
              <span className="pos-qris__countdown">· Berlaku s/d {dateTime(charge.expires_at)}</span>
            )}
          </p>
          {charge.status === "pending" && <QrView charge={charge} />}
          {charge.status === "paid" && <p style={{ color: "var(--brand-emerald)", fontWeight: 600 }}>Dana berhasil diterima otomatis. Pesanan lunas.</p>}
          {charge.status === "needs_review" && <p className="d-field__error">{charge.note ?? "Uang masuk tetapi tidak bisa melunasi Pesanan."} GM/Owner sudah diberi tahu; jangan terima ulang.</p>}
          {["expired", "failed", "cancelled"].includes(charge.status) && <p className="d-muted">{charge.note ?? "QR tidak berlaku lagi."}</p>}
          <div className="d-row-actions">
            {charge.status === "pending" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={busy} onClick={() => act(() => api.qrisCancel(charge.id))}>Batalkan QR</button>}
            {["expired", "failed", "cancelled"].includes(charge.status) && <button type="button" className="d-btn d-btn--primary d-btn--sm" disabled={busy} onClick={create}>Buat QR baru</button>}
            {charge.status === "pending" && charge.provider === "sim" && <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={busy} onClick={() => act(async () => { await api.qrisSimulatePaid(charge.id); return api.qrisStatus(charge.id); })}>Simulasikan pembayaran (uji)</button>}
          </div>
        </div>
      )}
      {err && <p className="d-field__error" role="alert">{err}</p>}
    </section>
  );
}
