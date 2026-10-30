// Compra coletiva de ervas: cálculo dos pedidos e exportação.
// Valores em centavos (inteiros) para não haver erro de arredondamento.

export const centavos = (v) => Math.round(Number(v || 0) * 100);
export const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Chave que identifica a pessoa nas escolhas.
//   usuário cadastrado: "u:<id>";  acesso da corrente: "n:<nome normalizado>"
export function normalizarNome(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function chavePessoa(quem) {
  return quem.id ? 'u:' + quem.id : 'n:' + normalizarNome(quem.nome);
}

export const temPreco = (erva) => erva && erva.preco !== null && erva.preco !== undefined && erva.preco !== '';

// ervas:    [{ id, nome, preco }]   preco = valor TOTAL pago pela erva (null = a definir)
// escolhas: [{ chave, nome, ervaId, quantidade }]
// frete:    em reais
//
// Rateio:
// - o preço de cada erva é dividido entre quem escolheu aquela erva, na proporção da
//   quantidade (com quantidade 1 para todos, fica igual para cada um);
// - o frete é dividido por igual entre quem escolheu pelo menos uma erva.
// Os centavos que sobram de cada divisão vão para quem ficou mais perto de receber
// o centavo (e, no empate, para os primeiros da lista), para fechar o valor exato.
export function calcularPedidos(ervas, escolhas, frete) {
  const porId = new Map(ervas.map((e) => [e.id, e]));
  const pessoas = new Map();
  const porErva = new Map();   // ervaId -> itens de todos
  for (const s of escolhas) {
    const erva = porId.get(s.ervaId);
    const qtd = Math.max(0, Math.floor(Number(s.quantidade) || 0));
    if (!erva || !qtd) continue;
    let p = pessoas.get(s.chave);
    if (!p) { p = { chave: s.chave, nome: s.nome, itens: [], subtotal: 0, frete: 0, total: 0 }; pessoas.set(s.chave, p); }
    const item = { ervaId: erva.id, nome: erva.nome, quantidade: qtd, preco: temPreco(erva) ? centavos(erva.preco) : 0, valor: 0, pessoas: 0, semPreco: !temPreco(erva), dono: p };
    p.itens.push(item);
    if (!temPreco(erva)) p.semPreco = true;
    if (!porErva.has(erva.id)) porErva.set(erva.id, []);
    porErva.get(erva.id).push(item);
  }
  const lista = [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const ordem = new Map(lista.map((p, i) => [p.chave, i]));
  for (const itens of porErva.values()) {
    itens.forEach((i) => { i.pessoas = itens.length; });
    if (itens[0].semPreco) continue;
    const pesos = itens.map((i) => i.quantidade);
    dividir(itens[0].preco, pesos, itens.map((i) => ordem.get(i.dono.chave))).forEach((v, k) => { itens[k].valor = v; });
  }
  lista.forEach((p) => {
    p.itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    p.itens.forEach((i) => { delete i.dono; });
    p.subtotal = p.itens.reduce((a, i) => a + i.valor, 0);
  });
  const freteC = Math.max(0, centavos(frete));
  if (lista.length) dividir(freteC, lista.map(() => 1), lista.map((_, i) => i)).forEach((v, i) => { lista[i].frete = v; });
  lista.forEach((p) => { p.total = p.subtotal + p.frete; });
  const totalItens = lista.reduce((a, p) => a + p.subtotal, 0);
  const totalFrete = lista.length ? freteC : 0;
  // Ervas escolhidas que ainda estão sem preço: os valores só fecham depois de preenchê-las.
  const faltamPrecos = [...new Set(lista.flatMap((p) => p.itens.filter((i) => i.semPreco).map((i) => i.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { pessoas: lista, totalItens, totalFrete, totalGeral: totalItens + totalFrete, fretePorPessoa: lista.length ? freteC / lista.length : 0, faltamPrecos };
}

// Divide "total" centavos na proporção dos pesos, sem perder centavo.
function dividir(total, pesos, ordem) {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!soma) return pesos.map(() => 0);
  const exatos = pesos.map((w) => (total * w) / soma);
  const partes = exatos.map(Math.floor);
  let resto = total - partes.reduce((a, b) => a + b, 0);
  const fila = exatos.map((x, k) => k).sort((a, b) => (exatos[b] - partes[b]) - (exatos[a] - partes[a]) || ordem[a] - ordem[b]);
  for (let k = 0; resto > 0; k = (k + 1) % fila.length, resto--) partes[fila[k]]++;
  return partes;
}

// Quantidade de cada erva somada (para fazer a compra).
export function totaisPorErva(resumo) {
  const m = new Map();
  resumo.pessoas.forEach((p) => p.itens.forEach((i) => {
    const t = m.get(i.nome) || { nome: i.nome, quantidade: 0, valor: 0, pessoas: 0 };
    t.quantidade += i.quantidade;
    t.valor += i.valor;
    t.pessoas += 1;
    m.set(i.nome, t);
  }));
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function textoPedidos(resumo, frete, data = new Date()) {
  const L = [];
  L.push('*ERVAS · ' + data.toLocaleDateString('pt-BR') + '*');
  if (resumo.faltamPrecos?.length) L.push('⚠ Preço a definir: ' + resumo.faltamPrecos.join(', ') + ' (valores ainda incompletos)');
  if (resumo.pessoas.length && resumo.totalFrete) {
    L.push(`Frete: ${reais(resumo.totalFrete)} ÷ ${resumo.pessoas.length} = ${reais(Math.round(resumo.fretePorPessoa))} por pessoa`);
  }
  L.push('');
  resumo.pessoas.forEach((p) => {
    L.push(`*${p.nome}* · ${reais(p.total)}`);
    p.itens.forEach((i) => L.push(`• ${i.nome}${i.quantidade > 1 ? ' x' + i.quantidade : ''} · ${i.semPreco ? 'preço a definir' : reais(i.valor)}`));
    if (p.frete) L.push(`• frete · ${reais(p.frete)}`);
    L.push('');
  });
  const tot = totaisPorErva(resumo);
  if (tot.length) {
    L.push('*Para comprar*');
    tot.forEach((t) => L.push(`• ${t.nome} x${t.quantidade}`));
    L.push('');
  }
  L.push(`*Ervas:* ${reais(resumo.totalItens)}`);
  if (resumo.totalFrete) L.push(`*Frete:* ${reais(resumo.totalFrete)}`);
  L.push(`*Total:* ${reais(resumo.totalGeral)}`);
  return L.join('\n');
}

// Planilha (CSV no formato do Excel em português: ponto e vírgula e vírgula decimal).
export function csvPedidos(resumo) {
  const num = (c) => (c / 100).toFixed(2).replace('.', ',');
  const cel = (v) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const linhas = [['Nome', 'Erva', 'Quantidade', 'Preço da erva (total)', 'Pessoas na erva', 'Parte da pessoa', 'Frete', 'Total da pessoa']];
  resumo.pessoas.forEach((p) => {
    p.itens.forEach((i, k) => linhas.push([p.nome, i.nome, i.quantidade, i.semPreco ? 'a definir' : num(i.preco), i.pessoas, i.semPreco ? 'a definir' : num(i.valor), k === 0 ? num(p.frete) : '', k === 0 ? num(p.total) : '']));
  });
  linhas.push([]);
  linhas.push(['Total', '', '', '', '', num(resumo.totalItens), num(resumo.totalFrete), num(resumo.totalGeral)]);
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}

// ---------- Pedido ao fornecedor: erva + quantidade total (sem valores) ----------
export function textoFornecedor(resumo, data = new Date()) {
  const tot = totaisPorErva(resumo);
  const L = ['*PEDIDO DE ERVAS · ' + data.toLocaleDateString('pt-BR') + '*', ''];
  tot.forEach((t) => L.push(`• ${t.nome}: ${t.quantidade}`));
  L.push('');
  L.push(`Total: ${tot.reduce((a, t) => a + t.quantidade, 0)} itens, ${tot.length} erva${tot.length === 1 ? '' : 's'}`);
  return L.join('\n');
}

export function csvFornecedor(resumo) {
  const linhas = [['Erva', 'Quantidade', 'Pessoas que pediram']];
  totaisPorErva(resumo).forEach((t) => linhas.push([t.nome, t.quantidade, t.pessoas]));
  return '\uFEFF' + linhas.map((l) => l.map(celCsv).join(';')).join('\r\n');
}

// ---------- Cobrança: quanto cada pessoa paga ----------
// Só faz sentido com todos os preços definidos (resumo.faltamPrecos vazio).
export function textoCobranca(resumo, data = new Date()) {
  const L = ['*COBRANÇA DAS ERVAS · ' + data.toLocaleDateString('pt-BR') + '*'];
  if (resumo.totalFrete) L.push(`Frete: ${reais(resumo.totalFrete)} ÷ ${resumo.pessoas.length} pessoas`);
  L.push('');
  resumo.pessoas.forEach((p) => {
    const itens = p.itens.map((i) => `${i.nome}${i.quantidade > 1 ? ' x' + i.quantidade : ''}`).join(', ');
    L.push(`*${p.nome}*: ${reais(p.total)}`);
    L.push(`   ${itens} (${reais(p.subtotal)})${p.frete ? ` + frete ${reais(p.frete)}` : ''}`);
  });
  L.push('');
  L.push(`*Total a receber:* ${reais(resumo.totalGeral)}`);
  return L.join('\n');
}

export function csvCobranca(resumo) {
  const num = (c) => (c / 100).toFixed(2).replace('.', ',');
  const linhas = [['Nome', 'Ervas', 'Valor das ervas', 'Frete', 'Total a pagar']];
  resumo.pessoas.forEach((p) => linhas.push([
    p.nome, p.itens.map((i) => i.nome + (i.quantidade > 1 ? ' x' + i.quantidade : '')).join(', '), num(p.subtotal), num(p.frete), num(p.total),
  ]));
  linhas.push([]);
  linhas.push(['Total', '', num(resumo.totalItens), num(resumo.totalFrete), num(resumo.totalGeral)]);
  return '\uFEFF' + linhas.map((l) => l.map(celCsv).join(';')).join('\r\n');
}

function celCsv(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
