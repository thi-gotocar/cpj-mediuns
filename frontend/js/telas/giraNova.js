// Sub-aba "Gira nova" (layout em avaliação, ao lado da Gira antiga): conduzir em cima, a corrente embaixo.
// Monta as mesmas peças e usa as mesmas ações da aba Gira (gira.js passa tudo pronto em ctx); só muda a arrumação:
// faixa da semana, cabeçalho com um Compartilhar só, os 4 passos do admin (Preparar → Presença → Escala → Encerrar)
// e, embaixo, o mesmo que a corrente vê.

import { tituloGira, orixaDaGira, nomeEntidadeGira, status, presencaDe, licencaEm, temLimpeza, limpezaDaGira, linhaDaEntidade, giraEspecial } from '/shared/regras.js';
import { aniversariantesDoDia, rotuloTipo } from '/shared/eventos.js';
import { estado, prefs, salvarPrefs, girasLista, giraAtual, avisar } from '../estado.js';
import { esc, dLong, dDM } from '../util.js';
import { ICONE_WHATS } from './giraComum.js';
import { blocoLimpeza, blocoBanho, blocoPedirErvas, blocosOferenda, escolhaTurma } from './giraInformacoes.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const maiuscula = (t) => t.replace(/^./, (c) => c.toUpperCase());

// 'AAAA-MM-DD' somado de n dias.
function maisDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const diaDaSemana = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// Estado da tela (vale enquanto o app estiver aberto): passo aberto por gira, mês inteiro e Compartilhar.
const passos = new Map();   // data → número do passo aberto (0 = todos fechados)
let mesAberto = false;
let compAberto = false;
let acoes = {};             // as ações da aba Gira (para o Compartilhar chamar a escolhida)

// ---------- faixa da semana ----------
function faixaSemana(g, marcas, calendario) {
  const [y, m] = g.data.split('-').map(Number);
  // Mês inteiro aberto: o calendário já tem as setas do mês; aqui fica só o botão de voltar à semana.
  if (mesAberto) return `<div class="gn-sem"><div class="gn-sem-h"><b>Calendário</b><button type="button" class="btn small gn-mes-bt" data-act="gnmes" aria-expanded="true">Semana</button></div>${calendario}</div>`;
  const cab = `<div class="gn-sem-h">
      <button type="button" class="btn small" data-act="gnsemana" data-v="-7" aria-label="Semana anterior">◂</button>
      <b>${maiuscula(MESES[m - 1])} de ${y}</b>
      <button type="button" class="btn small" data-act="gnsemana" data-v="7" aria-label="Próxima semana">▸</button>
      <button type="button" class="btn small gn-mes-bt" data-act="gnmes" aria-expanded="false">Mês</button></div>`;
  const ini = maisDias(g.data, -diaDaSemana(g.data));
  const dias = Array.from({ length: 7 }, (_, i) => maisDias(ini, i));
  return `<div class="gn-sem">${cab}<div class="gn-dias">${dias.map((d, i) => `<button type="button" class="gn-dia${d === g.data ? ' sel' : ''}" data-act="giradia" data-d="${d}" aria-label="${esc(dLong(d))}" aria-pressed="${d === g.data}">
      <small>${SEMANA[i]}</small><b>${Number(d.slice(8))}</b><span class="di-marcas">${marcas(d)}</span></button>`).join('')}</div></div>`;
}

// ---------- cabeçalho ----------
function cabecalho(ctx) {
  const { g, existe, encerrada, temDuplas, publicada, editar } = ctx;
  const titulo = existe ? tituloGira(g) : 'Nenhuma gira nesta data';
  const selos = [];
  if (existe) {
    if (orixaDaGira(g)) selos.push(`<span class="gn-selo">${esc(orixaDaGira(g))}</span>`);
    selos.push(encerrada ? '<span class="gn-selo enc">Encerrada</span>' : g.evento ? '<span class="gn-selo ev">Evento</span>' : '<span class="gn-selo ok">Em aberto</span>');
    if (!g.evento && !encerrada) {
      if (publicada) selos.push('<span class="gn-selo pub">Escala publicada</span>');
      else if (editar) selos.push(temDuplas ? '<span class="gn-selo warn">Escala não publicada</span>' : '<span class="gn-selo">Sem sorteio</span>');
    }
  }
  // Os eventos da agenda nesta data (fora a própria gira) e quem faz aniversário.
  const agenda = (estado.eventos || []).filter((e) => e.data === g.data && (!existe || e.nome !== titulo)).map((e) => `${esc(e.nome)} <span class="muted">(${esc(rotuloTipo(e))})</span>`);
  const niver = aniversariantesDoDia(estado.pessoas, g.data);
  return `<div class="gn-cab"><span class="gn-data">${esc(maiuscula(dLong(g.data)))}</span>
    <h1 class="gn-titulo">${esc(titulo)}</h1>
    ${selos.length ? `<div class="gn-selos">${selos.join('')}</div>` : ''}
    ${agenda.length ? `<p class="gn-extra">${agenda.join(' · ')}</p>` : ''}
    ${niver.length ? `<p class="gn-extra"><span aria-hidden="true">🎈</span> Aniversário: ${niver.map((p) => esc(p.nome)).join(', ')}</p>` : ''}
    ${compartilhar(ctx)}</div>`;
}

// ---------- Compartilhar: um botão só, com as opções que a pessoa tem ----------
function compartilhar(ctx) {
  const { g, existe, admin, whats, temDuplas, previa, eventoImagem } = ctx;
  if (!existe) return '';
  const ops = [];
  if (whats && !g.evento) ops.push(['waabrir', 'Escala', temDuplas ? 'Texto da lista ou imagem da escala' : 'Faça o sorteio primeiro', !temDuplas]);
  if (previa) ops.push(['pvabrir', 'Prévia da gira', 'Saudação, senha e turma da limpeza, para ajustar antes de enviar']);
  const nOra = (estado.oracoes || []).length;
  if (admin && nOra) ops.push(['oraabrir', 'Pedidos de oração', `Imagem com ${nOra} ${nOra === 1 ? 'pedido' : 'pedidos'}`]);
  if (!ops.length && !eventoImagem) return '';
  const lista = compAberto ? `<div class="gn-comp" role="group" aria-label="O que compartilhar">
      ${ops.map(([act, t, sub, off]) => `<button type="button" class="gn-comp-op" data-act="gncompir" data-alvo="${act}" ${off ? 'disabled' : ''}><b>${t}</b><small>${sub}</small></button>`).join('')}
      ${eventoImagem ? `<div class="gn-comp-ev"><span><b>Imagem do evento</b><small>Recado, banho, ausências e licenças</small></span>${eventoImagem}</div>` : ''}
    </div>` : '';
  return `<button type="button" class="btn gn-comp-bt wa-bt" data-act="gncomp" aria-expanded="${compAberto}"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Compartilhar no WhatsApp</button>${lista}`;
}

// ---------- os passos do admin ----------
function passoPadrao(ctx, pend) {
  const { g, temDuplas, publicada } = ctx;
  if (!g.evento && !linhaDaEntidade(g.entidade) && !giraEspecial(g.entidade)) return 1;
  if (g.evento) return pend ? 2 : 4;
  if (!temDuplas) return 2;
  return publicada ? 4 : 3;
}

function passo(n, num, titulo, resumo, feito, aberto, corpo) {
  return `<div class="gn-passo${aberto ? ' aberto' : ''}">
    <button type="button" class="gn-passo-h" data-act="gnpasso" data-n="${n}" aria-expanded="${aberto}">
      <span class="gn-num${feito ? ' ok' : ''}" aria-hidden="true">${feito ? '✓' : num}</span>
      <span class="gn-passo-t"><b>${titulo}</b><small>${resumo}</small></span>
      <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>
    ${aberto ? `<div class="gn-passo-c">${corpo}</div>` : ''}</div>`;
}

function conducao(ctx) {
  const { g, ps, temDuplas, publicada } = ctx;
  const pend = ps.filter((p) => !licencaEm(p, g.data) && presencaDe(p, g) === 'pend');
  if (!passos.has(g.data)) passos.set(g.data, passoPadrao(ctx, pend.length));
  const aberto = passos.get(g.data);

  // 1. Preparar
  const L = !g.evento && temLimpeza(g) ? limpezaDaGira(estado.pessoas, g, girasLista()) : null;
  const entOk = g.evento || !!linhaDaEntidade(g.entidade) || !!giraEspecial(g.entidade);
  const r1 = [g.evento ? 'Evento' : g.entidade ? esc(nomeEntidadeGira(g)) : 'Escolha a entidade', orixaDaGira(g) ? esc(orixaDaGira(g)) : '',
    !g.evento && temLimpeza(g) ? (L ? `Turma ${L.turma}` : 'sem turma') : '', g.recado ? 'recado escrito' : 'sem recado'].filter(Boolean).join(' · ');
  const recado = estado.recadoTxt?.data === g.data ? estado.recadoTxt.texto : g.recado || '';
  const c1 = `<label class="field">Gira / entidade do dia${ctx.entidade}</label>
    <label class="gn-check"><input type="checkbox" data-act="evento" ${g.evento ? 'checked' : ''} ${publicada ? 'disabled' : ''}> É evento <small class="muted">(sem escala nem limpeza)</small></label>
    ${ctx.avisoEntidade}
    ${ctx.orixa ? `<label class="field">Orixá${ctx.orixa}</label>` : ''}
    <label class="field">Nome no cabeçalho${ctx.titulo}<small class="muted">Em branco volta ao automático.</small></label>
    ${publicada ? '<p class="muted gn-nota">Escala publicada: gira, orixá, Evento e data ficam fixos. Para mudar, oculte a escala no passo Escala.</p>'
      : `<button type="button" class="btn" data-act="mudardata">📅 Alterar data · ${esc(dDM(g.data))}</button>`}
    ${!g.evento && temLimpeza(g) ? `<div class="field">Turma da limpeza${escolhaTurma(g)}</div>` : ''}
    <label class="field">Recado para a corrente<textarea id="ev-recado" class="gn-recado-ed" data-act="recadogira" data-d="${esc(g.data)}" rows="2" maxlength="300" placeholder="Até 5 linhas. Aparece para todos.">${esc(recado)}</textarea></label>`;

  // 2. Presença
  const conta = (s) => ps.filter((p) => presencaDe(p, g) === s).length;
  const nP = conta('p'), nF = conta('f'), nA = conta('a'), nL = conta('lic');
  const total = ps.length;
  const r2 = pend.length ? `${total - pend.length} de ${total} responderam · ${pend.length} ${pend.length === 1 ? 'pendente' : 'pendentes'}` : `Todos responderam · ${nP} ${nP === 1 ? 'presente' : 'presentes'}`;
  const barra = total ? `<div class="gn-barra" role="img" aria-label="${nP} presentes, ${nF} faltas, ${nA} ausentes, ${nL} de licença, ${pend.length} pendentes">
      ${[[nP, 'p'], [nF, 'f'], [nA, 'a'], [nL, 'lic'], [pend.length, 'pend']].filter(([n]) => n).map(([n, k]) => `<span class="b-${k}" style="flex:${n}"></span>`).join('')}</div>
    <div class="gn-legenda">${[[nP, 'presente', 'presentes', 'p'], [nF, 'falta', 'faltas', 'f'], [nA, 'ausente', 'ausentes', 'a'], [nL, 'licença', 'licença', 'lic'], [pend.length, 'pendente', 'pendentes', 'pend']]
      .filter(([n]) => n).map(([n, um, varios, k]) => `<span><b class="t-${k}">${n}</b> ${n === 1 ? um : varios}</span>`).join('')}</div>` : '';
  // Até 8 nomes; o resto está na lista completa (+ Ver lista).
  const faltam = pend.length ? `<div class="gn-faltam"><small class="muted">Faltam responder</small>${pend.slice(0, 8).map((p) => `<span class="gn-nome pend">${esc(p.nome)}</span>`).join('')}${pend.length > 8 ? `<span class="muted">+${pend.length - 8}</span>` : ''}</div>` : '';
  const c2 = barra + ctx.presenca + faltam;

  // 3. Escala
  const nMed = !temDuplas ? 0 : new Set([...(g.pares || []), ...(g.passes || [])].map((p) => p.m)).size;
  const r3 = !temDuplas ? 'Ainda não sorteada' : `Sorteada · ${nMed} ${nMed === 1 ? 'médium' : 'médiuns'} · ${publicada ? 'publicada' : 'falta publicar'}${g.travada ? ' · travada' : ''}`;
  const c3 = `${ctx.sugestao}${ctx.sorteio}${ctx.trava ? `<div class="gn-trava">${ctx.trava}<small class="muted">${g.travada ? 'Escala travada: marcar falta ou ausência não muda a escala.' : 'Ligue quando a escala já valeu e só falta registrar quem faltou.'}</small></div>` : ''}`;

  // 4. Encerrar
  const r4 = g.evento ? 'Participantes e fechamento' : 'Atendidos e fechamento da gira';
  const c4 = `<div class="field">${g.evento ? '' : 'Atendidos nesta gira'}${ctx.atend}</div>
    ${pend.length ? `<p class="gn-aviso">${pend.length} ${pend.length === 1 ? 'pessoa ainda pendente' : 'pessoas ainda pendentes'} na Presença. Resolva para poder encerrar.</p>` : ''}
    ${ctx.encerrar}`;

  const lista = [[1, 'Preparar', r1, entOk && !!g.entidade || g.evento, c1], [2, 'Presença', r2, !pend.length && total > 0, c2]];
  if (!g.evento) lista.push([3, 'Escala', r3, publicada, c3]);
  lista.push([4, 'Encerrar', r4, false, c4]);
  return `<div class="gn-cond"><div class="gn-cond-h"><h2>Condução da gira</h2><small class="muted">só admins veem</small></div>
    ${lista.map(([n, t, r, ok, c], i) => passo(n, i + 1, t, r, ok, aberto === n, c)).join('')}</div>`;
}

// ---------- o que a corrente vê ----------
function quemNaoVem(ps, g) {
  const aus = ps.filter((p) => status(p, g) === 'a');
  const fal = ps.filter((p) => status(p, g) === 'f');
  const lic = ps.filter((p) => licencaEm(p, g.data));
  const n = aus.length + fal.length + lic.length;
  if (!n) return '';
  const nomes = (l, cls) => l.map((p) => `<span class="gn-nome ${cls}">${esc(p.nome)}</span>`).join('');
  return `<div class="gn-sec"><div class="gn-sec-h"><h3>Quem não vem</h3><span class="muted">${n}</span></div><div class="gn-fora">
    ${aus.length ? `<span class="gn-fora-t aus">Ausência</span><span>${nomes(aus, 'aus')}</span>` : ''}
    ${fal.length ? `<span class="gn-fora-t falta">Faltas</span><span>${nomes(fal, 'falta')}</span>` : ''}
    ${lic.length ? `<span class="gn-fora-t">Licença</span><span>${lic.map((p) => `${esc(p.nome)} <span class="muted">até ${dDM(licencaEm(p, g.data).fim)}</span>`).join(', ')}</span>` : ''}
  </div></div>`;
}

function daCorrente(ctx) {
  const { g, ps, admin, editar, encerrada, temDuplas, realizado, escala } = ctx;
  const partes = [];
  if (g.recado) partes.push(`<div class="gn-recado"><small>Recado</small><p>${esc(g.recado)}</p></div>`);
  if (realizado) partes.push(`<div class="gn-sec gn-escala">${realizado}</div>`);
  else if (escala) partes.push(`<div class="gn-sec">${escala}</div>`);
  else if (editar && !g.evento && !encerrada) partes.push(`<div class="gn-sec"><div class="gn-sec-h"><h3>Escala</h3><span class="gn-aviso-t">${temDuplas ? 'aguardando publicação' : 'ainda não sorteada'}</span></div><p class="muted gn-nota">A corrente vê a imagem da escala aqui assim que ela for publicada.</p></div>`);
  if (!encerrada) { const l = blocoLimpeza(g, false); if (l) partes.push(`<div class="gn-sec">${l}</div>`); }
  const banho = blocoBanho(g);
  if (banho) partes.push(`<div class="gn-sec">${banho}</div>`);
  partes.push(quemNaoVem(ps, g));
  const tambem = blocoPedirErvas(g) + blocosOferenda(g);
  if (tambem) partes.push(`<div class="gn-sec gn-tambem"><h3>Também nesta gira</h3>${tambem}</div>`);
  const html = partes.filter(Boolean).join('');
  if (!html) return '';
  return `<div class="gn-corrente">${admin && !encerrada ? '<small class="muted gn-legenda-c">Abaixo, o mesmo que a corrente vê</small>' : ''}${html}</div>`;
}

// ---------- a tela ----------
export function montarNova(ctx) {
  acoes = ctx.acoes || acoes;
  const { g, semGira } = ctx;
  const faixa = faixaSemana(g, ctx.marcas, ctx.calendario);
  if (semGira) {
    return `<section class="panel gn">${faixa}<div class="gn-cab"><span class="gn-data">${esc(maiuscula(dLong(g.data)))}</span><h1 class="gn-titulo">Nenhuma gira nesta data</h1></div>
      <button class="btn primary btn-grande" data-act="criargira">＋ Adicionar evento</button>${ctx.ausPrevia || ''}</section>`;
  }
  const { existe, editar, encerrada } = ctx;
  let corpo = '';
  if (!ctx.ps.length || !existe) corpo = ctx.rodape || '';
  else if (encerrada) corpo = ctx.encerradaQuadro + daCorrente(ctx);
  else corpo = (editar ? conducao(ctx) : '') + daCorrente(ctx);
  return `<section class="panel gn">${faixa}${cabecalho(ctx)}${corpo}</section>`;
}

export const cliquesNova = {
  gnpasso(el) {
    const d = giraAtual().data, n = Number(el.dataset.n);
    passos.set(d, passos.get(d) === n ? 0 : n);
    avisar();
  },
  gnmes() { mesAberto = !mesAberto; avisar(); },
  gnsemana(el) { prefs.data = maisDias(prefs.data, Number(el.dataset.v)); salvarPrefs(); avisar(); },
  gncomp() { compAberto = !compAberto; avisar(); },
  gncompir(el) {
    compAberto = false;
    avisar();
    acoes[el.dataset.alvo]?.(el);
  },
};
