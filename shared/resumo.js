// Lê a mensagem "RESUMO DO EVENTO" (colada do WhatsApp) para cadastrar uma gira passada.
//
//   lerResumo(texto) → { data: 'AAAA-MM-DD' | '', horario, local, coordenador,
//                        contagem: { presentes, ausentes, licenca, convidados },
//                        atendimentos: { preferencial, normal, passe }, ausentes: [nomes], licenca: [nomes] }
//   casarNomes(nomes, pessoas) → [{ lido, pessoa?, provavel?, candidatos }]

import { normalizarNome, nomesParecidos } from './ervas.js';

const num = (s) => { const n = parseInt(String(s).replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };
// Tira emojis/marcadores do começo da linha.
const limpar = (l) => l.replace(/^[^\p{L}\p{N}]+/u, '').trim();

export function lerResumo(texto) {
  const r = { data: '', horario: '', local: '', coordenador: '', contagem: {}, atendimentos: { preferencial: 0, normal: 0, passe: 0 }, ausentes: [], licenca: [] };
  let secao = '';
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const linha = limpar(bruta);
    if (!linha) continue;
    const t = normalizarNome(linha);
    // títulos das seções (em maiúsculas, sem ":")
    if (!linha.includes(':') && linha === linha.toUpperCase() && /[A-ZÀ-Ú]/.test(linha)) {
      secao = t.startsWith('ausentes') ? 'ausentes' : t.startsWith('em licenca') ? 'licenca' : t;
      continue;
    }
    const m = linha.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      const k = normalizarNome(m[1]); const v = m[2].trim();
      if (k === 'data') { const d = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (d) r.data = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; }
      else if (k === 'horario') r.horario = v;
      else if (k === 'local') r.local = v;
      else if (k === 'coordenador') r.coordenador = v;
      else if (k === 'presentes') r.contagem.presentes = num(v);
      else if (k === 'ausentes') r.contagem.ausentes = num(v);
      else if (k === 'em licenca') r.contagem.licenca = num(v);
      else if (k === 'convidados') r.contagem.convidados = num(v);
      else if (k === 'preferencial') r.atendimentos.preferencial = num(v);
      else if (k === 'normal') r.atendimentos.normal = num(v);
      else if (k === 'passe') r.atendimentos.passe = num(v);
      continue;
    }
    if ((secao === 'ausentes' || secao === 'licenca') && !/^nenhum/.test(t)) {
      // Nome inteiro, com o código da turma ("Bruna Tiba T6").
      const nome = linha.replace(/\s+/g, ' ').trim();
      if (nome) r[secao].push(nome);
    }
  }
  return r;
}

// Separa o código da turma do fim do nome: "ana paula t8" → { base: 'ana paula', turma: 't8' }.
const turmaDe = (n) => { const m = n.match(/^(.*?)\s+(t\d+)$/); return m ? { base: m[1], turma: m[2] } : { base: n, turma: '' }; };

// Liga cada nome lido (inteiro, com a turma) a uma pessoa da corrente.
//  1) nome inteiro igual;
//  2) mesmo nome sem a turma, numa única pessoa (certo se a turma bate ou um dos lados não tem turma);
//  3) um único nome que começa igual (ou vice-versa); 4) um único nome parecido (provável).
export function casarNomes(nomes, pessoas) {
  const norm = pessoas.map((p) => { const n = normalizarNome(p.nome); return { p, n, ...turmaDe(n) }; });
  return nomes.map((lido) => {
    const n = normalizarNome(lido);
    const exata = norm.find((x) => x.n === n);
    if (exata) return { lido, pessoa: exata.p, candidatos: [] };
    const { base, turma } = turmaDe(n);
    const mesmaBase = norm.filter((x) => x.base === base);
    if (mesmaBase.length === 1) {
      const x = mesmaBase[0];
      const turmaOk = !turma || !x.turma || turma === x.turma;
      return turmaOk ? { lido, pessoa: x.p, candidatos: [] } : { lido, pessoa: x.p, provavel: true, candidatos: [] };
    }
    if (mesmaBase.length > 1) return { lido, pessoa: null, candidatos: mesmaBase.map((x) => x.p.nome) };
    const comeca = norm.filter((x) => x.base.startsWith(base + ' ') || base.startsWith(x.base + ' '));
    if (comeca.length === 1) return { lido, pessoa: comeca[0].p, provavel: true, candidatos: [] };
    const parecidos = nomesParecidos(pessoas.map((p) => p.nome), lido, 5);
    const cands = comeca.length ? comeca.map((x) => x.p.nome) : parecidos;
    if (!comeca.length && parecidos.length === 1) return { lido, pessoa: pessoas.find((p) => p.nome === parecidos[0]), provavel: true, candidatos: [] };
    return { lido, pessoa: null, candidatos: cands };
  });
}
