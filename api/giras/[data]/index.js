// GET    /api/giras/:data
// PUT    /api/giras/:data   { entidade?, titulo?, presenca?, papeis?, pares?, passes?, atendimentos?, participantes?, encerrada?, limpeza?, orixa?, evento? } (só substitui o que vier)
//                            (gira nova: quem tinha ausência antecipada na data já entra Ausente)
//                            (atendimentos + encerrada: true = cadastrar uma gira antiga já encerrada, sem escala: só o root)
// POST   /api/giras/:data   { acao: 'publicar', publicada?: false } → a escala fica visível para todos (ou volta a ficar só para os admins)
//                            { acao: 'encerrar', atendimentos: { preferencial, normal, passe } | participantes } | { acao: 'reabrir' }  → { gira, mensagem }
//                            { acao: 'sortear' }  sorteio completo (mantém as duplas fixadas) → { gira, mensagem }
//                            { acao: 'remanejar' }  ajusta só quem foi afetado por faltas → { gira, mensagem }
//                              (o app anterior chama /api/giras/:data/sortear e /remanejar sem corpo: o vercel.json reescreve para ?acao=)
//                            { acao: 'ausencia' }  acesso da corrente: a própria pessoa passa de Pendente para Ausente (até a véspera)
//                            { acao: 'minhaEntidade', linha }  gira com mais de uma linha: a própria pessoa escolhe a entidade que vai atender ('' = tira a escolha)
//                            { acao: 'cancelarSorteio' }  apaga todas as duplas (também as fixadas) e tira a trava: volta ao botão Sortear (escala publicada: recusa)
//                            { acao: 'travar', travada: true|false }  com a trava, marcar falta ou ausência não muda a escala (e não dá para remanejar)
//                            { acao: 'recado', recado }  recado do admin: até 5 linhas, para todos verem no evento em andamento
//                            { acao: 'mudarData', para: 'AAAA-MM-DD' }  troca a data programada da gira em aberto (leva tudo junto) → { gira, mensagem }
//                            { acao: 'escala', entidade, orixa, papeis, pares, passes }  Histórico → Cadastrar escala (só o root): grava as duplas
//                              numa gira que já existe, sem mexer na presença nem nos atendidos (sem gira na data, recusa) → { gira, mensagem }
// GET    /api/giras/:data?lista=fila        resumo da fila de senhas e a própria senha (sem login; X-Fila-Token) — api/_lib/fila.js
// GET    /api/giras/:data?lista=filaResumo  o mesmo resumo para todos (sem a própria senha), guardado 3 s pela Vercel
// GET    /api/giras/:data?lista=filaPainel  painel de quem controla a fila (todas as senhas)
// POST   { acao: 'filaEntrar', tipo, nome, telefone, lat, lon } | { acao: 'filaDesistir' }  (sem login)
//        { acao: 'filaChamar', fila, quantidade?, tipo? } | { acao: 'filaMarcar', id, status } | { acao: 'filaConfig', aberta?, limite?, manual? } | { acao: 'filaBalcao', tipo, nome, telefone }
// DELETE /api/giras/:data
import { rota, corpo, validarData, validarId, HttpError, MSG_ENCERRADA, hojeBR } from '../../_lib/http.js';
import { exigir, exigirComLeitura } from '../../_lib/sessao.js';
import { pode } from '../../../shared/permissoes.js';
import { ocultarSorteio } from '../../_lib/escala.js';
import { configCasa, definirConfig } from '../../../shared/config.js';
import { db } from '../../_lib/db.js';
import { ACOES_FILA_PUBLICAS, ACOES_FILA_PAINEL, filaPublica, filaResumo, acaoFilaPublica, filaPainel, acaoFilaPainel } from '../../_lib/fila.js';
import { giraVazia, STATUS_KEYS, turmasLimpeza, ORIXAS, encerrar, reabrir, sortear, remanejar, pendentesDaGira, desfazerAuto, podeDeclararAusencia, podeEscolherEntidade, linhasParaEscolher } from '../../../shared/regras.js';

function validarDuplas(lista, nome) {
  if (!Array.isArray(lista) || lista.length > 500) throw new HttpError(400, `Lista de ${nome} inválida.`);
  return lista.map((d) => ({
    m: validarId(d?.m, 'Médium'),
    c: validarId(d?.c, 'Pessoa'),
    fixo: !!d.fixo,
    remanejado: !!d.remanejado,
  }));
}

function validarPresenca(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new HttpError(400, 'Presença inválida.');
  const r = {};
  for (const [id, st] of Object.entries(o)) {
    validarId(id, 'Pessoa');
    if (!STATUS_KEYS.includes(st)) throw new HttpError(400, 'Status de presença inválido.');
    r[id] = st;
  }
  return r;
}

function validarPapeis(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new HttpError(400, 'Função do dia inválida.');
  const r = {};
  for (const [id, v] of Object.entries(o)) {
    validarId(id, 'Pessoa');
    if (!['sup', 'na', 'cad', 'pas', 'ext', 'sen'].includes(v)) throw new HttpError(400, 'Função do dia inválida.');
    r[id] = v;
  }
  return r;
}

// Escala publicada ("Sorteio realizado!"): a gira, o orixá, a data e o Evento ficam como estão e o sorteio
// não se cancela. Para mudar, o admin oculta a escala antes.
const escalaPublicada = (g) => !!(g?.publicada && (g.pares?.length || g.passes?.length));
const MSG_PUBLICADA = 'A escala já foi publicada. Para mudar isso, oculte a escala antes.';

function validarEntidade(v) {
  const e = String(v ?? '').trim();
  if (e.length > 120) throw new HttpError(400, 'Entidade muito longa.');
  return e;
}

// Nome da gira escrito pelo admin; vazio volta ao nome automático.
function validarTitulo(v) {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (t.length > 120) throw new HttpError(400, 'O nome da gira pode ter até 120 letras.');
  return t;
}

// Recado do admin: até 5 linhas (sem espaços nas pontas das linhas).
function validarRecado(v) {
  const s = String(v ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();
  if (s.split('\n').length > 5) throw new HttpError(400, 'O recado pode ter até 5 linhas.');
  if (s.length > 300) throw new HttpError(400, 'O recado pode ter até 300 letras.');
  return s;
}

function validarOrixa(v) {
  const o = String(v ?? '').trim();
  if (o && !ORIXAS.includes(o)) throw new HttpError(400, 'Orixá inválido.');
  return o;
}

function validarAtendimentos(a) {
  const at = {};
  for (const k of ['preferencial', 'normal', 'passe']) {
    const n = Number(a?.[k] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
    at[k] = n;
  }
  return at;
}

function validarParticipantes(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, 'Informe o total de participantes (de 0 a 100.000).');
  return n;
}

// Quem entra pelo acesso da corrente (cpj), com ou sem senha, avisa que não vai.
// Sessão, gira e a própria pessoa numa ida só (só a pessoa, não a corrente inteira). A pessoa de um usuário
// (cadastro ligado ao e-mail) só se conhece depois da sessão: aí ela vem numa ida à parte.
async function giraEPessoa(req) {
  let data;
  const [eu, atual, lista] = await exigirComLeitura(req, 'giras:ler', ({ pessoaId }) => [
    { funcao: 'gira_obter', p: { data: (data = validarData(req.query.data)) } },
    ...(pessoaId ? [{ funcao: 'pessoas_listar', p: { id: pessoaId } }] : []),
  ]);
  const pessoas = lista || (eu.pessoaId ? await db.rpc('pessoas_listar', { id: eu.pessoaId }) : []);
  return { eu, data, atual, p: pessoas.find((x) => x.id === eu.pessoaId) };
}

async function declararAusencia(req) {
  const { eu, data, atual, p } = await giraEPessoa(req);
  if (eu.papel !== 'corrente' || !eu.pessoaId) throw new HttpError(403, 'Só quem entra pelo acesso da corrente declara ausência por aqui.');
  if (!atual) throw new HttpError(404, 'Esta gira ainda não foi criada.');
  if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
  const faleCom = async () => `Fale com a ${configCasa(await db.rpc('config_casa')).responsavel}.`;
  if (hojeBR() >= data) throw new HttpError(400, `A ausência só pode ser declarada até o dia anterior à gira. ${await faleCom()}`);
  if (!podeDeclararAusencia(p, atual, hojeBR())) throw new HttpError(400, `Sua presença nesta gira já foi definida. ${await faleCom()}`);
  const gira = ocultarSorteio(eu, await db.rpc('presenca_marcar', { data, pessoaId: p.id, status: 'a' }));
  return { gira, mensagem: 'Ausência registrada. Obrigado por avisar! #boa gira' };
}

async function escolherEntidade(req, linha) {
  const { eu, data, atual, p } = await giraEPessoa(req);
  if (!eu.pessoaId) throw new HttpError(403, 'Só quem tem cadastro na corrente escolhe a entidade.');
  if (!atual) throw new HttpError(404, 'Esta gira ainda não foi criada.');
  if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
  if (!podeEscolherEntidade(p, atual)) throw new HttpError(400, 'Nesta gira você não escolhe a entidade.');
  const escolha = typeof linha === 'string' ? linha : '';
  if (escolha && !linhasParaEscolher(atual).some(([k]) => k === escolha)) throw new HttpError(400, 'Entidade inválida para esta gira.');
  const gira = ocultarSorteio(eu, await db.rpc('gira_atende', { data, pessoaId: p.id, linha: escolha }));
  return { gira, mensagem: escolha ? 'Entidade registrada.' : 'Escolha retirada.' };
}

// Sortear e Remanejar faltas: as regras usam a lista inteira de giras (histórico das duplas).
async function sortearOuRemanejar(req, acao) {
  // Sessão, pessoas, giras e as Regras da casa (Suporte mínimo, 2º cambone) numa ida só ao banco.
  const [perfil, pessoas, giras, cfg] = await exigirComLeitura(req, 'giras:sortear', () => [{ funcao: 'pessoas_listar' }, { funcao: 'giras_listar' }, { funcao: 'config_casa' }]);
  definirConfig(cfg);
  const data = validarData(req.query.data);
  const g = giras.find((x) => x.data === data) || giraVazia(data);
  if (g.encerrada) throw new HttpError(409, MSG_ENCERRADA);
  if (g.evento) throw new HttpError(409, `Evento não tem escala para ${acao}.`);
  if (acao === 'remanejar' && g.travada) throw new HttpError(409, 'A escala está travada. Desligue a Trava na Presença para remanejar.');
  const { patch, mensagem } = (acao === 'sortear' ? sortear : remanejar)(pessoas, giras, g);
  const gira = patch && Object.keys(patch).length ? await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }) : g;
  return { gira, mensagem };
}
// Encerrar e reabrir. Sessão, pessoas e gira numa ida só ao banco (antes, uma para a sessão e outra para os dados).
// Todas as pessoas: uma gira antiga pode ter quem já saiu da corrente (as regras filtram pela data).
async function encerrarOuReabrir(req, b) {
  let data;
  const [perfil, pessoas, atual] = await exigirComLeitura(req, 'giras:editar', () => [
    { funcao: 'pessoas_listar', p: { todas: true } },
    { funcao: 'gira_obter', p: { data: (data = validarData(req.query.data)) } },
  ]);
  if (b.acao === 'reabrir') {
    if (!atual?.encerrada) return { gira: atual || giraVazia(data), mensagem: 'A gira já estava aberta.' };
    const { patch: { retrato, ...patch }, mensagem } = reabrir(pessoas, atual);
    // gira_retrato por último: db.tx() devolve o resultado do último RPC.
    return { gira: await db.tx([
      { funcao: 'gira_salvar', p: { data, usuario: perfil.id, ...patch } },
      { funcao: 'gira_retrato', p: { data, retrato } },
    ]), mensagem };
  }
  if (atual?.encerrada) return { gira: atual, mensagem: 'A gira já estava encerrada.' };
  // Só encerra depois de confirmar a presença de todos (ninguém pendente).
  const pend = pendentesDaGira(pessoas, atual || giraVazia(data));
  if (pend.length) throw new HttpError(409, `Confirme a presença antes de encerrar: ${pend.length} pendente${pend.length > 1 ? 's' : ''} (${pend.slice(0, 5).map((p) => p.nome).join(', ')}${pend.length > 5 ? '…' : ''}).`);
  // O retrato (quem estava na gira e como estava no cadastro) é gravado junto, por último.
  const { patch: { retrato, ...patch }, mensagem } = encerrar(pessoas, atual || giraVazia(data));
  const chamadas = [{ funcao: 'gira_salvar', p: { data, usuario: perfil.id, ...patch } }];
  if (atual?.evento) {
    chamadas.push({ funcao: 'gira_participantes', p: { data, usuario: perfil.id, participantes: validarParticipantes(b.participantes) } });
  } else {
    // Quantas pessoas foram atendidas na gira.
    if (!b.atendimentos || typeof b.atendimentos !== 'object') throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
    chamadas[0].p.atendimentos = validarAtendimentos(b.atendimentos);
  }
  chamadas.push({ funcao: 'gira_retrato', p: { data, retrato } });
  const gira = await db.tx(chamadas);
  // À parte, depois de gravado: uma falha aqui não desfaz o encerramento.
  await db.rpc('apagar_excluidos');   // quem já foi excluído e só faltava nesta gira sai de vez
  return { gira, mensagem };
}

const SORTEIO = ['sortear', 'remanejar'];

export default rota({
  GET: async (req, res) => {
    // Fila de senhas: o resumo é público (sem login); o painel, de quem controla a fila.
    if (req.query.lista === 'fila') return filaPublica(req, validarData(req.query.data));
    if (req.query.lista === 'filaResumo') return filaResumo(res, validarData(req.query.data));
    if (req.query.lista === 'filaPainel') return filaPainel(req, validarData(req.query.data));
    // Sessão e gira numa ida só ao banco (a data é conferida depois do token, como antes: sem login, 401).
    let data;
    const [eu, gira] = await exigirComLeitura(req, 'giras:ler', () => [{ funcao: 'gira_obter', p: { data: (data = validarData(req.query.data)) } }]);
    return ocultarSorteio(eu, gira || giraVazia(data));
  },
  PUT: async (req) => {
    // Sessão e gira atual numa ida só ao banco.
    let data;
    // As ausências antecipadas vão junto (são poucas): servem só se a gira for nova, e assim não custam outra ida.
    const [perfil, atual, ausPrevias] = await exigirComLeitura(req, 'giras:editar', () => [
      { funcao: 'gira_obter', p: { data: (data = validarData(req.query.data)) } },
      { funcao: 'ausencias_previas_listar' },
    ]);
    const b = corpo(req);
    // Cadastrar gira antiga (já encerrada): só o admin root.
    if (b.encerrada === true && !pode(perfil, 'usuarios:gerenciar')) throw new HttpError(403, 'Só o admin root cadastra gira antiga.');
    // Gira encerrada: só a turma da limpeza ainda pode mudar (o resto, só reabrindo).
    const soLimpeza = Object.keys(b).length > 0 && Object.keys(b).every((k) => k === 'limpeza');
    if (!soLimpeza && atual?.encerrada) throw new HttpError(409, MSG_ENCERRADA);
    const mudaEvento = 'evento' in b;
    if (mudaEvento && typeof b.evento !== 'boolean') throw new HttpError(400, 'Opção de evento inválida.');
    const participantes = 'participantes' in b ? validarParticipantes(b.participantes) : undefined;
    if (participantes !== undefined && (!(atual?.evento || b.evento === true) || b.evento === false)) {
      throw new HttpError(409, 'O total de participantes só pode ser registrado em um evento.');
    }
    if (atual?.evento && b.evento !== false && ('pares' in b || 'passes' in b || 'limpeza' in b)) {
      throw new HttpError(409, 'Evento não pode ter turma da limpeza ou escala.');
    }
    const p = { data, usuario: perfil.id };
    if ('entidade' in b) p.entidade = validarEntidade(b.entidade);
    if ('entidade' in b || 'entidadeNome' in b) p.entidadeNome = validarEntidade(b.entidadeNome);
    if ('titulo' in b) p.titulo = validarTitulo(b.titulo);
    if ('presenca' in b) p.presenca = validarPresenca(b.presenca);
    if ('papeis' in b) p.papeis = validarPapeis(b.papeis);
    if ('pares' in b) p.pares = validarDuplas(b.pares, 'cambones');
    if ('passes' in b) p.passes = validarDuplas(b.passes, 'médiuns de passe');
    if ('atendimentos' in b) p.atendimentos = validarAtendimentos(b.atendimentos);
    if ('limpeza' in b) {
      if (b.limpeza === null || b.limpeza === '') p.limpeza = null;
      else {
        definirConfig(await db.rpc('config_casa'));
        if (!turmasLimpeza().includes(Number(b.limpeza))) throw new HttpError(400, `Turma da limpeza inválida (1 a ${turmasLimpeza().length}).`);
        p.limpeza = Number(b.limpeza);
      }
    }
    if ('orixa' in b) p.orixa = validarOrixa(b.orixa);
    if (escalaPublicada(atual) && (('entidade' in p && p.entidade !== (atual.entidade || ''))
      || ('entidadeNome' in p && p.entidadeNome !== (atual.entidadeNome || ''))
      || ('orixa' in p && p.orixa !== (atual.orixa || ''))
      || (mudaEvento && b.evento !== !!atual.evento))) throw new HttpError(409, MSG_PUBLICADA);
    if (b.encerrada === true) p.encerrada = true;
    if (b.evento === true && !atual?.evento) {
      p.limpeza = null;
      p.pares = [];
      p.passes = [];
    }
    // Gira nova: quem tinha ausência antecipada nesta data já entra como Ausente (o que veio no pedido vale mais).
    const nova = b.encerrada !== true && !atual;
    const previas = nova ? (ausPrevias || []).filter((x) => x.data === data).map((x) => x.pessoaId) : [];
    if (previas.length) p.presenca = { ...Object.fromEntries(previas.map((id) => [id, 'a'])), ...(p.presenca || {}) };
    // Todas as gravações numa ida só (e numa transação), em vez de uma ida por parte; a gira volta no fim (gira_obter).
    const chamadas = [{ funcao: 'gira_salvar', p }];
    if ('entidadeNome' in p) chamadas.push({ funcao: 'gira_entidade_nome', p: { data, nome: p.entidadeNome } });
    if ('titulo' in p) chamadas.push({ funcao: 'gira_titulo', p: { data, titulo: p.titulo } });
    if (nova) chamadas.push({ funcao: 'ausencias_previas_usar', p: { data } });
    if (mudaEvento) chamadas.push({ funcao: 'gira_evento', p: { data, usuario: perfil.id, evento: b.evento } });
    if (participantes !== undefined) chamadas.push({ funcao: 'gira_participantes', p: { data, usuario: perfil.id, participantes } });
    // Gira antiga cadastrada já encerrada (ou encerrada sem retrato): retrato pelo cadastro de hoje.
    if ((p.encerrada || atual?.encerrada) && !atual?.retrato) chamadas.push({ funcao: 'gira_retrato', p: { data, doCadastro: true } });
    chamadas.push({ funcao: 'gira_obter', p: { data } });
    return ocultarSorteio(perfil, await db.tx(chamadas));
  },
  POST: async (req) => {
    // App anterior: /api/giras/:data/sortear ou /remanejar, sem corpo (reescrito pelo vercel.json).
    if (SORTEIO.includes(req.query.acao)) return sortearOuRemanejar(req, req.query.acao);
    const b = corpo(req);
    if (SORTEIO.includes(b.acao)) return sortearOuRemanejar(req, b.acao);
    if (ACOES_FILA_PUBLICAS.includes(b.acao)) return acaoFilaPublica(req, validarData(req.query.data), b);
    if (ACOES_FILA_PAINEL.includes(b.acao)) return acaoFilaPainel(req, validarData(req.query.data), b);
    if (b.acao === 'ausencia') return declararAusencia(req);
    if (b.acao === 'minhaEntidade') return escolherEntidade(req, b.linha);
    // Admin root (Histórico → estatísticas): corrige a presença de uma pessoa, mesmo em gira encerrada.
    if (b.acao === 'corrigirPresenca') {
      // Sessão e gira numa ida só ao banco.
      let data;
      const [, atual] = await exigirComLeitura(req, 'usuarios:gerenciar', () => [{ funcao: 'gira_obter', p: { data: (data = validarData(req.query.data)) } }]);
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      const pessoaId = validarId(b.pessoaId, 'Pessoa');
      if (!['p', 'f', 'a'].includes(b.status)) throw new HttpError(400, 'Status inválido.');
      return { gira: await db.rpc('presenca_marcar', { data, pessoaId, status: b.status }), mensagem: 'Presença corrigida.' };
    }
    // Cancela o sorteio (apaga duplas, despublica e tira a trava): as conferências e a gravação numa ida só (gira_acao).
    if (b.acao === 'cancelarSorteio') {
      const quem = await exigir(req, 'giras:sortear');
      const data = validarData(req.query.data);
      let gira = await db.rpc('gira_acao', { acao: 'cancelarSorteio', data, usuario: quem.id });
      // Quem o sorteio pôs no Suporte volta à função de antes (shared/regras.js desfazerAuto).
      if (Object.keys(gira?.suporteAuto || {}).length) {
        gira = await db.rpc('gira_salvar', { data, usuario: quem.id, papeis: desfazerAuto(gira), suporteAuto: {} });
      }
      return { gira, mensagem: 'Sorteio cancelado: as duplas foram apagadas.' };
    }
    if (b.acao === 'encerrar' || b.acao === 'reabrir') return encerrarOuReabrir(req, b);
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const { acao } = b;
    if (acao === 'mudarData') {
      const para = validarData(String(b.para || ''));
      const gira = await db.rpc('gira_acao', { acao, data, para });
      if (para === data) return { gira, mensagem: 'A gira já está nesta data.' };
      const [y, m, d] = para.split('-');
      return { gira, mensagem: `Data da gira alterada para ${d}/${m}/${y}.` };
    }
    if (acao === 'escala') {
      if (!pode(perfil, 'usuarios:gerenciar')) throw new HttpError(403, 'Só o admin root cadastra escala.');
      if (data > hojeBR()) throw new HttpError(400, 'Essa gira ainda não aconteceu. Use a aba Gira para montar a escala.');
      const atual = await db.rpc('gira_obter', { data });
      const [d, m, y] = data.split('-').reverse();
      // A escala nunca cria gira nem presença: só completa uma gira que já foi salva (ex.: pelo resumo do WhatsApp).
      if (!atual) throw new HttpError(404, `Não existe gira salva em ${d}/${m}/${y}. Confira a data ou cadastre a gira antes.`);
      if (atual.evento) throw new HttpError(409, 'Evento não pode receber escala.');
      const p = { data, usuario: perfil.id, pares: validarDuplas(b.pares, 'cambones'), passes: validarDuplas(b.passes, 'médiuns de passe') };
      const entidade = validarEntidade(b.entidade);
      const orixa = validarOrixa(b.orixa);
      // Troca as duplas, soma a função do dia e completa a gira e o orixá se estiverem vazios.
      p.papeis = { ...(atual.papeis || {}), ...validarPapeis(b.papeis) };
      if (!atual.entidade && entidade) {
        p.entidade = entidade;
        p.entidadeNome = validarEntidade(b.entidadeNome);
      }
      if (!atual.orixa && orixa) p.orixa = orixa;
      // Gravação e nome da gira numa ida só; a gira volta no fim.
      const gira = await db.tx([
        { funcao: 'gira_salvar', p },
        ...('entidadeNome' in p ? [{ funcao: 'gira_entidade_nome', p: { data, nome: p.entidadeNome } }] : []),
        { funcao: 'gira_obter', p: { data } },
      ]);
      return { gira, mensagem: `Escala gravada na gira de ${d}/${m}/${y} (presença e atendidos não mudaram).` };
    }
    // Publicar, travar e recado: as conferências (gira existe, encerrada, evento) ficam em gira_acao, numa ida só.
    if (acao === 'publicar') {
      const pub = b.publicada !== false;
      return { gira: await db.rpc('gira_acao', { acao, data, publicada: pub }), mensagem: pub ? 'Escala publicada: agora todos veem o sorteio.' : 'Publicação desfeita: só os admins veem o sorteio.' };
    }
    if (acao === 'travar') {
      if (typeof b.travada !== 'boolean') throw new HttpError(400, 'Informe se a escala fica travada.');
      return { gira: await db.rpc('gira_acao', { acao, data, travada: b.travada }), mensagem: b.travada ? 'Escala travada: marcar falta não muda a escala.' : 'Trava desligada: faltas voltam a tirar a pessoa da escala.' };
    }
    if (acao === 'recado') {
      const recado = validarRecado(b.recado);
      return { gira: await db.rpc('gira_acao', { acao, data, recado }), mensagem: recado ? 'Recado salvo: todos veem no evento.' : 'Recado retirado.' };
    }
    throw new HttpError(400, 'Ação inválida.');
  },
  DELETE: async (req) => {
    await exigir(req, 'giras:excluir');
    return db.rpc('gira_excluir', { data: validarData(req.query.data) });
  },
});
