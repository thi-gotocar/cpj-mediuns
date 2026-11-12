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
  // A barra que a máscara põe no fim ("31/10/") não atrapalha.
  const m = String(txt || '').trim().replace(/[/.-]+$/, '').match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
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

export const TIPOS_EVENTO = [['gira', 'Gira'], ['amaci', 'Amaci'], ['aviso', 'Aviso'], ['evento', 'Evento']];
export const TIPO_EVENTO_KEYS = TIPOS_EVENTO.map(([k]) => k);
export const TIPO_EVENTO_LABEL = Object.fromEntries(TIPOS_EVENTO);

const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
// Eventos de hoje até daqui a 7 dias.
export const eventosDaSemana = (eventos, hoje) => {
  const fim = somaDias(hoje, 7);
  return (eventos || []).filter((e) => e.data >= hoje && e.data <= fim).sort(porData);
};
// Bloco "Eventos" da aba Gira: gira dos próximos 30 dias; evento e aviso, todos os futuros;
// amaci só os da semana (hoje + 7 dias). O que já passou não aparece.
export function eventosDoTopo(eventos, hoje) {
  const ate = { gira: somaDias(hoje, 30), amaci: somaDias(hoje, 7) };
  return (eventos || []).filter((e) => e.data >= hoje && e.data <= (ate[e.tipo || 'evento'] || '9999-12-31')).sort(porData);
}

// Sem nada no dia: o próximo evento cadastrado, de qualquer tipo e sem limite de data (mais de um, se caírem no mesmo dia).
export function proximosEventos(eventos, hoje) {
  const futuros = (eventos || []).filter((e) => e.data > hoje).sort(porData);
  return futuros.filter((e) => e.data === futuros[0].data);
}

// Dia de cada orixá (dia/mês) — lista da casa. Com mais de uma data, aparece em todas.
export const DIAS_ORIXAS = [
  ['Oxóssi', ['01-20']], ['Iemanjá', ['02-02', '12-08']], ['Ogum', ['04-23']], ['Oroiná', ['05-24']], ['Obá', ['05-30']],
  ['Xangô', ['06-24', '09-30']], ['Nanã', ['07-26']], ['Logunã', ['08-11']], ['Obaluaê', ['08-16']], ['Omulu', ['08-16']],
  ['Oxumaré', ['08-24']], ['Oxum', ['10-12', '12-08']], ['Iansã', ['12-04']], ['Oxalá', ['12-25']],
];
// Bloco "Eventos" da aba Gira: o orixá aparece só no próprio dia.
export const orixasDoDia = (hoje) => DIAS_ORIXAS.filter(([, dias]) => dias.includes(hoje.slice(5)))
  .map(([orixa]) => ({ data: hoje, nome: 'Dia de ' + orixa, orixa: true }));

export const dataCurta = (isoData) => `${isoData.slice(8, 10)}/${isoData.slice(5, 7)}`;

// Quem faz aniversário no dia (aniversario = 'MM-DD', do nascimento do Perfil), sem quem saiu da corrente, por nome.
export const aniversariantesDoDia = (pessoas, data) => (pessoas || [])
  .filter((p) => !p.saida && p.aniversario === String(data).slice(5))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

// Mensagens da imagem de aniversariantes: curtas, uma diferente para cada pessoa.
export const MENSAGENS_ANIVERSARIO = [
  'Que Oxalá cubra o seu novo ano de paz, saúde e muita luz. Feliz aniversário!',
  'Que a sua caminhada siga firme, com a proteção dos guias e alegria no coração.',
  'Muito axé no seu dia! Que a vida devolva todo o carinho que você espalha.',
  'Que Iemanjá te envolva em amor e que cada dia deste ano seja uma bênção.',
  'Parabéns! Que não falte saúde, fé e motivos para sorrir.',
  'Que Ogum abra os seus caminhos e Oxóssi traga fartura para a sua casa.',
  'Feliz aniversário! A nossa corrente fica mais bonita com você nela.',
  'Que o seu coração continue leve e a sua luz siga iluminando quem está perto.',
  'Que este novo ciclo venha cheio de conquistas, amor e boas surpresas.',
  'Saravá! Que os seus guias te acompanhem em cada passo deste novo ano.',
  'Que a sua fé se renove hoje e te leve a lugares ainda mais bonitos.',
  'Um dia cheio de abraços e um ano inteiro de bênçãos para você. Parabéns!',
];
// n mensagens diferentes (repete só se houver mais pessoas que mensagens). A ordem vem da semente (a data):
// a mesma no dia todo, então a prévia e a imagem compartilhada batem.
export function mensagensAniversario(n, semente = '') {
  let h = 2166136261;
  for (const c of String(semente)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const proximo = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 2 ** 32; };
  const L = [...MENSAGENS_ANIVERSARIO];
  for (let i = L.length - 1; i > 0; i--) {
    const j = Math.floor(proximo() * (i + 1));
    [L[i], L[j]] = [L[j], L[i]];
  }
  return Array.from({ length: n }, (_, i) => L[i % L.length]);
}
