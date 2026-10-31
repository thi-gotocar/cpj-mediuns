// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, STATUS_KEYS, LINHAS, LINHA_LABEL, OPCOES_GIRA, giraEspecial, nomeGira, contaNaPresenca, pendentesDaGira, ehCurimba, ORIXAS, temOrixa, orixaDaGira, TURMAS_LIMPEZA, temLimpeza, limpezaDaGira, proximaTurma, status, presencaDe, papelDe, naCorrenteEm, foraDaLinha, licencaEm, presente, cambonaHoje, paresPorMedium, custos, pessoasDaGira, funcaoNaGira, usaLinhas, linhaDaEntidade, podeDeclararAusencia, statusMarcado } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, nome, girasLista, giraAtual, editarGira, sortear, remanejar, encerrarGira, reabrirGira, reiniciarGira, declararAusencia, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar, hoje, pd } from '../util.js';
import { textoWhats, gruposExtras } from '../exportar.js';
import { gerarImagem } from '../imagem.js';
import { botaoResumo, painelResumo, cliquesResumo } from '../compartilharResumo.js';
import { dadosResumo } from '/shared/resumoGira.js';
import { eventosDaSemana, dataCurta } from '/shared/eventos.js';

const classeStatus = (s) => (s === 'a' || s === 'f' || s === 'lic' ? 'aus' : s === 'na' ? 'na' : s === 'sup' ? 'nc' : s === 'pend' ? 'pend' : '');
const ATEND = [['preferencial', 'Preferencial'], ['normal', 'Normal'], ['passe', 'Passe']];
function textoAtendimentos(a) {
  if (!a) return '';
  const total = ATEND.reduce((s, [k]) => s + (Number(a[k]) || 0), 0);
  return `${ATEND.map(([k, t]) => `${t} <b>${Number(a[k]) || 0}</b>`).join(' · ')} · Total <b>${total}</b>`;
}

function chaveImg() {
  return textoWhats(estado.pessoas, giraAtual(), 'lista', girasLista());
}
function podeCompartilhar() {
  try {
    return !!(estado.img && navigator.canShare && navigator.canShare({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })] }));
  } catch { return false; }
}

// Lista das linhas; mantém um valor antigo (texto livre) se a gira já tinha um.
function seletorEntidade(atual) {
  const conhecida = linhaDaEntidade(atual);
  const especial = giraEspecial(atual);
  const valor = nomeGira(atual);
  const antigo = valor && !conhecida && !especial ? `<option value="${esc(valor)}" selected>${esc(valor)} (fora da lista)</option>` : '';
  return `<select id="f-ent"><option value="" ${!valor ? 'selected' : ''}>— escolha —</option>${antigo}
    ${OPCOES_GIRA.map((grp) => `<optgroup label="${grp.grupo}">${grp.itens.map(([, label]) => `<option ${label === valor ? 'selected' : ''}>${label}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

// Turma da limpeza do dia e quem ajuda (faltou na gira anterior). Vale para todos verem.
function blocoLimpeza(g, admin) {
  if (!temLimpeza(g)) return '';
  const L = limpezaDaGira(estado.pessoas, g, girasLista());
  if (!L) return '';
  const nomes = (l) => l.map((p) => esc(p.nome)).join(', ');
  return `<div class="limpeza"><b>🧹 Limpeza · Turma ${L.turma}</b>
    <span>${L.membros.length ? nomes(L.membros) : '<span class="muted">Ninguém cadastrado nesta turma (cadastre na aba Pessoas).</span>'}</span>
    ${L.deLicenca.length ? `<span class="muted" style="font-size:.85rem">De licença: ${nomes(L.deLicenca)}</span>` : ''}
    ${L.ajudantes.length ? `<span><b>Ajudam</b> <span class="muted">(faltaram na Turma ${L.anterior.limpeza} em ${dDM(L.anterior.data)}${L.anterior.entidade ? ` · ${esc(nomeGira(L.anterior.entidade))}` : ''})</span>: ${nomes(L.ajudantes)}</span>`
      : L.anterior ? `<span class="muted" style="font-size:.85rem">Ninguém da Turma ${L.anterior.limpeza} faltou na gira de ${dDM(L.anterior.data)}.</span>` : ''}
  </div>`;
}

// Avisa quando há Extra/Passe com linhas marcadas e a entidade do dia não está definida.
// A lista de quem cambona por causa da linha só aparece para o admin.
function avisoEntidade(ps, g, editar, admin) {
  const comLinhas = ps.filter(usaLinhas);
  if (!comLinhas.length) return '';
  if (giraEspecial(g.entidade)) {
    return admin ? `<p class="muted" style="margin:0;font-size:.88rem">${esc(nomeGira(g.entidade))}: extras e passes atuam na própria função, sem olhar as linhas.</p>` : '';
  }
  if (!linhaDaEntidade(g.entidade)) {
    return editar ? `<div class="warnbox">Escolha a entidade do dia: é ela que define quem atua como extra ou passe e quem cambona.</div>` : '';
  }
  const viram = comLinhas.filter((p) => funcaoNaGira(p, g) === 'cambone');
  return admin && viram.length
    ? `<p class="muted" style="margin:0;font-size:.88rem">Nesta gira de ${esc(LINHA_LABEL[linhaDaEntidade(g.entidade)])}, cambonam: ${viram.map((p) => esc(p.nome)).join(', ')}.</p>`
    : '';
}

// Faltas e ausentes: na tela, para todos conferirem (não entram no texto nem na imagem do evento).
// Antes, o total de presentes (quem está na gira), separado pelo que cada um faz no dia:
// médium, cambone (inclui quem "não atende" e extra/passe fora da linha), passe, extra, senha e suporte.
// Total de presentes (quem está na gira), separado pelo que cada um faz no dia. Fica no primeiro bloco.
function contagemPresentes(ps, g, pct = null) {
  const dia = pessoasDaGira(ps, g);
  const conta = {
    'Médium': dia.filter((p) => presente(p, g) && p.funcao === 'medium').length,
    'Cambone': dia.filter((p) => cambonaHoje(p, g)).length,
    'Passe': dia.filter((p) => presente(p, g) && p.funcao === 'passe').length,
    'Extra': dia.filter((p) => presente(p, g) && p.funcao === 'extra').length,
    'Senha': dia.filter((p) => presente(p, g) && p.funcao === 'senha').length,
    'Suporte': dia.filter((p) => status(p, g) === 'sup').length,
  };
  const naGira = Object.values(conta).reduce((a, n) => a + n, 0);
  if (!naGira) return '';
  const fora = (st) => ps.filter((p) => presencaDe(p, g) === st).length;
  const extra = [['pend', 'pendente', 'pendentes'], ['f', 'falta', 'faltas'], ['a', 'ausente', 'ausentes'], ['lic', 'de licença', 'de licença']].filter(([st]) => fora(st)).map(([st, um, varios]) => `${fora(st)} ${fora(st) === 1 ? um : varios}`).join(' · ');
  return `<div class="pres-topo"><div class="grp-h"><h3>Presentes</h3><span class="count"><b>${naGira}</b>${pct !== null ? ` · <b>${pct}%</b>` : ''}${extra ? ` <span class="muted">· ${extra}</span>` : ''}</span></div>
    <div class="presentes">${Object.entries(conta).map(([t, n]) => `<span><span class="muted">${t}</span> <b>${n}</b></span>`).join('')}</div></div>`;
}

// Faltas, ausentes e licenças: na tela, para todos conferirem (não entram no texto nem na imagem do evento).
function blocosFora(ps, g) {
  return [['f', 'Faltaram'], ['a', 'Ausentes'], ['lic', 'De licença']].map(([st, titulo]) => {
    const quem = ps.filter((p) => status(p, g) === st);
    return quem.length ? `<div class="grp fora"><div class="grp-h"><h3>${titulo}</h3><span class="count">${quem.length}</span></div><p style="margin:0">${quem.map((p) => esc(p.nome)).join(', ')}</p></div>` : '';
  }).join('');
}

// Ao lado da data: para o admin, numa gira em aberto, "Encerrar gira"; nos outros casos, "Próxima gira".
function botaoTopo(g, editar, existe) {
  if (!(editar && existe)) return `<button class="btn prox-gira" data-act="proxgira" title="Vai para a próxima quarta-feira">Próxima gira</button>`;
  if (estado.confirm === 'enc:' + g.data) return `<button class="btn prox-gira" data-act="cancelenc">Cancelar</button>`;
  const pend = pendentesDaGira(estado.pessoas, g).length;
  return pend
    ? `<button class="btn prox-gira enc-bt" data-act="encpend" data-n="${pend}" title="Confirme a presença de todos antes de encerrar">Encerrar gira</button>`
    : `<button class="btn prox-gira enc-bt" data-act="askdel" data-k="enc:${g.data}">Encerrar gira</button>`;
}

// Encerrar: pede os atendimentos.
function caixaEncerrar(g) {
  const a = g.atendimentos || {};
  return `<div class="infobox enc"><span><b>Encerrar a gira.</b> Quantas pessoas foram atendidas? (pode ser 0)</span>
    <div class="row">${ATEND.map(([k, t]) => `<label class="field" style="flex:1 1 90px">${t}<input type="number" inputmode="numeric" min="0" step="1" id="at-${k}" value="${a[k] ?? 0}"></label>`).join('')}</div>
    <span class="muted" style="font-size:.85rem">Quem estava para cambonar e não ficou com nenhum médium, e médium de passe sem médium, vão para o <b>Suporte</b>. Depois disso a escala não muda até ser reaberta; ao reabrir, essas pessoas voltam para a lista.</span>
    <span class="row"><button class="btn small primary" data-act="encerrar">Encerrar</button><button class="btn small" data-act="cancelenc">Cancelar</button></span></div>`;
}

// Próxima quarta-feira (hoje, se hoje for quarta).
function proximaQuarta() {
  const d = pd(hoje());
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ROTULO_FUNCAO = { medium: 'Médium', extra: 'At. Extra', cambone: 'Cambone', passe: 'Médium de passe', senha: 'Senha', curimba: 'Curimba' };
// Bloco de quem está logado: com quem trabalha nesta gira e se é da turma da limpeza.
const ROTULO_PRESENCA = { pend: 'Pendente', p: 'Presente', f: 'Falta', a: 'Ausente', lic: 'Licença' };
function blocoEu(g) {
  const p = estado.me?.pessoaId && estado.pessoas.find((x) => x.id === estado.me.pessoaId);
  if (!p) return '';
  if (!naCorrenteEm(p, g.data)) return `<div class="card eu"><div class="grp-h"><span class="eyebrow">Você nesta gira</span></div>
    <div class="eu-nome"><b>${esc(p.nome)}</b></div><p class="muted" style="margin:0">Sua entrada na corrente é em ${dDM(p.entrada)}/${p.entrada.slice(0, 4)}: esta gira ainda não conta para você.</p></div>`;
  const curimba = ehCurimba(p);
  const st = curimba ? 'p' : status(p, g);
  const funcao = st === 'na' ? 'cambone' : funcaoNaGira(p, g);
  const pares = g.pares || [], passes = g.passes || [];
  const sorteado = pares.length > 0 || passes.length > 0;
  const camsDe = (m) => pares.filter((x) => x.m === m).map((x) => x.c);
  const passesDe = (m) => passes.filter((x) => x.m === m).map((x) => x.c);
  const L = [];
  const lin = (rot, val) => L.push(`<div class="eu-l"><span class="muted">${rot}:</span> <b>${val}</b></div>`);
  const aviso = (t) => L.push(`<p class="muted" style="margin:0">${t}</p>`);
  const fora = (t) => L.push(`<div class="eu-fora">${t}</div>`);
  if (st === 'lic') {
    const l = licencaEm(p, g.data);
    fora(`📋 Você está <b>de licença</b>${l ? ` de ${dDM(l.inicio)} a ${dDM(l.fim)}` : ''}${l?.motivo ? ` · ${esc(l.motivo)}` : ''}.`);
  } else if (st === 'a') fora('❌ Você está marcado como <b>ausente</b> nesta gira.');
  else if (st === 'f') fora('🚫 Você está marcado com <b>falta</b> nesta gira.');
  else if (st === 'sup') aviso('Hoje você está no <b>Suporte</b>.');
  else if (curimba) lin('Função', 'Curimba');
  else if (funcao === 'senha') lin('Função', 'Senha');
  else if (!sorteado) aviso('A escala desta gira ainda não foi sorteada.');
  else if (funcao === 'medium' || funcao === 'extra') {
    const cs = camsDe(p.id);
    if (!cs.length) aviso('Você ainda está sem cambone.');
    cs.forEach((c, i) => lin(i ? `${i + 1}º cambone` : 'Cambone', esc(nome(c))));
    if (funcao === 'medium') passesDe(p.id).forEach((c) => lin('Médium de passe', esc(nome(c))));
  } else if (funcao === 'cambone') {
    const meus = pares.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você não está com nenhum médium nesta escala.');
    meus.forEach((m, i) => {
      lin(meus.length > 1 ? `Médium ${i + 1}` : 'Médium', esc(nome(m)));
      camsDe(m).filter((c) => c !== p.id).forEach((c) => lin('Cambone junto', esc(nome(c))));
      passesDe(m).forEach((c) => lin('Médium de passe', esc(nome(c))));
    });
  } else if (funcao === 'passe') {
    const meus = passes.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você ainda está sem médium.');
    meus.forEach((m) => {
      lin('Médium', esc(nome(m)));
      camsDe(m).forEach((c) => lin('Cambone do médium', esc(nome(c))));
    });
  }
  const pr = presencaDe(p, g);
  if (!curimba && estado.me?.corrente) {
    // Acesso da corrente (cpj): o combo mostra sempre o status da lista de presença.
    // Pendente → Ausente só até a véspera e enquanto o admin não marcou; depois fica bloqueado.
    const gs = estado.giras[g.data];
    const declara = podeDeclararAusencia(p, gs, hoje());
    if (declara) aviso('Altere o status para “Ausente” caso não consiga ir no dia, o controle segue com a Michelle. #boa gira');
    const opts = declara ? [['pend', 'Pendente'], ['a', 'Ausente']] : [[pr, ROTULO_PRESENCA[pr] || pr]];
    const motivo = declara ? '' : pr === 'pend' && !statusMarcado(p, gs) && gs && hoje() >= g.data
      ? 'No dia da gira, só a Michelle altera.'
      : gs?.encerrada ? 'Gira encerrada.' : 'Status definido na lista de presença.';
    L.push(`<label class="eu-aus"><span class="muted">Seu status:</span>
      <select id="eu-aus" class="st-${pr}" data-act="ausencia" aria-label="Seu status nesta gira" ${declara ? '' : 'disabled'}>${opts.map(([k, l]) => `<option value="${k}" ${k === pr ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${declara ? '' : `<span class="muted eu-trava">🔒 ${motivo}</span>`}</label>`);
  } else if (!curimba && pr === 'pend') aviso('Sua presença ainda não foi confirmada.');
  // Turma da limpeza
  const Lp = limpezaDaGira(estado.pessoas, g, girasLista());
  if (Lp && st !== 'lic') {
    if (Number(p.limpeza) === Lp.turma) L.push(`<div class="eu-limp">🧹 Hoje é sua turma de limpeza.</div>`);
    else if (Lp.ajudantes.some((x) => x.id === p.id)) {
      L.push(`<div class="eu-limp">🧹 Hoje você ajuda essa turma, pois faltou na sua turma na gira passada.</div>`);
    }
  }
  const convertido = funcao !== p.funcao && st !== 'lic' ? ` <span class="badge rep">hoje: ${ROTULO_FUNCAO[funcao] || funcao}</span>` : '';
  const nomeDaGira = g.entidade ? `${nomeGira(g.entidade)}${orixaDaGira(g) ? ` · ${orixaDaGira(g)}` : ''}` : '';
  return `<div class="card eu"><div class="grp-h eu-h"><span class="eyebrow">Você nesta gira</span>${nomeDaGira ? `<span class="eu-gira">${esc(nomeDaGira)}</span>` : ''}</div>
    <div class="eu-nome"><b>${esc(p.nome)}</b> <span class="tag">${ROTULO_FUNCAO[p.funcao] || p.funcao}</span>${convertido}</div>
    ${L.join('')}</div>`;
}

// "Médiuns e cambones" começa minimizado; abre enquanto o app estiver aberto.
const duplasAbertas = new Set();
const botaoDobrar = (aberto) => `<button class="btn link small ver-mais" data-act="dobrarduplas" aria-expanded="${aberto}">${aberto ? '▾ Minimizar' : '▸ Ver mais'}</button>`;
// Presença e WhatsApp também começam minimizados (abrem enquanto o app estiver aberto).
const abertos = new Set();
const cabDobra = (k, titulo, extra = '') => {
  const ab = abertos.has(k);
  return `<button class="grp-h dobra" data-act="dobrarcard" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${extra} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
};

// Só o resultado do sorteio (acesso da corrente).
function resultado(g) {
  const { lista, semPasse } = paresPorMedium(estado.pessoas, g);
  const comDuplas = lista.some((x) => x.cams.length || x.passes.length);
  if (!comDuplas) return `<div class="card empty"><h2>Sorteio ainda não feito</h2><p class="muted">A escala desta gira ainda não foi sorteada.</p></div>`;
  const aberto = duplasAbertas.has(g.data);
  let h = `<div class="card"><div class="grp-h"><h2>Sorteio</h2></div>`;
  if (!aberto) return h + `${blocosFora(pessoasOrd().filter((p) => contaNaPresenca(p) && naCorrenteEm(p, g.data)), g)}${botaoDobrar(false)}</div>`;
  h += `<div class="pairs">`;
  lista.forEach((x) => {
    h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)}</span><span></span><div class="cams">`;
    h += x.cams.length ? x.cams.map((p) => `<div class="camrow"><span class="tag cam">Cambone</span><span class="nmc">${esc(nome(p.c))}</span></div>`).join('') : '<span class="muted">Sem cambone</span>';
    h += x.passes.map((p) => `<div class="camrow"><span class="tag">Passe</span><span class="nmc">${esc(nome(p.c))}</span></div>`).join('');
    h += `</div></div>`;
  });
  h += `</div>`;
  if (semPasse.length) h += `<p class="muted" style="margin:0">Passe sem médium: ${semPasse.map(nome).map(esc).join(', ')}</p>`;
  gruposExtras(estado.pessoas, g, girasLista()).forEach(([t, nomes]) => {
    h += `<div class="grp"><h3>${t}</h3><p style="margin:0">${nomes.map(esc).join(', ')}</p></div>`;
  });
  h += blocosFora(pessoasOrd().filter((p) => contaNaPresenca(p) && naCorrenteEm(p, g.data)), g);
  return h + `${botaoDobrar(true)}</div>`;
}

// Topo da aba Gira: eventos de hoje até daqui a 7 dias (rola se forem muitos).
function cardSemana() {
  const hj = hoje();
  const evs = eventosDaSemana(estado.eventos, hj);
  const dia = (d) => (d === hj ? 'Hoje' : pd(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()) + ' ' + dataCurta(d));
  return `<div class="card ev-semana"><div class="grp-h"><span class="eyebrow">📅 Eventos da semana</span>${evs.length ? `<span class="count">${evs.length}</span>` : ''}</div>
    ${evs.length ? `<div class="evs-lista">${evs.map((e) => `<div class="evs-l${e.data === hj ? ' hoje' : ''}"><span class="evs-dia">${dia(e.data)}</span><span class="evs-sep">-</span><span class="evs-nome">${esc(e.nome)}</span></div>`).join('')}</div>`
      : '<p class="muted" style="margin:0;font-size:.88rem">Nenhum evento nos próximos 7 dias.</p>'}</div>`;
}

export function render() {
  return renderGira().replace('<section class="panel">', '<section class="panel">' + cardSemana());
}

function renderGira() {
  const g = giraAtual();
  // Curimba fica fora da presença; quem entrou na corrente depois desta data também.
  const ps = pessoasOrd().filter((p) => contaNaPresenca(p) && naCorrenteEm(p, g.data));
  const admin = pode('giras:editar');
  const encerrada = !!g.encerrada;
  // Gira encerrada não muda até ser reaberta.
  const editar = admin && !encerrada;
  const sortearOk = pode('giras:sortear') && !encerrada;
  const existe = !!estado.giras[g.data];

  // Data sem gira (admin): só o card para adicionar o evento.
  if (editar && !existe) {
    return `<section class="panel"><div class="card card-novo">
      <div class="datehead"><span class="eyebrow">${esc(dLong(g.data))}</span><span class="dia gira-nome">Nenhuma gira nesta data</span></div>
      <div class="row"><div class="data-linha"><label class="field">Data do evento<input type="date" id="f-data" value="${esc(g.data)}"></label>
        <div class="field prox-campo"><span aria-hidden="true">&nbsp;</span>${botaoTopo(g, editar, existe)}</div></div></div>
      <button class="btn primary btn-grande" data-act="criargira">＋ Adicionar evento</button></div></section>`;
  }
  let h = `<section class="panel">
  <div class="card card-gira">
    ${editar && existe ? (estado.confirm === 'rei:' + g.data
      ? `<div class="infobox rei"><span><b>Reiniciar a gira?</b> Volta tudo ao início: todos ficam Pendente e saem a gira, o orixá, a turma da limpeza e o sorteio. Só a data fica.</span>
          <span class="row" style="gap:6px"><button class="btn small danger" data-act="reiniciar">Sim, reiniciar</button><button class="btn small" data-act="cancelrei">Cancelar</button></span></div>`
      : '') : ''}
    <div class="datehead"><div class="dh-linha"><span class="eyebrow">${esc(dLong(g.data))}</span>${editar && existe && estado.confirm !== 'rei:' + g.data
      ? `<button class="btn small rei-bt" data-act="askdel" data-k="rei:${g.data}" title="Volta a gira ao início (só a data fica)">↺ Reiniciar</button>` : ''}</div><span class="dia gira-nome">${g.entidade ? (giraEspecial(g.entidade) ? esc(nomeGira(g.entidade)) : `Gira de ${esc(nomeGira(g.entidade))}`) : 'Gira'}</span>${orixaDaGira(g) ? `<span class="ent">Orixá: ${esc(orixaDaGira(g))}</span>` : ''}</div>
    <div class="row">
      <div class="data-linha"><label class="field">Data do evento<input type="date" id="f-data" value="${esc(g.data)}"></label>
      <div class="field prox-campo"><span aria-hidden="true">&nbsp;</span>${botaoTopo(g, editar, existe)}</div></div>
      ${editar ? `<label class="field grow">Gira / entidade do dia${seletorEntidade(g.entidade)}</label>` : ''}
      ${editar && temOrixa(g) ? `<label class="field" style="flex:1 1 130px">Orixá<select data-act="orixagira" aria-label="Orixá"><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === g.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : ''}
      ${editar && temLimpeza(g) ? `<label class="field" style="flex:1 1 130px">Turma da limpeza<select data-act="limpezagira"><option value="">— nenhuma —</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(g.limpeza) === t ? 'selected' : ''}>Turma ${t}</option>`).join('')}</select></label>` : ''}
    </div>
    ${editar && existe && estado.confirm === 'enc:' + g.data ? caixaEncerrar(g) : ''}
    ${encerrada ? '' : blocoLimpeza(g, admin)}
    ${encerrada ? `<div class="infobox"><div class="enc-info"><span><b>Gira encerrada.</b>${admin ? ' Para alterar a escala, reabra.' : ''}</span>
      ${g.atendimentos ? `<span>${textoAtendimentos(g.atendimentos)}</span>` : ''}
      ${contagemPresentes(ps, g, dadosResumo(estado.pessoas, g).pct.presenca)}
      <div class="enc-limp-sec">
      ${admin && temOrixa(g) ? `<label class="enc-limp">Orixá <select data-act="orixagira" aria-label="Orixá"><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === g.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : ''}
      ${admin && temLimpeza(g) ? `<label class="enc-limp">🧹 Turma da limpeza <select data-act="limpezagira" aria-label="Turma da limpeza"><option value="">— nenhuma —</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(g.limpeza) === t ? 'selected' : ''}>Turma ${t}</option>`).join('')}</select></label>` : ''}
      ${(() => { const L = limpezaDaGira(estado.pessoas, g, girasLista()); if (!L) return '';
        const quem = `${L.membros.map((p) => esc(p.nome)).join(', ')}${L.ajudantes.length ? ` · ajudam: ${L.ajudantes.map((p) => esc(p.nome)).join(', ')}` : ''}`;
        return admin ? (quem ? `<span class="muted" style="font-size:.88rem">${quem}</span>` : '') : `<span>🧹 Limpeza: <b>Turma ${L.turma}</b>${quem ? ` (${quem})` : ''}</span>`; })()}
      </div></div><span class="row" style="gap:6px">${pode('escala:completa') ? botaoResumo(g) : ''}${admin ? '<button class="btn small" data-act="reabrir">Reabrir gira</button>' : ''}</span></div>
    ${pode('escala:completa') ? painelResumo(g) : ''}` : ''}
    ${avisoEntidade(ps, g, editar, admin)}
    ${!editar && pode('escala:completa') ? `<p class="leitura" style="margin:0">Você está no modo de consulta: vê a escala e pode exportar, mas não altera.</p>` : ''}
    ${!encerrada && (existe || editar) ? contagemPresentes(ps, g) : ''}
  </div>`;
  if (existe || (estado.me?.pessoaId && licencaEm(estado.pessoas.find((x) => x.id === estado.me.pessoaId) || {}, g.data))) h += blocoEu(g);

  if (!ps.length) {
    return h + `<div class="card empty"><h2>Nenhuma pessoa cadastrada</h2><p class="muted">${pode('pessoas:editar') ? 'Cadastre a corrente na aba Pessoas.' : 'Um admin precisa cadastrar a corrente.'}</p>
      ${pode('pessoas:editar') ? '<button class="btn primary" data-act="goto" data-tab="pessoas">Cadastrar pessoas</button>' : ''}</div></section>`;
  }
  if (!editar && !existe) {
    const completa = pode('escala:completa');
    return h + `<div class="card empty"><h2>Escala ainda não montada</h2><p class="muted">Não há escala salva para esta data.${completa ? ' Escolha outra data ou veja as giras no Histórico.' : ' Escolha outra data.'}</p>
      ${completa ? '<button class="btn" data-act="goto" data-tab="hist">Ver histórico</button>' : ''}</div></section>`;
  }
  if (!pode('escala:completa')) return h + resultado(g) + '</section>';

  // presença
  const cont = (s) => ps.filter((p) => presencaDe(p, g) === s).length;
  const contPapel = (r) => ps.filter((p) => status(p, g) === r).length;
  const antesDoDia = g.pendentePadrao && g.data > hoje();
  const partes = [[cont('pend'), 'pendente', 'pendentes'], [cont('p'), 'presente', 'presentes'], [cont('f'), 'falta', 'faltas'], [cont('a'), 'ausente', 'ausentes'], [cont('lic'), 'de licença', 'de licença'], [contPapel('sup'), 'no suporte', 'no suporte'], [contPapel('na'), 'não atende', 'não atendem']]
    .filter(([n], i) => n || i === 1).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(' · ');
  h += `<div class="card">${cabDobra('pres', 'Presença', partes)}`;
  if (abertos.has('pres')) {
  if (editar && antesDoDia) h += `<div class="warnbox">Antes do dia da gira todos ficam <b>Pendente</b>; dá para marcar só <b>Ausente</b> (quem avisou antes). Presente e Falta são marcados no dia.</div>`;
  if (editar) h += `<p class="muted" style="margin:0;font-size:.88rem">No dia da gira, confirme cada pessoa: <b>Presente</b> para quem foi, <b>Falta</b> para quem avisou em cima da hora e <b>Ausente</b> para quem avisou antes. <b>Pendente</b> (cinza) ainda entra na escala. No segundo campo fica a função do cadastro; troque para <b>Suporte</b> (fora do sorteio) ou <b>Não atende</b> (está na gira e cambona).</p>`;
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    const np = gp.filter((p) => presencaDe(p, g) === 'p').length;   // presença confirmada
    h += `<div class="grp"><div class="grp-h"><h3>${f.pl}</h3><span class="count">${np}/${gp.length}
      ${editar && !antesDoDia ? `<button class="btn link" data-act="todos" data-f="${f.k}" data-v="${np === gp.length ? 'a' : 'p'}">${np === gp.length ? 'marcar ausentes' : 'todos presentes'}</button>` : ''}</span></div>
      <div class="plist">${gp.map((p) => {
        const s = status(p, g);
        const xp = p.experiente && p.funcao === 'medium' ? ' <span class="xp" title="Pode ter médium de passe junto" aria-label="Pode ter médium de passe junto">★</span>' : '';
        const hoje = '';
        const lic = licencaEm(p, g.data);
        const ctl = lic
          ? `<span class="badge lic" title="De licença de ${dDM(lic.inicio)} a ${dDM(lic.fim)}">de licença até ${dDM(lic.fim)}</span>`
          : editar
          ? (() => {
            // 1º combo: Pendente, Presente, Falta, Ausente. 2º combo: a função do cadastro, Suporte ou Não atende.
            const sel = presencaDe(p, g);
            const ops = [...(g.pendentePadrao || s === 'pend' ? ['pend'] : []), 'p', 'f', 'a'];
            const papel = papelDe(p, g);
            // Antes do dia da gira: só Pendente ou Ausente (Presente e Falta, só no dia).
            const bloqueada = (k) => antesDoDia && (k === 'p' || k === 'f') && k !== sel;
            return `<span class="st-ctl"><select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${ops.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''} ${bloqueada(k) ? 'disabled' : ''}>${STATUS[k]}${bloqueada(k) ? ' (no dia)' : ''}</option>`).join('')}</select>
              <select class="st papel-dia ${papel}" id="pp-${p.id}" data-act="papel" data-id="${p.id}" aria-label="Como ${esc(p.nome)} trabalha nesta gira">${[['cad', ({ medium: 'Médium', cambone: 'Cambone', passe: 'Passe', extra: 'At. Extra', senha: 'Senha' })[p.funcao] || p.funcao], ['sup', 'Suporte'], ['na', 'Não atende']].map(([k, t]) => `<option value="${k}" ${k === papel ? 'selected' : ''}>${t}</option>`).join('')}</select></span>`;
          })()
          : `<span class="st-txt">${STATUS[s]}</span>`;
        return `<div class="pres ${classeStatus(presencaDe(p, g))}"><span class="nm">${esc(p.nome)}${xp}${hoje}</span>${ctl}</div>`;
      }).join('')}</div></div>`;
  });
  }
  h += `</div>`;

  // duplas
  const { lista, validos, passesV, semPasse, invalidos } = paresPorMedium(estado.pessoas, g);
  const map = custos(girasLista(), g.data, 'pares');
  const mapP = custos(girasLista(), g.data, 'passes');
  const psg = pessoasDaGira(ps, g);
  const camsPres = psg.filter((p) => cambonaHoje(p, g));
  const passPres = psg.filter((p) => presente(p, g) && p.funcao === 'passe');
  // Quem está no Suporte também pode ser posto como cambone (sai do Suporte).
  const doSuporte = psg.filter((p) => status(p, g) === 'sup');
  const grupoSup = (lista, fn) => (lista.length ? `<optgroup label="Do Suporte">${lista.map(fn).join('')}</optgroup>` : '');
  const selo = (e) => (!e ? `<span class="badge new">1ª vez juntos</span>`
    : e.recente ? `<span class="badge hot">repetiu da última</span>`
      : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
  const passada = g.data < hoje();
  const linha = (k, p, idx, opts, mp, rotulo) => {
    const quem = editar
      ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}${k === 'pares' ? grupoSup(doSuporte, (c) => `<option value="${c.id}">${esc(c.nome)}</option>`) : ''}</select>`
      : `<span class="nmc">${esc(nome(p.c))}</span>`;
    const fixar = editar && !passada
      ? `<button class="lock" data-act="fixo" data-k="${k}" data-i="${idx}" aria-pressed="${!!p.fixo}" title="Manter no próximo sorteio">${p.fixo ? 'Fixada' : 'Fixar'}</button>`
      : p.fixo ? '<span class="badge rep">fixada</span>' : '';
    return `<div class="camrow">${rotulo ? `<span class="tag ${rotulo === 'Cambone' ? 'cam' : ''}">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${fixar}</div>`;
  };
  const temDuplas = validos.length || passesV.length;
  // Ajuste manual: em gira passada fica sempre ligado (registrar como foi);
  // nas outras, o admin liga pelo botão.
  const manual = editar && (passada || estado.manual === g.data);
  const comQuem = (id, k) => (g[k] || []).filter((p) => p.c === id).map((p) => nome(p.m));
  const adicionar = (x) => {
    const naoCam = new Set(x.cams.map((p) => p.c));
    const cams = camsPres.filter((c) => c.id !== x.m.id && !naoCam.has(c.id));
    const sups = doSuporte.filter((c) => c.id !== x.m.id);
    const naoPas = new Set(x.passes.map((p) => p.c));
    const pas = passPres.filter((c) => !naoPas.has(c.id));
    const opt = (c, k, txt) => { const j = comQuem(c.id, k); return `<option value="${c.id}">${esc(c.nome)}${j.length ? ` (${txt} ${esc(j.join(', '))})` : ''}</option>`; };
    return `<div class="addrow">
      ${cams.length || sups.length ? `<select data-act="addcam" data-m="${x.m.id}" aria-label="Adicionar cambone a ${esc(x.m.nome)}"><option value="">+ cambone</option>${cams.map((c) => opt(c, 'pares', 'também com')).join('')}${grupoSup(sups, (c) => opt(c, 'pares', 'também com'))}</select>` : ''}
      ${pas.length ? `<select data-act="addpasse" data-m="${x.m.id}" aria-label="Adicionar médium de passe a ${esc(x.m.nome)}"><option value="">+ médium de passe</option>${pas.map((c) => opt(c, 'passes', 'sai de')).join('')}</select>` : ''}
    </div>`;
  };
  const aberto = manual || duplasAbertas.has(g.data);
  h += `<div class="card"><div class="grp-h"><h2>Sorteio</h2></div>
      ${sortearOk ? (temDuplas
        ? '<div class="sort-acoes"><button class="btn primary btn-grande" data-act="remanejar">Remanejar faltas</button><button class="btn" data-act="sortear">Sortear tudo de novo</button></div>'
        : '<button class="btn primary btn-grande" data-act="sortear">🎲 Sortear</button>') : ''}
      ${editar && !passada ? `<div class="row"><button class="btn small" data-act="manual" aria-pressed="${manual}">${manual ? 'Concluir ajuste' : 'Ajuste manual'}</button></div>` : ''}`;
  if (manual) h += `<p class="muted" style="margin:0;font-size:.88rem">${passada ? '<b>Gira passada:</b> registre como foi. ' : ''}Adicione ou tire cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone, e o médium de passe pode ir com qualquer médium.</p>`;
  if (invalidos && sortearOk) h += `<div class="warnbox">${invalidos} dupla(s) envolvem alguém que faltou ou mudou de status. Toque em <b>Remanejar faltas</b> para ajustar só essas, sem mexer nas outras.</div>`;
  if (validos.length && semPasse.length) h += `<div class="warnbox">${semPasse.map(nome).map(esc).join(', ')} ainda sem médium.${manual ? ' Adicione no médium com quem foi.' : sortearOk ? (ps.some((p) => p.funcao === 'medium' && p.experiente) ? ' Sorteie de novo.' : ' Marque na aba Pessoas quais médiuns podem ter passe junto.') : ''}</div>`;
  if (!aberto) {
    h += `${blocosFora(ps, g)}${botaoDobrar(false)}</div>`;
  } else {
  if (!lista.length) h += `<p class="muted">Nenhum médium presente.</p>`;
  else if (!temDuplas && !manual) h += `<p class="muted">${lista.length} médiuns e extras, ${camsPres.length} cambones e ${passPres.length} médiuns de passe presentes.${sortearOk ? ' Toque em sortear para montar as duplas.' : ' As duplas ainda não foram sorteadas.'}</p>`;
  else {
    const tirar = (k, i) => (manual ? `<button class="lock rm" data-act="remover" data-k="${k}" data-i="${i}" title="Tirar deste médium" aria-label="Tirar">✕</button>` : '');
    h += `<div class="pairs">`;
    lista.forEach((x) => {
      h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)}</span><span class="muted" style="font-size:.85rem">${x.cams.length} cambone${x.cams.length === 1 ? '' : 's'}</span><div class="cams">`;
      x.cams.forEach((p) => { const i = (g.pares || []).indexOf(p); h += linha('pares', p, i, camsPres, map, 'Cambone').replace(/<\/div>$/, tirar('pares', i) + '</div>'); });
      if (!x.cams.length) h += `<span class="muted">Sem cambone.${manual ? '' : sortearOk ? ' Sorteie de novo.' : ''}</span>`;
      x.passes.forEach((p) => { const i = (g.passes || []).indexOf(p); h += linha('passes', p, i, passPres, mapP, 'Passe').replace(/<\/div>$/, tirar('passes', i) + '</div>'); });
      if (manual) h += adicionar(x);
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  const sup = ps.filter((p) => status(p, g) === 'sup');
  if (sup.length) h += `<div class="grp"><div class="grp-h"><h3>Suporte</h3><span class="count">${sup.length}</span></div><p style="margin:0">${sup.map((p) => esc(p.nome)).join(', ')}</p></div>`;
  h += blocosFora(ps, g);
  h += `<details><summary class="muted" style="cursor:pointer;font-size:.9rem">Como o sorteio decide</summary>
    <ul class="rule">
      <li>Médiuns e extras recebem cambone.</li>
      <li>Quem está como “Não atende” entra no sorteio como cambone, junto com os cambones presentes.</li>
      <li>Quem está em Suporte fica fora do sorteio.</li>
      <li><b>Remanejar faltas</b> não mexe nas duplas que continuam válidas. Só realoca quem foi afetado por uma falta: médium sem cambone recebe um cambone livre; se não houver, sai um cambone de um médium que tem dois; depois alguém do Suporte; por último, um cambone passa a acompanhar dois médiuns. Cambones que sobram vão para médiuns com um só cambone (máximo de dois por médium) e o excedente vai para o Suporte.</li>
      <li>Médiuns de passe não recebem cambone: cada um é sorteado para ficar com um médium marcado como “pode ter passe junto”, com o mesmo rodízio.</li>
      <li>Dupla que nunca trabalhou junta tem prioridade.</li>
      <li>A dupla da última gira do médium é evitada sempre que houver outra opção.</li>
      <li>Duplas antigas pesam menos que recentes; quanto mais vezes juntas, menor a chance.</li>
      <li>Os cambones são divididos por igual. Se faltar cambone, alguns acompanham dois médiuns; se sobrar, alguns médiuns ganham dois.</li>
      <li>Duplas fixadas ficam como estão. Entre opções empatadas, a escolha é aleatória.</li>
    </ul></details>${manual ? '' : botaoDobrar(true)}</div>`;
  }

  // exportação
  const txt = textoWhats(estado.pessoas, g, prefs.fmt, girasLista());
  const imgOk = estado.img && estado.img.data === g.data && estado.img.key === chaveImg();
  h += `<div class="card">${cabDobra('wa', 'WhatsApp')}`;
  if (!abertos.has('wa')) { h += `</div>`; setTimeout(atualizarJanela, 0); return h + '</section>'; }
  h += `<div class="row" style="justify-content:flex-end">
    <div class="seg" role="group" aria-label="Formato"><button data-act="fmt" data-v="lista" aria-pressed="${prefs.fmt === 'lista'}">Lista</button><button data-act="fmt" data-v="tabela" aria-pressed="${prefs.fmt === 'tabela'}">Tabela</button></div></div>
    <textarea id="f-txt" readonly aria-label="Texto para o WhatsApp">${esc(txt)}</textarea>
    <div class="row"><button class="btn primary" data-act="copiar">Copiar texto</button>
    <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>
    <div class="grp" style="border-top:1px solid var(--line);padding-top:14px"><div class="grp-h"><h3>Imagem da escala</h3>
      <button class="btn ${imgOk ? '' : 'primary'}" data-act="gerarimg">${estado.img && !imgOk ? 'Gerar de novo' : imgOk ? 'Atualizar' : 'Gerar imagem'}</button></div>`;
  if (estado.img && !imgOk) h += `<p class="muted" style="margin:0;font-size:.88rem">A escala mudou desde a última imagem. Gere de novo.</p>`;
  else if (!estado.img) h += `<p class="muted" style="margin:0;font-size:.88rem">Gera um PNG com a escala da gira, pronto para mandar no grupo.</p>`;
  if (imgOk) {
    const share = podeCompartilhar();
    h += `<img id="img-prev" class="prev" src="${estado.img.url}" alt="Imagem da escala da gira">
      <div class="row">${share ? '<button class="btn primary" data-act="shareimg">Compartilhar</button>' : ''}<button class="btn ${share ? '' : 'primary'}" data-act="saveimg">Salvar imagem</button></div>
      <p class="muted" style="margin:0;font-size:.88rem">No celular, também dá para tocar e segurar a imagem para salvar.</p>`;
  }
  h += `</div></div>`;
  setTimeout(atualizarJanela, 0);
  return h + '</section>';
}

// ---------- ações ----------
export const cliques = {
  ...cliquesResumo,
  dobrarcard(el) { const k = el.dataset.k; if (abertos.has(k)) abertos.delete(k); else abertos.add(k); avisar(); },
  // Gira nova já vem com a próxima turma da limpeza (depois da última gira encerrada, pulando turmas vazias).
  criargira() {
    const d = giraAtual().data;
    abertos.clear(); duplasAbertas.delete(d);
    const t = proximaTurma(estado.pessoas, girasLista(), d);
    editarGira({ entidade: '', ...(t ? { limpeza: t } : {}) });
    if (t) toast(`Gira criada. Turma da limpeza: Turma ${t} (a próxima do rodízio).`);
    avisar();
  },
  todos(el) {
    const g = giraAtual();
    const pr = { ...(g.presenca || {}) };
    pessoasOrd().filter((p) => p.funcao === el.dataset.f).forEach((p) => {
      pr[p.id] = el.dataset.v === 'p' ? 'p' : 'a';
    });
    editarGira({ presenca: pr });
    avisar();
  },
  // Suporte liga/desliga (desligado volta para Presente).
  presok() { const c = estado.confPres; estado.confPres = null; atualizarJanela(); if (c) gravarPresenca(c.id, c.valor); },
  prescancel() { estado.confPres = null; atualizarJanela(); avisar(); },
  sortear: () => { duplasAbertas.add(giraAtual().data); sortear(); },
  dobrarduplas() {
    const d = giraAtual().data;
    if (duplasAbertas.has(d)) duplasAbertas.delete(d); else duplasAbertas.add(d);
    avisar();
  },
  proxgira() {
    const d = proximaQuarta();
    if (prefs.data === d) { toast('Você já está na próxima gira.'); return; }
    prefs.data = d; salvarPrefs(); avisar();
  },
  encpend(el) {
    const n = Number(el.dataset.n);
    toast(`Não dá para encerrar: ${n} pessoa${n > 1 ? 's' : ''} ainda com presença pendente. Marque Presente, Falta ou Ausente.`);
    document.querySelector('.pres.pend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  encerrar() {
    const at = {};
    for (const [k, t] of ATEND) {
      const v = (document.getElementById('at-' + k)?.value || '').trim() || '0';   // em branco = 0
      if (!/^\d+$/.test(v)) { toast(`Número inválido em ${t}.`); document.getElementById('at-' + k)?.focus(); return; }
      at[k] = Number(v);
    }
    estado.confirm = null;
    encerrarGira(at);
  },
  reabrir: () => reabrirGira(),
  cancelenc() { estado.confirm = null; avisar(); },
  cancelrei() { estado.confirm = null; avisar(); },
  async reiniciar() { estado.confirm = null; duplasAbertas.delete(giraAtual().data); await reiniciarGira(); },
  manual() {
    const d = giraAtual().data;
    estado.manual = estado.manual === d ? null : d;
    avisar();
  },
  remover(el) {
    const k = el.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).filter((_, i) => i !== +el.dataset.i) });
    avisar();
  },
  remanejar: () => { duplasAbertas.add(giraAtual().data); remanejar(); },
  fixo(el) {
    const k = el.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +el.dataset.i ? { ...p, fixo: !p.fixo } : p)) });
    avisar();
  },
  fmt(el) { prefs.fmt = el.dataset.v; salvarPrefs(); avisar(); },
  copiar() {
    const txt = textoWhats(estado.pessoas, giraAtual(), prefs.fmt, girasLista());
    const fb = () => { const t = document.getElementById('f-txt'); t.focus(); t.select(); toast('Texto selecionado. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
  },
  async gerarimg() {
    try {
      const g = giraAtual();
      const blob = await gerarImagem(estado.pessoas, g, girasLista());
      if (estado.img) URL.revokeObjectURL(estado.img.url);
      estado.img = { url: URL.createObjectURL(blob), blob, key: chaveImg(), data: g.data, nome: 'gira-' + g.data + '.png' };
      avisar();
      document.getElementById('img-prev')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { toast(e.message); }
  },
  saveimg() { if (estado.img) baixar(estado.img.url, estado.img.nome); },
  shareimg() {
    if (!estado.img) return;
    navigator.share({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })], title: 'Escala da gira' })
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagem.'); });
  },
};

// Quem estava no Suporte e foi posto como cambone volta para a gira:
// cambone (na função do dia) fica Presente; outra função fica "Não atende" (cambona).
function saiDoSuporte(g, id) {
  const p = pessoasDaGira(estado.pessoas, g).find((x) => x.id === id);
  if (!p || status(p, g) !== 'sup') return {};
  const papeis = { ...(g.papeis || {}) };
  if (p.funcao === 'cambone') delete papeis[id]; else papeis[id] = 'na';
  const presenca = { ...(g.presenca || {}) };
  if (presenca[id] === 'sup') presenca[id] = 'p';   // formato antigo
  return { papeis, presenca };
}

// Grava a presença (e tira Suporte / Não atende de quem faltou ou está ausente).
function gravarPresenca(id, valor) {
  const g = giraAtual();
  const pr = { ...(g.presenca || {}) };
  pr[id] = valor;
  const pa = { ...(g.papeis || {}) };
  if (valor === 'f' || valor === 'a') delete pa[id];
  editarGira({ presenca: pr, papeis: pa });
  avisar();
}

// A janela fica direto no <body> (fora da tela que é redesenhada), por cima de tudo.
let raizJanela = null;
function atualizarJanela() {
  const html = prefs.tab === 'gira' ? janelaPresenca() : '';
  if (!raizJanela) {
    if (!html) return;
    raizJanela = document.createElement('div');
    raizJanela.id = 'janela';
    document.body.appendChild(raizJanela);
    raizJanela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && cliques[b.dataset.act]) cliques[b.dataset.act](b);
      else if (e.target.classList.contains('modal-fundo')) cliques.prescancel();
    });
  }
  if (raizJanela.innerHTML !== html) raizJanela.innerHTML = html;
  if (html) raizJanela.querySelector('[data-act=presok]')?.focus();
}

// Janela para confirmar a troca de quem estava Pendente.
function janelaPresenca() {
  const c = estado.confPres;
  if (!c) return '';
  const p = estado.pessoas.find((x) => x.id === c.id);
  if (!p) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="mp-t"><div class="modal">
    <h3 id="mp-t">Confirmar presença</h3>
    <p style="margin:0"><b>${esc(p.nome)}</b>: de <b>Pendente</b> para <b>${STATUS[c.valor]}</b>?</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="prescancel">Cancelar</button><button class="btn primary" data-act="presok">Confirmar</button></div>
  </div></div>`;
}

export const mudancas = {
  // Acesso da corrente: Pendente → Ausente (só ela mesma, até a véspera).
  async ausencia(t) {
    if (t.value !== 'a') return;
    if (!confirm('Confirmar que você NÃO vai nesta gira?\nDepois disso, só a Michelle consegue mudar.')) { t.value = 'pend'; return; }
    await declararAusencia();
  },
  // Função na gira: a do cadastro (volta para Presente, ou Pendente antes do dia), Suporte ou Não atende.
  // Não mexe na presença.
  papel(t) {
    t.blur();
    const g = giraAtual();
    const pa = { ...(g.papeis || {}) };
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    // Função do cadastro: fora da linha precisa ficar guardada ('cad'); senão é o padrão.
    if (t.value === 'cad') { if (p && foraDaLinha(p, g)) pa[t.dataset.id] = 'cad'; else delete pa[t.dataset.id]; }
    else pa[t.dataset.id] = t.value;
    const pr = { ...(g.presenca || {}) };
    if (pr[t.dataset.id] === 'sup' || pr[t.dataset.id] === 'na') pr[t.dataset.id] = 'p';   // formato antigo
    editarGira({ papeis: pa, presenca: pr });
    avisar();
  },
  limpezagira(t) { editarGira({ limpeza: t.value ? Number(t.value) : null }); avisar(); },
  orixagira(t) { editarGira({ orixa: t.value }); avisar(); },
  entidade(t) { editarGira({ entidade: t.value }); avisar(); },
  data(t) { if (t.value) { prefs.data = t.value; salvarPrefs(); avisar(); } },
  // Quem estava Pendente: pede confirmação antes de gravar.
  status(t) {
    const g = giraAtual();
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (p && presencaDe(p, g) === 'pend' && t.value !== 'pend') {
      estado.confPres = { id: t.dataset.id, valor: t.value };
      t.blur();   // fecha a lista do combo (no celular ela ficava por cima da janela)
      avisar();   // o combo volta para Pendente até confirmar
      return;
    }
    gravarPresenca(t.dataset.id, t.value);
  },
  // Cambone pode acompanhar mais de um médium; médium de passe fica com um só (sai do anterior).
  addcam(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ pares: [...(g.pares || []), { m: t.dataset.m, c: t.value, fixo: false, remanejado: false }], ...saiDoSuporte(g, t.value) });
    avisar();
  },
  addpasse(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ passes: [...(g.passes || []).filter((p) => p.c !== t.value), { m: t.dataset.m, c: t.value, fixo: false, remanejado: false }] });
    avisar();
  },
  troca(t) {
    const k = t.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +t.dataset.i ? { ...p, c: t.value } : p)), ...(k === 'pares' ? saiDoSuporte(g, t.value) : {}) });
    avisar();
  },
};
