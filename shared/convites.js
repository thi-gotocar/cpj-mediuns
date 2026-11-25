// Sub-aba Eventos (aba Eventos, antiga Oferendas): a lista de pessoas de cada evento.
// Quem vem do cadastro fica na lista de onde veio (Corrente, Curimba, a turma, Alunos sem turma); quem é de fora,
// em Convidados. A tela mostra separado por grupo; o WhatsApp manda uma lista só, na mesma ordem dos grupos.

export const LISTA_CONVIDADOS = 'Convidados';
export const LISTA_SEM_TURMA = 'Alunos sem turma';

// Ordem dos grupos: Corrente, Curimba, as turmas (por nome), Alunos sem turma e, por último, Convidados.
function pesoLista(l) {
  if (l === 'Corrente') return 0;
  if (l === 'Curimba') return 1;
  if (l === LISTA_SEM_TURMA) return 3;
  if (l === LISTA_CONVIDADOS) return 4;
  return 2;
}
const porNome = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

// [{ lista, pessoas }] na ordem dos grupos, cada grupo em ordem de nome.
export function gruposDe(pessoas) {
  const mapa = new Map();
  for (const p of pessoas || []) {
    if (!mapa.has(p.lista)) mapa.set(p.lista, []);
    mapa.get(p.lista).push(p);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => pesoLista(a) - pesoLista(b) || porNome(a, b))
    .map(([lista, l]) => ({ lista, pessoas: [...l].sort((x, y) => porNome(x.nome, y.nome)) }));
}

const dataBR = (d) => d.split('-').reverse().join('/');

// Texto do WhatsApp: título, data e os nomes numerados, sem os títulos dos grupos (mas na ordem deles).
export function textoWhatsConvites(ev) {
  const nomes = gruposDe(ev.pessoas).flatMap((g) => g.pessoas.map((p) => p.nome));
  return [
    `*${ev.nome}*`,
    `📅 ${dataBR(ev.data)}`,
    '',
    ...nomes.map((n, i) => `${i + 1}. ${n}`),
    '',
    `Total: ${nomes.length} ${nomes.length === 1 ? 'pessoa' : 'pessoas'}`,
  ].join('\n');
}
