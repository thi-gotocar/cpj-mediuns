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
//   GET  ?lista=asaasbusca&q=&conta=             — aba ASAAS → Buscar (ver buscaAsaas)
//   POST { acao: 'asaas', op: 'ativar', ativo } · { acao: 'asaas', op: 'cancelar', id }   (root)
//        { acao: 'asaas', op: 'credito', chave: 'p:<pessoa>' | 'a:<aluno>', remover? }  — quem gera link com cartão de crédito e Pix
//        { acao: 'asaas', op: 'contatos', desde? }  — Atualizar contatos: busca de novo no ASAAS os clientes guardados (ver contatosAsaas)
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
// Os já guardados (asaas_clientes_info) não são buscados de novo: nome e CPF quase nunca mudam; o ASAAS só é lido para cliente novo.
// → Map(id → { id, nome, telefone, cpfHash, referencia }); cliente que o ASAAS não devolveu fica de fora.
const PREFIXO = { A: 'ASAAS', B: 'ASAAS2' };
const LOTE_CLIENTES = 10;
export async function clientesAsaas(conta, ids) {
  const clientes = new Map();
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return clientes;
  (await db.rpc('asaas_clientes_info_ler', { conta, ids: unicos })).forEach((c) => clientes.set(c.id, c));
  const { lidos } = await buscarClientes(conta, unicos.filter((id) => !clientes.has(id)));
  lidos.forEach((c) => clientes.set(c.id, c));
  return clientes;
}

// Busca os clientes no ASAAS, de 10 em 10, e guarda os que vieram. → { lidos, falhas: [{ id, rede }] }
// rede: o ASAAS não respondeu (502); senão, ele recusou (ex.: cliente excluído).
async function buscarClientes(conta, ids) {
  const lidos = [];
  const falhas = [];
  for (let i = 0; i < ids.length; i += LOTE_CLIENTES) {
    await Promise.all(ids.slice(i, i + LOTE_CLIENTES).map(async (id) => {
      try {
        const cli = await chamarAsaas(PREFIXO[conta], 'GET', `/customers/${encodeURIComponent(id)}`);
        const cpf = String(cli?.cpfCnpj || '').replace(/\D/g, '');
        let cpfHash = '';
        if (cpf.length === 11) { try { cpfHash = hashCpf(cpf); } catch { /* sem CPF_CHAVE: não liga por CPF */ } }
        lidos.push({ id, nome: String(cli?.name || ''), telefone: String(cli?.mobilePhone || cli?.phone || '').replace(/\D/g, ''), cpfHash, referencia: String(cli?.externalReference || '') });
      } catch (e) { falhas.push({ id, rede: e?.status === 502 }); }
    }));
  }
  if (lidos.length) await db.rpc('asaas_clientes_info_salvar', { conta, itens: lidos });
  return { lidos, falhas };
}

// Atualizar contatos (aba ASAAS → Conexão): busca de novo no ASAAS os clientes guardados das contas ligadas, os mais
// antigos primeiro. Cada pedido para em ~9 s (o limite da função é 15 s); a tela repete com o mesmo desde (a hora do
// servidor no 1º pedido) até não faltar nenhum. Cliente que o ASAAS recusa (ex.: excluído) fica com os dados que tinha
// e não volta para a fila (conta em recusados); se o ASAAS não responder, para com erro.
// → { desde, atualizados, recusados, faltam, erro? }
const LOTE_CONTATOS = 50;
const TEMPO_CONTATOS_MS = 9000;
async function contatosAsaas(b) {
  const contas = Object.keys(PREFIXO).filter((k) => process.env[PREFIXO[k] + '_API_KEY']);
  if (!contas.length) throw new HttpError(400, 'Nenhuma conta do ASAAS configurada na Vercel.');
  const desde = typeof b.desde === 'string' && !Number.isNaN(Date.parse(b.desde)) ? b.desde : new Date().toISOString();
  const inicio = Date.now();
  let atualizados = 0;
  let recusadosTotal = 0;
  let erro;
  for (const conta of contas) {
    while (!erro && Date.now() - inicio < TEMPO_CONTATOS_MS) {
      const { ids } = await db.rpc('asaas_clientes_info_pendentes', { conta, desde, limite: LOTE_CONTATOS });
      if (!ids.length) break;
      const { lidos, falhas } = await buscarClientes(conta, ids);
      atualizados += lidos.length;
      const recusados = falhas.filter((f) => !f.rede).map((f) => f.id);
      recusadosTotal += recusados.length;
      if (recusados.length) await db.rpc('asaas_clientes_info_tocar', { conta, ids: recusados });
      if (falhas.some((f) => f.rede)) erro = `O ASAAS da conta ${conta} não respondeu. Tente de novo em instantes.`;
    }
  }
  let faltam = 0;
  for (const conta of contas) faltam += (await db.rpc('asaas_clientes_info_pendentes', { conta, desde, limite: 0 })).total;
  return { desde, atualizados, recusados: recusadosTotal, faltam, ...(erro ? { erro } : {}) };
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

// ---------- Buscar (aba ASAAS → Buscar; quem vê a aba) ----------
// O tipo vem da tela (cada um é uma consulta diferente). Procura no que o app guarda (asaas_buscar: links das Compras e
// vencidas da última leitura) e, nas contas escolhidas:
//   nome      — no ASAAS, as cobranças (GET /payments?customer=) dos clientes achados no cadastro, nos clientes guardados
//               ou, sem nenhum, no próprio ASAAS (GET /customers?name=);
//   link      — a cobrança da fatura (/i/<código>) direto no ASAAS (GET /payments/pay_<código>);
//   valor, descricao — só no que o app guarda (o ASAAS não filtra por eles).
// O que veio do ASAAS vale sobre o guardado (situação mais nova); nome e celular, do cadastro quando a pessoa é ligada.
//   GET /api/oferendas?lista=asaasbusca&tipo=nome|valor|descricao|link&q=<texto>&conta=A|B|ambas
//     → { resultados: [{ id, conta, nome, telefone, status, situacao, tom, valor, vencimento, descricao, link }], avisos }
const SITUACAO = {
  pendente: ['Aguardando pagamento', 'pendente'], paga: ['Pago', 'pago'], vencida: ['Vencido', 'vencido'],
  cancelada: ['Cancelado', 'cancelado'], estornada: ['Estornado', 'cancelado'],
  PENDING: ['Aguardando pagamento', 'pendente'], RECEIVED: ['Pago', 'pago'], CONFIRMED: ['Pago (confirmado)', 'pago'],
  RECEIVED_IN_CASH: ['Pago em dinheiro', 'pago'], OVERDUE: ['Vencido', 'vencido'], REFUNDED: ['Estornado', 'cancelado'],
  REFUND_REQUESTED: ['Estorno solicitado', 'cancelado'], REFUND_IN_PROGRESS: ['Estorno em andamento', 'cancelado'],
  CHARGEBACK_REQUESTED: ['Chargeback', 'cancelado'], CHARGEBACK_DISPUTE: ['Chargeback em disputa', 'cancelado'],
  AWAITING_RISK_ANALYSIS: ['Em análise', 'pendente'], DELETED: ['Excluído', 'cancelado'],
};
const MAX_CLIENTES_BUSCA = 8;
const MAX_RESULTADOS = 60;
const escaparLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
const TIPOS_BUSCA = ['nome', 'valor', 'descricao', 'link'];
// "110", "110,50", "R$ 1.250,00" ou "1250.5" → número; senão null.
function valorDaBusca(t) {
  const s = t.replace(/^r\$\s*/i, '').trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return null;
}

export async function buscaAsaas(eu, query) {
  exigirVer(eu);
  const tipo = TIPOS_BUSCA.includes(query.tipo) ? query.tipo : 'nome';
  const texto = String(query.q || '').trim().slice(0, 300);
  const contas = query.conta === 'A' ? ['A'] : query.conta === 'B' ? ['B'] : ['A', 'B'];
  let valor = null, link = '', nome = '', descricao = '';
  if (tipo === 'valor') {
    valor = valorDaBusca(texto);
    if (valor === null || valor <= 0) throw new HttpError(400, 'Valor inválido. Ex.: 110 ou 110,50.');
  } else if (tipo === 'link') {
    if (!/^https:\/\/\S+$/i.test(texto)) throw new HttpError(400, 'Cole o link de pagamento inteiro (começa com https://).');
    link = texto;
  } else {
    if (texto.length < 2) throw new HttpError(400, 'Digite pelo menos 2 letras.');
    if (tipo === 'nome') nome = texto; else descricao = texto;
  }
  const local = await db.rpc('asaas_buscar', { contas, nome: escaparLike(nome), descricao: escaparLike(descricao), valor, link });
  const porChave = new Map(local.gente.map((g) => [g.chave, g]));
  const porHash = new Map(local.gente.filter((g) => g.hash).map((g) => [g.hash, g]));
  const res = new Map();
  const situar = (r) => { const [situacao, tom] = SITUACAO[r.status] || [r.status, 'pendente']; return { ...r, situacao, tom }; };
  for (const r of [...local.atrasos, ...local.cobrancas]) {
    const k = r.id ? `${r.conta}:${r.id}` : `local:${res.size}`;
    if (!res.has(k)) res.set(k, situar({ ...r, valor: Number(r.valor) || 0 }));
  }
  const avisos = [];
  for (const k of contas) {
    if (tipo === 'valor' || tipo === 'descricao') break;
    if (!process.env[PREFIXO[k] + '_API_KEY']) { avisos.push(`Conta ${k}: sem a chave na Vercel; só o que o app guarda.`); continue; }
    try {
      let ids = local.clientes.filter((c) => c.conta === k).map((c) => c.id);
      if (!ids.length && nome) {
        const r = await chamarAsaas(PREFIXO[k], 'GET', `/customers?name=${encodeURIComponent(nome)}&limit=${MAX_CLIENTES_BUSCA + 1}`, null, 5000);
        ids = (r?.data || []).filter((c) => !c.deleted).map((c) => c.id);
      }
      const pagamentos = [];
      const codigo = link.match(/\/i\/([A-Za-z0-9]+)/)?.[1];
      if (codigo) {
        const pg = await chamarAsaas(PREFIXO[k], 'GET', `/payments/pay_${encodeURIComponent(codigo)}`, null, 5000).catch(() => null);
        if (pg?.id && !pg.deleted) pagamentos.push(pg);
      }
      await Promise.all(ids.slice(0, MAX_CLIENTES_BUSCA).map(async (id) => {
        const r = await chamarAsaas(PREFIXO[k], 'GET', `/payments?customer=${encodeURIComponent(id)}&limit=20`, null, 6000);
        pagamentos.push(...(r?.data || []).filter((pg) => !pg.deleted));
      }));
      if (ids.length > MAX_CLIENTES_BUSCA) avisos.push(`Conta ${k}: muitos clientes com esse nome; mostrando os ${MAX_CLIENTES_BUSCA} primeiros. Digite mais do nome.`);
      const clientes = await clientesAsaas(k, pagamentos.map((pg) => pg.customer));
      for (const pg of pagamentos) {
        const cli = clientes.get(pg.customer) || {};
        const g = porChave.get(cli.referencia) || (cli.cpfHash && porHash.get(cli.cpfHash)) || null;
        const chave = `${k}:${pg.id}`;
        const ant = res.get(chave);
        res.set(chave, situar({
          id: pg.id, conta: k,
          nome: ant?.nome || g?.nome || cli.nome || 'Sem nome no ASAAS',
          telefone: ant?.telefone || g?.celular || cli.telefone || '',
          status: pg.status, valor: Number(pg.value) || 0, vencimento: pg.dueDate || null,
          descricao: String(pg.description || ant?.descricao || ''),
          link: /^https:\/\//.test(pg.invoiceUrl || '') ? pg.invoiceUrl : (ant?.link || ''),
        }));
      }
    } catch (e) {
      avisos.push(`Conta ${k}: ${e.message} Mostrando só o que o app guarda.`);
    }
  }
  const resultados = [...res.values()]
    .sort((a, b) => String(b.vencimento || '').localeCompare(String(a.vencimento || '')) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, MAX_RESULTADOS);
  return { resultados, avisos };
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
  } else if (b.op === 'contatos') {
    return { ...(await respostaRoot(eu)), contatos: await contatosAsaas(b) };
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
