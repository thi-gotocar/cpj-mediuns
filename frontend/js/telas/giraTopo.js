// Aba Gira: cards de fora do card da gira (Eventos, Orações, Aula de curimba, Seus compromissos).

import { estado, pode, carregarOferendas, acaoOracoes, avisar } from '../estado.js';
import { esc, dDM, toast, hoje, pd } from '../util.js';
import { eventosDoTopo, orixasDoDia, dataCurta, TIPO_EVENTO_LABEL } from '/shared/eventos.js';
import { corDaFaixa } from './curimba.js';
import { textoEntrega, dataBR, ROTULO_MEDIUM, compromissosDe } from '/shared/oferendas.js';
import { abertos, cabDobra, ICONE_WHATS } from './giraComum.js';

// Topo da aba Gira (só data e nome): gira dos próximos 30 dias, evento e aviso todos os futuros, amaci só da semana.
export function cardSemana() {
  const hj = hoje();
  // Aniversariantes da semana (domingo a sábado): dia/mês do Perfil, com 🎈🎂 antes do nome.
  // Orixás: só no próprio dia (DIAS_ORIXAS). No mesmo dia: eventos, depois orixás, depois aniversários.
  const ordem = (e) => (e.niver ? 2 : e.orixa ? 1 : 0);
  const evs = [...eventosDoTopo(estado.eventos, hj), ...orixasDoDia(hj), ...aniversariosDaSemana(hj)].sort((a, b) => a.data.localeCompare(b.data) || ordem(a) - ordem(b));
  // Cada evento: "folhinha" com o dia da semana (ou HOJE) e a data, o nome e o tipo num selo à direita.
  const semana = (d) => (d === hj ? 'Hoje' : pd(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()));
  const tipo = (e) => (e.niver ? ['niver', 'Aniversário'] : e.orixa ? ['orixa', 'Orixá'] : [e.tipo || 'evento', TIPO_EVENTO_LABEL[e.tipo] || 'Evento']);
  return `<div class="card ev-semana"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">📅</span> Eventos</h2>${evs.length ? `<span class="evs-qtd">${evs.length}</span>` : ''}</div>
    ${evs.length ? `<div class="evs-lista">${evs.map((e) => { const [k, rot] = tipo(e); return `<div class="evs-l${e.data === hj ? ' hoje' : ''}">
        <span class="evs-data"><span class="evs-sem">${semana(e.data)}</span><b>${dataCurta(e.data)}</b></span>
        <span class="evs-nome">${e.niver ? '<span class="evs-niver" aria-hidden="true">🎈🎂</span> ' : ''}${esc(e.nome)}</span>
        <span class="evs-tipo ${k}">${rot}</span></div>`; }).join('')}</div>`
      : '<p class="muted" style="margin:0;font-size:.88rem">Nenhum evento nos próximos 30 dias.</p>'}</div>`;
}

// Orações (logo abaixo dos Eventos): qualquer pessoa logada pede; cada uma vale 7 dias e depois some.
// Quem pediu (ou o admin dos eventos) exclui, com confirmação.
export function cardOracoes() {
  const L = estado.oracoes || [];
  const aberto = !!estado.oraNova;
  // Admin da aba Gira: WhatsApp com a imagem dos pedidos (abre uma janela com a prévia).
  const wa = L.length && pode('giras:editar') ? `<button class="btn small or-wa" data-act="oraabrir" title="Mandar os pedidos de oração no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> WhatsApp</button>` : '';
  let h = `<div class="card ev-semana or-card"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">❤️</span> Orações</h2><span class="or-cab-d">${wa}${L.length ? `<span class="evs-qtd">${L.length}</span>` : ''}</span></div>`;
  if (L.length) {
    h += `<div class="evs-lista">${L.map((o) => {
      const conf = estado.confirm === 'or:' + o.id;
      const bt = !o.apagar ? '' : conf
        ? `<button class="btn danger or-bt" data-act="oraexcluir" data-id="${o.id}">Confirmar</button>`
        : `<button class="btn or-bt" data-act="askdel" data-k="or:${o.id}">Excluir</button>`;
      const n = o.reacoes || 0;
      const vela = `<button class="btn or-bt or-vela${o.reagi ? ' on' : ''}" data-act="orareagir" data-id="${o.id}" aria-pressed="${!!o.reagi}"
          title="${o.reagi ? 'Apagar minha vela' : 'Acender uma vela por este pedido'}"><span aria-hidden="true">🕯️</span> ${n}</button>`;
      return `<div class="evs-l or-l"><span class="evs-data or-ico" aria-hidden="true">🙏</span>
        <span class="evs-nome or-txt">${esc(o.texto)}</span>
        <span class="or-dir">${vela}${bt}</span></div>`;
    }).join('')}</div>`;
  } else h += '<p class="muted" style="margin:0;font-size:.88rem">Nenhum pedido de oração nos últimos 7 dias.</p>';
  h += aberto
    ? `<form id="f-oracao" class="or-form" autocomplete="off"><textarea id="or-texto" rows="3" maxlength="200" placeholder="Por quem ou pelo que rezar (até 3 linhas)">${esc(estado.oraTexto || '')}</textarea>
        <span class="row"><button class="btn primary" type="submit">Pedir oração</button><button class="btn" type="button" data-act="oranova">Cancelar</button></span>
        <p class="muted" style="margin:0;font-size:.8rem">Fica 7 dias na lista e depois some.</p></form>`
    : '<button class="btn small or-nova" data-act="oranova">＋ Pedir oração</button>';
  return h + '</div>';
}

export async function enviarOracao(form) {
  const texto = form.querySelector('textarea').value.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!texto.length) { toast('Escreva a oração.'); return; }
  if (texto.length > 3) { toast('A oração pode ter até 3 linhas.'); return; }
  if (await acaoOracoes('oracao', { texto: texto.join('\n') })) { estado.oraNova = false; estado.oraTexto = ''; toast('Pedido de oração publicado.'); avisar(); }
}

function aniversariosDaSemana(hj) {
  const d0 = pd(hj); d0.setDate(d0.getDate() - d0.getDay());
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(d0); d.setDate(d0.getDate() + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const out = [];
  dias.forEach((d) => estado.pessoas.filter((p) => p.aniversario === d.slice(5)).forEach((p) => out.push({ data: d, nome: p.nome, niver: true })));
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Aula de curimba (só para quem está nos alunos da aba Curimba): presença e faltas nas aulas até hoje.
// Mesmo padrão de "Seus compromissos" (faixa à esquerda, aqui na cor da % de presença); fica logo acima de "Sua presença".
// A % conta só as aulas marcadas, como na aba Curimba.
export function cardAulaCurimba() {
  if (!estado.minhaCurimba) return '';
  const hj = hoje();
  const aulas = estado.minhaCurimba.aulas.filter((a) => a.data <= hj && a.status).reverse();
  // Sempre começa recolhido (só o título, com a % ao lado); tocar no título expande e recolhe.
  const ab = abertos.has('aula');
  const pres = aulas.filter((a) => a.status === 'p').length;
  const pct = aulas.length ? Math.round((pres / aulas.length) * 100) : 0;
  const cor = aulas.length ? corDaFaixa(pct) : '';
  const tit = cabDobra('aula', '<span aria-hidden="true">🥁</span> Aula de curimba', aulas.length ? `<b class="cur-gira-pct">${pct}%</b>` : '');
  if (!ab) return `<div class="card comp-of cur-gira ${cor}">${tit}</div>`;
  if (!aulas.length) return `<div class="card comp-of cur-gira">${tit}<p class="muted" style="margin:0;font-size:.92rem">Nenhuma aula marcada ainda.</p></div>`;
  return `<div class="card comp-of cur-gira ${cor}">${tit}
    <div class="comp-of-g"><div><b class="cur-gira-pct">${pct}%</b> de presença <span class="muted">· ${pres} de ${aulas.length} aula${aulas.length > 1 ? 's' : ''}</span></div>
      <div class="mp-barra ${cor}"><span style="width:${pct}%"></span></div>
      <div class="mp-lista">${aulas.map((a) => `<div class="mp-l"><span class="mp-dia">${dDM(a.data)}</span><span class="mp-gira">${esc(a.nome) || 'Aula'}</span><span class="mp-st ${a.status}">${a.status === 'p' ? 'Presente' : 'Falta'}</span></div>`).join('')}</div></div></div>`;
}

// Logo depois de "Você nesta gira": os itens das oferendas que a pessoa se comprometeu a doar e ainda não foram entregues,
// e, na oferenda com uma linha por pessoa, o pagamento ou a entrega que faltam. Só aparece quando há algum.
let pediuOferendas = false;
export function cardCompromissos() {
  if (!pode('oferendas:doar')) return '';
  if (estado.oferendas === null) {
    if (!pediuOferendas) { pediuOferendas = true; carregarOferendas(); }
    return '';
  }
  const eu = estado.oferendas.eu || {};
  if (!eu.chave) return '';
  const grupos = compromissosDe(estado.oferendas.oferendas, eu.chave, hoje());
  if (!grupos.length) return '';
  const etq = (k) => `<span class="st-med ${k}">${ROTULO_MEDIUM[k] || k}</span>`;
  return `<div class="card comp-of"><div class="grp-h"><h2><span aria-hidden="true">⚠️</span> Seus compromissos nas oferendas</h2></div>
    ${grupos.map(({ of, itens, linha }) => `<div class="comp-of-g"><div><b>${esc(of.titulo)}</b> <span class="muted">· ${dataBR(of.data)}</span></div>
      ${linha ? `<div class="comp-of-med"><span><span class="muted">Pagamento:</span> ${etq(linha.pagamento)}</span><span><span class="muted">Entrega:</span> ${etq(linha.entrega)}</span></div>` : ''}
      ${itens.length ? `<ul>${itens.map(({ i, q }) => `<li>${esc(i.nome)} <b>${q}</b> <span class="muted">· entrega ${textoEntrega(i)}</span></li>`).join('')}</ul>` : ''}</div>`).join('')}
    <button class="btn link small" data-act="goto" data-tab="oferendas">Ver oferendas ›</button></div>`;
}
