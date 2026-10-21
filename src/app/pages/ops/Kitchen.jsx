import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can, isOwnerOrGm } from "../../../lib/rbac.js";
import { PageHead, Loading, ErrorNote, useAsync, Empty, Panel } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useAction, Feedback, useNow, minutesSince } from "../../ops.jsx";

const COLS = [["new", "Baru"], ["cooking", "Sedang dimasak"], ["ready", "Siap saji"]];
const NEXT = { new: ["cooking", "Mulai masak"], cooking: ["ready", "Siap"], ready: ["served", "Diantar"] };

export default function Kitchen() {
  const { api, role, tenantId } = useAuth();
  const b = useBranch();
  const [station, setStation] = useState("");
  const now = useNow(15000);
  const a = useAction();

  // Load tenant preferences for KDS
  const tQuery = useAsync(async () => {
    if (!api || !tenantId) return null;
    const [t] = await api.list("tenants", { eq: { id: tenantId } });
    return t || null;
  }, [api, tenantId], { key: tenantId ? `tenant_kds@${tenantId}` : null });

  const tenantCfg = tQuery.data;
  const kdsEnabled = tenantCfg ? Boolean(tenantCfg.kds_enabled) : true;
  const stationsEnabled = tenantCfg ? Boolean(tenantCfg.kitchen_stations_enabled) : false;
  const slaMinutes = tenantCfg ? Number(tenantCfg.kds_sla_minutes) || 15 : 15;

  const stationList = useMemo(() => {
    if (!stationsEnabled) return [];
    const custom = Array.isArray(tenantCfg?.kitchen_stations) && tenantCfg.kitchen_stations.length > 0
      ? tenantCfg.kitchen_stations
      : ["dapur", "barista", "grill", "pastry"];
    return [["", "Semua"], ...custom.map((s) => [s, s.charAt(0).toUpperCase() + s.slice(1)])];
  }, [stationsEnabled, tenantCfg?.kitchen_stations]);

  const r = useAsync(async () => {
    if (!b.branchId) return null;
    const tId = b.branch?.tenant_id || tenantId;
    const [items, orders, products] = await Promise.all([
      api.list("order_items", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, inList: ["kitchen_status", ["new", "cooking", "ready"]], order: ["created_at"] }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, inList: ["status", ["open", "paid"]], order: ["created_at", "desc"], limit: 200 }),
      api.list("products", { eq: tId ? { tenant_id: tId } : {}, order: ["name"] }),
    ]);
    return { items, orders, products };
  }, [api, b.branchId, b.branch?.tenant_id, tenantId]);
  useLive(["order_items", "products"], r.reload);

  const tickets = useMemo(() => {
    const d = r.data;
    if (!d) return [];
    const byOrder = new Map();
    for (const i of d.items.filter((x) => !stationsEnabled || !station || x.station === station)) {
      const o = d.orders.find((x) => x.id === i.order_id);
      const k = `${i.order_id}|${i.kitchen_status}`;
      if (!byOrder.has(k)) byOrder.set(k, { key: k, status: i.kitchen_status, order: o, items: [], since: i.created_at });
      byOrder.get(k).items.push(i);
    }
    return [...byOrder.values()];
  }, [r.data, station, stationsEnabled]);

  const canWork = can(role, 8, "u");
  const advance = (t) => a.run(async () => {
    for (const i of t.items) await api.rpc("set_item_status", { p_item: i.id, p_status: NEXT[t.status][0] });
    r.reload();
  });
  const toggle = (p) => a.run(async () => { await api.rpc("toggle_86", { p_product: p.id, p_available: !p.is_available }); r.reload(); });

  // Jika KDS dinonaktifkan dan peran kasir/staf mengakses, tampilkan notice
  if (!kdsEnabled && !isOwnerOrGm(role)) {
    return (
      <>
        <PageHead eyebrow="Fitur 8 · Antrean dapur" title="Layar dapur" desc="Status antrean memasak dan preparasi pesanan." />
        <Panel>
          <Empty title="Display Dapur (KDS) Dinonaktifkan">
            Fitur KDS saat ini dinonaktifkan oleh Owner / General Manager. Pesanan POS tetap tersimpan dan tercatat aman di server.
          </Empty>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Fitur 8 · Antrean dapur & status masak"
        title="Layar dapur"
        desc={`Target SLA: ${slaMinutes} menit. Timer berubah kuning di menit ${Math.max(1, slaMinutes - 5)} dan merah setelah ${slaMinutes} menit.`}
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            {stationsEnabled && stationList.length > 0 && (
              <div className="d-seg" role="radiogroup" aria-label="Stasiun">
                {stationList.map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={station === k} onClick={() => setStation(k)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            <BranchSelect b={b} />
          </div>
        }
      />
      <Feedback a={a} />
      {r.loading && !r.data ? (
        <Loading />
      ) : r.error ? (
        <ErrorNote error={r.error} onRetry={r.reload} />
      ) : (
        <>
          <div className="kds">
            {COLS.map(([st, label]) => {
              const list = tickets.filter((t) => t.status === st);
              return (
                <section key={st} className="kds-col" aria-label={label}>
                  <h2 className="kds-col__head">
                    {label} <span className="d-mono d-muted">{list.length}</span>
                  </h2>
                  {list.length === 0 ? (
                    <p className="d-text d-muted">Kosong</p>
                  ) : (
                    list.map((t) => {
                      const m = minutesSince(t.since, now);
                      const sla = st === "ready" ? "ok" : m >= slaMinutes ? "late" : m >= slaMinutes - 5 ? "warn" : "ok";
                      return (
                        <article key={t.key} className={`kds-ticket sla--${sla}`}>
                          <header>
                            <p className="kds-ticket__where">
                              {t.order?.table_label ? `Meja ${t.order.table_label}` : "Takeaway"}
                              {t.order?.channel === "member" && (
                                <> · <strong>Member{t.order.customer_name ? ` ${t.order.customer_name}` : ""}</strong></>
                              )}
                              {(t.order?.channel === "online_sim" || t.order?.channel === "gofood") && (
                                <> · <strong>{t.order.channel === "gofood" ? "GoFood" : "Online (simulasi)"}{t.order.customer_name ? ` · ${t.order.customer_name}` : ""}</strong></>
                              )}
                            </p>
                            <p className="kds-ticket__time d-mono">{m} mnt</p>
                          </header>
                          <ul className="kds-ticket__items">
                            {t.items.map((i) => (
                              <li key={i.id}>
                                <span className="d-mono">{i.qty}×</span> <span>{i.product_name}</span>
                                {i.notes && <em className="kds-note">{i.notes}</em>}
                              </li>
                            ))}
                          </ul>
                          {canWork && NEXT[t.status] && (
                            <footer>
                              <button type="button" className="d-btn d-btn--sm d-btn--primary" onClick={() => advance(t)}>
                                {NEXT[t.status][1]}
                              </button>
                            </footer>
                          )}
                        </article>
                      );
                    })
                  )}
                </section>
              );
            })}
          </div>

          <Panel title="Kontrol menu (86 / habis)" desc="Tandai menu yang kehabisan stok langsung dari dapur.">
            <div className="d-chips">
              {(r.data?.products ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`d-chip ${p.is_available ? "" : "is-off"}`}
                  onClick={() => canWork && toggle(p)}
                  title={canWork ? "Klik untuk ubah ketersediaan" : undefined}
                >
                  <span className="d-mono">{p.is_available ? "86" : "Habis"}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
