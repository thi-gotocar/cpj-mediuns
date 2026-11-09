// Ponto de entrada do frontend: login, abas, renderização e eventos.

import { estadoDoApp, logado, entrar, instalar, sair, trocarSenha, criarSenhaCorrente } from './auth.js';
import { quandoSessaoExpirar } from './api.js';
import { estado, prefs, salvarPrefs, pode, visaoAtiva, aoMudar, avisar, carregarTudo, atualizarDoServidor, salvarPerfilAgora, mudarVisaoRoot, veErvas, veOferendas, temPendencia } from './estado.js';
import { esc, toast, mascaraTel } from './util.js';
import { iniciarAtualizacao } from './atualizacao.js';
import { ehAcessoGrupo, PIN_VALIDO } from '/shared/permissoes.js';
import { FOTOS_ATIVA } from '/shared/fotos.js';
import * as gira from './telas/gira.js';
import * as eventos from './telas/eventos.js';
import * as curimba from './telas/curimba.js';
import * as login from './telas/login.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const conta = document.getElementById('conta');
const rodape = document.getElementById('rodape');
const saudNome = document.getElementById('saud-nome');
const saudExtra = document.getElementById('saud-extra');
const TELAS = { gira, agenda: gira, eventos, curimba };
// As outras abas só são baixadas quando alguém abre.
const SOB_DEMANDA = {
  pessoas: () => import('./telas/pessoas.js'),
  hist: () => import('./telas/historico.js'),
  ervas: () => import('./telas/ervas.js'),
  oferendas: () => import('./telas/oferendas.js'),
  perfil: () => import('./telas/perfil.js'),
  videos: () => import('./telas/videos.js'),
  fotos: () => import('./telas/fotos.js'),
  usuarios: () => import('./telas/usuarios.js'),
};
const baixando = {};
function telaDe(tab) {
  if (TELAS[tab]) return Promise.resolve(TELAS[tab]);
  baixando[tab] ||= SOB_DEMANDA[tab]()
    .then((m) => { TELAS[tab] = m; return m; })
    .finally(() => { delete baixando[tab]; });
  return baixando[tab];
}
// Aba ainda não baixada: o aviso só aparece se demorar, para não piscar.
function abrirTela(tab) {
  if (baixando[tab]) return;
  const aviso = setTimeout(() => { if (prefs.tab === tab) main.innerHTML = '<div class="loading">Carregando…</div>'; }, 200);
  telaDe(tab).then(() => { clearTimeout(aviso); if (prefs.tab === tab) render(); }).catch(() => {
    clearTimeout(aviso);
    if (prefs.tab === tab) main.innerHTML = '<div class="card"><p class="erro">Não foi possível abrir esta aba. Verifique a internet.</p><button class="btn" data-conta="recarregar-pagina">Tentar de novo</button></div>';
  });
}
let erroLogin = '';
let emailLogin = '';
let candidatosLogin = null;   // acesso da corrente: nomes parecidos para a pessoa confirmar
let digitadoLogin = '';       // o nome como a pessoa digitou (para juntar o que ela preencheu antes)
let pinLogin = null;          // acesso da corrente: a pessoa tem senha → { nome } (pede a senha)
let instalado = true;
let ultimoDesenho = '';    // aba + HTML do último desenho (a aba Vídeos não redesenha se nada mudou)
let arrastoAnamnese = null;

// ---------- render ----------
// Topo: "Seja bem-vindo, Nome!" e o Sair à direita. No fim da página: o perfil e o Trocar senha.
function renderConta() {
  if (!estado.me) { conta.innerHTML = ''; rodape.innerHTML = ''; rodape.hidden = true; saudNome.textContent = ''; saudExtra.innerHTML = ''; return; }
  saudNome.textContent = estado.me.nome;
  // Acesso da corrente sem senha: pode criar uma (depois disso o botão some).
  saudExtra.innerHTML = (estado.me.corrente || estado.me.grupo === 'alunos') && !estado.me.temSenha ? '<button class="btn small" data-conta="criarsenha">🔒 Criar senha</button>' : '';
  // Root escolhe entre a visão administrativa e as visões dos acessos de grupo.
  const root = estado.me.papel === 'root';
  conta.innerHTML = `${pode('giras:editar') ? `<span class="sync" id="sync">${estado.salvando ? 'Salvando…' : ''}</span>` : ''}
    <span class="conta-bts"><button class="btn small" data-conta="sair">Sair</button>
    ${root ? `<label class="visao-root"><span>Visão</span><select data-conta="visao-root" aria-label="Escolher visualização">
      <option value="root" ${estado.visaoRoot === 'root' ? 'selected' : ''}>Root</option>
      <option value="cpj" ${estado.visaoRoot === 'cpj' ? 'selected' : ''}>CPJ</option>
      <option value="alunos" ${estado.visaoRoot === 'alunos' ? 'selected' : ''}>Alunos</option>
      <option value="curimba" ${estado.visaoRoot === 'curimba' ? 'selected' : ''}>Curimba</option>
    </select></label>` : ''}</span>`;
  rodape.hidden = false;
  rodape.innerHTML = `<span class="quem">${esc(estado.me.nome)}</span><span class="papel ${esc(estado.me.papel)}">${esc(estado.me.papelNome || estado.me.papel)}</span>
    ${estado.me.corrente || estado.me.grupo ? '' : '<button class="btn small" data-conta="senha">Trocar senha</button>'}`;
}

function render() {
  // Fora do app (login, instalação) não mostra o título no topo.
  document.body.classList.toggle('deslogado', !logado());
  if (!logado() || !estado.pronto) {
    ultimoDesenho = '';
    tabs.hidden = true;
    renderConta();
    if (!logado()) {
      main.innerHTML = instalado ? (pinLogin ? login.renderPin(erroLogin, pinLogin.nome) : login.render(erroLogin, emailLogin, candidatosLogin)) : login.renderInstalacao(erroLogin);
      if (instalado && !pinLogin && ehAcessoGrupo(emailLogin)) login.ajustarCampoSenha(true);
      if (pinLogin) document.getElementById('l-pin')?.focus();
    }
    return;
  }
  const visao = visaoAtiva();
  // Abas que o perfil pode ver.
  let VE = { usuarios: pode('usuarios:gerenciar'), ervas: veErvas(), oferendas: veOferendas(),
    pessoas: pode('pessoas:ver') || pode('alunos:ver'), hist: pode('historico:ver'), perfil: pode('perfil:ver'), curimba: pode('curimba:ver'), videos: pode('videos:ver') || !!estado.me.videosPublicada, fotos: FOTOS_ATIVA && pode('fotos:ver'), gira: true, agenda: true };
  if (visao === 'alunos') VE = { usuarios: false, ervas: false, oferendas: veOferendas(), pessoas: false, hist: false, perfil: true, curimba: false, videos: false, fotos: false, gira: true, agenda: false };
  if (visao === 'curimba') VE = { usuarios: false, ervas: false, oferendas: false, pessoas: false, hist: false, perfil: false, curimba: false, videos: !!estado.me.videosPublicada, fotos: false, gira: true, agenda: false };
  if (!VE[prefs.tab]) prefs.tab = 'gira';
  tabs.hidden = false;
  Object.entries(VE).forEach(([k, v]) => { tabs.querySelector(`[data-tab="${k}"]`).hidden = !v; });
  tabs.querySelector('[data-tab="gira"]').textContent = 'Geral';
  tabs.querySelector('[data-tab="agenda"]').textContent = 'Gira';
  // Perfil: logo depois de Gira; para quem é admin, depois de Pessoas.
  const btPerfil = tabs.querySelector('[data-tab="perfil"]');
  const antes = tabs.querySelector(pode('pessoas:editar') ? '[data-tab="pessoas"]' : '[data-tab="agenda"]');
  if (VE.perfil && antes.nextElementSibling !== btPerfil) antes.after(btPerfil);
  tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === prefs.tab)));
  renderConta();

  const tela = TELAS[prefs.tab];
  if (!tela) { abrirTela(prefs.tab); return; }
  const html = tela.render();
  // Aba Vídeos: redesenhar recarrega o vídeo que está tocando; se nada mudou na tela, deixa como está.
  const desenho = prefs.tab + '|' + html;
  if (prefs.tab === 'videos' && desenho === ultimoDesenho) return;
  ultimoDesenho = desenho;

  // Preserva o foco e o cursor ao redesenhar.
  const a = document.activeElement;
  // Combos (select) não recebem o foco de volta: no celular isso reabre a lista de opções.
  const fid = a && a.tagName !== 'SELECT' && a.id;
  let ss = null, se = null;
  try { if (fid && a.selectionStart != null) { ss = a.selectionStart; se = a.selectionEnd; } } catch { /* input sem seleção */ }
  main.innerHTML = html;
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
  // Ao abrir o app (ou entrar), começa em Geral; a visão root começa no perfil Root.
  prefs.tab = 'gira';
  estado.visaoRoot = 'root';
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
  estado.curimba = null;
  estado.videos = null;
  estado.fotos = null;
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
  if (b.dataset.tab === 'ervas') { estado.ervas = null; estado.ervasCompra = null; estado.ervasFechar = false; estado.ervasNova = null; estado.ervasHist = null; }
  // Busca as oferendas de novo ao abrir a aba (para ver as que o admin acabou de publicar).
  if (b.dataset.tab === 'oferendas') { estado.oferendas = null; estado.iemanja = null; }
  if (b.dataset.tab === 'perfil') estado.perfil = null;
  // Curimba: busca de novo e fecha as janelas abertas.
  if (b.dataset.tab === 'curimba') { estado.curimba = null; if (estado.curUi) estado.curUi.confirmar = null; }
  // Vídeos: busca de novo e todos voltam fechados.
  if (b.dataset.tab === 'videos') { estado.videos = null; estado.vidUi = null; }
  // Fotos: busca de novo (os links das fotos expiram) e os álbuns voltam fechados, a não ser no meio de um envio.
  if (b.dataset.tab === 'fotos') { estado.fotos = null; if (!estado.fotUi?.envio) estado.fotUi = null; }
  // Histórico: o bloco Giras salvas volta minimizado.
  if (b.dataset.tab === 'hist') { estado.stPerfis = null; estado.salvasAberto = false; }
  salvarPerfilAgora();
  salvarPrefs();
  render();
  window.scrollTo(0, 0);   // a aba nova começa do topo
});

async function cliqueConta(e) {
  const b = e.target.closest('[data-conta]');
  if (!b) return;
  if (b.dataset.conta === 'sair') {
    sair();
    Object.assign(estado, { me: null, pessoas: [], giras: {}, oferendas: null, infoPessoa: null, pfUi: { abertos: {}, infoBuscaVisivel: false, infoBusca: '' }, recadoTxt: null, usuarios: null, ervas: null, iemanja: null, ervasPara: null, ervasCompra: null, perfil: null, alunos: null, curimba: null, minhaCurimba: null, curUi: null, videos: null, vidUi: null, fotos: null, fotUi: null, fotosPessoa: {}, visaoRoot: 'root', perfisCfg: null, senhas: null, pronto: false, img: null });
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
      render();
      toast('Senha criada. Ela será pedida quando você entrar.');
    } catch (err) { toast(err.message); }
  }
}
conta.addEventListener('click', cliqueConta);
conta.addEventListener('change', async (e) => {
  const seletor = e.target.closest('[data-conta="visao-root"]');
  if (!seletor) return;
  await mudarVisaoRoot(seletor.value);
  window.scrollTo(0, 0);
});
saudExtra.addEventListener('click', cliqueConta);
rodape.addEventListener('click', cliqueConta);

main.addEventListener('click', async (e) => {
  if (e.target.closest('[data-conta="recarregar"]')) { iniciar(); return; }
  if (e.target.closest('[data-conta="recarregar-pagina"]')) { location.reload(); return; }
  // Calendário da aba Gira: abre o seletor de data também no computador.
  if (e.target.dataset.act === 'irdata' || e.target.dataset.act === 'iemdata') { try { e.target.showPicker(); } catch { /* o toque já abre */ } return; }
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
  if (a === 'goto') { prefs.tab = el.dataset.tab; salvarPrefs(); render(); window.scrollTo(0, 0); return; }
  const tela = TELAS[prefs.tab];
  if (tela?.cliques && tela.cliques[a]) tela.cliques[a](el, e);
  else render();
});

main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'l-email') { login.ajustarCampoSenha(ehAcessoGrupo(t.value)); return; }
  if (t.id === 'f-ent') { gira.mudancas.entidade(t); return; }
  if (t.id === 'f-import' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; telaDe('hist').then((m) => m.restaurar(f)); return; }
  const tela = TELAS[prefs.tab];
  const fn = t.dataset.act && tela?.mudancas && tela.mudancas[t.dataset.act];
  if (fn) fn(t);
});

main.addEventListener('focusout', (e) => {
  if (e.target.id === 'l-email') login.ajustarCampoSenha(ehAcessoGrupo(e.target.value));
});

main.addEventListener('pointerdown', (e) => {
  const alca = e.target.closest('[data-ana-arrastar]');
  if (!alca || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const lista = alca.closest('.ana-perg');
  const item = alca.closest('[data-pergunta-id]');
  if (!lista || !item || lista.querySelector('.ana-editando')) return;
  e.preventDefault();
  alca.setPointerCapture(e.pointerId);
  arrastoAnamnese = {
    id: e.pointerId,
    alca,
    item,
    lista,
    inicioY: e.clientY,
    idsIniciais: [...lista.querySelectorAll(':scope > [data-pergunta-id]')].map((x) => x.dataset.perguntaId),
    iniciou: false,
  };
});

main.addEventListener('pointermove', (e) => {
  const d = arrastoAnamnese;
  if (!d || d.id !== e.pointerId) return;
  if (!d.iniciou && Math.abs(e.clientY - d.inicioY) < 4) return;
  d.iniciou = true;
  d.lista.classList.add('ana-arrastando');
  d.item.classList.add('ana-movendo');
  const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest('.ana-perg [data-pergunta-id]');
  if (!alvo || alvo.parentElement !== d.lista || alvo === d.item) return;
  const r = alvo.getBoundingClientRect();
  d.lista.insertBefore(d.item, e.clientY < r.top + r.height / 2 ? alvo : alvo.nextSibling);
});

function terminarArrastoAnamnese(e, cancelar = false) {
  const d = arrastoAnamnese;
  if (!d || d.id !== e.pointerId) return;
  arrastoAnamnese = null;
  d.lista.classList.remove('ana-arrastando');
  d.item.classList.remove('ana-movendo');
  if (cancelar) {
    const itens = new Map([...d.lista.querySelectorAll(':scope > [data-pergunta-id]')].map((x) => [x.dataset.perguntaId, x]));
    d.idsIniciais.forEach((id) => { if (itens.has(id)) d.lista.append(itens.get(id)); });
    return;
  }
  const ids = [...d.lista.querySelectorAll(':scope > [data-pergunta-id]')].map((x) => x.dataset.perguntaId);
  if (d.iniciou && ids.some((id, i) => id !== d.idsIniciais[i])) telaDe('perfil').then((m) => m.salvarOrdemAnamnese(ids));
}
main.addEventListener('pointerup', (e) => terminarArrastoAnamnese(e));
main.addEventListener('pointercancel', (e) => terminarArrastoAnamnese(e, true));


main.addEventListener('input', (e) => {
  if (e.target.id === 'l-email') login.ajustarCampoSenha(ehAcessoGrupo(e.target.value));
  if (e.target.id === 'ent-busca') { estado.entradaBusca = e.target.value; render(); }
  if (e.target.id === 'sn-busca') { estado.senhaBusca = e.target.value; render(); }
  if (e.target.id === 'info-pessoa-busca') { const t = e.target; telaDe('perfil').then((m) => m.buscarInfo(t)); }
  if (e.target.id === 'vid-busca') { const t = e.target; telaDe('videos').then((m) => m.buscar(t)); }
  // Pedido de oração: até 3 linhas (não deixa passar da 3ª) e guardado para um redesenho não apagar.
  if (e.target.id === 'or-texto') {
    const linhas = e.target.value.split('\n');
    if (linhas.length > 3) e.target.value = linhas.slice(0, 3).join('\n');
    estado.oraTexto = e.target.value;
  }
  // Recado do admin (⚙️ Evento): até 5 linhas e guardado para um redesenho não apagar.
  if (e.target.id === 'ev-recado') {
    const linhas = e.target.value.split('\n');
    if (linhas.length > 5) e.target.value = linhas.slice(0, 5).join('\n');
    estado.recadoTxt = { data: e.target.dataset.d, texto: e.target.value };
  }
  // Texto colado da escala (Histórico): guardado já, para um redesenho não apagar antes de tocar em "Ler escala".
  if (e.target.id === 'es-msg' && estado.escalaTxt) estado.escalaTxt.msg = e.target.value;
  if (e.target.dataset.mascara === 'data') eventos.mascaraData(e.target, String(e.inputType || '').startsWith('delete'));
  if (e.target.dataset.mascara === 'tel' && !String(e.inputType || '').startsWith('delete')) mascaraTel(e.target);
  if (prefs.tab === 'fotos' && (e.target.id === 'ft-data' || e.target.id === 'ft-nome')) TELAS.fotos.digitando(e.target);
  if (prefs.tab === 'perfil' && (e.target.dataset.act === 'pfinfo' || e.target.dataset.act === 'pfnome' || e.target.dataset.act === 'anaresp')) TELAS.perfil.digitando(e.target);
  if (prefs.tab === 'ervas' && e.target.dataset.compra) TELAS.ervas.digitando(e.target);
});

main.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'f-login') {
    const btn = document.getElementById('l-btn');
    emailLogin = document.getElementById('l-email').value.trim();
    const campoSenha = document.getElementById('l-senha');
    digitadoLogin = campoSenha.value;
    login.ajustarCampoSenha(ehAcessoGrupo(emailLogin), true);
    btn.disabled = true;
    btn.textContent = ehAcessoGrupo(emailLogin) ? 'Procurando usuário…' : 'Entrando…';
    try {
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
  } else if (id === 'f-erva') {
    await (await telaDe('ervas')).enviarFormulario();
  } else if (id === 'f-ren') {
    await (await telaDe('pessoas')).renomear(e.target);
  } else if (id === 'f-aluno') {
    await (await telaDe('pessoas')).salvarAluno(e.target);
  } else if (id === 'f-alunos-turma') {
    await (await telaDe('pessoas')).salvarAlunosTurma(e.target);
  } else if (id === 'f-turma-ed') {
    await (await telaDe('pessoas')).salvarTurma(e.target);
  } else if (id === 'f-lic') {
    await (await telaDe('pessoas')).enviarLicenca();
  } else if (id === 'f-add') {
    await (await telaDe('pessoas')).enviarFormulario();
  } else if (id === 'f-curimba') {
    await (await telaDe('pessoas')).enviarCurimba();
  } else if (id === 'f-limpeza-atribuir') {
    await (await telaDe('pessoas')).cliques.atribuirLimpeza(e.target);
  } else if (id === 'f-limpeza-pessoa-ed') {
    await (await telaDe('pessoas')).salvarTurmaLimpeza(e.target);
  } else if (id === 'f-uren') {
    await (await telaDe('usuarios')).renomear(e.target);
  } else if (id === 'f-evento' || id === 'f-evento-ed') {
    await eventos.enviar(e.target);
  } else if (id === 'f-cur-aluno') {
    await curimba.enviarAluno(e.target);
  } else if (id === 'f-cur-aula' || id === 'f-cur-aula-ed') {
    await curimba.enviarAula(e.target);
  } else if (id === 'f-oracao') {
    await gira.enviarOracao(e.target);
  } else if (id === 'f-ft-album') {
    await (await telaDe('fotos')).enviarAlbum(e.target);
  } else if (id === 'f-video' || id === 'f-video-ed') {
    await (await telaDe('videos')).enviar(e.target);
  } else if (id === 'f-perfilnovo') {
    await (await telaDe('usuarios')).criarPerfil();
  } else if (id === 'f-perfilnome') {
    await (await telaDe('usuarios')).renomearPerfil(e.target);
  } else if (id === 'f-sn') {
    await (await telaDe('usuarios')).confirmarSenha(e.target);
  } else if (id === 'f-user') {
    await (await telaDe('usuarios')).enviarFormulario();
  } else if (id === 'f-entidade-alias') {
    await (await telaDe('usuarios')).salvarApelidoEntidade(e.target);
  } else if (id === 'f-of' || e.target.dataset.form) {
    await (await telaDe('oferendas')).enviar(e.target);
  }
});

// Ao voltar para o app, busca o que outras pessoas mudaram.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') atualizarDoServidor();
  else salvarPerfilAgora();   // saiu do app com o perfil por salvar
});
window.addEventListener('pagehide', salvarPerfilAgora);
window.addEventListener('focus', () => atualizarDoServidor());

iniciar();
iniciarAtualizacao({ pendente: temPendencia, digitando: () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) });
export { avisar };
