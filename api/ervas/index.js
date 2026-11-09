// Compra coletiva de ervas.
//   GET  /api/ervas   catálogo, frete, lista aberta/fechada e as minhas escolhas
//                     e todos os pedidos calculados (andamento geral)
//   GET  /api/ervas?lista=historico  só admin: compras encerradas [{ id, gira, data, resumo, encerradaEm }], da mais nova
//   PUT  /api/ervas   { itens: [{ ervaId, quantidade }] }  — salva as minhas escolhas
//                     admin: { para: { chave? | pessoaId? | nome }, itens }  — pedido de outra pessoa (lista vazia apaga)
//   POST /api/ervas   { acao, ... }  — só admin (com a lista fechada, só config { aberta }, novaCompra e encerrarCompra):
//        publicar { publicada }  → { publicada }  — aba visível para todos ou só para quem administra (vale com a lista fechada)
//        salvarErva { id?, nome, precoEstimado?, preco?, pessoasPorcao? } (vazio = a definir / uma porção atende todos; sem o campo, mantém)
//                   precoEstimado = preço de referência do cadastro; preco = o real, que o bloco Compra preenche · excluirErva { id } · config { frete?, aberta?, gira?, data? } · novaCompra
//        salvarCompra { gira, data, frete, itens: [{ id, quantidade, preco }] }  — bloco Compra (preço da porção; vazio = a definir)
//        reatribuir { chave, pessoaId }  — passa o pedido para uma pessoa da corrente
//        encerrarCompra  — grava o retrato final da compra no Histórico de compras e começa uma nova
//        novaCompra  — descarta: começa uma nova sem guardar (tira do histórico o que foi guardado ao fechar)
//        config { aberta: false }  — fechar a lista também guarda o retrato da compra atual no histórico
import { rota, corpo, validarId, validarData, HttpError } from '../_lib/http.js';
import { exigir } from '../_lib/sessao.js';
import { db } from '../_lib/db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa, calcularPedidos, normalizarNome, resumoCompra } from '../../shared/ervas.js';

function resposta(estado, eu) {
  const chave = chavePessoa(eu);
  const participantes = new Set(estado.escolhas.map((s) => s.chave));
  const base = {
    frete: Number(estado.frete),
    aberta: estado.aberta,
    gira: estado.gira || '',
    data: estado.data || '',
    ervas: estado.ervas.map((e) => ({ ...e, preco: e.preco === null ? null : Number(e.preco),
      precoEstimado: e.precoEstimado === null || e.precoEstimado === undefined ? null : Number(e.precoEstimado) })),
    minhas: estado.escolhas.filter((s) => s.chave === chave).map(({ ervaId, quantidade }) => ({ ervaId, quantidade })),
    eu: { chave, nome: eu.nome },
    participantes: participantes.size,
    euParticipo: participantes.has(chave),
  };
  // Todos veem o andamento geral (consolidado por erva). Quem não é admin recebe os
  // pedidos dos outros sem nome, só para calcular a própria parte.
  base.pedidos = calcularPedidos(base.ervas, estado.escolhas, base.frete);
  if (!pode(eu, 'ervas:gerenciar')) {
    base.pedidos.pessoas = base.pedidos.pessoas.map((p, i) => (p.chave === chave ? p : { ...p, chave: 'outro:' + i, nome: '' }));
  }
  return base;
}

function valor(v, oque) {
  const n = Number(String(v ?? '').replace(/\s|R\$/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, oque + ' inválido.');
  return Math.round(n * 100) / 100;
}

// Retrato da compra para o Histórico de compras (null quando não há pedido nem erva na compra).
function retrato(estado) {
  const ervas = estado.ervas.map((e) => ({ ...e, preco: e.preco === null ? null : Number(e.preco) }));
  const resumo = resumoCompra(ervas, estado.escolhas, Number(estado.frete));
  if (!resumo.compra.length && !resumo.pessoas.length) return null;
  return { gira: estado.gira || '', data: estado.data || '', resumo };
}

const FECHADA = 'A lista de ervas está fechada. Reabra a lista para alterar.';

// Aba desligada: só quem administra as ervas entra.
async function exigirAba(req) {
  const eu = await exigir(req, 'ervas:escolher');
  if (!pode(eu, 'ervas:gerenciar') && !(await db.rpc('ervas_publicada'))) throw new HttpError(403, 'A aba Ervas não está disponível no momento.');
  return eu;
}

const precoOuNulo = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : valor(v, 'Preço'));

// Nome da gira e data do evento do pedido.
function evento(b) {
  const gira = String(b.gira ?? '').replace(/\s+/g, ' ').trim();
  if (gira.length > 80) throw new HttpError(400, 'Nome da gira muito longo.');
  return { gira, data: b.data ? validarData(String(b.data)) : '' };
}

export default rota({
  GET: async (req) => {
    if (req.query.lista === 'historico') {
      await exigir(req, 'ervas:gerenciar');
      return db.rpc('ervas_historico');
    }
    const eu = await exigirAba(req);
    return resposta(await db.rpc('ervas_estado'), eu);
  },

  PUT: async (req) => {
    const eu = await exigirAba(req);
    const b = corpo(req);
    if (!Array.isArray(b.itens) || b.itens.length > 200) throw new HttpError(400, 'Lista de ervas inválida.');
    const itens = b.itens.map((i) => {
      const q = Number(i?.quantidade);
      if (!Number.isInteger(q) || q < 1 || q > 99) throw new HttpError(400, 'Quantidade inválida (de 1 a 99).');
      return { ervaId: validarId(i?.ervaId, 'Erva'), quantidade: q };
    });
    if (b.para) {
      if (!pode(eu, 'ervas:gerenciar')) throw new HttpError(403, 'Só um admin pode fazer o pedido de outra pessoa.');
      const nome = String(b.para.nome || '').replace(/\s+/g, ' ').trim();
      const atual = await db.rpc('ervas_estado');
      if (atual.aberta === false) throw new HttpError(400, FECHADA);
      const existente = typeof b.para.chave === 'string' && atual.escolhas.find((s) => s.chave === b.para.chave);
      if (!existente && !b.para.pessoaId && (nome.length < 2 || nome.length > 60)) throw new HttpError(400, 'Informe o nome da pessoa (2 a 60 letras).');
      // Quem está na lista da corrente fica no cadastro da pessoa (o mesmo de quando ela entra pelo cpj).
      const lista = existente ? [] : await db.rpc('pessoas_listar');
      const pessoa = existente ? null : b.para.pessoaId
        ? lista.find((p) => p.id === validarId(b.para.pessoaId, 'Pessoa'))
        : lista.find((p) => normalizarNome(p.nome) === normalizarNome(nome));
      if (b.para.pessoaId && !existente && !pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
      if (pessoa) await db.rpc('corrente_vincular', { chave: 'p:' + pessoa.id, nome: pessoa.nome, antigas: ['n:' + normalizarNome(pessoa.nome), ...(nome ? ['n:' + normalizarNome(nome)] : [])] });
      const chave = existente ? existente.chave : pessoa ? 'p:' + pessoa.id : 'n:' + normalizarNome(nome);
      const estado = await db.rpc('ervas_escolher', { chave, nome: existente ? existente.nome : pessoa ? pessoa.nome : nome, itens });
      return resposta(estado, eu);
    }
    const estado = await db.rpc('ervas_escolher', { chave: chavePessoa(eu), nome: eu.nome, itens });
    return resposta(estado, eu);
  },

  POST: async (req) => {
    const eu = await exigir(req, 'ervas:gerenciar');
    const b = corpo(req);
    if (b.acao === 'publicar') {
      if (typeof b.publicada !== 'boolean') throw new HttpError(400, 'Informe se a aba fica visível.');
      return { publicada: await db.rpc('ervas_publicar', { publicada: b.publicada }) };
    }
    // Lista fechada: ninguém altera nada (pedidos, Compra, cadastro); só reabrir ou começar nova compra.
    const soAbrir = (b.acao === 'config' && !['frete', 'gira', 'data'].some((k) => k in b)) || ['novaCompra', 'encerrarCompra'].includes(b.acao);
    if (!soAbrir && (await db.rpc('ervas_estado')).aberta === false) throw new HttpError(400, FECHADA);
    let estado;
    switch (b.acao) {
      case 'salvarErva': {
        const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
        if (!nome || nome.length > 60) throw new HttpError(400, 'Informe o nome da erva.');
        const p = { id: b.id ? validarId(b.id, 'Erva') : null, nome };
        if ('preco' in b) p.preco = precoOuNulo(b.preco);
        if ('precoEstimado' in b) p.precoEstimado = precoOuNulo(b.precoEstimado);
        if ('pessoasPorcao' in b) {
          const vazio = b.pessoasPorcao === null || String(b.pessoasPorcao).trim() === '';
          const n = Number(b.pessoasPorcao);
          if (!vazio && (!Number.isInteger(n) || n < 1 || n > 999)) throw new HttpError(400, 'Pessoas por porção inválido (de 1 a 999).');
          p.pessoasPorcao = vazio ? null : n;
        }
        estado = await db.rpc('erva_salvar', p);
        break;
      }
      case 'salvarCompra': {
        if (!Array.isArray(b.itens) || b.itens.length > 500) throw new HttpError(400, 'Lista de ervas inválida.');
        const itens = b.itens.map((i) => {
          const q = Number(i?.quantidade);
          if (!Number.isInteger(q) || q < 0 || q > 999) throw new HttpError(400, 'Quantidade inválida (de 0 a 999).');
          return { id: validarId(i?.id, 'Erva'), quantidade: q, preco: precoOuNulo(i?.preco) };
        });
        estado = await db.rpc('ervas_compra_salvar', { ...evento(b), frete: valor(b.frete, 'Frete'), itens });
        break;
      }
      case 'excluirErva':
        estado = await db.rpc('erva_excluir', { id: validarId(b.id, 'Erva') });
        break;
      case 'config': {
        const p = {};
        if ('frete' in b) p.frete = valor(b.frete, 'Frete');
        if ('aberta' in b) p.aberta = !!b.aberta;
        if ('gira' in b) p.gira = evento(b).gira;
        if ('data' in b) p.data = evento(b).data;
        estado = await db.rpc('ervas_config', p);
        // Fechar a lista já guarda a compra no Histórico de compras. Se lá já houver uma com o mesmo nome
        // de gira e a mesma data (reaberta e alterada, por exemplo), ela é atualizada em vez de repetir.
        if (p.aberta === false) {
          const r = retrato(estado);
          if (r) estado = await db.rpc('ervas_compra_guardar', r);
        }
        break;
      }
      // Descartar: apaga sem guardar (e tira do histórico o que foi guardado ao fechar a lista).
      case 'novaCompra':
        estado = await db.rpc('ervas_compra_descartar');
        break;
      case 'encerrarCompra': {
        const r = retrato(await db.rpc('ervas_estado'));
        if (!r) throw new HttpError(400, 'Não há nada nesta compra para guardar. Use Descartar.');
        estado = await db.rpc('ervas_compra_encerrar', r);
        break;
      }
      // Passa um pedido (de um nome digitado errado, por exemplo) para uma pessoa da corrente.
      // Se ela já tiver pedido a mesma erva, fica a quantidade que ela já tinha.
      case 'reatribuir': {
        const chave = String(b.chave || '');
        const pessoa = (await db.rpc('pessoas_listar')).find((p) => p.id === validarId(b.pessoaId, 'Pessoa'));
        if (!pessoa) throw new HttpError(400, 'Pessoa não encontrada na corrente.');
        const atual = await db.rpc('ervas_estado');
        if (!atual.escolhas.some((s) => s.chave === chave)) throw new HttpError(400, 'Pedido não encontrado.');
        if (chave !== 'p:' + pessoa.id) await db.rpc('corrente_vincular', { chave: 'p:' + pessoa.id, nome: pessoa.nome, antigas: [chave] });
        estado = await db.rpc('ervas_estado');
        break;
      }
      default:
        throw new HttpError(400, 'Ação inválida.');
    }
    return resposta(estado, eu);
  },
});
