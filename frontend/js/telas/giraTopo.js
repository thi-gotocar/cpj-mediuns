// Cards pessoais e de informação das abas Geral e Gira.

import { estado, pode, carregarOferendas, acaoOracoes, avisar } from '../estado.js';
import { esc, dDM, toast, hoje, pd } from '../util.js';
import { eventosDoTopo, proximosEventos, orixasDoDia, dataCurta, TIPO_EVENTO_LABEL } from '/shared/eventos.js';
import { corDaFaixa } from './curimba.js';
import { textoEntrega, dataBR, ROTULO_MEDIUM, compromissosDe } from '/shared/oferendas.js';
import { abertos, cabDobra, ICONE_WHATS } from './giraComum.js';

// Aba Gira: gira dos próximos 30 dias, evento e aviso todos os futuros, amaci só da semana.
export function cardSemana({ ocultarAvisos = false } = {}) {
  const hj = hoje();
  const eventos = ocultarAvisos ? estado.eventos.filter((e) => e.tipo !== 'aviso') : estado.eventos;
  // Orixás (DIAS_ORIXAS): só no próprio dia. Aniversariantes (dia/mês do Perfil, com 🎈🎂 antes do nome): de ontem, hoje e amanhã.
  // No mesmo dia: eventos, depois orixás, depois aniversários.
  const ordem = (e) => (e.niver ? 2 : e.orixa ? 1 : 0);
  const prox = proximosEventos(eventos, hj);
  const evs = ocultarAvisos
    ? [...new Set([...eventosDoTopo(eventos, hj), ...prox])].sort((a, b) => a.data.localeCompare(b.data))
    : [...new Set([...eventosDoTopo(eventos, hj), ...prox]), ...orixasDoDia(hj), ...aniversariosPerto(hj)].sort((a, b) => a.data.localeCompare(b.data) || ordem(a) - ordem(b));
  // Cada evento: "folhinha" com o dia da semana (ou HOJE) e a data, o nome e o tipo num selo à direita.
  const semana = (d) => (d === hj ? 'Hoje' : pd(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase()));
  const tipo = (e) => (e.niver ? ['niver', 'Aniversário'] : e.orixa ? ['orixa', 'Orixá'] : [e.tipo || 'evento', TIPO_EVENTO_LABEL[e.tipo] || 'Evento']);
  // Mostra os três próximos; "Ver mais" mostra todos e "Ver menos" volta.
  const todos = !!estado.evsTodos;
  const lista = todos ? evs : evs.slice(0, 3);
  const mais = evs.length > 3 ? `<button class="btn link small evs-mais" data-act="evsmais" aria-expanded="${todos}">${todos ? 'Ver menos' : 'Ver mais'}</button>` : '';
  return `<div class="card ev-semana"><div class="grp-h"><h2 class="evs-tit"><span aria-hidden="true">📅</span> Eventos</h2><span class="or-cab-d">${mais}${evs.length ? `<span class="evs-qtd">${evs.length}</span>` : ''}</span></div>
    ${lista.length ? `<div class="evs-lista">${lista.map((e) => { const [k, rot] = tipo(e); return `<div class="evs-l${e.data === hj ? ' hoje' : ''}">
        <span class="evs-data"><span class="evs-sem">${semana(e.data)}</span><b>${dataCurta(e.data)}</b></span>
        <span class="evs-nome">${e.niver ? '<span class="evs-niver" aria-hidden="true">🎈🎂</span> ' : ''}${esc(e.nome)}</span>
        <span class="evs-tipo ${k}">${rot}</span></div>`; }).join('')}</div>`
      : '<p class="muted" style="margin:0;font-size:.88rem">Nenhum evento cadastrado.</p>'}</div>`;
}

// Orações (logo abaixo dos Eventos): qualquer pessoa logada pede; cada uma vale 7 dias e depois some.
// Quem pediu (ou o admin dos eventos) exclui, com confirmação.
export function cardOracoes() {
  const L = estado.oracoes || [];
  const aberto = !!estado.oraNova;
  const expandido = abertos.has('oracoes');
  // Admin da aba Gira: WhatsApp com a imagem dos pedidos (abre uma janela com a prévia).
  const wa = L.length && pode('giras:editar') ? `<button class="btn small or-wa" data-act="oraabrir" title="Mandar os pedidos de oração no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> WhatsApp</button>` : '';
  let h = `<div class="card ev-semana or-card"><div class="or-cab"><button class="grp-h dobra or-dobra" data-act="dobrarcard" data-k="oracoes" aria-expanded="${expandido}">
    <h2 class="evs-tit"><span aria-hidden="true">❤️</span> Orações</h2><span class="count">${L.length} <span class="seta" aria-hidden="true">${expandido ? '▾' : '▸'}</span></span></button>${wa}</div>`;
  if (expandido && L.length) {
    h += `<div class="evs-lista or-lista">${L.map((o) => {
      const conf = estado.confirm === 'or:' + o.id;
      const bt = !o.apagar ? '' : conf
        ? `<button class="btn danger or-bt" data-act="oraexcluir" data-id="${o.id}">Confirmar</button>`
        : `<button class="btn or-bt" data-act="askdel" data-k="or:${o.id}">Excluir</button>`;
      const n = o.reacoes || 0;
      const vela = `<button class="btn or-bt or-vela${o.reagi ? ' on' : ''}" data-act="orareagir" data-id="${o.id}" aria-pressed="${!!o.reagi}"
          title="${o.reagi ? 'Apagar minha vela' : 'Acender uma vela por este pedido'}"><span aria-hidden="true">🕯️</span> ${n}</button>`;
      return `<div class="evs-l or-l"><span class="evs-nome or-txt">${esc(o.texto)}</span>
        <span class="or-dir">${vela}${bt}</span></div>`;
    }).join('')}</div>`;
  } else if (expandido) h += '<p class="muted" style="margin:0;font-size:.88rem">Nenhum pedido de oração nos últimos 7 dias.</p>';
  if (expandido) h += aberto
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

// Aniversários de ontem, hoje e amanhã, cada um na própria data.
function aniversariosPerto(hj) {
  const d = pd(hj);
  const dias = [-1, 0, 1].map((k) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  });
  return dias.flatMap((data) => estado.pessoas.filter((p) => p.aniversario === data.slice(5)).map((p) => ({ data, nome: p.nome, niver: true })))
    .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Aula de curimba (só para quem está nos alunos da aba Curimba): presença e faltas nas aulas até hoje.
// Mesmo padrão de "Seus compromissos" (faixa à esquerda, aqui na cor da % de presença); fica logo acima de "Sua presença".
// A % conta só as aulas marcadas, como na aba Curimba.
export function cardAulaCurimba() {
  if (!estado.minhaCurimba) {
    if (estado.me?.papel === 'root' && estado.visaoRoot === 'curimba') {
      return '<div class="card comp-of cur-gira"><h2>🥁 Aula de curimba</h2><p class="muted" style="margin:0;font-size:.92rem">A presença individual aparece ao entrar com o acesso de um aluno.</p></div>';
    }
    return '';
  }
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

// Na aba Gira: os itens das oferendas que a pessoa se comprometeu a doar e ainda não foram entregues,
// e, na oferenda com uma linha por pessoa, o pagamento ou a entrega que faltam. Só aparece quando há algum.
export function cardCompromissos() {
  if (!pode('oferendas:doar')) return '';
  if (estado.oferendas === null) {
    carregarOferendas();
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
