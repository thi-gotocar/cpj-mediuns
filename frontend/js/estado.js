// Estado da tela e todas as chamadas ao backend.
// As telas leem "estado" e chamam as funções daqui; nada fala com a API direto.

import { api, definirVerComo } from './api.js';
import { token, emDemo } from './auth.js';
import { giraVazia, ordenarPessoas, pessoasDe, expandirRetrato } from '/shared/regras.js';
import { permissoesDe, PERFIS_PADRAO, PERMISSOES_GRUPO } from '/shared/permissoes.js';
import { definirConfig } from '/shared/config.js';
import { abaValida } from '/shared/visitas.js';
import { hoje, toast } from './util.js';

export const estado = {
  me: null,            // { id, nome, email, papel, permissoes }
  pessoas: [],
  giras: {},           // por data
  usuarios: null,      // só admin
  ervas: null,         // compra de ervas (GET /api/ervas)
  ervasVista: null,
  ervasImg: null,      // imagem gerada do pedido ao fornecedor / cobrança
  ervasCompra: null,   // admin editando o bloco Compra: { gira, data, frete, itens: { ervaId: { qtd, preco } } } (null = travado)
  ervasFechar: false,  // janela "Fechar a lista?" aberta
  ervasNova: null,     // janela Nova compra: { passo: 'aviso' } (tem certeza?) ou { passo: 'escolher' } (encerrar ou descartar)
  ervasHist: null,     // Histórico de compras (admin): lista, undefined = carregando, { erro }
  guias: null,         // aba Compras (GET /api/oferendas?lista=guias)
  amaci: null,         // aba Amaci (GET /api/pessoas?lista=amaci)
  transparencia: null, // aba Transparência (GET /api/giras?lista=transparencia)
  asaas: null,         // aba ASAAS: root e quem tem a aba no perfil (GET /api/oferendas?lista=asaas)
  pedidos: null,       // sub-aba Pedidos (Compras, só quem administra): { pedidos, pendencias } (GET /api/oferendas?lista=pedidos)
  diario: null,        // aba Diário: { publicada, root, dias: [{ data, dados }] } de quem está logado (GET /api/pessoas?lista=diario)
  ervasPara: null,     // admin montando o pedido de outra pessoa: { chave?, nome, itens: { ervaId: qtd } }    // 'fornecedor' | 'cobranca' (exportação aberta na aba Ervas)
  pronto: false,
  confirm: null,       // item aguardando "Confirmar"
  img: null,           // imagem gerada da escala
  eventoImg: null,     // imagem gerada do evento da aba Gira
  eventoImgGerando: null,
  eventoImgErro: null,
  manual: null,
  renomear: null,
  editLic: null,
  renomearUsuario: null, // id do usuário com o nome em edição (aba Admin root)
  giraAntiga: null,
  oferendas: null,     // GET /api/oferendas: { oferendas, eu }
  iemanja: null,       // GET /api/oferendas?lista=iemanja: { eventos, root, candidatos? }
  recadoTxt: null,     // recado do admin ainda não salvo: { data, texto }
  tituloTxt: null,     // nome da gira ainda não salvo: { data, texto }
  perfil: null,        // GET /api/auth/perfil: { eu, todos? } (ou { erro })
  anamnese: null,      // GET /api/auth/anamnese: { visivel, perguntas, minhas, todas? } (ou { erro })
  fotosPessoa: {},     // aba Perfil: pessoaId → foto (data URL; '' = sem foto; null = buscando)
  pfUi: { abertos: {}, infoBuscaVisivel: false, infoBusca: '' },
  perfisCfg: null,     // aba Admin root: perfis e as abas de cada um
  visitas: null,       // aba Admin root: quem entrou em cada aba nos últimos 3 dias (GET /api/usuarios?lista=visitas)
  senhas: null,        // aba Admin root: quem tem senha (PIN) no acesso da corrente
  alunos: null,        // aba Pessoas: { turmas, alunos }
  alunosAdicionarTurma: null, // aba Pessoas: turma com o formulário de inclusão de alunos aberto
  limpezaPessoaEditando: null, // aba Pessoas: pessoa com turma da limpeza em edição
  stPerfis: null,      // Histórico → Estatísticas: contagens do Perfil { total, chefe, frente, orixa } (undefined = carregando)
  eventos: [],         // eventos da casa (aba Eventos e "Eventos da semana")
  eventosTipos: null,  // GET /api/giras?lista=eventosTipos (só o root): { tipos, turmas }
  entidadesApelidos: [], // apelidos opcionais das entidades, configurados pelo Admin root
  oracoes: [],         // aba Gira: orações dos últimos 7 dias
  conduta: null,       // aba Geral: Gestão de Conduta e Risco { ativa, relatos } (root: todos; os outros: os próprios)
  atrasos: null,       // aba Geral: pagamentos em atraso da conta B do ASAAS { configurado, root, atualizadoEm, atrasos } (root: todos; os outros: os próprios)
  ausPrevias: null,    // aba Gira (admin): ausências antecipadas, de datas ainda sem gira — [{ data, pessoaId }]
  curimba: null,       // aba Curimba: { alunos, aulas, presencas }
  minhaCurimba: null,  // aba Gira: { aulas } de quem está logado, se for aluno da curimba
  videos: null,        // aba Vídeos: [{ id, data, evento, youtube, classes }]
  vidUi: null,         // aba Vídeos: o que está aberto, o filtro e o formulário
  fotos: null,         // aba Fotos: { albuns, fotos, usado, limite, configurado }
  fotUi: null,         // aba Fotos: álbum escolhido, álbuns abertos, foto em tela cheia, envio em andamento
  ofUi: { editar: null, editarItem: null, compartilhar: null, img: null },    // formulário "Cadastrar gira antiga" (aba Histórico)       // id da licença em edição (aba Pessoas)      // id da pessoa com o nome em edição (aba Pessoas)        // data da gira com "Ajuste manual" ligado (giras passadas já vêm ligadas)
  salvando: 0,
  visaoRoot: 'root',    // visão simulada pelo root: root, cpj, alunos ou curimba
  verComo: '',          // root vendo como uma pessoa do cadastro: 'p:<pessoa>' ou 'a:<aluno>' ('' = visão genérica)
  meRoot: null,         // o "me" do root enquanto estado.me é o da pessoa escolhida
  vcLista: { pessoas: [], alunos: [] }, // quem o root pode escolher em cada visão (do cadastro, lido como root)
  permCorrente: [],     // permissões do perfil Corrente, usadas na visão CPJ
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
// Root de verdade, mesmo vendo o app como outra pessoa.
export const ehRootReal = () => (estado.meRoot || estado.me)?.papel === 'root';
export const visaoAtiva = () => estado.me?.papel === 'root' ? estado.visaoRoot : estado.me?.grupo || '';
// Sub-aba Iemanjá: na visão CPJ/Alunos do root, vale o que a corrente vê.
export const veIemanja = () => visaoAtiva() !== 'curimba' && !!(estado.me?.papel === 'root' && estado.visaoRoot !== 'root' ? estado.me.iemanjaPublica : estado.me?.iemanjaAba);
export const pode = (perm) => {
  if (!estado.me) return false;
  if (estado.me.papel === 'root') {
    if (estado.visaoRoot === 'cpj') return (estado.permCorrente || []).includes(perm);
    if (estado.visaoRoot === 'alunos' || estado.visaoRoot === 'curimba') return PERMISSOES_GRUPO[estado.visaoRoot].includes(perm);
  }
  return (estado.me.permissoes || []).includes(perm);
};
// Aba Oferendas: admins sempre; as pessoas, se houver sub-aba visível ou a Iemanjá.
export const veOferendas = () => veIemanja() || (pode('oferendas:doar') && visaoAtiva() !== 'alunos' && (pode('oferendas:gerenciar') || !!(estado.oferendas?.publica ?? estado.me?.oferendasPublica)));
export const pessoasOrd = () => ordenarPessoas(estado.pessoas.filter((p) => !p.saida));
// Inclui quem já saiu: só para giras e estatísticas, sempre filtrando pela data da gira (naCorrenteEm).
export const pessoasComSaidas = () => ordenarPessoas(estado.pessoas);
export const nome = (id) => estado.pessoas.find((p) => p.id === id)?.nome || '(removido)';
// Nome como estava na gira (encerrada: o do retrato, mesmo de quem já saiu do cadastro).
export const nomeNaGira = (g) => { const ps = pessoasDe(estado.pessoas, g); return (id) => ps.find((p) => p.id === id)?.nome || nome(id); };
export const girasLista = () => Object.values(estado.giras);
export const giraAtual = () => estado.giras[prefs.data] || giraVazia(prefs.data);

function definirGiras(lista) {
  const novo = {};
  // Na visão da corrente, a escala ainda não publicada fica escondida, como o servidor faz para a corrente.
  const visaoCorrente = estado.me?.papel === 'root' ? estado.visaoRoot === 'cpj' : estado.me?.papel === 'corrente';
  // Retrato das encerradas vem compacto: completa com o cadastro que chegou junto (estado.pessoas).
  lista.map((g) => expandirRetrato(estado.pessoas, g))
    .forEach((g) => { novo[g.data] = visaoCorrente && !g.publicada ? { ...g, pares: [], passes: [] } : g; });
  // Não sobrescreve giras com edição ainda não enviada.
  Object.keys(pendente).forEach((d) => { if (estado.giras[d]) novo[d] = estado.giras[d]; });
  estado.giras = novo;
}

export async function carregarTudo() {
  ultimaAtualizacao = Date.now();   // o foco logo depois da abertura não busca tudo de novo
  const vis = visitasPendentes();
  const r = await api('GET', '/auth/inicio' + (vis.length ? '?visitas=' + vis.join(',') : ''));
  visitasEnviadas(vis);
  const { me } = r;
  definirConfig(r.config);
  estado.me = me;
  estado.conduta = null;   // relatos são de quem está logado: busca de novo
  estado.atrasos = null;   // idem para os pagamentos em atraso
  if (!estado.verComo) estado.visaoRoot = 'root';
  if (me.grupo === 'alunos') {
    estado.eventos = r.eventos;
    estado.pessoas = [];
    estado.giras = {};
    estado.minhaCurimba = r.minhaCurimba?.aulas ? r.minhaCurimba : null;   // aluno da curimba: as próprias aulas
    estado.curimba = null;
    estado.oracoes = r.oracoes || [];
    estado.alunos = null;
    prefs.tab = 'gira';
    prefs.data = hoje();
    estado.pronto = true;
    avisar();
    return;
  }
  estado.oracoes = r.oracoes || [];
  estado.eventos = r.eventos || [];
  estado.minhaCurimba = r.minhaCurimba?.aulas ? r.minhaCurimba : null;
  estado.pessoas = r.pessoas;
  estado.entidadesApelidos = r.entidadesApelidos || [];
  definirGiras(r.giras);
  estado.versaoDados = r.versao || '';   // ao voltar ao app, sem mudança desde esta versão, nada é baixado de novo
  estado.pronto = true;
  if (prefs.tab === 'usuarios' && !pode('usuarios:gerenciar')) prefs.tab = 'gira';
  // Abre sempre na próxima gira (ou na mais recente).
  {
    const datas = Object.keys(estado.giras).sort();
    prefs.data = datas.find((d) => d >= hoje()) || datas[datas.length - 1] || hoje();
  }
  avisar();
}

// Listas das abas que dependem de quem está logado: trocar de pessoa busca de novo.
function limparListasDaPessoa() {
  Object.assign(estado, { oferendas: null, iemanja: null, ervas: null, guias: null, amaci: null, asaas: null, pedidos: null, transparencia: null, perfil: null,
    anamnese: null, fotosPessoa: {}, curimba: null, minhaCurimba: null, videos: null, fotos: null, conduta: null, atrasos: null, usuarios: null,
    perfisCfg: null, senhas: null, eventosTipos: null, stPerfis: null, ervasHist: null, img: null, confirm: null });
}

// Root vendo o app como uma pessoa do cadastro, com os dados reais dela (só leitura; o servidor recusa gravações).
// '' volta para a visão genérica (o app como root, simulando só o que a visão mostra).
export async function verComoPessoa(chave) {
  if (!ehRootReal()) return;
  const visao = estado.visaoRoot;
  limparListasDaPessoa();
  if (chave) {
    estado.meRoot ||= estado.me;
    estado.verComo = chave;
    definirVerComo(chave);
  } else {
    estado.verComo = '';
    definirVerComo('');
    if (estado.meRoot) estado.me = estado.meRoot;
    estado.meRoot = null;
  }
  try {
    await carregarTudo();
  } catch (e) {
    toast(e.message);
    if (chave) { await verComoPessoa(''); return; }
  }
  if (!chave && visao !== 'root') await mudarVisaoRoot(visao);
}

// Quem pode ser escolhido em cada visão: CPJ (corrente, menos a curimba), Curimba e Alunos — sempre lido como root.
async function prepararListaVerComo() {
  const pessoas = (estado.pessoas || []).filter((p) => !p.saida).map((p) => ({ chave: 'p:' + p.id, nome: p.nome, funcao: p.funcao }));
  let alunos = [];
  try { alunos = (await api('GET', '/pessoas?lista=alunos')).alunos.map((a) => ({ chave: 'a:' + a.id, nome: a.nome })); } catch { /* sem a lista */ }
  const ordem = (l) => l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  estado.vcLista = { pessoas: ordem(pessoas), alunos: ordem(alunos) };
}

// Root pode alternar a apresentação; o backend continua reconhecendo o usuário como root.
export async function mudarVisaoRoot(visao) {
  if (!ehRootReal()) return;
  if (!['root', 'cpj', 'alunos', 'curimba'].includes(visao)) return;
  // Saindo de "ver como": volta a ser o root antes de trocar a visão.
  if (estado.verComo) {
    estado.visaoRoot = visao;
    await verComoPessoa('');   // já refaz a visão escolhida
    return;
  }
  if (visao !== 'root') await prepararListaVerComo();
  if (visao === 'cpj') {
    let abas = PERFIS_PADRAO.find((p) => p.chave === 'corrente').abas;
    try { abas = (await api('GET', '/usuarios?lista=perfis')).find((p) => p.chave === 'corrente')?.abas || abas; } catch { /* usa o padrão */ }
    estado.permCorrente = permissoesDe('corrente', abas);
  }
  estado.visaoRoot = visao;
  estado.confirm = null;
  try {
    const giras = await api('GET', '/giras');
    definirGiras(giras);
  } catch (e) { toast(e.message); }
  if (visao === 'alunos' && estado.alunos === null) await carregarAlunos();
  if (visao === 'curimba') estado.minhaCurimba = null;
  avisar();
}

// Busca o que outras pessoas mudaram (ao voltar para a aba do app).
// No máximo a cada 5 min: o Neon desliga 5 min depois do último pedido, e cada volta ao app (no celular, trocar de
// app o tempo todo) o acordava de novo.
const INTERVALO_ATUALIZAR = 5 * 60 * 1000;
let ultimaAtualizacao = 0;
export async function atualizarDoServidor() {
  if (!estado.pronto || estado.salvando || Object.keys(pendente).length) return;
  if (Date.now() - ultimaAtualizacao < INTERVALO_ATUALIZAR) return;
  ultimaAtualizacao = Date.now();
  try {
    if (estado.me?.grupo === 'alunos') {
      estado.alunos = await api('GET', '/pessoas?lista=alunos');
      avisar();
      return;
    }
    // A versão que o app já tem: sem mudança no servidor, a resposta é só { semMudanca } e as listas ficam como estão.
    // Uma gravação feita daqui também muda a versão: na volta seguinte, baixa tudo uma vez.
    const versao = estado.me?.grupo ? '' : estado.versaoDados || '';
    const vis = visitasPendentes();
    const r = await api('GET', '/auth/inicio?atualizar=1' + (versao ? '&versao=' + encodeURIComponent(versao) : '')
      + (vis.length ? '&visitas=' + vis.join(',') : ''));
    visitasEnviadas(vis);
    if (r.semMudanca) { await atualizarAbaAberta(); return; }
    if (r.versao) estado.versaoDados = r.versao;
    if (r.config) definirConfig(r.config);
    // Lista que falhou no servidor não vem: fica a que já está na tela.
    const minhaCurimba = r.minhaCurimba === undefined ? estado.minhaCurimba : r.minhaCurimba;
    estado.oracoes = r.oracoes || estado.oracoes;
    estado.pessoas = r.pessoas;
    estado.eventos = r.eventos || estado.eventos;
    estado.minhaCurimba = minhaCurimba?.aulas ? minhaCurimba : null;
    estado.entidadesApelidos = r.entidadesApelidos || estado.entidadesApelidos;
    definirGiras(r.giras);
    await atualizarAbaAberta();
  } catch { /* silencioso: tenta de novo na próxima vez */ }
}

// O que não entra na versão dos dados (oferendas, Iemanjá): só quando a aba Oferendas está aberta.
// Relatos, atrasos e ervas (blocos de Geral e Gira) e os compromissos das oferendas nessas abas não são buscados
// na volta ao app: eram 2 a 3 pedidos a mais a cada volta, quase sempre sem mudança. Vêm de novo ao abrir o app.
async function atualizarAbaAberta() {
  if (prefs.tab !== 'oferendas') return;
  // Pega o que o admin publicou ou o que outros doaram (se não houver doação minha a enviar).
  const [oferendas, iemanja] = await Promise.all([
    estado.oferendas !== null && !Object.values(timersDoacao).some(Boolean) ? api('GET', '/oferendas').catch(() => estado.oferendas) : estado.oferendas,
    estado.iemanja !== null ? api('GET', '/oferendas?lista=iemanja').catch(() => estado.iemanja) : estado.iemanja,
  ]);
  estado.oferendas = oferendas;
  estado.iemanja = iemanja;
  avisar();
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

async function acaoDaGira(acao, mensagem = null) {
  const data = prefs.data;
  await descarregar(data);
  estado.salvando++;
  try {
    const r = await api('POST', '/giras/' + data, { acao });
    estado.giras[data] = r.gira;
    toast(mensagem || r.mensagem);
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
export const encerrarGira = (dados) => situacaoDaGira('encerrar', dados);
export const reabrirGira = () => situacaoDaGira('reabrir');
// Troca a data programada da gira aberta na tela; a tela passa para a data nova.
export async function mudarDataGira(para) {
  const data = prefs.data;
  await descarregar(data);
  estado.salvando++;
  try {
    const r = await api('POST', '/giras/' + data, { acao: 'mudarData', para });
    delete estado.giras[data];
    estado.giras[r.gira.data] = r.gira;
    prefs.data = r.gira.data;
    salvarPrefs();
    estado.manual = null;
    toast(r.mensagem);
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    estado.salvando--;
    avisar();
  }
}
// Cancela o sorteio: apaga as duplas (e despublica), volta ao botão Sortear.
export const cancelarSorteio = () => situacaoDaGira('cancelarSorteio');
// Acesso da corrente: a própria pessoa declara que não vai (Pendente → Ausente).
export const declararAusencia = () => situacaoDaGira('ausencia');
export const escolherEntidade = (linha) => situacaoDaGira('minhaEntidade', { linha });
export const publicarEscala = (publicada = true) => situacaoDaGira('publicar', { publicada });
export const travarEscala = (travada) => situacaoDaGira('travar', { travada });
export const salvarRecado = (recado) => situacaoDaGira('recado', { recado });
// Admin root: corrige a presença de uma pessoa em qualquer gira (Histórico → estatísticas).
export async function corrigirPresenca(data, pessoaId, status) {
  try {
    const r = await api('POST', '/giras/' + data, { acao: 'corrigirPresenca', pessoaId, status });
    estado.giras[data] = r.gira;
    toast(r.mensagem);
    return true;
  } catch (e) { toast(e.message); return false; } finally { avisar(); }
}
export const sortear = () => acaoDaGira('sortear');
export const remanejar = (mensagem) => acaoDaGira('remanejar', mensagem);

// Gira antiga (só registro): data, entidade, presença e atendidos, já encerrada e sem escala.
export async function cadastrarGiraAntiga(data, dados) {
  try {
    estado.giras[data] = await api('PUT', '/giras/' + data, { ...dados, encerrada: true });
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// Histórico → Cadastrar escala: grava as duplas de uma gira que já foi (cria a gira, já encerrada, se não existir).
export async function cadastrarEscala(data, dados) {
  try {
    const r = await api('POST', '/giras/' + data, { acao: 'escala', ...dados });
    estado.giras[data] = r.gira;
    toast(r.mensagem);
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
  const r = await api('POST', '/pessoas', { nome: texto, funcao, entradaHoje: true });
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
    avisar();
    return false;
  }
  avisar();
  return true;
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
    const [pessoas, giras] = await Promise.all([api('GET', '/pessoas'), api('GET', '/giras')]);
    estado.pessoas = pessoas;
    definirGiras(giras);
  } catch (e) { toast(e.message); }
  avisar();
}

// ---------- usuários (admin) ----------
export async function carregarUsuarios() {
  try {
    const r = await api('GET', '/usuarios?lista=tudo');   // usuários, perfis e senhas numa chamada só
    Object.assign(estado, { usuarios: r.usuarios, perfisCfg: r.perfis, senhas: r.senhas });
  } catch (e) { toast(e.message); Object.assign(estado, { usuarios: estado.usuarios || [], perfisCfg: estado.perfisCfg || [], senhas: estado.senhas || [] }); }
  avisar();
}
// Perfis (acao 'perfil' / 'excluirPerfil') e senha da corrente (acao 'pin').
export async function acaoUsuarios(acao, dados = {}) {
  try {
    const r = await api('POST', '/usuarios', { acao, ...dados });
    if (acao === 'pin') estado.senhas = r; else if (acao !== 'pinAluno') estado.perfisCfg = r;
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

export async function salvarConfigCasa(dados) {
  try {
    definirConfig(await api('POST', '/usuarios', { acao: 'config', config: dados }));
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// ---------- eventos da casa ----------
// ---------- ausência antecipada (aba Gira, admin: data de hoje em diante ainda sem gira) ----------
export async function carregarAusPrevias() {
  try { estado.ausPrevias = await api('GET', '/giras?lista=ausencias'); } catch (e) { toast(e.message); estado.ausPrevias = estado.ausPrevias || []; }
  avisar();
}
export async function acaoAusPrevia(data, pessoaId, ausente) {
  try {
    estado.ausPrevias = await api('POST', '/giras', { acao: 'ausenciaPrevia', data, pessoaId, ausente });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- orações (aba Gira) ----------
export async function acaoOracoes(acao, dados = {}) {
  try {
    estado.oracoes = await api('POST', '/giras', { acao, ...dados });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- Gestão de Conduta e Risco (aba Geral) ----------
// Pode ser chamada a cada desenho enquanto não há dados: só um pedido por vez; ignora a resposta de quem já saiu.
let carregandoConduta = null;
export function carregarConduta() {
  if (carregandoConduta) return carregandoConduta;
  const sessao = token();
  carregandoConduta = (async () => {
    try {
      const r = await api('GET', '/giras?lista=conduta');
      if (token() === sessao) estado.conduta = r;
    } catch (e) {
      if (token() === sessao) { toast(e.message); estado.conduta = estado.conduta || { ativa: false, relatos: [] }; }
    }
    carregandoConduta = null;
    avisar();
  })();
  return carregandoConduta;
}
// ---------- Pagamentos em atraso (conta B do ASAAS, aba Geral) ----------
// Como o Conduta: um pedido por vez; atualizar = o root manda ler o ASAAS agora.
let carregandoAtrasos = null;
export function carregarAtrasos({ atualizar = false } = {}) {
  if (carregandoAtrasos) return carregandoAtrasos;
  const sessao = token();
  carregandoAtrasos = (async () => {
    try {
      const r = await api('GET', '/giras?lista=atrasos' + (atualizar ? '&atualizar=1' : ''));
      if (token() === sessao) estado.atrasos = r;
      if (atualizar && !r.erro) toast('Pagamentos atualizados.');
    } catch (e) {
      if (token() === sessao) { if (atualizar) toast(e.message); estado.atrasos = estado.atrasos || { configurado: false, atrasos: [] }; }
    }
    carregandoAtrasos = null;
    avisar();
  })();
  return carregandoAtrasos;
}
// redesenhar: false no rascunho da resposta (sair do campo): redesenhar ali trocaria o botão no meio do toque em Publicar.
export async function acaoConduta(acao, dados = {}, { redesenhar = true } = {}) {
  try {
    estado.conduta = await api('POST', '/giras', { acao, ...dados });
    if (redesenhar) avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// Tipos de evento (só o root): { tipos, turmas, eventos }.
export async function carregarEventosTipos() {
  try {
    const r = await api('GET', '/giras?lista=eventosTipos');
    estado.eventosTipos = { tipos: r.tipos, turmas: r.turmas };
    estado.eventos = r.eventos;
  } catch (e) { toast(e.message); estado.eventosTipos = { tipos: [], turmas: [] }; }
  avisar();
}
export async function salvarEventoTipo(dados, acao = 'eventoTipo') {
  try {
    const r = await api('POST', '/giras', { acao, ...dados });
    estado.eventosTipos = { tipos: r.tipos, turmas: r.turmas };
    estado.eventos = r.eventos;
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}
// Amaci que já passou, cadastrado pelo root na aba Amaci: devolve { ok } ou { erro } para a tela mostrar no formulário.
export async function cadastrarAmaciPassado(dados) {
  try {
    estado.eventos = await api('POST', '/giras', { acao: 'evento', ...dados, retroativo: true });
    return { ok: true };
  } catch (e) { return { erro: e.message }; }
}
export async function acaoEventos(acao, dados = {}) {
  try {
    estado.eventos = await api('POST', '/giras', { acao, ...dados });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}
export async function salvarApelidosEntidade(apelidos) {
  try {
    estado.entidadesApelidos = await api('POST', '/giras', { acao: 'entidadesApelidos', apelidos });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- aba Curimba (alunos, aulas e presença: à parte da corrente) ----------
export async function carregarCurimba() {
  try { estado.curimba = await api('GET', '/pessoas?lista=curimba'); } catch (e) { toast(e.message); estado.curimba = estado.curimba || { alunos: [], aulas: [], presencas: [] }; }
  avisar();
}
export async function acaoCurimba(acao, dados = {}) {
  try {
    estado.curimba = await api('POST', '/pessoas', { acao, ...dados });
    // A pessoa logada pode ser aluna: o bloco da aba Gira acompanha.
    api('GET', '/pessoas?lista=minhaCurimba').then((r) => { estado.minhaCurimba = r?.aulas ? r : null; }).catch(() => {});
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- aba Vídeos (vídeos do YouTube das giras) ----------
export async function carregarVideos() {
  try { estado.videos = await api('GET', '/giras?lista=videos'); } catch (e) { toast(e.message); estado.videos = estado.videos || []; }
  avisar();
}
// Aba Vídeos publicada (toda a corrente vê) ou só para quem tem a aba no perfil.
export async function publicarVideos(publicada) {
  try {
    const r = await api('POST', '/giras', { acao: 'videosPublicar', publicada });
    estado.me = { ...estado.me, videosPublicada: r.publicada };
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}
export async function acaoVideos(acao, dados = {}) {
  try {
    estado.videos = await api('POST', '/giras', { acao, ...dados });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// ---------- aba Fotos (álbuns por gira/evento; os arquivos ficam no Cloudflare R2) ----------
export async function carregarFotos() {
  try { estado.fotos = await api('GET', '/giras?lista=fotos'); } catch (e) { toast(e.message); estado.fotos = estado.fotos || { albuns: [], fotos: [], usado: 0, limite: 0, configurado: false }; }
  avisar();
}
// Devolve a resposta (ou null se deu erro); quando ela traz os álbuns, atualiza a tela.
export async function acaoFotos(acao, dados = {}) {
  try {
    const r = await api('POST', '/giras', { acao, ...dados });
    if (r && r.albuns) estado.fotos = r;
    avisar();
    return r;
  } catch (e) { toast(e.message); avisar(); return null; }
}

// ---------- alunos da CPJ (aba Pessoas) ----------
// Histórico → Estatísticas: guias e orixás mais comuns no cadastro (só contagens).
export async function carregarStPerfis() {
  estado.stPerfis = undefined;
  try { estado.stPerfis = await api('GET', '/pessoas?lista=perfis'); } catch (e) { estado.stPerfis = { erro: e.message }; }
  avisar();
}
export async function carregarAlunos() {
  try { estado.alunos = await api('GET', '/pessoas?lista=alunos'); } catch (e) { toast(e.message); estado.alunos = estado.alunos || { turmas: [], alunos: [] }; }
  avisar();
}
// CPF inteiro de um aluno (Mostrar, para quem edita Alunos).
export async function revelarCpfAluno(id) {
  try { return (await api('POST', '/pessoas', { acao: 'alunoCpf', id })).cpf; } catch (e) { toast(e.message); return ''; }
}
export async function acaoAlunos(acao, dados = {}) {
  try {
    const r = await api('POST', '/pessoas', { acao, ...dados });
    // Quem edita Alunos recebe também os dados (CPF mascarado, nome completo, e-mail, celular) e as pendências.
    estado.alunos = { turmas: r.turmas, alunos: r.alunos, dados: r.dados, pendencias: r.pendencias, pendenciasEm: r.pendenciasEm, exAlunos: r.exAlunos,
      cadastros: r.cadastros || estado.alunos?.cadastros };
    if (Array.isArray(r.pessoas)) estado.pessoas = r.pessoas;
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
    pessoas: Object.fromEntries(estado.pessoas.map((p) => [p.id, { nome: p.nome, funcao: p.funcao, experiente: !!p.experiente, linhas: p.linhas || [], limpeza: p.limpeza || null, entrada: p.entrada || null, saida: p.saida || null }])),
    giras: Object.fromEntries(girasLista().map((g) => [g.data, { data: g.data, entidade: g.entidade, entidadeNome: g.entidadeNome || '', titulo: g.titulo || '', encerrada: !!g.encerrada, atendimentos: g.atendimentos || null, limpeza: g.limpeza || null, orixa: g.orixa || '', pendentePadrao: !!g.pendentePadrao, papeis: g.papeis || {}, presenca: g.presenca, pares: g.pares, passes: g.passes }])),
  };
}
export async function importarBackup(obj) {
  const r = await api('POST', '/importar', obj);
  await carregarTudo();
  return r;
}

// ---------- ervas ----------
// Histórico de compras (admin): as compras encerradas.
export async function carregarHistoricoErvas() {
  estado.ervasHist = undefined;
  try { estado.ervasHist = await api('GET', '/ervas?lista=historico'); } catch (e) { estado.ervasHist = { erro: e.message }; }
  avisar();
}
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
// Aba Ervas: ligada, todos com a aba no perfil veem; desligada, só quem administra as ervas.
export const veErvas = () => pode('ervas:gerenciar') || (pode('ervas:escolher') && estado.me?.ervasPublicada !== false);
export async function publicarErvas(publicada) {
  try {
    const r = await api('POST', '/ervas', { acao: 'publicar', publicada });
    estado.me = { ...estado.me, ervasPublicada: r.publicada };
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

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

// ---------- Compras (pedidos de guias) ----------
// Aba: quem administra sempre vê; as pessoas com a aba no perfil, quando o admin liga "Visível para todos".
// Alunos e curimba também pedem (shared/permissoes.js PERMISSOES_GRUPO), só com a aba visível para todos.
export const veGuias = () => pode('guias:gerenciar') || (pode('guias:pedir') && !!estado.me?.guiasPublicada);
// conferir: o "Já paguei, atualizar" (o servidor ignora; o modo demonstração simula ali o aviso de pagamento do ASAAS).
export async function carregarGuias(conferir = false) {
  try { estado.guias = await api('GET', '/oferendas?lista=guias' + (conferir ? '&conferir=1' : '')); } catch (e) { toast(e.message); estado.guias = estado.guias || { grupos: [], pedidos: [], meus: [], aberto: null }; }
  avisar();
}
// Sub-aba Pedidos (Compras): só quem administra a aba Compras (o root e o Admin; o servidor confere).
export const vePedidos = () => pode('guias:gerenciar');
export async function carregarPedidos() {
  try { estado.pedidos = await api('GET', '/oferendas?lista=pedidos'); }
  catch (e) { estado.pedidos = { erroTela: e.message }; }
  avisar();
}
export async function mudarAndamento(id, andamento) {
  try {
    estado.pedidos = await api('POST', '/oferendas', { acao: 'guias', op: 'andamento', id, andamento });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}
export async function acaoGuias(op, dados = {}) {
  try {
    estado.guias = await api('POST', '/oferendas', { acao: 'guias', op, ...dados });
    if (op === 'publicar') estado.me = { ...estado.me, guiasPublicada: !!estado.guias.publicada };
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    avisar();
    return false;
  }
}

// ---------- Amaci ----------
// Aba: quem administra sempre vê; as pessoas com a aba no perfil (e os alunos), quando o admin liga "Visível para todos".
export const veAmaci = () => pode('amaci:editar') || (pode('amaci:ver') && !!estado.me?.amaciPublicada);
export async function carregarAmaci() {
  try { estado.amaci = await api('GET', '/pessoas?lista=amaci'); } catch (e) { estado.amaci = estado.amaci && !estado.amaci.erro ? estado.amaci : { erro: e.message }; }
  avisar();
}
// O aluno confirma a própria presença no amaci de hoje, com a localização do celular (a API confere se está no terreiro).
export async function confirmarPresencaAmaci(eventoId, lat, lon) {
  try {
    // A resposta é só a presença: junta com o resto da aba, que não mudou.
    estado.amaci = { ...estado.amaci, ...(await api('POST', '/pessoas', { acao: 'amaciPresenca', eventoId, lat, lon })) };
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    avisar();
    return false;
  }
}
export async function acaoAmaci(op, dados = {}) {
  try {
    const r = await api('POST', '/pessoas', { acao: 'amaci', op, ...dados });
    estado.amaci = op === 'presenca' ? { ...estado.amaci, ...r } : r;   // presença: a resposta é só ela
    if (op === 'publicar') estado.me = { ...estado.me, amaciPublicada: !!estado.amaci.publicada };
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    avisar();
    return false;
  }
}

// ---------- Painel da Transparência ----------
// Quem edita sempre vê; quem tem Ver no perfil também; a corrente (não alunos nem curimba), quando está visível.
// ---------- aba Diário ----------
// O root sempre; os outros (corrente e alunos), quando o root liga Visível para todos. É pessoal: não abre no Ver como
// nem no acesso da curimba (sem pessoa).
// Aba Pessoas (e o bloco Pessoas do Perfil, que segue a mesma regra): quem vê a corrente ou os alunos, fora das visões
// Alunos e Curimba. O que dá para editar lá dentro continua pelas permissões de cada ação (e o servidor confere).
export const vePessoas = () => (pode('pessoas:ver') || pode('alunos:ver')) && !['alunos', 'curimba'].includes(visaoAtiva());
export const veDiario = () => !estado.me?.aguardando && !estado.verComo && estado.me?.grupo !== 'curimba' && visaoAtiva() !== 'curimba'
  && (pode('usuarios:gerenciar') || !!estado.me?.diarioPublicada);
export async function carregarDiario() {
  try { estado.diario = await api('GET', '/pessoas?lista=diario'); } catch (e) { estado.diario = { erro: e.message }; }
  avisar();
}
// Grava o dia inteiro (o servidor limpa e devolve o que ficou). Falhou: o dia volta ao que estava.
export async function salvarDiaDiario(data, dados) {
  const D = estado.diario;
  if (!D?.dias) return false;
  const antes = D.dias.find((x) => x.data === data);
  const trocar = (dia) => { D.dias = [...D.dias.filter((x) => x.data !== data), ...(dia && Object.keys(dia.dados || {}).length ? [dia] : [])].sort((a, b) => a.data.localeCompare(b.data)); };
  trocar({ data, dados });
  avisar();
  estado.salvando++;
  try {
    trocar(await api('POST', '/pessoas', { acao: 'diario', op: 'salvar', data, dados }));
    return true;
  } catch (e) {
    trocar(antes);
    toast(e.message);
    return false;
  } finally {
    estado.salvando--;
    avisar();
  }
}
// Galeria de fotos do Diário: op = fotoEnviar | fotoExcluir | fotoCurtir; o servidor devolve a galeria inteira.
export async function acaoGaleriaDiario(op, dados = {}) {
  try {
    const r = await api('POST', '/pessoas', { acao: 'diario', op, ...dados });
    if (estado.diario?.dias) estado.diario = { ...estado.diario, galeria: r.galeria };
    return true;
  } catch (e) { toast(e.message); return false; } finally { avisar(); }
}
export async function publicarDiario(publicada) {
  try {
    estado.diario = await api('POST', '/pessoas', { acao: 'diario', op: 'publicar', publicada });
    estado.me = { ...estado.me, diarioPublicada: !!estado.diario.publicada };
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}
// Orientador do card Banho: o root liga e desliga para todos.
export async function orientadorDiario(visivel) {
  try {
    estado.diario = await api('POST', '/pessoas', { acao: 'diario', op: 'orientador', visivel });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}
export const veTransparencia = () => !estado.me?.grupo && (pode('transparencia:ver') || pode('transparencia:editar') || !!estado.me?.transparenciaPublicada);
export async function carregarTransparencia(mes = '', atualizar = false) {
  const q = new URLSearchParams({ lista: 'transparencia', ...(mes ? { mes } : {}), ...(atualizar ? { atualizar: '1' } : {}) });
  try { estado.transparencia = await api('GET', '/giras?' + q); } catch (e) { estado.transparencia = { erro: e.message, mes }; }
  avisar();
}
export async function acaoTransparencia(op, dados = {}) {
  try {
    estado.transparencia = await api('POST', '/giras', { acao: 'transparencia', op, mes: estado.transparencia?.mes, ...dados });
    if (op === 'publicar') estado.me = { ...estado.me, transparenciaPublicada: !!estado.transparencia.publicada };
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    avisar();
    return false;
  }
}

// ---------- ASAAS (só o root) ----------
export async function carregarAsaas() {
  try { estado.asaas = await api('GET', '/oferendas?lista=asaas'); } catch (e) { estado.asaas = estado.asaas && !estado.asaas.erro ? estado.asaas : { erro: e.message }; }
  avisar();
}
export async function acaoAsaas(op, dados = {}) {
  try {
    estado.asaas = await api('POST', '/oferendas', { acao: 'asaas', op, ...dados });
    avisar();
    return true;
  } catch (e) {
    toast(e.message);
    avisar();
    return false;
  }
}

// ---------- perfil (orixás e guias) ----------
export async function carregarPerfil() {
  try { estado.perfil = await api('GET', '/auth/perfil'); } catch (e) { estado.perfil = estado.perfil && !estado.perfil.erro ? estado.perfil : { erro: e.message }; }
  avisar();
}

// ---------- anamnese (aba Perfil) ----------
export async function carregarAnamnese() {
  try { estado.anamnese = await api('GET', '/auth/anamnese'); } catch (e) { estado.anamnese = { erro: e.message }; }
  avisar();
}
export async function acaoAnamnese(acao, dados = {}) {
  try {
    estado.anamnese = await api('POST', '/auth/anamnese', { acao, ...dados });
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// Aba Perfil: entidades com que a pessoa tem afinidade (atendimento extra / passe).
export async function salvarAfinidade(tipo, linhas) {
  try {
    const r = await api('POST', '/auth/perfil', { acao: 'afinidade', tipo, linhas });
    Object.assign(estado.perfil.eu, { linhas: r.linhas, afinidadeExtra: r.afinidadeExtra, afinidadePasse: r.afinidadePasse });
    // As da própria função valem no sorteio: atualiza o cadastro na tela.
    const p = estado.pessoas.find((x) => x.id === r.pessoaId);
    if (p) p.linhas = r.linhas || [];
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
}

// Foto da pessoa (aba Perfil): busca uma vez e guarda em estado.fotosPessoa.
const dataUrl = (b64) => (b64 ? 'data:image/jpeg;base64,' + b64 : '');
export async function carregarFoto(pessoaId) {
  estado.fotosPessoa[pessoaId] = null;
  try { estado.fotosPessoa[pessoaId] = dataUrl((await api('GET', '/auth/foto?pessoaId=' + encodeURIComponent(pessoaId))).foto); } catch { estado.fotosPessoa[pessoaId] = ''; }
  avisar();
}
// foto = JPEG em base64 (ou null para tirar).
export async function salvarFoto(pessoaId, foto) {
  try {
    const r = await api('POST', '/auth/foto', { pessoaId, foto });
    estado.fotosPessoa[pessoaId] = dataUrl(r.foto);
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// Bloco Informações da aba Perfil: as da própria pessoa ou, para o admin, as de qualquer outra.
// CPF (aba Perfil): não fica em estado; quem chama guarda só enquanto mostra. Devolve null se deu erro.
export async function lerCpf(pessoaId, ver = false) {
  try { return await api('GET', `/auth/cpf?pessoaId=${encodeURIComponent(pessoaId)}${ver ? '&ver=1' : ''}`); } catch (e) { toast(e.message); return null; }
}
export async function salvarCpf(pessoaId, cpf) {
  try { return await api('POST', '/auth/cpf', { pessoaId, cpf }); } catch (e) { toast(e.message); return null; }
}

export async function salvarInfoDe(pessoaId, info) {
  try {
    const r = await api('POST', '/auth/perfil', { pessoaId, info });
    const x = (estado.perfil?.todos || []).find((t) => t.pessoaId === pessoaId);
    if (x) x.perfil = r.perfil;
    if (estado.perfil?.eu?.pessoaId === pessoaId) estado.perfil.eu.perfil = r.perfil;
    const c = (estado.perfil?.contatos || []).find((t) => t.pessoaId === pessoaId);
    if (c) Object.assign(c, { contatoNome: r.perfil.info.contatoNome || '', contatoTelefone: r.perfil.info.contatoTelefone || '' });
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// Muda o perfil na tela na hora e salva em seguida (só a última versão).
let timerPerfil = null;
let filaPerfil = Promise.resolve();
let perfilPendente = null;   // o perfil que ainda não foi enviado
// Mostra no bloco Informações se salvou (sem redesenhar a tela, para não atrapalhar quem digita).
function avisoPerfil(t) {
  estado.perfilSalvo = t;
  const el = document.getElementById('pf-salvo');
  if (el) { el.textContent = t === 'salvando' ? 'Salvando…' : t === 'salvo' ? '✓ Salvo' : t === 'erro' ? 'Não salvou' : ''; el.className = 'pf-salvo ' + t; }
}
function enviarPerfil() {
  clearTimeout(timerPerfil);
  if (!perfilPendente) return;
  const enviar = perfilPendente;
  perfilPendente = null;
  avisoPerfil('salvando');
  filaPerfil = filaPerfil.then(() => api('POST', '/auth/perfil', { perfil: enviar }))
    .then(() => { if (!perfilPendente) avisoPerfil('salvo'); })
    .catch((e) => { avisoPerfil('erro'); toast('O perfil não foi salvo: ' + e.message); });
}
// silencioso: enquanto a pessoa digita (não redesenha a tela).
export function mudarPerfil(fn, { silencioso = false } = {}) {
  const P = estado.perfil?.eu;
  if (!P || !P.perfil) return;
  fn(P.perfil);
  // Admin: os blocos da corrente já mostram a mudança.
  const meu = (estado.perfil.todos || []).find((x) => x.pessoaId === P.pessoaId);
  if (meu) meu.perfil = JSON.parse(JSON.stringify(P.perfil));
  // Guias da corrente: atualiza a minha linha.
  if (Array.isArray(estado.perfil.guias)) {
    const g = P.perfil.guias || {};
    const outros = estado.perfil.guias.filter((x) => x.pessoaId !== P.pessoaId);
    estado.perfil.guias = g.chefe?.linha || g.frente?.linha
      ? [...outros, { pessoaId: P.pessoaId, nome: P.nome, chefe: g.chefe?.linha || '', frente: g.frente?.linha || '' }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      : outros;
  }
  perfilPendente = JSON.parse(JSON.stringify(P.perfil));
  avisoPerfil('salvando');
  if (!silencioso) avisar();
  clearTimeout(timerPerfil);
  timerPerfil = setTimeout(enviarPerfil, silencioso ? 900 : 300);
}
// Ao sair do app ou trocar de tela com algo por salvar: envia na hora (mesmo fechando a página).
export function salvarPerfilAgora() {
  if (!perfilPendente) return;
  clearTimeout(timerPerfil);
  const enviar = perfilPendente;
  perfilPendente = null;
  if (emDemo() || estado.verComo) { api('POST', '/auth/perfil', { perfil: enviar }).catch(() => {}); return; }
  try {
    fetch('/api/auth/perfil', { method: 'POST', keepalive: true,
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ perfil: enviar }) });
  } catch { /* sem conexão */ }
}

// Há algo ainda por salvar? A atualização do app espera.
export const temPendencia = () => estado.salvando > 0 || Object.keys(pendente).length > 0 || !!perfilPendente || Object.values(timersDoacao).some(Boolean);

// ---------- oferendas ----------
// Pode ser chamada a cada desenho enquanto não há dados: só faz um pedido por vez.
// A resposta de quem já saiu da conta é ignorada (senão a próxima pessoa veria os compromissos da anterior).
let carregandoOferendas = null;
export function carregarOferendas() {
  if (carregandoOferendas) return carregandoOferendas;
  const sessao = token();
  carregandoOferendas = (async () => {
    try {
      const r = await api('GET', '/oferendas');
      if (token() === sessao) estado.oferendas = r;
    } catch (e) {
      if (token() === sessao) { toast(e.message); estado.oferendas = estado.oferendas || { oferendas: [], eu: {} }; }
    }
    carregandoOferendas = null;
    avisar();
  })();
  return carregandoOferendas;
}

// Abrir uma aba: mostra na hora o que já foi baixado e busca de novo por trás; sem nada baixado (ou com erro), a tela
// carrega como antes. A resposta só entra se ninguém mudou os dados enquanto isso (uma ação na tela, como doar ou
// salvar, já trouxe a versão mais nova) e se ainda é a mesma sessão. Falhou: fica o que já estava.
// buscar: devolve os valores novos, na ordem das chaves.
async function buscarPorTras(chaves, buscar) {
  const antes = chaves.map((k) => estado[k]);
  const sessao = token();
  try {
    const novos = await buscar();
    if (token() !== sessao || chaves.some((k, i) => estado[k] !== antes[i])) return;
    chaves.forEach((k, i) => { estado[k] = novos[i]; });
    avisar();
  } catch { /* sem conexão: a tela continua com o que tinha */ }
}
export function atualizarAoAbrir(chave, rota) {
  const atual = estado[chave];
  if (atual && !atual.erro) buscarPorTras([chave], async () => [await api('GET', rota)]);
  else estado[chave] = null;
}
// ---------- quem entrou nas abas ----------
// Ao abrir uma aba, ela fica anotada no aparelho e vai ao servidor de carona no próximo /auth/inicio (abertura ou
// volta ao app): um pedido só para isso acordava o banco. Guardada com o fim do token, para não passar para quem
// entrar depois no mesmo aparelho. O root e o "Ver como" não contam (o servidor também confere).
const CHAVE_VISITAS = 'cpj.visitas';
function visitasGuardadas() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_VISITAS) || 'null');
    return v && v.t === String(token() || '').slice(-16) && Array.isArray(v.abas) ? v.abas : [];
  } catch { return []; }
}
function guardarVisitas(abas) {
  try {
    if (abas.length) localStorage.setItem(CHAVE_VISITAS, JSON.stringify({ t: String(token() || '').slice(-16), abas }));
    else localStorage.removeItem(CHAVE_VISITAS);
  } catch { /* sem armazenamento: a visita só não conta */ }
}
function visitasPendentes() { return emDemo() ? [] : visitasGuardadas().filter(abaValida); }
function visitasEnviadas(abas) { if (abas.length) guardarVisitas(visitasGuardadas().filter((a) => !abas.includes(a))); }
export function registrarVisita(aba) {
  if (!estado.me || estado.verComo || ehRootReal() || !abaValida(aba)) return;
  const abas = visitasGuardadas();
  if (!abas.includes(aba)) guardarVisitas([...abas, aba]);
}
// Bloco do Admin root: [{ chave, aba, dia, nome, grupo, vezes, ultima }] dos últimos 3 dias (null = ainda não carregou).
export async function carregarVisitas() {
  try { estado.visitas = await api('GET', '/usuarios?lista=visitas'); } catch (e) { toast(e.message); estado.visitas = estado.visitas || []; }
  avisar();
}

// Admin root: usuários, perfis e senhas vêm juntos, numa chamada só.
export function atualizarUsuariosAoAbrir() {
  if (estado.usuarios && estado.perfisCfg && estado.senhas) {
    buscarPorTras(['usuarios', 'perfisCfg', 'senhas'], async () => { const r = await api('GET', '/usuarios?lista=tudo'); return [r.usuarios, r.perfis, r.senhas]; });
  } else estado.usuarios = null;
}

// Abrir a aba Oferendas: mostra na hora o que já foi baixado e atualiza por trás (a primeira vez, a tela carrega).
export function atualizarOferendasAoAbrir() {
  if (estado.oferendas) carregarOferendas();
  if (estado.iemanja && !estado.iemanja.erro) carregarIemanja();
  else estado.iemanja = null;   // com erro, tenta de novo do zero
}

// ---------- aba Iemanjá ----------
let carregandoIemanja = false;
export async function carregarIemanja() {
  if (carregandoIemanja) return;
  carregandoIemanja = true;
  try { estado.iemanja = await api('GET', '/oferendas?lista=iemanja'); } catch (e) { estado.iemanja = { erro: e.message }; }
  carregandoIemanja = false;
  avisar();
}
export async function acaoIemanja(op, dados = {}) {
  try {
    estado.iemanja = await api('POST', '/oferendas', { acao: 'iemanja', op, ...dados });
    estado.me = { ...estado.me, iemanjaPublica: estado.iemanja.publica };
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
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
