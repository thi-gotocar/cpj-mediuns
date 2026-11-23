// Gerador de QR (shared/qr.js): conferido contra valores publicados da norma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correcao, bitsFormato, qr, qrSvg } from '../shared/qr.js';

test('Reed-Solomon: o exemplo "HELLO WORLD" 1-M dá a correção publicada', () => {
  const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(correcao(dados, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('bits de formato iguais à tabela da norma', () => {
  // nível M = 00, nível L = 01
  assert.equal(bitsFormato(0b00, 0).toString(2).padStart(15, '0'), '101010000010010');
  assert.equal(bitsFormato(0b01, 0).toString(2).padStart(15, '0'), '111011111000100');
  assert.equal(bitsFormato(0b00, 5).toString(2).padStart(15, '0'), '100000011001110');
});

test('versão pelo tamanho do texto e os localizadores nos três cantos', () => {
  const q = qr('https://cpj-mediuns.vercel.app/fila');
  assert.equal(q.versao, 3);   // 35 bytes: a versão 3-M leva até 42
  assert.equal(q.tamanho, 29);
  for (const [x, y] of [[0, 0], [q.tamanho - 7, 0], [0, q.tamanho - 7]]) {
    for (let i = 0; i < 7; i++) {
      assert.equal(q.escuro(x + i, y), true);
      assert.equal(q.escuro(x, y + i), true);
    }
    assert.equal(q.escuro(x + 1, y + 1), false);
    assert.equal(q.escuro(x + 3, y + 3), true);
  }
  assert.equal(q.escuro(8, q.tamanho - 8), true, 'módulo escuro fixo');
  assert.equal(qr('x'.repeat(200)).versao, 10);
  assert.throws(() => qr('x'.repeat(300)));
  assert.match(qrSvg('teste'), /^<svg[^>]+viewBox="0 0 29 29"/);
});
