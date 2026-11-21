// Identifica quem está chamando e confere a permissão.
// As permissões saem das abas do perfil (tabela perfis), que o admin root edita.

import { HttpError, validarId } from './http.js';
import { db } from './db.js';
import { lerToken } from './senhas.js';
import { permissoesDe, permissoesConsulente, PERMISSOES_GRUPO, PERMISSOES_OFERENDA } from '../../shared/permissoes.js';

// Aluno no grupo escondido Consulentes (perfil Consulentes, escolhido pelo root) ou Oferenda (Geral e Oferendas, sem doar).
const papelAluno = (aluno) => (aluno.consulente ? ['Consulente', permissoesConsulente(aluno.abasConsulente)]
  : aluno.grupoOferenda ? ['Oferenda', PERMISSOES_OFERENDA] : ['Aluno', PERMISSOES_GRUPO.alunos || []]);

async function lerSessao(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Faça login.');

  const sessao = await lerToken(token);
  if (!sessao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');

  // A palavra-passe curimba acabou (v131): quem era de fora virou aluno e entra de novo pelo cadastro.
  if (sessao.grupo === 'curimba') throw new HttpError(401, 'Sessão expirada. Entre de novo com o seu e-mail, celular ou CPF.');
  return sessao;
}

// A consulta do banco que confere a sessão (aluno, corrente ou usuário).
function chamadaDaSessao(sessao) {
  if (sessao.grupo) return { funcao: 'aluno_acesso', p: { id: sessao.registroId } };
  if (sessao.corrente) {
    // Sessões antigas (antes de ligar o acesso à pessoa cadastrada) precisam entrar de novo.
    if (!sessao.pessoaId) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    return { funcao: 'corrente_sessao', p: { pessoaId: sessao.pessoaId } };
  }
  return { funcao: 'usuario_obter', p: { id: sessao.id } };
}

export async function exigir(req, permissao) {
  const sessao = await lerSessao(req);
  const { funcao, p } = chamadaDaSessao(sessao);
  return montarQuem(req, sessao, await db.rpc(funcao, p), permissao);
}

// Sessão e leituras da rota numa ida só ao banco (em vez de uma ida para a sessão e outra para os dados).
// montar({ pessoaId, usuarioId, alunoId }) devolve as chamadas [{ funcao, p }]: só funções que leem (a ida é read only),
// porque rodam antes de a permissão ser conferida; se a sessão ou a permissão falhar, os dados são descartados.
// "Ver como" do root: a pessoa só se conhece depois da sessão, então vão duas idas, como antes.
// → [quem, ...resultados]
export async function exigirComLeitura(req, permissao, montar, opcoes) {
  const sessao = await lerSessao(req);
  const sessaoCall = chamadaDaSessao(sessao);
  if (String(req.headers['x-ver-como'] || '').trim() && !sessao.grupo && !sessao.corrente) {
    const quem = await exigir(req, permissao);
    const chamadas = montar({ pessoaId: quem.pessoaId || null, usuarioId: quem.id || null, alunoId: quem.alunoId || null });
    return [quem, ...(chamadas.length ? await db.lote(chamadas, opcoes) : [])];
  }
  const provavel = { pessoaId: sessao.pessoaId || null, usuarioId: sessao.id || null, alunoId: sessao.grupo ? sessao.registroId : null };
  const [resultado, ...dados] = await db.lote([sessaoCall, ...montar(provavel)], opcoes);
  return [await montarQuem(req, sessao, resultado, permissao), ...dados];
}

async function montarQuem(req, sessao, registro, permissao) {
  if (sessao.grupo) {
    const aluno = registro;
    if (!aluno) throw new HttpError(401, 'Cadastro não encontrado. Entre de novo.');
    if (sessao.grupo === 'alunos' && aluno.pinVersao !== sessao.versao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    // Acesso bloqueado na aba Pessoas: a sessão aberta cai.
    if (sessao.grupo === 'alunos' && aluno.bloqueado) throw new HttpError(401, 'Seu acesso ao app está bloqueado. Fale com a administração.');
    const consulente = sessao.grupo === 'alunos' && !!aluno.consulente;
    const grupoOferenda = sessao.grupo === 'alunos' && !!aluno.grupoOferenda;
    const [papelNome, permissoes] = sessao.grupo === 'alunos' ? papelAluno(aluno) : ['Curimba', PERMISSOES_GRUPO[sessao.grupo] || []];
    const quem = {
      id: null, nome: aluno.nome, email: '', papel: sessao.grupo, papelNome,
      consulente, grupoOferenda,
      grupo: sessao.grupo, alunoId: sessao.grupo === 'alunos' ? aluno.id : null,
      turmaId: sessao.grupo === 'alunos' ? aluno.turmaId || null : null,
      curimbaAlunoId: sessao.grupo === 'curimba' ? aluno.id : null,
      pessoaId: sessao.grupo === 'curimba' ? aluno.pessoaId || null : null,
      temSenha: !!aluno.temSenha,
      permissoes,
    };
    if (permissao && !permissoes.includes(permissao)) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
    return quem;
  }

  if (sessao.corrente) {
    const s = registro;
    // Pessoa excluída, ou a senha foi criada/trocada depois desta sessão.
    if (!s || s.pinVersao !== sessao.versao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    const quem = { id: null, nome: s.nome, email: '', papel: 'corrente', papelNome: s.papelNome, pessoaId: sessao.pessoaId,
      temSenha: s.temSenha, permissoes: permissoesDe('corrente', s.abas) };
    if (permissao && !quem.permissoes.includes(permissao)) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
    return quem;
  }

  const usuario = registro;
  // Trocar a senha ou o perfil muda a versão e encerra as sessões antigas.
  if (!usuario || usuario.sessaoVersao !== sessao.versao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
  usuario.permissoes = permissoesDe(usuario.papel, usuario.abas);
  // Root vendo o app como outra pessoa (cabeçalho X-Ver-Como: p:<pessoa> ou a:<aluno>).
  const alvo = String(req.headers['x-ver-como'] || '').trim();
  if (alvo && usuario.permissoes.includes('usuarios:gerenciar')) return verComo(req, alvo, permissao);
  if (permissao && !usuario.permissoes.includes(permissao)) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  return usuario;
}

// Root vê o app como uma pessoa da corrente (CPJ ou curimba) ou um aluno, com os dados reais dela, só para olhar:
// qualquer gravação é recusada. As permissões são as da pessoa.
async function verComo(req, alvo, permissao) {
  if (req.method !== 'GET') throw new HttpError(403, 'Vendo como outra pessoa: só para olhar. Volte para a visão Root para alterar.');
  const [tipo, id] = [alvo.slice(0, 2), alvo.slice(2)];
  let quem;
  if (tipo === 'p:') {
    const s = await db.rpc('corrente_sessao', { pessoaId: validarId(id, 'Pessoa') });
    if (!s) throw new HttpError(404, 'Pessoa não encontrada no cadastro.');
    quem = { id: null, nome: s.nome, email: '', papel: 'corrente', papelNome: s.papelNome, pessoaId: id,
      temSenha: s.temSenha, permissoes: permissoesDe('corrente', s.abas) };
  } else if (tipo === 'a:') {
    const aluno = await db.rpc('aluno_acesso', { id: validarId(id, 'Aluno') });
    if (!aluno) throw new HttpError(404, 'Aluno não encontrado no cadastro.');
    const [papelNome, permissoes] = papelAluno(aluno);
    quem = { id: null, nome: aluno.nome, email: '', papel: 'alunos', papelNome, consulente: !!aluno.consulente, grupoOferenda: !!aluno.grupoOferenda,
      grupo: 'alunos', alunoId: aluno.id, turmaId: aluno.turmaId || null, curimbaAlunoId: null, pessoaId: null, temSenha: !!aluno.temSenha,
      permissoes };
  } else {
    throw new HttpError(400, 'Visão inválida.');
  }
  quem.verComo = true;
  if (permissao && !quem.permissoes.includes(permissao)) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
  return quem;
}

// Dono de uma oração ou foto: a pessoa da corrente (a mesma pelo acesso da corrente ou pelo e-mail) ou o usuário sem cadastro.
// Aluno (acesso dos alunos): 'a:<aluno>'.
export const autorDe = (eu) => (eu.alunoId ? 'a:' + eu.alunoId : eu.pessoaId ? 'p:' + eu.pessoaId : 'u:' + eu.id);
