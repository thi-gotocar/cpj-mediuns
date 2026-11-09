// Tela "Ervas": escolher as ervas da compra coletiva; o admin cadastra, define o frete e exporta.

import { centavos, reais, calcularPedidos, totaisPorErva, temPreco, textoFornecedor, csvFornecedor, textoCobranca, csvCobranca, normalizarNome, linhaEvento, itensCompra, porcoesErva, pedidosPorErva } from '/shared/ervas.js';
import { estado, pode, pessoasOrd, carregarErvas, carregarHistoricoErvas, escolherErva, acaoErvas, salvarPedidoDe, publicarErvas, avisar } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';
import { gerarImagemLista, compartilharImagem } from '../imagemLista.js';

// Dados da imagem do pedido ao fornecedor ou da cobrança.
function dadosImagem(E, r, vista) {
  const sub = linhaEvento({ gira: E.gira, data: E.data }) || new Date().toLocaleDateString('pt-BR');
  if (vista === 'fornecedor') {
    const itens = itensCompra(E.ervas, r);
    return { rotulo: 'Pedido de ervas', titulo: 'Pedido ao fornecedor', subtitulo: sub,
      linhas: itens.map((t) => ({ texto: t.nome, valor: 'x' + t.quantidade })), rodape: `Total: ${itens.length} erva${itens.length === 1 ? '' : 's'}` };
  }
  return { rotulo: 'Ervas', titulo: 'Cobrança', subtitulo: sub + (r.totalFrete ? ` · frete ${reais(r.totalFrete)} ÷ ${r.pessoas.length}` : ''),
    linhas: r.pessoas.map((p) => ({ texto: p.nome, valor: reais(p.total),
      sub: `${p.itens.map((i) => i.nome + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', ')} (${reais(p.subtotal)})${p.frete ? ` + frete ${reais(p.frete)}` : ''}` })),
    rodape: `Total a receber: ${reais(r.totalGeral)}` };
}

// Compra: nova erva aberta (null = só quando não há nenhuma) e a erva com o ✎ aberto.
let novaAberta = null;
let ervaAberta = null;

// De quem é o pedido na tela: o da pessoa escolhida no combo (admin) ou o da própria pessoa.
const paraOutro = () => (pode('ervas:gerenciar') ? estado.ervasPara : null);
function alvo(E) {
  const P = paraOutro();
  if (!P) return { chave: E.eu.chave, nome: E.eu.nome, itens: E.minhas || [] };
  return { chave: P.chave || 'p:' + P.pessoaId, nome: P.nome, outro: true, itens: Object.entries(P.itens).map(([ervaId, quantidade]) => ({ ervaId, quantidade })) };
}
const qtdDe = (ervaId) => alvo(estado.ervas).itens.find((m) => m.ervaId === ervaId)?.quantidade || 0;
const serveTxt = (e) => (Number(e.pessoasPorcao) ? ` (serve ${e.pessoasPorcao})` : '');
const precoTxt = (v) => (v === null || v === undefined ? 'preço a definir' : reais(centavos(v)));
const precoCampo = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));
// Preço estimado (do cadastro): referência até o admin pôr o preço real no bloco Compra.
const temEstimado = (e) => e.precoEstimado !== null && e.precoEstimado !== undefined && e.precoEstimado !== '';

// Recalcula os pedidos com as minhas escolhas da tela (antes de salvar), para mostrar
// a minha parte de cada erva e do frete já com quem mais pediu.
function simular(E) {
  const a = alvo(E);
  const outros = (E.pedidos?.pessoas || []).filter((p) => p.chave !== a.chave)
    .flatMap((p) => p.itens.map((i) => ({ chave: p.chave, nome: p.nome, ervaId: i.ervaId, quantidade: i.quantidade })));
  const minhas = a.itens.map((m) => ({ chave: a.chave, nome: a.nome, ervaId: m.ervaId, quantidade: m.quantidade }));
  return calcularPedidos(E.ervas, [...outros, ...minhas], E.frete);
}

function meuPedido(E, r) {
  const p = r.pessoas.find((x) => x.chave === alvo(E).chave);
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

// Onde aparece o nome de quem está logado: para o admin, a lista da corrente, para pedir por outra pessoa.
function seletorPessoa(E) {
  if (!pode('ervas:gerenciar')) return `<span class="ervas-pedido-pessoa"><span aria-hidden="true">👤</span>${esc(E.eu.nome)}</span>`;
  const lista = E.pedidos?.pessoas || [];
  const comPedido = new Set(lista.map((p) => p.chave));
  const P = paraOutro();
  const sel = !P ? '' : P.pessoaId ? 'p:' + P.pessoaId : P.chave;
  const op = (v, t) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`;
  const fora = lista.filter((p) => !p.chave.startsWith('p:') && p.chave !== E.eu.chave);
  return `<label class="ervas-pedido-pessoa ervas-pessoa-sel"><span aria-hidden="true">👤</span><select id="er-pessoa" data-act="erpessoa" aria-label="De quem é o pedido">${op('', E.eu.nome)}
    ${pessoasOrd().filter((p) => 'p:' + p.id !== E.eu.chave).map((p) => op('p:' + p.id, p.nome + (comPedido.has('p:' + p.id) ? ' · já tem pedido' : ''))).join('')}
    ${fora.length ? `<optgroup label="Fora da corrente">${fora.map((p) => op(p.chave, p.nome)).join('')}</optgroup>` : ''}</select></label>`;
}

function cardEscolha(E) {
  const aberta = E.aberta;
  const a = alvo(E);
  let h = `<div class="card ervas-pedido"><div class="grp-h ervas-pedido-cab"><div><span class="ervas-pedido-etq">🌿 Compra coletiva</span><h2>Escolher ervas</h2></div>${seletorPessoa(E)}</div>`;
  if (!aberta) h += `<div class="warnbox">A lista está fechada. Seu pedido não pode mais ser alterado.</div>`;
  if (!E.ervas.length) return h + `<p class="muted" style="margin:0">Nenhuma erva cadastrada ainda.${pode('ervas:gerenciar') ? ' Adicione na Compra.' : ''}</p></div>`;
  const r = simular(E);
  const m = meuPedido(E, r);
  const nPor = pessoasPorErva(r);
  h += `<p class="ervas-pedido-dica">${aberta ? `Toque em − ou + para ajustar as porções ${a.outro ? 'do pedido de ' + esc(a.nome) : 'do seu pedido'}.` : a.outro ? 'A lista está fechada.' : 'Seu pedido foi salvo e a lista está fechada.'}</p>`;
  h += `<div class="ervas">`;
  E.ervas.forEach((e) => {
    const q = qtdDe(e.id);
    const n = nPor[e.id] || 0;
    const minha = m.porErva[e.id];
    const info = !temPreco(e) ? (temEstimado(e) ? `≈ ${reais(centavos(e.precoEstimado))} a porção (estimado)${serveTxt(e)}` : 'preço a definir')
      : `${reais(centavos(e.preco))} a porção${serveTxt(e)}${n ? ` · ${n} pessoa${n > 1 ? 's' : ''}` : ''}${minha ? ` · sua parte ≈ ${reais(minha.valor)}` : ''}`;
    h += `<div class="erva erva-pedido-item ${q ? 'sel' : ''}">
      <span class="nmcell"><span class="nm">${esc(e.nome)}</span><span class="muted" style="font-size:.85rem">${info}</span></span>
      <span class="qtd">
        <button class="btn small" data-act="menos" data-id="${e.id}" ${!aberta || !q ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n" aria-live="polite">${q}</span>
        <button class="btn small ${q ? '' : 'primary'}" data-act="mais" data-id="${e.id}" ${!aberta || q >= 99 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span></div>`;
  });
  h += `</div>`;
  h += `<div class="resumo ervas-pedido-resumo">
    <div><span>Ervas</span><b>${reais(m.subtotal)}${m.pendente ? ' + a definir' : ''}</b></div>
    <div><span>Frete${m.pessoas ? ` (÷ ${m.pessoas})` : ''}</span><b>${m.itens.length ? '≈ ' + reais(m.frete) : '—'}</b></div>
    <div class="tot"><span>Total estimado</span><b>${m.itens.length ? '≈ ' + reais(m.total) + (m.pendente ? ' + a definir' : '') : reais(0)}</b></div>
  </div>
  ${m.pendente ? '<p class="muted" style="margin:0;font-size:.85rem">Algumas ervas ainda estão sem preço. O valor final sai quando o admin fechar os preços.</p>' : ''}
  <details class="ervas-pedido-explica"><summary>Como o valor é calculado?</summary><p>O custo de cada erva (preço da porção × porções compradas) é dividido entre quem escolheu aquela erva, na proporção da quantidade. O frete de ${precoTxt(E.frete)} é dividido entre todos que pedirem. Os valores podem mudar conforme mais pessoas fazem o pedido.</p></details></div>`;
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

// Bloco Compra: o que vai ser pedido ao fornecedor. Fica travado; "Editar" libera os campos
// (rascunho em estado.ervasCompra) e "Salvar" grava tudo de uma vez.
const freteCampo = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
// Valor digitado ("25,00", "R$ 25") em centavos; vazio ou inválido = null.
function campoCentavos(s) {
  const t = String(s ?? '').replace(/\s|R\$/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? centavos(n) : null;
}
function compraSalva(E) {
  return { gira: E.gira || '', data: E.data || '', frete: freteCampo(E.frete),
    itens: Object.fromEntries(E.ervas.map((e) => [e.id, { qtd: Number(e.qtdCompra) || 0, preco: precoCampo(e.preco) }])) };
}
// Rascunho da edição (null = travado). Erva cadastrada no meio da edição entra com o valor salvo.
function rascunho(E) {
  if (!E.aberta) estado.ervasCompra = null;   // lista fechada: a Compra fica travada
  const C = estado.ervasCompra;
  if (C) E.ervas.forEach((e) => { if (!C.itens[e.id]) C.itens[e.id] = compraSalva(E).itens[e.id]; });
  return C;
}
function compraAlterada(E) {
  const C = rascunho(E);
  if (!C) return false;
  const S = compraSalva(E);
  return ['gira', 'data', 'frete'].some((k) => C[k].trim() !== S[k])
    || E.ervas.some((e) => C.itens[e.id].qtd !== S.itens[e.id].qtd || C.itens[e.id].preco.trim() !== S.itens[e.id].preco);
}

// Porções da erva na Compra: a quantidade escolhida, nunca abaixo do mínimo que os pedidos exigem.
function porcoes(e, qtdEscolhida, nPed) {
  const n = nPed[e.id] || 0;
  return { n, minimo: porcoesErva({ ...e, qtdCompra: 0 }, n), qtd: porcoesErva({ ...e, qtdCompra: qtdEscolhida }, n) };
}

// Tabela do pedido (Erva / Qtd. corrente / Qtd. pedido / Valor unitário / Valor) com o frete e o total. Usa o rascunho durante a edição.
function tabelaCompra(E, r) {
  const v = rascunho(E) || compraSalva(E);
  const nPed = pedidosPorErva(r);
  const linhas = E.ervas.map((e) => {
    const { qtd, n } = porcoes(e, v.itens[e.id].qtd, nPed);
    const preco = campoCentavos(v.itens[e.id].preco);
    return { nome: e.nome, n, qtd, preco, valor: preco === null ? null : preco * qtd };
  }).filter((l) => l.qtd > 0);
  if (!linhas.length) return `<p class="muted" style="margin:0">Nenhuma erva no pedido ainda.</p>`;
  const frete = campoCentavos(v.frete) || 0;
  const soma = linhas.reduce((a, l) => a + (l.valor || 0), 0) + frete;
  const falta = linhas.some((l) => l.valor === null);
  return `<div class="matrix"><table class="pedidos compra-tab"><thead><tr><th class="rh">Erva</th><th>Qtd. corrente</th><th>Qtd. pedido</th><th>Valor unit.</th><th>Valor</th></tr></thead><tbody>
    ${linhas.map((l) => `<tr><th class="rh">${esc(l.nome)}</th><td>${l.n}</td><td>${l.qtd}</td><td>${l.preco === null ? '<span class="muted">a definir</span>' : reais(l.preco)}</td><td>${l.valor === null ? '<span class="muted">a definir</span>' : reais(l.valor)}</td></tr>`).join('')}
    ${frete ? `<tr><th class="rh">Frete</th><td></td><td></td><td></td><td>${reais(frete)}</td></tr>` : ''}
    </tbody><tfoot><tr><th class="rh">Total</th><td>${linhas.reduce((a, l) => a + l.n, 0)}</td><td>${linhas.reduce((a, l) => a + l.qtd, 0)}</td><td></td><td><b>${reais(soma)}${falta ? ' + a definir' : ''}</b></td></tr></tfoot></table></div>`;
}

// Linha de uma erva na Compra: nome, preço da porção e porções, sem perder o que a corrente pediu e o mínimo.
function linhaCompra(E, e, it, C, nPed) {
  const { qtd, minimo, n } = porcoes(e, it.qtd, nPed);
  const serve = Number(e.pessoasPorcao);
  const info = [n ? `${n} ${n === 1 ? 'pediu' : 'pediram'}` : 'ninguém pediu', serve ? `serve ${serve} · mín. ${minimo}` : ''].filter(Boolean).join(' · ');
  const preco = C
    ? `<input type="text" inputmode="decimal" id="cp-p-${e.id}" data-compra="preco" data-id="${e.id}" value="${esc(it.preco)}" placeholder="${temEstimado(e) ? '≈ ' + precoCampo(e.precoEstimado) : 'a definir'}" aria-label="Preço da porção de ${esc(e.nome)}" class="${it.preco.trim() ? '' : 'falta'}">`
    : temPreco(e) ? reais(centavos(e.preco)) : `<span class="muted">${temEstimado(e) ? '≈ ' + reais(centavos(e.precoEstimado)) : 'a definir'}</span>`;
  const aberta = E.aberta && ervaAberta === e.id;
  return `<div class="cp-l ${qtd ? 'sel' : ''}">
      <span class="cp-nome"><b>${esc(e.nome)}</b><small class="muted">${info}</small></span>
      <span class="cp-preco">${preco}</span>
      <span class="qtd cp-qtd">
        <button class="btn small" data-act="cpmenos" data-id="${e.id}" ${!C || qtd <= minimo ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n">${qtd}</span>
        <button class="btn small ${C && !qtd ? 'primary' : ''}" data-act="cpmais" data-id="${e.id}" ${!C || qtd >= 999 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span>
      ${E.aberta ? `<button class="btn small cp-ed" data-act="cperva" data-id="${e.id}" aria-expanded="${aberta}" aria-label="Editar o cadastro de ${esc(e.nome)}">✎</button>` : '<span></span>'}
    </div>${aberta ? painelErva(e) : ''}`;
}

// Campos do cadastro de uma erva: quantas pessoas uma porção serve e o preço estimado (só referência).
const camposErva = (idServe, idEstimado, e = {}) => `<div class="ec-campos">
    <label class="field">Porção serve<span class="ec-un"><input type="number" inputmode="numeric" id="${idServe}" min="1" max="999" value="${Number(e.pessoasPorcao) || ''}" placeholder="todos"> pessoas</span></label>
    <label class="field">Preço estimado<span class="ec-un">R$ <input type="text" inputmode="decimal" id="${idEstimado}" maxlength="10" value="${precoCampo(e.precoEstimado)}" placeholder="0,00"></span></label>
  </div>`;

function painelErva(e) {
  const conf = estado.confirm === 'e:' + e.id;
  return `<div class="ec-linha">
    <label class="field">Nome<input type="text" id="ev-n-${e.id}" value="${esc(e.nome)}" maxlength="60"></label>
    ${camposErva('ev-s-' + e.id, 'ev-e-' + e.id, e)}
    <div class="cp-bts">
      ${conf ? `<button class="btn danger" data-act="delerva" data-id="${e.id}"><span aria-hidden="true">🗑️</span> Confirmar</button>` : `<button class="btn" data-act="askdel" data-k="e:${e.id}"><span aria-hidden="true">🗑️</span> Excluir</button>`}
      <button class="btn primary" data-act="salvarerva" data-id="${e.id}"><span aria-hidden="true">✓</span> Salvar</button>
    </div></div>`;
}

function formNovaErva() {
  return `<form id="f-erva" class="ec-nova" autocomplete="off">
    <label class="field">Nome<input type="text" id="ev-nome" maxlength="60" required placeholder="Ex.: Arruda"></label>
    ${camposErva('ev-serve', 'ev-estimado')}
    <div class="cp-bts">
      <button class="btn" type="button" data-act="cpnovaerva"><span aria-hidden="true">✕</span> Cancelar</button>
      <button class="btn primary" type="submit"><span aria-hidden="true">＋</span> Adicionar</button>
    </div></form>`;
}

function cardCompra(E, r) {
  const C = rascunho(E);
  const v = C || compraSalva(E);
  const trava = C ? '' : 'disabled';
  const nPed = pedidosPorErva(r);
  const nItens = E.ervas.filter((e) => porcoes(e, v.itens[e.id].qtd, nPed).qtd > 0).length;
  const nova = E.aberta && (novaAberta ?? !E.ervas.length);
  let h = `<div class="card adm" id="card-compra"><div class="grp-h"><h2>Compra</h2><span class="count">${nItens} erva${nItens === 1 ? '' : 's'} · lista ${E.aberta ? 'aberta' : 'fechada'}</span></div>
    <div class="row compra-ev">
      <label class="field">Nome da gira<input type="text" id="ev-gira" data-compra="gira" maxlength="80" value="${esc(v.gira)}" placeholder="Ex.: Gira de Caboclo" ${trava}></label>
      <label class="field">Data do evento<input type="date" id="ev-data" data-compra="data" value="${esc(v.data)}" ${trava}></label>
    </div>
    ${nova ? formNovaErva() : E.aberta ? '<div class="cp-bts"><button class="btn" data-act="cpnovaerva"><span aria-hidden="true">＋</span> Adicionar erva</button></div>' : ''}
    <div class="cp-lista">
      ${E.ervas.length ? '<div class="cp-l cp-cab" aria-hidden="true"><span>Erva</span><span class="cp-preco">R$/porção</span><span class="cp-qtd-t">Porções</span><span></span></div>' : ''}
      ${E.ervas.map((e) => linhaCompra(E, e, v.itens[e.id], C, nPed)).join('')}
      <div class="cp-l cp-frete"><span class="cp-nome"><b>Frete</b></span><span class="cp-preco">${C ? `<input type="text" inputmode="decimal" id="ev-frete" data-compra="frete" value="${esc(v.frete)}" aria-label="Valor do frete">` : reais(campoCentavos(v.frete) || 0)}</span><span></span><span></span></div>
    </div>
    <div class="grp"><h3>Pedido</h3><div id="cp-tabela">${tabelaCompra(E, r)}</div></div>
    <div class="cp-bts">${E.aberta ? `
      ${C ? '<button class="btn" data-act="cpcancelar"><span aria-hidden="true">✕</span> Cancelar</button>'
        : '<button class="btn" data-act="cpeditar"><span aria-hidden="true">✎</span> Editar</button>'}
      <button class="btn ${C ? 'primary' : ''}" data-act="cpsalvar" ${C ? '' : 'disabled'}><span aria-hidden="true">✓</span> Salvar</button>
      ${C && E.ervas.some((e) => !v.itens[e.id].preco.trim() && temEstimado(e)) ? '<button class="btn" data-act="cpestimados" title="Preenche as ervas sem preço com o preço estimado"><span aria-hidden="true">≈</span> Usar estimados</button>' : ''}
      <button class="btn" data-act="pedirfechar"><span aria-hidden="true">🔒</span> Fechar lista</button>`
      : '<button class="btn primary" data-act="abrir"><span aria-hidden="true">🔓</span> Reabrir lista</button>'}
    </div>`;
  return h + exportacao(E, r) + `<div class="cp-bts cp-nova"><button class="btn" data-act="novaini"><span aria-hidden="true">🆕</span> Nova compra</button></div></div>`;
}

// Pedido ao fornecedor (quantidades da Compra) e Cobrança (pedidos da corrente).
function exportacao(E, r) {
  const vista = estado.ervasVista;
  const faltam = r.faltamPrecos.length;
  const semCompra = !itensCompra(E.ervas, r).length;
  const semPedidos = !r.pessoas.length;
  const motivoCobranca = faltam ? `Falta o preço de: ${r.faltamPrecos.join(', ')}` : semPedidos ? 'Ninguém pediu ervas ainda' : '';
  let h = `<div class="cp-bts">
      <button class="btn ${vista === 'fornecedor' ? 'primary' : ''}" data-act="vista" data-v="fornecedor" aria-pressed="${vista === 'fornecedor'}" ${semCompra ? 'disabled title="Nenhuma erva pedida ou com quantidade na Compra"' : ''}><span aria-hidden="true">🛒</span> Pedido ao fornecedor</button>
      <button class="btn ${vista === 'cobranca' ? 'primary' : ''}" data-act="vista" data-v="cobranca" aria-pressed="${vista === 'cobranca'}" ${motivoCobranca ? `disabled title="${esc(motivoCobranca)}"` : ''}><span aria-hidden="true">💰</span> Cobrança</button>
    </div>`;
  if ((vista === 'fornecedor' && !semCompra) || (vista === 'cobranca' && !faltam && !semPedidos)) {
    const ev = { gira: E.gira, data: E.data };
    const txt = vista === 'fornecedor' ? textoFornecedor(E.ervas, r, new Date(), ev) : textoCobranca(r, new Date(), ev);
    const titulo = vista === 'fornecedor' ? 'Pedido ao fornecedor' : 'Cobrança';
    h += `<div class="grp exp"><h3>${titulo}</h3>
      <textarea id="ev-txt" readonly aria-label="${titulo}">${esc(txt)}</textarea>
      <div class="cp-bts">
        <button class="btn primary" data-act="copiarervas"><span aria-hidden="true">📋</span> Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>
        <button class="btn" data-act="csvervas"><span aria-hidden="true">📄</span> Planilha</button>
        <button class="btn" data-act="imgervas"><span aria-hidden="true">🖼️</span> ${estado.ervasImg && estado.ervasImg.chave === vista + txt ? 'Atualizar imagem' : 'Imagem'}</button>
      </div>
      ${estado.ervasImg && estado.ervasImg.chave === vista + txt ? `<img class="prev" src="${estado.ervasImg.url}" alt="Imagem: ${titulo}">
        <div class="cp-bts"><button class="btn primary" data-act="shareimgervas"><span aria-hidden="true">📤</span> Compartilhar</button><button class="btn" data-act="saveimgervas"><span aria-hidden="true">💾</span> Salvar imagem</button></div>` : ''}
      </div>`;
  }
  return h;
}

function cardPedidos(E, r) {
  let h = `<div class="card adm"><div class="grp-h"><h2>Pedidos da corrente</h2><span class="count">${r.pessoas.length} pessoa${r.pessoas.length === 1 ? '' : 's'}</span></div>${linhaGira(E)}`;
  if (!r.pessoas.length) return h + `<p class="muted" style="margin:0">Ninguém escolheu ervas ainda.</p></div>`;
  if (r.faltamPrecos.length) h += `<div class="warnbox">Preço a definir: <b>${r.faltamPrecos.map(esc).join(', ')}</b>. Preencha na Compra para fechar o valor de cada um.</div>`;
  h += `<div class="matrix"><table class="pedidos"><thead><tr><th class="rh">Nome</th><th class="rh">Ervas</th><th>Ervas R$</th><th>Frete</th><th>Total</th><th></th></tr></thead><tbody>
    ${r.pessoas.map((p) => `<tr><th class="rh">${esc(p.nome)}${p.chave.startsWith('p:') ? '' : ' <span class="badge lic" title="Este nome não está ligado a ninguém da corrente">fora da corrente</span>'}${E.aberta ? `
        <button class="btn link small" data-act="editarpedido" data-chave="${esc(p.chave)}" aria-label="Editar pedido de ${esc(p.nome)}">✎</button>` : ''}</th><td class="rh">${p.itens.map((i) => esc(i.nome) + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', ')}</td><td>${reais(p.subtotal)}${p.semPreco ? ' +?' : ''}</td><td>${reais(p.frete)}</td><td><b>${reais(p.total)}${p.semPreco ? ' +?' : ''}</b></td><td>${!E.aberta ? '' : estado.confirm === 'ped:' + p.chave
      ? `<button class="btn small danger" data-act="delpedido" data-chave="${esc(p.chave)}">Confirmar</button>`
      : `<button class="btn small" data-act="askdel" data-k="ped:${esc(p.chave)}" aria-label="Excluir pedido de ${esc(p.nome)}">Excluir</button>`}</td></tr>`).join('')}
    </tbody><tfoot><tr><th class="rh">Total</th><td></td><td>${reais(r.totalItens)}</td><td>${reais(r.totalFrete)}</td><td><b>${reais(r.totalGeral)}</b></td><td></td></tr></tfoot></table></div>`;
  const tot = totaisPorErva(r);
  h += `<div class="grp"><h3>Total por erva</h3><p style="margin:0">${tot.map((t) => `${esc(t.nome)} x${t.quantidade}`).join(' · ')}</p></div>`;
  return h + `</div>`;
}

// Cabeçalho com a gira e a data do pedido (todos veem; só o admin altera, no quadro Compra).
// Primeiro bloco: a gira do pedido e o resumo do meu pedido (uma erva por linha e o total).
function cabecalho(E) {
  const ev = linhaEvento({ gira: E.gira, data: E.data });
  const [y, m, d] = (E.data || '').split('-');
  const meu = E.ervas.length ? meuPedido(E, simular(E)) : { itens: [] };
  const a = alvo(E);
  const resumo = meu.itens.length
    ? `<div class="meu-ped"><span class="eyebrow">${a.outro ? 'Pedido de ' + esc(a.nome) : 'Seu pedido'}</span>
        <ul>${meu.itens.map((i) => `<li><span>${i.quantidade > 1 ? `${i.quantidade}× ` : ''}${esc(i.nome)}</span><b>${i.semPreco ? 'a definir' : '≈ ' + reais(i.valor)}</b></li>`).join('')}${meu.frete ? `<li class="muted"><span>Frete (${a.outro ? 'parte da pessoa' : 'sua parte'})</span><span>≈ ${reais(meu.frete)}</span></li>` : ''}</ul>
        <div class="meu-tot"><span>Valor total</span><b>≈ ${reais(meu.total)}${meu.pendente ? ' + a definir' : ''}</b></div></div>`
    : `<p class="muted" style="margin:0;font-size:.9rem">${a.outro ? esc(a.nome) + ' ainda não escolheu' : 'Você ainda não escolheu'} nenhuma erva.</p>`;
  return `<div class="card">${ev ? `<div class="datehead"><span class="eyebrow">Pedido de ervas</span>
    ${E.data ? `<span class="dia">${d}/${m}/${y}</span>` : ''}${E.gira ? `<span class="ent">${esc(E.gira)}</span>` : ''}</div>` : '<h2>Pedido de ervas</h2>'}
    ${resumo}</div>`;
}

export function render() {
  if (estado.ervas === null) { carregarErvas(); return `<div class="loading">Carregando ervas…</div>`; }
  const E = estado.ervas;
  const admin = pode('ervas:gerenciar');
  const pub = estado.me?.ervasPublicada !== false;
  const topo = admin ? `<div class="card adm ervas-pub"><label class="of-sw"><input type="checkbox" role="switch" data-act="ervaspub" ${pub ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label></div>` : '';
  let h = `<section class="panel">${topo}${cabecalho(E)}${cardEscolha(E)}`;
  if (admin) {
    const r = E.pedidos || calcularPedidos(E.ervas, [], E.frete);
    h += cardCompra(E, r) + cardPedidos(E, r) + cardHistorico();
  }
  else h += cardStatus(E);
  return h + janelaFechar() + janelaNova() + `</section>`;
}

// Nova compra: primeiro "Tem certeza?" (avisa do pedido em andamento); depois escolhe encerrar
// (guarda no Histórico de compras) ou descartar. Sem nada em andamento, confirma e já começa a nova.
function janelaNova() {
  const N = estado.ervasNova;
  if (!N) return '';
  const E = estado.ervas;
  const r = E.pedidos || calcularPedidos(E.ervas, [], E.frete);
  const np = r.pessoas.length;
  const ni = itensCompra(E.ervas, r).length;
  const caixa = (titulo, corpo, botoes) => `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="en-t"><div class="modal">
    <h3 id="en-t">${titulo}</h3>${corpo}<div class="row" style="justify-content:flex-end;gap:8px">${botoes}</div></div></div>`;
  if (N.passo === 'aviso') {
    if (!np && !ni) {
      return caixa('Nova compra', '<p style="margin:0">Não há pedido em andamento. Começar uma nova compra? A lista reabre.</p>',
        '<button class="btn" data-act="novacancel">Cancelar</button><button class="btn primary" data-act="novaok" data-m="descartar">Começar nova compra</button>');
    }
    return caixa('Tem certeza?', `<p style="margin:0"><b>Há um pedido em andamento</b>: ${np} pessoa${np === 1 ? '' : 's'} ${np === 1 ? 'pediu' : 'pediram'} ervas e ${ni} erva${ni === 1 ? '' : 's'} na Compra. Começar uma nova compra tira este pedido da tela.</p>`,
      '<button class="btn" data-act="novacancel">Cancelar</button><button class="btn primary" data-act="novaseguir">Sim, nova compra</button>');
  }
  return caixa('O que fazer com o pedido atual?', `<div class="nova-ops">
      <button class="btn primary" data-act="novaok" data-m="encerrar"><span aria-hidden="true">📦</span> Encerrar e guardar<span class="nova-sub">Fica no Histórico de compras, com a tabela e a cobrança</span></button>
      <button class="btn danger" data-act="novaok" data-m="descartar"><span aria-hidden="true">🗑️</span> Descartar<span class="nova-sub">Apaga sem guardar (sai também do Histórico, se já tinha sido guardada ao fechar a lista); não dá para desfazer</span></button>
    </div>`, '<button class="btn" data-act="novacancel">Cancelar</button>');
}

// Histórico de compras (admin): as compras encerradas, da mais nova. Começa minimizado e só busca ao abrir.
let histAberto = false;
function cardHistorico() {
  const H = estado.ervasHist;
  if (histAberto && H === null) carregarHistoricoErvas();
  const n = Array.isArray(H) ? H.length : null;
  let h = `<div class="card adm"><button class="grp-h dobra" data-act="dobrarhist" aria-expanded="${histAberto}" aria-label="${histAberto ? 'Minimizar' : 'Expandir'} Histórico de compras">
      <h2><span aria-hidden="true">🧾</span> Histórico de compras</h2><span class="count">${n === null ? '' : n} <span class="seta" aria-hidden="true">${histAberto ? '▾' : '▸'}</span></span></button>`;
  if (!histAberto) return h + '</div>';
  if (!Array.isArray(H)) return h + `<p class="muted" style="margin:0">${H?.erro ? esc(H.erro) : 'Carregando…'}</p></div>`;
  if (!H.length) return h + '<p class="muted" style="margin:0">Nenhuma compra encerrada ainda. Em Nova compra, escolha Encerrar e guardar.</p></div>';
  return h + H.map(compraGuardada).join('') + '</div>';
}

// Cada compra começa minimizada (nome, data, valor, quando foi encerrada e quantas pessoas); ▸ expande.
const histAbertas = new Set();
function compraGuardada(c) {
  const R = c.resumo || {};
  const [y, m, d] = (c.data || '').split('-');
  const quando = new Date(c.encerradaEm).toLocaleDateString('pt-BR');
  const val = (v) => (v === null || v === undefined ? '<span class="muted">a definir</span>' : reais(v));
  const compra = R.compra || [];
  const falta = compra.some((x) => x.valor === null);
  const np = (R.pessoas || []).length;
  const aberta = histAbertas.has(c.id);
  const topo = `<button class="hc-topo" data-act="dobrarcompra" data-id="${esc(c.id)}" aria-expanded="${aberta}">
      <span class="hc-tit">${esc(c.gira || 'Compra sem gira')}${c.atual ? ' <span class="badge rep">compra atual</span>' : ''}</span><span class="hc-tot">${reais(R.totalCompra || 0)}${falta ? ' +?' : ''} <span class="seta" aria-hidden="true">${aberta ? '▾' : '▸'}</span></span>
      <span class="muted hc-sub">${c.data ? `${d}/${m}/${y} · ` : ''}${c.atual ? 'fechada' : 'encerrada'} em ${quando} · ${np} pessoa${np === 1 ? '' : 's'}</span></button>`;
  if (!aberta) return `<div class="hist-compra">${topo}</div>`;
  return `<div class="hist-compra">${topo}
    <div class="matrix"><table class="pedidos compra-tab"><thead><tr><th class="rh">Erva</th><th>Qtd. corrente</th><th>Qtd. pedido</th><th>Valor unit.</th><th>Valor</th></tr></thead><tbody>
      ${compra.map((x) => `<tr><th class="rh">${esc(x.nome)}</th><td>${x.corrente}</td><td>${x.pedido}</td><td>${val(x.preco)}</td><td>${val(x.valor)}</td></tr>`).join('')}
      ${R.frete ? `<tr><th class="rh">Frete</th><td></td><td></td><td></td><td>${reais(R.frete)}</td></tr>` : ''}
    </tbody><tfoot><tr><th class="rh">Total</th><td>${compra.reduce((a, x) => a + x.corrente, 0)}</td><td>${compra.reduce((a, x) => a + x.pedido, 0)}</td><td></td><td><b>${reais(R.totalCompra || 0)}${falta ? ' + a definir' : ''}</b></td></tr></tfoot></table></div>
    ${(R.pessoas || []).length ? `<h3 class="hc-h">Cobrança · ${reais(R.totalCobranca || 0)}</h3><div class="hc-pessoas">${R.pessoas.map((p) => `<div class="hc-p"><span><b>${esc(p.nome)}</b> <span class="muted">${p.itens.map((i) => esc(i.nome) + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', ')}</span></span><b>${reais(p.total)}${p.semPreco ? ' +?' : ''}</b></div>`).join('')}</div>` : ''}
  </div>`;
}

// Confirmação antes de fechar a lista.
function janelaFechar() {
  if (!estado.ervasFechar) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ef-t"><div class="modal">
    <h3 id="ef-t">Fechar a lista?</h3>
    <p style="margin:0">Com a lista fechada, ninguém altera mais os pedidos (nem o admin) e a Compra fica travada até você reabrir.</p>
    <p style="margin:0">A compra fica guardada no <b>Histórico de compras</b> como compra atual. Se reabrir e fechar de novo, ela é atualizada lá.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="fecharcancel">Cancelar</button><button class="btn danger" data-act="fecharok">Fechar lista</button></div>
  </div></div>`;
}

const val = (id) => document.getElementById(id)?.value ?? '';

export const cliques = {
  mais(el) { ajustarPedido(el.dataset.id, 1); },
  menos(el) { ajustarPedido(el.dataset.id, -1); },
  cpnovaerva() { novaAberta = !(novaAberta ?? !estado.ervas.ervas.length); avisar(); if (novaAberta) document.getElementById('ev-nome')?.focus(); },
  cperva(el) { ervaAberta = ervaAberta === el.dataset.id ? null : el.dataset.id; avisar(); },
  // Bloco Compra: Editar libera os campos; Salvar grava tudo (se algo mudou) e trava de novo.
  // Ervas ainda sem preço na Compra recebem o preço estimado do cadastro (dá para mudar antes de salvar).
  cpestimados() {
    const C = estado.ervasCompra;
    if (!C) return;
    estado.ervas.ervas.forEach((e) => { if (!C.itens[e.id].preco.trim() && temEstimado(e)) C.itens[e.id].preco = precoCampo(e.precoEstimado); });
    avisar();
  },
  cpeditar() {
    if (estado.ervasCompra) return;
    estado.ervasCompra = compraSalva(estado.ervas);
    avisar();
    document.getElementById('ev-gira')?.focus();
  },
  // Cancelar: descarta o que foi mexido e volta a travar (o botão volta a ser Editar).
  cpcancelar() { estado.ervasCompra = null; avisar(); },
  async cpsalvar() {
    const E = estado.ervas;
    if (!estado.ervasCompra) return;
    if (!compraAlterada(E)) { estado.ervasCompra = null; toast('Nada mudou.'); avisar(); return; }
    const C = estado.ervasCompra;
    const itens = E.ervas.map((e) => ({ id: e.id, quantidade: C.itens[e.id].qtd, preco: C.itens[e.id].preco.trim() }));
    if (await acaoErvas('salvarCompra', { gira: C.gira, data: C.data, frete: C.frete, itens })) {
      estado.ervasCompra = null;
      toast('Compra salva.');
      avisar();
    }
  },
  cpmais(el) { mudarPorcoes(el.dataset.id, 1); },
  cpmenos(el) { mudarPorcoes(el.dataset.id, -1); },
  async abrir() { if (await acaoErvas('config', { aberta: true })) toast('Lista reaberta.'); },
  pedirfechar() { estado.ervasFechar = true; avisar(); },
  fecharcancel() { estado.ervasFechar = false; avisar(); },
  async fecharok() {
    estado.ervasFechar = false;
    gravarPara();
    await filaPara;
    // Fechar descarta a edição da Compra e volta para o pedido de quem está logado.
    if (await acaoErvas('config', { aberta: false })) { estado.ervasCompra = null; estado.ervasPara = null; estado.ervasHist = null; toast('Lista fechada e guardada no Histórico de compras.'); avisar(); }
    else avisar();
  },
  async salvarerva(el) {
    const id = el.dataset.id;
    if (await acaoErvas('salvarErva', { id, nome: val('ev-n-' + id), pessoasPorcao: val('ev-s-' + id), precoEstimado: val('ev-e-' + id) })) { ervaAberta = null; toast('Erva salva.'); avisar(); }
  },
  async delerva(el) { estado.confirm = null; if (await acaoErvas('excluirErva', { id: el.dataset.id })) toast('Erva excluída.'); },
  novaini() { estado.ervasNova = { passo: 'aviso' }; avisar(); },
  novaseguir() { estado.ervasNova = { passo: 'escolher' }; avisar(); },
  novacancel() { estado.ervasNova = null; avisar(); },
  async novaok(el) {
    const encerrar = el.dataset.m === 'encerrar';
    estado.ervasNova = null;
    if (await acaoErvas(encerrar ? 'encerrarCompra' : 'novaCompra')) {
      estado.ervasCompra = null;
      estado.ervasHist = null;   // busca de novo (encerrar grava a versão final; descartar tira a compra atual)
      toast(encerrar ? 'Compra guardada no Histórico de compras. Nova compra iniciada.' : 'Compra descartada. Nova compra iniciada.');
    }
    avisar();
  },
  dobrarhist() { histAberto = !histAberto; avisar(); },
  dobrarcompra(el) { const id = el.dataset.id; if (histAbertas.has(id)) histAbertas.delete(id); else histAbertas.add(id); avisar(); },
  // Tabela de pedidos: ✎ abre o pedido da pessoa no bloco de escolher.
  editarpedido(el) {
    abrirPedido(el.dataset.chave);
    document.querySelector('.ervas-pedido')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  async delpedido(el) {
    estado.confirm = null;
    const p = (estado.ervas.pedidos?.pessoas || []).find((x) => x.chave === el.dataset.chave);
    if (!p) return;
    if (await salvarPedidoDe({ chave: p.chave }, [])) toast(`Pedido de ${p.nome} excluído.`);
    if (estado.ervasPara?.chave === p.chave) { estado.ervasPara = null; avisar(); }
  },
  async imgervas() {
    const E = estado.ervas;
    const r = E.pedidos;
    const vista = estado.ervasVista;
    try {
      const blob = await gerarImagemLista(dadosImagem(E, r, vista));
      if (estado.ervasImg) URL.revokeObjectURL(estado.ervasImg.url);
      estado.ervasImg = { chave: vista + val('ev-txt'), blob, url: URL.createObjectURL(blob), nome: (vista === 'fornecedor' ? 'pedido-ervas-' : 'cobranca-ervas-') + hoje() + '.png' };
      avisar();
    } catch (e) { toast(e.message); }
  },
  async shareimgervas() {
    const i = estado.ervasImg;
    if (i && !(await compartilharImagem(i.blob, i.nome, 'Ervas'))) toast('Este aparelho não compartilha imagens daqui. Use Salvar imagem.');
  },
  saveimgervas() { const i = estado.ervasImg; if (i) baixar(i.url, i.nome); },
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
    const csv = fornecedor ? csvFornecedor(estado.ervas.ervas, r) : csvCobranca(r);
    baixar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), (fornecedor ? 'pedido-ervas-' : 'cobranca-ervas-') + hoje() + '.csv');
  },
};

// Admin pedindo por outra pessoa: muda na tela na hora e grava logo depois, como no próprio pedido.
let timerPara = null;
let filaPara = Promise.resolve();
function gravarPara() {
  clearTimeout(timerPara);
  const P = estado.ervasPara;
  if (!P?.sujo) return;
  P.sujo = false;
  const para = { chave: P.chave, pessoaId: P.pessoaId, nome: P.nome };
  const itens = Object.entries(P.itens).map(([ervaId, quantidade]) => ({ ervaId, quantidade }));
  filaPara = filaPara.then(() => salvarPedidoDe(para, itens));
}
function ajustarPedido(id, delta) {
  const nova = Math.min(99, Math.max(0, qtdDe(id) + delta));
  const P = paraOutro();
  if (!P) { escolherErva(id, nova); return; }
  if (nova) P.itens[id] = nova; else delete P.itens[id];
  P.sujo = true;
  avisar();
  clearTimeout(timerPara);
  timerPara = setTimeout(gravarPara, 500);
}
// v: 'p:<id da pessoa>', a chave de um pedido fora da corrente ou '' (quem está logado).
function abrirPedido(v) {
  gravarPara();
  if (!v || v === estado.ervas.eu.chave) { estado.ervasPara = null; avisar(); return; }
  const lista = estado.ervas.pedidos?.pessoas || [];
  const pessoaId = v.startsWith('p:') ? v.slice(2) : undefined;
  const pessoa = pessoaId && estado.pessoas.find((x) => x.id === pessoaId);
  const p = lista.find((x) => x.chave === v) || (pessoa && lista.find((x) => normalizarNome(x.nome) === normalizarNome(pessoa.nome)));
  if (!p && !pessoa) return;
  estado.ervasPara = p
    ? { chave: p.chave, pessoaId, nome: p.nome, itens: Object.fromEntries(p.itens.map((i) => [i.ervaId, i.quantidade])) }
    : { pessoaId, nome: pessoa.nome, itens: {} };
  avisar();
}

export const mudancas = {
  erpessoa(t) { abrirPedido(t.value); },
  async ervaspub(t) {
    const pub = t.checked;
    if (!(await publicarErvas(pub))) { t.checked = !pub; return; }
    toast(pub ? 'Aba Ervas visível para todos.' : 'Aba Ervas visível só para os admins.');
  },
};

// +/− nas porções da Compra (a partir do que aparece na tela, já com o mínimo dos pedidos).
function mudarPorcoes(id, delta) {
  const E = estado.ervas;
  const it = rascunho(E)?.itens[id];
  const erva = E.ervas.find((e) => e.id === id);
  if (!it || !erva) return;
  const { qtd, minimo } = porcoes(erva, it.qtd, pedidosPorErva(E.pedidos));
  const nova = Math.min(999, Math.max(minimo, qtd + delta));
  it.qtd = nova === minimo && minimo > 0 ? 0 : nova;   // no mínimo, volta a acompanhar os pedidos sozinha
  avisar();
}

// Digitando nos campos da Compra: guarda no rascunho e atualiza só a tabela do pedido
// (sem redesenhar a tela, para não perder o foco).
export function digitando(el) {
  const E = estado.ervas;
  const C = rascunho(E);
  if (!C) return;
  if (el.dataset.compra === 'preco') {
    C.itens[el.dataset.id].preco = el.value;
    el.classList.toggle('falta', !el.value.trim());
  } else C[el.dataset.compra] = el.value;
  const tab = document.getElementById('cp-tabela');
  if (tab) tab.innerHTML = tabelaCompra(E, E.pedidos || calcularPedidos(E.ervas, [], E.frete));
}

export async function enviarFormulario() {
  const ok = await acaoErvas('salvarErva', { nome: val('ev-nome'), pessoasPorcao: val('ev-serve'), precoEstimado: val('ev-estimado') });
  if (ok) {
    toast('Erva adicionada.');
    document.getElementById('ev-nome')?.focus();
  } else {
    avisar();
  }
}
