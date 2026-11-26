// Оффлайн-кэш: приложение открывается без интернета.
const CACHE = "ritual-v69";
const FILES = ["./", "./index.html", "./app.js?v=69", "./training.js?v=69", "./plan.js?v=69", "./pomo.js?v=69", "./work.js?v=69", "./sync.js?v=69", "./debts.js?v=69", "./spheres.js?v=69", "./tasks.js?v=69", "./stats.js?v=69", "./discover.js?v=69", "./nicotine.js?v=69", "./main.js?v=69", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
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
