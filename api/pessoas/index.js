// GET  /api/pessoas            lista a corrente
// POST /api/pessoas            { nomes: [..] | nome: "A, B; C", funcao, entradaHoje? } (quem tinha saído e é cadastrado de novo volta)
//                              { acao: 'licenca', pessoaId, inicio, fim, motivo? } · { acao: 'editarLicenca', id, inicio, fim, motivo? }
//                              { acao: 'removerLicenca', id }  → lista da corrente
// GET  /api/pessoas?lista=alunos  { turmas, alunos, cadastros? }  (alunos da CPJ: fora da corrente; quem edita recebe também os cadastros pelo login: { novos, consulentes, oferenda, turmaConsulentes, turmaOferenda }; grupoOferenda: quem está no grupo Oferenda)
//      quem edita Alunos recebe também { dados: { id: { nomeCompleto, celular, email, temCpf, cpf (mascarado) } }, pendencias: { id: [cobranças vencidas] }, pendenciasEm }
// GET  /api/pessoas?lista=perfis  { total, chefe, frente, orixa, cabeca, cabecaPessoas }  (Histórico → Estatísticas e bloco do ano da aba Gira: só contagens do Perfil)
// POST /api/pessoas            { acao: 'alunos', nome: "A, B", turmaId, nomeCompleto?, cpf?, email?, celular? (dados só com um nome) }
//                              · { acao: 'aluno', id, nome?, turmaId?, nomeCompleto?, cpf? ('' apaga), email?, celular?, bloqueado? } · { acao: 'alunoCpf', id } → { cpf }
//                              { acao: 'promoverAlunoCPJ', id } (aluno → Corrente como Cambone)
//                              { acao: 'excluirAluno', id } · { acao: 'turma', id?, nome } (com id = renomear)
//                              · { acao: 'excluirTurma', id } (alunos passam para sem turma) → { turmas, alunos }
// GET  /api/pessoas?lista=curimba      { alunos, aulas, presencas }  (aba Curimba: controle à parte da corrente)
// GET  /api/pessoas?lista=minhaCurimba { aulas: [{ data, nome, status }] } | null  (aba Gira: as aulas de quem está logado)
// POST /api/pessoas            { acao: 'curimbaAluno', pessoaId? | nome } · { acao: 'curimbaExcluirAluno', id }
//                              { acao: 'curimbaAula', id?, data, nome? } · { acao: 'curimbaExcluirAula', id }
//                              { acao: 'curimbaPresenca', aulaId, alunoId, status: 'p'|'f'|'' }  → { alunos, aulas, presencas }
// GET  /api/pessoas?lista=amaci  aba Amaci: os orixás liberados para quem está logado (+ turmas, para quem administra)
// POST /api/pessoas            { acao: 'amaci', op: 'publicar', publicada } · { op: 'turma', turmaId, orixas: [..] }
//                              · { op: 'orientacao', orixa, texto }  (só quem administra a aba; veja api/_lib/amaci.js)
//                              · { op: 'presenca', eventoId, alunoId, status: 'p'|'f'|'' }  (só o admin root) → { presencaAdmin }
//                              { acao: 'amaciPresenca', eventoId, lat?, lon? }  o aluno confirma a própria presença → { presenca }
// GET  /api/pessoas?lista=diario  aba Diário: o diário de quem está logado · POST { acao: 'diario', op: 'salvar' | 'publicar' | 'foto…' }
//      /api/pessoas?lista=diarioFoto&id=  foto da Galeria do Diário (sem sessão)
//                              (veja api/_lib/diario.js)
import { rota, corpo, HttpError, validarData, validarId, hojeBR } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { FUNCAO_KEYS } from '../../shared/regras.js';
import { contagemPerfis, pessoasPorOrixaCabeca } from '../../shared/perfil.js';
import { pode } from '../../shared/permissoes.js';
import { amaci, acaoAmaci, presencaAluno } from '../_lib/amaci.js';
import { dadosAluno, temDados, salvarDadosAluno, comExtras, cpfDoAluno, promoverAluno } from '../_lib/alunos.js';
import { diario, acaoDiario, fotoGaleria } from '../_lib/diario.js';

const ACOES_ALUNOS = ['alunos', 'aluno', 'alunoCpf', 'excluirAluno', 'reativarAluno', 'apagarAluno', 'turma', 'excluirTurma', 'promoverAlunoCPJ'];
const ACOES_CURIMBA = ['curimbaAluno', 'curimbaExcluirAluno', 'curimbaAula', 'curimbaExcluirAula', 'curimbaPresenca'];
const limpar = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max + 1);
const turmaId = (v) => (v ? validarId(v, 'Turma') : '');

async function acaoAlunos(b, eu) {
  if (b.acao === 'alunoCpf') return cpfDoAluno(b);
  if (b.acao === 'promoverAlunoCPJ') return promoverAluno(validarId(b.id, 'Aluno'));
  if (b.acao === 'excluirTurma') return db.rpc('turma_aluno_excluir', { id: validarId(b.id, 'Turma') });
  if (b.acao === 'turma') {
    const nome = limpar(b.nome, 40);
    if (!nome || nome.length > 40) throw new HttpError(400, 'Informe o nome da turma (até 40 letras).');
    if (b.id) return db.rpc('turma_aluno_renomear', { id: validarId(b.id, 'Turma'), nome });
    return db.rpc('turma_aluno_criar', { nome });
  }
  // Excluir leva para Ex-alunos (cadastro guardado); de lá, volta ou é apagado de vez (dados e CPF somem na hora).
  if (b.acao === 'excluirAluno') return db.rpc('aluno_excluir', { id: validarId(b.id, 'Aluno') });
  if (b.acao === 'reativarAluno') return db.rpc('aluno_reativar', { id: validarId(b.id, 'Ex-aluno') });
  if (b.acao === 'apagarAluno') return db.rpc('aluno_apagar', { id: validarId(b.id, 'Ex-aluno') });
  if (b.acao === 'aluno') {
    const p = { id: validarId(b.id, 'Aluno') };
    if ('nome' in b) {
      p.nome = limpar(b.nome, 80);
      if (!p.nome || p.nome.length > 80) throw new HttpError(400, 'Nome inválido.');
    }
    if ('turmaId' in b) p.turmaId = turmaId(b.turmaId);
    const d = dadosAluno(b);   // CPF, nome completo, e-mail e celular (o que vier)
    if ('bloqueado' in b && typeof b.bloqueado !== 'boolean') throw new HttpError(400, 'Informe se o acesso fica bloqueado.');
    let estado = null;
    if ('nome' in p || 'turmaId' in p) estado = await db.rpc('aluno_atualizar', p);
    if (temDados(d)) await salvarDadosAluno(p.id, d, eu);
    if ('bloqueado' in b) estado = await db.rpc('aluno_bloquear', { id: p.id, bloqueado: b.bloqueado });   // o login e a sessão do aluno recusam
    return estado && !temDados(d) ? estado : db.rpc('alunos_estado');
  }
  const brutos = Array.isArray(b.nomes) ? b.nomes : String(b.nome || '').split(/[,;\n]+/);
  const nomes = brutos.map((s) => limpar(s, 80)).filter(Boolean);
  if (!nomes.length) throw new HttpError(400, 'Digite pelo menos um nome.');
  if (nomes.length > 200) throw new HttpError(400, 'Máximo de 200 nomes por vez.');
  if (nomes.some((n) => n.length > 80)) throw new HttpError(400, 'Nome muito longo (máximo 80 letras).');
  // Dados (CPF, nome completo, e-mail, celular) só quando é um aluno de cada vez.
  const d = dadosAluno(b);
  if (temDados(d) && nomes.length > 1) throw new HttpError(400, 'Para cadastrar vários de uma vez, deixe os dados em branco e preencha depois em Editar.');
  const estado = await db.rpc('alunos_criar', { nomes, turmaId: turmaId(b.turmaId) });
  if (!temDados(d)) return estado;
  const novo = estado.alunos.find((a) => a.nome.toLocaleLowerCase('pt-BR') === nomes[0].toLocaleLowerCase('pt-BR'));
  if (novo) await salvarDadosAluno(novo.id, d, eu);
  return { ...(await db.rpc('alunos_estado')), criadas: estado.criadas };
}

function acaoCurimba(b) {
  if (b.acao === 'curimbaAluno') {
    if (b.pessoaId) return db.rpc('curimba_aluno_criar', { pessoaId: validarId(b.pessoaId, 'Pessoa') });
    const nome = limpar(b.nome, 80);
    if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o nome do aluno (até 80 letras).');
    return db.rpc('curimba_aluno_criar', { nome });
  }
  if (b.acao === 'curimbaExcluirAluno') return db.rpc('curimba_aluno_excluir', { id: validarId(b.id, 'Aluno') });
  if (b.acao === 'curimbaExcluirAula') return db.rpc('curimba_aula_excluir', { id: validarId(b.id, 'Aula') });
  if (b.acao === 'curimbaAula') {
    const nome = limpar(b.nome, 120);
    if (nome.length > 120) throw new HttpError(400, 'Nome da aula muito longo (até 120 letras).');
    return db.rpc('curimba_aula_salvar', { id: b.id ? validarId(b.id, 'Aula') : '', data: validarData(String(b.data || '')), nome });
  }
  if (!['p', 'f', ''].includes(b.status ?? '')) throw new HttpError(400, 'Escolha presença ou falta.');
  return db.rpc('curimba_presenca', { aulaId: validarId(b.aulaId, 'Aula'), alunoId: validarId(b.alunoId, 'Aluno'), status: b.status || '' });
}

export default rota({
  GET: async (req, res) => {
    if (req.query.lista === 'diarioFoto') return fotoGaleria(req, res);
    if (req.query.lista === 'alunos') {
      const eu = await exigir(req, 'alunos:ver');
      // Quem edita os alunos recebe também os cadastros pelo login (novos e consulentes).
      const editor = !eu.grupo && pode(eu, 'alunos:editar');
      const [estado, extras, cadastros] = await Promise.all([db.rpc('alunos_estado'), editor ? db.rpc('alunos_extras') : null, editor ? db.rpc('cadastros_login') : null]);
      // O aluno vê só o próprio registro (sem a lista do grupo Oferenda).
      if (eu.grupo === 'alunos') return { turmas: estado.turmas, alunos: estado.alunos.filter((a) => a.id === eu.alunoId) };
      return { ...(await comExtras(estado, eu, extras)), ...(cadastros ? { cadastros } : {}) };
    }
    if (req.query.lista === 'amaci') return amaci(await exigir(req, 'amaci:ver'));
    if (req.query.lista === 'diario') return diario(await exigir(req));
    if (req.query.lista === 'curimba') {
      await exigir(req, 'curimba:ver');
      return db.rpc('curimba_estado');
    }
    if (req.query.lista === 'minhaCurimba') {
      const eu = await exigir(req);
      if (eu.grupo === 'alunos') return db.rpc('curimba_minha', { aluno: eu.alunoId });
      return eu.pessoaId ? db.rpc('curimba_minha', { pessoaId: eu.pessoaId }) : null;
    }
    if (req.query.lista === 'perfis') {
      // Só contagens: quem vê o Histórico ou a aba Gira (bloco do ano).
      const eu = await exigir(req);
      if (!pode(eu, 'historico:ver') && !pode(eu, 'giras:ler')) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
      const todos = await db.rpc('perfis_listar');
      // Só quem administra o Perfil (já vê o orixá de cada um) recebe também os nomes por orixá de cabeça.
      return { ...contagemPerfis(todos), ...(pode(eu, 'perfil:corrente') ? { cabecaNomes: pessoasPorOrixaCabeca(todos) } : {}) };
    }
    await exigir(req, 'pessoas:ler');
    return db.rpc('pessoas_listar', { todas: true });
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'amaci') return acaoAmaci(await exigir(req, 'amaci:editar'), b);
    if (b.acao === 'amaciPresenca') return presencaAluno(await exigir(req, 'amaci:ver'), b);
    if (b.acao === 'diario') return acaoDiario(await exigir(req), b);
    if (ACOES_ALUNOS.includes(b.acao)) {
      const eu = await exigir(req, 'alunos:editar');
      if (b.acao === 'promoverAlunoCPJ') await exigir(req, 'pessoas:editar');
      const r = await acaoAlunos(b, eu);
      return b.acao === 'alunoCpf' ? r : comExtras(r, eu);
    }
    if (ACOES_CURIMBA.includes(b.acao)) {
      await exigir(req, 'curimba:editar');
      return acaoCurimba(b);
    }
    await exigir(req, 'pessoas:editar');
    if (b.acao === 'licenca' || b.acao === 'editarLicenca') {
      const inicio = validarData(String(b.inicio || ''));
      const fim = validarData(String(b.fim || ''));
      if (fim < inicio) throw new HttpError(400, 'A data final da licença é antes do início.');
      const motivo = String(b.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (b.acao === 'editarLicenca') return db.rpc('licenca_atualizar', { id: validarId(b.id, 'Licença'), inicio, fim, ...('motivo' in b ? { motivo } : {}) });
      return db.rpc('licenca_salvar', { pessoaId: validarId(b.pessoaId, 'Pessoa'), inicio, fim, motivo });
    }
    if (b.acao === 'removerLicenca') return db.rpc('licenca_excluir', { id: validarId(b.id, 'Licença') });
    if (!FUNCAO_KEYS.includes(b.funcao)) throw new HttpError(400, 'Função inválida.');
    const brutos = Array.isArray(b.nomes) ? b.nomes : String(b.nome || '').split(/[,;\n]+/);
    const nomes = brutos.map((s) => String(s).trim()).filter(Boolean);
    if (!nomes.length) throw new HttpError(400, 'Digite pelo menos um nome.');
    if (nomes.length > 200) throw new HttpError(400, 'Máximo de 200 nomes por vez.');
    if (nomes.some((n) => n.length > 80)) throw new HttpError(400, 'Nome muito longo (máximo 80 letras).');
    // Pela tela, quem é cadastrado hoje só conta nas giras de hoje em diante.
    const { criadas } = await db.rpc('pessoas_criar', { nomes, funcao: b.funcao, reativar: true, ...(b.entradaHoje === true ? { entrada: hojeBR() } : {}) });
    return { criadas, pessoas: await db.rpc('pessoas_listar', { todas: true }) };
  },
});
