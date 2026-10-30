// GET  /api/usuarios   lista quem tem acesso
// POST /api/usuarios   { email, senha, papel, pessoaId }  (root: { nome } no lugar de pessoaId)
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { PAPEIS, SEM_CADASTRO } from '../../shared/permissoes.js';

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
    const senha = String(b.senha || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (!(b.papel in PAPEIS)) throw new HttpError(400, 'Perfil inválido.');
    let nome, pessoaId = null;
    if (SEM_CADASTRO.includes(b.papel) && !b.pessoaId) {
      nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o nome.');
    } else {
      // O usuário é uma pessoa da corrente: o nome é sempre o do cadastro.
      if (!b.pessoaId) throw new HttpError(400, 'Escolha a pessoa da corrente.');
      const pessoa = (await db.rpc('pessoas_listar')).find((p) => p.id === validarId(b.pessoaId, 'Pessoa'));
      if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
      nome = pessoa.nome;
      pessoaId = pessoa.id;
    }
    await db.rpc('usuario_criar', { email, nome, papel: b.papel, pessoaId, senhaHash: await gerarHash(senha) });
    return semVersao(await db.rpc('usuarios_listar'));
  },
});
