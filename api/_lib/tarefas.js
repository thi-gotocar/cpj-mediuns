// Tarefas da corrente (aba Gira): a lista fixa (blocos e tarefas, com o responsável) e o feito de cada gira.
// Todos da corrente veem; quem edita a Gira cadastra, ordena e marca qualquer uma; o responsável marca a própria.
import { db } from './db.js';
import { HttpError, validarData, validarId } from './http.js';
import { pode } from '../../shared/permissoes.js';

export const ACOES_TAREFAS = ['marcar', 'grupo', 'grupoExcluir', 'grupoMover', 'tarefa', 'tarefaExcluir', 'mover'];

const texto = (s, max, oque) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > max) throw new HttpError(400, `Informe ${oque} (até ${max} letras).`);
  return t;
};

// GET ?lista=tarefas&data=AAAA-MM-DD
export function tarefas(query) {
  return db.rpc('tarefas_listar', { data: validarData(String(query.data || '')) });
}

// POST { acao: 'tarefas', op, data, ... }
export function acaoTarefas(eu, b) {
  const op = String(b.op || '');
  if (!ACOES_TAREFAS.includes(op)) throw new HttpError(400, 'Ação inválida.');
  const data = validarData(String(b.data || ''));
  const admin = pode(eu, 'giras:editar');
  if (op === 'marcar') {
    if (typeof b.feito !== 'boolean') throw new HttpError(400, 'Informe se a tarefa foi feita.');
    if (!admin && !eu.pessoaId) throw new HttpError(403, 'Só quem é da corrente marca as tarefas.');
    return db.rpc('tarefas_acao', { op, data, id: validarId(b.id, 'Tarefa'), feito: b.feito, por: eu.nome || '', pessoaId: eu.pessoaId || '', admin });
  }
  if (!admin) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  const p = { op, data };
  if (op === 'grupo') Object.assign(p, { id: b.id ? validarId(b.id, 'Bloco') : '', nome: texto(b.nome, 40, 'o nome do bloco') });
  if (op === 'grupoExcluir' || op === 'tarefaExcluir') p.id = validarId(b.id, op === 'grupoExcluir' ? 'Bloco' : 'Tarefa');
  if (op === 'grupoMover' || op === 'mover') {
    if (b.delta !== 1 && b.delta !== -1) throw new HttpError(400, 'Direção inválida.');
    Object.assign(p, { id: validarId(b.id, op === 'grupoMover' ? 'Bloco' : 'Tarefa'), delta: b.delta });
  }
  if (op === 'tarefa') {
    Object.assign(p, {
      id: b.id ? validarId(b.id, 'Tarefa') : '',
      grupoId: validarId(b.grupoId, 'Bloco'),
      descricao: texto(b.descricao, 80, 'a descrição'),
      responsavelId: b.responsavelId ? validarId(b.responsavelId, 'Responsável') : '',
    });
  }
  return db.rpc('tarefas_acao', p);
}
