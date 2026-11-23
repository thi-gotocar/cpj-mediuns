// Tela "Compras" (pedidos de guias): a pessoa pede os itens à venda; o admin cadastra grupos e itens,
// encerra e começa pedidos (numerados), marca ok em cada linha e exporta a lista.
// Com o Pix ligado pelo root (aba ASAAS), a pessoa paga o que pediu; só o webhook do ASAAS marca como pago.

import { estado, pode, visaoAtiva, carregarGuias, acaoGuias, avisar } from '../estado.js';
import { esc, toast, baixar, hoje } from '../util.js';
import { centavos, reais } from '/shared/ervas.js';
import { gerarImagemLista, compartilharImagem } from '../imagemLista.js';
import { VALORES_DOACAO } from '/shared/fila.js';
import { abrirImagem, reduzirJpeg, base64 } from '../foto.js';

const R = (v) => reais(centavos(v));
const dataUrl = (b64) => 'data:image/jpeg;base64,' + b64;
// A foto do item salvo vem por link próprio (com cache; o ?v= muda quando a foto muda). A prévia do formulário
// (foto escolhida e ainda não salva) continua em base64.
const fotoUrl = (i) => `/api/oferendas?lista=guiaFoto&id=${encodeURIComponent(i.id)}&v=${encodeURIComponent(i.fotoV)}`;
const fonteFoto = (i) => (i.foto ? dataUrl(i.foto) : i.fotoV && i.id ? fotoUrl(i) : '');
const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// Estado só desta tela (volta ao padrão ao trocar de aba, como o estado.guias).
const ui = {
  abertos: new Set(),       // grupos expandidos (admin)
  feitos: new Set(),        // pedidos encerrados expandidos ('número:grupo')
  painel: new Set(),        // grupos abertos no Painel de pedidos (começam minimizados)
  blocos: new Set(),        // blocos de admin abertos ('grupos', 'painel', 'exportar'); começam minimizados
  painelSel: {},            // grupo → 'todos' quando a lista completa por pessoa está aberta no Painel
  itemSel: {},              // grupo → { item, k: 'paga' | 'pend' }: o quadradinho de item aberto no Painel
  minimizados: new Set(),   // blocos que a pessoa minimizou: id do grupo de itens ou 'meus' (Seus pedidos)
  grupoRen: null,           // id do grupo com o ✎ aberto
  item: null,               // formulário de item: { grupoId, id?, descricao, quantidade, valor, visivel, cpj, doacao, foto?: b64 | null }
  carPos: {},               // grupo → rolagem do carrossel (o redesenho recria a tela e voltaria ao primeiro item)
  pagar: null,              // janela de pagamento: { ids das cobranças, novo: aberta logo depois de pedir }
  doa: {},                  // valor digitado por item de doação (antes de Doar)
  pedir: null,              // janela de confirmação: { itemId, quantidade (sempre 1; doação: valor) }
  exportar: null,           // pedido escolhido para exportar ('número:grupo')
  img: null,                // imagem gerada: { chave, blob, url, nome }
  zoom: null,               // id do item com a foto aberta em tela cheia
  pix: null,                // pedido com o campo de CPF aberto (primeiro Pix da pessoa)
  gerando: false,           // link de pagamento sendo gerado (evita toque duplo)
  cpf: '',                  // CPF digitado (guardado para um redesenho não apagar)
  ocupado: null,            // ação enviada ao servidor e ainda sem resposta (trava o duplo clique)
};
export function limpar() {
  ui.abertos.clear(); ui.feitos.clear(); ui.minimizados.clear(); ui.painel.clear(); ui.painelSel = {}; ui.blocos.clear(); ui.itemSel = {};
  Object.assign(ui, { grupoRen: null, item: null, carPos: {}, pagar: null, pedir: null, exportar: null, zoom: null, pix: null, gerando: false, cpf: '', ocupado: null });
  if (ui.img) URL.revokeObjectURL(ui.img.url);
  ui.img = null;
}

const admin = () => pode('guias:gerenciar') && estado.guias?.admin;
// Texto do botão: enquanto a ação dele está no servidor, mostra o "carregando" com a rodinha girando.
const girando = (txt) => `<span class="gi-spin" aria-hidden="true"></span>${txt}`;
const rot = (op, normal, carregando) => (ui.ocupado === op ? girando(carregando) : normal);
// O que a corrente vê (o admin recebe tudo, inclusive o oculto): só grupos e itens visíveis.
const gruposVisiveis = (G) => G.grupos.filter((g) => g.visivel).map((g) => ({ ...g, itens: g.itens.filter((i) => i.visivel) })).filter((g) => g.itens.length);
// Item exclusivo da corrente: o servidor só manda para quem está cadastrado nela (e para quem administra).
const seloCpj = (i) => (i.cpj ? ' <span class="badge rep" title="Só para a corrente">Exclusivo CPJ</span>' : '');
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
  const src = fonteFoto(i);
  const abre = zoom && i.fotoV && i.id ? ` data-act="guiazoom" data-id="${i.id}" role="button" tabindex="0" aria-label="Ver foto de ${esc(i.descricao)}"` : '';
  return `<div class="${cls}${abre ? ' zoom' : ''}"${abre}>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : '<span aria-hidden="true">📿</span>'}</div>`;
}

// Um carrossel por grupo: um cartão por item (foto grande, valor e Pedir), arrastando para o lado; o próximo cartão
// aparece pela metade para mostrar que há mais. Quantidade sempre 1 (quem quer dois pede de novo).
function cartaoItem(i, fechado) {
  // Doação: três balões de valor (tocar já pede a confirmação) ou Outro valor, digitado com centavos (o valor do item
  // vem como sugestão no campo). Doação não tem estoque.
  if (i.doacao) {
    const balao = (v) => `<button type="button" class="gi-doa-b" data-act="guiadoarvalor" data-id="${i.id}" data-v="${v}" ${fechado ? 'disabled' : ''}>${R(v)}</button>`;
    return `<div class="gi-card gi-doa">${fotoItem(i, 'gi-foto gi-card-foto', true)}
      <div class="gi-info"><b>${esc(i.descricao)}${seloCpj(i)}</b><span class="muted gi-disp">Doação · você escolhe o valor</span></div>
      <div class="gi-doa-bs">${VALORES_DOACAO.map(balao).join('')}</div>
      <div class="gi-doa-outro"><label class="gi-doa-v"><span>Outro: R$</span><input type="text" inputmode="decimal" data-guia="doacao" data-id="${i.id}" maxlength="10" placeholder="${esc(Number(i.valor) > 0 ? valorCampo(i.valor) : '0,00')}" value="${esc(ui.doa[i.id] || '')}" aria-label="Outro valor de doação para ${esc(i.descricao)}" ${fechado ? 'disabled' : ''}></label>
        <button class="btn primary small" data-act="guiadoar" data-id="${i.id}" ${fechado ? 'disabled' : ''}>Doar</button></div></div>`;
  }
  const esgotado = i.quantidade < 1;
  return `<div class="gi-card">${fotoItem(i, 'gi-foto gi-card-foto', true)}
    <div class="gi-info"><b>${esc(i.descricao)}${seloCpj(i)}</b>
      <span class="muted gi-disp">${esgotado ? 'Sem estoque' : plural(i.quantidade, 'disponível', 'disponíveis')}</span></div>
    <button class="btn primary gi-pedir" data-act="guiapedir" data-id="${i.id}" ${fechado || esgotado ? 'disabled' : ''}>${esgotado ? 'Esgotado' : `Pedir · ${R(i.valor)}`}</button></div>`;
}

function cardItens(G) {
  const grupos = gruposVisiveis(G);
  // Cada grupo tem o seu pedido: o que está fechado mostra o aviso e não deixa pedir.
  const tudoFechado = grupos.length && grupos.every((g) => !g.aberto);
  let h = tudoFechado ? '<div class="card"><p class="gi-aviso">Os pedidos estão fechados no momento.</p></div>' : '';
  if (!grupos.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum item à venda no momento.</p></div>';
  // Cada bloco pode ser minimizado (começa aberto).
  return h + grupos.map((g) => {
    const fechado = !g.aberto;
    const min = ui.minimizados.has(g.id);
    const n = g.itens.length;
    const cab = `<button class="grp-h dobra" data-act="guiaminimizar" data-id="${g.id}" aria-expanded="${!min}"><h2>${esc(g.descricao)}</h2>
      <span class="count">${plural(n, 'item', 'itens')} <span class="seta" aria-hidden="true">${min ? '▸' : '▾'}</span></span></button>`;
    if (min) return `<div class="card">${cab}</div>`;
    // Com mais de um item: setas e "1 de N" (arrastar também passa; a posição atualiza ao rolar).
    const nav = n > 1 ? `<div class="gi-car-nav"><button type="button" class="btn small" data-act="guiacar" data-g="${g.id}" data-d="-1" aria-label="Item anterior">‹</button>
      <span class="muted" data-car-n="${g.id}">1 de ${n}</span>
      <button type="button" class="btn small" data-act="guiacar" data-g="${g.id}" data-d="1" aria-label="Próximo item">›</button></div>` : '';
    return `<div class="card">${cab}${fechado && !tudoFechado ? '<p class="gi-aviso">Os pedidos deste grupo estão fechados no momento.</p>' : ''}
      <div class="gi-car${n === 1 ? ' gi-car-1' : ''}" data-car="${g.id}">${g.itens.map((i) => cartaoItem(i, fechado)).join('')}</div>${nav}</div>`;
  }).join('');
}

// O redesenho recria o carrossel no começo: devolve a rolagem de antes e acerta o "N de M".
function contarCarrossel(el) {
  const cards = el.children;
  if (!cards.length) return;
  const passo = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : el.clientWidth;
  const k = Math.min(cards.length, Math.round(el.scrollLeft / Math.max(passo, 1)) + 1);
  const rot = document.querySelector(`[data-car-n="${el.dataset.car}"]`);
  if (rot) rot.textContent = `${k} de ${cards.length}`;
}
function restaurarCarrosseis() {
  document.querySelectorAll('.gi-car[data-car]').forEach((el) => {
    const pos = ui.carPos[el.dataset.car];
    if (pos) el.scrollLeft = pos;
    contarCarrossel(el);
  });
}
// A rolagem não sobe pelo DOM: escuta na fase de captura, uma vez só.
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!(el instanceof Element) || !el.matches('.gi-car[data-car]')) return;
  ui.carPos[el.dataset.car] = el.scrollLeft;
  contarCarrossel(el);
}, { capture: true, passive: true });

// Situação de pagamento da linha (só existe com o Pix): é o que avisa quem comprou.
const SELO = { pendente: ['Aguardando pagamento', 'new'], vencida: ['Link vencido', 're'], cancelada: ['Link cancelado', 're'], estornada: ['Estornado', 're'] };
const selo = (l) => {
  if (l.pago) return ' <span class="badge pleno">Pago</span>';
  const s = SELO[l.pix];
  return s ? ` <span class="badge ${s[1]}">${s[0]}</span>` : '';
};

// Uma cobrança pendente, na janela de pagamento: link, QR, copia e cola e vencimento.
function cobrancaPix(c) {
  const cc = 'gp-cc-' + c.id;
  return `<div class="gi-pix">
    <div class="gi-pix-h"><b>Pagamento · pedido nº ${c.pedido}</b><b>${R(c.valor)}</b></div>
    ${c.itens?.length ? `<span class="muted">${esc(c.itens.join(', '))}</span>` : ''}
    ${c.link ? `<a class="btn primary" href="${esc(c.link)}" target="_blank" rel="noopener">${c.forma === 'UNDEFINED' ? 'Pagar pelo link (Pix ou cartão de crédito)' : 'Pagar pelo link (Pix)'}</a>` : ''}
    ${c.pixImagem ? `<img class="gi-pix-qr" src="data:image/png;base64,${c.pixImagem}" alt="QR Code do Pix de ${R(c.valor)}">` : ''}
    ${c.pixPayload ? `<label class="field">Pix copia e cola<textarea id="${cc}" readonly rows="3">${esc(c.pixPayload)}</textarea></label>
      <div class="cp-bts"><button class="btn" data-act="guiapixcopiar" data-cc="${cc}"><span aria-hidden="true">📋</span> Copiar código Pix</button></div>` : ''}
    ${c.vencimento ? `<span class="muted">Vence em ${dia(c.vencimento + 'T12:00:00')}.</span>` : ''}
    <p class="muted" style="margin:0">Depois de pagar, a confirmação chega sozinha do banco (pode levar alguns minutos).</p>
    <button class="btn small" data-act="guiapixatualizar">${rot('atualizar', '↻ Já paguei, atualizar', 'Atualizando…')}</button></div>`;
}

// Link de pagamento: cobranças pendentes (link, QR e copia e cola) e, para o que ficou sem link
// (o ASAAS falhou no Pedir, ou o link venceu ou foi cancelado), o botão para gerar de novo.
function blocoPix(G) {
  if (!G.pix) return '';
  const M = G.meus || [];
  const pendentes = (G.cobrancas || []).filter((c) => c.status === 'pendente');
  // No bloco, uma linha por link (o QR e o copia e cola abrem na janela, para não empurrar os itens para baixo).
  let h = pendentes.map((c) => `<div class="gi-pix-linha"><span><b>Pedido nº ${c.pedido} · ${R(c.valor)}</b>
      ${c.itens?.length ? `<span class="muted">${esc(c.itens.join(', '))}</span>` : ''}</span>
    <button class="btn primary small" data-act="guiapagarabrir" data-id="${c.id}">Pagar</button></div>`).join('');
  // O que ainda não está pago nem num link pendente, por pedido. Linha "pendente" sem link na tela é a reserva
  // de uma tentativa em que o ASAAS demorou: o botão aparece e o servidor confere no ASAAS antes de gerar outro.
  const comLink = new Set(pendentes.map((c) => c.pedido));
  const porPedido = new Map();
  M.filter((l) => !l.pago && (l.pix !== 'pendente' || !comLink.has(l.pedido))).forEach((l) => porPedido.set(l.pedido, (porPedido.get(l.pedido) || 0) + l.valor * l.quantidade));
  [...porPedido].filter(([, v]) => v > 0).sort((a, b) => a[0] - b[0]).forEach(([n, v]) => {
    if (ui.pix === n) {
      h += `<form id="f-guia-pix" class="gi-pix" data-pedido="${n}" autocomplete="off">
        <div class="gi-pix-h"><b>Pagar pedido nº ${n}</b><b>${R(v)}</b></div>
        ${campoCpf('gp-cpf')}
        <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-act="guiapixcancel">Voltar</button><button class="btn primary" type="submit" ${ui.gerando ? 'disabled' : ''}>${ui.gerando ? girando('Gerando…') : 'Gerar link'}</button></div></form>`;
    } else {
      h += `<button class="btn primary gi-pix-bt" data-act="guiapix" data-n="${n}" ${ui.gerando ? 'disabled' : ''}>${ui.gerando ? girando('Gerando link…') : `Gerar link de pagamento · pedido nº ${n} · ${R(v)}`}</button>`;
    }
  });
  return h;
}

// CPF: pedido só no primeiro link da pessoa; vai direto para o ASAAS (o app não guarda).
const campoCpf = (id) => `<label class="field">Seu CPF (só no primeiro pagamento; vai direto para o ASAAS)<input type="text" id="${id}" data-guia="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${esc(ui.cpf)}" required></label>`;

function cardMeus(G) {
  const M = G.meus || [];
  const lista = M.length
    ? `<ul class="gi-meus">${M.map((l) => `<li><span class="gi-meu-desc"><b>${esc(l.descricao)}</b><span class="muted">Pedido nº ${l.pedido}${selo(l)}</span></span>
        <span class="gi-meu-val">${l.quantidade}x · <b>${R(l.valor * l.quantidade)}</b></span></li>`).join('')}</ul>
       <div class="meu-tot"><span>Valor total</span><b>${R(totalDe(M))}</b></div>`
    : '<p class="muted" style="margin:0">Você ainda não fez nenhum pedido.</p>';
  // Pode ser minimizado (começa aberto, como os blocos de itens); minimizado, mostra quantos itens e o total.
  const min = ui.minimizados.has('meus');
  const cab = `<button class="grp-h dobra" data-act="guiaminimizar" data-id="meus" aria-expanded="${!min}"><h2>Seus pedidos</h2>
    <span class="count">${min && M.length ? `${plural(itensDe(M), 'item', 'itens')} · ${R(totalDe(M))} ` : ''}<span class="seta" aria-hidden="true">${min ? '▸' : '▾'}</span></span></button>`;
  if (min) return `<div class="card">${cab}</div>`;
  return `<div class="card">${cab}${lista}
    <p class="gi-suporte">* Para cancelar, entre em contato com o suporte.</p></div>`;
}

// 💳 Falta pagar: no topo da aba, só quando há link aguardando pagamento ou pedido sem link (com o Pix ligado).
function cardPagar(G) {
  const pix = blocoPix(G);
  if (!pix) return '';
  return `<div class="card gi-pagar" id="gi-pagar"><div class="grp-h"><h2>💳 Falta pagar</h2></div>${pix}</div>`;
}

// Janela aberta logo depois de pedir (ou de gerar o link): o pagamento ali mesmo, sem procurar na tela.
// Fechar não perde nada: o pagamento continua no Falta pagar.
function janelaPagar() {
  if (!ui.pagar || !estado.guias) return '';
  const C = ui.pagar.ids.map((id) => (estado.guias.cobrancas || []).find((c) => c.id === id)).filter(Boolean);
  const pend = C.filter((c) => c.status === 'pendente');
  const pagas = C.filter((c) => c.status === 'paga');
  if (!pend.length && !pagas.length) return '';
  return `<div class="modal-fundo gi-pagar-fundo" role="dialog" aria-modal="true" aria-labelledby="gpm-t"><div class="modal gi-pagar-modal">
    <h3 id="gpm-t">${!pend.length ? 'Pagamento confirmado' : ui.pagar.novo ? 'Pedido feito! Agora é só pagar' : 'Pagamento'}</h3>
    ${pagas.map((c) => `<p style="margin:0">✅ Pedido nº ${c.pedido} · ${R(c.valor)} pago.</p>`).join('')}
    ${pend.map((c) => cobrancaPix(c)).join('')}
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="guiapagarfechar">${pend.length ? 'Pagar depois' : 'Fechar'}</button></div>
  </div></div>`;
}

function janelaPedir() {
  const P = ui.pedir;
  const i = P && acharItem(P.itemId);
  if (!i) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="gp-t"><div class="modal">
    <h3 id="gp-t">${P.valor ? 'Confirmar doação?' : 'Confirmar pedido?'}</h3>
    <p style="margin:0"><b>${esc(i.descricao)}</b> · ${R(P.valor || i.valor)}</p>
    ${estado.guias.pix ? `<p class="muted" style="margin:0">Ao confirmar, geramos o link de pagamento Pix (ASAAS). O pedido aparece como pago quando o banco confirmar.</p>
      ${estado.guias.pixPrecisaCpf ? campoCpf('gp-cpf-pedir') : ''}` : ''}
    <p class="muted" style="margin:0">Para cancelar depois, só entrando em contato com o suporte.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="guiapedircancel">Voltar</button><button class="btn primary" data-act="guiapedirok" ${ui.gerando ? 'disabled' : ''}>${ui.gerando ? girando(estado.guias.pix ? 'Gerando link…' : 'Enviando…') : P.valor ? 'Confirmar doação' : 'Confirmar pedido'}</button></div>
  </div></div>`;
}

// ---------- admin ----------
function cardTopo(G) {
  return `<div class="card adm ervas-pub"><label class="of-sw"><input type="checkbox" role="switch" data-act="guiapub" ${G.publicada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label></div>`;
}

function formItem(I) {
  // Foto nova escolhida (ou removida) no formulário; senão, a do item salvo.
  const salvo = I.id ? acharItem(I.id) : null;
  const fonte = I.foto !== undefined ? (I.foto ? { foto: I.foto } : null) : (salvo?.fotoV ? salvo : null);
  const temFoto = !!fonte;
  return `<form id="f-guia-item" class="gi-form" autocomplete="off">
    <h3>${I.id ? 'Editar item' : 'Novo item'}</h3>
    <label class="field">Descrição<input type="text" id="gi-desc" data-guia="descricao" maxlength="120" value="${esc(I.descricao)}" required></label>
    <div class="gi-foto-campo">${fotoItem(fonte ? { foto: fonte.foto, id: fonte.id, fotoV: fonte.fotoV } : {}, 'gi-foto')}
      <label class="btn small">📷 ${temFoto ? 'Trocar foto' : 'Pôr foto'}<input type="file" accept="image/*" data-act="guiafoto" hidden></label>
      ${temFoto ? '<button type="button" class="btn link" data-act="guiatirafoto">Remover</button>' : ''}</div>
    <div class="row gi-nums">
      ${I.doacao ? '' : `<label class="field">Quantidade disponível<input type="number" id="gi-qtd" data-guia="quantidade" min="0" max="9999" inputmode="numeric" value="${esc(I.quantidade)}" required></label>`}
      ${I.doacao
        ? `<label class="field">Valor sugerido (R$)<input type="text" id="gi-valor" data-guia="valor" inputmode="decimal" placeholder="opcional" value="${esc(Number(String(I.valor).replace(',', '.')) > 0 ? I.valor : '')}"></label>`
        : `<label class="field">Valor (R$)<input type="text" id="gi-valor" data-guia="valor" inputmode="decimal" placeholder="0,00" value="${esc(I.valor)}" required></label>`}
    </div>
    ${I.doacao ? '<p class="muted" style="margin:0;font-size:.85rem">Doação: quem pede digita o valor; o sugerido aparece no campo. Sem quantidade nem estoque.</p>' : ''}
    <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemvisform" ${I.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível</b></label>
    <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemcpjform" ${I.cpj ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>CPJ</b> <span class="muted">— produto e preço só para a corrente</span></label>
    <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemdoacaoform" ${I.doacao ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Doação</b> <span class="muted">— o Pix vai para a conta B do ASAAS</span></label>
    <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-act="guiaitemcancel">Cancelar</button><button class="btn primary" type="submit">${rot('item', 'Salvar item', 'Salvando…')}</button></div>
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
    ${estado.confirm === 'gg:' + g.id ? `<button class="btn small danger" data-act="guiaexcluirgrupo" data-id="${g.id}">${rot('excluirGrupo', 'Confirmar exclusão', 'Excluindo…')}</button>` : `<button class="btn small danger" data-act="askdel" data-k="gg:${g.id}">Excluir</button>`}</span></div>`;
  if (estado.confirm === 'gg:' + g.id) h += `<p class="muted gg-aviso">Excluir apaga o grupo e os ${plural(g.itens.length, 'item', 'itens')} dele. Os pedidos já feitos continuam na lista.</p>`;
  if (ui.grupoRen === g.id) {
    h += `<form id="f-guia-ren" class="row" data-id="${g.id}" autocomplete="off"><label class="field" style="flex:1">Descrição do grupo<input type="text" id="gg-ren" maxlength="80" value="${esc(g.descricao)}" required></label>
      <button class="btn primary" type="submit">${rot('grupo', 'Salvar', 'Salvando…')}</button><button type="button" class="btn" data-act="guiarenomear" data-id="">Cancelar</button></form>`;
  }
  h += g.itens.length ? `<div class="gi-lista">${g.itens.map((i) => `<div class="gi-item gi-adm${i.visivel ? '' : ' oculto'}">${fotoItem(i, 'gi-foto', true)}
      <div class="gi-info"><b>${esc(i.descricao)}${seloCpj(i)}${i.doacao ? ' <span class="badge new" title="Cobrado na conta B do ASAAS">Doação</span>' : ''}</b><span class="gi-valor">${i.doacao ? (Number(i.valor) > 0 ? `${R(i.valor)} <small class="muted">sugerido</small>` : 'Valor livre') : R(i.valor)}</span><span class="muted gi-disp">${i.doacao ? 'Doação · sem estoque' : plural(i.quantidade, 'disponível', 'disponíveis')}</span>
        <label class="of-sw"><input type="checkbox" role="switch" data-act="guiaitemvis" data-id="${i.id}" ${i.visivel ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><span class="muted">Visível</span></label></div>
      <div class="gi-acao gi-acao-adm"><button class="btn small" data-act="guiaeditaritem" data-id="${i.id}" aria-label="Editar ${esc(i.descricao)}">✎</button>
        ${estado.confirm === 'gi:' + i.id ? `<button class="btn small danger" data-act="guiaexcluiritem" data-id="${i.id}">${rot('excluirItem', 'Excluir?', 'Excluindo…')}</button>` : `<button class="btn small danger" data-act="askdel" data-k="gi:${i.id}" aria-label="Excluir ${esc(i.descricao)}">✕</button>`}</div>
    </div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum item neste grupo.</p>';
  h += ui.item && ui.item.grupoId === g.id ? formItem(ui.item) : `<button class="btn" data-act="guianovoitem" data-id="${g.id}">+ Cadastrar item</button>`;
  return h + '</div></div>';
}

// Cabeçalho de bloco de admin que abre e fecha (Cadastro de grupos e itens, Exportar pedido): começa minimizado.
const cabBloco = (k, titulo, count = '') => {
  const ab = ui.blocos.has(k);
  return `<button class="grp-h dobra" data-act="guiabloco" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
};

function cardGrupos(G) {
  // Com um item em edição, fica aberto (senão o formulário sumiria).
  const ab = ui.blocos.has('grupos') || !!ui.item || !!ui.grupoRen;
  if (!ab) return `<div class="card adm">${cabBloco('grupos', 'Cadastro de grupos e itens', G.grupos.length)}</div>`;
  return `<div class="card adm">${cabBloco('grupos', 'Cadastro de grupos e itens', G.grupos.length)}
    <form id="f-guia-grupo" class="row" autocomplete="off"><label class="field" style="flex:1">Novo grupo<input type="text" id="gg-nova" maxlength="80" placeholder="Descrição do grupo" required></label>
      <button class="btn primary" type="submit">${rot('grupo', 'Cadastrar grupo', 'Salvando…')}</button></form>
    ${G.grupos.length ? `<div class="gg-lista">${G.grupos.map(grupoAdmin).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum grupo cadastrado ainda.</p>'}</div>`;
}

// ---------- pedidos por grupo ----------
// Cada grupo tem o seu pedido. Um pedido pode atender mais de um grupo (o que estava aberto antes dessa mudança):
// cada par pedido + grupo vira uma "rodada", com as linhas daquele grupo. Linhas sem grupo (grupo excluído) ficam em "Outros".
function rodadas(G) {
  const nomeGrupo = Object.fromEntries(G.grupos.map((g) => [g.id, g.descricao]));
  const R = [];
  G.pedidos.forEach((p) => {
    const ids = new Set();
    (p.grupos || []).forEach((pg) => {
      ids.add(pg.grupoId);
      R.push({ chave: `${p.numero}:${pg.grupoId}`, numero: p.numero, grupoId: pg.grupoId, nome: nomeGrupo[pg.grupoId] || 'Outros',
        criadoEm: pg.criadoEm || p.criadoEm, encerradoEm: pg.encerradoEm, linhas: p.linhas.filter((l) => l.grupoId === pg.grupoId) });
    });
    const soltas = p.linhas.filter((l) => !ids.has(l.grupoId));
    if (soltas.length) R.push({ chave: `${p.numero}:`, numero: p.numero, grupoId: null, nome: 'Outros', criadoEm: p.criadoEm, encerradoEm: p.encerradoEm || p.criadoEm, linhas: soltas });
  });
  return R;
}
const proximoNumero = (G) => Math.max(0, ...G.pedidos.map((p) => p.numero)) + 1;

const sitLinha = (l) => (l.pago ? 'paga' : l.pix === 'pendente' ? 'pendente' : l.pix === 'vencida' ? 'vencida'
  : l.pix === 'cancelada' || l.pix === 'estornada' ? 'cancelada' : 'semlink');

// Situação de cada linha e a da pessoa (a pior das linhas dela): define a cor da faixa à esquerda e o selo.
const SIT = {
  vencida: { ordem: 0, rot: 'Atrasado', cls: 'atr' }, semlink: { ordem: 1, rot: 'Sem link', cls: 'canc' },
  cancelada: { ordem: 2, rot: 'Cancelado', cls: 'canc' }, pendente: { ordem: 3, rot: 'Pendente', cls: 'pend' },
  paga: { ordem: 4, rot: 'Pago', cls: 'ok' },
};
const seloSit = (k) => `<span class="gp-sit gp-sit-${SIT[k].cls}">${SIT[k].rot}</span>`;
function situacao(x) {
  const ks = [...new Set(x.linhas.map(sitLinha))];
  const pior = ks.sort((a, b) => SIT[a].ordem - SIT[b].ordem)[0];
  return { k: pior, ordem: SIT[pior].ordem, unica: ks.length === 1 };
}
// Quem precisa de atenção primeiro (atrasado, sem link, cancelado), depois pendente e, no fim, quem pagou tudo.
const porSituacao = (linhas) => porPessoa(linhas).map((x) => ({ ...x, sit: situacao(x) }))
  .sort((a, b) => a.sit.ordem - b.sit.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));

// Lista compacta para o celular: uma faixa por pessoa (cor da situação à esquerda), separadas por borda.
// O selo da situação aparece uma vez: no nome, quando todas as linhas da pessoa estão na mesma situação;
// senão, em cada linha. Dentro do grupo, a linha não repete o nome do grupo ("Guias · Guia verde" vira "Guia verde")
// e, com um item só, o valor fica só no total da pessoa.
function listaPedido(linhas, grupo = '') {
  if (!linhas.length) return '<p class="muted" style="margin:0">Nenhum pedido feito ainda.</p>';
  const pessoas = porSituacao(linhas);
  const semGrupo = (d) => (grupo && d.startsWith(grupo + ' · ') ? d.slice(grupo.length + 3) : d);
  return `<div class="gp-lista">${pessoas.map((p) => `<div class="gp-row gp-sit-borda-${SIT[p.sit.k].cls}">
    <div class="gp-row-h"><b>${esc(p.nome)}</b>${p.sit.unica ? seloSit(p.sit.k) : ''}<b class="gp-row-t">${R(p.total)}</b></div>
    ${p.linhas.map((l) => `<div class="gp-row-l"><span class="gp-desc">${l.quantidade}x ${esc(semGrupo(l.descricao))}${p.sit.unica ? '' : ' ' + seloSit(sitLinha(l))}</span>
      <span class="gp-val">${p.linhas.length > 1 ? R(l.valor * l.quantidade) : ''}</span>
      ${estado.confirm === 'gl:' + l.id ? `<button class="btn small danger" data-act="guiacancelar" data-id="${l.id}">${rot('cancelar', 'Cancelar?', 'Cancelando…')}</button>` : `<button class="btn small link gp-x" data-act="askdel" data-k="gl:${l.id}" aria-label="Cancelar este pedido">✕</button>`}</div>`).join('')}
  </div>`).join('')}</div>
    <div class="meu-tot"><span>${plural(pessoas.length, 'pessoa', 'pessoas')} · ${plural(itensDe(linhas), 'item', 'itens')}</span><b>${R(totalDe(linhas))}</b></div>`;
}

// Visão por item (a descrição do item do grupo): quanto foi pedido de cada um e por quem. Cada item começa minimizado
// e mostra a quantidade total, quantas pessoas e o valor; aberto, cada pessoa com a quantidade e a situação.
// Ordem: o item mais pedido primeiro.
function porItem(linhas, grupo) {
  const semGrupo = (d) => (grupo && d.startsWith(grupo + ' · ') ? d.slice(grupo.length + 3) : d);
  const m = new Map();
  linhas.forEach((l) => {
    const nome = semGrupo(l.descricao);
    const k = nome.toLocaleLowerCase('pt-BR');
    if (!m.has(k)) m.set(k, { nome, linhas: [], qtd: 0, total: 0 });
    const x = m.get(k);
    x.linhas.push(l);
    x.qtd += l.quantidade;
    x.total += l.valor * l.quantidade;
  });
  return [...m.values()].sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));
}
// Painel do grupo: um bloco por item, cada um com dois quadradinhos — Pago (verde) e Pendente (amarelo; tudo o que
// ainda não foi pago: link aguardando, atrasado, cancelado ou sem link), com quantas unidades. Tocar num deles abre,
// embaixo do item, a lista normal (por pessoa, com a situação de cada uma); tocar de novo fecha. Um aberto por grupo.
function itensDoPedido(g, linhas) {
  const aberto = ui.itemSel[g.id];
  const itens = porItem(linhas, g.descricao);
  return `<div class="gp-itens">${itens.map((it) => {
    const pagas = it.linhas.filter((l) => l.pago);
    const pend = it.linhas.filter((l) => !l.pago);
    const un = (L) => L.reduce((a, l) => a + l.quantidade, 0);
    const quadro = (k, rot, cls, L) => {
      const sel = aberto?.item === it.nome && aberto.k === k;
      return `<button type="button" class="pf-of-total ${cls}${sel ? ' selecionado' : ''}" data-act="guiaitemsit" data-g="${g.id}" data-item="${esc(it.nome)}" data-k="${k}" aria-expanded="${sel}" aria-label="${esc(it.nome)}: ${un(L)} ${rot.toLowerCase()}" ${L.length ? '' : 'disabled'}><b>${un(L)}</b><span>${rot} · ${R(totalDe(L))}</span></button>`;
    };
    const lista = aberto?.item === it.nome ? (aberto.k === 'paga' ? pagas : pend) : null;
    return `<div class="gp-item">
      <div class="gp-item-t"><b>${esc(it.nome)}</b><span class="muted">${it.qtd}x · ${R(it.total)}</span></div>
      <div class="pf-of-totais gp-item-q">${quadro('paga', 'Pago', 'as-q-ok', pagas)}${quadro('pend', 'Pendente', 'as-q-pend', pend)}</div>
      ${lista?.length ? listaPedido(lista, g.descricao) : ''}
    </div>`;
  }).join('')}</div>`;
}

// Painel de pedidos: um bloco por grupo, começando minimizado. Minimizado, mostra o pedido aberto e quantas pessoas
// (o quanto falta pagar ficava longo demais no celular). Aberto: Encerrar / Novo pedido do grupo e a lista por pessoa.
function cardPainel(G) {
  if (!G.grupos.length) return '';
  // Começa minimizado (como o Cadastro e o Exportar), toda vez que a aba abre.
  const cab = cabBloco('painel', 'Painel de pedidos', plural(G.grupos.length, 'grupo', 'grupos'));
  if (!ui.blocos.has('painel')) return `<div class="card adm">${cab}</div>`;
  const R0 = rodadas(G);
  const prox = proximoNumero(G);
  const blocos = G.grupos.map((g) => {
    const r = R0.find((x) => x.grupoId === g.id && x.numero === g.aberto && !x.encerradoEm);
    const aberto = ui.painel.has(g.id);
    const pessoas = r ? porPessoa(r.linhas).length : 0;
    const resumo = r ? `Nº ${r.numero} · ${plural(pessoas, 'pessoa', 'pessoas')}` : 'Fechado';
    const cab = `<button class="grp-h dobra gp-grupo-h" data-act="guiapainel" data-id="${g.id}" aria-expanded="${aberto}"><h3>${esc(g.descricao)}</h3>
      <span class="count">${r ? '<span class="badge new">Aberto</span> ' : ''}${resumo} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
    if (!aberto) return `<div class="gp-grupo">${cab}</div>`;
    let h = `<div class="gp-grupo">${cab}<div class="gp-grupo-c">`;
    if (r) {
      const k = 'genc:' + g.id;
      h += `<div class="gp-status"><span><b>Pedido nº ${r.numero}</b> <span class="muted">desde ${dia(r.criadoEm)}</span></span>
        ${estado.confirm === k ? `<button class="btn small danger" data-act="guiaencerrar" data-id="${g.id}">${rot('encerrar', 'Confirmar encerramento', 'Encerrando…')}</button>` : `<button class="btn small danger" data-act="askdel" data-k="${k}">Encerrar pedido</button>`}</div>`;
      if (estado.confirm === k) h += `<p class="muted gg-aviso">Depois de encerrar, ninguém pede mais itens de ${esc(g.descricao)} neste número. Os outros grupos continuam como estão.</p>`;
      const sel = ui.painelSel[g.id];
      if (!r.linhas.length) h += listaPedido([]);
      else {
        h += itensDoPedido(g, r.linhas);
        h += `<button type="button" class="btn link small gp-todos" data-act="guiaquadro" data-id="${g.id}" data-k="todos" aria-expanded="${sel === 'todos'}">${sel === 'todos' ? '▾ Recolher a lista por pessoa' : `▸ Lista completa por pessoa (${porPessoa(r.linhas).length})`}</button>`;
        if (sel === 'todos') h += listaPedido(r.linhas, g.descricao);
        h += `<div class="meu-tot"><span>${plural(porPessoa(r.linhas).length, 'pessoa', 'pessoas')} · ${plural(itensDe(r.linhas), 'unidade', 'unidades')}</span><b>${R(totalDe(r.linhas))}</b></div>`;
      }
    } else {
      const ultimo = R0.find((x) => x.grupoId === g.id && x.encerradoEm);
      const k = 'gnovo:' + g.id;
      h += `<div class="gp-status"><span class="muted">Nenhum pedido aberto${ultimo ? ` · último: nº ${ultimo.numero}, encerrado em ${dia(ultimo.encerradoEm)}` : ''}.</span>
        ${estado.confirm === k ? `<button class="btn small primary" data-act="guianovo" data-id="${g.id}">${rot('novo', `Confirmar novo pedido nº ${prox}`, 'Abrindo…')}</button>` : `<button class="btn small primary" data-act="askdel" data-k="${k}">Novo pedido nº ${prox}</button>`}</div>`;
      if (estado.confirm === k) h += `<p class="muted gg-aviso">O pedido novo passa a receber os pedidos de ${esc(g.descricao)}. O número não volta atrás.</p>`;
    }
    return h + '</div></div>';
  }).join('');
  return `<div class="card adm">${cab}<div class="gp-grupos">${blocos}</div></div>`;
}

// Pedidos encerrados: por grupo e número, do mais recente para o mais antigo; cada um começa minimizado.
function cardFeitos(G) {
  const feitos = rodadas(G).filter((r) => r.encerradoEm && r.linhas.length);
  let h = `<div class="card adm"><div class="grp-h"><h2>Pedidos encerrados</h2><span class="count">${feitos.length}</span></div>`;
  if (!feitos.length) return h + '<p class="muted" style="margin:0">Nenhum pedido encerrado ainda.</p></div>';
  return h + feitos.map((p) => {
    const aberto = ui.feitos.has(p.chave);
    return `<div class="hist-compra"><button class="hc-topo" data-act="guiafeito" data-n="${p.chave}" aria-expanded="${aberto}">
      <span class="hc-tit">${esc(p.nome)} · Pedido nº ${p.numero}</span><span class="hc-tot">${R(totalDe(p.linhas))} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span>
      <span class="muted hc-sub">encerrado em ${dia(p.encerradoEm)} · ${plural(porPessoa(p.linhas).length, 'pessoa', 'pessoas')}</span></button>
      ${aberto ? listaPedido(p.linhas, p.nome) : ''}</div>`;
  }).join('') + '</div>';
}

// Texto e imagem de um pedido de um grupo para o WhatsApp.
function textoPedido(p) {
  const L = [`*Compras · ${p.nome} · Pedido nº ${p.numero}*`, p.encerradoEm ? `Encerrado em ${dia(p.encerradoEm)}` : 'Pedido aberto', ''];
  porPessoa(p.linhas).forEach((x) => {
    L.push(`*${x.nome}* · ${R(x.total)}`);
    x.linhas.forEach((l) => L.push(`• ${l.quantidade}x ${l.descricao} · ${R(l.valor * l.quantidade)}`));
    L.push('');
  });
  L.push(`Total: ${R(totalDe(p.linhas))}`);
  return L.join('\n');
}
const dadosImagem = (p) => ({
  rotulo: `Compras · ${p.nome}`, titulo: `Pedido nº ${p.numero}`, subtitulo: p.encerradoEm ? `Encerrado em ${dia(p.encerradoEm)}` : 'Pedido aberto',
  linhas: porPessoa(p.linhas).map((x) => ({ texto: x.nome, valor: R(x.total), sub: x.linhas.map((l) => `${l.quantidade}x ${l.descricao}`).join(', ') })),
  rodape: `Total: ${R(totalDe(p.linhas))}`,
});

// Exportar: escolhe o grupo e, dentro dele, o pedido (o aberto primeiro).
const rodadasExportar = (G) => rodadas(G).filter((r) => !r.encerradoEm || r.linhas.length);
function exportarEscolhido(G) {
  const L = rodadasExportar(G);
  return L.find((r) => r.chave === ui.exportar) || L[0] || null;
}
function cardExportar(G) {
  const p = exportarEscolhido(G);
  if (!p) return '';
  const L = rodadasExportar(G);
  const grupos = [...new Map(L.map((r) => [String(r.grupoId), r.nome])).entries()];
  const doGrupo = L.filter((r) => String(r.grupoId) === String(p.grupoId));
  const txt = textoPedido(p);
  const img = ui.img && ui.img.chave === txt ? ui.img : null;
  if (!ui.blocos.has('exportar')) return `<div class="card adm">${cabBloco('exportar', 'Exportar pedido')}</div>`;
  return `<div class="card adm">${cabBloco('exportar', 'Exportar pedido')}
    <div class="row gx-sel">
      <label class="field">Grupo<select data-act="guiaexpgrupo">${grupos.map(([id, nome]) => `<option value="${esc(id)}" ${id === String(p.grupoId) ? 'selected' : ''}>${esc(nome)}</option>`).join('')}</select></label>
      <label class="field">Pedido<select data-act="guiaexportar">${doGrupo.map((x) => `<option value="${esc(x.chave)}" ${x.chave === p.chave ? 'selected' : ''}>Nº ${x.numero} · ${x.encerradoEm ? 'encerrado em ' + dia(x.encerradoEm) : 'aberto'} · ${plural(porPessoa(x.linhas).length, 'pessoa', 'pessoas')}</option>`).join('')}</select></label>
    </div>
    ${p.linhas.length ? `<div class="grp exp"><textarea id="gx-txt" readonly aria-label="${esc(p.nome)}, pedido nº ${p.numero}">${esc(txt)}</textarea>
      <div class="cp-bts">
        <button class="btn primary" data-act="guiacopiar"><span aria-hidden="true">📋</span> Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener"><span aria-hidden="true">💬</span> WhatsApp</a>
        <button class="btn" data-act="guiaimg"><span aria-hidden="true">🖼️</span> ${img ? 'Atualizar imagem' : 'Imagem'}</button>
      </div>
      ${img ? `<img class="prev" src="${img.url}" alt="Imagem do pedido nº ${p.numero}">
        <div class="cp-bts"><button class="btn primary" data-act="guiashare"><span aria-hidden="true">📤</span> Compartilhar</button><button class="btn" data-act="guiasalvarimg"><span aria-hidden="true">💾</span> Salvar imagem</button></div>` : ''}
    </div>` : '<p class="muted" style="margin:0">Este pedido não tem nenhuma linha.</p>'}</div>`;
}

// Foto do item em tela cheia (mesmo visual da aba Fotos); tocar em qualquer lugar fecha.
function telaFoto() {
  const i = ui.zoom && acharItem(ui.zoom);
  if (!i?.fotoV) return '';
  return `<div class="ft-luz" role="dialog" aria-modal="true" aria-label="Foto de ${esc(i.descricao)}" data-act="guiazoomfechar">
    <div class="ft-luz-topo"><span class="ft-luz-tit">${esc(i.descricao)}</span><button class="btn small" data-act="guiazoomfechar" aria-label="Fechar">✕</button></div>
    <div class="ft-luz-img"><img src="${esc(fotoUrl(i))}" alt=""></div>
    <div class="ft-luz-rodape"><b>${R(i.valor)}</b><span class="muted">${plural(i.quantidade, 'disponível', 'disponíveis')}</span></div></div>`;
}

// Como no Perfil: quem entra pela corrente (acesso cpj) ou como aluno, sem senha, vê o aviso para criar a senha
// (com a janela Agora não / Criar senha) e não usa a aba. O servidor também recusa.
function renderSemSenha() {
  const aviso = ui.semSenhaFechado ? '' : `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="gi-ss-t"><div class="modal"><h3 id="gi-ss-t">🔒 Crie uma senha</h3>
    <p style="margin:0">Para usar a aba Compras, você precisa criar uma senha.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="guiasemsenhafechar">Agora não</button><button class="btn primary" data-act="guiacriarsenha">Criar senha</button></div></div></div>`;
  return `<section class="panel gi-tela"><div class="card"><div class="grp-h"><h2><span aria-hidden="true">🔒</span> Compras</h2></div><p class="muted" style="margin:0">Para usar a aba Compras, crie a sua senha no botão <b>🔒 Criar senha</b>, no topo da tela.</p></div>${aviso}</section>`;
}

export function render() {
  const me = estado.me || {};
  if ((me.corrente || me.grupo === 'alunos') && !me.temSenha && visaoAtiva() !== 'root') return renderSemSenha();
  if (estado.guias === null) { carregarGuias(); return '<div class="loading">Carregando as compras…</div>'; }
  const G = estado.guias;
  let h = `<section class="panel gi-tela${ui.ocupado ? ' gi-ocupado' : ''}" aria-busy="${!!ui.ocupado}">`;
  if (admin()) h += cardTopo(G);
  // Primeiro o que falta pagar (se houver), depois o que dá para comprar; os pedidos feitos ficam no fim, como histórico.
  h += cardPagar(G) + cardItens(G) + cardMeus(G);
  if (admin()) h += cardGrupos(G) + cardPainel(G) + cardExportar(G) + cardFeitos(G);
  setTimeout(restaurarCarrosseis, 0);
  return h + janelaPedir() + janelaPagar() + telaFoto() + '</section>';
}

// ---------- foto ----------
// O maior lado vira 900 px (para ver em tela cheia), em JPEG: pequena para guardar no banco.
async function reduzirFoto(arquivo) {
  const { blob } = await reduzirJpeg(await abrirImagem(arquivo), { lado: 900, max: 140000 });
  return base64(blob);
}

// ---------- eventos ----------
// Uma ação por vez: enquanto uma está no servidor, as outras são ignoradas (devolve false; o toggle volta)
// e a tela fica marcada como ocupada (sem clique nos botões, com o texto de carregando no botão da ação).
async function fazer(op, dados) {
  if (ui.ocupado) return false;
  ui.ocupado = op;
  avisar();
  try { return await acaoGuias(op, dados); } finally { ui.ocupado = null; avisar(); }
}
// Ação de um botão de confirmar: a confirmação fica na tela (com o carregando) até o servidor responder.
async function confirmado(k, op, dados) {
  estado.confirm = k;
  const ok = await fazer(op, dados);
  if (estado.confirm === k) estado.confirm = null;
  avisar();
  return ok;
}

// Campos do formulário de item: guardados a cada letra, para um redesenho não apagar.
export function digitando(t) {
  if (t.dataset.guia === 'doacao') { ui.doa[t.dataset.id] = t.value; return; }
  if (t.dataset.guia === 'cpf') { ui.cpf = t.value; return; }
  if (ui.item && t.dataset.guia) ui.item[t.dataset.guia] = t.value;
}

// Depois de pedir ou de gerar o link: abre a janela com as cobranças novas (pedido com venda e doação gera duas).
// Sem cobrança nova (o ASAAS falhou), sobe até o Falta pagar, onde está o Gerar link.
const pendentesIds = () => new Set((estado.guias?.cobrancas || []).filter((c) => c.status === 'pendente').map((c) => c.id));
function abrirPagamento(antes) {
  const novas = [...pendentesIds()].filter((id) => !antes.has(id));
  if (novas.length) { ui.pagar = { ids: novas, novo: true }; avisar(); return; }
  setTimeout(() => document.getElementById('gi-pagar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
}

async function gerarPix(pedido, cpf) {
  if (ui.gerando) return;
  ui.gerando = true;
  avisar();
  const antes = pendentesIds();
  const ok = await fazer('pix', cpf ? { pedido, cpf } : { pedido });
  ui.gerando = false;
  if (ok) { ui.pix = null; ui.cpf = ''; }
  avisar();
  if (ok) abrirPagamento(antes);
}

export async function enviar(form) {
  if (form.id === 'f-guia-pix') {
    await gerarPix(Number(form.dataset.pedido), document.getElementById('gp-cpf').value);
  } else if (form.id === 'f-guia-grupo') {
    const campo = document.getElementById('gg-nova');
    if (await fazer('grupo', { descricao: campo.value })) toast('Grupo cadastrado.');
  } else if (form.id === 'f-guia-ren') {
    if (await fazer('grupo', { id: form.dataset.id, descricao: document.getElementById('gg-ren').value })) { ui.grupoRen = null; avisar(); }
  } else if (form.id === 'f-guia-item') {
    const I = ui.item;
    if (!I) return;
    // Doação: sem quantidade (fica 0) e o valor é só a sugestão (vazio = sem sugestão).
    const dados = { descricao: I.descricao, quantidade: I.doacao ? 0 : I.quantidade, valor: I.doacao ? (String(I.valor ?? '').trim() || '0') : I.valor, visivel: I.visivel, cpj: !!I.cpj, doacao: !!I.doacao };
    if (I.foto !== undefined) dados.foto = I.foto;
    if (I.id) dados.id = I.id; else dados.grupoId = I.grupoId;
    if (await fazer('item', dados)) { toast(I.id ? 'Item salvo.' : 'Item cadastrado.'); ui.item = null; avisar(); }
  }
}

const valorCampo = (v) => Number(v).toFixed(2).replace('.', ',');
// Balões de valor dos itens de doação (fixos).

export const cliques = {
  guiadobrar(el) { const id = el.dataset.id; if (ui.abertos.has(id)) ui.abertos.delete(id); else ui.abertos.add(id); avisar(); },
  guiaminimizar(el) { const id = el.dataset.id; if (ui.minimizados.has(id)) ui.minimizados.delete(id); else ui.minimizados.add(id); avisar(); },
  guiafeito(el) { const n = el.dataset.n; if (ui.feitos.has(n)) ui.feitos.delete(n); else ui.feitos.add(n); avisar(); },
  guiaitemsit(el) {
    const { g, item, k } = el.dataset;
    const a = ui.itemSel[g];
    ui.itemSel[g] = a && a.item === item && a.k === k ? null : { item, k };
    avisar();
  },
  guiaquadro(el) { const g = el.dataset.id; ui.painelSel[g] = ui.painelSel[g] === el.dataset.k ? null : el.dataset.k; avisar(); },
  guiasemsenhafechar() { ui.semSenhaFechado = true; avisar(); },
  guiacriarsenha() { ui.semSenhaFechado = true; avisar(); document.querySelector('[data-conta="criarsenha"]')?.click(); },
  guiabloco(el) { const k = el.dataset.k; if (ui.blocos.has(k)) ui.blocos.delete(k); else ui.blocos.add(k); avisar(); },
  guiapainel(el) { const id = el.dataset.id; if (ui.painel.has(id)) ui.painel.delete(id); else ui.painel.add(id); avisar(); },
  guiarenomear(el) { ui.grupoRen = el.dataset.id || null; avisar(); },
  async guiaexcluirgrupo(el) { if (await confirmado('gg:' + el.dataset.id, 'excluirGrupo', { id: el.dataset.id })) { ui.abertos.delete(el.dataset.id); toast('Grupo excluído.'); } },
  guianovoitem(el) { ui.item = { grupoId: el.dataset.id, descricao: '', quantidade: '', valor: '', visivel: true, cpj: false, doacao: false }; avisar(); },
  guiaeditaritem(el) {
    const i = acharItem(el.dataset.id);
    const g = estado.guias.grupos.find((x) => x.itens.includes(i));
    if (i && g) { ui.item = { grupoId: g.id, id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), valor: valorCampo(i.valor), visivel: i.visivel, cpj: !!i.cpj, doacao: !!i.doacao }; avisar(); }
  },
  guiaitemcancel() { ui.item = null; avisar(); },
  guiatirafoto() { if (ui.item) { ui.item.foto = null; avisar(); } },
  async guiaexcluiritem(el) { if (await confirmado('gi:' + el.dataset.id, 'excluirItem', { id: el.dataset.id })) toast('Item excluído.'); },
  guiapedir(el) {
    const i = acharItem(el.dataset.id);
    if (!i) return;
    if (i.quantidade < 1) return;
    ui.pedir = { itemId: i.id, quantidade: 1 };
    avisar();
  },
  // Doar: o valor digitado (aceita 25, 25,50 ou 1.250,00); vazio, a sugestão do item (se houver).
  guiadoar(el) {
    const i = acharItem(el.dataset.id);
    if (!i) return;
    let t = String(ui.doa[i.id] ?? '').replace(/\s|R\$/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = t ? Math.round(Number(t) * 100) / 100 : Number(i.valor) || 0;
    if (!Number.isFinite(n) || n <= 0 || n > 100000) { toast('Digite o valor da doação (ex.: 25,50).'); return; }
    ui.pedir = { itemId: i.id, quantidade: 1, valor: n };
    avisar();
  },
  // Balão de valor: já abre a confirmação com aquele valor.
  guiadoarvalor(el) {
    const i = acharItem(el.dataset.id);
    if (!i) return;
    ui.pedir = { itemId: i.id, quantidade: 1, valor: Number(el.dataset.v) };
    avisar();
  },
  guiapedircancel() { ui.pedir = null; avisar(); },
  guiapix(el) {
    const n = Number(el.dataset.n);
    if (estado.guias.pixPrecisaCpf) { ui.pix = n; avisar(); } else gerarPix(n);
  },
  guiapixcancel() { ui.pix = null; avisar(); },
  async guiapixatualizar() {
    if (ui.ocupado) return;
    ui.ocupado = 'atualizar';
    avisar();
    try { await carregarGuias(true); } finally { ui.ocupado = null; avisar(); }
  },
  guiapagarfechar() { ui.pagar = null; avisar(); },
  guiapagarabrir(el) { ui.pagar = { ids: [el.dataset.id], novo: false }; avisar(); },
  // Setas do carrossel: passa um cartão.
  guiacar(el) {
    const car = document.querySelector(`.gi-car[data-car="${el.dataset.g}"]`);
    const c = car?.children;
    if (!c?.length) return;
    const passo = c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : car.clientWidth;
    car.scrollBy({ left: Number(el.dataset.d) * passo, behavior: 'smooth' });
  },
  guiapixcopiar(el) {
    const t = document.getElementById(el.dataset.cc);
    const fb = () => { t.focus(); t.select(); toast('Código selecionado. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(t.value).then(() => toast('Código Pix copiado.'), fb); } catch { fb(); }
  },
  guiazoom(el) { ui.zoom = el.dataset.id; avisar(); },
  guiazoomfechar() { ui.zoom = null; avisar(); },
  async guiapedirok() {
    const P = ui.pedir;
    if (!P || ui.gerando) return;
    const cpf = document.getElementById('gp-cpf-pedir')?.value;
    ui.gerando = true;
    avisar();
    const antes = pendentesIds();
    const ok = await fazer('pedir', cpf ? { ...P, cpf } : P);
    ui.gerando = false;
    if (ok) {
      ui.pedir = null;
      ui.cpf = '';
      delete ui.doa[P.itemId];
      const G = estado.guias;
      // Com o Pix, a janela de pagamento abre em seguida (o aviso só aparece quando o ASAAS falhou).
      if (G.aviso || !G.pix) toast(G.aviso || (P.valor ? 'Doação registrada.' : 'Pedido feito.'));
    }
    avisar();
    if (ok && estado.guias.pix) abrirPagamento(antes);
  },
  async guiacancelar(el) { if (await confirmado('gl:' + el.dataset.id, 'cancelar', { id: el.dataset.id })) toast('Pedido cancelado.'); },
  async guiaencerrar(el) { if (await confirmado('genc:' + el.dataset.id, 'encerrar', { grupoId: el.dataset.id })) toast('Pedido do grupo encerrado.'); },
  async guianovo(el) { if (await confirmado('gnovo:' + el.dataset.id, 'novo', { grupoId: el.dataset.id })) toast('Novo pedido aberto para o grupo.'); },
  guiacopiar() {
    const txt = document.getElementById('gx-txt')?.value || '';
    const fb = () => { const t = document.getElementById('gx-txt'); t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado.'), fb); } catch { fb(); }
  },
  async guiaimg() {
    const G = estado.guias;
    const p = exportarEscolhido(G);
    if (!p) return;
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
  guiaitemcpjform(t) { if (ui.item) ui.item.cpj = t.checked; },
  guiaitemdoacaoform(t) { if (ui.item) { ui.item.doacao = t.checked; avisar(); } },
  guiaexportar(t) { ui.exportar = t.value; avisar(); },
  // Trocar o grupo leva ao pedido mais recente dele (o aberto, se houver).
  guiaexpgrupo(t) { const r = rodadasExportar(estado.guias).find((x) => String(x.grupoId) === t.value); ui.exportar = r ? r.chave : null; avisar(); },
  async guiafoto(t) {
    const arq = t.files && t.files[0];
    t.value = '';
    if (!arq || !ui.item) return;
    try { ui.item.foto = await reduzirFoto(arq); } catch { toast('Não consegui abrir essa imagem.'); return; }
    avisar();
  },
};
