// Testes de integração do backend: rotas reais + Postgres local.
// Rodar: npm test   (precisa de Postgres local; veja test/apoio.js)

import { LINHA_KEYS } from '../shared/regras.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, usarBancoLocal, sql } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';
import { emitirTokenCorrente, emitirTokenGrupo } from '../api/_lib/senhas.js';
import { normalizarNome } from '../shared/ervas.js';
import { compromissosDe } from '../shared/oferendas.js';
import { MIGRACOES } from '../db/esquema.js';

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
// A palavra-passe (cpj, alunos) acabou: os testes pegam a sessão direto, achando o cadastro ativo pelo nome
// (como fazia o login antigo). O login de verdade (e-mail, celular, CPF) tem os próprios testes.
function cadastroPorNome(tabela, nome) {
  return sql(`select id || '|' || pin_versao || '|' || nome from ${tabela} where saida is null`).split('\n').filter(Boolean)
    .map((l) => l.split('|')).find(([, , n]) => normalizarNome(n) === normalizarNome(nome));
}
async function tokenCorrente(nome) {
  const x = cadastroPorNome('pessoas', nome);
  return x ? emitirTokenCorrente(x[2], x[0], Number(x[1])) : undefined;
}
async function tokenAluno(nome) {
  const x = cadastroPorNome('alunos', nome);
  return x ? emitirTokenGrupo('alunos', x[0], x[2], Number(x[1])) : undefined;
}

// Corrente com senha (PIN): Perfil e Anamnese só abrem para quem já criou a senha (senha nova: 6 a 8 números).
let celulares = 0;
async function entrarComSenha(nome, pin = '24682468') {
  const token = await tokenCorrente(nome);
  if (!token) return null;
  const r = { token };
  // Criar a senha pede o celular do cadastro: o admin cadastra antes (se a pessoa ainda não tiver), um para cada
  // pessoa (cada celular só pode estar em um cadastro).
  const pessoaId = (await api('GET', '/api/auth/me', r.token)).json.pessoaId;
  const celDe = () => sql(`select coalesce(perfil -> 'info' ->> 'celular', '') from pessoas where id = '${pessoaId}'`);
  if (pessoaId && !celDe()) {
    await api('POST', '/api/auth/perfil', ADMIN, { pessoaId, info: { celular: '1193' + String(10000000 + ++celulares).slice(1) } });
  }
  const c = await api('POST', '/api/auth/criarSenha', r.token, { senha: pin, celular: pessoaId ? celDe() : '' });
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
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'ninguem@x.org', senha: 'nao' })).status, 404, 'e-mail sem cadastro: diz que não achou');
  const ok = await api('POST', '/api/auth/entrar', null, { email: ' USER@corrente.org ', senha: 'senha-do-ze' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.usuario.permissoes, ['pessoas:ler', 'giras:ler', 'pessoas:ver', 'historico:ver', 'escala:completa', 'ervas:escolher', 'oferendas:doar', 'guias:pedir', 'perfil:ver', 'amaci:ver', 'fotos:ver']);
  USER = ok.json.token;
  // 3 senhas erradas bloqueiam por 15 minutos, mesmo com a senha certa depois (um aluno, para não travar o Zé).
  const alvoId = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Alvo', celular: '11966665555' })).json.alunos.find((a) => a.nome === 'Aluno Alvo').id;
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pinAluno', alunoId: alvoId, senha: '13572468' })).status, 200);
  const alvo = (senha) => api('POST', '/api/auth/entrar', null, { email: '(11) 96666-5555', senha });
  assert.equal((await alvo('000000')).status, 401);
  assert.equal((await alvo('000001')).status, 401);
  assert.equal((await alvo('000002')).status, 429);
  assert.equal((await alvo('13572468')).status, 429, 'bloqueado mesmo com a senha certa');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: alvoId });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'apagarAluno', id: alvoId });
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
  assert.deepEqual(u.json.permissoes, ['pessoas:ler', 'giras:ler', 'pessoas:ver', 'historico:ver', 'escala:completa', 'ervas:escolher', 'oferendas:doar', 'guias:pedir', 'perfil:ver', 'amaci:ver', 'fotos:ver']);
});

test('excluir pessoa: sai das listas, o histórico fica e cadastrar de novo traz de volta', async () => {
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa Que Sai', funcao: 'cambone' });
  const achar = async () => (await api('GET', '/api/pessoas', ADMIN)).json.find((x) => x.nome === 'Pessoa Que Sai');
  const p = await achar();
  const tAntes = await tokenCorrente('Pessoa Que Sai');
  const d = '2025-02-01';
  await api('PUT', `/api/giras/${d}`, ADMIN, { presenca: { [p.id]: 'f' } });
  assert.equal((await api('DELETE', '/api/pessoas/' + p.id, ADMIN)).status, 200);
  assert.ok((await achar()).saida, 'continua na lista completa, com a data de saída');
  assert.equal((await api('GET', `/api/giras/${d}`, ADMIN)).json.presenca[p.id], 'f', 'a presença antiga fica');
  assert.equal((await api('GET', '/api/auth/me', tAntes)).status, 401, 'quem saiu não entra');
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
  assert.equal((await api('POST', `/api/giras/${d1}`, USER, { acao: 'sortear' })).status, 403);
  assert.equal((await api('PUT', `/api/giras/${d1}`, USER, { entidade: 'X' })).status, 403);

  const s1 = await api('POST', `/api/giras/${d1}`, ADMIN, { acao: 'sortear' });
  assert.equal(s1.status, 200, JSON.stringify(s1.json));
  assert.equal(s1.json.gira.pares.length, 5);       // 4 médiuns + 1 extra recebem cambone
  assert.equal(s1.json.gira.passes.length, 2);      // 2 passes nos 2 experientes
  assert.match(s1.json.mensagem, /5 de 5 duplas novas/);

  const s2 = await api('POST', `/api/giras/${d2}`, ADMIN, { acao: 'sortear' });
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
  const r = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'remanejar' });
  assert.equal(r.status, 200);
  const novas = r.json.gira.pares;
  assert.ok(!novas.some((p) => p.m === alvo.m), 'quem faltou não pode ter cambone');
  // Todo médium/extra presente continua com cambone.
  const presentes = new Set(g.pares.map((p) => p.m).filter((m) => m !== alvo.m));
  for (const m of presentes) assert.ok(novas.some((p) => p.m === m), 'médium ficou sem cambone');
  // Dupla válida só muda para aliviar cambone que estava com dois médiuns (regra 6.2). Podem ser várias:
  // nesta gira (Pretos Velhos) os passes sem a linha viram "Não atende" e sobram como cambones livres.
  const depois = new Set(novas.map((p) => p.m + '|' + p.c));
  const cargaAntes = {};
  g.pares.filter((p) => p.m !== alvo.m).forEach((p) => { cargaAntes[p.c] = (cargaAntes[p.c] || 0) + 1; });
  const mudaram = g.pares.filter((p) => p.m !== alvo.m && !depois.has(p.m + '|' + p.c));
  for (const p of mudaram) assert.ok(cargaAntes[p.c] >= 2, 'dupla válida alterada sem precisar: ' + p.m + '|' + p.c);
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
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'remanejar' })).status, 409);
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
  const turmaId = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  const al = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Retrato', turmaId })).json.alunos.find((a) => a.nome === 'Aluno Retrato');
  const of = (await api('POST', '/api/oferendas', ADMIN, {
    acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda retrato', data: '2038-06-01', porMedium: true, grupos: ['alunos'],
  })).json.oferendas.find((o) => o.titulo === 'Oferenda retrato');
  await api('POST', '/api/oferendas', ADMIN, { acao: 'medium', oferendaId: of.id, pessoaId: 'a:' + al.id, pagamento: 'pago' });
  assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'status', id: of.id, status: 'encerrado' })).status, 200);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: al.id, nome: 'Aluno Renomeado' });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: al.id });
  assert.equal(sql(`select count(*) from alunos where id = '${al.id}'`), '1', 'excluir manda para Ex-alunos (o cadastro fica)');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'apagarAluno', id: al.id });
  assert.equal(sql(`select count(*) from alunos where id = '${al.id}'`), '0', 'apagado de vez sai do banco');
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
  const dentro = (await api('POST', '/api/giras/2027-02-13', ADMIN, { acao: 'sortear' })).json.gira;
  assert.ok(!dentro.pares.some((p) => p.m === bruno.id || p.c === bruno.id), 'de licença não entra no sorteio');
  const fora = (await api('POST', '/api/giras/2027-03-06', ADMIN, { acao: 'sortear' })).json.gira;
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

test('perfil admin oferendas: administra as oferendas e as ervas (sub-aba), e mais nada', async () => {
  const novo = async (email, papel) => {
    await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa ' + papel, funcao: 'senha' });
    const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Pessoa ' + papel);
    assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email, senha: 'senha-forte-9', papel })).status, 200);
    return (await api('POST', '/api/auth/entrar', null, { email, senha: 'senha-forte-9' })).json.token;
  };
  const of = await novo('of@corrente.org', 'admin_oferendas');
  assert.equal((await api('POST', '/api/oferendas', of, { acao: 'salvar', responsavelId: RESP(), titulo: 'Teste', data: '2027-01-01' })).status, 200);
  assert.equal((await api('POST', '/api/ervas', of, { acao: 'config', frete: '0' })).status, 200, 'administra as ervas');
  assert.equal((await api('POST', '/api/ervas', USER, { acao: 'config', frete: '0' })).status, 403);
  // Fora disso, é como usuário: não edita a escala nem os usuários.
  for (const t of [of]) {
    assert.equal((await api('POST', '/api/giras/2027-01-02', t, { acao: 'sortear' })).status, 403);
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
  assert.match((await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', nome: 'aluna curimba' })).json.erro, /já existe|da corrente/i);
  C = (await api('POST', '/api/pessoas', cur, { acao: 'curimbaAluno', nome: 'Visitante de Fora' })).json;
  assert.equal(C.alunos.length, 2);
  const visitante = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  const alunoVisitante = visitante.alunos.find((a) => a.nome === 'Visitante de Fora');
  assert.equal(alunoVisitante?.turmaId, visitante.turmas.find((t) => t.nome === 'Curimba').id, 'quem não é da corrente vira aluno da turma Curimba');
  assert.equal(C.alunos.find((a) => a.nome === 'Visitante de Fora').alunoId, alunoVisitante.id);
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

test('admin só entra como admin com o e-mail dele; a sessão da corrente dele continua corrente', async () => {
  // Liga um admin a uma pessoa da corrente; a sessão da corrente (sem o e-mail) não ganha os poderes de admin.
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Admin Pessoa', funcao: 'senha' });
  const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Admin Pessoa');
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'adm2@corrente.org', senha: 'senha-forte-9', papel: 'admin' })).status, 200);
  const tc = await tokenCorrente('Admin Pessoa');
  assert.equal((await api('GET', '/api/auth/me', tc)).json.papel, 'corrente');
  assert.equal((await api('POST', '/api/giras/2027-05-01', tc, { acao: 'sortear' })).status, 403);
  assert.equal((await api('GET', '/api/usuarios', tc)).status, 403);
  assert.equal((await api('POST', '/api/ervas', tc, { acao: 'config', frete: '1' })).status, 403);
  assert.equal((await api('POST', '/api/oferendas', tc, { acao: 'salvar', responsavelId: RESP(), titulo: 'X', data: '2027-05-01' })).status, 403);
  // Com o e-mail e a senha dele, é admin.
  const pelaConta = (await api('POST', '/api/auth/entrar', null, { email: 'adm2@corrente.org', senha: 'senha-forte-9' })).json;
  assert.equal(pelaConta.usuario.papel, 'admin');
  assert.equal((await api('POST', '/api/giras/2027-05-01', pelaConta.token, { acao: 'sortear' })).status, 200, 'admin sorteia');
  await api('DELETE', '/api/giras/2027-05-01', ADMIN);
  // A aba Usuários é só do admin root.
  assert.equal((await api('GET', '/api/usuarios', pelaConta.token)).status, 403);
  // O nome no lugar do e-mail não serve para entrar como admin.
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'Admin Pessoa', senha: 'senha-forte-9' })).status, 400);
  const u = (await api('GET', '/api/usuarios', ADMIN)).json.find((x) => x.email === 'adm2@corrente.org');
  await api('DELETE', '/api/usuarios/' + u.id, ADMIN);
});

test('gestão de usuários: só admin root, com travas', async () => {
  assert.equal((await api('GET', '/api/usuarios', USER)).status, 403);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Novo', funcao: 'senha' });
  const pNovo = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Novo');
  const novo = await api('POST', '/api/usuarios', ADMIN, { email: 'Novo@Corrente.org', pessoaId: pNovo.id, senha: '12345678', papel: 'usuario' });
  assert.equal(novo.status, 200, JSON.stringify(novo.json));
  assert.equal(novo.json.length, 5, "root, Zé, admin oferendas, admin curimba e o novo");
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

test('palavra-passe cpj e alunos acabou; a sessão da corrente lê mas não administra', async () => {
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Dona Maria, Maria, Lúcia', funcao: 'senha' });
  for (const email of ['cpj', ' CPJ ', 'corrente-cpj', 'alunos']) {
    const r = await api('POST', '/api/auth/entrar', null, { email, senha: 'Lúcia' });
    assert.equal(r.status, 400, email);
    assert.match(r.json.erro, /palavra-passe acabou/);
    assert.equal(r.json.token, undefined);
  }
  // Sessão antiga do acesso da corrente (sem a pessoa) pede para entrar de novo.
  assert.equal((await api('GET', '/api/auth/me', await emitirTokenCorrente('Lúcia'))).status, 401);
  const tok = await tokenCorrente('Dona Maria');
  const me = (await api('GET', '/api/auth/me', tok)).json;
  assert.equal(me.nome, 'Dona Maria');
  assert.equal(me.corrente, true);
  assert.equal((await api('GET', '/api/giras', tok)).status, 200);
  assert.equal((await api('POST', '/api/pessoas', tok, { nome: 'X', funcao: 'medium' })).status, 403);
  assert.equal((await api('GET', '/api/usuarios', tok)).status, 403);
  assert.equal((await api('POST', '/api/auth/senha', tok, { atual: 'x', nova: 'yyyyyyyy' })).status, 400);
});

test('acessos alunos e curimba: dados restritos, eventos sem avisos e o aluno da curimba vê as aulas', async () => {
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluna da CPJ, Outra Aluna' });
  const turmaAlunos = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  const aluna = turmaAlunos.alunos.find((x) => x.nome === 'Aluna da CPJ');
  const tAlunaSemSenha = await tokenAluno('aluna da cpj');
  assert.equal((await api('GET', '/api/auth/me', tAlunaSemSenha)).json.grupo, 'alunos');
  const meusAlunos = await api('GET', '/api/pessoas?lista=alunos', tAlunaSemSenha);
  assert.deepEqual(meusAlunos.json.alunos.map((x) => x.id), [aluna.id]);
  assert.equal((await api('GET', '/api/pessoas', tAlunaSemSenha)).status, 403);
  assert.equal((await api('GET', '/api/giras', tAlunaSemSenha)).status, 403);
  assert.equal((await api('GET', '/api/giras?lista=eventos', tAlunaSemSenha)).status, 200);
  assert.equal((await api('POST', '/api/auth/senha', tAlunaSemSenha, { atual: 'x', nova: 'senha-forte-1' })).status, 403);
  // Orações: o aluno pede e vê só os próprios pedidos; não reage nem exclui. A corrente vê o pedido marcado como de aluno.
  await api('POST', '/api/giras', ADMIN, { acao: 'oracao', texto: 'Pedido da corrente' });
  const pedido = await api('POST', '/api/giras', tAlunaSemSenha, { acao: 'oracao', texto: 'Oração da aluna' });
  assert.equal(pedido.status, 200, JSON.stringify(pedido.json));
  assert.deepEqual(pedido.json.map((o) => o.texto), ['Oração da aluna'], 'aluno só vê os próprios pedidos');
  assert.equal(pedido.json[0].deAluno, true);
  assert.equal(pedido.json[0].apagar, false, 'aluno não exclui');
  assert.deepEqual((await api('GET', '/api/giras?lista=oracoes', tAlunaSemSenha)).json.map((o) => o.texto), ['Oração da aluna']);
  assert.equal((await api('POST', '/api/giras', tAlunaSemSenha, { acao: 'reagirOracao', id: pedido.json[0].id })).status, 403);
  const vistas = (await api('GET', '/api/giras?lista=oracoes', ADMIN)).json;
  assert.equal(vistas.find((o) => o.texto === 'Oração da aluna').deAluno, true);
  assert.equal(vistas.find((o) => o.texto === 'Pedido da corrente').deAluno, false);
  for (const o of vistas) await api('POST', '/api/giras', ADMIN, { acao: 'excluirOracao', id: o.id });

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
  // A palavra-passe curimba acabou: quem era de fora agora é aluno da turma Curimba e entra como os outros alunos.
  assert.match((await api('POST', '/api/auth/entrar', null, { email: 'curimba', senha: 'aluna de curimba' })).json.erro, /palavra-passe acabou/);
  assert.equal((await api('GET', '/api/auth/me', await emitirTokenGrupo('curimba', minha.id, 'Aluna de Curimba', 0))).status, 401, 'a sessão antiga de curimba cai');
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  assert.equal(A.alunos.find((x) => x.nome === 'Aluna de Curimba').turmaId, A.turmas.find((t) => t.nome === 'Curimba').id, 'virou aluna da turma Curimba');
  const tCurimba = await tokenAluno('Aluna de Curimba');
  assert.deepEqual((await api('GET', '/api/auth/inicio', tCurimba)).json.minhaCurimba.aulas, [{ data: '2034-05-10', nome: 'Toques', status: 'p' }], 'a abertura traz as aulas');
  const minhasAulas = await api('GET', '/api/pessoas?lista=minhaCurimba', tCurimba);
  assert.deepEqual(minhasAulas.json.aulas, [{ data: '2034-05-10', nome: 'Toques', status: 'p' }]);
  const eventos = await api('GET', '/api/giras?lista=eventos', tCurimba);
  assert.equal(eventos.status, 200);
  assert.ok(eventos.json.some((x) => x.nome === 'Festa da casa'));
  assert.ok(!eventos.json.some((x) => x.tipo === 'aviso'));
  assert.equal((await api('GET', '/api/pessoas?lista=curimba', tCurimba)).status, 403);
  assert.equal((await api('GET', '/api/giras', tCurimba)).status, 403);
  assert.equal((await api('POST', '/api/auth/entrar', null, { email: 'ervas', senha: 'qualquer nome' })).status, 400);
  // Aba Compras: alunos e curimba pedem quando ela está visível para todos; desligada, não entram.
  await api('POST', '/api/oferendas', ADMIN, { acao: 'guias', op: 'publicar', publicada: false });
  assert.equal((await api('GET', '/api/oferendas?lista=guias', tAlunaSemSenha)).status, 403);
  assert.equal((await api('GET', '/api/oferendas?lista=guias', tCurimba)).status, 403);
  await api('POST', '/api/oferendas', ADMIN, { acao: 'guias', op: 'publicar', publicada: true });
  // Como no Perfil: sem senha, o aluno não usa a aba Compras; depois de criar a senha, usa.
  const semSenhaCompras = await api('GET', '/api/oferendas?lista=guias', tAlunaSemSenha);
  assert.equal(semSenhaCompras.status, 403);
  assert.match(semSenhaCompras.json.erro, /senha/);
  assert.equal((await api('POST', '/api/oferendas', tAlunaSemSenha, { acao: 'guias', op: 'pedir', itemId: '11111111-1111-1111-1111-111111111111', quantidade: 1 })).status, 403, 'nem pede');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: aluna.id, celular: '11981230001' });
  const tokAluna = (await api('POST', '/api/auth/criarSenha', tAlunaSemSenha, { senha: '13571357', celular: '(11) 98123-0001' })).json.token;
  const comprasAluna = await api('GET', '/api/oferendas?lista=guias', tokAluna);
  assert.equal(comprasAluna.status, 200, JSON.stringify(comprasAluna.json));
  assert.equal(comprasAluna.json.admin, false);
  assert.equal((await api('POST', '/api/oferendas', tokAluna, { acao: 'guias', op: 'encerrar' })).status, 403, 'aluno não administra');
  await api('POST', '/api/oferendas', ADMIN, { acao: 'guias', op: 'publicar', publicada: false });
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

  const maria = (await tokenCorrente('Maria'));
  const r1 = await api('PUT', '/api/ervas', maria, { itens: [{ ervaId: arruda.id, quantidade: 2 }] });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.deepEqual(r1.json.minhas, [{ ervaId: arruda.id, quantidade: 2 }]);
  assert.equal(r1.json.pedidos.pessoas.length, 1, 'todos veem o andamento dos pedidos');
  // Mesmo nome, outro aparelho: continua as mesmas escolhas.
  const maria2 = (await tokenCorrente('maria'));
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
  const ana = (await tokenCorrente('Ana'));
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
  const tok = (await tokenCorrente('Carla'));
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
  // Ela entra pelo celular e a senha: o login junta no cadastro o que estava só com o nome.
  await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: lucia.id, info: { celular: '11977776666' } });
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pin', pessoaId: lucia.id, senha: '24682468' })).status, 200);
  const tok = (await api('POST', '/api/auth/entrar', null, { email: '(11) 97777-6666', senha: '24682468' })).json.token;
  const minhas = (await api('GET', '/api/ervas', tok)).json.minhas;
  assert.deepEqual(minhas, [{ ervaId: erva.id, quantidade: 2 }], 'o pedido antigo aparece para ela');
  assert.equal(sql("select count(*) from ervas_escolhas where pessoa_chave = 'n:lucia'"), '0');
  assert.equal(sql(`select count(*) from ervas_escolhas where pessoa_chave = 'p:${lucia.id}'`), '1');
  // Renomear a pessoa não perde o que ela preencheu.
  await api('PATCH', '/api/pessoas/' + lucia.id, ADMIN, { nome: 'Lúcia Helena' });
  const tok2 = (await tokenCorrente('Lúcia Helena'));
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
  for (const n of ['Ana', 'Bruno', 'Carla', 'Diego']) toks.push(await tokenCorrente(n));
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
  await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' });
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
  const s1 = (await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' })).json.gira;
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
  const sorteada = (await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' })).json.gira;
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
  assert.ok(['root', 'admin', 'usuario', 'admin_oferendas', 'admin_curimba', 'admin_perfil', 'corrente'].every((k) => perfis.some((f) => f.chave === k)));
  assert.ok(!perfis.some((f) => f.chave === 'admin_ervas'), 'o Admin ervas saiu (v133)');
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

test('senha da corrente (PIN): cria uma vez, entra pelo celular com ela, o root troca', async () => {
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Penha Pin', funcao: 'medium' });
  const entrar = (senha) => api('POST', '/api/auth/entrar', null, { email: '(11) 95555-4444', senha });
  const t1 = await tokenCorrente('Penha Pin');
  assert.ok(t1);
  assert.equal((await api('GET', '/api/auth/me', t1)).json.temSenha, false);
  assert.equal((await api('POST', '/api/auth/criarSenha', t1, { senha: '12' })).status, 400);
  assert.equal((await api('POST', '/api/auth/criarSenha', t1, { senha: 'abcd' })).status, 400);
  assert.equal((await api('POST', '/api/auth/criarSenha', ADMIN, { senha: '1234' })).status, 400, 'só o acesso da corrente');
  // Para criar a senha, o celular digitado tem de bater com o do cadastro (Perfil); sem celular no cadastro, não cria.
  assert.match((await api('POST', '/api/auth/criarSenha', t1, { senha: '432143' })).json.erro, /Atualize o app/, 'app antigo (sem o campo celular)');
  assert.match((await api('POST', '/api/auth/criarSenha', t1, { senha: '432143', celular: '' })).json.erro, /celular com DDD/, 'celular em branco');
  assert.match((await api('POST', '/api/auth/criarSenha', t1, { senha: '432143', celular: '11987654321' })).json.erro, /não está no cadastro/);
  const penha = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Penha Pin').id;
  await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: penha, info: { celular: '11955554444' } });
  assert.match((await api('POST', '/api/auth/criarSenha', t1, { senha: '432143', celular: '11912345678' })).json.erro, /não confere/);
  assert.equal((await api('GET', '/api/auth/me', t1)).json.temSenha, false, 'celular errado não cria');
  const c = await api('POST', '/api/auth/criarSenha', t1, { senha: '432143', celular: '(11) 5555-4444' });   // sem o 9 também confere
  assert.equal(c.status, 200);
  assert.equal((await api('GET', '/api/auth/me', t1)).status, 401, 'a sessão antiga caiu');
  const t2 = c.json.token;
  assert.equal((await api('GET', '/api/auth/me', t2)).json.temSenha, true);
  assert.equal((await api('POST', '/api/auth/criarSenha', t2, { senha: '999999', celular: '11955554444' })).status, 400, 'só cria uma vez');
  assert.equal((await entrar('')).status, 400, 'com senha, pede a senha');
  assert.equal((await entrar('000000')).status, 401);
  assert.ok((await entrar('432143')).json.token);
  // Root vê quem tem senha (sem a senha) e troca.
  const lista = (await api('GET', '/api/usuarios?lista=senhas', ADMIN)).json;
  const pe = lista.find((x) => x.nome === 'Penha Pin');
  assert.equal(pe.temSenha, true);
  assert.ok(!JSON.stringify(lista).includes('scrypt'));
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pin', pessoaId: pe.pessoaId, senha: '12a4' })).status, 400);
  assert.equal((await api('POST', '/api/usuarios', USER, { acao: 'pin', pessoaId: pe.pessoaId, senha: '5555' })).status, 403);
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'pin', pessoaId: pe.pessoaId, senha: '55556666' })).status, 200);
  assert.equal((await entrar('432143')).status, 401);
  assert.ok((await entrar('55556666')).json.token);
});

test('alunos da CPJ: turmas 09 a 11, fora da corrente; admin oferendas cadastra alunos mas não a corrente', async () => {
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  assert.deepEqual(A.turmas.map((t) => t.nome).filter((n) => n !== 'Curimba'), ['Turma 09', 'Turma 10', 'Turma 11']);
  assert.ok(A.turmas.some((t) => t.nome === 'Curimba'), 'e a turma Curimba (v131)');
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
  const tAcessoAluno = await tokenAluno(aluno.nome);
  assert.equal((await api('GET', '/api/auth/me', tAcessoAluno)).status, 200);
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
  assert.equal((await api('GET', '/api/pessoas?lista=alunos', tAcessoAluno)).status, 401, 'a sessão antiga de aluno é encerrada');
  // Agora é da corrente, com o mesmo nome.
  assert.equal(await tokenAluno(aluno.nome), undefined, 'não é mais aluno');
  const meCPJ = (await api('GET', '/api/auth/me', await tokenCorrente(aluno.nome))).json;
  assert.equal(meCPJ.papel, 'corrente');
  assert.equal(meCPJ.nome, aluno.nome, 'o mesmo nome é mantido');

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
  const ana = (await tokenCorrente('Ana'));   // a responsável
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
  const ana = (await tokenCorrente('Ana'));
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
  const ana = (await tokenCorrente('Ana'));
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
  const bruno = (await tokenCorrente('Bruno'));
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
  const ana = (await tokenCorrente('Ana'));
  assert.ok((await api('GET', '/api/giras?lista=eventos', ana)).json.some((e) => e.id === ev.id), 'a corrente vê os eventos');
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '13/05', nome: 'X', tipo: 'evento' })).status, 400);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2027-05-13', nome: 'X', tipo: 'festa' })).status, 400);
  const ed = (await api('POST', '/api/giras', ADMIN, { acao: 'evento', id: ev.id, data: '2027-05-14', nome: 'Festa', tipo: 'amaci' })).json;
  assert.equal(ed.find((e) => e.id === ev.id).data, '2027-05-14');
  assert.equal(ed.find((e) => e.id === ev.id).tipo, 'amaci');
  const fim = (await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: ev.id })).json;
  assert.ok(!fim.some((e) => e.id === ev.id));
});

test('tipos de evento: o root cria e edita; alunos veem gira, evento e os tipos da própria turma', async () => {
  const est = (await api('GET', '/api/giras?lista=eventosTipos', ADMIN)).json;
  assert.deepEqual(est.tipos.slice(0, 4).map((t) => t.chave), ['gira', 'amaci', 'aviso', 'evento']);
  const t9 = est.turmas.find((t) => t.nome === 'Turma 09');
  const t10 = est.turmas.find((t) => t.nome === 'Turma 10');
  assert.equal((await api('GET', '/api/giras?lista=eventosTipos', USER)).status, 403);
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'eventoTipo', nome: 'Festa' })).status, 403);
  const criado = await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', nome: '  Festa   da T9 ', turmas: [t9.id] });
  assert.equal(criado.status, 200, JSON.stringify(criado.json));
  const festa = criado.json.tipos.find((t) => t.nome === 'Festa da T9');
  assert.deepEqual(festa.turmas, [t9.id]);
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', nome: 'festa da t9' })).status, 400, 'nome repetido');
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2035-01-10', nome: 'X', tipo: 'naoexiste' })).status, 400);

  const datas = { gira: '2035-01-11', amaci: '2035-01-12', aviso: '2035-01-13', evento: '2035-01-14', [festa.chave]: '2035-01-15' };
  for (const [tipo, data] of Object.entries(datas)) await api('POST', '/api/giras', ADMIN, { acao: 'evento', data, nome: 'Teste ' + tipo, tipo });
  const doTeste = (lista) => lista.filter((e) => e.data >= '2035-01-11' && e.data <= '2035-01-15').map((e) => e.tipo).sort();

  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Nove, Aluno Dez' });
  const als = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: als.find((a) => a.nome === 'Aluno Nove').id, turmaId: t9.id });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: als.find((a) => a.nome === 'Aluno Dez').id, turmaId: t10.id });
  const nove = (await tokenAluno('aluno nove'));
  const dez = (await tokenAluno('aluno dez'));
  const ana = (await tokenCorrente('Ana'));

  assert.deepEqual(doTeste((await api('GET', '/api/giras?lista=eventos', nove)).json), ['evento', festa.chave, 'gira'].sort());
  assert.deepEqual(doTeste((await api('GET', '/api/giras?lista=eventos', dez)).json), ['evento', 'gira']);
  assert.deepEqual(doTeste((await api('GET', '/api/auth/inicio', nove)).json.eventos), ['evento', festa.chave, 'gira'].sort(), 'na abertura do app também');
  assert.deepEqual(doTeste((await api('GET', '/api/giras?lista=eventos', ana)).json), Object.keys(datas).sort(), 'a corrente vê todos');

  // Editar: marca a T10 no amaci e renomeia o tipo novo (o selo muda).
  await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', chave: 'amaci', nome: 'Amaci', turmas: [t10.id] });
  const ed = (await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', chave: festa.chave, nome: 'Festa', turmas: [t9.id, t10.id] })).json;
  assert.equal(ed.eventos.find((e) => e.tipo === festa.chave).tipoNome, 'Festa');
  assert.deepEqual(doTeste((await api('GET', '/api/giras?lista=eventos', dez)).json), ['amaci', 'evento', festa.chave, 'gira'].sort());

  // Excluir: os quatro de sempre não; tipo com eventos só depois de os eventos saírem.
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'excluirEventoTipo', chave: 'aviso' })).status, 400);
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'excluirEventoTipo', chave: festa.chave })).status, 403);
  const comEvento = await api('POST', '/api/giras', ADMIN, { acao: 'excluirEventoTipo', chave: festa.chave });
  assert.equal(comEvento.status, 400);
  assert.match(comEvento.json.erro, /Há 1 evento/);
  for (const e of ed.eventos.filter((x) => x.nome.startsWith('Teste '))) await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: e.id });
  const semFesta = (await api('POST', '/api/giras', ADMIN, { acao: 'excluirEventoTipo', chave: festa.chave })).json;
  assert.ok(!semFesta.tipos.some((t) => t.chave === festa.chave));
  await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', chave: 'amaci', nome: 'Amaci', turmas: [] });
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
  assert.deepEqual(r2.json.perfil.info, { nome: '', nascimento: '1990-10-31', celular: '11987654321', email: '', contatoNome: 'Mãe', contatoTelefone: '1134567890' }, 'só muda o que veio');
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { celular: '123' } })).status, 400);
  // E-mail: guardado em minúsculas; inválido é recusado.
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { email: 'Ana@Exemplo.com' } })).json.perfil.info.email, 'ana@exemplo.com');
  assert.equal((await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: ana, info: { email: 'sem-arroba' } })).status, 400);
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
  const s = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' });
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

  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' })).status, 409);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'remanejar' })).status, 409);
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
  if (!A.alunos.length) await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluna Oferenda', turmaId: A.turmas.find((t) => t.nome === 'Turma 09').id });
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
  const s = await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'sortear' });
  assert.equal(s.status, 200, JSON.stringify(s.json));
  assert.equal((await api('POST', '/api/giras/' + d, USER, { acao: 'travar', travada: true })).status, 403);
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'travar', travada: 'sim' })).status, 400);
  const r = (await api('POST', '/api/giras/' + d, ADMIN, { acao: 'travar', travada: true })).json;
  assert.equal(r.gira.travada, true);
  assert.equal((await api('POST', `/api/giras/${d}`, ADMIN, { acao: 'remanejar' })).status, 409);
  assert.equal((await api('POST', '/api/giras/' + d, ADMIN, { acao: 'cancelarSorteio' })).json.gira.travada, false);
  await api('DELETE', '/api/giras/' + d, ADMIN);
});

test('alunos: dados (CPF cifrado, nome completo, e-mail, celular) e pendências ligadas pelo CPF', async () => {
  const chaveAntes = process.env.CPF_CHAVE;
  process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
  try {
    const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
    const al = (b) => api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', turmaId: t09, ...b });
    assert.equal((await al({ nome: 'Dados Um, Dados Dois', email: 'x@y.com' })).status, 400, 'dados só com um aluno');
    assert.equal((await al({ nome: 'Dados Um', email: 'sem-arroba' })).status, 400, 'e-mail inválido');
    assert.equal((await al({ nome: 'Dados Um', cpf: '111.111.111-11' })).status, 400, 'CPF inválido');
    const r = await al({ nome: 'Dados Um', nomeCompleto: '  Dados  Um da Silva ', cpf: '529.982.247-25', email: 'Dados@Exemplo.com', celular: '(11) 98888-7777' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const id = r.json.alunos.find((a) => a.nome === 'Dados Um').id;
    assert.deepEqual(r.json.dados[id], { nomeCompleto: 'Dados Um da Silva', celular: '11988887777', email: 'dados@exemplo.com', temCpf: true, cpf: '•••.•••.•••-25' });
    assert.ok(!sql(`select cifrado from alunos_cpf where aluno_id = '${id}'`).includes('52998224725'), 'o CPF fica cifrado');
    assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'alunoCpf', id })).json.cpf, '52998224725');
    assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'alunoCpf', id })).status, 403, 'só quem edita Alunos');
    assert.equal((await api('GET', '/api/pessoas?lista=alunos', USER)).status, 403, 'sem a aba Alunos, nada');

    // Pendência: cobrança vencida cujo cliente tem o mesmo CPF (pelo hash) aparece no aluno e no bloco de atrasos.
    const { createHash, createHmac } = await import('node:crypto');
    const hash = createHmac('sha256', createHash('sha256').update(process.env.CPF_CHAVE).digest()).update('52998224725').digest('hex');
    sql(`insert into asaas2_atrasos (conta, id, nome, valor, vencimento, descricao, cpf_hash) values ('B', 'pay_aluno', 'Cliente', 80, '2026-10-05', 'Mensalidade do aluno', '${hash}')`);
    const lido = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
    assert.deepEqual(lido.pendencias[id].map((x) => [x.descricao, x.valor]), [['Mensalidade do aluno', 80]]);
    assert.equal(sql(`select (atrasos_ler() -> 'itens') @> '[{"id": "pay_aluno", "nome": "Dados Um", "ligado": true}]'`), 't', 'o bloco de atrasos dá o nome do aluno');

    // Editar: troca o e-mail e remove o CPF (a pendência deixa de ligar).
    const ed = (await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id, email: '', cpf: '' })).json;
    assert.deepEqual([ed.dados[id].email, ed.dados[id].temCpf], ['', false]);
    assert.equal(ed.pendencias[id], undefined);
    sql("delete from asaas2_atrasos where id = 'pay_aluno'");
    await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id });
  } finally {
    if (chaveAntes === undefined) delete process.env.CPF_CHAVE; else process.env.CPF_CHAVE = chaveAntes;
  }
});

test('amaci: Visível para todos; orixás liberados por turma; o aluno vê só os da turma dele', async () => {
  const am = (t) => api('GET', '/api/pessoas?lista=amaci', t);
  const acao = (t, b) => api('POST', '/api/pessoas', t, { acao: 'amaci', ...b });
  const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno do Amaci', turmaId: t09 });
  const aluno = (await tokenAluno('aluno do amaci'));
  // Começa desligada: só quem administra vê; os outros recebem 403.
  const r0 = (await am(ADMIN)).json;
  assert.equal(r0.publicada, false);
  assert.equal(r0.orixas.length, 14, 'quem administra vê os 14');
  assert.ok(r0.turmas.some((t) => t.id === t09));
  assert.ok(!r0.turmas.some((t) => t.nome === 'Consulentes'), 'Consulentes sem a aba Amaci no perfil: a turma não aparece');
  assert.equal((await am(USER)).status, 403);
  assert.equal((await am(aluno)).status, 403);
  assert.equal((await acao(USER, { op: 'publicar', publicada: true })).status, 403);
  assert.equal((await acao(aluno, { op: 'turma', turmaId: t09, orixas: ['oxala'] })).status, 403);
  assert.equal((await acao(ADMIN, { op: 'publicar', publicada: 'sim' })).status, 400);
  assert.equal((await acao(ADMIN, { op: 'publicar', publicada: true })).json.publicada, true);
  assert.equal((await api('GET', '/api/auth/me', USER)).json.amaciPublicada, true);
  // Turma sem nada liberado: o aluno não vê nenhum orixá.
  assert.deepEqual((await am(aluno)).json.liberados, []);
  assert.equal((await acao(ADMIN, { op: 'turma', turmaId: t09, orixas: ['xxx'] })).status, 400);
  const lib = (await acao(ADMIN, { op: 'turma', turmaId: t09, orixas: ['loguna', 'oxala', 'oxala'] })).json;
  assert.deepEqual(lib.turmas.find((t) => t.id === t09).orixas, ['oxala', 'loguna'], 'na ordem da apostila, sem repetir');
  const doAluno = (await am(aluno)).json;
  assert.deepEqual(doAluno.orixas.map((o) => o.k), ['oxala', 'loguna']);
  assert.equal(doAluno.turmaNome, 'Turma 09');
  assert.equal(doAluno.turmas, undefined, 'o aluno não recebe as turmas');
  assert.deepEqual(Object.keys(doAluno.orixas[0]).sort(), ['ervas', 'fatores', 'k', 'orientacao', 'pontos', 'velas'], 'só os blocos do padrão (e o recado)');
  assert.equal((await am(USER)).json.orixas.length, 14, 'a corrente vê os 14');
  // Orientação: até 10 linhas; vazia apaga.
  assert.equal((await acao(ADMIN, { op: 'orientacao', orixa: 'oxala', texto: Array(11).fill('x').join('\n') })).status, 400);
  await acao(ADMIN, { op: 'orientacao', orixa: 'oxala', texto: '  Trazer roupa branca  ' });
  assert.equal((await am(aluno)).json.orixas[0].orientacao, 'Trazer roupa branca');
  await acao(ADMIN, { op: 'orientacao', orixa: 'oxala', texto: '' });
  assert.equal((await am(aluno)).json.orixas[0].orientacao, '');
  await acao(ADMIN, { op: 'turma', turmaId: t09, orixas: [] });
  await acao(ADMIN, { op: 'publicar', publicada: false });
});

test('amaci: presença do aluno no dia e no terreiro; o root marca presença ou falta; percentual', async () => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno da Presença', turmaId: t09 });
  const aluno = await tokenAluno('aluno da presença');
  const alunoId = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos.find((a) => a.nome === 'Aluno da Presença').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'amaci', op: 'publicar', publicada: true });
  const evs = async () => (await api('GET', '/api/giras?lista=eventos', ADMIN)).json;
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2020-01-04', nome: 'Amaci antigo', tipo: 'amaci' });
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: hoje, nome: 'Amaci de hoje', tipo: 'amaci' });
  const antigo = (await evs()).find((e) => e.nome === 'Amaci antigo');
  const deHoje = (await evs()).find((e) => e.nome === 'Amaci de hoje');
  const am = async (t) => (await api('GET', '/api/pessoas?lista=amaci', t)).json;
  const confirmar = (dados) => api('POST', '/api/pessoas', aluno, { acao: 'amaciPresenca', ...dados });
  const NO_TERREIRO = { lat: -23.6576, lon: -46.6681 };
  // Turma não marcada no tipo Amaci: o aluno não tem amacis nem confirma.
  assert.deepEqual((await am(aluno)).presenca.amacis, []);
  assert.equal((await confirmar({ eventoId: deHoje.id, ...NO_TERREIRO })).status, 404);
  await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', chave: 'amaci', nome: 'Amaci', turmas: [t09] });
  const p0 = (await am(aluno)).presenca;
  assert.deepEqual(p0.amacis.filter((a) => a.nome.startsWith('Amaci ')).map((a) => [a.nome, a.status]), [['Amaci antigo', null], ['Amaci de hoje', null]]);
  assert.equal(p0.pct, 0, 'sem registro = ausente');
  // Fora do terreiro, em outro dia ou sem coordenadas: recusa.
  assert.equal((await confirmar({ eventoId: deHoje.id, lat: -23.55, lon: -46.63 })).status, 403);
  assert.equal((await confirmar({ eventoId: deHoje.id })).status, 403);
  assert.equal((await confirmar({ eventoId: antigo.id, ...NO_TERREIRO })).status, 409);
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'amaciPresenca', eventoId: deHoje.id, ...NO_TERREIRO })).status, 403, 'só aluno');
  const p1 = (await confirmar({ eventoId: deHoje.id, ...NO_TERREIRO })).json.presenca;
  assert.equal(p1.amacis.find((a) => a.id === deHoje.id).status, 'p');
  assert.equal(p1.pct, 50);
  // O root marca falta e presença; o aluno não usa a op do admin.
  assert.equal((await api('POST', '/api/pessoas', aluno, { acao: 'amaci', op: 'presenca', eventoId: antigo.id, alunoId, status: 'p' })).status, 403);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'amaci', op: 'presenca', eventoId: antigo.id, alunoId, status: 'x' })).status, 400);
  const adm = (await api('POST', '/api/pessoas', ADMIN, { acao: 'amaci', op: 'presenca', eventoId: antigo.id, alunoId, status: 'p' })).json.presencaAdmin;
  assert.equal(adm.marcas[antigo.id][alunoId], 'p');
  assert.ok(adm.alunos.some((a) => a.id === alunoId));
  assert.equal((await am(aluno)).presenca.pct, 100);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'amaci', op: 'presenca', eventoId: antigo.id, alunoId, status: '' });
  assert.equal((await am(aluno)).presenca.amacis.find((a) => a.id === antigo.id).status, null, 'vazio apaga');
  for (const e of [antigo, deHoje]) await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: e.id });
  await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', chave: 'amaci', nome: 'Amaci', turmas: [] });
  // Tipo criado por turma ("T09 - Amaci"): conta como amaci, com as turmas do próprio tipo.
  const tipos = (await api('POST', '/api/giras', ADMIN, { acao: 'eventoTipo', nome: 'Teste T09 - Amaci', turmas: [t09] })).json.tipos;
  const t09Amaci = tipos.find((t) => t.nome === 'Teste T09 - Amaci').chave;
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: hoje, nome: 'Amaci da T09', tipo: t09Amaci });
  const daT09 = (await evs()).find((e) => e.nome === 'Amaci da T09');
  // Amaci que já passou cadastrado pelo root na aba Amaci (retroativo): o aluno marca sem localização; data futura recusa.
  assert.equal((await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2099-01-01', nome: 'Retro futuro', tipo: t09Amaci, retroativo: true })).status, 400);
  await api('POST', '/api/giras', ADMIN, { acao: 'evento', data: '2021-03-06', nome: 'Amaci retroativo', tipo: t09Amaci, retroativo: true });
  const retro = (await evs()).find((e) => e.nome === 'Amaci retroativo');
  assert.equal((await am(aluno)).presenca.amacis.find((a) => a.id === retro.id).retroativo, true);
  assert.equal((await confirmar({ eventoId: retro.id })).json.presenca.amacis.find((a) => a.id === retro.id).status, 'p', 'sem localização');
  await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: retro.id });
  assert.deepEqual((await am(aluno)).presenca.amacis.map((a) => a.nome).filter((n) => n === 'Amaci da T09'), ['Amaci da T09']);
  assert.equal((await confirmar({ eventoId: daT09.id, ...NO_TERREIRO })).json.presenca.pct, 100);
  await api('POST', '/api/giras', ADMIN, { acao: 'excluirEvento', id: daT09.id });
  await api('POST', '/api/giras', ADMIN, { acao: 'excluirEventoTipo', chave: t09Amaci });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'amaci', op: 'publicar', publicada: false });
});

test('ver como: o root vê o app como uma pessoa ou um aluno, só leitura; os outros não', async () => {
  const comVerComo = async (token, alvo, metodo = 'GET', rota = '/api/auth/me', corpo) => {
    const r = await fetch(base + rota, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
      headers: { Authorization: 'Bearer ' + token, 'X-Ver-Como': alvo, ...(corpo ? { 'Content-Type': 'application/json' } : {}) } });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const ana = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Ana');
  const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Visto', turmaId: t09 });
  const aluno = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos.find((a) => a.nome === 'Aluno Visto');
  const comoAna = (await comVerComo(ADMIN, 'p:' + ana.id)).json;
  assert.equal(comoAna.nome, 'Ana');
  assert.equal(comoAna.papel, 'corrente');
  assert.ok(!comoAna.permissoes.includes('usuarios:gerenciar'), 'com as permissões da pessoa');
  const comoAluno = (await comVerComo(ADMIN, 'a:' + aluno.id)).json;
  assert.equal(comoAluno.nome, 'Aluno Visto');
  assert.equal(comoAluno.grupo, 'alunos');
  // Só leitura: qualquer gravação é recusada.
  assert.equal((await comVerComo(ADMIN, 'p:' + ana.id, 'POST', '/api/giras', { acao: 'oracao', texto: 'teste' })).status, 403);
  assert.equal((await comVerComo(ADMIN, 'x:123')).status, 400);
  assert.equal((await comVerComo(ADMIN, 'p:00000000-0000-4000-8000-000000000000')).status, 404);
  // Quem não é root: o cabeçalho é ignorado.
  assert.notEqual((await comVerComo(USER, 'p:' + ana.id)).json.nome, 'Ana');
});

test('aluno com o acesso bloqueado: não entra e a sessão aberta cai; desbloquear devolve', async () => {
  const t09 = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.turmas.find((t) => t.nome === 'Turma 09').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluno Bloqueado', turmaId: t09 });
  const aluno = await tokenAluno('aluno bloqueado');
  const id = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos.find((a) => a.nome === 'Aluno Bloqueado').id;
  const bloq = (v) => api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id, bloqueado: v });
  assert.equal((await api('GET', '/api/auth/me', aluno)).status, 200);
  assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id, bloqueado: 'sim' })).status, 400);
  assert.equal((await api('POST', '/api/pessoas', USER, { acao: 'aluno', id, bloqueado: true })).status, 403, 'só quem edita Alunos');
  const r = (await bloq(true)).json;
  assert.equal(r.alunos.find((a) => a.id === id).bloqueado, true);
  const me = await api('GET', '/api/auth/me', aluno);
  assert.equal(me.status, 401);
  assert.match(me.json.erro, /bloqueado/);
  await bloq(false);
  assert.equal((await api('GET', '/api/auth/me', aluno)).status, 200, 'desbloqueado: a mesma sessão volta a valer');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id });
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
  // Cancelar o envio: só quem abriu e só antes de lido; o root exclui qualquer um.
  const cancelar = (t, cid) => api('POST', '/api/giras', t, { acao: 'condutaCancelar', id: cid });
  const outro = (await relato(USER, { texto: 'Mandei sem querer' })).json.relatos.find((c) => c.texto === 'Mandei sem querer').id;
  assert.equal((await cancelar(ana, outro)).status, 400, 'só quem abriu cancela');
  assert.equal((await cancelar(USER, id)).status, 400, 'lido: não cancela mais');
  assert.ok(!(await cancelar(USER, outro)).json.relatos.some((c) => c.id === outro));
  assert.equal((await api('POST', '/api/giras', USER, { acao: 'condutaExcluir', id })).status, 403);
  const tmp = (await relato(ana, { texto: 'Para excluir' })).json.relatos.find((c) => c.texto === 'Para excluir').id;
  assert.ok(!(await api('POST', '/api/giras', ADMIN, { acao: 'condutaExcluir', id: tmp })).json.relatos.some((c) => c.id === tmp));
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
  // Foto: a resposta leva só a versão (fotoV); a imagem vem pelo link próprio, como JPEG, com cache longo.
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(200, 7)]).toString('base64');
  G = (await gu(ADMIN, { op: 'item', id: it.id, foto: jpeg })).json;
  const comFoto = G.grupos.find((x) => x.id === g.id).itens.find((i) => i.id === it.id);
  assert.equal(comFoto.foto, undefined, 'a foto não vai na resposta');
  assert.match(comFoto.fotoV, /^[0-9a-f]{10}$/);
  assert.equal(comFoto.fotoV, sql(`select substr(md5(foto), 1, 10) from guias_itens where id = '${it.id}'`), 'a versão guardada é a mesma de antes (os links não mudam)');
  const img = await fetch(`${base}/api/oferendas?lista=guiaFoto&id=${it.id}&v=${comFoto.fotoV}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.match(img.headers.get('cache-control'), /immutable/);
  assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), jpeg);
  G = (await gu(ADMIN, { op: 'item', id: it.id, foto: null })).json;
  assert.equal(G.grupos.find((x) => x.id === g.id).itens.find((i) => i.id === it.id).fotoV, null, 'sem foto, sem versão');
  assert.equal((await fetch(`${base}/api/oferendas?lista=guiaFoto&id=${it.id}`)).status, 404);
  G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Guia oculta', quantidade: 5, valor: 10, visivel: false })).json;
  const oculto = G.grupos.find((x) => x.id === g.id).itens.find((i) => i.descricao === 'Guia oculta');
  assert.equal(G.grupos.find((x) => x.id === g.id).aberto, 1, 'o primeiro grupo fica com o pedido nº 1, que já começa aberto');
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
  assert.deepEqual(U.meus.map((l) => [l.pedido, l.descricao, l.quantidade, l.valor]), [[1, 'Guias de Oxóssi · Guia verde', 3, 25.5]], 'pedir de novo soma na mesma linha; a linha leva o nome do grupo');
  assert.equal((await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 1 })).status, 400, 'esgotou');
  assert.equal((await gu(USER, { op: 'cancelar', id: U.meus[0].id })).status, 403, 'cancelar só pelo admin');

  G = (await ler(ADMIN)).json;
  const linha = G.pedidos[0].linhas[0];
  // Quem não administra recebe do banco só as próprias linhas (e os pedidos em que tem linha); o admin, tudo.
  assert.equal(sql(`select jsonb_array_length(guias_estado('{"chave":"ninguem"}') -> 'pedidos')`), '0', 'sem linhas, sem pedidos');
  assert.equal(sql(`select jsonb_array_length(guias_estado(jsonb_build_object('chave', '${linha.chave}')) -> 'pedidos' -> 0 -> 'linhas')`), '1');
  assert.equal(sql(`select jsonb_array_length(guias_estado() -> 'pedidos')`), String(G.pedidos.length));
  // A caixinha de ok saiu do Painel: a operação não existe mais.
  assert.equal((await gu(ADMIN, { op: 'ok', id: linha.id, ok: true })).status, 400);
  // Sub-aba Pedidos: só quem administra; uma entrada por linha, com pagamento e andamento (começa pendente).
  assert.equal((await api('GET', '/api/oferendas?lista=pedidos', USER)).status, 403);
  assert.equal((await gu(USER, { op: 'andamento', id: linha.id, andamento: 'entregue' })).status, 403);
  let PD = (await api('GET', '/api/oferendas?lista=pedidos', ADMIN)).json;
  const pd = PD.pedidos.find((l) => l.id === linha.id);
  assert.deepEqual([pd.descricao, pd.nome, pd.pago, pd.andamento], [linha.descricao, linha.nome, false, 'pendente']);
  assert.deepEqual([pd.itemId, pd.fotoV, pd.grupo], [it.id, null, 'Guias de Oxóssi'], 'o item e o grupo vão junto; sem foto, sem versão');
  // Grupo Axé: os itens dele não entram nos Pedidos.
  sql(`update guias_grupos set descricao = 'AXÉ' where id = '${g.id}'`);
  assert.equal((await api('GET', '/api/oferendas?lista=pedidos', ADMIN)).json.pedidos.some((l) => l.id === linha.id), false);
  sql(`update guias_grupos set descricao = 'Guias de Oxóssi' where id = '${g.id}'`);
  assert.equal(typeof PD.pendencias, 'object');
  assert.equal((await gu(ADMIN, { op: 'andamento', id: linha.id, andamento: 'pronto' })).status, 400);
  PD = (await gu(ADMIN, { op: 'andamento', id: linha.id, andamento: 'em_confeccao' })).json;
  assert.equal(PD.pedidos.find((l) => l.id === linha.id).andamento, 'em_confeccao');
  assert.equal((await gu(ADMIN, { op: 'novo' })).status, 400, 'sem grupo');
  assert.equal((await gu(ADMIN, { op: 'novo', grupoId: g.id })).status, 400, 'o grupo já tem pedido aberto');
  // Outro grupo tem pedido próprio: encerrar um não mexe no outro.
  G = (await gu(ADMIN, { op: 'grupo', descricao: 'Velas da casa' })).json;
  const g2 = G.grupos.find((x) => x.descricao === 'Velas da casa');
  assert.equal(g2.aberto, 2, 'grupo novo nasce com o próximo número');
  G = (await gu(ADMIN, { op: 'encerrar', grupoId: g.id })).json;
  assert.equal(G.grupos.find((x) => x.id === g.id).aberto, null);
  assert.equal(G.grupos.find((x) => x.id === g2.id).aberto, 2, 'o outro grupo continua aberto');
  assert.ok(G.pedidos.find((p) => p.numero === 1).encerradoEm, 'o pedido nº 1 encerra quando o único grupo dele encerra');
  assert.deepEqual(G.pedidos.find((p) => p.numero === 1).linhas.map((l) => l.grupoId), [g.id], 'a linha leva o grupo');
  assert.equal((await gu(ADMIN, { op: 'encerrar', grupoId: g.id })).status, 400);
  assert.match((await gu(USER, { op: 'pedir', itemId: it.id, quantidade: 1 })).json.erro, /Guias de Oxóssi estão fechados/);
  G = (await gu(ADMIN, { op: 'cancelar', id: linha.id })).json;
  assert.equal(G.grupos.find((x) => x.id === g.id).itens.find((i) => i.id === it.id).quantidade, 3, 'cancelar devolve ao estoque');
  G = (await gu(ADMIN, { op: 'novo', grupoId: g.id })).json;
  assert.equal(G.grupos.find((x) => x.id === g.id).aberto, 3);
  assert.deepEqual(G.pedidos.map((p) => p.numero), [3, 2, 1]);
  await gu(ADMIN, { op: 'excluirGrupo', id: g2.id });

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

test('iemanjá: item de Todos do grupo (no cadastro ou no combo) não é assumido por ninguém', async () => {
  const iem = (b) => api('POST', '/api/oferendas', ADMIN, { acao: 'iemanja', ...b });
  const lido = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json;
  const ev = lido.eventos.find((e) => !e.encerradoEm);
  const g = ev.grupos[0];
  const { chave } = lido.candidatos.corrente[0];
  await iem({ op: 'adicionar', grupoId: g.id, chave });
  const grupo = (r) => r.json.eventos.find((e) => e.id === ev.id).grupos.find((x) => x.id === g.id);
  let r = await iem({ op: 'item', grupoId: g.id, nome: 'Vela de todos', quantidade: 1, unidade: 'unidade', todos: true });
  const vela = grupo(r).itens.find((i) => i.nome === 'Vela de todos');
  assert.equal(vela.todos, true);
  assert.equal((await iem({ op: 'assumirPor', itemId: vela.id, chave, quantidade: 1 })).status, 400, 'item de todos não é assumido');
  r = await iem({ op: 'item', grupoId: g.id, nome: 'Rosa do combo', quantidade: 2, unidade: 'unidade' });
  const rosa = grupo(r).itens.find((i) => i.nome === 'Rosa do combo');
  await iem({ op: 'assumirPor', itemId: rosa.id, chave, quantidade: 1 });
  r = await iem({ op: 'itemTodos', itemId: rosa.id, todos: true });
  const rosaTodos = grupo(r).itens.find((i) => i.id === rosa.id);
  assert.equal(rosaTodos.todos, true);
  assert.deepEqual(rosaTodos.doacoes, [], 'quem tinha assumido sai');
  r = await iem({ op: 'itemTodos', itemId: rosa.id, todos: false });
  assert.equal(grupo(r).itens.find((i) => i.id === rosa.id).todos, false);
  await iem({ op: 'excluirItem', itemId: vela.id });
  await iem({ op: 'excluirItem', itemId: rosa.id });
  await iem({ op: 'retirar', grupoId: g.id, chave });
});

test('iemanjá: com algum item assumido, o sorteio não pode mais ser cancelado', async () => {
  const iem = (b) => api('POST', '/api/oferendas', ADMIN, { acao: 'iemanja', ...b });
  const lido = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json;
  const ev = lido.eventos.find((e) => !e.encerradoEm);
  const g = ev.grupos[0];
  const { chave } = lido.candidatos.corrente[0];
  await iem({ op: 'adicionar', grupoId: g.id, chave });
  const r = await iem({ op: 'item', grupoId: g.id, nome: 'Rosas da trava', quantidade: 2, unidade: 'unidade' });
  const item = r.json.eventos.find((e) => e.id === ev.id).grupos[0].itens.find((i) => i.nome === 'Rosas da trava');
  assert.equal((await iem({ op: 'assumirPor', itemId: item.id, chave, quantidade: 1 })).status, 200);
  const nao = await iem({ op: 'cancelarSorteio', id: ev.id });
  assert.equal(nao.status, 400);
  assert.match(nao.json.erro, /não pode mais ser cancelado/);
  await iem({ op: 'assumirPor', itemId: item.id, chave, quantidade: 0 });
  assert.equal((await iem({ op: 'cancelarSorteio', id: ev.id })).status, 200, 'sem item assumido, cancela');
  await iem({ op: 'excluirItem', itemId: item.id });
  await iem({ op: 'retirar', grupoId: g.id, chave });
});

test('iemanjá: trocar duas pessoas de oferenda; não troca no mesmo grupo nem quem já assumiu item', async () => {
  const iem = (b) => api('POST', '/api/oferendas', ADMIN, { acao: 'iemanja', ...b });
  const lido = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json;
  const ev = lido.eventos.find((e) => !e.encerradoEm);
  const [g0, g1] = ev.grupos;
  const [p1, p2, p3] = lido.candidatos.corrente.slice(-3).map((p) => p.chave);
  await iem({ op: 'adicionar', grupoId: g0.id, chave: p1 });
  await iem({ op: 'adicionar', grupoId: g0.id, chave: p3 });
  await iem({ op: 'adicionar', grupoId: g1.id, chave: p2 });
  assert.equal((await iem({ op: 'trocar', id: ev.id, a: p1, b: p3 })).status, 400, 'mesmo grupo');
  const r = await iem({ op: 'trocar', id: ev.id, a: p1, b: p2 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const gs = r.json.eventos.find((e) => e.id === ev.id).grupos;
  assert.ok(gs.find((g) => g.id === g1.id).membros.some((m) => m.chave === p1), 'p1 foi para o grupo 1');
  assert.ok(gs.find((g) => g.id === g0.id).membros.some((m) => m.chave === p2), 'p2 foi para o grupo 0');
  const it = (await iem({ op: 'item', grupoId: g1.id, nome: 'Item da troca', quantidade: 1, unidade: 'unidade' })).json.eventos.find((e) => e.id === ev.id).grupos.find((g) => g.id === g1.id).itens.find((i) => i.nome === 'Item da troca');
  await iem({ op: 'assumirPor', itemId: it.id, chave: p1, quantidade: 1 });
  assert.equal((await iem({ op: 'trocar', id: ev.id, a: p1, b: p2 })).status, 400, 'quem assumiu item não troca');
  await iem({ op: 'assumirPor', itemId: it.id, chave: p1, quantidade: 0 });
  await iem({ op: 'excluirItem', itemId: it.id });
  await iem({ op: 'retirar', grupoId: g1.id, chave: p1 });
  await iem({ op: 'retirar', grupoId: g0.id, chave: p2 });
  await iem({ op: 'retirar', grupoId: g0.id, chave: p3 });
});

test('oferendas: kg e litro aceitam quantidade quebrada; as outras unidades só inteira', async () => {
  const of = (b) => api('POST', '/api/oferendas', ADMIN, b);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Oferenda em kg', data: '2026-12-21' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Oferenda em kg');
  assert.equal((await of({ acao: 'item', oferendaId: o.id, nome: 'Velas', quantidade: 1.5, unidade: 'pacote' })).status, 400);
  r = await of({ acao: 'item', oferendaId: o.id, nome: 'Arroz', quantidade: '1,5', unidade: 'kg' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const arroz = r.json.oferendas.find((x) => x.id === o.id).itens.find((i) => i.nome === 'Arroz');
  assert.equal(Number(arroz.quantidade), 1.5);
  r = await of({ acao: 'doarPor', itemId: arroz.id, pessoaId: RESP(), quantidade: 0.5 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(Number(r.json.oferendas.find((x) => x.id === o.id).itens.find((i) => i.id === arroz.id).doacoes[0].quantidade), 0.5);
  assert.equal((await of({ acao: 'doarPor', itemId: arroz.id, pessoaId: RESP(), quantidade: 2 })).status, 400, 'não passa do que falta');
  await of({ acao: 'excluir', id: o.id });
});

test('orações: some em até 4 dias ou na sexta seguinte ao dia em que foi pedida (horário de Brasília)', async () => {
  const exp = (iso) => sql(`select to_char(oracao_expira('${iso}'::timestamptz) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')`);
  assert.equal(exp('2026-11-16 12:00-03'), '2026-11-20 00:00', 'segunda: vai até a 0h de sexta (antes dos 4 dias)');
  assert.equal(exp('2026-11-19 12:00-03'), '2026-11-20 00:00', 'quinta: some na sexta');
  assert.equal(exp('2026-11-20 10:00-03'), '2026-11-24 10:00', 'pedida na sexta: passa por aquela sexta e vale 4 dias');
  assert.equal(exp('2026-11-21 09:00-03'), '2026-11-25 09:00', 'sábado: 4 dias');
});

test('iemanjá: transporte — admin cria, puxa a corrente, adiciona alguém, marca pago e pulseira; só o root exclui', async () => {
  const iem = (b, tok = ADMIN) => api('POST', '/api/oferendas', tok, { acao: 'iemanja', ...b });
  const ev = (await api('GET', '/api/oferendas?lista=iemanja', ADMIN)).json.eventos.find((e) => !e.encerradoEm);
  assert.equal((await iem({ op: 'transporteSalvar', id: ev.id, descricao: 'Van 1' })).status, 400, 'sem responsável');
  let r = await iem({ op: 'transporteSalvar', id: ev.id, descricao: 'Van 1', responsavelId: RESP() });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const t = r.json.eventos.find((e) => e.id === ev.id).transportes.find((x) => x.descricao === 'Van 1');
  assert.equal(t.responsavel, 'Ana');
  r = await iem({ op: 'transporteIncluir', id: ev.id, transporteId: t.id, grupo: 'corrente' });
  const pessoas = r.json.eventos.find((e) => e.id === ev.id).transportes.find((x) => x.id === t.id).pessoas;
  assert.ok(pessoas.length > 0 && pessoas.every((p) => ['Corrente', 'Curimba'].includes(p.lista)));
  r = await iem({ op: 'transporteIncluir', id: ev.id, transporteId: t.id, nome: 'Visitante da Van' });
  const vis = r.json.eventos.find((e) => e.id === ev.id).transportes.find((x) => x.id === t.id).pessoas.find((p) => p.nome === 'Visitante da Van');
  assert.equal(vis.lista, 'Avulsos');
  r = await iem({ op: 'transportePessoa', id: ev.id, transporteId: t.id, chave: vis.chave, pago: true });
  r = await iem({ op: 'transportePessoa', id: ev.id, transporteId: t.id, chave: vis.chave, pulseira: true });
  const v2 = r.json.eventos.find((e) => e.id === ev.id).transportes.find((x) => x.id === t.id).pessoas.find((p) => p.chave === vis.chave);
  assert.deepEqual([v2.pago, v2.pulseira], [true, true]);
  assert.equal((await iem({ op: 'transportePessoa', id: ev.id, transporteId: t.id, chave: vis.chave, remover: true })).status, 200);
  r = await iem({ op: 'transporteExcluir', id: ev.id, transporteId: t.id });
  assert.equal(r.status, 200);
  assert.equal(r.json.eventos.find((e) => e.id === ev.id).transportes.length, 0);
});

test('ASAAS: Pedir gera o link de pagamento; só o webhook conferido no ASAAS marca como pago', async () => {
  // API do ASAAS falsa: o servidor roda neste processo, então o fetch para o ASAAS é trocado aqui.
  const fetchReal = globalThis.fetch;
  // demorar: cria a cobrança mas responde 503 (como sem resposta); listar: a busca por referência já a encontra.
  const falso = { status: 'PENDING', value: 0, n: 0, pedidos: [], valores: {}, falhar: false, demorar: false, listar: true, refs: {} };
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    if (!u.startsWith('http://asaas.teste/v3')) return fetchReal(url, op);
    const caminho = u.slice('http://asaas.teste/v3'.length);
    falso.pedidos.push([op.method, caminho, op.headers?.access_token]);
    const json = (st, j) => new Response(JSON.stringify(j), { status: st, headers: { 'Content-Type': 'application/json' } });
    if (op.method === 'POST' && caminho === '/customers') return json(200, { id: 'cus_teste' });
    if (op.method === 'POST' && caminho === '/payments') {
      if (falso.falhar) return json(400, { errors: [{ description: 'Serviço indisponível no teste.' }] });
      const b = JSON.parse(op.body);
      falso.value = b.value;
      falso.forma = b.billingType;
      const id = 'pay_' + (++falso.n);
      falso.valores[id] = b.value;
      const pg = { id, value: b.value, dueDate: b.dueDate, invoiceUrl: 'https://sandbox.asaas.com/i/' + id, externalReference: b.externalReference, billingType: b.billingType };
      falso.refs[b.externalReference] = pg;
      if (falso.demorar) return json(503, {});
      return json(200, pg);
    }
    if (op.method === 'GET' && caminho.startsWith('/payments?externalReference=')) {
      const pg = falso.refs[decodeURIComponent(caminho.split('=')[1])];
      return json(200, { data: falso.listar && pg ? [pg] : [] });
    }
    if (op.method === 'GET' && caminho.endsWith('/pixQrCode')) return json(200, { payload: '00020126PIXTESTE', encodedImage: 'iVBORw0KGgo=' });
    if (op.method === 'GET' && caminho.startsWith('/payments/')) return json(200, { id: caminho.split('/')[2], status: falso.status, value: falso.valores[caminho.split('/')[2]] });
    if (op.method === 'DELETE') return json(200, { deleted: true });
    return json(404, { errors: [{ description: 'não encontrado' }] });
  };
  const env = { ASAAS_API_KEY: process.env.ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN: process.env.ASAAS_WEBHOOK_TOKEN, ASAAS_API_URL: process.env.ASAAS_API_URL };
  try {
    const gu = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'guias', ...b });
    const as = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'asaas', ...b });
    const hook = (token, corpo) => fetchReal(base + '/api/oferendas?webhook=asaas', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) }, body: JSON.stringify(corpo),
    }).then((r) => r.status);

    // Webhook: sem token configurado recusa; token errado, 401.
    delete process.env.ASAAS_WEBHOOK_TOKEN; delete process.env.ASAAS_API_KEY;
    assert.equal(await hook('x', { id: 'evt_0', event: 'PAYMENT_CREATED' }), 503);
    assert.equal((await as(ADMIN, { op: 'ativar', ativo: true })).status, 400, 'sem as variáveis não liga');
    Object.assign(process.env, { ASAAS_API_KEY: 'chave-teste', ASAAS_WEBHOOK_TOKEN: 'token-teste', ASAAS_API_URL: 'http://asaas.teste/v3' });
    assert.equal(await hook(null, { id: 'evt_0', event: 'PAYMENT_CREATED' }), 401);
    assert.equal(await hook('errado', { id: 'evt_0', event: 'PAYMENT_CREATED' }), 401);
    assert.equal(await hook('token-teste', { event: 'PAYMENT_CREATED' }), 400);

    // Aba ASAAS só do root; começa desligada.
    assert.equal((await api('GET', '/api/oferendas?lista=asaas', USER)).status, 403);
    assert.equal((await as(USER, { op: 'ativar', ativo: true })).status, 403);
    let A = (await api('GET', '/api/oferendas?lista=asaas', ADMIN)).json;
    assert.equal(A.ativo, false);
    assert.deepEqual(A.config, { chave: true, token: true, chaveB: !!process.env.ASAAS2_API_KEY, tokenB: !!process.env.ASAAS2_WEBHOOK_TOKEN, ambiente: 'Sandbox (testes)' });
    assert.ok(!JSON.stringify(A).includes('chave-teste'), 'a chave nunca vai para a tela');

    // Compras com um item de R$ 12,50 e um pedido aberto.
    let G = (await gu(ADMIN, { op: 'grupo', descricao: 'Pix teste' })).json;
    const g = G.grupos.find((x) => x.descricao === 'Pix teste');
    G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Guia Pix', quantidade: 10, valor: '12,50' })).json;
    const it = G.grupos.find((x) => x.id === g.id).itens[0];
    const n = G.grupos.find((x) => x.id === g.id).aberto;
    assert.ok(n, 'o grupo novo já nasce com pedido aberto');
    G = (await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: 2 })).json;
    assert.equal(G.pix, false, 'Pix desligado não aparece');
    assert.equal((await gu(ADMIN, { op: 'pix', pedido: n, cpf: '52998224725' })).status, 403);

    A = (await as(ADMIN, { op: 'ativar', ativo: true })).json;
    assert.equal(A.ativo, true);
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.equal(G.pix, true);
    assert.equal(G.pixPrecisaCpf, true);
    const linhasAntes = G.meus.length;
    assert.match((await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: 1 })).json.erro, /CPF/, 'com o Pix ligado, o primeiro Pedir pede o CPF');
    assert.equal((await api('GET', '/api/oferendas?lista=guias', ADMIN)).json.meus.length, linhasAntes, 'CPF inválido não faz o pedido');
    assert.equal((await gu(ADMIN, { op: 'pix', pedido: n })).status, 400, 'sem CPF');
    assert.equal((await gu(ADMIN, { op: 'pix', pedido: n, cpf: '111.111.111-11' })).status, 400, 'CPF inválido');
    // O valor vem do banco: mandar "valor" no corpo não muda nada.
    G = (await gu(ADMIN, { op: 'pix', pedido: n, cpf: '529.982.247-25', valor: 1 })).json;
    assert.equal(falso.value, 25, 'cobra 2 x 12,50, somado no servidor');
    assert.equal(G.pixPrecisaCpf, false, 'cliente do ASAAS guardado');
    const c = G.cobrancas.find((x) => x.status === 'pendente');
    assert.deepEqual([c.pedido, c.valor, c.pixPayload, c.itens], [n, 25, '00020126PIXTESTE', ['2x Pix teste · Guia Pix']]);
    assert.ok(falso.pedidos.every((x) => x[2] === 'chave-teste'), 'chave no cabeçalho access_token');
    const minha = () => G.meus.find((l) => l.pedido === n && l.descricao === 'Pix teste · Guia Pix');
    assert.deepEqual([minha().pago, minha().pix], [false, 'pendente']);
    assert.match((await gu(ADMIN, { op: 'pix', pedido: n })).json.erro, /já foi gerado/);
    const linhaId = minha().id;
    assert.match((await gu(ADMIN, { op: 'cancelar', id: linhaId })).json.erro, /Pix pendente/);

    // Com o Pix ligado, Pedir já gera o link de pagamento, numa linha nova (a do primeiro link não muda de valor).
    G = (await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: 1 })).json;
    assert.equal(G.aviso, undefined);
    assert.equal(falso.value, 12.5, 'o link cobre só o que ainda não tinha link');
    assert.deepEqual(G.meus.filter((l) => l.pedido === n && l.descricao === 'Pix teste · Guia Pix').map((l) => [l.quantidade, l.pix]).sort(), [[1, 'pendente'], [2, 'pendente']]);
    assert.equal(G.cobrancas.find((x) => x.valor === 12.5).link, 'https://sandbox.asaas.com/i/pay_2');

    // Webhook de pagamento: no ASAAS ainda está pendente → não libera.
    assert.equal(await hook('token-teste', { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 25, status: 'RECEIVED' } }), 200);
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.equal(G.meus.find((l) => l.id === linhaId).pago, false, 'o corpo do webhook sozinho não libera');
    // Agora o ASAAS confirma: paga.
    falso.status = 'RECEIVED';
    assert.equal(await hook('token-teste', { id: 'evt_2', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 25 } }), 200);
    assert.equal(await hook('token-teste', { id: 'evt_2', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 25 } }), 200, 'reenvio responde 200');
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.deepEqual([G.meus.find((l) => l.id === linhaId).pago, G.meus.find((l) => l.id === linhaId).pix], [true, null]);
    assert.equal(G.cobrancas.find((x) => x.id === c.id).status, 'paga');
    assert.match((await gu(ADMIN, { op: 'cancelar', id: linhaId })).json.erro, /já foi pago/);
    assert.equal(sql("select count(*) from asaas_eventos where id = 'evt_2'"), '1');

    // O root acompanha na aba ASAAS e cancela o link pendente: a pessoa vê "cancelado" e pode gerar outro.
    falso.status = 'PENDING';
    A = (await api('GET', '/api/oferendas?lista=asaas', ADMIN)).json;
    const c2 = A.cobrancas.find((x) => x.status === 'pendente');
    assert.deepEqual([c2.valor, c2.itens, c2.link], [12.5, ['1x Pix teste · Guia Pix'], 'https://sandbox.asaas.com/i/pay_2']);
    assert.equal((await as(ADMIN, { op: 'cancelar', id: c2.id })).json.cobrancas.find((x) => x.id === c2.id).status, 'cancelada');
    assert.ok(falso.pedidos.some((x) => x[0] === 'DELETE' && x[1] === '/payments/pay_2'));
    assert.deepEqual(A.eventos.map((e) => [e.id, e.resultado]), [['evt_2', 'paga'], ['evt_1', 'não liberado: no ASAAS está PENDING']]);
    const umaGuia = () => G.meus.find((l) => l.pedido === n && l.descricao === 'Pix teste · Guia Pix' && l.quantidade === 1);
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.equal(umaGuia().pix, 'cancelada');
    G = (await gu(ADMIN, { op: 'pix', pedido: n })).json;
    assert.equal(umaGuia().pix, 'pendente', 'gerou outro link');
    assert.equal(falso.forma, 'PIX', 'fora da lista do cartão, só Pix');

    // Cartão de crédito (aba ASAAS): quem está na lista gera o link em que escolhe Pix ou cartão (UNDEFINED).
    assert.equal((await as(USER, { op: 'credito', chave: 'p:' + RESP() })).status, 403, 'só quem tem ASAAS → Editar');
    assert.equal((await as(ADMIN, { op: 'credito', chave: 'x:1' })).status, 400);
    A = (await as(ADMIN, { op: 'credito', chave: 'p:' + RESP() })).json;
    assert.ok(A.credito.some((k) => k.chave === 'p:' + RESP()), 'entrou na lista');
    assert.ok(!A.candidatos.some((k) => k.chave === 'p:' + RESP()), 'sai dos candidatos');
    assert.ok(!JSON.stringify(A.credito).includes('cifrado'), 'o CPF cifrado não sai da API');
    A = (await as(ADMIN, { op: 'credito', chave: 'p:' + RESP(), remover: true })).json;
    assert.ok(!A.credito.some((k) => k.chave === 'p:' + RESP()));
    const minhaChave = sql(`select chave from asaas_cobrancas where pedido = ${n} limit 1`);
    sql(`insert into asaas_credito (chave, nome) values ('${minhaChave}', 'Admin') on conflict do nothing`);
    G = (await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: 1 })).json;
    assert.equal(falso.forma, 'UNDEFINED', 'na lista: Pix ou cartão');
    assert.ok(G.cobrancas.some((x) => x.status === 'pendente' && x.forma === 'UNDEFINED'));
    sql(`delete from asaas_credito where chave = '${minhaChave}'`);

    // ASAAS fora do ar no Pedir: o pedido fica, com aviso, e o link é gerado depois.
    falso.falhar = true;
    G = (await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: 3 })).json;
    assert.match(G.aviso, /Pedido feito, mas o link de pagamento não foi gerado: ASAAS: Serviço indisponível/);
    const tres = () => G.meus.find((l) => l.pedido === n && l.descricao === 'Pix teste · Guia Pix' && l.quantidade === 3);
    assert.equal(tres().pix, null, 'pedido sem link');
    assert.equal(sql("select count(*) from asaas_cobrancas where status = 'criando'"), '0', 'a reserva foi desfeita');
    falso.falhar = false;
    G = (await gu(ADMIN, { op: 'pix', pedido: n })).json;
    assert.deepEqual([tres().pix, falso.value], ['pendente', 37.5]);

    // ASAAS demora (cria a cobrança, mas a resposta não chega): o app acha a cobrança pela referência, sem gerar outra.
    const criadas = () => falso.n;
    const pedirUm = async (qtd) => (await gu(ADMIN, { op: 'pedir', itemId: it.id, quantidade: qtd })).json;
    const daQtd = (qtd) => G.meus.find((l) => l.pedido === n && l.descricao === 'Pix teste · Guia Pix' && l.quantidade === qtd);
    assert.equal((await gu(ADMIN, { op: 'item', id: it.id, quantidade: 100 })).status, 200, 'estoque para os pedidos abaixo');
    falso.demorar = true;
    let antes = criadas();
    G = await pedirUm(4);
    assert.equal(G.aviso, undefined, 'achou na hora');
    assert.equal(daQtd(4).pix, 'pendente');
    assert.equal(criadas() - antes, 1, 'uma cobrança só no ASAAS');
    // Ainda não aparece na busca: a reserva fica, e tentar de novo logo em seguida não gera outra.
    falso.listar = false;
    antes = criadas();
    G = await pedirUm(5);
    assert.match(G.aviso, /demorando/);
    assert.equal(sql("select count(*) from asaas_cobrancas where status = 'criando'"), '1', 'a reserva não foi apagada');
    assert.match((await gu(ADMIN, { op: 'pix', pedido: n })).json.erro, /ainda está sendo gerado/);
    // Webhook de pagamento antes de o app gravar o link: acha a reserva pela referência.
    const reserva = sql("select id from asaas_cobrancas where status = 'criando'");
    const pgDemorado = falso.refs[reserva];
    falso.status = 'RECEIVED';
    assert.equal(await hook('token-teste', { id: 'evt_ref', event: 'PAYMENT_RECEIVED', payment: { id: pgDemorado.id, value: pgDemorado.value, externalReference: reserva } }), 200);
    falso.status = 'PENDING';
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.equal(daQtd(5).pago, true, 'pago pela referência');
    assert.equal(criadas() - antes, 1);
    // Reserva parada que o ASAAS não criou: depois de 20 s, a próxima tentativa desfaz e gera o link.
    falso.listar = false;
    G = await pedirUm(6);
    assert.match(G.aviso, /demorando/);
    const parada = sql("select id from asaas_cobrancas where status = 'criando'");
    delete falso.refs[parada];
    sql(`update asaas_cobrancas set criado_em = now() - interval '1 minute' where id = '${parada}'`);
    falso.demorar = false;
    falso.listar = true;
    G = (await gu(ADMIN, { op: 'pix', pedido: n })).json;
    assert.equal(daQtd(6).pix, 'pendente', 'gerou o link depois de conferir');
    assert.equal(sql("select count(*) from asaas_cobrancas where status = 'criando'"), '0');
    // Reserva parada que o ASAAS criou: ao abrir a aba, o link aparece (sem gerar outro).
    falso.demorar = true;
    falso.listar = false;
    G = await pedirUm(7);
    sql("update asaas_cobrancas set criado_em = now() - interval '1 minute' where status = 'criando'");
    falso.demorar = false;
    falso.listar = true;
    antes = criadas();
    G = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json;
    assert.equal(daQtd(7).pix, 'pendente');
    assert.ok(G.cobrancas.some((x) => x.status === 'pendente' && x.valor === 87.5), 'o link de 7 x 12,50 aparece');
    assert.equal(criadas() - antes, 0, 'não criou outra cobrança');

    await as(ADMIN, { op: 'ativar', ativo: false });
    await gu(ADMIN, { op: 'excluirGrupo', id: g.id });
  } finally {
    globalThis.fetch = fetchReal;
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('CPF do Perfil: cifrado, só a própria pessoa e o root', async () => {
  const chaveAntes = process.env.CPF_CHAVE;
  process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
  try {
    await api('POST', '/api/pessoas', ADMIN, { nome: 'Cpf Dona, Cpf Vizinha', funcao: 'cambone' });
    const pes = (await api('GET', '/api/pessoas', ADMIN)).json;
    const dona = pes.find((p) => p.nome === 'Cpf Dona');
    const vizinha = pes.find((p) => p.nome === 'Cpf Vizinha');
    const tDona = await entrarComSenha('Cpf Dona');
    const tViz = await entrarComSenha('Cpf Vizinha');
    // Admin do Perfil (vê o perfil de todos), mas não é root.
    assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: vizinha.id, email: 'admperfil@corrente.org', senha: 'senha-forte-7', papel: 'admin_perfil' })).status, 200);
    const tAdmPerfil = (await api('POST', '/api/auth/entrar', null, { email: 'admperfil@corrente.org', senha: 'senha-forte-7' })).json.token;

    assert.deepEqual((await api('GET', '/api/auth/cpf', tDona)).json, { tem: false, mascarado: '', atualizadoEm: null });
    assert.equal((await api('POST', '/api/auth/cpf', tDona, { cpf: '111.111.111-11' })).status, 400, 'CPF inválido');
    assert.equal((await api('POST', '/api/auth/cpf', tDona, { cpf: '529.982.247-24' })).status, 400, 'dígito errado');
    const salvo = await api('POST', '/api/auth/cpf', tDona, { cpf: '529.982.247-25' });
    assert.equal(salvo.status, 200, JSON.stringify(salvo.json));
    assert.equal(salvo.json.mascarado, '•••.•••.•••-25');
    assert.ok(!('cpf' in salvo.json), 'salvar não devolve o número');
    assert.ok(!('cpf' in (await api('GET', '/api/auth/cpf', tDona)).json), 'sem ver=1, só mascarado');
    assert.equal((await api('GET', '/api/auth/cpf?ver=1', tDona)).json.cpf, '52998224725');

    // Ninguém mais além do root: nem outra pessoa, nem o admin do Perfil.
    for (const t of [tViz, tAdmPerfil, USER]) {
      assert.equal((await api('GET', `/api/auth/cpf?pessoaId=${dona.id}&ver=1`, t)).status, 403);
      assert.equal((await api('POST', '/api/auth/cpf', t, { pessoaId: dona.id, cpf: '' })).status, 403);
    }
    assert.equal((await api('GET', '/api/auth/cpf', ADMIN)).status, 400, 'root sem cadastro não tem CPF próprio');
    assert.equal((await api('GET', `/api/auth/cpf?pessoaId=${dona.id}&ver=1`, ADMIN)).json.cpf, '52998224725');
    assert.equal((await api('POST', '/api/auth/cpf', ADMIN, { pessoaId: dona.id, cpf: '153.509.460-56' })).json.mascarado, '•••.•••.•••-56');
    assert.equal((await api('GET', '/api/auth/cpf?ver=1', tDona)).json.cpf, '15350946056');

    // No banco, só cifrado; e não vaza pelo perfil de todos nem pela lista de pessoas.
    const noBanco = sql(`select cifrado from pessoas_cpf where pessoa_id = '${dona.id}'`);
    assert.match(noBanco, /^v1\./);
    assert.ok(!noBanco.includes('15350946056'));
    assert.ok(!JSON.stringify((await api('GET', '/api/auth/perfil', ADMIN)).json).includes('15350946056'));
    assert.ok(!JSON.stringify((await api('GET', '/api/pessoas', ADMIN)).json).includes('15350946056'));
    // Texto cifrado copiado para outra pessoa não abre.
    sql(`insert into pessoas_cpf (pessoa_id, cifrado) values ('${vizinha.id}', '${noBanco}')`);
    assert.equal((await api('GET', '/api/auth/cpf', tViz)).status, 500);
    assert.equal((await api('POST', '/api/auth/cpf', tViz, { cpf: '' })).json.tem, false, 'apagar o próprio');

    // Sem a chave no servidor, recusa.
    delete process.env.CPF_CHAVE;
    assert.equal((await api('POST', '/api/auth/cpf', tDona, { cpf: '529.982.247-25' })).status, 503);
    process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';

    // Excluir a pessoa apaga o CPF.
    assert.equal((await api('DELETE', '/api/pessoas/' + dona.id, ADMIN)).status, 200);
    assert.equal(sql(`select count(*) from pessoas_cpf where pessoa_id = '${dona.id}'`), '0');
  } finally {
    if (chaveAntes === undefined) delete process.env.CPF_CHAVE; else process.env.CPF_CHAVE = chaveAntes;
  }
});

test('Compras: item de doação é cobrado na conta B; venda e doação no mesmo pedido viram duas cobranças', async () => {
  const fetchReal = globalThis.fetch;
  const BASES = { A: 'http://asaasa.doacao/v3', B: 'http://asaasb.doacao/v3' };
  const falso = { pedidos: [], n: 0, valores: {} };
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    const conta = Object.keys(BASES).find((k) => u.startsWith(BASES[k]));
    if (!conta) return fetchReal(url, op);
    const caminho = u.slice(BASES[conta].length);
    const json = (st, j) => new Response(JSON.stringify(j), { status: st, headers: { 'Content-Type': 'application/json' } });
    falso.pedidos.push([conta, op.method, caminho, op.body ? JSON.parse(op.body) : null]);
    if (op.method === 'POST' && caminho === '/customers') return json(200, { id: 'cus_' + conta });
    if (op.method === 'GET' && caminho.startsWith('/customers/')) return json(200, { id: caminho.split('/')[2], cpfCnpj: '52998224725' });
    if (op.method === 'POST' && caminho === '/payments') {
      const b = JSON.parse(op.body);
      const id = `pay_${conta}_${++falso.n}`;
      falso.valores[id] = b.value;
      return json(200, { id, value: b.value, dueDate: b.dueDate, invoiceUrl: 'https://sandbox.asaas.com/i/' + id, externalReference: b.externalReference });
    }
    if (op.method === 'GET' && caminho.endsWith('/pixQrCode')) return json(200, { payload: 'PIX' + conta, encodedImage: 'iVBORw0KGgo=' });
    if (op.method === 'GET' && caminho.startsWith('/payments/')) return json(200, { id: caminho.split('/')[2], status: 'RECEIVED', value: falso.valores[caminho.split('/')[2]] });
    if (op.method === 'GET' && caminho.startsWith('/payments?externalReference=')) return json(200, { data: [] });
    return json(404, {});
  };
  const nomes = ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_API_URL', 'ASAAS2_API_KEY', 'ASAAS2_WEBHOOK_TOKEN', 'ASAAS2_API_URL'];
  const env = Object.fromEntries(nomes.map((k) => [k, process.env[k]]));
  const gu = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'guias', ...b });
  const hookB = (token, corpo) => fetchReal(base + '/api/oferendas?webhook=asaas2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) }, body: JSON.stringify(corpo),
  }).then((r) => r.status);
  let grupoId;
  try {
    Object.assign(process.env, { ASAAS_API_KEY: 'chave-a', ASAAS_WEBHOOK_TOKEN: 'token-a', ASAAS_API_URL: BASES.A });
    delete process.env.ASAAS2_API_KEY; delete process.env.ASAAS2_WEBHOOK_TOKEN;
    await api('POST', '/api/oferendas', ADMIN, { acao: 'asaas', op: 'ativar', ativo: true });
    let G = (await gu(ADMIN, { op: 'grupo', descricao: 'Doação teste' })).json;
    grupoId = G.grupos.find((x) => x.descricao === 'Doação teste').id;
    await gu(ADMIN, { op: 'item', grupoId, descricao: 'Vela', quantidade: 10, valor: '10' });
    G = (await gu(ADMIN, { op: 'item', grupoId, descricao: 'Doação livre', quantidade: 10, valor: '25', doacao: true })).json;
    const grupo = G.grupos.find((x) => x.id === grupoId);
    const vela = grupo.itens.find((i) => i.descricao === 'Vela');
    const doacao = grupo.itens.find((i) => i.descricao === 'Doação livre');
    assert.equal(doacao.doacao, true);
    assert.equal(vela.doacao, false);
    // Sem a conta B configurada, o Pix da doação avisa (a venda continua na A).
    assert.equal((await gu(ADMIN, { op: 'pedir', itemId: doacao.id, quantidade: 1, cpf: '52998224725' })).status, 400, 'doação sem valor');
    G = (await gu(ADMIN, { op: 'pedir', itemId: doacao.id, quantidade: 1, valor: '25,50', cpf: '52998224725' })).json;
    assert.match(G.aviso || '', /conta B/);
    assert.equal(G.grupos.find((x) => x.id === grupoId).itens.find((i) => i.id === doacao.id).quantidade, 10, 'doação não mexe no estoque');
    Object.assign(process.env, { ASAAS2_API_KEY: 'chave-b', ASAAS2_WEBHOOK_TOKEN: 'token-b', ASAAS2_API_URL: BASES.B });
    G = (await gu(ADMIN, { op: 'pedir', itemId: vela.id, quantidade: 2, cpf: '52998224725' })).json;
    const minhas = G.cobrancas.filter((c) => c.status === 'pendente' && c.pedido === grupo.aberto);
    assert.deepEqual(minhas.map((c) => [c.conta, c.valor]).sort(), [['A', 20], ['B', 25.5]], 'uma cobrança em cada conta; a doação com o valor digitado');
    const pagB = falso.pedidos.find(([c, m, cam]) => c === 'B' && m === 'POST' && cam === '/payments');
    assert.match(pagB[3].description, /Doação/);
    assert.ok(falso.pedidos.some(([c, m, cam]) => c === 'B' && m === 'POST' && cam === '/customers'), 'cliente criado também na conta B');
    // Webhook da conta B: token próprio; confere na conta B e marca a doação como paga.
    assert.equal(await hookB('token-a', { id: 'evt_b0', event: 'PAYMENT_CREATED' }), 401);
    const idB = Object.keys(falso.valores).find((k) => k.startsWith('pay_B_'));
    assert.equal(await hookB('token-b', { id: 'evt_b1', event: 'PAYMENT_RECEIVED', payment: { id: idB } }), 200);
    const linhas = (await api('GET', '/api/oferendas?lista=guias', ADMIN)).json.pedidos.flatMap((pe) => pe.linhas).filter((l) => l.grupoId === grupoId);
    assert.equal(linhas.find((l) => l.itemId === doacao.id).pago, true, 'doação paga pelo webhook da conta B');
    assert.equal(linhas.find((l) => l.itemId === vela.id).pago, false, 'a venda continua esperando o Pix da conta A');
  } finally {
    globalThis.fetch = fetchReal;
    for (const k of nomes) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
    await api('POST', '/api/oferendas', ADMIN, { acao: 'asaas', op: 'ativar', ativo: false });
    if (grupoId) await gu(ADMIN, { op: 'excluirGrupo', id: grupoId });
  }
});

test('Compras: item CPJ só para quem está cadastrado na corrente', async () => {
  const gu = (tok, b) => api('POST', '/api/oferendas', tok, { acao: 'guias', ...b });
  const ler = (tok) => api('GET', '/api/oferendas?lista=guias', tok);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Aluna Das Compras' });
  const tSemSenha = (await tokenAluno('aluna das compras'));
  const idAlunaCompras = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos.find((a) => a.nome === 'Aluna Das Compras').id;
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: idAlunaCompras, celular: '11981230002' });
  const tAluna = (await api('POST', '/api/auth/criarSenha', tSemSenha, { senha: '24682468', celular: '11981230002' })).json.token;   // a aba Compras pede senha
  let G = (await gu(ADMIN, { op: 'grupo', descricao: 'Grupo CPJ' })).json;
  const g = G.grupos.find((x) => x.descricao === 'Grupo CPJ');
  G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Item de todos', quantidade: 5, valor: 10 })).json;
  G = (await gu(ADMIN, { op: 'item', grupoId: g.id, descricao: 'Item da corrente', quantidade: 5, valor: 7 })).json;
  let itens = G.grupos.find((x) => x.id === g.id).itens;
  const cpj = itens.find((i) => i.descricao === 'Item da corrente');
  assert.equal(cpj.cpj, false, 'nasce desligado');
  assert.equal((await gu(ADMIN, { op: 'item', id: cpj.id, cpj: 'sim' })).status, 400);
  itens = (await gu(ADMIN, { op: 'item', id: cpj.id, cpj: true })).json.grupos.find((x) => x.id === g.id).itens;
  assert.equal(itens.find((i) => i.id === cpj.id).cpj, true);
  assert.equal((await gu(USER, { op: 'item', id: cpj.id, cpj: false })).status, 403, 'só quem administra liga e desliga');
  await gu(ADMIN, { op: 'publicar', publicada: true });
  if (!(await ler(ADMIN)).json.grupos.find((x) => x.id === g.id).aberto) await gu(ADMIN, { op: 'novo', grupoId: g.id });
  try {
    const nomes = async (tok) => ((await ler(tok)).json.grupos.find((x) => x.id === g.id)?.itens || []).map((i) => i.descricao);
    assert.deepEqual(await nomes(USER), ['Item de todos', 'Item da corrente'], 'corrente vê o item CPJ');
    assert.deepEqual(await nomes(tAluna), ['Item de todos'], 'aluno não recebe o item CPJ');
    assert.equal((await gu(tAluna, { op: 'pedir', itemId: cpj.id, quantidade: 1 })).status, 400, 'nem consegue pedir');
    assert.equal((await gu(USER, { op: 'pedir', itemId: cpj.id, quantidade: 1 })).status, 200);
    await gu(ADMIN, { op: 'item', id: cpj.id, cpj: false });
    assert.deepEqual(await nomes(tAluna), ['Item de todos', 'Item da corrente'], 'desligado, todos veem');
  } finally {
    await gu(ADMIN, { op: 'excluirGrupo', id: g.id });
    await gu(ADMIN, { op: 'publicar', publicada: false });
  }
});

test('pagamentos em atraso (conta B do ASAAS): cada um os seus pelo CPF, o root todos', async () => {
  const fetchReal = globalThis.fetch;
  const BASE = 'http://asaasb.teste/v3';
  const BASE_A = 'http://asaasa.teste/v3';
  const falso = { pedidos: [], falhar: false, contaA: [] };
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    // Conta A (Compras): as vencidas que o teste montar em falso.contaA; o cliente que o app criou tem a chave da pessoa.
    if (u.startsWith(BASE_A)) {
      const c = u.slice(BASE_A.length);
      const j = (st, x) => new Response(JSON.stringify(x), { status: st, headers: { 'Content-Type': 'application/json' } });
      if (c.startsWith('/payments?status=OVERDUE')) return j(200, { hasMore: false, data: falso.contaA });
      if (c.startsWith('/customers/')) return j(200, { id: c.split('/')[2], name: 'Cliente A', externalReference: falso.refCliente });
      return j(404, {});
    }
    if (!u.startsWith(BASE)) return fetchReal(url, op);
    const caminho = u.slice(BASE.length);
    falso.pedidos.push([op.method, caminho, op.headers?.access_token]);
    const json = (st, j) => new Response(JSON.stringify(j), { status: st, headers: { 'Content-Type': 'application/json' } });
    if (falso.falhar) return json(500, {});
    if (caminho.startsWith('/payments?status=OVERDUE')) {
      return json(200, { hasMore: false, data: [
        { id: 'pay_ana', customer: 'cus_ana', value: 120, dueDate: '2026-10-10', description: 'Mensalidade outubro', invoiceUrl: 'https://www.asaas.com/i/pay_ana' },
        { id: 'pay_ext', customer: 'cus_ext', value: 50.5, dueDate: '2026-10-20', description: 'Doação', invoiceUrl: 'javascript:alert(1)' },
      ] });
    }
    if (caminho === '/customers/cus_ana') return json(200, { id: 'cus_ana', name: 'Ana no ASAAS', cpfCnpj: '52998224725' });
    if (caminho === '/customers/cus_ext') return json(200, { id: 'cus_ext', name: 'Fulano Externo', cpfCnpj: '15350946056', mobilePhone: '11988887777' });
    return json(404, { errors: [{ description: 'não encontrado' }] });
  };
  const env = { CPF_CHAVE: process.env.CPF_CHAVE, ASAAS2_API_KEY: process.env.ASAAS2_API_KEY, ASAAS2_API_URL: process.env.ASAAS2_API_URL,
    ASAAS_API_KEY: process.env.ASAAS_API_KEY, ASAAS_API_URL: process.env.ASAAS_API_URL };
  const ler = (tok, atualizar) => api('GET', '/api/giras?lista=atrasos' + (atualizar ? '&atualizar=1' : ''), tok);
  try {
    process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
    delete process.env.ASAAS2_API_KEY;
    delete process.env.ASAAS_API_KEY;
    assert.equal((await ler(ADMIN)).json.configurado, false, 'sem a chave de nenhuma conta');
    Object.assign(process.env, { ASAAS2_API_KEY: 'chave-b', ASAAS2_API_URL: BASE });

    await api('POST', '/api/pessoas', ADMIN, { nome: 'Atraso Ana, Atraso Bia, Atraso Sem Senha', funcao: 'cambone' });
    const tAna = await entrarComSenha('Atraso Ana');
    const tBia = await entrarComSenha('Atraso Bia');
    assert.equal((await api('POST', '/api/auth/cpf', tAna, { cpf: '529.982.247-25' })).status, 200);
    const semSenha = (await tokenCorrente('Atraso Sem Senha'));

    const ana = (await ler(tAna)).json;
    assert.equal(ana.configurado, true);
    assert.deepEqual(ana.atrasos, [{ id: 'pay_ana', conta: 'B', valor: 120, vencimento: '2026-10-10', descricao: 'Mensalidade outubro', link: 'https://www.asaas.com/i/pay_ana' }],
      'a pessoa vê só a sua, sem nome nem telefone');
    assert.ok(falso.pedidos.every(([, , chave]) => chave === 'chave-b'), 'usa a chave da conta B');
    assert.deepEqual((await ler(tBia)).json.atrasos, [], 'sem CPF que bata, nada');
    assert.equal((await ler(semSenha)).json.semSenha, true, 'acesso da corrente sem senha não vê pagamentos');
    assert.deepEqual((await ler(semSenha)).json.atrasos, []);
    // Ver como do root: mostra o que a pessoa veria, mesmo sem a senha, com o aviso.
    const semSenhaId = sql("select id from pessoas where nome = 'Atraso Sem Senha'");
    const vc = await (await fetch(base + '/api/giras?lista=atrasos', { headers: { Authorization: 'Bearer ' + ADMIN, 'X-Ver-Como': 'p:' + semSenhaId } })).json();
    assert.equal(vc.verComoSemSenha, true);
    assert.equal(vc.root, false);
    // Aluno: vê só as próprias, e só com a senha.
    await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Atraso Aluno' });
    const alunoId = sql("select id from alunos where nome = 'Atraso Aluno'");
    sql(`insert into asaas2_atrasos (conta, id, nome, valor, vencimento, descricao, aluno_id) values ('B', 'pay_al', 'Cliente', 90, '2026-10-05', 'Mensalidade aluno', '${alunoId}')`);
    assert.equal((await ler(await tokenAluno('Atraso Aluno'))).json.semSenha, true, 'aluno sem senha não vê');
    sql(`update alunos set pin_hash = 'x' where id = '${alunoId}'`);
    assert.deepEqual((await ler(await tokenAluno('Atraso Aluno'))).json.atrasos.map((x) => x.id), ['pay_al']);
    assert.ok(!(await ler(tAna)).json.atrasos.some((x) => x.id === 'pay_al'), 'a da corrente não vê a do aluno');
    sql("delete from asaas2_atrasos where id = 'pay_al'");
    await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: alunoId });

    const root = (await ler(ADMIN)).json;
    assert.equal(root.root, true);
    assert.deepEqual(root.atrasos.map((a) => [a.id, a.nome, a.ligado]), [['pay_ana', 'Atraso Ana', true], ['pay_ext', 'Fulano Externo', false]]);
    assert.equal(root.atrasos[1].telefone, '11988887777');
    assert.equal(root.atrasos[1].link, '', 'link que não é https não passa');
    assert.match(root.atualizadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

    // Leitura guardada: sem Atualizar, não chama o ASAAS de novo; quem não é root não força.
    const n = falso.pedidos.length;
    await ler(ADMIN); await ler(USER, true);
    assert.equal(falso.pedidos.length, n, 'usa a leitura guardada (o Atualizar da pessoa logo depois não chama o ASAAS)');
    await ler(ADMIN, true);
    assert.ok(falso.pedidos.length > n, 'Atualizar do root lê de novo');

    // Atualizar da pessoa: só lê de novo se a última leitura tiver mais de 1 minuto.
    const m = falso.pedidos.length;
    await ler(tAna, true);
    assert.equal(falso.pedidos.length, m, 'logo depois de uma leitura, a pessoa recebe a guardada');
    sql("update sistema set valor = (now() - interval '2 minutes')::text where chave = 'asaas2_atualizado'");
    await ler(tAna, true);
    assert.ok(falso.pedidos.length > m, 'com mais de 1 minuto, o Atualizar da pessoa lê o ASAAS');

    // ASAAS fora do ar: o Atualizar do root avisa; o da pessoa e a leitura vencida mostram a última, com aviso.
    falso.falhar = true;
    assert.equal((await ler(ADMIN, true)).status, 502);
    sql("update sistema set valor = (now() - interval '2 minutes')::text where chave = 'asaas2_atualizado'");
    const pessoaFalhou = await ler(tAna, true);
    assert.equal(pessoaFalhou.status, 200);
    assert.match(pessoaFalhou.json.erro, /última leitura/);
    sql("update sistema set valor = (now() - interval '1 hour')::text where chave = 'asaas2_atualizado'");
    const velha = (await ler(tAna)).json;
    assert.match(velha.erro, /última leitura/);
    assert.equal(velha.atrasos.length, 1);
    falso.falhar = false;

    // Conta A (Compras): a vencida de fora do app conta; a do app só enquanto tiver item por pagar ligado a ela.
    const anaId = sql("select id from pessoas where nome = 'Atraso Ana'");
    const novaCobranca = () => sql(`with x as (insert into asaas_cobrancas (chave, nome, pedido, valor, status) values ('p:${anaId}', 'Atraso Ana', 1, 30, 'vencida') returning id) select id from x`);
    const viva = novaCobranca();
    const trocada = novaCobranca();
    sql(`insert into guias_linhas (pedido, descricao, valor, quantidade, chave, nome, cobranca_id) values (1, 'Teste · Guia', 30, 1, 'p:${anaId}', 'Atraso Ana', '${viva}')`);
    falso.refCliente = 'p:' + anaId;
    falso.contaA = [
      { id: 'pay_viva', customer: 'cus_a', value: 30, dueDate: '2026-11-01', description: 'CPJ · Compras · pedido nº 1', externalReference: viva, invoiceUrl: 'https://www.asaas.com/i/pay_viva' },
      { id: 'pay_trocada', customer: 'cus_a', value: 30, dueDate: '2026-10-30', description: 'CPJ · Compras · pedido nº 1', externalReference: trocada, invoiceUrl: 'https://www.asaas.com/i/pay_trocada' },
      { id: 'pay_fora', customer: 'cus_a', value: 15, dueDate: '2026-10-25', description: 'Cobrança feita no ASAAS', invoiceUrl: 'https://www.asaas.com/i/pay_fora' },
    ];
    Object.assign(process.env, { ASAAS_API_KEY: 'chave-a', ASAAS_API_URL: BASE_A });
    const comA = (await ler(ADMIN, true)).json;
    assert.deepEqual(comA.contas, { A: true, B: true });
    assert.deepEqual(comA.atrasos.filter((a) => a.conta === 'A').map((a) => a.id).sort(), ['pay_fora', 'pay_viva'], 'o link trocado por outro não conta');
    assert.ok(comA.atrasos.filter((a) => a.conta === 'A').every((a) => a.nome === 'Atraso Ana'), 'ligada à pessoa pela chave do cliente');
    assert.deepEqual((await ler(tAna)).json.atrasos.map((a) => [a.conta, a.id]).sort(), [['A', 'pay_fora'], ['A', 'pay_viva'], ['B', 'pay_ana']], 'a pessoa vê as suas das duas contas');
    // Pagou o item: o link some sem precisar ler o ASAAS de novo.
    sql(`update guias_linhas set pago_em = now() where cobranca_id = '${viva}'`);
    assert.ok(!(await ler(ADMIN)).json.atrasos.some((a) => a.id === 'pay_viva'));
    sql(`delete from guias_linhas where cobranca_id = '${viva}'`);
    sql(`delete from asaas_cobrancas where id in ('${viva}', '${trocada}')`);
  } finally {
    globalThis.fetch = fetchReal;
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('Criar cadastro começa pelo CPF: quem já tem cadastro só entra ou cria a senha', async () => {
  const chaveAntes = process.env.CPF_CHAVE;
  process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
  const cad = (b) => api('POST', '/api/auth/cadastrar', null, b);
  const CIDA = '100.007.919-89';
  const ALUNO = '10001583816';
  try {
    // Pessoa da corrente com o CPF gravado sem hash (como os de antes da v130): a busca preenche.
    await api('POST', '/api/pessoas', ADMIN, { nome: 'Cida Cpf', funcao: 'medium' });
    const cida = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Cida Cpf').id;
    await api('POST', '/api/auth/perfil', ADMIN, { pessoaId: cida, info: { celular: '11944443333' } });
    assert.equal((await api('POST', '/api/auth/cpf', ADMIN, { pessoaId: cida, cpf: CIDA })).status, 200);
    sql(`update pessoas_cpf set hash = '' where pessoa_id = '${cida}'`);

    assert.equal((await cad({ cpf: '111.111.111-11', verificar: true })).status, 400, 'CPF inválido');
    assert.deepEqual((await cad({ cpf: ALUNO, verificar: true })).json, { existe: false });
    assert.deepEqual((await cad({ cpf: CIDA, verificar: true })).json, { existe: true, temSenha: false, confirmar: 'celular' });
    assert.notEqual(sql(`select hash from pessoas_cpf where pessoa_id = '${cida}'`), '', 'a busca preencheu o hash');

    // Não cria outro cadastro com o mesmo CPF.
    const dup = await cad({ nome: 'Outra Pessoa', celular: '11933332222', email: 'outra.cpf@exemplo.com', cpf: CIDA, senha: '123456' });
    assert.equal(dup.status, 400);
    assert.match(dup.json.erro, /já tem cadastro com esse CPF/);

    // Sem senha: confirma o celular do cadastro e cria a senha; o cadastro continua o mesmo.
    const cs = (b) => api('POST', '/api/auth/criarSenhaContato', null, { cpf: CIDA, ...b });
    assert.match((await cs({ confirmacao: '11900000000', senha: '135790' })).json.erro, /não confere/);
    const criada = await cs({ confirmacao: '(11) 94444-3333', senha: '135790' });
    assert.equal(criada.status, 200, JSON.stringify(criada.json));
    assert.equal(criada.json.usuario.papel, 'corrente');
    assert.equal(criada.json.usuario.pessoaId, cida);
    assert.equal((await cs({ confirmacao: '(11) 94444-3333', senha: '135790' })).status, 400, 'só cria uma vez');

    // Com senha: entra pelo CPF.
    assert.deepEqual((await cad({ cpf: CIDA, verificar: true })).json, { existe: true, temSenha: true });
    assert.equal((await api('POST', '/api/auth/entrar', null, { cpf: CIDA, senha: '000000' })).status, 401);
    const ent = await api('POST', '/api/auth/entrar', null, { cpf: '10000791989', senha: '135790' });
    assert.equal(ent.status, 200, JSON.stringify(ent.json));
    assert.equal(ent.json.usuario.pessoaId, cida);
    // As abas seguem o cadastro: a mesma sessão (e as mesmas permissões) do antigo acesso cpj.
    const meCpf = (await api('GET', '/api/auth/me', ent.json.token)).json;
    const meCorrente = (await api('GET', '/api/auth/me', await tokenCorrente('Cida Cpf'))).json;
    assert.equal(meCpf.corrente, true);
    assert.equal(meCpf.grupo, undefined);
    assert.deepEqual(meCpf.permissoes, meCorrente.permissoes);

    // Aluno novo pelo Criar cadastro: depois, o mesmo CPF acha o aluno.
    const novo = await cad({ nome: 'Aluno Cpf Novo', celular: '11922221111', email: 'aluno.cpf@exemplo.com', cpf: ALUNO, senha: '246810' });
    assert.equal(novo.status, 200, JSON.stringify(novo.json));
    assert.deepEqual((await cad({ cpf: ALUNO, verificar: true })).json, { existe: true, temSenha: true });
    const entAluno = (await api('POST', '/api/auth/entrar', null, { cpf: ALUNO, senha: '246810' })).json;
    assert.equal(entAluno.usuario.grupo, 'alunos');
    // As abas seguem o cadastro: a mesma sessão do antigo acesso alunos.
    const meAluno = (await api('GET', '/api/auth/me', entAluno.token)).json;
    assert.equal(meAluno.grupo, 'alunos');
    assert.equal(meAluno.corrente, false);
    assert.deepEqual(meAluno.permissoes, (await api('GET', '/api/auth/me', await tokenAluno('Aluno Cpf Novo'))).json.permissoes);
    assert.equal((await api('GET', '/api/giras', entAluno.token)).status, 403, 'aluno não vê a aba Gira');

    // Nome de alguém da corrente não vira aluno (a pessoa da corrente sem CPF no cadastro).
    const mesmoNome = await cad({ nome: 'cida cpf', celular: '11911110000', email: 'cida2@exemplo.com', cpf: '10002375753', senha: '123456' });
    assert.equal(mesmoNome.status, 400);
    assert.match(mesmoNome.json.erro, /alguém da corrente/);

    const alunoId = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json.alunos.find((a) => a.nome === 'Aluno Cpf Novo').id;
    await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: alunoId });
    await api('DELETE', '/api/pessoas/' + cida, ADMIN);
  } finally {
    if (chaveAntes === undefined) delete process.env.CPF_CHAVE; else process.env.CPF_CHAVE = chaveAntes;
  }
});

test('turma Curimba: o aluno posto nela entra nas aulas; no UP CPJ as aulas vão para a pessoa', async () => {
  const A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
  const turmaCurimba = A.turmas.find((t) => t.nome === 'Curimba').id;
  // Cadastrou sozinho (aluno sem turma); o admin põe na turma Curimba.
  const criado = (await api('POST', '/api/pessoas', ADMIN, { acao: 'alunos', nome: 'Tamboreira Nova' })).json.alunos.find((a) => a.nome === 'Tamboreira Nova');
  assert.ok(!(await api('GET', '/api/pessoas?lista=curimba', ADMIN)).json.alunos.some((a) => a.alunoId === criado.id), 'sem turma, ainda não');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: criado.id, turmaId: turmaCurimba });
  let C = (await api('GET', '/api/pessoas?lista=curimba', ADMIN)).json;
  const linha = C.alunos.find((a) => a.alunoId === criado.id);
  assert.equal(linha?.nome, 'Tamboreira Nova', 'na turma Curimba, entra nos alunos de curimba');
  C = (await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaAula', data: '2035-01-06', nome: 'Ijexá' })).json;
  const aula = C.aulas.find((a) => a.data === '2035-01-06');
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaPresenca', aulaId: aula.id, alunoId: linha.id, status: 'p' });
  const minhaAula = (tok) => api('GET', '/api/pessoas?lista=minhaCurimba', tok).then((x) => x.json.aulas.filter((a) => a.data === '2035-01-06'));
  assert.deepEqual(await minhaAula(await tokenAluno('Tamboreira Nova')), [{ data: '2035-01-06', nome: 'Ijexá', status: 'p' }]);
  // UP CPJ: vira pessoa da corrente e as aulas continuam com ela.
  const up = await api('POST', '/api/pessoas', ADMIN, { acao: 'promoverAlunoCPJ', id: criado.id });
  assert.equal(up.status, 200, JSON.stringify(up.json));
  const pessoa = up.json.pessoas.find((p) => p.nome === 'Tamboreira Nova');
  C = (await api('GET', '/api/pessoas?lista=curimba', ADMIN)).json;
  assert.equal(C.alunos.find((a) => a.id === linha.id)?.pessoaId, pessoa.id);
  assert.deepEqual(await minhaAula(await tokenCorrente('Tamboreira Nova')), [{ data: '2035-01-06', nome: 'Ijexá', status: 'p' }]);
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaExcluirAula', id: aula.id });
  await api('POST', '/api/pessoas', ADMIN, { acao: 'curimbaExcluirAluno', id: linha.id });
  await api('DELETE', '/api/pessoas/' + pessoa.id, ADMIN);
});

test('oferendas: o nome de quem doou vem do cadastro; chave fora do formato não quebra a lista', async () => {
  const of = (b, tok = ADMIN) => api('POST', '/api/oferendas', tok, b);
  let r = (await of({ acao: 'salvar', responsavelId: RESP(), titulo: 'Nomes das doações', data: '2039-01-01' })).json;
  const o = r.oferendas.find((x) => x.titulo === 'Nomes das doações');
  await of({ acao: 'status', id: o.id, status: 'publicado' });
  r = (await of({ acao: 'item', oferendaId: o.id, nome: 'Flores', quantidade: 20, entrega: '' })).json;
  const item = r.oferendas.find((x) => x.id === o.id).itens[0];
  assert.equal((await of({ acao: 'doar', itemId: item.id, quantidade: 1 })).status, 200);
  assert.equal((await of({ acao: 'doar', itemId: item.id, quantidade: 2 }, await tokenCorrente('Ana'))).status, 200);
  // Doações antigas: só com o nome digitado e com uma chave fora do formato.
  sql(`insert into oferenda_doacoes (item_id, pessoa_chave, pessoa_nome, quantidade) values ('${item.id}', 'n:fulano', 'Fulano', 1), ('${item.id}', 'p:antiga', 'Zé Antigo', 1)`);
  const lido = await api('GET', '/api/oferendas', ADMIN);
  assert.equal(lido.status, 200, JSON.stringify(lido.json));
  // As duas antigas entram no mesmo instante: a ordem entre elas não importa.
  const nomes = lido.json.oferendas.find((x) => x.id === o.id).itens[0].doacoes.map((d) => [d.nome, d.quantidade]);
  const admin = (await api('GET', '/api/auth/me', ADMIN)).json.nome;
  assert.deepEqual(nomes.slice(0, 2), [[admin, 1], ['Ana', 2]]);
  assert.deepEqual(nomes.slice(2).sort(), [['Fulano', 1], ['Zé Antigo', 1]]);
  await of({ acao: 'excluir', id: o.id });
});

test('Admin root: usuários, perfis e senhas numa chamada só (lista=tudo)', async () => {
  assert.equal((await api('GET', '/api/usuarios?lista=tudo', USER)).status, 403);
  const tudo = (await api('GET', '/api/usuarios?lista=tudo', ADMIN)).json;
  const [u, f, s] = await Promise.all(['', '?lista=perfis', '?lista=senhas'].map((q) => api('GET', '/api/usuarios' + q, ADMIN).then((r) => r.json)));
  assert.deepEqual(tudo, { usuarios: u, perfis: f, senhas: s });
  assert.ok(!JSON.stringify(tudo.usuarios).includes('sessaoVersao'), 'sem a versão da sessão, como na lista de sempre');
});

test('v133: quem era do Admin ervas vai para o Admin oferendas e o perfil sai', async () => {
  // Um banco de antes da v133: o perfil Admin ervas com uma pessoa.
  const abasOf = sql("select abas::text from perfis where chave = 'admin_oferendas'");
  sql(`update perfis set abas = abas || '{"ervas": {"ver": true, "editar": false}}'::jsonb where chave = 'admin_oferendas'`);
  sql(`insert into perfis (chave, nome, abas, ordem) values ('admin_ervas', 'Admin ervas', '{"ervas": {"ver": true, "editar": true}}'::jsonb, 4)`);
  await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa Ervas Antiga', funcao: 'senha' });
  const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Pessoa Ervas Antiga');
  assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'ervas.antiga@corrente.org', senha: 'senha-forte-9', papel: 'admin_ervas' })).status, 200);
  const antes = (await api('POST', '/api/auth/entrar', null, { email: 'ervas.antiga@corrente.org', senha: 'senha-forte-9' })).json.token;

  // As instruções da v133 (as que falam do Admin ervas), como rodam no deploy; de novo não muda nada.
  const v133 = MIGRACOES.filter((q) => q.includes('admin_ervas'));
  assert.equal(v133.length, 3);
  for (let i = 0; i < 2; i++) for (const q of v133) sql(q);

  assert.equal(sql("select papel from usuarios where email = 'ervas.antiga@corrente.org'"), 'admin_oferendas');
  assert.equal(sql("select count(*) from perfis where chave = 'admin_ervas'"), '0');
  assert.equal(sql("select abas -> 'ervas' ->> 'editar' from perfis where chave = 'admin_oferendas'"), 'true');
  assert.equal((await api('GET', '/api/auth/me', antes)).status, 401, 'a sessão do perfil antigo cai');
  const depois = (await api('POST', '/api/auth/entrar', null, { email: 'ervas.antiga@corrente.org', senha: 'senha-forte-9' })).json.token;
  assert.equal((await api('POST', '/api/ervas', depois, { acao: 'config', frete: '0' })).status, 200, 'continua administrando as ervas');

  const u = (await api('GET', '/api/usuarios', ADMIN)).json.find((x) => x.email === 'ervas.antiga@corrente.org');
  await api('DELETE', '/api/usuarios/' + u.id, ADMIN);
  sql(`update perfis set abas = '${abasOf.replace(/'/g, "''")}'::jsonb where chave = 'admin_oferendas'`);
});

test('cadastros pelo login: novo vira consulente; o consulente vê só o que o perfil Consulentes permite', async () => {
  const chaveAntes = process.env.CPF_CHAVE;
  process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
  const abasAntes = sql("select abas::text from perfis where chave = 'consulente'");
  try {
    const cad = await api('POST', '/api/auth/cadastrar', null, { nome: 'Consulente Teste', celular: '11977001100', email: 'consulente@exemplo.com', cpf: '10003167003', senha: '24682468' });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    let A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
    const novo = A.cadastros.novos.find((c) => c.nome === 'Consulente Teste');
    assert.ok(novo, 'aparece em Novos');
    assert.equal(novo.email, 'consulente@exemplo.com');
    assert.ok(!A.turmas.some((t) => t.id === A.cadastros.turmaConsulentes), 'a turma Consulentes não aparece nas turmas');
    assert.equal((await api('GET', '/api/pessoas?lista=alunos', USER)).json?.cadastros, undefined, 'só quem edita alunos');

    // O admin põe em Consulentes: sai dos Novos e da lista de alunos.
    assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: novo.id, turmaId: A.cadastros.turmaConsulentes })).status, 200);
    A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
    assert.ok(!A.cadastros.novos.some((c) => c.id === novo.id));
    assert.ok(A.cadastros.consulentes.some((c) => c.id === novo.id), 'aparece em Consulentes');
    assert.ok(!A.alunos.some((a) => a.id === novo.id), 'não aparece entre os alunos');

    // O consulente entra pelo cadastro e vê só o que o perfil Consulentes permite (começa só com o Perfil).
    const tok = (await api('POST', '/api/auth/entrar', null, { email: 'consulente@exemplo.com', senha: '24682468' })).json.token;
    let me = (await api('GET', '/api/auth/me', tok)).json;
    assert.equal(me.consulente, true);
    assert.deepEqual(me.permissoes.sort(), ['alunos:ver', 'perfil:ver']);
    assert.equal((await api('GET', '/api/pessoas', tok)).status, 403, 'não vê os nomes da corrente');
    assert.equal((await api('GET', '/api/giras', tok)).status, 403, 'nem a escala');
    // O root marca Compras no perfil Consulentes: vale na hora.
    const abas = JSON.parse(abasAntes);
    assert.equal((await api('POST', '/api/usuarios', ADMIN, { acao: 'perfil', chave: 'consulente', abas: { ...abas, guias: { ver: true, editar: true }, pessoas: { ver: true, editar: false } } })).status, 200);
    me = (await api('GET', '/api/auth/me', tok)).json;
    assert.deepEqual(me.permissoes.sort(), ['alunos:ver', 'guias:pedir', 'perfil:ver'], 'só o Ver das abas dos consulentes (Pessoas e Editar não valem)');
    // O perfil Consulentes não vai para um usuário de e-mail.
    await api('POST', '/api/pessoas', ADMIN, { nome: 'Pessoa Consulente Email', funcao: 'senha' });
    const pe = (await api('GET', '/api/pessoas', ADMIN)).json.find((p) => p.nome === 'Pessoa Consulente Email');
    assert.equal((await api('POST', '/api/usuarios', ADMIN, { pessoaId: pe.id, email: 'nao@exemplo.com', senha: 'senha-forte-9', papel: 'consulente' })).status, 400);

    // Oferenda para "Alunos" não leva o consulente.
    const of = (await api('POST', '/api/oferendas', ADMIN, { acao: 'salvar', responsavelId: RESP(), titulo: 'Só alunos', data: '2040-01-01', porMedium: true, grupos: ['alunos'] })).json.oferendas.find((o) => o.titulo === 'Só alunos');
    assert.ok(!of.mediuns.some((m) => m.pessoaId === 'a:' + novo.id), 'consulente fora das oferendas dos alunos');
    await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: of.id });

    await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: novo.id });
    await api('POST', '/api/pessoas', ADMIN, { acao: 'apagarAluno', id: novo.id });
  } finally {
    sql(`update perfis set abas = '${abasAntes.replace(/'/g, "''")}'::jsonb where chave = 'consulente'`);
    if (chaveAntes === undefined) delete process.env.CPF_CHAVE; else process.env.CPF_CHAVE = chaveAntes;
  }
});

test('grupo Oferenda: vê as oferendas sem doar; o item de Todos vira compromisso de cada pessoa da lista', async () => {
  const chaveAntes = process.env.CPF_CHAVE;
  process.env.CPF_CHAVE = 'chave-de-teste-do-cpf-com-32-letras-ou-mais';
  let of;
  try {
    const cad = await api('POST', '/api/auth/cadastrar', null, { nome: 'Oferenda Teste', celular: '11977002200', email: 'grupo.oferenda@exemplo.com', cpf: '11144477735', senha: '13571357' });
    assert.equal(cad.status, 200, JSON.stringify(cad.json));
    let A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
    const novo = A.cadastros.novos.find((c) => c.nome === 'Oferenda Teste');
    assert.ok(A.cadastros.turmaOferenda && !A.turmas.some((t) => t.id === A.cadastros.turmaOferenda), 'a turma do grupo Oferenda não aparece nas turmas');

    // O admin põe no grupo Oferenda: sai dos Novos e da lista de alunos, e vai para a lista à parte.
    assert.equal((await api('POST', '/api/pessoas', ADMIN, { acao: 'aluno', id: novo.id, turmaId: A.cadastros.turmaOferenda })).status, 200);
    A = (await api('GET', '/api/pessoas?lista=alunos', ADMIN)).json;
    assert.ok(A.cadastros.oferenda.some((c) => c.id === novo.id), 'aparece no quadradinho Oferenda');
    assert.ok(!A.alunos.some((a) => a.id === novo.id), 'não aparece entre os alunos');
    assert.ok(A.grupoOferenda.some((a) => a.id === novo.id), 'vem na lista do grupo Oferenda');

    // Entra e só lê as oferendas (Geral e Oferendas); doar é recusado.
    const tok = (await api('POST', '/api/auth/entrar', null, { email: 'grupo.oferenda@exemplo.com', senha: '13571357' })).json.token;
    const me = (await api('GET', '/api/auth/me', tok)).json;
    assert.equal(me.grupoOferenda, true);
    assert.equal(me.aguardando, undefined);
    assert.deepEqual(me.permissoes.sort(), ['alunos:ver', 'oferendas:ver']);
    assert.equal((await api('GET', '/api/oferendas', tok)).status, 200);
    assert.equal((await api('GET', '/api/pessoas?lista=alunos', tok)).json.grupoOferenda, undefined, 'não recebe a lista do grupo');

    // Oferenda para Alunos não leva o grupo Oferenda; o admin põe a pessoa na lista.
    of = (await api('POST', '/api/oferendas', ADMIN, { acao: 'salvar', responsavelId: RESP(), titulo: 'Com o grupo', data: '2040-02-02', porMedium: true, grupos: ['alunos'] })).json.oferendas.find((o) => o.titulo === 'Com o grupo');
    assert.ok(!of.mediuns.some((m) => m.pessoaId === 'a:' + novo.id), 'fora das oferendas dos alunos');
    await api('POST', '/api/oferendas', ADMIN, { acao: 'incluirMedium', oferendaId: of.id, pessoaId: 'a:' + novo.id });
    await api('POST', '/api/oferendas', ADMIN, { acao: 'status', id: of.id, status: 'publicado' });
    // A oferenda por pessoa aceita item; Todos tira as doações e o item fica completo.
    let r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'item', oferendaId: of.id, nome: 'Vela', quantidade: 2, unidade: 'unidade', entrega: '' })).json;
    const item = r.oferendas.find((o) => o.id === of.id).itens[0];
    assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'doarPor', itemId: item.id, pessoaId: 'a:' + novo.id, quantidade: 1 })).status, 200, 'o admin atribui ao grupo Oferenda');
    assert.equal((await api('POST', '/api/oferendas', tok, { acao: 'doar', itemId: item.id, quantidade: 1 })).status, 403, 'o grupo Oferenda não escolhe');
    r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'itemTodos', id: item.id, todos: true })).json;
    const it = r.oferendas.find((o) => o.id === of.id).itens[0];
    assert.equal(it.todos, true);
    assert.deepEqual(it.doacoes, []);
    assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'doarPor', itemId: item.id, pessoaId: 'a:' + novo.id, quantidade: 1 })).status, 400, 'item de todos não recebe doação');
    const vista = (await api('GET', '/api/oferendas', tok)).json;
    const minha = vista.oferendas.find((o) => o.id === of.id);
    assert.equal(compromissosDe([minha], vista.eu.chave, '2030-01-01')[0].itens[0].q, 2, 'o item de todos é compromisso de quem está na lista');
    // Todos direto no cadastro do item; desmarcar na edição volta à escolha por pessoa.
    r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'item', oferendaId: of.id, nome: 'Flores', quantidade: 1, unidade: 'maço', entrega: '', todos: true })).json;
    const flores = r.oferendas.find((o) => o.id === of.id).itens.find((i) => i.nome === 'Flores');
    assert.equal(flores.todos, true);
    r = (await api('POST', '/api/oferendas', ADMIN, { acao: 'item', id: flores.id, nome: 'Flores', quantidade: 1, unidade: 'maço', entrega: '', todos: false })).json;
    assert.equal(r.oferendas.find((o) => o.id === of.id).itens.find((i) => i.id === flores.id).todos, false);
    // Todos só vale na oferenda por pessoa.
    const comum = (await api('POST', '/api/oferendas', ADMIN, { acao: 'salvar', responsavelId: RESP(), titulo: 'Comum todos', data: '2040-02-03' })).json.oferendas.find((o) => o.titulo === 'Comum todos');
    const ic = (await api('POST', '/api/oferendas', ADMIN, { acao: 'item', oferendaId: comum.id, nome: 'Rosa', quantidade: 1, unidade: 'unidade', entrega: '' })).json.oferendas.find((o) => o.id === comum.id).itens[0];
    assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'itemTodos', id: ic.id, todos: true })).status, 400);
    assert.equal((await api('POST', '/api/oferendas', ADMIN, { acao: 'item', oferendaId: comum.id, nome: 'Cravo', quantidade: 1, unidade: 'unidade', entrega: '', todos: true })).status, 400);
    await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: comum.id });

    await api('POST', '/api/pessoas', ADMIN, { acao: 'excluirAluno', id: novo.id });
    await api('POST', '/api/pessoas', ADMIN, { acao: 'apagarAluno', id: novo.id });
  } finally {
    if (of) await api('POST', '/api/oferendas', ADMIN, { acao: 'excluir', id: of.id });
    if (chaveAntes === undefined) delete process.env.CPF_CHAVE; else process.env.CPF_CHAVE = chaveAntes;
  }
});

test('diário: só o root vê até ligar; cada um lê e grava só o seu, com os dados limpos', async () => {
  const pub = (publicada, tok = ADMIN) => api('POST', '/api/pessoas', tok, { acao: 'diario', op: 'publicar', publicada });
  const ler = (tok) => api('GET', '/api/pessoas?lista=diario', tok);
  const salvar = (tok, data, dados) => api('POST', '/api/pessoas', tok, { acao: 'diario', op: 'salvar', data, dados });
  const ana = await tokenCorrente('Ana');
  assert.equal((await pub(true, ana)).status, 403, 'só o root liga');
  assert.equal((await pub(false)).json.publicada, false);
  assert.equal((await ler(ana)).status, 403);
  assert.equal((await ler(ADMIN)).status, 200);
  assert.equal((await pub(true)).json.publicada, true);
  assert.equal((await api('GET', '/api/auth/me', ana)).json.diarioPublicada, true);
  const r = await salvar(ana, '2024-03-02', { antes: { emo: 'ansioso', energia: 9 }, lixo: 1, banho: { ervas: ['arruda', ''] } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.dados, { antes: { emo: ['ansioso'] }, banho: { ervas: ['arruda'], feito: false, origem: 'guia' } });
  assert.equal((await salvar(ana, '2999-01-01', { antes: { emo: 'paz' } })).status, 400, 'dia que ainda não chegou');
  assert.deepEqual((await ler(ana)).json.dias.map((d) => d.data), ['2024-03-02']);
  assert.equal((await ler(ADMIN)).json.dias.some((d) => d.data === '2024-03-02'), false, 'o root não vê o diário dos outros');
  await salvar(ana, '2024-03-02', {});
  assert.equal((await ler(ana)).json.dias.length, 0, 'dia vazio é apagado');
  await pub(false);
});

test('diário: cuidados do dia e Galeria de fotos (uma por pessoa, curtidas, exclusão)', async () => {
  const pub = (publicada) => api('POST', '/api/pessoas', ADMIN, { acao: 'diario', op: 'publicar', publicada });
  const ler = (tok) => api('GET', '/api/pessoas?lista=diario', tok);
  const op = (tok, b) => api('POST', '/api/pessoas', tok, { acao: 'diario', ...b });
  const ana = await tokenCorrente('Ana');
  await pub(true);
  const r = await op(ana, { op: 'salvar', data: '2024-03-05', dados: { habitos: { preceito: true, agua: true, litros: '1,5', banho: true, ervas: ['arruda', 'inventada'] } } });
  assert.deepEqual(r.json.dados, { habitos: { preceito: true, agua: true, litros: 1.5, banho: true, ervas: ['arruda'] } });
  await op(ana, { op: 'salvar', data: '2024-03-05', dados: {} });

  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
  assert.deepEqual((await ler(ana)).json.galeria, []);
  assert.equal((await op(ana, { op: 'fotoEnviar', foto: Buffer.alloc(200, 1).toString('base64') })).status, 400, 'só JPEG');
  const env = await op(ana, { op: 'fotoEnviar', foto: jpeg, descricao: '  Gira  linda ' });
  assert.equal(env.status, 200, JSON.stringify(env.json));
  const [f] = env.json.galeria;
  assert.equal(f.descricao, 'Gira linda');
  assert.equal(f.minha, true);
  assert.equal((await op(ana, { op: 'fotoEnviar', foto: jpeg })).status, 400, 'uma foto por pessoa');
  const img = await fetch(`${base}/api/pessoas?lista=diarioFoto&id=${f.id}&v=${f.v}`);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), jpeg);
  assert.equal((await op(ADMIN, { op: 'fotoCurtir', id: f.id })).json.galeria[0].curtidas, 1);
  const g = (await ler(ADMIN)).json.galeria[0];
  assert.equal(g.curti, true);
  assert.equal(g.minha, false);
  assert.equal((await op(ADMIN, { op: 'fotoCurtir', id: f.id })).json.galeria[0].curtidas, 0, 'tocar de novo descurte');
  // A semana da galeria acaba na terça: foto antiga some na próxima leitura.
  sql(`update diario_fotos set criado_em = now() - interval '8 days' where id = '${f.id}'`);
  assert.deepEqual((await ler(ana)).json.galeria, []);
  const nova = (await op(ana, { op: 'fotoEnviar', foto: jpeg })).json.galeria[0];
  assert.equal((await op(ADMIN, { op: 'fotoExcluir', id: nova.id })).status, 200, 'o root apaga qualquer uma');
  await pub(false);
});

test('rota antiga /sortear e /remanejar (app da versão anterior) chega na ação pelo rewrite do vercel.json', async () => {
  const d = '2027-09-04';
  await api('PUT', `/api/giras/${d}`, ADMIN, { entidade: 'caboclos' });
  assert.equal((await api('POST', `/api/giras/${d}/sortear`, USER)).status, 403);
  const s = await api('POST', `/api/giras/${d}/sortear`, ADMIN);
  assert.equal(s.status, 200);
  assert.ok(s.json.mensagem);
  assert.equal((await api('POST', `/api/giras/${d}/remanejar`, ADMIN)).status, 200);
  assert.equal((await api('POST', `/api/giras/${d}/outra`, ADMIN)).status, 404);
  await api('DELETE', `/api/giras/${d}`, ADMIN);
});
