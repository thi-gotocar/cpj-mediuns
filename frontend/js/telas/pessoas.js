// Tela "Pessoas": cadastro da corrente e dos alunos da CPJ (por turma).

import { FUNCOES, LINHAS_CADASTRO, LINHA_LABEL, LINHA_KEYS, TURMAS_LIMPEZA, CURIMBA, ehCurimba } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, salvarLicenca, editarLicenca, removerLicenca, carregarAlunos, acaoAlunos, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';

// Ordem das funções exibidas nos totais da Corrente CPJ.
const ORDEM_FUNCOES = ['medium', 'extra', 'passe', 'cambone', 'senha'].map((k) => FUNCOES.find((f) => f.k === k)).filter(Boolean);
const cabDobra = (act, titulo, count, aberto) => `<button class="grp-h dobra" data-act="${act}" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'}">
  <h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;

const dBR = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Licenças em vigor ou futuras (as que já terminaram saem da lista sozinhas), dentro do card da Corrente.
// Cada uma num mini bloco: cruz vermelha, nome, datas e Editar; embaixo, o motivo.
function listaLicencas(ps, editar) {
  const hj = hoje();
  const lics = ps.flatMap((p) => (p.licencas || []).filter((l) => l.fim >= hj).map((l) => ({ ...l, pessoa: p })))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
  if (!lics.length) return '';
  return `<div class="lic-lista">${lics.map((l) => {
    if (editar && estado.editLic === l.id) {
      return `<div class="lic-mini lic-ed"><div class="lic-l1"><span class="cruz-vermelha" aria-hidden="true">✚</span><span class="nm">${esc(l.pessoa.nome)}</span></div>
        <div class="row"><label class="field" style="flex:1 1 130px">Início<input type="date" id="el-i" value="${l.inicio}"></label>
        <label class="field" style="flex:1 1 130px">Fim<input type="date" id="el-f" value="${l.fim}"></label>
        <label class="field" style="flex:2 1 200px">Motivo<input type="text" id="el-m" maxlength="200" value="${esc(l.motivo || '')}"></label></div>
        <div class="row"><button class="btn small primary" data-act="salvarlic" data-id="${l.id}">Salvar</button><button class="btn small" data-act="cancelarlic">Cancelar</button>
          <button class="btn small" data-act="excluirask" data-tipo="lic" data-id="${l.id}">Remover</button></div></div>`;
    }
    return `<div class="lic-mini"><div class="lic-l1"><span class="cruz-vermelha" aria-hidden="true">✚</span><span class="lic-txt"><span class="nm">${esc(l.pessoa.nome)}</span> <span class="lic-datas">${dBR(l.inicio)} a ${dBR(l.fim)}</span></span>
        ${editar ? `<button class="btn small pp-bt" data-act="editlic" data-id="${l.id}">Editar</button>` : ''}</div>
      ${l.motivo ? `<div class="lic-mot muted">${esc(l.motivo)}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

// Adicionar → Licença: ao escolher a pessoa, o histórico de todas as licenças dela (uma por linha), com Editar.
function historicoLicencas(p) {
  if (!p) return '';
  const lics = [...(p.licencas || [])].sort((a, b) => b.inicio.localeCompare(a.inicio));
  const hj = hoje();
  return `<div class="lic-hist"><div class="grp-h"><h3>Histórico de licenças · ${esc(p.nome)}</h3><span class="count">${lics.length}</span></div>
    ${lics.length ? lics.map((l) => {
      if (estado.editLicH === l.id) {
        return `<div class="lic-h-l lic-ed"><div class="lic-datas-f"><label class="field">Início<input type="date" id="elh-i" value="${l.inicio}"></label>
          <label class="field">Fim<input type="date" id="elh-f" value="${l.fim}"></label></div>
          <label class="field">Motivo<input type="text" id="elh-m" maxlength="200" value="${esc(l.motivo || '')}"></label>
          <div class="row"><button class="btn small primary" type="button" data-act="salvarlich" data-id="${l.id}">Salvar</button><button class="btn small" type="button" data-act="cancelarlich">Cancelar</button>
            <button class="btn small" type="button" data-act="excluirask" data-tipo="lic" data-id="${l.id}">Remover</button></div></div>`;
      }
      const sit = l.fim < hj ? '' : l.inicio <= hj ? ' <span class="badge lic">em andamento</span>' : ' <span class="badge rep">futura</span>';
      return `<div class="lic-h-l"><span class="lic-h-t"><b>${dBR(l.inicio)} a ${dBR(l.fim)}</b>${sit}${l.motivo ? `<span class="muted"> · ${esc(l.motivo)}</span>` : ''}</span>
        <button class="btn small pp-bt" type="button" data-act="editlich" data-id="${l.id}">Editar</button></div>`;
    }).join('') : '<p class="muted" style="margin:0;font-size:.88rem">Nenhuma licença registrada.</p>'}</div>`;
}

// Guarda o que já foi digitado no cadastro de licença antes de redesenhar.
function guardarRascunhoLic() {
  const i = document.getElementById('lic-i');
  if (i) estado.licRasc = { i: i.value, f: document.getElementById('lic-f')?.value || '', m: document.getElementById('lic-m')?.value || '' };
}

// Quem é de cada turma da limpeza (para conferir de uma vez).
function cardTurmas(todas, editar) {
  const com = todas.filter((p) => p.limpeza);
  const curimba = cardCurimba(todas, editar);
  if (!com.length && !curimba) return '';
  const aberto = estado.turmasAbertas ? ' open' : '';
  return `<div class="card pp-card fn-limpeza"><details class="turmas-d"${aberto}><summary class="grp-h turmas-cab"><h2>🧹 Turmas da limpeza</h2><span class="count">${com.length} de ${todas.length}</span></summary>
    <div class="turmas-conteudo">${curimba}<div class="turmas">${TURMAS_LIMPEZA.map((t) => {
      const nomes = todas.filter((p) => Number(p.limpeza) === t).map((p) => esc(p.nome) + (ehCurimba(p) ? ' 🥁' : ''));
      return `<div class="turma-l"><span class="turma-n" aria-hidden="true">${t}</span><div class="turma-info"><div class="turma-cab"><b>Turma ${t}</b><span class="turma-count">${nomes.length} ${nomes.length === 1 ? 'pessoa' : 'pessoas'}</span></div><div class="turma-nomes">${nomes.length ? nomes.join(', ') : '<span class="muted">Ninguém nesta turma</span>'}</div></div></div>`;
    }).join('')}
    ${todas.length > com.length ? `<div class="turma-sem">${todas.length - com.length} ${todas.length - com.length === 1 ? 'pessoa sem turma' : 'pessoas sem turma'}</div>` : ''}</div></div></details></div>`;
}

const nomeFuncao = (p) => (p.funcao === 'extra' ? 'at. extra' : 'médium de passe');

// Escolhas de entidades de cada função, nesta ordem:
// "linhas": as do cadastro (valem no sorteio; nenhuma marcada = em todas as giras).
// "afinidadePasse" / "afinidadeExtra": as mesmas do Perfil (100% de afinidade e segurança).
const CAMPOS_LINHAS = { extra: ['linhas', 'afinidadePasse'], passe: ['linhas', 'afinidadeExtra'], cambone: ['afinidadePasse'] };
const NOME_CAMPO = { afinidadePasse: 'médium de passe', afinidadeExtra: 'atendimento extra' };
const camposDe = (p) => CAMPOS_LINHAS[p.funcao] || [];
// "Todas" = todas as entidades marcadas. Nenhuma marcada = não está apto a nenhuma.
const todasMarcadas = (c, ls) => LINHA_KEYS.every((k) => ls.includes(k));
const rotLinhas = (ls) => (LINHA_KEYS.every((k) => ls.includes(k)) ? 'todas as giras' : ls.map((l) => LINHA_LABEL[l] || l).join(', '));

function resumoLinhas(p) {
  return camposDe(p).map((c) => {
    const ls = p[c] || [];
    const t = c === 'linhas'
      ? (!ls.length ? `⚠️ Nenhuma marcada: não atua como ${nomeFuncao(p)} em nenhuma gira (cambona).`
        : todasMarcadas(c, ls) ? `Como ${nomeFuncao(p)} em todas as giras.` : `Como ${nomeFuncao(p)} em: ${rotLinhas(ls)}. Nas outras giras, cambona.`)
      : (ls.length ? `Confiante como ${NOME_CAMPO[c]} em: ${rotLinhas(ls)}.` : `Como ${NOME_CAMPO[c]}: nenhuma marcada (não apto).`);
    return `<span class="muted" style="font-size:.82rem">${t}</span>`;
  }).join('');
}

function editorLinhas(p, c) {
  const ls = p[c] || [];
  const chave = p.id + ':' + c;
  const resumo = c === 'linhas'
    ? (!ls.length ? `⚠️ Como ${nomeFuncao(p)}: nenhuma marcada (não apto) · escolher`
      : todasMarcadas(c, ls) ? `Como ${nomeFuncao(p)} em todas as giras` : `Como ${nomeFuncao(p)} em ${ls.length} linha${ls.length > 1 ? 's' : ''}: ${rotLinhas(ls)}`)
    : (ls.length ? `Confiante como ${NOME_CAMPO[c]} em: ${rotLinhas(ls)}` : `Como ${NOME_CAMPO[c]}: nenhuma marcada (não apto) · escolher`);
  const texto = c === 'linhas'
    ? `Marque as linhas em que atua como ${nomeFuncao(p)}. Nas giras das outras linhas, entra no sorteio como cambone. Marque “Todas” para atuar em todas as giras. Sem nenhuma marcada, não está apto a nenhuma: cambona em todas.`
    : `Marque as entidades em que tem 100% de afinidade e segurança como ${NOME_CAMPO[c]} (o mesmo que a pessoa marca no Perfil). Vale para a Sugestão Mi/Mãe Vê.`;
  return `<details class="linhas"${estadoAberto.has(chave) ? ' open' : ''} data-id="${chave}">
    <summary>${resumo}</summary>
    <p class="muted" style="margin:6px 0;font-size:.82rem">${texto}</p>
    <label class="chip chip-todas"><input type="checkbox" id="ln-${p.id}-${c}-todas" data-act="lnedit" data-c="${c}" data-todas="1" ${todasMarcadas(c, ls) ? 'checked' : ''}> Todas</label>
    ${LINHAS_CADASTRO.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
      `<label class="chip"><input type="checkbox" id="ln-${p.id}-${c}-${k}" data-act="lnedit" data-c="${c}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${k === 'mista' ? 'Encontro das Linhas (Mista)' : label}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}

// Uma pessoa (quem edita): linha 1 = nome, função, 🧹 turma, "+ médium de passe" e os botões ✎ (Editar) e 🗑️ (Excluir);
// depois o resumo das entidades. Nada muda fora do Editar: em Editar, nome, função, turma, "+ médium de passe"
// e as entidades ficam editáveis e só são gravados no Salvar (Cancelar descarta).
function linhaPessoa(p, { funcao = true, acoes = true } = {}) {
  const ed = estado.renomear === p.id;
  if (!ed) {
    // Linha 1: nome (quebra entre palavras se precisar), função, 🧹 turma e os botões; "+ médium de passe" na linha de baixo.
    return `<div class="pp pp2"><div class="pp-l1"><span class="nm">${esc(p.nome)}</span>
        <span class="pp-l2">${funcao ? `<span class="pp-fn">${esc(FUNCOES.find((o) => o.k === p.funcao)?.label || p.funcao)}</span>` : ''}
          <span class="pp-limp" title="Turma da limpeza">🧹 ${p.limpeza || '—'}</span></span>
        ${acoes ? `<span class="pp-bts"><button class="btn small pp-bt pp-ico" data-act="ren" data-id="${p.id}" aria-label="Editar ${esc(p.nome)}" title="Editar"><span aria-hidden="true">✎</span></button><button class="btn small pp-bt pp-ico pp-del" data-act="excluirask" data-tipo="p" data-id="${p.id}" aria-label="Excluir ${esc(p.nome)}" title="Excluir"><span aria-hidden="true">🗑️</span></button></span>` : ''}</div>
      ${p.funcao === 'medium' && p.experiente ? '<div class="pp-l3"><span class="pp-fn pp-exp-on">+ médium de passe</span></div>' : ''}
      ${camposDe(p).length ? `<div class="pp-res">${resumoLinhas(p)}</div>` : ''}</div>`;
  }
  return `<div class="pp pp2 pp-editando"><form id="f-ren" class="pp-form" data-id="${p.id}" autocomplete="off">
      <div class="pp-l1"><input type="text" id="ren-in" value="${esc(p.nome)}" maxlength="80" autocomplete="off" aria-label="Nome de ${esc(p.nome)}">
        <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelren">Cancelar</button></span></div>
      <div class="pp-l2">${funcao ? `<select id="ren-func" aria-label="Função de ${esc(p.nome)}">${FUNCOES.map((o) => `<option value="${o.k}" ${o.k === p.funcao ? 'selected' : ''}>${o.label}</option>`).join('')}</select>` : ''}
        <label class="pp-limp ed">🧹 <select class="limp-sel" id="ren-limp" aria-label="Turma da limpeza de ${esc(p.nome)}"><option value="">—</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(p.limpeza) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${p.funcao === 'medium' ? `<label class="check small pp-exp"><input type="checkbox" id="ren-exp" ${p.experiente ? 'checked' : ''}> + médium de passe</label>` : ''}</div>
      ${camposDe(p).map((c) => editorLinhas(p, c)).join('')}
    </form></div>`;
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
  let h = `<div class="card pp-card fn-curimba">${cabDobra('dobrarcurimba', '🧹 Adicionar pessoas limpeza', cs.length, aberto)}`;
  if (!aberto) return h + `</div>`;
  h += `<p class="muted" style="margin:0;font-size:.85rem">Fazem parte das turmas da limpeza, mas não contam presença nem falta e não entram no sorteio.</p>`;
  h += `<div class="ppl">${cs.map((p) => (editar ? linhaPessoa(p, { funcao: false })
    : `<div class="pp" style="grid-template-columns:minmax(0,1fr) auto"><span class="nm">${esc(p.nome)}</span>${p.limpeza ? `<span class="muted" style="font-size:.85rem">🧹 Turma ${p.limpeza}</span>` : ''}</div>`)).join('')}</div>`;
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
  if (!aberto) return `<div class="card adm">${cabDobra('dobraradd', '＋ Adicionar', '', false)}</div>`;
  let h = `<div class="card adm">${cabDobra('dobraradd', '＋ Adicionar', '', true)}
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
    const R = estado.licRasc || {};
    const sel = estado.licPessoa || '';
    h += `<form id="f-lic" class="lic-form" autocomplete="off">
      <label class="field">Pessoa<select id="lic-p" data-act="licpessoa"><option value="">— escolha —</option>${ps.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <div class="lic-datas-f"><label class="field">Início<input type="date" id="lic-i" value="${esc(R.i ?? hoje())}"></label>
      <label class="field">Fim<input type="date" id="lic-f" value="${esc(R.f || '')}"></label></div>
      <label class="field">Motivo (opcional)<input type="text" id="lic-m" maxlength="200" placeholder="Ex.: Férias, Gravidez…" value="${esc(R.m || '')}"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
      ${historicoLicencas(ps.find((p) => p.id === sel))}
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
  if (!A) return `<div class="card pp-card fn-alunos"><h2>🎓 Alunos</h2><div class="loading">Carregando alunos…</div></div>`;
  const ed = pode('alunos:editar');
  const aberto = estado.alunosAberto ?? false;   // começa minimizado
  let h = `<div class="card pp-card fn-alunos">${cabDobra('dobraralunos', '🎓 Alunos', A.alunos.length, aberto)}`;
  if (!aberto) return h + '</div>';
  const grupos = [...A.turmas.map((t) => ({ id: t.id, nome: t.nome, lista: A.alunos.filter((a) => a.turmaId === t.id) })),
    { id: '', nome: 'Sem turma', lista: A.alunos.filter((a) => !a.turmaId || !A.turmas.some((t) => t.id === a.turmaId)) }]
    .filter((g) => g.id || g.lista.length);
  const fechadas = new Set(prefs.turmasFechadas || []);
  h += `<div class="al-grupos">${grupos.map((g) => {
    const fechado = fechadas.has(g.id || 'sem');
    const cab = `<button class="grp-h dobra al-gh" data-act="dobrarturma" data-t="${g.id || 'sem'}" aria-expanded="${!fechado}"><h3>${esc(g.nome)}</h3><span class="count">${g.lista.length} <span class="seta" aria-hidden="true">${fechado ? '▸' : '▾'}</span></span></button>`;
    // Quem edita os alunos renomeia a turma (Editar → nome, Salvar / Cancelar).
    const cabTurma = !ed || !g.id ? cab
      : estado.editTurma === g.id
        ? `<form id="f-turma-ed" class="al-gh-l" data-id="${g.id}" autocomplete="off"><input type="text" id="turma-nome" value="${esc(g.nome)}" maxlength="40" aria-label="Nome da turma">
            <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelturma">Cancelar</button></span></form>`
        : `<div class="al-gh-l">${cab}<span class="pp-bts"><button class="btn small pp-bt" data-act="editturma" data-id="${g.id}" aria-label="Editar ${esc(g.nome)}">Editar</button><button class="btn small pp-bt" data-act="excluirask" data-tipo="turma" data-id="${g.id}" aria-label="Remover ${esc(g.nome)}">Remover</button></span></div>`;
    return `<div class="al-grupo">${cabTurma}
      ${fechado ? '' : g.lista.length ? `<div class="al-lista">${g.lista.map((a) => {
        if (!ed) return `<div class="al-l"><span class="nm">${esc(a.nome)}</span></div>`;
        // Editar: o nome e a turma ficam editáveis (Salvar / Cancelar).
        if (estado.editAluno === a.id) {
          return `<form id="f-aluno" class="al-l al-ed" data-id="${a.id}" autocomplete="off">
            <div class="pp-l1"><input type="text" id="al-nome" value="${esc(a.nome)}" maxlength="80" aria-label="Nome de ${esc(a.nome)}">
              <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelaluno">Cancelar</button></span></div>
            <label class="al-turma">Turma <select id="al-turma" aria-label="Turma de ${esc(a.nome)}">${!a.turmaId ? '<option value="" selected>Sem turma</option>' : ''}${A.turmas.map((t) => `<option value="${t.id}" ${t.id === a.turmaId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label></form>`;
        }
        return `<div class="al-l"><div class="pp-l1"><span class="nm">${esc(a.nome)}</span>
          <span class="pp-bts"><button class="btn small pp-bt" data-act="editaluno" data-id="${a.id}" aria-label="Editar ${esc(a.nome)}">Editar</button><button class="btn small pp-bt" data-act="excluirask" data-tipo="al" data-id="${a.id}">Excluir</button></span></div></div>`;
      }).join('')}</div>` : '<p class="muted" style="margin:4px 0 0;font-size:.9rem">Nenhum aluno nesta turma.</p>'}</div>`;
  }).join('')}</div>`;
  return h + '</div>';
}

// Janela de confirmação para excluir (pessoa, aluno ou licença) ou remover uma turma.
function janelaExcluir() {
  const x = estado.excluirPop;
  if (!x) return '';
  let titulo = '', texto = '';
  if (x.tipo === 'p') {
    const p = estado.pessoas.find((y) => y.id === x.id);
    if (!p) return '';
    titulo = 'Excluir pessoa'; texto = `Excluir <b>${esc(p.nome)}</b> da corrente? Essa ação não pode ser desfeita.`;
  } else if (x.tipo === 'al') {
    const a = (estado.alunos?.alunos || []).find((y) => y.id === x.id);
    if (!a) return '';
    titulo = 'Excluir aluno'; texto = `Excluir o aluno <b>${esc(a.nome)}</b>?`;
  } else if (x.tipo === 'turma') {
    const t = (estado.alunos?.turmas || []).find((y) => y.id === x.id);
    if (!t) return '';
    const n = (estado.alunos?.alunos || []).filter((a) => a.turmaId === x.id).length;
    titulo = 'Remover turma';
    texto = `Remover <b>${esc(t.nome)}</b>? ${n
      ? `${n} aluno${n === 1 ? '' : 's'} passar${n === 1 ? 'á' : 'ão'} para “Sem turma”; nenhum aluno será excluído.`
      : 'Nenhum aluno será excluído.'}`;
  } else {
    const p = estado.pessoas.find((y) => (y.licencas || []).some((l) => l.id === x.id));
    const l = p && p.licencas.find((y) => y.id === x.id);
    if (!l) return '';
    titulo = 'Remover licença'; texto = `Remover a licença de <b>${esc(p.nome)}</b> (${dBR(l.inicio)} a ${dBR(l.fim)})?`;
  }
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ex-t"><div class="modal">
    <h3 id="ex-t">${titulo}</h3><p style="margin:0">${texto}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="excluircancel">Cancelar</button><button class="btn danger" data-act="excluirok">Confirmar</button></div>
  </div></div>`;
}

export function render() {
  return renderPessoas().replace(/<\/section>$/, janelaExcluir() + '</section>');
}

function renderPessoas() {
  const todas = pessoasOrd();
  const ps = todas.filter((p) => !ehCurimba(p));   // a corrente (sem a curimba)
  const editar = pode('pessoas:editar');
  const verAlunos = pode('alunos:ver');
  if (verAlunos && estado.alunos === null) { estado.alunos = undefined; carregarAlunos(); }
  let h = `<section class="panel pessoas-tela">`;
  const add = editar || pode('alunos:editar') ? cardAdicionar(ps) : '';
  // Perfil que só cuida dos alunos (ex.: Admin oferendas): só o Adicionar e o bloco Alunos.
  if (!pode('pessoas:ver')) return h + add + (verAlunos ? cardAlunos() : '') + '</section>';
  if (!editar) h += `<p class="leitura" style="margin:0">Lista da corrente, só para consulta.</p>`;
  h += add;
  if (!ps.length) {
    return h + `<div class="card empty"><p class="muted">${editar ? 'Ninguém cadastrado ainda. Digite os nomes acima; pode colar uma lista inteira separada por vírgulas.' : 'Ninguém cadastrado ainda.'}</p></div>${cardTurmas(todas, editar)}${verAlunos ? cardAlunos() : ''}</section>`;
  }
  const funcaoCorrenteAberta = estado.correnteFuncaoAberta;
  const pessoasPorFuncao = Object.fromEntries(ORDEM_FUNCOES.map((f) => [f.k, ps.filter((p) => p.funcao === f.k)]));
  const correnteListaAberta = pessoasPorFuncao[funcaoCorrenteAberta]?.length ? funcaoCorrenteAberta : null;
  // Ordem: Adicionar, Corrente (com as licenças), Turmas da limpeza (com Curimba), Alunos.
  h += `<div class="card corrente-card"><div class="grp-h"><h2><span class="estrela-ouro" aria-hidden="true">★</span> CORRENTE CPJ</h2><span class="count">${ps.length} pessoa${ps.length === 1 ? '' : 's'}</span></div>
    <div class="presentes">${ORDEM_FUNCOES.map((f) => {
      const abertas = pessoasPorFuncao[f.k];
      const aberta = funcaoCorrenteAberta === f.k;
      return `<button type="button" class="fn-${f.k}${aberta ? ' selecionado' : ''}" data-act="correnteFuncao" data-f="${f.k}" aria-expanded="${aberta}" aria-label="${f.pl}: ${abertas.length} pessoas${aberta ? ', recolher lista' : ', expandir lista'}"${abertas.length ? '' : ' disabled'}><span class="muted">${f.k === 'extra' ? 'At. Extra' : f.pl}</span> <b>${abertas.length}</b></button>`;
    }).join('')}</div>
    ${correnteListaAberta ? `<div class="corrente-pessoas"><div class="ppl">${pessoasPorFuncao[correnteListaAberta].map((p) => linhaPessoa(p)).join('')}</div></div>` : ''}
    ${listaLicencas(ps, editar)}</div>`;   // licença: só a corrente
  h += cardTurmas(todas, editar);
  if (verAlunos) h += cardAlunos();
  return h + '</section>';
}

export const cliques = {
  dobraradd() { estado.addAberto = !(estado.addAberto ?? !pessoasOrd().some((p) => !ehCurimba(p))); avisar(); },
  dobrarcurimba() { estado.curimbaAberta = !estado.curimbaAberta; avisar(); },
  correnteFuncao(el) {
    estado.correnteFuncaoAberta = estado.correnteFuncaoAberta === el.dataset.f ? null : el.dataset.f;
    avisar();
  },
  // Troca o que adicionar sem abrir nenhum campo sozinho (o combo de pessoas só abre ao tocar nele).
  addmodo(el) { estado.addModo = el.dataset.v; avisar(); },
  editlich(el) { guardarRascunhoLic(); estado.editLicH = el.dataset.id; avisar(); },
  cancelarlich() { guardarRascunhoLic(); estado.editLicH = null; avisar(); },
  async salvarlich(el) {
    guardarRascunhoLic();
    const inicio = document.getElementById('elh-i').value;
    const fim = document.getElementById('elh-f').value;
    if (!inicio || !fim) { toast('Informe o início e o fim da licença.'); return; }
    if (fim < inicio) { toast('A data final é antes do início.'); return; }
    if (await editarLicenca(el.dataset.id, inicio, fim, document.getElementById('elh-m').value.trim())) { estado.editLicH = null; toast('Licença alterada.'); avisar(); }
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
  dellic(el) { estado.confirm = null; estado.editLic = null; removerLicenca(el.dataset.id); },
  // Excluir: abre a janela Confirmar / Cancelar.
  excluirask(el) { guardarRascunhoLic(); this._excluirask(el); },
  _excluirask(el) { estado.excluirPop = { tipo: el.dataset.tipo, id: el.dataset.id }; avisar(); },
  excluircancel() { estado.excluirPop = null; avisar(); },
  async excluirok() {
    const x = estado.excluirPop;
    estado.excluirPop = null;
    avisar();
    if (!x) return;
    if (x.tipo === 'p') await excluirPessoa(x.id);
    else if (x.tipo === 'al') await acaoAlunos('excluirAluno', { id: x.id });
    else if (x.tipo === 'turma') {
      estado.editTurma = null;
      if (await acaoAlunos('excluirTurma', { id: x.id })) toast('Turma removida. Os alunos foram mantidos sem turma.');
    }
    else if (x.tipo === 'lic') { estado.editLic = null; estado.editLicH = null; await removerLicenca(x.id); }
  },
  delpessoa(el) { estado.confirm = null; excluirPessoa(el.dataset.id); },
  ren(el) {
    estado.renomear = el.dataset.id;
    avisar();
  },
  cancelren() { estado.renomear = null; avisar(); },
  dobraralunos() { estado.alunosAberto = !(estado.alunosAberto ?? false); avisar(); },
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
  editaluno(el) { estado.editAluno = el.dataset.id; avisar(); document.getElementById('al-nome')?.focus(); },
  cancelaluno() { estado.editAluno = null; avisar(); },
  editturma(el) { estado.editTurma = el.dataset.id; avisar(); document.getElementById('turma-nome')?.select(); },
  cancelturma() { estado.editTurma = null; avisar(); },
  delaluno(el) { estado.confirm = null; acaoAlunos('excluirAluno', { id: el.dataset.id }); },
};

// Salva o nome editado (Enter ou "Salvar").
export async function renomear(form) {
  const id = form.dataset.id;
  const novo = document.getElementById('ren-in').value.trim().replace(/\s+/g, ' ');
  const sel = document.getElementById('ren-limp');
  const fn = document.getElementById('ren-func');
  const exp = document.getElementById('ren-exp');
  const p = estado.pessoas.find((x) => x.id === id);
  if (!novo) { toast('Digite o nome.'); return; }
  if (!p) { estado.renomear = null; avisar(); return; }
  const patch = {};
  if (novo !== p.nome) {
    if (estado.pessoas.some((x) => x.id !== id && x.nome.toLowerCase() === novo.toLowerCase())) { toast('Já existe um cadastro com esse nome.'); return; }
    patch.nome = novo;
  }
  const turma = sel && sel.value ? Number(sel.value) : null;
  if (sel && turma !== (p.limpeza ? Number(p.limpeza) : null)) patch.limpeza = turma;
  if (fn && fn.value !== p.funcao) patch.funcao = fn.value;
  if (exp && exp.checked !== !!p.experiente) patch.experiente = exp.checked;
  // Entidades marcadas em cada escolha (Todas / linhas).
  camposDe(p).forEach((c) => {
    const ls = [...form.querySelectorAll(`input[data-act="lnedit"][data-c="${c}"][data-l]:checked`)].map((i) => i.dataset.l).sort();
    if (ls.join() !== [...(p[c] || [])].sort().join()) patch[c] = ls;
  });
  estado.renomear = null;
  if (!Object.keys(patch).length) { avisar(); return; }
  await atualizarPessoa(id, patch);
  toast('Alterações salvas.');
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
  licpessoa(t) { guardarRascunhoLic(); estado.licPessoa = t.value; estado.editLicH = null; avisar(); },
  exp(t) { atualizarPessoa(t.dataset.id, { experiente: t.checked }); },
  func(t) { atualizarPessoa(t.dataset.id, { funcao: t.value }); },
  limpeza(t) { atualizarPessoa(t.dataset.id, { limpeza: t.value ? Number(t.value) : null }); },
  // Em Editar: marca/desmarca na tela (grava só no Salvar). "Todas" marca ou desmarca todas da mesma escolha.
  lnedit(t) {
    const box = t.closest('details');
    if (!box) return;
    const itens = [...box.querySelectorAll(`input[data-act="lnedit"][data-c="${t.dataset.c}"][data-l]`)];
    const todas = box.querySelector(`input[data-act="lnedit"][data-c="${t.dataset.c}"][data-todas]`);
    if (t.dataset.todas) itens.forEach((i) => { i.checked = t.checked; });
    else if (todas) todas.checked = itens.every((i) => i.checked);
  },
  linhatodas(t) {
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (!p) return;
    const c = t.dataset.c;
    atualizarPessoa(p.id, { [c]: t.checked ? [...LINHA_KEYS].sort() : [] });
  },
  linha(t) {
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (!p) return;
    const c = t.dataset.c || 'linhas';
    const atuais = new Set(p[c] || []);
    if (t.checked) atuais.add(t.dataset.l); else atuais.delete(t.dataset.l);
    atualizarPessoa(p.id, { [c]: [...atuais].sort() });
  },
};

export async function enviarLicenca() {
  const pessoa = document.getElementById('lic-p').value;
  const inicio = document.getElementById('lic-i').value;
  const fim = document.getElementById('lic-f').value;
  if (!pessoa) { toast('Escolha a pessoa.'); return; }
  if (!inicio || !fim) { toast('Informe o início e o fim da licença.'); return; }
  if (fim < inicio) { toast('A data final é antes do início.'); return; }
  guardarRascunhoLic();
  estado.licPessoa = pessoa;
  if (await salvarLicenca(pessoa, inicio, fim, document.getElementById('lic-m').value.trim())) { estado.licRasc = null; toast('Licença cadastrada.'); avisar(); }
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

// Aluno em Editar: salva o nome e a turma.
export async function salvarAluno(form) {
  const id = form.dataset.id;
  const a = (estado.alunos?.alunos || []).find((x) => x.id === id);
  const nome = document.getElementById('al-nome').value.replace(/\s+/g, ' ').trim();
  const turmaId = document.getElementById('al-turma').value;
  if (!nome) { toast('Digite o nome.'); return; }
  const patch = {};
  if (!a || nome !== a.nome) patch.nome = nome;
  if (!a || turmaId !== (a.turmaId || '')) patch.turmaId = turmaId;
  estado.editAluno = null;
  if (!Object.keys(patch).length) { avisar(); return; }
  if (await acaoAlunos('aluno', { id, ...patch })) toast('Aluno alterado.');
}

// Turma em Editar: salva o novo nome.
export async function salvarTurma(form) {
  const id = form.dataset.id;
  const t = (estado.alunos?.turmas || []).find((x) => x.id === id);
  const nome = document.getElementById('turma-nome').value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome da turma.'); return; }
  if (t && nome === t.nome) { estado.editTurma = null; avisar(); return; }
  if (await acaoAlunos('turma', { id, nome })) { estado.editTurma = null; toast('Turma renomeada.'); avisar(); }
}
