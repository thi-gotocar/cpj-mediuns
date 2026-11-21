// Painel da Transparência (aba Transparência): débitos, créditos e saldo da casa, mês a mês.
//   Configuração (só o root, bloco ADMIN ROOT): visível para a corrente, mês de início e saldo inicial, valor da
//     mensalidade, descrição das doações e os campos de débito e de crédito (os nomes das linhas digitadas).
//   Valores do mês (root e quem edita a aba): um valor por campo e o aporte da Mãe Vê; o mês sem lançamento herda o
//     último anterior.
//   Da conta B do ASAAS (ASAAS2_*):
//     mensalidades = cobranças com o valor da mensalidade e vencimento no mês; pagas = recebidas/confirmadas;
//                    em aberto = pendentes ou vencidas;
//     doações das giras = cobranças com a descrição das doações (a que o ASAAS põe no Pix recebido), pagas no mês.
//   A leitura do ASAAS fica guardada por mês (transparencia_asaas) e é refeita sozinha no máximo 1 vez por dia, ou no
//   "Puxar dados do ASAAS" (root e Admin financeiro). O saldo soma, desde o mês de início, créditos + aporte − débitos de cada mês.
//
//   GET  /api/giras?lista=transparencia&mes=AAAA-MM[&atualizar=1 (root e Admin financeiro)]
//   POST /api/giras { acao: 'transparencia', op: 'mes', mes, debitos: [{ nome, valor }], creditos: [{ nome, valor }], aporte,
//                     config?: { inicio, saldoInicial, valorMensalidade, descricaoDoacao, campos: { debitos, creditos } }, renomes? }
//                   · { op: 'publicar', publicada } · { op: 'config', valorMensalidade?, descricaoDoacao?, pagadoresAporte?, ... }
//                   (config, renomes, publicar e o op 'config': só o root; só os campos que vierem mudam)
// Quem vê: quem tem a aba no perfil (Ver ou Editar) sempre; a corrente (não alunos nem curimba) quando está visível.
// Os nomes das mensalidades e das doações só vão para o root e o Admin financeiro (quem vê a aba ASAAS).

import { HttpError } from './http.js';
import { db } from './db.js';
import { chamarAsaas, clientesAsaas, leituraDoDia } from './asaas.js';
import { pessoasPorHashCpf } from './cpf.js';
import { pode } from '../../shared/permissoes.js';

const CONTA = 'ASAAS2';
const PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const ABERTO = ['PENDING', 'OVERDUE'];
const MAX_PAGINAS = 20;
const MAX_MESES_POR_PEDIDO = 3;   // meses lidos num pedido só (o limite de tempo da Vercel é 15 s)
// Formato da leitura guardada: mudou o que se guarda (ex.: a ligação por CPF, a lista de doações), sobe o número e a
// leitura antiga é refeita na próxima abertura, sem esperar o dia.
const FORMATO = 3;
const MAX_CAMPOS = 30;
const DEBITOS_PADRAO = [
  { nome: 'Aluguel', valor: 7131.59 },
  { nome: 'Contador', valor: 350 },
  { nome: 'Luz', valor: 45 },
  { nome: 'Água', valor: 180 },
  { nome: 'Velas (mês)', valor: 480 },
];
const PADRAO = {
  publicada: false, inicio: '', saldoInicial: 0, valorMensalidade: 110,
  descricaoDoacao: 'Cobrança gerada automaticamente a partir de Pix recebido.',
  // Doações destes pagadores (nome do cliente no ASAAS) entram como Aporte Mãe Vê, não como doação.
  pagadoresAporte: ['Aurora Artigos Religiosos E Treinamentos Ltda'],
  campos: { debitos: DEBITOS_PADRAO.map((d) => d.nome), creditos: [] },
};

const ligada = () => !!process.env[CONTA + '_API_KEY'];
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const mesAtual = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const somarMes = (m, n) => {
  const [a, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(a, mm - 1 + n, 1)).toISOString().slice(0, 7);
};
const ultimoDia = (m) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10); };
const centavos = (v) => Math.round(Number(v || 0) * 100);
const reais = (c) => c / 100;
// Comparação da descrição sem acento, maiúscula, espaços repetidos nem pontuação no fim.
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!;,]+$/, '').trim();

function configDe(E) {
  const c = { ...PADRAO, ...E.config };
  const lista = (x, padrao) => (Array.isArray(x) ? x.filter((n) => typeof n === 'string' && n.trim()) : padrao);
  c.campos = { debitos: lista(c.campos?.debitos, PADRAO.campos.debitos), creditos: lista(c.campos?.creditos, []) };
  c.pagadoresAporte = lista(c.pagadoresAporte, PADRAO.pagadoresAporte);
  return c;
}

// Lista paginada de cobranças da conta B com os filtros dados (datas entre colchetes vão codificadas).
async function cobrancas(filtros) {
  const q = Object.entries(filtros).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const lista = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await chamarAsaas(CONTA, 'GET', `/payments?${q}&limit=100&offset=${pagina * 100}`);
    lista.push(...(r?.data || []));
    if (!r?.hasMore) break;
  }
  return lista;
}

// Lê um mês no ASAAS: mensalidades (pelo vencimento) e doações (pela data do pagamento), com o nome de cada cliente.
// Doação de um dos pagadores do aporte (config) vai para o aporte da Mãe Vê. Os clientes vêm dos guardados (só os novos
// são buscados no ASAAS) e a pessoa da corrente, pelo hash do CPF do Perfil (porHash), sem decifrar.
async function lerMes(mes, cfg, porHash) {
  const ini = mes + '-01', fim = ultimoDia(mes);
  const [porVencimento, porPagamento] = await Promise.all([
    cobrancas({ 'dueDate[ge]': ini, 'dueDate[le]': fim }),
    cobrancas({ 'paymentDate[ge]': ini, 'paymentDate[le]': fim }),
  ]);
  const desc = normalizar(cfg.descricaoDoacao);
  const ehDoacao = (c) => !!desc && normalizar(c.description).includes(desc);
  const alvo = centavos(cfg.valorMensalidade);
  const mens = porVencimento.filter((c) => !ehDoacao(c) && centavos(c.value) === alvo && (PAGO.includes(c.status) || ABERTO.includes(c.status)));
  const recebidas = porPagamento.filter((c) => ehDoacao(c) && PAGO.includes(c.status));
  const clientes = await clientesAsaas('B', [...mens, ...recebidas].map((c) => c.customer));
  const nomes = new Map([...clientes].map(([id, c]) => [id, c.nome]));
  const pessoaDe = (c) => { const h = clientes.get(c.customer)?.cpfHash; return (h && porHash.get(h)) || null; };
  const pagas = mens.filter((c) => PAGO.includes(c.status));
  const doAporte = new Set(cfg.pagadoresAporte.map(normalizar));
  const ehAporte = (c) => doAporte.has(normalizar(nomes.get(c.customer)));
  const doacoes = recebidas.filter((c) => !ehAporte(c));
  const aporte = recebidas.filter(ehAporte);
  const resumo = (l) => ({
    quantidade: l.length,
    total: reais(l.reduce((s2, c) => s2 + centavos(c.value), 0)),
    lista: l.map((c) => ({ nome: nomes.get(c.customer) || 'Sem nome no ASAAS', valor: Number(c.value) || 0, pagoEm: c.paymentDate || null }))
      .sort((a, b) => String(b.pagoEm || '').localeCompare(String(a.pagoEm || '')) || a.nome.localeCompare(b.nome, 'pt-BR')),
  });
  return {
    valorMensalidade: reais(alvo),
    descricaoDoacao: cfg.descricaoDoacao,
    pagadoresAporte: cfg.pagadoresAporte,
    formato: FORMATO,
    ligadoPorCpf: true,
    mensalidades: {
      pagas: pagas.length,
      abertas: mens.length - pagas.length,
      totalPago: reais(pagas.reduce((s, c) => s + centavos(c.value), 0)),
      lista: mens.map((c) => ({ nome: nomes.get(c.customer) || 'Sem nome no ASAAS', pessoaId: pessoaDe(c), valor: Number(c.value) || 0,
        pago: PAGO.includes(c.status), vencida: c.status === 'OVERDUE', vencimento: c.dueDate || null, pagoEm: c.paymentDate || null }))
        .sort((a, b) => Number(a.pago) - Number(b.pago) || a.nome.localeCompare(b.nome, 'pt-BR')),
    },
    doacoes: resumo(doacoes),
    aporte: resumo(aporte),
  };
}

// A leitura guardada vale até as 9h do dia seguinte (1 leitura por dia; corteDiario em asaas.js), só no formato atual e para
// o mesmo valor de mensalidade, descrição de doação e pagadores do aporte. O Puxar (root e Admin financeiro) lê na hora.
const listaIgual = (a, b) => (a || []).map(normalizar).sort().join('|') === (b || []).map(normalizar).sort().join('|');
const fresca = (linha, cfg) => linha && linha.dados?.formato === FORMATO && leituraDoDia(linha.atualizadoEm)
  && centavos(linha.dados?.valorMensalidade) === centavos(cfg.valorMensalidade)
  && normalizar(linha.dados?.descricaoDoacao ?? PADRAO.descricaoDoacao) === normalizar(cfg.descricaoDoacao)
  && listaIgual(linha.dados?.pagadoresAporte, cfg.pagadoresAporte);

// Valores valendo no mês: os do lançamento dele ou do último mês anterior, um por campo da configuração.
// Campo sem valor guardado: o padrão (débitos de sempre) ou zero.
function valoresDoMes(meses, mes, cfg) {
  const proprio = meses.find((m) => m.mes === mes);
  const base = proprio || [...meses].reverse().find((m) => m.mes < mes);
  const valor = (lista, nome, padrao) => {
    const x = (lista || []).find((l) => l.nome === nome);
    return x ? Number(x.valor) || 0 : base ? 0 : padrao;
  };
  return {
    debitos: cfg.campos.debitos.map((nome) => ({ nome, valor: valor(base?.debitos, nome, DEBITOS_PADRAO.find((d) => d.nome === nome)?.valor || 0) })),
    creditos: cfg.campos.creditos.map((nome) => ({ nome, valor: valor(base?.creditos, nome, 0) })),
    aporte: base ? Number(base.aporte) || 0 : 0,
    herdado: proprio ? null : base?.mes || null,
  };
}
const soma = (l) => reais(l.reduce((s, x) => s + centavos(x.valor), 0));
const doAsaas = (dados) => (dados ? reais(centavos(dados.mensalidades.totalPago) + centavos(dados.doacoes.total)) : 0);
const aporteAsaas = (dados) => Number(dados?.aporte?.total) || 0;
const resultado = (v, dados) => reais(centavos(doAsaas(dados)) + centavos(soma(v.creditos)) + centavos(v.aporte) + centavos(aporteAsaas(dados))
  - centavos(soma(v.debitos)));

function podeVer(eu, publicada) {
  if (eu.grupo) return false;   // alunos e curimba nunca
  return pode(eu, 'transparencia:ver') || pode(eu, 'transparencia:editar') || publicada;
}

export async function transparencia(eu, query) {
  if (eu.grupo) throw new HttpError(403, 'Este acesso não tem o Painel da Transparência.');
  // O estado vem com a leitura inteira só do mês pedido (dos outros, os totais do saldo); a corrente vai junto.
  const pedido = MES.test(String(query.mes || '')) ? query.mes : mesAtual();
  const correntePromessa = db.rpc('transparencia_corrente');
  correntePromessa.catch(() => {});   // se a aba for recusada abaixo, o erro desta consulta não fica solto
  let E = await db.rpc('transparencia_estado', { mes: pedido });
  const cfg = configDe(E);
  if (!podeVer(eu, !!cfg.publicada)) throw new HttpError(403, 'O Painel da Transparência não está visível no momento.');
  const root = pode(eu, 'usuarios:gerenciar');
  const atual = mesAtual();
  const inicio = MES.test(cfg.inicio || '') && cfg.inicio <= atual ? cfg.inicio : atual;
  const disponiveis = [];
  for (let m = atual; m >= inicio && disponiveis.length < 240; m = somarMes(m, -1)) disponiveis.push(m);
  const mes = MES.test(String(query.mes || '')) && disponiveis.includes(query.mes) ? query.mes : atual;
  // Mês pedido fora do intervalo (antes do início ou no futuro): busca de novo com a leitura inteira do mês que vale.
  if (mes !== pedido) E = await db.rpc('transparencia_estado', { mes });

  // ASAAS: o mês escolhido (no Puxar, ou se a leitura é de antes das 9h de hoje) e, para o saldo, os meses desde o início
  // que nunca foram lidos (alguns por pedido).
  const lidos = new Map(E.asaas.map((x) => [x.mes, x]));
  let erro = '';
  if (ligada()) {
    const precisa = disponiveis.filter((m) => m < mes && !lidos.has(m)).slice(0, MAX_MESES_POR_PEDIDO - 1);
    // Puxar (ler na hora): o root e o Admin financeiro (quem vê a aba ASAAS).
    const puxar = query.atualizar === '1' && pode(eu, 'asaas:ver');
    if (puxar || !fresca(lidos.get(mes), cfg)) precisa.unshift(mes);
    const porHash = precisa.length ? await pessoasPorHashCpf() : null;
    for (const m of precisa) {
      try {
        const dados = await lerMes(m, cfg, porHash);
        await db.rpc('transparencia_asaas_salvar', { mes: m, dados });
        lidos.set(m, { mes: m, dados, atualizadoEm: new Date().toISOString() });
      } catch (e) {
        console.error('[transparencia]', m, e);
        erro = e instanceof HttpError ? e.message : 'Não foi possível ler o ASAAS agora.';
        break;
      }
    }
  }

  // Saldo: do mês de início até o escolhido. Mês ainda sem leitura do ASAAS conta sem as mensalidades e doações.
  let saldo = centavos(cfg.saldoInicial);
  let anterior = saldo;
  let parcial = false;
  for (const m of [...disponiveis].reverse().filter((x) => x <= mes)) {
    const dados = lidos.get(m)?.dados;
    if (!dados && ligada()) parcial = true;
    if (m === mes) anterior = saldo;
    saldo += centavos(resultado(valoresDoMes(E.meses, m, cfg), dados));
  }

  const v = valoresDoMes(E.meses, mes, cfg);
  const linha = lidos.get(mes);
  const dados = linha?.dados || null;
  const verNomes = pode(eu, 'asaas:ver');
  // Corrente (com a curimba que tem turma da limpeza): o total vai para todos; quem ficou de fora das mensalidades do mês (sem cobrança, ou sem
  // CPF no Perfil para ligar ao ASAAS) só para quem vê os nomes. Leitura antiga, sem a ligação por CPF: null (Puxar).
  const pessoas = await correntePromessa;
  let fora = null;
  if (verNomes && dados?.ligadoPorCpf) {
    const comMensalidade = new Set(dados.mensalidades.lista.map((x) => x.pessoaId).filter(Boolean));
    fora = pessoas.filter((p) => !comMensalidade.has(p.id)).map((p) => ({ nome: p.nome, motivo: p.temCpf ? 'sem mensalidade no mês' : 'sem CPF no Perfil' }));
  }
  return {
    publicada: !!cfg.publicada,
    editar: pode(eu, 'transparencia:editar'),
    root,
    verNomes,
    config: root ? {
      inicio: MES.test(cfg.inicio || '') ? cfg.inicio : '', saldoInicial: Number(cfg.saldoInicial) || 0,
      valorMensalidade: Number(cfg.valorMensalidade) || 0, descricaoDoacao: cfg.descricaoDoacao, pagadoresAporte: cfg.pagadoresAporte, campos: cfg.campos,
    } : null,
    meses: disponiveis,
    mes,
    debitos: v.debitos,
    totalDebitos: soma(v.debitos),
    creditosExtras: v.creditos,
    aporte: v.aporte,
    // Aporte que veio do ASAAS (doações dos pagadores do aporte); a lista de pagamentos só para quem vê os nomes.
    aporteAsaas: dados?.aporte ? { quantidade: dados.aporte.quantidade, total: dados.aporte.total, ...(verNomes ? { lista: dados.aporte.lista } : {}) } : null,
    herdado: v.herdado,
    asaas: {
      configurado: ligada(),
      erro,
      atualizadoEm: linha?.atualizadoEm || null,
      mensalidades: dados ? { pagas: dados.mensalidades.pagas, abertas: dados.mensalidades.abertas, totalPago: dados.mensalidades.totalPago,
        ...(verNomes ? { lista: dados.mensalidades.lista } : {}) } : null,
      // A lista de quem doou também é só para quem vê os nomes (leitura antiga, sem lista: some até o próximo Puxar).
      doacoes: dados ? { quantidade: dados.doacoes.quantidade, total: dados.doacoes.total, ...(verNomes ? { lista: dados.doacoes.lista || null } : {}) } : null,
      valorMensalidade: dados?.valorMensalidade ?? (Number(cfg.valorMensalidade) || 0),
      corrente: { total: pessoas.length, ...(verNomes ? { fora } : {}) },
    },
    creditos: reais(centavos(doAsaas(dados)) + centavos(soma(v.creditos))),
    resultado: resultado(v, dados),
    saldoAnterior: reais(anterior),
    saldo: reais(saldo),
    saldoParcial: parcial,
  };
}

const valorOk = (v, rotulo) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new HttpError(400, `${rotulo}: valor inválido.`);
  return reais(centavos(n));
};
function camposOk(lista, rotulo) {
  if (!Array.isArray(lista) || lista.length > MAX_CAMPOS) throw new HttpError(400, `${rotulo}: lista inválida (até ${MAX_CAMPOS}).`);
  const nomes = lista.map((n) => String(n ?? '').replace(/\s+/g, ' ').trim());
  if (nomes.some((n) => !n || n.length > 60)) throw new HttpError(400, `${rotulo}: cada campo precisa de um nome (até 60 letras).`);
  if (new Set(nomes.map((n) => n.toLowerCase())).size !== nomes.length) throw new HttpError(400, `${rotulo}: há nomes repetidos.`);
  return nomes;
}
// Valores digitados do mês: só os campos que existem na configuração.
function linhasOk(lista, campos, rotulo) {
  if (!Array.isArray(lista)) throw new HttpError(400, `${rotulo}: lista inválida.`);
  return campos.map((nome) => ({ nome, valor: valorOk(lista.find((l) => l?.nome === nome)?.valor ?? 0, nome) }));
}

// Configuração do root conferida: só os campos que vieram no pedido mudam.
function configOk(b, cfg) {
  const c = { ...cfg };
  if ('inicio' in b) {
    const inicio = String(b.inicio || '');
    if (!MES.test(inicio) || inicio > mesAtual()) throw new HttpError(400, 'Escolha o mês de início (até o mês atual).');
    c.inicio = inicio;
  }
  if ('valorMensalidade' in b) {
    c.valorMensalidade = valorOk(b.valorMensalidade, 'Mensalidade');
    if (!c.valorMensalidade) throw new HttpError(400, 'Mensalidade: informe o valor.');
  }
  if ('saldoInicial' in b) {
    const n = Number(String(b.saldoInicial ?? '').replace(',', '.'));   // pode ser negativo (a casa pode começar devendo)
    if (!Number.isFinite(n) || Math.abs(n) > 100000000) throw new HttpError(400, 'Saldo inicial: valor inválido.');
    c.saldoInicial = reais(centavos(n));
  }
  if ('descricaoDoacao' in b) {
    c.descricaoDoacao = String(b.descricaoDoacao ?? '').replace(/\s+/g, ' ').trim();
    if (!c.descricaoDoacao || c.descricaoDoacao.length > 150) throw new HttpError(400, 'Descrição das doações: escreva o texto (até 150 letras).');
  }
  if ('pagadoresAporte' in b) c.pagadoresAporte = camposOk(b.pagadoresAporte, 'Pagadores do aporte');
  if ('campos' in b) c.campos = { debitos: camposOk(b.campos?.debitos, 'Campos de débito'), creditos: camposOk(b.campos?.creditos, 'Campos de crédito') };
  return c;
}

export async function acaoTransparencia(eu, b, query) {
  if (!pode(eu, 'transparencia:editar')) throw new HttpError(403, 'Seu perfil não edita o Painel da Transparência.');
  let cfg = configDe(await db.rpc('transparencia_estado'));
  const exigirRoot = () => { if (!pode(eu, 'usuarios:gerenciar')) throw new HttpError(403, 'Só o admin root muda a configuração do painel.'); };
  if (b.op === 'publicar') {
    exigirRoot();
    if (typeof b.publicada !== 'boolean') throw new HttpError(400, 'Informe se o painel fica visível.');
    await db.rpc('transparencia_config_salvar', { config: { ...cfg, publicada: b.publicada } });
  } else if (b.op === 'config') {   // bloco Busca no ASAAS (e o app de antes da edição na própria tela)
    exigirRoot();
    await db.rpc('transparencia_config_salvar', { config: configOk(b, cfg) });
  } else if (b.op === 'mes') {
    const mes = String(b.mes || '');
    if (!MES.test(mes) || mes > mesAtual()) throw new HttpError(400, 'Mês inválido.');
    // O root salva junto a estrutura (campos, mensalidade, descrição, início e saldo inicial). Campo renomeado leva o
    // nome novo para os valores de todos os meses já lançados (renomes: [{ tipo: 'debitos'|'creditos', de, para }]).
    if (b.config) {
      exigirRoot();
      const novo = configOk(b.config, cfg);
      const renomes = Array.isArray(b.renomes) ? b.renomes.slice(0, 60) : [];
      for (const r of renomes) {
        const tipo = r?.tipo === 'creditos' ? 'creditos' : r?.tipo === 'debitos' ? 'debitos' : null;
        if (!tipo || !cfg.campos[tipo].includes(r.de) || !novo.campos[tipo].includes(r.para) || r.de === r.para) continue;
        await db.rpc('transparencia_renomear', { tipo, de: r.de, para: r.para });
      }
      await db.rpc('transparencia_config_salvar', { config: novo });
      cfg = novo;
    }
    await db.rpc('transparencia_mes_salvar', {
      mes,
      debitos: linhasOk(b.debitos, cfg.campos.debitos, 'Débitos'),
      creditos: linhasOk(b.creditos ?? [], cfg.campos.creditos, 'Créditos'),
      aporte: valorOk(b.aporte, 'Aporte Mãe Vê'),
      por: eu.nome || '',
    });
  } else {
    throw new HttpError(400, 'Ação inválida.');
  }
  return transparencia(eu, { mes: b.mes || query.mes });
}
