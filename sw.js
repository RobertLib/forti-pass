/* FortiPass service worker — makes the app usable with no network at all.

   Shipping a change: bump ASSET_VERSION here AND the matching ?v= query on
   the stylesheet and scripts in index.html (the test suite checks they
   agree). The versioned URLs guarantee a page never mixes new HTML with
   stale JavaScript or CSS from an older cache. */

const ASSET_VERSION = "3";
const CACHE_VERSION = "fortipass-v" + ASSET_VERSION;

const VERSIONED = ["styles.css", "wordlist.js", "core.js", "script.js"].map(
  (file) => file + "?v=" + ASSET_VERSION
);

const SHELL = [
  "./",
  "index.html",
  ...VERSIONED,
  "manifest.json",
  "favicon.svg",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Bypass the HTTP cache so a new version never stores stale copies.
      .then((cache) =>
        cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))
      )
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

/** True for the app page itself: the scope root or index.html, any query. */
function isAppShell(url) {
  const scope = new URL(self.registration.scope);
  return (
    url.origin === scope.origin &&
    (url.pathname === scope.pathname ||
      url.pathname === scope.pathname + "index.html")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Anything else in scope (robots.txt, a 404, the verification file) is
    // left to the browser, so it can never end up cached as the app.
    if (!isAppShell(url)) return;

    // Network first so updates land; fall back to the cached page offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const type = response.headers.get("content-type") || "";
          if (response.ok && type.indexOf("text/html") !== -1) {
            const copy = response.clone();
            event.waitUntil(
              caches
                .open(CACHE_VERSION)
                .then((cache) => cache.put("index.html", copy))
            );
          }
          return response;
        })
        .catch(() =>
          caches
            .match("index.html")
            .then((cached) => cached || caches.match("./"))
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Assets: their URLs are versioned, so a cached copy is always the right
  // one. Anything missing is fetched and kept for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy))
          );
        }
        return response;
      });
    })
  );
});
