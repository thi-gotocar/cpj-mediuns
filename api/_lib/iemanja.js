// Aba Iemanjá (rota: GET /api/oferendas?lista=iemanja · POST /api/oferendas { acao: 'iemanja', op, ... }).
// Admin de cada evento: os roots e os responsáveis dos grupos daquele evento.

import { db } from './db.js';
import { HttpError, validarId, validarData } from './http.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { normalizarPerfil } from '../../shared/perfil.js';
import { sortearIemanja, pctItens, nomeGrupoValido, listasDoSorteio, LISTA_CURIMBA, NOME_EVENTO_PADRAO } from '../../shared/iemanja.js';
import { limparDetalhes, detalhesOk, DETALHES_LINHAS, unidadeValida, quantidadeValida, aceitaFracao } from '../../shared/oferendas.js';

const ehRoot = (eu) => pode(eu, 'usuarios:gerenciar');
const chaveDe = (eu) => (eu.alunoId ? 'a:' + eu.alunoId : chavePessoa(eu));
const adminDe = (eu, ev) => ehRoot(eu) || (!!eu.pessoaId && ev.grupos.some((g) => g.responsavelId === eu.pessoaId));
const lerEventos = () => db.rpc('iemanja_estado');
const veEvento = (eu, ev) => ev.visivel || adminDe(eu, ev);

const temAtribuicao = (ev) => ev.grupos.some((g) => g.itens.some((i) => i.doacoes.length));

function negarCurimba(eu) {
  if (eu.grupo === 'curimba') throw new HttpError(403, 'Este acesso não tem a aba Iemanjá.');
}

// Fora do grupo, só o nome, o responsável e o percentual.
function paraTela(ev, eu) {
  const admin = adminDe(eu, ev);
  const chave = chaveDe(eu);
  return { ...ev, admin, fora: admin ? ev.fora : [], listas: admin ? ev.listas : [], grupos: ev.grupos.map((g) => {
    const meu = g.membros.some((m) => m.chave === chave);
    const abre = admin || meu;
    return { ...g, meu, abre, pct: pctItens(g.itens), membros: abre ? g.membros : [], itens: abre ? g.itens : [] };
  }) };
}

// Quem pode entrar no sorteio ou num grupo. Não muda nenhum cadastro.
async function candidatos() {
  const [pessoas, al] = await Promise.all([db.rpc('pessoas_listar'), db.rpc('alunos_estado')]);
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const aluno = (a) => ({ chave: 'a:' + a.id, nome: a.nome });
  const daFuncao = (curimba) => pessoas.filter((p) => (p.funcao === 'curimba') === curimba)
    .map((p) => ({ chave: 'p:' + p.id, nome: p.nome, pessoaId: p.id })).sort(porNome);
  const idsTurmas = new Set(al.turmas.map((t) => t.id));
  return {
    corrente: daFuncao(false),
    curimba: daFuncao(true),
    turmas: al.turmas.map((t) => ({ id: t.id, nome: t.nome, pessoas: al.alunos.filter((a) => a.turmaId === t.id).map(aluno).sort(porNome) })),
    semTurma: al.alunos.filter((a) => !idsTurmas.has(a.turmaId)).map(aluno).sort(porNome),
  };
}

function nomeEvento(v) {
  const nome = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length > 80) throw new HttpError(400, 'O nome do evento pode ter até 80 letras.');
  return nome || NOME_EVENTO_PADRAO;
}

export async function respostaIemanja(eu, eventos = null) {
  negarCurimba(eu);
  const lista = eventos || await lerEventos();
  const visiveis = lista.filter((ev) => veEvento(eu, ev)).map((ev) => paraTela(ev, eu));
  const r = { eventos: visiveis, root: ehRoot(eu), eu: { chave: chaveDe(eu) }, publica: lista.some((ev) => ev.visivel) };
  if (r.root || visiveis.some((ev) => ev.admin)) {
    r.candidatos = await candidatos();
    r.eventos = visiveis.map((ev) => ({ ...ev, listas: listasDoSorteio(ev.listas, r.candidatos.turmas) }));
  }
  return r;
}

// Para /auth/me: se a pessoa vê a aba, e se ela está aberta ao público (visão CPJ/Alunos do root).
// Lê só o resumo (visível e responsáveis de cada evento), o mesmo critério de veEvento; resumo já lido vem pronto.
export async function abaIemanja(eu, resumo) {
  if (eu.grupo === 'curimba') return { iemanjaAba: false, iemanjaPublica: false };
  const lista = resumo || (await db.rpc('iemanja_resumo'));
  const meu = (ev) => !!eu.pessoaId && ev.responsaveis.includes(eu.pessoaId);
  return { iemanjaAba: ehRoot(eu) || lista.some((ev) => ev.visivel || meu(ev)), iemanjaPublica: lista.some((ev) => ev.visivel) };
}

const limpar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
// Categoria sempre com a primeira letra maiúscula ("velas" vira "Velas").
const maiuscula = (c) => c.charAt(0).toLocaleUpperCase('pt-BR') + c.slice(1);
const mesma = (a, b) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

// Item (min 1): inteira, ou quebrada (até 2 casas) em kg e litro. Doação (min 0): até 2 casas.
const quantidade = (v, min, unidade = '') => {
  const n = quantidadeValida(v, unidade, min, 9999);
  if (n === null) throw new HttpError(400, min && !aceitaFracao(unidade) ? 'Quantidade inválida (número inteiro; fração só em kg e litro).' : 'Quantidade inválida.');
  return n;
};

export async function acaoIemanja(eu, b) {
  negarCurimba(eu);
  const lista = await lerEventos();
  const devolver = async (estado) => respostaIemanja(eu, estado);

  if (b.op === 'novo') {
    if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root cria um novo evento.');
    return devolver(await db.rpc('iemanja_evento_novo', { data: validarData(String(b.data || '')), nome: nomeEvento(b.nome) }));
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
    if (item.entregue) throw new HttpError(409, 'Este item já foi entregue.');
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
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, ...(b.nome !== undefined ? { nome: nomeEvento(b.nome) } : {}), ...(b.data ? { data: validarData(String(b.data)) } : {}), grupos }));
    }
    case 'listas': {
      if (ev.sorteado) throw new HttpError(409, 'Cancele o sorteio antes de mudar as listas.');
      const c = await candidatos();
      const validas = new Set([LISTA_CURIMBA, ...c.turmas.map((t) => t.id)]);
      const listas = Array.isArray(b.listas) ? [...new Set(b.listas.map(String))] : [];
      if (listas.some((k) => !validas.has(k))) throw new HttpError(400, 'Lista inválida.');
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, listas }));
    }
    case 'categorias': {
      const lista = Array.isArray(b.categorias) ? b.categorias.map((c) => maiuscula(limpar(c))) : [];
      if (lista.some((c) => !c || c.length > 40)) throw new HttpError(400, 'Cada categoria precisa de nome, com até 40 letras.');
      if (lista.some((c, k) => lista.findIndex((x) => mesma(x, c)) !== k)) throw new HttpError(400, 'Essa categoria já existe.');
      if (lista.length > 30) throw new HttpError(400, 'Até 30 categorias.');
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, categorias: lista }));
    }
    case 'detalhes': {
      // Texto do evento para o pessoal (vazio apaga); vai no começo da lista compartilhada de cada grupo.
      const detalhes = typeof b.detalhes === 'string' ? limparDetalhes(b.detalhes) : null;
      if (detalhes === null || !detalhesOk(detalhes)) throw new HttpError(400, `Os detalhes têm no máximo ${DETALHES_LINHAS} linhas.`);
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, detalhes }));
    }
    case 'grupoNovo':
      return devolver(await db.rpc('iemanja_grupo_novo', { id: ev.id }));
    case 'grupoExcluir':
      if (!grupo) throw new HttpError(400, 'Grupo inválido.');
      if (ev.grupos.length <= 1) throw new HttpError(409, 'O evento precisa de pelo menos um grupo.');
      return devolver(await db.rpc('iemanja_grupo_excluir', { id: grupo.id }));
    case 'encerrar':
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, encerrar: true }));
    case 'fora': {
      const chave = String(b.chave || '');
      const fora = b.fora ? [...new Set([...ev.fora, chave])] : ev.fora.filter((x) => x !== chave);
      return devolver(await db.rpc('iemanja_evento_salvar', { id: ev.id, fora }));
    }
    // Associar e trocar pessoas de grupo: só o root.
    case 'adicionar': {
      if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root associa pessoas às oferendas.');
      if (!grupo) throw new HttpError(400, 'Escolha o grupo.');
      const c = await candidatos();
      const pessoa = [...c.corrente, ...c.curimba, ...c.turmas.flatMap((t) => t.pessoas), ...c.semTurma].find((x) => x.chave === b.chave);
      if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada nos cadastros.');
      return devolver(await db.rpc('iemanja_membro', { grupoId: grupo.id, chave: pessoa.chave, nome: pessoa.nome, fixo: !ev.sorteado }));
    }
    case 'retirar':
      if (!grupo) throw new HttpError(400, 'Grupo inválido.');
      return devolver(await db.rpc('iemanja_membro', { grupoId: grupo.id, chave: String(b.chave || ''), remover: true }));
    case 'item': {
      if (!item && !grupo) throw new HttpError(400, 'Grupo inválido.');
      const nome = String(b.nome ?? '').replace(/\s+/g, ' ').trim();
      if (!nome || nome.length > 80) throw new HttpError(400, 'Informe o item.');
      // Categoria da lista do evento (ou a que o item já tinha, se saiu da lista); vazio = sem categoria.
      let categoria = limpar(b.categoria);
      if (categoria) {
        const daLista = (ev.categorias || []).find((c) => mesma(c, categoria)) || (item?.categoria && mesma(item.categoria, categoria) ? item.categoria : null);
        if (!daLista) throw new HttpError(400, 'Escolha uma categoria da lista do evento.');
        categoria = daLista;
      }
      const unidade = String(b.unidade ?? '').trim();
      if (!unidadeValida(unidade)) throw new HttpError(400, 'Unidade inválida.');
      return devolver(await db.rpc('iemanja_item_salvar', { id: item?.id ?? '', grupoId: grupo?.id ?? '', nome, categoria, quantidade: quantidade(b.quantidade, 1, unidade), unidade, entrega: b.entrega ? validarData(String(b.entrega)) : '' }));
    }
    case 'entregue':
      if (!item) throw new HttpError(404, 'Item não encontrado.');
      return devolver(await db.rpc('iemanja_item_entregue', { id: item.id, entregue: !!b.entregue }));
    case 'assumirPor': {
      if (!item) throw new HttpError(404, 'Item não encontrado.');
      const membro = ev.grupos.find((g) => g.itens.some((i) => i.id === item.id)).membros.find((m) => m.chave === b.chave);
      if (!membro) throw new HttpError(400, 'Só quem é do grupo assume este item.');
      return devolver(await db.rpc('iemanja_assumir', { itemId: item.id, chave: membro.chave, nome: membro.nome, quantidade: quantidade(b.quantidade, 0) }));
    }
    case 'excluirItem':
      if (!item) throw new HttpError(404, 'Item não encontrado.');
      return devolver(await db.rpc('iemanja_item_excluir', { id: item.id }));
    case 'sortear': {
      if (ev.sorteado) throw new HttpError(409, 'O sorteio deste evento já foi feito.');
      if (ev.grupos.some((g) => !g.nome)) throw new HttpError(400, 'Escolha o orixá ou a entidade de todos os grupos antes de sortear.');
      const [c, perfis] = await Promise.all([candidatos(), db.rpc('perfis_listar')]);
      const perfilDe = Object.fromEntries(perfis.map((x) => [x.pessoaId, normalizarPerfil(x.perfil)]));
      // O responsável fica no próprio grupo.
      const presos = new Set(ev.grupos.flatMap((g) => g.membros.map((m) => m.chave)));
      const fixosNovos = Object.fromEntries(ev.grupos.map((g) => {
        const r = g.responsavelId && !presos.has('p:' + g.responsavelId) ? [...c.corrente, ...c.curimba].find((p) => p.pessoaId === g.responsavelId) : null;
        if (r) presos.add(r.chave);
        return [g.id, r ? [{ chave: r.chave, nome: r.nome, fixo: true }] : []];
      }));
      const fora = new Set(ev.fora);
      const entra = (p) => !fora.has(p.chave) && !presos.has(p.chave);
      const listas = listasDoSorteio(ev.listas, c.turmas);
      const sorteados = sortearIemanja({
        grupos: ev.grupos.map((g) => ({ id: g.id, nome: g.nome, fixos: g.membros.length + fixosNovos[g.id].length })),
        corrente: c.corrente.filter(entra).map((p) => ({ ...p, perfil: perfilDe[p.pessoaId] })),
        turmas: [listas.includes(LISTA_CURIMBA) ? c.curimba : [], ...c.turmas.filter((t) => listas.includes(t.id)).map((t) => t.pessoas)].map((l) => l.filter(entra)),
      });
      return devolver(await db.rpc('iemanja_sorteio_gravar', { id: ev.id, grupos: ev.grupos.map((g) => ({ id: g.id, membros: [...fixosNovos[g.id], ...sorteados[g.id].map((p) => ({ ...p, fixo: false }))] })) }));
    }
    // Troca duas pessoas de oferendas (grupos) diferentes: cada uma vai para o grupo da outra.
    // Quem já assumiu item não troca (o item ficaria com alguém de fora do grupo).
    case 'trocar': {
      if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root troca pessoas de oferenda.');
      const a = String(b.a || ''), c = String(b.b || '');
      const ga = ev.grupos.find((g) => g.membros.some((m) => m.chave === a));
      const gb = ev.grupos.find((g) => g.membros.some((m) => m.chave === c));
      if (!ga || !gb) throw new HttpError(400, 'Escolha duas pessoas que estão nos grupos.');
      if (ga.id === gb.id) throw new HttpError(400, 'Escolha pessoas de oferendas diferentes.');
      const comItem = [[a, ga], [c, gb]].find(([k, g]) => g.itens.some((i) => i.doacoes.some((d) => d.chave === k)));
      if (comItem) throw new HttpError(400, `${comItem[1].membros.find((m) => m.chave === comItem[0]).nome} já assumiu item na oferenda dela: tire o item antes de trocar.`);
      return devolver(await db.rpc('iemanja_trocar', { id: ev.id, a, b: c }));
    }
    case 'cancelarSorteio':
      // Depois que alguém assumiu um item, o sorteio não pode mais ser desfeito.
      if (temAtribuicao(ev)) throw new HttpError(400, 'Já há itens assumidos nos grupos: o sorteio não pode mais ser cancelado.');
      return devolver(await db.rpc('iemanja_sorteio_cancelar', { id: ev.id }));
    default:
      throw new HttpError(400, 'Ação inválida.');
  }
}
