// Oráculo de Maria Mulambo: agenda de consultas pagas (aba Oráculo).
// O mesmo cálculo de horários roda no navegador (o que mostrar) e no servidor (o que aceitar). O banco ainda trava o
// horário e o limite do dia na hora de reservar (oraculo_reservar), para dois celulares não pegarem o mesmo.
//
// Cada consulta dura 1 hora. O padrão é remoto; o cliente pode pedir presencial, e a admin cobra uma taxa a mais.

export const DURACAO_MIN = 60;
// Quanto tempo o horário fica preso para quem tocou em Confirmar (antes de gerar o link) e depois de gerar o link.
export const SEGURA_MIN = 15;
export const SEGURA_PAGAMENTO_MIN = 30;
export const ENDERECO = 'Rua Osmar Fregona, 137 · SP';
export const DESCRICAO_COBRANCA = 'Oráculo - Maria Mulambo';

export const CONFIG_PADRAO = {
  valor: 290,
  horarios: ['14:00', '15:30', '17:00', '18:30'],
  dias: [1, 2, 3, 4, 5, 6],   // dias da semana com consulta (0 = domingo)
  limiteDia: 4,
  diasFuturos: 30,            // até quantos dias à frente dá para agendar
  contato: '11985546979',     // WhatsApp para quem quer cancelar
};
export const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const inteiro = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };

// Config guardada → config completa (o que faltar ou vier errado vale o padrão).
export function configOraculo(c) {
  const o = c && typeof c === 'object' ? c : {};
  const valor = Number(o.valor);
  const horarios = Array.isArray(o.horarios) ? [...new Set(o.horarios.filter((h) => HORA.test(h)))].sort() : null;
  const dias = Array.isArray(o.dias) ? [...new Set(o.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
  return {
    valor: Number.isFinite(valor) && valor >= 1 && valor <= 100000 ? Math.round(valor * 100) / 100 : CONFIG_PADRAO.valor,
    horarios: horarios || CONFIG_PADRAO.horarios,
    dias: dias || CONFIG_PADRAO.dias,
    limiteDia: inteiro(o.limiteDia, 1, 24) ?? CONFIG_PADRAO.limiteDia,
    diasFuturos: inteiro(o.diasFuturos, 1, 365) ?? CONFIG_PADRAO.diasFuturos,
    contato: String(o.contato ?? CONFIG_PADRAO.contato).replace(/\D/g, '').slice(0, 13) || CONFIG_PADRAO.contato,
  };
}

// O que a admin mandou salvar: devolve { config } ou { erro }.
export function validarConfig(c) {
  const o = c && typeof c === 'object' ? c : {};
  const horarios = Array.isArray(o.horarios) ? o.horarios.map((h) => String(h).trim()) : [];
  if (!horarios.length || horarios.some((h) => !HORA.test(h))) return { erro: 'Informe os horários no formato 14:00.' };
  const ord = [...new Set(horarios)].sort();
  for (let i = 1; i < ord.length; i++) {
    if (minutos(ord[i]) - minutos(ord[i - 1]) < DURACAO_MIN) return { erro: `Cada consulta dura 1 hora: ${ord[i - 1]} e ${ord[i]} se encontram.` };
  }
  const dias = Array.isArray(o.dias) ? o.dias.map(Number) : [];
  if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { erro: 'Marque ao menos um dia da semana.' };
  const valor = Number(String(o.valor ?? '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor < 5 || valor > 100000) return { erro: 'Valor da consulta inválido.' };
  if (inteiro(o.limiteDia, 1, 24) === null) return { erro: 'Limite por dia: de 1 a 24.' };
  if (inteiro(o.diasFuturos, 1, 365) === null) return { erro: 'Agenda aberta: de 1 a 365 dias.' };
  const contato = String(o.contato ?? '').replace(/\D/g, '');
  if (contato.length < 10 || contato.length > 13) return { erro: 'WhatsApp para contato inválido (DDD e número).' };
  return { config: configOraculo({ valor, horarios: ord, dias, limiteDia: Number(o.limiteDia), diasFuturos: Number(o.diasFuturos), contato }) };
}

// Datas no formato AAAA-MM-DD, sem fuso (todas são de Brasília).
export function somarDias(data, n) {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const diaDaSemana = (data) => new Date(data + 'T12:00:00Z').getUTCDay();
export function agoraBR(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// t = { config, bloqueios: [{ data, hora }] (hora '' = dia todo), ocupados: [{ data, hora }] } (ocupados: confirmadas e
// reservas ainda seguras). Horários do dia: [{ hora, livre, motivo }]; o dia fora da agenda devolve [].
export function horariosDoDia(t, data, agora = agoraBR(), ignorar = null) {
  const c = configOraculo(t.config);
  const ultimo = somarDias(agora.data, c.diasFuturos);
  if (data < agora.data || data > ultimo || !c.dias.includes(diaDaSemana(data))) return [];
  const bloq = (t.bloqueios || []).filter((b) => b.data === data);
  if (bloq.some((b) => !b.hora)) return [];
  const ocup = (t.ocupados || []).filter((o) => o.data === data && !(ignorar && o.data === ignorar.data && o.hora === ignorar.hora));
  const cheio = ocup.length >= c.limiteDia;
  return c.horarios.map((hora) => {
    let motivo = '';
    if (data === agora.data && hora <= agora.hora) motivo = 'passou';
    else if (bloq.some((b) => b.hora === hora)) motivo = 'bloqueado';
    else if (ocup.some((o) => o.hora === hora)) motivo = 'ocupado';
    else if (cheio) motivo = 'cheio';
    return { hora, livre: !motivo, motivo };
  });
}
export const diaTemVaga = (t, data, agora, ignorar) => horariosDoDia(t, data, agora, ignorar).some((h) => h.livre);

export const STATUS = {
  reservada: 'Aguardando pagamento',
  confirmada: 'Consulta marcada',
  conflito: 'Pago: escolha um novo horário',
  cancelada: 'Cancelada',
  expirada: 'Reserva expirada',
};

export const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function dataLonga(data) {
  const [y, m, d] = data.split('-').map(Number);
  const sem = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][diaDaSemana(data)];
  return `${sem}, ${d} de ${MESES[m - 1].toLowerCase()}${y !== Number(agoraBR().data.slice(0, 4)) ? ' de ' + y : ''}`;
}
export const dataCurtaBR = (data) => data.split('-').reverse().join('/');

// Data de nascimento digitada (dd/mm/aa ou dd/mm/aaaa) → dd/mm/aaaa, ou null.
export function nascimentoValido(s) {
  const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mes = Number(m[2]);
  let a = Number(m[3]);
  if (m[3].length === 2) a += a > Number(agoraBR().data.slice(2, 4)) ? 1900 : 2000;
  const dt = new Date(Date.UTC(a, mes - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d || a < 1900) return null;
  if (dt.toISOString().slice(0, 10) > agoraBR().data) return null;
  return `${String(d).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${a}`;
}
export const telefoneValido = (s) => { const n = String(s ?? '').replace(/\D/g, ''); return n.length >= 10 && n.length <= 13 ? n : null; };
// Link do WhatsApp para um número brasileiro (com ou sem o 55).
export function linkWhats(numero, texto) {
  let n = String(numero ?? '').replace(/\D/g, '');
  if (n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

// Mensagem da admin ao cancelar uma consulta (para mandar pelo WhatsApp).
export function mensagemCancelamento(c, motivo = '') {
  const primeiro = String(c.nome || '').trim().split(/\s+/)[0] || '';
  return [
    `Olá${primeiro ? ', ' + primeiro : ''}! Aqui é da Casa do Pai João.`,
    '',
    `Precisamos cancelar a sua consulta com o Oráculo de Maria Mulambo marcada para ${dataLonga(c.data)}, às ${c.hora}.`,
    ...(motivo ? ['', `Motivo: ${motivo}`] : []),
    '',
    c.pago ? 'Você não perde o que pagou: responda esta mensagem e combinamos um novo horário ou a devolução do valor.'
      : 'Se quiser, responda esta mensagem e combinamos um novo horário.',
    '',
    'Pedimos desculpas pelo transtorno. Um abraço da Casa do Pai João. 🌹',
  ].join('\n');
}
// Mensagem do cliente que quer cancelar (abre o WhatsApp da casa).
export function mensagemPedirCancelamento(c, nome) {
  return `Olá! Sou ${nome || 'cliente'} e tenho consulta com o Oráculo de Maria Mulambo em ${dataLonga(c.data)}, às ${c.hora}. Preciso cancelar. Podem me ajudar?`;
}
