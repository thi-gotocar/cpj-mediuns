// Sub-aba Admin do Oráculo: a agenda de quem administra (o cliente fica em oraculo.js; os mesmos dados, estado.oraculo).
// Semana (como a faixa da aba Gira) ou o mês inteiro; o dia com compromisso leva o 🔮. Tocar num dia abre o dia abaixo
// do calendário: a grade de horários com as consultas, os compromissos da admin e os horários de consulta (livre ou bloqueado);
// o ＋ de cada hora cria um compromisso (início, fim, nome, telefone e anotação). Abaixo: Visível para todos, o aviso no
// celular e a configuração da agenda. O dia abre logo abaixo do calendário (o calendário continua à vista). Quem tem só o Ver do Oráculo vê a agenda, sem mudar nada.

import { estado, carregarOraculo, acaoOraculo, avisar } from '../estado.js';
import { esc, toast } from '../util.js';
import { calendarioMes, mesMais } from '../calendario.js';
import { configOraculo, agoraBR, somarDias, diaDaSemana, SEMANA_CURTA, MESES, STATUS, moeda, dataLonga, linkWhats, maisHora } from '/shared/oraculo.js';

if (!document.querySelector('link[data-oraculo]')) {
  const l = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/css/oraculo.css' });
  l.dataset.oraculo = '';
  document.head.append(l);
}

const A = { sem: null, mes: false, mesCal: null, dia: null, form: null, aberta: null, cancelar: null, cancelada: null, cfg: false };
export function limpar() { Object.assign(A, { dia: null, form: null, aberta: null, cancelar: null, cancelada: null }); }

const ATIVAS = ['reservada', 'confirmada', 'conflito'];
const consultasDo = (O, d) => (O.todas || []).filter((c) => c.data === d && ATIVAS.includes(c.status)).sort((a, b) => a.hora.localeCompare(b.hora));
const eventosDo = (O, d) => (O.eventos || []).filter((e) => e.data === d);
const diaBloqueado = (O, d) => O.bloqueios.some((b) => b.data === d && !b.hora);
const pendente = (c) => c.cobrancas.some((b) => b.status === 'pendente' || b.status === 'criando');
const rotulo = (c) => (c.status === 'reservada' ? (pendente(c) ? 'aguardando pagamento' : 'preenchendo') : STATUS[c.status].toLowerCase());

// Marcas do dia no calendário: 🔮 com compromisso (consulta ou da admin), ⛔ dia bloqueado.
function marcas(O) {
  return (d) => {
    const n = consultasDo(O, d).length + eventosDo(O, d).length;
    return `${n ? `<i class="oc-ic" aria-hidden="true">🔮</i>${n > 1 ? `<i class="oc-ic-n">${n}</i>` : ''}` : ''}${diaBloqueado(O, d) ? '<i class="oc-ic" aria-hidden="true">⛔</i>' : ''}`;
  };
}

// ---------- semana / mês ----------
function calendario(O) {
  const m = marcas(O);
  if (A.mes) {
    A.mesCal ||= A.sem.slice(0, 7);
    return `<div class="gn-sem"><div class="gn-sem-h"><b>Calendário</b><button type="button" class="btn small gn-mes-bt" data-act="ocamesbt" aria-expanded="true">Semana</button></div>
      <div class="gira-cal">${calendarioMes({ mes: A.mesCal, sel: A.dia, acaoDia: 'ocadia', acaoMes: 'ocamesnav', marcas: m })}</div></div>`;
  }
  const ini = somarDias(A.sem, -diaDaSemana(A.sem));
  const [y, mm] = ini.split('-').map(Number);
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  const hoje = agoraBR().data;
  return `<div class="gn-sem"><div class="gn-sem-h">
      <button type="button" class="btn small" data-act="ocasem" data-v="-7" aria-label="Semana anterior">◂</button>
      <b>${MESES[mm - 1]} de ${y}</b>
      <button type="button" class="btn small" data-act="ocasem" data-v="7" aria-label="Próxima semana">▸</button>
      <button type="button" class="btn small gn-mes-bt" data-act="ocamesbt" aria-expanded="false">Mês</button></div>
    <div class="gn-dias">${dias.map((d, i) => `<button type="button" class="gn-dia${d === (A.dia || hoje) ? ' sel' : ''}" data-act="ocadia" data-d="${d}" aria-label="${esc(dataLonga(d))}" aria-pressed="${d === A.dia}">
      <small>${SEMANA_CURTA[i]}</small><b>${Number(d.slice(8))}</b><span class="di-marcas">${m(d)}</span></button>`).join('')}</div>
    <p class="di-leg muted"><span><i aria-hidden="true">🔮</i> tem compromisso</span><span><i aria-hidden="true">⛔</i> dia bloqueado</span><span>Toque no dia para abrir.</span></p></div>`;
}

// ---------- dia na tela toda ----------
function detalheConsulta(O, c) {
  const confirmar = A.cancelar === c.id;
  const pres = O.admin && (c.presencial === 'pedido' || (c.presencial === 'aceito' && !c.cobrancas.some((x) => x.tipo === 'presencial')));
  return `<div class="oc-det">
    <dl class="oc-dados"><dt>WhatsApp</dt><dd>${c.whatsapp ? `<a href="${linkWhats(c.whatsapp, '')}" target="_blank" rel="noopener">${esc(c.whatsapp)}</a>` : '—'}</dd>
      <dt>Nascimento</dt><dd>${esc(c.nascimento || '—')}</dd><dt>Mãe</dt><dd>${esc(c.mae || '—')}</dd>
      <dt>Atendimento</dt><dd>${c.presencial === 'pago' ? 'presencial' : 'a distância'}${c.presencial === 'pedido' ? ' (pediu presencial)' : ''}</dd></dl>
    ${pres ? `<div class="oc-adm-pres">
      <span>${c.presencial === 'pedido' ? 'Pediu atendimento presencial.' : `Presencial aceito (${moeda(c.presencialValor)}), aguardando o cliente pagar.`}</span>
      <input class="oc-in" id="oc-taxa-${c.id}" inputmode="decimal" placeholder="Taxa R$" value="${c.presencialValor ?? ''}">
      <button class="oc-mini" data-act="ocapresresp" data-id="${c.id}" data-aceitar="1">Aceitar</button>
      <button class="oc-mini" data-act="ocapresresp" data-id="${c.id}" data-aceitar="0">Recusar</button></div>` : ''}
    ${O.admin ? (confirmar
      ? `<div class="oc-adm-canc"><input class="oc-in" id="oc-motivo" maxlength="200" placeholder="Motivo (opcional, vai na mensagem)">
          <button class="oc-mini perigo" data-act="ocacancelar" data-id="${c.id}">Cancelar consulta</button><button class="oc-mini" data-act="ocacancelarnao">Voltar</button></div>`
      : `<button class="oc-mini" data-act="ocacancelarsim" data-id="${c.id}">Cancelar consulta…</button>`) : ''}
  </div>`;
}
function formEvento() {
  const f = A.form;
  return `<form id="f-oraculo-ev" class="oc-ev-form" data-rascunho data-id="${f.id || 'novo'}" autocomplete="off">
    <h3>${f.id ? 'Editar compromisso' : 'Novo compromisso'}</h3>
    <div class="oc-cfg-lin"><label class="oc-campo">Início<input type="time" name="inicio" required value="${f.inicio}"></label>
      <label class="oc-campo">Fim<input type="time" name="fim" required value="${f.fim === '24:00' ? '23:59' : f.fim}"></label></div>
    <label class="oc-campo">Nome do cliente<input name="nome" required maxlength="120" value="${esc(f.nome || '')}"></label>
    <label class="oc-campo">Telefone<input name="telefone" inputmode="tel" data-mascara="tel" maxlength="16" placeholder="(11) 90000-0000" value="${esc(f.telefone || '')}"></label>
    <label class="oc-campo">Anotação<textarea name="nota" rows="3" maxlength="500">${esc(f.nota || '')}</textarea></label>
    <span class="oc-acoes"><button class="oc-mini primario" type="button" data-act="ocaevsalvar">Salvar</button>
      <button class="oc-mini" type="button" data-act="ocaevfechar">Cancelar</button>
      ${f.id ? `<button class="oc-mini perigo" type="button" data-act="ocaevexcluir" data-id="${f.id}">Excluir</button>` : ''}</span>
  </form>`;
}
function telaDia(O) {
  const d = A.dia;
  const cfg = O.config;
  const agora = agoraBR();
  const cons = consultasDo(O, d);
  const evs = eventosDo(O, d);
  const bloqDia = diaBloqueado(O, d);
  const naAgenda = cfg.dias.includes(diaDaSemana(d));
  // Grade das 8h às 20h, alargada para caber o que estiver fora disso.
  const horas = [...cons.map((c) => c.hora), ...evs.map((e) => e.inicio), ...(naAgenda ? cfg.horarios : [])].map((h) => Number(h.slice(0, 2)));
  const de = Math.min(8, ...horas), ate = Math.max(20, ...horas);
  const linhas = [];
  for (let h = de; h <= ate; h++) {
    const hh = String(h).padStart(2, '0');
    const naHora = (x) => x.slice(0, 2) === hh;
    const itens = [
      ...cons.filter((c) => naHora(c.hora)).map((c) => ({ t: c.hora, html: `<button class="oc-g-item cons st-${c.status}${A.aberta === c.id ? ' aberto' : ''}" data-act="ocaconsulta" data-id="${c.id}" aria-expanded="${A.aberta === c.id}">
          <b>${c.hora}–${maisHora(c.hora)}</b> ${esc(c.nome || '(sem nome)')}<span class="oc-tag">${esc(rotulo(c))}</span>${c.presencial === 'pago' ? '<span class="oc-tag pres">presencial</span>' : ''}</button>${A.aberta === c.id ? detalheConsulta(O, c) : ''}` })),
      ...evs.filter((e) => naHora(e.inicio)).map((e) => ({ t: e.inicio, html: `<button class="oc-g-item ev" data-act="ocaev" data-id="${e.id}">
          <b>${e.inicio}–${e.fim}</b> ${esc(e.nome)}${e.telefone ? ` · ${esc(e.telefone)}` : ''}${e.nota ? `<small>${esc(e.nota)}</small>` : ''}</button>` })),
    ];
    // Horários de consulta desta hora ainda sem ninguém: livre ou bloqueado (a admin troca).
    if (naAgenda && !bloqDia) {
      for (const hc of cfg.horarios.filter((x) => naHora(x) && !cons.some((c) => c.hora === x))) {
        const bloq = O.bloqueios.some((b) => b.data === d && b.hora === hc);
        const passou = d < agora.data || (d === agora.data && hc <= agora.hora);
        itens.push({ t: hc, html: `<span class="oc-g-item vaga${bloq ? ' bloq' : ''}"><b>${hc}</b> ${bloq ? 'consulta bloqueada' : passou ? 'horário passou' : 'horário de consulta livre'}
          ${O.admin && !passou ? `<button class="oc-mini" data-act="ocabloq" data-data="${d}" data-hora="${hc}" data-b="${bloq ? 0 : 1}">${bloq ? 'Liberar' : 'Bloquear'}</button>` : ''}</span>` });
      }
    }
    itens.sort((a, b) => a.t.localeCompare(b.t));
    linhas.push(`<div class="oc-g-l"><span class="oc-g-h">${hh}:00</span><div class="oc-g-itens">${itens.map((x) => x.html).join('')}</div>
      ${O.admin ? `<button class="oc-g-mais" data-act="ocanovo" data-h="${hh}:00" aria-label="Novo compromisso às ${hh}:00">＋</button>` : ''}</div>`);
  }
  const msg = A.cancelada ? `<div class="oc-aviso"><p>Consulta cancelada. Mande a mensagem para o cliente:</p><pre class="oc-msg">${esc(A.cancelada.mensagem)}</pre>
    ${A.cancelada.whatsapp ? `<a class="oc-sec" href="${linkWhats(A.cancelada.whatsapp, A.cancelada.mensagem)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>` : ''}
    <button class="oc-mini" data-act="ocacopiarmsg">Copiar</button> <button class="oc-mini" data-act="ocafecharmsg">Fechar</button></div>` : '';
  return `<div class="oc-dia-tela" id="oc-dia">
    <div class="oc-dia-cab">
      <button class="btn small" data-act="ocadiamais" data-v="-1" aria-label="Dia anterior">‹</button>
      <h2>${esc(dataLonga(d))}</h2>
      <button class="btn small" data-act="ocadiamais" data-v="1" aria-label="Próximo dia">›</button>
      <button class="btn small" data-act="ocavoltar" aria-label="Fechar o dia">✕</button></div>
    ${msg}
    ${!naAgenda ? '<p class="oc-dica">Dia da semana fora da agenda de consultas (só compromissos da admin).</p>' : ''}
    ${O.admin && naAgenda ? `<button class="oc-sec" data-act="ocabloq" data-data="${d}" data-hora="" data-b="${bloqDia ? 0 : 1}">${bloqDia ? 'Liberar o dia para consultas' : 'Bloquear o dia todo para consultas'}</button>` : ''}
    ${A.form && A.form.data === d ? formEvento() : ''}
    <div class="oc-grade-dia">${linhas.join('')}</div>
  </div>`;
}

// ---------- configuração ----------
function avisos(O) {
  if (!O.push) return '<p class="oc-dica">Avisos no celular desligados: faltam as chaves VAPID na Vercel.</p>';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return '<p class="oc-dica">Este aparelho não recebe avisos. No iPhone, instale o app na tela de início (iOS 16.4 ou mais novo) e abra por ele.</p>';
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return '<p class="oc-dica">Os avisos estão bloqueados nos ajustes do aparelho para este app.</p>';
  return `<button class="oc-sec" data-act="ocapush">${estado.ocPush ? 'Avisos ligados neste aparelho · Desligar' : 'Ativar avisos de consulta paga neste aparelho'}</button>`;
}
function config(O) {
  const c = O.config;
  return `<form id="f-oraculo-cfg" class="oc-cfg" data-rascunho autocomplete="off">
    <label class="oc-campo">Horários de início das consultas (separados por vírgula)<input name="horarios" value="${esc(c.horarios.join(', '))}"></label>
    <fieldset class="oc-dias"><legend>Dias com consulta</legend>${SEMANA_CURTA.map((n, i) => `<label class="chip"><input type="checkbox" name="dias" value="${i}" ${c.dias.includes(i) ? 'checked' : ''}> ${n}</label>`).join('')}</fieldset>
    <div class="oc-cfg-lin"><label class="oc-campo">Limite por dia<input name="limiteDia" type="number" min="1" max="24" value="${c.limiteDia}"></label>
      <label class="oc-campo">Agenda aberta por (dias)<input name="diasFuturos" type="number" min="1" max="365" value="${c.diasFuturos}"></label></div>
    <div class="oc-cfg-lin"><label class="oc-campo">Valor da consulta (R$)<input name="valor" inputmode="decimal" value="${String(c.valor).replace('.', ',')}"></label>
      <label class="oc-campo">WhatsApp da casa<input name="contato" inputmode="tel" value="${esc(c.contato)}"></label></div>
    <button class="oc-sec" type="button" data-act="ocacfg">Salvar agenda</button>
  </form>`;
}

export function render() {
  const O = estado.oraculo;
  if (O === null) { carregarOraculo(); return '<div class="loading">Carregando a agenda…</div>'; }
  if (O.erro) return `<section class="panel"><div class="card"><p class="erro">${esc(O.erro)}</p><button class="btn" data-act="ocarecarregar">Tentar de novo</button></div></section>`;
  if (!O.veTodas) return '<section class="panel"><p class="muted">Só quem administra o Oráculo vê esta agenda.</p></section>';
  O.config = configOraculo(O.config);
  A.sem ||= agoraBR().data;
  return `<section class="panel oc-adm">
    <h2>Agenda do Oráculo</h2>
    ${calendario(O)}
    ${A.dia ? telaDia(O) : ''}
    ${O.admin ? `<div class="oc-adm-cfg">
      <label class="of-sw oc-pub"><input type="checkbox" role="switch" data-act="ocapub" ${O.publicado ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
      <p class="oc-dica">${O.publicado ? 'Todos que entram no app veem a aba Oráculo e podem agendar.' : 'Desligado: só quem administra o Oráculo vê a aba.'}</p>
      ${avisos(O)}
      <button class="oc-sec" data-act="ocacfgabrir" aria-expanded="${A.cfg}">${A.cfg ? 'Fechar a configuração' : 'Horários, dias e valor das consultas'}</button>
      ${A.cfg ? config(O) : ''}</div>` : ''}
  </section>`;
}

// ---------- ações ----------
function base64Url(s) {
  const b = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function alternarPush() {
  const reg = await navigator.serviceWorker.ready;
  const atual = await reg.pushManager.getSubscription();
  if (estado.ocPush && atual) {
    await acaoOraculo('push', { endpoint: atual.endpoint, remover: true });
    await atual.unsubscribe().catch(() => {});
    estado.ocPush = false;
    toast('Avisos desligados neste aparelho.');
    return;
  }
  if ((await Notification.requestPermission()) !== 'granted') { toast('Sem permissão, o aparelho não mostra os avisos.'); avisar(); return; }
  const sub = atual || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64Url(estado.oraculo.push) });
  if (await acaoOraculo('push', { endpoint: sub.endpoint })) { estado.ocPush = true; toast('Pronto: este aparelho avisa quando uma consulta for paga.'); }
}
// Já tem inscrição neste aparelho? (para o botão dizer Ligado/Desligar).
if (navigator.serviceWorker && 'PushManager' in globalThis) {
  navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => { if (s) { estado.ocPush = true; avisar(); } }).catch(() => {});
}
const rolarAoForm = () => setTimeout(() => document.getElementById('f-oraculo-ev')?.scrollIntoView({ block: 'center' }), 0);
// Abre o dia logo abaixo do calendário (a semana ou o mês acompanham o dia) e rola até ele.
const abrirDia = (d) => {
  Object.assign(A, { dia: d, sem: d, mesCal: d.slice(0, 7), form: null, aberta: null, cancelar: null });
  avisar();
  setTimeout(() => document.getElementById('oc-dia')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
};

export const cliques = {
  ocarecarregar: () => { estado.oraculo = null; avisar(); },
  ocasem: (el) => { A.sem = somarDias(A.sem, Number(el.dataset.v)); avisar(); },
  ocamesbt: () => { A.mes = !A.mes; A.mesCal = A.sem.slice(0, 7); avisar(); },
  ocamesnav: (el) => { A.mesCal = mesMais(A.mesCal, Number(el.dataset.v)); avisar(); },
  ocadia: (el) => (el.dataset.d === A.dia ? cliques.ocavoltar() : abrirDia(el.dataset.d)),
  ocavoltar: () => { limpar(); avisar(); },
  ocadiamais: (el) => abrirDia(somarDias(A.dia, Number(el.dataset.v))),
  ocaconsulta: (el) => { A.aberta = A.aberta === el.dataset.id ? null : el.dataset.id; A.cancelar = null; avisar(); },
  ocanovo: (el) => { A.form = { data: A.dia, inicio: el.dataset.h, fim: maisHora(el.dataset.h) }; avisar(); rolarAoForm(); },
  ocaev: (el) => {
    const e = (estado.oraculo.eventos || []).find((x) => x.id === el.dataset.id);
    if (!e) return;
    A.form = { ...e };
    avisar();
    rolarAoForm();
  },
  ocaevfechar: () => { A.form = null; avisar(); },
  ocaevsalvar: async (el) => {
    const f = el.closest('form');
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const r = await acaoOraculo('evento', { id: A.form?.id, data: A.dia, inicio: v.inicio, fim: v.fim, nome: v.nome, telefone: v.telefone, nota: v.nota });
    if (r) { f.reset(); A.form = null; toast('Compromisso salvo.'); avisar(); }
  },
  ocaevexcluir: async (el) => {
    if (!confirm('Excluir este compromisso?')) return;
    if (await acaoOraculo('eventoExcluir', { id: el.dataset.id })) { A.form = null; toast('Compromisso excluído.'); avisar(); }
  },
  ocabloq: (el) => acaoOraculo('bloquear', { data: el.dataset.data, hora: el.dataset.hora, bloquear: el.dataset.b === '1' }),
  ocacancelarsim: (el) => { A.cancelar = el.dataset.id; avisar(); },
  ocacancelarnao: () => { A.cancelar = null; avisar(); },
  ocacancelar: async (el) => {
    const r = await acaoOraculo('cancelar', { id: el.dataset.id, motivo: document.getElementById('oc-motivo')?.value || '' });
    if (r) { Object.assign(A, { cancelar: null, aberta: null, cancelada: r.cancelada }); avisar(); window.scrollTo(0, 0); }
  },
  ocacopiarmsg: () => { navigator.clipboard?.writeText(A.cancelada?.mensagem || '').then(() => toast('Mensagem copiada.'), () => toast('Não deu para copiar.')); },
  ocafecharmsg: () => { A.cancelada = null; avisar(); },
  ocapresresp: (el) => acaoOraculo('responderPresencial', { id: el.dataset.id, aceitar: el.dataset.aceitar === '1', valor: document.getElementById('oc-taxa-' + el.dataset.id)?.value }),
  ocacfgabrir: () => { A.cfg = !A.cfg; avisar(); },
  ocacfg: async (el) => {
    const f = el.closest('form');
    const fd = new FormData(f);
    const config = {
      horarios: String(fd.get('horarios')).split(/[,;\s]+/).filter(Boolean).map((h) => (/^\d:\d\d$/.test(h) ? '0' + h : h)),
      dias: fd.getAll('dias').map(Number), limiteDia: Number(fd.get('limiteDia')), diasFuturos: Number(fd.get('diasFuturos')),
      valor: fd.get('valor'), contato: fd.get('contato'),
    };
    if (await acaoOraculo('config', { config })) { f.reset(); toast('Agenda salva.'); }
  },
  ocapush: () => alternarPush().catch((e) => { toast('Não deu para ligar os avisos: ' + (e?.message || e)); avisar(); }),
};
export const mudancas = {
  ocapub: async (el) => {
    const r = await acaoOraculo('publicar', { publicado: el.checked });
    if (r) toast(r.publicado ? 'O Oráculo está visível para todos.' : 'O Oráculo ficou visível só para quem administra.');
  },
};
