// Cliente do backend (/api). Envia o token da sessão e trata expiração.

import { token, esquecerSessao } from './auth.js';

export class ErroApi extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let aoExpirar = () => {};
export function quandoSessaoExpirar(fn) { aoExpirar = fn; }

export async function api(metodo, rota, corpo, tentativa = 0) {
  const t = await token({ forcarRenovacao: tentativa > 0 });
  if (!t) { aoExpirar(); throw new ErroApi(401, 'Faça login.'); }
  let r;
  try {
    r = await fetch('/api' + rota, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + t, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão. Verifique a internet e tente de novo.');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && tentativa === 0) return api(metodo, rota, corpo, 1);
  if (r.status === 401) { esquecerSessao(); aoExpirar(); }
  if (!r.ok) throw new ErroApi(r.status, j.erro || 'Algo deu errado. Tente de novo.');
  return j;
}
