// Texto da escala para o WhatsApp (lista ou tabela monoespaçada).

import { giraEspecial, nomeEntidadeGira, orixaDaGira, limpezaDaGira, paresPorMedium, escalaDaGira, presente, status, cambonaHoje, ordenarPessoas, pessoasDaGira, guiaNaGira } from '/shared/regras.js';
import { pd, dShort } from './util.js';

function corta(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function tabela(L, h1, h2, rows) {
  const w = Math.min(14, Math.max(h1.length, ...rows.map((r) => r[0].length)));
  L.push('```');
  L.push(h1.padEnd(w) + ' │ ' + h2);
  L.push('─'.repeat(w) + '─┼─' + '─'.repeat(14));
  rows.forEach((r) => r[1].forEach((c, i) => L.push((i === 0 ? corta(r[0], w) : '').padEnd(w) + ' │ ' + corta(c, 16))));
  L.push('```');
}

// Grupos que aparecem depois das duplas (também usados pela imagem): [título, nomes, chave].
// Quem faltou ou está ausente não entra na lista do evento.
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Turma da limpeza do dia e quem ajuda (faltou na gira anterior). giras = todas as giras salvas.
// O 4º item são os nomes de quem já está com ausência (ou falta) nesta gira: aparecem riscados no WhatsApp.
export function gruposLimpeza(pessoas, g, giras) {
  const L = limpezaDaGira(pessoas, g, giras);
  if (!L) return [];
  const naoVao = (ps) => ps.filter((p) => ['a', 'f'].includes(status(p, g))).map((p) => p.nome);
  const out = [[`Limpeza · Turma ${L.turma}`, L.membros.length ? L.membros.map((p) => p.nome) : ['ninguém cadastrado nesta turma'], 'limpeza', naoVao(L.membros)]];
  if (L.ajudantes.length) out.push([`Ajudam na limpeza (Turma ${L.anterior.limpeza}, faltaram em ${dm(L.anterior.data)})`, L.ajudantes.map((p) => p.nome), 'ajudam', naoVao(L.ajudantes)]);
  return out;
}

// Nome de quem não vai (ausência/falta) no texto do WhatsApp: ❌ e riscado.
const riscar = (nomes, naoVao = []) => nomes.map((n) => (naoVao.includes(n) ? `❌ ~${n}~` : n));

export function gruposExtras(pessoas, g, giras = []) {
  const ps = ordenarPessoas(pessoasDaGira(pessoas, g));
  const usados = new Set((g.pares || []).map((p) => p.c));
  return [
    ['Senha', ps.filter((p) => presente(p, g) && p.funcao === 'senha').map((p) => p.nome), 'senha'],
    ['Suporte', ps.filter((p) => status(p, g) === 'sup').map((p) => p.nome), 'suporte'],
    ['Cambones de apoio', ps.filter((p) => cambonaHoje(p, g) && !usados.has(p.id)).map((p) => p.nome), 'apoio'],
  ].filter((x) => x[1].length).concat(gruposLimpeza(pessoas, g, giras));
}

// Cabeçalho da escala (texto e imagem): "Sábado, 07/11/2026" e "Gira de Caboclo · Orixá Ogum".
export function cabecalhoGira(g) {
  const dia = pd(g.data).toLocaleDateString('pt-BR', { weekday: 'long' });
  const gira = !g.entidade ? '' : giraEspecial(g.entidade) ? nomeEntidadeGira(g) : `Gira de ${nomeEntidadeGira(g)}`;
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), data: dShort(g.data), gira, orixa: orixaDaGira(g) };
}

const ICONE = { senha: '🔑', suporte: '🛟', apoio: '🤲', limpeza: '🧹', ajudam: '🤝' };
const LINHA = '━━━━━━━━━━━━━━━';

export function textoWhats(pessoas, g, fmt, giras = []) {
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || '(removido)';
  const { lista, semPasse } = paresPorMedium(pessoas, escalaDaGira(g));
  const cab = cabecalhoGira(g);
  const grupos = gruposExtras(pessoas, g, giras);
  const grupo = (k) => grupos.find((x) => x[2] === k);
  // Cabeçalho: orixá numa linha, a gira na de baixo e a senha logo depois.
  const L = ['📜 *ESCALA DA GIRA*', `🗓️ *${cab.dia}, ${cab.data}*`];
  if (cab.orixa) L.push(`👑 *Orixá:* ${cab.orixa}`);
  if (cab.gira) L.push(`🕯️ *${cab.gira}*`);
  if (grupo('senha')) L.push(`${ICONE.senha} *Senha:* ${grupo('senha')[1].join(', ')}`);
  if (lista.some((x) => x.cams.some((p) => p.remanejado) || x.passes.some((p) => p.remanejado))) L.push('🔄 *Escala remanejada* (faltas de última hora)');
  L.push(LINHA);
  const tab = fmt === 'tabela';
  // Médiuns e At. Extras em seções separadas (como na planilha da casa); quem está sem cambone aparece também.
  // Na lista, o médium de passe vai na linha de baixo do médium, recuado.
  // Quem entrou no Remanejar faltas vem com 🔄.
  const re = (p) => (p.remanejado ? '🔄 ' : '') + nome(p.c);
  const cams = (x) => (x.cams.length ? x.cams.map(re).join(' e ') : '_sem cambone_');
  const RECUO = '  ';   // espaço largo: o WhatsApp não some com ele no começo da linha
  const secao = (titulo, itens) => {
    if (!itens.length) return;
    L.push('', titulo);
    if (tab) tabela(L, 'MÉDIUM', 'CAMBONE', itens.map((x) => [x.m.nome, x.cams.length ? x.cams.map((p) => nome(p.c)) : ['—']]));
    else {
      // O guia de atendimento do médium na linha da gira (do Perfil) vai entre parênteses, em itálico.
      itens.forEach((x) => {
        const guia = guiaNaGira(x.m, g);
        L.push(`▫️ *${x.m.nome}*${guia ? ` _(${guia})_` : ''} → ${cams(x)}`);
        if (x.passes.length) L.push(`${RECUO}🙌 _Passe:_ ${x.passes.map(re).join(' e ')}`);
      });
    }
  };
  secao('👥 *MÉDIUNS*', lista.filter((x) => x.m.funcao !== 'extra'));
  secao('⭐ *AT. EXTRAS*', lista.filter((x) => x.m.funcao === 'extra'));
  const comPasse = lista.filter((x) => x.passes.length);
  if (tab && (comPasse.length || semPasse.length)) {
    L.push('', '🙌 *MÉDIUNS DE PASSE*');
    tabela(L, 'MÉDIUM', 'PASSE', comPasse.map((x) => [x.m.nome, x.passes.map((p) => nome(p.c))]).concat(semPasse.length ? [['(sem médium)', semPasse.map(nome)]] : []));
  } else if (semPasse.length) {
    L.push('', `🙌 *Passe sem médium:* ${semPasse.map(nome).join(', ')}`);
  }
  // Suporte e cambones de apoio, cada um com uma linha em branco depois; a limpeza em tópicos no fim.
  for (const k of ['suporte', 'apoio']) {
    const x = grupo(k);
    if (x) L.push('', `${ICONE[k]} *${x[0]}:* ${x[1].join(', ')}`);
  }
  const limpeza = grupo('limpeza');
  if (limpeza) {
    L.push('', `${ICONE.limpeza} *${limpeza[0].replace(/^Limpeza · (Turma \d+)$/, '$1 da limpeza')}:*`, `• ${riscar(limpeza[1], limpeza[3]).join(', ')}.`);
    const aj = grupo('ajudam');
    if (aj) L.push(`${ICONE.ajudam} *Ajudam na limpeza:* ${riscar(aj[1], aj[3]).join(', ')}.`);
  }
  L.push('', LINHA, 'Boa gira a todos! 🙏');
  return L.join('\n');
}
