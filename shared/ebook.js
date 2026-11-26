// E-book "A Linha da Esquerda na Umbanda": venda pelo popup do app (regras em docs/regras.md, seção E-book).
// O valor e a descrição da cobrança são lidos pelo servidor daqui; o navegador nunca manda valor.

export const EBOOK = {
  titulo: 'A Linha da Esquerda na Umbanda',
  descricao: 'ebook Linha Esquerda',   // descrição da cobrança no ASAAS
  valor: 19,
  arquivo: 'A Linha da Esquerda na Umbanda - Casa do Pai Joao.pdf',
};
// O PDF guardado no banco vai em pedaços (o pedido à Vercel tem limite de 4,5 MB e o base64 cresce um terço).
export const EBOOK_PARTE = 700 * 1024;     // bytes por pedaço no upload
export const EBOOK_MAX = 4 * 1024 * 1024;  // tamanho máximo do PDF (a resposta do download também tem o limite de 4,5 MB)

export const emailValidoEbook = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());

// Texto da marca d'água: nome e e-mail na diagonal; no rodapé, também o número da compra e a data.
export function textosMarca({ nome, email, id, data }) {
  const curto = String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return {
    marca: `${nome} · ${email}`,
    rodape: `Licenciado para ${nome} (${email}) · compra ${curto} · ${data} · Uso pessoal: proibido copiar ou compartilhar`,
  };
}
