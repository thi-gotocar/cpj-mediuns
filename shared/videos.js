// Aba Vídeos: vídeos do YouTube das giras, classificados por orixá ou linha para facilitar a busca.

import { ORIXAS, LINHAS } from './regras.js';

// Classificações que o admin pode marcar num vídeo (um vídeo pode ter várias).
export const CLASSES_VIDEO = [
  { grupo: 'Orixás', itens: ORIXAS },
  ...LINHAS.map((g) => ({ grupo: g.grupo, itens: g.itens.map(([, label]) => label) })),
];
export const CLASSES_VIDEO_TODAS = CLASSES_VIDEO.flatMap((g) => g.itens);

// Link do YouTube (watch?v=, youtu.be/, shorts/, live/, embed/) ou o próprio código → código de 11 letras (ou null).
export function idDoYoutube(txt) {
  const s = String(txt || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/) || [])[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
