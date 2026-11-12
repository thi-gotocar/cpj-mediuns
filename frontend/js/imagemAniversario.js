// Imagem PNG dos aniversariantes do dia (aba Geral, bloco Eventos, só o root) para mandar no WhatsApp.
// Sem cabeçalho: fundo claro com confetes e um cartão por pessoa — balão, o nome e uma mensagem curta, diferente para cada um.

const C = {
  topo: '#fff0f3', fim: '#fff8e9', nome: '#8a2d55', ink: '#3a2c38', card: '#ffffff', borda: '#f5dbe4', fio: '#c9a9b6',
};
// Uma cor de balão por pessoa (repete depois da última).
const BALOES = ['#ef6f8e', '#f2a93b', '#5aa9e6', '#8e6bd6', '#3dba8c', '#ee8a4f'];
const CONFETE = ['#ef6f8e', '#f2c14e', '#5aa9e6', '#8e6bd6', '#3dba8c'];
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 560;
const P = 26;
const CW = W - 2 * P;
const LARGURA_PNG = 1440;

function quebrar(ctx, t, max) {
  const out = [];
  let linha = '';
  String(t).split(' ').forEach((w) => {
    const teste = linha ? linha + ' ' + w : w;
    if (ctx.measureText(teste).width > max && linha) { out.push(linha); linha = w; } else linha = teste;
  });
  out.push(linha);
  return out;
}
function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// Balão desenhado (não depende do emoji do aparelho): corpo, brilho, nó e fio ondulado.
function balao(ctx, x, y, cor) {
  ctx.save();
  ctx.strokeStyle = C.fio; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y + 30);
  ctx.bezierCurveTo(x - 5, y + 38, x + 5, y + 44, x, y + 52); ctx.stroke();
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.ellipse(x, y + 12, 13, 17, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 3, y + 31); ctx.lineTo(x + 3, y + 31); ctx.lineTo(x, y + 27); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(x - 5, y + 5, 3, 6, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
// Confetes espalhados pelo fundo (sempre no mesmo lugar para a mesma altura).
function confetes(ctx, H) {
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = Math.round(H / 14);
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = CONFETE[i % CONFETE.length];
    ctx.translate(r() * W, r() * H);
    ctx.rotate(r() * Math.PI);
    if (i % 3) ctx.fillRect(-4, -1.5, 8, 3); else { ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

// lista: [{ nome, mensagem }]
function desenhar(ctx, lista, pintar) {
  const fonte = (w, s, f, it = '') => { ctx.font = `${it}${w} ${s}px ${f || FB}`; };
  let y = P;
  const TX = P + 58;
  const TW = CW - 58 - 20;
  lista.forEach(({ nome, mensagem }, k) => {
    fonte(700, 28, FD);
    const nomeL = quebrar(ctx, nome, TW);
    fonte(400, 19, FB, 'italic ');
    const msgL = quebrar(ctx, mensagem, TW);
    const h = Math.max(20 + nomeL.length * 32 + 4 + msgL.length * 25 + 18, 92);
    if (pintar) {
      ctx.save();
      ctx.shadowColor = 'rgba(138,45,85,.13)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
      ctx.fillStyle = C.card; retangulo(ctx, P, y, CW, h, 18); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.borda; ctx.lineWidth = 1; retangulo(ctx, P, y, CW, h, 18); ctx.stroke();
      balao(ctx, P + 30, y + h / 2 - 26, BALOES[k % BALOES.length]);
      fonte(700, 28, FD); ctx.fillStyle = C.nome;
      nomeL.forEach((l, i) => ctx.fillText(l, TX, y + 18 + i * 32));
      fonte(400, 19, FB, 'italic '); ctx.fillStyle = C.ink;
      msgL.forEach((l, i) => ctx.fillText(l, TX, y + 18 + nomeL.length * 32 + 4 + i * 25));
    }
    y += h + 14;
  });
  return y - 14 + P;
}

export async function gerarImagemAniversario(lista) {
  try {
    await Promise.all(['700 28px Alegreya', 'italic 400 19px "Alegreya Sans"'].map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const S = LARGURA_PNG / W;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, lista, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, C.topo);
  fundo.addColorStop(1, C.fim);
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H + 2);   // +2: cobre a última linha de pixels (arredondamento da escala)
  confetes(ctx, H);
  desenhar(ctx, lista, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
