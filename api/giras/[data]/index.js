// GET    /api/giras/:data
// PUT    /api/giras/:data   { entidade?, presenca?, pares?, passes? }  (só substitui o que vier)
// POST   /api/giras/:data   { acao: 'encerrar', atendimentos: { preferencial, normal, passe } } | { acao: 'reabrir' }  → { gira, mensagem }
// DELETE /api/giras/:data
import { rota, corpo, validarData, validarId, HttpError, MSG_ENCERRADA } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { db } from '../../_lib/db.js';
import { giraVazia, STATUS_KEYS, encerrar, reabrir } from '../../../shared/regras.js';

function validarDuplas(lista, nome) {
  if (!Array.isArray(lista) || lista.length > 500) throw new HttpError(400, `Lista de ${nome} inválida.`);
  return lista.map((d) => ({
    m: validarId(d?.m, 'Médium'),
    c: validarId(d?.c, 'Pessoa'),
    fixo: !!d.fixo,
    remanejado: !!d.remanejado,
  }));
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
    if ((await db.rpc('gira_obter', { data }))?.encerrada) throw new HttpError(409, MSG_ENCERRADA);
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
    if ('pares' in b) p.pares = validarDuplas(b.pares, 'cambones');
    if ('passes' in b) p.passes = validarDuplas(b.passes, 'médiuns de passe');
    return db.rpc('gira_salvar', p);
  },
  POST: async (req) => {
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const { acao, atendimentos } = corpo(req);
    if (acao !== 'encerrar' && acao !== 'reabrir') throw new HttpError(400, 'Ação inválida.');
    const [pessoas, atual] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('gira_obter', { data })]);
    if (acao === 'reabrir') {
      if (!atual?.encerrada) return { gira: atual || giraVazia(data), mensagem: 'A gira já estava aberta.' };
      const { patch, mensagem } = reabrir(pessoas, atual);
      return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
    }
    if (atual?.encerrada) return { gira: atual, mensagem: 'A gira já estava encerrada.' };
    const { patch, mensagem } = encerrar(pessoas, atual || giraVazia(data));
    // Quantas pessoas foram atendidas na gira.
    const at = {};
    for (const k of ['preferencial', 'normal', 'passe']) {
      const n = Number(atendimentos?.[k]);
      if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
      at[k] = n;
    }
    patch.atendimentos = at;
    return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
  },
  DELETE: async (req) => {
    await exigir(req, 'giras:excluir');
    return db.rpc('gira_excluir', { data: validarData(req.query.data) });
  },
});
