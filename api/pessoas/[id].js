// PATCH  /api/pessoas/:id   { nome?, funcao?, experiente?, linhas?, limpeza? (1 a 7 ou null) }
// DELETE /api/pessoas/:id
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { FUNCAO_KEYS, LINHA_KEYS, TURMAS_LIMPEZA } from '../../shared/regras.js';

// Turma da limpeza: 1 a 7, ou null (sem turma).
function validarTurma(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!TURMAS_LIMPEZA.includes(n)) throw new HttpError(400, 'Turma da limpeza inválida (1 a 7).');
  return n;
}

export default rota({
  PATCH: async (req) => {
    await exigir(req, 'pessoas:editar');
    const id = validarId(req.query.id);
    const b = corpo(req);
    const p = { id };
    if ('nome' in b) {
      const nome = String(b.nome || '').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Nome inválido.');
      p.nome = nome;
    }
    if ('funcao' in b) {
      if (!FUNCAO_KEYS.includes(b.funcao)) throw new HttpError(400, 'Função inválida.');
      p.funcao = b.funcao;
    }
    if ('experiente' in b) p.experiente = !!b.experiente;
    if ('linhas' in b) {
      if (!Array.isArray(b.linhas) || b.linhas.some((l) => !LINHA_KEYS.includes(l))) throw new HttpError(400, 'Linha inválida.');
      p.linhas = [...new Set(b.linhas)];
    }
    if ('limpeza' in b) p.limpeza = validarTurma(b.limpeza);
    return db.rpc('pessoas_atualizar', p);
  },
  DELETE: async (req) => {
    await exigir(req, 'pessoas:editar');
    return db.rpc('pessoas_excluir', { id: validarId(req.query.id) });
  },
});
