// Estado e chamadas das abas (usuários, eventos, orações, conduta, atrasos, curimba, vídeos, fotos, alunos, backup,
// ervas, compras, amaci, diário, transparência e ASAAS). O estado.js reexporta tudo daqui: as telas continuam
// importando de './estado.js'.

import { estado, avisar, visaoAtiva, pode, nome, girasLista, carregarTudo } from './estado.js';
import { api } from './api.js';
import { token } from './auth.js';
import { definirConfig } from '/shared/config.js';
import { toast } from './util.js';

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

// Recado para a corrente (topo da aba Gira, todos os dias); a resposta é a config da casa inteira.
export async function salvarRecadoCorrente(recado) {
  try {
    definirConfig(await api('POST', '/giras', { acao: 'recadoCorrente', recado }));
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// Bloco Admin da aba Gira: o dia da semana das giras; a resposta é a config da casa inteira.
export async function salvarDiaGira(dia) {
  try {
    definirConfig(await api('POST', '/giras', { acao: 'diaGira', dia }));
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

export async function salvarConfigCasa(dados) {
  try {
    definirConfig(await api('POST', '/usuarios', { acao: 'config', config: dados }));
    avisar();
    return true;
  } catch (e) { toast(e.message); return false; }
}

// Regras da casa (Admin root): Suporte mínimo, 2º cambone e turmas da limpeza.
export async function salvarRegrasCasa(regras) {
  try {
    definirConfig(await api('POST', '/usuarios', { acao: 'regras', regras }));
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
// ---------- Fila de senhas (aba Gira, painel de quem controla) ----------
// estado.fila = { data, ...painel }. silencioso: a atualização de tempos em tempos só redesenha se algo mudou e se
// ninguém está digitando no painel (o redesenho tiraria o foco do campo do balcão).
let carregandoFila = null;
export function carregarFila(data, { silencioso = false } = {}) {
  if (carregandoFila) return carregandoFila;
  const sessao = token();
  carregandoFila = (async () => {
    try {
      const r = await api('GET', `/giras/${data}?lista=filaPainel`);
      if (token() !== sessao) return;
      const antes = JSON.stringify(estado.fila);
      estado.fila = { data, ...r };
      const digitando = document.activeElement?.closest?.('.fila-card') && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (!silencioso || (antes !== JSON.stringify(estado.fila) && !digitando)) avisar();
    } catch (e) {
      if (token() !== sessao) return;
      if (!silencioso) toast(e.message);
      if (!estado.fila || estado.fila.data !== data) { estado.fila = { data, erro: e.message }; avisar(); }
    } finally {
      carregandoFila = null;
    }
  })();
  return carregandoFila;
}
// acao: filaChamar | filaMarcar | filaConfig | filaBalcao → o painel volta atualizado.
export async function acaoFila(data, acao, dados = {}) {
  try {
    estado.fila = { data, ...(await api('POST', `/giras/${data}`, { acao, ...dados })) };
    avisar();
    return true;
  } catch (e) { toast(e.message); avisar(); return false; }
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
  const r = await api('POST', '/giras', { ...obj, acao: 'importar' });
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
// Toques seguidos no mesmo dia: as gravações vão em fila (o servidor recebe na ordem dos toques) e só a resposta da
// última é aplicada. Sem isso, a resposta de um toque antigo chegava depois de um toque novo e a tela voltava atrás, e
// o toque seguinte partia desse estado velho.
const filaDiario = {};   // data → { ultima: número do último toque, promessa: a gravação em curso, ok: o último estado salvo }
export async function salvarDiaDiario(data, dados) {
  const D = estado.diario;
  if (!D?.dias) return false;
  const F = (filaDiario[data] ||= { ultima: 0, promessa: Promise.resolve(), ok: D.dias.find((x) => x.data === data) });
  const meu = ++F.ultima;
  const trocar = (dia) => { const L = estado.diario?.dias; if (!L) return; estado.diario.dias = [...L.filter((x) => x.data !== data), ...(dia && Object.keys(dia.dados || {}).length ? [dia] : [])].sort((a, b) => a.data.localeCompare(b.data)); };
  trocar({ data, dados });
  avisar();
  estado.salvando++;
  const gravar = F.promessa.then(() => api('POST', '/pessoas', { acao: 'diario', op: 'salvar', data, dados }));
  F.promessa = gravar.catch(() => {});
  try {
    const r = await gravar;
    F.ok = r;
    if (meu === F.ultima) trocar(r);   // um toque mais novo já está na tela: a resposta dele é que vale
    return true;
  } catch (e) {
    // Deu erro: volta para o último estado que o servidor confirmou (se nenhum toque mais novo veio depois).
    if (meu === F.ultima) trocar(F.ok);
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
// Buscar (aba ASAAS): não guarda no estado; a tela guarda o resultado.
export async function buscarAsaas({ tipo, q, conta, de, ate }) {
  const periodo = de && ate ? `&de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}` : '';
  return api('GET', `/oferendas?lista=asaasbusca&tipo=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}&conta=${encodeURIComponent(conta)}${periodo}`);
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

// ---------- aba Oráculo (agenda de consultas com o Oráculo de Maria Mulambo) ----------
// Quem tem o Oráculo no perfil (Ver ou Editar) sempre vê; os outros, quando está Visível para todos. Fora da curimba.
export const veOraculo = () => estado.me?.grupo !== 'curimba' && visaoAtiva() !== 'curimba'
  && (pode('oraculo:ver') || pode('oraculo:gerenciar') || !!estado.me?.oraculoPublicado);
// conferir: a tela esperando o pagamento pergunta ao ASAAS se o link já foi pago.
export async function carregarOraculo(conferir = false) {
  try { estado.oraculo = await api('GET', '/oferendas?lista=oraculo' + (conferir ? '&conferir=1' : '')); } catch (e) {
    if (!conferir) estado.oraculo = estado.oraculo?.config ? estado.oraculo : { erro: e.message };
  }
  avisar();
}
// Devolve a resposta (ou null, com o erro no toast).
export async function acaoOraculo(op, dados = {}) {
  try {
    const r = await api('POST', '/oferendas', { acao: 'oraculo', op, ...dados });
    if (r?.config) { estado.oraculo = r; estado.me = { ...estado.me, oraculoPublicado: !!r.publicado }; }
    return r;
  } catch (e) { toast(e.message); return null; } finally { avisar(); }
}
