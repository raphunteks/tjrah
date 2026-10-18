import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Panel, Loading, ErrorNote, Empty, Badge, useAsync } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useNow, minutesSince } from "../../ops.jsx";
import { PaymentModal } from "../ops/Payment.jsx";

const today = () => new Date().toISOString().slice(0, 10);

/** Satu tagihan terbuka: rincian + e-resep (aturan pakai) + konfirmasi serah obat sebelum bayar. */
function Invoice({ o, lines, rx, rxItems, canPay, shiftOpen, onPay, now }) {
  const [ready, setReady] = useState(false);
  const hasRx = rx?.status === "sent" && rxItems.length > 0;
  return (
    <article className="bill">
      <header className="bill__head">
        <div>
          <p className="bill__who">{o.customer_name ?? "Pasien"}</p>
          <p className="d-list__meta"><span className="d-mono">{o.code}</span> · terbit {minutesSince(o.created_at, now)} mnt lalu{rx?.practitioner_name ? ` · ${rx.practitioner_name}` : ""}</p>
        </div>
        <p className="bill__total d-num">{rupiah(o.subtotal)}</p>
      </header>
      <ul className="pos-lines">
        {lines.map((l) => <li key={l.id}><span>{Number(l.qty)}× {l.name}</span><span /><span className="d-num">{rupiah(l.qty * l.price)}</span></li>)}
      </ul>
      {hasRx && (
        <section className="rx-card" aria-label={`E-resep ${o.customer_name ?? ""}`}>
          <p className="rx-card__head"><span className="rx-card__r" aria-hidden="true">R/</span> E-resep · siapkan obat</p>
          <ol>
            {rxItems.map((i) => (
              <li key={i.id}>
                <span className="rx-card__name">{i.name}</span>
                <span className="d-mono">{Number(i.qty)}</span>
                <span className="rx-card__signa">S. {i.signa}{i.days ? ` · ${i.days} hari` : ""}</span>
              </li>
            ))}
          </ol>
          {canPay && (
            <label className="d-check rx-card__ok">
              <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} />
              Obat sudah disiapkan dan aturan pakai dijelaskan ke pasien
            </label>
          )}
        </section>
      )}
      {canPay && (
        <div className="bill__actions">
          <button type="button" className="d-btn d-btn--primary" disabled={!shiftOpen || (hasRx && !ready)} onClick={() => onPay(o)}>
            Terima pembayaran
          </button>
          {hasRx && !ready && <span className="d-text d-muted">Centang serah obat dulu.</span>}
        </div>
      )}
    </article>
  );
}

export default function Billing() {
  const { api, role, profile } = useAuth();
  const b = useBranch();
  const now = useNow(30000);
  const listRef = useRef(null);
  const [payOrder, setPayOrder] = useState(null);
  const canPay = can(role, 5, "c");

  const data = useAsync(async () => {
    if (!b.branchId) return null;
    const [orders, rxs, shifts] = await Promise.all([
      api.list("orders", { eq: { branch_id: b.branchId, channel: "clinic" }, order: ["created_at", "desc"], limit: 60 }),
      api.list("prescriptions", { eq: { branch_id: b.branchId }, order: ["created_at", "desc"], limit: 60 }),
      canPay ? api.list("shifts", { eq: { cashier_id: profile.id, status: "open" } }) : [],
    ]);
    const ids = orders.map((o) => o.id);
    const rxIds = rxs.map((r) => r.id);
    const [lines, items] = await Promise.all([
      ids.length ? api.list("order_items", { inList: ["order_id", ids] }) : [],
      rxIds.length ? api.list("prescription_items", { inList: ["prescription_id", rxIds], order: ["created_at"] }) : [],
    ]);
    return { orders, rxs, lines, items, shiftOpen: shifts.length > 0 };
  }, [api, b.branchId, canPay, profile.id]);
  useLive(["orders", "prescriptions", "shifts"], data.reload);

  const d = data.data;
  const open = useMemo(() => (d?.orders ?? []).filter((o) => o.status === "open"), [d]);
  const paid = useMemo(() => (d?.orders ?? []).filter((o) => o.status === "paid" && o.paid_at?.slice(0, 10) === today()), [d]);
  const rxOf = (o) => d.rxs.find((r) => r.order_id === o.id);

  useGSAP(() => {
    if (prefersReducedMotion() || !listRef.current?.children.length) return;
    gsap.from(listRef.current.children, { opacity: 0, y: 8, stagger: 0.05, duration: 0.3, ease: "power2.out", clearProps: "opacity,transform" });
  }, { scope: listRef, dependencies: [b.branchId, open.length] });

  return (
    <>
      <PageHead eyebrow="Fitur 5 · 17 R (Billing Obat)" title="Tagihan & e-resep"
        desc="Tagihan terbit otomatis saat dokter menutup kunjungan. Kasir membaca e-resep, menyerahkan obat, lalu menerima pembayaran. Jasa kesehatan tanpa pajak penjualan."
        actions={<BranchSelect b={b} />} />
      {canPay && d && !d.shiftOpen && (
        <p className="d-note d-note--warn">Shift kasir belum dibuka. <Link to="/app/shift">Buka shift</Link> sebelum menerima pembayaran.</p>
      )}
      {!canPay && <p className="d-note">Tampilan baca saja: matriks memberi peran Anda R pada fitur 5.</p>}
      <div className="bill-layout">
        <Panel title="Menunggu pembayaran" meta={`${open.length} tagihan`}>
          {data.loading && !d ? <Loading /> : data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : open.length === 0 ? (
            <Empty title="Tidak ada tagihan terbuka">Tagihan muncul di sini saat dokter menekan “Tutup kunjungan & terbitkan”.</Empty>
          ) : (
            <div className="bills" ref={listRef}>
              {open.map((o) => {
                const rx = rxOf(o);
                return (
                  <Invoice key={o.id} o={o} now={now} lines={d.lines.filter((l) => l.order_id === o.id)}
                    rx={rx} rxItems={rx ? d.items.filter((i) => i.prescription_id === rx.id) : []}
                    canPay={canPay} shiftOpen={d.shiftOpen} onPay={setPayOrder} />
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Lunas hari ini" meta={rupiah(paid.reduce((s, o) => s + o.total, 0))}>
          {paid.length === 0 ? <p className="d-text d-muted">Belum ada.</p> : (
            <ul className="d-list">
              {paid.map((o) => {
                const rx = rxOf(o);
                return (
                  <li key={o.id}>
                    <div><p className="d-list__title">{o.customer_name ?? o.code}</p><p className="d-list__meta">{dateTime(o.paid_at)} · <span className="d-mono">{o.code}</span></p></div>
                    <div className="d-row-actions">
                      {rx?.status === "dispensed" && <Badge tone="ok">Obat diserahkan</Badge>}
                      <span className="d-num">{rupiah(o.total)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
      <PaymentModal open={Boolean(payOrder)} order={payOrder} onClose={() => setPayOrder(null)} onPaid={data.reload} />
    </>
  );
}
