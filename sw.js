// sw.js — TR-13-app (GitHub Pages safe)

const CACHE_NAME = "tr13-pwa-v2";

const ASSETS = [
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            const resp = await fetch(url, { cache: "no-cache" });
            if (!resp.ok) throw new Error(`${url} -> ${resp.status}`);
            await cache.put(url, resp);
          } catch (err) {
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
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh.ok && new URL(req.url).origin === location.origin) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        if (req.mode === "navigate") {
          return (await caches.match("./index.html")) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
