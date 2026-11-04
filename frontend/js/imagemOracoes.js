// Imagem PNG dos pedidos de oração (aba Gira, bloco Orações) para mandar no grupo do WhatsApp:
// fundo suave (lilás para o creme), o logo da casa, cada pedido num cartão com uma vela acesa e uma frase de fé no fim.

const C = {
  topo: '#efe7fb', fim: '#fdf6ec', roxo: '#5b3a9a', roxoSuave: '#8a6fc4', ink: '#2b2438', muted: '#7a6f8c',
  card: '#ffffff', borda: '#e6dcf6', ouro: '#c99a3a', chama: '#f5a524', chamaDentro: '#ffe08a', vela: '#f3ece0',
};
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 560;
const P = 30;
const CW = W - 2 * P;
const LARGURA_PNG = 1440;

function quebrar(ctx, t, max) {
  const out = [];
  String(t).split('\n').forEach((par) => {
    let linha = '';
    par.split(' ').forEach((w) => {
      const teste = linha ? linha + ' ' + w : w;
      if (ctx.measureText(teste).width > max && linha) { out.push(linha); linha = w; } else linha = teste;
    });
    out.push(linha);
  });
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
// Vela acesa (desenhada, para não depender do emoji do aparelho).
function vela(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const brilho = ctx.createRadialGradient(8, 6, 0, 8, 6, 16);
  brilho.addColorStop(0, 'rgba(255,200,90,.55)');
  brilho.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = brilho; ctx.beginPath(); ctx.arc(8, 6, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.chama; ctx.beginPath(); ctx.ellipse(8, 6, 4.5, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.chamaDentro; ctx.beginPath(); ctx.ellipse(8, 8, 2, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.vela; retangulo(ctx, 3, 14, 10, 18, 2); ctx.fill();
  ctx.strokeStyle = '#e4d6bf'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
// Coraçãozinho dourado (no divisor).
function coracao(ctx, x, y, r, cor) {
  ctx.save();
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.fill();
  ctx.restore();
}
function divisor(ctx, y) {
  ctx.strokeStyle = C.ouro; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(W / 2 - 90, y); ctx.lineTo(W / 2 - 14, y); ctx.moveTo(W / 2 + 14, y); ctx.lineTo(W / 2 + 90, y); ctx.stroke();
  ctx.globalAlpha = 1;
  coracao(ctx, W / 2, y, 7, C.ouro);
}

function desenhar(ctx, oracoes, hoje, logo, pintar) {
  const fonte = (w, s, f, it = '') => { ctx.font = `${it}${w} ${s}px ${f || FB}`; };
  let y = P;
  ctx.textAlign = 'center';
  if (logo) { if (pintar) ctx.drawImage(logo, W / 2 - 34, y, 68, 68); y += 80; }
  fonte(700, 13);
  if (pintar) {
    ctx.fillStyle = C.roxoSuave;
    try { ctx.letterSpacing = '3px'; } catch { /* */ }
    ctx.fillText('CASA DO PAI JOÃO', W / 2, y);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
  }
  y += 22;
  fonte(700, 34, FD);
  if (pintar) { ctx.fillStyle = C.roxo; ctx.fillText('Pedidos de oração', W / 2, y); }
  y += 44;
  fonte(400, 18, FB, 'italic ');
  const conv = quebrar(ctx, 'Vamos firmar o pensamento e, juntos, rezar por cada um destes pedidos.', CW - 40);
  if (pintar) { ctx.fillStyle = C.muted; conv.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 24)); }
  y += conv.length * 24 + 14;
  if (pintar) divisor(ctx, y);
  y += 22;
  ctx.textAlign = 'left';
  // Um cartão por pedido: vela à esquerda, o texto do pedido e, se houver, quantas velas já foram acesas.
  const TX = P + 46;
  const TW = CW - 46 - 16;
  oracoes.forEach((o) => {
    fonte(500, 19);
    const linhas = quebrar(ctx, o.texto, TW);
    const n = o.reacoes || 0;
    const h = 18 + linhas.length * 26 + (n ? 26 : 0) + 14;
    if (pintar) {
      ctx.save();
      ctx.shadowColor = 'rgba(91,58,154,.12)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = C.card; retangulo(ctx, P, y, CW, h, 16); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.borda; ctx.lineWidth = 1; retangulo(ctx, P, y, CW, h, 16); ctx.stroke();
      vela(ctx, P + 15, y + h / 2 - 18, 1.05);
      fonte(500, 19); ctx.fillStyle = C.ink;
      linhas.forEach((l, i) => ctx.fillText(l, TX, y + 18 + i * 26));
      if (n) {
        fonte(500, 14, FB, 'italic '); ctx.fillStyle = C.roxoSuave;
        ctx.fillText(`${n} ${n === 1 ? 'vela acesa' : 'velas acesas'} por este pedido`, TX, y + 18 + linhas.length * 26 + 4);
      }
    }
    y += h + 12;
  });
  y += 8;
  if (pintar) divisor(ctx, y);
  y += 22;
  ctx.textAlign = 'center';
  fonte(700, 20, FD, 'italic ');
  const frase = quebrar(ctx, 'Que a nossa corrente de fé leve luz, força e conforto a cada um destes pedidos.', CW - 30);
  if (pintar) { ctx.fillStyle = C.roxo; frase.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 26)); }
  y += frase.length * 26 + 14;
  const [a, m, d] = String(hoje).split('-');
  fonte(500, 13);
  if (pintar) { ctx.fillStyle = C.muted; ctx.fillText(`Pedidos dos últimos 7 dias · ${d}/${m}/${a}`, W / 2, y); }
  ctx.textAlign = 'left';
  return y + 18 + P - 6;
}

async function carregarLogo() {
  try {
    const img = new Image();
    img.src = '/img/terreiro.png';
    await img.decode();
    return img;
  } catch { return null; }
}

export async function gerarImagemOracoes(oracoes, hoje) {
  try {
    await Promise.all(['700 34px Alegreya', 'italic 700 20px Alegreya', '500 19px "Alegreya Sans"', 'italic 400 18px "Alegreya Sans"',
      'italic 500 14px "Alegreya Sans"', '700 13px "Alegreya Sans"', '500 13px "Alegreya Sans"'].map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const logo = await carregarLogo();
  const S = LARGURA_PNG / W;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, oracoes, hoje, logo, false));
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
  desenhar(ctx, oracoes, hoje, logo, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
