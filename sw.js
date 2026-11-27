/* Service worker: caches the app shell so the app works offline.
 * Bump VERSION whenever you change any file listed in ASSETS. */
const VERSION = "1.0.0";
const CACHE = `pfm-${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "css/style.css",
  "js/jalali.js",
  "js/store.js",
  "js/app.js",
  "manifest.webmanifest",
  "fonts/Vazirmatn-Regular.woff2",
  "fonts/Vazirmatn-SemiBold.woff2",
  "fonts/Vazirmatn-Bold.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // No skipWaiting here: the app asks the user first, then sends SKIP_WAITING.
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        ASSETS.map((url) => {
          // "?v=" busts CDN caches (e.g. GitHub Pages) so a fresh deploy never
          // gets stored under the new cache name with stale files.
          const bust = url + (url.includes("?") ? "&" : "?") + "v=" + VERSION;
          return fetch(new Request(bust, { cache: "reload" })).then((res) => {
            if (res && res.ok) return c.put(url, res);
          });
        }),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Stale-while-revalidate: answer from cache instantly, refresh in the background.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin)
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(
          () =>
            hit ||
            (req.mode === "navigate" ? cache.match("index.html") : undefined),
        );
      // Keep the worker alive until the background refresh finishes (iOS may
      // otherwise kill it before cache.put runs).
      if (hit) event.waitUntil(net);
      return hit || net;
    }),
  );
});
