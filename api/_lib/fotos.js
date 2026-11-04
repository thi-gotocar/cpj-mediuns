// Álbum de fotos (aba Fotos); os arquivos ficam no Cloudflare R2. Rotas em api/giras.
import { randomUUID } from 'node:crypto';
import { validarData, validarId, HttpError } from './http.js';
import { db } from './db.js';
import { r2 } from './r2.js';
import { autorDe } from './sessao.js';
import { FOTOS_ATIVA, FOTO_MAX_BYTES, MINI_MAX_BYTES, FOTOS_LIMITE_BYTES } from '../../shared/fotos.js';
import { pode } from '../../shared/permissoes.js';

export const ACOES_FOTOS = ['fotoAlbum', 'fotoEnviar', 'fotoExcluir', 'fotoExcluirAlbum'];

export const exigirFotosAtiva = () => { if (!FOTOS_ATIVA) throw new HttpError(404, 'A aba Fotos ainda não está ligada.'); };

export async function fotosEstado(eu) {
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

export async function acaoFoto(eu, b) {
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
