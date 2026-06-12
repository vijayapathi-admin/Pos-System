const CACHE_NAME = "vp-traders-v3";
const ASSETS = [
  "/",
  "/index.html",
  "/src/main.jsx",
  "/src/App.jsx",
  "/src/styles.css",
  "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.log("Caching error during install:", err));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Ignore Firestore / Firebase network requests
  if (
    e.request.url.includes("firestore.googleapis.com") || 
    e.request.url.includes("firebase") || 
    e.request.url.includes("identitytoolkit") ||
    e.request.method !== "GET"
  ) {
    return;
  }
  
  const isNavigation = e.request.mode === "navigate" || 
                       e.request.url === self.location.origin || 
                       e.request.url.endsWith("/index.html") ||
                       e.request.url.endsWith("/");

  if (isNavigation) {
    // Network-First Strategy for document routing / index.html
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, cacheCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match("/index.html") || caches.match(e.request);
        })
    );
  } else {
    // Cache-First Strategy for assets (JS, CSS, fonts) due to Vite's hashed bundles
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && e.request.url.startsWith(self.location.origin) && !e.request.url.includes("sockjs-node")) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, cacheCopy);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
