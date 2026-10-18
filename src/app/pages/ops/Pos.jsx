import { useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Loading, ErrorNote, Modal, Field, Badge, useAsync, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useAction, Feedback, useIndex } from "../../ops.jsx";
import { PaymentModal } from "./Payment.jsx";
import OfflineBar from "./OfflineBar.jsx";
import { taxOf, taxLabel } from "../../../lib/tax.js";

const TABLE_STATUS = { available: "Kosong", occupied: "Terisi", cooking: "Diproses dapur", reserved: "Reservasi", dirty: "Perlu dibersihkan" };
const KITCHEN = { new: ["Baru", "neutral"], cooking: ["Dimasak", "warn"], ready: ["Siap", "ok"], served: ["Diantar", "neutral"] };
const VOID_REASONS = ["Salah Input Kasir", "Pelanggan Membatalkan", "Masakan Rusak"];

export default function Pos() {
  const { api, role, profile, tenant } = useAuth();
  const b = useBranch();
  const root = useRef(null);
  const [tab, setTab] = useState("meja");
  const [sel, setSel] = useState(null); // { tableId } | { takeaway: true } | { orderId }
  const [cart, setCart] = useState([]);
  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");
  const [payOrder, setPayOrder] = useState(null); // salinan pesanan saat dialog dibuka (tetap ada setelah lunas)
  const [moveOpen, setMoveOpen] = useState(false);
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0]);
  const [voidNote, setVoidNote] = useState("");
  const [voidOption, setVoidOption] = useState("restock");
  const a = useAction();

  const data = useAsync(async () => {
    if (!b.branchId) return null;
    const tId = tenant?.id || b.branch?.tenant_id;
    const [tables, products, orders, shifts, recent] = await Promise.all([
      api.list("tables", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, order: ["sort"] }),
      api.list("products", { eq: tId ? { tenant_id: tId } : {}, order: ["name"] }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "open" }, order: ["created_at"] }),
      api.list("shifts", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "open" } }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "paid" }, order: ["paid_at", "desc"], limit: 8 }),
    ]);
    const ids = orders.map((o) => o.id);
    const items = ids.length ? await api.list("order_items", { inList: ["order_id", ids], order: ["created_at"] }) : [];
    return { tables, products, orders, items, myShift: shifts.find((s) => s.cashier_id === profile.id), recent };
  }, [api, b.branchId, tenant?.id, b.branch?.tenant_id]);
  useLive(["tables", "orders", "order_items", "products"], data.reload);

  useGSAP(() => {
    if (prefersReducedMotion() || !root.current?.querySelector(".pos-table")) return;
    gsap.from(".pos-table", { opacity: 0, y: 8, stagger: 0.025, duration: 0.35, ease: "power2.out" });
  }, { scope: root, dependencies: [b.branchId, Boolean(data.data)] });

  const d = data.data;
  const prodIdx = useIndex(d?.products);
  const order = useMemo(() => {
    if (!d || !sel) return null;
    if (sel.orderId) return d.orders.find((o) => o.id === sel.orderId) ?? null;
    if (sel.tableId) return d.orders.find((o) => o.table_id === sel.tableId) ?? null;
    return null;
  }, [d, sel]);
  const orderItems = order ? d.items.filter((i) => i.order_id === order.id) : [];
  const cats = ["Semua", ...new Set((d?.products ?? []).map((p) => p.category))];
  const shown = (d?.products ?? []).filter((p) => (cat === "Semua" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase()));
  const cartTotal = cart.reduce((s, c) => s + c.qty * (prodIdx[c.product_id]?.price ?? 0), 0);
  const canSell = can(role, 5, "c");

  const addToCart = (p) => {
    if (!p.is_available) return;
    setCart((c) => {
      const i = c.findIndex((x) => x.product_id === p.id && !x.note);
      return i >= 0 ? c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) : [...c, { product_id: p.id, qty: 1, note: "" }];
    });
    if (window.matchMedia("(max-width: 960px)").matches) setTab("tiket");
  };
  const pickTable = (t) => {
    if (t.status === "dirty") {
      a.run(() => api.update("tables", t.id, { status: "available" }), `Meja ${t.label} siap dipakai lagi`).then(data.reload);
      return;
    }
    setSel({ tableId: t.id });
    setCart([]);
    setTab("menu");
  };
  const send = () =>
    a.run(async () => {
      const o = await api.rpc("create_order", {
        p_branch: b.branchId,
        p_items: cart,
        p_table: order ? null : sel?.tableId ?? null,
        p_channel: sel?.takeaway ? "takeaway" : "dine_in",
        p_order: order?.id ?? null,
      });
      setCart([]);
      setSel({ orderId: o.id });
      data.reload();
      return o;
    }, "Pesanan terkirim ke layar dapur");
  const openPay = () =>
    a.run(async () => {
      const lock = await api.lockTable(b.branchId, order.table_id);
      if (!lock.locked) throw new Error("Meja ini sedang diproses di kasir lain");
      setPayOrder(order);
    });
  const moveTo = (t) =>
    a.run(async () => {
      await api.rpc("move_order", { p_order: order.id, p_table: t.id });
      setMoveOpen(false);
      setSel({ tableId: t.id });
      data.reload();
    }, "Pesanan dipindah");
  const sendVoid = () =>
    a.run(async () => {
      await api.rpc("request_void", { p_order: voidFor.id, p_reason: voidReason, p_note: voidNote, p_option: voidOption });
      setVoidFor(null);
      setVoidNote("");
    }, "Permintaan void dikirim. Nota baru batal setelah GM/Owner memutuskan dengan PIN.");

  const ctxLabel = order ? (order.table_label ? `Meja ${order.table_label}` : `Takeaway · ${order.code}`) : sel?.tableId ? `Meja ${d?.tables.find((t) => t.id === sel.tableId)?.label}` : sel?.takeaway ? "Takeaway baru" : "Pilih meja atau takeaway";

  return (
    <div ref={root}>
      <PageHead
        eyebrow="Fitur 5 · Register transaksi POS"
        title="Kasir"
        actions={<BranchSelect b={b} />}
      />
      {!canSell && <p className="d-note">Peran Anda hanya dapat melihat (R) register transaksi.</p>}
      {canSell && d && !d.myShift && (
        <p className="d-note d-note--warn">Shift kasir belum dibuka. Pesanan bisa dikirim ke dapur, tetapi pembayaran butuh shift. <Link to="/app/shift">Buka shift</Link></p>
      )}
      {data.loading && !d ? <Loading /> : data.error ? <ErrorNote error={data.error} onRetry={data.reload} /> : !d ? <Empty title="Pilih cabang" /> : (
        <>
          <div className="pos-tabs d-seg" role="tablist" aria-label="Bagian kasir">
            {[["meja", "Meja"], ["menu", "Menu"], ["tiket", `Tiket${cart.length ? ` · ${cart.length}` : ""}`]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} aria-checked={tab === k} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className={`pos pos--${tab}`}>
            {/* Denah meja */}
            <section className="pos-col pos-col--floor" aria-label="Denah meja">
              {[...new Set(d.tables.map((t) => t.area))].map((area) => (
                <div key={area}>
                  <p className="d-nav__label">{area}</p>
                  <ul className="pos-floor">
                    {d.tables.filter((t) => t.area === area).map((t) => (
                      <li key={t.id}>
                        <button type="button" className={`pos-table st--${t.status}${sel?.tableId === t.id || order?.table_id === t.id ? " is-sel" : ""}`}
                          onClick={() => pickTable(t)} aria-label={`Meja ${t.label}, ${TABLE_STATUS[t.status]}`}>
                          <span className="pos-table__no">{t.label}</span>
                          <span className="pos-table__st">{TABLE_STATUS[t.status]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button type="button" className="d-btn d-btn--ghost d-btn--block" onClick={() => { setSel({ takeaway: true }); setCart([]); setTab("menu"); }}>+ Takeaway</button>
              {d.orders.filter((o) => !o.table_id).length > 0 && (
                <div>
                  <p className="d-nav__label">Takeaway terbuka (hold)</p>
                  <ul className="d-links">
                    {d.orders.filter((o) => !o.table_id).map((o) => (
                      <li key={o.id}><button type="button" className="pos-hold" onClick={() => { setSel({ orderId: o.id }); setTab("tiket"); }}><span className="d-mono">{o.code}</span><span>{rupiah(o.subtotal)}</span></button></li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Menu */}
            <section className="pos-col pos-col--menu" aria-label="Menu">
              <div className="pos-menu-head">
                <input type="search" placeholder="Cari menu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari menu" />
                <div className="d-chips">
                  {cats.map((c) => <button key={c} type="button" className={`d-chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
                </div>
              </div>
              <ul className="pos-menu">
                {shown.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="pos-prod" disabled={!p.is_available || !canSell || !sel} onClick={() => addToCart(p)}>
                      <span className="pos-prod__name">{p.name}</span>
                      <span className="pos-prod__price">{p.is_available ? rupiah(p.price) : "Habis (86)"}</span>
                      <span className="pos-prod__st d-mono">{p.station}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!sel && <p className="d-text d-muted">Pilih meja atau takeaway dulu.</p>}
            </section>

            {/* Tiket */}
            <section className="pos-col pos-col--ticket" aria-label="Tiket pesanan">
              <header className="pos-ticket-head">
                <h2>{ctxLabel}</h2>
                {order && <p className="d-mono d-muted">{order.code}</p>}
              </header>
              {orderItems.length > 0 && (
                <ul className="pos-lines">
                  {orderItems.map((i) => (
                    <li key={i.id}>
                      <span>{i.qty}× {i.name}{i.note && <em className="d-muted"> · {i.note}</em>}</span>
                      <Badge tone={KITCHEN[i.kitchen_status][1]}>{KITCHEN[i.kitchen_status][0]}</Badge>
                      <span className="d-num">{rupiah(i.qty * i.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {cart.length > 0 && (
                <>
                  <p className="d-nav__label">Belum dikirim</p>
                  <ul className="pos-lines pos-lines--cart">
                    {cart.map((c, i) => (
                      <li key={i}>
                        <div className="pos-qty">
                          <button type="button" aria-label="Kurangi" onClick={() => setCart((x) => x.map((y, j) => (j === i ? { ...y, qty: y.qty - 1 } : y)).filter((y) => y.qty > 0))}>−</button>
                          <span>{c.qty}</span>
                          <button type="button" aria-label="Tambah" onClick={() => setCart((x) => x.map((y, j) => (j === i ? { ...y, qty: y.qty + 1 } : y)))}>+</button>
                        </div>
                        <div className="pos-line-main">
                          <span>{prodIdx[c.product_id]?.name}</span>
                          <input placeholder="Catatan (pedas, tanpa es…)" value={c.note} onChange={(e) => setCart((x) => x.map((y, j) => (j === i ? { ...y, note: e.target.value } : y)))} />
                        </div>
                        <span className="d-num">{rupiah(c.qty * (prodIdx[c.product_id]?.price ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!order && cart.length === 0 && <Empty title="Tiket kosong">Tambahkan menu dari daftar.</Empty>}
              <dl className="pos-sum">
                <div><dt>Subtotal</dt><dd>{rupiah((order?.subtotal ?? 0) + cartTotal)}</dd></div>
                <div><dt>{taxLabel(order, tenant)}</dt><dd>{rupiah(taxOf({ channel: order?.channel, subtotal: (order?.subtotal ?? 0) + cartTotal }, tenant))}</dd></div>
              </dl>
              <div className="pos-actions">
                <button type="button" className="d-btn d-btn--primary d-btn--block" disabled={!cart.length || a.busy || !canSell} onClick={send}>
                  {order ? "Tambah ke pesanan" : "Kirim ke dapur"}
                </button>
                <button type="button" className="d-btn d-btn--ghost d-btn--block" disabled={!order || cart.length > 0 || a.busy || !d.myShift} onClick={openPay}>
                  Bayar {order ? rupiah(order.subtotal + taxOf(order, tenant)) : ""}
                </button>
                {order?.table_id && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setMoveOpen(true)}>Pindah / gabung meja</button>}
              </div>
              <Feedback a={a} />
              <OfflineBar cart={cart} branchId={b.branchId} cartTotal={cartTotal} hasOrder={Boolean(order)} onQueued={() => { setCart([]); data.reload(); }} />
              {d.recent.length > 0 && can(role, 6, "q") && (
                <details className="pos-recent">
                  <summary>Transaksi lunas terakhir</summary>
                  <ul className="d-list">
                    {d.recent.map((o) => (
                      <li key={o.id}>
                        <div><p className="d-mono">{o.code}</p><p className="d-list__meta">{o.table_label ? `Meja ${o.table_label}` : o.channel} · {rupiah(o.total)}</p></div>
                        <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => setVoidFor(o)}>Ajukan void</button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>
        </>
      )}

      <PaymentModal open={Boolean(payOrder)} order={payOrder}
        onClose={() => { if (payOrder?.table_id) api.lockTable(b.branchId, payOrder.table_id, "release"); setPayOrder(null); setSel(null); }}
        onPaid={() => data.reload()} />

      <Modal open={moveOpen} title="Pindah atau gabung meja" onClose={() => setMoveOpen(false)}>
        <p className="d-text">Meja kosong: pesanan dipindah. Meja terisi: tagihan digabung ke pesanan meja itu.</p>
        <ul className="pos-floor pos-floor--modal">
          {(d?.tables ?? []).filter((t) => t.id !== order?.table_id).map((t) => (
            <li key={t.id}><button type="button" className={`pos-table st--${t.status}`} onClick={() => moveTo(t)}><span className="pos-table__no">{t.label}</span><span className="pos-table__st">{TABLE_STATUS[t.status]}</span></button></li>
          ))}
        </ul>
      </Modal>

      <Modal open={Boolean(voidFor)} title="Ajukan void" onClose={() => setVoidFor(null)}
        footer={<><button type="button" className="d-btn d-btn--ghost" onClick={() => setVoidFor(null)}>Batal</button><button type="button" className="d-btn d-btn--danger" disabled={a.busy || !voidNote.trim()} onClick={sendVoid}>Kirim permintaan</button></>}>
        {voidFor && (
          <div className="d-form">
            <p className="d-text"><span className="d-mono">{voidFor.code}</span> · {rupiah(voidFor.total)}. Tombol void terkunci: GM memeriksa fisik pesanan lalu memasukkan PIN otorisasi.</p>
            <Field label="Alasan" id="v-r"><select id="v-r" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}>{VOID_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Penanganan bahan / stok" id="v-opt">
              <select id="v-opt" value={voidOption} onChange={(e) => setVoidOption(e.target.value)}>
                <option value="restock">Kembalikan ke stok (salah ketik / belum diolah)</option>
                <option value="waste">Catat sebagai bahan rusak / waste (sudah dimasak)</option>
              </select>
            </Field>
            <Field label="Catatan (wajib)" hint="Void diputuskan GM dengan PIN; nota besar atau yang menunggu terlalu lama naik ke Owner." id="v-n"><textarea id="v-n" rows="2" value={voidNote} onChange={(e) => setVoidNote(e.target.value)} /></Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </div>
  );
}
