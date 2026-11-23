// Fotos escolhidas no aparelho: abrir (já na orientação certa), reduzir para JPEG e passar para base64.
// Usado pelo Perfil, Compras, Diário e Fotos, que guardam a foto pequena.

// Abre o arquivo como imagem; sem createImageBitmap (navegador antigo), pelo <img>.
export async function abrirImagem(arquivo) {
  try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch { /* tenta pelo <img> */ }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

// O maior lado vira "lado" (sem aumentar) e a foto vira JPEG; se passar de max bytes, baixa a qualidade aos poucos.
// → { blob, largura, altura }; sem caber nem na qualidade mais baixa, erro.
export async function reduzirJpeg(img, { lado, max, qualidade = 0.82, passo = 0.15 }) {
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  for (let q = qualidade; q > 0.3; q -= passo) {
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', q));
    if (blob && blob.size <= max) return { blob, largura: c.width, altura: c.height };
  }
  throw new Error('foto grande demais');
}

// O conteúdo do arquivo em base64 (sem o "data:image/jpeg;base64,"), como o servidor recebe.
export const base64 = (blob) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = erro;
  r.readAsDataURL(blob);
});
