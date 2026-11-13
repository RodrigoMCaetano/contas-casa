// Guarda os arquivos do app para abrir sem internet.
// Os dados ficam por conta do cache offline do próprio Firestore.
const CACHE = 'contas-casa-v3';
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

// Arquivos do app: tenta a internet primeiro (até 3 s), para pegar sempre a versão
// mais nova; sem rede ou com rede lenta, usa a cópia guardada.
async function doApp(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req, { ignoreSearch: true });
  const rede = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (!guardado) return rede;
  const espera = new Promise((ok) => setTimeout(() => ok(guardado), 3000));
  return Promise.race([rede.catch(() => guardado), espera]);
}

// SDK do Firebase: o endereço já tem a versão, então a cópia guardada nunca fica velha.
async function doSdk(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) ev.respondWith(doApp(req));
  else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) ev.respondWith(doSdk(req));
  // chamadas ao Firebase (login e banco) passam direto
});
