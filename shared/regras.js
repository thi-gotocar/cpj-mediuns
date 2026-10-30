// Regras de negócio do Sort Médiuns, sem dependência de banco nem de tela.
// Usado pelo backend (sorteio, remanejamento, validação) e pelo frontend
// (exibição, selos, exportação).
//
// Formato de uma gira:
//   { data: 'AAAA-MM-DD', entidade: '', presenca: { [pessoaId]: status },
//     pares:  [{ m: mediumId, c: camboneId, fixo, remanejado }],
//     passes: [{ m: mediumId, c: passeId,   fixo, remanejado }] }
// Status: p = Presente (padrão), na = Não atende, sup = Suporte, f = Falta, a = Ausente.

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
// Opções do seletor "Gira / entidade do dia": as linhas, as juntas (na Esquerda) e as especiais.
export const OPCOES_GIRA = [
  ...LINHAS.map((g) => (g.grupo === 'Esquerda' ? { ...g, itens: [...g.itens, ...GIRAS_JUNTAS.map(([k, l]) => [k, l])] } : g)),
  { grupo: 'Outras', itens: GIRAS_ESPECIAIS },
];

// Orixás (em ordem alfabética). Só as giras das linhas (não Esquerda nem Outras) têm orixá.
export const ORIXAS = ['Iansã', 'Iemanjá', 'Nanã', 'Obaluaê', 'Ogum', 'Omulu', 'Oroiná', 'Oxalá', 'Oxóssi', 'Oxum', 'Oxumaré', 'Xangô'];
export const temOrixa = (g) => {
  const l = linhaDaEntidade(g?.entidade);
  return !!l && LINHAS.find((x) => x.grupo === 'Linhas').itens.some(([k]) => k === l);
};
// Orixá da gira para mostrar (vazio se a gira não leva orixá).
export const orixaDaGira = (g) => (temOrixa(g) && ORIXAS.includes(g.orixa) ? g.orixa : '');

export const LINHA_KEYS = LINHAS.flatMap((g) => g.itens.map(([k]) => k));
export const LINHA_LABEL = Object.fromEntries([...LINHAS.flatMap((g) => g.itens), ...GIRAS_JUNTAS.map(([k, l]) => [k, l])]);

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
const APELIDOS = {};
LINHAS.flatMap((g) => g.itens).forEach(([k, label]) => {
  const n = normalizar(label);
  APELIDOS[n] = k;
  APELIDOS[n.split(' ').map((w) => w + 's').join(' ')] = k;   // plural: "Pretos Velhos"
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

// Extra e Passe podem ter as linhas em que atuam nessa função. Nas outras giras, cambonam.
// Sem nenhuma linha marcada, a pessoa atua sempre na própria função.
export const usaLinhas = (p) => (p.funcao === 'extra' || p.funcao === 'passe') && Array.isArray(p.linhas) && p.linhas.length > 0;

export function funcaoNaGira(p, g) {
  if (!usaLinhas(p)) return p.funcao;
  const linha = linhaDaEntidade(g.entidade);
  if (!linha) return p.funcao; // gira sem entidade definida: ninguém é convertido
  return (JUNTAS[linha] || [linha]).some((l) => p.linhas.includes(l)) ? p.funcao : 'cambone';
}

// Lista de pessoas com a função que cada uma exerce nesta gira.
// Entrada na corrente: antes dessa data a pessoa não conta na gira (nem presença, nem sorteio, nem limpeza).
export const naCorrenteEm = (p, data) => !p?.entrada || !data || p.entrada <= data;
export const daGira = (pessoas, g) => pessoas.filter((p) => naCorrenteEm(p, g.data));

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
//  - função do dia (g.papeis): a do cadastro, 'sup' (Suporte, fora do sorteio) ou 'na' (Não atende: cambona).
// Giras antigas guardavam 'sup'/'na' na própria presença: continuam valendo (como presente).
export function presencaDe(p, g) {
  if (licencaEm(p, g.data)) return 'lic';
  const v = (g.presenca || {})[p.id];
  if (v === 'sup' || v === 'na') return 'p';
  return ['pend', 'p', 'f', 'a'].includes(v) ? v : g.pendentePadrao ? 'pend' : 'p';
}
export function papelDe(p, g) {
  const r = (g.papeis || {})[p.id];
  if (r === 'sup' || r === 'na') return r;
  const v = (g.presenca || {})[p.id];
  return v === 'sup' || v === 'na' ? v : 'cad';
}
// Status para a escala: falta, ausência e licença valem primeiro; depois Suporte / Não atende; senão a presença.
export function status(p, g) {
  const pr = presencaDe(p, g);
  if (pr === 'lic' || pr === 'f' || pr === 'a') return pr;
  const papel = papelDe(p, g);
  return papel === 'cad' ? pr : papel;
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
  return ((s === 'p' || s === 'pend') && p.funcao === 'cambone') || s === 'na';
};
export const recebe = (p) => p.funcao === 'medium' || p.funcao === 'extra';
export const ehCambone = (p) => p.funcao === 'cambone';
export function ordRecebe(a, b) {
  return (a.funcao === b.funcao ? 0 : a.funcao === 'medium' ? -1 : 1) || a.nome.localeCompare(b.nome, 'pt-BR');
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
function balancear(big, small, cost, fixos) {
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
        const v = cost(b, s) + Math.random() * 0.6;
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

  if (meds.length && cams.length) {
    const map = custos(giras, g.data, 'pares');
    const fx = (g.pares || []).filter((p) => p.fixo && meds.includes(p.m) && cams.includes(p.c));
    const mm = meds.length >= cams.length;
    const r = mm
      ? balancear(meds, cams, (b, s) => custo(map, b, s), fx.map((f) => ({ b: f.m, s: f.c })))
      : balancear(cams, meds, (b, s) => custo(map, s, b), fx.map((f) => ({ b: f.c, s: f.m })));
    patch.pares = r.map((x) => (mm ? { m: x.b, c: x.s, fixo: x.fixo } : { m: x.s, c: x.b, fixo: x.fixo }));
    msgs.push(patch.pares.filter((p) => !map[p.m + '|' + p.c]).length + ' de ' + patch.pares.length + ' duplas novas');
  } else {
    msgs.push(!meds.length ? 'nenhum médium presente' : 'nenhum cambone presente');
  }

  if (passes.length) {
    if (hosts.length) {
      const map = custos(giras, g.data, 'passes');
      const fx = (g.passes || []).filter((p) => p.fixo && hosts.includes(p.m) && passes.includes(p.c));
      const r = balancear(passes, hosts, (b, s) => custo(map, s, b), fx.map((f) => ({ b: f.c, s: f.m })));
      patch.passes = r.map((x) => ({ m: x.s, c: x.b, fixo: x.fixo }));
      msgs.push(patch.passes.length + ' médiuns de passe distribuídos');
    } else {
      msgs.push('nenhum médium marcado para ter passe junto');
    }
  }
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
  // 3) cambones livres vão para médiuns com um só cambone (máximo dois)
  while (livres.length) {
    const alvo = R.filter((m) => camsDe(m).length < 2);
    if (!alvo.length) break;
    const c = livres[0];
    const m = best(alvo, (m) => camsDe(m).length * 10 + custo(map, m, c));
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
      if (antes === 'na') papeis[id] = 'na'; else delete papeis[id];
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
