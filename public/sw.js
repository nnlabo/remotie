const CACHE_NAME = "remotie-shell-v2";
const SHELL = [
  "/",
  "/go",
  "/watch",
  "/manifest.webmanifest",
  "/go.webmanifest",
  "/watch.webmanifest",
  "/icons/icon.svg",
  "/icons/go.svg",
  "/icons/watch.svg",
  "/icons/go-180.png",
  "/icons/go-192.png",
  "/icons/go-512.png",
  "/icons/watch-180.png",
  "/icons/watch-192.png",
  "/icons/watch-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
