// Login pelo backend do app. O token da sessão fica no localStorage deste navegador.

const CHAVE = 'sortmediuns:token';
let tok = null;
try { tok = localStorage.getItem(CHAVE); } catch { tok = null; }

function guardar(t) {
  tok = t;
  try {
    if (t) localStorage.setItem(CHAVE, t);
    else localStorage.removeItem(CHAVE);
  } catch { /* navegador sem armazenamento: a sessão dura até fechar a aba */ }
}

async function chamar(metodo, acao, corpo, comToken = false) {
  let r;
  try {
    r = await fetch('/api/auth/' + acao, {
      method: metodo,
      headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(comToken && tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Sem conexão. Verifique a internet e tente de novo.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.erro || 'Algo deu errado. Tente de novo.');
    e.status = r.status;
    throw e;
  }
  return j;
}

export const logado = () => !!tok;
export const token = () => tok;

export const estadoDoApp = () => chamar('GET', 'estado');

// Acesso da corrente com nome em dúvida: devolve { candidatos } e não entra.
// Pessoa com senha (PIN) e sem "pin": devolve { precisaSenha, nome } e não entra.
export async function entrar(email, senha, digitado, pin) {
  const r = await chamar('POST', 'entrar', { email, senha, ...(digitado ? { digitado } : {}), ...(pin ? { pin } : {}) });
  if (r.confirmar) return { candidatos: r.candidatos || [] };
  if (r.precisaSenha) return { precisaSenha: true, nome: r.nome };
  guardar(r.token);
  return {};
}

export async function instalar(dados) {
  const r = await chamar('POST', 'instalar', dados);
  guardar(r.token);
}

export async function trocarSenha(atual, nova) {
  const r = await chamar('POST', 'senha', { atual, nova }, true);
  guardar(r.token);
}

// Acesso da corrente: cria a própria senha (PIN). A sessão é renovada (as outras são encerradas).
export async function criarSenhaCorrente(senha) {
  const r = await chamar('POST', 'criarSenha', { senha }, true);
  guardar(r.token);
}

export function sair() {
  guardar(null);
}
