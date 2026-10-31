// O que cada perfil pode fazer. O backend é quem garante (devolve 403);
// o frontend só usa a lista para esconder abas e botões.
//
// Os perfis ficam no banco (tabela perfis): o admin root cria e edita na aba Usuários,
// marcando por aba se o perfil pode Ver e/ou Editar. As permissões saem dessas marcações.

// Abas que entram na tabela de perfis (a aba Usuários é sempre só do admin root).
export const ABAS = [
  { k: 'gira', nome: 'Gira', ver: 'A escala. Sem o Histórico, vê só o resultado do sorteio.', editar: 'Presença, entidade, sorteio e encerrar.' },
  { k: 'pessoas', nome: 'Pessoas', ver: 'A corrente, licenças e turmas da limpeza.', editar: 'Cadastrar, editar e excluir pessoas e licenças.' },
  { k: 'alunos', nome: 'Alunos', ver: 'O bloco Alunos (na aba Pessoas).', editar: 'Cadastrar alunos e turmas.' },
  { k: 'hist', nome: 'Histórico', ver: 'Histórico, estatísticas e a presença completa na Gira.', editar: 'Excluir giras, backup e restauração.' },
  { k: 'ervas', nome: 'Ervas', ver: 'Escolher as próprias ervas.', editar: 'Ervas, preços, frete, pedidos e cobrança.' },
  { k: 'oferendas', nome: 'Oferendas', ver: 'Escolher o que doar.', editar: 'Criar oferendas, itens e marcar entregas.' },
  { k: 'eventos', nome: 'Eventos', ver: 'A aba Eventos (a lista do mês).', editar: 'Cadastrar, editar e excluir eventos.' },
  { k: 'perfil', nome: 'Perfil', ver: 'O próprio perfil (orixás e guias).', editar: 'Ver o perfil de todos e as pendências.' },
];
export const ABA_KEYS = ABAS.map((a) => a.k);

const MAPA = {
  gira: { ver: ['giras:ler'], editar: ['giras:editar', 'giras:sortear'] },
  pessoas: { ver: ['pessoas:ver'], editar: ['pessoas:editar'] },
  alunos: { ver: ['alunos:ver'], editar: ['alunos:editar'] },
  hist: { ver: ['historico:ver', 'escala:completa'], editar: ['giras:excluir', 'dados:importar'] },
  ervas: { ver: ['ervas:escolher'], editar: ['ervas:gerenciar'] },
  oferendas: { ver: ['oferendas:doar'], editar: ['oferendas:gerenciar'] },
  perfil: { ver: ['perfil:ver'], editar: ['perfil:corrente'] },
  eventos: { ver: ['eventos:ver'], editar: ['eventos:editar'] },
};
// Todo mundo logado vê os nomes da corrente (para mostrar as duplas, os pedidos etc.).
const BASE = ['pessoas:ler'];
const TODAS = [...new Set([...BASE, ...Object.values(MAPA).flatMap((m) => [...m.ver, ...m.editar])])];
export const PERMISSOES_ROOT = [...TODAS, 'usuarios:gerenciar'];

// Deixa só abas conhecidas; Editar já inclui Ver.
export function normalizarAbas(abas) {
  const o = abas && typeof abas === 'object' ? abas : {};
  const r = {};
  for (const k of ABA_KEYS) {
    const x = o[k] || {};
    const editar = !!x.editar;
    r[k] = { ver: editar || !!x.ver, editar };
  }
  return r;
}

export function permissoesDe(papel, abas) {
  if (papel === 'root') return PERMISSOES_ROOT;
  const a = normalizarAbas(abas);
  const r = [...BASE];
  for (const k of ABA_KEYS) {
    if (a[k].ver) r.push(...MAPA[k].ver);
    if (a[k].editar) r.push(...MAPA[k].editar);
  }
  return [...new Set(r)];
}

const tudo = (ver, editar) => ({ ver, editar });
const abasDe = (o) => normalizarAbas(o);
// Perfis que já vêm cadastrados (o root pode mudar tudo, menos o próprio Admin root).
export const PERFIS_PADRAO = [
  { chave: 'root', nome: 'Admin root', ordem: 0, abas: abasDe(Object.fromEntries(ABA_KEYS.map((k) => [k, tudo(true, true)]))) },
  { chave: 'admin', nome: 'Admin', ordem: 1, abas: abasDe(Object.fromEntries(ABA_KEYS.map((k) => [k, tudo(true, true)]))) },
  { chave: 'usuario', nome: 'Usuário', ordem: 2, abas: abasDe({ gira: tudo(true), pessoas: tudo(true), hist: tudo(true), ervas: tudo(true), oferendas: tudo(true), perfil: tudo(true) }) },
  { chave: 'admin_oferendas', nome: 'Admin oferendas', ordem: 3, abas: abasDe({ gira: tudo(true), alunos: tudo(true, true), hist: tudo(true), ervas: tudo(true), oferendas: tudo(true, true), perfil: tudo(true) }) },
  { chave: 'admin_ervas', nome: 'Admin ervas', ordem: 4, abas: abasDe({ gira: tudo(true), pessoas: tudo(true), hist: tudo(true), ervas: tudo(true, true), oferendas: tudo(true), perfil: tudo(true) }) },
  { chave: 'corrente', nome: 'Corrente', ordem: 99, abas: abasDe({ gira: tudo(true), ervas: tudo(true), oferendas: tudo(true), perfil: tudo(true) }) },
];
// Perfis do sistema: não podem ser excluídos (o root e o acesso da corrente também não mudam de nome).
export const PERFIS_SISTEMA = PERFIS_PADRAO.map((p) => p.chave);

// Perfis que podem existir sem cadastro na corrente.
export const SEM_CADASTRO = ['root'];

// No login, quem digita isto (ou só "cpj") no campo de e-mail entra sem senha, informando só o nome.
export const ACESSO_CORRENTE = 'corrente-cpj';
// Textos aceitos no campo de e-mail para o acesso da corrente.
export const ACESSOS_CORRENTE = [ACESSO_CORRENTE, 'cpj'];
export const ehAcessoCorrente = (email) => ACESSOS_CORRENTE.includes(String(email || '').trim().toLowerCase());

// Senha (PIN) de quem entra pelo acesso da corrente: só números, de 4 a 8.
export const PIN_VALIDO = /^\d{4,8}$/;

// Quem já foi identificado no backend (exigir) carrega a lista "permissoes".
export function pode(quem, permissao) {
  return !!quem && (quem.permissoes || []).includes(permissao);
}
