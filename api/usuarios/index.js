// GET  /api/usuarios   lista quem tem acesso
// POST /api/usuarios   { email, senha, nome, papel }
import { rota, corpo, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { PAPEIS } from '../../shared/permissoes.js';

const semVersao = (lista) => lista.map(({ sessaoVersao, ...u }) => u);

export default rota({
  GET: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    return semVersao(await db.rpc('usuarios_listar'));
  },
  POST: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    const b = corpo(req);
    const email = String(b.email || '').trim().toLowerCase();
    const nome = String(b.nome || '').trim();
    const senha = String(b.senha || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o nome.');
    if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (!(b.papel in PAPEIS)) throw new HttpError(400, 'Perfil inválido.');
    await db.rpc('usuario_criar', { email, nome, papel: b.papel, senhaHash: await gerarHash(senha) });
    return semVersao(await db.rpc('usuarios_listar'));
  },
});
