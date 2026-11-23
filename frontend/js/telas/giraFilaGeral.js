// Bloco da fila de senhas na aba Geral, para quem está logado mas não é da corrente (alunos, consulentes, grupo
// Oferenda): eles não têm a aba Gira. Aparece só quando há fila hoje (pergunta à mesma rota pública da página /fila)
// e leva para /fila dentro do próprio app, já com o login (no iPhone, o app instalado não divide o login com o Safari).
// Com senha, mostra a senha e quantas pessoas estão na frente.
// Embaixo, o item de doação das Compras (caixinha Doação), para quem vê a aba Compras: cada valor abre a aba Compras já
// na confirmação da doação (o Pix, o CPF e o resto seguem por lá).

import { estado, avisar, veGuias, carregarGuias } from '../estado.js';
import { token, emDemo } from '../auth.js';
import { esc } from '../util.js';
import { centavos, reais } from '/shared/ervas.js';
import { rotuloSenha, tipoFila, VALORES_DOACAO } from '/shared/fila.js';

const VALIDADE_MS = 30000;   // a Geral redesenha muito: consulta a fila no máximo a cada 30 s
const CHAVE_TOKEN = 'sortmediuns:fila';   // o mesmo aparelho da página /fila
let buscando = false;
let guiasPedidas = false;    // as Compras são lidas uma vez (a aba Compras atualiza ao abrir)

const R = (v) => reais(centavos(v));
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function tokenFila() {
  try {
    let t = localStorage.getItem(CHAVE_TOKEN);
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(CHAVE_TOKEN, t); }
    return t;
  } catch { return null; }
}

async function buscar(data) {
  if (buscando) return;
  buscando = true;
  const sessao = token();
  try {
    const t = tokenFila();
    const r = await fetch(`/api/giras/${data}?lista=fila`, { headers: { Authorization: 'Bearer ' + sessao, ...(t ? { 'X-Fila-Token': t } : {}) } });
    const j = r.ok ? await r.json() : null;
    if (token() !== sessao) return;
    const antes = JSON.stringify(estado.filaGeral?.fila ?? null);
    estado.filaGeral = { data, em: Date.now(), fila: j };
    if (antes !== JSON.stringify(j)) avisar();
  } catch {
    estado.filaGeral = { data, em: Date.now(), fila: estado.filaGeral?.fila ?? null };
  } finally {
    buscando = false;
  }
}

// Os itens de doação que a pessoa pode pedir agora: visíveis, num grupo visível e com o pedido aberto.
function doacoes() {
  // Sem senha, as Compras não abrem (o servidor recusa): nem tenta, para não aparecer erro na Geral.
  const me = estado.me || {};
  if (!veGuias() || ((me.corrente || me.grupo === 'alunos') && !me.temSenha)) return [];
  if (estado.guias === null) { if (!guiasPedidas) { guiasPedidas = true; carregarGuias(); } return []; }
  return (estado.guias?.grupos || []).filter((g) => g.visivel && g.aberto).flatMap((g) => g.itens.filter((i) => i.visivel && i.doacao));
}

function blocoDoacao() {
  const L = doacoes();
  if (!L.length) return '';
  return `<div class="fila-doa">${L.map((i) => `<div class="fila-doa-i"><span class="fila-doa-t"><b>${esc(i.descricao)}</b><small>Quer doar? Escolha um valor (o pagamento é pelo Pix, na aba Compras).</small></span>
      <span class="fila-doa-bs">${VALORES_DOACAO.map((v) => `<button type="button" class="btn small" data-act="filadoar" data-id="${esc(i.id)}" data-v="${v}">${R(v)}</button>`).join('')}
        <button type="button" class="btn small" data-act="filadoar" data-id="${esc(i.id)}">Outro valor</button></span></div>`).join('')}</div>`;
}

export function cardFilaGeral() {
  if (!token() || emDemo()) return '';
  const data = hojeBR();
  const g = estado.filaGeral?.data === data ? estado.filaGeral : null;
  if (!g || Date.now() - g.em > VALIDADE_MS) buscar(data);
  const f = g?.fila;
  if (!f?.existe || f.encerrada) return '';
  const m = f.minha;
  let linha;
  if (m) {
    const txt = m.status === 'aguardando' ? (m.aFrente ? `${m.aFrente} ${m.aFrente === 1 ? 'pessoa' : 'pessoas'} na sua frente` : 'Você é a próxima')
      : m.status === 'chamada' ? 'Sua senha foi chamada' : 'Chamada quando você não estava';
    linha = `<a class="fila-geral-l" href="/fila"><span class="fila-geral-n">${esc(rotuloSenha(m.tipo, m.numero))}</span>
      <span class="fila-geral-t"><small>Sua senha de ${esc((tipoFila(m.tipo)?.nome || '').toLowerCase())}</small><b>${txt}</b></span>
      <span class="seta" aria-hidden="true">›</span></a>`;
  } else if (f.aberta) {
    linha = `<a class="fila-geral-l" href="/fila"><span class="fila-geral-ico" aria-hidden="true">🎟️</span>
      <span class="fila-geral-t"><b>Fila de senhas aberta</b><small>Pegue a sua senha para a gira de hoje.</small></span>
      <span class="seta" aria-hidden="true">›</span></a>`;
  } else return '';
  return `<div class="card fila-geral ${m ? m.tipo : ''}${m?.status === 'chamada' ? ' chamada' : ''}">${linha}${blocoDoacao()}</div>`;
}

export const cliquesFilaGeral = {
  // Abre a aba Compras (como tocar nela) e, com um valor, já na confirmação da doação; "Outro valor" só abre a aba.
  async filadoar(el) {
    const compras = await import('./guias.js');
    document.querySelector('#tabs [data-tab="guias"]')?.click();
    if (el.dataset.v) compras.abrirDoacao(el.dataset.id, Number(el.dataset.v));
    avisar();
    window.scrollTo(0, 0);
  },
};
