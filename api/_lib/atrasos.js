// Pagamentos em atraso das duas contas do ASAAS, no bloco da aba Geral: a B (mensalidades, doações…, cobranças feitas
// no próprio ASAAS) e a A (a das Compras, cujos links o app gera). O app só lê as vencidas (status OVERDUE) e liga cada
// uma à pessoa: na conta A, pela referência do cliente que o app criou (a chave da pessoa); nas duas, pelo CPF do Perfil
// (o CPF é decifrado só aqui, em memória; nunca vai para a tela). Link da conta A que já foi trocado por outro, ou de
// item pago ou cancelado, não conta (o filtro fica em atrasos_ler).
// A leitura fica guardada em asaas2_atrasos e é refeita no máximo a cada 10 minutos, ou no Atualizar:
// o do root (e do Admin financeiro) lê sempre; o da pessoa só se a última leitura tiver mais de 1 minuto (toques repetidos
// não viram chamadas ao ASAAS). Com os clientes guardados, cada leitura é barata (1 ou 2 chamadas ao ASAAS).
// Não usa webhook: a fonte é sempre o ASAAS na hora da leitura. Os dados dos clientes (nome, telefone, hash do CPF e
// referência) ficam guardados sem prazo (asaas_clientes_info): cada leitura busca só as cobranças e os clientes novos.
// A pessoa é achada pelo hash do CPF do Perfil, sem decifrar os CPFs.
//
//   GET /api/giras?lista=atrasos[&atualizar=1]
//     → { configurado, contas: { A, B } (quais estão ligadas), root, atualizadoEm, erro?, semSenha?, verComoSemSenha?, atrasos: [...] }
//   Cada item traz a conta ('A' ou 'B'). Pessoa da corrente ou aluno: só as próprias (id, conta, valor, vencimento,
//   descricao, link), e só com a senha criada. No "Ver como" do root, a lista vem mesmo sem a senha, com verComoSemSenha
//   (a tela avisa que a pessoa ainda não vê o bloco).
//   Root: todas, com nome e telefone para o lembrete.
//
// Variáveis (só no servidor): ASAAS2_API_KEY e ASAAS2_API_URL (conta B) · ASAAS_API_KEY e ASAAS_API_URL (conta A).
// Sem a URL, usa o sandbox.

import { HttpError } from './http.js';
import { db } from './db.js';
import { chamarAsaas, clientesAsaas } from './asaas.js';
import { pessoasPorHashCpf } from './cpf.js';
import { pode } from '../../shared/permissoes.js';

const CONTAS = { A: 'ASAAS', B: 'ASAAS2' };
const VALIDADE_MS = 10 * 60 * 1000;
const INTERVALO_PESSOA_MS = 60 * 1000;
const MAX_COBRANCAS = 1000;

const ligada = (k) => !!process.env[CONTAS[k] + '_API_KEY'];
export const configuradoB = () => ligada('B');

// Lê no ASAAS as cobranças vencidas de uma conta e os clientes novos delas (os guardados não são buscados de novo);
// liga cada uma à pessoa pelo hash do CPF.
async function buscarNoAsaas(k, porHash) {
  const CONTA = CONTAS[k];
  const cobrancas = [];
  for (let offset = 0; offset < MAX_COBRANCAS; offset += 100) {
    const r = await chamarAsaas(CONTA, 'GET', `/payments?status=OVERDUE&limit=100&offset=${offset}`);
    cobrancas.push(...(r?.data || []));
    if (!r?.hasMore) break;
  }
  const clientes = await clientesAsaas(k, cobrancas.map((c) => c.customer));
  return cobrancas.map((c) => {
    const cli = clientes.get(c.customer) || {};
    // Cliente que o app criou na conta A: a referência é a chave da pessoa ('p:<id>') ou do aluno ('a:<id>').
    const ref = String(cli.referencia || '');
    const daChave = /^p:[0-9a-f-]{36}$/.test(ref) ? ref.slice(2) : null;
    const doAluno = /^a:[0-9a-f-]{36}$/.test(ref) ? ref.slice(2) : '';
    const cpfHash = cli.cpfHash || '';
    return {
      id: String(c.id),
      referencia: String(c.externalReference || ''),
      alunoId: doAluno,
      cpfHash,
      pessoaId: daChave || (cpfHash && porHash.get(cpfHash)) || null,
      nome: String(cli.nome || ''),
      telefone: String(cli.telefone || ''),
      valor: Number(c.value) || 0,
      vencimento: c.dueDate || null,
      descricao: String(c.description || ''),
      link: /^https:\/\//.test(c.invoiceUrl || '') ? c.invoiceUrl : '',
    };
  });
}

// soCache: a abertura do app (/auth/inicio) não espera o ASAAS; com a leitura vencida, devolve null e o app busca
// pela rota própria, que lê o ASAAS.
export async function atrasos(eu, atualizar, { soCache = false } = {}) {
  if (eu.grupo && eu.grupo !== 'alunos') throw new HttpError(403, 'Este acesso não tem pagamentos.');
  // Visão de todos (ADMIN FINANCEIRO): quem vê a aba ASAAS (root e Admin financeiro).
  const root = pode(eu, 'asaas:ver');
  const contas = { A: ligada('A'), B: ligada('B') };
  if (!contas.A && !contas.B) return { configurado: false, contas, root, atrasos: [] };
  // Pelo acesso da corrente ou dos alunos, só com a senha criada: sem ela, qualquer um entra com o nome de outra pessoa.
  // No "Ver como" quem olha é o root: mostra o que a pessoa veria depois de criar a senha.
  const semSenha = !root && (eu.papel === 'corrente' || eu.grupo === 'alunos') && !eu.temSenha;
  if (semSenha && !eu.verComo) return { configurado: true, contas, root, semSenha: true, atrasos: [] };
  let s = await db.rpc('atrasos_ler');
  let erro;
  const idade = s.atualizadoEm ? Date.now() - Date.parse(s.atualizadoEm) : Infinity;
  const forcar = !!atualizar && (root || idade > INTERVALO_PESSOA_MS);
  if (soCache && idade > VALIDADE_MS) return null;
  if (forcar || idade > VALIDADE_MS) {
    // Cada conta é lida e guardada sozinha: se uma falhar, a outra continua atualizada.
    const porHash = await pessoasPorHashCpf();
    const falhas = [];
    for (const k of ['B', 'A'].filter((x) => contas[x])) {
      try {
        await db.rpc('atrasos_salvar', { conta: k, itens: await buscarNoAsaas(k, porHash) });
      } catch (e) {
        console.error('[atrasos] leitura da conta', k, e.message);
        falhas.push({ k, e });
      }
    }
    if (falhas.length && forcar && root && falhas.length === Object.values(contas).filter(Boolean).length) throw falhas[0].e;
    if (falhas.length) erro = `Não foi possível consultar ${falhas.length > 1 ? 'as contas' : `a conta ${falhas[0].k}`} do ASAAS agora; mostrando a última leitura.`;
    s = await db.rpc('atrasos_ler');
  }
  const itens = root ? s.itens
    : s.itens.filter((i) => (eu.pessoaId && i.pessoaId === eu.pessoaId) || (eu.alunoId && i.alunoId === eu.alunoId))
      .map(({ id, conta, valor, vencimento, descricao, link }) => ({ id, conta, valor, vencimento, descricao, link }));
  return { configurado: true, contas, root, atualizadoEm: s.atualizadoEm, ...(erro ? { erro } : {}), ...(semSenha ? { verComoSemSenha: true } : {}), atrasos: itens };
}
