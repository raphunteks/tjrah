import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah } from "../../../lib/format.js";
import { useBranch, BranchSelect, useLive, useNow } from "../../ops.jsx";
import { subscribeCustomerDisplay } from "../../../lib/customerDisplay.js";
import { qrSvg } from "../../../lib/qr.js";
import { PageHead, Badge } from "../../ui/index.jsx";

export default function CustomerDisplay() {
  const { api, tenant } = useAuth();
  const b = useBranch();
  const now = useNow(5000);

  // Deteksi apakah sedang dibuka di tab dashboard atau sebagai window monitor kedua independen
  const isStandalone = typeof window !== "undefined" && window.location.pathname.startsWith("/display");

  // State pesanan kasir aktif
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [paymentCharge, setPaymentCharge] = useState(null);
  const [statusPaid, setStatusPaid] = useState(false);

  // Sinkronisasi Real-Time via BroadcastChannel / LocalStorage
  useEffect(() => {
    // 1. Ambil state tersimpan terakhir saat layar pertama kali dimuat
    try {
      const cached = localStorage.getItem("tijarah:customer_display_event");
      if (cached) {
        const msg = JSON.parse(cached);
        if (msg && Date.now() - (msg._timestamp || 0) < 15 * 60 * 1000) {
          if (!msg.branchId || !b.branchId || msg.branchId === b.branchId) {
            if (msg.type === "CART_UPDATE") {
              if (msg.order) setActiveOrder(msg.order);
              if (msg.items) setOrderItems(msg.items);
              setStatusPaid(false);
            } else if (msg.type === "PAYMENT_START") {
              setPaymentCharge(msg);
              setStatusPaid(false);
            } else if (msg.type === "ORDER_PAID") {
              setStatusPaid(true);
              if (msg.order) setActiveOrder(msg.order);
              setPaymentCharge(null);
            } else if (msg.type === "RESET") {
              setActiveOrder(null);
              setOrderItems([]);
              setPaymentCharge(null);
              setStatusPaid(false);
            }
          }
        }
      }
    } catch {}

    const unsub = subscribeCustomerDisplay((msg) => {
      if (msg.branchId && b.branchId && msg.branchId !== b.branchId) return;
      if (msg.type === "CART_UPDATE") {
        if (msg.order) setActiveOrder(msg.order);
        if (msg.items) setOrderItems(msg.items);
        setStatusPaid(false);
      } else if (msg.type === "PAYMENT_START") {
        setPaymentCharge(msg);
        setStatusPaid(false);
      } else if (msg.type === "ORDER_PAID") {
        setStatusPaid(true);
        if (msg.order) setActiveOrder(msg.order);
        setPaymentCharge(null);
      } else if (msg.type === "RESET") {
        setActiveOrder(null);
        setOrderItems([]);
        setPaymentCharge(null);
        setStatusPaid(false);
      }
    });
    return unsub;
  }, [b.branchId]);

  const fetchDisplayData = async () => {
    if (!api || !b.branchId) return;
    try {
      const tenantId = tenant?.id || b.branch?.tenant_id;
      // HANYA ambil pesanan berstatus "open" yang belum selesai di cabang ini
      const orders = await api.list("orders", {
        eq: { ...(tenantId ? { tenant_id: tenantId } : {}), branch_id: b.branchId, status: "open" },
        order: ["created_at", "desc"],
        limit: 1,
      });

      if (orders && orders.length > 0) {
        const o = orders[0];
        // Jangan override jika sedang ada draft kasir aktif dari realtime channel
        setActiveOrder((prev) => (prev?.id === "draft" ? prev : o));

        // Ambil item pesanan jika belum ada dari realtime event
        const items = await api.list("order_items", {
          eq: { order_id: o.id },
          order: ["created_at"],
        });
        setOrderItems((prev) =>
          prev && prev.length > 0 && String(prev[0]?.id).startsWith("cart-") ? prev : items || []
        );

        // Cek apakah ada charge pembayaran aktif
        const charges = await api.list("payment_charges", {
          eq: { order_id: o.id },
          order: ["created_at", "desc"],
          limit: 1,
        }).catch(() => []);

        if (charges && charges.length > 0) {
          setPaymentCharge((prev) => (prev?.va_number || prev?.qr_string ? prev : charges[0]));
        }
      } else {
        // Jika tidak ada pesanan status "open" di database dan tidak ada draft kasir aktif,
        // biarkan layar dalam status standby (selamat datang)
        setActiveOrder((prev) => (prev?.id === "draft" ? prev : null));
        setOrderItems((prev) =>
          prev && prev.length > 0 && String(prev[0]?.id).startsWith("cart-") ? prev : []
        );
      }
    } catch {
      // Graceful error ignore for display
    }
  };

  useEffect(() => {
    fetchDisplayData();
    const interval = setInterval(fetchDisplayData, 4000);
    return () => clearInterval(interval);
  }, [api, b.branchId, tenant?.id]);

  useLive(["orders", "order_items", "payment_charges"], fetchDisplayData);

  const qrPath = useMemo(() => {
    const raw =
      paymentCharge?.qr_string ||
      (paymentCharge?.method === "qris"
        ? `https://qris.id/pay/${activeOrder?.code || "TIJARAH"}?amt=${paymentCharge?.amount || activeOrder?.total || activeOrder?.subtotal || 0}`
        : null);
    if (!raw) return null;
    try {
      return qrSvg(raw);
    } catch {
      return null;
    }
  }, [paymentCharge?.qr_string, paymentCharge?.method, paymentCharge?.amount, activeOrder?.code, activeOrder?.total, activeOrder?.subtotal]);

  const clockString = useMemo(() => {
    return `${new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} WITA`;
  }, [now]);

  // Konten Utama Tampilan Layar Pelanggan
  const displayContent = (
    <div style={{ display: "grid", gridTemplateColumns: activeOrder && orderItems.length > 0 ? "minmax(0, 1.35fr) minmax(360px, 1fr)" : "1fr", gap: "1.25rem", alignItems: "start" }}>
      {statusPaid ? (
        /* Status 1: Layar Sukses Pembayaran */
        <section className="d-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "4rem 2rem", border: "1px solid rgba(16, 185, 129, 0.3)", background: "var(--color-paper)" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "var(--brand-emerald-surface, #ecfdf5)", border: "2px solid var(--color-accent, #10b981)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", color: "var(--color-accent, #10b981)" }}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--color-accent, #059669)", margin: "0 0 0.5rem" }}>
            Pembayaran Berhasil!
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--color-muted)", margin: "0 0 1.5rem" }}>
            Terima kasih telah berbelanja di {tenant?.name || "Tijarah"}. Silakan ambil struk Anda di kasir.
          </p>
          <div className="d-role-chip d-role-chip--plain d-mono" style={{ fontSize: "1.2rem", fontWeight: 800, padding: "0.6rem 2rem", color: "var(--color-ink)", display: "inline-block" }}>
            Total Lunas: {rupiah(activeOrder?.total || 0)}
          </div>
        </section>
      ) : !activeOrder || orderItems.length === 0 ? (
        /* Status 2: Layar Standby Selamat Datang */
        <section className="d-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "4.5rem 2rem", background: "var(--color-paper)" }}>
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "var(--color-paper-2)", border: "2px solid var(--color-rule-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem", color: "var(--color-muted)" }}>
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </svg>
          </div>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--color-ink)", margin: "0 0 0.5rem", letterSpacing: "-0.02em" }}>
            Selamat Datang!
          </h2>
          <p style={{ fontSize: "1.05rem", color: "var(--color-muted)", maxWidth: "520px", margin: "0 auto 1.75rem", lineHeight: 1.6 }}>
            Silakan sebutkan pesanan Anda kepada kasir bertugas. Rincian tagihan akan tampil di layar ini secara otomatis.
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="d-badge d-badge--ok" style={{ padding: "0.45rem 1rem", fontSize: "0.85rem", fontWeight: 700 }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", marginRight: "6px" }} />
              Kasir Aktif Siap Melayani
            </span>
          </div>
        </section>
      ) : (
        /* Status 3: Layar Rincian Pesanan Aktif */
        <>
          {/* Kolom Kiri: Kartu Pesanan + Kartu Ringkasan Pembayaran di Bawahnya */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* 1. Kartu Pesanan Anda */}
            <section className="d-panel" style={{ background: "var(--color-paper)" }}>
              <header className="d-panel__head" style={{ borderBottom: "1px solid var(--color-rule)", paddingBottom: "0.85rem", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--color-ink)" }}>
                    Pesanan Anda
                  </h2>
                  <div className="d-mono" style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "2px" }}>
                    #{activeOrder.code || "DRAFT"} · {(activeOrder.channel || "Takeaway").toUpperCase()}
                  </div>
                </div>
                <Badge tone="ok">{orderItems.length} Item</Badge>
              </header>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "42vh", overflowY: "auto", paddingRight: "4px" }}>
                {orderItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      padding: "0.75rem",
                      background: "var(--color-paper-2)",
                      borderRadius: "var(--radius-sm, 8px)",
                      border: "1px solid var(--color-rule-2)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-ink)" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "2px" }}>
                        <span className="d-mono" style={{ fontWeight: 600 }}>{item.qty}×</span> @ {rupiah(item.price)}
                        {item.note && <em style={{ marginLeft: "0.4rem", color: "var(--color-accent)", fontStyle: "normal" }}>({item.note})</em>}
                      </div>
                    </div>
                    <div className="d-mono" style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-ink)" }}>
                      {rupiah((item.qty || 1) * (item.price || 0))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Kartu Ringkasan Pembayaran (Berada Tepat di Bawah List Pesanan) */}
            <section className="d-panel" style={{ background: "var(--color-paper)" }}>
              <header className="d-panel__head" style={{ marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--color-ink)" }}>
                  Ringkasan Pembayaran
                </h3>
              </header>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", fontSize: "0.9rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
                  <span>Subtotal</span>
                  <span className="d-mono">{rupiah(activeOrder.subtotal || 0)}</span>
                </div>
                {Number(activeOrder.discount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-danger, #ef4444)", fontWeight: 600 }}>
                    <span>Diskon Promosi</span>
                    <span className="d-mono">- {rupiah(activeOrder.discount)}</span>
                  </div>
                )}
                {Number(activeOrder.tax) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-muted)" }}>
                    <span>Pajak Restoran / PBJT</span>
                    <span className="d-mono">{rupiah(activeOrder.tax)}</span>
                  </div>
                )}
                <div style={{ borderTop: "2px dashed var(--color-rule)", paddingTop: "0.85rem", marginTop: "0.35rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--color-ink)" }}>Total Akhir</span>
                  <span className="d-mono" style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--color-accent, #059669)" }}>
                    {rupiah(activeOrder.total || activeOrder.subtotal || 0)}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* Kolom Kanan: Didedikasikan Penuh untuk QRIS Dinamis / Virtual Account */}
          <div style={{ position: "sticky", top: "1rem" }}>
            {paymentCharge && (paymentCharge.method === "qris" || paymentCharge.qr_url || qrPath || paymentCharge.va_number) ? (
              <section className="d-panel" style={{ textAlign: "center", border: "2px solid var(--color-accent, #10b981)", background: "var(--color-paper)", padding: "1.5rem" }}>
                {paymentCharge.va_number ? (
                  <div>
                    <div style={{ marginBottom: "0.75rem" }}>
                      <Badge tone="ok">Transfer Virtual Account · {paymentCharge.bank_name || "Bank Nasional"}</Badge>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.35rem" }}>Nomor Rekening Virtual Account:</div>
                    <div className="d-mono" style={{ fontSize: "1.6rem", fontWeight: 800, letterSpacing: "0.08em", color: "var(--color-ink)", background: "var(--color-paper-2)", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px dashed var(--color-rule)", marginBottom: "1rem" }}>
                      {paymentCharge.va_number}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.85rem", background: "var(--color-paper-2)", borderRadius: "6px", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--color-muted)" }}>Nominal Transfer:</span>
                      <strong className="d-mono" style={{ fontSize: "1.05rem", color: "var(--color-ink)" }}>{rupiah(paymentCharge.amount || activeOrder.total || activeOrder.subtotal)}</strong>
                    </div>
                    <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "var(--color-muted)" }}>
                      Verifikasi otomatis real-time tanpa perlu unggah bukti transfer.
                    </p>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--color-accent, #059669)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>
                      Pindai QRIS Dinamis Untuk Membayar
                    </span>
                    <div style={{ margin: "1rem auto", width: "260px", height: "260px", background: "#ffffff", padding: "10px", border: "1px solid var(--color-rule)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
                      {qrPath ? (
                        <svg viewBox={`0 0 ${qrPath.size} ${qrPath.size}`} style={{ width: "100%", height: "100%" }} shapeRendering="crispEdges">
                          <path d={qrPath.d} fill="#000000" />
                        </svg>
                      ) : paymentCharge.qr_url ? (
                        <img src={paymentCharge.qr_url} alt="QRIS Dinamis" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : null}
                    </div>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-muted)", lineHeight: 1.4 }}>
                      Mendukung GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, BRI, BNI, dan seluruh m-Banking nasional.
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="d-panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem", border: "1px dashed var(--color-rule)", background: "var(--color-paper)" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--color-paper-2)", border: "1px solid var(--color-rule-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem", color: "var(--color-accent, #059669)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" y2="10" />
                  </svg>
                </div>
                <h4 style={{ margin: "0 0 0.35rem", color: "var(--color-ink)", fontSize: "1rem", fontWeight: 700 }}>
                  Menunggu Pembayaran
                </h4>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-muted)", lineHeight: 1.5 }}>
                  QRIS Dinamis atau nomor Virtual Account akan tampil otomatis di sini saat kasir menekan tombol bayar di POS.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );

  // Jika dibuka sebagai window standalone (/display/customer) di monitor kedua
  if (isStandalone) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-paper-2)", color: "var(--color-ink)", display: "flex", flexDirection: "column" }}>
        {/* Header Bersih Monitor Kedua */}
        <header style={{ background: "var(--color-paper)", borderBottom: "1px solid var(--color-rule)", padding: "0.85rem 1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--color-accent)", letterSpacing: "-0.02em" }}>
              {tenant?.name || "Tijarah Point of Sale"}
            </h1>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>
              {b.branch?.name || "Layar Pelanggan"} · Customer Facing Display
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <span className="d-role-chip d-role-chip--plain d-mono" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              {clockString}
            </span>
          </div>
        </header>

        {/* Konten Utama */}
        <main style={{ flex: 1, padding: "1.5rem", maxWidth: "1400px", width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {displayContent}
        </main>

        <footer style={{ textAlign: "center", padding: "0.75rem", color: "var(--color-muted)", fontSize: "0.75rem", borderTop: "1px solid var(--color-rule-2)" }}>
          Didukung oleh Tijarah Cloud OS · Solusi Operasional &amp; POS Terpadu
        </footer>
      </div>
    );
  }

  // Tampilan Default: Terintegrasi Rapi di Subtab Dashboard (/app/display-pelanggan)
  return (
    <div className="d-page">
      <PageHead
        eyebrow="Operasional Kasir · Monitor Pelanggan"
        title="Layar Pelanggan (CFD)"
        desc="Customer Facing Display sinkronisasi realtime kasir, rincian keranjang belanja, dan QRIS dinamis monitor kedua."
        actions={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <BranchSelect b={b} label="Lokasi Cabang" />
            <button
              type="button"
              className="d-btn d-btn--primary d-btn--sm"
              onClick={() => window.open("/display/customer", "_blank", "width=1024,height=768")}
              title="Buka tampilan fullscreen di monitor kedua pelanggan"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <span>Buka di Monitor Kedua</span>
            </button>
            <span className="d-role-chip d-role-chip--plain d-mono" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {clockString}
            </span>
          </div>
        }
      />

      {/* Info Lokasi Cabang & Geofence Aktif dari Backend */}
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
            <span>Terhubung Realtime ke Kasir</span>
          </div>
        </div>
      )}

      {/* Rincian Konten CFD */}
      {displayContent}
    </div>
  );
}
