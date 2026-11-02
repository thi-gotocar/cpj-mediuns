// Aba Curimba: controle à parte da corrente (root e Admin curimba).
// Alunos (da corrente ou de fora), aulas, presença de cada aula e o gráfico de presença por aluno.
// Único ponto em comum com o resto do app: o aluno que é da corrente vê as próprias aulas na aba Gira.

import { lerDataCurta, dataCurta } from '/shared/eventos.js';
import { estado, pode, pessoasOrd, carregarCurimba, acaoCurimba, avisar } from '../estado.js';
import { esc, toast, hoje, wd, ajustarRolagem } from '../util.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const STATUS = [['p', 'Presente'], ['f', 'Falta']];
const U = () => (estado.curUi ||= { novoAluno: false, modo: 'corrente', novaAula: false, editar: null, lista: false, meses: new Set(), aula: null, graficos: false, abertos: new Set(), confirmar: null });
const dia = (d) => `${wd(d).replace(/^./, (c) => c.toUpperCase())} ${dataCurta(d)}`;
const cabDobra = (act, titulo, count, aberto) => `<button class="grp-h dobra" data-act="${act}" aria-expanded="${aberto}"><h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
// Verde a partir de 90%, amarelo de 50% a 89%, vermelho abaixo de 50% (como "Sua presença" da aba Gira).
export const corDaFaixa = (pct) => (pct >= 90 ? 'ok' : pct >= 50 ? 'medio' : 'baixo');

function statusDe(C) {
  const m = new Map();
  C.presencas.forEach((x) => m.set(x.aulaId + ':' + x.alunoId, x.status));
  return (aulaId, alunoId) => m.get(aulaId + ':' + alunoId) || '';
}

// Aula aberta no bloco Presença: a escolhida; senão a mais recente até hoje; senão a primeira que vem.
function aulaAtual(aulas) {
  const u = U();
  if (aulas.some((a) => a.id === u.aula)) return aulas.find((a) => a.id === u.aula);
  const hj = hoje();
  return [...aulas].reverse().find((a) => a.data <= hj) || aulas[0] || null;
}

// ---------- alunos ----------
function cardAlunos(C, editar) {
  const u = U();
  let h = `<div class="card cur-alunos"><div class="grp-h"><h2>🥁 Alunos de curimba</h2><span class="count">${C.alunos.length}</span>
    ${editar ? `<button class="btn small cur-mais" data-act="curnovo" aria-expanded="${u.novoAluno}" title="Cadastrar aluno" aria-label="Cadastrar aluno">${u.novoAluno ? '✕' : '＋'}</button>` : ''}</div>`;
  if (editar && u.novoAluno) {
    const ja = new Set(C.alunos.map((a) => a.pessoaId).filter(Boolean));
    const ps = pessoasOrd().filter((p) => !ja.has(p.id));
    h += `<div class="cur-novo"><div class="seg" role="group" aria-label="Quem é o aluno">${[['corrente', 'Da corrente'], ['fora', 'De fora']].map(([k, t]) => `<button data-act="curmodo" data-v="${k}" aria-pressed="${u.modo === k}">${t}</button>`).join('')}</div>
      <form id="f-cur-aluno" class="row" autocomplete="off">${u.modo === 'corrente'
        ? `<label class="field grow">Pessoa da corrente<select name="pessoa"><option value="">— escolha —</option>${ps.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>`
        : '<label class="field grow">Nome<input type="text" name="nome" id="cur-nome" maxlength="80" placeholder="Nome de quem ainda não tem cadastro"></label>'}
      <button class="btn primary" type="submit">Adicionar</button></form>
      <p class="muted" style="margin:0;font-size:.82rem">${u.modo === 'corrente' ? 'O aluno da corrente vê as próprias aulas na aba Gira.' : 'Quem é de fora fica só aqui na aba Curimba (não entra na corrente).'}</p></div>`;
  }
  if (!C.alunos.length) return h + '<p class="muted" style="margin:0">Nenhum aluno cadastrado.</p></div>';
  setTimeout(ajustarRolagem, 0);
  return h + `<div class="cur-lista" data-rolar="5">${C.alunos.map((a) => `<div class="cur-al"><span class="cur-nm">${esc(a.nome)}</span>
    <span class="cur-tag${a.pessoaId ? ' cor' : ''}">${a.pessoaId ? 'Corrente' : 'De fora'}</span>
    ${editar ? `<button class="btn small" data-act="curexcluir" data-tipo="aluno" data-id="${a.id}" title="Excluir aluno" aria-label="Excluir ${esc(a.nome)}">🗑️</button>` : ''}</div>`).join('')}</div></div>`;
}

// ---------- aulas (cadastro e lista por mês, como os eventos da aba Gira, mas com dados próprios) ----------
function linhaAula(a, editar) {
  if (editar && U().editar === a.id) {
    return `<form id="f-cur-aula-ed" class="ev-form" data-id="${a.id}" autocomplete="off">
      <label class="field ev-data">Data<input type="text" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required value="${dataCurta(a.data)}/${a.data.slice(0, 4)}"></label>
      <label class="field grow">Nome (opcional)<input type="text" name="nome" maxlength="120" value="${esc(a.nome)}"></label>
      <span class="row ev-bts"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="curaulacancelar">Cancelar</button></span></form>`;
  }
  return `<div class="ev-l${a.data === hoje() ? ' hoje' : ''}"><span class="ev-dia">${dia(a.data)}</span><span class="ev-nome">${esc(a.nome) || '<span class="muted">Aula</span>'}</span>
    ${editar ? `<span class="ev-acts"><button class="btn small" data-act="curaulaeditar" data-id="${a.id}">Editar</button><button class="btn small" data-act="curexcluir" data-tipo="aula" data-id="${a.id}">Excluir</button></span>` : ''}</div>`;
}

function blocoMes(chave, lista, editar) {
  const [a, m] = chave.split('-');
  const aberto = U().meses.has(chave);
  return `<div class="ev-mes"><button class="ev-mes-h dobra" data-act="curmes" data-k="${chave}" aria-expanded="${aberto}"><b>${MESES[Number(m) - 1]}</b> <span class="muted ev-ano">${a}</span><span class="count">${lista.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
    ${aberto ? `<div class="ev-lista">${lista.map((x) => linhaAula(x, editar)).join('')}</div>` : ''}</div>`;
}

function cardAulas(C, editar) {
  const u = U();
  let h = '<div class="card adm ev-grupo"><h2><span aria-hidden="true">🗓️</span> Aulas - curimba</h2>';
  if (editar) {
    h += `<div class="card adm">${cabDobra('curaulanova', '＋ Cadastrar aula', '', u.novaAula)}
      ${u.novaAula ? `<form id="f-cur-aula" class="ev-form" autocomplete="off">
        <label class="field ev-data">Data<input type="text" id="cur-aula-data" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required placeholder="31/10"></label>
        <label class="field grow">Nome (opcional)<input type="text" id="cur-aula-nome" name="nome" maxlength="120" placeholder="Ex.: Toques de Ogum"></label>
        <span class="row ev-bts"><button class="btn primary" type="submit">Cadastrar</button></span></form>
        <p class="muted" style="margin:0;font-size:.82rem">Uma aula por dia. Digite só dia e mês (3110 vira 31/10). Se a data deste ano já passou há mais de 2 meses, fica para o ano que vem; para outro ano, continue digitando o ano (31/10/2025).</p>` : ''}</div>`;
  }
  h += `<div class="card">${cabDobra('curaulas', '📅 Aulas cadastradas', C.aulas.length, u.lista)}`;
  if (u.lista) {
    if (!C.aulas.length) h += '<p class="muted" style="margin:0">Nenhuma aula cadastrada.</p>';
    else {
      // Do mês mais recente para o mais antigo: as aulas que passaram são o histórico.
      const porMes = {};
      C.aulas.forEach((a) => { (porMes[a.data.slice(0, 7)] ||= []).push(a); });
      setTimeout(ajustarRolagem, 0);
      h += `<div class="rolar3" data-rolar="3">${Object.keys(porMes).sort().reverse().map((k) => blocoMes(k, porMes[k], editar)).join('')}</div>`;
    }
  }
  return h + '</div></div>';
}

// ---------- presença da aula ----------
function cardPresenca(C, editar) {
  const aula = aulaAtual(C.aulas);
  let h = '<div class="card cur-pres"><h2>📋 Presença da aula</h2>';
  if (!aula) return h + '<p class="muted" style="margin:0">Cadastre uma aula em Aulas - curimba.</p></div>';
  const st = statusDe(C);
  const datas = [...C.aulas].reverse();
  h += `<label class="field">Data da aula<select data-act="curaula">${datas.map((a) => `<option value="${a.id}" ${a.id === aula.id ? 'selected' : ''}>${dia(a.data)}/${a.data.slice(0, 4)}${a.nome ? ' · ' + esc(a.nome) : ''}</option>`).join('')}</select></label>`;
  if (!C.alunos.length) return h + '<p class="muted" style="margin:0">Nenhum aluno cadastrado.</p></div>';
  const n = { p: 0, f: 0 };
  C.alunos.forEach((a) => { const s = st(aula.id, a.id); if (s) n[s]++; });
  h += `<p class="muted cur-cont">${n.p} presente${n.p === 1 ? '' : 's'} · ${n.f} falta${n.f === 1 ? '' : 's'} · ${C.alunos.length - n.p - n.f} sem marcação</p>`;
  return h + `<div class="cur-lista">${C.alunos.map((a) => {
    const s = st(aula.id, a.id);
    const ctl = editar
      ? `<select class="cur-st ${s}" data-act="curpres" data-aluno="${a.id}" aria-label="Presença de ${esc(a.nome)}"><option value="" ${s ? '' : 'selected'}>—</option>${STATUS.map(([k, l]) => `<option value="${k}" ${k === s ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : `<span class="mp-st ${s || 'nada'}">${s === 'p' ? 'Presente' : s === 'f' ? 'Falta' : '—'}</span>`;
    return `<div class="cur-al"><span class="cur-nm">${esc(a.nome)}</span>${ctl}</div>`;
  }).join('')}</div></div>`;
}

// ---------- gráficos: % de presença por aluno; tocar no nome abre as aulas ----------
function cardGraficos(C) {
  const u = U();
  let h = `<div class="card cur-gr">${cabDobra('curgraficos', '📊 Gráficos', '', u.graficos)}`;
  if (!u.graficos) return h + '</div>';
  if (!C.alunos.length) return h + '<p class="muted" style="margin:0">Nenhum aluno cadastrado.</p></div>';
  const st = statusDe(C);
  h += '<p class="muted" style="margin:0;font-size:.82rem">Presença sobre as aulas marcadas (aula sem marcação não conta). Toque no nome para ver as aulas.</p>';
  return h + C.alunos.map((a) => {
    const marcadas = [...C.aulas].reverse().map((x) => [x, st(x.id, a.id)]).filter(([, s]) => s);
    const pres = marcadas.filter(([, s]) => s === 'p').length;
    const pct = marcadas.length ? Math.round((pres / marcadas.length) * 100) : null;
    const cor = pct == null ? '' : corDaFaixa(pct);
    const aberto = u.abertos.has(a.id);
    let r = `<div class="cur-gr-l"><button class="cur-gr-nome" data-act="curdetalhe" data-id="${a.id}" aria-expanded="${aberto}"><span class="cur-nm">${esc(a.nome)}</span>
      <span class="cur-gr-pct ${cor}">${pct == null ? '<span class="muted">sem aulas</span>' : `<b>${pct}%</b> <span class="muted">${pres} de ${marcadas.length}</span>`}</span></button>
      <div class="mp-barra ${cor}"><span style="width:${pct || 0}%"></span></div>`;
    if (aberto) {
      r += `<div class="cur-det">${marcadas.length ? marcadas.map(([x, s]) => `<div class="mp-l"><span class="mp-dia">${dataCurta(x.data)}</span><span class="mp-gira">${esc(x.nome) || 'Aula'}</span><span class="mp-st ${s}">${s === 'p' ? 'Presente' : 'Ausente'}</span></div>`).join('') : '<p class="muted" style="margin:0">Nenhuma aula marcada.</p>'}
        <button class="btn small" data-act="curdetalhe" data-id="${a.id}">▴ Recolher</button></div>`;
    }
    return r + '</div>';
  }).join('') + '</div>';
}

// ---------- confirmações (janela) ----------
function janela() {
  const x = U().confirmar;
  const C = estado.curimba;
  if (!x || !C) return '';
  let titulo, texto, ok = 'Confirmar';
  if (x.tipo === 'pres') {
    const a = C.alunos.find((y) => y.id === x.alunoId);
    const au = C.aulas.find((y) => y.id === x.aulaId);
    if (!a || !au) return '';
    titulo = 'Mudar a presença';
    texto = x.status
      ? `Marcar <b>${esc(a.nome)}</b> como <b>${x.status === 'p' ? 'Presente' : 'Falta'}</b> na aula de ${dia(au.data)}?`
      : `Tirar a marcação de <b>${esc(a.nome)}</b> na aula de ${dia(au.data)}?`;
  } else if (x.tipo === 'aluno') {
    const a = C.alunos.find((y) => y.id === x.id);
    if (!a) return '';
    titulo = 'Excluir aluno'; ok = 'Excluir';
    texto = `Excluir <b>${esc(a.nome)}</b> dos alunos de curimba? As presenças e faltas dele também saem.`;
  } else {
    const au = C.aulas.find((y) => y.id === x.id);
    if (!au) return '';
    titulo = 'Excluir aula'; ok = 'Excluir';
    texto = `Excluir a aula de <b>${dia(au.data)}/${au.data.slice(0, 4)}</b>? As presenças e faltas desta aula também saem.`;
  }
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="cur-t"><div class="modal">
    <h3 id="cur-t">${titulo}</h3><p style="margin:0">${texto}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="curcancelar">Cancelar</button><button class="btn ${x.tipo === 'pres' ? 'primary' : 'danger'}" data-act="curok">${ok}</button></div>
  </div></div>`;
}

export function render() {
  const C = estado.curimba;
  if (C === null) { estado.curimba = undefined; carregarCurimba(); }
  if (!C) return '<section class="panel"><div class="loading">Carregando a curimba…</div></section>';
  const editar = pode('curimba:editar');
  return `<section class="panel">${cardAlunos(C, editar)}${cardAulas(C, editar)}${cardPresenca(C, editar)}${cardGraficos(C)}${janela()}</section>`;
}

const alternar = (k) => { U()[k] = !U()[k]; avisar(); };

export const cliques = {
  curnovo() { alternar('novoAluno'); if (U().novoAluno && U().modo === 'fora') document.getElementById('cur-nome')?.focus(); },
  curmodo(el) { U().modo = el.dataset.v; avisar(); if (U().modo === 'fora') document.getElementById('cur-nome')?.focus(); },
  curaulanova() { alternar('novaAula'); if (U().novaAula) document.getElementById('cur-aula-data')?.focus(); },
  curaulas() { alternar('lista'); },
  curmes(el) { const s = U().meses; if (s.has(el.dataset.k)) s.delete(el.dataset.k); else s.add(el.dataset.k); avisar(); },
  curaulaeditar(el) { U().editar = el.dataset.id; avisar(); },
  curaulacancelar() { U().editar = null; avisar(); },
  curgraficos() { alternar('graficos'); },
  curdetalhe(el) { const s = U().abertos; if (s.has(el.dataset.id)) s.delete(el.dataset.id); else s.add(el.dataset.id); avisar(); },
  curexcluir(el) { U().confirmar = { tipo: el.dataset.tipo, id: el.dataset.id }; avisar(); },
  // Cancelar volta o combo para o que estava gravado.
  curcancelar() { U().confirmar = null; avisar(); },
  async curok() {
    const x = U().confirmar;
    U().confirmar = null;
    if (!x) return;
    if (x.tipo === 'pres') {
      if (await acaoCurimba('curimbaPresenca', { aulaId: x.aulaId, alunoId: x.alunoId, status: x.status })) toast('Presença salva.');
    } else if (x.tipo === 'aluno') {
      if (await acaoCurimba('curimbaExcluirAluno', { id: x.id })) toast('Aluno excluído.');
    } else if (await acaoCurimba('curimbaExcluirAula', { id: x.id })) {
      if (U().aula === x.id) U().aula = null;
      toast('Aula excluída.');
    }
  },
};

export const mudancas = {
  curaula(el) { U().aula = el.value; avisar(); },
  // Toda mudança de presença pede confirmação antes de gravar.
  curpres(el) {
    const aula = aulaAtual(estado.curimba?.aulas || []);
    if (!aula) return;
    U().confirmar = { tipo: 'pres', aulaId: aula.id, alunoId: el.dataset.aluno, status: el.value };
    avisar();
  },
};

// Formulário do ＋: aluno da corrente (pessoa) ou de fora (nome).
export async function enviarAluno(form) {
  const u = U();
  let dados;
  if (u.modo === 'corrente') {
    const pessoaId = form.elements.pessoa.value;
    if (!pessoaId) { toast('Escolha a pessoa da corrente.'); return; }
    dados = { pessoaId };
  } else {
    const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
    if (!nome) { toast('Digite o nome do aluno.'); form.elements.nome.focus(); return; }
    dados = { nome };
  }
  if (await acaoCurimba('curimbaAluno', dados)) {
    toast('Aluno cadastrado.');
    if (u.modo === 'fora') document.getElementById('cur-nome')?.focus();
  }
}

// Cadastrar (f-cur-aula) ou salvar a edição (f-cur-aula-ed).
export async function enviarAula(form) {
  const data = lerDataCurta(form.elements.data.value, hoje());
  const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
  if (!data) { toast('Data inválida. Use o formato 31/10.'); form.elements.data.focus(); return; }
  const id = form.dataset.id || '';
  if (!(await acaoCurimba('curimbaAula', { id, data, nome }))) return;
  if (id) { U().editar = null; toast('Aula alterada.'); avisar(); return; }
  toast(`Aula cadastrada para ${dataCurta(data)}/${data.slice(0, 4)}.`);
  // A aula nova já fica escolhida no bloco Presença.
  U().aula = estado.curimba.aulas.find((a) => a.data === data)?.id || U().aula;
  avisar();
  const d = document.getElementById('cur-aula-data');
  if (d) d.focus();
}
