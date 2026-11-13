// Testes de integração do backend: rotas reais + Postgres local.
// Rodar: npm test   (precisa de Postgres local; veja test/apoio.js)

import { LINHA_KEYS } from '../shared/regras.js';
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
// Acesso da corrente com senha (PIN): Perfil e Anamnese só abrem para quem já criou a senha.
async function entrarComSenha(nome, pin = '2468') {
  let r = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: nome })).json;
  if (r?.precisaSenha) r = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: nome, pin })).json;
  if (!r?.token) return null;
  const c = await api('POST', '/api/auth/criarSenha', r.token, { senha: pin });
  return c.status === 200 ? c.json.token : r.token;
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
  assert.deepEqual(ok.json.usuario.permissoes, ['pessoas:ler', 'giras:ler', 'pessoas:ver', 'historico:ver', 'escala:completa', 'ervas:escolher', 'oferendas:doar', 'perfil:ver', 'fotos:ver']);
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
  assert.deepEqual(u.json.permissoes, ['pessoas:ler', 'giras:ler', 'pessoas:ver', 'historico:ver', 'escala:completa', 'ervas:escolher', 'oferendas:doar', 'perfil:ver', 'fotos:ver']);
});

test('excluir pessoa: sai das listas, o histórico fica e cadastrar de novo traz de volta', async () => {
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa Que Sai', funcao: 'cambone' });
  const achar = async () => (await api('GET', '/api/pessoas', ADMIN)).json.find((x) => x.nome === 'Pessoa Que Sai');
  const p = await achar();
  const d = '2025-02-01';
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca: { [p.id]: 'f' } });
  assert.equal((await api('DELETE', '/api/pessoas/' + p.id, ADMIN)).status, 200);
  assert.ok((await achar()).saida, 'continua na lista completa, com a data de saída');
  assert.equal((await api('GET', `/api/giras/${d}`, ADMIN)).json.presenca[p.id], 'f', 'a presença antiga fica');
  const login = await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Pessoa Que Sai' });
  assert.equal(login.json.token, undefined, 'quem saiu não entra');
  const volta = await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa Que Sai', funcao: 'senha' });
  assert.equal(volta.json.criadas, 1);
  const depois = await achar();
  assert.equal(depois.id, p.id);
  assert.equal(depois.saida, null);
  assert.equal(depois.funcao, 'senha');
  await api('DELETE', `/api/giras/${d}`, ADMIN);
  await api('DELETE', '/api/pessoas/' + p.id, ADMIN);
});

test('/api/auth/inicio traz a abertura do app em um pedido só', async () => {
  assert.equal((await api('GET', '/api/auth/inicio')).status, 401);
  const r = await api('GET', '/api/auth/inicio', USER);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.me, (await api('GET', '/api/auth/me', USER)).json);
  assert.deepEqual(r.json.pessoas, (await api('GET', '/api/pessoas', USER)).json);
  assert.deepEqual(r.json.giras, (await api('GET', '/api/giras', USER)).json);
  assert.deepEqual(r.json.eventos, (await api('GET', '/api/giras?lista=eventos', USER)).json);
  const atualizar = await api('GET', '/api/auth/inicio?atualizar=1', USER);
  assert.equal(atualizar.json.me, undefined, 'ao voltar para o app, só as listas');
  assert.deepEqual(atualizar.json.pessoas, r.json.pessoas);
  // Com a versão que o app já tem e nada gravado no meio: só "sem mudança".
  assert.ok(r.json.versao);
  const igual = await api('GET', '/api/auth/inicio?atualizar=1&versao=' + encodeURIComponent(r.json.versao), USER);
  assert.deepEqual(igual.json, { versao: r.json.versao, semMudanca: true });
  // Uma gravação muda a versão: a volta seguinte traz as listas de novo.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Versão Nova', funcao: 'senha' });
  const mudou = (await api('GET', '/api/auth/inicio?atualizar=1&versao=' + encodeURIComponent(r.json.versao), USER)).json;
  assert.notEqual(mudou.versao, r.json.versao);
  assert.equal(mudou.semMudanca, undefined);
  assert.ok(mudou.pessoas.some((p) => p.nome === 'Versão Nova'));
  const p = mudou.pessoas.find((x) => x.nome === 'Versão Nova');
  await api('DELETE', '/api/pessoas/' + p.id, ADMIN);
});

test('perfil: cada um vê e salva só o seu; root sem cadastro não tem', async () => {
  const root = (await api('GET', '/api/auth/perfil', ADMIN)).json;
  assert.equal(root.eu, null, 'root sem pessoa não tem perfil próprio');
  assert.ok(root.todos.some((x) => x.nome === 'Zé'), 'admin vê o perfil de todos');
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { perfil: {} })).status, 400);
  const vazio = (await api('GET', '/api/auth/perfil', USER)).json;
  assert.equal(vazio.todos, undefined, 'usuário não vê o dos outros');
  assert.equal(vazio.eu.nome, 'Zé');
  assert.deepEqual(vazio.eu.perfil.orixas.frente, { nome: '', oferenda: false });
  const contato = vazio.contatos.find((x) => x.nome === 'Zé');
  assert.deepEqual(Object.keys(contato).sort(), ['contatoNome', 'contatoTelefone', 'nome', 'pessoaId']);
  assert.equal(contato.contatoNome, vazio.eu.perfil.info.contatoNome);
  assert.equal(contato.contatoTelefone, vazio.eu.perfil.info.contatoTelefone);
  const salvo = await api('POST', '/api/auth/perfil', USER, { perfil: { orixas: { frente: { nome: 'Oxum', oferenda: true } }, guias: { chefe: { linha: 'exu' } }, outros: { caboclo: 'Sete Flechas', x: 'y' } } });
  assert.equal(salvo.status, 200, JSON.stringify(salvo.json));
  const lido = (await api('GET', '/api/auth/perfil', USER)).json.eu.perfil;
  assert.deepEqual((await api('GET', '/api/auth/perfil', ADMIN)).json.todos.find((x) => x.nome === 'Zé').perfil, lido);
  assert.deepEqual(lido.orixas.frente, { nome: 'Oxum', oferenda: true });
  assert.deepEqual(lido.guias.chefe, { linha: 'exu', oferenda: false });
  assert.deepEqual(lido.outros, { caboclo: 'Sete Flechas' });
  // Guias da corrente: todos veem só o guia chefe e o de frente de cada um.
  const gs = (await api('GET', '/api/auth/perfil', USER)).json.guias;
  assert.deepEqual(gs.find((x) => x.nome === 'Zé'), { pessoaId: vazio.eu.pessoaId, nome: 'Zé', chefe: 'exu', frente: '' });
  assert.ok(!JSON.stringify(gs).includes('Sete Flechas'));
  // O perfil não aparece na lista de pessoas (é só de quem é).
  assert.ok(!('perfil' in (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Zé')));
  // Estatísticas do Histórico: só contagens do Perfil (sem nomes).
  const est = await api('GET', '/api/pessoas?lista=perfis', USER);
  assert.equal(est.status, 200);
  assert.ok(est.json.total >= 1);
  assert.ok(est.json.chefe.some((x) => x.nome === 'Exu' && x.qtd >= 1));
  assert.ok(est.json.orixa.some((x) => x.nome === 'Oxum' && x.qtd >= 1));
  assert.ok(!JSON.stringify(est.json).includes('Zé'));
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
  await api('PATCH', '/api/pessoas/' + julia.id, ADMIN, { linhas: LINHA_KEYS }); // Todas: atua em todas as giras nos próximos testes
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
  // gira nova: não encerra com presença pendente
  const pend = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar', atendimentos: { preferencial: 0, normal: 0, passe: 0 } });
  assert.equal(pend.status, 409);
  assert.match(pend.json.erro || pend.json.message || JSON.stringify(pend.json), /pendente/);
  const todos = Object.fromEntries(ps.map((p) => [p.id, 'p']));
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca: todos });
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar' })).status, 400, 'precisa informar os atendimentos');
  const r = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar', atendimentos: { preferencial: 4, normal: 30, passe: 12 } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.gira.encerrada, true);
  assert.deepEqual(r.json.gira.atendimentos, { preferencial: 4, normal: 30, passe: 12 });
  const pr = r.json.gira.presenca;
  // Suporte agora é a função do dia (papeis); a presença continua Presente.
  for (const n of ['Fábio', 'Gabi', 'Kátia']) { assert.equal(r.json.gira.papeis[id(n)], 'sup', n + ' devia ir para o Suporte'); assert.equal(pr[id(n)], 'p'); }
  // gira nova: quem estava pendente fica como presente ao encerrar
  assert.equal(r.json.gira.pendentePadrao, true);
  for (const n of ['Elisa', 'Helena', 'Ana', 'Bruno', 'Igor']) assert.equal(pr[id(n)], 'p', n + ' continua presente');
  assert.match(r.json.mensagem, /Suporte/);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'X' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}/sortear`, ADMIN)).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}/remanejar`, ADMIN)).status, 409);
  // Ao reabrir, quem foi para o Suporte ao encerrar volta a Presente.
  const re = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'reabrir' });
  assert.equal(re.json.gira.encerrada, false);
  for (const n of ['Fábio', 'Gabi', 'Kátia']) { assert.equal(re.json.gira.presenca[id(n)], 'p', n + ' devia voltar a Presente'); assert.equal(re.json.gira.papeis[id(n)], undefined); }
  assert.match(re.json.mensagem, /Voltaram do Suporte/);
  assert.equal(re.json.gira.retrato, null, 'reaberta, volta a seguir o cadastro');
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo' })).status, 200);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('encerrado não muda com o cadastro; excluído sem nada aberto é apagado de vez', async () => {
  const d = '2027-03-06';
  // Entrada hoje: giras abertas de antes (de outros testes) não seguram a pessoa.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Retrato Rita', funcao: 'cambone', entradaHoje: true });
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const rita = ps.find((p) => p.nome === 'Retrato Rita');
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca: Object.fromEntries(ps.map((p) => [p.id, 'p'])) });
  const enc = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar', atendimentos: { preferencial: 0, normal: 0, passe: 0 } });
  assert.equal(enc.status, 200, JSON.stringify(enc.json));
  assert.deepEqual(enc.json.gira.retrato[rita.id], { nome: 'Retrato Rita', funcao: 'cambone', experiente: false, linhas: [], limpeza: null, licenca: null });

  // Depois de encerrada: nome, função e licença mudam no cadastro; a gira continua como estava.
  assert.equal((await api('PATCH', '/api/pessoas/' + rita.id, ADMIN, { nome: 'Rita Renomeada', funcao: 'medium' })).status, 200);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'licenca', pessoaId: rita.id, inicio: d, fim: d });
  const g = (await api('GET', `/api/giras/${d}`, ADMIN)).json;
  assert.deepEqual(g.retrato[rita.id], enc.json.gira.retrato[rita.id]);
  // Na lista (vai inteira para o app), o retrato vai só com o que difere do cadastro.
  const naLista = (await api('GET', '/api/giras', ADMIN)).json.find((x) => x.data === d);
  assert.deepEqual(naLista.retrato[rita.id], { nome: 'Retrato Rita', funcao: 'cambone', licenca: null });

  // Excluída e sem nada aberto: apagada de vez; a gira encerrada continua com ela pelo retrato.
  assert.equal((await api('DELETE', '/api/pessoas/' + rita.id, ADMIN)).status, 200);
  assert.equal(sql(`select count(*) from pessoas where id = '${rita.id}'`), '0', 'apagada do banco');
  const g2 = (await api('GET', `/api/giras/${d}`, ADMIN)).json;
  assert.equal(g2.presenca[rita.id], 'p', 'a presença fica');
  assert.equal(g2.retrato[rita.id].nome, 'Retrato Rita');
  assert.equal((await api('GET', '/api/giras', ADMIN)).json.find((x) => x.data === d).retrato[rita.id].nome, 'Retrato Rita', 'apagada vai completa na lista');

  // Oferenda encerrada guarda os nomes: renomear não muda; o aluno excluído é apagado e continua nela.
  const turmaId = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas[0].id;
  const al = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Retrato', turmaId })).json.alunos.find((a) => a.nome === 'Aluno Retrato');
  const of = (await api('POST', '/api/oferendas', ADMIN, {
    acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda retrato', data: '2038-06-01', porMedium: true, grupos: ['alunos'],
  })).json.oferendas.find((o) => o.titulo === 'Oferenda retrato');
  await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: 'a:' + al.id, pagamento: 'pago' });
  assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'status', id: of.id, status: 'encerrado' })).status, 200);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: al.id, nome: 'Aluno Renomeado' });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: al.id });
  assert.equal(sql(`select count(*) from alunos where id = '${al.id}'`), '0', 'aluno apagado do banco');
  const fechada = (await api('GET', '/api/oferendas', ADMIN)).json.oferendas.find((o) => o.id === of.id);
  const linha = fechada.mediuns.find((m) => m.pessoaId === 'a:' + al.id);
  assert.deepEqual([linha.nome, linha.pagamento], ['Aluno Retrato', 'pago']);
  // Reabrir a oferenda apaga o retrato (quem foi apagado sai dela).
  const aberta = (await api('POST', '/api/oferendas', ADMIN, { acao: 'status', id: of.id, status: 'publicado' })).json.oferendas.find((o) => o.id === of.id);
  assert.ok(!aberta.mediuns.some((m) => m.pessoaId === 'a:' + al.id));
  await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: of.id });
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('licença: fora do sorteio entre início e fim; só admin cadastra', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const bruno = ps.find((p) => p.nome === 'Bruno');
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-01', fim: '2027-02-28' })).status, 403);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-28', fim: '2027-02-01' })).status, 400);
  const lista = (await api('POST', '/api/pessoas', ADMIN, { acao: 'licenca', pessoaId: bruno.id, inicio: '2027-02-01', fim: '2027-02-28', motivo: '  Férias  ' })).json;
  const lic = lista.find((p) => p.id === bruno.id).licencas;
  assert.deepEqual(lic.map((l) => [l.inicio, l.fim, l.motivo]), [['2027-02-01', '2027-02-28', 'Férias']]);
  const dentro = (await api('POST', '/api/giras/2027-02-13/sortear', ADMIN)).json.gira;
  assert.ok(!dentro.pares.some((p) => p.m === bruno.id || p.c === bruno.id), 'de licença não entra no sorteio');
  const fora = (await api('POST', '/api/giras/2027-03-06/sortear', ADMIN)).json.gira;
  assert.ok(fora.pares.some((p) => p.m === bruno.id), 'depois da licença volta ao sorteio');
  const ed = (await api('POST', '/api/pessoas', ADMIN, { acao: 'editarLicenca', id: lic[0].id, inicio: '2027-02-01', fim: '2027-03-10' })).json;
  assert.equal(ed.find((p) => p.id === bruno.id).licencas[0].fim, '2027-03-10');
  assert.equal(ed.find((p) => p.id === bruno.id).licencas[0].motivo, 'Férias', 'editar sem motivo mantém o motivo');
  const ed2 = (await api('POST', '/api/pessoas', ADMIN, { acao: 'editarLicenca', id: lic[0].id, inicio: '2027-02-01', fim: '2027-03-10', motivo: 'Gravidez' })).json;
  assert.equal(ed2.find((p) => p.id === bruno.id).licencas[0].motivo, 'Gravidez');
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

test('oferendas: Detalhes da sub-aba — só o admin escreve, todos leem', async () => {
  const of = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'abaDetalhes', ...b });
  const abas = (await api('GET', '/api/oferendas', ADMIN)).json.abas;
  const gerais = abas.find((a) => a.nome === 'Gerais');
  assert.equal(gerais.detalhes, '');
  assert.equal((await of(USER, { id: gerais.id, detalhes: 'Oi' })).status, 403);
  assert.equal((await of(ADMIN, { id: gerais.id, detalhes: Array(11).fill('linha').join('\n') })).status, 400, 'mais de 10 linhas');
  assert.equal((await of(ADMIN, { id: gerais.id })).status, 400);
  const r = await of(ADMIN, { id: gerais.id, detalhes: '\nRoupa branca.  \r\nChegar 19h\n' });
  assert.equal(r.status, 200);
  assert.equal(r.json.abas.find((a) => a.id === gerais.id).detalhes, 'Roupa branca.\nChegar 19h');
  assert.equal((await api('GET', '/api/oferendas', USER)).json.abas.find((a) => a.id === gerais.id).detalhes, 'Roupa branca.\nChegar 19h');
  assert.equal((await of(ADMIN, { id: gerais.id, detalhes: '' })).json.abas.find((a) => a.id === gerais.id).detalhes, '');
});

test('iemanjá: Detalhes do evento — só os admins do evento escrevem, quem vê o evento lê', async () => {
  const iem = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'iemanja', ...b });
  const ev = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json.eventos.find((e) => !e.encerradoEm);
  assert.equal(ev.detalhes, '');
  assert.equal((await iem(USER, { op: 'detalhes', id: ev.id, detalhes: 'Oi' })).status, 403);
  assert.equal((await iem(ADMIN, { op: 'detalhes', id: ev.id, detalhes: Array(11).fill('x').join('\n') })).status, 400, 'mais de 10 linhas');
  const r = await iem(ADMIN, { op: 'detalhes', id: ev.id, detalhes: 'Roupa branca.  \nPraia às 6h\n' });
  assert.equal(r.status, 200);
  assert.equal(r.json.eventos.find((e) => e.id === ev.id).detalhes, 'Roupa branca.\nPraia às 6h');
  await iem(ADMIN, { op: 'visivel', id: ev.id, visivel: true });
  assert.equal((await api('GET', '/api/oferendas?lista=iemanja', USER)).json.eventos.find((e) => e.id === ev.id).detalhes, 'Roupa branca.\nPraia às 6h');
  await iem(ADMIN, { op: 'visivel', id: ev.id, visivel: ev.visivel });
  assert.equal((await iem(ADMIN, { op: 'detalhes', id: ev.id, detalhes: '' })).json.eventos.find((e) => e.id === ev.id).detalhes, '');
});

test('iemanjá: cada pessoa do grupo vem com a lista dela (a turma do aluno)', async () => {
  const iem = (b) => api('POST', '/api/oferendas', ADMIN, { acao: 'iemanja', ...b });
  const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  const al = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno da Praia', turmaId: t09 })).json.alunos.find((a) => a.nome === 'Aluno da Praia');
  const ev = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json.eventos.find((e) => !e.encerradoEm);
  const g = ev.grupos[0];
  const r = await iem({ op: 'adicionar', grupoId: g.id, chave: 'a:' + al.id });
  assert.equal(r.status, 200);
  assert.equal(r.json.eventos.find((e) => e.id === ev.id).grupos[0].membros.find((m) => m.chave === 'a:' + al.id).lista, 'Turma 09');
  await iem({ op: 'retirar', grupoId: g.id, chave: 'a:' + al.id });
});

test('curimba: alunos da corrente e de fora, aulas e presença; o aluno vê as próprias aulas', async () => {
  assert.equal((await api('GET', '/api/pessoas?lista=curimba', USER)).status, 403);
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'curimbaAluno', nome: 'X' })).status, 403);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Aluna Curimba', funcao: 'senha' });
  const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Aluna Curimba');
  await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'cur@corrente.org', senha: 'senha-forte-9', papel: 'admin_curimba' });
  const cur = (await api('POST', '/api/auth/entrar', null, { email: 'cur@corrente.org', senha: 'senha-forte-9' })).json.token;
  assert.equal((await api('GET', '/api/pessoas?lista=minhaCurimba', cur)).json?.aulas, undefined, 'ainda não é aluna');
  let C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', pessoaId: pe.id })).json;
  assert.equal((await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', pessoaId: pe.id })).status, 400, 'já é aluna');
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', nome: 'Visitante de Fora' })).json;
  assert.equal(C.alunos.length, 2);
  assert.equal(C.alunos.find((a) => a.nome === 'Aluna Curimba').pessoaId, pe.id);
  assert.equal((await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', nome: 'visitante de fora' })).status, 400, 'nome repetido');
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaAula', data: '2026-03-07', nome: 'Toques' })).json;
  assert.equal((await api('POST', '/api/pessoas', cur, { acao: 'curimbaAula', data: '2026-03-07' })).status, 400, 'uma aula por dia');
  const aula = C.aulas[0];
  const [eu, fora] = [C.alunos.find((a) => a.pessoaId), C.alunos.find((a) => !a.pessoaId)];
  await api('POST', '/api/pessoas', cur, { acao: 'curimbaPresenca', aulaId: aula.id, alunoId: eu.id, status: 'p' });
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaPresenca', aulaId: aula.id, alunoId: fora.id, status: 'f' })).json;
  assert.equal(C.presencas.length, 2);
  assert.equal((await api('POST', '/api/pessoas', cur, { acao: 'curimbaPresenca', aulaId: aula.id, alunoId: eu.id, status: 'a' })).status, 400);
  assert.deepEqual((await api('GET', '/api/pessoas?lista=minhaCurimba', cur)).json.aulas, [{ data: '2026-03-07', nome: 'Toques', status: 'p' }]);
  assert.equal((await api('GET', '/api/pessoas?lista=curimba', ADMIN)).status, 200, 'o root vê');
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaPresenca', aulaId: aula.id, alunoId: fora.id, status: '' })).json;
  assert.equal(C.presencas.length, 1, 'vazio tira a marcação');
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaExcluirAula', id: aula.id })).json;
  assert.equal(C.presencas.length, 0, 'excluir a aula leva as presenças');
  for (const a of C.alunos) C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaExcluirAluno', id: a.id })).json;
  assert.equal(C.alunos.length, 0);
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
  assert.equal((await api('POST', '/api/giras/2027-05-01/sortear', pelaConta.token)).status, 200, 'admin sorteia');
  await api('DELETE', '/api/giras/2027-05-01', ADMIN);
  // A aba Usuários é só do admin root.
  assert.equal((await api('GET', '/api/usuarios', pelaConta.token)).status, 403);
  // O nome no lugar do e-mail não serve para entrar como admin.
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'Admin Pessoa', senha: 'senha-forte-9' })).status, 401);
  const u = (await api('GET', '/api/usuarios', ADMIN)).json.find((x) => x.email === 'adm2@corrente.org');
  await api('DELETE', '/api/usuarios/' + u.id, ADMIN);
});

test('gestão de usuários: só admin root, com travas', async () => {
  assert.equal((await api('GET', '/api/usuarios', USER)).status, 403);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Novo', funcao: 'senha' });
  const pNovo = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Novo');
  const novo = await api('POST', '/api/usuarios', ADMIN, { email: 'Novo@Corrente.org', pessoaId: pNovo.id, senha: '12345678', papel: 'usuario' });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.length, 6, "root, Zé, admin oferendas, admin ervas, admin curimba e o novo");
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

test('acessos alunos e curimba: nome do cadastro, dados restritos e eventos sem avisos', async () => {
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluna da CPJ, Outra Aluna' });
  const turmaAlunos = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  const aluna = turmaAlunos.alunos.find((x) => x.nome === 'Aluna da CPJ');
  const loginAluna = await api('POST', '/api/auth/entrar', null, { email: 'alunos', senha: 'aluna da cpj' });
  assert.equal(loginAluna.status, 200, JSON.stringify(loginAluna.json));
  assert.equal(loginAluna.json.usuario.grupo, 'alunos');
  const meusAlunos = await api('GET', '/api/pessoas?lista=alunos', loginAluna.json.token);
  assert.deepEqual(meusAlunos.json.alunos.map((x) => x.id), [aluna.id]);
  assert.equal((await api('GET', '/api/pessoas', loginAluna.json.token)).status, 403);
  assert.equal((await api('GET', '/api/giras', loginAluna.json.token)).status, 403);
  assert.equal((await api('GET', '/api/giras?lista=eventos', loginAluna.json.token)).status, 200);
  assert.equal((await api('GET', '/api/giras?lista=oracoes', loginAluna.json.token)).status, 403);
  assert.equal((await api('POST', '/api/auth/senha', loginAluna.json.token, { atual: 'x', nova: 'senha-forte-1' })).status, 403);
  assert.equal((await api('POST', '/api/giras', loginAluna.json.token, { acao: 'oracao', texto: 'Oração de teste' })).status, 403);

  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaAluno', nome: 'Aluna de Curimba' });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaAluno', nome: 'Outra Aluna de Curimba' });
  const curimba = (await api('GET', '/api/pessoas?lista=curimba', ADMIN)).json;
  const minha = curimba.alunos.find((x) => x.nome === 'Aluna de Curimba');
  const aula = await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaAula', data: '2034-05-10', nome: 'Toques' });
  const aulaId = aula.json.aulas.find((x) => x.data === '2034-05-10').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaPresenca', aulaId, alunoId: minha.id, status: 'p' });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaPresenca', aulaId, alunoId: curimba.alunos.find((x) => x.nome === 'Outra Aluna de Curimba').id, status: 'f' });
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2034-05-11', nome: 'Aviso interno', tipo: 'aviso' });
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2034-05-12', nome: 'Festa da casa', tipo: 'evento' });
  const loginCurimba = await api('POST', '/api/auth/entrar', null, { email: 'curimba', senha: 'aluna de curimba' });
  assert.equal(loginCurimba.status, 200, JSON.stringify(loginCurimba.json));
  assert.equal(loginCurimba.json.usuario.grupo, 'curimba');
  const minhasAulas = await api('GET', '/api/pessoas?lista=minhaCurimba', loginCurimba.json.token);
  assert.deepEqual(minhasAulas.json.aulas, [{ data: '2034-05-10', nome: 'Toques', status: 'p' }]);
  const eventos = await api('GET', '/api/giras?lista=eventos', loginCurimba.json.token);
  assert.equal(eventos.status, 200);
  assert.ok(eventos.json.some((x) => x.nome === 'Festa da casa'));
  assert.ok(!eventos.json.some((x) => x.tipo === 'aviso'));
  assert.equal((await api('GET', '/api/giras?lista=oracoes', loginCurimba.json.token)).status, 403);
  assert.equal((await api('GET', '/api/pessoas?lista=curimba', loginCurimba.json.token)).status, 403);
  assert.equal((await api('GET', '/api/giras', loginCurimba.json.token)).status, 403);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'ervas', senha: 'qualquer nome' })).status, 401);
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
  // Bloco Compra: quantidade e preço de cada erva de uma vez; o cadastro sem preço mantém o preço.
  const compra = (b, tok = ADMIN) => api('POST', '/api/ervas', tok, { acao: 'salvarCompra', gira: 'Gira de Caboclo', data: '2026-11-07', frete: '12', ...b });
  assert.equal((await compra({ itens: [] }, USER)).status, 403);
  assert.equal((await compra({ itens: [{ id: arruda.id, quantidade: -1, preco: '' }] })).status, 400);
  e = (await compra({ itens: [{ id: arruda.id, quantidade: 4, preco: '5,00' }, { id: guine.id, quantidade: 0, preco: 7.5 }] })).json;
  assert.deepEqual([arruda.id, guine.id].map((id) => e.ervas.find((x) => x.id === id)).map((x) => [x.qtdCompra, x.preco]), [[4, 5], [0, 7.5]]);
  e = (await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', id: arruda.id, nome: 'Arruda' })).json;
  assert.equal(e.ervas.find((x) => x.id === arruda.id).preco, 5);
  // Pessoas por porção (vazio = uma porção atende todos); sem o campo, o cadastro mantém.
  const serve = (v) => api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', id: arruda.id, nome: 'Arruda', pessoasPorcao: v });
  assert.equal((await serve(0)).status, 400);
  assert.equal((await serve('6')).json.ervas.find((x) => x.id === arruda.id).pessoasPorcao, 6);
  assert.equal(e.ervas.find((x) => x.id === arruda.id).pessoasPorcao ?? null, null);
  assert.equal((await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', id: arruda.id, nome: 'Arruda' })).json.ervas.find((x) => x.id === arruda.id).pessoasPorcao, 6);
  assert.equal((await serve('')).json.ervas.find((x) => x.id === arruda.id).pessoasPorcao, null);
  // Volta a quantidade para 0: daqui em diante cada erva custa uma porção.
  e = (await compra({ itens: [{ id: arruda.id, quantidade: 0, preco: '5,00' }, { id: guine.id, quantidade: 0, preco: 7.5 }] })).json;

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
  // Lista fechada: nem o admin altera pedidos, Compra ou cadastro; só reabre (ou começa nova compra).
  const admFechado = [
    await api('PUT', '/api/ervas', ADMIN, { para: { nome: 'Dona Rosa' }, itens: [{ ervaId: arruda.id, quantidade: 1 }] }),
    await api('POST', '/api/ervas', ADMIN, { acao: 'salvarCompra', gira: '', data: '', frete: '12', itens: [] }),
    await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', id: arruda.id, nome: 'Arruda' }),
    await api('POST', '/api/ervas', ADMIN, { acao: 'excluirErva', id: guine.id }),
    await api('POST', '/api/ervas', ADMIN, { acao: 'config', frete: '1' }),
  ];
  assert.deepEqual(admFechado.map((x) => x.status), [400, 400, 400, 400, 400]);
  assert.match(admFechado[0].json.erro, /fechada/);
  assert.equal((await api('POST', '/api/ervas', ADMIN, { acao: 'config', aberta: true })).json.aberta, true);

  // Pedido escolhendo a pessoa cadastrada (combo): fica no cadastro dela.
  const bru = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Bruno');
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { pessoaId: bru.id }, itens: [{ ervaId: arruda.id, quantidade: 1 }] })).json;
  assert.ok(e.pedidos.pessoas.some((p) => p.chave === 'p:' + bru.id && p.nome === 'Bruno'));
  e = (await api('PUT', '/api/ervas', ADMIN, { para: { chave: 'p:' + bru.id }, itens: [] })).json;
  assert.ok(!e.pedidos.pessoas.some((p) => p.nome === 'Bruno'));
  // Admin faz o pedido de outra pessoa; o mesmo nome da corrente é a mesma pessoa.
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
  assert.equal(e.ervas[0].qtdCompra, 0, 'nova compra zera as quantidades da compra');
});

test('ervas: encerrar a compra guarda no histórico e começa uma nova', async () => {
  const H = () => api('GET', '/api/ervas?lista=historico', ADMIN);
  assert.equal((await api('GET', '/api/ervas?lista=historico', USER)).status, 403);
  const antes = (await H()).json.length;
  // Sem pedidos nem quantidade na compra: não há o que guardar.
  assert.equal((await api('POST', '/api/ervas', ADMIN, { acao: 'encerrarCompra' })).status, 400);
  let e = (await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', nome: 'Alfazema' })).json;
  const alf = e.ervas.find((x) => x.nome === 'Alfazema');
  await api('POST', '/api/ervas', ADMIN, { acao: 'salvarCompra', gira: 'Gira de Exu', data: '2026-11-14', frete: '60', itens: [{ id: alf.id, quantidade: 0, preco: '30' }] });
  await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: alf.id, quantidade: 1 }] });
  assert.equal((await api('POST', '/api/ervas', USER, { acao: 'encerrarCompra' })).status, 403);
  e = (await api('POST', '/api/ervas', ADMIN, { acao: 'encerrarCompra' })).json;
  assert.equal(e.pedidos.pessoas.length, 0, 'a nova compra começa sem pedidos');
  assert.equal(e.aberta, true);
  const hs = (await H()).json;
  assert.equal(hs.length, antes + 1);
  const c = hs[0];
  assert.deepEqual([c.gira, c.data], ['Gira de Exu', '2026-11-14']);
  assert.deepEqual(c.resumo.compra.map((x) => [x.nome, x.corrente, x.pedido, x.valor]), [['Alfazema', 1, 1, 3000]]);
  assert.equal(c.resumo.totalCompra, 3000 + 6000);
  assert.equal(c.resumo.pessoas.length, 1);
  assert.equal(c.resumo.totalCobranca, 9000);
  await api('POST', '/api/ervas', ADMIN, { acao: 'excluirErva', id: alf.id });
});

test('ervas: fechar a lista guarda a compra atual no histórico; reabrir e fechar atualiza; descartar tira', async () => {
  const H = async () => (await api('GET', '/api/ervas?lista=historico', ADMIN)).json;
  const cfg = (aberta) => api('POST', '/api/ervas', ADMIN, { acao: 'config', aberta });
  const antes = (await H()).length;
  let e = (await api('POST', '/api/ervas', ADMIN, { acao: 'salvarErva', nome: 'Manjericão' })).json;
  const man = e.ervas.find((x) => x.nome === 'Manjericão');
  await api('POST', '/api/ervas', ADMIN, { acao: 'salvarCompra', gira: '', data: '', frete: '60', itens: [{ id: man.id, quantidade: 0, preco: '10' }] });
  await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: man.id, quantidade: 1 }] });
  await cfg(false);
  let hs = await H();
  assert.equal(hs.length, antes + 1, 'fechar guardou');
  assert.equal(hs[0].atual, true, 'é a compra atual');
  assert.equal(hs[0].resumo.compra[0].valor, 1000);
  // Reabre (a compra continua na tela), muda o preço e fecha de novo: atualiza a mesma linha.
  e = (await cfg(true)).json;
  assert.equal(e.pedidos.pessoas.length, 1, 'reaberta, o pedido continua');
  await api('POST', '/api/ervas', ADMIN, { acao: 'salvarCompra', gira: '', data: '', frete: '60', itens: [{ id: man.id, quantidade: 0, preco: '12' }] });
  await cfg(false);
  hs = await H();
  assert.equal(hs.length, antes + 1, 'não duplicou');
  assert.equal(hs[0].resumo.compra[0].valor, 1200);
  // Descartar tira do histórico.
  await api('POST', '/api/ervas', ADMIN, { acao: 'novaCompra' });
  assert.equal((await H()).length, antes);
  // Fechar e depois encerrar: fica uma linha só, que deixa de ser a atual.
  await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: man.id, quantidade: 1 }] });
  await cfg(false);
  await api('POST', '/api/ervas', ADMIN, { acao: 'encerrarCompra' });
  hs = await H();
  assert.equal(hs.length, antes + 1);
  assert.equal(hs[0].atual, false);
  // Mesmo nome de gira e mesma data de uma compra do histórico (ex.: reabriu e alterou): atualiza aquela, não repete.
  const encerrada = hs[0];
  await api('PUT', '/api/ervas', USER, { itens: [{ ervaId: man.id, quantidade: 2 }] });
  assert.equal((await cfg(false)).status, 200);
  hs = await H();
  assert.equal(hs.length, antes + 1, 'não repetiu nome + data');
  assert.equal(hs[0].id, encerrada.id, 'atualizou a mesma linha');
  assert.equal(hs[0].atual, true);
  assert.equal(hs[0].resumo.compra[0].corrente, 2);
  // Mudar o nome da compra atual (reabrindo): a mesma linha do histórico muda de nome.
  await cfg(true);
  await api('POST', '/api/ervas', ADMIN, { acao: 'salvarCompra', gira: 'Gira de Oxóssi', data: '2026-12-05', frete: '60', itens: [{ id: man.id, quantidade: 0, preco: '12' }] });
  await cfg(false);
  assert.equal((await H()).length, antes + 1, 'a compra atual mudou de nome: continua uma linha só');
  assert.equal((await H())[0].gira, 'Gira de Oxóssi');
  await api('POST', '/api/ervas', ADMIN, { acao: 'novaCompra' });
  await api('POST', '/api/ervas', ADMIN, { acao: 'excluirErva', id: man.id });
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
  assert.equal((await api('GET', '/api/oferendas', ADMIN)).json.oferendas.find((x) => x.id === o.id).publicada, true, 'fica marcada como publicada');
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

test('turma da limpeza: na pessoa e na gira (1 a 7)', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const lista = Array.isArray(ps) ? ps : ps.pessoas;
  const p = lista[0];
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { limpeza: 8 })).status, 400);
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, USER, { limpeza: 3 })).status, 403);
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { limpeza: 3 })).json.limpeza, 3);
  const depois = (await api('GET', '/api/pessoas', ADMIN)).json;
  assert.equal((Array.isArray(depois) ? depois : depois.pessoas).find((x) => x.id === p.id).limpeza, 3);
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { limpeza: null })).json.limpeza, null);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { limpeza: 0 })).status, 400);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { limpeza: 5 })).json.limpeza, 5);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { entidade: 'Exu' })).json.limpeza, 5, 'outros campos não apagam a turma');
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { limpeza: null })).json.limpeza, null);
  // orixá: só os da lista
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { orixa: 'Fulano' })).status, 400);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { orixa: 'Oxóssi' })).json.orixa, 'Oxóssi');
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { orixa: '' })).json.orixa, '');
  // gira encerrada: a turma ainda pode mudar, o resto não (nem o orixá)
  await api('PUT', '/api/giras/2028-01-05', ADMIN, { presenca: Object.fromEntries(lista.map((x) => [x.id, 'p'])) });
  assert.equal((await api('POST', '/api/giras/2028-01-05', ADMIN, { acao: 'encerrar', atendimentos: { preferencial: 0, normal: 0, passe: 0 } })).status, 200);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { limpeza: 6 })).json.limpeza, 6);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { limpeza: 6, entidade: 'Caboclo' })).status, 409);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', USER, { limpeza: 2 })).status, 403);
  assert.equal((await api('PUT', '/api/giras/2028-01-05', ADMIN, { orixa: 'Oxóssi' })).status, 409);
});

test('apelidos de entidade: root configura e a gira preserva o nome ligado à linha', async () => {
  const apelidos = [{ nome: 'Caboclo de Pena', linha: 'caboclo' }];
  const salvo = await api('POST', '/api/giras', ADMIN, { acao: 'entidadesApelidos', apelidos });
  assert.equal(salvo.status, 200, JSON.stringify(salvo.json));
  assert.deepEqual(salvo.json, apelidos);
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'entidadesApelidos', apelidos: [] })).status, 403);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'entidadesApelidos', apelidos: [{ nome: 'Caboclo', linha: 'caboclo' }] })).status, 400);
  const data = '2032-01-02';
  const criada = await api('PUT', '/api/giras/' + data, ADMIN, { entidade: 'Caboclo', entidadeNome: 'Caboclo de Pena' });
  assert.equal(criada.status, 200, JSON.stringify(criada.json));
  assert.equal(criada.json.entidade, 'Caboclo');
  assert.equal(criada.json.entidadeNome, 'Caboclo de Pena');
  const listada = (await api('GET', '/api/giras', USER)).json.find((g) => g.data === data);
  assert.equal(listada.entidade, 'Caboclo', 'as regras continuam usando a linha canônica');
  assert.equal(listada.entidadeNome, 'Caboclo de Pena');
  assert.deepEqual((await api('GET', '/api/giras?lista=entidades', USER)).json, apelidos);
  // Nome da gira escrito pelo admin: todos veem; só quem edita a gira altera.
  const comTitulo = await api('PUT', '/api/giras/' + data, ADMIN, { titulo: '  Festa   de Oxóssi ' });
  assert.equal(comTitulo.status, 200, JSON.stringify(comTitulo.json));
  assert.equal(comTitulo.json.titulo, 'Festa de Oxóssi');
  assert.equal((await api('GET', '/api/giras', USER)).json.find((g) => g.data === data).titulo, 'Festa de Oxóssi');
  assert.equal((await api('PUT', '/api/giras/' + data, USER, { titulo: 'x' })).status, 403);
  assert.equal((await api('PUT', '/api/giras/' + data, ADMIN, { titulo: 'x'.repeat(121) })).status, 400);
  assert.equal((await api('PUT', '/api/giras/' + data, ADMIN, { titulo: '' })).json.titulo, '');
});

test('oferendas: uma linha para cada médium, admin marca a situação', async () => {
  const ps0 = (await api('GET', '/api/pessoas', ADMIN)).json;
  const ps = Array.isArray(ps0) ? ps0 : ps0.pessoas;
  const mediuns = ps;   // todos os cadastrados
  assert.ok(mediuns.length >= 1);
  const r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'salvar', responsavelId: RESP(), titulo: 'Por médium', data: '2029-03-03', porMedium: true })).json;
  const of = r.oferendas.find((o) => o.titulo === 'Por médium');
  assert.equal(of.porMedium, true);
  assert.deepEqual(of.mediuns.map((m) => m.pessoaId).sort(), mediuns.map((p) => p.id).sort(), 'todos os cadastrados');
  assert.ok(of.mediuns.every((m) => m.pagamento === 'nao_pago' && m.entrega === 'pendente'), 'começa Não pago e Pendente');
  const m0 = of.mediuns[0];
  assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: m0.pessoaId, pagamento: 'talvez' })).status, 400);
  assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: m0.pessoaId, entrega: 'pago' })).status, 400);
  assert.equal((await api('POST', '/api/oferendas', USER, { acao: 'medium', oferendaId: of.id, pessoaId: m0.pessoaId, pagamento: 'pago' })).status, 403);
  // As duas conferências são separadas: mudar uma não mexe na outra.
  await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: m0.pessoaId, pagamento: 'pago' });
  const r2 = (await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: m0.pessoaId, entrega: 'entregue' })).json;
  const l0 = r2.oferendas.find((o) => o.id === of.id).mediuns.find((m) => m.pessoaId === m0.pessoaId);
  assert.deepEqual([l0.pagamento, l0.entrega], ['pago', 'entregue']);
  // tirar um médium da lista: some, e não volta com "Incluir novos médiuns"
  const m1 = of.mediuns[1];
  assert.equal((await api('POST', '/api/oferendas', USER, { acao: 'excluirMedium', oferendaId: of.id, pessoaId: m1.pessoaId })).status, 403);
  const rx = (await api('POST', '/api/oferendas', ADMIN, { acao: 'excluirMedium', oferendaId: of.id, pessoaId: m1.pessoaId })).json;
  assert.ok(!rx.oferendas.find((o) => o.id === of.id).mediuns.some((m) => m.pessoaId === m1.pessoaId));
  // médium cadastrado depois entra com "Incluir novos médiuns"; quem já estava continua igual
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Médium Novo Oferenda', funcao: 'extra' });
  const r3 = (await api('POST', '/api/oferendas', ADMIN, { acao: 'atualizarMediuns', id: of.id })).json;
  const of3 = r3.oferendas.find((o) => o.id === of.id);
  assert.equal(of3.mediuns.length, mediuns.length, '+1 novo, -1 tirado');
  assert.ok(!of3.mediuns.some((m) => m.pessoaId === m1.pessoaId), 'quem foi tirado não volta');
  assert.equal(of3.mediuns.find((m) => m.pessoaId === m0.pessoaId).pagamento, 'pago');
  // sem a opção, a oferenda não tem linhas de médium
  const r4 = (await api('POST', '/api/oferendas', ADMIN, { acao: 'salvar', responsavelId: RESP(), titulo: 'Sem médium', data: '2029-03-04' })).json;
  const of4 = r4.oferendas.find((o) => o.titulo === 'Sem médium');
  assert.equal(of4.porMedium, false);
  assert.deepEqual(of4.mediuns, []);
});

test('curimba: cadastro e turma da limpeza', async () => {
  const r = (await api('POST', '/api/pessoas', ADMIN, { nome: 'Tambor Um, Tambor Dois', funcao: 'curimba' })).json;
  const cs = r.pessoas.filter((p) => p.funcao === 'curimba');
  assert.ok(cs.length >= 2);
  assert.equal((await api('PATCH', '/api/pessoas/' + cs[0].id, ADMIN, { limpeza: 4 })).json.limpeza, 4);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { nome: 'X', funcao: 'tambor' })).status, 400);
});

test('reiniciar gira em aberto: volta tudo ao início, só a data fica', async () => {
  const d = '2029-06-06';
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo', orixa: 'Oxóssi', limpeza: 2, presenca: { [ps[0].id]: 'a' } });
  await api('POST', `/api/giras/${d}/sortear`, ADMIN);
  assert.equal((await api('POST', `/api/giras/${d}`, USER, { acao: 'reiniciar' })).status, 403);
  const r = (await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'reiniciar' })).json;
  assert.equal(r.gira.entidade, '');
  assert.equal(r.gira.orixa, '');
  // volta com a próxima turma do rodízio (ou vazia, se ninguém tiver turma)
  const pss = (await api('GET', '/api/pessoas', ADMIN)).json;
  const temTurma = pss.some((x) => x.limpeza);
  assert.equal(r.gira.limpeza === null, !temTurma);
  assert.deepEqual(r.gira.presenca, {});
  assert.deepEqual(r.gira.pares, []);
  assert.equal(r.gira.pendentePadrao, true);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('cancelar o sorteio: apaga as duplas (também as fixadas); com a escala publicada, recusa', async () => {
  const d = '2029-06-13';
  await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo', orixa: 'Oxóssi' });
  const s1 = (await api('POST', `/api/giras/${d}/sortear`, ADMIN)).json.gira;
  assert.ok(s1.pares.length > 0, 'sorteou');
  await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'publicar' });
  assert.equal((await api('POST', `/api/giras/${d}`, USER, { acao: 'cancelarSorteio' })).status, 403);
  // Escala publicada: sorteio, gira, orixá, Evento e data ficam como estão.
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'cancelarSorteio' })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Exu' })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { orixa: 'Ogum' })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { evento: true })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'mudarData', para: '2029-06-14' })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo', orixa: 'Oxóssi', evento: false })).status, 200, 'o mesmo valor passa');
  await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'publicar', publicada: false });
  const r = (await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'cancelarSorteio' })).json;
  assert.deepEqual(r.gira.pares, []);
  assert.deepEqual(r.gira.passes || [], []);
  assert.equal(r.gira.publicada, false);
  assert.equal(r.gira.entidade, 'Caboclo', 'o resto da gira fica');
  assert.equal((await api('POST', '/api/giras/2029-06-20', ADMIN, { acao: 'cancelarSorteio' })).status, 404);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('mudar a data da gira: leva presença, duplas e o resto para a data nova', async () => {
  const d = '2029-07-04', nova = '2029-07-11', ocupada = '2029-07-18';
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'Caboclo', orixa: 'Oxóssi', limpeza: 3, presenca: { [ps[0].id]: 'a' } });
  const sorteada = (await api('POST', `/api/giras/${d}/sortear`, ADMIN)).json.gira;
  await api('PUT', `/api/giras/${ocupada}`, ADMIN, { entidade: 'Baiano' });
  assert.equal((await api('POST', `/api/giras/${d}`, USER, { acao: 'mudarData', para: nova })).status, 403);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'mudarData', para: '2029-02-30' })).status, 400);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'mudarData', para: ocupada })).status, 409);
  assert.equal((await api('POST', '/api/giras/2029-07-25', ADMIN, { acao: 'mudarData', para: nova })).status, 404);
  const r = (await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'mudarData', para: nova })).json;
  assert.equal(r.gira.data, nova);
  assert.equal(r.gira.entidade, 'Caboclo');
  assert.equal(r.gira.orixa, 'Oxóssi');
  assert.equal(r.gira.limpeza, 3);
  assert.equal(r.gira.presenca[ps[0].id], 'a');
  assert.deepEqual(r.gira.pares, sorteada.pares);
  assert.equal((await api('GET', `/api/giras/${d}`, ADMIN)).json.entidade, '', 'a data antiga ficou vazia');
  await api('DELETE', `/api/giras/${nova}`, ADMIN);
  await api('DELETE', `/api/giras/${ocupada}`, ADMIN);
});

test('mudar a data: gira encerrada não muda', async () => {
  const d = '2029-08-01';
  await api('PUT', `/api/giras/${d}`, ADMIN, { atendimentos: { preferencial: 1, normal: 2, passe: 3 }, encerrada: true });
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'mudarData', para: '2029-08-08' })).status, 409);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('entrada na corrente: só o admin root altera', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const p = ps[0];
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { entrada: '2026-02-30' })).status, 400);
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { entrada: '2026-03-01' })).json.entrada, '2026-03-01');
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, USER, { entrada: '2026-03-01' })).status, 403);
  assert.equal((await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { entrada: null })).json.entrada, null);
});

test('reiniciar: a turma da limpeza volta para a próxima do rodízio', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const comTurma = ps.filter((p) => p.limpeza);
  for (const p of comTurma) await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { limpeza: null });
  await api('PATCH', '/api/pessoas/' + ps[0].id, ADMIN, { limpeza: 3 });
  await api('PATCH', '/api/pessoas/' + ps[1].id, ADMIN, { limpeza: 6 });
  await api('PUT', '/api/giras/2030-01-02', ADMIN, { entidade: 'Exu', limpeza: 3, encerrada: true });
  await api('PUT', '/api/giras/2030-01-09', ADMIN, { entidade: 'Caboclo', limpeza: 1 });
  const r = (await api('POST', '/api/giras/2030-01-09', ADMIN, { acao: 'reiniciar' })).json;
  assert.equal(r.gira.limpeza, 6, 'depois da 3 vem a 6 (4 e 5 vazias)');
  assert.match(r.mensagem, /Turma 6/);
  for (const d of ['2030-01-02', '2030-01-09']) await api('DELETE', '/api/giras/' + d, ADMIN);
  await api('PATCH', '/api/pessoas/' + ps[0].id, ADMIN, { limpeza: null });
  await api('PATCH', '/api/pessoas/' + ps[1].id, ADMIN, { limpeza: null });
  for (const p of comTurma) await api('PATCH', '/api/pessoas/' + p.id, ADMIN, { limpeza: p.limpeza });
});

test('perfis no banco: o root cria um perfil, marca as abas e as permissões valem na hora', async () => {
  const perfis = (await api('GET', '/api/usuarios?lista=perfis', ADMIN)).json;
  assert.ok(['root', 'admin', 'usuario', 'admin_oferendas', 'admin_ervas', 'admin_curimba', 'admin_perfil', 'corrente'].every((k) => perfis.some((f) => f.chave === k)));
  assert.equal((await api('GET', '/api/usuarios?lista=perfis', USER)).status, 403);
  const criado = (await api('POST', '/api/usuarios', ADMIN, { acao: 'perfil', nome: 'Admin giras', abas: { gira: { editar: true } } })).json;
  const ag = criado.find((f) => f.nome === 'Admin giras');
  assert.deepEqual(ag.abas.gira, { ver: true, editar: true }, 'editar inclui ver');
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'perfil', nome: 'admin giras' })).status, 400, 'nome repetido');
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Gil Giras', funcao: 'senha' });
  const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Gil Giras');
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'gil@corrente.org', senha: 'senha-forte-9', papel: ag.chave })).status, 200);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'gil2@corrente.org', senha: 'senha-forte-9', papel: 'corrente' })).status, 400, 'corrente não é perfil de usuário');
  const gil = (await api('POST', '/api/auth/entrar', null, { email: 'gil@corrente.org', senha: 'senha-forte-9' })).json.token;
  const me = (await api('GET', '/api/auth/me', gil)).json;
  assert.equal(me.papelNome, 'Admin giras');
  assert.ok(me.permissoes.includes('giras:sortear') && !me.permissoes.includes('historico:ver'));
  assert.equal((await api('GET', '/api/ervas', gil)).status, 403);
  // O root libera Ervas: vale na próxima chamada, sem entrar de novo.
  await api('POST', '/api/usuarios', ADMIN, { acao: 'perfil', chave: ag.chave, abas: { gira: { editar: true }, ervas: { ver: true } } });
  assert.equal((await api('GET', '/api/ervas', gil)).status, 200);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'perfil', chave: 'root', abas: {} })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'excluirPerfil', chave: 'admin' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'excluirPerfil', chave: ag.chave })).status, 400, 'ainda tem usuário');
  const gilU = (await api('GET', '/api/usuarios', ADMIN)).json.find((u) => u.email === 'gil@corrente.org');
  await api('DELETE', '/api/usuarios/' + gilU.id, ADMIN);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'excluirPerfil', chave: ag.chave })).status, 200);
});

test('senha da corrente (PIN): cria uma vez, o login passa a pedir, o root troca', async () => {
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Penha Pin', funcao: 'medium' });
  const entrar = (corpo) => api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Penha Pin', ...corpo });
  const t1 = (await entrar()).json.token;
  assert.ok(t1);
  assert.equal((await api('GET', '/api/auth/me', t1)).json.temSenha, false);
  assert.equal((await api('POST', '/api/auth/criarSenha', t1, { senha: '12' })).status, 400);
  assert.equal((await api('POST', '/api/auth/criarSenha', t1, { senha: 'abcd' })).status, 400);
  assert.equal((await api('POST', '/api/auth/criarSenha', ADMIN, { senha: '1234' })).status, 400, 'só o acesso da corrente');
  const c = await api('POST', '/api/auth/criarSenha', t1, { senha: '4321' });
  assert.equal(c.status, 200);
  assert.equal((await api('GET', '/api/auth/me', t1)).status, 401, 'a sessão antiga caiu');
  const t2 = c.json.token;
  assert.equal((await api('GET', '/api/auth/me', t2)).json.temSenha, true);
  assert.equal((await api('POST', '/api/auth/criarSenha', t2, { senha: '9999' })).status, 400, 'só cria uma vez');
  assert.deepEqual((await entrar()).json, { precisaSenha: true, nome: 'Penha Pin' });
  assert.equal((await entrar({ pin: '0000' })).status, 401);
  assert.ok((await entrar({ pin: '4321' })).json.token);
  // Root vê quem tem senha (sem a senha) e troca.
  const lista = (await api('GET', '/api/usuarios?lista=senhas', ADMIN)).json;
  const pe = lista.find((x) => x.nome === 'Penha Pin');
  assert.equal(pe.temSenha, true);
  assert.ok(!JSON.stringify(lista).includes('scrypt'));
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pin', pessoaId: pe.pessoaId, senha: '12a4' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', USER, { acao: 'pin', pessoaId: pe.pessoaId, senha: '5555' })).status, 403);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pin', pessoaId: pe.pessoaId, senha: '55556666' })).status, 200);
  assert.equal((await entrar({ pin: '4321' })).status, 401);
  assert.ok((await entrar({ pin: '55556666' })).json.token);
});

test('alunos da CPJ: turmas 09 a 11, fora da corrente; admin oferendas cadastra alunos mas não a corrente', async () => {
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  assert.deepEqual(A.turmas.map((t) => t.nome), ['Turma 09', 'Turma 10', 'Turma 11']);
  assert.equal((await api('GET', '/api/pessoas?lista=alunos', USER)).status, 403);
  const t10 = A.turmas.find((t) => t.nome === 'Turma 10').id;
  const r = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Um, Aluno Dois', turmaId: t10 })).json;
  assert.equal(r.criadas, 2);
  assert.ok(r.alunos.filter((a) => ['Aluno Um', 'Aluno Dois'].includes(a.nome)).every((a) => a.turmaId === t10));
  // Não entram na corrente.
  assert.ok(!(await api('GET', '/api/pessoas', ADMIN)).json.some((p) => p.nome === 'Aluno Um'));
  const t12 = (await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', nome: 'Turma 12' })).json.turmas.find((t) => t.nome === 'Turma 12');
  assert.ok(t12);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', nome: 'turma 12' })).status, 400);
  // Renomear: mesmo id, nome novo; nome de outra turma não pode.
  const ren = (await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', id: t12.id, nome: 'Turma 12 B' })).json.turmas;
  assert.equal(ren.find((t) => t.id === t12.id).nome, 'Turma 12 B');
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', id: t12.id, nome: 'Turma 10' })).status, 400);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', id: t12.id, nome: 'Turma 12' });
  // Admin oferendas: alunos sim, corrente não.
  const of = (await api('POST', '/api/auth/entrar', null, { email: 'of@corrente.org', senha: 'senha-forte-9' })).json.token;
  const me = (await api('GET', '/api/auth/me', of)).json;
  assert.ok(me.permissoes.includes('alunos:editar') && !me.permissoes.includes('pessoas:ver'));
  const um = r.alunos.find((a) => a.nome === 'Aluno Um');
  assert.equal((await api('POST', '/api/pessoas', of, { acao: 'aluno', id: um.id, turmaId: t12.id })).status, 200);
  assert.equal((await api('POST', '/api/pessoas', of, { nome: 'Corrente Nova', funcao: 'medium' })).status, 403);
  const fim = (await api('POST', '/api/pessoas', of, { acao: 'excluirAluno', id: um.id })).json;
  assert.ok(!fim.alunos.some((a) => a.id === um.id));
  const turma13 = (await api('POST', '/api/pessoas', ADMIN, { acao: 'turma', nome: 'Turma 13' })).json.turmas.find((t) => t.nome === 'Turma 13');
  const alunoTurma13 = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Turma Treze', turmaId: turma13.id })).json;
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'excluirTurma', id: turma13.id })).status, 403);
  const removida = (await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirTurma', id: turma13.id })).json;
  assert.ok(!removida.turmas.some((t) => t.id === turma13.id));
  assert.equal(removida.alunos.find((a) => a.nome === 'Aluno Turma Treze').turmaId, null);
  assert.ok(alunoTurma13.alunos.some((a) => a.nome === 'Aluno Turma Treze'), 'o aluno permanece cadastrado');
});

test('promover aluno para CPJ como Cambone mantém o acesso e preserva o histórico de oferendas', async () => {
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  const turmaId = A.turmas.find((t) => t.nome === 'Turma 09').id;
  const criado = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Transferido Cambone', turmaId })).json;
  const aluno = criado.alunos.find((a) => a.nome === 'Aluno Transferido Cambone');
  const acessoAluno = await api('POST', '/api/auth/entrar', null, { email: 'alunos', senha: aluno.nome });
  assert.equal(acessoAluno.status, 200);
  const oferta = (await api('POST', '/api/oferendas', ADMIN, {
    acao: 'salvar', responsavelId: RESP(), titulo: 'Histórico aluno transferido', data: '2038-05-01', porMedium: true, grupos: ['alunos'],
  })).json.oferendas.find((o) => o.titulo === 'Histórico aluno transferido');
  let r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: oferta.id, pessoaId: 'a:' + aluno.id, pagamento: 'pago', entrega: 'entregue' })).json;
  let atual = r.oferendas.find((o) => o.id === oferta.id);
  const item = (await api('POST', '/api/oferendas', ADMIN, { acao: 'item', oferendaId: oferta.id, nome: 'Flores', quantidade: 2, entrega: '' })).json.oferendas.find((o) => o.id === oferta.id).itens[0];
  await api('POST', '/api/oferendas', ADMIN, { acao: 'doarPor', itemId: item.id, pessoaId: 'a:' + aluno.id, quantidade: 1 });

  const of = (await api('POST', '/api/auth/entrar', null, { email: 'of@corrente.org', senha: 'senha-forte-9' })).json.token;
  assert.equal((await api('POST', '/api/pessoas', of, { acao: 'promoverAlunoCPJ', id: aluno.id })).status, 403);
  const transferido = await api('POST', '/api/pessoas', ADMIN, { acao: 'promoverAlunoCPJ', id: aluno.id });
  assert.equal(transferido.status, 200, JSON.stringify(transferido.json));
  assert.ok(!transferido.json.alunos.some((a) => a.id === aluno.id));
  const pessoa = transferido.json.pessoas.find((p) => p.nome === aluno.nome);
  assert.equal(pessoa.funcao, 'cambone');
  assert.equal((await api('GET', '/api/pessoas?lista=alunos', acessoAluno.json.token)).status, 401, 'a sessão antiga de aluno é encerrada');
  // O acesso alunos deixa de funcionar (pode sugerir outros alunos de nome parecido, mas não ele).
  const comoAluno = (await api('POST', '/api/auth/entrar', null, { email: 'alunos', senha: aluno.nome })).json;
  assert.ok(!comoAluno?.token && !comoAluno?.candidatos?.includes(aluno.nome), JSON.stringify(comoAluno));
  const acessoCPJ = await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: aluno.nome });
  assert.equal(acessoCPJ.status, 200, JSON.stringify(acessoCPJ.json));
  assert.equal(acessoCPJ.json.usuario.papel, 'corrente');
  assert.equal(acessoCPJ.json.usuario.nome, aluno.nome, 'o mesmo nome de acesso é mantido');

  atual = (await api('GET', '/api/oferendas', ADMIN)).json.oferendas.find((o) => o.id === oferta.id);
  const membro = atual.mediuns.find((m) => m.pessoaId === pessoa.id);
  assert.deepEqual([membro.pagamento, membro.entrega], ['pago', 'entregue']);
  const doacao = atual.itens[0].doacoes.find((d) => d.chave === 'p:' + pessoa.id);
  assert.equal(doacao.quantidade, 1);
  await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: oferta.id });
});

test('oferenda 100% há mais de um dia: só o responsável altera; o card mostra o percentual', async () => {
  const of = (b, tok = ADMIN) => api('POST', '/api/oferendas', tok, b);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda Completa', data: '2027-03-01' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Oferenda Completa');
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Flores', quantidade: 2, entrega: '' })).json;
  const item = r.oferendas.find((x) => x.id === o.id).itens[0];
  await of({ acao: 'status', id: o.id, status: 'publicado' });
  const ana = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Ana' })).json.token;   // a responsável
  r = (await of({ acao: 'doar', itemId: item.id, quantidade: 1 }, USER)).json;
  let x = r.oferendas.find((y) => y.id === o.id);
  assert.equal(x.completaEm, null);
  const { percentualDoado } = await import('../shared/oferendas.js');
  assert.equal(percentualDoado(x), 50);
  r = (await of({ acao: 'doar', itemId: item.id, quantidade: 1 }, ana)).json;
  x = r.oferendas.find((y) => y.id === o.id);
  assert.ok(x.completaEm, 'marcou quando ficou completa');
  assert.equal(x.fechada, false, 'no primeiro dia ainda dá para alterar');
  assert.equal(percentualDoado(x), 100);
  // Passou um dia.
  sql(`update oferendas set completa_em = now() - interval '25 hours' where id = '${o.id}'`);
  const tentar = await of({ acao: 'doar', itemId: item.id, quantidade: 0 }, USER);
  assert.equal(tentar.status, 400);
  assert.match(tentar.json.erro, /fechadas.*responsável \(Ana\)/);
  assert.equal((await api('GET', '/api/oferendas', USER)).json.oferendas.find((y) => y.id === o.id).fechada, true);
  // A responsável altera; continua fechada mesmo sem estar mais 100%.
  r = (await of({ acao: 'doar', itemId: item.id, quantidade: 0 }, ana)).json;
  x = r.oferendas.find((y) => y.id === o.id);
  assert.equal(x.fechada, true);
  assert.equal((await of({ acao: 'doar', itemId: item.id, quantidade: 1 }, USER)).status, 400);
  // O admin ainda corrige pelo "doação por alguém".
  assert.equal((await of({ acao: 'doarPor', itemId: item.id, pessoaId: RESP(), quantidade: 1 })).status, 200);
  await of({ acao: 'excluir', id: o.id });
});

test('ervas: com a aba desligada, só quem administra entra', async () => {
  const publicar = (publicada, tok = ADMIN) => api('POST', '/api/ervas', tok, { acao: 'publicar', publicada });
  assert.equal((await publicar(false, USER)).status, 403);
  assert.equal((await publicar(false)).json.publicada, false);
  assert.equal((await api('GET', '/api/ervas', USER)).status, 403);
  assert.equal((await api('GET', '/api/ervas', ADMIN)).status, 200);
  assert.equal((await publicar(true)).json.publicada, true);
  assert.equal((await api('GET', '/api/ervas', USER)).status, 200);
});

test('a própria pessoa escolhe a entidade que vai atender em gira com mais de uma linha', async () => {
  const d = '2099-02-04';
  const anaId = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Ana').id;
  const ana = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Ana' })).json.token;
  const escolher = (linha) => api('POST', '/api/giras/' + d, ana, { acao: 'minhaEntidade', linha });
  assert.equal((await escolher('exu')).status, 404, 'gira ainda não criada');
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Exus & Pombagira' });
  const r = await escolher('exu');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.gira.atende[anaId], 'exu');
  assert.equal((await escolher('caboclo')).status, 400, 'fora das linhas desta gira');
  assert.equal((await escolher('')).json.gira.atende[anaId], undefined, 'pode tirar a escolha');
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Caboclo' });
  assert.equal((await escolher('exu')).status, 400, 'gira de uma linha só não tem escolha');
  await api('DELETE', '/api/giras/' + d, ADMIN);
});

test('acesso da corrente declara a própria ausência (Pendente → Ausente) até a véspera', async () => {
  const d = '2099-01-07';
  const ausencia = (tok, data = d) => api('POST', '/api/giras/' + data, tok, { acao: 'ausencia' });
  const ana = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Ana' })).json.token;
  assert.equal((await ausencia(ana)).status, 404, 'gira ainda não criada');
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Caboclo' });
  assert.equal((await ausencia(USER)).status, 403, 'só pelo acesso da corrente');
  const r = await ausencia(ana);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.gira.presenca[RESP()], 'a');
  assert.equal((await ausencia(ana)).status, 400, 'já está ausente: só a Michelle muda');
  // Outras presenças não mudam.
  assert.equal(Object.keys(r.json.gira.presenca).length, 1);
  // Depois que o admin marcou a presença (qualquer status), só o admin muda.
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const outra = ps.find((p) => p.id !== RESP() && p.funcao !== 'curimba' && p.nome === 'Bruno');
  const bruno = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Bruno' })).json.token;
  await api('PUT', '/api/giras/' + d, ADMIN, { presenca: { [RESP()]: 'a', [outra.id]: 'p' } });
  const bloq = await ausencia(bruno);
  assert.equal(bloq.status, 400, 'admin já marcou');
  assert.match(bloq.json.erro, /já foi definida/);
  // No dia (ou depois) não pode mais.
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await api('PUT', '/api/giras/' + hoje, ADMIN, { entidade: 'Baiano' });
  const noDia = await ausencia(ana, hoje);
  assert.equal(noDia.status, 400);
  assert.match(noDia.json.erro, /dia anterior/);
  for (const x of [d, hoje]) await api('DELETE', '/api/giras/' + x, ADMIN);
});

test('eventos: o admin cadastra, edita e exclui; todos leem', async () => {
  const r = await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2027-05-13', nome: '  Festa   dos Pretos Velhos ', tipo: 'evento' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const ev = r.json.find((e) => e.nome === 'Festa dos Pretos Velhos');
  assert.equal(ev.data, '2027-05-13');
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'evento', data: '2027-05-13', nome: 'X', tipo: 'evento' })).status, 403);
  const ana = (await api('POST', '/api/auth/entrar', null, { email: 'cpj', senha: 'Ana' })).json.token;
  assert.ok((await api('GET', '/api/giras?lista=eventos', ana)).json.some((e) => e.id === ev.id), 'a corrente vê os eventos');
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '13/05', nome: 'X', tipo: 'evento' })).status, 400);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2027-05-13', nome: 'X', tipo: 'festa' })).status, 400);
  const ed = (await api('POST', '/api/giras', ADMIN, { acao: 'evento', id: ev.id, data: '2027-05-14', nome: 'Festa', tipo: 'amaci' })).json;
  assert.equal(ed.find((e) => e.id === ev.id).data, '2027-05-14');
  assert.equal(ed.find((e) => e.id === ev.id).tipo, 'amaci');
  const fim = (await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: ev.id })).json;
  assert.ok(!fim.some((e) => e.id === ev.id));
});

test('perfil: a própria pessoa salva só as informações; outra pessoa, só o admin', async () => {
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const ana = ps.find((p) => p.nome === 'Ana').id;
  const outra = ps.find((p) => p.nome !== 'Ana').id;
  const tok = await entrarComSenha('Ana');
  const antes = (await api('GET', '/api/auth/perfil', tok)).json.eu.perfil;
  const r = await api('POST', '/api/auth/perfil', tok, { pessoaId: ana, info: { contatoNome: 'Dona Lia' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.perfil.info.contatoNome, 'Dona Lia');
  assert.deepEqual(r.json.perfil.orixas, antes.orixas, 'o resto do perfil fica igual');
  assert.equal((await api('POST', '/api/auth/perfil', tok, { pessoaId: outra, info: { contatoNome: 'X' } })).status, 403);
});

test('perfil: admin ajusta a data de nascimento de outra pessoa (Ajustes)', async () => {
  const ana = RESP();
  const r = await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { nascimento: '1990-10-31' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.perfil.info.nascimento, '1990-10-31');
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { nascimento: '2999-01-01' } })).status, 400);
  assert.equal((await api('POST', '/api/auth/perfil', USER, { pessoaId: ana, info: { nascimento: '1990-10-31' } })).status, 403);
  const r2 = await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { celular: '11987654321', contatoNome: 'Mãe', contatoTelefone: '1134567890' } });
  assert.deepEqual(r2.json.perfil.info, { nome: '', nascimento: '1990-10-31', celular: '11987654321', contatoNome: 'Mãe', contatoTelefone: '1134567890' }, 'só muda o que veio');
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { celular: '123' } })).status, 400);
  // O resto do perfil não muda.
  const todos = (await api('GET', '/api/auth/perfil', ADMIN)).json.todos;
  assert.equal(todos.find((t) => t.pessoaId === ana).perfil.info.nascimento, '1990-10-31');
});

test('perfil: afinidade com as entidades por função (extra, passe, cambone)', async () => {
  const add = async (nome, funcao) => {
    await api('POST', '/api/pessoas', ADMIN, { nome, funcao });
    return entrarComSenha(nome);
  };
  const passe = await add('Paula Passe', 'passe');
  const camb = await add('Caio Cambone', 'cambone');
  const med = await add('Mara Medium', 'medium');
  const eu = (await api('GET', '/api/auth/perfil', passe)).json.eu;
  assert.equal(eu.funcao, 'passe');
  // Passe: o bloco Passe vai para as linhas do cadastro (vale no sorteio); o de atendimento extra fica à parte.
  let r = (await api('POST', '/api/auth/perfil', passe, { acao: 'afinidade', tipo: 'passe', linhas: ['caboclo', 'exu'] })).json;
  assert.deepEqual(r.linhas, ['caboclo', 'exu']);
  r = (await api('POST', '/api/auth/perfil', passe, { acao: 'afinidade', tipo: 'extra', linhas: ['baiano'] })).json;
  assert.deepEqual([r.linhas, r.afinidadeExtra], [['caboclo', 'exu'], ['baiano']]);
  assert.deepEqual((await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Paula Passe').linhas, ['caboclo', 'exu']);
  // Cambone: só o bloco Passe (guardado à parte; o cadastro não muda).
  r = (await api('POST', '/api/auth/perfil', camb, { acao: 'afinidade', tipo: 'passe', linhas: ['eres'] })).json;
  assert.deepEqual([r.afinidadePasse, r.linhas], [['eres'], []]);
  assert.equal((await api('POST', '/api/auth/perfil', camb, { acao: 'afinidade', tipo: 'extra', linhas: ['eres'] })).status, 400);
  assert.equal((await api('POST', '/api/auth/perfil', med, { acao: 'afinidade', tipo: 'passe', linhas: [] })).status, 400, 'médium não tem esses blocos');
  assert.equal((await api('POST', '/api/auth/perfil', passe, { acao: 'afinidade', tipo: 'passe', linhas: ['xyz'] })).status, 400);
});

test('escala: o sorteio só aparece para todos depois de publicado', async () => {
  const d = '2099-02-04';
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Caboclo' });
  const s = await api('POST', `/api/giras/${d}/sortear`, ADMIN);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  const adm = (await api('GET', '/api/giras/' + d, ADMIN)).json;
  assert.equal(adm.publicada, false);
  assert.ok(adm.pares.length > 0, 'admin vê o sorteio');
  const ana = await entrarComSenha('Ana');
  for (const t of [USER, ana]) {
    assert.deepEqual((await api('GET', '/api/giras/' + d, t)).json.pares, [], 'antes de publicar, ninguém mais vê');
    assert.deepEqual((await api('GET', '/api/giras', t)).json.find((g) => g.data === d).pares, []);
  }
  assert.equal((await api('POST', '/api/giras/' + d, USER, { acao: 'publicar' })).status, 403);
  const pub = await api('POST', '/api/giras/' + d, ADMIN, { acao: 'publicar' });
  assert.equal(pub.json.gira.publicada, true);
  assert.equal((await api('GET', '/api/giras/' + d, ana)).json.pares.length, adm.pares.length);
  await api('POST', '/api/giras/' + d, ADMIN, { acao: 'publicar', publicada: false });
  assert.deepEqual((await api('GET', '/api/giras/' + d, ana)).json.pares, []);
  await api('DELETE', '/api/giras/' + d, ADMIN);
});

test('evento na gira: remove limpeza e escala, e bloqueia operações de escala', async () => {
  const d = '2099-02-11';
  const pessoas = (await api('GET', '/api/pessoas', ADMIN)).json;
  const id = (nome) => pessoas.find((p) => p.nome === nome).id;
  const pares = [{ m: id('Ana'), c: id('Elisa') }];
  const passes = [{ m: id('Ana'), c: id('Helena') }];

  const criada = await api('PUT', `/api/giras/${d}`, ADMIN, {
    entidade: 'Caboclo', limpeza: 3, pares, passes,
  });
  assert.equal(criada.status, 200, JSON.stringify(criada.json));
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'publicar' })).status, 200);
  // Com a escala publicada, não vira evento; ocultando a escala, pode.
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { evento: true, entidade: 'Festa' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'publicar', publicada: false })).status, 200);

  const evento = await api('PUT', `/api/giras/${d}`, ADMIN, { evento: true, entidade: 'Festa' });
  assert.equal(evento.status, 200, JSON.stringify(evento.json));
  assert.equal(evento.json.evento, true);
  assert.equal(evento.json.entidade, 'Festa', 'o checkbox pode salvar junto com outro campo pendente');
  assert.equal(evento.json.limpeza, null, 'evento não mantém turma da limpeza');
  assert.deepEqual(evento.json.pares, [], 'evento não mantém escala');
  assert.deepEqual(evento.json.passes, [], 'evento não mantém passes');
  assert.equal(evento.json.publicada, false, 'a escala deixa de ser publicada');
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { participantes: 12.5 })).status, 400, 'participantes devem ser inteiros');
  const comParticipantes = await api('PUT', `/api/giras/${d}`, ADMIN, { participantes: 27 });
  assert.equal(comParticipantes.status, 200, JSON.stringify(comParticipantes.json));
  assert.equal(comParticipantes.json.participantes, 27);
  assert.deepEqual((await api('GET', `/api/giras/${d}`, USER)).json.pares, []);
  assert.deepEqual((await api('GET', `/api/giras/${d}`, USER)).json.passes, []);

  assert.equal((await api('POST', `/api/giras/${d}/sortear`, ADMIN)).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}/remanejar`, ADMIN)).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'publicar' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'cancelarSorteio' })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { pares })).status, 409);
  assert.equal((await api('PUT', `/api/giras/${d}`, ADMIN, { limpeza: 4 })).status, 409);

  const normal = await api('PUT', `/api/giras/${d}`, ADMIN, { evento: false });
  assert.equal(normal.status, 200, JSON.stringify(normal.json));
  assert.equal(normal.json.evento, false);
  assert.equal(normal.json.limpeza, null, 'desmarcar evento não restaura turma removida');
  assert.deepEqual(normal.json.pares, [], 'desmarcar evento não restaura escala removida');
  assert.deepEqual(normal.json.passes, []);
  assert.deepEqual((await api('GET', `/api/giras/${d}`, USER)).json.pares, [], 'a escala segue privada até ser publicada de novo');

  await api('PUT', `/api/giras/${d}`, ADMIN, { evento: true });
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca: Object.fromEntries(pessoas.map((p) => [p.id, 'p'])) });
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar' })).status, 400, 'evento exige informar o total de participantes');
  const encerrado = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'encerrar', participantes: 31 });
  assert.equal(encerrado.status, 200, JSON.stringify(encerrado.json));
  assert.equal(encerrado.json.gira.participantes, 31);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});

test('oferenda por pessoa: escolhe os grupos (funções e alunos); doação por aluno', async () => {
  const of = (b) => api('POST', '/api/oferendas', ADMIN, b);
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  if (!A.alunos.length) await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluna Oferenda', turmaId: A.turmas[0].id });
  const alunos = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos;
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  assert.equal((await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Grupos', data: '2029-05-05', porMedium: true, grupos: ['xyz'] })).status, 400);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Grupos', data: '2029-05-05', porMedium: true, grupos: ['cambone', 'alunos'] })).json;
  let o = r.oferendas.find((x) => x.titulo === 'Grupos');
  const cambones = ps.filter((p) => p.funcao === 'cambone');
  assert.deepEqual(o.grupos, ['cambone', 'alunos']);
  // "Exibir no resumo": começa desligado; só o admin liga.
  assert.equal(o.noResumo, false);
  assert.equal((await of({ acao: 'resumo', id: o.id, noResumo: 'sim' })).status, 400);
  assert.equal((await api('POST', '/api/oferendas', USER, { acao: 'resumo', id: o.id, noResumo: true })).status, 403);
  assert.equal((await of({ acao: 'resumo', id: o.id, noResumo: true })).json.oferendas.find((x) => x.id === o.id).noResumo, true);
  assert.equal(o.mediuns.filter((m) => !m.aluno).length, cambones.length, 'só os cambones da corrente');
  assert.equal(o.mediuns.filter((m) => m.aluno).length, alunos.length, 'e todos os alunos');
  const la = o.mediuns.find((m) => m.aluno);
  assert.ok(la.pessoaId.startsWith('a:'));
  r = (await of({ acao: 'medium', oferendaId: o.id, pessoaId: la.pessoaId, pagamento: 'pago' })).json;
  assert.equal(r.oferendas.find((x) => x.id === o.id).mediuns.find((m) => m.pessoaId === la.pessoaId).pagamento, 'pago');
  // "Incluir novos cadastrados" respeita os grupos.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Médium Fora do Grupo', funcao: 'medium' });
  r = (await of({ acao: 'atualizarMediuns', id: o.id })).json;
  assert.ok(!r.oferendas.find((x) => x.id === o.id).mediuns.some((m) => m.nome === 'Médium Fora do Grupo'));
  // Quem é cadastrado depois num grupo da oferenda entra sozinho ao ler a lista.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Cambone Novo Oferenda', funcao: 'cambone' });
  const lidas = (await api('GET', '/api/oferendas', ADMIN)).json.oferendas.find((x) => x.id === o.id).mediuns;
  assert.ok(lidas.some((m) => m.nome === 'Cambone Novo Oferenda'), 'novo cambone entra sozinho');
  assert.ok(!lidas.some((m) => m.nome === 'Médium Fora do Grupo'), 'quem não é dos grupos continua fora');
  r = (await of({ acao: 'excluirMedium', oferendaId: o.id, pessoaId: la.pessoaId })).json;
  assert.ok(!r.oferendas.find((x) => x.id === o.id).mediuns.some((m) => m.pessoaId === la.pessoaId));
  // Incluir escolhendo as listas: acrescenta os médiuns, não traz de volta quem foi tirado.
  assert.equal((await of({ acao: 'atualizarMediuns', id: o.id, grupos: [] })).status, 400);
  r = (await of({ acao: 'atualizarMediuns', id: o.id, grupos: ['medium', 'alunos'] })).json;
  o = r.oferendas.find((x) => x.id === o.id);
  assert.ok(o.mediuns.some((m) => m.nome === 'Médium Fora do Grupo'));
  assert.ok(!o.mediuns.some((m) => m.pessoaId === la.pessoaId));
  assert.deepEqual(o.grupos, ['cambone', 'alunos', 'medium']);
  // Adicionar uma pessoa do cadastro: quem tinha sido tirado volta para a lista.
  r = (await of({ acao: 'incluirMedium', oferendaId: o.id, pessoaId: la.pessoaId })).json;
  assert.ok(r.oferendas.find((x) => x.id === o.id).mediuns.some((m) => m.pessoaId === la.pessoaId));
  const fora = ps.find((p) => !o.mediuns.some((m) => m.pessoaId === p.id));
  if (fora) {
    r = (await of({ acao: 'incluirMedium', oferendaId: o.id, pessoaId: fora.id })).json;
    assert.ok(r.oferendas.find((x) => x.id === o.id).mediuns.some((m) => m.pessoaId === fora.id));
  }
  // Doação por alguém: um aluno.
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Velas', quantidade: 2, entrega: '' })).json;
  const item = r.oferendas.find((x) => x.id === o.id).itens[0];
  r = (await of({ acao: 'doarPor', itemId: item.id, pessoaId: 'a:' + alunos[0].id, quantidade: 1 })).json;
  const d = r.oferendas.find((x) => x.id === o.id).itens[0].doacoes[0];
  assert.deepEqual([d.chave, d.nome], ['a:' + alunos[0].id, alunos[0].nome]);
  await of({ acao: 'excluir', id: o.id });
});

test('ausência antecipada: data futura ainda sem gira; ao criar a gira, a pessoa já entra Ausente', async () => {
  const d = '2031-02-05';
  const p = (await api('GET', '/api/pessoas', ADMIN)).json[0];
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'ausenciaPrevia', data: d, pessoaId: p.id })).status, 403);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'ausenciaPrevia', data: '2020-01-01', pessoaId: p.id })).status, 400, 'data passada não');
  let r = (await api('POST', '/api/giras', ADMIN, { acao: 'ausenciaPrevia', data: d, pessoaId: p.id })).json;
  assert.ok(r.some((x) => x.data === d && x.pessoaId === p.id));
  const g = (await api('PUT', '/api/giras/' + d, ADMIN, { entidade: '' })).json;
  assert.equal(g.presenca[p.id], 'a', 'entra Ausente ao criar a gira');
  r = (await api('GET', '/api/giras?lista=ausencias', ADMIN)).json;
  assert.ok(!r.some((x) => x.data === d), 'as antecipadas da data saem');
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'ausenciaPrevia', data: d, pessoaId: p.id })).status, 409, 'com gira, marca na Presença');
  await api('DELETE', '/api/giras/' + d, ADMIN);
});

test('anamnese: o admin do perfil cadastra perguntas; cada pessoa responde as suas', async () => {
  const pq = (t, b) => api('POST', '/api/auth/anamnese', t, b);
  assert.equal((await pq(USER, { acao: 'pergunta', texto: 'Tem alergia?', tipo: 'simnao' })).status, 403);
  assert.equal((await pq(ADMIN, { acao: 'pergunta', texto: 'x'.repeat(501), tipo: 'texto' })).status, 400, 'limite de 500 letras');
  assert.equal((await pq(ADMIN, { acao: 'pergunta', texto: 'Tem alergia?', tipo: 'outro' })).status, 400);
  const inicial = (await api('GET', '/api/auth/anamnese', ADMIN)).json;
  const dataNasc = inicial.perguntas.find((q) => q.texto === 'Data de Nascimento');
  const escolha = inicial.perguntas.find((q) => q.tipo === 'opcao');
  const mental = inicial.perguntas.find((q) => q.tipo === 'multipla');
  assert.ok(dataNasc && escolha?.opcoes?.length && mental?.opcoes?.length > 10, 'migra o formulário, incluindo data e escolhas');
  let r = (await pq(ADMIN, { acao: 'pergunta', texto: '  Tem   alergia? ', tipo: 'simnao' })).json;
  r = (await pq(ADMIN, { acao: 'pergunta', texto: 'Toma algum remédio?', tipo: 'texto' })).json;
  const [q1, q2] = r.perguntas.slice(-2);
  assert.deepEqual([q1.texto, q1.tipo, q2.tipo], ['Tem alergia?', 'simnao', 'texto']);
  assert.ok(Array.isArray(r.todas), 'o admin recebe as respostas de todos');
  // Acesso da corrente: responde as próprias; não vê as dos outros.
  const ps = (await api('GET', '/api/pessoas', ADMIN)).json;
  const C = await entrarComSenha(ps[0].nome);
  assert.ok(C);
  assert.equal((await pq(C, { acao: 'visibilidade', visivel: false })).status, 403, 'só admin altera visibilidade');
  assert.equal((await pq(ADMIN, { acao: 'visibilidade', visivel: 'false' })).status, 400, 'visibilidade precisa ser boolean');
  r = (await pq(ADMIN, { acao: 'visibilidade', visivel: false })).json;
  assert.equal(r.visivel, false);
  const oculto = (await api('GET', '/api/auth/anamnese', C)).json;
  assert.equal(oculto.visivel, false);
  assert.deepEqual(oculto.perguntas, [], 'usuário não recebe perguntas quando o bloco está oculto');
  assert.equal(oculto.minhas, null, 'usuário não recebe respostas enquanto está oculto');
  assert.equal((await pq(C, { acao: 'responder', respostas: { [q2.id]: 'dipirona' } })).status, 409);
  r = (await pq(ADMIN, { acao: 'visibilidade', visivel: true })).json;
  assert.equal(r.visivel, true);
  assert.equal((await pq(C, { acao: 'responder', respostas: { [q1.id]: 'talvez' } })).status, 400);
  assert.equal((await pq(C, { acao: 'responder', respostas: { [q2.id]: Array.from({ length: 21 }, () => 'a').join('\n') } })).status, 400, 'até 20 linhas');
  assert.equal((await pq(C, { acao: 'responder', respostas: { [dataNasc.id]: '2026-02-29' } })).status, 400, 'data inexistente');
  assert.equal((await pq(C, { acao: 'responder', respostas: { [mental.id]: ['opção inválida'] } })).status, 400, 'opções validadas no servidor');
  const sel = mental.opcoes[0];
  assert.equal((await pq(C, { acao: 'responder', respostas: { [mental.id]: [sel] } })).status, 200);
  assert.equal((await pq(C, { acao: 'responder', respostas: { [dataNasc.id]: '2000-02-29', [escolha.id]: escolha.opcoes[0] } })).status, 200, 'data e escolha válidas');
  const m = (await pq(C, { acao: 'responder', respostas: { [q1.id]: 'sim', [q2.id]: ' dipirona ' } })).json;
  assert.deepEqual([m.minhas[q1.id], m.minhas[q2.id]], ['sim', 'dipirona']);
  assert.equal(m.todas, undefined, 'a corrente não vê as respostas dos outros');
  assert.equal((await pq(USER, { acao: 'editarPergunta', id: q2.id, texto: 'Pergunta alterada' })).status, 403);
  assert.equal((await pq(ADMIN, { acao: 'editarPergunta', id: q2.id, texto: 'x'.repeat(501) })).status, 400);
  r = (await pq(ADMIN, { acao: 'editarPergunta', id: q2.id, texto: '  Remédios   em uso? ' })).json;
  assert.equal(r.perguntas.find((q) => q.id === q2.id).texto, 'Remédios em uso?');
  assert.ok(r.todas.some((x) => x.perguntaId === q2.id && x.resposta === 'dipirona'), 'editar o texto preserva respostas existentes');
  const ordem = r.perguntas.map((q) => q.id).reverse();
  assert.equal((await pq(USER, { acao: 'reordenar', ids: ordem })).status, 403, 'só admin reordena');
  assert.equal((await pq(ADMIN, { acao: 'reordenar', ids: ordem.slice(1) })).status, 400, 'não permite perder perguntas da lista');
  assert.equal((await pq(ADMIN, { acao: 'reordenar', ids: [ordem[0], ordem[0], ...ordem.slice(2)] })).status, 400, 'não permite perguntas repetidas');
  r = (await pq(ADMIN, { acao: 'reordenar', ids: ordem })).json;
  assert.deepEqual(r.perguntas.map((q) => q.id), ordem, 'a nova ordem persiste');
  // Excluir a pergunta tira as respostas dela.
  r = (await pq(ADMIN, { acao: 'excluirPergunta', id: q1.id })).json;
  assert.ok(!r.perguntas.some((q) => q.id === q1.id) && !r.todas.some((x) => x.perguntaId === q1.id));
  await pq(ADMIN, { acao: 'excluirPergunta', id: q2.id });
});

test('recado do admin: até 5 linhas, só quem edita a gira e todos leem', async () => {
  const d = '2031-02-05';
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'recado', recado: 'Oi' })).status, 404, 'sem gira');
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Caboclo' });
  assert.equal((await api('POST', '/api/giras/' + d, USER, { acao: 'recado', recado: 'Oi' })).status, 403);
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'recado', recado: 'a\nb\nc\nd\ne\nf' })).status, 400, '6 linhas');
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'recado', recado: 'x'.repeat(301) })).status, 400);
  const r = (await api('POST', '/api/giras/' + d, ADMIN, { acao: 'recado', recado: '  Levar vela \n\nAxé\n' })).json;
  assert.equal(r.gira.recado, 'Levar vela\n\nAxé');
  assert.equal((await api('GET', '/api/giras/' + d, USER)).json.recado, 'Levar vela\n\nAxé');
  // outros campos não apagam o recado e, na gira encerrada, ele não muda
  assert.equal((await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Exu' })).json.recado, 'Levar vela\n\nAxé');
  await api('PUT', '/api/giras/2031-02-12', ADMIN, { entidade: 'Exu', atendimentos: { preferencial: 0, normal: 0, passe: 0 }, encerrada: true });
  assert.equal((await api('POST', '/api/giras/2031-02-12', ADMIN, { acao: 'recado', recado: 'Oi' })).status, 409);
});

test('trava da escala: só quem edita liga; com ela não dá para remanejar; cancelar o sorteio tira a trava', async () => {
  const d = '2031-03-05';
  await api('PUT', '/api/giras/' + d, ADMIN, { entidade: 'Caboclo' });
  const s = await api('POST', `/api/giras/${d}/sortear`, ADMIN);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  assert.equal((await api('POST', '/api/giras/' + d, USER, { acao: 'travar', travada: true })).status, 403);
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'travar', travada: 'sim' })).status, 400);
  const r = (await api('POST', '/api/giras/' + d, ADMIN, { acao: 'travar', travada: true })).json;
  assert.equal(r.gira.travada, true);
  assert.equal((await api('POST', `/api/giras/${d}/remanejar`, ADMIN)).status, 409);
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'cancelarSorteio' })).json.gira.travada, false);
  await api('DELETE', '/api/giras/' + d, ADMIN);
});

test('gestão de conduta e risco: interruptor do root; só o root lê; quem abriu edita até ser lido e vê só a resposta publicada', async () => {
  const ana = await entrarComSenha('Ana');
  const lista = async (t) => (await api('GET', '/api/giras?lista=conduta', t)).json.relatos;
  const relato = (t, dados) => api('POST', '/api/giras', t, { acao: 'conduta', ...dados });
  const ativar = (t, ativa) => api('POST', '/api/giras', t, { acao: 'condutaAtivar', ativa });
  // Começa desligado: a corrente não vê nem abre relato; só o root liga.
  assert.deepEqual((await api('GET', '/api/giras?lista=conduta', USER)).json, { ativa: false, relatos: [] });
  assert.equal((await relato(USER, { texto: 'antes de ativar' })).status, 403);
  assert.equal((await ativar(USER, true)).status, 403);
  assert.equal((await ativar(ADMIN, 'sim')).status, 400);
  assert.equal((await ativar(ADMIN, true)).json.ativa, true);
  assert.equal((await relato(USER, { texto: '   ' })).status, 400, 'vazio');
  assert.equal((await relato(USER, { texto: Array(11).fill('x').join('\n') })).status, 400, '11 linhas');
  const meus = (await relato(USER, { texto: '  Vi algo errado \n na gira ' })).json.relatos;
  assert.equal(meus.length, 1);
  assert.equal(meus[0].texto, 'Vi algo errado\nna gira');
  assert.equal(meus[0].autorNome, undefined, 'quem abriu não recebe o nome nem o autor');
  await relato(ana, { texto: 'Relato da Ana' });
  assert.deepEqual((await lista(USER)).map((c) => c.texto), ['Vi algo errado\nna gira'], 'cada um vê só os próprios');
  const id = meus[0].id;
  // Só quem abriu edita.
  assert.equal((await relato(ana, { id, texto: 'trocado' })).status, 400);
  assert.notEqual((await relato(USER, { id, texto: 'Vi algo errado na gira de ontem' })).json.relatos[0].editadoEm, null);
  // Root vê todos, com o nome; os outros não leem nem respondem.
  const doRoot = await lista(ADMIN);
  assert.equal(doRoot.length, 2);
  assert.ok(doRoot.find((c) => c.id === id).autorNome, 'root vê o nome');
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'condutaLer', id })).status, 403);
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'condutaResponder', id, resposta: 'x' })).status, 403);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'condutaResponder', id, resposta: 'antes de ler' })).status, 400, 'responder só depois de lido');
  assert.ok((await api('POST', '/api/giras', ADMIN, { acao: 'condutaLer', id })).json.relatos.find((c) => c.id === id).lidoEm);
  assert.equal((await relato(USER, { id, texto: 'depois de lido' })).status, 400, 'lido: não edita mais');
  // Rascunho: a pessoa não vê; publicada: vê e não muda mais.
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'condutaResponder', id, resposta: '', publicar: true })).status, 400);
  await api('POST', '/api/giras', ADMIN, { acao: 'condutaResponder', id, resposta: 'Rascunho' });
  const semResposta = (await lista(USER))[0];
  assert.equal(semResposta.resposta, undefined);
  assert.ok(semResposta.lidoEm);
  await api('POST', '/api/giras', ADMIN, { acao: 'condutaResponder', id, resposta: 'Obrigado, vamos conversar.', publicar: true });
  assert.equal((await lista(USER))[0].resposta, 'Obrigado, vamos conversar.');
  assert.equal((await lista(ana))[0].resposta, undefined, 'a resposta é só de quem abriu');
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'condutaResponder', id, resposta: 'outra' })).status, 400, 'publicada não muda');
  // Sem identificação: grava sem autor; quem mandou não vê na própria lista, e o root vê sem nome.
  assert.equal((await relato(ana, { id, texto: 'x', anonimo: true })).status, 400, 'anônimo não edita');
  const anon = await relato(ana, { texto: 'Prefiro não me identificar', anonimo: true });
  assert.deepEqual(anon.json.relatos.map((c) => c.texto), ['Relato da Ana'], 'o anônimo não volta para quem mandou');
  const anonRoot = (await lista(ADMIN)).find((c) => c.texto === 'Prefiro não me identificar');
  assert.equal(anonRoot.anonimo, true);
  assert.equal(anonRoot.autorNome, '');
  // Desligar esconde de novo da corrente; o root continua vendo tudo.
  assert.equal((await ativar(ADMIN, false)).json.relatos.length, 3);
  assert.deepEqual((await api('GET', '/api/giras?lista=conduta', USER)).json, { ativa: false, relatos: [] });
});

test('pedidos de guias: aba escondida até publicar; grupos, itens, pedir baixa o estoque, encerrar e novo número', async () => {
  const gu = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'guias', ...b });
  const ler = (tok) => api('GET', '/api/oferendas?lista=guias', tok);
  assert.equal((await ler(USER)).status, 403, 'aba começa escondida para quem não administra');
  assert.equal((await gu(USER, { op: 'publicar', publicada: true })).status, 403);
  let G = (await gu(ADMIN, { op: 'grupo', descricao: '  Guias  de  Oxóssi ' })).json;
  const g = G.grupos.find((x) => x.descricao === 'Guias de Oxóssi');
  assert.ok(g?.visivel);
  assert.equal((await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Guia verde', quantidade: 3, valor: 'abc' })).status, 400);
  G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Guia verde', quantidade: 3, valor: '25,50' })).json;
  const it = G.grupos.find((x) => x.id === g.id).itens[0];
  assert.equal(it.valor, 25.5);
  G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Guia oculta', quantidade: 5, valor: 10, visivel: false })).json;
  const oculto = G.grupos.find((x) => x.id === g.id).itens.find((i) => i.descricao === 'Guia oculta');
  assert.equal(G.aberto, 1, 'o pedido nº 1 já começa aberto');
  assert.equal((await gu(ADMIN, { op: 'publicar', publicada: true })).json.publicada, true);
  assert.equal((await api('GET', '/api/auth/me', USER)).json.guiasPublicada, true);

  let U = (await ler(USER)).json;
  assert.equal(U.admin, false);
  assert.equal(U.pedidos, undefined, 'quem não administra não recebe os pedidos dos outros');
  assert.deepEqual(U.grupos.find((x) => x.id === g.id).itens.map((i) => i.descricao), ['Guia verde'], 'item oculto não aparece');
  assert.equal((await gu(USER, { op: 'pedir', itemId: oculto.id, quantidade: 1 })).status, 400);
  assert.equal((await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 4 })).status, 400, 'não passa do disponível');
  U = (await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 2 })).json;
  assert.equal(U.grupos.find((x) => x.id === g.id).itens[0].quantidade, 1, 'estoque baixou');
  U = (await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 1 })).json;
  assert.deepEqual(U.meus.map((l) => [l.pedido, l.descricao, l.quantidade, l.valor]), [[1, 'Guia verde', 3, 25.5]], 'pedir de novo soma na mesma linha');
  assert.equal((await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 1 })).status, 400, 'esgotou');
  assert.equal((await gu(USER, { op: 'cancelar', id: U.meus[0].id })).status, 403, 'cancelar só pelo admin');

  G = (await ler(ADMIN)).json;
  const linha = G.pedidos[0].linhas[0];
  G = (await gu(ADMIN, { op: 'ok', id: linha.id, ok: true })).json;
  assert.equal(G.pedidos[0].linhas[0].ok, true);
  assert.equal((await gu(ADMIN, { op: 'novo' })).status, 400, 'já há um pedido aberto');
  G = (await gu(ADMIN, { op: 'encerrar' })).json;
  assert.equal(G.aberto, null);
  assert.equal((await gu(ADMIN, { op: 'encerrar' })).status, 400);
  G = (await gu(ADMIN, { op: 'cancelar', id: linha.id })).json;
  assert.equal(G.grupos.find((x) => x.id === g.id).itens.find((i) => i.id === it.id).quantidade, 3, 'cancelar devolve ao estoque');
  G = (await gu(ADMIN, { op: 'novo' })).json;
  assert.equal(G.aberto, 2);
  assert.deepEqual(G.pedidos.map((p) => p.numero), [2, 1]);

  await gu(ADMIN, { op: 'grupo', id: g.id, visivel: false });
  assert.equal((await ler(USER)).json.grupos.some((x) => x.id === g.id), false, 'grupo oculto some para a corrente');
  assert.equal((await gu(ADMIN, { op: 'excluirGrupo', id: g.id })).json.grupos.some((x) => x.id === g.id), false);
  await gu(ADMIN, { op: 'publicar', publicada: false });
  assert.equal((await ler(USER)).status, 403);
});

test('oferendas: o item tem unidade (da lista); sem unidade continua valendo', async () => {
  const of = (b) => api('POST', '/api/oferendas', ADMIN, b);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda com unidade', data: '2026-12-20' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Oferenda com unidade');
  assert.equal((await of({ acao: 'item', oferendaId: o.id, nome: 'Rosas', quantidade: 24, unidade: 'balde' })).status, 400, 'unidade fora da lista');
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Rosas', quantidade: 24, unidade: 'unidade' })).json;
  const rosas = r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.nome === 'Rosas');
  assert.equal(rosas.unidade, 'unidade');
  r = (await of({ acao: 'item', id: rosas.id, nome: 'Rosas', quantidade: 2, unidade: 'dúzia' })).json;
  assert.equal(r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === rosas.id).unidade, 'dúzia');
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Velas', quantidade: 3 })).json;
  assert.equal(r.oferendas.find((x) => x.id === o.id).itens.find((i) => i.nome === 'Velas').unidade, '', 'sem unidade, como antes');
  await of({ acao: 'excluir', id: o.id });
});
