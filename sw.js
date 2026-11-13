// Guarda os arquivos do app para abrir sem internet.
// Os dados ficam por conta do cache offline do próprio Firestore.
const CACHE = 'contas-casa-v6';
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

// ---------- Notificações (lembrete diário enviado pelo GitHub Actions) ----------

self.addEventListener('push', (ev) => {
  let p = {};
  try { p = ev.data.json(); } catch { /* sem conteúdo legível: mostra o aviso padrão */ }
  const titulo = p.data?.title || p.notification?.title || 'Contas da Casa';
  const corpo = p.data?.body || p.notification?.body || 'Você tem contas para conferir.';
  ev.waitUntil(self.registration.showNotification(titulo, {
    body: corpo, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: p.data?.tag || 'lembrete-contas',
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abertas) => {
    const janela = abertas.find((c) => c.url.startsWith(self.registration.scope));
    return janela ? janela.focus() : self.clients.openWindow(self.registration.scope);
  }));
});
