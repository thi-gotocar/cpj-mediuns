// Imagem PNG da lista de uma oferenda (para mandar no grupo do WhatsApp).

import { situacao, dataBR, ROTULO_MEDIUM, medConferido, contagemMediuns, porCategoria } from '/shared/oferendas.js';

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

const fonteDe = (ctx) => (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
const caixa = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
const espacado = (ctx, px) => { try { ctx.letterSpacing = px; } catch { /* */ } };

// Faixa azul do topo: rótulo, título e data · dia da semana · responsável. Devolve a altura.
function cabecalho(ctx, rotulo, of, pintar) {
  const fonte = fonteDe(ctx);
  const [y0, m0, d0] = of.data.split('-').map(Number);
  const semana = new Date(y0, m0 - 1, d0).toLocaleDateString('pt-BR', { weekday: 'long' });
  fonte(700, 34, FD);
  const tl = quebrar(ctx, of.titulo, CW);
  const hh = P + 20 + tl.length * 40 + 30 + P - 8;
  if (pintar) {
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, hh);
    fonte(700, 13); ctx.fillStyle = C.soft;
    espacado(ctx, '2px');
    ctx.fillText(rotulo, P, P);
    espacado(ctx, '0px');
    fonte(700, 34, FD); ctx.fillStyle = '#ffffff';
    tl.forEach((l, k) => ctx.fillText(l, P, P + 20 + k * 40));
    fonte(500, 20); ctx.fillStyle = C.soft;
    ctx.fillText(`${dataBR(of.data)} · ${semana}${of.responsavel ? ` · Responsável: ${of.responsavel}` : ''}`, P, P + 20 + tl.length * 40 + 4);
  }
  return hh;
}

function desenhar(ctx, of, pintar) {
  const fonte = fonteDe(ctx);
  let y = cabecalho(ctx, 'OFERENDA', of, pintar) + 20;
  // médiuns (oferenda com uma linha por médium)
  if (of.porMedium && (of.mediuns || []).length) {
    const COR = { pendente: ['#fbefc4', '#7a5600'], entregue: ['#d5f0df', '#1d6b3f'], pago: ['#d5f0df', '#1d6b3f'], nao_pago: ['#fbefc4', '#7a5600'] };
    const c = contagemMediuns(of);
    fonte(500, 16);
    const resumo = quebrar(ctx, `Pago ${c.pago} · Não pago ${c.nao_pago} · Entregue ${c.entregue} · Pendente ${c.pendente}`, CW - 36);
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
        ctx.fillStyle = medConferido(m) ? COR.entregue[1] : COR.pendente[1]; ctx.fillRect(x, yy + 2, 4, LH - 12);
        fonte(500, 19); ctx.fillStyle = C.ink; ctx.fillText(m.nome, x + 14, yy + 3);
        fonte(700, 14);
        // Duas etiquetas à direita: entrega (mais à direita) e pagamento.
        let xd = P + CW - 18;
        [m.entrega, m.pagamento].forEach((st) => {
          const [bg, fg] = COR[st] || COR.pendente;
          const t = (ROTULO_MEDIUM[st] || st).toUpperCase();
          const tw = ctx.measureText(t).width + 20;
          xd -= tw;
          ctx.fillStyle = bg;
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(xd, yy + 2, tw, 24, 12) : ctx.rect(xd, yy + 2, tw, 24); ctx.fill();
          ctx.fillStyle = fg; ctx.fillText(t, xd + 10, yy + 7);
          xd -= 8;
        });
        yy += LH;
      });
    }
    y += h + 12;
  }
  // Itens: uma linha por item — bolinha (verde completo, amarela falta), o item, quem doa (cortado se não couber),
  // a entrega quando tem data própria e, à direita, "X de Y". Um cartão por categoria, com o título acima.
  if (!of.itens.length) return y + P - 12;
  if (pintar) {
    fonte(500, 16); ctx.fillStyle = C.muted;
    const legenda = [[C.verde, 'completo'], [C.amarelo, 'falta doação']];
    let x = P + 4;
    legenda.forEach(([cor, t]) => {
      ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x + 6, y + 9, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.muted; ctx.fillText(t, x + 18, y); x += 18 + ctx.measureText(t).width + 22;
    });
    if (of.itens.every((i) => !i.entrega)) ctx.fillText('· entrega no dia do evento', x - 8, y);
  }
  y += 32;
  const LH = 40;
  porCategoria(of.itens, of.categorias).forEach(([cat, itens]) => {
    if (cat) {
      if (pintar) {
        fonte(700, 15); ctx.fillStyle = C.accent;
        espacado(ctx, '2px');
        ctx.fillText(`${cat.toUpperCase()} · ${itens.length}`, P + 4, y + 4);
        espacado(ctx, '0px');
      }
      y += 30;
    }
    const h = 6 + itens.length * LH + 6;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      caixa(ctx, P, y, CW, h, 12); ctx.fill(); ctx.stroke();
      itens.forEach((i, k) => linhaItem(i, y + 6 + k * LH, k));
    }
    y += h + 14;
  });
  return y + P - 14;

  function linhaItem(i, yy, k) {
    const s = situacao(i);
    const x = P + 18;
    const meio = yy + LH / 2;
    if (k) { ctx.fillStyle = C.line; ctx.fillRect(x, yy, CW - 36, 1); }
    ctx.fillStyle = s.completo ? C.verde : C.amarelo;
    ctx.beginPath(); ctx.arc(x + 6, meio, 6, 0, Math.PI * 2); ctx.fill();
    // À direita: "X de Y" e ✓ quando entregue.
    fonte(700, 18); ctx.fillStyle = s.completo ? C.ok : C.ink;
    const qt = `${s.doado} de ${i.quantidade}${i.entregue ? ' ✓' : ''}`;
    const wq = ctx.measureText(qt).width;
    const xFim = P + CW - 18;
    ctx.fillText(qt, xFim - wq, meio - 10);
    // O item e, se sobrar espaço, quem doa e a data de entrega própria.
    let xt = x + 20;
    const max = xFim - wq - 14;
    fonte(700, 19); ctx.fillStyle = C.ink;
    const nome = cortar(ctx, i.nome, max - xt);
    ctx.fillText(nome, xt, meio - 11);
    xt += ctx.measureText(nome).width + 10;
    const extra = [...(i.entrega ? [`entrega ${dataBR(i.entrega).slice(0, 5)}`] : []), ...(i.doacoes.length ? [i.doacoes.map((d) => `${d.nome} (${d.quantidade})`).join(', ')] : [])].join(' · ');
    fonte(400, 16); ctx.fillStyle = C.muted;
    if (extra && max - xt > 40) ctx.fillText(cortar(ctx, extra, max - xt), xt, meio - 9);
  }
}

// Corta o texto com "…" para caber na largura.
function cortar(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

// Pessoas de um grupo, separadas por lista (Corrente, Curimba, turmas): um cartão por lista, nomes em duas colunas.
// g: { titulo, data, responsavel, listas: [[nomeDaLista, [nomes]]] }
function desenharPessoas(ctx, g, pintar) {
  const fonte = fonteDe(ctx);
  let y = cabecalho(ctx, 'PESSOAS DO GRUPO', g, pintar) + 20;
  const total = g.listas.reduce((n, [, l]) => n + l.length, 0);
  if (pintar) { fonte(500, 18); ctx.fillStyle = C.muted; ctx.fillText(`${total} ${total === 1 ? 'pessoa' : 'pessoas'}`, P + 4, y); }
  y += 34;
  const GAP = 16;
  const COL = (CW - 36 - GAP) / 2;
  const LH = 27;
  g.listas.forEach(([lista, nomes]) => {
    fonte(500, 19);
    // Cada nome ocupa as linhas que precisar na coluna; a linha da tabela tem a altura do maior dos dois.
    const linhas = nomes.map((n) => quebrar(ctx, n, COL - 16));
    const alturas = [];
    for (let k = 0; k < linhas.length; k += 2) alturas.push(Math.max(linhas[k].length, linhas[k + 1]?.length || 0) * LH + 8);
    const h = 18 + 30 + alturas.reduce((s, a) => s + a, 0) + 10;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      caixa(ctx, P, y, CW, h, 12); ctx.fill(); ctx.stroke();
      const x = P + 18;
      let yy = y + 16;
      fonte(700, 15); ctx.fillStyle = C.accent;
      espacado(ctx, '2px');
      ctx.fillText(`${lista.toUpperCase()} · ${nomes.length}`, x, yy);
      espacado(ctx, '0px');
      yy += 32;
      fonte(500, 19); ctx.fillStyle = C.ink;
      alturas.forEach((a, r) => {
        [0, 1].forEach((c) => {
          const ls = linhas[r * 2 + c];
          if (!ls) return;
          const xc = x + c * (COL + GAP);
          ctx.fillStyle = C.soft; ctx.beginPath(); ctx.arc(xc + 4, yy + 10, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = C.ink;
          ls.forEach((l, k) => ctx.fillText(l, xc + 16, yy + k * LH));
        });
        yy += a;
      });
    }
    y += h + 12;
  });
  return y + P - 12;
}

async function gerarPng(desenho, dados) {
  try {
    await Promise.all(['700 34px Alegreya', '400 17px "Alegreya Sans"', '700 21px "Alegreya Sans"', '500 16px "Alegreya Sans"']
      .map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const S = 1.5;
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenho(ctx, dados, false));
  c.width = W * S;
  c.height = Math.ceil(H * S);
  ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  desenho(ctx, dados, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}

export const gerarImagemOferenda = (of) => gerarPng(desenhar, of);
export const gerarImagemPessoas = (g) => gerarPng(desenharPessoas, g);
