const CACHE_NAME = "bloomy-v3";

const urlsToCache = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png"
];

// Install Service Worker & cache files
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error("Cache gagal dimuat:", err))
  );
});

// Activate and clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log("Menghapus cache lama:", key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: cache-first for local, network-first for external
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET and chrome-extension requests
  if (url.protocol.startsWith("chrome-extension")) return;
  if (request.method !== "GET") return;

  // Local (static) files — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) return response;
        return fetch(request)
          .then(networkResponse => {
            // Cache new resources dynamically
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            return networkResponse;
          })
          .catch(() => caches.match("./offline.html"));
      })
    );
  }
  // External resources (API, CDN, fonts)
  else {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
  }
});

// Handle periodic sync for background updates
self.addEventListener("periodicsync", event => {
  if (event.tag === "bloomy-update") {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => cache.add("./index.html"))
    );
  }
});

// Push notification support
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "BLOOMY";
  const options = {
    body: data.body || "Ada petal wisdom baru untukmu! 🌸",
    icon: "./icons/icon-192x192.png",
    badge: "./icons/icon-96x96.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "./index.html" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data.url || "./index.html";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
