// Aba Gira: bloco do ano no topo, para todos. Total de atendimentos (do ano ou do mês escolhido), a presença de quem está
// logado (tocar abre gira a gira) e o orixá de cabeça com mais pessoas — os mesmos números do Histórico.

import { presencaDe, naGira, contaNaPresenca, nomeEntidadeGira } from '/shared/regras.js';
import { estado, girasLista, avisar } from '../estado.js';
import { esc, dShort, hoje } from '../util.js';
import { PRES, ROT_PRESENCA, barra, corBarraPresenca, totaisAtendimento, stPerfis, blocoOrixaCabeca } from './estatisticasComum.js';

// Presença de quem está logado nas giras e eventos encerrados do ano (licença e pendente não contam).
function minhaPresenca(encerradas) {
  const p = estado.me?.pessoaId && estado.pessoas.find((x) => x.id === estado.me.pessoaId);
  if (!p || !contaNaPresenca(p)) return '';
  const linhas = encerradas.filter((g) => naGira(p, g)).map((g) => [g, presencaDe(p, g)])
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

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Totais de atendimento do período escolhido (ano inteiro ou um mês; começa no ano corrente). Só giras encerradas.
function totaisDoPeriodo() {
  const atual = hoje().slice(0, 4);
  const fechadas = girasLista().filter((g) => g.encerrada && !g.evento);
  const anos = [...new Set([atual, ...fechadas.map((g) => g.data.slice(0, 4))])].sort().reverse();
  const ano = anos.includes(estado.atAno) ? estado.atAno : atual;
  // No ano corrente, só os meses até o atual.
  const ultimoMes = ano === atual ? Number(hoje().slice(5, 7)) : 12;
  const mes = Number(estado.atMes) >= 1 && Number(estado.atMes) <= ultimoMes ? Number(estado.atMes) : 0;   // 0 = ano todo
  const prefixo = ano + (mes ? '-' + String(mes).padStart(2, '0') : '');
  const gs = fechadas.filter((g) => g.data.startsWith(prefixo));
  return `<div class="ano-sec"><div class="ano-filtro"><span class="muted">Total de atendimentos</span>
      <select data-act="atmes" aria-label="Mês dos atendimentos"><option value="0">Ano todo</option>${MESES.slice(0, ultimoMes).map((m, i) => `<option value="${i + 1}" ${i + 1 === mes ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <select data-act="atano" aria-label="Ano dos atendimentos">${anos.map((a) => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
    ${totaisAtendimento(gs)}
    <span class="muted ano-nota">${gs.length ? `${gs.length} gira${gs.length === 1 ? '' : 's'} encerrada${gs.length === 1 ? '' : 's'}` : 'Nenhuma gira encerrada neste período'}</span></div>`;
}

export function cardAno() {
  const ano = hoje().slice(0, 4);
  const encerradas = girasLista().filter((g) => g.encerrada && g.data.startsWith(ano));
  const S = stPerfis();
  const orixa = S && !S.erro ? blocoOrixaCabeca(S) : '';
  return `<div class="card st ano">${totaisDoPeriodo()}
    ${minhaPresenca(encerradas)}
    ${orixa ? `<div class="ano-sec">${orixa}</div>` : ''}</div>`;
}

export const cliquesAno = {
  anopres() { estado.anoPresAberto = !estado.anoPresAberto; avisar(); },
  stcabeca() { estado.stCabecaMais = !estado.stCabecaMais; avisar(); },
};

export const mudancasAno = {
  atano(t) { estado.atAno = t.value; avisar(); },
  atmes(t) { estado.atMes = t.value; avisar(); },
};
