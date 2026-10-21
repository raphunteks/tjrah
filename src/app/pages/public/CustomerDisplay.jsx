import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah } from "../../../lib/format.js";
import { useBranch, useLive, useNow } from "../../ops.jsx";
import { subscribeCustomerDisplay } from "../../../lib/customerDisplay.js";
import { qrSvg } from "../../../lib/qr.js";

export default function CustomerDisplay() {
  const { api, tenant } = useAuth();
  const b = useBranch();
  const now = useNow(5000);

  // Ambil pesanan kasir terakhir/terbuka untuk cabang ini
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
    } catch {}

    const unsub = subscribeCustomerDisplay((msg) => {
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
  }, []);

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
      // Graceful error ignore for public display
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

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Header Display */}
      <header style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "var(--color-accent, #059669)", letterSpacing: "-0.02em" }}>
            {tenant?.name || "Tijarah Point of Sale"}
          </h1>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
            {b.branch?.name || "Layar Pelanggan"} · Customer Facing Display
          </p>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => window.open("/display/customer", "_blank", "width=1024,height=768")}
            style={{
              padding: "6px 14px",
              background: "#ecfdf5",
              color: "#065f46",
              border: "1px solid #10b981",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>Buka di Monitor Kedua</span>
          </button>
          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "1rem", fontWeight: 600, color: "#334155" }}>
            {new Date(now).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} WITA
          </span>
        </div>
      </header>

      {/* Main Content Body */}
      <main style={{ flex: 1, padding: "2rem", display: "grid", gridTemplateColumns: activeOrder ? "1fr 420px" : "1fr", gap: "2rem", alignItems: "start", maxWidth: "1400px", width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {statusPaid ? (
          /* Layar Sukses Pembayaran */
          <div style={{ gridColumn: "1 / -1", background: "#ffffff", borderRadius: "16px", padding: "4rem 2rem", textAlign: "center", border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", background: "#ecfdf5", border: "2px solid #10b981", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#065f46", margin: "0 0 0.5rem" }}>
              Pembayaran Berhasil!
            </h2>
            <p style={{ fontSize: "1.1rem", color: "#64748b", margin: "0 0 1.5rem" }}>
              Terima kasih telah berbelanja di {tenant?.name || "Tijarah"}. Silakan ambil struk Anda di kasir.
            </p>
            <div style={{ display: "inline-block", padding: "0.75rem 2rem", background: "#f1f5f9", borderRadius: "999px", fontFamily: "var(--font-mono, monospace)", fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
              Total Lunas: {rupiah(activeOrder?.total || 0)}
            </div>
          </div>
        ) : !activeOrder || orderItems.length === 0 ? (
          /* Layar Standby Selamat Datang */
          <div style={{ gridColumn: "1 / -1", background: "#ffffff", borderRadius: "16px", padding: "5rem 2rem", textAlign: "center", border: "1px solid #e2e8f0", boxShadow: "0 10px 30px rgba(0,0,0,0.04)" }}>
            <div style={{ width: "88px", height: "88px", borderRadius: "50%", background: "#f8fafc", border: "2px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem", color: "#94a3b8" }}>
              <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
            </div>
            <h2 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: "0 0 0.5rem" }}>
              Selamat Datang!
            </h2>
            <p style={{ fontSize: "1.15rem", color: "#64748b", maxWidth: "520px", margin: "0 auto 2rem", lineHeight: 1.6 }}>
              Silakan sebutkan pesanan Anda kepada kasir bertugas. Rincian tagihan akan tampil di layar ini.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem", background: "#f1f5f9", borderRadius: "999px", color: "#475569", fontSize: "0.9rem" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }} />
              Kasir Aktif Siap Melayani
            </div>
          </div>
        ) : (
          /* Layar Rincian Belanja Aktif */
          <>
            {/* Kolom Kiri: Daftar Item */}
            <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "1rem", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                    Pesanan Anda
                  </h2>
                  <span style={{ fontSize: "0.8rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>
                    #{activeOrder.code} · {activeOrder.channel?.toUpperCase()}
                  </span>
                </div>
                <div style={{ background: "#ecfdf5", color: "#065f46", padding: "0.35rem 0.85rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 700 }}>
                  {orderItems.length} Item
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "55vh", overflowY: "auto" }}>
                {orderItems.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "0.75rem", background: "#f8fafc", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "#0f172a" }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.15rem" }}>
                        <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>{item.qty}×</span> @ {rupiah(item.price)}
                        {item.note && <em style={{ marginLeft: "0.4rem", color: "#059669" }}>({item.note})</em>}
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 700, fontSize: "1.05rem", color: "#0f172a" }}>
                      {rupiah(item.qty * item.price)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Kolom Kanan: Ringkasan Total & Pembayaran */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 1rem", color: "#0f172a" }}>
                  Ringkasan Pembayaran
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", fontSize: "0.95rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                    <span>Subtotal</span>
                    <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{rupiah(activeOrder.subtotal || 0)}</span>
                  </div>
                  {Number(activeOrder.discount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444", fontWeight: 600 }}>
                      <span>Diskon</span>
                      <span style={{ fontFamily: "var(--font-mono, monospace)" }}>- {rupiah(activeOrder.discount)}</span>
                    </div>
                  )}
                  {Number(activeOrder.tax) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
                      <span>PB1 / Pajak</span>
                      <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{rupiah(activeOrder.tax)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: "2px dashed #e2e8f0", paddingTop: "0.75rem", marginTop: "0.25rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>Total Akhir</span>
                    <span style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--color-accent, #059669)", fontFamily: "var(--font-mono, monospace)" }}>
                      {rupiah(activeOrder.total || activeOrder.subtotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Panel Dinamis QRIS / VA jika sedang transaksi */}
              {paymentCharge && (paymentCharge.method === "qris" || paymentCharge.qr_url || qrPath || paymentCharge.va_number) && (
                <div style={{ background: "#ffffff", borderRadius: "16px", padding: "1.5rem", border: "2px solid #10b981", textAlign: "center", boxShadow: "0 8px 24px rgba(16, 185, 129, 0.1)" }}>
                  {paymentCharge.va_number ? (
                    <div>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.9rem", background: "#ecfdf5", borderRadius: "999px", color: "#065f46", fontSize: "0.85rem", fontWeight: 700, marginBottom: "1rem" }}>
                        <span>Transfer Virtual Account</span> · <span>{paymentCharge.bank_name || "Bank Nasional"}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "0.4rem" }}>Nomor Rekening Virtual Account:</div>
                      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "1.75rem", fontWeight: 800, letterSpacing: "0.08em", color: "#0f172a", background: "#f8fafc", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px dashed #cbd5e1", marginBottom: "1rem" }}>
                        {paymentCharge.va_number}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "#f1f5f9", borderRadius: "8px", fontSize: "0.9rem" }}>
                        <span style={{ color: "#475569" }}>Nominal Transfer:</span>
                        <strong style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "1.1rem", color: "#0f172a" }}>{rupiah(paymentCharge.amount || activeOrder.total || activeOrder.subtotal)}</strong>
                      </div>
                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                        Verifikasi otomatis real-time tanpa perlu unggah bukti transfer.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Pindai QRIS Dinamis Untuk Membayar
                      </span>
                      <div style={{ margin: "1rem auto", width: "280px", height: "280px", background: "#ffffff", padding: "10px", border: "1px solid #e2e8f0", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {qrPath ? (
                          <svg viewBox={`0 0 ${qrPath.size} ${qrPath.size}`} style={{ width: "100%", height: "100%" }} shapeRendering="crispEdges">
                            <path d={qrPath.d} fill="#000000" />
                          </svg>
                        ) : paymentCharge.qr_url ? (
                          <img src={paymentCharge.qr_url} alt="QRIS Dinamis" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        ) : null}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                        Mendukung GoPay, OVO, Dana, ShopeePay, BCA, Mandiri, BRI, dan seluruh m-Banking.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer Branding */}
      <footer style={{ textAlign: "center", padding: "1rem", color: "#94a3b8", fontSize: "0.8rem", borderTop: "1px solid #f1f5f9" }}>
        Didukung oleh Tijarah Cloud OS · Solusi Operasional &amp; POS Terpadu
      </footer>
    </div>
  );
}
