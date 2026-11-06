// Aba Fotos: álbuns por gira/evento. Todos veem; quem entrou com senha envia; quem enviou apaga a própria foto
// e os admins apagam qualquer uma (e editam/excluem álbuns). O navegador reduz a foto antes de enviar.

import { lerDataCurta, dataCurta } from '/shared/eventos.js';
import { FOTO_LADO, MINI_LADO, FOTO_QUALIDADE, FOTO_MAX_BYTES, MINI_MAX_BYTES } from '/shared/fotos.js';
import { estado, pode, meAtivo, carregarFotos, acaoFotos, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const U = () => (estado.fotUi ||= { album: null, novoData: '', novoNome: '', abertos: new Set(), ver: null, apagar: false, editar: null, excluirAlbum: null, envio: null });
const podeEnviar = () => pode('fotos:ver') && (!meAtivo()?.corrente || !!meAtivo().temSenha);
const tamanho = (b) => (b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1).replace('.', ',') + ' GB' : Math.max(1, Math.round(b / 1024 ** 2)) + ' MB');
const fotosDo = (F, albumId) => F.fotos.filter((f) => f.albumId === albumId);
const titulo = (a) => `${dataCurta(a.data)} - ${esc(a.nome)}`;

// ---------- enviar ----------
function cardEnviar(F) {
  const u = U();
  let h = '<div class="card ft-enviar"><h2>📷 Enviar fotos</h2>';
  if (!F.configurado) return h + '<p class="muted" style="margin:0">O armazenamento das fotos ainda não foi configurado.</p></div>';
  if (!podeEnviar()) return h + '<p class="muted" style="margin:0">Para enviar fotos, crie a sua senha no botão <b>🔒 Criar senha</b>, no topo da tela.</p></div>';
  if (u.envio) {
    return h + `<p style="margin:0">Enviando <b>${u.envio.feitas + 1}</b> de <b>${u.envio.total}</b>…</p>
      <div class="mp-barra ok"><span style="width:${Math.round((u.envio.feitas / u.envio.total) * 100)}%"></span></div>
      <p class="muted" style="margin:0;font-size:.82rem">Não feche o app até terminar.</p></div>`;
  }
  if (u.album !== 'novo' && !F.albuns.some((a) => a.id === u.album)) u.album = F.albuns[0]?.id || 'novo';
  h += `<label class="field">Álbum<select data-act="ftalbum">
    <option value="novo" ${u.album === 'novo' ? 'selected' : ''}>＋ Novo álbum…</option>
    ${F.albuns.map((a) => `<option value="${a.id}" ${a.id === u.album ? 'selected' : ''}>${dataCurta(a.data)}/${a.data.slice(0, 4)} - ${esc(a.nome)}</option>`).join('')}</select></label>`;
  if (u.album === 'novo') {
    h += `<div class="ev-form"><label class="field ev-data">Data<input type="text" id="ft-data" inputmode="numeric" maxlength="10" data-mascara="data" placeholder="31/10" value="${esc(u.novoData)}"></label>
      <label class="field grow">Gira / evento<input type="text" id="ft-nome" maxlength="120" placeholder="Ex.: Gira de Ogum" value="${esc(u.novoNome)}"></label></div>`;
  }
  return h + `<label class="btn primary ft-escolher">Escolher fotos<input type="file" accept="image/*" multiple data-act="ftarquivos" hidden></label></div>`;
}

// O maior lado vira "lado" e a foto vira JPEG; se passar do limite, baixa a qualidade.
async function reduzir(img, lado, max) {
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  for (let q = FOTO_QUALIDADE; q > 0.3; q -= 0.15) {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    if (blob && blob.size <= max) return { blob, largura: c.width, altura: c.height };
  }
  throw new Error('foto grande demais');
}

async function abrirImagem(arquivo) {
  try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch { /* tenta pelo <img> */ }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

const base64 = (blob) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = erro;
  r.readAsDataURL(blob);
});

async function enviarArquivos(arquivos) {
  const u = U();
  if (!arquivos.length || u.envio) return;
  let albumId = u.album;
  if (albumId === 'novo') {
    const data = lerDataCurta(document.getElementById('ft-data')?.value, hoje());
    const nome = (document.getElementById('ft-nome')?.value || '').replace(/\s+/g, ' ').trim();
    if (!data) { toast('Data do álbum inválida. Use o formato 31/10.'); document.getElementById('ft-data')?.focus(); return; }
    if (!nome) { toast('Digite a gira ou o evento do álbum.'); document.getElementById('ft-nome')?.focus(); return; }
    const r = await acaoFotos('fotoAlbum', { data, nome });
    if (!r) return;
    albumId = r.albumId;
    Object.assign(u, { album: albumId, novoData: '', novoNome: '' });
  }
  u.envio = { feitas: 0, total: arquivos.length };
  avisar();
  let falhas = 0;
  for (const arq of arquivos) {
    try {
      const img = await abrirImagem(arq);
      const foto = await reduzir(img, FOTO_LADO, FOTO_MAX_BYTES);
      const mini = await reduzir(img, MINI_LADO, MINI_MAX_BYTES);
      img.close?.();
      const r = await acaoFotos('fotoEnviar', { albumId, foto: await base64(foto.blob), miniatura: await base64(mini.blob), largura: foto.largura, altura: foto.altura });
      if (!r) falhas++;
    } catch {
      falhas++;
      toast(`Não consegui abrir ${arq.name}.`);
    }
    u.envio.feitas++;
    avisar();
  }
  u.envio = null;
  u.abertos.add(albumId);
  await carregarFotos();
  const ok = arquivos.length - falhas;
  if (ok) toast(ok === 1 ? 'Foto enviada.' : `${ok} fotos enviadas.`);
}

// ---------- álbuns ----------
function linhaAlbum(F, a, editar) {
  const u = U();
  const fs = fotosDo(F, a.id);
  const aberto = u.abertos.has(a.id);
  let h = `<div class="vd-l"><button class="vd-cab" data-act="ftabrir" data-id="${a.id}" aria-expanded="${aberto}">
    <span class="vd-tit"><b class="vd-dia">${dataCurta(a.data)}</b> - ${esc(a.nome)}</span>
    <span class="count muted">${fs.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  if (editar && u.editar === a.id) {
    return h + `<form id="f-ft-album" class="ev-form ft-form" data-id="${a.id}" autocomplete="off">
      <label class="field ev-data">Data<input type="text" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required value="${dataCurta(a.data)}/${a.data.slice(0, 4)}"></label>
      <label class="field grow">Gira / evento<input type="text" name="nome" maxlength="120" required value="${esc(a.nome)}"></label>
      <span class="row ev-bts"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="ftcancelar">Cancelar</button></span></form></div>`;
  }
  h += fs.length
    ? `<div class="ft-grade">${fs.map((f) => `<button class="ft-mini" data-act="ftver" data-id="${f.id}" aria-label="Abrir foto">${f.mini ? `<img src="${f.mini}" alt="" loading="lazy">` : ''}</button>`).join('')}</div>`
    : '<p class="muted" style="margin:0 0 8px">Nenhuma foto neste álbum.</p>';
  if (editar) h += `<div class="vd-acts"><button class="btn small" data-act="fteditar" data-id="${a.id}">Editar álbum</button><button class="btn small" data-act="ftexcluiralbum" data-id="${a.id}">Excluir álbum</button></div>`;
  return h + '</div>';
}

function cardAlbuns(F, editar) {
  let h = `<div class="card vd-card"><div class="grp-h"><h2>🖼️ Álbuns</h2><span class="count">${F.albuns.length}</span></div>`;
  if (!F.albuns.length) h += '<p class="muted" style="margin:0">Nenhum álbum ainda.</p>';
  else {
    // A lista já vem do mais recente para o mais antigo.
    const porMes = {};
    F.albuns.forEach((a) => { (porMes[a.data.slice(0, 7)] ||= []).push(a); });
    h += Object.keys(porMes).sort().reverse().map((k) => {
      const [ano, m] = k.split('-');
      return `<div class="vd-mes"><h3 class="vd-mes-h"><b>${MESES[Number(m) - 1]}</b> <span class="muted">${ano}</span><span class="count">${porMes[k].length}</span></h3>
        ${porMes[k].map((a) => linhaAlbum(F, a, editar)).join('')}</div>`;
    }).join('');
  }
  if (editar) h += `<p class="muted" style="margin:0;font-size:.82rem">Espaço usado: ${tamanho(F.usado)} de ${tamanho(F.limite)} (gratuito).</p>`;
  return h + '</div>';
}

// ---------- foto em tela cheia ----------
function telaCheia(F) {
  const u = U();
  const f = F.fotos.find((x) => x.id === u.ver);
  if (!f) return '';
  const fs = fotosDo(F, f.albumId);
  const i = fs.indexOf(f);
  const a = F.albuns.find((x) => x.id === f.albumId);
  const rodape = u.apagar
    ? `<span>Apagar esta foto?</span><span class="row"><button class="btn small" data-act="ftnaoapagar">Cancelar</button><button class="btn small danger" data-act="ftsimapagar">Apagar</button></span>`
    : `<span class="muted">Enviada por ${esc(f.autorNome || '—')}</span>${f.apagar ? '<button class="btn small" data-act="ftapagar">Apagar</button>' : ''}`;
  return `<div class="ft-luz" role="dialog" aria-modal="true" aria-label="Foto">
    <div class="ft-luz-topo"><span class="ft-luz-tit">${a ? titulo(a) : ''}</span><span class="muted">${i + 1} de ${fs.length}</span><button class="btn small" data-act="ftfechar" aria-label="Fechar">✕</button></div>
    <div class="ft-luz-img">${i > 0 ? `<button class="ft-nav ant" data-act="ftver" data-id="${fs[i - 1].id}" aria-label="Foto anterior">‹</button>` : ''}
      ${f.url ? `<img src="${f.url}" alt="">` : ''}
      ${i < fs.length - 1 ? `<button class="ft-nav prox" data-act="ftver" data-id="${fs[i + 1].id}" aria-label="Próxima foto">›</button>` : ''}</div>
    <div class="ft-luz-rodape">${rodape}</div></div>`;
}

function janela(F) {
  const a = F.albuns.find((x) => x.id === U().excluirAlbum);
  if (!a) return '';
  const n = fotosDo(F, a.id).length;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ft-t"><div class="modal">
    <h3 id="ft-t">Excluir álbum</h3><p style="margin:0">Excluir o álbum <b>${titulo(a)}</b>${n ? ` e as <b>${n} foto${n === 1 ? '' : 's'}</b> dele` : ''}? Não dá para desfazer.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="ftnaoexcluir">Cancelar</button><button class="btn danger" data-act="ftsimexcluir">Excluir</button></div>
  </div></div>`;
}

export function render() {
  const F = estado.fotos;
  if (F === null) { estado.fotos = undefined; carregarFotos(); }
  if (!F) return '<section class="panel"><div class="loading">Carregando as fotos…</div></section>';
  const editar = pode('fotos:editar');
  return `<section class="panel">${cardEnviar(F)}${cardAlbuns(F, editar)}${telaCheia(F)}${janela(F)}</section>`;
}

export const cliques = {
  ftabrir(el) { const s = U().abertos; if (s.has(el.dataset.id)) s.delete(el.dataset.id); else s.add(el.dataset.id); U().editar = null; avisar(); },
  ftver(el) { U().ver = el.dataset.id; U().apagar = false; avisar(); },
  ftfechar() { U().ver = null; U().apagar = false; avisar(); },
  ftapagar() { U().apagar = true; avisar(); },
  ftnaoapagar() { U().apagar = false; avisar(); },
  async ftsimapagar() {
    const u = U();
    const F = estado.fotos;
    const f = F.fotos.find((x) => x.id === u.ver);
    if (!f) return;
    // Depois de apagar, mostra a próxima do álbum (ou a anterior; ou fecha).
    const fs = fotosDo(F, f.albumId);
    const i = fs.indexOf(f);
    const seguinte = fs[i + 1] || fs[i - 1] || null;
    u.apagar = false;
    if (await acaoFotos('fotoExcluir', { id: f.id })) { u.ver = seguinte?.id || null; toast('Foto apagada.'); avisar(); }
  },
  fteditar(el) { U().editar = el.dataset.id; avisar(); },
  ftcancelar() { U().editar = null; avisar(); },
  ftexcluiralbum(el) { U().excluirAlbum = el.dataset.id; avisar(); },
  ftnaoexcluir() { U().excluirAlbum = null; avisar(); },
  async ftsimexcluir() {
    const id = U().excluirAlbum;
    U().excluirAlbum = null;
    if (id && (await acaoFotos('fotoExcluirAlbum', { id }))) toast('Álbum excluído.');
  },
};

export const mudancas = {
  ftalbum(el) { U().album = el.value; avisar(); if (el.value === 'novo') document.getElementById('ft-data')?.focus(); },
  ftarquivos(el) { const arqs = [...el.files]; el.value = ''; enviarArquivos(arqs); },
};

// Campos do álbum novo: guardados a cada letra (a tela pode ser redesenhada antes de escolher as fotos).
export function digitando(el) {
  if (el.id === 'ft-data') U().novoData = el.value;
  else U().novoNome = el.value;
}

// Editar álbum (f-ft-album): só admin.
export async function enviarAlbum(form) {
  const data = lerDataCurta(form.elements.data.value, hoje());
  const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
  if (!data) { toast('Data inválida. Use o formato 31/10.'); form.elements.data.focus(); return; }
  if (!nome) { toast('Digite a gira ou o evento.'); form.elements.nome.focus(); return; }
  if (await acaoFotos('fotoAlbum', { id: form.dataset.id, data, nome })) { U().editar = null; toast('Álbum alterado.'); avisar(); }
}
