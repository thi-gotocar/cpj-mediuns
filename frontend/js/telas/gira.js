// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, opcoesGira, giraEspecial, nomeGira, tituloGira, tituloAutomaticoGira, contaNaPresenca, pendentesDaGira, ORIXAS, temOrixa, proximaTurma, status, presencaDe, papelDe, daGira, foraDaLinha, licencaEm, presente, cambonaHoje, paresPorMedium, escalaDaGira, custos, pessoasDaGira, linhaDaEntidade } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, visaoAtiva, pessoasOrd, pessoasComSaidas, nome, nomeNaGira, girasLista, historicoCompleto, giraAtual, editarGira, sortear, remanejar, encerrarGira, reabrirGira, cancelarSorteio, declararAusencia, acaoAusPrevia, publicarEscala, travarEscala, salvarRecado, acaoOracoes, doarItem, escolherEntidade, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar, hoje, podeCompartilharImagem, compartilharImagem } from '../util.js';
import { textoWhats } from '../exportar.js';
import { calendarioMes, mesMais } from '../calendario.js';
import { painelResumo, cliquesResumo } from '../compartilharResumo.js';
import { dadosResumo, textoLimpeza } from '/shared/resumoGira.js';
import { config } from '/shared/config.js';
import { aniversariantesDoDia, rotuloTipo } from '/shared/eventos.js';
import { htmlStatus, abertos, cabDobra, caixaPendente, ICONE_WHATS } from './giraComum.js';
import { blocoEu } from './giraEu.js';
import { sugAbertas, blocoSugestao } from './giraSugestao.js';
import { cardSemana, cardOracoes, cardAulaCurimba, cardCompromissos } from './giraTopo.js';
import { blocoAusPrevia, avisoEntidade, contagemPresentes } from './giraInformacoes.js';
import { duplasAbertas, botaoDobrar, acoesSorteio, tituloSorteio, confirmaSorteio, confirmaRemenajo, titDobra } from './giraEscala.js';
import { cardConduta, cliquesConduta, mudancasConduta } from './giraConduta.js';
import { cardFilaGeral, cliquesFilaGeral } from './giraFilaGeral.js';
import { cardAtrasos, cliquesAtrasos } from './giraAtrasos.js';
import { cardAno, cliquesAno, mudancasAno } from './giraAno.js';
import { montarNova, cliquesNova, fecharCompartilhar } from './giraNova.js';
export { enviarOracao } from './giraTopo.js';
export { enviarConduta, digitarConduta } from './giraConduta.js';
import { imagemOracoesPronta, prepararOracoes, imagemNiverPronta, prepararNiver, botaoWhatsLimpeza, imagemPronta, imagemEventoPronta, botaoImagemEvento, prepararImagemEvento, prepararImagem, blocoImagemEscala, atualizarJanela } from './giraJanelas.js';

const classeStatus = (s) => (s === 'a' || s === 'f' || s === 'lic' ? 'aus' : s === 'na' ? 'na' : s === 'sup' ? 'nc' : s === 'pend' ? 'pend' : '');
// Atendimentos da gira: o admin preenche na gira aberta (salva sozinho); na encerrada, todos veem.
const ATEND = [['normal', 'Atendimento'], ['passe', 'Passe'], ['preferencial', 'Preferencial']];
const camposAtend = (g) => `<div class="atend-nums atend-editar">${ATEND.map(([k, t]) => `<label class="at-${k}"><input type="number" inputmode="numeric" min="0" step="1" id="at-${k}" data-act="atend" data-k="${k}" aria-label="${t}" value="${Number(g.atendimentos?.[k]) || 0}"><span>${t}</span></label>`).join('')}</div>`;
const numerosAtend = (a) => `<div class="atend-nums">${ATEND.map(([k, t]) => `<div class="at-${k}"><b>${Number(a?.[k]) || 0}</b><span>${t}</span></div>`).join('')}</div>`;
const campoParticipantes = (g) => `<div class="ev-participantes-bloco">
  <span class="ev-participantes-titulo">Total de participantes</span>
  <input class="ev-participantes-input" type="number" inputmode="numeric" min="0" max="100000" step="1" id="ev-participantes" data-act="participantes" aria-label="Total de participantes do evento" value="${Number(g.participantes) || 0}">
</div>`;
const seletorOrixa = (g, travado = false) => `<select data-act="orixagira" aria-label="Orixá" ${travado ? 'disabled' : ''}><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === g.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

export function chaveImg() {
  return textoWhats(estado.pessoas, giraAtual(), 'lista', girasLista());
}
export const podeCompartilhar = () => !!estado.img && podeCompartilharImagem(estado.img.blob, estado.img.nome);

// Lista das linhas; mantém um valor antigo (texto livre) se a gira já tinha um.
function seletorEntidade(atual, nomeAtual = '', travado = false) {
  const conhecida = linhaDaEntidade(atual);
  const especial = giraEspecial(atual);
  const valor = nomeGira(atual);
  const antigo = valor && !conhecida && !especial ? `<option value="${esc(valor)}" selected>${esc(valor)} (fora da lista)</option>` : '';
  return `<select id="f-ent" ${travado ? 'disabled' : ''}><option value="" ${!valor ? 'selected' : ''}>— escolha —</option>${antigo}
    ${opcoesGira(estado.entidadesApelidos).map((grp) => `<optgroup label="${grp.grupo}">${grp.itens.map(([canonico, label, alias]) => `<option value="${esc(canonico)}" data-alias="${esc(alias)}" ${canonico === valor && alias === nomeAtual ? 'selected' : ''}>${esc(label)}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

// Faltas e ausentes: na tela, para todos conferirem (não entram no texto nem na imagem do evento).
// Sorteio (admin): botão "Falta" de cada pessoa da escala e a confirmação logo abaixo.
const botaoFalta = (id) => `<button class="lock falta-bt" data-act="faltaask" data-id="${id}" title="${giraAtual().travada ? 'Marcar falta (a escala não muda)' : 'Marcar falta e refazer a escala'}">Falta</button>`;
function confirmaFalta(id) {
  if (estado.faltaConf !== id) return '';
  return `<div class="falta-conf"><span>Marcar <b>falta</b> de <b>${esc(nome(id))}</b>? A lista de presença muda para Falta${giraAtual().travada ? '; a escala fica como está (Trava ligada).' : ' e a escala é refeita como no Remanejar faltas.'}</span>
    <span class="row" style="gap:6px"><button class="btn small danger" data-act="faltaok" data-id="${id}">Confirmar falta</button><button class="btn small" data-act="faltacancel">Cancelar</button></span></div>`;
}

// 2º combo da presença (função nesta gira), conforme o cadastro:
// Cambone → Cambone / Passe / Senha / Suporte · Passe → Passe / Cambone / At. Extra / Suporte
// Senha → Senha / Cambone / Passe / Suporte · Extra → At. Extra / Passe / Cambone / Suporte · demais → função / Cambone / Suporte.
const NOME_FUNCAO = { medium: 'Médium', cambone: 'Cambone', passe: 'Passe', extra: 'At. Extra', senha: 'Senha' };
export function opcoesPapel(p) {
  const cad = ['cad', NOME_FUNCAO[p.funcao] || p.funcao];
  if (p.funcao === 'cambone') return [cad, ['pas', 'Passe'], ['sen', 'Senha'], ['sup', 'Suporte']];
  if (p.funcao === 'passe') return [cad, ['na', 'Cambone'], ['ext', 'At. Extra'], ['sup', 'Suporte']];
  if (p.funcao === 'senha') return [cad, ['na', 'Cambone'], ['pas', 'Passe'], ['sup', 'Suporte']];
  if (p.funcao === 'extra') return [cad, ['pas', 'Passe'], ['na', 'Cambone'], ['sup', 'Suporte']];
  return [cad, ['na', 'Cambone'], ['sup', 'Suporte']];
}
const htmlPapel = (p, papel) => opcoesPapel(p).map(([k, t]) => `<option value="${k}" ${k === papel ? 'selected' : ''}>${t}</option>`).join('');

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

// Passo Escala (admin): trocar a função de alguém só nesta gira, antes (ou depois) de sortear. Embaixo, as trocas do dia
// e quem não vem (ausência, falta, licença), para conferir tudo o que muda a escala num lugar só. O sorteio e o
// Remanejar faltas usam a função do dia (shared/regras.js funcaoNaGira / status).
function blocoFuncoes(ps, g, temDuplas) {
  const r = estado.funcDia?.data === g.data ? estado.funcDia : null;
  const vem = ps.filter((p) => !licencaEm(p, g.data) && !['a', 'f'].includes(presencaDe(p, g)));
  const p = r && vem.find((x) => x.id === r.id);
  const nomeDe = (x, papel) => opcoesPapel(x).find(([k]) => k === papel)?.[1] || STATUS[papel] || papel;
  const muda = p && r.papel !== papelDe(p, g);
  const aviso = muda && temDuplas ? `<small class="muted fn-nota">${g.travada ? 'Escala travada: as duplas não mudam.' : 'A escala já foi sorteada: as duplas são refeitas (Remanejar faltas).'}</small>` : '';
  const combo = `<div class="warnbox pres-rap fn-rap"><select class="pr-pessoa" data-act="fnpessoa" aria-label="Pessoa para trocar a função nesta gira">
      <option value="">&lt;escolha a pessoa&gt;</option>${vem.map((x) => `<option value="${x.id}" ${x.id === p?.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
    ${p ? `<span class="pr-ctl"><select data-act="fnpapel" aria-label="Função de ${esc(p.nome)} nesta gira">${htmlPapel(p, r.papel)}</select>
      <button class="btn small bt-ok" data-act="fnok" ${muda ? '' : 'disabled'}>OK</button></span>${aviso}` : ''}</div>`;
  // Trocas do dia: quem não está na função do cadastro (Extra/Passe fora da linha entram sozinhos como Cambone).
  const trocas = vem.filter((x) => papelDe(x, g) !== 'cad');
  const linhaTroca = (x) => {
    const papel = papelDe(x, g);
    const auto = papel === 'na' && !(g.papeis || {})[x.id] && foraDaLinha(x, g);
    return `<div class="fn-l"><span class="nm-mudou">${esc(x.nome)}</span><span class="fn-de">${esc(NOME_FUNCAO[x.funcao] || x.funcao)} → <b>${esc(nomeDe(x, papel))}</b>${auto ? ' <small class="muted">(fora da linha)</small>' : ''}</span>
      ${auto ? '' : `<button class="btn small" data-act="fnvolta" data-id="${x.id}" aria-label="${esc(x.nome)} volta para a função do cadastro" title="Volta para a função do cadastro">✕</button>`}</div>`;
  };
  const aus = ps.filter((x) => status(x, g) === 'a');
  const fal = ps.filter((x) => status(x, g) === 'f');
  const lic = ps.filter((x) => licencaEm(x, g.data));
  const nomes = (l) => l.map((x) => esc(x.nome)).join(', ');
  const fora = aus.length || fal.length || lic.length ? `<div class="fn-fora">
      ${aus.length ? `<p><b>Ausência</b> ${nomes(aus)}</p>` : ''}${fal.length ? `<p><b>Falta</b> ${nomes(fal)}</p>` : ''}
      ${lic.length ? `<p><b>Licença</b> ${lic.map((x) => `${esc(x.nome)} <span class="muted">até ${dDM(licencaEm(x, g.data).fim)}</span>`).join(', ')}</p>` : ''}</div>` : '';
  return `<div class="gira-sec fn-dia"><div class="grp-h"><h3>🔁 Função nesta gira</h3></div>${combo}
    ${trocas.length ? `<div class="fn-lista">${trocas.map(linhaTroca).join('')}</div>` : '<p class="muted fn-nota">Todos na função do cadastro.</p>'}
    ${fora}</div>`;
}

// Grava a função do dia (como o 2º combo da presença) e, com a escala já sorteada e sem trava, refaz as duplas.
async function gravarFuncao(id, papel) {
  const g = giraAtual();
  const p = estado.pessoas.find((x) => x.id === id);
  if (!p) return;
  const pa = { ...(g.papeis || {}) };
  if (papel === 'cad') { if (foraDaLinha(p, g)) pa[id] = 'cad'; else delete pa[id]; } else pa[id] = papel;
  const pr = { ...(g.presenca || {}) };
  if (pr[id] === 'sup' || pr[id] === 'na') pr[id] = 'p';   // formato antigo
  const temDuplas = (g.pares || []).length || (g.passes || []).length;
  editarGira({ papeis: pa, presenca: pr });
  const fn = opcoesPapel(p).find(([k]) => k === papel)?.[1] || papel;
  if (temDuplas && !g.travada) { await remanejar(`${p.nome}: ${fn} nesta gira. Escala refeita.`); return; }
  toast(`${p.nome}: ${fn} nesta gira.${temDuplas ? ' A escala está travada e não mudou.' : ''}`);
  avisar();
}

function blocosFora(ps, g) {
  // Faltaram e Ausentes (quem vê a escala sem editar); a licença fica em Quem não vem.
  return [['f', 'Faltaram'], ['a', 'Ausentes']].map(([st, titulo]) => {
    const quem = ps.filter((p) => status(p, g) === st);
    return quem.length ? `<div class="grp fora"><div class="grp-h"><h3>${titulo}</h3><span class="count">${quem.length}</span></div><p style="margin:0">${quem.map((p) => esc(p.nome)).join(', ')}</p></div>` : '';
  }).join('');
}

// Quadro "Gira encerrada" (para todos, só informa): atendimentos e presença.
const numeroParticipantes = (g) => `<div class="atend-nums participantes"><div class="at-participantes"><b>${Number(g.participantes) || 0}</b><span>Participantes</span></div></div>`;
// Na mesma linha do ✓ Encerrado: o WhatsApp do resumo e, para o admin, o Reabrir (só o ícone, pouco usado).
// O Resumo abre pelo Compartilhar; aqui só fica o Fechar com o painel aberto.
function blocoEncerrada(ps, g, { resumo: verResumo = false, reabrir = false } = {}) {
  const resumo = dadosResumo(estado.pessoas, g);
  const aberto = estado.resumo?.data === g.data;
  const btResumo = verResumo && aberto ? `<button class="btn small wa-bt enc-rs" data-act="rsabrir" data-d="${g.data}">${aberto ? '<span aria-hidden="true">✕</span> Fechar' : `<span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Resumo`}</button>` : '';
  const btReabrir = reabrir ? '<button class="btn small enc-reabrir" data-act="reabrir" title="Reabrir a gira" aria-label="Reabrir a gira">↺</button>' : '';
  return `<div class="enc-quadro"><div class="enc-titulo"><span aria-hidden="true">✓</span><h3>Encerrado</h3>${btResumo || btReabrir ? `<div class="enc-acoes">${btResumo}${btReabrir}</div>` : ''}</div>
    ${verResumo ? painelResumo(g) : ''}
    ${g.evento ? numeroParticipantes(g) : numerosAtend(g.atendimentos)}
    ${contagemPresentes(ps, g, resumo)}</div>`;
}

// Encerrar gira (admin): com alguém pendente só avisa; senão pede confirmação.
function botaoEncerrar(g) {
  if (estado.confirm === 'enc:' + g.data) return `<button class="btn" data-act="cancelenc"><span aria-hidden="true">✕</span> Cancelar</button>`;
  const pend = pendentesDaGira(estado.pessoas, g).length;
  return pend
    ? `<button class="btn enc-bt" data-act="encpend" data-n="${pend}" title="Confirme a presença de todos antes de encerrar"><span aria-hidden="true">🔒</span> Encerrar gira</button>`
    : `<button class="btn enc-bt" data-act="askdel" data-k="enc:${g.data}"><span aria-hidden="true">🔒</span> Encerrar gira</button>`;
}

// Encerrar: só confirma — os atendimentos já estão nos campos da própria aba.
function caixaEncerrar() {
  return `<div class="infobox enc"><span><b>Encerrar a gira?</b> Confira os atendimentos (em branco conta 0).</span>
    <span class="muted" style="font-size:.85rem">Quem estava para cambonar e não ficou com nenhum médium, e médium de passe sem médium, vão para o <b>Suporte</b>. Depois disso a escala não muda até ser reaberta; ao reabrir, essas pessoas voltam para a lista.</span>
    <span class="row"><button class="btn small primary" data-act="encerrar">Encerrar</button><button class="btn small" data-act="cancelenc">Cancelar</button></span></div>`;
}

// Calendário do mês (o mesmo do Diário) com as giras e os eventos marcados (os cadastrados na gira e os da agenda do
// Admin root); tocar num dia abre esse dia.
// Embaixo, o que há no dia escolhido, em linhas: o dia, a gira/evento cadastrado e os eventos da agenda e, se houver,
// os aniversariantes (🎈 no dia do calendário, pelo dia/mês do Perfil). Para todos, em qualquer estado.
// O mês mostrado segue o dia aberto até a pessoa trocar de mês nas setas do calendário.
const cal = { mes: '', ref: '' };
const mesDoCalendario = () => (cal.ref === prefs.data && cal.mes) || prefs.data.slice(0, 7);
function descricaoDoDia(g) {
  const itens = [];
  if (estado.giras[g.data]) itens.push(esc(tituloGira(g)));
  for (const e of (estado.eventos || []).filter((x) => x.data === g.data)) {
    if (!itens.includes(esc(e.nome))) itens.push(`${esc(e.nome)} <span class="muted">(${esc(rotuloTipo(e))})</span>`);
  }
  const dia = esc(dLong(g.data).replace(/^./, (c) => c.toUpperCase()));
  const niver = aniversariantesDoDia(estado.pessoas, g.data);
  return `<div class="gira-cal-desc"><p class="di-lua"><span aria-hidden="true">📅</span> <b>${dia}</b></p>
    <p class="di-lua">${itens.length ? itens.join(' · ') : '<span class="muted">Nenhuma gira ou evento</span>'}</p>
    ${niver.length ? `<p class="di-lua"><span aria-hidden="true">🎈</span> Aniversário: ${niver.map((p) => esc(p.nome)).join(', ')}</p>` : ''}</div>`;
}
// Até dois pontos por dia: dourado se há gira (cadastrada ou na agenda) e azul se há evento; 🎈 se alguém faz aniversário.
function marcasDosDias() {
  const porDia = {};
  for (const e of estado.eventos || []) (porDia[e.data] ||= []).push(e);
  const niver = new Set((estado.pessoas || []).filter((p) => !p.saida && p.aniversario).map((p) => p.aniversario));
  return (data) => {
    const x = estado.giras[data];
    const ag = porDia[data] || [];
    const gira = (x && !x.evento) || ag.some((e) => e.tipo === 'gira');
    const evento = !!x?.evento || ag.some((e) => e.tipo !== 'gira');
    return `${gira ? '<i class="di-p di-p-gira"></i>' : ''}${evento ? '<i class="di-p di-p-evento"></i>' : ''}${niver.has(data.slice(5)) ? '<i class="di-niver" aria-hidden="true">🎈</i>' : ''}`;
  };
}
function seletorData(g) {
  const marcas = marcasDosDias();
  return `<div class="gira-cal">
    ${calendarioMes({ mes: mesDoCalendario(), sel: g.data, acaoDia: 'giradia', acaoMes: 'girames', marcas })}
    <div class="di-leg muted"><span><i class="di-p di-p-gira"></i> gira</span><span><i class="di-p di-p-evento"></i> evento</span><span><i class="di-niver" aria-hidden="true">🎈</i> aniversário</span></div>
    ${descricaoDoDia(g)}
  </div>`;
}

// Quem está logado tem o bloco "Você nesta gira" (lá vai o aviso de pendente).
const temBlocoEu = () => !!(estado.me?.pessoaId && estado.pessoas.some((x) => x.id === estado.me.pessoaId));

// Acesso da corrente: com a escala publicada, a imagem dela fica em "Sorteio realizado";
// aqui só os avisos de quando ainda não há escala. (A corrente só recebe as duplas depois de publicadas.)
function resultado(g) {
  const { lista } = paresPorMedium(estado.pessoas, g);
  const comDuplas = lista.some((x) => x.cams.length || x.passes.length);
  if (comDuplas) return '';
  return temBlocoEu() ? '' : caixaPendente(g);
}

// Pedido de oração: até 3 linhas.

// A gira da aba Geral: a de hoje ou a próxima, ainda não encerrada (gira nova cadastrada ou em andamento).
function giraDaGeral() {
  const d = Object.keys(estado.giras).filter((x) => x >= hoje() && !estado.giras[x].encerrada).sort()[0];
  return d ? estado.giras[d] : null;
}

export function render() {
  if (prefs.tab === 'agenda') return renderGira();
  if (visaoAtiva() === 'curimba') return `<section class="panel geral">${cardAulaCurimba()}${cardSemana({ ocultarAvisos: true })}</section>`;
  // Quem não é da corrente (alunos, consulentes, grupo Oferenda) não tem a aba Gira: a fila de senhas aparece aqui no dia.
  if (visaoAtiva() === 'alunos' && estado.me?.aguardando) return `<section class="panel geral">${cardFilaGeral()}${cardAguardando()}${cardSemana()}${cardOracoes({ aluno: true })}</section>`;
  // Grupo Oferenda: os compromissos que o admin atribuiu (cardCompromissos só aparece com oferendas:doar ou :ver).
  if (visaoAtiva() === 'alunos') return `<section class="panel geral">${cardFilaGeral()}${cardAtrasos()}${cardAulaCurimba()}${cardCompromissos()}${cardSemana()}${cardOracoes({ aluno: true })}</section>`;
  // O bloco da gira (Você nesta gira) mostra sempre a gira de hoje ou a próxima, ainda não encerrada, sem depender da
  // data escolhida no calendário da aba Gira. As ações do bloco (presença, ausência, entidade) gravam na data em uso,
  // então ela passa a ser a desta gira (a aba Gira volta para hoje ao abrir).
  const g = giraDaGeral();
  if (g && prefs.data !== g.data) prefs.data = g.data;
  const eu = g && estado.me?.pessoaId ? blocoEu(g) : '';
  return `<section class="panel geral">${cardAtrasos()}${eu}${cardAulaCurimba()}${cardCompromissos()}${cardSemana()}${cardOracoes()}${cardConduta()}</section>`;
}

// Cadastro novo pelo login (aluno sem turma): boas-vindas enquanto a administração libera o acesso.
function cardAguardando() {
  const nome = String(estado.me?.nome || '').split(/\s+/)[0];
  return `<div class="card aguardando"><div class="aguardando-h"><span aria-hidden="true">🌿</span><h2>Que bom ter você aqui${nome ? `, ${esc(nome)}` : ''}!</h2></div>
    <p>Seu cadastro foi recebido com carinho. Agora é só aguardar: a administração da Casa do Pai João vai liberar o seu acesso em breve.</p>
    <p class="muted">Enquanto isso, você já pode ver os próximos eventos e pedir uma oração. Axé! 🙏</p></div>`;
}

// A aba Gira: as peças são montadas aqui e arrumadas em giraNova.js (faixa da semana, Compartilhar, os passos do admin
// e o que a corrente vê).
function renderGira() {
  const g = giraAtual();
  // Curimba fica fora da presença; quem entrou na corrente depois desta data também.
  const ps = daGira(pessoasComSaidas(), g).filter(contaNaPresenca);
  const admin = pode('giras:editar');
  const encerrada = !!g.encerrada;
  // Gira encerrada não muda até ser reaberta.
  const editar = admin && !encerrada;
  const sortearOk = pode('giras:sortear') && !encerrada;
  const existe = !!estado.giras[g.data];
  const ano = cardAno();   // bloco do ano, no fim da tela

  // Data sem gira (admin): só o card para adicionar o evento.
  if (editar && !existe) {
    return montarNova({ g, ps, ano, semGira: true, calendario: seletorData(g), marcas: marcasDosDias(), ausPrevia: g.data >= hoje() ? blocoAusPrevia(ps, g) : '' });
  }
  const { lista, validos, passesV, semPasse } = paresPorMedium(estado.pessoas, escalaDaGira(g));
  const temDuplas = !g.evento && (validos.length || passesV.length);
  // WhatsApp da escala (desabilitado sem sorteio).
  const whats = pode('escala:completa') && existe && !g.evento;

  const htmlTrava = () => (!g.evento && ((g.pares || []).length || (g.passes || []).length) ? `<label class="of-sw" title="Com a trava, marcar falta ou ausência não muda a escala"><input type="checkbox" role="switch" data-act="travaesc" ${g.travada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Trava</label>` : '');
  // A Presença do admin fica sempre aberta com a escolha da pessoa; a lista inteira abre em "+ Ver lista".
  const secaoPresenca = () => {
    const cont = (s) => ps.filter((p) => presencaDe(p, g) === s).length;
    const contPapel = (r) => ps.filter((p) => status(p, g) === r).length;
    const antesDoDia = g.pendentePadrao && g.data > hoje();
    const partes = [[cont('pend'), 'pendente', 'pendentes'], [cont('p'), 'presente', 'presentes'], [cont('f'), 'falta', 'faltas'], [cont('a'), 'ausente', 'ausentes'], [cont('lic'), 'de licença', 'de licença'], [contPapel('sup'), 'no suporte', 'no suporte'], [contPapel('na'), 'não atende', 'não atendem']]
      .filter(([n], i) => n || i === 1).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(' · ');
    let h;
    if (editar) {
      const ab = abertos.has('pres');
      // Sem moldura nem título (o passo Presença já tem); a Trava fica no passo Escala.
      h = `<div class="gira-sec">
      ${presencaRapida(ps, g, antesDoDia)}
      <button class="btn link small ver-mais" data-act="dobrarcard" data-k="pres" aria-expanded="${ab}">${ab ? '− Esconder lista' : '+ Ver lista'}</button>`;
    } else h = `<div class="gira-sec">${cabDobra('pres', 'Presença', partes)}`;
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
        const lic = licencaEm(p, g.data);
        const ctl = lic
          ? `<span class="badge lic" title="De licença de ${dDM(lic.inicio)} a ${dDM(lic.fim)}">de licença até ${dDM(lic.fim)}</span>`
          : editar
          ? (() => {
            // 1º combo: Pendente, Presente, Falta, Ausente. 2º combo: a função do cadastro e as trocas do dia.
            const papel = papelDe(p, g);
            return `<span class="st-ctl"><select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${htmlStatus(g, presencaDe(p, g), s, antesDoDia)}</select>
              <select class="st papel-dia ${papel}" id="pp-${p.id}" data-act="papel" data-id="${p.id}" aria-label="Como ${esc(p.nome)} trabalha nesta gira">${htmlPapel(p, papel)}</select></span>`;
          })()
          : `<span class="st-txt">${STATUS[s]}</span>`;
        const mudou = grupoDe(p) !== p.funcao;
        return `<div class="pres ${classeStatus(presencaDe(p, g))}"><span class="nm">${mudou ? `<span class="nm-mudou" title="Nesta gira não está na função do cadastro">${esc(p.nome)}</span>` : esc(p.nome)}${xp}</span>${ctl}</div>`;
      }).join('')}</div></div>`;
      });
    }
    return h + '</div>';
  };

  const secaoSorteio = () => {
    const nome = nomeNaGira(g);   // encerrada: nomes do retrato
    historicoCompleto();   // quem cambonou quem pesa o histórico inteiro
    const map = custos(girasLista(), g.data, 'pares');
    const mapP = custos(girasLista(), g.data, 'passes');
    const psg = pessoasDaGira(ps, g);
    const camsPres = psg.filter((p) => cambonaHoje(p, g));
    const passPres = psg.filter((p) => presente(p, g) && p.funcao === 'passe');
    // Quem está no Suporte também pode ser posto como cambone (sai do Suporte).
    const doSuporte = psg.filter((p) => status(p, g) === 'sup');
    const grupoSup = (itens, fn) => (itens.length ? `<optgroup label="Do Suporte">${itens.map(fn).join('')}</optgroup>` : '');
    const selo = (e) => (!e ? ''
      : e.recente ? `<span class="badge hot">repetiu da última</span>`
        : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
    const passada = g.data < hoje();
    // Ajuste manual: em gira passada fica sempre ligado (registrar como foi);
    // nas outras, o admin liga pelo botão.
    // O Ajuste manual ligado pelo botão deixa o bloco aberto até Concluir; o da gira passada não impede recolher.
    const ajuste = editar && estado.manual === g.data;
    const manual = ajuste || (editar && passada);
    // Escala travada: quem faltou segue na escala, com um selo no lugar do combo e do botão Falta.
    const seloFora = (id) => {
      const p = estado.pessoas.find((x) => x.id === id);
      const pr = g.travada && p ? presencaDe(p, g) : '';
      return pr === 'f' ? '<span class="badge lic">faltou</span>' : pr === 'a' ? '<span class="badge lic">ausente</span>' : '';
    };
    const linha = (k, p, idx, opts, mp, rotulo) => {
      const fora = seloFora(p.c);
      const quem = fora ? `<span class="nmc">${esc(nome(p.c))}</span>${fora}` : editar
        ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}${k === 'pares' ? grupoSup(doSuporte, (c) => `<option value="${c.id}">${esc(c.nome)}</option>`) : ''}</select>`
        : `<span class="nmc">${esc(nome(p.c))}</span>`;
      // "Falta": marca falta na presença e refaz a escala (como Remanejar faltas), depois de confirmar.
      const falta = editar && !passada && !manual && !fora ? botaoFalta(p.c) : '';
      return `<div class="camrow">${rotulo ? `<span class="tag ${rotulo === 'Cambone' ? 'cam' : ''}">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${falta}</div>${editar ? confirmaFalta(p.c) : ''}`;
    };
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
    // Admin: o passo Escala já abre e fecha; o bloco vem sempre aberto, sem título.
    const semTitulo = editar;
    const aberto = semTitulo || ajuste || duplasAbertas.has(g.data);
    const caixa = 'gira-sec';
    // Depois do sorteio, os botões e o aviso de publicada (ou Publicar) ficam à vista; as duplas vêm recolhidas
    // e tocar no título (ou em Ver mais) expande e recolhe.
    const titDobra = (ab) => `<button class="grp-h dobra" data-act="dobrarduplas" aria-expanded="${ab}">${tituloSorteio(true)}<span class="count"><span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
    const recolhido = temDuplas && !aberto;
    // Depois de sorteado, "Cancelar sorteio" (junto de Remanejar faltas e Ajuste manual) apaga as duplas e volta ao Sortear.
    // Com a escala publicada, o sorteio não se cancela mais (para isso, oculte a escala).
    const cancelaOk = temDuplas && sortearOk && !estado.salvando && !g.publicada;
    let h = `<div class="${caixa}">${semTitulo ? '' : recolhido ? titDobra(false) : `<div class="grp-h">${temDuplas && !ajuste ? titDobra(true) : tituloSorteio(temDuplas)}</div>`}
      ${temDuplas ? acoesSorteio(g, sortearOk && !g.travada && !estado.salvando, editar && !passada, manual, cancelaOk) : ''}
      ${estado.confirm === 'rem:' + g.data ? confirmaRemenajo() : ''}
      ${cancelaOk && estado.confirm === 'csort:' + g.data ? confirmaSorteio(`<b>Cancelar o sorteio?</b> Todas as duplas são apagadas (também as fixadas). Tudo volta a como estava antes de sortear, com o botão Sortear.`, 'cancelsort', 'Sim, cancelar') : ''}
      ${temDuplas ? '' : !sortearOk ? '' : estado.confirm === 'sort:' + g.data
        ? confirmaSorteio('<b>Tem certeza que quer sortear?</b> O app monta as duplas agora.', 'sortear', '🎲 Sortear')
        : `<button class="btn primary btn-grande" data-act="askdel" data-k="sort:${g.data}">🎲 Sortear</button>`}
      ${editar && temDuplas ? (g.publicada
        ? `<div class="pub-linha"><span class="pub-ok">📢 Escala publicada</span><button class="btn small" data-act="despublicar">Ocultar</button></div>`
        : `<button class="btn btn-grande pub-bt" data-act="publicar"><span class="pub-tit">📢 Publicar escala</span><span class="pub-sub">Só os admins veem o sorteio até publicar</span></button>`) : ''}
      ${!temDuplas && manual && !passada ? `<div class="row"><button class="btn small" data-act="manual" aria-pressed="true">Concluir ajuste</button></div>` : ''}`;
    if (recolhido) return h + `${botaoDobrar(false)}</div>`;
    if (manual) h += `<p class="muted" style="margin:0;font-size:.88rem">${passada ? '<b>Gira passada:</b> registre como foi. ' : ''}Adicione ou tire cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone, e o médium de passe pode ir com qualquer médium.</p>`;
    if (validos.length && semPasse.length) h += `<div class="warnbox">${semPasse.map(nome).map(esc).join(', ')} ainda sem médium.${manual ? ' Adicione no médium com quem foi.' : sortearOk ? (ps.some((p) => p.funcao === 'medium' && p.experiente) ? ' Use o Ajuste manual.' : ' Marque no Perfil → Pessoas quais médiuns podem ter passe junto.') : ''}</div>`;
    if (!temDuplas && !manual) {
      // Ainda não sorteado: sem Ajuste manual e sem "Ver mais"; só o resumo e quem está fora (licença etc.).
      return h + `${!lista.length ? '<p class="muted" style="margin:0">Nenhum médium presente.</p>' : sortearOk ? '' : '<p class="muted" style="margin:0">As duplas ainda não foram sorteadas.</p>'}${semTitulo ? '' : blocosFora(ps, g)}</div>`;
    }
    if (!lista.length) h += `<p class="muted">Nenhum médium presente.</p>`;
    else {
      const tirar = (k, i) => (manual ? `<button class="lock rm" data-act="remover" data-k="${k}" data-i="${i}" title="Tirar deste médium" aria-label="Tirar">✕</button>` : '');
      h += `<div class="pairs">`;
      lista.forEach((x) => {
        h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)} ${seloFora(x.m.id)}</span>${editar && !passada && !manual && !seloFora(x.m.id) ? botaoFalta(x.m.id) : '<span></span>'}${editar ? confirmaFalta(x.m.id) : ''}<div class="cams">`;
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
    // Admin: Faltaram e Ausentes ficam só em Quem não vem.
    return h + `${semTitulo ? '' : blocosFora(ps, g)}${ajuste || semTitulo ? '' : botaoDobrar(true)}</div>`;
  };

  // O que vem entre o bloco de recados/atendimentos e os blocos informativos, conforme quem vê e o estado da gira.
  let escala = '';
  let rodape = '';
  if (!ps.length) {
    rodape = `<div class="card empty"><h2>Nenhuma pessoa cadastrada</h2><p class="muted">${pode('pessoas:editar') ? 'Cadastre a corrente no Perfil → Pessoas.' : 'Um admin precisa cadastrar a corrente.'}</p>
      ${pode('pessoas:editar') ? '<button class="btn primary" data-act="goto" data-tab="perfil">Cadastrar pessoas</button>' : ''}</div>`;
  } else if (!editar && !existe) {
    // Dia sem gira: não há escala para avisar; o cabeçalho mostra a data e o que está na agenda.
    rodape = '';
  } else if (encerrada || (g.evento && !editar)) {
    escala = '';
  } else if (!pode('escala:completa') && !g.evento) {
    escala = resultado(g);
  } else if (!editar) {
    // Quem vê a escala completa sem editar (o admin tem os passos): a presença e, antes de publicar, o sorteio.
    escala = secaoPresenca();
    if (!g.evento && !(temDuplas && g.publicada && !admin)) escala += secaoSorteio();
  }

  setTimeout(atualizarJanela, 0);
  const publicada = !!(temDuplas && g.publicada);
  const tituloEd = estado.tituloTxt?.data === g.data ? estado.tituloTxt.texto : null;
  return montarNova({
    g, ps, ano, admin, editar, existe, encerrada, temDuplas, publicada, whats, rodape,
    calendario: seletorData(g), marcas: marcasDosDias(),
    escala: editar ? '' : escala,
    presenca: editar ? secaoPresenca() : '',
    sorteio: editar && !g.evento ? secaoSorteio() : '',
    sugestao: editar && !g.evento ? blocoSugestao(ps, g) : '',
    funcoes: editar && !g.evento ? blocoFuncoes(ps, g, temDuplas) : '',
    trava: editar ? htmlTrava() : '',
    entidade: seletorEntidade(g.entidade, g.entidadeNome || '', publicada),
    orixa: temOrixa(g) ? seletorOrixa(g, publicada) : '',
    avisoEntidade: avisoEntidade(ps, g, editar, admin),
    titulo: `<input type="text" id="gira-titulo" data-act="giratitulo" data-d="${esc(g.data)}" maxlength="120" enterkeyhint="done" aria-label="Nome da gira" placeholder="${esc(tituloAutomaticoGira(g))}" value="${esc(tituloEd ?? tituloGira(g))}">`,
    atend: g.evento ? campoParticipantes(g) : camposAtend(g),
    encerrar: editar ? botaoEncerrar(g) + (estado.confirm === 'enc:' + g.data ? caixaEncerrar() : '') : '',
    encerradaQuadro: encerrada ? blocoEncerrada(ps, g, { resumo: admin ? pode('escala:completa') : whats, reabrir: admin }) : '',
    resumoOk: encerrada && (admin ? pode('escala:completa') : whats),
    realizado: !g.evento && temDuplas && (g.publicada || encerrada) ? blocoImagemEscala(false) : '',
    eventoImagem: g.evento && !encerrada && (editar || whats) ? botaoImagemEvento(g, ps) : '',
    previa: editar ? botaoWhatsLimpeza(g) : '',
  });
}

// ---------- ações ----------
export const cliques = {
  ...cliquesResumo,
  ...cliquesConduta,
  ...cliquesFilaGeral,
  ...cliquesAtrasos,
  ...cliquesAno,
  ...cliquesNova,
  // Resumo pelo Compartilhar (data-de="comp"): só abre (não fecha se já estiver aberto) e rola até ele.
  rsabrir(el) {
    if (el.dataset.de === 'comp') {
      fecharCompartilhar();
      if (estado.resumo?.data !== el.dataset.d) cliquesResumo.rsabrir(el);
      setTimeout(() => document.querySelector('.enc-quadro')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    cliquesResumo.rsabrir(el);
  },
  dobrarcard(el) { const k = el.dataset.k; if (abertos.has(k)) abertos.delete(k); else abertos.add(k); avisar(); },
  // Gira criada já vem com a próxima turma da limpeza (depois da última gira encerrada, pulando turmas vazias).
  criargira() {
    const d = giraAtual().data;
    abertos.clear(); abertos.add('oracoes'); duplasAbertas.delete(d);
    const t = proximaTurma(estado.pessoas, girasLista(), d);
    // Quem tinha ausência antecipada nesta data já entra Ausente (o servidor faz o mesmo e apaga as antecipadas).
    const aus = (estado.ausPrevias || []).filter((x) => x.data === d).map((x) => x.pessoaId);
    if (estado.ausPrevias) estado.ausPrevias = estado.ausPrevias.filter((x) => x.data !== d);
    editarGira({ entidade: '', ...(t ? { limpeza: t } : {}), ...(aus.length ? { presenca: Object.fromEntries(aus.map((id) => [id, 'a'])) } : {}) });
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
  async ausprevadd() {
    const id = document.getElementById('ausprev-pessoa')?.value;
    if (!id) { toast('Escolha a pessoa.'); return; }
    if (await acaoAusPrevia(giraAtual().data, id, true)) toast(`Ausência de ${nome(id)} marcada.`);
  },
  async ausprevtira(el) { if (await acaoAusPrevia(giraAtual().data, el.dataset.id, false)) toast(`Ausência de ${nome(el.dataset.id)} retirada.`); },
  // Turma da limpeza (passo Preparar): escolher grava.
  limpturma(el) {
    editarGira({ limpeza: el.dataset.v ? Number(el.dataset.v) : null });
    avisar();
  },
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
  giradia(el) { prefs.data = el.dataset.d; salvarPrefs(); avisar(); },
  girames(el) { cal.mes = mesMais(mesDoCalendario(), Number(el.dataset.v)); cal.ref = prefs.data; avisar(); },
  encpend(el) {
    const n = Number(el.dataset.n);
    toast(`Não dá para encerrar: ${n} pessoa${n > 1 ? 's' : ''} ainda com presença pendente. Marque Presente, Falta ou Ausente.`);
    document.querySelector('.pres.pend')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  encerrar() {
    const g = giraAtual();
    if (g.evento) {
      const input = document.getElementById('ev-participantes');
      const v = (input?.value || '').trim() || '0';
      if (!/^\d+$/.test(v) || Number(v) > 100000) { toast('Informe um total válido de participantes.'); input?.focus(); return; }
      estado.confirm = null;
      encerrarGira({ participantes: Number(v) });
      return;
    }
    const at = {};
    for (const [k, t] of ATEND) {
      const v = (document.getElementById('at-' + k)?.value || '').trim() || '0';   // em branco = 0
      if (!/^\d+$/.test(v)) { toast(`Número inválido em ${t}.`); document.getElementById('at-' + k)?.focus(); return; }
      at[k] = Number(v);
    }
    estado.confirm = null;
    encerrarGira({ atendimentos: at });
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
  // Passo Escala: grava a função do dia escolhida no combo; ✕ na lista volta a pessoa para a função do cadastro.
  fnok() {
    const r = estado.funcDia;
    estado.funcDia = null;
    if (r) gravarFuncao(r.id, r.papel);
  },
  fnvolta(el) { if (estado.funcDia?.id === el.dataset.id) estado.funcDia = null; gravarFuncao(el.dataset.id, 'cad'); },
  cancelsort: () => { estado.confirm = null; cancelarSorteio(); },
  faltaask(el) { estado.faltaConf = el.dataset.id; avisar(); },
  faltacancel() { estado.faltaConf = null; avisar(); },
  // Confirmou: presença vira Falta e a escala é refeita (Remanejar faltas).
  async faltaok(el) {
    const id = el.dataset.id;
    estado.faltaConf = null;
    const g = giraAtual();
    editarGira({ presenca: { ...(g.presenca || {}), [id]: 'f' } });
    if (g.travada) { toast(`Falta de ${nome(id)} marcada. A escala não mudou.`); avisar(); return; }
    await remanejar(`Falta de ${nome(id)} marcada. Escala refeita.`);
  },
  // Bloco da oferenda: a pessoa assume (ou devolve) uma unidade do item.
  giraofmais(el) { doarDaGira(el.dataset.id, 1); },
  giraofmenos(el) { doarDaGira(el.dataset.id, -1); },
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
  // Bloco Eventos: só os de hoje ↔ todos.
  evsmais() { estado.evsTodos = !estado.evsTodos; avisar(); },
  async eventoimagem() {
    fecharCompartilhar();
    const g = giraAtual();
    if (!g.evento || g.encerrada) return;
    const ps = daGira(pessoasComSaidas(), g).filter(contaNaPresenca);
    if (!imagemEventoPronta(g, ps)) {
      estado.eventoImgErro = null;
      prepararImagemEvento(g, ps);
      return;
    }
    const { blob, nome: arquivo } = estado.eventoImg;
    if (!podeCompartilharImagem(blob, arquivo)) {
      baixar(blob, arquivo);
      toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
      return;
    }
    if (!(await compartilharImagem(blob, arquivo, 'Evento da gira'))) toast('Não deu para compartilhar daqui. A imagem permanece disponível para baixar.');
  },
  escimg() { estado.escImgVer = true; atualizarJanela(); },
  // Orações (admin): janela com a prévia da imagem; "Compartilhar" abre a lista do aparelho (WhatsApp); sem ela, salva.
  oraabrir() { fecharCompartilhar(); estado.oraJanela = true; atualizarJanela(); prepararOracoes(); },
  orafechar() { estado.oraJanela = null; atualizarJanela(); },
  orasalvar() {
    if (!imagemOracoesPronta()) return;
    baixar(estado.oraImg.url, estado.oraImg.nome);
    toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
  },
  async oracompartilhar() {
    if (!imagemOracoesPronta()) return;
    if (await compartilharImagem(estado.oraImg.blob, estado.oraImg.nome, 'Pedidos de oração')) cliques.orafechar();
    else toast('Não deu para compartilhar daqui. Use Salvar imagem.');
  },
  // Aniversariantes do dia (root): janela com a prévia da imagem; "Compartilhar" abre a lista do aparelho; sem ela, salva.
  niverabrir() { estado.niverJanela = true; atualizarJanela(); prepararNiver(); },
  niverfechar() { estado.niverJanela = null; atualizarJanela(); },
  niversalvar() {
    if (!imagemNiverPronta()) return;
    baixar(estado.niverImg.url, estado.niverImg.nome);
    toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
  },
  async nivercompartilhar() {
    if (!imagemNiverPronta()) return;
    if (await compartilharImagem(estado.niverImg.blob, estado.niverImg.nome, 'Aniversariantes de hoje')) cliques.niverfechar();
    else toast('Não deu para compartilhar daqui. Use Salvar imagem.');
  },
  escimgfechar() { estado.escImgVer = null; atualizarJanela(); },
  // Janela do WhatsApp (texto ou imagem).
  waabrir() { fecharCompartilhar(); estado.waJanela = true; atualizarJanela(); prepararImagem(); },
  wafechar() { estado.waJanela = null; atualizarJanela(); },
  // Prévia da gira: abre com o texto pronto; o link do Enviar acompanha o que for escrito.
  pvabrir() { fecharCompartilhar(); estado.previaGira = { texto: textoLimpeza(estado.pessoas, giraAtual(), girasLista()) }; atualizarJanela(); },
  pvfechar() { estado.previaGira = null; atualizarJanela(); },
  pvenviar() { setTimeout(cliques.pvfechar, 0); },
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
    compartilharImagem(blob, arq, 'Escala da gira')
      .then((ok) => (ok ? cliques.wafechar() : toast('Não deu para compartilhar daqui. Tente pelo texto.')));
  },
  wafmt(el) { prefs.fmt = el.dataset.v; salvarPrefs(); atualizarJanela(); },
  status(el) { gravarPresenca(el.dataset.id, el.value); },
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

function doarDaGira(itemId, delta) {
  const item = (estado.oferendas?.oferendas || []).flatMap((of) => of.itens).find((i) => i.id === itemId);
  if (!item) return;
  const minha = item.doacoes.find((d) => d.chave === estado.oferendas.eu.chave)?.quantidade || 0;
  doarItem(item.id, Math.max(0, minha + delta));
}

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
  if ((valor === 'f' || valor === 'a') && !g.travada) delete pa[id];   // com a trava, a pessoa segue na escala como foi sorteada
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
  if ((c.valor === 'f' || c.valor === 'a') && !g.travada) delete pa[c.id];
  editarGira({ presenca: pr, papeis: pa });
  toast(`${p.nome}: ${STATUS[c.valor]}.`);
  avisar();
}

export const mudancas = {
  ...mudancasConduta,
  ...mudancasAno,
  // “Não poderei ir” usa o valor de presença 'a' (Ausente) no cadastro da gira.
  // A própria pessoa só pode declarar até a véspera.
  async ausencia(t) {
    if (t.value !== 'a') return;
    if (!confirm('Registrar ausência antecipada?\nSua presença será marcada como “Ausente” no cadastro desta gira. Depois disso, só a ' + config().responsavel + ' consegue alterar.')) { t.value = 'pend'; return; }
    await declararAusencia();
  },
  minhaentidade(t) { t.blur(); escolherEntidade(t.value); },
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
  // Passo Escala: escolher a pessoa traz a função do dia dela; trocar a função liga o OK.
  fnpessoa(t) {
    const g = giraAtual();
    const p = t.value && estado.pessoas.find((x) => x.id === t.value);
    estado.funcDia = p ? { data: g.data, id: p.id, papel: papelDe(p, g) } : null;
    avisar();
  },
  fnpapel(t) { if (estado.funcDia) { estado.funcDia.papel = t.value; avisar(); } },
  rappapel(t) { if (estado.presRapida) estado.presRapida.papel = t.value; },
  evento(t) { editarGira({ evento: t.checked }); avisar(); },
  orixagira(t) { editarGira({ orixa: t.value }); avisar(); },
  // Trocar a entidade volta o nome da gira ao automático, para não ficar o nome da entidade anterior.
  entidade(t) { estado.tituloTxt = null; editarGira({ entidade: t.value, entidadeNome: t.selectedOptions[0]?.dataset.alias || '', ...(giraAtual().titulo ? { titulo: '' } : {}) }); avisar(); },
  giratitulo(t) {
    const g = giraAtual();
    const texto = t.value.replace(/\s+/g, ' ').trim();
    const titulo = texto === tituloAutomaticoGira(g) ? '' : texto;
    estado.tituloTxt = null;
    if (titulo !== (g.titulo || '')) editarGira({ titulo });
    avisar();
  },
  data(t) { if (t.value) { prefs.data = t.value; salvarPrefs(); avisar(); } },
  async recadogira(t) {
    const texto = t.value.replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();
    const data = t.dataset.d;
    if (texto !== (estado.giras[data]?.recado || '')) await salvarRecado(texto);
    // Se não salvou, o texto fica no campo para tentar de novo.
    if ((estado.giras[data]?.recado || '') === texto) { estado.recadoTxt = null; avisar(); }
  },
  // Trava da escala (título da Presença).
  travaesc(t) { travarEscala(t.checked); },
  // Atendimentos (gira aberta): salva sozinho; em branco = 0.
  atend(t) {
    const g = giraAtual();
    const v = t.value.trim() || '0';
    if (!/^\d+$/.test(v)) { toast('Número inválido.'); t.value = Number(g.atendimentos?.[t.dataset.k]) || 0; return; }
    editarGira({ atendimentos: { ...Object.fromEntries(ATEND.map(([k]) => [k, 0])), ...(g.atendimentos || {}), [t.dataset.k]: Number(v) } });
  },
  // Eventos registram participantes, sem contagem de atendimentos.
  participantes(t) {
    const g = giraAtual();
    const v = t.value.trim() || '0';
    if (!/^\d+$/.test(v) || Number(v) > 100000) {
      toast('Informe um total válido de participantes.');
      t.value = Number(g.participantes) || 0;
      return;
    }
    editarGira({ participantes: Number(v) });
  },
  // Quem estava Pendente: pede confirmação antes de gravar.
  status(t) {
    const g = giraAtual();
    const p = estado.pessoas.find((x) => x.id === t.dataset.id);
    if (p && presencaDe(p, g) === 'pend' && t.value !== 'pend') {
      estado.confPres = { id: t.dataset.id, valor: t.value };
      t.blur();   // fecha a lista do combo (no celular ela ficava por cima da janela)
      avisar();   // o combo volta para Pendente até confirmar
      atualizarJanela();   // na aba Geral (root no "Você nesta gira") o render não redesenha a janela
      return;
    }
    gravarPresenca(t.dataset.id, t.value);
  },
  // Cambone pode acompanhar mais de um médium; médium de passe fica com um só (sai do anterior).
  // Com a escala já publicada, quem entra no Ajuste manual fica marcado como remanejado (como no Remanejar faltas).
  addcam(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ pares: [...(g.pares || []), { m: t.dataset.m, c: t.value, fixo: false, remanejado: !!g.publicada }], ...saiDoSuporte(g, t.value) });
    avisar();
  },
  addpasse(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ passes: [...(g.passes || []).filter((p) => p.c !== t.value), { m: t.dataset.m, c: t.value, fixo: false, remanejado: !!g.publicada }] });
    avisar();
  },
  troca(t) {
    const k = t.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +t.dataset.i && p.c !== t.value ? { ...p, c: t.value, remanejado: !!p.remanejado || !!g.publicada } : p)), ...(k === 'pares' ? saiDoSuporte(g, t.value) : {}) });
    avisar();
  },
};
