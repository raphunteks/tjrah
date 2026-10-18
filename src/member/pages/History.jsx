import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAsync, Loading, ErrorNote, Empty, Badge } from "../../app/ui/index.jsx";
import { rupiah, dateTime } from "../../lib/format.js";

const STATUS = { paid: ["Lunas", "success"], open: ["Diproses", "accent"], void: ["Dibatalkan", "neutral"], refunded: ["Dikembalikan", "neutral"] };

function strukText(o, items) {
  const L = [`STRUK ${o.code}`, dateTime(o.paid_at ?? o.created_at), ""];
  for (const i of items) L.push(`${i.qty} x ${i.name}  ${rupiah(i.qty * i.price)}`);
  L.push("", `Subtotal  ${rupiah(o.subtotal)}`);
  if (o.discount) L.push(`Diskon    -${rupiah(o.discount)}`);
  if (o.tax) L.push(`Pajak     ${rupiah(o.tax)}`);
  L.push(`TOTAL     ${rupiah(o.total)}`);
  return L.join("\n");
}
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function History() {
  const { api } = useAuth();
  const [open, setOpen] = useState(null);
  const orders = useAsync(() => api.list("orders", { order: ["created_at", "desc"], limit: 50 }), [api]);
  const items = useAsync(() => (open ? api.list("order_items", { eq: { order_id: open } }) : Promise.resolve([])), [api, open]);
  if (orders.loading) return <Loading />;
  if (orders.error) return <ErrorNote error={orders.error} onRetry={orders.reload} />;
  const rows = orders.data ?? [];
  return (
    <section aria-labelledby="m-hist">
      <h1 id="m-hist">Riwayat pesanan</h1>
      {rows.length === 0 ? <Empty title="Belum ada pesanan">Pesanan yang tercatat atas nomor Anda akan muncul di sini.</Empty> : (
        <ul className="m-list">
          {rows.map((o) => {
            const [label, tone] = STATUS[o.status] ?? [o.status, "neutral"];
            const isOpen = open === o.id;
            return (
              <li key={o.id} className="m-card">
                <button type="button" className="m-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : o.id)}>
                  <span><span className="d-mono">{o.code}</span><span className="d-muted"> · {dateTime(o.paid_at ?? o.created_at)}</span></span>
                  <span><Badge tone={tone}>{label}</Badge> <strong>{rupiah(o.total)}</strong></span>
                </button>
                {isOpen && (
                  <div className="m-detail">
                    {items.loading ? <Loading /> : (
                      <>
                        <ul>{(items.data ?? []).map((i) => <li key={i.id ?? i.name}>{i.qty} × {i.name} <span className="d-muted">{rupiah(i.qty * i.price)}</span></li>)}</ul>
                        <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => download(`struk-${o.code}.txt`, strukText(o, items.data ?? []))}>Unduh struk</button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
