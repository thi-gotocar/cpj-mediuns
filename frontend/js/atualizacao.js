// Service worker: guarda os arquivos do app no aparelho (respostas da API, nunca). O build gera o /sw.js.
// A cada abertura ou refresh o app pergunta ao servidor se há versão nova, que baixa em segundo plano.
// Pronta, ela entra sozinha se a pessoa ainda não mexeu em nada; senão aparece o aviso para atualizar.
// Entrar recarrega a página.

import { toast } from './util.js';

const FORA_MINIMO = 5 * 60 * 1000;

export function iniciarAtualizacao({ pendente, digitando }) {
  if (!('serviceWorker' in navigator)) return;
  let registro = null;
  let interagiu = false;
  let saiuEm = 0;
  let recarregando = false;
  const entrar = () => registro?.waiting?.postMessage('atualizar');

  function mostrarAviso() {
    if (document.getElementById('nova-versao')) return;
    const aviso = document.createElement('div');
    aviso.id = 'nova-versao';
    aviso.className = 'nova-versao';
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = '<span>Nova versão disponível</span><button type="button" class="btn small primary">Atualizar</button>';
    aviso.querySelector('button').addEventListener('click', () => {
      if (pendente()) toast('Aguarde terminar de salvar e toque em Atualizar de novo.');
      else entrar();
    });
    document.body.appendChild(aviso);
  }

  // Sem controlador a página já veio do servidor (primeira visita ou Ctrl+Shift+R): não há o que trocar.
  function versaoPronta() {
    if (!registro?.waiting || !navigator.serviceWorker.controller) return;
    if (!interagiu && !pendente() && !digitando()) entrar();
    else mostrarAviso();
  }
  const acompanhar = (sw) => sw?.addEventListener('statechange', () => { if (sw.state === 'installed') versaoPronta(); });
  const procurar = () => registro.update().catch(() => { /* sem conexão: tenta na próxima */ });

  addEventListener('pointerdown', () => { interagiu = true; }, { capture: true });
  addEventListener('keydown', () => { interagiu = true; }, { capture: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then((r) => {
    registro = r;
    r.addEventListener('updatefound', () => acompanhar(r.installing));
    acompanhar(r.installing);
    versaoPronta();
    procurar();
  }).catch(() => { /* sem service worker (ex.: desenvolvimento): o app funciona igual */ });

  // Voltar depois de um tempo fora vale como abrir de novo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
    if (!registro || !saiuEm || Date.now() - saiuEm < FORA_MINIMO) return;
    interagiu = false;
    versaoPronta();
    procurar();
  });
}
