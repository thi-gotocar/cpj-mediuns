// Modelo do service worker: o build (scripts/build.js) preenche a versão e a lista e grava dist/sw.js.
// Só guarda os arquivos do app. O que vem de /api nunca passa por aqui: dados pessoais não ficam no cache.

const CACHE = 'sortmediuns-__VERSAO__';
const ARQUIVOS = __ARQUIVOS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('sortmediuns-') && n !== CACHE).map((n) => caches.delete(n)))));
});

// A página avisa quando a versão nova pode entrar (frontend/js/atualizacao.js).
self.addEventListener('message', (e) => { if (e.data === 'atualizar') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const chave = e.request.mode === 'navigate' ? '/' : url.pathname;
  e.respondWith(caches.open(CACHE).then((c) => c.match(chave)).then((r) => r || fetch(e.request)));
});
