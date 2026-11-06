// GET    /api/giras/:data
// PUT    /api/giras/:data   { entidade?, presenca?, papeis?, pares?, passes?, atendimentos?, participantes?, encerrada?, limpeza?, orixa?, evento? } (só substitui o que vier)
//                            (gira nova: quem tinha ausência antecipada na data já entra Ausente)
//                            (atendimentos + encerrada: true = cadastrar uma gira antiga já encerrada, sem escala: só o root)
// POST   /api/giras/:data   { acao: 'publicar', publicada?: false } → a escala fica visível para todos (ou volta a ficar só para os admins)
//                            { acao: 'encerrar', atendimentos: { preferencial, normal, passe } | participantes } | { acao: 'reabrir' } | { acao: 'reiniciar' }  → { gira, mensagem }
//                            reiniciar: gira em aberto volta ao início (tudo pendente, sem gira, orixá, turma nem duplas); só a data fica
//                            { acao: 'ausencia' }  acesso da corrente: a própria pessoa passa de Pendente para Ausente (até a véspera)
//                            { acao: 'cancelarSorteio' }  apaga todas as duplas (também as fixadas), despublica e tira a trava: volta ao botão Sortear
//                            { acao: 'travar', travada: true|false }  com a trava, marcar falta ou ausência não muda a escala (e não dá para remanejar)
//                            { acao: 'recado', recado }  recado do admin: até 5 linhas, para todos verem no evento em andamento
//                            { acao: 'mudarData', para: 'AAAA-MM-DD' }  troca a data programada da gira em aberto (leva tudo junto) → { gira, mensagem }
//                            { acao: 'escala', entidade, orixa, papeis, pares, passes }  Histórico → Cadastrar escala (só o root): grava as duplas
//                              numa gira que já existe, sem mexer na presença nem nos atendidos (sem gira na data, recusa) → { gira, mensagem }
// DELETE /api/giras/:data
import { rota, corpo, validarData, validarId, HttpError, MSG_ENCERRADA } from '../../_lib/http.js';
import { exigir } from '../../_lib/sessao.js';
import { pode } from '../../../shared/permissoes.js';
import { ocultarSorteio } from '../../_lib/escala.js';
import { db } from '../../_lib/db.js';
import { giraVazia, STATUS_KEYS, TURMAS_LIMPEZA, ORIXAS, encerrar, reabrir, pendentesDaGira, proximaTurma, podeDeclararAusencia } from '../../../shared/regras.js';

// Data de hoje no horário de Brasília (AAAA-MM-DD).
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

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

function validarEntidade(v) {
  const e = String(v ?? '').trim();
  if (e.length > 120) throw new HttpError(400, 'Entidade muito longa.');
  return e;
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
async function declararAusencia(req) {
  const eu = await exigir(req, 'giras:ler');
  if (eu.papel !== 'corrente' || !eu.pessoaId) throw new HttpError(403, 'Só quem entra pelo acesso da corrente declara ausência por aqui.');
  const data = validarData(req.query.data);
  const [pessoas, atual] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('gira_obter', { data })]);
  const p = pessoas.find((x) => x.id === eu.pessoaId);
  if (!atual) throw new HttpError(404, 'Esta gira ainda não foi criada.');
  if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
  if (hojeBR() >= data) throw new HttpError(400, 'A ausência só pode ser declarada até o dia anterior à gira. Fale com a Michelle.');
  if (!podeDeclararAusencia(p, atual, hojeBR())) throw new HttpError(400, 'Sua presença nesta gira já foi definida. Fale com a Michelle.');
  const gira = ocultarSorteio(eu, await db.rpc('presenca_marcar', { data, pessoaId: p.id, status: 'a' }));
  return { gira, mensagem: 'Ausência registrada. Obrigado por avisar! #boa gira' };
}

export default rota({
  GET: async (req) => {
    const eu = await exigir(req, 'giras:ler');
    const data = validarData(req.query.data);
    return ocultarSorteio(eu, (await db.rpc('gira_obter', { data })) || giraVazia(data));
  },
  PUT: async (req) => {
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const b = corpo(req);
    // Cadastrar gira antiga (já encerrada): só o admin root.
    if (b.encerrada === true && !pode(perfil, 'usuarios:gerenciar')) throw new HttpError(403, 'Só o admin root cadastra gira antiga.');
    // Gira encerrada: só a turma da limpeza ainda pode mudar (o resto, só reabrindo).
    const atual = await db.rpc('gira_obter', { data });
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
    if ('presenca' in b) p.presenca = validarPresenca(b.presenca);
    if ('papeis' in b) p.papeis = validarPapeis(b.papeis);
    if ('pares' in b) p.pares = validarDuplas(b.pares, 'cambones');
    if ('passes' in b) p.passes = validarDuplas(b.passes, 'médiuns de passe');
    if ('atendimentos' in b) p.atendimentos = validarAtendimentos(b.atendimentos);
    if ('limpeza' in b) {
      if (b.limpeza === null || b.limpeza === '') p.limpeza = null;
      else if (TURMAS_LIMPEZA.includes(Number(b.limpeza))) p.limpeza = Number(b.limpeza);
      else throw new HttpError(400, 'Turma da limpeza inválida (1 a 7).');
    }
    if ('orixa' in b) p.orixa = validarOrixa(b.orixa);
    if (b.encerrada === true) p.encerrada = true;
    if (b.evento === true && !atual?.evento) {
      p.limpeza = null;
      p.pares = [];
      p.passes = [];
    }
    // Gira nova: quem tinha ausência antecipada nesta data já entra como Ausente (o que veio no pedido vale mais).
    const nova = b.encerrada !== true && !(await db.rpc('gira_obter', { data }));
    const previas = nova ? (await db.rpc('ausencias_previas_listar')).filter((x) => x.data === data).map((x) => x.pessoaId) : [];
    if (previas.length) p.presenca = { ...Object.fromEntries(previas.map((id) => [id, 'a'])), ...(p.presenca || {}) };
    let gira = await db.rpc('gira_salvar', p);
    if ('entidadeNome' in p) gira = await db.rpc('gira_entidade_nome', { data, nome: p.entidadeNome });
    if (nova) await db.rpc('ausencias_previas_usar', { data });
    if (mudaEvento) gira = await db.rpc('gira_evento', { data, usuario: perfil.id, evento: b.evento });
    if (participantes !== undefined) gira = await db.rpc('gira_participantes', { data, usuario: perfil.id, participantes });
    return ocultarSorteio(perfil, gira);
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'ausencia') return declararAusencia(req);
    // Admin root (Histórico → estatísticas): corrige a presença de uma pessoa, mesmo em gira encerrada.
    if (b.acao === 'corrigirPresenca') {
      await exigir(req, 'usuarios:gerenciar');
      const data = validarData(req.query.data);
      if (!(await db.rpc('gira_obter', { data }))) throw new HttpError(404, 'Gira não encontrada.');
      const pessoaId = validarId(b.pessoaId, 'Pessoa');
      if (!['p', 'f', 'a'].includes(b.status)) throw new HttpError(400, 'Status inválido.');
      return { gira: await db.rpc('presenca_marcar', { data, pessoaId, status: b.status }), mensagem: 'Presença corrigida.' };
    }
    if (b.acao === 'cancelarSorteio') {
      const quem = await exigir(req, 'giras:sortear');
      const data = validarData(req.query.data);
      const atual = await db.rpc('gira_obter', { data });
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
      if (atual.evento) throw new HttpError(409, 'Evento não tem escala para cancelar.');
      if (!atual.pares?.length && !atual.passes?.length) throw new HttpError(409, 'Não há sorteio para cancelar.');
      // Cancela o sorteio (apaga duplas e despublica) em uma transação.
      const gira = await db.tx([
        { funcao: 'gira_salvar', p: { data, usuario: quem.id, pares: [], passes: [] } },
        { funcao: 'gira_publicar', p: { data, publicada: false } },
        { funcao: 'gira_travar', p: { data, travada: false } },
      ]);
      return { gira, mensagem: 'Sorteio cancelado: as duplas foram apagadas.' };
    }
    const perfil = await exigir(req, 'giras:editar');
    const data = validarData(req.query.data);
    const { acao, atendimentos, participantes } = b;
    if (acao === 'mudarData') {
      const para = validarData(String(b.para || ''));
      const [atual, ocupada] = await Promise.all([db.rpc('gira_obter', { data }), db.rpc('gira_obter', { data: para })]);
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
      if (para === data) return { gira: atual, mensagem: 'A gira já está nesta data.' };
      if (ocupada) throw new HttpError(409, 'Já existe uma gira nesta data. Escolha outro dia.');
      const [y, m, d] = para.split('-');
      return { gira: await db.rpc('gira_mudar_data', { data, para }), mensagem: `Data da gira alterada para ${d}/${m}/${y}.` };
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
      let gira = await db.rpc('gira_salvar', p);
      if ('entidadeNome' in p) {
        gira = await db.rpc('gira_entidade_nome', { data, nome: p.entidadeNome });
      }
      return { gira, mensagem: `Escala gravada na gira de ${d}/${m}/${y} (presença e atendidos não mudaram).` };
    }
    if (acao === 'publicar') {
      const atual = await db.rpc('gira_obter', { data });
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      if (atual.evento) throw new HttpError(409, 'Evento não tem escala para publicar.');
      const pub = b.publicada !== false;
      return { gira: await db.rpc('gira_publicar', { data, publicada: pub }), mensagem: pub ? 'Escala publicada: agora todos veem o sorteio.' : 'Publicação desfeita: só os admins veem o sorteio.' };
    }
    if (acao === 'travar') {
      if (typeof b.travada !== 'boolean') throw new HttpError(400, 'Informe se a escala fica travada.');
      const atual = await db.rpc('gira_obter', { data });
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
      if (atual.evento && b.travada) throw new HttpError(409, 'Evento não tem escala para travar.');
      return { gira: await db.rpc('gira_travar', { data, travada: b.travada }), mensagem: b.travada ? 'Escala travada: marcar falta não muda a escala.' : 'Trava desligada: faltas voltam a tirar a pessoa da escala.' };
    }
    if (acao === 'recado') {
      const recado = validarRecado(b.recado);
      const atual = await db.rpc('gira_obter', { data });
      if (!atual) throw new HttpError(404, 'Gira não encontrada.');
      if (atual.encerrada) throw new HttpError(409, MSG_ENCERRADA);
      return { gira: await db.rpc('gira_recado', { data, recado }), mensagem: recado ? 'Recado salvo: todos veem no evento.' : 'Recado retirado.' };
    }
    if (!['encerrar', 'reabrir', 'reiniciar'].includes(acao)) throw new HttpError(400, 'Ação inválida.');
    const [pessoas, atual] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('gira_obter', { data })]);
    if (acao === 'reiniciar') {
      if (atual?.encerrada) throw new HttpError(409, 'A gira está encerrada. Reabra antes de reiniciar.');
      await db.rpc('gira_excluir', { data });
      // Volta com a próxima turma da limpeza do rodízio (como uma gira nova).
      const turma = proximaTurma(pessoas, await db.rpc('giras_listar'), data);
      const gira = await db.rpc('gira_salvar', { data, usuario: perfil.id, ...(turma ? { limpeza: turma } : {}) });
      return { gira, mensagem: `Gira reiniciada: todos voltaram para Pendente.${turma ? ` Turma da limpeza: Turma ${turma}.` : ''}` };
    }
    if (acao === 'reabrir') {
      if (!atual?.encerrada) return { gira: atual || giraVazia(data), mensagem: 'A gira já estava aberta.' };
      const { patch, mensagem } = reabrir(pessoas, atual);
      return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
    }
    if (atual?.encerrada) return { gira: atual, mensagem: 'A gira já estava encerrada.' };
    // Só encerra depois de confirmar a presença de todos (ninguém pendente).
    const pend = pendentesDaGira(pessoas, atual || giraVazia(data));
    if (pend.length) throw new HttpError(409, `Confirme a presença antes de encerrar: ${pend.length} pendente${pend.length > 1 ? 's' : ''} (${pend.slice(0, 5).map((p) => p.nome).join(', ')}${pend.length > 5 ? '…' : ''}).`);
    const { patch, mensagem } = encerrar(pessoas, atual || giraVazia(data));
    if (atual?.evento) {
      const total = validarParticipantes(participantes);
      return { gira: await db.tx([
        { funcao: 'gira_salvar', p: { data, usuario: perfil.id, ...patch } },
        { funcao: 'gira_participantes', p: { data, usuario: perfil.id, participantes: total } },
      ]), mensagem };
    }
    // Quantas pessoas foram atendidas na gira.
    if (!atendimentos || typeof atendimentos !== 'object') throw new HttpError(400, 'Informe quantas pessoas foram atendidas (preferencial, normal e passe).');
    patch.atendimentos = validarAtendimentos(atendimentos);
    return { gira: await db.rpc('gira_salvar', { data, usuario: perfil.id, ...patch }), mensagem };
  },
  DELETE: async (req) => {
    await exigir(req, 'giras:excluir');
    return db.rpc('gira_excluir', { data: validarData(req.query.data) });
  },
});
