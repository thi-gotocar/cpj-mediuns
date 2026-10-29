// GET  /api/pessoas            lista a corrente
// POST /api/pessoas            { nomes: [..] | nome: "A, B; C", funcao }
import { rota, corpo, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { FUNCAO_KEYS } from '../../shared/regras.js';

export default rota({
  GET: async (req) => {
    await exigir(req, 'pessoas:ler');
    return db.rpc('pessoas_listar');
  },
  POST: async (req) => {
    await exigir(req, 'pessoas:editar');
    const b = corpo(req);
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
