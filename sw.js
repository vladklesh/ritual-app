// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v34";
const FILES = ["./", "./index.html", "./app.js?v=34", "./training.js?v=34", "./plan.js?v=34", "./pomo.js?v=34", "./work.js?v=34", "./sync.js?v=34", "./debts.js?v=34", "./spheres.js?v=34", "./tasks.js?v=34", "./stats.js?v=34", "./main.js?v=34", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;   // GitHub API не кэшируем
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
