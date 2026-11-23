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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Navegação abre o app ('/'), menos as páginas próprias: /fila (senha da fila, sem login) é outra página.
  const chave = e.request.mode !== 'navigate' ? url.pathname : PAGINAS[url.pathname] || '/';
  e.respondWith(caches.open(CACHE).then((c) => c.match(chave)).then((r) => r || fetch(e.request)));
});
