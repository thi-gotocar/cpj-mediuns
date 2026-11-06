// Blocos informativos da gira: limpeza, recados, licenças e presença.

import { estado, girasLista, carregarAusPrevias } from '../estado.js';
import { esc, dDM } from '../util.js';
import { status, nomeEntidadeGira, temLimpeza, limpezaDaGira, licencaEm, giraEspecial, LINHA_LABEL, linhaDaEntidade, usaLinhas, funcaoNaGira, pessoasDaGira, presente, cambonaHoje } from '/shared/regras.js';
import { banhosDaGira } from '/shared/banhos.js';

export function blocoLimpeza(g) {
  if (g.evento || !temLimpeza(g)) return '';
  const L = limpezaDaGira(estado.pessoas, g, girasLista());
  if (!L) return '';
  const nomes = (l) => l.map((p) => (['a', 'f'].includes(status(p, g)) ? `<s class="limp-nao">${esc(p.nome)}</s>` : esc(p.nome))).join(', ');
  return `<div class="limpeza"><div class="limp-cab"><b>🧹 Limpeza · Turma ${L.turma}</b></div>
    <span>${L.membros.length ? nomes(L.membros) : '<span class="muted">Ninguém cadastrado nesta turma (cadastre na aba Pessoas).</span>'}</span>
    ${L.deLicenca.length ? `<span class="muted" style="font-size:.85rem">De licença: ${nomes(L.deLicenca)}</span>` : ''}
    ${L.ajudantes.length ? `<span><b>Ajudam</b> <span class="muted">(faltaram na Turma ${L.anterior.limpeza} em ${dDM(L.anterior.data)}${L.anterior.entidade ? ` · ${esc(nomeEntidadeGira(L.anterior))}` : ''})</span>: ${nomes(L.ajudantes)}</span>`
      : L.anterior ? `<span class="muted" style="font-size:.85rem">Ninguém da Turma ${L.anterior.limpeza} faltou na gira de ${dDM(L.anterior.data)}.</span>` : ''}
  </div>`;
}

export function blocoRecado(g) {
  if (!g.recado) return '';
  return `<div class="limpeza recado"><b><span aria-hidden="true">📢</span> Recado</b><span class="recado-txt">${esc(g.recado)}</span></div>`;
}

export function campoRecado(g) {
  const r = estado.recadoTxt?.data === g.data ? estado.recadoTxt.texto : g.recado || '';
  return `<label class="field">Recado para a corrente<textarea id="ev-recado" data-act="recadogira" data-d="${esc(g.data)}" rows="5" maxlength="300" placeholder="Até 5 linhas. Aparece para todos no evento.">${esc(r)}</textarea></label>`;
}

export function blocoLicenca(ps, g) {
  const quem = ps.filter((p) => licencaEm(p, g.data));
  if (!quem.length) return '';
  return `<div class="limpeza licenca"><b><span class="cruz-vermelha" aria-hidden="true">✚</span> De licença · ${quem.length}</b>
    <span>${quem.map((p) => `${esc(p.nome)} <span class="muted">(até ${dDM(licencaEm(p, g.data).fim)})</span>`).join(', ')}</span></div>`;
}

export function blocoBanho(g) {
  const { orixa, guia } = banhosDaGira(g);
  if (!orixa && !guia) return '';
  const parte = (titulo, b) => `<div class="banho-p"><b>${titulo} · ${esc(b.nome)}</b>
    <div class="banho-ervas">${b.ervas.map((e) => `<span>${esc(e)}</span>`).join('')}</div>
    ${b.obs ? `<span class="muted banho-obs">${esc(b.obs)}</span>` : ''}${b.aviso ? `<span class="banho-aviso">⚠️ ${esc(b.aviso)}</span>` : ''}</div>`;
  return `<div class="limpeza banho"><b><span aria-hidden="true">🌿</span> Banho</b>
    ${orixa ? parte('Banho orixá', orixa) : ''}${guia ? parte('Banho guia', guia) : ''}</div>`;
}

export function blocoAusPrevia(ps, g) {
  if (estado.ausPrevias === null) { estado.ausPrevias = undefined; carregarAusPrevias(); }
  const ids = new Set((estado.ausPrevias || []).filter((x) => x.data === g.data).map((x) => x.pessoaId));
  const marcadas = ps.filter((p) => ids.has(p.id));
  const livres = ps.filter((p) => !ids.has(p.id) && !licencaEm(p, g.data));
  return `<div class="limpeza ausencia aus-prev"><b><span class="aus-ico" aria-hidden="true">✖</span> Ausência antecipada${marcadas.length ? ` · ${marcadas.length}` : ''}</b>
    <span class="muted" style="font-size:.85rem">Quem já avisou que não vem. Ao adicionar o evento, já entra como Ausente.</span>
    ${marcadas.map((p) => `<span class="aus-prev-l"><span>${esc(p.nome)}</span><button class="btn small lock-x" data-act="ausprevtira" data-id="${p.id}" title="Tirar a ausência de ${esc(p.nome)}" aria-label="Tirar a ausência de ${esc(p.nome)}">✕</button></span>`).join('')}
    ${livres.length ? `<span class="aus-prev-add"><select id="ausprev-pessoa" aria-label="Pessoa que não vem"><option value="">&lt;escolha a pessoa&gt;</option>${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
      <button class="btn small" data-act="ausprevadd">Marcar ausência</button></span>` : ''}</div>`;
}

function blocoNomesFora(ps, g, st, classe, titulo) {
  const quem = ps.filter((p) => status(p, g) === st);
  if (!quem.length) return '';
  return `<div class="limpeza ${classe}"><b><span class="aus-ico" aria-hidden="true">✖</span> ${titulo} · ${quem.length}</b>
    <span class="aus-nomes">${quem.map((p) => `<span class="aus-nome">${esc(p.nome)}</span>`).join('')}</span></div>`;
}

export const blocoAusencia = (ps, g) => blocoNomesFora(ps, g, 'a', 'ausencia', 'Ausência');
export const blocoFaltas = (ps, g) => blocoNomesFora(ps, g, 'f', 'faltas', 'Faltas');

export function avisoEntidade(ps, g, editar, admin) {
  const comLinhas = ps.filter(usaLinhas);
  if (!comLinhas.length) return '';
  if (giraEspecial(g.entidade)) {
    return admin ? `<p class="muted" style="margin:0;font-size:.88rem">${esc(nomeEntidadeGira(g))}: extras e passes atuam na própria função, sem olhar as linhas.</p>` : '';
  }
  if (!linhaDaEntidade(g.entidade)) {
    return editar ? `<div class="warnbox">Escolha a entidade do dia: é ela que define quem atua como extra ou passe e quem cambona.</div>` : '';
  }
  const viram = comLinhas.filter((p) => funcaoNaGira(p, g) === 'cambone');
  return admin && viram.length
    ? `<p class="muted" style="margin:0;font-size:.88rem">Nesta gira de ${esc(LINHA_LABEL[linhaDaEntidade(g.entidade)])}, cambonam: ${viram.map((p) => esc(p.nome)).join(', ')}.</p>`
    : '';
}

export function contagemPresentes(ps, g, resumo) {
  const dia = pessoasDaGira(ps, g);
  const conta = {
    'Médium': dia.filter((p) => presente(p, g) && p.funcao === 'medium').length,
    'Cambone': dia.filter((p) => cambonaHoje(p, g)).length,
    'Passe': dia.filter((p) => presente(p, g) && p.funcao === 'passe').length,
    'Extra': dia.filter((p) => presente(p, g) && p.funcao === 'extra').length,
    'Senha': dia.filter((p) => presente(p, g) && p.funcao === 'senha').length,
    'Suporte': dia.filter((p) => status(p, g) === 'sup').length,
  };
  const fn = { 'Médium': 'medium', Cambone: 'cambone', Passe: 'passe', Extra: 'extra', Senha: 'senha', Suporte: 'suporte' };
  const qtd = { presente: resumo.presentes.length, falta: resumo.faltas.length, ausencia: resumo.ausentes.length, licenca: resumo.licenca.length };
  const base = Object.values(qtd).reduce((s, n) => s + n, 0);
  const situacoes = [
    ['presente', 'Presentes', 'ok'],
    ['falta', 'Faltas', 'off'],
    ['ausencia', 'Ausências', 'warn'],
    ['licenca', 'Licença', 'muted'],
  ];
  return `<div class="enc-totais">
    <div class="enc-func-totais" aria-label="Pessoas por função">${Object.entries(conta).map(([t, n]) => `<span class="fn-${fn[t]}"><span class="muted">${t}</span><b>${n}</b></span>`).join('')}</div>
    <div class="enc-situacoes" aria-label="Percentuais de presença e situação">${situacoes.map(([k, t, cor]) => `<div class="enc-situacao ${cor}"><b>${base ? Math.round(qtd[k] / base * 100) : 0}%</b><span>${t}</span><small>${qtd[k]} de ${base}</small></div>`).join('')}</div>
  </div>`;
}
