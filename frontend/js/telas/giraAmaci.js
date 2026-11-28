// Amaci: quem da corrente vai. Só um controle da corrente (não é a presença dos alunos no amaci, que segue na aba Amaci).
// Aparece na Geral (bloco 🕊️ Amaci, com os próximos amacis) e na aba Gira (embaixo do amaci da agenda). Cada pessoa
// responde Vou / Não vou até o dia; todos da corrente veem quem vai e quem não vai. Lido do servidor quando aparece.

import { estado, avisar } from '../estado.js';
import { esc, hoje, pd, toast } from '../util.js';
import { api } from '../api.js';
import { ehAmaci, dataCurta } from '/shared/eventos.js';

const lendo = new Set();
const guardar = (id, r) => { estado.amaciVou = { ...(estado.amaciVou || {}), [id]: r }; };
function ler(id) {
  if (lendo.has(id)) return;
  lendo.add(id);
  api('GET', `/giras?lista=amaciVou&evento=${id}`)
    .then((r) => guardar(id, r), () => guardar(id, { pessoas: [], nao: [], resposta: null, podeMarcar: false, erro: true }))
    .finally(() => { lendo.delete(id); avisar(); });
}

export function amaciVou(e) {
  const v = estado.amaciVou?.[e.id];
  if (!v) { ler(e.id); return '<div class="am-vou"><span class="muted">Carregando quem vai…</span></div>'; }
  if (v.erro) return '';
  const bt = (val, rot) => `<button type="button" data-act="amacivou" data-id="${esc(e.id)}" data-v="${val}" aria-pressed="${v.resposta === val}">${rot}</button>`;
  const resp = v.podeMarcar && e.data >= hoje()
    ? `<div class="am-vou-resp"><span class="am-vou-p">Você vai?</span><div class="seg am-vou-seg" role="group" aria-label="Você vai ao amaci?">${bt('vou', '🙋 Vou')}${bt('nao', 'Não vou')}</div></div>` : '';
  const chips = v.pessoas.length
    ? v.pessoas.map((p) => `<span class="gn-nome pres"><span class="gn-ok" aria-hidden="true">✓</span>${esc(p.nome)}</span>`).join('')
    : '<span class="muted">Ninguém marcou ainda.</span>';
  const nao = v.nao?.length ? `<p class="muted am-vou-nao">Não vão: ${v.nao.map((p) => esc(p.nome)).join(', ')}</p>` : '';
  return `<div class="am-vou">${resp}<div class="am-vou-h"><b>Quem vai</b><span class="am-vou-n">${v.pessoas.length}</span></div>
    <div class="gn-amaci-lista" aria-label="Quem vai ao amaci: ${v.pessoas.length}">${chips}</div>${nao}</div>`;
}

const quando = (d, hj) => {
  const n = Math.round((pd(d) - pd(hj)) / 864e5);
  return n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Em ${n} dias`;
};

// Geral: o próximo amaci (de hoje em diante); "Próximos" mostra os outros.
export function cardAmaci() {
  const hj = hoje();
  const evs = (estado.eventos || []).filter((e) => ehAmaci(e) && e.data >= hj).sort((a, b) => a.data.localeCompare(b.data));
  if (!evs.length) return '';
  const todos = !!estado.amaciTodos;
  const mais = evs.length > 1 ? `<button class="btn link small" data-act="amacitodos" aria-expanded="${todos}">${todos ? 'Ver menos' : `Próximos (${evs.length - 1})`}</button>` : '';
  const sem = (d) => pd(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase());
  const item = (e) => `<div class="am-g-item">
      <div class="am-g-top"><span class="evs-data"><span class="evs-sem">${e.data === hj ? 'Hoje' : sem(e.data)}</span><b>${dataCurta(e.data)}</b></span>
        <span class="am-g-nome"><b>${esc(e.nome)}</b><small class="muted">${quando(e.data, hj)}</small></span></div>
      ${amaciVou(e)}</div>`;
  return `<div class="card am-geral"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">🕊️</span> Amaci</h2>${mais}</div>
    ${(todos ? evs : evs.slice(0, 1)).map(item).join('')}</div>`;
}

export const cliquesAmaci = {
  // Tocar na resposta já marcada apaga a resposta.
  async amacivou(el) {
    const id = el.dataset.id;
    const atual = estado.amaciVou?.[id]?.resposta || null;
    const vou = el.dataset.v === atual ? null : el.dataset.v === 'vou';
    el.disabled = true;
    try {
      guardar(id, await api('POST', '/giras', { acao: 'amaciVou', eventoId: id, vou }));
      toast(vou === null ? 'Resposta apagada.' : vou ? 'Marcado: você vai ao amaci.' : 'Marcado: você não vai.');
    } catch (e) { toast(e.message); }
    avisar();
  },
  amacitodos() { estado.amaciTodos = !estado.amaciTodos; avisar(); },
};
