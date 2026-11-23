// Imagem do bloco de evento da aba Gira, para compartilhar no WhatsApp.
import { quebrar, retangulo, gerarPng } from './canvas.js';

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', gold: '#a8771c' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 560;
const P = 24;
const CW = W - 2 * P;

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
    retangulo(ctx, P, y, CW, cabecalho, 14);
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
      retangulo(ctx, P, y, CW, altura, 10);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = secao.cor;
      retangulo(ctx, P, y, 4, altura, 2);
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
  return gerarPng({
    largura: W, escala: 2.5, fundo: C.bg,
    fontes: ['700 30px Alegreya', '700 17px "Alegreya Sans"', '400 16px "Alegreya Sans"', '700 13px "Alegreya Sans"'],
    desenho: (ctx, pintar) => desenhar(ctx, evento, pintar),
  });
}
