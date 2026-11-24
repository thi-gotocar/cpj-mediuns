// GET  /api/usuarios               lista quem tem acesso
// GET  /api/usuarios?lista=perfis   perfis e o que cada um vê/edita por aba
// GET  /api/usuarios?lista=senhas   pessoas da corrente e se têm senha (PIN)
// GET  /api/usuarios?lista=tudo     { usuarios, perfis, senhas } numa chamada só (abertura da aba Admin root)
// GET  /api/usuarios?lista=versoes  versão do app de quem abriu nos últimos 30 dias e a exigida: { exigida, pessoas: [{ chave, nome, versao, vistoEm }] }
//      POST { acao: 'versaoExigir', versao } exige essa versão ('' para de exigir): app em outra versão atualiza na hora
// GET  /api/usuarios?lista=visitas  quem entrou em cada aba nos últimos 3 dias: [{ chave, aba, dia, nome, grupo, vezes, ultima }]
// POST /api/usuarios   { email, senha, papel, pessoaId }  (root: { nome } no lugar de pessoaId)
//                      { acao: 'perfil', chave?, nome, abas }  cria ou edita um perfil → perfis
//                      { acao: 'excluirPerfil', chave }        → perfis
//                      { acao: 'pin', pessoaId, senha | limpar: true }  troca ou limpa a senha (PIN) de uma pessoa → senhas
//                      { acao: 'pinAluno', alunoId, senha }    troca a senha de um aluno
//                      { acao: 'config', config }              Configurações da casa (shared/config.js) → config completa
//                      { acao: 'regras', regras }              Regras da casa (shared/config.js REGRAS_PADRAO) → config completa
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { gerarHash, SENHA_MINIMA } from '../_lib/senhas.js';
import { papelValido } from '../_lib/perfis.js';
import { SEM_CADASTRO, PERFIS_SISTEMA, PIN_NOVO, PIN_NOVO_MSG, normalizarAbas } from '../../shared/permissoes.js';
import { CAMPOS_CONFIG, configCasa, LIMITES_REGRAS, SEGUNDO_CAMBONE } from '../../shared/config.js';
import { versaoValida, guardarExigida } from '../_lib/versao.js';

// Senha que o root define (6 a 8 números) ou '' para limpar.
async function hashPinNovo(b) {
  if (b.limpar === true) return '';
  const senha = String(b.senha ?? '');
  if (!PIN_NOVO.test(senha)) throw new HttpError(400, PIN_NOVO_MSG);
  return gerarHash(senha);
}

const semVersao = (lista) => lista.map(({ sessaoVersao, abas, ...u }) => u);

// Só os campos conhecidos; vazio não é guardado (vale o padrão).
function validarConfig(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new HttpError(400, 'Configurações inválidas.');
  const r = {};
  for (const [k, rotulo, max] of CAMPOS_CONFIG) {
    const v = String(c[k] ?? '').replace(/\s+/g, ' ').trim();
    if (v.length > max) throw new HttpError(400, `${rotulo}: até ${max} letras.`);
    if (v) r[k] = v;
  }
  return r;
}

// Regras da casa: cada campo dentro do limite. Não deixa ter menos turmas da limpeza do que as que já têm gente.
async function validarRegras(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new HttpError(400, 'Regras inválidas.');
  const inteiro = (k, rotulo) => {
    const n = Number(r[k]);
    const [min, max] = LIMITES_REGRAS[k];
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${rotulo}: de ${min} a ${max}.`);
    return n;
  };
  const suporteMinimo = inteiro('suporteMinimo', 'Mínimo no Suporte');
  const suporteMaximo = inteiro('suporteMaximo', 'Máximo no Suporte');
  if (suporteMaximo && suporteMaximo < suporteMinimo) throw new HttpError(400, 'O máximo no Suporte não pode ser menor que o mínimo.');
  const turmasLimpeza = inteiro('turmasLimpeza', 'Turmas da limpeza');
  if (!SEGUNDO_CAMBONE.some(([k]) => k === r.segundoCambone)) throw new HttpError(400, 'Escolha quem recebe o 2º cambone.');
  const maior = Math.max(0, ...(await db.rpc('pessoas_listar')).map((p) => Number(p.limpeza) || 0));
  if (turmasLimpeza < maior) throw new HttpError(400, `Há gente na turma ${maior} da limpeza. Mude a turma dessas pessoas antes de diminuir.`);
  return { suporteMinimo, suporteMaximo, segundoCambone: r.segundoCambone, turmasLimpeza };
}

async function acaoPerfil(b) {
  if (b.acao === 'excluirPerfil') {
    if (PERFIS_SISTEMA.includes(b.chave)) throw new HttpError(400, 'Esse perfil já vem com o app e não pode ser excluído.');
    return db.rpc('perfil_config_excluir', { chave: String(b.chave || '') });
  }
  const p = {};
  if (b.chave) {
    if (b.chave === 'root') throw new HttpError(400, 'O Admin root sempre pode tudo.');
    p.chave = String(b.chave);
  }
  if ('nome' in b || !b.chave) {
    const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 40) throw new HttpError(400, 'Informe o nome do perfil (até 40 letras).');
    if (b.chave === 'corrente') throw new HttpError(400, 'O nome do acesso da corrente não muda.');
    p.nome = nome;
  }
  if ('abas' in b || !b.chave) p.abas = normalizarAbas(b.abas);
  return db.rpc('perfil_config_salvar', p);
}

export default rota({
  GET: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    if (req.query.lista === 'tudo') {
      const [usuarios, perfis, senhas] = await Promise.all([db.rpc('usuarios_listar'), db.rpc('perfis_config'), db.rpc('senhas_listar')]);
      return { usuarios: semVersao(usuarios), perfis, senhas };
    }
    if (req.query.lista === 'visitas') return db.rpc('visitas_listar');
    if (req.query.lista === 'versoes') return db.rpc('app_versoes_listar');
    if (req.query.lista === 'perfis') return db.rpc('perfis_config');
    if (req.query.lista === 'senhas') return db.rpc('senhas_listar');
    return semVersao(await db.rpc('usuarios_listar'));
  },
  POST: async (req) => {
    await exigir(req, 'usuarios:gerenciar');
    const b = corpo(req);
    if (b.acao === 'perfil' || b.acao === 'excluirPerfil') return acaoPerfil(b);
    // Forçar atualização: exige a versão do aparelho do root ('' para de exigir).
    if (b.acao === 'versaoExigir') {
      const versao = String(b.versao ?? '').trim();
      if (!versaoValida(versao)) throw new HttpError(400, 'Versão inválida.');
      const r = await db.rpc('app_versao_exigir', { versao });
      guardarExigida(versao);
      return r;
    }
    if (b.acao === 'config') return configCasa(await db.rpc('config_casa_salvar', { config: validarConfig(b.config) }));
    if (b.acao === 'regras') return configCasa(await db.rpc('regras_casa_salvar', { regras: await validarRegras(b.regras) }));
    // limpar: apaga a senha (as sessões abertas caem); a pessoa cria outra ao entrar (e-mail, celular ou CPF,
    // confirmando o celular ou o e-mail do cadastro).
    if (b.acao === 'pinAluno') {
      return db.rpc('aluno_pin_definir', { alunoId: validarId(b.alunoId, 'Aluno'), pinHash: await hashPinNovo(b) });
    }
    if (b.acao === 'pin') {
      await db.rpc('pin_definir', { pessoaId: validarId(b.pessoaId, 'Pessoa'), pinHash: await hashPinNovo(b) });
      return db.rpc('senhas_listar');
    }
    const email = String(b.email || '').trim().toLowerCase();
    const senha = String(b.senha || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (senha.length < SENHA_MINIMA || senha.length > 200) throw new HttpError(400, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
    if (!(await papelValido(b.papel))) throw new HttpError(400, 'Perfil inválido.');
    let nome, pessoaId = null;
    if (SEM_CADASTRO.includes(b.papel) && !b.pessoaId) {
      nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o nome.');
    } else {
      // O usuário é uma pessoa da corrente: o nome é sempre o do cadastro.
      if (!b.pessoaId) throw new HttpError(400, 'Escolha a pessoa da corrente.');
      const id = validarId(b.pessoaId, 'Pessoa');
      const pessoa = (await db.rpc('pessoas_listar', { id })).find((p) => p.id === id);
      if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
      nome = pessoa.nome;
      pessoaId = pessoa.id;
    }
    await db.rpc('usuario_criar', { email, nome, papel: b.papel, pessoaId, senhaHash: await gerarHash(senha) });
    return semVersao(await db.rpc('usuarios_listar'));
  },
});
