// Resumo de uma gira encerrada, no formato "RESUMO DO EVENTO" do WhatsApp
// (o mesmo que a aba Histórico sabe ler de volta).
//
//   dadosResumo(pessoas, g) → { gira, data, presentes, ausentes, faltas, licenca, pct, atendimentos, total }
//   textoResumo(pessoas, g) → texto pronto para colar no WhatsApp

import { status, licencaEm, nomeGira } from './regras.js';

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
  const ps = pessoas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const com = (sts) => ps.filter((p) => sts.includes(status(p, g)));
  const presentes = com(PRES);
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
    gira: nomeGira(g.entidade), data: g.data, presentes, ausentes, faltas, licenca,
    pct: { presenca: pc(presentes.length), ausencia: pc(ausentes.length + faltas.length), licenca: pc(licenca.length) },
    atendimentos, total: atendimentos.preferencial + atendimentos.normal + atendimentos.passe,
  };
}

export const linhaLicenca = (l) => [l.pessoa.nome, l.motivo, l.retorno ? `Retorno em ${br(l.retorno)}` : ''].filter(Boolean).join(' - ');

export function textoResumo(pessoas, g, local = LOCAL_PADRAO) {
  const d = dadosResumo(pessoas, g);
  const L = [];
  L.push('RESUMO DO EVENTO');
  if (d.gira) L.push(`Gira: ${d.gira}`);
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
  L.push('ATENDIMENTOS REALIZADOS');
  L.push(`👑 Preferencial: ${d.atendimentos.preferencial}`);
  L.push(`🤝 Normal: ${d.atendimentos.normal}`);
  L.push(`🎁 Passe: ${d.atendimentos.passe}`);
  L.push(`💫 Total: ${d.total}`);
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
  return L.join('\n');
}
