// Tela "Ervas": escolher as ervas da compra coletiva; o admin cadastra, define o frete e exporta.

import { centavos, reais, calcularPedidos, textoPedidos, csvPedidos, totaisPorErva } from '/shared/ervas.js';
import { estado, pode, carregarErvas, escolherErva, acaoErvas, avisar } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';

const qtdDe = (ervaId) => (estado.ervas.minhas || []).find((m) => m.ervaId === ervaId)?.quantidade || 0;
const precoTxt = (v) => reais(centavos(v));

function meuPedido(E) {
  const itens = E.ervas.filter((e) => qtdDe(e.id) > 0);
  const subtotal = itens.reduce((a, e) => a + centavos(e.preco) * qtdDe(e.id), 0);
  // Estimativa do frete: o frete dividido por quem já pediu (contando você).
  const pessoas = itens.length ? E.participantes + (E.euParticipo ? 0 : 1) : 0;
  const frete = pessoas ? Math.round(centavos(E.frete) / pessoas) : 0;
  return { itens, subtotal, frete, total: subtotal + frete, pessoas };
}

function cardEscolha(E) {
  const aberta = E.aberta;
  let h = `<div class="card"><div class="grp-h"><h2>Escolher ervas</h2><span class="count">${esc(E.eu.nome)}</span></div>`;
  if (!aberta) h += `<div class="warnbox">A lista está fechada. Seu pedido não pode mais ser alterado.</div>`;
  if (!E.ervas.length) return h + `<p class="muted" style="margin:0">Nenhuma erva cadastrada ainda.${pode('ervas:gerenciar') ? ' Cadastre abaixo.' : ''}</p></div>`;
  h += `<div class="ervas">`;
  E.ervas.forEach((e) => {
    const q = qtdDe(e.id);
    h += `<div class="erva ${q ? 'sel' : ''}">
      <span class="nmcell"><span class="nm">${esc(e.nome)}</span><span class="muted" style="font-size:.85rem">${precoTxt(e.preco)}${q > 1 ? ` · ${q} = ${reais(centavos(e.preco) * q)}` : ''}</span></span>
      <span class="qtd">
        <button class="btn small" data-act="menos" data-id="${e.id}" ${!aberta || !q ? 'disabled' : ''} aria-label="Menos ${esc(e.nome)}">−</button>
        <span class="n" aria-live="polite">${q}</span>
        <button class="btn small ${q ? '' : 'primary'}" data-act="mais" data-id="${e.id}" ${!aberta || q >= 99 ? 'disabled' : ''} aria-label="Mais ${esc(e.nome)}">+</button>
      </span></div>`;
  });
  h += `</div>`;
  const m = meuPedido(E);
  h += `<div class="resumo">
    <div><span>Ervas</span><b>${reais(m.subtotal)}</b></div>
    <div><span>Frete${m.pessoas ? ` (÷ ${m.pessoas})` : ''}</span><b>${m.itens.length ? '≈ ' + reais(m.frete) : '—'}</b></div>
    <div class="tot"><span>Total</span><b>${m.itens.length ? '≈ ' + reais(m.total) : reais(0)}</b></div>
  </div>
  <p class="muted" style="margin:0;font-size:.85rem">O frete de ${precoTxt(E.frete)} é dividido por todos que pedirem; o valor final depende de quantas pessoas pedirem.</p></div>`;
  return h;
}

function cardCompra(E) {
  return `<div class="card"><h2>Compra</h2>
    <div class="row">
      <label class="field" style="flex:0 1 180px">Frete total (R$)<input type="text" inputmode="decimal" id="ev-frete" value="${(Number(E.frete) || 0).toFixed(2).replace('.', ',')}"></label>
      <button class="btn" data-act="frete">Salvar frete</button>
      <button class="btn ${E.aberta ? '' : 'primary'}" data-act="abrir" data-v="${E.aberta ? '0' : '1'}">${E.aberta ? 'Fechar lista' : 'Reabrir lista'}</button>
    </div>
    <p class="muted" style="margin:0;font-size:.85rem">${E.aberta ? 'Lista aberta: todos podem escolher e mudar o pedido.' : 'Lista fechada: ninguém altera o pedido até você reabrir.'}</p>
  </div>`;
}

function cardCatalogo(E) {
  let h = `<div class="card"><h2>Ervas e preços</h2>
    <form id="f-erva" class="row" autocomplete="off">
      <label class="field grow">Erva<input type="text" id="ev-nome" maxlength="60" required placeholder="Ex.: Arruda"></label>
      <label class="field" style="flex:0 1 130px">Preço (R$)<input type="text" inputmode="decimal" id="ev-preco" required placeholder="0,00"></label>
      <button class="btn primary" type="submit">Adicionar</button>
    </form>`;
  if (E.ervas.length) {
    h += `<div class="ppl">`;
    E.ervas.forEach((e) => {
      const conf = estado.confirm === 'e:' + e.id;
      h += `<div class="pp ev">
        <input type="text" id="ev-n-${e.id}" value="${esc(e.nome)}" maxlength="60" aria-label="Nome">
        <input type="text" inputmode="decimal" id="ev-p-${e.id}" value="${Number(e.preco).toFixed(2).replace('.', ',')}" aria-label="Preço de ${esc(e.nome)}" style="width:90px">
        <span class="acts" style="display:flex;gap:6px"><button class="btn small" data-act="salvarerva" data-id="${e.id}">Salvar</button>
        ${conf ? `<button class="btn small danger" data-act="delerva" data-id="${e.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="e:${e.id}">Excluir</button>`}</span></div>`;
    });
    h += `</div><p class="muted" style="margin:0;font-size:.85rem">Excluir uma erva tira ela dos pedidos de quem a escolheu.</p>`;
  }
  return h + `</div>`;
}

function cardPedidos(E) {
  const r = E.pedidos || calcularPedidos(E.ervas, [], E.frete);
  let h = `<div class="card"><div class="grp-h"><h2>Pedidos</h2><span class="count">${r.pessoas.length} pessoa${r.pessoas.length === 1 ? '' : 's'}</span></div>`;
  if (!r.pessoas.length) return h + `<p class="muted" style="margin:0">Ninguém escolheu ervas ainda.</p></div>`;
  h += `<div class="matrix"><table class="pedidos"><thead><tr><th class="rh">Nome</th><th class="rh">Ervas</th><th>Ervas R$</th><th>Frete</th><th>Total</th></tr></thead><tbody>
    ${r.pessoas.map((p) => `<tr><th class="rh">${esc(p.nome)}</th><td class="rh">${p.itens.map((i) => esc(i.nome) + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', ')}</td><td>${reais(p.subtotal)}</td><td>${reais(p.frete)}</td><td><b>${reais(p.total)}</b></td></tr>`).join('')}
    </tbody><tfoot><tr><th class="rh">Total</th><td></td><td>${reais(r.totalItens)}</td><td>${reais(r.totalFrete)}</td><td><b>${reais(r.totalGeral)}</b></td></tr></tfoot></table></div>`;
  const tot = totaisPorErva(r);
  h += `<div class="grp"><h3>Para comprar</h3><p style="margin:0">${tot.map((t) => `${esc(t.nome)} x${t.quantidade}`).join(' · ')}</p></div>`;
  const txt = textoPedidos(r, E.frete);
  h += `<textarea id="ev-txt" readonly aria-label="Lista para o WhatsApp">${esc(txt)}</textarea>
    <div class="row">
      <button class="btn primary" data-act="copiarervas">Copiar lista</button>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
      <button class="btn" data-act="csvervas">Baixar planilha</button>
    </div>
    <div class="grp" style="border-top:1px solid var(--line);padding-top:12px">
      <p class="muted" style="margin:0;font-size:.85rem">Depois de exportar, comece uma nova compra: os pedidos são apagados e a lista reabre. As ervas, os preços e o frete ficam.</p>
      ${estado.confirm === 'nova-compra'
        ? '<button class="btn danger" data-act="novacompra">Confirmar: apagar pedidos e começar nova compra</button>'
        : '<button class="btn" data-act="askdel" data-k="nova-compra">Nova compra</button>'}
    </div>`;
  return h + `</div>`;
}

export function render() {
  if (estado.ervas === null) { carregarErvas(); return `<div class="loading">Carregando ervas…</div>`; }
  const E = estado.ervas;
  let h = `<section class="panel">${cardEscolha(E)}`;
  if (pode('ervas:gerenciar')) h += cardCompra(E) + cardCatalogo(E) + cardPedidos(E);
  return h + `</section>`;
}

const val = (id) => document.getElementById(id)?.value ?? '';

export const cliques = {
  mais(el) { escolherErva(el.dataset.id, Math.min(99, qtdDe(el.dataset.id) + 1)); },
  menos(el) { escolherErva(el.dataset.id, Math.max(0, qtdDe(el.dataset.id) - 1)); },
  async frete() { if (await acaoErvas('config', { frete: val('ev-frete') })) toast('Frete salvo.'); },
  async abrir(el) { if (await acaoErvas('config', { aberta: el.dataset.v === '1' })) toast(el.dataset.v === '1' ? 'Lista reaberta.' : 'Lista fechada.'); },
  async salvarerva(el) {
    const id = el.dataset.id;
    if (await acaoErvas('salvarErva', { id, nome: val('ev-n-' + id), preco: val('ev-p-' + id) })) toast('Erva salva.');
  },
  async delerva(el) { estado.confirm = null; if (await acaoErvas('excluirErva', { id: el.dataset.id })) toast('Erva excluída.'); },
  async novacompra() { estado.confirm = null; if (await acaoErvas('novaCompra')) toast('Nova compra iniciada.'); },
  copiarervas() {
    const txt = val('ev-txt');
    const fb = () => { const t = document.getElementById('ev-txt'); t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Lista copiada.'), fb); } catch { fb(); }
  },
  csvervas() {
    const r = estado.ervas.pedidos;
    if (!r) return;
    baixar(new Blob([csvPedidos(r)], { type: 'text/csv;charset=utf-8' }), 'ervas-' + hoje() + '.csv');
  },
};

export async function enviarFormulario() {
  const ok = await acaoErvas('salvarErva', { nome: val('ev-nome'), preco: val('ev-preco') });
  if (ok) {
    toast('Erva adicionada.');
    document.getElementById('ev-nome')?.focus();
  } else {
    avisar();
  }
}
