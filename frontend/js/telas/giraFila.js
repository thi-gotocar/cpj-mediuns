// Sub-aba Fila (aba Gira), sempre a gira de hoje: o painel de quem controla a fila de senhas — a pessoa com a função Senha (no cadastro ou no
// dia), quem edita a Gira e o root. O servidor confere tudo; aqui só se esconde o bloco.
// Abre e fecha a entrada pelo QR, ajusta o limite do atendimento, chama a próxima (preferenciais primeiro; o passe é
// outra fila), emite senha no balcão e marca cada senha. Atualiza sozinho de tempos em tempos (outros celulares no painel).

import { estado, pode, prefs, carregarFila, acaoFila, avisar } from '../estado.js';
import { esc, hoje, toast } from '../util.js';
import { api } from '../api.js';
import { TIPOS_FILA, rotuloSenha, CHAMAR_LOTE } from '/shared/fila.js';

const ATUALIZAR_MS = 10000;
let timer = null;
let aba = 'aguardando';   // lista aberta: aguardando | chamada | atendida | ausente | cancelada
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
const naFila = (L, fila) => L.filter((s) => s.status === 'aguardando' && (fila === 'passe' ? s.tipo === 'passe' : s.tipo !== 'passe')).sort(ordem);
const proxima = (L, fila) => naFila(L, fila)[0];

// Chamar de 10 em 10, um botão por tipo (do tamanho dos botões Chamar atendimento / passe): Chamar Preferencial, Chamar
// Atendimento e Chamar Passe. Cada um chama as próximas 10 daquele tipo, na ordem (com menos, as que houver), depois de
// confirmar; cada celular recebe o aviso e a TV mostra todas.
const NOME_LOTE = { preferencial: ['preferencial', 'preferenciais'], atendimento: ['de atendimento', 'de atendimento'], passe: ['de passe', 'de passe'] };
function chamarLote(L) {
  const lotes = TIPOS_FILA.map((t) => {
    const v = L.filter((s) => s.status === 'aguardando' && s.tipo === t.k).sort(ordem).slice(0, CHAMAR_LOTE);
    return [t.k, t.nome, v];
  });
  const texto = (tipo, n) => (n === 1 ? `a próxima senha ${NOME_LOTE[tipo][0]}` : `as próximas ${n} senhas ${NOME_LOTE[tipo][1]}`);
  const aberta = lotes.find(([k]) => estado.confirm === 'filalote:' + k);
  if (aberta && aberta[2].length) {
    const [k, , v] = aberta;
    return `<div class="fila-lote-conf"><p><b>Chamar ${texto(k, v.length)}?</b> ${v.map((s) => esc(rot(s))).join(', ')}.</p>
      <div class="fila-acoes"><button type="button" class="btn small primary" data-act="filalote" data-f="${k === 'passe' ? 'passe' : 'atendimento'}" data-t="${k}" data-n="${v.length}">Chamar ${v.length}</button><button type="button" class="btn small" data-act="filavoltar">Voltar</button></div></div>`;
  }
  return `<div class="fila-lote">${lotes.map(([k, nome, v]) => `<button type="button" class="btn fila-chamar fila-lote-${k}" data-act="askdel" data-k="filalote:${k}" ${v.length ? '' : 'disabled'}>
      <span>Chamar ${esc(nome)}</span><small>${v.length ? `${v.length} · <b>${esc(rot(v[0]))}${v.length > 1 ? '–' + esc(rot(v.at(-1))) : ''}</b>` : 'Ninguém aguardando'}</small></button>`).join('')}</div>`;
}

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
  // OK: a pessoa já foi para o atendimento; a senha sai da TV e vai para Atendidas.
  if (s.status === 'chamada') return `<span class="fila-acoes">${b('atendida', 'OK', 'primary')}${b('chamada', 'Chamar de novo')}${b('ausente', 'Ausente')}</span>`;
  if (s.status === 'atendida') return `<span class="fila-acoes">${b('chamada', 'Desfazer')}</span>`;
  if (s.status === 'ausente') return `<span class="fila-acoes">${b('aguardando', 'Voltar à fila')}${cancelar}</span>`;
  return '';
}

function linha(s) {
  const quando = s.status === 'chamada' || s.status === 'atendida' ? `Chamada às ${hora(s.chamadaEm)}` : `Pegou às ${hora(s.criadaEm)}`;
  const extra = [s.balcao ? 'no balcão' : '', s.telefone ? `<a href="tel:${esc(s.telefone)}">${esc(s.telefone)}</a>` : ''].filter(Boolean).join(', ');
  return `<li class="fila-l ${s.tipo}"><span class="fila-num">${esc(rot(s))}</span>
    <span class="fila-quem"><b>${esc(s.nome)}</b><small>${quando}${extra ? `, ${extra}` : ''}</small></span>
    ${acoes(s)}</li>`;
}

function lista(L) {
  const grupos = [['aguardando', 'Na fila'], ['chamada', 'Chamadas'], ['atendida', 'Atendidas'], ['ausente', 'Ausentes'], ['cancelada', 'Canceladas']];
  const de = (st) => L.filter((s) => s.status === st);
  // Todas as listas na ordem da senha, crescente (preferencial, atendimento e passe; cada tipo pelo número), como a TV.
  const itens = de(aba).sort(ordem);
  return `<div class="fila-sec"><div class="seg fila-seg">${grupos.map(([k, t]) => `<button type="button" data-act="filaver" data-v="${k}" aria-pressed="${aba === k}">${t} <span class="fila-n">${de(k).length}</span></button>`).join('')}</div>
    ${itens.length ? `<ul class="fila-lista">${itens.map(linha).join('')}</ul>` : `<p class="muted fila-vazio">${aba === 'aguardando' ? 'Ninguém aguardando.' : 'Nenhuma senha aqui.'}</p>`}</div>`;
}

function balcao(f) {
  if (!balcaoAberto) return `<button type="button" class="btn primary btn-grande fila-balcao-bt" data-act="filabalcao"><span aria-hidden="true">＋</span> Senha no balcão<small>Para quem não tem celular ou não conseguiu</small></button>`;
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

// No topo do painel, as senhas chamadas agora (as mesmas da TV): senha e nome, na ordem da senha, com OK, Chamar de novo
// e Ausente. OK e Ausente tiram da lista (e da TV); Chamar de novo marca a linha em vermelho por uns segundos (aqui e
// nos outros celulares do painel, que veem a hora da chamada mudar). Embaixo, as próximas da fila de atendimento.
const DESTAQUE_MS = 12000;
let vistas = null;            // chave → hora da chamada, para notar quem foi chamado de novo
const destaque = new Map();   // chave → até quando fica vermelho
function chamadasAgora(L) {
  const ch = L.filter((s) => s.status === 'chamada').sort(ordem);
  const agora = Date.now();
  const atual = new Map(ch.map((s) => [s.id, s.chamadaEm || '']));
  if (vistas) for (const [id, quando] of atual) if (vistas.has(id) && vistas.get(id) !== quando) destaque.set(id, agora + DESTAQUE_MS);
  vistas = atual;
  for (const [id, ate] of destaque) if (ate < agora || !atual.has(id)) destaque.delete(id);
  const prox = L.filter((s) => s.status === 'aguardando' && s.tipo !== 'passe').sort(ordem).slice(0, 4).map(rot);
  const proximas = `<p class="fila-prox"><span>Próximas</span>${prox.length ? `<b>${prox.map(esc).join(' ')}</b>` : '<span class="muted">ninguém aguardando</span>'}</p>`;
  if (!ch.length) return `<div class="fila-agora vazio"><p class="fila-agora-vazio">Ninguém chamado agora.</p>${proximas}</div>`;
  const b = (s, st, txt, extra = '') => `<button type="button" class="btn small ${extra}" data-act="filamarcar" data-id="${esc(s.id)}" data-s="${st}">${txt}</button>`;
  return `<div class="fila-agora" aria-live="polite"><h3 class="fila-agora-t">Chamadas agora <span class="fila-n">${ch.length}</span></h3>
    <ul class="fila-agora-l">${ch.map((s) => {
      const re = destaque.has(s.id);
      return `<li class="fila-ch ${s.tipo}${re ? ' rechamada' : ''}"><b class="fila-ch-n">${esc(rot(s))}</b>
        <span class="fila-ch-q"><b>${esc(s.nome)}</b><small>${re ? 'chamada de novo' : 'chamada'} às ${hora(s.chamadaEm)}</small></span>
        <span class="fila-acoes">${b(s, 'atendida', 'OK', 'primary')}${b(s, 'chamada', 'Chamar de novo')}${b(s, 'ausente', 'Ausente')}</span></li>`;
    }).join('')}</ul>${proximas}</div>`;
}

// Encerrar (ou reabrir) a entrada pelo QR sem abrir os Ajustes, que ficam recolhidos depois da primeira senha.
// Encerrar pede confirmação; quem já tem senha continua na fila e o balcão continua emitindo.
function entradaQr(f) {
  if (f.manual) return '';   // só senha manual: o QR não emite, nada a encerrar
  if (!f.aberta) {
    return (f.senhas || []).length ? '<button type="button" class="btn small fila-entrada" data-act="filaentrada" data-v="1">Reabrir a entrada pelo QR</button>' : '';
  }
  if (estado.confirm === 'filafechar') {
    return `<div class="fila-lote-conf"><p><b>Encerrar a entrada pelo QR?</b> Ninguém mais pega senha pelo celular. Quem já tem senha continua na fila, e o balcão continua emitindo.</p>
      <div class="fila-acoes"><button type="button" class="btn small danger" data-act="filaentrada" data-v="0">Encerrar entrada</button><button type="button" class="btn small" data-act="filavoltar">Voltar</button></div></div>`;
  }
  return '<button type="button" class="btn small fila-entrada" data-act="askdel" data-k="filafechar">⛔ Encerrar a entrada pelo QR</button>';
}

function ajustes(f) {
  const aberto = ajustesAberto ?? (!f.aberta && !(f.senhas || []).length);
  const usadas = f.emitidas?.atendimento || 0;
  const resumo = `${!f.aberta ? 'Fechada.' : f.manual ? 'Aberta, só senha manual (balcão).' : 'Aberta pelo QR.'} ${f.limite != null ? `${usadas} de ${f.limite} senhas de atendimento` : `${usadas} ${usadas === 1 ? 'senha' : 'senhas'} de atendimento, sem limite`}.`;
  return `<div class="fila-sec fila-ajustes"><button type="button" class="fila-ajustes-h" data-act="filaajustes" aria-expanded="${aberto}">
      <span><b>Ajustes da fila</b><small>${resumo}</small></span><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>
    ${aberto ? `<label class="of-sw"><input type="checkbox" role="switch" data-act="filaaberta" ${f.aberta ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Aberta pelo QR</b></label>
      <p class="muted fila-nota">${f.aberta ? 'Quem está no terreiro pega a senha pelo celular.' : 'Pelo celular ninguém pega senha. O balcão continua emitindo.'}</p>
      <label class="of-sw"><input type="checkbox" role="switch" data-act="filamanual" ${f.manual ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Só senha manual (balcão)</b></label>
      <p class="muted fila-nota">${f.manual ? 'Ligado: o celular não pega senha pelo QR; as senhas saem só pelo ＋ Senha no balcão. A página e a TV mostram as chamadas e avisam que as senhas são no balcão.' : 'Ligue para emitir as senhas só no balcão (o QR continua mostrando as chamadas).'}</p>
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
// A sub-aba aparece sempre para quem controla a fila (a troca do dia para Senha vale pela gira de hoje).
export const veFila = () => operadorFila(estado.giras[hoje()] || {});

// Fora do dia da gira: diz por que não há fila hoje e deixa a TV e o cartaz à mão (dá para preparar antes).
function semFila() {
  const g = estado.giras[hoje()];
  const motivo = !g ? 'Hoje não tem gira cadastrada.' : g.encerrada ? 'A gira de hoje já foi encerrada.' : 'Hoje é evento: não tem fila de senhas.';
  return `<section class="panel">${cardBlocoGeral()}<div class="fila-card"><div class="fila-h"><h2>Fila de senhas</h2><span class="fila-selo">Sem fila hoje</span></div>
    <div class="fila-vazia"><b>${motivo}</b><p class="muted">A fila funciona no dia da gira: abra aqui e ligue <b>Aberta pelo QR</b> nos Ajustes da fila.</p></div>
    <div class="fila-links"><a class="btn small" href="/fila?tv" target="_blank" rel="noopener">📺 Tela de TV</a><a class="btn small" href="/fila?cartaz" target="_blank" rel="noopener">🖨️ Cartaz com o QR</a></div></div></section>`;
}

// Só o root: o bloco da fila (e a doação) na aba Geral de alunos, consulentes e grupo Oferenda, visível ou não.
// Fica aqui, em qualquer dia, para ligar antes da gira. Começa desligado.
let lendoBlocoGeral = false;
function cardBlocoGeral() {
  if (!pode('usuarios:gerenciar')) return '';
  if (estado.filaBlocoGeral === undefined && !lendoBlocoGeral) {
    lendoBlocoGeral = true;
    api('GET', '/giras?lista=filaGeral').then((r) => { estado.filaBlocoGeral = !!r.ativa; }, (e) => { toast(e.message); })
      .finally(() => { lendoBlocoGeral = false; avisar(); });
  }
  const on = !!estado.filaBlocoGeral;
  return `<div class="card adm fila-geral-sw"><label class="of-sw"><input type="checkbox" role="switch" data-act="filageralsw" ${on ? 'checked' : ''} ${estado.filaBlocoGeral === undefined ? 'disabled' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Fila na aba Geral visível para todos</b></label>
    <p class="muted fila-nota">${on ? 'Ligado: alunos, consulentes e grupo Oferenda veem na aba Geral a fila do dia (pegar senha e acompanhar) e a doação.' : 'Desligado: o bloco da fila e da doação não aparece na aba Geral. A página /fila do QR continua funcionando.'}</p></div>`;
}

export function render() {
  if (!operadorFila(estado.giras[hoje()] || {})) return '<section class="panel"><div class="card"><p class="muted">Só quem cuida da fila vê esta tela.</p></div></section>';
  const g = giraDaFila();
  return g ? `<section class="panel">${cardBlocoGeral()}${blocoFila(g)}</section>` : semFila();
}

function blocoFila(g) {
  const f = estado.fila?.data === g.data ? estado.fila : null;
  if (!f) carregarFila(g.data);
  agendar(g.data);
  const tit = `<div class="fila-h"><h2>Fila de senhas</h2>${f && !f.erro ? `<span class="fila-selo ${f.aberta ? 'ok' : ''}">${!f.aberta ? 'Fechada' : f.manual ? 'Só balcão' : 'Aberta'}</span>` : ''}</div>`;
  if (!f) return `<div class="fila-card">${tit}<div class="loading">Carregando…</div></div>`;
  if (f.erro) return `<div class="fila-card">${tit}<p class="muted">${esc(f.erro)}</p></div>`;
  const L = f.senhas || [];
  const em = (k) => f.aguardando?.[k] || 0;
  const espera = TIPOS_FILA.map((t) => `<span class="fila-c ${t.k}"><b>${em(t.k)}</b> ${t.nome.toLowerCase()}</span>`).join('');
  return `<div class="fila-card">${tit}
    ${chamadasAgora(L)}
    <div class="fila-bts">${botaoChamar(L, 'atendimento', 'Chamar atendimento')}${botaoChamar(L, 'passe', 'Chamar passe')}</div>
    ${chamarLote(L)}
    <p class="fila-cont">Aguardando ${espera}</p>
    ${f.atendimentoLotado ? '<p class="fila-lotado">As senhas de atendimento acabaram. Quem chegar agora pega passe.</p>' : ''}
    ${entradaQr(f)}
    ${balcao(f)}
    ${lista(L)}
    ${ajustes(f)}</div>`;
}

export const cliques = {
  filachamar(el) { acaoFila(hoje(), 'filaChamar', { fila: el.dataset.f }); },
  filalote(el) { acaoFila(hoje(), 'filaChamar', { fila: el.dataset.f, tipo: el.dataset.t, quantidade: Number(el.dataset.n) }); },
  filamarcar(el) { acaoFila(hoje(), 'filaMarcar', { id: el.dataset.id, status: el.dataset.s }); },
  filaver(el) { aba = el.dataset.v; avisar(); },
  filavoltar() { avisar(); },
  filabalcao() { balcaoAberto = !balcaoAberto; avisar(); if (balcaoAberto) document.getElementById('fb-nome')?.focus(); },
  filaentrada(el) { acaoFila(hoje(), 'filaConfig', { aberta: el.dataset.v === '1' }); },
  filaajustes(el) { ajustesAberto = el.getAttribute('aria-expanded') !== 'true'; avisar(); },
};

export const mudancas = {
  async filageralsw(t) {
    const ativa = t.checked;
    try {
      estado.filaBlocoGeral = !!(await api('POST', '/giras', { acao: 'filaGeral', ativa })).ativa;
      toast(estado.filaBlocoGeral ? 'A fila aparece na aba Geral.' : 'A fila saiu da aba Geral.');
    } catch (e) { toast(e.message); }
    avisar();
  },
  filaaberta(t) { acaoFila(hoje(), 'filaConfig', { aberta: t.checked }); },
  filamanual(t) { acaoFila(hoje(), 'filaConfig', { manual: t.checked }); },
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
