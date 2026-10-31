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
  ervas: null,         // compra de ervas (GET /api/ervas)
  ervasVista: null,
  ervasImg: null,      // imagem gerada do pedido ao fornecedor / cobrança
  ervasPara: null,     // admin montando o pedido de outra pessoa: { chave?, nome, itens: { ervaId: qtd } }    // 'fornecedor' | 'cobranca' (exportação aberta na aba Ervas)
  pronto: false,
  confirm: null,       // item aguardando "Confirmar"
  img: null,           // imagem gerada da escala
  manual: null,
  renomear: null,
  editLic: null,
  renomearUsuario: null, // id do usuário com o nome em edição (aba Usuários)
  giraAntiga: null,
  oferendas: null,     // GET /api/oferendas: { oferendas, eu }
  perfil: null,        // GET /api/auth/perfil: { eu, todos? } (ou { erro })
  pfUi: { abertos: {}, faltam: false },
  perfisCfg: null,     // aba Usuários: perfis e as abas de cada um
  senhas: null,        // aba Usuários: quem tem senha (PIN) no acesso da corrente
  alunos: null,        // aba Pessoas: { turmas, alunos }
  eventos: [],         // eventos da casa (aba Eventos e "Eventos da semana")
  ofUi: { editar: null, editarItem: null, compartilhar: null, img: null },    // formulário "Cadastrar gira antiga" (aba Histórico)       // id da licença em edição (aba Pessoas)      // id da pessoa com o nome em edição (aba Pessoas)        // data da gira com "Ajuste manual" ligado (giras passadas já vêm ligadas)
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
  const [me, pessoas, giras, eventos] = await Promise.all([api('GET', '/auth/me'), api('GET', '/pessoas'), api('GET', '/giras'),
    api('GET', '/giras?lista=eventos').catch(() => [])]);
  estado.me = me;
  estado.eventos = eventos;
  estado.pessoas = pessoas;
  definirGiras(giras);
  estado.pronto = true;
  if (prefs.tab === 'usuarios' && !pode('usuarios:gerenciar')) prefs.tab = 'gira';
  // Acesso da corrente: abre direto a próxima gira com escala (ou a mais recente).
  if (!pode('escala:completa') && !estado.giras[prefs.data]) {
    const datas = Object.keys(estado.giras).sort();
    prefs.data = datas.find((d) => d >= hoje()) || datas[datas.length - 1] || hoje();
  }
  avisar();
}

// Busca o que outras pessoas mudaram (ao voltar para a aba do app).
let ultimaAtualizacao = 0;
export async function atualizarDoServidor() {
  if (!estado.pronto || estado.salvando || Object.keys(pendente).length) return;
  // Evita buscar de novo a cada foco (no celular, abrir e fechar o seletor de data dispara foco).
  if (Date.now() - ultimaAtualizacao < 15000) return;
  ultimaAtualizacao = Date.now();
  try {
    const [pessoas, giras, eventos] = await Promise.all([api('GET', '/pessoas'), api('GET', '/giras'), api('GET', '/giras?lista=eventos').catch(() => estado.eventos)]);
    estado.pessoas = pessoas;
    estado.eventos = eventos || [];
    definirGiras(giras);
    // Oferendas: pega o que o admin publicou ou o que outros doaram (se não houver doação minha a enviar).
    if (estado.oferendas !== null && prefs.tab === 'oferendas' && !Object.values(timersDoacao).some(Boolean)) {
      estado.oferendas = await api('GET', '/oferendas');
    }
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
  if (el) el.textContent = estado.salvando || Object.keys(pendente).length ? 'Salvando…' : '';   // só aparece enquanto salva
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
// Encerrar / reabrir a gira (POST /api/giras/:data { acao }).
async function situacaoDaGira(acao, extra = {}) {
  const data = prefs.data;
  await descarregar(data);
  estado.salvando++;
  try {
    const r = await api('POST', '/giras/' + data, { acao, ...extra });
    estado.giras[data] = r.gira;
    estado.manual = null;
    toast(r.mensagem);
  } catch (e) {
    toast(e.message);
  } finally {
    estado.salvando--;
    avisar();
  }
}
export const encerrarGira = (atendimentos) => situacaoDaGira('encerrar', { atendimentos });
export const reabrirGira = () => situacaoDaGira('reabrir');
export const reiniciarGira = () => situacaoDaGira('reiniciar');
// Acesso da corrente: a própria pessoa declara que não vai (Pendente → Ausente).
export const declararAusencia = () => situacaoDaGira('ausencia');
export const sortear = () => acaoDaGira('sortear');
export const remanejar = () => acaoDaGira('remanejar');

// Gira antiga (só registro): data, entidade, presença e atendidos, já encerrada e sem escala.
export async function cadastrarGiraAntiga(data, dados) {
  try {
    estado.giras[data] = await api('PUT', '/giras/' + data, { ...dados, encerrada: true });
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

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
    estado.pessoas = estado.pessoas.map((x) => (x.id === id ? { ...x, ...p } : x));
  } catch (e) {
    estado.pessoas = antes;
    toast(e.message);
  }
  avisar();
}

// Licenças (admin): a resposta é a lista da corrente atualizada.
export async function salvarLicenca(pessoaId, inicio, fim, motivo = '') {
  try {
    estado.pessoas = await api('POST', '/pessoas', { acao: 'licenca', pessoaId, inicio, fim, motivo });
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}
export async function editarLicenca(id, inicio, fim, motivo = '') {
  try {
    estado.pessoas = await api('POST', '/pessoas', { acao: 'editarLicenca', id, inicio, fim, motivo });
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}
export async function removerLicenca(id) {
  try {
    estado.pessoas = await api('POST', '/pessoas', { acao: 'removerLicenca', id });
    toast('Licença removida.');
  } catch (e) { toast(e.message); }
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
  try {
    const [u, f, s] = await Promise.all([api('GET', '/usuarios'), api('GET', '/usuarios?lista=perfis'), api('GET', '/usuarios?lista=senhas')]);
    Object.assign(estado, { usuarios: u, perfisCfg: f, senhas: s });
  } catch (e) { toast(e.message); Object.assign(estado, { usuarios: estado.usuarios || [], perfisCfg: estado.perfisCfg || [], senhas: estado.senhas || [] }); }
  avisar();
}
// Perfis (acao 'perfil' / 'excluirPerfil') e senha da corrente (acao 'pin').
export async function acaoUsuarios(acao, dados = {}) {
  try {
    const r = await api('POST', '/usuarios', { acao, ...dados });
    if (acao === 'pin') estado.senhas = r; else estado.perfisCfg = r;
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- eventos da casa ----------
export async function acaoEventos(acao, dados = {}) {
  try {
    estado.eventos = await api('POST', '/giras', { acao, ...dados });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- alunos da CPJ (aba Pessoas) ----------
export async function carregarAlunos() {
  try { estado.alunos = await api('GET', '/pessoas?lista=alunos'); } catch (e) { toast(e.message); estado.alunos = estado.alunos || { turmas: [], alunos: [] }; }
  avisar();
}
export async function acaoAlunos(acao, dados = {}) {
  try {
    const r = await api('POST', '/pessoas', { acao, ...dados });
    estado.alunos = { turmas: r.turmas, alunos: r.alunos };
    avisar();
    return r;
  } catch (e) { toast(e.message); avisar(); return null; }
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
    pessoas: Object.fromEntries(estado.pessoas.map((p) => [p.id, { nome: p.nome, funcao: p.funcao, experiente: !!p.experiente, linhas: p.linhas || [], limpeza: p.limpeza || null, entrada: p.entrada || null }])),
    giras: Object.fromEntries(girasLista().map((g) => [g.data, { data: g.data, entidade: g.entidade, encerrada: !!g.encerrada, atendimentos: g.atendimentos || null, limpeza: g.limpeza || null, orixa: g.orixa || '', pendentePadrao: !!g.pendentePadrao, papeis: g.papeis || {}, presenca: g.presenca, pares: g.pares, passes: g.passes }])),
  };
}
export async function importarBackup(obj) {
  const r = await api('POST', '/importar', obj);
  await carregarTudo();
  return r;
}

// ---------- ervas ----------
export async function carregarErvas() {
  try { estado.ervas = await api('GET', '/ervas'); } catch (e) { toast(e.message); estado.ervas = estado.ervas || { ervas: [], minhas: [], frete: 0, aberta: false, participantes: 0 }; }
  avisar();
}

let timerErvas = null;
let filaErvas = Promise.resolve();
// Muda a quantidade de uma erva no meu pedido (0 = tira) e salva em seguida.
export function escolherErva(ervaId, quantidade) {
  const minhas = (estado.ervas.minhas || []).filter((m) => m.ervaId !== ervaId);
  if (quantidade > 0) minhas.push({ ervaId, quantidade });
  estado.ervas = { ...estado.ervas, minhas };
  avisar();
  clearTimeout(timerErvas);
  timerErvas = setTimeout(() => {
    const itens = estado.ervas.minhas;
    filaErvas = filaErvas.then(async () => {
      try {
        estado.ervas = await api('PUT', '/ervas', { itens });
        toast('Pedido salvo.');
      } catch (e) {
        toast(e.message);
        await carregarErvas();
      }
      avisar();
    });
  }, 600);
}

// Admin: salva o pedido de outra pessoa (sem itens = apaga o pedido).
export async function salvarPedidoDe(para, itens) {
  try {
    estado.ervas = await api('PUT', '/ervas', { para, itens });
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

export async function acaoErvas(acao, dados = {}) {
  try {
    estado.ervas = await api('POST', '/ervas', { acao, ...dados });
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

// ---------- perfil (orixás e guias) ----------
export async function carregarPerfil() {
  try { estado.perfil = await api('GET', '/auth/perfil'); } catch (e) { estado.perfil = { erro: e.message }; }
  avisar();
}

// Muda o perfil na tela na hora e salva em seguida (só a última versão).
let timerPerfil = null;
let filaPerfil = Promise.resolve();
export function mudarPerfil(fn) {
  const P = estado.perfil?.eu;
  if (!P || !P.perfil) return;
  fn(P.perfil);
  // Admin: os blocos da corrente já mostram a mudança.
  const meu = (estado.perfil.todos || []).find((x) => x.pessoaId === P.pessoaId);
  if (meu) meu.perfil = JSON.parse(JSON.stringify(P.perfil));
  avisar();
  clearTimeout(timerPerfil);
  timerPerfil = setTimeout(() => {
    const enviar = JSON.parse(JSON.stringify(P.perfil));
    estado.salvando++;
    filaPerfil = filaPerfil.then(() => api('POST', '/auth/perfil', { perfil: enviar }))
      .catch((e) => toast(e.message))
      .finally(() => { estado.salvando--; avisar(); });
  }, 400);
}

// ---------- oferendas ----------
export async function carregarOferendas() {
  try { estado.oferendas = await api('GET', '/oferendas'); } catch (e) { toast(e.message); estado.oferendas = estado.oferendas || { oferendas: [], eu: {} }; }
  avisar();
}

export async function acaoOferendas(acao, dados = {}) {
  try {
    estado.oferendas = await api('POST', '/oferendas', { acao, ...dados });
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  }
}

// Minha doação num item: muda na tela na hora e envia em seguida (só o último valor).
const timersDoacao = {};
let filaDoacao = Promise.resolve();
export function doarItem(itemId, quantidade) {
  const O = estado.oferendas;
  const eu = O.eu;
  for (const of of O.oferendas) {
    const item = of.itens.find((i) => i.id === itemId);
    if (!item) continue;
    const resto = item.doacoes.filter((d) => d.chave !== eu.chave);
    const minha = item.doacoes.find((d) => d.chave === eu.chave);
    item.doacoes = quantidade > 0 ? (minha ? item.doacoes.map((d) => (d.chave === eu.chave ? { ...d, quantidade } : d)) : [...resto, { chave: eu.chave, nome: eu.nome, quantidade }]) : resto;
  }
  avisar();
  clearTimeout(timersDoacao[itemId]);
  timersDoacao[itemId] = setTimeout(() => {
    timersDoacao[itemId] = null;
    filaDoacao = filaDoacao.then(async () => {
      try {
        estado.oferendas = await api('POST', '/oferendas', { acao: 'doar', itemId, quantidade });
        toast(quantidade > 0 ? 'Doação registrada. Obrigado!' : 'Doação retirada.');
      } catch (e) {
        toast(e.message);
        try { estado.oferendas = await api('GET', '/oferendas'); } catch { /* mantém */ }
      }
      avisar();
    });
  }, 500);
}
