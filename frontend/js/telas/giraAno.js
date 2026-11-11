// Aba Gira: bloco do ano no topo, para todos. Total de atendimentos do ano, a presença de quem está
// logado (tocar abre gira a gira) e o orixá de cabeça com mais pessoas — os mesmos números do Histórico.

import { presencaDe, naCorrenteEm, contaNaPresenca, nomeEntidadeGira } from '/shared/regras.js';
import { estado, girasLista, avisar } from '../estado.js';
import { esc, dShort, hoje } from '../util.js';
import { PRES, ROT_PRESENCA, barra, corBarraPresenca, totaisAtendimento, stPerfis, blocoOrixaCabeca } from './estatisticasComum.js';

// Presença de quem está logado nas giras e eventos encerrados do ano (licença e pendente não contam).
function minhaPresenca(encerradas) {
  const p = estado.me?.pessoaId && estado.pessoas.find((x) => x.id === estado.me.pessoaId);
  if (!p || !contaNaPresenca(p)) return '';
  const linhas = encerradas.filter((g) => naCorrenteEm(p, g.data)).map((g) => [g, presencaDe(p, g)])
    .filter(([, st]) => st !== 'lic' && st !== 'pend')
    .sort(([a], [b]) => b.data.localeCompare(a.data));
  const pres = linhas.filter(([, st]) => PRES.includes(st)).length;
  const aberto = !!estado.anoPresAberto;
  const lista = !aberto ? '' : linhas.length
    ? `<div class="ano-giras">${linhas.map(([g, st]) => `<div class="ano-gira${PRES.includes(st) ? '' : ' ruim'}"><span class="ano-d">${dShort(g.data).slice(0, 5)}</span>
        <span class="ano-n">${esc(nomeEntidadeGira(g) || (g.evento ? 'Evento' : 'Gira'))}</span><b class="ano-st">${ROT_PRESENCA[st] || st}</b></div>`).join('')}</div>`
    : '<p class="muted" style="margin:0;font-size:.85rem">Nenhuma gira encerrada que conte para você neste ano.</p>';
  return `<div class="ano-sec"><button class="ano-eu" data-act="anopres" aria-expanded="${aberto}" title="Ver gira a gira">
      <span class="st-nome">${esc(p.nome)}</span>${linhas.length ? barra(pres, linhas.length, corBarraPresenca) : '<span></span>'}
      <span class="st-num"><b>${pres}</b>/${linhas.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
    <span class="muted ano-nota">Sua presença nas giras e eventos encerrados${linhas.length ? '' : ' (nenhum ainda)'}</span>
    ${lista}</div>`;
}

export function cardAno() {
  const ano = hoje().slice(0, 4);
  const encerradas = girasLista().filter((g) => g.encerrada && g.data.startsWith(ano));
  const giras = encerradas.filter((g) => !g.evento);
  const S = stPerfis();
  const orixa = S && !S.erro ? blocoOrixaCabeca(S) : '';
  return `<div class="card st ano"><div class="ano-sec"><span class="muted">Total de atendimentos em ${ano}</span>${totaisAtendimento(giras)}</div>
    ${minhaPresenca(encerradas)}
    ${orixa ? `<div class="ano-sec">${orixa}</div>` : ''}</div>`;
}

export const cliquesAno = {
  anopres() { estado.anoPresAberto = !estado.anoPresAberto; avisar(); },
  stcabeca() { estado.stCabecaMais = !estado.stCabecaMais; avisar(); },
};
