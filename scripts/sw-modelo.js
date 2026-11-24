// Modelo do service worker: o build (scripts/build.js) preenche a versão e a lista e grava dist/sw.js.
// Só guarda os arquivos do app. O que vem de /api nunca passa por aqui: dados pessoais não ficam no cache.
//
// Versão nova: baixa só os arquivos que mudaram (cada um tem a sua marca; os iguais vêm do cache que o aparelho já
// tem) e fica esperando. Ela só assume quando a página pede ('atualizar') e recarrega em seguida — quem decide a
// hora é frontend/js/atualizacao.js. Assim a página aberta nunca mistura arquivos de duas versões.

const VERSAO = '__VERSAO__';
const CACHE = 'sortmediuns-' + VERSAO;
const ARQUIVOS = __ARQUIVOS__;   // { url: marca do conteúdo }
const MARCA = 'x-sm-marca';      // cabeçalho guardado junto de cada arquivo no cache
const PAGINAS = { '/fila': '/fila.html' };   // páginas que não são o app (na Vercel, cleanUrls tira o .html)

// O mesmo arquivo (mesma marca) em algum cache do app: o desta versão (download interrompido) ou de uma anterior.
async function jaTem(caches_, url, marca) {
  for (const c of caches_) {
    const r = await c.match(url);
    if (r && r.headers.get(MARCA) === marca) return r;
  }
  return null;
}

async function baixar(url, marca) {
  const r = await fetch(new Request(url, { cache: 'reload' }));
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const cab = new Headers(r.headers);
  cab.set(MARCA, marca);
  // Resposta nova (sem "redirected"): o Safari recusa servir uma resposta redirecionada para a navegação.
  return new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: cab });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const nomes = (await caches.keys()).filter((n) => n.startsWith('sortmediuns-'));
    const novo = await caches.open(CACHE);
    const anteriores = await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.open(n)));
    const fontes = [novo, ...anteriores];
    // Poucos de cada vez: no celular com sinal fraco, 95 pedidos juntos falham mais.
    const fila = Object.entries(ARQUIVOS);
    const trabalhar = async () => {
      for (let item = fila.shift(); item; item = fila.shift()) {
        const [url, marca] = item;
        const tem = await jaTem(fontes, url, marca);
        if (tem) {
          if ((await novo.match(url))?.headers.get(MARCA) !== marca) await novo.put(url, tem.clone());
          continue;
        }
        await novo.put(url, await baixar(url, marca));
      }
    };
    await Promise.all(Array.from({ length: 6 }, trabalhar));
    // Transição: o app de antes desta mudança só troca de versão sozinho (não sabe pedir). Se o cache anterior é
    // desse formato (sem a marca), assume já, como era.
    for (const c of anteriores) {
      const r = await c.match('/');
      if (r && !r.headers.get(MARCA)) { await self.skipWaiting(); break; }
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('sortmediuns-') && n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// 'atualizar': a página vai recarregar, a versão nova assume. 'versao': qual versão está servindo esta página.
self.addEventListener('message', (e) => {
  if (e.data === 'atualizar') self.skipWaiting();
  else if (e.data === 'versao' && e.ports[0]) e.ports[0].postMessage(VERSAO);
});

// As páginas próprias (/fila: senha, TV e cartaz) vêm sempre da rede, com os arquivos delas: elas não pedem a troca de
// versão (quem pede é o app, em js/atualizacao.js), e do cache ficariam presas na versão instalada mesmo recarregando
// (a TV aberta pelo botão do app, por exemplo). Sem rede elas não funcionam de qualquer jeito (dependem da API).
const ehPaginaPropria = (u) => Object.prototype.hasOwnProperty.call(PAGINAS, new URL(u).pathname) || Object.values(PAGINAS).includes(new URL(u).pathname);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate' && ehPaginaPropria(e.request.url)) return;   // a página: direto da rede
  // Navegação abre o app ('/').
  const chave = e.request.mode !== 'navigate' ? url.pathname : '/';
  e.respondWith((async () => {
    // Arquivo pedido por uma página própria: da rede (o cache fica só como reserva, se a rede falhar).
    const cliente = e.clientId ? await self.clients.get(e.clientId) : null;
    if (cliente && ehPaginaPropria(cliente.url)) return fetch(e.request).catch(() => caches.match(chave).then((r) => r || Response.error()));
    const r = await (await caches.open(CACHE)).match(chave);
    return r || fetch(e.request);
  })());
});

// Notificação do Oráculo (consulta paga): o aviso vem sem conteúdo (api/_lib/push.js), o texto é este.
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('Oráculo de Maria Mulambo', {
    body: 'Uma consulta foi paga. Toque para ver a agenda.', icon: '/icon-192.png', badge: '/favicon.png', tag: 'oraculo', renotify: true,
  }));
});
// Tocar na notificação: com o app aberto, vai para a aba Oráculo; senão, abre o app nela.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = abertos.find((c) => new URL(c.url).origin === location.origin && !ehPaginaPropria(c.url));
    if (app) { await app.focus(); app.postMessage('abrir-oraculo'); return; }
    await self.clients.openWindow('/#oraculo');
  })());
});
