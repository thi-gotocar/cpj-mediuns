// Modo demonstração: login teste@cpj.com / 12345678. Tudo roda aqui no navegador, com dados inventados em memória;
// nada vai para o backend. Recarregar a página volta os dados ao início.
// A escala (presença, sorteio, publicar, encerrar) funciona de verdade, com as mesmas regras de shared/regras.js;
// as outras gravações respondem com o aviso de demonstração.

import { sortear, remanejar, encerrar, reabrir, giraVazia, retratoDaGira } from '/shared/regras.js';
import { PERMISSOES_ROOT, PERFIS_PADRAO, PERMISSOES_GRUPO, permissoesDe } from '/shared/permissoes.js';
import { TIPOS_EVENTO } from '/shared/eventos.js';
import { calcularPedidos } from '/shared/ervas.js';
import { normalizarPerfil, contagemPerfis, pessoasPorOrixaCabeca } from '/shared/perfil.js';
import { pctItens } from '/shared/iemanja.js';
import { normalizarDia } from '/shared/diario.js';

import { DEMO_EMAIL, AVISO_DEMO } from './auth.js';
import { criarCompras } from './demoCompras.js';

class ErroDemo extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const copia = (o) => JSON.parse(JSON.stringify(o));
// Sábado desta semana (ou o próximo) e os anteriores, de 7 em 7 dias.
const proximoSabado = (() => { const d = new Date(); return (6 - d.getDay() + 7) % 7; })();

const CONFIG = {
  responsavel: 'Ana', dirigente: 'Mãe Lúcia', sugestao: 'Ana/Mãe Lúcia',
  saudacao: '*Bom dia corrente* ✨', saudacao2: '_Boa semana para nós_', encerramento: 'Contamos com vocês. Axé! 🙏',
};

const P = (n, nome, funcao, extra = {}) => ({
  id: id(n), nome, funcao, experiente: false, linhas: null, limpeza: (n % 3) + 1, entrada: '2024-01-01', saida: null,
  licencas: [], guiasAtendimento: {}, guiaChefe: null, guiaFrente: null, afinidadeExtra: [], afinidadePasse: [], aniversario: null, ...extra,
});
const EU_ID = id(9);

const db = {
  pessoas: [
    P(1, 'Mãe Lúcia', 'medium', { experiente: true, guiaChefe: 'preto-velho', guiaFrente: 'caboclo' }),
    P(2, 'Rafael Moura', 'medium', { experiente: true, guiaChefe: 'exu' }),
    P(3, 'Juliana Prado', 'medium', { guiaChefe: 'cigano', aniversario: dia(3).slice(5) }),
    P(4, 'Marcos Lima', 'medium', { guiaChefe: 'baiano' }),
    P(5, 'Beatriz Souza', 'cambone', { experiente: true }),
    P(6, 'Carla Mendes', 'cambone'),
    P(7, 'Diego Alves', 'cambone'),
    P(8, 'Fernanda Rocha', 'cambone', { licencas: [{ id: id(901), inicio: dia(-2), fim: dia(20), motivo: 'Viagem' }] }),
    P(9, 'Teste CPJ', 'cambone'),
    P(10, 'Gustavo Reis', 'passe', { linhas: ['preto-velho', 'caboclo'] }),
    P(11, 'Helena Castro', 'passe', { linhas: ['caboclo'] }),
    P(12, 'Igor Nunes', 'extra', { linhas: ['exu', 'pomba-gira'] }),
    P(13, 'Larissa Pinto', 'senha'),
    P(14, 'Pedro Tavares', 'curimba'),
  ],
  giras: [],
  perfis: {},
  eventos: [
    { id: id(301), data: dia(proximoSabado), nome: 'Gira de Caboclo', tipo: 'gira' },
    { id: id(302), data: dia(proximoSabado + 14), nome: 'Amaci de Logunã', tipo: 'amaci' },
    { id: id(304), data: dia(-28), nome: 'Amaci de Oxalá (1ª aula)', tipo: 'amaci' },
    { id: id(305), data: dia(-14), nome: 'Amaci de Oxalá (2ª aula)', tipo: 'amaci' },
    { id: id(306), data: dia(0), nome: 'Amaci de Oxalá (3ª aula)', tipo: 'amaci' },
    { id: id(307), data: dia(-21), nome: 'Amaci de Oxalá (reposição)', tipo: 'amaci', retroativo: true },
    { id: id(303), data: dia(proximoSabado + 2), nome: 'Mutirão de limpeza do terreiro', tipo: 'aviso' },
  ],
  oracoes: [
    { id: id(401), texto: 'Pela saúde da minha avó Rosa.', criadoEm: new Date().toISOString(), expiraEm: dia(3), autor: 'p:' + id(6), autorNome: 'Carla Mendes', reacoes: ['p:' + id(1), 'p:' + id(5)] },
    { id: id(402), texto: 'Por um novo emprego para o meu irmão.', criadoEm: new Date().toISOString(), expiraEm: dia(3), autor: 'u:demo', autorNome: 'Teste CPJ', reacoes: [] },
  ],
  turmas: [{ id: id(501), nome: 'Turma 1' }, { id: id(502), nome: 'Turma 2' }],
  alunos: [
    { id: id(601), nome: 'Aline Ferreira', turmaId: id(501) },
    { id: id(602), nome: 'Bruno Costa', turmaId: id(501) },
    { id: id(603), nome: 'Cecília Ramos', turmaId: id(502), bloqueado: true },
  ],
  videos: [
    { id: id(701), data: dia(proximoSabado - 7), evento: 'Gira de Preto Velho', youtube: 'dQw4w9WgXcQ', classes: [] },
  ],
  curimba: {
    alunos: [{ id: id(801), nome: 'Pedro Tavares', pessoaId: id(14) }, { id: id(802), nome: 'Bruno Costa', pessoaId: null }],
    aulas: [{ id: id(811), data: dia(-5), nome: 'Toques de Ijexá' }, { id: id(812), data: dia(2), nome: 'Pontos de Caboclo' }],
    presencas: [{ aulaId: id(811), alunoId: id(801), status: 'p' }, { aulaId: id(811), alunoId: id(802), status: 'f' }],
  },
  ervas: [
    { id: id(1001), nome: 'Arruda', preco: 6, precoEstimado: 6, pessoasPorcao: null },
    { id: id(1002), nome: 'Guiné', preco: 8, precoEstimado: 8, pessoasPorcao: null },
    { id: id(1003), nome: 'Alecrim', preco: 5, precoEstimado: 5, pessoasPorcao: null },
    { id: id(1004), nome: 'Manjericão', preco: null, precoEstimado: null, pessoasPorcao: null },
  ],
  escolhas: [
    { chave: 'p:' + id(5), nome: 'Beatriz Souza', ervaId: id(1001), quantidade: 2 },
    { chave: 'p:' + id(5), nome: 'Beatriz Souza', ervaId: id(1003), quantidade: 1 },
    { chave: 'p:' + id(3), nome: 'Juliana Prado', ervaId: id(1002), quantidade: 1 },
  ],
  oferendas: [],
};

// Perfil (aba Perfil) de algumas pessoas.
const perfilDe = (orixa, chefe, frente, info = {}) => normalizarPerfil({
  orixas: { frente: { nome: orixa } }, guias: { chefe: { linha: chefe }, frente: { linha: frente } }, info,
});
db.perfis[id(1)] = perfilDe('Oxalá', 'preto-velho', 'caboclo', { nome: 'Lúcia Aparecida Santos' });
db.perfis[id(2)] = perfilDe('Ogum', 'exu', 'baiano');
db.perfis[id(3)] = perfilDe('Iansã', 'cigano', 'pomba-gira');
db.perfis[id(4)] = perfilDe('Xangô', 'baiano', '');
db.perfis[id(5)] = perfilDe('Oxum', '', '');
db.perfis[EU_ID] = perfilDe('Oxóssi', 'caboclo', '', { nome: 'Teste da Silva', email: DEMO_EMAIL, celular: '11912345678' });

db.oferendas = [{
  id: id(1101), titulo: 'Oferenda para Oxóssi', data: dia(proximoSabado + 7), status: 'publicado', abaId: id(1150),
  responsavelId: id(1), porMedium: false, noResumo: false, mediuns: [], grupos: [],
  itens: [
    { id: id(1111), nome: 'Milho verde', quantidade: 10, unidade: 'un', entrega: '', entregue: false, doacoes: [{ chave: 'p:' + id(5), nome: 'Beatriz Souza', quantidade: 4 }] },
    { id: id(1112), nome: 'Frutas variadas', quantidade: 3, unidade: 'kg', entrega: '', entregue: false, doacoes: [{ chave: 'p:' + EU_ID, nome: 'Teste CPJ', quantidade: 2 }] },
    { id: id(1113), nome: 'Vela verde', quantidade: 7, unidade: 'un', entrega: '', entregue: false, doacoes: [{ chave: 'p:' + id(2), nome: 'Rafael Moura', quantidade: 7 }] },
  ],
}, {
  // Uma linha por pessoa, com um item de Todos (cada pessoa da lista leva) e alguém do grupo Oferenda na lista.
  id: id(1102), titulo: 'Oferenda para Ogum', data: dia(proximoSabado + 14), status: 'publicado', abaId: id(1150),
  responsavelId: id(2), responsavel: 'Rafael Moura', porMedium: true, noResumo: false, grupos: ['medium'],
  mediuns: [
    { pessoaId: EU_ID, nome: 'Teste CPJ', pagamento: 'nao_pago', entrega: 'pendente' },
    { pessoaId: id(5), nome: 'Beatriz Souza', pagamento: 'pago', entrega: 'pendente' },
    { pessoaId: 'a:' + id(671), nome: 'Ivone Martins', pagamento: 'nao_pago', entrega: 'pendente', aluno: true },
  ],
  itens: [
    { id: id(1121), nome: 'Vela vermelha', quantidade: 1, unidade: 'unidade', entrega: '', entregue: false, todos: true, doacoes: [] },
    { id: id(1122), nome: 'Cerveja clara', quantidade: 2, unidade: 'garrafa', entrega: '', entregue: false, doacoes: [] },
  ],
}];
// Grupo Oferenda (cadastros pelo login que o admin pôs no grupo): fora da lista de alunos.
const GRUPO_OFERENDA = [{ id: id(671), nome: 'Ivone Martins' }];
const ABAS_OFERENDA = [{ id: id(1150), nome: 'Oferendas', visivel: true, detalhes: '', ordem: 0 }, { id: 'iemanja', nome: 'Iemanjá', iemanja: true, visivel: true, ordem: 1 }];

// Oferenda de Iemanjá: a pessoa de teste está no Grupo 1 e já assumiu itens (vista de quem participa, sem ser admin do evento).
const EU_CHAVE = 'p:' + EU_ID;
const nomeP = (n) => db.pessoas.find((p) => p.id === id(n)).nome;
const membro = (n) => ({ chave: 'p:' + id(n), nome: nomeP(n), fixo: false, lista: 'Corrente' });
const itemIem = (n, nome, categoria, quantidade, unidade, doacoes = []) => ({ id: id(n), nome, categoria, quantidade, unidade, entrega: '', entregue: false, doacoes });
const doa = (n, quantidade) => ({ chave: 'p:' + id(n), nome: nomeP(n), quantidade });
const iemanja = {
  id: id(1301), nome: 'Oferenda a Iemanjá', data: dia(proximoSabado + 42), visivel: true, sorteado: true, encerradoEm: null,
  fora: [], listas: [], categorias: ['Flores', 'Velas', 'Frutas', 'Barco'], admin: false,
  detalhes: 'Saída do terreiro às 5h30. Todos de branco.\nCada grupo monta o seu barquinho na praia.',
  grupos: [
    { id: id(1310), ordem: 1, nome: 'Grupo 1', responsavelId: id(2), responsavel: 'Rafael Moura', meu: true, abre: true,
      membros: [membro(9), membro(2), membro(6), membro(11)],
      itens: [
        itemIem(1321, 'Rosas brancas', 'Flores', 24, 'un', [doa(9, 12), doa(6, 12)]),
        itemIem(1322, 'Velas azul claro', 'Velas', 14, 'un', [doa(2, 7)]),
        itemIem(1323, 'Uvas verdes', 'Frutas', 2, 'kg', [doa(9, 1)]),
        itemIem(1324, 'Barquinho de madeira', 'Barco', 1, 'un', []),
      ] },
    { id: id(1311), ordem: 2, nome: 'Grupo 2', responsavelId: id(1), responsavel: 'Mãe Lúcia', meu: false, abre: false, membros: [],
      itens: [itemIem(1331, 'Palmas brancas', 'Flores', 12, 'un', [doa(1, 12)]), itemIem(1332, 'Perfume de alfazema', 'Barco', 2, 'un', [])] },
  ],
};
const transportesIem = [
  { id: id(1340), eventoId: id(1301), descricao: 'Van 1 · saída 5h30', responsavelId: id(2), responsavel: 'Rafael Moura',
    pessoas: [{ chave: EU_CHAVE, nome: 'Teste CPJ', lista: 'Corrente', pago: true, pulseira: false }, { chave: 'p:' + id(6), nome: 'Carla Mendes', lista: 'Corrente', pago: false, pulseira: false }] },
];
function respostaIemanja() {
  const ev = copia(iemanja);
  ev.grupos = ev.grupos.map((g) => ({ ...g, pct: pctItens(g.itens), ...(g.abre ? {} : { itens: [] }) }));
  return { eventos: [{ ...ev, transportes: copia(transportesIem) }], root: false, eu: { chave: EU_CHAVE }, publica: true };
}
function acaoIemanja(b) {
  if (b.op !== 'assumir') throw new ErroDemo(400, AVISO_DEMO);
  const g = iemanja.grupos.find((x) => x.itens.some((i) => i.id === b.itemId));
  if (!g?.meu) throw new ErroDemo(403, 'Só quem é do grupo assume este item.');
  const i = g.itens.find((x) => x.id === b.itemId);
  const q = Math.max(0, Number(b.quantidade) || 0);
  i.doacoes = i.doacoes.filter((d) => d.chave !== EU_CHAVE);
  if (q) i.doacoes.push(doa(9, q));
  return respostaIemanja();
}

// Amaci: a visão de quem aprende, com um orixá liberado (Pai Oxalá). Texto literal de api/_lib/amaciDados.js.
const AMACI_DEMO = {
  publicada: true, liberados: ['oxala'],
  orixas: [{
    k: 'oxala',
    ervas: [
      'Boldo, hortelã, manjericão, alecrim, sálvia, rosas brancas, mão de Deus, cipó cruz, alfazema, aniz estrelado, macela, camomila, malva, abre caminho.',
      'Outra opção: banho de água de coco - purificadora.',
      'Banho da cabeça aos pés.',
    ],
    velas: [
      'Velas Brancas (também pode ser usado velas douradas e pratas). Ideal fazer feixe de velas (Fazer 5 pontos de velas).',
    ],
    pontos: [
      { img: 'oxala.png', legenda: 'Espaço Mágico ou Ponto Riscado de Pai Oxalá' },
      { img: 'oxala-2.png', legenda: 'Cristalino e Ígneo' },
      { img: 'oxala-3.png', legenda: 'Vegetal e Ígneo' },
      { img: 'oxala-4.png', legenda: 'Espaço Mágico Equilibrador' },
      { img: 'oxala-5.png', legenda: 'Espaço Mágico Equilibrador' },
    ],
    fatores: [
      'Congregador (principal) – espaço de terreiro é a “prova viva” deste fator.',
      'Acalmador.',
      'Passificador.',
      'Tranquilizador.',
      'Harmonizador.',
      'Curadora.',
    ],
    orientacao: 'Exemplo de recado: tragam o banho pronto em garrafa e uma vela branca.',
  }],
};

// Presença no amaci. Na visão Alunos (seletor Visão do root), a pessoa de teste aparece como aluna da Turma 1
// (ALUNO_DEMO); na visão Root, o bloco Presença nos amacis lista os alunos das duas turmas.
const ALUNO_DEMO = 'demo-aluno';
const presAmaci = { [id(304)]: { [ALUNO_DEMO]: 'p', [id(601)]: 'p', [id(602)]: 'f', [id(603)]: 'p' }, [id(305)]: { [id(601)]: 'p', [id(603)]: 'p' } };
function marcarAmaci(eventoId, alunoId, status) {
  presAmaci[eventoId] ||= {};
  if (status) presAmaci[eventoId][alunoId] = status; else delete presAmaci[eventoId][alunoId];
}
function amaci() {
  const hoje = dia(0);
  const evs = db.eventos.filter((e) => e.tipo === 'amaci').sort((a, b) => a.data.localeCompare(b.data)).map((e) => ({ ...e, turmas: [id(501)] }));
  const alunoVc = vcAtual.startsWith('a:') ? db.alunos.find((a) => a.id === vcAtual.slice(2)) : null;
  if (vcAtual && !alunoVc) return copia(AMACI_DEMO);   // vendo como alguém da corrente: sem presença
  const quem = alunoVc ? alunoVc.id : ALUNO_DEMO;
  const daTurma = !alunoVc || alunoVc.turmaId === id(501);
  const amacis = daTurma ? evs.map((e) => ({ id: e.id, data: e.data, nome: e.nome, retroativo: !!e.retroativo, status: presAmaci[e.id]?.[quem] || null })) : [];
  const feitos = amacis.filter((a) => a.data <= hoje);
  const turmaNome = alunoVc ? db.turmas.find((t) => t.id === alunoVc.turmaId)?.nome || '' : 'Turma 1';
  if (alunoVc) return { ...copia(AMACI_DEMO), turmaNome, presenca: { hoje, amacis, pct: feitos.length ? Math.round((feitos.filter((a) => a.status === 'p').length / feitos.length) * 100) : null } };
  return {
    ...copia(AMACI_DEMO), turmaNome, admin: true, turmas: db.turmas.map((t) => ({ ...t, orixas: t.id === id(501) ? ['oxala'] : [] })),
    presenca: { hoje, amacis, pct: feitos.length ? Math.round((feitos.filter((a) => a.status === 'p').length / feitos.length) * 100) : null },
    presencaAdmin: {
      hoje, amacis: evs.filter((e) => e.data <= hoje).reverse().map(({ id: i, data, nome, turmas, retroativo }) => ({ id: i, data, nome, turmas, retroativo: !!retroativo })),
      turmas: copia(db.turmas), alunos: copia(db.alunos), marcas: copia(presAmaci),
    },
  };
}

// Aba Diário: alguns dias de exemplo do próprio root (um dia de gira com conselho e banho pendente, um dia comum).
let diarioPublicado = false;
let diarioOrientador = true;
const diarioDias = [
  { data: dia(-6), dados: { gira: true, antes: { humor: 2, emo: ['drenado'], energia: 2 }, depois: { humor: 4, emo: ['paz', 'grato'], energia: 4, sensacao: 'leve' }, linha: 'preto-velho',
    conselho: 'Firma o teu pensamento antes de dormir e não carrega o que não é teu.', banho: { ervas: ['arruda', 'alecrim', 'manjericão'], feito: false, origem: 'guia' } } },
  { data: dia(-2), dados: { antes: { humor: 2, emo: ['ansioso'], energia: 2, sono: 'agitado' }, depois: { humor: 4, emo: ['grato'], energia: 3 }, reflexao: 'Encontrei um amigo antigo bem quando pensava nele.',
    banho: { ervas: ['Camomila'], feito: true, origem: 'orientador' } } },
];
// Galeria: fotos guardadas só na memória da página (src no lugar do link da API).
const pixel = (cor) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="${cor}"/></svg>`)}`;
const galeriaDemo = [
  { id: 'gd1', nome: 'Ana Souza', descricao: 'Gira de Ogum, que noite!', criadoEm: new Date().toISOString(), v: '1', curtidas: 3, curti: false, minha: false, src: pixel('#7cb85a') },
  { id: 'gd2', nome: 'Bruno Lima', descricao: '', criadoEm: new Date().toISOString(), v: '1', curtidas: 1, curti: true, minha: false, src: pixel('#8ea6d8') },
];
const diarioDemo = () => {
  if (vcAtual) throw new ErroDemo(403, 'O Diário é pessoal: não abre no "Ver como".');
  return { publicada: diarioPublicado, orientador: diarioOrientador, root: true, dias: copia(diarioDias), galeria: copia(galeriaDemo) };
};
function acaoDiarioDemo(b) {
  if (b.op === 'publicar') { diarioPublicado = !!b.publicada; return diarioDemo(); }
  if (b.op === 'orientador') { diarioOrientador = !!b.visivel; return diarioDemo(); }
  if (b.op === 'fotoCurtir') {
    const f = galeriaDemo.find((x) => x.id === b.id);
    if (f) { f.curti = !f.curti; f.curtidas += f.curti ? 1 : -1; }
    return { galeria: copia(galeriaDemo) };
  }
  if (b.op === 'fotoExcluir') {
    const i = galeriaDemo.findIndex((x) => x.id === b.id);
    if (i >= 0) galeriaDemo.splice(i, 1);
    return { galeria: copia(galeriaDemo) };
  }
  if (b.op === 'fotoEnviar') {
    if (galeriaDemo.some((x) => x.minha)) throw new ErroDemo(400, 'Você já tem uma foto na galeria: exclua a sua para subir outra.');
    galeriaDemo.unshift({ id: 'gd' + Date.now(), nome: 'Root', descricao: String(b.descricao || '').trim().slice(0, 200), criadoEm: new Date().toISOString(),
      v: '1', curtidas: 0, curti: false, minha: true, src: 'data:image/jpeg;base64,' + b.foto });
    return { galeria: copia(galeriaDemo) };
  }
  const dados = normalizarDia(b.dados);
  const i = diarioDias.findIndex((x) => x.data === b.data);
  if (i >= 0) diarioDias.splice(i, 1);
  if (Object.keys(dados).length) diarioDias.push({ data: b.data, dados });
  diarioDias.sort((a, x) => a.data.localeCompare(x.data));
  return { data: b.data, dados };
}

// Bloco CPJ - Pgto atrasado: cobranças vencidas inventadas (as duas contas).
function atrasosDemo() {
  const at = (n, conta, quem, valor, venc, descricao) => {
    const p = db.pessoas.find((x) => x.id === quem); const a = db.alunos.find((x) => x.id === quem);
    const t = a && db.turmas.find((x) => x.id === a.turmaId);
    return { id: 'demo' + n, conta, pessoaId: p?.id || null, alunoId: a?.id || null, ligado: !!(p || a), turmaId: t?.id || null, turmaNome: t?.nome || null,
      nome: p?.nome || a?.nome || 'Cliente sem cadastro', telefone: '11912345678', valor, vencimento: dia(venc), descricao, link: '' };
  };
  return { configurado: true, contas: { A: true, B: true }, root: true, atualizadoEm: new Date().toISOString(), atrasos: [
    at(1, 'B', id(6), 110, -12, 'Mensalidade CPJ'), at(2, 'B', id(7), 110, -40, 'Mensalidade CPJ'), at(3, 'B', id(7), 110, -10, 'Mensalidade CPJ'),
    at(4, 'A', id(3), 80, -5, 'CPJ · Compras · pedido nº 3'), at(5, 'B', id(601), 90, -8, 'Curso de Umbanda'), at(6, 'B', id(602), 90, -8, 'Curso de Umbanda'),
    at(7, 'B', id(603), 90, -20, 'Curso de Umbanda'), at(8, 'B', 'x', 50, -3, 'Doação'),
  ] };
}
// Sub-aba Pedidos: o total vencido de cada pessoa, das mesmas cobranças do bloco acima.
function pendenciasDemo() {
  const total = {};
  for (const a of atrasosDemo().atrasos) {
    const chave = a.pessoaId ? 'p:' + a.pessoaId : a.alunoId ? 'a:' + a.alunoId : null;
    if (chave) total[chave] = (total[chave] || 0) + a.valor;
  }
  return total;
}

// Painel da Transparência: valores inventados, na visão da corrente (sem editar, sem nomes).
function transparencia(mesPedido) {
  const meses = [0, 1, 2].map((n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return iso(d).slice(0, 7); });
  const mes = meses.includes(mesPedido) ? mesPedido : meses[0];
  const k = meses.indexOf(mes);
  const debitos = [{ nome: 'Aluguel', valor: 2200 }, { nome: 'Contador', valor: 300 }, { nome: 'Luz', valor: 95.4 }, { nome: 'Água', valor: 82.1 }, { nome: 'Velas (mês)', valor: 260 }];
  const r2 = (v) => Math.round(v * 100) / 100;
  const totalDebitos = r2(debitos.reduce((s, d) => s + d.valor, 0));
  const pagas = [9, 11, 10][k];
  const totalPago = pagas * 110;
  const doacoes = { quantidade: [14, 18, 11][k], total: [620, 815.5, 480][k] };
  const aporteAsaas = { quantidade: 1, total: 1500 };
  const creditos = r2(totalPago + doacoes.total);
  const resultado = r2(creditos + aporteAsaas.total - totalDebitos);
  const saldoAnterior = [2140.3, 1935.8, 1700][k];
  return {
    publicada: true, editar: false, root: false, verNomes: false, config: null, meses, mes,
    debitos, totalDebitos, creditosExtras: [], aporte: 0, aporteAsaas, herdado: null,
    asaas: {
      configurado: true, atualizadoEm: new Date().toISOString(),
      mensalidades: { pagas, abertas: 12 - pagas, totalPago }, doacoes, valorMensalidade: 110,
      corrente: { total: db.pessoas.filter((p) => !p.saida && (p.funcao !== 'curimba' || p.limpeza)).length },   // com a curimba que tem turma da limpeza
    },
    creditos, resultado, saldoAnterior, saldo: r2(saldoAnterior + resultado), saldoParcial: false,
  };
}


// Giras: três já encerradas (sorteadas e fechadas pelas mesmas regras do app) e a próxima, ainda em aberto.
function montarGiras() {
  const passadas = [[-21, 'Exu', id(7)], [-14, 'Preto Velho', id(4)], [-7, 'Baiano', id(13)]];
  for (const [n, entidade, faltou] of passadas) {
    let g = { ...giraVazia(dia(proximoSabado + n)), entidade, publicada: true, pendentePadrao: false };
    g.presenca = Object.fromEntries(db.pessoas.filter((p) => p.funcao !== 'curimba').map((p) => [p.id, p.id === faltou ? 'f' : 'p']));
    g = { ...g, ...sortear(db.pessoas, db.giras, g).patch };
    g = { ...g, ...encerrar(db.pessoas, g).patch, atendimentos: { preferencial: 6, normal: 38, passe: 21 } };
    db.giras.push(g);
  }
  db.giras.push({ ...giraVazia(dia(proximoSabado)), entidade: 'Caboclo', recado: 'Venham de branco. Tragam uma vela verde.' });
}
montarGiras();

const giraDe = (data) => db.giras.find((g) => g.data === data);
function salvarGira(g) {
  const i = db.giras.findIndex((x) => x.data === g.data);
  if (i >= 0) db.giras[i] = g; else db.giras.push(g);
  return g;
}
const girasOrdenadas = () => copia([...db.giras].sort((a, b) => b.data.localeCompare(a.data)));

// Root vendo como uma pessoa do cadastro (X-Ver-Como): 'p:<pessoa>' ou 'a:<aluno>'; '' = o próprio root.
let vcAtual = '';
const ABAS_CORRENTE = PERFIS_PADRAO.find((x) => x.chave === 'corrente').abas;
const PUBLICADAS = { videosPublicada: true, ervasPublicada: true, guiasPublicada: true, amaciPublicada: true, transparenciaPublicada: true, oferendasPublica: true };
function me() {
  if (vcAtual.startsWith('p:')) {
    const p = db.pessoas.find((x) => x.id === vcAtual.slice(2));
    return { id: null, nome: p?.nome || '', email: '', papel: 'corrente', papelNome: 'Corrente', pessoaId: p?.id || null, permissoes: permissoesDe('corrente', ABAS_CORRENTE),
      corrente: true, temSenha: true, ...PUBLICADAS, diarioPublicada: diarioPublicado, iemanjaAba: true, iemanjaPublica: true };
  }
  if (vcAtual.startsWith('a:')) {
    const a = db.alunos.find((x) => x.id === vcAtual.slice(2));
    return { id: null, nome: a?.nome || '', email: '', papel: 'alunos', papelNome: 'Aluno', grupo: 'alunos', pessoaId: null, permissoes: PERMISSOES_GRUPO.alunos,
      temSenha: true, ...PUBLICADAS, diarioPublicada: diarioPublicado, iemanjaAba: false, iemanjaPublica: false };
  }
  return { id: 'u-demo', nome: 'Teste CPJ', email: DEMO_EMAIL, papel: 'root', papelNome: 'Admin root', pessoaId: EU_ID,
    permissoes: PERMISSOES_ROOT, corrente: false, ...PUBLICADAS, diarioPublicada: diarioPublicado, iemanjaAba: true, iemanjaPublica: true };
}
const pessoaVc = () => (vcAtual.startsWith('p:') ? vcAtual.slice(2) : vcAtual ? null : EU_ID);

const oracoes = () => db.oracoes.map(({ autor, reacoes, ...o }) => ({
  ...o, deAluno: false, meu: autor === 'u:demo', apagar: true, reacoes: reacoes.length, reagi: reacoes.includes('u:demo'),
}));

function inicio() {
  if (vcAtual.startsWith('a:')) {
    return { me: me(), config: CONFIG, eventos: copia(db.eventos.filter((e) => ['gira', 'evento', 'amaci'].includes(e.tipo))), oracoes: [], minhaCurimba: null };
  }
  return { me: me(), versao: 'demo', config: CONFIG, pessoas: copia(db.pessoas), giras: girasOrdenadas(),
    eventos: copia(db.eventos), minhaCurimba: null, oracoes: oracoes(), entidadesApelidos: [] };
}

const todosPerfis = () => db.pessoas.filter((p) => !p.saida).map((p) => ({ pessoaId: p.id, nome: p.nome, funcao: p.funcao, perfil: db.perfis[p.id] || normalizarPerfil({}) }));
function perfil() {
  const todos = todosPerfis();
  return {
    eu: todos.find((x) => x.pessoaId === pessoaVc()) || null,
    ...(vcAtual ? {} : { todos }),
    contatos: todos.map((x) => ({ pessoaId: x.pessoaId, nome: x.nome, contatoNome: x.perfil.info.contatoNome || '', contatoTelefone: x.perfil.info.contatoTelefone || '' })),
    guias: todos.filter((x) => x.perfil.guias.chefe.linha || x.perfil.guias.frente.linha)
      .map((x) => ({ pessoaId: x.pessoaId, nome: x.nome, chefe: x.perfil.guias.chefe.linha, frente: x.perfil.guias.frente.linha })),
  };
}

function ervas() {
  const eu = { chave: 'u:demo', nome: 'Teste CPJ' };
  return {
    frete: 12, aberta: true, gira: 'Gira de Caboclo', data: dia(proximoSabado), ervas: copia(db.ervas),
    minhas: db.escolhas.filter((s) => s.chave === eu.chave).map(({ ervaId, quantidade }) => ({ ervaId, quantidade })),
    eu, participantes: new Set(db.escolhas.map((s) => s.chave)).size, euParticipo: db.escolhas.some((s) => s.chave === eu.chave),
    pedidos: calcularPedidos(db.ervas, db.escolhas, 12), publicada: true,
  };
}

const compras = criarCompras({ euChave: 'p:' + EU_ID, euNome: 'Teste CPJ', pessoas: db.pessoas, ErroDemo });

function doar(b) {
  const i = db.oferendas.flatMap((o) => o.itens).find((x) => x.id === b.itemId);
  if (!i) throw new ErroDemo(404, 'Item não encontrado.');
  const q = Math.max(0, Number(b.quantidade) || 0);
  i.doacoes = i.doacoes.filter((d) => d.chave !== 'p:' + EU_ID);
  if (q) i.doacoes.push({ chave: 'p:' + EU_ID, nome: 'Teste CPJ', quantidade: q });
  return oferendas();
}
// Admin das oferendas na demo: cadastrar item, Todos, doação por alguém e pôr alguém na lista por pessoa.
function acaoOferendaDemo(b) {
  const ofs = db.oferendas;
  const item = (iid) => ofs.flatMap((o) => o.itens).find((x) => x.id === iid) || (() => { throw new ErroDemo(404, 'Item não encontrado.'); })();
  const nomeDe = (pid) => (String(pid).startsWith('a:') ? [...db.alunos, ...GRUPO_OFERENDA].find((a) => 'a:' + a.id === pid)?.nome : db.pessoas.find((p) => p.id === pid)?.nome) || '?';
  if (b.acao === 'item') {
    const dados = { nome: b.nome, quantidade: Number(b.quantidade), unidade: b.unidade, entrega: b.entrega || '' };
    if (b.id) Object.assign(item(b.id), dados);
    else ofs.find((o) => o.id === b.oferendaId).itens.push({ id: 'demo-' + Date.now(), entregue: false, todos: false, doacoes: [], ...dados });
  } else if (b.acao === 'itemTodos') {
    const i = item(b.id);
    i.todos = b.todos === true;
    if (i.todos) i.doacoes = [];
  } else if (b.acao === 'doarPor') {
    const i = item(b.itemId);
    if (i.todos && Number(b.quantidade) > 0) throw new ErroDemo(400, 'Este item é de todos da lista.');
    const chave = b.chave || (String(b.pessoaId).startsWith('a:') ? b.pessoaId : 'p:' + b.pessoaId);
    const q = Math.max(0, Number(b.quantidade) || 0);
    const ja = i.doacoes.find((d) => d.chave === chave);
    i.doacoes = i.doacoes.filter((d) => d.chave !== chave);
    if (q) i.doacoes.push({ chave, nome: ja?.nome || nomeDe(b.pessoaId), quantidade: q });
  } else {
    const of = ofs.find((o) => o.id === b.oferendaId);
    const aluno = String(b.pessoaId).startsWith('a:');
    of.mediuns.push({ pessoaId: b.pessoaId, nome: nomeDe(b.pessoaId), pagamento: 'nao_pago', entrega: 'pendente', ...(aluno ? { aluno: true } : {}) });
  }
  return oferendas();
}
const oferendas = () => ({ oferendas: copia(db.oferendas), eu: { chave: 'p:' + (pessoaVc() || EU_ID), nome: me().nome }, abas: copia(ABAS_OFERENDA), publica: true });


function lerGet(caminho, q) {
  const lista = q.get('lista');
  if (caminho === '/auth/inicio') return q.get('atualizar') ? { versao: 'demo', semMudanca: true } : inicio();
  if (caminho === '/auth/me') return me();
  if (caminho === '/auth/perfil') return perfil();
  if (caminho === '/auth/anamnese') {
    return {
      visivel: true,
      perguntas: [{ id: id(1201), texto: 'Você tem alguma alergia?', tipo: 'texto' }, { id: id(1202), texto: 'Já participou de outra casa de Umbanda?', tipo: 'simnao' }],
      minhas: {}, todas: [],
    };
  }
  if (caminho === '/auth/foto') return { foto: null };
  if (caminho === '/auth/cpf') return { cpf: '' };
  if (caminho === '/giras') {
    if (!lista) return girasOrdenadas();
    if (lista === 'oracoes') return oracoes();
    if (lista === 'eventos') return copia(db.eventos);
    if (lista === 'eventosTipos') return { tipos: TIPOS_EVENTO.map(([chave, nome]) => ({ chave, nome, turmas: chave === 'amaci' ? [id(501)] : [] })), turmas: copia(db.turmas), eventos: copia(db.eventos) };
    if (lista === 'videos') return copia(db.videos);
    if (lista === 'ausencias') return [];
    if (lista === 'conduta') return { ativa: true, relatos: [] };
    if (lista === 'atrasos') {
      const A = atrasosDemo();
      if (!vcAtual) return A;
      // Ver como: só as da pessoa (como o servidor), com o aviso de quem ainda não criou a senha.
      const [t, x] = [vcAtual.slice(0, 2), vcAtual.slice(2)];
      const minhas = A.atrasos.filter((a) => (t === 'p:' ? a.pessoaId : a.alunoId) === x).map(({ id, conta, valor, vencimento, descricao, link }) => ({ id, conta, valor, vencimento, descricao, link }));
      return { ...A, root: false, verComoSemSenha: true, atrasos: minhas };
    }
    if (lista === 'fotos') return { albuns: [], fotos: [], usado: 0, limite: 0, configurado: false };
    if (lista === 'transparencia') return transparencia(q.get('mes') || '');
  }
  const mGira = caminho.match(/^\/giras\/(\d{4}-\d{2}-\d{2})$/);
  if (mGira) return copia(giraDe(mGira[1]) || giraVazia(mGira[1]));
  if (caminho === '/pessoas') {
    if (!lista) return copia(db.pessoas);
    if (lista === 'alunos') {
      // Cadastros pelo login (Criar cadastro): três novos, ainda sem destino, e um consulente.
      const cad = (n, nome, dias, celular, email) => ({ id: id(n), nome, em: new Date(Date.now() - dias * 864e5).toISOString(), celular, email });
      return { turmas: copia(db.turmas), alunos: copia(db.alunos), grupoOferenda: copia(GRUPO_OFERENDA), cadastros: { turmaConsulentes: id(599), turmaOferenda: id(598),
        oferenda: [cad(671, 'Ivone Martins', 10, '11943210987', 'ivone@exemplo.com')],
        novos: [cad(651, 'Daniela Matos', 1, '11987654321', 'daniela@exemplo.com'), cad(652, 'Eduardo Pires', 3, '11976543210', 'edu@exemplo.com'),
          cad(653, 'Gabriela Lopes', 6, '11965432109', 'gabi@exemplo.com')],
        consulentes: [cad(661, 'Henrique Dias', 20, '11954321098', 'henrique@exemplo.com')] } };
    }
    if (lista === 'curimba') return copia(db.curimba);
    if (lista === 'minhaCurimba') return null;
    if (lista === 'perfis') { const t = todosPerfis(); return { ...contagemPerfis(t), cabecaNomes: pessoasPorOrixaCabeca(t) }; }
    if (lista === 'amaci') return amaci();
    if (lista === 'diario') return diarioDemo();
  }
  if (caminho === '/usuarios') {
    const usuarios = [{ id: 'u-demo', nome: 'Teste CPJ', email: DEMO_EMAIL, papel: 'root', papelNome: 'Admin root', pessoaId: EU_ID }];
    const senhas = db.pessoas.filter((p) => !p.saida).map((p) => ({ pessoaId: p.id, nome: p.nome, temSenha: p.funcao === 'medium' }));
    if (lista === 'perfis') return copia(PERFIS_PADRAO);
    if (lista === 'senhas') return senhas;
    if (lista === 'tudo') return { usuarios, perfis: copia(PERFIS_PADRAO), senhas };
    if (lista === 'visitas') return visitasDemo();
    return usuarios;
  }
  if (caminho === '/ervas') return lista === 'historico' ? [] : ervas();
  if (caminho === '/oferendas') {
    if (!lista) return oferendas();
    if (lista === 'guias') return compras.lerGuias({ atualizar: !!q.get('conferir') });
    if (lista === 'asaas') return compras.asaas();
    if (lista === 'iemanja') return respostaIemanja();
    if (lista === 'pedidos') return compras.pedidos(pendenciasDemo());
  }
  throw new ErroDemo(404, 'Demonstração: sem dados para esta tela.');
}

const pessoaSemSaida = () => db.pessoas;

// Ações da escala que funcionam na demonstração.
function acaoGira(data, b) {
  const atual = giraDe(data) || giraVazia(data);
  const pessoas = pessoaSemSaida();
  const com = (patch, mensagem) => ({ gira: copia(salvarGira({ ...atual, ...patch })), mensagem });
  switch (b.acao) {
    case 'encerrar': {
      if (atual.encerrada) return { gira: copia(atual), mensagem: 'A gira já estava encerrada.' };
      const { patch, mensagem } = encerrar(pessoas, atual);
      return com({ ...patch, atendimentos: b.atendimentos || null, participantes: b.participantes ?? null }, mensagem);
    }
    case 'reabrir': {
      if (!atual.encerrada) return { gira: copia(atual), mensagem: 'A gira já estava aberta.' };
      const { patch, mensagem } = reabrir(pessoas, atual);
      return com(patch, mensagem);
    }
    case 'publicar': return com({ publicada: !!b.publicada }, b.publicada ? 'Escala publicada: agora todos veem o sorteio.' : 'Publicação desfeita: só os admins veem o sorteio.');
    case 'travar': return com({ travada: !!b.travada }, b.travada ? 'Escala travada: marcar falta não muda a escala.' : 'Trava desligada: faltas voltam a tirar a pessoa da escala.');
    case 'recado': return com({ recado: String(b.recado || '') }, b.recado ? 'Recado salvo: todos veem no evento.' : 'Recado retirado.');
    case 'cancelarSorteio': return com({ pares: [], passes: [], publicada: false }, 'Sorteio cancelado: as duplas foram apagadas.');
    case 'corrigirPresenca': return com({ presenca: { ...atual.presenca, [b.pessoaId]: b.status } }, 'Presença corrigida.');
    case 'ausencia': return com({ presenca: { ...atual.presenca, [EU_ID]: 'a' } }, 'Ausência registrada. Obrigado por avisar! #boa gira');
    case 'reiniciar': return com({ presenca: {}, papeis: {}, pares: [], passes: [], publicada: false }, 'Gira reiniciada: todos voltaram para Pendente.');
    case 'mudarData': {
      if (giraDe(b.para)) throw new ErroDemo(409, 'Já existe gira nesta data.');
      db.giras = db.giras.filter((g) => g.data !== data);
      const [y, m, d] = b.para.split('-');
      return { gira: copia(salvarGira({ ...atual, data: b.para })), mensagem: `Data da gira alterada para ${d}/${m}/${y}.` };
    }
    default: throw new ErroDemo(400, AVISO_DEMO);
  }
}

function escrever(metodo, caminho, b) {
  const mGira = caminho.match(/^\/giras\/(\d{4}-\d{2}-\d{2})$/);
  if (mGira) {
    const [, data] = mGira;
    const sub = metodo === 'POST' && ['sortear', 'remanejar'].includes(b?.acao) ? b.acao : null;
    if (metodo === 'DELETE') { db.giras = db.giras.filter((g) => g.data !== data); return { ok: true }; }
    if (metodo === 'PUT') return copia(salvarGira({ ...(giraDe(data) || giraVazia(data)), ...b, data }));
    if (sub) {
      const g = giraDe(data) || giraVazia(data);
      if (g.encerrada) throw new ErroDemo(409, 'A gira está encerrada. Reabra para mudar.');
      const r = (sub === 'sortear' ? sortear : remanejar)(db.pessoas, db.giras, g);
      return { gira: copia(salvarGira({ ...g, ...(r.patch || {}) })), mensagem: r.mensagem };
    }
    return acaoGira(data, b || {});
  }
  const mPessoa = caminho.match(/^\/pessoas\/([\w-]+)$/);
  if (mPessoa && metodo === 'PATCH') {
    const p = db.pessoas.find((x) => x.id === mPessoa[1]);
    if (!p) throw new ErroDemo(404, 'Pessoa não encontrada.');
    Object.assign(p, b);
    return copia(p);
  }
  if (caminho === '/giras' && b?.acao === 'excluirEvento') {
    db.eventos = db.eventos.filter((e) => e.id !== b.id);
    return copia(db.eventos);
  }
  if (caminho === '/giras' && b?.acao === 'evento' && b.id) {
    const e = db.eventos.find((x) => x.id === b.id);
    if (!e) throw new ErroDemo(404, 'Evento não encontrado.');
    Object.assign(e, { data: b.data, nome: String(b.nome || '').trim(), tipo: b.tipo });
    return copia(db.eventos).sort((a, x) => a.data.localeCompare(x.data));
  }
  if (caminho === '/giras' && b?.acao === 'evento' && !b.id) {
    db.eventos.push({ id: id(3000 + db.eventos.length), data: b.data, nome: String(b.nome || '').trim(), tipo: b.tipo, retroativo: b.retroativo === true });
    return copia(db.eventos).sort((a, x) => a.data.localeCompare(x.data));
  }
  if (caminho === '/giras' && b?.acao === 'oracao') {
    db.oracoes.unshift({ id: id(4000 + db.oracoes.length), texto: String(b.texto || '').trim(), criadoEm: new Date().toISOString(), expiraEm: dia(4), autor: 'u:demo', autorNome: 'Teste CPJ', reacoes: [] });
    return oracoes();
  }
  if (caminho === '/giras' && b?.acao === 'reagirOracao') {
    const o = db.oracoes.find((x) => x.id === b.id);
    if (o) o.reacoes = o.reacoes.includes('u:demo') ? o.reacoes.filter((r) => r !== 'u:demo') : [...o.reacoes, 'u:demo'];
    return oracoes();
  }
  if (caminho === '/giras' && b?.acao === 'excluirOracao') { db.oracoes = db.oracoes.filter((x) => x.id !== b.id); return oracoes(); }
  if (caminho === '/oferendas' && b?.acao === 'guias' && b.op === 'andamento') return compras.andamento(b, pendenciasDemo());
  if (caminho === '/oferendas' && b?.acao === 'guias') return compras.acaoGuias(b);
  if (caminho === '/oferendas' && b?.acao === 'asaas') return compras.acaoAsaas(b);
  if (caminho === '/oferendas' && b?.acao === 'iemanja') return acaoIemanja(b);
  if (caminho === '/pessoas' && b?.acao === 'diario') return acaoDiarioDemo(b);
  // Bloquear / liberar o acesso do aluno (Editar aluno): só esse campo funciona na demonstração.
  if (caminho === '/pessoas' && b?.acao === 'aluno' && 'bloqueado' in b && Object.keys(b).length === 3) {
    const a = db.alunos.find((x) => x.id === b.id);
    if (a) a.bloqueado = !!b.bloqueado;
    return { turmas: copia(db.turmas), alunos: copia(db.alunos) };
  }
  if (caminho === '/pessoas' && b?.acao === 'amaciPresenca') {
    const ev = db.eventos.find((e) => e.id === b.eventoId && e.tipo === 'amaci');
    if (!ev || ev.data > dia(0)) throw new ErroDemo(409, 'A presença só pode ser confirmada no dia do amaci.');
    if (ev.data < dia(0) && !ev.retroativo) throw new ErroDemo(409, 'Este amaci já passou: a presença é marcada pela administração.');
    marcarAmaci(ev.id, ALUNO_DEMO, 'p');
    return amaci();
  }
  if (caminho === '/pessoas' && b?.acao === 'amaci' && b.op === 'presenca') { marcarAmaci(b.eventoId, b.alunoId, b.status); return amaci(); }
  if (caminho === '/oferendas' && b?.acao === 'doar') return doar(b);
  if (caminho === '/oferendas' && ['item', 'itemTodos', 'doarPor', 'incluirMedium'].includes(b?.acao)) return acaoOferendaDemo(b);
  if (caminho === '/auth/visita') return { ok: true };
  if (caminho === '/auth/perfil' && b?.perfil) {
    db.perfis[EU_ID] = normalizarPerfil(b.perfil);
    return perfil().eu;
  }
  throw new ErroDemo(400, AVISO_DEMO);
}

// Bloco "Quem entrou nas abas" (Admin root): algumas entradas de exemplo nos últimos 3 dias.
function visitasDemo() {
  const h = (dias, hora) => { const d = new Date(); d.setDate(d.getDate() - dias); d.setHours(hora, 15, 0, 0); return d.toISOString(); };
  const ps = db.pessoas.filter((p) => !p.saida);
  const linhas = [];
  ps.slice(0, 6).forEach((p, i) => linhas.push({ chave: 'p:' + p.id, aba: 'guias', dia: dia(-(i % 3)), nome: p.nome, grupo: p.funcao === 'curimba' ? 'Curimba' : 'Corrente CPJ', vezes: 1 + (i % 3), ultima: h(i % 3, 9 + i) }));
  ps.slice(2, 5).forEach((p, i) => linhas.push({ chave: 'p:' + p.id, aba: 'gira', dia: dia(0), nome: p.nome, grupo: 'Corrente CPJ', vezes: 2, ultima: h(0, 8 + i) }));
  [['Aluna Teste', 'Turma 10'], ['Bruno Aluno', 'Turma 09'], ['Carla Nova', 'Alunos sem turma']].forEach(([nome, grupo], i) =>
    linhas.push({ chave: 'a:demo' + i, aba: 'guias', dia: dia(-1), nome, grupo, vezes: 1, ultima: h(1, 19 + i) }));
  return linhas;
}

// Mesmo contrato de api(): devolve o JSON ou lança erro com { status, message }.
export async function demoApi(metodo, rota, corpo, verComo = '') {
  vcAtual = verComo || '';
  if (vcAtual && metodo !== 'GET') throw new ErroDemo(403, 'Vendo como outra pessoa: só para olhar. Volte para a visão Root para alterar.');
  const u = new URL(rota, 'http://demo');
  try {
    return metodo === 'GET' ? lerGet(u.pathname, u.searchParams) : escrever(metodo, u.pathname, corpo);
  } catch (e) {
    if (e instanceof ErroDemo) throw e;
    console.error('[demo]', metodo, rota, e);
    throw new ErroDemo(500, 'Demonstração: algo deu errado nesta tela.');
  }
}
