// Aba Oráculo: agendar uma consulta com o Oráculo de Maria Mulambo (regras em shared/oraculo.js).
// Quem está logado escolhe o dia e o horário (só de hoje em diante), confirma os dados e gera o link de pagamento; a
// tela fica perguntando se o pagamento caiu enquanto espera. Com a consulta marcada: reagendar, pedir presencial e o
// caminho para cancelar (WhatsApp da casa). O que é de quem administra fica na sub-aba Admin (oraculoAdmin.js).

import { estado, carregarOraculo, acaoOraculo, avisar } from '../estado.js';
import { esc, toast } from '../util.js';
import {
  configOraculo, horariosDoDia, diaTemVaga, agoraBR, somarDias, diaDaSemana, SEMANA_CURTA, MESES, STATUS, moeda, dataLonga,
  linkWhats, mensagemPedirCancelamento, ENDERECO, DURACAO_MIN,
} from '/shared/oraculo.js';

// O visual da aba fica num CSS próprio, baixado só quando ela abre (o estilo.css vai para todo mundo na abertura).
if (!document.querySelector('link[data-oraculo]')) {
  const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/css/oraculo.css' });
  l.dataset.oraculo = '';
  document.head.append(l);
}

const ui = { mes: null, data: null, hora: null, reagendar: null, trocar: false, enviando: false };
export function limpar() {
  Object.assign(ui, { mes: null, data: null, hora: null, reagendar: null, trocar: false, enviando: false });
}

const pendente = (c) => c.cobrancas.find((b) => b.status === 'pendente' || b.status === 'criando');
const ativa = (c) => c.status === 'reservada' && Date.parse(c.expiraEm) > Date.now();
const horaDe = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const futura = (c, hoje) => c.data >= hoje;

// ---------- conferência do pagamento (a cada 10 s, só com a aba à vista e por até 10 min) ----------
let conferindo = null;
function conferirPagamento(ligar) {
  if (!ligar) { if (conferindo) { clearInterval(conferindo.t); conferindo = null; } return; }
  if (conferindo) return;
  conferindo = { desde: Date.now(), t: setInterval(() => {
    if (Date.now() - conferindo.desde > 10 * 60000) { conferirPagamento(false); avisar(); return; }
    if (document.visibilityState !== 'visible' || !document.querySelector('.oc')) return;
    carregarOraculo(true);
  }, 10000) };
}

// ---------- cabeçalho e rodapé ----------
const ROSA = `<svg class="oc-rosa" viewBox="0 0 120 24" aria-hidden="true"><path d="M2 12h44M74 12h44" stroke="currentColor" stroke-width="1"/>
  <circle cx="60" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M60 5c-3 3-3 11 0 14M60 5c3 3 3 11 0 14M53 12h14" fill="none" stroke="currentColor" stroke-width="1"/>
  <circle cx="49" cy="12" r="1.6" fill="currentColor"/><circle cx="71" cy="12" r="1.6" fill="currentColor"/></svg>`;
const topo = () => `<header class="oc-topo">
  <p class="oc-pre">Oráculo de</p><h1 class="oc-tit">Maria Mulambo</h1>${ROSA}<p class="oc-sub">Agende sua consulta</p></header>`;
const rodape = (O) => `<footer class="oc-rodape"><b>Casa do Pai João</b><span>${esc(ENDERECO)}</span>
  <a class="oc-whats" href="${linkWhats(O.config.contato, 'Olá! Tenho uma dúvida sobre o Oráculo de Maria Mulambo.')}" target="_blank" rel="noopener">Falar com a casa no WhatsApp</a></footer>`;

// ---------- calendário e horários ----------
function calendario(O, ignorar) {
  const agora = agoraBR();
  const ultimo = somarDias(agora.data, O.config.diasFuturos);
  ui.mes ||= (ui.data || agora.data).slice(0, 7);
  const [y, m] = ui.mes.split('-').map(Number);
  const primeiro = `${ui.mes}-01`;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const podeVoltar = ui.mes > agora.data.slice(0, 7);
  const podeIr = ui.mes < ultimo.slice(0, 7);
  let h = `<div class="oc-cal"><div class="oc-cal-cab">
    <button class="oc-seta" data-act="ocmes" data-d="-1" ${podeVoltar ? '' : 'disabled'} aria-label="Mês anterior">‹</button>
    <b>${MESES[m - 1]}${y !== Number(agora.data.slice(0, 4)) ? ' ' + y : ''}</b>
    <button class="oc-seta" data-act="ocmes" data-d="1" ${podeIr ? '' : 'disabled'} aria-label="Próximo mês">›</button></div>
    <div class="oc-grade">${SEMANA_CURTA.map((d) => `<span class="oc-sem">${d}</span>`).join('')}`;
  for (let i = 0; i < diaDaSemana(primeiro); i++) h += '<span></span>';
  for (let d = 1; d <= dias; d++) {
    const data = `${ui.mes}-${String(d).padStart(2, '0')}`;
    const vaga = diaTemVaga(O, data, agora, ignorar);
    const cls = ['oc-dia', vaga ? 'livre' : 'fora', data === ui.data ? 'sel' : '', data === agora.data ? 'hoje' : ''].filter(Boolean).join(' ');
    h += vaga ? `<button class="${cls}" data-act="ocdia" data-data="${data}" aria-pressed="${data === ui.data}" aria-label="${esc(dataLonga(data))}">${d}</button>`
      : `<span class="${cls}" aria-hidden="true">${d}</span>`;
  }
  return h + '</div></div>';
}
function horarios(O, ignorar) {
  if (!ui.data) return '<p class="oc-dica">Toque num dia dourado para ver os horários livres.</p>';
  const lista = horariosDoDia(O, ui.data, agoraBR(), ignorar);
  if (!lista.some((x) => x.livre)) return '<p class="oc-dica">Este dia lotou. Escolha outro.</p>';
  return `<h3 class="oc-h3">Horários de ${esc(dataLonga(ui.data))}</h3><div class="oc-horas">${lista.map((x) => x.livre
    ? `<button class="oc-hora${ui.hora === x.hora ? ' sel' : ''}" data-act="ochora" data-hora="${x.hora}" aria-pressed="${ui.hora === x.hora}">${x.hora}</button>`
    : `<span class="oc-hora tomado" title="Indisponível"><s>${x.hora}</s></span>`).join('')}</div>
    <p class="oc-dica">Cada consulta dura ${DURACAO_MIN / 60} hora e é feita a distância.</p>`;
}
function agenda(O, reagendando) {
  const ignorar = reagendando && reagendando.status === 'confirmada' ? reagendando : null;
  return `<div class="oc-bloco">
    ${reagendando ? `<p class="oc-aviso">Reagendando a consulta de ${esc(dataLonga(reagendando.data))}, às ${reagendando.hora}. Você não paga de novo.</p>` : ''}
    <h2 class="oc-h2">Escolha a data</h2>${calendario(O, ignorar)}
    ${horarios(O, ignorar)}
    <button class="oc-cta" data-act="occonfirmar" ${ui.data && ui.hora && !ui.enviando ? '' : 'disabled'}>${reagendando ? 'Confirmar novo horário' : 'Confirmar agendamento'}</button>
    ${reagendando ? '<button class="oc-link" data-act="ocvoltar">Manter o horário atual</button>' : `<p class="oc-dica">Valor da consulta: ${moeda(O.config.valor)}.</p>`}
  </div>`;
}

// ---------- dados e pagamento ----------
function formulario(O, c) {
  const ct = O.contato || {};
  return `<form class="oc-bloco oc-form" id="f-oraculo" data-rascunho data-id="${c.id}" autocomplete="off">
    <h2 class="oc-h2">Seus dados</h2>
    <p class="oc-resumo"><b>${esc(dataLonga(c.data))}</b>, às <b>${c.hora}</b> · ${moeda(O.config.valor)}</p>
    <p class="oc-dica">Horário guardado para você até ${horaDe(c.expiraEm)}.</p>
    <label class="oc-campo">Nome completo<input name="nome" required maxlength="120" value="${esc(c.nome || ct.nome || '')}"></label>
    <label class="oc-campo">Data de nascimento<input name="nascimento" required inputmode="numeric" maxlength="10" placeholder="dd/mm/aa" value="${esc(c.nascimento)}"></label>
    <label class="oc-campo">Nome completo da mãe<input name="mae" required maxlength="120" value="${esc(c.mae)}"></label>
    <label class="oc-campo">WhatsApp<input name="whatsapp" required inputmode="tel" data-mascara="tel" maxlength="16" placeholder="(11) 90000-0000" value="${esc(c.whatsapp || ct.celular || '')}"></label>
    ${O.cliente ? '' : '<label class="oc-campo">CPF (pedido pelo pagamento)<input name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></label>'}
    <label class="oc-check"><input type="checkbox" name="presencial" ${c.presencial === 'pedido' ? 'checked' : ''}>
      <span>Quero saber se dá para ser presencial. O atendimento é a distância; o presencial, se a casa aceitar, tem uma taxa a mais.</span></label>
    <button class="oc-cta" type="button" data-act="ocpagar" ${O.pagamento && !ui.enviando ? '' : 'disabled'}>${ui.enviando ? 'Gerando o link…' : 'Gerar link de pagamento'}</button>
    ${O.pagamento ? '' : '<p class="erro">O pagamento ainda não está ligado. Fale com a casa.</p>'}
    <span class="oc-acoes"><button class="oc-link" type="button" data-act="octrocar">Escolher outro horário</button>
      <button class="oc-link" type="button" data-act="ocdesistir" data-id="${c.id}">Desistir</button></span>
  </form>`;
}
function pix(b, titulo) {
  return `<div class="oc-pix">
    <p class="oc-ok">${titulo}</p>
    ${b.pixImagem ? `<img class="oc-qr" src="data:image/png;base64,${b.pixImagem}" alt="QR Code do Pix" width="200" height="200">` : ''}
    ${b.pixPayload ? `<label class="oc-campo">Pix copia e cola<input readonly value="${esc(b.pixPayload)}" data-act="occopiar"></label>
      <button class="oc-sec" data-act="occopiar">Copiar código Pix</button>` : ''}
    ${b.link ? `<a class="oc-sec" href="${esc(b.link)}" target="_blank" rel="noopener">Abrir o link de pagamento</a>` : '<p class="oc-dica">O link está sendo gerado. Toque em Já paguei em instantes.</p>'}
    <p class="oc-espera"><span class="oc-vela" aria-hidden="true"></span>Pedido feito. Aguardando a confirmação do pagamento${conferindo ? '…' : '.'}</p>
    <button class="oc-link" data-act="ocjapaguei">Já paguei, conferir agora</button>
  </div>`;
}
function aguardando(O, c, b) {
  return `<div class="oc-bloco oc-altar"><h2 class="oc-h2">Pagamento</h2>
    <p class="oc-resumo"><b>${esc(dataLonga(c.data))}</b>, às <b>${c.hora}</b> · ${moeda(b.valor)}</p>
    ${pix(b, 'Link gerado. Pague para garantir o horário.')}
    <p class="oc-dica">O horário fica guardado até ${horaDe(c.expiraEm)}. Pago depois disso, você escolhe outro horário se este tiver sido tomado.</p>
    <button class="oc-link" data-act="ocdesistir" data-id="${c.id}">Cancelar este pedido</button></div>`;
}

// ---------- consulta marcada ----------
function marcada(O, c) {
  const presencial = c.presencial === 'pago';
  const taxa = c.cobrancas.find((b) => b.tipo === 'presencial' && (b.status === 'pendente' || b.status === 'criando'));
  let pres = '';
  if (c.presencial === 'pedido') pres = '<p class="oc-aviso">Você pediu atendimento presencial. A casa vai responder aqui.</p>';
  else if (c.presencial === 'recusado') pres = '<p class="oc-aviso">Não deu para ser presencial nesta data. A consulta continua a distância.</p>';
  else if (c.presencial === 'aceito' && taxa) pres = pix(taxa, `Taxa do presencial: ${moeda(taxa.valor)}`);
  else if (c.presencial === 'aceito') pres = `<div class="oc-aviso"><p>A casa aceitou o atendimento presencial. Taxa a mais: <b>${moeda(c.presencialValor)}</b>.</p>
      ${O.cliente ? '' : '<label class="oc-campo">CPF (pedido pelo pagamento)<input id="oc-cpf-pres" inputmode="numeric" maxlength="14"></label>'}
      <button class="oc-cta" data-act="ocpagarpres" data-id="${c.id}" ${ui.enviando ? 'disabled' : ''}>Pagar a taxa do presencial</button></div>`;
  const cancelar = linkWhats(O.config.contato, mensagemPedirCancelamento(c, c.nome));
  return `<div class="oc-bloco oc-marcada oc-altar">
    ${c.status === 'conflito' ? '<p class="oc-aviso forte">Seu pagamento caiu depois que a reserva venceu e o horário foi tomado. Escolha um novo horário, sem pagar de novo.</p>' : ''}
    <p class="oc-selo-st">${STATUS[c.status]}</p>
    <p class="oc-quando">${esc(dataLonga(c.data))}<b>${c.hora}</b></p>
    <p class="oc-modo ${presencial ? 'pres' : ''}">${presencial ? `Atendimento presencial · ${esc(ENDERECO)}` : 'Atendimento a distância'}</p>
    <dl class="oc-dados"><dt>Nome</dt><dd>${esc(c.nome)}</dd><dt>Nascimento</dt><dd>${esc(c.nascimento)}</dd><dt>Mãe</dt><dd>${esc(c.mae)}</dd><dt>WhatsApp</dt><dd>${esc(c.whatsapp)}</dd></dl>
    ${pres}
    <button class="${c.status === 'conflito' ? 'oc-cta' : 'oc-sec'}" data-act="ocreagendar" data-id="${c.id}">Reagendar</button>
    ${c.status === 'confirmada' && !c.presencial ? `<button class="oc-sec" data-act="ocpedirpres" data-id="${c.id}">Pedir atendimento presencial</button>` : ''}
    <p class="oc-dica">Precisa cancelar? <a href="${cancelar}" target="_blank" rel="noopener">Fale com a casa pelo WhatsApp</a> e a gente resolve com você.</p>
  </div>`;
}

// ---------- tela ----------
export function render() {
  const O = estado.oraculo;
  if (O === null) { carregarOraculo(); return '<div class="loading">Carregando a agenda…</div>'; }
  if (O.erro) return `<section class="panel"><div class="card"><p class="erro">${esc(O.erro)}</p><button class="btn" data-act="ocrecarregar">Tentar de novo</button></div></section>`;
  O.config = configOraculo(O.config);
  const hoje = O.hoje || agoraBR().data;
  const reservada = O.minhas.find(ativa);
  const conflito = O.minhas.find((c) => c.status === 'conflito');
  const confirmada = O.minhas.find((c) => c.status === 'confirmada' && futura(c, hoje));
  const reagendando = ui.reagendar && O.minhas.find((c) => c.id === ui.reagendar && ['confirmada', 'conflito'].includes(c.status));
  if (!reagendando) ui.reagendar = null;
  let corpo;
  const b = reservada && pendente(reservada);
  const taxa = confirmada && confirmada.cobrancas.some((x) => x.tipo === 'presencial' && x.status === 'pendente');
  if (reagendando) corpo = agenda(O, reagendando);
  else if (b) corpo = aguardando(O, reservada, b);
  else if (reservada && !ui.trocar) corpo = formulario(O, reservada);
  else if (conflito || confirmada) corpo = marcada(O, conflito || confirmada);
  else corpo = agenda(O, null);
  conferirPagamento(!!(b || taxa));
  return `<section class="panel oc">${topo()}${corpo}${rodape(O)}</section>`;
}

// ---------- ações ----------
const formDe = (el) => el.closest('form') || document.getElementById('f-oraculo');
async function enviando(fn) {
  if (ui.enviando) return null;
  ui.enviando = true;
  avisar();
  try { return await fn(); } finally { ui.enviando = false; avisar(); }
}

export const cliques = {
  ocrecarregar: () => { estado.oraculo = null; avisar(); },
  ocmes: (el) => {
    const [y, m] = ui.mes.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + Number(el.dataset.d), 1));
    ui.mes = d.toISOString().slice(0, 7);
    avisar();
  },
  ocdia: (el) => { ui.data = el.dataset.data; ui.hora = null; avisar(); },
  ochora: (el) => { ui.hora = el.dataset.hora; avisar(); },
  ocvoltar: () => { ui.reagendar = null; avisar(); },
  octrocar: () => { ui.trocar = true; ui.data = null; ui.hora = null; avisar(); },
  ocreagendar: (el) => { ui.reagendar = el.dataset.id; ui.data = null; ui.hora = null; ui.mes = null; avisar(); },
  occonfirmar: () => enviando(async () => {
    const r = await acaoOraculo('reservar', { data: ui.data, hora: ui.hora, consultaId: ui.reagendar || undefined });
    if (!r) { estado.oraculo = null; return; }   // horário tomado: busca a agenda de novo
    if (ui.reagendar) toast('Consulta reagendada.');
    Object.assign(ui, { reagendar: null, trocar: false, data: null, hora: null });
    window.scrollTo(0, 0);
  }),
  ocpagar: (el) => {
    const f = formDe(el);
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    return enviando(async () => {
      const r = await acaoOraculo('pagar', { id: f.dataset.id, nome: v.nome, nascimento: v.nascimento, mae: v.mae, whatsapp: v.whatsapp, cpf: v.cpf, presencial: !!v.presencial });
      if (r) { f.reset(); toast('Link gerado. Aguardando o pagamento.'); }
    });
  },
  ocdesistir: (el) => enviando(async () => {
    if (await acaoOraculo('desistir', { id: el.dataset.id })) { Object.assign(ui, { trocar: false, data: null, hora: null }); toast('Pedido cancelado.'); }
  }),
  ocjapaguei: async () => { toast('Conferindo o pagamento…'); await carregarOraculo(true); },
  occopiar: () => {
    const input = document.querySelector('.oc-pix input[readonly]');
    if (!input) return;
    const fb = () => { input.select(); document.execCommand('copy'); toast('Código Pix copiado.'); };
    try { navigator.clipboard.writeText(input.value).then(() => toast('Código Pix copiado.'), fb); } catch { fb(); }
  },
  ocpedirpres: (el) => enviando(async () => { if (await acaoOraculo('presencial', { id: el.dataset.id })) toast('Pedido enviado. A casa responde aqui.'); }),
  ocpagarpres: (el) => enviando(() => acaoOraculo('pagarPresencial', { id: el.dataset.id, cpf: document.getElementById('oc-cpf-pres')?.value })),
};
export const mudancas = {};
