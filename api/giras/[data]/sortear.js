// POST /api/giras/:data/sortear — sorteio completo (mantém as duplas fixadas).
import { rota, validarData } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { db } from '../../_lib/supabase.js';
import { giraVazia, sortear } from '../../../shared/regras.js';

export default rota({
  POST: async (req) => {
    const perfil = await exigir(req, 'giras:sortear');
    const data = validarData(req.query.data);
    const [pessoas, giras] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('giras_listar')]);
    const g = giras.find((x) => x.data === data) || giraVazia(data);
    const { patch, mensagem } = sortear(pessoas, giras, g);
    const gira = Object.keys(patch).length ? await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }) : g;
    return { gira, mensagem };
  },
});
