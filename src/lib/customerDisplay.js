// Modul Sinkronisasi Realtime Layar Pelanggan (Customer Facing Display)
// Menggunakan BroadcastChannel API, LocalStorage event, dan Window CustomEvent
// Memastikan update instan 0ms antara Kasir POS dan Layar Pelanggan tanpa lag jaringan.

const CHANNEL_NAME = "tijarah_customer_display";
const STORAGE_KEY = "tijarah:customer_display_event";

/**
 * Kirim payload status terbaru ke layar pelanggan
 * @param {Object} payload 
 */
export function broadcastCustomerDisplay(payload) {
  const message = {
    ...payload,
    _timestamp: Date.now(),
  };

  // 1. BroadcastChannel (Modern multi-tab/window)
  try {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage(message);
      bc.close();
    }
  } catch {}

  // 2. LocalStorage Event (Cross-window fallback)
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
    }
  } catch {}

  // 3. Local CustomEvent (Same window)
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tijarah:customer_display", { detail: message }));
    }
  } catch {}
}

/**
 * Pasang pendengar event di CustomerDisplay
 * @param {(data: Object) => void} onMessage 
 * @returns {() => void} fungsi unsubscribe
 */
export function subscribeCustomerDisplay(onMessage) {
  if (typeof window === "undefined") return () => {};

  let bc = null;
  try {
    if ("BroadcastChannel" in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (event) => {
        if (event?.data) onMessage(event.data);
      };
    }
  } catch {}

  const handleCustomEvent = (event) => {
    if (event?.detail) onMessage(event.detail);
  };

  const handleStorageEvent = (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        onMessage(parsed);
      } catch {}
    }
  };

  window.addEventListener("tijarah:customer_display", handleCustomEvent);
  window.addEventListener("storage", handleStorageEvent);

  return () => {
    if (bc) {
      bc.close();
      bc = null;
    }
    window.removeEventListener("tijarah:customer_display", handleCustomEvent);
    window.removeEventListener("storage", handleStorageEvent);
  };
}
