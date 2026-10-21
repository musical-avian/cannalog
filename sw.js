// SPDX-License-Identifier: AGPL-3.0-only
// Offline support. Network first, revalidated every time (so updates show up at once), cache as fallback when offline.
// Bump CACHE when the file list changes.

const CACHE = "cannalog-v5";
const FILES = [
  "./",
  "index.html",
  "app.js",
  "calc.js",
  "store.js",
  "report.js",
  "manifest.webmanifest",
  "icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
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
    // no-cache: always ask the server (GitHub Pages' 10-min HTTP cache kept old app.js on phones).
    // Fetch by URL: passing options together with a page-navigation request throws in Chrome.
    fetch(event.request.url, { cache: "no-cache" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })),
  );
});
