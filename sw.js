// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v66";
const FILES = ["./", "./index.html", "./app.js?v=66", "./training.js?v=66", "./plan.js?v=66", "./pomo.js?v=66", "./work.js?v=66", "./sync.js?v=66", "./debts.js?v=66", "./spheres.js?v=66", "./tasks.js?v=66", "./stats.js?v=66", "./discover.js?v=66", "./nicotine.js?v=66", "./main.js?v=66", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
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
