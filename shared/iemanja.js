// Oferenda de Iemanjá: os nomes dos 5 grupos, o percentual de itens assumidos e o sorteio.

import { ORIXAS, linhaDaEntidade } from './regras.js';
import { GUIAS } from './perfil.js';

export const QTD_GRUPOS_IEMANJA = 5;
export const NOMES_ENTIDADES = GUIAS.map(([, nome]) => nome);
export const nomeGrupoValido = (nome) => nome === '' || ORIXAS.includes(nome) || NOMES_ENTIDADES.includes(nome);

// Quanto do que foi pedido já tem responsável (0 a 100); o que passa do pedido não conta.
export function pctItens(itens) {
  const total = (itens || []).reduce((s, i) => s + i.quantidade, 0);
  if (!total) return 0;
  const assumido = itens.reduce((s, i) => s + Math.min(i.quantidade, (i.doacoes || []).reduce((a, d) => a + d.quantidade, 0)), 0);
  return Math.floor((assumido / total) * 100);
}

const casaOrixa = (nomeGrupo, orixa) => nomeGrupo === orixa;
const casaGuia = (nomeGrupo, linha) => linhaDaEntidade(nomeGrupo) === linha;
// Ordem de preferência do sorteio da corrente.
const PREFERENCIAS = [
  [(p) => p?.orixas?.frente?.nome, casaOrixa],
  [(p) => p?.orixas?.adjunto?.nome, casaOrixa],
  [(p) => p?.orixas?.ancestral?.nome, casaOrixa],
  [(p) => p?.guias?.chefe?.linha, casaGuia],
  [(p) => p?.guias?.frente?.linha, casaGuia],
];

function misturar(lista, aleatorio) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// grupos: [{ id, nome, fixos: quantos já estão no grupo }] · corrente: [{ chave, nome, perfil }] · turmas: [[{ chave, nome }], ...]
// Devolve { idDoGrupo: [pessoas sorteadas] }. Os grupos terminam do mesmo tamanho (diferença de 1), salvo por quem
// o admin já fixou. A corrente vai primeiro, pela afinidade e até o limite de cada grupo; as turmas completam ao acaso.
export function sortearIemanja({ grupos, corrente, turmas, aleatorio = Math.random }) {
  const qtd = Object.fromEntries(grupos.map((g) => [g.id, g.fixos]));
  const sorteados = Object.fromEntries(grupos.map((g) => [g.id, []]));
  const menor = (opcoes) => misturar(opcoes, aleatorio).sort((a, b) => qtd[a.id] - qtd[b.id])[0];
  const pôr = (g, p) => { sorteados[g.id].push({ chave: p.chave, nome: p.nome }); qtd[g.id] += 1; };
  const limite = Math.ceil((corrente.length + grupos.reduce((s, g) => s + g.fixos, 0)) / grupos.length);
  const comVaga = () => grupos.filter((g) => qtd[g.id] < limite);

  let resto = misturar(corrente, aleatorio);
  for (const [valorDe, casa] of PREFERENCIAS) {
    const ficam = [];
    for (const p of resto) {
      const valor = valorDe(p.perfil);
      const opcoes = valor ? comVaga().filter((g) => casa(g.nome, valor)) : [];
      if (opcoes.length) pôr(menor(opcoes), p); else ficam.push(p);
    }
    resto = ficam;
  }
  for (const p of resto) { const vagas = comVaga(); pôr(menor(vagas.length ? vagas : grupos), p); }
  for (const turma of turmas) for (const p of misturar(turma, aleatorio)) pôr(menor(grupos), p);
  return sorteados;
}
