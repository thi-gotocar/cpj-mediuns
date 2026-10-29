// POST /api/giras/:data/remanejar — ajusta só quem foi afetado por faltas.
import { rota, validarData, HttpError, MSG_ENCERRADA } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { db } from '../../_lib/db.js';
import { giraVazia, remanejar } from '../../../shared/regras.js';

export default rota({
  POST: async (req) => {
    const perfil = await exigir(req, 'giras:sortear');
    const data = validarData(req.query.data);
    const [pessoas, giras] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('giras_listar')]);
    const g = giras.find((x) => x.data === data) || giraVazia(data);
    if (g.encerrada) throw new HttpError(409, MSG_ENCERRADA);
    const { patch, mensagem } = remanejar(pessoas, giras, g);
    const gira = patch ? await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }) : g;
    return { gira, mensagem };
  },
});
