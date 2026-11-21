// Aba Gira: as janelas por cima da tela (WhatsApp da escala, das orações e dos aniversariantes, prévia da
// limpeza, imagem da escala e do evento, foto ampliada, troca de data e confirmação da presença).

import { STATUS, nomeEntidadeGira, contaNaPresenca, orixaDaGira, temLimpeza, limpezaDaGira, status, daGira, licencaEm } from '/shared/regras.js';
import { estado, prefs, pessoasComSaidas, nome, girasLista, giraAtual, mudarDataGira, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, hoje } from '../util.js';
import { textoWhats } from '../exportar.js';
import { aniversariantesDoDia, mensagensAniversario } from '/shared/eventos.js';
import { banhosDaGira } from '/shared/banhos.js';
import { ICONE_WHATS } from './giraComum.js';
import { chaveImg, podeCompartilhar, opcoesPapel, cliques } from './gira.js';

// ---------- janela do WhatsApp das orações: prévia da imagem, Compartilhar e Salvar ----------
const chaveOracoes = () => JSON.stringify((estado.oracoes || []).map((o) => [o.id, o.texto, o.reacoes || 0]));
export const imagemOracoesPronta = () => !!(estado.oraImg && estado.oraImg.key === chaveOracoes());
export async function prepararOracoes() {
  if (imagemOracoesPronta() || estado.oraGerando) return;
  estado.oraGerando = true;
  const key = chaveOracoes();
  try {
    const { gerarImagemOracoes } = await import('../imagemOracoes.js');
    const blob = await gerarImagemOracoes(estado.oracoes || [], hoje());
    if (estado.oraImg) URL.revokeObjectURL(estado.oraImg.url);
    estado.oraImg = { url: URL.createObjectURL(blob), blob, key, nome: `pedidos-de-oracao-${hoje()}.png` };
  } catch (e) { toast(e.message); }
  estado.oraGerando = false;
  atualizarJanela();
}
function podeCompartilharOracoes() {
  try {
    return !!(imagemOracoesPronta() && navigator.canShare && navigator.canShare({ files: [new File([estado.oraImg.blob], estado.oraImg.nome, { type: 'image/png' })] }));
  } catch { return false; }
}
// ---------- janela do WhatsApp dos aniversariantes do dia (root): prévia da imagem, Compartilhar e Salvar ----------
// Cada pessoa com uma mensagem diferente; a escolha vem da data, então a prévia é a imagem que vai.
function listaNiver() {
  const hj = hoje();
  const ps = aniversariantesDoDia(estado.pessoas, hj);
  const msgs = mensagensAniversario(ps.length, hj);
  return ps.map((p, i) => ({ nome: p.nome, mensagem: msgs[i] }));
}
const chaveNiver = () => hoje() + JSON.stringify(listaNiver());
export const imagemNiverPronta = () => !!(estado.niverImg && estado.niverImg.key === chaveNiver());
export async function prepararNiver() {
  if (imagemNiverPronta() || estado.niverGerando) return;
  estado.niverGerando = true;
  const key = chaveNiver();
  try {
    const { gerarImagemAniversario } = await import('../imagemAniversario.js');
    const blob = await gerarImagemAniversario(listaNiver());
    if (estado.niverImg) URL.revokeObjectURL(estado.niverImg.url);
    estado.niverImg = { url: URL.createObjectURL(blob), blob, key, nome: `aniversariantes-${hoje()}.png` };
  } catch (e) { toast(e.message); }
  estado.niverGerando = false;
  atualizarJanela();
}
function podeCompartilharNiver() {
  try {
    return !!(imagemNiverPronta() && navigator.canShare && navigator.canShare({ files: [new File([estado.niverImg.blob], estado.niverImg.nome, { type: 'image/png' })] }));
  } catch { return false; }
}
function janelaNiver() {
  if (!estado.niverJanela) return '';
  const pronta = imagemNiverPronta();
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="niver-t"><div class="modal or-modal">
    <h3 id="niver-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Aniversariantes de hoje</h3>
    ${pronta ? `<div class="or-previa"><img src="${estado.niverImg.url}" alt="Imagem dos aniversariantes de hoje"></div>` : '<div class="loading">Preparando a imagem…</div>'}
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="niverfechar">Fechar</button>
      ${pronta ? `<button class="btn" data-act="niversalvar">Salvar imagem</button>${podeCompartilharNiver() ? '<button class="btn primary" data-act="nivercompartilhar">Compartilhar</button>' : ''}` : ''}</div>
  </div></div>`;
}

function janelaOracoes() {
  if (!estado.oraJanela) return '';
  const pronta = imagemOracoesPronta();
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ora-t"><div class="modal or-modal">
    <h3 id="ora-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Pedidos de oração</h3>
    ${pronta ? `<div class="or-previa"><img src="${estado.oraImg.url}" alt="Imagem dos pedidos de oração"></div>` : '<div class="loading">Preparando a imagem…</div>'}
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="orafechar">Fechar</button>
      ${pronta ? `<button class="btn" data-act="orasalvar">Salvar imagem</button>${podeCompartilharOracoes() ? '<button class="btn primary" data-act="oracompartilhar">Compartilhar</button>' : ''}` : ''}</div>
  </div></div>`;
}

// Botão do WhatsApp da escala: abre a janela para escolher texto ou imagem.
// Sem sorteio feito fica desabilitado (não há escala para mandar).
export const botaoWhats = (ok, rotulo = 'WhatsApp') => (ok
  ? `<button class="btn btn-grande wa-bt" data-act="waabrir"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${rotulo}</button>`
  : `<button class="btn btn-grande wa-bt" disabled title="Faça o sorteio primeiro"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${rotulo}</button>`);
// Admin: abre a prévia da gira, com o texto pronto para ajustar antes de mandar no WhatsApp.
export function botaoWhatsLimpeza(g) {
  if (g.evento || !temLimpeza(g) || !limpezaDaGira(estado.pessoas, g, girasLista())) return '';
  return `<button class="btn btn-grande wa-bt" data-act="pvabrir" title="Ver e ajustar a prévia da gira"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Prévia Gira</button>`;
}

const linkWhats = (txt) => 'https://wa.me/?text=' + encodeURIComponent(txt);
function janelaPrevia() {
  if (!estado.previaGira) return '';
  const { texto } = estado.previaGira;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="pv-t"><div class="modal pv-modal">
    <h3 id="pv-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Prévia da gira</h3>
    <p class="muted" style="margin:0">Ajuste o texto, se precisar, antes de enviar.</p>
    <textarea id="pv-texto" aria-label="Texto da prévia da gira">${esc(texto)}</textarea>
    <div class="row pv-bts"><button class="btn" data-act="pvfechar">Cancelar</button>
      <a class="btn wa-bt pv-enviar" id="pv-enviar" href="${linkWhats(texto)}" target="_blank" rel="noopener" data-act="pvenviar"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Enviar no WhatsApp</a></div>
  </div></div>`;
}

// ---------- janela do WhatsApp: texto (abre o WhatsApp com a mensagem) ou imagem (compartilhar do aparelho) ----------
export const imagemPronta = () => { const g = giraAtual(); return !!(estado.img && estado.img.data === g.data && estado.img.key === chaveImg()); };

function dadosImagemEvento(g, ps) {
  const secoes = [];
  if (!g.encerrada && g.recado) secoes.push({ titulo: '📢 Recado', itens: [g.recado], cor: '#2c4ea3' });
  const banho = banhosDaGira(g);
  for (const [titulo, dados] of [['🌿 Banho orixá', banho.orixa], ['🌿 Banho guia', banho.guia]]) {
    if (dados) secoes.push({ titulo: `${titulo} · ${dados.nome}`, itens: [...dados.ervas, ...(dados.obs ? [dados.obs] : []), ...(dados.aviso ? [`⚠️ ${dados.aviso}`] : [])], cor: '#24785a' });
  }
  for (const [st, titulo, cor] of [['a', '✖ Ausência', '#a2423a'], ['f', '✖ Faltas', '#e0101f']]) {
    const nomes = ps.filter((p) => status(p, g) === st).map((p) => p.nome);
    if (nomes.length) secoes.push({ titulo: `${titulo} · ${nomes.length}`, itens: nomes, cor });
  }
  const licencas = ps.filter((p) => licencaEm(p, g.data)).map((p) => `${p.nome} (até ${dDM(licencaEm(p, g.data).fim)})`);
  if (licencas.length) secoes.push({ titulo: `✚ De licença · ${licencas.length}`, itens: licencas, cor: '#a2423a' });
  return {
    data: dLong(g.data).replace(/^./, (c) => c.toLocaleUpperCase('pt-BR')),
    titulo: `Evento${g.entidade ? ` · ${nomeEntidadeGira(g)}` : ''}`,
    orixa: orixaDaGira(g),
    secoes,
  };
}
const chaveImagemEvento = (g, ps) => JSON.stringify([g.data, g.entidade, g.orixa, g.recado, g.evento, ps.map((p) => [p.id, p.nome, status(p, g), licencaEm(p, g.data)?.fim]), banhosDaGira(g)]);
export function imagemEventoPronta(g, ps) {
  return !!(estado.eventoImg && estado.eventoImg.key === chaveImagemEvento(g, ps));
}
export function botaoImagemEvento(g, ps) {
  const pronta = imagemEventoPronta(g, ps);
  const key = chaveImagemEvento(g, ps);
  if (!pronta && estado.eventoImgErro !== key) setTimeout(() => prepararImagemEvento(g, ps), 0);
  const gerando = estado.eventoImgGerando === key || (!pronta && estado.eventoImgErro !== key);
  return `<button class="btn small ev-wa" data-act="eventoimagem" ${gerando ? 'disabled' : ''} title="${gerando ? 'Preparando a imagem do evento' : 'Compartilhar a imagem do evento'}"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span>${gerando ? 'Preparando…' : 'WhatsApp'}</button>`;
}
export async function prepararImagemEvento(g, ps) {
  const evento = dadosImagemEvento(g, ps);
  const key = chaveImagemEvento(g, ps);
  if (imagemEventoPronta(g, ps) || estado.eventoImgGerando === key || estado.eventoImgErro === key) return;
  estado.eventoImgGerando = key;
  try {
    const { gerarImagemEvento } = await import('../imagemEvento.js');
    const blob = await gerarImagemEvento(evento);
    const atual = giraAtual();
    const pessoasAtuais = daGira(pessoasComSaidas(), atual).filter(contaNaPresenca);
    if (chaveImagemEvento(atual, pessoasAtuais) !== key) return;
    if (estado.eventoImg) URL.revokeObjectURL(estado.eventoImg.url);
    estado.eventoImg = { url: URL.createObjectURL(blob), blob, key, nome: `evento-${g.data}.png` };
    estado.eventoImgErro = null;
  } catch (e) {
    estado.eventoImgErro = key;
    toast(e.message);
  } finally {
    if (estado.eventoImgGerando === key) estado.eventoImgGerando = null;
    avisar();
  }
}
// A imagem começa a ser feita quando a janela abre: o compartilhar do celular só funciona logo depois do toque,
// então ela já precisa estar pronta quando a pessoa escolher "Imagem".
export async function prepararImagem() {
  if (imagemPronta() || estado.waGerando) return;
  estado.waGerando = true;
  const key = chaveImg();
  try {
    const g = giraAtual();
    const { gerarImagem } = await import('../imagem.js');
    const blob = await gerarImagem(estado.pessoas, g, girasLista());
    if (estado.img) URL.revokeObjectURL(estado.img.url);
    estado.img = { url: URL.createObjectURL(blob), blob, key, data: g.data, nome: 'escala-' + g.data + '.png' };
  } catch (e) { estado.imgErro = key; toast(e.message); }
  estado.waGerando = false;
  atualizarJanela();
  avisar();   // o card "Sorteio realizado!" mostra a imagem assim que fica pronta
}

// Card da gira, abaixo da Licença (escala publicada, para todos): "Sorteio realizado!" com a imagem da escala; tocar amplia.
// comWhats: ícone do WhatsApp ao lado do título, que abre a janela para mandar a escala (texto ou imagem).
export function blocoImagemEscala(comWhats = false) {
  const pronta = imagemPronta();
  // Se a imagem falhou neste aparelho, não tenta de novo a cada redesenho.
  const falhou = !pronta && estado.imgErro === chaveImg();
  if (!pronta && !falhou) setTimeout(prepararImagem, 0);
  const wa = comWhats ? `<button class="btn small wa-bt esc-img-wa" data-act="waabrir" title="Compartilhar a escala no WhatsApp" aria-label="Compartilhar a escala no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span></button>` : '';
  return `<div class="esc-img-sec"><div class="esc-img-h"><h3 class="sorteio-ok">🚀 Sorteio realizado! ❤️</h3>${wa}</div>
    ${pronta ? `<button class="esc-img-bt" data-act="escimg" aria-label="Ampliar a imagem da escala"><img src="${estado.img.url}" alt="Escala da gira"></button>`
      : falhou ? '<p class="muted" style="margin:0">Não consegui montar a imagem da escala neste aparelho.</p>'
      : '<div class="loading">Preparando a imagem da escala…</div>'}</div>`;
}

// Imagem da escala ampliada (rola se for mais alta que a tela); tocar fecha.
function janelaEscala() {
  if (!estado.escImgVer || !imagemPronta()) return '';
  return `<div class="modal-fundo esc-fundo" role="dialog" aria-modal="true" aria-label="Escala da gira"><div class="esc-grande"><img src="${estado.img.url}" alt="Escala da gira"></div></div>`;
}

function janelaWhats() {
  if (!estado.waJanela) return '';
  const txt = textoWhats(estado.pessoas, giraAtual(), prefs.fmt, girasLista());
  const pronta = imagemPronta();
  const share = pronta && podeCompartilhar();
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="wa-t"><div class="modal wa-modal">
    <h3 id="wa-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Compartilhar a escala</h3>
    <p class="muted" style="margin:0">Como você quer mandar no WhatsApp?</p>
    <a class="wa-op" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener" data-act="watexto">
      <span class="wa-op-ico" aria-hidden="true">📝</span><span class="wa-op-txt"><b>Texto da lista</b><small>Abre o WhatsApp com a mensagem pronta para escolher o grupo</small></span></a>
    <button class="wa-op" data-act="waimagem" ${pronta ? '' : 'disabled'}>
      <span class="wa-op-ico" aria-hidden="true">🖼️</span><span class="wa-op-txt"><b>Imagem da escala</b><small>${!pronta ? 'Preparando a imagem…' : share ? 'Escolha o WhatsApp na lista do aparelho' : 'Baixa a imagem para anexar no WhatsApp'}</small></span></button>
    <div class="row wa-mais"><div class="seg" role="group" aria-label="Formato do texto"><button data-act="wafmt" data-v="lista" aria-pressed="${prefs.fmt !== 'tabela'}">Lista</button><button data-act="wafmt" data-v="tabela" aria-pressed="${prefs.fmt === 'tabela'}">Tabela</button></div>
      <button class="btn small" data-act="copiar">Copiar texto</button></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="wafechar">Cancelar</button></div>
  </div></div>`;
}

// A janela fica direto no <body> (fora da tela que é redesenhada), por cima de tudo.
let raizJanela = null;
export function atualizarJanela() {
  // Prévia aberta: a atualização da tela não pode apagar o que a pessoa está escrevendo.
  if (estado.previaGira && raizJanela?.querySelector('#pv-texto')) return;
  const html = prefs.tab === 'agenda'
    ? janelaPresenca() || janelaData() || janelaWhats() || janelaPrevia() || janelaFoto() || janelaEscala() || janelaOracoes()
    : prefs.tab === 'gira' ? janelaPresenca() || janelaFoto() || janelaOracoes() || janelaNiver() : '';
  if (!raizJanela) {
    if (!html) return;
    raizJanela = document.createElement('div');
    raizJanela.id = 'janela';
    document.body.appendChild(raizJanela);
    raizJanela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && cliques[b.dataset.act]) cliques[b.dataset.act](b);
      else if (estado.previaGira) return;   // tocar fora não fecha: perderia o texto ajustado
      else if (e.target.closest('.modal-fundo')) (estado.fotoVer ? cliques.fotofechar : estado.escImgVer ? cliques.escimgfechar : estado.oraJanela && e.target.classList.contains('modal-fundo') ? cliques.orafechar : estado.niverJanela && e.target.classList.contains('modal-fundo') ? cliques.niverfechar : e.target.classList.contains('modal-fundo') ? (estado.waJanela ? cliques.wafechar : estado.mudaData ? cliques.mdcancel : cliques.prescancel) : () => {})();
    });
    raizJanela.addEventListener('input', (e) => {
      if (e.target.id === 'pv-texto') document.getElementById('pv-enviar').href = linkWhats(e.target.value);
    });
    // Data nova escolhida no calendário: salva e fecha.
    raizJanela.addEventListener('change', async (e) => {
      // Ano incompleto (digitando no computador) ainda não conta.
      if (e.target.id !== 'md-data' || !/^20\d\d-\d\d-\d\d$/.test(e.target.value)) return;
      const para = e.target.value;
      estado.mudaData = null;
      atualizarJanela();
      if (para !== giraAtual().data) await mudarDataGira(para);
    });
  }
  if (raizJanela.innerHTML !== html) raizJanela.innerHTML = html;
  if (html) raizJanela.querySelector('[data-act=presok], [data-act=mdsim]')?.focus();
}

// Foto ampliada (tocar na foto pequena do "Você nesta gira"); tocar em qualquer lugar fecha.
function janelaFoto() {
  const id = estado.fotoVer;
  const url = id && estado.fotosPessoa[id];
  if (!url) return '';
  return `<div class="modal-fundo foto-fundo" role="dialog" aria-modal="true" aria-label="Foto de ${esc(nome(id))}"><div class="foto-grande">
    <img src="${url}" alt="Foto de ${esc(nome(id))}"><b>${esc(nome(id))}</b></div></div>`;
}

// Janela para trocar a data programada da gira: primeiro pergunta; com "Sim", mostra o calendário.
function janelaData() {
  if (!estado.mudaData) return '';
  const g = giraAtual();
  const calendario = estado.mudaData === 'calendario';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="md-t"><div class="modal">
    <h3 id="md-t">${calendario ? 'Escolha a nova data' : 'Quer alterar a data do evento?'}</h3>
    ${calendario
      ? `<label class="field">Nova data<input type="date" id="md-data" value="${esc(g.data)}"></label>
        <p class="muted" style="margin:0;font-size:.85rem">Presença, sorteio e tudo o que já foi feito vão junto para a nova data.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-act="mdcancel">Cancelar</button></div>`
      : `<p style="margin:0">Hoje está marcada para <b>${esc(dLong(g.data))}</b>.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-act="mdcancel">Cancelar</button><button class="btn primary" data-act="mdsim">Sim</button></div>`}
  </div></div>`;
}

// Janela para confirmar a troca de quem estava Pendente (ou o OK da caixa amarela: status e função).
function janelaPresenca() {
  const c = estado.confPres;
  if (!c) return '';
  const p = estado.pessoas.find((x) => x.id === c.id);
  if (!p) return '';
  const funcao = c.rapida ? (opcoesPapel(p).find(([k]) => k === c.papel) || [])[1] : '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="mp-t"><div class="modal">
    <h3 id="mp-t">Confirmar presença</h3>
    <p style="margin:0">${c.rapida
      ? `<b>${esc(p.nome)}</b>: <b>${STATUS[c.valor]}</b>${funcao ? ` · função <b>${esc(funcao)}</b>` : ''}?`
      : `<b>${esc(p.nome)}</b>: de <b>Pendente</b> para <b>${STATUS[c.valor]}</b>?`}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="prescancel">Cancelar</button><button class="btn primary" data-act="presok">Confirmar</button></div>
  </div></div>`;
}
