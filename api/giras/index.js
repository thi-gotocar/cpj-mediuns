// GET  /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
//      O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
// GET  /api/giras?lista=eventos — eventos da casa (todos veem; a aba Gira mostra os da semana)
// POST /api/giras  { acao: 'evento', id?, data: 'AAAA-MM-DD', nome } · { acao: 'excluirEvento', id }  → eventos
import { rota, corpo, validarData, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'eventos') {
      await exigir(req);
      return db.rpc('eventos_listar');
    }
    await exigir(req, 'giras:ler');
    return db.rpc('giras_listar');
  },
  POST: async (req) => {
    await exigir(req, 'eventos:editar');
    const b = corpo(req);
    if (b.acao === 'excluirEvento') return db.rpc('evento_excluir', { id: validarId(b.id, 'Evento') });
    if (b.acao !== 'evento') throw new HttpError(400, 'Ação inválida.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do evento (até 120 letras).');
    return db.rpc('evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : '', data: validarData(String(b.data || '')), nome });
  },
});
