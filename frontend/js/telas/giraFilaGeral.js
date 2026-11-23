// Bloco da fila de senhas na aba Geral, para quem está logado mas não é da corrente (alunos, consulentes, grupo
// Oferenda): eles não têm a aba Gira. Aparece só quando há fila hoje (pergunta à mesma rota pública da página /fila)
// e leva para /fila dentro do próprio app, já com o login (no iPhone, o app instalado não divide o login com o Safari).
// Com senha, mostra a senha e quantas pessoas estão na frente.
// Embaixo, o item de doação das Compras (caixinha Doação), para qualquer pessoa logada (sem senha e sem a aba
// Compras): escolhe o valor (ou digita Outro valor), confirma e paga o Pix ali mesmo, sem ir para a aba Compras.

import { estado, avisar } from '../estado.js';
import { api } from '../api.js';
import { token, emDemo } from '../auth.js';
import { esc, toast } from '../util.js';
import { centavos, reais } from '/shared/ervas.js';
import { rotuloSenha, tipoFila, VALORES_DOACAO } from '/shared/fila.js';

const VALIDADE_MS = 30000;   // a Geral redesenha muito: consulta a fila no máximo a cada 30 s
const CHAVE_TOKEN = 'sortmediuns:fila';   // o mesmo aparelho da página /fila
let buscando = false;
let doacoesPedidas = false;  // os itens de doação são lidos uma vez (e de novo no Já paguei)

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
    estado.filaGeral = { data, sessao, em: Date.now(), fila: j };
    if (antes !== JSON.stringify(j)) avisar();
  } catch {
    estado.filaGeral = { data, sessao, em: Date.now(), fila: estado.filaGeral?.sessao === sessao ? estado.filaGeral.fila : null };
  } finally {
    buscando = false;
  }
}

// Os itens de doação (rota própria: qualquer pessoa logada, sem senha e sem a aba Compras) e o Pix da pessoa.
// Ligados à sessão: outra pessoa que entrar no mesmo aparelho lê de novo (e não vê o Pix de quem saiu).
async function lerDoacoes() {
  const sessao = token();
  let r;
  try { r = await api('GET', '/oferendas?lista=doacoes'); } catch { r = { itens: [] }; }
  if (token() !== sessao) return;
  estado.doacoesGeral = { ...r, sessao };
  doacoesPedidas = false;
  avisar();
}
function doacoes() {
  if (estado.doacoesGeral?.sessao !== token()) {
    if (!doacoesPedidas) { doacoesPedidas = true; doa = null; outro = null; lerDoacoes(); }
    return [];
  }
  return estado.doacoesGeral.itens || [];
}

// ---------- doação, resolvida aqui mesmo (sem ir para a aba Compras) ----------
// O item vem das Compras (caixinha Doação) e o Pix é o mesmo (conta B, CPF no primeiro pagamento), mas a doação tem
// rota própria (op 'doar'): qualquer pessoa logada doa, sem senha e sem a aba Compras, e paga no próprio bloco.
let outro = null;            // "Outro valor" aberto: { id do item, valor digitado }
let doa = null;              // { id, valor, etapa: 'confirmar' | 'gerando' | 'pagar', cpf, ids: cobranças novas }

const cobrancas = () => estado.doacoesGeral?.cobrancas || [];
const pendentesIds = () => new Set(cobrancas().filter((c) => c.status === 'pendente').map((c) => c.id));

function campoOutro(i) {
  const sug = Number(i.valor) > 0 ? R(i.valor).replace(/^R\$\s?/, '') : '0,00';
  return `<span class="fila-doa-outro"><label><span>R$</span><input type="text" id="fg-doa-v" inputmode="decimal" maxlength="10" placeholder="${esc(sug)}" value="${esc(outro.valor)}" aria-label="Valor da doação" enterkeyhint="go"></label>
    <button type="button" class="btn small primary" data-act="filadoarvalor" data-id="${esc(i.id)}">Doar</button><button type="button" class="btn small" data-act="filadoaroutro">Cancelar</button></span>`;
}

function confirmar(i) {
  const G = estado.doacoesGeral || {};
  const cpf = G.pix && G.pixPrecisaCpf
    ? `<label class="fila-doa-cpf">Seu CPF (só no primeiro pagamento; vai direto para o ASAAS)<input type="text" id="fg-doa-cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="${esc(doa.cpf || '')}"></label>` : '';
  const gerando = doa.etapa === 'gerando';
  return `<div class="fila-doa-conf"><p><b>Doar ${R(doa.valor)}</b> para ${esc(i.descricao)}?</p>
    ${G.pix ? '<p class="muted">Ao confirmar, o Pix para pagar aparece aqui mesmo.</p>' : ''}${cpf}
    <p class="muted">Para cancelar depois, só falando com a administração.</p>
    <div class="fila-doa-bs"><button type="button" class="btn small primary" data-act="filadoarok" ${gerando ? 'disabled' : ''}>${gerando ? 'Gerando o Pix…' : 'Confirmar doação'}</button>
      <button type="button" class="btn small" data-act="filadoarvoltar" ${gerando ? 'disabled' : ''}>Voltar</button></div></div>`;
}

function pagar() {
  const C = (doa.ids || []).map((id) => cobrancas().find((c) => c.id === id)).filter(Boolean);
  const pagas = C.filter((c) => c.status === 'paga');
  const pend = C.filter((c) => c.status === 'pendente');
  if (!pend.length) {
    return `<div class="fila-doa-pix"><p><b>${pagas.length ? `✅ Doação de ${R(pagas.reduce((t, c) => t + c.valor, 0))} confirmada. Obrigado!` : 'O link desta doação não está mais pendente.'}</b></p>
      <button type="button" class="btn small" data-act="filadoarfechar">Fechar</button></div>`;
  }
  return pend.map((c) => `<div class="fila-doa-pix"><p><b>Doação de ${R(c.valor)}</b>: agora é só pagar.</p>
    ${c.link ? `<a class="btn primary" href="${esc(c.link)}" target="_blank" rel="noopener">Pagar pelo link (Pix)</a>` : ''}
    ${c.pixImagem ? `<img class="fila-doa-qr" src="data:image/png;base64,${c.pixImagem}" alt="QR Code do Pix de ${R(c.valor)}">` : ''}
    ${c.pixPayload ? `<label class="fila-doa-cc">Pix copia e cola<textarea id="fg-cc-${esc(c.id)}" readonly rows="3">${esc(c.pixPayload)}</textarea></label>
      <button type="button" class="btn small" data-act="filadoarcopiar" data-cc="fg-cc-${esc(c.id)}"><span aria-hidden="true">📋</span> Copiar código Pix</button>` : ''}
    <p class="muted">Depois de pagar, a confirmação chega sozinha do banco (pode levar alguns minutos).</p>
    <div class="fila-doa-bs"><button type="button" class="btn small" data-act="filadoaratualizar" ${doa.atualizando ? 'disabled' : ''}>${doa.atualizando ? 'Atualizando…' : '↻ Já paguei, atualizar'}</button>
      <button type="button" class="btn small" data-act="filadoarfechar">Pagar depois</button></div></div>`).join('');
}

function blocoDoacao() {
  const L = doacoes();
  if (!L.length) return '';
  return `<div class="fila-doa">${L.map((i) => {
    let corpo;
    if (doa?.id === i.id && doa.etapa === 'pagar') corpo = pagar();
    else if (doa?.id === i.id) corpo = confirmar(i);
    else if (outro?.id === i.id) corpo = campoOutro(i);
    else corpo = `<span class="fila-doa-bs">${VALORES_DOACAO.map((v) => `<button type="button" class="btn small" data-act="filadoar" data-id="${esc(i.id)}" data-v="${v}">${R(v)}</button>`).join('')}
        <button type="button" class="btn small" data-act="filadoaroutro" data-id="${esc(i.id)}">Outro valor</button></span>`;
    return `<div class="fila-doa-i"><span class="fila-doa-t"><b>${esc(i.descricao)}</b><small>Quer doar? Escolha um valor; o pagamento é pelo Pix.</small></span>${corpo}</div>`;
  }).join('')}</div>`;
}

// Valor digitado: aceita 25, 25,50 ou 1.250,00 (como nas Compras); vazio, a sugestão do item.
function valorDigitado(item) {
  let t = String(outro?.valor ?? '').replace(/\s|R\$/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = t ? Math.round(Number(t) * 100) / 100 : Number(item?.valor) || 0;
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : null;
}

// Os campos (valor e CPF) ficam guardados para a atualização da fila não apagar; o Enter no valor também doa.
document.addEventListener('input', (e) => {
  if (e.target.id === 'fg-doa-v' && outro) outro.valor = e.target.value;
  if (e.target.id === 'fg-doa-cpf' && doa) doa.cpf = e.target.value;
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.id !== 'fg-doa-v') return;
  e.preventDefault();
  e.target.closest('.fila-doa-outro')?.querySelector('[data-act="filadoarvalor"]')?.click();
});

export function cardFilaGeral() {
  if (!token() || emDemo()) return '';
  const data = hojeBR();
  // Só vale a leitura desta sessão (outra pessoa no mesmo aparelho não vê a senha de quem saiu).
  const g = estado.filaGeral?.data === data && estado.filaGeral.sessao === token() ? estado.filaGeral : null;
  if (!g || Date.now() - g.em > VALIDADE_MS) buscar(data);
  const f = g?.fila;
  // Desligado pelo root (interruptor na sub-aba Fila): o bloco não aparece.
  if (!f?.existe || f.encerrada || !f.blocoGeral) return '';
  const m = f.minha;
  let linha;
  if (m) {
    const txt = m.status === 'aguardando' ? (m.aFrente ? `${m.aFrente} ${m.aFrente === 1 ? 'pessoa' : 'pessoas'} na sua frente` : 'Você é a próxima')
      : m.status === 'chamada' ? 'Sua senha foi chamada' : 'Chamada quando você não estava';
    linha = `<a class="fila-geral-l" href="/fila"><span class="fila-geral-n">${esc(rotuloSenha(m.tipo, m.numero))}</span>
      <span class="fila-geral-t"><small>Sua senha de ${esc((tipoFila(m.tipo)?.nome || '').toLowerCase())}</small><b>${txt}</b></span>
      <span class="seta" aria-hidden="true">›</span></a>`;
  } else if (f.aberta && f.manual) {
    linha = `<div class="fila-geral-l"><span class="fila-geral-ico" aria-hidden="true">🎟️</span>
      <span class="fila-geral-t"><b>Fila de senhas aberta</b><small>Hoje as senhas são no balcão: peça a sua a quem está cuidando da fila.</small></span></div>`;
  } else if (f.aberta) {
    linha = `<a class="fila-geral-l" href="/fila"><span class="fila-geral-ico" aria-hidden="true">🎟️</span>
      <span class="fila-geral-t"><b>Fila de senhas aberta</b><small>Pegue a sua senha para a gira de hoje.</small></span>
      <span class="seta" aria-hidden="true">›</span></a>`;
  } else return '';
  return `<div class="card fila-geral ${m ? m.tipo : ''}${m?.status === 'chamada' ? ' chamada' : ''}">${linha}${blocoDoacao()}</div>`;
}

export const cliquesFilaGeral = {
  // Um valor pronto (ou o digitado no Outro valor) abre a confirmação aqui mesmo.
  filadoar(el) { outro = null; doa = { id: el.dataset.id, valor: Number(el.dataset.v), etapa: 'confirmar' }; avisar(); },
  filadoaroutro(el) {
    doa = null;
    outro = el.dataset.id ? { id: el.dataset.id, valor: '' } : null;
    avisar();
    if (outro) setTimeout(() => document.getElementById('fg-doa-v')?.focus(), 0);
  },
  filadoarvalor(el) {
    const item = doacoes().find((i) => i.id === el.dataset.id);
    const v = valorDigitado(item);
    if (!v) { toast('Digite o valor da doação (ex.: 25,50).'); return; }
    outro = null;
    doa = { id: el.dataset.id, valor: v, etapa: 'confirmar' };
    avisar();
  },
  filadoarvoltar() { doa = null; avisar(); },
  // Faz o pedido da doação (rota das Compras) e mostra o Pix novo aqui; sem o Pix ligado, só registra.
  async filadoarok() {
    if (!doa || doa.etapa !== 'confirmar') return;
    const cpf = document.getElementById('fg-doa-cpf')?.value.trim();
    const D = estado.doacoesGeral || {};
    if (D.pix && D.pixPrecisaCpf && !cpf) { toast('Digite o seu CPF para gerar o Pix.'); return; }
    doa.etapa = 'gerando';
    avisar();
    const antes = pendentesIds();
    try {
      estado.doacoesGeral = { ...(await api('POST', '/oferendas', { acao: 'guias', op: 'doar', itemId: doa.id, valor: doa.valor, ...(cpf ? { cpf } : {}) })), sessao: token() };
    } catch (e) {
      toast(e.message);
      if (doa) doa.etapa = 'confirmar';
      avisar();
      return;
    }
    const G = estado.doacoesGeral || {};
    const novas = [...pendentesIds()].filter((id) => !antes.has(id));
    if (G.aviso || !G.pix || !novas.length) {
      toast(G.aviso || 'Doação registrada. Obrigado!');
      doa = null;
    } else doa = { ...doa, etapa: 'pagar', ids: novas };
    avisar();
  },
  async filadoaratualizar() {
    if (!doa || doa.atualizando) return;
    doa.atualizando = true;
    avisar();
    await lerDoacoes();
    if (doa) doa.atualizando = false;
    avisar();
  },
  filadoarfechar() { doa = null; avisar(); },
  filadoarcopiar(el) {
    const t = document.getElementById(el.dataset.cc);
    const txt = t?.value || '';
    const fb = () => { t?.focus(); t?.select(); toast('Código selecionado. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Código Pix copiado.'), fb); } catch { fb(); }
  },
};
