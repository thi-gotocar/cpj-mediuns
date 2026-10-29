// Cliente do backend (/api). Envia o token da sessão e trata expiração.

import { token, sair } from './auth.js';

export class ErroApi extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let aoExpirar = () => {};
export function quandoSessaoExpirar(fn) { aoExpirar = fn; }

export async function api(metodo, rota, corpo) {
  const t = token();
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
  if (r.status === 401) { sair(); aoExpirar(); }
  if (!r.ok) throw new ErroApi(r.status, j.erro || 'Algo deu errado. Tente de novo.');
  return j;
}
