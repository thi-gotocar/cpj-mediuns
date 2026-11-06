// Aba Vídeos: vídeos do YouTube das giras (por enquanto só o root).
// Lista por mês (do mais recente ao mais antigo), um vídeo por linha, todos fechados: tocar na linha abre o vídeo.
// O admin classifica cada vídeo por orixá/linha; o filtro de cima usa essa classificação.

import { lerDataCurta, dataCurta } from '/shared/eventos.js';
import { CLASSES_VIDEO, idDoYoutube } from '/shared/videos.js';
import { estado, pode, carregarVideos, acaoVideos, publicarVideos, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const U = () => (estado.vidUi ||= { novo: false, aberto: null, editar: null, filtro: '', busca: '', confirmar: null });
const cabDobra = (act, titulo, count, aberto) => `<button class="grp-h dobra" data-act="${act}" aria-expanded="${aberto}"><h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Formulário de publicar (f-video) ou de editar (f-video-ed).
function formulario(v) {
  const marcadas = v ? v.classes : [];
  return `<form id="${v ? 'f-video-ed' : 'f-video'}" class="vd-form" ${v ? `data-id="${v.id}"` : ''} autocomplete="off">
    <div class="ev-form">
      <label class="field ev-data">Data<input type="text" ${v ? '' : 'id="vid-data"'} name="data" inputmode="numeric" maxlength="10" data-mascara="data" required placeholder="31/10" value="${v ? `${dataCurta(v.data)}/${v.data.slice(0, 4)}` : ''}"></label>
      <label class="field grow">Evento de gira<input type="text" name="evento" maxlength="120" required placeholder="Ex.: Gira de Ogum" value="${v ? esc(v.evento) : ''}"></label>
    </div>
    <label class="field">Link do YouTube<input type="text" name="youtube" inputmode="url" required placeholder="https://youtu.be/…" value="${v ? `https://youtu.be/${v.youtube}` : ''}"></label>
    <div class="vd-classes"><span class="muted" style="font-size:.85rem">Classificação (para a busca):</span>
      ${CLASSES_VIDEO.map((g) => `<div class="vd-cl-grupo"><span class="vd-cl-nome">${g.grupo}</span>${g.itens.map((c) => `<label class="chip"><input type="checkbox" name="classe" value="${esc(c)}" ${marcadas.includes(c) ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>`).join('')}
    </div>
    <span class="row ev-bts"><button class="btn primary" type="submit">${v ? 'Salvar' : 'Publicar'}</button>${v ? '<button class="btn" type="button" data-act="vidcancelar">Cancelar</button>' : ''}</span>
  </form>`;
}

function linha(v, editar) {
  const u = U();
  const aberto = u.aberto === v.id;
  let h = `<div class="vd-l${aberto ? ' aberto' : ''}"><button class="vd-cab" data-act="vidabrir" data-id="${v.id}" aria-expanded="${aberto}">
    <span class="vd-tit"><b class="vd-dia">${dataCurta(v.data)}</b> - ${esc(v.evento)}</span>
    <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span>
    ${v.classes.length ? `<span class="vd-tags">${v.classes.map((c) => `<span class="cur-tag cor">${esc(c)}</span>`).join('')}</span>` : ''}</button>`;
  if (!aberto) return h + '</div>';
  if (editar && u.editar === v.id) return h + formulario(v) + '</div>';
  h += `<div class="vd-player"><iframe src="https://www.youtube-nocookie.com/embed/${v.youtube}?rel=0" title="${esc(v.evento)}" loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
    <div class="vd-acts"><a class="btn small" href="https://youtu.be/${v.youtube}" target="_blank" rel="noopener">Abrir no YouTube ↗</a>
    ${editar ? `<button class="btn small" data-act="videditar" data-id="${v.id}">Editar / classificar</button><button class="btn small" data-act="videxcluir" data-id="${v.id}">Excluir</button>` : ''}</div>`;
  return h + '</div>';
}

function filtrar(lista) {
  const u = U();
  const busca = semAcento(u.busca).trim();
  return lista.filter((v) => (!u.filtro || v.classes.includes(u.filtro)) && (!busca || semAcento(v.evento).includes(busca)));
}

function cardLista(V, editar) {
  const u = U();
  let h = `<div class="card vd-card"><div class="grp-h"><h2>🎬 Vídeos das giras</h2><span class="count">${V.length}</span></div>`;
  if (!V.length) return h + '<p class="muted" style="margin:0">Nenhum vídeo publicado.</p></div>';
  h += `<div class="vd-busca"><select data-act="vidfiltro" aria-label="Classificação"><option value="">Todas as classificações</option>
      ${CLASSES_VIDEO.map((g) => `<optgroup label="${g.grupo}">${g.itens.map((c) => `<option value="${esc(c)}" ${c === u.filtro ? 'selected' : ''}>${esc(c)}</option>`).join('')}</optgroup>`).join('')}</select>
    <input type="text" id="vid-busca" enterkeyhint="search" placeholder="Buscar pelo evento" value="${esc(u.busca)}" aria-label="Buscar pelo evento"></div>`;
  const lista = filtrar(V);
  if (!lista.length) return h + '<p class="muted" style="margin:0">Nenhum vídeo com essa busca.</p></div>';
  // A lista já vem do mais recente para o mais antigo.
  const porMes = {};
  lista.forEach((v) => { (porMes[v.data.slice(0, 7)] ||= []).push(v); });
  h += Object.keys(porMes).sort().reverse().map((k) => {
    const [a, m] = k.split('-');
    return `<div class="vd-mes"><h3 class="vd-mes-h"><b>${MESES[Number(m) - 1]}</b> <span class="muted">${a}</span><span class="count">${porMes[k].length}</span></h3>
      ${porMes[k].map((v) => linha(v, editar)).join('')}</div>`;
  }).join('');
  return h + '</div>';
}

function janela() {
  const id = U().confirmar;
  const v = id && (estado.videos || []).find((x) => x.id === id);
  if (!v) return '';
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="vd-t"><div class="modal">
    <h3 id="vd-t">Excluir vídeo</h3><p style="margin:0">Excluir o vídeo <b>${dataCurta(v.data)} - ${esc(v.evento)}</b>? Ele sai só daqui; no YouTube continua.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="vidnaoexcluir">Cancelar</button><button class="btn danger" data-act="vidsimexcluir">Excluir</button></div>
  </div></div>`;
}

export function render() {
  const V = estado.videos;
  if (V === null) { estado.videos = undefined; carregarVideos(); }
  if (!V) return '<section class="panel"><div class="loading">Carregando os vídeos…</div></section>';
  const editar = pode('videos:editar');
  const u = U();
  const pub = !!estado.me?.videosPublicada;
  // Quem vê a aba: marcada = toda a corrente; desmarcada = só quem tem a aba Vídeos no perfil (os admins).
  const aba = editar ? `<div class="card adm"><label class="check vd-pub"><input type="checkbox" data-act="vidpublicar" ${pub ? 'checked' : ''}>
    <span><b>Aba publicada</b><br><span class="muted">${pub ? 'Toda a corrente vê a aba Vídeos.' : 'Só os admins veem a aba Vídeos.'}</span></span></label></div>` : '';
  const novo = editar ? `<div class="card adm">${cabDobra('vidnovo', '＋ Publicar vídeo', '', u.novo)}${u.novo ? formulario(null) : ''}</div>` : '';
  return `<section class="panel">${aba}${novo}${cardLista(V, editar)}${janela()}</section>`;
}

export const cliques = {
  vidnovo() { U().novo = !U().novo; avisar(); if (U().novo) document.getElementById('vid-data')?.focus(); },
  // Um vídeo aberto por vez (abrir outro fecha o que estava aberto).
  vidabrir(el) { const u = U(); u.aberto = u.aberto === el.dataset.id ? null : el.dataset.id; u.editar = null; avisar(); },
  videditar(el) { U().editar = el.dataset.id; avisar(); },
  vidcancelar() { U().editar = null; avisar(); },
  videxcluir(el) { U().confirmar = el.dataset.id; avisar(); },
  vidnaoexcluir() { U().confirmar = null; avisar(); },
  async vidsimexcluir() {
    const id = U().confirmar;
    U().confirmar = null;
    if (id && (await acaoVideos('excluirVideo', { id }))) toast('Vídeo excluído.');
  },
};

export const mudancas = {
  vidfiltro(el) { U().filtro = el.value; U().aberto = null; avisar(); },
  async vidpublicar(el) {
    const pub = el.checked;
    // Se não gravou, desfaz a marcação (a tela não é redesenhada quando nada mudou).
    if (!(await publicarVideos(pub))) { el.checked = !pub; return; }
    toast(pub ? 'Aba Vídeos publicada: toda a corrente vê.' : 'Aba Vídeos só para os admins.');
  },
};

export function buscar(el) { U().busca = el.value; avisar(); }

// Publicar (f-video) ou salvar a edição (f-video-ed).
export async function enviar(form) {
  const data = lerDataCurta(form.elements.data.value, hoje());
  const evento = form.elements.evento.value.replace(/\s+/g, ' ').trim();
  const youtube = idDoYoutube(form.elements.youtube.value);
  const classes = [...form.querySelectorAll('input[name="classe"]:checked')].map((x) => x.value);
  if (!data) { toast('Data inválida. Use o formato 31/10.'); form.elements.data.focus(); return; }
  if (!evento) { toast('Digite o evento da gira.'); form.elements.evento.focus(); return; }
  if (!youtube) { toast('Link do YouTube inválido.'); form.elements.youtube.focus(); return; }
  const id = form.dataset.id || '';
  if (!(await acaoVideos('video', { id, data, evento, youtube, classes }))) return;
  if (id) { U().editar = null; toast('Vídeo alterado.'); avisar(); return; }
  toast(`Vídeo publicado em ${dataCurta(data)}/${data.slice(0, 4)}.`);
  document.getElementById('vid-data')?.focus();
}
