// Ponto de entrada do frontend: login, abas, renderização e eventos.

import { estadoDoApp, logado, entrar, cadastrar, criarSenhaContato, verificarCpf, entrarCpf, criarSenhaCpf, instalar, sair, trocarSenha, criarSenhaCorrente } from './auth.js';
import { quandoSessaoExpirar, definirVerComo } from './api.js';
import { estado, prefs, salvarPrefs, pode, visaoAtiva, aoMudar, avisar, carregarTudo, atualizarDoServidor, atualizarOferendasAoAbrir, atualizarAoAbrir, atualizarUsuariosAoAbrir, registrarVisita, salvarPerfilAgora, mudarVisaoRoot, verComoPessoa, ehRootReal, veErvas, veOferendas, veGuias, veAmaci, veTransparencia, vePedidos, veDiario, veOraculo, veOraculoAdmin, vePessoas, temPendencia } from './estado.js';
import { esc, toast, hoje, mascaraTel, guardarRascunhos, devolverRascunhos, guardarTela, devolverTela } from './util.js';
import { PIN_NOVO, PIN_NOVO_MSG } from '/shared/permissoes.js';
import { cpfValido } from '/shared/perfil.js';
import { FOTOS_ATIVA } from '/shared/fotos.js';
import * as gira from './telas/gira.js';
import * as fila from './telas/giraFila.js';
import * as eventos from './telas/eventos.js';
import * as curimba from './telas/curimba.js';
import * as login from './telas/login.js';

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const conta = document.getElementById('conta');
const rodape = document.getElementById('rodape');
const saudNome = document.getElementById('saud-nome');
const saudExtra = document.getElementById('saud-extra');
const TELAS = { gira, agenda: gira, fila, eventos, curimba };
// As outras abas só são baixadas quando alguém abre.
const SOB_DEMANDA = {
  pessoas: () => import('./telas/pessoas.js'),
  hist: () => import('./telas/historico.js'),
  ervas: () => import('./telas/ervas.js'),
  oferendas: () => import('./telas/oferendas.js'),
  guias: () => import('./telas/guias.js'),
  amaci: () => import('./telas/amaci.js'),
  asaas: () => import('./telas/asaas.js'),
  pedidos: () => import('./telas/pedidos.js'),
  diario: () => import('./telas/diario.js'),
  oraculo: () => import('./telas/oraculo.js'),
  oraculoAdm: () => import('./telas/oraculoAdmin.js'),
  transparencia: () => import('./telas/transparencia.js'),
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
    // O app pode ter atualizado com esta página aberta: a aba nova não encaixa no código antigo. Recarrega uma vez;
    // se a mesma aba falhar de novo logo depois, não entra em laço: mostra o erro (o Atualizar app limpa o cache).
    let ultima = null;
    try { ultima = JSON.parse(sessionStorage.getItem('sm-aba-falhou') || 'null'); } catch { /* */ }
    const repetiu = ultima && ultima.tab === tab && Date.now() - ultima.em < 60000;
    if (navigator.onLine && !temPendencia() && !repetiu) {
      try { sessionStorage.setItem('sm-aba-falhou', JSON.stringify({ tab, em: Date.now() })); } catch { /* */ }
      location.reload();
      return;
    }
    if (prefs.tab === tab) main.innerHTML = `<div class="card"><p class="erro">Não foi possível abrir esta aba.${repetiu ? ' Toque em <b>Atualizar app</b>, no fim da página.' : ' Verifique a internet.'}</p><button class="btn" data-conta="recarregar-pagina">Tentar de novo</button></div>`;
  });
}
let erroLogin = '';
let emailLogin = '';
let telaLogin = '';           // '' (entrar) · 'cadastro' (Criar cadastro) · 'esqueci' (Esqueci a senha) · 'criarsenha'
// /?cadastro (botão Criar cadastro da página /fila): já abre no Criar cadastro; o endereço volta a ser o do app.
if (new URLSearchParams(location.search).has('cadastro')) { telaLogin = 'cadastro'; history.replaceState(null, '', '/'); }
let confirmarLogin = '';      // criar senha sem login: 'celular' ou 'email' (o outro contato do cadastro)
let cadastroDigitado = null;  // o que a pessoa digitou no Criar cadastro (volta depois de um erro)
let cadastroCpf = null;       // Criar cadastro depois do CPF: { cpf, existe, temSenha, confirmar }
let instalado = true;
let ultimoDesenho = '';    // aba + HTML do último desenho (a aba Vídeos não redesenha se nada mudou)
let arrastoAnamnese = null;

// Abas com sub-abas: o botão do topo é o da primeira; as outras viram sub-abas dentro dela. Por dentro continuam
// sendo telas separadas (cada uma com o seu estado e a sua permissão).
const GRUPOS_ABAS = [
  { topo: 'agenda', subs: [['agenda', 'Gira'], ['fila', 'Fila'], ['ervas', 'Ervas'], ['hist', 'Histórico']] },
  { topo: 'guias', subs: [['guias', 'Compras'], ['pedidos', 'Pedidos'], ['asaas', 'ASAAS']] },
  { topo: 'oraculo', subs: [['oraculo', 'Oráculo'], ['oraculoAdm', 'Admin']] },
];
const grupoDa = (tab) => GRUPOS_ABAS.find((g) => g.subs.some(([k]) => k === tab));
function barraSubabas(grupo, VE) {
  const subs = grupo.subs.filter(([k]) => VE[k]);
  if (subs.length < 2) return '';
  return `<div class="subabas subabas-topo" role="tablist" aria-label="Sub-abas">${subs.map(([k, t]) => `<button class="subaba" role="tab" data-sub="${k}" aria-selected="${prefs.tab === k}">${t}</button>`).join('')}</div>`;
}

// ---------- render ----------
// Topo: "Seja bem-vindo, Nome!" e o Sair à direita. No fim da página: o perfil e o Trocar senha.
function renderConta() {
  if (!estado.me) { conta.innerHTML = ''; rodape.innerHTML = ''; rodape.hidden = true; saudNome.textContent = ''; saudExtra.innerHTML = ''; return; }
  saudNome.textContent = estado.me.nome;
  // Acesso da corrente sem senha: pode criar uma (depois disso o botão some).
  saudExtra.innerHTML = estado.verComo ? '<span class="badge new">👁️ Vendo como · só leitura</span>'
    : (estado.me.corrente || estado.me.grupo === 'alunos') && !estado.me.temSenha ? '<button class="btn small" data-conta="criarsenha">🔒 Criar senha</button>' : '';
  // Root escolhe entre a visão administrativa e as visões dos acessos de grupo e, nelas, uma pessoa do cadastro.
  const root = ehRootReal();
  const L = estado.vcLista;
  const opcoesPessoa = estado.visaoRoot === 'alunos' ? L.alunos
    : estado.visaoRoot === 'curimba' ? L.pessoas.filter((p) => p.funcao === 'curimba')
    : L.pessoas.filter((p) => p.funcao !== 'curimba');
  const seletorPessoa = root && estado.visaoRoot !== 'root' ? `<label class="visao-root"><span>Ver como</span><select data-conta="ver-como" aria-label="Ver o app como uma pessoa do cadastro">
      <option value="">— qualquer —</option>${opcoesPessoa.map((p) => `<option value="${esc(p.chave)}" ${p.chave === estado.verComo ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
    </select></label>` : '';
  conta.innerHTML = `${pode('giras:editar') ? `<span class="sync" id="sync">${estado.salvando ? 'Salvando…' : ''}</span>` : ''}
    <span class="conta-bts"><button class="btn small" data-conta="sair">Sair</button>
    ${root ? `<label class="visao-root"><span>Visão</span><select data-conta="visao-root" aria-label="Escolher visualização">
      <option value="root" ${estado.visaoRoot === 'root' ? 'selected' : ''}>Root</option>
      <option value="cpj" ${estado.visaoRoot === 'cpj' ? 'selected' : ''}>CPJ</option>
      <option value="alunos" ${estado.visaoRoot === 'alunos' ? 'selected' : ''}>Alunos</option>
      <option value="curimba" ${estado.visaoRoot === 'curimba' ? 'selected' : ''}>Curimba</option>
    </select></label>` : ''}${seletorPessoa}</span>`;
  rodape.hidden = false;
  rodape.innerHTML = `<span class="quem">${esc(estado.me.nome)}</span><span class="papel ${esc(estado.me.papel)}">${esc(estado.me.papelNome || estado.me.papel)}</span>
    ${estado.me.corrente || estado.me.grupo || !estado.me.email ? '' : '<button class="btn small" data-conta="senha">Trocar senha</button>'}`;
}

function render() {
  // Fora do app (login, instalação) não mostra o título no topo.
  document.body.classList.toggle('deslogado', !logado());
  if (!logado() || !estado.pronto) {
    ultimoDesenho = '';
    tabs.hidden = true;
    renderConta();
    if (!logado()) {
      main.innerHTML = !instalado ? login.renderInstalacao(erroLogin)
        : telaLogin === 'cadastro' ? login.renderCadastro(erroLogin, cadastroCpf)
        : telaLogin === 'esqueci' ? login.renderEsqueci()
        : telaLogin === 'criarsenha' ? login.renderCriarSenha(erroLogin, emailLogin, confirmarLogin)
        : login.render(erroLogin, emailLogin);
      if (telaLogin === 'cadastro' && cadastroDigitado) {
        for (const [id, v] of Object.entries(cadastroDigitado)) { const el = document.getElementById(id); if (el) el.value = v; }
      }
    }
    return;
  }
  const visao = visaoAtiva();
  // Abas que o perfil pode ver.
  let VE = { usuarios: pode('usuarios:gerenciar'), asaas: pode('asaas:ver'), pedidos: vePedidos(), transparencia: veTransparencia(), ervas: veErvas(), oferendas: veOferendas(), guias: veGuias(), amaci: veAmaci(),
    hist: pode('historico:ver'), perfil: pode('perfil:ver') || vePessoas(), curimba: pode('curimba:ver'), videos: pode('videos:ver') || !!estado.me.videosPublicada, fotos: FOTOS_ATIVA && pode('fotos:ver'), diario: veDiario(), fila: fila.veFila(), oraculo: veOraculo(), oraculoAdm: veOraculoAdmin(), gira: true, agenda: true };
  if (visao === 'alunos') VE = { usuarios: false, asaas: false, pedidos: false, transparencia: false, ervas: false, oferendas: veOferendas(), guias: veGuias(), amaci: veAmaci(), hist: false, perfil: true, curimba: false, videos: pode('videos:ver') || !!estado.me.videosPublicada, fotos: false, diario: veDiario(), oraculo: veOraculo(), gira: true, agenda: false };
  // Consulente: a Geral e as abas que o root marcou no perfil Consulentes (Perfil, Compras, Amaci, Vídeos).
  if (visao === 'alunos' && estado.me.consulente) Object.assign(VE, { oferendas: false, perfil: pode('perfil:ver'), guias: veGuias(), amaci: veAmaci(), videos: pode('videos:ver') || !!estado.me.videosPublicada });
  // Grupo Oferenda: só a Geral e a aba Oferendas.
  if (visao === 'alunos' && estado.me.grupoOferenda) VE = { usuarios: false, asaas: false, pedidos: false, transparencia: false, ervas: false, oferendas: veOferendas(), guias: false, amaci: false, hist: false, perfil: false, curimba: false, videos: false, fotos: false, diario: false, oraculo: veOraculo(), gira: true, agenda: false };
  // Aluno sem turma (cadastro novo pelo login): só a Geral, até a administração colocá-lo numa turma.
  if (visao === 'alunos' && estado.me.aguardando) VE = { usuarios: false, asaas: false, pedidos: false, transparencia: false, ervas: false, oferendas: false, guias: false, amaci: false, hist: false, perfil: false, curimba: false, videos: false, fotos: false, diario: false, oraculo: veOraculo(), gira: true, agenda: false };
  if (visao === 'curimba') VE = { usuarios: false, asaas: false, pedidos: false, transparencia: false, ervas: false, oferendas: false, guias: veGuias(), amaci: false, hist: false, perfil: false, curimba: false, videos: !!estado.me.videosPublicada, fotos: false, diario: false, oraculo: false, gira: true, agenda: false };
  // Botão do topo de um grupo que a pessoa não vê (ex.: só o ASAAS, sem Compras): abre a primeira sub-aba que ela vê.
  const grupoAberto = grupoDa(prefs.tab);
  if (grupoAberto && prefs.tab === grupoAberto.topo && !VE[prefs.tab]) prefs.tab = grupoAberto.subs.find(([k]) => VE[k])?.[0] || prefs.tab;
  if (prefs.tab === 'pessoas') prefs.tab = 'perfil';   // a aba Pessoas virou o bloco Pessoas do Perfil
  if (!VE[prefs.tab]) prefs.tab = 'gira';
  tabs.hidden = false;
  Object.entries(VE).forEach(([k, v]) => { tabs.querySelector(`[data-tab="${k}"]`).hidden = !v; });
  // Sub-abas: o botão delas no topo fica escondido; o do grupo aparece se a pessoa vê alguma sub-aba.
  for (const g of GRUPOS_ABAS) {
    g.subs.forEach(([k]) => { if (k !== g.topo) tabs.querySelector(`[data-tab="${k}"]`).hidden = true; });
    tabs.querySelector(`[data-tab="${g.topo}"]`).hidden = !g.subs.some(([k]) => VE[k]);
  }
  tabs.querySelector('[data-tab="gira"]').textContent = 'Geral';
  tabs.querySelector('[data-tab="agenda"]').textContent = 'Gira';
  // Perfil: logo depois do Diário (a aba Pessoas virou o bloco Pessoas do Perfil).
  const btPerfil = tabs.querySelector('[data-tab="perfil"]');
  const antes = tabs.querySelector('[data-tab="diario"]');
  if (VE.perfil && antes.nextElementSibling !== btPerfil) antes.after(btPerfil);
  const abaTopo = grupoDa(prefs.tab)?.topo || prefs.tab;
  tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === abaTopo)));
  renderConta();
  registrarVisita(prefs.tab);

  const tela = TELAS[prefs.tab];
  if (!tela) { abrirTela(prefs.tab); return; }
  // Sub-abas (Gira | Histórico, Compras | ASAAS): só as que a pessoa vê; com uma só, nem aparece a barra.
  const html = (grupoDa(prefs.tab) ? barraSubabas(grupoDa(prefs.tab), VE) : '') + tela.render();
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
  const rascunhos = guardarRascunhos(main);
  const telaAntes = guardarTela(main);
  main.innerHTML = html;
  devolverRascunhos(main, rascunhos);
  devolverTela(main, telaAntes);
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
  // Aberto pela notificação do Oráculo (consulta paga): começa na agenda do Admin do Oráculo.
  if (location.hash === '#oraculo') { prefs.tab = 'oraculoAdm'; history.replaceState(null, '', location.pathname + location.search); }
  estado.visaoRoot = 'root';
  try {
    await carregarTudo();
  } catch (e) {
    if (e.status === 401) return;
    main.innerHTML = `<div class="card"><p class="erro">${esc(e.message)}</p><button class="btn" data-conta="recarregar">Tentar de novo</button></div>`;
  }
}

// Toque na notificação com o app já aberto: o service worker pede para ir à agenda do Admin do Oráculo.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data !== 'abrir-oraculo' || !logado() || !estado.pronto) return;
  tabs.querySelector('[data-tab="oraculoAdm"]')?.click();
});

quandoSessaoExpirar(() => {
  definirVerComo('');
  Object.assign(estado, { verComo: '', meRoot: null });
  estado.me = null;
  estado.pronto = false;
  estado.usuarios = null;
  estado.ervas = null;
  estado.guias = null;
  estado.amaci = null;
  estado.asaas = null;
  estado.transparencia = null;
  estado.diario = null;
  estado.oraculo = null;
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
  // As abas abrem na hora com o que já está no aparelho e buscam de novo por trás (atualizarAoAbrir; a primeira vez
  // carrega). O que volta ao padrão ao entrar (blocos minimizados, janelas fechadas) continua voltando.
  // Admin root: o bloco Senhas volta minimizado.
  // Aba Gira: abre sempre no calendário de hoje (a Geral mostra a próxima gira por conta própria).
  if (b.dataset.tab === 'agenda') { prefs.data = hoje(); salvarPrefs(); }
  if (b.dataset.tab === 'usuarios') { atualizarUsuariosAoAbrir(); estado.senhasAberto = false; estado.senhaEdit = null; estado.visitas = null; }
  if (b.dataset.tab === 'ervas') { atualizarAoAbrir('ervas', '/ervas'); estado.ervasCompra = null; estado.ervasFechar = false; estado.ervasNova = null; estado.ervasHist = null; }
  // Oferendas: abre com o que já está no aparelho e busca de novo por trás (para ver as que o admin acabou de publicar).
  if (b.dataset.tab === 'oferendas') { atualizarOferendasAoAbrir(); TELAS.oferendas?.aoAbrirAba(); }
  // Compras: estoque e pedidos mudam; a tela volta ao padrão.
  if (b.dataset.tab === 'guias') { atualizarAoAbrir('guias', '/oferendas?lista=guias'); TELAS.guias?.limpar(); }
  // Amaci: volta ao último orixá liberado.
  if (b.dataset.tab === 'amaci') { atualizarAoAbrir('amaci', '/pessoas?lista=amaci'); TELAS.amaci?.limpar(); }
  if (b.dataset.tab === 'asaas') { atualizarAoAbrir('asaas', '/oferendas?lista=asaas'); TELAS.asaas?.limpar(); }
  if (b.dataset.tab === 'pedidos') { atualizarAoAbrir('pedidos', '/oferendas?lista=pedidos'); TELAS.pedidos?.limpar(); }
  // Diário: volta ao dia de hoje.
  if (b.dataset.tab === 'diario') { atualizarAoAbrir('diario', '/pessoas?lista=diario'); TELAS.diario?.limpar(); }
  // Oráculo: horários mudam a cada reserva; a tela volta ao calendário.
  if (b.dataset.tab === 'oraculo') { atualizarAoAbrir('oraculo', '/oferendas?lista=oraculo'); TELAS.oraculo?.limpar(); }
  // Oráculo → Admin: mesmos dados; volta à semana (o dia aberto fecha).
  if (b.dataset.tab === 'oraculoAdm') { atualizarAoAbrir('oraculo', '/oferendas?lista=oraculo'); TELAS.oraculoAdm?.limpar(); }
  // Transparência: volta ao mês atual (o guardado só serve se já for o do mês atual).
  if (b.dataset.tab === 'transparencia') {
    if (estado.transparencia?.mes === hoje().slice(0, 7)) atualizarAoAbrir('transparencia', '/giras?lista=transparencia');
    else estado.transparencia = null;
    TELAS.transparencia?.limpar();
  }
  // Perfil: o bloco Pessoas volta aberto, mostrando até o "Ver mais" (o resto recolhido).
  if (b.dataset.tab === 'perfil') { if (pode('perfil:ver')) atualizarAoAbrir('perfil', '/auth/perfil'); estado.pessoasMais = false; if (estado.pfUi) delete estado.pfUi.abertos.pessoas; }
  // Curimba: fecha as janelas abertas.
  if (b.dataset.tab === 'curimba') { atualizarAoAbrir('curimba', '/pessoas?lista=curimba'); if (estado.curUi) estado.curUi.confirmar = null; }
  // Vídeos: todos voltam fechados.
  if (b.dataset.tab === 'videos') { atualizarAoAbrir('videos', '/giras?lista=videos'); estado.vidUi = null; }
  // Fotos: busca de novo (os links das fotos expiram) e os álbuns voltam fechados, a não ser no meio de um envio.
  if (b.dataset.tab === 'fotos') { estado.fotos = null; if (!estado.fotUi?.envio) estado.fotUi = null; }
  // Histórico: o bloco Giras salvas volta minimizado.
  // Fila de senhas: abre com o que já está no aparelho e busca de novo (outros celulares chamam também).
  if (b.dataset.tab === 'fila') fila.atualizarAoAbrir();
  if (b.dataset.tab === 'hist') { atualizarAoAbrir('stPerfis', '/pessoas?lista=perfis'); estado.salvasAberto = false; }
  if (b.dataset.tab === 'agenda') atualizarAoAbrir('stPerfis', '/pessoas?lista=perfis');   // orixá de cabeça do bloco do ano
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
    definirVerComo('');
    Object.assign(estado, { verComo: '', meRoot: null, vcLista: { pessoas: [], alunos: [] } });
    Object.assign(estado, { me: null, pessoas: [], giras: {}, oferendas: null, infoPessoa: null, pfUi: { abertos: {}, infoBuscaVisivel: false, infoBusca: '' }, recadoTxt: null, tituloTxt: null, usuarios: null, ervas: null, guias: null, amaci: null, asaas: null, transparencia: null, diario: null, oraculo: null, iemanja: null, ervasPara: null, ervasCompra: null, perfil: null, alunos: null, curimba: null, minhaCurimba: null, curUi: null, videos: null, vidUi: null, fotos: null, fotUi: null, fotosPessoa: {}, visaoRoot: 'root', perfisCfg: null, senhas: null, pronto: false, img: null });
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
    const s1 = prompt('Crie a sua senha: de 6 a 8 números.\nDepois disso, ela será pedida sempre que você entrar.');
    if (s1 === null) return;
    if (!PIN_NOVO.test(s1.trim())) { toast(PIN_NOVO_MSG); return; }
    const s2 = prompt('Digite a senha de novo, para confirmar:');
    if (s2 === null) return;
    if (s1.trim() !== s2.trim()) { toast('As senhas não conferem. Tente de novo.'); return; }
    // Para confirmar que é a própria pessoa: o celular digitado tem de bater com o do cadastro (o servidor confere).
    const cel = prompt('Para confirmar que é você, digite o seu celular cadastrado, com DDD:');
    if (cel === null) return;
    const d = cel.replace(/\D/g, '');
    if (d.length < 10 || d.length > 11) { toast('Celular inválido: coloque o DDD e o número.'); return; }
    try {
      await criarSenhaCorrente(s1.trim(), d);
      estado.me = { ...estado.me, temSenha: true };
      render();
      toast('Senha criada. Ela será pedida quando você entrar.');
    } catch (err) { toast(err.message); }
  }
}
conta.addEventListener('click', cliqueConta);
conta.addEventListener('change', async (e) => {
  const pessoa = e.target.closest('[data-conta="ver-como"]');
  if (pessoa) { await verComoPessoa(pessoa.value); window.scrollTo(0, 0); return; }
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
  // Seletor de data da Iemanjá: abre o calendário também no computador.
  if (e.target.dataset.act === 'iemdata') { try { e.target.showPicker(); } catch { /* o toque já abre */ } return; }
  // Sub-aba: o mesmo que tocar na aba (cada tela se prepara como sempre).
  const sub = e.target.closest('[data-sub]');
  if (sub) {
    if (sub.dataset.sub !== prefs.tab) tabs.querySelector(`[data-tab="${sub.dataset.sub}"]`).click();
    return;
  }
  if (e.target.closest('[data-conta="voltarlogin"]')) { telaLogin = ''; cadastroDigitado = null; cadastroCpf = null; erroLogin = ''; render(); return; }
  if (e.target.closest('[data-conta="cadastro"]')) { telaLogin = 'cadastro'; cadastroCpf = null; erroLogin = ''; render(); window.scrollTo(0, 0); document.getElementById('c-cpf')?.focus(); return; }
  if (e.target.closest('[data-conta="trocarcpf"]')) { cadastroCpf = null; erroLogin = ''; render(); document.getElementById('c-cpf')?.focus(); return; }
  if (e.target.closest('[data-conta="esqueci"]')) { telaLogin = 'esqueci'; erroLogin = ''; render(); return; }
  // Diário: tocar na barra de energia sem arrastar também marca (o change não dispara quando o valor não muda).
  if (prefs.tab === 'diario' && e.target.dataset.act === 'dienslide') { TELAS.diario.mudancas.dienslide(e.target); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (a === 'askdel') { estado.confirm = el.dataset.k; render(); return; }
  estado.confirm = null;
  if (a === 'goto') { prefs.tab = el.dataset.tab; salvarPrefs(); render(); window.scrollTo(0, 0); return; }
  // Tela embutida em outra aba (ex.: Pessoas dentro do Perfil): o toque vai para ela.
  const embutida = el.closest('[data-tela]')?.dataset.tela;
  const tela = embutida ? await telaDe(embutida) : TELAS[prefs.tab];
  if (tela?.cliques && tela.cliques[a]) tela.cliques[a](el, e);
  else render();
});

main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'f-ent') { gira.mudancas.entidade(t); return; }
  if (t.classList?.contains('cd-resp-txt')) { gira.mudancas.cdresp(t); return; }
  // Transparência: troca de mês e o interruptor Visível para a corrente.
  if (prefs.tab === 'transparencia' && (t.id === 'tr-mes' || t.dataset.act === 'trpublicar')) { TELAS.transparencia?.mudou(t); return; }
  if (prefs.tab === 'oferendas' && t.form?.querySelector('[data-previa]')) TELAS.oferendas?.atualizarPrevia(t.form);
  if (t.id === 'f-import' && t.files && t.files[0]) { const f = t.files[0]; t.value = ''; telaDe('hist').then((m) => m.restaurar(f)); return; }
  const embutida = t.closest?.('[data-tela]')?.dataset.tela;
  if (embutida) { telaDe(embutida).then((m) => m.mudancas?.[t.dataset.act]?.(t)); return; }
  const tela = TELAS[prefs.tab];
  const fn = t.dataset.act && tela?.mudancas && tela.mudancas[t.dataset.act];
  if (fn) fn(t);
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
  // Criar cadastro: com os 11 números de um CPF válido, já procura (sem precisar tocar em Continuar).
  if (e.target.id === 'c-cpf' && e.target.form?.id === 'f-cadcpf' && cpfValido(e.target.value)) e.target.form.requestSubmit();
  if (e.target.id === 'ent-busca') { estado.entradaBusca = e.target.value; render(); }
  if (e.target.id === 'sn-busca') { estado.senhaBusca = e.target.value; render(); }
  if (e.target.id === 'us-busca') { estado.usBusca = e.target.value; render(); }
  if (e.target.id === 'info-pessoa-busca') { const t = e.target; telaDe('perfil').then((m) => m.buscarInfo(t)); }
  if (e.target.id === 'vid-busca') { const t = e.target; telaDe('videos').then((m) => m.buscar(t)); }
  // Relato e resposta da Gestão de Conduta e Risco: até 10 linhas, guardados para um redesenho não apagar.
  if (gira.digitarConduta(e.target)) return;
  // Balcão da fila de senhas: guardado para a atualização automática do painel não apagar.
  if (fila.digitarFila(e.target)) return;
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
  // Detalhes da sub-aba de Oferendas: até 10 linhas e guardado para um redesenho não apagar.
  if (e.target.id === 'of-det') {
    const linhas = e.target.value.split('\n');
    if (linhas.length > 10) e.target.value = linhas.slice(0, 10).join('\n');
    estado.ofUi.detRascunho = { id: e.target.dataset.id, texto: e.target.value };
    e.target.rows = Math.min(10, Math.max(2, e.target.value.split('\n').length));   // o campo cresce com o texto
  }
  if (e.target.id === 'gira-titulo') estado.tituloTxt = { data: e.target.dataset.d, texto: e.target.value };
  // Texto colado da escala (Histórico): guardado já, para um redesenho não apagar antes de tocar em "Ler escala".
  if (e.target.dataset.mascara === 'data') eventos.mascaraData(e.target, String(e.inputType || '').startsWith('delete'));
  if (e.target.dataset.mascara === 'tel' && !String(e.inputType || '').startsWith('delete')) mascaraTel(e.target);
  if (prefs.tab === 'fotos' && (e.target.id === 'ft-data' || e.target.id === 'ft-nome')) TELAS.fotos.digitando(e.target);
  if (prefs.tab === 'perfil' && (e.target.dataset.act === 'pfinfo' || e.target.dataset.act === 'pfcpf' || e.target.dataset.act === 'pfnome' || e.target.dataset.act === 'anaresp')) TELAS.perfil.digitando(e.target);
  if (prefs.tab === 'ervas' && e.target.dataset.compra) TELAS.ervas.digitando(e.target);
  if (prefs.tab === 'guias' && e.target.dataset.guia) TELAS.guias.digitando(e.target);
  // Orientação da aba Amaci: até 10 linhas, guardada para um redesenho não apagar.
  if (prefs.tab === 'amaci' && e.target.id === 'am-ori') TELAS.amaci.digitando(e.target);
  // Diário: conselho e reflexão guardados enquanto digita (salvam ao sair do campo).
  if (prefs.tab === 'diario' && e.target.dataset.diario) TELAS.diario.digitando(e.target);
  if (prefs.tab === 'diario' && e.target.dataset.act === 'dienslide') TELAS.diario.arrastando(e.target);
  if (prefs.tab === 'oferendas' && e.target.form?.querySelector('[data-previa]')) TELAS.oferendas?.atualizarPrevia(e.target.form);
});

main.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'f-login') {
    const btn = document.getElementById('l-btn');
    emailLogin = document.getElementById('l-email').value.trim();
    const senha = document.getElementById('l-senha').value;
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const r = await entrar(emailLogin, senha);
      erroLogin = '';
      if (r.criarSenha) { telaLogin = 'criarsenha'; confirmarLogin = r.confirmar; render(); document.getElementById('cs-conf')?.focus(); return; }
      await iniciar();
    } catch (err) {
      erroLogin = err.message;
      render();
    }
  } else if (id === 'f-criarsenha') {
    const v = (x) => document.getElementById(x).value;
    if (v('cs-senha') !== v('cs-senha2')) { erroLogin = 'As senhas não conferem.'; render(); return; }
    const btn = document.getElementById('cs-btn');
    btn.disabled = true;
    btn.textContent = 'Criando…';
    try {
      await criarSenhaContato(emailLogin, v('cs-conf').trim(), v('cs-senha'));
      erroLogin = '';
      telaLogin = '';
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); }
  } else if (id === 'f-cadcpf') {
    // Criar cadastro, 1º passo: o CPF já tem cadastro?
    const btn = document.getElementById('c-btn');
    if (btn.disabled) return;
    const cpf = document.getElementById('c-cpf').value.trim();
    btn.disabled = true;
    btn.textContent = 'Procurando…';
    try {
      cadastroCpf = { cpf, ...(await verificarCpf(cpf)) };
      erroLogin = '';
      render();
      window.scrollTo(0, 0);
      document.querySelector('#f-cadsenha input:not([disabled]), #f-cadcriar input:not([disabled]), #f-cadastro input:not([disabled])')?.focus();
    } catch (err) {
      erroLogin = err.message;
      render();
      const el = document.getElementById('c-cpf');
      if (el) { el.value = cpf; el.focus(); }
    }
  } else if (id === 'f-cadsenha') {
    const btn = document.getElementById('c-btn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const r = await entrarCpf(cadastroCpf.cpf, document.getElementById('c-senha').value.trim());
      erroLogin = '';
      if (r.criarSenha) { cadastroCpf = { ...cadastroCpf, temSenha: false, confirmar: r.confirmar }; render(); return; }
      telaLogin = '';
      cadastroCpf = null;
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); }
  } else if (id === 'f-cadcriar') {
    const v = (x) => document.getElementById(x).value;
    if (v('c-senha') !== v('c-senha2')) { erroLogin = 'As senhas não conferem.'; render(); return; }
    const btn = document.getElementById('c-btn');
    btn.disabled = true;
    btn.textContent = 'Criando…';
    try {
      await criarSenhaCpf(cadastroCpf.cpf, v('c-conf').trim(), v('c-senha'));
      erroLogin = '';
      telaLogin = '';
      cadastroCpf = null;
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); }
  } else if (id === 'f-cadastro') {
    const v = (x) => document.getElementById(x).value;
    cadastroDigitado = Object.fromEntries(['c-nome', 'c-celular', 'c-email'].map((x) => [x, v(x)]));
    if (v('c-senha') !== v('c-senha2')) { erroLogin = 'As senhas não conferem.'; render(); return; }
    const btn = document.getElementById('c-btn');
    btn.disabled = true;
    btn.textContent = 'Criando…';
    try {
      await cadastrar({ nome: v('c-nome').trim(), celular: v('c-celular'), email: v('c-email').trim(), cpf: cadastroCpf.cpf, senha: v('c-senha') });
      erroLogin = '';
      telaLogin = '';
      cadastroDigitado = null;
      cadastroCpf = null;
      await iniciar();
    } catch (err) { erroLogin = err.message; render(); window.scrollTo(0, 0); }
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
  } else if (id === 'f-cad-dados') {
    await (await telaDe('pessoas')).salvarDadosCadastro(e.target);
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
  } else if (id === 'f-materia') {
    await (await telaDe('pedidos')).enviarMateria(e.target);
  } else if (id === 'f-evtipo') {
    await eventos.enviarTipo(e.target);
  } else if (id === 'f-cur-aluno') {
    await curimba.enviarAluno(e.target);
  } else if (id === 'f-cur-aula' || id === 'f-cur-aula-ed') {
    await curimba.enviarAula(e.target);
  } else if (id === 'f-oracao') {
    await gira.enviarOracao(e.target);
  } else if (id === 'f-conduta') {
    await gira.enviarConduta(e.target);
  } else if (id === 'f-fila-balcao') {
    await fila.enviarBalcaoFila(e.target);
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
  } else if (id === 'f-config') {
    await (await telaDe('usuarios')).salvarConfig(e.target);
  } else if (id === 'f-regras') {
    await (await telaDe('usuarios')).salvarRegras(e.target);
  } else if (id === 'f-entidade-alias') {
    await (await telaDe('usuarios')).salvarApelidoEntidade(e.target);
  } else if (id === 'f-amaci-ori') {
    await (await telaDe('amaci')).enviar(e.target);
  } else if (id === 'f-amaci-novo') {
    await (await telaDe('amaci')).enviarNovoAmaci(e.target);
  } else if (id === 'f-amaci-ed') {
    await (await telaDe('amaci')).enviarEdicao(e.target);
  } else if (id === 'f-di-erva') {
    await (await telaDe('diario')).addErva(e.target);
  } else if (id === 'f-tr-val' || id === 'f-tr-busca') {
    await (await telaDe('transparencia')).enviar(e.target);
  } else if (e.target.dataset.form === 'asaascredito' || e.target.dataset.form === 'asaasbusca') {
    await (await telaDe('asaas')).enviar(e.target);
  } else if (id.startsWith('f-guia-')) {
    await (await telaDe('guias')).enviar(e.target);
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
// A atualização roda à parte (js/atualizacao.js, script próprio antes deste): aqui só avisa que o app abriu e o que ela
// precisa saber dele.
window.__smApp = { pendente: temPendencia, digitando: () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName), toast };
window.__smAberto = true;
export { avisar };
