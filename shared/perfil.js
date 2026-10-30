// Perfil espiritual de cada pessoa da corrente (aba Perfil): orixás, guias e outros guias.
//
//   {
//     orixas: { frente: { nome, oferenda }, ancestral: {...}, adjunto: {...} },
//     guias:  { chefe: { linha, oferenda }, frente: { linha, oferenda } },
//     outros: { 'preto-velho': 'Pai Joaquim', ... }   // nome do guia em cada linha
//   }

import { ORIXAS, LINHAS } from './regras.js';

export const POSICOES_ORIXA = [['frente', 'Orixá de frente'], ['ancestral', 'Orixá ancestral'], ['adjunto', 'Orixá adjunto']];
export const POSICOES_GUIA = [['chefe', 'Guia chefe'], ['frente', 'Guia de frente']];
// Guias: as linhas de trabalho (sem o Encontro das Linhas), em ordem alfabética.
export const GUIAS = LINHAS.flatMap((g) => g.itens).filter(([k]) => k !== 'mista')
  .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
const GUIA_KEYS = GUIAS.map(([k]) => k);
export const NOME_GUIA_MAX = 60;

const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Limpa o que veio da tela (ou do banco): só campos conhecidos e valores válidos.
export function normalizarPerfil(p) {
  const o = p && typeof p === 'object' ? p : {};
  const orixas = {};
  for (const [k] of POSICOES_ORIXA) {
    const x = (o.orixas || {})[k] || {};
    const nome = ORIXAS.includes(x.nome) ? x.nome : '';
    orixas[k] = { nome, oferenda: !!nome && !!x.oferenda };
  }
  const guias = {};
  for (const [k] of POSICOES_GUIA) {
    const x = (o.guias || {})[k] || {};
    const linha = GUIA_KEYS.includes(x.linha) ? x.linha : '';
    guias[k] = { linha, oferenda: !!linha && !!x.oferenda };
  }
  const outros = {};
  for (const k of GUIA_KEYS) {
    const n = txt((o.outros || {})[k], NOME_GUIA_MAX);
    if (n) outros[k] = n;
  }
  return { orixas, guias, outros };
}
