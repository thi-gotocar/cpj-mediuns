// Tela "Pessoas": cadastro da corrente e dos alunos da CPJ (por turma).

import { FUNCOES, LINHAS_CADASTRO, LINHA_LABEL, TURMAS_LIMPEZA, CURIMBA, ehCurimba } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, salvarLicenca, editarLicenca, removerLicenca, carregarAlunos, acaoAlunos, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';

// Ordem dos blocos de função nesta tela.
const ORDEM_FUNCOES = ['medium', 'extra', 'passe', 'cambone', 'senha'].map((k) => FUNCOES.find((f) => f.k === k)).filter(Boolean);
const cabDobra = (act, titulo, count, aberto) => `<button class="grp-h dobra" data-act="${act}" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'}">
  <h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;

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
    ${LINHAS_CADASTRO.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
      `<label class="chip"><input type="checkbox" id="ln-${p.id}-${k}" data-act="linha" data-id="${p.id}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${k === 'mista' ? 'Encontro das Linhas (Mista)' : label}</label>`).join('')}</div></div>`).join('')}
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
  const aberto = !!estado.curimbaAberta;
  let h = `<div class="card">${cabDobra('dobrarcurimba', '🥁 Curimba', cs.length, aberto)}`;
  if (!aberto) return h + `</div>`;
  h += `<p class="muted" style="margin:0;font-size:.85rem">Fazem parte das turmas da limpeza, mas não contam presença nem falta e não entram no sorteio.</p>`;
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
const ALUNO = 'aluno';
// Funções que este perfil pode cadastrar: a corrente (quem edita Pessoas) e/ou Aluno (quem edita Alunos).
const funcoesCadastro = () => [
  ...(pode('pessoas:editar') ? FUNCOES.map((f) => [f.k, f.label]) : []),
  ...(pode('alunos:editar') ? [[ALUNO, 'Aluno']] : []),
];
function cardAdicionar(ps) {
  const corrente = pode('pessoas:editar');
  const modo = corrente ? estado.addModo || 'pessoas' : 'pessoas';
  // Começa minimizado (aberto só quando ainda não há ninguém cadastrado).
  const aberto = estado.addAberto ?? (corrente && !ps.length);
  if (!aberto) return `<div class="card">${cabDobra('dobraradd', '＋ Adicionar', '', false)}</div>`;
  let h = `<div class="card">${cabDobra('dobraradd', '＋ Adicionar', '', true)}
    ${corrente ? `<div class="seg add-seg" role="group" aria-label="O que adicionar">${MODOS.map(([k, t]) => `<button data-act="addmodo" data-v="${k}" aria-pressed="${modo === k}">${t}</button>`).join('')}</div>` : ''}`;
  if (modo === 'pessoas') {
    const fs = funcoesCadastro();
    const func = fs.some(([k]) => k === prefs.lastFunc) ? prefs.lastFunc : fs[0][0];
    const turmas = estado.alunos?.turmas || [];
    const turmaSel = turmas.some((t) => t.id === estado.turmaSel) ? estado.turmaSel : turmas[turmas.length - 1]?.id || '';
    h += `<form id="f-add" class="row">
      <label class="field" style="flex:0 1 150px">Função<select id="f-func" data-act="funcnova">${fs.map(([k, l]) => `<option value="${k}" ${k === func ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field add-turma" id="f-turma-campo" ${func === ALUNO ? '' : 'hidden'}>Turma<span class="turma-sel"><select id="f-turma" data-act="turmasel">${turmas.map((t) => `<option value="${t.id}" ${t.id === turmaSel ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select><button class="btn" type="button" data-act="novaturma" title="Adicionar turma" aria-label="Adicionar turma">＋</button></span></label>
      <label class="field grow">Nome<input type="text" id="f-nome" placeholder="Um nome, ou vários separados por vírgula" autocomplete="off" maxlength="4000" value="${esc(estado.addRascunho || '')}"></label>
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

// ---------- alunos da CPJ: um sub-bloco por turma ----------
function cardAlunos() {
  const A = estado.alunos;
  if (!A) return `<div class="card"><h2>🎓 Alunos</h2><div class="loading">Carregando alunos…</div></div>`;
  const ed = pode('alunos:editar');
  const aberto = estado.alunosAberto ?? true;
  let h = `<div class="card">${cabDobra('dobraralunos', '🎓 Alunos', A.alunos.length, aberto)}`;
  if (!aberto) return h + '</div>';
  const grupos = [...A.turmas.map((t) => ({ id: t.id, nome: t.nome, lista: A.alunos.filter((a) => a.turmaId === t.id) })),
    { id: '', nome: 'Sem turma', lista: A.alunos.filter((a) => !a.turmaId || !A.turmas.some((t) => t.id === a.turmaId)) }]
    .filter((g) => g.id || g.lista.length);
  const fechadas = new Set(prefs.turmasFechadas || []);
  h += `<div class="al-grupos">${grupos.map((g) => {
    const fechado = fechadas.has(g.id || 'sem');
    return `<div class="al-grupo"><button class="grp-h dobra al-gh" data-act="dobrarturma" data-t="${g.id || 'sem'}" aria-expanded="${!fechado}"><h3>${esc(g.nome)}</h3><span class="count">${g.lista.length} <span class="seta" aria-hidden="true">${fechado ? '▸' : '▾'}</span></span></button>
      ${fechado ? '' : g.lista.length ? `<div class="al-lista">${g.lista.map((a) => {
        if (!ed) return `<div class="al-l"><span class="nm">${esc(a.nome)}</span></div>`;
        const conf = estado.confirm === 'al:' + a.id;
        return `<div class="al-l"><span class="nmline"><span class="nm">${esc(a.nome)}</span><button class="btn link small" data-act="renaluno" data-id="${a.id}" aria-label="Editar nome de ${esc(a.nome)}">✎ editar</button></span>
          <select data-act="turmaaluno" data-id="${a.id}" aria-label="Turma de ${esc(a.nome)}">${!a.turmaId ? '<option value="" selected>Sem turma</option>' : ''}${A.turmas.map((t) => `<option value="${t.id}" ${t.id === a.turmaId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>
          ${conf ? `<button class="btn small danger" data-act="delaluno" data-id="${a.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="al:${a.id}">Excluir</button>`}</div>`;
      }).join('')}</div>` : '<p class="muted" style="margin:4px 0 0;font-size:.9rem">Nenhum aluno nesta turma.</p>'}</div>`;
  }).join('')}</div>`;
  return h + '</div>';
}

export function render() {
  const todas = pessoasOrd();
  const ps = todas.filter((p) => !ehCurimba(p));   // a corrente (sem a curimba)
  const editar = pode('pessoas:editar');
  const verAlunos = pode('alunos:ver');
  if (verAlunos && estado.alunos === null) { estado.alunos = undefined; carregarAlunos(); }
  let h = `<section class="panel">`;
  if (editar || pode('alunos:editar')) h += cardAdicionar(ps);
  // Perfil que só cuida dos alunos (ex.: Admin oferendas): só o Adicionar e o bloco Alunos.
  if (!pode('pessoas:ver')) return h + (verAlunos ? cardAlunos() : '') + '</section>';
  if (!editar) h += `<p class="leitura" style="margin:0">Lista da corrente, só para consulta.</p>`;
  if (!ps.length) {
    return h + cardCurimba(todas, editar) + `<div class="card empty"><p class="muted">${editar ? 'Ninguém cadastrado ainda. Digite os nomes acima; pode colar uma lista inteira separada por vírgulas.' : 'Ninguém cadastrado ainda.'}</p></div>${verAlunos ? cardAlunos() : ''}</section>`;
  }
  // Ordem: Adicionar, Corrente, Licenças, Turmas da limpeza, funções (Médiuns, Extras, Passe, Cambones, Senha), Curimba.
  h += `<div class="card"><div class="grp-h"><h2>Corrente</h2><span class="count">${ps.length} pessoa${ps.length === 1 ? '' : 's'}</span></div>
    <div class="presentes">${ORDEM_FUNCOES.map((f) => `<span><span class="muted">${f.pl}</span> <b>${ps.filter((p) => p.funcao === f.k).length}</b></span>`).join('')}</div></div>`;
  h += cardLicencas(ps, editar);   // licença: só a corrente
  h += cardTurmas(todas);
  ORDEM_FUNCOES.forEach((f) => {
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
  if (verAlunos) h += cardAlunos();
  return h + '</section>';
}

export const cliques = {
  dobraradd() { estado.addAberto = !(estado.addAberto ?? !pessoasOrd().some((p) => !ehCurimba(p))); avisar(); },
  dobrarcurimba() { estado.curimbaAberta = !estado.curimbaAberta; avisar(); },
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
  dobraralunos() { estado.alunosAberto = !(estado.alunosAberto ?? true); avisar(); },
  dobrarturma(el) {
    const set = new Set(prefs.turmasFechadas || []);
    if (set.has(el.dataset.t)) set.delete(el.dataset.t); else set.add(el.dataset.t);
    prefs.turmasFechadas = [...set];
    salvarPrefs();
    avisar();
  },
  // "＋" ao lado da turma: cadastra uma turma nova e já deixa escolhida.
  async novaturma() {
    const nome = prompt('Nome da nova turma (ex.: Turma 12):');
    if (nome === null) return;
    const n = nome.replace(/\s+/g, ' ').trim();
    if (!n) { toast('Digite o nome da turma.'); return; }
    estado.addRascunho = document.getElementById('f-nome')?.value || '';
    const r = await acaoAlunos('turma', { nome: n });
    const t = r && r.turmas.find((x) => x.nome.toLowerCase() === n.toLowerCase());
    if (t) { estado.turmaSel = t.id; toast(`${t.nome} criada.`); avisar(); }
  },
  async renaluno(el) {
    const a = (estado.alunos?.alunos || []).find((x) => x.id === el.dataset.id);
    if (!a) return;
    const nome = prompt('Nome do aluno:', a.nome);
    if (nome === null) return;
    const n = nome.replace(/\s+/g, ' ').trim();
    if (!n || n === a.nome) return;
    if (await acaoAlunos('aluno', { id: a.id, nome: n })) toast('Nome alterado.');
  },
  delaluno(el) { estado.confirm = null; acaoAlunos('excluirAluno', { id: el.dataset.id }); },
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
  // Função "Aluno" no Adicionar: mostra a turma (sem redesenhar, para não perder o que foi digitado).
  funcnova(t) {
    prefs.lastFunc = t.value;
    salvarPrefs();
    const campo = document.getElementById('f-turma-campo');
    if (campo) campo.hidden = t.value !== ALUNO;
  },
  turmasel(t) { estado.turmaSel = t.value; },
  turmaaluno(t) { acaoAlunos('aluno', { id: t.dataset.id, turmaId: t.value }); },
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
  estado.addRascunho = inp.value;   // se der erro, o que foi digitado continua lá
  if (funcao === ALUNO) {
    const turmaId = document.getElementById('f-turma').value;
    estado.turmaSel = turmaId;
    const r = await acaoAlunos('alunos', { nome: inp.value, turmaId });
    if (!r) return;
    estado.addRascunho = '';
    const t = r.turmas.find((x) => x.id === turmaId);
    toast(r.criadas ? `${r.criadas} aluno${r.criadas > 1 ? 's' : ''} na ${t ? t.nome : 'turma'}.` : 'Esses alunos já estão cadastrados.');
    const novo = document.getElementById('f-nome');
    if (novo) { novo.value = ''; novo.focus(); }
    return;
  }
  try {
    const n = await adicionarPessoas(inp.value, funcao);
    estado.addRascunho = '';
    const label = FUNCOES.find((f) => f.k === funcao).label;
    toast(n ? `${n} adicionada${n > 1 ? 's' : ''} como ${label}.` : 'Esses nomes já estão cadastrados.');
    const novo = document.getElementById('f-nome');
    if (novo) { novo.value = ''; novo.focus(); }
  } catch (e) { toast(e.message); avisar(); }
}
