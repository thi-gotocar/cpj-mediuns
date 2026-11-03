// Imagem PNG da escala (para mandar no grupo do WhatsApp).
// Mesma organização do texto do WhatsApp: cabeçalho com o logo da casa e as linhas Orixá, Gira e Senha;
// médiuns e At. Extras em linhas alternadas, com o médium de passe embaixo do nome do médium;
// no fim, quadros para suporte, cambones de apoio e a turma da limpeza (com quem ajuda).

import { paresPorMedium } from '/shared/regras.js';
import { dLong } from './util.js';
import { gruposExtras, cabecalhoGira } from './exportar.js';

const C = {
  bg: '#f4f1ea', card: '#ffffff', ink: '#1e2533', muted: '#6b7385', line: '#e8e3d8', zebra: '#faf7f0',
  navy: '#1c2b4a', navy2: '#2d4a86', gold: '#c9a24a',
};
// Cor de cada seção e de cada quadro do fim.
const COR = { medium: '#2d4a86', extra: '#b07d1c', passe: '#2f7d5b', suporte: '#2f7d5b', apoio: '#2d4a86', limpeza: '#c06a14' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 720;
const P = 28;
const CW = W - 2 * P;
const LH = 25;   // altura da linha de texto das listas
const R = 54;    // raio do logo no cabeçalho

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
// Cartão branco com sombra leve e a faixa colorida à esquerda (cortada no canto arredondado).
function cartao(ctx, x, y, w, h, cor) {
  ctx.save();
  ctx.shadowColor = 'rgba(30,37,51,.08)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
  ctx.fillStyle = C.card; retangulo(ctx, x, y, w, h, 16); ctx.fill();
  ctx.restore();
  ctx.save(); retangulo(ctx, x, y, w, h, 16); ctx.clip();
  ctx.fillStyle = cor; ctx.fillRect(x, y, 6, h);
  ctx.restore();
}

// Desenha (ou só mede, com desenhar = false) e devolve a altura.
function desenhar(ctx, pessoas, g, desenhar, giras = [], logo = null) {
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || '(removido)';
  const { lista, semPasse } = paresPorMedium(pessoas, g);
  const cab = cabecalhoGira(g);
  const grupos = gruposExtras(pessoas, g, giras);
  const grupo = (k) => grupos.find((x) => x[2] === k);
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  const espaco = (v) => { try { ctx.letterSpacing = v; } catch { /* navegador antigo */ } };
  let y;

  // ---- cabeçalho: logo da casa, "Sábado, 7 de novembro", a data e as linhas Orixá, Gira e Senha
  const tx = logo ? P + 2 * R + 22 : P;
  const tw = W - tx - P;
  const t0 = dLong(g.data);
  fonte(700, 34, FD);
  const tl = quebrar(ctx, t0.charAt(0).toUpperCase() + t0.slice(1), tw);
  fonte(700, 20);
  const linhas = [['ORIXÁ', cab.orixa], ['GIRA', cab.gira], ['SENHA', grupo('senha') ? grupo('senha')[1].join(', ') : '']]
    .filter(([, v]) => v).map(([k, v]) => ({ k, vl: quebrar(ctx, v, tw - 78) }));
  const alturaLinhas = linhas.reduce((a, l) => a + l.vl.length * 26 + 4, 0);
  const hh = Math.max(P + 22 + tl.length * 40 + 26 + (linhas.length ? 10 + alturaLinhas : 0) + P, logo ? 2 * P + 2 * R + 5 : 0);
  if (desenhar) {
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
  }
  y = P;
  if (desenhar) { fonte(700, 13); espaco('2.5px'); ctx.fillStyle = C.gold; ctx.fillText('CASA DO PAI JOÃO · ESCALA DA GIRA', tx, y); espaco('0px'); }
  y += 22;
  if (desenhar) { fonte(700, 34, FD); ctx.fillStyle = '#ffffff'; tl.forEach((l, i) => ctx.fillText(l, tx, y + i * 40)); }
  y += tl.length * 40;
  if (desenhar) { fonte(500, 17); ctx.fillStyle = '#c9d5f5'; ctx.fillText(cab.data, tx, y); }
  y += 26;
  if (linhas.length) {
    y += 10;
    linhas.forEach((l) => {
      if (desenhar) {
        fonte(700, 12); espaco('1.5px'); ctx.fillStyle = C.gold; ctx.fillText(l.k, tx, y + 5); espaco('0px');
        fonte(700, 20); ctx.fillStyle = '#ffffff'; l.vl.forEach((v, i) => ctx.fillText(v, tx + 78, y + i * 26));
      }
      y += l.vl.length * 26 + 4;
    });
  }
  y = hh + 22;

  // ---- seções em duas colunas, com linhas alternadas; o médium de passe vai embaixo do nome do médium
  const secao = (titulo, cor, c1, c2, itens) => {
    if (!itens.length) return;
    const ix = P + 22, leftW = CW * 0.45 - 30, rx = P + CW * 0.45 + 6, rightW = CW * 0.55 - 30;
    const rs = itens.map((r) => {
      fonte(700, 19); const ll = quebrar(ctx, r.l, leftW);
      fonte(600, 16); const pl = r.passe ? quebrar(ctx, 'Passe · ' + r.passe, leftW) : [];
      fonte(r.vazio ? 'italic 400' : 400, 19); const rl = r.r.flatMap((t) => quebrar(ctx, t, rightW));
      return { ...r, ll, pl, rl, h: Math.max(ll.length * LH + pl.length * 22 + (pl.length ? 2 : 0), rl.length * LH) + 18 };
    });
    const ch = 22 + 30 + 26 + rs.reduce((a, r) => a + r.h, 0) + 14;
    if (desenhar) cartao(ctx, P, y, CW, ch, cor);
    let yy = y + 22;
    if (desenhar) {
      fonte(700, 24, FD); ctx.fillStyle = C.ink; ctx.fillText(titulo, ix, yy);
      fonte(700, 15); const n = String(itens.length); const nw = ctx.measureText(n).width + 20;
      retangulo(ctx, P + CW - 22 - nw, yy + 2, nw, 26, 13); ctx.fillStyle = cor; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(n, P + CW - 22 - nw / 2, yy + 6); ctx.textAlign = 'left';
    }
    yy += 34;
    if (desenhar) { fonte(700, 12); espaco('1.5px'); ctx.fillStyle = cor; ctx.fillText(c1, ix, yy); ctx.fillText(c2, rx, yy); espaco('0px'); }
    yy += 22;
    rs.forEach((r, i) => {
      if (desenhar) {
        if (i % 2 === 0) { ctx.fillStyle = C.zebra; retangulo(ctx, ix - 10, yy, CW - 2 * (ix - P) + 20, r.h, 8); ctx.fill(); }
        let ly = yy + 9; fonte(700, 19); ctx.fillStyle = C.ink;
        r.ll.forEach((l) => { ctx.fillText(l, ix, ly); ly += LH; });
        if (r.pl.length) { ly += 2; fonte(600, 16); ctx.fillStyle = COR.passe; r.pl.forEach((l) => { ctx.fillText(l, ix, ly); ly += 22; }); }
        let ry = yy + 9; fonte(r.vazio ? 'italic 400' : 400, 19); ctx.fillStyle = r.vazio ? C.muted : C.ink;
        r.rl.forEach((l) => { ctx.fillText(l, rx, ry); ry += LH; });
      }
      yy += r.h;
    });
    y += ch + 18;
  };
  const linhaCambone = (x) => ({ l: x.m.nome, r: x.cams.length ? x.cams.map((p) => nome(p.c)) : ['sem cambone'], vazio: !x.cams.length,
    passe: x.passes.map((p) => nome(p.c)).join(' e ') });
  secao('Médiuns', COR.medium, 'MÉDIUM', 'CAMBONE', lista.filter((x) => x.m.funcao !== 'extra').map(linhaCambone));
  secao('At. Extras', COR.extra, 'AT. EXTRA', 'CAMBONE', lista.filter((x) => x.m.funcao === 'extra').map(linhaCambone));

  // ---- quadros do fim: passe sem médium (se houver), suporte e cambones de apoio lado a lado,
  //      e a turma da limpeza na largura toda, com quem ajuda embaixo
  const gap = 14;
  // Quadro: título colorido, nomes e, se houver, uma parte de baixo separada por um fio (quem ajuda na limpeza).
  // Dois lado a lado: um nome por linha; sozinho na largura toda: nomes separados por " · ".
  const medir = (q, bw, empilhado) => {
    const partes = [{ t: q.titulo, nomes: q.nomes }, ...(q.sub ? [q.sub] : [])].map((pt) => {
      fonte(700, 12); const tt = quebrar(ctx, pt.t.toUpperCase(), bw - 40);
      fonte(400, 18); const ll = empilhado ? pt.nomes.flatMap((n) => quebrar(ctx, n, bw - 40)) : quebrar(ctx, pt.nomes.join(' · '), bw - 40);
      return { tt, ll };
    });
    return { partes, h: 18 + partes.reduce((a, pt, i) => a + (i ? 14 : 0) + pt.tt.length * 17 + 8 + pt.ll.length * 24, 0) + 16 };
  };
  const quadro = (q, m, bx, bw, bh) => {
    cartao(ctx, bx, y, bw, bh, q.cor);
    let yy = y + 18;
    m.partes.forEach((pt, i) => {
      if (i) { yy += 4; ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + 22, yy + 0.5); ctx.lineTo(bx + bw - 22, yy + 0.5); ctx.stroke(); yy += 10; }
      fonte(700, 12); espaco('1.5px'); ctx.fillStyle = q.cor; pt.tt.forEach((l) => { ctx.fillText(l, bx + 22, yy); yy += 17; }); espaco('0px');
      yy += 8;
      fonte(400, 18); ctx.fillStyle = C.ink; pt.ll.forEach((l) => { ctx.fillText(l, bx + 22, yy); yy += 24; });
    });
  };
  const linhaDeQuadros = (qs) => {
    if (!qs.length) return;
    const bw = qs.length === 2 ? (CW - gap) / 2 : CW;
    const ms = qs.map((q) => medir(q, bw, qs.length === 2));
    const bh = Math.max(...ms.map((m) => m.h));
    if (desenhar) qs.forEach((q, j) => quadro(q, ms[j], P + j * (bw + gap), bw, bh));
    y += bh + gap;
  };
  const q = (k) => (grupo(k) ? { titulo: grupo(k)[0], nomes: grupo(k)[1], cor: COR[k] } : null);
  if (semPasse.length) linhaDeQuadros([{ titulo: 'Passe sem médium', nomes: semPasse.map(nome), cor: COR.passe }]);
  linhaDeQuadros([q('suporte'), q('apoio')].filter(Boolean));
  const limp = grupo('limpeza');
  if (limp) {
    linhaDeQuadros([{ titulo: limp[0].replace(/^Limpeza · (Turma \d+)$/, '$1 da limpeza'), nomes: limp[1], cor: COR.limpeza,
      sub: grupo('ajudam') ? { t: 'Ajudam na limpeza', nomes: grupo('ajudam')[1] } : null }]);
  }

  // ---- rodapé
  y += 8;
  if (desenhar) {
    ctx.textAlign = 'center';
    fonte('italic 700', 20, FD); ctx.fillStyle = C.navy; ctx.fillText('Boa gira a todos!', W / 2, y);
    fonte(500, 13); ctx.fillStyle = C.muted; ctx.fillText('Casa do Pai João · Sort Médiuns', W / 2, y + 28);
    ctx.textAlign = 'left';
  }
  return y + 28 + 16 + P - 6;
}

async function carregarLogo() {
  try {
    const img = new Image();
    img.src = '/img/terreiro.png';
    await img.decode();
    return img;
  } catch { return null; }
}

export async function gerarImagem(pessoas, g, giras = []) {
  try {
    await Promise.all(['700 34px Alegreya', 'italic 700 20px Alegreya', '700 24px Alegreya', '400 19px "Alegreya Sans"', 'italic 400 19px "Alegreya Sans"',
      '700 19px "Alegreya Sans"', '600 16px "Alegreya Sans"', '500 13px "Alegreya Sans"'].map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const logo = await carregarLogo();
  const S = 2;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, pessoas, g, false, giras, logo));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  desenhar(ctx, pessoas, g, true, giras, logo);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
