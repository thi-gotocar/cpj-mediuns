// Página pública /fila (sem login, sem o app): pegar a senha pelo QR e acompanhar a fila.
// O celular guarda um token próprio (vai no cabeçalho X-Fila-Token) e o servidor só o hash: é por ele que a pessoa
// vê a própria senha ao reabrir a página. Quem já está logado no app neste navegador vai com o login também.
// Pegar senha pede a localização (o servidor confere se o celular está no terreiro).
// A página consulta a fila de tempos em tempos e, quando a senha é chamada, toca um aviso e vibra.
// A consulta de rotina é o resumo igual para todos (?lista=filaResumo, que a Vercel guarda por 3 s e entrega sem chamar
// a função); quantos estão na frente sai da lista dos números aguardando. A própria senha (?lista=fila, com o token) só
// é pedida ao abrir, quando o número sai da espera (foi chamada ou marcada), enquanto ela não está aguardando e, por
// garantia, a cada PESSOAL_A_CADA consultas.
// /fila?tv: a tela de TV do salão (a senha chamada, as anteriores e o QR; nunca nomes). /fila?cartaz: o cartaz com o QR
// para imprimir.

import { TIPOS_FILA, tipoFila, rotuloSenha } from '/shared/fila.js';
import { qrSvg } from '/shared/qr.js';

const el = document.getElementById('fp-conteudo');
const params = new URLSearchParams(location.search);
const MODO = params.has('tv') ? 'tv' : params.has('cartaz') ? 'cartaz' : 'senha';
document.body.classList.add('modo-' + MODO);
const ATUALIZAR_MS = MODO === 'tv' ? 5000 : 8000;
// Com senha aguardando, consulta menos quando a vez está longe: mais de 20 na frente, a cada 30 s; de 5 a 20, a cada 15 s;
// perto (menos de 5) ou fora da espera (chamada, ausente), no ritmo normal, para o aviso chegar na hora.
function intervalo() {
  const m = MODO === 'senha' ? fila?.minha : null;
  if (m?.status !== 'aguardando' || m.aFrente == null) return ATUALIZAR_MS;
  return m.aFrente > 20 ? 30000 : m.aFrente >= 5 ? 15000 : ATUALIZAR_MS;
}
const PESSOAL_A_CADA = 8;
const ENDERECO = location.origin + '/fila';
const CHAVE_TOKEN = 'sortmediuns:fila';
const CHAVE_LOGIN = 'sortmediuns:token';

const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
function tokenFila() {
  let t = ler(CHAVE_TOKEN);
  if (!t) {
    t = crypto.randomUUID();
    try { localStorage.setItem(CHAVE_TOKEN, t); } catch { /* sem armazenamento: vale enquanto a página estiver aberta */ }
  }
  return t;
}
const TOKEN = tokenFila();
const login = () => { const t = ler(CHAVE_LOGIN); return t && !t.startsWith('demo:') ? t : null; };
// A data da gira é a do Brasil, como no servidor.
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let fila = null;          // o que a tela mostra: resposta de ?lista=fila, ou o resumo com a própria senha calculada
let pessoal = null;       // última resposta com a própria senha (?lista=fila ou de pegar/desistir)
let rodadas = 0;          // consultas desde a última da própria senha
let erro = '';            // erro do último pedido de senha (ou de desistir)
let erroCarga = '';       // a fila não carregou (sem internet, servidor fora)
let enviando = false;
let confirmarDesistir = false;
let rascunho = { tipo: '', nome: '', telefone: '' };
let mexeu = false;         // a pessoa já mexeu no nome ou no telefone (o cadastro não sobrescreve mais)
let jaAvisou = '';        // id + hora da chamada já avisada (não repete o som a cada consulta)
let timer = null;
let tvUltima = null;      // a última chamada que a TV já mostrou (null = ainda não carregou: não toca na abertura)

// lista 'filaResumo': sem token nem login, para a Vercel poder entregar a mesma resposta a todos.
async function api(metodo, corpo, lista = 'fila') {
  const t = login();
  const resumo = lista === 'filaResumo';
  let r;
  try {
    r = await fetch(`/api/giras/${hoje()}${metodo === 'GET' ? '?lista=' + lista : ''}`, {
      method: metodo,
      headers: resumo ? {} : { 'X-Fila-Token': TOKEN, ...(t ? { Authorization: 'Bearer ' + t } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Sem conexão. Confira a internet e tente de novo.');
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'Não deu certo. Tente de novo.');
  return j;
}

// ---------- aviso de chamada: som (precisa de um toque antes, regra dos navegadores), vibração e título ----------
let audio = null;
function liberarSom() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
const somLiberado = () => audio?.state === 'running';
function tocar() {
  if (!somLiberado()) return;
  const t0 = audio.currentTime;
  [0, 0.45, 0.9].forEach((d) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.4);
  });
}
function avisarChamada(m) {
  const chave = m.id + (m.chamadaEm || '');
  if (jaAvisou === chave) return;
  jaAvisou = chave;
  tocar();
  try { navigator.vibrate?.([400, 200, 400, 200, 400]); } catch { /* sem vibração */ }
}

// Tela acesa enquanto a pessoa espera (onde o navegador deixa).
let trava = null;
async function manterTelaLigada(ligar) {
  try {
    if (ligar && !trava && document.visibilityState === 'visible' && navigator.wakeLock) {
      trava = await navigator.wakeLock.request('screen');
      trava.addEventListener('release', () => { trava = null; });
    } else if (!ligar && trava) { await trava.release(); trava = null; }
  } catch { trava = null; }
}

// ---------- telas ----------
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function chamadasAgora() {
  const L = fila?.chamadas || [];
  if (!L.length) return '';
  return `<section class="fp-sec"><h2>Chamadas agora</h2><p class="fp-chamadas">${L.map((c, i) => `<span class="fp-ch ${c.tipo}${i === 0 ? ' ult' : ''}">${esc(rotuloSenha(c.tipo, c.numero))}</span>`).join('')}</p></section>`;
}

function minhaSenha(m) {
  const chamada = m.status === 'chamada';
  let canhoto;
  if (m.status === 'aguardando') canhoto = m.aFrente ? `<span>Na sua frente</span><b>${plural(m.aFrente, 'pessoa', 'pessoas')}</b>` : '<b>Você é a próxima</b>';
  else if (chamada) canhoto = '<b>Sua senha foi chamada</b>';
  else canhoto = '<b>Chamada quando você não estava</b>';
  const aviso = chamada ? '<p class="fp-chamou">Sua senha foi chamada. Pode ir.</p>'
    : m.status === 'ausente' ? '<p class="fp-alerta">Procure quem está cuidando da fila para voltar ao seu lugar.</p>' : '';
  const som = m.status === 'aguardando' && !somLiberado()
    ? '<button type="button" class="fp-bt fp-som" data-act="som">🔔 Ligar o aviso sonoro</button>' : '';
  const desistir = m.status === 'chamada' ? '' : confirmarDesistir
    ? `<div class="fp-conf"><span>Desistir da senha ${esc(rotuloSenha(m.tipo, m.numero))}? Ela sai da fila.</span>
        <div class="fp-linha"><button type="button" class="fp-bt fp-perigo" data-act="desistir">Desistir</button><button type="button" class="fp-bt" data-act="manter">Manter a senha</button></div></div>`
    : '<button type="button" class="fp-link" data-act="perguntar">Desistir da senha</button>';
  return `${aviso}
    <div class="fila-cartao ${m.tipo}${chamada ? ' chamada' : ''}"><div class="fila-cartao-c">
      <div class="fila-cartao-topo"><span class="fila-cartao-tipo">${esc(tipoFila(m.tipo)?.nome || '')}</span><span>sua senha</span></div>
      <b class="fila-cartao-n">${esc(rotuloSenha(m.tipo, m.numero))}</b>
      <span class="fila-cartao-q">${esc(m.nome)}</span></div>
      <div class="fila-canhoto">${canhoto}</div></div>
    ${som}
    ${m.status === 'aguardando' ? '<p class="fp-muted">Deixe esta página aberta. Ela avisa quando a sua senha for chamada.</p>' : ''}
    ${chamadasAgora()}
    ${desistir}`;
}

function formulario() {
  const lotado = !!fila.atendimentoLotado;
  const restam = fila.limite != null ? Math.max(0, fila.limite - (fila.emitidas?.atendimento || 0)) : null;
  const sub = { preferencial: 'Para quem tem direito a atendimento preferencial', atendimento: lotado ? 'As senhas acabaram por hoje' : restam != null ? `${plural(restam, 'senha restante', 'senhas restantes')}` : '', passe: '' };
  const tipo = rascunho.tipo && !(rascunho.tipo === 'atendimento' && lotado) ? rascunho.tipo : '';
  return `${lotado ? '<p class="fp-alerta">As senhas de atendimento acabaram. Ainda dá para pegar senha de passe.</p>' : ''}
    <form id="fp-form" class="fp-form" autocomplete="on">
      <fieldset class="fp-tipos"><legend>Que senha você quer?</legend>
        ${TIPOS_FILA.map((t) => {
          const off = t.k === 'atendimento' && lotado;
          return `<label class="fp-tipo ${t.k}${off ? ' off' : ''}"><input type="radio" name="tipo" value="${t.k}" ${tipo === t.k ? 'checked' : ''} ${off ? 'disabled' : ''} required>
            <span><b>${t.nome}</b>${sub[t.k] ? `<small>${esc(sub[t.k])}</small>` : ''}</span></label>`;
        }).join('')}
      </fieldset>
      <label class="fp-campo">Seu nome<input type="text" name="nome" maxlength="80" autocomplete="name" required value="${esc(rascunho.nome)}"></label>
      <label class="fp-campo"><span>Telefone <small>(opcional)</small></span><input type="tel" name="telefone" maxlength="20" inputmode="tel" autocomplete="tel" value="${esc(rascunho.telefone)}"></label>
      ${fila.eu ? '<p class="fp-muted">Nome e telefone vêm do seu cadastro. Se a senha for para outra pessoa, é só trocar.</p>' : ''}
      ${erro ? `<p class="fp-erro">${esc(erro)}</p>` : ''}
      <button class="fp-bt fp-principal" type="submit" ${enviando ? 'disabled' : ''}>${enviando ? 'Conferindo a localização…' : 'Pegar senha'}</button>
      <p class="fp-muted">A página pede a sua localização para conferir que você está no terreiro. Se não der, peça a senha para quem está cuidando da fila.</p>
    </form>
    ${chamadasAgora()}`;
}

// ---------- tela de TV ----------
const relogio = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
function blocoQr() {
  if (!fila?.aberta) return `<aside class="tv-qr fechada"><h2>Pegue a sua senha</h2><p>A fila abre em breve.</p></aside>`;
  return `<aside class="tv-qr"><div class="tv-qr-img">${qrSvg(ENDERECO, { titulo: 'QR para pegar a senha' })}</div>
    <h2>Pegue a sua senha</h2><p>Aponte a câmera do celular para o código.</p></aside>`;
}
function desenharTv() {
  const L = fila?.chamadas || [];
  const ult = L[0];
  const chave = ult ? `${ult.tipo}${ult.numero}${ult.chamadaEm || ''}` : '';
  const nova = tvUltima !== null && !!chave && chave !== tvUltima;
  if (fila) tvUltima = chave;
  if (nova) tocar();
  let centro;
  if (!fila) centro = `<p class="tv-msg">${erroCarga ? esc(erroCarga) : 'Carregando…'}</p>`;
  else if (!fila.existe) centro = '<p class="tv-msg">Hoje não tem gira.</p>';
  else if (fila.encerrada) centro = '<p class="tv-msg">A gira de hoje foi encerrada.</p>';
  else if (!ult) centro = '<p class="tv-msg">Nenhuma senha chamada ainda.</p>';
  else {
    centro = `<div class="fila-cartao tv-cartao ${ult.tipo}${nova ? ' nova' : ''}"><div class="fila-cartao-c">
        <div class="fila-cartao-topo"><span class="fila-cartao-tipo">${esc(tipoFila(ult.tipo)?.nome || '')}</span><span>chamada agora</span></div>
        <b class="fila-cartao-n">${esc(rotuloSenha(ult.tipo, ult.numero))}</b></div>
      ${L.length > 1 ? `<div class="fila-canhoto"><span>Antes</span><span class="tv-antes">${L.slice(1).map((c) => `<b class="fp-ch ${c.tipo}">${esc(rotuloSenha(c.tipo, c.numero))}</b>`).join('')}</span></div>` : ''}</div>`;
  }
  const espera = fila?.existe && !fila.encerrada ? `<p class="tv-espera">Aguardando ${TIPOS_FILA.map((t) => `<span class="fila-c ${t.k}"><b>${fila.aguardando?.[t.k] || 0}</b> ${t.nome.toLowerCase()}</span>`).join('')}</p>` : '';
  const som = somLiberado() ? '' : '<button type="button" class="fp-bt tv-som" data-act="som">🔔 Toque aqui para ligar o som das chamadas</button>';
  el.innerHTML = `<div class="tv">
    <header class="tv-topo"><img src="/img/terreiro.png" width="64" height="64" alt=""><div><span class="fp-casa">Casa do Pai João</span><h1>Fila de senhas</h1></div><span class="tv-hora">${relogio()}</span></header>
    <section class="tv-centro">${centro}${espera}</section>
    ${fila?.existe && !fila.encerrada ? blocoQr() : ''}
    ${som}</div>`;
  manterTelaLigada(true);
}

// ---------- cartaz para imprimir ----------
function desenharCartaz() {
  el.innerHTML = `<div class="cartaz">
    <img src="/img/terreiro.png" width="96" height="96" alt="">
    <span class="cartaz-casa">Casa do Pai João</span>
    <h1>Pegue a sua senha pelo celular</h1>
    <div class="cartaz-qr">${qrSvg(ENDERECO, { titulo: 'QR para pegar a senha' })}</div>
    <p>Aponte a câmera do celular para o código e escolha a sua senha: preferencial, atendimento ou passe.</p>
    <p class="cartaz-url">${esc(ENDERECO.replace(/^https?:\/\//, ''))}</p>
    <p class="cartaz-dica">Sem celular? Peça a senha para quem está cuidando da fila.</p>
    <button type="button" class="fp-bt fp-principal cartaz-bt" data-act="imprimir">Imprimir</button></div>`;
}

function desenhar() {
  if (MODO === 'tv') { desenharTv(); return; }
  let html;
  if (!fila) html = erroCarga ? `<p class="fp-erro">${esc(erroCarga)}</p><button type="button" class="fp-bt" data-act="recarregar">Tentar de novo</button>` : '<p class="fp-muted">Carregando…</p>';
  else if (fila.minha) html = minhaSenha(fila.minha);
  else if (!fila.existe) html = '<div class="fp-vazio"><h2>Hoje não tem gira</h2><p class="fp-muted">A fila de senhas abre no dia da gira.</p></div>';
  else if (fila.encerrada) html = `<div class="fp-vazio"><h2>A gira de hoje já foi encerrada</h2><p class="fp-muted">Obrigado pela visita.</p></div>`;
  else if (!fila.aberta) html = `<div class="fp-vazio"><h2>A fila ainda não abriu</h2><p class="fp-muted">Quando abrir, esta página atualiza sozinha.</p></div>${chamadasAgora()}`;
  else html = formulario();
  // Quem não está logado neste navegador: o atalho para criar o cadastro no app (com cadastro, o nome já vem preenchido).
  if (fila && !login()) html += `<section class="fp-cadastro"><div><b>Ainda não tem cadastro no app?</b>
      <small>Com o cadastro, o seu nome e o telefone já vêm preenchidos aqui.</small></div>
      <a class="fp-bt" href="/?cadastro">Criar cadastro</a></section>`;
  // Logado no app: volta para o app (sem senha ainda é "Cancelar"; com senha, a fila continua guardada).
  if (fila && login()) html += `<a class="fp-bt fp-voltar" href="/">${fila.minha ? '‹ Voltar ao app' : 'Cancelar'}</a>`;
  // Não redesenha com alguém digitando (o campo perderia o foco).
  const ativo = document.activeElement;
  if (ativo?.closest?.('#fp-form') && /^(INPUT|TEXTAREA)$/.test(ativo.tagName) && !enviando && fila && !fila.minha) return;
  el.innerHTML = html;
  const m = fila?.minha;
  document.title = m?.status === 'chamada' ? `Chamada! ${rotuloSenha(m.tipo, m.numero)}` : m ? `Senha ${rotuloSenha(m.tipo, m.numero)} | Fila de senhas` : 'Fila de senhas | Casa do Pai João';
  if (m?.status === 'chamada') avisarChamada(m);
  manterTelaLigada(m?.status === 'aguardando');
}

// A própria senha pelo resumo: só enquanto ela está aguardando e o número continua na espera (null = perguntar ao servidor).
// Quantos estão na frente: a mesma conta de fila_json (no atendimento, as preferenciais vêm antes).
function minhaPeloResumo(r, m) {
  const E = r.espera;
  if (!E || m?.status !== 'aguardando' || !(E[m.tipo] || []).includes(m.numero)) return null;
  const antes = (L) => (L || []).filter((n) => n < m.numero).length;
  return { ...m, aFrente: m.tipo === 'atendimento' ? (E.preferencial || []).length + antes(E.atendimento) : antes(E[m.tipo]) };
}

async function consultar() {
  if (MODO !== 'senha') return api('GET', null, 'filaResumo');
  const m = pessoal?.minha;
  if (pessoal && rodadas < PESSOAL_A_CADA && (!m || m.status === 'aguardando')) {
    const r = await api('GET', null, 'filaResumo');
    const minha = m ? minhaPeloResumo(r, m) : null;
    if (!m || minha) { rodadas++; return { ...r, minha, eu: pessoal.eu }; }
  }
  rodadas = 0;
  return (pessoal = await api('GET'));
}

async function atualizar() {
  clearTimeout(timer);
  try {
    fila = await consultar();
    erroCarga = '';
    // Logado no app: o nome e o telefone do cadastro já vêm preenchidos (dá para trocar, se a senha for para outra pessoa).
    if (fila.eu && !mexeu) rascunho = { ...rascunho, nome: fila.eu.nome || '', telefone: fila.eu.telefone || '' };
    if (!fila.minha) confirmarDesistir = false;
  } catch (e) {
    erroCarga = e.message;
  }
  desenhar();
  if (document.visibilityState === 'visible') timer = setTimeout(atualizar, intervalo());
}

const pegarLocalizacao = () => new Promise((ok, falha) => {
  if (!navigator.geolocation) { falha(new Error('Este celular não informa a localização. Peça a senha para quem está cuidando da fila.')); return; }
  navigator.geolocation.getCurrentPosition(ok, (e) => falha(new Error(e.code === 1
    ? 'Permita a localização para este site no navegador e tente de novo. Se não der, peça a senha para quem está cuidando da fila.'
    : 'Não deu para pegar a localização. Tente de novo.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
});

el.addEventListener('input', (e) => {
  const f = e.target.form;
  if (f?.id !== 'fp-form') return;
  if (e.target.name === 'nome' || e.target.name === 'telefone') mexeu = true;
  rascunho = { tipo: f.querySelector('[name="tipo"]:checked')?.value || '', nome: f.nome.value, telefone: f.telefone.value };
});

el.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;
  liberarSom();   // o toque em Pegar senha libera o som do aviso
  const f = e.target;
  rascunho = { tipo: f.querySelector('[name="tipo"]:checked')?.value || '', nome: f.nome.value.trim(), telefone: f.telefone.value };
  enviando = true; erro = ''; desenhar();
  try {
    const pos = await pegarLocalizacao();
    fila = pessoal = await api('POST', { acao: 'filaEntrar', tipo: rascunho.tipo, nome: rascunho.nome, telefone: rascunho.telefone, lat: pos.coords.latitude, lon: pos.coords.longitude });
  } catch (x) {
    erro = x.message;
  }
  enviando = false;
  desenhar();
  if (fila?.minha) window.scrollTo(0, 0);
});

el.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'imprimir') window.print();
  if (a === 'recarregar') { erroCarga = ''; desenhar(); atualizar(); }
  if (a === 'som') { liberarSom(); setTimeout(desenhar, 100); }
  if (a === 'perguntar') { confirmarDesistir = true; desenhar(); }
  if (a === 'manter') { confirmarDesistir = false; desenhar(); }
  if (a === 'desistir') {
    try { fila = pessoal = await api('POST', { acao: 'filaDesistir' }); rodadas = 0; } catch (x) { erro = x.message; }
    confirmarDesistir = false;
    desenhar();
  }
});

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizar(); else clearTimeout(timer); });

if (MODO === 'cartaz') desenharCartaz();
else atualizar();
