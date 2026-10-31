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
  assert.ok(LINHA_KEYS.includes('exus-pombagira') && LINHA_KEYS.includes('mista'), 'dá para marcar no cadastro');
  assert.ok(!LINHA_KEYS.includes('interna') && !LINHA_KEYS.includes('reuniao'));
  assert.equal(funcaoNaGira({ funcao: 'extra', linhas: ['exus-pombagira'] }, g), 'extra');
  assert.equal(funcaoNaGira({ funcao: 'extra', linhas: ['exus-pombagira'] }, { entidade: 'Exu' }), 'cambone');
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
  const pessoas2 = [...pessoas, P('g', 'Gabi', 1), P('h', 'Hugo', 1, [{ inicio: '2026-05-12', fim: '2026-05-20' }]), P('i', 'Ivo', 1)];
  const giras = [
    { data: '2026-04-28', entidade: 'Exu', limpeza: 5, presenca: { e: 'f' } },
    { data: '2026-05-05', entidade: 'Caboclo', limpeza: 1, presenca: { c: 'f', g: 'a', h: 'f', d: 'f', f: 'a' } },
    { data: '2026-05-07', entidade: 'Baiano', presenca: { i: 'f' } },
    { data: '2026-05-08', entidade: 'Reunião obrigatória', limpeza: 4, presenca: { e: 'f' } },
    { data: '2026-05-10', entidade: 'Gira interna', presenca: { e: 'f' } },
  ];
  const g = { data: '2026-05-12', entidade: 'Preto Velho', limpeza: 3, presenca: {} };
  const L = limpezaDaGira(pessoas2, g, giras);
  assert.equal(L.turma, 3);
  assert.deepEqual(L.membros.map((p) => p.nome), ['Ana', 'Fábio']);
  assert.deepEqual(L.deLicenca.map((p) => p.nome), ['Bia']);
  assert.equal(L.anterior.data, '2026-05-05', 'pula reunião, gira interna e gira sem turma');
  assert.deepEqual(L.ajudantes.map((p) => p.nome), ['Caio', 'Gabi'], 'só quem era da Turma 1 e teve falta ou ausência; de licença hoje não; de outra turma não');
  assert.equal(limpezaDaGira(pessoas2, { ...g, limpeza: null }, giras), null);
  assert.equal(temLimpeza({ entidade: 'Reunião obrigatória' }), false);
  assert.equal(limpezaDaGira(pessoas, { ...g, entidade: 'Gira interna' }, giras), null);
});

test('orixá: lista em ordem alfabética e só nas giras das linhas', async () => {
  const { ORIXAS, temOrixa, orixaDaGira } = await import('../shared/regras.js');
  assert.deepEqual(ORIXAS, [...ORIXAS].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.equal(ORIXAS.length, 13);
  assert.ok(ORIXAS.every((o) => o[0] === o[0].toUpperCase()));
  assert.equal(temOrixa({ entidade: 'Caboclo' }), true);
  assert.equal(temOrixa({ entidade: 'Encontro das Linhas' }), true);
  assert.equal(temOrixa({ entidade: 'Exu' }), false);
  assert.equal(temOrixa({ entidade: 'Exus & Pombagira' }), false);
  assert.equal(temOrixa({ entidade: 'Gira interna' }), false);
  assert.equal(temOrixa({ entidade: '' }), false);
  assert.equal(orixaDaGira({ entidade: 'Exu', orixa: 'Ogum' }), '', 'gira de esquerda não mostra orixá');
  assert.equal(orixaDaGira({ entidade: 'Caboclo', orixa: 'Oxóssi' }), 'Oxóssi');
});

test('presença pendente: gira nova começa pendente, entra na escala e vira presente ao encerrar', async () => {
  const { status, presente, cambonaHoje, giraVazia, encerrar } = await import('../shared/regras.js');
  const ana = { id: 'a', nome: 'Ana', funcao: 'medium' }, bia = { id: 'b', nome: 'Bia', funcao: 'cambone' }, cai = { id: 'c', nome: 'Caio', funcao: 'cambone' };
  const g = { ...giraVazia('2026-11-04'), presenca: { c: 'f' }, pares: [{ m: 'a', c: 'b' }] };
  assert.equal(status(ana, g), 'pend');
  assert.equal(presente(ana, g), true, 'pendente entra na escala');
  assert.equal(cambonaHoje(bia, g), true);
  assert.equal(status(ana, { data: '2026-01-01', presenca: {} }), 'p', 'gira antiga: padrão continua presente');
  const { patch } = encerrar([ana, bia, cai], g);
  assert.equal(patch.presenca.a, 'p');
  assert.equal(patch.presenca.b, 'p');
  assert.equal(patch.presenca.c, 'f');
});

test('função do dia separada da presença (Suporte / Não atende)', async () => {
  const { status, presencaDe, papelDe, pendentesDaGira, giraVazia } = await import('../shared/regras.js');
  const ana = { id: 'a', nome: 'Ana', funcao: 'cambone' }, bia = { id: 'b', nome: 'Bia', funcao: 'medium' };
  const g = { ...giraVazia('2026-11-04'), papeis: { a: 'sup', b: 'na' } };
  assert.equal(presencaDe(ana, g), 'pend', 'escolher Suporte não dá presença');
  assert.equal(papelDe(ana, g), 'sup');
  assert.equal(status(ana, g), 'sup');
  assert.equal(status(bia, g), 'na');
  assert.equal(pendentesDaGira([ana, bia], g).length, 2, 'continuam pendentes para encerrar');
  assert.equal(status(ana, { ...g, presenca: { a: 'f' } }), 'f', 'falta vale sobre a função do dia');
  // formato antigo: 'sup' guardado na presença
  const antiga = { data: '2026-01-01', presenca: { a: 'sup' } };
  assert.equal(presencaDe(ana, antiga), 'p');
  assert.equal(papelDe(ana, antiga), 'sup');
});

test('entrada na corrente: antes da data a pessoa não conta na gira', async () => {
  const { daGira, pendentesDaGira, sortear, limpezaDaGira, giraVazia } = await import('../shared/regras.js');
  const { dadosResumo } = await import('../shared/resumoGira.js');
  const ps = [
    { id: 'a', nome: 'Ana', funcao: 'medium', limpeza: 1 },
    { id: 'b', nome: 'Bia', funcao: 'cambone', limpeza: 1 },
    { id: 'n', nome: 'Nova', funcao: 'cambone', limpeza: 1, entrada: '2026-11-10' },
  ];
  const antes = { ...giraVazia('2026-11-04'), limpeza: 1 };
  const depois = { ...giraVazia('2026-11-11'), limpeza: 1 };
  assert.deepEqual(daGira(ps, antes).map((p) => p.id), ['a', 'b']);
  assert.deepEqual(daGira(ps, depois).map((p) => p.id), ['a', 'b', 'n']);
  assert.equal(pendentesDaGira(ps, antes).length, 2);
  assert.ok(!sortear(ps, [], antes).patch.pares.some((p) => p.c === 'n'), 'não entra no sorteio antes da entrada');
  assert.deepEqual(limpezaDaGira(ps, antes, []).membros.map((p) => p.id), ['a', 'b']);
  const r = dadosResumo(ps, { ...antes, presenca: { a: 'p', b: 'p' } });
  assert.equal(r.presentes.length, 2);
  assert.equal(r.pct.presenca, 100);
});

test('turma da limpeza: rodízio a partir da última gira encerrada, pulando turmas vazias', async () => {
  const { proximaTurma } = await import('../shared/regras.js');
  const ps = [1, 2, 4, 7].map((t, i) => ({ id: 'p' + i, nome: 'P' + i, limpeza: t }));   // turmas 3, 5 e 6 vazias
  const g = (data, limpeza, encerrada = true) => ({ data, limpeza, encerrada });
  assert.equal(proximaTurma(ps, [], '2026-11-04'), 1, 'sem histórico: a primeira com gente');
  assert.equal(proximaTurma(ps, [g('2026-10-28', 2)], '2026-11-04'), 4, 'pula a 3 (vazia)');
  assert.equal(proximaTurma(ps, [g('2026-10-28', 4)], '2026-11-04'), 7, 'pula 5 e 6');
  assert.equal(proximaTurma(ps, [g('2026-10-28', 7)], '2026-11-04'), 1, 'volta ao começo');
  assert.equal(proximaTurma(ps, [g('2026-10-21', 1), g('2026-10-28', 2, false)], '2026-11-04'), 2, 'gira não encerrada não conta');
  assert.equal(proximaTurma(ps, [g('2026-10-28', 1), g('2026-11-11', 4)], '2026-11-04'), 2, 'só giras antes da data');
  assert.equal(proximaTurma([{ id: 'x', nome: 'X' }], [], '2026-11-04'), null, 'ninguém com turma');
});

test('extra/passe fora das linhas que marcou: aparece como Não atende', async () => {
  const { papelDe, status, funcaoNaGira, cambonaHoje, giraVazia } = await import('../shared/regras.js');
  const ex = { id: 'e', nome: 'Edu', funcao: 'extra', linhas: ['exu'] };
  const g = { ...giraVazia('2026-11-04'), entidade: 'Caboclo', presenca: { e: 'p' } };
  assert.equal(papelDe(ex, g), 'na');
  assert.equal(status(ex, g), 'na');
  assert.equal(cambonaHoje(ex, g), true);
  assert.equal(papelDe(ex, { ...g, entidade: 'Exu' }), 'cad', 'na linha dele: função do cadastro');
  // o admin pode manter como extra mesmo fora da linha
  const g2 = { ...g, papeis: { e: 'cad' } };
  assert.equal(papelDe(ex, g2), 'cad');
  assert.equal(funcaoNaGira(ex, g2), 'extra');
  assert.equal(status(ex, g2), 'p');
});

test('perfil: só orixás e guias válidos; oferenda só com algo escolhido', async () => {
  const { normalizarPerfil, GUIAS } = await import('../shared/perfil.js');
  const p = normalizarPerfil({
    orixas: { frente: { nome: 'Ogum', oferenda: true }, ancestral: { nome: 'Zeus', oferenda: true }, adjunto: { nome: '', oferenda: true } },
    guias: { chefe: { linha: 'caboclo', oferenda: 1 }, frente: { linha: 'mista' } },
    outros: { 'preto-velho': '  Pai   Joaquim ', inventado: 'X', exu: '' },
  });
  assert.deepEqual(p.orixas.frente, { nome: 'Ogum', oferenda: true });
  assert.deepEqual(p.orixas.ancestral, { nome: '', oferenda: false });
  assert.deepEqual(p.orixas.adjunto, { nome: '', oferenda: false });
  assert.deepEqual(p.guias.chefe, { linha: 'caboclo', oferenda: true });
  assert.deepEqual(p.guias.frente, { linha: '', oferenda: false }, 'Encontro das Linhas não é guia');
  assert.deepEqual(p.outros, { 'preto-velho': 'Pai Joaquim' });
  assert.ok(!GUIAS.some(([k]) => k === 'mista'));
  assert.deepEqual(normalizarPerfil(null).outros, {});
});

test('eventos: data digitada 31/10 (ano automático) e a semana (hoje + 7 dias)', async () => {
  const { lerDataCurta, eventosDaSemana } = await import('../shared/eventos.js');
  const hoje = '2026-10-31';
  assert.equal(lerDataCurta('31/10', hoje), '2026-10-31');
  assert.equal(lerDataCurta('5/1', hoje), '2027-01-05', 'já passou há mais de 2 meses: ano que vem');
  assert.equal(lerDataCurta('15/09', hoje), '2026-09-15', 'passou há pouco: este ano');
  assert.equal(lerDataCurta('31/10/2027', hoje), '2027-10-31');
  assert.equal(lerDataCurta('1/2/27', hoje), '2027-02-01');
  assert.equal(lerDataCurta('31/02', hoje), null);
  assert.equal(lerDataCurta('abc', hoje), null);
  const evs = [{ data: '2026-10-30', nome: 'Ontem' }, { data: '2026-11-07', nome: 'Daqui a 7' }, { data: '2026-10-31', nome: 'Hoje' }, { data: '2026-11-08', nome: 'Daqui a 8' }];
  assert.deepEqual(eventosDaSemana(evs, hoje).map((e) => e.nome), ['Hoje', 'Daqui a 7']);
});
