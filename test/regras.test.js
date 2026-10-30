// Testes das regras puras (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDaEntidade, funcaoNaGira, pessoasDaGira, sortear, paresPorMedium } from '../shared/regras.js';

test('entidade da gira é reconhecida com variações de escrita', () => {
  assert.equal(linhaDaEntidade('Preto Velho'), 'preto-velho');
  assert.equal(linhaDaEntidade('Pretos Velhos'), 'preto-velho');
  assert.equal(linhaDaEntidade('  pomba-gira '), 'pomba-gira');
  assert.equal(linhaDaEntidade('Pombagira'), 'pomba-gira');
  assert.equal(linhaDaEntidade('ERÊS'), 'eres');
  assert.equal(linhaDaEntidade('Exu Mirim'), 'exu-mirim');
  assert.equal(linhaDaEntidade('Exu'), 'exu');
  assert.equal(linhaDaEntidade(''), null);
  assert.equal(linhaDaEntidade('Oxóssi'), null);
});

test('extra e passe atuam só nas linhas marcadas; nas outras, cambonam', () => {
  const extra = { id: 'e', nome: 'E', funcao: 'extra', linhas: ['caboclo', 'exu'] };
  const passe = { id: 'p', nome: 'P', funcao: 'passe', linhas: ['preto-velho'] };
  const semLinhas = { id: 's', nome: 'S', funcao: 'extra', linhas: [] };
  const medium = { id: 'm', nome: 'M', funcao: 'medium', linhas: ['exu'] };
  const g = (entidade) => ({ entidade });
  assert.equal(funcaoNaGira(extra, g('Caboclo')), 'extra');
  assert.equal(funcaoNaGira(extra, g('Preto Velho')), 'cambone');
  assert.equal(funcaoNaGira(passe, g('Pretos Velhos')), 'passe');
  assert.equal(funcaoNaGira(passe, g('Exu')), 'cambone');
  assert.equal(funcaoNaGira(semLinhas, g('Exu')), 'extra', 'sem linhas marcadas: sempre a própria função');
  assert.equal(funcaoNaGira(medium, g('Baiano')), 'medium', 'linhas só valem para extra e passe');
  assert.equal(funcaoNaGira(extra, g('')), 'extra', 'gira sem entidade: ninguém é convertido');
  const lista = pessoasDaGira([extra, passe], g('Baiano'));
  assert.deepEqual(lista.map((p) => [p.funcao, p.funcaoCadastro]), [['cambone', 'extra'], ['cambone', 'passe']]);
});

test('no sorteio, quem vira cambone cambona e não recebe cambone', () => {
  const pessoas = [
    { id: 'm1', nome: 'Ana', funcao: 'medium', experiente: true },
    { id: 'm2', nome: 'Bia', funcao: 'medium' },
    { id: 'c1', nome: 'Caio', funcao: 'cambone' },
    { id: 'x1', nome: 'Xavier', funcao: 'extra', linhas: ['caboclo'] },
    { id: 'p1', nome: 'Paula', funcao: 'passe', linhas: ['caboclo'] },
  ];
  // Gira de Caboclo: Xavier é extra (recebe cambone) e Paula é passe.
  const cab = { data: '2026-11-07', entidade: 'Caboclo', presenca: {}, pares: [], passes: [] };
  const r1 = sortear(pessoas, [], cab).patch;
  assert.ok(r1.pares.some((p) => p.m === 'x1'), 'Xavier recebe cambone como extra');
  assert.ok(!r1.pares.some((p) => p.c === 'x1'));
  assert.deepEqual(r1.passes.map((p) => p.c), ['p1']);
  // Gira de Exu: os dois cambonam.
  const exu = { data: '2026-11-14', entidade: 'Exu', presenca: {}, pares: [], passes: [] };
  const r2 = sortear(pessoas, [], exu).patch;
  assert.ok(!r2.pares.some((p) => p.m === 'x1'), 'Xavier não recebe cambone');
  assert.deepEqual(new Set(r2.pares.map((p) => p.c)), new Set(['c1', 'x1', 'p1']));
  assert.equal(r2.passes, undefined);
  const { lista } = paresPorMedium(pessoas, { ...exu, ...r2 });
  assert.deepEqual(lista.map((x) => x.m.id).sort(), ['m1', 'm2']);
});

test('gira interna: ninguém é convertido e não vira linha', async () => {
  const { ehGiraInterna, linhaDaEntidade, funcaoNaGira, OPCOES_GIRA } = await import('../shared/regras.js');
  assert.equal(ehGiraInterna('Gira interna'), true);
  assert.equal(ehGiraInterna('Exu'), false);
  assert.equal(linhaDaEntidade('Gira interna'), null);
  assert.equal(funcaoNaGira({ funcao: 'passe', linhas: ['exu'] }, { entidade: 'Gira interna' }), 'passe');
  assert.ok(OPCOES_GIRA.some((g) => g.itens.some(([, l]) => l === 'Gira interna')));
});

test('gira Exus & Pombagira: quem tem Exu ou Pomba Gira atua; os outros cambonam', async () => {
  const { linhaDaEntidade, funcaoNaGira, OPCOES_GIRA, LINHA_KEYS } = await import('../shared/regras.js');
  const g = { entidade: 'Exus & Pombagira' };
  assert.equal(linhaDaEntidade('Exus & Pombagira'), 'exus-pombagira');
  assert.equal(linhaDaEntidade('Exu e Pomba Gira'), 'exus-pombagira');
  assert.equal(linhaDaEntidade('Exu'), 'exu');
  assert.equal(funcaoNaGira({ funcao: 'extra', linhas: ['exu'] }, g), 'extra');
  assert.equal(funcaoNaGira({ funcao: 'passe', linhas: ['pomba-gira'] }, g), 'passe');
  assert.equal(funcaoNaGira({ funcao: 'extra', linhas: ['caboclo'] }, g), 'cambone');
  assert.ok(OPCOES_GIRA.find((x) => x.grupo === 'Esquerda').itens.some(([, l]) => l === 'Exus & Pombagira'));
  assert.ok(!LINHA_KEYS.includes('exus-pombagira'), 'não é linha da pessoa');
});

test('Reunião obrigatória é gira especial; Mista virou Encontro das Linhas', async () => {
  const { giraEspecial, nomeGira, linhaDaEntidade, funcaoNaGira, OPCOES_GIRA } = await import('../shared/regras.js');
  assert.equal(giraEspecial('Reunião obrigatória'), 'reuniao');
  assert.equal(funcaoNaGira({ funcao: 'extra', linhas: ['exu'] }, { entidade: 'Reunião obrigatória' }), 'extra');
  assert.equal(linhaDaEntidade('Mista'), 'mista');
  assert.equal(linhaDaEntidade('Encontro das Linhas'), 'mista');
  assert.equal(nomeGira('Mista'), 'Encontro das Linhas');
  assert.equal(nomeGira('Gira interna'), 'Gira interna');
  const rot = OPCOES_GIRA.flatMap((g) => g.itens.map(([, l]) => l));
  assert.ok(rot.includes('Reunião obrigatória') && rot.includes('Encontro das Linhas') && !rot.includes('Mista'));
});

test('limpeza: turma do dia e quem faltou na gira anterior (sem reunião e gira interna)', async () => {
  const { limpezaDaGira, temLimpeza } = await import('../shared/regras.js');
  const P = (id, nome, limpeza, licencas) => ({ id, nome, funcao: 'medium', limpeza, licencas });
  const pessoas = [P('a', 'Ana', 3), P('b', 'Bia', 3, [{ inicio: '2026-05-01', fim: '2026-05-30' }]), P('c', 'Caio', 1), P('d', 'Duda', 2), P('e', 'Edu', null), P('f', 'Fábio', 3)];
  const giras = [
    { data: '2026-04-28', entidade: 'Exu', presenca: { e: 'f' } },
    { data: '2026-05-05', entidade: 'Caboclo', presenca: { c: 'f', d: 'a', f: 'f' } },
    { data: '2026-05-08', entidade: 'Reunião obrigatória', presenca: { e: 'f' } },
    { data: '2026-05-10', entidade: 'Gira interna', presenca: { e: 'f' } },
  ];
  const g = { data: '2026-05-12', entidade: 'Preto Velho', limpeza: 3, presenca: {} };
  const L = limpezaDaGira(pessoas, g, giras);
  assert.equal(L.turma, 3);
  assert.deepEqual(L.membros.map((p) => p.nome), ['Ana', 'Fábio']);
  assert.deepEqual(L.deLicenca.map((p) => p.nome), ['Bia']);
  assert.equal(L.anterior.data, '2026-05-05', 'pula reunião e gira interna');
  assert.deepEqual(L.ajudantes.map((p) => p.nome), ['Caio'], 'só falta; ausente não; quem já é da turma não repete');
  assert.equal(limpezaDaGira(pessoas, { ...g, limpeza: null }, giras), null);
  assert.equal(temLimpeza({ entidade: 'Reunião obrigatória' }), false);
  assert.equal(limpezaDaGira(pessoas, { ...g, entidade: 'Gira interna' }, giras), null);
});
