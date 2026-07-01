const CACHE_NAME = "gold-valuation-tracker-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=3.0.0",
  "./app.js?v=3.0.0",
  "./manifest.webmanifest?v=3.0.0",
  "./icons/icon-192.png?v=3.0.0",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png?v=3.0.0"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // Always try the network first for navigations so a newly published
  // blank build replaces an older cached/preloaded version promptly.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Network-first for versioned application files, cache fallback offline.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
