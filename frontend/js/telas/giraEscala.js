// Bloco de escala e sorteio de duplas: renderização, ajustes e ações.
// Extrai componentes reutilizáveis do sorteio para facilitar testes e manutenção.

import { pode } from '../estado.js';
import { esc, dDM } from '../util.js';

// "Médiuns e cambones" começa minimizado; abre enquanto o app estiver aberto.
export const duplasAbertas = new Set();

// Quem não edita a gira vê "Ver escala"; o admin, "Ver mais".
export const botaoDobrar = (aberto) => `<button class="btn link small ver-mais" data-act="dobrarduplas" aria-expanded="${aberto}">${aberto ? '▾ Minimizar' : pode('giras:editar') ? '▸ Ver mais' : '▸ Ver escala'}</button>`;

// Depois do sorteio: Remanejar faltas e Ajuste manual, lado a lado, do mesmo tamanho (amarelos).
// Remanejar pede confirmação antes.
export function acoesSorteio(g, remanejarOk, manualOk, manual, refazerOk = false) {
  const bts = [];
  if (remanejarOk) bts.push(`<button class="btn btn-grande bt-amarelo" data-act="askdel" data-k="rem:${g.data}"><span aria-hidden="true">🔄</span> Remanejar faltas</button>`);
  if (manualOk) bts.push(`<button class="btn btn-grande bt-amarelo" data-act="manual" aria-pressed="${manual}"><span aria-hidden="true">✋</span> ${manual ? 'Concluir ajuste' : 'Ajuste manual'}</button>`);
  if (refazerOk) bts.push(`<button class="btn btn-grande bt-amarelo" data-act="askdel" data-k="csort:${g.data}"><span aria-hidden="true">↻</span> Refazer sorteio</button>`);
  if (!bts.length) return '';
  return `<div class="sort-acoes n${bts.length}">${bts.join('')}</div>`;
}

// Confirmação do remanejar faltas (pede confirmação).
export function confirmaRemenajo() {
  return `<div class="infobox rem-conf"><span><b>Remanejar faltas?</b> Refaz só as duplas de quem faltou ou mudou de status; as outras ficam como estão.</span>
    <span class="row" style="gap:6px"><button class="btn small primary" data-act="remanejar">Confirmar</button><button class="btn small" data-act="cancelrei">Cancelar</button></span></div>`;
}

// Título do bloco do sorteio: para quem não edita, depois de publicado, "Sorteio realizado!";
// para o admin, "Sorteio de escala" com o ícone de bingo depois de sorteado.
export const tituloSorteio = (sorteado) => (sorteado && !pode('giras:editar') ? '<h2 class="sorteio-ok">🚀 Sorteio realizado! ❤️</h2>'
  : `<h2>Sorteio de escala${sorteado ? ' <span aria-hidden="true">🎱</span>' : ''}</h2>`);

// Confirmação dentro do bloco do sorteio (antes de sortear e antes de cancelar o sorteio).
export const confirmaSorteio = (texto, act, botao) => `<div class="infobox rem-conf"><span>${texto}</span>
  <span class="row" style="gap:6px"><button class="btn small primary" data-act="${act}">${botao}</button><button class="btn small" data-act="cancelrei">Cancelar</button></span></div>`;

// Botão de dobra/expandir para o bloco de duplas (quando minimizado).
export const titDobra = (ab) => `<button class="grp-h dobra" data-act="dobrarduplas" aria-expanded="${ab}">${tituloSorteio(true)}<span class="count"><span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;

// Renderizar uma linha de cambone/passe com selos de repetição e controles.
export function linhaEscala(k, p, idx, opts, mp, rotulo, editar, passada, manual, seloFora, botaoFalta, confirmaFalta, nome) {
  const fora = seloFora(p.c);
  const selo = (e) => (!e ? ''
    : e.recente ? `<span class="badge hot">repetiu da última</span>`
      : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
  const quem = fora ? `<span class="nmc">${esc(nome(p.c))}</span>${fora}` : editar
    ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`
    : `<span class="nmc">${esc(nome(p.c))}</span>`;
  const falta = editar && !passada && !manual && !fora ? botaoFalta(p.c) : '';
  return `<div class="camrow">${rotulo ? `<span class="tag ${rotulo === 'Cambone' ? 'cam' : ''}">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${falta}</div>${editar ? confirmaFalta(p.c) : ''}`;
}
