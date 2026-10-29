// Login e instalação.
//   GET  /api/auth/estado   { instalado }  — o app já tem um admin?
//   POST /api/auth/instalar { codigo, nome, email, senha }  — cria o primeiro admin
//   POST /api/auth/entrar   { email, senha }  → { token, usuario }
//   POST /api/auth/senha    { atual, nova }   → { token }  (logado)

import { rota, corpo, HttpError } from '../_lib/http.js';
import { db } from '../_lib/db.js';
import { exigir } from '../_lib/sessao.js';
import { gerarHash, conferirSenha, emitirToken, iguaisSeguro, SENHA_MINIMA } from '../_lib/senhas.js';
import { PERMISSOES } from '../../shared/permissoes.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publico(u) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, permissoes: PERMISSOES[u.papel] || [] };
}

function validarNovaSenha(s) {
  if (typeof s !== 'string' || s.length < SENHA_MINIMA) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (s.length > 200) throw new HttpError(400, 'Senha longa demais.');
}

const acoes = {
  async estado(req) {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    return db.rpc('sistema_estado');
  },

  async instalar(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const codigoCerto = process.env.CODIGO_INSTALACAO;
    if (!codigoCerto) throw new HttpError(503, 'Falta a variável CODIGO_INSTALACAO na Vercel (Settings > Environment Variables). Cadastre e faça um Redeploy.');
    const b = corpo(req);
    if (!iguaisSeguro(String(b.codigo || '').trim(), codigoCerto.trim())) throw new HttpError(403, 'Código de instalação incorreto.');
    const nome = String(b.nome || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o seu nome.');
    if (!EMAIL.test(email)) throw new HttpError(400, 'E-mail inválido.');
    validarNovaSenha(b.senha);
    const usuario = await db.rpc('usuario_criar_primeiro', { nome, email, senhaHash: await gerarHash(b.senha) });
    return { token: await emitirToken(usuario), usuario: publico(usuario) };
  },

  async entrar(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const b = corpo(req);
    const email = String(b.email || '').trim().toLowerCase();
    const senha = String(b.senha || '');
    if (!email || !senha) throw new HttpError(400, 'Informe e-mail e senha.');
    const info = await db.rpc('usuario_para_login', { email });
    if (info.bloqueadoAte) throw new HttpError(429, 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.');
    const ok = await conferirSenha(senha, info.senhaHash);
    if (!ok || !info.usuario) {
      await db.rpc('login_falha', { email });
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    await db.rpc('login_ok', { email });
    return { token: await emitirToken(info.usuario), usuario: publico(info.usuario) };
  },

  async senha(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const eu = await exigir(req);
    const b = corpo(req);
    const info = await db.rpc('usuario_para_login', { email: eu.email });
    if (!(await conferirSenha(String(b.atual || ''), info.senhaHash))) throw new HttpError(400, 'A senha atual está incorreta.');
    validarNovaSenha(b.nova);
    const usuario = await db.rpc('usuario_atualizar', { id: eu.id, senhaHash: await gerarHash(b.nova) });
    return { token: await emitirToken(usuario) };
  },
};

export default rota({
  GET: (req) => despachar(req),
  POST: (req) => despachar(req),
});

function despachar(req) {
  const fn = Object.prototype.hasOwnProperty.call(acoes, req.query.acao) ? acoes[req.query.acao] : null;
  if (!fn) throw new HttpError(404, 'Rota não encontrada.');
  return fn(req);
}
