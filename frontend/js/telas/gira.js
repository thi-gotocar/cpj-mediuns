// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, STATUS_KEYS, LINHAS, LINHA_LABEL, OPCOES_GIRA, giraEspecial, nomeGira, contaNaPresenca, pendentesDaGira, ehCurimba, ORIXAS, temOrixa, orixaDaGira, TURMAS_LIMPEZA, temLimpeza, limpezaDaGira, proximaTurma, status, presencaDe, papelDe, naCorrenteEm, foraDaLinha, licencaEm, presente, cambonaHoje, paresPorMedium, custos, pessoasDaGira, funcaoNaGira, usaLinhas, linhaDaEntidade, podeDeclararAusencia, statusMarcado, guiaNaGira, sugestoesDaGira } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, nome, girasLista, giraAtual, editarGira, sortear, remanejar, encerrarGira, reabrirGira, mudarDataGira, cancelarSorteio, declararAusencia, publicarEscala, carregarOferendas, carregarPerfil, carregarFoto, acaoOracoes, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar, hoje, pd, ajustarRolagem, iniciais } from '../util.js';
import { blocosEventos, cliques as cliquesEventos } from './eventos.js';
import { textoWhats } from '../exportar.js';
import { gerarImagem } from '../imagem.js';
import { botaoResumo, painelResumo, cliquesResumo } from '../compartilharResumo.js';
import { dadosResumo, textoLimpeza } from '/shared/resumoGira.js';
import { eventosDoTopo, orixasDoDia, dataCurta, TIPO_EVENTO_LABEL } from '/shared/eventos.js';
import { banhosDaGira } from '/shared/banhos.js';
import { corDaFaixa } from './curimba.js';
import { textoEntrega, dataBR, ROTULO_MEDIUM, compromissosDe } from '/shared/oferendas.js';

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
  // Quem já está com ausência (ou falta) nesta gira aparece em vermelho e riscado.
  const nomes = (l) => l.map((p) => (['a', 'f'].includes(status(p, g)) ? `<s class="limp-nao">${esc(p.nome)}</s>` : esc(p.nome))).join(', ');
  // Admin: manda o aviso da turma para o WhatsApp (abre o app já com a mensagem).
  const wa = admin ? `<a class="btn small limp-wa" href="https://wa.me/?text=${encodeURIComponent(textoLimpeza(estado.pessoas, g, girasLista()))}" target="_blank" rel="noopener" title="Mandar a turma da limpeza no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> WhatsApp</a>` : '';
  return `<div class="limpeza"><div class="limp-cab"><b>🧹 Limpeza · Turma ${L.turma}</b>${wa}</div>
    <span>${L.membros.length ? nomes(L.membros) : '<span class="muted">Ninguém cadastrado nesta turma (cadastre na aba Pessoas).</span>'}</span>
    ${L.deLicenca.length ? `<span class="muted" style="font-size:.85rem">De licença: ${nomes(L.deLicenca)}</span>` : ''}
    ${L.ajudantes.length ? `<span><b>Ajudam</b> <span class="muted">(faltaram na Turma ${L.anterior.limpeza} em ${dDM(L.anterior.data)}${L.anterior.entidade ? ` · ${esc(nomeGira(L.anterior.entidade))}` : ''})</span>: ${nomes(L.ajudantes)}</span>`
      : L.anterior ? `<span class="muted" style="font-size:.85rem">Ninguém da Turma ${L.anterior.limpeza} faltou na gira de ${dDM(L.anterior.data)}.</span>` : ''}
  </div>`;
}

// Quem está de licença na data: mesmo padrão da limpeza, em vermelho, logo abaixo dela. Vale para todos verem.
function blocoLicenca(ps, g) {
  const quem = ps.filter((p) => licencaEm(p, g.data));
  if (!quem.length) return '';
  return `<div class="limpeza licenca"><b><span class="cruz-vermelha" aria-hidden="true">✚</span> De licença · ${quem.length}</b>
    <span>${quem.map((p) => `${esc(p.nome)} <span class="muted">(até ${dDM(licencaEm(p, g.data).fim)})</span>`).join(', ')}</span></div>`;
}

// Banho: ervas do orixá do dia e da linha da gira (das apostilas), logo abaixo da limpeza. Vale para todos verem.
function blocoBanho(g) {
  const { orixa, guia } = banhosDaGira(g);
  if (!orixa && !guia) return '';
  const parte = (titulo, b) => `<div class="banho-p"><b>${titulo} · ${esc(b.nome)}</b>
    <div class="banho-ervas">${b.ervas.map((e) => `<span>${esc(e)}</span>`).join('')}</div>
    ${b.obs ? `<span class="muted banho-obs">${esc(b.obs)}</span>` : ''}${b.aviso ? `<span class="banho-aviso">⚠️ ${esc(b.aviso)}</span>` : ''}</div>`;
  return `<div class="limpeza banho"><b><span aria-hidden="true">🌿</span> Banho</b>
    ${orixa ? parte('Banho orixá', orixa) : ''}${guia ? parte('Banho guia', guia) : ''}</div>`;
}

// Ausência: quem está com status Ausente nesta gira (um por linha), logo acima do bloco de licença.
function blocoAusencia(ps, g) {
  const quem = ps.filter((p) => status(p, g) === 'a');
  if (!quem.length) return '';
  return `<div class="limpeza ausencia"><b><span class="x-vermelho" aria-hidden="true">✖</span> Ausência · ${quem.length}</b>
    ${quem.map((p) => `<span>${esc(p.nome)}</span>`).join('')}</div>`;
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
  // Gira em aberto e ainda por vir: em vez de "Presentes" + total, "Em planejamento" (pendentes, licença… continuam).
  const planejamento = !g.encerrada && g.data > hoje();
  const topo = planejamento
    ? `<h3>Em planejamento</h3><span class="count">${extra ? `<span class="muted">${extra}</span>` : ''}</span>`
    : `<h3>Presentes</h3><span class="count"><b>${naGira}</b>${pct !== null ? ` · <b>${pct}%</b>` : ''}${extra ? ` <span class="muted">· ${extra}</span>` : ''}</span>`;
  return `<div class="pres-topo"><div class="grp-h">${topo}</div>
    <div class="presentes">${Object.entries(conta).map(([t, n]) => `<span><span class="muted">${t}</span> <b>${n}</b></span>`).join('')}</div></div>`;
}

// Faltas e ausentes: na tela, para todos conferirem (não entram no texto nem na imagem do evento).
// Sorteio (admin): botão "Falta" de cada pessoa da escala e a confirmação logo abaixo.
const botaoFalta = (id) => `<button class="lock falta-bt" data-act="faltaask" data-id="${id}" title="Marcar falta e refazer a escala">Falta</button>`;
function confirmaFalta(id) {
  if (estado.faltaConf !== id) return '';
  return `<div class="falta-conf"><span>Marcar <b>falta</b> de <b>${esc(nome(id))}</b>? A lista de presença muda para Falta e a escala é refeita como no Remanejar faltas.</span>
    <span class="row" style="gap:6px"><button class="btn small danger" data-act="faltaok" data-id="${id}">Confirmar falta</button><button class="btn small" data-act="faltacancel">Cancelar</button></span></div>`;
}

// 2º combo da presença (função nesta gira), conforme o cadastro:
// Cambone → Cambone / Passe / Senha / Suporte · Passe → Passe / Cambone / At. Extra / Suporte
// Senha → Senha / Cambone / Passe / Suporte · Extra → At. Extra / Passe / Suporte / Não atende · demais → função / Suporte / Não atende.
const NOME_FUNCAO = { medium: 'Médium', cambone: 'Cambone', passe: 'Passe', extra: 'At. Extra', senha: 'Senha' };
function opcoesPapel(p) {
  const cad = ['cad', NOME_FUNCAO[p.funcao] || p.funcao];
  if (p.funcao === 'cambone') return [cad, ['pas', 'Passe'], ['sen', 'Senha'], ['sup', 'Suporte']];
  if (p.funcao === 'passe') return [cad, ['na', 'Cambone'], ['ext', 'At. Extra'], ['sup', 'Suporte']];
  if (p.funcao === 'senha') return [cad, ['na', 'Cambone'], ['pas', 'Passe'], ['sup', 'Suporte']];
  if (p.funcao === 'extra') return [cad, ['pas', 'Passe'], ['sup', 'Suporte'], ['na', 'Não atende']];
  return [cad, ['sup', 'Suporte'], ['na', 'Não atende']];
}
const htmlPapel = (p, papel) => opcoesPapel(p).map(([k, t]) => `<option value="${k}" ${k === papel ? 'selected' : ''}>${t}</option>`).join('');
// 1º combo da presença: Pendente, Presente, Falta, Ausente. Antes do dia da gira: só Pendente ou Ausente (Presente e Falta, só no dia).
function htmlStatus(g, sel, s, antesDoDia) {
  const ops = [...(g.pendentePadrao || s === 'pend' ? ['pend'] : []), 'p', 'f', 'a'];
  // Antes do dia: Presente só no dia; Falta também, a não ser que o sorteio já tenha sido feito.
  const sorteado = (g.pares || []).length > 0 || (g.passes || []).length > 0;
  const bloqueada = (k) => antesDoDia && k !== sel && (k === 'p' || (k === 'f' && !sorteado));
  return ops.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''} ${bloqueada(k) ? 'disabled' : ''}>${STATUS[k]}${bloqueada(k) ? ' (no dia)' : ''}</option>`).join('');
}

// Admin, no topo da presença (caixa amarela): escolhe a pessoa, o status e a função; grava no OK, depois de confirmar.
function presencaRapida(ps, g, antesDoDia) {
  const r = estado.presRapida?.data === g.data ? estado.presRapida : null;
  const p = r && ps.find((x) => x.id === r.id);
  return `<div class="warnbox pres-rap"><select class="pr-pessoa" data-act="rappessoa" aria-label="Pessoa para dar presença">
      <option value="">&lt;escolha a pessoa&gt;</option>${ps.filter((x) => !licencaEm(x, g.data)).map((x) => `<option value="${x.id}" ${x.id === p?.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
    ${p ? `<span class="pr-ctl"><select data-act="rapst" aria-label="Status de ${esc(p.nome)}">${htmlStatus(g, r.st, status(p, g), antesDoDia)}</select>
      <select data-act="rappapel" aria-label="Função de ${esc(p.nome)} nesta gira">${htmlPapel(p, r.papel)}</select>
      <button class="btn small bt-ok" data-act="rapok">OK</button></span>` : ''}</div>`;
}

function blocosFora(ps, g) {
  // Licença fica no card da gira (blocoLicenca).
  return [['f', 'Faltaram'], ['a', 'Ausentes']].map(([st, titulo]) => {
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
// Gira anterior, próxima gira e o calendário para buscar outra data (para todos).
function navegarGiras(g) {
  return `<div class="nav-gira">
    <button class="btn nav-bt" data-act="giraanterior" title="Vai para a gira anterior">‹ Gira anterior</button>
    <button class="btn nav-bt" data-act="proxgira" title="Vai para a próxima gira">Próxima gira ›</button>
    <label class="btn nav-cal" title="Escolher outra data"><span aria-hidden="true">📅</span><input type="date" id="f-data" value="${esc(g.data)}" aria-label="Escolher outra data"></label>
  </div>`;
}

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
  // Com quem você trabalha (médium, cambone, passe): foto pequena do Perfil, para saber quem é quem; tocar amplia.
  const comFoto = (rot, id) => {
    const F = estado.fotosPessoa;
    if (F[id] === undefined) carregarFoto(id);
    const n = nome(id);
    const av = F[id]
      ? `<button type="button" class="eu-av" data-act="eufoto" data-id="${id}" aria-label="Ver a foto de ${esc(n)}"><img src="${F[id]}" alt=""></button>`
      : `<span class="eu-av"><span aria-hidden="true">${esc(iniciais(n))}</span></span>`;
    L.push(`<div class="eu-l eu-pessoa">${av}<span><span class="muted">${rot}:</span> <b>${esc(n)}</b></span></div>`);
  };
  const aviso = (t) => L.push(`<p class="muted" style="margin:0">${t}</p>`);
  const fora = (t) => L.push(`<div class="eu-fora">${t}</div>`);
  // Abaixo do nome do médium: o guia de atendimento dele na linha desta gira (se cadastrou no Perfil).
  const guiaDe = (id) => { const gnome = guiaNaGira(estado.pessoas.find((x) => x.id === id), g); if (gnome) L.push(`<div class="eu-l eu-guia"><span class="muted">Guia de atendimento:</span> <b>${esc(gnome)}</b></div>`); };
  if (st === 'lic') {
    const l = licencaEm(p, g.data);
    fora(`📋 Você está <b>de licença</b>${l ? ` de ${dDM(l.inicio)} a ${dDM(l.fim)}` : ''}${l?.motivo ? ` · ${esc(l.motivo)}` : ''}.`);
  } else if (st === 'a') fora('❌ Você está marcado como <b>ausente</b> nesta gira.');
  else if (st === 'f') fora('🚫 Você está marcado com <b>falta</b> nesta gira.');
  else if (st === 'sup') aviso('Hoje você está no <b>Suporte</b>.');
  else if (curimba) lin('Função', 'Curimba');
  else if (funcao === 'senha') lin('Função', 'Senha');
  else if (!sorteado) { /* o aviso de sorteio pendente vai no fim do bloco */ }
  else if (funcao === 'medium' || funcao === 'extra') {
    const cs = camsDe(p.id);
    if (!cs.length) aviso('Você ainda está sem cambone.');
    cs.forEach((c, i) => comFoto(i ? `${i + 1}º cambone` : 'Cambone', c));
    if (funcao === 'medium') passesDe(p.id).forEach((c) => comFoto('Médium de passe', c));
  } else if (funcao === 'cambone') {
    const meus = pares.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você não está com nenhum médium nesta escala.');
    meus.forEach((m, i) => {
      comFoto(meus.length > 1 ? `Médium ${i + 1}` : 'Médium', m);
      guiaDe(m);
      camsDe(m).filter((c) => c !== p.id).forEach((c) => comFoto('Cambone junto', c));
      passesDe(m).forEach((c) => comFoto('Médium de passe', c));
    });
  } else if (funcao === 'passe') {
    const meus = passes.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você ainda está sem médium.');
    meus.forEach((m) => {
      comFoto('Médium', m);
      guiaDe(m);
      camsDe(m).forEach((c) => comFoto('Cambone do médium', c));
    });
  }
  // Gira em aberto ainda sem sorteio: o aviso "Sorteio de escala pendente" fica dentro deste bloco.
  if (!sorteado && !g.encerrada && !['lic', 'a', 'f'].includes(st)) L.push(caixaPendente(g));
  const pr = presencaDe(p, g);
  // Depois do sorteio (publicado), não mostra mais o status para alterar nem o texto.
  if (sorteado) { /* nada */ } else if (!curimba && estado.me?.corrente) {
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
  } else if (!curimba && pode('giras:editar') && estado.giras[g.data] && !g.encerrada && st !== 'lic') {
    // Admin ligado a uma pessoa: muda o próprio status aqui, com as mesmas opções da lista de presença.
    L.push(`<label class="eu-aus"><span class="muted">Seu status:</span>
      <select id="eu-aus" class="st-${pr}" data-act="status" data-id="${p.id}" aria-label="Seu status nesta gira">${htmlStatus(g, pr, st, g.pendentePadrao && g.data > hoje())}</select></label>`);
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
    <div class="eu-nome"><b>${esc(p.nome)}</b> ${!sorteado && !['medium', 'cambone'].includes(p.funcao) ? '<span class="muted eu-poss">Possivelmente:</span> ' : ''}<span class="tag">${ROTULO_FUNCAO[p.funcao] || p.funcao}</span>${convertido}</div>
    ${(funcao === 'medium' || funcao === 'extra') && st !== 'lic' && guiaNaGira(p, g) ? `<div class="eu-l eu-guia"><span class="muted">Guia de atendimento:</span> <b>${esc(guiaNaGira(p, g))}</b></div>` : ''}
    ${L.join('')}</div>`;
}

// "Médiuns e cambones" começa minimizado; abre enquanto o app estiver aberto.
const duplasAbertas = new Set();
// Quem não edita a gira vê "Ver escala"; o admin, "Ver mais".
const botaoDobrar = (aberto) => `<button class="btn link small ver-mais" data-act="dobrarduplas" aria-expanded="${aberto}">${aberto ? '▾ Minimizar' : pode('giras:editar') ? '▸ Ver mais' : '▸ Ver escala'}</button>`;
// Depois do sorteio: Remanejar faltas e Ajuste manual, lado a lado, do mesmo tamanho (amarelos).
// Remanejar pede confirmação antes.
function acoesSorteio(g, remanejarOk, manualOk, manual) {
  const bts = [];
  if (remanejarOk) bts.push(`<button class="btn btn-grande bt-amarelo" data-act="askdel" data-k="rem:${g.data}"><span aria-hidden="true">🔄</span> Remanejar faltas</button>`);
  if (manualOk) bts.push(`<button class="btn btn-grande bt-amarelo" data-act="manual" aria-pressed="${manual}"><span aria-hidden="true">✋</span> ${manual ? 'Concluir ajuste' : 'Ajuste manual'}</button>`);
  if (!bts.length) return '';
  const conf = estado.confirm === 'rem:' + g.data
    ? `<div class="infobox rem-conf"><span><b>Remanejar faltas?</b> Refaz só as duplas de quem faltou ou mudou de status; as outras ficam como estão.</span>
        <span class="row" style="gap:6px"><button class="btn small primary" data-act="remanejar">Confirmar</button><button class="btn small" data-act="cancelrei">Cancelar</button></span></div>` : '';
  return `<div class="sort-acoes${bts.length === 1 ? ' um' : ''}">${bts.join('')}</div>${conf}`;
}
// Título do bloco do sorteio: para quem não edita, depois de publicado, "Sorteio realizado!";
// para o admin, "Sorteio de escala" com o ícone de bingo depois de sorteado.
const tituloSorteio = (sorteado) => (sorteado && !pode('giras:editar') ? '<h2 class="sorteio-ok">🚀 Sorteio realizado! ❤️</h2>'
  : `<h2>Sorteio de escala${sorteado ? ' <span aria-hidden="true">🎱</span>' : ''}</h2>`);
// Confirmação dentro do bloco do sorteio (antes de sortear e antes de cancelar o sorteio).
const confirmaSorteio = (texto, act, botao) => `<div class="infobox rem-conf"><span>${texto}</span>
  <span class="row" style="gap:6px"><button class="btn small primary" data-act="${act}">${botao}</button><button class="btn small" data-act="cancelrei">Cancelar</button></span></div>`;
// A Presença também começa minimizada (abre enquanto o app estiver aberto).
const abertos = new Set();
const cabDobra = (k, titulo, extra = '') => {
  const ab = abertos.has(k);
  return `<button class="grp-h dobra" data-act="dobrarcard" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${extra} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
};

// Aviso de sorteio pendente (só para gira em aberto).
const caixaPendente = (g) => `<div class="sorteio-pend"><span class="sp-icone" aria-hidden="true">⚠️</span><b class="sp-tit">Sorteio de escala pendente da Michelle</b>
  <span class="muted sp-prev">Previsão: <b>${esc(dLong(g.data))}</b> (${esc(dDM(g.data))})</span></div>`;
// Quem está logado tem o bloco "Você nesta gira" (lá vai o aviso de pendente).
const temBlocoEu = () => !!(estado.me?.pessoaId && estado.pessoas.some((x) => x.id === estado.me.pessoaId));

// Acesso da corrente: com a escala publicada, a imagem dela fica no card da gira (blocoImagemEscala);
// aqui só os avisos de quando ainda não há escala. (A corrente só recebe as duplas depois de publicadas.)
function resultado(g) {
  const { lista } = paresPorMedium(estado.pessoas, g);
  const comDuplas = lista.some((x) => x.cams.length || x.passes.length);
  if (comDuplas) return '';
  if (g.encerrada) return '<div class="card empty"><p class="muted" style="margin:0">Nenhuma escala registrada nesta gira.</p></div>';
  return temBlocoEu() ? '' : `<div class="card">${caixaPendente(g)}</div>`;
}

// Admin: "Sugestão Mi/Mãe Vê" — quem marcou no Perfil que se sente confiante na entidade da gira,
// em dois blocos (Passe e Atendimento extra): tabela Nome (com rótulos e entidade) | oferendas feitas (orixá de frente,
// ancestral, adjunto, guia chefe e guia de frente — só para quem vê o perfil de todos) | % de presença no ano | giras da linha,
// 5 linhas à vista e o resto com rolagem.
const corPres = (pct) => (pct >= 80 ? 'ok' : pct >= 60 ? 'medio' : 'baixo');
const OFERENDAS_SUG = [['frente', 'Fr', 'Orixá de frente'], ['ancestral', 'An', 'Orixá ancestral'], ['adjunto', 'Ad', 'Orixá adjunto'],
  ['chefe', 'Ch', 'Guia chefe'], ['guiaFrente', 'Fe', 'Guia de frente']];
// Perfil de todos ({ pessoaId: perfil }) para as colunas de oferendas; busca uma vez se ainda não veio.
let pedindoPerfil = false;
function perfisDaCorrente() {
  if (!pode('perfil:corrente')) return null;
  if (estado.perfil === null) {
    if (!pedindoPerfil) { pedindoPerfil = true; carregarPerfil().finally(() => { pedindoPerfil = false; }); }
    return null;
  }
  const t = estado.perfil?.todos;
  return Array.isArray(t) ? Object.fromEntries(t.map((x) => [x.pessoaId, x.perfil])) : null;
}
function linhaSugestao(x, linha, ano) {
  // Segunda linha do nome: rótulos Guia chefe / Guia de frente e, ao lado, o nome da entidade (cortado com "…" se não couber).
  const sub = [...x.guias.map((t) => `<span class="sug-tag${t === 'Guia chefe' ? ' chefe' : ''}">${t}</span>`),
    x.temNome ? `<span class="sug-ent" title="${esc(x.entidade)}">${esc(x.entidade)}</span>` : ''].join('');
  const tags = sub ? `<span class="sug-tags">${sub}</span>` : '';
  const pres = x.pct === null ? '<span class="sug-pct vazio" title="Sem giras no ano">—</span>'
    : `<span class="sug-pct ${corPres(x.pct)}" title="${x.pres} de ${x.base} gira${x.base > 1 ? 's' : ''} em ${ano}"><b>${x.pct}%</b><i style="--p:${x.pct}%"></i></span>`;
  const n = `<span class="sug-n${x.nGiras ? '' : ' zero'}" title="${x.nGiras} gira${x.nGiras === 1 ? '' : 's'} de ${esc(linha)}">${x.nGiras}</span>`;
  const ofs = x.oferendas ? OFERENDAS_SUG.map(([k, , t]) => (x.oferendas[k]
    ? `<span class="sug-of sim" title="${t}: oferenda feita" aria-label="${t}: sim">✓</span>`
    : `<span class="sug-of nao" title="${t}: oferenda não feita" aria-label="${t}: não">✕</span>`)).join('') : '';
  return `<div class="sug-l${x.oferendas ? ' com-of' : ''}"><span class="sug-nome"><span class="sug-nm">${esc(x.nome)}</span>${tags}</span>${ofs}${pres}${n}</div>`;
}
// Depois do sorteio, a Sugestão vem recolhida (só o título); tocar no título expande e recolhe.
const sugAbertas = new Set();
function blocoSugestao(ps, g, recolhivel) {
  const sug = sugestoesDaGira(ps, g, girasLista(), perfisDaCorrente());
  const linha = sug ? LINHA_LABEL[sug.linha] || '' : '';
  const ab = !recolhivel || sugAbertas.has(g.data);
  const tit = `<h2><span aria-hidden="true">💡</span> Sugestão Mi/Mãe Vê</h2>`;
  if (!ab) return `<div class="card adm sugestao"><button class="grp-h dobra" data-act="dobrarsug" aria-expanded="false">${tit}<span class="count">${sug ? `<span class="sug-linha">${esc(linha)}</span>` : ''}<span class="seta" aria-hidden="true">▸</span></span></button></div>`;
  const comOf = !!sug && [...sug.passe, ...sug.extra].some((x) => x.oferendas);
  const cabGiras = `<span class="sug-cab-g${linha.length > 14 ? ' mlongo' : linha.length > 9 ? ' longo' : ''}">Giras de ${esc(linha)}</span>`;
  const cab = comOf
    ? `<div class="sug-l sug-cab com-of" aria-hidden="true"><span class="c-nome">Nome</span><span class="c-gx">Orixá</span><span class="c-gg">Guia</span>
      ${OFERENDAS_SUG.map(([, s], i) => `<span class="c-o c-o${i + 1}">${s}</span>`).join('')}<span class="c-pres">Pres.</span>${cabGiras}</div>`
    : `<div class="sug-l sug-cab" aria-hidden="true"><span>Nome</span><span>Pres.</span>${cabGiras}</div>`;
  const corpo = !sug
    ? '<p class="muted" style="margin:0;font-size:.88rem">Escolha a entidade da gira para ver as sugestões.</p>'
    : [['Passe', sug.passe, 'passe'], ['Atendimento extra', sug.extra, 'extra']].map(([t, lista, k]) => `<div class="grp sug-grp"><div class="sug-sub ${k}"><h3>${t}</h3><span class="sug-qtd">${lista.length}</span></div>
      ${lista.length ? `<div class="sug-lista">${cab}${lista.map((x) => linhaSugestao(x, linha, g.data.slice(0, 4))).join('')}</div>`
        : '<p class="muted sug-vazio">Ninguém marcou esta entidade.</p>'}</div>`).join('');
  const cabSug = recolhivel
    ? `<button class="grp-h dobra" data-act="dobrarsug" aria-expanded="true">${tit}<span class="count">${sug ? `<span class="sug-linha">${esc(linha)}</span>` : ''}<span class="seta" aria-hidden="true">▾</span></span></button>`
    : `<div class="grp-h">${tit}${sug ? `<span class="sug-linha">${esc(linha)}</span>` : ''}</div>`;
  return `<div class="card adm sugestao">${cabSug}${corpo}
    ${sug ? `<p class="sug-leg">${comOf ? 'Oferendas: Fr = orixá de frente · An = ancestral · Ad = adjunto · Ch = guia chefe · Fe = guia de frente<br>' : ''}Pres. = presença em ${g.data.slice(0, 4)} · Giras de ${esc(linha)} = em quantas esteve presente</p>` : ''}</div>`;
}

// Topo da aba Gira (só data e nome): gira dos próximos 30 dias, evento e aviso todos os futuros, amaci só da semana.
function cardSemana() {
  const hj = hoje();
  // Aniversariantes da semana (domingo a sábado): dia/mês do Perfil, com 🎈🎂 antes do nome.
  // Orixás: só no próprio dia (DIAS_ORIXAS). No mesmo dia: eventos, depois orixás, depois aniversários.
  const ordem = (e) => (e.niver ? 2 : e.orixa ? 1 : 0);
  const evs = [...eventosDoTopo(estado.eventos, hj), ...orixasDoDia(hj), ...aniversariosDaSemana(hj)].sort((a, b) => a.data.localeCompare(b.data) || ordem(a) - ordem(b));
  // Cada evento: "folhinha" com o dia da semana (ou HOJE) e a data, o nome e o tipo num selo à direita.
  const semana = (d) => (d === hj ? 'Hoje' : pd(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()));
  const tipo = (e) => (e.niver ? ['niver', 'Aniversário'] : e.orixa ? ['orixa', 'Orixá'] : [e.tipo || 'evento', TIPO_EVENTO_LABEL[e.tipo] || 'Evento']);
  return `<div class="card ev-semana"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">📅</span> Eventos</h2>${evs.length ? `<span class="evs-qtd">${evs.length}</span>` : ''}</div>
    ${evs.length ? `<div class="evs-lista">${evs.map((e) => { const [k, rot] = tipo(e); return `<div class="evs-l${e.data === hj ? ' hoje' : ''}">
        <span class="evs-data"><span class="evs-sem">${semana(e.data)}</span><b>${dataCurta(e.data)}</b></span>
        <span class="evs-nome">${e.niver ? '<span class="evs-niver" aria-hidden="true">🎈🎂</span> ' : ''}${esc(e.nome)}</span>
        <span class="evs-tipo ${k}">${rot}</span></div>`; }).join('')}</div>`
      : '<p class="muted" style="margin:0;font-size:.88rem">Nenhum evento nos próximos 30 dias.</p>'}</div>`;
}

// Orações (logo abaixo dos Eventos): qualquer pessoa logada pede; cada uma vale 7 dias e depois some.
// Quem pediu (ou o admin dos eventos) exclui, com confirmação.
function cardOracoes() {
  const L = estado.oracoes || [];
  const aberto = !!estado.oraNova;
  let h = `<div class="card ev-semana or-card"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">🙏</span> Orações</h2>${L.length ? `<span class="evs-qtd">${L.length}</span>` : ''}</div>`;
  if (L.length) {
    h += `<div class="evs-lista">${L.map((o) => {
      const conf = estado.confirm === 'or:' + o.id;
      const bt = !o.apagar ? '' : conf
        ? `<button class="btn danger or-bt" data-act="oraexcluir" data-id="${o.id}">Confirmar</button>`
        : `<button class="btn or-bt" data-act="askdel" data-k="or:${o.id}">Excluir</button>`;
      const n = o.reacoes || 0;
      const vela = `<button class="btn or-bt or-vela${o.reagi ? ' on' : ''}" data-act="orareagir" data-id="${o.id}" aria-pressed="${!!o.reagi}"
          title="${o.reagi ? 'Apagar minha vela' : 'Acender uma vela por este pedido'}"><span aria-hidden="true">🕯️</span> ${n}</button>`;
      return `<div class="evs-l or-l"><span class="evs-data or-ico" aria-hidden="true">🙏</span>
        <span class="evs-nome or-txt">${esc(o.texto)}</span>
        <span class="or-dir">${vela}${bt}</span></div>`;
    }).join('')}</div>`;
  } else h += '<p class="muted" style="margin:0;font-size:.88rem">Nenhum pedido de oração nos últimos 7 dias.</p>';
  h += aberto
    ? `<form id="f-oracao" class="or-form" autocomplete="off"><textarea id="or-texto" rows="3" maxlength="200" placeholder="Por quem ou pelo que rezar (até 3 linhas)">${esc(estado.oraTexto || '')}</textarea>
        <span class="row"><button class="btn primary" type="submit">Pedir oração</button><button class="btn" type="button" data-act="oranova">Cancelar</button></span>
        <p class="muted" style="margin:0;font-size:.8rem">Fica 7 dias na lista e depois some.</p></form>`
    : '<button class="btn small or-nova" data-act="oranova">＋ Pedir oração</button>';
  return h + '</div>';
}

// Pedido de oração: até 3 linhas.
export async function enviarOracao(form) {
  const texto = form.querySelector('textarea').value.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!texto.length) { toast('Escreva a oração.'); return; }
  if (texto.length > 3) { toast('A oração pode ter até 3 linhas.'); return; }
  if (await acaoOracoes('oracao', { texto: texto.join('\n') })) { estado.oraNova = false; estado.oraTexto = ''; toast('Pedido de oração publicado.'); avisar(); }
}

function aniversariosDaSemana(hj) {
  const d0 = pd(hj); d0.setDate(d0.getDate() - d0.getDay());
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const out = [];
  dias.forEach((d) => estado.pessoas.filter((p) => p.aniversario === d.slice(5)).forEach((p) => out.push({ data: d, nome: p.nome, niver: true })));
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Aula de curimba (só para quem está nos alunos da aba Curimba): presença e faltas nas aulas até hoje.
// Mesmo padrão de "Seus compromissos" (faixa à esquerda, aqui na cor da % de presença); fica logo acima de "Sua presença".
// A % conta só as aulas marcadas, como na aba Curimba.
function cardAulaCurimba() {
  if (!estado.minhaCurimba) return '';
  const hj = hoje();
  const aulas = estado.minhaCurimba.aulas.filter((a) => a.data <= hj && a.status).reverse();
  // Sempre começa recolhido (só o título, com a % ao lado); tocar no título expande e recolhe.
  const ab = abertos.has('aula');
  const pres = aulas.filter((a) => a.status === 'p').length;
  const pct = aulas.length ? Math.round((pres / aulas.length) * 100) : 0;
  const cor = aulas.length ? corDaFaixa(pct) : '';
  const tit = cabDobra('aula', '<span aria-hidden="true">🥁</span> Aula de curimba', aulas.length ? `<b class="cur-gira-pct">${pct}%</b>` : '');
  if (!ab) return `<div class="card comp-of cur-gira ${cor}">${tit}</div>`;
  if (!aulas.length) return `<div class="card comp-of cur-gira">${tit}<p class="muted" style="margin:0;font-size:.92rem">Nenhuma aula marcada ainda.</p></div>`;
  return `<div class="card comp-of cur-gira ${cor}">${tit}
    <div class="comp-of-g"><div><b class="cur-gira-pct">${pct}%</b> de presença <span class="muted">· ${pres} de ${aulas.length} aula${aulas.length > 1 ? 's' : ''}</span></div>
      <div class="mp-barra ${cor}"><span style="width:${pct}%"></span></div>
      <div class="mp-lista">${aulas.map((a) => `<div class="mp-l"><span class="mp-dia">${dDM(a.data)}</span><span class="mp-gira">${esc(a.nome) || 'Aula'}</span><span class="mp-st ${a.status}">${a.status === 'p' ? 'Presente' : 'Falta'}</span></div>`).join('')}</div></div></div>`;
}

// Logo depois de "Você nesta gira": os itens das oferendas que a pessoa se comprometeu a doar e ainda não foram entregues,
// e, na oferenda com uma linha por pessoa, o pagamento ou a entrega que faltam. Só aparece quando há algum.
let pediuOferendas = false;
function cardCompromissos() {
  if (!pode('oferendas:doar')) return '';
  if (estado.oferendas === null) {
    if (!pediuOferendas) { pediuOferendas = true; carregarOferendas(); }
    return '';
  }
  const eu = estado.oferendas.eu || {};
  if (!eu.chave) return '';
  const grupos = compromissosDe(estado.oferendas.oferendas, eu.chave, hoje());
  if (!grupos.length) return '';
  const etq = (k) => `<span class="st-med ${k}">${ROTULO_MEDIUM[k] || k}</span>`;
  return `<div class="card comp-of"><div class="grp-h"><h2><span aria-hidden="true">⚠️</span> Seus compromissos nas oferendas</h2></div>
    ${grupos.map(({ of, itens, linha }) => `<div class="comp-of-g"><div><b>${esc(of.titulo)}</b> <span class="muted">· ${dataBR(of.data)}</span></div>
      ${linha ? `<div class="comp-of-med"><span><span class="muted">Pagamento:</span> ${etq(linha.pagamento)}</span><span><span class="muted">Entrega:</span> ${etq(linha.entrega)}</span></div>` : ''}
      ${itens.length ? `<ul>${itens.map(({ i, q }) => `<li>${esc(i.nome)} <b>${q}</b> <span class="muted">· entrega ${textoEntrega(i)}</span></li>`).join('')}</ul>` : ''}</div>`).join('')}
    <button class="btn link small" data-act="goto" data-tab="oferendas">Ver oferendas ›</button></div>`;
}

// Admin: bloco Eventos (cadastrar e eventos cadastrados) logo abaixo do card 📅 Eventos, com a moldura dourada
// de "só admin vê".
function cardEventosAdmin() {
  if (!pode('eventos:ver')) return '';
  setTimeout(ajustarRolagem, 0);
  return `<div class="card adm ev-grupo"><h2><span aria-hidden="true">🗓️</span> Eventos</h2>${blocosEventos()}</div>`;
}

export function render() {
  return renderGira().replace('<section class="panel">', '<section class="panel">' + cardSemana() + cardOracoes() + cardEventosAdmin());
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
    return `<section class="panel">${cardCompromissos()}${cardAulaCurimba()}<div class="card card-novo adm">
      <div class="datehead"><span class="eyebrow">${esc(dLong(g.data))}</span><span class="dia gira-nome">Nenhuma gira nesta data</span></div>
      <div class="row">${navegarGiras(g)}</div>
      <button class="btn primary btn-grande" data-act="criargira">＋ Adicionar evento</button></div></section>`;
  }
  const { lista, validos, passesV, semPasse, invalidos } = paresPorMedium(estado.pessoas, g);
  const temDuplas = validos.length || passesV.length;
  // WhatsApp: logo abaixo do Encerrar gira (desabilitado sem sorteio); o painel abre logo abaixo deste card.
  const whats = pode('escala:completa') && existe;
  const eu = existe || (estado.me?.pessoaId && licencaEm(estado.pessoas.find((x) => x.id === estado.me.pessoaId) || {}, g.data)) ? blocoEu(g) : '';
  // Ordem: Eventos, Você nesta gira, Seus compromissos nas oferendas, Aula de curimba, Sua presença e só depois a gira (próximo evento).
  let h = `<section class="panel">${eu}${cardCompromissos()}${cardAulaCurimba()}
  <div class="card card-gira${existe && !encerrada ? ' aberta' : ''}">
    <div class="datehead"><div class="dh-linha">${editar && existe && !encerrada
      ? `<button class="eyebrow data-bt" data-act="mudardata" title="Alterar a data da gira">${esc(dLong(g.data))} <span aria-hidden="true">✎</span></button>`
      : `<span class="eyebrow">${esc(dLong(g.data))}</span>`}</div><span class="dia gira-nome">${g.entidade ? (giraEspecial(g.entidade) ? esc(nomeGira(g.entidade)) : `Gira de ${esc(nomeGira(g.entidade))}`) : 'Gira'}</span>${orixaDaGira(g) ? `<span class="ent">Orixá: ${esc(orixaDaGira(g))}</span>` : ''}</div>
    <div class="row">
      ${navegarGiras(g)}
      ${editar && existe ? `<div class="enc-linha">${botaoTopo(g, editar, existe)}</div>` : ''}
      ${whats ? `<div class="enc-linha">${botaoWhats(temDuplas)}</div>` : ''}
      ${editar ? `<label class="field grow">Gira / entidade do dia${seletorEntidade(g.entidade)}</label>` : ''}
      ${editar && temOrixa(g) ? `<label class="field" style="flex:1 1 130px">Orixá<select data-act="orixagira" aria-label="Orixá"><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === g.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : ''}
      ${editar && temLimpeza(g) ? `<label class="field" style="flex:1 1 130px">Turma da limpeza<select data-act="limpezagira"><option value="">— nenhuma —</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(g.limpeza) === t ? 'selected' : ''}>Turma ${t}</option>`).join('')}</select></label>` : ''}
    </div>
    ${editar && existe && estado.confirm === 'enc:' + g.data ? caixaEncerrar(g) : ''}
    ${encerrada ? '' : blocoLimpeza(g, admin)}
    ${blocoBanho(g)}
    ${blocoAusencia(ps, g)}
    ${blocoLicenca(ps, g)}
    ${temDuplas && g.publicada ? blocoImagemEscala() : ''}
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
  </div>`;

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
  // Admin: moldura dourada, sempre aberto com a escolha da pessoa; a lista inteira abre em "+ Ver lista".
  if (editar) {
    const ab = abertos.has('pres');
    h += `<div class="card adm"><div class="grp-h"><h2>📋 Presença</h2><span class="count">${partes}</span></div>
      ${presencaRapida(ps, g, antesDoDia)}
      <button class="btn link small ver-mais" data-act="dobrarcard" data-k="pres" aria-expanded="${ab}">${ab ? '− Esconder lista' : '+ Ver lista'}</button>`;
  } else h += `<div class="card">${cabDobra('pres', 'Presença', partes)}`;
  if (abertos.has('pres')) {
  // Cada pessoa aparece no bloco da função que exerce nesta gira: Passe que vai cambonar → Cambones;
  // Extra que vai de Passe → Passe; Suporte → Suporte. O nome fica em amarelo para sinalizar a troca.
  const grupoDe = (p) => {
    if (licencaEm(p, g.data)) return p.funcao;
    const pa = papelDe(p, g);
    if (pa === 'sup') return 'suporte';
    if (pa === 'na') return 'cambone';
    if (pa === 'pas') return 'passe';
    if (pa === 'ext') return 'extra';
    if (pa === 'sen') return 'senha';
    return p.funcao;
  };
  [...FUNCOES, { k: 'suporte', pl: 'Suporte' }].forEach((f) => {
    const gp = ps.filter((p) => grupoDe(p) === f.k);
    if (!gp.length) return;
    const np = gp.filter((p) => presencaDe(p, g) === 'p').length;   // presença confirmada
    h += `<div class="grp"><div class="grp-h"><h3>${f.pl}</h3><span class="count">${np}/${gp.length}
      ${editar && !antesDoDia && f.k !== 'suporte' ? `<button class="btn link" data-act="todos" data-f="${f.k}" data-v="${np === gp.length ? 'a' : 'p'}">${np === gp.length ? 'marcar ausentes' : 'todos presentes'}</button>` : ''}</span></div>
      <div class="plist um">${gp.map((p) => {
        const s = status(p, g);
        const xp = p.experiente && p.funcao === 'medium' ? ' <span class="xp" title="Pode ter médium de passe junto" aria-label="Pode ter médium de passe junto">★</span>' : '';
        const hoje = '';
        const lic = licencaEm(p, g.data);
        const ctl = lic
          ? `<span class="badge lic" title="De licença de ${dDM(lic.inicio)} a ${dDM(lic.fim)}">de licença até ${dDM(lic.fim)}</span>`
          : editar
          ? (() => {
            // 1º combo: Pendente, Presente, Falta, Ausente. 2º combo: a função do cadastro, Suporte ou Não atende.
            const papel = papelDe(p, g);
            return `<span class="st-ctl"><select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${htmlStatus(g, presencaDe(p, g), s, antesDoDia)}</select>
              <select class="st papel-dia ${papel}" id="pp-${p.id}" data-act="papel" data-id="${p.id}" aria-label="Como ${esc(p.nome)} trabalha nesta gira">${htmlPapel(p, papel)}</select></span>`;
          })()
          : `<span class="st-txt">${STATUS[s]}</span>`;
        const mudou = grupoDe(p) !== p.funcao;
        return `<div class="pres ${classeStatus(presencaDe(p, g))}"><span class="nm">${mudou ? `<span class="nm-mudou" title="Nesta gira não está na função do cadastro">${esc(p.nome)}</span>` : esc(p.nome)}${xp}${hoje}</span>${ctl}</div>`;
      }).join('')}</div></div>`;
  });
  }
  h += `</div>`;

  // duplas
  const map = custos(girasLista(), g.data, 'pares');
  const mapP = custos(girasLista(), g.data, 'passes');
  const psg = pessoasDaGira(ps, g);
  const camsPres = psg.filter((p) => cambonaHoje(p, g));
  const passPres = psg.filter((p) => presente(p, g) && p.funcao === 'passe');
  // Quem está no Suporte também pode ser posto como cambone (sai do Suporte).
  const doSuporte = psg.filter((p) => status(p, g) === 'sup');
  const grupoSup = (lista, fn) => (lista.length ? `<optgroup label="Do Suporte">${lista.map(fn).join('')}</optgroup>` : '');
  const selo = (e) => (!e ? ''
    : e.recente ? `<span class="badge hot">repetiu da última</span>`
      : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
  const passada = g.data < hoje();
  const linha = (k, p, idx, opts, mp, rotulo) => {
    const quem = editar
      ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}${k === 'pares' ? grupoSup(doSuporte, (c) => `<option value="${c.id}">${esc(c.nome)}</option>`) : ''}</select>`
      : `<span class="nmc">${esc(nome(p.c))}</span>`;
    // "Falta": marca falta na presença e refaz a escala (como Remanejar faltas), depois de confirmar.
    const falta = editar && !passada && !manual ? botaoFalta(p.c) : '';
    return `<div class="camrow">${rotulo ? `<span class="tag ${rotulo === 'Cambone' ? 'cam' : ''}">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${falta}</div>${editar ? confirmaFalta(p.c) : ''}`;
  };
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
  // Escala publicada: a imagem já está no card da gira (para todos). Quem não edita a gira para aqui;
  // o admin vê também o bloco do sorteio (com os controles).
  if (temDuplas && g.publicada && !admin) { setTimeout(atualizarJanela, 0); return h + '</section>'; }
  const aberto = manual || duplasAbertas.has(g.data);
  // Depois do sorteio, o bloco vem recolhido (só o título); tocar no título expande e recolhe.
  // Aviso de faltas para remanejar continua à vista.
  const avisoInvalidos = invalidos && sortearOk ? `<div class="warnbox">${invalidos} dupla(s) envolvem alguém que faltou ou mudou de status. Toque em <b>Remanejar faltas</b> para ajustar só essas, sem mexer nas outras.</div>` : '';
  const titDobra = (ab) => `<button class="grp-h dobra" data-act="dobrarduplas" aria-expanded="${ab}">${tituloSorteio(true)}<span class="count"><span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
  if (temDuplas && !aberto) {
    h += `<div class="card${admin ? ' adm' : ''}">${titDobra(false)}${avisoInvalidos}</div>`;
    if (editar) h += blocoSugestao(ps, g, true);
    setTimeout(atualizarJanela, 0);
    return h + '</section>';
  }
  // Moldura dourada de admin para quem pode mexer na gira.
  // Depois de sorteado, o quadrado ↻ no canto cancela o sorteio (apaga as duplas e volta ao Sortear).
  const cancelaOk = temDuplas && sortearOk;
  h += `<div class="card${admin ? ' adm' : ''}"><div class="grp-h${temDuplas && !manual ? ' sort-h' : ''}">${temDuplas && !manual ? titDobra(true) : tituloSorteio(temDuplas)}${cancelaOk ? `<button class="sort-cancel" data-act="askdel" data-k="csort:${g.data}" title="Cancelar o sorteio" aria-label="Cancelar o sorteio">↻</button>` : ''}</div>
      ${cancelaOk && estado.confirm === 'csort:' + g.data ? confirmaSorteio(`<b>Cancelar o sorteio?</b> Todas as duplas são apagadas (também as fixadas)${g.publicada ? ' e a escala deixa de ficar publicada' : ''}. Depois é só sortear de novo.`, 'cancelsort', 'Sim, cancelar') : ''}
      ${temDuplas ? acoesSorteio(g, sortearOk, editar && !passada, manual) : !sortearOk ? '' : estado.confirm === 'sort:' + g.data
        ? confirmaSorteio('<b>Tem certeza que quer sortear?</b> O app monta as duplas agora.', 'sortear', '🎲 Sortear')
        : `<button class="btn primary btn-grande" data-act="askdel" data-k="sort:${g.data}">🎲 Sortear</button>`}
      ${editar && temDuplas ? (g.publicada
        ? `<div class="pub-linha"><span class="pub-ok">📢 Escala publicada: todos veem o sorteio.</span><button class="btn small" data-act="despublicar">Ocultar</button></div>`
        : `<button class="btn btn-grande pub-bt" data-act="publicar"><span class="pub-tit">📢 Publicar escala</span><span class="pub-sub">Só os admins veem o sorteio até publicar</span></button>`) : ''}
      ${!temDuplas && manual && !passada ? `<div class="row"><button class="btn small" data-act="manual" aria-pressed="true">Concluir ajuste</button></div>` : ''}`;
  if (manual) h += `<p class="muted" style="margin:0;font-size:.88rem">${passada ? '<b>Gira passada:</b> registre como foi. ' : ''}Adicione ou tire cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone, e o médium de passe pode ir com qualquer médium.</p>`;
  h += avisoInvalidos;
  if (validos.length && semPasse.length) h += `<div class="warnbox">${semPasse.map(nome).map(esc).join(', ')} ainda sem médium.${manual ? ' Adicione no médium com quem foi.' : sortearOk ? (ps.some((p) => p.funcao === 'medium' && p.experiente) ? ' Use o Ajuste manual.' : ' Marque na aba Pessoas quais médiuns podem ter passe junto.') : ''}</div>`;
  if (!temDuplas && !manual) {
    // Ainda não sorteado: sem Ajuste manual e sem "Ver mais"; só o resumo e quem está fora (licença etc.).
    h += `${!lista.length ? '<p class="muted" style="margin:0">Nenhum médium presente.</p>' : sortearOk ? '' : '<p class="muted" style="margin:0">As duplas ainda não foram sorteadas.</p>'}${blocosFora(ps, g)}</div>`;
  } else {
  if (!lista.length) h += `<p class="muted">Nenhum médium presente.</p>`;

  else {
    const tirar = (k, i) => (manual ? `<button class="lock rm" data-act="remover" data-k="${k}" data-i="${i}" title="Tirar deste médium" aria-label="Tirar">✕</button>` : '');
    h += `<div class="pairs">`;
    lista.forEach((x) => {
      h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)}</span>${editar && !passada && !manual ? botaoFalta(x.m.id) : '<span></span>'}${editar ? confirmaFalta(x.m.id) : ''}<div class="cams">`;
      x.cams.forEach((p) => { const i = (g.pares || []).indexOf(p); h += linha('pares', p, i, camsPres, map, 'Cambone').replace(/<\/div>$/, tirar('pares', i) + '</div>'); });
      if (!x.cams.length) h += `<span class="muted">Sem cambone.${manual ? '' : sortearOk ? ' Use o Ajuste manual.' : ''}</span>`;
      x.passes.forEach((p) => { const i = (g.passes || []).indexOf(p); h += linha('passes', p, i, passPres, mapP, 'Passe').replace(/<\/div>$/, tirar('passes', i) + '</div>'); });
      if (manual) h += adicionar(x);
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  const sup = ps.filter((p) => status(p, g) === 'sup');
  // Suporte: cada pessoa com o botão Falta também (admin).
  if (sup.length) {
    h += `<div class="grp"><div class="grp-h"><h3>Suporte</h3><span class="count">${sup.length}</span></div>${editar && !passada && !manual
      ? `<div class="sup-lista">${sup.map((p) => `<div class="sup-l"><span>${esc(p.nome)}</span>${botaoFalta(p.id)}</div>${confirmaFalta(p.id)}`).join('')}</div>`
      : `<p style="margin:0">${sup.map((p) => esc(p.nome)).join(', ')}</p>`}</div>`;
  }
  h += blocosFora(ps, g);
  h += `${manual ? '' : botaoDobrar(true)}</div>`;
  }

  if (editar) h += blocoSugestao(ps, g, temDuplas);
  setTimeout(atualizarJanela, 0);
  return h + '</section>';
}

// Ícone do WhatsApp (balão com o telefone).
const ICONE_WHATS = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#25D366" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.9L2.3 21.8l4.8-1.3A9.8 9.8 0 1 0 12 2.2z"/><path fill="#fff" d="M8.6 7.2c.2-.4.5-.4.7-.4h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.1.2-.2.3 0 .6.4.7 1 1.4 1.6 1.9.7.6 1.3.8 1.6 1 .2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3 0 .2 0 .8-.3 1.4-.3.6-1.5 1.2-2 1.2-.6.1-1.1.3-3.7-.8-3.1-1.3-5-4.4-5.2-4.6-.1-.2-1.2-1.6-1.2-3.1 0-1.4.7-2.1 1-2.4z"/></svg>';
// Botão do WhatsApp no card da gira, abaixo do Encerrar gira: abre a janela para escolher texto ou imagem.
// Sem sorteio feito fica desabilitado (não há escala para mandar).
const botaoWhats = (ok) => (ok
  ? `<button class="btn btn-grande wa-bt" data-act="waabrir"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> WhatsApp</button>`
  : `<button class="btn btn-grande wa-bt" disabled title="Faça o sorteio primeiro"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> WhatsApp</button>`);

// ---------- janela do WhatsApp: texto (abre o WhatsApp com a mensagem) ou imagem (compartilhar do aparelho) ----------
const imagemPronta = () => { const g = giraAtual(); return !!(estado.img && estado.img.data === g.data && estado.img.key === chaveImg()); };
// A imagem começa a ser feita quando a janela abre: o compartilhar do celular só funciona logo depois do toque,
// então ela já precisa estar pronta quando a pessoa escolher "Imagem".
async function prepararImagem() {
  if (imagemPronta() || estado.waGerando) return;
  estado.waGerando = true;
  const key = chaveImg();
  try {
    const g = giraAtual();
    const blob = await gerarImagem(estado.pessoas, g, girasLista());
    if (estado.img) URL.revokeObjectURL(estado.img.url);
    estado.img = { url: URL.createObjectURL(blob), blob, key, data: g.data, nome: 'escala-' + g.data + '.png' };
  } catch (e) { estado.imgErro = key; toast(e.message); }
  estado.waGerando = false;
  atualizarJanela();
  avisar();   // o card "Sorteio realizado!" mostra a imagem assim que fica pronta
}

// Card da gira, abaixo da Licença (escala publicada, para todos): "Sorteio realizado!" com a imagem da escala; tocar amplia.
function blocoImagemEscala() {
  const pronta = imagemPronta();
  // Se a imagem falhou neste aparelho, não tenta de novo a cada redesenho.
  const falhou = !pronta && estado.imgErro === chaveImg();
  if (!pronta && !falhou) setTimeout(prepararImagem, 0);
  return `<div class="esc-img-sec"><h3 class="sorteio-ok">🚀 Sorteio realizado! ❤️</h3>
    ${pronta ? `<button class="esc-img-bt" data-act="escimg" aria-label="Ampliar a imagem da escala"><img src="${estado.img.url}" alt="Escala da gira"></button>
      <p class="muted esc-img-dica">Toque na imagem para ampliar.</p>`
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

// ---------- ações ----------
export const cliques = {
  ...cliquesResumo,
  ...cliquesEventos,
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
  presok() {
    const c = estado.confPres; estado.confPres = null; atualizarJanela();
    if (c?.rapida) gravarRapida(c); else if (c) gravarPresenca(c.id, c.valor);
  },
  // Presença pela caixa amarela: OK abre a janela de confirmação.
  rapok() {
    const r = estado.presRapida;
    if (!r || r.data !== giraAtual().data) return;
    estado.confPres = { id: r.id, valor: r.st, papel: r.papel, rapida: true };
    atualizarJanela();
  },
  prescancel() { estado.confPres = null; atualizarJanela(); avisar(); },
  sortear: () => { duplasAbertas.add(giraAtual().data); sortear(); },
  dobrarsug() {
    const d = giraAtual().data;
    if (sugAbertas.has(d)) sugAbertas.delete(d); else sugAbertas.add(d);
    avisar();
  },
  dobrarduplas() {
    const d = giraAtual().data;
    if (duplasAbertas.has(d)) duplasAbertas.delete(d); else duplasAbertas.add(d);
    avisar();
  },
  publicar() { publicarEscala(true); },
  despublicar() { publicarEscala(false); },
  // A gira cadastrada mais recente antes da data aberta.
  giraanterior() {
    const d = Object.keys(estado.giras).filter((x) => x < prefs.data).sort().pop();
    if (!d) { toast('Não há gira anterior a esta.'); return; }
    prefs.data = d; salvarPrefs(); avisar();
  },
  proxgira() {
    // A próxima gira cadastrada a partir de hoje; se não houver, a próxima quarta.
    const cad = Object.keys(estado.giras).filter((x) => x >= hoje()).sort()[0];
    const d = cad || proximaQuarta();
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
  // Tocar na data da gira: pergunta se quer alterar; "Sim" abre o calendário; escolher a data salva.
  mudardata() { estado.mudaData = 'pergunta'; atualizarJanela(); },
  mdsim() {
    estado.mudaData = 'calendario';
    atualizarJanela();
    const inp = document.getElementById('md-data');
    try { inp?.showPicker(); } catch { inp?.focus(); }
  },
  mdcancel() { estado.mudaData = null; atualizarJanela(); },
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
  remanejar: () => { estado.confirm = null; duplasAbertas.add(giraAtual().data); remanejar(); },
  cancelsort: () => { estado.confirm = null; cancelarSorteio(); },
  faltaask(el) { estado.faltaConf = el.dataset.id; avisar(); },
  faltacancel() { estado.faltaConf = null; avisar(); },
  // Confirmou: presença vira Falta e a escala é refeita (Remanejar faltas).
  async faltaok(el) {
    const id = el.dataset.id;
    estado.faltaConf = null;
    const g = giraAtual();
    editarGira({ presenca: { ...(g.presenca || {}), [id]: 'f' } });
    await remanejar(`Falta de ${nome(id)} marcada. Escala refeita.`);
  },
  fixo(el) {
    const k = el.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +el.dataset.i ? { ...p, fixo: !p.fixo } : p)) });
    avisar();
  },
  oranova() { estado.oraNova = !estado.oraNova; avisar(); if (estado.oraNova) document.getElementById('or-texto')?.focus(); },
  async oraexcluir(el) { estado.confirm = null; if (await acaoOracoes('excluirOracao', { id: el.dataset.id })) toast('Oração excluída.'); },
  // A vela muda na hora; a resposta do servidor corrige a contagem.
  async orareagir(el) {
    const o = (estado.oracoes || []).find((x) => x.id === el.dataset.id);
    if (!o) return;
    o.reacoes = (o.reacoes || 0) + (o.reagi ? -1 : 1); o.reagi = !o.reagi; avisar();
    await acaoOracoes('reagirOracao', { id: o.id });
  },
  eufoto(el) { estado.fotoVer = el.dataset.id; atualizarJanela(); },
  fotofechar() { estado.fotoVer = null; atualizarJanela(); },
  escimg() { estado.escImgVer = true; atualizarJanela(); },
  escimgfechar() { estado.escImgVer = null; atualizarJanela(); },
  // Janela do WhatsApp (texto ou imagem).
  waabrir() { estado.waJanela = true; atualizarJanela(); prepararImagem(); },
  wafechar() { estado.waJanela = null; atualizarJanela(); },
  // O link já abre o WhatsApp; a janela fecha logo depois (sem atrapalhar o toque no link).
  watexto() { setTimeout(cliques.wafechar, 0); },
  waimagem() {
    if (!imagemPronta()) return;
    const { blob, url, nome: arq } = estado.img;
    if (!podeCompartilhar()) {
      baixar(url, arq);
      toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
      cliques.wafechar();
      return;
    }
    navigator.share({ files: [new File([blob], arq, { type: 'image/png' })], title: 'Escala da gira' })
      .then(() => cliques.wafechar())
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Tente pelo texto.'); });
  },
  wafmt(el) { prefs.fmt = el.dataset.v; salvarPrefs(); atualizarJanela(); },
  copiar() {
    const txt = textoWhats(estado.pessoas, giraAtual(), prefs.fmt, girasLista());
    // Sem acesso à área de transferência: copia por uma caixa de texto escondida.
    const fb = () => {
      const t = document.createElement('textarea');
      t.value = txt; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* sem cópia */ }
      t.remove();
      toast(ok ? 'Copiado. Cole no grupo do WhatsApp.' : 'Não consegui copiar. Use a opção Texto da lista.');
    };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
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

// Caixa amarela confirmada: grava status e função de uma vez (só o que mudou) e volta para "<escolha a pessoa>".
function gravarRapida(c) {
  const g = giraAtual();
  const p = estado.pessoas.find((x) => x.id === c.id);
  estado.presRapida = null;
  if (!p) { avisar(); return; }
  const pr = { ...(g.presenca || {}) };
  const pa = { ...(g.papeis || {}) };
  if (c.valor !== presencaDe(p, g)) pr[c.id] = c.valor;
  if (c.papel !== papelDe(p, g)) {
    if (c.papel === 'cad') { if (foraDaLinha(p, g)) pa[c.id] = 'cad'; else delete pa[c.id]; } else pa[c.id] = c.papel;
    if (pr[c.id] === 'sup' || pr[c.id] === 'na') pr[c.id] = 'p';   // formato antigo
  }
  if (c.valor === 'f' || c.valor === 'a') delete pa[c.id];
  editarGira({ presenca: pr, papeis: pa });
  toast(`${p.nome}: ${STATUS[c.valor]}.`);
  avisar();
}

// A janela fica direto no <body> (fora da tela que é redesenhada), por cima de tudo.
let raizJanela = null;
function atualizarJanela() {
  const html = prefs.tab === 'gira' ? janelaPresenca() || janelaData() || janelaWhats() || janelaFoto() || janelaEscala() : '';
  if (!raizJanela) {
    if (!html) return;
    raizJanela = document.createElement('div');
    raizJanela.id = 'janela';
    document.body.appendChild(raizJanela);
    raizJanela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && cliques[b.dataset.act]) cliques[b.dataset.act](b);
      else if (e.target.closest('.modal-fundo')) (estado.fotoVer ? cliques.fotofechar : estado.escImgVer ? cliques.escimgfechar : e.target.classList.contains('modal-fundo') ? (estado.waJanela ? cliques.wafechar : estado.mudaData ? cliques.mdcancel : cliques.prescancel) : () => {})();
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
  // Caixa amarela: escolher a pessoa já traz o status e a função atuais dela.
  rappessoa(t) {
    const g = giraAtual();
    const p = t.value && estado.pessoas.find((x) => x.id === t.value);
    estado.presRapida = p ? { data: g.data, id: p.id, st: presencaDe(p, g), papel: papelDe(p, g) } : null;
    avisar();
  },
  rapst(t) { if (estado.presRapida) estado.presRapida.st = t.value; },
  rappapel(t) { if (estado.presRapida) estado.presRapida.papel = t.value; },
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
