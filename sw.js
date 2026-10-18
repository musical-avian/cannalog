// Offline support. Network first (so updates show up at once), cache as fallback when offline.
// Bump CACHE when the file list changes.

const CACHE = "cannalog-v1";
const FILES = [
  "./",
  "index.html",
  "app.js",
  "calc.js",
  "store.js",
  "manifest.webmanifest",
  "icon.svg",
  "vendor/uPlot.iife.min.js",
  "vendor/uPlot.min.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const deleteOldCaches = caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))));
  event.waitUntil(deleteOldCaches);
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
