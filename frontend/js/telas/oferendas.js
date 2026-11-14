// Tela "Oferendas": as sub-abas com as listas de itens (o admin monta; todos escolhem o que vão doar) e a Iemanjá.

import { situacao, textoEntrega, dataBR, PAGAMENTO, ENTREGA, ROTULO_MEDIUM, medConferido, percentualDoado, travadaPara, fechaEm, GRUPOS_CORRENTE, opcoesGruposOferenda, gruposMarcados, gruposParaEnviar, faixaPct, compromissosDe, estatisticasPorPessoa, qtdTxt, qtdAntes, arred, passoLevar } from '/shared/oferendas.js';
import { estado, pode, pessoasOrd, carregarOferendas, acaoOferendas, doarItem, carregarAlunos, avisar, veIemanja, carregarIemanja, visaoAtiva } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';
import { gerarImagemOferenda } from '../imagemOferenda.js';
import { U, Dia, camposItem, listaItens, botoesCompartilhar, painelCompartilhar, textoCompartilhar, blocoDetalhes, salvarDetalhes, atualizarPrevia, dobrarCategoria } from './oferendaComum.js';
export { atualizarPrevia };
export const aoAbrirAba = () => iemanja.aoAbrirAba();
import * as iemanja from './iemanja.js';

const opcoesPessoas = (atual) => `<option value="">— escolha —</option>${pessoasOrd().map((p) => `<option value="${p.id}" ${p.id === atual ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
// "rascunho" aparece como Bloqueado (vermelho): a corrente não vê e os itens ficam ocultos.
const SITUACAO = { rascunho: 'Bloqueado', aguardando: 'Aguardando publicação', publicado: 'Publicado', encerrado: 'Encerrado' };
const etiqueta = (st) => `<span class="st-of ${st}">${SITUACAO[st] || st}</span>`;

// Lembra se "+ Adicionar item" e "Oferendas anteriores" estão abertos entre redesenhos.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  if (d.classList.contains('of-novo')) {
    const id = d.querySelector('form')?.dataset.of;
    if (d.open) U().novoItem = id; else if (U().novoItem === id) U().novoItem = null;
  } else if (d.classList.contains('anteriores')) U().anteriores = d.open;
}, true);
// Quem só tem a Iemanjá (alunos) não usa as listas de oferendas.
const veLista = () => pode('oferendas:doar') && visaoAtiva() !== 'alunos';
const souRoot = () => estado.me?.papel === 'root' && estado.visaoRoot === 'root';
const ABA_IEMANJA = { id: 'iemanja', nome: 'Iemanjá', iemanja: true };
function subabas() {
  if (!veLista()) return veIemanja() ? [ABA_IEMANJA] : [];
  return (estado.oferendas.abas || []).filter((a) => (a.iemanja ? veIemanja() : a.visivel || pode('oferendas:gerenciar')));
}
const abaAtiva = () => { const l = subabas(); return l.find((a) => a.id === U().aba) || l[0]; };
const daAba = (aba) => estado.oferendas.oferendas.filter((o) => o.abaId === aba?.id);

// Doação por outra pessoa: qualquer cadastrado, da corrente (com a curimba) ou aluno.
function opcoesDoador(ja) {
  const livres = pessoasOrd().filter((p) => !ja.has('p:' + p.id));
  const alunosLivres = (estado.alunos?.alunos || []).filter((a) => !ja.has('a:' + a.id));
  return `${livres.length ? `<optgroup label="Corrente">${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</optgroup>` : ''}${alunosLivres.length ? `<optgroup label="Alunos">${alunosLivres.map((a) => `<option value="a:${a.id}">${esc(a.nome)}</option>`).join('')}</optgroup>` : ''}`;
}

// Oferenda com uma linha por médium: a situação de cada um. O admin escolhe; a corrente só vê.
const etqMed = (st) => `<span class="st-med ${st}">${ROTULO_MEDIUM[st] || st}</span>`;
const etqsMed = (m) => `<span class="of-med-etqs">${etqMed(m.pagamento)}${etqMed(m.entrega)}</span>`;
// Um combo para cada conferência: pagamento e entrega.
// 💰 pagamento e 📦 entrega, para diferenciar os dois combos de longe.
const ICONE_MED = { pagamento: '💰', entrega: '📦' };
const comboMed = (of, m, campo, opcoes, rotulo) => `<select class="sel-med ${m[campo]}" data-act="ofmedium" data-campo="${campo}" data-of="${of.id}" data-p="${m.pessoaId}" aria-label="${rotulo} de ${esc(m.nome)}">${opcoes.map(([k, l]) => `<option value="${k}" ${k === m[campo] ? 'selected' : ''}>${ICONE_MED[campo]} ${l}</option>`).join('')}</select>`;
// "Incluir novos cadastrados": de quais listas puxar (começa com os grupos da oferenda) e Confirmar.
// Grupos para escolher: "Médiuns" (a corrente toda) e os alunos por turma (quando a lista de alunos está carregada).
const opcoesGrupos = () => opcoesGruposOferenda(estado.alunos?.turmas, estado.alunos?.alunos);
const chipsGrupos = (nome, act, marcados) => {
  const ops = opcoesGrupos();
  const m = gruposMarcados(marcados, ops);
  return ops.map(([k, l]) => `<label class="chip"><input type="checkbox" name="${nome}" data-act="${act}" value="${esc(k)}" ${m.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('');
};
function painelIncluir(of) {
  const marcados = U().incluirGrupos || of.grupos || GRUPOS_CORRENTE;
  return `<div class="of-grupos of-incluir"><span class="muted" style="font-size:.85rem;flex-basis:100%">De quais listas puxar quem ainda não está:</span>
    ${chipsGrupos('grupoinc', 'grupoinc', marcados)}
    <div class="row" style="flex-basis:100%"><button class="btn small primary" data-act="atualizarmed" data-id="${of.id}">Confirmar</button><button class="btn small" data-act="incluirmed" data-id="${of.id}">Cancelar</button></div></div>`;
}
// Admin: acrescenta na lista alguém do cadastro (corrente ou aluno) que ainda não está nela.
function formAddPessoa(of, ms) {
  const ja = new Set(ms.map((m) => m.pessoaId));
  const livres = pessoasOrd().filter((p) => !ja.has(p.id));
  const alunosLivres = (estado.alunos?.alunos || []).filter((a) => !ja.has('a:' + a.id));
  if (!livres.length && !alunosLivres.length) return '';
  return `<form class="of-por" data-form="addmedium" data-of="${of.id}" autocomplete="off">
    <select name="pessoa" aria-label="Pessoa do cadastro para adicionar na lista"><option value="">+ adicionar pessoa do cadastro…</option>
      ${livres.length ? `<optgroup label="Corrente">${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</optgroup>` : ''}
      ${alunosLivres.length ? `<optgroup label="Alunos">${alunosLivres.map((a) => `<option value="a:${a.id}">${esc(a.nome)}</option>`).join('')}</optgroup>` : ''}</select>
    <button class="btn small primary" type="submit">Adicionar</button></form>`;
}
function blocoMediuns(of, admin) {
  const ms = of.mediuns || [];
  let h = `<div class="of-med"><div class="of-med-h"><b>Pessoas</b> <span class="muted">(${ms.length})</span>
    ${admin ? `<button class="btn link small" data-act="incluirmed" data-id="${of.id}" aria-expanded="${U().incluir === of.id}" title="Acrescenta quem foi cadastrado depois">↻ Incluir novos cadastrados</button>` : ''}</div>
    ${admin && U().incluir === of.id ? painelIncluir(of) : ''}
    ${admin ? formAddPessoa(of, ms) : ''}`;
  if (!ms.length) return h + `<p class="muted" style="margin:0;font-size:.88rem">Ninguém na lista.</p></div>`;
  // Um cartão por pessoa: o nome (e, para o admin, ✕ para tirar) e embaixo Pagamento e Entrega, na cor da situação.
  h += `<div class="of-med-lista">${ms.map((m) => `<div class="of-med-l ${medConferido(m) ? 'ok' : m.pagamento === 'pago' || m.entrega === 'entregue' ? 'meio' : 'pend'}"><span class="nm">${esc(m.nome)}${m.aluno ? ' <span class="tag of-aluno">aluno</span>' : ''}</span>
    ${admin ? `${estado.confirm === 'om:' + of.id + ':' + m.pessoaId
        ? `<button class="btn small danger" data-act="delmedium" data-of="${of.id}" data-p="${m.pessoaId}">Tirar</button>`
        : `<button class="btn small lock-x" data-act="askdel" data-k="om:${of.id}:${m.pessoaId}" title="Tirar ${esc(m.nome)} desta lista" aria-label="Tirar ${esc(m.nome)} desta lista">✕</button>`}
      <span class="of-med-sts">${comboMed(of, m, 'pagamento', PAGAMENTO, 'Pagamento')}${comboMed(of, m, 'entrega', ENTREGA, 'Entrega')}</span>` : etqsMed(m)}</div>`).join('')}</div>`;
  return h + `</div>`;
}

// Admin, logo abaixo de "Seus compromissos": as oferendas com uma linha por pessoa marcadas "Exibir no resumo"
// (não encerradas) — quantas pessoas vão, quantas faltam pagar e quantas faltam entregar. Tocar no número mostra os nomes.
function cardPorPessoa() {
  if (!pode('oferendas:gerenciar')) return '';
  const L = estatisticasPorPessoa(estado.oferendas.oferendas);
  const cab = `<div class="grp-h"><h2><span aria-hidden="true">📊</span> Oferendas por pessoa</h2>${L.length ? `<span class="count">${L.length}</span>` : ''}</div>`;
  if (!L.length) {
    // Há oferenda por pessoa aberta, mas nenhuma marcada: explica como fazer aparecer.
    const temPorPessoa = estado.oferendas.oferendas.some((of) => of.porMedium && of.status !== 'encerrado');
    return temPorPessoa ? `<div class="card adm">${cab}<p class="muted" style="margin:0;font-size:.88rem">Nenhuma oferenda no resumo. Abra a oferenda e ligue <b>Exibir no resumo</b>.</p></div>` : '';
  }
  const soma = (k) => L.reduce((s, x) => s + x[k].length, 0);
  const olho = U().estOlho;
  const cel = (of, k, lista, cls) => `<td><button class="of-est-n ${cls}${lista.length ? '' : ' zero'}" data-act="estolho" data-k="${of.id}:${k}" aria-expanded="${olho === of.id + ':' + k}" ${lista.length ? '' : 'disabled'}>${lista.length}</button></td>`;
  const TIT = { pessoas: 'Vão', pagar: 'Faltam pagar', entregar: 'Faltam entregar' };
  return `<div class="card adm">${cab}
    <table class="of-est-t"><thead><tr><th>Oferenda</th><th>Vão</th><th>Falta pagar</th><th>Falta entregar</th></tr></thead><tbody>
    ${L.map(({ of, pessoas, naoPagos, naoEntregues }) => {
      const [, k] = olho && olho.startsWith(of.id + ':') ? olho.split(':') : [];
      const lista = k === 'pessoas' ? pessoas : k === 'pagar' ? naoPagos : k === 'entregar' ? naoEntregues : null;
      return `<tr><td><button class="btn link of-est-of" data-act="vercomp" data-id="${of.id}"><span class="eyebrow">${dataBR(of.data)}</span>${esc(of.titulo)}</button></td>
          ${cel(of, 'pessoas', pessoas, '')}${cel(of, 'pagar', naoPagos, 'pagar')}${cel(of, 'entregar', naoEntregues, 'entregar')}</tr>
        ${lista ? `<tr class="of-est-nomes"><td colspan="4"><span class="muted">${TIT[k]} (${lista.length}):</span> ${lista.map((m) => esc(m.nome)).join(', ')}</td></tr>` : ''}`;
    }).join('')}</tbody>
    <tfoot><tr><th>Total</th><td>${soma('pessoas')}</td><td>${soma('naoPagos')}</td><td>${soma('naoEntregues')}</td></tr></tfoot></table></div>`;
}

// Topo da aba: tudo o que a pessoa se comprometeu a levar, por oferenda (data do evento, nome e o que levar).
// Tocar no nome abre a oferenda lá embaixo.
function cardMeusCompromissos() {
  const eu = veLista() ? estado.oferendas.eu || {} : {};
  const iem = veIemanja() ? iemanja.compromisso() : null;
  if (!eu.chave && !iem) return '';
  const grupos = eu.chave ? compromissosDe(estado.oferendas.oferendas, eu.chave, hoje()) : [];
  const blocos = [...grupos.map(({ of, itens, linha }) => ({ data: of.data, html: `<div class="of-meus-g">
      <span class="of-meus-data"><span class="eyebrow">${dataBR(of.data)}</span><span class="ent">${esc(Dia(of.data))}</span></span>
      <button class="btn link of-meus-tit" data-act="vercomp" data-id="${of.id}">${esc(of.titulo)} ›</button>
      ${linha ? `<div class="of-meus-med"><span><span class="muted">Pagamento:</span> ${etqMed(linha.pagamento)}</span><span><span class="muted">Entrega:</span> ${etqMed(linha.entrega)}</span></div>` : ''}
      ${itens.length ? `<ul>${itens.map(({ i, q }) => `<li><b>${qtdAntes(q, i.unidade)}</b> ${esc(i.nome)} <span class="muted">· entrega ${textoEntrega(i)}</span></li>`).join('')}</ul>` : ''}</div>` })), ...(iem ? [iem] : [])].sort((a, b) => a.data.localeCompare(b.data));
  const h = `<div class="card of-meus"><div class="grp-h"><h2><span aria-hidden="true">🙋</span> Seus compromissos</h2>${blocos.length ? `<span class="count">${blocos.length}</span>` : ''}</div>`;
  if (!blocos.length) return h + `<p class="muted" style="margin:0;font-size:.9rem">Você não tem nada para levar. Para doar, abra a oferenda e toque em + no item.</p></div>`;
  return h + blocos.map((b) => b.html).join('') + '</div>';
}

// Percentual das doações e, quando completa, até quando dá para alterar.
const hora = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
function barraDoacoes(of, aoLado = '') {
  if (of.bloqueada || !of.itens.length) return '';
  const pct = percentualDoado(of);
  const eu = estado.oferendas.eu;
  let aviso = '';
  if (of.fechada) {
    aviso = travadaPara(of, eu.chave)
      ? `🔒 Completa há mais de um dia: as doações estão fechadas.${of.responsavel ? ` Só o responsável (${esc(of.responsavel)}) pode alterar.` : ''}`
      : '🔒 Completa há mais de um dia: só você, que é o responsável, ainda pode alterar.';
  } else if (pct >= 100 && of.completaEm) {
    aviso = `✅ Completa! Dá para alterar até ${hora(fechaEm(of))}; depois, só o responsável.`;
  }
  return `<div class="of-pct ${faixaPct(pct)}"><div class="of-pct-h"><b>${pct}%</b> <span class="muted">das doações</span>${aoLado}</div>
    <div class="of-pct-barra" role="img" aria-label="${pct}% das doações"><span style="width:${pct}%"></span></div>
    ${aviso ? `<p class="of-pct-aviso">${aviso}</p>` : ''}</div>`;
}

// Lista por pessoa: quantos já pagaram / entregaram, em porcentagem.
const pctMediuns = (of, campo, ok) => {
  const ms = of.mediuns || [];
  return ms.length ? Math.floor((ms.filter((m) => m[campo] === ok).length / ms.length) * 100) : 0;
};

// Lista por pessoa: Pagamento (pagos) e Entrega (entregues) em barra com a porcentagem; o 👁 mostra quem falta.
function barrasMediuns(of) {
  const ms = of.mediuns || [];
  if (!ms.length) return '';
  const linha = (k, titulo, campo, ok, rotFalta) => {
    const n = ms.filter((m) => m[campo] === ok).length;
    const pct = pctMediuns(of, campo, ok);
    const faltam = ms.filter((m) => m[campo] !== ok);
    const aberto = U().olho === of.id + ':' + k && faltam.length;
    return `<div class="of-medp ${k} ${faixaPct(pct)}"><div class="of-pct-h"><span class="muted">${titulo}:</span> <b>${pct}%</b> <span class="muted">${n} de ${ms.length}</span>
        <button class="btn link small of-olho-bt" data-act="olhomed" data-k="${of.id}:${k}" aria-expanded="${!!aberto}" ${faltam.length ? '' : 'disabled'} aria-label="Ver ${rotFalta}" title="Ver ${rotFalta}">👁</button></div>
      <div class="of-pct-barra" role="img" aria-label="${titulo}: ${pct}%"><span style="width:${pct}%"></span></div>
      ${aberto ? `<p class="of-olho"><span class="muted">${rotFalta[0].toUpperCase() + rotFalta.slice(1)} (${faltam.length}):</span> ${faltam.map((m) => esc(m.nome)).join(', ')}</p>` : ''}</div>`;
  };
  return linha('pag', 'Pagamento', 'pagamento', 'pago', 'quem não pagou') + linha('ent', 'Entrega', 'entrega', 'entregue', 'entregas pendentes');
}

// Oferenda recolhida: no cabeçalho, só os percentuais (com a cor da faixa).
function resumoRecolhida(of) {
  const pcts = [];
  if (!of.bloqueada && of.itens.length) pcts.push(['Doações', percentualDoado(of)]);
  if (of.porMedium && !of.bloqueada && (of.mediuns || []).length) {
    pcts.push(['Pagamento', pctMediuns(of, 'pagamento', 'pago')], ['Entrega', pctMediuns(of, 'entrega', 'entregue')]);
  }
  return pcts.map(([t, p]) => `<span class="of-res ${faixaPct(p)}">${t} <b>${p}%</b></span>`).join('');
}

// Cor da borda de cima de cada oferenda: azul publicada, vermelha bloqueada, amarela aguardando publicação,
// verde completa, cinza encerrada.
function corOferenda(of) {
  if (of.status === 'encerrado') return 'encerrada';
  if (of.status === 'rascunho') return 'bloqueada';
  if (!of.publicada) return 'espera';
  return !of.bloqueada && of.itens.length && percentualDoado(of) >= 100 ? 'completa' : 'aberta';
}

// Toda oferenda começa recolhida (só o cabeçalho); tocar no cabeçalho expande e recolhe.
// Aberta só enquanto o app estiver aberto.
function cardOferenda(of, admin) {
  const u = U();
  const aberta = u.editar === of.id || (u.abertas || []).includes(of.id);
  let h = `<div class="card of-card ${corOferenda(of)}${aberta ? '' : ' recolhida'}${admin && u.editar !== of.id ? ' com-enc' : ''}" id="of-${of.id}">`;
  if (admin && u.editar === of.id) {
    h += `<form class="row" data-form="ofed" data-id="${of.id}" autocomplete="off">
      <label class="field grow">Título<input type="text" name="titulo" maxlength="120" required value="${esc(of.titulo)}"></label>
      <label class="field" style="flex:0 1 170px">Data<input type="date" name="data" required value="${of.data}"></label>
      <label class="field grow">Responsável<select name="resp" required>${opcoesPessoas(of.responsavelId)}</select></label>
      <label class="field grow">Sub-aba<select name="aba">${estado.oferendas.abas.filter((a) => !a.iemanja).map((a) => `<option value="${a.id}" ${a.id === of.abaId ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></label>
      <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelarof">Cancelar</button></form>`;
  } else {
    const pend = of.itens.filter((i) => !situacao(i).completo).length;
    const enc = of.status === 'encerrado';
    // Admin: Encerrar (amarelo) ↔ Encerrado no topo, à direita do título; tocar de novo volta (visível, se já foi publicada).
    const btEnc = admin ? `<button class="btn small st-bt encerrar of-enc${enc ? ' ligado' : ''}" data-act="statusof" data-id="${of.id}" data-v="${enc ? (of.publicada ? 'publicado' : 'aguardando') : 'encerrado'}" aria-pressed="${enc}">${enc ? 'Encerrado' : 'Encerrar'}</button>` : '';
    // Admin: interruptor "Visível para todos" — ligado, a corrente vê e doa; desligado, só os admins veem.
    // Fica ao lado da barra de doações (na oferenda com uma linha por pessoa, acima de "Exibir no resumo").
    const visivel = admin && !enc ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="ofvisivel" data-id="${of.id}" ${of.status === 'publicado' ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Visível para todos</label>` : '';
    const comBarra = !of.porMedium && !of.bloqueada && of.itens.length;
    // Cabeçalho primeiro (faixa colorida no topo do card; tocar recolhe/expande).
    const resumo = aberta ? '' : resumoRecolhida(of);
    h += `<button class="datehead of-cab" data-act="dobrarof" data-id="${of.id}" aria-expanded="${aberta}"><span class="eyebrow">Oferenda · ${dataBR(of.data)}<span class="of-seta" aria-hidden="true">${aberta ? '▾' : '▸'}</span></span><span class="dia of-titulo">${esc(of.titulo)}</span>
        <span class="of-cab-l"><span class="ent">${esc(Dia(of.data))}</span>${of.responsavel ? `<span class="of-resp">Responsável: <b>${esc(of.responsavel)}</b></span>` : ''}</span>
        ${resumo ? `<span class="of-resumo">${resumo}</span>` : ''}</button>${btEnc}`;
    if (!aberta) return h + `</div>`;
    h += `
      ${!admin && of.status === 'rascunho' ? `<div class="of-topo">${etiqueta('rascunho')}</div>` : ''}
      ${barraDoacoes(of, visivel ? `<span class="of-pct-sw">${visivel}</span>` : '')}
      ${of.porMedium && !of.bloqueada ? barrasMediuns(of) : ''}
      ${!comBarra ? visivel : ''}
      ${admin && of.porMedium ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="ofresumo" data-id="${of.id}" ${of.noResumo ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Exibir no resumo <span class="muted">(tabela Oferendas por pessoa)</span></label>` : ''}
      <p class="muted" style="margin:0;font-size:.88rem">${of.porMedium && !of.bloqueada ? `Uma linha por pessoa ·${(of.mediuns || []).length} pessoas${of.itens.length ? ' · ' : ''}` : ''}${of.bloqueada ? 'Lista bloqueada no momento.' : of.porMedium && !of.itens.length ? '' : of.itens.length ? `${of.itens.length} ${of.itens.length === 1 ? 'item' : 'itens'} · ${pend ? `${pend} com doação pendente` : 'todos com doadores'}` : 'Nenhum item ainda.'}</p>`;
  }
  // Bloqueada: para a corrente, itens ocultos. O admin continua vendo e alterando.
  const bloqueada = of.status === 'rascunho' && !admin;
  // No fim da oferenda aberta, "Recolher" (para não precisar voltar ao cabeçalho numa lista longa).
  const recolher = u.editar !== of.id ? `<button class="btn link small of-dobra" data-act="dobrarof" data-id="${of.id}" aria-expanded="true">▴ Recolher</button>` : '';
  if (bloqueada) return h + recolher + `</div>`;
  if (of.porMedium) h += blocoMediuns(of, admin);
  // Cadastrar item fica no topo da lista (a oferenda com uma linha por pessoa não tem itens novos).
  if (admin && !of.porMedium) {
    h += `<details class="of-novo"${u.novoItem === of.id ? ' open' : ''}><summary>+ Adicionar item</summary>
      <form class="row" data-form="item" data-of="${of.id}" autocomplete="off">${camposItem()}<button class="btn primary" type="submit">Adicionar</button></form></details>`;
  }
  const eu = estado.oferendas.eu;
  h += listaItens(of.itens, { p: '', eu, admin, ref: of, podeDoar: of.status === 'publicado' && !travadaPara(of, eu.chave), opcoesDoador });
  return h + rodapeOferenda(of, admin) + recolher + `</div>`;
}

// Compartilhar, editar e excluir (aparece também com a oferenda minimizada).
function rodapeOferenda(of, admin) {
  if (!admin) return '';   // compartilhar, editar e excluir: só admin
  const u = U();
  // Os 4 botões lado a lado, do mesmo tamanho.
  return `<div class="of-rod">${botoesCompartilhar(of)}
    ${u.editar !== of.id ? `<button class="btn" data-act="editarof" data-id="${of.id}">Editar</button>
      ${estado.confirm === 'of:' + of.id ? `<button class="btn danger" data-act="delof" data-id="${of.id}">Confirmar exclusão</button>` : `<button class="btn" data-act="askdel" data-k="of:${of.id}">Excluir</button>`}` : ''}</div>${painelCompartilhar(of)}`;
}

function listaDaAba(aba) {
  // Alunos (para "doação por alguém"): só quem administra e pode ver os alunos.
  if (pode('oferendas:gerenciar') && pode('alunos:ver') && estado.alunos === null) { estado.alunos = undefined; carregarAlunos(); }
  const admin = pode('oferendas:gerenciar');
  const lista = daAba(aba);
  const hj = hoje();
  const proximas = lista.filter((o) => o.data >= hj);
  const anteriores = lista.filter((o) => o.data < hj).reverse();
  let h = blocoDetalhes(aba.id, aba.detalhes, admin, 'ofdetsalvar');
  if (admin) {
    // Começa minimizado; abre ao tocar no título (aberto já se a sub-aba ainda não tiver nenhuma oferenda).
    const novaAberta = U().novaAberta ?? !lista.length;
    h += `<div class="card adm"><button class="grp-h dobra" data-act="dobrarnova" aria-expanded="${novaAberta}"><h2>＋ Nova oferenda</h2><span class="count"><span class="seta" aria-hidden="true">${novaAberta ? '▾' : '▸'}</span></span></button>`;
    const r = U().novaRascunho || {};
    if (novaAberta) h += `<form id="f-of" class="row" autocomplete="off">
      <label class="field grow">Título<input type="text" id="of-titulo" maxlength="120" required placeholder="Ex.: Oferenda de Iemanjá" value="${esc(r.titulo || '')}"></label>
      <label class="field" style="flex:0 1 170px">Data<input type="date" id="of-data" required value="${esc(r.data || '')}"></label>
      <label class="field grow">Responsável<select id="of-resp" required>${opcoesPessoas(r.responsavelId || '')}</select></label>
      <label class="check" style="flex-basis:100%;align-items:flex-start"><input type="checkbox" id="of-pormedium" data-act="pormedium" style="margin-top:3px" ${U().novaPorMedium ? 'checked' : ''}><span>Uma linha para cada pessoa<br><span class="muted" style="font-size:.85rem">Em cada linha o admin confere o pagamento (Pago / Não pago) e a entrega (Pendente / Entregue), e pode tirar quem não participa.</span></span></label>
      <div class="of-grupos" id="of-grupos" ${U().novaPorMedium ? '' : 'hidden'}><span class="muted" style="font-size:.85rem;flex-basis:100%">De quais grupos vêm as pessoas (Médiuns = médium, extra, passe, cambone, senha e curimba). Quem for cadastrado depois entra sozinho:</span>
        ${chipsGrupos('grupo', 'grupoof', U().novaGrupos || GRUPOS_CORRENTE)}</div>
      <button class="btn primary" type="submit">Criar</button></form>`;
    h += `</div>`;
  }
  if (!lista.length) return h + `<div class="card empty"><p class="muted">${admin ? 'Nenhuma oferenda nesta sub-aba. Crie a primeira acima.' : 'Nenhuma oferenda aberta para doação nesta sub-aba.'}</p></div>`;
  h += `<div class="of-sec"><h2><span aria-hidden="true">🕯️</span> Próximas oferendas</h2><span class="of-sec-n">${proximas.length}</span></div>`;
  h += proximas.map((o) => cardOferenda(o, admin)).join('');
  if (!proximas.length) h += `<div class="card empty"><p class="muted">Nenhuma oferenda marcada para os próximos dias.</p></div>`;
  if (anteriores.length) {
    h += `<details class="anteriores"${U().anteriores ? ' open' : ''}><summary>Oferendas anteriores (${anteriores.length})</summary>${anteriores.map((o) => cardOferenda(o, admin)).join('')}</details>`;
  }
  return h;
}

// Sub-abas; o + e Renomear/Excluir são só do root.
function barraAbas(aba) {
  const l = subabas();
  const root = souRoot() && veLista();
  if (l.length < 2 && !root) return '';
  return `<div class="subabas" role="tablist" aria-label="Sub-abas de oferendas">${l.map((a) => `<button class="subaba" role="tab" data-act="ofaba" data-id="${a.id}" aria-selected="${a.id === aba.id}">${a.iemanja || a.visivel ? '' : '<span title="Só os admins veem" aria-label="Oculta">🔒</span> '}${esc(a.nome)}</button>`).join('')}${root ? '<button class="subaba mais" data-act="ofabanova" aria-label="Criar sub-aba" title="Criar sub-aba">＋</button>' : ''}</div>
    ${root && !aba.iemanja ? `<div class="subaba-adm"><label class="of-sw"><input type="checkbox" role="switch" data-act="ofabavisivel" data-id="${aba.id}" ${aba.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label><span class="subaba-bts"><button class="btn link small" data-act="ofabaeditar">✎ Renomear</button><button class="btn link small danger" data-act="ofabaexcluir">Excluir sub-aba</button></span></div>` : ''}`;
}

function janelaNova() {
  const r = U().novaConfirma ? U().novaRascunho : null;
  if (!r) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="nova-t"><div class="modal"><h3 id="nova-t">Criar esta oferenda?</h3><p style="margin:0"><b>${esc(r.titulo)}</b> em ${dataBR(r.data)}, na sub-aba <b>${esc(abaAtiva().nome)}</b>.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="ofnovanao">Voltar</button><button class="btn primary" data-act="ofnovasim">Criar</button></div></div></div>`;
}

function janelaAba() {
  const j = U().abaJanela;
  if (!j) return '';
  const rodape = (bt, act, cor) => `<div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="ofabajanelanao">Voltar</button><button class="btn ${cor}" data-act="${act}">${bt}</button></div>`;
  if (j.t === 'excluir') return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="aba-t"><div class="modal"><h3 id="aba-t">Excluir esta sub-aba?</h3><p style="margin:0"><b>${esc(j.nome)}</b> sai da aba Oferendas.</p>${rodape('Excluir', 'ofabaconfirma', 'danger')}</div></div>`;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="aba-t"><div class="modal"><h3 id="aba-t">${j.t === 'nova' ? 'Nova sub-aba' : 'Renomear sub-aba'}</h3><label class="field">Nome<input type="text" id="ofaba-nome" maxlength="40" value="${esc(j.nome)}"></label>${rodape('Salvar', 'ofabasalvar', 'primary')}</div></div>`;
}

export function render() {
  const carregandoLista = veLista() && estado.oferendas === null;
  const carregandoIem = veIemanja() && estado.iemanja === null;
  if (carregandoLista) carregarOferendas();
  if (carregandoIem) carregarIemanja();
  if (carregandoLista || carregandoIem) return `<div class="loading">Carregando oferendas…</div>`;
  const aba = abaAtiva();
  if (!aba) return `<section class="panel"><div class="card empty"><p class="muted">Nenhuma oferenda disponível.</p></div></section>`;
  return `<section class="panel">${cardMeusCompromissos()}${veLista() ? cardPorPessoa() : ''}${barraAbas(aba)}${aba.iemanja ? iemanja.conteudo() : listaDaAba(aba)}${janelaEntregue()}${janelaAba()}${janelaNova()}</section>`;
}

// Janela "Confirmar entrega" da caixinha de entregue da linha do item: OK marca, Cancelar deixa como está.
function janelaEntregue() {
  const { of, item } = U().confEntregue ? achar(U().confEntregue) : {};
  if (!item) return '';
  const resp = item.doacoes.map((d) => `${esc(d.nome)} (${qtdTxt(d.quantidade, item.unidade)})`).join(', ');
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ent-t"><div class="modal">
    <h3 id="ent-t">Confirmar entrega</h3>
    <p style="margin:0">Confirma que <b>${esc(item.nome)}</b> da ${esc(of.titulo)} foi entregue?${resp ? `<br><span class="muted">Responsáveis: ${resp}</span>` : ''}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="entcancelar">Cancelar</button><button class="btn primary" data-act="entregue" data-id="${item.id}" data-v="1">OK</button></div>
  </div></div>`;
}

const achar = (id) => {
  for (const of of estado.oferendas?.oferendas || []) {
    if (of.id === id) return { of };
    const i = of.itens.find((x) => x.id === id);
    if (i) return { of, item: i };
  }
  // Grupo da Iemanjá, para compartilhar com as mesmas ações.
  const of = iemanja.comoOferenda(id);
  return of ? { of } : {};
};

export const cliques = {
  ...iemanja.cliques,
  catdobra: dobrarCategoria,
  iemver(el) { U().aba = subabas().find((a) => a.iemanja)?.id; iemanja.cliques.iemver(el); },
  ofaba(el) { U().aba = el.dataset.id; U().novaAberta = undefined; U().novaRascunho = null; avisar(); },
  ofnovanao() { U().novaConfirma = false; avisar(); },
  async ofnovasim() {
    const { titulo, data, responsavelId, porMedium, grupos } = U().novaRascunho;
    U().novaConfirma = false;
    if (await acaoOferendas('salvar', { titulo, data, responsavelId, abaId: abaAtiva().id, porMedium, ...(porMedium ? { grupos } : {}) })) {
      U().novaRascunho = null; U().novaPorMedium = false; U().novaGrupos = null;
      toast(porMedium ? 'Oferenda criada com uma linha para cada pessoa. Toque em Publicar para a corrente ver.' : 'Oferenda criada. Adicione os itens e toque em Publicar para a corrente ver.');
      // A oferenda recém-criada já vem aberta (as outras continuam recolhidas).
      const nova = estado.oferendas.oferendas.filter((o) => o.porMedium === porMedium && o.titulo === titulo.replace(/\s+/g, ' ').trim() && o.data === data).pop();
      if (nova) U().abertas = [...new Set([...(U().abertas || []), nova.id])];
    }
    avisar();
  },
  ofabanova() { U().abaJanela = { t: 'nova', nome: '' }; avisar(); },
  ofabaeditar() { const a = abaAtiva(); U().abaJanela = { t: 'renomear', id: a.id, nome: a.nome }; avisar(); },
  ofabaexcluir() {
    const a = abaAtiva();
    if (daAba(a).length) { toast('Mova ou exclua as oferendas desta sub-aba antes.'); return; }
    U().abaJanela = { t: 'excluir', id: a.id, nome: a.nome }; avisar();
  },
  ofabajanelanao() { U().abaJanela = null; avisar(); },
  async ofabasalvar() {
    const j = U().abaJanela;
    const nome = document.getElementById('ofaba-nome').value.trim();
    if (!nome) { toast('Escreva o nome da sub-aba.'); return; }
    const antes = new Set(estado.oferendas.abas.map((a) => a.id));
    if (await acaoOferendas('abaSalvar', { id: j.id, nome })) {
      U().abaJanela = null;
      const nova = estado.oferendas.abas.find((a) => !antes.has(a.id));
      if (nova) U().aba = nova.id;
      toast(j.id ? 'Sub-aba renomeada.' : 'Sub-aba criada. Ligue Visível para todos quando estiver pronta.');
      avisar();
    }
  },
  async ofabaconfirma() {
    const { id } = U().abaJanela;
    U().abaJanela = null;
    if (await acaoOferendas('abaExcluir', { id })) toast('Sub-aba excluída.');
    avisar();
  },
  ofdetsalvar(el) { return salvarDetalhes((detalhes) => acaoOferendas('abaDetalhes', { id: el.dataset.id, detalhes })); },
  // Ao abrir, recarrega as turmas (uma turma nova no cadastro já aparece nos grupos).
  dobrarnova() {
    U().novaAberta = !(U().novaAberta ?? !daAba(abaAtiva()).length); avisar();
    if (U().novaAberta && pode('alunos:ver')) carregarAlunos();
  },
  // Item da oferenda: abre (mostra entrega, doadores, Vou doar e os botões do admin) e recolhe.
  dobraritem(el) {
    const set = new Set(U().itensAbertos || []);
    if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id);
    U().itensAbertos = [...set];
    avisar();
  },
  ofmais(el) {
    const { item } = achar(el.dataset.id);
    const eu = estado.oferendas.eu;
    const minha = item.doacoes.find((d) => d.chave === eu.chave)?.quantidade || 0;
    const falta = situacao(item).falta;
    if (falta <= 0) return;
    const q = arred(minha + passoLevar(falta));
    doarItem(item.id, q);
    avisoLevar(item, q);
  },
  ofmenos(el) {
    const { item } = achar(el.dataset.id);
    const minha = item.doacoes.find((d) => d.chave === estado.oferendas.eu.chave)?.quantidade || 0;
    if (minha > 0) { const q = arred(Math.max(0, minha - 1)); doarItem(item.id, q); avisoLevar(item, q); }
  },
  async pormais(el) { await porAlguem(el, +1); },
  async pormenos(el) { await porAlguem(el, -1); },
  async pordel(el) {
    estado.confirm = null;
    if (await acaoOferendas('doarPor', { itemId: el.dataset.item, chave: el.dataset.chave, quantidade: 0 })) toast('Doação excluída.');
  },
  async entregue(el) {
    U().confEntregue = null;
    if (await acaoOferendas('entregue', { id: el.dataset.id, entregue: el.dataset.v === '1' })) toast(el.dataset.v === '1' ? 'Item marcado como entregue.' : 'Entrega desfeita.');
  },
  // Caixinha de entregue na linha do item: abre a janela de confirmação.
  askentregue(el) { U().confEntregue = el.dataset.id; avisar(); },
  entcancelar() { U().confEntregue = null; avisar(); },
  editaritem(el) { U().editarItem = el.dataset.id; avisar(); },
  cancelaritem() { U().editarItem = null; avisar(); },
  async delitem(el) { estado.confirm = null; if (await acaoOferendas('excluirItem', { id: el.dataset.id })) toast('Item excluído.'); },
  editarof(el) { U().editar = el.dataset.id; avisar(); },
  cancelarof() { U().editar = null; avisar(); },
  olhomed(el) { U().olho = U().olho === el.dataset.k ? null : el.dataset.k; avisar(); },
  // Tabela do admin: tocar no número mostra (ou esconde) as pessoas.
  estolho(el) { U().estOlho = U().estOlho === el.dataset.k ? null : el.dataset.k; avisar(); },
  // Seus compromissos → abre a oferenda e rola até ela.
  vercomp(el) {
    const id = el.dataset.id;
    U().aba = achar(id).of?.abaId;
    U().abertas = [...new Set([...(U().abertas || []), id])];
    avisar();
    setTimeout(() => document.getElementById('of-' + id)?.scrollIntoView({ block: 'start' }), 0);
  },
  dobrarof(el) {
    const set = new Set(U().abertas || []);
    if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id);
    U().abertas = [...set];
    avisar();
  },
  async statusof(el) {
    const t = { publicado: 'Oferenda visível para todos: a corrente já pode ver e doar.', encerrado: 'Oferenda encerrada: saiu da lista da corrente.', aguardando: 'Oferenda reaberta: só os admins veem.' };
    if (await acaoOferendas('status', { id: el.dataset.id, status: el.dataset.v })) toast(t[el.dataset.v]);
  },
  async delmedium(el) {
    estado.confirm = null;
    const m = (achar(el.dataset.of).of?.mediuns || []).find((x) => x.pessoaId === el.dataset.p);
    if (await acaoOferendas('excluirMedium', { oferendaId: el.dataset.of, pessoaId: el.dataset.p })) toast(`${m?.nome || 'A pessoa'} saiu da lista desta oferenda.`);
  },
  incluirmed(el) { U().incluir = U().incluir === el.dataset.id ? null : el.dataset.id; U().incluirGrupos = null; avisar(); },
  async atualizarmed(el) {
    const grupos = gruposParaEnviar([...el.closest('.of-incluir').querySelectorAll('input[name=grupoinc]:checked')].map((x) => x.value));
    if (!grupos.length) { toast('Escolha pelo menos uma lista.'); return; }
    const antes = (achar(el.dataset.id).of?.mediuns || []).length;
    if (await acaoOferendas('atualizarMediuns', { id: el.dataset.id, grupos })) {
      U().incluir = null; U().incluirGrupos = null;
      const n = (achar(el.dataset.id).of?.mediuns || []).length - antes;
      toast(n ? `${n} pessoa${n > 1 ? 's' : ''} incluída${n > 1 ? 's' : ''}.` : 'Ninguém novo nessas listas.');
      avisar();
    }
  },
  async delof(el) { estado.confirm = null; if (await acaoOferendas('excluir', { id: el.dataset.id })) toast('Oferenda excluída.'); },
  compartilhar(el) { U().compartilhar = U().compartilhar === el.dataset.id ? null : el.dataset.id; avisar(); },
  copiarof(el) {
    const t = document.getElementById('of-txt-' + el.dataset.id);
    const fb = () => { t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(t.value).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
  },
  async imgof(el) {
    const { of } = achar(el.dataset.id);
    try {
      const blob = await gerarImagemOferenda(of);
      if (U().img) URL.revokeObjectURL(U().img.url);
      U().img = { id: of.id, chave: textoCompartilhar(of), blob, url: URL.createObjectURL(blob), nome: 'oferenda-' + of.data + '.png' };
      avisar();
    } catch (e) { toast(e.message); }
  },
  // Gera a imagem e já abre o compartilhar do aparelho; se não der, mostra a imagem para salvar.
  async imgofdireto(el) {
    const { of } = achar(el.dataset.id);
    try {
      const blob = await gerarImagemOferenda(of);
      if (U().img) URL.revokeObjectURL(U().img.url);
      U().img = { id: of.id, chave: textoCompartilhar(of), blob, url: URL.createObjectURL(blob), nome: 'oferenda-' + of.data + '.png' };
      const f =new File([blob], U().img.nome, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: of.titulo }).catch(() => {});
      } else {
        U().compartilhar = of.id;
        toast('Imagem pronta: toque em Salvar imagem.');
      }
      avisar();
    } catch (e) { toast(e.message); }
  },
  saveimgof() { const i = U().img; if (i) baixar(i.url, i.nome); },
  shareimgof() {
    const i = U().img;
    if (!i) return;
    navigator.share({ files: [new File([i.blob], i.nome, { type: 'image/png' })], title: 'Oferenda' })
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagem.'); });
  },
};

async function porAlguem(el, delta) {
  const { item } = achar(el.dataset.item);
  const d = item?.doacoes.find((x) => x.chave === el.dataset.chave);
  if (!d) return;
  const falta = situacao(item).falta;
  if (delta > 0 && falta <= 0) return;
  const q = arred(Math.max(0, Number(d.quantidade) + (delta > 0 ? passoLevar(falta) : -1)));
  await acaoOferendas('doarPor', { itemId: item.id, chave: d.chave, quantidade: q });
}

export const mudancas = {
  ...iemanja.mudancas,
  async ofabavisivel(t) {
    const visivel = t.checked;
    if (await acaoOferendas('abaVisivel', { id: t.dataset.id, visivel })) toast(visivel ? 'Sub-aba visível para todos.' : 'Sub-aba oculta: só os admins veem.');
    else t.checked = !visivel;
  },
  // "Exibir no resumo": a oferenda por pessoa entra (ou sai) da tabela do admin.
  // "Visível para todos": ligado publica (a corrente vê e doa); desligado, só os admins veem.
  async ofvisivel(t) {
    if (await acaoOferendas('status', { id: t.dataset.id, status: t.checked ? 'publicado' : 'aguardando' })) toast(t.checked ? 'Oferenda visível para todos: a corrente já pode ver e doar.' : 'Oferenda escondida: só os admins veem.');
  },
  async ofresumo(t) {
    if (await acaoOferendas('resumo', { id: t.dataset.id, noResumo: t.checked })) toast(t.checked ? 'A oferenda aparece no resumo.' : 'A oferenda saiu do resumo.');
  },
  // "Uma linha para cada pessoa": mostra os grupos (sem redesenhar, para não perder o que foi digitado).
  pormedium(t) { U().novaPorMedium = t.checked; const g = document.getElementById('of-grupos'); if (g) g.hidden = !t.checked; },
  grupoof(t) { U().novaGrupos = [...t.form.querySelectorAll('input[name=grupo]:checked')].map((x) => x.value); },
  grupoinc(t) { U().incluirGrupos = [...t.closest('.of-incluir').querySelectorAll('input[name=grupoinc]:checked')].map((x) => x.value); },
  async ofmedium(t) {
    t.className = 'sel-med ' + t.value;
    if (!(await acaoOferendas('medium', { oferendaId: t.dataset.of, pessoaId: t.dataset.p, [t.dataset.campo]: t.value }))) avisar();
  },
  // "No dia do evento" esconde a data; "Escolher data" mostra.
  modoentrega(t) {
    const campo = t.closest('form').querySelector('input[name=entrega]');
    campo.closest('label').hidden = t.value !== 'data';
    if (t.value === 'data') campo.focus();
  },
};

// Depois de tocar em + / − no item: o que a pessoa vai levar.
export function avisoLevar(item, q) {
  const ate = item.entrega ? ` até ${dataBR(item.entrega).slice(0, 5)}` : '';
  toast(q > 0 ? `Você vai levar ${qtdTxt(q, item.unidade)}: ${item.nome}${ate}.` : `Você não vai mais levar ${item.nome}.`);
}

// Formulários (criar oferenda, editar, adicionar/editar item).
export async function enviar(form) {
  if (form.dataset.form?.startsWith('iem')) return iemanja.enviar(form);
  const v = (n) => form.elements[n]?.value ?? '';
  if (form.id === 'f-of') {
    const titulo = document.getElementById('of-titulo').value, data = document.getElementById('of-data').value;
    const responsavelId = document.getElementById('of-resp').value;
    const porMedium = document.getElementById('of-pormedium').checked;
    const grupos = gruposParaEnviar([...form.querySelectorAll('input[name=grupo]:checked')].map((x) => x.value));
    if (!data) { toast('Escolha a data.'); return; }
    if (!responsavelId) { toast('Escolha o responsável.'); return; }
    if (porMedium && !grupos.length) { toast('Escolha pelo menos um grupo (corrente ou alunos).'); return; }
    U().novaRascunho = { titulo, data, responsavelId, porMedium, grupos };
    U().novaConfirma = true;
    avisar();
    return;
  }
  if (form.dataset.form === 'ofed') {
    if (!v('resp')) { toast('Escolha o responsável.'); return; }
    if (await acaoOferendas('salvar', { id: form.dataset.id, titulo: v('titulo'), data: v('data'), responsavelId: v('resp'), abaId: v('aba') })) { U().editar = null; toast('Oferenda salva.'); avisar(); }
    return;
  }
  // Pessoa da corrente (id) ou aluno ('a:' + id).
  const nomeDe = (pessoa) => (pessoa.startsWith('a:') ? (estado.alunos?.alunos || []).find((a) => 'a:' + a.id === pessoa)?.nome || ''
    : estado.pessoas.find((p) => p.id === pessoa)?.nome || '');
  if (form.dataset.form === 'porpessoa') {
    const pessoa = v('pessoa');
    const qtd = Number(v('qtd'));
    if (!pessoa) { toast('Escolha a pessoa.'); return; }
    if (!(qtd > 0)) { toast('Informe a quantidade.'); return; }
    if (await acaoOferendas('doarPor', { itemId: form.dataset.item, pessoaId: pessoa, quantidade: qtd })) toast(`Doação de ${nomeDe(pessoa)} registrada.`);
    return;
  }
  if (form.dataset.form === 'addmedium') {
    const pessoa = v('pessoa');
    if (!pessoa) { toast('Escolha a pessoa.'); return; }
    if (await acaoOferendas('incluirMedium', { oferendaId: form.dataset.of, pessoaId: pessoa })) toast(`${nomeDe(pessoa)} entrou na lista.`);
    return;
  }
  const entrega = v('modo') === 'data' ? v('entrega') : '';
  if (v('modo') === 'data' && !entrega) { toast('Escolha a data da entrega.'); return; }
  if (!v('unidade')) { toast('Escolha a unidade.'); return; }
  const dados = { nome: v('nome'), quantidade: Number(v('qtd')), unidade: v('unidade'), entrega };
  if (form.dataset.form === 'item') {
    U().novoItem = form.dataset.of;
    U().abertas = [...new Set([...(U().abertas || []), form.dataset.of])];   // continua aberta para cadastrar mais
    if (await acaoOferendas('item', { oferendaId: form.dataset.of, ...dados })) {
      toast('Item adicionado.');
      document.querySelector(`form[data-form=item][data-of="${form.dataset.of}"] input[name=nome]`)?.focus();
    }
  } else if (form.dataset.form === 'itemed') {
    if (await acaoOferendas('item', { id: form.dataset.id, ...dados })) { U().editarItem = null; toast('Item salvo.'); avisar(); }
  }
}
