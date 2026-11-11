// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v17";
const FILES = ["./", "./index.html", "./app.js?v=17", "./training.js?v=17", "./plan.js?v=17", "./pomo.js?v=17", "./work.js?v=17", "./sync.js?v=17", "./debts.js?v=17", "./spheres.js?v=17", "./tasks.js?v=17", "./stats.js?v=17", "./main.js?v=17", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
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
