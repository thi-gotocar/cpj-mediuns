// Aba Compras (rota: GET /api/oferendas?lista=guias · POST /api/oferendas { acao: 'guias', op, ... }).
//   qualquer logado (bloco da fila na Geral): doar { itemId, valor, cpf? } — veja respostaDoacoes
//   todos:  pedir { itemId, quantidade, valor? }  — no pedido aberto do grupo do item, sem passar do disponível
//           (item de doação: valor digitado pela pessoa, quantidade 1, sem estoque)
//           (com o Pix ligado, pedir { ..., cpf? } já gera o link de pagamento; pix { pedido, cpf? } tenta de novo — veja api/_lib/asaas.js)
//   admin:  publicar { publicada } · grupo { id?, descricao?, visivel? } · excluirGrupo { id }
//           item { id?, grupoId, descricao?, foto? (base64 JPEG | null tira), quantidade?, valor?, visivel?, cpj?, doacao? (cobrado na conta B) } · excluirItem { id }
//           cancelar { id } (a quantidade volta para o item) · encerrar { grupoId } · novo { grupoId } (próximo número)
//           andamento { id, andamento } → o mesmo de GET ?lista=pedidos
// Sub-aba Pedidos (só quem administra a aba Compras): GET /api/oferendas?lista=pedidos
//   → { pedidos: [{ id, pedido, descricao, quantidade, valor, chave, nome, pago, andamento, itemId, fotoV, grupoId, grupo }], pendencias: { chave: total }, pendenciasEm }
//   Uma entrada por linha (as doações e o grupo Axé ficam de fora). pendencias: o total vencido no ASAAS de cada pessoa, da última leitura
//   do bloco CPJ - Pgto atrasado (não chama o ASAAS aqui).
// Cada grupo tem o seu pedido (grupos[].aberto = número do pedido aberto ou null). pedidos[].grupos diz quais grupos
// o pedido atende e quando cada um encerrou; as linhas trazem o grupoId.
// Quem não administra vê só os grupos e itens visíveis e as próprias linhas (meus), nunca os pedidos dos outros.
// Item CPJ (cpj): só quem está cadastrado na corrente vê e pede; os outros nem recebem o item.

import { db } from './db.js';
import { HttpError, validarId } from './http.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { pixDaPessoa, pixDe, gerarPix, pixAntesDePedir, configurado, conferirReservas } from './asaas.js';

const ehAdmin = (eu) => pode(eu, 'guias:gerenciar');
// Cadastrada na corrente: a sessão está ligada a uma pessoa (acesso cpj, e-mail ou curimba ligados à pessoa).
// Alunos e usuários sem pessoa ficam de fora.
const daCorrente = (eu) => !!eu.pessoaId;
const podeVerItem = (eu, i) => i.visivel && (!i.cpj || daCorrente(eu));

// Sem a aba no perfil, ou com a aba desligada e sem administrar: não entra.
// Como no Perfil: quem entra pela corrente (acesso cpj) ou como aluno só usa a aba depois de criar a senha
// (sem ela, o login é só pelo nome e qualquer um pediria em nome de outra pessoa).
export const semSenha = (eu) => (eu.papel === 'corrente' || eu.grupo === 'alunos') && !eu.temSenha;
function exigirSenha(eu) {
  if (semSenha(eu) && !ehAdmin(eu)) throw new HttpError(403, 'Crie a sua senha para usar a aba Compras.');
}

async function exigirAba(eu) {
  if (!pode(eu, 'guias:pedir') && !ehAdmin(eu)) throw new HttpError(403, 'Seu perfil não tem a aba Compras.');
  exigirSenha(eu);
  if (!ehAdmin(eu) && !(await db.rpc('guias_publicada'))) throw new HttpError(403, 'A aba Compras não está disponível no momento.');
}

function paraTela(estado, eu) {
  const chave = chavePessoa(eu);
  const num = (v) => Number(v);
  const pedidos = estado.pedidos.map((p) => ({ ...p, linhas: p.linhas.map((l) => ({ ...l, valor: num(l.valor) })) }));
  const meus = pedidos.flatMap((p) => p.linhas.filter((l) => l.chave === chave)
    .map(({ id, descricao, valor, quantidade, pago, pix }) => ({ id, pedido: p.numero, descricao, valor, quantidade, pago, pix })));
  const grupos = estado.grupos.map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, valor: num(i.valor) })) }));
  if (ehAdmin(eu)) return { admin: true, publicada: estado.publicada, grupos, pedidos, meus };
  return {
    admin: false, meus,
    grupos: grupos.filter((g) => g.visivel).map((g) => ({ ...g, itens: g.itens.filter((i) => podeVerItem(eu, i)) })).filter((g) => g.itens.length),
  };
}

// Estado da aba: quem não administra recebe do banco só os próprios pedidos e linhas (o histórico de todos fica de fora).
const estadoPara = (eu) => db.rpc('guias_estado', ehAdmin(eu) ? {} : { chave: chavePessoa(eu) });

// Estado da tela e Pix da pessoa numa ida só ao banco (guias_tela), depois de pedir ou gerar o link.
async function telaCompleta(eu) {
  const t = await db.rpc('guias_tela', { chave: chavePessoa(eu), admin: ehAdmin(eu) });
  return { ...paraTela(t.estado, eu), ...pixDe(t.ativo, t.minhas) };
}

// Abertura da aba: tudo numa ida só ao banco (guias_tela). Só volta ao banco (e ao ASAAS) se houver um link que
// ficou sem resposta do ASAAS numa tentativa anterior, para conferir (sem travar a tela se falhar).
export async function respostaGuias(eu) {
  if (!pode(eu, 'guias:pedir') && !ehAdmin(eu)) throw new HttpError(403, 'Seu perfil não tem a aba Compras.');
  exigirSenha(eu);
  const chave = chavePessoa(eu);
  const p = { chave, admin: ehAdmin(eu) };
  let t = await db.rpc('guias_tela', p);
  if (!ehAdmin(eu) && !t.publicada) throw new HttpError(403, 'A aba Compras não está disponível no momento.');
  if (configurado() && t.ativo && t.paradas) {
    try {
      await conferirReservas(chave);
      t = await db.rpc('guias_tela', p);
    } catch (e) { console.error('[asaas] conferir ao abrir', e?.message || e); }
  }
  return { ...paraTela(t.estado, eu), ...pixDe(t.ativo, t.minhas) };
}

// Foto de um item: o JPEG puro, com cache longo (o endereço muda quando a foto muda: ?v=). Sem sessão, porque a
// tag <img> não manda o token; o id do item não dá para adivinhar e a foto é só a do produto à venda.
export async function fotoGuia(req, res) {
  const id = validarId(req.query.id, 'Item');
  const b64 = await db.rpc('guia_foto', { id });
  if (!b64) throw new HttpError(404, 'Foto não encontrada.');
  const buf = Buffer.from(b64, 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(buf.length));
  // s-maxage: a Vercel também guarda e entrega a foto a todos, sem chamar a função nem acordar o banco (o endereço
  // com ?v= muda quando a foto muda, então nunca fica foto velha).
  res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'public, max-age=300');
  res.end(buf);
}

export const ANDAMENTOS = ['pendente', 'em_confeccao', 'falta_materia', 'concluido', 'entregue'];

// Total vencido de cada pessoa (chave p:/a:), pela última leitura das duas contas do ASAAS.
async function pendenciasPorChave() {
  const s = await db.rpc('atrasos_ler');
  const total = {};
  for (const i of s.itens || []) {
    const chave = i.pessoaId ? 'p:' + i.pessoaId : i.alunoId ? 'a:' + i.alunoId : null;
    if (chave) total[chave] = Math.round(((total[chave] || 0) + Number(i.valor || 0)) * 100) / 100;
  }
  return { pendencias: total, pendenciasEm: s.atualizadoEm || null };
}

async function telaPedidos(pedidos) {
  const [pend, materia] = await Promise.all([pendenciasPorChave(), db.rpc('compras_materia_listar')]);
  return { pedidos: pedidos.map((l) => ({ ...l, valor: Number(l.valor) })), ...pend, materia };
}

export async function respostaPedidos(eu) {
  if (!ehAdmin(eu)) throw new HttpError(403, 'Só quem administra a aba Compras vê os pedidos.');
  return telaPedidos(await db.rpc('guias_pedidos_andamento'));
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

// ---------- doação pelo bloco da fila na aba Geral ----------
// Qualquer pessoa logada doa: sem senha, sem a aba Compras no perfil e mesmo com a aba desligada (doar em nome de
// outra pessoa não tira nada de ninguém). Só os itens de doação visíveis, num grupo visível e com o pedido aberto;
// o resto das Compras (venda, pedidos, painel) continua com as travas de sempre. O Pix é o mesmo (conta B).
// GET ?lista=doacoes → { itens: [{ id, descricao, valor }], pix, pixPrecisaCpf?, cobrancas? }
// POST { acao: 'guias', op: 'doar', itemId, valor, cpf? } → o mesmo, com aviso se o ASAAS falhou.
export async function respostaDoacoes(eu) {
  const t = await db.rpc('guias_tela', { chave: chavePessoa(eu), admin: false });
  const itens = t.estado.grupos.filter((g) => g.visivel && g.aberto)
    .flatMap((g) => g.itens.filter((i) => i.doacao && podeVerItem(eu, i)).map((i) => ({ id: i.id, descricao: i.descricao, valor: Number(i.valor) })));
  return { itens, ...pixDe(t.ativo, t.minhas) };
}

async function doar(eu, b) {
  const itemId = validarId(b.itemId, 'Item');
  if (!(await respostaDoacoes(eu)).itens.some((i) => i.id === itemId)) throw new HttpError(400, 'Esta doação não está disponível no momento.');
  const v = valor(b.valor);
  if (v <= 0) throw new HttpError(400, 'Informe o valor da doação.');
  const pix = await pixAntesDePedir(eu, b.cpf);
  const feito = await db.rpc('guia_pedir', { itemId, quantidade: 1, valor: v, chave: chavePessoa(eu), nome: eu.nome });
  let aviso;
  if (pix) {
    try {
      await gerarPix(eu, { pedido: feito.pedidoFeito, cpf: b.cpf });
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('[asaas] doar', e);
      aviso = 'Doação registrada, mas o Pix não foi gerado' + (e instanceof HttpError ? ': ' + e.message.replace(/[.!]?$/, '.') : '.') + ' Tente de novo mais tarde.';
    }
  }
  return { ...(await respostaDoacoes(eu)), ...(aviso ? { aviso } : {}) };
}

export async function acaoGuias(eu, b) {
  if (b.op === 'doar') return doar(eu, b);
  await exigirAba(eu);
  if (b.op === 'pedir') {
    const p = { itemId: validarId(b.itemId, 'Item'), quantidade: inteiro(b.quantidade, 'Quantidade', 1, 999), chave: chavePessoa(eu), nome: eu.nome };
    // Item de doação: o valor que a pessoa digitou (com centavos); nos outros itens o banco usa o preço do item.
    if (b.valor !== undefined && b.valor !== null && b.valor !== '') p.valor = valor(b.valor);
    if (!daCorrente(eu)) {
      const item = (await estadoPara(eu)).grupos.flatMap((g) => g.itens).find((i) => i.id === p.itemId);
      if (item?.cpj) throw new HttpError(400, 'Este item não está disponível.');
    }
    const pix = await pixAntesDePedir(eu, b.cpf);
    const feito = await db.rpc('guia_pedir', p);
    // Com o Pix ligado, o pedido já gera o link de pagamento. Se o ASAAS falhar, o pedido fica
    // e a tela mostra "Gerar link de pagamento" para tentar de novo.
    let aviso;
    if (pix) {
      try {
        await gerarPix(eu, { pedido: feito.pedidoFeito, cpf: b.cpf });
      } catch (e) {
        if (!(e instanceof HttpError)) console.error('[asaas] pedir', e);
        aviso = 'Pedido feito, mas o link de pagamento não foi gerado' + (e instanceof HttpError ? ': ' + e.message.replace(/[.!]?$/, '.') : '.') + ' Toque em Gerar link de pagamento.';
      }
    }
    return { ...(await telaCompleta(eu)), ...(aviso ? { aviso } : {}) };
  }
  if (b.op === 'pix') {
    await gerarPix(eu, b);
    return telaCompleta(eu);
  }
  if (!ehAdmin(eu)) throw new HttpError(403, 'Só quem administra a aba Compras pode fazer isso.');
  // Lista de compras da matéria-prima (sub-aba Pedidos): devolve só a lista.
  if (b.op === 'materiaIncluir') {
    const descricao = texto(b.descricao, 'o que comprar', 80);
    const quantidade = Number(String(b.quantidade ?? '').replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 99999) throw new HttpError(400, 'Quantidade inválida.');
    return { materia: await db.rpc('compras_materia_incluir', { descricao, quantidade: Math.round(quantidade * 100) / 100 }) };
  }
  if (b.op === 'materiaMarcar') return { materia: await db.rpc('compras_materia_marcar', { id: validarId(b.id, 'Item'), comprado: b.comprado === true }) };
  if (b.op === 'materiaExcluir') return { materia: await db.rpc('compras_materia_excluir', { id: validarId(b.id, 'Item') }) };
  if (b.op === 'andamento') {
    if (!ANDAMENTOS.includes(b.andamento)) throw new HttpError(400, 'Andamento inválido.');
    return telaPedidos(await db.rpc('guia_linha_andamento', { id: validarId(b.id, 'Pedido'), andamento: b.andamento }));
  }
  // O Pix de quem administra não muda com estas ações: vai ao banco junto com a gravação, não depois.
  const [estado, pixAdmin] = await Promise.all([gravarAdmin(b), pixDaPessoa(eu)]);
  return { ...paraTela(estado, eu), ...pixAdmin };
}

async function gravarAdmin(b) {
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
      if ('cpj' in b) p.cpj = booleano(b.cpj, 'o item é só da corrente');
      if ('doacao' in b) p.doacao = booleano(b.doacao, 'o item é doação (conta B)');
      estado = await db.rpc('guia_item_salvar', p);
      break;
    }
    case 'excluirItem':
      estado = await db.rpc('guia_item_excluir', { id: validarId(b.id, 'Item') });
      break;
    case 'cancelar':
      estado = await db.rpc('guia_linha_cancelar', { id: validarId(b.id, 'Pedido') });
      break;
    case 'encerrar':
      estado = await db.rpc('guia_pedido_encerrar', { grupoId: validarId(b.grupoId, 'Grupo') });
      break;
    case 'novo':
      estado = await db.rpc('guia_pedido_novo', { grupoId: validarId(b.grupoId, 'Grupo') });
      break;
    default:
      throw new HttpError(400, 'Ação inválida.');
  }
  return estado;
}
