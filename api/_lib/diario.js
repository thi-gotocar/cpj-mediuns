// Aba Diário: o registro pessoal de cada dia (regras e campos em shared/diario.js). Cada pessoa lê e grava só o
// próprio diário, pela chave da sessão; nem o root lê o dos outros (no "Ver como", a aba não abre). Só o root vê a aba
// até ligar "Visível para todos". Acesso da curimba (login do grupo, sem pessoa) não tem diário.
//
//   GET  /api/pessoas?lista=diario  → { publicada, orientador, root, dias: [{ data, dados }] }
//   POST /api/pessoas { acao: 'diario', op: 'salvar', data, dados }  → { data, dados }  (dados limpos; {} apaga o dia)
//                     { acao: 'diario', op: 'publicar', publicada }    (só o root) → o mesmo do GET
//                     { acao: 'diario', op: 'orientador', visivel }    (só o root) → o mesmo do GET
// orientador: o Orientador (sugestão de banho no card Banho) aparece para todos; desligado, só o root vê.
//
// Galeria de fotos (bloco da corrente): só a corrente, os alunos (sem os consulentes) e o root. Uma foto por pessoa;
// a própria pessoa apaga a sua e o root apaga qualquer uma. As fotos da semana somem toda terça (db: diario_fotos_limpar).
//   GET  ?lista=diario traz também galeria: [{ id, nome, descricao, criadoEm, v, curtidas, curti, minha }] (quem vê)
//   GET  /api/pessoas?lista=diarioFoto&id=<foto>&v=<versão>  → a foto (JPEG, sem sessão: o id é sorteado)
//   POST { acao: 'diario', op: 'fotoEnviar', foto (base64 JPEG), descricao } · { op: 'fotoExcluir', id } · { op: 'fotoCurtir', id }
//        → { galeria }
import { HttpError, validarData, validarId, hojeBR } from './http.js';
import { db } from './db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { normalizarDia } from '../../shared/diario.js';

const ehRoot = (eu) => pode(eu, 'usuarios:gerenciar');
// Galeria: corrente (acesso ligado a uma pessoa) e alunos; ex-alunos já não entram no app; consulentes e o grupo Oferenda ficam de fora.
export const veGaleria = (eu) => ehRoot(eu) || (eu.grupo === 'alunos' ? !eu.consulente && !eu.grupoOferenda : !eu.grupo && !!eu.pessoaId);
export const GALERIA_FOTO_MAX = 900 * 1024;
export const GALERIA_DESCRICAO_MAX = 200;

async function exigirDiario(eu) {
  if (eu.grupo && eu.grupo !== 'alunos') throw new HttpError(403, 'Este acesso não tem diário.');
  if (eu.verComo) throw new HttpError(403, 'O Diário é pessoal: não abre no "Ver como".');
  const publicada = !!(await db.rpc('diario_publicada'));
  if (!publicada && !ehRoot(eu)) throw new HttpError(403, 'A aba Diário não está disponível no momento.');
  return publicada;
}

export async function diario(eu) {
  const galeria = veGaleria(eu);
  const [publicada, orientador, dias, fotos] = await Promise.all([exigirDiario(eu), db.rpc('diario_orientador'),
    db.rpc('diario_listar', { chave: chavePessoa(eu) }), galeria ? db.rpc('diario_fotos', { chave: chavePessoa(eu) }) : null]);
  return { publicada, orientador: orientador !== false, root: ehRoot(eu), dias, ...(galeria ? { galeria: fotos } : {}) };
}

export async function fotoGaleria(req, res) {
  const b64 = await db.rpc('diario_foto', { id: validarId(req.query.id, 'Foto') });
  if (!b64) throw new HttpError(404, 'Foto não encontrada.');
  const buf = Buffer.from(b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', req.query.v ? 'private, max-age=604800, immutable' : 'private, max-age=300');
  res.end(buf);
}

async function acaoGaleria(eu, b) {
  await exigirDiario(eu);
  if (!veGaleria(eu)) throw new HttpError(403, 'A Galeria de fotos é só da corrente e dos alunos.');
  const chave = chavePessoa(eu);
  if (b.op === 'fotoCurtir') return { galeria: await db.rpc('diario_foto_curtir', { id: validarId(b.id, 'Foto'), chave }) };
  if (b.op === 'fotoExcluir') return { galeria: await db.rpc('diario_foto_excluir', { id: validarId(b.id, 'Foto'), chave, admin: ehRoot(eu) }) };
  if (chave.startsWith('n:')) throw new HttpError(403, 'Este acesso não sobe fotos.');
  const foto = typeof b.foto === 'string' ? b.foto : '';
  if (!foto || foto.length > Math.ceil(GALERIA_FOTO_MAX / 3) * 4) throw new HttpError(400, 'Foto grande demais.');
  const buf = Buffer.from(foto, 'base64');
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, 'Foto inválida (envie JPEG).');
  const descricao = String(b.descricao ?? '').replace(/\s+/g, ' ').trim().slice(0, GALERIA_DESCRICAO_MAX);
  return { galeria: await db.rpc('diario_foto_salvar', { chave, nome: String(eu.nome || '').trim(), descricao, foto: buf.toString('base64') }) };
}

export async function acaoDiario(eu, b) {
  if (b.op === 'publicar') {
    if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root muda a visibilidade do Diário.');
    if (typeof b.publicada !== 'boolean') throw new HttpError(400, 'Informe se a aba fica visível para todos.');
    await db.rpc('diario_publicar', { publicada: b.publicada });
    return diario(eu);
  }
  if (b.op === 'orientador') {
    if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root liga ou desliga o Orientador.');
    if (typeof b.visivel !== 'boolean') throw new HttpError(400, 'Informe se o Orientador fica visível.');
    await db.rpc('diario_orientador_mudar', { visivel: b.visivel });
    return diario(eu);
  }
  if (['fotoEnviar', 'fotoExcluir', 'fotoCurtir'].includes(b.op)) return acaoGaleria(eu, b);
  if (b.op !== 'salvar') throw new HttpError(400, 'Ação inválida.');
  await exigirDiario(eu);
  const data = validarData(String(b.data || ''));
  if (data > hojeBR()) throw new HttpError(400, 'O diário não aceita dias que ainda não chegaram.');
  return db.rpc('diario_salvar', { chave: chavePessoa(eu), data, dados: normalizarDia(b.dados) });
}
