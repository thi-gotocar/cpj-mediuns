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
  assert.deepEqual(r.ausentes, ['Alessandra', 'Ana', 'Bruna Tiba', 'Marlucy', 'Nathy']);
  assert.deepEqual(r.licenca, []);
  assert.deepEqual(lerResumo('EM LICENÇA\n📋 Rita T2\n').licenca, ['Rita']);
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
