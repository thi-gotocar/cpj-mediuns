// Oferendas: situação de cada item e texto para compartilhar.

// Oferenda com uma linha por pessoa: duas conferências separadas, o pagamento e a entrega.
export const PAGAMENTO = [['nao_pago', 'Não pago', '🔴'], ['pago', 'Pago', '🔵']];
export const ENTREGA = [['pendente', 'Pendente', '🟡'], ['entregue', 'Entregue', '🟢']];
export const PAGAMENTO_KEYS = PAGAMENTO.map(([k]) => k);
export const ENTREGA_KEYS = ENTREGA.map(([k]) => k);
export const ROTULO_MEDIUM = Object.fromEntries([...PAGAMENTO, ...ENTREGA].map(([k, l]) => [k, l]));
// Quantas pessoas em cada situação: { nao_pago, pago, pendente, entregue }
export function contagemMediuns(of) {
  const c = { nao_pago: 0, pago: 0, pendente: 0, entregue: 0 };
  (of.mediuns || []).forEach((m) => { c[m.pagamento] = (c[m.pagamento] || 0) + 1; c[m.entrega] = (c[m.entrega] || 0) + 1; });
  return c;
}
// Linha "conferida": paga e entregue.
export const medConferido = (m) => m.pagamento === 'pago' && m.entrega === 'entregue';

export const somaDoado = (item) => (item.doacoes || []).reduce((a, d) => a + (Number(d.quantidade) || 0), 0);

// { doado, falta, completo }
export function situacao(item) {
  const doado = somaDoado(item);
  return { doado, falta: Math.max(0, item.quantidade - doado), completo: doado >= item.quantidade };
}

// Quanto da oferenda já tem doador (0 a 100), somando todos os itens (o que passa do pedido não conta).
export function percentualDoado(of) {
  const total = (of.itens || []).reduce((s, i) => s + i.quantidade, 0);
  if (!total) return 0;
  const doado = (of.itens || []).reduce((s, i) => s + Math.min(i.quantidade, situacao(i).doado), 0);
  return Math.floor((doado / total) * 100);
}

// Completa há mais de um dia: só o responsável altera as próprias doações.
export const travadaPara = (of, chave) => !!of.fechada && chave !== 'p:' + of.responsavelId;
// Quando fecha (um dia depois de ficar completa).
export const fechaEm = (of) => (of.completaEm ? new Date(new Date(of.completaEm).getTime() + 24 * 3600 * 1000) : null);

// Data de entrega do item: a escolhida ou, se vazia, o dia do evento.
export const dataEntrega = (item, oferenda) => item.entrega || oferenda.data;

// O admin só marca "entregue" a partir da data de entrega.
export const podeMarcarEntregue = (item, oferenda, hoje) => hoje >= dataEntrega(item, oferenda);

export function dataBR(s) {
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
}
function semana(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' });
}
export const textoEntrega = (item) => (item.entrega ? dataBR(item.entrega) : 'no dia do evento');

// Texto para o WhatsApp: itens, quantidade, responsáveis e data de entrega.
export function textoOferenda(of) {
  const L = [`*OFERENDA · ${of.titulo}*`, `${dataBR(of.data)} (${semana(of.data)})`, ...(of.responsavel ? [`Responsável: ${of.responsavel}`] : []), ''];
  if (of.porMedium && (of.mediuns || []).length) {
    const c = contagemMediuns(of);
    L.push(`*Pessoas* (${of.mediuns.length}) · Pago ${c.pago} · Não pago ${c.nao_pago} · Entregue ${c.entregue} · Pendente ${c.pendente}`);
    const grupo = (campo, [k, l, e], titulo) => {
      const nomes = of.mediuns.filter((m) => m[campo] === k).map((m) => m.nome);
      if (nomes.length) L.push(`${e} *${titulo} ${l.toLowerCase()}:* ${nomes.join(', ')}`);
    };
    PAGAMENTO.forEach((x) => grupo('pagamento', x, 'Pagamento'));
    ENTREGA.forEach((x) => grupo('entrega', x, 'Entrega'));
    L.push('');
  }
  of.itens.forEach((i) => {
    const s = situacao(i);
    L.push(`${s.completo ? '🟢' : '🟡'} *${i.nome}* · ${s.doado} de ${i.quantidade}${i.entregue ? ' · ✅ entregue' : ''}`);
    L.push(`   Entrega: ${textoEntrega(i)}`);
    if (i.doacoes.length) L.push(`   ${i.doacoes.map((d) => `${d.nome} (${d.quantidade})`).join(', ')}`);
    if (!s.completo) L.push(`   Faltam ${s.falta}`);
    L.push('');
  });
  const pend = of.itens.filter((i) => !situacao(i).completo).length;
  if (of.porMedium && !of.itens.length) return L.join('\n').trimEnd();
  L.push(pend ? `Faltam doadores em ${pend} ${pend === 1 ? 'item' : 'itens'}.` : 'Todos os itens já têm doadores. 🙏');
  return L.join('\n');
}
