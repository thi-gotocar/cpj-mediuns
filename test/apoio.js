// Apoio aos testes: Postgres local no lugar do Supabase.
// Requer o Postgres rodando localmente e acesso como usuário "postgres".
//   - db.rpc       -> chama as funções via psql
//   - auth.*       -> tokens "tok-<email>" e usuários gravados direto em auth.users

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { auth, db } from '../api/_lib/supabase.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BANCO = process.env.TEST_DB || 'sortm_teste';

function psql(sql, banco = BANCO) {
  const args = ['-u', 'postgres', '--', 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', banco];
  try {
    return execFileSync('runuser', args, { input: '\\set VERBOSITY verbose\n' + sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    const m = String(e.stderr).match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
    const err = new Error(m ? m[2] : String(e.stderr));
    err.code = m && m[1];
    throw err;
  }
}

const lit = (s) => '$q$' + String(s).replace(/\$q\$/g, '') + '$q$';

export function prepararBanco() {
  psql(`drop database if exists ${BANCO};`, 'postgres');
  psql(`create database ${BANCO};`, 'postgres');
  for (const f of ['test/supabase-stub.sql', 'supabase/migrations/001_inicial.sql', 'supabase/migrations/002_funcoes_api.sql']) {
    execFileSync('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', BANCO, '-f', path.join(RAIZ, f)], { stdio: 'pipe' });
  }
}

export function sql(q) {
  return psql(q).trim();
}

export function simularSupabase() {
  db.rpc = async (funcao, p = {}) => {
    if (!/^[a-z_]+$/.test(funcao)) throw new Error('função inválida');
    const out = psql(`select public.${funcao}(${lit(JSON.stringify(p))}::jsonb);`).trim();
    return out ? JSON.parse(out) : null;
  };
  auth.usuarioDoToken = async (token) => {
    const email = token.startsWith('tok-') ? token.slice(4) : null;
    if (!email) return null;
    return psql(`select id from auth.users where email = ${lit(email)};`).trim() || null;
  };
  auth.criarUsuario = async ({ email, nome, papel }) => {
    if (psql(`select 1 from auth.users where email = ${lit(email)};`).trim()) {
      const { HttpError } = await import('../api/_lib/http.js');
      throw new HttpError(400, 'Já existe um usuário com esse e-mail.');
    }
    return psql(`insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
      values (${lit(email)}, ${lit(JSON.stringify({ nome }))}::jsonb, ${lit(JSON.stringify({ papel }))}::jsonb) returning id;`).trim();
  };
  auth.atualizarUsuario = async () => {};
  auth.excluirUsuario = async (id) => { psql(`delete from auth.users where id = ${lit(id)};`); };
}

export function criarUsuarioDireto(email, nome) {
  return psql(`insert into auth.users (email, raw_user_meta_data) values (${lit(email)}, ${lit(JSON.stringify({ nome }))}::jsonb) returning id;`).trim();
}
