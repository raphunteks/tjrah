// Antrean penjualan offline untuk kasir (Fase 4.5). Penyimpanan: localStorage (cukup untuk ratusan transaksi; ganti ke IndexedDB bila perlu).
// Alur: enqueue() saat offline/gagal kirim → flush() saat online → server memakai client_ref sehingga kirim ulang aman (tidak dobel).
// Server tetap memakai HARGA TERKINI; selisih dengan expected_total dikembalikan di total_diff untuk ditinjau GM.
const KEY = "tijarah-offline-queue";
const DEV = "tijarah-device-id";

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("harumin-offline-queue") || "[]"); } catch { return []; } };
const write = (q) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* penyimpanan penuh/diblokir */ } };

export function deviceId() {
  try {
    let id = localStorage.getItem(DEV) || localStorage.getItem("harumin-device-id");
    if (!id) { id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 36); localStorage.setItem(DEV, id); }
    return id;
  } catch { return "tanpa-penyimpanan"; }
}

/** order: { branch_id, items:[{product_id,qty,note?}], payments:[{method,amount}], expected_total?, customer_phone?, discount?, pin? } */
export function enqueue(order) {
  const q = read();
  const client_ref = `${deviceId().slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  q.push({ ...order, client_ref, created_at: new Date().toISOString() });
  write(q);
  return client_ref;
}

export const pending = () => read().length;

/** Kirim antrean (maks 50 per panggilan). Yang 'ok'/'duplicate' dihapus; 'error' tetap tersimpan agar bisa ditinjau. Mengembalikan ringkasan. */
export async function flush(api) {
  const q = read();
  if (q.length === 0) return { sent: 0, failed: [] };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { sent: 0, failed: [], offline: true };
  const batch = q.slice(0, 50);
  const res = await api.rpc("sync_offline_orders", { p_device: deviceId(), p_batch: batch });
  const done = new Set(res.filter((r) => r.status === "ok" || r.status === "duplicate").map((r) => r.client_ref));
  write(read().filter((o) => !done.has(o.client_ref)));
  return {
    sent: done.size,
    failed: res.filter((r) => r.status === "error"),
    review: res.filter((r) => r.status === "ok" && (r.total_diff || r.time_suspect)),
  };
}

/** Pasang pemicu otomatis: kirim saat kembali online dan tiap `everyMs`. Mengembalikan fungsi pembersih. */
export function autoSync(api, onResult, everyMs = 30000) {
  const run = () => flush(api).then(onResult).catch(() => {});
  window.addEventListener("online", run);
  const t = setInterval(run, everyMs);
  return () => { window.removeEventListener("online", run); clearInterval(t); };
}
