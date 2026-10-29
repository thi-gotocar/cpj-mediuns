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
import * as login from './telas/login.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const conta = document.getElementById('conta');
const TELAS = { gira, pessoas, hist: historico, ervas, usuarios };
let erroLogin = '';
let emailLogin = '';
let instalado = true;

// ---------- render ----------
function renderConta() {
  if (!estado.me) { conta.innerHTML = ''; return; }
  conta.innerHTML = `${pode('giras:editar') ? `<span class="sync" id="sync">${estado.salvando ? 'Salvando…' : 'Salvo'}</span>` : ''}
    <span class="quem">${esc(estado.me.nome)}</span><span class="papel ${estado.me.papel}">${ROTULOS[estado.me.papel] || estado.me.papel}</span>
    ${estado.me.corrente ? '' : '<button class="btn small" data-conta="senha">Trocar senha</button>'}
    <button class="btn small" data-conta="sair">Sair</button>`;
}

function render() {
  if (!logado() || !estado.pronto) {
    tabs.hidden = true;
    renderConta();
    if (!logado()) {
      main.innerHTML = instalado ? login.render(erroLogin, emailLogin) : login.renderInstalacao(erroLogin);
      if (instalado && ehAcessoCorrente(emailLogin)) login.ajustarCampoSenha(true);
    }
    return;
  }
  if (prefs.tab === 'usuarios' && !pode('usuarios:gerenciar')) prefs.tab = 'gira';
  if (prefs.tab === 'ervas' && !pode('ervas:escolher')) prefs.tab = 'gira';
  if ((prefs.tab === 'pessoas' || prefs.tab === 'hist') && !pode('escala:completa')) prefs.tab = 'gira';
  tabs.hidden = false;
  tabs.querySelector('[data-tab="usuarios"]').hidden = !pode('usuarios:gerenciar');
  tabs.querySelector('[data-tab="ervas"]').hidden = !pode('ervas:escolher');
  tabs.querySelector('[data-tab="pessoas"]').hidden = !pode('escala:completa');
  tabs.querySelector('[data-tab="hist"]').hidden = !pode('escala:completa');
  tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === prefs.tab)));
  renderConta();

  // Preserva o foco e o cursor ao redesenhar.
  const a = document.activeElement;
  const fid = a && a.id;
  let ss = null, se = null;
  try { if (fid && a.selectionStart != null) { ss = a.selectionStart; se = a.selectionEnd; } } catch { /* input sem seleção */ }
  main.innerHTML = TELAS[prefs.tab].render();
  if (fid) {
    const el = document.getElementById(fid);
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
  salvarPrefs();
  render();
});

conta.addEventListener('click', async (e) => {
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
});

main.addEventListener('click', (e) => {
  if (e.target.closest('[data-conta="recarregar"]')) { iniciar(); return; }
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
    btn.textContent = 'Entrando…';
    try {
      await entrar(emailLogin, document.getElementById('l-senha').value);
      erroLogin = '';
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
  } else if (id === 'f-erva') {
    await ervas.enviarFormulario();
  } else if (id === 'f-ren') {
    await pessoas.renomear(e.target);
  } else if (id === 'f-add') {
    await pessoas.enviarFormulario();
  } else if (id === 'f-user') {
    await usuarios.enviarFormulario();
  }
});

// Ao voltar para o app, busca o que outras pessoas mudaram.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarDoServidor(); });
window.addEventListener('focus', () => atualizarDoServidor());

iniciar();
export { avisar };
