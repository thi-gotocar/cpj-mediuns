// Cálculo da compra de ervas (sem banco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPedidos, textoPedidos, csvPedidos, chavePessoa, totaisPorErva, textoFornecedor, csvFornecedor, textoCobranca, csvCobranca } from '../shared/ervas.js';

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

test('erva sem preço: entra no pedido como "a definir" até o admin fechar o preço', () => {
  const lista = [{ id: 'a', nome: 'Arruda', preco: 5 }, { id: 'c', nome: 'Comigo-ninguém-pode', preco: null }];
  const escolhas = [{ chave: 'n:ana', nome: 'Ana', ervaId: 'a', quantidade: 1 }, { chave: 'n:ana', nome: 'Ana', ervaId: 'c', quantidade: 2 }];
  const r = calcularPedidos(lista, escolhas, 4);
  assert.deepEqual(r.faltamPrecos, ['Comigo-ninguém-pode']);
  assert.equal(r.pessoas[0].semPreco, true);
  assert.equal(r.pessoas[0].subtotal, 500);
  assert.match(textoPedidos(r, 4), /Preço a definir: Comigo-ninguém-pode/);
  assert.match(textoPedidos(r, 4), /Comigo-ninguém-pode x2 · preço a definir/);
  assert.match(csvPedidos(r), /Comigo-ninguém-pode;2;a definir;a definir/);
  // Depois de definir o preço, fecha o valor.
  lista[1].preco = 3;
  const r2 = calcularPedidos(lista, escolhas, 4);
  assert.deepEqual(r2.faltamPrecos, []);
  assert.equal(r2.pessoas[0].total, 500 + 600 + 400);
});

test('pedido ao fornecedor (sem valores) e cobrança por pessoa', () => {
  const lista = [{ id: 'a', nome: 'Arruda', preco: 5 }, { id: 'g', nome: 'Guiné', preco: null }];
  const escolhas = [
    { chave: '1', nome: 'Ana', ervaId: 'a', quantidade: 2 },
    { chave: '2', nome: 'Bia', ervaId: 'a', quantidade: 1 },
    { chave: '2', nome: 'Bia', ervaId: 'g', quantidade: 1 },
  ];
  const r = calcularPedidos(lista, escolhas, 10);
  const forn = textoFornecedor(r, new Date(2026, 10, 1));
  assert.match(forn, /• Arruda: 3/);
  assert.match(forn, /• Guiné: 1/);
  assert.doesNotMatch(forn, /R\$/, 'o pedido ao fornecedor não leva valores');
  assert.equal(csvFornecedor(r), '\uFEFFErva;Quantidade;Pessoas que pediram\r\nArruda;3;2\r\nGuiné;1;1');
  lista[1].preco = 7.5;
  const r2 = calcularPedidos(lista, escolhas, 10);
  const cob = textoCobranca(r2);
  assert.match(cob, /\*Ana\*: R\$\s15,00/);
  assert.match(cob, /\*Bia\*: R\$\s17,50/);
  assert.match(cob, /Total a receber:\* R\$\s32,50/);
  assert.match(csvCobranca(r2), /Bia;Arruda, Guiné;12,50;5,00;17,50/);
});
