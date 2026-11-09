// Regras de negócio do Sort Médiuns, sem dependência de banco nem de tela.
// Usado pelo backend (sorteio, remanejamento, validação) e pelo frontend
// (exibição, selos, exportação).
//
// Formato de uma gira:
//   { data: 'AAAA-MM-DD', entidade: '', presenca: { [pessoaId]: status },
//     pares:  [{ m: mediumId, c: camboneId, fixo, remanejado }],
//     passes: [{ m: mediumId, c: passeId,   fixo, remanejado }] }
// Status: p = Presente (padrão), na = Não atende, sup = Suporte, f = Falta, a = Ausente.

import { config } from './config.js';

export const FUNCOES = [
  { k: 'medium', label: 'Médium', pl: 'Médiuns' },
  { k: 'cambone', label: 'Cambone', pl: 'Cambones' },
  { k: 'passe', label: 'Passe', pl: 'Passe' },
  { k: 'senha', label: 'Senha', pl: 'Senha' },
  { k: 'extra', label: 'Extra', pl: 'Extras' },
];
// Curimba: cadastrada em Pessoas e nas turmas da limpeza, mas fora da presença, do sorteio e das contagens.
export const CURIMBA = 'curimba';
export const ehCurimba = (p) => p?.funcao === CURIMBA;
export const contaNaPresenca = (p) => !ehCurimba(p);
export const FUNCAO_KEYS = [...FUNCOES.map((f) => f.k), CURIMBA];
export const STATUS = { pend: 'Pendente', p: 'Presente', na: 'Não atende', sup: 'Suporte', f: 'Falta', a: 'Ausente' };
export const STATUS_KEYS = Object.keys(STATUS);

// Linhas (entidades) de trabalho. A entidade da gira é uma delas.
export const LINHAS = [
  {
    grupo: 'Linhas',
    itens: [
      ['preto-velho', 'Preto Velho'], ['malandro', 'Malandro'], ['baiano', 'Baiano'], ['cigano', 'Cigano'],
      ['marinheiro', 'Marinheiro'], ['boiadeiro', 'Boiadeiro'], ['eres', 'Erês'], ['caboclo', 'Caboclo'], ['mista', 'Encontro das Linhas'],
    ],
  },
  {
    grupo: 'Esquerda',
    itens: [['exu', 'Exu'], ['pomba-gira', 'Pomba Gira'], ['exu-mirim', 'Exu Mirim']],
  },
];
// Giras que não são de uma linha (gira interna, reunião). Nelas ninguém é convertido:
// cada um atua na própria função cadastrada.
export const GIRAS_ESPECIAIS = [['interna', 'Gira interna'], ['reuniao', 'Reunião obrigatória']];
const ESPECIAL_LABEL = Object.fromEntries(GIRAS_ESPECIAIS);
const ESPECIAIS_APELIDOS = { 'gira interna': 'interna', interna: 'interna', 'reuniao obrigatoria': 'reuniao', reuniao: 'reuniao' };
// Chave da gira especial ('interna', 'reuniao') ou null.
export const giraEspecial = (entidade) => ESPECIAIS_APELIDOS[normalizar(entidade)] || null;
export const ehGiraInterna = (entidade) => giraEspecial(entidade) === 'interna';
// Giras que juntam mais de uma linha. Só existem como gira (não se marcam na pessoa):
// quem tem qualquer uma das linhas juntas atua na própria função.
export const GIRAS_JUNTAS = [['exus-pombagira', 'Exus & Pombagira', ['exu', 'pomba-gira']]];
const JUNTAS = Object.fromEntries(GIRAS_JUNTAS.map(([k, , ls]) => [k, ls]));
// Nome do guia de atendimento da pessoa na linha desta gira (aba Perfil → Guias de atendimento).
// Gira junta (Exus & Pombagira): os das linhas dela. Sem nome cadastrado: ''.
// Se a pessoa escolheu a entidade da gira: "Exu : Tranca Rua", ou só "Exu" sem nome cadastrado nessa linha.
export function guiaNaGira(p, g) {
  const l = linhaDaEntidade(g?.entidade);
  if (!l || !p) return '';
  const G = p.guiasAtendimento || {};
  const escolhida = entidadeEscolhida(p, g);
  if (escolhida) {
    const nomeGuia = typeof G[escolhida] === 'string' ? G[escolhida].trim() : '';
    return nomeGuia ? `${LINHA_LABEL[escolhida]} : ${nomeGuia}` : LINHA_LABEL[escolhida];
  }
  return [l, ...(JUNTAS[l] || [])].map((k) => G[k]).filter((x) => typeof x === 'string' && x.trim()).join(' / ');
}
// Gira com mais de uma linha: as entidades que a pessoa pode escolher atender, como [chave, nome].
// Encontro das Linhas: todas as linhas; gira junta: só as dela; as outras giras (e evento): nenhuma.
export function linhasParaEscolher(g) {
  const l = linhaDaEntidade(g?.entidade);
  if (!l || g?.evento) return [];
  if (l === 'mista') return LINHAS.flatMap((x) => x.itens).filter(([k]) => k !== 'mista');
  return (JUNTAS[l] || []).map((k) => [k, LINHA_LABEL[k]]);
}
// Ignora escolha que deixou de valer (ex.: o admin trocou a entidade da gira).
export function entidadeEscolhida(p, g) {
  const k = (g?.atende || {})[p?.id];
  return k && linhasParaEscolher(g).some(([x]) => x === k) ? k : '';
}
// Opções do seletor "Gira / entidade do dia": as linhas, as juntas (na Esquerda) e as especiais.
export const OPCOES_GIRA = [
  ...LINHAS.map((g) => (g.grupo === 'Esquerda' ? { ...g, itens: [...g.itens, ...GIRAS_JUNTAS.map(([k, l]) => [k, l])] } : g)),
  { grupo: 'Outras', itens: GIRAS_ESPECIAIS },
];
const ENTIDADE_POR_CHAVE = Object.fromEntries([
  ...OPCOES_GIRA.flatMap((g) => g.itens),
]);
// Apelidos configuráveis mantêm a linha canônica para as regras da gira.
export function opcoesGira(aliases = []) {
  return OPCOES_GIRA.map((grupo) => {
    const chaves = new Set(grupo.itens.map(([chave]) => chave));
    const itens = grupo.itens.map(([, nome]) => [nome, nome, '']);
    aliases.filter((x) => chaves.has(x.linha)).forEach((x) => {
      const canonica = ENTIDADE_POR_CHAVE[x.linha];
      if (canonica && x.nome && x.nome !== canonica) itens.push([canonica, x.nome, x.nome]);
    });
    return { grupo: grupo.grupo, itens };
  });
}

// Orixás (em ordem alfabética). Só as giras das linhas (não Esquerda nem Outras) têm orixá.
export const ORIXAS = ['Iansã', 'Iemanjá', 'Nanã', 'Obá', 'Obaluaê', 'Ogum', 'Omulu', 'Oroiná', 'Oxalá', 'Oxóssi', 'Oxum', 'Oxumaré', 'Xangô'];
export const temOrixa = (g) => {
  const l = linhaDaEntidade(g?.entidade);
  return !!l && LINHAS.find((x) => x.grupo === 'Linhas').itens.some(([k]) => k === l);
};
// Orixá da gira para mostrar (vazio se a gira não leva orixá).
export const orixaDaGira = (g) => (temOrixa(g) && ORIXAS.includes(g.orixa) ? g.orixa : '');

// Linhas que dá para marcar no cadastro de Extra/Passe: todas as giras, menos Gira interna e Reunião.
export const LINHAS_CADASTRO = OPCOES_GIRA.filter((g) => g.grupo !== 'Outras');
export const LINHA_KEYS = LINHAS_CADASTRO.flatMap((g) => g.itens.map(([k]) => k));
export const LINHA_LABEL = Object.fromEntries([...LINHAS.flatMap((g) => g.itens), ...GIRAS_JUNTAS.map(([k, l]) => [k, l])]);

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const APELIDOS = {};
LINHAS.flatMap((g) => g.itens).forEach(([k, label]) => {
  const n = normalizar(label);
  APELIDOS[n] = k;
  APELIDOS[n.split(' ').map((w) => (w.endsWith('m') ? w.slice(0, -1) + 'ns' : w + 's')).join(' ')] = k;   // plural: "Pretos Velhos", "Exus Mirins"
  APELIDOS[n.replace(/ /g, '')] = k;                           // junto: "Pombagira"
});
APELIDOS[normalizar('Ere')] = 'eres';
APELIDOS[normalizar('Mista')] = 'mista';            // nome antigo de "Encontro das Linhas"
APELIDOS[normalizar('Gira mista')] = 'mista';
['Exus & Pombagira', 'Exus e Pombagiras', 'Exu e Pomba Gira', 'Exus e Pombas Giras', 'Exu & Pombagira', 'Exus e Pombagira']
  .forEach((t) => { APELIDOS[normalizar(t)] = 'exus-pombagira'; });
APELIDOS[normalizar('Erê')] = 'eres';

// Linha correspondente ao texto da entidade da gira (ou null se não for uma das linhas).
export function linhaDaEntidade(entidade) {
  return APELIDOS[normalizar(entidade)] || null;
}

// Nome para mostrar da gira (atualiza nomes antigos, ex.: "Mista" → "Encontro das Linhas").
export function nomeGira(entidade) {
  const l = linhaDaEntidade(entidade);
  if (l) return LINHA_LABEL[l];
  const e = giraEspecial(entidade);
  return e ? ESPECIAL_LABEL[e] : String(entidade || '');
}
export const nomeEntidadeGira = (g) => g?.entidadeNome || nomeGira(g?.entidade);
export const apelidoEntidade = (nome, aliases = []) => {
  const alvo = normalizar(nome);
  return aliases.find((x) => normalizar(x.nome) === alvo) || null;
};

// Extra e Passe marcam as linhas em que atuam nessa função ("Todas" = todas marcadas). Nas outras giras, cambonam.
// Nenhuma linha marcada = não está apto a nenhuma: cambona em toda gira de linha.
export const usaLinhas = (p) => (p.funcao === 'extra' || p.funcao === 'passe') && Array.isArray(p.linhas);

// Extra/Passe numa gira de linha que não marcou no cadastro.
export function foraDaLinha(p, g) {
  if (!usaLinhas(p)) return false;
  const linha = linhaDaEntidade(g.entidade);
  if (!linha) return false; // gira sem entidade definida: ninguém é convertido
  // Gira junta (ex.: Exus & Pombagira): vale quem marcou a própria gira junta ou qualquer uma das linhas dela.
  return ![linha, ...(JUNTAS[linha] || [])].some((l) => p.linhas.includes(l));
}
// Trocas de função só nesta gira (2º combo da presença): 'pas' → Passe (Extra, Cambone, Senha),
// 'ext' → At. Extra (Passe), 'sen' → Senha (Cambone). 'na' (Cambone / Não atende) cambona.
export const TROCAS_DIA = { pas: ['passe', ['extra', 'cambone', 'senha']], ext: ['extra', ['passe']], sen: ['senha', ['cambone']] };
export function funcaoNaGira(p, g) {
  // Já convertida (pessoasDaGira): não converte de novo.
  if (p.funcaoCadastro) return p.funcao;
  const r = (g.papeis || {})[p.id];
  if (TROCAS_DIA[r] && TROCAS_DIA[r][1].includes(p.funcao)) return TROCAS_DIA[r][0];
  // O admin pode manter a função do cadastro mesmo fora da linha (papeis[id] = 'cad').
  if ((g.papeis || {})[p.id] === 'cad') return p.funcao;
  return foraDaLinha(p, g) ? 'cambone' : p.funcao;
}

// Lista de pessoas com a função que cada uma exerce nesta gira.
// Entrada na corrente: antes dessa data a pessoa não conta na gira (nem presença, nem sorteio, nem limpeza).
// Saída: da data em diante também não; as giras anteriores continuam com ela.
export const naCorrenteEm = (p, data) => !data || ((!p?.entrada || p.entrada <= data) && (!p?.saida || data < p.saida));
export const daGira = (pessoas, g) => pessoas.filter((p) => naCorrenteEm(p, g.data));
// Quem entra pelo acesso da corrente declara a própria ausência: só em gira já criada e em aberto,
// estando Pendente, até o dia anterior ao evento (hoje = 'AAAA-MM-DD'), e enquanto ninguém marcou
// a presença dela (o último status vale; depois que está na lista de presença, só o admin muda).
export const statusMarcado = (p, g) => !!p && !!g && Object.prototype.hasOwnProperty.call(g.presenca || {}, p.id);
// Quem atende nesta gira (Médium ou At. Extra, na função do dia) escolhe a entidade enquanto a gira estiver aberta.
export const podeEscolherEntidade = (p, g) => !!p && !!g && !g.encerrada && linhasParaEscolher(g).length > 0
  && naCorrenteEm(p, g.data) && presente(p, g) && ['medium', 'extra'].includes(funcaoNaGira(p, g));
export const podeDeclararAusencia = (p, g, hoje) => !!p && !!g && !g.encerrada && !ehCurimba(p)
  && naCorrenteEm(p, g.data) && hoje < g.data && presencaDe(p, g) === 'pend' && !statusMarcado(p, g);

export function pessoasDaGira(pessoas, g) {
  return daGira(pessoas, g).map((p) => {
    const f = funcaoNaGira(p, g);
    return f === p.funcao ? p : { ...p, funcao: f, funcaoCadastro: p.funcao };
  });
}

export function giraVazia(data) {
  return { data, entidade: '', presenca: {}, papeis: {}, pares: [], passes: [], pendentePadrao: true };
}

export function ordenarPessoas(ps) {
  return [...ps].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Licença: a pessoa fica fora da gira (não entra no sorteio nem na escala) entre início e fim.
export function licencaEm(p, data) {
  if (!data) return null;
  return (p.licencas || []).find((l) => l.inicio <= data && data <= l.fim) || null;
}

// Na gira, cada pessoa tem duas coisas separadas:
//  - presença (g.presenca): pendente, presente, falta ou ausente ('lic' = de licença, vale sobre tudo);
//  - função do dia (g.papeis): a do cadastro, 'sup' (Suporte, fora do sorteio), 'na' (Não atende: cambona;
//    para o médium de passe aparece como "Cambone") ou 'pas' (Extra que atua como Passe nesta gira).
// Giras antigas guardavam 'sup'/'na' na própria presença: continuam valendo (como presente).
export function presencaDe(p, g) {
  if (licencaEm(p, g.data)) return 'lic';
  const v = (g.presenca || {})[p.id];
  if (v === 'sup' || v === 'na') return 'p';
  return ['pend', 'p', 'f', 'a'].includes(v) ? v : g.pendentePadrao ? 'pend' : 'p';
}
export function papelDe(p, g) {
  const r = (g.papeis || {})[p.id];
  if (r === 'sup' || r === 'na' || r === 'cad') return r;
  if (TROCAS_DIA[r] && TROCAS_DIA[r][1].includes(p.funcao)) return r;
  const v = (g.presenca || {})[p.id];
  if (v === 'sup' || v === 'na') return v;
  // Extra/Passe fora das linhas que marcou: entra como "Não atende" (está na gira e cambona).
  return foraDaLinha(p, g) ? 'na' : 'cad';
}
// Status para a escala: falta, ausência e licença valem primeiro; depois Suporte / Não atende; senão a presença.
export function status(p, g) {
  const pr = presencaDe(p, g);
  if (pr === 'lic' || pr === 'f' || pr === 'a') return pr;
  const papel = papelDe(p, g);
  return papel === 'cad' || TROCAS_DIA[papel] ? pr : papel;
}
// Pendente (presença ainda não confirmada) conta como presente na escala e no sorteio.
export const presente = (p, g) => { const s = status(p, g); return s === 'p' || s === 'pend'; };

// ---- Turma da limpeza (1 a 7)
// Cada pessoa pode ser de uma turma; o admin escolhe a turma responsável pela gira.
// Quem era da turma da gira anterior e não foi (Falta ou Ausente) ajuda a turma da gira atual.
// "Gira anterior" = a última gira antes desta com turma da limpeza definida
// (gira interna e reunião não têm limpeza e não contam).
export const TURMAS_LIMPEZA = [1, 2, 3, 4, 5, 6, 7];
export const temLimpeza = (g) => !giraEspecial(g?.entidade);

// Turma sugerida para uma gira nova: a seguinte à da última gira encerrada (antes desta data) com turma,
// em rodízio de 1 a 7, pulando turmas sem ninguém cadastrado. Sem histórico, a primeira turma com gente.
export function proximaTurma(pessoas, giras, data) {
  const comGente = TURMAS_LIMPEZA.filter((t) => pessoas.some((p) => Number(p.limpeza) === t));
  if (!comGente.length) return null;
  const ultima = (giras || []).filter((g) => g.encerrada && g.data < data && TURMAS_LIMPEZA.includes(Number(g.limpeza)))
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!ultima) return comGente[0];
  const t = Number(ultima.limpeza);
  return comGente.find((x) => x > t) ?? comGente[0];
}

// Última gira antes desta com turma da limpeza definida (ignora gira interna e reunião).
export function giraAnteriorComLimpeza(giras, data) {
  return (giras || []).filter((x) => x.data < data && temLimpeza(x) && TURMAS_LIMPEZA.includes(Number(x.limpeza)))
    .sort((a, b) => b.data.localeCompare(a.data))[0] || null;
}

// { turma, membros, deLicenca, ajudantes, anterior } ou null se a gira não tem turma definida.
export function limpezaDaGira(todas, g, giras) {
  const pessoas = daGira(todas, g);
  if (!temLimpeza(g) || !TURMAS_LIMPEZA.includes(Number(g.limpeza))) return null;
  const turma = Number(g.limpeza);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const daTurma = pessoas.filter((p) => Number(p.limpeza) === turma).sort(porNome);
  const membros = daTurma.filter((p) => !licencaEm(p, g.data));
  const deLicenca = daTurma.filter((p) => licencaEm(p, g.data));
  const anterior = giraAnteriorComLimpeza(giras, g.data);
  const ajudantes = anterior
    ? pessoas.filter((p) => !ehCurimba(p) && Number(p.limpeza) === Number(anterior.limpeza) && Number(p.limpeza) !== turma
      && ['f', 'a'].includes(status(p, anterior)) && !licencaEm(p, g.data)).sort(porNome)
    : [];
  return { turma, membros, deLicenca, ajudantes, anterior };
}
export const cambonaHoje = (p, g) => {
  const s = status(p, g);
  return ((s === 'p' || s === 'pend') && funcaoNaGira(p, g) === 'cambone') || s === 'na';
};
export const recebe = (p) => p.funcao === 'medium' || p.funcao === 'extra';
export const ehCambone = (p) => p.funcao === 'cambone';
// A dirigente da casa (Configurações da casa) vem sempre primeiro na lista de médiuns.
export const ehDirigente = (p) => normalizar(p?.nome) === normalizar(config().dirigente);
export function ordRecebe(a, b) {
  return (a.funcao === b.funcao ? 0 : a.funcao === 'medium' ? -1 : 1) || ehDirigente(b) - ehDirigente(a) || a.nome.localeCompare(b.nome, 'pt-BR');
}

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Histórico de cada dupla em giras ANTERIORES a "ate".
// Giras recentes pesam mais: a última pesa 1, a anterior 1/2, depois 1/3...
export function custos(giras, ate, campo = 'pares') {
  const h = giras
    .filter((g) => g.data < ate && g[campo] && g[campo].length)
    .sort((a, b) => b.data.localeCompare(a.data));
  const map = {};
  const ultimaDoMedium = {};
  h.forEach((g, k) => {
    g[campo].forEach((p) => {
      const key = p.m + '|' + p.c;
      const e = map[key] || (map[key] = { n: 0, peso: 0, ultima: null, recente: false });
      e.n++;
      e.peso += 1 / (k + 1);
      if (!e.ultima) e.ultima = g.data;
      if (ultimaDoMedium[p.m] === undefined) ultimaDoMedium[p.m] = g.data;
      if (ultimaDoMedium[p.m] === g.data) e.recente = true;
    });
  });
  return map;
}
// Custo da dupla = 4 × soma dos pesos + nº de vezes + 6 se repetiu da última gira do médium.
export function custo(map, m, c) {
  const e = map[m + '|' + c];
  return e ? e.peso * 4 + e.n + (e.recente ? 6 : 0) : 0;
}

// Distribui cada item de "big" entre os de "small" por igual, com o menor custo total.
// prefere (opcional): os de "small" que ficam com as sobras quando cada um recebe 1 e alguns recebem 2
// (médiuns com médium de passe junto ficam com o 2º cambone antes dos outros).
function balancear(big, small, cost, fixos, prefere = null) {
  const base = Math.floor(big.length / small.length);
  const extra = big.length % small.length;
  let best = [];
  let bestCost = Infinity;
  for (let t = 0; t < 600; t++) {
    const cnt = Object.fromEntries(small.map((s) => [s, 0]));
    const usados = new Set();
    const res = [];
    let total = 0;
    fixos.forEach((f) => {
      if (usados.has(f.b) || !(f.s in cnt)) return;
      usados.add(f.b);
      cnt[f.s]++;
      res.push({ b: f.b, s: f.s, fixo: true });
      total += cost(f.b, f.s);
    });
    let acima = small.filter((s) => cnt[s] > base).length;
    for (const b of shuffle(big.filter((x) => !usados.has(x)))) {
      let pick = null;
      let pc = Infinity;
      for (const s of small) {
        if (!(cnt[s] < base || (cnt[s] === base && acima < extra))) continue;
        const sobra = prefere && base === 1 && cnt[s] === base && !prefere.has(s) ? 1000 : 0;
        const v = cost(b, s) + sobra + Math.random() * 0.6;
        if (v < pc) { pc = v; pick = s; }
      }
      if (pick === null) {
        for (const s of small) {
          const v = Math.random();
          if (v < pc) { pc = v; pick = s; }
        }
      }
      if (cnt[pick] === base) acima++;
      cnt[pick]++;
      res.push({ b, s: pick, fixo: false });
      total += cost(b, pick);
    }
    if (total < bestCost - 1e-9) { bestCost = total; best = res; }
  }
  return best;
}

// Sorteio completo. Mantém só as duplas fixadas. Retorna o que mudar na gira.
export function sortear(pessoas, giras, g) {
  const ps = ordenarPessoas(pessoasDaGira(pessoas, g));
  const pres = ps.filter((p) => presente(p, g));
  const meds = pres.filter(recebe).map((p) => p.id);
  const cams = ps.filter((p) => cambonaHoje(p, g)).map((p) => p.id);
  const passes = pres.filter((p) => p.funcao === 'passe').map((p) => p.id);
  const hosts = pres.filter((p) => p.funcao === 'medium' && p.experiente).map((p) => p.id);
  const msgs = [];
  const patch = {};

  // Primeiro os médiuns de passe: quem fica com passe junto tem preferência para ter 2 cambones.
  const msgPasse = [];
  if (passes.length) {
    if (hosts.length) {
      const map = custos(giras, g.data, 'passes');
      const fx = (g.passes || []).filter((p) => p.fixo && hosts.includes(p.m) && passes.includes(p.c));
      const r = balancear(passes, hosts, (b, s) => custo(map, s, b), fx.map((f) => ({ b: f.c, s: f.m })));
      patch.passes = r.map((x) => ({ m: x.s, c: x.b, fixo: x.fixo }));
      msgPasse.push(patch.passes.length + ' médiuns de passe distribuídos');
    } else {
      msgPasse.push('nenhum médium marcado para ter passe junto');
    }
  }
  const comPasse = new Set((patch.passes || []).map((p) => p.m));

  if (meds.length && cams.length) {
    const map = custos(giras, g.data, 'pares');
    const fx = (g.pares || []).filter((p) => p.fixo && meds.includes(p.m) && cams.includes(p.c));
    const mm = meds.length >= cams.length;
    const r = mm
      ? balancear(meds, cams, (b, s) => custo(map, b, s), fx.map((f) => ({ b: f.m, s: f.c })))
      : balancear(cams, meds, (b, s) => custo(map, s, b), fx.map((f) => ({ b: f.c, s: f.m })), comPasse);
    patch.pares = r.map((x) => (mm ? { m: x.b, c: x.s, fixo: x.fixo } : { m: x.s, c: x.b, fixo: x.fixo }));
    msgs.push(patch.pares.filter((p) => !map[p.m + '|' + p.c]).length + ' de ' + patch.pares.length + ' duplas novas');
  } else {
    msgs.push(!meds.length ? 'nenhum médium presente' : 'nenhum cambone presente');
  }
  msgs.push(...msgPasse);
  return { patch, mensagem: 'Sorteado: ' + msgs.join('; ') + '.' };
}

// Remanejamento de última hora: mantém as duplas válidas e realoca só quem foi afetado.
export function remanejar(pessoas, giras, g) {
  const all = ordenarPessoas(pessoasDaGira(pessoas, g));
  const nome = (id) => all.find((p) => p.id === id)?.nome || '(removido)';
  const pr = { ...(g.presenca || {}) };
  const pa = { ...(g.papeis || {}) };
  const gx = { ...g, presenca: pr, papeis: pa };
  const R = all.filter((p) => presente(p, gx) && recebe(p)).map((p) => p.id);
  const C = new Set(all.filter((p) => cambonaHoje(p, gx)).map((p) => p.id));
  if (!R.length) return { patch: null, mensagem: 'Nenhum médium presente.' };

  const map = custos(giras, g.data, 'pares');
  let pares = (g.pares || []).filter((p) => R.includes(p.m) && C.has(p.c)).map((p) => ({ ...p }));
  const notas = [];
  const camsDe = (m) => pares.filter((p) => p.m === m);
  const medsDe = (c) => pares.filter((p) => p.c === c);
  const best = (xs, f) => {
    let b = null;
    let bv = Infinity;
    xs.forEach((x) => {
      const v = f(x) + Math.random() * 0.3;
      if (v < bv) { bv = v; b = x; }
    });
    return b;
  };
  const add = (m, c) => pares.push({ m, c, fixo: false, remanejado: true });
  const tira = (p) => { pares = pares.filter((x) => x !== p); };
  let livres = [...C].filter((c) => !medsDe(c).length);

  // 1) nenhum médium sem cambone
  for (const m of shuffle(R.filter((m) => !camsDe(m).length))) {
    if (livres.length) {
      const c = best(livres, (c) => custo(map, m, c));
      livres = livres.filter((x) => x !== c);
      add(m, c);
      continue;
    }
    const doa = pares.filter((p) => camsDe(p.m).length >= 2);
    if (doa.length) {
      const pp = best(doa, (p) => (p.fixo ? 50 : 0) + custo(map, m, p.c));
      tira(pp);
      add(m, pp.c);
      notas.push(nome(pp.c) + ' saiu de ' + nome(pp.m));
      continue;
    }
    const sup = all.filter((p) => status(p, gx) === 'sup');
    if (sup.length) {
      const s = best(sup, (p) => (p.funcao === 'cambone' ? 0 : 5) + custo(map, m, p.id));
      if (pr[s.id] === 'sup') pr[s.id] = 'p';   // formato antigo
      if (s.funcao === 'cambone') delete pa[s.id]; else pa[s.id] = 'na';
      C.add(s.id);
      add(m, s.id);
      notas.push(s.nome + ' saiu do suporte');
      continue;
    }
    if (C.size) {
      const c = best([...C], (c) => medsDe(c).length * 10 + custo(map, m, c));
      add(m, c);
      notas.push(nome(c) + ' acompanha dois médiuns');
      continue;
    }
    notas.push(nome(m) + ' ficou sem cambone');
  }
  // 2) cambones livres aliviam quem acompanha dois médiuns
  while (livres.length) {
    const comp = pares.filter((p) => !p.fixo && medsDe(p.c).length >= 2);
    if (!comp.length) break;
    const pp = best(comp, (p) => -medsDe(p.c).length);
    const c = best(livres, (c) => custo(map, pp.m, c));
    tira(pp);
    add(pp.m, c);
    livres = livres.filter((x) => x !== c);
  }
  // 3) cambones livres vão para médiuns com um só cambone (máximo dois); quem tem médium de passe junto vem antes
  const comPasse = new Set((g.passes || []).map((p) => p.m));
  while (livres.length) {
    const alvo = R.filter((m) => camsDe(m).length < 2);
    if (!alvo.length) break;
    const c = livres[0];
    const m = best(alvo, (m) => camsDe(m).length * 100 + (comPasse.has(m) ? 0 : 50) + custo(map, m, c));
    add(m, c);
    livres.shift();
  }
  // 4) excedente vai para o suporte
  livres.forEach((c) => {
    pa[c] = 'sup';
    notas.push(nome(c) + ' foi para o suporte');
  });

  // Médiuns de passe cujo médium faltou vão para o médium experiente com menos passes
  const hosts = all.filter((p) => presente(p, gx) && p.funcao === 'medium' && p.experiente).map((p) => p.id);
  const passeIds = all.filter((p) => presente(p, gx) && p.funcao === 'passe').map((p) => p.id);
  const passes = (g.passes || []).filter((p) => hosts.includes(p.m) && passeIds.includes(p.c)).map((p) => ({ ...p }));
  const mapP = custos(giras, g.data, 'passes');
  passeIds
    .filter((id) => !passes.some((p) => p.c === id))
    .forEach((id) => {
      if (!hosts.length) { notas.push(nome(id) + ' (passe) ficou sem médium'); return; }
      const m = best(hosts, (h) => passes.filter((p) => p.m === h).length * 10 + custo(mapP, h, id));
      passes.push({ m, c: id, fixo: false, remanejado: true });
    });

  const n = pares.filter((p) => p.remanejado).length + passes.filter((p) => p.remanejado).length;
  const mensagem = n || notas.length
    ? 'Remanejado: ' + n + ' ajuste(s)' + (notas.length ? '. ' + notas.join('; ') : '') + '.'
    : 'Nada a remanejar.';
  return { patch: { pares, passes, presenca: pr, papeis: pa }, mensagem };
}

// Agrupa as duplas válidas por médium, para exibir e exportar.
export function paresPorMedium(pessoas, g) {
  const ps = ordenarPessoas(pessoasDaGira(pessoas, g));
  const pres = ps.filter((p) => presente(p, g));
  const ids = new Set(ps.filter((p) => presente(p, g) || status(p, g) === 'na').map((p) => p.id));
  const meds = pres.filter(recebe).sort(ordRecebe);
  const validos = (g.pares || []).filter((p) => ids.has(p.m) && ids.has(p.c));
  const passeIds = pres.filter((p) => p.funcao === 'passe').map((p) => p.id);
  const passesV = (g.passes || []).filter((p) => ids.has(p.m) && passeIds.includes(p.c));
  const invalidos = (g.pares || []).length - validos.length + (g.passes || []).length - passesV.length;
  const semPasse = passeIds.filter((id) => !passesV.some((p) => p.c === id));
  return {
    meds, validos, passesV, semPasse, invalidos,
    lista: meds.map((m) => ({ m, cams: validos.filter((p) => p.m === m.id), passes: passesV.filter((p) => p.m === m.id) })),
  };
}

// Escala travada: marcar falta ou ausência não muda a escala. Para mostrar (tela, texto e imagem),
// quem está nas duplas segue como foi sorteado. Na gira sem trava, nada muda.
export function escalaDaGira(g) {
  if (!g.travada) return g;
  const presenca = { ...(g.presenca || {}) };
  [...(g.pares || []), ...(g.passes || [])].flatMap((p) => [p.m, p.c]).forEach((id) => {
    if (presenca[id] === 'f' || presenca[id] === 'a') presenca[id] = 'p';
  });
  return { ...g, presenca };
}

// Encerrar a gira: todo presente precisa aparecer na escala.
// Quem estava para cambonar (ou médium de passe) e não ficou com nenhum médium vai para o Suporte.
// Quem ainda está com a presença pendente (não pode encerrar a gira assim).
export const pendentesDaGira = (pessoas, g) => daGira(pessoas, g).filter((p) => contaNaPresenca(p) && presencaDe(p, g) === 'pend');

// Duplas que envolvem quem faltou ou mudou de status são descartadas.
export function encerrar(pessoas, g) {
  const ps = ordenarPessoas(pessoasDaGira(pessoas, g));
  const { validos, passesV } = paresPorMedium(pessoas, g);
  const cambonando = new Set(validos.map((p) => p.c));
  const comMedium = new Set(passesV.map((p) => p.c));
  const presenca = { ...(g.presenca || {}) };
  const papeis = { ...(g.papeis || {}) };
  const movidos = [];
  const suporteAuto = {};   // id -> função do dia de antes ('cad' ou 'na'), para voltar ao reabrir
  // Quem ainda estava pendente ao encerrar fica como presente.
  ps.forEach((p) => { if (presencaDe(p, g) === 'pend' && contaNaPresenca(p)) presenca[p.id] = 'p'; });
  ps.forEach((p) => {
    const semCambonar = cambonaHoje(p, g) && !cambonando.has(p.id);
    const passeSolto = presente(p, g) && p.funcao === 'passe' && !comMedium.has(p.id);
    if (semCambonar || passeSolto) {
      suporteAuto[p.id] = papelDe(p, g);
      if (presenca[p.id] === 'na') presenca[p.id] = 'p';   // formato antigo
      papeis[p.id] = 'sup';
      movidos.push(p.nome);
    }
  });
  const mensagem = 'Gira encerrada.' + (movidos.length
    ? ` ${movidos.length === 1 ? 'Foi' : 'Foram'} para o Suporte (sem médium): ${movidos.join(', ')}.`
    : ' Todos os presentes estão na escala.');
  return { patch: { presenca, papeis, pares: validos, passes: passesV, encerrada: true, suporteAuto }, movidos, mensagem };
}

// Reabrir: quem foi para o Suporte ao encerrar (e ainda está lá) volta ao status de antes.
export function reabrir(pessoas, g) {
  const presenca = { ...(g.presenca || {}) };
  const papeis = { ...(g.papeis || {}) };
  const nomes = [];
  for (const [id, antes] of Object.entries(g.suporteAuto || {})) {
    if (papeis[id] === 'sup') {
      if (antes === 'na' || TROCAS_DIA[antes]) papeis[id] = antes; else delete papeis[id];
    } else if (presenca[id] === 'sup') {
      presenca[id] = antes === 'cad' ? 'p' : antes;   // formato antigo
    } else continue;
    const p = pessoas.find((x) => x.id === id);
    if (p) nomes.push(p.nome);
  }
  nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const mensagem = 'Gira reaberta.' + (nomes.length ? ` ${nomes.length === 1 ? 'Voltou' : 'Voltaram'} do Suporte: ${nomes.join(', ')}.` : '');
  return { patch: { presenca, papeis, encerrada: false, suporteAuto: {} }, mensagem };
}

// Sugestão de Passe / Atendimento extra para a gira (aba Gira, admin), pelo que cada um marcou no Perfil
// ("100% de afinidade e segurança") para a linha da gira. Quem já é Passe no cadastro não entra no Passe.
// PASSE: Cambone que marcou a linha no bloco Passe; At. Extra que NÃO marcou a linha no Atendimento extra
// (quem marcou "Todas" não entra; quem não marcou nenhuma entra).
// ATENDIMENTO EXTRA: Passe que marcou a linha no bloco Atendimento extra. Cada um vem com o nome da entidade,
// a presença no ano (pct) e quantas giras desta linha já foi (nGiras), contando as giras anteriores a esta.
// perfis ({ [pessoaId]: perfil }, só o admin tem): oferendas feitas do orixá de frente, ancestral, adjunto,
// do guia chefe e do guia de frente (null sem perfis).
// Ordem: oferenda do orixá de frente; mais oferendas de orixás; mais oferendas de guias; Guia chefe, Guia de frente,
// sem rótulo; quem tem nome da entidade; maior presença; mais giras da linha; nome.
export function sugestoesDaGira(pessoas, g, giras = [], perfis = null) {
  const l = linhaDaEntidade(g?.entidade);
  if (!l) return null;
  const alvo = [l, ...(JUNTAS[l] || [])];
  const tem = (arr) => (arr || []).some((x) => alvo.includes(x));
  const fora = (p) => !naCorrenteEm(p, g.data) || ['lic', 'f', 'a'].includes(presencaDe(p, g));
  const antes = (giras || []).filter((x) => x.data < g.data);
  const daLinha = antes.filter((x) => { const lx = linhaDaEntidade(x.entidade); return alvo.includes(lx) || (JUNTAS[lx] || []).includes(l); });
  // guias: rótulos "Guia chefe" / "Guia de frente" quando o guia do Perfil é da linha da gira (não muda quem aparece).
  const guias = (p) => [alvo.includes(p.guiaChefe) && 'Guia chefe', alvo.includes(p.guiaFrente) && 'Guia de frente'].filter(Boolean);
  const oferendas = (p) => {
    if (!perfis) return null;
    const pf = perfis[p.id] || {};
    const o = (k) => !!pf.orixas?.[k]?.oferenda;
    return { frente: o('frente'), ancestral: o('ancestral'), adjunto: o('adjunto'), chefe: !!pf.guias?.chefe?.oferenda, guiaFrente: !!pf.guias?.frente?.oferenda };
  };
  const item = (p) => {
    const nomeEnt = guiaNaGira(p, g);
    return { id: p.id, nome: p.nome, funcao: p.funcao, entidade: nomeEnt || LINHA_LABEL[l], temNome: !!nomeEnt, guias: guias(p),
      ...presencaNoAno(p, antes, g.data), nGiras: daLinha.filter((x) => naCorrenteEm(p, x.data) && presencaDe(p, x) === 'p').length,
      oferendas: oferendas(p) };
  };
  const nivel = (x) => (x.guias.includes('Guia chefe') ? 0 : x.guias.length ? 1 : 2);
  const of = (x, k) => (x.oferendas?.[k] ? 1 : 0);
  const ord = (a, b) => of(b, 'frente') - of(a, 'frente')
    || (of(b, 'ancestral') + of(b, 'adjunto')) - (of(a, 'ancestral') + of(a, 'adjunto'))
    || (of(b, 'chefe') + of(b, 'guiaFrente')) - (of(a, 'chefe') + of(a, 'guiaFrente'))
    || nivel(a) - nivel(b) || b.temNome - a.temNome || (b.pct ?? -1) - (a.pct ?? -1)
    || b.nGiras - a.nGiras || a.nome.localeCompare(b.nome, 'pt-BR');
  const passe = pessoas.filter((p) => !fora(p) && ((p.funcao === 'cambone' && tem(p.afinidadePasse)) || (p.funcao === 'extra' && !tem(p.linhas)))).map(item).sort(ord);
  const extra = pessoas.filter((p) => !fora(p) && p.funcao === 'passe' && tem(p.afinidadeExtra)).map(item).sort(ord);
  return { linha: l, passe, extra };
}

// Presença da pessoa no ano de "data", nas giras antes dessa data: { pres, base, pct } (licença e pendente não contam).
export function presencaNoAno(p, giras, data) {
  let pres = 0, base = 0;
  (giras || []).forEach((g) => {
    if (g.data >= data || g.data.slice(0, 4) !== data.slice(0, 4) || !naCorrenteEm(p, g.data)) return;
    const st = presencaDe(p, g);
    if (st === 'lic' || st === 'pend') return;
    base++;
    if (st === 'p') pres++;
  });
  return { pres, base, pct: base ? Math.round((pres / base) * 100) : null };
}
