// GET  /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
//      O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
// GET  /api/giras?lista=eventos — eventos da casa (todos veem; a aba Gira mostra os da semana)
// POST /api/giras  { acao: 'evento', id?, data: 'AAAA-MM-DD', nome, tipo: 'gira'|'amaci'|'aviso'|'evento' } · { acao: 'excluirEvento', id }  → eventos
// GET  /api/giras?lista=videos — vídeos do YouTube das giras (aba Vídeos), do mais recente ao mais antigo
// POST /api/giras  { acao: 'video', id?, data, evento, youtube: link ou código, classes: [..] } · { acao: 'excluirVideo', id }  → vídeos
import { rota, corpo, validarData, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { TIPO_EVENTO_KEYS } from '../../shared/eventos.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { idDoYoutube, CLASSES_VIDEO_TODAS } from '../../shared/videos.js';

function acaoVideo(b) {
  if (b.acao === 'excluirVideo') return db.rpc('video_excluir', { id: validarId(b.id, 'Vídeo') });
  const evento = String(b.evento ?? '').replace(/\s+/g, ' ').trim();
  if (!evento || evento.length > 120) throw new HttpError(400, 'Informe o evento da gira (até 120 letras).');
  const youtube = idDoYoutube(b.youtube);
  if (!youtube) throw new HttpError(400, 'Link do YouTube inválido.');
  const classes = Array.isArray(b.classes) ? [...new Set(b.classes)] : [];
  if (classes.some((c) => !CLASSES_VIDEO_TODAS.includes(c))) throw new HttpError(400, 'Classificação inválida.');
  return db.rpc('video_salvar', { id: b.id ? validarId(b.id, 'Vídeo') : '', data: validarData(String(b.data || '')), evento, youtube, classes });
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'eventos') {
      await exigir(req);
      return db.rpc('eventos_listar');
    }
    if (req.query.lista === 'videos') {
      await exigir(req, 'videos:ver');
      return db.rpc('videos_listar');
    }
    const eu = await exigir(req, 'giras:ler');
    return ocultarSorteios(eu, await db.rpc('giras_listar'));
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'video' || b.acao === 'excluirVideo') {
      await exigir(req, 'videos:editar');
      return acaoVideo(b);
    }
    await exigir(req, 'eventos:editar');
    if (b.acao === 'excluirEvento') return db.rpc('evento_excluir', { id: validarId(b.id, 'Evento') });
    if (b.acao !== 'evento') throw new HttpError(400, 'Ação inválida.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do evento (até 120 letras).');
    if (!TIPO_EVENTO_KEYS.includes(b.tipo)) throw new HttpError(400, 'Escolha o tipo (gira, amaci, aviso ou evento).');
    return db.rpc('evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : '', data: validarData(String(b.data || '')), nome, tipo: b.tipo });
  },
});
