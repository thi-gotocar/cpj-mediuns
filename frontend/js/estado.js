// Estado da tela e todas as chamadas ao backend.
// As telas leem "estado" e chamam as funções daqui; nada fala com a API direto.

import { api, definirVerComo } from './api.js';
import { token, emDemo } from './auth.js';
import { giraVazia, ordenarPessoas, pessoasDe, expandirRetrato } from '/shared/regras.js';
import { permissoesDe, PERFIS_PADRAO, PERMISSOES_GRUPO } from '/shared/permissoes.js';
import { definirConfig } from '/shared/config.js';
import { abaValida } from '/shared/visitas.js';
import { hoje, toast } from './util.js';
// As chamadas das abas (usuários … ASAAS) ficam em estadoAbas.js; as telas continuam importando tudo daqui.
export * from './estadoAbas.js';
import { carregarAlunos } from './estadoAbas.js';

export const estado = {
  me: null,            // { id, nome, email, papel, permissoes }
  pessoas: [],
  giras: {},           // por data
  girasCompletas: false, // false: só os últimos 12 meses (abertura); o histórico inteiro vem por historicoCompleto()
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
  oferendas: null,     // GET /api/oferendas: { oferendas, eu, anterioresTotal? }
  oferendasAnteriores: false, // o admin abriu "Oferendas anteriores": os pedidos trazem também as encerradas antigas
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
  fila: null,          // aba Gira: painel da fila de senhas { data, aberta, limite, emitidas, aguardando, chamadas, senhas }
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
// O grupo Oferenda (aluno com oferendas:ver) vê as listas, sem doar.
export const veOferendas = () => veIemanja() || ((pode('oferendas:doar') || pode('oferendas:ver')) && (visaoAtiva() !== 'alunos' || !!estado.me?.grupoOferenda) && (pode('oferendas:gerenciar') || !!(estado.oferendas?.publica ?? estado.me?.oferendasPublica)));
export const pessoasOrd = () => ordenarPessoas(estado.pessoas.filter((p) => !p.saida));
// Inclui quem já saiu: só para giras e estatísticas, sempre filtrando pela data da gira (naCorrenteEm).
export const pessoasComSaidas = () => ordenarPessoas(estado.pessoas);
export const nome = (id) => estado.pessoas.find((p) => p.id === id)?.nome || '(removido)';
// Nome como estava na gira (encerrada: o do retrato, mesmo de quem já saiu do cadastro).
export const nomeNaGira = (g) => { const ps = pessoasDe(estado.pessoas, g); return (id) => ps.find((p) => p.id === id)?.nome || nome(id); };
export const girasLista = () => Object.values(estado.giras);
export const giraAtual = () => estado.giras[prefs.data] || giraVazia(prefs.data);

// desde: a lista é só das giras dessa data em diante (a abertura manda os últimos 12 meses); as mais antigas que o app
// já tem continuam. Sem desde: é a lista inteira (GET /api/giras).
function definirGiras(lista, desde = null) {
  const novo = {};
  if (desde) Object.values(estado.giras).forEach((g) => { if (g.data < desde) novo[g.data] = g; });
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
  // parcial=1: as giras vêm dos últimos 12 meses e, na volta ao app, só a parte que mudou (giras ou o resto).
  const r = await api('GET', '/auth/inicio?parcial=1' + (vis.length ? '&visitas=' + vis.join(',') : ''));
  visitasEnviadas(vis);
  const { me } = r;
  definirConfig(r.config);
  estado.me = me;
  // Relatos e atrasos são de quem está logado: vêm junto na abertura; o que não vier, a aba Geral busca pela rota própria.
  estado.conduta = r.conduta ?? null;
  estado.atrasos = r.atrasos ?? null;
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
  estado.giras = {};
  estado.girasCompletas = !r.girasDesde;
  definirGiras(r.giras, r.girasDesde);
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
  Object.assign(estado, { oferendas: null, oferendasAnteriores: false, iemanja: null, ervas: null, guias: null, amaci: null, asaas: null, pedidos: null, transparencia: null, perfil: null,
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
    estado.girasCompletas = true;
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
    const r = await api('GET', '/auth/inicio?atualizar=1&parcial=1' + (versao ? '&versao=' + encodeURIComponent(versao) : '')
      + (vis.length ? '&visitas=' + vis.join(',') : ''));
    visitasEnviadas(vis);
    if (r.semMudanca) { await atualizarAbaAberta(); return; }
    if (r.versao) estado.versaoDados = r.versao;
    if (r.config) definirConfig(r.config);
    // Só vem o que mudou (giras, o resto ou os dois); lista que falhou no servidor também não vem: fica a que já está.
    const minhaCurimba = r.minhaCurimba === undefined ? estado.minhaCurimba : r.minhaCurimba;
    estado.oracoes = r.oracoes || estado.oracoes;
    if (r.pessoas) estado.pessoas = r.pessoas;
    estado.eventos = r.eventos || estado.eventos;
    estado.minhaCurimba = minhaCurimba?.aulas ? minhaCurimba : null;
    estado.entidadesApelidos = r.entidadesApelidos || estado.entidadesApelidos;
    if (r.giras) definirGiras(r.giras, r.girasDesde);
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
    estado.oferendas !== null && !Object.values(timersDoacao).some(Boolean) ? api('GET', rotaOferendas()).catch(() => estado.oferendas) : estado.oferendas,
    estado.iemanja !== null ? api('GET', '/oferendas?lista=iemanja').catch(() => estado.iemanja) : estado.iemanja,
  ]);
  estado.oferendas = oferendas && juntarOferendas(oferendas);
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
    estado.girasCompletas = true;
  } catch (e) { toast(e.message); }
  avisar();
}

// Histórico inteiro de giras: a abertura traz só os últimos 12 meses. As telas que olham para trás (Histórico,
// Sugestão, quem cambonou quem, resumo da gira, outro ano no bloco do ano) chamam esta: devolve se já está completo
// e, se não, baixa uma vez por trás (a tela redesenha quando chegar).
let baixandoGiras = null;
let girasFalhouEm = 0;
export function historicoCompleto() {
  if (estado.girasCompletas || estado.me?.grupo || !estado.pronto) return true;
  if (!baixandoGiras && Date.now() - girasFalhouEm > 60000) {
    baixandoGiras = api('GET', '/giras')
      .then((giras) => { definirGiras(giras); estado.girasCompletas = true; avisar(); })
      .catch(() => { girasFalhouEm = Date.now(); })   // sem conexão: fica com os 12 meses e tenta de novo depois de 1 min
      .finally(() => { baixandoGiras = null; });
  }
  return false;
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
// A lista de pessoas traz a versão da foto (fotoV): sem foto, nem busca; com ela, o endereço com ?v= fica guardado
// no aparelho e a próxima abertura do app não vai ao banco. Lista sem fotoV (servidor antigo, demo): busca como antes.
const dataUrl = (b64) => (b64 ? 'data:image/jpeg;base64,' + b64 : '');
export async function carregarFoto(pessoaId) {
  const cad = estado.pessoas.find((x) => x.id === pessoaId);
  if (cad && 'fotoV' in cad && !cad.fotoV) { estado.fotosPessoa[pessoaId] = ''; return; }
  estado.fotosPessoa[pessoaId] = null;
  const v = cad?.fotoV ? '&v=' + encodeURIComponent(cad.fotoV) : '';
  try { estado.fotosPessoa[pessoaId] = dataUrl((await api('GET', '/auth/foto?pessoaId=' + encodeURIComponent(pessoaId) + v)).foto); } catch { estado.fotosPessoa[pessoaId] = ''; }
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
// As encerradas de antes de hoje só vêm depois que o admin abre "Oferendas anteriores" (oferendasAnteriores):
// daí em diante a leitura e as gravações pedem todas. Sem elas, anterioresTotal ({ abaId: n }) dá o número do título;
// as gravações não trazem esse número, então fica o da última leitura.
const rotaOferendas = () => '/oferendas' + (estado.oferendasAnteriores ? '?anteriores=1' : '');
const comAnteriores = (corpo) => (estado.oferendasAnteriores ? { ...corpo, anteriores: true } : corpo);
const juntarOferendas = (r) => ({ ...r, anterioresTotal: r.anterioresTotal ?? estado.oferendas?.anterioresTotal ?? {} });
export function abrirOferendasAnteriores() {
  if (estado.oferendasAnteriores) return;
  estado.oferendasAnteriores = true;
  carregandoOferendas = null;
  carregarOferendas();
}
// Pode ser chamada a cada desenho enquanto não há dados: só faz um pedido por vez.
// A resposta de quem já saiu da conta é ignorada (senão a próxima pessoa veria os compromissos da anterior).
let carregandoOferendas = null;
export function carregarOferendas() {
  if (carregandoOferendas) return carregandoOferendas;
  const sessao = token();
  carregandoOferendas = (async () => {
    try {
      const r = await api('GET', rotaOferendas());
      if (token() === sessao) estado.oferendas = juntarOferendas(r);
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
    estado.oferendas = juntarOferendas(await api('POST', '/oferendas', comAnteriores({ acao, ...dados })));
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
        estado.oferendas = juntarOferendas(await api('POST', '/oferendas', comAnteriores({ acao: 'doar', itemId, quantidade })));
        toast(quantidade > 0 ? 'Doação registrada. Obrigado!' : 'Doação retirada.');
      } catch (e) {
        toast(e.message);
        try { estado.oferendas = juntarOferendas(await api('GET', rotaOferendas())); } catch { /* mantém */ }
      }
      avisar();
    });
  }, 500);
}
