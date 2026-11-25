// Testes das contas do Diário (sem banco): os painéis de Seu acompanhamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acompanhamento, energiaDoDia, MIN_COMPARAR } from '../shared/diario.js';

const giraEm = new Set(['2026-11-01', '2026-11-08', '2026-11-15']);
const opcoes = (ate = '2026-11-20') => ({
  desde: '2026-10-01', ate,
  ehGira: (data, d) => (typeof d.gira === 'boolean' ? d.gira : giraEm.has(data)),
  linhaDe: (data, d) => d.linha || (data === '2026-11-01' ? 'caboclo' : ''),
});

test('termômetro: delta por gira, da mais recente, e a média por linha', () => {
  const dias = [
    { data: '2026-11-01', dados: { antes: { energia: 2 }, depois: { energia: 5 } } },                        // caboclo pela agenda
    { data: '2026-11-08', dados: { linha: 'exu', antes: { energia: 4 }, depois: { energia: 3 } } },
    { data: '2026-11-15', dados: { linha: 'caboclo', antes: { energia: 3 }, depois: { energia: 4 } } },
    { data: '2026-11-16', dados: { antes: { energia: 1 }, depois: { energia: 5 } } },                        // dia comum: não conta
    { data: '2026-11-17', dados: { gira: true, antes: { energia: 3 } } },                                   // sem a saída: não conta
    { data: '2026-09-20', dados: { gira: true, antes: { energia: 1 }, depois: { energia: 5 } } },           // fora do período
  ];
  const r = acompanhamento(dias, opcoes());
  assert.deepEqual(r.giras.map((g) => [g.data, g.delta]), [['2026-11-15', 1], ['2026-11-08', -1], ['2026-11-01', 3]]);
  assert.deepEqual(r.axe.porLinha, [{ linha: 'caboclo', n: 2, media: 2 }, { linha: 'exu', n: 1, media: -1 }]);
  assert.equal(r.axe.media, 1);
});

test('cuidados × energia: só compara com dias suficientes dos dois lados', () => {
  assert.equal(energiaDoDia({ antes: { energia: 2 }, depois: { energia: 5 } }), 3.5);
  assert.equal(energiaDoDia({}), null);
  const dias = [];
  for (let i = 1; i <= MIN_COMPARAR * 2; i++) {
    const data = `2026-10-${String(i).padStart(2, '0')}`;
    const ativo = i <= MIN_COMPARAR;
    dias.push({ data, dados: { gira: false, habitos: ativo ? { atividade: true } : {}, antes: { energia: ativo ? 5 : 3 } } });
  }
  const r = acompanhamento(dias, opcoes());
  const at = r.cuidados.find((c) => c.k === 'atividade');
  assert.deepEqual([at.com, at.sem, at.nCom, at.nSem, at.ok], [5, 3, MIN_COMPARAR, MIN_COMPARAR, true]);
  const ban = r.cuidados.find((c) => c.k === 'banho');
  assert.deepEqual([ban.nCom, ban.ok], [0, false], 'sem nenhum dia com banho, não compara');
  const poucos = acompanhamento(dias.slice(0, MIN_COMPARAR + 1), opcoes()).cuidados.find((c) => c.k === 'atividade');
  assert.equal(poucos.ok, false, 'só 1 dia sem atividade');
});

test('emoções: contagem por dia (sem repetir manhã e noite), leve × densa e dias seguidos em vibração densa', () => {
  const dias = [
    { data: '2026-11-16', dados: { antes: { emo: ['paz'] }, depois: { emo: ['paz', 'grato'] } } },
    { data: '2026-11-18', dados: { antes: { emo: ['ansioso'] } } },
    { data: '2026-11-19', dados: { antes: { emo: ['drenado', 'paz'] }, depois: { emo: ['triste'] } } },
    { data: '2026-11-20', dados: { antes: { emo: ['ansioso'] }, depois: { emo: ['ansioso'] } } },
  ];
  const r = acompanhamento(dias, opcoes()).emocoes;
  assert.deepEqual(r.lista.map((x) => [x.k, x.n]), [['paz', 2], ['ansioso', 2], ['grato', 1], ['drenado', 1], ['triste', 1]]);
  assert.deepEqual([r.leve, r.densa, r.total], [3, 4, 7]);
  assert.equal(r.seguidos, 3, '18, 19 e 20 seguidos e densos');
  assert.equal(acompanhamento(dias, opcoes('2026-11-25')).emocoes.seguidos, 0, 'o último registro é antigo: não avisa');
  const comFolga = dias.filter((x) => x.data !== '2026-11-19');
  assert.equal(acompanhamento(comFolga, opcoes()).emocoes.seguidos, 1, 'um dia sem registro quebra a sequência');
});

// ---------- ciclo: escape, situação, histórico, avisos e previsões ----------
import { analiseCiclo, normalizarDia } from '../shared/diario.js';

const diaMais = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const menstruada = (ini, n) => Array.from({ length: n }, (_, i) => ({ data: diaMais(ini, i), dados: { ciclo: { menstruada: true } } }));

test('ciclo: escape e situação passam pela limpeza; menstruada vale mais que escape', () => {
  assert.deepEqual(normalizarDia({ ciclo: { escape: true, sintomas: ['colica', 'inventado'] }, cicloFator: 'gravidez' }),
    { ciclo: { escape: true, sintomas: ['colica'] }, cicloFator: 'gravidez' });
  assert.deepEqual(normalizarDia({ ciclo: { escape: true, menstruada: true, fluxo: 'leve' }, cicloFator: 'outro' }), { ciclo: { menstruada: true, fluxo: 'leve' } });
  assert.deepEqual(normalizarDia({ ciclo: { escape: false } }), {});
});

test('ciclo: histórico, média, variação e as 3 próximas (o escape não conta como início)', () => {
  const dias = [...menstruada('2026-08-01', 5), ...menstruada('2026-08-29', 5), ...menstruada('2026-09-26', 4), ...menstruada('2026-10-24', 5),
    ...menstruada('2026-11-21', 4), { data: '2026-11-05', dados: { ciclo: { escape: true } } }];
  const A = analiseCiclo(dias, '2026-11-24');
  assert.deepEqual(A.ciclos.map((c) => [c.inicio, c.duracao, c.menstruacao]),
    [['2026-11-21', null, 4], ['2026-10-24', 28, 5], ['2026-09-26', 28, 4], ['2026-08-29', 28, 5], ['2026-08-01', 28, 5]]);
  assert.deepEqual([A.media, A.mediaMenstruacao, A.variacao, A.fator, A.atraso], [28, 5, 0, 'nenhum', 0]);
  assert.deepEqual(A.previsoes, [{ inicio: '2026-12-19', fim: '2026-12-23' }, { inicio: '2027-01-16', fim: '2027-01-20' }, { inicio: '2027-02-13', fim: '2027-02-17' }]);
  assert.deepEqual(A.avisos, [], 'um escape só não avisa');
  // Sem registrar a de 21/11: 3 dias de atraso, e as previsões seguem de hoje em diante.
  const B = analiseCiclo(dias.filter((x) => x.data < '2026-11-21'), '2026-11-24');
  assert.equal(B.atraso, 3);
  assert.ok(B.previsoes.every((p) => p.inicio >= '2026-11-24'));
});

test('ciclo: avisos de padrão nos últimos 6 meses, desligados com uma situação marcada', () => {
  const dias = [...menstruada('2026-05-01', 5), ...menstruada('2026-05-21', 11), ...menstruada('2026-06-30', 5), ...menstruada('2026-07-20', 4),
    ...menstruada('2026-08-25', 12), ...menstruada('2026-09-12', 5),
    { data: '2026-06-15', dados: { ciclo: { escape: true } } }, { data: '2026-07-10', dados: { ciclo: { escape: true } } }];
  const A = analiseCiclo(dias, '2026-10-30');
  assert.deepEqual(A.avisos.map((a) => a.k).sort(), ['escape', 'irregular', 'prolongada']);
  assert.match(A.avisos.find((a) => a.k === 'irregular').texto, /variaram 22 dias/);
  // Com anticoncepcional: sem avisos, com previsão; com gravidez: sem avisos e sem previsão.
  const comFator = (f) => analiseCiclo([...dias, { data: '2026-10-01', dados: { cicloFator: f } }], '2026-10-30');
  assert.deepEqual([comFator('anticoncepcional').avisos.length, comFator('anticoncepcional').previsoes.length], [0, 3]);
  assert.deepEqual([comFator('gravidez').fator, comFator('gravidez').avisos.length, comFator('gravidez').previsoes.length], ['gravidez', 0, 0]);
  // Poucas menstruações: só para quem registra há 6 meses ou mais.
  const poucas = [{ data: '2026-01-10', dados: { antes: { humor: 3 } } }, ...menstruada('2026-08-01', 5)];
  assert.deepEqual(analiseCiclo(poucas, '2026-10-30').avisos.map((a) => a.k), ['infrequente']);
  assert.deepEqual(analiseCiclo(poucas.slice(1), '2026-10-30').avisos, []);
});
