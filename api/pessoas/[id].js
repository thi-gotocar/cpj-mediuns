// PATCH  /api/pessoas/:id   { nome?, funcao?, experiente? }
// DELETE /api/pessoas/:id
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/supabase.js';
import { FUNCAO_KEYS } from '../../shared/regras.js';

export default rota({
  PATCH: async (req) => {
    await exigir(req, 'pessoas:editar');
    const id = validarId(req.query.id);
    const b = corpo(req);
    const p = { id };
    if ('nome' in b) {
      const nome = String(b.nome || '').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Nome inválido.');
      p.nome = nome;
    }
    if ('funcao' in b) {
      if (!FUNCAO_KEYS.includes(b.funcao)) throw new HttpError(400, 'Função inválida.');
      p.funcao = b.funcao;
    }
    if ('experiente' in b) p.experiente = !!b.experiente;
    return db.rpc('pessoas_atualizar', p);
  },
  DELETE: async (req) => {
    await exigir(req, 'pessoas:editar');
    return db.rpc('pessoas_excluir', { id: validarId(req.query.id) });
  },
});
