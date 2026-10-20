// Modul Klien Resmi Pakasir Payment Gateway (API v2) untuk Tijarah OS
// Mendukung pembuatan transaksi QRIS/VA, kalkulasi biaya dinamis/kustom, status transaksi, pembatalan, dan simulasi demo.

const STORAGE_KEY_CONFIG = "tijarah:pakasir_config";
const STORAGE_KEY_FEES = "tijarah:provider_fee_config";
const STORAGE_KEY_ACCUMULATION = "tijarah:provider_fee_accumulation";
const STORAGE_KEY_TRANSACTIONS = "tijarah:pakasir_transactions";

export const PAYMENT_CHANNELS = [
  { id: "qris", name: "QRIS Dinamis", type: "qris", icon: "/iconpay/qris-icon.png", defaultFee: 1.0, feeType: "percent", feeUnit: "%" },
  { id: "payment_link", name: "Payment Link", type: "link", icon: "/iconpay/paymentlink-icon.svg", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "bri_va", name: "VA BRI", type: "va", icon: "/iconpay/bankbri-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "bni_va", name: "VA BNI", type: "va", icon: "/iconpay/bankbni-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "cimb_niaga_va", name: "VA CIMB Niaga", type: "va", icon: "/iconpay/bankcimbniaga-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "maybank_va", name: "VA Maybank", type: "va", icon: "/iconpay/maybank-icon.svg", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "danamon_va", name: "VA Danamon", type: "va", icon: "/iconpay/bankdanamon-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "bnc_va", name: "VA Bank Neo Commerce", type: "va", icon: "/iconpay/neobank-icon.webp", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "bsi_va", name: "VA BSI", type: "va", icon: "/iconpay/bankbsi-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "muamalat_va", name: "VA Muamalat", type: "va", icon: "/iconpay/bankmuamalat-icon.png", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
  { id: "ocbc_va", name: "VA OCBC", type: "va", icon: "/iconpay/ocbcbank-icon.webp", defaultFee: 3500, feeType: "fixed", feeUnit: "Rp" },
];

function emitFeesUpdated(payload) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tijarah:fees_updated", { detail: payload }));
  }
}

export function getPakasirConfig() {
  const envSlug = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_SLUG) || "harumin";
  const envApiKey = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_API_KEY) || "";
  const envWebhookSecret = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_WEBHOOK_SECRET) || "";
  const envApiBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_API_BASE) || "https://app.pakasir.com/api/v2";
  const envWebhookUrl = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_WEBHOOK_URL) || "https://www.harumin.my.id/api/webhook/pakasir";
  const envSandbox = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PAKASIR_SANDBOX === "true") || false;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        slug: parsed.slug || envSlug,
        apiKey: parsed.apiKey || envApiKey,
        webhookSecret: parsed.webhookSecret || envWebhookSecret,
        apiBase: parsed.apiBase || envApiBase,
        webhookUrl: parsed.webhookUrl || envWebhookUrl,
        isSandbox: parsed.isSandbox != null ? parsed.isSandbox : envSandbox,
        useDynamicFee: parsed.useDynamicFee != null ? parsed.useDynamicFee : true,
        feePayer: parsed.feePayer || "customer",
      };
    }
  } catch {}

  return {
    slug: envSlug,
    apiKey: envApiKey,
    webhookSecret: envWebhookSecret,
    apiBase: envApiBase,
    webhookUrl: envWebhookUrl,
    isSandbox: envSandbox,
    useDynamicFee: true, // true = API /payment-fee, false = custom fee
    feePayer: "customer", // "customer" (dibebankan ke pelanggan), "merchant" (ditanggung platform), "split" (bagi 50:50)
  };
}

export function savePakasirConfig(cfg) {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
  } catch (e) {
    console.warn("Gagal menyimpan konfigurasi payment gateway:", e);
  }
  emitFeesUpdated(cfg);
}

export function getDefaultProviderFeeSettings() {
  const initial = {};
  PAYMENT_CHANNELS.forEach((c) => {
    initial[c.id] = { fee: c.defaultFee, feeType: c.feeType };
  });
  return initial;
}

export function getProviderFeeSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FEES);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrasi otomatis jika masih tersimpan nilai 0.7 dari versi awal dan belum dicustom secara eksplisit
      if (parsed.qris && parsed.qris.fee === 0.7 && !parsed.qris.isExplicitCustom) {
        parsed.qris.fee = 1.0;
        try {
          localStorage.setItem(STORAGE_KEY_FEES, JSON.stringify(parsed));
        } catch {}
      }
      return parsed;
    }
  } catch {}
  return getDefaultProviderFeeSettings();
}

export function saveProviderFeeSettings(fees) {
  try {
    localStorage.setItem(STORAGE_KEY_FEES, JSON.stringify(fees));
  } catch (e) {
    console.warn("Gagal menyimpan tarif provider:", e);
  }
  emitFeesUpdated(fees);
}

export function resetProviderFeesToDefault() {
  const def = getDefaultProviderFeeSettings();
  try {
    localStorage.setItem(STORAGE_KEY_FEES, JSON.stringify(def));
  } catch {}
  emitFeesUpdated(def);
  return def;
}

// Mengambil kalkulasi biaya untuk setiap channel berdasarkan nominal tagihan
export async function calculateChannelFees(amount) {
  const cfg = getPakasirConfig();
  const customFees = getProviderFeeSettings();
  let apiFees = null;

  // Coba ambil dari proxy atau API jika useDynamicFee aktif
  if (cfg.useDynamicFee && amount > 0) {
    try {
      const isBrowser = typeof window !== "undefined";
      const isDev = isBrowser && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      const proxyUrl = isDev
        ? `/api/pakasir-proxy/api/v2/payment-fee/${amount}`
        : isBrowser
        ? `/api/pakasir/fee?amount=${amount}`
        : `${cfg.apiBase || "https://app.pakasir.com/api/v2"}/payment-fee/${amount}`;

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

      const res = await fetch(proxyUrl, {
        headers: { Accept: "application/json" },
        signal: controller?.signal
      }).catch(() => null);

      if (timeoutId) clearTimeout(timeoutId);

      if (res && res.ok) {
        apiFees = await res.json().catch(() => null);
      }
    } catch {
      // Fallback mulus ke kalkulasi deterministik resmi Pakasir tanpa spam ke console
    }
  }

  const result = {};
  PAYMENT_CHANNELS.forEach((ch) => {
    if (cfg.useDynamicFee && apiFees && apiFees[ch.id] != null) {
      result[ch.id] = Math.round(Number(apiFees[ch.id]));
    } else {
      const c = customFees[ch.id] || { fee: ch.defaultFee, feeType: ch.feeType };
      if (c.feeType === "percent") {
        // Formula resmi Pakasir untuk QRIS: jika amount <= 105.000 -> 0.7% + 310, jika > 105.000 -> 1% (atau custom %)
        if (ch.id === "qris" && (Number(c.fee) === 1.0 || Number(c.fee) === 0.7) && amount <= 105000) {
          result[ch.id] = Math.round(amount * 0.007 + 310);
        } else {
          result[ch.id] = Math.round((amount * Number(c.fee)) / 100);
        }
      } else {
        result[ch.id] = Math.round(Number(c.fee)) || Math.round(Number(ch.defaultFee));
      }
    }
  });

  return result;
}

// Buat Transaksi Baru via Pakasir API v2
export async function createPakasirTransaction({ orderId, method, amount, customerInfo = {} }) {
  const cfg = getPakasirConfig();
  const endpoint = `${cfg.apiBase || "https://app.pakasir.com/api/v2"}/create-transaction/${cfg.slug}/${orderId}`;

  // Mode API Live
  try {
    if (cfg.apiKey && cfg.apiKey.trim().length > 10) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": cfg.apiKey
        },
        body: JSON.stringify({
          method: method.replace("_va", "_va").toLowerCase(),
          amount: Number(amount)
        })
      });

      if (res.ok) {
        const data = await res.json();
        const record = {
          order_id: orderId,
          txn_id: data.txn_id,
          method,
          payment_method: method,
          amount: Number(amount),
          fee: Number(data.fee) || 0,
          total_payment: Number(data.total_payment) || (Number(amount) + Number(data.fee || 0)),
          qr_string: data.qr_string || "",
          va_number: data.va_number || "",
          payment_url:
            data.payment_url ||
            (method === "payment_link" ? `https://app.pakasir.com/pay/${cfg.slug}/${orderId}` : ""),
          expired_at:
            data.expired_at || data.expires_at || new Date(Date.now() + 24 * 3600e3).toISOString(),
          status: data.status || "pending",
          is_sandbox: Boolean(data.is_sandbox),
          created_at: new Date().toISOString(),
          customerInfo
        };
        recordTransaction(record);
        return { ...data, ...record };
      } else {
        const errJson = await res.json().catch(() => null);
        if (errJson?.message === "Method not available") {
          if (cfg.isSandbox) {
            console.warn(
              `[Gateway Sandbox] Kanal ${method} belum diaktifkan di dashboard merchant, beralih ke simulasi sandbox.`
            );
          } else {
            const chName = PAYMENT_CHANNELS.find((c) => c.id === method)?.name || method;
            throw new Error(
              `Kanal ${chName} saat ini belum diaktifkan. Silakan pilih QRIS Dinamis, BRI VA, BNI VA, BNC VA, Maybank VA, atau Virtual Account lainnya.`
            );
          }
        } else if (errJson?.message) {
          throw new Error(errJson.message);
        }
      }
    }
  } catch (err) {
    if (!cfg.isSandbox && err.message && !err.message.includes("Failed to fetch")) {
      throw err;
    }
    console.warn("[Payment Gateway] Panggilan API live dialihkan ke simulator:", err.message);
  }

  // Simulator Fallback jika API Key offline atau mode dev
  const channel = PAYMENT_CHANNELS.find((x) => x.id === method) || PAYMENT_CHANNELS[0];
  const customFees = getProviderFeeSettings();
  const c = customFees[method] || { fee: channel.defaultFee, feeType: channel.feeType };
  const calculatedFee =
    c.feeType === "percent"
      ? method === "qris" && (Number(c.fee) === 1.0 || Number(c.fee) === 0.7) && Number(amount) <= 105000
        ? Math.round(Number(amount) * 0.007 + 310)
        : Math.round((Number(amount) * Number(c.fee)) / 100)
      : Math.round(Number(c.fee)) || 3500;

  const mockTxnId = "txn_" + Math.random().toString(36).slice(2, 11);
  const mockVa =
    method === "qris" || method === "payment_link"
      ? ""
      : "8809" + Math.floor(1000000000 + Math.random() * 9000000000);
  const mockQr =
    method === "qris"
      ? "00020101021226610016ID.CO.TIJARAH.WWW01189360091800216005230208216005230303UME51440014ID.CO.QRIS.WWW0215ID10243228429300303UME5204792953033605409100003.005802ID5907Tijarah6012KOTA MAKASSAR61055439262230519SP25RZRATEQI2HQ65Q46304A079"
      : "";
  const paymentUrl =
    method === "payment_link" ? `https://app.pakasir.com/pay/${cfg.slug || "harumin"}/${orderId}` : "";

  const mockData = {
    txn_id: mockTxnId,
    project: cfg.slug,
    order_id: orderId,
    amount: Number(amount),
    fee: calculatedFee,
    total_payment: Number(amount) + calculatedFee,
    payment_method: method,
    payment_url: paymentUrl,
    qr_string: mockQr,
    va_number: mockVa,
    expired_at: new Date(Date.now() + (method === "qris" ? 15 * 60e3 : 24 * 3600e3)).toISOString(),
    is_sandbox: cfg.isSandbox,
  };

  recordTransaction({
    ...mockData,
    status: "pending",
    created_at: new Date().toISOString(),
    customerInfo
  });

  return mockData;
}

// Cek Status Transaksi via Pakasir API v2
export async function checkPakasirStatus(txnId, orderId) {
  const cfg = getPakasirConfig();
  if (cfg.apiKey && cfg.apiKey.trim().length > 10) {
    try {
      const res = await fetch(`${cfg.apiBase || "https://app.pakasir.com/api/v2"}/transaction-status/${cfg.slug}/${txnId}`, {
        headers: { "X-Api-Key": cfg.apiKey }
      });
      if (res.ok) {
        const data = await res.json();
        updateTransactionStatus(orderId, data.status, data.completed_at);
        return data;
      }
    } catch (e) {
      console.warn("[Payment Gateway] Gagal cek status API:", e);
    }
  }

  const txns = listLocalTransactions();
  const found = txns.find((t) => t.order_id === orderId || t.txn_id === txnId);
  return found ? { status: found.status, order_id: found.order_id, txn_id: found.txn_id } : { status: "pending" };
}

// Batalkan Transaksi
export async function cancelPakasirTransaction(txnId, orderId) {
  const cfg = getPakasirConfig();
  if (cfg.apiKey && cfg.apiKey.trim().length > 10) {
    try {
      await fetch(`${cfg.apiBase || "https://app.pakasir.com/api/v2"}/cancel-transaction/${cfg.slug}/${txnId}`, {
        method: "POST",
        headers: { "X-Api-Key": cfg.apiKey }
      });
    } catch (e) {}
  }
  updateTransactionStatus(orderId, "canceled");
  return { ok: true, message: "Transaksi berhasil dibatalkan" };
}

// Database Transaksi Lokal untuk Frontend & Superadmin CRUD
export function listLocalTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Default data transaksi awal (Kopi Harum Makassar Growth 6 bln)
  return [
    {
      order_id: "ORD-SUB-2610-001",
      txn_id: "pakasir_txn_91024",
      method: "bri_va",
      payment_method: "bri_va",
      amount: 2500000,
      fee: 3500,
      total_payment: 2503500,
      va_number: "8801202610129901",
      expired_at: "2026-10-13T12:00:00Z",
      status: "completed",
      created_at: "2026-10-12T10:00:00Z",
      completed_at: "2026-10-12T10:05:00Z",
      customerInfo: {
        tenantName: "Kopi Harum Makassar",
        tenantId: "t1",
        planCode: "growth"
      }
    }
  ];
}

export function recordTransaction(txn) {
  const list = listLocalTransactions();
  const idx = list.findIndex((t) => t.order_id === txn.order_id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...txn };
  } else {
    list.unshift(txn);
  }
  try {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(list.slice(0, 200)));
  } catch {}
  emitFeesUpdated(list);
}

export function updateTransactionStatus(orderId, status, completedAt = null) {
  const list = listLocalTransactions();
  const idx = list.findIndex((t) => t.order_id === orderId);
  if (idx >= 0) {
    const oldStatus = list[idx].status;
    list[idx].status = status;
    if (completedAt) list[idx].completed_at = completedAt;
    try {
      localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(list));
    } catch {}

    // Jika berubah jadi completed, hitung ulang akumulasi secara dinamis
    if (status === "completed" && oldStatus !== "completed") {
      recalculateFeeAccumulation();
    } else {
      emitFeesUpdated(list);
    }
  }
}

// Rekapitulasi & Akumulasi Biaya Per Provider (QRIS, VA Mandiri, VA BRI, dsb)
export function recalculateFeeAccumulation() {
  const txns = listLocalTransactions();
  const acc = {};
  PAYMENT_CHANNELS.forEach((ch) => {
    acc[ch.id] = { count: 0, grossAmount: 0, totalFee: 0 };
  });

  // Akumulasi dari seluruh transaksi berstatus completed atau paid
  txns.forEach((t) => {
    if (t.status === "completed" || t.status === "paid") {
      const method = t.payment_method || t.method || "qris";
      if (!acc[method]) acc[method] = { count: 0, grossAmount: 0, totalFee: 0 };
      acc[method].count += 1;
      acc[method].grossAmount += Number(t.amount) || 0;
      acc[method].totalFee += Number(t.fee) || 0;
    }
  });

  // Jika belum ada satupun transaksi selesai, berikan inisialisasi default dari invoice tenant aktif
  const hasCompleted = Object.values(acc).some((x) => x.count > 0);
  if (!hasCompleted) {
    acc["bri_va"] = { count: 1, grossAmount: 2500000, totalFee: 3500 };
  }

  try {
    localStorage.setItem(STORAGE_KEY_ACCUMULATION, JSON.stringify(acc));
  } catch {}
  emitFeesUpdated(acc);
  return acc;
}

export function getProviderFeeAccumulation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACCUMULATION);
    if (raw) return JSON.parse(raw);
  } catch {}
  return recalculateFeeAccumulation();
}

export function accumulateProviderFee(txn) {
  const acc = getProviderFeeAccumulation();
  const method = txn.payment_method || txn.method || "qris";
  if (!acc[method]) {
    acc[method] = { count: 0, grossAmount: 0, totalFee: 0 };
  }
  acc[method].count += 1;
  acc[method].grossAmount += Number(txn.amount) || 0;
  acc[method].totalFee += Number(txn.fee) || 0;
  try {
    localStorage.setItem(STORAGE_KEY_ACCUMULATION, JSON.stringify(acc));
  } catch {}
  emitFeesUpdated(acc);
}
