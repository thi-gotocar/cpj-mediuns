// Login individual pelo Supabase Auth (API REST, sem bibliotecas).
// A sessão fica no localStorage deste navegador e é renovada sozinha.

const CHAVE = 'sortmediuns:sessao';
let config = null;
let sessao = null;
let renovando = null;

try { sessao = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { sessao = null; }

function guardar(s) {
  sessao = s;
  try {
    if (s) localStorage.setItem(CHAVE, JSON.stringify(s));
    else localStorage.removeItem(CHAVE);
  } catch { /* navegador sem armazenamento: a sessão dura até fechar a aba */ }
}

export async function carregarConfig() {
  if (config) return config;
  const r = await fetch('/api/config');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar a configuração.');
  config = j;
  return config;
}

async function chamarAuth(caminho, { metodo = 'POST', corpo, token } = {}) {
  const c = await carregarConfig();
  const headers = { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(c.supabaseUrl + '/auth/v1/' + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function deResposta(j) {
  const agora = Math.floor(Date.now() / 1000);
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || agora + (j.expires_in || 3600),
    email: j.user?.email || sessao?.email || '',
  };
}

export const logado = () => !!sessao?.access_token;

export async function entrar(email, senha) {
  const r = await chamarAuth('token?grant_type=password', { corpo: { email, password: senha } });
  if (!r.ok) {
    const msg = String(r.json.error_description || r.json.msg || r.json.message || '');
    if (/invalid/i.test(msg) || r.status === 400) throw new Error('E-mail ou senha incorretos.');
    if (/confirm/i.test(msg)) throw new Error('E-mail ainda não confirmado.');
    throw new Error('Não foi possível entrar agora. Tente de novo.');
  }
  guardar(deResposta(r.json));
}

async function renovar() {
  if (!sessao?.refresh_token) { guardar(null); return null; }
  const r = await chamarAuth('token?grant_type=refresh_token', { corpo: { refresh_token: sessao.refresh_token } });
  if (!r.ok) { guardar(null); return null; }
  guardar(deResposta(r.json));
  return sessao.access_token;
}

// Token válido para chamar a API (renova se faltar menos de 1 minuto).
export async function token({ forcarRenovacao = false } = {}) {
  if (!sessao) return null;
  const falta = sessao.expires_at - Math.floor(Date.now() / 1000);
  if (forcarRenovacao || falta < 60) {
    renovando ||= renovar().finally(() => { renovando = null; });
    return renovando;
  }
  return sessao.access_token;
}

export async function trocarSenha(nova) {
  const t = await token();
  const r = await chamarAuth('user', { metodo: 'PUT', corpo: { password: nova }, token: t });
  if (!r.ok) throw new Error(/password/i.test(JSON.stringify(r.json)) ? 'Senha fraca: use pelo menos 6 caracteres.' : 'Não foi possível trocar a senha.');
}

export async function sair() {
  const t = sessao?.access_token;
  guardar(null);
  if (t) chamarAuth('logout', { token: t }).catch(() => {});
}

export function esquecerSessao() {
  guardar(null);
}
