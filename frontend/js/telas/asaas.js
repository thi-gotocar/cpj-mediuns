// Tela "ASAAS" (o root e quem tem a aba no perfil, como o Admin financeiro; sem "Editar", só olha): liga o Pix na aba Compras (cada Pedir gera um link de pagamento), acompanha
// os pedidos pagos e por pagar, mostra se a Vercel está configurada e o retorno do webhook (os eventos que o
// ASAAS mandou e o que o app fez com cada um).

import { estado, pode, carregarAsaas, acaoAsaas, avisar } from '../estado.js';
import { esc, toast } from '../util.js';
import { centavos, reais } from '/shared/ervas.js';

const R = (v) => reais(centavos(v));
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const URL_WEBHOOK = location.origin + '/api/oferendas?webhook=asaas';
// Conta B: o Pix dos itens de doação das Compras.
export const URL_WEBHOOK_B = location.origin + '/api/oferendas?webhook=asaas2';
const STATUS = { pendente: ['Aguardando pagamento', 'new'], paga: ['Paga', 'pleno'], vencida: ['Vencida', 're'], cancelada: ['Cancelada', 're'], estornada: ['Estornada', 're'] };
const editar = () => pode('asaas:editar');
const badge = (s) => { const [t, c] = STATUS[s] || [s, '']; return `<span class="badge ${c}">${esc(t)}</span>`; };

// Todos os blocos e sub-blocos começam minimizados.
const ui = { conexao: false, credito: false, cobrancas: false, eventos: false, cobSel: {}, evValores: new Set() };   // cobSel: grupo → quadradinho aberto
export function limpar() { ui.conexao = false; ui.credito = false; ui.cobrancas = false; ui.eventos = false; ui.cobSel = {}; ui.evValores.clear(); }

// Primeiro bloco, minimizado: o toggle do Pix e a configuração. Minimizado, mostra se o Pix está ligado e o ambiente.
function cardConexao(A) {
  const C = A.config;
  const ok = C.chave && C.token;
  const cab = `<button class="grp-h dobra" data-act="asaasdobrar" data-k="conexao" aria-expanded="${ui.conexao}"><h2>Conexão</h2>
    <span class="count">${A.ativo ? 'Pix ligado' : 'Pix desligado'} · ${esc(C.ambiente)} <span class="seta" aria-hidden="true">${ui.conexao ? '▾' : '▸'}</span></span></button>`;
  if (!ui.conexao) return `<div class="card adm">${cab}</div>`;
  const item = (v, t) => `<li>${v ? '✅' : '❌'} ${t}</li>`;
  return `<div class="card adm">${cab}
    <label class="of-sw"><input type="checkbox" role="switch" data-act="asaasativo" ${A.ativo ? 'checked' : ''} ${(!ok && !A.ativo) || !editar() ? 'disabled' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Pix visível nas Compras</b></label>
    <p class="muted" style="margin:0">${A.ativo ? 'Cada Pedir na aba Compras gera um link de pagamento Pix.' : 'Desligado: os pedidos da aba Compras não geram link de pagamento.'}</p>
    <ul class="as-cfg">${item(C.chave, 'ASAAS_API_KEY na Vercel')}${item(C.token, 'ASAAS_WEBHOOK_TOKEN na Vercel')}</ul>
    <label class="field">URL do webhook da conta A (Compras; cole no ASAAS da conta A, com o mesmo token)<input type="text" id="as-url" readonly value="${esc(URL_WEBHOOK)}"></label>
    <div class="cp-bts"><button class="btn" data-act="asaascopiar"><span aria-hidden="true">📋</span> Copiar URL</button></div>
    <ul class="as-cfg">${item(C.chaveB, 'ASAAS2_API_KEY na Vercel')}${item(C.tokenB, 'ASAAS2_WEBHOOK_TOKEN na Vercel')}</ul>
    <label class="field">URL do webhook da conta B (itens de doação; cole no ASAAS da conta B, com o mesmo token)<input type="text" id="as-url-b" readonly value="${esc(URL_WEBHOOK_B)}"></label>
    <div class="cp-bts"><button class="btn" data-act="asaascopiar" data-b="1"><span aria-hidden="true">📋</span> Copiar URL da conta B</button></div>
    <p class="muted" style="margin:0">As chaves ficam só nas variáveis da Vercel; o app nunca mostra o valor delas.</p></div>`;
}

// Quem gera link com cartão de crédito e Pix (nas Compras, conta A): os outros só têm Pix; doação é sempre Pix.
// Começa minimizado; quem tem ASAAS → Editar inclui (escolhendo do cadastro) e tira (✕, com confirmação).
function cardCredito(A) {
  const L = A.credito || [];
  const cab = `<button class="grp-h dobra" data-act="asaasdobrar" data-k="credito" aria-expanded="${ui.credito}"><h2><span aria-hidden="true">💳</span> Cartão de crédito</h2>
    <span class="count">${L.length} ${L.length === 1 ? 'pessoa' : 'pessoas'} <span class="seta" aria-hidden="true">${ui.credito ? '▾' : '▸'}</span></span></button>`;
  if (!ui.credito) return `<div class="card adm adm-financeiro">${cab}</div>`;
  const C = A.candidatos || [];
  const ops = (aluno) => C.filter((x) => x.aluno === aluno).map((x) => `<option value="${esc(x.chave)}">${esc(x.nome)}</option>`).join('');
  const add = editar() && C.length ? `<form class="of-por as-cred-add" data-form="asaascredito" autocomplete="off">
      <select name="pessoa" aria-label="Pessoa que pode pagar com cartão"><option value="">+ escolher do cadastro…</option>
        ${ops(false) ? `<optgroup label="Corrente">${ops(false)}</optgroup>` : ''}${ops(true) ? `<optgroup label="Alunos">${ops(true)}</optgroup>` : ''}</select>
      <button class="btn small primary" type="submit">Adicionar</button></form>` : '';
  const linha = (k) => `<li><span class="as-l1"><b>${esc(k.nome)}</b>${k.aluno ? ' <span class="tag of-aluno">aluno</span>' : ''}
      ${editar() ? (estado.confirm === 'acr:' + k.chave ? `<button class="btn small danger" data-act="asaascreditodel" data-chave="${esc(k.chave)}">Tirar</button>`
        : `<button class="btn small lock-x" data-act="askdel" data-k="acr:${esc(k.chave)}" aria-label="Tirar ${esc(k.nome)} da lista do cartão">✕</button>`) : ''}</span>
      <span class="as-l2 muted">${k.cpf ? 'CPF ' + esc(k.cpf) : 'Sem CPF no Perfil'}</span></li>`;
  return `<div class="card adm adm-financeiro">${cab}
    <p class="muted" style="margin:0;font-size:.88rem">Quem está aqui gera, nas Compras, o link em que escolhe <b>Pix ou cartão de crédito</b> (o que mais estiver ligado na conta A do ASAAS também aparece). Os outros continuam só com Pix; doação é sempre Pix. Vale para os próximos links.</p>
    ${add}
    ${L.length ? `<ul class="as-lista">${L.map(linha).join('')}</ul>` : '<p class="muted" style="margin:0">Ninguém cadastrado: todos pagam só com Pix.</p>'}</div>`;
}

// Sub-bloco que abre e fecha (começa minimizado), dentro de Pedidos e pagamentos e de Retorno do ASAAS.
function sub(conjunto, k, titulo, resumo, corpo) {
  const aberto = ui[conjunto].has(k);
  return `<div class="as-sub"><button class="as-sub-h" data-act="asaassub" data-c="${conjunto}" data-k="${esc(k)}" aria-expanded="${aberto}">
    <b>${titulo}</b><span class="as-sub-x">${resumo}<span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
    ${aberto ? `<div class="as-sub-c">${corpo()}</div>` : ''}</div>`;
}
// Junta em grupos mantendo a ordem em que aparecem (a lista já vem da mais nova para a mais antiga).
function juntar(lista, chave) {
  const m = new Map();
  lista.forEach((x) => { const k = chave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.entries()];
}

function linhaCobranca(c) {
  return `<li>
    <span class="as-l1"><b>${esc(c.nome)}</b>${c.conta === 'B' ? ' <span class="badge new" title="Conta B do ASAAS">Doação · conta B</span>' : ''}${c.forma === 'UNDEFINED' ? ' <span class="badge new" title="A pessoa escolhe na fatura">Pix ou cartão</span>' : ''}${badge(c.status)}</span>
    ${c.itens?.length ? `<span class="as-l2">${esc(c.itens.join(', '))}</span>` : ''}
    <span class="as-l2 muted">Pedido nº ${c.pedido} · gerado ${quando(c.criadoEm)}${c.pagoEm ? ' · pago ' + quando(c.pagoEm) : c.status === 'pendente' && c.vencimento ? ' · vence ' + new Date(c.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : ''}${c.link ? ` · <a href="${esc(c.link)}" target="_blank" rel="noopener">link</a>` : ''}</span>
    <span class="as-l3"><b>${R(c.valor)}</b>${c.status === 'pendente' && editar()
      ? (estado.confirm === 'asc:' + c.id ? `<button class="btn small danger" data-act="asaascancelar" data-id="${c.id}">Confirmar cancelamento</button>` : `<button class="btn small danger" data-act="askdel" data-k="asc:${c.id}">Cancelar</button>`)
      : ''}</span></li>`;
}

// Quadradinhos de situação em cada grupo: verde pago, amarelo pendente, cinza cancelado, vermelho atrasado e laranja estornado.
// Tocar abre a lista daquela situação embaixo; tocar de novo fecha.
const QUADROS = [
  ['paga', 'Pago', 'as-q-ok', (c) => c.status === 'paga'],
  ['pendente', 'Pendente', 'as-q-pend', (c) => c.status === 'pendente'],
  ['cancelada', 'Cancelado', 'as-q-canc', (c) => c.status === 'cancelada'],
  ['vencida', 'Atrasado', 'as-q-atr', (c) => c.status === 'vencida'],
  // Estornado (laranja): só aparece no grupo que tem algum, para os quatro de sempre não virarem duas linhas.
  ['estornada', 'Estornado', 'as-q-est', (c) => c.status === 'estornada'],
];
function grupoCobrancas(nome, cs) {
  const sel = ui.cobSel[nome];
  const aberto = QUADROS.find((q) => q[0] === sel);
  const lista = aberto ? cs.filter(aberto[3]) : [];
  return `<div class="as-grupo"><div class="as-grupo-h"><b>${esc(nome)}</b><span class="muted">${cs.length} ${cs.length === 1 ? 'link' : 'links'}</span></div>
    <div class="pf-of-totais as-quadros${cs.some((c) => c.status === 'estornada') ? ' cinco' : ''}">${QUADROS.filter(([k, , , f]) => k !== 'estornada' || cs.some(f)).map(([k, rot, cls, f]) => {
      const n = cs.filter(f).length;
      return `<button type="button" class="pf-of-total ${cls}${sel === k ? ' selecionado' : ''}" data-act="asaasquadro" data-g="${esc(nome)}" data-k="${k}" aria-expanded="${sel === k}" aria-label="${esc(nome)}: ${n} ${rot.toLowerCase()}" ${n ? '' : 'disabled'}><b>${n}</b><span>${rot}</span></button>`;
    }).join('')}</div>
    ${aberto && lista.length ? `<ul class="as-lista">${lista.map(linhaCobranca).join('')}</ul>` : ''}</div>`;
}

// Pedidos e pagamentos: começa minimizado; dentro, um grupo da aba Compras por vez, cada um com os seus quadradinhos.
function cardCobrancas(A) {
  const L = A.cobrancas;
  const cab = `<button class="grp-h dobra" data-act="asaasdobrar" data-k="cobrancas" aria-expanded="${ui.cobrancas}"><h2>Pedidos e pagamentos</h2>
    <span class="count">${L.filter((c) => c.status === 'pendente').length} pendentes · ${L.length} <span class="seta" aria-hidden="true">${ui.cobrancas ? '▾' : '▸'}</span></span></button>`;
  if (!ui.cobrancas) return `<div class="card adm adm-financeiro">${cab}</div>`;
  if (!L.length) return `<div class="card adm adm-financeiro">${cab}<p class="muted" style="margin:0">Nenhum link de pagamento gerado ainda.</p></div>`;
  const grupos = juntar(L, (c) => (c.grupos?.length ? c.grupos.join(' + ') : 'Sem grupo'));
  return `<div class="card adm adm-financeiro">${cab}<div class="as-grupos">${grupos.map(([nome, cs]) => grupoCobrancas(nome, cs)).join('')}</div></div>`;
}

// Do que se trata: os itens da cobrança (quando é do app) ou a descrição que veio do ASAAS.
function linhaEvento(e) {
  const oque = e.itens?.length ? e.itens.join(', ') : e.descricao || '';
  return `<li>
      <span class="as-l1"><b>${esc(e.evento)}</b><span class="muted">${quando(e.recebidoEm)}</span></span>
      <span class="as-l2">${e.nome ? `${esc(e.nome)} · pedido nº ${e.pedido}` : esc(e.paymentId || '—')}${e.status ? ` · <span class="muted">${esc(e.status)}</span>` : ''}</span>
      ${oque ? `<span class="as-l2">${esc(oque)}</span>` : ''}
      <span class="as-l2 muted">→ ${esc(e.resultado || '—')}</span></li>`;
}

// Situação do pagamento no ASAAS, como vem no evento.
const SIT_ASAAS = { RECEIVED: 'Recebido', CONFIRMED: 'Confirmado', RECEIVED_IN_CASH: 'Recebido em dinheiro', PENDING: 'Aguardando pagamento',
  OVERDUE: 'Vencido', REFUNDED: 'Estornado', REFUND_REQUESTED: 'Estorno pedido', CHARGEBACK_REQUESTED: 'Contestação', DELETED: 'Excluído' };
const ORDEM_SIT = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'PENDING', 'OVERDUE', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'DELETED'];
const descricaoEvento = (e) => e.descricao || (e.itens?.length ? e.itens.join(', ') : '') || 'Sem descrição';

// Retorno do ASAAS: separado pela situação do pagamento; dentro de cada uma, um sub-bloco por descrição e valor
// ("CPJ · Compras · pedido nº 7 · R$ 50,00"), minimizado, com quantos eventos.
function cardEventos(A) {
  const L = A.eventos;
  const cab = `<button class="grp-h dobra" data-act="asaasdobrar" data-k="eventos" aria-expanded="${ui.eventos}"><h2>Retorno do ASAAS</h2>
    <span class="count">${L.length} <span class="seta" aria-hidden="true">${ui.eventos ? '▾' : '▸'}</span></span></button>`;
  if (!ui.eventos) return `<div class="card adm adm-financeiro">${cab}</div>`;
  const porSit = juntar(L, (e) => e.status || '')
    .sort(([a], [b]) => (ORDEM_SIT.indexOf(a) + 1 || 99) - (ORDEM_SIT.indexOf(b) + 1 || 99));
  const corpo = L.length ? porSit.map(([sit, es]) => {
    const grupos = juntar(es, (e) => `${descricaoEvento(e)}${e.valor ?? ''}`);
    return `<div class="as-sit"><div class="as-sit-h"><h3>${esc(sit ? SIT_ASAAS[sit] || sit : 'Sem situação')}</h3><span class="muted">${es.length}</span></div>
      <div class="as-subs">${grupos.map(([k, gs]) => {
        const valor = gs[0].valor != null && gs[0].valor !== '' ? R(Number(gs[0].valor)) : 'sem valor';
        return sub('evValores', `${sit}${k}`, `${esc(descricaoEvento(gs[0]))} · ${esc(valor)}`, `${gs.length} ${gs.length === 1 ? 'evento' : 'eventos'} `, () => `<ul class="as-lista">${gs.map(linhaEvento).join('')}</ul>`);
      }).join('')}</div></div>`;
  }).join('')
    : '<p class="muted" style="margin:0">Nenhum evento recebido ainda.</p>';
  return `<div class="card adm adm-financeiro">${cab}${corpo}
    <div class="cp-bts"><button class="btn" data-act="asaasatualizar"><span aria-hidden="true">↻</span> Atualizar</button></div></div>`;
}

export function render() {
  if (estado.asaas === null) { carregarAsaas(); return '<div class="loading">Carregando o ASAAS…</div>'; }
  const A = estado.asaas;
  if (A.erro) return `<section class="panel"><div class="card"><p class="erro">${esc(A.erro)}</p><button class="btn" data-act="asaasatualizar">Tentar de novo</button></div></section>`;
  return `<section class="panel">${cardConexao(A)}${cardCredito(A)}${cardCobrancas(A)}${cardEventos(A)}</section>`;
}

export const cliques = {
  asaasdobrar(el) { ui[el.dataset.k] = !ui[el.dataset.k]; avisar(); },
  asaasquadro(el) { const g = el.dataset.g; ui.cobSel[g] = ui.cobSel[g] === el.dataset.k ? null : el.dataset.k; avisar(); },
  asaassub(el) { const s = ui[el.dataset.c]; const k = el.dataset.k; if (s.has(k)) s.delete(k); else s.add(k); avisar(); },
  asaasatualizar() { estado.asaas = null; avisar(); },
  async asaascreditodel(el) { estado.confirm = null; if (await acaoAsaas('credito', { chave: el.dataset.chave, remover: true })) toast('Saiu da lista do cartão: os próximos links são só Pix.'); },
  async asaascancelar(el) { if (await acaoAsaas('cancelar', { id: el.dataset.id })) toast('Cobrança cancelada.'); },
  asaascopiar(el) {
    const b = el?.dataset?.b === '1';
    const fb = () => { const t = document.getElementById(b ? 'as-url-b' : 'as-url'); t.focus(); t.select(); toast('URL selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(b ? URL_WEBHOOK_B : URL_WEBHOOK).then(() => toast('Copiado.'), fb); } catch { fb(); }
  },
};

// Formulário do bloco Cartão de crédito: inclui a pessoa escolhida.
export async function enviar(form) {
  const chave = form.elements.pessoa?.value;
  if (!chave) { toast('Escolha a pessoa.'); return; }
  const nome = form.elements.pessoa.selectedOptions[0]?.textContent || '';
  if (await acaoAsaas('credito', { chave })) toast(`${nome} já pode pagar com cartão de crédito ou Pix.`);
}

export const mudancas = {
  async asaasativo(t) { if (!(await acaoAsaas('ativar', { ativo: t.checked }))) t.checked = !t.checked; },
};
