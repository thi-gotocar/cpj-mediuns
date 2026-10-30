// Tela "Perfil": cada pessoa registra os seus orixás, guias e outros guias.
// O admin também acompanha a corrente: quem já respondeu, os guias de todos e as oferendas pendentes.

import { ORIXAS } from '/shared/regras.js';
import { POSICOES_ORIXA, POSICOES_GUIA, GUIAS, NOME_GUIA_MAX, respondeu } from '/shared/perfil.js';
import { estado, pode, avisar, carregarPerfil, mudarPerfil } from '../estado.js';
import { esc } from '../util.js';

const GUIA_LABEL = Object.fromEntries(GUIAS);
const ROT_ORIXA = { frente: 'frente', ancestral: 'ancestral', adjunto: 'adjunto' };
const U = () => estado.pfUi;
const admin = () => pode('pessoas:editar') && Array.isArray(estado.perfil?.todos);

// Cabeçalho do card. Para o admin, toca para minimizar/expandir.
function cab(k, titulo, count, aberto) {
  if (!admin()) return `<div class="grp-h"><h2>${titulo}</h2><span class="count">${count}</span></div>`;
  return `<button class="grp-h dobra" data-act="pfdobra" data-k="${k}" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'}">
    <h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
}
const aberto = (k, padrao) => !admin() || (U().abertos[k] ?? padrao);
function card(k, titulo, count, padrao, corpo) {
  const ab = aberto(k, padrao);
  return `<div class="card">${cab(k, titulo, count, ab)}${ab ? corpo() : ''}</div>`;
}

// Uma linha: rótulo, combo e "Oferenda realizada" ao lado.
function linhaEscolha({ grupo, k, rotulo, valor, opcoes, oferenda }) {
  return `<div class="pf-linha">
    <label class="pf-rot" for="pf-${grupo}-${k}">${rotulo}</label>
    <div class="pf-campos">
      <select id="pf-${grupo}-${k}" data-act="pfsel" data-g="${grupo}" data-k="${k}">
        <option value="">Selecione…</option>
        ${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <label class="chip pf-of${valor ? '' : ' off'}"><input type="checkbox" id="pf-of-${grupo}-${k}" data-act="pfof" data-g="${grupo}" data-k="${k}" ${oferenda ? 'checked' : ''} ${valor ? '' : 'disabled'}> Oferenda realizada</label>
    </div>
  </div>`;
}

// ---------- meu perfil ----------
function meusCards(eu) {
  const P = eu.perfil;
  // Admin: os meus cards começam minimizados se eu já tinha respondido (decide uma vez, ao abrir).
  if (U().meuPadrao === undefined) U().meuPadrao = !respondeu(P);
  const padrao = U().meuPadrao;
  const orixas = ORIXAS.map((o) => [o, o]);
  return card('orixas', 'Orixás', esc(eu.nome), padrao, () =>
    POSICOES_ORIXA.map(([k, rotulo]) => linhaEscolha({ grupo: 'orixas', k, rotulo, valor: P.orixas[k].nome, opcoes: orixas, oferenda: P.orixas[k].oferenda })).join(''))
  + card('guias', 'Guias', '', padrao, () =>
    POSICOES_GUIA.map(([k, rotulo]) => linhaEscolha({ grupo: 'guias', k, rotulo, valor: P.guias[k].linha, opcoes: GUIAS, oferenda: P.guias[k].oferenda })).join(''))
  + card('outros', 'Outros guias', '', padrao, () => `
    <p class="muted" style="margin:0 0 8px;font-size:.85rem">Escreva o nome do seu guia em cada linha.</p>
    ${GUIAS.map(([k, label]) => `<div class="pf-linha pf-outro">
      <label class="pf-rot" for="pf-outro-${k}">${esc(label)}</label>
      <input id="pf-outro-${k}" type="text" maxlength="${NOME_GUIA_MAX}" placeholder="Nome do guia" autocomplete="off" data-act="pfnome" data-k="${k}" value="${esc(P.outros[k] || '')}">
    </div>`).join('')}`);
}

// ---------- admin: a corrente ----------
function cardRespostas(todos) {
  const sim = todos.filter((x) => respondeu(x.perfil));
  const nao = todos.filter((x) => !respondeu(x.perfil));
  const pct = todos.length ? Math.round((sim.length / todos.length) * 100) : 0;
  return card('respostas', 'Respostas', `${sim.length} de ${todos.length}`, true, () => `
    <div class="pf-resp"><b>${pct}%</b><span>${sim.length} ${sim.length === 1 ? 'pessoa respondeu' : 'pessoas responderam'} · ${nao.length} ${nao.length === 1 ? 'falta' : 'faltam'}</span></div>
    <div class="pf-barra" role="img" aria-label="${pct}% responderam"><span style="width:${pct}%"></span></div>
    ${nao.length ? `<button class="btn link small pf-mais" data-act="pffaltam">${U().faltam ? '− Esconder' : `＋ Ver quem ainda não respondeu (${nao.length})`}</button>
      ${U().faltam ? `<ul class="pf-lista">${nao.map((x) => `<li>${esc(x.nome)}</li>`).join('')}</ul>` : ''}` : '<p class="muted" style="margin:6px 0 0">Todo mundo já respondeu. 🙌</p>'}`);
}

function cardGuiasCorrente(todos) {
  const com = todos.filter((x) => POSICOES_GUIA.some(([k]) => x.perfil.guias[k].linha));
  return card('corrente-guias', 'Guias da corrente', com.length, true, () => (com.length ? `
    <div class="pf-tab">
      <div class="pf-th"><span>Nome</span><span>Guia chefe</span><span>Guia de frente</span></div>
      ${com.map((x) => `<div class="pf-tr"><span class="pf-nome">${esc(x.nome)}</span>${POSICOES_GUIA.map(([k]) => {
        const l = x.perfil.guias[k].linha;
        return `<span>${l ? esc(GUIA_LABEL[l]) : '<span class="muted">—</span>'}</span>`;
      }).join('')}</div>`).join('')}
    </div>` : '<p class="muted" style="margin:0">Ninguém informou os guias ainda.</p>'));
}

// Oferendas que faltam, só de quem já respondeu (quem não respondeu está no bloco Respostas).
function cardOferendas(todos) {
  const resp = todos.filter((x) => respondeu(x.perfil));
  const orixas = resp.map((x) => {
    const falta = POSICOES_ORIXA.filter(([k]) => !x.perfil.orixas[k].oferenda)
      .map(([k]) => (x.perfil.orixas[k].nome ? `${x.perfil.orixas[k].nome} (${ROT_ORIXA[k]})` : `${ROT_ORIXA[k]}: não informado`));
    return { nome: x.nome, falta };
  }).filter((x) => x.falta.length);
  const guia = (k) => resp.filter((x) => !x.perfil.guias[k].oferenda)
    .map((x) => ({ nome: x.nome, falta: [x.perfil.guias[k].linha ? GUIA_LABEL[x.perfil.guias[k].linha] : 'não informado'] }));
  const grupos = [['Orixás', orixas], ['Guia de frente', guia('frente')], ['Guia chefe', guia('chefe')]];
  const total = new Set(grupos.flatMap(([, l]) => l.map((x) => x.nome))).size;
  return card('corrente-oferendas', 'Oferendas pendentes', total, true, () => (resp.length ? `
    ${grupos.map(([t, l]) => `<div class="pf-grupo"><div class="pf-gt">${t} <span class="count">${l.length}</span></div>
      ${l.length ? `<ul class="pf-lista">${l.map((x) => `<li><b>${esc(x.nome)}</b> <span class="muted">— ${x.falta.map(esc).join(', ')}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:2px 0 0">Ninguém pendente.</p>'}
    </div>`).join('')}
    <p class="muted" style="margin:8px 0 0;font-size:.82rem">Só de quem já respondeu o perfil.</p>` : '<p class="muted" style="margin:0">Ninguém respondeu ainda.</p>'));
}

export function render() {
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const { eu, todos } = estado.perfil;
  let h = '';
  if (admin()) h += cardRespostas(todos);
  if (eu) h += meusCards(eu);
  else if (!admin()) h += `<div class="card"><p class="muted" style="margin:0">Seu usuário não está ligado a uma pessoa da corrente, então não tem perfil próprio.</p></div>`;
  if (admin()) h += cardGuiasCorrente(todos) + cardOferendas(todos);
  return h;
}

export const cliques = {
  pfdobra(el) {
    const k = el.dataset.k;
    U().abertos[k] = el.getAttribute('aria-expanded') !== 'true';
    avisar();
  },
  pffaltam() { U().faltam = !U().faltam; avisar(); },
};

export const mudancas = {
  pfsel(el) {
    const { g, k } = el.dataset;
    const campo = g === 'orixas' ? 'nome' : 'linha';
    mudarPerfil((P) => { P[g][k] = { [campo]: el.value, oferenda: el.value ? P[g][k].oferenda : false }; });
  },
  pfof(el) {
    const { g, k } = el.dataset;
    mudarPerfil((P) => { P[g][k].oferenda = el.checked; });
  },
  pfnome(el) {
    const v = el.value.replace(/\s+/g, ' ').trim();
    mudarPerfil((P) => { if (v) P.outros[el.dataset.k] = v; else delete P.outros[el.dataset.k]; });
  },
};
