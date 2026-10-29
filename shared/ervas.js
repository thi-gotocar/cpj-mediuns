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

// ervas:    [{ id, nome, preco }]   (preco null = a definir; conta como 0 até ser preenchido)
// escolhas: [{ chave, nome, ervaId, quantidade }]
// frete:    em reais
// Frete dividido por igual entre quem escolheu pelo menos uma erva; os centavos
// que sobram da divisão vão para os primeiros da lista, para fechar o valor exato.
export function calcularPedidos(ervas, escolhas, frete) {
  const porId = new Map(ervas.map((e) => [e.id, e]));
  const pessoas = new Map();
  for (const s of escolhas) {
    const erva = porId.get(s.ervaId);
    const qtd = Math.max(0, Math.floor(Number(s.quantidade) || 0));
    if (!erva || !qtd) continue;
    let p = pessoas.get(s.chave);
    if (!p) { p = { chave: s.chave, nome: s.nome, itens: [], subtotal: 0, frete: 0, total: 0 }; pessoas.set(s.chave, p); }
    const preco = temPreco(erva) ? centavos(erva.preco) : 0;
    p.itens.push({ ervaId: erva.id, nome: erva.nome, quantidade: qtd, preco, valor: preco * qtd, semPreco: !temPreco(erva) });
    if (!temPreco(erva)) p.semPreco = true;
    p.subtotal += preco * qtd;
  }
  const lista = [...pessoas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  lista.forEach((p) => p.itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  const freteC = Math.max(0, centavos(frete));
  if (lista.length) {
    const base = Math.floor(freteC / lista.length);
    const resto = freteC - base * lista.length;
    lista.forEach((p, i) => { p.frete = base + (i < resto ? 1 : 0); });
  }
  lista.forEach((p) => { p.total = p.subtotal + p.frete; });
  const totalItens = lista.reduce((a, p) => a + p.subtotal, 0);
  const totalFrete = lista.length ? freteC : 0;
  // Ervas escolhidas que ainda estão sem preço: os valores só fecham depois de preenchê-las.
  const faltamPrecos = [...new Set(lista.flatMap((p) => p.itens.filter((i) => i.semPreco).map((i) => i.nome)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { pessoas: lista, totalItens, totalFrete, totalGeral: totalItens + totalFrete, fretePorPessoa: lista.length ? freteC / lista.length : 0, faltamPrecos };
}

// Quantidade de cada erva somada (para fazer a compra).
export function totaisPorErva(resumo) {
  const m = new Map();
  resumo.pessoas.forEach((p) => p.itens.forEach((i) => {
    const t = m.get(i.nome) || { nome: i.nome, quantidade: 0, valor: 0 };
    t.quantidade += i.quantidade;
    t.valor += i.valor;
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
  const linhas = [['Nome', 'Erva', 'Quantidade', 'Preço unitário', 'Valor', 'Frete', 'Total da pessoa']];
  resumo.pessoas.forEach((p) => {
    p.itens.forEach((i, k) => linhas.push([p.nome, i.nome, i.quantidade, i.semPreco ? 'a definir' : num(i.preco), i.semPreco ? 'a definir' : num(i.valor), k === 0 ? num(p.frete) : '', k === 0 ? num(p.total) : '']));
  });
  linhas.push([]);
  linhas.push(['Total', '', '', '', num(resumo.totalItens), num(resumo.totalFrete), num(resumo.totalGeral)]);
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}
