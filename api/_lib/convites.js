// Sub-aba Eventos da aba Eventos (antiga Oferendas): a lista de pessoas de cada evento (regras em shared/convites.js).
//   GET  /api/oferendas?lista=convites[&cadastro=1]   eventos com as pessoas; cadastro=1 (quem administra, ao abrir o
//                                                      Adicionar) traz as listas do cadastro para escolher
//   POST /api/oferendas { acao: 'convites', op, ... }  (quem administra as oferendas)
//        eventoSalvar { id?, nome, data } · eventoExcluir { id }
//        incluir { eventoId, chaves: [...] } (do cadastro) | { eventoId, nome } (de fora, vai para Convidados)
//        remover { eventoId, chave }
//   POST /api/oferendas { acao: 'convites', op, ... }  (a própria pessoa da corrente, inclusive quem administra; só em evento aberto)
//        responder { eventoId, resposta: 'vou' | 'nao' | 'desisti' } · convidar { eventoId, nome } · tirarConvidado { eventoId, chave }
// Vê quem vê a aba (oferendas:doar ou oferendas:ver) com a sub-aba Visível para todos; desligada, só quem administra.
import { db } from './db.js';
import { HttpError, validarId, validarData } from './http.js';
import { pode } from '../../shared/permissoes.js';
import { normalizarNome } from '../../shared/ervas.js';
import { LISTA_CONVIDADOS, LISTA_SEM_TURMA, RESPOSTAS } from '../../shared/convites.js';
import { chavePessoa } from '../../shared/ervas.js';
import { candidatos } from './iemanja.js';

const admin = (eu) => pode(eu, 'oferendas:gerenciar');

async function exigirVer(eu) {
  if (admin(eu)) return;
  if (!pode(eu, 'oferendas:doar') && !pode(eu, 'oferendas:ver')) throw new HttpError(403, 'Este acesso não tem permissão para isso.');
  const aba = (await db.rpc('oferenda_abas_listar')).find((a) => a.convites);
  if (!aba?.visivel) throw new HttpError(403, 'Esta sub-aba ainda não está disponível.');
}

// As listas do cadastro, cada pessoa com a lista de onde vem (a mesma separação da tela).
async function cadastro() {
  const c = await candidatos();
  return [
    { lista: 'Corrente', pessoas: c.corrente.map(({ chave, nome }) => ({ chave, nome })) },
    { lista: 'Curimba', pessoas: c.curimba.map(({ chave, nome }) => ({ chave, nome })) },
    ...c.turmas.map((t) => ({ lista: t.nome, pessoas: t.pessoas })),
    { lista: LISTA_SEM_TURMA, pessoas: c.semTurma },
  ].filter((g) => g.pessoas.length);
}

export async function respostaConvites(eu, query = {}) {
  await exigirVer(eu);
  const [eventos, listas] = await Promise.all([db.rpc('convites_listar'), admin(eu) && query.cadastro ? cadastro() : null]);
  return { eventos, admin: admin(eu), eu: euDe(eu), ...(listas ? { cadastro: listas } : {}) };
}

// Quem responde e convida: a pessoa da corrente logada (a chave dela); quem não é da corrente só lê.
const euDe = (eu) => (eu.pessoaId ? { chave: chavePessoa(eu) } : null);

// Ações da própria pessoa da corrente: a resposta e os convidados dela.
async function acaoDaPessoa(eu, b) {
  await exigirVer(eu);
  if (!eu.pessoaId) throw new HttpError(403, 'Só quem é da corrente responde e convida.');
  const chave = chavePessoa(eu);
  const eventoId = validarId(b.eventoId, 'Evento');
  let eventos;
  if (b.op === 'responder') {
    if (!RESPOSTAS.some(([k]) => k === b.resposta)) throw new HttpError(400, 'Resposta inválida.');
    const pessoa = (await db.rpc('pessoas_listar', { id: eu.pessoaId })).find((x) => x.id === eu.pessoaId);
    if (!pessoa) throw new HttpError(403, 'Só quem é da corrente responde e convida.');
    eventos = await db.rpc('convite_responder', { eventoId, chave, nome: pessoa.nome, lista: pessoa.funcao === 'curimba' ? 'Curimba' : 'Corrente', resposta: b.resposta });
  } else if (b.op === 'convidar') {
    const nome = limpar(b.nome);
    if (nome.length < 2 || nome.length > 60) throw new HttpError(400, 'Informe o nome do convidado (2 a 60 letras).');
    eventos = await db.rpc('convite_convidar', { eventoId, por: chave, chave: 'n:' + normalizarNome(nome), nome });
  } else {
    eventos = await db.rpc('convite_tirar_convidado', { eventoId, por: chave, chave: String(b.chave || '') });
  }
  return { eventos, admin: admin(eu), eu: euDe(eu) };
}

const limpar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export async function acaoConvites(eu, b) {
  if (['responder', 'convidar', 'tirarConvidado'].includes(b.op)) return acaoDaPessoa(eu, b);
  if (!admin(eu)) throw new HttpError(403, 'Só quem administra as oferendas mexe nas listas dos eventos.');
  let eventos;
  switch (b.op) {
    case 'eventoSalvar': {
      const nome = limpar(b.nome);
      if (nome.length < 2 || nome.length > 80) throw new HttpError(400, 'Informe o nome do evento (até 80 letras).');
      eventos = await db.rpc('convite_evento_salvar', { id: b.id ? validarId(b.id, 'Evento') : null, nome, data: validarData(String(b.data || '')) });
      break;
    }
    case 'eventoExcluir':
      eventos = await db.rpc('convite_evento_excluir', { id: validarId(b.id, 'Evento') });
      break;
    case 'incluir': {
      const eventoId = validarId(b.eventoId, 'Evento');
      let pessoas;
      if (typeof b.nome === 'string') {
        const nome = limpar(b.nome);
        if (nome.length < 2 || nome.length > 60) throw new HttpError(400, 'Informe o nome da pessoa (2 a 60 letras).');
        pessoas = [{ chave: 'n:' + normalizarNome(nome), nome, lista: LISTA_CONVIDADOS }];
      } else {
        // Do cadastro: só vale quem está nas listas de hoje; o nome e a lista vêm do cadastro, não do navegador.
        if (!Array.isArray(b.chaves) || !b.chaves.length || b.chaves.length > 1000) throw new HttpError(400, 'Escolha quem vai entrar na lista.');
        const pedidas = new Set(b.chaves.map(String));
        pessoas = (await cadastro()).flatMap((g) => g.pessoas.filter((p) => pedidas.has(p.chave)).map((p) => ({ ...p, lista: g.lista })));
        if (!pessoas.length) throw new HttpError(400, 'Ninguém dessa escolha está no cadastro.');
      }
      eventos = await db.rpc('convite_incluir', { eventoId, pessoas });
      break;
    }
    case 'remover':
      eventos = await db.rpc('convite_remover', { eventoId: validarId(b.eventoId, 'Evento'), chave: String(b.chave || '') });
      break;
    default:
      throw new HttpError(400, 'Ação inválida.');
  }
  return { eventos, admin: true, eu: euDe(eu) };
}
