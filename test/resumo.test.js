import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerResumo, casarNomes } from '../shared/resumo.js';

const MSG = `RESUMO DO EVENTO
Data: 30/09/2026
Horário: 20:00
Local: Cpj
Coordenador: Coordenador

PARTICIPAÇÃO
✅ Presentes: 45
❌ Ausentes: 13
📋 Em Licença: 0
🎫 Convidados: 0

TAXA DE PRESENÇA
Presença: 78%
Ausência: 22%
Licença: 0%

ATENDIMENTOS REALIZADOS
👑 Preferencial: 3
🤝 Normal: 40
🎁 Passe: 12
💫 Total: 55

AUSENTES
❌ Alessandra T8
❌ Ana T8
❌ Bruna Tiba T6
❌ Marlucy 
❌ Nathy T3

EM LICENÇA
Nenhum registro
`;

test('lê o resumo do evento colado do WhatsApp', () => {
  const r = lerResumo(MSG);
  assert.equal(r.data, '2026-09-30');
  assert.equal(r.horario, '20:00');
  assert.deepEqual(r.contagem, { presentes: 45, ausentes: 13, licenca: 0, convidados: 0 });
  assert.deepEqual(r.atendimentos, { preferencial: 3, normal: 40, passe: 12 });
  assert.deepEqual(r.ausentes, ['Alessandra T8', 'Ana T8', 'Bruna Tiba T6', 'Marlucy', 'Nathy T3']);
  assert.deepEqual(r.licenca, []);
  assert.deepEqual(lerResumo('EM LICENÇA\n📋 Rita T2\n').licenca, ['Rita T2']);
});

test('liga os nomes às pessoas da corrente', () => {
  const pessoas = ['Alessandra', 'Ana Paula', 'Ana Lúcia', 'Bruna Tiba', 'Marlúcy Souza', 'Natália'].map((nome, i) => ({ id: 'p' + i, nome }));
  const c = casarNomes(['Alessandra', 'Ana', 'Bruna tiba', 'Marlucy', 'Nathy'], pessoas);
  assert.equal(c[0].pessoa.nome, 'Alessandra');
  assert.equal(c[1].pessoa, null, 'Ana é ambíguo');
  assert.deepEqual(c[1].candidatos.sort(), ['Ana Lúcia', 'Ana Paula']);
  assert.equal(c[2].pessoa.nome, 'Bruna Tiba');
  assert.equal(c[3].pessoa.nome, 'Marlúcy Souza');
  assert.equal(c[3].provavel, true);
});

test('nome inteiro com a turma: casa com e sem a turma no cadastro', () => {
  const pessoas = ['Alessandra T8', 'Ana Paula T8', 'Ana Lúcia T6', 'Bruna Tiba', 'Rose T2', 'Rose T5', 'Caio T4'].map((nome, i) => ({ id: 'p' + i, nome }));
  const c = casarNomes(['Alessandra T8', 'Bruna Tiba T6', 'Rose T5', 'Rose', 'Caio T9', 'Ana T8'], pessoas);
  assert.equal(c[0].pessoa.nome, 'Alessandra T8'); assert.ok(!c[0].provavel);
  assert.equal(c[1].pessoa.nome, 'Bruna Tiba'); assert.ok(!c[1].provavel, 'cadastro sem turma');
  assert.equal(c[2].pessoa.nome, 'Rose T5', 'a turma desempata');
  assert.equal(c[3].pessoa, null); assert.deepEqual(c[3].candidatos.sort(), ['Rose T2', 'Rose T5']);
  assert.equal(c[4].pessoa.nome, 'Caio T4'); assert.equal(c[4].provavel, true, 'turma diferente: conferir');
  assert.equal(c[5].pessoa, null); assert.deepEqual(c[5].candidatos.sort(), ['Ana Lúcia T6', 'Ana Paula T8']);
});

test('resumo da gira encerrada: texto no formato do WhatsApp e lido de volta', async () => {
  const { textoResumo, dadosResumo } = await import('../shared/resumoGira.js');
  const pessoas = [
    { id: 'a', nome: 'Ana T8' }, { id: 'b', nome: 'Bia' }, { id: 'c', nome: 'Caio T7' }, { id: 'd', nome: 'Duda' },
    { id: 'e', nome: 'Rose T3', licencas: [{ id: 'l1', inicio: '2026-04-01', fim: '2026-09-14', motivo: 'Gravidez' }] },
    { id: 'f', nome: 'Edu' }, { id: 'g', nome: 'Gabi' },
  ];
  const g = { data: '2026-04-15', entidade: 'Mista', presenca: { a: 'a', c: 'f', d: 'sup' }, atendimentos: { preferencial: 2, normal: 30, passe: 5 } };
  const d = dadosResumo(pessoas, g);
  assert.deepEqual([d.presentes.length, d.ausentes.length, d.faltas.length, d.licenca.length], [4, 1, 1, 1]);
  assert.deepEqual(d.pct, { presenca: 57, ausencia: 29, licenca: 14 });
  const t = textoResumo(pessoas, g);
  assert.match(t, /^RESUMO DO EVENTO\nGira: Encontro das Linhas\nData: 15\/04\/2026\nLocal: Terreiro/);
  assert.match(t, /✅ Presentes: 4\n❌ Ausentes: 1\n🚫 Faltas: 1\n📋 Em Licença: 1/);
  assert.match(t, /Presença: 57%\nAusência: 29%\nLicença: 14%/);
  assert.match(t, /💫 Total: 37/);
  assert.match(t, /AUSENTES\n❌ Ana T8\n\nFALTAS\n🚫 Caio T7/);
  assert.match(t, /📋 Rose T3 - Gravidez - Retorno em 15\/09\/2026/);
  const r = lerResumo(t);
  assert.equal(r.data, '2026-04-15');
  assert.deepEqual(r.ausentes, ['Ana T8']);
  assert.deepEqual(r.faltas, ['Caio T7']);
  assert.deepEqual(r.licenca, ['Rose T3']);
  assert.equal(r.contagem.faltas, 1);
  assert.deepEqual(r.atendimentos, { preferencial: 2, normal: 30, passe: 5 });
});

test('resumo de evento mostra participantes em vez de atendimentos', async () => {
  const { textoResumo, dadosResumo, historicoAtendimentos } = await import('../shared/resumoGira.js');
  const evento = {
    data: '2026-04-15', entidade: 'Festa da Casa', evento: true, encerrada: true, participantes: 42,
    atendimentos: { preferencial: 3, normal: 20, passe: 7 },
  };
  const resumo = dadosResumo([], evento);
  const texto = textoResumo([], evento);
  assert.equal(resumo.participantes, 42);
  assert.match(texto, /TOTAL DE PARTICIPANTES\n👥 Participantes: 42/);
  assert.doesNotMatch(texto, /ATENDIMENTOS REALIZADOS|Preferencial|Normal:|Passe:/);
  assert.equal(historicoAtendimentos([evento], evento), null, 'evento não entra no histórico de atendimentos');
});

test('resumo da gira: turma da limpeza com presente/ausente na frente de cada nome', async () => {
  const { textoResumo } = await import('../shared/resumoGira.js');
  const pessoas = [
    { id: 'a', nome: 'Ana', limpeza: 2 }, { id: 'b', nome: 'Bia', limpeza: 2 }, { id: 'c', nome: 'Caio', limpeza: 2 },
    { id: 'd', nome: 'Duda', limpeza: 2, licencas: [{ id: 'l', inicio: '2026-05-01', fim: '2026-05-30', motivo: '' }] },
    { id: 'e', nome: 'Edu', limpeza: 1 }, { id: 'f', nome: 'Fábio' },
  ];
  const giras = [{ data: '2026-05-06', entidade: 'Exu', limpeza: 1, presenca: { e: 'f' } }];
  const g = { data: '2026-05-13', entidade: 'Caboclo', limpeza: 2, presenca: { b: 'a', c: 'f' } };
  const t = textoResumo(pessoas, g, 'Terreiro', giras);
  assert.match(t, /🧹 LIMPEZA · TURMA 2\n✅ Ana - Presente\n❌ Bia - Ausente\n🚫 Caio - Falta\n📋 Duda - Licença/);
  assert.match(t, /AJUDARAM NA LIMPEZA \(FALTARAM NA TURMA 1 EM 06\/05\)\n✅ Edu - Presente/);
  // a leitura de volta no Histórico não confunde a lista da limpeza com ausentes ou licença
  const r = lerResumo(t);
  assert.deepEqual(r.ausentes, ['Bia']);
  assert.deepEqual(r.faltas, ['Caio']);
  assert.deepEqual(r.licenca, ['Duda']);
  assert.doesNotMatch(textoResumo(pessoas, { ...g, limpeza: null }, 'Terreiro', giras), /LIMPEZA/);
});

test('resumo da gira: orixá no cabeçalho e lido de volta', async () => {
  const { textoResumo } = await import('../shared/resumoGira.js');
  const t = textoResumo([{ id: 'a', nome: 'Ana' }], { data: '2026-05-13', entidade: 'Caboclo', orixa: 'Oxóssi', presenca: {} });
  assert.match(t, /Gira: Caboclo\nOrixá: Oxóssi\nData: 13\/05\/2026/);
  assert.equal(lerResumo(t).orixa, 'Oxóssi');
  assert.doesNotMatch(textoResumo([], { data: '2026-05-13', entidade: 'Exu', orixa: 'Ogum', presenca: {} }), /Orixá/);
});

test('gráfico do resumo: histórico de atendimentos da entidade nos últimos 12 meses', async () => {
  const { historicoAtendimentos } = await import('../shared/resumoGira.js');
  const atual = {
    data: '2026-10-14', entidade: 'Caboclo', encerrada: true,
    atendimentos: { preferencial: 2, normal: 30, passe: 5 },
  };
  const giras = [
    { data: '2025-10-14', entidade: 'Caboclo', encerrada: true, atendimentos: { preferencial: 1, normal: 10, passe: 2 } },
    { data: '2025-10-13', entidade: 'Caboclo', encerrada: true, atendimentos: { normal: 99 } },
    { data: '2026-01-14', entidade: 'caboclo', encerrada: true, atendimentos: { preferencial: 3, normal: 20, passe: 4 } },
    { data: '2026-05-14', entidade: 'Exu', encerrada: true, atendimentos: { normal: 100 } },
    { data: '2026-07-14', entidade: 'Caboclo', encerrada: false, atendimentos: { normal: 200 } },
    { data: '2026-11-14', entidade: 'Caboclo', encerrada: true, atendimentos: { normal: 300 } },
  ];
  assert.deepEqual(historicoAtendimentos(giras, atual), {
    quantidade: 3,
    total: 77,
    giras: [
      { data: '2025-10-14', atendimentos: { preferencial: 1, normal: 10, passe: 2 }, total: 13 },
      { data: '2026-01-14', atendimentos: { preferencial: 3, normal: 20, passe: 4 }, total: 27 },
      { data: '2026-10-14', atendimentos: { preferencial: 2, normal: 30, passe: 5 }, total: 37 },
    ],
  });
  assert.equal(historicoAtendimentos([], { ...atual, entidade: '' }), null);
});

test('gráfico do resumo: frequência da corrente nas seis últimas giras encerradas da entidade', async () => {
  const { historicoFrequencia } = await import('../shared/resumoGira.js');
  const pessoas = [
    { id: 'a', nome: 'Ana', funcao: 'medium' },
    { id: 'b', nome: 'Bia', funcao: 'extra', entrada: '2026-03-01' },
    { id: 'c', nome: 'Caio', funcao: 'curimba' },
  ];
  const atual = { data: '2026-10-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'p', b: 'f' } };
  const giras = [
    { data: '2026-01-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'p' } },
    { data: '2026-02-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'a' } },
    { data: '2026-03-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'p', b: 'p' } },
    { data: '2026-04-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'f', b: 'p' } },
    { data: '2026-05-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'p', b: 'p' } },
    { data: '2026-06-14', entidade: 'Caboclo', encerrada: true, presenca: { a: 'p', b: 'a' } },
    { data: '2026-07-14', entidade: 'Caboclo', encerrada: false, presenca: { a: 'a', b: 'a' } },
    { data: '2026-08-14', entidade: 'Exu', encerrada: true, presenca: { a: 'p', b: 'p' } },
  ];
  const result = historicoFrequencia(giras, pessoas, atual);
  assert.equal(result.giras.length, 6);
  assert.deepEqual(result.giras[0], { data: '2026-02-14', presentes: 0, elegiveis: 1, frequencia: 0 });
  assert.deepEqual(result.giras.at(-1), { data: '2026-10-14', presentes: 1, elegiveis: 2, frequencia: 50 });
  assert.equal(result.media, 58);
  assert.equal(historicoFrequencia([], pessoas, { ...atual, entidade: '' }), null);
});

test('curimba: entra na limpeza, mas não na presença', async () => {
  const { textoResumo, dadosResumo } = await import('../shared/resumoGira.js');
  const { limpezaDaGira } = await import('../shared/regras.js');
  const pessoas = [
    { id: 'a', nome: 'Ana', funcao: 'medium', limpeza: 3 }, { id: 'b', nome: 'Bia', funcao: 'cambone' },
    { id: 'c', nome: 'Caio', funcao: 'curimba', limpeza: 3 }, { id: 'd', nome: 'Duda', funcao: 'curimba', limpeza: 2 },
  ];
  const ant = { data: '2026-05-06', entidade: 'Exu', limpeza: 2, presenca: { d: 'f' } };
  const g = { data: '2026-05-13', entidade: 'Caboclo', limpeza: 3, presenca: { c: 'a' } };
  const d = dadosResumo(pessoas, g);
  assert.equal(d.presentes.length + d.ausentes.length + d.faltas.length + d.licenca.length, 2, 'curimba não conta');
  assert.equal(d.pct.presenca, 100);
  const L = limpezaDaGira(pessoas, g, [ant]);
  assert.deepEqual(L.membros.map((p) => p.nome), ['Ana', 'Caio'], 'curimba faz parte da turma');
  assert.deepEqual(L.ajudantes, [], 'curimba não tem falta, então não vira ajudante');
  assert.match(textoResumo(pessoas, g, 'Terreiro', [ant]), /🥁 Caio - Curimba/);
});

test('prévia da gira para o WhatsApp: cabeçalho, turma, ajudantes e licença, um nome por linha', async () => {
  const { textoLimpeza } = await import('../shared/resumoGira.js');
  const P = (nome, limpeza, extra = {}) => ({ id: nome, nome, funcao: 'cambone', limpeza, linhas: [], licencas: [], ...extra });
  const pessoas = [P('Ana T8', 3), P('Bruno T7', 3), P('Carla T6', 3, { licencas: [{ inicio: '2026-10-01', fim: '2026-12-01' }] }), P('Diego T5', 2), P('Eva T8', 2), P('Sara', null, { funcao: 'senha' }), P('Tita', null, { funcao: 'senha' })];
  const anterior = { data: '2026-10-24', limpeza: 2, entidade: 'Caboclo', presenca: { 'Diego T5': 'f' }, papeis: {}, pendentePadrao: false, encerrada: true };
  const g = { data: '2026-10-31', limpeza: 3, entidade: 'Caboclo', orixa: 'Oxóssi', presenca: { Tita: 'a' }, papeis: {}, pendentePadrao: true };
  const t = textoLimpeza(pessoas, g, [anterior, g]).split('\n');
  assert.deepEqual(t.slice(0, 10), ['*Bom dia corrente* ✨', '_Boa semana para nós_', '', '🕯️ *Gira:* Caboclo', '👑 *Orixá:* Oxóssi', '🗓️ *Data:* 31/10/2026', '🔑 *Senha:* Sara', '', '━━━━━━━━━━━━━━━', '🧹 *Turma da limpeza: 3*']);
  assert.deepEqual(t.filter((l) => l.startsWith('▫️')), ['▫️ Ana T8', '▫️ Bruno T7', '▫️ Diego T5', '▫️ Carla T6']);
  assert.ok(t.some((l) => l.includes('Da Turma 2, faltaram na gira de 24/10')));
  assert.equal(t.at(-1), 'Contamos com vocês. Axé! 🙏');
  // Sem senha presente e sem orixá, as linhas somem.
  const sem = textoLimpeza(pessoas.filter((p) => p.funcao !== 'senha'), { ...g, orixa: '' }, [anterior, g]).split('\n');
  assert.deepEqual(sem.slice(3, 7), ['🕯️ *Gira:* Caboclo', '🗓️ *Data:* 31/10/2026', '', '━━━━━━━━━━━━━━━']);
  assert.equal(textoLimpeza(pessoas, { ...g, limpeza: null }, []), '', 'sem turma, sem mensagem');
});
