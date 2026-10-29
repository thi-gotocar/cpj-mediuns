// Compra coletiva de ervas.
//   GET  /api/ervas   catálogo, frete, lista aberta/fechada e as minhas escolhas
//                     (admin recebe também todos os pedidos calculados)
//   PUT  /api/ervas   { itens: [{ ervaId, quantidade }] }  — salva as minhas escolhas
//   POST /api/ervas   { acao, ... }  — só admin:
//        salvarErva { id?, nome, preco? } (preço vazio = a definir) · excluirErva { id } · config { frete?, aberta? } · novaCompra
import { rota, corpo, validarId, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa, calcularPedidos } from '../../shared/ervas.js';

function resposta(estado, eu) {
  const chave = chavePessoa(eu);
  const participantes = new Set(estado.escolhas.map((s) => s.chave));
  const base = {
    frete: Number(estado.frete),
    aberta: estado.aberta,
    ervas: estado.ervas.map((e) => ({ ...e, preco: e.preco === null ? null : Number(e.preco) })),
    minhas: estado.escolhas.filter((s) => s.chave === chave).map(({ ervaId, quantidade }) => ({ ervaId, quantidade })),
    eu: { chave, nome: eu.nome },
    participantes: participantes.size,
    euParticipo: participantes.has(chave),
  };
  if (pode(eu.papel, 'ervas:gerenciar')) {
    base.pedidos = calcularPedidos(base.ervas, estado.escolhas, base.frete);
  }
  return base;
}

function valor(v, oque) {
  const n = Number(String(v ?? '').replace(/\s|R\$/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, oque + ' inválido.');
  return Math.round(n * 100) / 100;
}

export default rota({
  GET: async (req) => {
    const eu = await exigir(req, 'ervas:escolher');
    return resposta(await db.rpc('ervas_estado'), eu);
  },

  PUT: async (req) => {
    const eu = await exigir(req, 'ervas:escolher');
    const b = corpo(req);
    if (!Array.isArray(b.itens) || b.itens.length > 200) throw new HttpError(400, 'Lista de ervas inválida.');
    const itens = b.itens.map((i) => {
      const q = Number(i?.quantidade);
      if (!Number.isInteger(q) || q < 1 || q > 99) throw new HttpError(400, 'Quantidade inválida (de 1 a 99).');
      return { ervaId: validarId(i?.ervaId, 'Erva'), quantidade: q };
    });
    const estado = await db.rpc('ervas_escolher', { chave: chavePessoa(eu), nome: eu.nome, itens });
    return resposta(estado, eu);
  },

  POST: async (req) => {
    const eu = await exigir(req, 'ervas:gerenciar');
    const b = corpo(req);
    let estado;
    switch (b.acao) {
      case 'salvarErva': {
        const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
        if (!nome || nome.length > 60) throw new HttpError(400, 'Informe o nome da erva.');
        const vazio = b.preco === null || b.preco === undefined || String(b.preco).trim() === '';
        estado = await db.rpc('erva_salvar', { id: b.id ? validarId(b.id, 'Erva') : null, nome, preco: vazio ? null : valor(b.preco, 'Preço') });
        break;
      }
      case 'excluirErva':
        estado = await db.rpc('erva_excluir', { id: validarId(b.id, 'Erva') });
        break;
      case 'config': {
        const p = {};
        if ('frete' in b) p.frete = valor(b.frete, 'Frete');
        if ('aberta' in b) p.aberta = !!b.aberta;
        estado = await db.rpc('ervas_config', p);
        break;
      }
      case 'novaCompra':
        estado = await db.rpc('ervas_nova_compra');
        break;
      default:
        throw new HttpError(400, 'Ação inválida.');
    }
    return resposta(estado, eu);
  },
});
