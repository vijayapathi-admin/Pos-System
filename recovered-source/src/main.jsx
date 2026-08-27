import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  if (window.location.hostname === "localhost" || window.location.hostname.includes("127.0.0.1")) {
    // Automatically clean up service workers and cache storage in local development to prevent routing bypasses
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      let unregisteredAny = false;
      for (let registration of registrations) {
        registration.unregister();
        unregisteredAny = true;
      }
      if (unregisteredAny) {
        caches.keys().then((names) => {
          for (let name of names) {
            caches.delete(name);
          }
        }).then(() => {
          console.log("Cleared local dev PWA cache shell. Hot-reloading...");
          window.location.reload();
        });
      }
    });
  } else {
    // Safe production-only registration
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        console.log("ServiceWorker registration successful with scope: ", reg.scope);
      }).catch((err) => {
        console.log("ServiceWorker registration failed: ", err);
      });
    });

    // Auto-reload the page when a new service worker updates and takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        console.log("New Service Worker activated! Reloading for latest updates...");
        window.location.reload();
      }
    });
  }
}
