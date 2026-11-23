// Bloco da fila de senhas na aba Geral, para quem está logado mas não é da corrente (alunos, consulentes, grupo
// Oferenda): eles não têm a aba Gira. Aparece só quando há fila hoje (pergunta à mesma rota pública da página /fila)
// e leva para /fila dentro do próprio app, já com o login (no iPhone, o app instalado não divide o login com o Safari).
// Com senha, mostra a senha e quantas pessoas estão na frente.

import { estado, avisar } from '../estado.js';
import { token, emDemo } from '../auth.js';
import { esc } from '../util.js';
import { rotuloSenha, tipoFila } from '/shared/fila.js';

const VALIDADE_MS = 30000;   // a Geral redesenha muito: consulta a fila no máximo a cada 30 s
const CHAVE_TOKEN = 'sortmediuns:fila';   // o mesmo aparelho da página /fila
let buscando = false;

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

export function cardFilaGeral() {
  if (!token() || emDemo()) return '';
  const data = hojeBR();
  const g = estado.filaGeral?.data === data ? estado.filaGeral : null;
  if (!g || Date.now() - g.em > VALIDADE_MS) buscar(data);
  const f = g?.fila;
  if (!f?.existe || f.encerrada) return '';
  const m = f.minha;
  if (m) {
    const linha = m.status === 'aguardando' ? (m.aFrente ? `${m.aFrente} ${m.aFrente === 1 ? 'pessoa' : 'pessoas'} na sua frente` : 'Você é a próxima')
      : m.status === 'chamada' ? 'Sua senha foi chamada' : 'Chamada quando você não estava';
    return `<a class="card fila-geral ${m.tipo}${m.status === 'chamada' ? ' chamada' : ''}" href="/fila">
      <span class="fila-geral-n">${esc(rotuloSenha(m.tipo, m.numero))}</span>
      <span class="fila-geral-t"><small>Sua senha de ${esc((tipoFila(m.tipo)?.nome || '').toLowerCase())}</small><b>${linha}</b></span>
      <span class="seta" aria-hidden="true">›</span></a>`;
  }
  if (!f.aberta) return '';
  return `<a class="card fila-geral" href="/fila"><span class="fila-geral-ico" aria-hidden="true">🎟️</span>
    <span class="fila-geral-t"><b>Fila de senhas aberta</b><small>Pegue a sua senha para a gira de hoje.</small></span>
    <span class="seta" aria-hidden="true">›</span></a>`;
}
