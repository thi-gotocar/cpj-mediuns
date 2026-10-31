// Ponto de entrada do frontend: login, abas, renderização e eventos.

import { estadoDoApp, logado, entrar, instalar, sair, trocarSenha, criarSenhaCorrente } from './auth.js';
import { quandoSessaoExpirar } from './api.js';
import { estado, prefs, salvarPrefs, pode, aoMudar, avisar, carregarTudo, atualizarDoServidor } from './estado.js';
import { esc, toast } from './util.js';
import { ehAcessoCorrente, PIN_VALIDO } from '/shared/permissoes.js';
import * as gira from './telas/gira.js';
import * as pessoas from './telas/pessoas.js';
import * as historico from './telas/historico.js';
import * as usuarios from './telas/usuarios.js';
import * as ervas from './telas/ervas.js';
import * as oferendas from './telas/oferendas.js';
import * as perfil from './telas/perfil.js';
import * as eventos from './telas/eventos.js';
import * as login from './telas/login.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const conta = document.getElementById('conta');
const rodape = document.getElementById('rodape');
const saudNome = document.getElementById('saud-nome');
const saudExtra = document.getElementById('saud-extra');
const TELAS = { gira, pessoas, hist: historico, ervas, oferendas, eventos, perfil, usuarios };
let erroLogin = '';
let emailLogin = '';
let candidatosLogin = null;   // acesso da corrente: nomes parecidos para a pessoa confirmar
let digitadoLogin = '';       // o nome como a pessoa digitou (para juntar o que ela preencheu antes)
let pinLogin = null;          // acesso da corrente: a pessoa tem senha → { nome } (pede a senha)
let instalado = true;

// ---------- render ----------
// Topo: "Seja bem-vindo, Nome!" e o Sair à direita. No fim da página: o perfil e o Trocar senha.
function renderConta() {
  if (!estado.me) { conta.innerHTML = ''; rodape.innerHTML = ''; rodape.hidden = true; saudNome.textContent = ''; saudExtra.innerHTML = ''; return; }
  saudNome.textContent = estado.me.nome;
  // Acesso da corrente sem senha: pode criar uma (depois disso o botão some).
  saudExtra.innerHTML = estado.me.corrente && !estado.me.temSenha ? '<button class="btn small" data-conta="criarsenha">🔒 Criar senha</button>' : '';
  conta.innerHTML = `${pode('giras:editar') ? `<span class="sync" id="sync">${estado.salvando ? 'Salvando…' : ''}</span>` : ''}
    <button class="btn small" data-conta="sair">Sair</button>`;
  rodape.hidden = false;
  rodape.innerHTML = `<span class="quem">${esc(estado.me.nome)}</span><span class="papel ${esc(estado.me.papel)}">${esc(estado.me.papelNome || estado.me.papel)}</span>
    ${estado.me.corrente ? '' : '<button class="btn small" data-conta="senha">Trocar senha</button>'}`;
}

function render() {
  // Fora do app (login, instalação) não mostra o título no topo.
  document.body.classList.toggle('deslogado', !logado());
  if (!logado() || !estado.pronto) {
    tabs.hidden = true;
    renderConta();
    if (!logado()) {
      main.innerHTML = instalado ? (pinLogin ? login.renderPin(erroLogin, pinLogin.nome) : login.render(erroLogin, emailLogin, candidatosLogin)) : login.renderInstalacao(erroLogin);
      if (instalado && !pinLogin && ehAcessoCorrente(emailLogin)) login.ajustarCampoSenha(true);
      if (pinLogin) document.getElementById('l-pin')?.focus();
    }
    return;
  }
  // Abas que o perfil pode ver (a Gira sempre aparece).
  const VE = { usuarios: pode('usuarios:gerenciar'), ervas: pode('ervas:escolher'), oferendas: pode('oferendas:doar'),
    pessoas: pode('pessoas:ver') || pode('alunos:ver'), hist: pode('historico:ver'), eventos: pode('eventos:ver'), perfil: pode('perfil:ver'), gira: true };
  if (!VE[prefs.tab]) prefs.tab = 'gira';
  tabs.hidden = false;
  Object.entries(VE).forEach(([k, v]) => { tabs.querySelector(`[data-tab="${k}"]`).hidden = !v; });
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
  estado.perfil = null;
  erroLogin = 'Sua sessão terminou. Entre de novo.';
  render();
});

// ---------- eventos ----------
tabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  prefs.tab = b.dataset.tab;
  estado.confirm = null;
  // Usuários: busca de novo; o bloco Senhas volta minimizado.
  if (b.dataset.tab === 'usuarios') { estado.usuarios = null; estado.senhasAberto = false; estado.senhaEdit = null; }
  if (b.dataset.tab === 'ervas') estado.ervas = null;
  // Busca as oferendas de novo ao abrir a aba (para ver as que o admin acabou de publicar).
  if (b.dataset.tab === 'oferendas') estado.oferendas = null;
  if (b.dataset.tab === 'perfil') estado.perfil = null;
  salvarPrefs();
  render();
});

async function cliqueConta(e) {
  const b = e.target.closest('[data-conta]');
  if (!b) return;
  if (b.dataset.conta === 'sair') {
    sair();
    Object.assign(estado, { me: null, pessoas: [], giras: {}, usuarios: null, ervas: null, perfil: null, alunos: null, perfisCfg: null, senhas: null, pronto: false, img: null });
    erroLogin = '';
    render();
  } else if (b.dataset.conta === 'senha') {
    const atual = prompt('Sua senha atual:');
    if (atual === null) return;
    const nova = prompt('Nova senha (mínimo 8 caracteres):');
    if (nova === null) return;
    if (nova.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.'); return; }
    try { await trocarSenha(atual, nova); toast('Senha alterada. Outras sessões abertas foram encerradas.'); } catch (err) { toast(err.message); }
  } else if (b.dataset.conta === 'criarsenha') {
    const s1 = prompt('Crie a sua senha: de 4 a 8 números.\nDepois disso, ela será pedida sempre que você entrar.');
    if (s1 === null) return;
    if (!PIN_VALIDO.test(s1.trim())) { toast('A senha precisa ter de 4 a 8 números.'); return; }
    const s2 = prompt('Digite a senha de novo, para confirmar:');
    if (s2 === null) return;
    if (s1.trim() !== s2.trim()) { toast('As senhas não conferem. Tente de novo.'); return; }
    try {
      await criarSenhaCorrente(s1.trim());
      estado.me = { ...estado.me, temSenha: true };
      renderConta();
      toast('Senha criada. Ela será pedida quando você entrar.');
    } catch (err) { toast(err.message); }
  }
}
conta.addEventListener('click', cliqueConta);
saudExtra.addEventListener('click', cliqueConta);
rodape.addEventListener('click', cliqueConta);

main.addEventListener('click', async (e) => {
  if (e.target.closest('[data-conta="recarregar"]')) { iniciar(); return; }
  if (e.target.closest('[data-conta="voltarlogin"]')) { pinLogin = null; erroLogin = ''; render(); return; }
  // Acesso da corrente: a pessoa confirma qual nome cadastrado é o dela.
  const eu = e.target.closest('[data-soueu]');
  if (eu) {
    candidatosLogin = null;
    if (!eu.dataset.soueu) { render(); return; }
    try {
      const r = await entrar(emailLogin, eu.dataset.soueu, digitadoLogin);
      erroLogin = '';
      if (r.candidatos) { candidatosLogin = r.candidatos; render(); return; }
      if (r.precisaSenha) { pinLogin = { nome: r.nome }; render(); return; }
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
  if (e.target.id === 'ent-busca') { estado.entradaBusca = e.target.value; render(); }
  if (e.target.id === 'sn-busca') { estado.senhaBusca = e.target.value; render(); }
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
      if (r.precisaSenha) { pinLogin = { nome: r.nome }; render(); return; }
      await iniciar();
    } catch (err) {
      erroLogin = err.message;
      render();
    }
  } else if (id === 'f-pin') {
    const btn = document.getElementById('l-btn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await entrar(emailLogin, pinLogin.nome, digitadoLogin, document.getElementById('l-pin').value.trim());
      erroLogin = '';
      pinLogin = null;
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); }
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
  } else if (id === 'f-evento' || id === 'f-evento-ed') {
    await eventos.enviar(e.target);
  } else if (id === 'f-perfilnovo') {
    await usuarios.criarPerfil();
  } else if (id === 'f-perfilnome') {
    await usuarios.renomearPerfil(e.target);
  } else if (id === 'f-sn') {
    await usuarios.confirmarSenha(e.target);
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
