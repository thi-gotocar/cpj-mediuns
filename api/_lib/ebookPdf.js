// Marca d'água no PDF do e-book, sem dependências: uma "atualização incremental" (o PDF original fica intacto e,
// no fim, vão as páginas reescritas com um conteúdo a mais, a fonte, a transparência e uma tabela xref nova).
// Cada página ganha o nome e o e-mail de quem comprou em diagonal, bem claros, e uma linha no rodapé com o número da compra.
//
// Só lê PDF com a tabela xref clássica, sem criptografia (o caso do PDF exportado pelo Chrome/PDFium); o upload
// do Admin root roda a marca uma vez e recusa o arquivo que não der certo.

const ESPACO = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set('()<>[]{}/%'.split('').map((c) => c.charCodeAt(0)));

class ErroPdf extends Error {}

// ---------- leitura dos objetos ----------
// Valores: { t: 'dict', v: Map } · { t: 'arr', v: [] } · { t: 'ref', n, g } · { t: 'raw', s } (número, nome, texto, booleano…)
function lerValor(s, i) {
  i = pular(s, i);
  const c = s[i];
  if (c === '<' && s[i + 1] === '<') {
    const v = new Map();
    i += 2;
    for (;;) {
      i = pular(s, i);
      if (s[i] === '>' && s[i + 1] === '>') return { val: { t: 'dict', v }, i: i + 2 };
      if (s[i] !== '/') throw new ErroPdf('Dicionário inválido.');
      const nome = lerNome(s, i);
      const r = lerValor(s, nome.i);
      v.set(nome.s, r.val);
      i = r.i;
    }
  }
  if (c === '[') {
    const v = [];
    i++;
    for (;;) {
      i = pular(s, i);
      if (s[i] === ']') return { val: { t: 'arr', v }, i: i + 1 };
      const r = lerValor(s, i);
      v.push(r.val);
      i = r.i;
    }
  }
  if (c === '/') { const n = lerNome(s, i); return { val: { t: 'raw', s: n.s }, i: n.i }; }
  if (c === '(') {
    let fundo = 0, j = i;
    for (; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '(') fundo++;
      else if (s[j] === ')' && --fundo === 0) break;
    }
    return { val: { t: 'raw', s: s.slice(i, j + 1) }, i: j + 1 };
  }
  if (c === '<') { const j = s.indexOf('>', i); return { val: { t: 'raw', s: s.slice(i, j + 1) }, i: j + 1 }; }
  // Número (e talvez "n g R"), true, false, null.
  let j = i;
  while (j < s.length && !ESPACO.has(s.charCodeAt(j)) && !DELIM.has(s.charCodeAt(j))) j++;
  const tok = s.slice(i, j);
  if (!tok) throw new ErroPdf('Valor inválido.');
  if (/^\d+$/.test(tok)) {
    const m = /^\s+(\d+)\s+R(?=[\s/<>[\]()%]|$)/.exec(s.slice(j, j + 24));
    if (m) return { val: { t: 'ref', n: Number(tok), g: Number(m[1]) }, i: j + m[0].length };
  }
  return { val: { t: 'raw', s: tok }, i: j };
}
function lerNome(s, i) {
  let j = i + 1;
  while (j < s.length && !ESPACO.has(s.charCodeAt(j)) && !DELIM.has(s.charCodeAt(j))) j++;
  return { s: s.slice(i, j), i: j };
}
function pular(s, i) {
  for (;;) {
    while (i < s.length && ESPACO.has(s.charCodeAt(i))) i++;
    if (s[i] !== '%') return i;
    while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++;
  }
}
function escrever(v) {
  if (v.t === 'dict') return '<<' + [...v.v].map(([k, x]) => k + ' ' + escrever(x)).join(' ') + '>>';
  if (v.t === 'arr') return '[' + v.v.map(escrever).join(' ') + ']';
  if (v.t === 'ref') return `${v.n} ${v.g} R`;
  return v.s;
}

// Tabela xref clássica (com as anteriores, por /Prev): número do objeto → posição no arquivo.
function lerXref(s) {
  const k = s.lastIndexOf('startxref');
  if (k < 0) throw new ErroPdf('PDF sem startxref.');
  const inicio = Number(/startxref\s+(\d+)/.exec(s.slice(k))?.[1]);
  const pos = new Map();
  let trailer = null, at = inicio;
  const vistos = new Set();
  while (Number.isFinite(at) && !vistos.has(at)) {
    vistos.add(at);
    let i = pular(s, at);
    if (!s.startsWith('xref', i)) throw new ErroPdf('Este PDF usa um formato de índice que o app não lê (xref em stream). Exporte de novo pelo Chrome ou "Salvar como PDF".');
    i += 4;
    for (;;) {
      i = pular(s, i);
      if (s.startsWith('trailer', i)) break;
      const m = /^(\d+)\s+(\d+)/.exec(s.slice(i, i + 40));
      if (!m) throw new ErroPdf('Tabela xref inválida.');
      i += m[0].length;
      const primeiro = Number(m[1]), qtd = Number(m[2]);
      i = pular(s, i);
      for (let n = 0; n < qtd; n++) {
        const linha = s.slice(i, i + 20);
        const e = /^(\d{10}) (\d{5}) ([nf])/.exec(linha);
        if (!e) throw new ErroPdf('Linha da xref inválida.');
        if (e[3] === 'n' && !pos.has(primeiro + n)) pos.set(primeiro + n, Number(e[1]));
        i = pular(s, i + 18);
      }
    }
    const t = lerValor(s, i + 7).val;
    trailer ||= t;
    const prev = t.v.get('/Prev');
    at = prev ? Number(prev.s) : NaN;
  }
  if (trailer.v.has('/Encrypt')) throw new ErroPdf('O PDF está protegido por senha. Envie a versão sem senha.');
  return { pos, trailer, inicio };
}

// ---------- marca d'água ----------
// Texto para a fonte Helvetica com WinAnsiEncoding: o que o latin1 não tem vira o parecido ou "?".
function textoPdf(t) {
  const s = String(t).replace(/[‐-―]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');
  let r = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const b = c >= 0x20 && c <= 0xff && !(c >= 0x7f && c < 0xa0) ? ch : '?';
    r += b === '\\' || b === '(' || b === ')' ? '\\' + b : b;
  }
  return '(' + r + ')';
}
// Largura aproximada do texto em Helvetica (média de meia letra por caractere).
const largura = (t, tam) => String(t).length * tam * 0.5;
const fmt = (n) => (Math.round(n * 100) / 100).toString();

function conteudoMarca(w, h, marca, rodape) {
  const linhas = [];
  // Diagonal (do canto de baixo à esquerda ao de cima à direita): três faixas paralelas com nome e e-mail, a do meio no
  // centro da página e as outras afastadas um quinto da altura. Bem claras, para não atrapalhar a leitura.
  const ang = Math.atan2(h, w);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const diag = Math.hypot(w, h);
  const tam = Math.max(8, Math.min(18, (diag * 0.42) / Math.max(1, String(marca).length * 0.5)));
  const lw = largura(marca, tam);
  const passo = h * 0.2;
  linhas.push('q /CPJwmA gs 0.55 0.08 0.12 rg BT /CPJwmF ' + fmt(tam) + ' Tf');
  for (const k of [-1, 0, 1]) {
    const cx = w / 2 - k * passo * sin, cy = h / 2 + k * passo * cos;
    linhas.push(`${fmt(cos)} ${fmt(sin)} ${fmt(-sin)} ${fmt(cos)} ${fmt(cx - (lw / 2) * cos)} ${fmt(cy - (lw / 2) * sin)} Tm ${textoPdf(marca)} Tj`);
  }
  linhas.push('ET Q');
  // Rodapé: pequeno, cinza médio (aparece no fundo claro e no escuro).
  const tr = Math.max(4.5, Math.min(7, (w - 16) / Math.max(1, String(rodape).length * 0.5)));
  linhas.push(`q /CPJwmB gs 0.5 0.5 0.5 rg BT /CPJwmF ${fmt(tr)} Tf ${fmt(Math.max(8, (w - largura(rodape, tr)) / 2))} ${fmt(tr + 4)} Td ${textoPdf(rodape)} Tj ET Q`);
  return linhas.join('\n') + '\n';
}

// pdf: Buffer do original. → Buffer com a marca em todas as páginas.
// marca: texto da diagonal (nome · e-mail); rodape: linha do rodapé; info: { Title?, Subject?, Keywords? } para os metadados.
export function marcarPdf(pdf, { marca, rodape, info = {} }) {
  const s = pdf.toString('latin1');
  if (!s.startsWith('%PDF-')) throw new ErroPdf('O arquivo não é um PDF.');
  const { pos, trailer, inicio } = lerXref(s);
  const cache = new Map();
  const objeto = (n) => {
    if (cache.has(n)) return cache.get(n);
    const at = pos.get(n);
    if (at === undefined) throw new ErroPdf(`Objeto ${n} não encontrado.`);
    const m = /^(\d+)\s+(\d+)\s+obj/.exec(s.slice(at, at + 40));
    if (!m || Number(m[1]) !== n) throw new ErroPdf(`Objeto ${n} fora do lugar.`);
    const v = lerValor(s, at + m[0].length).val;
    cache.set(n, v);
    return v;
  };
  const resolver = (v) => (v && v.t === 'ref' ? objeto(v.n) : v);
  const tamanho = Number(trailer.v.get('/Size')?.s);
  if (!Number.isInteger(tamanho)) throw new ErroPdf('Trailer sem /Size.');
  const raiz = resolver(trailer.v.get('/Root'));
  const paginas = [];
  const andar = (ref, herdado, fundo = 0) => {
    if (fundo > 40) throw new ErroPdf('Árvore de páginas funda demais.');
    const no = resolver(ref);
    if (no?.t !== 'dict') return;
    const h = { ...herdado };
    for (const k of ['/Resources', '/MediaBox', '/CropBox', '/Rotate']) if (no.v.has(k)) h[k] = no.v.get(k);
    const tipo = no.v.get('/Type')?.s;
    if (tipo === '/Pages' || (!tipo && no.v.has('/Kids'))) for (const k of resolver(no.v.get('/Kids'))?.v || []) andar(k, h, fundo + 1);
    else if (ref.t === 'ref') paginas.push({ n: ref.n, g: ref.g, dict: no, h });
  };
  andar(raiz.v.get('/Pages'), {});
  if (!paginas.length) throw new ErroPdf('PDF sem páginas.');

  let prox = tamanho;
  const novos = [];   // { n, g, corpo }
  const novo = (corpo) => { const n = prox++; novos.push({ n, g: 0, corpo }); return n; };
  const stream = (txt) => `<</Length ${Buffer.byteLength(txt, 'latin1')}>>\nstream\n${txt}\nendstream`;
  const fonte = novo('<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>');
  const gsA = novo('<</Type/ExtGState/ca 0.13/CA 0.13>>');
  const gsB = novo('<</Type/ExtGState/ca 0.75/CA 0.75>>');
  const salvar = novo(stream('q'));
  const marcas = new Map();   // "w x h" → objeto do conteúdo (páginas do mesmo tamanho dividem)

  for (const p of paginas) {
    const d = new Map(p.dict.v);
    const caixa = resolver(d.get('/CropBox') || p.h['/CropBox'] || d.get('/MediaBox') || p.h['/MediaBox']);
    const nums = (caixa?.v || []).map((x) => Number(resolver(x).s));
    const [x0, y0, x1, y1] = nums.length === 4 && nums.every(Number.isFinite) ? nums : [0, 0, 595, 842];
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    const chaveTam = `${fmt(x0)} ${fmt(y0)} ${fmt(w)} ${fmt(h)}`;
    if (!marcas.has(chaveTam)) {
      // A marca é desenhada na origem da caixa (x0, y0), com o sistema de coordenadas zerado (cm).
      marcas.set(chaveTam, novo(stream(`Q\nq 1 0 0 1 ${fmt(Math.min(x0, x1))} ${fmt(Math.min(y0, y1))} cm\n${conteudoMarca(w, h, marca, rodape)}Q`)));
    }
    // Recursos: copiados para dentro da página (o original pode ser dividido entre páginas), com a fonte e a transparência.
    const rec = resolver(d.get('/Resources') || p.h['/Resources']);
    const recursos = new Map(rec?.t === 'dict' ? rec.v : []);
    const juntar = (k, entradas) => {
      const atual = resolver(recursos.get(k));
      const m = new Map(atual?.t === 'dict' ? atual.v : []);
      for (const [nome, ref] of entradas) m.set(nome, { t: 'ref', n: ref, g: 0 });
      recursos.set(k, { t: 'dict', v: m });
    };
    juntar('/Font', [['/CPJwmF', fonte]]);
    juntar('/ExtGState', [['/CPJwmA', gsA], ['/CPJwmB', gsB]]);
    d.set('/Resources', { t: 'dict', v: recursos });
    // Conteúdo: "q" antes do original e, depois dele, "Q" + a marca (o estado gráfico do original não vaza para a marca).
    const c = d.get('/Contents');
    const orig = !c ? [] : c.t === 'ref' && resolver(c)?.t === 'arr' ? resolver(c).v : c.t === 'arr' ? c.v : [c];
    d.set('/Contents', { t: 'arr', v: [{ t: 'ref', n: salvar, g: 0 }, ...orig, { t: 'ref', n: marcas.get(chaveTam), g: 0 }] });
    novos.push({ n: p.n, g: p.g, corpo: escrever({ t: 'dict', v: d }) });
  }

  // Metadados: o Info original com quem comprou.
  const infoOrig = resolver(trailer.v.get('/Info'));
  const infoD = new Map(infoOrig?.t === 'dict' ? infoOrig.v : []);
  for (const [k, v] of Object.entries(info)) if (v) infoD.set('/' + k, { t: 'raw', s: textoPdf(v) });
  const infoN = novo(escrever({ t: 'dict', v: infoD }));

  // Escreve os objetos, a xref (uma seção por objeto, simples e válida) e o trailer apontando para a anterior.
  const partes = [s.endsWith('\n') ? '' : '\n'];
  let at = pdf.length + partes[0].length;
  const xref = [];
  for (const o of novos) {
    const txt = `${o.n} ${o.g} obj\n${o.corpo}\nendobj\n`;
    xref.push([o.n, o.g, at]);
    partes.push(txt);
    at += Buffer.byteLength(txt, 'latin1');
  }
  xref.sort((a, b) => a[0] - b[0]);
  let tab = 'xref\n';
  for (const [n, g, p] of xref) tab += `${n} 1\n${String(p).padStart(10, '0')} ${String(g).padStart(5, '0')} n \n`;
  const t = new Map(trailer.v);
  t.delete('/Prev'); t.delete('/XRefStm');
  t.set('/Size', { t: 'raw', s: String(prox) });
  t.set('/Info', { t: 'ref', n: infoN, g: 0 });
  t.set('/Prev', { t: 'raw', s: String(inicio) });
  tab += `trailer\n${escrever({ t: 'dict', v: t })}\nstartxref\n${at}\n%%EOF\n`;
  partes.push(tab);
  return Buffer.concat([pdf, Buffer.from(partes.join(''), 'latin1')]);
}

// Quantas páginas (para o Admin root conferir o arquivo enviado).
export function paginasPdf(pdf) {
  const s = pdf.toString('latin1');
  const { trailer, pos } = lerXref(s);
  const obj = (v) => {
    if (v?.t !== 'ref') return v;
    const at = pos.get(v.n);
    const m = /^(\d+)\s+(\d+)\s+obj/.exec(s.slice(at, at + 40));
    return lerValor(s, at + m[0].length).val;
  };
  const pages = obj(obj(trailer.v.get('/Root')).v.get('/Pages'));
  return Number(obj(pages.v.get('/Count'))?.s) || 0;
}

export { ErroPdf };
