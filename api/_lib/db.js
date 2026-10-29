// Acesso ao Postgres da Vercel (Neon) por SQL-over-HTTP, sem dependências.
//
// A Vercel cria a variável DATABASE_URL ao conectar o banco ao projeto
// (aba Storage). O esquema é aplicado sozinho no primeiro acesso.
//
// "db" é um objeto para que os testes possam trocar a implementação.

import { HttpError } from './http.js';
import { VERSAO, MIGRACOES } from '../../db/esquema.js';

function urlDoBanco() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new HttpError(503, 'Banco de dados não conectado. Na Vercel, abra o projeto > Storage, crie um banco Postgres (Neon) e conecte ao projeto; depois faça um Redeploy.');
  }
  return url;
}

// Mesmo endereço que o driver oficial da Neon usa: https://api.<região>/sql
function endpoint(url) {
  const host = new URL(url.replace(/^postgres(ql)?:/, 'https:')).hostname;
  return 'https://' + host.replace(/^[^.]+\./, 'api.') + '/sql';
}

async function enviar(corpo, extras = {}) {
  const url = urlDoBanco();
  let r;
  try {
    r = await fetch(endpoint(url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': url,
        'Neon-Raw-Text-Output': 'true',
        'Neon-Array-Mode': 'true',
        ...extras,
      },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    console.error('[db] falha de conexão', e);
    throw new HttpError(503, 'Não foi possível falar com o banco de dados. Tente de novo.');
  }
  const txt = await r.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    const err = new Error(json?.message || `Falha no banco (${r.status}).`);
    err.code = json?.code;
    throw err;
  }
  return json;
}

let esquemaPronto = null;

async function garantirEsquema() {
  esquemaPronto ||= (async () => {
    try {
      const r = await enviar({ query: "select valor from sistema where chave = 'versao_esquema'", params: [] });
      if (Number(r?.rows?.[0]?.[0]) >= VERSAO) return;
    } catch (e) {
      if (e.code !== '42P01') throw e; // 42P01 = tabela ainda não existe
    }
    // Uma transação só, com trava para dois acessos simultâneos não migrarem juntos.
    await enviar({
      queries: [
        { query: 'select pg_advisory_xact_lock(7230416)', params: [] },
        ...MIGRACOES.map((q) => ({ query: q, params: [] })),
        {
          query: "insert into sistema (chave, valor) values ('versao_esquema', $1) on conflict (chave) do update set valor = excluded.valor",
          params: [String(VERSAO)],
        },
      ],
    }, { 'Neon-Batch-Isolation-Level': 'ReadCommitted' });
  })().catch((e) => { esquemaPronto = null; throw e; });
  return esquemaPronto;
}

export const db = {
  // Chama uma função do banco (db/esquema.js): recebe e devolve JSON.
  async rpc(funcao, p = {}) {
    if (!/^[a-z_]+$/.test(funcao)) throw new Error('Função inválida: ' + funcao);
    await garantirEsquema();
    const r = await enviar({ query: `select ${funcao}($1::jsonb)`, params: [JSON.stringify(p)] });
    const valor = r?.rows?.[0]?.[0];
    return valor == null ? null : JSON.parse(valor);
  },
};
