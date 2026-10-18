import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { PageHead, Loading, ErrorNote, useAsync, Empty, Panel } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useAction, Feedback, useNow, minutesSince } from "../../ops.jsx";

const STATIONS = [["", "Semua"], ["dapur", "Dapur utama"], ["barista", "Barista"], ["grill", "Grill"], ["pastry", "Pastry"]];
const COLS = [["new", "Baru"], ["cooking", "Sedang dimasak"], ["ready", "Siap saji"]];
const NEXT = { new: ["cooking", "Mulai masak"], cooking: ["ready", "Siap"], ready: ["served", "Diantar"] };
const SLA = 15; // menit, sesuai dokumen

export default function Kitchen() {
  const { api, role } = useAuth();
  const b = useBranch();
  const [station, setStation] = useState("");
  const now = useNow(15000);
  const a = useAction();
  const r = useAsync(async () => {
    if (!b.branchId) return null;
    const tId = b.branch?.tenant_id;
    const [items, orders, products] = await Promise.all([
      api.list("order_items", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, inList: ["kitchen_status", ["new", "cooking", "ready"]], order: ["created_at"] }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, inList: ["status", ["open", "paid"]], order: ["created_at", "desc"], limit: 200 }),
      api.list("products", { eq: tId ? { tenant_id: tId } : {}, order: ["name"] }),
    ]);
    return { items, orders, products };
  }, [api, b.branchId, b.branch?.tenant_id]);
  useLive(["order_items", "products"], r.reload);

  const tickets = useMemo(() => {
    const d = r.data;
    if (!d) return [];
    const byOrder = new Map();
    for (const i of d.items.filter((x) => !station || x.station === station)) {
      const o = d.orders.find((x) => x.id === i.order_id);
      const k = `${i.order_id}|${i.kitchen_status}`;
      if (!byOrder.has(k)) byOrder.set(k, { key: k, status: i.kitchen_status, order: o, items: [], since: i.created_at });
      byOrder.get(k).items.push(i);
    }
    return [...byOrder.values()];
  }, [r.data, station]);

  const canWork = can(role, 8, "u");
  const advance = (t) => a.run(async () => {
    for (const i of t.items) await api.rpc("set_item_status", { p_item: i.id, p_status: NEXT[t.status][0] });
    r.reload();
  });
  const toggle = (p) => a.run(async () => { await api.rpc("toggle_86", { p_product: p.id, p_available: !p.is_available }); r.reload(); });

  return (
    <>
      <PageHead
        eyebrow="Fitur 8 · Antrean dapur & status masak"
        title="Layar dapur"
        desc={`Timer SLA berubah kuning di menit ${SLA - 5} dan merah berkedip setelah ${SLA} menit.`}
        actions={<><div className="d-seg" role="radiogroup" aria-label="Stasiun">{STATIONS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={station === k} onClick={() => setStation(k)}>{l}</button>)}</div><BranchSelect b={b} /></>}
      />
      <Feedback a={a} />
      {r.loading && !r.data ? <Loading /> : r.error ? <ErrorNote error={r.error} onRetry={r.reload} /> : (
        <>
          <div className="kds">
            {COLS.map(([st, label]) => {
              const list = tickets.filter((t) => t.status === st);
              return (
                <section key={st} className="kds-col" aria-label={label}>
                  <h2 className="kds-col__head">{label} <span className="d-mono d-muted">{list.length}</span></h2>
                  {list.length === 0 ? <p className="d-text d-muted">Kosong</p> : list.map((t) => {
                    const m = minutesSince(t.since, now);
                    const sla = st === "ready" ? "ok" : m >= SLA ? "late" : m >= SLA - 5 ? "warn" : "ok";
                    return (
                      <article key={t.key} className={`kds-ticket sla--${sla}`}>
                        <header>
                          <p className="kds-ticket__where">{t.order?.table_label ? `Meja ${t.order.table_label}` : "Takeaway"}{t.order?.channel === "member" && <> · <strong>Member{t.order.customer_name ? ` ${t.order.customer_name}` : ""}</strong></>}{(t.order?.channel === "online_sim" || t.order?.channel === "gofood") && <> · <strong>{t.order.channel === "gofood" ? "GoFood" : "Online (simulasi)"}{t.order.customer_name ? ` · ${t.order.customer_name}` : ""}</strong></>}</p>
                          <p className="kds-ticket__time d-mono">{m} mnt</p>
                        </header>
                        <ul>{t.items.map((i) => <li key={i.id}><strong>{i.qty}×</strong> {i.name}{i.note && <span className="kds-note">{i.note}</span>}<span className="d-mono d-muted kds-st">{i.station}</span></li>)}</ul>
                        <p className="d-mono d-muted kds-code">{t.order?.code}</p>
                        {canWork && <button type="button" className={`d-btn ${st === "cooking" ? "d-btn--primary" : "d-btn--ghost"} d-btn--block`} disabled={a.busy} onClick={() => advance(t)}>{NEXT[st][1]}</button>}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
          <Panel title="Sakelar menu habis (86)" meta="Mengunci menu di kasir dan e-menu QR seketika">
            <ul className="kds-86">
              {(r.data?.products ?? []).map((p) => (
                <li key={p.id}>
                  <label className="d-check">
                    <input type="checkbox" checked={!p.is_available} disabled={!canWork || a.busy} onChange={() => toggle(p)} />
                    <span>{p.name}</span>
                  </label>
                  {!p.is_available && <span className="d-badge d-badge--danger">86</span>}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}
