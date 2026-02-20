// sw.js — TR-13-app (GitHub Pages safe)

const CACHE_NAME = "tr13-pwa-v1";

// IMPORTANT: match your real filenames
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache assets one-by-one so one 404 doesn't kill the whole install
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            const resp = await fetch(url, { cache: "no-cache" });
            if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
            await cache.put(url, resp);
          } catch (err) {
            // Log but do not fail install
            console.warn("SW cache skipped:", err);
          }
        })
      );

      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // remove old caches
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        // Optionally cache same-origin files
        if (fresh.ok && new URL(req.url).origin === location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        // Offline fallback to cached index if navigation
        if (req.mode === "navigate") {
          return (await caches.match("./index.html")) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
