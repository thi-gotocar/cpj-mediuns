// PATCH  /api/usuarios/:id   { nome?, papel?, senha? }
// DELETE /api/usuarios/:id
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { PAPEIS } from '../../shared/permissoes.js';

export default rota({
  PATCH: async (req) => {
    const eu = await exigir(req, 'usuarios:gerenciar');
    const id = validarId(req.query.id);
    const b = corpo(req);
    const p = { id };
    if ('nome' in b) {
      const nome = String(b.nome || '').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Nome inválido.');
      p.nome = nome;
    }
    if ('papel' in b) {
      if (!(b.papel in PAPEIS)) throw new HttpError(400, 'Perfil inválido.');
      if (id === eu.id && b.papel !== 'admin') throw new HttpError(400, 'Você não pode tirar o seu próprio acesso de admin.');
      p.papel = b.papel;
    }
    if (b.senha) {
      const senha = String(b.senha);
      if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      p.senhaHash = await gerarHash(senha);
    }
    const { sessaoVersao, ...u } = await db.rpc('usuario_atualizar', p);
    return u;
  },
  DELETE: async (req) => {
    const eu = await exigir(req, 'usuarios:gerenciar');
    const id = validarId(req.query.id);
    if (id === eu.id) throw new HttpError(400, 'Você não pode excluir o seu próprio usuário.');
    return db.rpc('usuario_excluir', { id });
  },
});
