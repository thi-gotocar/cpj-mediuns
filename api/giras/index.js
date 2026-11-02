// GET  /api/giras — todas as giras (com presença e duplas), da mais recente para a mais antiga.
//      O frontend usa a lista para o histórico, os selos de rodízio e a tabela "quem já cambonou quem".
// GET  /api/giras?lista=eventos — eventos da casa (todos veem; a aba Gira mostra os da semana)
// POST /api/giras  { acao: 'evento', id?, data: 'AAAA-MM-DD', nome, tipo: 'gira'|'amaci'|'aviso'|'evento' } · { acao: 'excluirEvento', id }  → eventos
// GET  /api/giras?lista=videos — vídeos do YouTube das giras (aba Vídeos), do mais recente ao mais antigo
// POST /api/giras  { acao: 'video', id?, data, evento, youtube: link ou código, classes: [..] } · { acao: 'excluirVideo', id }  → vídeos
// GET  /api/giras?lista=fotos — álbuns e fotos (aba Fotos), com links assinados do R2  → { albuns, fotos, usado, limite, configurado }
// POST /api/giras  { acao: 'fotoAlbum', id?, data, nome }  → { ...fotos, albumId } (com id = editar: só admin)
//                  { acao: 'fotoEnviar', albumId, foto, miniatura (JPEG em base64), largura, altura }  → { ok }
//                  { acao: 'fotoExcluir', id } (a própria foto, ou qualquer uma para admin) · { acao: 'fotoExcluirAlbum', id } (admin)  → fotos
import { randomUUID } from 'node:crypto';
import { rota, corpo, validarData, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { r2 } from '../_lib/r2.js';
import { TIPO_EVENTO_KEYS } from '../../shared/eventos.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { idDoYoutube, CLASSES_VIDEO_TODAS } from '../../shared/videos.js';
import { FOTOS_ATIVA, FOTO_MAX_BYTES, MINI_MAX_BYTES, FOTOS_LIMITE_BYTES } from '../../shared/fotos.js';
import { pode } from '../../shared/permissoes.js';

function acaoVideo(b) {
  if (b.acao === 'excluirVideo') return db.rpc('video_excluir', { id: validarId(b.id, 'Vídeo') });
  const evento = String(b.evento ?? '').replace(/\s+/g, ' ').trim();
  if (!evento || evento.length > 120) throw new HttpError(400, 'Informe o evento da gira (até 120 letras).');
  const youtube = idDoYoutube(b.youtube);
  if (!youtube) throw new HttpError(400, 'Link do YouTube inválido.');
  const classes = Array.isArray(b.classes) ? [...new Set(b.classes)] : [];
  if (classes.some((c) => !CLASSES_VIDEO_TODAS.includes(c))) throw new HttpError(400, 'Classificação inválida.');
  return db.rpc('video_salvar', { id: b.id ? validarId(b.id, 'Vídeo') : '', data: validarData(String(b.data || '')), evento, youtube, classes });
}

// ---------- fotos ----------
const ACOES_FOTOS = ['fotoAlbum', 'fotoEnviar', 'fotoExcluir', 'fotoExcluirAlbum'];
// Dono da foto: a pessoa da corrente (a mesma pelo acesso da corrente ou pelo e-mail) ou o usuário sem cadastro.
const autorDe = (eu) => (eu.pessoaId ? 'p:' + eu.pessoaId : 'u:' + eu.id);

const exigirFotosAtiva = () => { if (!FOTOS_ATIVA) throw new HttpError(404, 'A aba Fotos ainda não está ligada.'); };

async function fotosEstado(eu) {
  const E = await db.rpc('fotos_estado');
  const configurado = r2.configurado();
  const admin = pode(eu, 'fotos:editar');
  const autor = autorDe(eu);
  const fotos = E.fotos.map(({ chave, autor: a, ...f }) => ({ ...f, apagar: admin || a === autor,
    ...(configurado ? { url: r2.url(chave + '.jpg'), mini: r2.url(chave + '-p.jpg') } : {}) }));
  return { albuns: E.albuns, fotos, usado: E.usado, limite: FOTOS_LIMITE_BYTES, configurado };
}

function jpeg(b64, max, oque) {
  if (typeof b64 !== 'string' || b64.length > Math.ceil(max / 3) * 4) throw new HttpError(400, oque + ' grande demais.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, oque + ' inválida (envie JPEG).');
  return buf;
}
const lado = (v) => (Number.isInteger(v) && v > 0 && v <= 10000 ? v : 0);

// Apaga no R2 a foto e a miniatura. Se falhar, só sobra o arquivo (a foto já saiu do app).
async function apagarArquivos(chaves) {
  for (const c of chaves || []) {
    for (const arq of [c + '.jpg', c + '-p.jpg']) {
      try { await r2.apagar(arq); } catch (e) { console.error('[fotos] não apagou', arq, e.message); }
    }
  }
}

async function acaoFoto(eu, b) {
  const admin = pode(eu, 'fotos:editar');
  // O acesso da corrente sem senha só vê as fotos.
  const podeEnviar = eu.papel !== 'corrente' || !!eu.temSenha;
  if (b.acao === 'fotoAlbum') {
    if (b.id ? !admin : !podeEnviar) throw new HttpError(403, b.id ? 'Só o admin edita álbuns.' : 'Crie uma senha para enviar fotos.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do álbum (até 120 letras).');
    const { id } = await db.rpc('foto_album_salvar', { id: b.id ? validarId(b.id, 'Álbum') : '', data: validarData(String(b.data || '')), nome });
    return { ...(await fotosEstado(eu)), albumId: id };
  }
  if (b.acao === 'fotoExcluirAlbum') {
    if (!admin) throw new HttpError(403, 'Só o admin exclui álbuns.');
    await apagarArquivos(await db.rpc('foto_album_excluir', { id: validarId(b.id, 'Álbum') }));
    return fotosEstado(eu);
  }
  if (b.acao === 'fotoExcluir') {
    await apagarArquivos([await db.rpc('foto_excluir', { id: validarId(b.id, 'Foto'), autor: autorDe(eu), admin })]);
    return fotosEstado(eu);
  }
  // fotoEnviar: grava no R2 e depois no banco (se o banco falhar, apaga do R2).
  if (!podeEnviar) throw new HttpError(403, 'Crie uma senha para enviar fotos.');
  const albumId = validarId(b.albumId, 'Álbum');
  const foto = jpeg(b.foto, FOTO_MAX_BYTES, 'Foto');
  const mini = jpeg(b.miniatura, MINI_MAX_BYTES, 'Miniatura');
  const tamanho = foto.length + mini.length;
  const { usado } = await db.rpc('fotos_estado');
  if (usado + tamanho > FOTOS_LIMITE_BYTES) throw new HttpError(400, 'O espaço gratuito das fotos acabou. Fale com o admin.');
  const chave = `fotos/${albumId}/${randomUUID()}`;
  await r2.enviar(chave + '.jpg', foto, 'image/jpeg');
  await r2.enviar(chave + '-p.jpg', mini, 'image/jpeg');
  try {
    await db.rpc('foto_salvar', { albumId, chave, autor: autorDe(eu), autorNome: eu.nome || '', tamanho, largura: lado(b.largura), altura: lado(b.altura) });
  } catch (e) {
    await apagarArquivos([chave]);
    throw e;
  }
  return { ok: true };
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'eventos') {
      await exigir(req);
      return db.rpc('eventos_listar');
    }
    if (req.query.lista === 'videos') {
      await exigir(req, 'videos:ver');
      return db.rpc('videos_listar');
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
    if (b.acao === 'video' || b.acao === 'excluirVideo') {
      await exigir(req, 'videos:editar');
      return acaoVideo(b);
    }
    if (ACOES_FOTOS.includes(b.acao)) {
      exigirFotosAtiva();
      return acaoFoto(await exigir(req, 'fotos:ver'), b);
    }
    await exigir(req, 'eventos:editar');
    if (b.acao === 'excluirEvento') return db.rpc('evento_excluir', { id: validarId(b.id, 'Evento') });
    if (b.acao !== 'evento') throw new HttpError(400, 'Ação inválida.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 120) throw new HttpError(400, 'Informe o nome do evento (até 120 letras).');
    if (!TIPO_EVENTO_KEYS.includes(b.tipo)) throw new HttpError(400, 'Escolha o tipo (gira, amaci, aviso ou evento).');
    return db.rpc('evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : '', data: validarData(String(b.data || '')), nome, tipo: b.tipo });
  },
});
