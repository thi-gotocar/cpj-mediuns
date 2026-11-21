// Tela "Pessoas": cadastro da corrente e dos alunos da CPJ (por turma).

import { FUNCOES, LINHAS_CADASTRO, LINHA_LABEL, LINHA_KEYS, TURMAS_LIMPEZA, CURIMBA, ehCurimba } from '/shared/regras.js';
import { config } from '/shared/config.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, adicionarPessoas, atualizarPessoa, excluirPessoa, salvarLicenca, editarLicenca, removerLicenca, carregarAlunos, acaoAlunos, revelarCpfAluno, acaoUsuarios, avisar } from '../estado.js';
import { esc, toast, hoje, dDM } from '../util.js';
import { PIN_NOVO, PIN_NOVO_MSG } from '/shared/permissoes.js';
import { cardOferendasPendentes, cliques as cliquesPerfil } from './perfil.js';
import { ICONE_WHATS } from './giraComum.js';
import { camposAluno, cardAlunos, cardCadastrosLogin, confirmarPromover } from './pessoasAlunos.js';
// O main.js chama estes pela tela Pessoas (envio dos formulários): continuam saindo daqui.
export { salvarDadosCadastro, salvarAluno, salvarTurma, salvarAlunosTurma } from './pessoasAlunos.js';

// Ordem das funções exibidas nos totais da Corrente CPJ.
const ORDEM_FUNCOES = ['medium', 'extra', 'passe', 'cambone', 'senha'].map((k) => FUNCOES.find((f) => f.k === k)).filter(Boolean);
// Quadradinhos da Corrente: as funções e, por último, a curimba (cadastrada na corrente, fora do sorteio e do total).
const QUADROS_CORRENTE = [...ORDEM_FUNCOES, { k: CURIMBA, pl: 'Curimba' }];
export const cabDobra = (act, titulo, count, aberto) => `<button class="grp-h dobra" data-act="${act}" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'}">
  <h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;

export const dBR = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// Licenças em vigor ou futuras (as que já terminaram saem da lista sozinhas), dentro do card da Corrente.
// Cada uma num mini bloco: cruz vermelha, nome, datas e Editar; embaixo, o motivo.
// Licença não mexe em gira encerrada (ela guarda o retrato de como estava ao encerrar).

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
          <button class="btn small danger" data-act="excluirask" data-tipo="lic" data-id="${l.id}">Remover</button></div></div>`;
    }
    return `<div class="lic-mini"><div class="lic-l1"><span class="cruz-vermelha" aria-hidden="true">✚</span><span class="lic-txt"><span class="nm">${esc(l.pessoa.nome)}</span> <span class="lic-datas">${dBR(l.inicio)} a ${dBR(l.fim)}</span></span>
        ${editar ? `<button class="btn small pp-ico" data-act="editlic" data-id="${l.id}" aria-label="Editar licença de ${esc(l.pessoa.nome)}" title="Editar"><span aria-hidden="true">✎</span></button>` : ''}</div>
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
            <button class="btn small danger" type="button" data-act="excluirask" data-tipo="lic" data-id="${l.id}">Remover</button></div></div>`;
      }
      const sit = l.fim < hj ? '' : l.inicio <= hj ? ' <span class="badge lic">em andamento</span>' : ' <span class="badge rep">futura</span>';
      return `<div class="lic-h-l"><span class="lic-h-t"><b>${dBR(l.inicio)} a ${dBR(l.fim)}</b>${sit}${l.motivo ? `<span class="muted"> · ${esc(l.motivo)}</span>` : ''}</span>
        <button class="btn small pp-ico" type="button" data-act="editlich" data-id="${l.id}" aria-label="Editar licença de ${dBR(l.inicio)} a ${dBR(l.fim)}" title="Editar"><span aria-hidden="true">✎</span></button></div>`;
    }).join('') : '<p class="nota">Nenhuma licença registrada.</p>'}</div>`;
}

// Guarda o que já foi digitado no cadastro de licença antes de redesenhar.
function guardarRascunhoLic() {
  const i = document.getElementById('lic-i');
  if (i) estado.licRasc = { i: i.value, f: document.getElementById('lic-f')?.value || '', m: document.getElementById('lic-m')?.value || '' };
}

// Quem é de cada turma da limpeza (para conferir de uma vez). Sub-bloco da Corrente CPJ, com os mesmos quadradinhos.
function blocoTurmas(todas, editar) {
  const com = todas.filter((p) => p.limpeza);
  if (!com.length && !editar) return '';
  const grupos = [
    ...TURMAS_LIMPEZA.map((t) => ({ chave: String(t), nome: `Turma ${t}`, lista: todas.filter((p) => Number(p.limpeza) === t) })),
    { chave: 'sem', nome: 'Sem turma', lista: todas.filter((p) => !p.limpeza) },
  ];
  const aberta = grupos.some((g) => g.chave === estado.limpezaTurmaAberta) ? estado.limpezaTurmaAberta : null;
  const turmaAtiva = aberta && aberta !== 'sem' ? grupos.find((g) => g.chave === aberta) : null;
  const disponiveis = turmaAtiva ? todas.filter((p) => !p.limpeza) : [];
  return `<div class="sub-bloco fn-limpeza"><div class="grp-h"><h2>🧹 Turmas da limpeza</h2><span class="count">${com.length} de ${todas.length}</span></div>
    <div class="pf-of-totais seis">${grupos.map((g) => `<button type="button" class="pf-of-total fn-limpeza${aberta === g.chave ? ' selecionado' : ''}" data-act="limpezaTurma" data-t="${g.chave}" aria-expanded="${aberta === g.chave}" aria-label="${g.nome}: ${g.lista.length} ${g.lista.length === 1 ? 'pessoa' : 'pessoas'}${aberta === g.chave ? ', recolher lista' : ', expandir lista'}"${!editar && !g.lista.length ? ' disabled' : ''}><b>${g.lista.length}</b><span>${g.nome}</span></button>`).join('')}</div>
    ${aberta ? (() => {
      const g = grupos.find((x) => x.chave === aberta);
      return `<div class="lista-aberta">
        ${g.lista.length ? `<div class="ppl">${g.lista.map((p) => editar
          ? linhaPessoa(p, { funcao: false, simples: true })
          : `<div class="pp"><div class="pp-l1"><span class="nm">${esc(p.nome)}</span><span class="badge pp-limp">🧹 Turma ${p.limpeza || '—'}</span></div></div>`).join('')}</div>`
          : '<p class="nota">Ninguém nesta turma.</p>'}
        ${editar && turmaAtiva ? disponiveis.length ? `<form id="f-limpeza-atribuir" data-rascunho class="limpeza-atribuir" data-t="${turmaAtiva.chave}">
          <label class="field">Adicionar pessoa nesta turma<select id="limpeza-pessoa" required><option value="">— escolha uma pessoa —</option>${disponiveis.map((p) => `<option value="${p.id}">${esc(p.nome)}${ehCurimba(p) ? ' · Curimba' : ` · ${esc(FUNCOES.find((f) => f.k === p.funcao)?.label || p.funcao)}`}</option>`).join('')}</select></label>
          <button class="btn primary" type="submit">＋ Adicionar</button></form>`
          : '<p class="nota">Não há pessoas sem turma de limpeza para adicionar.</p>' : ''}</div>`;
    })() : ''}</div>`;
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
    return `<span class="muted">${t}</span>`;
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
    : `Marque as entidades em que tem 100% de afinidade e segurança como ${NOME_CAMPO[c]} (o mesmo que a pessoa marca no Perfil). Vale para a Sugestão ${esc(config().sugestao)}.`;
  return `<details class="linhas"${estadoAberto.has(chave) ? ' open' : ''} data-id="${chave}">
    <summary>${resumo}</summary>
    <p class="nota" style="margin:6px 0">${texto}</p>
    <label class="chip chip-todas"><input type="checkbox" id="ln-${p.id}-${c}-todas" data-act="lnedit" data-c="${c}" data-todas="1" ${todasMarcadas(c, ls) ? 'checked' : ''}> Todas</label>
    ${LINHAS_CADASTRO.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
      `<label class="chip"><input type="checkbox" id="ln-${p.id}-${c}-${k}" data-act="lnedit" data-c="${c}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${k === 'mista' ? 'Encontro das Linhas (Mista)' : label}</label>`).join('')}</div></div>`).join('')}
  </details>`;
}

// Uma pessoa (quem edita): linha 1 = nome, função, 🧹 turma, "+ médium de passe" e os botões ✎ (Editar) e 🗑️ (Excluir);
// depois o resumo das entidades. Nada muda fora do Editar: em Editar, nome, função, turma, "+ médium de passe"
// e as entidades ficam editáveis e só são gravados no Salvar (Cancelar descarta).
function linhaPessoa(p, { funcao = true, acoes = true, simples = false } = {}) {
  if (simples) {
    if (estado.limpezaPessoaEditando === p.id) {
      return `<div class="pp pp-editando"><form id="f-limpeza-pessoa-ed" data-rascunho class="pp-form limpeza-pessoa-ed" data-id="${p.id}" autocomplete="off">
        <div class="pp-l1"><span class="nm">${esc(p.nome)}</span></div>
        <label class="field">Turma da limpeza<select id="limpeza-turma-ed" required><option value="">— escolha a turma —</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(p.limpeza) === t ? 'selected' : ''}>Turma ${t}</option>`).join('')}</select></label>
        <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelLimpezaPessoa">Cancelar</button></span></form></div>`;
    }
    return `<div class="pp"><div class="pp-l1"><span class="nm">${esc(p.nome)}</span>
      <span class="pp-l2"><span class="badge pp-limp" title="Turma da limpeza">🧹 Turma ${p.limpeza || '—'}</span></span>
      ${acoes ? `<span class="pp-bts"><button class="btn small pp-bt pp-ico" data-act="editarLimpezaPessoa" data-id="${p.id}" aria-label="Editar turma de ${esc(p.nome)}" title="Editar turma"><span aria-hidden="true">✎</span></button><button class="btn small pp-bt pp-ico pp-del" data-act="limpezaRemoverAsk" data-id="${p.id}" aria-label="Retirar ${esc(p.nome)} da turma da limpeza" title="Retirar da turma"><span aria-hidden="true">🗑️</span></button></span>` : ''}</div></div>`;
  }
  const ed = estado.renomear === p.id;
  if (!ed) {
    // Linha 1: nome (quebra entre palavras se precisar), função, 🧹 turma e os botões; "+ médium de passe" na linha de baixo.
    return `<div class="pp"><div class="pp-l1"><span class="nm">${esc(p.nome)}</span>
        <span class="pp-l2">${funcao && !simples ? `<span class="badge pp-fn fn-${p.funcao}">${esc(FUNCOES.find((o) => o.k === p.funcao)?.label || p.funcao)}</span>` : ''}
          <span class="badge pp-limp" title="Turma da limpeza">🧹 ${simples ? 'Turma ' : ''}${p.limpeza || '—'}</span></span>
        ${acoes ? `<span class="pp-bts"><button class="btn small pp-bt pp-ico" data-act="ren" data-id="${p.id}" aria-label="Editar ${esc(p.nome)}" title="Editar"><span aria-hidden="true">✎</span></button><button class="btn small pp-bt pp-ico pp-del" data-act="excluirask" data-tipo="p" data-id="${p.id}" aria-label="Excluir ${esc(p.nome)}" title="Excluir"><span aria-hidden="true">🗑️</span></button></span>` : ''}</div>
      ${!simples && p.funcao === 'medium' && p.experiente ? '<div class="pp-l3"><span class="badge new">+ médium de passe</span></div>' : ''}
      ${!simples && camposDe(p).length ? `<div class="pp-res">${resumoLinhas(p)}</div>` : ''}</div>`;
  }
  return `<div class="pp pp-editando"><form id="f-ren" data-rascunho class="pp-form" data-id="${p.id}" data-simples="${simples ? '1' : '0'}" autocomplete="off">
      <div class="pp-l1"><input type="text" id="ren-in" value="${esc(p.nome)}" maxlength="80" autocomplete="off" aria-label="Nome de ${esc(p.nome)}">
        <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelren">Cancelar</button></span></div>
      <div class="pp-l2">${funcao && !simples ? `<select id="ren-func" aria-label="Função de ${esc(p.nome)}">${FUNCOES.map((o) => `<option value="${o.k}" ${o.k === p.funcao ? 'selected' : ''}>${o.label}</option>`).join('')}</select>` : ''}
        <label class="pp-limp ed">🧹 <select class="limp-sel" id="ren-limp" aria-label="Turma da limpeza de ${esc(p.nome)}"><option value="">—</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(p.limpeza) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        ${!simples && p.funcao === 'medium' ? `<label class="check small pp-exp"><input type="checkbox" id="ren-exp" ${p.experiente ? 'checked' : ''}> + médium de passe</label>` : ''}</div>
      ${simples ? '' : camposDe(p).map((c) => editorLinhas(p, c)).join('')}
    </form></div>`;
}

// Lembra quais editores de linhas estão abertos entre redesenhos.
const estadoAberto = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d instanceof HTMLDetailsElement && d.classList.contains('linhas')) {
    if (d.open) estadoAberto.add(d.dataset.id); else estadoAberto.delete(d.dataset.id);
  }
}, true);

// "Adicionar": escolhe o que cadastrar (pessoas da corrente, licença ou curimba).
// Quem vê a corrente: botão no fim do bloco Corrente CPJ, que abre o cadastro ali mesmo.
// Quem só cuida dos alunos: card próprio.
const MODOS = [['pessoas', 'Pessoas'], ['licenca', 'Licença'], ['curimba', 'Curimba']];
const ALUNO = 'aluno';
// Funções que este perfil pode cadastrar: a corrente (quem edita Pessoas) e/ou Aluno (quem edita Alunos).
const funcoesCadastro = () => [
  ...(pode('pessoas:editar') ? FUNCOES.map((f) => [f.k, f.label]) : []),
  ...(pode('alunos:editar') ? [[ALUNO, 'Aluno']] : []),
];
const addAberto = (ps) => estado.addAberto ?? (pode('pessoas:editar') && !ps.length);
function cardAdicionar(ps) {
  const aberto = addAberto(ps);
  return `<div class="card adm">${cabDobra('dobraradd', '＋ Adicionar', '', aberto)}${aberto ? conteudoAdicionar(ps) : ''}</div>`;
}
function blocoAdicionar(ps) {
  if (!addAberto(ps)) return `<div class="sub-bloco"><button class="btn primary" type="button" data-act="dobraradd">＋ Adicionar</button></div>`;
  return `<div class="sub-bloco">${cabDobra('dobraradd', '＋ Adicionar', '', true)}${conteudoAdicionar(ps)}</div>`;
}
function conteudoAdicionar(ps) {
  const corrente = pode('pessoas:editar');
  const modo = corrente ? estado.addModo || 'pessoas' : 'pessoas';
  let h = corrente ? `<div class="seg add-seg" role="group" aria-label="O que adicionar">${MODOS.map(([k, t]) => `<button data-act="addmodo" data-v="${k}" aria-pressed="${modo === k}">${t}</button>`).join('')}</div>` : '';
  if (modo === 'pessoas') {
    const fs = funcoesCadastro();
    const func = fs.some(([k]) => k === prefs.lastFunc) ? prefs.lastFunc : fs[0][0];
    const turmas = estado.alunos?.turmas || [];
    const turmaSel = turmas.some((t) => t.id === estado.turmaSel) ? estado.turmaSel : turmas[turmas.length - 1]?.id || '';
    h += `<form id="f-add" data-rascunho class="row">
      <label class="field" style="flex:0 1 150px">Função<select id="f-func" data-act="funcnova">${fs.map(([k, l]) => `<option value="${k}" ${k === func ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field add-turma" id="f-turma-campo" ${func === ALUNO ? '' : 'hidden'}>Turma<span class="turma-sel"><select id="f-turma" data-act="turmasel">${turmas.map((t) => `<option value="${t.id}" ${t.id === turmaSel ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select><button class="btn" type="button" data-act="novaturma" title="Adicionar turma" aria-label="Adicionar turma">＋</button></span></label>
      <label class="field grow">Nome<input type="text" id="f-nome" placeholder="Um nome, ou vários separados por vírgula" autocomplete="off" maxlength="4000" value="${esc(estado.addRascunho || '')}"></label>
      <div class="al-add-dados" id="f-dados-campo" ${func === ALUNO ? '' : 'hidden'}><p class="nota al-nota">Dados do aluno: opcionais e só quando é um aluno de cada vez.</p>${camposAluno('fa')}</div>
      <button class="btn primary" type="submit">Adicionar</button></form>`;
  } else if (modo === 'licenca') {
    const R = estado.licRasc || {};
    const sel = estado.licPessoa || '';
    h += `<form id="f-lic" data-rascunho class="lic-form" autocomplete="off">
      <label class="field">Pessoa<select id="lic-p" data-act="licpessoa"><option value="">— escolha —</option>${ps.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
      <div class="lic-datas-f"><label class="field">Início<input type="date" id="lic-i" value="${esc(R.i ?? hoje())}"></label>
      <label class="field">Fim<input type="date" id="lic-f" value="${esc(R.f || '')}"></label></div>
      <label class="field">Motivo (opcional)<input type="text" id="lic-m" maxlength="200" placeholder="Ex.: Férias, Gravidez…" value="${esc(R.m || '')}"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
      ${historicoLicencas(ps.find((p) => p.id === sel))}
      <p class="nota">Quem estiver de licença fica fora do sorteio e aparece como “de licença” na gira. A licença sai da lista sozinha depois da data final.</p>`;
  } else {
    h += `<form id="f-curimba" data-rascunho class="row" autocomplete="off">
      <label class="field grow">Nome<input type="text" id="cur-nome" placeholder="Um nome, ou vários separados por vírgula" maxlength="4000"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
      <p class="nota">A curimba entra nas turmas da limpeza, mas não conta presença nem falta e não entra no sorteio.</p>`;
  }
  return h;
}
// Janela de confirmação para excluir (pessoa, aluno ou licença) ou remover uma turma.
function janelaExcluir() {
  const x = estado.excluirPop;
  if (!x) return '';
  let titulo = '', texto = '';
  if (x.tipo === 'p') {
    const p = estado.pessoas.find((y) => y.id === x.id);
    if (!p) return '';
    titulo = 'Excluir pessoa'; texto = `Excluir <b>${esc(p.nome)}</b> da corrente? Sai das próximas giras e listas. As presenças, escalas e oferendas já feitas ficam guardadas; perfil, foto, Anamnese e senha são apagados.`;
  } else if (x.tipo === 'al') {
    const a = (estado.alunos?.alunos || []).find((y) => y.id === x.id);
    if (!a) return '';
    titulo = 'Excluir aluno'; texto = `Excluir o aluno <b>${esc(a.nome)}</b>? Vai para <b>Ex-alunos</b>: sai das listas, do login e das próximas oferendas, mas o cadastro (perfil, foto, senha e CPF) fica guardado e pode voltar.`;
  } else if (x.tipo === 'exal') {
    const a = (estado.alunos?.exAlunos || []).find((y) => y.id === x.id);
    if (!a) return '';
    titulo = 'Apagar de vez'; texto = `Apagar <b>${esc(a.nome)}</b> de vez? Perfil, foto, senha e CPF são apagados agora e <b>não dá para desfazer</b>. As oferendas já encerradas continuam com o nome.`;
  } else if (x.tipo === 'turma') {
    const t = (estado.alunos?.turmas || []).find((y) => y.id === x.id);
    if (!t) return '';
    const n = (estado.alunos?.alunos || []).filter((a) => a.turmaId === x.id).length;
    titulo = 'Remover turma';
    texto = `Remover <b>${esc(t.nome)}</b>? ${n
      ? `${n} aluno${n === 1 ? '' : 's'} passar${n === 1 ? 'á' : 'ão'} para “Sem turma”; nenhum aluno será excluído.`
      : 'Nenhum aluno será excluído.'}`;
  } else if (x.tipo === 'limpezaPessoa') {
    const p = estado.pessoas.find((y) => y.id === x.id);
    if (!p) return '';
    titulo = 'Retirar da turma da limpeza';
    texto = `Retirar <b>${esc(p.nome)}</b> da Turma ${p.limpeza}? O cadastro da pessoa será mantido.`;
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

// embutida: dentro do bloco Pessoas da aba Perfil (a aba Pessoas saiu do menu). Ali aparecem a Corrente (as funções)
// e as Oferendas pendentes; Turmas da limpeza, licenças, Adicionar, Alunos e Cadastros ficam atrás do "Ver mais"
// (estado.pessoasMais).
export function render({ embutida = false } = {}) {
  return renderPessoas(embutida).replace(/<\/section>$/, janelaExcluir() + '</section>');
}

function renderPessoas(embutida = false) {
  const todas = pessoasOrd();
  const ps = todas.filter((p) => !ehCurimba(p));   // a corrente (sem a curimba)
  const editar = pode('pessoas:editar');
  const verAlunos = pode('alunos:ver');
  // No Perfil (embutida), os Alunos ficam atrás do "Ver mais": só busca a lista (pesada para quem edita: dados,
  // pendências e CPF mascarado de cada aluno) quando ela vai aparecer.
  const mostraAlunos = !embutida || estado.pessoasMais || !pode('pessoas:ver');
  if (verAlunos && mostraAlunos && estado.alunos === null) { estado.alunos = undefined; carregarAlunos(); }
  let h = `<section class="panel pessoas-tela">`;
  const podeAdd = editar || pode('alunos:editar');
  // Perfil que só cuida dos alunos (ex.: Admin oferendas): só o Adicionar e o bloco Alunos.
  if (!pode('pessoas:ver')) return h + (podeAdd ? cardAdicionar(ps) : '') + (verAlunos ? cardAlunos() : '') + cardCadastrosLogin() + '</section>';
  if (!editar) h += `<p class="leitura" style="margin:0">Lista da corrente, só para consulta.</p>`;
  const add = podeAdd ? blocoAdicionar(ps) : '';
  if (!ps.length) {
    return h + `<div class="card empty"><p class="muted">${editar ? 'Ninguém cadastrado ainda. Digite os nomes abaixo; pode colar uma lista inteira separada por vírgulas.' : 'Ninguém cadastrado ainda.'}</p>${add}</div>${verAlunos ? cardAlunos() : ''}${cardCadastrosLogin()}</section>`;
  }
  const funcaoCorrenteAberta = estado.correnteFuncaoAberta;
  const pessoasPorFuncao = Object.fromEntries(QUADROS_CORRENTE.map((f) => [f.k, todas.filter((p) => p.funcao === f.k)]));
  // A curimba na lista: como no sub-bloco da limpeza (sem função e sem as linhas, que ela não tem).
  const linhaCorrente = (p) => (!ehCurimba(p) ? linhaPessoa(p, { acoes: editar })
    : editar ? linhaPessoa(p, { funcao: false })
      : `<div class="pp"><div class="pp-l1"><span class="nm">${esc(p.nome)}</span>${p.limpeza ? `<span class="badge pp-limp">🧹 Turma ${p.limpeza}</span>` : ''}</div></div>`);
  const correnteListaAberta = pessoasPorFuncao[funcaoCorrenteAberta]?.length ? funcaoCorrenteAberta : null;
  // Ordem: Corrente (funções, Turmas da limpeza, Oferendas pendentes, licenças e, no fim, o Adicionar), Alunos.
  h += `<div class="card pp-card fn-corrente corrente-card"><div class="grp-h"><h2><span class="estrela-ouro" aria-hidden="true">★</span> Corrente CPJ</h2><span class="count">${ps.length} pessoa${ps.length === 1 ? '' : 's'}</span></div>
    <div class="pf-of-totais seis">${QUADROS_CORRENTE.map((f) => {
      const abertas = pessoasPorFuncao[f.k];
      const aberta = funcaoCorrenteAberta === f.k;
      // Mesmo quadrado do bloco Oferendas pendentes (pf-of-total): nome em cima, número embaixo.
      return `<button type="button" class="pf-of-total fn-${f.k}${aberta ? ' selecionado' : ''}" data-act="correnteFuncao" data-f="${f.k}" aria-expanded="${aberta}" aria-label="${f.pl}: ${abertas.length} pessoas${aberta ? ', recolher lista' : ', expandir lista'}"${abertas.length ? '' : ' disabled'}><b>${abertas.length}</b><span>${f.k === 'extra' ? 'At. Extra' : f.pl}</span></button>`;
    }).join('')}</div>
    ${correnteListaAberta === CURIMBA ? '<p class="nota">A curimba não conta presença nem falta, não entra no sorteio nem no total da corrente.</p>' : ''}
    ${correnteListaAberta ? `<div class="ppl">${pessoasPorFuncao[correnteListaAberta].map(linhaCorrente).join('')}</div>` : ''}
${cardOferendasPendentes()}`;
  const resto = `${blocoTurmas(todas, editar)}${listaLicencas(ps, editar)}${add}`;   // licença: só a corrente
  const fim = (verAlunos ? cardAlunos() : '') + cardCadastrosLogin();   // Cadastros pelo login: o último bloco da aba
  if (embutida && !estado.pessoasMais) return h + `<button type="button" class="btn small pp-vermais" data-act="pessoasmais">Ver mais ▾</button></div></section>`;
  h += resto + (embutida ? '<button type="button" class="btn small pp-vermais" data-act="pessoasmais">Ver menos ▴</button>' : '') + '</div>' + fim;
  return h + '</section>';
}

export const cliques = {
  pessoasmais() { estado.pessoasMais = !estado.pessoasMais; avisar(); },
  cadquadro(el) { estado.cadQuadro = estado.cadQuadro === el.dataset.q ? null : el.dataset.q; estado.cadEditar = null; estado.cadAberto = null; avisar(); },
  cadpessoa(el) { estado.cadAberto = estado.cadAberto === el.dataset.id ? null : el.dataset.id; avisar(); },
  cadeditar(el) { estado.cadEditar = el.dataset.id; estado.alunoCpfRemover = null; estado.alunoCpfVisto = null; estado.alunoRasc = null; avisar(); document.getElementById('cad-nc')?.focus(); },
  cadeditarfechar() { estado.cadEditar = null; estado.alunoCpfRemover = null; estado.alunoCpfVisto = null; estado.alunoRasc = null; avisar(); },
  async cadmover(el) {
    const C = estado.alunos?.cadastros;
    const destino = document.getElementById('cad-' + el.dataset.id)?.value;
    if (!destino) { toast('Escolha para onde vai.'); return; }
    const nome = el.dataset.nome;
    let ok;
    if (destino === 'corrente') {
      if (!confirm(`Passar ${nome} para a corrente como Cambone? O cadastro, a senha e o CPF vão junto.`)) return;
      ok = await acaoAlunos('promoverAlunoCPJ', { id: el.dataset.id });
    } else {
      const turmaId = destino === 'consulente' ? C.turmaConsulentes : destino === 'oferenda' ? C.turmaOferenda : destino.slice(2);
      ok = await acaoAlunos('aluno', { id: el.dataset.id, turmaId });
    }
    if (!ok) return;
    toast(destino === 'corrente' ? `${nome} agora é da corrente.` : destino === 'consulente' ? `${nome} agora é consulente.` : destino === 'oferenda' ? `${nome} agora está no grupo Oferenda.` : `${nome} foi para a turma.`);
    carregarAlunos();   // os quadradinhos voltam com as contas novas
  },
  // Bloco Oferendas pendentes (vem da aba Perfil).
  pfdobra: (el) => cliquesPerfil.pfdobra(el),
  pfofertas: (el) => cliquesPerfil.pfofertas(el),
  dobraradd() { estado.addAberto = !(estado.addAberto ?? !pessoasOrd().some((p) => !ehCurimba(p))); avisar(); },
  // Alunos: tocar no título minimiza/abre (minimizar fecha a turma aberta).
  dobraralunos() {
    estado.alunosAberto = !estado.alunosAberto;
    if (!estado.alunosAberto) { estado.alunosTurmaAberta = null; estado.alunosAdicionarTurma = null; estado.editAluno = null; estado.editTurma = null; if (!estado.alunosPromover?.enviando) estado.alunosPromover = null; }
    avisar();
  },
  correnteFuncao(el) {
    estado.correnteFuncaoAberta = estado.correnteFuncaoAberta === el.dataset.f ? null : el.dataset.f;
    if (estado.correnteFuncaoAberta) estado.limpezaTurmaAberta = null;
    avisar();
  },
  limpezaTurma(el) {
    estado.limpezaTurmaAberta = estado.limpezaTurmaAberta === el.dataset.t ? null : el.dataset.t;
    if (estado.limpezaTurmaAberta) estado.correnteFuncaoAberta = null;
    avisar();
  },
  alunosTurma(el) {
    estado.alunosTurmaAberta = estado.alunosTurmaAberta === el.dataset.t ? null : el.dataset.t;
    estado.alunosAdicionarTurma = null;
    if (!estado.alunosPromover?.enviando) estado.alunosPromover = null;
    avisar();
  },
  abrirAddAlunosTurma(el) {
    estado.alunosAdicionarTurma = el.dataset.id;
    avisar();
    document.getElementById('alunos-turma-nomes')?.focus();
  },
  cancelarAddAlunosTurma() { estado.alunosAdicionarTurma = null; avisar(); },
  // UP CPJ: escolhe os alunos da turma aberta e, no Confirmar, promove um por um para a Corrente como Cambone.
  abrirPromover(el) {
    estado.alunosPromover = { turma: el.dataset.id, ids: [], enviando: false };
    estado.alunosAdicionarTurma = null; estado.editAluno = null; estado.editTurma = null;
    avisar();
  },
  cancelarPromover() { estado.alunosPromover = null; avisar(); },
  confirmarPromover,
  async atribuirLimpeza(form) {
    const pessoaId = document.getElementById('limpeza-pessoa')?.value;
    if (!pessoaId) { toast('Escolha uma pessoa.'); return; }
    const pessoa = estado.pessoas.find((p) => p.id === pessoaId);
    if (!pessoa) { toast('Pessoa não encontrada. Atualize a tela e tente novamente.'); return; }
    if (pessoa.limpeza) { toast('Esta pessoa já pertence a uma turma de limpeza.'); return; }
    if (await atualizarPessoa(pessoaId, { limpeza: Number(form.dataset.t) })) {
      toast('Pessoa adicionada à turma.');
      avisar();
    }
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
    else if (x.tipo === 'limpezaPessoa') {
      const p = estado.pessoas.find((y) => y.id === x.id);
      if (p && await atualizarPessoa(x.id, { limpeza: null })) toast(`${p.nome} foi retirada da turma. O cadastro foi mantido.`);
    }
    else if (x.tipo === 'al') { if (await acaoAlunos('excluirAluno', { id: x.id })) toast('Aluno movido para Ex-alunos.'); }
    else if (x.tipo === 'exal') { if (await acaoAlunos('apagarAluno', { id: x.id })) toast('Ex-aluno apagado de vez.'); }
    else if (x.tipo === 'turma') {
      estado.editTurma = null;
      if (await acaoAlunos('excluirTurma', { id: x.id })) {
        estado.alunosTurmaAberta = null;
        toast('Turma removida. Os alunos foram mantidos sem turma.');
      }
    }
    else if (x.tipo === 'lic') { estado.editLic = null; estado.editLicH = null; await removerLicenca(x.id); }
  },
  delpessoa(el) { estado.confirm = null; excluirPessoa(el.dataset.id); },
  ren(el) {
    estado.renomear = el.dataset.id;
    avisar();
  },
  editarLimpezaPessoa(el) { estado.limpezaPessoaEditando = el.dataset.id; avisar(); },
  cancelLimpezaPessoa() { estado.limpezaPessoaEditando = null; avisar(); },
  limpezaRemoverAsk(el) { estado.excluirPop = { tipo: 'limpezaPessoa', id: el.dataset.id }; avisar(); },
  cancelren() { estado.renomear = null; avisar(); },
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
  editaluno(el) {
    estado.editAluno = el.dataset.id;
    const aluno = estado.alunos?.alunos?.find((a) => a.id === el.dataset.id);
    estado.alunosTurmaAberta = aluno?.turmaId || 'sem';
    avisar();
    document.getElementById('al-nome')?.focus();
  },
  cancelaluno() { estado.editAluno = null; estado.alunoCpfRemover = null; estado.alunoCpfVisto = null; estado.alunoRasc = null; avisar(); },
  alcpfremover(el) { estado.alunoCpfRemover = el.dataset.id; estado.alunoCpfVisto = null; avisar(); },
  alcpfmanter() { estado.alunoCpfRemover = null; avisar(); },
  // Mostrar: busca o número inteiro e esconde sozinho em 30 s (como no Perfil).
  async alcpfver(el) {
    const id = el.dataset.id;
    if (estado.alunoCpfVisto?.id === id) { estado.alunoCpfVisto = null; avisar(); return; }
    const cpf = await revelarCpfAluno(id);
    if (!cpf) return;
    estado.alunoCpfVisto = { id, cpf };
    avisar();
    setTimeout(() => { if (estado.alunoCpfVisto?.id === id) { estado.alunoCpfVisto = null; avisar(); } }, 30000);
  },
  editturma(el) { estado.editTurma = el.dataset.id; estado.alunosTurmaAberta = el.dataset.id; avisar(); document.getElementById('turma-nome')?.select(); },
  cancelturma() { estado.editTurma = null; avisar(); },
  delaluno(el) { estado.confirm = null; acaoAlunos('excluirAluno', { id: el.dataset.id }); },
  exAlunosAbrir() { estado.exAlunosAberto = !estado.exAlunosAberto; avisar(); },
  async reativarAluno(el) { if (await acaoAlunos('reativarAluno', { id: el.dataset.id })) toast('Voltou para os alunos.'); },
  // Root: nova senha para o aluno que esqueceu, ou em branco para limpar (ele cria outra ao entrar);
  // as sessões abertas dele são encerradas.
  async senhaaluno(el) {
    const senha = prompt(`Nova senha de ${el.dataset.nome}: de 6 a 8 números.\nDeixe em branco para LIMPAR a senha (o aluno cria outra ao entrar).`);
    if (senha === null) return;
    if (!senha.trim()) {
      if (!confirm(`Limpar a senha de ${el.dataset.nome}? Ele vai criar uma nova ao entrar, confirmando o celular ou o e-mail.`)) return;
      if (await acaoUsuarios('pinAluno', { alunoId: el.dataset.id, limpar: true })) toast('Senha do aluno limpa.');
      return;
    }
    if (!PIN_NOVO.test(senha.trim())) { toast(PIN_NOVO_MSG); return; }
    if (await acaoUsuarios('pinAluno', { alunoId: el.dataset.id, senha: senha.trim() })) toast('Senha do aluno alterada.');
  },
};

// Salva o nome editado (Enter ou "Salvar").
export async function renomear(form) {
  const id = form.dataset.id;
  const novo = document.getElementById('ren-in').value.trim().replace(/\s+/g, ' ');
  const sel = document.getElementById('ren-limp');
  const fn = document.getElementById('ren-func');
  const exp = document.getElementById('ren-exp');
  const p = estado.pessoas.find((x) => x.id === id);
  let novaTurmaLimpeza;
  if (!novo) { toast('Digite o nome.'); return; }
  if (!p) { estado.renomear = null; avisar(); return; }
  const patch = {};
  if (novo !== p.nome) {
    if (estado.pessoas.some((x) => x.id !== id && x.nome.toLowerCase() === novo.toLowerCase())) { toast('Já existe um cadastro com esse nome.'); return; }
    patch.nome = novo;
  }

  const turma = sel && sel.value ? Number(sel.value) : null;
  if (sel && turma !== (p.limpeza ? Number(p.limpeza) : null)) {
    patch.limpeza = turma;
    novaTurmaLimpeza = turma ? String(turma) : 'sem';
  }
  if (fn && fn.value !== p.funcao) patch.funcao = fn.value;
  if (exp && exp.checked !== !!p.experiente) patch.experiente = exp.checked;
  // Entidades marcadas em cada escolha (Todas / linhas).
  if (form.dataset.simples !== '1') camposDe(p).forEach((c) => {
    const ls = [...form.querySelectorAll(`input[data-act="lnedit"][data-c="${c}"][data-l]:checked`)].map((i) => i.dataset.l).sort();
    if (ls.join() !== [...(p[c] || [])].sort().join()) patch[c] = ls;
  });
  estado.renomear = null;
  if (!Object.keys(patch).length) { avisar(); return; }
  if (await atualizarPessoa(id, patch)) {
    if (novaTurmaLimpeza) {
      estado.limpezaTurmaAberta = novaTurmaLimpeza;
      estado.correnteFuncaoAberta = null;
      avisar();
    }
    toast('Alterações salvas.');
  }
}

export async function salvarTurmaLimpeza(form) {
  const turma = Number(document.getElementById('limpeza-turma-ed')?.value);
  if (!TURMAS_LIMPEZA.includes(turma)) { toast('Escolha uma turma da limpeza.'); return; }
  if (await atualizarPessoa(form.dataset.id, { limpeza: turma })) {
    estado.limpezaPessoaEditando = null;
    estado.limpezaTurmaAberta = String(turma);
    toast('Turma da limpeza alterada.');
    avisar();
  }
}

export const mudancas = {
  // Função "Aluno" no Adicionar: mostra a turma (sem redesenhar, para não perder o que foi digitado).
  funcnova(t) {
    prefs.lastFunc = t.value;
    salvarPrefs();
    const campo = document.getElementById('f-turma-campo');
    if (campo) campo.hidden = t.value !== ALUNO;
    const dados = document.getElementById('f-dados-campo');
    if (dados) dados.hidden = t.value !== ALUNO;
  },
  turmasel(t) { estado.turmaSel = t.value; },
  // UP CPJ: marca/desmarca o aluno (o número no Confirmar acompanha).
  promoverSel(t) {
    const sel = estado.alunosPromover;
    if (!sel) return;
    sel.ids = t.checked ? [...new Set([...sel.ids, t.dataset.id])] : sel.ids.filter((x) => x !== t.dataset.id);
    avisar();
  },
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
    const r = await acaoAlunos('alunos', { nome: inp.value, turmaId, ...lerCamposAluno('fa') });
    if (!r) return;
    estado.addRascunho = '';
    estado.alunoRasc = null;
    document.getElementById('f-add')?.reset();   // salvou: o redesenho não devolve o que foi digitado
    avisar();
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

