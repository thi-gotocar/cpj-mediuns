// Perfil espiritual de cada pessoa da corrente (aba Perfil): orixás, guias e outros guias.
//
//   {
//     orixas: { frente: { nome, oferenda }, ancestral: {...}, adjunto: {...} },
//     guias:  { chefe: { linha, oferenda }, frente: { linha, oferenda } },
//     outros: { 'preto-velho': 'Pai Joaquim', ... },  // nome do guia em cada linha
//     info:   { nome, nascimento: 'AAAA-MM-DD', celular, contatoNome, contatoTelefone }  // telefones só com os números
//   }

import { ORIXAS, LINHAS, CURIMBA } from './regras.js';

export const POSICOES_ORIXA = [['frente', 'Orixá de frente'], ['ancestral', 'Orixá ancestral'], ['adjunto', 'Orixá adjunto']];
export const POSICOES_GUIA = [['chefe', 'Guia chefe'], ['frente', 'Guia de frente']];
// Guias: as linhas de trabalho (sem o Encontro das Linhas), em ordem alfabética.
export const GUIAS = LINHAS.flatMap((g) => g.itens).filter(([k]) => k !== 'mista')
  .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
const GUIA_KEYS = GUIAS.map(([k]) => k);
export const NOME_GUIA_MAX = 60;

// A curimba não cadastra orixás, guias nem guias de atendimento: no Perfil, só as informações pessoais.
export const cadastraEspiritual = (funcao) => funcao !== CURIMBA;
// Perfil que vale para a função: para a curimba, só as informações (o resto fica vazio).
export const perfilDaFuncao = (perfil, funcao) =>
  (cadastraEspiritual(funcao) ? normalizarPerfil(perfil) : normalizarPerfil({ info: normalizarPerfil(perfil).info }));

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

// Estatísticas do cadastro (Histórico): quantas pessoas têm cada guia chefe, guia de frente, orixá de frente e
// orixá de cabeça (frente, ancestral ou adjunto: a pessoa conta uma vez por orixá, mesmo repetido em duas posições).
// Só contagens (sem nomes), para não expor o perfil de cada um. perfis: [{ perfil, funcao }] (perfis_listar);
// a curimba não entra (não cadastra orixás e guias).
// → { total, chefe: [{ nome, qtd }], frente: [...], orixa: [...], cabeca: [...], cabecaPessoas }, do maior para o menor
// (empate: nome). cabecaPessoas: quantas pessoas escolheram algum orixá de cabeça.
export function contagemPerfis(todos) {
  const nomeGuia = Object.fromEntries(GUIAS);
  const perfis = todos.filter((x) => cadastraEspiritual(x.funcao));
  const pfs = perfis.map((x) => normalizarPerfil(x.perfil));
  const contar = (valor) => {
    const m = {};
    pfs.forEach((pf) => new Set([valor(pf)].flat().filter(Boolean)).forEach((v) => { m[v] = (m[v] || 0) + 1; }));
    return Object.entries(m).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, 'pt-BR'));
  };
  const cabeca = (pf) => POSICOES_ORIXA.map(([k]) => pf.orixas[k].nome);
  return {
    total: perfis.length,
    chefe: contar((pf) => nomeGuia[pf.guias.chefe.linha]),
    frente: contar((pf) => nomeGuia[pf.guias.frente.linha]),
    orixa: contar((pf) => pf.orixas.frente.nome),
    cabeca: contar(cabeca),
    cabecaPessoas: pfs.filter((pf) => cabeca(pf).some(Boolean)).length,
  };
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

// ---------- Anamnese (aba Perfil) ----------
// O admin do perfil cadastra perguntas livres; o formulário importado também usa data e escolhas.
export const ANAMNESE_TIPOS = [['texto', 'Texto'], ['simnao', 'Sim / Não']];
export const ANAMNESE_PERGUNTA_MAX = 500;
export const ANAMNESE_TEXTO_MAX = 2000;
export const ANAMNESE_SIMNAO = [['sim', 'Sim'], ['nao', 'Não']];
export const ANAMNESE_OPCOES_MAX = 40;
export const ANAMNESE_OPCAO_MAX = 180;
export const ANAMNESE_TIPO_LABEL = { texto: 'Texto', data: 'Data', simnao: 'Sim / Não', opcao: 'Escolha única', multipla: 'Múltipla escolha' };

// Resposta de texto: espaços arrumados, até 20 linhas e ANAMNESE_TEXTO_MAX letras (null = inválida).
export function limparRespostaTexto(v) {
  const linhas = String(v ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const t = linhas.join('\n');
  return linhas.length > 20 || t.length > ANAMNESE_TEXTO_MAX ? null : t;
}

export function limparRespostaData(v) {
  const data = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const d = new Date(`${data}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== data ? null : data;
}

export function valorAnamnese(q, v) {
  if (v == null || v === '') return '';
  if (q.tipo === 'simnao') return ({ sim: 'Sim', nao: 'Não' }[v] || '');
  if (q.tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  if (q.tipo === 'multipla') {
    try { return (Array.isArray(v) ? v : JSON.parse(v)).join(', '); } catch { return ''; }
  }
  return String(v);
}

// Preenchida: há perguntas obrigatórias e todas têm resposta.
export const anamnesePreenchida = (perguntas, respostas) =>
  perguntas.some((q) => q.obrigatoria !== false)
  && perguntas.filter((q) => q.obrigatoria !== false).every((q) => {
    const v = (respostas || {})[q.id];
    if (q.tipo === 'multipla') {
      try {
        const xs = Array.isArray(v) ? v : JSON.parse(v);
        return Array.isArray(xs) && xs.length > 0;
      } catch { return false; }
    }
    return String(v ?? '').trim() !== '';
  });

// Respostas de cada pessoa: { pessoaId: { perguntaId: resposta } }.
export function respostasPorPessoa(lista) {
  const r = {};
  (lista || []).forEach((x) => { (r[x.pessoaId] ||= {})[x.perguntaId] = x.resposta; });
  return r;
}

// Arquivo para compartilhar (texto): todas as respostas, pessoa por pessoa (quem não respondeu nada fica de fora).
export function textoAnamnese(perguntas, pessoas, respostas, hoje) {
  const [y, m, d] = String(hoje).split('-');
  const com = pessoas.filter((p) => Object.keys(respostas[p.id] || {}).length);
  const ok = pessoas.filter((p) => anamnesePreenchida(perguntas, respostas[p.id])).length;
  const L = ['ANAMNESE · Casa do Pai João', `Gerado em ${d}/${m}/${y}`, `Preenchidas: ${ok} de ${pessoas.length}`, ''];
  com.forEach((p) => {
    L.push(`== ${p.nome} ==`);
    perguntas.forEach((q, i) => L.push(`${i + 1}. ${q.texto}`, `   ${valorAnamnese(q, (respostas[p.id] || {})[q.id]) || '—'}`));
    L.push('');
  });
  if (!com.length) L.push('Ninguém respondeu ainda.');
  return L.join('\n').trimEnd() + '\n';
}
