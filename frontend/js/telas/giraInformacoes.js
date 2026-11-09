// Blocos informativos da gira: limpeza, recados, licenças e presença.

import { estado, pode, veErvas, girasLista, carregarAusPrevias, carregarErvas, carregarOferendas } from '../estado.js';
import { esc, dDM } from '../util.js';
import { status, nomeEntidadeGira, temLimpeza, limpezaDaGira, licencaEm, giraEspecial, LINHA_LABEL, linhaDaEntidade, usaLinhas, funcaoNaGira, pessoasDaGira, presente, cambonaHoje } from '/shared/regras.js';
import { banhosDaGira } from '/shared/banhos.js';
import { situacao, travadaPara, textoEntrega, ROTULO_MEDIUM } from '/shared/oferendas.js';

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

// Recado: o admin edita no próprio bloco (até 5 linhas, salva ao sair do campo); os outros só leem.
export function blocoRecado(g, editar = false) {
  if (editar) {
    const r = estado.recadoTxt?.data === g.data ? estado.recadoTxt.texto : g.recado || '';
    return `<div class="limpeza recado"><b><span aria-hidden="true">📢</span> Recado</b><textarea id="ev-recado" data-act="recadogira" data-d="${esc(g.data)}" rows="5" maxlength="300" aria-label="Recado para a corrente" placeholder="Até 5 linhas. Aparece para todos no evento.">${esc(r)}</textarea></div>`;
  }
  if (!g.recado) return '';
  return `<div class="limpeza recado"><b><span aria-hidden="true">📢</span> Recado</b><span class="recado-txt">${esc(g.recado)}</span></div>`;
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

// Gira de Preto Velho ou Caboclo: atalho para a aba Ervas, com a situação real do pedido.
const LINHAS_COM_ERVAS = ['preto-velho', 'caboclo'];
let pedindoErvas = false;
export function blocoPedirErvas(g) {
  if (g.evento || !LINHAS_COM_ERVAS.includes(linhaDaEntidade(g.entidade)) || !veErvas()) return '';
  if (estado.ervas === null && !pedindoErvas) { pedindoErvas = true; carregarErvas().finally(() => { pedindoErvas = false; }); }
  const E = estado.ervas;
  const selo = !E ? '<span class="pe-st muted">Carregando…</span>'
    : E.aberta ? '<span class="pe-st aberto">Em andamento</span>' : '<span class="pe-st fechado">Pedido fechado</span>';
  return `<button class="limpeza pedir-ervas" data-act="goto" data-tab="ervas"><b><span aria-hidden="true">🌿</span> Pedir ervas</b>${selo}<span class="seta" aria-hidden="true">›</span></button>`;
}

// Oferendas publicadas na mesma data da gira. Cada uma: nome, responsável, o que a pessoa assumiu e o que ainda falta doar.
// "Visível para todos" desligado: só os admins das oferendas veem. A com uma linha por pessoa só aparece para quem está na lista dela.
export function blocosOferenda(g) {
  if (!pode('oferendas:doar')) return '';
  if (estado.oferendas === null) { carregarOferendas(); return ''; }
  const eu = estado.oferendas.eu || {};
  const visivel = (of) => of.status === 'publicado' || (of.status !== 'encerrado' && pode('oferendas:gerenciar'));
  const estaNaLista = (of) => (of.mediuns || []).some((m) => 'p:' + m.pessoaId === eu.chave);
  return (estado.oferendas.oferendas || []).filter((of) => of.data === g.data && visivel(of) && (!of.porMedium || estaNaLista(of))).map((of) => blocoOferenda(of, eu)).join('');
}

function blocoOferenda(of, eu) {
  const publicada = of.status === 'publicado';
  const travada = !!eu.chave && travadaPara(of, eu.chave);
  const podeDoar = !!eu.chave && publicada && !travada;
  const minha = (i) => i.doacoes.find((d) => d.chave === eu.chave)?.quantidade || 0;
  const meus = eu.chave ? of.itens.filter(minha) : [];
  const faltam = of.itens.filter((i) => !i.entregue && situacao(i).falta > 0);
  const linhaMeu = (i) => `<div class="ofg-l"><span class="ofg-nome">${esc(i.nome)}<small class="muted">Entrega ${textoEntrega(i)}</small></span>
    ${i.entregue ? '<span class="of-entregue">✓ Entregue</span>' : podeDoar ? `<span class="ofg-qtd"><button class="btn small" data-act="giraofmenos" data-id="${i.id}" aria-label="Menos ${esc(i.nome)}">−</button><b>${minha(i)}</b><button class="btn small" data-act="giraofmais" data-id="${i.id}" ${situacao(i).falta ? '' : 'disabled'} aria-label="Mais ${esc(i.nome)}">+</button></span>` : `<b>${minha(i)}</b>`}</div>`;
  const linhaFalta = (i) => `<div class="ofg-l"><span class="ofg-nome">${esc(i.nome)}<small class="muted">Faltam ${situacao(i).falta} de ${i.quantidade}</small></span>
    ${podeDoar ? `<button class="btn small primary" data-act="giraofmais" data-id="${i.id}" aria-label="Vou doar ${esc(i.nome)}">Vou doar</button>` : ''}</div>`;
  const m = of.porMedium ? (of.mediuns || []).find((x) => 'p:' + x.pessoaId === eu.chave) : null;
  const bloco = `<div class="limpeza oferenda"><b><span aria-hidden="true">🎁</span> Oferenda · ${esc(of.titulo)}</b>
    ${of.responsavel ? `<span><span class="muted">Responsável:</span> ${esc(of.responsavel)}</span>` : ''}
    ${m ? `<span class="ofg-med"><span><span class="muted">Pagamento:</span> <span class="st-med ${m.pagamento}">${ROTULO_MEDIUM[m.pagamento] || m.pagamento}</span></span><span><span class="muted">Entrega:</span> <span class="st-med ${m.entrega}">${ROTULO_MEDIUM[m.entrega] || m.entrega}</span></span></span>` : ''}
    ${meus.length ? `<div class="ofg-sec"><span class="ofg-tit">Você vai levar</span>${meus.map(linhaMeu).join('')}</div>` : ''}
    ${faltam.length ? `<div class="ofg-sec"><span class="ofg-tit">Faltam doações · ${faltam.length}</span><div class="ofg-lista">${faltam.map(linhaFalta).join('')}</div></div>` : ''}
    ${travada ? '<span class="muted" style="font-size:.85rem">🔒 Completa há mais de um dia: as doações estão fechadas.</span>' : ''}
    ${publicada ? '' : '<span class="muted" style="font-size:.85rem">Só os admins veem. Para liberar, ligue “Visível para todos” na aba Oferendas.</span>'}</div>`;
  return publicada ? bloco : `<div class="gira-adm">${bloco}</div>`;
}
