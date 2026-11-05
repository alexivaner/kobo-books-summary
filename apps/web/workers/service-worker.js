/* Only same-origin static shell assets enter this cache. Imported files never do. */
const CACHE = "kobo-shell-__BUILD_HASH__";
self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch("/offline-assets.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error("Offline asset manifest unavailable");
        return r.json();
      })
      .then((manifest) =>
        caches
          .open(CACHE)
          .then((c) =>
            c.addAll(["/", "/welcome/", "/vendor/sql-wasm.wasm", ...manifest.assets]),
          ),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("kobo-shell-") &&
                k !== CACHE &&
                !keys
                  .filter((x) => x.startsWith("kobo-shell-"))
                  .slice(-2)
                  .includes(k),
            )
            .map((k) => caches.delete(k)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (u.origin !== self.location.origin || event.request.method !== "GET")
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((c) => c.put(u.pathname, copy)));
          }
          return response;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match(u.pathname))),
    );
    return;
  }
  if (
    !u.pathname.startsWith("/_next/static/") &&
    !u.pathname.startsWith("/vendor/")
  )
    return;
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((c) => c.put(event.request, copy)),
            );
          }
          return response;
        }),
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls))
    return;
  const urls = event.data.urls.filter((url) => {
    try {
      const u = new URL(url, self.location.origin);
      return (
        u.origin === self.location.origin &&
        u.pathname.startsWith("/_next/static/")
      );
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(urls))
      .then(() => event.source?.postMessage({ type: "SHELL_READY" })),
  );
});
