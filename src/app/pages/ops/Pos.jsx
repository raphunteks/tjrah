import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { Link } from "../../../lib/router.jsx";
import { can, permOf } from "../../../lib/rbac.js";
import { rupiah } from "../../../lib/format.js";
import { gsap, useGSAP, prefersReducedMotion } from "../../../lib/gsap.js";
import { PageHead, Loading, ErrorNote, Modal, Field, Badge, useAsync, Empty } from "../../ui/index.jsx";
import { useBranch, BranchSelect, useLive, useAction, Feedback, useIndex } from "../../ops.jsx";
import { PaymentModal } from "./Payment.jsx";
import OfflineBar from "./OfflineBar.jsx";
import { taxOf, taxLabel } from "../../../lib/tax.js";
import { dispatchHermesVoidAlert } from "../../../lib/hermes.js";
import { broadcastCustomerDisplay } from "../../../lib/customerDisplay.js";
import {
  getPrinterConfig,
  executePrint,
  buildReceiptEscPos,
} from "../../../lib/thermalPrinter.js";

const TABLE_STATUS = {
  available: "Kosong",
  occupied: "Terisi",
  cooking: "Diproses dapur",
  reserved: "Reservasi",
  dirty: "Perlu dibersihkan",
};

const KITCHEN = {
  new: ["Baru", "neutral"],
  cooking: ["Dimasak", "warn"],
  ready: ["Siap", "ok"],
  served: ["Diantar", "neutral"],
};

const VOID_REASONS = ["Salah Input Kasir", "Pelanggan Membatalkan", "Masakan Rusak"];

export default function Pos() {
  const { api, role, profile, tenant } = useAuth();
  const b = useBranch();
  const root = useRef(null);

  const [tab, setTab] = useState("menu"); // "meja" | "menu" | "tiket"
  const [serviceMode, setServiceMode] = useState("takeaway"); // "takeaway" | "dine_in" | "drive_thru"
  const [licensePlate, setLicensePlate] = useState("");
  const [sel, setSel] = useState({ takeaway: true }); // { tableId } | { takeaway: true } | { driveThru: true } | { orderId }
  const [cart, setCart] = useState([]);
  const [cat, setCat] = useState("Semua");
  const [q, setQ] = useState("");

  // CRM Pelanggan Kasir state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [newCustomerModal, setNewCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustNote, setNewCustNote] = useState("");

  // Quick Discount Widget state
  const [discUnit, setDiscUnit] = useState("rp"); // "rp" | "pct"
  const [discVal, setDiscVal] = useState("");

  // Tender / Kalkulator Kembalian Kasir Tunai state
  const [tenderAmount, setTenderAmount] = useState("");

  const [showTableModal, setShowTableModal] = useState(false);
  const kdsEnabled = Boolean(tenant?.kds_enabled);

  const [payOrder, setPayOrder] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [voidFor, setVoidFor] = useState(null);
  const [voidReason, setVoidReason] = useState(VOID_REASONS[0]);
  const [voidNote, setVoidNote] = useState("");
  const [voidOption, setVoidOption] = useState("restock");
  const a = useAction();

  const data = useAsync(async () => {
    if (!b.branchId) return null;
    const tId = tenant?.id || b.branch?.tenant_id;
    const [tables, products, orders, shifts, recent, customers] = await Promise.all([
      api.list("tables", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId }, order: ["sort"] }),
      api.list("products", { eq: tId ? { tenant_id: tId } : {}, order: ["name"] }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "open" }, order: ["created_at"] }),
      api.list("shifts", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "open" } }),
      api.list("orders", { eq: { ...(tId ? { tenant_id: tId } : {}), branch_id: b.branchId, status: "paid" }, order: ["paid_at", "desc"], limit: 8 }),
      api.list("customers", { eq: { ...(tId ? { tenant_id: tId } : {}) }, order: ["name"], limit: 200 }).catch(() => []),
    ]);
    const ids = orders.map((o) => o.id);
    const items = ids.length ? await api.list("order_items", { inList: ["order_id", ids], order: ["created_at"] }) : [];
    return {
      tables,
      products,
      orders,
      items,
      myShift: shifts.find((s) => s.cashier_id === profile.id),
      recent,
      customers: Array.isArray(customers) ? customers : [],
    };
  }, [api, b.branchId, tenant?.id, b.branch?.tenant_id, profile?.id]);

  useLive(["tables", "orders", "order_items", "products", "customers"], data.reload);

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
  const shown = (d?.products ?? []).filter(
    (p) =>
      (cat === "Semua" || p.category === cat) &&
      (p.name.toLowerCase().includes(q.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(q.toLowerCase())) ||
        (p.barcode && p.barcode.includes(q)))
  );

  const cartTotal = cart.reduce((s, c) => s + c.qty * (prodIdx[c.product_id]?.price ?? 0), 0);
  const currentSubtotal = (order?.subtotal ?? 0) + cartTotal;

  // Hitung Diskon Cepat Dinamis
  const computedDiscount = useMemo(() => {
    if (!discVal || isNaN(discVal)) return 0;
    const v = Number(discVal);
    if (v <= 0) return 0;
    if (discUnit === "pct") {
      return Math.round((currentSubtotal * Math.min(100, v)) / 100);
    }
    return Math.min(currentSubtotal, v);
  }, [discVal, discUnit, currentSubtotal]);

  const canSell = can(role, 5, "c");

  const addToCart = (p, evt) => {
    if (!p.is_available) return;

    // Subtle micro-animation pada elemen kartu yang ditekan
    if (evt?.currentTarget && !prefersReducedMotion()) {
      gsap.fromTo(evt.currentTarget, { scale: 0.96 }, { scale: 1, duration: 0.25, ease: "back.out(2)" });
    }

    setCart((c) => {
      const i = c.findIndex((x) => x.product_id === p.id && !x.note);
      return i >= 0 ? c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)) : [...c, { product_id: p.id, qty: 1, note: "" }];
    });

    if (window.matchMedia("(max-width: 960px)").matches) setTab("tiket");
  };

  const currentTotal = useMemo(() => {
    const net = Math.max(0, currentSubtotal - computedDiscount);
    return net + taxOf({ channel: order?.channel || serviceMode, subtotal: net }, tenant);
  }, [currentSubtotal, computedDiscount, order?.channel, serviceMode, tenant]);

  const tenderNum = Number(tenderAmount) || 0;
  const changeDue = Math.max(0, tenderNum - currentTotal);
  const isShortTender = tenderNum > 0 && tenderNum < currentTotal;
  const shortDue = currentTotal - tenderNum;

  const pickTable = (t) => {
    if (t.status === "dirty") {
      a.run(() => api.update("tables", t.id, { status: "available" }), `Meja ${t.label} siap dipakai lagi`).then(data.reload);
      return;
    }
    setServiceMode("dine_in");
    setSel({ tableId: t.id });
    setShowTableModal(false);
  };

  const changeServiceMode = (mode) => {
    setServiceMode(mode);
    if (mode === "takeaway") {
      setSel({ takeaway: true });
    } else if (mode === "drive_thru") {
      setSel({ driveThru: true, licensePlate });
    } else if (mode === "dine_in") {
      setShowTableModal(true);
    }
  };

  // Simpan Pelanggan Baru Langsung ke Tabel Customers
  const saveNewCustomer = () =>
    a.run(async () => {
      if (!newCustPhone || newCustPhone.replace(/\D/g, "").length < 8) {
        throw new Error("Nomor WhatsApp minimal 8 digit.");
      }
      const phoneClean = newCustPhone.replace(/[^\d+]/g, "");
      const res = await api.insert("customers", {
        tenant_id: tenant?.id || b.branch?.tenant_id,
        phone: phoneClean.startsWith("0") ? "62" + phoneClean.slice(1) : phoneClean,
        name: newCustName.trim() || null,
        note: newCustNote.trim() || null,
      });

      setSelectedCustomer(res || { name: newCustName, phone: phoneClean });
      setNewCustomerModal(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustNote("");
      data.reload();
    }, "Pelanggan baru berhasil didaftarkan dan terhubung ke Member L5!");

  // Filter pencarian pelanggan lama
  const customerResults = useMemo(() => {
    if (!customerSearch.trim() || !d?.customers) return [];
    const term = customerSearch.toLowerCase();
    return d.customers
      .filter((c) => (c.name && c.name.toLowerCase().includes(term)) || (c.phone && c.phone.includes(term)))
      .slice(0, 6);
  }, [customerSearch, d?.customers]);

  // Sinkronisasi realtime ke Layar Pelanggan (Customer Facing Display)
  useEffect(() => {
    if (order) {
      const items = (order.items || []).map((it) => ({
        id: it.id,
        name: it.name || it.product_name || prodIdx[it.product_id]?.name || "Menu Item",
        qty: it.qty || 1,
        price: it.price || prodIdx[it.product_id]?.price || 0,
        note: it.note || "",
      }));
      broadcastCustomerDisplay({
        type: "CART_UPDATE",
        order: {
          id: order.id,
          code: order.code,
          subtotal: currentSubtotal,
          discount: computedDiscount,
          tax: taxOf({ channel: order?.channel, subtotal: Math.max(0, currentSubtotal - computedDiscount) }, tenant),
          total: Math.max(0, currentSubtotal - computedDiscount) + taxOf({ channel: order?.channel, subtotal: Math.max(0, currentSubtotal - computedDiscount) }, tenant),
          channel: order.channel,
          customer_name: selectedCustomer?.name || order.customer_name,
        },
        items,
      });
    } else if (cart.length > 0) {
      const items = cart.map((c, idx) => {
        const prod = prodIdx[c.product_id] || {};
        return {
          id: `cart-${c.product_id || idx}`,
          name: prod.name || c.name || "Menu Item",
          qty: c.qty || 1,
          price: prod.price || c.price || 0,
          note: c.note || "",
        };
      });
      broadcastCustomerDisplay({
        type: "CART_UPDATE",
        order: {
          id: "draft",
          code: "DRAFT",
          subtotal: currentSubtotal,
          discount: computedDiscount,
          tax: taxOf({ channel: serviceMode, subtotal: Math.max(0, currentSubtotal - computedDiscount) }, tenant),
          total: Math.max(0, currentSubtotal - computedDiscount) + taxOf({ channel: serviceMode, subtotal: Math.max(0, currentSubtotal - computedDiscount) }, tenant),
          channel: serviceMode,
          customer_name: selectedCustomer?.name || "Pelanggan",
        },
        items,
      });
    } else {
      broadcastCustomerDisplay({
        type: "RESET",
      });
    }
  }, [cart, order?.id, currentSubtotal, computedDiscount, selectedCustomer?.name, serviceMode]);

  const send = () =>
    a.run(async () => {
      const channelPayload =
        serviceMode === "drive_thru"
          ? `drive_thru:${licensePlate || "tanpa-plat"}`
          : serviceMode === "takeaway"
          ? "takeaway"
          : "dine_in";

      const o = await api.rpc("create_order", {
        p_branch: b.branchId,
        p_items: cart,
        p_table: order ? null : sel?.tableId ?? null,
        p_channel: channelPayload,
        p_order: order?.id ?? null,
      });

      // Update metadata customer dan diskon pada orders jika ada
      if (selectedCustomer?.phone || computedDiscount > 0) {
        await api.update("orders", o.id, {
          customer_phone: selectedCustomer?.phone || null,
          customer_name: selectedCustomer?.name || null,
          discount: computedDiscount,
        });
      }

      setCart([]);
      setSel({ orderId: o.id });
      data.reload();
      return o;
    }, "Pesanan terkirim ke antrean layar dapur!");

  const payCashDirectly = () =>
    a.run(async () => {
      const tender = Number(tenderAmount) || currentTotal;
      if (tender < currentTotal) {
        throw new Error(`Uang yang diterima kurang ${rupiah(currentTotal - tender)}.`);
      }

      let activeO = order;
      if (!activeO && cart.length > 0) {
        const channelPayload =
          serviceMode === "drive_thru"
            ? `drive_thru:${licensePlate || "tanpa-plat"}`
            : serviceMode === "takeaway"
            ? "takeaway"
            : "dine_in";

        const o = await api.rpc("create_order", {
          p_branch: b.branchId,
          p_items: cart,
          p_table: sel?.tableId ?? null,
          p_channel: channelPayload,
          p_order: null,
        });

        if (selectedCustomer?.phone || computedDiscount > 0) {
          await api.update("orders", o.id, {
            customer_phone: selectedCustomer?.phone || null,
            customer_name: selectedCustomer?.name || null,
            discount: computedDiscount,
          });
        }

        activeO = o;
      }

      if (!activeO) return;

      if (activeO.table_id) {
        const lock = await api.lockTable(b.branchId, activeO.table_id);
        if (!lock.locked) throw new Error("Meja ini sedang diproses di kasir lain");
      }

      // Eksekusi pembayaran tunai (S-Wallet Tunai)
      const payRes = await api.rpc("pay_order", {
        p_order: activeO.id,
        p_payments: [{ method: "cash", amount: currentTotal, reference: null }],
        p_customer_phone: selectedCustomer?.phone || activeO.customer_phone || null,
        p_discount: computedDiscount || activeO.discount || null,
        p_pin: null,
      });

      // Cetak Struk Otomatis jika preferensi aktif
      const cfg = getPrinterConfig();
      if (cfg.autoPrintReceipt) {
        try {
          const bytes = buildReceiptEscPos({
            order: { ...activeO, ...payRes, total: currentTotal, customer_name: selectedCustomer?.name },
            tenant,
            cashierName: "Kasir",
          });
          executePrint({ role: "receipt", data: bytes, order: { ...activeO, ...payRes, total: currentTotal }, tenant }).catch(() => {});
        } catch {}
      }

      // Broadcast ke Layar Pelanggan
      broadcastCustomerDisplay({
        type: "ORDER_PAID",
        order: { ...activeO, ...payRes, total: currentTotal, change: tender - currentTotal, paid: tender },
      });

      if (activeO.table_id) {
        api.lockTable(b.branchId, activeO.table_id, "release").catch(() => {});
      }

      setCart([]);
      setSel({ takeaway: true });
      setSelectedCustomer(null);
      setDiscVal("");
      setTenderAmount("");
      data.reload();

      return payRes;
    }, `Pembayaran Tunai Lunas! Kembalian: ${rupiah(Math.max(0, (Number(tenderAmount) || currentTotal) - currentTotal))}`);

  const payDirectly = () =>
    a.run(async () => {
      let activeO = order;
      if (!activeO && cart.length > 0) {
        const channelPayload =
          serviceMode === "drive_thru"
            ? `drive_thru:${licensePlate || "tanpa-plat"}`
            : serviceMode === "takeaway"
            ? "takeaway"
            : "dine_in";

        const o = await api.rpc("create_order", {
          p_branch: b.branchId,
          p_items: cart,
          p_table: sel?.tableId ?? null,
          p_channel: channelPayload,
          p_order: null,
        });

        if (selectedCustomer?.phone || computedDiscount > 0) {
          await api.update("orders", o.id, {
            customer_phone: selectedCustomer?.phone || null,
            customer_name: selectedCustomer?.name || null,
            discount: computedDiscount,
          });
        }

        activeO = o;
        setCart([]);
        setSel({ orderId: o.id });
        data.reload();
      }

      if (!activeO) return;

      if (activeO.table_id) {
        const lock = await api.lockTable(b.branchId, activeO.table_id);
        if (!lock.locked) throw new Error("Meja ini sedang diproses di kasir lain");
      }

      setPayOrder({
        ...activeO,
        customer_phone: selectedCustomer?.phone || activeO.customer_phone,
        customer_name: selectedCustomer?.name || activeO.customer_name,
        discount: computedDiscount > 0 ? computedDiscount : activeO.discount,
      });
    });

  const openPay = () =>
    a.run(async () => {
      if (order?.table_id) {
        const lock = await api.lockTable(b.branchId, order.table_id);
        if (!lock.locked) throw new Error("Meja ini sedang diproses di kasir lain");
      }
      setPayOrder({
        ...order,
        customer_phone: selectedCustomer?.phone || order.customer_phone,
        customer_name: selectedCustomer?.name || order.customer_name,
        discount: computedDiscount > 0 ? computedDiscount : order.discount,
      });
    });

  const moveTo = (t) =>
    a.run(async () => {
      await api.rpc("move_order", { p_order: order.id, p_table: t.id });
      setMoveOpen(false);
      setSel({ tableId: t.id });
      data.reload();
    }, "Pesanan berhasil dipindahkan");

  const sendVoid = () =>
    a.run(async () => {
      await api.rpc("request_void", { p_order: voidFor.id, p_reason: voidReason, p_note: voidNote, p_option: voidOption });
      dispatchHermesVoidAlert({
        orderCode: voidFor.code || "NOTA-TRX",
        amount: voidFor.total || 0,
        cashierName: profile?.full_name || "Kasir Bertugas",
        reason: `${voidReason}${voidNote ? `: ${voidNote}` : ""}`,
        branchName: b.branch?.name || "Cabang Utama",
        tenantName: tenant?.name || "Tijarah Merchant",
        whatsappOwner: tenant?.whatsapp_owner,
        whatsappGm: tenant?.whatsapp_gm,
      });
      setVoidFor(null);
      setVoidNote("");
    }, "Permintaan void dikirim. Nota baru batal setelah GM/Owner memutuskan dengan PIN.");

  const ctxLabel = order
    ? order.table_label
      ? `Meja ${order.table_label}`
      : order.channel?.startsWith("drive_thru")
      ? `Drive Thru · ${order.channel.split(":")[1] || ""}`
      : `Takeaway · ${order.code}`
    : sel?.tableId
    ? `Meja ${d?.tables.find((t) => t.id === sel.tableId)?.label}`
    : serviceMode === "drive_thru"
    ? `Drive Thru (${licensePlate || "Input Plat"})`
    : "Takeaway Baru";

  return (
    <div ref={root}>
      <PageHead eyebrow="Fitur 5 · Register Transaksi POS Visual" title="Kasir POS" actions={<BranchSelect b={b} />} />

      {!canSell && <p className="d-note">Peran Anda hanya dapat melihat (R) register transaksi.</p>}
      {canSell && d && !d.myShift && (
        <p className="d-note d-note--warn">
          Shift kasir belum dibuka. Pesanan bisa dikirim ke dapur, tetapi pembayaran butuh shift aktif.{" "}
          <Link to="/app/shift">Buka shift kasir</Link>
        </p>
      )}

      {data.loading && !d ? (
        <Loading />
      ) : data.error ? (
        <ErrorNote error={data.error} onRetry={data.reload} />
      ) : !d ? (
        <Empty title="Pilih cabang" />
      ) : (
        <>
          <div className="pos-tabs d-seg" role="tablist" aria-label="Bagian kasir">
            {[
              ["menu", "Menu Visual"],
              ["tiket", `Tiket${cart.length ? ` · ${cart.length}` : ""}`],
            ].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} aria-checked={tab === k} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>

          <div className={`pos pos--${tab}`}>
            {/* 1. GRID MENU VISUAL PROPORSIONAL & LUAS */}
            <section className="pos-col pos-col--menu" aria-label="Menu visual">
              <div className="pos-menu-head">
                <input
                  type="search"
                  placeholder="Cari menu, SKU, atau scan barcode…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Cari menu"
                />
                <div className="d-chips">
                  {cats.map((c) => (
                    <button key={c} type="button" className={`d-chip${cat === c ? " is-on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="pos-menu"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "10px",
                }}
              >
                {shown.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="pos-prod--visual"
                    disabled={!p.is_available || !canSell}
                    onClick={(evt) => addToCart(p, evt)}
                    title={p.name}
                  >
                    {/* Kotak Foto WebP 1:1 */}
                    <div className="pos-prod__img-box">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="pos-prod__img" loading="lazy" />
                      ) : (
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#94a3b8" }}>
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                        </svg>
                      )}
                      <div className="pos-prod__badge-pos">
                        <Badge tone={p.is_available ? "ok" : "danger"}>
                          {p.is_available ? "Ada" : "86"}
                        </Badge>
                      </div>
                    </div>

                    <div className="pos-prod__body">
                      <span className="pos-prod__category">{p.category}</span>
                      <span className="pos-prod__name" style={{ fontSize: "0.85rem", height: "2.3rem", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {p.name}
                      </span>
                      <span className="pos-prod__price" style={{ marginTop: "4px" }}>
                        {rupiah(p.price)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* 2. PANEL TIKET PESANAN KASIR */}
            <section className="pos-col pos-col--ticket" aria-label="Tiket pesanan">
              {/* DROPDOWN PESANAN TERBUKA / HOLD JIKA ADA */}
              {d.orders.length > 0 && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <select
                    className="d-input d-input--sm"
                    style={{ fontSize: "0.8rem", width: "100%", fontFamily: "var(--font-mono)", padding: "4px 8px" }}
                    value={order?.id || ""}
                    onChange={(e) => {
                      if (!e.target.value) {
                        setSel({ takeaway: true });
                        setCart([]);
                      } else {
                        setSel({ orderId: e.target.value });
                        setCart([]);
                      }
                    }}
                  >
                    <option value="">+ Pesanan Baru (Draft Aktif)</option>
                    {d.orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code} {o.table ? `· Meja ${o.table.label}` : `· ${o.channel || "Hold"}`} · {rupiah(o.subtotal)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* TIGA MODE LAYANAN DI PUNCAK TIKET */}
              <div className="pos-service-mode" role="radiogroup" aria-label="Mode Layanan">
                <button
                  type="button"
                  className={`pos-service-btn ${serviceMode === "takeaway" ? "is-active" : ""}`}
                  onClick={() => changeServiceMode("takeaway")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                    <line x1="3" x2="21" y1="6" y2="6" />
                    <path d="M16 10a4 4 0 0 1-8 0" />
                  </svg>
                  <span>Takeaway</span>
                </button>
                <button
                  type="button"
                  className={`pos-service-btn ${serviceMode === "dine_in" ? "is-active" : ""}`}
                  onClick={() => changeServiceMode("dine_in")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 2v8a4 4 0 0 1-8 0V2" />
                    <path d="M14 2v20" />
                    <path d="M6 2v20" />
                  </svg>
                  <span>Dine In</span>
                </button>
                <button
                  type="button"
                  className={`pos-service-btn ${serviceMode === "drive_thru" ? "is-active" : ""}`}
                  onClick={() => changeServiceMode("drive_thru")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                  <span>Drive Thru</span>
                </button>
              </div>

              {/* INDIKATOR MEJA DINE IN */}
              {serviceMode === "dine_in" && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", padding: "6px 10px", background: "var(--color-paper-2)", borderRadius: "6px", fontSize: "0.82rem", border: "1px solid var(--color-rule-2)" }}>
                  <span>
                    Meja: <strong>{d.tables.find((t) => t.id === (order?.table_id || sel?.tableId))?.label ? `Meja ${d.tables.find((t) => t.id === (order?.table_id || sel?.tableId))?.label}` : "Belum pilih meja"}</strong>
                  </span>
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--sm"
                    onClick={() => setShowTableModal(true)}
                    style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                  >
                    {sel?.tableId || order?.table_id ? "Ganti Meja" : "Pilih Meja"}
                  </button>
                </div>
              )}

              {/* Form Input Tambahan Mode Drive Thru */}
              {serviceMode === "drive_thru" && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <input
                    type="text"
                    placeholder="Nomor Polisi Mobil (misal: DD 1234 XY)"
                    value={licensePlate}
                    onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                    style={{ width: "100%", padding: "6px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--color-rule-2)", textTransform: "uppercase", fontFamily: "var(--font-mono)" }}
                  />
                </div>
              )}

              {/* MODUL CRM PELANGGAN L5 */}
              <div className="pos-crm-bar">
                {selectedCustomer ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: "0.85rem" }}>
                    <div>
                      <strong>{selectedCustomer.name || "Pelanggan"}</strong>
                      <span style={{ color: "var(--color-muted)", marginLeft: "0.4rem", fontSize: "0.78rem" }}>
                        ({selectedCustomer.phone})
                      </span>
                      {selectedCustomer.points != null && (
                        <Badge tone="ok" style={{ marginLeft: "0.4rem" }}>
                          {selectedCustomer.points} Poin L5
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      className="d-btn d-btn--ghost d-btn--sm"
                      onClick={() => setSelectedCustomer(null)}
                      title="Ganti Pelanggan"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div style={{ position: "relative", width: "100%", display: "flex", gap: "4px" }}>
                    <input
                      type="text"
                      placeholder="Cari pelanggan (nama/WA)…"
                      value={customerSearch}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      style={{ flex: 1, padding: "5px 8px", fontSize: "0.82rem", borderRadius: "4px", border: "1px solid var(--color-rule-2)" }}
                    />
                    <button
                      type="button"
                      className="d-btn d-btn--ghost d-btn--sm"
                      onClick={() => setNewCustomerModal(true)}
                      title="Daftarkan pelanggan baru ke Member L5"
                      style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                    >
                      + Member
                    </button>

                    {showCustomerDropdown && customerResults.length > 0 && (
                      <div className="pos-crm-dropdown">
                        {customerResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="pos-crm-item"
                            onClick={() => {
                              setSelectedCustomer(c);
                              setShowCustomerDropdown(false);
                              setCustomerSearch("");
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600 }}>{c.name || "Tanpa Nama"}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{c.phone}</div>
                            </div>
                            <Badge tone="neutral">{c.points || 0} Poin</Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <header className="pos-ticket-head">
                <h2>{ctxLabel}</h2>
                {order && <p className="d-mono d-muted">{order.code}</p>}
              </header>

              {orderItems.length > 0 && (
                <ul className="pos-lines">
                  {orderItems.map((i) => (
                    <li key={i.id}>
                      <span>
                        {i.qty}× {i.name}
                        {i.note && <em className="d-muted"> · {i.note}</em>}
                      </span>
                      <Badge tone={KITCHEN[i.kitchen_status][1]}>{KITCHEN[i.kitchen_status][0]}</Badge>
                      <span className="d-num">{rupiah(i.qty * i.price)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {cart.length > 0 && (
                <>
                  <p className="d-nav__label">Belum Dikirim</p>
                  <ul className="pos-lines pos-lines--cart">
                    {cart.map((c, i) => (
                      <li key={i}>
                        <div className="pos-qty">
                          <button
                            type="button"
                            aria-label="Kurangi"
                            onClick={() =>
                              setCart((x) =>
                                x.map((y, j) => (j === i ? { ...y, qty: y.qty - 1 } : y)).filter((y) => y.qty > 0)
                              )
                            }
                          >
                            −
                          </button>
                          <span>{c.qty}</span>
                          <button
                            type="button"
                            aria-label="Tambah"
                            onClick={() => setCart((x) => x.map((y, j) => (j === i ? { ...y, qty: y.qty + 1 } : y)))}
                          >
                            +
                          </button>
                        </div>
                        <div className="pos-line-main">
                          <span>{prodIdx[c.product_id]?.name}</span>
                          <input
                            placeholder="Catatan rasa/alergen…"
                            value={c.note}
                            onChange={(e) =>
                              setCart((x) => x.map((y, j) => (j === i ? { ...y, note: e.target.value } : y)))
                            }
                          />
                        </div>
                        <span className="d-num">{rupiah(c.qty * (prodIdx[c.product_id]?.price ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {!order && cart.length === 0 && <Empty title="Tiket kosong">Pilih menu untuk mulai menjual.</Empty>}

              {/* WIDGET DISKON CEPAT DI ATAS SUBTOTAL */}
              <div className="pos-quick-disc">
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-ink-2)" }}>Diskon Cepat:</span>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <div className="d-seg" style={{ padding: "2px" }}>
                    <button
                      type="button"
                      className={discUnit === "rp" ? "is-active" : ""}
                      onClick={() => setDiscUnit("rp")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 700 }}
                    >
                      Rp
                    </button>
                    <button
                      type="button"
                      className={discUnit === "pct" ? "is-active" : ""}
                      onClick={() => setDiscUnit("pct")}
                      style={{ padding: "3px 8px", fontSize: "0.75rem", fontWeight: 700 }}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={discUnit === "rp" ? "0" : "0%"}
                    value={discVal}
                    onChange={(e) => setDiscVal(e.target.value)}
                    style={{ width: "80px", padding: "4px 8px", fontSize: "0.85rem", textAlign: "right", borderRadius: "4px", border: "1px solid var(--color-rule-2)", fontFamily: "var(--font-mono)" }}
                  />
                </div>
              </div>

              {/* RINGKASAN TAGIHAN */}
              <dl className="pos-sum">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{rupiah(currentSubtotal)}</dd>
                </div>
                {computedDiscount > 0 && (
                  <div style={{ color: "var(--color-danger)" }}>
                    <dt>Diskon Potongan</dt>
                    <dd>− {rupiah(computedDiscount)}</dd>
                  </div>
                )}
                <div>
                  <dt>{taxLabel(order, tenant)}</dt>
                  <dd>
                    {rupiah(
                      taxOf(
                        { channel: order?.channel, subtotal: Math.max(0, currentSubtotal - computedDiscount) },
                        tenant
                      )
                    )}
                  </dd>
                </div>
                <div className="is-total">
                  <dt>Total Akhir</dt>
                  <dd>
                    {rupiah(currentTotal)}
                  </dd>
                </div>
              </dl>

              {/* MODUL KALKULATOR KEMBALIAN KASIR TUNAI & PECAHAN CEPAT */}
              {currentTotal > 0 && (
                <div style={{ marginTop: "1rem", padding: "12px", background: "var(--color-paper-2)", borderRadius: "8px", border: "1px solid var(--color-rule-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-ink)" }}>
                      Kalkulator Kembalian Tunai:
                    </span>
                    <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--color-muted)" }}>
                      Tagihan: {rupiah(currentTotal)}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ fontSize: "0.82rem", color: "var(--color-muted)", fontWeight: 600 }}>Uang Diterima:</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Rp 0"
                      value={tenderAmount}
                      onChange={(e) => setTenderAmount(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        fontSize: "0.95rem",
                        fontWeight: 700,
                        textAlign: "right",
                        borderRadius: "6px",
                        border: "1px solid var(--color-rule-2)",
                        fontFamily: "var(--font-mono)",
                        background: "var(--color-paper)",
                      }}
                    />
                  </div>

                  {/* 6 Tombol Pecahan Uang Cepat */}
                  <div className="pos-tender-grid" style={{ marginTop: "8px" }}>
                    <button
                      type="button"
                      className="pos-tender-btn"
                      onClick={() => setTenderAmount(String(currentTotal))}
                    >
                      Uang Pas
                    </button>
                    <button type="button" className="pos-tender-btn" onClick={() => setTenderAmount("10000")}>
                      Rp 10.000
                    </button>
                    <button type="button" className="pos-tender-btn" onClick={() => setTenderAmount("20000")}>
                      Rp 20.000
                    </button>
                    <button type="button" className="pos-tender-btn" onClick={() => setTenderAmount("40000")}>
                      Rp 40.000
                    </button>
                    <button type="button" className="pos-tender-btn" onClick={() => setTenderAmount("50000")}>
                      Rp 50.000
                    </button>
                    <button type="button" className="pos-tender-btn" onClick={() => setTenderAmount("100000")}>
                      Rp 100.000
                    </button>
                  </div>

                  {/* Banner Kembalian Dinamis */}
                  {tenderNum > 0 && (
                    <div className={`pos-change-banner ${isShortTender ? "pos-change-banner--short" : ""}`} style={{ marginTop: "6px", padding: "8px 12px", fontSize: "1rem" }}>
                      {isShortTender ? (
                        <span>Kurang: −{rupiah(shortDue)}</span>
                      ) : (
                        <span>Uang Kembalian: {rupiah(changeDue)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pos-actions" style={{ marginTop: "1rem" }}>
                {kdsEnabled && (
                  <button
                    type="button"
                    className="d-btn d-btn--ghost d-btn--block"
                    disabled={!cart.length || a.busy || !canSell}
                    onClick={send}
                  >
                    {order ? "Tambah ke pesanan" : "Kirim ke dapur"}
                  </button>
                )}
                <div style={{ display: "grid", gridTemplateColumns: currentTotal > 0 ? "1.2fr 1fr" : "1fr", gap: "8px" }}>
                  <button
                    type="button"
                    className="d-btn d-btn--primary d-btn--block"
                    disabled={(!order && !cart.length) || a.busy || !d.myShift || isShortTender}
                    onClick={payCashDirectly}
                    title="Bayar Tunai & Catat ke Cash Drawer S-Wallet"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect width="20" height="12" x="2" y="6" rx="2" />
                      <circle cx="12" cy="12" r="2" />
                      <path d="M6 12h.01M18 12h.01" />
                    </svg>
                    <span>Bayar Tunai</span>
                  </button>
                  {currentTotal > 0 && (
                    <button
                      type="button"
                      className="d-btn d-btn--ghost d-btn--block"
                      disabled={(!order && !cart.length) || a.busy || !d.myShift}
                      onClick={payDirectly}
                      title="Buka QRIS Dinamis Pakasir atau Virtual Account 9 Bank"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="20" height="14" x="2" y="5" rx="2" />
                        <line x1="2" x2="22" y1="10" y2="10" />
                      </svg>
                      <span>QRIS / VA</span>
                    </button>
                  )}
                </div>
                {order?.table_id && (
                  <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => setMoveOpen(true)}>
                    Pindah / gabung meja
                  </button>
                )}
              </div>

              <Feedback a={a} />
              <OfflineBar
                cart={cart}
                branchId={b.branchId}
                cartTotal={cartTotal}
                hasOrder={Boolean(order)}
                onQueued={() => {
                  setCart([]);
                  data.reload();
                }}
              />

              {d.recent.length > 0 && can(role, 6, "q") && (
                <details className="pos-recent" style={{ marginTop: "1rem" }}>
                  <summary>Transaksi lunas terakhir</summary>
                  <ul className="d-list">
                    {d.recent.map((o) => (
                      <li key={o.id}>
                        <div>
                          <p className="d-mono">{o.code}</p>
                          <p className="d-list__meta">
                            {o.table_label ? `Meja ${o.table_label}` : o.channel} · {rupiah(o.total)}
                          </p>
                        </div>
                        <button type="button" className="d-btn d-btn--danger-ghost d-btn--sm" onClick={() => setVoidFor(o)}>
                          Ajukan void
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </div>
        </>
      )}

      {/* MODAL PILIH MEJA DINE IN */}
      <Modal open={showTableModal} title="Pilih Meja Pelanggan" onClose={() => setShowTableModal(false)}>
        <p className="d-text" style={{ marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--color-muted)" }}>
          Klik salah satu meja untuk menetapkan pesanan Dine In ini:
        </p>
        <div style={{ display: "grid", gap: "1rem" }}>
          {[...new Set(d.tables.map((t) => t.area))].map((area) => (
            <div key={area}>
              <p className="d-nav__label" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{area}</p>
              <ul className="pos-floor pos-floor--wide" style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))", gap: "8px" }}>
                {d.tables
                  .filter((t) => t.area === area)
                  .map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`pos-table st--${t.status}${sel?.tableId === t.id || order?.table_id === t.id ? " is-sel" : ""}`}
                        onClick={() => pickTable(t)}
                        style={{ width: "100%", padding: "8px", textAlign: "center", borderRadius: "6px", border: "1px solid var(--color-rule-2)" }}
                        aria-label={`Meja ${t.label}, ${TABLE_STATUS[t.status]}`}
                      >
                        <span className="pos-table__no">{t.label}</span>
                        <span className="pos-table__st">{TABLE_STATUS[t.status]}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>

      {/* DIALOG PEMBAYARAN KASIR MULTI-METODE (TUNAI / QRIS / VA) */}
      <PaymentModal
        open={Boolean(payOrder)}
        order={payOrder}
        onClose={() => {
          if (payOrder?.table_id) api.lockTable(b.branchId, payOrder.table_id, "release");
          setPayOrder(null);
          setSel({ takeaway: true });
        }}
        onPaid={() => data.reload()}
      />

      {/* MODAL PINDAH MEJA */}
      <Modal open={moveOpen} title="Pindah atau gabung meja" onClose={() => setMoveOpen(false)}>
        <p className="d-text">Meja kosong: pesanan dipindah. Meja terisi: tagihan digabung ke pesanan meja itu.</p>
        <ul className="pos-floor pos-floor--modal">
          {(d?.tables ?? [])
            .filter((t) => t.id !== order?.table_id)
            .map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`pos-table st--${t.status}`}
                  onClick={() => moveTo(t)}
                >
                  <span className="pos-table__no">{t.label}</span>
                  <span className="pos-table__st">{TABLE_STATUS[t.status]}</span>
                </button>
              </li>
            ))}
        </ul>
      </Modal>

      {/* MODAL TAMBAH PELANGGAN BARU CRM L5 */}
      <Modal
        open={newCustomerModal}
        title="Daftar Member L5 Baru"
        onClose={() => setNewCustomerModal(false)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setNewCustomerModal(false)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--primary"
              disabled={a.busy || !newCustPhone || !newCustName}
              onClick={saveNewCustomer}
            >
              Simpan &amp; Hubungkan Member
            </button>
          </>
        }
      >
        <div className="d-form">
          <Field label="Nama Lengkap Pelanggan" id="nc-name">
            <input
              id="nc-name"
              placeholder="Contoh: Andi Pratama"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
            />
          </Field>
          <Field label="Nomor WhatsApp (+62)" id="nc-phone" hint="Nomor aktif untuk penerimaan e-struk transaksi dan login Member Portal /m">
            <input
              id="nc-phone"
              inputMode="tel"
              placeholder="08xxxxxxxxxx"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value.replace(/[^\d+]/g, ""))}
            />
          </Field>
          <Field label="Catatan Alergen / Preferensi Khusus" id="nc-note">
            <textarea
              id="nc-note"
              rows="2"
              placeholder="Contoh: Alergi kacang, kopi tidak pakai gula"
              value={newCustNote}
              onChange={(e) => setNewCustNote(e.target.value)}
            />
          </Field>
          <Feedback a={a} />
        </div>
      </Modal>

      {/* MODAL AJUKAN VOID */}
      <Modal
        open={Boolean(voidFor)}
        title="Ajukan void nota transaksi"
        onClose={() => setVoidFor(null)}
        footer={
          <>
            <button type="button" className="d-btn d-btn--ghost" onClick={() => setVoidFor(null)}>
              Batal
            </button>
            <button
              type="button"
              className="d-btn d-btn--danger"
              disabled={a.busy || !voidNote.trim()}
              onClick={sendVoid}
            >
              Kirim permintaan void
            </button>
          </>
        }
      >
        {voidFor && (
          <div className="d-form">
            <p className="d-text">
              <span className="d-mono">{voidFor.code}</span> · {rupiah(voidFor.total)}. Tombol void terkunci: GM/Owner memeriksa fisik pesanan lalu memasukkan PIN otorisasi.
            </p>
            <Field label="Alasan Void" id="v-r">
              <select id="v-r" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}>
                {VOID_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Penanganan Bahan / Stok" id="v-opt">
              <select id="v-opt" value={voidOption} onChange={(e) => setVoidOption(e.target.value)}>
                <option value="restock">Kembalikan ke stok (salah ketik / belum diolah)</option>
                <option value="waste">Catat sebagai bahan rusak / waste (sudah dimasak)</option>
              </select>
            </Field>
            <Field label="Catatan Kasir (Wajib)" hint="Alasan pembatalan untuk dicatat di log audit" id="v-n">
              <textarea id="v-n" rows="2" value={voidNote} onChange={(e) => setVoidNote(e.target.value)} />
            </Field>
            <Feedback a={a} />
          </div>
        )}
      </Modal>
    </div>
  );
}
