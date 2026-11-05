// Imagem do bloco de evento da aba Gira, para compartilhar no WhatsApp.

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', gold: '#a8771c' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 560;
const P = 24;
const CW = W - 2 * P;

function quebrar(ctx, texto, max) {
  const linhas = [];
  String(texto).split('\n').forEach((paragrafo) => {
    let linha = '';
    paragrafo.split(/\s+/).forEach((palavra) => {
      if (ctx.measureText(palavra).width > max) {
        if (linha) linhas.push(linha);
        let parte = '';
        for (const letra of palavra) {
          if (ctx.measureText(parte + letra).width > max && parte) {
            linhas.push(parte);
            parte = letra;
          } else parte += letra;
        }
        linha = parte;
      } else {
        const teste = linha ? `${linha} ${palavra}` : palavra;
        if (ctx.measureText(teste).width > max && linha) { linhas.push(linha); linha = palavra; }
        else linha = teste;
      }
    });
    linhas.push(linha);
  });
  return linhas;
}

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenhar(ctx, evento, pintar) {
  const fonte = (peso, tamanho, familia = FB) => { ctx.font = `${peso} ${tamanho}px ${familia}`; };
  let y = P;
  fonte(700, 13);
  const data = quebrar(ctx, evento.data, CW - 36);
  fonte(700, 30, FD);
  const titulo = quebrar(ctx, evento.titulo, CW - 36);
  fonte(700, 17);
  const orixa = evento.orixa ? quebrar(ctx, `Orixá: ${evento.orixa}`, CW - 36) : [];
  const cabecalho = 22 + data.length * 18 + titulo.length * 38 + orixa.length * 24 + 22;
  if (pintar) {
    ctx.fillStyle = C.card;
    arredondado(ctx, P, y, CW, cabecalho, 14);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.fillRect(P, y + 14, 4, cabecalho - 28);
    fonte(700, 13);
    ctx.fillStyle = C.muted;
    data.forEach((linha, i) => ctx.fillText(linha, P + 20, y + 18 + i * 18));
    fonte(700, 30, FD);
    ctx.fillStyle = C.ink;
    titulo.forEach((linha, i) => ctx.fillText(linha, P + 20, y + 40 + data.length * 18 + i * 38));
    if (orixa.length) {
      fonte(700, 17);
      ctx.fillStyle = C.gold;
      orixa.forEach((linha, i) => ctx.fillText(linha, P + 20, y + 42 + data.length * 18 + titulo.length * 38 + i * 24));
    }
  }
  y += cabecalho + 12;

  evento.secoes.forEach((secao) => {
    fonte(700, 17);
    const tituloSecao = quebrar(ctx, secao.titulo, CW - 36);
    fonte(400, 16);
    const itens = secao.itens.flatMap((item) => quebrar(ctx, item, CW - 52));
    const altura = 18 + tituloSecao.length * 22 + itens.length * 23 + 14;
    if (pintar) {
      ctx.fillStyle = '#ffffff';
      arredondado(ctx, P, y, CW, altura, 10);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = secao.cor;
      arredondado(ctx, P, y, 4, altura, 2);
      ctx.fill();
      fonte(700, 17);
      ctx.fillStyle = C.ink;
      tituloSecao.forEach((linha, i) => ctx.fillText(linha, P + 16, y + 12 + i * 22));
      fonte(400, 16);
      ctx.fillStyle = C.muted;
      itens.forEach((linha, i) => ctx.fillText(linha, P + 16, y + 14 + tituloSecao.length * 22 + i * 23));
    }
    y += altura + 10;
  });
  return y + P;
}

export async function gerarImagemEvento(evento) {
  try {
    await Promise.all(['700 30px Alegreya', '700 17px "Alegreya Sans"', '400 16px "Alegreya Sans"', '700 13px "Alegreya Sans"']
      .map((fonte) => document.fonts.load(fonte)));
  } catch { /* usa as fontes do sistema */ }

  const escala = 2.5;
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não consegui gerar a imagem neste aparelho.');
  ctx.textBaseline = 'top';
  const altura = Math.ceil(desenhar(ctx, evento, false));
  canvas.width = W * escala;
  canvas.height = altura * escala;
  ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não consegui gerar a imagem neste aparelho.');
  ctx.scale(escala, escala);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, altura);
  desenhar(ctx, evento, true);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
