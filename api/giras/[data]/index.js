// GET    /api/giras/:data
// PUT    /api/giras/:data   { entidade?, presenca?, papeis?, pares?, passes?, atendimentos?, encerrada?, limpeza?, orixa? }  (só substitui o que vier)
//                            (atendimentos + encerrada: true = cadastrar uma gira antiga já encerrada, sem escala)
// POST   /api/giras/:data   { acao: 'encerrar', atendimentos: { preferencial, normal, passe } } | { acao: 'reabrir' } | { acao: 'reiniciar' }  → { gira, mensagem }
//                            reiniciar: gira em aberto volta ao início (tudo pendente, sem gira, orixá, turma nem duplas); só a data fica
//                            { acao: 'ausencia' }  acesso da corrente: a própria pessoa passa de Pendente para Ausente (até a véspera)
// DELETE /api/giras/:data
import { rota, corpo, validarData, validarId, HttpError, MSG_ENCERRADA } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { db } from '../../_lib/db.js';
import { giraVazia, STATUS_KEYS, TURMAS_LIMPEZA, ORIXAS, encerrar, reabrir, pendentesDaGira, proximaTurma, podeDeclararAusencia } from '../../../shared/regras.js';

// Data de hoje no horário de Brasília (AAAA-MM-DD).
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function validarDuplas(lista, nome) {
  if (!Array.isArray(lista) || lista.length > 500) throw new HttpError(400, `Lista de ${nome} inválida.`);
  return lista.map((d) => ({
    m: validarId(d?.m, 'Médium'),
    c: validarId(d?.c, 'Pessoa'),
    fixo: !!d.fixo,
    remanejado: !!d.remanejado,
  }));
}

function validarAtendimentos(a) {
  const at = {};
  for (const k of ['preferencial', 'normal', 'passe']) {
    const n = Number(a?.[k] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
    at[k] = n;
  }
  return at;
}

// Quem entra pelo acesso da corrente (cpj), com ou sem senha, avisa que não vai.
async function declararAusencia(req) {
  const eu = await exigir(req, 'giras:ler');
  if (eu.papel !== 'corrente' || !eu.pessoaId) throw new HttpError(403, 'Só quem entra pelo acesso da corrente declara ausência por aqui.');
  const data = validarData(req.query.data);
  const [pessoas, atual] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('gira_obter', { data })]);
  const p = pessoas.find((x) => x.id === eu.pessoaId);
  if (!atual) throw new HttpError(404, 'Esta gira ainda não foi criada.');
  if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
  if (hojeBR() >= data) throw new HttpError(400, 'A ausência só pode ser declarada até o dia anterior à gira. Fale com a Michelle.');
  if (!podeDeclararAusencia(p, atual, hojeBR())) throw new HttpError(400, 'Sua presença nesta gira já foi definida. Fale com a Michelle.');
  const gira = await db.rpc('presenca_marcar', { data, pessoaId: p.id, status: 'a' });
  return { gira, mensagem: 'Ausência registrada. Obrigado por avisar! #boa gira' };
}

export default rota({
  GET: async (req) => {
    await exigir(req, 'giras:ler');
    const data = validarData(req.query.data);
    return (await db.rpc('gira_obter', { data })) || giraVazia(data);
  },
  PUT: async (req) => {
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const b = corpo(req);
    // Gira encerrada: só a turma da limpeza e o orixá ainda podem mudar (o resto, só reabrindo).
    const soLimpeza = Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'limpeza' || k === 'orixa');
    if (!soLimpeza && (await db.rpc('gira_obter', { data }))?.encerrada) throw new HttpError(409, MSG_ENCERRADA);
    const p = { data, usuario: perfil.id };
    if ('entidade' in b) {
      const e = String(b.entidade ?? '').trim();
      if (e.length > 120) throw new HttpError(400, 'Entidade muito longa.');
      p.entidade = e;
    }
    if ('presenca' in b) {
      if (!b.presenca || typeof b.presenca !== 'object' || Array.isArray(b.presenca)) throw new HttpError(400, 'Presença inválida.');
      p.presenca = {};
      for (const [id, st] of Object.entries(b.presenca)) {
        validarId(id, 'Pessoa');
        if (!STATUS_KEYS.includes(st)) throw new HttpError(400, 'Status de presença inválido.');
        p.presenca[id] = st;
      }
    }
    if ('papeis' in b) {
      if (!b.papeis || typeof b.papeis !== 'object' || Array.isArray(b.papeis)) throw new HttpError(400, 'Função do dia inválida.');
      p.papeis = {};
      for (const [id, v] of Object.entries(b.papeis)) {
        validarId(id, 'Pessoa');
        if (v !== 'sup' && v !== 'na' && v !== 'cad') throw new HttpError(400, 'Função do dia inválida.');
        p.papeis[id] = v;
      }
    }
    if ('pares' in b) p.pares = validarDuplas(b.pares, 'cambones');
    if ('passes' in b) p.passes = validarDuplas(b.passes, 'médiuns de passe');
    if ('atendimentos' in b) p.atendimentos = validarAtendimentos(b.atendimentos);
    if ('limpeza' in b) {
      if (b.limpeza === null || b.limpeza === '') p.limpeza = null;
      else if (TURMAS_LIMPEZA.includes(Number(b.limpeza))) p.limpeza = Number(b.limpeza);
      else throw new HttpError(400, 'Turma da limpeza inválida (1 a 7).');
    }
    if ('orixa' in b) {
      const o = String(b.orixa ?? '').trim();
      if (o && !ORIXAS.includes(o)) throw new HttpError(400, 'Orixá inválido.');
      p.orixa = o;
    }
    if (b.encerrada === true) p.encerrada = true;
    return db.rpc('gira_salvar', p);
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'ausencia') return declararAusencia(req);
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const { acao, atendimentos } = b;
    if (!['encerrar', 'reabrir', 'reiniciar'].includes(acao)) throw new HttpError(400, 'Ação inválida.');
    const [pessoas, atual] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('gira_obter', { data })]);
    if (acao === 'reiniciar') {
      if (atual?.encerrada) throw new HttpError(409, 'A gira está encerrada. Reabra antes de reiniciar.');
      await db.rpc('gira_excluir', { data });
      // Volta com a próxima turma da limpeza do rodízio (como uma gira nova).
      const turma = proximaTurma(pessoas, await db.rpc('giras_listar'), data);
      const gira = await db.rpc('gira_salvar', { data, usuario: perfil.id, ...(turma ? { limpeza: turma } : {}) });
      return { gira, mensagem: `Gira reiniciada: todos voltaram para Pendente.${turma ? ` Turma da limpeza: Turma ${turma}.` : ''}` };
    }
    if (acao === 'reabrir') {
      if (!atual?.encerrada) return { gira: atual || giraVazia(data), mensagem: 'A gira já estava aberta.' };
      const { patch, mensagem } = reabrir(pessoas, atual);
      return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
    }
    if (atual?.encerrada) return { gira: atual, mensagem: 'A gira já estava encerrada.' };
    // Só encerra depois de confirmar a presença de todos (ninguém pendente).
    const pend = pendentesDaGira(pessoas, atual || giraVazia(data));
    if (pend.length) throw new HttpError(409, `Confirme a presença antes de encerrar: ${pend.length} pendente${pend.length > 1 ? 's' : ''} (${pend.slice(0, 5).map((p) => p.nome).join(', ')}${pend.length > 5 ? '…' : ''}).`);
    const { patch, mensagem } = encerrar(pessoas, atual || giraVazia(data));
    // Quantas pessoas foram atendidas na gira.
    if (!atendimentos || typeof atendimentos !== 'object') throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
    patch.atendimentos = validarAtendimentos(atendimentos);
    return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
  },
  DELETE: async (req) => {
    await exigir(req, 'giras:excluir');
    return db.rpc('gira_excluir', { data: validarData(req.query.data) });
  },
});
