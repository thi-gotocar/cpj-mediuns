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
