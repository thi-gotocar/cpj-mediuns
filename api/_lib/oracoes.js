// Orações (aba Gira). Rotas em api/giras.
import { validarId, HttpError } from './http.js';
import { db } from './db.js';
import { autorDe } from './sessao.js';
import { pode } from '../../shared/permissoes.js';

export const ACOES_ORACOES = ['oracao', 'excluirOracao', 'reagirOracao'];

// Admin dos eventos exclui qualquer oração; os outros, só a que pediram.
export async function oracoes(eu, lista) {
  const L = lista || (await db.rpc('oracoes_listar'));
  const admin = pode(eu, 'eventos:editar');
  const meu = autorDe(eu);
  return L.map(({ autor, reacoes = [], ...o }) => ({ ...o, apagar: admin || autor === meu, reacoes: reacoes.length, reagi: reacoes.includes(meu) }));
}
export async function acaoOracao(eu, b) {
  if (b.acao === 'reagirOracao') return oracoes(eu, await db.rpc('oracao_reagir', { id: validarId(b.id, 'Oração'), autor: autorDe(eu) }));
  if (b.acao === 'excluirOracao') {
    return oracoes(eu, await db.rpc('oracao_excluir', { id: validarId(b.id, 'Oração'), autor: autorDe(eu), admin: pode(eu, 'eventos:editar') }));
  }
  const texto = String(b.texto ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  if (!texto) throw new HttpError(400, 'Escreva a oração.');
  if (texto.split('\n').length > 3 || texto.length > 200) throw new HttpError(400, 'A oração pode ter até 3 linhas (200 letras).');
  return oracoes(eu, await db.rpc('oracao_salvar', { texto, autor: autorDe(eu), autorNome: eu.nome || '' }));
}
