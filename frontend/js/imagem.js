// Imagem PNG da escala (para mandar no grupo do WhatsApp).
// Mesma organização do texto do WhatsApp: cabeçalho com o logo da casa e as linhas Orixá, Gira e Senha;
// médiuns e At. Extras em linhas alternadas, com o médium de passe embaixo do nome do médium;
// o recado do admin logo abaixo do cabeçalho; no fim, quadros para suporte, cambones de apoio, a turma da limpeza
// (com quem ajuda) e quem não vem (ausências e faltas). Quem faz aniversário no dia da gira leva 🥳 ao lado do nome.

import { paresPorMedium, escalaDaGira, guiaNaGira } from '/shared/regras.js';
import { gruposExtras, cabecalhoGira, foraDaGira, idsAniversariantes } from './exportar.js';

const C = {
  bg: '#f4f1ea', card: '#ffffff', ink: '#1e2533', muted: '#6b7385', line: '#e8e3d8', zebra: '#faf7f0',
  navy: '#1c2b4a', navy2: '#2d4a86', gold: '#c9a24a', guia: '#8a6516', vermelho: '#c0392b', re: '#b4530a', reSoft: '#fde6cc',
};
// Cor de cada seção e de cada quadro do fim.
const COR = { medium: '#2d4a86', extra: '#b07d1c', passe: '#2f7d5b', suporte: '#2f7d5b', apoio: '#2d4a86', limpeza: '#c06a14', recado: '#2c4ea3', fora: '#c0392b' };
const FD = '"Alegreya",Georgia,serif';
const FB = '"Alegreya Sans",system-ui,sans-serif';
// Área de desenho estreita (560) e imagem final larga (1440 px): no celular, tudo aparece grande e nítido.
const W = 560;
const LARGURA_PNG = 1440;
const P = 22;
const CW = W - 2 * P;
const LH = 24;   // altura da linha de texto das listas
const R = 22;    // raio do logo no cabeçalho

export function quebrar(ctx, t, max) {
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
export function retangulo(ctx, x, y, w, h, r) {
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
function desenhar(ctx, cadastro, g, desenhar, giras = [], logo = null) {
  // Aniversariante: o 🥳 vai junto do nome, em qualquer lugar da imagem em que ele apareça.
  const festa = idsAniversariantes(cadastro, g);
  const pessoas = festa.size ? cadastro.map((p) => (festa.has(p.id) ? { ...p, nome: p.nome + ' 🥳' } : p)) : cadastro;
  const nome = (id) => pessoas.find((p) => p.id === id)?.nome || '(removido)';
  const { lista, semPasse } = paresPorMedium(pessoas, escalaDaGira(g));
  const cab = cabecalhoGira(g);
  const grupos = gruposExtras(pessoas, g, giras);
  const grupo = (k) => grupos.find((x) => x[2] === k);
  const fonte = (w, s, f) => { ctx.font = `${w} ${s}px ${f || FB}`; };
  const espaco = (v) => { try { ctx.letterSpacing = v; } catch { /* navegador antigo */ } };
  let y;

  // ---- cabeçalho compacto: logo da casa, "Quarta-feira, 11/11/2026" e, embaixo, Orixá e Gira (lado a lado
  //      quando cabem) e Senha. A altura vai para a escala: no WhatsApp, imagem comprida perde nitidez.
  const PH = 10;
  const tx = logo ? P + 2 * R + 12 : P;
  const tw = W - tx - P;
  fonte(700, 22, FD);
  const tl = quebrar(ctx, `${cab.dia}, ${cab.data}`, tw);
  const KW = 48;   // rótulo (ORIXÁ, GIRA, SENHA) antes do valor
  fonte(700, 16);
  const larg = (t) => ctx.measureText(t).width;
  const pares = [['ORIXÁ', cab.orixa], ['GIRA', cab.gira]].filter(([, v]) => v);
  const juntos = pares.length === 2 && KW + larg(pares[0][1]) + 18 + KW + larg(pares[1][1]) <= tw;
  const linhas = (juntos ? [pares] : pares.map((p) => [p])).map((ps) => ps.map(([k, v]) => ({ k, vl: quebrar(ctx, v, tw - KW) })));
  const senha = grupo('senha') ? grupo('senha')[1].join(', ') : '';
  if (senha) linhas.push([{ k: 'SENHA', vl: quebrar(ctx, senha, tw - KW) }]);
  const altLinha = (l) => Math.max(...l.map((it) => it.vl.length)) * 20;
  // Escala com remanejamento (faltas de última hora): aviso no cabeçalho e os remanejados destacados na lista.
  const remanejada = lista.some((x) => x.cams.some((p) => p.remanejado) || x.passes.some((p) => p.remanejado));
  const hh = Math.max(PH + tl.length * 26 + 2 + linhas.reduce((a, l) => a + altLinha(l), 0) + (remanejada ? 26 : 0) + PH, logo ? 2 * PH + 2 * R : 0) + 3;
  if (desenhar) {
    const gr = ctx.createLinearGradient(0, 0, W, hh);
    gr.addColorStop(0, C.navy); gr.addColorStop(1, C.navy2);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, hh);
    ctx.fillStyle = C.gold; ctx.fillRect(0, hh - 3, W, 3);
    if (logo) {
      const cx = P + R, cy = (hh - 3) / 2;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 3, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(logo, cx - R + 3, cy - R + 3, (R - 3) * 2, (R - 3) * 2); ctx.restore();
    }
  }
  // Texto centralizado na altura quando o logo é mais alto que ele.
  const altTexto = tl.length * 26 + 2 + linhas.reduce((a, l) => a + altLinha(l), 0) + (remanejada ? 26 : 0);
  y = Math.max(PH, (hh - 3 - altTexto) / 2);
  if (desenhar) { fonte(700, 22, FD); ctx.fillStyle = '#ffffff'; tl.forEach((l, i) => ctx.fillText(l, tx, y + i * 26)); }
  y += tl.length * 26 + 2;
  linhas.forEach((l) => {
    if (desenhar) {
      let x = tx;
      l.forEach((it) => {
        fonte(700, 10); espaco('1.5px'); ctx.fillStyle = C.gold; ctx.fillText(it.k, x, y + 4); espaco('0px');
        fonte(700, 16); ctx.fillStyle = '#ffffff'; it.vl.forEach((v, i) => ctx.fillText(v, x + KW, y + i * 20));
        x += KW + Math.max(...it.vl.map(larg)) + 16;
      });
    }
    y += altLinha(l);
  });
  if (remanejada && desenhar) {
    fonte(700, 12); espaco('1.5px');
    const t = 'ESCALA REMANEJADA ↻';
    const w = ctx.measureText(t).width + 22;
    retangulo(ctx, tx, y + 4, w, 20, 10); ctx.fillStyle = '#e8862a'; ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(t, tx + 11, y + 8); espaco('0px');
  }
  y = hh + 8;

  // ---- quadros (Recado, no topo; os do fim, depois das seções)
  const gap = 6;
  // Quadro: título colorido, nomes e, se houver, uma parte de baixo separada por um fio (quem ajuda na limpeza).
  // Dois lado a lado: um nome por linha; sozinho na largura toda: nomes separados por " · " (sem quebrar um nome no meio).
  // Quem já está com ausência (naoVao) aparece em vermelho e riscado.
  const LQ = 24;
  const medir = (q, bw, empilhado) => {
    const max = bw - 44;
    const partes = [{ t: q.titulo, nomes: q.nomes, naoVao: q.naoVao || [] }, ...(q.sub ? [q.sub] : [])].map((pt) => {
      fonte(700, 12); const tt = quebrar(ctx, pt.t.toUpperCase(), bw - 40);
      fonte(400, 19);
      const sep = ctx.measureText(' · ').width;
      const linhas = [[]];
      let x = 0;
      pt.nomes.forEach((n) => {
        const w = ctx.measureText(n).width;
        if (linhas[linhas.length - 1].length && (empilhado || q.porLinha || x + sep + w > max)) { linhas.push([]); x = 0; }
        const l = linhas[linhas.length - 1];
        x += (l.length ? sep : 0) + w;
        l.push({ n, w, risc: (pt.naoVao || []).includes(n) });
      });
      return { tt, linhas };
    });
    return { partes, h: 14 + partes.reduce((a, pt, i) => a + (i ? 14 : 0) + pt.tt.length * 17 + 6 + pt.linhas.length * LQ, 0) + 10 };
  };
  const quadro = (q, m, bx, bw, bh) => {
    cartao(ctx, bx, y, bw, bh, q.cor);
    let yy = y + 14;
    m.partes.forEach((pt, i) => {
      if (i) { yy += 4; ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx + 22, yy + 0.5); ctx.lineTo(bx + bw - 22, yy + 0.5); ctx.stroke(); yy += 10; }
      fonte(700, 12); espaco('1.5px'); ctx.fillStyle = q.cor; pt.tt.forEach((l) => { ctx.fillText(l, bx + 22, yy); yy += 17; }); espaco('0px');
      yy += 6;
      fonte(400, 19);
      const sep = ctx.measureText(' · ').width;
      pt.linhas.forEach((l) => {
        let x = bx + 22;
        l.forEach((tk, k) => {
          if (k) { ctx.fillStyle = C.muted; ctx.fillText(' · ', x, yy); x += sep; }
          ctx.fillStyle = tk.risc ? C.vermelho : C.ink; ctx.fillText(tk.n, x, yy);
          if (tk.risc) { ctx.strokeStyle = C.vermelho; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 1, yy + 11); ctx.lineTo(x + tk.w + 1, yy + 11); ctx.stroke(); }
          x += tk.w;
        });
        yy += LQ;
      });
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
  // ---- recado do admin (como na aba Gira): linhas já quebradas na largura do quadro, uma embaixo da outra
  if (g.recado) { fonte(400, 19); linhaDeQuadros([{ titulo: 'Recado', nomes: quebrar(ctx, g.recado, CW - 44), cor: COR.recado, porLinha: true }]); }

  // ---- seções em duas colunas, com linhas alternadas; o médium de passe vai embaixo do nome do médium.
  //      A coluna do cambone tem a largura do maior cambone (entre 34% e 55%); o resto fica para o médium,
  //      e a entidade vai na mesma linha do nome quando cabe.
  const secao = (titulo, cor, c1, c2, itens) => {
    if (!itens.length) return;
    const ix = P + 20, util = CW - 40, vao = 14;
    const maiorCambone = Math.max(...itens.flatMap((r) => {
      fonte(r.vazio ? 'italic 400' : 400, 20);
      return r.r.map((t) => ctx.measureText(t.n + (t.re ? ' ↻' : '')).width + (t.re ? 12 : 0));
    }));
    const rightW = Math.min(util * 0.55, Math.max(util * 0.34, maiorCambone + 4));
    const leftW = util - rightW - vao, rx = ix + leftW + vao;
    const rs = itens.map((r) => {
      fonte(700, 20); const wl = ctx.measureText(r.l).width;
      fonte('italic 500', 17); const wg = r.guia ? ctx.measureText(r.guia).width : 0;
      const junto = !!r.guia && wl + 10 + wg <= leftW;
      fonte(700, 20); const ll = junto ? [r.l] : quebrar(ctx, r.l, leftW);
      fonte('italic 500', 17); const gl = r.guia && !junto ? quebrar(ctx, r.guia, leftW) : [];
      fonte(600, 17); const pl = r.passe ? quebrar(ctx, 'Passe · ' + r.passe, leftW) : [];
      // Dois cambones na mesma linha, separados por " / "; se não couber, um embaixo do outro (com a barra no fim).
      // Cambone remanejado: destacado (fundo laranja e ↻).
      fonte(r.vazio ? 'italic 400' : 400, 20);
      const sepW = ctx.measureText(' / ').width;
      const larg = (t) => ctx.measureText(t.n + (t.re ? ' ↻' : '')).width + (t.re ? 12 : 0);
      const total = r.r.reduce((a, t, i) => a + larg(t) + (i ? sepW : 0), 0);
      const rl = total <= rightW ? [r.r] : r.r.map((t, i) => [{ ...t, fim: i < r.r.length - 1 ? ' /' : '' }]);
      return { ...r, ll, gl, pl, rl, sepW, larg, junto, wl, h: Math.max(ll.length * LH + gl.length * 20 + pl.length * 21 + (pl.length ? 2 : 0), rl.length * LH) + 10 };
    });
    const ch = 14 + 30 + 18 + rs.reduce((a, r) => a + r.h, 0) + 10;
    if (desenhar) cartao(ctx, P, y, CW, ch, cor);
    let yy = y + 14;
    if (desenhar) {
      fonte(700, 24, FD); ctx.fillStyle = C.ink; ctx.fillText(titulo, ix, yy);
      fonte(700, 15); const n = String(itens.length); const nw = ctx.measureText(n).width + 20;
      retangulo(ctx, P + CW - 22 - nw, yy + 2, nw, 26, 13); ctx.fillStyle = cor; ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(n, P + CW - 22 - nw / 2, yy + 6); ctx.textAlign = 'left';
    }
    yy += 30;
    if (desenhar) { fonte(700, 12); espaco('1.5px'); ctx.fillStyle = cor; ctx.fillText(c1, ix, yy); ctx.fillText(c2, rx, yy); espaco('0px'); }
    yy += 18;
    rs.forEach((r, i) => {
      if (desenhar) {
        if (i % 2 === 0) { ctx.fillStyle = C.zebra; retangulo(ctx, ix - 10, yy, CW - 2 * (ix - P) + 20, r.h, 8); ctx.fill(); }
        let ly = yy + 5; fonte(700, 20); ctx.fillStyle = C.ink;
        r.ll.forEach((l) => { ctx.fillText(l, ix, ly); ly += LH; });
        if (r.junto) { fonte('italic 500', 17); ctx.fillStyle = C.guia; ctx.fillText(r.guia, ix + r.wl + 10, ly - LH + 3); }
        if (r.gl.length) { fonte('italic 500', 17); ctx.fillStyle = C.guia; r.gl.forEach((l) => { ctx.fillText(l, ix, ly); ly += 20; }); }
        if (r.pl.length) { ly += 2; fonte(600, 17); ctx.fillStyle = r.passeRe ? C.re : COR.passe; r.pl.forEach((l) => { ctx.fillText(l, ix, ly); ly += 21; }); }
        let ry = yy + 5;
        r.rl.forEach((linha) => {
          let x = rx;
          linha.forEach((t, k) => {
            fonte(r.vazio ? 'italic 400' : 400, 20);
            if (k) { ctx.fillStyle = C.muted; ctx.fillText(' / ', x, ry); x += r.sepW; }
            if (t.re) {
              const w = r.larg(t);
              retangulo(ctx, x, ry - 4, w, LH + 2, 8); ctx.fillStyle = C.reSoft; ctx.fill();
              fonte(600, 20); ctx.fillStyle = C.re; ctx.fillText(t.n + ' ↻', x + 6, ry); x += w;
            } else {
              ctx.fillStyle = r.vazio ? C.muted : C.ink; ctx.fillText(t.n, x, ry); x += ctx.measureText(t.n).width;
            }
            if (t.fim) { fonte(400, 20); ctx.fillStyle = C.muted; ctx.fillText(t.fim, x, ry); }
          });
          ry += LH;
        });
      }
      yy += r.h;
    });
    y += ch + gap;
  };
  const linhaCambone = (x) => ({ l: x.m.nome, guia: guiaNaGira(x.m, g),
    r: x.cams.length ? x.cams.map((p) => ({ n: nome(p.c), re: !!p.remanejado })) : [{ n: 'sem cambone' }], vazio: !x.cams.length,
    passe: x.passes.map((p) => nome(p.c)).join(' e ') + (x.passes.some((p) => p.remanejado) ? ' ↻' : ''), passeRe: x.passes.some((p) => p.remanejado) });
  secao('Médiuns', COR.medium, 'MÉDIUM', 'CAMBONE', lista.filter((x) => x.m.funcao !== 'extra').map(linhaCambone));
  secao('At. Extras', COR.extra, 'AT. EXTRA', 'CAMBONE', lista.filter((x) => x.m.funcao === 'extra').map(linhaCambone));

  // ---- quadros do fim: passe sem médium (se houver), suporte e cambones de apoio lado a lado,
  //      a turma da limpeza na largura toda (com quem ajuda embaixo) e, por último, ausências e faltas
  if (semPasse.length) linhaDeQuadros([{ titulo: 'Passe sem médium', nomes: semPasse.map(nome), cor: COR.passe }]);
  linhaDeQuadros([q('suporte'), q('apoio')].filter(Boolean));
  const limp = grupo('limpeza');
  if (limp) {
    const aj = grupo('ajudam');
    linhaDeQuadros([{ titulo: limp[0].replace(/^Limpeza · (Turma \d+)$/, '$1 da limpeza'), nomes: limp[1], naoVao: limp[3], cor: COR.limpeza,
      sub: aj ? { t: 'Ajudam na limpeza', nomes: aj[1], naoVao: aj[3] } : null }]);
  }
  const { ausentes, faltas } = foraDaGira(pessoas, g);
  linhaDeQuadros([ausentes.length ? { titulo: `Ausências · ${ausentes.length}`, nomes: ausentes, cor: COR.fora } : null,
    faltas.length ? { titulo: `Faltas · ${faltas.length}`, nomes: faltas, cor: COR.fora } : null].filter(Boolean));

  // ---- rodapé: "Boa gira a todos!", o logo da casa e o nome dela
  y += 6;
  const LOGO_RODAPE = 40;
  const yLogo = y + 30;
  const yNome = logo ? yLogo + LOGO_RODAPE + 6 : y + 28;
  if (desenhar) {
    ctx.textAlign = 'center';
    fonte('italic 700', 20, FD); ctx.fillStyle = C.navy; ctx.fillText('Boa gira a todos!', W / 2, y);
    if (logo) ctx.drawImage(logo, (W - LOGO_RODAPE) / 2, yLogo, LOGO_RODAPE, LOGO_RODAPE);
    fonte(500, 13); ctx.fillStyle = C.muted; ctx.fillText('Casa do Pai João', W / 2, yNome);
    ctx.textAlign = 'left';
  }
  return yNome + 16 + P - 6;
}

export async function carregarLogo() {
  try {
    const img = new Image();
    img.src = '/img/terreiro.png';
    await img.decode();
    return img;
  } catch { return null; }
}

export async function gerarImagem(pessoas, g, giras = []) {
  try {
    await Promise.all(['700 34px Alegreya', 'italic 700 20px Alegreya', '700 24px Alegreya', '400 20px "Alegreya Sans"', 'italic 400 20px "Alegreya Sans"',
      '700 20px "Alegreya Sans"', '600 17px "Alegreya Sans"', 'italic 500 17px "Alegreya Sans"', '500 13px "Alegreya Sans"'].map((f) => document.fonts.load(f)));
  } catch { /* usa as fontes do sistema */ }
  const logo = await carregarLogo();
  const S = LARGURA_PNG / W;
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
