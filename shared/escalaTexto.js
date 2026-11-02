// Histórico → Cadastrar escala: lê o texto da escala de atendimentos (colado) para gravar quem cambonou quem.
// Formato esperado (um item por linha, com ou sem marcador "*"):
//   Orixá / Gira do dia: Exus Mirins · Data: 28/out · Senha: BETE
//   seção de passe:      Elaine T5: Elisabeth T6
//   quem cambonou quem:  Erika: Amanda T8 e Akeline T8 · Cris: ? / ? · Gabi T7: X / X · Michelle: não atende
//   atendimentos extras: (mesmo formato)
//   suporte:             um nome por linha
// "X" = sem cambone; "?" = cambone não informado (o admin escolhe na conferência).

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n) => String(n).padStart(2, '0');
// Tira marcador de lista, estrela de "quem recebe" e espaços sobrando.
const limpar = (s) => String(s || '').replace(/^[\s*•·★☆\-–—]+/, '').replace(/[★☆]/g, '').replace(/\s+/g, ' ').trim();

// "28/out", "28/10", "28/10/2026", "28 de outubro" → { data: 'AAAA-MM-DD', semAno }.
// Sem ano: o deste ano, ou o do ano passado se a data ainda não chegou (a escala é de gira que já foi).
export function lerDataEscala(txt, hoje) {
  const m = semAcento(txt).match(/(\d{1,2})\s*(?:[/.-]|de)?\s*([a-z]{3,}|\d{1,2})\.?(?:\s*(?:[/.-]|de)\s*(\d{4}|\d{2}))?/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MESES.indexOf(m[2].slice(0, 3)) + 1;
  if (!mes || mes > 12) return null;
  let ano = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(hoje.slice(0, 4));
  const valida = (a) => { const x = new Date(Date.UTC(a, mes - 1, dia)); return x.getUTCMonth() === mes - 1 && x.getUTCDate() === dia; };
  if (!m[3] && `${ano}-${pad(mes)}-${pad(dia)}` > hoje) ano -= 1;
  if (!valida(ano)) return null;
  return { data: `${ano}-${pad(mes)}-${pad(dia)}`, semAno: !m[3] };
}

// Lado direito de "Médium: ...": cambones, quantos "?" e se o médium não atende.
function lerCambones(dir) {
  const t = limpar(dir.replace(/\([^)]*\)/g, ' '));
  if (/n[aã]o atende/i.test(t)) return { cambones: [], desconhecidos: 0, naoAtende: true };
  const partes = t.split(/\s*\/\s*|\s*,\s*|\s+e\s+/i).map(limpar).filter(Boolean);
  return {
    cambones: partes.filter((x) => !/^[x?]$/i.test(x)),
    desconhecidos: partes.filter((x) => x === '?').length,
    naoAtende: false,
  };
}

export function lerEscala(texto, hoje) {
  const r = { data: null, semAno: false, gira: '', senha: '', passes: [], cambones: [], extras: [], suporte: [] };
  let secao = '';
  for (const bruta of String(texto || '').split(/\r?\n/)) {
    const linha = limpar(bruta);
    if (!linha || linha.startsWith('(')) continue;   // observação entre parênteses
    const s = semAcento(linha);
    const doisPontos = linha.indexOf(':');
    // Título de seção (sem "nome: valor"; o do suporte pode trazer os nomes depois dos dois-pontos).
    if (doisPontos < 0 || /^suporte\s*:/.test(s)) {
      let nova = '';
      if (/^informac/.test(s)) nova = 'info';
      else if (/extra/.test(s)) nova = 'extras';
      else if (/cambonou|escala principal/.test(s)) nova = 'cambones';
      else if (/passe/.test(s)) nova = 'passe';
      else if (/^suporte/.test(s)) nova = 'suporte';
      if (nova) {
        secao = nova;
        if (nova === 'suporte' && doisPontos >= 0) r.suporte.push(...linha.slice(doisPontos + 1).split(/[,;]/).map(limpar).filter(Boolean));
        continue;
      }
    }
    if (secao === 'suporte') { r.suporte.push(linha); continue; }
    if (doisPontos < 0) continue;
    const esq = limpar(linha.slice(0, doisPontos));
    const dir = linha.slice(doisPontos + 1).trim();
    const chave = semAcento(esq);
    if (secao === '' || secao === 'info') {
      if (/^data/.test(chave)) { const d = lerDataEscala(dir, hoje); if (d) { r.data = d.data; r.semAno = d.semAno; } continue; }
      if (/^senha/.test(chave)) { r.senha = limpar(dir); continue; }
      if (/orix|gira|entidade/.test(chave)) { r.gira = limpar(dir); continue; }
      continue;
    }
    if (secao === 'passe') {
      const passe = lerCambones(dir).cambones[0];
      if (passe) r.passes.push({ medium: esq, passe });
      continue;
    }
    (secao === 'extras' ? r.extras : r.cambones).push({ nome: esq, ...lerCambones(dir) });
  }
  return r;
}

// Todos os nomes que aparecem na escala (cada um uma vez), para ligar às pessoas da corrente.
export function nomesDaEscala(r) {
  const nomes = [
    ...r.cambones.flatMap((x) => [x.nome, ...x.cambones]),
    ...r.extras.flatMap((x) => [x.nome, ...x.cambones]),
    ...r.passes.flatMap((x) => [x.medium, x.passe]),
    ...r.suporte,
    ...(r.senha ? [r.senha] : []),
  ];
  return [...new Set(nomes)];
}

// Monta o que vai para a gira, com os nomes já ligados às pessoas.
//   idDe(nome lido) → id da pessoa (ou '' para ignorar); escolhidosInterrogacao: { 'Cris#0': id } dos "?";
//   pessoas: para saber a função do cadastro de cada um.
// A função do dia (papeis) segue o que a pessoa fez: médium/extra que não atende e quem cambona fora da
// própria função = 'na'; suporte = 'sup'; quem fez passe sem ser de passe = 'pas'; cambone na senha = 'sen'.
export function montarEscala(r, idDe, escolhidosInterrogacao, pessoas) {
  const funcao = (id) => pessoas.find((p) => p.id === id)?.funcao;
  const pares = [], passes = [], papeis = {}, presentes = new Set();
  const marca = (id) => { if (id) presentes.add(id); return id; };
  const par = (lista, m, c) => { if (m && c && m !== c && !lista.some((d) => d.m === m && d.c === c)) lista.push({ m, c }); };
  for (const [grupo, itens] of [['medium', r.cambones], ['extra', r.extras]]) {
    for (const x of itens) {
      const m = marca(idDe(x.nome));
      if (!m) continue;
      if (x.naoAtende) { papeis[m] = 'na'; continue; }
      // Extra/Passe que atendeu na própria função: 'cad' (senão, fora das linhas que marcou, viraria "Não atende").
      if (grupo === 'extra') papeis[m] = funcao(m) === 'passe' ? 'ext' : 'cad';
      x.cambones.forEach((nm) => par(pares, m, marca(idDe(nm))));
      for (let i = 0; i < x.desconhecidos; i++) par(pares, m, marca(escolhidosInterrogacao[`${x.nome}#${i}`] || ''));
    }
  }
  r.passes.forEach((x) => par(passes, marca(idDe(x.medium)), marca(idDe(x.passe))));
  // Quem cambonou fora da própria função não atende (cambona); quem fez passe sem ser de passe, atua como passe.
  for (const d of pares) if (funcao(d.c) !== 'cambone' && !papeis[d.c]) papeis[d.c] = 'na';
  for (const d of passes) papeis[d.c] = ['extra', 'cambone', 'senha'].includes(funcao(d.c)) ? 'pas' : 'cad';
  r.suporte.forEach((nm) => { const id = marca(idDe(nm)); if (id) papeis[id] = 'sup'; });
  const senha = marca(r.senha ? idDe(r.senha) : '');
  if (senha && funcao(senha) === 'cambone') papeis[senha] = 'sen';
  return { pares, passes, papeis, presentes: [...presentes] };
}
