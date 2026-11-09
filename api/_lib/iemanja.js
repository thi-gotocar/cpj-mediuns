// Aba Iemanjá (rota: GET /api/oferendas?lista=iemanja · POST /api/oferendas { acao: 'iemanja', op, ... }).
// Admin de cada evento: os roots e os responsáveis dos 5 grupos daquele evento.

import { db } from './db.js';
import { HttpError, validarId, validarData } from './http.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { normalizarPerfil } from '../../shared/perfil.js';
import { sortearIemanja, pctItens, nomeGrupoValido } from '../../shared/iemanja.js';

const ehRoot = (eu) => pode(eu, 'usuarios:gerenciar');
const chaveDe = (eu) => (eu.alunoId ? 'a:' + eu.alunoId : chavePessoa(eu));
const adminDe = (eu, ev) => ehRoot(eu) || (!!eu.pessoaId && ev.grupos.some((g) => g.responsavelId === eu.pessoaId));
const lerEventos = () => db.rpc('iemanja_estado');
const veEvento = (eu, ev) => ev.visivel || adminDe(eu, ev);

function negarCurimba(eu) {
  if (eu.grupo === 'curimba') throw new HttpError(403, 'Este acesso não tem a aba Iemanjá.');
}

// Fora do grupo, só o nome, o responsável e o percentual.
function paraTela(ev, eu) {
  const admin = adminDe(eu, ev);
  const chave = chaveDe(eu);
  return { ...ev, admin, fora: admin ? ev.fora : [], grupos: ev.grupos.map((g) => {
    const meu = g.membros.some((m) => m.chave === chave);
    const abre = admin || meu;
    return { ...g, meu, abre, pct: pctItens(g.itens), membros: abre ? g.membros : [], itens: abre ? g.itens : [] };
  }) };
}

// Quem pode entrar no sorteio ou num grupo. Não muda nenhum cadastro.
async function candidatos() {
  const [pessoas, al] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('alunos_estado')]);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const daTurma = (n) => al.turmas.find((t) => new RegExp(`^turma\\s*0*${n}$`, 'i').test(t.nome.trim()))?.id;
  const [t9, t10] = [daTurma(9), daTurma(10)];
  const aluno = (a) => ({ chave: 'a:' + a.id, nome: a.nome });
  return {
    corrente: pessoas.map((p) => ({ chave: 'p:' + p.id, nome: p.nome, pessoaId: p.id })).sort(porNome),
    turma09: t9 ? al.alunos.filter((a) => a.turmaId === t9).map(aluno).sort(porNome) : [],
    turma10: t10 ? al.alunos.filter((a) => a.turmaId === t10).map(aluno).sort(porNome) : [],
    outros: al.alunos.filter((a) => !t9 || a.turmaId !== t9).filter((a) => !t10 || a.turmaId !== t10).map(aluno).sort(porNome),
  };
}

export async function respostaIemanja(eu, eventos = null) {
  negarCurimba(eu);
  const lista = eventos || await lerEventos();
  const visiveis = lista.filter((ev) => veEvento(eu, ev)).map((ev) => paraTela(ev, eu));
  const r = { eventos: visiveis, root: ehRoot(eu), eu: { chave: chaveDe(eu) }, publica: lista.some((ev) => ev.visivel) };
  if (r.root || visiveis.some((ev) => ev.admin)) r.candidatos = await candidatos();
  return r;
}

// Para /auth/me: se a pessoa vê a aba, e se ela está aberta ao público (visão CPJ/Alunos do root).
export async function abaIemanja(eu) {
  if (eu.grupo === 'curimba') return { iemanjaAba: false, iemanjaPublica: false };
  const lista = await lerEventos();
  return { iemanjaAba: ehRoot(eu) || lista.some((ev) => veEvento(eu, ev)), iemanjaPublica: lista.some((ev) => ev.visivel) };
}

const quantidade = (v, min) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > 9999) throw new HttpError(400, 'Quantidade inválida.');
  return n;
};

export async function acaoIemanja(eu, b) {
  negarCurimba(eu);
  const lista = await lerEventos();
  const devolver = async (estado) => respostaIemanja(eu, estado);

  if (b.op === 'novo') {
    if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root cria um novo evento.');
    return devolver(await db.rpc('iemanja_evento_novo', { data: validarData(String(b.data || '')) }));
  }

  // Localiza o evento pelo id dele, de um grupo ou de um item.
  const ev = lista.find((e) => e.id === b.id)
    || lista.find((e) => e.grupos.some((g) => g.id === b.grupoId))
    || lista.find((e) => e.grupos.some((g) => g.itens.some((i) => i.id === b.itemId)));
  if (!ev) throw new HttpError(404, 'Evento não encontrado.');
  if (ev.encerradoEm) throw new HttpError(409, 'Este evento já foi encerrado.');
  const grupo = b.grupoId ? ev.grupos.find((g) => g.id === validarId(b.grupoId, 'Grupo')) : null;
  const item = b.itemId ? ev.grupos.flatMap((g) => g.itens).find((i) => i.id === validarId(b.itemId, 'Item')) : null;

  // Quem é do grupo assume itens; o resto é do admin do evento.
  if (b.op === 'assumir') {
    if (!item) throw new HttpError(404, 'Item não encontrado.');
    const dono = ev.grupos.find((g) => g.itens.some((i) => i.id === item.id));
    const chave = chaveDe(eu);
    if (!dono.membros.some((m) => m.chave === chave)) throw new HttpError(403, 'Só quem é do grupo assume este item.');
    return devolver(await db.rpc('iemanja_assumir', { itemId: item.id, chave, nome: eu.nome, quantidade: quantidade(b.quantidade, 0) }));
  }
  if (!adminDe(eu, ev)) throw new HttpError(403, 'Só os admins deste evento fazem isso.');

  switch (b.op) {
    case 'visivel':
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, visivel: !!b.visivel }));
    case 'salvar': {
      const grupos = Array.isArray(b.grupos) ? b.grupos.map((g) => {
        const atual = ev.grupos.find((x) => x.id === g?.id);
        if (!atual) throw new HttpError(400, 'Grupo inválido.');
        const nome = String(g.nome ?? '');
        if (!nomeGrupoValido(nome)) throw new HttpError(400, 'Escolha o orixá ou a entidade da lista.');
        // Só o root define os responsáveis.
        return { id: atual.id, nome, responsavelId: ehRoot(eu) ? (g.responsavelId ? validarId(g.responsavelId, 'Responsável') : null) : atual.responsavelId };
      }) : [];
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, ...(b.data ? { data: validarData(String(b.data)) } : {}), grupos }));
    }
    case 'encerrar':
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, encerrar: true }));
    case 'fora': {
      const chave = String(b.chave || '');
      const fora = b.fora ? [...new Set([...ev.fora, chave])] : ev.fora.filter((x) => x !== chave);
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, fora }));
    }
    case 'adicionar': {
      if (!grupo) throw new HttpError(400, 'Escolha o grupo.');
      const c = await candidatos();
      const pessoa = [...c.corrente, ...c.turma09, ...c.turma10, ...c.outros].find((x) => x.chave === b.chave);
      if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada nos cadastros.');
      return devolver(await db.rpc('iemanja_membro', { grupoId: grupo.id, chave: pessoa.chave, nome: pessoa.nome, fixo: !ev.sorteado }));
    }
    case 'retirar':
      if (!grupo) throw new HttpError(400, 'Grupo inválido.');
      return devolver(await db.rpc('iemanja_membro', { grupoId: grupo.id, chave: String(b.chave || ''), remover: true }));
    case 'item': {
      if (!grupo) throw new HttpError(400, 'Grupo inválido.');
      const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o item.');
      return devolver(await db.rpc('iemanja_item_salvar', { grupoId: grupo.id, nome, quantidade: quantidade(b.quantidade, 1) }));
    }
    case 'excluirItem':
      if (!item) throw new HttpError(404, 'Item não encontrado.');
      return devolver(await db.rpc('iemanja_item_excluir', { id: item.id }));
    case 'sortear': {
      if (ev.sorteado) throw new HttpError(409, 'O sorteio deste evento já foi feito.');
      if (ev.grupos.some((g) => !g.nome)) throw new HttpError(400, 'Escolha o orixá ou a entidade dos 5 grupos antes de sortear.');
      const [c, perfis] = await Promise.all([candidatos(), db.rpc('perfis_listar')]);
      const perfilDe = Object.fromEntries(perfis.map((x) => [x.pessoaId, normalizarPerfil(x.perfil)]));
      // O responsável fica no próprio grupo.
      const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
      const fixosNovos = Object.fromEntries(ev.grupos.map((g) => {
        const r = g.responsavelId && !presos.has('p:' + g.responsavelId) ? c.corrente.find((p) => p.pessoaId === g.responsavelId) : null;
        if (r) presos.add(r.chave);
        return [g.id, r ? [{ chave: r.chave, nome: r.nome, fixo: true }] : []];
      }));
      const fora = new Set(ev.fora);
      const entra = (p) => !fora.has(p.chave) && !presos.has(p.chave);
      const sorteados = sortearIemanja({
        grupos: ev.grupos.map((g) => ({ id: g.id, nome: g.nome, fixos: g.membros.length + fixosNovos[g.id].length })),
        corrente: c.corrente.filter(entra).map((p) => ({ ...p, perfil: perfilDe[p.pessoaId] })),
        turmas: [c.turma09.filter(entra), c.turma10.filter(entra)],
      });
      return devolver(await db.rpc('iemanja_sorteio_gravar', { id: ev.id, grupos: ev.grupos.map((g) => ({ id: g.id, membros: [...fixosNovos[g.id], ...sorteados[g.id].map((p) => ({ ...p, fixo: false }))] })) }));
    }
    case 'cancelarSorteio':
      return devolver(await db.rpc('iemanja_sorteio_cancelar', { id: ev.id }));
    default:
      throw new HttpError(400, 'Ação inválida.');
  }
}
