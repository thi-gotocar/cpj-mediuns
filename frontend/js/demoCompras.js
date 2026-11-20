// Modo demonstração (frontend/js/demo.js): aba Compras e aba ASAAS com dados inventados.
// Simula o caminho do Pix: Pedir gera um link de pagamento (QR desenhado aqui, código copia e cola de mentira);
// "Já paguei, atualizar" faz o papel do webhook do ASAAS e marca como pago; a aba ASAAS lê as mesmas cobranças e eventos.

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const horas = (n) => new Date(Date.now() + n * 3600e3).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const copia = (o) => JSON.parse(JSON.stringify(o));

export function criarCompras({ euChave, euNome, pessoas, ErroDemo }) {
  const nomeDe = (n) => pessoas.find((p) => p.id === id(n))?.nome || '';
  const chave = (n) => 'p:' + id(n);
  let seq = 5000;
  const novoId = () => id(++seq);
  // Aba ASAAS → Cartão de crédito: quem gera link com Pix ou cartão (uma pessoa de exemplo).
  const credito = [{ chave: chave(3), nome: nomeDe(3), aluno: false, em: new Date().toISOString(), por: 'Teste CPJ', cpf: '•••.•••.•••-42' }];

  const G1 = id(2001), G2 = id(2002), G3 = id(2003), G4 = id(2004);
  const grupos = [
    { id: G1, descricao: 'Guias', visivel: true, aberto: 3, itens: [
      { id: id(2101), descricao: 'Guia de Oxóssi (verde)', fotoV: null, quantidade: 6, valor: 35, visivel: true, cpj: false },
      { id: id(2102), descricao: 'Guia de Iemanjá (azul claro)', fotoV: null, quantidade: 4, valor: 35, visivel: true, cpj: false },
      { id: id(2103), descricao: 'Guia de Preto Velho (preta e branca)', fotoV: null, quantidade: 0, valor: 40, visivel: true, cpj: false },
      { id: id(2104), descricao: 'Doação para a casa', fotoV: null, quantidade: 99, valor: 20, visivel: true, cpj: false, doacao: true },
    ] },
    { id: G2, descricao: 'Roupas', visivel: true, aberto: 3, itens: [
      { id: id(2201), descricao: 'Camiseta branca CPJ', fotoV: null, quantidade: 12, valor: 45, visivel: true, cpj: true },
      { id: id(2202), descricao: 'Saia branca rodada', fotoV: null, quantidade: 5, valor: 80, visivel: true, cpj: false },
    ] },
    { id: G3, descricao: 'Velas e defumação', visivel: false, aberto: null, itens: [
      { id: id(2301), descricao: 'Kit 7 velas coloridas', fotoV: null, quantidade: 10, valor: 18, visivel: true, cpj: false },
    ] },
    // Axé: não entra na sub-aba Pedidos.
    { id: G4, descricao: 'Axé', visivel: true, aberto: 3, itens: [
      { id: id(2401), descricao: 'Axé da gira', fotoV: null, quantidade: 50, valor: 10, visivel: true, cpj: false },
    ] },
  ];
  const linha = (n, pedido, grupoId, itemId, quem, nome, quantidade, extra = {}) => {
    const g = grupos.find((x) => x.id === grupoId);
    const i = g.itens.find((x) => x.id === itemId);
    return { id: id(n), itemId, grupoId, descricao: `${g.descricao} · ${i.descricao}`, valor: i.valor, quantidade, chave: quem, nome,
      ok: false, criadoEm: horas(-30), pago: false, pix: null, andamento: 'pendente', ...extra };
  };
  const pedidos = [
    { numero: 3, criadoEm: horas(-72), encerradoEm: null,
      grupos: [{ grupoId: G1, criadoEm: horas(-72), encerradoEm: null }, { grupoId: G2, criadoEm: horas(-72), encerradoEm: null }, { grupoId: G4, criadoEm: horas(-72), encerradoEm: null }],
      linhas: [
        linha(2401, 3, G1, id(2101), chave(5), nomeDe(5), 1, { pago: true, ok: true, andamento: 'em_confeccao' }),
        linha(2402, 3, G2, id(2201), chave(5), nomeDe(5), 2, { pago: true, ok: true, andamento: 'concluido' }),
        linha(2403, 3, G1, id(2102), chave(6), nomeDe(6), 1, { pix: 'pendente' }),
        linha(2404, 3, G2, id(2202), chave(3), nomeDe(3), 1, { pix: 'vencida', andamento: 'falta_materia' }),
        linha(2405, 3, G1, id(2101), chave(7), nomeDe(7), 1),
        linha(2406, 3, G2, id(2201), euChave, euNome, 1, { pix: 'pendente' }),
        linha(2407, 3, G1, id(2102), chave(1), nomeDe(1), 2),
        linha(2408, 3, G4, id(2401), chave(6), nomeDe(6), 1),
      ] },
    { numero: 2, criadoEm: horas(-24 * 40), encerradoEm: horas(-24 * 30),
      grupos: [{ grupoId: G3, criadoEm: horas(-24 * 40), encerradoEm: horas(-24 * 30) }],
      linhas: [
        linha(2501, 2, G3, id(2301), chave(1), nomeDe(1), 2, { pago: true, ok: true, andamento: 'entregue' }),
        linha(2502, 2, G3, id(2301), euChave, euNome, 1, { pago: true, ok: true, andamento: 'entregue' }),
      ] },
  ];

  // Cobranças (asaas_cobrancas) ligadas às linhas por cobrancaId.
  const cob = (n, linhas, status, extra = {}) => ({ id: id(n), linhas, status, asaasId: 'pay_demo' + n, criadoEm: horas(-28), pagoEm: null,
    vencimento: dia(2), link: null, ...extra });
  const cobrancas = [
    cob(2601, [id(2401), id(2402)], 'paga', { pagoEm: horas(-27) }),
    cob(2602, [id(2403)], 'pendente'),
    cob(2603, [id(2404)], 'vencida', { vencimento: dia(-1) }),
    cob(2604, [id(2406)], 'pendente', { criadoEm: horas(-2) }),
    cob(2605, [id(2501), id(2502)], 'paga', { criadoEm: horas(-24 * 35), pagoEm: horas(-24 * 35 + 1), vencimento: dia(-33) }),
  ];
  const eventos = [];
  const evento = (c, nomeEvento, statusAsaas, resultado, quando = new Date().toISOString()) => {
    eventos.unshift({ id: novoId(), evento: nomeEvento, recebidoEm: quando, resultado, paymentId: c.asaasId, valor: String(valorCob(c)), status: statusAsaas, cobrancaId: c.id });
  };
  const todasLinhas = () => pedidos.flatMap((p) => p.linhas.map((l) => ({ ...l, pedido: p.numero })));
  const linhasDe = (c) => todasLinhas().filter((l) => c.linhas.includes(l.id));
  const valorCob = (c) => (c.valorCancelado ?? linhasDe(c).reduce((s, l) => s + l.valor * l.quantidade, 0));
  cobrancas.forEach((c) => {
    evento(c, 'PAYMENT_CREATED', 'PENDING', 'Cobrança registrada.', c.criadoEm);
    if (c.status === 'paga') evento(c, 'PAYMENT_RECEIVED', 'RECEIVED', 'Conferido no ASAAS: marcado como pago.', c.pagoEm);
    if (c.status === 'vencida') evento(c, 'PAYMENT_OVERDUE', 'OVERDUE', 'Link vencido: a pessoa pode gerar outro.', horas(-10));
  });
  eventos.sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm));
  let ativo = true;
  let publicada = true;

  // QR de mentira (não paga nada), desenhado uma vez no navegador.
  let qr = null;
  function qrImagem() {
    if (qr !== null) return qr;
    try {
      const n = 29, t = 6, c = document.createElement('canvas');
      c.width = c.height = (n + 4) * t;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#000';
      let s = 7;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const quadro = (a, b) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if (i % 6 === 0 || j % 6 === 0 || (i > 1 && i < 5 && j > 1 && j < 5)) x.fillRect((a + i + 2) * t, (b + j + 2) * t, t, t); };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const emQuadro = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
        if (!emQuadro && rnd() < 0.48) x.fillRect((i + 2) * t, (j + 2) * t, t, t);
      }
      quadro(0, 0); quadro(n - 7, 0); quadro(0, n - 7);
      qr = c.toDataURL('image/png').split(',')[1];
    } catch { qr = ''; }
    return qr;
  }
  const payload = (c) => `00020126580014BR.GOV.BCB.PIX0136demo-cpj-${c.id.slice(-6)}5204000053039865406${valorCob(c).toFixed(2)}5802BR5913CASA PAI JOAO6009SAO PAULO62070503***6304DEMO`;

  // Situação de pagamento de cada linha, como o banco devolve (pago / pix).
  function sincronizar() {
    for (const p of pedidos) for (const l of p.linhas) {
      const c = [...cobrancas].reverse().find((x) => x.linhas.includes(l.id));
      if (!c) continue;
      l.pago = c.status === 'paga';
      l.pix = l.pago ? null : c.status;
    }
  }

  function tela() {
    sincronizar();
    const meus = todasLinhas().filter((l) => l.chave === euChave)
      .map(({ id: lid, descricao, valor, quantidade, pago, pix, pedido }) => ({ id: lid, pedido, descricao, valor, quantidade, pago, pix }));
    const minhas = cobrancas.filter((c) => linhasDe(c).some((l) => l.chave === euChave))
      .sort((a, b) => (b.status === 'pendente') - (a.status === 'pendente') || b.criadoEm.localeCompare(a.criadoEm))
      .map((c) => ({ id: c.id, pedido: linhasDe(c)[0]?.pedido, valor: valorCob(c), status: c.status, link: null,
        pixPayload: c.status === 'pendente' ? payload(c) : null, pixImagem: c.status === 'pendente' ? qrImagem() : null,
        vencimento: c.vencimento, criadoEm: c.criadoEm, pagoEm: c.pagoEm, itens: linhasDe(c).map((l) => `${l.quantidade}x ${l.descricao}`) }));
    return {
      admin: true, publicada, grupos: copia(grupos), pedidos: copia(pedidos), meus,
      ...(ativo ? { pix: true, pixPrecisaCpf: false, cobrancas: minhas } : { pix: false }),
    };
  }

  function gerarCobranca(linhas) {
    const c = cob(++seq, linhas.map((l) => l.id), 'pendente', { criadoEm: new Date().toISOString() });
    cobrancas.push(c);
    evento(c, 'PAYMENT_CREATED', 'PENDING', 'Cobrança registrada.');
    return c;
  }

  const acharItem = (itemId) => { for (const g of grupos) { const i = g.itens.find((x) => x.id === itemId); if (i) return { g, i }; } return {}; };
  const acharLinha = (lid) => { for (const p of pedidos) { const l = p.linhas.find((x) => x.id === lid); if (l) return { p, l }; } return {}; };

  function acaoGuias(b) {
    switch (b.op) {
      case 'publicar': publicada = !!b.publicada; break;
      case 'pedir': {
        const { g, i } = acharItem(b.itemId);
        const q = Math.floor(Number(b.quantidade) || 0);
        if (!i) throw new ErroDemo(404, 'Item não encontrado.');
        if (!g.aberto) throw new ErroDemo(409, 'O pedido deste grupo está encerrado.');
        // Doação: o valor digitado, quantidade 1, sem estoque.
        const doa = i.doacao ? Math.round(Number(b.valor) * 100) / 100 : 0;
        if (i.doacao && !(doa > 0)) throw new ErroDemo(400, 'Digite o valor da doação.');
        if (!i.doacao && (q < 1 || q > i.quantidade)) throw new ErroDemo(409, 'Quantidade maior que a disponível.');
        if (!i.doacao) i.quantidade -= q;
        const p = pedidos.find((x) => x.numero === g.aberto);
        const l = { id: novoId(), itemId: i.id, grupoId: g.id, descricao: `${g.descricao} · ${i.descricao}`, valor: i.doacao ? doa : i.valor, quantidade: i.doacao ? 1 : q,
          chave: euChave, nome: euNome, ok: false, criadoEm: new Date().toISOString(), pago: false, pix: null, andamento: 'pendente' };
        p.linhas.push(l);
        if (ativo) gerarCobranca([l]);
        break;
      }
      case 'pix': {
        const p = pedidos.find((x) => x.numero === Number(b.pedido));
        sincronizar();
        const soltas = (p?.linhas || []).filter((l) => l.chave === euChave && !l.pago && l.pix !== 'pendente');
        if (!soltas.length) throw new ErroDemo(409, 'Nada a pagar neste pedido.');
        gerarCobranca(soltas);
        break;
      }
      case 'ok': { const { l } = acharLinha(b.id); if (l) l.ok = !!b.ok; break; }
      case 'cancelar': {
        const { p, l } = acharLinha(b.id);
        if (!l) break;
        const { i } = acharItem(l.itemId);
        if (i) i.quantidade += l.quantidade;
        p.linhas = p.linhas.filter((x) => x.id !== l.id);
        cobrancas.forEach((c) => { if (c.linhas.includes(l.id) && c.status === 'pendente') { c.status = 'cancelada'; evento(c, 'PAYMENT_DELETED', 'DELETED', 'Link cancelado com o pedido.'); } });
        break;
      }
      case 'encerrar': {
        const g = grupos.find((x) => x.id === b.grupoId);
        const p = pedidos.find((x) => x.numero === g?.aberto);
        const pg = p?.grupos.find((x) => x.grupoId === g.id);
        if (pg) pg.encerradoEm = new Date().toISOString();
        if (g) g.aberto = null;
        break;
      }
      case 'novo': {
        const g = grupos.find((x) => x.id === b.grupoId);
        if (!g) break;
        const numero = Math.max(...pedidos.map((x) => x.numero)) + 1;
        const agora = new Date().toISOString();
        pedidos.unshift({ numero, criadoEm: agora, encerradoEm: null, grupos: [{ grupoId: g.id, criadoEm: agora, encerradoEm: null }], linhas: [] });
        g.aberto = numero;
        break;
      }
      case 'grupo': {
        const g = grupos.find((x) => x.id === b.id);
        if (!g) {
          grupos.push({ id: novoId(), descricao: String(b.descricao || 'Novo grupo').trim(), visivel: false, aberto: null, itens: [] });
          break;
        }
        if (b.descricao !== undefined) g.descricao = String(b.descricao).trim() || g.descricao;
        if (b.visivel !== undefined) g.visivel = !!b.visivel;
        break;
      }
      case 'item': {
        const atual = acharItem(b.id).i;
        const dados = {
          ...(b.descricao !== undefined ? { descricao: String(b.descricao).trim() } : {}),
          ...(b.quantidade !== undefined ? { quantidade: Math.max(0, Math.floor(Number(b.quantidade) || 0)) } : {}),
          ...(b.valor !== undefined ? { valor: Number(String(b.valor).replace(',', '.')) || 0 } : {}),
          ...(b.visivel !== undefined ? { visivel: !!b.visivel } : {}),
          ...(b.cpj !== undefined ? { cpj: !!b.cpj } : {}),
          ...(b.doacao !== undefined ? { doacao: !!b.doacao } : {}),
        };
        if (atual) { Object.assign(atual, dados); break; }
        const g = grupos.find((x) => x.id === b.grupoId);
        if (!g) throw new ErroDemo(404, 'Grupo não encontrado.');
        g.itens.push({ id: novoId(), descricao: '', quantidade: 0, valor: 0, visivel: true, cpj: false, fotoV: null, ...dados });
        break;
      }
      case 'excluirItem': grupos.forEach((g) => { g.itens = g.itens.filter((i) => i.id !== b.id); }); break;
      case 'excluirGrupo': {
        const i = grupos.findIndex((g) => g.id === b.id);
        if (i >= 0) grupos.splice(i, 1);
        break;
      }
      default: throw new ErroDemo(400, 'Modo demonstração: esta ação não é salva.');
    }
    return tela();
  }

  // "Já paguei, atualizar": aqui o webhook do ASAAS "chega" e o link pendente mais antigo de quem está logado vira pago.
  function lerGuias({ atualizar = false } = {}) {
    if (atualizar) {
      const c = cobrancas.filter((x) => x.status === 'pendente' && linhasDe(x).some((l) => l.chave === euChave))
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))[0];
      if (c) {
        c.status = 'paga';
        c.pagoEm = new Date().toISOString();
        evento(c, 'PAYMENT_RECEIVED', 'RECEIVED', 'Conferido no ASAAS: marcado como pago.');
      }
    }
    return tela();
  }

  // Pessoa, pedido, itens e grupos de uma cobrança (a cancelada, pelo que guardou).
  function porCobranca(c) {
    const nomeGrupo = Object.fromEntries(grupos.map((g) => [g.id, g.descricao]));
    const ls = linhasDe(c);
    if (!ls.length && c.itensCancelados) return { nome: c.nome || '', pedido: c.pedido, itens: c.itensCancelados, grupos: c.gruposCancelados || [] };
    return { nome: ls[0]?.nome || '', pedido: ls[0]?.pedido, itens: ls.map((l) => `${l.quantidade}x ${l.descricao}`),
      grupos: [...new Set(ls.map((l) => nomeGrupo[l.grupoId]).filter(Boolean))] };
  }
  function asaas() {
    sincronizar();
    const porCob = porCobranca;
    return {
      ativo,
      cobrancas: [...cobrancas].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((c) => ({
        id: c.id, ...porCob(c), valor: valorCob(c), status: c.status, asaasId: c.asaasId, link: null,
        vencimento: c.vencimento, criadoEm: c.criadoEm, pagoEm: c.pagoEm,
      })),
      eventos: eventos.map(({ cobrancaId, ...e }) => {
        const c = cobrancas.find((x) => x.id === cobrancaId);
        const d = c ? porCob(c) : {};
        return { ...e, nome: d.nome || null, pedido: d.pedido ?? null, itens: d.itens || [], descricao: c ? `CPJ · Compras · pedido nº ${d.pedido}` : '' };
      }),
      config: { chave: true, token: true, ambiente: 'Sandbox (testes)' },
      credito: [...credito].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      candidatos: pessoas.filter((p) => !p.saida && !credito.some((k) => k.chave === 'p:' + p.id)).map((p) => ({ chave: 'p:' + p.id, nome: p.nome, aluno: false })),
    };
  }

  function acaoAsaas(b) {
    if (b.op === 'ativar') ativo = !!b.ativo;
    else if (b.op === 'credito') {
      const i = credito.findIndex((k) => k.chave === b.chave);
      if (b.remover) { if (i >= 0) credito.splice(i, 1); }
      else if (i < 0) credito.push({ chave: b.chave, nome: pessoas.find((p) => 'p:' + p.id === b.chave)?.nome || '?', aluno: false, em: new Date().toISOString(), por: euNome, cpf: '' });
    }
    else if (b.op === 'cancelar') {
      const c = cobrancas.find((x) => x.id === b.id);
      if (c && c.status === 'pendente') {
        // Como no app: os itens da cobrança saem do pedido e o estoque volta; a cobrança guarda o que tinha.
        const d = porCobranca(c);
        Object.assign(c, { status: 'cancelada', itensCancelados: d.itens, gruposCancelados: d.grupos, nome: d.nome, pedido: d.pedido, valorCancelado: valorCob(c) });
        pedidos.forEach((p) => { p.linhas = p.linhas.filter((l) => {
          if (!c.linhas.includes(l.id)) return true;
          const item = grupos.flatMap((g) => g.itens).find((i) => i.id === l.itemId);
          if (item) item.quantidade += l.quantidade;
          return false;
        }); });
        evento(c, 'PAYMENT_DELETED', 'DELETED', 'Cobrança e itens cancelados na aba ASAAS.');
      }
    } else throw new ErroDemo(400, 'Modo demonstração: esta ação não é salva.');
    return asaas();
  }

  // Sub-aba Pedidos: uma linha por pedido (sem as doações), com o andamento; pendencias vem do bloco de atrasos da demo.
  function pedidosAndamento(pendencias) {
    sincronizar();
    const doacao = new Set(grupos.flatMap((g) => g.itens.filter((i) => i.doacao).map((i) => i.id)));
    const nomeGrupo = (gid) => grupos.find((g) => g.id === gid)?.descricao || null;
    const axe = (gid) => (nomeGrupo(gid) || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'axe';
    return {
      pedidos: todasLinhas().filter((l) => !doacao.has(l.itemId) && !axe(l.grupoId))
        .map(({ id: lid, pedido, descricao, quantidade, valor, chave: ch, nome, pago, andamento, itemId, grupoId }) => ({ id: lid, pedido, descricao, quantidade, valor, chave: ch, nome, pago, andamento,
          itemId, fotoV: grupos.flatMap((g) => g.itens).find((i) => i.id === itemId)?.fotoV || null, grupoId, grupo: nomeGrupo(grupoId) })),
      pendencias, pendenciasEm: new Date().toISOString(),
    };
  }
  function andamento(b, pendencias) {
    const { l } = acharLinha(b.id);
    if (!l) throw new ErroDemo(404, 'Pedido não encontrado.');
    if (!['pendente', 'em_confeccao', 'falta_materia', 'concluido', 'entregue'].includes(b.andamento)) throw new ErroDemo(400, 'Andamento inválido.');
    l.andamento = b.andamento;
    return pedidosAndamento(pendencias);
  }

  return { lerGuias, acaoGuias, asaas, acaoAsaas, pedidos: pedidosAndamento, andamento };
}
