/* asa-notation · service worker
 *
 * - Interface (arquivos em /assets e a página): abre sem rede.
 * - Leitura (páginas, tarefas, metas, capturas): última resposta boa fica guardada para ler offline.
 * - Nunca guarda: login, senha, tokens, configurações, export, escritas.
 * - O cache de dados é limpo no logout (mensagem "clear-data-cache").
 */
const VERSION = "v1";
const SHELL_CACHE = `asa-shell-${VERSION}`;
const DATA_CACHE = `asa-data-${VERSION}`;
const DATA_LIMIT = 200;

// Só estas rotas de leitura ficam guardadas para uso offline.
const CACHEABLE_API = /^\/api\/(pages|tasks|goals|captures)(\/|$|\?)/;

function strategyFor(method, url, mode, origin) {
  if (method !== "GET") return "bypass";
  if (url.origin !== origin) return "bypass";
  if (url.pathname.startsWith("/api/")) return CACHEABLE_API.test(url.pathname + url.search) ? "data" : "bypass";
  if (mode === "navigate") return "navigate";
  if (url.pathname.startsWith("/assets/")) return "shell-first";
  return "network-first";
}

if (typeof module !== "undefined") module.exports = { strategyFor, CACHEABLE_API };

if (typeof self !== "undefined" && typeof self.addEventListener === "function" && typeof ServiceWorkerGlobalScope !== "undefined") {
  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith("asa-") && k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "clear-data-cache") event.waitUntil(caches.delete(DATA_CACHE));
  });

  async function trim(cache) {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - DATA_LIMIT; i++) await cache.delete(keys[i]);
  }

  async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      // 401 (sessão expirada) e erros não entram no cache.
      if (response.ok) {
        await cache.put(request, response.clone());
        if (cacheName === DATA_CACHE) await trim(cache);
      }
      return response;
    } catch (err) {
      const cached = (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
      if (cached) return cached;
      throw err;
    }
  }

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    switch (strategyFor(request.method, url, request.mode, self.location.origin)) {
      case "data":
        event.respondWith(networkFirst(request, DATA_CACHE));
        break;
      case "navigate":
        event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
        break;
      case "shell-first":
        event.respondWith(
          caches.open(SHELL_CACHE).then(async (cache) => {
            const hit = await cache.match(request);
            if (hit) return hit;
            const response = await fetch(request);
            if (response.ok) await cache.put(request, response.clone());
            return response;
          }),
        );
        break;
      case "network-first":
        event.respondWith(networkFirst(request, SHELL_CACHE));
        break;
      default:
        break;
    }
  });
}
