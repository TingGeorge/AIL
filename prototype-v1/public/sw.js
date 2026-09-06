// Cache only the public app shell. Never store API, credentials, search results or requests.
const VERSION = "ail-main-best-v3";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/app-icon-192.png", "/app-icon-512.png", "/app-icon-maskable-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("ail-") && key !== VERSION).map(key => caches.delete(key)),
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const save = async (key, response) => {
    if (response.ok) { const cache = await caches.open(VERSION); await cache.put(key, response.clone()); }
    return response;
  };
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => save("/index.html", response)).catch(async () =>
      (await caches.match("/index.html")) || Response.error()));
  } else if (url.pathname.startsWith("/assets/")) {
    // Vite content-hashed assets are immutable; only assets actually visited are available offline.
    event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => save(request, response))));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).then(response => save(request, response)).catch(async () =>
      (await caches.match(request)) || Response.error()));
  }
});
