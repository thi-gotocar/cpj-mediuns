// Versão do app em cada aparelho (a marca do service worker, que o app manda no cabeçalho X-App-Versao) e a
// versão exigida pelo root (Admin root → 📲 Versão do app). Pedido de um app em outra versão volta com o cabeçalho
// X-App-Versao-Exigida, e o app baixa a versão nova e recarrega (frontend/js/atualizacao.js).
// A exigida é lida do banco no máximo uma vez por minuto por função (fica guardada na memória).
import { db } from './db.js';

const FORMATO = /^[a-f0-9]{6,32}$/;
const CACHE_MS = 60000;
let cache = { valor: '', em: 0 };

export const versaoDoPedido = (req) => {
  const v = String(req.headers?.['x-app-versao'] || '').trim();
  return FORMATO.test(v) ? v : '';
};
export const versaoValida = (v) => v === '' || FORMATO.test(String(v));

export async function versaoExigida() {
  if (Date.now() - cache.em < CACHE_MS) return cache.valor;
  try { cache = { valor: String((await db.rpc('app_versao_exigida')) || ''), em: Date.now() }; } catch { cache.em = Date.now(); }
  return cache.valor;
}
export const guardarExigida = (valor) => { cache = { valor, em: Date.now() }; };

// Chamado pelo rota() em todo pedido que traz a versão: só põe o cabeçalho quando há exigida e ela é outra.
export async function avisarVersao(req, res) {
  const minha = versaoDoPedido(req);
  if (!minha) return;
  const exigida = await versaoExigida();
  if (exigida && exigida !== minha) res.setHeader('X-App-Versao-Exigida', exigida);
}
