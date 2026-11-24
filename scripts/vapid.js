// Gera o par de chaves VAPID da notificação do Oráculo (api/_lib/push.js). Rode uma vez no seu computador e copie as
// duas linhas para as variáveis da Vercel (Production). Trocar as chaves desliga as notificações já ativadas: cada
// aparelho precisa tocar em "Ativar avisos" de novo.
//   node scripts/vapid.js
import { generateKeyPairSync } from 'node:crypto';

const jwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' });
const publica = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
console.log('VAPID_PUBLIC_KEY=' + publica);
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
