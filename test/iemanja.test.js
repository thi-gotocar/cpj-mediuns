import test from 'node:test';
import assert from 'node:assert/strict';
import { sortearIemanja, pctItens, nomeGrupoValido, listasDoSorteio } from '../shared/iemanja.js';
import { abasOcultas, temAbaPublica } from '../shared/oferendas.js';

const NOMES = ['Iemanjá', 'Oxum', 'Ogum', 'Caboclo', 'Exu'];
const grupos = (fixos = 0) => NOMES.map((nome, i) => ({ id: 'g' + i, nome, fixos }));
const perfil = (frente = '', adjunto = '', ancestral = '', chefe = '', gFrente = '') => ({
  orixas: { frente: { nome: frente }, adjunto: { nome: adjunto }, ancestral: { nome: ancestral } },
  guias: { chefe: { linha: chefe }, frente: { linha: gFrente } },
});
const P = (n, p) => ({ chave: 'p:' + n, nome: 'P' + n, perfil: p });
const gira = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const onde = (r, chave) => Object.keys(r).find((g) => r[g].some((p) => p.chave === chave));

test('iemanjá: cada um vai para o orixá de frente, depois adjunto, ancestral e guias', () => {
  const r = sortearIemanja({ grupos: grupos(), turmas: [], aleatorio: gira(7), corrente: [
    P(1, perfil('Oxum')), P(2, perfil('Xangô', 'Ogum')), P(3, perfil('Xangô', 'Nanã', 'Iemanjá')),
    P(4, perfil('', '', '', 'caboclo')), P(5, perfil('', '', '', 'malandro', 'exu')),
  ] });
  assert.equal(onde(r, 'p:1'), 'g1');
  assert.equal(onde(r, 'p:2'), 'g2');
  assert.equal(onde(r, 'p:3'), 'g0');
  assert.equal(onde(r, 'p:4'), 'g3');
  assert.equal(onde(r, 'p:5'), 'g4');
});

test('iemanjá: com muita gente no mesmo orixá, os grupos continuam equilibrados e ninguém se perde', () => {
  for (let seed = 1; seed < 40; seed++) {
    const corrente = Array.from({ length: 23 }, (_, i) => P(i, perfil('Oxum')));
    const turma = (t, n) => Array.from({ length: n }, (_, i) => ({ chave: `a:${t}${i}`, nome: `A${t}${i}` }));
    const r = sortearIemanja({ grupos: grupos(), corrente, turmas: [turma(9, 8), turma(10, 7)], aleatorio: gira(seed) });
    const tamanhos = Object.values(r).map((l) => l.length);
    assert.ok(Math.max(...tamanhos) - Math.min(...tamanhos) <= 1, tamanhos.join());
    assert.equal(new Set(Object.values(r).flat().map((p) => p.chave)).size, 38);
  }
});

test('iemanjá: quem já está fixo conta no tamanho do grupo', () => {
  const r = sortearIemanja({ grupos: NOMES.map((nome, i) => ({ id: 'g' + i, nome, fixos: i === 0 ? 3 : 0 })), corrente: [], aleatorio: gira(3),
    turmas: [Array.from({ length: 7 }, (_, i) => ({ chave: 'a:' + i, nome: 'A' + i }))] });
  assert.equal(r.g0.length, 0, 'já tem mais que os outros');
  assert.deepEqual([r.g1.length, r.g2.length, r.g3.length, r.g4.length].sort(), [1, 2, 2, 2]);
});

test('iemanjá: listas do sorteio partem de curimba, Turma 09 e Turma 10 e respeitam a escolha salva', () => {
  const turmas = [{ id: 't9', nome: 'Turma 09' }, { id: 't10', nome: 'turma 10' }, { id: 't11', nome: 'Turma 11' }];
  assert.deepEqual(listasDoSorteio(null, turmas), ['curimba', 't9', 't10']);
  assert.deepEqual(listasDoSorteio(['t11', 'apagada'], turmas), ['t11']);
  assert.deepEqual(listasDoSorteio([], turmas), []);
});

test('sub-abas: a Iemanjá não conta como oculta nem como pública', () => {
  const iem = { id: 'i', iemanja: true, visivel: false };
  const oculta = { id: 'o', iemanja: false, visivel: false };
  assert.deepEqual([...abasOcultas([iem, oculta])], ['o']);
  assert.equal(temAbaPublica([iem, oculta]), false);
  assert.equal(temAbaPublica([{ id: 'v', iemanja: false, visivel: true }, oculta]), true);
  assert.equal(temAbaPublica([{ ...iem, visivel: true }]), false);
});

test('iemanjá: percentual de itens com responsável e nomes aceitos', () => {
  assert.equal(pctItens([]), 0);
  assert.equal(pctItens([{ quantidade: 4, doacoes: [{ quantidade: 1 }] }, { quantidade: 4, doacoes: [{ quantidade: 9 }] }]), 62);
  assert.ok(nomeGrupoValido('Iemanjá') && nomeGrupoValido('Caboclo') && nomeGrupoValido(''));
  assert.ok(!nomeGrupoValido('Caboclo Pena Branca'));
});
