// Imagem PNG do resumo de uma gira encerrada (para o grupo do WhatsApp), no padrão do bloco Corrente da aba Pessoas:
// cabeçalho com o logo da casa e cartões com a borda colorida em cima, contagens em quadradinhos e os nomes em pílulas.
//   gerarImagemResumo({ rotulo, titulo, subtitulo, cartoes: [{ titulo, direita, cor, estrela?, quadros?, nota?, grupos? }] })
//     quadros: [[rótulo, número, cor]] · grupos: [{ titulo, cor, pilulas?: [{ texto, cor? }], linhas?: [texto] }] (grupo vazio não aparece)

import { quebrar, retangulo, carregarLogo } from './imagem.js';

export const COR_RESUMO = { ouro: '#a8771c', presente: '#24785a', ausente: '#a2423a', falta: '#e0101f', licenca: '#2c4ea3', limpeza: '#c2570c' };
const C = { bg: '#f4f1ea', card: '#ffffff', ink: '#1e2533', muted: '#6b7385', line: '#e3ddd0', caixa: '#f8f6f1', navy: '#1c2b4a', navy2: '#2d4a86', gold: '#c9a24a', sol: '#e7c97f', soft: '#c9d5f5' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
// Área de desenho estreita e imagem final larga, como a imagem da escala: no celular, tudo aparece grande e nítido.
const W = 560;
const LARGURA_PNG = 1440;
const P = 22;
const CW = W - 2 * P;
const PC = 16;   // respiro dentro do cartão
const R = 50;    // raio do logo

function estrela(ctx, cx, cy, r, cor) {
  ctx.fillStyle = cor;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + q * Math.cos(a), cy + q * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

// Desenha (ou só mede, com pintar = false) e devolve a altura.
function desenhar(ctx, d, logo, pintar) {
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  const espaco = (v) => { try { ctx.letterSpacing = v; } catch { /* navegador antigo */ } };

  // ---- cabeçalho: logo da casa, rótulo, nome da gira e orixá · data
  const tx = logo ? P + 2 * R + 20 : P;
  const tw = W - tx - P;
  fonte(700, 14); espaco('1px');
  const rl = quebrar(ctx, d.rotulo, tw);
  espaco('0px');
  fonte(700, 32, FD);
  const tl = quebrar(ctx, d.titulo, tw);
  fonte(500, 19);
  const sl = d.subtitulo ? quebrar(ctx, d.subtitulo, tw) : [];
  const alturaTexto = rl.length * 19 + 6 + tl.length * 38 + 2 + sl.length * 25;
  const hh = Math.max(alturaTexto, logo ? 2 * R : 0) + 2 * P + 5;
  if (pintar) {
    const gr = ctx.createLinearGradient(0, 0, W, hh);
    gr.addColorStop(0, C.navy); gr.addColorStop(1, C.navy2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, hh);
    ctx.fillStyle = C.gold; ctx.fillRect(0, hh - 5, W, 5);
    if (logo) {
      const cx = P + R, cy = (hh - 5) / 2;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 5, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, cx - R + 5, cy - R + 5, (R - 5) * 2, (R - 5) * 2); ctx.restore();
    }
    let yt = (hh - 5 - alturaTexto) / 2;
    fonte(700, 14); espaco('1px'); ctx.fillStyle = C.sol;
    rl.forEach((l, i) => ctx.fillText(l, tx, yt + i * 19));
    espaco('0px');
    yt += rl.length * 19 + 6;
    fonte(700, 32, FD); ctx.fillStyle = '#ffffff';
    tl.forEach((l, i) => ctx.fillText(l, tx, yt + i * 38));
    yt += tl.length * 38 + 2;
    fonte(500, 19); ctx.fillStyle = C.soft;
    sl.forEach((l, i) => ctx.fillText(l, tx, yt + i * 25));
  }
  let y = hh + 18;

  // Quadradinhos: número grande na cor da contagem e o nome embaixo, em maiúsculas (como na Corrente CPJ).
  const quadros = (lista, x, w, y0) => {
    const GAP = 8;
    const qw = (w - GAP * (lista.length - 1)) / lista.length;
    const QH = 76;
    if (pintar) {
      lista.forEach(([rot, n, cor], i) => {
        const qx = x + i * (qw + GAP);
        ctx.fillStyle = C.caixa; retangulo(ctx, qx, y0, qw, QH, 10); ctx.fill();
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.save(); retangulo(ctx, qx, y0, qw, QH, 10); ctx.clip();
        ctx.fillStyle = cor; ctx.fillRect(qx, y0, qw, 4);
        ctx.restore();
        ctx.textAlign = 'center';
        fonte(700, 34, FD); ctx.fillStyle = cor; ctx.fillText(String(n), qx + qw / 2, y0 + 12);
        fonte(700, 13); espaco('.5px'); ctx.fillStyle = C.muted; ctx.fillText(rot.toUpperCase(), qx + qw / 2, y0 + 53);
        espaco('0px');
        ctx.textAlign = 'left';
      });
    }
    return QH;
  };

  const grafico = (giras, x, w, y0) => {
    const H = 146;
    const topo = y0 + 14;
    const altura = 82;
    const base = topo + altura;
    const max = Math.max(1, ...giras.map((g) => g.total));
    const cores = { preferencial: COR_RESUMO.ouro, normal: COR_RESUMO.licenca, passe: COR_RESUMO.presente };
    const rotulos = { preferencial: 'Preferencial', normal: 'Normal', passe: 'Passe' };
    if (pintar) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      [0, 0.5, 1].forEach((fracao) => {
        const yy = base - altura * fracao;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      });
      const slot = w / giras.length;
      const bw = Math.min(34, slot * 0.56);
      giras.forEach((g, i) => {
        const cx = x + slot * (i + 0.5);
        let yy = base;
        ['normal', 'passe', 'preferencial'].forEach((tipo) => {
          const valor = g.atendimentos[tipo];
          const h = valor ? Math.max(1, (valor / max) * altura) : 0;
          if (h) {
            yy -= h;
            ctx.fillStyle = cores[tipo];
            ctx.fillRect(cx - bw / 2, yy, bw, h);
          }
        });
        fonte(700, 13); ctx.fillStyle = C.ink; ctx.textAlign = 'center';
        ctx.fillText(String(g.total), cx, Math.max(y0, yy - 16));
        fonte(500, 13); ctx.fillStyle = C.muted;
        ctx.fillText(`${g.data.slice(8, 10)}/${g.data.slice(5, 7)}`, cx, base + 5);
      });
      const itens = ['preferencial', 'normal', 'passe'];
      fonte(500, 13);
      const larguras = itens.map((tipo) => 12 + 6 + ctx.measureText(rotulos[tipo]).width + 14);
      let lx = x + (w - larguras.reduce((a, b) => a + b, 0)) / 2;
      itens.forEach((tipo, i) => {
        ctx.fillStyle = cores[tipo]; ctx.fillRect(lx, y0 + 125, 12, 12);
        ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText(rotulos[tipo], lx + 18, y0 + 123);
        lx += larguras[i];
      });
      ctx.textAlign = 'left';
    }
    return H;
  };

  const graficoFrequencia = (giras, x, w, y0) => {
    const H = 146;
    const topo = y0 + 14;
    const altura = 82;
    const base = topo + altura;
    if (pintar) {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      [0, 0.5, 1].forEach((fracao) => {
        const yy = base - altura * fracao;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
      });
      const slot = w / giras.length;
      const bw = Math.min(34, slot * 0.56);
      giras.forEach((g, i) => {
        const cx = x + slot * (i + 0.5);
        const h = (g.frequencia / 100) * altura;
        ctx.fillStyle = COR_RESUMO.presente;
        ctx.fillRect(cx - bw / 2, base - h, bw, h);
        fonte(700, 13); ctx.fillStyle = C.ink; ctx.textAlign = 'center';
        ctx.fillText(`${g.frequencia}%`, cx, Math.max(y0, base - h - 16));
        fonte(500, 13); ctx.fillStyle = C.muted;
        ctx.fillText(`${g.data.slice(8, 10)}/${g.data.slice(5, 7)}`, cx, base + 5);
      });
      fonte(500, 13); ctx.fillStyle = C.muted; ctx.textAlign = 'center';
      ctx.fillText('pessoas presentes / aptas', x + w / 2, y0 + 125);
      ctx.textAlign = 'left';
    }
    return H;
  };

  // Pílulas: uma ao lado da outra, quebrando a linha quando não cabem.
  const pilulas = (lista, x, w, y0) => {
    const H = 30, GAP = 6;
    let px = x, py = y0;
    lista.forEach((it) => {
      fonte(it.cor ? 700 : 500, 17);
      const pw = Math.min(ctx.measureText(it.texto).width + 24, w);
      if (px > x && px + pw > x + w) { px = x; py += H + GAP; }
      if (pintar) {
        ctx.fillStyle = C.card; retangulo(ctx, px, py, pw, H, H / 2); ctx.fill();
        ctx.strokeStyle = it.cor || C.line; ctx.lineWidth = it.cor ? 1.5 : 1; ctx.stroke();
        ctx.fillStyle = it.cor || C.ink; ctx.fillText(it.texto, px + 12, py + 6);
      }
      px += pw + GAP;
    });
    return py - y0 + H;
  };

  // Mini bloco com a faixa colorida à esquerda (como a Ausência e as licenças na tela).
  const medirCorpo = (g, x, w, y0) => {
    if (g.pilulas) return pilulas(g.pilulas, x, w, y0);
    fonte(400, 17);
    const ls = g.linhas.flatMap((t) => quebrar(ctx, t, w));
    if (pintar) { ctx.fillStyle = C.ink; ls.forEach((l, i) => ctx.fillText(l, x, y0 + i * 23)); }
    return ls.length * 23;
  };
  const miniBloco = (g, x, w, y0) => {
    const ix = x + 14, iw = w - 26;
    const pintou = pintar;
    pintar = false;
    const corpo = medirCorpo(g, ix, iw, 0);
    pintar = pintou;
    const h = 10 + 22 + 6 + corpo + 12;
    if (pintar) {
      ctx.fillStyle = C.caixa; retangulo(ctx, x, y0, w, h, 10); ctx.fill();
      ctx.save(); retangulo(ctx, x, y0, w, h, 10); ctx.clip();
      ctx.fillStyle = g.cor; ctx.fillRect(x, y0, 4, h);
      ctx.restore();
      fonte(700, 17); ctx.fillStyle = g.cor; ctx.fillText(g.titulo, ix, y0 + 10);
      medirCorpo(g, ix, iw, y0 + 10 + 22 + 6);
    }
    return h;
  };

  // Conteúdo de um cartão, a partir de y0; devolve a altura (sem pintar nada quando pintar = false).
  const corpoCartao = (c, y0) => {
    const ix = P + PC, iw = CW - 2 * PC;
    let yy = y0 + 4 + 14;
    const estr = c.estrela ? 22 : 0;
    if (pintar) {
      if (c.estrela) estrela(ctx, ix + 8, yy + 11, 10, COR_RESUMO.ouro);
      fonte(700, 22, FD); espaco('.5px'); ctx.fillStyle = C.ink; ctx.fillText(c.titulo, ix + estr, yy);
      espaco('0px');
      if (c.direita) {
        fonte(700, 17); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText(c.direita, ix + iw, yy + 5);
        ctx.textAlign = 'left';
      }
    }
    yy += 34;
    if (c.quadros) yy += quadros(c.quadros, ix, iw, yy) + 10;
    if (c.grafico?.length) yy += grafico(c.grafico, ix, iw, yy) + 8;
    if (c.graficoFrequencia?.length) yy += graficoFrequencia(c.graficoFrequencia, ix, iw, yy) + 8;
    if (c.nota) {
      if (pintar) { fonte(500, 16); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText(c.nota, ix + iw / 2, yy); ctx.textAlign = 'left'; }
      yy += 26;
    }
    (c.grupos || []).filter((g) => (g.pilulas || g.linhas).length).forEach((g) => { yy += miniBloco(g, ix, iw, yy) + 8; });
    return yy - y0 + 6;
  };

  // ---- cartões: fundo branco, sombra leve e a borda colorida em cima
  d.cartoes.forEach((c) => {
    const pintou = pintar;
    pintar = false;
    const h = corpoCartao(c, y);
    pintar = pintou;
    if (pintar) {
      ctx.save();
      ctx.shadowColor = 'rgba(30,37,51,.08)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
      ctx.fillStyle = C.card; retangulo(ctx, P, y, CW, h, 14); ctx.fill();
      ctx.restore();
      ctx.save(); retangulo(ctx, P, y, CW, h, 14); ctx.clip();
      ctx.fillStyle = c.cor; ctx.fillRect(P, y, CW, 4);
      ctx.restore();
      corpoCartao(c, y);
    }
    y += h + 14;
  });

  // ---- rodapé
  if (pintar) {
    ctx.textAlign = 'center';
    fonte(500, 14); ctx.fillStyle = C.muted; ctx.fillText('Casa do Pai João · Sort Médiuns', W / 2, y + 2);
    ctx.textAlign = 'left';
  }
  return y + 22 + P - 6;
}

export async function gerarImagemResumo(d) {
  try {
    await Promise.all(['700 34px Alegreya', '700 22px Alegreya', '500 19px "Alegreya Sans"', '700 17px "Alegreya Sans"', '500 17px "Alegreya Sans"',
      '400 17px "Alegreya Sans"', '500 16px "Alegreya Sans"', '700 14px "Alegreya Sans"', '700 13px "Alegreya Sans"'].map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const logo = await carregarLogo();
  const S = LARGURA_PNG / W;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, d, logo, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H + 2);   // +2: cobre a última linha de pixels (arredondamento da escala)
  desenhar(ctx, d, logo, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
