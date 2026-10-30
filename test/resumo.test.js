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
