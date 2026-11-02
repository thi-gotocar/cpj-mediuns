// GET  /api/pessoas            lista a corrente
// POST /api/pessoas            { nomes: [..] | nome: "A, B; C", funcao }
//                              { acao: 'licenca', pessoaId, inicio, fim, motivo? } · { acao: 'editarLicenca', id, inicio, fim, motivo? }
//                              { acao: 'removerLicenca', id }  → lista da corrente
// GET  /api/pessoas?lista=alunos  { turmas, alunos }  (alunos da CPJ: fora da corrente)
// GET  /api/pessoas?lista=perfis  { total, chefe, frente, orixa, cabeca, cabecaPessoas }  (Histórico → Estatísticas: só contagens do Perfil)
// POST /api/pessoas            { acao: 'alunos', nome: "A, B", turmaId } · { acao: 'aluno', id, nome?, turmaId? }
//                              { acao: 'excluirAluno', id } · { acao: 'turma', nome }  → { turmas, alunos }
// GET  /api/pessoas?lista=curimba      { alunos, aulas, presencas }  (aba Curimba: controle à parte da corrente)
// GET  /api/pessoas?lista=minhaCurimba { aulas: [{ data, nome, status }] } | null  (aba Gira: as aulas de quem está logado)
// POST /api/pessoas            { acao: 'curimbaAluno', pessoaId? | nome } · { acao: 'curimbaExcluirAluno', id }
//                              { acao: 'curimbaAula', id?, data, nome? } · { acao: 'curimbaExcluirAula', id }
//                              { acao: 'curimbaPresenca', aulaId, alunoId, status: 'p'|'f'|'' }  → { alunos, aulas, presencas }
import { rota, corpo, HttpError, validarData, validarId } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { FUNCAO_KEYS } from '../../shared/regras.js';
import { contagemPerfis } from '../../shared/perfil.js';

const ACOES_ALUNOS = ['alunos', 'aluno', 'excluirAluno', 'turma'];
const ACOES_CURIMBA = ['curimbaAluno', 'curimbaExcluirAluno', 'curimbaAula', 'curimbaExcluirAula', 'curimbaPresenca'];
const limpar = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max + 1);
const turmaId = (v) => (v ? validarId(v, 'Turma') : '');

async function acaoAlunos(b) {
  if (b.acao === 'turma') {
    const nome = limpar(b.nome, 40);
    if (!nome || nome.length > 40) throw new HttpError(400, 'Informe o nome da turma (até 40 letras).');
    return db.rpc('turma_aluno_criar', { nome });
  }
  if (b.acao === 'excluirAluno') return db.rpc('aluno_excluir', { id: validarId(b.id, 'Aluno') });
  if (b.acao === 'aluno') {
    const p = { id: validarId(b.id, 'Aluno') };
    if ('nome' in b) {
      p.nome = limpar(b.nome, 80);
      if (!p.nome || p.nome.length > 80) throw new HttpError(400, 'Nome inválido.');
    }
    if ('turmaId' in b) p.turmaId = turmaId(b.turmaId);
    return db.rpc('aluno_atualizar', p);
  }
  const brutos = Array.isArray(b.nomes) ? b.nomes : String(b.nome || '').split(/[,;\n]+/);
  const nomes = brutos.map((s) => limpar(s, 80)).filter(Boolean);
  if (!nomes.length) throw new HttpError(400, 'Digite pelo menos um nome.');
  if (nomes.length > 200) throw new HttpError(400, 'Máximo de 200 nomes por vez.');
  if (nomes.some((n) => n.length > 80)) throw new HttpError(400, 'Nome muito longo (máximo 80 letras).');
  return db.rpc('alunos_criar', { nomes, turmaId: turmaId(b.turmaId) });
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
  GET: async (req) => {
    if (req.query.lista === 'alunos') {
      await exigir(req, 'alunos:ver');
      return db.rpc('alunos_estado');
    }
    if (req.query.lista === 'curimba') {
      await exigir(req, 'curimba:ver');
      return db.rpc('curimba_estado');
    }
    if (req.query.lista === 'minhaCurimba') {
      const eu = await exigir(req);
      return eu.pessoaId ? db.rpc('curimba_minha', { pessoaId: eu.pessoaId }) : null;
    }
    if (req.query.lista === 'perfis') {
      await exigir(req, 'historico:ver');
      return contagemPerfis(await db.rpc('perfis_listar'));
    }
    await exigir(req, 'pessoas:ler');
    return db.rpc('pessoas_listar');
  },
  POST: async (req) => {
    const b = corpo(req);
    if (ACOES_ALUNOS.includes(b.acao)) {
      await exigir(req, 'alunos:editar');
      return acaoAlunos(b);
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
    const { criadas } = await db.rpc('pessoas_criar', { nomes, funcao: b.funcao });
    return { criadas, pessoas: await db.rpc('pessoas_listar') };
  },
});
