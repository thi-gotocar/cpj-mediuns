// Sub-aba "Iemanjá" de Oferendas: as oferendas (grupos) do evento, o sorteio das pessoas e o histórico dos eventos.

import { estado, avisar, acaoIemanja } from '../estado.js';
import { esc, toast } from '../util.js';
import { ORIXAS } from '/shared/regras.js';
import { NOMES_ENTIDADES, LISTA_CURIMBA } from '/shared/iemanja.js';
import { dataBR, faixaPct, textoEntrega } from '/shared/oferendas.js';
import { U, Dia, camposItem, listaItens, botoesCompartilhar, painelCompartilhar, blocoDetalhes, salvarDetalhes } from './oferendaComum.js';

const ui = { abertos: new Set(), edit: null, janela: null, rascunho: {}, categorias: false };
const val = (id) => document.getElementById(id)?.value ?? '';
// A visão CPJ/Alunos do root mostra o que a corrente vê.
const comoAdmin = (ev) => ev.admin && (estado.me?.papel !== 'root' || estado.visaoRoot === 'root');
const souRoot = () => !!estado.iemanja?.root && estado.visaoRoot === 'root';

const seta = (k) => `<span class="seta" aria-hidden="true">${ui.abertos.has(k) ? '▾' : '▸'}</span>`;
const icone = (i, t) => `<span aria-hidden="true">${i}</span> ${t}`;
const nomeGrupo = (g) => g.nome || `Grupo ${g.ordem}`;
// Categorias do evento: valem para todas as oferendas (grupos) e dão a ordem dos itens.
const categoriasDe = (ev) => ev.categorias || [];
const paraCompartilhar = (ev, g) => ({ id: g.id, titulo: `${ev.nome} · ${nomeGrupo(g)}`, data: ev.data, responsavel: g.responsavel, porMedium: false, itens: g.itens, categorias: categoriasDe(ev), detalhes: ev.detalhes || '' });

function opcoesNome(atual) {
  const op = (n) => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`;
  return `<option value="">— escolha —</option><optgroup label="Orixás">${ORIXAS.map(op).join('')}</optgroup><optgroup label="Entidades">${NOMES_ENTIDADES.map(op).join('')}</optgroup>`;
}

// Todas as pessoas dos cadastros, separadas por lista, para os combos de associar e adicionar.
function opcoesPessoas(C, ja = new Set()) {
  const listas = [['Corrente', C.corrente], ['Curimba', C.curimba], ...C.turmas.map((t) => [t.nome, t.pessoas]), ['Alunos sem turma', C.semTurma]];
  return listas.map(([titulo, l]) => {
    const livres = l.filter((p) => !ja.has(p.chave));
    return livres.length ? `<optgroup label="${esc(titulo)}">${livres.map((p) => `<option value="${esc(p.chave)}">${esc(p.nome)}</option>`).join('')}</optgroup>` : '';
  }).join('');
}

function blocoPessoas(g, ev, adm, C) {
  const k = 'p:' + g.id;
  const ja = new Set(g.membros.map((m) => m.chave));
  return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h3>Pessoas do grupo</h3><span class="count">${g.membros.length} ${seta(k)}</span></button>
    ${ui.abertos.has(k) ? `<div class="iem-lista">${g.membros.map((m) => `<div class="iem-p"><span>${esc(m.nome)}</span>${adm && !ev.encerradoEm ? `<button class="btn small" data-act="iemretirar" data-g="${g.id}" data-c="${esc(m.chave)}" aria-label="Retirar ${esc(m.nome)} do grupo">✕</button>` : ''}</div>`).join('') || '<p class="muted" style="margin:0">Ninguém no grupo ainda.</p>'}</div>
      ${adm && !ev.encerradoEm && C ? `<div class="iem-add"><select id="iem-p-${g.id}" aria-label="Associar pessoa ao grupo"><option value="">+ associar pessoa</option>${opcoesPessoas(C, ja)}</select><button class="btn small" data-act="iemassociar" data-g="${g.id}">Associar</button></div>` : ''}` : ''}</div>`;
}

function cardGrupo(ev, g, adm) {
  const k = 'g:' + g.id;
  const aberto = g.abre && ui.abertos.has(k);
  const C = estado.iemanja.candidatos;
  const ed = ui.edit?.id === ev.id ? ui.edit.grupos[g.id] : null;
  const info = `<span class="iem-tit"><b>${esc(nomeGrupo(g))}</b><small class="muted">${g.responsavel ? esc(g.responsavel) : 'Sem responsável'}</small></span><span class="of-res ${faixaPct(g.pct)} iem-pct"><b>${g.pct}%</b></span>`;
  const cab = g.abre
    ? `<button class="grp-h dobra iem-cab" data-act="iemdobra" data-k="${k}" aria-expanded="${aberto}">${info}${seta(k)}</button>`
    : `<div class="grp-h iem-cab">${info}</div>`;
  const responsaveis = [...(C?.corrente || []), ...(C?.curimba || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const edicao = ed ? `<div class="iem-ed"><label class="field">Orixá ou entidade<select data-act="iemnome" data-id="${g.id}">${opcoesNome(ed.nome)}</select></label>
    <label class="field">Responsável<select data-act="iemresp" data-id="${g.id}" ${souRoot() ? '' : 'disabled'}><option value="">— nenhum —</option>${responsaveis.map((p) => `<option value="${p.pessoaId}" ${p.pessoaId === ed.responsavelId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label></div>` : '';
  if (!aberto) return `<div class="card iem-grupo" id="iem-g-${g.id}">${cab}${edicao}</div>`;
  const barra = g.itens.length ? `<div class="of-pct ${faixaPct(g.pct)}"><div class="of-pct-h"><b>${g.pct}%</b> <span class="muted">dos itens com responsável</span></div><div class="of-pct-barra" role="img" aria-label="${g.pct}% dos itens com responsável"><span style="width:${g.pct}%"></span></div></div>` : '';
  const pode = adm && !ev.encerradoEm;
  // Admin registra a doação só de quem é do grupo.
  const opcoesDoador = (ja) => g.membros.filter((m) => !ja.has(m.chave)).map((m) => `<option value="${esc(m.chave)}">${esc(m.nome)}</option>`).join('');
  const itens = `<div class="ofg-sec"><span class="ofg-tit">Itens</span>${g.itens.length ? listaItens(g.itens, { p: 'iem', eu: estado.iemanja.eu, admin: pode, ref: ev, podeDoar: !ev.encerradoEm && g.meu, opcoesDoador, categorias: categoriasDe(ev) }) : '<p class="muted" style="margin:0">Nenhum item ainda.</p>'}</div>`;
  const novoItem = pode ? `<details class="of-novo"${U().novoItem === g.id ? ' open' : ''}><summary>+ Adicionar item</summary>
      <form class="row" data-form="iemitem" data-of="${g.id}" autocomplete="off">${camposItem(ui.rascunho[g.id], categoriasDe(ev))}<button class="btn primary" type="submit">Adicionar</button></form></details>` : '';
  const of = paraCompartilhar(ev, g);
  const rodape = pode ? `<div class="of-rod">${botoesCompartilhar(of)}<button class="btn danger" data-act="iemjanela" data-t="excluirGrupo" data-g="${g.id}">${icone('🗑', 'Excluir grupo')}</button></div>${painelCompartilhar(of)}` : '';
  return `<div class="card iem-grupo" id="iem-g-${g.id}">${cab}${edicao}${barra}${novoItem}${itens}${blocoPessoas(g, ev, adm, C)}${rodape}</div>`;
}

function listaSorteio(k, titulo, pessoas, presos, fora) {
  const lista = pessoas.filter((p) => !presos.has(p.chave));
  const kk = 's:' + k;
  const dentro = lista.filter((p) => !fora.has(p.chave)).length;
  return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${kk}" aria-expanded="${ui.abertos.has(kk)}"><h3>${esc(titulo)}</h3><span class="count">${dentro} ${seta(kk)}</span></button>
    ${ui.abertos.has(kk) ? `<div class="iem-lista">${lista.map((p) => `<div class="iem-p ${fora.has(p.chave) ? 'fora' : ''}"><span>${esc(p.nome)}</span><button class="btn small" data-act="iemfora" data-c="${esc(p.chave)}" data-v="${fora.has(p.chave) ? '0' : '1'}" aria-label="${fora.has(p.chave) ? 'Voltar' : 'Tirar'} ${esc(p.nome)} do sorteio">${fora.has(p.chave) ? '↺' : '✕'}</button></div>`).join('') || '<p class="muted" style="margin:0">Ninguém nesta lista.</p>'}</div>` : ''}</div>`;
}

function blocoSorteio(ev) {
  const C = estado.iemanja.candidatos;
  if (!C) return '';
  const k = 'sorteio';
  const cab = `<button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h2>🎲 Sorteio</h2><span class="count">${ev.sorteado ? 'realizado' : 'a fazer'} ${seta(k)}</span></button>`;
  if (!ui.abertos.has(k)) return `<div class="card adm iem-sorteio">${cab}</div>`;
  const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  const fora = new Set(ev.fora);
  const ativas = new Set(ev.listas);
  const chip = (valor, nome) => `<label class="chip"><input type="checkbox" data-act="iemlista" value="${esc(valor)}" ${ativas.has(valor) ? 'checked' : ''}> ${esc(nome)}</label>`;
  const escolha = `<div class="ofg-sec"><span class="ofg-tit">Listas no sorteio</span><div class="iem-chips">${chip(LISTA_CURIMBA, 'Curimba')}${C.turmas.map((t) => chip(t.id, t.nome)).join('')}</div></div>`;
  const listas = listaSorteio('corrente', 'Corrente', C.corrente, presos, fora)
    + (ativas.has(LISTA_CURIMBA) ? listaSorteio('curimba', 'Curimba', C.curimba, presos, fora) : '')
    + C.turmas.filter((t) => ativas.has(t.id)).map((t) => listaSorteio(t.id, t.nome, t.pessoas, presos, fora)).join('');
  const adicionar = `<div class="iem-add iem-add2"><select id="iem-add-p" aria-label="Pessoa"><option value="">Buscar pessoa…</option>${opcoesPessoas(C)}</select>
    <select id="iem-add-g" aria-label="Grupo"><option value="">Grupo…</option>${ev.grupos.map((g) => `<option value="${g.id}">${esc(nomeGrupo(g))}</option>`).join('')}</select></div>
    <div class="cp-bts"><button class="btn" data-act="iemadicionar">${icone('＋', 'Adicionar')}</button>${ev.sorteado
      ? `<button class="btn" data-act="iemjanela" data-t="cancelar">${icone('✕', 'Cancelar sorteio')}</button>`
      : `<button class="btn primary" data-act="iemjanela" data-t="sortear">${icone('🎲', 'Sortear')}</button>`}</div>`;
  return `<div class="card adm iem-sorteio">${cab}${ev.sorteado ? '' : escolha + listas}${adicionar}</div>`;
}

// Entrada em "Seus compromissos": nasce do grupo em que a pessoa foi escalada.
export function compromisso() {
  const ev = estado.iemanja?.eventos?.find((e) => !e.encerradoEm);
  const g = ev?.grupos.find((x) => x.meu);
  if (!g) return null;
  const eu = estado.iemanja.eu?.chave;
  const meus = g.itens.flatMap((i) => { const q = i.doacoes.find((d) => d.chave === eu)?.quantidade; return q && !i.entregue ? [{ i, q }] : []; });
  return { data: ev.data, html: `<div class="of-meus-g"><span class="of-meus-data"><span class="eyebrow">${dataBR(ev.data)}</span><span class="ent">${esc(Dia(ev.data))}</span></span>
      <button class="btn link of-meus-tit" data-act="iemver" data-g="${g.id}">${esc(ev.nome)} ›</button>
      <div class="of-meus-med"><span><span class="muted">Grupo:</span> <b>${esc(nomeGrupo(g))}</b></span><span><span class="muted">Responsável:</span> <b>${g.responsavel ? esc(g.responsavel) : '—'}</b></span></div>
      ${meus.length ? `<ul>${meus.map(({ i, q }) => `<li><b>${q}</b> ${esc(i.nome)} <span class="muted">· entrega ${textoEntrega(i)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0;font-size:.9rem">Nenhum item assumido. Abra o grupo e toque em + no item.</p>'}</div>` };
}

export function comoOferenda(id) {
  const ev = estado.iemanja?.eventos?.find((e) => e.grupos.some((g) => g.id === id));
  return ev ? paraCompartilhar(ev, ev.grupos.find((g) => g.id === id)) : null;
}

function blocoEvento(ev) {
  const adm = comoAdmin(ev);
  const grupos = `<div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, adm)).join('')}</div>`;
  const cabecalho = `<div class="datehead"><span class="eyebrow">${dataBR(ev.data)}</span><span class="dia of-titulo">${esc(ev.nome)}</span><span class="ent">${esc(Dia(ev.data))}</span></div>`;
  if (!adm) return `<div class="card iem-topo">${cabecalho}${grupos}</div>`;
  const editando = ui.edit?.id === ev.id;
  const dados = editando
    ? `<div class="iem-ed"><label class="field iem-larga">Nome do evento<input type="text" data-act="iemevnome" maxlength="80" value="${esc(ui.edit.nome)}"></label>
      <label class="field iem-larga">Data do evento<input type="date" data-act="iemdata" value="${esc(ui.edit.data)}"></label></div>`
    : cabecalho;
  return `<div class="card adm iem-topo"><label class="of-sw"><input type="checkbox" role="switch" data-act="iemvisivel" data-id="${ev.id}" ${ev.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
    <div class="cp-bts">${editando ? `<button class="btn" data-act="iemcancelar">${icone('✕', 'Cancelar')}</button><button class="btn primary" data-act="iemsalvar">${icone('✓', 'Salvar')}</button>` : `<button class="btn" data-act="iemeditar">${icone('✎', 'Editar')}</button>`}
      <button class="btn" data-act="iemjanela" data-t="encerrar">${icone('🔒', 'Encerrar')}</button></div>
    ${dados}
    <div class="cp-bts"><button class="btn" data-act="iemjanela" data-t="novaOferenda">${icone('＋', 'Nova oferenda')}</button><button class="btn ${ui.categorias ? 'primary' : ''}" data-act="iemcats" aria-pressed="${ui.categorias}">${icone('🏷️', `Categorias (${categoriasDe(ev).length})`)}</button>${souRoot() ? `<button class="btn" data-act="iemnovoaviso">${icone('＋', 'Novo evento')}</button>` : ''}</div>
    ${ui.categorias ? blocoCategorias(ev) : ''}
    <div class="of-sec"><h2><span aria-hidden="true">🕯️</span> Oferendas</h2><span class="of-sec-n">${ev.grupos.length}</span></div>
    ${grupos}</div>
    ${blocoSorteio(ev)}`;
}

// Painel do botão Categorias: a lista do evento, com subir, excluir e adicionar.
function blocoCategorias(ev) {
  const l = categoriasDe(ev);
  const usos = (c) => ev.grupos.reduce((n, g) => n + g.itens.filter((i) => (i.categoria || '').toLocaleLowerCase('pt-BR') === c.toLocaleLowerCase('pt-BR')).length, 0);
  const linhas = l.map((c, k) => `<div class="iem-p"><span>${esc(c)} <small class="muted">· ${usos(c)} ${usos(c) === 1 ? 'item' : 'itens'}</small></span><span class="iem-cat-bts">
      <button class="btn small" data-act="iemcatsobe" data-k="${k}" ${k ? '' : 'disabled'} aria-label="Subir ${esc(c)}">↑</button>
      <button class="btn small" data-act="iemcatdel" data-k="${k}" aria-label="Excluir ${esc(c)}">✕</button></span></div>`).join('');
  return `<div class="iem-cats"><div class="grp-h"><h3>🏷️ Categorias</h3><button class="btn small" data-act="iemcats">Fechar</button></div>
    <p class="muted" style="margin:0;font-size:.88rem">Valem para todas as oferendas deste evento. Os itens aparecem nesta ordem.</p>
    <div class="iem-lista">${linhas || '<p class="muted" style="margin:0">Nenhuma categoria ainda.</p>'}</div>
    <form class="iem-add" data-form="iemcat" autocomplete="off"><input type="text" name="categoria" maxlength="40" required placeholder="Nova categoria (ex.: Flores)" aria-label="Nova categoria"><button class="btn primary" type="submit">Adicionar</button></form></div>`;
}

function blocoHistorico(lista) {
  if (!lista.length) return '';
  const k = 'hist';
  return `<div class="card"><button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h2>🧾 Histórico</h2><span class="count">${lista.length} ${seta(k)}</span></button>
    ${ui.abertos.has(k) ? lista.map((ev) => { const ke = 'e:' + ev.id; return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${ke}" aria-expanded="${ui.abertos.has(ke)}"><h3>${esc(ev.nome)} · ${dataBR(ev.data)}</h3><span class="count">${seta(ke)}</span></button>${ui.abertos.has(ke) ? `<div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, false)).join('')}</div>` : ''}</div>`; }).join('') : ''}</div>`;
}

const eventoAberto = () => estado.iemanja.eventos.find((e) => !e.encerradoEm);
const itemDe = (id) => eventoAberto()?.grupos.flatMap((g) => g.itens).find((i) => i.id === id);

const TEXTOS = {
  novaOferenda: ['Criar nova oferenda?', 'Um novo grupo será criado neste evento.', 'Criar'],
  sortear: ['Sortear agora?', 'As pessoas das listas serão divididas nos grupos.', 'Sortear'],
  cancelar: ['Cancelar o sorteio?', 'As pessoas sorteadas saem dos grupos e os itens que elas assumiram ficam sem responsável. Quem foi adicionado direto a um grupo continua nele.', 'Cancelar sorteio'],
  encerrar: ['Encerrar o evento?', 'O evento vai para o Histórico e não poderá mais ser alterado.', 'Encerrar'],
};
function textosJanela(j) {
  if (j.t === 'entregue') {
    const i = itemDe(j.i);
    if (!i) return null;
    const resp = i.doacoes.map((d) => `${esc(d.nome)} (${d.quantidade})`).join(', ');
    return ['Confirmar entrega', `<b>${esc(i.nome)}</b> foi entregue?${resp ? `<br><span class="muted">Responsáveis: ${resp}</span>` : ''}`, 'Sim, entregue', 'primary'];
  }
  if (!j.g) return [...TEXTOS[j.t], 'primary'];
  const g = eventoAberto()?.grupos.find((x) => x.id === j.g);
  if (!g) return null;
  if (j.t === 'excluirGrupo') return ['Excluir este grupo?', `<b>${esc(nomeGrupo(g))}</b>: os itens, as doações e as pessoas deste grupo saem do evento. Não dá para desfazer.`, 'Excluir grupo', 'danger'];
  const r = ui.rascunho[j.g];
  return ['Adicionar este item?', `${r.categoria ? `${esc(r.categoria)}: ` : ''}<b>${esc(r.quantidade)}</b> × ${esc(r.nome)} no grupo <b>${esc(nomeGrupo(g))}</b>.<br><span class="muted">Entrega: ${textoEntrega(r)}</span>`, 'Adicionar', 'primary'];
}
function janela() {
  const t = ui.janela && textosJanela(ui.janela);
  if (!t) return '';
  const [titulo, txt, bt, cor] = t;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-t"><div class="modal"><h3 id="iem-t">${titulo}</h3><p style="margin:0">${txt}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="iemjanelanao">Voltar</button><button class="btn ${cor}" data-act="iemjanelasim">${bt}</button></div></div></div>`;
}

export function conteudo() {
  const I = estado.iemanja;
  if (I.erro) return `<div class="card"><p class="muted" style="margin:0">${esc(I.erro)}</p></div>`;
  const aberto = I.eventos.find((e) => !e.encerradoEm);
  const novo = !aberto && souRoot() ? `<div class="card adm"><div class="grp-h"><h2>Novo evento</h2></div><label class="field">Nome do evento<input type="text" id="iem-nova-nome" maxlength="80" placeholder="Oferenda de Iemanjá"></label><label class="field">Data do evento<input type="date" id="iem-nova-data"></label>
    <div class="cp-bts"><button class="btn primary" data-act="iemnovo">${icone('＋', 'Novo evento')}</button></div></div>` : '';
  // Detalhes do evento em andamento, acima do bloco do evento (ADMIN).
  const det = aberto ? blocoDetalhes(aberto.id, aberto.detalhes, comoAdmin(aberto), 'iemdetsalvar') : '';
  return `${novo}${det}${aberto ? blocoEvento(aberto) : ''}${blocoHistorico(I.eventos.filter((e) => e.encerradoEm))}${janela()}`;
}

// Oferenda criada ou excluída durante a edição: mantém o que já foi escolhido nas outras.
function sincronizarEdicao() {
  if (!ui.edit) return;
  ui.edit.grupos = Object.fromEntries(eventoAberto().grupos.map((g) => [g.id, ui.edit.grupos[g.id] || { nome: g.nome, responsavelId: g.responsavelId || '' }]));
}

export const cliques = {
  iemdobra(el) { const k = el.dataset.k; if (ui.abertos.has(k)) ui.abertos.delete(k); else ui.abertos.add(k); avisar(); },
  iemeditar() {
    const ev = eventoAberto();
    ui.edit = { id: ev.id, nome: ev.nome, data: ev.data, grupos: Object.fromEntries(ev.grupos.map((g) => [g.id, { nome: g.nome, responsavelId: g.responsavelId || '' }])) };
    avisar();
  },
  iemcancelar() { ui.edit = null; avisar(); },
  async iemsalvar() {
    if (!ui.edit.data) { toast('Escolha a data do evento.'); return; }
    const grupos = Object.entries(ui.edit.grupos).map(([id, g]) => ({ id, ...g }));
    if (await acaoIemanja('salvar', { id: ui.edit.id, nome: ui.edit.nome, data: ui.edit.data, grupos })) { ui.edit = null; toast('Evento salvo.'); avisar(); }
  },
  iemjanela(el) { ui.janela = { t: el.dataset.t, g: el.dataset.g }; avisar(); },
  iemjanelanao() { ui.janela = null; avisar(); },
  async iemjanelasim() {
    const { t, g, i } = ui.janela;
    ui.janela = null;
    if (t === 'novaOferenda') {
      if (await acaoIemanja('grupoNovo', { id: eventoAberto().id })) { sincronizarEdicao(); toast('Oferenda criada. Escolha o orixá ou a entidade em Editar.'); }
    } else if (t === 'entregue') {
      if (await acaoIemanja('entregue', { itemId: i, entregue: true })) toast('Item marcado como entregue.');
    } else if (t === 'item') {
      if (await acaoIemanja('item', { grupoId: g, ...ui.rascunho[g] })) { delete ui.rascunho[g]; toast('Item adicionado.'); }
    } else if (t === 'excluirGrupo') {
      if (await acaoIemanja('grupoExcluir', { grupoId: g })) { sincronizarEdicao(); toast('Grupo excluído.'); }
    } else {
      const id = eventoAberto()?.id;
      const op = { sortear: 'sortear', cancelar: 'cancelarSorteio', encerrar: 'encerrar' }[t];
      if (await acaoIemanja(op, { id })) { if (t === 'encerrar') ui.edit = null; toast({ sortear: 'Sorteio realizado.', cancelar: 'Sorteio cancelado.', encerrar: 'Evento encerrado.' }[t]); }
    }
    avisar();
  },
  iemdetsalvar(el) { return salvarDetalhes((detalhes) => acaoIemanja('detalhes', { id: el.dataset.id, detalhes })); },
  iemcats() { ui.categorias = !ui.categorias; avisar(); },
  iemcatsobe(el) {
    const l = [...categoriasDe(eventoAberto())];
    const k = Number(el.dataset.k);
    [l[k - 1], l[k]] = [l[k], l[k - 1]];
    acaoIemanja('categorias', { id: eventoAberto().id, categorias: l });
  },
  async iemcatdel(el) {
    const ev = eventoAberto();
    const c = categoriasDe(ev)[Number(el.dataset.k)];
    const usada = ev.grupos.some((g) => g.itens.some((i) => i.categoria === c));
    if (await acaoIemanja('categorias', { id: ev.id, categorias: categoriasDe(ev).filter((x) => x !== c) })) toast(usada ? `Categoria excluída. Os itens de ${c} continuam nela até serem editados.` : 'Categoria excluída.');
  },
  iemnovoaviso() { toast('Encerre o evento atual antes de criar outro.'); },
  async iemnovo() {
    const data = val('iem-nova-data');
    if (!data) { toast('Escolha a data do evento.'); return; }
    if (await acaoIemanja('novo', { data, nome: val('iem-nova-nome') })) toast('Evento criado.');
  },
  iemver(el) {
    ui.abertos.add('g:' + el.dataset.g);
    avisar();
    setTimeout(() => document.getElementById('iem-g-' + el.dataset.g)?.scrollIntoView({ block: 'start' }), 0);
  },
  iemfora(el) { acaoIemanja('fora', { id: eventoAberto().id, chave: el.dataset.c, fora: el.dataset.v === '1' }); },
  async iemadicionar() {
    const chave = val('iem-add-p');
    const grupoId = val('iem-add-g');
    if (!chave || !grupoId) { toast('Escolha a pessoa e o grupo.'); return; }
    if (await acaoIemanja('adicionar', { grupoId, chave })) toast('Pessoa adicionada ao grupo.');
  },
  async iemassociar(el) {
    const chave = val('iem-p-' + el.dataset.g);
    if (!chave) { toast('Escolha a pessoa.'); return; }
    await acaoIemanja('adicionar', { grupoId: el.dataset.g, chave });
  },
  iemretirar(el) { acaoIemanja('retirar', { grupoId: el.dataset.g, chave: el.dataset.c }); },
  iemdelitem(el) { acaoIemanja('excluirItem', { itemId: el.dataset.id }); },
  iemaskentregue(el) { ui.janela = { t: 'entregue', i: el.dataset.id }; avisar(); },
  async iementregue(el) { if (await acaoIemanja('entregue', { itemId: el.dataset.id, entregue: el.dataset.v === '1' })) toast('Entrega desfeita.'); },
  iemofmais(el) { assumirMeu(el.dataset.id, +1); },
  iemofmenos(el) { assumirMeu(el.dataset.id, -1); },
  iempormais(el) { assumirDe(el, +1); },
  iempormenos(el) { assumirDe(el, -1); },
  async iempordel(el) { if (await acaoIemanja('assumirPor', { itemId: el.dataset.item, chave: el.dataset.chave, quantidade: 0 })) toast('Doação excluída.'); },
};

function assumirMeu(itemId, delta) {
  const minha = itemDe(itemId).doacoes.find((d) => d.chave === estado.iemanja.eu?.chave)?.quantidade || 0;
  acaoIemanja('assumir', { itemId, quantidade: Math.max(0, minha + delta) });
}

function assumirDe(el, delta) {
  const d = itemDe(el.dataset.item)?.doacoes.find((x) => x.chave === el.dataset.chave);
  if (d) acaoIemanja('assumirPor', { itemId: el.dataset.item, chave: d.chave, quantidade: Math.max(0, d.quantidade + delta) });
}

// Formulários: adicionar (com confirmação) e editar item, e doação por outra pessoa do grupo.
export async function enviar(form) {
  const v = (n) => form.elements[n]?.value ?? '';
  if (form.dataset.form === 'iemcat') {
    const ev = eventoAberto();
    if (await acaoIemanja('categorias', { id: ev.id, categorias: [...categoriasDe(ev), v('categoria')] })) toast('Categoria criada.');
    return;
  }
  if (form.dataset.form === 'iemporpessoa') {
    if (!v('pessoa')) { toast('Escolha a pessoa.'); return; }
    if (await acaoIemanja('assumirPor', { itemId: form.dataset.item, chave: v('pessoa'), quantidade: v('qtd') })) toast('Doação registrada.');
    return;
  }
  const entrega = v('modo') === 'data' ? v('entrega') : '';
  if (v('modo') === 'data' && !entrega) { toast('Escolha a data da entrega.'); return; }
  const dados = { categoria: v('categoria').trim(), nome: v('nome').trim(), quantidade: v('qtd'), entrega };
  if (form.dataset.form === 'iemitem') {
    ui.rascunho[form.dataset.of] = dados;
    ui.janela = { t: 'item', g: form.dataset.of };
    avisar();
  } else if (await acaoIemanja('item', { itemId: form.dataset.id, ...dados })) {
    U().editarItem = null;
    toast('Item salvo.');
    avisar();
  }
}

export const mudancas = {
  iemnome(t) { if (ui.edit) ui.edit.grupos[t.dataset.id].nome = t.value; },
  iemresp(t) { if (ui.edit) ui.edit.grupos[t.dataset.id].responsavelId = t.value; },
  iemevnome(t) { if (ui.edit) ui.edit.nome = t.value; },
  iemdata(t) { if (ui.edit) ui.edit.data = t.value; },
  async iemvisivel(t) {
    const visivel = t.checked;
    if (!(await acaoIemanja('visivel', { id: t.dataset.id, visivel }))) t.checked = !visivel;
  },
  async iemlista(t) {
    const listas = [...t.closest('.iem-chips').querySelectorAll('input:checked')].map((x) => x.value);
    if (!(await acaoIemanja('listas', { id: eventoAberto().id, listas }))) avisar();
  },
};
