// E-book "A Linha da Esquerda na Umbanda": popup de venda, cobrança no ASAAS (conta A) e download com marca d'água.
//   GET  /api/oferendas?lista=ebook[&conferir=1]   a compra de quem está logado; conferir=1 pergunta ao ASAAS se o link pendente já foi pago
//   GET  /api/oferendas?lista=ebookAdmin           Admin root: popup, PDF guardado e as compras
//   POST /api/oferendas { acao: 'ebook', op, ... }
//     todos: pagar { nome, email, cpf? } · cancelar (antes de pagar) · baixar → o PDF (application/pdf), uma vez
//     root:  popup { visivel } · liberar { id } (mais um download) · pdfParte { versao, parte, dados (base64) } · pdfUsar { versao, partes, nome }
// Comprar e baixar seguem a regra da aba Compras: quem entra pelo nome (corrente e alunos) precisa ter senha.
import { HttpError, validarId } from './http.js';
import { db } from './db.js';
import { pode } from '../../shared/permissoes.js';
import { chavePessoa } from '../../shared/ervas.js';
import { EBOOK, EBOOK_PARTE, EBOOK_MAX, emailValidoEbook, textosMarca } from '../../shared/ebook.js';
import { configurado as asaasConfigurado, cobrarAvulso, conferirPagamento, cancelarNoAsaas, conferirReservas } from './asaas.js';
import { semSenha } from './guias.js';
import { marcarPdf, paginasPdf, ErroPdf } from './ebookPdf.js';

const ehRoot = (eu) => pode(eu, 'usuarios:gerenciar');
function exigirSenha(eu) {
  if (semSenha(eu) && !ehRoot(eu)) throw new HttpError(403, 'Crie a sua senha para comprar e baixar o e-book.');
}

async function tela(eu) {
  const t = await db.rpc('ebook_tela', { chave: chavePessoa(eu) });
  return { ...t, valor: EBOOK.valor, titulo: EBOOK.titulo, pagamento: asaasConfigurado(), semSenha: semSenha(eu) && !ehRoot(eu) };
}

export async function respostaEbook(eu, query) {
  const chave = chavePessoa(eu);
  if (query.conferir && !eu.verComo) {
    await conferirReservas(chave).catch(() => {});
    for (const p of await db.rpc('ebook_pendentes', { chave })) {
      try { await conferirPagamento(p.asaasId); } catch (e) { console.error('[ebook] conferir', p.asaasId, e?.message || e); }
    }
  }
  return tela(eu);
}

function texto(v, oque, min = 3, max = 120) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `Informe ${oque}.`);
  return s;
}

async function pagar(eu, b) {
  exigirSenha(eu);
  if (!asaasConfigurado()) throw new HttpError(503, 'O pagamento ainda não está configurado. Fale com a casa.');
  const chave = chavePessoa(eu);
  const nome = texto(b.nome, 'o nome completo');
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!emailValidoEbook(email) || email.length > 120) throw new HttpError(400, 'Informe um e-mail válido.');
  await db.rpc('ebook_dados', { chave, nome, email });
  await conferirReservas(chave, true);
  const r = await db.rpc('ebook_cobranca_reservar', { chave, nome: eu.nome, valor: EBOOK.valor });
  if (!r.existe) await cobrarAvulso(eu, chave, r, EBOOK.descricao, b);
  return tela(eu);
}

// O PDF guardado (pedaços em base64, lidos ao mesmo tempo).
async function pdfOriginal(meta) {
  if (!meta?.versao) throw new HttpError(503, 'O e-book ainda não foi enviado. Fale com a casa.');
  const partes = await Promise.all(Array.from({ length: meta.partes }, (_, parte) => db.rpc('ebook_pdf_parte', { versao: meta.versao, parte })));
  if (partes.some((x) => typeof x !== 'string')) throw new HttpError(503, 'O arquivo do e-book está incompleto. Fale com a casa.');
  return Buffer.concat(partes.map((x) => Buffer.from(x, 'base64')));
}
const dataBR = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(iso ? new Date(iso) : new Date());

// Monta o PDF com a marca antes de contar o download: se algo falhar aqui, a pessoa não perde a vez.
async function baixar(eu, res) {
  exigirSenha(eu);
  if (eu.verComo) throw new HttpError(403, 'No "Ver como" o download não é feito.');
  const chave = chavePessoa(eu);
  const c = await db.rpc('ebook_download', { chave });
  const t = textosMarca({ nome: c.nome, email: c.email, id: c.id, data: dataBR(c.pagoEm) });
  const pdf = marcarPdf(await pdfOriginal(c.pdf), { ...t, info: { Title: EBOOK.titulo, Subject: t.rodape, Keywords: `compra ${c.id}` } });
  await db.rpc('ebook_download', { chave, consumir: true });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(pdf.length));
  res.setHeader('Content-Disposition', `attachment; filename="${EBOOK.arquivo}"`);
  res.end(pdf);
}

// ---------- Admin root ----------
export async function respostaEbookAdmin(eu) {
  if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root.');
  return db.rpc('ebook_admin');
}

const VERSAO = /^[0-9a-z]{8,32}$/;
async function pdfUsar(b) {
  const versao = String(b.versao || '');
  const partes = Number(b.partes);
  if (!VERSAO.test(versao) || !Number.isInteger(partes) || partes < 1 || partes > Math.ceil(EBOOK_MAX / EBOOK_PARTE)) throw new HttpError(400, 'Envio inválido.');
  const pedacos = await db.rpc('ebook_pdf_juntar', { versao });
  if (pedacos.length !== partes) throw new HttpError(400, 'O envio do PDF ficou incompleto. Envie de novo.');
  const pdf = Buffer.concat(pedacos.map((x) => Buffer.from(x, 'base64')));
  if (pdf.length > EBOOK_MAX) throw new HttpError(400, 'O PDF passa de 4 MB.');
  // Confere que a marca funciona neste arquivo (senão o download falharia para quem pagou).
  let paginas;
  try {
    paginas = paginasPdf(pdf);
    marcarPdf(pdf, { marca: 'Teste · teste@exemplo.com', rodape: 'Teste' });
  } catch (e) {
    throw new HttpError(400, e instanceof ErroPdf ? e.message : 'Não consegui ler este PDF.');
  }
  const nome = String(b.nome || EBOOK.arquivo).slice(0, 120);
  return db.rpc('ebook_pdf_usar', { meta: { versao, partes, nome, tamanho: pdf.length, paginas, enviadoEm: new Date().toISOString() } });
}

export async function acaoEbook(eu, b, res) {
  const chave = chavePessoa(eu);
  switch (b.op) {
    case 'pagar': return pagar(eu, b);
    case 'cancelar': {
      exigirSenha(eu);
      const r = await db.rpc('ebook_cancelar', { chave });
      for (const p of r.pendentes) await cancelarNoAsaas(p);
      return tela(eu);
    }
    case 'baixar': return baixar(eu, res);
  }
  if (!ehRoot(eu)) throw new HttpError(403, 'Só o admin root pode fazer isso.');
  switch (b.op) {
    case 'popup': return db.rpc('ebook_popup_salvar', { visivel: b.visivel === true });
    case 'liberar': return db.rpc('ebook_liberar', { id: validarId(b.id, 'Compra') });
    case 'pdfParte': {
      const versao = String(b.versao || '');
      const parte = Number(b.parte);
      const dados = String(b.dados || '');
      if (!VERSAO.test(versao) || !Number.isInteger(parte) || parte < 0 || parte >= Math.ceil(EBOOK_MAX / EBOOK_PARTE)) throw new HttpError(400, 'Envio inválido.');
      if (!dados || dados.length > Math.ceil(EBOOK_PARTE / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+=*$/.test(dados)) throw new HttpError(400, 'Pedaço do PDF inválido.');
      return db.rpc('ebook_pdf_enviar', { versao, parte, dados });
    }
    case 'pdfUsar': return pdfUsar(b);
  }
  throw new HttpError(400, 'Ação inválida.');
}
