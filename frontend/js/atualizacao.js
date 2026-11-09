// Service worker: guarda os arquivos do app no aparelho (respostas da API, nunca). O build gera o /sw.js.
// O app pergunta ao servidor se há versão nova ao abrir, ao dar refresh e ao voltar do segundo plano.
// A versão nova assume assim que baixa. A página recarrega sozinha se a pessoa ainda não mexeu em nada;
// senão aparece o aviso para atualizar.

import { toast } from './util.js';

const FORA_MINIMO = 5 * 60 * 1000;   // tanto tempo fora vale como abrir o app de novo
const BUSCA_MINIMA = 60 * 1000;      // intervalo mínimo entre as perguntas ao servidor

function mostrarVersao() {
  const el = document.getElementById('versao-app');
  if (!el || !('caches' in window)) return;
  caches.keys().then((nomes) => {
    const atual = nomes.filter((n) => n.startsWith('sortmediuns-')).at(-1);
    if (!atual) return;
    el.textContent = 'versão ' + atual.slice('sortmediuns-'.length, 'sortmediuns-'.length + 6);
    el.hidden = false;
  }).catch(() => {});
}

export function iniciarAtualizacao({ pendente, digitando }) {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let registro = null;
  let interagiu = false;
  let saiuEm = 0;
  let buscouEm = 0;
  let recarregando = false;
  // Sem controlador a página já veio do servidor (primeira visita): a primeira troca não é versão nova.
  let tinhaControlador = !!sw.controller;

  const recarregar = () => {
    if (recarregando) return;
    recarregando = true;
    location.reload();
  };

  function mostrarAviso() {
    if (document.getElementById('nova-versao')) return;
    const aviso = document.createElement('div');
    aviso.id = 'nova-versao';
    aviso.className = 'nova-versao';
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = '<span>Nova versão disponível</span><button type="button" class="btn small primary">Atualizar</button>';
    aviso.querySelector('button').addEventListener('click', () => {
      if (pendente()) toast('Aguarde terminar de salvar e toque em Atualizar de novo.');
      else recarregar();
    });
    document.body.appendChild(aviso);
  }

  function procurar() {
    if (!registro || Date.now() - buscouEm < BUSCA_MINIMA) return;
    buscouEm = Date.now();
    registro.update().catch(() => { /* sem conexão: tenta na próxima */ });
  }
  function voltou(fora) {
    if (fora >= FORA_MINIMO) interagiu = false;
    procurar();
  }

  addEventListener('pointerdown', () => { interagiu = true; }, { capture: true });
  addEventListener('keydown', () => { interagiu = true; }, { capture: true });
  sw.addEventListener('controllerchange', () => {
    mostrarVersao();
    if (!tinhaControlador) { tinhaControlador = true; return; }
    if (!interagiu && !pendente() && !digitando()) recarregar();
    else mostrarAviso();
  });

  sw.register('/sw.js').then((r) => {
    registro = r;
    mostrarVersao();
    procurar();
  }).catch(() => { /* sem service worker (ex.: desenvolvimento): o app funciona igual */ });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { saiuEm = Date.now(); return; }
    if (saiuEm) voltou(Date.now() - saiuEm);
  });
  // Página restaurada da memória do navegador, sem carregar de novo.
  addEventListener('pageshow', (e) => { if (e.persisted) voltou(FORA_MINIMO); });
}
