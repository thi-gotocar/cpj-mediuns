// Sub-aba Eventos da aba Eventos (antiga Oferendas): a lista de pessoas de cada evento (regras em shared/convites.js).
// Quem administra as oferendas cria o evento (nome e data), adiciona pessoas escolhendo a lista do cadastro (marca quem
// entra) ou digitando alguém de fora (vai para Convidados) e tira com o ✕ (Cancelar / Confirmar). A lista aparece
// separada por grupo; no fim, o WhatsApp manda os nomes numa lista só, na ordem dos grupos.

import { estado, avisar } from '../estado.js';
import { api } from '../api.js';
import { esc, toast, hoje } from '../util.js';
import { gruposDe, textoWhatsConvites, LISTA_CONVIDADOS, RESPOSTAS, contagem, naoVai } from '/shared/convites.js';
import { ICONE_WHATS } from './giraComum.js';

const FORA = '__fora__';
const U = () => (estado.cvUi ||= { abertos: null, novo: false, editar: null, add: null, origem: '', marcados: new Set(), confirmar: null, enviando: false });
export function limpar() { estado.cvUi = null; }

async function carregar(cadastro = false) {
  try {
    const r = await api('GET', '/oferendas?lista=convites' + (cadastro ? '&cadastro=1' : ''));
    estado.convites = { ...r, cadastro: r.cadastro || estado.convites?.cadastro || null };
  } catch (e) { estado.convites = { erro: e.message }; }
  avisar();
}
async function acao(op, dados) {
  const u = U();
  if (u.enviando) return false;
  u.enviando = true;
  try {
    const r = await api('POST', '/oferendas', { acao: 'convites', op, ...dados });
    estado.convites = { ...estado.convites, ...r };
    return true;
  } catch (e) { toast(e.message); return false; } finally { u.enviando = false; avisar(); }
}

const dataBR = (d) => d.split('-').reverse().join('/');
const qtd = (n) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;

// Painel "Adicionar pessoas": de qual lista do cadastro (com caixinhas) ou alguém de fora.
function painelAdicionar(ev) {
  const u = U();
  const C = estado.convites;
  const ja = new Set(ev.pessoas.map((p) => p.chave));
  const listas = C.cadastro || [];
  const opcoes = `<option value="">Escolha…</option>${listas.map((g, i) => `<option value="${i}" ${u.origem === String(i) ? 'selected' : ''}>${esc(g.lista)} (${g.pessoas.length})</option>`).join('')}
    <option value="${FORA}" ${u.origem === FORA ? 'selected' : ''}>Pessoa de fora (sem cadastro)</option>`;
  let corpo = '';
  if (!C.cadastro) corpo = '<p class="muted cv-dica">Carregando as listas do cadastro…</p>';
  else if (u.origem === FORA) {
    corpo = `<form class="cv-fora" data-form="cvfora" data-id="${ev.id}" autocomplete="off">
      <label class="field grow">Nome da pessoa<input type="text" name="nome" maxlength="60" required placeholder="Ex.: Maria Souza"></label>
      <button class="btn primary" type="submit" ${u.enviando ? 'disabled' : ''}>Adicionar</button></form>
      <p class="muted cv-dica">Quem não tem cadastro entra no grupo ${LISTA_CONVIDADOS}.</p>`;
  } else if (u.origem !== '') {
    const g = listas[Number(u.origem)];
    if (g) {
      const livres = g.pessoas.filter((p) => !ja.has(p.chave));
      const marc = livres.filter((p) => u.marcados.has(p.chave)).length;
      corpo = `<div class="cv-escolha">
        ${livres.length ? `<label class="cv-ck cv-todos"><input type="checkbox" data-act="cvtodos" ${marc === livres.length ? 'checked' : ''}> <b>Marcar todos (${livres.length})</b></label>` : ''}
        <div class="cv-cks">${g.pessoas.map((p) => (ja.has(p.chave)
          ? `<label class="cv-ck ja"><input type="checkbox" checked disabled> ${esc(p.nome)} <span class="muted">· já está</span></label>`
          : `<label class="cv-ck"><input type="checkbox" data-act="cvmarcar" data-chave="${esc(p.chave)}" ${u.marcados.has(p.chave) ? 'checked' : ''}> ${esc(p.nome)}</label>`)).join('')}</div>
        <button class="btn primary" data-act="cvaddsel" data-id="${ev.id}" ${marc && !u.enviando ? '' : 'disabled'}>Adicionar ${marc ? `(${marc})` : ''}</button></div>`;
    }
  }
  return `<div class="cv-add"><div class="cv-add-h"><b>Adicionar pessoas</b><button class="btn small" data-act="cvaddfechar">Fechar</button></div>
    <label class="field">De qual lista?<select data-act="cvorigem" data-id="${ev.id}">${opcoes}</select></label>${corpo}</div>`;
}

function formEvento(ev) {
  return `<form class="cv-form" data-form="cvevento" data-id="${ev?.id || ''}" autocomplete="off">
    <label class="field grow">Nome do evento<input type="text" name="nome" maxlength="80" required value="${esc(ev?.nome || '')}" placeholder="Ex.: Festa de Caboclo"></label>
    <label class="field">Data<input type="date" name="data" required value="${ev?.data || ''}"></label>
    <span class="row"><button class="btn primary" type="submit">${ev ? 'Salvar' : 'Criar evento'}</button>
      <button class="btn" type="button" data-act="${ev ? 'cveditarnao' : 'cvnovo'}">Cancelar</button></span></form>`;
}

// Selo da resposta na lista (todos veem; sem resposta: o admin pôs e a pessoa ainda não respondeu).
const SELO = { vou: ['vou', '✓ Vou'], nao: ['nao', 'Não vou'], desisti: ['desisti', 'Desisti'] };
const selo = (p) => (SELO[p.resposta] ? `<span class="cv-selo ${SELO[p.resposta][0]}">${SELO[p.resposta][1]}</span>` : '');

// "Você vai?": a pessoa da corrente responde e põe os convidados dela (só no evento que ainda não passou).
function blocoEu(ev) {
  const u = U();
  const eu = estado.convites.eu;
  if (!eu || ev.data < hoje()) return '';
  const minha = ev.pessoas.find((p) => p.chave === eu.chave);
  const r = minha?.resposta || '';
  const bts = RESPOSTAS.filter(([k]) => k !== 'desisti' || r === 'vou' || r === 'desisti')
    .map(([k, t]) => `<button type="button" class="btn small cv-resp ${k}" data-act="cvresp" data-id="${ev.id}" data-v="${k}" aria-pressed="${r === k}" ${u.enviando ? 'disabled' : ''}>${t}</button>`).join('');
  const meus = ev.pessoas.filter((p) => p.por === eu.chave);
  const conv = meus.map((p) => {
    const k = 'g:' + ev.id + ':' + p.chave;
    return `<li class="cv-p${u.confirmar === k ? ' conf' : ''}"><span class="cv-nome">${esc(p.nome)}</span>${u.confirmar === k
      ? `<span class="cv-conf">Tirar o convidado? <button class="btn small" data-act="cvcancelar">Cancelar</button><button class="btn small danger" data-act="cvtirarconv" data-id="${ev.id}" data-chave="${esc(p.chave)}">Confirmar</button></span>`
      : `<button class="cv-x" data-act="cvconfirmar" data-k="${esc(k)}" aria-label="Tirar ${esc(p.nome)}">✕</button>`}</li>`;
  }).join('');
  return `<div class="cv-eu"><p class="cv-eu-t">${minha && !r ? 'Você está na lista. Vai?' : 'Você vai?'}</p><div class="cv-bts">${bts}</div>
    ${r === 'desisti' ? '<p class="muted cv-dica">Você desistiu. Se mudar de ideia, toque em Vou.</p>' : ''}
    <p class="cv-eu-t">Seus convidados <span class="muted">· ${meus.length}</span></p>
    ${meus.length ? `<ul class="cv-lista">${conv}</ul>` : ''}
    <form class="cv-fora" data-form="cvconv" data-id="${ev.id}" autocomplete="off">
      <label class="field grow">Nome do convidado<input type="text" name="nome" maxlength="60" required placeholder="Ex.: Maria Souza"></label>
      <button class="btn" type="submit" ${u.enviando ? 'disabled' : ''}>＋ Convidar</button></form></div>`;
}

function cardEvento(ev, admin) {
  const u = U();
  const aberto = u.abertos.has(ev.id);
  const passou = ev.data < hoje();
  let h = `<div class="card cv-ev${passou ? ' passou' : ''}"><button class="grp-h dobra" data-act="cvabrir" data-id="${ev.id}" aria-expanded="${aberto}">
    <h2><span class="cv-data">${dataBR(ev.data)}</span> ${esc(ev.nome)}</h2><span class="count">${ev.pessoas.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  h += blocoEu(ev);
  // Quem administra: o resumo das respostas.
  if (admin && ev.pessoas.length) {
    const c = contagem(ev.pessoas);
    const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
    h += `<p class="cv-cont"><b>${c.vao}</b> na lista para ir · ${pl(c.confirmados, 'confirmou', 'confirmaram')} · ${pl(c.nao, 'não vai', 'não vão')} · ${pl(c.desistiram, 'desistiu', 'desistiram')} · ${c.semResposta} sem resposta</p>`;
  }
  if (admin && u.editar === ev.id) h += formEvento(ev);
  else if (admin) {
    const conf = u.confirmar === 'ev:' + ev.id;
    h += `<div class="cv-bts">${u.add === ev.id ? '' : `<button class="btn small primary" data-act="cvadd" data-id="${ev.id}">＋ Adicionar pessoas</button>`}
      <button class="btn small" data-act="cveditar" data-id="${ev.id}">✎ Editar</button>
      ${conf ? `<span class="cv-conf">Excluir o evento e a lista? <button class="btn small" data-act="cvcancelar">Cancelar</button><button class="btn small danger" data-act="cvexcluirev" data-id="${ev.id}">Confirmar</button></span>`
        : `<button class="btn small" data-act="cvconfirmar" data-k="ev:${ev.id}">Excluir evento</button>`}</div>`;
    if (u.add === ev.id) h += painelAdicionar(ev);
  }
  // Uma pessoa da lista: o nome (com quem convidou), o selo da resposta e, para quem administra, o ✕ (Cancelar / Confirmar).
  const linha = (p) => {
    const k = 'p:' + ev.id + ':' + p.chave;
    const conf = u.confirmar === k;
    const de = p.por && p.porNome ? `<small class="muted cv-de">convidado de ${esc(p.porNome)}</small>` : '';
    return `<li class="cv-p${conf ? ' conf' : ''}${naoVai(p) ? ' fora' : ''}"><span class="cv-nome">${esc(p.nome)}${de}</span>${selo(p)}${!admin ? '' : conf
      ? `<span class="cv-conf">Tirar da lista? <button class="btn small" data-act="cvcancelar">Cancelar</button><button class="btn small danger" data-act="cvremover" data-id="${ev.id}" data-chave="${esc(p.chave)}">Confirmar</button></span>`
      : `<button class="cv-x" data-act="cvconfirmar" data-k="${esc(k)}" aria-label="Tirar ${esc(p.nome)} da lista">✕</button>`}</li>`;
  };
  const porGrupo = (L) => gruposDe(L).map((g) => `<div class="cv-grupo"><h3 class="cv-g-h">${esc(g.lista)} <span class="muted">· ${g.pessoas.length}</span></h3>
      <ul class="cv-lista">${g.pessoas.map(linha).join('')}</ul></div>`).join('');
  // O WhatsApp leva quem vai: para quem administra, fica logo depois de ✅ Vão (antes da lista longa de Faltam responder,
  // embaixo da qual parecia ter sumido); para a corrente, no fim da lista.
  const whats = ev.pessoas.length ? `<div class="cv-fim"><span class="muted">${qtd(contagem(ev.pessoas).vao)} no WhatsApp</span>
      <a class="btn wa-bt" href="https://wa.me/?text=${encodeURIComponent(textoWhatsConvites(ev))}" target="_blank" rel="noopener"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Compartilhar lista</a></div>` : '';
  if (admin) {
    // Quem administra: separado em quem vai (por grupo), quem não vai e quem da corrente ainda falta responder.
    const vao = ev.pessoas.filter((p) => !naoVai(p));
    const nao = ev.pessoas.filter(naoVai).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const naLista = new Set(ev.pessoas.map((p) => p.chave));
    const faltam = (estado.pessoas || []).filter((x) => !naLista.has('p:' + x.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const passou = ev.data < hoje();
    const sec = (cls, titulo, n, corpo) => `<div class="cv-sec ${cls}"><h3 class="cv-sec-h">${titulo} <span class="count">${n}</span></h3>${corpo}</div>`;
    h += sec('vao', '✅ Vão', vao.length, vao.length ? porGrupo(vao) : '<p class="muted cv-dica">Ninguém ainda.</p>') + whats;
    h += sec('nao', '❌ Não vão', nao.length, nao.length ? `<ul class="cv-lista">${nao.map(linha).join('')}</ul>` : '<p class="muted cv-dica">Ninguém.</p>');
    if (!passou) {
      h += sec('falta', '⏳ Faltam responder <small class="muted">(corrente)</small>', faltam.length, faltam.length
        ? `<div class="cv-faltam" data-rolar="8">${faltam.map((x) => `<span>${esc(x.nome)}</span>`).join('')}</div>`
        : '<p class="muted cv-dica">Toda a corrente já respondeu ou está na lista.</p>');
    }
  } else {
    h += (ev.pessoas.length ? porGrupo(ev.pessoas) : '<p class="muted cv-dica">Ninguém na lista ainda.</p>') + whats;
  }
  return h + '</div>';
}

export function conteudo() {
  const C = estado.convites;
  if (!C) { if (C === undefined || C === null) { estado.convites = false; carregar(); } return '<div class="loading">Carregando os eventos…</div>'; }
  if (C.erro) return `<div class="card"><p class="erro">${esc(C.erro)}</p><button class="btn" data-act="cvrecarregar">Tentar de novo</button></div>`;
  const u = U();
  // Ao abrir: o próximo evento já vem aberto.
  if (!u.abertos) u.abertos = new Set(C.eventos.filter((e) => e.data >= hoje()).slice(0, 1).map((e) => e.id));
  const admin = !!C.admin;
  const novo = admin ? (u.novo ? `<div class="card adm">${formEvento(null)}</div>` : '<button class="btn primary cv-novo" data-act="cvnovo">＋ Novo evento</button>') : '';
  const futuros = C.eventos.filter((e) => e.data >= hoje());
  const passados = C.eventos.filter((e) => e.data < hoje());
  return `<div class="cv">${novo}
    ${C.eventos.length ? '' : `<div class="card empty"><p class="muted">${admin ? 'Nenhum evento ainda. Toque em ＋ Novo evento.' : 'Nenhum evento por enquanto.'}</p></div>`}
    ${futuros.map((e) => cardEvento(e, admin)).join('')}
    ${passados.length ? `<h3 class="cv-passados">Eventos que já passaram</h3>${passados.map((e) => cardEvento(e, admin)).join('')}` : ''}</div>`;
}

export const cliques = {
  async cvresp(el) { if (await acao('responder', { eventoId: el.dataset.id, resposta: el.dataset.v })) toast({ vou: 'Que bom! Você está na lista.', nao: 'Anotado: você não vai.', desisti: 'Anotado: você desistiu.' }[el.dataset.v]); },
  async cvtirarconv(el) { U().confirmar = null; if (await acao('tirarConvidado', { eventoId: el.dataset.id, chave: el.dataset.chave })) toast('Convidado tirado da lista.'); },
  cvrecarregar() { estado.convites = null; avisar(); },
  cvnovo() { U().novo = !U().novo; avisar(); },
  cvabrir(el) { const a = U().abertos; if (a.has(el.dataset.id)) a.delete(el.dataset.id); else a.add(el.dataset.id); avisar(); },
  cveditar(el) { U().editar = el.dataset.id; avisar(); },
  cveditarnao() { U().editar = null; avisar(); },
  cvconfirmar(el) { U().confirmar = el.dataset.k; avisar(); },
  cvcancelar() { U().confirmar = null; avisar(); },
  async cvexcluirev(el) { U().confirmar = null; if (await acao('eventoExcluir', { id: el.dataset.id })) toast('Evento excluído.'); },
  async cvremover(el) { U().confirmar = null; if (await acao('remover', { eventoId: el.dataset.id, chave: el.dataset.chave })) toast('Pessoa tirada da lista.'); },
  cvadd(el) {
    Object.assign(U(), { add: el.dataset.id, origem: '', marcados: new Set() });
    if (!estado.convites.cadastro) carregar(true); else avisar();
  },
  cvaddfechar() { Object.assign(U(), { add: null, origem: '', marcados: new Set() }); avisar(); },
  async cvaddsel(el) {
    const chaves = [...U().marcados];
    if (chaves.length && await acao('incluir', { eventoId: el.dataset.id, chaves })) { U().marcados = new Set(); toast(`${qtd(chaves.length)} na lista.`); }
  },
};
export const mudancas = {
  cvorigem(t) { Object.assign(U(), { origem: t.value, marcados: new Set() }); avisar(); },
  cvmarcar(t) { const m = U().marcados; if (t.checked) m.add(t.dataset.chave); else m.delete(t.dataset.chave); avisar(); },
  cvtodos(t) {
    const u = U();
    const ev = estado.convites.eventos.find((e) => e.id === u.add);
    const g = estado.convites.cadastro?.[Number(u.origem)];
    if (!ev || !g) return;
    const ja = new Set(ev.pessoas.map((p) => p.chave));
    u.marcados = new Set(t.checked ? g.pessoas.filter((p) => !ja.has(p.chave)).map((p) => p.chave) : []);
    avisar();
  },
};

// Formulários: criar/editar o evento e a pessoa de fora.
export async function enviar(form) {
  const v = (n) => form.elements[n]?.value ?? '';
  if (form.dataset.form === 'cvevento') {
    const id = form.dataset.id || undefined;
    if (await acao('eventoSalvar', { id, nome: v('nome'), data: v('data') })) {
      Object.assign(U(), { novo: false, editar: null });
      if (!id) { const novo = estado.convites.eventos.find((e) => e.nome === v('nome').trim() && e.data === v('data')); if (novo) U().abertos.add(novo.id); }
      form.reset();
      toast(id ? 'Evento salvo.' : 'Evento criado.');
      avisar();
    }
  } else if (form.dataset.form === 'cvconv') {
    const nome = v('nome');
    if (await acao('convidar', { eventoId: form.dataset.id, nome })) { form.reset(); toast(`${nome.trim()} está na lista como seu convidado.`); }
  } else if (form.dataset.form === 'cvfora') {
    const nome = v('nome');
    if (await acao('incluir', { eventoId: form.dataset.id, nome })) { form.reset(); toast(`${nome.trim()} entrou em ${LISTA_CONVIDADOS}.`); }
  }
}
