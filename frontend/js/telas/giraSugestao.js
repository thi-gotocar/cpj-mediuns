// Aba Gira: bloco "Sugestão Mi/Mãe Vê" do card do admin.

import { LINHA_LABEL, sugestoesDaGira } from '/shared/regras.js';
import { estado, pode, girasLista, carregarPerfil } from '../estado.js';
import { esc } from '../util.js';

// Admin: "Sugestão Mi/Mãe Vê" — quem marcou no Perfil que se sente confiante na entidade da gira,
// em dois blocos (Passe e Atendimento extra): tabela Nome (com rótulos e entidade) | oferendas feitas (orixá de frente,
// ancestral, adjunto, guia chefe e guia de frente — só para quem vê o perfil de todos) | % de presença no ano | giras da linha,
// 5 linhas à vista e o resto com rolagem.
const corPres = (pct) => (pct >= 80 ? 'ok' : pct >= 60 ? 'medio' : 'baixo');
const OFERENDAS_SUG = [['frente', 'Fr', 'Orixá de frente'], ['ancestral', 'An', 'Orixá ancestral'], ['adjunto', 'Ad', 'Orixá adjunto'],
  ['chefe', 'Ch', 'Guia chefe'], ['guiaFrente', 'Fe', 'Guia de frente']];
// Perfil de todos ({ pessoaId: perfil }) para as colunas de oferendas; busca uma vez se ainda não veio.
let pedindoPerfil = false;
function perfisDaCorrente() {
  if (!pode('perfil:corrente')) return null;
  if (estado.perfil === null) {
    if (!pedindoPerfil) { pedindoPerfil = true; carregarPerfil().finally(() => { pedindoPerfil = false; }); }
    return null;
  }
  const t = estado.perfil?.todos;
  return Array.isArray(t) ? Object.fromEntries(t.map((x) => [x.pessoaId, x.perfil])) : null;
}
function linhaSugestao(x, linha, ano) {
  // Segunda linha do nome: rótulos Guia chefe / Guia de frente e, ao lado, o nome da entidade (cortado com "…" se não couber).
  const sub = [...x.guias.map((t) => `<span class="sug-tag${t === 'Guia chefe' ? ' chefe' : ''}">${t}</span>`),
    x.temNome ? `<span class="sug-ent" title="${esc(x.entidade)}">${esc(x.entidade)}</span>` : ''].join('');
  const tags = sub ? `<span class="sug-tags">${sub}</span>` : '';
  const pres = x.pct === null ? '<span class="sug-pct vazio" title="Sem giras no ano">—</span>'
    : `<span class="sug-pct ${corPres(x.pct)}" title="${x.pres} de ${x.base} gira${x.base > 1 ? 's' : ''} em ${ano}"><b>${x.pct}%</b><i style="--p:${x.pct}%"></i></span>`;
  const n = `<span class="sug-n${x.nGiras ? '' : ' zero'}" title="${x.nGiras} gira${x.nGiras === 1 ? '' : 's'} de ${esc(linha)}">${x.nGiras}</span>`;
  const ofs = x.oferendas ? OFERENDAS_SUG.map(([k, , t]) => (x.oferendas[k]
    ? `<span class="sug-of sim" title="${t}: oferenda feita" aria-label="${t}: sim">✓</span>`
    : `<span class="sug-of nao" title="${t}: oferenda não feita" aria-label="${t}: não">✕</span>`)).join('') : '';
  return `<div class="sug-l${x.oferendas ? ' com-of' : ''}"><span class="sug-nome"><span class="sug-nm">${esc(x.nome)}</span>${tags}</span>${ofs}${pres}${n}</div>`;
}
// Última parte do card do admin (Presença · Sorteio · Sugestão). Vem recolhida, com o título e o total de Passe e At. Extra; tocar expande e recolhe.
export const sugAbertas = new Set();
const subtitulo = (t, k, n) => `<div class="sug-sub ${k}"><h3>${t}</h3><span class="sug-qtd">${n}</span></div>`;
export function blocoSugestao(ps, g) {
  const sug = sugestoesDaGira(ps, g, girasLista(), perfisDaCorrente());
  const linha = sug ? LINHA_LABEL[sug.linha] || '' : '';
  const ab = sugAbertas.has(g.data);
  const cabSug = `<button class="grp-h dobra" data-act="dobrarsug" aria-expanded="${ab}"><h2><span aria-hidden="true">💡</span> Sugestão Mi/Mãe Vê</h2><span class="count">${sug ? `<span class="sug-linha">${esc(linha)}</span>` : ''}<span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;
  if (!ab) return `<div class="adm-sec sugestao">${cabSug}${sug ? `<div class="sug-resumo" data-act="dobrarsug">${subtitulo('Passe', 'passe', sug.passe.length)}${subtitulo('Atendimento extra', 'extra', sug.extra.length)}</div>` : ''}</div>`;
  const comOf = !!sug && [...sug.passe, ...sug.extra].some((x) => x.oferendas);
  const cabGiras = `<span class="sug-cab-g${linha.length > 14 ? ' mlongo' : linha.length > 9 ? ' longo' : ''}">Giras de ${esc(linha)}</span>`;
  const cab = comOf
    ? `<div class="sug-l sug-cab com-of" aria-hidden="true"><span class="c-nome">Nome</span><span class="c-gx">Orixá</span><span class="c-gg">Guia</span>
      ${OFERENDAS_SUG.map(([, s], i) => `<span class="c-o c-o${i + 1}">${s}</span>`).join('')}<span class="c-pres">Pres.</span>${cabGiras}</div>`
    : `<div class="sug-l sug-cab" aria-hidden="true"><span>Nome</span><span>Pres.</span>${cabGiras}</div>`;
  const corpo = !sug
    ? '<p class="muted" style="margin:0;font-size:.88rem">Escolha a entidade da gira para ver as sugestões.</p>'
    : [['Passe', sug.passe, 'passe'], ['Atendimento extra', sug.extra, 'extra']].map(([t, lista, k]) => `<div class="grp sug-grp">${subtitulo(t, k, lista.length)}
      ${lista.length ? `<div class="sug-lista">${cab}${lista.map((x) => linhaSugestao(x, linha, g.data.slice(0, 4))).join('')}</div>`
        : '<p class="muted sug-vazio">Ninguém marcou esta entidade.</p>'}</div>`).join('');
  return `<div class="adm-sec sugestao">${cabSug}${corpo}
    ${sug ? `<p class="sug-leg">${comOf ? 'Oferendas: Fr = orixá de frente · An = ancestral · Ad = adjunto · Ch = guia chefe · Fe = guia de frente<br>' : ''}Pres. = presença em ${g.data.slice(0, 4)} · Giras de ${esc(linha)} = em quantas esteve presente</p>` : ''}</div>`;
}
