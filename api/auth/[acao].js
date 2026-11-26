// Login e instalação.
//   GET  /api/auth/estado   { instalado }  — o app já tem um admin?
//   POST /api/auth/instalar { codigo, nome, email, senha }  — cria o primeiro admin
//   POST /api/auth/entrar   { email, senha } ou { cpf, senha }  → { token, usuario }
//                           "email" pode ser e-mail ou celular: usuário, corrente ou aluno com a senha que criou (3 erros bloqueiam 15 min)
//                           entrar de quem não tem senha → { criarSenha: true, confirmar: 'celular' | 'email' | null }
//                           palavras-passe (cpj, alunos, curimba) acabaram: a resposta manda entrar com e-mail/celular ou achar o cadastro pelo CPF
//   POST /api/auth/cadastrar { cpf, verificar: true }  → { existe, temSenha, confirmar? }  o CPF já é de alguém?
//   POST /api/auth/cadastrar { nome, celular, email, cpf, senha }  autocadastro: entra como aluno sem turma → { token, usuario }
//   POST /api/auth/criarSenhaContato { contato | cpf, confirmacao, senha }  cria a senha confirmando o outro contato → { token, usuario }
//   POST /api/auth/senha    { atual, nova }   → { token }  (logado)
//   POST /api/auth/criarSenha { senha, celular }  corrente ou aluno: cria a senha (6 a 8 números); o celular digitado tem de
//                           bater com o do cadastro (Perfil) → { token }
//   GET  /api/auth/me       quem sou eu e o que posso fazer (logado)
//   GET  /api/auth/inicio   a abertura do app em um pedido só → { me, versao, config, pessoas, giras, eventos, minhaCurimba, oracoes, entidadesApelidos }
//                           ?atualizar=1 (voltar ao app): só as listas, sem "me"; com &versao= igual à atual, só { versao, semMudanca: true }.
//                           ?parcial=1 (app atual): giras dos últimos 12 meses (+ girasDesde) e, na volta, só a parte que mudou
//                           (giras, ou pessoas/config/eventos/orações); sem ele, tudo, como antes.
//                           Alunos recebem { versao, eventos, oracoes, minhaCurimba, config } (na volta, com a mesma versão, só semMudanca).
//   GET  /api/auth/perfil   → { eu: { pessoaId, nome, perfil } | null, todos?: [{ pessoaId, nome, funcao, perfil }] (admin) }
//   POST /api/auth/perfil   { perfil }  salva o meu perfil inteiro (curimba: só as informações pessoais)
//                           Aluno (depois de criar a senha): só os próprios dados, informações, orixás e guias.
//   GET  /api/auth/cpf?pessoaId=…[&ver=1] · POST /api/auth/cpf { pessoaId?, cpf }  CPF cifrado (própria pessoa ou root; api/_lib/cpf.js)
//   GET  /api/auth/foto?pessoaId=…  → { foto: base64 JPEG | null }  (qualquer um logado: a aba Gira mostra a foto de com quem você trabalha)
//   POST /api/auth/foto     { pessoaId?, foto: base64 JPEG | null }  troca ou tira a foto (a própria, ou de qualquer um: admin)
//   GET  /api/auth/anamnese → { perguntas: [{ id, texto, tipo }], minhas: { perguntaId: resposta } | null, todas?: [{ pessoaId, perguntaId, resposta }] (admin do perfil) }
//   POST /api/auth/anamnese { acao: 'responder', respostas: { perguntaId: resposta } }  a própria pessoa
//                           { acao: 'pergunta', texto, tipo: 'texto'|'simnao' } · { acao: 'excluirPergunta', id }  (admin do perfil)  → como o GET
//   POST /api/auth/visita   { aba }  a pessoa abriu essa aba (lista "Quem entrou nas abas" do Admin root; o root não conta) → { ok }

import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { db } from '../_lib/db.js';
import { exigir, exigirComLeitura } from '../_lib/sessao.js';
import { abaIemanja } from '../_lib/iemanja.js';
import { ocultarSorteios } from '../_lib/escala.js';
import { oracoes } from '../_lib/oracoes.js';
import { eventosDe } from '../_lib/eventos.js';
import { condutas } from '../_lib/conduta.js';
import { atrasos } from '../_lib/atrasos.js';
import { rotaCpf, cifrar, hashCpf, cadastroPorCpf } from '../_lib/cpf.js';
import { dadosAluno } from '../_lib/alunos.js';
import { rotaPerfil, rotaFoto, rotaAnamnese, exigirSenhaCorrente } from '../_lib/perfil.js';
import { randomUUID } from 'node:crypto';
import { temAbaPublica } from '../../shared/oferendas.js';
import { abaValida } from '../../shared/visitas.js';
import { chavePessoa } from '../../shared/ervas.js';
import { gerarHash, conferirSenha, emitirToken, emitirTokenCorrente, emitirTokenGrupo, iguaisSeguro, limitarPorIp, SENHA_MINIMA } from '../_lib/senhas.js';
import { permissoesDe, grupoAcesso, pode, PIN_VALIDO, PIN_NOVO, PIN_NOVO_MSG, PERMISSOES_GRUPO } from '../../shared/permissoes.js';
import { normalizarNome } from '../../shared/ervas.js';
import { cpfValido, normalizarPerfil } from '../../shared/perfil.js';
import { compactarRetratos } from '../../shared/regras.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publico(u) {
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, papelNome: u.papelNome || '', pessoaId: u.pessoaId || null,
    ...(u.grupo ? { grupo: u.grupo } : {}),
    ...(u.consulente ? { consulente: true } : {}),
    ...(u.grupoOferenda ? { grupoOferenda: true } : {}),
    // Aluno sem turma (cadastro novo pelo login): só a aba Geral, com o aviso de que aguarda a administração.
    ...(u.grupo === 'alunos' && !u.consulente && !u.grupoOferenda && 'turmaId' in u && !u.turmaId ? { aguardando: true } : {}),
    permissoes: u.permissoes || permissoesDe(u.papel, u.abas) };
}

function validarNovaSenha(s) {
  if (typeof s !== 'string' || s.length < SENHA_MINIMA) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  if (s.length > 200) throw new HttpError(400, 'Senha longa demais.');
}

const BLOQUEADO = 'Senha errada 3 vezes: o acesso ficou bloqueado por 15 minutos. Se esqueceu a senha, fale com a administração.';
const senhaErrada = (msg, restantes) => (restantes > 0
  ? new HttpError(401, `${msg} ${restantes === 1 ? 'Resta 1 tentativa' : `Restam ${restantes} tentativas`} antes de bloquear por 15 minutos.`)
  : new HttpError(429, BLOQUEADO));

// O que foi digitado no primeiro campo do login: e-mail, celular (com DDD; aceita +55) ou nada disso.
function contatoDoLogin(texto) {
  const t = String(texto || '').trim();
  if (t.includes('@')) return { email: t.toLowerCase() };
  if (!/^[\d\s().+-]+$/.test(t)) return null;
  let d = t.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? { celular: d.slice(0, 2) + d.slice(-8) } : null;
}

// Entrar com e-mail ou celular e a senha que a pessoa criou: usuário (e-mail e senha), pessoa da corrente ou aluno
// (e-mail ou celular do Perfil e a senha de números; as antigas têm 4 a 8, as novas 6 a 8). O mesmo contato pode estar em mais de um cadastro: vale o
// primeiro cuja senha confere (usuário, depois corrente, depois aluno). Errar conta para todos eles (3 vezes bloqueia).
async function entrarPorContato(req, contato, senha) {
  const lista = await db.rpc('login_candidatos', contato);
  if (!lista.length) {
    // Sem limite, daria para testar à vontade quais e-mails e celulares são da casa.
    await limitarPorIp(req, 'busca', 20, 60, 'Muitas consultas de e-mail ou celular não cadastrados. Tente de novo em uma hora.');
    throw new HttpError(404, contato.email
      ? 'Não encontrei cadastro com esse e-mail. Confira ou toque em Criar cadastro.'
      : 'Não encontrei cadastro com esse celular. Confira o DDD e o número ou toque em Criar cadastro.');
  }
  return entrarNaLista(lista, senha, contato.email ? 'E-mail' : 'Celular', contato.email ? 'celular' : 'email');
}

// Entrar pelo CPF (Criar cadastro, quando o CPF já tem cadastro): corrente ou aluno, com a senha de números.
async function entrarPorCpf(req, cpfDigitado, senha) {
  const cpf = cpfValido(cpfDigitado);
  if (!cpf) throw new HttpError(400, 'CPF inválido. Confira os 11 números.');
  const lista = await cadastroPorCpf(cpf);
  if (!lista.length) {
    await limitarPorIp(req, 'busca', 20, 60, 'Muitas consultas de CPF não cadastrado. Tente de novo em uma hora.');
    throw new HttpError(404, 'Não encontrei cadastro com esse CPF.');
  }
  return entrarNaLista(lista, senha, 'CPF', campoConfirmacao(lista));
}

// Para criar a senha pelo CPF, confirma com o celular do cadastro (ou o e-mail, se não tiver celular).
const campoConfirmacao = (lista) => (lista.some((c) => c.celular) ? 'celular' : lista.some((c) => c.email) ? 'email' : null);

// lista: cadastros achados pelo contato ou pelo CPF; confirmar: o que a tela pede para criar a senha de quem não tem.
async function entrarNaLista(lista, senha, rotulo, confirmar) {
  if (lista.some((c) => c.bloqueado)) throw new HttpError(429, BLOQUEADO);
  const comSenha = lista.filter((c) => c.hash);
  // Sem senha (nunca criou, ou o root limpou): a tela pede o outro contato para confirmar e a senha nova (criarSenhaContato).
  if (!comSenha.length || (!senha && lista.some((c) => !c.hash))) return { criarSenha: true, confirmar };
  if (!senha) throw new HttpError(400, 'Digite a sua senha.');
  let certo = null;
  for (const c of comSenha) {
    // Corrente e aluno só têm senha de 4 a 8 números: nem confere o resto.
    if (c.tipo !== 'usuario' && !PIN_VALIDO.test(senha)) continue;
    if (await conferirSenha(senha, c.hash)) { certo = c; break; }
  }
  if (!certo) {
    const r = await Promise.all(comSenha.map((c) => db.rpc('login_falha', { email: c.chave })));
    throw senhaErrada(`${rotulo} ou senha incorretos.`, Math.min(...r.map((x) => x.restantes)));
  }
  await Promise.all(comSenha.map((c) => db.rpc('login_ok', { email: c.chave })));
  return sessaoDe(certo, certo.versao);
}

// Token e usuário de quem foi achado em login_candidatos (versao: a versão da senha, para aluno).
async function sessaoDe(c, versao) {
  if (c.tipo === 'usuario') {
    const usuario = await db.rpc('usuario_obter', { id: c.id });
    return { token: await emitirToken(usuario), usuario: publico(usuario) };
  }
  if (c.tipo === 'corrente') {
    // Junta no cadastro da pessoa o que ficou gravado só com o nome dela (pedidos de antes de ligar o acesso à pessoa).
    await db.rpc('corrente_vincular', { chave: 'p:' + c.id, nome: c.nome, antigas: ['n:' + normalizarNome(c.nome)] });
    const s = await db.rpc('corrente_sessao', { pessoaId: c.id });
    // A pessoa tem um perfil (Admin root → Acessos e perfis): entra já com ele.
    if (s.usuarioId) {
      const usuario = await db.rpc('usuario_obter', { id: s.usuarioId });
      return { token: await emitirToken(usuario), usuario: publico(usuario) };
    }
    const usuario = { id: null, nome: c.nome, email: '', papel: 'corrente', papelNome: s.papelNome, pessoaId: c.id, abas: s.abas };
    return { token: await emitirTokenCorrente(c.nome, c.id, s.pinVersao), usuario: publico(usuario) };
  }
  // Aluno com o acesso bloqueado (aba Pessoas): não entra.
  if ((await db.rpc('aluno_acesso', { id: c.id }))?.bloqueado) throw new HttpError(403, 'Seu acesso ao app está bloqueado. Fale com a administração.');
  const usuario = { id: null, nome: c.nome, email: '', papel: 'alunos', papelNome: 'Aluno', grupo: 'alunos', pessoaId: null,
    permissoes: PERMISSOES_GRUPO.alunos || [] };
  return { token: await emitirTokenGrupo('alunos', c.id, c.nome, versao), usuario: publico(usuario) };
}

// extras: o que decide as abas, quando já veio junto na abertura (inicio_dados); sem ele, busca aqui (/auth/me).
async function dadosDoMe(u, extras = null) {
  const [iemanja, abasOferendas, videosPublicada, ervasPublicada, guiasPublicada, amaciPublicada, transparenciaPublicada, diarioPublicada, oraculoPublicado, ebook] = await Promise.all([
    // Falha na aba Iemanjá só esconde a aba: não pode impedir o app de abrir.
    abaIemanja(u, extras?.iemanja).catch((e) => {
      console.error('[auth/me] aba Iemanjá', e);
      return { iemanjaAba: false, iemanjaPublica: false };
    }),
    extras ? extras.abasOferendas : db.rpc('oferenda_abas_listar'),
    extras ? extras.videosPublicada : db.rpc('videos_publicada'),
    extras ? extras.ervasPublicada : db.rpc('ervas_publicada'),
    extras ? extras.guiasPublicada : db.rpc('guias_publicada'),
    extras ? extras.amaciPublicada : db.rpc('amaci_publicada'),
    // Painel da Transparência: só a corrente (alunos e curimba nunca veem). Na abertura já vem pronto (extras).
    u.grupo ? false : extras && 'transparenciaPublicada' in extras ? extras.transparenciaPublicada : db.rpc('transparencia_publicada').catch(() => false),
    // Aba Diário: visível para todos quando o root liga (a curimba, sem pessoa, nunca tem). Na abertura já vem pronto.
    u.grupo && u.grupo !== 'alunos' ? false : extras && 'diarioPublicada' in extras ? extras.diarioPublicada : db.rpc('diario_publicada').catch(() => false),
    // Aba Oráculo: visível para todos quando quem administra liga (a curimba nunca tem). Na abertura já vem pronto.
    u.grupo && u.grupo !== 'alunos' ? false : extras && 'oraculoPublicado' in extras ? extras.oraculoPublicado : db.rpc('oraculo_publicado').catch(() => false),
    // Popup do e-book (ligado no Admin root) e a compra da pessoa: para todos. Na abertura da corrente já vem pronto.
    extras?.ebook || db.rpc('ebook_me', { chave: chavePessoa(u) }).catch(() => null),
  ]);
  // Sem nenhuma sub-aba visível, a aba Oferendas some para quem não administra.
  // Aba Vídeos publicada: aparece também para quem não tem a aba no perfil.
  return { ...publico(u), corrente: u.papel === 'corrente', ...(u.papel === 'corrente' || u.grupo === 'alunos' ? { temSenha: !!u.temSenha } : {}),
    videosPublicada: !!videosPublicada, ervasPublicada: !!ervasPublicada, guiasPublicada: !!guiasPublicada, amaciPublicada: !!amaciPublicada, transparenciaPublicada: !!transparenciaPublicada, diarioPublicada: !!diarioPublicada, oraculoPublicado: !!oraculoPublicado, oferendasPublica: temAbaPublica(abasOferendas), ...iemanja,
    ebook: { popup: !!ebook?.popup && !!ebook?.pdf, compra: ebook?.compra || null } };
}

// Lista que não pode impedir o app de abrir: se falhar, a chave não vem e a tela usa o que já tem.
const opcional = (promessa) => promessa.catch((e) => {
  console.error('[auth/inicio]', e);
  return undefined;
});

// Alunos: poucas listas, buscadas aqui.
async function listasDoGrupo(eu) {
  const config = opcional(db.rpc('config_casa'));
  // Aluno da curimba (turma Curimba ou ligado na aba Curimba): as próprias aulas, como na corrente.
  const [eventos, ora, minhaCurimba] = await Promise.all([eventosDe(eu), opcional(db.rpc('oracoes_listar')),
    opcional(db.rpc('curimba_minha', { aluno: eu.alunoId }))]);
  return { eventos, oracoes: ora ? await oracoes(eu, ora) : undefined, minhaCurimba, config: await config };
}

// Blocos da aba Geral (relatos e atrasos) que vinham em pedidos à parte logo depois da abertura: vão juntos nela.
// undefined = não veio (sem acesso, falhou ou a leitura do ASAAS venceu) e o app busca pela rota própria.
function blocosGeral(u) {
  return Promise.all([
    u.grupo ? undefined : opcional(condutas(u)),
    u.grupo && u.grupo !== 'alunos' ? undefined : opcional(atrasos(u, false, { soCache: true })).then((a) => a ?? undefined),
  ]);
}

async function registrarVisitas(eu, texto) {
  if (!texto || eu.verComo || pode(eu, 'usuarios:gerenciar')) return;
  const abas = [...new Set(String(texto).split(','))].filter(abaValida).slice(0, 20);
  const nome = String(eu.nome || '').trim();
  if (!abas.length) return;
  // Todas as abas numa chamada só (antes, uma por aba).
  await db.rpc('visitas_registrar', { chave: chavePessoa(eu), abas, nome }).catch((e) => console.error('[visitas]', e));
}

// Corrente e usuários: tudo de uma vez no banco (inicio_dados, que já veio junto com a sessão). Com a versão que o
// app já tem e nada mudado, volta só { versao, semMudanca }. extras: o que decide as abas, quando me = true.
async function listasIniciais(eu, d) {
  if (!pode(eu, 'pessoas:ler') || !pode(eu, 'giras:ler')) throw new HttpError(403, 'Seu perfil não tem permissão para isso.');
  if (d.semMudanca) return { listas: { versao: d.versao, semMudanca: true }, extras: null };
  // Só o que mudou (?parcial=1, app atual): sem pessoasMudou, o resto não vem; sem giras, as giras não vêm.
  const listas = { versao: d.versao };
  if (d.pessoasMudou) {
    Object.assign(listas, {
      config: d.config, pessoas: d.pessoas, eventos: d.eventos, minhaCurimba: eu.pessoaId ? d.minhaCurimba : null,
      oracoes: d.oracoes ? await oracoes(eu, d.oracoes) : undefined, entidadesApelidos: d.entidadesApelidos,
    });
  }
  // Retrato das giras encerradas só com o que difere do cadastro (ver shared/regras.js compactarRetrato).
  // girasDesde: a lista começa nessa data (as mais antigas o app busca em GET /api/giras quando precisa).
  if (d.giras) Object.assign(listas, { giras: ocultarSorteios(eu, compactarRetratos(d.pessoas, d.giras)), girasDesde: d.girasDesde || null });
  return { listas, extras: d };
}

const acoes = {
  async me(req) {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    return dadosDoMe(await exigir(req));
  },

  async inicio(req) {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    const atualizar = !!req.query.atualizar;
    // Corrente e usuários: a sessão, as listas (inicio_dados) e, na abertura, "a Transparência / o Diário estão
    // visíveis?" (e o Oráculo) vão numa ida só ao banco. Ao voltar ao app, ?versao= é a que ele já tem: sem mudança, só { versao, semMudanca }.
    // Aluno: a sessão e a versão dos dados dele (aluno_versao) nessa ida; as listas vêm depois (listasDoGrupo), só se mudou.
    const [u, d, transparencia, diarioPub, oraculoPub, ebook] = await exigirComLeitura(req, null, ({ pessoaId, usuarioId, alunoId }) => (alunoId ? [{ funcao: 'aluno_versao' }] : [
      { funcao: 'inicio_dados', p: { versao: atualizar ? String(req.query.versao || '') : '', me: !atualizar, parcial: !!req.query.parcial,
        pessoaId: pessoaId || '', usuarioId: usuarioId || '' } },
      ...(atualizar ? [] : [{ funcao: 'transparencia_publicada' }, { funcao: 'diario_publicada' }, { funcao: 'oraculo_publicado' },
        { funcao: 'ebook_me', p: { chave: pessoaId ? 'p:' + pessoaId : 'u:' + usuarioId } }]),
    ]), { soLeitura: false });
    // ?visitas=gira,ervas: abas abertas desde o último pedido, que pegam carona aqui em vez de um pedido só para isso
    // (cada pedido avulso acordava o banco). Falha não atrapalha a abertura; vai junto com o resto.
    const visitas = registrarVisitas(u, req.query.visitas);
    // Aluno: as listas e o "me" vão ao banco ao mesmo tempo.
    // Na volta ao app, com a mesma versão, só { versao, semMudanca }, como na corrente.
    if (u.grupo) {
      const versao = typeof d === 'string' ? d : undefined;
      if (atualizar) {
        if (versao && String(req.query.versao || '') === versao) { await visitas; return { versao, semMudanca: true }; }
        return { versao, ...(await Promise.all([listasDoGrupo(u), visitas]))[0] };
      }
      const [listas, me, [, atrasosAluno]] = await Promise.all([listasDoGrupo(u), dadosDoMe(u), blocosGeral(u), visitas]);
      return { me, versao, ...listas, atrasos: atrasosAluno };
    }
    const { listas, extras } = await listasIniciais(u, d);
    if (atualizar) {
      await visitas;
      return listas;
    }
    const [[conduta, atrasosEu]] = await Promise.all([blocosGeral(u), visitas]);
    return { me: await dadosDoMe(u, extras && { ...extras, transparenciaPublicada: !!transparencia, diarioPublicada: !!diarioPub, oraculoPublicado: !!oraculoPub, ebook }), ...listas,
      conduta, atrasos: atrasosEu };
  },

  // Abriu uma aba: soma uma entrada de hoje (o banco guarda só os últimos 3 dias). O root e o "Ver como" não contam.
  // O app atual manda as visitas junto com o /auth/inicio; esta rota fica para o aparelho uma versão atrás.
  async visita(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const eu = await exigir(req);
    if (eu.verComo || pode(eu, 'usuarios:gerenciar')) return { ok: true };
    const aba = String(corpo(req).aba || '');
    if (!abaValida(aba)) throw new HttpError(400, 'Aba inválida.');
    await db.rpc('visita_registrar', { chave: chavePessoa(eu), aba, nome: String(eu.nome || '').trim() });
    return { ok: true };
  },

  // Perfil, foto e Anamnese: api/_lib/perfil.js.
  async perfil(req) {
    return rotaPerfil(req, await exigir(req));
  },

  // CPF: só a própria pessoa e o admin root (veja api/_lib/cpf.js).
  async cpf(req) {
    const eu = await exigir(req);
    exigirSenhaCorrente(eu);
    return rotaCpf(req, eu);
  },

  async foto(req, res) {
    return rotaFoto(req, res, await exigir(req));
  },

  async anamnese(req) {
    return rotaAnamnese(req, await exigir(req));
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
    if (b.cpf) {
      const senha = String(b.senha || '');
      if (senha.length > 200) throw new HttpError(400, 'Senha longa demais.');
      return entrarPorCpf(req, b.cpf, senha);
    }
    // As palavras-passe (cpj, alunos, curimba) acabaram: quem não lembra o que está no cadastro acha pelo CPF.
    if (grupoAcesso(b.email)) {
      throw new HttpError(400, 'A palavra-passe acabou. Entre com o seu e-mail ou celular e a senha. Sem senha, ou sem saber o que está no seu cadastro, toque em Criar cadastro e digite o seu CPF.');
    }
    const senha = String(b.senha || '');
    // Senha em branco vale: quem ainda não tem senha é levado a criar (criarSenha na resposta).
    if (!String(b.email || '').trim()) throw new HttpError(400, 'Informe o e-mail ou o celular.');
    if (senha.length > 200) throw new HttpError(400, 'Senha longa demais.');
    const contato = contatoDoLogin(b.email);
    if (!contato) throw new HttpError(400, 'Digite o e-mail ou o celular com DDD.');
    return entrarPorContato(req, contato, senha);
  },

  // Criar cadastro (tela de login, sem estar logado): a pessoa entra como aluno sem turma e já sai logada;
  // a administração depois põe na turma ou na corrente. Nome, celular, e-mail, CPF e a senha (6 a 8 números).
  // Começa pelo CPF ({ cpf, verificar: true }): se ele já é de alguém da corrente ou de um aluno, a pessoa não cria outro
  // cadastro: entra com a senha (entrar { cpf, senha }) ou, sem senha, cria a senha confirmando o celular (ou o e-mail)
  // do cadastro (criarSenhaContato { cpf, ... }). Os dados do cadastro ficam como estão. A resposta não diz o nome.
  async cadastrar(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const b = corpo(req);
    if (b.verificar) {
      await limitarPorIp(req, 'cpfbusca', 20, 60, 'Muitas consultas de CPF. Tente de novo em uma hora ou fale com a administração.');
      const cpf = cpfValido(b.cpf);
      if (!cpf) throw new HttpError(400, 'CPF inválido. Confira os 11 números.');
      const lista = await cadastroPorCpf(cpf);
      if (!lista.length) return { existe: false };
      if (lista.some((c) => c.bloqueado)) throw new HttpError(429, BLOQUEADO);
      const temSenha = lista.some((c) => c.hash);
      return { existe: true, temSenha, ...(temSenha ? {} : { confirmar: campoConfirmacao(lista) }) };
    }
    // Cada tentativa conta (as recusas dizem se o CPF, e-mail ou celular já existe): 10 por hora por IP.
    await limitarPorIp(req, 'cadastro', 10, 60, 'Muitas tentativas de cadastro. Tente de novo em uma hora ou fale com a administração.');
    const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
    if (nome.length < 3 || nome.length > 80) throw new HttpError(400, 'Digite o seu nome (de 3 a 80 letras).');
    if (!/\s/.test(nome)) throw new HttpError(400, 'Digite nome e sobrenome.');
    const d = dadosAluno({ celular: b.celular, email: b.email, cpf: b.cpf });
    if (!d.celular) throw new HttpError(400, 'Digite o seu celular com DDD.');
    if (!d.email) throw new HttpError(400, 'Digite o seu e-mail.');
    if (!d.cpf) throw new HttpError(400, 'Digite o seu CPF.');
    const senha = String(b.senha ?? '');
    if (!PIN_NOVO.test(senha)) throw new HttpError(400, PIN_NOVO_MSG);
    const cpfHash = hashCpf(d.cpf); // sem a CPF_CHAVE no servidor, recusa antes de gravar qualquer coisa
    if ((await cadastroPorCpf(d.cpf)).length) {
      throw new HttpError(400, 'Você já tem cadastro com esse CPF. Toque em Trocar CPF, digite o CPF de novo e entre com a sua senha.');
    }
    // Sem CPF no cadastro da corrente, a pessoa da corrente viraria aluno com o mesmo nome.
    if ((await db.rpc('pessoas_listar')).some((p) => normalizarNome(p.nome) === normalizarNome(nome))) {
      throw new HttpError(400, 'Já existe alguém da corrente com esse nome. Se for você, entre com o seu e-mail ou celular, ou fale com a administração para cadastrar o seu CPF.');
    }
    const a = await db.rpc('aluno_autocadastro', {
      id: randomUUID(), nome, celular: d.celular, email: d.email, pinHash: await gerarHash(senha), cpfHash,
    });
    await db.rpc('aluno_cpf_salvar', { id: a.id, cifrado: cifrar(d.cpf, a.id), hash: cpfHash, por: 'autocadastro' });
    const usuario = { id: null, nome: a.nome, email: '', papel: 'alunos', papelNome: 'Aluno', grupo: 'alunos', pessoaId: null,
      permissoes: PERMISSOES_GRUPO.alunos || [] };
    return { token: await emitirTokenGrupo('alunos', a.id, a.nome, a.pinVersao), usuario: publico(usuario) };
  },

  // Criar a senha sem estar logado (nunca criou, ou o root limpou), entrando com e-mail ou celular.
  // Quem digitou o e-mail confirma com o celular do cadastro; quem digitou o celular, com o e-mail. Errar a confirmação
  // conta como senha errada (3 vezes bloqueia 15 minutos), e há o limite por IP.
  async criarSenhaContato(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    await limitarPorIp(req, 'criarsenha', 10, 60, 'Muitas tentativas de criar senha. Tente de novo em uma hora ou fale com a administração.');
    const b = corpo(req);
    const senha = String(b.senha ?? '');
    let lista;
    let campo;
    // Pelo CPF (Criar cadastro de quem já tem cadastro): confirma com o celular do cadastro ou, sem ele, com o e-mail.
    if (b.cpf) {
      const cpf = cpfValido(b.cpf);
      if (!cpf) throw new HttpError(400, 'CPF inválido. Confira os 11 números.');
      if (!PIN_NOVO.test(senha)) throw new HttpError(400, PIN_NOVO_MSG);
      lista = (await cadastroPorCpf(cpf)).filter((c) => !c.hash);
      campo = campoConfirmacao(lista);
    } else {
      const contato = contatoDoLogin(b.contato);
      if (!contato) throw new HttpError(400, 'Digite o e-mail ou o celular com DDD.');
      if (!PIN_NOVO.test(senha)) throw new HttpError(400, PIN_NOVO_MSG);
      lista = (await db.rpc('login_candidatos', contato)).filter((c) => c.tipo !== 'usuario' && !c.hash);
      campo = contato.email ? 'celular' : 'email';
    }
    if (!lista.length) throw new HttpError(400, 'Este cadastro já tem senha. Entre com ela ou fale com a administração.');
    if (lista.some((c) => c.bloqueado)) throw new HttpError(429, BLOQUEADO);
    if (!campo || !lista.some((c) => c[campo])) {
      throw new HttpError(400, campo
        ? `O seu ${campo === 'celular' ? 'celular' : 'e-mail'} não está no cadastro. Fale com a administração.`
        : 'O seu cadastro não tem celular nem e-mail para confirmar que é você. Fale com a administração.');
    }
    let confirma;
    if (campo === 'celular') {
      confirma = contatoDoLogin(String(b.confirmacao ?? '').replace(/@/g, ''))?.celular;
      if (!confirma) throw new HttpError(400, 'Digite o seu celular com DDD.');
    } else {
      confirma = String(b.confirmacao ?? '').trim().toLowerCase();
      if (!confirma.includes('@')) throw new HttpError(400, 'Digite o seu e-mail.');
    }
    const certo = lista.find((c) => c[campo] && c[campo] === confirma);
    if (!certo) {
      const r = await Promise.all(lista.map((c) => db.rpc('login_falha', { email: c.chave })));
      throw senhaErrada(`O ${campo === 'celular' ? 'celular' : 'e-mail'} não confere com o do cadastro.`, Math.min(...r.map((x) => x.restantes)));
    }
    const hash = await gerarHash(senha);
    const { pinVersao } = certo.tipo === 'corrente'
      ? await db.rpc('pin_definir', { pessoaId: certo.id, pinHash: hash, soSeVazio: true })
      : await db.rpc('aluno_pin_definir', { alunoId: certo.id, pinHash: hash, soSeVazio: true });
    await Promise.all(lista.map((c) => db.rpc('login_ok', { email: c.chave })));
    return sessaoDe(certo, pinVersao);
  },

  // Quem entrou pelo acesso da corrente cria a própria senha (uma vez; para trocar, o root limpa e ela cria de novo).
  // Para provar que é a própria pessoa (o login sem senha é só pelo nome), ela digita o celular e ele tem de bater com o
  // do cadastro (Perfil). Sem celular no cadastro, não cria: a administração cadastra antes. Mesmo DDD e mesmos 8 últimos
  // números (aceita com ou sem o 9 da frente).
  async criarSenha(req) {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const eu = await exigir(req);
    if (eu.papel !== 'corrente' && eu.grupo !== 'alunos') throw new HttpError(400, 'Só o acesso da corrente cria senha aqui. Use Trocar senha.');
    const aluno = eu.grupo === 'alunos';
    const b = corpo(req);
    const senha = String(b.senha ?? '');
    if (!PIN_NOVO.test(senha)) throw new HttpError(400, PIN_NOVO_MSG);
    // Sem o campo celular no pedido é o app antigo (de antes desta conferência), que não pergunta o celular.
    if (!('celular' in b)) throw new HttpError(400, 'Atualize o app para criar a senha: feche e abra de novo (ou toque em Atualizar no aviso de nova versão).');
    const digitado = String(b.celular ?? '').replace(/\D/g, '');
    if (digitado.length < 10 || digitado.length > 11) throw new HttpError(400, 'Digite o seu celular com DDD (10 ou 11 números).');
    const perfil = aluno ? await db.rpc('aluno_perfil_ler', { alunoId: eu.alunoId }) : (await db.rpc('perfil_ler', { pessoaId: eu.pessoaId })).perfil;
    const cadastro = normalizarPerfil(perfil).info.celular;
    if (!cadastro) throw new HttpError(400, 'Seu celular não está no cadastro. Peça para a administração cadastrar e tente de novo.');
    const confere = (x) => x.slice(0, 2) + x.slice(-8);
    if (confere(digitado) !== confere(cadastro)) throw new HttpError(400, 'O celular não confere com o do cadastro.');
    if (aluno) {
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
    if (eu.papel === 'corrente' || !eu.email) throw new HttpError(400, 'Quem entra pelo acesso da corrente não troca a senha aqui.');
    const b = corpo(req);
    const info = await db.rpc('usuario_para_login', { email: eu.email });
    if (!(await conferirSenha(String(b.atual || ''), info.senhaHash))) throw new HttpError(400, 'A senha atual está incorreta.');
    validarNovaSenha(b.nova);
    const usuario = await db.rpc('usuario_atualizar', { id: eu.id, senhaHash: await gerarHash(b.nova) });
    return { token: await emitirToken(usuario) };
  },
};

export default rota({
  GET: (req, res) => despachar(req, res),
  POST: (req, res) => despachar(req, res),
});

function despachar(req, res) {
  const fn = Object.prototype.hasOwnProperty.call(acoes, req.query.acao) ? acoes[req.query.acao] : null;
  if (!fn) throw new HttpError(404, 'Rota não encontrada.');
  return fn(req, res);
}
