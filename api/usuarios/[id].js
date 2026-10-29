// PATCH  /api/usuarios/:id   { nome?, papel?, senha? }
// DELETE /api/usuarios/:id
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { auth, db } from '../_lib/supabase.js';
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
    const senha = b.senha ? String(b.senha) : '';
    if (senha && senha.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
    const perfil = await db.rpc('perfil_atualizar', p);
    if (senha || p.papel) await auth.atualizarUsuario(id, { senha, papel: p.papel });
    return perfil;
  },
  DELETE: async (req) => {
    const eu = await exigir(req, 'usuarios:gerenciar');
    const id = validarId(req.query.id);
    if (id === eu.id) throw new HttpError(400, 'Você não pode excluir o seu próprio usuário.');
    const todos = await db.rpc('perfis_listar');
    const alvo = todos.find((u) => u.id === id);
    if (!alvo) throw new HttpError(404, 'Usuário não encontrado.');
    if (alvo.papel === 'admin' && todos.filter((u) => u.papel === 'admin').length <= 1) {
      throw new HttpError(400, 'Precisa existir pelo menos um admin.');
    }
    await auth.excluirUsuario(id);
    return { ok: true };
  },
});
