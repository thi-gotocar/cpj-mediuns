// Aba Diário: o que cada pessoa registra do próprio dia. Dia de gira: como chegou e como saiu, a linha que atendeu, o
// banho e o conselho do guia. Dia comum: como acordou e como encerrou o dia, e o banho sugerido pelo próprio app quando
// o estado é pesado. Usado na tela e na validação do servidor (api/_lib/diario.js).

import { LINHAS } from './regras.js';
import { BANHO_ORIXA, BANHO_GUIA } from './banhos.js';

// Escala de 1 a 5 com rostos: como a pessoa se sente, no geral.
export const HUMOR = [[1, '😣', 'Muito mal'], [2, '😟', 'Mal'], [3, '😐', 'Mais ou menos'], [4, '🙂', 'Bem'], [5, '😄', 'Muito bem']];
// Emoções em dois grupos: [chave, nome, o que é]. A pessoa marca até MAX_EMOCOES.
export const GRUPOS_EMOCOES = [
  { k: 'leve', titulo: 'Vibração leve', sub: 'Abertura, equilíbrio e recarga', itens: [
    ['paz', 'Em paz / Sereno', 'Mente quieta, coração tranquilo'],
    ['grato', 'Grato', 'Vontade de agradecer, reconhecimento'],
    ['fe', 'Com fé / Firme', 'Senso de propósito, sustentação espiritual'],
    ['alegre', 'Alegre / Entusiasmado', 'Energia alta, leveza'],
    ['amor', 'Com amor / Acolhedor', 'Coração aberto para ajudar ou receber'],
    ['inspirado', 'Inspirado / Intuitivo', 'Sensibilidade aguçada, clareza'],
  ] },
  { k: 'densa', titulo: 'Vibração densa', sub: 'Pede acolhimento, descarrego ou firmeza', itens: [
    ['drenado', 'Cansado / Drenado', 'Esgotamento físico, "bateria zerada"'],
    ['ansioso', 'Ansioso / Agitado', 'Mente acelerada, preocupação demais'],
    ['triste', 'Triste / Angustiado', 'Aperto no peito, vontade de chorar, desânimo'],
    ['irritado', 'Irritado / Impaciente', 'Pavio curto, tensão acumulada'],
    ['sobrecarregado', 'Sobrecarregado / Confuso', 'Muitos problemas, cabeça cheia, dispersão'],
    ['medo', 'Com medo / Inseguro', 'Vulnerabilidade, dúvida, receio'],
  ] },
];
export const EMOCOES = GRUPOS_EMOCOES.flatMap((g) => g.itens);
export const MAX_EMOCOES = 3;
// Estados pesados: o Orientador sugere um banho de manutenção.
export const DENSAS = GRUPOS_EMOCOES.find((g) => g.k === 'densa').itens.map(([k]) => k);
// Nomes da primeira versão do Diário que viraram outra opção.
const EMOCAO_ANTIGA = { agitado: 'ansioso', disperso: 'sobrecarregado' };
// Sensação depois da gira: nem sempre a gira traz resultado, então há também as neutras e as difíceis.
export const GRUPOS_SENSACOES = [
  { k: 'boa', titulo: 'Boas', itens: [['leve', 'Leve'], ['renovado', 'Renovado'], ['sonolento', 'Sonolento'], ['eletrizado', 'Eletrizado'], ['emocionado', 'Emocionado']] },
  { k: 'dificil', titulo: 'Neutras ou difíceis', itens: [['igual', 'Sem diferença'], ['pesado', 'Pesado'], ['esgotado', 'Esgotado'], ['agitado', 'Agitado'], ['confuso', 'Confuso']] },
];
export const SENSACOES = GRUPOS_SENSACOES.flatMap((g) => g.itens);
// Ciclo menstrual (opcional: só aparece para quem liga "Registrar meu ciclo" no Diário).
export const FLUXOS = [['leve', 'Leve'], ['medio', 'Médio'], ['forte', 'Forte']];
// Escape: sangramento fora da menstruação (não conta como início de ciclo).
export const ESCAPE = ['escape', 'Escape'];
// Situação do ciclo: gravada no dia em que muda (cicloFator) e vale dali em diante. Com uma delas, os avisos de padrão
// ficam desligados (como no app Saúde do iPhone); em gravidez, amamentação e menopausa, a previsão também.
export const FATORES_CICLO = [['nenhum', 'Nenhuma'], ['anticoncepcional', 'Anticoncepcional'], ['gravidez', 'Gravidez'], ['amamentacao', 'Amamentação'], ['menopausa', 'Menopausa']];
const SEM_PREVISAO = ['gravidez', 'amamentacao', 'menopausa'];
// Sintomas do ciclo em grupos (as chaves de antes continuam; 'sensibilidade' é a dor nos seios). O humor, as emoções e o
// sono do dia já têm campo próprio no Diário: aqui ficam só os sentimentos típicos do ciclo.
export const GRUPOS_SINTOMAS = [
  { k: 'dor', titulo: 'Dor', itens: [['colica', 'Cólica'], ['cabeca', 'Dor de cabeça'], ['costas', 'Dor nas costas'], ['sensibilidade', 'Dor nos seios']] },
  { k: 'corpo', titulo: 'Corpo', itens: [['inchaco', 'Inchaço'], ['cansaco', 'Cansaço'], ['nausea', 'Náusea'], ['intestino', 'Intestino solto ou preso'], ['pele', 'Pele e espinhas'], ['doce', 'Vontade de doce']] },
  { k: 'emocional', titulo: 'Emocional do ciclo', itens: [['irritabilidade', 'Irritabilidade'], ['choro', 'Choro fácil'], ['libidoAlta', 'Libido alta'], ['libidoBaixa', 'Libido baixa']] },
];
export const SINTOMAS_CICLO = GRUPOS_SINTOMAS.flatMap((g) => g.itens);
// Intensidade da dor do dia (uma só) e "tomei remédio".
export const DORES_CICLO = [['leve', 'Leve'], ['moderada', 'Moderada'], ['forte', 'Forte']];

// Ciclo: inícios (dia menstruada depois de um dia sem), a média entre eles (só intervalos de 15 a 45 dias, para não
// contar um registro esquecido) e a previsão do próximo; e a energia média nos dias do ciclo e nos outros.
// dias: [{ data, dados }] em qualquer ordem.
export function resumoCiclo(dias, hoje) {
  const menstr = new Set((dias || []).filter((x) => x.dados?.ciclo?.menstruada).map((x) => x.data));
  const antes = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10); };
  const entre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const inicios = [...menstr].filter((d) => !menstr.has(antes(d))).sort();
  const intervalos = inicios.slice(1).map((d, i) => entre(inicios[i], d)).filter((n) => n >= 15 && n <= 45);
  const media = intervalos.length ? Math.round(intervalos.reduce((s, n) => s + n, 0) / intervalos.length) : null;
  const ultimo = inicios.filter((d) => d <= hoje).at(-1) || null;
  const proximo = media && ultimo ? (() => { const [y, m, dd] = ultimo.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + media)).toISOString().slice(0, 10); })() : null;
  // Dia do ciclo de hoje: contando do último início, enquanto os dias seguidos estão marcados.
  let diaAtual = null;
  if (menstr.has(hoje) && ultimo) diaAtual = entre(ultimo, hoje) + 1;
  const energiaDe = (dd) => { const v = [dd?.antes?.energia, dd?.depois?.energia].filter(Boolean); return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null; };
  const comCiclo = [], sem = [];
  for (const x of dias || []) { const e = energiaDe(x.dados); if (e !== null) (menstr.has(x.data) ? comCiclo : sem).push(e); }
  const med = (l) => (l.length ? Math.round((l.reduce((s, n) => s + n, 0) / l.length) * 10) / 10 : null);
  return { inicios, media, proximo, diaAtual, energiaCiclo: comCiclo.length >= 3 ? med(comCiclo) : null, energiaOutros: comCiclo.length >= 3 ? med(sem) : null };
}
// ---------- ciclo: histórico, avisos e previsões (pacote 1) ----------
const somar = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const JANELA_AVISOS = 182;   // 6 meses, como o app Saúde do iPhone

// Situação do ciclo num dia: a última registrada até ele (sem nenhuma, 'nenhum').
export function fatorEm(dias, data) {
  let f = 'nenhum', em = '';
  for (const x of dias || []) if (x.dados?.cicloFator && x.data <= data && x.data >= em) { f = x.dados.cicloFator; em = x.data; }
  return f;
}

// dias: [{ data, dados }]. Devolve:
//   ciclos: [{ inicio, duracao (até o próximo início; null no que está em andamento), menstruacao (dias seguidos),
//             conta (15 a 45 dias: entra na média) }] do mais recente ao mais antigo
//   media, mediaMenstruacao, variacao (maior − menor ciclo nos últimos 6 meses), fator (situação de hoje)
//   previsoes: [{ inicio, fim }] as próximas 3 de hoje em diante (sem previsão em gravidez, amamentação e menopausa);
//   atraso: dias desde a primeira prevista, quando ela já passou sem menstruação registrada
//   avisos: [{ k, texto }] padrões dos últimos 6 meses, só com situação "nenhuma" (não é diagnóstico)
export function analiseCiclo(dias, hoje) {
  const L = (dias || []).filter((x) => x.data <= hoje);
  const menstr = new Set(L.filter((x) => x.dados?.ciclo?.menstruada).map((x) => x.data));
  const escapes = L.filter((x) => x.dados?.ciclo?.escape).map((x) => x.data).sort();
  const inicios = [...menstr].filter((d) => !menstr.has(somar(d, -1))).sort();
  const ciclos = inicios.map((ini, i) => {
    let n = 0;
    while (menstr.has(somar(ini, n))) n++;
    const prox = inicios[i + 1];
    const duracao = prox ? diasEntre(ini, prox) : null;
    return { inicio: ini, duracao, menstruacao: n, conta: duracao !== null && duracao >= 15 && duracao <= 45 };
  });
  const validos = ciclos.filter((c) => c.conta);
  const med = (l) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
  const media = med(validos.map((c) => c.duracao));
  const mediaMenstruacao = med(ciclos.filter((c) => c.menstruacao <= 15).map((c) => c.menstruacao));
  const fator = fatorEm(L, hoje);
  const desde = somar(hoje, -JANELA_AVISOS);
  const recentes = validos.filter((c) => c.inicio >= desde);
  const variacao = recentes.length >= 2 ? Math.max(...recentes.map((c) => c.duracao)) - Math.min(...recentes.map((c) => c.duracao)) : null;

  // Próximas 3 (de hoje em diante): do último início, de média em média. Se a primeira prevista já passou sem
  // menstruação registrada, atraso diz há quantos dias.
  const previsoes = [];
  let atraso = 0;
  const ultimo = inicios.at(-1);
  if (media && ultimo && !SEM_PREVISAO.includes(fator)) {
    const dur = Math.max(1, mediaMenstruacao || 5);
    const primeira = somar(ultimo, media);
    if (primeira < hoje && !menstr.has(hoje)) atraso = diasEntre(primeira, hoje);
    for (let i = 1; previsoes.length < 3 && i <= 40; i++) {
      const ini = somar(ultimo, media * i);
      if (ini >= hoje) previsoes.push({ inicio: ini, fim: somar(ini, dur - 1) });
    }
  }

  // Avisos de padrão (critérios do app Saúde do iPhone), nos últimos 6 meses.
  const avisos = [];
  if (fator === 'nenhum' && inicios.length) {
    if (recentes.length >= 3 && variacao >= 17) {
      avisos.push({ k: 'irregular', texto: `Seus ciclos variaram ${variacao} dias entre o mais curto e o mais longo nos últimos 6 meses.` });
    }
    const longas = ciclos.filter((c) => c.inicio >= desde && c.menstruacao >= 10).length;
    if (longas >= 2) avisos.push({ k: 'prolongada', texto: `Você teve ${longas} menstruações de 10 dias ou mais nos últimos 6 meses.` });
    // Escape em pelo menos 2 ciclos diferentes (o ciclo do escape é o do último início antes dele).
    const cicloDo = (d) => inicios.filter((i) => i <= d).at(-1) || 'antes';
    const comEscape = new Set(escapes.filter((d) => d >= desde).map(cicloDo));
    if (comEscape.size >= 2) avisos.push({ k: 'escape', texto: `Você registrou escape em ${comEscape.size} ciclos nos últimos 6 meses.` });
    // Poucas menstruações: só para quem registra há 6 meses ou mais.
    const primeiro = (dias || []).map((x) => x.data).sort()[0];
    const naJanela = inicios.filter((d) => d >= desde).length;
    if (primeiro && primeiro <= desde && naJanela <= 2) {
      avisos.push({ k: 'infrequente', texto: `Você registrou ${naJanela === 1 ? 'só 1 menstruação' : `só ${naJanela} menstruações`} nos últimos 6 meses.` });
    }
  }
  return { ciclos: [...ciclos].reverse(), media, mediaMenstruacao, variacao, fator, previsoes, atraso, avisos };
}
export const SONO = [['bem', 'Dormi bem'], ['pouco', 'Dormi pouco'], ['agitado', 'Sono agitado'], ['sonhos', 'Sonhos marcantes']];
// Linhas que dá para escolher no conselho do guia (sem o Encontro das Linhas, que não é um guia).
export const LINHAS_DIARIO = LINHAS.flatMap((g) => g.itens).filter(([k]) => k !== 'mista');

// ---------- ervas: temperatura ----------
// Classificação usual na Umbanda (quente = descarrego, morna = equilíbrio, fria = atração). Erva fora da lista fica
// sem classificação. A Casa pode ajustar a lista.
export const TEMPERATURAS = { quente: ['Quente', 'Descarrego'], morna: ['Morna', 'Equilíbrio'], fria: ['Fria', 'Atração'] };
const ERVAS_TEMPERATURA = {
  quente: ['arruda', 'guiné', 'sal grosso', 'aroeira', 'pinhão roxo', 'espada de São Jorge', 'espada de Santa Bárbara', 'espada de Ogum', 'espada de Iansã', 'quebra demanda', 'folha de mamona'],
  morna: ['alecrim', 'manjericão', 'alfazema', 'camomila', 'hortelã', 'boldo', 'sálvia', 'louro', 'capim-cidreira', 'capim-limão', 'erva doce', 'melissa', 'macela', 'levante', 'abre caminho', 'eucalipto'],
  fria: ['rosas brancas', 'rosa branca', 'rosas', 'rosa', 'malva', 'jasmim', 'colônia', 'lírio', 'pétalas'],
};
export const AVISO_QUENTE = 'Erva quente: banho do pescoço para baixo. Não jogue na cabeça.';
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const TABELA = Object.entries(ERVAS_TEMPERATURA).flatMap(([t, L]) => L.map((n) => [sem(n), t]))
  .sort((a, b) => b[0].length - a[0].length);   // o nome mais longo primeiro ("rosas brancas" antes de "rosa")
// 'quente' | 'morna' | 'fria' | '' para o nome digitado.
export function temperaturaDaErva(nome) {
  const n = sem(nome);
  if (!n) return '';
  return TABELA.find(([k]) => n.startsWith(k) || n.includes(' ' + k))?.[1] || '';
}
// Sugestões do campo de ervas: as das apostilas (banhos de orixá e de guia) e as da tabela de temperatura.
export const ERVAS_SUGESTOES = [...new Set([
  ...Object.values(ERVAS_TEMPERATURA).flat(),
  ...Object.values(BANHO_ORIXA).flatMap((x) => x.ervas),
  ...Object.values(BANHO_GUIA).flatMap((x) => x.ervas),
])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

// ---------- cuidados do dia (bloco "Como você está hoje?") ----------
// Banho de ervas: o de um orixá (as ervas da apostila de Orixás) ou até MAX_ERVAS_BANHO ervas das apostilas.
export const ORIXAS_BANHO = Object.keys(BANHO_ORIXA);
export const ERVAS_APOSTILA = [...new Set([...Object.values(BANHO_ORIXA), ...Object.values(BANHO_GUIA)].flatMap((x) => x.ervas))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
export const MAX_ERVAS_BANHO = 7;
export const MAX_LITROS = 20;

// ---------- Orientador (dia comum) ----------
const MANUTENCAO = {
  alecrim: { nome: 'Alecrim', fundamento: 'Erva morna de alegria e clareza: devolve o ânimo a quem está drenado ou triste.' },
  manjericao: { nome: 'Manjericão', fundamento: 'Erva morna de limpeza suave e proteção: organiza a cabeça cheia e devolve a sensação de amparo.' },
  alfazema: { nome: 'Alfazema', fundamento: 'Erva morna de paz: acalma a impaciência e a tensão acumulada.' },
  camomila: { nome: 'Camomila', fundamento: 'Erva morna de tranquilidade: alivia a ansiedade e ajuda no sono.' },
};
const ERVA_POR_EMOCAO = { drenado: 'alecrim', triste: 'alecrim', sobrecarregado: 'manjericao', medo: 'manjericao', irritado: 'alfazema', ansioso: 'camomila' };
// O estado pesado mais recente do dia (o da noite vale mais que o da manhã) e a erva de manutenção para ele.
export function sugestaoOrientador(dia) {
  const emo = [...(dia?.depois?.emo || []), ...(dia?.antes?.emo || [])].find((e) => DENSAS.includes(e));
  return emo ? { emo, ...MANUTENCAO[ERVA_POR_EMOCAO[emo]] } : null;
}

// ---------- lua ----------
// Fase pela elongação (longitude da Lua menos a do Sol, com os principais termos de perturbação: erro de poucas horas).
// Como nos calendários, cada fase começa no dia (horário de Brasília) em que acontece e vale até a seguinte.
export const FASES_LUA = [
  ['nova', 'Lua Nova', '🌑', 'Recolhimento: bom para firmar intenções e recomeçar.'],
  ['crescente', 'Lua Crescente', '🌓', 'Crescimento: bom para atrair e fortalecer.'],
  ['cheia', 'Lua Cheia', '🌕', 'Energia no auge: axé forte e emoções à flor da pele.'],
  ['minguante', 'Lua Minguante', '🌗', 'Limpeza: bom para descarregar e soltar o que pesa.'],
];
const sen = (g) => Math.sin(g * Math.PI / 180);
function elongacao(ms) {
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
  const Lm = 218.316 + 13.176396 * d, Mm = 134.963 + 13.064993 * d, Ms = 357.529 + 0.98560028 * d;
  const D = 297.850 + 12.190749 * d, F = 93.272 + 13.229350 * d;
  const lua = Lm + 6.289 * sen(Mm) + 1.274 * sen(2 * D - Mm) + 0.658 * sen(2 * D) - 0.186 * sen(Ms) - 0.114 * sen(2 * F)
    - 0.059 * sen(2 * D - 2 * Mm) - 0.057 * sen(2 * D - Ms - Mm) + 0.053 * sen(2 * D + Mm) + 0.046 * sen(2 * D - Ms) + 0.041 * sen(Mm - Ms);
  const sol = 280.459 + 0.98564736 * d + 1.915 * sen(Ms) + 0.020 * sen(2 * Ms);
  return (((lua - sol) % 360) + 360) % 360;
}
export function faseDaLua(data) {
  return FASES_LUA[Math.floor(elongacao(Date.parse(data + 'T23:59:00-03:00')) / 90) % 4];   // fim do dia em Brasília
}

// ---------- dados do dia ----------
const chaves = (L) => L.map(([k]) => k);
const umDe = (v, L) => (chaves(L).includes(v) ? v : undefined);
// Emoções marcadas (aceita o texto único da primeira versão): sem repetir, até MAX_EMOCOES.
function emocoes(v) {
  const L = (Array.isArray(v) ? v : v ? [v] : []).map((e) => EMOCAO_ANTIGA[e] || e).filter((e) => umDe(e, EMOCOES));
  return L.length ? [...new Set(L)].slice(0, MAX_EMOCOES) : undefined;
}
// Litros de água: aceita vírgula; até 2 casas.
export function litros(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').trim() || NaN);
  return Number.isFinite(n) && n > 0 && n <= MAX_LITROS ? Math.round(n * 100) / 100 : undefined;
}
const sim = (v) => (v === true ? true : undefined);
function habitos(h) {
  if (!h || typeof h !== 'object') return undefined;
  const banho = h.banho === true;
  const orixa = banho && ORIXAS_BANHO.includes(h.orixa) ? h.orixa : undefined;
  const ervas = banho && !orixa && Array.isArray(h.ervas)
    ? [...new Set(h.ervas.map((e) => ERVAS_APOSTILA.find((x) => x.toLowerCase() === String(e).toLowerCase())).filter(Boolean))].slice(0, MAX_ERVAS_BANHO) : [];
  return limpo({
    preceito: sim(h.preceito), atividade: sim(h.atividade),
    agua: sim(h.agua), litros: h.agua === true ? litros(h.litros) : undefined,
    banho: sim(banho), orixa, ervas: ervas.length ? ervas : undefined,
  });
}
function ciclo(c) {
  if (!c || typeof c !== 'object') return undefined;
  const sint = Array.isArray(c.sintomas) ? [...new Set(c.sintomas.filter((s) => umDe(s, SINTOMAS_CICLO)))] : [];
  // Sintomas, dor e remédio valem em qualquer dia (a TPM vem antes da menstruação).
  const extra = { sintomas: sint.length ? sint : undefined, dor: umDe(c.dor, DORES_CICLO), remedio: c.remedio === true ? true : undefined };
  // Menstruada e escape não andam juntos: menstruada vale mais.
  if (c.menstruada === true) return limpo({ menstruada: true, fluxo: umDe(c.fluxo, FLUXOS), ...extra });
  if (c.escape === true) return limpo({ escape: true, ...extra });
  return limpo(extra);
}
const nota = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : undefined);
const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.replace(/\r/g, '').trim().slice(0, max) : undefined);
const limpo = (o) => {
  const r = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  return Object.keys(r).length ? r : undefined;
};
export const MAX_CONSELHO = 2000;
export const MAX_REFLEXAO = 1000;
export const MAX_ERVAS = 15;

// Só os campos conhecidos, com os valores válidos; o resto cai fora. Dia sem nada: {}.
//   gira: true|false (só quando a pessoa mudou; sem ele vale a agenda)
//   antes: { humor (1 a 5, rostos), emo: [até 3], energia, sono }  · depois: { humor, emo, energia, sensacao }
//   linha, conselho (dia de gira) · reflexao (dia comum)
//   habitos: { preceito, atividade, agua, litros, banho, orixa | ervas: [até 7] } (só os marcados)
//   banho: { ervas: [..], feito, origem: 'guia' | 'orientador' | 'proprio' (anotado pela pessoa num dia comum) }
//   ciclo: { menstruada: true, fluxo } | { escape: true } | {} — e, em qualquer dia, sintomas: [..], dor, remedio
//   cicloFator: a situação do ciclo a partir deste dia (FATORES_CICLO)
export function normalizarDia(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const ervas = Array.isArray(d.banho?.ervas)
    ? [...new Set(d.banho.ervas.map((e) => texto(e, 60)).filter(Boolean))].slice(0, MAX_ERVAS) : [];
  return limpo({
    gira: typeof d.gira === 'boolean' ? d.gira : undefined,
    habitos: habitos(d.habitos),
    ciclo: ciclo(d.ciclo),
    cicloFator: umDe(d.cicloFator, FATORES_CICLO),
    antes: limpo({ humor: nota(d.antes?.humor), emo: emocoes(d.antes?.emo), energia: nota(d.antes?.energia), sono: umDe(d.antes?.sono, SONO) }),
    depois: limpo({ humor: nota(d.depois?.humor), emo: emocoes(d.depois?.emo), energia: nota(d.depois?.energia), sensacao: umDe(d.depois?.sensacao, SENSACOES) }),
    linha: umDe(d.linha, LINHAS_DIARIO),
    conselho: texto(d.conselho, MAX_CONSELHO),
    reflexao: texto(d.reflexao, MAX_REFLEXAO),
    banho: ervas.length ? { ervas, feito: d.banho.feito === true, origem: ['orientador', 'proprio'].includes(d.banho.origem) ? d.banho.origem : 'guia' } : undefined,
  }) || {};
}

// Delta de Axé: energia depois menos antes (null sem os dois).
export const deltaAxe = (dia) => (dia?.antes?.energia && dia?.depois?.energia ? dia.depois.energia - dia.antes.energia : null);

// ---------- Seu acompanhamento (os painéis do Diário, calculados no aparelho) ----------
// Comparação só com MIN_COMPARAR dias de cada lado: com menos, a média engana.
export const MIN_COMPARAR = 5;
export const CUIDADOS_COMPARAR = [['atividade', 'Atividade física'], ['banho', 'Banho de ervas'], ['agua', 'Água'], ['preceito', 'Preceito']];
const media1 = (l) => (l.length ? Math.round((l.reduce((s, n) => s + n, 0) / l.length) * 10) / 10 : null);
// Energia do dia: a média da manhã/chegada e da noite/saída que foram marcadas.
export const energiaDoDia = (d) => media1([d?.antes?.energia, d?.depois?.energia].filter(Boolean));
// Dia em vibração densa: mais emoções densas que leves (contando manhã e noite, sem repetir).
const emocoesDoDia = (d) => [...new Set([...(d?.antes?.emo || []), ...(d?.depois?.emo || [])])];
const diaDenso = (d) => { const e = emocoesDoDia(d); const n = e.filter((k) => DENSAS.includes(k)).length; return n > 0 && n > e.length - n; };
const diaAnterior = (data) => { const [y, m, dd] = data.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10); };

// dias: [{ data, dados }]; desde/ate: o período ('AAAA-MM-DD', inclusive); ehGira(data, dados) e linhaDe(data, dados)
// vêm da tela (a gira depende da agenda). → { giras, axe, cuidados, emocoes }
//   giras: [{ data, linha, antes, depois, delta }] (mais recente primeiro) · axe: { media, porLinha: [{ linha, n, media }] }
//   cuidados: [{ k, nome, com, sem, nCom, nSem, ok }] · emocoes: { total, leve, densa, lista: [{ k, nome, grupo, n }], seguidos }
//   seguidos: dias seguidos em vibração densa até o último registro, se ele for de hoje ou de ontem (0 se não).
export function acompanhamento(dias, { desde, ate, ehGira, linhaDe }) {
  const L = (dias || []).filter((x) => x.data >= desde && x.data <= ate).sort((a, b) => a.data.localeCompare(b.data));
  const giras = L.filter((x) => ehGira(x.data, x.dados) && deltaAxe(x.dados) !== null)
    .map((x) => ({ data: x.data, linha: linhaDe(x.data, x.dados) || '', antes: x.dados.antes.energia, depois: x.dados.depois.energia, delta: deltaAxe(x.dados) }))
    .reverse();
  const porLinha = Object.entries(giras.reduce((o, g) => { if (g.linha) (o[g.linha] ||= []).push(g.delta); return o; }, {}))
    .map(([linha, l]) => ({ linha, n: l.length, media: media1(l) }))
    .sort((a, b) => b.media - a.media || b.n - a.n);

  const comEnergia = L.filter((x) => energiaDoDia(x.dados) !== null);
  const cuidados = CUIDADOS_COMPARAR.map(([k, nome]) => {
    const com = comEnergia.filter((x) => x.dados.habitos?.[k]).map((x) => energiaDoDia(x.dados));
    const sem = comEnergia.filter((x) => !x.dados.habitos?.[k]).map((x) => energiaDoDia(x.dados));
    return { k, nome, com: media1(com), sem: media1(sem), nCom: com.length, nSem: sem.length, ok: com.length >= MIN_COMPARAR && sem.length >= MIN_COMPARAR };
  });

  const conta = {};
  L.forEach((x) => emocoesDoDia(x.dados).forEach((k) => { conta[k] = (conta[k] || 0) + 1; }));
  const lista = GRUPOS_EMOCOES.flatMap((g) => g.itens.map(([k, nome]) => ({ k, nome, grupo: g.k, n: conta[k] || 0 })))
    .filter((x) => x.n).sort((a, b) => b.n - a.n);
  const densa = lista.filter((x) => x.grupo === 'densa').reduce((s, x) => s + x.n, 0);
  const leve = lista.filter((x) => x.grupo === 'leve').reduce((s, x) => s + x.n, 0);
  // Sequência: do último dia com emoções para trás, enquanto os dias são seguidos e densos.
  const comEmo = L.filter((x) => emocoesDoDia(x.dados).length);
  let seguidos = 0;
  const ultimo = comEmo.at(-1);
  if (ultimo && (ultimo.data === ate || ultimo.data === diaAnterior(ate))) {
    let esperado = ultimo.data;
    for (let i = comEmo.length - 1; i >= 0 && comEmo[i].data === esperado && diaDenso(comEmo[i].dados); i--) {
      seguidos++;
      esperado = diaAnterior(esperado);
    }
  }
  return { giras, axe: { media: media1(giras.map((g) => g.delta)), porLinha }, cuidados, emocoes: { total: leve + densa, leve, densa, lista, seguidos } };
}
