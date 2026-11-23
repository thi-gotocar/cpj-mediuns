// Aba Gira, a arrumação da tela: conduzir em cima, a corrente embaixo. gira.js monta as peças e as ações e passa tudo
// em ctx; aqui ficam a faixa da semana, o cabeçalho com um Compartilhar só, os 4 passos do admin (Preparar → Escala →
// Presença → Encerrar) e, embaixo, o mesmo que a corrente vê.

import { tituloGira, orixaDaGira, nomeEntidadeGira, status, presencaDe, licencaEm, temLimpeza, limpezaDaGira, linhaDaEntidade, giraEspecial, proximaTurma } from '/shared/regras.js';
import { aniversariantesDoDia, rotuloTipo, ehAmaci } from '/shared/eventos.js';
import { estado, prefs, salvarPrefs, pode, girasLista, giraAtual, excluirGira, avisar } from '../estado.js';
import { esc, dLong, dDM, hoje, toast } from '../util.js';
import { api } from '../api.js';
import { ICONE_WHATS, htmlStatus } from './giraComum.js';
import { blocoLimpeza, blocoBanho, blocoPedirErvas, blocosOferenda, escolhaTurma } from './giraInformacoes.js';
import { atualizarJanela } from './giraJanelas.js';

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
const turmaAberta = new Map();   // data → turma da limpeza quando a lista abriu (escolher outra turma fecha a lista)
const pendAberto = new Set();    // datas com a lista de pendentes aberta (passo Presença)
let compOpcoes = { ops: [], eventoImagem: '' };   // as opções da gira aberta, para a janela do Compartilhar

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
  // Dia sem gira cadastrada: sem título; ficam a data e o que está na agenda.
  const titulo = existe ? tituloGira(g) : '';
  const selos = [];
  if (existe) {
    if (orixaDaGira(g)) selos.push(`<span class="gn-selo">${esc(orixaDaGira(g))}</span>`);
    selos.push(encerrada ? '<span class="gn-selo enc">Encerrada</span>' : g.evento ? '<span class="gn-selo ev">Evento</span>' : '<span class="gn-selo ok">Em aberto</span>');
    if (!g.evento && !encerrada) {
      if (publicada) selos.push('<span class="gn-selo pub">Escala publicada</span>');
      else if (editar) selos.push(temDuplas ? '<span class="gn-selo warn">Escala não publicada</span>' : '<span class="gn-selo">Sem sorteio</span>');
    }
  }
  return `<div class="gn-cab"><span class="gn-data">${esc(maiuscula(dLong(g.data)))}</span>
    ${titulo ? `<h1 class="gn-titulo">${esc(titulo)}</h1>` : ''}
    ${selos.length ? `<div class="gn-selos">${selos.join('')}</div>` : ''}
    ${extrasDoDia(g.data, existe ? titulo : null)}
    ${compartilhar(ctx)}</div>`;
}

// Os eventos da agenda na data (fora o que já é o título) e quem faz aniversário; também no dia sem gira cadastrada.
function extrasDoDia(data, titulo) {
  // Cada evento numa linha, com o ícone de calendário; o amaci tem embaixo o Vou ao amaci da corrente.
  const agenda = (estado.eventos || []).filter((e) => e.data === data && e.nome !== titulo)
    .map((e) => `<p class="gn-extra gn-evento"><span aria-hidden="true">📅</span> ${esc(e.nome)} <span class="muted">(${esc(rotuloTipo(e))})</span></p>${ehAmaci(e) ? amaciVou(e) : ''}`);
  const niver = aniversariantesDoDia(estado.pessoas, data);
  return `${agenda.join('')}
    ${niver.length ? `<p class="gn-extra"><span aria-hidden="true">🎈</span> Aniversário: ${niver.map((p) => esc(p.nome)).join(', ')}</p>` : ''}`;
}

// ---------- Amaci: quem da corrente vai ----------
// Só um controle da corrente (não é a presença dos alunos no amaci): cada pessoa marca Vou ao amaci até o dia, e todos
// da corrente veem a lista em Ver quem vai. Lido do servidor quando o amaci aparece na tela.
const amaciLendo = new Set();
const amaciAbertos = new Set();
function lerAmaciVou(id) {
  if (amaciLendo.has(id)) return;
  amaciLendo.add(id);
  api('GET', `/giras?lista=amaciVou&evento=${id}`)
    .then((r) => { estado.amaciVou = { ...(estado.amaciVou || {}), [id]: r }; }, () => { estado.amaciVou = { ...(estado.amaciVou || {}), [id]: { pessoas: [], eu: false, podeMarcar: false, erro: true } }; })
    .finally(() => { amaciLendo.delete(id); avisar(); });
}
function amaciVou(e) {
  const v = estado.amaciVou?.[e.id];
  if (!v) { lerAmaciVou(e.id); return '<div class="gn-amaci"><span class="muted">Carregando quem vai…</span></div>'; }
  if (v.erro) return '';
  const aberto = amaciAbertos.has(e.id);
  const n = v.pessoas.length;
  const marcar = v.podeMarcar && e.data >= hoje()
    ? `<button type="button" class="btn small ${v.eu ? 'gn-amaci-vou' : 'primary'}" data-act="amacivou" data-id="${esc(e.id)}" data-v="${v.eu ? '0' : '1'}" aria-pressed="${v.eu}">${v.eu ? '✓ Você vai · desmarcar' : '🙋 Vou ao amaci'}</button>` : '';
  const lista = aberto ? `<div class="gn-amaci-lista">${n ? v.pessoas.map((p) => `<span class="gn-nome">${esc(p.nome)}</span>`).join('') : '<span class="muted">Ninguém marcou ainda.</span>'}</div>` : '';
  return `<div class="gn-amaci"><div class="gn-amaci-bts">${marcar}
      <button type="button" class="btn small" data-act="amaciquem" data-id="${esc(e.id)}" aria-expanded="${aberto}">Ver quem vai (${n}) <span aria-hidden="true">${aberto ? '▾' : '▸'}</span></button></div>${lista}</div>`;
}

// ---------- Compartilhar: um botão só, com as opções que a pessoa tem ----------
function compartilhar(ctx) {
  const { g, existe, admin, editar, whats, temDuplas, previa, eventoImagem, resumoOk } = ctx;
  if (!existe) return '';
  const ops = [];
  // Gira encerrada: o resumo (texto ou imagem) fica aqui junto com o resto.
  if (resumoOk) ops.push(['rsabrir', 'Resumo da gira', 'Atendidos, presença e frequência, em texto ou imagem', false, `data-d="${g.data}" data-de="comp"`]);
  if (whats && !g.evento) ops.push(['waabrir', 'Escala', temDuplas ? 'Texto da lista ou imagem da escala' : 'Faça o sorteio primeiro', !temDuplas]);
  // Prévia: o mesmo texto da Gira antiga (turma da limpeza, senha, orixá quando houver); sem turma não há prévia.
  if (previa) ops.push(['pvabrir', 'Prévia da gira', 'Saudação, senha e turma da limpeza, para ajustar antes de enviar']);
  else if (editar && !g.evento && temLimpeza(g)) ops.push(['pvabrir', 'Prévia da gira', 'Escolha a turma da limpeza no passo Preparar', true]);
  const nOra = (estado.oracoes || []).length;
  if (admin && nOra) ops.push(['oraabrir', 'Pedidos de oração', `Imagem com ${nOra} ${nOra === 1 ? 'pedido' : 'pedidos'}`]);
  compOpcoes = { ops, eventoImagem };
  if (!ops.length && !eventoImagem) return '';
  return `<button type="button" class="btn gn-comp-bt wa-bt" data-act="gncomp" aria-haspopup="dialog"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Compartilhar no WhatsApp</button>`;
}

// Janela do Compartilhar (por cima de tudo, como as outras janelas da aba): escolher uma opção troca esta janela pela
// da opção (a da escala, a da prévia, a das orações), sem redesenhar a tela.
export function janelaCompartilhar() {
  if (!compAberto || prefs.tab !== 'agenda') return '';
  const { ops, eventoImagem } = compOpcoes;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="gn-comp-t"><div class="modal wa-modal">
    <h3 id="gn-comp-t"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Compartilhar no WhatsApp</h3>
    ${ops.map(([act, t, sub, off, extra = '']) => `<button type="button" class="wa-op" data-act="${act}" ${extra} ${off ? 'disabled' : ''}><span class="wa-op-txt"><b>${t}</b><small>${sub}</small></span></button>`).join('')}
    ${eventoImagem ? `<div class="gn-comp-ev"><span><b>Imagem do evento</b><small>Recado, banho, ausências e licenças</small></span>${eventoImagem}</div>` : ''}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="gncompfechar">Fechar</button></div>
  </div></div>`;
}
export const compartilharAberto = () => compAberto && prefs.tab === 'agenda';

// ---------- os passos do admin ----------
// Gira sem turma: a mesma próxima do rodízio que o Adicionar evento usa (a Gira e a Gira nova têm os mesmos dados).
// Um toque grava, como escolher a turma à mão.
function campoTurma(g, L) {
  const atual = Number(g.limpeza) || 0;
  if (turmaAberta.has(g.data) && turmaAberta.get(g.data) !== atual) turmaAberta.delete(g.data);   // trocou: fecha
  const aberta = turmaAberta.has(g.data);
  const t = L ? 0 : proximaTurma(estado.pessoas, girasLista(), g.data);
  const sug = !L && t ? `<span class="gn-sug-turma"><span>Próxima do rodízio: <b>Turma ${t}</b></span><button type="button" class="btn small primary" data-act="limpturma" data-v="${t}">Usar Turma ${t}</button></span>` : '';
  const linha = `<button type="button" class="gn-turma" data-act="gnturma" aria-expanded="${aberta}"><span>${L ? `<b>Turma ${L.turma}</b> <small class="muted">${L.membros.length} ${L.membros.length === 1 ? 'pessoa' : 'pessoas'}</small>` : '<b>Sem turma</b>'}</span>
    <small class="gn-turma-t">${aberta ? 'Fechar' : 'Trocar'} <span aria-hidden="true">${aberta ? '▾' : '▸'}</span></small></button>`;
  return `<div class="field">Turma da limpeza${sug}${linha}${aberta ? escolhaTurma(g) : ''}</div>`;
}

function passoPadrao(ctx, pend) {
  const { g, temDuplas, publicada } = ctx;
  // Preparar (sem entidade) → Escala (até publicar) → Presença (no dia: presentes e faltas).
  if (!g.evento && !linhaDaEntidade(g.entidade) && !giraEspecial(g.entidade)) return 1;
  if (g.evento) return pend ? 2 : 4;
  return temDuplas && publicada ? 2 : 3;
}

function passo(n, num, titulo, resumo, feito, aberto, corpo) {
  return `<div class="gn-passo${aberto ? ' aberto' : ''}">
    <button type="button" class="gn-passo-h" data-act="gnpasso" data-n="${n}" aria-expanded="${aberto}">
      <span class="gn-num${feito ? ' ok' : ''}" aria-hidden="true">${feito ? '✓' : num}</span>
      <span class="gn-passo-t"><b>${titulo}</b><small>${resumo}</small></span>
      <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>
    ${aberto ? `<div class="gn-passo-c">${corpo}</div>` : ''}</div>`;
}

// Gira de hoje em diante, ainda aberta (criada por engano): Excluir, com confirmação. As passadas saem pelo Histórico.
function excluir(g) {
  if (!pode('giras:excluir') || g.encerrada || g.data < hoje() || !estado.giras[g.data]) return '';
  if (estado.confirm !== 'gn:' + g.data) return `<button type="button" class="btn link small danger gn-excluir" data-act="askdel" data-k="gn:${esc(g.data)}"><span aria-hidden="true">🗑️</span> Excluir esta gira</button>`;
  return `<div class="gn-excluir-c"><p class="gn-aviso">Excluir a gira de ${esc(dDM(g.data))}? Saem a presença, a escala e o resto desta data, para todos. Não dá para desfazer.</p>
    <div class="row" style="gap:8px"><button type="button" class="btn" data-act="gnexcnao">Cancelar</button><button type="button" class="btn danger" data-act="gnexcluir" data-d="${esc(g.data)}">Excluir gira</button></div></div>`;
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
    ${!g.evento && temLimpeza(g) ? campoTurma(g, L) : ''}
    <label class="field">Recado para a corrente<textarea id="ev-recado" class="gn-recado-ed" data-act="recadogira" data-d="${esc(g.data)}" rows="2" maxlength="300" placeholder="Até 5 linhas. Aparece para todos.">${esc(recado)}</textarea></label>
    ${excluir(g)}`;

  // 2. Presença
  const conta = (s) => ps.filter((p) => presencaDe(p, g) === s).length;
  const nP = conta('p'), nF = conta('f'), nA = conta('a'), nL = conta('lic');
  const total = ps.length;
  const r2 = pend.length ? `${total - pend.length} de ${total} responderam · ${pend.length} ${pend.length === 1 ? 'pendente' : 'pendentes'}` : `Todos responderam · ${nP} ${nP === 1 ? 'presente' : 'presentes'}`;
  const barra = total ? `<div class="gn-barra" role="img" aria-label="${nP} presentes, ${nF} faltas, ${nA} ausentes, ${nL} de licença, ${pend.length} pendentes">
      ${[[nP, 'p'], [nF, 'f'], [nA, 'a'], [nL, 'lic'], [pend.length, 'pend']].filter(([n]) => n).map(([n, k]) => `<span class="b-${k}" style="flex:${n}"></span>`).join('')}</div>
    <div class="gn-legenda">${[[nP, 'presente', 'presentes', 'p'], [nF, 'falta', 'faltas', 'f'], [nA, 'ausente', 'ausentes', 'a'], [nL, 'licença', 'licença', 'lic'], [pend.length, 'pendente', 'pendentes', 'pend']]
      .filter(([n]) => n).map(([n, um, varios, k]) => (k === 'pend'
        ? `<button type="button" class="gn-pend-bt" data-act="gnpend" aria-expanded="${pendAberto.has(g.data)}"><b class="t-${k}">${n}</b> ${n === 1 ? um : varios} <span aria-hidden="true">${pendAberto.has(g.data) ? '▾' : '▸'}</span></button>`
        : `<span><b class="t-${k}">${n}</b> ${n === 1 ? um : varios}</span>`)).join('')}</div>` : '';
  const antesDoDia = g.pendentePadrao && g.data > hoje();
  const pendentes = pend.length && pendAberto.has(g.data) ? `<div class="gn-pend">${pend.map((p) => `<div class="gn-pend-l"><span>${esc(p.nome)}</span>
      <select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${htmlStatus(g, presencaDe(p, g), status(p, g), antesDoDia)}</select></div>`).join('')}</div>` : '';
  const c2 = barra + pendentes + ctx.presenca;

  // 3. Escala
  const nMed = !temDuplas ? 0 : new Set([...(g.pares || []), ...(g.passes || [])].map((p) => p.m)).size;
  const r3 = !temDuplas ? 'Ainda não sorteada' : `Sorteada · ${nMed} ${nMed === 1 ? 'médium' : 'médiuns'} · ${publicada ? 'publicada' : 'falta publicar'}${g.travada ? ' · travada' : ''}`;
  const c3 = `${ctx.funcoes || ''}${ctx.sugestao}${ctx.sorteio}${ctx.trava ? `<div class="gn-trava">${ctx.trava}<small class="muted">${g.travada ? 'Escala travada: marcar falta ou ausência não muda a escala.' : 'Ligue quando a escala já valeu e só falta registrar quem faltou.'}</small></div>` : ''}`;

  // 4. Encerrar
  const r4 = g.evento ? 'Participantes e fechamento' : 'Atendidos e fechamento da gira';
  const c4 = `<div class="field">${g.evento ? '' : 'Atendidos nesta gira'}${ctx.atend}</div>
    ${pend.length ? `<p class="gn-aviso">${pend.length} ${pend.length === 1 ? 'pessoa ainda pendente' : 'pessoas ainda pendentes'} na Presença. Resolva para poder encerrar.</p>` : ''}
    ${ctx.encerrar}`;

  const prepOk = g.evento || (entOk && !!g.entidade && (!temLimpeza(g) || !!L));
  const lista = [[1, 'Preparar', r1, prepOk, c1]];
  if (!g.evento) lista.push([3, 'Escala', r3, publicada, c3]);
  lista.push([2, 'Presença', r2, !pend.length && total > 0, c2], [4, 'Encerrar', r4, false, c4]);
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
  return `<div class="gn-sec"><div class="gn-sec-h"><h3><span aria-hidden="true">🚫</span> Quem não vem</h3><span class="muted">${n}</span></div><div class="gn-fora">
    ${aus.length ? `<span class="gn-fora-t aus"><span class="gn-x fino" aria-hidden="true">✕</span> Ausência</span><span>${nomes(aus, 'aus')}</span>` : ''}
    ${fal.length ? `<span class="gn-fora-t falta"><span class="gn-x grosso" aria-hidden="true">✖</span> Faltas</span><span>${nomes(fal, 'falta')}</span>` : ''}
    ${lic.length ? `<span class="gn-fora-t"><span class="cruz-vermelha" aria-hidden="true">✚</span> Licença</span><span>${lic.map((p) => `${esc(p.nome)} <span class="muted">até ${dDM(licencaEm(p, g.data).fim)}</span>`).join(', ')}</span>` : ''}
  </div></div>`;
}

function daCorrente(ctx) {
  const { g, ps, admin, editar, encerrada, temDuplas, realizado, escala } = ctx;
  const partes = [];
  if (g.recado) partes.push(`<div class="gn-recado"><small>Recado</small><p>${esc(g.recado)}</p></div>`);
  if (realizado) partes.push(`<div class="gn-sec gn-escala">${realizado}</div>`);
  else if (escala) partes.push(`<div class="gn-sec">${escala}</div>`);
  else if (editar && !g.evento && !encerrada) partes.push(`<div class="gn-sec"><div class="gn-sec-h"><h3><span aria-hidden="true">📋</span> Escala</h3><span class="gn-aviso-t">${temDuplas ? 'aguardando publicação' : 'ainda não sorteada'}</span></div><p class="muted gn-nota">A corrente vê a imagem da escala aqui assim que ela for publicada.</p></div>`);
  if (!encerrada) { const l = blocoLimpeza(g); if (l) partes.push(`<div class="gn-sec">${l}</div>`); }
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
  const { g, semGira } = ctx;
  const faixa = faixaSemana(g, ctx.marcas, ctx.calendario);
  if (semGira) {
    return `<section class="panel gn">${faixa}<div class="gn-cab"><span class="gn-data">${esc(maiuscula(dLong(g.data)))}</span>${extrasDoDia(g.data, null)}</div>
      <button class="btn primary btn-grande" data-act="criargira">＋ Adicionar evento</button>${ctx.ausPrevia || ''}${ctx.ano || ''}</section>`;
  }
  const { existe, editar, encerrada } = ctx;
  let corpo = '';
  if (!ctx.ps.length || !existe) corpo = ctx.rodape || '';
  else if (encerrada) corpo = ctx.encerradaQuadro + daCorrente(ctx);
  else corpo = (editar ? conducao(ctx) : '') + daCorrente(ctx);
  // O bloco do ano (Atendimentos, sua presença, orixá de cabeça) vai no fim: os mesmos dados da Gira antiga.
  return `<section class="panel gn">${faixa}${cabecalho(ctx)}${corpo}${ctx.ano || ''}</section>`;
}

export const cliquesNova = {
  async amacivou(el) {
    const id = el.dataset.id;
    el.disabled = true;
    try {
      estado.amaciVou = { ...(estado.amaciVou || {}), [id]: await api('POST', '/giras', { acao: 'amaciVou', eventoId: id, vou: el.dataset.v === '1' }) };
      toast(el.dataset.v === '1' ? 'Marcado: você vai ao amaci.' : 'Desmarcado.');
    } catch (e) { toast(e.message); }
    avisar();
  },
  amaciquem(el) { const id = el.dataset.id; if (amaciAbertos.has(id)) amaciAbertos.delete(id); else amaciAbertos.add(id); avisar(); },
  gnpasso(el) {
    const d = giraAtual().data, n = Number(el.dataset.n);
    passos.set(d, passos.get(d) === n ? 0 : n);
    avisar();
  },
  gnmes() { mesAberto = !mesAberto; avisar(); },
  gnturma() {
    const g = giraAtual();
    if (turmaAberta.has(g.data)) turmaAberta.delete(g.data); else turmaAberta.set(g.data, Number(g.limpeza) || 0);
    avisar();
  },
  gnpend() { const d = giraAtual().data; if (pendAberto.has(d)) pendAberto.delete(d); else pendAberto.add(d); avisar(); },
  gnsemana(el) { prefs.data = maisDias(prefs.data, Number(el.dataset.v)); salvarPrefs(); avisar(); },
  gncomp() { compAberto = true; atualizarJanela(); },
  gncompfechar() { fecharCompartilhar(); },
  gnexcnao() { avisar(); },
  async gnexcluir(el) { const d = el.dataset.d; await excluirGira(d); passos.delete(d); },
};

// As ações do Compartilhar (waabrir, pvabrir, oraabrir, eventoimagem) chamam isto antes de abrir a própria janela.
export function fecharCompartilhar() {
  if (!compAberto) return;
  compAberto = false;
  atualizarJanela();
}
