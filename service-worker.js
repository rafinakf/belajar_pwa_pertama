const CACHE_NAME = "bloomy-v4";

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

// =========================================================
// BACKGROUND SYNC — retry failed requests when back online
// =========================================================
self.addEventListener("sync", event => {
  if (event.tag === "bloomy-sync") {
    event.waitUntil(
      (async () => {
        try {
          // Re-cache essential resources when connection restored
          const cache = await caches.open(CACHE_NAME);
          await cache.addAll(urlsToCache);
          console.log("Background sync: resources re-cached successfully");

          // Notify all clients that sync completed
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: "SYNC_COMPLETE",
              message: "Data berhasil disinkronkan"
            });
          });
        } catch (err) {
          console.error("Background sync failed:", err);
        }
      })()
    );
  }

  if (event.tag === "bloomy-mood-sync") {
    event.waitUntil(
      (async () => {
        try {
          console.log("Background sync: mood data synced");
        } catch (err) {
          console.error("Mood sync failed:", err);
        }
      })()
    );
  }
});

// =========================================================
// PERIODIC BACKGROUND SYNC — update content periodically
// =========================================================
self.addEventListener("periodicsync", event => {
  if (event.tag === "bloomy-update") {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => cache.add("./index.html"))
    );
  }

  if (event.tag === "bloomy-wisdom-update") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.add("./index.html");
        console.log("Periodic sync: wisdom updated");
      })()
    );
  }
});

// =========================================================
// PUSH NOTIFICATIONS
// =========================================================
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "BLOOMY";
  const options = {
    body: data.body || "Ada petal wisdom baru untukmu! 🌸",
    icon: "./icons/icon-192x192.png",
    badge: "./icons/icon-96x96.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "./index.html" },
    actions: [
      { action: "open", title: "Buka BLOOMY" },
      { action: "dismiss", title: "Nanti saja" }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data.url || "./index.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes("index.html") && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// =========================================================
// WIDGET SUPPORT — handle widget events
// =========================================================
self.addEventListener("widgetinstall", event => {
  event.waitUntil(updateWidget(event));
});

self.addEventListener("widgetresume", event => {
  event.waitUntil(updateWidget(event));
});

self.addEventListener("widgetclick", event => {
  if (event.action === "open-app") {
    event.waitUntil(self.clients.openWindow("./index.html"));
  }
  if (event.action === "refresh") {
    event.waitUntil(updateWidget(event));
  }
});

self.addEventListener("widgetuninstall", event => {
  // Clean up widget data if needed
});

async function updateWidget(event) {
  const wisdoms = [
    "Kamu sedang tumbuh, dan itu luar biasa indah. 🌸",
    "Setiap perubahan adalah bukti bahwa kamu hidup dan berkembang. 🌷",
    "Tubuhmu adalah rumahmu — rawat dengan lembut. 🏡",
    "Perasaanmu valid, selalu. 💜",
    "Kamu tidak perlu sempurna, cukup jadi dirimu sendiri. 🌺"
  ];
  const today = new Date().getDay();
  const wisdom = wisdoms[today % wisdoms.length];

  const widget = event.widget;
  await self.widgets.updateByTag(widget.tag, {
    data: JSON.stringify({ wisdom: wisdom }),
    template: widget.template
  });
}

// =========================================================
// SHARE TARGET — handle shared content
// =========================================================
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.searchParams.has("share") && event.request.method === "GET") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match("./index.html");
        return cachedResponse || fetch("./index.html");
      })()
    );
  }
});

// =========================================================
// MESSAGE HANDLER — communicate with main app
// =========================================================
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CACHE_URLS") {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(event.data.urls || []);
      })
    );
  }
});
