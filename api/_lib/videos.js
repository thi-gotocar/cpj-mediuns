// Vídeos do YouTube das giras (aba Vídeos). Rotas em api/giras.
import { validarData, validarId, HttpError } from './http.js';
import { db } from './db.js';
import { idDoYoutube, CLASSES_VIDEO_TODAS } from '../../shared/videos.js';

export function acaoVideo(b) {
  if (b.acao === 'excluirVideo') return db.rpc('video_excluir', { id: validarId(b.id, 'Vídeo') });
  const evento = String(b.evento ?? '').replace(/\s+/g, ' ').trim();
  if (!evento || evento.length > 120) throw new HttpError(400, 'Informe o evento da gira (até 120 letras).');
  const youtube = idDoYoutube(b.youtube);
  if (!youtube) throw new HttpError(400, 'Link do YouTube inválido.');
  const classes = Array.isArray(b.classes) ? [...new Set(b.classes)] : [];
  if (classes.some((c) => !CLASSES_VIDEO_TODAS.includes(c))) throw new HttpError(400, 'Classificação inválida.');
  return db.rpc('video_salvar', { id: b.id ? validarId(b.id, 'Vídeo') : '', data: validarData(String(b.data || '')), evento, youtube, classes });
}
