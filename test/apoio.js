// Apoio aos testes: Postgres local no lugar do banco da Vercel.
// Requer o Postgres rodando localmente e acesso como usuário "postgres"
// (no Linux: runuser -u postgres). O login e as senhas são os reais.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db } from '../api/_lib/db.js';
import { MIGRACOES } from '../db/esquema.js';

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
  const dir = mkdtempSync(path.join(tmpdir(), 'sortm-'));
  const arq = path.join(dir, 'esquema.sql');
  // Aplica duas vezes para garantir que a migração é idempotente.
  const sql = 'begin;\n' + MIGRACOES.join(';\n') + ';\ncommit;\n';
  writeFileSync(arq, sql + sql);
  execFileSync('chmod', ['-R', 'a+rX', dir]);
  execFileSync('runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', BANCO, '-f', arq], { stdio: 'pipe' });
}

export function sql(q) {
  return psql(q).trim();
}

export function usarBancoLocal() {
  db.rpc = async (funcao, p = {}) => {
    if (!/^[a-z_]+$/.test(funcao)) throw new Error('função inválida');
    const out = psql(`select ${funcao}(${lit(JSON.stringify(p))}::jsonb);`).trim();
    return out ? JSON.parse(out) : null;
  };
}
