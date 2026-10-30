// Oferendas: itens pedidos e quem vai doar o quê.
//   GET  /api/oferendas   { oferendas: [...], eu: { chave, nome } }
//   POST /api/oferendas   { acao, ... }
//        todos:  doar { itemId, quantidade }  (0 = desiste)
//        admin:  salvar { id?, titulo, data, responsavelId, porMedium? (só ao criar) } · excluir { id }
//                medium { oferendaId, pessoaId, status } · excluirMedium { oferendaId, pessoaId } · atualizarMediuns { id }  (oferenda com uma linha por médium)
//                item { id?, oferendaId, nome, quantidade, entrega: 'AAAA-MM-DD' | '' (no dia do evento) }
//                excluirItem { id } · entregue { id, entregue }
//                status { id, status: 'rascunho' | 'aguardando' | 'publicado' | 'encerrado' }
// Quem não administra as oferendas vê as publicadas (e doa nelas) e as bloqueadas (sem os itens).
//                doarPor { itemId, pessoaId | chave, quantidade }  — doação de outra pessoa (0 = exclui)
import { rota, corpo, validarId, validarData, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { STATUS_MEDIUM_KEYS } from '../../shared/oferendas.js';

const STATUS = ['rascunho', 'aguardando', 'publicado', 'encerrado'];
function resposta(oferendas, eu) {
  const chave = chavePessoa(eu);
  // Bloqueada: só os itens em que a pessoa se comprometeu (para "Seus compromissos"), sem os outros doadores.
  const soMeus = (o) => ({
    ...o, bloqueada: true,
    itens: o.itens.filter((i) => i.doacoes.some((d) => d.chave === chave)).map((i) => ({ ...i, doacoes: i.doacoes.filter((d) => d.chave === chave) })),
    mediuns: (o.mediuns || []).filter((m) => 'p:' + m.pessoaId === chave),
  });
  return {
    // Quem não administra: vê as publicadas e as bloqueadas (estas sem a lista de itens).
    oferendas: pode(eu.papel, 'oferendas:gerenciar') ? oferendas : oferendas
      .filter((o) => o.status === 'publicado' || o.status === 'rascunho')
      .map((o) => (o.status === 'rascunho' ? soMeus(o) : o)),
    eu: { chave, nome: eu.nome },
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

export default rota({
  GET: async (req) => {
    const eu = await exigir(req, 'oferendas:doar');
    return resposta(await db.rpc('oferendas_estado'), eu);
  },
  POST: async (req) => {
    const eu = await exigir(req, 'oferendas:doar');
    const b = corpo(req);
    if (b.acao === 'doar') {
      const estado = await db.rpc('oferenda_doar', {
        itemId: validarId(b.itemId, 'Item'), chave: chavePessoa(eu), nome: eu.nome,
        quantidade: inteiro(b.quantidade, 'Quantidade', 0, 10000),
      });
      return resposta(estado, eu);
    }
    if (!pode(eu.papel, 'oferendas:gerenciar')) throw new HttpError(403, 'Só um admin pode alterar as oferendas.');
    let estado;
    switch (b.acao) {
      case 'salvar': {
        // Responsável: uma pessoa da corrente (obrigatório).
        const resp = (await db.rpc('pessoas_listar')).find((p) => p.id === validarId(b.responsavelId, 'Responsável'));
        if (!resp) throw new HttpError(400, 'Escolha o responsável (uma pessoa da corrente).');
        estado = await db.rpc('oferenda_salvar', { id: b.id ? validarId(b.id, 'Oferenda') : null, titulo: texto(b.titulo, 'o título', 120), data: validarData(String(b.data || '')), responsavelId: resp.id, porMedium: !b.id && b.porMedium === true });
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
        if (b.pessoaId) {
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
      case 'medium':
        if (!STATUS_MEDIUM_KEYS.includes(b.status)) throw new HttpError(400, 'Situação inválida.');
        estado = await db.rpc('oferenda_medium_status', { oferendaId: validarId(b.oferendaId, 'Oferenda'), pessoaId: validarId(b.pessoaId, 'Médium'), status: b.status });
        break;
      case 'excluirMedium':
        estado = await db.rpc('oferenda_medium_excluir', { oferendaId: validarId(b.oferendaId, 'Oferenda'), pessoaId: validarId(b.pessoaId, 'Médium') });
        break;
      case 'atualizarMediuns':
        estado = await db.rpc('oferenda_mediuns_atualizar', { id: validarId(b.id, 'Oferenda') });
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
