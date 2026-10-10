// Service worker v2: abre o app offline já na 2ª visita.
//  - install: precache do shell (rotas principais, manifest e ícones);
//  - /assets/* (arquivos com hash): cache-first;
//  - navegação (HTML): rede primeiro; sem rede, usa a última cópia dessa página (ou a Home).
const CACHE = "pte-master-hub-v2";
const PRECACHE = [
  "/",
  "/practice",
  "/session",
  "/progress",
  "/exam",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // addAll aborta tudo se uma rota falhar — precache tolerante, rota por rota.
        Promise.all(
          PRECACHE.map((u) =>
            cache.add(new Request(u, { cache: "reload" })).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(
          async () => (await caches.match(req)) ?? (await caches.match("/")) ?? Response.error(),
        ),
    );
  }
});
