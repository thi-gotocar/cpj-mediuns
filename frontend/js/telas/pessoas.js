// Tela "Pessoas": cadastro da corrente.

import { FUNCOES, LINHAS, LINHA_LABEL } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, avisar } from '../estado.js';
import { esc, toast } from '../util.js';

const nomeFuncao = (p) => (p.funcao === 'extra' ? 'extra' : 'médium de passe');

function resumoLinhas(p) {
  if (p.funcao !== 'extra' && p.funcao !== 'passe') return '';
  const ls = p.linhas || [];
  return `<span class="muted" style="font-size:.82rem">${ls.length
    ? `Como ${nomeFuncao(p)} em: ${ls.map((l) => LINHA_LABEL[l] || l).join(', ')}. Nas outras giras, cambona.`
    : `Como ${nomeFuncao(p)} em todas as giras.`}</span>`;
}

function editorLinhas(p) {
  const ls = p.linhas || [];
  return `<details class="linhas"${estadoAberto.has(p.id) ? ' open' : ''} data-id="${p.id}">
    <summary>${ls.length ? `Como ${nomeFuncao(p)} em ${ls.length} linha${ls.length > 1 ? 's' : ''}: ${ls.map((l) => LINHA_LABEL[l] || l).join(', ')}` : `Como ${nomeFuncao(p)} em todas as giras · escolher linhas`}</summary>
    <p class="muted" style="margin:6px 0;font-size:.82rem">Marque as linhas em que atua como ${nomeFuncao(p)}. Nas giras das outras linhas, entra no sorteio como cambone. Sem nenhuma marcada, atua como ${nomeFuncao(p)} em todas.</p>
    ${LINHAS.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
      `<label class="chip"><input type="checkbox" id="ln-${p.id}-${k}" data-act="linha" data-id="${p.id}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${label}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}

// Lembra quais editores de linhas estão abertos entre redesenhos.
const estadoAberto = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d instanceof HTMLDetailsElement && d.classList.contains('linhas')) {
    if (d.open) estadoAberto.add(d.dataset.id); else estadoAberto.delete(d.dataset.id);
  }
}, true);

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
  // Totalizador da corrente, por função.
  h += `<div class="card"><div class="grp-h"><h2>Corrente</h2><span class="count">${ps.length} pessoa${ps.length === 1 ? '' : 's'}</span></div>
    <div class="presentes">${FUNCOES.map((f) => `<span><span class="muted">${f.pl}</span> <b>${ps.filter((p) => p.funcao === f.k).length}</b></span>`).join('')}</div></div>`;
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    h += `<div class="card"><div class="grp-h"><h2>${f.pl}</h2><span class="count">${gp.length}</span></div><div class="ppl">`;
    gp.forEach((p) => {
      if (!editar) {
        h += `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nmcell"><span class="nm">${esc(p.nome)}</span>${resumoLinhas(p)}</span>${p.funcao === 'medium' && p.experiente ? '<span class="muted" style="font-size:.85rem">pode ter passe junto</span>' : ''}</div>`;
        return;
      }
      const conf = estado.confirm === 'p:' + p.id;
      const nomeHtml = estado.renomear === p.id
        ? `<form id="f-ren" class="ren" data-id="${p.id}"><input type="text" id="ren-in" value="${esc(p.nome)}" maxlength="80" autocomplete="off" aria-label="Novo nome de ${esc(p.nome)}"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelren">Cancelar</button></form>`
        : `<span class="nmline"><span class="nm">${esc(p.nome)}</span><button class="btn link small" data-act="ren" data-id="${p.id}" title="Editar nome" aria-label="Editar nome de ${esc(p.nome)}">✎ editar</button></span>`;
      h += `<div class="pp"><span class="nmcell">${nomeHtml}${p.funcao === 'medium' ? `<label class="check small"><input type="checkbox" id="exp-${p.id}" data-act="exp" data-id="${p.id}" ${p.experiente ? 'checked' : ''}> Pode ter médium de passe junto</label>` : ''}</span>
        <select id="fn-${p.id}" data-act="func" data-id="${p.id}" aria-label="Função de ${esc(p.nome)}">${FUNCOES.map((o) => `<option value="${o.k}" ${o.k === p.funcao ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        ${conf ? `<button class="btn small danger" data-act="delpessoa" data-id="${p.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="p:${p.id}">Excluir</button>`}
        ${p.funcao === 'extra' || p.funcao === 'passe' ? editorLinhas(p) : ''}</div>`;
    });
    h += `</div></div>`;
  });
  return h + '</section>';
}

export const cliques = {
  delpessoa(el) { estado.confirm = null; excluirPessoa(el.dataset.id); },
  ren(el) {
    estado.renomear = el.dataset.id;
    avisar();
    const inp = document.getElementById('ren-in');
    if (inp) { inp.focus(); inp.select(); }
  },
  cancelren() { estado.renomear = null; avisar(); },
};

// Salva o nome editado (Enter ou "Salvar").
export async function renomear(form) {
  const id = form.dataset.id;
  const novo = document.getElementById('ren-in').value.trim().replace(/\s+/g, ' ');
  const p = estado.pessoas.find((x) => x.id === id);
  if (!novo) { toast('Digite o nome.'); return; }
  estado.renomear = null;
  if (!p || novo === p.nome) { avisar(); return; }
  if (estado.pessoas.some((x) => x.id !== id && x.nome.toLowerCase() === novo.toLowerCase())) {
    estado.renomear = id; toast('Já existe um cadastro com esse nome.'); return;
  }
  await atualizarPessoa(id, { nome: novo });
  toast('Nome alterado.');
}

export const mudancas = {
  exp(t) { atualizarPessoa(t.dataset.id, { experiente: t.checked }); },
  func(t) { atualizarPessoa(t.dataset.id, { funcao: t.value }); },
  linha(t) {
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (!p) return;
    const atuais = new Set(p.linhas || []);
    if (t.checked) atuais.add(t.dataset.l); else atuais.delete(t.dataset.l);
    atualizarPessoa(p.id, { linhas: [...atuais].sort() });
  },
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
