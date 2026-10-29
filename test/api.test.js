// Testes de integração do backend: rotas reais + Postgres local.
// Rodar: npm test   (precisa de Postgres local; veja test/apoio.js)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, simularSupabase, criarUsuarioDireto, sql } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';

let srv, base;
const ADMIN = 'tok-admin@corrente.org';
const USER = 'tok-user@corrente.org';

async function api(metodo, rota, token, corpo) {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

before(async () => {
  prepararBanco();
  simularSupabase();
  criarUsuarioDireto('admin@corrente.org', 'Mãe Joana');   // primeiro = admin
  criarUsuarioDireto('user@corrente.org', 'Zé');            // depois = usuário
  srv = await criarServidor();
  await new Promise((ok) => srv.listen(0, ok));
  base = 'http://127.0.0.1:' + srv.address().port;
});
after(() => srv?.close());

test('sem login: 401; token inválido: 401', async () => {
  assert.equal((await api('GET', '/api/pessoas')).status, 401);
  assert.equal((await api('GET', '/api/pessoas', 'tok-ninguem@x.com')).status, 401);
});

test('/api/me mostra papel e permissões', async () => {
  const a = await api('GET', '/api/me', ADMIN);
  assert.equal(a.status, 200);
  assert.equal(a.json.papel, 'admin');
  assert.ok(a.json.permissoes.includes('giras:sortear'));
  const u = await api('GET', '/api/me', USER);
  assert.equal(u.json.papel, 'usuario');
  assert.deepEqual(u.json.permissoes, ['pessoas:ler', 'giras:ler']);
});

test('admin cadastra a corrente; usuário só lê', async () => {
  const add = (nome, funcao) => api('POST', '/api/pessoas', ADMIN, { nome, funcao });
  assert.equal((await add('Ana, Bruno; Carla, Diego, ana', 'medium')).json.criadas, 4);
  await add('Elisa, Fábio, Gabi', 'cambone');
  await add('Helena, Kátia', 'passe');
  await add('Igor', 'senha');
  await add('Júlia', 'extra');
  assert.equal((await api('POST', '/api/pessoas', USER, { nome: 'Hacker', funcao: 'medium' })).status, 403);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { nome: 'X', funcao: 'pai' })).status, 400);

  const lista = (await api('GET', '/api/pessoas', USER)).json;
  assert.equal(lista.length, 11);
  const ana = lista.find((p) => p.nome === 'Ana');
  const bruno = lista.find((p) => p.nome === 'Bruno');
  for (const p of [ana, bruno]) {
    assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { experiente: true })).json.experiente, true);
  }
  assert.equal((await api('PATCH', '/api/pessoas/' + ana.id, USER, { experiente: false })).status, 403);
  assert.equal((await api('PATCH', '/api/pessoas/' + ana.id, ADMIN, { nome: 'Bruno' })).status, 409);
  assert.equal((await api('PATCH', '/api/pessoas/nao-e-uuid', ADMIN, { nome: 'Z' })).status, 400);
});

test('sorteio, rodízio e permissões da gira', async () => {
  const d1 = '2026-10-24', d2 = '2026-10-31';
  assert.equal((await api('POST', `/api/giras/${d1}/sortear`, USER)).status, 403);
  assert.equal((await api('PUT', `/api/giras/${d1}`, USER, { entidade: 'X' })).status, 403);

  const s1 = await api('POST', `/api/giras/${d1}/sortear`, ADMIN);
  assert.equal(s1.status, 200, JSON.stringify(s1.json));
  assert.equal(s1.json.gira.pares.length, 5);       // 4 médiuns + 1 extra recebem cambone
  assert.equal(s1.json.gira.passes.length, 2);      // 2 passes nos 2 experientes
  assert.match(s1.json.mensagem, /5 de 5 duplas novas/);

  const s2 = await api('POST', `/api/giras/${d2}/sortear`, ADMIN);
  const anteriores = new Set(s1.json.gira.pares.map((p) => p.m + '|' + p.c));
  const repetidas = s2.json.gira.pares.filter((p) => anteriores.has(p.m + '|' + p.c)).length;
  assert.ok(repetidas <= 1, 'o rodízio deve evitar repetir a gira anterior (repetidas: ' + repetidas + ')');

  const put = await api('PUT', `/api/giras/${d2}`, ADMIN, { entidade: 'Pretos Velhos' });
  assert.equal(put.json.entidade, 'Pretos Velhos');
  assert.equal(put.json.pares.length, 5, 'salvar só a entidade não pode apagar as duplas');
  assert.equal((await api('PUT', `/api/giras/${d2}`, ADMIN, { presenca: { x: 'p' } })).status, 400);
  assert.equal((await api('PUT', `/api/giras/2026-02-30`, ADMIN, { entidade: 'x' })).status, 400);

  const lista = (await api('GET', '/api/giras', USER)).json;
  assert.deepEqual(lista.map((g) => g.data), [d2, d1]);
});

test('remanejar falta mantém as outras duplas', async () => {
  const d = '2026-10-31';
  const g = (await api('GET', `/api/giras/${d}`, ADMIN)).json;
  const alvo = g.pares[0];
  const presenca = { ...g.presenca, [alvo.m]: 'f' };
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca });
  const r = await api('POST', `/api/giras/${d}/remanejar`, ADMIN);
  assert.equal(r.status, 200);
  const novas = r.json.gira.pares;
  assert.ok(!novas.some((p) => p.m === alvo.m), 'quem faltou não pode ter cambone');
  // Todo médium/extra presente continua com cambone.
  const presentes = new Set(g.pares.map((p) => p.m).filter((m) => m !== alvo.m));
  for (const m of presentes) assert.ok(novas.some((p) => p.m === m), 'médium ficou sem cambone');
  // No máximo uma dupla válida muda: a do cambone que estava com dois médiuns (regra 6.2).
  const depois = new Set(novas.map((p) => p.m + '|' + p.c));
  const mudaram = g.pares.filter((p) => p.m !== alvo.m && !depois.has(p.m + '|' + p.c)).length;
  assert.ok(mudaram <= 1, 'duplas válidas alteradas: ' + mudaram);
  // Ninguém acompanha mais de um médium se há cambones suficientes.
  const carga = {};
  novas.forEach((p) => { carga[p.c] = (carga[p.c] || 0) + 1; });
  assert.ok(Math.max(...Object.values(carga)) <= 2);
});

test('gestão de usuários: só admin, com travas', async () => {
  assert.equal((await api('GET', '/api/usuarios', USER)).status, 403);
  const novo = await api('POST', '/api/usuarios', ADMIN, { email: 'Novo@Corrente.org', nome: 'Novo', senha: '123456', papel: 'usuario' });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.length, 3);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'novo@corrente.org', nome: 'N', senha: '123456', papel: 'usuario' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'z@z.org', nome: 'Z', senha: '1', papel: 'usuario' })).status, 400);

  const eu = (await api('GET', '/api/me', ADMIN)).json;
  assert.equal((await api('PATCH', '/api/usuarios/' + eu.id, ADMIN, { papel: 'usuario' })).status, 400);
  assert.equal((await api('DELETE', '/api/usuarios/' + eu.id, ADMIN)).status, 400);

  const user = novo.json.find((u) => u.email === 'novo@corrente.org');
  assert.equal((await api('PATCH', '/api/usuarios/' + user.id, ADMIN, { papel: 'admin' })).json.papel, 'admin');
  assert.equal((await api('DELETE', '/api/usuarios/' + user.id, ADMIN)).status, 200);
  assert.equal(sql("select count(*) from perfis where email = 'novo@corrente.org'"), '0');
});

test('importar backup da versão anterior', async () => {
  const backup = {
    pessoas: {
      a1: { nome: 'Ana', funcao: 'medium', experiente: true },      // já existe
      n1: { nome: 'Nova Médium', funcao: 'medium', experiente: false },
      n2: { nome: 'Novo Cambone', funcao: 'cambone' },
    },
    giras: {
      '2026-09-05': { data: '2026-09-05', entidade: 'Exus', presenca: { a1: true, n1: 'nc', n2: false }, pares: [{ m: 'a1', c: 'n2', fixo: true }], passes: [] },
    },
  };
  assert.equal((await api('POST', '/api/importar', USER, backup)).status, 403);
  const r = await api('POST', '/api/importar', ADMIN, backup);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.pessoasCriadas, 2);
  const g = (await api('GET', '/api/giras/2026-09-05', ADMIN)).json;
  assert.equal(g.entidade, 'Exus');
  assert.equal(g.pares.length, 1);
  assert.deepEqual(Object.values(g.presenca).sort(), ['a', 'sup']);
});
