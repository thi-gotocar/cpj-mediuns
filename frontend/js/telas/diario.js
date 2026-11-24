// Aba Diário: o registro pessoal de cada dia (regras em shared/diario.js; servidor em api/_lib/diario.js).
// No topo, "Como você está hoje?" com a faixa da semana (o botão Mês abre o calendário inteiro; ponto dourado: gira
// registrada; lilás: dia comum com manhã e noite; 🌿: banho tomado; 🏋️: atividade física), a lua do dia, o Dia de gira e
// os cuidados do dia em blocos de toque (preceito, atividade física, água e banho de ervas). Depois a Galeria de fotos
// (carrossel, curtidas, uma foto por pessoa), o card Para hoje (Pílula de sabedoria e banhos para tomar) e o Registro em
// passos, um aberto por vez. O dia muda conforme a agenda (ou o interruptor "Dia de gira"): na gira, Chegada, Saída,
// Orientações do guia e Banho; no dia comum, Manhã, Fim do dia e Banho (com o Orientador, que sugere um banho quando o
// estado é pesado). No fim, o bloco do root.
// Cada check-in tem a escala de rostos (1 a 5), as emoções em dois grupos (leve e densa; até 3) e a energia (barra de
// 1 a 5, do vermelho ao verde).
// Toques salvam na hora; os textos salvam ao sair do campo. O root liga "Visível para todos"; desligado, só ele vê.
// No card Banho, o root também liga e desliga o Orientador para todos (desligado, só ele vê).

import { estado, avisar, carregarDiario, salvarDiaDiario, publicarDiario, orientadorDiario, acaoGaleriaDiario } from '../estado.js';
import { esc, toast, hoje, dLong, dDM, pd } from '../util.js';
import { linhaDaEntidade, LINHA_LABEL } from '/shared/regras.js';
import {
  EMOCOES, GRUPOS_EMOCOES, HUMOR, MAX_EMOCOES, GRUPOS_SENSACOES, SONO, LINHAS_DIARIO, TEMPERATURAS, AVISO_QUENTE, ERVAS_SUGESTOES, MAX_CONSELHO, MAX_REFLEXAO,
  ORIXAS_BANHO, ERVAS_APOSTILA, MAX_ERVAS_BANHO, litros, temperaturaDaErva, sugestaoOrientador, faseDaLua, deltaAxe, FLUXOS, SINTOMAS_CICLO, resumoCiclo,
  acompanhamento, MIN_COMPARAR,
} from '/shared/diario.js';
import { BANHO_ORIXA } from '/shared/banhos.js';
import { calendarioMes, mesMais } from '../calendario.js';
import { abrirImagem, reduzirJpeg, base64 } from '../foto.js';

// dia: data aberta; mes: mês do calendário; rasc: textos ainda não salvos por data; ouvindo: campo com o microfone ligado;
// gal: foto escolhida para a galeria (base64), descrição e envio.
// mesAberto: calendário do mês aberto no lugar da faixa da semana; passo: passo aberto do Registro por dia (0 = nenhum);
// emoEd: sentimentos em edição ('data|campo'; fora disso, os escolhidos aparecem recolhidos com Trocar).
// acomp: card Seu acompanhamento aberto; periodo: dias olhados para trás (PERIODOS).
const ui = { dia: hoje(), mes: hoje().slice(0, 7), rasc: {}, ouvindo: null, gal: { foto: null, desc: '', enviando: false }, mesAberto: false, passo: {}, emoEd: new Set(), cuid: null, acomp: false, periodo: 90 };
let reconhecimento = null;
export function limpar() { ui.dia = hoje(); ui.mes = ui.dia.slice(0, 7); ui.mesAberto = false; ui.passo = {}; ui.emoEd.clear(); ui.cuid = null; }

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const LINHAS_OK = new Set(LINHAS_DIARIO.map(([k]) => k));
const copia = (o) => JSON.parse(JSON.stringify(o || {}));
const dadosDe = (data) => estado.diario?.dias?.find((x) => x.data === data)?.dados || {};
// Olhinho dos sentimentos: esconde as descrições (o que é cada emoção e o subtítulo dos grupos); fica no aparelho.
const PREF_DESC = 'sm-diario-desc';
let descOcultaMem = false;
const descOculta = () => { try { const v = localStorage.getItem(PREF_DESC); return v === null ? descOcultaMem : v === '1'; } catch { return descOcultaMem; } };
const OLHO = (fechado) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${fechado ? '<path d="M4 4l16 16"/>' : ''}</svg>`;

// Gira na agenda: gira cadastrada nesse dia ou evento do tipo gira. O amaci conta como gira (também tem preceito e banho)
// e só vale para a corrente e os alunos: o servidor só manda o amaci às turmas marcadas (ex-alunos nem entram no app),
// e o consulente fica de fora aqui também.
const giraDaAgenda = (data) => estado.giras[data] || null;
const amaciNaAgenda = (data) => !estado.me?.consulente && (estado.eventos || []).some((e) => e.data === data && e.tipo === 'amaci');
const agendaTemGira = (data) => !!giraDaAgenda(data) || amaciNaAgenda(data) || (estado.eventos || []).some((e) => e.data === data && e.tipo === 'gira');
const ehGira = (data, d = dadosDe(data)) => (typeof d.gira === 'boolean' ? d.gira : agendaTemGira(data));
const completo = (b) => !!(b?.humor || b?.emo?.length || b?.energia);
// Linha do dia de gira: a escolhida ou, sem escolha, a da gira da agenda.
function linhaDoDia(data, d = dadosDe(data)) {
  if (d.linha) return d.linha;
  const l = linhaDaEntidade(giraDaAgenda(data)?.entidade);
  return LINHAS_OK.has(l) ? l : '';
}

function salvar(muda) {
  const d = copia(dadosDe(ui.dia));
  muda(d);
  return salvarDiaDiario(ui.dia, d);
}

// ---------- peças ----------
function chips(campo, lista, valor) {
  return `<div class="di-chips">${lista.map(([k, t]) => `<button type="button" class="di-chip" data-act="dichip" data-campo="${campo}" data-v="${k}" aria-pressed="${valor === k}">${t}</button>`).join('')}</div>`;
}
// Escala de rostos: como a pessoa se sente, de 1 (muito mal) a 5 (muito bem).
function rostos(campo, valor) {
  return `<div class="di-rostos" role="group" aria-label="Como você se sente, de 1 a 5">${HUMOR.map(([n, ico, t]) => `<button type="button" class="di-rosto" data-act="dienergia" data-campo="${campo}" data-v="${n}" aria-pressed="${valor === n}" aria-label="${t}">
    <span class="di-rosto-i" aria-hidden="true">${ico}</span><span class="di-rosto-t">${t}</span></button>`).join('')}</div>`;
}
// Emoções em dois grupos; marcadas até MAX_EMOCOES; embaixo, o que é cada uma das marcadas.
function emocoes(campo, marcadas = []) {
  const chave = ui.dia + '|' + campo;
  const oculta = descOculta();
  const olho = `<button type="button" class="btn link small di-olho" data-act="diolho" aria-pressed="${oculta}" aria-label="${oculta ? 'Mostrar as descrições' : 'Ocultar as descrições'}" title="${oculta ? 'Mostrar as descrições' : 'Ocultar as descrições'}">${OLHO(oculta)}</button>`;
  if (marcadas.length && !ui.emoEd.has(chave)) {
    const sel = EMOCOES.filter(([k]) => marcadas.includes(k));
    return `<div class="di-emo-rec">${sel.map(([, t]) => `<span class="di-chip" aria-pressed="true">${t}</span>`).join('')}<button type="button" class="btn link small" data-act="diemotrocar" data-campo="${campo}">Trocar</button>${olho}</div>
      ${oculta ? '' : `<ul class="di-emo-sel">${sel.map(([, t, x]) => `<li><b>${t}</b> · ${x}</li>`).join('')}</ul>`}`;
  }
  const pronto = marcadas.length ? `<button type="button" class="btn small di-emo-pronto" data-act="diemopronto" data-campo="${campo}">Pronto</button>` : '';
  const grupos = GRUPOS_EMOCOES.map((g, i) => `<div class="di-grupo di-grupo-${g.k}"><p class="di-grupo-h"><b>${g.k === 'leve' ? '☀️' : '🌧️'} ${g.titulo}${i === 0 ? olho : ''}</b>${oculta ? '' : `<span>${g.sub}</span>`}</p>
    <div class="di-chips">${g.itens.map(([k, t]) => {
      const on = marcadas.includes(k);
      return `<button type="button" class="di-chip" data-act="diemo" data-campo="${campo}" data-v="${k}" aria-pressed="${on}" ${!on && marcadas.length >= MAX_EMOCOES ? 'aria-disabled="true"' : ''}>${on ? '✓ ' : ''}${t}</button>`;
    }).join('')}</div></div>`).join('');
  const sel = EMOCOES.filter(([k]) => marcadas.includes(k));
  return `${grupos}${sel.length && !oculta ? `<ul class="di-emo-sel">${sel.map(([, t, x]) => `<li><b>${t}</b> · ${x}</li>`).join('')}</ul>` : ''}${pronto}`;
}
// Energia: barra de 1 (vermelho) a 5 (verde). Sem marcação, o pino fica apagado no meio até a pessoa tocar.
const NIVEL_ENERGIA = ['', 'Muito baixa', 'Baixa', 'Média', 'Boa', 'Alta'];
const textoEnergia = (n) => (n ? `${n} · ${NIVEL_ENERGIA[n]}` : 'Toque ou arraste para marcar');
function energia(campo, valor) {
  return `<div class="di-slide${valor ? '' : ' vazio'}" style="--cor:${valor ? corEnergia(valor) : 'var(--line)'}">
    <div class="di-slide-h"><output>${textoEnergia(valor)}</output>${valor ? `<button type="button" class="btn link small" data-act="dienlimpar" data-campo="${campo}">Limpar</button>` : ''}</div>
    <input type="range" min="1" max="5" step="1" value="${valor || 3}" data-act="dienslide" data-campo="${campo}" aria-label="Energia de 1 a 5" aria-valuetext="${textoEnergia(valor)}">
    <div class="di-en-leg muted"><span>baixa</span><span>alta</span></div></div>`;
}
// fixo: o campo mostra até 4 linhas e rola o resto (o conselho do guia pode ter umas 20 linhas).
function campoTexto(campo, rotulo, valor, max, voz, fixo = false) {
  const v = ui.rasc[ui.dia]?.[campo] ?? valor ?? '';
  const mic = voz && SR ? `<button type="button" class="btn small di-mic${ui.ouvindo === campo ? ' ouvindo' : ''}" data-act="divoz" data-campo="${campo}">${ui.ouvindo === campo ? '⏹ Parar' : '🎤 Falar'}</button>` : '';
  const linhas = fixo ? 4 : Math.min(8, Math.max(3, v.split('\n').length + 1));
  return `<label class="field di-txt${fixo ? ' di-txt-fixo' : ''}"><span class="di-txt-h">${rotulo}${mic}</span>
    <textarea id="di-${campo}" rows="${linhas}" maxlength="${max}" data-diario="${campo}" data-act="ditexto">${esc(v)}</textarea></label>`;
}
const corEnergia = (n) => `var(--di-en-${n})`;
const ORIGEM = { guia: 'recomendado pelo guia', orientador: 'sugerido pelo Orientador', proprio: 'anotado por você' };

// ---------- cuidados do dia ----------
const ICONE_CUIDADO = {
  preceito: '<path d="M12 3c2 3 3 4.5 3 6.5a3 3 0 0 1-6 0C9 7.5 10 6 12 3z"/><path d="M9 14h6v7H9z"/>',
  atividade: '<circle cx="14" cy="4.5" r="1.8"/><path d="M7 21l3-6 3 2v4"/><path d="M9 11l3-3 3 3 3 1"/><path d="M10 15l2-7"/>',
  agua: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  banho: '<path d="M5 19c8 0 13-5 14-14-9 1-14 6-14 14z"/><path d="M5 19l7-7"/>',
  ciclo: '<path d="M12 3s5.5 6 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
};
// Menstruada: fluxo, sintomas (opcionais) e o resumo do ciclo (dia do ciclo, previsão e energia).
function painelCiclo(C) {
  const R = resumoCiclo(estado.diario?.dias, hoje());
  const sint = C.sintomas || [];
  const info = [ui.dia === hoje() && R.diaAtual ? `Dia ${R.diaAtual} do ciclo` : '', R.proximo ? `próximo previsto por volta de ${dDM(R.proximo)} (média de ${R.media} dias)` : ''].filter(Boolean).join(' · ');
  return `<div class="di-hab-sub di-ciclo">
    <p class="di-rot">Fluxo</p><div class="di-chips">${FLUXOS.map(([k, t]) => `<button type="button" class="di-chip" data-act="dicicloval" data-k="fluxo" data-v="${k}" aria-pressed="${C.fluxo === k}">${t}</button>`).join('')}</div>
    <p class="di-rot">Sintomas <span class="muted">(opcional)</span></p><div class="di-chips">${SINTOMAS_CICLO.map(([k, t]) => `<button type="button" class="di-chip" data-act="dicicloval" data-k="sintomas" data-v="${k}" aria-pressed="${sint.includes(k)}">${t}</button>`).join('')}</div>
    ${info ? `<p class="muted di-ciclo-i">${esc(info)}</p>` : ''}
    ${R.energiaCiclo !== null ? `<p class="muted di-ciclo-i">Nos dias do ciclo, sua energia média foi ${String(R.energiaCiclo).replace('.', ',')}${R.energiaOutros !== null ? ` (nos outros, ${String(R.energiaOutros).replace('.', ',')})` : ''}.</p>` : ''}
  </div>`;
}

function cuidados(d) {
  const H = d.habitos || {};
  const feitos = ['preceito', 'atividade', 'agua', 'banho'].filter((k) => H[k]).length;
  const bloco = (k, t) => {
    const extra = !H[k] ? 'tocar' : k === 'agua' && H.litros ? `${String(H.litros).replace('.', ',')} L` : 'feito';
    return `<button type="button" class="di-cuid di-cuid-${k}" data-act="dihabt" data-k="${k}" aria-pressed="${!!H[k]}">
      <span class="di-cuid-i"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_CUIDADO[k]}</svg></span>
      <span class="di-cuid-t">${t}</span><small>${extra}</small></button>`;
  };
  const C = d.ciclo || {};
  const blocoCiclo = `<button type="button" class="di-cuid di-cuid-ciclo" data-act="diciclo" aria-pressed="${!!C.menstruada}">
      <span class="di-cuid-i"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_CUIDADO.ciclo}</svg></span>
      <span class="di-cuid-t">Menstruada</span><small>${C.menstruada ? (FLUXOS.find(([k]) => k === C.fluxo)?.[1] || 'sim') : 'tocar'}</small></button>`;
  let h = `<div class="di-hab"><p class="muted di-hab-n">Cuidados do dia · ${feitos} de 4</p>
    <div class="di-cuids cinco">${bloco('preceito', 'Preceito')}${bloco('atividade', 'Atividade física')}${bloco('agua', 'Água')}${bloco('banho', 'Banho de ervas')}${blocoCiclo}</div>`;
  // Só os detalhes do último bloco tocado (e marcado): Água, Banho de ervas ou Menstruada.
  if (ui.cuid === 'ciclo' && C.menstruada) h += painelCiclo(C);
  if (ui.cuid === 'agua' && H.agua) {
    h += `<label class="field di-hab-sub">Quantos litros?<input type="text" inputmode="decimal" maxlength="5" data-act="dilitros" placeholder="Ex.: 1,5" value="${H.litros ? String(H.litros).replace('.', ',') : ''}"></label>`;
  }
  if (ui.cuid === 'banho' && H.banho) {
    h += `<div class="di-hab-sub"><label class="field">Banho de orixá<select data-act="dihaborixa"><option value="">—</option>
      ${ORIXAS_BANHO.map((o) => `<option value="${esc(o)}" ${o === H.orixa ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
    if (H.orixa) {
      h += `<p class="muted di-hab-ervas">Ervas de ${esc(H.orixa)}: ${esc(BANHO_ORIXA[H.orixa].ervas.join(', '))}</p>`;
    } else {
      const E = H.ervas || [];
      h += `<p class="di-rot">ou as ervas <span class="muted">(até ${MAX_ERVAS_BANHO})</span></p>`;
      if (E.length) h += `<div class="di-ervas">${E.map((e, i) => `<span class="di-erva">${esc(e)}<button type="button" data-act="dirmhaberva" data-i="${i}" aria-label="Tirar ${esc(e)}">×</button></span>`).join('')}</div>`;
      if (E.length < MAX_ERVAS_BANHO) {
        h += `<select data-act="dihaberva" aria-label="Escolher erva"><option value="">＋ Escolher erva…</option>
          ${ERVAS_APOSTILA.filter((e) => !E.includes(e)).map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('')}</select>`;
      }
    }
    h += '</div>';
  }
  return h + '</div>';
}

// Marcas do calendário (faixa da semana e mês): gira, manhã e noite, banho, atividade física e amaci.
function marcasDosDias(D) {
  const porData = Object.fromEntries(D.dias.map((x) => [x.data, x.dados]));
  const marcas = (data) => {
    const x = porData[data];
    const M = [];
    if (x && ehGira(data, x)) M.push('<i class="di-p di-p-gira"></i>');
    else if (x && completo(x.antes) && completo(x.depois)) M.push('<i class="di-p di-p-dia"></i>');
    if (x?.banho?.feito || x?.habitos?.banho) M.push('<i class="di-folha">🌿</i>');
    if (x?.habitos?.atividade) M.push('<i class="di-folha">🏋️</i>');
    if (amaciNaAgenda(data)) M.push('<i class="di-folha">🕊️</i>');
    if (x?.ciclo?.menstruada) M.push('<i class="di-p di-p-ciclo"></i>');
    return M.join('');
  };
  return { porData, marcas };
}
const maisDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const diaSemana = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// O dia escolhido: a faixa da semana (‹ ›, até hoje) ou, com Mês, o calendário inteiro com a legenda.
function seletorDia(D) {
  const { porData, marcas } = marcasDosDias(D);
  const hj = hoje();
  if (ui.mesAberto) {
    return `<div class="di-cal">${calendarioMes({ mes: ui.mes, sel: ui.dia, acaoDia: 'didia', acaoMes: 'dimes', ate: hj, marcas, classe: (data) => (!porData[data] && agendaTemGira(data) ? 'agenda' : '') })}
      <div class="di-leg muted"><span><i class="di-p di-p-gira"></i> gira</span><span><i class="di-p di-p-dia"></i> manhã e noite</span><span>🌿 banho tomado</span><span>🏋️ atividade física</span><span>🕊️ amaci</span><span><i class="di-p di-p-ciclo"></i> ciclo</span></div></div>`;
  }
  // Os 7 dias em volta do escolhido (até 3 depois dele), sem passar de hoje.
  const fim = maisDias(ui.dia, 3) > hj ? hj : maisDias(ui.dia, 3);
  const ini = maisDias(fim, -6);
  const dias = Array.from({ length: 7 }, (_, i) => maisDias(ini, i));
  const prox = maisDias(fim, 1);
  return `<div class="di-semana">
    <button type="button" class="btn small di-sem-s" data-act="disemana" data-v="-7" aria-label="Semana anterior">‹</button>
    ${dias.map((d, i) => `<button type="button" class="di-sem-d${d === ui.dia ? ' sel' : ''}${!porData[d] && agendaTemGira(d) ? ' agenda' : ''}" data-act="didia" data-d="${d}" ${d > hj ? 'disabled' : ''} aria-pressed="${d === ui.dia}" aria-label="${dLong(d)}">
      <small>${'DSTQQSS'[diaSemana(d)]}</small><b>${Number(d.slice(8))}</b><span class="di-marcas">${marcas(d)}</span></button>`).join('')}
    <button type="button" class="btn small di-sem-s" data-act="disemana" data-v="7" aria-label="Próxima semana" ${prox > hj ? 'disabled' : ''}>›</button></div>`;
}

function cabecalho(D) {
  const d = dadosDe(ui.dia);
  const gira = ehGira(ui.dia, d);
  const auto = agendaTemGira(ui.dia);
  const nome = String(estado.me?.nome || '').split(' ')[0];
  const ehHoje = ui.dia === hoje();
  const [, nomeLua, iconeLua, textoLua] = faseDaLua(ui.dia);
  return `<div class="card di-cab"><p class="di-ola">${ehHoje ? `Olá${nome ? ', ' + esc(nome) : ''} 🤍` : 'Seu registro de'}</p>
    <h2>${ehHoje ? 'Como você está hoje?' : dLong(ui.dia)}</h2>
    <p class="muted di-data">${ehHoje ? `${dLong(ui.dia)} · ` : ''}<span title="${esc(textoLua)}"><span aria-hidden="true">${iconeLua}</span> ${nomeLua}</span></p>
    <p class="di-priv"><span aria-hidden="true">🔒</span> <span><b>Seu diário é só seu.</b> Ninguém da Casa lê o que você registra aqui, nem a administração.${D.galeria ? ' Só as fotos que você põe na Galeria são vistas pelos outros.' : ''}</span></p>
    ${seletorDia(D)}
    <div class="di-cab-l"><label class="of-sw"><input type="checkbox" role="switch" data-act="digira" ${gira ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>${ehHoje ? 'Hoje é dia de gira' : 'Dia de gira'}</b>
      <span class="muted">${auto ? (amaciNaAgenda(ui.dia) && !giraDaAgenda(ui.dia) ? '(amaci na agenda)' : '(pela agenda)') : ''}</span></label>
      <button type="button" class="btn small" data-act="dimesabrir" aria-expanded="${ui.mesAberto}">${ui.mesAberto ? 'Semana' : 'Mês'}</button></div>
    <p class="muted di-lua-t">${esc(textoLua)}</p>
    ${cuidados(d)}</div>`;
}

// ---------- Galeria de fotos da corrente ----------
// src: só no modo demo (a foto fica na memória da página).
const fotoUrl = (f) => f.src || `/api/pessoas?lista=diarioFoto&id=${encodeURIComponent(f.id)}&v=${encodeURIComponent(f.v)}`;
function galeria(D) {
  if (!D.galeria) return '';
  const L = D.galeria, g = ui.gal;
  const subir = !L.some((f) => f.minha) && !g.foto ? `<label class="btn small di-gal-subir">📷 Subir foto<input type="file" accept="image/*" data-act="digalfoto" hidden></label>` : '';
  let h = `<div class="card di-gal"><div class="grp-h"><h2>📸 Galeria da semana${L.length ? ` <span class="count">${L.length}</span>` : ''}</h2>${subir}</div>
    <p class="muted di-gal-sub">Uma foto por pessoa. Cada foto fica 6 dias desde o envio.</p>`;
  h += L.length ? `<div class="di-gal-l" role="list">${L.map((f) => {
    const apagar = f.minha || D.root;
    const conf = estado.confirm === 'dg:' + f.id;
    return `<figure class="di-gal-i" role="listitem"><img src="${fotoUrl(f)}" alt="${esc(f.descricao || 'Foto de ' + f.nome)}" loading="lazy">
      <figcaption><b>${esc(f.nome)}</b>${f.descricao ? `<span>${esc(f.descricao)}</span>` : ''}</figcaption>
      <div class="di-gal-a"><button type="button" class="di-cur" data-act="dicurtir" data-id="${f.id}" aria-pressed="${f.curti}" aria-label="${f.curti ? 'Descurtir' : 'Curtir'}">${f.curti ? '❤️' : '🤍'} ${f.curtidas}</button>
        ${apagar ? (conf ? `<button type="button" class="btn small danger" data-act="digalexcluir" data-id="${f.id}">Excluir?</button>`
          : `<button type="button" class="btn small link" data-act="askdel" data-k="dg:${f.id}">Excluir</button>`) : ''}</div></figure>`;
  }).join('')}</div>` : '<p class="muted" style="margin:0">Nenhuma foto nesta semana ainda.</p>';
  if (!L.some((f) => f.minha) && g.foto) {
    h += `<div class="di-gal-novo"><img class="di-gal-prev" src="data:image/jpeg;base64,${g.foto}" alt="Foto escolhida">
        <p class="di-gal-aviso">👀 Esta foto e a descrição ficam visíveis para a corrente e os alunos.</p>
        <label class="field">Descrição<input type="text" maxlength="200" data-diario="galdesc" placeholder="Opcional" value="${esc(g.desc)}"></label>
        <div class="di-gal-bt"><button type="button" class="btn primary" data-act="digalenviar" ${g.enviando ? 'disabled' : ''}>${g.enviando ? 'Enviando…' : 'Confirmar'}</button>
          <button type="button" class="btn" data-act="digalcancelar" ${g.enviando ? 'disabled' : ''}>Cancelar</button></div></div>`;
  }
  return h + '</div>';
}

function cardRoot(D) {
  if (!D.root) return '';
  return `<div class="card adm ervas-pub"><label class="of-sw"><input type="checkbox" role="switch" data-act="dipub" ${D.publicada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
    <p class="muted" style="margin:0;font-size:.85rem">${D.publicada ? 'A corrente e os alunos veem a aba (cada um, só o próprio diário).' : 'Desligado: só o root vê esta aba.'}</p></div>`;
}

// Para hoje: a Pílula de sabedoria (um conselho do guia de um dia anterior; troca a cada dia) e os banhos para tomar.
function paraHoje(D) {
  let pil = '';
  const L = D.dias.filter((x) => x.dados.conselho && x.data < hoje());
  if (L.length) {
    const n = Math.floor(pd(hoje()).getTime() / 864e5);
    const c = L[((n % L.length) + L.length) % L.length];
    const quem = c.dados.linha && LINHA_LABEL[c.dados.linha] ? `seu ${LINHA_LABEL[c.dados.linha]}` : 'seu guia';
    const t = c.dados.conselho.length > 280 ? c.dados.conselho.slice(0, 280).trimEnd() + '…' : c.dados.conselho;
    pil = `<div class="di-pilula"><p class="eyebrow">💊 Pílula de sabedoria</p><p class="di-pilula-t">Em ${dDM(c.data)}, ${esc(quem)} aconselhou: <q>${esc(t)}</q></p></div>`;
  }
  const B = D.dias.filter((x) => x.dados.banho?.ervas?.length && !x.dados.banho.feito).sort((a, b) => b.data.localeCompare(a.data));
  const ban = B.length ? `<div class="di-pend"><p class="eyebrow">🌿 Banhos para tomar · ${B.length}</p>
    <div class="di-pend-l" data-rolar="4">${B.map((x) => `<div class="di-pend-i"><div><b>${esc(x.dados.banho.ervas.join(', '))}</b>
      <span class="muted">${dDM(x.data)} · ${ORIGEM[x.dados.banho.origem] || ORIGEM.guia}</span></div>
      <button class="btn small" data-act="ditomei" data-d="${x.data}">Tomei</button></div>`).join('')}</div></div>` : '';
  let cic = '';
  if (!dadosDe(hoje()).ciclo?.menstruada) {
    const R = resumoCiclo(D.dias, hoje());
    if (R.proximo) cic = `<div class="di-pend"><p class="eyebrow">Ciclo</p><p class="di-ciclo-p">Próximo previsto por volta de <b>${dDM(R.proximo)}</b> <span class="muted">(média de ${R.media} dias; é uma estimativa)</span></p></div>`;
  }
  if (!pil && !ban && !cic) return '';
  return `<div class="card di-hoje">${pil}${ban}${cic}</div>`;
}

function termometro(d, gira) {
  const delta = deltaAxe(d);
  if (delta === null) return '';
  const face = (n) => HUMOR.find(([x]) => x === n)?.[1];
  const humor = face(d.antes.humor) && face(d.depois.humor) ? `<p class="di-termo-rostos" aria-label="Como se sentiu"><span>${face(d.antes.humor)}</span><span class="muted">→</span><span>${face(d.depois.humor)}</span></p>` : '';
  const a = d.antes.energia, b = d.depois.energia;
  const msg = delta > 0 ? (gira ? 'Você saiu da gira mais forte do que chegou.' : 'Você termina o dia com mais energia.')
    : delta < 0 ? (gira ? 'Você saiu com menos energia: descanse e cuide-se.' : 'O dia pesou: um banho de manutenção ajuda.')
    : 'Energia estável.';
  return `<div class="di-termo"><p class="eyebrow">🌡️ Termômetro de Axé</p>${humor}
    <div class="di-termo-b" style="background:linear-gradient(90deg, ${corEnergia(a)}, ${corEnergia(b)})">
      <span>${gira ? 'Chegada' : 'Manhã'} ${a}</span><span>${gira ? 'Saída' : 'Noite'} ${b}</span></div>
    <p class="di-termo-t"><b>Delta de Axé ${delta > 0 ? '+' : ''}${delta}</b> · ${msg}</p></div>`;
}

function banho(d, gira) {
  const B = d.banho || { ervas: [] };
  const temps = B.ervas.map(temperaturaDaErva);
  const lista = B.ervas.map((e, i) => {
    const t = temps[i];
    return `<span class="di-erva di-t-${t || 'x'}">${esc(e)}${t ? ` <small>${TEMPERATURAS[t][0]}</small>` : ''}<button type="button" data-act="dirmerva" data-i="${i}" aria-label="Tirar ${esc(e)}">×</button></span>`;
  }).join('');
  const quente = temps.includes('quente') ? `<p class="di-aviso">⚠️ ${AVISO_QUENTE}</p>` : '';
  const D = estado.diario || {};
  const oriOn = D.orientador !== false;
  const sug = !gira && (oriOn || D.root) && sugestaoOrientador(d);
  const chave = D.root && !gira ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="diori" ${oriOn ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Orientador visível para todos</b></label>
    ${oriOn ? '' : '<p class="muted" style="margin:0;font-size:.85rem">Desligado: só o root vê a sugestão de banho.</p>'}` : '';
  const orientador = sug ? `<div class="di-ori"><p class="eyebrow">🧭 Orientador</p>
      <p>Você registrou <b>${esc(EMOCOES.find(([k]) => k === sug.emo)[1])}</b>. Sugestão de banho de manutenção: <b>${sug.nome}</b>.</p>
      <p class="muted">${sug.fundamento}</p>
      ${B.ervas.some((e) => e.toLowerCase() === sug.nome.toLowerCase()) ? '' : `<button class="btn small" data-act="disugestao">Quero esse banho</button>`}</div>` : '';
  return `<div class="di-banho">${chave}${orientador}
    ${lista ? `<div class="di-ervas">${lista}</div>` : '<p class="muted" style="margin:0">Nenhuma erva anotada.</p>'}${quente}
    <form id="f-di-erva" class="di-add"><input type="text" id="di-erva" list="di-ervas-lista" placeholder="Erva (ex.: alecrim)" maxlength="60" autocomplete="off">
      <button class="btn small">Adicionar</button></form>
    <datalist id="di-ervas-lista">${ERVAS_SUGESTOES.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>
    ${B.ervas.length ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="difeito" ${B.feito ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Banho tomado</b></label>` : ''}</div>`;
}

// Resumo de um check-in fechado: o rosto, os sentimentos e a energia.
function resumoCheck(b, vazio) {
  if (!completo(b)) return vazio;
  const h = HUMOR.find(([n]) => n === b.humor);
  const emo = EMOCOES.filter(([k]) => (b.emo || []).includes(k)).map(([, t]) => t.split(' / ')[0]);
  return [h ? `${h[1]} ${h[2]}` : '', emo.join(', '), b.energia ? `energia ${b.energia}` : ''].filter(Boolean).join(' · ');
}
function passo(n, num, titulo, resumo, feito, aberto, corpo) {
  return `<div class="di-passo${aberto ? ' aberto' : ''}"><button type="button" class="di-passo-h" data-act="dipasso" data-n="${n}" aria-expanded="${aberto}">
    <span class="di-num${feito ? ' ok' : ''}" aria-hidden="true">${feito ? '✓' : num}</span>
    <span class="di-passo-t"><b>${titulo}</b><small>${esc(resumo)}</small></span><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>
    ${aberto ? `<div class="di-passo-c">${corpo}</div>` : ''}</div>`;
}

// ---------- Seu acompanhamento ----------
// Três painéis dos próprios registros, no período escolhido: o Termômetro das giras (quanto a energia muda da chegada
// para a saída, por gira e por linha), Cuidados e energia (a energia média nos dias com e sem cada cuidado, só com
// MIN_COMPARAR dias de cada lado) e as Emoções (as mais marcadas, leve × densa e o aviso de dias seguidos em vibração
// densa). Tudo calculado no aparelho, com os dias que já vieram (shared/diario.js acompanhamento).
const PERIODOS = [[30, '30 dias'], [91, '3 meses'], [365, '1 ano']];
const num = (n) => String(n).replace('.', ',');
const sinal = (n) => (n > 0 ? '+' : '') + num(n);
const cor = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');   // 0: neutro
const menosDias = (data, n) => { const [y, m, d] = data.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10); };
const barra = (pct, cls, rotulo = '') => `<span class="di-ac-trilho"${rotulo ? ` aria-label="${esc(rotulo)}"` : ''}><span class="di-ac-barra ${cls}" style="width:${Math.max(3, Math.min(100, pct))}%"></span></span>`;

function painelAxe(R) {
  if (!R.giras.length) return '<p class="muted di-ac-vazio">Registre a chegada e a saída das giras (a energia) para ver aqui como você sai de cada uma.</p>';
  const linhas = R.axe.porLinha.map((x) => `<div class="di-ac-l"><span class="di-ac-nome">${esc(LINHA_LABEL[x.linha] || x.linha)} <small class="muted">${x.n} ${x.n === 1 ? 'gira' : 'giras'}</small></span>
    ${barra(Math.abs(x.media) / 4 * 100, cor(x.media), `média ${sinal(x.media)}`)}<b class="di-ac-v ${cor(x.media)}">${sinal(x.media)}</b></div>`).join('');
  const ultimas = R.giras.slice(0, 6).map((g) => `<div class="di-ac-gira"><span>${dDM(g.data)}${g.linha && LINHA_LABEL[g.linha] ? ` · ${esc(LINHA_LABEL[g.linha])}` : ''}</span>
    <span class="di-ac-en"><i style="background:${corEnergia(g.antes)}">${g.antes}</i>→<i style="background:${corEnergia(g.depois)}">${g.depois}</i></span><b class="di-ac-v ${cor(g.delta)}">${sinal(g.delta)}</b></div>`).join('');
  const m = R.axe.media;
  return `<p class="di-ac-dest">Em média, você sai das giras <b class="${cor(m)}">${sinal(m)}</b> de energia <small class="muted">(${R.giras.length} ${R.giras.length === 1 ? 'gira' : 'giras'})</small>.</p>
    ${linhas ? `<p class="di-rot">Por linha</p>${linhas}` : ''}<p class="di-rot">Últimas giras</p>${ultimas}`;
}

function painelCuidados(R) {
  return R.cuidados.map((c) => {
    if (!c.ok) {
      const falta = c.nCom < MIN_COMPARAR ? `com ${c.nome.toLowerCase()}: ${c.nCom} de ${MIN_COMPARAR}` : `sem: ${c.nSem} de ${MIN_COMPARAR}`;
      return `<div class="di-ac-cuid"><p class="di-ac-cuid-h"><b>${c.nome}</b> <small class="muted">faltam registros (${falta})</small></p></div>`;
    }
    const dif = Math.round((c.com - c.sem) * 10) / 10;
    return `<div class="di-ac-cuid"><p class="di-ac-cuid-h"><b>${c.nome}</b> <span class="di-ac-v ${cor(dif)}">${sinal(dif)}</span></p>
      <div class="di-ac-l"><span class="di-ac-nome">Com <small class="muted">${c.nCom} dias</small></span>${barra(c.com / 5 * 100, 'en')}<b class="di-ac-v">${num(c.com)}</b></div>
      <div class="di-ac-l"><span class="di-ac-nome">Sem <small class="muted">${c.nSem} dias</small></span>${barra(c.sem / 5 * 100, 'en sem')}<b class="di-ac-v">${num(c.sem)}</b></div></div>`;
  }).join('') + '<p class="muted di-ac-nota">Energia média do dia (manhã e noite, ou chegada e saída), de 1 a 5.</p>';
}

function painelEmocoes(R) {
  const E = R.emocoes;
  if (!E.total) return '<p class="muted di-ac-vazio">Marque o que você sente nos registros para ver aqui as emoções mais frequentes.</p>';
  const pLeve = Math.round(E.leve / E.total * 100);
  const maior = E.lista[0].n;
  const aviso = E.seguidos >= 3 ? `<p class="di-aviso">🌧️ ${E.seguidos} dias seguidos em vibração densa. Um banho de manutenção (veja o Orientador no Banho do dia) e um momento de firmeza podem ajudar; se pesar, converse com alguém da Casa.</p>` : '';
  return `${aviso}<div class="di-ac-mix" role="img" aria-label="Vibração leve ${pLeve}%, densa ${100 - pLeve}%"><span class="leve" style="flex:${E.leve}"></span><span class="densa" style="flex:${E.densa}"></span></div>
    <p class="di-ac-mix-t"><span class="leve">☀️ Leve ${pLeve}%</span><span class="densa">🌧️ Densa ${100 - pLeve}%</span></p>
    ${E.lista.slice(0, 6).map((x) => `<div class="di-ac-l"><span class="di-ac-nome">${esc(x.nome.split(' / ')[0])}</span>${barra(x.n / maior * 100, x.grupo)}<b class="di-ac-v">${x.n}</b></div>`).join('')}
    <p class="muted di-ac-nota">Quantos dias cada emoção apareceu (manhã ou noite).</p>`;
}

function cardAcompanhamento(D) {
  const cab = `<button type="button" class="grp-h dobra" data-act="diacomp" aria-expanded="${ui.acomp}"><h2>📈 Seu acompanhamento</h2><span class="seta" aria-hidden="true">${ui.acomp ? '▾' : '▸'}</span></button>`;
  if (!ui.acomp) return `<div class="card di-acomp">${cab}<p class="muted di-ac-nota">Como você sai das giras, o efeito dos cuidados e as emoções mais frequentes.</p></div>`;
  const hj = hoje();
  const R = acompanhamento(D.dias, { desde: menosDias(hj, ui.periodo - 1), ate: hj, ehGira, linhaDe: linhaDoDia });
  const per = `<div class="di-chips di-ac-per">${PERIODOS.map(([n, t]) => `<button type="button" class="di-chip" data-act="diperiodo" data-v="${n}" aria-pressed="${ui.periodo === n}">${t}</button>`).join('')}</div>`;
  return `<div class="card di-acomp">${cab}${per}
    <div class="di-ac-sec"><h3>🌡️ Termômetro das giras</h3>${painelAxe(R)}</div>
    <div class="di-ac-sec"><h3>🌿 Cuidados e energia</h3>${painelCuidados(R)}</div>
    <div class="di-ac-sec"><h3>💭 Emoções</h3>${painelEmocoes(R)}</div>
    <p class="muted di-ac-nota">Só você vê. São observações dos seus registros, não um diagnóstico.</p></div>`;
}

function dia() {
  const d = dadosDe(ui.dia);
  const gira = ehGira(ui.dia, d);
  const linha = gira ? linhaDoDia(ui.dia, d) : '';
  const A = d.antes || {}, P = d.depois || {};
  const B = d.banho || { ervas: [] };
  const c1 = `<p class="di-rot">${gira ? 'Como você está chegando?' : 'Como você acordou?'}</p>${rostos('antes.humor', A.humor)}
    <p class="di-rot">O que você sente? <span class="muted">(até ${MAX_EMOCOES})</span></p>${emocoes('antes.emo', A.emo)}
    ${gira ? '' : `<p class="di-rot">Sono e sonhos</p>${chips('antes.sono', SONO, A.sono)}`}
    <p class="di-rot">Energia ${gira ? 'física e espiritual' : 'da manhã'}</p>${energia('antes.energia', A.energia)}`;
  const c2 = `<p class="di-rot">${gira ? 'Como você está saindo?' : 'Como você está encerrando o dia?'}</p>${rostos('depois.humor', P.humor)}
    <p class="di-rot">O que você sente? <span class="muted">(até ${MAX_EMOCOES})</span></p>${emocoes('depois.emo', P.emo)}
    <p class="di-rot">Energia ${gira ? 'depois do trabalho' : 'da noite'}</p>${energia('depois.energia', P.energia)}
    ${gira ? `<p class="di-rot">Sensação</p>${GRUPOS_SENSACOES.map((g) => `<div class="di-sens"><span class="muted">${g.titulo}</span>${chips('depois.sensacao', g.itens, P.sensacao)}</div>`).join('')}`
      : campoTexto('reflexao', 'Reflexão, gratidão ou sincronicidades (opcional)', d.reflexao, MAX_REFLEXAO, true)}
    ${termometro(d, gira)}`;
  const c3 = `<label class="field">Linha / falange<select data-act="dilinha"><option value="">—</option>${LINHAS_DIARIO.map(([k, t]) => `<option value="${k}" ${k === linha ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${campoTexto('conselho', 'Conselho do guia', d.conselho, MAX_CONSELHO, true, true)}`;
  const c4 = banho(d, gira);
  const rBanho = B.ervas.length ? `${B.ervas.join(', ')}${B.feito ? ' · tomado' : ''}` : 'Nenhuma erva anotada';
  const lista = [[1, gira ? 'Antes · Chegada' : 'Manhã', resumoCheck(A, gira ? 'Emoção, sentimentos e energia' : 'Emoção, sono e energia'), completo(A), c1],
    [2, gira ? 'Depois · Saída' : 'Fim do dia', resumoCheck(P, gira ? 'Emoção, energia, sensação e Termômetro de Axé' : 'Emoção, energia e reflexão'), completo(P), c2]];
  if (gira) lista.push([3, 'Orientações do guia', d.conselho ? `${linha && LINHA_LABEL[linha] ? LINHA_LABEL[linha] + ' · ' : ''}conselho anotado` : (linha && LINHA_LABEL[linha]) || 'Linha e conselho do guia', !!d.conselho, c3]);
  lista.push([4, gira ? 'Banho recomendado pelo guia' : 'Banho', rBanho, !!B.feito, c4]);
  // Passo aberto: o que a pessoa escolheu ou, sem escolha, o primeiro que falta.
  if (!(ui.dia in ui.passo)) ui.passo[ui.dia] = (lista.find(([, , , ok]) => !ok) || lista.at(-1))[0];
  const aberto = ui.passo[ui.dia];
  return `<div class="card di-reg"><h3>${gira ? 'Registro da gira' : 'Registro do dia'}</h3>
    ${lista.map(([n, t, r, ok, c], i) => passo(n, i + 1, t, r, ok, aberto === n, c)).join('')}</div>`;
}

export function render() {
  const D = estado.diario;
  if (D === null) { carregarDiario(); return '<div class="loading">Carregando o diário…</div>'; }
  if (D.erro) return `<section class="panel"><div class="card"><p class="erro">${esc(D.erro)}</p><button class="btn" data-act="direcarregar">Tentar de novo</button></div></section>`;
  if (ui.dia > hoje()) limpar();
  // A Galeria de fotos vem logo depois do Como você está hoje? (segundo card).
  return `<section class="panel di-tela">${cabecalho(D)}${galeria(D)}${paraHoje(D)}${dia()}${cardAcompanhamento(D)}${cardRoot(D)}</section>`;
}

// ---------- ações ----------
// Campo "antes.emo" → d.antes.emo (tocar de novo no mesmo valor tira).
function marcar(campo, v) {
  const [g, k] = campo.split('.');
  return salvar((d) => {
    d[g] = d[g] || {};
    if (d[g][k] === v) delete d[g][k]; else d[g][k] = v;
  });
}
function salvarTexto(campo) {
  const data = ui.dia;
  const v = ui.rasc[data]?.[campo];
  if (v === undefined) return;
  if ((dadosDe(data)[campo] || '') === v.trim()) { delete ui.rasc[data][campo]; return; }
  // O conselho leva junto a linha da agenda, se a pessoa não escolheu outra (a Pílula de sabedoria diz quem aconselhou).
  salvar((d) => { d[campo] = v; if (campo === 'conselho' && !d.linha && linhaDoDia(data, d)) d.linha = linhaDoDia(data, d); }).then((ok) => { if (ok && ui.rasc[data]) delete ui.rasc[data][campo]; });
}
export function digitando(t) {
  if (t.dataset.diario === 'galdesc') { ui.gal.desc = t.value; return; }
  (ui.rasc[ui.dia] ||= {})[t.dataset.diario] = t.value;
}
// Barra de energia enquanto arrasta: só a cor e o texto (salva ao soltar).
export function arrastando(t) {
  const n = Number(t.value);
  const box = t.closest('.di-slide');
  box.classList.remove('vazio');
  box.style.setProperty('--cor', corEnergia(n));
  box.querySelector('output').textContent = textoEnergia(n);
}
function mudarHabitos(muda) {
  return salvar((d) => { d.habitos = { ...(d.habitos || {}) }; muda(d.habitos); });
}

// ---------- galeria: a foto é reduzida no aparelho (maior lado 1280 px, JPEG até ~600 KB) ----------
async function escolherFotoGaleria(arquivo) {
  try {
    let blob;
    try { ({ blob } = await reduzirJpeg(await abrirImagem(arquivo), { lado: 1280, max: 600 * 1024, passo: 0.12 })); } catch (e) {
      toast(e.message === 'foto grande demais' ? 'Foto grande demais.' : 'Não foi possível abrir essa foto.');
      return;
    }
    ui.gal.foto = await base64(blob);
    avisar();
  } catch { toast('Não foi possível abrir essa foto.'); }
}
export async function addErva(form) {
  const el = form.querySelector('#di-erva');
  const nome = el.value.replace(/\s+/g, ' ').trim();
  if (!nome) return;
  const d = dadosDe(ui.dia);
  if ((d.banho?.ervas || []).some((e) => e.toLowerCase() === nome.toLowerCase())) { el.value = ''; return; }
  if ((d.banho?.ervas || []).length >= 15) { toast('Máximo de 15 ervas no banho.'); return; }
  const gira = ehGira(ui.dia, d);
  if (await salvar((x) => { x.banho = { ervas: [...(x.banho?.ervas || []), nome], feito: !!x.banho?.feito, origem: x.banho?.origem || (gira ? 'guia' : 'proprio') }; })) {
    document.getElementById('di-erva')?.focus();
  }
}

function ouvir(campo) {
  if (reconhecimento) { reconhecimento.stop(); return; }
  const r = new SR();
  r.lang = 'pt-BR';
  r.continuous = true;
  r.interimResults = false;
  const data = ui.dia;
  r.onresult = (ev) => {
    const novo = [...ev.results].slice(ev.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript.trim()).join(' ');
    if (!novo) return;
    const atual = ui.rasc[data]?.[campo] ?? dadosDe(data)[campo] ?? '';
    (ui.rasc[data] ||= {})[campo] = (atual ? atual.replace(/\s+$/, '') + ' ' : '') + novo;
    avisar();
  };
  r.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Libere o microfone para falar o texto.'); else if (ev.error !== 'no-speech' && ev.error !== 'aborted') toast('Não foi possível ouvir agora.'); };
  r.onend = () => {
    reconhecimento = null;
    ui.ouvindo = null;
    if (ui.dia === data) salvarTexto(campo);
    avisar();
  };
  try { r.start(); } catch { toast('Não foi possível ligar o microfone.'); return; }
  reconhecimento = r;
  ui.ouvindo = campo;
  avisar();
}

export const cliques = {
  direcarregar() { estado.diario = null; avisar(); },
  didia(el) { if (reconhecimento) reconhecimento.stop(); ui.dia = el.dataset.d; ui.mes = ui.dia.slice(0, 7); ui.cuid = null; avisar(); },
  // Faixa da semana: anda 7 dias (nunca depois de hoje).
  disemana(el) {
    if (reconhecimento) reconhecimento.stop();
    const d = maisDias(ui.dia, Number(el.dataset.v));
    ui.dia = d > hoje() ? hoje() : d;
    ui.mes = ui.dia.slice(0, 7);
    avisar();
  },
  dimesabrir() { ui.mesAberto = !ui.mesAberto; ui.mes = ui.dia.slice(0, 7); avisar(); },
  // Ciclo: Menstruada liga e desliga (desligar tira fluxo e sintomas); fluxo é um só, sintomas vários.
  // Menstruada: desmarcado → marca e abre; marcado e fechado → só abre; marcado e aberto → desmarca.
  diciclo() {
    const on = !!dadosDe(ui.dia).ciclo?.menstruada;
    if (on && ui.cuid !== 'ciclo') { ui.cuid = 'ciclo'; avisar(); return; }
    ui.cuid = on ? null : 'ciclo';
    salvar((d) => { if (on) delete d.ciclo; else d.ciclo = { menstruada: true }; });
  },
  dicicloval(el) {
    const { k, v } = el.dataset;
    salvar((d) => {
      d.ciclo = { menstruada: true, ...(d.ciclo || {}) };
      if (k === 'fluxo') { if (d.ciclo.fluxo === v) delete d.ciclo.fluxo; else d.ciclo.fluxo = v; return; }
      const L = d.ciclo.sintomas || [];
      d.ciclo.sintomas = L.includes(v) ? L.filter((x) => x !== v) : [...L, v];
      if (!d.ciclo.sintomas.length) delete d.ciclo.sintomas;
    });
  },
  diacomp() { ui.acomp = !ui.acomp; avisar(); },
  diperiodo(el) { ui.periodo = Number(el.dataset.v); avisar(); },
  dipasso(el) { const n = Number(el.dataset.n); ui.passo[ui.dia] = ui.passo[ui.dia] === n ? 0 : n; avisar(); },
  diolho() { descOcultaMem = !descOculta(); try { localStorage.setItem(PREF_DESC, descOcultaMem ? '1' : '0'); } catch { /* fica na memória */ } avisar(); },
  diemotrocar(el) { ui.emoEd.add(ui.dia + '|' + el.dataset.campo); avisar(); },
  diemopronto(el) { ui.emoEd.delete(ui.dia + '|' + el.dataset.campo); avisar(); },
  // Bloco do cuidado: só os detalhes do bloco tocado ficam abertos. Preceito e Atividade marcam e desmarcam; Água e
  // Banho: desmarcado → marca e abre; marcado e fechado → só abre; marcado e aberto → desmarca (limpa os detalhes).
  dihabt(el) {
    const k = el.dataset.k;
    const marcado = !!(dadosDe(ui.dia).habitos || {})[k];
    const comDetalhe = k === 'agua' || k === 'banho';
    if (comDetalhe && marcado && ui.cuid !== k) { ui.cuid = k; avisar(); return; }
    const on = !marcado;
    ui.cuid = comDetalhe && on ? k : null;
    mudarHabitos((h) => {
      if (on) { h[k] = true; return; }
      delete h[k];
      if (k === 'agua') delete h.litros;
      if (k === 'banho') { delete h.orixa; delete h.ervas; }
    });
  },
  dimes(el) {
    const mes = mesMais(ui.mes, Number(el.dataset.v));
    if (mes <= hoje().slice(0, 7)) ui.mes = mes;
    avisar();
  },
  dichip(el) { marcar(el.dataset.campo, el.dataset.v); },
  // Emoção: tocar marca ou desmarca; com MAX_EMOCOES marcadas, avisa.
  diemo(el) {
    const [g, k] = el.dataset.campo.split('.');
    const atual = dadosDe(ui.dia)[g]?.[k] || [];
    const v = el.dataset.v;
    if (!atual.includes(v) && atual.length >= MAX_EMOCOES) { toast(`Escolha até ${MAX_EMOCOES}: desmarque uma para trocar.`); return; }
    ui.emoEd.add(ui.dia + '|' + el.dataset.campo);
    salvar((d) => {
      d[g] = d[g] || {};
      const L = (d[g][k] || []).includes(v) ? d[g][k].filter((x) => x !== v) : [...(d[g][k] || []), v];
      if (L.length) d[g][k] = L; else delete d[g][k];
    });
  },
  dienergia(el) { marcar(el.dataset.campo, Number(el.dataset.v)); },
  dienlimpar(el) {
    const [g, k] = el.dataset.campo.split('.');
    salvar((d) => { if (d[g]) delete d[g][k]; });
  },
  dirmhaberva(el) {
    const i = Number(el.dataset.i);
    mudarHabitos((h) => { h.ervas = (h.ervas || []).filter((_, j) => j !== i); });
  },
  dicurtir(el) { acaoGaleriaDiario('fotoCurtir', { id: el.dataset.id }); },
  async digalexcluir(el) { if (await acaoGaleriaDiario('fotoExcluir', { id: el.dataset.id })) toast('Foto excluída.'); },
  digalcancelar() { ui.gal = { foto: null, desc: '', enviando: false }; avisar(); },
  async digalenviar() {
    const g = ui.gal;
    if (!g.foto || g.enviando) return;
    g.enviando = true;
    avisar();
    const ok = await acaoGaleriaDiario('fotoEnviar', { foto: g.foto, descricao: g.desc });
    ui.gal = ok ? { foto: null, desc: '', enviando: false } : { ...g, enviando: false };
    if (ok) toast('Foto na galeria. 📸');
    avisar();
  },
  dirmerva(el) {
    const i = Number(el.dataset.i);
    salvar((d) => {
      const ervas = (d.banho?.ervas || []).filter((_, j) => j !== i);
      if (ervas.length) d.banho.ervas = ervas; else delete d.banho;
    });
  },
  disugestao() {
    const sug = sugestaoOrientador(dadosDe(ui.dia));
    if (!sug) return;
    salvar((d) => { d.banho = { ervas: [...(d.banho?.ervas || []), sug.nome], feito: false, origem: d.banho?.origem || 'orientador' }; });
  },
  ditomei(el) {
    const d = copia(dadosDe(el.dataset.d));
    if (!d.banho) return;
    d.banho.feito = true;
    salvarDiaDiario(el.dataset.d, d).then((ok) => { if (ok) toast('Banho marcado como tomado. 🌿'); });
  },
  divoz(el) { if (SR) ouvir(el.dataset.campo); },
};

export const mudancas = {
  async dipub(t) {
    if (await publicarDiario(t.checked)) toast(t.checked ? 'Diário visível para todos.' : 'Diário: só o root vê.');
    else t.checked = !t.checked;
  },
  async diori(t) {
    if (await orientadorDiario(t.checked)) toast(t.checked ? 'Orientador visível para todos.' : 'Orientador: só o root vê.');
    else t.checked = !t.checked;
  },
  digira(t) {
    const auto = agendaTemGira(ui.dia);
    salvar((d) => { if (t.checked === auto) delete d.gira; else d.gira = t.checked; });
  },
  dilinha(t) { salvar((d) => { if (t.value) d.linha = t.value; else delete d.linha; }); },
  difeito(t) { salvar((d) => { if (d.banho) d.banho.feito = t.checked; }); },
  // Energia: salva o valor ao soltar (o toque sem arrastar também marca: ver main.js).
  dienslide(t) {
    const [g, k] = t.dataset.campo.split('.');
    const v = Number(t.value);
    if (dadosDe(ui.dia)[g]?.[k] === v) return;
    salvar((d) => { d[g] = d[g] || {}; d[g][k] = v; });
  },
  dilitros(t) {
    const v = t.value.trim();
    const n = litros(v);
    if (v && n === undefined) { toast('Litros: um número até 20 (ex.: 1,5).'); return; }
    mudarHabitos((h) => { if (n) h.litros = n; else delete h.litros; });
  },
  dihaborixa(t) { mudarHabitos((h) => { if (t.value) { h.orixa = t.value; delete h.ervas; } else delete h.orixa; }); },
  dihaberva(t) {
    const e = t.value;
    if (!e) return;
    mudarHabitos((h) => { h.ervas = [...new Set([...(h.ervas || []), e])].slice(0, MAX_ERVAS_BANHO); });
  },
  digalfoto(t) { const f = t.files?.[0]; t.value = ''; if (f) escolherFotoGaleria(f); },
  ditexto(t) { if (ui.ouvindo !== t.dataset.diario) salvarTexto(t.dataset.diario); },
};
