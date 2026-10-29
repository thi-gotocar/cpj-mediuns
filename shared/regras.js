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
export const FUNCAO_KEYS = FUNCOES.map((f) => f.k);
export const STATUS = { p: 'Presente', na: 'Não atende', sup: 'Suporte', f: 'Falta', a: 'Ausente' };
export const STATUS_KEYS = Object.keys(STATUS);

export function giraVazia(data) {
  return { data, entidade: '', presenca: {}, pares: [], passes: [] };
}

export function ordenarPessoas(ps) {
  return [...ps].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function status(p, g) {
  const v = (g.presenca || {})[p.id];
  return STATUS_KEYS.includes(v) ? v : 'p';
}
export const presente = (p, g) => status(p, g) === 'p';
export const cambonaHoje = (p, g) => {
  const s = status(p, g);
  return (s === 'p' && p.funcao === 'cambone') || s === 'na';
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
  const ps = ordenarPessoas(pessoas);
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
  const all = ordenarPessoas(pessoas);
  const nome = (id) => all.find((p) => p.id === id)?.nome || '(removido)';
  const pr = { ...(g.presenca || {}) };
  const gx = { presenca: pr };
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
      pr[s.id] = s.funcao === 'cambone' ? 'p' : 'na';
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
    pr[c] = 'sup';
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
  return { patch: { pares, passes, presenca: pr }, mensagem };
}

// Agrupa as duplas válidas por médium, para exibir e exportar.
export function paresPorMedium(pessoas, g) {
  const ps = ordenarPessoas(pessoas);
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
