// Perfil, foto e Anamnese da pessoa (rotas /api/auth/perfil, /foto e /anamnese; a sessão vem de api/auth/[acao].js).

import { corpo, validarId, HttpError } from './http.js';
import { db } from './db.js';
import { pode } from '../../shared/permissoes.js';
import { normalizarPerfil, perfilDaFuncao, blocosAfinidade, ANAMNESE_TIPOS, ANAMNESE_PERGUNTA_MAX, ANAMNESE_TEXTO_MAX, ANAMNESE_SIMNAO, ANAMNESE_OPCOES_MAX, ANAMNESE_OPCAO_MAX, limparRespostaTexto, limparRespostaData } from '../../shared/perfil.js';
import { LINHA_KEYS } from '../../shared/regras.js';

// Aplica as informações do bloco Perfil; recusa data ou telefone inválidos.
function comInfo(perfil, funcao, info) {
  const p = normalizarPerfil(perfil);
  ['nome', 'nascimento', 'celular', 'email', 'contatoNome', 'contatoTelefone'].forEach((k) => { if (k in info) p.info[k] = info[k] || ''; });
  const novo = perfilDaFuncao(p, funcao);
  if (info.nascimento && !novo.info.nascimento) throw new HttpError(400, 'Data de nascimento inválida.');
  if (info.celular && !novo.info.celular) throw new HttpError(400, 'Celular incompleto: coloque o DDD e o número.');
  if (info.email && !novo.info.email) throw new HttpError(400, 'E-mail inválido.');
  if (info.contatoTelefone && !novo.info.contatoTelefone) throw new HttpError(400, 'Telefone para contato incompleto: coloque o DDD e o número.');
  return novo;
}

function validarFoto(foto) {
  if (!foto) return;
  const buf = typeof foto === 'string' && foto.length <= 200000 ? Buffer.from(foto, 'base64') : null;
  if (!buf || buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, 'Foto inválida (envie uma imagem JPEG pequena).');
}

// O aluno só acessa o próprio registro: o id vem da sessão, nunca do pedido.
const exigirSenhaAluno = (eu) => { if (!eu.temSenha) throw new HttpError(403, 'Crie a sua senha para abrir o Perfil.'); };
// Corrente (acesso cpj): Perfil e Anamnese só depois de criar a senha.
export const exigirSenhaCorrente = (eu) => { if (eu.papel === 'corrente' && !eu.temSenha) throw new HttpError(403, 'Crie a sua senha para abrir o Perfil.'); };

async function perfilAluno(req, eu) {
  exigirSenhaAluno(eu);
  const alunoId = eu.alunoId;
  const ver = (perfil) => ({ pessoaId: 'a:' + alunoId, nome: eu.nome, funcao: 'aluno', perfil: normalizarPerfil(perfil) });
  const atual = await db.rpc('aluno_perfil_ler', { alunoId });
  if (req.method === 'GET') return { eu: ver(atual) };
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const b = corpo(req);
  const perfil = b.info && typeof b.info === 'object'
    ? comInfo(atual, 'aluno', b.info)
    : normalizarPerfil({ ...normalizarPerfil(atual), orixas: b.perfil?.orixas, guias: b.perfil?.guias });
  return ver(await db.rpc('aluno_perfil_salvar', { alunoId, perfil }));
}

// Perfil da própria pessoa (todo mundo que está no cadastro da corrente).
// A curimba só tem as informações pessoais (sem orixás, guias e guias de atendimento).
export async function rotaPerfil(req, eu) {
  if (eu.grupo === 'alunos') return perfilAluno(req, eu);
  if (eu.grupo) throw new HttpError(403, 'Este acesso não tem perfil pessoal.');
  exigirSenhaCorrente(eu);
  const limpo = (r) => ({ ...r, perfil: perfilDaFuncao(r.perfil, r.funcao) });
  if (req.method === 'GET') {
    const r = { eu: eu.pessoaId ? limpo(await db.rpc('perfil_ler', { pessoaId: eu.pessoaId })) : null };
    // Admin: perfil completo. Corrente: só contato e guias para consulta.
    const todos = (await db.rpc('perfis_listar')).map(limpo);
    if (pode(eu, 'perfil:corrente')) r.todos = todos;
    if (pode(eu, 'perfil:ver')) r.contatos = todos.map((x) => ({
        pessoaId: x.pessoaId,
        nome: x.nome,
        contatoNome: x.perfil.info.contatoNome || '',
        contatoTelefone: x.perfil.info.contatoTelefone || '',
      }));
    r.guias = todos.filter((x) => x.perfil.guias.chefe.linha || x.perfil.guias.frente.linha)
      .map((x) => ({ pessoaId: x.pessoaId, nome: x.nome, chefe: x.perfil.guias.chefe.linha, frente: x.perfil.guias.frente.linha }));
    return r;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const b = corpo(req);
  // A própria pessoa marca as entidades com que tem afinidade (atendimento extra / passe).
  if (b.acao === 'afinidade') {
    if (!eu.pessoaId) throw new HttpError(400, 'Seu usuário não está ligado a uma pessoa da corrente.');
    const atual = await db.rpc('perfil_ler', { pessoaId: eu.pessoaId });
    const bloco = blocosAfinidade(atual.funcao).find((x) => x.tipo === b.tipo);
    if (!bloco) throw new HttpError(400, 'Este bloco não é da sua função.');
    if (!Array.isArray(b.linhas) || b.linhas.some((l) => !LINHA_KEYS.includes(l))) throw new HttpError(400, 'Entidade inválida.');
    return limpo(await db.rpc('afinidade_salvar', { pessoaId: eu.pessoaId, campo: bloco.campo, linhas: [...new Set(b.linhas)] }));
  }
  // Bloco Informações: muda só as informações (o resto do perfil fica igual), da própria pessoa ou, para o admin, de qualquer outra.
  if (b.pessoaId && (b.pessoaId !== eu.pessoaId || b.info)) {
    if (b.pessoaId !== eu.pessoaId && !pode(eu, 'perfil:corrente')) throw new HttpError(403, 'Só um admin altera o perfil de outra pessoa.');
    const atual = await db.rpc('perfil_ler', { pessoaId: validarId(b.pessoaId, 'Pessoa') });
    const novo = comInfo(atual.perfil, atual.funcao, b.info && typeof b.info === 'object' ? b.info : {});
    return limpo(await db.rpc('perfil_salvar', { pessoaId: atual.pessoaId, perfil: novo }));
  }
  if (!eu.pessoaId) throw new HttpError(400, 'Seu usuário não está ligado a uma pessoa da corrente.');
  const { funcao } = await db.rpc('perfil_ler', { pessoaId: eu.pessoaId });
  return limpo(await db.rpc('perfil_salvar', { pessoaId: eu.pessoaId, perfil: perfilDaFuncao(b.perfil, funcao) }));
}

// Foto da pessoa: todos que estão logados veem (a aba Gira mostra com quem cada um trabalha);
// trocar ou tirar, só a própria pessoa ou quem vê o perfil de todos (admin).
export async function rotaFoto(req, res, eu) {
  if (eu.grupo === 'alunos') {
    exigirSenhaAluno(eu);
    if (req.method === 'GET') return { foto: await db.rpc('aluno_foto_ler', { alunoId: eu.alunoId }) };
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const { foto } = corpo(req);
    validarFoto(foto);
    return { foto: await db.rpc('aluno_foto_salvar', { alunoId: eu.alunoId, foto: foto || '' }) };
  }
  if (eu.grupo) throw new HttpError(403, 'Este acesso não tem fotos de perfil.');
  const pessoaId = validarId(String((req.method === 'GET' ? req.query.pessoaId : corpo(req).pessoaId) || eu.pessoaId || ''), 'Pessoa');
  if (req.method === 'GET') {
    // Com ?v= (versão da foto, fotoV da lista de pessoas) o endereço muda quando a foto muda: o aparelho guarda a resposta
    // e não volta ao banco. private: só no aparelho, nunca no cache da Vercel.
    if (req.query.v) res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    return { foto: await db.rpc('pessoa_foto_ler', { pessoaId }) };
  }
  if (pessoaId !== eu.pessoaId && !pode(eu, 'perfil:corrente')) throw new HttpError(403, 'Só um admin mexe na foto de outra pessoa.');
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const { foto } = corpo(req);
  validarFoto(foto);
  return { foto: await db.rpc('pessoa_foto_salvar', { pessoaId, foto: foto || '' }) };
}

// Anamnese: o admin do perfil (perfil:corrente; o root também) cadastra as perguntas e lê as respostas de todos;
// cada pessoa da corrente responde as suas.
export async function rotaAnamnese(req, eu) {
  if (eu.grupo) throw new HttpError(403, 'Este acesso não tem Anamnese.');
  exigirSenhaCorrente(eu);
  const admin = pode(eu, 'perfil:corrente');
  const resposta = (E) => ({
    visivel: E.visivel !== false,
    perguntas: admin || E.visivel !== false ? E.perguntas : [],
    minhas: eu.pessoaId && (admin || E.visivel !== false)
      ? Object.fromEntries(E.respostas.filter((r) => r.pessoaId === eu.pessoaId).map((r) => [r.perguntaId, r.resposta]))
      : null,
    ...(admin ? { todas: E.respostas } : {}),
  });
  if (req.method === 'GET') return resposta(await db.rpc('anamnese_estado'));
  if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
  const b = corpo(req);
  if (b.acao === 'visibilidade') {
    if (!admin) throw new HttpError(403, 'Só o admin do perfil altera a visibilidade da Anamnese.');
    if (typeof b.visivel !== 'boolean') throw new HttpError(400, 'Informe se a Anamnese deve ficar visível.');
    return resposta(await db.rpc('anamnese_visibilidade', { visivel: b.visivel }));
  }
  if (b.acao === 'reordenar') {
    if (!admin) throw new HttpError(403, 'Só o admin do perfil reordena as perguntas.');
    if (!Array.isArray(b.ids) || b.ids.length > 500) throw new HttpError(400, 'Lista de perguntas inválida.');
    const ids = b.ids.map((id) => validarId(id, 'Pergunta'));
    return resposta(await db.rpc('anamnese_perguntas_reordenar', { ids }));
  }
  if (b.acao === 'pergunta' || b.acao === 'editarPergunta' || b.acao === 'excluirPergunta') {
    if (!admin) throw new HttpError(403, 'Só o admin do perfil mexe nas perguntas.');
    if (b.acao === 'excluirPergunta') return resposta(await db.rpc('anamnese_pergunta_excluir', { id: validarId(b.id, 'Pergunta') }));
    const texto = String(b.texto ?? '').replace(/\s+/g, ' ').trim();
    if (!texto || texto.length > ANAMNESE_PERGUNTA_MAX) throw new HttpError(400, `Escreva a pergunta numa linha (até ${ANAMNESE_PERGUNTA_MAX} letras).`);
    if (b.acao === 'editarPergunta') {
      return resposta(await db.rpc('anamnese_pergunta_editar', { id: validarId(b.id, 'Pergunta'), texto }));
    }
    if (!ANAMNESE_TIPOS.some(([k]) => k === b.tipo)) throw new HttpError(400, 'Escolha o tipo da resposta (texto ou sim/não).');
    return resposta(await db.rpc('anamnese_pergunta_salvar', { texto, tipo: b.tipo, opcoes: [], obrigatoria: true }));
  }
  if (b.acao !== 'responder') throw new HttpError(400, 'Ação inválida.');
  if (!eu.pessoaId) throw new HttpError(400, 'Seu usuário não está ligado a uma pessoa da corrente.');
  if (!b.respostas || typeof b.respostas !== 'object' || Array.isArray(b.respostas)) throw new HttpError(400, 'Respostas inválidas.');
  const E = await db.rpc('anamnese_estado');
  if (E.visivel === false && !admin) throw new HttpError(409, 'A Anamnese está temporariamente indisponível.');
  const { perguntas } = E;
  const respostas = {};
  for (const [id, v] of Object.entries(b.respostas)) {
    const q = perguntas.find((x) => x.id === id);
    if (!q) throw new HttpError(400, 'Pergunta não encontrada (a lista pode ter mudado: abra a aba de novo).');
    if (v === '' || (Array.isArray(v) && !v.length)) {
      respostas[id] = '';
    } else if (q.tipo === 'simnao') {
      if (v !== '' && !ANAMNESE_SIMNAO.some(([k]) => k === v)) throw new HttpError(400, `Responda sim ou não: ${q.texto}`);
      respostas[id] = v;
    } else if (q.tipo === 'data') {
      const data = limparRespostaData(v);
      if (!data) throw new HttpError(400, `Informe uma data válida: ${q.texto}`);
      respostas[id] = data;
    } else if (q.tipo === 'opcao') {
      if (typeof v !== 'string' || !Array.isArray(q.opcoes) || !q.opcoes.includes(v)) throw new HttpError(400, `Escolha uma opção válida: ${q.texto}`);
      respostas[id] = v;
    } else if (q.tipo === 'multipla') {
      if (!Array.isArray(q.opcoes) || q.opcoes.length > ANAMNESE_OPCOES_MAX
        || q.opcoes.some((x) => typeof x !== 'string' || x.length > ANAMNESE_OPCAO_MAX)
        || !Array.isArray(v) || v.length > ANAMNESE_OPCOES_MAX || v.some((x) => typeof x !== 'string' || !q.opcoes.includes(x))) {
        throw new HttpError(400, `Escolha opções válidas: ${q.texto}`);
      }
      respostas[id] = JSON.stringify([...new Set(v)]);
    } else {
      const t = limparRespostaTexto(v);
      if (t === null) throw new HttpError(400, `Resposta inválida (até ${ANAMNESE_TEXTO_MAX} caracteres e 20 linhas): ${q.texto}`);
      respostas[id] = t;
    }
  }
  return resposta(await db.rpc('anamnese_responder', { pessoaId: eu.pessoaId, respostas }));
}
