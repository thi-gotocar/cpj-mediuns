// PATCH  /api/usuarios/:id   { pessoaId?, papel?, senha?, nome? (só root sem cadastro) }
// DELETE /api/usuarios/:id
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { SEM_CADASTRO } from '../../shared/permissoes.js';
import { papelValido } from '../_lib/perfis.js';

export default rota({
  PATCH: async (req) => {
    const eu = await exigir(req, 'usuarios:gerenciar');
    const id = validarId(req.query.id);
    const b = corpo(req);
    const p = { id };
    const atual = (await db.rpc('usuarios_listar')).find((u) => u.id === id);
    if (!atual) throw new HttpError(404, 'Usuário não encontrado.');
    const papel = 'papel' in b ? b.papel : atual.papel;
    if ('papel' in b) {
      if (!(await papelValido(b.papel))) throw new HttpError(400, 'Perfil inválido.');
      if (id === eu.id && !['admin', 'root'].includes(b.papel)) throw new HttpError(400, 'Você não pode tirar o seu próprio acesso de admin.');
      p.papel = b.papel;
    }
    if ('pessoaId' in b) {
      if (b.pessoaId) {
        const pessoa = (await db.rpc('pessoas_listar')).find((x) => x.id === validarId(b.pessoaId, 'Pessoa'));
        if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
        p.pessoaId = pessoa.id;
        p.nome = pessoa.nome;
      } else {
        if (!SEM_CADASTRO.includes(papel)) throw new HttpError(400, 'Só o admin root pode ficar sem cadastro na corrente.');
        p.pessoaId = '';
      }
    }
    const pessoaFinal = 'pessoaId' in p ? p.pessoaId : atual.pessoaId;
    if (!SEM_CADASTRO.includes(papel) && !pessoaFinal) throw new HttpError(400, 'Antes, ligue o usuário a uma pessoa da corrente (o nome vem do cadastro).');
    if ('nome' in b) {
      // O nome vem do cadastro de pessoas; só o root sem cadastro tem nome próprio.
      if (pessoaFinal) throw new HttpError(400, 'O nome vem do cadastro de pessoas. Para mudar, edite o nome na aba Pessoas.');
      const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Nome inválido.');
      p.nome = nome;
    }
    if (b.senha) {
      const senha = String(b.senha);
      if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
      p.senhaHash = await gerarHash(senha);
    }
    const { sessaoVersao, abas, ...u } = await db.rpc('usuario_atualizar', p);
    // O que a pessoa preencheu com a conta passa para o cadastro dela.
    if (p.pessoaId) await db.rpc('corrente_vincular', { chave: 'p:' + p.pessoaId, nome: u.nome, antigas: ['u:' + id] });
    return u;
  },
  DELETE: async (req) => {
    const eu = await exigir(req, 'usuarios:gerenciar');
    const id = validarId(req.query.id);
    if (id === eu.id) throw new HttpError(400, 'Você não pode excluir o seu próprio usuário.');
    return db.rpc('usuario_excluir', { id });
  },
});
