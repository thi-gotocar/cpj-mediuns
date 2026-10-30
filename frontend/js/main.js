// Ponto de entrada do frontend: login, abas, renderização e eventos.

import { estadoDoApp, logado, entrar, instalar, sair, trocarSenha } from './auth.js';
import { quandoSessaoExpirar } from './api.js';
import { estado, prefs, salvarPrefs, pode, aoMudar, avisar, carregarTudo, atualizarDoServidor } from './estado.js';
import { esc, toast } from './util.js';
import { ROTULOS, ehAcessoCorrente } from '/shared/permissoes.js';
import * as gira from './telas/gira.js';
import * as pessoas from './telas/pessoas.js';
import * as historico from './telas/historico.js';
import * as usuarios from './telas/usuarios.js';
import * as ervas from './telas/ervas.js';
import * as oferendas from './telas/oferendas.js';
import * as login from './telas/login.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const conta = document.getElementById('conta');
const rodape = document.getElementById('rodape');
const saudNome = document.getElementById('saud-nome');
const TELAS = { gira, pessoas, hist: historico, ervas, oferendas, usuarios };
let erroLogin = '';
let emailLogin = '';
let candidatosLogin = null;   // acesso da corrente: nomes parecidos para a pessoa confirmar
let digitadoLogin = '';       // o nome como a pessoa digitou (para juntar o que ela preencheu antes)
let instalado = true;

// ---------- render ----------
// Topo: "Seja bem-vindo, Nome!" e o Sair à direita. No fim da página: o perfil e o Trocar senha.
function renderConta() {
  if (!estado.me) { conta.innerHTML = ''; rodape.innerHTML = ''; rodape.hidden = true; saudNome.textContent = ''; return; }
  saudNome.textContent = estado.me.nome;
  conta.innerHTML = `${pode('giras:editar') ? `<span class="sync" id="sync">${estado.salvando ? 'Salvando…' : 'Salvo'}</span>` : ''}
    <button class="btn small" data-conta="sair">Sair</button>`;
  rodape.hidden = false;
  rodape.innerHTML = `<span class="quem">${esc(estado.me.nome)}</span><span class="papel ${estado.me.papel}">${ROTULOS[estado.me.papel] || estado.me.papel}</span>
    ${estado.me.corrente ? '' : '<button class="btn small" data-conta="senha">Trocar senha</button>'}`;
}

function render() {
  // Fora do app (login, instalação) não mostra o título no topo.
  document.body.classList.toggle('deslogado', !logado());
  if (!logado() || !estado.pronto) {
    tabs.hidden = true;
    renderConta();
    if (!logado()) {
      main.innerHTML = instalado ? login.render(erroLogin, emailLogin, candidatosLogin) : login.renderInstalacao(erroLogin);
      if (instalado && ehAcessoCorrente(emailLogin)) login.ajustarCampoSenha(true);
    }
    return;
  }
  if (prefs.tab === 'usuarios' && !pode('usuarios:gerenciar')) prefs.tab = 'gira';
  if (prefs.tab === 'ervas' && !pode('ervas:escolher')) prefs.tab = 'gira';
  if (prefs.tab === 'oferendas' && !pode('oferendas:doar')) prefs.tab = 'gira';
  if ((prefs.tab === 'pessoas' || prefs.tab === 'hist') && !pode('escala:completa')) prefs.tab = 'gira';
  tabs.hidden = false;
  tabs.querySelector('[data-tab="usuarios"]').hidden = !pode('usuarios:gerenciar');
  tabs.querySelector('[data-tab="ervas"]').hidden = !pode('ervas:escolher');
  tabs.querySelector('[data-tab="oferendas"]').hidden = !pode('oferendas:doar');
  tabs.querySelector('[data-tab="pessoas"]').hidden = !pode('escala:completa');
  tabs.querySelector('[data-tab="hist"]').hidden = !pode('escala:completa');
  tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === prefs.tab)));
  renderConta();

  // Preserva o foco e o cursor ao redesenhar.
  const a = document.activeElement;
  // Combos (select) não recebem o foco de volta: no celular isso reabre a lista de opções.
  const fid = a && a.tagName !== 'SELECT' && a.id;
  let ss = null, se = null;
  try { if (fid && a.selectionStart != null) { ss = a.selectionStart; se = a.selectionEnd; } } catch { /* input sem seleção */ }
  main.innerHTML = TELAS[prefs.tab].render();
  if (fid) {
    let el = document.getElementById(fid);
    // Campo de data em uso: mantém o mesmo elemento (no celular, trocar o elemento
    // com o seletor de data aberto fecha ou trava o seletor).
    if (el && a.tagName === 'INPUT' && a.type === 'date' && el.tagName === 'INPUT' && el.type === 'date') {
      el.replaceWith(a);
      el = a;
    }
    if (el && el !== document.body) {
      el.focus({ preventScroll: true });
      try { if (ss != null) el.setSelectionRange(ss, se); } catch { /* ignora */ }
    }
  }
}
aoMudar(render);

// ---------- início ----------
async function iniciar() {
  if (!logado()) {
    try {
      instalado = (await estadoDoApp()).instalado;
    } catch (e) {
      main.innerHTML = `<div class="card"><h2>App não configurado</h2><p class="erro">${esc(e.message)}</p><p class="muted">Veja a seção “Como colocar no ar” do README.</p><button class="btn" data-conta="recarregar">Tentar de novo</button></div>`;
      return;
    }
    render();
    return;
  }
  main.innerHTML = '<div class="loading">Carregando a corrente…</div>';
  try {
    await carregarTudo();
  } catch (e) {
    if (e.status === 401) return;
    main.innerHTML = `<div class="card"><p class="erro">${esc(e.message)}</p><button class="btn" data-conta="recarregar">Tentar de novo</button></div>`;
  }
}

quandoSessaoExpirar(() => {
  estado.me = null;
  estado.pronto = false;
  estado.usuarios = null;
  estado.ervas = null;
  erroLogin = 'Sua sessão terminou. Entre de novo.';
  render();
});

// ---------- eventos ----------
tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  prefs.tab = b.dataset.tab;
  estado.confirm = null;
  if (b.dataset.tab === 'usuarios') estado.usuarios = null;
  if (b.dataset.tab === 'ervas') estado.ervas = null;
  // Busca as oferendas de novo ao abrir a aba (para ver as que o admin acabou de publicar).
  if (b.dataset.tab === 'oferendas') estado.oferendas = null;
  salvarPrefs();
  render();
});

async function cliqueConta(e) {
  const b = e.target.closest('[data-conta]');
  if (!b) return;
  if (b.dataset.conta === 'sair') {
    sair();
    Object.assign(estado, { me: null, pessoas: [], giras: {}, usuarios: null, ervas: null, pronto: false, img: null });
    erroLogin = '';
    render();
  } else if (b.dataset.conta === 'senha') {
    const atual = prompt('Sua senha atual:');
    if (atual === null) return;
    const nova = prompt('Nova senha (mínimo 8 caracteres):');
    if (nova === null) return;
    if (nova.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.'); return; }
    try { await trocarSenha(atual, nova); toast('Senha alterada. Outras sessões abertas foram encerradas.'); } catch (err) { toast(err.message); }
  }
}
conta.addEventListener('click', cliqueConta);
rodape.addEventListener('click', cliqueConta);

main.addEventListener('click', async (e) => {
  if (e.target.closest('[data-conta="recarregar"]')) { iniciar(); return; }
  // Acesso da corrente: a pessoa confirma qual nome cadastrado é o dela.
  const eu = e.target.closest('[data-soueu]');
  if (eu) {
    candidatosLogin = null;
    if (!eu.dataset.soueu) { render(); return; }
    try {
      const r = await entrar(emailLogin, eu.dataset.soueu, digitadoLogin);
      erroLogin = '';
      if (r.candidatos) { candidatosLogin = r.candidatos; render(); return; }
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); }
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (a === 'askdel') { estado.confirm = el.dataset.k; render(); return; }
  estado.confirm = null;
  if (a === 'goto') { prefs.tab = el.dataset.tab; salvarPrefs(); render(); return; }
  const tela = TELAS[prefs.tab];
  if (tela.cliques && tela.cliques[a]) tela.cliques[a](el, e);
  else render();
});

main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-data') { gira.mudancas.data(t); return; }
  if (t.id === 'f-ent') { gira.mudancas.entidade(t); return; }
  if (t.id === 'f-import' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; historico.restaurar(f); return; }
  const tela = TELAS[prefs.tab];
  const fn = t.dataset.act && tela.mudancas && tela.mudancas[t.dataset.act];
  if (fn) fn(t);
});


main.addEventListener('input', (e) => {
  if (e.target.id === 'l-email') login.ajustarCampoSenha(ehAcessoCorrente(e.target.value));
});

main.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'f-login') {
    const btn = document.getElementById('l-btn');
    emailLogin = document.getElementById('l-email').value.trim();
    btn.disabled = true;
    btn.textContent = ehAcessoCorrente(emailLogin) ? 'Procurando usuário…' : 'Entrando…';
    try {
      digitadoLogin = document.getElementById('l-senha').value;
      const r = await entrar(emailLogin, digitadoLogin);
      erroLogin = '';
      if (r.candidatos) { candidatosLogin = r.candidatos; render(); return; }
      await iniciar();
    } catch (err) {
      erroLogin = err.message;
      render();
    }
  } else if (id === 'f-instalar') {
    const v = (x) => document.getElementById(x).value;
    if (v('i-senha') !== v('i-senha2')) { erroLogin = 'As senhas não conferem.'; render(); return; }
    const btn = document.getElementById('i-btn');
    btn.disabled = true;
    btn.textContent = 'Instalando…';
    try {
      await instalar({ codigo: v('i-codigo'), nome: v('i-nome').trim(), email: v('i-email').trim(), senha: v('i-senha') });
      erroLogin = '';
      instalado = true;
      await iniciar();
    } catch (err) {
      erroLogin = err.message;
      if (/já foi instalado/.test(err.message)) instalado = true;
      render();
    }
  } else if (id === 'f-para') {
    ervas.enviarPara();
  } else if (id === 'f-erva') {
    await ervas.enviarFormulario();
  } else if (id === 'f-ren') {
    await pessoas.renomear(e.target);
  } else if (id === 'f-lic') {
    await pessoas.enviarLicenca();
  } else if (id === 'f-add') {
    await pessoas.enviarFormulario();
  } else if (id === 'f-curimba') {
    await pessoas.enviarCurimba();
  } else if (id === 'f-uren') {
    await usuarios.renomear(e.target);
  } else if (id === 'f-user') {
    await usuarios.enviarFormulario();
  } else if (id === 'f-of' || e.target.dataset.form) {
    await oferendas.enviar(e.target);
  }
});

// Ao voltar para o app, busca o que outras pessoas mudaram.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarDoServidor(); });
window.addEventListener('focus', () => atualizarDoServidor());

iniciar();
export { avisar };
