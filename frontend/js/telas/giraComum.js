// Peças da aba Gira usadas por mais de um arquivo (gira.js, giraEu.js, giraTopo.js).

import { STATUS } from '/shared/regras.js';
import { esc, dLong, dDM } from '../util.js';

// 1º combo da presença: Pendente, Presente, Falta, Ausente. Antes do dia da gira: só Pendente ou Ausente (Presente e Falta, só no dia).
export function htmlStatus(g, sel, s, antesDoDia) {
  const ops = [...(g.pendentePadrao || s === 'pend' ? ['pend'] : []), 'p', 'f', 'a'];
  // Antes do dia: Presente só no dia; Falta também, a não ser que o sorteio já tenha sido feito.
  const sorteado = (g.pares || []).length > 0 || (g.passes || []).length > 0;
  const bloqueada = (k) => antesDoDia && k !== sel && (k === 'p' || (k === 'f' && !sorteado));
  return ops.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''} ${bloqueada(k) ? 'disabled' : ''}>${STATUS[k]}${bloqueada(k) ? ' (no dia)' : ''}</option>`).join('');
}

// A Presença também começa minimizada (abre enquanto o app estiver aberto).
export const abertos = new Set();
export const cabDobra = (k, titulo, extra = '') => {
  const ab = abertos.has(k);
  return `<button class="grp-h dobra" data-act="dobrarcard" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${extra} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
};

// Aviso de sorteio pendente (só para gira em aberto).
export const caixaPendente = (g) => `<div class="sorteio-pend"><span class="sp-icone" aria-hidden="true">⚠️</span><b class="sp-tit">Sorteio de escala pendente da Michelle</b>
  <span class="muted sp-prev">Previsão: <b>${esc(dLong(g.data))}</b> (${esc(dDM(g.data))})</span></div>`;

// Ícone do WhatsApp (balão com o telefone).
export const ICONE_WHATS = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#25D366" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.9L2.3 21.8l4.8-1.3A9.8 9.8 0 1 0 12 2.2z"/><path fill="#fff" d="M8.6 7.2c.2-.4.5-.4.7-.4h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.1.2-.2.3 0 .6.4.7 1 1.4 1.6 1.9.7.6 1.3.8 1.6 1 .2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4-.3.6-1.5 1.2-2 1.2-.6.1-1.1.3-3.7-.8-3.1-1.3-5-4.4-5.2-4.6-.1-.2-1.2-1.6-1.2-3.1 0-1.4.7-2.1 1-2.4z"/></svg>';
