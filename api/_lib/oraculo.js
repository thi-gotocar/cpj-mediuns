// Aba Oráculo: agenda das consultas com o Oráculo de Maria Mulambo (regras em shared/oraculo.js).
//   GET  /api/oferendas?lista=oraculo[&conferir=1]   a tela; conferir=1 pergunta ao ASAAS se o link pendente já foi pago
//   POST /api/oferendas { acao: 'oraculo', op, ... }
//     todos:  reservar { data, hora, consultaId? (reagendar a paga) } · pagar { id, nome, nascimento, mae, whatsapp, presencial, cpf? }
//             desistir { id } (reserva ainda não paga) · presencial { id } (pedir atendimento presencial)
//             pagarPresencial { id, cpf? } · push { endpoint, remover? } (só quem administra inscreve o aparelho)
//     admin:  publicar { publicado } (Visível para todos; nasce desligado) · config { config } · bloquear { data, hora ('' = dia todo), bloquear } · cancelar { id, motivo }
//             responderPresencial { id, aceitar, valor }
// Qualquer pessoa logada agenda (inclusive quem acabou de criar o cadastro), quando a aba está Visível para todos;
// desligada, só quem tem o Oráculo no perfil (Ver ou Editar) entra. Quem administra: oraculo:gerenciar.
import { HttpError, validarId, validarData } from './http.js';
import { db } from './db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { configOraculo, validarConfig, horariosDoDia, agoraBR, nascimentoValido, telefoneValido, mensagemCancelamento, DESCRICAO_COBRANCA } from '../../shared/oraculo.js';
import { configurado as asaasConfigurado, cobrarAvulso, conferirPagamento, cancelarNoAsaas, conferirReservas } from './asaas.js';
import { enviarPush, chavePublicaPush, endpointValido } from './push.js';

const ehAdmin = (eu) => pode(eu, 'oraculo:gerenciar');
const veTodas = (eu) => ehAdmin(eu) || pode(eu, 'oraculo:ver');

async function tela(eu, extra = {}) {
  const t = await db.rpc('oraculo_tela', { chave: chavePessoa(eu), admin: veTodas(eu) });
  return { ...t, config: configOraculo(t.config), pagamento: asaasConfigurado(), push: ehAdmin(eu) ? chavePublicaPush() : '', admin: ehAdmin(eu), veTodas: veTodas(eu), ...extra };
}

// Consultas pagas que ainda não foram avisadas: notificação nos aparelhos de quem administra.
export async function avisarPagos() {
  try {
    const r = await db.rpc('oraculo_avisos');
    if (r.pagos) await enviarPush(r.inscricoes);
  } catch (e) { console.error('[oraculo] avisar', e?.message || e); }
}

// A tela esperando o pagamento: pergunta ao ASAAS pelos links pendentes da pessoa.
async function conferir(chave) {
  await conferirReservas(chave).catch(() => {});
  let pago = false;
  for (const p of await db.rpc('oraculo_pendentes', { chave })) {
    try { pago = (await conferirPagamento(p.asaasId)) || pago; } catch (e) { console.error('[oraculo] conferir', p.asaasId, e?.message || e); }
  }
  if (pago) await avisarPagos();
}

const FECHADO = 'O Oráculo ainda não está aberto para agendamentos.';
async function exigirAberto(eu) {
  if (!veTodas(eu) && !(await db.rpc('oraculo_publicado'))) throw new HttpError(403, FECHADO);
}

export async function respostaOraculo(eu, query) {
  if (query.conferir) { await exigirAberto(eu); await conferir(chavePessoa(eu)); }
  const t = await tela(eu);
  if (!t.publicado && !t.veTodas) throw new HttpError(403, FECHADO);
  return t;
}

function texto(v, oque, min = 3, max = 120) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `Informe ${oque}.`);
  return s;
}
const hora = (v) => { if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(v))) throw new HttpError(400, 'Horário inválido.'); return v; };

async function reservar(eu, b) {
  const chave = chavePessoa(eu);
  const data = validarData(b.data);
  const h = hora(b.hora);
  const consultaId = b.consultaId ? validarId(b.consultaId, 'Consulta') : null;
  const t = await db.rpc('oraculo_tela', { chave });
  // O horário que a própria pessoa já segura (ou a consulta que está reagendando) não conta como ocupado.
  const minha = consultaId ? t.minhas.find((c) => c.id === consultaId) : t.minhas.find((c) => c.status === 'reservada');
  const livre = horariosDoDia(t, data, agoraBR(), minha && (minha.status !== 'conflito') ? minha : null).find((x) => x.hora === h);
  if (!livre) throw new HttpError(400, 'Este dia não está aberto para consultas.');
  if (!livre.livre) throw new HttpError(409, livre.motivo === 'passou' ? 'Este horário já passou.' : 'Este horário não está disponível. Escolha outro.');
  await db.rpc('oraculo_reservar', { chave, data, hora: h, consultaId, nome: t.contato.nome || eu.nome, whatsapp: t.contato.celular || '' });
  return tela(eu);
}

async function pagar(eu, b) {
  const chave = chavePessoa(eu);
  const id = validarId(b.id, 'Consulta');
  const nascimento = nascimentoValido(b.nascimento);
  if (!nascimento) throw new HttpError(400, 'Data de nascimento inválida (use dd/mm/aa).');
  const whatsapp = telefoneValido(b.whatsapp);
  if (!whatsapp) throw new HttpError(400, 'Informe o WhatsApp com DDD.');
  await db.rpc('oraculo_dados', {
    id, chave, nome: texto(b.nome, 'o nome completo'), nascimento, mae: texto(b.mae, 'o nome completo da mãe'), whatsapp, presencial: b.presencial === true,
  });
  await cobrar(eu, chave, id, 'consulta', DESCRICAO_COBRANCA, b);
  return tela(eu);
}

async function cobrar(eu, chave, id, tipo, descricao, b) {
  if (!asaasConfigurado()) throw new HttpError(503, 'O pagamento ainda não está configurado. Fale com a casa.');
  await conferirReservas(chave, true);
  const r = await db.rpc('oraculo_cobranca_reservar', { id, chave, nome: eu.nome, tipo });
  if (!r.existe) await cobrarAvulso(eu, chave, r, descricao, b);
}

export async function acaoOraculo(eu, b) {
  const chave = chavePessoa(eu);
  if (!(b.op === 'push' && b.remover)) await exigirAberto(eu);
  switch (b.op) {
    case 'reservar': return reservar(eu, b);
    case 'pagar': return pagar(eu, b);
    case 'pagarPresencial':
      await cobrar(eu, chave, validarId(b.id, 'Consulta'), 'presencial', DESCRICAO_COBRANCA + ' · atendimento presencial', b);
      return tela(eu);
    case 'desistir': {
      const r = await db.rpc('oraculo_cancelar', { id: validarId(b.id, 'Consulta'), chave, motivo: 'Desistiu antes de pagar' });
      for (const p of r.pendentes) await cancelarNoAsaas(p);
      return tela(eu);
    }
    case 'presencial':
      await db.rpc('oraculo_presencial_pedir', { id: validarId(b.id, 'Consulta'), chave });
      return tela(eu);
    case 'push': {
      const endpoint = endpointValido(b.endpoint);
      if (!endpoint) throw new HttpError(400, 'Aparelho inválido.');
      if (b.remover) await db.rpc('push_inscrever', { endpoint, remover: true });
      else {
        if (!ehAdmin(eu)) throw new HttpError(403, 'Só quem administra o Oráculo recebe os avisos.');
        await db.rpc('push_inscrever', { endpoint, chave });
      }
      return { ok: true };
    }
  }
  if (!ehAdmin(eu)) throw new HttpError(403, 'Só quem administra o Oráculo pode fazer isso.');
  switch (b.op) {
    case 'publicar':
      await db.rpc('oraculo_publicar', { publicado: b.publicado === true });
      return tela(eu);
    case 'config': {
      const v = validarConfig(b.config);
      if (v.erro) throw new HttpError(400, v.erro);
      await db.rpc('oraculo_config_salvar', { config: v.config });
      return tela(eu);
    }
    case 'bloquear':
      await db.rpc('oraculo_bloqueio', { data: validarData(b.data), hora: b.hora ? hora(b.hora) : '', bloquear: b.bloquear === true });
      return tela(eu);
    case 'cancelar': {
      const motivo = String(b.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const r = await db.rpc('oraculo_cancelar', { id: validarId(b.id, 'Consulta'), motivo });
      for (const p of r.pendentes) await cancelarNoAsaas(p);
      const c = r.consulta;
      return tela(eu, { cancelada: { id: c.id, whatsapp: c.whatsapp, mensagem: mensagemCancelamento({ ...c, pago: !!c.pagoEm }, motivo) } });
    }
    case 'responderPresencial': {
      const aceitar = b.aceitar === true;
      const valor = Number(String(b.valor ?? '').replace(',', '.'));
      if (aceitar && (!Number.isFinite(valor) || valor < 5 || valor > 100000)) throw new HttpError(400, 'Informe o valor da taxa do presencial.');
      await db.rpc('oraculo_presencial_responder', { id: validarId(b.id, 'Consulta'), aceitar, valor: aceitar ? Math.round(valor * 100) / 100 : null });
      return tela(eu);
    }
  }
  throw new HttpError(400, 'Ação inválida.');
}
