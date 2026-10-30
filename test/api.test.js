// Testes de integração do backend: rotas reais + Postgres local.
// Rodar: npm test   (precisa de Postgres local; veja test/apoio.js)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, usarBancoLocal, sql } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';

let srv, base;
let ADMIN, USER;  // tokens de sessão
process.env.CODIGO_INSTALACAO = 'codigo-de-teste';

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
  usarBancoLocal();
  srv = await criarServidor();
  await new Promise((ok) => srv.listen(0, ok));
  base = 'http://127.0.0.1:' + srv.address().port;
});
after(() => srv?.close());

test('instalação: código obrigatório e só uma vez', async () => {
  assert.deepEqual((await api('GET', '/api/auth/estado')).json, { instalado: false });
  const dados = { nome: 'Mãe Joana', email: 'Admin@Corrente.org', senha: 'senha-forte-1' };
  assert.equal((await api('POST', '/api/auth/instalar', null, { ...dados, codigo: 'errado' })).status, 403);
  assert.equal((await api('POST', '/api/auth/instalar', null, { ...dados, codigo: 'codigo-de-teste', senha: '123' })).status, 400);
  const r = await api('POST', '/api/auth/instalar', null, { ...dados, codigo: 'codigo-de-teste' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.usuario.papel, 'admin');
  assert.equal(r.json.usuario.email, 'admin@corrente.org');
  ADMIN = r.json.token;
  const de2 = await api('POST', '/api/auth/instalar', null, { ...dados, email: 'outro@x.org', codigo: 'codigo-de-teste' });
  assert.equal(de2.status, 400);
  assert.match(de2.json.erro, /já foi instalado/);
  assert.deepEqual((await api('GET', '/api/auth/estado')).json, { instalado: true });
  // senha guardada com hash, nunca em texto
  assert.match(sql("select senha_hash from usuarios"), /^scrypt\$/);
});

test('login: senha certa, errada e bloqueio', async () => {
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'user@corrente.org', nome: 'Zé', senha: 'senha-do-ze', papel: 'usuario' })).status, 200);
  const errado = await api('POST', '/api/auth/entrar', null, { email: 'user@corrente.org', senha: 'nao' });
  assert.equal(errado.status, 401);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'ninguem@x.org', senha: 'nao' })).status, 401);
  const ok = await api('POST', '/api/auth/entrar', null, { email: ' USER@corrente.org ', senha: 'senha-do-ze' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.usuario.permissoes, ['escala:completa', 'pessoas:ler', 'giras:ler', 'ervas:escolher']);
  USER = ok.json.token;
  for (let i = 0; i < 8; i++) await api('POST', '/api/auth/entrar', null, { email: 'alvo@x.org', senha: 'x' + i });
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'alvo@x.org', senha: 'x' })).status, 429);
});

test('sem login: 401; token inválido ou adulterado: 401', async () => {
  assert.equal((await api('GET', '/api/pessoas')).status, 401);
  assert.equal((await api('GET', '/api/pessoas', 'lixo')).status, 401);
  const [corpo, ass] = ADMIN.split('.');
  const falso = Buffer.from(JSON.stringify({ u: JSON.parse(Buffer.from(corpo, 'base64url')).u, v: 1, exp: 9e9 })).toString('base64url');
  assert.equal((await api('GET', '/api/pessoas', falso + '.' + ass)).status, 401);
});

test('/api/me mostra papel e permissões', async () => {
  const a = await api('GET', '/api/me', ADMIN);
  assert.equal(a.status, 200);
  assert.equal(a.json.papel, 'admin');
  assert.ok(a.json.permissoes.includes('giras:sortear'));
  const u = await api('GET', '/api/me', USER);
  assert.equal(u.json.papel, 'usuario');
  assert.deepEqual(u.json.permissoes, ['escala:completa', 'pessoas:ler', 'giras:ler', 'ervas:escolher']);
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
  const julia = lista.find((p) => p.nome === 'Júlia');
  assert.deepEqual(julia.linhas, []);
  const lj = await api('PATCH', '/api/pessoas/' + julia.id, ADMIN, { linhas: ['exu', 'caboclo', 'exu'] });
  assert.deepEqual(lj.json.linhas, ['caboclo', 'exu']);
  assert.equal((await api('PATCH', '/api/pessoas/' + julia.id, ADMIN, { linhas: ['oxossi'] })).status, 400);
  assert.equal((await api('PATCH', '/api/pessoas/' + julia.id, USER, { linhas: [] })).status, 403);
  assert.deepEqual((await api('GET', '/api/pessoas', USER)).json.find((p) => p.nome === 'Júlia').linhas, ['caboclo', 'exu']);
  await api('PATCH', '/api/pessoas/' + julia.id, ADMIN, { linhas: [] }); // volta ao normal para os próximos testes
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

test('encerrar gira: quem não cambonou vai para o Suporte; encerrada não muda até reabrir', async () => {
  const d = '2027-01-02';
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const id = (n) => ps.find((p) => p.nome === n).id;
  await api('PUT', `/api/giras/${d}`, ADMIN, { pares: [{ m: id('Ana'), c: id('Elisa') }], passes: [{ m: id('Ana'), c: id('Helena') }] });
  assert.equal((await api('POST', `/api/giras/${d}`, USER, { acao: 'encerrar' })).status, 403);
  const r = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.gira.encerrada, true);
  const pr = r.json.gira.presenca;
  for (const n of ['Fábio', 'Gabi', 'Kátia']) assert.equal(pr[id(n)], 'sup', n + ' devia ir para o Suporte');
  for (const n of ['Elisa', 'Helena', 'Ana', 'Bruno', 'Igor']) assert.equal(pr[id(n)], undefined, n + ' continua presente');
  assert.match(r.json.mensagem, /Suporte/);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'X' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}/sortear`, ADMIN)).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}/remanejar`, ADMIN)).status, 409);
  // Ao reabrir, quem foi para o Suporte ao encerrar volta a Presente.
  const re = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'reabrir' });
  assert.equal(re.json.gira.encerrada, false);
  for (const n of ['Fábio', 'Gabi', 'Kátia']) assert.equal(re.json.gira.presenca[id(n)], undefined, n + ' devia voltar a Presente');
  assert.match(re.json.mensagem, /Voltaram do Suporte/);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo' })).status, 200);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('gestão de usuários: só admin, com travas', async () => {
  assert.equal((await api('GET', '/api/usuarios', USER)).status, 403);
  const novo = await api('POST', '/api/usuarios', ADMIN, { email: 'Novo@Corrente.org', nome: 'Novo', senha: '12345678', papel: 'usuario' });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.length, 3);
  assert.ok(!('sessaoVersao' in novo.json[0]) && !('senhaHash' in novo.json[0]));
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'novo@corrente.org', nome: 'N', senha: '12345678', papel: 'usuario' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'z@z.org', nome: 'Z', senha: '1', papel: 'usuario' })).status, 400);

  const eu = (await api('GET', '/api/me', ADMIN)).json;
  assert.equal((await api('PATCH', '/api/usuarios/' + eu.id, ADMIN, { papel: 'usuario' })).status, 400);
  assert.equal((await api('DELETE', '/api/usuarios/' + eu.id, ADMIN)).status, 400);

  const user = novo.json.find((u) => u.email === 'novo@corrente.org');
  const tokNovo = (await api('POST', '/api/auth/entrar', null, { email: 'novo@corrente.org', senha: '12345678' })).json.token;
  assert.equal((await api('GET', '/api/me', tokNovo)).status, 200);
  // Mudar o perfil encerra as sessões abertas daquela pessoa.
  assert.equal((await api('PATCH', '/api/usuarios/' + user.id, ADMIN, { papel: 'admin' })).json.papel, 'admin');
  assert.equal((await api('GET', '/api/me', tokNovo)).status, 401);
  // Admin redefine a senha.
  assert.equal((await api('PATCH', '/api/usuarios/' + user.id, ADMIN, { senha: 'outra-senha' })).status, 200);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'novo@corrente.org', senha: 'outra-senha' })).status, 200);
  assert.equal((await api('DELETE', '/api/usuarios/' + user.id, ADMIN)).status, 200);
  assert.equal(sql("select count(*) from usuarios where email = 'novo@corrente.org'"), '0');
});

test('trocar a própria senha encerra as outras sessões', async () => {
  const outra = (await api('POST', '/api/auth/entrar', null, { email: 'user@corrente.org', senha: 'senha-do-ze' })).json.token;
  assert.equal((await api('POST', '/api/auth/senha', USER, { atual: 'errada', nova: 'nova-senha-ze' })).status, 400);
  const r = await api('POST', '/api/auth/senha', USER, { atual: 'senha-do-ze', nova: 'nova-senha-ze' });
  assert.equal(r.status, 200);
  assert.equal((await api('GET', '/api/me', outra)).status, 401);
  assert.equal((await api('GET', '/api/me', r.json.token)).status, 200);
  USER = r.json.token;
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

test('acesso da corrente: entra só com o nome, sem senha', async () => {
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'corrente-cpj', senha: '' })).status, 400);
  const r = await api('POST', '/api/auth/entrar', null, { email: ' Corrente-CPJ ', senha: '  Dona   Maria ' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.usuario.nome, 'Dona Maria');
  assert.equal(r.json.usuario.papel, 'corrente');
  const tok = r.json.token;
  const me = (await api('GET', '/api/me', tok)).json;
  assert.equal(me.corrente, true);
  assert.equal((await api('GET', '/api/giras', tok)).status, 200);
  assert.equal((await api('POST', '/api/pessoas', tok, { nome: 'X', funcao: 'medium' })).status, 403);
  assert.equal((await api('GET', '/api/usuarios', tok)).status, 403);
  assert.equal((await api('POST', '/api/auth/senha', tok, { atual: 'x', nova: 'yyyyyyyy' })).status, 400);
});

test('ervas: admin cadastra, todos escolhem, frete dividido, lista fechada', async () => {
  const add = (nome, preco) => api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', nome, preco });
  assert.equal((await add('Arruda', '5,00')).status, 200);
  assert.equal((await add('Guiné', 7.5)).status, 200);
  assert.equal((await add('arruda', 1)).status, 400);           // nome repetido
  assert.equal((await add('Erva', -1)).status, 400);
  // Preço é opcional no cadastro.
  const semPreco = (await add('Espada de São Jorge', '')).json;
  assert.equal(semPreco.ervas.find((x) => x.nome === 'Espada de São Jorge').preco, null);
  const espada = semPreco.ervas.find((x) => x.nome === 'Espada de São Jorge');
  assert.equal((await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', id: espada.id, nome: espada.nome, preco: 'R$ 4,50' })).json
    .ervas.find((x) => x.id === espada.id).preco, 4.5);
  await api('POST', '/api/ervas', ADMIN, { acao: 'excluirErva', id: espada.id });
  assert.equal((await api('POST', '/api/ervas', USER, { acao: 'salvarErva', nome: 'X', preco: 1 })).status, 403);
  // Nome da gira e data do evento do pedido: só o admin altera; todos veem.
  assert.equal((await api('POST', '/api/ervas', USER, { acao: 'config', gira: 'X' })).status, 403);
  assert.equal((await api('POST', '/api/ervas', ADMIN, { acao: 'config', data: '2026-02-30' })).status, 400);
  const ev = (await api('POST', '/api/ervas', ADMIN, { acao: 'config', gira: ' Gira de  Caboclo ', data: '2026-11-07' })).json;
  assert.deepEqual([ev.gira, ev.data], ['Gira de Caboclo', '2026-11-07']);
  assert.equal((await api('GET', '/api/ervas', USER)).json.gira, 'Gira de Caboclo');
  let e = (await api('POST', '/api/ervas', ADMIN, { acao: 'config', frete: '12' })).json;
  assert.equal(e.frete, 12);
  const [arruda, guine] = ['Arruda', 'Guiné'].map((n) => e.ervas.find((x) => x.nome === n));

  const maria = (await api('POST', '/api/auth/entrar', null, { email: 'corrente-cpj', senha: 'Maria' })).json.token;
  const r1 = await api('PUT', '/api/ervas', maria, { itens: [{ ervaId: arruda.id, quantidade: 2 }] });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.deepEqual(r1.json.minhas, [{ ervaId: arruda.id, quantidade: 2 }]);
  assert.equal(r1.json.pedidos.pessoas.length, 1, 'todos veem o andamento dos pedidos');
  // Mesmo nome, outro aparelho: continua as mesmas escolhas.
  const maria2 = (await api('POST', '/api/auth/entrar', null, { email: 'corrente-cpj', senha: 'maria' })).json.token;
  assert.deepEqual((await api('GET', '/api/ervas', maria2)).json.minhas, [{ ervaId: arruda.id, quantidade: 2 }]);
  assert.equal((await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: guine.id, quantidade: 1 }] })).status, 200);
  assert.equal((await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: guine.id, quantidade: 0 }] })).status, 400);

  // Quem tem conta aparece com o nome cadastrado atual, mesmo se mudar depois.
  const ze = (await api('GET', '/api/usuarios', ADMIN)).json.find((u) => u.email === 'user@corrente.org');
  await api('PATCH', '/api/usuarios/' + ze.id, ADMIN, { nome: 'José Carlos' });
  e = (await api('GET', '/api/ervas', ADMIN)).json;
  assert.deepEqual(e.pedidos.pessoas.map((p) => p.nome), ['José Carlos', 'Maria']);
  assert.equal(e.pedidos.pessoas.length, 2);
  assert.deepEqual(e.pedidos.pessoas.map((p) => p.frete), [600, 600]);
  assert.equal(e.pedidos.totalGeral, 500 + 750 + 1200, 'cada erva é dividida entre quem a escolheu');

  await api('POST', '/api/ervas', ADMIN, { acao: 'config', aberta: false });
  const fechado = await api('PUT', '/api/ervas', maria, { itens: [] });
  assert.equal(fechado.status, 400);
  assert.match(fechado.json.erro, /fechada/);

  // Admin faz o pedido de outra pessoa, mesmo com a lista fechada; o mesmo nome da corrente é a mesma pessoa.
  assert.equal((await api('PUT', '/api/ervas', USER, { para: { nome: 'Dona Rosa' }, itens: [{ ervaId: arruda.id, quantidade: 1 }] })).status, 403);
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { nome: 'Dona Rosa' }, itens: [{ ervaId: arruda.id, quantidade: 3 }] })).json;
  assert.deepEqual(e.pedidos.pessoas.map((p) => p.nome), ['Dona Rosa', 'José Carlos', 'Maria']);
  assert.deepEqual(e.minhas, [], 'o pedido do admin não muda');
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { nome: 'MARIA' }, itens: [{ ervaId: guine.id, quantidade: 1 }] })).json;
  assert.deepEqual((await api('GET', '/api/ervas', maria)).json.minhas, [{ ervaId: guine.id, quantidade: 1 }]);
  const rosa = e.pedidos.pessoas.find((p) => p.nome === 'Dona Rosa');
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { chave: rosa.chave }, itens: [] })).json;
  assert.ok(!e.pedidos.pessoas.some((p) => p.nome === 'Dona Rosa'), 'lista vazia apaga o pedido');
  assert.equal((await api('PUT', '/api/ervas', ADMIN, { para: { nome: 'x' }, itens: [] })).status, 400);

  // Excluir a erva remove as escolhas dela; nova compra limpa tudo e reabre.
  e = (await api('POST', '/api/ervas', ADMIN, { acao: 'excluirErva', id: guine.id })).json;
  assert.equal(e.pedidos.pessoas.length, 0, 'Maria e José só tinham Guiné');
  e = (await api('POST', '/api/ervas', ADMIN, { acao: 'novaCompra' })).json;
  assert.equal(e.aberta, true);
  assert.equal(e.pedidos.pessoas.length, 0);
  assert.equal(e.ervas.length, 1);
});

