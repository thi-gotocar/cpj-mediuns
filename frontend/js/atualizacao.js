// Service worker: guarda os arquivos do app no aparelho (respostas da API, nunca). O build gera o /sw.js.
// O app pergunta ao servidor se há versão nova ao abrir, ao dar refresh e ao voltar do segundo plano.
// A versão nova baixa só o que mudou e fica esperando pronta: ela só assume junto com o recarregamento da página
// (nunca no meio do uso, para não misturar arquivos de duas versões). Recarrega sozinha se a pessoa ainda não mexeu
// em nada; senão aparece o aviso para atualizar.
//
// Este arquivo roda sozinho, num <script> próprio antes do main.js, e não importa nada do app: se uma versão
// publicada quebrar a abertura, ele continua de pé para baixar a corrigida. O main.js, quando termina de abrir,
// avisa por window.__smApp (o que está pendente, se está digitando e o toast); até lá vale o padrão (nada pendente).
//   Rede de segurança: com a página vinda do cache (há controlador) e o app sem abrir em 12 s, troca para a versão
//   que estiver esperando ou, sem nenhuma, limpa o cache do app e recarrega — uma vez por sessão.
//   Botão "Atualizar app" (rodapé, ao lado da versão): procura a versão nova e troca; se não houver, limpa o cache do
//   app e recarrega (o mesmo que apagar o atalho, sem apagar).

const FORA_MINIMO = 5 * 60 * 1000;   // tanto tempo fora vale como abrir o app de novo
const BUSCA_MINIMA = 60 * 1000;      // intervalo mínimo entre as perguntas ao servidor
const ESPERA_TROCA = 4000;           // se a troca não confirmar nesse tempo, recarrega mesmo assim
const ESPERA_ABERTURA = 12000;       // o app não abriu nesse tempo (com os arquivos no aparelho): algo travou
const ESPERA_DOWNLOAD = 20000;       // Atualizar app: quanto espera a versão nova baixar
const RESGATE = 'sm-resgate';        // sessionStorage: a rede de segurança já agiu nesta sessão

const app = () => window.__smApp || {};
const pendente = () => { try { return !!app().pendente?.(); } catch { return false; } };
const digitando = () => { try { return !!app().digitando?.(); } catch { return false; } };
// Sem o app (abertura quebrada), o aviso vai num toast simples, no mesmo elemento.
function avisar(msg) {
  if (app().toast) { app().toast(msg); return; }
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { t.hidden = true; }, 3500);
}
const lerSessao = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const gravarSessao = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

// A versão que está servindo esta página (o service worker responde). Fica também em window.__smVersao: o api.js
// manda em todo pedido (X-App-Versao), para o root ver quem está em outra versão e poder exigir a nova.
function mostrarVersao() {
  const el = document.getElementById('versao-app');
  const ativo = navigator.serviceWorker?.controller;
  if (!ativo) return;
  const canal = new MessageChannel();
  canal.port1.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    window.__smVersao = e.data;
    if (!el) return;
    el.textContent = 'versão ' + e.data.slice(0, 6);
    el.hidden = false;
  };
  ativo.postMessage('versao', [canal.port2]);
}

// Apaga o cache do app e o service worker e recarrega do servidor: o mesmo que apagar o atalho. Os dados da pessoa
// (login, preferências) ficam: estão no localStorage, não no cache.
async function limparERecarregar() {
  try {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith('sortmediuns-')).map((n) => caches.delete(n)));
  } catch { /* sem Cache Storage */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch { /* sem service worker */ }
  location.reload();
}

function iniciar() {
  const botao = document.getElementById('atualizar-app');
  if (!('serviceWorker' in navigator)) {
    botao?.addEventListener('click', () => location.reload());
    return;
  }
  const sw = navigator.serviceWorker;
  let registro = null;
  let interagiu = false;
  let saiuEm = 0;
  let buscouEm = 0;
  let recarregando = false;
  let trocando = false;   // esta página pediu a troca e vai recarregar

  const recarregar = () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  };

  // Ativa a versão que está esperando e recarrega a página com ela.
  function ativar() {
    const espera = registro?.waiting;
    if (!espera) { recarregar(); return; }
    trocando = true;
    espera.postMessage('atualizar');
    setTimeout(recarregar, ESPERA_TROCA);
  }

  function mostrarAviso() {
    if (document.getElementById('nova-versao')) return;
    const aviso = document.createElement('div');
    aviso.id = 'nova-versao';
    aviso.className = 'nova-versao';
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = '<span>Nova versão disponível</span><button type="button" class="btn small primary">Atualizar</button>';
    aviso.querySelector('button').addEventListener('click', () => {
      if (pendente()) avisar('Aguarde terminar de salvar e toque em Atualizar de novo.');
      else ativar();
    });
    document.body.appendChild(aviso);
  }

  // Versão nova pronta (baixada e esperando): troca já se a pessoa não mexeu em nada; senão, avisa.
  function pronta() {
    if (!registro?.waiting || !sw.controller) return;   // sem controlador é a primeira visita: nada a trocar
    if (!interagiu && !pendente() && !digitando()) ativar();
    else mostrarAviso();
  }

  function acompanhar(r) {
    r.addEventListener('updatefound', () => {
      const novo = r.installing;
      novo?.addEventListener('statechange', () => { if (novo.state === 'installed') pronta(); });
    });
  }

  function procurar() {
    if (!registro || Date.now() - buscouEm < BUSCA_MINIMA) return;
    buscouEm = Date.now();
    registro.update().catch(() => { /* sem conexão: tenta na próxima */ });
  }
  function voltou(fora) {
    if (fora >= FORA_MINIMO) interagiu = false;
    pronta();
    procurar();
  }

  // Espera a versão que está baixando terminar (instalada → fica esperando) ou falhar. → true se ficou esperando.
  function esperarInstalar(ms) {
    return new Promise((ok) => {
      const novo = registro?.installing;
      if (!novo) { ok(!!registro?.waiting); return; }
      const fim = setTimeout(() => ok(!!registro?.waiting), ms);
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' || novo.state === 'redundant') { clearTimeout(fim); ok(!!registro?.waiting); }
      });
    });
  }

  // Botão Atualizar app: com versão nova, troca; sem, limpa o cache do app e recarrega.
  let atualizando = false;
  botao?.addEventListener('click', async () => {
    if (atualizando) return;
    if (pendente()) { avisar('Aguarde terminar de salvar e toque em Atualizar app de novo.'); return; }
    if (!navigator.onLine) { avisar('Sem internet: conecte e toque em Atualizar app de novo.'); return; }
    atualizando = true;
    botao.disabled = true;
    botao.textContent = 'Atualizando…';
    try {
      if (registro && !registro.waiting) {
        buscouEm = Date.now();
        await registro.update().catch(() => {});
        await esperarInstalar(ESPERA_DOWNLOAD);
      }
      if (registro?.waiting) { ativar(); return; }
    } catch { /* cai na limpeza */ }
    await limparERecarregar();
  });

  // Forçar atualização (o root exigiu outra versão; o api.js chama ao ver o cabeçalho X-App-Versao-Exigida): troca
  // na hora, mesmo com o aviso ignorado, esperando só terminar o que está salvando ou sendo digitado. Uma vez por
  // versão exigida e por sessão: se a exigida não chegar (versão que não existe mais), não fica recarregando.
  let forcando = false;
  window.__smForcar = async (exigida) => {
    if (forcando || atualizando || recarregando) return;
    const chave = 'sm-forcou:' + exigida;
    if (lerSessao(chave)) return;
    if (pendente() || digitando()) { setTimeout(() => window.__smForcar(exigida), 5000); return; }
    forcando = true;
    gravarSessao(chave, String(Date.now()));
    avisar('Atualizando o app para a versão nova…');
    try {
      if (registro && !registro.waiting) {
        buscouEm = Date.now();
        await registro.update().catch(() => {});
        await esperarInstalar(ESPERA_DOWNLOAD);
      }
      if (registro?.waiting) { ativar(); return; }
    } catch { /* cai na limpeza */ }
    await limparERecarregar();
  };

  addEventListener('pointerdown', () => { interagiu = true; }, { capture: true });
  addEventListener('keydown', () => { interagiu = true; }, { capture: true });
  // A troca pedida por esta página: recarrega. Pedida por outra aba (ou app antigo que troca sozinho): esta página
  // ficou com arquivos de outra versão, então recarrega também (ou avisa, se a pessoa está mexendo).
  // Primeira visita (sem controlador): o service worker instala e assume sem recarregar (a página já veio do servidor).
  let tinhaControlador = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!tinhaControlador) { tinhaControlador = true; mostrarVersao(); return; }
    if (trocando || (!interagiu && !pendente() && !digitando())) recarregar();
    else mostrarAviso();
  });

  sw.register('/sw.js').then((r) => {
    registro = r;
    acompanhar(r);
    mostrarVersao();
    pronta();
    procurar();
  }).catch(() => { /* sem service worker (ex.: desenvolvimento): o app funciona igual */ });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
    if (saiuEm) voltou(Date.now() - saiuEm);
  });
  // Página restaurada da memória do navegador, sem carregar de novo.
  addEventListener('pageshow', (e) => { if (e.persisted) voltou(FORA_MINIMO); });

  // Rede de segurança: a página veio do cache (abre rápido) e o app não avisou que abriu. Uma vez por sessão.
  if (sw.controller) {
    setTimeout(async () => {
      if (window.__smAberto || lerSessao(RESGATE) || !navigator.onLine) return;
      gravarSessao(RESGATE, String(Date.now()));
      try {
        if (registro && !registro.waiting) { await registro.update().catch(() => {}); await esperarInstalar(ESPERA_DOWNLOAD); }
      } catch { /* */ }
      if (window.__smAberto) return;
      if (registro?.waiting) { trocando = true; registro.waiting.postMessage('atualizar'); setTimeout(recarregar, ESPERA_TROCA); return; }
      await limparERecarregar();
    }, ESPERA_ABERTURA);
  }
}

iniciar();

// Compatibilidade: o main.js de antes desta versão importava e chamava esta função. Se ele chegar a carregar este
// arquivo novo, não faz nada (a atualização já está rodando acima).
export function iniciarAtualizacao() {}
