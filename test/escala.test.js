// Histórico → Cadastrar escala: leitura do texto colado (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerEscala, lerDataEscala, nomesDaEscala, montarEscala } from '../shared/escalaTexto.js';

const TEXTO = `Aqui estão as informações extraídas da escala de atendimentos:
Informações Gerais
 * Orixá / Gira do dia: Exus Mirins
 * Data: 28/out
 * Senha: BETE
Média de Passe e Médium
 * Elaine T5: Elisabeth T6
(Obs.: Os demais médiums da lista não possuem indicação de Médium de Passe preenchida no documento).
Quem Cambonou Quem (Escala Principal)
 * Mãe Vê: Fernanda T8
 * Cris: ? / ?
 * Elaine T5: Paulinho T9 e Viviane T8
 * Gabi T7: X / X (Não possui cambone)
 * Michelle: não atende
 * Yara T7: João Paulo T8 e Daniela da Silva
Atendimentos Extras & Cambones
 * Matheus Henrique T3: não atende
 * Bruna Tiba T6: Matheus Henrique T3
Suporte
 * Gisele T8
 * Cris`;

test('escala: lê data, gira, senha, passes, cambones, extras e suporte', () => {
  const r = lerEscala(TEXTO, '2026-11-02');
  assert.equal(r.data, '2026-10-28');
  assert.equal(r.semAno, true);
  assert.equal(r.gira, 'Exus Mirins');
  assert.equal(r.senha, 'BETE');
  assert.deepEqual(r.passes, [{ medium: 'Elaine T5', passe: 'Elisabeth T6' }]);
  const c = Object.fromEntries(r.cambones.map((x) => [x.nome, x]));
  assert.deepEqual(c['Elaine T5'].cambones, ['Paulinho T9', 'Viviane T8']);
  assert.deepEqual(c['Yara T7'].cambones, ['João Paulo T8', 'Daniela da Silva'], '"da Silva" não separa no " e "');
  assert.equal(c.Cris.desconhecidos, 2);
  assert.deepEqual(c['Gabi T7'].cambones, []);
  assert.equal(c.Michelle.naoAtende, true);
  assert.equal(r.extras.length, 2);
  assert.deepEqual(r.suporte, ['Gisele T8', 'Cris']);
  assert.ok(nomesDaEscala(r).includes('BETE'));
});

test('escala: data sem ano vai para o ano anterior se ainda não chegou', () => {
  assert.deepEqual(lerDataEscala('28/out', '2026-11-02'), { data: '2026-10-28', semAno: true });
  assert.deepEqual(lerDataEscala('15/dez', '2026-11-02'), { data: '2025-12-15', semAno: true });
  assert.deepEqual(lerDataEscala('28/10/2025', '2026-11-02'), { data: '2025-10-28', semAno: false });
  assert.equal(lerDataEscala('31/fev', '2026-11-02'), null);
});

test('escala: monta duplas e função do dia', () => {
  const r = lerEscala(TEXTO, '2026-11-02');
  const fn = { 'Matheus Henrique T3': 'extra', 'Bruna Tiba T6': 'extra', 'Elisabeth T6': 'passe', BETE: 'cambone', Michelle: 'medium', Cris: 'medium', 'Gisele T8': 'cambone' };
  const ps = nomesDaEscala(r).map((nome) => ({ id: 'id-' + nome, nome, funcao: fn[nome] || (/T[89]$/.test(nome) || nome === 'Daniela da Silva' ? 'cambone' : 'medium') }));
  const idDe = (n) => (n === 'Viviane T8' ? '' : 'id-' + n);   // um nome ignorado na conferência
  const m = montarEscala(r, idDe, { 'Cris#0': 'id-Gisele T8' }, ps);
  const par = (a, b) => m.pares.some((d) => d.m === 'id-' + a && d.c === 'id-' + b);
  assert.ok(par('Elaine T5', 'Paulinho T9') && !m.pares.some((d) => d.c === ''), 'ignorado não vira dupla');
  assert.ok(par('Cris', 'Gisele T8'), 'o "?" escolhido vira dupla');
  assert.ok(par('Bruna Tiba T6', 'Matheus Henrique T3'));
  assert.deepEqual(m.passes, [{ m: 'id-Elaine T5', c: 'id-Elisabeth T6' }]);
  assert.equal(m.papeis['id-Michelle'], 'na');
  assert.equal(m.papeis['id-Matheus Henrique T3'], 'na', 'extra que não atende e cambona');
  assert.equal(m.papeis['id-Bruna Tiba T6'], 'cad', 'extra que atendeu na própria função');
  assert.equal(m.papeis['id-Cris'], 'sup');
  assert.equal(m.papeis['id-BETE'], 'sen', 'cambone na senha');
  assert.ok(m.presentes.includes('id-Gabi T7') && !m.presentes.includes('id-Viviane T8'));
});
