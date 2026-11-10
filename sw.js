// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v12";
const FILES = ["./", "./index.html", "./app.js?v=12", "./training.js?v=12", "./plan.js?v=12", "./pomo.js?v=12", "./work.js?v=12", "./debts.js?v=12", "./spheres.js?v=12", "./tasks.js?v=12", "./stats.js?v=12", "./main.js?v=12", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
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
