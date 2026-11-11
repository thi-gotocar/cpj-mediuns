// Gestão de Conduta e Risco (aba Geral, último bloco).
// Corrente: abre relatos e vê os próprios (edita enquanto não foi lido) e a resposta publicada.
// Relato novo pode ir sem identificação: o servidor grava sem autor, e ele não volta para a lista de quem mandou.
// Admin root: vê todos com o nome, marca como lido e responde (rascunho até publicar). O servidor confere tudo.

import { estado, pode, carregarConduta, acaoConduta, avisar } from '../estado.js';
import { esc, toast } from '../util.js';

const ehRoot = () => pode('usuarios:gerenciar');
const relatos = () => estado.conduta?.relatos || [];
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ' às ');
const limitar = (txt) => txt.split('\n').slice(0, 10).join('\n');
const TITULO = '<div class="grp-h"><h2><span aria-hidden="true">🔍</span> Gestão de Conduta e Risco</h2>';

function formulario(c) {
  const texto = estado.cdTexto ?? c?.texto ?? '';
  const anon = !c && !!estado.cdAnonimo;   // só relato novo; o já enviado tem dono e segue editável
  const opcao = c ? '' : `<label class="of-sw cd-anon-sw"><input type="checkbox" role="switch" data-act="cdanon" ${anon ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Enviar sem me identificar</label>
    ${anon ? `<p class="cd-anon-nota">Tudo bem, a escolha é sua. Sua mensagem chega à comissão <b>sem o seu nome</b>: ninguém vai saber quem enviou.
      Por isso ela não fica em “Seus relatos” e não recebe resposta por aqui.</p>` : ''}`;
  return `<form id="f-conduta" class="cd-form" data-id="${c ? esc(c.id) : ''}" autocomplete="off">
    ${opcao}
    <textarea id="cd-texto" rows="10" maxlength="1500" aria-label="Relato" placeholder="Conte o que aconteceu: o quê, quando, onde e quem estava junto (até 10 linhas).">${esc(texto)}</textarea>
    <span class="row"><button class="btn primary" type="submit">${c ? 'Salvar' : anon ? 'Enviar sem identificação' : 'Enviar'}</button><button class="btn" type="button" data-act="cdfechar">Cancelar</button></span></form>`;
}

function statusDe(c) {
  if (c.resposta) return ['resp', 'Respondido'];
  return c.lidoEm ? ['lido', 'Lido pela comissão'] : ['aguarda', 'Aguardando leitura'];
}

// Quem abriu: o texto, o status e a resposta publicada; Editar só antes de ser lido.
function itemMeu(c) {
  if (estado.cdForm === c.id) return `<div class="cd-item">${formulario(c)}</div>`;
  const [k, rot] = statusDe(c);
  return `<div class="cd-item"><div class="cd-topo"><span class="muted cd-quando">${quando(c.criadoEm)}${c.editadoEm ? ' · editado' : ''}</span>
      <span class="cd-st ${k}">${rot}</span>${c.lidoEm ? '' : `<button class="btn small cd-editar" data-act="cdeditar" data-id="${esc(c.id)}">✎ Editar</button>`}</div>
    <p class="cd-txt">${esc(c.texto)}</p>
    ${c.resposta ? `<div class="cd-resp"><span class="cd-resp-t">Resposta da comissão · ${quando(c.publicadaEm)}</span><p class="cd-txt">${esc(c.resposta)}</p></div>` : ''}</div>`;
}

// Root: nome e data; "Não lido" vira "Lido" num toque; depois de lido, a resposta (rascunho até publicar).
function itemRoot(c) {
  const lido = !!c.lidoEm;
  const marca = lido ? '<span class="cd-st lido">✓ Lido</span>'
    : `<button class="btn small cd-st aguarda cd-ler" data-act="cdler" data-id="${esc(c.id)}" title="Marcar como lido (quem abriu não edita mais)">📩 Não lido</button>`;
  let resp = '';
  if (c.anonimo) {
    // Sem autor: não há para quem mostrar uma resposta.
  } else if (lido && c.publicadaEm) {
    resp = `<div class="cd-resp"><span class="cd-resp-t">Resposta publicada · ${quando(c.publicadaEm)}</span><p class="cd-txt">${esc(c.resposta)}</p></div>`;
  } else if (lido) {
    const valor = estado.cdResp?.[c.id] ?? c.resposta ?? '';
    const conf = estado.confirm === 'cdpub:' + c.id;
    resp = `<div class="cd-resp cd-resp-ed"><span class="cd-resp-t">Resposta <span class="cd-st rasc">Não publicada</span></span>
      <textarea class="cd-resp-txt" id="cd-resp-${esc(c.id)}" data-id="${esc(c.id)}" rows="4" maxlength="1500" aria-label="Resposta para ${esc(c.autorNome || 'quem abriu')}"
        placeholder="Escreva a resposta (até 10 linhas). Fica guardada como rascunho até publicar.">${esc(valor)}</textarea>
      ${conf
        ? `<div class="infobox"><span><b>Publicar a resposta?</b> Só quem abriu o relato vê, e ela não muda mais.</span>
          <span class="row"><button class="btn small primary" data-act="cdpublicar" data-id="${esc(c.id)}">Publicar</button><button class="btn small" data-act="cdcancel">Cancelar</button></span></div>`
        : `<button class="btn small primary cd-pub" data-act="askdel" data-k="cdpub:${esc(c.id)}">Publicar resposta</button>`}</div>`;
  }
  return `<div class="cd-item${lido ? '' : ' novo'}"><div class="cd-topo">${c.anonimo ? '<b class="cd-nome cd-anon">Sem identificação</b>' : `<b class="cd-nome">${esc(c.autorNome || '(sem nome)')}</b>`}
      <span class="muted cd-quando">${quando(c.criadoEm)}${c.editadoEm ? ' · editado' : ''}</span>${marca}</div>
    <p class="cd-txt">${esc(c.texto)}</p>${resp}</div>`;
}

export function cardConduta() {
  if (!estado.me || estado.me.grupo) return '';
  if (estado.conduta === null) carregarConduta();
  const L = relatos();
  if (ehRoot()) {
    const novos = L.filter((c) => !c.lidoEm).length;
    const ativa = !!estado.conduta?.ativa;
    // Interruptor (só o root): desligado, o bloco some para os outros; os relatos ficam guardados.
    const sw = `<div class="gira-adm cd-sw"><label class="of-sw"><input type="checkbox" role="switch" data-act="cdativar" ${ativa ? 'checked' : ''} ${estado.conduta === null ? 'disabled' : ''}><span class="of-sw-t" aria-hidden="true"></span><b>Visível para todos</b></label>
        <span class="muted">${ativa ? 'Ligado: a corrente vê o bloco e abre relatos.' : 'Desligado: só você vê este bloco.'}</span></div>`;
    return `<div class="card cd-card">${TITULO}${novos ? `<span class="cd-st aguarda">${novos} não lido${novos > 1 ? 's' : ''}</span>` : ''}</div>
      ${sw}
      <p class="muted cd-intro">Relatos da corrente, com o nome de quem abriu (ou “Sem identificação”, quando a pessoa preferiu; esses não têm resposta). Só o admin root vê. Ao marcar como lido, a pessoa não edita mais; a resposta publicada aparece só para ela.</p>
      ${estado.cdForm === 'novo' ? formulario(null) : '<button class="btn cd-novo" data-act="cdnovo">＋ Abrir relato</button>'}
      ${estado.conduta === null ? '<div class="loading">Carregando…</div>' : L.length ? `<div class="cd-lista">${L.map(itemRoot).join('')}</div>` : '<p class="muted" style="margin:0;font-size:.88rem">Nenhum relato.</p>'}</div>`;
  }
  // Bloco desligado pelo root (ou ainda carregando): a corrente não vê nada.
  if (!estado.conduta?.ativa) return '';
  return `<div class="card cd-card">${TITULO}</div>
    <p class="cd-intro">Viu ou viveu algo que coloca em risco a corrente, a casa ou alguém que vem ser atendido? Pode contar aqui, com tranquilidade.</p>
    <p class="cd-sigilo"><span aria-hidden="true">🔒</span> Só a comissão lê. A resposta aparece só para você, neste bloco. Se preferir, dá para enviar sem se identificar.</p>
    ${estado.cdForm === 'novo' ? formulario(null) : '<button class="btn cd-novo" data-act="cdnovo">＋ Abrir relato</button>'}
    ${L.length ? `<div class="cd-lista"><h3 class="cd-sub">Seus relatos</h3>${L.map(itemMeu).join('')}</div>` : ''}</div>`;
}

export async function enviarConduta(form) {
  const linhas = form.querySelector('textarea').value.replace(/\r/g, '').split('\n');
  const texto = linhas.map((l) => l.trim()).join('\n').trim();
  if (!texto) { toast('Escreva o relato.'); return; }
  if (texto.split('\n').length > 10) { toast('O relato pode ter até 10 linhas.'); return; }
  const id = form.dataset.id;
  const anonimo = !id && !!estado.cdAnonimo;
  if (await acaoConduta('conduta', { ...(id ? { id } : {}), texto, ...(anonimo ? { anonimo } : {}) })) {
    estado.cdForm = null; estado.cdTexto = null; estado.cdAnonimo = false;
    toast(id ? 'Relato atualizado.' : anonimo ? 'Mensagem enviada à comissão, sem identificação. Obrigado por confiar.' : 'Relato enviado. Só a comissão lê.');
    avisar();
  } else if (id) {
    // Pode ter sido lido nesse meio-tempo: busca de novo para mostrar o status certo.
    estado.cdForm = null; estado.cdTexto = null;
    carregarConduta();
  }
}

// Digitação: guarda o texto para um redesenho não apagar (até 10 linhas).
export function digitarConduta(t) {
  if (t.id === 'cd-texto') { t.value = limitar(t.value); estado.cdTexto = t.value; return true; }
  if (t.classList.contains('cd-resp-txt')) { t.value = limitar(t.value); estado.cdResp = { ...(estado.cdResp || {}), [t.dataset.id]: t.value }; return true; }
  return false;
}

const semRascunho = (id) => { if (estado.cdResp) delete estado.cdResp[id]; };

export const cliquesConduta = {
  cdnovo() { estado.cdForm = 'novo'; estado.cdTexto = null; estado.cdAnonimo = false; avisar(); document.getElementById('cd-texto')?.focus(); },
  cdeditar(el) { estado.cdForm = el.dataset.id; estado.cdTexto = null; avisar(); document.getElementById('cd-texto')?.focus(); },
  cdfechar() { estado.cdForm = null; estado.cdTexto = null; estado.cdAnonimo = false; avisar(); },
  cdcancel() { avisar(); },
  async cdler(el) { await acaoConduta('condutaLer', { id: el.dataset.id }); },
  async cdpublicar(el) {
    const id = el.dataset.id;
    const c = relatos().find((x) => x.id === id);
    const resposta = (estado.cdResp?.[id] ?? c?.resposta ?? '').trim();
    if (!resposta) { toast('Escreva a resposta antes de publicar.'); avisar(); return; }
    if (await acaoConduta('condutaResponder', { id, resposta, publicar: true })) { semRascunho(id); toast('Resposta publicada.'); avisar(); }
  },
};

// Sair do campo da resposta guarda o rascunho (ainda não publicado). O campo não tem data-act
// (um toque nele redesenharia a tela): o main.js chama pela classe cd-resp-txt.
export const mudancasConduta = {
  cdanon(t) { estado.cdAnonimo = t.checked; avisar(); },
  async cdativar(t) {
    if (await acaoConduta('condutaAtivar', { ativa: t.checked })) toast(t.checked ? 'Gestão de Conduta e Risco visível para todos.' : 'Gestão de Conduta e Risco escondida: só você vê.');
    else t.checked = !t.checked;
  },
  async cdresp(t) {
    const id = t.dataset.id;
    const c = relatos().find((x) => x.id === id);
    const resposta = t.value.trim();
    if (!c || c.publicadaEm || resposta === (c.resposta || '')) { semRascunho(id); return; }
    if (await acaoConduta('condutaResponder', { id, resposta, publicar: false }, { redesenhar: false })) semRascunho(id);
  },
};
