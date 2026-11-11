// Gestão de Conduta e Risco (aba Geral). Rotas em api/giras.
// Só o admin root lê todos os relatos (com o nome de quem abriu); os outros veem só os próprios
// e a resposta só depois de publicada (o rascunho do root nunca sai do servidor para eles).
// Relato sem identificação (anonimo: true): grava sem autor e sem nome — ninguém, nem o root, sabe quem mandou;
// por isso ele não aparece na lista de quem enviou, não é editado e não tem resposta para alguém ler.
// Interruptor "Visível para todos" (começa desligado): desligado, só o root vê o bloco; os outros não leem nem abrem relato.
import { validarId, HttpError } from './http.js';
import { db } from './db.js';
import { autorDe } from './sessao.js';
import { pode } from '../../shared/permissoes.js';

export const ACOES_CONDUTA = ['conduta', 'condutaLer', 'condutaResponder', 'condutaAtivar'];
const ehRoot = (eu) => pode(eu, 'usuarios:gerenciar');

// Até 10 linhas e 1500 letras; tira os espaços das pontas de cada linha.
function validarTexto(v, oque) {
  const s = String(v ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();
  if (s.split('\n').length > 10 || s.length > 1500) throw new HttpError(400, `${oque} pode ter até 10 linhas (1500 letras).`);
  return s;
}

// → { ativa, relatos }
export async function condutas(eu, lista, ativa) {
  const on = ativa ?? (await db.rpc('conduta_ativa'));
  if (!ehRoot(eu) && !on) return { ativa: false, relatos: [] };
  const L = lista || (await db.rpc('condutas_listar'));
  if (ehRoot(eu)) return { ativa: on, relatos: L.map(({ autor, ...c }) => (autor ? c : { ...c, autorNome: '', anonimo: true })) };
  const meu = autorDe(eu);
  return {
    ativa: true,
    relatos: L.filter((c) => c.autor === meu).map(({ id, texto, criadoEm, editadoEm, lidoEm, resposta, publicadaEm }) => (
      { id, texto, criadoEm, editadoEm, lidoEm, ...(publicadaEm ? { resposta, publicadaEm } : {}) })),
  };
}

export async function acaoConduta(eu, b) {
  if (b.acao === 'conduta') {
    if (!ehRoot(eu) && !(await db.rpc('conduta_ativa'))) throw new HttpError(403, 'O bloco Gestão de Conduta e Risco ainda não foi ativado.');
    const texto = validarTexto(b.texto, 'O relato');
    if (!texto) throw new HttpError(400, 'Escreva o relato.');
    if (b.anonimo === true) {
      if (b.id) throw new HttpError(400, 'Relato sem identificação não pode ser editado.');
      return condutas(eu, await db.rpc('conduta_salvar', { id: '', texto, autor: '', autorNome: '' }));
    }
    const id = b.id ? validarId(b.id, 'Relato') : '';
    return condutas(eu, await db.rpc('conduta_salvar', { id, texto, autor: autorDe(eu), autorNome: eu.nome || '' }));
  }
  if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root lê e responde os relatos.');
  if (b.acao === 'condutaAtivar') {
    if (typeof b.ativa !== 'boolean') throw new HttpError(400, 'Informe se o bloco fica visível para todos.');
    return condutas(eu, null, await db.rpc('conduta_ativar', { ativa: b.ativa }));
  }
  const id = validarId(b.id, 'Relato');
  if (b.acao === 'condutaLer') return condutas(eu, await db.rpc('conduta_ler', { id }));
  const resposta = validarTexto(b.resposta, 'A resposta');
  const publicar = b.publicar === true;
  if (publicar && !resposta) throw new HttpError(400, 'Escreva a resposta antes de publicar.');
  return condutas(eu, await db.rpc('conduta_responder', { id, resposta, publicar }));
}
