// Oferendas: situação de cada item e texto para compartilhar.

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
  of.itens.forEach((i) => {
    const s = situacao(i);
    L.push(`${s.completo ? '🟢' : '🟡'} *${i.nome}* · ${s.doado} de ${i.quantidade}${i.entregue ? ' · ✅ entregue' : ''}`);
    L.push(`   Entrega: ${textoEntrega(i)}`);
    if (i.doacoes.length) L.push(`   ${i.doacoes.map((d) => `${d.nome} (${d.quantidade})`).join(', ')}`);
    if (!s.completo) L.push(`   Faltam ${s.falta}`);
    L.push('');
  });
  const pend = of.itens.filter((i) => !situacao(i).completo).length;
  L.push(pend ? `Faltam doadores em ${pend} ${pend === 1 ? 'item' : 'itens'}.` : 'Todos os itens já têm doadores. 🙏');
  return L.join('\n');
}
