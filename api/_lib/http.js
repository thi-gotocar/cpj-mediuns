// Utilidades HTTP das funções da Vercel.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Traduz erros do Postgres (vindos da API REST do Supabase) para respostas claras.
function deErroDoBanco(e) {
  switch (e.code) {
    case '23505': return new HttpError(409, 'Já existe um cadastro com esse nome.');
    case '23503': return new HttpError(400, 'Pessoa ou gira não encontrada.');
    case '23514': return new HttpError(400, 'Valor inválido.');
    case '22P02':
    case '22007':
    case '22008': return new HttpError(400, 'Dados inválidos.');
    case 'P0001': return new HttpError(400, e.message);
    default: return null;
  }
}

// Monta o handler de uma rota: { GET: fn, POST: fn, ... }.
// Cada fn recebe (req, res) e devolve o corpo JSON da resposta.
export function rota(metodos) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const fn = metodos[req.method];
      if (!fn) {
        res.setHeader('Allow', Object.keys(metodos).join(', '));
        throw new HttpError(405, 'Método não permitido.');
      }
      const corpo = await fn(req, res);
      if (!res.headersSent) res.status(200).json(corpo ?? { ok: true });
    } catch (e) {
      const err = e instanceof HttpError ? e : deErroDoBanco(e) || e;
      const status = err.status || 500;
      if (status >= 500) console.error('[api]', req.method, req.url, e);
      if (!res.headersSent) {
        res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente de novo.' : err.message });
      }
    }
  };
}

export function corpo(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { throw new HttpError(400, 'JSON inválido.'); }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Envie um objeto JSON.');
  return b;
}

export function validarData(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, 'Data inválida (use AAAA-MM-DD).');
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new HttpError(400, 'Data inválida.');
  return s;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validarId(s, oque = 'Identificador') {
  if (typeof s !== 'string' || !UUID.test(s)) throw new HttpError(400, oque + ' inválido.');
  return s;
}
