// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, opcoesGira, giraEspecial, nomeGira, nomeEntidadeGira, contaNaPresenca, pendentesDaGira, ORIXAS, temOrixa, orixaDaGira, TURMAS_LIMPEZA, temLimpeza, limpezaDaGira, proximaTurma, status, presencaDe, papelDe, naCorrenteEm, foraDaLinha, licencaEm, presente, cambonaHoje, paresPorMedium, escalaDaGira, custos, pessoasDaGira, linhaDaEntidade } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, visaoAtiva, pessoasOrd, nome, girasLista, giraAtual, editarGira, sortear, remanejar, encerrarGira, reabrirGira, mudarDataGira, cancelarSorteio, declararAusencia, acaoAusPrevia, publicarEscala, travarEscala, salvarRecado, acaoOracoes, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar, hoje, pd } from '../util.js';
import { textoWhats } from '../exportar.js';
import { gerarImagemOracoes } from '../imagemOracoes.js';
import { gerarImagem } from '../imagem.js';
import { gerarImagemEvento } from '../imagemEvento.js';
import { botaoResumo, painelResumo, cliquesResumo } from '../compartilharResumo.js';
import { dadosResumo, textoLimpeza } from '/shared/resumoGira.js';
import { banhosDaGira } from '/shared/banhos.js';
import { htmlStatus, abertos, cabDobra, caixaPendente, ICONE_WHATS } from './giraComum.js';
import { blocoEu } from './giraEu.js';
import { sugAbertas, blocoSugestao } from './giraSugestao.js';
import { cardSemana, cardOracoes, cardAulaCurimba, cardCompromissos } from './giraTopo.js';
import { blocoLimpeza, blocoRecado, campoRecado, blocoLicenca, blocoBanho, blocoAusPrevia, blocoAusencia, blocoFaltas, avisoEntidade, contagemPresentes } from './giraInformacoes.js';
import { duplasAbertas, botaoDobrar, acoesSorteio, tituloSorteio, confirmaSorteio, confirmaRemenajo, titDobra, linhaEscala } from './giraEscala.js';
export { enviarOracao } from './giraTopo.js';

const classeStatus = (s) => (s === 'a' || s === 'f' || s === 'lic' ? 'aus' : s === 'na' ? 'na' : s === 'sup' ? 'nc' : s === 'pend' ? 'pend' : '');
// Atendimentos da gira: o admin preenche na gira aberta (⚙️ Evento, salva sozinho); na encerrada, todos veem.
const ATEND = [['normal', 'Atendimento'], ['passe', 'Passe'], ['preferencial', 'Preferencial']];
const camposAtend = (g) => `<div class="atend-campos">${ATEND.map(([k, t]) => `<label class="field">${t}<input type="number" inputmode="numeric" min="0" step="1" id="at-${k}" data-act="atend" data-k="${k}" value="${Number(g.atendimentos?.[k]) || 0}"></label>`).join('')}</div>`;
const numerosAtend = (a) => `<div class="atend-nums">${ATEND.map(([k, t]) => `<div class="at-${k}"><b>${Number(a?.[k]) || 0}</b><span>${t}</span></div>`).join('')}</div>`;
const campoParticipantes = (g) => `<div class="ev-participantes-bloco">
  <span class="ev-participantes-titulo">Total de participantes</span>
  <input class="ev-participantes-input" type="number" inputmode="numeric" min="0" max="100000" step="1" id="ev-participantes" data-act="participantes" aria-label="Total de participantes do evento" value="${Number(g.participantes) || 0}">
  <span class="ev-participantes-salvo">✓ Salvo automaticamente</span>
</div>`;
// Campo bloqueado do Evento fechado: igual aos combos da gira aberta, mas só informa.
const campoFixo = (v) => `<select disabled title="Gira encerrada: para mudar, reabra a gira"><option>${esc(v || '—')}</option></select>`;
const seletorOrixa = (g) => `<select data-act="orixagira" aria-label="Orixá"><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === g.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

function chaveImg() {
  return textoWhats(estado.pessoas, giraAtual(), 'lista', girasLista());
}
function podeCompartilhar() {
  try {
    return !!(estado.img && navigator.canShare && navigator.canShare({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })] }));
  } catch { return false; }
}

// Lista das linhas; mantém um valor antigo (texto livre) se a gira já tinha um.
function seletorEntidade(atual, nomeAtual = '') {
  const conhecida = linhaDaEntidade(atual);
  const especial = giraEspecial(atual);
  const valor = nomeGira(atual);
  const antigo = valor && !conhecida && !especial ? `<option value="${esc(valor)}" selected>${esc(valor)} (fora da lista)</option>` : '';
  return `<select id="f-ent"><option value="" ${!valor ? 'selected' : ''}>— escolha —</option>${antigo}
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

// Quadro "Gira encerrada" (para todos, só informa): atendimentos e presença.
function blocoEncerrada(ps, g) {
  const resumo = dadosResumo(estado.pessoas, g);
  return `<div class="enc-quadro"><h3 class="enc-titulo"><span aria-hidden="true">✓</span> ${g.evento ? 'Evento encerrado' : 'Gira encerrada'}</h3>
    ${g.evento ? numeroParticipantes(g) : numerosAtend(g.atendimentos)}
    ${contagemPresentes(ps, g, resumo)}</div>`;
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

// Encerrar: só confirma — os atendimentos já estão nos campos da parte ⚙️ Evento.
function caixaEncerrar() {
  return `<div class="infobox enc"><span><b>Encerrar a gira?</b> Confira os atendimentos acima (em branco conta 0).</span>
    <span class="muted" style="font-size:.85rem">Quem estava para cambonar e não ficou com nenhum médium, e médium de passe sem médium, vão para o <b>Suporte</b>. Depois disso a escala não muda até ser reaberta; ao reabrir, essas pessoas voltam para a lista.</span>
    <span class="row"><button class="btn small primary" data-act="encerrar">Encerrar</button><button class="btn small" data-act="cancelenc">Cancelar</button></span></div>`;
}

// Próxima quarta-feira (hoje, se hoje for quarta).
// Gira anterior, próxima gira e o calendário para buscar outra data (para todos).
function navegarGiras(g) {
  const anterior = dataGiraAdjacente(g.data, -1);
  const proxima = dataGiraAdjacente(g.data, 1);
  return `<div class="nav-gira">
    <button class="btn nav-seta" data-act="giraanterior" title="Evento anterior" aria-label="Ir para o evento anterior" ${anterior ? '' : 'disabled'}>←</button>
    <span class="nav-data"><span aria-hidden="true">📅</span> ${esc(dLong(g.data))}</span>
    <button class="btn nav-seta" data-act="proximoevento" title="Próximo evento" aria-label="Ir para o próximo evento" ${proxima ? '' : 'disabled'}>→</button>
    <label class="btn nav-cal" title="Escolher outra data"><span aria-hidden="true">📅</span><input type="date" id="f-data" value="${esc(g.data)}" aria-label="Escolher outra data"></label>
  </div>`;
}

function dataGiraAdjacente(data, direcao) {
  const datas = girasLista()
    .filter(g => g != null)
    .map((g) => g.data)
    .filter((d) => direcao < 0 ? d < data : d > data)
    .sort();
  return direcao < 0 ? datas[datas.length - 1] || '' : datas[0] || '';
}

function irParaGiraAdjacente(direcao) {
  const data = dataGiraAdjacente(prefs.data, direcao);
  if (!data) return;
  prefs.data = data;
  salvarPrefs();
  avisar();
}

function proximaQuarta() {
  const d = pd(hoje());
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Quem está logado tem o bloco "Você nesta gira" (lá vai o aviso de pendente).
const temBlocoEu = () => !!(estado.me?.pessoaId && estado.pessoas.some((x) => x.id === estado.me.pessoaId));

// Acesso da corrente: com a escala publicada, a imagem dela fica no card da gira (blocoImagemEscala);
// aqui só os avisos de quando ainda não há escala. (A corrente só recebe as duplas depois de publicadas.)
function resultado(g) {
  const { lista } = paresPorMedium(estado.pessoas, g);
  const comDuplas = lista.some((x) => x.cams.length || x.passes.length);
  if (comDuplas) return '';
  return temBlocoEu() ? '' : `<div class="card">${caixaPendente(g)}</div>`;
}

// ---------- janela do WhatsApp das orações: prévia da imagem, Compartilhar e Salvar ----------
const chaveOracoes = () => JSON.stringify((estado.oracoes || []).map((o) => [o.id, o.texto, o.reacoes || 0]));
const imagemOracoesPronta = () => !!(estado.oraImg && estado.oraImg.key === chaveOracoes());
async function prepararOracoes() {
  if (imagemOracoesPronta() || estado.oraGerando) return;
  estado.oraGerando = true;
  const key = chaveOracoes();
  try {
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

// Pedido de oração: até 3 linhas.

export function render() {
  if (prefs.tab === 'agenda') return renderGira();
  if (visaoAtiva() === 'curimba') return `<section class="panel">${cardAulaCurimba()}${cardSemana({ ocultarAvisos: true })}</section>`;
  if (visaoAtiva() === 'alunos') return `<section class="panel">${cardSemana()}</section>`;
  const g = giraAtual();
  const eu = estado.me?.pessoaId && (estado.giras[g.data] || licencaEm(estado.pessoas.find((x) => x.id === estado.me.pessoaId) || {}, g.data)) ? blocoEu(g) : '';
  return `<section class="panel">${eu}${cardAulaCurimba()}${cardCompromissos()}${cardSemana()}${cardOracoes()}</section>`;
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
    return `<section class="panel"><div class="card card-novo adm">
      <div class="datehead"><span class="eyebrow">${esc(dLong(g.data))}</span><span class="dia gira-nome">Nenhuma gira nesta data</span></div>
      <div class="row">${navegarGiras(g)}</div>
      <button class="btn primary btn-grande" data-act="criargira">＋ Adicionar evento</button>
      ${g.data >= hoje() ? blocoAusPrevia(ps, g) : ''}</div></section>`;
  }
  const { lista, validos, passesV, semPasse } = paresPorMedium(estado.pessoas, escalaDaGira(g));
  const temDuplas = !g.evento && (validos.length || passesV.length);
  // WhatsApp da escala (desabilitado sem sorteio): para o admin, na parte ⚙️ Evento; para quem só consulta, no card da gira.
  const whats = pode('escala:completa') && existe && !g.evento;
  // Na aba Gira ficam os compromissos e o evento selecionado; os avisos pessoais ficam em Geral.
  // Admin: os comandos do evento ficam na parte "⚙️ Evento" do card do admin, não no card da gira.
  // Aberta: entidade, orixá, turma da limpeza, atendimentos, WhatsApp (escala e limpeza), Alterar data e Encerrar gira.
  // Encerrada: gira e orixá só informam (bloqueados), Compartilhar a escala, Compartilhar resumo e Reabrir gira.
  const dataAnterior = dataGiraAdjacente(g.data, -1);
  const dataProxima = dataGiraAdjacente(g.data, 1);
  const dataEvento = pd(g.data);
  const dataLabel = `${dataEvento.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))}, ${dataEvento.getDate()}/${dataEvento.getMonth() + 1}`;
  const cabEvento = `<div class="grp-h"><h2>⚙️ Evento</h2><div class="ev-nav-adm">
    <button class="btn ev-seta-adm" data-act="giraanterior" title="Evento anterior" aria-label="Ir para o evento anterior" ${dataAnterior ? '' : 'disabled'}>←</button>
    <label class="ev-data-adm" title="${esc(dLong(g.data))} · Escolher outro dia: giras passadas ou futuras (numa data futura sem gira, dá para marcar as ausências)"><span aria-hidden="true">📅</span> ${esc(dataLabel)} <span class="seta" aria-hidden="true">▾</span><input type="date" data-act="irdata" value="${esc(g.data)}" aria-label="Ir para outro dia"></label>
    <button class="btn ev-seta-adm" data-act="proximoevento" title="Próximo evento" aria-label="Ir para o próximo evento" ${dataProxima ? '' : 'disabled'}>→</button>
  </div></div>`;
  const secaoEvento = !admin || !existe ? '' : encerrada
    ? `<div class="adm-sec adm-evento">${cabEvento}
      <div class="row">
        <label class="field grow">Gira / entidade do dia${campoFixo(nomeEntidadeGira(g))}</label>
        ${temOrixa(g) ? `<label class="field" style="flex:1 1 130px">Orixá${campoFixo(orixaDaGira(g))}</label>` : ''}
      </div>
      ${whats ? `<div class="adm-ev-wa">${botaoWhats(temDuplas, 'Compartilhar a escala')}</div>` : ''}
      <div class="adm-ev-bts">${pode('escala:completa') ? botaoResumo(g) : ''}<button class="btn small" data-act="reabrir">Reabrir gira</button></div>
      ${pode('escala:completa') ? painelResumo(g) : ''}</div>`
    : `<div class="adm-sec adm-evento">${cabEvento}
      <div class="row">
        <label class="field grow">Gira / entidade do dia${seletorEntidade(g.entidade, g.entidadeNome || '')}</label>
        <label class="ev-toggle"><input type="checkbox" data-act="evento" aria-label="Marcar esta atividade como evento" ${g.evento ? 'checked' : ''}><span>Evento</span></label>
        ${temOrixa(g) ? `<label class="field" style="flex:1 1 130px">Orixá${seletorOrixa(g)}</label>` : ''}
        ${!g.evento && temLimpeza(g) ? `<label class="field" style="flex:1 1 130px">Turma da limpeza<select data-act="limpezagira"><option value="">— nenhuma —</option>${TURMAS_LIMPEZA.map((t) => `<option value="${t}" ${Number(g.limpeza) === t ? 'selected' : ''}>Turma ${t}</option>`).join('')}</select></label>` : ''}
      </div>
      ${campoRecado(g)}
      ${avisoEntidade(ps, g, editar, admin)}
      <div class="atend-sec">${g.evento ? campoParticipantes(g) : `<span class="atend-tit">Atendidos nesta gira</span>${camposAtend(g)}`}</div>
      <div class="adm-ev-wa">${whats ? botaoWhats(temDuplas, 'Escala') : ''}${botaoWhatsLimpeza(g)}</div>
      <div class="adm-ev-bts">
        <button class="btn" data-act="mudardata" title="Alterar a data da gira (hoje: ${esc(dLong(g.data))})"><span aria-hidden="true">📅</span> Alterar data · ${esc(dDM(g.data))}</button>
        ${botaoTopo(g, editar, existe)}
      </div>
      ${estado.confirm === 'enc:' + g.data ? caixaEncerrar() : ''}</div>`;
  let h = `<section class="panel">
  <div class="card card-gira${existe && !encerrada ? ' aberta' : ''}">
    <div class="datehead"><div class="dh-linha">${g.evento && !encerrada ? botaoImagemEvento(g, ps) : `<span class="eyebrow">${esc(dLong(g.data))}</span>`}</div><span class="dia gira-nome">${g.evento ? `Evento${g.entidade ? ` · ${esc(nomeEntidadeGira(g))}` : ''}` : g.entidade ? (giraEspecial(g.entidade) ? esc(nomeEntidadeGira(g)) : `Gira de ${esc(nomeEntidadeGira(g))}`) : 'Gira'}</span>${orixaDaGira(g) ? `<span class="ent">Orixá: ${esc(orixaDaGira(g))}</span>` : ''}</div>
    <div class="row">
      ${navegarGiras(g)}
      ${whats && !admin ? `<div class="enc-linha">${botaoWhats(temDuplas)}${encerrada ? botaoResumo(g) : ''}</div>` : ''}
    </div>
    ${encerrada ? '' : blocoRecado(g)}
    ${encerrada ? '' : blocoLimpeza(g)}
    ${encerrada ? blocoEncerrada(ps, g) : ''}
    ${blocoBanho(g)}
    ${blocoAusencia(ps, g)}
    ${blocoFaltas(ps, g)}
    ${blocoLicenca(ps, g)}
    ${!g.evento && temDuplas && (g.publicada || encerrada) ? blocoImagemEscala() : ''}
    ${encerrada && whats && !admin ? painelResumo(g) : ''}
  </div>`;

  // Admin: o card do admin (com os comandos do evento) vai acima do card da gira; fecha() o põe no lugar.
  const iGira = h.indexOf('<div class="card card-gira');
  let iAdm = -1;
  const fecha = () => (iAdm < 0 ? h : h.slice(0, iGira) + h.slice(iAdm) + h.slice(iGira, iAdm)) + '</section>';
  const soEvento = () => { if (secaoEvento) { iAdm = h.length; h += `<div class="card adm adm-gira">${secaoEvento}</div>`; } };
  if (!ps.length) {
    soEvento();
    h = fecha().slice(0, -'</section>'.length);
    return h + `<div class="card empty"><h2>Nenhuma pessoa cadastrada</h2><p class="muted">${pode('pessoas:editar') ? 'Cadastre a corrente na aba Pessoas.' : 'Um admin precisa cadastrar a corrente.'}</p>
      ${pode('pessoas:editar') ? '<button class="btn primary" data-act="goto" data-tab="pessoas">Cadastrar pessoas</button>' : ''}</div></section>`;
  }
  if (!editar && !existe) {
    const completa = pode('escala:completa');
    return h + `<div class="card empty"><h2>Escala ainda não montada</h2><p class="muted">Não há escala salva para esta data.${completa ? ' Escolha outra data ou veja as giras no Histórico.' : ' Escolha outra data.'}</p>
      ${completa ? '<button class="btn" data-act="goto" data-tab="hist">Ver histórico</button>' : ''}</div></section>`;
  }
  if (encerrada) { soEvento(); setTimeout(atualizarJanela, 0); return fecha(); }
  if (g.evento && !editar) return h + '</section>';
  if (!pode('escala:completa') && !g.evento) return h + resultado(g) + '</section>';

  // presença
  const cont = (s) => ps.filter((p) => presencaDe(p, g) === s).length;
  const contPapel = (r) => ps.filter((p) => status(p, g) === r).length;
  const antesDoDia = g.pendentePadrao && g.data > hoje();
  const partes = [[cont('pend'), 'pendente', 'pendentes'], [cont('p'), 'presente', 'presentes'], [cont('f'), 'falta', 'faltas'], [cont('a'), 'ausente', 'ausentes'], [cont('lic'), 'de licença', 'de licença'], [contPapel('sup'), 'no suporte', 'no suporte'], [contPapel('na'), 'não atende', 'não atendem']]
    .filter(([n], i) => n || i === 1).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(' · ');
  // Admin: um card só (moldura dourada), onde ficam os comandos do evento — Evento, Presença, Sorteio de escala
  // e Sugestão Mi/Mãe Vê. A Presença fica sempre aberta com a escolha da pessoa; a lista inteira abre em "+ Ver lista".
  if (editar) {
    const ab = abertos.has('pres');
    iAdm = h.length;
    h += `<div class="card adm adm-gira">${secaoEvento}<div class="adm-sec"><div class="grp-h"><h2>📋 Presença</h2>${!g.evento && ((g.pares || []).length || (g.passes || []).length) ? `<label class="of-sw" title="Com a trava, marcar falta ou ausência não muda a escala"><input type="checkbox" role="switch" data-act="travaesc" ${g.travada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Trava</label>` : ''}</div>
      ${g.travada ? '<p class="muted" style="margin:0;font-size:.85rem">Escala travada: marcar falta ou ausência não muda a escala.</p>' : ''}
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
  h += `</div>`;   // fecha a Presença (no admin, só a parte; o card continua com o Sorteio e a Sugestão)

  if (g.evento) {
    h += '</div>';
    setTimeout(atualizarJanela, 0);
    return fecha();
  }

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
  // Admin: o Sorteio e a Sugestão são partes do card da Presença (fechado no fim, depois da Sugestão).
  const caixa = editar ? 'adm-sec' : `card${admin ? ' adm' : ''}`;
  const fimAdmin = () => (editar ? blocoSugestao(ps, g, temDuplas) + '</div>' : '');
  // Depois do sorteio, o bloco vem recolhido (só o título); tocar no título expande e recolhe.
  const titDobra = (ab) => `<button class="grp-h dobra" data-act="dobrarduplas" aria-expanded="${ab}">${tituloSorteio(true)}<span class="count"><span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
  if (temDuplas && !aberto) {
    h += `<div class="${caixa}">${titDobra(false)}</div>${fimAdmin()}`;
    setTimeout(atualizarJanela, 0);
    return fecha();
  }
  // Depois de sorteado, "Refazer sorteio" (junto de Remanejar faltas e Ajuste manual) apaga as duplas e volta ao Sortear.
  const cancelaOk = temDuplas && sortearOk && !estado.salvando;
  h += `<div class="${caixa}"><div class="grp-h">${temDuplas && !manual ? titDobra(true) : tituloSorteio(temDuplas)}</div>
      ${temDuplas ? acoesSorteio(g, sortearOk && !g.travada && !estado.salvando, editar && !passada, manual, cancelaOk) : ''}
      ${estado.confirm === 'rem:' + g.data ? confirmaRemenajo() : ''}
      ${cancelaOk && estado.confirm === 'csort:' + g.data ? confirmaSorteio(`<b>Refazer o sorteio?</b> Todas as duplas são apagadas (também as fixadas)${g.publicada ? ' e a escala deixa de ficar publicada' : ''}. Depois é só tocar em Sortear de novo.`, 'cancelsort', 'Sim, refazer') : ''}
      ${temDuplas ? '' : !sortearOk ? '' : estado.confirm === 'sort:' + g.data
        ? confirmaSorteio('<b>Tem certeza que quer sortear?</b> O app monta as duplas agora.', 'sortear', '🎲 Sortear')
        : `<button class="btn primary btn-grande" data-act="askdel" data-k="sort:${g.data}">🎲 Sortear</button>`}
      ${editar && temDuplas ? (g.publicada
        ? `<div class="pub-linha"><span class="pub-ok">📢 Escala publicada: todos veem o sorteio.</span><button class="btn small" data-act="despublicar">Ocultar</button></div>`
        : `<button class="btn btn-grande pub-bt" data-act="publicar"><span class="pub-tit">📢 Publicar escala</span><span class="pub-sub">Só os admins veem o sorteio até publicar</span></button>`) : ''}
      ${!temDuplas && manual && !passada ? `<div class="row"><button class="btn small" data-act="manual" aria-pressed="true">Concluir ajuste</button></div>` : ''}`;
  if (manual) h += `<p class="muted" style="margin:0;font-size:.88rem">${passada ? '<b>Gira passada:</b> registre como foi. ' : ''}Adicione ou tire cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone, e o médium de passe pode ir com qualquer médium.</p>`;
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
  h += blocosFora(ps, g);
  h += `${manual ? '' : botaoDobrar(true)}</div>`;
  }

  h += fimAdmin();
  setTimeout(atualizarJanela, 0);
  return fecha();
}

// Botão do WhatsApp no card da gira, abaixo do Encerrar gira: abre a janela para escolher texto ou imagem.
// Sem sorteio feito fica desabilitado (não há escala para mandar).
const botaoWhats = (ok, rotulo = 'WhatsApp') => (ok
  ? `<button class="btn btn-grande wa-bt" data-act="waabrir"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${rotulo}</button>`
  : `<button class="btn btn-grande wa-bt" disabled title="Faça o sorteio primeiro"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> ${rotulo}</button>`);
// Admin (⚙️ Evento): manda o aviso da turma da limpeza para o WhatsApp (abre o app já com a mensagem).
function botaoWhatsLimpeza(g) {
  if (g.evento || !temLimpeza(g) || !limpezaDaGira(estado.pessoas, g, girasLista())) return '';
  return `<a class="btn btn-grande wa-bt" title="Mandar a turma da limpeza no WhatsApp" href="https://wa.me/?text=${encodeURIComponent(textoLimpeza(estado.pessoas, g, girasLista()))}" target="_blank" rel="noopener"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Turma da limpeza</a>`;
}

// ---------- janela do WhatsApp: texto (abre o WhatsApp com a mensagem) ou imagem (compartilhar do aparelho) ----------
const imagemPronta = () => { const g = giraAtual(); return !!(estado.img && estado.img.data === g.data && estado.img.key === chaveImg()); };

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
function imagemEventoPronta(g, ps) {
  return !!(estado.eventoImg && estado.eventoImg.key === chaveImagemEvento(g, ps));
}
function botaoImagemEvento(g, ps) {
  const pronta = imagemEventoPronta(g, ps);
  const key = chaveImagemEvento(g, ps);
  if (!pronta && estado.eventoImgErro !== key) setTimeout(() => prepararImagemEvento(g, ps), 0);
  const gerando = estado.eventoImgGerando === key || (!pronta && estado.eventoImgErro !== key);
  return `<button class="btn small ev-wa" data-act="eventoimagem" ${gerando ? 'disabled' : ''} title="${gerando ? 'Preparando a imagem do evento' : 'Compartilhar a imagem do evento'}"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span>${gerando ? 'Preparando…' : 'WhatsApp'}</button>`;
}
async function prepararImagemEvento(g, ps) {
  const evento = dadosImagemEvento(g, ps);
  const key = chaveImagemEvento(g, ps);
  if (imagemEventoPronta(g, ps) || estado.eventoImgGerando === key || estado.eventoImgErro === key) return;
  estado.eventoImgGerando = key;
  try {
    const blob = await gerarImagemEvento(evento);
    const atual = giraAtual();
    const pessoasAtuais = pessoasOrd().filter((p) => contaNaPresenca(p) && naCorrenteEm(p, atual.data));
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
  dobrarcard(el) { const k = el.dataset.k; if (abertos.has(k)) abertos.delete(k); else abertos.add(k); avisar(); },
  // Gira nova já vem com a próxima turma da limpeza (depois da última gira encerrada, pulando turmas vazias).
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
  proximoevento() { irParaGiraAdjacente(1); },
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
  eventoimagem() {
    const g = giraAtual();
    if (!g.evento || g.encerrada) return;
    const ps = pessoasOrd().filter((p) => contaNaPresenca(p) && naCorrenteEm(p, g.data));
    if (!imagemEventoPronta(g, ps)) {
      estado.eventoImgErro = null;
      prepararImagemEvento(g, ps);
      return;
    }
    const { blob, nome: arquivo } = estado.eventoImg;
    const file = new File([blob], arquivo, { type: 'image/png' });
    let podeCompartilhar = false;
    try { podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { podeCompartilhar = false; }
    if (!podeCompartilhar) {
      baixar(blob, arquivo);
      toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
      return;
    }
    navigator.share({ files: [file], title: 'Evento da gira' })
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. A imagem permanece disponível para baixar.'); });
  },
  escimg() { estado.escImgVer = true; atualizarJanela(); },
  // Orações (admin): janela com a prévia da imagem; "Compartilhar" abre a lista do aparelho (WhatsApp); sem ela, salva.
  oraabrir() { estado.oraJanela = true; atualizarJanela(); prepararOracoes(); },
  orafechar() { estado.oraJanela = null; atualizarJanela(); },
  orasalvar() {
    if (!imagemOracoesPronta()) return;
    baixar(estado.oraImg.url, estado.oraImg.nome);
    toast('Imagem salva. Abra o WhatsApp e anexe a imagem no grupo.');
  },
  oracompartilhar() {
    if (!imagemOracoesPronta()) return;
    const { blob, nome: arq } = estado.oraImg;
    navigator.share({ files: [new File([blob], arq, { type: 'image/png' })], title: 'Pedidos de oração' })
      .then(() => cliques.orafechar())
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagem.'); });
  },
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

// A janela fica direto no <body> (fora da tela que é redesenhada), por cima de tudo.
let raizJanela = null;
function atualizarJanela() {
  const html = prefs.tab === 'agenda'
    ? janelaPresenca() || janelaData() || janelaWhats() || janelaFoto() || janelaEscala()
    : prefs.tab === 'gira' ? janelaFoto() || janelaOracoes() : '';
  if (!raizJanela) {
    if (!html) return;
    raizJanela = document.createElement('div');
    raizJanela.id = 'janela';
    document.body.appendChild(raizJanela);
    raizJanela.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && cliques[b.dataset.act]) cliques[b.dataset.act](b);
      else if (e.target.closest('.modal-fundo')) (estado.fotoVer ? cliques.fotofechar : estado.escImgVer ? cliques.escimgfechar : estado.oraJanela && e.target.classList.contains('modal-fundo') ? cliques.orafechar : e.target.classList.contains('modal-fundo') ? (estado.waJanela ? cliques.wafechar : estado.mudaData ? cliques.mdcancel : cliques.prescancel) : () => {})();
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
  // “Não poderei ir” usa o valor de presença 'a' (Ausente) no cadastro da gira.
  // A própria pessoa só pode declarar até a véspera.
  async ausencia(t) {
    if (t.value !== 'a') return;
    if (!confirm('Registrar ausência antecipada?\nSua presença será marcada como “Ausente” no cadastro desta gira. Depois disso, só a Michelle consegue alterar.')) { t.value = 'pend'; return; }
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
  evento(t) { editarGira({ evento: t.checked }); avisar(); },
  orixagira(t) { editarGira({ orixa: t.value }); avisar(); },
  entidade(t) { editarGira({ entidade: t.value, entidadeNome: t.selectedOptions[0]?.dataset.alias || '' }); avisar(); },
  data(t) { if (t.value) { prefs.data = t.value; salvarPrefs(); avisar(); } },
  // Data na parte ⚙️ Evento do card do admin: vai para o dia escolhido (como o 📅 da navegação).
  irdata(t) { mudancas.data(t); },
  async recadogira(t) {
    const texto = t.value.replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();
    const data = t.dataset.d;
    if (texto !== (estado.giras[data]?.recado || '')) await salvarRecado(texto);
    // Se não salvou, o texto fica no campo para tentar de novo.
    if ((estado.giras[data]?.recado || '') === texto) { estado.recadoTxt = null; avisar(); }
  },
  // Trava da escala (título da Presença).
  travaesc(t) { travarEscala(t.checked); },
  // Atendimentos (⚙️ Evento, gira aberta): salva sozinho; em branco = 0.
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
