import { useEffect, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah } from "../../../lib/format.js";
import { taxOf } from "../../../lib/tax.js";
import { enqueue, pending, flush, autoSync } from "../../../lib/offlineQueue.js";
import { useAsync } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";

/** Mode offline kasir (flag offline_pos): antre transaksi tunai di perangkat, kirim otomatis saat online. Server memakai harga TERKINI. */
export default function OfflineBar({ cart, branchId, cartTotal, hasOrder, onQueued }) {
  const { api, tenant } = useAuth();
  const flags = useAsync(() => api.rpc("my_flags"), [api]);
  const [n, setN] = useState(pending());
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const a = useAction();
  const on = Boolean(flags.data?.offline_pos);
  useEffect(() => {
    if (!on) return undefined;
    const upd = () => setN(pending());
    const set = () => { setOnline(navigator.onLine); upd(); };
    window.addEventListener("online", set); window.addEventListener("offline", set);
    const stop = autoSync(api, upd);
    const t = setInterval(upd, 5000);
    return () => { window.removeEventListener("online", set); window.removeEventListener("offline", set); stop(); clearInterval(t); };
  }, [api, on]);
  if (!on) return null;
  const total = cartTotal + taxOf({ channel: "takeaway", subtotal: cartTotal }, tenant);
  const save = () => a.run(async () => {
    enqueue({ branch_id: branchId, items: cart.map((c) => ({ product_id: c.product_id, qty: c.qty, note: c.note || null })), payments: [{ method: "cash", amount: total }], expected_total: total });
    setN(pending()); onQueued();
  }, `Tersimpan di perangkat (tunai ${rupiah(total)}). Dikirim otomatis saat online.`);
  const sync = () => a.run(async () => { const r = await flush(api); setN(pending()); return r; },
    (r) => (r.offline ? "Perangkat masih offline" : `Terkirim ${r.sent}${r.failed.length ? `, gagal ${r.failed.length}: ${r.failed[0].error}` : ""}${r.review?.length ? ` · ${r.review.length} perlu ditinjau GM` : ""}`));
  return (
    <div className="d-note" role="status" data-testid="offline-bar">
      <strong>{online ? "Online" : "Offline"}</strong> · antrean perangkat: {n}
      <div className="d-row-actions">
        <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy || !cart.length || hasOrder} onClick={save}>Simpan offline (tunai)</button>
        <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={a.busy || n === 0} onClick={sync}>Sinkronkan {n > 0 ? `(${n})` : ""}</button>
      </div>
      <Feedback a={a} />
    </div>
  );
}
