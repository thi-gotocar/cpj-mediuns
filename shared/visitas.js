// Quem entrou em cada aba (bloco do Admin root). O app avisa o servidor quando a pessoa abre uma aba; o banco guarda
// uma linha por pessoa, aba e dia (com quantas vezes e a última hora) e apaga o que tem mais de VISITAS_DIAS dias.
// O root não entra na lista, nem o "Ver como".

export const VISITAS_DIAS = 3;

// Abas que contam, com o nome que aparece na tela (data-tab do index.html → rótulo).
export const ABAS_VISITA = [
  ['gira', 'Geral'], ['agenda', 'Gira'], ['hist', 'Histórico'], ['diario', 'Diário'], ['perfil', 'Perfil'],
  ['oferendas', 'Oferendas'], ['ervas', 'Ervas'], ['guias', 'Compras'], ['pedidos', 'Pedidos'], ['asaas', 'ASAAS'],
  ['amaci', 'Amaci'], ['fotos', 'Fotos'], ['curimba', 'Curimba'], ['videos', 'Vídeos'], ['transparencia', 'Transparência'],
  ['oraculo', 'Oráculo'],
];
export const rotuloAba = (k) => ABAS_VISITA.find(([x]) => x === k)?.[1] || k;
export const abaValida = (k) => ABAS_VISITA.some(([x]) => x === k);

// Ordem dos grupos do cadastro na lista: Corrente CPJ, Curimba, as turmas de alunos (por nome), os sem turma e os outros.
const ORDEM_FIXA = ['Corrente CPJ', 'Curimba'];
const FIM = ['Alunos sem turma', 'Outros'];
export function ordemGrupo(a, b) {
  const pos = (g) => (ORDEM_FIXA.includes(g) ? ORDEM_FIXA.indexOf(g) : FIM.includes(g) ? 100 + FIM.indexOf(g) : 10);
  return pos(a) - pos(b) || a.localeCompare(b, 'pt-BR', { numeric: true });
}

// Linhas do banco ({ chave, aba, dia, nome, grupo, vezes, ultima }) de uma aba → [{ grupo, pessoas: [{ nome, ultima, vezes, dias }] }].
export function agruparVisitas(linhas, aba) {
  const porPessoa = new Map();
  for (const v of linhas || []) {
    if (v.aba !== aba) continue;
    const p = porPessoa.get(v.chave) || { nome: v.nome, grupo: v.grupo, ultima: '', vezes: 0, dias: 0 };
    p.vezes += Number(v.vezes) || 0;
    p.dias += 1;
    if (v.ultima > p.ultima) p.ultima = v.ultima;
    porPessoa.set(v.chave, p);
  }
  const grupos = new Map();
  for (const p of porPessoa.values()) {
    if (!grupos.has(p.grupo)) grupos.set(p.grupo, []);
    grupos.get(p.grupo).push(p);
  }
  return [...grupos.entries()].sort(([a], [b]) => ordemGrupo(a, b))
    .map(([grupo, pessoas]) => ({ grupo, pessoas: pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }));
}

// Texto para o WhatsApp: título, e por grupo os nomes com a última entrada.
export function textoVisitas(grupos, aba, quando) {
  const total = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  const L = [`👀 *Quem entrou na aba ${rotuloAba(aba)}*`, `Últimos ${VISITAS_DIAS} dias · ${total} pessoa${total === 1 ? '' : 's'}`];
  for (const g of grupos) {
    L.push('', `*${g.grupo}* (${g.pessoas.length})`);
    g.pessoas.forEach((p) => L.push(`• ${p.nome} — ${quando(p.ultima)}`));
  }
  if (!total) L.push('', 'Ninguém entrou nesses dias.');
  return L.join('\n');
}
