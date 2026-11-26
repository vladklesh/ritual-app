// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v70";
const FILES = ["./", "./index.html", "./app.js?v=70", "./training.js?v=70", "./plan.js?v=70", "./pomo.js?v=70", "./work.js?v=70", "./sync.js?v=70", "./debts.js?v=70", "./spheres.js?v=70", "./tasks.js?v=70", "./stats.js?v=70", "./discover.js?v=70", "./nicotine.js?v=70", "./main.js?v=70", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(e.request, {cache:"no-store"});
      if (response.ok) await cache.put(e.request, response.clone());
      return response;
    } catch (err) {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
