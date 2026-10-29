// GET /api/me — quem sou eu e o que posso fazer.
import { rota } from './_lib/http.js';
import { exigir } from './_lib/sessao.js';
import { PERMISSOES } from '../shared/permissoes.js';

export default rota({
  GET: async (req) => {
    const perfil = await exigir(req);
    return { ...perfil, permissoes: PERMISSOES[perfil.papel] || [] };
  },
});
