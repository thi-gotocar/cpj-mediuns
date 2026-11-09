// Build do frontend para a Vercel: copia frontend/ e shared/ para dist/.
// Não há compilação: o navegador carrega os módulos JS direto. O build só acrescenta
// o pré-carregamento dos módulos da abertura (index.html) e gera o service worker (sw.js).

import { cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const MAIN = '/js/main.js';
const SCRIPT_MAIN = `<script type="module" src="${MAIN}"></script>`;
// Só imports estáticos: as abas sob demanda usam import() e ficam de fora do pré-carregamento.
const IMPORT = /^\s*(?:import|export)\s+(?:[\w*{},\s$]+?\sfrom\s+)?['"]([^'"]+)['"]/gm;

const arquivo = (url) => path.join(DIST, ...url.split('/'));

// Módulos que a abertura do app baixa, de main.js em diante.
async function modulosDaAbertura() {
  const vistos = new Set([MAIN]);
  for (const url of vistos) {
    const texto = await readFile(arquivo(url), 'utf8');
    for (const [, dep] of texto.matchAll(IMPORT)) vistos.add(new URL(dep, 'http://app' + url).pathname);
  }
  return [...vistos];
}

async function listar(dir, prefixo = '') {
  const lista = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const url = prefixo + '/' + e.name;
    if (e.isDirectory()) lista.push(...(await listar(path.join(dir, e.name), url)));
    else lista.push(url);
  }
  return lista.sort();
}

await rm(DIST, { recursive: true, force: true });
await cp(path.join(RAIZ, 'frontend'), DIST, { recursive: true });
await cp(path.join(RAIZ, 'shared'), path.join(DIST, 'shared'), { recursive: true });

const modulos = await modulosDaAbertura();
const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
if (!html.includes(SCRIPT_MAIN)) throw new Error('index.html sem o script de main.js: o build não sabe onde pré-carregar.');
const preload = modulos.map((u) => `<link rel="modulepreload" href="${u}">`).join('\n');
await writeFile(path.join(DIST, 'index.html'), html.replace(SCRIPT_MAIN, preload + '\n' + SCRIPT_MAIN));

// A versão muda só quando algum arquivo do app muda; deploy que mexe só na API não obriga a baixar tudo de novo.
const urls = await listar(DIST);
const hash = createHash('sha256');
for (const u of urls) hash.update(u).update(await readFile(arquivo(u)));
const modelo = await readFile(path.join(RAIZ, 'scripts', 'sw-modelo.js'), 'utf8');
const lista = urls.map((u) => (u === '/index.html' ? '/' : u));
await writeFile(path.join(DIST, 'sw.js'), modelo.replace('__VERSAO__', hash.digest('hex').slice(0, 16)).replace('__ARQUIVOS__', JSON.stringify(lista)));

console.log(`Frontend pronto em dist/ (${modulos.length} módulos na abertura, ${lista.length} arquivos no service worker)`);
