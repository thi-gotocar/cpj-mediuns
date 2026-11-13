// Oferendas: situação de cada item e texto para compartilhar.

// Grupos de onde sai a lista "uma linha por pessoa": funções da corrente e alunos da CPJ.
export const GRUPOS_OFERENDA = [['medium', 'Médiuns'], ['extra', 'Extras'], ['passe', 'Passe'], ['cambone', 'Cambones'], ['senha', 'Senha'], ['curimba', 'Curimba'], ['alunos', 'Alunos']];
export const GRUPOS_OFERENDA_KEYS = GRUPOS_OFERENDA.map(([k]) => k);
// Alunos também por turma: 'turma:<id>' (os alunos daquela turma) e 'alunos:sem' (sem turma).
// 'alunos' sozinho = todos os alunos (oferendas antigas).
export const grupoOferendaValido = (g) => GRUPOS_OFERENDA_KEYS.includes(g) || g === 'alunos:sem' || /^turma:[0-9a-f-]{36}$/i.test(g);
// Na tela, as funções da corrente são uma opção só: "Médiuns" ('corrente') vale as seis.
export const GRUPOS_CORRENTE = GRUPOS_OFERENDA_KEYS.filter((k) => k !== 'alunos');
// Opções de grupo para a tela: "Médiuns" e, no lugar de "Alunos", uma por turma.
export function opcoesGruposOferenda(turmas, alunos) {
  const corrente = [['corrente', 'Médiuns']];
  if (!turmas) return [...corrente, ['alunos', 'Alunos']];   // turmas desconhecidas (sem acesso aos alunos): "Alunos" inteiro
  const porTurma = turmas.map((t) => ['turma:' + t.id, 'Alunos · ' + t.nome]);
  const semTurma = (alunos || []).some((a) => !a.turmaId) ? [['alunos:sem', 'Alunos sem turma']] : [];
  return [...corrente, ...porTurma, ...semTurma];
}
// Marcados na tela: qualquer função da corrente acende "Médiuns"; "alunos" (todos) acende todas as turmas.
export const gruposMarcados = (grupos, opcoes) => [
  ...grupos,
  ...(grupos.some((g) => GRUPOS_CORRENTE.includes(g)) ? ['corrente'] : []),
  ...(grupos.includes('alunos') ? opcoes.map(([k]) => k).filter((k) => k.startsWith('turma:') || k === 'alunos:sem') : []),
];
// Para enviar: "Médiuns" volta a ser as seis funções.
export const gruposParaEnviar = (marcados) => [...new Set(marcados.flatMap((g) => (g === 'corrente' ? GRUPOS_CORRENTE : [g])))];

// Oferenda com uma linha por pessoa: duas conferências separadas, o pagamento e a entrega.
// Cores: amarelo = falta, verde = feito (na tela, no texto e na imagem do WhatsApp).
export const PAGAMENTO = [['nao_pago', 'Não pago', '🟡'], ['pago', 'Pago', '🟢']];
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

// Compromissos de quem está logado (chave 'p:…'), da oferenda mais próxima à mais distante:
// os itens que vai doar e ainda não foram entregues (só das oferendas de hoje em diante) e, na lista por pessoa,
// a própria linha quando falta o pagamento ou a entrega (enquanto não for encerrada: o pagamento pode ficar para depois).
export function compromissosDe(oferendas, chave, hoje) {
  return (oferendas || []).filter((of) => of.status !== 'encerrado').map((of) => {
    const itens = of.data >= hoje ? of.itens.map((i) => ({ i, q: i.doacoes.find((d) => d.chave === chave)?.quantidade || 0 })).filter((x) => x.q && !x.i.entregue) : [];
    const m = of.porMedium ? (of.mediuns || []).find((x) => 'p:' + x.pessoaId === chave) : null;
    return { of, itens, linha: m && (m.pagamento !== 'pago' || m.entrega !== 'entregue') ? m : null };
  }).filter((x) => x.itens.length || x.linha).sort((a, b) => a.of.data.localeCompare(b.of.data));
}

// Admin: oferendas com uma linha por pessoa marcadas "Exibir no resumo" e ainda não encerradas, da mais próxima
// à mais distante, com quem vai, quem falta pagar e quem falta entregar (os nomes, para mostrar ao tocar no número).
export function estatisticasPorPessoa(oferendas) {
  return (oferendas || []).filter((of) => of.porMedium && of.noResumo && of.status !== 'encerrado' && !of.bloqueada)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((of) => {
      const ms = of.mediuns || [];
      return { of, pessoas: ms, naoPagos: ms.filter((m) => m.pagamento !== 'pago'), naoEntregues: ms.filter((m) => m.entrega !== 'entregue') };
    });
}

// Sub-abas: a Iemanjá tem o próprio Visível para todos, por evento.
export const abasOcultas = (abas) => new Set(abas.filter((a) => !a.iemanja && !a.visivel).map((a) => a.id));
export const temAbaPublica = (abas) => abas.some((a) => !a.iemanja && a.visivel);

// Detalhes da sub-aba (o admin escreve, todos leem e vai no começo da lista compartilhada): até 10 linhas.
export const DETALHES_LINHAS = 10;
export const DETALHES_MAX = 1500;
// Sem espaço no fim das linhas nem linhas vazias no começo e no fim.
export const limparDetalhes = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').replace(/^\n+|\n+$/g, '');
export const linhasDetalhes = (s) => (s ? s.split('\n').length : 0);
export const detalhesOk = (s) => linhasDetalhes(s) <= DETALHES_LINHAS && s.length <= DETALHES_MAX;

// Cor do percentual: verde com 100%, amarelo de 50% a 99%, vermelho abaixo de 50%.
export const faixaPct = (pct) => (pct >= 100 ? 'cheio' : pct >= 50 ? 'meio' : 'baixo');

// Itens separados pela categoria (Elemento, Flores, Frutas…): [[categoria, itens]], na ordem da lista do evento
// (ordem) e depois as que estão fora dela, na ordem em que apareceram; categoria sem item não aparece.
// Maiúsculas não separam ("flores" entra em "Flores"). Sem nenhuma categoria: um bloco só, com categoria ''.
// Com alguma, os itens sem categoria vão para "Outros", no fim.
export function porCategoria(itens, ordem = []) {
  const blocos = new Map((ordem || []).map((c) => [c.toLocaleLowerCase('pt-BR'), [c, []]]));
  const sem = [];
  for (const i of itens || []) {
    const cat = String(i.categoria || '').trim();
    if (!cat) { sem.push(i); continue; }
    const k = cat.toLocaleLowerCase('pt-BR');
    if (!blocos.has(k)) blocos.set(k, [cat, []]);
    blocos.get(k)[1].push(i);
  }
  const usados = [...blocos.values()].filter(([, l]) => l.length);
  if (!usados.length) return [['', sem]];
  return [...usados, ...(sem.length ? [['Outros', sem]] : [])];
}

export const somaDoado =(item) => (item.doacoes || []).reduce((a, d) => a + (Number(d.quantidade) || 0), 0);

// { doado, falta, completo }
export function situacao(item) {
  const doado = somaDoado(item);
  return { doado, falta: Math.max(0, item.quantidade - doado), completo: doado >= item.quantidade };
}

// Cor do item pelo quanto já tem doador: cinza ninguém doou, vermelho abaixo de 50%, amarelo de 50% a 99%, verde 100%.
export function corItem(item) {
  const { doado } = situacao(item);
  if (!doado) return 'nada';
  return faixaPct(Math.floor((doado * 100) / item.quantidade));
}
// Na ordem da legenda: [cor, emoji do WhatsApp, texto].
export const CORES_ITEM = [['nada', '⚪', 'ninguém doou'], ['baixo', '🔴', 'menos de 50%'], ['meio', '🟡', 'de 50% a 99%'], ['cheio', '🟢', 'completo']];

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

// Unidade do item (singular, plural). Vazio = sem unidade (itens antigos): a quantidade aparece só com o número.
export const UNIDADES = [['unidade', 'unidades'], ['dúzia', 'dúzias'], ['maço', 'maços'], ['pacote', 'pacotes'], ['caixa', 'caixas'], ['kg', 'kg'], ['litro', 'litros'], ['garrafa', 'garrafas']];
export const unidadeValida = (u) => !u || UNIDADES.some(([s]) => s === u);
// "24 unidades", "1 pacote"; sem unidade, só o número.
export function qtdTxt(n, unidade) {
  const u = UNIDADES.find(([s]) => s === unidade);
  return u ? `${n} ${Number(n) === 1 ? u[0] : u[1]}` : String(n);
}
// Antes do nome do item: "2 pacotes" ou, sem unidade, "2x".
export const qtdAntes = (n, unidade) => (unidade ? qtdTxt(n, unidade) : `${n}x`);
// Prévia do cadastro: o que a corrente vai ver.
export function previaItem({ nome, quantidade, unidade, entrega }) {
  const q = Number(quantidade) > 0 ? qtdTxt(Number(quantidade), unidade) : '?';
  return `${String(nome || '').trim() || '(nome do item)'} · ${q} · ${entrega ? `entregar até ${dataBR(entrega).slice(0, 5)}` : 'entrega no dia do evento'}`;
}

// Texto para o WhatsApp: itens, quantidade, responsáveis e data de entrega.
// detalhes: o texto da sub-aba, logo abaixo do cabeçalho.
export function textoOferenda(of, detalhes = '') {
  const L = [`*OFERENDA · ${of.titulo}*`, `${dataBR(of.data)} (${semana(of.data)})`, ...(of.responsavel ? [`Responsável: ${of.responsavel}`] : []), ''];
  if (detalhes) L.push(detalhes, '');
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
  porCategoria(of.itens, of.categorias).forEach(([cat, itens]) => {
    if (cat) L.push(`*${cat.toUpperCase()}*`);
    itens.forEach((i) => {
      const s = situacao(i);
      L.push(`${CORES_ITEM.find(([k]) => k === corItem(i))[1]} *${i.nome}* · ${s.doado} de ${qtdTxt(i.quantidade, i.unidade)}${i.entregue ? ' · ✅ entregue' : ''}`);
      L.push(`   Entrega: ${textoEntrega(i)}`);
      if (i.doacoes.length) L.push(`   ${i.doacoes.map((d) => `${d.nome} (${qtdTxt(d.quantidade, i.unidade)})`).join(', ')}`);
      if (!s.completo) L.push(`   Faltam ${qtdTxt(s.falta, i.unidade)}`);
      L.push('');
    });
  });
  const pend = of.itens.filter((i) => !situacao(i).completo).length;
  if (of.porMedium && !of.itens.length) return L.join('\n').trimEnd();
  L.push(pend ? `Faltam doadores em ${pend} ${pend === 1 ? 'item' : 'itens'}.` : 'Todos os itens já têm doadores. 🙏');
  return L.join('\n');
}
