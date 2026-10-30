// Texto da escala para o WhatsApp (lista ou tabela monoespaçada).

import { giraEspecial, nomeGira, limpezaDaGira, paresPorMedium, presente, status, cambonaHoje, ordenarPessoas, pessoasDaGira } from '/shared/regras.js';
import { wd, dShort } from './util.js';

function corta(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function tabela(L, h1, h2, rows) {
  const w = Math.min(14, Math.max(h1.length, ...rows.map((r) => r[0].length)));
  L.push('```');
  L.push(h1.padEnd(w) + ' │ ' + h2);
  L.push('─'.repeat(w) + '─┼─' + '─'.repeat(14));
  rows.forEach((r) => r[1].forEach((c, i) => L.push((i === 0 ? corta(r[0], w) : '').padEnd(w) + ' │ ' + corta(c, 16))));
  L.push('```');
}

// Grupos que aparecem depois das duplas (também usados pela imagem).
// Quem faltou ou está ausente não entra na lista do evento.
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Turma da limpeza do dia e quem ajuda (faltou na gira anterior). giras = todas as giras salvas.
export function gruposLimpeza(pessoas, g, giras) {
  const L = limpezaDaGira(pessoas, g, giras);
  if (!L) return [];
  const out = [[`Limpeza · Turma ${L.turma}`, L.membros.length ? L.membros.map((p) => p.nome) : ['ninguém cadastrado nesta turma']]];
  if (L.ajudantes.length) out.push([`Ajudam na limpeza (faltaram na Turma ${L.anterior.limpeza} em ${dm(L.anterior.data)})`, L.ajudantes.map((p) => p.nome)]);
  return out;
}

export function gruposExtras(pessoas, g, giras = []) {
  const ps = ordenarPessoas(pessoasDaGira(pessoas, g));
  const usados = new Set((g.pares || []).map((p) => p.c));
  return [
    ['Senha', ps.filter((p) => presente(p, g) && p.funcao === 'senha').map((p) => p.nome)],
    ['Suporte', ps.filter((p) => status(p, g) === 'sup').map((p) => p.nome)],
    ['Cambones de apoio', ps.filter((p) => cambonaHoje(p, g) && !usados.has(p.id)).map((p) => p.nome)],
  ].filter((x) => x[1].length).concat(gruposLimpeza(pessoas, g, giras));
}

export function textoWhats(pessoas, g, fmt, giras = []) {
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || '(removido)';
  const { lista, semPasse } = paresPorMedium(pessoas, g);
  const L = [];
  L.push('*GIRA · ' + wd(g.data).toUpperCase() + ', ' + dShort(g.data) + '*');
  if (giraEspecial(g.entidade)) L.push('*' + nomeGira(g.entidade) + '*');
  else if (g.entidade) L.push('*Entidade:* ' + nomeGira(g.entidade));
  L.push('');
  L.push('*Médiuns e cambones*');
  const tab = fmt === 'tabela';
  if (tab) {
    tabela(L, 'MÉDIUM', 'CAMBONE', lista.map((x) => [x.m.funcao === 'extra' ? corta(x.m.nome, 12) + ' *' : x.m.nome, x.cams.length ? x.cams.map((p) => nome(p.c)) : ['—']]));
    if (lista.some((x) => x.m.funcao === 'extra')) L.push('_* extra_');
  } else {
    lista.forEach((x) => L.push('• ' + x.m.nome + (x.m.funcao === 'extra' ? ' (extra)' : '') + ' → ' + (x.cams.length ? x.cams.map((p) => nome(p.c)).join(' e ') : '—')));
  }
  const comPasse = lista.filter((x) => x.passes.length);
  if (comPasse.length || semPasse.length) {
    L.push('');
    L.push('*Médiuns de passe*');
    if (tab) {
      tabela(L, 'MÉDIUM', 'PASSE', comPasse.map((x) => [x.m.nome, x.passes.map((p) => nome(p.c))]).concat(semPasse.length ? [['(sem médium)', semPasse.map(nome)]] : []));
    } else {
      comPasse.forEach((x) => L.push('• ' + x.passes.map((p) => nome(p.c)).join(' e ') + ' com ' + x.m.nome));
      semPasse.forEach((id) => L.push('• ' + nome(id) + ' → sem médium'));
    }
  }
  gruposExtras(pessoas, g, giras).forEach(([t, nomes]) => { L.push(''); L.push('*' + t + ':* ' + nomes.join(', ')); });
  return L.join('\n');
}
