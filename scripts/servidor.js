// Servidor de desenvolvimento: imita a Vercel no seu computador.
//   /api/*      -> funções em api/ (mesmo formato da Vercel)
//   /shared/*   -> shared/
//   /*          -> frontend/
// Uso: npm run dev   (lê o .env)

import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

async function listarRotas(dir = path.join(RAIZ, 'api'), prefixo = '') {
  const rotas = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) rotas.push(...(await listarRotas(full, prefixo + '/' + e.name)));
    else if (e.name.endsWith('.js')) {
      const rel = (prefixo + '/' + e.name.replace(/\.js$/, '')).replace(/\/index$/, '');
      const nomes = [];
      const re = new RegExp('^/api' + rel.replace(/\[([^\]]+)\]/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
      rotas.push({ re, nomes, arquivo: full, dinamica: nomes.length });
    }
  }
  return rotas.sort((a, b) => a.dinamica - b.dinamica);
}

function lerCorpo(req) {
  return new Promise((ok, erro) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 5e6) req.destroy(); });
    req.on('end', () => ok(s));
    req.on('error', erro);
  });
}

function adaptarRes(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(o)); return res; };
  res.send = (o) => { res.end(typeof o === 'string' ? o : JSON.stringify(o)); return res; };
  return res;
}

async function servirArquivo(res, arquivo) {
  try {
    const st = await stat(arquivo);
    if (st.isDirectory()) return servirArquivo(res, path.join(arquivo, 'index.html'));
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(arquivo));
    return true;
  } catch {
    return false;
  }
}

export async function criarServidor() {
  const rotas = await listarRotas();
  return http.createServer(async (req, res) => {
    adaptarRes(res);
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) {
        const rota = rotas.find((r) => r.re.test(url.pathname));
        if (!rota) return res.status(404).json({ erro: 'Rota não encontrada.' });
        const m = url.pathname.match(rota.re);
        req.query = Object.fromEntries(url.searchParams);
        rota.nomes.forEach((n, i) => { req.query[n] = decodeURIComponent(m[i + 1]); });
        const bruto = await lerCorpo(req);
        req.body = bruto;
        if (bruto && String(req.headers['content-type'] || '').includes('application/json')) {
          try { req.body = JSON.parse(bruto); } catch { /* fica como texto; a rota responde 400 */ }
        }
        const mod = await import(pathToFileURL(rota.arquivo).href);
        return await mod.default(req, res);
      }
      const seguro = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (seguro.includes('..')) return res.status(400).end();
      const base = seguro.startsWith('shared' + path.sep) || seguro.startsWith('shared/') ? RAIZ : path.join(RAIZ, 'frontend');
      if (await servirArquivo(res, path.join(base, seguro))) return;
      res.status(404).end('Não encontrado');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ erro: 'Erro interno.' });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const porta = Number(process.env.PORT) || 3000;
  const srv = await criarServidor();
  srv.listen(porta, () => {
    console.log(`Sort Médiuns rodando em http://localhost:${porta}`);
    if (!process.env.DATABASE_URL) console.log('Aviso: crie o arquivo .env (veja .env.example) com a DATABASE_URL do banco.');
  });
}
