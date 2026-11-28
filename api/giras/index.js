// GET  /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
// GET  /api/giras?lista=amaciVou&evento=id · POST { acao: 'amaciVou', eventoId, vou: true | false | null } — quem da corrente vai ao amaci → { pessoas, nao, eu, resposta, podeMarcar }
// GET  /api/giras?lista=tarefas&data=AAAA-MM-DD · POST { acao: 'tarefas', op, data, ... } — Tarefas da corrente (api/_lib/tarefas.js)
//      → [{ id, nome, tarefas: [{ id, descricao, responsavelId, responsavel, feito, por }] }]
// GET  /api/giras?lista=filaGeral · POST { acao: 'filaGeral', ativa } — bloco da fila na aba Geral visível para todos (só o root) → { ativa }
//      O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
// GET  /api/giras?lista=eventos — eventos da casa (a corrente vê todos; alunos, gira, evento e os tipos da sua turma)
// POST /api/giras  { acao: 'evento', id?, data: 'AAAA-MM-DD', nome, tipo: chave do tipo, retroativo? } · { acao: 'excluirEvento', id }  → eventos (só o admin root)
//                  retroativo (só ao criar, data até hoje): amaci que já passou cadastrado na aba Amaci — o aluno marca a presença sem localização
// GET  /api/giras?lista=eventosTipos — tipos de evento (só o root)  → { tipos: [{ chave, nome, turmas }], turmas: [{ id, nome }], eventos }
// POST /api/giras  { acao: 'eventoTipo', chave?, nome, turmas: [id..] } (só o root; sem chave cria)  → o mesmo de ?lista=eventosTipos
//                  { acao: 'excluirEventoTipo', chave } (só o root; não os quatro de sempre, nem tipo com eventos)  → idem
// GET  /api/giras?lista=videos — vídeos do YouTube das giras (aba Vídeos), do mais recente ao mais antigo
//      (quem não tem a aba no perfil só vê com a aba publicada)
// POST /api/giras  { acao: 'video', id?, data, evento, youtube: link ou código, classes: [..] } · { acao: 'excluirVideo', id }  → vídeos
//                  { acao: 'videosPublicar', publicada: true|false }  → { publicada }
// GET  /api/giras?lista=ausencias — ausências antecipadas (datas de hoje em diante ainda sem gira; admin)  → [{ data, pessoaId }]
// POST /api/giras  { acao: 'ausenciaPrevia', data, pessoaId, ausente: true|false } (admin)  → ausências antecipadas
// GET  /api/giras?lista=oracoes — orações (até 4 dias; toda sexta recomeça) — todos logados; aluno só as próprias  → [{ id, texto, criadoEm, expiraEm, apagar, reacoes, reagi }]
// POST /api/giras  { acao: 'oracao', texto } (qualquer um logado) · { acao: 'excluirOracao', id } (quem pediu ou admin)
//                  { acao: 'reagirOracao', id } (qualquer um logado; liga/desliga a 🕯️)  → orações
// GET  /api/giras?lista=conduta — Gestão de Conduta e Risco: o root vê todos os relatos; os outros, só os próprios (e nada com o bloco desligado)
// POST /api/giras  { acao: 'conduta', id?, texto, anonimo? } (qualquer um logado, com o bloco ligado; editar só o próprio e antes de lido; anonimo grava sem autor)
//                  { acao: 'condutaLer', id } · { acao: 'condutaResponder', id, resposta, publicar? } · { acao: 'condutaAtivar', ativa } · { acao: 'condutaExcluir', id } (só o root)
//                  { acao: 'condutaCancelar', id } (quem abriu, antes de lido: apaga o relato)
// GET  /api/giras?lista=atrasos[&atualizar=1] — pagamentos em atraso da conta B do ASAAS: cada um os seus, o root todos (api/_lib/atrasos.js)
//                  → { ativa, relatos }
// GET  /api/giras?lista=transparencia&mes=AAAA-MM[&atualizar=1] · POST { acao: 'transparencia', op, ... } — Painel da Transparência (api/_lib/transparencia.js)
// GET  /api/giras?lista=fotos — álbuns e fotos (aba Fotos), com links assinados do R2  → { albuns, fotos, usado, limite, configurado }
// POST /api/giras  { acao: 'fotoAlbum', id?, data, nome }  → { ...fotos, albumId } (com id = editar: só admin)
//                  { acao: 'fotoEnviar', albumId, foto, miniatura (JPEG em base64), largura, altura }  → { ok }
//                  { acao: 'fotoExcluir', id } (a própria foto, ou qualquer uma para admin) · { acao: 'fotoExcluirAlbum', id } (admin)  → fotos
// POST /api/giras  { acao: 'recadoCorrente', recado }  recado para a corrente, o mesmo em todos os dias (quem edita a Gira) → config da casa
// POST /api/giras  { acao: 'diaGira', dia: 0 a 6 }  dia da semana das giras (quem edita a Gira) → config da casa
// POST /api/giras  { acao: 'importar', pessoas, giras }  restaurar backup (dados:importar; api/_lib/importar.js) → { pessoasCriadas, pessoasNoArquivo, giras }
//                  (o app anterior chama POST /api/importar: o vercel.json reescreve para ?acao=importar)
import { rota, corpo, validarData, validarId, HttpError, hojeBR } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { acaoVideo } from '../_lib/videos.js';
import { ACOES_ORACOES, oracoes, acaoOracao } from '../_lib/oracoes.js';
import { ACOES_CONDUTA, condutas, acaoConduta } from '../_lib/conduta.js';
import { atrasos } from '../_lib/atrasos.js';
import { transparencia, acaoTransparencia } from '../_lib/transparencia.js';
import { eventosDe } from '../_lib/eventos.js';
import { ACOES_FOTOS, exigirFotosAtiva, fotosEstado, acaoFoto } from '../_lib/fotos.js';
import { importar } from '../_lib/importar.js';
import { tarefas, acaoTarefas } from '../_lib/tarefas.js';
import { pode } from '../../shared/permissoes.js';
import { OPCOES_GIRA, LINHA_LABEL, LINHAS_ESCOLHA, linhaDaEntidade, giraEspecial, compactarRetratos } from '../../shared/regras.js';

const normalizarNome = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

function validarApelidos(lista) {
  if (!Array.isArray(lista) || lista.length > 100) throw new HttpError(400, 'Lista de entidades inválida.');
  const linhas = new Set(OPCOES_GIRA.flatMap((g) => g.itens.map(([chave]) => chave)));
  const nomes = new Set(OPCOES_GIRA.flatMap((g) => g.itens.map(([, nome]) => nome)).map(normalizarNome));
  const usados = new Set();
  return lista.map((x) => {
    const nome = String(x?.nome ?? '').replace(/\s+/g, ' ').trim();
    const linha = String(x?.linha ?? '');
    const chave = normalizarNome(nome);
    if (!nome || nome.length > 80) throw new HttpError(400, 'Cada nome de entidade deve ter de 1 a 80 caracteres.');
    // Sem linha = entidade nova (a gira guarda o próprio nome); o nome não pode ser lido como uma linha ou gira especial.
    if (linha && (!linhas.has(linha) || !LINHA_LABEL[linha])) throw new HttpError(400, 'Escolha uma linha válida para cada nome.');
    if (!linha && (linhaDaEntidade(nome) || giraEspecial(nome))) throw new HttpError(400, `"${nome}" já é o nome de uma gira existente: escolha a linha correspondente.`);
    if (nomes.has(chave) || usados.has(chave)) throw new HttpError(400, 'Os nomes alternativos não podem repetir entidades existentes ou entre si.');
    usados.add(chave);
    const atende = x?.atende ?? [];
    if (!Array.isArray(atende) || atende.some((k) => !LINHAS_ESCOLHA.some(([l]) => l === k))) throw new HttpError(400, 'Escolha linhas válidas para a corrente atender.');
    const escolha = LINHAS_ESCOLHA.map(([l]) => l).filter((l) => atende.includes(l));
    return escolha.length ? { nome, linha, atende: escolha } : { nome, linha };
  });
}

// Vou ao amaci: quem vai, quem não vai e a resposta de quem pediu (null = ainda não respondeu).
function respostasAmaci(lista, pessoaId) {
  const so = (vou) => lista.filter((x) => x.vou === vou).map(({ pessoaId: id, nome }) => ({ pessoaId: id, nome }));
  const minha = pessoaId ? lista.find((x) => x.pessoaId === pessoaId) : null;
  return { pessoas: so(true), nao: so(false), eu: !!minha?.vou, resposta: minha ? (minha.vou ? 'vou' : 'nao') : null, podeMarcar: !!pessoaId };
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'entidades') {
      await exigir(req, 'giras:ler');
      return db.rpc('entidades_apelidos_listar');
    }
    if (req.query.lista === 'eventos') {
      const eu = await exigir(req);
      return eventosDe(eu);
    }
    if (req.query.lista === 'eventosTipos') {
      await exigir(req, 'usuarios:gerenciar');
      return db.rpc('eventos_tipos_estado');
    }
    if (req.query.lista === 'videos') {
      const eu = await exigir(req);
      if (!pode(eu, 'videos:ver') && !(await db.rpc('videos_publicada'))) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
      return db.rpc('videos_listar');
    }
    if (req.query.lista === 'oracoes') {
      return oracoes(await exigir(req));
    }
    if (req.query.lista === 'conduta') {
      const eu = await exigir(req);
      if (eu.grupo) throw new HttpError(403, 'Este acesso não tem permissão para ver os relatos.');
      return condutas(eu);
    }
    // Amaci: quem da corrente vai (aviso, não é a presença dos alunos). Todos da corrente veem a lista.
    if (req.query.lista === 'amaciVou') {
      const eu = await exigir(req, 'giras:ler');
      return respostasAmaci(await db.rpc('amaci_vou_listar', { eventoId: validarId(req.query.evento, 'Amaci') }), eu.pessoaId);
    }
    if (req.query.lista === 'tarefas') {
      await exigir(req, 'giras:ler');
      return tarefas(req.query);
    }
    // Bloco da fila na aba Geral: o interruptor "Visível para todos" (só o root lê e liga; o bloco lê pela rota da fila).
    if (req.query.lista === 'filaGeral') {
      await exigir(req, 'usuarios:gerenciar');
      return { ativa: await db.rpc('fila_bloco_geral') };
    }
    if (req.query.lista === 'atrasos') return atrasos(await exigir(req), req.query.atualizar === '1');
    if (req.query.lista === 'transparencia') return transparencia(await exigir(req), req.query);
    if (req.query.lista === 'ausencias') {
      await exigir(req, 'giras:editar');
      return db.rpc('ausencias_previas_listar');
    }
    if (req.query.lista === 'fotos') {
      exigirFotosAtiva();
      return fotosEstado(await exigir(req, 'fotos:ver'));
    }
    const eu = await exigir(req, 'giras:ler');
    // Retrato das encerradas só com o que difere do cadastro (a lista inteira vai para o app).
    const [pessoas, giras] = await Promise.all([db.rpc('pessoas_listar', { todas: true }), db.rpc('giras_listar')]);
    return ocultarSorteios(eu, compactarRetratos(pessoas, giras));
  },
  POST: async (req) => {
    const b = corpo(req);
    // Restaurar backup (api/_lib/importar.js). O app anterior chama /api/importar, reescrito para ?acao=importar.
    if (b.acao === 'importar' || req.query.acao === 'importar') return importar(req, b);
    if (b.acao === 'entidadesApelidos') {
      await exigir(req, 'usuarios:gerenciar');
      return db.rpc('entidades_apelidos_salvar', { apelidos: validarApelidos(b.apelidos) });
    }
    if (b.acao === 'amaciVou') {
      const eu = await exigir(req, 'giras:ler');
      if (!eu.pessoaId) throw new HttpError(403, 'Só quem é da corrente marca que vai ao amaci.');
      if (typeof b.vou !== 'boolean' && b.vou !== null) throw new HttpError(400, 'Informe se você vai.');
      return respostasAmaci(await db.rpc('amaci_vou_marcar', { eventoId: validarId(b.eventoId, 'Amaci'), pessoaId: eu.pessoaId, vou: b.vou }), eu.pessoaId);
    }
    if (b.acao === 'tarefas') return acaoTarefas(await exigir(req, 'giras:ler'), b);
    // Recado para a corrente (topo da aba Gira, todos os dias): até 5 linhas e 300 letras; '' tira → a config da casa.
    if (b.acao === 'recadoCorrente') {
      await exigir(req, 'giras:editar');
      const recado = String(b.recado ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).join('\n').trim();
      if (recado.split('\n').length > 5) throw new HttpError(400, 'O recado pode ter até 5 linhas.');
      if (recado.length > 300) throw new HttpError(400, 'O recado pode ter até 300 letras.');
      return db.rpc('recado_corrente_salvar', { recado });
    }
    // Bloco Admin da aba Gira: o dia da semana das giras (0 a 6) → a config da casa (shared/config.js diaGira).
    if (b.acao === 'diaGira') {
      await exigir(req, 'giras:editar');
      const dia = Number(b.dia);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw new HttpError(400, 'Dia da semana inválido.');
      return db.rpc('dia_gira_salvar', { dia: String(dia) });
    }
    if (b.acao === 'filaGeral') {
      await exigir(req, 'usuarios:gerenciar');
      if (typeof b.ativa !== 'boolean') throw new HttpError(400, 'Informe se o bloco fica visível.');
      return { ativa: await db.rpc('fila_bloco_geral_ativar', { ativa: b.ativa }) };
    }
    if (b.acao === 'transparencia') return acaoTransparencia(await exigir(req), b, req.query);
    if (b.acao === 'video' || b.acao === 'excluirVideo') {
      await exigir(req, 'videos:editar');
      return acaoVideo(b);
    }
    if (b.acao === 'videosPublicar') {
      await exigir(req, 'videos:editar');
      if (typeof b.publicada !== 'boolean') throw new HttpError(400, 'Informe se a aba fica publicada.');
      return { publicada: await db.rpc('videos_publicar', { publicada: b.publicada }) };
    }
    if (b.acao === 'ausenciaPrevia') {
      await exigir(req, 'giras:editar');
      const data = validarData(String(b.data || ''));
      if (data < new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })) throw new HttpError(400, 'Ausência antecipada só para hoje em diante.');
      if (await db.rpc('gira_obter', { data })) throw new HttpError(409, 'A gira desta data já foi criada: marque a ausência na Presença.');
      return db.rpc('ausencia_previa_salvar', { data, pessoaId: validarId(b.pessoaId, 'Pessoa'), ausente: b.ausente !== false });
    }
    if (ACOES_ORACOES.includes(b.acao)) {
      return acaoOracao(await exigir(req), b);
    }
    if (ACOES_CONDUTA.includes(b.acao)) {
      const eu = await exigir(req);
      if (eu.grupo) throw new HttpError(403, 'Este acesso não tem permissão para abrir relatos.');
      return acaoConduta(eu, b);
    }
    if (ACOES_FOTOS.includes(b.acao)) {
      exigirFotosAtiva();
      return acaoFoto(await exigir(req, 'fotos:ver'), b);
    }
    // Eventos da casa: só o admin root cadastra, edita e exclui (aba Admin root).
    await exigir(req, 'usuarios:gerenciar');
    if (b.acao === 'eventoTipo') {
      const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 40) throw new HttpError(400, 'Informe o nome do tipo (até 40 letras).');
      if (b.chave !== undefined && b.chave !== '' && !/^[a-z0-9]{1,20}$/.test(String(b.chave))) throw new HttpError(400, 'Tipo inválido.');
      const turmas = Array.isArray(b.turmas) ? b.turmas.map((t) => validarId(t, 'Turma')) : [];
      return db.rpc('evento_tipo_salvar', { chave: String(b.chave || ''), nome, turmas });
    }
    if (b.acao === 'excluirEventoTipo') {
      if (!/^[a-z0-9]{1,20}$/.test(String(b.chave ?? ''))) throw new HttpError(400, 'Tipo inválido.');
      return db.rpc('evento_tipo_excluir', { chave: b.chave });
    }
    if (b.acao === 'excluirEvento') return db.rpc('evento_excluir', { id: validarId(b.id, 'Evento') });
    if (b.acao !== 'evento') throw new HttpError(400, 'Ação inválida.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do evento (até 120 letras).');
    if (!/^[a-z0-9]{1,20}$/.test(String(b.tipo ?? ''))) throw new HttpError(400, 'Escolha o tipo do evento.');
    const data = validarData(String(b.data || ''));
    // retroativo: amaci que já passou cadastrado na aba Amaci (só ao criar; nele o aluno marca a presença sem localização).
    const retroativo = !b.id && b.retroativo === true;
    if (retroativo && data > hojeBR()) throw new HttpError(400, 'Amaci que já passou: a data não pode ser futura.');
    return db.rpc('evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : '', data, nome, tipo: b.tipo, retroativo });
  },
});
