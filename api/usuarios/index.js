// GET  /api/usuarios               lista quem tem acesso
// GET  /api/usuarios?lista=perfis   perfis e o que cada um vê/edita por aba
// GET  /api/usuarios?lista=senhas   pessoas da corrente e se têm senha (PIN)
// POST /api/usuarios   { email, senha, papel, pessoaId }  (root: { nome } no lugar de pessoaId)
//                      { acao: 'perfil', chave?, nome, abas }  cria ou edita um perfil → perfis
//                      { acao: 'excluirPerfil', chave }        → perfis
//                      { acao: 'pin', pessoaId, senha }        troca a senha (PIN) de uma pessoa → senhas
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { papelValido } from '../_lib/perfis.js';
import { SEM_CADASTRO, PERFIS_SISTEMA, PIN_VALIDO, normalizarAbas } from '../../shared/permissoes.js';

const semVersao = (lista) => lista.map(({ sessaoVersao, abas, ...u }) => u);

async function acaoPerfil(b) {
  if (b.acao === 'excluirPerfil') {
    if (PERFIS_SISTEMA.includes(b.chave)) throw new HttpError(400, 'Esse perfil já vem com o app e não pode ser excluído.');
    return db.rpc('perfil_config_excluir', { chave: String(b.chave || '') });
  }
  const p = {};
  if (b.chave) {
    if (b.chave === 'root') throw new HttpError(400, 'O Admin root sempre pode tudo.');
    p.chave = String(b.chave);
  }
  if ('nome' in b || !b.chave) {
    const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 40) throw new HttpError(400, 'Informe o nome do perfil (até 40 letras).');
    if (b.chave === 'corrente') throw new HttpError(400, 'O nome do acesso da corrente não muda.');
    p.nome = nome;
  }
  if ('abas' in b || !b.chave) p.abas = normalizarAbas(b.abas);
  return db.rpc('perfil_config_salvar', p);
}

export default rota({
  GET: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    if (req.query.lista === 'perfis') return db.rpc('perfis_config');
    if (req.query.lista === 'senhas') return db.rpc('senhas_listar');
    return semVersao(await db.rpc('usuarios_listar'));
  },
  POST: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    const b = corpo(req);
    if (b.acao === 'perfil' || b.acao === 'excluirPerfil') return acaoPerfil(b);
    if (b.acao === 'pin') {
      const senha = String(b.senha ?? '');
      if (!PIN_VALIDO.test(senha)) throw new HttpError(400, 'A senha precisa ter de 4 a 8 números.');
      await db.rpc('pin_definir', { pessoaId: validarId(b.pessoaId, 'Pessoa'), pinHash: await gerarHash(senha) });
      return db.rpc('senhas_listar');
    }
    const email = String(b.email || '').trim().toLowerCase();
    const senha = String(b.senha || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (!(await papelValido(b.papel))) throw new HttpError(400, 'Perfil inválido.');
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
