// Gerador de QR Code (ISO/IEC 18004) sem dependências: modo byte (UTF-8), correção nível M, versões 1 a 10
// (até 213 bytes; o endereço da fila cabe com folga). Usado no QR da fila (tela de TV e cartaz para imprimir).
// qr(texto) → { tamanho, escuro(x, y) }; qrSvg(texto) → <svg> pronto.

// ---------- GF(256), polinômio 0x11D ----------
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// Gerador de grau n (coeficiente maior primeiro): (x - α^0)(x - α^1)…(x - α^(n-1)).
function gerador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}
// Os n bytes de correção (Reed-Solomon) de um bloco.
export function correcao(dados, n) {
  const g = gerador(n);
  const r = new Array(n).fill(0);
  for (const b of dados) {
    const f = b ^ r.shift();
    r.push(0);
    for (let j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f);
  }
  return r;
}

// ---------- tabelas do nível M, versões 1 a 10 ----------
// [bytes de correção por bloco, [blocos, bytes de dados], [blocos, bytes de dados]?]
const BLOCOS_M = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALINHAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const NIVEL_M = 0b00;

const dadosDa = (v) => { const [, a, b] = BLOCOS_M[v]; return a[0] * a[1] + (b ? b[0] * b[1] : 0); };

// 15 bits de formato (nível e máscara), já com a máscara 0x5412.
export function bitsFormato(nivel, mascara) {
  const d = (nivel << 3) | mascara;
  let r = d;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
}
function bitsVersao(v) {
  let r = v;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (v << 12) | r;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Bytes de dados com o modo, o tamanho, o terminador e o preenchimento.
function codificar(bytes, v) {
  const bits = [];
  const por = (valor, n) => { for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  por(0b0100, 4);
  por(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) por(b, 8);
  const cap = dadosDa(v) * 8;
  por(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0; out.length < dadosDa(v); p++) out.push(p % 2 ? 0x11 : 0xec);
  return out;
}

// Divide em blocos, calcula a correção de cada um e intercala (dados por índice, depois a correção).
function intercalar(dados, v) {
  const [n, ...grupos] = BLOCOS_M[v];
  const blocos = [];
  let k = 0;
  for (const g of grupos) if (g) for (let i = 0; i < g[0]; i++) { blocos.push(dados.slice(k, k + g[1])); k += g[1]; }
  const ecc = blocos.map((b) => correcao(b, n));
  const out = [];
  const maior = Math.max(...blocos.map((b) => b.length));
  for (let i = 0; i < maior; i++) for (const b of blocos) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < n; i++) for (const e of ecc) out.push(e[i]);
  return out;
}

function penalidade(m, t) {
  let p = 0;
  const em = (x, y) => m[y][x];
  // Regra 1 (sequências de 5 ou mais) e regra 3 (padrão parecido com o localizador), em linhas e colunas.
  const PADRAO = [[1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]];
  for (let dir = 0; dir < 2; dir++) {
    for (let a = 0; a < t; a++) {
      let corrida = 1;
      for (let b = 0; b < t; b++) {
        const c = dir ? em(a, b) : em(b, a);
        if (b > 0) {
          const ant = dir ? em(a, b - 1) : em(b - 1, a);
          if (c === ant) corrida++;
          else { if (corrida >= 5) p += 3 + corrida - 5; corrida = 1; }
        }
        if (b <= t - 11) {
          for (const pd of PADRAO) {
            let igual = true;
            for (let k = 0; k < 11 && igual; k++) igual = (dir ? em(a, b + k) : em(b + k, a)) === !!pd[k];
            if (igual) p += 40;
          }
        }
      }
      if (corrida >= 5) p += 3 + corrida - 5;
    }
  }
  // Regra 2: quadrados 2×2 da mesma cor.
  for (let y = 0; y < t - 1; y++) for (let x = 0; x < t - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  // Regra 4: proporção de escuros longe de 50%.
  let escuros = 0;
  for (const linha of m) for (const c of linha) if (c) escuros++;
  p += 10 * Math.floor(Math.abs((escuros * 100) / (t * t) - 50) / 5);
  return p;
}

export function qr(texto) {
  const bytes = [...new TextEncoder().encode(String(texto))];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dadosDa(v) * 8) v++;
  if (v > 10) throw new Error('Texto longo demais para o QR.');
  const t = 17 + 4 * v;
  const m = Array.from({ length: t }, () => new Array(t).fill(false));
  const fixo = Array.from({ length: t }, () => new Array(t).fill(false));
  const marcar = (x, y, c) => { m[y][x] = c; fixo[y][x] = true; };

  // Localizadores (com a borda clara), linhas de tempo e alinhamento.
  for (const [cx, cy] of [[3, 3], [t - 4, 3], [3, t - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= t || y >= t) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      marcar(x, y, d !== 2 && d !== 4);
    }
  }
  for (let i = 0; i < t; i++) { if (!fixo[6][i]) marcar(i, 6, i % 2 === 0); if (!fixo[i][6]) marcar(6, i, i % 2 === 0); }
  const al = ALINHAMENTO[v], u = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === u) || (i === u && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marcar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // Reserva das áreas de formato e versão (preenchidas depois de escolher a máscara).
  const formato = (mascara) => {
    const b = bitsFormato(NIVEL_M, mascara);
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) marcar(8, i, bit(i));
    marcar(8, 7, bit(6)); marcar(8, 8, bit(7)); marcar(7, 8, bit(8));
    for (let i = 9; i < 15; i++) marcar(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) marcar(t - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) marcar(8, t - 15 + i, bit(i));
    marcar(8, t - 8, true);   // o módulo escuro fixo
  };
  formato(0);
  if (v >= 7) {
    const b = bitsVersao(v);
    for (let i = 0; i < 18; i++) {
      const c = ((b >>> i) & 1) === 1, a = t - 11 + (i % 3), bb = Math.floor(i / 3);
      marcar(a, bb, c); marcar(bb, a, c);
    }
  }

  // Dados em zigue-zague, de baixo para cima e de cima para baixo, de duas em duas colunas (pulando a coluna 6).
  const cw = intercalar(codificar(bytes, v), v);
  let i = 0;
  for (let dir = t - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let k = 0; k < t; k++) for (let j = 0; j < 2; j++) {
      const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? t - 1 - k : k;
      if (fixo[y][x]) continue;
      if (i < cw.length * 8) m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
      i++;
    }
  }

  // A máscara com menor penalidade.
  const aplicar = (k) => { for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) if (!fixo[y][x] && MASCARAS[k](x, y)) m[y][x] = !m[y][x]; };
  let melhor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) {
    aplicar(k); formato(k);
    const p = penalidade(m, t);
    if (p < menor) { menor = p; melhor = k; }
    aplicar(k);   // desfaz (a máscara é um XOR)
  }
  aplicar(melhor); formato(melhor);
  return { tamanho: t, versao: v, mascara: melhor, escuro: (x, y) => m[y][x] };
}

// SVG quadrado com a margem clara de 4 módulos (a que os leitores precisam). Escuro em preto, fundo branco:
// o QR fica legível também na tela escura e no papel.
export function qrSvg(texto, { titulo = '' } = {}) {
  const q = qr(texto), M = 4, n = q.tamanho + 2 * M;
  let d = '';
  for (let y = 0; y < q.tamanho; y++) for (let x = 0; x < q.tamanho; x++) if (q.escuro(x, y)) d += `M${x + M} ${y + M}h1v1h-1z`;
  const t = titulo ? `<title>${titulo.replace(/[<&]/g, '')}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img">${t}<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
