/* FortiPass service worker — makes the app usable with no network at all.
   Bump CACHE_VERSION whenever the shell files change. */

const CACHE_VERSION = "fortipass-v2";

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "script.js",
  "wordlist.js",
  "manifest.json",
  "favicon.svg",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  // Navigations: try the network first so updates land, fall back to the cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("index.html", copy));
          return response;
        })
        .catch(() =>
          caches
            .match("index.html")
            .then((cached) => cached || caches.match("./"))
        )
    );
    return;
  }

  // Assets: serve from cache immediately, refresh it in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
