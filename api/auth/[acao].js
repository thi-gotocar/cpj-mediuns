// Login e instalação.
//   GET  /api/auth/estado   { instalado }  — o app já tem um admin?
//   POST /api/auth/instalar { codigo, nome, email, senha }  — cria o primeiro admin
//   POST /api/auth/entrar   { email, senha }  → { token, usuario }
//                           acesso da corrente: a "senha" é o nome; precisa estar na lista de pessoas.
//                           Se não for exato → { confirmar: true, candidatos: [nomes parecidos] } (sem token)
//                           Se a pessoa tem senha (PIN): sem "pin" → { precisaSenha: true, nome }; com "pin" errado → 401
//   POST /api/auth/senha    { atual, nova }   → { token }  (logado)
//   POST /api/auth/criarSenha { senha }  acesso da corrente: cria a senha (4 a 8 números) → { token }
//   GET  /api/auth/me       quem sou eu e o que posso fazer (logado)
//   GET  /api/auth/inicio   a abertura do app em um pedido só → { me, pessoas, giras, eventos, minhaCurimba, oracoes, entidadesApelidos }
//                           ?atualizar=1 (voltar ao app): só as listas, sem "me". Alunos recebem { eventos }; curimba, { eventos, minhaCurimba }.
//   GET  /api/auth/perfil   → { eu: { pessoaId, nome, perfil } | null, todos?: [{ pessoaId, nome, funcao, perfil }] (admin) }
//   POST /api/auth/perfil   { perfil }  salva o meu perfil inteiro (curimba: só as informações pessoais)
//                           Aluno (depois de criar a senha): só os próprios dados, informações, orixás e guias.
//   GET  /api/auth/foto?pessoaId=…  → { foto: base64 JPEG | null }  (qualquer um logado: a aba Gira mostra a foto de com quem você trabalha)
//   POST /api/auth/foto     { pessoaId?, foto: base64 JPEG | null }  troca ou tira a foto (a própria, ou de qualquer um: admin)
//   GET  /api/auth/anamnese → { perguntas: [{ id, texto, tipo }], minhas: { perguntaId: resposta } | null, todas?: [{ pessoaId, perguntaId, resposta }] (admin do perfil) }
//   POST /api/auth/anamnese { acao: 'responder', respostas: { perguntaId: resposta } }  a própria pessoa
//                           { acao: 'pergunta', texto, tipo: 'texto'|'simnao' } · { acao: 'excluirPergunta', id }  (admin do perfil)  → como o GET

import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { db } from '../_lib/db.js';
import { exigir } from '../_lib/sessao.js';
import { abaIemanja } from '../_lib/iemanja.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { oracoes } from '../_lib/oracoes.js';
import { temAbaPublica } from '../../shared/oferendas.js';
import { gerarHash, conferirSenha, emitirToken, emitirTokenCorrente, emitirTokenGrupo, iguaisSeguro, SENHA_MINIMA } from '../_lib/senhas.js';
import { permissoesDe, ehAcessoCorrente, grupoAcesso, pode, PIN_VALIDO } from '../../shared/permissoes.js';
import { normalizarNome, nomesParecidos } from '../../shared/ervas.js';
import { normalizarPerfil, perfilDaFuncao, blocosAfinidade, ANAMNESE_TIPOS, ANAMNESE_PERGUNTA_MAX, ANAMNESE_TEXTO_MAX, ANAMNESE_SIMNAO, ANAMNESE_OPCOES_MAX, ANAMNESE_OPCAO_MAX, limparRespostaTexto, limparRespostaData } from '../../shared/perfil.js';
import { LINHA_KEYS } from '../../shared/regras.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publico(u) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, papelNome: u.papelNome || '', pessoaId: u.pessoaId || null,
    ...(u.grupo ? { grupo: u.grupo } : {}),
    permissoes: u.permissoes || permissoesDe(u.papel, u.abas) };
}

function validarNovaSenha(s) {
  if (typeof s !== 'string' || s.length < SENHA_MINIMA) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (s.length > 200) throw new HttpError(400, 'Senha longa demais.');
}

// Aplica as informações do bloco Perfil; recusa data ou telefone inválidos.
function comInfo(perfil, funcao, info) {
  const p = normalizarPerfil(perfil);
  ['nome', 'nascimento', 'celular', 'contatoNome', 'contatoTelefone'].forEach((k) => { if (k in info) p.info[k] = info[k] || ''; });
  const novo = perfilDaFuncao(p, funcao);
  if (info.nascimento && !novo.info.nascimento) throw new HttpError(400, 'Data de nascimento inválida.');
  if (info.celular && !novo.info.celular) throw new HttpError(400, 'Celular incompleto: coloque o DDD e o número.');
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

// Senha de quem tem uma; sem "pin" no pedido, devolve o pedido de senha para a tela.
async function conferirPin(b, info, chaveFalha, nome) {
  if (!info.pinHash) return null;
  if (b.pin === undefined || b.pin === null || b.pin === '') return { precisaSenha: true, nome };
  if (info.bloqueadoAte) throw new HttpError(429, 'Muitas tentativas erradas. Espere alguns minutos e tente de novo.');
  if (!(await conferirSenha(String(b.pin), info.pinHash))) {
    await db.rpc('login_falha', { email: chaveFalha });
    throw new HttpError(401, 'Senha incorreta.');
  }
  await db.rpc('login_ok', { email: chaveFalha });
  return null;
}

async function dadosDoMe(u) {
  const [iemanja, abasOferendas, videosPublicada, ervasPublicada] = await Promise.all([
    // Falha na aba Iemanjá só esconde a aba: não pode impedir o app de abrir.
    abaIemanja(u).catch((e) => {
      console.error('[auth/me] aba Iemanjá', e);
      return { iemanjaAba: false, iemanjaPublica: false };
    }),
    db.rpc('oferenda_abas_listar'),
    db.rpc('videos_publicada'),
    db.rpc('ervas_publicada'),
  ]);
  // Sem nenhuma sub-aba visível, a aba Oferendas some para quem não administra.
  // Aba Vídeos publicada: aparece também para quem não tem a aba no perfil.
  return { ...publico(u), corrente: u.papel === 'corrente', ...(u.papel === 'corrente' || u.grupo === 'alunos' ? { temSenha: !!u.temSenha } : {}),
    videosPublicada: !!videosPublicada, ervasPublicada: !!ervasPublicada, oferendasPublica: temAbaPublica(abasOferendas), ...iemanja };
}

// Lista que não pode impedir o app de abrir: se falhar, a chave não vem e a tela usa o que já tem.
const opcional = (promessa) => promessa.catch((e) => {
  console.error('[auth/inicio]', e);
  return undefined;
});

async function listasIniciais(eu) {
  if (eu.grupo === 'alunos') return { eventos: await db.rpc('eventos_listar') };
  if (eu.grupo === 'curimba') {
    const [eventos, minhaCurimba] = await Promise.all([db.rpc('eventos_listar'), db.rpc('curimba_minha', { alunoId: eu.curimbaAlunoId })]);
    return { eventos: eventos.filter((x) => x.tipo !== 'aviso'), minhaCurimba };
  }
  if (!pode(eu, 'pessoas:ler') || !pode(eu, 'giras:ler')) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  const [pessoas, giras, eventos, minhaCurimba, listaOracoes, entidadesApelidos] = await Promise.all([
    db.rpc('pessoas_listar', { todas: true }),
    db.rpc('giras_listar'),
    opcional(db.rpc('eventos_listar')),
    eu.pessoaId ? opcional(db.rpc('curimba_minha', { pessoaId: eu.pessoaId })) : null,
    opcional(oracoes(eu)),
    opcional(db.rpc('entidades_apelidos_listar')),
  ]);
  return { pessoas, giras: ocultarSorteios(eu, giras), eventos, minhaCurimba, oracoes: listaOracoes, entidadesApelidos };
}

const acoes = {
  async me(req) {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    return dadosDoMe(await exigir(req));
  },

  async inicio(req) {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    const u = await exigir(req);
    if (req.query.atualizar) return listasIniciais(u);
    const [me, listas] = await Promise.all([dadosDoMe(u), listasIniciais(u)]);
    return { me, ...listas };
  },

  // Perfil da própria pessoa (todo mundo que está no cadastro da corrente).
  // A curimba só tem as informações pessoais (sem orixás, guias e guias de atendimento).
  async perfil(req) {
    const eu = await exigir(req);
    if (eu.grupo === 'alunos') return perfilAluno(req, eu);
    if (eu.grupo) throw new HttpError(403, 'Este acesso não tem perfil pessoal.');
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
  },

  // Foto da pessoa: todos que estão logados veem (a aba Gira mostra com quem cada um trabalha);
  // trocar ou tirar, só a própria pessoa ou quem vê o perfil de todos (admin).
  async foto(req) {
    const eu = await exigir(req);
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
    if (req.method === 'GET') return { foto: await db.rpc('pessoa_foto_ler', { pessoaId }) };
    if (pessoaId !== eu.pessoaId && !pode(eu, 'perfil:corrente')) throw new HttpError(403, 'Só um admin mexe na foto de outra pessoa.');
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const { foto } = corpo(req);
    validarFoto(foto);
    return { foto: await db.rpc('pessoa_foto_salvar', { pessoaId, foto: foto || '' }) };
  },

  // Anamnese: o admin do perfil (perfil:corrente; o root também) cadastra as perguntas e lê as respostas de todos;
  // cada pessoa da corrente responde as suas.
  async anamnese(req) {
    const eu = await exigir(req);
    if (eu.grupo) throw new HttpError(403, 'Este acesso não tem Anamnese.');
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
  },

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
    const grupo = grupoAcesso(b.email);
    if (grupo === 'alunos' || grupo === 'curimba') {
      const lista = grupo === 'alunos'
        ? (await db.rpc('alunos_estado')).alunos
        : (await db.rpc('curimba_estado')).alunos;
      const digitado = String(b.senha || '').replace(/\s+/g, ' ').trim();
      if (digitado.length < 2 || digitado.length > 80) throw new HttpError(400, 'Digite o seu nome.');
      const pessoa = lista.find((x) => normalizarNome(x.nome) === normalizarNome(digitado));
      if (pessoa) {
        let versao = 0;
        if (grupo === 'alunos') {
          const pin = await db.rpc('aluno_pin', { alunoId: pessoa.id });
          const pedido = await conferirPin(b, pin, 'pina:' + pessoa.id, pessoa.nome);
          if (pedido) return pedido;
          versao = pin.pinVersao;
        }
        const usuario = {
          id: null, nome: pessoa.nome, email: '', papel: grupo, papelNome: grupo === 'alunos' ? 'Aluno' : 'Curimba',
          grupo, pessoaId: null, permissoes: grupo === 'alunos' ? ['alunos:ver'] : [],
        };
        return { token: await emitirTokenGrupo(grupo, pessoa.id, pessoa.nome, versao), usuario: publico(usuario) };
      }
      const candidatos = nomesParecidos(lista.map((x) => x.nome), digitado);
      if (candidatos.length) return { confirmar: true, candidatos };
      throw new HttpError(404, 'Não encontrei esse nome neste cadastro. Confira a palavra-passe e tente de novo.');
    }
    // Acesso da corrente: no lugar da senha vem o nome da pessoa.
    if (ehAcessoCorrente(b.email)) {
      const digitado = String(b.senha || '').replace(/\s+/g, ' ').trim();
      if (digitado.length < 2 || digitado.length > 80) throw new HttpError(400, 'Digite o seu nome.');
      // O nome tem que ser de alguém cadastrado na corrente; fica sempre salvo com o nome do cadastro.
      const pessoas = await db.rpc('pessoas_listar');
      const exata = pessoas.find((p) => normalizarNome(p.nome) === normalizarNome(digitado));
      if (exata) {
        // Quem criou senha (PIN) precisa digitá-la.
        const pin = await db.rpc('pessoa_pin', { pessoaId: exata.id });
        const pedido = await conferirPin(b, pin, 'pin:' + exata.id, exata.nome);
        if (pedido) return pedido;
        // Junta no cadastro da pessoa o que ela (ou o admin por ela) preencheu antes com o nome digitado.
        const antigas = [...new Set([exata.nome, digitado, String(b.digitado || '')].filter(Boolean).map((n) => 'n:' + normalizarNome(n)))];
        await db.rpc('corrente_vincular', { chave: 'p:' + exata.id, nome: exata.nome, antigas });
        const s = await db.rpc('corrente_sessao', { pessoaId: exata.id });
        const usuario = { id: null, nome: exata.nome, email: '', papel: 'corrente', papelNome: s.papelNome, pessoaId: exata.id, abas: s.abas };
        return { token: await emitirTokenCorrente(exata.nome, exata.id, s.pinVersao), usuario: publico(usuario) };
      }
      const candidatos = nomesParecidos(pessoas.map((p) => p.nome), digitado);
      if (candidatos.length) return { confirmar: true, candidatos };
      throw new HttpError(404, 'Não encontrei esse nome na corrente. Digite como está no cadastro ou fale com um admin.');
    }
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

  // Quem entrou pelo acesso da corrente cria a própria senha (uma vez; depois só o root troca).
  async criarSenha(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const eu = await exigir(req);
    if (eu.papel !== 'corrente' && eu.grupo !== 'alunos') throw new HttpError(400, 'Só o acesso da corrente cria senha aqui. Use Trocar senha.');
    const senha = String(corpo(req).senha ?? '');
    if (!PIN_VALIDO.test(senha)) throw new HttpError(400, 'A senha precisa ter de 4 a 8 números.');
    if (eu.grupo === 'alunos') {
      const { pinVersao } = await db.rpc('aluno_pin_definir', { alunoId: eu.alunoId, pinHash: await gerarHash(senha), soSeVazio: true });
      return { token: await emitirTokenGrupo('alunos', eu.alunoId, eu.nome, pinVersao) };
    }
    const { pinVersao } = await db.rpc('pin_definir', { pessoaId: eu.pessoaId, pinHash: await gerarHash(senha), soSeVazio: true });
    return { token: await emitirTokenCorrente(eu.nome, eu.pessoaId, pinVersao) };
  },

  async senha(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const eu = await exigir(req);
    if (eu.grupo) throw new HttpError(403, 'Este acesso não tem senha para trocar.');
    if (eu.papel === 'corrente') throw new HttpError(400, 'O acesso da corrente não tem senha.');
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
