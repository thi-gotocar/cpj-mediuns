// GET /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
// O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
import { rota } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';

export default rota({
  GET: async (req) => {
    await exigir(req, 'giras:ler');
    return db.rpc('giras_listar');
  },
});
