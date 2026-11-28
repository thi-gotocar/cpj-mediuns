// Testes das regras puras (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDaEntidade, funcaoNaGira, pessoasDaGira, sortear, paresPorMedium, opcoesGira, apelidoEntidade, nomeEntidadeGira, tituloGira, tituloAutomaticoGira, naCorrenteEm } from '../shared/regras.js';

test('saída da corrente: conta nas giras anteriores e não da data em diante', () => {
  const p = { entrada: '2025-01-10', saida: '2026-06-01' };
  assert.equal(naCorrenteEm(p, '2025-01-09'), false, 'antes da entrada');
  assert.equal(naCorrenteEm(p, '2026-05-31'), true, 'antes da saída');
  assert.equal(naCorrenteEm(p, '2026-06-01'), false, 'no dia da saída');
  assert.equal(naCorrenteEm(p, '2026-06-02'), false, 'depois da saída');
  assert.equal(naCorrenteEm({ saida: null, entrada: null }, '2020-01-01'), true);
});
import { PERFIS_PADRAO, PERMISSOES_ROOT, permissoesDe, grupoAcesso } from '../shared/permissoes.js';

test('palavras-passe de acesso reconhecem CPJ, Alunos e Curimba', () => {
  assert.equal(grupoAcesso(' CPJ '), 'cpj');
  assert.equal(grupoAcesso('ALUNOS'), 'alunos');
  assert.equal(grupoAcesso('curimba'), 'curimba');
  assert.equal(grupoAcesso('ervas'), '');
  assert.equal(grupoAcesso('email@exemplo.com'), '');
});

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

test('apelidos de entidade mostram nome configurado e preservam a linha canônica', () => {
  const aliases = [{ nome: 'Caboclo de Pena', linha: 'caboclo' }];
  const opcao = opcoesGira(aliases).flatMap((g) => g.itens).find(([, nome]) => nome === 'Caboclo de Pena');
  assert.deepEqual(opcao, ['Caboclo', 'Caboclo de Pena', 'Caboclo de Pena']);
  assert.equal(linhaDaEntidade(opcao[0]), 'caboclo');
  assert.deepEqual(apelidoEntidade('caboclo DE pena', aliases), aliases[0]);
  assert.equal(nomeEntidadeGira({ entidade: 'Caboclo', entidadeNome: 'Caboclo de Pena' }), 'Caboclo de Pena');
});

test('nome da gira: o que o admin escreveu vale; sem isso, o automático', () => {
  assert.equal(tituloGira({ entidade: 'Caboclo', entidadeNome: 'Caboclo de Pena' }), 'Gira de Caboclo de Pena');
  assert.equal(tituloGira({ entidade: 'Caboclo', titulo: 'Festa de Oxóssi' }), 'Festa de Oxóssi');
  assert.equal(tituloGira({ entidade: 'Caboclo', titulo: '' }), tituloAutomaticoGira({ entidade: 'Caboclo' }));
  assert.equal(tituloGira({ evento: true, entidade: '' }), 'Evento');
  assert.equal(tituloGira({ entidade: '' }), 'Gira');
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
  assert.equal(funcaoNaGira(semLinhas, g('Exu')), 'cambone', 'sem linhas marcadas: não apto a nenhuma, cambona');
  assert.equal(funcaoNaGira(semLinhas, g('')), 'extra', 'gira sem entidade: não converte');
  assert.equal(funcaoNaGira({ ...semLinhas, linhas: undefined }, g('Exu')), 'extra', 'sem o campo linhas: não converte');
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
  // Gira de Exu: os dois cambonam. 2 médiuns e 3 cambones: cada médium com 1 e o que sobra vai para o Suporte.
  const exu = { data: '2026-11-14', entidade: 'Exu', presenca: {}, pares: [], passes: [] };
  const r2 = sortear(pessoas, [], exu).patch;
  assert.ok(!r2.pares.some((p) => p.m === 'x1'), 'Xavier não recebe cambone');
  assert.equal(r2.pares.length, 2);
  const noSup = Object.keys(r2.papeis).filter((id) => r2.papeis[id] === 'sup');
  assert.equal(noSup.length, 1);
  assert.deepEqual(new Set([...r2.pares.map((p) => p.c), ...noSup]), new Set(['c1', 'x1', 'p1']));
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
  // Estatísticas: guia chefe, guia de frente e orixá de frente mais comuns (valor inválido não conta).
  const { contagemPerfis } = await import('../shared/perfil.js');
  const c = contagemPerfis([
    { perfil: { guias: { chefe: { linha: 'caboclo' }, frente: { linha: 'exu' } }, orixas: { frente: { nome: 'Oxum' } } } },
    { perfil: { guias: { chefe: { linha: 'caboclo' } }, orixas: { frente: { nome: 'Ogum' } } } },
    { perfil: { guias: { chefe: { linha: 'baiano' } }, orixas: { frente: { nome: 'Oxum' } } } },
    { perfil: { guias: { chefe: { linha: 'xx' } } } },
    { perfil: null },
  ]);
  assert.equal(c.total, 5);
  assert.deepEqual(c.chefe, [{ nome: 'Caboclo', qtd: 2 }, { nome: 'Baiano', qtd: 1 }]);
  assert.deepEqual(c.frente, [{ nome: 'Exu', qtd: 1 }]);
  assert.deepEqual(c.orixa, [{ nome: 'Oxum', qtd: 2 }, { nome: 'Ogum', qtd: 1 }]);
  // Orixá de cabeça: frente, ancestral ou adjunto; a mesma pessoa conta uma vez por orixá.
  const d = contagemPerfis([
    { perfil: { orixas: { frente: { nome: 'Oxum' }, ancestral: { nome: 'Ogum' }, adjunto: { nome: 'Oxum' } } } },
    { perfil: { orixas: { ancestral: { nome: 'Oxum' } } } },
    { perfil: { orixas: { adjunto: { nome: 'Xangô' } } } },
    { perfil: {} },
  ]);
  assert.deepEqual(d.cabeca, [{ nome: 'Oxum', qtd: 2 }, { nome: 'Ogum', qtd: 1 }, { nome: 'Xangô', qtd: 1 }]);
  assert.equal(d.cabecaPessoas, 3);
  // A curimba não entra nas contagens (nem no total).
  const e = contagemPerfis([
    { funcao: 'medium', perfil: { orixas: { frente: { nome: 'Oxum' } } } },
    { funcao: 'curimba', perfil: { orixas: { frente: { nome: 'Ogum' } } } },
  ]);
  assert.equal(e.total, 1);
  assert.deepEqual(e.orixa, [{ nome: 'Oxum', qtd: 1 }]);
  // Nomes por orixá de cabeça (Ver mais, só para quem administra o Perfil): uma vez por orixá, em ordem, sem a curimba.
  const { pessoasPorOrixaCabeca } = await import('../shared/perfil.js');
  assert.deepEqual(pessoasPorOrixaCabeca([
    { nome: 'Zé', funcao: 'medium', perfil: { orixas: { frente: { nome: 'Oxum' }, adjunto: { nome: 'Oxum' } } } },
    { nome: 'Ana', funcao: 'cambone', perfil: { orixas: { ancestral: { nome: 'Oxum' }, adjunto: { nome: 'Ogum' } } } },
    { nome: 'Bia', funcao: 'curimba', perfil: { orixas: { frente: { nome: 'Oxum' } } } },
  ]), { Oxum: ['Ana', 'Zé'], Ogum: ['Ana'] });
});

test('banhos da gira: ervas do orixá do dia e da linha da gira', async () => {
  const { banhosDaGira, BANHO_ORIXA, BANHO_GUIA } = await import('../shared/banhos.js');
  const { ORIXAS, LINHA_KEYS } = await import('../shared/regras.js');
  // Todo orixá do app e toda linha (menos o Encontro das Linhas) tem a sua lista.
  ORIXAS.forEach((o) => assert.ok(BANHO_ORIXA[o]?.ervas.length, `orixá sem ervas: ${o}`));
  LINHA_KEYS.filter((k) => k !== 'mista' && k !== 'exus-pombagira').forEach((k) => assert.ok(BANHO_GUIA[k]?.ervas.length, `linha sem ervas: ${k}`));
  const b = banhosDaGira({ entidade: 'Caboclo', orixa: 'Oxóssi' });
  assert.equal(b.orixa.nome, 'Oxóssi');
  assert.ok(b.orixa.ervas.includes('guiné'));
  assert.ok(b.orixa.aviso, 'aviso da comigo-ninguém-pode');
  assert.equal(b.guia.nome, 'Caboclo');
  assert.ok(b.guia.ervas.includes('samambaia'));
  // Esquerda não tem orixá; gira junta soma as linhas sem repetir.
  const e = banhosDaGira({ entidade: 'Exus & Pombagira', orixa: 'Ogum' });
  assert.equal(e.orixa, null);
  assert.ok(e.guia.ervas.includes('dandá') && e.guia.ervas.includes('hibisco'));
  assert.equal(new Set(e.guia.ervas).size, e.guia.ervas.length);
  assert.deepEqual(banhosDaGira({ entidade: '' }), { orixa: null, guia: null });
  assert.equal(banhosDaGira({ entidade: 'Encontro das Linhas' }).guia, null);
});

test('perfil da curimba: só as informações pessoais', async () => {
  const { perfilDaFuncao, cadastraEspiritual } = await import('../shared/perfil.js');
  const p = { orixas: { frente: { nome: 'Ogum', oferenda: true } }, guias: { chefe: { linha: 'caboclo' } }, outros: { exu: 'Tranca Rua' },
    info: { nome: 'Zé', celular: '11912345678' } };
  const c = perfilDaFuncao(p, 'curimba');
  assert.equal(c.orixas.frente.nome, '');
  assert.equal(c.guias.chefe.linha, '');
  assert.deepEqual(c.outros, {});
  assert.equal(c.info.nome, 'Zé');
  assert.equal(c.info.celular, '11912345678');
  assert.equal(perfilDaFuncao(p, 'medium').orixas.frente.nome, 'Ogum');
  assert.equal(cadastraEspiritual('curimba'), false);
  assert.equal(cadastraEspiritual('cambone'), true);
});

test('aniversariantes do dia: sem quem saiu, por nome, e uma mensagem diferente para cada um', async () => {
  const { aniversariantesDoDia, mensagensAniversario, MENSAGENS_ANIVERSARIO } = await import('../shared/eventos.js');
  const ps = [{ nome: 'Zé', aniversario: '11-12' }, { nome: 'Ana', aniversario: '11-12' }, { nome: 'Bia', aniversario: '11-13' }, { nome: 'Caio', aniversario: '11-12', saida: '2026-01-01' }, { nome: 'Davi' }];
  assert.deepEqual(aniversariantesDoDia(ps, '2026-11-12').map((p) => p.nome), ['Ana', 'Zé']);
  assert.deepEqual(aniversariantesDoDia(null, '2026-11-12'), []);
  const m4 = mensagensAniversario(4, '2026-11-12');
  assert.equal(new Set(m4).size, 4, '4 pessoas, 4 mensagens diferentes');
  assert.ok(m4.every((m) => MENSAGENS_ANIVERSARIO.includes(m)));
  assert.deepEqual(mensagensAniversario(4, '2026-11-12'), m4, 'mesma data, mesmas mensagens (prévia = imagem enviada)');
  assert.equal(new Set(mensagensAniversario(MENSAGENS_ANIVERSARIO.length, 'x')).size, MENSAGENS_ANIVERSARIO.length);
  assert.equal(mensagensAniversario(MENSAGENS_ANIVERSARIO.length + 2, 'x').length, MENSAGENS_ANIVERSARIO.length + 2);
  assert.deepEqual(mensagensAniversario(0, 'x'), []);
});

test('eventos: data digitada 31/10 (ano automático) e a semana (hoje + 7 dias)', async () => {
  const { lerDataCurta, eventosDaSemana } = await import('../shared/eventos.js');
  const hoje = '2026-10-31';
  assert.equal(lerDataCurta('31/10', hoje), '2026-10-31');
  assert.equal(lerDataCurta('5/1', hoje), '2027-01-05', 'já passou há mais de 2 meses: ano que vem');
  assert.equal(lerDataCurta('15/09', hoje), '2026-09-15', 'passou há pouco: este ano');
  assert.equal(lerDataCurta('31/10/2027', hoje), '2027-10-31');
  assert.equal(lerDataCurta('31/10/', hoje), '2026-10-31', 'barra da máscara no fim');
  assert.equal(lerDataCurta('1/2/27', hoje), '2027-02-01');
  assert.equal(lerDataCurta('31/02', hoje), null);
  assert.equal(lerDataCurta('abc', hoje), null);
  const evs = [{ data: '2026-10-30', nome: 'Ontem' }, { data: '2026-11-07', nome: 'Daqui a 7' }, { data: '2026-10-31', nome: 'Hoje' }, { data: '2026-11-08', nome: 'Daqui a 8' }];
  assert.deepEqual(eventosDaSemana(evs, hoje).map((e) => e.nome), ['Hoje', 'Daqui a 7']);
});

test('eventos: sem nada no dia, o próximo cadastrado (qualquer tipo, sem limite de data)', async () => {
  const { proximosEventos } = await import('../shared/eventos.js');
  const evs = [{ data: '2026-11-05', nome: 'Hoje' }, { data: '2027-03-01', nome: 'Longe', tipo: 'amaci' }, { data: '2027-03-01', nome: 'Junto', tipo: 'gira' }, { data: '2027-05-01', nome: 'Depois' }, { data: '2026-01-01', nome: 'Passou' }];
  assert.deepEqual(proximosEventos(evs, '2026-11-05').map((e) => e.nome).sort(), ['Junto', 'Longe']);
  assert.deepEqual(proximosEventos(evs, '2027-05-01'), []);
  assert.deepEqual(proximosEventos(null, '2026-11-05'), []);
});

test('bloco Eventos da aba Gira: gira dos próximos 30 dias; amaci, evento e aviso, todos os futuros', async () => {
  const { eventosDoTopo } = await import('../shared/eventos.js');
  const hoje = '2026-11-03';
  const evs = [
    { data: '2026-11-02', nome: 'Passou', tipo: 'gira' },
    { data: '2026-11-03', nome: 'Hoje', tipo: 'aviso' },
    { data: '2026-11-25', nome: 'Gira do mês', tipo: 'gira' },
    { data: '2026-12-03', nome: 'Gira daqui a 30', tipo: 'gira' },
    { data: '2026-12-04', nome: 'Gira daqui a 31', tipo: 'gira' },
    { data: '2027-03-01', nome: 'Evento longe', tipo: 'evento' },
    { data: '2027-06-01', nome: 'Aviso longe', tipo: 'aviso' },
    { data: '2026-11-09', nome: 'Amaci da semana', tipo: 'amaci' },
    { data: '2026-11-20', nome: 'Amaci depois', tipo: 'amaci' },
  ];
  assert.deepEqual(eventosDoTopo(evs, hoje).map((e) => e.nome), ['Hoje', 'Amaci da semana', 'Amaci depois', 'Gira do mês', 'Gira daqui a 30', 'Evento longe', 'Aviso longe']);
});

test('perfil: informações (nascimento, telefones e e-mail validados)', async () => {
  const { normalizarPerfil, lerNascimento, telefoneBR } = await import('../shared/perfil.js');
  assert.equal(lerNascimento('31/10/1990'), '1990-10-31');
  assert.equal(lerNascimento('31/02/1990'), '');
  assert.equal(lerNascimento('31/10/2999'), '', 'no futuro não');
  assert.equal(telefoneBR('11987654321'), '(11) 98765-4321');
  assert.equal(telefoneBR('1134567890'), '(11) 3456-7890');
  const p = normalizarPerfil({ info: { nome: '  Ana   Maria ', nascimento: '1990-10-31', celular: '(11) 98765-4321', email: ' Ana@Exemplo.COM ', contatoNome: 'Mãe', contatoTelefone: '123', extra: 'x' } });
  assert.deepEqual(p.info, { nome: 'Ana Maria', nascimento: '1990-10-31', celular: '11987654321', email: 'ana@exemplo.com', contatoNome: 'Mãe', contatoTelefone: '' });
  assert.equal(normalizarPerfil({ info: { email: 'sem-arroba' } }).info.email, '', 'e-mail inválido não fica');
  assert.deepEqual(normalizarPerfil(null).info, { nome: '', nascimento: '', celular: '', email: '', contatoNome: '', contatoTelefone: '' });
});

test('função do dia: Extra como Passe (pas) e Passe como Cambone (na)', async () => {
  const { funcaoNaGira, status, presente, cambonaHoje, pessoasDaGira, papelDe } = await import('../shared/regras.js');
  const ex = { id: 'e', nome: 'Ex', funcao: 'extra', linhas: [] };
  const pa = { id: 'p', nome: 'Pa', funcao: 'passe', linhas: [] };
  const g = { data: '2030-01-01', entidade: 'Caboclo', presenca: { e: 'p', p: 'p' }, papeis: { e: 'pas', p: 'na' } };
  assert.equal(funcaoNaGira(ex, g), 'passe');
  assert.equal(papelDe(ex, g), 'pas');
  assert.equal(status(ex, g), 'p');
  assert.ok(presente(ex, g));
  assert.equal(pessoasDaGira([ex], g)[0].funcao, 'passe');
  assert.ok(cambonaHoje(pa, g), 'passe como cambone cambona');
  assert.equal(papelDe({ ...pa, funcao: 'medium' }, { ...g, papeis: { p: 'pas' } }), 'cad', "'pas' só vale para Extra");
});

test('entidade escolhida pela pessoa em gira com mais de uma linha', async () => {
  const { guiaNaGira, linhasParaEscolher, entidadeEscolhida, podeEscolherEntidade } = await import('../shared/regras.js');
  const chaves = (g) => linhasParaEscolher(g).map(([k]) => k);
  assert.deepEqual(chaves({ entidade: 'Exus & Pombagira' }), ['exu', 'pomba-gira']);
  assert.ok(chaves({ entidade: 'Encontro das Linhas' }).includes('caboclo'));
  assert.ok(!chaves({ entidade: 'Encontro das Linhas' }).includes('mista'));
  assert.deepEqual(chaves({ entidade: 'Caboclo' }), []);
  assert.deepEqual(chaves({ entidade: 'Exus & Pombagira', evento: true }), []);

  const p = { id: '1', funcao: 'medium', entrada: '2020-01-01', licencas: [], guiasAtendimento: { exu: 'Tranca Rua', 'pomba-gira': 'Maria Padilha' } };
  const g = { data: '2030-01-02', entidade: 'Exus & Pombagira', presenca: {}, papeis: {}, atende: {} };
  assert.equal(guiaNaGira(p, g), 'Tranca Rua / Maria Padilha', 'sem escolha: como antes');
  assert.equal(guiaNaGira(p, { ...g, atende: { 1: 'exu' } }), 'Exu : Tranca Rua');
  assert.equal(guiaNaGira(p, { ...g, entidade: 'Encontro das Linhas', atende: { 1: 'caboclo' } }), 'Caboclo', 'sem nome cadastrado: só a entidade');
  assert.equal(entidadeEscolhida(p, { ...g, entidade: 'Caboclo', atende: { 1: 'exu' } }), '', 'a gira mudou: a escolha deixa de valer');

  assert.equal(podeEscolherEntidade(p, g), true);
  assert.equal(podeEscolherEntidade({ ...p, funcao: 'cambone' }, g), false);
  assert.equal(podeEscolherEntidade(p, { ...g, encerrada: true }), false);
  assert.equal(podeEscolherEntidade(p, { ...g, presenca: { 1: 'a' } }), false);
  assert.equal(podeEscolherEntidade(p, { ...g, presenca: { 1: 'f' } }), false, 'falta: não vem');
  assert.equal(podeEscolherEntidade(p, { ...g, papeis: { 1: 'na' } }), true, 'a escala decide se atua; a escolha fica');
  // Extra e Passe escolhem pelo cadastro, mesmo fora da linha (no Encontro das Linhas sem tê-lo marcado, cambonam).
  const extra = { ...p, funcao: 'extra', linhas: ['caboclo'] };
  const mista = { ...g, entidade: 'Encontro das Linhas' };
  assert.equal(podeEscolherEntidade(extra, mista), true);
  assert.equal(podeEscolherEntidade({ ...p, funcao: 'passe', linhas: [] }, g), true);
  assert.equal(podeEscolherEntidade({ ...p, funcao: 'senha' }, g), false);
});

test('nome alternativo da gira define as linhas que a corrente escolhe', async () => {
  const { linhasParaEscolher, entidadeEscolhida, definirApelidosEntidade } = await import('../shared/regras.js');
  const chaves = (g) => linhasParaEscolher(g).map(([k]) => k);
  definirApelidosEntidade([
    { nome: 'Girão de Esquerda', linha: 'exus-pombagira', atende: ['exu', 'pomba-gira', 'exu-mirim'] },
    { nome: 'Gira de Boiadeiros e Caboclos', linha: 'caboclo', atende: ['caboclo', 'boiadeiro'] },
    { nome: 'Caboclo de Pena', linha: 'caboclo' },
  ]);
  try {
    const g = { data: '2030-01-02', entidade: 'Exus & Pombagira', entidadeNome: 'Girão de Esquerda', atende: { 1: 'exu-mirim' } };
    assert.deepEqual(chaves(g), ['exu', 'pomba-gira', 'exu-mirim']);
    assert.equal(entidadeEscolhida({ id: '1' }, g), 'exu-mirim');
    assert.deepEqual(chaves({ entidade: 'Exus & Pombagira' }), ['exu', 'pomba-gira'], 'sem nome alternativo: o padrão');
    assert.deepEqual(chaves({ entidade: 'Caboclo', entidadeNome: 'Gira de Boiadeiros e Caboclos' }), ['boiadeiro', 'caboclo'], 'linha simples também escolhe, na ordem das linhas');
    assert.deepEqual(chaves({ entidade: 'Caboclo', entidadeNome: 'Caboclo de Pena' }), [], 'sem linhas marcadas: o padrão da linha');
    assert.deepEqual(chaves({ ...g, evento: true }), []);
  } finally { definirApelidosEntidade([]); }
});

test('entidade nova (sem linha): gira com o próprio nome e as linhas que a corrente escolhe', async () => {
  const { linhasParaEscolher, definirApelidosEntidade, entidadeNova, foraDaLinha, guiaNaGira, temOrixa } = await import('../shared/regras.js');
  definirApelidosEntidade([{ nome: 'Girão de Esquerda', linha: '', atende: ['exu', 'pomba-gira', 'exu-mirim'] }, { nome: 'Gira da Casa' }]);
  try {
    const g = { data: '2030-01-02', entidade: 'Girão de Esquerda', atende: {} };
    assert.ok(entidadeNova('girao de esquerda'));
    assert.deepEqual(linhasParaEscolher(g).map(([k]) => k), ['exu', 'pomba-gira', 'exu-mirim']);
    assert.equal(temOrixa(g), false);
    assert.equal(foraDaLinha({ funcao: 'extra', linhas: ['exu-mirim'] }, g), false);
    assert.equal(foraDaLinha({ funcao: 'extra', linhas: ['exus-pombagira'] }, g), false, 'gira junta marcada vale');
    assert.equal(foraDaLinha({ funcao: 'passe', linhas: ['caboclo'] }, g), true, 'sem nenhuma das linhas: cambona');
    assert.equal(foraDaLinha({ funcao: 'passe', linhas: ['caboclo'] }, { entidade: 'Gira da Casa' }), false, 'sem linhas: ninguém é convertido');
    assert.deepEqual(linhasParaEscolher({ entidade: 'Gira da Casa' }), []);
    const p = { id: '1', guiasAtendimento: { exu: 'Tranca Rua', 'exu-mirim': 'Toquinho' } };
    assert.equal(guiaNaGira(p, g), 'Tranca Rua / Toquinho');
    assert.equal(guiaNaGira(p, { ...g, atende: { 1: 'exu-mirim' } }), 'Exu Mirim : Toquinho');
    const grupos = opcoesGira([{ nome: 'Girão de Esquerda', linha: '' }]);
    assert.deepEqual(grupos.at(-2), { grupo: 'Entidades da casa', itens: [['Girão de Esquerda', 'Girão de Esquerda', '']] });
    assert.equal(grupos.at(-1).grupo, 'Outras');
  } finally { definirApelidosEntidade([]); }
});

test('guia de atendimento na gira: pela linha da entidade (e gira junta)', async () => {
  const { guiaNaGira } = await import('../shared/regras.js');
  const p = { guiasAtendimento: { 'preto-velho': 'Pai Joaquim', exu: 'Tranca Rua', 'pomba-gira': 'Maria Padilha' } };
  assert.equal(guiaNaGira(p, { entidade: 'Preto Velho' }), 'Pai Joaquim');
  assert.equal(guiaNaGira(p, { entidade: 'Exus & Pombagira' }), 'Tranca Rua / Maria Padilha');
  assert.equal(guiaNaGira(p, { entidade: 'Caboclo' }), '');
  assert.equal(guiaNaGira(p, { entidade: '' }), '');
});

test('função do dia: Cambone como Passe/Senha, Passe como At. Extra, Senha como Cambone/Passe', async () => {
  const { funcaoNaGira, papelDe, cambonaHoje, pessoasDaGira, status } = await import('../shared/regras.js');
  const c = { id: 'c', nome: 'Ca', funcao: 'cambone' };
  const pa = { id: 'p', nome: 'Pa', funcao: 'passe', linhas: [] };
  const s = { id: 's', nome: 'Se', funcao: 'senha' };
  const g = (papeis) => ({ data: '2030-01-01', entidade: 'Caboclo', presenca: { c: 'p', p: 'p', s: 'p' }, papeis });
  assert.equal(funcaoNaGira(c, g({ c: 'pas' })), 'passe');
  assert.equal(papelDe(c, g({ c: 'pas' })), 'pas');
  assert.equal(status(c, g({ c: 'pas' })), 'p');
  assert.ok(!cambonaHoje(c, g({ c: 'pas' })), 'cambone de passe não cambona');
  assert.equal(funcaoNaGira(c, g({ c: 'sen' })), 'senha');
  assert.ok(!cambonaHoje(c, g({ c: 'sen' })));
  assert.equal(funcaoNaGira(pa, g({ p: 'ext' })), 'extra');
  assert.equal(pessoasDaGira([pa], g({ p: 'ext' }))[0].funcao, 'extra');
  assert.ok(cambonaHoje(s, g({ s: 'na' })), 'senha como cambone cambona');
  assert.equal(funcaoNaGira(s, g({ s: 'pas' })), 'passe');
  // A Senha não é sorteada: qualquer função da escala pode ir para ela (médium, extra, passe, cambone).
  assert.equal(papelDe({ ...s, funcao: 'medium' }, g({ s: 'sen' })), 'sen', "'sen' vale também para médium");
  assert.equal(funcaoNaGira({ ...s, funcao: 'medium' }, g({ s: 'sen' })), 'senha');
  assert.equal(papelDe({ ...s, funcao: 'curimba' }, g({ s: 'sen' })), 'cad', "'sen' não vale para a curimba");
});

test('sugestão Mi/Mãe Vê: quem marcou a entidade da gira no Perfil', async () => {
  const { sugestoesDaGira } = await import('../shared/regras.js');
  const ps = [
    { id: '1', nome: 'Bia', funcao: 'passe', linhas: ['caboclo'], afinidadeExtra: ['caboclo'], guiasAtendimento: { caboclo: 'Pena Branca' }, guiaChefe: 'caboclo', guiaFrente: 'caboclo' },
    { id: '2', nome: 'Ana', funcao: 'cambone', afinidadePasse: ['caboclo'], guiaFrente: 'caboclo' },
    { id: '3', nome: 'Caio', funcao: 'extra', linhas: ['caboclo'] },
    { id: '4', nome: 'Duda', funcao: 'extra', linhas: ['baiano'], guiaChefe: 'baiano' },
    { id: '5', nome: 'Eva', funcao: 'cambone', afinidadePasse: ['caboclo'] },
    { id: '6', nome: 'Fábio', funcao: 'extra', linhas: [] },
    { id: '7', nome: 'Gil', funcao: 'extra', linhas: ['baiano', 'caboclo', 'exu'] },
  ];
  const g = { data: '2030-01-01', entidade: 'Caboclo', presenca: { 5: 'a' } };
  const r = sugestoesDaGira(ps, g);
  // Passe: cambone que marcou (Ana) + extras que não marcaram (Duda; Fábio, sem nenhuma = não apto);
  // Bia (já é Passe), Caio e Gil (extras que marcaram) não.
  assert.deepEqual(r.passe.map((x) => x.nome), ['Ana', 'Duda', 'Fábio']);
  assert.deepEqual(r.extra.map((x) => x.nome), ['Bia']);
  assert.equal(r.extra[0].entidade, 'Pena Branca');
  assert.equal(r.passe[0].entidade, 'Caboclo');
  // Rótulo do guia chefe / de frente só quando é da linha da gira (Duda tem guia chefe Baiano: sem rótulo).
  assert.deepEqual(r.passe.map((x) => x.guias), [['Guia de frente'], [], []]);
  assert.deepEqual(r.extra[0].guias, ['Guia chefe', 'Guia de frente']);
  assert.equal(sugestoesDaGira(ps, { data: '2030-01-01', entidade: '' }), null);
});

test('sugestão Mi/Mãe Vê: presença no ano, giras da linha e ordem', async () => {
  const { sugestoesDaGira } = await import('../shared/regras.js');
  const cam = (id, nome, extra = {}) => ({ id, nome, funcao: 'cambone', afinidadePasse: ['caboclo'], ...extra });
  const ps = [
    cam('1', 'Ana'),
    cam('2', 'Bia', { guiasAtendimento: { caboclo: 'Pena Branca' } }),
    cam('3', 'Caio', { guiaFrente: 'caboclo' }),
    cam('4', 'Duda', { guiaChefe: 'caboclo' }),
    cam('5', 'Eva'),
    cam('6', 'Fábio'),
  ];
  const giras = [
    { data: '2029-12-01', entidade: 'Caboclo', presenca: { 1: 'p', 5: 'p', 6: 'f' } },   // ano anterior: só conta nas giras da linha
    { data: '2030-01-10', entidade: 'Caboclo', presenca: { 1: 'p', 5: 'f', 6: 'p' } },
    { data: '2030-01-17', entidade: 'Baiano', presenca: { 1: 'f', 5: 'p', 6: 'p' } },
    { data: '2030-02-01', entidade: 'Caboclo', presenca: {} },                              // a própria gira: não conta
  ];
  const r = sugestoesDaGira(ps, giras[3], giras);
  // Guia chefe, Guia de frente, com nome da entidade; depois presença (Fábio 100%, Eva e Ana 50%) e giras da linha (Ana 2, Eva 1).
  assert.deepEqual(r.passe.map((x) => x.nome), ['Duda', 'Caio', 'Bia', 'Fábio', 'Ana', 'Eva']);
  const ana = r.passe.find((x) => x.nome === 'Ana');
  assert.deepEqual([ana.pres, ana.base, ana.pct, ana.nGiras], [1, 2, 50, 2]);
  assert.equal(r.passe.find((x) => x.nome === 'Bia').temNome, true);
  assert.equal(ana.oferendas, null, 'sem perfis: sem oferendas');

  // Oferendas (perfis do admin) vêm antes de tudo: orixá de frente; mais orixás (ancestral, adjunto); mais guias (chefe, de frente).
  const ofs = (frente, ancestral, adjunto, chefe, guiaFrente = false) => ({ orixas: { frente: { oferenda: frente }, ancestral: { oferenda: ancestral }, adjunto: { oferenda: adjunto } }, guias: { chefe: { oferenda: chefe }, frente: { oferenda: guiaFrente } } });
  const perfis = { 1: ofs(false, true, true, true), 5: ofs(true, false, false, false), 6: ofs(false, true, false, true, true), 3: ofs(false, true, false, true) };
  const r2 = sugestoesDaGira(ps, giras[3], giras, perfis);
  // Fábio (2 guias) passa à frente de Caio (1 guia).
  assert.deepEqual(r2.passe.map((x) => x.nome), ['Eva', 'Ana', 'Fábio', 'Caio', 'Duda', 'Bia']);
  assert.deepEqual(r2.passe[0].oferendas, { frente: true, ancestral: false, adjunto: false, chefe: false, guiaFrente: false });
  assert.deepEqual(r2.passe.find((x) => x.nome === 'Bia').oferendas, { frente: false, ancestral: false, adjunto: false, chefe: false, guiaFrente: false });
});

test('aba Curimba: só o root e o Admin curimba (o Admin não vem com ela)', () => {
  const abas = (chave) => PERFIS_PADRAO.find((p) => p.chave === chave).abas;
  assert.ok(PERMISSOES_ROOT.includes('curimba:editar'));
  assert.ok(permissoesDe('admin_curimba', abas('admin_curimba')).includes('curimba:editar'));
  for (const k of ['admin', 'corrente']) assert.ok(!permissoesDe(k, abas(k)).includes('curimba:ver'), k);
  assert.ok(!PERFIS_PADRAO.some((p) => p.chave === 'usuario'), 'o perfil Usuário saiu (v187)');
});

test('eventos: orixá aparece só no próprio dia (com duas datas, nas duas)', async () => {
  const { orixasDoDia } = await import('../shared/eventos.js');
  assert.deepEqual(orixasDoDia('2026-04-23'), [{ data: '2026-04-23', nome: 'Dia de Ogum', orixa: true }]);
  assert.deepEqual(orixasDoDia('2026-04-22'), []);
  assert.deepEqual(orixasDoDia('2026-12-08').map((e) => e.nome), ['Dia de Iemanjá', 'Dia de Oxum']);
  assert.deepEqual(orixasDoDia('2026-09-30').map((e) => e.nome), ['Dia de Xangô']);
  assert.deepEqual(orixasDoDia('2026-08-16').map((e) => e.nome), ['Dia de Obaluaê', 'Dia de Omulu']);
});

test('aba Vídeos: root e Admin curimba administram; os demais acessam quando publicada', () => {
  assert.ok(PERMISSOES_ROOT.includes('videos:ver') && PERMISSOES_ROOT.includes('videos:editar'));
  const curimba = PERFIS_PADRAO.find((x) => x.chave === 'admin_curimba');
  assert.ok(permissoesDe(curimba.chave, curimba.abas).includes('videos:ver'));
  assert.ok(permissoesDe(curimba.chave, curimba.abas).includes('videos:editar'));
  for (const p of PERFIS_PADRAO.filter((x) => !['root', 'admin_curimba'].includes(x.chave))) {
    assert.ok(!permissoesDe(p.chave, p.abas).includes('videos:ver'), p.chave);
    assert.ok(!permissoesDe(p.chave, p.abas).includes('videos:editar'), p.chave);
  }
});

test('vídeos: código do YouTube sai de qualquer formato de link', async () => {
  const { idDoYoutube, CLASSES_VIDEO_TODAS } = await import('../shared/videos.js');
  assert.ok(CLASSES_VIDEO_TODAS.includes('Curimba'));
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'youtu.be/dQw4w9WgXcQ?si=x', 'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']) assert.equal(idDoYoutube(u), 'dQw4w9WgXcQ', u);
  for (const u of ['https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/curto', '', null]) assert.equal(idDoYoutube(u), null, String(u));
});

test('perfis: perfil com todas as abas marcadas recebe todas as permissões (nenhuma aba fica de fora da ordem fixa)', () => {
  const tudo = Object.fromEntries(PERFIS_PADRAO[0].abas ? Object.keys(PERFIS_PADRAO[0].abas).map((k) => [k, { ver: true, editar: true }]) : []);
  const perms = permissoesDe('qualquer', tudo);
  for (const p of PERMISSOES_ROOT.filter((x) => x !== 'usuarios:gerenciar')) assert.ok(perms.includes(p), p);
});

test('aba ASAAS: o root vê e edita; o Admin financeiro só olha; os outros perfis não têm', () => {
  assert.ok(PERMISSOES_ROOT.includes('asaas:ver') && PERMISSOES_ROOT.includes('asaas:editar'));
  for (const p of PERFIS_PADRAO.filter((x) => x.chave !== 'root')) {
    const perms = permissoesDe(p.chave, p.abas);
    assert.equal(perms.includes('asaas:ver'), p.chave === 'admin_financeiro', p.chave);
    assert.ok(!perms.includes('asaas:editar'), p.chave);
  }
});

test('aba Fotos: todos veem; só os perfis de admin apagam a foto dos outros', () => {
  // Consulentes e Alunos não são da corrente: as Fotos não estão entre as abas deles.
  for (const p of PERFIS_PADRAO.filter((x) => x.chave !== 'consulente' && x.chave !== 'aluno')) {
    const perms = permissoesDe(p.chave, p.abas);
    assert.ok(perms.includes('fotos:ver'), p.chave);
    assert.equal(perms.includes('fotos:editar'), p.chave === 'root' || p.chave.startsWith('admin'), p.chave);
  }
});

test('Mãe Vê vem sempre primeiro entre os médiuns da escala', async () => {
  const { ordRecebe } = await import('../shared/regras.js');
  const ps = [{ nome: 'Ana', funcao: 'medium' }, { nome: 'Zé', funcao: 'extra' }, { nome: 'Mãe Vê', funcao: 'medium' }, { nome: 'Bruno', funcao: 'medium' }];
  assert.deepEqual(ps.sort(ordRecebe).map((p) => p.nome), ['Mãe Vê', 'Ana', 'Bruno', 'Zé']);
});

test('sorteio: médium com médium de passe junto tem preferência para ter 2 cambones', async () => {
  const { sortear, remanejar } = await import('../shared/regras.js');
  // 5 médiuns (2 com passe junto), 8 cambones: cada médium com 1, 1 no Suporte (obrigatório) e os 2 que sobram para
  // quem tem passe junto.
  const pessoas = [
    ...['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: 'm' + n, nome: n, funcao: 'medium', experiente: i < 3 })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: 'c' + n, nome: 'Cambone ' + n, funcao: 'cambone' })),
    { id: 'p1', nome: 'Passe 1', funcao: 'passe' }, { id: 'p2', nome: 'Passe 2', funcao: 'passe' },
  ];
  const g = { data: '2026-11-07', entidade: 'Gira interna', presenca: {}, pares: [], passes: [] };
  for (let i = 0; i < 20; i++) {
    const { pares, passes } = sortear(pessoas, [], g).patch;
    const comPasse = new Set(passes.map((p) => p.m));
    assert.equal(comPasse.size, 2);
    const dois = ['mA', 'mB', 'mC', 'mD', 'mE'].filter((m) => pares.filter((p) => p.m === m).length === 2);
    assert.deepEqual(new Set(dois), comPasse, 'quem tem passe fica com os 2 cambones');
    assert.equal(Object.values(sortear(pessoas, [], g).patch.papeis).filter((v) => v === 'sup').length, 1, '1 no Suporte');
  }
  // Remanejar: cambone livre vai primeiro para quem tem passe junto.
  const g2 = { ...g, presenca: {}, passes: [{ m: 'mC', c: 'p1' }],
    pares: [{ m: 'mA', c: 'c1' }, { m: 'mB', c: 'c2' }, { m: 'mC', c: 'c3' }, { m: 'mD', c: 'c4' }, { m: 'mE', c: 'c5' }] };
  // Dois livres (c6, c7): um vai para o Suporte (obrigatório) e o outro para quem tem passe junto.
  const semC8 = pessoas.filter((p) => !['c8', 'p2'].includes(p.id));
  const r = remanejar(semC8, [], g2).patch;
  const livresNaDupla = r.pares.filter((p) => ['c6', 'c7'].includes(p.c));
  assert.equal(livresNaDupla.length, 1);
  assert.equal(livresNaDupla[0].m, 'mC', 'o cambone livre vai para quem tem passe');
  assert.equal(Object.values(r.papeis).filter((v) => v === 'sup').length, 1, 'e o outro para o Suporte');
  assert.ok(Object.keys(r.suporteAuto).length === 1);
});

test('oferendas: alunos por turma nos grupos', async () => {
  const { grupoOferendaValido, opcoesGruposOferenda, gruposMarcados, gruposParaEnviar, GRUPOS_CORRENTE } = await import('../shared/oferendas.js');
  assert.ok(grupoOferendaValido('medium') && grupoOferendaValido('alunos') && grupoOferendaValido('alunos:sem'));
  assert.ok(grupoOferendaValido('turma:3f2c1a4e-0000-4000-8000-000000000001'));
  assert.ok(!grupoOferendaValido('turma:xyz') && !grupoOferendaValido('outro'));
  const turmas = [{ id: 't1', nome: 'Turma 09' }, { id: 't2', nome: 'Turma 10' }];
  const ops = opcoesGruposOferenda(turmas, [{ turmaId: 't1' }, { turmaId: null }]);
  assert.deepEqual(ops.slice(-3), [['turma:t1', 'Alunos · Turma 09'], ['turma:t2', 'Alunos · Turma 10'], ['alunos:sem', 'Alunos sem turma']]);
  assert.ok(!ops.some(([k]) => k === 'alunos'), 'com as turmas, não há "Alunos" inteiro');
  assert.ok(opcoesGruposOferenda(undefined).some(([k]) => k === 'alunos'), 'sem acesso às turmas, fica "Alunos"');
  assert.deepEqual(gruposMarcados(['medium', 'alunos'], ops).filter((k) => k.startsWith('turma:')), ['turma:t1', 'turma:t2'], 'oferenda antiga com "alunos" marca todas as turmas');
  // A corrente é uma opção só ("Médiuns"), que vale as seis funções.
  assert.deepEqual(ops[0], ['corrente', 'Médiuns']);
  assert.ok(!ops.some(([k]) => GRUPOS_CORRENTE.includes(k)), 'sem uma opção por função');
  assert.ok(gruposMarcados(['cambone'], ops).includes('corrente'), 'qualquer função acende "Médiuns"');
  assert.deepEqual(gruposParaEnviar(['corrente', 'turma:t1']), [...GRUPOS_CORRENTE, 'turma:t1']);
  assert.ok(gruposParaEnviar(['corrente']).every(grupoOferendaValido));
});

test('oferendas: Detalhes da sub-aba — limpeza, linhas e no começo da lista compartilhada', async () => {
  const { limparDetalhes, linhasDetalhes, detalhesOk, textoOferenda } = await import('../shared/oferendas.js');
  assert.equal(limparDetalhes('\n\nRoupa branca.  \r\nChegar 19h\n\n'), 'Roupa branca.\nChegar 19h');
  assert.equal(limparDetalhes(null), '');
  assert.deepEqual(['', 'a', 'a\nb'].map(linhasDetalhes), [0, 1, 2]);
  assert.ok(detalhesOk('') && detalhesOk(Array(10).fill('x').join('\n')));
  assert.ok(!detalhesOk(Array(11).fill('x').join('\n')) && !detalhesOk('x'.repeat(1501)));
  const of = { titulo: 'Caboclos', data: '2027-01-20', responsavel: 'Ana', itens: [{ nome: 'Velas', quantidade: 2, doacoes: [] }] };
  const txt = textoOferenda(of, 'Roupa branca.\nChegar 19h');
  assert.ok(txt.indexOf('Responsável: Ana') < txt.indexOf('Roupa branca.') && txt.indexOf('Chegar 19h') < txt.indexOf('*Velas*'));
  assert.ok(!textoOferenda(of).includes('Roupa branca.'));
});

test('oferendas: cor do percentual por faixa', async () => {
  const { faixaPct } = await import('../shared/oferendas.js');
  assert.deepEqual([100, 99, 50, 49, 0].map(faixaPct), ['cheio', 'meio', 'meio', 'baixo', 'baixo']);
});

test('oferendas: seus compromissos (o que levar, por oferenda)', async () => {
  const { compromissosDe } = await import('../shared/oferendas.js');
  const doa = (q) => [{ chave: 'p:eu', quantidade: q }];
  const ofs = [
    { id: 'b', data: '2026-12-01', status: 'publicado', itens: [{ nome: 'Velas', doacoes: doa(2) }, { nome: 'Rosas', doacoes: doa(1), entregue: true }] },
    { id: 'a', data: '2026-11-10', status: 'publicado', itens: [{ nome: 'Frutas', doacoes: doa(3) }] },
    { id: 'velha', data: '2026-10-01', status: 'publicado', itens: [{ nome: 'Mel', doacoes: doa(1) }] },
    { id: 'enc', data: '2026-12-05', status: 'encerrado', itens: [{ nome: 'Fitas', doacoes: doa(1) }] },
    { id: 'pm', data: '2026-10-02', status: 'publicado', porMedium: true, itens: [], mediuns: [{ pessoaId: 'eu', pagamento: 'nao_pago', entrega: 'entregue' }] },
    { id: 'nada', data: '2026-12-09', status: 'publicado', itens: [{ nome: 'Água', doacoes: [] }] },
  ];
  const r = compromissosDe(ofs, 'p:eu', '2026-11-03');
  assert.deepEqual(r.map((x) => x.of.id), ['pm', 'a', 'b'], 'da mais próxima à mais distante; sem a passada, a encerrada e a sem compromisso');
  assert.deepEqual(r[2].itens.map((x) => [x.i.nome, x.q]), [['Velas', 2]], 'o que já foi entregue sai');
  assert.equal(r[0].linha.pagamento, 'nao_pago', 'lista por pessoa: falta pagar, mesmo com a data passada');
});

test('oferendas: estatísticas das oferendas por pessoa (admin)', async () => {
  const { estatisticasPorPessoa } = await import('../shared/oferendas.js');
  const m = (nome, pagamento, entrega) => ({ nome, pagamento, entrega });
  const ofs = [
    { id: 'b', data: '2026-12-01', status: 'publicado', porMedium: true, noResumo: true, mediuns: [m('Ana', 'pago', 'entregue'), m('Bia', 'nao_pago', 'pendente'), m('Caio', 'pago', 'pendente')] },
    { id: 'a', data: '2026-11-10', status: 'aguardando', porMedium: true, noResumo: true, mediuns: [] },
    { id: 'fora', data: '2026-11-08', status: 'publicado', porMedium: true, noResumo: false, mediuns: [m('Eva', 'nao_pago', 'pendente')] },
    { id: 'enc', data: '2026-11-05', status: 'encerrado', porMedium: true, noResumo: true, mediuns: [m('Duda', 'nao_pago', 'pendente')] },
    { id: 'itens', data: '2026-11-06', status: 'publicado', porMedium: false, mediuns: [] },
  ];
  const r = estatisticasPorPessoa(ofs);
  assert.deepEqual(r.map((x) => x.of.id), ['a', 'b'], 'só por pessoa, marcadas "Exibir no resumo" e não encerradas, da mais próxima');
  assert.deepEqual([r[1].pessoas.length, r[1].naoPagos.map((x) => x.nome), r[1].naoEntregues.map((x) => x.nome)], [3, ['Bia'], ['Bia', 'Caio']]);
});

test('anamnese: respostas, preenchida e arquivo', async () => {
  const { limparRespostaTexto, limparRespostaData, anamnesePreenchida, respostasPorPessoa, textoAnamnese } = await import('../shared/perfil.js');
  assert.equal(limparRespostaTexto('  tomo   remédio \n\n para pressão '), 'tomo remédio\npara pressão');
  assert.equal(limparRespostaTexto(Array.from({ length: 21 }, () => 'a').join('\n')), null, 'até 20 linhas');
  assert.equal(limparRespostaTexto('x'.repeat(2001)), null, 'até 2.000 letras');
  assert.equal(limparRespostaData('2026-02-29'), null, 'data inexistente');
  assert.equal(limparRespostaData('2024-02-29'), '2024-02-29');
  const P = [{ id: 'q1', texto: 'Tem alergia?', tipo: 'simnao' }, { id: 'q2', texto: 'Quais remédios?', tipo: 'texto' }];
  assert.ok(!anamnesePreenchida([], {}), 'sem perguntas não conta como preenchida');
  assert.ok(!anamnesePreenchida(P, { q1: 'sim' }));
  assert.ok(anamnesePreenchida(P, { q1: 'nao', q2: 'nenhum' }));
  const comOpcionais = [...P, { id: 'q3', tipo: 'texto', obrigatoria: false }];
  assert.ok(anamnesePreenchida(comOpcionais, { q1: 'nao', q2: 'nenhum' }), 'pergunta opcional não impede preenchimento');
  const multipla = [{ id: 'q4', tipo: 'multipla' }];
  assert.ok(!anamnesePreenchida(multipla, { q4: '[]' }));
  assert.ok(anamnesePreenchida(multipla, { q4: '["opção"]' }));
  const R = respostasPorPessoa([{ pessoaId: 'a', perguntaId: 'q1', resposta: 'sim' }, { pessoaId: 'a', perguntaId: 'q2', resposta: 'dipirona' }, { pessoaId: 'b', perguntaId: 'q1', resposta: 'nao' }]);
  const txt = textoAnamnese(P, [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bia' }, { id: 'c', nome: 'Caio' }], R, '2026-11-04');
  assert.match(txt, /Gerado em 04\/11\/2026/);
  assert.match(txt, /Preenchidas: 1 de 3/);
  assert.match(txt, /== Ana ==\n1\. Tem alergia\?\n {3}Sim\n2\. Quais remédios\?\n {3}dipirona/);
  assert.match(txt, /== Bia ==[\s\S]*Não[\s\S]*—/);
  assert.ok(!txt.includes('Caio'), 'quem não respondeu nada fica de fora');
});

test('escala travada: falta e ausência não mudam a escala mostrada; encerrar continua com a presença real', async () => {
  const { escalaDaGira, paresPorMedium, encerrar } = await import('../shared/regras.js');
  const pessoas = [{ id: 'm1', nome: 'Ana', funcao: 'medium' }, { id: 'c1', nome: 'Bia', funcao: 'cambone' }, { id: 'm2', nome: 'Caio', funcao: 'medium' }, { id: 'c2', nome: 'Duda', funcao: 'cambone' }];
  const base = { data: '2026-11-07', entidade: '', pendentePadrao: false, papeis: {}, passes: [], pares: [{ m: 'm1', c: 'c1' }, { m: 'm2', c: 'c2' }], presenca: { c1: 'f', m2: 'a' } };
  const nomes = (g) => paresPorMedium(pessoas, g).validos.map((p) => p.m + p.c);
  assert.deepEqual(nomes(escalaDaGira(base)), [], 'sem trava, as duas duplas saem');
  const trav = { ...base, travada: true };
  assert.deepEqual(nomes(escalaDaGira(trav)), ['m1c1', 'm2c2'], 'com a trava, a escala fica como foi sorteada');
  assert.deepEqual(trav.presenca, { c1: 'f', m2: 'a' }, 'a presença real não muda');
  assert.equal(encerrar(pessoas, trav).patch.pares.length, 0, 'ao encerrar, valem as faltas: a dupla de quem faltou não fica no histórico');
});

test('retrato da gira encerrada: mudar o cadastro depois não muda a gira; reabrir volta a seguir o cadastro', async () => {
  const { encerrar, reabrir, giraVazia, pessoasDaGira, status, funcaoNaGira, limpezaDaGira, naGira, compactarRetratos } = await import('../shared/regras.js');
  const data = '2026-11-04';
  const ana = { id: 'a', nome: 'Ana', funcao: 'medium', limpeza: 2, licencas: [] };
  const bia = { id: 'b', nome: 'Bia', funcao: 'cambone', limpeza: 2, licencas: [] };
  const cai = { id: 'c', nome: 'Caio', funcao: 'extra', linhas: ['caboclo'], licencas: [] };
  const g0 = { ...giraVazia(data), entidade: 'caboclo', limpeza: 2, presenca: { a: 'p', b: 'p', c: 'p' }, pares: [{ m: 'a', c: 'b' }] };
  const { patch } = encerrar([ana, bia, cai], g0);
  assert.deepEqual(Object.keys(patch.retrato).sort(), ['a', 'b', 'c']);
  assert.deepEqual(patch.retrato.c, { nome: 'Caio', funcao: 'extra', experiente: false, linhas: ['caboclo'], limpeza: null, licenca: null });
  const g = { ...g0, ...patch };

  // Depois de encerrada: Ana renomeada, Bia vira médium e ganha licença no dia, Caio perde a linha; Dora entra com data antiga.
  const depois = [
    { ...ana, nome: 'Ana Maria' },
    { ...bia, funcao: 'medium', licencas: [{ id: 'l', inicio: data, fim: data, motivo: '' }] },
    { ...cai, linhas: [] },
    { id: 'd', nome: 'Dora', funcao: 'cambone', licencas: [] },
  ];
  const ps = pessoasDaGira(depois, g);
  assert.deepEqual(ps.map((p) => p.nome).sort(), ['Ana', 'Bia', 'Caio'], 'nomes do retrato; quem entrou depois não aparece');
  assert.equal(status(depois[1], g), 'p', 'licença lançada depois não muda a gira encerrada');
  assert.equal(funcaoNaGira(depois[1], g), 'cambone', 'função de quando encerrou');
  assert.equal(funcaoNaGira(depois[2], g), 'extra', 'linha tirada depois não faz cambonar');
  assert.equal(naGira(depois[3], g), false);
  assert.deepEqual(limpezaDaGira(depois, g, [g]).membros.map((p) => p.nome), ['Ana', 'Bia'], 'turma da limpeza do retrato');

  // Pessoa apagada do cadastro: a gira continua com ela.
  const semAna = depois.filter((p) => p.id !== 'a');
  assert.ok(pessoasDaGira(semAna, g).some((p) => p.id === 'a' && p.nome === 'Ana'));

  // Formato compacto: só o que difere do cadastro; expandido dá o mesmo resultado.
  const [gc] = compactarRetratos(depois, [g]);
  assert.deepEqual(gc.retrato.a, { nome: 'Ana' });
  assert.deepEqual(gc.retrato.b, { funcao: 'cambone', licenca: null });
  assert.deepEqual(gc.retrato.c, { linhas: ['caboclo'] });
  const nomes = (x) => pessoasDaGira(depois, x).map((p) => `${p.nome}:${p.funcao}:${status(p, x)}`).sort();
  assert.deepEqual(nomes(gc), nomes(g));
  const [gc2] = compactarRetratos(semAna, [g]);
  assert.deepEqual(gc2.retrato.a, g.retrato.a, 'quem foi apagado vai completo');

  // Reabrir: sem retrato, segue o cadastro de novo.
  const r = reabrir(depois, g).patch;
  assert.equal(r.retrato, null);
  assert.equal(status(depois[1], { ...g, ...r }), 'lic');
});

test('consulente: só o Ver das abas dos consulentes, sem os nomes da corrente', async () => {
  const { permissoesConsulente, ABAS_CONSULENTE } = await import('../shared/permissoes.js');
  assert.deepEqual(ABAS_CONSULENTE, ['perfil', 'guias', 'amaci', 'videos']);
  const p = permissoesConsulente({ perfil: { ver: true }, guias: { ver: true, editar: true }, pessoas: { ver: true }, gira: { ver: true } });
  assert.deepEqual(p.sort(), ['alunos:ver', 'guias:pedir', 'perfil:ver']);
  assert.ok(!p.includes('pessoas:ler') && !p.includes('giras:ler'));
});

test('o sorteio usa a função do dia (passo Escala → Função nesta gira)', () => {
  const pessoas = [
    { id: 'm1', nome: 'Ana', funcao: 'medium', experiente: true },
    { id: 'm2', nome: 'Bia', funcao: 'medium' },
    { id: 'c1', nome: 'Caio', funcao: 'cambone' },
    { id: 'c2', nome: 'Duda', funcao: 'cambone' },
    { id: 'c3', nome: 'Edu', funcao: 'cambone' },
    { id: 'p1', nome: 'Paula', funcao: 'passe', linhas: ['caboclo'] },
  ];
  // Caio vira Senha (fora das duplas), Edu vai para o Suporte, Paula (Passe) vira At. Extra (recebe cambone)
  // e a Bia (médium) cambona nesta gira.
  const g = { data: '2026-11-28', entidade: 'Caboclo', presenca: {}, pares: [], passes: [], papeis: { c1: 'sen', c3: 'sup', p1: 'ext', m2: 'na' } };
  const { pares, passes } = sortear(pessoas, [], g).patch;
  const todos = [...pares, ...(passes || [])];
  assert.ok(!todos.some((p) => p.c === 'c1' || p.m === 'c1'), 'Senha fica fora das duplas');
  assert.ok(!todos.some((p) => p.c === 'c3' || p.m === 'c3'), 'Suporte fica fora do sorteio');
  assert.ok(pares.some((p) => p.m === 'p1'), 'Passe que vira At. Extra recebe cambone');
  assert.ok(!(passes || []).some((p) => p.c === 'p1'), 'e não vai como médium de passe');
  assert.ok(pares.some((p) => p.c === 'm2') && !pares.some((p) => p.m === 'm2'), 'médium que cambona não recebe cambone');
  assert.deepEqual(new Set(pares.map((p) => p.m)), new Set(['m1', 'p1']));
});

test('regra da escala: 1 cambone por médium, Suporte obrigatório, 2º cambone com passe e o Suporte até 2', () => {
  const med = (n, xp) => ({ id: 'm' + n, nome: 'Médium ' + n, funcao: 'medium', experiente: !!xp });
  const cam = (n) => ({ id: 'c' + n, nome: 'Cambone ' + n, funcao: 'cambone' });
  const g = { data: '2026-11-25', entidade: 'Gira interna', presenca: {}, pares: [], passes: [] };
  // 3 médiuns (1 com passe junto), 1 passe e 7 cambones: 3 + 1 no Suporte + o 2º de quem tem passe; sobram 2: um vai
  // para o Suporte (chega ao máximo, 2) e o outro vira 2º cambone de m2 ou m3.
  const pessoas = [med(1, true), med(2), med(3), { id: 'p1', nome: 'Passe', funcao: 'passe' }, ...[1, 2, 3, 4, 5, 6, 7].map(cam)];
  const { patch, mensagem } = sortear(pessoas, [], g);
  const conta = (m) => patch.pares.filter((p) => p.m === m).length;
  assert.equal(conta('m1'), 2);
  assert.deepEqual([conta('m2'), conta('m3')].sort(), [1, 2]);
  const sup = Object.keys(patch.papeis).filter((id) => patch.papeis[id] === 'sup');
  assert.equal(sup.length, 2);
  assert.deepEqual(Object.keys(patch.suporteAuto).sort(), sup.sort(), 'guarda quem o sorteio pôs no Suporte');
  assert.match(mensagem, /ninguém na Senha/, 'a Senha não é sorteada: só avisa');
  // Sortear de novo desfaz o Suporte do sorteio anterior antes de distribuir (ninguém fica preso lá).
  const g2 = { ...g, ...patch };
  assert.equal(Object.values(sortear(pessoas, [], g2).patch.papeis).filter((v) => v === 'sup').length, 2);
  // Com alguém da Senha presente, não avisa; quem já está no Suporte conta como o obrigatório.
  const comSenha = [...pessoas, { id: 's1', nome: 'Senha', funcao: 'senha' }];
  const g3 = { ...g, papeis: { c7: 'sup' } };
  const r3 = sortear(comSenha, [], g3);
  assert.doesNotMatch(r3.mensagem, /ninguém na Senha/);
  assert.equal(r3.patch.papeis.c7, 'sup');
  // 6 cambones para cambonar (c7 já no Suporte): 3 + o 2º de m1; sobram 2: um completa o Suporte (2) e o outro cambona.
  assert.equal(r3.patch.pares.length, 5);
  assert.equal(Object.values(r3.patch.papeis).filter((v) => v === 'sup').length, 2);
  // Todo médium já com dois: só aí o Suporte passa do máximo (3 médiuns, 10 cambones → 6 duplas e 4 no Suporte).
  const muitos = sortear([med(1), med(2), med(3), ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cam)], [], g).patch;
  assert.equal(muitos.pares.length, 6);
  assert.equal(Object.values(muitos.papeis).filter((v) => v === 'sup').length, 4);
  // Cambones a menos que médiuns: todo mundo cambona e um cambone acompanha dois médiuns; ninguém vai para o Suporte.
  const poucos = [med(1), med(2), med(3), cam(1), cam(2)];
  const r4 = sortear(poucos, [], g).patch;
  assert.deepEqual(new Set(r4.pares.map((p) => p.m)), new Set(['m1', 'm2', 'm3']));
  assert.equal(Object.values(r4.papeis).filter((v) => v === 'sup').length, 0);
});

test('Regras da casa: mínimo no Suporte, quem recebe o 2º cambone e turmas da limpeza', async () => {
  const { definirConfig } = await import('../shared/config.js');
  const { remanejar, turmasLimpeza, proximaTurma } = await import('../shared/regras.js');
  const med = (n, xp) => ({ id: 'm' + n, nome: 'Médium ' + n, funcao: 'medium', experiente: !!xp });
  const cam = (n) => ({ id: 'c' + n, nome: 'Cambone ' + n, funcao: 'cambone' });
  const g = { data: '2026-11-25', entidade: 'Gira interna', presenca: {}, pares: [], passes: [] };
  // 3 médiuns (1 com passe junto), 1 passe e 7 cambones.
  const pessoas = [med(1, true), med(2), med(3), { id: 'p1', nome: 'Passe', funcao: 'passe' }, ...[1, 2, 3, 4, 5, 6, 7].map(cam)];
  const conta = (patch, m) => patch.pares.filter((p) => p.m === m).length;
  const noSup = (patch) => Object.values(patch.papeis).filter((v) => v === 'sup').length;
  try {
    // 2º cambone para qualquer médium: os 3 ficam com 2 e sobra 1 (o mínimo no Suporte).
    definirConfig({ regras: { segundoCambone: 'todos' } });
    let { patch } = sortear(pessoas, [], g);
    assert.deepEqual([conta(patch, 'm1'), conta(patch, 'm2'), conta(patch, 'm3')], [2, 2, 2]);
    assert.equal(noSup(patch), 1);
    // Ninguém recebe o 2º antes do máximo: com o Suporte sem limite, 3 duplas e 4 no Suporte; com o máximo 2, os 2 a
    // mais viram 2º cambone.
    definirConfig({ regras: { segundoCambone: 'nenhum', suporteMaximo: 0 } });
    ({ patch } = sortear(pessoas, [], g));
    assert.equal(patch.pares.length, 3);
    assert.equal(noSup(patch), 4);
    definirConfig({ regras: { segundoCambone: 'nenhum' } });
    ({ patch } = sortear(pessoas, [], g));
    assert.equal(patch.pares.length, 5);
    assert.equal(noSup(patch), 2);
    // Mínimo 0 e 2º para todos: ninguém vai obrigado ao Suporte (3 × 2 = 6; sobra 1, que vai por sobrar).
    definirConfig({ regras: { segundoCambone: 'todos', suporteMinimo: 0 } });
    ({ patch } = sortear([med(1), med(2), med(3), ...[1, 2, 3, 4, 5, 6].map(cam)], [], g));
    assert.equal(patch.pares.length, 6);
    assert.equal(noSup(patch), 0);
    // Mínimo 3 (acima do máximo 2, o máximo sobe junto): o Suporte fica com 3 antes do 2º cambone de quem tem passe
    // (7 − 3 duplas − 3 = 1 → o 2º de m1).
    definirConfig({ regras: { suporteMinimo: 3 } });
    ({ patch } = sortear(pessoas, [], g));
    assert.equal(noSup(patch), 3);
    assert.equal(conta(patch, 'm1'), 2);
    // Remanejar segue o mesmo mínimo: um do Suporte falta e o 2º cambone de m1 vai para lá, completando os 3.
    const faltou = Object.keys(patch.papeis).find((id) => patch.papeis[id] === 'sup');
    const r = remanejar(pessoas, [], { ...g, ...patch, presenca: { [faltou]: 'f' }, papeis: { ...patch.papeis, [faltou]: undefined } }).patch;
    assert.equal(Object.values(r.papeis).filter((v) => v === 'sup').length, 3);
    assert.equal(r.pares.filter((p) => p.m === 'm1').length, 1);
    // Remanejar respeita o máximo no Suporte: falta o médium sem passe que tinha 2 cambones; com o Suporte já em 2, um
    // vira 2º cambone do outro médium e só o que sobra (todos já com dois) passa do máximo.
    definirConfig({ regras: {} });
    ({ patch } = sortear(pessoas, [], g));
    const dono = ['m2', 'm3'].find((m) => conta(patch, m) === 2);
    const outro = dono === 'm2' ? 'm3' : 'm2';
    const r2 = remanejar(pessoas, [], { ...g, ...patch, presenca: { [dono]: 'f' } }).patch;
    assert.equal(r2.pares.filter((p) => p.m === outro).length, 2);
    assert.equal(Object.values(r2.papeis).filter((v) => v === 'sup').length, 3);
    // Turmas da limpeza: o rodízio vai até a última turma da casa.
    definirConfig({ regras: { turmasLimpeza: 3 } });
    assert.deepEqual(turmasLimpeza(), [1, 2, 3]);
    const comTurma = [1, 2, 3, 4].map((t) => ({ id: 't' + t, nome: 'T' + t, funcao: 'cambone', limpeza: t }));
    assert.equal(proximaTurma(comTurma, [{ data: '2026-11-18', encerrada: true, limpeza: 3 }], '2026-11-25'), 1, 'depois da 3 volta à 1');
  } finally { definirConfig(null); }
  assert.equal(turmasLimpeza().length, 7, 'sem regra guardada, o padrão');
});

test('Suporte roda entre os cambones: quem esteve lá na última gira volta a cambonar', () => {
  const pessoas = [{ id: 'm1', nome: 'Ana', funcao: 'medium' }, { id: 'm2', nome: 'Bia', funcao: 'medium' },
    ...[1, 2, 3].map((n) => ({ id: 'c' + n, nome: 'Cambone ' + n, funcao: 'cambone' }))];
  const anterior = { data: '2026-11-18', entidade: 'Gira interna', pares: [{ m: 'm1', c: 'c1' }, { m: 'm2', c: 'c2' }], papeis: { c3: 'sup' } };
  const g = { data: '2026-11-25', entidade: 'Gira interna', presenca: {}, pares: [], passes: [] };
  for (let i = 0; i < 20; i++) {
    const { papeis } = sortear(pessoas, [anterior], g).patch;
    assert.notEqual(papeis.c3, 'sup', 'c3 esteve no Suporte na última gira');
    assert.equal(Object.values(papeis).filter((v) => v === 'sup').length, 1);
  }
});

test('perfil Alunos: nasce como era fixo; só o Ver das abas que funcionam fora da corrente', async () => {
  const { permissoesAluno, ABAS_ALUNO, PERMISSOES_GRUPO: G } = await import('../shared/permissoes.js');
  const aluno = PERFIS_PADRAO.find((p) => p.chave === 'aluno');
  assert.deepEqual(permissoesAluno(aluno.abas).sort(), [...G.alunos].sort(), 'o padrão é o que era fixo antes');
  assert.deepEqual(ABAS_ALUNO, ['guias', 'amaci', 'videos']);
  // Editar não vale, e abas da corrente (Pessoas, Gira) são ignoradas.
  assert.deepEqual(permissoesAluno({ videos: { ver: true, editar: true }, pessoas: { ver: true }, gira: { ver: true } }), ['alunos:ver', 'videos:ver']);
  assert.deepEqual(permissoesAluno(null), G.alunos, 'sem o perfil, o de antes');
});
