// Acesso ao Supabase pela API REST, sem dependências.
//
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   SUPABASE_URL               https://<projeto>.supabase.co
//   SUPABASE_ANON_KEY          chave pública (anon ou publishable)
//   SUPABASE_SERVICE_ROLE_KEY  chave de serviço (service_role ou secret) — NUNCA vai para o navegador
//
// "db" e "auth" são objetos para que os testes possam trocar a implementação.

import { HttpError } from './http.js';

function env(nome) {
  const v = process.env[nome];
  if (!v) throw new HttpError(503, `Variável de ambiente ${nome} não configurada na Vercel.`);
  return v;
}
const base = () => env('SUPABASE_URL').replace(/\/+$/, '');

// Chaves novas (sb_secret_/sb_publishable_) vão só no header apikey;
// as antigas (JWT "eyJ...") também vão como Bearer.
function headersChave(chave, extra = {}) {
  const h = { apikey: chave, 'Content-Type': 'application/json', ...extra };
  if (chave.startsWith('eyJ') && !h.Authorization) h.Authorization = 'Bearer ' + chave;
  return h;
}

async function lerResposta(r) {
  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { json = { message: txt }; }
  return json;
}

export const db = {
  // Chama uma função do banco (supabase/migrations/002_funcoes_api.sql).
  async rpc(funcao, p = {}) {
    const r = await fetch(`${base()}/rest/v1/rpc/${funcao}`, {
      method: 'POST',
      headers: headersChave(env('SUPABASE_SERVICE_ROLE_KEY')),
      body: JSON.stringify({ p }),
    });
    const json = await lerResposta(r);
    if (!r.ok) {
      const e = new Error(json?.message || `Falha no banco (${r.status}).`);
      e.code = json?.code;
      throw e;
    }
    return json;
  },
};

export const auth = {
  // Valida o token de sessão do usuário e devolve o id dele (ou null).
  async usuarioDoToken(token) {
    const r = await fetch(`${base()}/auth/v1/user`, {
      headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return null;
    const u = await lerResposta(r);
    return u?.id || null;
  },

  // Administração de usuários (precisa da chave de serviço).
  async criarUsuario({ email, senha, nome, papel }) {
    const r = await fetch(`${base()}/auth/v1/admin/users`, {
      method: 'POST',
      headers: headersChave(env('SUPABASE_SERVICE_ROLE_KEY')),
      body: JSON.stringify({
        email, password: senha, email_confirm: true,
        user_metadata: { nome }, app_metadata: { papel },
      }),
    });
    const json = await lerResposta(r);
    if (!r.ok) throw new HttpError(r.status === 422 || r.status === 400 ? 400 : 502, traduzErroAuth(json));
    return json.id;
  },

  async atualizarUsuario(id, { senha, papel }) {
    const body = {};
    if (senha) body.password = senha;
    if (papel) body.app_metadata = { papel };
    const r = await fetch(`${base()}/auth/v1/admin/users/${id}`, {
      method: 'PUT',
      headers: headersChave(env('SUPABASE_SERVICE_ROLE_KEY')),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new HttpError(r.status === 422 || r.status === 400 ? 400 : 502, traduzErroAuth(await lerResposta(r)));
  },

  async excluirUsuario(id) {
    const r = await fetch(`${base()}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: headersChave(env('SUPABASE_SERVICE_ROLE_KEY')),
    });
    if (!r.ok && r.status !== 404) throw new HttpError(502, traduzErroAuth(await lerResposta(r)));
  },
};

function traduzErroAuth(json) {
  const msg = String(json?.msg || json?.message || json?.error_description || '');
  if (/already.*registered|already exists/i.test(msg)) return 'Já existe um usuário com esse e-mail.';
  if (/password/i.test(msg)) return 'Senha fraca: use pelo menos 6 caracteres.';
  if (/email/i.test(msg)) return 'E-mail inválido.';
  return msg || 'Falha ao falar com o Supabase Auth.';
}
