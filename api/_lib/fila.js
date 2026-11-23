// Fila digital de senhas da gira. Rotas em api/giras/[data].
// Pegar senha não exige login: vale só para a gira de hoje, com a fila aberta e o celular no terreiro (localização).
// O celular guarda um token próprio (cabeçalho X-Fila-Token) e o banco só o hash: é por ele que a pessoa vê a própria senha.
// Quem está logado pega do mesmo jeito e a senha fica ligada ao cadastro também.
// Controlam a fila (painel, balcão, chamar): quem edita a Gira, o root e a pessoa com a função Senha (no cadastro ou no dia).
import { createHash } from 'node:crypto';
import { HttpError, validarId, hojeBR } from './http.js';
import { db } from './db.js';
import { exigir, autorDe } from './sessao.js';
import { limitarPorIp } from './senhas.js';
import { pode } from '../../shared/permissoes.js';
import { noTerreiro } from '../../shared/amaci.js';
import { TIPO_KEYS, FILAS_CHAMADA, STATUS_MARCAR, LIMITE_MAX } from '../../shared/fila.js';

export const ACOES_FILA_PUBLICAS = ['filaEntrar', 'filaDesistir'];
export const ACOES_FILA_PAINEL = ['filaChamar', 'filaMarcar', 'filaConfig', 'filaBalcao'];

const TOKEN = /^[A-Za-z0-9-]{20,80}$/;
function aparelhoDe(req) {
  const t = String(req.headers['x-fila-token'] || '').trim();
  return TOKEN.test(t) ? createHash('sha256').update(t).digest('hex') : null;
}

// Logado é opcional: sessão vencida ou ausente segue como quem não tem cadastro.
async function talvezLogado(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return await exigir(req); } catch { return null; }
}

function validarNome(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) throw new HttpError(400, 'Informe o nome (até 80 letras).');
  return s;
}
function validarTelefone(v) {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length > 20) throw new HttpError(400, 'Telefone inválido.');
  return s;
}
function validarTipo(v) {
  if (!TIPO_KEYS.includes(v)) throw new HttpError(400, 'Escolha o tipo de senha.');
  return v;
}

// GET ?lista=fila — o resumo da fila e a própria senha (sem login).
export async function filaPublica(req, data) {
  const eu = await talvezLogado(req);
  return db.rpc('fila_obter', { data, aparelho: aparelhoDe(req), autor: eu ? autorDe(eu) : null });
}

export async function acaoFilaPublica(req, data, b) {
  const aparelho = aparelhoDe(req);
  const eu = await talvezLogado(req);
  const autor = eu ? autorDe(eu) : null;
  if (!aparelho && !autor) throw new HttpError(400, 'Atualize a página e tente de novo.');
  if (b.acao === 'filaDesistir') return db.rpc('fila_desistir', { data, aparelho, autor });
  if (data !== hojeBR()) throw new HttpError(400, 'A senha só pode ser pega no dia da gira.');
  const tipo = validarTipo(b.tipo);
  const nome = validarNome(b.nome || eu?.nome);
  const telefone = validarTelefone(b.telefone);
  if (!noTerreiro(Number(b.lat), Number(b.lon))) throw new HttpError(403, 'Você precisa estar no terreiro para pegar a senha. Se não der, peça no balcão.');
  // Todos no Wi-Fi da casa saem pelo mesmo IP: o limite é largo, só para segurar robô.
  await limitarPorIp(req, 'fila', 150, 60, 'Muitas senhas pedidas desta rede. Peça a sua no balcão.');
  return db.rpc('fila_entrar', { data, tipo, nome, telefone, autor, aparelho, balcao: false });
}

// Quem controla a fila. A função Senha vale pelo cadastro ou pela troca do dia (sen) nesta gira.
export async function exigirOperador(req, data) {
  const eu = await exigir(req);
  if (pode(eu, 'giras:editar')) return eu;
  if (eu.pessoaId) {
    const [pessoas, gira] = await db.lote([
      { funcao: 'pessoas_listar', p: { id: eu.pessoaId } },
      { funcao: 'gira_obter', p: { data } },
    ]);
    const p = (pessoas || []).find((x) => x.id === eu.pessoaId);
    if (p?.funcao === 'senha' || gira?.papeis?.[eu.pessoaId] === 'sen') return eu;
  }
  throw new HttpError(403, 'Só quem está na função Senha ou administra a gira controla a fila.');
}

export const filaPainel = async (req, data) => {
  await exigirOperador(req, data);
  return db.rpc('fila_painel', { data });
};

export async function acaoFilaPainel(req, data, b) {
  await exigirOperador(req, data);
  if (b.acao === 'filaChamar') {
    if (!FILAS_CHAMADA.includes(b.fila)) throw new HttpError(400, 'Fila inválida.');
    return db.rpc('fila_chamar', { data, fila: b.fila });
  }
  if (b.acao === 'filaMarcar') {
    if (!STATUS_MARCAR.includes(b.status)) throw new HttpError(400, 'Situação inválida.');
    return db.rpc('fila_marcar', { data, id: validarId(b.id, 'Senha'), status: b.status });
  }
  if (b.acao === 'filaConfig') {
    const p = { data };
    if ('aberta' in b) {
      if (typeof b.aberta !== 'boolean') throw new HttpError(400, 'Opção inválida.');
      p.aberta = b.aberta;
    }
    if ('limite' in b) {
      const n = b.limite === null || b.limite === '' ? null : Number(b.limite);
      if (n !== null && (!Number.isInteger(n) || n < 0 || n > LIMITE_MAX)) throw new HttpError(400, `O limite vai de 0 a ${LIMITE_MAX} (vazio = sem limite).`);
      p.limite = n;
    }
    return db.rpc('fila_config', p);
  }
  // filaBalcao: senha emitida por quem controla a fila (sem celular, sem localização, também com a fila fechada).
  return db.rpc('fila_entrar', { data, tipo: validarTipo(b.tipo), nome: validarNome(b.nome), telefone: validarTelefone(b.telefone), balcao: true });
}
