// GET    /api/giras/:data
// PUT    /api/giras/:data   { entidade?, presenca?, pares?, passes? }  (só substitui o que vier)
// DELETE /api/giras/:data
import { rota, corpo, validarData, validarId, HttpError } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { db } from '../../_lib/supabase.js';
import { giraVazia, STATUS_KEYS } from '../../../shared/regras.js';

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
  DELETE: async (req) => {
    await exigir(req, 'giras:excluir');
    return db.rpc('gira_excluir', { data: validarData(req.query.data) });
  },
});
