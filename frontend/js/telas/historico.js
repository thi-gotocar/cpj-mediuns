// Tela "Histórico": giras salvas, quem já cambonou quem e backup.

import { recebe, ehCambone, ordRecebe, status, presencaDe, daGira, naGira, nomeEntidadeGira, contaNaPresenca, orixaDaGira } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, pessoasComSaidas, girasLista, historicoCompleto, excluirGira, montarBackup, importarBackup, corrigirPresenca, avisar } from '../estado.js';
import { esc, dLong, dShort, hoje, toast, baixar, ajustarRolagem } from '../util.js';
import { botaoResumo, painelResumo, cliquesResumo } from '../compartilharResumo.js';
import { ATEND, somaAt, PRES, ROT_PRESENCA, pos, corBarraPresenca, barra, totaisAtendimento, stPerfis, blocoPerfil, blocoOrixaCabeca } from './estatisticasComum.js';

const linhaAt = (a) => `Atendidos: ${ATEND.map(([k, t]) => `${t} <b>${Number(a[k]) || 0}</b>`).join(' · ')} · Total <b>${somaAt(a)}</b>`;

// Presença da corrente na gira: presentes (presente, não atende, suporte) sobre toda a corrente,
// licenças incluídas (a mesma conta do resumo compartilhado no WhatsApp).
function presencaGira(ps, g) {
  // Encerrada com retrato: quem estava na gira (mesmo quem já saiu do cadastro).
  const sts = daGira(ps, g).filter(contaNaPresenca).map((p) => presencaDe(p, g)).filter((st) => st !== 'pend');   // pendente ainda não conta
  const pres = sts.filter((st) => st === 'p').length;
  return { pres, base: sts.length, pct: sts.length ? Math.round((pres / sts.length) * 100) : null };
}
// Presença: só 100% é verde; o tom é próprio (.pleno), para se destacar.
const corPct = (pct) => (pct === 100 ? 'pleno' : pct >= 80 ? 'rep' : pct >= 60 ? 'hot' : 're');
const seloPct = (pct, title) => `<span class="badge ${corPct(pct)}" style="text-transform:none" title="${title}">${pct}% de presença</span>`;

// ---- Estatísticas (topo do Histórico): rankings de presença e faltas, atendimentos e giras.

function cardEventos(todas) {
  const eventos = todas.filter((g) => g.evento && g.encerrada)
    .sort((a, b) => b.data.localeCompare(a.data));
  if (!eventos.length) return '';
  const participantes = (g) => Number.isInteger(g.participantes) && g.participantes >= 0 ? g.participantes : null;
  const numero = (n) => new Intl.NumberFormat('pt-BR').format(n);
  const ranking = eventos.filter((g) => participantes(g) !== null)
    .sort((a, b) => participantes(b) - participantes(a) || b.data.localeCompare(a.data))
    .slice(0, 3);
  return `<div class="card st"><div class="grp-h"><h2>Eventos</h2><span class="count">${eventos.length} realizado${eventos.length === 1 ? '' : 's'}</span></div>
    <div class="st-grid">
      <div class="st-bloco"><h3>Top 3 com mais participantes</h3>
        ${ranking.length ? `<ol class="st-lista st-eventos-lista">${ranking.map((g, i) => `<li>${pos(i)}<span class="st-nome">${esc(nomeEntidadeGira(g) || 'Evento sem nome')}<span class="st-evento-data">${dShort(g.data)}</span></span><span class="st-num"><b>${numero(participantes(g))}</b> participantes</span></li>`).join('')}</ol>`
          : '<p class="muted" style="margin:0;font-size:.88rem">Ainda não há totais de participantes registrados.</p>'}
      </div>
      <div class="st-bloco"><button class="grp-h dobra" data-act="dobrareventos" aria-expanded="${!!estado.eventosAberto}"><h3>Eventos realizados</h3><span class="count"><span class="seta" aria-hidden="true">${estado.eventosAberto ? '▾' : '▸'}</span></span></button>
        ${estado.eventosAberto ? `<div class="hist st-eventos-hist" data-rolar="3">${eventos.map((g) => `<div class="hi"><div><div class="d">${esc(nomeEntidadeGira(g) || 'Evento sem nome')}</div><span class="muted">${dLong(g.data)}</span></div><span class="st-num">${participantes(g) === null ? 'Participantes não informados' : `<b>${numero(participantes(g))}</b> participantes`}</span></div>`).join('')}</div>` : ''}
      </div>
    </div></div>`;
}

function cardEstatisticas(todas, ps) {
  // Presença, falta e ausência contam giras e eventos; atendimentos e "giras que mais tivemos", só giras.
  const encerradas = todas.filter((g) => g.encerrada);
  if (!encerradas.length) return '';
  const fechadas = encerradas.filter((g) => !g.evento);
  const anos = [...new Set(encerradas.map((g) => g.data.slice(0, 4)))].sort().reverse();
  const anoAtual = hoje().slice(0, 4);
  let ano = estado.stAno || (anos.includes(anoAtual) ? anoAtual : anos[0]);
  if (ano !== 'todos' && !anos.includes(ano)) ano = anos[0];
  const doAno = (lista) => (ano === 'todos' ? lista : lista.filter((g) => g.data.startsWith(ano)));
  const gs = doAno(fechadas);
  const comEventos = doAno(encerradas);
  const nEventos = comEventos.length - gs.length;
  const mais = estado.stMais || {};

  // Por pessoa: presenças, faltas, ausências e giras que contam (sem licença).
  const porPessoa = ps.map((p) => {
    let pres = 0, a = 0, f = 0, base = 0;
    comEventos.forEach((g) => {
      if (!naGira(p, g)) return;   // antes de entrar na corrente (ou fora do retrato da gira)
      const st = presencaDe(p, g);
      if (st === 'lic' || st === 'pend') return;
      base++;
      if (PRES.includes(st)) pres++;
      if (st === 'a') a++;
      if (st === 'f') f++;
    });
    return { p, pres, a, f, base };
  });
  // Tocar no nome mostra gira a gira o que contou para a pessoa (para conferir uma falta, por exemplo).
  const ROT = ROT_PRESENCA;
  const detalhe = (p) => {
    const linhas = comEventos.filter((g) => naGira(p, g)).map((g) => [g, presencaDe(p, g)])
      .filter(([, st]) => st !== 'lic' && st !== 'pend')
      .sort(([a], [b]) => b.data.localeCompare(a.data));
    const fora = comEventos.filter((g) => !naGira(p, g)).length;
    // Admin root: Editar em cada gira (Presente / Falta / Ausente).
    const root = pode('usuarios:gerenciar');
    const linhaDet = ([g, st]) => {
      const k = g.data + '|' + p.id;
      const txt = `${dShort(g.data).slice(0, 5)} ${g.evento ? 'Evento' : ''}${g.evento && nomeEntidadeGira(g) ? ' · ' : ''}${esc(nomeEntidadeGira(g) || (g.evento ? '' : 'Gira'))}: `;
      if (root && estado.stEdit === k) {
        const atual = ['p', 'f', 'a'].includes(st) ? st : 'p';
        return `<span class="st-ed">${txt}<select id="st-ed-sel" aria-label="Presença de ${esc(p.nome)} em ${dShort(g.data)}">${[['p', 'Presente'], ['f', 'Falta'], ['a', 'Ausente']].map(([v, l]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn small primary" data-act="stedok" data-d="${g.data}" data-id="${p.id}">Salvar</button><button class="btn small" data-act="stedcancel">Cancelar</button></span>`;
      }
      return `<span class="${st === 'p' ? '' : 'ruim'}${root ? ' st-l-ed' : ''}"><span>${txt}<b>${ROT[st] || st}</b></span>${root ? `<button class="btn link small" data-act="stedit" data-k="${k}" aria-label="Editar presença em ${dShort(g.data)}">✎ Editar</button>` : ''}</span>`;
    };
    return `<div class="st-det-p">${linhas.map(linhaDet).join('')}
      ${fora ? `<span class="muted">${fora} gira${fora > 1 ? 's' : ''} antes da entrada (${dShort(p.entrada)}) não conta${fora > 1 ? 'm' : ''}.</span>` : ''}</div>`;
  };
  const ranking = (k, titulo, cor, lista, linha) => {
    const limiteInicial = k === 'pres' ? 10 : 5;
    const ordenada = k === 'pres'
      ? [...lista].sort((a, b) => b.pres - a.pres
        || b.pres / b.base - a.pres / a.base
        || a.p.nome.localeCompare(b.p.nome))
      : lista;
    const ver = ordenada.slice(0, mais[k] ? lista.length : limiteInicial);
    const aberto = estado.stPessoa;
    return `<div class="st-bloco"><h3>${titulo}</h3>
      ${lista.length ? `<ol class="st-lista">${ver.map((x, i) => `<li>${pos(i)}<button class="st-nome st-nome-bt" data-act="stpessoa" data-k="${k}:${x.p.id}" title="Ver gira a gira">${esc(x.p.nome)}</button>${barra(x[k], x.base, cor)}<span class="st-num">${linha(x)}</span>${aberto === k + ':' + x.p.id ? detalhe(x.p) : ''}</li>`).join('')}</ol>
      ${lista.length > limiteInicial ? `<button class="btn link small" data-act="stmais" data-k="${k}">${mais[k] ? 'Ver menos' : `Ver mais (${lista.length})`}</button>` : ''}`
      : '<p class="muted" style="margin:0;font-size:.88rem">Ninguém por aqui.</p>'}</div>`;
  };
  const presentes = porPessoa.filter((x) => x.pres).sort((a, b) => b.pres - a.pres || a.p.nome.localeCompare(b.p.nome));
  const faltas = porPessoa.filter((x) => x.f).sort((a, b) => b.f - a.f || a.p.nome.localeCompare(b.p.nome));
  const ausencias = porPessoa.filter((x) => x.a).sort((a, b) => b.a - a.a || a.p.nome.localeCompare(b.p.nome));

  // Top 5 giras com mais atendidos.
  const giraComAt = gs.filter((g) => g.atendimentos && somaAt(g.atendimentos) > 0);
  const comAt = [...giraComAt]
    .sort((a, b) => somaAt(b.atendimentos) - somaAt(a.atendimentos) || b.data.localeCompare(a.data)).slice(0, 5);
  // Top 5 linhas/tipos com maior média por gira (gira sem atendidos registrados não entra na conta).
  const grupos = {};
  giraComAt.forEach((g) => { (grupos[nomeEntidadeGira(g) || 'Gira'] ||= []).push(g); });
  const medias = Object.entries(grupos).map(([n, l]) => ({ n, qtd: l.length, media: l.reduce((s, g) => s + somaAt(g.atendimentos), 0) / l.length,
    porTipo: ATEND.map(([k, t]) => `${t} ${Math.round(l.reduce((s, g) => s + (Number(g.atendimentos[k]) || 0), 0) / l.length)}`).join(' · ') }))
    .sort((a, b) => b.media - a.media || b.qtd - a.qtd || a.n.localeCompare(b.n)).slice(0, 5);
  const maiorMedia = medias[0]?.media || 0;   // a barra compara com a maior média da lista
  const fmtMedia = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const totAt = Object.fromEntries(ATEND.map(([k]) => [k, gs.reduce((s, g) => s + (Number(g.atendimentos?.[k]) || 0), 0)]));
  const maxAt = somaAt(totAt);   // % de cada gira sobre o total de atendidos do período
  // Top 3 giras (linha/tipo) que mais tivemos.
  const cont = {};
  gs.forEach((g) => { const n = nomeEntidadeGira(g); if (n) cont[n] = (cont[n] || 0) + 1; });
  const tipos = Object.entries(cont).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
  const maxTipo = gs.length;   // % sobre as giras do período
  // Média de presença da corrente no período (giras e eventos com presença confirmada).
  const pcts = comEventos.map((g) => presencaGira(ps, g).pct).filter((x) => x !== null);
  const media = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const giraAt = gs.filter((g) => g.atendimentos).length;

  return `<div class="card st"><div class="grp-h"><h2>Estatísticas</h2>
      <select data-act="stano" aria-label="Período das estatísticas">${anos.map((a) => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}<option value="todos" ${ano === 'todos' ? 'selected' : ''}>Todos os anos</option></select></div>
    <p class="muted" style="margin:0;font-size:.85rem">${gs.length} gira${gs.length === 1 ? '' : 's'} encerrada${gs.length === 1 ? '' : 's'}${nEventos ? ` e ${nEventos} evento${nEventos === 1 ? '' : 's'}` : ''} ${ano === 'todos' ? 'no total' : `em ${ano}`}.</p>
    <div class="st-resumo">
      <div class="st-resumo-at"><span class="muted">Total de atendimentos${giraAt ? ` · ${giraAt} gira${giraAt === 1 ? '' : 's'} com registro` : ''}</span>
        ${totaisAtendimento(gs)}</div>
      <div><span class="muted">Média de presença da corrente</span>${media !== null ? `<b class="st-grande">${media}%</b>${barra(media, 100, corBarraPresenca)}` : '<b class="st-grande">—</b>'}</div>
    </div>
    <div class="st-grid">
      ${ranking('pres', 'Mais presentes', corBarraPresenca, presentes, (x) => `<b>${x.pres}</b> de ${x.base}`)}
      <div class="st-ausencias">
        ${ranking('f', 'Mais faltas', 'off', faltas, (x) => `<b>${x.f}</b>`)}
        ${ranking('a', 'Mais ausências', 'off', ausencias, (x) => `<b>${x.a}</b>`)}
      </div>
      <div class="st-bloco"><h3>Giras com mais atendimentos</h3>
        ${comAt.length ? `<ol class="st-lista">${comAt.map((g, i) => `<li>${pos(i)}<span class="st-nome"><span class="hi-gira">${esc(nomeEntidadeGira(g) || 'Gira')}</span></span>${barra(somaAt(g.atendimentos), maxAt, 'acc')}<span class="st-num"><b>${somaAt(g.atendimentos)}</b></span>
          <span class="st-det">${dShort(g.data)} · ${ATEND.map(([k, t]) => `${t} ${Number(g.atendimentos[k]) || 0}`).join(' · ')}</span></li>`).join('')}</ol>`
          : '<p class="muted" style="margin:0;font-size:.88rem">Nenhuma gira com atendidos registrados.</p>'}</div>
      <div class="st-bloco"><h3>Giras com maior média de atendimentos</h3>
        ${medias.length ? `<ol class="st-lista">${medias.map((x, i) => `<li>${pos(i)}<span class="st-nome"><span class="hi-gira">${esc(x.n)}</span></span>${barra(x.media, maiorMedia, 'acc', false)}<span class="st-num"><b>${fmtMedia.format(x.media)}</b></span>
          <span class="st-det">${x.qtd} gira${x.qtd > 1 ? 's' : ''} · ${x.porTipo}</span></li>`).join('')}</ol>`
          : '<p class="muted" style="margin:0;font-size:.88rem">Nenhuma gira com atendidos registrados.</p>'}</div>
      <div class="st-bloco"><h3>Giras que mais tivemos</h3>
        ${tipos.length ? `<ol class="st-lista">${tipos.map(([n, q], i) => `<li>${pos(i)}<span class="st-nome">${esc(n)}</span>${barra(q, maxTipo, 'or')}<span class="st-num"><b>${q}</b></span></li>`).join('')}</ol>`
          : '<p class="muted" style="margin:0;font-size:.88rem">Nenhuma gira com nome definido.</p>'}</div>
      ${blocosPerfis()}
    </div></div>`;
}

// Guia chefe, guia de frente, orixá de frente e orixá de cabeça (frente, ancestral ou adjunto) com mais pessoas
// (top 3), do cadastro (aba Perfil): não depende do ano; o percentual é sobre todas as pessoas do cadastro.
function blocosPerfis() {
  const S = stPerfis();
  if (!S || S.erro) return S?.erro ? `<p class="muted" style="margin:0;font-size:.88rem">${esc(S.erro)}</p>` : '';
  return blocoPerfil(S, 'Guia chefe com mais pessoas', S.chefe, 'acc') + blocoPerfil(S, 'Guia de frente com mais pessoas', S.frente, 'acc')
    + blocoPerfil(S, 'Orixá de frente com mais pessoas', S.orixa, 'or') + blocoOrixaCabeca(S);
}

export function render() {
  setTimeout(ajustarRolagem, 0);
  // O bloco Eventos (cadastrar e eventos cadastrados) fica na aba Gira.
  let h = `<section class="panel">`;
  if (!pode('historico:ver')) return h + '</section>';
  // A abertura traz só os últimos 12 meses: o Histórico baixa o resto (aviso enquanto não chega).
  const completo = historicoCompleto();
  if (!completo) h += '<div class="card"><p class="muted" style="margin:0">Carregando as giras mais antigas…</p></div>';
  const gs = girasLista().sort((a, b) => b.data.localeCompare(a.data));
  const ps = pessoasComSaidas().filter(contaNaPresenca);   // curimba fica fora da presença
  h += cardEstatisticas(gs, ps);
  h += cardEventos(gs);
  h += blocoGirasSalvas(gs, ps);

  const ativas = ps.filter((p) => !p.saida);
  const meds = ativas.filter(recebe).sort(ordRecebe);
  const cams = ativas.filter(ehCambone);
  if (meds.length && cams.length && gs.some((g) => (g.pares || []).length)) {
    const cnt = {};
    gs.forEach((g) => (g.pares || []).forEach((p) => { const k = p.m + '|' + p.c; cnt[k] = (cnt[k] || 0) + 1; }));
    const usados = cams.filter((c) => meds.some((m) => cnt[m.id + '|' + c.id]));
    const camAberto = !!estado.cambAberto;
    h += `<div class="card"><button class="grp-h dobra" data-act="dobrarcamb" aria-expanded="${camAberto}"><h2>Quem já cambonou quem</h2><span class="count"><span class="seta" aria-hidden="true">${camAberto ? '▾' : '▸'}</span></span></button>`;
    if (camAberto) h += `<p class="muted" style="margin:0;font-size:.9rem">Vezes que cada cambone acompanhou cada médium, em todas as giras.</p>
      <div class="matrix"><table><thead><tr><th></th>${usados.map((c) => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead><tbody>
      ${meds.map((m) => `<tr><th class="rh">${esc(m.nome)}</th>${usados.map((c) => { const n = cnt[m.id + '|' + c.id] || 0; return `<td class="${n === 0 ? 'z' : n === 1 ? 'h1' : 'h2'}">${n || '·'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
    h += '</div>';
  }

  return h + '</section>';
}

// Bloco "Giras salvas": vem sempre minimizado (estado.salvasAberto volta a false ao entrar na aba Histórico).
function blocoGirasSalvas(gs, ps) {
  const ab = !!estado.salvasAberto;
  let h = `<div class="card"><button class="grp-h dobra" data-act="dobrarsalvas" aria-expanded="${ab}" aria-label="${ab ? 'Minimizar' : 'Expandir'} Giras salvas">
    <h2><span aria-hidden="true">🗂️</span> Giras salvas</h2><span class="count">${gs.length} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
  if (!ab) return h + '</div>';
  // (Cadastrar gira antiga e Cadastrar escala, só do admin root, ficam na aba Admin root.)
  // Soma dos atendidos de todas as giras que têm o registro.
  const comAt = gs.filter((g) => !g.evento && g.atendimentos);
  if (comAt.length) {
    const tot = Object.fromEntries(ATEND.map(([k]) => [k, comAt.reduce((s, g) => s + (Number(g.atendimentos[k]) || 0), 0)]));
    h += `<p class="muted" style="margin:0;font-size:.9rem">Em ${comAt.length} gira${comAt.length === 1 ? '' : 's'} · ${linhaAt(tot)}</p>`;
  }
  // Média de presença da corrente em todas as giras salvas.
  const pcts = gs.map((g) => presencaGira(ps, g).pct).filter((x) => x !== null);
  if (pcts.length) {
    const media = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    h += `<p class="muted" style="margin:0;font-size:.9rem">Presença média da corrente: ${seloPct(media, 'Média das giras salvas')}</p>`;
  }
  if (!gs.length) h += `<p class="muted">Nenhuma gira ainda.</p>`;
  else {
    h += `<div class="hist" data-rolar="3">`;
    gs.forEach((g) => {
      // Presentes = quem esteve na gira (presente, não atende ou suporte).
      const n = (...sts) => daGira(ps, g).filter((p) => contaNaPresenca(p) && sts.includes(status(p, g))).length;
      const nLic = n('lic');
      const conf = estado.confirm === 'g:' + g.data;
      const pr = presencaGira(ps, g);
      h += `<div class="hi"><div><div class="d"><span class="hi-gira">${esc(nomeEntidadeGira(g) || 'Gira não definida')}${orixaDaGira(g) ? ` · ${esc(orixaDaGira(g))}` : ''}</span>
        ${esc(dLong(g.data))} <span class="muted" style="font-weight:400">${dShort(g.data).slice(-4)}</span>
        ${pr.pct !== null ? seloPct(pr.pct, `${pr.pres} de ${pr.base} da corrente${nLic ? ` (${nLic} de licença)` : ''}`) : ''}</div>
        <div class="muted" style="font-size:.9rem">${n('p', 'na', 'sup')} presentes · ${n('a')} ausentes · ${n('f')} faltas${nLic ? ` · ${nLic} de licença` : ''}${g.encerrada ? ' · <span class="badge rep">encerrada</span>' : ''}</div>
        ${g.evento ? `<div style="font-size:.9rem"><b>Participantes:</b> ${Number.isInteger(g.participantes) ? new Intl.NumberFormat('pt-BR').format(g.participantes) : 'não informado'}</div>`
          : g.atendimentos ? `<div style="font-size:.9rem">${linhaAt(g.atendimentos)}</div>` : ''}</div>
        <div class="acts"><button class="btn small" data-act="abrir" data-d="${g.data}">Abrir</button>
        ${pode('giras:excluir') ? (conf ? `<button class="btn small danger" data-act="delgira" data-d="${g.data}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="g:${g.data}">Excluir</button>`) : ''}</div>
        ${g.encerrada && pode('escala:completa') ? `<div class="hi-rs">${botaoResumo(g)}${painelResumo(g)}</div>` : ''}</div>`;
    });
    h += `</div>`;
  }
  return h + '</div>';
}

export const cliques = {
  ...cliquesResumo,
  stedit(el) { estado.stEdit = el.dataset.k; avisar(); },
  stedcancel() { estado.stEdit = null; avisar(); },
  async stedok(el) {
    const v = document.getElementById('st-ed-sel')?.value;
    if (!v) return;
    estado.stEdit = null;
    await corrigirPresenca(el.dataset.d, el.dataset.id, v);
  },
  dobrarcamb() { estado.cambAberto = !estado.cambAberto; avisar(); },
  dobrarsalvas() { estado.salvasAberto = !estado.salvasAberto; avisar(); },
  dobrareventos() { estado.eventosAberto = !estado.eventosAberto; avisar(); },
  stcabeca() { estado.stCabecaMais = !estado.stCabecaMais; avisar(); },
  stpessoa(el) { estado.stPessoa = estado.stPessoa === el.dataset.k ? null : el.dataset.k; avisar(); },
  stmais(el) { estado.stMais = { ...(estado.stMais || {}), [el.dataset.k]: !(estado.stMais || {})[el.dataset.k] }; avisar(); },
  abrir(el) { prefs.data = el.dataset.d; prefs.tab = 'agenda'; salvarPrefs(); avisar(); window.scrollTo(0, 0); },
  delgira(el) { estado.confirm = null; excluirGira(el.dataset.d); },
};

export function corpoBackup() {
  return `<p class="muted" style="margin:0;font-size:.9rem">Os dados ficam no banco da corrente. O backup é uma cópia extra em arquivo; “Restaurar” também importa o backup da versão anterior do app (a que salvava no aparelho).</p>
    <div class="row"><button class="btn" data-act="backup">Baixar backup</button>
    <label class="btn" for="f-import" style="cursor:pointer">Restaurar backup</label><input type="file" id="f-import" accept="application/json,.json" hidden></div>`;
}

export const cliquesBackup = {
  backup() {
    baixar(new Blob([JSON.stringify(montarBackup(), null, 1)], { type: 'application/json' }), 'sort-mediuns-backup-' + hoje() + '.json');
  },
};

export const mudancas = {
  stano(t) { estado.stAno = t.value; estado.stMais = {}; avisar(); },
};

export async function restaurar(arquivo) {
  try {
    const obj = JSON.parse(await arquivo.text());
    if (!obj || typeof obj.pessoas !== 'object' || typeof obj.giras !== 'object') throw new Error('formato');
    if (!confirm('Importar este backup? Pessoas que faltam serão criadas e as giras do arquivo substituem as de mesma data.')) return;
    const r = await importarBackup(obj);
    toast(`Importado: ${r.pessoasCriadas} pessoas novas e ${r.giras} giras.`);
  } catch (e) {
    toast(e.message === 'formato' || e instanceof SyntaxError ? 'Arquivo de backup inválido.' : e.message);
  }
}
