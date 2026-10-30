// Tela "Perfil": cada pessoa registra os seus orixás, guias e outros guias.

import { ORIXAS } from '/shared/regras.js';
import { POSICOES_ORIXA, POSICOES_GUIA, GUIAS, NOME_GUIA_MAX } from '/shared/perfil.js';
import { estado, carregarPerfil, mudarPerfil } from '../estado.js';
import { esc } from '../util.js';

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

export function render() {
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const P = estado.perfil.perfil;
  const orixas = ORIXAS.map((o) => [o, o]);
  return `
  <div class="card">
    <div class="grp-h"><h2>Orixás</h2><span class="count">${esc(estado.perfil.nome)}</span></div>
    ${POSICOES_ORIXA.map(([k, rotulo]) => linhaEscolha({ grupo: 'orixas', k, rotulo, valor: P.orixas[k].nome, opcoes: orixas, oferenda: P.orixas[k].oferenda })).join('')}
  </div>
  <div class="card">
    <div class="grp-h"><h2>Guias</h2></div>
    ${POSICOES_GUIA.map(([k, rotulo]) => linhaEscolha({ grupo: 'guias', k, rotulo, valor: P.guias[k].linha, opcoes: GUIAS, oferenda: P.guias[k].oferenda })).join('')}
  </div>
  <div class="card">
    <div class="grp-h"><h2>Outros guias</h2></div>
    <p class="muted" style="margin:0 0 8px;font-size:.85rem">Escreva o nome do seu guia em cada linha.</p>
    ${GUIAS.map(([k, label]) => `<div class="pf-linha pf-outro">
      <label class="pf-rot" for="pf-outro-${k}">${esc(label)}</label>
      <input id="pf-outro-${k}" type="text" maxlength="${NOME_GUIA_MAX}" placeholder="Nome do guia" autocomplete="off" data-act="pfnome" data-k="${k}" value="${esc(P.outros[k] || '')}">
    </div>`).join('')}
  </div>`;
}

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
