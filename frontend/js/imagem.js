// Imagem PNG da escala (para mandar no grupo do WhatsApp).

import { paresPorMedium } from '/shared/regras.js';
import { dLong, dShort } from './util.js';
import { gruposExtras } from './exportar.js';

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', accent: '#2c4ea3', soft: '#c9d5f5', gold: '#a8771c', ent: '#f2d58f' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 720;
const P = 32;
const CW = W - 2 * P;

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

// Desenha (ou só mede, com desenhar = false) e devolve a altura.
function desenhar(ctx, pessoas, g, desenhar) {
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || '(removido)';
  const { lista, semPasse } = paresPorMedium(pessoas, g);
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  const espaco = (v) => { try { ctx.letterSpacing = v; } catch { /* navegador antigo */ } };
  let y;

  // cabeçalho
  const t0 = dLong(g.data);
  const titulo = t0.charAt(0).toUpperCase() + t0.slice(1);
  fonte(700, 36, FD);
  const tl = quebrar(ctx, titulo, CW);
  fonte(700, 22);
  const el = g.entidade ? quebrar(ctx, g.entidade, CW) : [];
  const hh = P + 22 + tl.length * 42 + (el.length ? 6 + el.length * 28 : 0) + P;
  y = P;
  if (desenhar) {
    ctx.fillStyle = C.accent;
    ctx.fillRect(0, 0, W, hh);
    fonte(700, 13); espaco('2px'); ctx.fillStyle = C.soft;
    ctx.fillText('ESCALA DA GIRA · ' + dShort(g.data), P, y);
    espaco('0px');
  }
  y += 22;
  if (desenhar) { fonte(700, 36, FD); ctx.fillStyle = '#ffffff'; tl.forEach((l, i) => ctx.fillText(l, P, y + i * 42)); }
  y += tl.length * 42;
  if (el.length) {
    y += 6;
    if (desenhar) { fonte(700, 22); ctx.fillStyle = C.ent; el.forEach((l, i) => ctx.fillText(l, P, y + i * 28)); }
    y += el.length * 28;
  }
  y = hh + 20;

  // blocos em duas colunas
  const secao = (titulo, c1, c2, linhas) => {
    if (!linhas.length) return;
    const ix = P + 20, leftW = CW * 0.44 - 20, rx = P + CW * 0.44 + 8, rightW = CW * 0.56 - 28;
    const rs = linhas.map((r) => {
      fonte(700, 19); const ll = quebrar(ctx, r.l, leftW);
      fonte(400, 19); const rl = r.r.flatMap((t) => quebrar(ctx, t, rightW));
      return { ...r, ll, rl, h: Math.max(ll.length * 25 + (r.tag ? 18 : 0), rl.length * 25) + 18 };
    });
    const ch = 20 + 30 + 22 + rs.reduce((a, r) => a + r.h, 0) + 10;
    if (desenhar) { ctx.fillStyle = C.card; retangulo(ctx, P, y, CW, ch, 14); ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); }
    let yy = y + 20;
    if (desenhar) { fonte(700, 24, FD); ctx.fillStyle = C.ink; ctx.fillText(titulo, ix, yy); }
    yy += 30;
    if (desenhar) { fonte(700, 12); espaco('1.5px'); ctx.fillStyle = C.muted; ctx.fillText(c1, ix, yy); ctx.fillText(c2, rx, yy); espaco('0px'); }
    yy += 22;
    rs.forEach((r) => {
      if (desenhar) {
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(ix, yy + 0.5); ctx.lineTo(P + CW - 20, yy + 0.5); ctx.stroke();
        let ly = yy + 9; fonte(700, 19); ctx.fillStyle = r.mut ? C.muted : C.ink;
        r.ll.forEach((l) => { ctx.fillText(l, ix, ly); ly += 25; });
        if (r.tag) { fonte(700, 12); espaco('1.5px'); ctx.fillStyle = C.gold; ctx.fillText(r.tag, ix, ly); espaco('0px'); }
        let ry = yy + 9; fonte(400, 19); ctx.fillStyle = r.vazio ? C.muted : C.ink;
        r.rl.forEach((l) => { ctx.fillText(l, rx, ry); ry += 25; });
      }
      yy += r.h;
    });
    y += ch + 16;
  };
  secao('Médiuns e cambones', 'MÉDIUM', 'CAMBONE', lista.map((x) => ({
    l: x.m.nome, tag: x.m.funcao === 'extra' ? 'EXTRA' : '',
    r: x.cams.length ? x.cams.map((p) => nome(p.c)) : ['—'], vazio: !x.cams.length,
  })));
  secao('Médiuns de passe', 'MÉDIUM', 'PASSE', lista.filter((x) => x.passes.length)
    .map((x) => ({ l: x.m.nome, r: x.passes.map((p) => nome(p.c)) }))
    .concat(semPasse.length ? [{ l: 'Sem médium', mut: true, r: semPasse.map(nome) }] : []));

  // demais grupos
  const info = gruposExtras(pessoas, g);
  if (info.length) {
    const ix = P + 20, iw = CW - 40;
    fonte(400, 19);
    const it = info.map(([k, nomes]) => ({ k: k.toUpperCase(), ll: quebrar(ctx, nomes.join(', '), iw) }));
    const ch = 20 + it.reduce((a, i) => a + 20 + i.ll.length * 25 + 14, 0) + 6;
    if (desenhar) { ctx.fillStyle = C.card; retangulo(ctx, P, y, CW, ch, 14); ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke(); }
    let yy = y + 20;
    it.forEach((i) => {
      if (desenhar) { fonte(700, 12); espaco('1.5px'); ctx.fillStyle = C.muted; ctx.fillText(i.k, ix, yy); espaco('0px'); }
      yy += 20;
      if (desenhar) { fonte(400, 19); ctx.fillStyle = C.ink; i.ll.forEach((l, k) => ctx.fillText(l, ix, yy + k * 25)); }
      yy += i.ll.length * 25 + 14;
    });
    y += ch + 16;
  }
  if (desenhar) { fonte(500, 13); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText('Sort Médiuns', W / 2, y + 2); ctx.textAlign = 'left'; }
  return y + 2 + 16 + P - 8;
}

export async function gerarImagem(pessoas, g) {
  try {
    await Promise.all(['700 36px Alegreya', '700 24px Alegreya', '400 19px "Alegreya Sans"', '700 19px "Alegreya Sans"', '500 13px "Alegreya Sans"']
      .map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const S = 1.5;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, pessoas, g, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  desenhar(ctx, pessoas, g, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
