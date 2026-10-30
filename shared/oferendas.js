// Oferendas: situação de cada item e texto para compartilhar.

// Oferenda com uma linha por médium: situação de cada médium.
export const STATUS_MEDIUM = [
  ['pendente', 'Pendente', '🟡'], ['entregue', 'Entregue', '🟢'], ['pago', 'Pago', '🔵'], ['nao_pago', 'Não pago', '🔴'], ['nao_vai', 'Não vai', '⚪'],
];
export const STATUS_MEDIUM_KEYS = STATUS_MEDIUM.map(([k]) => k);
export const STATUS_MEDIUM_LABEL = Object.fromEntries(STATUS_MEDIUM.map(([k, l]) => [k, l]));
// Quantos médiuns em cada situação: { pendente: n, ... }
export function contagemMediuns(of) {
  const c = Object.fromEntries(STATUS_MEDIUM_KEYS.map((k) => [k, 0]));
  (of.mediuns || []).forEach((m) => { c[m.status] = (c[m.status] || 0) + 1; });
  return c;
}

export const somaDoado = (item) => (item.doacoes || []).reduce((a, d) => a + (Number(d.quantidade) || 0), 0);

// { doado, falta, completo }
export function situacao(item) {
  const doado = somaDoado(item);
  return { doado, falta: Math.max(0, item.quantidade - doado), completo: doado >= item.quantidade };
}

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
    L.push(`*Médiuns* · ${STATUS_MEDIUM.filter(([k]) => c[k]).map(([k, l]) => `${l} ${c[k]}`).join(' · ')}`);
    STATUS_MEDIUM.forEach(([k, l, e]) => {
      const nomes = of.mediuns.filter((m) => m.status === k).map((m) => m.nome);
      if (nomes.length) L.push(`${e} *${l}:* ${nomes.join(', ')}`);
    });
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
