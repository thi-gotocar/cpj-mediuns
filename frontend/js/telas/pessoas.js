// Tela "Pessoas": cadastro da corrente.

import { FUNCOES } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, avisar } from '../estado.js';
import { esc, toast } from '../util.js';

export function render() {
  const ps = pessoasOrd();
  const editar = pode('pessoas:editar');
  let h = `<section class="panel">`;
  if (editar) {
    h += `<div class="card"><h2>Adicionar pessoas</h2>
    <form id="f-add" class="row">
      <label class="field grow">Nome<input type="text" id="f-nome" placeholder="Um nome, ou vários separados por vírgula" autocomplete="off" maxlength="4000"></label>
      <label class="field" style="flex:0 1 150px">Função<select id="f-func">${FUNCOES.map((f) => `<option value="${f.k}" ${f.k === prefs.lastFunc ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
      <button class="btn primary" type="submit">Adicionar</button>
    </form></div>`;
  } else {
    h += `<p class="leitura" style="margin:0">Lista da corrente, só para consulta.</p>`;
  }
  if (!ps.length) {
    return h + `<div class="card empty"><p class="muted">${editar ? 'Ninguém cadastrado ainda. Digite os nomes acima; pode colar uma lista inteira separada por vírgulas.' : 'Ninguém cadastrado ainda.'}</p></div></section>`;
  }
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    h += `<div class="card"><div class="grp-h"><h2>${f.pl}</h2><span class="count">${gp.length}</span></div><div class="ppl">`;
    gp.forEach((p) => {
      if (!editar) {
        h += `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nm">${esc(p.nome)}</span>${p.funcao === 'medium' && p.experiente ? '<span class="muted" style="font-size:.85rem">pode ter passe junto</span>' : ''}</div>`;
        return;
      }
      const conf = estado.confirm === 'p:' + p.id;
      h += `<div class="pp"><span class="nmcell"><span class="nm">${esc(p.nome)}</span>${p.funcao === 'medium' ? `<label class="check small"><input type="checkbox" id="exp-${p.id}" data-act="exp" data-id="${p.id}" ${p.experiente ? 'checked' : ''}> Pode ter médium de passe junto</label>` : ''}</span>
        <select id="fn-${p.id}" data-act="func" data-id="${p.id}" aria-label="Função de ${esc(p.nome)}">${FUNCOES.map((o) => `<option value="${o.k}" ${o.k === p.funcao ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        ${conf ? `<button class="btn small danger" data-act="delpessoa" data-id="${p.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="p:${p.id}">Excluir</button>`}</div>`;
    });
    h += `</div></div>`;
  });
  return h + '</section>';
}

export const cliques = {
  delpessoa(el) { estado.confirm = null; excluirPessoa(el.dataset.id); },
};

export const mudancas = {
  exp(t) { atualizarPessoa(t.dataset.id, { experiente: t.checked }); },
  func(t) { atualizarPessoa(t.dataset.id, { funcao: t.value }); },
};

export async function enviarFormulario() {
  const inp = document.getElementById('f-nome');
  const funcao = document.getElementById('f-func').value;
  prefs.lastFunc = funcao;
  salvarPrefs();
  if (!inp.value.trim()) { toast('Digite pelo menos um nome.'); return; }
  try {
    const n = await adicionarPessoas(inp.value, funcao);
    const label = FUNCOES.find((f) => f.k === funcao).label;
    toast(n ? `${n} adicionada${n > 1 ? 's' : ''} como ${label}.` : 'Esses nomes já estão cadastrados.');
    const novo = document.getElementById('f-nome');
    if (novo) { novo.value = ''; novo.focus(); }
  } catch (e) { toast(e.message); avisar(); }
}
