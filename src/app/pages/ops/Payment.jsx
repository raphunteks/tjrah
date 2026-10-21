import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../auth/AuthProvider.jsx";
import { rupiah } from "../../../lib/format.js";
import { Modal, Field, Badge, useAsync } from "../../ui/index.jsx";
import { useAction, Feedback } from "../../ops.jsx";
import { taxOf, taxLabel as taxLabelOf } from "../../../lib/tax.js";
import { calculateAndCreditDoctorSplit } from "../../../api/swallet.js";
import { dispatchHermesPosSale } from "../../../lib/hermes.js";
import { broadcastCustomerDisplay } from "../../../lib/customerDisplay.js";
import { createPakasirTransaction } from "../../../api/pakasir.js";
import QrisPanel from "./QrisPanel.jsx";

const METHODS = [
  ["cash", "Tunai (S-Wallet Tunai)"],
  ["qris", "QRIS Dinamis"],
  ["va", "Transfer (VA Pakasir)"],
  ["swallet", "S-Wallet Member"],
  ["card", "Kartu EDC"],
];

const PAKASIR_VA_BANKS = [
  { id: "bri_va", name: "Bank BRI", code: "BRI" },
  { id: "bni_va", name: "Bank BNI", code: "BNI" },
  { id: "cimb_niaga_va", name: "Bank CIMB Niaga", code: "CIMB" },
  { id: "bsi_va", name: "Bank Syariah Indonesia", code: "BSI" },
  { id: "danamon_va", name: "Bank Danamon", code: "DANAMON" },
  { id: "muamalat_va", name: "Bank Muamalat", code: "MUAMALAT" },
  { id: "bnc_va", name: "Bank Neo Commerce", code: "BNC" },
  { id: "maybank_va", name: "Maybank Indonesia", code: "MAYBANK" },
  { id: "ocbc_va", name: "Bank OCBC", code: "OCBC" },
];

export { taxOf };

/* QR simulasi: pola deterministik dari kode invoice (bukan QRIS sungguhan). */
export function FakeQr({ seed }) {
  const cells = useMemo(() => {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Array.from({ length: 21 * 21 }, (_, i) => {
      const x = i % 21, y = Math.floor(i / 21);
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) return (x % 6 === 0 || y % 6 === 0 || (x % 14 >= 2 && x % 14 <= 4 && y % 14 >= 2 && y % 14 <= 4)) || (x > 13 && (x - 14) % 6 === 0) || (y > 13 && (y - 14) % 6 === 0);
      h = (h * 1103515245 + 12345) >>> 0;
      return (h >> 16) % 2 === 0;
    });
  }, [seed]);
  return (
    <svg viewBox="0 0 21 21" className="pos-qr" role="img" aria-label="QR simulasi">
      {cells.map((on, i) => on && <rect key={i} x={i % 21} y={Math.floor(i / 21)} width="1" height="1" />)}
    </svg>
  );
}

export function PaymentModal({ open, order, onClose, onPaid }) {
  const { api, tenant, role } = useAuth();
  const [disc, setDisc] = useState("");
  const [pin, setPin] = useState("");
  const [maxPct, setMaxPct] = useState(15);
  useEffect(() => {      // batas diskon efektif (Tenant → Cabang → Peran) untuk kasir ini
    let on = true;
    if (open && order && api?.getEffectivePolicy) {
      api.getEffectivePolicy({ tenantId: order.tenant_id, branchId: order.branch_id, role }).then((p) => on && p?.max_discount_pct != null && setMaxPct(Number(p.max_discount_pct))).catch(() => {});
    }
    return () => { on = false; };
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vo, setVo] = useState(null);        // pesanan setelah voucher diterapkan (diskon dihitung server)
  const [vcode, setVcode] = useState("");
  const va = useAction();
  useEffect(() => { setVo(order?.voucher_code ? order : null); setVcode(""); va.setError(null); }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const viaVoucher = Boolean(vo?.voucher_code);
  const discAmt = order ? (viaVoucher ? vo.discount : Math.min(Math.max(0, Math.round(Number(disc) || 0)), order.subtotal)) : 0;
  const discPct = order && order.subtotal > 0 ? Math.round((discAmt / order.subtotal) * 10000) / 100 : 0;
  const needPin = !viaVoucher && discAmt > 0 && discPct > maxPct;
  const total = order ? order.subtotal - discAmt + taxOf({ ...order, subtotal: order.subtotal - discAmt }, tenant) : 0;
  const taxLabel = taxLabelOf(order, tenant);
  const [rows, setRows] = useState([]);
  const [phone, setPhone] = useState("");
  useEffect(() => setPhone(order?.customer_phone ?? ""), [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && total > 0 && rows.length === 0) {
      setRows([
        {
          method: "cash",
          amount: total,
          vaBank: undefined,
          reference: "",
          confirmed: true,
        },
      ]);
    }
  }, [open, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const flags = useAsync(() => (api?.rpc ? api.rpc("my_flags").catch(() => ({})) : Promise.resolve({})), [api]);
  const qrisOn = Boolean(flags.data?.qris_dynamic) && typeof api?.qrisCreate === "function";
  const [cardTok, setCardTok] = useState("");
  const [cardInfo, setCardInfo] = useState(null);
  const scan = useAction();
  const scanCard = () =>
    scan.run(async () => {
      const r = await api.rpc("resolve_member_card", { p_token: cardTok.trim() });
      setPhone(r.phone ?? "");
      setCardInfo(r);
      setCardTok("");
      return r;
    });
  const [split, setSplit] = useState(2);
  const [receipt, setReceipt] = useState(null);
  const [copiedVa, setCopiedVa] = useState(null);
  const [vaGenerating, setVaGenerating] = useState(false);
  const a = useAction();
  const paid = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const cash = rows.filter((r) => r.method === "cash").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const change = Math.max(0, paid - total);
  const remaining = Math.max(0, total - paid);

  const add = (method, amount = remaining) =>
    setRows((r) => [
      ...r,
      {
        method,
        amount,
        vaBank: method === "va" ? "bri_va" : undefined,
        reference: "",
        confirmed: method === "cash",
      },
    ]);
  const set = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const equalSplit = () => {
    const n = Math.max(2, Math.min(20, Number(split) || 2));
    const each = Math.floor(total / n);
    setRows(Array.from({ length: n }, (_, i) => ({ method: "qris", amount: i === n - 1 ? total - each * (n - 1) : each, reference: "", confirmed: false })));
  };
  const unconfirmed = rows.some((r) => r.method !== "cash" && !r.confirmed);

  const onQrisPaid = async () => {
    const [o] = await api.list("orders", { eq: { id: order.id } });
    setReceipt({ ...(o ?? order), change: 0, rows: [] });
    broadcastCustomerDisplay({
      type: "ORDER_PAID",
      order: { ...(o ?? order), total: o?.total ?? total, change: 0 },
    });
    // Dispatch notifikasi realtime penjualan kasir (QRIS) ke WhatsApp Owner & GM
    dispatchHermesPosSale({
      order: o ?? order,
      total: o?.total ?? total,
      paymentMethod: "QRIS INSTAN",
      cashierName: order.cashier_name || "Kasir",
      tenantName: tenant?.name || "Tijarah Merchant",
      branchName: order.branch_name || "Cabang Utama",
      whatsappOwner: tenant?.whatsapp_owner,
      whatsappGm: tenant?.whatsapp_gm
    });
    onPaid();
  };

  const submit = () =>
    a.run(async () => {
      const r = await api.rpc("pay_order", {
        p_order: order.id,
        p_payments: rows.filter((x) => Number(x.amount) > 0).map((x) => ({ method: x.method, amount: Number(x.amount), reference: x.reference || null })),
        p_customer_phone: phone || null,
        p_discount: viaVoucher ? null : discAmt || null,
        p_pin: needPin ? pin : null,
      });
      if (order.channel === "clinic") {
        calculateAndCreditDoctorSplit({
          doctorId: order.practitioner_id || "doctor-demo",
          doctorName: order.practitioner_name || "Dokter",
          serviceAmount: order.subtotal || order.total,
          orderCode: order.code
        });
      }

      // Dispatch notifikasi realtime penjualan kasir ke WhatsApp Owner & GM
      dispatchHermesPosSale({
        order: { ...order, ...r },
        total,
        paymentMethod: rows.map((x) => x.method?.toUpperCase()).filter(Boolean).join(", ") || "TUNAI",
        cashierName: order.cashier_name || "Kasir",
        tenantName: tenant?.name || "Tijarah Merchant",
        branchName: order.branch_name || "Cabang Utama",
        whatsappOwner: tenant?.whatsapp_owner,
        whatsappGm: tenant?.whatsapp_gm
      });

      // Broadcast ke Layar Pelanggan bahwa pembayaran lunas
      broadcastCustomerDisplay({
        type: "ORDER_PAID",
        order: { ...order, ...r, total, change, paid },
      });

      setReceipt({ ...r, change, rows });
      onPaid();
      return r;
    });

  const close = () => {
    broadcastCustomerDisplay({ type: "RESET" });
    setRows([]);
    setDisc("");
    setVo(null);
    setPin("");
    setPhone("");
    setReceipt(null);
    setCopiedVa(null);
    a.setError(null);
    onClose();
  };

  if (!order) return null;
  return (
    <Modal
      open={open}
      title={receipt ? "Pembayaran berhasil" : `Bayar ${order.table_label ? `Meja ${order.table_label}` : order.customer_name ?? order.code}`}
      onClose={close}
      footer={receipt ? (
        <>
          <button type="button" className="d-btn d-btn--ghost" onClick={() => window.print()}>Cetak struk</button>
          <button type="button" className="d-btn d-btn--primary" onClick={close}>Selesai</button>
        </>
      ) : (
        <>
          <button type="button" className="d-btn d-btn--ghost" onClick={close}>Batal</button>
          <button type="button" className="d-btn d-btn--primary" disabled={a.busy || paid < total || unconfirmed || change > cash || (needPin && pin.length < 4)} onClick={submit}>
            {a.busy ? "Memproses…" : `Terima ${rupiah(paid)}`}
          </button>
        </>
      )}
    >
      {receipt ? (
        <div className="pos-receipt" id="struk">
          <div style={{ textAlign: "center", marginBottom: "var(--space-sm)", borderBottom: "1px dashed var(--color-rule)", paddingBottom: "var(--space-sm)" }}>
            <h3 style={{ margin: "0 0 var(--space-3xs)", font: "700 var(--text-base) var(--font-display)", letterSpacing: "0.02em" }}>TIJARAH</h3>
            <p className="d-text d-muted" style={{ margin: 0, fontSize: "0.6875rem" }}>Cloud POS & Smart Operating System</p>
            <p className="d-mono" style={{ margin: "var(--space-3xs) 0 0", fontSize: "0.8125rem", fontWeight: 600 }}>{receipt.code}</p>
          </div>
          <dl className="pos-sum">
            <div><dt>Subtotal</dt><dd>{rupiah(receipt.subtotal)}</dd></div>
            {receipt.discount > 0 && <div><dt>Diskon</dt><dd>−{rupiah(receipt.discount)}</dd></div>}
            <div><dt>{taxLabel}</dt><dd>{rupiah(receipt.tax)}</dd></div>
            <div className="is-total"><dt>Total</dt><dd>{rupiah(receipt.total)}</dd></div>
            <div><dt>Dibayar</dt><dd>{rupiah(paid)}</dd></div>
            {receipt.change > 0 && <div><dt>Kembalian</dt><dd style={{ fontWeight: 700, color: "var(--brand-emerald)" }}>{rupiah(receipt.change)}</dd></div>}
          </dl>
          <p className="d-text d-muted">{order.channel === "clinic" ? "Stok obat terpotong otomatis, e-resep berstatus diserahkan, auto-split 30% jasa medis langsung cair ke S-Wallet dokter, jurnal tercatat seimbang." : "Stok bahan terpotong sesuai resep, jurnal penjualan tercatat otomatis."}{phone && " Poin CRM bertambah dan struk digital diantrekan ke WhatsApp pelanggan lewat Hermes."}</p>
        </div>
      ) : (
        <div className="d-form">
          <dl className="pos-sum">
            <div><dt>Subtotal</dt><dd>{rupiah(order.subtotal)}</dd></div>
            {discAmt > 0 && <div><dt>Diskon ({discPct}%)</dt><dd>−{rupiah(discAmt)}</dd></div>}
            <div><dt>{taxLabel}</dt><dd>{rupiah(total - (order.subtotal - discAmt))}</dd></div>
            <div className="is-total"><dt>Total tagihan</dt><dd>{rupiah(total)}</dd></div>
          </dl>
          <Field label="Kode voucher / promo" id="pay-voucher" hint={viaVoucher ? `Voucher ${vo.voucher_code} dipakai; diskon dihitung server dan tidak butuh PIN.` : "Opsional. Diskon voucher tidak melewati batas diskon manual."}>
            <div className="d-row-actions">
              {viaVoucher ? (
                <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={va.busy} onClick={() => va.run(async () => { await api.rpc("remove_voucher", { p_order: order.id }); setVo(null); setRows([]); })}>Lepas {vo.voucher_code}</button>
              ) : (
                <>
                  <input id="pay-voucher" value={vcode} onChange={(e) => setVcode(e.target.value.toUpperCase())} placeholder="mis. HEMAT10" autoComplete="off" />
                  <button type="button" className="d-btn d-btn--ghost d-btn--sm" disabled={va.busy || vcode.trim().length < 3} onClick={() => va.run(async () => { const r = await api.rpc("apply_voucher", { p_order: order.id, p_code: vcode.trim() }); setVo(r); setDisc(""); setRows([]); }, "Voucher diterapkan")}>Terapkan</button>
                </>
              )}
            </div>
            <Feedback a={va} />
          </Field>
          <Field label={`Diskon manual (Rp) · batas tanpa PIN ${maxPct}%`}>
            <input type="number" inputMode="numeric" min="0" max={order.subtotal} value={viaVoucher ? "" : disc} disabled={viaVoucher} onChange={(e) => { setDisc(e.target.value); setRows([]); }} placeholder="0" />
          </Field>
          {needPin && (
            <Field label={`PIN GM/Owner · diskon ${discPct}% melebihi batas ${maxPct}%`}>
              <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN otorisasi" />
            </Field>
          )}
          {qrisOn && rows.length === 0 && <QrisPanel order={order} onPaid={onQrisPaid} disabled={needPin || (!viaVoucher && discAmt > 0)} />}
          <div className="pos-methods" role="group" aria-label="Tambah metode bayar">
            {METHODS.map(([m, l]) => <button key={m} type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={() => add(m)}>+ {l}</button>)}
            <span className="pos-split">
              <input type="number" min="2" max="20" value={split} onChange={(e) => setSplit(e.target.value)} aria-label="Jumlah orang" />
              <button type="button" className="d-btn d-btn--ghost d-btn--sm" onClick={equalSplit}>Bagi rata</button>
            </span>
          </div>
          {rows.length === 0 && <p className="d-text d-muted">Pilih metode pembayaran. Satu tagihan bisa memakai beberapa metode.</p>}
          <ul className="pos-pays">
            {rows.map((r, i) => (
              <li key={i} className="pos-pay">
                <div className="pos-pay__row">
                  <select value={r.method} onChange={(e) => set(i, { method: e.target.value, vaBank: e.target.value === "va" ? "bri_va" : undefined, vaData: null, confirmed: e.target.value === "cash" })} aria-label="Metode">
                    {METHODS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                  </select>
                  <input inputMode="numeric" value={r.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/\D/g, "") })} aria-label="Nominal" />
                  <button type="button" className="d-icon-btn" aria-label="Hapus baris" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                {r.method === "cash" && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <p className="d-text d-muted" style={{ margin: 0, fontSize: "0.75rem" }}>
                      Kalkulator kembalian &amp; pecahan cepat aktif di panel kasir POS. Pembayaran tunai tercatat otomatis ke S-Wallet Kasir (Cash Drawer).
                    </p>
                  </div>
                )}
                {r.method === "va" && (
                  <div className="pos-va" style={{ background: "var(--color-paper-2)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-ink-2)" }}>Pilih Bank:</label>
                      <select
                        value={r.vaBank || "bri_va"}
                        onChange={(e) => {
                          const bank = e.target.value;
                          set(i, { vaBank: bank, vaData: null, confirmed: false, reference: "" });
                        }}
                        style={{ padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-rule-2)", fontSize: "0.85rem", background: "var(--color-paper)" }}
                      >
                        {PAKASIR_VA_BANKS.map((b) => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="d-btn d-btn--sm d-btn--ghost"
                        disabled={vaGenerating}
                        onClick={async () => {
                          try {
                            setVaGenerating(true);
                            const bankId = r.vaBank || "bri_va";
                            const bankObj = PAKASIR_VA_BANKS.find((x) => x.id === bankId);
                            const txn = await createPakasirTransaction({
                              orderId: `${order.code}-${Date.now().toString().slice(-4)}`,
                              method: bankId,
                              amount: Number(r.amount) || remaining || total,
                            });
                            set(i, { vaData: txn });
                            broadcastCustomerDisplay({
                              type: "PAYMENT_START",
                              method: "va",
                              va_number: txn.va_number,
                              bank_name: bankObj?.name || "Bank Virtual Account",
                              amount: txn.total_payment || txn.amount || total,
                            });
                          } catch (err) {
                            alert(err.message || "Gagal membuat VA Pakasir");
                          } finally {
                            setVaGenerating(false);
                          }
                        }}
                      >
                        {vaGenerating ? "Membuat VA…" : "Generate Nomor VA"}
                      </button>
                    </div>

                    {r.vaData?.va_number ? (
                      <div style={{ background: "var(--color-paper)", padding: "0.85rem", borderRadius: "var(--radius-sm)", border: "1px dashed var(--color-rule-2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: "var(--color-accent)" }}>
                            Virtual Account {PAKASIR_VA_BANKS.find((x) => x.id === (r.vaBank || "bri_va"))?.name}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--color-ink-2)" }}>Berlaku 24 Jam</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", background: "var(--color-paper-2)", padding: "0.5rem 0.75rem", borderRadius: "6px" }}>
                          <span className="d-mono" style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "0.06em" }}>
                            {r.vaData.va_number}
                          </span>
                          <button
                            type="button"
                            className="d-btn d-btn--ghost d-btn--sm"
                            onClick={() => {
                              navigator.clipboard?.writeText(r.vaData.va_number);
                              setCopiedVa(r.vaData.va_number);
                              setTimeout(() => setCopiedVa(null), 2000);
                            }}
                          >
                            {copiedVa === r.vaData.va_number ? "Tersalin!" : "Salin"}
                          </button>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
                          <span style={{ fontSize: "0.85rem", color: "var(--color-ink-2)" }}>
                            Total Transfer: <strong>{rupiah(r.vaData.total_payment || r.vaData.amount)}</strong>
                          </span>
                          {r.confirmed ? (
                            <Badge tone="ok">Dana Masuk</Badge>
                          ) : (
                            <button
                              type="button"
                              className="d-btn d-btn--primary d-btn--sm"
                              onClick={() => {
                                set(i, { confirmed: true, reference: r.vaData.va_number });
                              }}
                            >
                              Tandai Dana Masuk
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="d-text d-muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                        Pilih salah satu dari 9 Bank Nasional lalu klik <strong>Generate Nomor VA</strong>. Nomor rekening bayar otomatis akan muncul dan diteruskan ke Layar Pelanggan.
                      </p>
                    )}
                  </div>
                )}
                {r.method === "card" && (
                  <input className="pos-ref" placeholder="Kode approval EDC · 4 digit akhir kartu" value={r.reference} maxLength={30}
                    onChange={(e) => set(i, { reference: e.target.value, confirmed: e.target.value.trim().length >= 6 })} />
                )}
                {r.method === "qris" && (
                  <div className="pos-qris" style={{ background: "var(--color-paper-2)", padding: "1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)", marginTop: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <FakeQr seed={`${order.code}-${i}-${r.amount}`} />
                      <div className="d-form" style={{ flex: 1 }}>
                        <p className="d-text" style={{ fontSize: "0.8rem", margin: "0 0 0.5rem" }}>
                          QRIS Dinamis Pakasir. Pelanggan memindai QR code, dana terverifikasi real-time via webhook.
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          {r.confirmed ? (
                            <Badge tone="ok">Dana Masuk</Badge>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="d-btn d-btn--ghost d-btn--sm"
                                onClick={() => {
                                  const qrisAmt = Number(r.amount) || remaining || total;
                                  broadcastCustomerDisplay({
                                    type: "PAYMENT_START",
                                    method: "qris",
                                    qr_string: `https://qris.id/pay/${order.code || "TIJARAH"}?amt=${qrisAmt}`,
                                    amount: qrisAmt,
                                  });
                                }}
                              >
                                Kirim ke Layar Pelanggan
                              </button>
                              <button
                                type="button"
                                className="d-btn d-btn--primary d-btn--sm"
                                onClick={() => {
                                  set(i, { confirmed: true, reference: `QRIS-PAID-${Date.now().toString().slice(-6)}` });
                                }}
                              >
                                Tandai Dana Masuk
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {r.method === "swallet" && (
                  <div className="pos-swallet" style={{ background: "var(--color-paper-2)", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-rule)" }}>
                    <div className="d-form">
                      <p className="d-text d-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.8rem" }}>
                        Pelanggan membuka S-Wallet dan menyebutkan <strong>6-Digit Kode Bayar Dinamis</strong> (berlaku 60 detik).
                      </p>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <input
                          className="pos-ref font-mono"
                          placeholder="6 Digit Kode"
                          maxLength={6}
                          value={r.reference}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "");
                            set(i, { reference: val, confirmed: val.length === 6 });
                          }}
                          style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.15em", maxWidth: "160px" }}
                        />
                        {r.confirmed ? (
                          <Badge tone="accent">Kode Terverifikasi</Badge>
                        ) : (
                          <button
                            type="button"
                            className="d-btn d-btn--primary d-btn--sm"
                            disabled={!r.reference || r.reference.length < 6}
                            onClick={() => set(i, { confirmed: true })}
                          >
                            Verifikasi &amp; Debet
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <dl className="pos-sum">
            <div><dt>Dibayar</dt><dd>{rupiah(paid)}</dd></div>
            <div className={remaining > 0 ? "is-warn" : ""}><dt>{remaining > 0 ? "Kurang" : "Kembalian"}</dt><dd>{rupiah(remaining > 0 ? remaining : change)}</dd></div>
          </dl>
          {change > cash && <p className="d-field__error">Kembalian hanya bisa dari pembayaran tunai.</p>}
          <Field label="Kartu Member (tempel/pindai kode, opsional)" id="pay-card">
            <input id="pay-card" autoComplete="off" placeholder="HIN1…" value={cardTok} onChange={(e) => setCardTok(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cardTok.trim()) { e.preventDefault(); scanCard(); } }} />
          </Field>
          <button type="button" className="d-btn" disabled={!cardTok.trim() || scan.busy} onClick={scanCard}>Cek kartu</button>
          {cardInfo && <p className="d-text">Member: <strong>{cardInfo.name}</strong> · {cardInfo.points} poin</p>}
          <Feedback a={scan} />
          <Field label="WhatsApp pelanggan (poin & struk digital, opsional)" id="pay-wa">
            <input id="pay-wa" inputMode="tel" placeholder="08…" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} />
          </Field>
          <Feedback a={a} />
        </div>
      )}
    </Modal>
  );
}
