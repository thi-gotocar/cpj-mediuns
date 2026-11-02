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

test('bloco Eventos da aba Gira: gira dos próximos 30 dias, evento e aviso todos os futuros, amaci só da semana', async () => {
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
  assert.deepEqual(eventosDoTopo(evs, hoje).map((e) => e.nome), ['Hoje', 'Amaci da semana', 'Gira do mês', 'Gira daqui a 30', 'Evento longe', 'Aviso longe']);
});

test('perfil: informações (nascimento e telefones validados)', async () => {
  const { normalizarPerfil, lerNascimento, telefoneBR } = await import('../shared/perfil.js');
  assert.equal(lerNascimento('31/10/1990'), '1990-10-31');
  assert.equal(lerNascimento('31/02/1990'), '');
  assert.equal(lerNascimento('31/10/2999'), '', 'no futuro não');
  assert.equal(telefoneBR('11987654321'), '(11) 98765-4321');
  assert.equal(telefoneBR('1134567890'), '(11) 3456-7890');
  const p = normalizarPerfil({ info: { nome: '  Ana   Maria ', nascimento: '1990-10-31', celular: '(11) 98765-4321', contatoNome: 'Mãe', contatoTelefone: '123', extra: 'x' } });
  assert.deepEqual(p.info, { nome: 'Ana Maria', nascimento: '1990-10-31', celular: '11987654321', contatoNome: 'Mãe', contatoTelefone: '' });
  assert.deepEqual(normalizarPerfil(null).info, { nome: '', nascimento: '', celular: '', contatoNome: '', contatoTelefone: '' });
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
  assert.equal(papelDe({ ...s, funcao: 'medium' }, g({ s: 'sen' })), 'cad', "'sen' só vale para Cambone");
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
