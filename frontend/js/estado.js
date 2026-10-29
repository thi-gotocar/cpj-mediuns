// Estado da tela e todas as chamadas ao backend.
// As telas leem "estado" e chamam as funções daqui; nada fala com a API direto.

import { api } from './api.js';
import { giraVazia, ordenarPessoas } from '/shared/regras.js';
import { hoje, toast } from './util.js';

export const estado = {
  me: null,            // { id, nome, email, papel, permissoes }
  pessoas: [],
  giras: {},           // por data
  usuarios: null,      // só admin
  pronto: false,
  confirm: null,       // item aguardando "Confirmar"
  img: null,           // imagem gerada da escala
  salvando: 0,
};

const PREF = 'sortmediuns:prefs';
export const prefs = { tab: 'gira', data: hoje(), fmt: 'lista', lastFunc: 'medium' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF) || '{}')); } catch { /* sem armazenamento */ }
export function salvarPrefs() {
  try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch { /* ignora */ }
}

let ouvinte = () => {};
export function aoMudar(fn) { ouvinte = fn; }
export const avisar = () => ouvinte();

// ---------- leitura ----------
export const pode = (perm) => !!estado.me && (estado.me.permissoes || []).includes(perm);
export const pessoasOrd = () => ordenarPessoas(estado.pessoas);
export const nome = (id) => estado.pessoas.find((p) => p.id === id)?.nome || '(removido)';
export const girasLista = () => Object.values(estado.giras);
export const giraAtual = () => estado.giras[prefs.data] || giraVazia(prefs.data);

function definirGiras(lista) {
  const novo = {};
  lista.forEach((g) => { novo[g.data] = g; });
  // Não sobrescreve giras com edição ainda não enviada.
  Object.keys(pendente).forEach((d) => { if (estado.giras[d]) novo[d] = estado.giras[d]; });
  estado.giras = novo;
}

export async function carregarTudo() {
  const [me, pessoas, giras] = await Promise.all([api('GET', '/me'), api('GET', '/pessoas'), api('GET', '/giras')]);
  estado.me = me;
  estado.pessoas = pessoas;
  definirGiras(giras);
  estado.pronto = true;
  if (prefs.tab === 'usuarios' && !pode('usuarios:gerenciar')) prefs.tab = 'gira';
  avisar();
}

// Busca o que outras pessoas mudaram (ao voltar para a aba do app).
export async function atualizarDoServidor() {
  if (!estado.pronto || estado.salvando || Object.keys(pendente).length) return;
  try {
    const [pessoas, giras] = await Promise.all([api('GET', '/pessoas'), api('GET', '/giras')]);
    estado.pessoas = pessoas;
    definirGiras(giras);
    avisar();
  } catch { /* silencioso: tenta de novo na próxima vez */ }
}

// ---------- gira: edição com fila de salvamento ----------
const pendente = {};   // data -> campos ainda não enviados
const timers = {};
const fila = {};       // data -> promessa do último envio

function enviar(data) {
  fila[data] = (fila[data] || Promise.resolve()).then(async () => {
    const patch = pendente[data];
    if (!patch) return;
    delete pendente[data];
    estado.salvando++;
    avisarSalvando();
    try {
      const g = await api('PUT', '/giras/' + data, patch);
      if (!pendente[data]) { estado.giras[data] = g; avisar(); }
    } catch (e) {
      toast(e.message);
      try {
        const g = await api('GET', '/giras/' + data);
        if (!pendente[data]) { estado.giras[data] = g; avisar(); }
      } catch { /* mantém o que está na tela */ }
    } finally {
      estado.salvando--;
      avisarSalvando();
    }
  });
  return fila[data];
}

function avisarSalvando() {
  const el = document.getElementById('sync');
  if (el) el.textContent = estado.salvando || Object.keys(pendente).length ? 'Salvando…' : 'Salvo';
}

export function editarGira(patch, { atraso = 0 } = {}) {
  const data = prefs.data;
  estado.giras[data] = { ...giraAtual(), ...patch };
  pendente[data] = { ...(pendente[data] || {}), ...patch };
  avisarSalvando();
  clearTimeout(timers[data]);
  timers[data] = setTimeout(() => enviar(data), atraso);
}

async function descarregar(data) {
  clearTimeout(timers[data]);
  if (pendente[data]) enviar(data);
  await fila[data];
}

async function acaoDaGira(rota) {
  const data = prefs.data;
  await descarregar(data);
  estado.salvando++;
  try {
    const r = await api('POST', `/giras/${data}/${rota}`);
    estado.giras[data] = r.gira;
    toast(r.mensagem);
  } catch (e) {
    toast(e.message);
  } finally {
    estado.salvando--;
    avisar();
  }
}
export const sortear = () => acaoDaGira('sortear');
export const remanejar = () => acaoDaGira('remanejar');

export async function excluirGira(data) {
  try {
    await api('DELETE', '/giras/' + data);
    delete estado.giras[data];
    toast('Gira excluída.');
  } catch (e) { toast(e.message); }
  avisar();
}

// ---------- pessoas ----------
export async function adicionarPessoas(texto, funcao) {
  const r = await api('POST', '/pessoas', { nome: texto, funcao });
  estado.pessoas = r.pessoas;
  avisar();
  return r.criadas;
}

export async function atualizarPessoa(id, patch) {
  const antes = estado.pessoas;
  estado.pessoas = estado.pessoas.map((p) => (p.id === id ? { ...p, ...patch } : p));
  avisar();
  try {
    const p = await api('PATCH', '/pessoas/' + id, patch);
    estado.pessoas = estado.pessoas.map((x) => (x.id === id ? p : x));
  } catch (e) {
    estado.pessoas = antes;
    toast(e.message);
  }
  avisar();
}

export async function excluirPessoa(id) {
  try {
    await api('DELETE', '/pessoas/' + id);
    estado.pessoas = estado.pessoas.filter((p) => p.id !== id);
    definirGiras(await api('GET', '/giras'));
  } catch (e) { toast(e.message); }
  avisar();
}

// ---------- usuários (admin) ----------
export async function carregarUsuarios() {
  try { estado.usuarios = await api('GET', '/usuarios'); } catch (e) { toast(e.message); estado.usuarios = []; }
  avisar();
}
export async function criarUsuario(dados) {
  estado.usuarios = await api('POST', '/usuarios', dados);
  avisar();
}
export async function atualizarUsuario(id, patch) {
  try {
    const u = await api('PATCH', '/usuarios/' + id, patch);
    estado.usuarios = (estado.usuarios || []).map((x) => (x.id === id ? { ...x, ...u } : x));
    toast(patch.senha ? 'Senha alterada.' : 'Usuário atualizado.');
  } catch (e) { toast(e.message); }
  avisar();
}
export async function excluirUsuario(id) {
  try {
    await api('DELETE', '/usuarios/' + id);
    estado.usuarios = (estado.usuarios || []).filter((u) => u.id !== id);
    toast('Usuário excluído.');
  } catch (e) { toast(e.message); }
  avisar();
}

// ---------- backup ----------
export function montarBackup() {
  return {
    app: 'sort-mediuns',
    versao: 2,
    exportado: new Date().toISOString(),
    pessoas: Object.fromEntries(estado.pessoas.map((p) => [p.id, { nome: p.nome, funcao: p.funcao, experiente: !!p.experiente, linhas: p.linhas || [] }])),
    giras: Object.fromEntries(girasLista().map((g) => [g.data, { data: g.data, entidade: g.entidade, presenca: g.presenca, pares: g.pares, passes: g.passes }])),
  };
}
export async function importarBackup(obj) {
  const r = await api('POST', '/importar', obj);
  await carregarTudo();
  return r;
}
