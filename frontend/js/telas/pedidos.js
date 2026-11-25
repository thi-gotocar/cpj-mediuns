// Sub-aba "Pedidos" (aba Compras): só quem administra a aba Compras (o root e o Admin; o servidor confere).
// Bloco "Pedidos em andamento": uma linha por pedido (cada linha das Compras, sem as doações e sem o grupo Axé) com quem
// pediu, pagamento (Pago / Pendente) e andamento. Agrupadas pelo andamento e, dentro dele, pelo modelo (o item): a foto
// e o nome do modelo aparecem uma vez, com as pessoas embaixo (começam minimizadas); tocar na foto abre em tela cheia e
// tocar no nome abre (ou minimiza) as pessoas daquele modelo.
// No topo, os quadradinhos com o total de pedidos Pendentes, Em confecção e com Falta matéria-prima; tocar em Falta
// matéria-prima abre a lista de compras (descrição, quantidade, a caixinha de comprado e o ✕ para excluir).
// Os grupos de andamento começam todos minimizados.
// O andamento muda no combo da própria linha.
// Quem tem cobrança vencida no ASAAS (última leitura do CPJ - Pgto atrasado) ganha o selo vermelho "pendências R$ X".

import { estado, carregarPedidos, mudarAndamento, acaoMateria, avisar } from '../estado.js';
import { esc, toast } from '../util.js';
import { ICONE_WHATS } from './giraComum.js';
import { centavos, reais } from '/shared/ervas.js';

const R = (v) => reais(centavos(v));
// Ordem dos grupos na tela e das opções do combo.
const ANDAMENTOS = [
  ['pendente', 'Pendente'],
  ['em_confeccao', 'Em confecção'],
  ['falta_materia', 'Falta matéria-prima'],
  ['concluido', 'Concluído'],
  ['entregue', 'Entregue'],
];
// Quadradinhos do topo: [andamento, classe da cor].
const QUADROS = [['pendente', 'pd-q-pend'], ['em_confeccao', 'pd-q-conf'], ['falta_materia', 'pd-q-falta']];
const fotoUrl = (l) => `/api/oferendas?lista=guiaFoto&id=${encodeURIComponent(l.itemId)}&v=${encodeURIComponent(l.fotoV)}`;
// Modelo da linha: o item (o que foi excluído do cadastro fica pela descrição gravada na linha).
const modeloDe = (l) => l.itemId || 'd:' + l.descricao;
// fechados: grupos minimizados (Entregue começa assim); modAbertos: modelos com as pessoas à mostra ('andamento|modelo';
// começam minimizados); salvando: id da linha indo ao servidor; zoom: modelo com a foto aberta.
// materia: a lista de compras aberta; excluir: o item da lista esperando o Confirmar.
const todosFechados = () => new Set(ANDAMENTOS.map(([k]) => k));
const ui = { fechados: todosFechados(), modAbertos: new Set(), salvando: null, zoom: null, materia: false, excluir: null };
export function limpar() { Object.assign(ui, { fechados: todosFechados(), modAbertos: new Set(), salvando: null, zoom: null, materia: false, excluir: null }); }

const qtdTxt = (n) => String(n).replace('.', ',');
// Lista de compras da matéria-prima: o que falta comprar em cima, os comprados embaixo (riscados).
function listaMateria(M) {
  const falta = M.filter((x) => !x.comprado).length;
  const itens = M.map((x) => {
    const conf = ui.excluir === x.id;
    return `<li class="pd-mt-i${x.comprado ? ' ok' : ''}">
      <label class="pd-mt-ck"><input type="checkbox" data-act="pdmatmarcar" data-id="${esc(x.id)}" ${x.comprado ? 'checked' : ''} aria-label="Comprado: ${esc(x.descricao)}"></label>
      <span class="pd-mt-d">${esc(x.descricao)}</span><b class="pd-mt-q">${qtdTxt(x.quantidade)}</b>
      ${conf ? `<span class="pd-mt-conf">Excluir? <button class="btn small" data-act="pdmatnao">Cancelar</button><button class="btn small danger" data-act="pdmatexcluir" data-id="${esc(x.id)}">Confirmar</button></span>`
        : `<button class="pd-mt-x" data-act="pdmatpedir" data-id="${esc(x.id)}" aria-label="Excluir ${esc(x.descricao)} da lista">✕</button>`}</li>`;
  }).join('');
  return `<div class="pd-mt"><div class="pd-mt-h"><h3>🧾 Lista de compras <span class="muted">· matéria-prima</span></h3><span class="count">${falta ? `${falta} a comprar` : 'tudo comprado'}</span></div>
    <form id="f-materia" class="pd-mt-form" autocomplete="off">
      <label class="field grow">O que comprar<input type="text" name="descricao" maxlength="80" required placeholder="Ex.: Miçanga vermelha"></label>
      <label class="field pd-mt-qf">Qtd.<input type="text" name="quantidade" inputmode="decimal" maxlength="8" required placeholder="1"></label>
      <button class="btn primary" type="submit">Adicionar</button></form>
    ${M.length ? `<ul class="pd-mt-l">${itens}</ul>` : '<p class="muted" style="margin:0">A lista está vazia.</p>'}
    ${falta ? `<a class="btn wa-bt pd-mt-wa" href="https://wa.me/?text=${encodeURIComponent(textoMateria(M))}" target="_blank" rel="noopener"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Mandar a lista no WhatsApp</a>` : ''}</div>`;
}
// Texto do WhatsApp: só o que ainda falta comprar, com a quantidade.
function textoMateria(M) {
  const L = M.filter((x) => !x.comprado);
  return ['*🧾 Lista de compras — matéria-prima*', '', ...L.map((x) => `▫️ ${x.descricao} — ${qtdTxt(x.quantidade)}`), '', `Total: ${L.length} ${L.length === 1 ? 'item' : 'itens'}`].join('\n');
}

function foto(l) {
  if (!l.fotoV || !l.itemId) return '<div class="gi-foto pd-foto"><span aria-hidden="true">📿</span></div>';
  return `<div class="gi-foto pd-foto zoom" data-act="pdzoom" data-m="${esc(modeloDe(l))}" role="button" tabindex="0" aria-label="Ver foto de ${esc(l.descricao)}">
    <img src="${esc(fotoUrl(l))}" alt="" loading="lazy" decoding="async"></div>`;
}

// Foto em tela cheia (mesmo visual da aba Compras); tocar em qualquer lugar fecha.
function telaFoto(lista) {
  const l = ui.zoom && lista.find((x) => modeloDe(x) === ui.zoom && x.fotoV);
  if (!l) return '';
  return `<div class="ft-luz" role="dialog" aria-modal="true" aria-label="Foto de ${esc(l.descricao)}" data-act="pdzoomfechar">
    <div class="ft-luz-topo"><span class="ft-luz-tit">${esc(l.descricao)}</span><button class="btn small" data-act="pdzoomfechar" aria-label="Fechar">✕</button></div>
    <div class="ft-luz-img"><img src="${esc(fotoUrl(l))}" alt=""></div>
    <div class="ft-luz-rodape"><b>${R(l.valor)}</b><span class="muted">${esc(l.grupo || '')}</span></div></div>`;
}

// Uma pessoa dentro do modelo: nome (com a quantidade, se for mais de uma) e o pagamento do lado; embaixo, só quando há
// cobrança vencida no ASAAS, "Existem pendências" com o total; e o combo do andamento.
function linha(l, pend) {
  const p = pend[l.chave] || 0;
  const opcoes = ANDAMENTOS.map(([k, rot]) => `<option value="${k}"${l.andamento === k ? ' selected' : ''}>${rot}</option>`).join('');
  return `<li class="pd-l">
    <div class="pd-l1"><span class="pd-nome">${l.quantidade > 1 ? `<b>${l.quantidade}x</b> ` : ''}${esc(l.nome)}</span>
      ${l.pago ? '<span class="badge pleno">Pago</span>' : '<span class="badge pd-pend">Pendente</span>'}</div>
    ${p > 0 ? `<div class="pd-l2"><span class="muted">Existem pendências:</span><span class="badge pd-divida" title="Cobranças vencidas no ASAAS">pendências ${R(p)}</span></div>` : ''}
    <select class="pd-and" data-act="pdandamento" data-id="${esc(l.id)}" aria-label="Andamento do pedido de ${esc(l.nome)}"${ui.salvando === l.id ? ' disabled' : ''}>${opcoes}</select>
  </li>`;
}

// Linhas de um andamento juntas por modelo: o mais pedido primeiro; empate, pelo nome.
function porModelo(L, pend) {
  const m = new Map();
  L.forEach((l) => { const k = modeloDe(l); if (!m.has(k)) m.set(k, []); m.get(k).push(l); });
  const qtd = (ls) => ls.reduce((s, l) => s + l.quantidade, 0);
  return [...m.values()]
    .sort((a, b) => qtd(b) - qtd(a) || a[0].descricao.localeCompare(b[0].descricao, 'pt-BR'))
    .map((ls) => {
      ls.sort((a, b) => b.pedido - a.pedido || a.nome.localeCompare(b.nome, 'pt-BR'));
      const n = qtd(ls);
      const chave = ls[0].andamento + '|' + modeloDe(ls[0]);
      const aberto = ui.modAbertos.has(chave);
      return `<div class="pd-mod${aberto ? '' : ' fechado'}"><div class="pd-mod-h">${foto(ls[0])}
        <button type="button" class="pd-mod-t" data-act="pdmodelo" data-k="${esc(chave)}" aria-expanded="${aberto}"><b>${esc(ls[0].descricao)}</b>
        <small class="muted">${n} ${n === 1 ? 'unidade' : 'unidades'} · ${ls.length} ${ls.length === 1 ? 'pedido' : 'pedidos'}</small>
        <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button></div>
        ${aberto ? `<ul class="pd-lista">${ls.map((l) => linha(l, pend)).join('')}</ul>` : ''}</div>`;
    }).join('');
}

export function render() {
  const P = estado.pedidos;
  if (P === null) { carregarPedidos(); return '<div class="loading">Carregando os pedidos…</div>'; }
  if (P.erroTela) return `<section class="panel"><div class="card"><p class="erro">${esc(P.erroTela)}</p><button class="btn" data-act="pdrecarregar">Tentar de novo</button></div></section>`;
  const lista = P.pedidos || [];
  const pend = P.pendencias || {};
  const abertos = lista.filter((l) => l.andamento !== 'entregue').length;
  let h = `<section class="panel pd-tela"><div class="card adm adm-compras"><div class="grp-h"><h2>📦 Pedidos em andamento</h2><span class="count">${abertos}</span></div>`;
  if (!lista.length) return h + `<p class="muted" style="margin:0">Nenhum pedido ainda.</p><button type="button" class="btn small" data-act="pdmateria" aria-expanded="${ui.materia}">🧾 Lista de compras</button>${ui.materia ? listaMateria(P.materia || []) : ''}</div></section>`;
  h += `<div class="pf-of-totais pd-quads">${QUADROS.map(([k, cls]) => {
    const n = lista.filter((l) => l.andamento === k).length;
    const rot = ANDAMENTOS.find(([x]) => x === k)[1];
    // Falta matéria-prima: tocar abre a lista de compras.
    if (k === 'falta_materia') return `<button type="button" class="pf-of-total ${cls} pd-q-bt" data-act="pdmateria" aria-expanded="${ui.materia}" aria-label="${n} ${n === 1 ? 'pedido' : 'pedidos'}: ${rot}. Abrir a lista de compras"><b>${n}</b><span>${rot}</span><small>🧾 lista de compras</small></button>`;
    return `<div class="pf-of-total ${cls}" aria-label="${n} ${n === 1 ? 'pedido' : 'pedidos'}: ${rot}"><b>${n}</b><span>${rot}</span></div>`;
  }).join('')}</div>`;
  if (ui.materia) h += listaMateria(P.materia || []);
  h += ANDAMENTOS.map(([k, rot]) => {
    const L = lista.filter((l) => l.andamento === k);
    if (!L.length) return '';
    const aberto = !ui.fechados.has(k);
    const cab = `<button class="grp-h dobra" data-act="pddobrar" data-k="${k}" aria-expanded="${aberto}"><h3>${rot}</h3>
      <span class="count">${L.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
    return `<div class="pd-grupo pd-${k}">${cab}${aberto ? porModelo(L, pend) : ''}</div>`;
  }).join('');
  return h + `</div>${telaFoto(lista)}</section>`;
}

export const cliques = {
  pddobrar(el) { const k = el.dataset.k; if (ui.fechados.has(k)) ui.fechados.delete(k); else ui.fechados.add(k); avisar(); },
  pdmodelo(el) { const k = el.dataset.k; if (ui.modAbertos.has(k)) ui.modAbertos.delete(k); else ui.modAbertos.add(k); avisar(); },
  pdzoom(el) { ui.zoom = el.dataset.m; avisar(); },
  pdzoomfechar() { ui.zoom = null; avisar(); },
  pdrecarregar() { estado.pedidos = null; avisar(); },
  pdmateria() { ui.materia = !ui.materia; ui.excluir = null; avisar(); },
  pdmatpedir(el) { ui.excluir = el.dataset.id; avisar(); },
  pdmatnao() { ui.excluir = null; avisar(); },
  async pdmatexcluir(el) { ui.excluir = null; if (await acaoMateria('materiaExcluir', { id: el.dataset.id })) toast('Item excluído da lista de compras.'); },
};

// Adicionar à lista de compras (formulário f-materia, roteado pelo main.js).
export async function enviarMateria(form) {
  const descricao = form.elements.descricao.value, quantidade = form.elements.quantidade.value;
  if (await acaoMateria('materiaIncluir', { descricao, quantidade })) { form.reset(); form.elements.descricao.focus(); }
}

export const mudancas = {
  pdmatmarcar(t) { acaoMateria('materiaMarcar', { id: t.dataset.id, comprado: t.checked }); },
  async pdandamento(t) {
    // Com erro, o redesenho volta o combo para o andamento que está no servidor.
    ui.salvando = t.dataset.id;
    avisar();
    await mudarAndamento(t.dataset.id, t.value);
    ui.salvando = null;
    avisar();
  },
};
