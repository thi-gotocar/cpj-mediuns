// Tela "Ervas": escolher as ervas da compra coletiva; o admin cadastra, define o frete e exporta.

import { centavos, reais, calcularPedidos, totaisPorErva, temPreco, textoFornecedor, csvFornecedor, textoCobranca, csvCobranca, normalizarNome, linhaEvento, itensCompra, porcoesErva, pedidosPorErva } from '/shared/ervas.js';
import { estado, pode, pessoasOrd, carregarErvas, carregarHistoricoErvas, escolherErva, acaoErvas, salvarPedidoDe, avisar } from '../estado.js';
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

const qtdDe = (ervaId) => (estado.ervas.minhas || []).find((m) => m.ervaId === ervaId)?.quantidade || 0;
const serveTxt = (e) => (Number(e.pessoasPorcao) ? ` (serve ${e.pessoasPorcao})` : '');
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
      : `${reais(centavos(e.preco))} a porção${serveTxt(e)}${n ? ` · ${n} pessoa${n > 1 ? 's' : ''}` : ''}${minha ? ` · sua parte ≈ ${reais(minha.valor)}` : ''}`;
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
  <p class="muted" style="margin:0;font-size:.85rem">O custo de cada erva (preço da porção × porções compradas) é dividido entre quem escolheu aquela erva (na proporção da quantidade), e o frete de ${precoTxt(E.frete)} entre todos que pedirem. Os valores mudam conforme mais pessoas pedem.</p></div>`;
  return h;
}

// Admin: pedido de outra pessoa (quem não tem acesso ao app, ou para corrigir um pedido).
function cardPedidoDe(E) {
  const P = estado.ervasPara;
  let h = `<div class="card adm" id="card-para"><div class="grp-h"><h2>Pedido para outra pessoa</h2></div>`;
  if (!E.aberta) return h + `<p class="muted" style="margin:0">A lista está fechada. Reabra a lista para fazer ou mudar pedidos.</p></div>`;
  if (!P) {
    const comPedido = new Set((E.pedidos?.pessoas || []).map((p) => p.chave));
    return h + `<form id="f-para" class="row" autocomplete="off">
      <label class="field grow">Pessoa da corrente<select id="pa-pessoa"><option value="">— escolha quem está pedindo —</option>
        ${pessoasOrd().map((p) => `<option value="${p.id}">${esc(p.nome)}${comPedido.has('p:' + p.id) ? ' · já tem pedido' : ''}</option>`).join('')}</select></label>
      <button class="btn primary" type="submit">Montar pedido</button></form>
      <p class="muted" style="margin:0;font-size:.85rem">Escolha a pessoa cadastrada que está fazendo o pedido. Se ela já tiver pedido, o pedido dela abre para editar. Também dá para editar pela tabela de pedidos. Funciona com a lista fechada.</p></div>`;
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

function cardCompra(E, r) {
  const C = rascunho(E);
  const v = C || compraSalva(E);
  const trava = C ? '' : 'disabled';
  const nPed = pedidosPorErva(r);
  const nItens = E.ervas.filter((e) => porcoes(e, v.itens[e.id].qtd, nPed).qtd > 0).length;
  let h = `<div class="card adm" id="card-compra"><div class="grp-h"><h2>Compra</h2><span class="count">${nItens} erva${nItens === 1 ? '' : 's'} no pedido</span></div>
    <div class="row compra-ev">
      <label class="field">Nome da gira<input type="text" id="ev-gira" data-compra="gira" maxlength="80" value="${esc(v.gira)}" placeholder="Ex.: Gira de Caboclo" ${trava}></label>
      <label class="field">Data do evento<input type="date" id="ev-data" data-compra="data" value="${esc(v.data)}" ${trava}></label>
    </div>`;
  if (!E.ervas.length) h += `<p class="muted" style="margin:0">Nenhuma erva cadastrada ainda. Cadastre abaixo.</p>`;
  h += `<div class="ervas">`;
  E.ervas.forEach((e) => {
    const it = v.itens[e.id];
    const { qtd, minimo, n } = porcoes(e, it.qtd, nPed);
    const serve = Number(e.pessoasPorcao);
    const info = [n ? `corrente pediu ${n}` : 'ninguém pediu', serve ? `serve ${serve} → mínimo ${minimo}` : ''].filter(Boolean).join(' · ');
    h += `<div class="erva ${qtd ? 'sel' : ''}">
      <span class="nmcell"><span class="nm">${esc(e.nome)}</span>${C
        ? `<label class="preco-compra">R$/porção<input type="text" inputmode="decimal" id="cp-p-${e.id}" data-compra="preco" data-id="${e.id}" value="${esc(it.preco)}" placeholder="a definir" aria-label="Preço da porção de ${esc(e.nome)}" class="${it.preco.trim() ? '' : 'falta'}"></label>`
        : `<span class="muted" style="font-size:.85rem">${temPreco(e) ? precoTxt(e.preco) + ' a porção' : 'preço a definir'}</span>`}<span class="muted" style="font-size:.85rem">${info}</span></span>
      <span class="qtd">
        <button class="btn small" data-act="cpmenos" data-id="${e.id}" ${!C || qtd <= minimo ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n">${qtd}</span>
        <button class="btn small ${C && !qtd ? 'primary' : ''}" data-act="cpmais" data-id="${e.id}" ${!C || qtd >= 999 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span></div>`;
  });
  // Frete logo abaixo da última erva: o valor, ou o campo durante a edição.
  h += `<div class="erva frete-linha">
      <span class="nmcell"><span class="nm">Frete</span><span class="muted" style="font-size:.85rem">dividido entre todos que pedirem</span></span>
      ${C ? `<label class="preco-compra">R$<input type="text" inputmode="decimal" id="ev-frete" data-compra="frete" value="${esc(v.frete)}" aria-label="Valor do frete"></label>`
        : `<b>${reais(campoCentavos(v.frete) || 0)}</b>`}
    </div></div>
    <div class="grp"><h3>Pedido</h3><div id="cp-tabela">${tabelaCompra(E, r)}</div></div>
    <div class="bt-iguais">${E.aberta ? `
      ${C ? '<button class="btn" data-act="cpcancelar"><span aria-hidden="true">✕</span> Cancelar</button>'
        : '<button class="btn" data-act="cpeditar"><span aria-hidden="true">✎</span> Editar</button>'}
      <button class="btn ${C ? 'primary' : ''}" data-act="cpsalvar" ${C ? '' : 'disabled'}><span aria-hidden="true">✓</span> Salvar</button>
      <button class="btn" data-act="pedirfechar"><span aria-hidden="true">🔒</span> Fechar lista</button>`
      : '<button class="btn primary" data-act="abrir"><span aria-hidden="true">🔓</span> Reabrir lista</button>'}
    </div>
    <p class="muted" style="margin:0;font-size:.85rem">${C ? 'Editando: altere o que precisar e toque em Salvar. ' : ''}${E.aberta ? 'Lista aberta: todos podem escolher e mudar o pedido.' : 'Lista fechada: ninguém altera os pedidos nem a Compra até você reabrir.'}</p>`;
  return h + exportacao(E, r) + `<div class="grp" style="border-top:1px solid var(--line);padding-top:12px">
      <p class="muted" style="margin:0;font-size:.85rem">Depois de cobrar, comece uma nova compra: a atual pode ser encerrada (fica guardada no Histórico de compras) ou descartada. Os pedidos e as quantidades são apagados e a lista reabre; as ervas, os preços e o frete ficam.</p>
      <button class="btn" data-act="novaini"><span aria-hidden="true">🆕</span> Nova compra</button>
    </div></div>`;
}

// Pedido ao fornecedor (quantidades da Compra) e Cobrança (pedidos da corrente).
function exportacao(E, r) {
  const vista = estado.ervasVista;
  const faltam = r.faltamPrecos.length;
  const semCompra = !itensCompra(E.ervas, r).length;
  const semPedidos = !r.pessoas.length;
  let h = `<div class="bt-iguais">
      <button class="btn ${vista === 'fornecedor' ? 'primary' : ''}" data-act="vista" data-v="fornecedor" aria-pressed="${vista === 'fornecedor'}" ${semCompra ? 'disabled' : ''}><span aria-hidden="true">🛒</span> Pedido ao fornecedor</button>
      <button class="btn ${vista === 'cobranca' ? 'primary' : ''}" data-act="vista" data-v="cobranca" aria-pressed="${vista === 'cobranca'}" ${faltam || semPedidos ? 'disabled' : ''}><span aria-hidden="true">💰</span> Cobrança</button>
    </div>
    ${semCompra ? '<p class="muted" style="margin:0;font-size:.85rem">O pedido ao fornecedor libera quando alguma erva for pedida ou tiver quantidade na Compra.</p>' : ''}
    ${faltam ? `<p class="muted" style="margin:0;font-size:.85rem">A cobrança libera quando todas as ervas pedidas tiverem preço. Faltam: ${r.faltamPrecos.map(esc).join(', ')}.</p>` : ''}`;
  if ((vista === 'fornecedor' && !semCompra) || (vista === 'cobranca' && !faltam && !semPedidos)) {
    const ev = { gira: E.gira, data: E.data };
    const txt = vista === 'fornecedor' ? textoFornecedor(E.ervas, r, new Date(), ev) : textoCobranca(r, new Date(), ev);
    const titulo = vista === 'fornecedor' ? 'Pedido ao fornecedor' : 'Cobrança';
    const dica = vista === 'fornecedor'
      ? 'As ervas e as porções da Compra. Envie ao fornecedor.'
      : 'Quanto cada pessoa paga: ervas + parte do frete.';
    h += `<div class="grp exp"><h3>${titulo}</h3><p class="muted" style="margin:0;font-size:.85rem">${dica}</p>
      <textarea id="ev-txt" readonly aria-label="${titulo}">${esc(txt)}</textarea>
      <div class="row">
        <button class="btn primary" data-act="copiarervas">Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
        <button class="btn" data-act="csvervas">Baixar planilha</button>
        <button class="btn" data-act="imgervas">${estado.ervasImg && estado.ervasImg.chave === vista + txt ? 'Atualizar imagem' : 'Imagem'}</button>
      </div>
      ${estado.ervasImg && estado.ervasImg.chave === vista + txt ? `<img class="prev" src="${estado.ervasImg.url}" alt="Imagem: ${titulo}">
        <div class="row"><button class="btn primary" data-act="shareimgervas">Compartilhar imagem</button><button class="btn" data-act="saveimgervas">Salvar imagem</button></div>` : ''}
      </div>`;
  }
  return h;
}

// Começa minimizado a cada vez que o app abre; tocar no título expande.
// Sem nenhuma erva cadastrada, já abre para cadastrar (e fica aberto enquanto cadastra).
let precosAberto = null;
function cardCatalogo(E) {
  if (precosAberto === null) precosAberto = !E.ervas.length;
  const aberto = precosAberto;
  let h = `<div class="card adm"><button class="grp-h dobra" data-act="dobrarprecos" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'} Cadastro de ervas">
      <h2>Cadastro de ervas</h2><span class="count">${E.ervas.length} erva${E.ervas.length === 1 ? '' : 's'} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + `</div>`;
  if (!E.aberta) {
    return h + `<p class="muted" style="margin:0">A lista está fechada. Reabra a lista para cadastrar ou mudar ervas.</p>
      <p style="margin:0">${E.ervas.map((e) => esc(e.nome) + (Number(e.pessoasPorcao) ? ` (serve ${e.pessoasPorcao})` : '')).join(' · ')}</p></div>`;
  }
  h += `
    <form id="f-erva" class="row" autocomplete="off">
      <label class="field grow">Erva<input type="text" id="ev-nome" maxlength="60" required placeholder="Ex.: Arruda"></label>
      <label class="field" style="flex:0 1 150px">Porção serve (pessoas)<input type="number" inputmode="numeric" id="ev-serve" min="1" max="999" placeholder="todos"></label>
      <button class="btn primary" type="submit">Adicionar</button>
    </form>`;
  if (E.ervas.length) {
    h += `<div class="ppl">`;
    E.ervas.forEach((e) => {
      const conf = estado.confirm === 'e:' + e.id;
      h += `<div class="pp ev">
        <input type="text" id="ev-n-${e.id}" value="${esc(e.nome)}" maxlength="60" aria-label="Nome">
        <label class="serve-erva"><input type="number" inputmode="numeric" id="ev-s-${e.id}" min="1" max="999" value="${Number(e.pessoasPorcao) || ''}" placeholder="todos" aria-label="Quantas pessoas uma porção de ${esc(e.nome)} serve"> pessoas</label>
        <span class="acts" style="display:flex;gap:6px"><button class="btn small" data-act="salvarerva" data-id="${e.id}">Salvar</button>
        ${conf ? `<button class="btn small danger" data-act="delerva" data-id="${e.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="e:${e.id}">Excluir</button>`}</span></div>`;
    });
    h += `</div><p class="muted" style="margin:0;font-size:.85rem">“Porção serve” é quantas pessoas uma porção atende: com mais pedidos que isso, a Compra pede mais porções e o custo aumenta. Em branco, uma porção atende todos. O preço e a quantidade ficam no bloco Compra. Excluir uma erva tira ela dos pedidos de quem a escolheu.</p>`;
  }
  return h + `</div>`;
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
  const resumo = meu.itens.length
    ? `<div class="meu-ped"><span class="eyebrow">Seu pedido</span>
        <ul>${meu.itens.map((i) => `<li><span>${i.quantidade > 1 ? `${i.quantidade}× ` : ''}${esc(i.nome)}</span><b>${i.semPreco ? 'a definir' : '≈ ' + reais(i.valor)}</b></li>`).join('')}${meu.frete ? `<li class="muted"><span>Frete (sua parte)</span><span>≈ ${reais(meu.frete)}</span></li>` : ''}</ul>
        <div class="meu-tot"><span>Valor total</span><b>≈ ${reais(meu.total)}${meu.pendente ? ' + a definir' : ''}</b></div></div>`
    : `<p class="muted" style="margin:0;font-size:.9rem">Você ainda não escolheu nenhuma erva.</p>`;
  return `<div class="card">${ev ? `<div class="datehead"><span class="eyebrow">Pedido de ervas</span>
    ${E.data ? `<span class="dia">${d}/${m}/${y}</span>` : ''}${E.gira ? `<span class="ent">${esc(E.gira)}</span>` : ''}</div>` : '<h2>Pedido de ervas</h2>'}
    ${resumo}</div>`;
}

export function render() {
  if (estado.ervas === null) { carregarErvas(); return `<div class="loading">Carregando ervas…</div>`; }
  const E = estado.ervas;
  let h = `<section class="panel">${cabecalho(E)}${cardEscolha(E)}`;
  if (pode('ervas:gerenciar')) {
    const r = E.pedidos || calcularPedidos(E.ervas, [], E.frete);
    h += (E.ervas.length ? cardPedidoDe(E) : '') + cardCompra(E, r) + cardCatalogo(E) + cardPedidos(E, r) + cardHistorico();
  }
  else h += cardStatus(E);
  return h + janelaFechar() + janelaNova() + `</section>`;
}

// Nova compra: primeiro escolhe encerrar (guarda no Histórico de compras) ou descartar; depois confirma de novo.
function janelaNova() {
  const N = estado.ervasNova;
  if (!N) return '';
  const caixa = (titulo, corpo, botoes) => `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="en-t"><div class="modal">
    <h3 id="en-t">${titulo}</h3>${corpo}<div class="row" style="justify-content:flex-end;gap:8px">${botoes}</div></div></div>`;
  if (N.passo === 'escolher') {
    return caixa('Nova compra', `<p style="margin:0">O que fazer com a compra atual?</p>
      <div class="nova-ops">
        <button class="btn primary" data-act="novamodo" data-m="encerrar"><span aria-hidden="true">📦</span> Encerrar e guardar<span class="nova-sub">Fica no Histórico de compras, com a tabela e a cobrança</span></button>
        <button class="btn" data-act="novamodo" data-m="descartar"><span aria-hidden="true">🗑️</span> Descartar<span class="nova-sub">Apaga sem guardar</span></button>
      </div>`, '<button class="btn" data-act="novacancel">Cancelar</button>');
  }
  return N.modo === 'encerrar'
    ? caixa('Encerrar e guardar?', '<p style="margin:0">A compra atual vai para o <b>Histórico de compras</b>. Depois os pedidos e as quantidades são apagados e a lista reabre para a nova compra.</p>',
      '<button class="btn" data-act="novavoltar">Voltar</button><button class="btn primary" data-act="novaok">Sim, encerrar e começar nova</button>')
    : caixa('Descartar a compra atual?', '<p style="margin:0">Os pedidos e as quantidades são <b>apagados sem guardar</b>. Isso não pode ser desfeito.</p>',
      '<button class="btn" data-act="novavoltar">Voltar</button><button class="btn danger" data-act="novaok">Sim, descartar</button>');
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
      <span class="hc-tit">${esc(c.gira || 'Compra sem gira')}</span><span class="hc-tot">${reais(R.totalCompra || 0)}${falta ? ' +?' : ''} <span class="seta" aria-hidden="true">${aberta ? '▾' : '▸'}</span></span>
      <span class="muted hc-sub">${c.data ? `${d}/${m}/${y} · ` : ''}encerrada em ${quando} · ${np} pessoa${np === 1 ? '' : 's'}</span></button>`;
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
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="fecharcancel">Cancelar</button><button class="btn danger" data-act="fecharok">Fechar lista</button></div>
  </div></div>`;
}

const val = (id) => document.getElementById(id)?.value ?? '';

export const cliques = {
  dobrarprecos() { precosAberto = !precosAberto; avisar(); },
  mais(el) { escolherErva(el.dataset.id, Math.min(99, qtdDe(el.dataset.id) + 1)); },
  menos(el) { escolherErva(el.dataset.id, Math.max(0, qtdDe(el.dataset.id) - 1)); },
  // Bloco Compra: Editar libera os campos; Salvar grava tudo (se algo mudou) e trava de novo.
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
    // Fechar descarta a edição da Compra e o pedido de outra pessoa que estiverem abertos.
    if (await acaoErvas('config', { aberta: false })) { estado.ervasCompra = null; estado.ervasPara = null; toast('Lista fechada.'); avisar(); }
    else avisar();
  },
  async salvarerva(el) {
    const id = el.dataset.id;
    if (await acaoErvas('salvarErva', { id, nome: val('ev-n-' + id), pessoasPorcao: val('ev-s-' + id) })) toast('Erva salva.');
  },
  async delerva(el) { estado.confirm = null; if (await acaoErvas('excluirErva', { id: el.dataset.id })) toast('Erva excluída.'); },
  novaini() { estado.ervasNova = { passo: 'escolher' }; avisar(); },
  novamodo(el) { estado.ervasNova = { passo: 'confirmar', modo: el.dataset.m }; avisar(); },
  novavoltar() { estado.ervasNova = { passo: 'escolher' }; avisar(); },
  novacancel() { estado.ervasNova = null; avisar(); },
  async novaok() {
    const encerrar = estado.ervasNova?.modo === 'encerrar';
    estado.ervasNova = null;
    if (await acaoErvas(encerrar ? 'encerrarCompra' : 'novaCompra')) {
      estado.ervasCompra = null;
      if (encerrar) estado.ervasHist = null;   // busca de novo com a compra que acabou de entrar
      toast(encerrar ? 'Compra guardada no Histórico de compras. Nova compra iniciada.' : 'Compra descartada. Nova compra iniciada.');
    }
    avisar();
  },
  dobrarhist() { histAberto = !histAberto; avisar(); },
  dobrarcompra(el) { const id = el.dataset.id; if (histAbertas.has(id)) histAbertas.delete(id); else histAbertas.add(id); avisar(); },
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
    if (await salvarPedidoDe({ chave: P.chave, pessoaId: P.pessoaId, nome: P.nome }, itens)) {
      toast(itens.length ? `Pedido de ${P.nome} salvo.` : `Pedido de ${P.nome} apagado.`);
      estado.ervasPara = null;
      avisar();
    }
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

function abrirPara(P) {
  estado.ervasPara = P;
  avisar();
  document.getElementById('card-para')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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

// "Montar pedido": se o nome já tem pedido, abre o pedido dele para editar.
export function enviarPara() {
  const id = val('pa-pessoa');
  const pessoa = estado.pessoas.find((p) => p.id === id);
  if (!pessoa) { toast('Escolha a pessoa que está pedindo.'); return; }
  const lista = estado.ervas.pedidos?.pessoas || [];
  const p = lista.find((x) => x.chave === 'p:' + id) || lista.find((x) => normalizarNome(x.nome) === normalizarNome(pessoa.nome));
  abrirPara(p
    ? { chave: p.chave, nome: p.nome, itens: Object.fromEntries(p.itens.map((i) => [i.ervaId, i.quantidade])) }
    : { pessoaId: id, nome: pessoa.nome, itens: {} });
}

export async function enviarFormulario() {
  const ok = await acaoErvas('salvarErva', { nome: val('ev-nome'), pessoasPorcao: val('ev-serve') });
  if (ok) {
    toast('Erva adicionada.');
    document.getElementById('ev-nome')?.focus();
  } else {
    avisar();
  }
}
