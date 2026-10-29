// GET  /api/usuarios   lista quem tem acesso
// POST /api/usuarios   { email, senha, nome, papel }
import { rota, corpo, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { auth, db } from '../_lib/supabase.js';
import { PAPEIS } from '../../shared/permissoes.js';

export default rota({
  GET: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    return db.rpc('perfis_listar');
  },
  POST: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    const b = corpo(req);
    const email = String(b.email || '').trim().toLowerCase();
    const nome = String(b.nome || '').trim();
    const senha = String(b.senha || '');
    const papel = b.papel;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o nome.');
    if (senha.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
    if (!(papel in PAPEIS)) throw new HttpError(400, 'Perfil inválido.');
    const id = await auth.criarUsuario({ email, senha, nome, papel });
    await db.rpc('perfil_atualizar', { id, nome, papel });
    return db.rpc('perfis_listar');
  },
});
