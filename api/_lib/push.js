// Notificação no aparelho (Web Push) sem dependência: o aviso vai sem conteúdo (não precisa cifrar nada) e o service
// worker mostra o texto fixo dele. Só a assinatura VAPID (JWT ES256) é feita aqui, com node:crypto.
//
// Variáveis (só no servidor): VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY (gere com `node scripts/vapid.js`) e, opcional,
// VAPID_SUBJECT (mailto: ou https: de contato; sem ela, o endereço do app). Sem as chaves, nada é enviado.
import { createPrivateKey, sign } from 'node:crypto';
import { db } from './db.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
export const pushConfigurado = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const chavePublicaPush = () => (pushConfigurado() ? process.env.VAPID_PUBLIC_KEY : '');

let chavePrivada = null;
function assinatura(aud) {
  if (!chavePrivada) {
    const pub = Buffer.from(process.env.VAPID_PUBLIC_KEY, 'base64url');
    chavePrivada = createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', d: process.env.VAPID_PRIVATE_KEY, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
      format: 'jwk',
    });
  }
  const sub = process.env.VAPID_SUBJECT || 'https://cpj-mediuns.vercel.app';
  const dados = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' + b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  return dados + '.' + b64u(sign('sha256', Buffer.from(dados), { key: chavePrivada, dsaEncoding: 'ieee-p1363' }));
}

// Endereço que o navegador devolveu ao inscrever: só https e de tamanho normal.
export function endpointValido(s) {
  if (typeof s !== 'string' || s.length > 1000) return null;
  try { return new URL(s).protocol === 'https:' ? s : null; } catch { return null; }
}

// Manda o aviso a cada aparelho; o que não existe mais (404/410) sai da lista. Falha aqui nunca derruba o pedido.
export async function enviarPush(endpoints) {
  if (!pushConfigurado() || !endpoints?.length) return;
  const mortos = [];
  await Promise.all(endpoints.map(async (ep) => {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${assinatura(new URL(ep).origin)}, k=${process.env.VAPID_PUBLIC_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.status === 404 || r.status === 410) mortos.push(ep);
      else if (!r.ok) console.error('[push]', r.status, (await r.text().catch(() => '')).slice(0, 200));
    } catch (e) { console.error('[push]', e?.message || e); }
  }));
  for (const endpoint of mortos) await db.rpc('push_inscrever', { endpoint, remover: true }).catch(() => {});
}
