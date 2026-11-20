// Sub-aba "Iemanjá" de Oferendas: as oferendas (grupos) do evento, o sorteio das pessoas e o histórico dos eventos.

import { estado, avisar, acaoIemanja } from '../estado.js';
import { esc, toast, baixar } from '../util.js';
import { ORIXAS } from '/shared/regras.js';
import { NOMES_ENTIDADES, LISTA_CURIMBA, porListaIemanja } from '/shared/iemanja.js';
import { gerarImagemPessoas, gerarImagemOferenda, gerarImagemResumo } from '../imagemOferenda.js';
import { dataBR, faixaPct, textoEntrega, qtdTxt, qtdAntes, situacao, arred, passoLevar, responsaveisItem } from '/shared/oferendas.js';
import { U, Dia, camposItem, listaItens, textoCompartilhar, blocoDetalhes, salvarDetalhes } from './oferendaComum.js';
import { ICONE_WHATS } from './giraComum.js';

// sel: o que está escolhido nos combos de Associar e Trocar (para um redesenho não apagar);
// escolha: janela "de qual oferenda?" das listas de pessoas ou de itens.
// novoTransp: formulário do "+ Novo transporte" aberto ({ descricao, responsavelId }).
const ui = { abertos: new Set(), edit: null, janela: null, rascunho: {}, sel: {}, escolha: null, novoTransp: null };
const val = (id) => document.getElementById(id)?.value ?? '';
// A visão CPJ/Alunos do root mostra o que a corrente vê.
const comoAdmin = (ev) => ev.admin && (estado.me?.papel !== 'root' || estado.visaoRoot === 'root');
const souRoot = () => !!estado.iemanja?.root && estado.visaoRoot === 'root';

const seta = (k) => `<span class="seta" aria-hidden="true">${ui.abertos.has(k) ? '▾' : '▸'}</span>`;
const icone = (i, t) => `<span aria-hidden="true">${i}</span> ${t}`;
const nomeGrupo = (g) => g.nome || `Grupo ${g.ordem}`;
// Categorias do evento: valem para todas as oferendas (grupos) e dão a ordem dos itens.
const categoriasDe = (ev) => ev.categorias || [];
// Item de todos: cada pessoa do grupo é responsável (aparece como 'Todos do grupo').
const TODOS_GRUPO = 'Todos do grupo';
const itensDe = (g) => g.itens.map((i) => (i.todos ? { ...i, todosRotulo: TODOS_GRUPO } : i));
// A pessoa tem item no grupo: assumiu algum ou há item de todos.
const temItemNo = (g, chave) => g.itens.some((i) => i.todos || i.doacoes.some((d) => d.chave === chave));
const paraCompartilhar = (ev, g) => ({ id: g.id, titulo: `${ev.nome} · ${nomeGrupo(g)}`, data: ev.data, responsavel: g.responsavel, porMedium: false, itens: itensDe(g), categorias: categoriasDe(ev), detalhes: ev.detalhes || '' });

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

// Pessoas do grupo separadas por lista (Corrente, Curimba, cada turma), nomes em duas colunas.
// Tocar no subtítulo da lista minimiza e expande. Associar e trocar pessoas ficam no bloco ADMIN ROOT (só o root).
function blocoPessoas(g, ev, adm) {
  const k = 'p:' + g.id;
  const retira = adm && !ev.encerradoEm;
  // Admin: borda verde-limão em quem já escolheu item para levar nesta oferenda; vermelha em quem ainda não tem.
  const temItem = (m) => temItemNo(g, m.chave);
  const pessoa = (m) => `<div class="iem-p${adm ? (temItem(m) ? ' com-item' : ' sem-item') : ''}" ${adm ? `title="${temItem(m) ? 'Já escolheu item' : 'Ainda sem item'}"` : ''}><span>${esc(m.nome)}</span>${retira ? `<button class="btn small" data-act="iemretirar" data-g="${g.id}" data-c="${esc(m.chave)}" aria-label="Retirar ${esc(m.nome)} do grupo">✕</button>` : ''}</div>`;
  const listas = porListaIemanja(g.membros).map(([lista, ms]) => {
    const kl = `pl:${g.id}:${lista}`;   // presente = minimizada
    const min = ui.abertos.has(kl);
    return `<div class="iem-pg-l"><button class="iem-pg-t dobra" data-act="iemdobra" data-k="${esc(kl)}" aria-expanded="${!min}">${esc(lista)} <span>· ${ms.length}</span> <span class="seta" aria-hidden="true">${min ? '▸' : '▾'}</span></button>${min ? '' : `<div class="iem-pg-nomes">${ms.map(pessoa).join('')}</div>`}</div>`;
  }).join('');
  return `<div class="iem-mini"><button class="iem-itens-bt" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><span><span aria-hidden="true">👥</span> Pessoas do grupo <span class="iem-itens-n">${g.membros.length}</span></span><span class="iem-itens-acao">${ui.abertos.has(k) ? 'Fechar ▾' : 'Ver pessoas ▸'}</span></button>
    ${ui.abertos.has(k) ? (listas ? `<div class="iem-pg">${listas}</div>` : '<p class="muted" style="margin:0">Ninguém no grupo ainda.</p>') : ''}</div>`;
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
  // Itens: começam minimizados; tocar no título abre e fecha.
  const ki = 'i:' + g.id;
  const itensAbertos = ui.abertos.has(ki);
  const itens = `<div class="ofg-sec"><button class="iem-itens-bt" data-act="iemdobra" data-k="${ki}" aria-expanded="${itensAbertos}"><span><span aria-hidden="true">📦</span> Itens <span class="iem-itens-n">${g.itens.length}</span></span><span class="iem-itens-acao">${itensAbertos ? 'Fechar ▾' : 'Ver itens ▸'}</span></button>${!itensAbertos ? '' : g.itens.length ? listaItens(itensDe(g), { p: 'iem', eu: estado.iemanja.eu, admin: pode, ref: ev, podeDoar: !ev.encerradoEm && g.meu, opcoesDoador, categorias: categoriasDe(ev), chave: g.id, todosRotulo: TODOS_GRUPO, todosN: g.membros.length }) : '<p class="muted" style="margin:0">Nenhum item ainda.</p>'}</div>`;
  const novoItem = pode ? `<details class="of-novo"${U().novoItem === g.id ? ' open' : ''}><summary>+ Adicionar item</summary>
      <form class="row" data-form="iemitem" data-of="${g.id}" autocomplete="off">${camposItem(ui.rascunho[g.id], categoriasDe(ev), TODOS_GRUPO)}<button class="btn primary" type="submit">Adicionar</button></form></details>` : '';
  // Os botões de WhatsApp (Lista de pessoas / Lista de itens) ficam em ⚙️ Configurações, escolhendo a oferenda.
  // Excluir grupo fica oculto por enquanto (a ação continua no servidor).
  return `<div class="card iem-grupo" id="iem-g-${g.id}">${cab}${edicao}${barra}${novoItem}${itens}${blocoPessoas(g, ev, adm)}</div>`;
}

function listaSorteio(k, titulo, pessoas, presos, fora) {
  const lista = pessoas.filter((p) => !presos.has(p.chave));
  const kk = 's:' + k;
  const dentro = lista.filter((p) => !fora.has(p.chave)).length;
  return `<div class="iem-mini"><button class="grp-h dobra" data-act="iemdobra" data-k="${kk}" aria-expanded="${ui.abertos.has(kk)}"><h3>${esc(titulo)}</h3><span class="count">${dentro} ${seta(kk)}</span></button>
    ${ui.abertos.has(kk) ? `<div class="iem-lista">${lista.map((p) => `<div class="iem-p ${fora.has(p.chave) ? 'fora' : ''}"><span>${esc(p.nome)}</span><button class="btn small" data-act="iemfora" data-c="${esc(p.chave)}" data-v="${fora.has(p.chave) ? '0' : '1'}" aria-label="${fora.has(p.chave) ? 'Voltar' : 'Tirar'} ${esc(p.nome)} do sorteio">${fora.has(p.chave) ? '↺' : '✕'}</button></div>`).join('') || '<p class="muted" style="margin:0">Ninguém nesta lista.</p>'}</div>` : ''}</div>`;
}

// Totais do sorteio: quem já está num grupo e quem das listas do sorteio (corrente e as ligadas) ficou sem grupo.
// Tocar em "sem grupo" mostra os nomes, por lista.
function totaisSorteio(ev, C, presos, fora, ativas) {
  const listas = [['Corrente', C.corrente], ...(ativas.has(LISTA_CURIMBA) ? [['Curimba', C.curimba]] : []), ...C.turmas.filter((t) => ativas.has(t.id)).map((t) => [t.nome, t.pessoas])];
  const vistos = new Set();
  const sem = listas.map(([nome, ps]) => [nome, ps.filter((p) => !presos.has(p.chave) && !vistos.has(p.chave) && vistos.add(p.chave))]).filter(([, ps]) => ps.length);
  const nSem = sem.reduce((n, [, ps]) => n + ps.length, 0);
  const k = 'semgrupo';
  const aberto = ui.abertos.has(k) && nSem;
  return `<div class="iem-tot"><div class="iem-tot-n"><b>${presos.size}</b><span>em grupos</span></div>
      <button class="iem-tot-n sem" data-act="iemdobra" data-k="${k}" aria-expanded="${!!aberto}" ${nSem ? '' : 'disabled'}><b>${nSem}</b><span>sem grupo ${nSem ? seta(k) : ''}</span></button></div>
    ${aberto ? `<div class="iem-semg">${sem.map(([nome, ps]) => `<div class="iem-pg-l"><h4 class="iem-pg-t">${esc(nome)} <span>· ${ps.length}</span></h4>
      <div class="iem-pg-nomes">${ps.map((p) => `<div class="iem-p ${fora.has(p.chave) ? 'fora' : ''}"><span>${esc(p.nome)}</span>${fora.has(p.chave) ? '<small class="muted">fora do sorteio</small>' : ''}</div>`).join('')}</div></div>`).join('')}</div>` : ''}`;
}

function blocoSorteio(ev) {
  const C = estado.iemanja.candidatos;
  if (!C) return '';
  const k = 'sorteio';
  // Bloco ADMIN ROOT (só o root vê), com borda roxa: ⚙️ Configuração evento. Cada função vem minimizada.
  const cab = `<button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h2><span aria-hidden="true">⚙️</span> Configuração evento</h2><span class="count">${seta(k)}</span></button>`;
  if (!ui.abertos.has(k)) return `<div class="card adm root iem-sorteio iem-root">${cab}</div>`;
  const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  const fora = new Set(ev.fora);
  const ativas = new Set(ev.listas);
  const chip = (valor, nome) => `<label class="chip"><input type="checkbox" data-act="iemlista" value="${esc(valor)}" ${ativas.has(valor) ? 'checked' : ''}> ${esc(nome)}</label>`;
  const escolha = `<div class="ofg-sec"><span class="ofg-tit">Listas no sorteio</span><div class="iem-chips">${chip(LISTA_CURIMBA, 'Curimba')}${C.turmas.map((t) => chip(t.id, t.nome)).join('')}</div></div>`;
  const listas = listaSorteio('corrente', 'Corrente', C.corrente, presos, fora)
    + (ativas.has(LISTA_CURIMBA) ? listaSorteio('curimba', 'Curimba', C.curimba, presos, fora) : '')
    + C.turmas.filter((t) => ativas.has(t.id)).map((t) => listaSorteio(t.id, t.nome, t.pessoas, presos, fora)).join('');
  // Depois que alguém assumiu um item, o sorteio não se cancela mais (o servidor também recusa).
  const travado = ev.grupos.some((g) => g.itens.some((i) => i.doacoes.length));
  const botao = ev.sorteado
    ? `<div class="cp-bts iem-uma"><button class="btn" data-act="iemjanela" data-t="cancelar" ${travado ? 'disabled' : ''}>${icone('✕', 'Cancelar sorteio')}</button></div>
      ${travado ? '<p class="muted iem-trava">Já há itens assumidos nos grupos: o sorteio não pode mais ser cancelado.</p>' : ''}`
    : `<div class="cp-bts iem-uma"><button class="btn primary" data-act="iemjanela" data-t="sortear">${icone('🎲', 'Sortear')}</button></div>`;
  // As listas de pessoas ficam em ADMIN OFERENDAS (Lista de pessoas, escolhendo a oferenda).
  const secao = (kk, ico, titulo, extra, corpo) => {
    const a = ui.abertos.has(kk);
    return `<div class="iem-sec"><button class="iem-sec-h" data-act="iemdobra" data-k="${kk}" aria-expanded="${a}"><span><span aria-hidden="true">${ico}</span> ${titulo}</span><span class="iem-sec-x">${extra ? `<small>${extra}</small> ` : ''}${a ? '▾' : '▸'}</span></button>${a ? `<div class="iem-sec-c">${corpo}</div>` : ''}</div>`;
  };
  const transportes = ev.transportes || [];
  return `<div class="card adm root iem-sorteio iem-root">${cab}
    ${secao('rs:sorteio', '🎲', 'Sorteio', ev.sorteado ? 'realizado' : 'a fazer', (ev.sorteado ? '' : escolha + listas) + botao)}
    ${secao('rs:cat', '🏷️', 'Categorias', String(categoriasDe(ev).length), blocoCategorias(ev))}
    ${secao('rs:assoc', '＋', 'Associar pessoa a uma oferenda', '', blocoAssociar(ev))}
    ${secao('rs:troca', '⇄', 'Trocar pessoas de oferenda', '', blocoTrocar(ev))}
    ${secao('rs:excluir', '🗑️', 'Excluir oferenda ou transporte', '', blocoExcluir(ev, transportes))}
    ${secao('rs:novo', '＋', 'Novo evento', '', `<div class="cp-bts iem-uma"><button class="btn" data-act="iemnovoaviso">${icone('＋', 'Novo evento')}</button></div>`)}</div>`;
}

// Excluir uma oferenda (grupo) ou um transporte do evento, depois de confirmar (só o root).
function blocoExcluir(ev, transportes) {
  const s = ui.sel.excluir || '';
  return `<div class="iem-add"><select data-act="iemsel" data-campo="excluir" aria-label="O que excluir"><option value="">Escolha…</option>
      <optgroup label="Oferendas">${ev.grupos.map((g) => `<option value="g:${g.id}" ${s === 'g:' + g.id ? 'selected' : ''}>${esc(nomeGrupo(g))}</option>`).join('')}</optgroup>
      ${transportes.length ? `<optgroup label="Transportes">${transportes.map((t) => `<option value="t:${t.id}" ${s === 't:' + t.id ? 'selected' : ''}>${esc(t.descricao)}</option>`).join('')}</optgroup>` : ''}</select>
    <button class="btn danger" data-act="iemexcluir">Excluir</button></div>`;
}

// Os quadradinhos (em grupos / sem grupo e com itens / sem itens), no bloco ADMIN OFERENDAS.
function quadradinhos(ev) {
  const C = estado.iemanja.candidatos;
  if (!C) return '';
  const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  return totaisSorteio(ev, C, presos, new Set(ev.fora), new Set(ev.listas)) + totaisItens(ev);
}

// Quem está nos grupos e já assumiu algum item (verde) e quem ainda não assumiu nada (vermelho).
// Tocar no quadrado mostra os nomes com a oferenda (grupo) de cada um.
function totaisItens(ev) {
  const pessoas = ev.grupos.flatMap((g) => g.membros.map((m) => ({ nome: m.nome, lista: m.lista, oferenda: nomeGrupo(g),
    comItem: temItemNo(g, m.chave) })))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const com = pessoas.filter((p) => p.comItem);
  const sem = pessoas.filter((p) => !p.comItem);
  const quadro = (k, cls, lista, rotulo) => `<button class="iem-tot-n ${cls}" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k) && !!lista.length}" ${lista.length ? '' : 'disabled'}><b>${lista.length}</b><span>${rotulo} ${lista.length ? seta(k) : ''}</span></button>`;
  // Os nomes vêm separados pelo cadastro (Corrente, Curimba, cada turma), como em Pessoas do grupo.
  const nomes = (k, lista, titulo) => (ui.abertos.has(k) && lista.length ? `<div class="iem-semg"><p class="iem-tot-tit">${titulo} <span>· ${lista.length}</span></p>
    ${porListaIemanja(lista).map(([cad, ps]) => `<div class="iem-pg-l"><h4 class="iem-pg-t">${esc(cad)} <span>· ${ps.length}</span></h4>
    <div class="iem-itens-nomes">${ps.map((p) => `<div class="iem-p"><span>${esc(p.nome)}</span><small class="muted">${esc(p.oferenda)}</small></div>`).join('')}</div></div>`).join('')}</div>` : '');
  return `<div class="iem-tot">${quadro('comitem', 'com-item', com, 'com itens')}${quadro('semitem', 'sem-item', sem, 'sem itens')}</div>
    ${nomes('comitem', com, 'Com itens')}${nomes('semitem', sem, 'Sem itens')}`;
}

// Entrada em "Seus compromissos": nasce do grupo em que a pessoa foi escalada.
export function compromisso() {
  const ev = estado.iemanja?.eventos?.find((e) => !e.encerradoEm);
  const g = ev?.grupos.find((x) => x.meu);
  if (!g) return null;
  const eu = estado.iemanja.eu?.chave;
  const meus = g.itens.flatMap((i) => { const q = i.todos ? i.quantidade : i.doacoes.find((d) => d.chave === eu)?.quantidade; return q && !i.entregue ? [{ i, q }] : []; });
  return { data: ev.data, html: `<div class="of-meus-g"><span class="of-meus-data"><span class="eyebrow">${dataBR(ev.data)}</span><span class="ent">${esc(Dia(ev.data))}</span></span>
      <button class="btn link of-meus-tit" data-act="iemver" data-g="${g.id}">${esc(ev.nome)} ›</button>
      <div class="of-meus-med"><span><span class="muted">Grupo:</span> <b>${esc(nomeGrupo(g))}</b></span><span><span class="muted">Responsável:</span> <b>${g.responsavel ? esc(g.responsavel) : '—'}</b></span></div>
      ${meus.length ? `<ul>${meus.map(({ i, q }) => `<li><b>${qtdAntes(q, i.unidade)}</b> ${esc(i.nome)} <span class="muted">· ${i.todos ? 'com todos do grupo · ' : ''}entrega ${textoEntrega(i)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0;font-size:.9rem">Nenhum item assumido. Abra o grupo e toque em + no item.</p>'}</div>` };
}

const grupoDe = (id) => {
  const ev = estado.iemanja?.eventos?.find((e) => e.grupos.some((x) => x.id === id));
  return { ev, g: ev?.grupos.find((x) => x.id === id) };
};
const arquivo = (g) => nomeGrupo(g).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
// Abre o compartilhar do aparelho com o PNG; onde não der, baixa a imagem.
function compartilharPng(blob, nome, titulo) {
  const f = new File([blob], nome, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    navigator.share({ files: [f], title: titulo }).catch(() => {});
  } else {
    baixar(blob, nome);
    toast('Imagem salva no aparelho.');
  }
}

// Dados da imagem "Lista pessoas" de um grupo (a mesma do botão do grupo e do "todos os grupos" do Sorteio).
const dadosPessoas = (ev, g) => ({ titulo: `${ev.nome} · ${nomeGrupo(g)}`, data: ev.data, responsavel: g.responsavel,
  listas: porListaIemanja(g.membros).map(([lista, ms]) => [lista, ms.map((m) => m.nome)]) });

// ---------- Listas de todas as oferendas — uma imagem por grupo, compartilhadas de uma vez ----------
// tipo 'pessoas' (Lista de pessoas) ou 'itens' (Lista de itens). As imagens são feitas quando a janela abre:
// o compartilhar do celular só funciona logo depois de um toque.
const gruposComGente = (ev) => ev.grupos.filter((g) => g.membros.length);
const transportesComGente = (ev) => (ev.transportes || []).filter((t) => t.pessoas.length);
const dadosTransporte = (ev, t) => ({ titulo: `${ev.nome} · ${t.descricao}`, data: ev.data, responsavel: t.responsavel, rotulo: 'TRANSPORTE',
  listas: porListaIemanja(t.pessoas).map(([lista, ps]) => [lista, ps.map((p) => ({ nome: p.nome, status: [[p.pago ? 'Pago' : 'Não pago', p.pago], [p.pulseira ? 'Pulseira ok' : 'Pulseira pendente', p.pulseira]] }))]) });
const gruposComItens = (ev) => ev.grupos.filter((g) => g.itens.length);
const gruposPara = (ev, tipo) => (tipo === 'itens' ? gruposComItens(ev) : gruposComGente(ev));
const dadosDe = (ev, g, tipo) => (tipo === 'itens' ? paraCompartilhar(ev, g) : dadosPessoas(ev, g));
const tipoTodas = () => ui.todas?.tipo || 'pessoas';
const chaveTodas = (ev) => JSON.stringify([tipoTodas(), ...gruposPara(ev, tipoTodas()).map((g) => dadosDe(ev, g, tipoTodas())),
  ...(tipoTodas() === 'pessoas' ? transportesComGente(ev).map((t) => dadosTransporte(ev, t)) : [])]);
const todasProntas = (ev) => !!(ui.todas?.imgs && ui.todas.key === chaveTodas(ev));
async function prepararTodas(ev) {
  if (!ev || todasProntas(ev) || ui.todas.gerando) return;
  ui.todas.gerando = true;
  const key = chaveTodas(ev);
  const tipo = tipoTodas();
  try {
    const imgs = [];
    for (const g of gruposPara(ev, tipo)) {
      const blob = tipo === 'itens' ? await gerarImagemOferenda(paraCompartilhar(ev, g)) : await gerarImagemPessoas(dadosPessoas(ev, g));
      imgs.push({ blob, url: URL.createObjectURL(blob), nome: `${tipo}-${arquivo(g)}-${ev.data}.png`, grupo: nomeGrupo(g) });
    }
    if (tipo === 'pessoas') {
      for (const t of transportesComGente(ev)) {
        const blob = await gerarImagemPessoas(dadosTransporte(ev, t));
        imgs.push({ blob, url: URL.createObjectURL(blob), nome: `transporte-${arquivo({ nome: t.descricao })}-${ev.data}.png`, grupo: '🚗 ' + t.descricao });
      }
    }
    (ui.todas.imgs || []).forEach((i) => URL.revokeObjectURL(i.url));
    ui.todas.imgs = imgs;
    ui.todas.key = key;
  } catch (e) { toast(e.message); }
  ui.todas.gerando = false;
  avisar();
  // Trocou de tipo enquanto preparava: prepara de novo.
  if (ui.todas.aberta && !todasProntas(ev)) prepararTodas(ev);
}
// Imagem da lista de um transporte (nomes e status, em duas colunas).
async function imgTransporte(id) {
  const ev = eventoAberto();
  const t = (ev?.transportes || []).find((x) => x.id === id);
  if (!t) return;
  try { compartilharPng(await gerarImagemPessoas(dadosTransporte(ev, t)), `transporte-${arquivo({ nome: t.descricao })}-${ev.data}.png`, `${ev.nome} · ${t.descricao}`); } catch (e) { toast(e.message); }
}
const abrirTodas = (tipo) => { ui.todas = { ...(ui.todas || {}), tipo, aberta: true }; avisar(); prepararTodas(eventoAberto()); };
const arquivosTodas = () => ui.todas.imgs.map((i) => new File([i.blob], i.nome, { type: 'image/png' }));
function podeCompartilharTodas(ev) {
  try { return !!(todasProntas(ev) && navigator.canShare && navigator.canShare({ files: arquivosTodas() })); } catch { return false; }
}
function janelaTodas() {
  const ev = ui.todas?.aberta ? eventoAberto() : null;
  if (!ev) return '';
  const pronta = todasProntas(ev);
  const itens = tipoTodas() === 'itens';
  const n = gruposPara(ev, tipoTodas()).length;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-todas-t"><div class="modal or-modal">
    <h3 id="iem-todas-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${itens ? 'Listas de itens' : 'Listas de pessoas'}</h3>
    <p class="muted" style="margin:0;font-size:.88rem">${n} ${n === 1 ? 'oferenda' : 'oferendas'} · uma imagem para cada, enviadas juntas.</p>
    ${pronta ? `<div class="or-previa iem-todas">${ui.todas.imgs.map((i) => `<figure><img src="${i.url}" alt="${itens ? 'Itens' : 'Pessoas'} da oferenda ${esc(i.grupo)}"><figcaption>${esc(i.grupo)}</figcaption></figure>`).join('')}</div>` : '<div class="loading">Preparando as imagens…</div>'}
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="iemtodasfechar">Fechar</button>
      ${pronta ? `<button class="btn" data-act="iemtodassalvar">Salvar imagens</button>${podeCompartilharTodas(ev) ? '<button class="btn primary" data-act="iemtodascompartilhar">Compartilhar</button>' : ''}` : ''}</div>
  </div></div>`;
}

// ⚙️ Configurações → Lista de pessoas / Lista de itens: de qual oferenda (ou todas)?
function janelaEscolha() {
  const ev = ui.escolha ? eventoAberto() : null;
  if (!ev) return '';
  const itens = ui.escolha === 'itens';
  const com = gruposPara(ev, ui.escolha);
  const n = (g) => (itens ? `${g.itens.length} ${g.itens.length === 1 ? 'item' : 'itens'}` : `${g.membros.length} ${g.membros.length === 1 ? 'pessoa' : 'pessoas'}`);
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-esc-t"><div class="modal">
    <h3 id="iem-esc-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${itens ? 'Lista de itens' : 'Lista de pessoas'}</h3>
    <p style="margin:0">De qual oferenda?</p>
    <div class="iem-escolha"><button class="btn wa-bt" data-act="iemescolhe" data-g="todas" ${com.length || (!itens && transportesComGente(ev).length) ? '' : 'disabled'}><b>${itens ? 'Todas as oferendas' : 'Todas (oferendas e transportes)'}</b> <small>· ${com.length + (itens ? 0 : transportesComGente(ev).length)}</small></button>
      ${ev.grupos.map((g) => `<button class="btn" data-act="iemescolhe" data-g="${g.id}" ${com.includes(g) ? '' : 'disabled'}><b>${esc(nomeGrupo(g))}</b> <small class="muted">· ${n(g)}</small></button>`).join('')}
      ${itens ? '' : (ev.transportes || []).map((t) => `<button class="btn" data-act="iemescolhe" data-g="tr:${t.id}" ${t.pessoas.length ? '' : 'disabled'}><b>🚗 ${esc(t.descricao)}</b> <small class="muted">· ${t.pessoas.length} ${t.pessoas.length === 1 ? 'pessoa' : 'pessoas'}</small></button>`).join('')}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="iemescolhafechar">Voltar</button></div></div></div>`;
}

// Janela do "Lista de itens": texto (abre o WhatsApp) ou imagem — de uma oferenda ou de todas.
function janelaItens() {
  if (!ui.compItens) return '';
  const todas = ui.compItens === 'todas';
  const ev = todas ? eventoAberto() : grupoDe(ui.compItens).ev;
  const grupos = todas ? (ev ? gruposComItens(ev) : []) : [grupoDe(ui.compItens).g].filter(Boolean);
  if (!ev || !grupos.length) return '';
  const txt = grupos.map((g) => textoCompartilhar(paraCompartilhar(ev, g))).join('\n\n— — —\n\n');
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-ci-t"><div class="modal">
    <h3 id="iem-ci-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Lista de itens</h3>
    <p style="margin:0"><b>${todas ? 'Todas as oferendas' : esc(nomeGrupo(grupos[0]))}</b>: compartilhar como texto ou como imagem?</p>
    <div class="iem-wa-bts"><a class="btn wa-bt" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener" data-act="iemcompfechar">${icone('📝', 'Texto')}</a><button class="btn wa-bt" data-act="iemcompimg" data-g="${todas ? 'todas' : grupos[0].id}">${icone('🖼️', todas ? 'Imagens' : 'Imagem')}</button></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="iemcompfechar">Voltar</button></div></div></div>`;
}

export function comoOferenda(id) {
  const ev = estado.iemanja?.eventos?.find((e) => e.grupos.some((g) => g.id === id));
  return ev ? paraCompartilhar(ev, ev.grupos.find((g) => g.id === id)) : null;
}

function blocoEvento(ev) {
  const adm = comoAdmin(ev);
  const grupos = `<div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, adm)).join('')}</div>`;
  const cabecalho = `<div class="datehead"><span class="eyebrow">${dataBR(ev.data)}</span><span class="dia of-titulo">${esc(ev.nome)}</span><span class="ent">${esc(Dia(ev.data))}</span></div>`;
  if (!adm) return `<div class="card iem-topo">${cabecalho}${grupos}</div>${blocoTransporte(ev, false)}`;
  // Admin: ⚙️ Configurações (minimizado) em cima, separado do bloco 🕯️ Oferendas.
  return `${blocoConfig(ev)}<div class="card iem-topo">${cabecalho}
    <div class="of-sec"><h2><span aria-hidden="true">🕯️</span> Oferendas</h2><span class="of-sec-n">${ev.grupos.length}</span></div>
    ${grupos}</div>
    ${blocoTransporte(ev, true)}
    ${souRoot() ? blocoSorteio(ev) : ''}`;
}

// ---------- 🚗 Transporte: aparece quando o evento tem algum. Todos veem nomes e status; os admins editam. ----------
function blocoTransporte(ev, adm) {
  const L = ev.transportes || [];
  if (!L.length) return '';
  return `<div class="card iem-topo"><div class="of-sec"><h2><span aria-hidden="true">🚗</span> Transporte</h2><span class="of-sec-n">${L.length}</span></div>
    <div class="iem-grupos">${L.map((t) => cardTransporte(ev, t, adm && !ev.encerradoEm)).join('')}</div></div>`;
}

function cardTransporte(ev, t, adm) {
  const k = 't:' + t.id;
  const aberto = ui.abertos.has(k);
  const cab = `<button class="grp-h dobra iem-cab" data-act="iemdobra" data-k="${k}" aria-expanded="${aberto}"><span class="iem-tit"><b>${esc(t.descricao)}</b><small class="muted">${t.responsavel ? 'Responsável: ' + esc(t.responsavel) : 'Sem responsável'}</small></span><span class="of-res iem-pct"><b>${t.pessoas.length}</b></span>${seta(k)}</button>`;
  if (!aberto) return `<div class="card iem-grupo">${cab}</div>`;
  const kp = 'tp:' + t.id;   // presente = lista de pessoas fechada (começa aberta)
  const pessoasAbertas = !ui.abertos.has(kp);
  const st = (p, campo, sim, nao, cls) => {
    const v = !!p[campo];
    const rot = `${campo === 'pago' ? '💰' : '🎟️'} ${v ? sim : nao}`;
    return adm ? `<button class="st-med tr-st ${v ? cls[0] : cls[1]}" data-act="iemtrst" data-t="${t.id}" data-c="${esc(p.chave)}" data-campo="${campo}" data-v="${v ? 0 : 1}" title="Tocar para mudar">${rot}</button>`
      : `<span class="st-med ${v ? cls[0] : cls[1]}">${rot}</span>`;
  };
  const linha = (p) => `<div class="tr-p"><span class="tr-nome">${esc(p.nome)}</span><span class="tr-sts">${st(p, 'pago', 'Pago', 'Não pago', ['pago', 'nao_pago'])}${st(p, 'pulseira', 'Entregue', 'Pendente', ['entregue', 'pendente'])}</span>
    ${adm ? `<button class="btn small tr-x" data-act="iemtrretirar" data-t="${t.id}" data-c="${esc(p.chave)}" aria-label="Tirar ${esc(p.nome)} do transporte">✕</button>` : ''}</div>`;
  const listas = porListaIemanja(t.pessoas).map(([lista, ps]) => `<div class="iem-pg-l"><h4 class="iem-pg-t">${esc(lista)} <span>· ${ps.length}</span></h4><div class="tr-lista">${ps.map(linha).join('')}</div></div>`).join('');
  const add = adm ? `<div class="tr-add"><span class="ofg-tit">Adicionar pessoas</span>
      <div class="cp-bts"><button class="btn small" data-act="iemtrpuxar" data-t="${t.id}" data-g="corrente">${icone('＋', 'Corrente + curimba')}</button><button class="btn small" data-act="iemtrpuxar" data-t="${t.id}" data-g="alunos">${icone('＋', 'Alunos')}</button></div>
      <div class="iem-add"><input type="text" id="tr-nome-${t.id}" maxlength="60" placeholder="Ou digite o nome de uma pessoa" aria-label="Nome da pessoa"><button class="btn small primary" data-act="iemtrmanual" data-t="${t.id}">Adicionar</button></div></div>` : '';
  return `<div class="card iem-grupo">${cab}${add}
    <div class="iem-mini"><button class="iem-itens-bt" data-act="iemdobra" data-k="${kp}" aria-expanded="${pessoasAbertas}"><span><span aria-hidden="true">👥</span> Pessoas <span class="iem-itens-n">${t.pessoas.length}</span></span><span class="iem-itens-acao">${pessoasAbertas ? 'Fechar ▾' : 'Ver pessoas ▸'}</span></button>
      ${pessoasAbertas ? (listas ? `<div class="iem-pg">${listas}</div>` : '<p class="muted" style="margin:0">Ninguém neste transporte ainda.</p>') : ''}</div></div>`;
}

// Formulário do "+ Novo transporte" (ADMIN OFERENDAS): descrição e responsável da corrente.
function formTransporte() {
  const C = estado.iemanja.candidatos;
  const N = ui.novoTransp;
  const pessoas = [...(C?.corrente || []), ...(C?.curimba || [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return `<div class="iem-cfg-sec tr-form"><span class="ofg-tit">Novo transporte</span>
    <label class="field">Descrição<input type="text" data-act="iemtrcampo" data-campo="descricao" maxlength="80" value="${esc(N.descricao || '')}" placeholder="Ex.: Van 1, Ônibus da manhã"></label>
    <label class="field">Responsável<select data-act="iemtrcampo" data-campo="responsavelId"><option value="">— escolha da corrente —</option>${pessoas.map((p) => `<option value="${p.pessoaId}" ${p.pessoaId === N.responsavelId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
    <div class="cp-bts"><button class="btn" data-act="iemnovotransp">Cancelar</button><button class="btn primary" data-act="iemtrcriar">Criar</button></div></div>`;
}

// Bloco ADMIN OFERENDAS (⚙️ Configurações do evento): começa minimizado; abre sozinho enquanto edita ou cria um transporte.
function blocoConfig(ev) {
  const k = 'cfg';
  const editando = ui.edit?.id === ev.id;
  const aberto = ui.abertos.has(k) || editando || !!ui.novoTransp;
  const cab = `<button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${aberto}"><h2><span aria-hidden="true">⚙️</span> Configurações</h2><span class="count"><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return `<div class="card adm adm-oferendas iem-cfg">${cab}</div>`;
  const dados = editando
    ? `<div class="iem-ed"><label class="field iem-larga">Nome do evento<input type="text" data-act="iemevnome" maxlength="80" value="${esc(ui.edit.nome)}"></label>
      <label class="field iem-larga">Data do evento<input type="date" data-act="iemdata" value="${esc(ui.edit.data)}"></label></div>
      <p class="muted iem-dica">O orixá ou a entidade e o responsável de cada oferenda mudam no próprio card da oferenda, abaixo.</p>` : '';
  const wa = (act, rotulo) => `<button class="btn wa-bt" data-act="${act}"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${rotulo}</button>`;
  return `<div class="card adm adm-oferendas iem-cfg">${cab}
    ${quadradinhos(ev)}
    <label class="of-sw"><input type="checkbox" role="switch" data-act="iemvisivel" data-id="${ev.id}" ${ev.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
    <div class="cp-bts">${editando ? `<button class="btn" data-act="iemcancelar">${icone('✕', 'Cancelar')}</button><button class="btn primary" data-act="iemsalvar">${icone('✓', 'Salvar')}</button>` : `<button class="btn" data-act="iemeditar">${icone('✎', 'Editar')}</button>`}
      <button class="btn" data-act="iemjanela" data-t="encerrar">${icone('🔒', 'Encerrar')}</button></div>
    ${dados}
    <div class="cp-bts"><button class="btn" data-act="iemjanela" data-t="novaOferenda">${icone('＋', 'Nova oferenda')}</button><button class="btn ${ui.novoTransp ? 'primary' : ''}" data-act="iemnovotransp" aria-pressed="${!!ui.novoTransp}">${icone('🚗', 'Novo transporte')}</button></div>
    ${ui.novoTransp ? formTransporte() : ''}
    <div class="iem-wa-bts">${wa('iemescolherpessoas', 'Lista de pessoas')}${wa('iemescolheritens', 'Lista de itens')}</div></div>`;
}

// Pessoas dos grupos do evento: "Nome · Oferenda", em ordem de nome.
const membrosDoEvento = (ev) => ev.grupos.flatMap((g) => g.membros.map((m) => ({ ...m, grupoId: g.id, oferenda: nomeGrupo(g) })))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// Associar alguém dos cadastros (que ainda não está em nenhum grupo) a uma oferenda.
function blocoAssociar(ev) {
  const C = estado.iemanja.candidatos;
  if (!C) return '';
  const ja = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  const s = ui.sel;
  return `<div class="iem-add iem-add2"><select data-act="iemsel" data-campo="assocP" aria-label="Pessoa"><option value="">Pessoa…</option>${opcoesPessoas(C, ja).replace(`value="${esc(s.assocP || '')}"`, `value="${esc(s.assocP || '')}" selected`)}</select>
      <select data-act="iemsel" data-campo="assocG" aria-label="Oferenda"><option value="">Oferenda…</option>${ev.grupos.map((g) => `<option value="${g.id}" ${g.id === s.assocG ? 'selected' : ''}>${esc(nomeGrupo(g))}</option>`).join('')}</select></div>
    <div class="cp-bts iem-uma"><button class="btn" data-act="iemassociar">${icone('＋', 'Associar')}</button></div>`;
}

// Trocar duas pessoas de oferendas diferentes (cada uma vai para a oferenda da outra), depois de confirmar.
function blocoTrocar(ev) {
  const todos = membrosDoEvento(ev);
  const s = ui.sel;
  const a = todos.find((m) => m.chave === s.trocaA);
  const outros = a ? todos.filter((m) => m.grupoId !== a.grupoId) : [];
  const op = (m, sel) => `<option value="${esc(m.chave)}" ${m.chave === sel ? 'selected' : ''}>${esc(m.nome)} · ${esc(m.oferenda)}</option>`;
  return `<div class="iem-add iem-add2"><select data-act="iemsel" data-campo="trocaA" aria-label="Primeira pessoa"><option value="">Pessoa…</option>${todos.map((m) => op(m, s.trocaA)).join('')}</select>
      <select data-act="iemsel" data-campo="trocaB" aria-label="Trocar com" ${a ? '' : 'disabled'}><option value="">Trocar com…</option>${outros.map((m) => op(m, s.trocaB)).join('')}</select></div>
    <div class="cp-bts iem-uma"><button class="btn" data-act="iemtrocar">${icone('⇄', 'Trocar')}</button></div>`;
}

// Categorias do evento (seção do bloco Configuração evento): subir, excluir e adicionar.
function blocoCategorias(ev) {
  const l = categoriasDe(ev);
  const usos = (c) => ev.grupos.reduce((n, g) => n + g.itens.filter((i) => (i.categoria || '').toLocaleLowerCase('pt-BR') === c.toLocaleLowerCase('pt-BR')).length, 0);
  const linhas = l.map((c, k) => `<div class="iem-p"><span>${esc(c)} <small class="muted">· ${usos(c)} ${usos(c) === 1 ? 'item' : 'itens'}</small></span><span class="iem-cat-bts">
      <button class="btn small" data-act="iemcatsobe" data-k="${k}" ${k ? '' : 'disabled'} aria-label="Subir ${esc(c)}">↑</button>
      <button class="btn small" data-act="iemcatdel" data-k="${k}" aria-label="Excluir ${esc(c)}">✕</button></span></div>`).join('');
  return `<div class="iem-cats">
    <p class="muted" style="margin:0;font-size:.88rem">Valem para todas as oferendas deste evento. Os itens aparecem nesta ordem.</p>
    <div class="iem-lista">${linhas || '<p class="muted" style="margin:0">Nenhuma categoria ainda.</p>'}</div>
    <form class="iem-add" data-form="iemcat" autocomplete="off"><input type="text" name="categoria" maxlength="40" required placeholder="Nova categoria (ex.: Flores)" aria-label="Nova categoria"><button class="btn primary" type="submit">Adicionar</button></form></div>`;
}

function blocoHistorico(lista) {
  if (!lista.length) return '';
  const k = 'hist';
  return `<div class="card"><button class="grp-h dobra" data-act="iemdobra" data-k="${k}" aria-expanded="${ui.abertos.has(k)}"><h2>🧾 Histórico</h2><span class="count">${lista.length} ${seta(k)}</span></button>
    ${ui.abertos.has(k) ? lista.map((ev) => { const ke = 'e:' + ev.id; return `<div class="iem-mini iem-hist"><div class="iem-hist-topo"><button class="grp-h dobra" data-act="iemdobra" data-k="${ke}" aria-expanded="${ui.abertos.has(ke)}"><h3>${esc(ev.nome)} · ${dataBR(ev.data)}</h3><span class="count">${seta(ke)}</span></button><span class="iem-concl"><span aria-hidden="true">✅</span> Concluído</span></div>
      ${comoAdmin(ev) ? `<button class="btn wa-bt iem-resumo-bt" data-act="iemresumo" data-id="${ev.id}"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Resumo</button>` : ''}
      ${ui.abertos.has(ke) ? `<div class="iem-grupos">${ev.grupos.map((g) => cardGrupo(ev, g, false)).join('')}</div>` : ''}</div>`; }).join('') : ''}</div>`;
}

// ---------- Resumo do evento encerrado (texto ou imagem) ----------
function dadosResumo(ev) {
  const chaves = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
  return {
    titulo: ev.nome, data: ev.data, participantes: chaves.size,
    oferendas: ev.grupos.map((g) => ({
      nome: nomeGrupo(g), responsavel: g.responsavel || '', pessoas: g.membros.map((m) => m.nome),
      contribuiram: g.membros.filter((m) => temItemNo(g, m.chave)).length,
      itens: g.itens.length, entregues: g.itens.filter((i) => i.entregue).length,
    })),
    transportes: (ev.transportes || []).map((t) => ({ descricao: t.descricao, responsavel: t.responsavel || '', pessoas: t.pessoas.length })),
  };
}
const barraTxt = (feito, total) => {
  const pct = total ? Math.round((feito * 100) / total) : 0;
  const n = Math.round(pct / 10);
  return `${'▰'.repeat(n)}${'▱'.repeat(10 - n)} ${pct}%`;
};
function textoResumo(ev) {
  const r = dadosResumo(ev);
  const L = [`*RESUMO · ${r.titulo}*`, `${dataBR(r.data)} · ✅ Concluído`, `👥 ${r.participantes} participantes · 🕯️ ${r.oferendas.length} ${r.oferendas.length === 1 ? 'oferenda' : 'oferendas'}`, ''];
  r.oferendas.forEach((o) => {
    const mais = o.pessoas.length > 8 ? ` e mais ${o.pessoas.length - 8}` : '';
    L.push(`*${o.nome}* · Resp.: ${o.responsavel || '—'}`);
    L.push(`Pessoas (${o.pessoas.length}): ${o.pessoas.slice(0, 8).join(', ') || '—'}${mais}`);
    L.push(`🙋 Contribuíram: ${o.contribuiram} de ${o.pessoas.length}  ${barraTxt(o.contribuiram, o.pessoas.length)}`);
    L.push(`📦 Itens entregues: ${o.entregues} de ${o.itens}  ${barraTxt(o.entregues, o.itens)}`, '');
  });
  if (r.transportes.length) {
    L.push('🚗 *Transporte*');
    r.transportes.forEach((t) => L.push(`• ${t.descricao} — Resp.: ${t.responsavel || '—'} (${t.pessoas} ${t.pessoas === 1 ? 'pessoa' : 'pessoas'})`));
  }
  return L.join('\n').trimEnd();
}
function janelaResumo() {
  const ev = ui.resumo && estado.iemanja.eventos.find((e) => e.id === ui.resumo);
  if (!ev) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-res-t"><div class="modal">
    <h3 id="iem-res-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Resumo do evento</h3>
    <p style="margin:0"><b>${esc(ev.nome)}</b>: compartilhar como texto ou como imagem?</p>
    <div class="iem-wa-bts"><a class="btn wa-bt" href="https://wa.me/?text=${encodeURIComponent(textoResumo(ev))}" target="_blank" rel="noopener" data-act="iemresumofechar">${icone('📝', 'Texto')}</a><button class="btn wa-bt" data-act="iemresumoimg" data-id="${ev.id}">${icone('🖼️', 'Imagem')}</button></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="iemresumofechar">Voltar</button></div></div></div>`;
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
    const resp = esc(responsaveisItem(i.todos ? { ...i, todosRotulo: TODOS_GRUPO } : i, true));
    return ['Confirmar entrega', `Confirma que <b>${esc(i.nome)}</b> foi entregue?${resp ? `<br><span class="muted">Responsáveis: ${resp}</span>` : ''}`, 'OK', 'primary', 'Cancelar'];
  }
  if (j.t === 'excluirTransporte' || j.t === 'trRetirar') {
    const t = (eventoAberto()?.transportes || []).find((x) => x.id === j.tr);
    if (!t) return null;
    if (j.t === 'excluirTransporte') return ['Excluir este transporte?', `<b>${esc(t.descricao)}</b> e a lista de pessoas dele saem do evento. Não dá para desfazer.`, 'Excluir transporte', 'danger', 'Cancelar'];
    const p = t.pessoas.find((x) => x.chave === j.c);
    return p ? ['Tirar do transporte?', `Tirar <b>${esc(p.nome)}</b> de <b>${esc(t.descricao)}</b>?`, 'OK', 'danger', 'Cancelar'] : null;
  }
  if (j.t === 'trocar') {
    const todos = membrosDoEvento(eventoAberto());
    const [a, b] = [j.a, j.b].map((k) => todos.find((m) => m.chave === k));
    if (!a || !b) return null;
    return ['Trocar de oferenda?', `<b>${esc(a.nome)}</b> vai para <b>${esc(b.oferenda)}</b> e <b>${esc(b.nome)}</b> vai para <b>${esc(a.oferenda)}</b>.`, 'Trocar', 'primary', 'Cancelar'];
  }
  if (!j.g) return [...TEXTOS[j.t], 'primary'];
  const g = eventoAberto()?.grupos.find((x) => x.id === j.g);
  if (!g) return null;
  if (j.t === 'retirar') {
    const m = g.membros.find((x) => x.chave === j.c);
    if (!m) return null;
    return ['Tirar do grupo?', `Tem certeza que quer tirar <b>${esc(m.nome)}</b> do grupo <b>${esc(nomeGrupo(g))}</b>?`, 'OK', 'danger', 'Cancelar'];
  }
  if (j.t === 'excluirGrupo') return ['Excluir esta oferenda?', `<b>${esc(nomeGrupo(g))}</b>: os itens, as doações e as pessoas desta oferenda saem do evento. Não dá para desfazer.`, 'Excluir oferenda', 'danger', 'Cancelar'];
  const r = ui.rascunho[j.g];
  return ['Adicionar este item?', `${r.categoria ? `${esc(r.categoria)}: ` : ''}<b>${esc(qtdTxt(r.quantidade, r.unidade))}</b> · ${esc(r.nome)} no grupo <b>${esc(nomeGrupo(g))}</b>.<br><span class="muted">Entrega: ${textoEntrega(r)}</span>`, 'Adicionar', 'primary'];
}
function janela() {
  const t = ui.janela && textosJanela(ui.janela);
  if (!t) return '';
  const [titulo, txt, bt, cor, voltar = 'Voltar'] = t;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="iem-t"><div class="modal"><h3 id="iem-t">${titulo}</h3><p style="margin:0">${txt}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="iemjanelanao">${voltar}</button><button class="btn ${cor}" data-act="iemjanelasim">${bt}</button></div></div></div>`;
}

// Ao abrir a aba, a oferenda (grupo) de quem está logado já vem expandida; uma vez por abertura,
// para não reabrir se a pessoa fechar.
let abriuMeu = false;
export function aoAbrirAba() { abriuMeu = false; }

export function conteudo() {
  const I = estado.iemanja;
  if (I.erro) return `<div class="card"><p class="muted" style="margin:0">${esc(I.erro)}</p></div>`;
  const aberto = I.eventos.find((e) => !e.encerradoEm);
  if (!abriuMeu && aberto) {
    const meu = aberto.grupos.find((g) => g.meu && g.abre);
    if (meu) ui.abertos.add('g:' + meu.id);
    abriuMeu = true;
  }
  const novo = !aberto && souRoot() ? `<div class="card adm"><div class="grp-h"><h2>Novo evento</h2></div><label class="field">Nome do evento<input type="text" id="iem-nova-nome" maxlength="80" placeholder="Oferenda de Iemanjá"></label><label class="field">Data do evento<input type="date" id="iem-nova-data"></label>
    <div class="cp-bts"><button class="btn primary" data-act="iemnovo">${icone('＋', 'Novo evento')}</button></div></div>` : '';
  // Detalhes do evento em andamento, acima do bloco do evento (ADMIN).
  const det = aberto ? blocoDetalhes(aberto.id, aberto.detalhes, comoAdmin(aberto), 'iemdetsalvar') : '';
  return `${novo}${det}${aberto ? blocoEvento(aberto) : ''}${blocoHistorico(I.eventos.filter((e) => e.encerradoEm))}${janela()}${janelaEscolha()}${janelaItens()}${janelaTodas()}${janelaResumo()}`;
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
    const { t, g, i, c } = ui.janela;
    ui.trocaPendente = ui.janela;
    ui.janela = null;
    if (t === 'excluirTransporte') {
      if (await acaoIemanja('transporteExcluir', { id: eventoAberto().id, transporteId: ui.trocaPendente.tr })) { ui.sel.excluir = ''; toast('Transporte excluído.'); }
    } else if (t === 'trRetirar') {
      await acaoIemanja('transportePessoa', { id: eventoAberto().id, transporteId: ui.trocaPendente.tr, chave: c, remover: true });
    } else if (t === 'trocar') {
      if (await acaoIemanja('trocar', { id: eventoAberto().id, a: ui.trocaPendente.a, b: ui.trocaPendente.b })) { ui.sel.trocaA = ''; ui.sel.trocaB = ''; toast('Troca feita.'); }
    } else if (t === 'retirar') {
      const nome = grupoDe(g).g?.membros.find((m) => m.chave === c)?.nome || 'A pessoa';
      if (await acaoIemanja('retirar', { grupoId: g, chave: c })) toast(`${nome} saiu do grupo.`);
    } else if (t === 'novaOferenda') {
      if (await acaoIemanja('grupoNovo', { id: eventoAberto().id })) { sincronizarEdicao(); toast('Oferenda criada. Escolha o orixá ou a entidade em Editar.'); }
    } else if (t === 'entregue') {
      if (await acaoIemanja('entregue', { itemId: i, entregue: true })) toast('Item marcado como entregue.');
    } else if (t === 'item') {
      // A lista de itens abre para mostrar o item novo.
      if (await acaoIemanja('item', { grupoId: g, ...ui.rascunho[g] })) { delete ui.rascunho[g]; ui.abertos.add('i:' + g); toast('Item adicionado.'); }
    } else if (t === 'excluirGrupo') {
      if (await acaoIemanja('grupoExcluir', { grupoId: g })) { sincronizarEdicao(); ui.sel.excluir = ''; toast('Oferenda excluída.'); }
    } else {
      const id = eventoAberto()?.id;
      const op = { sortear: 'sortear', cancelar: 'cancelarSorteio', encerrar: 'encerrar' }[t];
      if (await acaoIemanja(op, { id })) { if (t === 'encerrar') { ui.edit = null; ui.abertos.add('hist'); } toast({ sortear: 'Sorteio realizado.', cancelar: 'Sorteio cancelado.', encerrar: 'Evento encerrado.' }[t]); }
    }
    avisar();
  },
  // "Lista pessoas": imagem das pessoas do grupo, por lista.
  async iemimgpessoas(el) {
    const { ev, g } = grupoDe(el.dataset.g);
    if (!g) return;
    try {
      compartilharPng(await gerarImagemPessoas(dadosPessoas(ev, g)), `pessoas-${arquivo(g)}-${ev.data}.png`, `${ev.nome} · ${nomeGrupo(g)}`);
    } catch (e) { toast(e.message); }
  },
  // Sorteio: "Listas de pessoas" de todos os grupos — abre a janela e já prepara as imagens.
  iemtodaspessoas() { abrirTodas('pessoas'); },
  // ⚙️ Configurações: Lista de pessoas / Lista de itens → escolhe a oferenda (ou todas).
  iemresumo(el) { ui.resumo = el.dataset.id; avisar(); },
  iemresumofechar() { ui.resumo = null; avisar(); },
  async iemresumoimg(el) {
    ui.resumo = null;
    avisar();
    const ev = estado.iemanja.eventos.find((e) => e.id === el.dataset.id);
    if (!ev) return;
    try { compartilharPng(await gerarImagemResumo(dadosResumo(ev)), `resumo-${arquivo({ nome: ev.nome })}-${ev.data}.png`, `Resumo · ${ev.nome}`); } catch (e) { toast(e.message); }
  },
  iemescolherpessoas() { ui.escolha = 'pessoas'; avisar(); },
  iemescolheritens() { ui.escolha = 'itens'; avisar(); },
  iemescolhafechar() { ui.escolha = null; avisar(); },
  iemescolhe(el) {
    const tipo = ui.escolha;
    ui.escolha = null;
    const g = el.dataset.g;
    if (tipo === 'pessoas') {
      if (g === 'todas') abrirTodas('pessoas');
      else if (g.startsWith('tr:')) { avisar(); imgTransporte(g.slice(3)); }
      else { avisar(); cliques.iemimgpessoas(el); }
      return;
    }
    ui.compItens = g;
    avisar();
  },
  iemtodasfechar() { ui.todas.aberta = false; avisar(); },
  iemtodassalvar() {
    if (!todasProntas(eventoAberto())) return;
    ui.todas.imgs.forEach((i, k) => setTimeout(() => baixar(i.blob, i.nome), k * 400));
    toast(ui.todas.imgs.length > 1 ? 'Imagens salvas. Abra o WhatsApp e anexe no grupo.' : 'Imagem salva. Abra o WhatsApp e anexe no grupo.');
  },
  iemtodascompartilhar() {
    const ev = eventoAberto();
    if (!todasProntas(ev)) return;
    navigator.share({ files: arquivosTodas(), title: `${ev.nome} · ${tipoTodas() === 'itens' ? 'listas de itens' : 'listas de pessoas'}` })
      .then(() => cliques.iemtodasfechar())
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagens.'); });
  },
  // "Lista de itens": abre a janela para escolher texto (WhatsApp) ou imagem.
  iemcompitens(el) { ui.compItens = el.dataset.g; avisar(); },
  iemcompfechar() { ui.compItens = null; avisar(); },
  async iemcompimg(el) {
    ui.compItens = null;
    if (el.dataset.g === 'todas') { abrirTodas('itens'); return; }
    avisar();
    const { ev, g } = grupoDe(el.dataset.g);
    if (!g) return;
    try {
      compartilharPng(await gerarImagemOferenda(paraCompartilhar(ev, g)), `itens-${arquivo(g)}-${ev.data}.png`, `${ev.nome} · ${nomeGrupo(g)}`);
    } catch (e) { toast(e.message); }
  },
  iemdetsalvar(el) { return salvarDetalhes((detalhes) => acaoIemanja('detalhes', { id: el.dataset.id, detalhes })); },
  // ---------- Transporte ----------
  iemnovotransp() { ui.novoTransp = ui.novoTransp ? null : { descricao: '', responsavelId: '' }; avisar(); },
  async iemtrcriar() {
    const N = ui.novoTransp || {};
    const descricao = document.querySelector('[data-act="iemtrcampo"][data-campo="descricao"]')?.value ?? N.descricao;
    const responsavelId = document.querySelector('[data-act="iemtrcampo"][data-campo="responsavelId"]')?.value ?? N.responsavelId;
    if (!String(descricao || '').trim()) { toast('Informe a descrição do transporte.'); return; }
    if (!responsavelId) { toast('Escolha o responsável.'); return; }
    if (await acaoIemanja('transporteSalvar', { id: eventoAberto().id, descricao, responsavelId })) { ui.novoTransp = null; toast('Transporte criado.'); avisar(); }
  },
  async iemtrpuxar(el) {
    if (await acaoIemanja('transporteIncluir', { id: eventoAberto().id, transporteId: el.dataset.t, grupo: el.dataset.g })) toast(el.dataset.g === 'alunos' ? 'Alunos adicionados.' : 'Corrente e curimba adicionadas.');
  },
  async iemtrmanual(el) {
    const campo = document.getElementById('tr-nome-' + el.dataset.t);
    const nome = campo?.value.trim();
    if (!nome) { toast('Digite o nome da pessoa.'); return; }
    if (await acaoIemanja('transporteIncluir', { id: eventoAberto().id, transporteId: el.dataset.t, nome })) toast('Pessoa adicionada.');
  },
  iemtrst(el) { acaoIemanja('transportePessoa', { id: eventoAberto().id, transporteId: el.dataset.t, chave: el.dataset.c, [el.dataset.campo]: el.dataset.v === '1' }); },
  iemtrretirar(el) { ui.janela = { t: 'trRetirar', tr: el.dataset.t, c: el.dataset.c }; avisar(); },
  // Configuração evento (root): excluir oferenda ou transporte, depois de confirmar.
  iemexcluir() {
    const v = ui.sel.excluir || '';
    if (!v) { toast('Escolha a oferenda ou o transporte.'); return; }
    ui.janela = v.startsWith('g:') ? { t: 'excluirGrupo', g: v.slice(2) } : { t: 'excluirTransporte', tr: v.slice(2) };
    avisar();
  },
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
  // Seus compromissos → abre o grupo já com os itens à mostra.
  iemver(el) {
    ui.abertos.add('g:' + el.dataset.g);
    ui.abertos.add('i:' + el.dataset.g);
    avisar();
    setTimeout(() => document.getElementById('iem-g-' + el.dataset.g)?.scrollIntoView({ block: 'start' }), 0);
  },
  iemfora(el) { acaoIemanja('fora', { id: eventoAberto().id, chave: el.dataset.c, fora: el.dataset.v === '1' }); },
  async iemassociar() {
    const { assocP: chave, assocG: grupoId } = ui.sel;
    if (!chave || !grupoId) { toast('Escolha a pessoa e a oferenda.'); return; }
    if (await acaoIemanja('adicionar', { grupoId, chave })) { ui.sel.assocP = ''; toast('Pessoa associada à oferenda.'); avisar(); }
  },
  iemtrocar() {
    const { trocaA: a, trocaB: b } = ui.sel;
    if (!a || !b) { toast('Escolha as duas pessoas.'); return; }
    ui.janela = { t: 'trocar', a, b };
    avisar();
  },
  // ✕ da pessoa do grupo: pergunta antes de tirar.
  iemretirar(el) { ui.janela = { t: 'retirar', g: el.dataset.g, c: el.dataset.c }; avisar(); },
  iemdelitem(el) { acaoIemanja('excluirItem', { itemId: el.dataset.id }); },
  iemaskentregue(el) { ui.janela = { t: 'entregue', i: el.dataset.id }; avisar(); },
  async iementregue(el) { if (await acaoIemanja('entregue', { itemId: el.dataset.id, entregue: el.dataset.v === '1' })) toast('Entrega desfeita.'); },
  iemofmais(el) { assumirMeu(el.dataset.id, +1); },
  iemofmenos(el) { assumirMeu(el.dataset.id, -1); },
  iempormais(el) { assumirDe(el, +1); },
  iempormenos(el) { assumirDe(el, -1); },
  async iemtodosdel(el) { estado.confirm = null; if (await acaoIemanja('itemTodos', { itemId: el.dataset.item, todos: false })) toast('O item deixou de ser de todos.'); },
  async iempordel(el) { if (await acaoIemanja('assumirPor', { itemId: el.dataset.item, chave: el.dataset.chave, quantidade: 0 })) toast('Doação excluída.'); },
};

function assumirMeu(itemId, delta) {
  const item = itemDe(itemId);
  const minha = item.doacoes.find((d) => d.chave === estado.iemanja.eu?.chave)?.quantidade || 0;
  const q = arred(Math.max(0, minha + (delta > 0 ? passoLevar(situacao(item).falta) : -1)));
  if (delta > 0 && situacao(item).falta <= 0) return;
  acaoIemanja('assumir', { itemId, quantidade: q }).then((ok) => {
    if (!ok) return;
    const ate = item.entrega ? ` até ${dataBR(item.entrega).slice(0, 5)}` : '';
    toast(q > 0 ? `Você vai levar ${qtdTxt(q, item.unidade)}: ${item.nome}${ate}.` : `Você não vai mais levar ${item.nome}.`);
  });
}

function assumirDe(el, delta) {
  const item = itemDe(el.dataset.item);
  const d = item?.doacoes.find((x) => x.chave === el.dataset.chave);
  if (!d || (delta > 0 && situacao(item).falta <= 0)) return;
  acaoIemanja('assumirPor', { itemId: el.dataset.item, chave: d.chave, quantidade: arred(Math.max(0, Number(d.quantidade) + (delta > 0 ? passoLevar(situacao(item).falta) : -1))) });
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
    // Todos: cada pessoa do grupo fica responsável pelo item (sem quantidade por pessoa).
    if (v('pessoa') === 'todos') {
      if (await acaoIemanja('itemTodos', { itemId: form.dataset.item, todos: true })) toast('O item agora é de todos do grupo.');
      return;
    }
    if (await acaoIemanja('assumirPor', { itemId: form.dataset.item, chave: v('pessoa'), quantidade: v('qtd') })) toast('Doação registrada.');
    return;
  }
  const entrega = v('modo') === 'data' ? v('entrega') : '';
  if (v('modo') === 'data' && !entrega) { toast('Escolha a data da entrega.'); return; }
  if (!v('unidade')) { toast('Escolha a unidade.'); return; }
  const dados = { categoria: v('categoria').trim(), nome: v('nome').trim(), quantidade: v('qtd'), unidade: v('unidade'), entrega,
    ...(form.elements.todos ? { todos: form.elements.todos.checked } : {}) };
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
  iemtrcampo(t) { if (ui.novoTransp) ui.novoTransp[t.dataset.campo] = t.value; },
  // Combos de Associar e Trocar (bloco ADMIN ROOT): guarda a escolha; trocar a primeira pessoa limpa a segunda.
  iemsel(t) {
    ui.sel[t.dataset.campo] = t.value;
    if (t.dataset.campo === 'trocaA') ui.sel.trocaB = '';
    avisar();
  },
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
