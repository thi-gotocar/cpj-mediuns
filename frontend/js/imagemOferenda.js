// Imagem PNG da lista de uma oferenda (para mandar no grupo do WhatsApp).

import { situacao, dataBR, textoEntrega, STATUS_MEDIUM, STATUS_MEDIUM_LABEL, contagemMediuns } from '/shared/oferendas.js';

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', accent: '#2c4ea3', soft: '#c9d5f5', verde: '#2f9e5b', amarelo: '#e3b021', ok: '#24785a' };
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

function desenhar(ctx, of, pintar) {
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  const [y0, m0, d0] = of.data.split('-').map(Number);
  const semana = new Date(y0, m0 - 1, d0).toLocaleDateString('pt-BR', { weekday: 'long' });
  // cabeçalho
  fonte(700, 34, FD);
  const tl = quebrar(ctx, of.titulo, CW);
  const hh = P + 20 + tl.length * 40 + 30 + P - 8;
  if (pintar) {
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, hh);
    fonte(700, 13); ctx.fillStyle = C.soft;
    try { ctx.letterSpacing = '2px'; } catch { /* */ }
    ctx.fillText('OFERENDA', P, P);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
    fonte(700, 34, FD); ctx.fillStyle = '#ffffff';
    tl.forEach((l, k) => ctx.fillText(l, P, P + 20 + k * 40));
    fonte(500, 20); ctx.fillStyle = C.soft;
    ctx.fillText(`${dataBR(of.data)} · ${semana}${of.responsavel ? ` · Responsável: ${of.responsavel}` : ''}`, P, P + 20 + tl.length * 40 + 4);
  }
  let y = hh + 20;
  // médiuns (oferenda com uma linha por médium)
  if (of.porMedium && (of.mediuns || []).length) {
    const COR = { pendente: ['#fbefc4', '#7a5600'], entregue: ['#d5f0df', '#1d6b3f'], pago: ['#dbe6fb', '#2c4ea3'], nao_pago: ['#f8dedb', '#a2423a'], nao_vai: ['#e4e7ec', '#5b6678'] };
    const c = contagemMediuns(of);
    fonte(500, 16);
    const resumo = quebrar(ctx, STATUS_MEDIUM.filter(([k]) => c[k]).map(([k, l]) => `${l} ${c[k]}`).join(' · '), CW - 36);
    const LH = 34;
    const h = 18 + 26 + resumo.length * 22 + 8 + of.mediuns.length * LH + 10;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(P, y, CW, h, 12) : ctx.rect(P, y, CW, h); ctx.fill(); ctx.stroke();
      const x = P + 18;
      let yy = y + 16;
      fonte(700, 21); ctx.fillStyle = C.ink; ctx.fillText(`Pessoas (${of.mediuns.length})`, x, yy); yy += 28;
      fonte(500, 16); ctx.fillStyle = C.muted; resumo.forEach((l) => { ctx.fillText(l, x, yy); yy += 22; });
      yy += 8;
      of.mediuns.forEach((m, k) => {
        if (k) { ctx.fillStyle = C.line; ctx.fillRect(x, yy - 4, CW - 36, 1); }
        const [bg, fg] = COR[m.status] || COR.pendente;
        ctx.fillStyle = fg; ctx.fillRect(x, yy + 2, 4, LH - 12);
        fonte(500, 19); ctx.fillStyle = C.ink; ctx.fillText(m.nome, x + 14, yy + 3);
        fonte(700, 14);
        const t = (STATUS_MEDIUM_LABEL[m.status] || m.status).toUpperCase();
        const tw = ctx.measureText(t).width + 20;
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(P + CW - 18 - tw, yy + 2, tw, 24, 12) : ctx.rect(P + CW - 18 - tw, yy + 2, tw, 24); ctx.fill();
        ctx.fillStyle = fg; ctx.fillText(t, P + CW - 18 - tw + 10, yy + 7);
        yy += LH;
      });
    }
    y += h + 12;
  }
  // itens
  of.itens.forEach((i) => {
    const s = situacao(i);
    fonte(700, 21);
    const nome = quebrar(ctx, i.nome, CW - 150);
    fonte(400, 17);
    const doadores = i.doacoes.length ? quebrar(ctx, i.doacoes.map((d) => `${d.nome} (${d.quantidade})`).join(', '), CW - 30) : [];
    const h = 18 + nome.length * 26 + 24 + doadores.length * 23 + (s.completo ? 0 : 23) + 14;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(P, y, CW, h, 12) : ctx.rect(P, y, CW, h); ctx.fill(); ctx.stroke();
      const x = P + 18;
      let yy = y + 16;
      ctx.fillStyle = s.completo ? C.verde : C.amarelo;
      ctx.beginPath(); ctx.arc(x + 6, yy + 12, 7, 0, Math.PI * 2); ctx.fill();
      fonte(700, 21); ctx.fillStyle = C.ink;
      nome.forEach((l, k) => ctx.fillText(l, x + 22, yy + k * 26));
      fonte(700, 19); ctx.fillStyle = s.completo ? C.ok : C.ink;
      const qt = `${s.doado} de ${i.quantidade}`;
      ctx.fillText(qt, P + CW - 18 - ctx.measureText(qt).width, yy + 2);
      yy += nome.length * 26 + 2;
      fonte(500, 16); ctx.fillStyle = C.muted;
      ctx.fillText(`Entrega: ${textoEntrega(i)}${i.entregue ? '   ✓ entregue' : ''}`, x + 22, yy);
      yy += 24;
      fonte(400, 17); ctx.fillStyle = C.ink;
      doadores.forEach((l) => { ctx.fillText(l, x + 22, yy); yy += 23; });
      if (!s.completo) { fonte(700, 16); ctx.fillStyle = '#9a6a10'; ctx.fillText(`Faltam ${s.falta}`, x + 22, yy); }
    }
    y += h + 12;
  });
  return y + P - 12;
}

export async function gerarImagemOferenda(of) {
  try {
    await Promise.all(['700 34px Alegreya', '400 17px "Alegreya Sans"', '700 21px "Alegreya Sans"', '500 16px "Alegreya Sans"']
      .map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const S = 1.5;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenhar(ctx, of, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  desenhar(ctx, of, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
