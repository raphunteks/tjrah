import React from "react";
import { createRoot } from "react-dom/client";
import "../tokens.css";
import "./styles/base.css";
import "./lib/theme.js";
import { RouterProvider } from "./lib/router.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </RouterProvider>
  </React.StrictMode>
);

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRASI PROGRESSIVE WEB APP (PWA) SERVICE WORKER
// ─────────────────────────────────────────────────────────────────────────────
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Cek pembaruan service worker di latar belakang
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.info("[Tijarah PWA] Versi baru aplikasi siap digunakan.");
              }
            };
          }
        };
      })
      .catch((err) => {
        console.warn("[Tijarah PWA] Registrasi Service Worker tertunda:", err);
      });
  });
}

