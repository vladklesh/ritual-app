// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v45";
const FILES = ["./", "./index.html", "./app.js?v=45", "./training.js?v=45", "./plan.js?v=45", "./pomo.js?v=45", "./work.js?v=45", "./sync.js?v=45", "./debts.js?v=45", "./spheres.js?v=45", "./tasks.js?v=45", "./stats.js?v=45", "./main.js?v=45", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
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
      // HTML: prefer current deployment, fall back to offline cache.
      if (e.request.mode === "navigate" || new URL(e.request.url).pathname.endsWith("/index.html")) return fetch(e.request).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    })
  );
});
