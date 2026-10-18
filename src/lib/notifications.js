// Tijarah OS · Progressive Web App (PWA) & Web Notification System
// Mendukung Chrome, Edge, Firefox, Safari macOS & iOS 16.4+ Standalone PWA

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

// Cek apakah aplikasi sedang berjalan dalam mode PWA Standalone (Terinstal di Desktop/HP)
export function isPWAStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

// Cek status lengkap PWA dan Service Worker
export async function getPWAEngineStatus() {
  if (typeof window === "undefined") {
    return { supported: false, standalone: false, swActive: false, permission: "unsupported" };
  }

  const supported = "serviceWorker" in navigator && "Notification" in window;
  const standalone = isPWAStandalone();
  const permission = "Notification" in window ? Notification.permission : "unsupported";

  let swActive = false;
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      swActive = Boolean(reg && reg.active);
    } catch {
      swActive = false;
    }
  }

  return { supported, standalone, swActive, permission };
}

// Meminta izin notifikasi peramban secara interaktif
export async function requestBrowserNotification(showWelcome = true) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  // Jika izin sudah diberikan sebelumnya
  if (Notification.permission === "granted") {
    if (showWelcome) {
      await sendBrowserNotification(
        "Tijarah POS & OS",
        "Notifikasi peramban aktif. Anda akan menerima peringatan operasional, kasir, dan keamanan secara real-time.",
        { tag: "tijarah-welcome" }
      );
    }
    return "granted";
  }

  // Jika belum diizinkan atau status default
  try {
    let perm = await Notification.requestPermission();
    if (perm === "granted" && showWelcome) {
      await sendBrowserNotification(
        "Tijarah POS & OS",
        "Izin notifikasi peramban berhasil diaktifkan. Anda akan menerima pembaruan sistem secara langsung.",
        { tag: "tijarah-welcome" }
      );
    }
    return perm;
  } catch (err) {
    // Fallback callback syntax untuk Safari versi lama
    return new Promise((resolve) => {
      try {
        Notification.requestPermission((perm) => {
          if (perm === "granted" && showWelcome) {
            sendBrowserNotification(
              "Tijarah POS & OS",
              "Izin notifikasi peramban berhasil diaktifkan.",
              { tag: "tijarah-welcome" }
            );
          }
          resolve(perm);
        });
      } catch {
        resolve("denied");
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCHER NOTIFIKASI UNIVERSAL (PWA SERVICE WORKER + WINDOW FALLBACK)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendBrowserNotification(title, body, options = {}) {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  if (Notification.permission !== "granted") return null;

  const targetUrl = options.url || window.location.pathname + window.location.search;

  const notifOptions = {
    body,
    icon: options.icon || "/icons/icon-192.png",
    badge: options.badge || "/icons/icon-192.png",
    tag: options.tag || "tijarah-alert",
    renotify: options.renotify ?? true,
    vibrate: options.vibrate || [150, 60, 150],
    data: {
      url: targetUrl,
      timestamp: Date.now(),
      ...(options.data || {})
    },
    actions: options.actions || [
      { action: "open", title: "Buka Sistem" },
      { action: "dismiss", title: "Tutup" }
    ],
    ...options
  };

  // 1. Prioritaskan pengiriman melalui Service Worker (Wajib untuk PWA Standalone di Android & iOS 16.4+)
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, notifOptions);
        return reg;
      }
    } catch (err) {
      // Jika service worker sedang sibuk atau belum siap, lanjutkan ke fallback desktop
      console.warn("[Tijarah Notif] Fallback ke window Notification:", err);
    }
  }

  // 2. Fallback peramban desktop reguler (non-standalone tab)
  try {
    const notif = new Notification(title, notifOptions);
    notif.onclick = function (e) {
      e.preventDefault();
      window.focus();
      if (targetUrl && window.location.pathname + window.location.search !== targetUrl) {
        window.location.href = targetUrl;
      }
      notif.close();
    };
    return notif;
  } catch (err) {
    console.warn("[Tijarah Notif] Pembuatan notifikasi dibatasi peramban:", err);
    return null;
  }
}
