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
