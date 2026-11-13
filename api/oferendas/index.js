// Oferendas: itens pedidos e quem vai doar o quê.
//   GET  /api/oferendas   { oferendas: [...], eu: { chave, nome } }
//   POST /api/oferendas   { acao, ... }
//        todos:  doar { itemId, quantidade }  (0 = desiste)
//        root:   abaSalvar { id?, nome } · abaVisivel { id, visivel } · abaExcluir { id }  (sub-abas)
//        admin:  salvar { id?, titulo, data, responsavelId, abaId?, porMedium? (só ao criar) } · excluir { id }
//                abaDetalhes { id, detalhes }  (texto da sub-aba, até 10 linhas)
//                medium { oferendaId, pessoaId, pagamento?: 'pago'|'nao_pago', entrega?: 'pendente'|'entregue' } · excluirMedium { oferendaId, pessoaId } · incluirMedium { oferendaId, pessoaId } · atualizarMediuns { id, grupos? } · resumo { id, noResumo }  (oferenda com uma linha por médium)
//                item { id?, oferendaId, nome, quantidade, entrega: 'AAAA-MM-DD' | '' (no dia do evento) }
//                excluirItem { id } · entregue { id, entregue }
//                status { id, status: 'rascunho' | 'aguardando' | 'publicado' | 'encerrado' }
// Aba Pedidos de Guias: GET ?lista=guias e POST { acao: 'guias', op, ... } (veja api/_lib/guias.js).
// Quem não administra as oferendas vê as publicadas (e doa nelas) e as bloqueadas (sem os itens).
//                doarPor { itemId, pessoaId | chave, quantidade }  — doação de outra pessoa (0 = exclui)
import { rota, corpo, validarId, validarData, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { PAGAMENTO_KEYS, ENTREGA_KEYS, grupoOferendaValido, abasOcultas, temAbaPublica, limparDetalhes, detalhesOk, DETALHES_LINHAS } from '../../shared/oferendas.js';
import { respostaIemanja, acaoIemanja } from '../_lib/iemanja.js';
import { respostaGuias, acaoGuias } from '../_lib/guias.js';

const STATUS = ['rascunho', 'aguardando', 'publicado', 'encerrado'];
async function resposta(oferendas, eu) {
  const chave = chavePessoa(eu);
  // Bloqueada: só os itens em que a pessoa se comprometeu (para "Seus compromissos"), sem os outros doadores.
  const soMeus = (o) => ({
    ...o, bloqueada: true,
    itens: o.itens.filter((i) => i.doacoes.some((d) => d.chave === chave)).map((i) => ({ ...i, doacoes: i.doacoes.filter((d) => d.chave === chave) })),
    mediuns: (o.mediuns || []).filter((m) => 'p:' + m.pessoaId === chave),
  });
  const abas = await db.rpc('oferenda_abas_listar');
  const admin = pode(eu, 'oferendas:gerenciar');
  const ocultas = abasOcultas(abas);
  return {
    // Quem não administra: vê as publicadas e as bloqueadas (estas sem a lista de itens), só das sub-abas visíveis.
    oferendas: admin ? oferendas : oferendas
      .filter((o) => (o.status === 'publicado' || o.status === 'rascunho') && !ocultas.has(o.abaId))
      .map((o) => (o.status === 'rascunho' ? soMeus(o) : o)),
    eu: { chave, nome: eu.nome },
    abas: admin ? abas : abas.filter((a) => !ocultas.has(a.id)),
    publica: temAbaPublica(abas),
  };
}

function inteiro(v, oque, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${oque} inválida.`);
  return n;
}
function texto(v, oque, max) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > max) throw new HttpError(400, `Informe ${oque}.`);
  return s;
}
function validarGrupos(v) {
  if (!Array.isArray(v) || !v.length || v.some((g) => !grupoOferendaValido(g))) throw new HttpError(400, 'Escolha de quais grupos vêm as pessoas.');
  return [...new Set(v)];
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'iemanja') return respostaIemanja(await exigir(req));
    if (req.query.lista === 'guias') return respostaGuias(await exigir(req));
    const eu = await exigir(req, 'oferendas:doar');
    // Já inclui os novos cadastrados nas listas por pessoa.
    return resposta(await db.rpc('oferendas_sincronizar'), eu);
  },
  POST: async (req) => {
    const b = corpo(req);
    if (b.acao === 'iemanja') return acaoIemanja(await exigir(req), b);
    if (b.acao === 'guias') return acaoGuias(await exigir(req), b);
    const eu = await exigir(req, 'oferendas:doar');
    if (b.acao === 'doar') {
      if (!pode(eu, 'oferendas:gerenciar')) {
        const ocultas = abasOcultas(await db.rpc('oferenda_abas_listar'));
        if (ocultas.size && ocultas.has((await db.rpc('oferendas_estado')).find((o) => o.itens.some((i) => i.id === b.itemId))?.abaId)) throw new HttpError(403, 'Esta oferenda não está disponível.');
      }
      const estado = await db.rpc('oferenda_doar', {
        itemId: validarId(b.itemId, 'Item'), chave: chavePessoa(eu), nome: eu.nome,
        quantidade: inteiro(b.quantidade, 'Quantidade', 0, 10000),
      });
      return resposta(estado, eu);
    }
    if (!pode(eu, 'oferendas:gerenciar')) throw new HttpError(403, 'Só um admin pode alterar as oferendas.');
    let estado;
    switch (b.acao) {
      case 'abaSalvar':
      case 'abaVisivel':
      case 'abaExcluir':
        if (!pode(eu, 'usuarios:gerenciar')) throw new HttpError(403, 'Só o admin root altera as sub-abas.');
        if (b.acao === 'abaVisivel') await db.rpc('oferenda_aba_visivel', { id: validarId(b.id, 'Sub-aba'), visivel: b.visivel === true });
        else if (b.acao === 'abaSalvar') await db.rpc('oferenda_aba_salvar', { id: b.id ? validarId(b.id, 'Sub-aba') : null, nome: texto(b.nome, 'o nome da sub-aba', 40) });
        else await db.rpc('oferenda_aba_excluir', { id: validarId(b.id, 'Sub-aba') });
        estado = await db.rpc('oferendas_estado');
        break;
      case 'abaDetalhes': {
        // Texto da sub-aba para o pessoal (vazio apaga).
        if (typeof b.detalhes !== 'string') throw new HttpError(400, 'Informe os detalhes.');
        const detalhes = limparDetalhes(b.detalhes);
        if (!detalhesOk(detalhes)) throw new HttpError(400, `Os detalhes têm no máximo ${DETALHES_LINHAS} linhas.`);
        await db.rpc('oferenda_aba_detalhes', { id: validarId(b.id, 'Sub-aba'), detalhes });
        estado = await db.rpc('oferendas_estado');
        break;
      }
      case 'salvar': {
        // Responsável: uma pessoa da corrente (obrigatório).
        const resp = (await db.rpc('pessoas_listar')).find((p) => p.id === validarId(b.responsavelId, 'Responsável'));
        if (!resp) throw new HttpError(400, 'Escolha o responsável (uma pessoa da corrente).');
        const porMedium = !b.id && b.porMedium === true;
        const grupos = porMedium && b.grupos !== undefined ? validarGrupos(b.grupos) : null;
        const antes = grupos ? new Set((await db.rpc('oferendas_estado')).map((o) => o.id)) : null;
        const abaId = b.abaId ? validarId(b.abaId, 'Sub-aba') : null;
        if (abaId && !(await db.rpc('oferenda_abas_listar')).some((a) => a.id === abaId && !a.iemanja)) throw new HttpError(400, 'Sub-aba inválida.');
        estado = await db.rpc('oferenda_salvar', { id: b.id ? validarId(b.id, 'Oferenda') : null, titulo: texto(b.titulo, 'o título', 120), data: validarData(String(b.data || '')), responsavelId: resp.id, porMedium, abaId });
        // Uma linha por pessoa só dos grupos escolhidos (funções da corrente e/ou alunos).
        const nova = grupos && estado.find((o) => !antes.has(o.id));
        if (nova) estado = await db.rpc('oferenda_mediuns_atualizar', { id: nova.id, grupos });
        break;
      }
      case 'excluir':
        estado = await db.rpc('oferenda_excluir', { id: validarId(b.id, 'Oferenda') });
        break;
      case 'status':
        if (!STATUS.includes(b.status)) throw new HttpError(400, 'Situação inválida.');
        estado = await db.rpc('oferenda_status', { id: validarId(b.id, 'Oferenda'), status: b.status });
        break;
      case 'item':
        estado = await db.rpc('oferenda_item_salvar', {
          id: b.id ? validarId(b.id, 'Item') : null,
          oferendaId: b.id ? null : validarId(b.oferendaId, 'Oferenda'),
          nome: texto(b.nome, 'o item', 80),
          quantidade: inteiro(b.quantidade, 'Quantidade', 1, 10000),
          entrega: b.entrega ? validarData(String(b.entrega)) : '',
        });
        break;
      case 'doarPor': {
        const itemId = validarId(b.itemId, 'Item');
        const quantidade = inteiro(b.quantidade, 'Quantidade', 0, 10000);
        let chave, nome;
        if (typeof b.pessoaId === 'string' && b.pessoaId.startsWith('a:')) {
          // Aluno da CPJ
          const aluno = (await db.rpc('alunos_estado')).alunos.find((a) => a.id === validarId(b.pessoaId.slice(2), 'Aluno'));
          if (!aluno) throw new HttpError(400, 'Aluno não encontrado.');
          chave = 'a:' + aluno.id;
          nome = aluno.nome;
        } else if (b.pessoaId) {
          const pessoa = (await db.rpc('pessoas_listar')).find((p) => p.id === validarId(b.pessoaId, 'Pessoa'));
          if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
          chave = 'p:' + pessoa.id;
          nome = pessoa.nome;
        } else {
          const item = (await db.rpc('oferendas_estado')).flatMap((o) => o.itens).find((i) => i.id === itemId);
          const d = item?.doacoes.find((x) => x.chave === b.chave);
          if (!d) throw new HttpError(400, 'Doação não encontrada.');
          chave = d.chave;
          nome = d.nome;
        }
        estado = await db.rpc('oferenda_doar', { itemId, chave, nome, quantidade, forcar: true });
        break;
      }
      case 'medium': {
        // Linha de aluno vem como "a:<id>".
        const aluno = typeof b.pessoaId === 'string' && b.pessoaId.startsWith('a:');
        const p = aluno ? { oferendaId: validarId(b.oferendaId, 'Oferenda'), alunoId: validarId(b.pessoaId.slice(2), 'Aluno') }
          : { oferendaId: validarId(b.oferendaId, 'Oferenda'), pessoaId: validarId(b.pessoaId, 'Médium') };
        if ('pagamento' in b) {
          if (!PAGAMENTO_KEYS.includes(b.pagamento)) throw new HttpError(400, 'Pagamento inválido.');
          p.pagamento = b.pagamento;
        }
        if ('entrega' in b) {
          if (!ENTREGA_KEYS.includes(b.entrega)) throw new HttpError(400, 'Entrega inválida.');
          p.entrega = b.entrega;
        }
        if (!p.pagamento && !p.entrega) throw new HttpError(400, 'Informe o pagamento ou a entrega.');
        estado = await db.rpc(aluno ? 'oferenda_aluno_status' : 'oferenda_medium_status', p);
        break;
      }
      case 'excluirMedium':
        if (typeof b.pessoaId === 'string' && b.pessoaId.startsWith('a:')) {
          estado = await db.rpc('oferenda_aluno_excluir', { oferendaId: validarId(b.oferendaId, 'Oferenda'), alunoId: validarId(b.pessoaId.slice(2), 'Aluno') });
        } else {
          estado = await db.rpc('oferenda_medium_excluir', { oferendaId: validarId(b.oferendaId, 'Oferenda'), pessoaId: validarId(b.pessoaId, 'Médium') });
        }
        break;
      case 'incluirMedium':
        // Uma pessoa do cadastro (corrente ou 'a:' + aluno) na lista; quem tinha sido tirado volta.
        estado = await db.rpc('oferenda_pessoa_incluir', typeof b.pessoaId === 'string' && b.pessoaId.startsWith('a:')
          ? { oferendaId: validarId(b.oferendaId, 'Oferenda'), alunoId: validarId(b.pessoaId.slice(2), 'Aluno') }
          : { oferendaId: validarId(b.oferendaId, 'Oferenda'), pessoaId: validarId(b.pessoaId, 'Pessoa') });
        break;
      case 'atualizarMediuns':
        // Com grupos: só inclui quem é desses grupos (não tira ninguém); sem grupos: os grupos da oferenda.
        estado = b.grupos !== undefined
          ? await db.rpc('oferenda_mediuns_incluir', { id: validarId(b.id, 'Oferenda'), grupos: validarGrupos(b.grupos) })
          : await db.rpc('oferenda_mediuns_atualizar', { id: validarId(b.id, 'Oferenda') });
        break;
      case 'resumo':
        // Oferenda por pessoa: entra (ou sai) da tabela do admin em "Seus compromissos".
        if (typeof b.noResumo !== 'boolean') throw new HttpError(400, 'Informe se a oferenda aparece no resumo.');
        estado = await db.rpc('oferenda_resumo', { id: validarId(b.id, 'Oferenda'), noResumo: b.noResumo });
        break;
      case 'excluirItem':
        estado = await db.rpc('oferenda_item_excluir', { id: validarId(b.id, 'Item') });
        break;
      case 'entregue':
        estado = await db.rpc('oferenda_item_entregue', { id: validarId(b.id, 'Item'), entregue: !!b.entregue });
        break;
      default:
        throw new HttpError(400, 'Ação inválida.');
    }
    return resposta(estado, eu);
  },
});
