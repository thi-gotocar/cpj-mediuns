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

// Listas que mostram só os primeiros N itens e rolam o resto ([data-rolar="N"]):
// a altura máxima é medida depois de desenhar, porque cada item tem uma altura.
export function ajustarRolagem() {
  document.querySelectorAll('[data-rolar]').forEach((el) => {
    const n = Number(el.dataset.rolar);
    const kids = el.children;
    el.style.maxHeight = '';
    if (kids.length <= n) return;
    el.style.maxHeight = (kids[n].offsetTop - kids[0].offsetTop) + 'px';
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
export const iniciais = (nome) => String(nome || '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
