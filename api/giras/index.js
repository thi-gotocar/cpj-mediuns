// GET  /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
//      O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
// GET  /api/giras?lista=eventos — eventos da casa (todos veem; a aba Gira mostra os da semana)
// POST /api/giras  { acao: 'evento', id?, data: 'AAAA-MM-DD', nome, tipo: 'gira'|'amaci'|'aviso'|'evento' } · { acao: 'excluirEvento', id }  → eventos (só o admin root)
// GET  /api/giras?lista=videos — vídeos do YouTube das giras (aba Vídeos), do mais recente ao mais antigo
//      (quem não tem a aba no perfil só vê com a aba publicada)
// POST /api/giras  { acao: 'video', id?, data, evento, youtube: link ou código, classes: [..] } · { acao: 'excluirVideo', id }  → vídeos
//                  { acao: 'videosPublicar', publicada: true|false }  → { publicada }
// GET  /api/giras?lista=ausencias — ausências antecipadas (datas de hoje em diante ainda sem gira; admin)  → [{ data, pessoaId }]
// POST /api/giras  { acao: 'ausenciaPrevia', data, pessoaId, ausente: true|false } (admin)  → ausências antecipadas
// GET  /api/giras?lista=oracoes — orações dos últimos 7 dias (todos logados)  → [{ id, texto, criadoEm, expiraEm, apagar, reacoes, reagi }]
// POST /api/giras  { acao: 'oracao', texto } (qualquer um logado) · { acao: 'excluirOracao', id } (quem pediu ou admin)
//                  { acao: 'reagirOracao', id } (qualquer um logado; liga/desliga a 🕯️)  → orações
// GET  /api/giras?lista=fotos — álbuns e fotos (aba Fotos), com links assinados do R2  → { albuns, fotos, usado, limite, configurado }
// POST /api/giras  { acao: 'fotoAlbum', id?, data, nome }  → { ...fotos, albumId } (com id = editar: só admin)
//                  { acao: 'fotoEnviar', albumId, foto, miniatura (JPEG em base64), largura, altura }  → { ok }
//                  { acao: 'fotoExcluir', id } (a própria foto, ou qualquer uma para admin) · { acao: 'fotoExcluirAlbum', id } (admin)  → fotos
import { rota, corpo, validarData, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { TIPO_EVENTO_KEYS } from '../../shared/eventos.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { acaoVideo } from '../_lib/videos.js';
import { ACOES_ORACOES, oracoes, acaoOracao } from '../_lib/oracoes.js';
import { ACOES_FOTOS, exigirFotosAtiva, fotosEstado, acaoFoto } from '../_lib/fotos.js';
import { pode } from '../../shared/permissoes.js';
import { OPCOES_GIRA, LINHA_LABEL } from '../../shared/regras.js';

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
    if (!linhas.has(linha) || !LINHA_LABEL[linha]) throw new HttpError(400, 'Escolha uma linha válida para cada nome.');
    if (nomes.has(chave) || usados.has(chave)) throw new HttpError(400, 'Os nomes alternativos não podem repetir entidades existentes ou entre si.');
    usados.add(chave);
    return { nome, linha };
  });
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'entidades') {
      await exigir(req, 'giras:ler');
      return db.rpc('entidades_apelidos_listar');
    }
    if (req.query.lista === 'eventos') {
      const eu = await exigir(req);
      const eventos = await db.rpc('eventos_listar');
      return eu.grupo === 'curimba' ? eventos.filter((x) => x.tipo !== 'aviso') : eventos;
    }
    if (req.query.lista === 'videos') {
      const eu = await exigir(req);
      if (!pode(eu, 'videos:ver') && !(await db.rpc('videos_publicada'))) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
      return db.rpc('videos_listar');
    }
    if (req.query.lista === 'oracoes') {
      const eu = await exigir(req);
      if (eu.grupo) throw new HttpError(403, 'Este acesso não tem permissão para ver as orações.');
      return oracoes(eu);
    }
    if (req.query.lista === 'ausencias') {
      await exigir(req, 'giras:editar');
      return db.rpc('ausencias_previas_listar');
    }
    if (req.query.lista === 'fotos') {
      exigirFotosAtiva();
      return fotosEstado(await exigir(req, 'fotos:ver'));
    }
    const eu = await exigir(req, 'giras:ler');
    return ocultarSorteios(eu, await db.rpc('giras_listar'));
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'entidadesApelidos') {
      await exigir(req, 'usuarios:gerenciar');
      return db.rpc('entidades_apelidos_salvar', { apelidos: validarApelidos(b.apelidos) });
    }
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
      const eu = await exigir(req);
      if (eu.grupo) throw new HttpError(403, 'Este acesso não tem permissão para alterar as orações.');
      return acaoOracao(eu, b);
    }
    if (ACOES_FOTOS.includes(b.acao)) {
      exigirFotosAtiva();
      return acaoFoto(await exigir(req, 'fotos:ver'), b);
    }
    // Eventos da casa: só o admin root cadastra, edita e exclui (aba Admin root).
    await exigir(req, 'usuarios:gerenciar');
    if (b.acao === 'excluirEvento') return db.rpc('evento_excluir', { id: validarId(b.id, 'Evento') });
    if (b.acao !== 'evento') throw new HttpError(400, 'Ação inválida.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do evento (até 120 letras).');
    if (!TIPO_EVENTO_KEYS.includes(b.tipo)) throw new HttpError(400, 'Escolha o tipo (gira, amaci, aviso ou evento).');
    return db.rpc('evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : '', data: validarData(String(b.data || '')), nome, tipo: b.tipo });
  },
});
