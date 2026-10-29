// Identifica quem está chamando e confere a permissão.

import { HttpError } from './http.js';
import { auth, db } from './supabase.js';
import { pode } from '../../shared/permissoes.js';

export async function exigir(req, permissao) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Faça login.');

  const id = await auth.usuarioDoToken(token);
  if (!id) throw new HttpError(401, 'Sessão expirada. Entre de novo.');

  const perfil = await db.rpc('perfil_obter', { id });
  if (!perfil) throw new HttpError(403, 'Seu usuário ainda não tem perfil. Fale com um admin.');
  if (permissao && !pode(perfil.papel, permissao)) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  return perfil;
}
