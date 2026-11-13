// Tela "Compras" (pedidos de guias): a pessoa pede os itens à venda; o admin cadastra grupos e itens,
// encerra e começa pedidos (numerados), marca ok em cada linha e exporta a lista.

import { estado, pode, carregarGuias, acaoGuias, avisar } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';
import { centavos, reais } from '/shared/ervas.js';
import { gerarImagemLista, compartilharImagem } from '../imagemLista.js';

const R = (v) => reais(centavos(v));
const dataUrl = (b64) => 'data:image/jpeg;base64,' + b64;
const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// Estado só desta tela (volta ao padrão ao trocar de aba, como o estado.guias).
const ui = {
  abertos: new Set(),       // grupos expandidos (admin)
  feitos: new Set(),        // pedidos encerrados expandidos
  grupoRen: null,           // id do grupo com o ✎ aberto
  item: null,               // formulário de item: { grupoId, id?, descricao, quantidade, valor, visivel, foto?: b64 | null }
  qtd: {},                  // quantidade escolhida por item (antes de Pedir)
  pedir: null,              // janela de confirmação: { itemId, quantidade }
  exportar: null,           // número do pedido escolhido para exportar
  img: null,                // imagem gerada: { chave, blob, url, nome }
  zoom: null,               // id do item com a foto aberta em tela cheia
};
export function limpar() {
  ui.abertos.clear(); ui.feitos.clear();
  Object.assign(ui, { grupoRen: null, item: null, qtd: {}, pedir: null, exportar: null, zoom: null });
  if (ui.img) URL.revokeObjectURL(ui.img.url);
  ui.img = null;
}

const admin = () => pode('guias:gerenciar') && estado.guias?.admin;
// O que a corrente vê (o admin recebe tudo, inclusive o oculto): só grupos e itens visíveis.
const gruposVisiveis = (G) => G.grupos.filter((g) => g.visivel).map((g) => ({ ...g, itens: g.itens.filter((i) => i.visivel) })).filter((g) => g.itens.length);
const acharItem = (id) => estado.guias.grupos.flatMap((g) => g.itens).find((i) => i.id === id);

// Linhas de um pedido juntas por pessoa, em ordem alfabética.
function porPessoa(linhas) {
  const m = new Map();
  linhas.forEach((l) => {
    if (!m.has(l.chave)) m.set(l.chave, { nome: l.nome, linhas: [], total: 0 });
    const p = m.get(l.chave);
    p.linhas.push(l);
    p.total += l.valor * l.quantidade;
  });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
const totalDe = (linhas) => linhas.reduce((a, l) => a + l.valor * l.quantidade, 0);
const itensDe = (linhas) => linhas.reduce((a, l) => a + l.quantidade, 0);

// ---------- pessoa ----------
// zoom: tocar na foto abre em tela cheia (só no item já salvo, não na prévia do formulário).
function fotoItem(i, cls = 'gi-foto', zoom = false) {
  const abre = zoom && i.foto && i.id ? ` data-act="guiazoom" data-id="${i.id}" role="button" tabindex="0" aria-label="Ver foto de ${esc(i.descricao)}"` : '';
  return `<div class="${cls}${abre ? ' zoom' : ''}"${abre}>${i.foto ? `<img src="${dataUrl(i.foto)}" alt="" loading="lazy">` : '<span aria-hidden="true">📿</span>'}</div>`;
}

function cardItens(G) {
  const grupos = gruposVisiveis(G);
  const fechado = !G.aberto;
  let h = fechado ? '<div class="card"><p class="gi-aviso">Os pedidos estão fechados no momento.</p></div>' : '';
  if (!grupos.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum item à venda no momento.</p></div>';
  return h + grupos.map((g) => `<div class="card"><div class="grp-h"><h2>${esc(g.descricao)}</h2></div><div class="gi-lista">
    ${g.itens.map((i) => {
      const max = Math.min(i.quantidade, 20);
      const q = Math.min(ui.qtd[i.id] || 1, Math.max(max, 1));
      const acao = i.quantidade < 1 ? '<span class="badge re">Esgotado</span>'
        : `<select data-act="guiaqtd" data-id="${i.id}" aria-label="Quantidade de ${esc(i.descricao)}" ${fechado ? 'disabled' : ''}>${Array.from({ length: max }, (_, k) => `<option value="${k + 1}" ${k + 1 === q ? 'selected' : ''}>${k + 1}</option>`).join('')}</select>
           <button class="btn primary small" data-act="guiapedir" data-id="${i.id}" ${fechado ? 'disabled' : ''}>Pedir</button>`;
      return `<div class="gi-item">${fotoItem(i, 'gi-foto', true)}
        <div class="gi-info"><b>${esc(i.descricao)}</b><span class="gi-valor">${R(i.valor)}</span>
          <span class="muted gi-disp">${i.quantidade < 1 ? 'Sem estoque' : plural(i.quantidade, 'disponível', 'disponíveis')}</span></div>
        <div class="gi-acao">${acao}</div></div>`;
    }).join('')}</div></div>`).join('');
}

function cardMeus(G) {
  const M = G.meus || [];
  const lista = M.length
    ? `<ul class="gi-meus">${M.map((l) => `<li><span class="gi-meu-desc"><b>${esc(l.descricao)}</b><span class="muted">Pedido nº ${l.pedido}</span></span>
        <span class="gi-meu-val">${l.quantidade}x · <b>${R(l.valor * l.quantidade)}</b></span></li>`).join('')}</ul>
       <div class="meu-tot"><span>Valor total</span><b>${R(totalDe(M))}</b></div>`
    : '<p class="muted" style="margin:0">Você ainda não fez nenhum pedido.</p>';
  return `<div class="card"><div class="grp-h"><h2>Seus pedidos</h2></div>${lista}
    <p class="gi-suporte">* Para cancelar, entre em contato com o suporte.</p></div>`;
}

function janelaPedir() {
  const P = ui.pedir;
  const i = P && acharItem(P.itemId);
  if (!i) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="gp-t"><div class="modal">
    <h3 id="gp-t">Confirmar pedido?</h3>
    <p style="margin:0"><b>${P.quantidade}x ${esc(i.descricao)}</b> · ${R(i.valor * P.quantidade)}</p>
    <p class="muted" style="margin:0">Para cancelar depois, só entrando em contato com o suporte.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="guiapedircancel">Voltar</button><button class="btn primary" data-act="guiapedirok">Confirmar pedido</button></div>
  </div></div>`;
}

// ---------- admin ----------
function cardTopo(G) {
  return `<div class="card adm ervas-pub"><label class="of-sw"><input type="checkbox" role="switch" data-act="guiapub" ${G.publicada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label></div>`;
}

function formItem(I) {
  const temFoto = I.foto !== undefined ? I.foto : acharItem(I.id)?.foto;
  return `<form id="f-guia-item" class="gi-form" autocomplete="off">
    <h3>${I.id ? 'Editar item' : 'Novo item'}</h3>
    <label class="field">Descrição<input type="text" id="gi-desc" data-guia="descricao" maxlength="120" value="${esc(I.descricao)}" required></label>
    <div class="gi-foto-campo">${fotoItem({ foto: temFoto }, 'gi-foto')}
      <label class="btn small">📷 ${temFoto ? 'Trocar foto' : 'Pôr foto'}<input type="file" accept="image/*" data-act="guiafoto" hidden></label>
      ${temFoto ? '<button type="button" class="btn link" data-act="guiatirafoto">Remover</button>' : ''}</div>
    <div class="row gi-nums">
      <label class="field">Quantidade disponível<input type="number" id="gi-qtd" data-guia="quantidade" min="0" max="9999" inputmode="numeric" value="${esc(I.quantidade)}" required></label>
      <label class="field">Valor (R$)<input type="text" id="gi-valor" data-guia="valor" inputmode="decimal" placeholder="0,00" value="${esc(I.valor)}" required></label>
    </div>
    <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemvisform" ${I.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível</b></label>
    <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-act="guiaitemcancel">Cancelar</button><button class="btn primary" type="submit">Salvar item</button></div>
  </form>`;
}

function grupoAdmin(g) {
  const aberto = ui.abertos.has(g.id);
  let h = `<div class="gg"><button class="grp-h dobra" data-act="guiadobrar" data-id="${g.id}" aria-expanded="${aberto}">
    <h3>${esc(g.descricao)}${g.visivel ? '' : ' <span class="badge re">oculto</span>'}</h3>
    <span class="count">${plural(g.itens.length, 'item', 'itens')} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  h += `<div class="gg-corpo"><div class="gg-bts">
    <label class="of-sw"><input type="checkbox" role="switch" data-act="guiagrupovis" data-id="${g.id}" ${g.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível</b></label>
    <span class="gg-acoes"><button class="btn small" data-act="guiarenomear" data-id="${g.id}">✎ Renomear</button>
    ${estado.confirm === 'gg:' + g.id ? `<button class="btn small danger" data-act="guiaexcluirgrupo" data-id="${g.id}">Confirmar exclusão</button>` : `<button class="btn small danger" data-act="askdel" data-k="gg:${g.id}">Excluir</button>`}</span></div>`;
  if (estado.confirm === 'gg:' + g.id) h += `<p class="muted gg-aviso">Excluir apaga o grupo e os ${plural(g.itens.length, 'item', 'itens')} dele. Os pedidos já feitos continuam na lista.</p>`;
  if (ui.grupoRen === g.id) {
    h += `<form id="f-guia-ren" class="row" data-id="${g.id}" autocomplete="off"><label class="field" style="flex:1">Descrição do grupo<input type="text" id="gg-ren" maxlength="80" value="${esc(g.descricao)}" required></label>
      <button class="btn primary" type="submit">Salvar</button><button type="button" class="btn" data-act="guiarenomear" data-id="">Cancelar</button></form>`;
  }
  h += g.itens.length ? `<div class="gi-lista">${g.itens.map((i) => `<div class="gi-item gi-adm${i.visivel ? '' : ' oculto'}">${fotoItem(i, 'gi-foto', true)}
      <div class="gi-info"><b>${esc(i.descricao)}</b><span class="gi-valor">${R(i.valor)}</span><span class="muted gi-disp">${plural(i.quantidade, 'disponível', 'disponíveis')}</span>
        <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemvis" data-id="${i.id}" ${i.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><span class="muted">Visível</span></label></div>
      <div class="gi-acao gi-acao-adm"><button class="btn small" data-act="guiaeditaritem" data-id="${i.id}" aria-label="Editar ${esc(i.descricao)}">✎</button>
        ${estado.confirm === 'gi:' + i.id ? `<button class="btn small danger" data-act="guiaexcluiritem" data-id="${i.id}">Excluir?</button>` : `<button class="btn small danger" data-act="askdel" data-k="gi:${i.id}" aria-label="Excluir ${esc(i.descricao)}">✕</button>`}</div>
    </div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum item neste grupo.</p>';
  h += ui.item && ui.item.grupoId === g.id ? formItem(ui.item) : `<button class="btn" data-act="guianovoitem" data-id="${g.id}">+ Cadastrar item</button>`;
  return h + '</div></div>';
}

function cardGrupos(G) {
  return `<div class="card adm"><div class="grp-h"><h2>Grupos</h2><span class="count">${G.grupos.length}</span></div>
    <form id="f-guia-grupo" class="row" autocomplete="off"><label class="field" style="flex:1">Novo grupo<input type="text" id="gg-nova" maxlength="80" placeholder="Descrição do grupo" required></label>
      <button class="btn primary" type="submit">Cadastrar grupo</button></form>
    ${G.grupos.length ? `<div class="gg-lista">${G.grupos.map(grupoAdmin).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum grupo cadastrado ainda.</p>'}</div>`;
}

// Linhas de um pedido por pessoa, com a caixinha de ok e o cancelar.
function listaPedido(linhas) {
  if (!linhas.length) return '<p class="muted" style="margin:0">Nenhum pedido feito ainda.</p>';
  return `<div class="gp-pessoas">${porPessoa(linhas).map((p) => `<div class="gp-pessoa">
    <div class="gp-pessoa-h"><b>${esc(p.nome)}</b><b>${R(p.total)}</b></div>
    <ul class="gp-linhas">${p.linhas.map((l) => `<li class="${l.ok ? 'ok' : ''}">
      <label class="gp-ok"><input type="checkbox" data-act="guiaok" data-id="${l.id}" ${l.ok ? 'checked' : ''} aria-label="Ok: ${esc(p.nome)}, ${esc(l.descricao)}"></label>
      <span class="gp-desc"><b>${l.quantidade}x</b> ${esc(l.descricao)}</span><span class="gp-val">${R(l.valor * l.quantidade)}</span>
      ${estado.confirm === 'gl:' + l.id ? `<button class="btn small danger" data-act="guiacancelar" data-id="${l.id}">Cancelar?</button>` : `<button class="btn small link gp-x" data-act="askdel" data-k="gl:${l.id}" aria-label="Cancelar este pedido">✕</button>`}
    </li>`).join('')}</ul></div>`).join('')}</div>
    <div class="meu-tot"><span>${plural(porPessoa(linhas).length, 'pessoa', 'pessoas')} · ${plural(itensDe(linhas), 'item', 'itens')}</span><b>${R(totalDe(linhas))}</b></div>`;
}

function cardPainel(G) {
  const atual = G.pedidos.find((p) => !p.encerradoEm);
  const ultimo = G.pedidos[0];
  let h = '<div class="card adm"><div class="grp-h"><h2>Painel de pedidos</h2></div>';
  if (atual) {
    h += `<div class="gp-status"><span><span class="badge new">Aberto</span> <b>Pedido nº ${atual.numero}</b> <span class="muted">desde ${dia(atual.criadoEm)}</span></span>
      ${estado.confirm === 'genc' ? `<button class="btn small danger" data-act="guiaencerrar">Confirmar encerramento</button>` : `<button class="btn small danger" data-act="askdel" data-k="genc">Encerrar pedido</button>`}</div>`;
    if (estado.confirm === 'genc') h += '<p class="muted gg-aviso">Depois de encerrar, ninguém pede mais neste número. Para receber pedidos de novo, toque em Novo pedido.</p>';
    h += listaPedido(atual.linhas);
  } else {
    h += `<div class="gp-status"><span class="muted">Nenhum pedido aberto${ultimo ? ` · último: nº ${ultimo.numero}, encerrado em ${dia(ultimo.encerradoEm)}` : ''}.</span>
      <button class="btn small primary" data-act="guianovo">Novo pedido nº ${(ultimo?.numero || 0) + 1}</button></div>`;
  }
  return h + '</div>';
}

function cardFeitos(G) {
  const feitos = G.pedidos.filter((p) => p.encerradoEm);
  let h = `<div class="card adm"><div class="grp-h"><h2>Pedidos encerrados</h2><span class="count">${feitos.length}</span></div>`;
  if (!feitos.length) return h + '<p class="muted" style="margin:0">Nenhum pedido encerrado ainda.</p></div>';
  return h + feitos.map((p) => {
    const aberto = ui.feitos.has(p.numero);
    const nOk = p.linhas.filter((l) => l.ok).length;
    return `<div class="hist-compra"><button class="hc-topo" data-act="guiafeito" data-n="${p.numero}" aria-expanded="${aberto}">
      <span class="hc-tit">Pedido nº ${p.numero}</span><span class="hc-tot">${R(totalDe(p.linhas))} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span>
      <span class="muted hc-sub">encerrado em ${dia(p.encerradoEm)} · ${plural(porPessoa(p.linhas).length, 'pessoa', 'pessoas')} · ${nOk}/${p.linhas.length} ok</span></button>
      ${aberto ? listaPedido(p.linhas) : ''}</div>`;
  }).join('') + '</div>';
}

// Texto e imagem de um pedido para o WhatsApp.
function textoPedido(p) {
  const L = [`*Compras · Pedido nº ${p.numero}*`, p.encerradoEm ? `Encerrado em ${dia(p.encerradoEm)}` : 'Pedido aberto', ''];
  porPessoa(p.linhas).forEach((x) => {
    L.push(`*${x.nome}* · ${R(x.total)}`);
    x.linhas.forEach((l) => L.push(`• ${l.quantidade}x ${l.descricao} · ${R(l.valor * l.quantidade)}`));
    L.push('');
  });
  L.push(`Total: ${R(totalDe(p.linhas))}`);
  return L.join('\n');
}
const dadosImagem = (p) => ({
  rotulo: 'Compras', titulo: `Pedido nº ${p.numero}`, subtitulo: p.encerradoEm ? `Encerrado em ${dia(p.encerradoEm)}` : 'Pedido aberto',
  linhas: porPessoa(p.linhas).map((x) => ({ texto: x.nome, valor: R(x.total), sub: x.linhas.map((l) => `${l.quantidade}x ${l.descricao}`).join(', ') })),
  rodape: `Total: ${R(totalDe(p.linhas))}`,
});

function cardExportar(G) {
  if (!G.pedidos.length) return '';
  const n = G.pedidos.some((p) => p.numero === ui.exportar) ? ui.exportar : G.pedidos[0].numero;
  const p = G.pedidos.find((x) => x.numero === n);
  const txt = textoPedido(p);
  const img = ui.img && ui.img.chave === txt ? ui.img : null;
  return `<div class="card adm"><div class="grp-h"><h2>Exportar pedido</h2></div>
    <label class="field">Pedido<select data-act="guiaexportar">${G.pedidos.map((x) => `<option value="${x.numero}" ${x.numero === n ? 'selected' : ''}>Nº ${x.numero} · ${x.encerradoEm ? 'encerrado em ' + dia(x.encerradoEm) : 'aberto'} · ${plural(porPessoa(x.linhas).length, 'pessoa', 'pessoas')}</option>`).join('')}</select></label>
    ${p.linhas.length ? `<div class="grp exp"><textarea id="gx-txt" readonly aria-label="Pedido nº ${n}">${esc(txt)}</textarea>
      <div class="cp-bts">
        <button class="btn primary" data-act="guiacopiar"><span aria-hidden="true">📋</span> Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>
        <button class="btn" data-act="guiaimg"><span aria-hidden="true">🖼️</span> ${img ? 'Atualizar imagem' : 'Imagem'}</button>
      </div>
      ${img ? `<img class="prev" src="${img.url}" alt="Imagem do pedido nº ${n}">
        <div class="cp-bts"><button class="btn primary" data-act="guiashare"><span aria-hidden="true">📤</span> Compartilhar</button><button class="btn" data-act="guiasalvarimg"><span aria-hidden="true">💾</span> Salvar imagem</button></div>` : ''}
    </div>` : '<p class="muted" style="margin:0">Este pedido não tem nenhuma linha.</p>'}</div>`;
}

// Foto do item em tela cheia (mesmo visual da aba Fotos); tocar em qualquer lugar fecha.
function telaFoto() {
  const i = ui.zoom && acharItem(ui.zoom);
  if (!i?.foto) return '';
  return `<div class="ft-luz" role="dialog" aria-modal="true" aria-label="Foto de ${esc(i.descricao)}" data-act="guiazoomfechar">
    <div class="ft-luz-topo"><span class="ft-luz-tit">${esc(i.descricao)}</span><button class="btn small" data-act="guiazoomfechar" aria-label="Fechar">✕</button></div>
    <div class="ft-luz-img"><img src="${dataUrl(i.foto)}" alt=""></div>
    <div class="ft-luz-rodape"><b>${R(i.valor)}</b><span class="muted">${plural(i.quantidade, 'disponível', 'disponíveis')}</span></div></div>`;
}

export function render() {
  if (estado.guias === null) { carregarGuias(); return '<div class="loading">Carregando as compras…</div>'; }
  const G = estado.guias;
  let h = '<section class="panel">';
  if (admin()) h += cardTopo(G);
  h += cardMeus(G) + cardItens(G);
  if (admin()) h += cardGrupos(G) + cardPainel(G) + cardExportar(G) + cardFeitos(G);
  return h + janelaPedir() + telaFoto() + '</section>';
}

// ---------- foto ----------
// O maior lado vira 900 px (para ver em tela cheia), em JPEG: pequena para guardar no banco.
async function reduzirFoto(arquivo) {
  let img;
  try { img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch {
    const url = URL.createObjectURL(arquivo);
    try { img = new Image(); img.src = url; await img.decode(); } finally { URL.revokeObjectURL(url); }
  }
  const k = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  for (let q = 0.82; q > 0.3; q -= 0.15) {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    if (blob && blob.size <= 140000) {
      return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = erro; r.readAsDataURL(blob); });
    }
  }
  throw new Error('foto grande demais');
}

// ---------- eventos ----------
const fazer = (op, dados) => acaoGuias(op, dados);

// Campos do formulário de item: guardados a cada letra, para um redesenho não apagar.
export function digitando(t) {
  if (ui.item && t.dataset.guia) ui.item[t.dataset.guia] = t.value;
}

export async function enviar(form) {
  if (form.id === 'f-guia-grupo') {
    const campo = document.getElementById('gg-nova');
    if (await fazer('grupo', { descricao: campo.value })) toast('Grupo cadastrado.');
  } else if (form.id === 'f-guia-ren') {
    if (await fazer('grupo', { id: form.dataset.id, descricao: document.getElementById('gg-ren').value })) { ui.grupoRen = null; avisar(); }
  } else if (form.id === 'f-guia-item') {
    const I = ui.item;
    if (!I) return;
    const dados = { descricao: I.descricao, quantidade: I.quantidade, valor: I.valor, visivel: I.visivel };
    if (I.foto !== undefined) dados.foto = I.foto;
    if (I.id) dados.id = I.id; else dados.grupoId = I.grupoId;
    if (await fazer('item', dados)) { toast(I.id ? 'Item salvo.' : 'Item cadastrado.'); ui.item = null; avisar(); }
  }
}

const valorCampo = (v) => Number(v).toFixed(2).replace('.', ',');

export const cliques = {
  guiadobrar(el) { const id = el.dataset.id; if (ui.abertos.has(id)) ui.abertos.delete(id); else ui.abertos.add(id); avisar(); },
  guiafeito(el) { const n = Number(el.dataset.n); if (ui.feitos.has(n)) ui.feitos.delete(n); else ui.feitos.add(n); avisar(); },
  guiarenomear(el) { ui.grupoRen = el.dataset.id || null; avisar(); },
  async guiaexcluirgrupo(el) { if (await fazer('excluirGrupo', { id: el.dataset.id })) { ui.abertos.delete(el.dataset.id); toast('Grupo excluído.'); } },
  guianovoitem(el) { ui.item = { grupoId: el.dataset.id, descricao: '', quantidade: '', valor: '', visivel: true }; avisar(); },
  guiaeditaritem(el) {
    const i = acharItem(el.dataset.id);
    const g = estado.guias.grupos.find((x) => x.itens.includes(i));
    if (i && g) { ui.item = { grupoId: g.id, id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), valor: valorCampo(i.valor), visivel: i.visivel }; avisar(); }
  },
  guiaitemcancel() { ui.item = null; avisar(); },
  guiatirafoto() { if (ui.item) { ui.item.foto = null; avisar(); } },
  async guiaexcluiritem(el) { if (await fazer('excluirItem', { id: el.dataset.id })) toast('Item excluído.'); },
  guiapedir(el) {
    const i = acharItem(el.dataset.id);
    if (!i) return;
    ui.pedir = { itemId: i.id, quantidade: Math.min(ui.qtd[i.id] || 1, i.quantidade) };
    avisar();
  },
  guiapedircancel() { ui.pedir = null; avisar(); },
  guiazoom(el) { ui.zoom = el.dataset.id; avisar(); },
  guiazoomfechar() { ui.zoom = null; avisar(); },
  async guiapedirok() {
    const P = ui.pedir;
    ui.pedir = null;
    if (P && await fazer('pedir', P)) { delete ui.qtd[P.itemId]; toast('Pedido feito.'); }
  },
  async guiacancelar(el) { if (await fazer('cancelar', { id: el.dataset.id })) toast('Pedido cancelado.'); },
  async guiaencerrar() { if (await fazer('encerrar')) toast('Pedido encerrado.'); },
  async guianovo() { if (await fazer('novo')) toast('Novo pedido aberto.'); },
  guiacopiar() {
    const txt = document.getElementById('gx-txt')?.value || '';
    const fb = () => { const t = document.getElementById('gx-txt'); t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado.'), fb); } catch { fb(); }
  },
  async guiaimg() {
    const G = estado.guias;
    const p = G.pedidos.find((x) => x.numero === ui.exportar) || G.pedidos[0];
    try {
      const blob = await gerarImagemLista(dadosImagem(p));
      if (ui.img) URL.revokeObjectURL(ui.img.url);
      ui.img = { chave: textoPedido(p), blob, url: URL.createObjectURL(blob), nome: `pedido-compras-${p.numero}-${hoje()}.png` };
      avisar();
    } catch (e) { toast(e.message); }
  },
  async guiashare() { const i = ui.img; if (i && !(await compartilharImagem(i.blob, i.nome, 'Compras'))) toast('Este aparelho não compartilha imagens daqui. Use Salvar imagem.'); },
  guiasalvarimg() { if (ui.img) baixar(ui.img.url, ui.img.nome); },
};

export const mudancas = {
  async guiapub(t) { if (!(await fazer('publicar', { publicada: t.checked }))) t.checked = !t.checked; },
  async guiagrupovis(t) { if (!(await fazer('grupo', { id: t.dataset.id, visivel: t.checked }))) t.checked = !t.checked; },
  async guiaitemvis(t) { if (!(await fazer('item', { id: t.dataset.id, visivel: t.checked }))) t.checked = !t.checked; },
  guiaitemvisform(t) { if (ui.item) ui.item.visivel = t.checked; },
  async guiaok(t) { if (!(await fazer('ok', { id: t.dataset.id, ok: t.checked }))) t.checked = !t.checked; },
  guiaqtd(t) { ui.qtd[t.dataset.id] = Number(t.value); },
  guiaexportar(t) { ui.exportar = Number(t.value); avisar(); },
  async guiafoto(t) {
    const arq = t.files && t.files[0];
    t.value = '';
    if (!arq || !ui.item) return;
    try { ui.item.foto = await reduzirFoto(arq); } catch { toast('Não consegui abrir essa imagem.'); return; }
    avisar();
  },
};
