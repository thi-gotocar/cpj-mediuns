// Marca d'água do e-book (api/_lib/ebookPdf.js) num PDF mínimo montado aqui: o PDF real não vai no repositório (público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcarPdf, paginasPdf } from '../api/_lib/ebookPdf.js';
import { textosMarca } from '../shared/ebook.js';

function pdfMinimo() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Count 2/Kids[3 0 R 5 0 R]/MediaBox[0 0 420 595]/Resources<</Font<</F1 6 0 R>>>>>>',
    '<</Type/Page/Parent 2 0 R/Contents 4 0 R>>',
    '<</Length 34>>\nstream\nBT /F1 12 Tf 40 500 Td (Ola) Tj ET\nendstream',
    '<</Type/Page/Parent 2 0 R/Contents[4 0 R]/Resources 7 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    '<</Font<</F1 6 0 R>>>>',
  ];
  let s = '%PDF-1.7\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  s += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

test('e-book: a marca d\'água entra em todas as páginas, com acento, sem mexer no original', () => {
  const orig = pdfMinimo();
  const t = textosMarca({ nome: 'José (Zé) da Silva', email: 'ze@exemplo.com', id: '3f2a9c1b-1111-4222-8333-444455556666', data: '26/11/2026' });
  const out = marcarPdf(orig, { ...t, info: { Subject: t.rodape } });
  assert.ok(out.subarray(0, orig.length).equals(orig), 'o original fica intacto (atualização incremental)');
  const s = out.toString('latin1');
  assert.equal(paginasPdf(out), 2);
  assert.equal((s.match(/\/CPJwmF/g) || []).length >= 4, true, 'fonte nos recursos das 2 páginas e no conteúdo');
  assert.match(s, /\(Jos\xe9 \\\(Z\xe9\\\) da Silva \xb7 ze@exemplo\.com\) Tj/, 'texto em WinAnsi, parênteses escapados');
  assert.match(s, /compra 3F2A9C1B/);
  // As duas páginas reescritas: a de recursos herdados e a de recursos indiretos ganham a fonte e a transparência.
  for (const n of [3, 5]) {
    const m = s.slice(orig.length).match(new RegExp(`\\n${n} 0 obj\\n(<<.*>>)\\nendobj`));
    assert.ok(m, `página ${n} reescrita`);
    assert.match(m[1], /\/Font\s*<<\/F1 6 0 R \/CPJwmF \d+ 0 R>>/);
    assert.match(m[1], /\/ExtGState\s*<<\/CPJwmA \d+ 0 R \/CPJwmB \d+ 0 R>>/);
    assert.match(m[1], /\/Contents\s*\[\d+ 0 R 4 0 R \d+ 0 R\]/);
  }
  assert.match(s.slice(orig.length), /\/Prev \d+/);
});

test('e-book: recusa o que não é PDF ou está protegido', () => {
  assert.throws(() => marcarPdf(Buffer.from('oi'), { marca: 'x', rodape: 'y' }), /não é um PDF/);
  const prot = Buffer.from(pdfMinimo().toString('latin1').replace('/Root 1 0 R>>', '/Root 1 0 R/Encrypt 9 0 R>>'), 'latin1');
  assert.throws(() => marcarPdf(prot, { marca: 'x', rodape: 'y' }), /senha/);
});
