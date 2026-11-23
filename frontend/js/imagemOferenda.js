// Imagem PNG da lista de uma oferenda (para mandar no grupo do WhatsApp).

import { situacao, dataBR, ROTULO_MEDIUM, medConferido, contagemMediuns, porCategoria, qtdTxt, corItem, CORES_ITEM, responsaveisItem } from '/shared/oferendas.js';
import { quebrar, gerarPng } from './canvas.js';

const C = { bg: '#f5f7fb', card: '#ffffff', ink: '#18212f', muted: '#5b6678', line: '#dde3ec', accent: '#2c4ea3', soft: '#c9d5f5', verde: '#2f9e5b', amarelo: '#e3b021', vermelho: '#d9534f', cinza: '#8a94a3', ok: '#24785a' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
const W = 720;
const P = 32;
const CW = W - 2 * P;

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
  // Itens: uma linha por item — bolinha (cor pelo quanto já tem doador), o item, quem doa (cortado se não couber),
  // a entrega quando tem data própria e, à direita, "X de Y". Um cartão por categoria, com o título acima.
  if (!of.itens.length) return y + P - 12;
  if (pintar) {
    fonte(500, 16); ctx.fillStyle = C.muted;
    const legenda = CORES_ITEM.map(([k, , t]) => [COR_ITEM[k], t]);
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
    ctx.fillStyle = COR_ITEM[corItem(i)];
    ctx.beginPath(); ctx.arc(x + 6, meio, 6, 0, Math.PI * 2); ctx.fill();
    // À direita: "X de Y" e ✓ quando entregue.
    fonte(700, 18); ctx.fillStyle = s.completo ? C.ok : C.ink;
    const qt = `${s.doado} de ${qtdTxt(i.quantidade, i.unidade)}${i.entregue ? ' ✓' : ''}`;
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
    const extra = [...(i.entrega ? [`entrega ${dataBR(i.entrega).slice(0, 5)}`] : []), ...(i.todos || i.doacoes.length ? [responsaveisItem(i, true)] : [])].join(' · ');
    fonte(400, 16); ctx.fillStyle = C.muted;
    if (extra && max - xt > 40) ctx.fillText(cortar(ctx, extra, max - xt), xt, meio - 9);
  }
}

// Bolinha do item: cinza ninguém doou, vermelho abaixo de 50%, amarelo de 50% a 99%, verde completo.
const COR_ITEM = { nada: C.cinza, baixo: C.vermelho, meio: C.amarelo, cheio: C.verde };

// Corta o texto com "…" para caber na largura.
function cortar(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

// Pessoas de um grupo, separadas por lista (Corrente, Curimba, turmas): um cartão por lista, nomes em duas colunas.
// g: { titulo, data, responsavel, rotulo?, listas: [[nomeDaLista, [nome | { nome, status: [[texto, ok]] }]]] }
// Com status (transporte), cada nome ganha uma linha pequena: verde quando ok, amarela quando falta.
function desenharPessoas(ctx, g, pintar) {
  const fonte = fonteDe(ctx);
  let y = cabecalho(ctx, g.rotulo || 'PESSOAS DO GRUPO', g, pintar) + 20;
  const total = g.listas.reduce((n, [, l]) => n + l.length, 0);
  if (pintar) { fonte(500, 18); ctx.fillStyle = C.muted; ctx.fillText(`${total} ${total === 1 ? 'pessoa' : 'pessoas'}`, P + 4, y); }
  y += 34;
  const GAP = 16;
  const COL = (CW - 36 - GAP) / 2;
  const LH = 27;
  const SL = 20;   // linha do status
  g.listas.forEach(([lista, nomesBrutos]) => {
    const nomes = nomesBrutos.map((n) => (typeof n === 'string' ? { nome: n } : n));
    fonte(500, 19);
    // Cada nome ocupa as linhas que precisar na coluna; a linha da tabela tem a altura do maior dos dois.
    const linhas = nomes.map((n) => quebrar(ctx, n.nome, COL - 16));
    const alto = (k) => (linhas[k] ? linhas[k].length * LH + (nomes[k].status ? SL : 0) : 0);
    const alturas = [];
    for (let k = 0; k < linhas.length; k += 2) alturas.push(Math.max(alto(k), alto(k + 1)) + 8);
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
          fonte(500, 19);
          ls.forEach((l, k) => ctx.fillText(l, xc + 16, yy + k * LH));
          const st = nomes[r * 2 + c].status;
          if (st) {
            fonte(700, 13);
            let xs = xc + 16;
            st.forEach(([t, ok]) => {
              ctx.fillStyle = ok ? C.ok : '#9a6a10';
              const txt = (ok ? '✓ ' : '• ') + t;
              ctx.fillText(txt, xs, yy + ls.length * LH - 2);
              xs += ctx.measureText(txt).width + 10;
            });
            fonte(500, 19);
          }
        });
        yy += a;
      });
    }
    y += h + 12;
  });
  return y + P - 12;
}

// Resumo do evento encerrado (informações executivas): números do evento, um cartão por oferenda
// (responsável, pessoas em poucas linhas e dois gráficos de barra) e os transportes.
// r: { titulo, data, participantes, oferendas: [{ nome, responsavel, pessoas: [nomes], contribuiram, itens, entregues }], transportes: [{ descricao, responsavel, pessoas }] }
function desenharResumo(ctx, r, pintar) {
  const fonte = fonteDe(ctx);
  let y = cabecalho(ctx, 'RESUMO DO EVENTO · CONCLUÍDO', { titulo: r.titulo, data: r.data }, pintar) + 20;
  // Números do evento, em dois quadros.
  const QW = (CW - 12) / 2;
  [[String(r.participantes), r.participantes === 1 ? 'participante' : 'participantes'], [String(r.oferendas.length), r.oferendas.length === 1 ? 'oferenda' : 'oferendas']].forEach(([n, t], k) => {
    if (!pintar) return;
    const x = P + k * (QW + 12);
    ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    caixa(ctx, x, y, QW, 76, 12); ctx.fill(); ctx.stroke();
    fonte(700, 32, FD); ctx.fillStyle = C.accent; ctx.fillText(n, x + 18, y + 12);
    fonte(500, 16); ctx.fillStyle = C.muted; ctx.fillText(t, x + 18, y + 50);
  });
  y += 76 + 16;
  // Barra: rótulo à esquerda, "x de y · p%" à direita, trilho cinza com o preenchido (verde 100%, amarelo 50%+, vermelho abaixo).
  const barra = (yy, rotulo, feito, total) => {
    const pct = total ? Math.round((feito * 100) / total) : 0;
    const cor = pct >= 100 ? C.verde : pct >= 50 ? C.amarelo : C.vermelho;
    if (pintar) {
      fonte(500, 15); ctx.fillStyle = C.muted; ctx.fillText(rotulo, P + 18, yy);
      fonte(700, 15); ctx.fillStyle = C.ink;
      const dir = `${feito} de ${total} · ${pct}%`;
      ctx.fillText(dir, P + CW - 18 - ctx.measureText(dir).width, yy);
      ctx.fillStyle = C.line; caixa(ctx, P + 18, yy + 22, CW - 36, 10, 5); ctx.fill();
      if (pct) { ctx.fillStyle = cor; caixa(ctx, P + 18, yy + 22, Math.max(10, (CW - 36) * Math.min(pct, 100) / 100), 10, 5); ctx.fill(); }
    }
    return 44;
  };
  r.oferendas.forEach((o) => {
    fonte(400, 15);
    const nomes = o.pessoas.length ? quebrar(ctx, o.pessoas.join(', '), CW - 36) : ['Ninguém no grupo'];
    const pl = nomes.slice(0, 2);
    if (nomes.length > 2) pl[1] = cortar(ctx, pl[1] + ' …', CW - 36);
    const h = 16 + 28 + 22 + pl.length * 20 + 10 + 44 + 44 + 6;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      caixa(ctx, P, y, CW, h, 12); ctx.fill(); ctx.stroke();
      fonte(700, 22, FD); ctx.fillStyle = C.ink; ctx.fillText(cortar(ctx, o.nome, CW - 36), P + 18, y + 14);
      fonte(500, 15); ctx.fillStyle = C.muted;
      ctx.fillText(`Responsável: ${o.responsavel || '—'} · ${o.pessoas.length} ${o.pessoas.length === 1 ? 'pessoa' : 'pessoas'}`, P + 18, y + 44);
      fonte(400, 15); ctx.fillStyle = C.ink;
      pl.forEach((l, k) => ctx.fillText(l, P + 18, y + 66 + k * 20));
    }
    let yy = y + 66 + pl.length * 20 + 10;
    yy += barra(yy, 'Pessoas que contribuíram', o.contribuiram, o.pessoas.length);
    barra(yy, 'Itens entregues', o.entregues, o.itens);
    y += h + 12;
  });
  if (r.transportes.length) {
    const h = 16 + 30 + r.transportes.length * 26 + 8;
    if (pintar) {
      ctx.fillStyle = C.card; ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      caixa(ctx, P, y, CW, h, 12); ctx.fill(); ctx.stroke();
      fonte(700, 15); ctx.fillStyle = C.accent; espacado(ctx, '2px'); ctx.fillText('TRANSPORTE', P + 18, y + 16); espacado(ctx, '0px');
      r.transportes.forEach((t, k) => {
        fonte(700, 17); ctx.fillStyle = C.ink;
        const yy = y + 46 + k * 26;
        ctx.fillText(cortar(ctx, t.descricao, 220), P + 18, yy);
        fonte(400, 16); ctx.fillStyle = C.muted;
        ctx.fillText(cortar(ctx, `Responsável: ${t.responsavel || '—'} · ${t.pessoas} ${t.pessoas === 1 ? 'pessoa' : 'pessoas'}`, CW - 36 - 230), P + 18 + 230, yy + 1);
      });
    }
    y += h + 12;
  }
  return y + P - 12;
}

const png = (desenho, dados) => gerarPng({
  largura: W, escala: 1.5, fundo: C.bg,
  fontes: ['700 34px Alegreya', '400 17px "Alegreya Sans"', '700 21px "Alegreya Sans"', '500 16px "Alegreya Sans"'],
  desenho: (ctx, pintar) => desenho(ctx, dados, pintar),
});

export const gerarImagemOferenda = (of) => png(desenhar, of);
export const gerarImagemPessoas = (g) => png(desenharPessoas, g);
export const gerarImagemResumo = (r) => png(desenharResumo, r);
