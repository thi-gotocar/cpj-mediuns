// Tela "Ervas": escolher as ervas da compra coletiva; o admin cadastra, define o frete e exporta.

import { centavos, reais, calcularPedidos, totaisPorErva, temPreco, textoFornecedor, csvFornecedor, textoCobranca, csvCobranca, normalizarNome, linhaEvento } from '/shared/ervas.js';
import { estado, pode, carregarErvas, escolherErva, acaoErvas, salvarPedidoDe, avisar } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';

const qtdDe = (ervaId) => (estado.ervas.minhas || []).find((m) => m.ervaId === ervaId)?.quantidade || 0;
const precoTxt = (v) => (v === null || v === undefined ? 'preço a definir' : reais(centavos(v)));
const precoCampo = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));

// Recalcula os pedidos com as minhas escolhas da tela (antes de salvar), para mostrar
// a minha parte de cada erva e do frete já com quem mais pediu.
function simular(E) {
  const eu = E.eu.chave;
  const outros = (E.pedidos?.pessoas || []).filter((p) => p.chave !== eu)
    .flatMap((p) => p.itens.map((i) => ({ chave: p.chave, nome: p.nome, ervaId: i.ervaId, quantidade: i.quantidade })));
  const minhas = (E.minhas || []).map((m) => ({ chave: eu, nome: E.eu.nome, ervaId: m.ervaId, quantidade: m.quantidade }));
  return calcularPedidos(E.ervas, [...outros, ...minhas], E.frete);
}

function meuPedido(E, r) {
  const p = r.pessoas.find((x) => x.chave === E.eu.chave);
  if (!p) return { itens: [], subtotal: 0, frete: 0, total: 0, pessoas: r.pessoas.length + 1, pendente: false, porErva: {} };
  return { itens: p.itens, subtotal: p.subtotal, frete: p.frete, total: p.total, pessoas: r.pessoas.length, pendente: !!p.semPreco,
    porErva: Object.fromEntries(p.itens.map((i) => [i.ervaId, i])) };
}

// Quantas pessoas escolheram cada erva (para mostrar antes de eu escolher).
function pessoasPorErva(r) {
  const m = {};
  r.pessoas.forEach((p) => p.itens.forEach((i) => { m[i.ervaId] = (m[i.ervaId] || 0) + 1; }));
  return m;
}

function cardEscolha(E) {
  const aberta = E.aberta;
  let h = `<div class="card"><div class="grp-h"><h2>Escolher ervas</h2><span class="count">${esc(E.eu.nome)}</span></div>`;
  if (!aberta) h += `<div class="warnbox">A lista está fechada. Seu pedido não pode mais ser alterado.</div>`;
  if (!E.ervas.length) return h + `<p class="muted" style="margin:0">Nenhuma erva cadastrada ainda.${pode('ervas:gerenciar') ? ' Cadastre abaixo.' : ''}</p></div>`;
  const r = simular(E);
  const m = meuPedido(E, r);
  const nPor = pessoasPorErva(r);
  h += `<div class="ervas">`;
  E.ervas.forEach((e) => {
    const q = qtdDe(e.id);
    const n = nPor[e.id] || 0;
    const minha = m.porErva[e.id];
    const info = !temPreco(e) ? 'preço a definir'
      : `${reais(centavos(e.preco))} no total${n ? ` · ${n} pessoa${n > 1 ? 's' : ''}` : ''}${minha ? ` · sua parte ≈ ${reais(minha.valor)}` : ''}`;
    h += `<div class="erva ${q ? 'sel' : ''}">
      <span class="nmcell"><span class="nm">${esc(e.nome)}</span><span class="muted" style="font-size:.85rem">${info}</span></span>
      <span class="qtd">
        <button class="btn small" data-act="menos" data-id="${e.id}" ${!aberta || !q ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n" aria-live="polite">${q}</span>
        <button class="btn small ${q ? '' : 'primary'}" data-act="mais" data-id="${e.id}" ${!aberta || q >= 99 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span></div>`;
  });
  h += `</div>`;
  h += `<div class="resumo">
    <div><span>Ervas</span><b>${reais(m.subtotal)}${m.pendente ? ' + a definir' : ''}</b></div>
    <div><span>Frete${m.pessoas ? ` (÷ ${m.pessoas})` : ''}</span><b>${m.itens.length ? '≈ ' + reais(m.frete) : '—'}</b></div>
    <div class="tot"><span>Total</span><b>${m.itens.length ? '≈ ' + reais(m.total) + (m.pendente ? ' + a definir' : '') : reais(0)}</b></div>
  </div>
  ${m.pendente ? '<p class="muted" style="margin:0;font-size:.85rem">Algumas ervas ainda estão sem preço. O valor final sai quando o admin fechar os preços.</p>' : ''}
  <p class="muted" style="margin:0;font-size:.85rem">O preço de cada erva é dividido entre quem escolheu aquela erva (na proporção da quantidade), e o frete de ${precoTxt(E.frete)} entre todos que pedirem. Os valores mudam conforme mais pessoas pedem.</p></div>`;
  return h;
}

// Admin: pedido de outra pessoa (quem não tem acesso ao app, ou para corrigir um pedido).
function cardPedidoDe(E) {
  const P = estado.ervasPara;
  let h = `<div class="card" id="card-para"><div class="grp-h"><h2>Pedido para outra pessoa</h2></div>`;
  if (!P) {
    return h + `<form id="f-para" class="row" autocomplete="off">
      <label class="field grow">Nome da pessoa<input type="text" id="pa-nome" maxlength="60" placeholder="Ex.: Dona Maria"></label>
      <button class="btn primary" type="submit">Montar pedido</button></form>
      <p class="muted" style="margin:0;font-size:.85rem">Para quem não usa o app. Se a pessoa já tiver pedido, o pedido dela abre para editar. Também dá para editar pela tabela de pedidos. Funciona com a lista fechada.</p></div>`;
  }
  const total = Object.values(P.itens).reduce((a, q) => a + q, 0);
  h += `<p style="margin:0"><b>${esc(P.nome)}</b>${P.chave ? ' <span class="badge rep">editando pedido</span>' : ' <span class="badge new">pedido novo</span>'}</p><div class="ervas">`;
  E.ervas.forEach((e) => {
    const q = P.itens[e.id] || 0;
    h += `<div class="erva ${q ? 'sel' : ''}">
      <span class="nmcell"><span class="nm">${esc(e.nome)}</span><span class="muted" style="font-size:.85rem">${precoTxt(e.preco)}</span></span>
      <span class="qtd">
        <button class="btn small" data-act="pamenos" data-id="${e.id}" ${!q ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n">${q}</span>
        <button class="btn small ${q ? '' : 'primary'}" data-act="pamais" data-id="${e.id}" ${q >= 99 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span></div>`;
  });
  h += `</div><div class="row">
      <button class="btn primary" data-act="pasalvar">${total ? 'Salvar pedido' : P.chave ? 'Apagar pedido' : 'Salvar pedido'}</button>
      <button class="btn" data-act="pacancelar">Cancelar</button></div>
    ${!total && P.chave ? '<p class="muted" style="margin:0;font-size:.85rem">Sem nenhuma erva, o pedido desta pessoa é apagado.</p>' : ''}</div>`;
  return h;
}

// Nome da gira e data do pedido, logo abaixo do título dos quadros de pedidos.
function linhaGira(E) {
  const ev = linhaEvento({ gira: E.gira, data: E.data });
  return ev ? `<p class="gira-ped">${esc(ev)}</p>` : '';
}

// Andamento geral dos pedidos (para quem não é admin): consolidado por erva, só leitura.
function cardStatus(E) {
  const r = E.pedidos;
  if (!r) return '';
  let h = `<div class="card"><div class="grp-h"><h2>Pedidos da corrente</h2><span class="count">${r.pessoas.length} pessoa${r.pessoas.length === 1 ? '' : 's'} · lista ${E.aberta ? 'aberta' : 'fechada'}</span></div>${linhaGira(E)}`;
  if (!r.pessoas.length) return h + `<p class="muted" style="margin:0">Ninguém escolheu ervas ainda.</p></div>`;
  const precos = Object.fromEntries(E.ervas.map((e) => [e.nome, e.preco]));
  const minhas = new Set((E.minhas || []).map((m) => E.ervas.find((e) => e.id === m.ervaId)?.nome));
  const tot = totaisPorErva(r);
  h += `<div class="matrix"><table class="pedidos"><thead><tr><th class="rh">Erva</th><th>Quantidade</th><th>Preço total</th></tr></thead><tbody>
    ${tot.map((t) => `<tr${minhas.has(t.nome) ? ' class="eu"' : ''}><th class="rh">${esc(t.nome)}</th><td>${t.quantidade}</td><td>${precos[t.nome] === null || precos[t.nome] === undefined ? '<span class="muted">a definir</span>' : reais(t.valor)}</td></tr>`).join('')}
    </tbody><tfoot><tr><th class="rh">Total</th><td>${tot.reduce((a, t) => a + t.quantidade, 0)}</td><td><b>${reais(r.totalItens)}${r.faltamPrecos.length ? ' +?' : ''}</b></td></tr></tfoot></table></div>
    <p class="muted" style="margin:0;font-size:.85rem">${minhas.size ? 'Em destaque, as ervas que você escolheu. ' : ''}${r.totalFrete ? `Frete: ${reais(r.totalFrete)}, dividido entre ${r.pessoas.length} pessoa${r.pessoas.length === 1 ? '' : 's'}.` : ''}</p>`;
  return h + `</div>`;
}

function cardCompra(E) {
  return `<div class="card"><h2>Compra</h2>
    <div class="row">
      <label class="field grow">Nome da gira<input type="text" id="ev-gira" maxlength="80" value="${esc(E.gira || '')}" placeholder="Ex.: Gira de Caboclo"></label>
      <label class="field" style="flex:0 1 170px">Data do evento<input type="date" id="ev-data" value="${esc(E.data || '')}"></label>
      <button class="btn" data-act="evento">Salvar gira</button>
    </div>
    <div class="row">
      <label class="field" style="flex:0 1 180px">Frete total (R$)<input type="text" inputmode="decimal" id="ev-frete" value="${(Number(E.frete) || 0).toFixed(2).replace('.', ',')}"></label>
      <button class="btn" data-act="frete">Salvar frete</button>
      <button class="btn ${E.aberta ? '' : 'primary'}" data-act="abrir" data-v="${E.aberta ? '0' : '1'}">${E.aberta ? 'Fechar lista' : 'Reabrir lista'}</button>
    </div>
    <p class="muted" style="margin:0;font-size:.85rem">${E.aberta ? 'Lista aberta: todos podem escolher e mudar o pedido.' : 'Lista fechada: ninguém altera o pedido até você reabrir.'}</p>
  </div>`;
}

// Começa minimizado a cada vez que o app abre; tocar no título expande.
// Sem nenhuma erva cadastrada, já abre para cadastrar (e fica aberto enquanto cadastra).
let precosAberto = null;
function cardCatalogo(E) {
  if (precosAberto === null) precosAberto = !E.ervas.length;
  const aberto = precosAberto;
  const sem = E.ervas.filter((e) => !temPreco(e)).length;
  let h = `<div class="card"><button class="grp-h dobra" data-act="dobrarprecos" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'} Ervas e preços">
      <h2>Ervas e preços</h2><span class="count">${E.ervas.length} erva${E.ervas.length === 1 ? '' : 's'}${sem ? ` · ${sem} sem preço` : ''} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + `</div>`;
  h += `
    <form id="f-erva" class="row" autocomplete="off">
      <label class="field grow">Erva<input type="text" id="ev-nome" maxlength="60" required placeholder="Ex.: Arruda"></label>
      <label class="field" style="flex:0 1 170px">Preço total (R$, opcional)<input type="text" inputmode="decimal" id="ev-preco" placeholder="a definir"></label>
      <button class="btn primary" type="submit">Adicionar</button>
    </form>`;
  if (E.ervas.length) {
    h += `<div class="ppl">`;
    E.ervas.forEach((e) => {
      const conf = estado.confirm === 'e:' + e.id;
      h += `<div class="pp ev">
        <input type="text" id="ev-n-${e.id}" value="${esc(e.nome)}" maxlength="60" aria-label="Nome">
        <input type="text" inputmode="decimal" id="ev-p-${e.id}" value="${precoCampo(e.preco)}" placeholder="a definir" aria-label="Preço de ${esc(e.nome)}" style="width:100px" class="${temPreco(e) ? '' : 'falta'}">
        <span class="acts" style="display:flex;gap:6px"><button class="btn small" data-act="salvarerva" data-id="${e.id}">Salvar</button>
        ${conf ? `<button class="btn small danger" data-act="delerva" data-id="${e.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="e:${e.id}">Excluir</button>`}</span></div>`;
    });
    const sem = E.ervas.filter((e) => !temPreco(e)).length;
    h += `</div><p class="muted" style="margin:0;font-size:.85rem">O preço é o valor total pago pela erva; ele é dividido entre quem a escolheu. Pode ficar em branco e ser preenchido no fim, para fechar os valores de cada um.${sem ? ` ${sem} erva${sem > 1 ? 's' : ''} sem preço.` : ''} Excluir uma erva tira ela dos pedidos de quem a escolheu.</p>`;
  }
  return h + `</div>`;
}

function cardPedidos(E) {
  const r = E.pedidos || calcularPedidos(E.ervas, [], E.frete);
  let h = `<div class="card"><div class="grp-h"><h2>Pedidos</h2><span class="count">${r.pessoas.length} pessoa${r.pessoas.length === 1 ? '' : 's'}</span></div>${linhaGira(E)}`;
  if (!r.pessoas.length) return h + `<p class="muted" style="margin:0">Ninguém escolheu ervas ainda.</p></div>`;
  if (r.faltamPrecos.length) h += `<div class="warnbox">Preço a definir: <b>${r.faltamPrecos.map(esc).join(', ')}</b>. Preencha em “Ervas e preços” para fechar o valor de cada um.</div>`;
  h += `<div class="matrix"><table class="pedidos"><thead><tr><th class="rh">Nome</th><th class="rh">Ervas</th><th>Ervas R$</th><th>Frete</th><th>Total</th><th></th></tr></thead><tbody>
    ${r.pessoas.map((p) => `<tr><th class="rh">${esc(p.nome)} <button class="btn link small" data-act="editarpedido" data-chave="${esc(p.chave)}" aria-label="Editar pedido de ${esc(p.nome)}">✎</button></th><td class="rh">${p.itens.map((i) => esc(i.nome) + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', ')}</td><td>${reais(p.subtotal)}${p.semPreco ? ' +?' : ''}</td><td>${reais(p.frete)}</td><td><b>${reais(p.total)}${p.semPreco ? ' +?' : ''}</b></td><td>${estado.confirm === 'ped:' + p.chave
      ? `<button class="btn small danger" data-act="delpedido" data-chave="${esc(p.chave)}">Confirmar</button>`
      : `<button class="btn small" data-act="askdel" data-k="ped:${esc(p.chave)}" aria-label="Excluir pedido de ${esc(p.nome)}">Excluir</button>`}</td></tr>`).join('')}
    </tbody><tfoot><tr><th class="rh">Total</th><td></td><td>${reais(r.totalItens)}</td><td>${reais(r.totalFrete)}</td><td><b>${reais(r.totalGeral)}</b></td><td></td></tr></tfoot></table></div>`;
  const tot = totaisPorErva(r);
  const vista = estado.ervasVista;
  const faltam = r.faltamPrecos.length;
  h += `<div class="grp"><h3>Para comprar</h3><p style="margin:0">${tot.map((t) => `${esc(t.nome)} x${t.quantidade}`).join(' · ')}</p></div>
    <div class="row">
      <button class="btn ${vista === 'fornecedor' ? 'primary' : ''}" data-act="vista" data-v="fornecedor" aria-pressed="${vista === 'fornecedor'}">Pedido ao fornecedor</button>
      <button class="btn ${vista === 'cobranca' ? 'primary' : ''}" data-act="vista" data-v="cobranca" aria-pressed="${vista === 'cobranca'}" ${faltam ? 'disabled' : ''}>Cobrança</button>
    </div>
    ${faltam ? `<p class="muted" style="margin:0;font-size:.85rem">A cobrança libera quando todas as ervas pedidas tiverem preço. Faltam: ${r.faltamPrecos.map(esc).join(', ')}.</p>` : ''}`;
  if (vista === 'fornecedor' || (vista === 'cobranca' && !faltam)) {
    const ev = { gira: E.gira, data: E.data };
    const txt = vista === 'fornecedor' ? textoFornecedor(r, new Date(), ev) : textoCobranca(r, new Date(), ev);
    const titulo = vista === 'fornecedor' ? 'Pedido ao fornecedor' : 'Cobrança';
    const dica = vista === 'fornecedor'
      ? 'As ervas que serão pedidas. Envie ao fornecedor.'
      : 'Quanto cada pessoa paga: ervas + parte do frete.';
    h += `<div class="grp exp"><h3>${titulo}</h3><p class="muted" style="margin:0;font-size:.85rem">${dica}</p>
      <textarea id="ev-txt" readonly aria-label="${titulo}">${esc(txt)}</textarea>
      <div class="row">
        <button class="btn primary" data-act="copiarervas">Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
        <button class="btn" data-act="csvervas">Baixar planilha</button>
      </div></div>`;
  }
  h += `<div class="grp" style="border-top:1px solid var(--line);padding-top:12px">
      <p class="muted" style="margin:0;font-size:.85rem">Depois de cobrar, comece uma nova compra: os pedidos são apagados e a lista reabre. As ervas, os preços e o frete ficam.</p>
      ${estado.confirm === 'nova-compra'
        ? '<button class="btn danger" data-act="novacompra">Confirmar: apagar pedidos e começar nova compra</button>'
        : '<button class="btn" data-act="askdel" data-k="nova-compra">Nova compra</button>'}
    </div>`;
  return h + `</div>`;
}

// Cabeçalho com a gira e a data do pedido (todos veem; só o admin altera, no quadro Compra).
function cabecalho(E) {
  const ev = linhaEvento({ gira: E.gira, data: E.data });
  if (!ev) return '';
  const [y, m, d] = (E.data || '').split('-');
  return `<div class="card"><div class="datehead"><span class="eyebrow">Pedido de ervas</span>
    ${E.data ? `<span class="dia">${d}/${m}/${y}</span>` : ''}${E.gira ? `<span class="ent">${esc(E.gira)}</span>` : ''}</div></div>`;
}

export function render() {
  if (estado.ervas === null) { carregarErvas(); return `<div class="loading">Carregando ervas…</div>`; }
  const E = estado.ervas;
  let h = `<section class="panel">${cabecalho(E)}${cardEscolha(E)}`;
  if (pode('ervas:gerenciar')) h += (E.ervas.length ? cardPedidoDe(E) : '') + cardCompra(E) + cardCatalogo(E) + cardPedidos(E);
  else h += cardStatus(E);
  return h + `</section>`;
}

const val = (id) => document.getElementById(id)?.value ?? '';

export const cliques = {
  dobrarprecos() { precosAberto = !precosAberto; avisar(); },
  mais(el) { escolherErva(el.dataset.id, Math.min(99, qtdDe(el.dataset.id) + 1)); },
  menos(el) { escolherErva(el.dataset.id, Math.max(0, qtdDe(el.dataset.id) - 1)); },
  async evento() { if (await acaoErvas('config', { gira: val('ev-gira'), data: val('ev-data') })) toast('Gira do pedido salva.'); },
  async frete() { if (await acaoErvas('config', { frete: val('ev-frete') })) toast('Frete salvo.'); },
  async abrir(el) { if (await acaoErvas('config', { aberta: el.dataset.v === '1' })) toast(el.dataset.v === '1' ? 'Lista reaberta.' : 'Lista fechada.'); },
  async salvarerva(el) {
    const id = el.dataset.id;
    if (await acaoErvas('salvarErva', { id, nome: val('ev-n-' + id), preco: val('ev-p-' + id) })) toast('Erva salva.');
  },
  async delerva(el) { estado.confirm = null; if (await acaoErvas('excluirErva', { id: el.dataset.id })) toast('Erva excluída.'); },
  async novacompra() { estado.confirm = null; if (await acaoErvas('novaCompra')) toast('Nova compra iniciada.'); },
  // ---- pedido de outra pessoa (admin)
  editarpedido(el) {
    const p = (estado.ervas.pedidos?.pessoas || []).find((x) => x.chave === el.dataset.chave);
    if (!p) return;
    abrirPara({ chave: p.chave, nome: p.nome, itens: Object.fromEntries(p.itens.map((i) => [i.ervaId, i.quantidade])) });
  },
  pamais(el) { const P = estado.ervasPara; P.itens[el.dataset.id] = Math.min(99, (P.itens[el.dataset.id] || 0) + 1); avisar(); },
  pamenos(el) { const P = estado.ervasPara; const q = (P.itens[el.dataset.id] || 0) - 1; if (q > 0) P.itens[el.dataset.id] = q; else delete P.itens[el.dataset.id]; avisar(); },
  async delpedido(el) {
    estado.confirm = null;
    const p = (estado.ervas.pedidos?.pessoas || []).find((x) => x.chave === el.dataset.chave);
    if (!p) return;
    if (await salvarPedidoDe({ chave: p.chave }, [])) toast(`Pedido de ${p.nome} excluído.`);
    if (estado.ervasPara?.chave === p.chave) { estado.ervasPara = null; avisar(); }
  },
  pacancelar() { estado.ervasPara = null; avisar(); },
  async pasalvar() {
    const P = estado.ervasPara;
    const itens = Object.entries(P.itens).filter(([, q]) => q > 0).map(([ervaId, quantidade]) => ({ ervaId, quantidade }));
    if (!itens.length && !P.chave) { toast('Escolha pelo menos uma erva.'); return; }
    if (await salvarPedidoDe({ chave: P.chave, nome: P.nome }, itens)) {
      toast(itens.length ? `Pedido de ${P.nome} salvo.` : `Pedido de ${P.nome} apagado.`);
      estado.ervasPara = null;
      avisar();
    }
  },
  copiarervas() {
    const txt = val('ev-txt');
    const fb = () => { const t = document.getElementById('ev-txt'); t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado.'), fb); } catch { fb(); }
  },
  vista(el) {
    estado.ervasVista = estado.ervasVista === el.dataset.v ? null : el.dataset.v;
    avisar();
    document.getElementById('ev-txt')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  csvervas() {
    const r = estado.ervas.pedidos;
    if (!r) return;
    const fornecedor = estado.ervasVista === 'fornecedor';
    const csv = fornecedor ? csvFornecedor(r) : csvCobranca(r);
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), (fornecedor ? 'pedido-ervas-' : 'cobranca-ervas-') + hoje() + '.csv');
  },
};

function abrirPara(P) {
  estado.ervasPara = P;
  avisar();
  document.getElementById('card-para')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// "Montar pedido": se o nome já tem pedido, abre o pedido dele para editar.
export function enviarPara() {
  const nome = val('pa-nome').replace(/\s+/g, ' ').trim();
  if (nome.length < 2) { toast('Digite o nome da pessoa.'); return; }
  const alvo = normalizarNome(nome);
  const p = (estado.ervas.pedidos?.pessoas || []).find((x) => normalizarNome(x.nome) === alvo);
  abrirPara(p
    ? { chave: p.chave, nome: p.nome, itens: Object.fromEntries(p.itens.map((i) => [i.ervaId, i.quantidade])) }
    : { nome, itens: {} });
}

export async function enviarFormulario() {
  const ok = await acaoErvas('salvarErva', { nome: val('ev-nome'), preco: val('ev-preco') });
  if (ok) {
    toast('Erva adicionada.');
    document.getElementById('ev-nome')?.focus();
  } else {
    avisar();
  }
}
