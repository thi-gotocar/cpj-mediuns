// Integração com o ASAAS: Pix dos pedidos da aba Compras.
//
// O navegador nunca fala com o ASAAS e nunca diz o valor: ele pede "pagar o pedido nº N" e o backend
// soma as linhas da própria pessoa (da sessão) que ainda não estão pagas, cria a cobrança e devolve o QR.
// Só o webhook marca como pago, e só depois de conferir no ASAAS (GET /payments/:id) o status e o valor.
//
// Rotas (todas em api/oferendas, para não criar função nova):
//   POST ?webhook=asaas                          — o ASAAS avisa (token no cabeçalho asaas-access-token)
//   POST { acao: 'guias', op: 'pix', pedido, cpf? } — a pessoa gera o Pix do que pediu (cpf só na 1ª vez)
//   GET  ?lista=asaas                            — aba ASAAS (root e quem tem a aba no perfil): situação, cobranças e eventos recebidos
//   POST { acao: 'asaas', op: 'ativar', ativo } · { acao: 'asaas', op: 'cancelar', id }   (root)
//        { acao: 'asaas', op: 'credito', chave: 'p:<pessoa>' | 'a:<aluno>', remover? }  — quem gera link com cartão de crédito e Pix
// Quem está nessa lista gera, na conta A, a cobrança com a forma "cliente escolhe" (UNDEFINED): Pix ou cartão na fatura.
//
// Variáveis (só no servidor): ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_API_URL (sem ela, usa o sandbox).
// Item de doação (caixinha no item, v142): cobrado na conta B (ASAAS2_API_KEY, ASAAS2_API_URL), com o webhook dela em
// POST ?webhook=asaas2 e o token ASAAS2_WEBHOOK_TOKEN. Um pedido com venda e doação vira uma cobrança em cada conta.
import { HttpError, corpo, validarId, hojeBR } from './http.js';
import { db } from './db.js';
import { iguaisSeguro } from './senhas.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { cpfValido, cpfMascarado } from '../../shared/perfil.js';
import { hashCpf, decifrar } from './cpf.js';

const SANDBOX = 'https://api-sandbox.asaas.com/v3';
// prefixo = 'ASAAS' (conta A, Compras) ou 'ASAAS2' (conta B, pagamentos em atraso: api/_lib/atrasos.js).
const urlDe = (prefixo) => (process.env[prefixo + '_API_URL'] || SANDBOX).replace(/\/+$/, '');
const urlApi = () => urlDe('ASAAS');
export const configurado = () => !!(process.env.ASAAS_API_KEY && process.env.ASAAS_WEBHOOK_TOKEN);
// Conta B pronta para o Pix das doações: chave e token do webhook dela.
export const configuradoB = () => !!(process.env.ASAAS2_API_KEY && process.env.ASAAS2_WEBHOOK_TOKEN);
const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

// Chamada à API do ASAAS. Erro do ASAAS vira mensagem para a tela; falha de rede, 502.
export async function chamarAsaas(prefixo, metodo, caminho, dados, ms = 8000) {
  let r;
  try {
    r = await fetch(urlDe(prefixo) + caminho, {
      method: metodo,
      headers: { access_token: process.env[prefixo + '_API_KEY'], 'Content-Type': 'application/json', 'User-Agent': 'cpj-mediuns' },
      body: dados ? JSON.stringify(dados) : undefined,
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    throw new HttpError(502, 'O ASAAS não respondeu. Tente de novo em instantes.');
  }
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = json?.errors?.map((e) => e.description).filter(Boolean).join(' ');
    console.error('[' + prefixo.toLowerCase() + ']', metodo, caminho, r.status, msg || '');
    throw new HttpError(r.status >= 500 ? 502 : 400, msg ? 'ASAAS: ' + msg : 'O ASAAS recusou o pedido.');
  }
  return json;
}

// Leitura do ASAAS 1 vez por dia, a partir das 9h de Brasília (usada pela Transparência). A leitura guardada vale enquanto
// for posterior ao último "9h" (antes das 9h, o de ontem). O root e o Admin financeiro podem consultar de novo na hora.
// O Pgto atrasado lê a cada 10 minutos e as Compras recebem o Pix na hora pelo webhook.
export const HORA_LEITURA = 9;
export function corteDiario(agora = new Date()) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  const corte = new Date(`${hoje}T${String(HORA_LEITURA).padStart(2, '0')}:00:00-03:00`);
  return agora >= corte ? corte : new Date(corte.getTime() - 24 * 60 * 60 * 1000);
}
export const leituraDoDia = (atualizadoEm) => !!atualizadoEm && Date.parse(atualizadoEm) >= corteDiario().getTime();

// Clientes de uma conta ('A' = ASAAS, 'B' = ASAAS2): nome, telefone, hash do CPF (o CPF aberto não é guardado) e referência.
// Os guardados há menos de 7 dias (asaas_clientes_info) não são buscados de novo, a não ser com renovar.
// → Map(id → { id, nome, telefone, cpfHash, referencia }); cliente que o ASAAS não devolveu fica de fora.
const PREFIXO = { A: 'ASAAS', B: 'ASAAS2' };
const LOTE_CLIENTES = 10;
export async function clientesAsaas(conta, ids, renovar = false) {
  const clientes = new Map();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return clientes;
  if (!renovar) (await db.rpc('asaas_clientes_info_ler', { conta, ids: unicos })).forEach((c) => clientes.set(c.id, c));
  const novos = [];
  const faltam = unicos.filter((id) => !clientes.has(id));
  for (let i = 0; i < faltam.length; i += LOTE_CLIENTES) {
    await Promise.all(faltam.slice(i, i + LOTE_CLIENTES).map(async (id) => {
      try {
        const cli = await chamarAsaas(PREFIXO[conta], 'GET', `/customers/${encodeURIComponent(id)}`);
        const cpf = String(cli?.cpfCnpj || '').replace(/\D/g, '');
        let cpfHash = '';
        if (cpf.length === 11) { try { cpfHash = hashCpf(cpf); } catch { /* sem CPF_CHAVE: não liga por CPF */ } }
        const info = { id, nome: String(cli?.name || ''), telefone: String(cli?.mobilePhone || cli?.phone || '').replace(/\D/g, ''), cpfHash, referencia: String(cli?.externalReference || '') };
        clientes.set(id, info);
        novos.push(info);
      } catch { /* fica sem nome/CPF */ }
    }));
  }
  if (novos.length) await db.rpc('asaas_clientes_info_salvar', { conta, itens: novos });
  return clientes;
}

// ---------- pessoa: gerar o Pix ----------
export const pixLigado = async () => configurado() && !!(await db.rpc('asaas_ativo'));

// O que a tela Compras recebe de Pix: se está ligado, se precisa do CPF e as cobranças da pessoa.
// pixDe monta a partir do que o banco já devolveu (ativo + asaas_minhas); pixDaPessoa busca numa ida só.
export const pixDe = (ativo, minhas) => (configurado() && ativo
  ? { pix: true, pixPrecisaCpf: !minhas.cliente, cobrancas: minhas.cobrancas.map((c) => ({ ...c, valor: Number(c.valor) })) }
  : { pix: false });
export async function pixDaPessoa(eu) {
  if (!configurado()) return { pix: false };
  const r = await db.rpc('asaas_pessoa', { chave: chavePessoa(eu) });
  return pixDe(r.ativo, r.minhas);
}

// Antes de pedir com o Pix ligado: sem cliente no ASAAS, o CPF tem de vir válido (senão nem faz o pedido).
// Devolve se o Pix está ligado.
export async function pixAntesDePedir(eu, cpf) {
  if (!(await pixLigado())) return false;
  if (!(await db.rpc('asaas_minhas', { chave: chavePessoa(eu) })).cliente && !cpfValido(cpf)) {
    throw new HttpError(400, 'Informe um CPF válido para gerar o link de pagamento.');
  }
  return true;
}

function amanhaBR() {
  const [y, m, d] = hojeBR().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// CPF para criar o cliente numa conta: o digitado; senão, o do Perfil (pessoa ou aluno); senão, o do cliente que a
// pessoa já tem na outra conta (o ASAAS devolve). Nada disso é guardado: o app guarda só o id do cliente.
async function cpfParaCliente(eu, chave, b, outra) {
  const digitado = cpfValido(b.cpf);
  if (digitado) return digitado;
  try {
    if (eu.alunoId) {
      const cifrado = await db.rpc('aluno_cpf_ler', { id: eu.alunoId });
      if (cifrado) return decifrar(cifrado, eu.alunoId);
    } else if (eu.pessoaId) {
      const linha = await db.rpc('cpf_ler', { pessoaId: eu.pessoaId });
      if (linha?.cifrado) return decifrar(linha.cifrado, eu.pessoaId);
    }
  } catch { /* sem a CPF_CHAVE: tenta o cliente da outra conta */ }
  if (outra?.cliente) {
    const cli = await chamarAsaas(PREFIXO[outra.conta], 'GET', `/customers/${encodeURIComponent(outra.cliente)}`).catch(() => null);
    const cpf = cpfValido(cli?.cpfCnpj);
    if (cpf) return cpf;
  }
  return null;
}

export async function gerarPix(eu, b) {
  if (!(await pixLigado())) throw new HttpError(403, 'O pagamento por Pix não está disponível no momento.');
  const pedido = Number(b.pedido);
  if (!Number.isInteger(pedido) || pedido < 1) throw new HttpError(400, 'Pedido inválido.');
  const chave = chavePessoa(eu);
  // Reserva que ficou parada de uma tentativa anterior: resolve antes, para não gerar um segundo link.
  const achados = await conferirReservas(chave, true);
  // Contas com algo a pagar neste pedido (A: vendas; B: doações). Sem nada, a reserva da conta A dá a mensagem certa.
  let contas = await db.rpc('asaas_contas_a_pagar', { chave, pedido });
  if (!contas.length) {
    if (achados.includes(pedido)) return;
    contas = ['A'];
  }
  if (contas.includes('B') && !configuradoB()) throw new HttpError(400, 'O Pix das doações (conta B do ASAAS) ainda não está configurado. Fale com a administração.');
  for (const conta of contas.sort()) await gerarNaConta(eu, chave, pedido, conta, b);
}

async function gerarNaConta(eu, chave, pedido, conta, b) {
  const pref = PREFIXO[conta];
  const minhas = await db.rpc('asaas_minhas', { chave });
  // Cadastrado na aba ASAAS: Pix ou cartão de crédito (só nas Compras; doação é sempre Pix).
  const forma = conta === 'A' && minhas.credito ? 'UNDEFINED' : 'PIX';
  let cliente = conta === 'B' ? minhas.clienteB : minhas.cliente;
  if (!cliente) {
    const outra = conta === 'B' ? { conta: 'A', cliente: minhas.cliente } : { conta: 'B', cliente: minhas.clienteB };
    const cpf = await cpfParaCliente(eu, chave, b, outra);
    if (!cpf) throw new HttpError(400, 'Informe um CPF válido para gerar o Pix.');
    cliente = (await chamarAsaas(pref, 'POST', '/customers', { name: eu.nome, cpfCnpj: cpf, externalReference: chave, notificationDisabled: true })).id;
    await db.rpc('asaas_cliente_salvar', { chave, conta, clienteId: cliente });
  }
  // Reserva as linhas não pagas da pessoa neste pedido e nesta conta (o valor sai do banco, nunca do navegador).
  const c = await db.rpc('asaas_cobranca_reservar', { chave, nome: eu.nome, pedido, conta });
  let pg;
  try {
    pg = await chamarAsaas(pref, 'POST', '/payments', {
      customer: cliente, billingType: forma, value: Number(c.valor), dueDate: amanhaBR(),
      description: `CPJ · ${conta === 'B' ? 'Doação' : 'Compras'} · pedido nº ${pedido}`, externalReference: c.id,
    });
  } catch (e) {
    // Sem resposta (ou erro 5xx): o ASAAS pode ter criado a cobrança mesmo assim. Apagar a reserva deixaria a pessoa
    // gerar um segundo link e a primeira cobrança ficaria solta no ASAAS. Procura agora; se ainda não está lá,
    // a reserva fica e é conferida de novo na próxima tentativa ou abertura da aba.
    if (e instanceof HttpError && e.status === 502) {
      const achada = await buscarPelaReserva(c.id, conta).catch(() => null);
      if (achada) { await gravarCobranca(c.id, achada, conta); return; }
      throw new HttpError(502, 'O ASAAS está demorando para responder. Aguarde uns segundos e toque em Gerar link de novo (não vai sair um link repetido).');
    }
    await db.rpc('asaas_cobranca_desfazer', { id: c.id }).catch(() => {});
    throw e;
  }
  await gravarCobranca(c.id, pg, conta);
}

async function gravarCobranca(id, pg, conta = 'A') {
  let qr = null;
  try { qr = await chamarAsaas(PREFIXO[conta], 'GET', `/payments/${encodeURIComponent(pg.id)}/pixQrCode`, null, 4000); } catch { /* o QR pode vir depois: a tela mostra o link */ }
  await db.rpc('asaas_cobranca_criada', {
    id, asaasId: pg.id, link: pg.invoiceUrl || null,
    payload: qr?.payload || null, imagem: qr?.encodedImage || null, vencimento: pg.dueDate || null, forma: pg.billingType || 'PIX',
  });
}

// A cobrança que o ASAAS criou para a reserva (externalReference = id da reserva), ou null.
async function buscarPelaReserva(id, conta = 'A') {
  const r = await chamarAsaas(PREFIXO[conta], 'GET', `/payments?externalReference=${encodeURIComponent(id)}`, null, 5000);
  return (r?.data || []).find((x) => x.externalReference === id && !x.deleted) || null;
}

// Reservas 'criando' da pessoa com mais de 20 s (nenhum pedido em andamento passa de 15 s, o limite da função):
// achou no ASAAS, grava o link; não achou, desfaz (as linhas ficam livres para gerar o link).
// estrito: com o ASAAS fora, recusa (gerar agora poderia repetir o link); sem estrito (ao abrir a aba), só deixa para depois.
// Devolve os pedidos cujo link foi achado no ASAAS.
export async function conferirReservas(chave, estrito = false) {
  const achados = [];
  for (const { id, pedido, conta } of await db.rpc('asaas_reservas_paradas', { chave })) {
    let achada;
    try { achada = await buscarPelaReserva(id, conta); } catch (e) {
      if (estrito) throw new HttpError(502, 'O ASAAS não respondeu para conferir o link anterior. Tente de novo em instantes.');
      console.error('[asaas] conferir reserva', id, e?.message || e);
      continue;
    }
    if (achada) { await gravarCobranca(id, achada, conta); achados.push(pedido); } else await db.rpc('asaas_cobranca_desfazer', { id });
  }
  return achados;
}

// ---------- webhook ----------
// conta 'A' (POST ?webhook=asaas, ASAAS_WEBHOOK_TOKEN) ou 'B' (POST ?webhook=asaas2, ASAAS2_WEBHOOK_TOKEN: Pix das doações).
export async function webhookAsaas(req, conta = 'A') {
  const pref = PREFIXO[conta];
  const esperado = process.env[pref + '_WEBHOOK_TOKEN'];
  if (!esperado) throw new HttpError(503, 'Webhook do ASAAS não configurado.');
  const recebido = req.headers['asaas-access-token'];
  if (typeof recebido !== 'string' || !iguaisSeguro(recebido, esperado)) throw new HttpError(401, 'Token inválido.');
  const b = corpo(req);
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  const evento = typeof b.event === 'string' ? b.event.trim() : '';
  if (!id || !evento || id.length > 100 || evento.length > 100) throw new HttpError(400, 'Evento inválido.');
  const paymentId = typeof b.payment?.id === 'string' ? b.payment.id : null;
  const referencia = typeof b.payment?.externalReference === 'string' ? b.payment.externalReference : null;
  const p = { id, evento, dados: b, paymentId, referencia };
  // Pagamento: confere direto no ASAAS antes de liberar. Se o ASAAS não responder, devolve erro
  // e o evento não é gravado, para o ASAAS reenviar depois.
  if (paymentId && (evento === 'PAYMENT_RECEIVED' || evento === 'PAYMENT_CONFIRMED') && process.env[pref + '_API_KEY']) {
    const real = await chamarAsaas(pref, 'GET', `/payments/${encodeURIComponent(paymentId)}`, null, 5000);
    p.conferido = { status: real.status, valor: Number(real.value) };
  }
  await db.rpc('asaas_evento_processar', p);
  return { ok: true };
}

// ---------- aba ASAAS (root e quem tem a aba no perfil, como o Admin financeiro) ----------
// Ver: a situação, as cobranças e o retorno. Editar: ligar o Pix e cancelar links.
function exigirVer(eu) {
  if (!pode(eu, 'asaas:ver')) throw new HttpError(403, 'Seu perfil não tem a aba ASAAS.');
}
function exigirEditar(eu) {
  if (!pode(eu, 'asaas:editar')) throw new HttpError(403, 'Seu perfil só pode olhar a aba ASAAS.');
}

// CPF de quem está na lista do cartão: só o final (o cifrado não sai da API). Sem a CPF_CHAVE, fica sem.
function mascarar(k) {
  const { cifrado, ...resto } = k;
  let cpf = '';
  if (cifrado) { try { cpf = cpfMascarado(decifrar(cifrado, k.chave.slice(2))); } catch { cpf = 'guardado'; } }
  return { ...resto, cpf };
}
async function respostaRoot(eu) {
  const e = await db.rpc('asaas_estado');
  return {
    ...e,
    credito: e.credito.map(mascarar),
    // A lista para escolher só vai para quem pode mexer nela.
    candidatos: pode(eu, 'asaas:editar') ? e.candidatos : [],
    cobrancas: e.cobrancas.map((c) => ({ ...c, valor: Number(c.valor) })),
    config: {
      chave: !!process.env.ASAAS_API_KEY,
      token: !!process.env.ASAAS_WEBHOOK_TOKEN,
      // Conta B: o Pix dos itens de doação.
      chaveB: !!process.env.ASAAS2_API_KEY,
      tokenB: !!process.env.ASAAS2_WEBHOOK_TOKEN,
      // Só a URL de produção do ASAAS é produção; qualquer outra (sandbox, teste) não é.
      ambiente: urlApi().startsWith('https://api.asaas.com/') ? 'Produção' : 'Sandbox (testes)',
    },
  };
}

export async function respostaAsaas(eu) {
  exigirVer(eu);
  return respostaRoot(eu);
}

export async function acaoAsaas(eu, b) {
  exigirEditar(eu);
  if (b.op === 'ativar') {
    if (typeof b.ativo !== 'boolean') throw new HttpError(400, 'Informe se o Pix fica ligado.');
    if (b.ativo && !configurado()) throw new HttpError(400, 'Configure ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN na Vercel antes de ligar.');
    await db.rpc('asaas_ativar', { ativo: b.ativo });
  } else if (b.op === 'credito') {
    const chave = String(b.chave || '');
    if (!/^[pa]:/.test(chave)) throw new HttpError(400, 'Escolha a pessoa.');
    validarId(chave.slice(2), 'Pessoa');
    await db.rpc('asaas_credito_salvar', b.remover === true ? { chave, remover: true } : { chave, por: eu.nome || '' });
  } else if (b.op === 'cancelar') {
    const id = validarId(b.id, 'Cobrança');
    const c = await db.rpc('asaas_cobranca', { id });
    if (!c) throw new HttpError(404, 'Cobrança não encontrada.');
    if (c.status !== 'pendente') throw new HttpError(400, 'Só dá para cancelar cobrança pendente.');
    if (c.asaasId) await chamarAsaas(PREFIXO[c.conta || 'A'], 'DELETE', `/payments/${encodeURIComponent(c.asaasId)}`);
    await db.rpc('asaas_cobranca_cancelar', { id });
  } else {
    throw new HttpError(400, 'Ação inválida.');
  }
  return respostaRoot(eu);
}
