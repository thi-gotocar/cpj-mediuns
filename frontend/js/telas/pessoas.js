// Tela "Pessoas": cadastro da corrente.

import { FUNCOES, LINHAS, LINHA_LABEL, TURMAS_LIMPEZA, CURIMBA, ehCurimba } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, salvarLicenca, editarLicenca, removerLicenca, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';

const dBR = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Licenças em vigor ou futuras (as que já terminaram saem da lista sozinhas).
function cardLicencas(ps, editar) {
  const hj = hoje();
  const lics = ps.flatMap((p) => (p.licencas || []).filter((l) => l.fim >= hj).map((l) => ({ ...l, pessoa: p })))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
  if (!lics.length) return '';
  let h = `<div class="card"><div class="grp-h"><h2>Licenças</h2><span class="count">${lics.length}</span></div>`;
  h += `<div class="ppl">${lics.map((l) => {
    const agora = l.inicio <= hj;
    const conf = estado.confirm === 'lic:' + l.id;
    if (editar && estado.editLic === l.id) {
      return `<div class="pp lic-ed"><span class="nm">${esc(l.pessoa.nome)}</span>
        <div class="row"><label class="field" style="flex:1 1 130px">Início<input type="date" id="el-i" value="${l.inicio}"></label>
        <label class="field" style="flex:1 1 130px">Fim<input type="date" id="el-f" value="${l.fim}"></label>
        <label class="field" style="flex:2 1 200px">Motivo<input type="text" id="el-m" maxlength="200" value="${esc(l.motivo || '')}"></label></div>
        <div class="row"><button class="btn small primary" data-act="salvarlic" data-id="${l.id}">Salvar</button><button class="btn small" data-act="cancelarlic">Cancelar</button></div></div>`;
    }
    return `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nmcell"><span class="nm">${esc(l.pessoa.nome)}</span>
      <span class="muted" style="font-size:.85rem">${dBR(l.inicio)} a ${dBR(l.fim)}${l.motivo ? ` · ${esc(l.motivo)}` : ''}${agora ? ' · <b>de licença agora</b>' : ' · começa depois'}</span></span>
      ${editar ? `<span class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn small" data-act="editlic" data-id="${l.id}">Editar</button>${conf ? `<button class="btn small danger" data-act="dellic" data-id="${l.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="lic:${l.id}">Remover</button>`}</span>` : ''}</div>`;
  }).join('')}</div>`;
  return h + `</div>`;
}

// Quem é de cada turma da limpeza (para conferir de uma vez).
function cardTurmas(ps) {
  const com = ps.filter((p) => p.limpeza);
  if (!com.length) return '';
  const aberto = estado.turmasAbertas ? ' open' : '';
  return `<div class="card"><details class="turmas-d"${aberto}><summary class="grp-h" style="cursor:pointer"><h2 style="display:inline">🧹 Turmas da limpeza</h2><span class="count">${com.length} de ${ps.length}</span></summary>
    <div class="turmas" style="margin-top:8px">${TURMAS_LIMPEZA.map((t) => {
      const nomes = ps.filter((p) => Number(p.limpeza) === t).map((p) => esc(p.nome) + (ehCurimba(p) ? ' 🥁' : ''));
      return `<div><b>Turma ${t}</b> <span class="muted">(${nomes.length})</span>: ${nomes.length ? nomes.join(', ') : '<span class="muted">ninguém</span>'}</div>`;
    }).join('')}
    ${ps.length > com.length ? `<div class="muted">Sem turma: ${ps.length - com.length}</div>` : ''}</div></details></div>`;
}

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
  if (d instanceof HTMLDetailsElement && d.classList.contains('turmas-d')) estado.turmasAbertas = d.open;
  if (d instanceof HTMLDetailsElement && d.classList.contains('linhas')) {
    if (d.open) estadoAberto.add(d.dataset.id); else estadoAberto.delete(d.dataset.id);
  }
}, true);

// Curimba: só nome e turma da limpeza (não entra na presença nem no sorteio).
function cardCurimba(todas, editar) {
  const cs = todas.filter(ehCurimba);
  if (!cs.length) return '';
  let h = `<div class="card"><div class="grp-h"><h2>🥁 Curimba</h2><span class="count">${cs.length}</span></div>
    <p class="muted" style="margin:0;font-size:.85rem">Fazem parte das turmas da limpeza, mas não contam presença nem falta e não entram no sorteio.</p>`;
  h += `<div class="ppl">${cs.map((p) => {
    if (!editar) return `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nm">${esc(p.nome)}</span>${p.limpeza ? `<span class="muted" style="font-size:.85rem">🧹 Turma ${p.limpeza}</span>` : ''}</div>`;
    const conf = estado.confirm === 'p:' + p.id;
    const nomeHtml = estado.renomear === p.id
      ? `<form id="f-ren" class="ren" data-id="${p.id}"><input type="text" id="ren-in" value="${esc(p.nome)}" maxlength="80" autocomplete="off" aria-label="Novo nome de ${esc(p.nome)}"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelren">Cancelar</button></form>`
      : `<span class="nmline"><span class="nm">${esc(p.nome)}</span><button class="btn link small" data-act="ren" data-id="${p.id}" title="Editar nome" aria-label="Editar nome de ${esc(p.nome)}">✎ editar</button></span>`;
    return `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nmcell">${nomeHtml}
      <label class="check small" style="white-space:nowrap">🧹 Limpeza: turma <select class="limp-sel" id="lp-${p.id}" data-act="limpeza" data-id="${p.id}" aria-label="Turma da limpeza de ${esc(p.nome)}"><option value="">—</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(p.limpeza) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></span>
      ${conf ? `<button class="btn small danger" data-act="delpessoa" data-id="${p.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="p:${p.id}">Excluir</button>`}</div>`;
  }).join('')}</div>`;
  return h + `</div>`;
}

// Card "Adicionar": escolhe o que cadastrar (pessoas da corrente, licença ou curimba).
const MODOS = [['pessoas', 'Pessoas'], ['licenca', 'Licença'], ['curimba', 'Curimba']];
function cardAdicionar(ps) {
  const modo = estado.addModo || 'pessoas';
  let h = `<div class="card"><h2>＋ Adicionar</h2>
    <div class="seg add-seg" role="group" aria-label="O que adicionar">${MODOS.map(([k, t]) => `<button data-act="addmodo" data-v="${k}" aria-pressed="${modo === k}">${t}</button>`).join('')}</div>`;
  if (modo === 'pessoas') {
    h += `<form id="f-add" class="row">
      <label class="field grow">Nome<input type="text" id="f-nome" placeholder="Um nome, ou vários separados por vírgula" autocomplete="off" maxlength="4000"></label>
      <label class="field" style="flex:0 1 150px">Função<select id="f-func">${FUNCOES.map((f) => `<option value="${f.k}" ${f.k === prefs.lastFunc ? 'selected' : ''}>${f.label}</option>`).join('')}</select></label>
      <button class="btn primary" type="submit">Adicionar</button></form>`;
  } else if (modo === 'licenca') {
    h += `<form id="f-lic" class="row" autocomplete="off">
      <label class="field grow">Pessoa<select id="lic-p"><option value="">— escolha —</option>${ps.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="field" style="flex:1 1 140px">Início<input type="date" id="lic-i" value="${hoje()}"></label>
      <label class="field" style="flex:1 1 140px">Fim<input type="date" id="lic-f"></label>
      <label class="field" style="flex:2 1 220px">Motivo (opcional)<input type="text" id="lic-m" maxlength="200" placeholder="Ex.: Férias, Gravidez…"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
      <p class="muted" style="margin:0;font-size:.85rem">Quem estiver de licença fica fora do sorteio e aparece como “de licença” na gira. A licença sai da lista sozinha depois da data final.</p>`;
  } else {
    h += `<form id="f-curimba" class="row" autocomplete="off">
      <label class="field grow">Nome<input type="text" id="cur-nome" placeholder="Um nome, ou vários separados por vírgula" maxlength="4000"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
      <p class="muted" style="margin:0;font-size:.85rem">A curimba entra nas turmas da limpeza, mas não conta presença nem falta e não entra no sorteio.</p>`;
  }
  return h + `</div>`;
}

export function render() {
  const todas = pessoasOrd();
  const ps = todas.filter((p) => !ehCurimba(p));   // a corrente (sem a curimba)
  const editar = pode('pessoas:editar');
  let h = `<section class="panel">`;
  if (editar) {
    h += cardAdicionar(ps);
  } else {
    h += `<p class="leitura" style="margin:0">Lista da corrente, só para consulta.</p>`;
  }
  if (!ps.length) {
    return h + cardCurimba(todas, editar) + `<div class="card empty"><p class="muted">${editar ? 'Ninguém cadastrado ainda. Digite os nomes acima; pode colar uma lista inteira separada por vírgulas.' : 'Ninguém cadastrado ainda.'}</p></div></section>`;
  }
  h += cardLicencas(ps, editar);   // licença: só a corrente
  // Totalizador da corrente, por função.
  h += `<div class="card"><div class="grp-h"><h2>Corrente</h2><span class="count">${ps.length} pessoa${ps.length === 1 ? '' : 's'}</span></div>
    <div class="presentes">${FUNCOES.map((f) => `<span><span class="muted">${f.pl}</span> <b>${ps.filter((p) => p.funcao === f.k).length}</b></span>`).join('')}</div></div>`;
  h += cardTurmas(todas);
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    const fechado = (prefs.pessoasFechadas || []).includes(f.k);
    h += `<div class="card"><button class="grp-h dobra" data-act="dobrar" data-f="${f.k}" aria-expanded="${!fechado}" aria-label="${fechado ? 'Expandir' : 'Minimizar'} ${f.pl}">
      <h2>${f.pl}</h2><span class="count">${gp.length} <span class="seta" aria-hidden="true">${fechado ? '▸' : '▾'}</span></span></button>`;
    if (fechado) { h += `</div>`; return; }
    h += `<div class="ppl">`;
    gp.forEach((p) => {
      if (!editar) {
        h += `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nmcell"><span class="nm">${esc(p.nome)}</span>${resumoLinhas(p)}${p.limpeza ? `<span class="muted" style="font-size:.85rem">🧹 Turma ${p.limpeza} da limpeza</span>` : ''}</span>${p.funcao === 'medium' && p.experiente ? '<span class="muted" style="font-size:.85rem">pode ter passe junto</span>' : ''}</div>`;
        return;
      }
      const conf = estado.confirm === 'p:' + p.id;
      const nomeHtml = estado.renomear === p.id
        ? `<form id="f-ren" class="ren" data-id="${p.id}"><input type="text" id="ren-in" value="${esc(p.nome)}" maxlength="80" autocomplete="off" aria-label="Novo nome de ${esc(p.nome)}"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelren">Cancelar</button></form>`
        : `<span class="nmline"><span class="nm">${esc(p.nome)}</span><button class="btn link small" data-act="ren" data-id="${p.id}" title="Editar nome" aria-label="Editar nome de ${esc(p.nome)}">✎ editar</button></span>`;
      h += `<div class="pp"><span class="nmcell">${nomeHtml}${p.funcao === 'medium' ? `<label class="check small"><input type="checkbox" id="exp-${p.id}" data-act="exp" data-id="${p.id}" ${p.experiente ? 'checked' : ''}> Pode ter médium de passe junto</label>` : ''}
          <label class="check small" style="white-space:nowrap">🧹 Limpeza: turma <select class="limp-sel" id="lp-${p.id}" data-act="limpeza" data-id="${p.id}" aria-label="Turma da limpeza de ${esc(p.nome)}"><option value="">—</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(p.limpeza) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></span>
        <select id="fn-${p.id}" data-act="func" data-id="${p.id}" aria-label="Função de ${esc(p.nome)}">${FUNCOES.map((o) => `<option value="${o.k}" ${o.k === p.funcao ? 'selected' : ''}>${o.label}</option>`).join('')}</select>
        ${conf ? `<button class="btn small danger" data-act="delpessoa" data-id="${p.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="p:${p.id}">Excluir</button>`}
        ${p.funcao === 'extra' || p.funcao === 'passe' ? editorLinhas(p) : ''}</div>`;
    });
    h += `</div></div>`;
  });
  h += cardCurimba(todas, editar);
  return h + '</section>';
}

export const cliques = {
  addmodo(el) { estado.addModo = el.dataset.v; avisar(); document.querySelector('#f-nome, #lic-p, #cur-nome')?.focus(); },
  // Minimiza / expande o bloco de uma função (lembra no aparelho).
  dobrar(el) {
    const k = el.dataset.f;
    const set = new Set(prefs.pessoasFechadas || []);
    if (set.has(k)) set.delete(k); else set.add(k);
    prefs.pessoasFechadas = [...set];
    salvarPrefs();
    avisar();
  },
  editlic(el) { estado.editLic = el.dataset.id; avisar(); },
  cancelarlic() { estado.editLic = null; avisar(); },
  async salvarlic(el) {
    const inicio = document.getElementById('el-i').value;
    const fim = document.getElementById('el-f').value;
    if (!inicio || !fim) { toast('Informe o início e o fim da licença.'); return; }
    if (fim < inicio) { toast('A data final é antes do início.'); return; }
    if (await editarLicenca(el.dataset.id, inicio, fim, document.getElementById('el-m').value.trim())) { estado.editLic = null; toast('Licença alterada.'); avisar(); }
  },
  dellic(el) { estado.confirm = null; removerLicenca(el.dataset.id); },
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
  limpeza(t) { atualizarPessoa(t.dataset.id, { limpeza: t.value ? Number(t.value) : null }); },
  linha(t) {
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (!p) return;
    const atuais = new Set(p.linhas || []);
    if (t.checked) atuais.add(t.dataset.l); else atuais.delete(t.dataset.l);
    atualizarPessoa(p.id, { linhas: [...atuais].sort() });
  },
};

export async function enviarLicenca() {
  const pessoa = document.getElementById('lic-p').value;
  const inicio = document.getElementById('lic-i').value;
  const fim = document.getElementById('lic-f').value;
  if (!pessoa) { toast('Escolha a pessoa.'); return; }
  if (!inicio || !fim) { toast('Informe o início e o fim da licença.'); return; }
  if (fim < inicio) { toast('A data final é antes do início.'); return; }
  if (await salvarLicenca(pessoa, inicio, fim, document.getElementById('lic-m').value.trim())) toast('Licença cadastrada.');
}

export async function enviarCurimba() {
  const inp = document.getElementById('cur-nome');
  if (!inp.value.trim()) { toast('Digite pelo menos um nome.'); return; }
  try {
    const n = await adicionarPessoas(inp.value, CURIMBA);
    toast(n ? `${n} adicionada${n > 1 ? 's' : ''} na curimba.` : 'Esses nomes já estão cadastrados.');
    const novo = document.getElementById('cur-nome');
    if (novo) { novo.value = ''; novo.focus(); }
  } catch (e) { toast(e.message); avisar(); }
}

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
