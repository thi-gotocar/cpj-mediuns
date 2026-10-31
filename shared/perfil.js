// Perfil espiritual de cada pessoa da corrente (aba Perfil): orixás, guias e outros guias.
//
//   {
//     orixas: { frente: { nome, oferenda }, ancestral: {...}, adjunto: {...} },
//     guias:  { chefe: { linha, oferenda }, frente: { linha, oferenda } },
//     outros: { 'preto-velho': 'Pai Joaquim', ... },  // nome do guia em cada linha
//     info:   { nome, nascimento: 'AAAA-MM-DD', celular, contatoNome, contatoTelefone }  // telefones só com os números
//   }

import { ORIXAS, LINHAS } from './regras.js';

export const POSICOES_ORIXA = [['frente', 'Orixá de frente'], ['ancestral', 'Orixá ancestral'], ['adjunto', 'Orixá adjunto']];
export const POSICOES_GUIA = [['chefe', 'Guia chefe'], ['frente', 'Guia de frente']];
// Guias: as linhas de trabalho (sem o Encontro das Linhas), em ordem alfabética.
export const GUIAS = LINHAS.flatMap((g) => g.itens).filter(([k]) => k !== 'mista')
  .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
const GUIA_KEYS = GUIAS.map(([k]) => k);
export const NOME_GUIA_MAX = 60;

// A pessoa já respondeu: escolheu algum orixá ou guia, ou escreveu algum nome.
export const respondeu = (p) => !!p && (Object.values(p.orixas || {}).some((x) => x.nome)
  || Object.values(p.guias || {}).some((x) => x.linha) || Object.keys(p.outros || {}).length > 0);

// "31/10/1990" → '1990-10-31' (ou '' se não for uma data de nascimento válida).
export function lerNascimento(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x = new Date(Date.UTC(a, mes - 1, d));
  if (x.getUTCFullYear() !== a || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d || a < 1900) return '';
  const iso = x.toISOString().slice(0, 10);
  return iso <= new Date().toISOString().slice(0, 10) ? iso : '';
}
export const nascimentoBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
// Telefone: só os números (DDD + número, 10 ou 11 dígitos).
export const soNumeros = (v) => String(v || '').replace(/\D/g, '').slice(0, 11);
export function telefoneBR(n) {
  const d = soNumeros(n);
  if (d.length <= 2) return d ? `(${d}` : '';
  const resto = d.slice(2);
  const corte = d.length === 11 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${resto.length > corte ? `${resto.slice(0, corte)}-${resto.slice(corte)}` : resto}`;
}

// Blocos de afinidade com as entidades na aba Perfil, por função:
// Extra → Atendimento extra · Passe → Passe e Atendimento extra · Cambone → Passe.
// "campo": onde fica guardado (linhas = as da própria função, as que valem no sorteio).
export function blocosAfinidade(funcao) {
  if (funcao === 'extra') return [{ tipo: 'extra', campo: 'linhas' }];
  if (funcao === 'passe') return [{ tipo: 'passe', campo: 'linhas' }, { tipo: 'extra', campo: 'extra' }];
  if (funcao === 'cambone') return [{ tipo: 'passe', campo: 'passe' }];
  return [];
}

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
  const i = o.info && typeof o.info === 'object' ? o.info : {};
  const tel = (v) => { const d = soNumeros(v); return d.length >= 10 ? d : ''; };
  const info = {
    nome: txt(i.nome, 80),
    nascimento: /^\d{4}-\d{2}-\d{2}$/.test(i.nascimento || '') ? lerNascimento(nascimentoBR(i.nascimento)) : '',
    celular: tel(i.celular),
    contatoNome: txt(i.contatoNome, 80),
    contatoTelefone: tel(i.contatoTelefone),
  };
  return { orixas, guias, outros, info };
}
