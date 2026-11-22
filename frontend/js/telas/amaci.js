// Tela "Amaci": a apostila do orixá em primeiro lugar. De cima para baixo: o trono e o nome do orixá com a trilha dos 14
// (na ordem da apostila; o aluno só abre os liberados para a turma, os outros ficam tracejados); para o aluno, o cartão
// Hoje (confirmar a presença no terreiro, pela localização do celular) e Minha presença (todos os amacis da turma, com os
// retroativos para marcar); a apostila (recado da casa, ervas, velas, ponto riscado e fatores, texto literal); e, no fim,
// a Configuração de quem administra (visibilidade e orixás por turma, presenças e teste de localização do root).

import { estado, pode, visaoAtiva, carregarAmaci, acaoAmaci, confirmarPresencaAmaci, carregarEventosTipos, cadastrarAmaciPassado, acaoEventos, avisar } from '../estado.js';
import { esc, toast, hoje, dLong, dDM, dShort } from '../util.js';
import { emDemo } from '../auth.js';
import { ORIXAS, ordenarOrixas, ultimoLiberado, ORIENTACAO_LINHAS, ORIENTACAO_LETRAS, ORIENTACAO_VISIVEIS, TERREIRO, RAIO_TERREIRO_M, noTerreiro, distanciaM } from '/shared/amaci.js';

const NOME = Object.fromEntries(ORIXAS.map((o) => [o.k, o]));

// Estado só desta tela (volta ao padrão ao trocar de aba, como o estado.amaci).
const ui = {
  sel: '',              // orixá escolhido ('' = o último liberado)
  config: false,        // bloco ⚙️ Configuração do admin aberto (começa minimizado)
  turmas: new Set(),    // turmas abertas no bloco do admin
  editando: null,       // recado em edição: { orixa, texto }
  pres: false,          // bloco Presença do aluno aberto
  escolha: {},          // amaci de hoje → 'p' (Presente) ou 'a' (Ausente, o padrão)
  confirmando: false,   // pegando a localização / enviando
  presAdm: false,       // bloco Presença nos amacis do root aberto
  presTurma: '',        // turma escolhida no bloco do root ('' = a primeira)
  presEv: null,         // amaci aberto no bloco do root (um por vez; todos começam minimizados)
  presQ: null,          // quadradinho aberto no bloco do root: 'eventoId:p' (presentes) ou 'eventoId:a' (ausentes)
  novo: false,          // formulário "Cadastrar amaci que já passou" aberto (bloco do root)
  novoRasc: null,       // o que foi digitado no formulário (volta depois de um erro): { data, nome, tipo }
  novoMsg: null,        // resultado do cadastro, no próprio bloco: { ok: true, texto } ou { ok: false, texto }
  novoSalvando: false,  // cadastrando
  abrirNovo: null,      // amaci recém-cadastrado a abrir na lista quando ela voltar: { data, nome }
  excluir: null,        // amaci criado pelo root com o Excluir? aberto (id)
  excluindo: false,
  editar: null,         // amaci com o ✎ aberto no bloco do root: { id, data, nome } (o que foi digitado volta depois de um erro)
  editSalvando: false,
  adm: false,           // bloco ⚙️ Admin (Configuração + Presenças) aberto (começa minimizado)
  geo: null,            // teste de localização do root: { pegando } ou { ok, dist, prec } ou { erro }
  geoAberto: false,     // parte Testar localização da Configuração aberta
};
export function limpar() {
  ui.sel = '';
  ui.config = false;
  ui.turmas.clear();
  ui.editando = null;
  ui.pres = false;
  ui.escolha = {};
  ui.presAdm = false;
  ui.presTurma = '';
  ui.presEv = null;
  ui.presQ = null;
  ui.novo = false;
  ui.novoRasc = null;
  ui.novoMsg = null;
  ui.abrirNovo = null;
  ui.editar = null;
  ui.adm = false;
  ui.geo = null;
  ui.geoAberto = false;
}

const admin = () => pode('amaci:editar') && !!estado.amaci?.admin;
const ehAluno = () => visaoAtiva() === 'alunos';
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// Item: texto ou [título, [subitens]] (como na apostila).
const lista = (itens) => `<ul class="am-lista">${itens.map((t) => (Array.isArray(t) ? `<li>${esc(t[0])}${lista(t[1])}</li>` : `<li>${esc(t)}</li>`)).join('')}</ul>`;
const linhas = (s) => (s ? s.split('\n').length : 0);

// ---------- admin ----------
function cardAdmin(A) {
  const turmas = A.turmas || [];
  const corpo = turmas.length ? turmas.map((t) => {
    const lib = ordenarOrixas(t.orixas);
    const aberta = ui.turmas.has(t.id);
    const ate = lib.length ? ` · até ${esc(NOME[lib.at(-1)].curto)}` : '';
    return `<div class="am-turma">
      <button class="am-turma-h" data-act="amturma" data-id="${t.id}" aria-expanded="${aberta}">
        <b>${esc(t.nome)}</b><span class="am-turma-x">${lib.length} de ${ORIXAS.length}${ate}<span class="seta" aria-hidden="true">${aberta ? '▴' : '▾'}</span></span>
      </button>
      ${aberta ? `<div class="am-chips">${ORIXAS.map((o) => `<label class="chip"><input type="checkbox" data-act="amlib" data-id="${t.id}" value="${o.k}" ${lib.includes(o.k) ? 'checked' : ''}> ${esc(o.curto)}</label>`).join('')}</div>` : ''}
    </div>`;
  }).join('') : '<p class="muted" style="margin:0">Nenhuma turma de alunos cadastrada (Perfil → Pessoas → Alunos).</p>';
  const lib = turmas.filter((t) => t.orixas.length).length;
  const resumo = `${A.publicada ? 'Visível para todos' : 'Escondida'} · ${lib} de ${turmas.length} ${turmas.length === 1 ? 'turma' : 'turmas'} com orixás`;
  const topo = `<button class="grp-h dobra am-cfg-h" data-act="amconfig" aria-expanded="${ui.config}"><h3><span aria-hidden="true">🌿</span> Orixás e visibilidade</h3><span class="am-turma-x">${ui.config ? '' : `<small>${resumo}</small>`}<span class="seta" aria-hidden="true">${ui.config ? '▴' : '▾'}</span></span></button>`;
  if (!ui.config) return `<div class="am-adm-sec">${topo}</div>`;
  return `<div class="am-adm-sec">${topo}
    <label class="of-sw"><input type="checkbox" role="switch" data-act="ampub" ${A.publicada ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
    <div class="am-adm-t"><h3>Orixás liberados por turma</h3><span class="muted">Cada turma só vê os orixás marcados.</span></div>
    ${corpo}
  </div>`;
}

// Um bloco ADMIN só, minimizado: a configuração (quem administra a aba) e as presenças (só o root), cada uma dobrável.
function cardAdminAmaci(A) {
  const cfg = admin() ? cardAdmin(A) : '';
  const pres = cardPresencaAdmin(A);
  if (!cfg && !pres) return '';
  const geo = raiz() ? `<div class="am-adm-sec"><button class="grp-h dobra am-cfg-h" data-act="amgeoabrir" aria-expanded="${ui.geoAberto}"><h3><span aria-hidden="true">📍</span> Testar localização</h3>
    <span class="am-turma-x">${ui.geoAberto ? '' : '<small>Se daqui o aluno conseguiria confirmar</small>'}<span class="seta" aria-hidden="true">${ui.geoAberto ? '▴' : '▾'}</span></span></button>${ui.geoAberto ? testeLocalizacao() : ''}</div>` : '';
  const resumo = `${A.publicada ? 'Visível para todos' : 'Escondida'}${pres ? ` · ${plural(A.presencaAdmin.amacis.length, 'amaci realizado', 'amacis realizados')}` : ''}`;
  const cab = `<button class="grp-h dobra am-cfg-h" data-act="amadm" aria-expanded="${ui.adm}"><h2><span aria-hidden="true">⚙️</span> Configuração</h2>
    <span class="am-turma-x">${ui.adm ? '' : `<small>${resumo}</small>`}<span class="seta" aria-hidden="true">${ui.adm ? '▴' : '▾'}</span></span></button>`;
  return `<div class="card adm am-adm">${cab}${ui.adm ? cfg + pres + geo : ''}</div>`;
}

// ---------- pessoa ----------
const raiz = () => pode('usuarios:gerenciar');

// Cabeçalho: o trono e o nome do orixá escolhido e a trilha dos 14, na ordem da apostila. Liberado: toca e abre; não
// liberado para a turma do aluno: tracejado, sem abrir (só o nome, que já está no app; o conteúdo não vem do servidor).
function cabecalho(A, sel) {
  const info = sel ? NOME[sel] : null;
  const libs = new Set(A.orixas.map((o) => o.k));
  const aluno = ehAluno();
  const titulo = aluno ? `Caminho da ${A.turmaNome ? esc(A.turmaNome) : 'sua turma'}` : 'Os 14 orixás, na ordem da apostila';
  const passos = ORIXAS.map((o, i) => {
    const ok = libs.has(o.k);
    const cls = o.k === sel ? ' sel' : ok ? '' : ' bloq';
    return `<button type="button" class="am-passo${cls}" data-act="amsel" data-k="${ok ? o.k : ''}" ${ok ? '' : 'disabled'} aria-pressed="${o.k === sel}" aria-label="${i + 1}º ${esc(o.curto)}${ok ? '' : ' (ainda não liberado)'}">
      <span class="am-passo-n">${i + 1}</span><span class="am-passo-t">${esc(o.curto)}</span></button>`;
  }).join('');
  return `<div class="am-topo">
    <span class="am-trono">${info ? esc(info.trono) : 'Casa do Pai João'}</span>
    <h1 class="am-titulo">${info ? esc(info.nome) : 'Amaci'}</h1>
    <div class="am-trilha"><div class="am-trilha-h"><span>${titulo}</span>${aluno ? `<b>${libs.size} de ${ORIXAS.length}</b>` : ''}</div>
      <div class="am-passos">${passos}</div></div></div>`;
}

const SITUACAO = { p: ['Presente', 'pleno'], f: ['Falta', 're'] };
const selo = (st) => { const [t, c] = SITUACAO[st] || ['Ausente', '']; return `<span class="badge ${c}">${t}</span>`; };

// Aluno: o cartão Hoje (só no dia de amaci da turma) com o botão de confirmar no terreiro; sem amaci hoje, a linha do
// próximo.
function cardHoje(A) {
  const P = A.presenca;
  if (!ehAluno() || !P) return '';
  const doDia = P.amacis.find((a) => a.data === P.hoje);
  if (!doDia) {
    const prox = P.amacis.find((a) => a.data > P.hoje);
    return prox ? `<p class="muted am-prox">Próximo amaci: <b>${dDM(prox.data)}</b> · ${esc(prox.nome)}</p>` : '';
  }
  const acao = doDia.status === 'p'
    ? '<div class="am-hoje-ok"><span aria-hidden="true">✓</span> Presença confirmada</div>'
    : `<button class="btn primary am-hoje-bt" data-act="amconfirmarja" data-id="${doDia.id}"${ui.confirmando ? ' disabled' : ''}>${ui.confirmando ? 'Conferindo a localização…' : '📍 Estou no terreiro: confirmar presença'}</button>
      <small class="muted">O app confere a localização do celular.</small>`;
  return `<div class="am-hoje"><span class="am-hoje-d">Hoje · ${esc(dLong(P.hoje))}</span><b class="am-hoje-n">${esc(doDia.nome)}</b>${acao}</div>`;
}

// Root: confere se o celular está pegando a localização e se, daqui, o aluno conseguiria confirmar (dentro do terreiro).
function testeLocalizacao() {
  const G = ui.geo;
  const res = !G || G.pegando ? ''
    : G.erro ? `<p class="erro am-pres-nota">${esc(G.erro)}</p>`
    : `<p class="am-geo ${G.ok ? 'ok' : 'fora'}">${G.ok ? '✅ Localização ok: dentro do terreiro' : '📍 Fora do terreiro'} · ${G.dist < 1000 ? `${G.dist} m` : `${(G.dist / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`} do terreiro (limite ${RAIO_TERREIRO_M} m)${G.prec ? ` · precisão ±${G.prec} m` : ''}</p>`;
  return `<div class="am-geo-t"><button class="btn small" data-act="amtestargeo"${G?.pegando ? ' disabled' : ''}>${G?.pegando ? 'Pegando a localização…' : '📍 Testar localização'}</button>${res}</div>`;
}

const pegarLocalizacao = () => new Promise((ok, erro) => {
  if (!navigator.geolocation) { erro({ code: 0 }); return; }
  navigator.geolocation.getCurrentPosition(ok, erro, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});
const msgGeo = (e) => (e?.code === 1 ? 'Permita a localização para o app no navegador.' : e?.code === 0 ? 'Este aparelho não informa a localização.' : 'Não deu para pegar a localização. Tente de novo.');

// Aluno: o percentual nos amacis já realizados e, aberto, cada amaci com a situação; no amaci que já passou e foi
// cadastrado pelo root (retroativo), o Marcar presente (de qualquer lugar).
function cardPresenca(A) {
  const P = A.presenca;
  if (!ehAluno() || !P) return '';
  const feitos = P.amacis.filter((a) => a.data <= P.hoje).reverse();
  const presentes = feitos.filter((a) => a.status === 'p').length;
  const pct = feitos.length ? Math.round((presentes / feitos.length) * 100) : null;
  const turma = A.turmaNome ? esc(A.turmaNome) : 'Sem turma';
  const cab = `<button class="am-mp-h" data-act="ampres" aria-expanded="${ui.pres}"><span class="am-mp-t"><b>Minha presença</b><small class="muted">${turma} · ${feitos.length ? `${presentes} de ${plural(feitos.length, 'amaci', 'amacis')}` : 'sem amaci ainda'}</small></span>
    ${pct === null ? '' : `<b class="am-mp-pct">${pct}%</b>`}<span class="seta" aria-hidden="true">${ui.pres ? '▾' : '▸'}</span></button>`;
  if (!ui.pres) return `<div class="am-mp">${cab}</div>`;
  const barra = pct === null ? '' : `<div class="am-pres-barra" role="img" aria-label="${pct}% de presença"><span style="width:${pct}%"></span></div>`;
  const linha = (a) => {
    const marca = a.status !== 'p' && a.retroativo && a.data < P.hoje;
    return `<li><span class="am-pres-n"><b>${esc(a.nome)}</b><small class="muted">${a.data === P.hoje ? 'Hoje · ' : ''}${dDM(a.data)}</small></span>${selo(a.status)}
      ${marca ? `<button class="btn small am-mp-marcar" data-act="amconfirmarja" data-id="${a.id}"${ui.confirmando ? ' disabled' : ''}>Marcar presente</button>` : ''}</li>`;
  };
  const lista = feitos.length ? `<ul class="am-mp-l">${feitos.map(linha).join('')}</ul>` : '<p class="muted" style="margin:0">Nenhum amaci realizado ainda.</p>';
  const prox = P.amacis.find((a) => a.data > P.hoje);
  return `<div class="am-mp">${cab}<div class="am-mp-c">${barra}${lista}${prox ? `<p class="muted am-pres-nota">Próximo: ${esc(prox.nome)} · ${dDM(prox.data)}</p>` : ''}</div></div>`;
}

// Root: escolhe a turma ao lado do título; cada amaci realizado com os quadradinhos Presentes e Ausentes (falta e sem
// registro); tocar abre a lista dos alunos da turma (cadastro de alunos), onde o root marca presença, falta ou ausente.
function cardPresencaAdmin(A) {
  const P = A.presencaAdmin;
  if (!P || !raiz()) return '';
  const turma = P.turmas.find((t) => t.id === ui.presTurma) || P.turmas[0];
  const sel = P.turmas.length ? `<select class="am-padm-t" data-act="ampresturma" aria-label="Turma">${P.turmas.map((t) => `<option value="${t.id}"${t.id === turma.id ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select>` : '';
  const cab = `<div class="am-padm-h"><button class="grp-h dobra am-cfg-h" data-act="ampresadm" aria-expanded="${ui.presAdm}"><h3><span aria-hidden="true">📋</span> Presenças</h3>
    <span class="am-turma-x"><span class="seta" aria-hidden="true">${ui.presAdm ? '▴' : '▾'}</span></span></button>${sel}</div>`;
  if (!ui.presAdm) return `<div class="am-adm-sec">${cab}</div>`;
  if (!turma) return `<div class="am-adm-sec">${cab}<p class="muted" style="margin:0">Cadastre um tipo de evento com Amaci no nome (ex.: T09 - Amaci), marque a turma nele (Admin root → Eventos) e os alunos aparecem aqui.</p></div>`;
  const amacis = P.amacis.filter((ev) => !ev.turmas || ev.turmas.includes(turma.id));
  if (ui.abrirNovo) {
    const n = amacis.find((ev) => ev.data === ui.abrirNovo.data && ev.nome === ui.abrirNovo.nome);
    if (n) ui.presEv = n.id;
    ui.abrirNovo = null;
  }
  const novo = blocoNovoAmaci(turma);
  if (!amacis.length) return `<div class="am-adm-sec">${cab}${novo}<p class="muted" style="margin:0">Nenhum amaci da ${esc(turma.nome)} realizado ainda.</p></div>`;
  const alunos = P.alunos.filter((a) => a.turmaId === turma.id);
  if (!alunos.length) return `<div class="am-adm-sec">${cab}<p class="muted" style="margin:0">Nenhum aluno cadastrado na ${esc(turma.nome)}.</p></div>`;
  const corpo = amacis.map((ev) => {
    const m = P.marcas[ev.id] || {};
    const grupos = { p: alunos.filter((a) => m[a.id] === 'p'), a: alunos.filter((a) => m[a.id] !== 'p') };
    const quad = (k, rot, cls) => {
      const ab = ui.presQ === `${ev.id}:${k}`;
      return `<button type="button" class="pf-of-total ${cls}${ab ? ' selecionado' : ''}" data-act="ampresq" data-q="${ev.id}:${k}" aria-expanded="${ab}" ${grupos[k].length ? '' : 'disabled'}><b>${grupos[k].length}</b><span>${rot}</span></button>`;
    };
    const aberto = ui.presQ?.startsWith(ev.id + ':') ? grupos[ui.presQ.slice(-1)] : null;
    const lista = !aberto ? '' : `<div class="am-pres-t">${aberto.map((a) => `<label class="am-pres-a"><span>${esc(a.nome)}</span>
      <select data-act="ampresmarcar" data-ev="${ev.id}" data-aluno="${a.id}" aria-label="Presença de ${esc(a.nome)} em ${esc(ev.nome)}">
        <option value=""${!m[a.id] ? ' selected' : ''}>Ausente</option><option value="p"${m[a.id] === 'p' ? ' selected' : ''}>Presente</option><option value="f"${m[a.id] === 'f' ? ' selected' : ''}>Falta</option></select></label>`).join('')}</div>`;
    // Minimizado: uma linha com o nome, a data e presentes/total; aberto, os quadradinhos e a lista.
    const ab = ui.presEv === ev.id;
    const linha = `<button class="am-turma-h" data-act="ampresev" data-id="${ev.id}" aria-expanded="${ab}">
      <span class="am-padm-ev-n">${esc(ev.nome)}</span>
      <span class="am-turma-x"><small>${ev.data === P.hoje ? 'Hoje' : dShort(ev.data)}</small><span class="am-padm-cont" aria-label="${grupos.p.length} de ${alunos.length} presentes"><b>${grupos.p.length}</b>/${alunos.length}</span><span class="seta" aria-hidden="true">${ab ? '▴' : '▾'}</span></span></button>`;
    // Amaci criado pelo root (Cadastrar amaci que já passou): ✕ à direita; tocar pede Confirmar / Cancelar.
    const x = ev.retroativo ? `<button type="button" class="btn small link am-padm-x" data-act="amexcluir" data-id="${ev.id}" aria-label="Excluir ${esc(ev.nome)}" title="Excluir">✕</button>` : '';
    const conf = ui.excluir === ev.id ? `<div class="am-padm-conf" role="alert"><span>Excluir <b>${esc(ev.nome)}</b> e as presenças marcadas nele?</span>
      <span class="am-padm-conf-b"><button type="button" class="btn small" data-act="amexcluircancel"${ui.excluindo ? ' disabled' : ''}>Cancelar</button><button type="button" class="btn small danger" data-act="amexcluirok" data-id="${ev.id}"${ui.excluindo ? ' disabled' : ''}>${ui.excluindo ? 'Excluindo…' : 'Confirmar'}</button></span></div>` : '';
    // ✎ (todo amaci da lista): abre embaixo o nome e a data para corrigir.
    const lapis = `<button type="button" class="btn small link am-padm-ed" data-act="ameditar" data-id="${ev.id}" aria-label="Editar ${esc(ev.nome)}" title="Editar nome e data">✎</button>`;
    const topo = `<div class="am-padm-row">${linha}${lapis}${x}</div>${conf}${ui.editar?.id === ev.id ? formEditar(ev) : ''}`;
    if (!ab) return `<div class="am-turma">${topo}</div>`;
    return `<div class="am-turma">${topo}<div class="am-padm-ev">
      <div class="pf-of-totais am-padm-q">${quad('p', 'Presentes', 'am-q-p')}${quad('a', 'Ausentes', 'am-q-a')}</div>${lista}</div></div>`;
  }).join('');
  return `<div class="am-adm-sec">${cab}${novo}<p class="muted am-pres-nota">${esc(turma.nome)} · ${plural(alunos.length, 'aluno', 'alunos')} · ${plural(amacis.length, 'amaci', 'amacis')}</p><div class="am-padm-lista">${corpo}</div></div>`;
}

// Root: corrige o nome e a data de um amaci (o mesmo evento de Admin root → Eventos; o tipo continua o mesmo).
function formEditar(ev) {
  const E = ui.editar;
  const carregando = estado.eventosTipos === null;   // os eventos (com o tipo de cada um) chegam pelo ameditar
  return `<form id="f-amaci-ed" class="am-novo am-padm-edf" data-id="${ev.id}" autocomplete="off">
    <div class="am-novo-l">
      <label class="field">Data<input type="text" name="data" inputmode="numeric" maxlength="10" data-mascara="data" placeholder="31/10/2026" required value="${esc(E.data)}"></label>
    </div>
    <label class="field">Nome<input type="text" name="nome" maxlength="120" required value="${esc(E.nome)}"></label>
    <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn small" data-act="ameditarcancel">Cancelar</button><button class="btn small primary" type="submit"${ui.editSalvando || carregando ? ' disabled' : ''}>${ui.editSalvando ? 'Salvando…' : 'Salvar'}</button></div>
  </form>`;
}

// "31/10/2026" ou "31/10/26" → 'AAAA-MM-DD'; "31/10" fica no ano que já estava. Data que não existe → null.
function dataEditada(txt, anoAtual) {
  const m = String(txt || '').trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]);
  const a = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(anoAtual);
  const x = new Date(Date.UTC(a, mes - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === mes - 1 && x.getUTCDate() === d ? x.toISOString().slice(0, 10) : null;
}

export async function enviarEdicao(form) {
  if (ui.editSalvando) return;
  const id = form.dataset.id;
  const ev = (estado.amaci?.presencaAdmin?.amacis || []).find((x) => x.id === id);
  const tipo = (estado.eventos || []).find((x) => x.id === id)?.tipo;
  ui.editar = { id, data: form.elements.data.value, nome: form.elements.nome.value };
  const data = dataEditada(ui.editar.data, (ev?.data || hoje()).slice(0, 4));
  const nome = ui.editar.nome.replace(/\s+/g, ' ').trim();
  if (!data) { toast('Data inválida. Use o formato 31/10/2026.'); return; }
  if (!nome) { toast('Digite o nome do amaci.'); return; }
  if (!tipo) { toast('Não achei o amaci nos eventos. Abra a aba de novo e tente outra vez.'); return; }
  const hojeData = estado.amaci?.presencaAdmin?.hoje || hoje();
  ui.editSalvando = true;
  avisar();
  const ok = await acaoEventos('evento', { id, data, nome, tipo });
  ui.editSalvando = false;
  if (ok) {
    ui.editar = null;
    estado.amaci = null;   // busca de novo com o nome e a data novos
    toast(data > hojeData ? 'Amaci alterado. Com data futura, ele sai desta lista até o dia.' : 'Amaci alterado.');
  }
  avisar();
}

// Tipos de evento de amaci (com "Amaci" no nome) em que a turma está marcada: é neles que o amaci da turma é cadastrado.
const tiposAmaciDa = (turmaId) => (estado.eventosTipos?.tipos || [])
  .filter((t) => (t.chave === 'amaci' || /amaci/i.test(t.nome)) && (t.turmas || []).includes(turmaId));

// Root: cadastra aqui um amaci que já aconteceu (data digitada, sem calendário), no tipo de amaci da turma escolhida;
// depois marca a presença na lista.
function blocoNovoAmaci(turma) {
  const msg = ui.novoMsg ? `<p class="am-novo-msg ${ui.novoMsg.ok ? 'ok' : 'erro'}" role="${ui.novoMsg.ok ? 'status' : 'alert'}">${esc(ui.novoMsg.texto)}</p>` : '';
  if (!ui.novo) return `${msg}<button class="btn small am-novo-bt" data-act="amnovo">＋ Cadastrar amaci que já passou</button>`;
  if (estado.eventosTipos === null) { carregarEventosTipos(); return '<p class="muted am-pres-nota">Carregando os tipos de evento…</p>'; }
  const tipos = tiposAmaciDa(turma.id);
  if (!tipos.length) {
    return `<div class="am-novo"><p class="muted am-pres-nota">A ${esc(turma.nome)} não está marcada em nenhum tipo de amaci. Crie o tipo (ex.: <b>${esc(turma.nome)} - Amaci</b>) em Admin root → Eventos e marque a turma nele.</p>
      <button class="btn small" data-act="amnovocancel">Fechar</button></div>`;
  }
  const V = ui.novoRasc || {};
  return `<form id="f-amaci-novo" class="am-novo" autocomplete="off">
    <b>Amaci que já passou · ${esc(turma.nome)}</b>
    ${msg}
    <div class="am-novo-l">
      <label class="field">Data<input type="text" name="data" inputmode="numeric" maxlength="10" data-mascara="data" placeholder="31/10/2026" required value="${esc(V.data || '')}"></label>
      ${tipos.length > 1 ? `<label class="field">Tipo<select name="tipo">${tipos.map((t) => `<option value="${esc(t.chave)}"${t.chave === V.tipo ? ' selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>` : `<input type="hidden" name="tipo" value="${esc(tipos[0].chave)}">`}
    </div>
    <label class="field">Nome<input type="text" name="nome" maxlength="120" placeholder="Ex.: Amaci de Oxalá" required value="${esc(V.nome || '')}"></label>
    <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn small" data-act="amnovocancel">Cancelar</button><button class="btn small primary" type="submit"${ui.novoSalvando ? ' disabled' : ''}>${ui.novoSalvando ? 'Cadastrando…' : 'Cadastrar'}</button></div>
  </form>`;
}

// "31/10/2026", "31/10/26" ou "31/10" (sem o ano: a data mais recente que já passou) → 'AAAA-MM-DD', ou null.
function dataPassada(txt, hojeData) {
  const m = String(txt || '').trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]);
  const montar = (a) => {
    const x = new Date(Date.UTC(a, mes - 1, d));
    return x.getUTCFullYear() === a && x.getUTCMonth() === mes - 1 && x.getUTCDate() === d ? x.toISOString().slice(0, 10) : null;
  };
  const ano = Number(hojeData.slice(0, 4));
  if (m[3]) return montar(Number(m[3].length === 2 ? '20' + m[3] : m[3]));
  const este = montar(ano);
  return este && este <= hojeData ? este : montar(ano - 1);
}

export async function enviarNovoAmaci(form) {
  if (ui.novoSalvando) return;
  const hojeData = estado.amaci?.presencaAdmin?.hoje || hoje();
  ui.novoRasc = { data: form.elements.data.value, nome: form.elements.nome.value, tipo: form.elements.tipo.value };
  const data = dataPassada(ui.novoRasc.data, hojeData);
  const nome = ui.novoRasc.nome.replace(/\s+/g, ' ').trim();
  const erro = (texto) => { ui.novoMsg = { ok: false, texto }; avisar(); };
  if (!data) return erro('Não cadastrado: data inválida. Use o formato 31/10/2026.');
  if (data > hojeData) return erro('Não cadastrado: aqui é só amaci que já passou. Amaci futuro vai em Admin root → Eventos.');
  if (!nome) return erro('Não cadastrado: digite o nome do amaci.');
  ui.novoSalvando = true;
  ui.novoMsg = null;
  avisar();
  const r = await cadastrarAmaciPassado({ data, nome, tipo: ui.novoRasc.tipo });
  ui.novoSalvando = false;
  if (!r.ok) return erro('Não cadastrado: ' + r.erro);
  const dBR = `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
  ui.novo = false;
  ui.novoRasc = null;
  ui.novoMsg = { ok: true, texto: `✅ Amaci cadastrado: ${nome} · ${dBR}. Ele já está aberto na lista para marcar a presença.` };
  ui.abrirNovo = { data, nome };
  ui.presQ = null;
  estado.amaci = null;   // busca de novo: o amaci novo entra na lista
  toast(`Amaci cadastrado em ${dBR}.`);
  avisar();
}

// Bloco de conteúdo: ícone na frente do título e o texto da apostila. Sem conteúdo, o bloco não aparece.
const bloco = (id, titulo, corpo) => `<section class="am-sec" id="am-s-${id}"><h3>${titulo}</h3>${corpo}</section>`;

function blocoPontos(o) {
  if (!o.pontos.length) return '';
  return bloco('ponto', 'Ponto Riscado', `<div class="am-pontos${o.pontos.length > 1 ? ' varios' : ''}">${o.pontos.map((p) => `<figure class="am-ponto"><img src="/img/amaci/${esc(p.img)}" alt="${esc(p.legenda || 'Ponto riscado')}" loading="lazy">${p.legenda ? `<figcaption>${esc(p.legenda)}</figcaption>` : ''}</figure>`).join('')}</div>`);
}

// Fatores: o nome do fator em negrito (o que vem antes de ":" ou " – "), o resto como está na apostila.
const fator = (t) => {
  const m = t.match(/^(.+?)(: | – )(.+)$/);
  return `<li>${m ? `<b>${esc(m[1])}</b>${esc(m[2])}${esc(m[3])}` : `<b>${esc(t)}</b>`}</li>`;
};
function blocoFatores(o) {
  if (!o.fatores?.length) return '';
  return bloco('fatores', 'Fatores', `<ul class="am-fatores">${o.fatores.map(fator).join('')}</ul>`);
}

// Recados: texto livre de quem administra a aba, um por orixá (no banco é a "orientação"). Sem texto, não aparece.
const ICONE_CASA = '<span class="am-ico am-ico-casa" aria-hidden="true"><img src="/img/terreiro.png" alt=""></span>';
function blocoOrientacao(o) {
  const ed = ui.editando?.orixa === o.k ? ui.editando : null;
  if (ed) {
    const n = linhas(ed.texto);
    return `<form class="card am-bloco am-ori" id="f-amaci-ori" data-k="${o.k}" autocomplete="off">
      <div class="am-bloco-h">${ICONE_CASA}<h3>Recados</h3></div>
      <textarea id="am-ori" rows="${ORIENTACAO_VISIVEIS}" maxlength="${ORIENTACAO_LETRAS}" placeholder="Escreva o recado para ${esc(NOME[o.k].nome)}.">${esc(ed.texto)}</textarea>
      <span class="muted am-conta">Cabem até ${ORIENTACAO_LINHAS} linhas (${ORIENTACAO_LETRAS} letras) · <span id="am-ori-n">${n}/${ORIENTACAO_LINHAS} linhas</span></span>
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" data-act="amoricancel">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>
    </form>`;
  }
  // Sem texto, o bloco não aparece; quem administra vê para poder escrever.
  if (!o.orientacao && !admin()) return '';
  const bt = admin() ? `<button class="btn link small" data-act="amoried">✎ ${o.orientacao ? 'Editar' : 'Escrever'}</button>` : '';
  return `<div class="am-recado">${ICONE_CASA}<div class="am-recado-c"><div class="am-recado-h"><span>Recados</span>${bt}</div>
    ${o.orientacao ? `<p class="am-ori-txt">${esc(o.orientacao)}</p>` : '<p class="muted" style="margin:0">Sem recado: o bloco fica escondido para a corrente e os alunos.</p>'}</div></div>`;
}

export function render() {
  if (estado.amaci === null) { carregarAmaci(); return '<div class="loading">Carregando o amaci…</div>'; }
  const A = estado.amaci;
  if (A.erro) return `<div class="card"><p class="erro">${esc(A.erro)}</p><button class="btn" data-act="amrecarregar">Tentar de novo</button></div>`;
  let h = '<section class="panel am-tela">';
  if (!A.orixas.length) {
    const turma = A.turmaNome ? `da ${esc(A.turmaNome)}` : 'da sua turma';
    return h + cabecalho(A, '') + cardHoje(A) + cardPresenca(A) + `<p class="muted am-vazio">Nenhum orixá liberado ainda para os alunos ${turma}.</p>` + cardAdminAmaci(A) + '</section>';
  }
  const libs = A.orixas.map((o) => o.k);
  const sel = libs.includes(ui.sel) ? ui.sel : ultimoLiberado(libs);
  const o = A.orixas.find((x) => x.k === sel);
  h += cabecalho(A, sel) + cardHoje(A) + cardPresenca(A);
  // Atalhos para as seções que este orixá tem.
  const secs = [[o.ervas.length, 'ervas', 'Ervas'], [o.velas.length, 'velas', 'Velas'], [o.pontos.length, 'ponto', 'Ponto Riscado'], [o.fatores?.length, 'fatores', 'Fatores']].filter(([n]) => n);
  h += `<div class="am-apostila">${blocoOrientacao(o)}`;
  if (secs.length > 1) h += `<nav class="am-atalhos" aria-label="Seções da apostila">${secs.map(([, id, t]) => `<button type="button" class="am-atalho" data-act="amir" data-id="${id}">${t}</button>`).join('')}</nav>`;
  if (o.ervas.length) h += bloco('ervas', 'Ervas', lista(o.ervas));
  if (o.velas.length) h += bloco('velas', 'Velas', lista(o.velas));
  h += blocoPontos(o);
  h += blocoFatores(o);
  h += '<p class="muted am-fonte">Fonte: Apostila Orixás da Casa do Pai João.</p></div>';
  return h + cardAdminAmaci(A) + '</section>';
}

// ---------- eventos ----------
// Recado: não deixa passar de 10 linhas e guarda o texto para um redesenho não apagar.
export function digitando(t) {
  const ls = t.value.split('\n');
  if (ls.length > ORIENTACAO_LINHAS) t.value = ls.slice(0, ORIENTACAO_LINHAS).join('\n');
  if (ui.editando) ui.editando.texto = t.value;
  const n = document.getElementById('am-ori-n');
  if (n) n.textContent = `${linhas(t.value)}/${ORIENTACAO_LINHAS} linhas`;
}

export async function enviar(form) {
  const k = form.dataset.k;
  const texto = document.getElementById('am-ori')?.value ?? '';
  if (await acaoAmaci('orientacao', { orixa: k, texto })) {
    ui.editando = null;
    avisar();
    toast('Recado salvo.');
  }
}

export const cliques = {
  amsel(el) { if (!el.dataset.k) return; ui.sel = el.dataset.k; ui.editando = null; avisar(); },
  // Cartão Hoje e Marcar presente (retroativo): um toque já é Presente; o amconfirmar confere dia e localização.
  amconfirmarja(el) { ui.escolha[el.dataset.id] = 'p'; return cliques.amconfirmar(el); },
  amir(el) { document.getElementById('am-s-' + el.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  amgeoabrir() { ui.geoAberto = !ui.geoAberto; avisar(); },
  ampres() { ui.pres = !ui.pres; avisar(); },
  ampresadm() { ui.presAdm = !ui.presAdm; avisar(); },
  amnovo() { ui.novo = true; ui.novoMsg = null; avisar(); },
  ameditar(el) {
    const ev = (estado.amaci?.presencaAdmin?.amacis || []).find((x) => x.id === el.dataset.id);
    ui.editar = ui.editar?.id === el.dataset.id || !ev ? null : { id: ev.id, data: dShort(ev.data), nome: ev.nome };
    ui.excluir = null;
    if (ui.editar && estado.eventosTipos === null) carregarEventosTipos();
    avisar();
  },
  ameditarcancel() { ui.editar = null; avisar(); },
  amexcluir(el) { ui.editar = null; ui.excluir = ui.excluir === el.dataset.id ? null : el.dataset.id; avisar(); },
  amexcluircancel() { ui.excluir = null; avisar(); },
  async amexcluirok(el) {
    if (ui.excluindo) return;
    ui.excluindo = true;
    avisar();
    const ok = await acaoEventos('excluirEvento', { id: el.dataset.id });
    ui.excluindo = false;
    ui.excluir = null;
    if (ok) {
      if (ui.presEv === el.dataset.id) ui.presEv = null;
      ui.novoMsg = null;
      estado.amaci = null;   // busca de novo sem o amaci excluído
      toast('Amaci excluído.');
    }
    avisar();
  },
  amadm() { ui.adm = !ui.adm; avisar(); },
  async amtestargeo() {
    ui.geo = { pegando: true };
    avisar();
    try {
      const pos = await pegarLocalizacao();
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const ok = noTerreiro(lat, lon);
      ui.geo = { ok, dist: Math.round(distanciaM(TERREIRO, { lat, lon })), prec: Math.round(accuracy || 0) };
      toast(ok ? 'Localização ok: dentro do terreiro.' : 'Fora do terreiro.');
    } catch (e) {
      ui.geo = { erro: msgGeo(e) };
      toast(ui.geo.erro);
    }
    avisar();
  },
  amnovocancel() { ui.novo = false; ui.novoRasc = null; ui.novoMsg = null; avisar(); },
  ampresq(el) { ui.presQ = ui.presQ === el.dataset.q ? null : el.dataset.q; avisar(); },
  ampresev(el) { ui.presEv = ui.presEv === el.dataset.id ? null : el.dataset.id; ui.presQ = null; avisar(); },
  async amconfirmar(el) {
    const id = el.dataset.id;
    if ((ui.escolha[id] || 'a') !== 'p') { toast('Escolha Presente para confirmar.'); return; }
    const P = estado.amaci?.presenca;
    const a = P?.amacis.find((x) => x.id === id);
    ui.confirmando = true;
    avisar();
    try {
      let lat, lon;
      if (a && a.data < P.hoje) {
        // Amaci que já passou, cadastrado pelo root: sem localização.
        if (await confirmarPresencaAmaci(id)) { delete ui.escolha[id]; toast('Presença registrada.'); }
        return;
      }
      if (emDemo()) {
        ({ lat, lon } = TERREIRO);
        toast('Demonstração: localização simulada no terreiro.');
      } else {
        if (!navigator.geolocation) { toast('Este aparelho não informa a localização.'); return; }
        const pos = await new Promise((ok, erro) => navigator.geolocation.getCurrentPosition(ok, erro, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        ({ latitude: lat, longitude: lon } = pos.coords);
        if (!noTerreiro(lat, lon)) { toast('Você precisa estar no Terreiro Pai João para confirmar a presença.'); return; }
      }
      if (await confirmarPresencaAmaci(id, lat, lon)) { delete ui.escolha[id]; toast('Presença confirmada. Bom amaci!'); }
    } catch (e) {
      toast(e?.code === 1 ? 'Permita a localização para confirmar a presença.' : 'Não deu para pegar a localização. Tente de novo.');
    } finally {
      ui.confirmando = false;
      avisar();
    }
  },
  amconfig() { ui.config = !ui.config; avisar(); },
  amturma(el) {
    const id = el.dataset.id;
    if (ui.turmas.has(id)) ui.turmas.delete(id); else ui.turmas.add(id);
    avisar();
  },
  amoried() {
    const k = ui.sel || ultimoLiberado(estado.amaci.orixas.map((x) => x.k));
    const o = estado.amaci.orixas.find((x) => x.k === k);
    ui.sel = k;
    ui.editando = { orixa: k, texto: o?.orientacao || '' };
    avisar();
  },
  amoricancel() { ui.editando = null; avisar(); },
  amrecarregar() { estado.amaci = null; avisar(); },
};

export const mudancas = {
  amescolher(t) { ui.sel = t.value; ui.editando = null; avisar(); },
  amescolha(t) { ui.escolha[t.dataset.id] = t.value; },
  ampresturma(t) { ui.presTurma = t.value; ui.presEv = null; ui.presQ = null; ui.novoMsg = null; avisar(); },
  async ampresmarcar(t) {
    // Na hora: os quadradinhos e o contador mudam antes da resposta; se der erro, busca de novo do servidor.
    const P = estado.amaci?.presencaAdmin;
    if (P) {
      const m = (P.marcas[t.dataset.ev] ||= {});
      if (t.value) m[t.dataset.aluno] = t.value; else delete m[t.dataset.aluno];
      avisar();
    }
    if (await acaoAmaci('presenca', { eventoId: t.dataset.ev, alunoId: t.dataset.aluno, status: t.value })) toast('Presença salva.');
    else carregarAmaci();
  },
  async ampub(t) {
    if (await acaoAmaci('publicar', { publicada: t.checked })) toast(t.checked ? 'Aba Amaci visível para todos.' : 'Aba Amaci escondida: só quem administra vê.');
    else t.checked = !t.checked;
  },
  async amlib(t) {
    const turma = (estado.amaci.turmas || []).find((x) => x.id === t.dataset.id);
    if (!turma) return;
    const atual = new Set(turma.orixas);
    if (t.checked) atual.add(t.value); else atual.delete(t.value);
    if (!(await acaoAmaci('turma', { turmaId: turma.id, orixas: ordenarOrixas([...atual]) }))) t.checked = !t.checked;
  },
};
