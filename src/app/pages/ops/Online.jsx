import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { can } from "../../../lib/rbac.js";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Panel, Loading, ErrorNote, Field, useAsync, Badge, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useAction, Feedback, useLive } from "../../ops.jsx";

const CH = { sim: "Simulasi", gofood: "GoFood" };
const CST = { active: ["Aktif", "ok"], awaiting_access: ["Menunggu akses penyedia", "warn"], paused: ["Dijeda", "neutral"] };

/** Pesanan online (Fitur 16): koneksi per Cabang, pesanan masuk, dan antrean ketersediaan menu (86). Harga & stok selalu dari Produk. */
export default function Online() {
  const { api, role } = useAuth();
  const b = useBranch();
  const canWrite = can(role, 16, "c");
  const canEdit = can(role, 16, "u");
  const flags = useAsync(() => (api?.rpc ? api.rpc("my_flags").catch(() => ({})) : Promise.resolve({})), [api]);
  const on = Boolean(flags.data?.online_orders);

  const conns = useAsync(() => (b.branchId ? api.list("channel_connections", { eq: { branch_id: b.branchId }, order: ["created_at"] }) : Promise.resolve([])), [api, b.branchId]);
  const orders = useAsync(() => api.list("channel_orders", { order: ["received_at", "desc"], limit: 40 }), [api]);
  const outbox = useAsync(() => api.list("channel_outbox", { order: ["created_at", "desc"], limit: 20 }), [api]);
  const products = useAsync(() => api.list("products", { order: ["name"] }), [api]);
  const reload = () => { conns.reload(); orders.reload(); outbox.reload(); };
  useLive(["channel_connections", "channel_orders", "channel_outbox", "orders"], reload);

  const [form, setForm] = useState({ channel: "sim", label: "" });
  const [sim, setSim] = useState({ sku: "", qty: 1, customer: "Pelanggan Simulasi" });
  const save = useAction();
  const status = useAction();
  const send = useAction();

  const connById = useMemo(() => Object.fromEntries((conns.data ?? []).map((c) => [c.id, c])), [conns.data]);
  const prodById = useMemo(() => Object.fromEntries((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const mine = (orders.data ?? []).filter((o) => connById[o.connection_id]);
  const simConn = (conns.data ?? []).find((c) => c.channel === "sim" && c.status === "active");

  return (
    <>
      <PageHead eyebrow="Fitur 16 · Integrasi omnichannel & marketplace" title="Pesanan online"
        desc="Pesanan dari kanal online masuk ke Layar Dapur dan kasir seperti pesanan biasa. Harga dan ketersediaan selalu mengikuti menu Anda."
        actions={<BranchSelect b={b} />} />
      {flags.data && !on && <Panel title="Belum aktif"><Empty title="Pesanan online belum aktif untuk Paket ini">Hubungi Superadmin untuk mengaktifkan fitur ini.</Empty></Panel>}

      {on && (
        <Panel title="Koneksi kanal" meta="GrabFood dan ShopeeFood belum tersedia">
          {conns.loading && !conns.data ? <Loading /> : conns.error ? <ErrorNote error={conns.error} onRetry={conns.reload} /> : !(conns.data ?? []).length ? (
            <Empty title="Belum ada koneksi">{canWrite ? "Tambahkan kanal simulasi untuk mencoba alur sebelum platform sungguhan tersambung." : "Owner atau GM belum menambahkan koneksi."}</Empty>
          ) : (
            <ul className="d-list">
              {conns.data.map((c) => {
                const [label, tone] = CST[c.status] ?? [c.status, "neutral"];
                return (
                  <li key={c.id} className="d-list__row">
                    <span><strong>{c.label}</strong> <span className="d-muted">· {CH[c.channel] ?? c.channel}</span><br />
                      <Badge tone={tone}>{label}</Badge>{c.last_sync_at && <span className="d-muted"> · terakhir {dateTime(c.last_sync_at)}</span>}</span>
                    {canEdit && c.channel === "sim" && (
                      <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={status.busy}
                        onClick={() => status.run(async () => { await api.rpc("online_connection_status", { p_id: c.id, p_status: c.status === "active" ? "paused" : "active" }); reload(); })}>
                        {c.status === "active" ? "Jeda" : "Aktifkan"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Feedback a={status} />
          {canWrite && b.branchId && (
            <div className="d-form d-form--row">
              <Field label="Kanal" id="on-ch">
                <select id="on-ch" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  <option value="sim">Simulasi (uji alur)</option><option value="gofood">GoFood (menunggu akses penyedia)</option>
                </select>
              </Field>
              <Field label="Nama koneksi" id="on-lb"><input id="on-lb" value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
              <button type="button" className="d-btn d-btn--primary" disabled={save.busy || form.label.trim().length < 2}
                onClick={() => save.run(async () => { await api.rpc("online_connection_save", { p_branch: b.branchId, p_channel: form.channel, p_label: form.label, p_settings: {} }); setForm({ ...form, label: "" }); reload(); }, "Koneksi disimpan")}>
                Simpan koneksi
              </button>
            </div>
          )}
          <Feedback a={save} />
          {(conns.data ?? []).some((c) => c.channel === "gofood") && <p className="d-muted">GoFood tersambung setelah akses sandbox/persyaratan penyedia disetujui. Sampai saat itu koneksi tetap menunggu dan tidak menerima pesanan.</p>}
        </Panel>
      )}

      {on && canWrite && simConn && (
        <Panel title="Simulasikan pesanan masuk" meta={simConn.label}>
          <div className="d-form d-form--row">
            <Field label="Menu" id="on-sku">
              <select id="on-sku" value={sim.sku} onChange={(e) => setSim({ ...sim, sku: e.target.value })}>
                <option value="">Pilih menu…</option>
                {(products.data ?? []).map((p) => <option key={p.id} value={p.sku}>{p.name}{p.is_available ? "" : " (86)"} · {rupiah(p.price)}</option>)}
              </select>
            </Field>
            <Field label="Jumlah" id="on-q"><input id="on-q" type="number" min="1" max="99" value={sim.qty} onChange={(e) => setSim({ ...sim, qty: e.target.value })} /></Field>
            <Field label="Nama pelanggan" id="on-cu"><input id="on-cu" value={sim.customer} maxLength={80} onChange={(e) => setSim({ ...sim, customer: e.target.value })} /></Field>
            <button type="button" className="d-btn d-btn--primary" disabled={send.busy || !sim.sku}
              onClick={() => send.run(async () => {
                const r = await api.rpc("online_sim_order", { p_conn: simConn.id, p_items: [{ sku: sim.sku, qty: Number(sim.qty) }], p_customer: sim.customer });
                reload();
                if (!r.ok) throw new Error(`Ditolak: ${r.error}`);
                return r;
              }, (r) => `Pesanan ${r.code} masuk (${rupiah(r.total)}). Lihat di Layar Dapur.`)}>
              Kirim pesanan simulasi
            </button>
          </div>
          <Feedback a={send} />
        </Panel>
      )}

      {on && (
        <Panel title="Pesanan masuk" meta="40 terakhir">
          {orders.loading && !orders.data ? <Loading /> : orders.error ? <ErrorNote error={orders.error} onRetry={orders.reload} /> : !mine.length ? <Empty title="Belum ada pesanan online">Pesanan dari kanal aktif akan muncul di sini.</Empty> : (
            <div className="d-table-wrap">
              <table className="d-table">
                <caption className="d-sr">Pesanan online masuk</caption>
                <thead><tr><th>Waktu</th><th>Kanal</th><th>Pelanggan</th><th>Hasil</th></tr></thead>
                <tbody>{mine.map((o) => (
                  <tr key={o.id}>
                    <td>{dateTime(o.received_at)}</td>
                    <td>{CH[connById[o.connection_id]?.channel] ?? "—"}</td>
                    <td>{o.customer_name ?? "—"}</td>
                    <td>{o.status === "received" ? <Badge tone="ok">Diterima</Badge> : <><Badge tone="danger">Ditolak</Badge> <span className="d-muted">{o.error}</span></>}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {on && (
        <Panel title="Sinkron ketersediaan menu (86)" meta="Menu habis dikirim ke kanal aktif">
          {!(outbox.data ?? []).length ? <Empty title="Belum ada perubahan">Menandai menu habis (86) di Layar Dapur akan tercatat di sini.</Empty> : (
            <ul className="d-list">{outbox.data.map((x) => (
              <li key={x.id} className="d-list__row">
                <span>{prodById[x.product_id]?.name ?? "Menu"} → {x.available ? "tersedia" : "habis (86)"} <span className="d-muted">· {CH[connById[x.connection_id]?.channel] ?? "kanal"} · {dateTime(x.created_at)}</span></span>
                <Badge tone={x.status === "sent" ? "ok" : x.status === "failed" ? "danger" : "warn"}>{x.status === "sent" ? "Terkirim" : x.status === "failed" ? "Gagal" : "Menunggu"}</Badge>
              </li>))}</ul>
          )}
        </Panel>
      )}
    </>
  );
}
