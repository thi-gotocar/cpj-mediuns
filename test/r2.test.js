// Assinatura dos pedidos ao Cloudflare R2 (API do S3), conferida com os exemplos oficiais da AWS (sem rede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlAssinada, cabecalhosAssinados } from '../api/_lib/r2.js';

const AWS = { origem: 'https://examplebucket.s3.amazonaws.com', caminho: '/test.txt', chaveId: 'AKIAIOSFODNN7EXAMPLE',
  segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', regiao: 'us-east-1', agora: new Date('2013-05-24T00:00:00Z') };

test('R2: link assinado (exemplo da AWS)', () => {
  assert.ok(urlAssinada({ ...AWS, expira: 86400 }).endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
});

test('R2: cabeçalhos assinados de GET e PUT (exemplos da AWS)', () => {
  const g = cabecalhosAssinados({ ...AWS, metodo: 'GET', extras: { range: 'bytes=0-9' } });
  assert.ok(g.authorization.endsWith('Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'));
  const p = cabecalhosAssinados({ ...AWS, metodo: 'PUT', caminho: '/test%24file.text', corpo: 'Welcome to Amazon S3.',
    extras: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' } });
  assert.ok(p.authorization.endsWith('Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd'));
});
