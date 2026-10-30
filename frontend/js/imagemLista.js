// Imagem PNG de uma lista simples (pedido de ervas, cobrança...), no mesmo estilo das outras imagens.
//   gerarImagemLista({ rotulo, titulo, subtitulo, linhas: [{ texto, valor?, sub? }], rodape? })

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', accent: '#2c4ea3', soft: '#c9d5f5' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 720;
const P = 32;
const CW = W - 2 * P;

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

function desenhar(ctx, d, pintar) {
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  fonte(700, 34, FD);
  const tl = quebrar(ctx, d.titulo, CW);
  fonte(500, 20);
  const sl = d.subtitulo ? quebrar(ctx, d.subtitulo, CW) : [];
  const hh = P + 20 + tl.length * 40 + sl.length * 26 + P - 4;
  if (pintar) {
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, hh);
    fonte(700, 13); ctx.fillStyle = C.soft;
    try { ctx.letterSpacing = '2px'; } catch { /* */ }
    ctx.fillText(String(d.rotulo || '').toUpperCase(), P, P);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
    fonte(700, 34, FD); ctx.fillStyle = '#ffffff';
    tl.forEach((l, k) => ctx.fillText(l, P, P + 20 + k * 40));
    fonte(500, 20); ctx.fillStyle = C.soft;
    sl.forEach((l, k) => ctx.fillText(l, P, P + 24 + tl.length * 40 + k * 26));
  }
  let y = hh + 20;
  // cartão com as linhas
  const linhas = d.linhas.map((l) => {
    fonte(700, 20);
    const vw = l.valor ? ctx.measureText(l.valor).width + 16 : 0;
    const tx = quebrar(ctx, l.texto, CW - 36 - vw);
    fonte(400, 16);
    const sb = l.sub ? quebrar(ctx, l.sub, CW - 36) : [];
    return { ...l, tx, sb, h: 14 + tx.length * 26 + sb.length * 21 + 12 };
  });
  const altura = linhas.reduce((a, l) => a + l.h, 0) + 8;
  if (pintar) {
    ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(P, y, CW, altura, 12); else ctx.rect(P, y, CW, altura); ctx.fill(); ctx.stroke();
  }
  let yy = y + 4;
  linhas.forEach((l, k) => {
    if (pintar) {
      if (k) { ctx.fillStyle = C.line; ctx.fillRect(P + 18, yy, CW - 36, 1); }
      fonte(700, 20); ctx.fillStyle = C.ink;
      l.tx.forEach((t, j) => ctx.fillText(t, P + 18, yy + 14 + j * 26));
      if (l.valor) { ctx.fillText(l.valor, P + CW - 18 - ctx.measureText(l.valor).width, yy + 14); }
      fonte(400, 16); ctx.fillStyle = C.muted;
      l.sb.forEach((t, j) => ctx.fillText(t, P + 18, yy + 14 + l.tx.length * 26 + j * 21));
    }
    yy += l.h;
  });
  y += altura + 16;
  if (d.rodape) {
    fonte(700, 20);
    const rl = quebrar(ctx, d.rodape, CW);
    if (pintar) { ctx.fillStyle = C.ink; rl.forEach((t, j) => ctx.fillText(t, P, y + j * 26)); }
    y += rl.length * 26 + 8;
  }
  return y + P - 16;
}

export async function gerarImagemLista(d) {
  try {
    await Promise.all(['700 34px Alegreya', '400 16px "Alegreya Sans"', '700 20px "Alegreya Sans"', '500 20px "Alegreya Sans"']
      .map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const S = 1.5;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, d, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  desenhar(ctx, d, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}

// Compartilha pelo menu do aparelho (WhatsApp etc.); devolve false se não der.
export async function compartilharImagem(blob, nome, titulo) {
  try {
    const f = new File([blob], nome, { type: 'image/png' });
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return false;
    await navigator.share({ files: [f], title: titulo });
    return true;
  } catch (e) {
    return e?.name === 'AbortError';
  }
}
