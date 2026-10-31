// Eventos da casa: datas digitadas como "31/10" (o ano vem sozinho) e a semana na aba Gira.

const pad = (n) => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
function somaDias(isoData, n) {
  const d = new Date(isoData + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "31/10", "3/1", "31/10/26" ou "31/10/2026" → 'AAAA-MM-DD' (ou null se não for uma data válida).
// Sem ano: o deste ano; se essa data já passou há mais de 2 meses, é a do ano que vem.
export function lerDataCurta(txt, hoje) {
  const m = String(txt || '').trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]);
  let ano = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(hoje.slice(0, 4));
  const valida = (a) => { const x = new Date(Date.UTC(a, mes - 1, d)); return x.getUTCFullYear() === a && x.getUTCMonth() === mes - 1 && x.getUTCDate() === d; };
  if (!valida(ano)) return null;
  if (!m[3] && iso(ano, mes, d) < somaDias(hoje, -60)) {
    ano += 1;
    if (!valida(ano)) return null;   // 29/02 sem ano bissexto
  }
  return iso(ano, mes, d);
}

// Eventos de hoje até daqui a 7 dias.
export const eventosDaSemana = (eventos, hoje) => {
  const fim = somaDias(hoje, 7);
  return (eventos || []).filter((e) => e.data >= hoje && e.data <= fim).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
};

export const dataCurta = (isoData) => `${isoData.slice(8, 10)}/${isoData.slice(5, 7)}`;
