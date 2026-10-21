import { useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah, dateTime } from "../../../lib/format.js";
import { PageHead, Loading, ErrorNote, Modal, Badge, Empty, useAsync } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive } from "../../ops.jsx";
import {
  executePrint,
  buildReceiptEscPos,
  buildKitchenTicketEscPos,
  buildItemLabelEscPos,
} from "../../../lib/thermalPrinter.js";

const PAYMENT_METHOD_LABELS = {
  cash: { label: "Tunai (S-Wallet)", tone: "ok" },
  qris: { label: "QRIS Dinamis", tone: "accent" },
  va: { label: "Transfer VA 9 Bank", tone: "accent" },
  swallet: { label: "S-Wallet Member", tone: "ok" },
  card: { label: "Kartu EDC", tone: "neutral" },
};

export default function Transactions() {
  const { api, tenant, role } = useAuth();
  const b = useBranch();
  const [methodFilter, setMethodFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailOrder, setDetailOrder] = useState(null);
  const [printSuccess, setPrintSuccess] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const data = useAsync(
    async () => {
      if (!api || !b.branchId) return { orders: [], items: [] };

      const orders = await api.list("orders", {
        eq: { branch_id: b.branchId },
        order: ["created_at", "desc"],
        limit: 100,
      }).catch(() => []);

      const orderIds = (orders || []).map((o) => o.id);
      let items = [];
      if (orderIds.length > 0) {
        items = await api.list("order_items", {
          in: { order_id: orderIds },
        }).catch(() => []);
      }

      return { orders: orders || [], items: items || [] };
    },
    [api, b.branchId]
  );
  useLive(["orders", "order_items"], data.reload);

  const d = data.data;

  // Gabungkan items ke setiap order
  const ordersWithItems = useMemo(() => {
    if (!d?.orders) return [];
    const itemMap = new Map();
    (d.items || []).forEach((it) => {
      if (!itemMap.has(it.order_id)) itemMap.set(it.order_id, []);
      itemMap.get(it.order_id).push(it);
    });

    return d.orders.map((o) => ({
      ...o,
      items: itemMap.get(o.id) || [],
    }));
  }, [d?.orders, d?.items]);

  // Filter pencarian & kategori
  const filteredOrders = useMemo(() => {
    return ordersWithItems.filter((o) => {
      if (channelFilter !== "all") {
        const c = String(o.channel || "").toLowerCase();
        if (channelFilter === "drive_thru" && !c.includes("drive_thru")) return false;
        if (channelFilter === "takeaway" && !c.includes("takeaway")) return false;
        if (channelFilter === "dine_in" && (!c.includes("dine_in") && !o.table_id)) return false;
      }

      if (methodFilter !== "all") {
        const m = String(o.payment_method || "").toLowerCase();
        if (!m.includes(methodFilter)) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const code = String(o.code || "").toLowerCase();
        const cust = String(o.customer_name || "").toLowerCase();
        const cashier = String(o.cashier_name || "").toLowerCase();
        if (!code.includes(q) && !cust.includes(q) && !cashier.includes(q)) return false;
      }

      return true;
    });
  }, [ordersWithItems, channelFilter, methodFilter, search]);

  // Statistik ringkasan
  const stats = useMemo(() => {
    const totalRevenue = filteredOrders
      .filter((o) => o.status === "paid")
      .reduce((sum, o) => sum + (Number(o.total) || Number(o.subtotal) || 0), 0);
    const paidCount = filteredOrders.filter((o) => o.status === "paid").length;
    const avgBasket = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0;
    return { totalRevenue, paidCount, avgBasket };
  }, [filteredOrders]);

  // Fungsi cetak struk
  const handlePrintReceipt = async (order) => {
    setPrintingId(`${order.id}-receipt`);
    try {
      const bytes = buildReceiptEscPos({
        order,
        tenant,
        cashierName: order.cashier_name || "Kasir",
      });
      await executePrint({
        role: "receipt",
        data: bytes,
        order,
        tenant,
      });
      setPrintSuccess(`Struk #${order.code} berhasil dicetak!`);
      setTimeout(() => setPrintSuccess(null), 3000);
    } catch (err) {
      alert(err.message || "Gagal mencetak struk");
    } finally {
      setPrintingId(null);
    }
  };

  // Fungsi cetak tiket dapur
  const handlePrintKitchen = async (order) => {
    setPrintingId(`${order.id}-kitchen`);
    try {
      const bytes = buildKitchenTicketEscPos({
        order,
        station: "Dapur",
      });
      await executePrint({
        role: "kitchen",
        data: bytes,
        order,
        tenant,
      });
      setPrintSuccess(`Tiket dapur #${order.code} berhasil dicetak!`);
      setTimeout(() => setPrintSuccess(null), 3000);
    } catch (err) {
      alert(err.message || "Gagal mencetak tiket dapur");
    } finally {
      setPrintingId(null);
    }
  };

  // Fungsi cetak label item
  const handlePrintItemLabel = async (order, item, index = 1) => {
    setPrintingId(`${order.id}-label`);
    try {
      const bytes = buildItemLabelEscPos({
        item,
        order,
        index,
        totalItems: order.items.length,
      });
      await executePrint({
        role: "item",
        data: bytes,
        order,
        tenant,
      });
      setPrintSuccess(`Label item #${order.code} berhasil dicetak!`);
      setTimeout(() => setPrintSuccess(null), 3000);
    } catch (err) {
      alert(err.message || "Gagal mencetak label item");
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <div className="d-page">
      <PageHead
        eyebrow="Operasional Kasir · Pembukuan"
        title="Riwayat Transaksi"
        desc="Daftar seluruh transaksi kasir POS, filter 4 metode pembayaran, rekonsiliasi S-Wallet tunai, dan 3 format cetak thermal."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <BranchSelect b={b} label="Lokasi Cabang" />
          </div>
        }
      />

      {/* Indikator Lokasi & Geofence Cabang Aktif dari Backend */}
      {b.branch && (
        <div
          className="d-panel"
          style={{
            padding: "0.6rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
            background: "var(--color-paper-2)",
            border: "1px solid var(--color-rule)",
            borderRadius: "var(--radius-md, 10px)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
            <Badge tone="accent">{b.branch.is_warehouse ? "Gudang" : "Outlet POS"}</Badge>
            <span style={{ fontWeight: 700, color: "var(--color-ink)" }}>{b.branch.name}</span>
            <span style={{ color: "var(--color-muted)" }}>•</span>
            <span style={{ color: "var(--color-ink-2)" }}>
              {b.branch.address || b.branch.city || "Makassar, Sulawesi Selatan"}
            </span>
            {b.branch.lat && b.branch.lng && (
              <span className="d-mono" style={{ fontSize: "0.75rem", color: "var(--color-muted)", background: "var(--color-paper)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--color-rule-2)" }}>
                {Number(b.branch.lat).toFixed(6)}, {Number(b.branch.lng).toFixed(6)} (Radius {b.branch.geofence_m || 50}m)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "var(--color-accent, #059669)", fontWeight: 600 }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
            <span>Terhubung Database Supabase</span>
          </div>
        </div>
      )}

      {printSuccess && (
        <div style={{ background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{printSuccess}</span>
        </div>
      )}

      {/* KPI Ringkasan Transaksi dengan Sistem .d-stats--3 Resmi Tijarah */}
      <div className="d-stats d-stats--3" style={{ marginBottom: "1.25rem" }}>
        <div className="d-stat d-stat--emerald">
          <div className="d-stat__header">
            <span className="d-stat__label">Total Omzet Lunas</span>
            <div className="d-stat__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="2" x2="12" y2="22" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="d-stat__value" style={{ color: "var(--color-accent, #059669)" }}>
            {rupiah(stats.totalRevenue)}
          </div>
          <div className="d-stat__sub">Saldo tunai dibukukan ke S-Wallet Kasir</div>
        </div>

        <div className="d-stat d-stat--sky">
          <div className="d-stat__header">
            <span className="d-stat__label">Transaksi Berhasil</span>
            <div className="d-stat__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="d-stat__value">{stats.paidCount}</div>
          <div className="d-stat__sub">Dari {filteredOrders.length} pesanan tercatat</div>
        </div>

        <div className="d-stat d-stat--gold">
          <div className="d-stat__header">
            <span className="d-stat__label">Rata-rata Tagihan</span>
            <div className="d-stat__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
          </div>
          <div className="d-stat__value">{rupiah(stats.avgBasket)}</div>
          <div className="d-stat__sub">Basket size rata-rata per transaksi</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Filter 4 Metode Pembayaran */}
          <div className="d-chips" role="radiogroup" aria-label="Metode Pembayaran">
            {[
              ["all", "Semua Metode"],
              ["cash", "Tunai (S-Wallet)"],
              ["qris", "QRIS Dinamis"],
              ["va", "Transfer VA 9 Bank"],
              ["swallet", "S-Wallet Member"],
            ].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`d-chip ${methodFilter === val ? "is-on" : ""}`}
                onClick={() => setMethodFilter(val)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Kotak Pencarian */}
          <div style={{ minWidth: "260px" }}>
            <input
              type="search"
              placeholder="Cari ID order, kasir, pelanggan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--color-rule-2)", background: "var(--color-paper)" }}
            />
          </div>
        </div>

        {/* Filter Tipe Layanan */}
        <div className="d-chips" role="radiogroup" aria-label="Tipe Layanan">
          {[
            ["all", "Semua Layanan"],
            ["takeaway", "Takeaway"],
            ["dine_in", "Dine In (Meja)"],
            ["drive_thru", "Drive Thru"],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`d-chip ${channelFilter === val ? "is-on" : ""}`}
              onClick={() => setChannelFilter(val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table Transaksi */}
      {data.loading && !d ? (
        <Loading />
      ) : data.error ? (
        <ErrorNote error={data.error} onRetry={data.reload} />
      ) : filteredOrders.length === 0 ? (
        <Empty title="Tidak ada transaksi yang cocok" desc="Coba ubah filter metode bayar atau kata kunci pencarian Anda." />
      ) : (
        <>
          {/* Tampilan Desktop: Tabel Lengkap 9 Kolom */}
          <div className="d-hide-mobile d-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="d-table" style={{ width: "100%", minWidth: "960px" }}>
              <thead>
                <tr>
                  <th>ID Order &amp; Waktu</th>
                  <th>Kasir</th>
                  <th>Pelanggan</th>
                  <th>Layanan</th>
                  <th>Metode Bayar</th>
                  <th>Item Pesanan</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Cetak Thermal</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => {
                  const methKey = (o.payment_method || "cash").toLowerCase();
                  const methMeta = PAYMENT_METHOD_LABELS[methKey] || { label: o.payment_method || "Tunai", tone: "neutral" };
                  const isDriveThru = String(o.channel || "").includes("drive_thru");
                  const isDineIn = String(o.channel || "").includes("dine_in") || o.table_label;

                  return (
                    <tr key={o.id}>
                      <td>
                        <button
                          type="button"
                          style={{ border: 0, background: "transparent", cursor: "pointer", textAlign: "left", padding: 0 }}
                          onClick={() => setDetailOrder(o)}
                        >
                          <strong className="d-mono" style={{ color: "var(--color-accent)", fontSize: "0.9rem" }}>
                            #{o.code || o.id.slice(0, 8)}
                          </strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "2px" }}>
                            {dateTime(o.created_at)}
                          </div>
                        </button>
                      </td>
                      <td style={{ fontSize: "0.85rem", color: "var(--color-ink)" }}>
                        {o.cashier_name || "Kasir Bertugas"}
                      </td>
                      <td>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink)" }}>
                          {o.customer_name || "Pelanggan Umum"}
                        </div>
                        {o.customer_phone && (
                          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                            {o.customer_phone}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge tone={isDriveThru ? "accent" : isDineIn ? "warn" : "ok"}>
                          {isDriveThru
                            ? `Drive Thru ${o.channel.split(":")[1] ? `(${o.channel.split(":")[1]})` : ""}`
                            : isDineIn
                            ? `Dine In ${o.table_label ? `(Meja ${o.table_label})` : ""}`
                            : "Takeaway"}
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={methMeta.tone}>{methMeta.label}</Badge>
                      </td>
                      <td style={{ fontSize: "0.85rem", maxWidth: "240px" }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ") || "—"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                          {o.items.length} jenis item
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "0.95rem" }}>
                        {rupiah(o.total || o.subtotal)}
                      </td>
                      <td>
                        <Badge tone={o.status === "paid" ? "ok" : o.status === "void" ? "danger" : "neutral"}>
                          {o.status === "paid" ? "Lunas" : o.status === "void" ? "Void" : o.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "inline-flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--xs"
                            title="Cetak Struk Kwitansi Pelanggan"
                            disabled={printingId === `${o.id}-receipt`}
                            onClick={() => handlePrintReceipt(o)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="6 9 6 2 18 2 18 9" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <rect width="12" height="8" x="6" y="14" />
                            </svg>
                            <span>Struk</span>
                          </button>
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--xs"
                            title="Cetak Tiket Pesanan Dapur / Bar"
                            disabled={printingId === `${o.id}-kitchen`}
                            onClick={() => handlePrintKitchen(o)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <span>Dapur</span>
                          </button>
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--xs"
                            title="Cetak Label Stiker Cup / Item"
                            disabled={printingId === `${o.id}-label` || o.items.length === 0}
                            onClick={() => handlePrintItemLabel(o, o.items[0], 1)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                              <path d="M7 7h.01" />
                            </svg>
                            <span>Label</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tampilan Mobile: Kartu Transaksi Touch-Friendly (<= 768px) */}
          <div className="d-show-mobile" style={{ flexDirection: "column", gap: "0.85rem" }}>
            {filteredOrders.map((o) => {
              const methKey = (o.payment_method || "cash").toLowerCase();
              const methMeta = PAYMENT_METHOD_LABELS[methKey] || { label: o.payment_method || "Tunai", tone: "neutral" };
              const isDriveThru = String(o.channel || "").includes("drive_thru");
              const isDineIn = String(o.channel || "").includes("dine_in") || o.table_label;

              return (
                <div
                  key={o.id}
                  style={{
                    background: "var(--color-paper)",
                    border: "1px solid var(--color-rule-2)",
                    borderRadius: "12px",
                    padding: "1rem",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div>
                      <button
                        type="button"
                        style={{ border: 0, background: "transparent", cursor: "pointer", textAlign: "left", padding: 0 }}
                        onClick={() => setDetailOrder(o)}
                      >
                        <strong className="d-mono" style={{ color: "var(--color-accent)", fontSize: "0.95rem" }}>
                          #{o.code || o.id.slice(0, 8)}
                        </strong>
                      </button>
                      <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "2px" }}>
                        {dateTime(o.created_at)} · {o.cashier_name || "Kasir"}
                      </div>
                    </div>
                    <Badge tone={o.status === "paid" ? "ok" : o.status === "void" ? "danger" : "neutral"}>
                      {o.status === "paid" ? "Lunas" : o.status === "void" ? "Void" : o.status}
                    </Badge>
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    <Badge tone={isDriveThru ? "accent" : isDineIn ? "warn" : "ok"}>
                      {isDriveThru
                        ? `Drive Thru ${o.channel.split(":")[1] ? `(${o.channel.split(":")[1]})` : ""}`
                        : isDineIn
                        ? `Dine In ${o.table_label ? `(Meja ${o.table_label})` : ""}`
                        : "Takeaway"}
                    </Badge>
                    <Badge tone={methMeta.tone}>{methMeta.label}</Badge>
                  </div>

                  <div style={{ fontSize: "0.85rem", color: "var(--color-ink-2)", padding: "0.5rem 0.75rem", background: "var(--color-paper-2)", borderRadius: "8px", marginBottom: "0.75rem" }}>
                    <div style={{ fontWeight: 600, color: "var(--color-ink)", marginBottom: "2px" }}>
                      {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ") || "—"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                      Pelanggan: {o.customer_name || "Pelanggan Umum"} {o.customer_phone ? `(${o.customer_phone})` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed var(--color-rule)", paddingTop: "0.6rem" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block" }}>Total Tagihan</span>
                      <strong className="d-mono" style={{ fontSize: "1.1rem", color: "var(--color-ink)" }}>
                        {rupiah(o.total || o.subtotal)}
                      </strong>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        disabled={printingId === `${o.id}-receipt`}
                        onClick={() => handlePrintReceipt(o)}
                        style={{ padding: "6px 10px" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect width="12" height="8" x="6" y="14" />
                        </svg>
                        <span>Struk</span>
                      </button>
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        disabled={printingId === `${o.id}-kitchen`}
                        onClick={() => handlePrintKitchen(o)}
                        style={{ padding: "6px 10px" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span>Dapur</span>
                      </button>
                      <button
                        type="button"
                        className="d-btn d-btn--ghost d-btn--sm"
                        disabled={printingId === `${o.id}-label` || o.items.length === 0}
                        onClick={() => handlePrintItemLabel(o, o.items[0], 1)}
                        style={{ padding: "6px 10px" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                          <path d="M7 7h.01" />
                        </svg>
                        <span>Label</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal Detail Struk Digital */}
      <Modal
        open={Boolean(detailOrder)}
        title={`Rincian Transaksi #${detailOrder?.code || detailOrder?.id}`}
        onClose={() => setDetailOrder(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setDetailOrder(null)}>
              Tutup
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              onClick={() => detailOrder && handlePrintReceipt(detailOrder)}
            >
              Cetak Ulang Struk
            </button>
          </>
        }
      >
        {detailOrder && (
          <div className="pos-receipt">
            <div style={{ textAlign: "center", marginBottom: "1rem", borderBottom: "1px dashed var(--color-rule)", paddingBottom: "0.75rem" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", fontWeight: 800 }}>{tenant?.name || "TIJARAH POS"}</h3>
              <p className="d-text d-muted" style={{ margin: 0, fontSize: "0.8rem" }}>Cloud POS &amp; Smart Operating System</p>
              <div className="d-mono" style={{ margin: "4px 0 0", fontSize: "0.9rem", fontWeight: 700 }}>
                #{detailOrder.code || detailOrder.id}
              </div>
            </div>

            <dl className="pos-sum">
              <div><dt>Waktu</dt><dd>{dateTime(detailOrder.created_at)}</dd></div>
              <div><dt>Kasir</dt><dd>{detailOrder.cashier_name || "Kasir Bertugas"}</dd></div>
              <div><dt>Pelanggan</dt><dd>{detailOrder.customer_name || "Pelanggan Umum"}</dd></div>
              <div><dt>Layanan</dt><dd>{(detailOrder.channel || "Takeaway").toUpperCase()}</dd></div>
              <div><dt>Metode Bayar</dt><dd>{(detailOrder.payment_method || "Tunai S-Wallet").toUpperCase()}</dd></div>
            </dl>

            <div style={{ borderTop: "1px dashed var(--color-rule)", borderBottom: "1px dashed var(--color-rule)", margin: "0.75rem 0", padding: "0.75rem 0" }}>
              {detailOrder.items.map((it, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", fontSize: "0.9rem" }}>
                  <div>
                    <div>{it.qty}× {it.name}</div>
                    {it.note && <div style={{ fontSize: "0.75rem", color: "var(--color-accent)" }}>({it.note})</div>}
                  </div>
                  <div className="d-mono">{rupiah((it.qty || 1) * (it.price || 0))}</div>
                </div>
              ))}
            </div>

            <dl className="pos-sum">
              <div><dt>Subtotal</dt><dd>{rupiah(detailOrder.subtotal)}</dd></div>
              {Number(detailOrder.discount) > 0 && <div><dt>Diskon</dt><dd>-{rupiah(detailOrder.discount)}</dd></div>}
              {Number(detailOrder.tax) > 0 && <div><dt>Pajak/PB1</dt><dd>{rupiah(detailOrder.tax)}</dd></div>}
              <div className="is-total"><dt>Total Akhir</dt><dd>{rupiah(detailOrder.total || detailOrder.subtotal)}</dd></div>
            </dl>
          </div>
        )}
      </Modal>

    </div>
  );
}
