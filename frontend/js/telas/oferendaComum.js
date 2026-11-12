// Peças comuns às listas de oferendas e à Iemanjá: campos e linha do item, compartilhar.
// As ações que gravam levam o prefixo da tela (c.p): '' nas listas e 'iem' na Iemanjá.

import { situacao, dataEntrega, podeMarcarEntregue, textoOferenda, textoEntrega, dataBR, porCategoria, DETALHES_LINHAS, DETALHES_MAX, limparDetalhes, detalhesOk } from '/shared/oferendas.js';
import { estado, avisar } from '../estado.js';
import { esc, hoje, dLong, toast } from '../util.js';

export const U = () => estado.ofUi;
export const Dia = (s) => { const t = dLong(s); return t.charAt(0).toUpperCase() + t.slice(1); };

// categorias: a lista do evento (só a Iemanjá passa). Vazia e o item sem categoria: o campo não aparece.
// A categoria que o item já tinha continua na lista mesmo se saiu da do evento.
export function camposItem(i = {}, categorias = null) {
  const porData = !!i.entrega;
  const atual = i.categoria || '';
  const ops = [...(categorias || [])];
  if (atual && !ops.some((c) => c.toLocaleLowerCase('pt-BR') === atual.toLocaleLowerCase('pt-BR'))) ops.push(atual);
  const categoria = ops.length ? `<label class="field" style="flex:1 1 100%">Categoria<select name="categoria"><option value="">— sem categoria —</option>${ops.map((c) => `<option ${c.toLocaleLowerCase('pt-BR') === atual.toLocaleLowerCase('pt-BR') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : '';
  return `${categoria}<label class="field grow">Item<input type="text" name="nome" maxlength="80" required value="${esc(i.nome || '')}" placeholder="Ex.: Rosas brancas"></label>
    <label class="field" style="flex:0 1 110px">Quantidade<input type="number" name="qtd" min="1" max="10000" step="1" required value="${esc(i.quantidade || 1)}" inputmode="numeric"></label>
    <label class="field" style="flex:1 1 170px">Entrega<select name="modo" data-act="modoentrega"><option value="evento" ${porData ? '' : 'selected'}>No dia do evento</option><option value="data" ${porData ? 'selected' : ''}>Escolher data</option></select></label>
    <label class="field" style="flex:1 1 150px" ${porData ? '' : 'hidden'}>Data da entrega<input type="date" name="entrega" value="${esc(i.entrega || '')}"></label>`;
}

// Admin: cada doador com − / + e excluir; e cadastrar a doação de outra pessoa.
function doadoresAdmin(i, s, c) {
  let h = `<div class="of-doad-adm">`;
  i.doacoes.forEach((d) => {
    const conf = estado.confirm === 'od:' + i.id + ':' + d.chave;
    h += `<div class="of-doador"><span class="${d.chave === c.eu.chave ? 'eu' : ''}">${esc(d.nome)}</span>
      <button class="btn small" data-act="${c.p}pormenos" data-item="${i.id}" data-chave="${esc(d.chave)}" aria-label="Menos para ${esc(d.nome)}">−</button>
      <span class="n">${d.quantidade}</span>
      <button class="btn small" data-act="${c.p}pormais" data-item="${i.id}" data-chave="${esc(d.chave)}" ${s.falta ? '' : 'disabled'} aria-label="Mais para ${esc(d.nome)}">+</button>
      ${conf ? `<button class="btn small danger" data-act="${c.p}pordel" data-item="${i.id}" data-chave="${esc(d.chave)}">Confirmar</button>`
        : `<button class="btn small" data-act="askdel" data-k="od:${i.id}:${esc(d.chave)}" aria-label="Excluir doação de ${esc(d.nome)}">✕</button>`}</div>`;
  });
  if (!i.doacoes.length) h += `<div class="muted of-sub">Ninguém se prontificou ainda.</div>`;
  if (s.falta) {
    const opcoes = c.opcoesDoador(new Set(i.doacoes.map((d) => d.chave)));
    if (opcoes) {
      h += `<form class="of-por" data-form="${c.p}porpessoa" data-item="${i.id}" autocomplete="off">
        <select name="pessoa" aria-label="Pessoa que vai doar"><option value="">+ doação por alguém…</option>${opcoes}</select>
        <input type="number" name="qtd" min="1" max="${s.falta}" value="1" inputmode="numeric" aria-label="Quantidade">
        <button class="btn small primary" type="submit">Adicionar</button></form>`;
    }
  }
  return h + `</div>`;
}

const CHECK_VAZIO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const CHECK_FEITO = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// c: { p: prefixo das ações, eu, admin, ref: { data do evento }, podeDoar, opcoesDoador(jaDoaram) }
function linhaItem(i, c) {
  const s = situacao(i);
  const minha = i.doacoes.find((d) => d.chave === c.eu?.chave)?.quantidade || 0;
  const max = minha + s.falta;
  if (c.admin && U().editarItem === i.id) {
    return `<div class="of-item"><form class="row" data-form="${c.p}itemed" data-id="${i.id}" autocomplete="off">${camposItem(i, c.categorias)}
      <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelaritem">Cancelar</button></form></div>`;
  }
  const conf = estado.confirm === 'oi:' + i.id;
  const libera = podeMarcarEntregue(i, c.ref, hoje());
  // Cada item começa recolhido numa linha: a cor da situação, o item, quem ficou responsável e,
  // para o admin, a caixinha de entregue (liberada na data de entrega; pede confirmação numa janela).
  // Tocar na linha mostra o resto e tocar de novo recolhe.
  const aberto = (U().itensAbertos || []).includes(i.id);
  const resp = i.doacoes.length ? i.doacoes.map((d) => esc(d.nome)).join(', ') : 'Ninguém ainda';
  // Entrega: caixinha vazia (admin toca e confirma; liberada a partir da data de entrega) e marcada quando entregue.
  const ok = i.entregue ? `<span class="of-check feito" role="img" aria-label="Entregue" title="Entregue">${CHECK_FEITO}</span>`
    : c.admin ? `<button class="of-check" data-act="${c.p}askentregue" data-id="${i.id}" aria-label="Marcar ${esc(i.nome)} como entregue" ${libera ? 'title="Marcar como entregue"' : `disabled title="Libera em ${dataBR(dataEntrega(i, c.ref))}"`}>${CHECK_VAZIO}</button>` : '';
  const cab = `<div class="of-top of-item-l"><button class="of-item-cab" data-act="dobraritem" data-id="${i.id}" aria-expanded="${aberto}">
      <span class="dot ${s.completo ? 'ok' : 'pend'}" title="${s.completo ? 'Completo' : 'Faltam doadores'}"></span>
      <span class="of-item-tx"><span class="of-nome">${esc(i.nome)}</span><span class="of-resp-i${i.doacoes.length ? '' : ' muted'}">${resp}</span></span>
      <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></button>${ok}</div>`;
  if (!aberto) return `<div class="of-item recolhido${s.completo ? ' completo' : ''}">${cab}</div>`;
  const entregaTxt = `Entrega: ${textoEntrega(i)}${i.entregue ? ' · <span class="badge new">✓ entregue</span>' : ''}`;
  const doadores = i.doacoes.length ? `<div class="of-doadores">${i.doacoes.map((d) => `<span class="${d.chave === c.eu?.chave ? 'eu' : ''}">${esc(d.nome)} (${d.quantidade})</span>`).join(', ')}</div>` : '<div class="muted of-sub">Ninguém se prontificou ainda.</div>';
  let h = `<div class="of-item${s.completo ? ' completo' : ''}">${cab}
    <div class="muted of-sub">${entregaTxt} · <b>${s.doado} de ${i.quantidade}</b>${s.completo ? '' : ` · faltam <b>${s.falta}</b>`}</div>
    ${c.admin ? doadoresAdmin(i, s, c) : doadores}`;
  if (!i.entregue && c.podeDoar && (max > 0 || minha > 0)) {
    h += `<div class="of-doar"><span class="muted">Vou doar:</span>
      <button class="btn small" data-act="${c.p}ofmenos" data-id="${i.id}" ${minha ? '' : 'disabled'} aria-label="Menos ${esc(i.nome)}">−</button>
      <span class="n">${minha}</span>
      <button class="btn small ${minha ? '' : 'primary'}" data-act="${c.p}ofmais" data-id="${i.id}" ${minha >= max ? 'disabled' : ''} aria-label="Mais ${esc(i.nome)}">+</button></div>`;
  }
  if (c.admin) {
    // A caixinha de entregue fica na linha do item; aqui só o desfazer.
    h += `<div class="row of-adm">
      ${i.entregue ? `<button class="btn small" data-act="${c.p}entregue" data-id="${i.id}" data-v="0">Desfazer entregue</button>` : ''}
      <button class="btn small" data-act="editaritem" data-id="${i.id}">Editar</button>
      ${conf ? `<button class="btn small danger" data-act="${c.p}delitem" data-id="${i.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="oi:${i.id}">Excluir</button>`}
      ${!libera && !i.entregue ? `<span class="muted" style="font-size:.82rem">A marcação de entregue libera em ${dataBR(dataEntrega(i, c.ref))}</span>` : ''}</div>`;
  }
  return h + `</div>`;
}

// Em aberto primeiro; os completos (verdes) no fim. Com c.categorias, separa por categoria (título e itens).
export function listaItens(itens, c) {
  const ordenar = (l) => [...l].sort((a, b) => Number(situacao(a).completo) - Number(situacao(b).completo));
  const blocos = c.categorias ? porCategoria(itens, c.categorias) : [['', itens]];
  return `${itens.length ? '<p class="muted legenda"><span class="dot pend"></span> falta doação <span class="dot ok"></span> completo</p>' : ''}
    ${blocos.map(([cat, l]) => `${cat ? `<h4 class="of-cat">${esc(cat)} <span class="muted">· ${l.length}</span></h4>` : ''}<div class="of-itens">${ordenar(l).map((i) => linhaItem(i, c)).join('')}</div>`).join('')}`;
}

export const botoesCompartilhar = (of) => `<button class="btn ${U().compartilhar === of.id ? 'primary' : ''}" data-act="compartilhar" data-id="${of.id}" aria-pressed="${U().compartilhar === of.id}">Compartilhar lista</button>
    <button class="btn" data-act="imgofdireto" data-id="${of.id}">Compartilhar imagem</button>`;

function podeCompartilhar(img) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([img.blob], img.nome, { type: 'image/png' })] })); } catch { return false; }
}

// Texto do "Compartilhar lista": com os Detalhes no começo — o do evento (grupo da Iemanjá) ou o da sub-aba da oferenda.
export const textoCompartilhar = (of) => textoOferenda(of, of.detalhes ?? (estado.oferendas?.abas || []).find((a) => a.id === of.abaId && !a.iemanja)?.detalhes ?? '');

// Bloco 📝 Detalhes (da sub-aba de lista ou do evento da Iemanjá): o admin escreve (até 10 linhas) e todos leem;
// vai no começo de "Compartilhar lista". Começa minimizado; vazio, só o admin vê. act: a ação do Salvar.
export function blocoDetalhes(id, texto, admin, act) {
  const txt = texto || '';
  if (!admin && !txt) return '';
  const aberto = (U().detAbertos || []).includes(id);
  let h = `<div class="card of-det"><button class="grp-h dobra" data-act="dobrardet" data-id="${id}" aria-expanded="${aberto}"><h2><span aria-hidden="true">📝</span> Detalhes</h2><span class="count">${admin && !txt ? '<span class="muted">vazio</span> ' : ''}<span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (aberto) {
    if (admin) {
      const r = U().detRascunho?.id === id ? U().detRascunho.texto : txt;
      h += `<textarea id="of-det" class="of-det-in" data-id="${id}" rows="${DETALHES_LINHAS}" maxlength="${DETALHES_MAX}" aria-label="Detalhes" placeholder="Informações para o pessoal (até ${DETALHES_LINHAS} linhas).">${esc(r)}</textarea>
        <div class="of-det-rod"><span class="muted">Todos leem. Vai no começo de “Compartilhar lista”.</span><button class="btn small primary" data-act="${act}" data-id="${id}">Salvar</button></div>`;
    } else h += `<p class="of-det-txt">${esc(txt)}</p>`;
  }
  return h + '</div>';
}

// Salvar do bloco Detalhes: gravar(texto) chama a ação da tela e devolve se deu certo.
export async function salvarDetalhes(gravar) {
  const detalhes = limparDetalhes(document.getElementById('of-det')?.value);
  if (!detalhesOk(detalhes)) { toast(`Use no máximo ${DETALHES_LINHAS} linhas.`); return; }
  if (await gravar(detalhes)) {
    U().detRascunho = null;
    toast(detalhes ? 'Detalhes salvos.' : 'Detalhes apagados.');
    avisar();
  }
}

export function painelCompartilhar(of) {
  const u = U();
  if (u.compartilhar !== of.id) return '';
  const txt = textoCompartilhar(of);
  const img = u.img && u.img.id === of.id && u.img.chave === txt ? u.img : null;
  return `<div class="grp exp"><textarea id="of-txt-${of.id}" readonly aria-label="Lista para compartilhar">${esc(txt)}</textarea>
      <div class="row"><button class="btn primary" data-act="copiarof" data-id="${of.id}">Copiar</button>
        <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a>
        <button class="btn" data-act="imgof" data-id="${of.id}">${img ? 'Atualizar imagem' : 'Gerar imagem'}</button></div>
      ${img ? `<img class="prev" src="${img.url}" alt="Imagem da lista da oferenda">
        <div class="row">${podeCompartilhar(img) ? `<button class="btn primary" data-act="shareimgof">Compartilhar imagem</button>` : ''}<button class="btn" data-act="saveimgof">Salvar imagem</button></div>` : ''}</div>`;
}
