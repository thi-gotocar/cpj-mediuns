// Service worker: guarda os arquivos do app no aparelho (respostas da API, nunca). O build gera o /sw.js.
// A versão nova fica em espera e só entra quando não atrapalha: logo ao abrir, antes de a pessoa
// mexer em algo, ou ao voltar para o app depois de um tempo fora. Entrar recarrega a página.

const FORA_MINIMO = 5 * 60 * 1000;

export function iniciarAtualizacao(ocupado) {
  if (!('serviceWorker' in navigator)) return;
  let registro = null;
  let interagiu = false;
  let saiuEm = 0;
  let recarregando = false;
  const aplicar = () => { if (registro?.waiting && !ocupado()) registro.waiting.postMessage('atualizar'); };

  addEventListener('pointerdown', () => { interagiu = true; }, { once: true, capture: true });
  addEventListener('keydown', () => { interagiu = true; }, { once: true, capture: true });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  });

  navigator.serviceWorker.register('/sw.js').then((r) => {
    registro = r;
    aplicar();
    r.addEventListener('updatefound', () => {
      const novo = r.installing;
      novo?.addEventListener('statechange', () => { if (novo.state === 'installed' && !interagiu) aplicar(); });
    });
  }).catch(() => { /* sem service worker (ex.: desenvolvimento): o app funciona igual */ });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
    if (!registro || !saiuEm || Date.now() - saiuEm < FORA_MINIMO) return;
    registro.update().catch(() => {}).finally(aplicar);
  });
}
