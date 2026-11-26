// E-book "A Linha da Esquerda na Umbanda": o popup de venda (para todos, quando o root liga no Admin root), o bloco
// "Seu e-book" da aba Compras e o bloco do Admin root (ligar o popup, enviar o PDF e liberar mais um download).
// Não é aba: o main.js desenha o popup por cima da tela, e Compras e Admin root embutem os blocos (data-tela="ebook").

import { estado, pode, carregarEbook, acaoEbook, baixarEbook, carregarEbookAdmin, acaoEbookAdmin, avisar } from '../estado.js';
import { esc, toast, baixar } from '../util.js';
import { emDemo } from '../auth.js';
import { EBOOK, EBOOK_PARTE, EBOOK_MAX, emailValidoEbook } from '/shared/ebook.js';

if (!document.querySelector('link[data-ebook]')) {
  const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/css/ebook.css' });
  l.dataset.ebook = '';
  document.head.append(l);
}

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const pendente = (c) => c?.cobrancas?.find((b) => b.status === 'pendente' || b.status === 'criando');
const podeBaixar = (c) => c?.status === 'paga' && c.downloads < c.liberados;

// fechado: o X do popup (volta na próxima abertura do app). comprando: a pessoa tocou em Comprar (o popup segue até o download).
const ui = { fechado: false, comprando: false, enviando: false, baixando: false, confirmar: false, arquivo: null, envio: null };

// ---------- conferência do pagamento (a cada 10 s, com o popup ou a aba à vista, por até 10 min) ----------
let conferindo = null;
function conferir(ligar) {
  if (!ligar) { if (conferindo) { clearInterval(conferindo.t); conferindo = null; } return; }
  if (conferindo) return;
  conferindo = { desde: Date.now(), t: setInterval(() => {
    if (Date.now() - conferindo.desde > 10 * 60000) { conferir(false); return; }
    if (document.visibilityState !== 'visible' || !document.querySelector('.eb-pix')) return;
    carregarEbook(true);
  }, 10000) };
}

// ---------- pedaços ----------
function pix(b) {
  return `<div class="eb-pix">
    ${b.pixImagem ? `<img class="eb-qr" src="data:image/png;base64,${b.pixImagem}" alt="QR Code do Pix" width="180" height="180">` : ''}
    ${b.pixPayload ? `<label class="eb-campo">Pix copia e cola<input readonly value="${esc(b.pixPayload)}" id="eb-pix-cod"></label>
      <button class="eb-sec" type="button" data-act="ebcopiar">Copiar código Pix</button>` : ''}
    ${b.link ? `<a class="eb-sec" href="${esc(b.link)}" target="_blank" rel="noopener">Abrir o link de pagamento</a>` : '<p class="eb-dica">O link está sendo gerado. Toque em Já paguei em instantes.</p>'}
    <p class="eb-espera"><span class="eb-vela" aria-hidden="true"></span>Aguardando a confirmação do pagamento${conferindo ? '…' : '.'}</p>
    <button class="eb-link" type="button" data-act="ebconferir">Já paguei, conferir agora</button>
  </div>`;
}

function formDados(E) {
  const c = E.compra || {};
  const ct = E.contato || {};
  if (E.semSenha) return `<p class="eb-aviso">Para comprar, crie a sua senha no botão <b>🔒 Criar senha</b>, no topo da tela. Ela protege o seu e-book.</p>`;
  if (!E.pdf) return '<p class="eb-aviso">O e-book ainda não está disponível. Tente mais tarde.</p>';
  return `<form class="eb-form" id="f-ebook" data-rascunho data-id="ebook" autocomplete="off">
    <p class="eb-dica">Confira os seus dados. O nome e o e-mail vão impressos no PDF.</p>
    <label class="eb-campo">Nome completo<input name="nome" required maxlength="120" value="${esc(c.nome || ct.nome || '')}"></label>
    <label class="eb-campo">E-mail<input name="email" type="email" required maxlength="120" inputmode="email" value="${esc(c.email || ct.email || '')}"></label>
    ${E.cliente || E.cpf ? '' : '<label class="eb-campo">CPF (pedido pelo pagamento)<input name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></label>'}
    <button class="eb-cta" type="button" data-act="ebpagar" ${E.pagamento && !ui.enviando ? '' : 'disabled'}>${ui.enviando ? 'Gerando o link…' : `Gerar link de pagamento · ${moeda(E.valor)}`}</button>
    ${E.pagamento ? '' : '<p class="eb-aviso">O pagamento ainda não está ligado. Fale com a casa.</p>'}
  </form>`;
}

function botaoBaixar(c, onde) {
  if (!podeBaixar(c)) {
    return `<p class="eb-aviso">Download feito em ${esc(dataHora(c.baixadoEm))}. Se não conseguiu salvar o arquivo, fale com a casa para liberar de novo.</p>
      ${ui.ultimo ? '<button class="eb-sec" type="button" data-act="ebdenovo">Salvar o arquivo de novo</button>' : ''}`;
  }
  if (ui.confirmar === onde) {
    return `<p class="eb-aviso">O download é <b>uma vez só</b>. Faça com boa internet e guarde o arquivo no aparelho.</p>
      <div class="eb-linha"><button class="eb-sec" type="button" data-act="ebnaobaixar">Agora não</button>
      <button class="eb-cta" type="button" data-act="ebbaixar" ${ui.baixando ? 'disabled' : ''}>${ui.baixando ? 'Preparando o PDF…' : 'Baixar agora'}</button></div>`;
  }
  return `<button class="eb-cta" type="button" data-act="ebquerbaixar" data-onde="${onde}">Baixar o e-book (PDF)</button>`;
}

// ---------- popup ----------
const ITENS = ['Exus, Pombagiras e as falanges', 'Pontos riscados, velas e firmezas', 'Ervas, banhos, tronqueira e padê'];
function anuncio(compra) {
  const rotulo = compra === 'aguardando' ? 'Continuar o pagamento' : `Comprar · ${moeda(EBOOK.valor)}`;
  return `<div class="eb-anuncio">
    <img class="eb-logo" src="/icon-192.png" alt="Casa do Pai João" width="72" height="72">
    <p class="eb-pre">E-book · Guia de estudos</p>
    <h2 class="eb-tit" id="eb-tit">A Linha da Esquerda<span>na Umbanda</span></h2>
    <p class="eb-sub">Guia visual e prático, feito pela Casa do Pai João, para quem está começando.</p>
    <ul class="eb-itens">${ITENS.map((i) => `<li>${i}</li>`).join('')}</ul>
    <p class="eb-preco"><b>${moeda(EBOOK.valor)}</b> · PDF de 24 páginas</p>
    <button class="eb-cta" type="button" data-act="ebcomprar">${rotulo}</button>
  </div>`;
}

function etapaCompra() {
  const E = estado.ebook;
  if (!E) { carregarEbook(); return '<p class="eb-dica">Carregando…</p>'; }
  if (E.erro) return `<p class="eb-aviso">${esc(E.erro)}</p><button class="eb-sec" type="button" data-act="ebrecarregar">Tentar de novo</button>`;
  const c = E.compra;
  const b = pendente(c);
  conferir(!!b && c?.status === 'aguardando');
  if (c?.status === 'paga') {
    return `<p class="eb-ok">Pagamento confirmado!</p><p class="eb-dica">O seu e-book também fica na aba <b>Compras</b>.</p>${botaoBaixar(c, 'popup')}`;
  }
  if (b) {
    return `<p class="eb-resumo">${esc(EBOOK.titulo)} · <b>${moeda(b.valor)}</b></p>${pix(b)}
      <button class="eb-link" type="button" data-act="ebcancelar">Cancelar este pedido</button>`;
  }
  return formDados(E);
}

// Popup por cima da tela (o main.js chama a cada desenho). '' quando não aparece.
export function renderPopup() {
  const me = estado.me || {};
  if (ui.fechado || !me.ebook?.popup || estado.verComo) return '';
  if (me.ebook.compra === 'paga' && !ui.comprando) return '';   // quem já comprou não vê a propaganda
  return `<div class="modal-fundo eb-fundo" data-tela="ebook" role="dialog" aria-modal="true" aria-labelledby="eb-tit">
    <div class="eb-pop${ui.comprando ? ' eb-comprando' : ''}">
      <button class="eb-x" type="button" data-act="ebfechar" aria-label="Fechar">×</button>
      ${ui.comprando ? `<div class="eb-corpo"><h2 class="eb-tit eb-tit-p" id="eb-tit">A Linha da Esquerda<span>na Umbanda</span></h2>${etapaCompra()}</div>` : anuncio(me.ebook.compra)}
    </div></div>`;
}

// ---------- aba Compras: "Seu e-book" ----------
export function cardCompras() {
  const E = estado.ebook;
  if (!E) { carregarEbook(); return '<div class="card"><p class="muted" style="margin:0">Carregando o e-book…</p></div>'; }
  const c = E.compra;
  if (!c) return '';
  const b = pendente(c);
  if (c.status === 'aguardando') conferir(!!b);
  const situacao = c.status === 'paga' ? '<span class="badge new">Pago</span>' : '<span class="badge eb-esp">Aguardando pagamento</span>';
  return `<div class="card eb-card" data-tela="ebook">
    <div class="grp-h"><h2><span aria-hidden="true">📕</span> Seu e-book</h2>${situacao}</div>
    <p style="margin:0"><b>${esc(EBOOK.titulo)}</b> · ${moeda(EBOOK.valor)}</p>
    <p class="muted" style="margin:0;font-size:.85rem">Comprado em ${esc(dataHora(c.criadoEm))}${c.pagoEm ? ` · pago em ${esc(dataHora(c.pagoEm))}` : ''} · em nome de ${esc(c.nome)} (${esc(c.email)})</p>
    ${c.status === 'paga' ? botaoBaixar(c, 'compras') : b ? `${pix(b)}<button class="eb-link" type="button" data-act="ebcancelar">Cancelar este pedido</button>` : '<button class="eb-cta" type="button" data-act="ebcontinuar">Gerar o link de pagamento</button>'}
  </div>`;
}

// ---------- Admin root ----------
export function cardAdmin(aberto, cab) {
  // O cabeçalho (minimizar) é do Admin root; só o corpo vai para este módulo (data-tela).
  if (!aberto) return `<div class="card">${cab}</div>`;
  const A = estado.ebookAdmin;
  if (!A) { carregarEbookAdmin(); return `<div class="card">${cab}<p class="muted">Carregando…</p></div>`; }
  if (A.erro) return `<div class="card">${cab}<p class="erro">${esc(A.erro)}</p></div>`;
  const pdf = A.pdf;
  const pagas = A.compras.filter((c) => c.status === 'paga');
  const linha = (c) => `<li class="eb-adm-linha"><span><b>${esc(c.nome || '—')}</b> <small class="muted">${esc(c.email)}</small><br>
      <small class="muted">${c.status === 'paga' ? `Pago ${esc(dataHora(c.pagoEm))} · downloads ${c.downloads}/${c.liberados}` : c.status === 'aguardando' ? 'Aguardando pagamento' : 'Cancelado'} · ${esc(dataHora(c.criadoEm))}</small></span>
      ${c.status === 'paga' && c.downloads >= c.liberados ? `<button class="btn small" data-act="ebliberar" data-id="${c.id}">Liberar download</button>` : ''}</li>`;
  return `<div class="card">${cab}<div class="eb-adm" data-tela="ebook">
    <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-act="ebpopup" ${A.popup ? 'checked' : ''} ${pdf ? '' : 'disabled'}>
      <span><b>Popup visível para todos</b><br><small class="muted">${pdf ? 'Aparece ao abrir o app, com o X para fechar. Quem já comprou não vê.' : 'Envie o PDF antes de ligar.'}</small></span></label>
    <div class="eb-adm-pdf">
      <p style="margin:0">${pdf ? `PDF: <b>${esc(pdf.nome)}</b> · ${pdf.paginas} páginas · ${(pdf.tamanho / 1048576).toFixed(1)} MB · enviado ${esc(dataHora(pdf.enviadoEm))}` : '<b>Nenhum PDF enviado.</b>'}</p>
      <p class="muted" style="margin:0;font-size:.85rem">O PDF fica guardado no banco (o código do app é público). Cada download sai com o nome e o e-mail de quem comprou em todas as páginas.</p>
      <label class="btn small eb-arquivo">${ui.envio ? esc(ui.envio) : pdf ? 'Trocar o PDF' : 'Enviar o PDF'}<input type="file" accept="application/pdf,.pdf" data-act="ebpdf" hidden ${ui.envio ? 'disabled' : ''}></label>
    </div>
    <h3 class="eb-adm-h">Compras <span class="count">${pagas.length} paga${pagas.length === 1 ? '' : 's'} · ${moeda(pagas.length * EBOOK.valor)}</span></h3>
    ${A.compras.length ? `<ul class="eb-adm-lista">${A.compras.map(linha).join('')}</ul>` : '<p class="muted" style="margin:0">Nenhuma compra ainda.</p>'}
  </div></div>`;
}

// Envia o PDF em pedaços (cada pedido fica bem abaixo do limite de 4,5 MB da Vercel) e, no fim, pede para usar.
async function enviarPdf(arquivo) {
  if (!arquivo) return;
  if (emDemo()) { toast('Modo demonstração: esta ação não é salva.'); return; }
  if (arquivo.size > EBOOK_MAX) { toast('O PDF passa de 4 MB.'); return; }
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const versao = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const partes = Math.ceil(buf.length / EBOOK_PARTE);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  try {
    for (let parte = 0; parte < partes; parte++) {
      ui.envio = `Enviando ${parte + 1} de ${partes}…`;
      avisar();
      const ok = await acaoEbookAdmin('pdfParte', { versao, parte, dados: b64(buf.subarray(parte * EBOOK_PARTE, (parte + 1) * EBOOK_PARTE)) });
      if (!ok) return;
    }
    ui.envio = 'Conferindo o PDF…';
    avisar();
    if (await acaoEbookAdmin('pdfUsar', { versao, partes, nome: arquivo.name })) toast('PDF guardado.');
  } finally { ui.envio = null; avisar(); }
}

// ---------- ações ----------
async function enviando(fn) {
  if (ui.enviando) return null;
  ui.enviando = true;
  avisar();
  try { return await fn(); } finally { ui.enviando = false; avisar(); }
}

export const cliques = {
  ebfechar: () => { ui.fechado = true; ui.confirmar = false; conferir(false); avisar(); },
  ebcomprar: () => { ui.comprando = true; if (!estado.ebook || estado.ebook.erro) estado.ebook = null; avisar(); },
  ebcontinuar: () => { ui.fechado = false; ui.comprando = true; estado.me = { ...estado.me, ebook: { ...estado.me.ebook, popup: true } }; avisar(); },
  ebrecarregar: () => { estado.ebook = null; avisar(); },
  ebpagar: (el) => {
    const f = el.closest('form');
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    if (!emailValidoEbook(v.email)) { toast('Informe um e-mail válido.'); return; }
    return enviando(async () => {
      if (await acaoEbook('pagar', { nome: v.nome, email: v.email, cpf: v.cpf })) { f.reset(); toast('Link gerado. Aguardando o pagamento.'); }
    });
  },
  ebcancelar: () => enviando(async () => { if (await acaoEbook('cancelar')) toast('Pedido cancelado.'); }),
  ebconferir: async () => { toast('Conferindo o pagamento…'); await carregarEbook(true); },
  ebcopiar: () => {
    const input = document.getElementById('eb-pix-cod');
    if (!input) return;
    const fb = () => { input.select(); document.execCommand('copy'); toast('Código Pix copiado.'); };
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(() => toast('Código Pix copiado.'), fb); else fb();
  },
  ebquerbaixar: (el) => { ui.confirmar = el.dataset.onde; avisar(); },
  ebnaobaixar: () => { ui.confirmar = false; avisar(); },
  ebbaixar: async () => {
    if (ui.baixando) return;
    if (emDemo()) { toast('Modo demonstração: sem download.'); return; }
    ui.baixando = true;
    avisar();
    try {
      const blob = await baixarEbook();
      // Guarda o arquivo enquanto o app estiver aberto: se o aparelho não salvou, dá para salvar de novo sem gastar outro download.
      ui.ultimo = blob;
      baixar(blob, EBOOK.arquivo);
      toast('E-book baixado. Guarde o arquivo no aparelho.');
    } catch (e) { toast(e.message); } finally {
      ui.baixando = false;
      ui.confirmar = false;
      await carregarEbook();
    }
  },
  ebdenovo: () => { if (ui.ultimo) baixar(ui.ultimo, EBOOK.arquivo); },
  ebliberar: async (el) => { if (await acaoEbookAdmin('liberar', { id: el.dataset.id })) toast('Mais um download liberado.'); },
};

export const mudancas = {
  ebpopup: async (el) => {
    if (!pode('usuarios:gerenciar')) return;
    if (!(await acaoEbookAdmin('popup', { visivel: el.checked }))) el.checked = !el.checked;
    else toast(el.checked ? 'Popup ligado: aparece para todos ao abrir o app.' : 'Popup desligado.');
  },
  ebpdf: (el) => { const f = el.files?.[0]; el.value = ''; enviarPdf(f); },
};
