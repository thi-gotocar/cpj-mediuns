// Cálculo da compra de ervas (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPedidos, textoPedidos, csvPedidos, chavePessoa, totaisPorErva } from '../shared/ervas.js';

const ervas = [{ id: 'a', nome: 'Arruda', preco: 5 }, { id: 'g', nome: 'Guiné', preco: 7.5 }, { id: 'r', nome: 'Alecrim', preco: 3.33 }];

test('frete dividido por quem escolheu, fechando o valor exato', () => {
  const escolhas = [
    { chave: 'n:ana', nome: 'Ana', ervaId: 'a', quantidade: 2 },
    { chave: 'n:ana', nome: 'Ana', ervaId: 'g', quantidade: 1 },
    { chave: 'u:1', nome: 'Bruno', ervaId: 'r', quantidade: 3 },
    { chave: 'n:caio', nome: 'Caio', ervaId: 'a', quantidade: 1 },
  ];
  const r = calcularPedidos(ervas, escolhas, 10);  // R$ 10,00 / 3 pessoas
  assert.deepEqual(r.pessoas.map((p) => p.nome), ['Ana', 'Bruno', 'Caio']);
  assert.deepEqual(r.pessoas.map((p) => p.frete), [334, 333, 333]);
  assert.equal(r.totalFrete, 1000);
  assert.equal(r.pessoas[0].subtotal, 1750);
  assert.equal(r.pessoas[1].subtotal, 999);
  assert.equal(r.totalGeral, 1750 + 999 + 500 + 1000);
  assert.deepEqual(totaisPorErva(r).map((t) => [t.nome, t.quantidade]), [['Alecrim', 3], ['Arruda', 3], ['Guiné', 1]]);
});

test('sem escolhas não há frete; erva excluída é ignorada', () => {
  assert.equal(calcularPedidos(ervas, [], 30).totalGeral, 0);
  const r = calcularPedidos(ervas, [{ chave: 'n:x', nome: 'X', ervaId: 'sumiu', quantidade: 1 }], 30);
  assert.equal(r.pessoas.length, 0);
});

test('chave da pessoa e exportações', () => {
  assert.equal(chavePessoa({ id: null, nome: '  Ána  Maria ' }), 'n:ana maria');
  assert.equal(chavePessoa({ id: 'abc', nome: 'Qualquer' }), 'u:abc');
  const r = calcularPedidos(ervas, [{ chave: 'n:ana', nome: 'Ana; "Lu"', ervaId: 'g', quantidade: 2 }], 5);
  const txt = textoPedidos(r, 5, new Date(2026, 9, 31));
  assert.match(txt, /\*ERVAS · 31\/10\/2026\*/);
  assert.match(txt, /Guiné x2/);
  assert.match(txt, /\*Total:\* R\$\s20,00/);
  const csv = csvPedidos(r);
  assert.ok(csv.startsWith('﻿Nome;Erva'));
  assert.match(csv, /"Ana; ""Lu""";Guiné;2;7,50;15,00;5,00;20,00/);
});
