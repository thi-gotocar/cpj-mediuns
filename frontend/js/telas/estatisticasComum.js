// Pedaços das Estatísticas usados no Histórico e no bloco do ano da aba Gira.

import { estado, carregarStPerfis } from '../estado.js';
import { esc } from '../util.js';

export const ATEND = [['preferencial', 'Preferencial'], ['normal', 'Normal'], ['passe', 'Passe']];
export const somaAt = (a) => ATEND.reduce((s, [k]) => s + (Number(a?.[k]) || 0), 0);
export const PRES = ['p', 'na', 'sup'];
// Como cada status aparece na lista gira a gira de uma pessoa.
export const ROT_PRESENCA = { p: '✅ presente', na: '✅ presente', sup: '✅ presente (suporte)', f: '🚫 falta', a: '❌ ausente' };
export const pos = (i) => `<span class="st-pos">${i + 1}º</span>`;
// Presença: só 100% é verde; o tom é próprio (.pleno), para se destacar.
export const corBarraPresenca = (pct) => (pct === 100 ? 'pleno' : pct >= 80 ? 'acc' : pct >= 60 ? 'warn' : 'off');
// Barra com a porcentagem escrita: v de "total" (ex.: 3 presenças em 4 giras = 75%).
export const pctDe = (v, total) => (total ? Math.round((v / total) * 100) : 0);
// A porcentagem fica sempre no centro da barra. cor: classe fixa ou função do percentual; comRotulo: false mostra só a barra.
export const barra = (v, total, cor, comRotulo = true) => {
  const pc = pctDe(v, total);
  const classe = typeof cor === 'function' ? cor(pc) : cor;
  return `<span class="st-bar"${comRotulo ? ` title="${pc}%"` : ''}><i class="${classe}" style="width:${Math.max(pc, 2)}%"></i>${comRotulo ? `<em>${pc}%</em>` : ''}</span>`;
};

// Quadradinhos com o total de atendimentos (Total, Preferencial, Normal, Passe) das giras gs.
export function totaisAtendimento(gs) {
  const tot = Object.fromEntries(ATEND.map(([k]) => [k, gs.reduce((s, g) => s + (Number(g.atendimentos?.[k]) || 0), 0)]));
  return `<div class="st-at-totais" aria-label="Total de atendimentos por tipo">
      <div class="st-at-total fn-total"><b>${somaAt(tot)}</b><span>Total</span></div>
      ${ATEND.map(([k, t]) => `<div class="st-at-total fn-${k}"><b>${tot[k]}</b><span>${t}</span></div>`).join('')}
    </div>`;
}

// Contagens do Perfil (GET /pessoas?lista=perfis): undefined enquanto carrega; null pede a carga.
export function stPerfis() {
  const S = estado.stPerfis;
  if (S === null) carregarStPerfis();
  return S;
}

// Top 3 de um item do Perfil (guia ou orixá), com o % sobre todas as pessoas do cadastro.
// preencheram: quem escolheu algo (no orixá de cabeça a pessoa pode estar em até 3 linhas, por isso vem do servidor).
// nomes (só para quem administra o Perfil): "Ver mais" abre todos os itens com as pessoas de cada um.
export const blocoPerfil = (S, titulo, lista, cor, preencheram = lista.reduce((a, x) => a + x.qtd, 0), nota = '', nomes = null) => {
  const aberto = !!nomes && !!estado.stCabecaMais;
  const top = aberto ? lista : lista.slice(0, 3);
  return `<div class="st-bloco"><h3>${titulo}</h3>
    ${top.length ? `<ol class="st-lista">${top.map((x, i) => `<li>${pos(i)}<span class="st-nome">${esc(x.nome)}</span>${barra(x.qtd, S.total, cor)}<span class="st-num"><b>${x.qtd}</b></span>${aberto && nomes[x.nome] ? `<span class="st-det st-pessoas">${nomes[x.nome].map(esc).join(', ')}</span>` : ''}</li>`).join('')}</ol>
      ${nomes ? `<button class="btn link small" data-act="stcabeca" aria-expanded="${aberto}">${aberto ? 'Ver menos' : 'Ver mais'}</button>` : ''}`
      : '<p class="muted" style="margin:0;font-size:.88rem">Ninguém preencheu ainda.</p>'}
    <p class="muted" style="margin:0;font-size:.8rem">${nota}Do cadastro (Perfil), em qualquer ano · ${preencheram} de ${S.total} pessoa${S.total === 1 ? '' : 's'} preencheram</p></div>`;
};

export const blocoOrixaCabeca = (S) => (S.cabeca
  ? blocoPerfil(S, 'Orixá de cabeça com mais pessoas', S.cabeca, 'or', S.cabecaPessoas, 'Frente, ancestral ou adjunto (cada pessoa conta uma vez por orixá) · ', S.cabecaNomes || null)
  : '');
