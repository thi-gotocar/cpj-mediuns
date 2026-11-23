// Peças comuns dos geradores de imagem (canvas): quebra de texto, retângulo arredondado, logo e o PNG.

// Quebra o texto em linhas que cabem em max (respeita as quebras de linha do texto). Palavra maior que a linha é partida.
export function quebrar(ctx, texto, max) {
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
        if (ctx.measureText(teste).width > max && linha) { linhas.push(linha); linha = palavra; } else linha = teste;
      }
    });
    linhas.push(linha);
  });
  return linhas;
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

export async function carregarLogo() {
  try {
    const img = new Image();
    img.src = '/img/terreiro.png';
    await img.decode();
    return img;
  } catch { return null; }
}

// Gera o PNG desenhando duas vezes: a primeira só mede a altura (pintar = false), a segunda pinta já na escala final.
// desenho(ctx, pintar) devolve a altura. fundo: uma cor, ou (ctx, altura) => pinta o fundo.
// fontes: as que o desenho usa, carregadas antes (sem elas, o canvas usa as do sistema).
export async function gerarPng({ largura, escala, fontes = [], fundo, desenho }) {
  try { await Promise.all(fontes.map((f) => document.fonts.load(f))); } catch { /* usa as fontes do sistema */ }
  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  if (!ctx) throw new Error('Não consegui gerar a imagem neste aparelho.');
  ctx.textBaseline = 'top';
  const H = Math.ceil(desenho(ctx, false));
  c.width = largura * escala;
  c.height = Math.ceil(H * escala);
  ctx = c.getContext('2d');
  ctx.scale(escala, escala);
  ctx.textBaseline = 'top';
  if (typeof fundo === 'function') fundo(ctx, H);
  else { ctx.fillStyle = fundo; ctx.fillRect(0, 0, largura, H + 2); }   // +2: cobre a última linha de pixels (arredondamento da escala)
  desenho(ctx, true);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('Não consegui gerar a imagem neste aparelho.');
  return blob;
}
