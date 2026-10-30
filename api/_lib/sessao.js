// Identifica quem está chamando e confere a permissão.

import { HttpError } from './http.js';
import { db } from './db.js';
import { lerToken } from './senhas.js';
import { pode } from '../../shared/permissoes.js';

export async function exigir(req, permissao) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Faça login.');

  const sessao = await lerToken(token);
  if (!sessao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');

  if (sessao.corrente) {
    // Sessões antigas (antes de ligar o acesso à pessoa cadastrada) precisam entrar de novo.
    if (!sessao.pessoaId) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
    const quem = { id: null, nome: sessao.nome, email: '', papel: 'corrente', pessoaId: sessao.pessoaId };
    if (permissao && !pode('corrente', permissao)) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
    return quem;
  }

  const usuario = await db.rpc('usuario_obter', { id: sessao.id });
  // Trocar a senha ou o perfil muda a versão e encerra as sessões antigas.
  if (!usuario || usuario.sessaoVersao !== sessao.versao) throw new HttpError(401, 'Sessão expirada. Entre de novo.');
  if (permissao && !pode(usuario.papel, permissao)) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  return usuario;
}
