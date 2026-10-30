// Oferendas: itens pedidos e quem vai doar o quê.
//   GET  /api/oferendas   { oferendas: [...], eu: { chave, nome } }
//   POST /api/oferendas   { acao, ... }
//        todos:  doar { itemId, quantidade }  (0 = desiste)
//        admin:  salvar { id?, titulo, data } · excluir { id }
//                item { id?, oferendaId, nome, quantidade, entrega: 'AAAA-MM-DD' | '' (no dia do evento) }
//                excluirItem { id } · entregue { id, entregue }
import { rota, corpo, validarId, validarData, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';

const resposta = (oferendas, eu) => ({ oferendas, eu: { chave: chavePessoa(eu), nome: eu.nome } });

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
      case 'salvar':
        estado = await db.rpc('oferenda_salvar', { id: b.id ? validarId(b.id, 'Oferenda') : null, titulo: texto(b.titulo, 'o título', 120), data: validarData(String(b.data || '')) });
        break;
      case 'excluir':
        estado = await db.rpc('oferenda_excluir', { id: validarId(b.id, 'Oferenda') });
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
