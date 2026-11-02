// Aba Fotos: álbuns por gira/evento. O navegador reduz a foto antes de enviar (cabe mais no R2 gratuito).

// Desligada: a aba não aparece para ninguém e a API recusa tudo. Para ligar, configure o R2 na Vercel
// (ver .env.example) e troque para true.
export const FOTOS_ATIVA = false;

export const FOTO_LADO = 1600;        // maior lado da foto, em pixels
export const MINI_LADO = 400;         // maior lado da miniatura da grade
export const FOTO_QUALIDADE = 0.82;   // JPEG
// A foto vai em base64 dentro do JSON, e a Vercel aceita no máximo 4,5 MB por pedido.
export const FOTO_MAX_BYTES = 2.5 * 1024 * 1024;
export const MINI_MAX_BYTES = 400 * 1024;
// O R2 gratuito vai até 10 GB: o app para de aceitar fotos antes disso, para nunca gerar cobrança.
export const FOTOS_LIMITE_BYTES = 9 * 1024 * 1024 * 1024;
