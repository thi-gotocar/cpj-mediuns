// Resumo de uma gira encerrada, no formato "RESUMO DO EVENTO" do WhatsApp
// (o mesmo que a aba Histórico sabe ler de volta).
//
//   dadosResumo(pessoas, g) → { gira, data, presentes, ausentes, faltas, licenca, pct, atendimentos, total }
//   textoResumo(pessoas, g, local?, giras?) → texto pronto para colar no WhatsApp
//   limpezaResumo(pessoas, g, giras) → turma da limpeza com a situação de cada um (ou null)
//   textoLimpeza(pessoas, g, giras) → prévia da gira com a turma da limpeza para o grupo do WhatsApp (ou '')

import { status, presencaDe, daGira, pessoasDaGira, presente, naCorrenteEm, licencaEm, nomeGira, nomeEntidadeGira, orixaDaGira, limpezaDaGira, contaNaPresenca, ehCurimba } from './regras.js';

export const LOCAL_PADRAO = 'Terreiro';
const PRES = ['p', 'na', 'sup'];
const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
// Dia seguinte ao fim da licença (a data de retorno).
function diaSeguinte(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function dadosResumo(pessoas, g) {
  const ps = daGira(pessoas, g).filter(contaNaPresenca).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const com = (sts) => ps.filter((p) => sts.includes(presencaDe(p, g)));
  const presentes = com(['p']);
  const ausentes = com(['a']);
  const faltas = com(['f']);
  const licenca = com(['lic']).map((p) => {
    const l = licencaEm(p, g.data);
    return { pessoa: p, motivo: (l && l.motivo) || '', retorno: l ? diaSeguinte(l.fim) : '' };
  });
  const base = presentes.length + ausentes.length + faltas.length + licenca.length;
  const pc = (n) => (base ? Math.round((n / base) * 100) : 0);
  const at = g.atendimentos || {};
  const atendimentos = { preferencial: Number(at.preferencial) || 0, normal: Number(at.normal) || 0, passe: Number(at.passe) || 0 };
  return {
    gira: nomeEntidadeGira(g), orixa: orixaDaGira(g), data: g.data, evento: !!g.evento, participantes: Number(g.participantes) || 0, presentes, ausentes, faltas, licenca,
    pct: { presenca: pc(presentes.length), ausencia: pc(ausentes.length + faltas.length), licenca: pc(licenca.length) },
    atendimentos, total: atendimentos.preferencial + atendimentos.normal + atendimentos.passe,
  };
}

// Histórico encerrado da mesma entidade para o gráfico da imagem de resumo.
export function historicoAtendimentos(giras, atual) {
  if (!atual?.entidade || !atual.data || atual.evento) return null;
  const chave = (entidade) => nomeGira(entidade).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const entidade = chave(atual.entidade);
  if (!entidade) return null;
  const inicio = new Date(`${atual.data}T12:00:00Z`);
  inicio.setUTCFullYear(inicio.getUTCFullYear() - 1);
  const desde = inicio.toISOString().slice(0, 10);
  const registros = [...(giras || []).filter((g) => g.data !== atual.data), atual]
    .filter((g) => g?.encerrada && !g.evento && g.data >= desde && g.data <= atual.data && chave(g.entidade) === entidade)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((g) => {
      const atendimentos = {
        preferencial: Math.max(0, Number(g.atendimentos?.preferencial) || 0),
        normal: Math.max(0, Number(g.atendimentos?.normal) || 0),
        passe: Math.max(0, Number(g.atendimentos?.passe) || 0),
      };
      return { data: g.data, atendimentos, total: atendimentos.preferencial + atendimentos.normal + atendimentos.passe };
    });
  if (!registros.length) return null;
  return {
    quantidade: registros.length,
    total: registros.reduce((soma, g) => soma + g.total, 0),
    giras: registros.slice(-6),
  };
}

// Frequência de presença da corrente nas seis giras encerradas mais recentes da entidade.
export function historicoFrequencia(giras, pessoas, atual) {
  if (!atual?.entidade || !atual.data) return null;
  const chave = (entidade) => nomeGira(entidade).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const entidade = chave(atual.entidade);
  if (!entidade) return null;
  const registros = [...(giras || []).filter((g) => g.data !== atual.data), atual]
    .filter((g) => g?.encerrada && !g.evento && g.data <= atual.data && chave(g.entidade) === entidade)
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-6)
    .map((g) => {
      const elegiveis = (pessoas || []).filter((p) => contaNaPresenca(p) && naCorrenteEm(p, g.data))
        .filter((p) => ['p', 'a', 'f'].includes(presencaDe(p, g)));
      const presentes = elegiveis.filter((p) => presencaDe(p, g) === 'p').length;
      return { data: g.data, presentes, elegiveis: elegiveis.length,
        frequencia: elegiveis.length ? Math.round((presentes / elegiveis.length) * 100) : 0 };
    });
  if (!registros.length) return null;
  return {
    media: Math.round(registros.reduce((soma, g) => soma + g.frequencia, 0) / registros.length),
    giras: registros,
  };
}

// Situação de cada pessoa na gira, para a lista da limpeza.
const SITUACAO = { p: ['✅', 'Presente'], na: ['✅', 'Presente'], sup: ['✅', 'Presente'], a: ['❌', 'Ausente'], f: ['🚫', 'Falta'], lic: ['📋', 'Licença'] };
export const situacaoNaGira = (p, g) => (ehCurimba(p) ? ['🥁', 'Curimba'] : SITUACAO[status(p, g)] || SITUACAO.p);

// Turma da limpeza da gira: cada um da turma (licença incluída) e quem ajudou, com a situação.
export function limpezaResumo(pessoas, g, giras = []) {
  const L = limpezaDaGira(pessoas, g, giras);
  if (!L) return null;
  const linha = (p) => { const [e, t] = situacaoNaGira(p, g); return { pessoa: p, emoji: e, situacao: t }; };
  const turma = [...L.membros, ...L.deLicenca].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(linha);
  return { turma: L.turma, membros: turma, ajudantes: L.ajudantes.map(linha), anterior: L.anterior };
}

// Prévia da gira (aba Gira, botão WhatsApp do bloco 🧹): saudação, dados da gira e a turma da limpeza, um nome por linha.
export function textoLimpeza(pessoas, g, giras = []) {
  const L = limpezaDaGira(pessoas, g, giras);
  if (!L) return '';
  const lista = (ps) => ps.map((p) => `▫️ ${p.nome}`);
  const senha = pessoasDaGira(pessoas, g).filter((p) => presente(p, g) && p.funcao === 'senha').map((p) => p.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ');
  const orixa = orixaDaGira(g);
  const T = [
    '*Bom dia corrente* ✨',
    '_Boa semana para nós_',
    '',
    `🕯️ *Gira:* ${g.entidade ? nomeEntidadeGira(g) : 'a definir'}`,
    ...(orixa ? [`👑 *Orixá:* ${orixa}`] : []),
    `🗓️ *Data:* ${br(g.data)}`,
    ...(senha ? [`🔑 *Senha:* ${senha}`] : []),
    '',
    '━━━━━━━━━━━━━━━',
    `🧹 *Turma da limpeza: ${L.turma}*`,
    ...(L.membros.length ? lista(L.membros) : ['_Ninguém cadastrado nesta turma._']),
  ];
  if (L.ajudantes.length) {
    T.push('', '🤝 *Ajudam nesta limpeza*', `_Da Turma ${L.anterior.limpeza}, faltaram na gira de ${br(L.anterior.data).slice(0, 5)}_`, ...lista(L.ajudantes));
  }
  if (L.deLicenca.length) T.push('', '🩺 *De licença* _(não entram nesta limpeza)_', ...lista(L.deLicenca));
  T.push('', '━━━━━━━━━━━━━━━', 'Contamos com vocês. Axé! 🙏');
  return T.join('\n');
}

export const linhaLicenca = (l) => [l.pessoa.nome, l.motivo, l.retorno ? `Retorno em ${br(l.retorno)}` : ''].filter(Boolean).join(' - ');

export function textoResumo(pessoas, g, local = LOCAL_PADRAO, giras = []) {
  const d = dadosResumo(pessoas, g);
  const L = [];
  L.push('RESUMO DO EVENTO');
  if (d.gira) L.push(`Gira: ${d.gira}`);
  if (d.orixa) L.push(`Orixá: ${d.orixa}`);
  L.push(`Data: ${br(d.data)}`);
  if (local) L.push(`Local: ${local}`);
  L.push('');
  L.push(`✅ Presentes: ${d.presentes.length}`);
  L.push(`❌ Ausentes: ${d.ausentes.length}`);
  L.push(`🚫 Faltas: ${d.faltas.length}`);
  L.push(`📋 Em Licença: ${d.licenca.length}`);
  L.push('');
  L.push('TAXA DE PRESENÇA');
  L.push(`Presença: ${d.pct.presenca}%`);
  L.push(`Ausência: ${d.pct.ausencia}%`);
  L.push(`Licença: ${d.pct.licenca}%`);
  L.push('');
  if (d.evento) {
    L.push('TOTAL DE PARTICIPANTES');
    L.push(`👥 Participantes: ${d.participantes}`);
  } else {
    L.push('ATENDIMENTOS REALIZADOS');
    L.push(`👑 Preferencial: ${d.atendimentos.preferencial}`);
    L.push(`🤝 Normal: ${d.atendimentos.normal}`);
    L.push(`🎁 Passe: ${d.atendimentos.passe}`);
    L.push(`💫 Total: ${d.total}`);
  }
  L.push('');
  L.push('AUSENTES');
  if (d.ausentes.length) d.ausentes.forEach((p) => L.push(`❌ ${p.nome}`)); else L.push('Nenhum registro');
  if (d.faltas.length) {
    L.push('');
    L.push('FALTAS');
    d.faltas.forEach((p) => L.push(`🚫 ${p.nome}`));
  }
  L.push('');
  L.push('EM LICENÇA');
  if (d.licenca.length) d.licenca.forEach((l) => L.push(`📋 ${linhaLicenca(l)}`)); else L.push('Nenhum registro');
  // Turma da limpeza (títulos sem ":" e em maiúsculas, para a leitura de volta no Histórico ignorar).
  const lp = limpezaResumo(pessoas, g, giras);
  if (lp) {
    L.push('');
    L.push(`🧹 LIMPEZA · TURMA ${lp.turma}`);
    if (lp.membros.length) lp.membros.forEach((x) => L.push(`${x.emoji} ${x.pessoa.nome} - ${x.situacao}`)); else L.push('Ninguém cadastrado nesta turma');
    if (lp.ajudantes.length) {
      L.push('');
      L.push(`AJUDARAM NA LIMPEZA (FALTARAM NA TURMA ${lp.anterior.limpeza} EM ${br(lp.anterior.data).slice(0, 5)})`);
      lp.ajudantes.forEach((x) => L.push(`${x.emoji} ${x.pessoa.nome} - ${x.situacao}`));
    }
  }
  return L.join('\n');
}
