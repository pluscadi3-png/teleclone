const SHELL_CACHE = "teleclone-shell-v5";
const API_CACHE = "teleclone-api-v1";
const MEDIA_CACHE = "teleclone-media-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/"]).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, API_CACHE, MEDIA_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_API_CACHE") {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function buildRangeResponse(request, cachedResponse) {
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) return cachedResponse;

  const buf = await cachedResponse.arrayBuffer();
  const total = buf.byteLength;
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return cachedResponse;

  const start = parseInt(match[1], 10);
  const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;

  if (start >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` }
    });
  }

  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cachedResponse.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(chunk.byteLength),
      "Accept-Ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname.startsWith("/ws")) return;

  // 1. Photos, Videos, Voice Notes (/uploads/*) -> Cache-First (Offline 100% playable)
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE);
        const cached = await cache.match(url.pathname);
        if (cached) {
          return buildRangeResponse(req, cached.clone());
        }
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.status === 200) {
            cache.put(url.pathname, netRes.clone()).catch(() => {});
          }
          return netRes;
        } catch (_) {
          return new Response("", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // 2. API GET Data (Chats, Messages, Profile, Info) -> Network-First with Offline Cache Fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        const cacheKey = url.pathname + url.search;
        try {
          const netRes = await fetchWithTimeout(req, 5000);
          if (netRes && netRes.status === 200) {
            cache.put(cacheKey, netRes.clone()).catch(() => {});
          }
          return netRes;
        } catch (_) {
          const cached = await cache.match(cacheKey);
          if (cached) return cached;
          return new Response(JSON.stringify({ ok: false, offline: true }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        }
      })()
    );
    return;
  }

  // 3. App Shell (index.html, CSS, JS) -> Network-First (Live Updates + Offline Cold Launch)
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const isNav = req.mode === "navigate" || url.pathname === "/";
      const key = isNav ? "/" : url.pathname + url.search;
      try {
        const netRes = await fetchWithTimeout(req, 4000);
        if (netRes && netRes.status === 200) {
          cache.put(key, netRes.clone()).catch(() => {});
        }
        return netRes;
      } catch (_) {
        const cached = await cache.match(key);
        if (cached) return cached;
        if (isNav) {
          const home = await cache.match("/");
          if (home) return home;
        }
        return new Response("", { status: 503 });
      }
    })()
  );
});