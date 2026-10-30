// Testes de integração do backend: rotas reais + Postgres local.
// Rodar: npm test   (precisa de Postgres local; veja test/apoio.js)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, usarBancoLocal, sql } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';

let srv, base;
let ADMIN, USER;  // tokens de sessão
process.env.CODIGO_INSTALACAO = 'codigo-de-teste';

// Responsável padrão das oferendas nos testes (a primeira pessoa da corrente).
let RESP_ID = null;
const RESP = () => RESP_ID;
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
  assert.equal(r.json.usuario.papel, 'root', 'quem instala é o admin root (não precisa de cadastro na corrente)');
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
  // Usuário é uma pessoa da corrente: sem escolher a pessoa, não cria.
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'user@corrente.org', nome: 'Zé', senha: 'senha-do-ze', papel: 'usuario' })).status, 400);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Zé', funcao: 'senha' });
  const zePessoa = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Zé');
  const criado = await api('POST', '/api/usuarios', ADMIN, { email: 'user@corrente.org', pessoaId: zePessoa.id, senha: 'senha-do-ze', papel: 'usuario' });
  assert.equal(criado.status, 200, JSON.stringify(criado.json));
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'outro@corrente.org', pessoaId: zePessoa.id, senha: 'senha-do-ze', papel: 'usuario' })).json.erro, 'Essa pessoa já tem um usuário.');
  const errado = await api('POST', '/api/auth/entrar', null, { email: 'user@corrente.org', senha: 'nao' });
  assert.equal(errado.status, 401);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'ninguem@x.org', senha: 'nao' })).status, 401);
  const ok = await api('POST', '/api/auth/entrar', null, { email: ' USER@corrente.org ', senha: 'senha-do-ze' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.usuario.permissoes, ['escala:completa', 'pessoas:ler', 'giras:ler', 'ervas:escolher', 'oferendas:doar']);
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

test('/api/auth/me mostra papel e permissões', async () => {
  const a = await api('GET', '/api/auth/me', ADMIN);
  assert.equal(a.status, 200);
  assert.equal(a.json.papel, 'root');
  assert.ok(a.json.permissoes.includes('giras:sortear'));
  const u = await api('GET', '/api/auth/me', USER);
  assert.equal(u.json.papel, 'usuario');
  assert.deepEqual(u.json.permissoes, ['escala:completa', 'pessoas:ler', 'giras:ler', 'ervas:escolher', 'oferendas:doar']);
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
  assert.equal(lista.length, 12, '11 + o Zé (cadastrado para ter usuário)');
  const ana = lista.find((p) => p.nome === 'Ana');
  const bruno = lista.find((p) => p.nome === 'Bruno');
  RESP_ID = ana.id;
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
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar' })).status, 400, 'precisa informar os atendimentos');
  const r = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar', atendimentos: { preferencial: 4, normal: 30, passe: 12 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.gira.encerrada, true);
  assert.deepEqual(r.json.gira.atendimentos, { preferencial: 4, normal: 30, passe: 12 });
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

test('licença: fora do sorteio entre início e fim; só admin cadastra', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const bruno = ps.find((p) => p.nome === 'Bruno');
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-01', fim: '2027-02-28' })).status, 403);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-28', fim: '2027-02-01' })).status, 400);
  const lista = (await api('POST', '/api/pessoas', ADMIN, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-01', fim: '2027-02-28' })).json;
  const lic = lista.find((p) => p.id === bruno.id).licencas;
  assert.deepEqual(lic.map((l) => [l.inicio, l.fim]), [['2027-02-01', '2027-02-28']]);
  const dentro = (await api('POST', '/api/giras/2027-02-13/sortear', ADMIN)).json.gira;
  assert.ok(!dentro.pares.some((p) => p.m === bruno.id || p.c === bruno.id), 'de licença não entra no sorteio');
  const fora = (await api('POST', '/api/giras/2027-03-06/sortear', ADMIN)).json.gira;
  assert.ok(fora.pares.some((p) => p.m === bruno.id), 'depois da licença volta ao sorteio');
  const ed = (await api('POST', '/api/pessoas', ADMIN, { acao: 'editarLicenca', id: lic[0].id, inicio: '2027-02-01', fim: '2027-03-10' })).json;
  assert.equal(ed.find((p) => p.id === bruno.id).licencas[0].fim, '2027-03-10');
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'editarLicenca', id: lic[0].id, inicio: '2027-02-01', fim: '2027-03-10' })).status, 403);
  const sem = (await api('POST', '/api/pessoas', ADMIN, { acao: 'removerLicenca', id: lic[0].id })).json;
  assert.deepEqual(sem.find((p) => p.id === bruno.id).licencas, []);
  await api('DELETE', '/api/giras/2027-02-13', ADMIN);
  await api('DELETE', '/api/giras/2027-03-06', ADMIN);
});

test('gira antiga: cadastro direto já encerrado, com atendidos e sem escala', async () => {
  const d = '2025-06-14';
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const r = await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo', presenca: { [ps[0].id]: 'a' }, atendimentos: { preferencial: 2, normal: 10, passe: 5 }, encerrada: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.encerrada, true);
  assert.deepEqual(r.json.atendimentos, { preferencial: 2, normal: 10, passe: 5 });
  assert.deepEqual(r.json.pares, []);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'X' })).status, 409, 'fica encerrada');
  assert.equal((await api('PUT', '/api/giras/2025-06-21', ADMIN, { atendimentos: { normal: -1 } })).status, 400);
  await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'reabrir' });
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('perfis admin oferendas e admin ervas: cada um administra só a sua aba', async () => {
  const novo = async (email, papel) => {
    await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa ' + papel, funcao: 'senha' });
    const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Pessoa ' + papel);
    assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email, senha: 'senha-forte-9', papel })).status, 200);
    return (await api('POST', '/api/auth/entrar', null, { email, senha: 'senha-forte-9' })).json.token;
  };
  const of = await novo('of@corrente.org', 'admin_oferendas');
  const ev = await novo('ev@corrente.org', 'admin_ervas');
  assert.equal((await api('POST', '/api/oferendas', of, { acao: 'salvar', responsavelId: RESP(), titulo: 'Teste', data: '2027-01-01' })).status, 200);
  assert.equal((await api('POST', '/api/oferendas', ev, { acao: 'salvar', responsavelId: RESP(), titulo: 'Teste', data: '2027-01-01' })).status, 403);
  assert.equal((await api('POST', '/api/ervas', ev, { acao: 'config', frete: '0' })).status, 200);
  assert.equal((await api('POST', '/api/ervas', of, { acao: 'config', frete: '0' })).status, 403);
  // Fora disso, são como usuário: não editam a escala nem os usuários.
  for (const t of [of, ev]) {
    assert.equal((await api('POST', '/api/giras/2027-01-02/sortear', t)).status, 403);
    assert.equal((await api('GET', '/api/usuarios', t)).status, 403);
    assert.equal((await api('GET', '/api/giras', t)).status, 200);
  }
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { nome: 'X', email: 'x@corrente.org', senha: 'senha-forte-9', papel: 'chefe' })).status, 400);
  const lista = (await api('GET', '/api/oferendas', ADMIN)).json.oferendas;
  for (const o of lista.filter((x) => x.titulo === 'Teste')) await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: o.id });
});

test('admin só entra como admin com o e-mail dele; pelo cpj entra como corrente', async () => {
  // Liga um admin a uma pessoa da corrente e tenta entrar pelo acesso da corrente com o nome dele.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Admin Pessoa', funcao: 'senha' });
  const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Admin Pessoa');
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'adm2@corrente.org', senha: 'senha-forte-9', papel: 'admin' })).status, 200);
  const pelaCorrente = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Admin Pessoa' })).json;
  assert.equal(pelaCorrente.usuario.papel, 'corrente');
  const tc = pelaCorrente.token;
  assert.equal((await api('GET', '/api/auth/me', tc)).json.papel, 'corrente');
  assert.equal((await api('POST', '/api/giras/2027-05-01/sortear', tc)).status, 403);
  assert.equal((await api('GET', '/api/usuarios', tc)).status, 403);
  assert.equal((await api('POST', '/api/ervas', tc, { acao: 'config', frete: '1' })).status, 403);
  assert.equal((await api('POST', '/api/oferendas', tc, { acao: 'salvar', responsavelId: RESP(), titulo: 'X', data: '2027-05-01' })).status, 403);
  // Com o e-mail e a senha dele, é admin.
  const pelaConta = (await api('POST', '/api/auth/entrar', null, { email: 'adm2@corrente.org', senha: 'senha-forte-9' })).json;
  assert.equal(pelaConta.usuario.papel, 'admin');
  assert.equal((await api('GET', '/api/usuarios', pelaConta.token)).status, 200);
  // O nome no lugar do e-mail não serve para entrar como admin.
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'Admin Pessoa', senha: 'senha-forte-9' })).status, 401);
  const u = (await api('GET', '/api/usuarios', ADMIN)).json.find((x) => x.email === 'adm2@corrente.org');
  await api('DELETE', '/api/usuarios/' + u.id, ADMIN);
});

test('gestão de usuários: só admin, com travas', async () => {
  assert.equal((await api('GET', '/api/usuarios', USER)).status, 403);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Novo', funcao: 'senha' });
  const pNovo = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Novo');
  const novo = await api('POST', '/api/usuarios', ADMIN, { email: 'Novo@Corrente.org', pessoaId: pNovo.id, senha: '12345678', papel: 'usuario' });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.length, 5, "root, Zé, admin oferendas, admin ervas e o novo");
  assert.ok(!('sessaoVersao' in novo.json[0]) && !('senhaHash' in novo.json[0]));
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'novo@corrente.org', pessoaId: pNovo.id, senha: '12345678', papel: 'usuario' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { email: 'z@z.org', pessoaId: pNovo.id, senha: '1', papel: 'usuario' })).status, 400);
  // O nome do usuário é sempre o do cadastro de pessoas.
  const nu = novo.json.find((u) => u.email === 'novo@corrente.org');
  assert.equal((await api('PATCH', '/api/usuarios/' + nu.id, ADMIN, { nome: 'Outro nome' })).status, 400);
  await api('PATCH', '/api/pessoas/' + pNovo.id, ADMIN, { nome: 'Novo Silva' });
  assert.equal((await api('GET', '/api/usuarios', ADMIN)).json.find((u) => u.id === nu.id).nome, 'Novo Silva');
  // Admin root: não precisa de cadastro; os outros perfis precisam.
  const root2 = await api('POST', '/api/usuarios', ADMIN, { email: 'root2@corrente.org', nome: 'Suporte TI', senha: '12345678', papel: 'root' });
  assert.equal(root2.status, 200);
  const r2 = root2.json.find((u) => u.email === 'root2@corrente.org');
  assert.equal((await api('PATCH', '/api/usuarios/' + r2.id, ADMIN, { papel: 'usuario' })).status, 400, 'sem cadastro só pode ser root');
  assert.equal((await api('PATCH', '/api/usuarios/' + r2.id, ADMIN, { nome: 'Suporte' })).json.nome, 'Suporte');
  // No root a pessoa é opcional: pode ligar e desligar.
  const ligado = await api('PATCH', '/api/usuarios/' + r2.id, ADMIN, { pessoaId: nu.pessoaId });
  assert.equal(ligado.status, 400, 'a pessoa do Novo já tem usuário');
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Root Pessoa', funcao: 'senha' });
  const pr = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Root Pessoa');
  const lig = (await api('PATCH', '/api/usuarios/' + r2.id, ADMIN, { pessoaId: pr.id })).json;
  assert.deepEqual([lig.nome, lig.pessoaId, lig.papel], ['Root Pessoa', pr.id, 'root']);
  const des = (await api('PATCH', '/api/usuarios/' + r2.id, ADMIN, { pessoaId: '' })).json;
  assert.equal(des.pessoaId, null, JSON.stringify(des));
  assert.equal((await api('PATCH', '/api/usuarios/' + nu.id, ADMIN, { pessoaId: '' })).status, 400, 'quem não é root não fica sem cadastro');
  const rootCom = await api('POST', '/api/usuarios', ADMIN, { email: 'root3@corrente.org', pessoaId: pr.id, senha: '12345678', papel: 'root' });
  assert.equal(rootCom.json.find((u) => u.email === 'root3@corrente.org').nome, 'Root Pessoa');
  await api('DELETE', '/api/usuarios/' + rootCom.json.find((u) => u.email === 'root3@corrente.org').id, ADMIN);
  await api('DELETE', '/api/usuarios/' + r2.id, ADMIN);

  const eu = (await api('GET', '/api/auth/me', ADMIN)).json;
  assert.equal((await api('PATCH', '/api/usuarios/' + eu.id, ADMIN, { papel: 'usuario' })).status, 400);
  assert.equal((await api('DELETE', '/api/usuarios/' + eu.id, ADMIN)).status, 400);

  const user = novo.json.find((u) => u.email === 'novo@corrente.org');
  const tokNovo = (await api('POST', '/api/auth/entrar', null, { email: 'novo@corrente.org', senha: '12345678' })).json.token;
  assert.equal((await api('GET', '/api/auth/me', tokNovo)).status, 200);
  // Mudar o perfil encerra as sessões abertas daquela pessoa.
  assert.equal((await api('PATCH', '/api/usuarios/' + user.id, ADMIN, { papel: 'admin' })).json.papel, 'admin');
  assert.equal((await api('GET', '/api/auth/me', tokNovo)).status, 401);
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
  assert.equal((await api('GET', '/api/auth/me', outra)).status, 401);
  assert.equal((await api('GET', '/api/auth/me', r.json.token)).status, 200);
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
  // Só entra quem está na lista da corrente; o nome fica sempre como no cadastro.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Dona Maria, Maria, Lúcia', funcao: 'senha' });
  const curto = await api('POST', '/api/auth/entrar', null, { email: ' CPJ ', senha: 'lucia' });
  assert.equal(curto.status, 200, 'também aceita só "cpj"');
  assert.equal(curto.json.usuario.papel, 'corrente');
  assert.equal(curto.json.usuario.nome, 'Lúcia', 'salvo com o nome do cadastro');
  const duvida = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'mari' })).json;
  assert.equal(duvida.confirmar, true);
  assert.equal(duvida.token, undefined, 'na dúvida não entra: pede para confirmar');
  assert.deepEqual(duvida.candidatos, ['Maria', 'Dona Maria']);
  assert.ok((await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Lucya' })).json.candidatos.includes('Lúcia'), 'nome com erro de digitação');
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Zuleica' })).status, 404);
  // Sessão antiga do acesso da corrente (sem a pessoa) pede para entrar de novo.
  const antigo = (await import('../api/_lib/senhas.js'));
  assert.equal((await api('GET', '/api/auth/me', await antigo.emitirTokenCorrente('Lúcia'))).status, 401);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'corrente-cpj', senha: '' })).status, 400);
  const r = await api('POST', '/api/auth/entrar', null, { email: ' Corrente-CPJ ', senha: '  Dona   Maria ' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.usuario.nome, 'Dona Maria');
  assert.equal(r.json.usuario.papel, 'corrente');
  const tok = r.json.token;
  const me = (await api('GET', '/api/auth/me', tok)).json;
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
  const visto = (await api('GET', '/api/ervas', maria)).json.pedidos.pessoas;
  assert.ok(visto.some((p) => p.chave.startsWith('p:') && p.nome === 'Maria'), 'a corrente fica no cadastro da pessoa');
  assert.equal(visto.length, 2);
  assert.deepEqual(visto.map((p) => p.nome).sort(), ['', 'Maria'], 'quem não é admin não vê o nome dos outros');
  assert.equal((await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: guine.id, quantidade: 0 }] })).status, 400);

  // Quem tem conta aparece com o nome cadastrado atual, mesmo se mudar depois.
  const ze = (await api('GET', '/api/usuarios', ADMIN)).json.find((u) => u.email === 'user@corrente.org');
  await api('PATCH', '/api/pessoas/' + ze.pessoaId, ADMIN, { nome: 'José Carlos' });
  e = (await api('GET', '/api/ervas', ADMIN)).json;
  assert.deepEqual(e.pedidos.pessoas.map((p) => p.nome), ['José Carlos', 'Maria']);
  assert.equal(e.pedidos.pessoas.length, 2);
  assert.deepEqual(e.pedidos.pessoas.map((p) => p.frete), [600, 600]);
  assert.equal(e.pedidos.totalGeral, 500 + 750 + 1200, 'cada erva é dividida entre quem a escolheu');

  await api('POST', '/api/ervas', ADMIN, { acao: 'config', aberta: false });
  const fechado = await api('PUT', '/api/ervas', maria, { itens: [] });
  assert.equal(fechado.status, 400);
  assert.match(fechado.json.erro, /fechada/);

  // Pedido escolhendo a pessoa cadastrada (combo): fica no cadastro dela.
  const bru = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Bruno');
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { pessoaId: bru.id }, itens: [{ ervaId: arruda.id, quantidade: 1 }] })).json;
  assert.ok(e.pedidos.pessoas.some((p) => p.chave === 'p:' + bru.id && p.nome === 'Bruno'));
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { chave: 'p:' + bru.id }, itens: [] })).json;
  assert.ok(!e.pedidos.pessoas.some((p) => p.nome === 'Bruno'));
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

test('oferendas: admin cria itens, todos doam até o limite, admin marca entregue', async () => {
  const of = (b, tok = ADMIN) => api('POST', '/api/oferendas', tok, b);
  assert.equal((await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'X', data: '2026-11-07' }, USER)).status, 403);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda de Iemanjá', data: '2026-12-08' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Oferenda de Iemanjá');
  assert.equal(o.responsavel, 'Ana', 'responsável é uma pessoa da corrente');
  assert.equal((await of({ acao: 'salvar', titulo: 'Sem responsável', data: '2026-12-08' })).status, 400);
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Rosas brancas', quantidade: 10, entrega: '' })).json;
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Velas', quantidade: 3, entrega: '2026-12-06' })).json;
  const [rosas, velas] = r.oferendas.find((x) => x.id === o.id).itens;
  assert.equal(rosas.entrega, null, 'sem data = no dia do evento');
  assert.equal(velas.entrega, '2026-12-06');
  const ana = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Ana' })).json.token;
  // Nova oferenda começa "aguardando publicação": a corrente não vê nem doa.
  assert.equal(r.oferendas.find((x) => x.id === o.id).status, 'aguardando');
  assert.ok(!(await api('GET', '/api/oferendas', ana)).json.oferendas.some((x) => x.id === o.id));
  assert.match((await of({ acao: 'doar', itemId: velas.id, quantidade: 1 }, ana)).json.erro, /não está aberta/);
  assert.equal((await of({ acao: 'status', id: o.id, status: 'publicado' }, USER)).status, 403);
  assert.equal((await of({ acao: 'status', id: o.id, status: 'xyz' })).status, 400);
  await of({ acao: 'status', id: o.id, status: 'encerrado' });
  assert.ok(!(await api('GET', '/api/oferendas', ana)).json.oferendas.some((x) => x.id === o.id), 'encerrada não aparece para a corrente');
  // Bloqueada: a corrente vê a oferenda, mas sem os itens, e não doa.
  await of({ acao: 'status', id: o.id, status: 'rascunho' });
  const bloq = (await api('GET', '/api/oferendas', ana)).json.oferendas.find((x) => x.id === o.id);
  assert.deepEqual([bloq.status, bloq.itens.length], ['rascunho', 0]);
  assert.match((await of({ acao: 'doar', itemId: velas.id, quantidade: 1 }, ana)).json.erro, /não está aberta/);
  await of({ acao: 'status', id: o.id, status: 'publicado' });
  assert.ok((await api('GET', '/api/oferendas', ana)).json.oferendas.some((x) => x.id === o.id), 'publicada aparece');
  assert.equal((await of({ acao: 'doar', itemId: velas.id, quantidade: 2 }, ana)).status, 200);
  const passou = await of({ acao: 'doar', itemId: velas.id, quantidade: 2 }, USER);
  assert.equal(passou.status, 400);
  assert.match(passou.json.erro, /Só faltam 1/);
  r = (await of({ acao: 'doar', itemId: velas.id, quantidade: 1 }, USER)).json;
  const v = r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === velas.id);
  assert.deepEqual(v.doacoes.map((d) => [d.nome, d.quantidade]), [['Ana', 2], ['José Carlos', 1]]);
  assert.match((await of({ acao: 'doar', itemId: velas.id, quantidade: 1 }, ADMIN)).json.erro, /completo/);
  // Quem já doou pode diminuir; o admin não pode baixar a quantidade abaixo do prometido.
  assert.equal((await of({ acao: 'doar', itemId: velas.id, quantidade: 1 }, ana)).status, 200);
  assert.equal((await of({ acao: 'item', id: velas.id, nome: 'Velas', quantidade: 1, entrega: '2026-12-06' })).status, 400);
  r = (await of({ acao: 'entregue', id: velas.id, entregue: true })).json;
  assert.equal(r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === velas.id).entregue, true);
  assert.match((await of({ acao: 'doar', itemId: velas.id, quantidade: 0 }, ana)).json.erro, /entregue/);
  assert.equal((await of({ acao: 'entregue', id: velas.id, entregue: true }, USER)).status, 403);
  // Admin registra, muda e exclui a doação de alguém da corrente (mesmo com o item entregue).
  const bruno = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Bruno');
  assert.equal((await of({ acao: 'doarPor', itemId: rosas.id, pessoaId: bruno.id, quantidade: 4 }, USER)).status, 403);
  r = (await of({ acao: 'doarPor', itemId: rosas.id, pessoaId: bruno.id, quantidade: 4 })).json;
  let dr = r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === rosas.id).doacoes;
  assert.deepEqual(dr.map((d) => [d.nome, d.quantidade, d.chave]), [['Bruno', 4, 'p:' + bruno.id]]);
  assert.match((await of({ acao: 'doarPor', itemId: rosas.id, pessoaId: bruno.id, quantidade: 11 })).json.erro, /Só faltam 10/);
  r = (await of({ acao: 'doarPor', itemId: rosas.id, chave: 'p:' + bruno.id, quantidade: 6 })).json;
  dr = r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === rosas.id).doacoes;
  assert.equal(dr[0].quantidade, 6);
  r = (await of({ acao: 'doarPor', itemId: velas.id, chave: 'p:' + (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Ana').id, quantidade: 0 })).json;
  assert.ok(!r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === velas.id).doacoes.some((d) => d.nome === 'Ana'), 'admin exclui mesmo com o item entregue');
  r = (await of({ acao: 'excluir', id: o.id })).json;
  assert.ok(!r.oferendas.some((x) => x.id === o.id));
});

test('ervas: admin passa um pedido com nome errado para uma pessoa da corrente', async () => {
  const lista = (await api('GET', '/api/ervas', ADMIN)).json;
  const erva = lista.ervas[0];
  sql(`insert into ervas_escolhas (pessoa_chave, pessoa_nome, erva_id, quantidade) values ('n:carlinha', 'Carlinha', '${erva.id}', 3)`);
  const carla = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Carla');
  assert.equal((await api('POST', '/api/ervas', USER, { acao: 'reatribuir', chave: 'n:carlinha', pessoaId: carla.id })).status, 403);
  const e = (await api('POST', '/api/ervas', ADMIN, { acao: 'reatribuir', chave: 'n:carlinha', pessoaId: carla.id })).json;
  assert.ok(!e.pedidos.pessoas.some((p) => p.chave === 'n:carlinha'));
  const ped = e.pedidos.pessoas.find((p) => p.chave === 'p:' + carla.id);
  assert.deepEqual([ped.nome, ped.itens[0].quantidade], ['Carla', 3]);
  const tok = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Carla' })).json.token;
  assert.deepEqual((await api('GET', '/api/ervas', tok)).json.minhas, [{ ervaId: erva.id, quantidade: 3 }], 'a Carla vê o pedido ao entrar');
  await api('PUT', '/api/ervas', ADMIN, { para: { chave: 'p:' + carla.id }, itens: [] });
});

test('acesso da corrente: tudo o que a pessoa preencheu aparece quando ela entra', async () => {
  const lista = (await api('GET', '/api/ervas', ADMIN)).json;
  const erva = lista.ervas[0];
  const lucia = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Lúcia');
  // Pedido antigo, gravado com o nome digitado (antes de ligar à pessoa).
  sql(`insert into ervas_escolhas (pessoa_chave, pessoa_nome, erva_id, quantidade) values ('n:lucia', 'lucia', '${erva.id}', 2)`);
  // O admin faz um pedido por ela: vai para o cadastro da pessoa.
  await api('POST', '/api/ervas', ADMIN, { acao: 'config', aberta: true });
  const tok = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'LUCIA' })).json.token;
  const minhas = (await api('GET', '/api/ervas', tok)).json.minhas;
  assert.deepEqual(minhas, [{ ervaId: erva.id, quantidade: 2 }], 'o pedido antigo aparece para ela');
  assert.equal(sql("select count(*) from ervas_escolhas where pessoa_chave = 'n:lucia'"), '0');
  assert.equal(sql(`select count(*) from ervas_escolhas where pessoa_chave = 'p:${lucia.id}'`), '1');
  // Renomear a pessoa não perde o que ela preencheu.
  await api('PATCH', '/api/pessoas/' + lucia.id, ADMIN, { nome: 'Lúcia Helena' });
  const tok2 = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Lúcia Helena' })).json.token;
  assert.deepEqual((await api('GET', '/api/ervas', tok2)).json.minhas, [{ ervaId: erva.id, quantidade: 2 }]);
  assert.equal((await api('GET', '/api/ervas', ADMIN)).json.pedidos.pessoas.find((p) => p.chave === 'p:' + lucia.id).nome, 'Lúcia Helena');
});

test('oferendas: duas pessoas doando o último ao mesmo tempo, só uma consegue', async () => {
  const of = (b, tok = ADMIN) => api('POST', '/api/oferendas', tok, b);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Corrida', data: '2027-03-01' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Corrida');
  await of({ acao: 'status', id: o.id, status: 'publicado' });
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Vela', quantidade: 1, entrega: '' })).json;
  const item = r.oferendas.find((x) => x.id === o.id).itens[0];
  const toks = [];
  for (const n of ['Ana', 'Bruno', 'Carla', 'Diego']) toks.push((await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: n })).json.token);
  const res = await Promise.all(toks.map((t) => of({ acao: 'doar', itemId: item.id, quantidade: 1 }, t)));
  assert.equal(res.filter((x) => x.status === 200).length, 1, 'só uma doação passa');
  for (const x of res.filter((y) => y.status !== 200)) assert.match(x.json.erro, /completo|Só faltam/);
  const fim = (await api('GET', '/api/oferendas', ADMIN)).json.oferendas.find((x) => x.id === o.id).itens[0];
  assert.equal(fim.doacoes.reduce((a, d) => a + d.quantidade, 0), 1, 'nunca passa da quantidade pedida');
  await of({ acao: 'excluir', id: o.id });
});
