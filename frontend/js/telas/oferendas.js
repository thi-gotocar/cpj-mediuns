// Tela "Oferendas": o admin monta a lista de itens; todos escolhem o que vão doar.

import { situacao, dataEntrega, podeMarcarEntregue, textoOferenda, textoEntrega, dataBR } from '/shared/oferendas.js';
import { estado, pode, pessoasOrd, carregarOferendas, acaoOferendas, doarItem, avisar } from '../estado.js';
import { esc, toast, baixar, hoje, dLong } from '../util.js';
import { gerarImagemOferenda } from '../imagemOferenda.js';

const U = () => estado.ofUi;
const opcoesPessoas = (atual) => `<option value="">— escolha —</option>${pessoasOrd().map((p) => `<option value="${p.id}" ${p.id === atual ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
// "rascunho" aparece como Bloqueado (vermelho): a corrente não vê e os itens ficam ocultos.
const SITUACAO = { rascunho: 'Bloqueado', aguardando: 'Aguardando publicação', publicado: 'Publicado', encerrado: 'Encerrado' };
const etiqueta = (st) => `<span class="st-of ${st}">${SITUACAO[st] || st}</span>`;

// Lembra se "+ Adicionar item" e "Oferendas anteriores" estão abertos entre redesenhos.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement)) return;
  if (d.classList.contains('of-novo')) {
    const id = d.querySelector('form')?.dataset.of;
    if (d.open) U().novoItem = id; else if (U().novoItem === id) U().novoItem = null;
  } else if (d.classList.contains('anteriores')) U().anteriores = d.open;
}, true);
const Dia = (s) => { const t = dLong(s); return t.charAt(0).toUpperCase() + t.slice(1); };

function camposItem(i = {}) {
  const porData = !!i.entrega;
  return `<label class="field grow">Item<input type="text" name="nome" maxlength="80" required value="${esc(i.nome || '')}" placeholder="Ex.: Rosas brancas"></label>
    <label class="field" style="flex:0 1 110px">Quantidade<input type="number" name="qtd" min="1" max="10000" step="1" required value="${i.quantidade || 1}" inputmode="numeric"></label>
    <label class="field" style="flex:1 1 170px">Entrega<select name="modo" data-act="modoentrega"><option value="evento" ${porData ? '' : 'selected'}>No dia do evento</option><option value="data" ${porData ? 'selected' : ''}>Escolher data</option></select></label>
    <label class="field" style="flex:1 1 150px" ${porData ? '' : 'hidden'}>Data da entrega<input type="date" name="entrega" value="${esc(i.entrega || '')}"></label>`;
}

// Admin: cada doador com − / + e excluir; e cadastrar a doação de alguém da corrente.
function doadoresAdmin(i, s) {
  const eu = estado.oferendas.eu;
  let h = `<div class="of-doad-adm">`;
  i.doacoes.forEach((d) => {
    const conf = estado.confirm === 'od:' + i.id + ':' + d.chave;
    h += `<div class="of-doador"><span class="${d.chave === eu.chave ? 'eu' : ''}">${esc(d.nome)}</span>
      <button class="btn small" data-act="pormenos" data-item="${i.id}" data-chave="${esc(d.chave)}" aria-label="Menos para ${esc(d.nome)}">−</button>
      <span class="n">${d.quantidade}</span>
      <button class="btn small" data-act="pormais" data-item="${i.id}" data-chave="${esc(d.chave)}" ${s.falta ? '' : 'disabled'} aria-label="Mais para ${esc(d.nome)}">+</button>
      ${conf ? `<button class="btn small danger" data-act="pordel" data-item="${i.id}" data-chave="${esc(d.chave)}">Confirmar</button>`
        : `<button class="btn small" data-act="askdel" data-k="od:${i.id}:${esc(d.chave)}" aria-label="Excluir doação de ${esc(d.nome)}">✕</button>`}</div>`;
  });
  if (!i.doacoes.length) h += `<div class="muted of-sub">Ninguém se prontificou ainda.</div>`;
  if (s.falta) {
    const ja = new Set(i.doacoes.map((d) => d.chave));
    const livres = pessoasOrd().filter((p) => !ja.has('p:' + p.id));
    if (livres.length) {
      h += `<form class="of-por" data-form="porpessoa" data-item="${i.id}" autocomplete="off">
        <select name="pessoa" aria-label="Pessoa que vai doar"><option value="">+ doação por alguém…</option>${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
        <input type="number" name="qtd" min="1" max="${s.falta}" value="1" inputmode="numeric" aria-label="Quantidade">
        <button class="btn small primary" type="submit">Adicionar</button></form>`;
    }
  }
  return h + `</div>`;
}

function linhaItem(of, i, admin) {
  const s = situacao(i);
  const eu = estado.oferendas.eu;
  const minha = i.doacoes.find((d) => d.chave === eu.chave)?.quantidade || 0;
  const max = minha + s.falta;
  if (admin && U().editarItem === i.id) {
    return `<div class="of-item"><form class="row" data-form="itemed" data-id="${i.id}" autocomplete="off">${camposItem(i)}
      <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelaritem">Cancelar</button></form></div>`;
  }
  const conf = estado.confirm === 'oi:' + i.id;
  const libera = podeMarcarEntregue(i, of, hoje());
  const entregaTxt = `Entrega: ${textoEntrega(i)}${i.entregue ? ' · <span class="badge new">✓ entregue</span>' : ''}`;
  let h = s.completo
    ? `<div class="of-item completo">
    <div class="of-top"><span class="dot ok" title="Completo"></span>
      <span class="of-nome">${esc(i.nome)}</span><span class="muted of-ent">${entregaTxt}</span></div>
    ${admin ? doadoresAdmin(i, s) : `<div class="of-doadores">${i.doacoes.map((d) => `<span class="${d.chave === eu.chave ? 'eu' : ''}">${esc(d.nome)} (${d.quantidade})</span>`).join(', ')}</div>`}`
    : `<div class="of-item">
    <div class="of-top"><span class="dot pend" title="Faltam doadores"></span>
      <span class="of-nome">${esc(i.nome)}</span>
      <span class="of-qtd">${s.doado} de ${i.quantidade}</span></div>
    <div class="muted of-sub">${entregaTxt} · faltam <b>${s.falta}</b></div>
    ${admin ? doadoresAdmin(i, s) : i.doacoes.length ? `<div class="of-doadores">${i.doacoes.map((d) => `<span class="${d.chave === eu.chave ? 'eu' : ''}">${esc(d.nome)} (${d.quantidade})</span>`).join(', ')}</div>` : '<div class="muted of-sub">Ninguém se prontificou ainda.</div>'}`;
  if (!i.entregue && of.status === 'publicado' && (max > 0 || minha > 0)) {
    h += `<div class="of-doar"><span class="muted">Vou doar:</span>
      <button class="btn small" data-act="ofmenos" data-id="${i.id}" ${minha ? '' : 'disabled'} aria-label="Menos ${esc(i.nome)}">−</button>
      <span class="n">${minha}</span>
      <button class="btn small ${minha ? '' : 'primary'}" data-act="ofmais" data-id="${i.id}" ${minha >= max ? 'disabled' : ''} aria-label="Mais ${esc(i.nome)}">+</button></div>`;
  }
  if (admin) {
    h += `<div class="row of-adm">
      ${i.entregue
        ? `<button class="btn small" data-act="entregue" data-id="${i.id}" data-v="0">Desfazer entregue</button>`
        : `<button class="btn small" data-act="entregue" data-id="${i.id}" data-v="1" ${libera ? '' : `disabled title="Libera em ${dataBR(dataEntrega(i, of))}"`}>Ok, entregue</button>`}
      <button class="btn small" data-act="editaritem" data-id="${i.id}">Editar</button>
      ${conf ? `<button class="btn small danger" data-act="delitem" data-id="${i.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="oi:${i.id}">Excluir</button>`}
      ${!libera && !i.entregue ? `<span class="muted" style="font-size:.82rem">“Ok, entregue” libera em ${dataBR(dataEntrega(i, of))}</span>` : ''}</div>`;
  }
  return h + `</div>`;
}

// Primeiro bloco da oferenda: quem está logado e o que se comprometeu a doar.
function meusCompromissos(of) {
  const eu = estado.oferendas.eu;
  const meus = of.itens.map((i) => ({ i, q: i.doacoes.find((d) => d.chave === eu.chave)?.quantidade || 0 })).filter((x) => x.q);
  return `<div class="of-meus"><div class="of-meus-h"><span class="eyebrow">Seus compromissos</span><b>${esc(eu.nome || '')}</b></div>
    ${meus.length
      ? `<ul>${meus.map(({ i, q }) => `<li><span class="of-meus-nome">${esc(i.nome)}</span> <b>${q}</b> <span class="muted">· entrega ${textoEntrega(i)}${i.entregue ? ' · ✓ entregue' : ''}</span></li>`).join('')}</ul>`
      : `<p class="muted" style="margin:0;font-size:.88rem">${of.status === 'publicado' ? 'Você ainda não escolheu nada para doar. Toque em + no item que quiser doar.' : 'Você ainda não tem compromissos nesta oferenda.'}</p>`}
  </div>`;
}

function cardOferenda(of, admin) {
  const u = U();
  let h = `<div class="card" id="of-${of.id}">`;
  if (admin && u.editar === of.id) {
    h += `<form class="row" data-form="ofed" data-id="${of.id}" autocomplete="off">
      <label class="field grow">Título<input type="text" name="titulo" maxlength="120" required value="${esc(of.titulo)}"></label>
      <label class="field" style="flex:0 1 170px">Data<input type="date" name="data" required value="${of.data}"></label>
      <label class="field grow">Responsável<select name="resp" required>${opcoesPessoas(of.responsavelId)}</select></label>
      <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelarof">Cancelar</button></form>`;
  } else {
    const pend = of.itens.filter((i) => !situacao(i).completo).length;
    // Publicar: depois de publicada, o botão fica "Publicado" (verde) e não muda mais.
    // Bloquear ↔ Desbloquear (verde): ao desbloquear, volta a publicada (ou aguardando, se nunca foi).
    // Encerrar (amarelo) ↔ Encerrado: tocar de novo volta como ao desbloquear.
    const volta = of.publicada ? 'publicado' : 'aguardando';
    const bloq = of.status === 'rascunho', enc = of.status === 'encerrado';
    const bts = [
      of.publicada
        ? `<button class="btn small st-bt publicado ligado" disabled>Publicado</button>`
        : `<button class="btn small st-bt" data-act="statusof" data-id="${of.id}" data-v="publicado">Publicar</button>`,
      `<button class="btn small st-bt ${bloq ? 'desbloquear' : ''}" data-act="statusof" data-id="${of.id}" data-v="${bloq ? volta : 'rascunho'}">${bloq ? 'Desbloquear' : 'Bloquear'}</button>`,
      `<button class="btn small st-bt encerrar ${enc ? 'ligado' : ''}" data-act="statusof" data-id="${of.id}" data-v="${enc ? volta : 'encerrado'}" aria-pressed="${enc}">${enc ? 'Encerrado' : 'Encerrar'}</button>`,
    ].join('');
    h += `${admin ? `<div class="row st-of-linha">${of.status === 'publicado' ? '' : etiqueta(of.status)}${of.status === 'publicado' ? '' : `<span class="muted" style="font-size:.82rem;flex-basis:100%">${enc ? 'Oferenda encerrada: saiu da lista da corrente.' : bloq ? 'Bloqueada: a corrente vê a oferenda, mas não a lista de itens.' : 'A corrente ainda não vê esta oferenda. Toque em <b>Publicar</b> para liberar as doações.'}</span>`}
        <span class="st-of-bts">${bts}</span></div>` : ''}
      ${!admin && (of.status === 'rascunho' || of.responsavel) ? `<div class="of-topo">${of.status === 'rascunho' ? etiqueta('rascunho') : '<span></span>'}${of.responsavel ? `<span class="of-resp">Responsável: <b>${esc(of.responsavel)}</b></span>` : ''}</div>` : ''}
      <div class="datehead"><span class="eyebrow">Oferenda · ${dataBR(of.data)}</span><span class="dia of-titulo">${esc(of.titulo)}${admin && of.responsavel ? ` <span class="of-resp">Responsável: <b>${esc(of.responsavel)}</b></span>` : ''}</span><span class="ent">${esc(Dia(of.data))}</span></div>
      <p class="muted" style="margin:0;font-size:.88rem">${of.bloqueada ? 'Lista bloqueada no momento.' : of.itens.length ? `${of.itens.length} ${of.itens.length === 1 ? 'item' : 'itens'} · ${pend ? `${pend} com doação pendente` : 'todos com doadores'}` : 'Nenhum item ainda.'}</p>`;
  }
  if (u.editar !== of.id) h += meusCompromissos(of);
  // Sempre começa minimizada; abre só enquanto o app estiver aberto.
  // Bloqueada: itens ocultos, sem o botão de ver.
  const bloqueada = of.status === 'rascunho';
  const fechada = bloqueada || (of.itens.length > 0 && !(u.abertas || []).includes(of.id));
  if (u.editar !== of.id && of.itens.length && !bloqueada) {
    h += `<button class="btn link small of-dobra" data-act="dobrarof" data-id="${of.id}" aria-expanded="${!fechada}">${fechada ? '▸ Ver os itens' : '▾ Minimizar'}</button>`;
  }
  if (fechada) return h + rodapeOferenda(of, admin) + `</div>`;
  // Em aberto primeiro; os completos (verdes) no fim.
  const ordem = [...of.itens].sort((a, b) => Number(situacao(a).completo) - Number(situacao(b).completo));
  // Cadastrar item fica no topo da lista.
  if (admin) {
    h += `<details class="of-novo"${u.novoItem === of.id ? ' open' : ''}><summary>+ Adicionar item</summary>
      <form class="row" data-form="item" data-of="${of.id}" autocomplete="off">${camposItem()}<button class="btn primary" type="submit">Adicionar</button></form></details>`;
  }
  h += `${of.itens.length ? '<p class="muted legenda"><span class="dot pend"></span> falta doação <span class="dot ok"></span> completo</p>' : ''}
    <div class="of-itens">${ordem.map((i) => linhaItem(of, i, admin)).join('')}</div>`;
  return h + rodapeOferenda(of, admin) + `</div>`;
}

// Compartilhar, editar e excluir (aparece também com a oferenda minimizada).
function rodapeOferenda(of, admin) {
  const u = U();
  let h = '';
  if (!admin) return h;   // compartilhar, editar e excluir: só admin
  const aberto = u.compartilhar === of.id;
  h += `<div class="row"><button class="btn ${aberto ? 'primary' : ''}" data-act="compartilhar" data-id="${of.id}" aria-pressed="${aberto}">Compartilhar lista</button>
    ${admin && u.editar !== of.id ? `<button class="btn" data-act="editarof" data-id="${of.id}">Editar</button>
      ${estado.confirm === 'of:' + of.id ? `<button class="btn danger" data-act="delof" data-id="${of.id}">Confirmar exclusão</button>` : `<button class="btn" data-act="askdel" data-k="of:${of.id}">Excluir</button>`}` : ''}</div>`;
  if (aberto) {
    const txt = textoOferenda(of);
    const img = u.img && u.img.id === of.id && u.img.chave === txt ? u.img : null;
    h += `<div class="grp exp"><textarea id="of-txt-${of.id}" readonly aria-label="Lista para compartilhar">${esc(txt)}</textarea>
      <div class="row"><button class="btn primary" data-act="copiarof" data-id="${of.id}">Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
        <button class="btn" data-act="imgof" data-id="${of.id}">${img ? 'Atualizar imagem' : 'Gerar imagem'}</button></div>
      ${img ? `<img class="prev" src="${img.url}" alt="Imagem da lista da oferenda">
        <div class="row">${podeCompartilhar(img) ? `<button class="btn primary" data-act="shareimgof">Compartilhar imagem</button>` : ''}<button class="btn" data-act="saveimgof">Salvar imagem</button></div>` : ''}</div>`;
  }
  return h;
}

function podeCompartilhar(img) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([img.blob], img.nome, { type: 'image/png' })] })); } catch { return false; }
}

export function render() {
  if (estado.oferendas === null) { carregarOferendas(); return `<div class="loading">Carregando oferendas…</div>`; }
  const admin = pode('oferendas:gerenciar');
  const lista = estado.oferendas.oferendas;
  const hj = hoje();
  const proximas = lista.filter((o) => o.data >= hj);
  const anteriores = lista.filter((o) => o.data < hj).reverse();
  let h = `<section class="panel">`;
  if (admin) {
    h += `<div class="card"><h2>Nova oferenda</h2><form id="f-of" class="row" autocomplete="off">
      <label class="field grow">Título<input type="text" id="of-titulo" maxlength="120" required placeholder="Ex.: Oferenda de Iemanjá"></label>
      <label class="field" style="flex:0 1 170px">Data<input type="date" id="of-data" required></label>
      <label class="field grow">Responsável<select id="of-resp" required>${opcoesPessoas('')}</select></label>
      <button class="btn primary" type="submit">Criar</button></form></div>`;
  }
  if (!lista.length) return h + `<div class="card empty"><p class="muted">${admin ? 'Nenhuma oferenda ainda. Crie a primeira acima.' : 'Nenhuma oferenda aberta para doação no momento. Quando o admin publicar, ela aparece aqui.'}</p></div></section>`;
  h += proximas.map((o) => cardOferenda(o, admin)).join('');
  if (!proximas.length) h += `<div class="card empty"><p class="muted">Nenhuma oferenda marcada para os próximos dias.</p></div>`;
  if (anteriores.length) {
    h += `<details class="anteriores"${U().anteriores ? ' open' : ''}><summary>Oferendas anteriores (${anteriores.length})</summary>${anteriores.map((o) => cardOferenda(o, admin)).join('')}</details>`;
  }
  return h + `</section>`;
}

const achar = (id) => {
  for (const of of estado.oferendas.oferendas) {
    if (of.id === id) return { of };
    const i = of.itens.find((x) => x.id === id);
    if (i) return { of, item: i };
  }
  return {};
};

export const cliques = {
  ofmais(el) {
    const { item } = achar(el.dataset.id);
    const eu = estado.oferendas.eu;
    const minha = item.doacoes.find((d) => d.chave === eu.chave)?.quantidade || 0;
    if (minha >= minha + situacao(item).falta) return;
    doarItem(item.id, minha + 1);
  },
  ofmenos(el) {
    const { item } = achar(el.dataset.id);
    const minha = item.doacoes.find((d) => d.chave === estado.oferendas.eu.chave)?.quantidade || 0;
    if (minha > 0) doarItem(item.id, minha - 1);
  },
  async pormais(el) { await porAlguem(el, +1); },
  async pormenos(el) { await porAlguem(el, -1); },
  async pordel(el) {
    estado.confirm = null;
    if (await acaoOferendas('doarPor', { itemId: el.dataset.item, chave: el.dataset.chave, quantidade: 0 })) toast('Doação excluída.');
  },
  async entregue(el) {
    if (await acaoOferendas('entregue', { id: el.dataset.id, entregue: el.dataset.v === '1' })) toast(el.dataset.v === '1' ? 'Item marcado como entregue.' : 'Entrega desfeita.');
  },
  editaritem(el) { U().editarItem = el.dataset.id; avisar(); },
  cancelaritem() { U().editarItem = null; avisar(); },
  async delitem(el) { estado.confirm = null; if (await acaoOferendas('excluirItem', { id: el.dataset.id })) toast('Item excluído.'); },
  editarof(el) { U().editar = el.dataset.id; avisar(); },
  cancelarof() { U().editar = null; avisar(); },
  dobrarof(el) {
    const set = new Set(U().abertas || []);
    if (set.has(el.dataset.id)) set.delete(el.dataset.id); else set.add(el.dataset.id);
    U().abertas = [...set];
    avisar();
  },
  async statusof(el) {
    const t = { publicado: 'Oferenda publicada: a corrente já pode ver e doar.', rascunho: 'Oferenda bloqueada: a corrente vê, mas sem a lista de itens.', encerrado: 'Oferenda encerrada: saiu da lista da corrente.', aguardando: 'Voltou para Aguardando publicação: a corrente não vê.' };
    if (await acaoOferendas('status', { id: el.dataset.id, status: el.dataset.v })) toast(t[el.dataset.v]);
  },
  async delof(el) { estado.confirm = null; if (await acaoOferendas('excluir', { id: el.dataset.id })) toast('Oferenda excluída.'); },
  compartilhar(el) { U().compartilhar = U().compartilhar === el.dataset.id ? null : el.dataset.id; avisar(); },
  copiarof(el) {
    const t = document.getElementById('of-txt-' + el.dataset.id);
    const fb = () => { t.focus(); t.select(); toast('Lista selecionada. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(t.value).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
  },
  async imgof(el) {
    const { of } = achar(el.dataset.id);
    try {
      const blob = await gerarImagemOferenda(of);
      if (U().img) URL.revokeObjectURL(U().img.url);
      U().img = { id: of.id, chave: textoOferenda(of), blob, url: URL.createObjectURL(blob), nome: 'oferenda-' + of.data + '.png' };
      avisar();
    } catch (e) { toast(e.message); }
  },
  saveimgof() { const i = U().img; if (i) baixar(i.url, i.nome); },
  shareimgof() {
    const i = U().img;
    if (!i) return;
    navigator.share({ files: [new File([i.blob], i.nome, { type: 'image/png' })], title: 'Oferenda' })
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagem.'); });
  },
};

async function porAlguem(el, delta) {
  const { item } = achar(el.dataset.item);
  const d = item?.doacoes.find((x) => x.chave === el.dataset.chave);
  if (!d) return;
  const q = d.quantidade + delta;
  if (q < 0 || (delta > 0 && situacao(item).falta <= 0)) return;
  await acaoOferendas('doarPor', { itemId: item.id, chave: d.chave, quantidade: q });
}

export const mudancas = {
  // "No dia do evento" esconde a data; "Escolher data" mostra.
  modoentrega(t) {
    const campo = t.closest('form').querySelector('input[name=entrega]');
    campo.closest('label').hidden = t.value !== 'data';
    if (t.value === 'data') campo.focus();
  },
};

// Formulários (criar oferenda, editar, adicionar/editar item).
export async function enviar(form) {
  const v = (n) => form.elements[n]?.value ?? '';
  if (form.id === 'f-of') {
    const titulo = document.getElementById('of-titulo').value, data = document.getElementById('of-data').value;
    const responsavelId = document.getElementById('of-resp').value;
    if (!data) { toast('Escolha a data.'); return; }
    if (!responsavelId) { toast('Escolha o responsável.'); return; }
    if (await acaoOferendas('salvar', { titulo, data, responsavelId })) toast('Oferenda criada. Adicione os itens e toque em Publicar para a corrente ver.');
    return;
  }
  if (form.dataset.form === 'ofed') {
    if (!v('resp')) { toast('Escolha o responsável.'); return; }
    if (await acaoOferendas('salvar', { id: form.dataset.id, titulo: v('titulo'), data: v('data'), responsavelId: v('resp') })) { U().editar = null; toast('Oferenda salva.'); avisar(); }
    return;
  }
  if (form.dataset.form === 'porpessoa') {
    const pessoa = v('pessoa');
    const qtd = Number(v('qtd'));
    if (!pessoa) { toast('Escolha a pessoa.'); return; }
    if (!Number.isInteger(qtd) || qtd < 1) { toast('Informe a quantidade.'); return; }
    const nome = estado.pessoas.find((p) => p.id === pessoa)?.nome || '';
    if (await acaoOferendas('doarPor', { itemId: form.dataset.item, pessoaId: pessoa, quantidade: qtd })) toast(`Doação de ${nome} registrada.`);
    return;
  }
  const entrega = v('modo') === 'data' ? v('entrega') : '';
  if (v('modo') === 'data' && !entrega) { toast('Escolha a data da entrega.'); return; }
  const dados = { nome: v('nome'), quantidade: Number(v('qtd')), entrega };
  if (form.dataset.form === 'item') {
    U().novoItem = form.dataset.of;
    U().abertas = [...new Set([...(U().abertas || []), form.dataset.of])];   // continua aberta para cadastrar mais
    if (await acaoOferendas('item', { oferendaId: form.dataset.of, ...dados })) {
      toast('Item adicionado.');
      document.querySelector(`form[data-form=item][data-of="${form.dataset.of}"] input[name=nome]`)?.focus();
    }
  } else if (form.dataset.form === 'itemed') {
    if (await acaoOferendas('item', { id: form.dataset.id, ...dados })) { U().editarItem = null; toast('Item salvo.'); avisar(); }
  }
}
