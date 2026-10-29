// GET /api/me — quem sou eu e o que posso fazer.
import { rota } from './_lib/http.js';
import { exigir } from './_lib/sessao.js';
import { PERMISSOES } from '../shared/permissoes.js';

export default rota({
  GET: async (req) => {
    const u = await exigir(req);
    return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, permissoes: PERMISSOES[u.papel] || [] };
  },
});
