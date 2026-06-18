// ── Pathanamthitta GSI Landslide Map – Service Worker v3 ──
const CACHE_NAME = "landslide-map-v3";

// App shell: all files needed to render the UI offline
const APP_SHELL = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

// External CDN resources we want to pre-warm (optional – cached on first use too)
const CDN_PRECACHE = [
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Turf.js/6.5.0/turf.min.js"
];

// ── Install: cache app shell immediately ──
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // App shell must succeed; CDN is best-effort
      return cache.addAll(APP_SHELL).then(() => {
        return Promise.allSettled(
          CDN_PRECACHE.map(url => cache.add(url).catch(() => {}))
        );
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ──
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-first for everything else ──
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Tile servers: network-first, short cache; skip opaque responses for storage
  if (url.hostname.includes("tile") || url.hostname.includes("openstreetmap")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => {
              try { c.put(req, clone); } catch (e) {}
            });
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App-shell (same origin): cache-first → network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => {
          // Return cached index for navigation requests (offline fallback)
          if (req.mode === "navigate") return caches.match("./index.html");
        });
      })
    );
    return;
  }

  // CDN and other external: network-first, cache on success
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => {
            try { c.put(req, clone); } catch (e) {}
          });
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// ── Message: clients can trigger skipWaiting for instant updates ──
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
