// Tijarah OS · Progressive Web App (PWA) Service Worker
// Versi: 1.0.0
// Cakupan: App Shell, Static Cache, Push Notifications & Click Dispatcher

const CACHE_NAME = "tijarah-pwa-v1";

// Aset statis inti untuk App Shell
const CORE_ASSETS = [
  "/",
  "/app",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/tijarah-logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

// ─────────────────────────────────────────────────────────────────────────────
// SIKLUS HIDUP SERVICE WORKER
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usahakan caching aset inti; jangan gagalkan instalasi jika ada yang 404
      return Promise.allSettled(
        CORE_ASSETS.map((url) =>
          fetch(url, { cache: "no-cache" }).then((res) => {
            if (res.ok) return cache.put(url, res);
          })
        )
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Bersihkan versi cache lama
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
    ])
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGI CACHE FETCH PERAMBAN
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Hanya proses method GET
  if (req.method !== "GET") return;

  // Lewatkan komunikasi Supabase, API eksternal, dan Endpoint Backend Proxy (Selalu Network-Only)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/rest/v1/") ||
    url.pathname.startsWith("/auth/v1/") ||
    url.hostname.includes("supabase.co") ||
    url.protocol.startsWith("chrome-extension")
  ) {
    return;
  }

  // 1. Permintaan Navigasi HTML Halaman (Network First -> Fallback Cache)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          return caches.match("/") || caches.match("/app");
        })
    );
    return;
  }

  // 2. Aset Statis Lokal (Ikon, Font, Gambar, CSS, JS) -> Stale-While-Revalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js"))
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Permintaan lainnya: Langsung teruskan ke Network
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND PUSH LISTENER & NOTIFICATION DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let payload = {
    title: "Tijarah OS",
    body: "Pemberitahuan operasional sistem baru diterima.",
    url: "/app",
    tag: "tijarah-alert"
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag || "tijarah-alert",
    renotify: true,
    vibrate: [150, 60, 150],
    data: {
      url: payload.url || "/app",
      dateOfArrival: Date.now()
    },
    actions: [
      { action: "open", title: "Buka Sistem" },
      { action: "dismiss", title: "Tutup" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Tijarah OS", options)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERAKTIVITAS KLIK NOTIFIKASI (NOTIFICATION CLICK & FOCUS)
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Jika tombol aksi "dismiss" diklik, tidak perlu redirect
  if (event.action === "dismiss") {
    return;
  }

  const rawUrl = event.notification?.data?.url || "/app";
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 1. Cari jika sudah ada tab Tijarah yang terbuka di peramban
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            // Arahkan ke URL tujuan notifikasi dan bawa ke layar depan
            if (client.navigate && client.url !== targetUrl) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        // 2. Jika belum ada jendela aktif, buka jendela PWA baru
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// Pesan komunikasi dua arah dari thread UI
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
