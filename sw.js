// Guarda os arquivos do app para abrir sem internet.
// Os dados ficam por conta do cache offline do próprio Firestore.
const CACHE = 'contas-casa-v1';
const ARQUIVOS = ['./', 'index.html', 'style.css', 'app.js', 'logic.js', 'store-firebase.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const doApp = url.origin === self.location.origin;
  const sdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!doApp && !sdk) return; // chamadas ao Firebase passam direto

  // Responde do cache na hora e atualiza em segundo plano.
  ev.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: doApp });
      const rede = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => guardado);
      return guardado || rede;
    }),
  );
});
