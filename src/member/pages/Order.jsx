import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAsync, Loading, ErrorNote, Empty, Badge } from "../../app/ui/index.jsx";
import { rupiah } from "../../lib/format.js";

export const TRACK = {
  diterima: ["Diterima", "neutral"], dimasak: ["Dimasak", "accent"], siap: ["Siap diambil", "success"],
  diantar: ["Sudah diantar", "success"], selesai: ["Selesai", "success"], dibatalkan: ["Dibatalkan", "neutral"], dikembalikan: ["Dikembalikan", "neutral"],
};
const POLL_MS = 8000;

/** Pesanan yang masih berjalan, disegarkan tiap beberapa detik tanpa berkedip. */
function useMyOrders(api) {
  const [state, setState] = useState({ rows: null, error: null });
  const load = useCallback(() => api.rpc("member_orders").then((rows) => setState({ rows, error: null })).catch((error) => setState((s) => ({ ...s, error }))), [api]);
  useEffect(() => { load(); }, [load]);
  const active = (state.rows ?? []).some((o) => o.status === "open");
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [active, load]);
  return { ...state, reload: load };
}

export default function Order() {
  const { api } = useAuth();
  const menu = useAsync(() => api.rpc("member_menu"), [api]);
  const mine = useMyOrders(api);
  const [branch, setBranch] = useState("");
  const [cart, setCart] = useState({});
  const [notes, setNotes] = useState({});
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const products = menu.data?.products ?? [];
  const byCat = useMemo(() => {
    const g = new Map();
    for (const p of products) g.set(p.category, [...(g.get(p.category) ?? []), p]);
    return [...g.entries()];
  }, [products]);
  useEffect(() => { if (!branch && menu.data?.branches?.length) setBranch(menu.data.branches[0].id); }, [menu.data, branch]);

  if (menu.loading) return <Loading />;
  if (menu.error) return <ErrorNote error={menu.error} onRetry={menu.reload} />;
  if (!menu.data.can_order) return <section><h1>Pesan</h1><Empty title="Pemesanan menu tidak tersedia">Tempat usaha ini belum menerima pesanan lewat aplikasi. Anda bisa membuat janji di tab Reservasi.</Empty></section>;

  const lines = products.filter((p) => cart[p.id] > 0);
  const total = lines.reduce((a, p) => a + p.price * cart[p.id], 0);
  const setQty = (id, d) => setCart((c) => { const n = Math.max(0, Math.min(20, (c[id] ?? 0) + d)); const x = { ...c }; if (n) x[id] = n; else delete x[id]; return x; });

  const send = async () => {
    setBusy(true); setMsg(null);
    try {
      const o = await api.rpc("member_place_order", { p_branch: branch, p_table_label: label.trim() || null,
        p_items: lines.map((p) => ({ product_id: p.id, qty: cart[p.id], note: notes[p.id]?.trim() || undefined })) });
      setCart({}); setNotes({}); setMsg({ ok: true, t: `Pesanan ${o.code} terkirim ke dapur. Bayar di kasir.` });
      mine.reload();
    } catch (e) { setMsg({ ok: false, t: e.message }); }
    finally { setBusy(false); }
  };
  const cancel = async (o) => {
    setMsg(null);
    try { await api.rpc("member_cancel_order", { p_order: o.id }); setMsg({ ok: true, t: `Pesanan ${o.code} dibatalkan.` }); }
    catch (e) { setMsg({ ok: false, t: e.message }); }
    mine.reload();
  };
  const running = (mine.rows ?? []).filter((o) => o.status === "open");

  return (
    <section aria-labelledby="m-order">
      <h1 id="m-order">Pesan</h1>
      <p className="d-muted">Pesanan masuk ke dapur. Pembayaran dilakukan di kasir.</p>
      {msg && <p className={msg.ok ? "d-field__hint" : "d-field__error"} role={msg.ok ? "status" : "alert"}>{msg.t}</p>}

      {running.length > 0 && (
        <div className="m-section" aria-live="polite">
          <h2>Pesanan berjalan</h2>
          <ul className="m-list">
            {running.map((o) => {
              const [text, tone] = TRACK[o.track] ?? [o.track, "neutral"];
              return (
                <li key={o.id} className="m-card">
                  <p className="m-card__title"><span className="d-mono">{o.code}</span> <Badge tone={tone}>{text}</Badge></p>
                  <ul className="m-detail">{o.items.map((i, k) => <li key={k}><span>{i.qty} × {i.name}</span><span className="d-muted">{rupiah(i.qty * i.price)}</span></li>)}</ul>
                  <p><strong>{rupiah(o.total)}</strong> <span className="d-muted">· bayar di kasir</span></p>
                  {o.items.every((i) => i.kitchen_status === "new") && <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => cancel(o)}>Batalkan</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="d-form">
        {menu.data.branches.length > 1 && (
          <div className="d-field"><label htmlFor="o-branch">Cabang</label>
            <select id="o-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>{menu.data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        )}
        <div className="d-field"><label htmlFor="o-table">Nomor meja <span className="d-muted">(kosongkan bila ambil sendiri)</span></label>
          <input id="o-table" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} inputMode="text" /></div>
      </div>

      {byCat.map(([cat, ps]) => (
        <div key={cat} className="m-section">
          <h2>{cat}</h2>
          <ul className="m-list">
            {ps.map((p) => (
              <li key={p.id} className="m-card">
                <div className="m-row" style={{ cursor: "default" }}>
                  <span><span className="m-card__title">{p.name}</span><br /><span className="d-muted">{rupiah(p.price)}{!p.is_available && " · habis"}</span></span>
                  <span className="m-qty" role="group" aria-label={`Jumlah ${p.name}`}>
                    <button type="button" className="d-btn d-btn--ghost d-btn--sm" aria-label={`Kurangi ${p.name}`} disabled={!cart[p.id]} onClick={() => setQty(p.id, -1)}>−</button>
                    <output aria-live="polite">{cart[p.id] ?? 0}</output>
                    <button type="button" className="d-btn d-btn--ghost d-btn--sm" aria-label={`Tambah ${p.name}`} disabled={!p.is_available} onClick={() => setQty(p.id, 1)}>+</button>
                  </span>
                </div>
                {cart[p.id] > 0 && <input aria-label={`Catatan ${p.name}`} placeholder="Catatan (opsional)" maxLength={100} value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="m-cartbar">
        <span><strong>{rupiah(total)}</strong> <span className="d-muted">{lines.length} item</span></span>
        <button type="button" className="d-btn d-btn--primary" disabled={busy || !lines.length || !branch} onClick={send}>{busy ? "Mengirim…" : "Kirim ke dapur"}</button>
      </div>
    </section>
  );
}
