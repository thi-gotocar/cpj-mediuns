// Fotos no Cloudflare R2 (API compatível com S3), sem dependências: a assinatura (AWS SigV4) é feita aqui.
//
// Variáveis na Vercel: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET.
// O bucket é privado: o app grava pelo servidor e mostra as fotos por links assinados que expiram.
// R2_ENDPOINT (opcional) troca o endereço do R2 — só para testes locais.

import { createHash, createHmac } from 'node:crypto';
import { HttpError } from './http.js';

const sha256 = (d) => createHash('sha256').update(d).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
// Codificação exigida pela assinatura (RFC 3986).
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const dataAmz = (agora) => agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');   // 20260524T000000Z

function chaveDeAssinatura(segredo, dia, regiao) {
  return hmac(hmac(hmac(hmac('AWS4' + segredo, dia), regiao), 's3'), 'aws4_request');
}

// URL assinada na própria query (o navegador abre direto no R2, sem passar pela Vercel).
export function urlAssinada({ origem, caminho, chaveId, segredo, regiao = 'auto', expira = 3600, agora = new Date() }) {
  const host = new URL(origem).host;
  const amz = dataAmz(agora);
  const escopo = `${amz.slice(0, 8)}/${regiao}/s3/aws4_request`;
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${chaveId}/${escopo}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(expira), 'X-Amz-SignedHeaders': 'host' };
  const qs = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&');
  const canonica = ['GET', caminho, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const texto = ['AWS4-HMAC-SHA256', amz, escopo, sha256(canonica)].join('\n');
  const assinatura = createHmac('sha256', chaveDeAssinatura(segredo, amz.slice(0, 8), regiao)).update(texto).digest('hex');
  return `${origem}${caminho}?${qs}&X-Amz-Signature=${assinatura}`;
}

// Cabeçalhos assinados de uma requisição (PUT/DELETE pelo servidor).
export function cabecalhosAssinados({ metodo, origem, caminho, corpo = '', chaveId, segredo, regiao = 'auto', extras = {}, agora = new Date() }) {
  const amz = dataAmz(agora);
  const escopo = `${amz.slice(0, 8)}/${regiao}/s3/aws4_request`;
  const h = { host: new URL(origem).host, 'x-amz-content-sha256': sha256(corpo), 'x-amz-date': amz };
  for (const [k, v] of Object.entries(extras)) h[k.toLowerCase()] = String(v).trim();
  const nomes = Object.keys(h).sort();
  const assinados = nomes.join(';');
  const canonica = [metodo, caminho, '', nomes.map((k) => `${k}:${h[k]}\n`).join(''), assinados, h['x-amz-content-sha256']].join('\n');
  const texto = ['AWS4-HMAC-SHA256', amz, escopo, sha256(canonica)].join('\n');
  const assinatura = createHmac('sha256', chaveDeAssinatura(segredo, amz.slice(0, 8), regiao)).update(texto).digest('hex');
  const { host, ...resto } = h;
  return { ...resto, authorization: `AWS4-HMAC-SHA256 Credential=${chaveId}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}` };
}

function config() {
  const e = process.env;
  if (!e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET || !(e.R2_ACCOUNT_ID || e.R2_ENDPOINT)) {
    throw new HttpError(503, 'O armazenamento das fotos ainda não foi configurado.');
  }
  return { origem: (e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/+$/, ''),
    bucket: e.R2_BUCKET, chaveId: e.R2_ACCESS_KEY_ID, segredo: e.R2_SECRET_ACCESS_KEY };
}
const caminhoDe = (c, chave) => `/${c.bucket}/${chave.split('/').map(enc).join('/')}`;

export const r2 = {
  configurado() { try { config(); return true; } catch { return false; } },

  // A data da assinatura é arredondada para blocos de 6 horas: o link não muda a cada consulta e o navegador
  // aproveita a foto que já baixou. Vale 12 horas a partir do começo do bloco (pelo menos 6 depois da consulta).
  url(chave) {
    const c = config();
    const bloco = 6 * 3600 * 1000;
    const agora = new Date(Math.floor(Date.now() / bloco) * bloco);
    return urlAssinada({ origem: c.origem, caminho: caminhoDe(c, chave), chaveId: c.chaveId, segredo: c.segredo, expira: 12 * 3600, agora });
  },

  async enviar(chave, corpo, tipo) {
    const c = config();
    const caminho = caminhoDe(c, chave);
    const headers = cabecalhosAssinados({ metodo: 'PUT', origem: c.origem, caminho, corpo, chaveId: c.chaveId, segredo: c.segredo, extras: { 'content-type': tipo, 'cache-control': 'private, max-age=31536000, immutable' } });
    await chamar(c.origem + caminho, { method: 'PUT', headers, body: corpo });
  },

  async apagar(chave) {
    const c = config();
    const caminho = caminhoDe(c, chave);
    await chamar(c.origem + caminho, { method: 'DELETE', headers: cabecalhosAssinados({ metodo: 'DELETE', origem: c.origem, caminho, chaveId: c.chaveId, segredo: c.segredo }) });
  },
};

async function chamar(url, opcoes) {
  let r;
  try { r = await fetch(url, opcoes); } catch (e) {
    console.error('[r2] falha de conexão', e);
    throw new HttpError(502, 'Não foi possível falar com o armazenamento das fotos. Tente de novo.');
  }
  // Apagar o que já não existe não é erro.
  if (!r.ok && !(opcoes.method === 'DELETE' && r.status === 404)) {
    console.error('[r2]', opcoes.method, r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'O armazenamento das fotos recusou o pedido. Tente de novo.');
  }
}
