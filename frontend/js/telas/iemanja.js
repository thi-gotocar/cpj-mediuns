// Tela "Iemanjá": a oferenda dividida em 5 grupos, o sorteio das pessoas e o histórico dos eventos.

import { estado, avisar, carregarIemanja, acaoIemanja } from '../estado.js';
import { esc, toast } from '../util.js';
import { ORIXAS } from '/shared/regras.js';
import { NOMES_ENTIDADES } from '/shared/iemanja.js';
import { dataBR, faixaPct } from '/shared/oferendas.js';

const ui = { abertos: new Set(), edit: null, janela: null, novaData: '' };
const val = (id) => document.getElementById(id)?.value ?? '';
// A visão CPJ/Alunos do root mostra o que a corrente vê.
const comoAdmin = (ev) => ev.admin && (estado.me?.papel !== 'root' || estado.visaoRoot === 'root');
const souRoot = () => !!estado.iemanja?.root && estado.visaoRoot === 'root';

const seta = (k) => `<span class="seta" aria-hidden="true">${ui.abertos.has(k) ? '▾' : '▸'}</span>`;
const icone = (i, t) => `<span aria-hidden="true">${i}</span> ${t}`;

function opcoesNome(atual) {
  const op = (n) => `<option ${n === atual ? 'selected' : ''}>${esc(n)}</option>`;
  return `<option value="">— escolha —</option><optgroup label="Orixás">${ORIXAS.map(op).join('')}</optgroup><optgroup label="Entidades">${NOMES_ENTIDADES.map(op).join('')}</optgroup>`;
}

function linhaItem(g, i, ev, adm) {
  const assumido = i.doacoes.reduce((a, d) => a + d.quantidade, 0);
  const minha = i.doacoes.find((d) => d.chave === estado.iemanja.eu?.chave)?.quantidade || 0;
  const falta = Math.max(0, i.quantidade - assumido);
  const aberto = !ev.encerradoEm;
  const conf = estado.confirm === 'iem:' + i.id;
  return `<div class="ofg-l"><span class="ofg-nome">${esc(i.nome)}<small class="muted">${assumido} de ${i.quantidade}${i.doacoes.length ? ` · ${i.doacoes.map((d) => `${esc(d.nome)} (${d.quantidade})`).join(', ')}` : ''}</small></span>
    <span class="ofg-qtd">${aberto && g.meu ? `<button class="btn small" data-act="iemassumir" data-id="${i.id}" data-q="${minha - 1}" ${minha ? '' : 'disabled'} aria-label="Menos ${esc(i.nome)}">−</button><b>${minha}</b><button class="btn small ${minha ? '' : 'primary'}" data-act="iemassumir" data-id="${i.id}" data-q="${minha + 1}" ${falta ? '' : 'disabled'} aria-label="Assumir ${esc(i.nome)}">+</button>` : ''}
    ${aberto && adm ? (conf ? `<button class="btn small danger" data-act="iemexcluiritem" data-id="${i.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="iem:${i.id}" aria-label="Excluir ${esc(i.nome)}">✕</button>`) : ''}</span></div>`;
}

function blocoPessoas(g, ev, adm, C) {
  const k = 'p:' + g.id;
  const ja = new Set(g.membros.map((m) => m.chave));
  const opcao = (p) => `<option value="${esc(p.chave)}">${esc(p.nome)}</option>`;
  const grupo = (t, l) => { const x = l.filter((p) => !ja.has(p.chave)); return x.length ? `<optgroup label="${t}">${x.map(opcao).join('')}</optgroup>` : ''; };
  return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h3>Pessoas do grupo</h3><span class="count">${g.membros.length} ${seta(k)}</span></button>
    ${ui.abertos.has(k) ? `<div class="iem-lista">${g.membros.map((m) => `<div class="iem-p"><span>${esc(m.nome)}</span>${adm && !ev.encerradoEm ? `<button class="btn small" data-act="iemretirar" data-g="${g.id}" data-c="${esc(m.chave)}" aria-label="Retirar ${esc(m.nome)} do grupo">✕</button>` : ''}</div>`).join('') || '<p class="muted" style="margin:0">Ninguém no grupo ainda.</p>'}</div>
      ${adm && !ev.encerradoEm && C ? `<div class="iem-add"><select id="iem-p-${g.id}" aria-label="Associar pessoa ao grupo"><option value="">+ associar pessoa</option>${grupo('Corrente', C.corrente)}${grupo('Turma 09', C.turma09)}${grupo('Turma 10', C.turma10)}${grupo('Outros alunos', C.outros)}</select><button class="btn small" data-act="iemassociar" data-g="${g.id}">Associar</button></div>` : ''}` : ''}</div>`;
}

function cardGrupo(ev, g, adm) {
  const k = 'g:' + g.id;
  const aberto = g.abre && ui.abertos.has(k);
  const I = estado.iemanja;
  const ed = ui.edit?.id === ev.id ? ui.edit.grupos[g.id] : null;
  const info = `<span class="iem-tit"><b>${esc(g.nome || `Grupo ${g.ordem}`)}</b><small class="muted">${g.responsavel ? esc(g.responsavel) : 'Sem responsável'}</small></span><span class="of-pct ${faixaPct(g.pct)} iem-pct">${g.pct}%</span>`;
  const cab = g.abre
    ? `<button class="grp-h dobra iem-cab" data-act="iemdobra" data-k="${k}" aria-expanded="${aberto}">${info}${seta(k)}</button>`
    : `<div class="grp-h iem-cab">${info}</div>`;
  const edicao = ed ? `<div class="iem-ed"><label class="field">Orixá ou entidade<select data-act="iemnome" data-id="${g.id}">${opcoesNome(ed.nome)}</select></label>
    <label class="field">Responsável<select data-act="iemresp" data-id="${g.id}" ${souRoot() ? '' : 'disabled'}><option value="">— sem responsável —</option>${(I.candidatos?.corrente || []).map((p) => `<option value="${p.pessoaId}" ${p.pessoaId === ed.responsavelId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label></div>` : '';
  if (!aberto) return `<div class="card iem-grupo">${cab}${edicao}</div>`;
  const itens = g.itens.length ? `<div class="iem-lista">${g.itens.map((i) => linhaItem(g, i, ev, adm)).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum item ainda.</p>';
  const novoItem = adm && !ev.encerradoEm ? `<div class="iem-add iem-item"><input type="text" id="iem-i-n-${g.id}" maxlength="80" placeholder="Item" aria-label="Nome do item"><input type="number" inputmode="numeric" id="iem-i-q-${g.id}" min="1" max="9999" value="1" aria-label="Quantidade"><button class="btn small" data-act="iemitem" data-g="${g.id}" aria-label="Adicionar item">＋</button></div>` : '';
  return `<div class="card iem-grupo">${cab}${edicao}${itens}${novoItem}${blocoPessoas(g, ev, adm, I.candidatos)}</div>`;
}

function listaSorteio(ev, k, titulo, pessoas, presos, fora) {
  const lista = pessoas.filter((p) => !presos.has(p.chave));
  const kk = 's:' + k;
  const dentro = lista.filter((p) => !fora.has(p.chave)).length;
  return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${kk}" aria-expanded="${ui.abertos.has(kk)}"><h3>${titulo}</h3><span class="count">${dentro} ${seta(kk)}</span></button>
    ${ui.abertos.has(kk) ? `<div class="iem-lista">${lista.map((p) => `<div class="iem-p ${fora.has(p.chave) ? 'fora' : ''}"><span>${esc(p.nome)}</span><button class="btn small" data-act="iemfora" data-c="${esc(p.chave)}" data-v="${fora.has(p.chave) ? '0' : '1'}" aria-label="${fora.has(p.chave) ? 'Voltar' : 'Tirar'} ${esc(p.nome)} do sorteio">${fora.has(p.chave) ? '↺' : '✕'}</button></div>`).join('') || '<p class="muted" style="margin:0">Ninguém nesta lista.</p>'}</div>` : ''}</div>`;
}

function blocoSorteio(ev) {
  const C = estado.iemanja.candidatos;
  if (!C) return '';
  const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  const fora = new Set(ev.fora);
  const opcao = (p) => `<option value="${esc(p.chave)}">${esc(p.nome)}</option>`;
  const adicionar = `<div class="iem-add iem-add2"><select id="iem-add-p" aria-label="Pessoa"><option value="">Buscar pessoa…</option>
      <optgroup label="Corrente">${C.corrente.map(opcao).join('')}</optgroup><optgroup label="Turma 09">${C.turma09.map(opcao).join('')}</optgroup><optgroup label="Turma 10">${C.turma10.map(opcao).join('')}</optgroup><optgroup label="Outros alunos">${C.outros.map(opcao).join('')}</optgroup></select>
    <select id="iem-add-g" aria-label="Grupo"><option value="">Grupo…</option>${ev.grupos.map((g) => `<option value="${g.id}">${esc(g.nome || `Grupo ${g.ordem}`)}</option>`).join('')}</select></div>
    <div class="cp-bts"><button class="btn" data-act="iemadicionar">${icone('＋', 'Adicionar')}</button>${ev.sorteado
      ? `<button class="btn" data-act="iemjanela" data-t="cancelar">${icone('✕', 'Cancelar sorteio')}</button>`
      : `<button class="btn primary" data-act="iemjanela" data-t="sortear">${icone('🎲', 'Sortear')}</button>`}</div>`;
  return `<div class="card adm iem-sorteio"><div class="grp-h"><h2>🎲 Sorteio</h2><span class="count">${ev.sorteado ? 'realizado' : 'a fazer'}</span></div>
    ${ev.sorteado ? '' : listaSorteio(ev, 'corrente', 'Cadastro da corrente', C.corrente, presos, fora) + listaSorteio(ev, 't9', 'Turma 09', C.turma09, presos, fora) + listaSorteio(ev, 't10', 'Turma 10', C.turma10, presos, fora)}
    ${adicionar}</div>`;
}

function blocoEvento(ev) {
  const adm = comoAdmin(ev);
  const editando = ui.edit?.id === ev.id;
  const topo = adm ? `<div class="card adm iem-topo"><label class="of-sw"><input type="checkbox" role="switch" data-act="iemvisivel" data-id="${ev.id}" ${ev.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
    <div class="cp-bts">${editando ? `<button class="btn" data-act="iemcancelar">${icone('✕', 'Cancelar')}</button><button class="btn primary" data-act="iemsalvar">${icone('✓', 'Salvar')}</button>` : `<button class="btn" data-act="iemeditar">${icone('✎', 'Editar')}</button>`}
      <button class="btn" data-act="iemjanela" data-t="encerrar">${icone('🔒', 'Encerrar')}</button></div></div>` : '';
  const data = adm
    ? `<label class="ev-data-adm iem-data" title="Alterar a data do evento"><span aria-hidden="true">📅</span> ${dataBR(ev.data)} <span class="seta" aria-hidden="true">▾</span><input type="date" data-act="iemdata" data-id="${ev.id}" value="${esc(ev.data)}" aria-label="Alterar a data do evento"></label>`
    : `<span class="dia">${dataBR(ev.data)}</span>`;
  return `${topo}<div class="card"><div class="datehead"><span class="eyebrow">Oferenda de Iemanjá</span>${data}</div></div>
    ${adm ? blocoSorteio(ev) : ''}
    <div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, adm)).join('')}</div>`;
}

function blocoHistorico(lista) {
  if (!lista.length) return '';
  const k = 'hist';
  return `<div class="card"><button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h2>🧾 Histórico</h2><span class="count">${lista.length} ${seta(k)}</span></button>
    ${ui.abertos.has(k) ? lista.map((ev) => { const ke = 'e:' + ev.id; return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${ke}" aria-expanded="${ui.abertos.has(ke)}"><h3>${dataBR(ev.data)}</h3><span class="count">${seta(ke)}</span></button>${ui.abertos.has(ke) ? `<div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, false)).join('')}</div>` : ''}</div>`; }).join('') : ''}</div>`;
}

const TEXTOS = {
  sortear: ['Sortear agora?', 'As pessoas das listas serão divididas nos 5 grupos.', 'Sortear'],
  cancelar: ['Cancelar o sorteio?', 'As pessoas sorteadas saem dos grupos e os itens que elas assumiram ficam sem responsável. Quem foi adicionado direto a um grupo continua nele.', 'Cancelar sorteio'],
  encerrar: ['Encerrar o evento?', 'O evento vai para o Histórico e não poderá mais ser alterado.', 'Encerrar'],
};
function janela() {
  const j = ui.janela;
  if (!j) return '';
  const [t, txt, bt] = TEXTOS[j];
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-t"><div class="modal"><h3 id="iem-t">${t}</h3><p style="margin:0">${txt}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="iemjanelanao">Voltar</button><button class="btn primary" data-act="iemjanelasim">${bt}</button></div></div></div>`;
}

export function render() {
  if (estado.iemanja === null) { carregarIemanja(); return '<div class="loading">Carregando…</div>'; }
  const I = estado.iemanja;
  if (I.erro) return `<div class="card"><p class="muted" style="margin:0">${esc(I.erro)}</p></div>`;
  const aberto = I.eventos.find((e) => !e.encerradoEm);
  const novo = !aberto && souRoot() ? `<div class="card adm"><div class="grp-h"><h2>Novo evento</h2></div><label class="field">Data do evento<input type="date" id="iem-nova-data" value="${esc(ui.novaData)}"></label>
    <div class="cp-bts"><button class="btn primary" data-act="iemnovo">${icone('＋', 'Novo evento')}</button></div></div>` : '';
  return `<section class="panel">${novo}${aberto ? blocoEvento(aberto) : ''}${blocoHistorico(I.eventos.filter((e) => e.encerradoEm))}${janela()}</section>`;
}

const eventoAberto = () => estado.iemanja.eventos.find((e) => !e.encerradoEm);

export const cliques = {
  iemdobra(el) { const k = el.dataset.k; if (ui.abertos.has(k)) ui.abertos.delete(k); else ui.abertos.add(k); avisar(); },
  iemeditar() {
    const ev = eventoAberto();
    ui.edit = { id: ev.id, grupos: Object.fromEntries(ev.grupos.map((g) => [g.id, { nome: g.nome, responsavelId: g.responsavelId || '' }])) };
    avisar();
  },
  iemcancelar() { ui.edit = null; avisar(); },
  async iemsalvar() {
    const grupos = Object.entries(ui.edit.grupos).map(([id, g]) => ({ id, ...g }));
    if (await acaoIemanja('salvar', { id: ui.edit.id, grupos })) { ui.edit = null; toast('Evento salvo.'); avisar(); }
  },
  iemjanela(el) { ui.janela = el.dataset.t; avisar(); },
  iemjanelanao() { ui.janela = null; avisar(); },
  async iemjanelasim() {
    const t = ui.janela;
    ui.janela = null;
    const id = eventoAberto()?.id;
    const op = { sortear: 'sortear', cancelar: 'cancelarSorteio', encerrar: 'encerrar' }[t];
    if (await acaoIemanja(op, { id })) { if (t === 'encerrar') ui.edit = null; toast({ sortear: 'Sorteio realizado.', cancelar: 'Sorteio cancelado.', encerrar: 'Evento encerrado.' }[t]); }
    avisar();
  },
  async iemnovo() {
    const data = val('iem-nova-data');
    if (!data) { toast('Escolha a data do evento.'); return; }
    if (await acaoIemanja('novo', { data })) { ui.novaData = ''; toast('Evento criado.'); }
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
  async iemitem(el) {
    const g = el.dataset.g;
    const nome = val('iem-i-n-' + g).trim();
    if (!nome) { toast('Escreva o item.'); return; }
    await acaoIemanja('item', { grupoId: g, nome, quantidade: val('iem-i-q-' + g) });
  },
  iemexcluiritem(el) { estado.confirm = null; acaoIemanja('excluirItem', { itemId: el.dataset.id }); },
  iemassumir(el) { acaoIemanja('assumir', { itemId: el.dataset.id, quantidade: Math.max(0, Number(el.dataset.q)) }); },
};

export const mudancas = {
  iemnome(t) { if (ui.edit) ui.edit.grupos[t.dataset.id].nome = t.value; },
  iemresp(t) { if (ui.edit) ui.edit.grupos[t.dataset.id].responsavelId = t.value; },
  async iemvisivel(t) {
    const visivel = t.checked;
    if (!(await acaoIemanja('visivel', { id: t.dataset.id, visivel }))) t.checked = !visivel;
  },
  iemdata(t) { if (t.value) acaoIemanja('salvar', { id: t.dataset.id, data: t.value }); },
};
