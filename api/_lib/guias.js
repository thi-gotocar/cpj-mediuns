// Aba Compras (rota: GET /api/oferendas?lista=guias · POST /api/oferendas { acao: 'guias', op, ... }).
//   todos:  pedir { itemId, quantidade }  — no pedido aberto, sem passar do disponível
//   admin:  publicar { publicada } · grupo { id?, descricao?, visivel? } · excluirGrupo { id }
//           item { id?, grupoId, descricao?, foto? (base64 JPEG | null tira), quantidade?, valor?, visivel? } · excluirItem { id }
//           cancelar { id } (a quantidade volta para o item) · ok { id, ok } · encerrar · novo (próximo número)
// Quem não administra vê só os grupos e itens visíveis e as próprias linhas (meus), nunca os pedidos dos outros.

import { db } from './db.js';
import { HttpError, validarId } from './http.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';

const ehAdmin = (eu) => pode(eu, 'guias:gerenciar');

// Sem a aba no perfil, ou com a aba desligada e sem administrar: não entra.
async function exigirAba(eu) {
  if (!pode(eu, 'guias:pedir') && !ehAdmin(eu)) throw new HttpError(403, 'Seu perfil não tem a aba Compras.');
  if (!ehAdmin(eu) && !(await db.rpc('guias_publicada'))) throw new HttpError(403, 'A aba Compras não está disponível no momento.');
}

function paraTela(estado, eu) {
  const chave = chavePessoa(eu);
  const num = (v) => Number(v);
  const pedidos = estado.pedidos.map((p) => ({ ...p, linhas: p.linhas.map((l) => ({ ...l, valor: num(l.valor) })) }));
  const aberto = pedidos.find((p) => !p.encerradoEm)?.numero ?? null;
  const meus = pedidos.flatMap((p) => p.linhas.filter((l) => l.chave === chave)
    .map(({ id, descricao, valor, quantidade }) => ({ id, pedido: p.numero, descricao, valor, quantidade })));
  const grupos = estado.grupos.map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, valor: num(i.valor) })) }));
  if (ehAdmin(eu)) return { admin: true, publicada: estado.publicada, aberto, grupos, pedidos, meus };
  return {
    admin: false, aberto, meus,
    grupos: grupos.filter((g) => g.visivel).map((g) => ({ ...g, itens: g.itens.filter((i) => i.visivel) })).filter((g) => g.itens.length),
  };
}

export async function respostaGuias(eu) {
  await exigirAba(eu);
  return paraTela(await db.rpc('guias_estado'), eu);
}

function texto(v, oque, max) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!s) throw new HttpError(400, `Informe ${oque}.`);
  if (s.length > max) throw new HttpError(400, `${oque[0].toUpperCase() + oque.slice(1)} pode ter até ${max} letras.`);
  return s;
}
function inteiro(v, oque, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${oque} inválida (de ${min} a ${max}).`);
  return n;
}
function valor(v) {
  const n = Number(String(v ?? '').replace(/\s|R\$/g, '').replace(',', '.'));
  if (String(v ?? '').trim() === '' || !Number.isFinite(n) || n < 0 || n > 100000) throw new HttpError(400, 'Valor inválido.');
  return Math.round(n * 100) / 100;
}
function foto(v) {
  if (v === null || v === '') return null;
  const buf = typeof v === 'string' && v.length <= 200000 ? Buffer.from(v, 'base64') : null;
  if (!buf || buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new HttpError(400, 'Foto inválida (envie uma imagem JPEG pequena).');
  return v;
}
const booleano = (v, oque) => {
  if (typeof v !== 'boolean') throw new HttpError(400, `Informe se ${oque}.`);
  return v;
};

export async function acaoGuias(eu, b) {
  await exigirAba(eu);
  if (b.op === 'pedir') {
    const estado = await db.rpc('guia_pedir', {
      itemId: validarId(b.itemId, 'Item'), quantidade: inteiro(b.quantidade, 'Quantidade', 1, 999), chave: chavePessoa(eu), nome: eu.nome,
    });
    return paraTela(estado, eu);
  }
  if (!ehAdmin(eu)) throw new HttpError(403, 'Só quem administra a aba Compras pode fazer isso.');
  let estado;
  switch (b.op) {
    case 'publicar':
      await db.rpc('guias_publicar', { publicada: booleano(b.publicada, 'a aba fica visível') });
      estado = await db.rpc('guias_estado');
      break;
    case 'grupo': {
      const p = {};
      if (b.id) p.id = validarId(b.id, 'Grupo');
      if (!b.id || 'descricao' in b) p.descricao = texto(b.descricao, 'a descrição do grupo', 80);
      if ('visivel' in b) p.visivel = booleano(b.visivel, 'o grupo fica visível');
      estado = await db.rpc('guia_grupo_salvar', p);
      break;
    }
    case 'excluirGrupo':
      estado = await db.rpc('guia_grupo_excluir', { id: validarId(b.id, 'Grupo') });
      break;
    case 'item': {
      const novo = !b.id;
      const p = novo ? { grupoId: validarId(b.grupoId, 'Grupo') } : { id: validarId(b.id, 'Item') };
      if (novo || 'descricao' in b) p.descricao = texto(b.descricao, 'a descrição do item', 120);
      if (novo || 'quantidade' in b) p.quantidade = inteiro(b.quantidade, 'Quantidade', 0, 9999);
      if (novo || 'valor' in b) p.valor = valor(b.valor);
      if ('foto' in b) p.foto = foto(b.foto);
      if ('visivel' in b) p.visivel = booleano(b.visivel, 'o item fica visível');
      estado = await db.rpc('guia_item_salvar', p);
      break;
    }
    case 'excluirItem':
      estado = await db.rpc('guia_item_excluir', { id: validarId(b.id, 'Item') });
      break;
    case 'cancelar':
      estado = await db.rpc('guia_linha_cancelar', { id: validarId(b.id, 'Pedido') });
      break;
    case 'ok':
      estado = await db.rpc('guia_linha_ok', { id: validarId(b.id, 'Pedido'), ok: booleano(b.ok, 'está ok') });
      break;
    case 'encerrar':
      estado = await db.rpc('guia_pedido_encerrar');
      break;
    case 'novo':
      estado = await db.rpc('guia_pedido_novo');
      break;
    default:
      throw new HttpError(400, 'Ação inválida.');
  }
  return paraTela(estado, eu);
}
