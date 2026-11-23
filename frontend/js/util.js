// Utilidades de tela: datas, escape de HTML e avisos.

export function hoje() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function pd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export const dLong = (s) => pd(s).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const dShort = (s) => pd(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const dDM = (s) => pd(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
export const wd = (s) => pd(s).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastT;
export function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 3200);
}

export function baixar(blobOuUrl, nome) {
  const url = typeof blobOuUrl === 'string' ? blobOuUrl : URL.createObjectURL(blobOuUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOuUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Compartilhar uma imagem PNG pelo menu do aparelho (WhatsApp etc.). podeCompartilharImagem: o aparelho aceita arquivo?
// compartilharImagem → true se foi (ou a pessoa desistiu no menu), false se não deu.
const arquivoPng = (blob, nome) => new File([blob], nome, { type: 'image/png' });
export function podeCompartilharImagem(blob, nome) {
  try { return !!(blob && navigator.canShare && navigator.canShare({ files: [arquivoPng(blob, nome)] })); } catch { return false; }
}
export async function compartilharImagem(blob, nome, titulo) {
  try {
    if (!podeCompartilharImagem(blob, nome)) return false;
    await navigator.share({ files: [arquivoPng(blob, nome)], title: titulo });
    return true;
  } catch (e) {
    return e?.name === 'AbortError';
  }
}

// Listas que mostram só os primeiros N itens e rolam o resto ([data-rolar="N"]):
// a altura máxima é medida depois de desenhar, porque cada item tem uma altura.
// data-rolar="n": mostra n itens e rola o resto. Com n quebrado (ex.: 2.3), aparece um pedaço do seguinte, para indicar que rola.
export function ajustarRolagem() {
  document.querySelectorAll('[data-rolar]').forEach((el) => {
    const n = Number(el.dataset.rolar);
    const inteiro = Math.floor(n);
    const kids = el.children;
    el.style.maxHeight = '';
    if (kids.length <= n) return;
    const prox = kids[inteiro];
    el.style.maxHeight = (prox.offsetTop - kids[0].offsetTop + (n - inteiro) * prox.offsetHeight) + 'px';
  });
}

// Telefone enquanto digita: (11) 98765-4321.
export function mascaraTel(el) {
  const d = el.value.replace(/\D/g, '').slice(0, 11);
  if (!d) { el.value = ''; return; }
  const resto = d.slice(2);
  const corte = d.length === 11 ? 5 : 4;
  el.value = d.length <= 2 ? `(${d}` : `(${d.slice(0, 2)}) ${resto.length > corte ? `${resto.slice(0, corte)}-${resto.slice(corte)}` : resto}`;
}

// Iniciais do nome (até duas), para o lugar da foto de quem ainda não tem.
// Para busca: minúsculas e sem acento.
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const iniciais = (nome) => String(nome || '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Formulários marcados com data-rascunho (ex.: cadastro e edição na aba Pessoas): o que a pessoa digitou e ainda não
// salvou sobrevive ao redesenho (ao voltar para o app, a atualização do servidor redesenha a tela). Guarda só os campos
// mudados (valor diferente do que veio na tela) e devolve se o formulário e o campo continuam lá, com o valor de antes.
const valorPadrao = (el) => (el.tagName === 'SELECT' ? ([...el.options].find((o) => o.defaultSelected) || el.options[0])?.value ?? '' : el.defaultValue);
// Redesenhar troca o HTML inteiro: as imagens seriam recriadas (piscam e decodificam de novo) e os carrosséis voltariam
// para o começo. Guarda as <img> já carregadas (pelo src) e a rolagem lateral dos carrosséis, e devolve depois.
const CARROSSEIS = '.di-gal-l, .gi-car, .matrix';
export function guardarTela(main) {
  const imgs = new Map();
  main.querySelectorAll('img[src]').forEach((i) => { if (i.complete) { const k = i.getAttribute('src'); imgs.set(k, [...(imgs.get(k) || []), i]); } });
  const rolagem = [...main.querySelectorAll(CARROSSEIS)].map((el) => el.scrollLeft);
  return { imgs, rolagem };
}
export function devolverTela(main, { imgs, rolagem }) {
  if (imgs.size) {
    main.querySelectorAll('img[src]').forEach((nova) => {
      const velha = imgs.get(nova.getAttribute('src'))?.shift();
      if (!velha) return;
      for (const a of [...velha.attributes]) if (!nova.hasAttribute(a.name)) velha.removeAttribute(a.name);
      for (const a of [...nova.attributes]) if (velha.getAttribute(a.name) !== a.value) velha.setAttribute(a.name, a.value);
      nova.replaceWith(velha);
    });
  }
  const els = main.querySelectorAll(CARROSSEIS);
  if (els.length === rolagem.length) els.forEach((el, i) => { if (rolagem[i]) el.scrollLeft = rolagem[i]; });
}

export function guardarRascunhos(main) {
  const r = [];
  main.querySelectorAll('form[data-rascunho][id]').forEach((f) => {
    const campos = [];
    f.querySelectorAll('input[id], select[id], textarea[id]').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file') return;
      if (el.value !== valorPadrao(el)) campos.push([el.id, el.value, valorPadrao(el)]);
    });
    if (campos.length) r.push([f.id, f.dataset.id || '', campos]);
  });
  return r;
}
export function devolverRascunhos(main, r) {
  for (const [fid, did, campos] of r) {
    const f = main.querySelector('#' + CSS.escape(fid));
    if (!f || (f.dataset.id || '') !== did) continue;   // outro registro em edição: não mistura
    for (const [id, valor, antes] of campos) {
      const el = f.querySelector('#' + CSS.escape(id));
      if (el && !el.disabled && el.value === antes) el.value = valor;
    }
  }
}
