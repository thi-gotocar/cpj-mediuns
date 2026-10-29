// Senhas (scrypt) e sessões (token assinado com HMAC), só com node:crypto.

import { scrypt, randomBytes, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { db } from './db.js';

const N = 16384, R = 8, P = 1, TAM = 32;
const VALIDADE_SESSAO = 30 * 24 * 60 * 60; // 30 dias, em segundos

function scryptP(senha, sal) {
  return new Promise((ok, erro) => scrypt(senha, sal, TAM, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? erro(e) : ok(k))));
}

export async function gerarHash(senha) {
  const sal = randomBytes(16);
  const k = await scryptP(String(senha), sal);
  return ['scrypt', N, R, P, sal.toString('base64'), k.toString('base64')].join('$');
}

// Hash fixo usado quando o e-mail não existe, para a resposta levar o mesmo tempo.
let hashFalso = null;

export async function conferirSenha(senha, armazenado) {
  if (!armazenado) {
    hashFalso ||= await gerarHash('senha-que-nao-existe');
    await conferirSenha(senha, hashFalso);
    return false;
  }
  const partes = String(armazenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salB64, hB64] = partes;
  const esperado = Buffer.from(hB64, 'base64');
  const k = await new Promise((ok, erro) => scrypt(String(senha), Buffer.from(salB64, 'base64'), esperado.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }, (e, x) => (e ? erro(e) : ok(x))));
  return k.length === esperado.length && timingSafeEqual(k, esperado);
}

// O segredo das sessões fica no próprio banco (gerado na instalação).
let segredo = null;
async function obterSegredo() {
  segredo ||= await db.rpc('sistema_segredo');
  if (!segredo) throw new Error('Segredo de sessão ausente.');
  return segredo;
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const assinar = (dados, chave) => createHmac('sha256', chave).update(dados).digest('base64url');

export async function emitirToken(usuario) {
  const corpo = b64url(JSON.stringify({ u: usuario.id, v: usuario.sessaoVersao, exp: Math.floor(Date.now() / 1000) + VALIDADE_SESSAO }));
  return corpo + '.' + assinar(corpo, await obterSegredo());
}

// Sessão de quem entra com o acesso da corrente: só o nome, sem conta.
export async function emitirTokenCorrente(nome) {
  const corpo = b64url(JSON.stringify({ c: nome, exp: Math.floor(Date.now() / 1000) + VALIDADE_SESSAO }));
  return corpo + '.' + assinar(corpo, await obterSegredo());
}

// Devolve { id, versao } (usuário), { corrente: true, nome } ou null se inválido/vencido.
export async function lerToken(token) {
  const [corpo, assinatura] = String(token || '').split('.');
  if (!corpo || !assinatura) return null;
  const esperado = Buffer.from(assinar(corpo, await obterSegredo()));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    if (!d.exp || d.exp < Date.now() / 1000) return null;
    if (typeof d.c === 'string' && d.c.trim()) return { corrente: true, nome: d.c };
    if (!d.u) return null;
    return { id: d.u, versao: d.v };
  } catch {
    return null;
  }
}

// Comparação de textos sem vazar tempo (para o código de instalação).
export function iguaisSeguro(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export const SENHA_MINIMA = 8;
