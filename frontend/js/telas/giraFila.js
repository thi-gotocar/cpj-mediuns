// Sub-aba Fila (aba Gira), sempre a gira de hoje: o painel de quem controla a fila de senhas — a pessoa com a função Senha (no cadastro ou no
// dia), quem edita a Gira e o root. O servidor confere tudo; aqui só se esconde o bloco.
// Abre e fecha a entrada pelo QR, ajusta o limite do atendimento, chama a próxima (preferenciais primeiro; o passe é
// outra fila), emite senha no balcão e marca cada senha. Atualiza sozinho de tempos em tempos (outros celulares no painel).

import { estado, pode, prefs, carregarFila, acaoFila, avisar } from '../estado.js';
import { esc, hoje, toast } from '../util.js';
import { TIPOS_FILA, tipoFila, rotuloSenha } from '/shared/fila.js';

const ATUALIZAR_MS = 10000;
let timer = null;
let aba = 'aguardando';   // lista aberta: aguardando | chamada | ausente | cancelada
let balcaoAberto = false;
let ajustesAberto = null;  // null = aberto só no começo (fila fechada e sem senhas)

export function operadorFila(g = {}) {
  if (pode('giras:editar')) return true;
  const id = estado.me?.pessoaId;
  if (!id) return false;
  return estado.pessoas.find((p) => p.id === id)?.funcao === 'senha' || g.papeis?.[id] === 'sen';
}

// Atualização de tempos em tempos, só enquanto o painel está na tela.
function agendar(data) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (prefs.tab !== 'fila' || hoje() !== data || !document.querySelector('.fila-card')) return;
    carregarFila(data, { silencioso: true }).finally(() => agendar(data));
  }, ATUALIZAR_MS);
}

const rot = (s) => rotuloSenha(s.tipo, s.numero);
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
// A ordem em que o painel chama: na de atendimento, as preferenciais primeiro.
const PESO = { preferencial: 0, atendimento: 1, passe: 2 };
const ordem = (a, b) => PESO[a.tipo] - PESO[b.tipo] || a.numero - b.numero;
const proxima = (L, fila) => L.filter((s) => s.status === 'aguardando' && (fila === 'passe' ? s.tipo === 'passe' : s.tipo !== 'passe')).sort(ordem)[0];

function botaoChamar(L, fila, titulo) {
  const p = proxima(L, fila);
  return `<button type="button" class="btn ${fila === 'passe' ? '' : 'primary'} fila-chamar" data-act="filachamar" data-f="${fila}" ${p ? '' : 'disabled'}>
    <span>${titulo}</span><small>${p ? `Próxima: <b>${esc(rot(p))}</b>` : 'Ninguém aguardando'}</small></button>`;
}

function acoes(s) {
  const b = (st, txt, extra = '') => `<button type="button" class="btn small ${extra}" data-act="filamarcar" data-id="${esc(s.id)}" data-s="${st}">${txt}</button>`;
  if (estado.confirm === 'filacanc:' + s.id) {
    return `<span class="fila-acoes"><span class="fila-conf">Cancelar ${esc(rot(s))}?</span>${b('cancelada', 'Cancelar senha', 'danger')}<button type="button" class="btn small" data-act="filavoltar">Manter</button></span>`;
  }
  const cancelar = `<button type="button" class="btn small" data-act="askdel" data-k="filacanc:${esc(s.id)}" aria-label="Cancelar a senha ${esc(rot(s))}">✕</button>`;
  if (s.status === 'aguardando') return `<span class="fila-acoes">${b('chamada', 'Chamar')}${b('ausente', 'Ausente')}${cancelar}</span>`;
  if (s.status === 'chamada') return `<span class="fila-acoes">${b('chamada', 'Chamar de novo')}${b('ausente', 'Ausente')}</span>`;
  if (s.status === 'ausente') return `<span class="fila-acoes">${b('aguardando', 'Voltar à fila')}${cancelar}</span>`;
  return '';
}

function linha(s) {
  const quando = s.status === 'chamada' ? `Chamada às ${hora(s.chamadaEm)}` : `Pegou às ${hora(s.criadaEm)}`;
  const extra = [s.balcao ? 'no balcão' : '', s.telefone ? `<a href="tel:${esc(s.telefone)}">${esc(s.telefone)}</a>` : ''].filter(Boolean).join(', ');
  return `<li class="fila-l ${s.tipo}"><span class="fila-num">${esc(rot(s))}</span>
    <span class="fila-quem"><b>${esc(s.nome)}</b><small>${quando}${extra ? `, ${extra}` : ''}</small></span>
    ${acoes(s)}</li>`;
}

function lista(L) {
  const grupos = [['aguardando', 'Na fila'], ['chamada', 'Chamadas'], ['ausente', 'Ausentes'], ['cancelada', 'Canceladas']];
  const de = (st) => L.filter((s) => s.status === st);
  const itens = de(aba).sort(aba === 'chamada' ? (a, b) => String(b.chamadaEm).localeCompare(String(a.chamadaEm)) : aba === 'aguardando' ? ordem : (a, b) => a.criadaEm.localeCompare(b.criadaEm));
  return `<div class="fila-sec"><div class="seg fila-seg">${grupos.map(([k, t]) => `<button type="button" data-act="filaver" data-v="${k}" aria-pressed="${aba === k}">${t} <span class="fila-n">${de(k).length}</span></button>`).join('')}</div>
    ${itens.length ? `<ul class="fila-lista">${itens.map(linha).join('')}</ul>` : `<p class="muted fila-vazio">${aba === 'aguardando' ? 'Ninguém aguardando.' : 'Nenhuma senha aqui.'}</p>`}</div>`;
}

function balcao(f) {
  if (!balcaoAberto) return `<button type="button" class="btn fila-balcao-bt" data-act="filabalcao">＋ Senha no balcão</button>`;
  const v = estado.filaBalcao || {};
  const tipo = v.tipo || (f.atendimentoLotado ? 'passe' : 'atendimento');
  return `<form id="f-fila-balcao" class="fila-balcao" autocomplete="off">
    <div class="fila-sec-h"><h3>Senha no balcão</h3><button type="button" class="btn small" data-act="filabalcao">Fechar</button></div>
    <div class="fila-tipos" role="radiogroup" aria-label="Tipo de senha">${TIPOS_FILA.map((t) => {
      const off = t.k === 'atendimento' && f.atendimentoLotado;
      return `<label class="fila-tipo ${t.k}${off ? ' off' : ''}"><input type="radio" name="fb-tipo" value="${t.k}" ${tipo === t.k && !off ? 'checked' : ''} ${off ? 'disabled' : ''}><span>${t.nome}</span></label>`;
    }).join('')}</div>
    <input type="text" id="fb-nome" name="nome" maxlength="80" placeholder="Nome" aria-label="Nome" value="${esc(v.nome || '')}" required>
    <input type="tel" id="fb-tel" name="telefone" inputmode="tel" maxlength="20" placeholder="Telefone (opcional)" aria-label="Telefone" value="${esc(v.telefone || '')}">
    <button class="btn primary" type="submit">Emitir senha</button></form>`;
}

// O cartão da senha chamada agora, como o de papel que a fila substitui; o canhoto mostra as próximas da fila.
function cartao(f, L) {
  const ult = f.chamadas?.[0];
  const prox = L.filter((s) => s.status === 'aguardando' && s.tipo !== 'passe').sort(ordem).slice(0, 4).map(rot);
  const canhoto = `<div class="fila-canhoto"><span>Próximas</span>${prox.length ? `<b>${prox.map(esc).join(' ')}</b>` : '<span>ninguém aguardando</span>'}</div>`;
  if (!ult) return `<div class="fila-cartao vazio"><div class="fila-cartao-c"><p class="fila-cartao-vazio">Ninguém chamado ainda.</p></div>${canhoto}</div>`;
  const s = L.find((x) => x.tipo === ult.tipo && x.numero === ult.numero);
  return `<div class="fila-cartao ${ult.tipo}" aria-live="polite"><div class="fila-cartao-c">
      <div class="fila-cartao-topo"><span class="fila-cartao-tipo">${esc(tipoFila(ult.tipo)?.nome || '')}</span><span>chamada às ${hora(ult.chamadaEm)}</span></div>
      <b class="fila-cartao-n">${esc(rotuloSenha(ult.tipo, ult.numero))}</b>
      ${s ? `<span class="fila-cartao-q">${esc(s.nome)}</span>` : ''}</div>${canhoto}</div>`;
}

function ajustes(f) {
  const aberto = ajustesAberto ?? (!f.aberta && !(f.senhas || []).length);
  const usadas = f.emitidas?.atendimento || 0;
  const resumo = `${f.aberta ? 'Aberta' : 'Fechada'} pelo QR. ${f.limite != null ? `${usadas} de ${f.limite} senhas de atendimento` : `${usadas} ${usadas === 1 ? 'senha' : 'senhas'} de atendimento, sem limite`}.`;
  return `<div class="fila-sec fila-ajustes"><button type="button" class="fila-ajustes-h" data-act="filaajustes" aria-expanded="${aberto}">
      <span><b>Ajustes da fila</b><small>${resumo}</small></span><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>
    ${aberto ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="filaaberta" ${f.aberta ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Aberta pelo QR</b></label>
      <p class="muted fila-nota">${f.aberta ? 'Quem está no terreiro pega a senha pelo celular.' : 'Pelo celular ninguém pega senha. O balcão continua emitindo.'}</p>
      <label class="fila-lim">Limite de senhas de atendimento<input type="number" id="fila-limite" data-act="filalimite" inputmode="numeric" min="0" max="1000" step="1" placeholder="sem limite" value="${f.limite ?? ''}"></label>
      <p class="muted fila-nota">Preferencial fica fora do limite e passe não tem limite.</p>
      <div class="fila-links"><a class="btn small" href="/fila?tv" target="_blank" rel="noopener">📺 Tela de TV</a><a class="btn small" href="/fila?cartaz" target="_blank" rel="noopener">🖨️ Cartaz com o QR</a></div>
      <p class="muted fila-nota">A tela de TV mostra a senha chamada e o QR, sem nomes. Abra no navegador da TV ou de um computador ligado nela.</p>` : ''}</div>`;
}

// A gira de hoje em que a fila funciona: existe, está em aberto e não é evento.
export function giraDaFila() {
  const g = estado.giras[hoje()];
  return g && !g.encerrada && !g.evento ? g : null;
}
// A sub-aba aparece só no dia da gira, para quem controla a fila.
export const veFila = () => { const g = giraDaFila(); return !!g && operadorFila(g); };

export function render() {
  const g = giraDaFila();
  if (!g || !operadorFila(g)) return '<section class="panel"><div class="card"><p class="muted">Hoje não tem gira em aberto com fila.</p></div></section>';
  return `<section class="panel">${blocoFila(g)}</section>`;
}

function blocoFila(g) {
  const f = estado.fila?.data === g.data ? estado.fila : null;
  if (!f) carregarFila(g.data);
  agendar(g.data);
  const tit = `<div class="fila-h"><h2>Fila de senhas</h2>${f && !f.erro ? `<span class="fila-selo ${f.aberta ? 'ok' : ''}">${f.aberta ? 'Aberta' : 'Fechada'}</span>` : ''}</div>`;
  if (!f) return `<div class="fila-card">${tit}<div class="loading">Carregando…</div></div>`;
  if (f.erro) return `<div class="fila-card">${tit}<p class="muted">${esc(f.erro)}</p></div>`;
  const L = f.senhas || [];
  const em = (k) => f.aguardando?.[k] || 0;
  const espera = TIPOS_FILA.map((t) => `<span class="fila-c ${t.k}"><b>${em(t.k)}</b> ${t.nome.toLowerCase()}</span>`).join('');
  return `<div class="fila-card">${tit}
    ${cartao(f, L)}
    <div class="fila-bts">${botaoChamar(L, 'atendimento', 'Chamar atendimento')}${botaoChamar(L, 'passe', 'Chamar passe')}</div>
    <p class="fila-cont">Aguardando ${espera}</p>
    ${f.atendimentoLotado ? '<p class="fila-lotado">As senhas de atendimento acabaram. Quem chegar agora pega passe.</p>' : ''}
    ${balcao(f)}
    ${lista(L)}
    ${ajustes(f)}</div>`;
}

export const cliques = {
  filachamar(el) { acaoFila(hoje(), 'filaChamar', { fila: el.dataset.f }); },
  filamarcar(el) { acaoFila(hoje(), 'filaMarcar', { id: el.dataset.id, status: el.dataset.s }); },
  filaver(el) { aba = el.dataset.v; avisar(); },
  filavoltar() { avisar(); },
  filabalcao() { balcaoAberto = !balcaoAberto; avisar(); if (balcaoAberto) document.getElementById('fb-nome')?.focus(); },
  filaajustes(el) { ajustesAberto = el.getAttribute('aria-expanded') !== 'true'; avisar(); },
};

export const mudancas = {
  filaaberta(t) { acaoFila(hoje(), 'filaConfig', { aberta: t.checked }); },
  filalimite(t) {
    const v = t.value.trim();
    acaoFila(hoje(), 'filaConfig', { limite: v === '' ? null : Number(v) });
  },
};

// O que foi digitado no balcão fica guardado para a atualização automática não apagar.
export function digitarFila(t) {
  if (!t.closest?.('#f-fila-balcao')) return false;
  const form = t.form;
  estado.filaBalcao = { tipo: form.querySelector('[name="fb-tipo"]:checked')?.value, nome: form.nome.value, telefone: form.telefone.value };
  return true;
}

export async function enviarBalcaoFila(form) {
  digitarFila(form.nome);
  const v = estado.filaBalcao || {};
  const tipo = v.tipo || 'atendimento';
  const ok = await acaoFila(hoje(), 'filaBalcao', { tipo, nome: v.nome, telefone: v.telefone });
  if (!ok) return;
  const s = (estado.fila?.senhas || []).filter((x) => x.balcao && x.tipo === tipo).sort((a, b) => b.numero - a.numero)[0];
  estado.filaBalcao = { tipo };
  balcaoAberto = false;
  aba = 'aguardando';
  if (s) toast(`Senha ${rotuloSenha(s.tipo, s.numero)} para ${s.nome}.`);
  avisar();
}

export function atualizarAoAbrir() {
  if (giraDaFila()) carregarFila(hoje(), { silencioso: estado.fila?.data === hoje() });
}
