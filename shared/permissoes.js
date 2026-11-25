// O que cada perfil pode fazer. O backend é quem garante (devolve 403);
// o frontend só usa a lista para esconder abas e botões.
//
// Os perfis ficam no banco (tabela perfis): o admin root cria e edita na aba Admin root,
// marcando por aba se o perfil pode Ver e/ou Editar. As permissões saem dessas marcações.

// Abas que entram na tabela de perfis (a aba Admin root, chave "usuarios", é sempre só do admin root).
export const ABAS = [
  { k: 'gira', nome: 'Geral e Gira', ver: 'As abas Geral e Gira com a escala. Sem o Histórico, vê só o resultado do sorteio.', editar: 'Presença, entidade, sorteio e encerrar.' },
  { k: 'pessoas', nome: 'Pessoas', ver: 'A corrente, licenças e turmas da limpeza.', editar: 'Cadastrar, editar e excluir pessoas e licenças.' },
  { k: 'alunos', nome: 'Alunos (na aba Pessoas)', ver: 'O bloco Alunos na aba Pessoas.', editar: 'Cadastrar alunos e turmas.' },
  { k: 'hist', nome: 'Histórico', ver: 'Histórico, estatísticas e a presença completa na Gira.', editar: 'Excluir giras, backup e restauração.' },
  { k: 'ervas', nome: 'Ervas', ver: 'Escolher as próprias ervas.', editar: 'Ervas, preços, frete, pedidos e cobrança.' },
  { k: 'oferendas', nome: 'Eventos (oferendas)', ver: 'Escolher o que doar nas oferendas e ver as listas de pessoas dos eventos.', editar: 'Criar oferendas, itens e marcar entregas; montar as listas de pessoas dos eventos.' },
  { k: 'guias', nome: 'Compras', ver: 'Ver os itens à venda e fazer os próprios pedidos.', editar: 'Grupos e itens, encerrar e começar pedidos, marcar ok e exportar.' },
  { k: 'amaci', nome: 'Amaci', ver: 'A aba Amaci (quando está visível para todos): o amaci de cada orixá liberado.', editar: 'Ligar Visível para todos, liberar os orixás por turma e escrever os Recados.' },
  { k: 'fotos', nome: 'Fotos', ver: 'Ver os álbuns e enviar fotos (quem entra pela corrente precisa ter senha).', editar: 'Apagar fotos de qualquer pessoa; editar e excluir álbuns.' },
  { k: 'curimba', nome: 'Curimba', ver: 'A aba Curimba: alunos, aulas e presença.', editar: 'Cadastrar alunos e aulas e marcar presença.' },
  { k: 'videos', nome: 'Vídeos', ver: 'A aba Vídeos: assistir aos vídeos das giras.', editar: 'Publicar, classificar e excluir vídeos.' },
  { k: 'perfil', nome: 'Perfil', ver: 'O próprio perfil (orixás, guias e a própria Anamnese).', editar: 'Admin do perfil: ver o perfil de todos e as pendências, e a Anamnese (cadastrar perguntas, ver as respostas de todos e compartilhar).' },
  { k: 'transparencia', nome: 'Transparência', ver: 'O Painel da Transparência mesmo quando ele não está visível para a corrente.', editar: 'Lançar débitos e o aporte de cada mês e ligar Visível para a corrente.' },
  { k: 'oraculo', nome: 'Oráculo', ver: 'Ver as consultas de todos na agenda do Oráculo (agendar a própria, todos podem).', editar: 'Agenda do Oráculo: horários, bloqueios, limite por dia, cancelar consultas, taxa do presencial e o aviso de consulta paga.' },
  { k: 'asaas', nome: 'ASAAS', ver: 'A aba ASAAS: os links de pagamento das Compras e o retorno do ASAAS.', editar: 'Ligar o Pix nas Compras e cancelar links de pagamento.' },
  // Os eventos da casa são só do Admin root; o que sobrou desta permissão é a moderação das orações (aba Geral).
  { k: 'eventos', nome: 'Orações (moderar)', ver: 'Nada a mais (todos já pedem oração e acendem vela).', editar: 'Excluir o pedido de oração de qualquer pessoa.' },
];
export const ABA_KEYS = ABAS.map((a) => a.k);
// Ordem fixa das permissões na lista de cada perfil (a das abas antes da tabela seguir o menu): mudar a ordem
// das linhas na tela não muda a lista que vai para o app nem quebra quem compara a lista.
const ORDEM_PERMISSOES = ['gira', 'pessoas', 'alunos', 'hist', 'ervas', 'oferendas', 'guias', 'eventos', 'perfil', 'curimba', 'videos', 'amaci', 'fotos', 'asaas', 'transparencia', 'oraculo'];

const MAPA = {
  gira: { ver: ['giras:ler'], editar: ['giras:editar', 'giras:sortear'] },
  pessoas: { ver: ['pessoas:ver'], editar: ['pessoas:editar'] },
  alunos: { ver: ['alunos:ver'], editar: ['alunos:editar'] },
  hist: { ver: ['historico:ver', 'escala:completa'], editar: ['giras:excluir', 'dados:importar'] },
  ervas: { ver: ['ervas:escolher'], editar: ['ervas:gerenciar'] },
  oferendas: { ver: ['oferendas:doar'], editar: ['oferendas:gerenciar'] },
  guias: { ver: ['guias:pedir'], editar: ['guias:gerenciar'] },
  perfil: { ver: ['perfil:ver'], editar: ['perfil:corrente'] },
  eventos: { ver: ['eventos:ver'], editar: ['eventos:editar'] },
  curimba: { ver: ['curimba:ver'], editar: ['curimba:editar'] },
  videos: { ver: ['videos:ver'], editar: ['videos:editar'] },
  fotos: { ver: ['fotos:ver'], editar: ['fotos:editar'] },
  amaci: { ver: ['amaci:ver'], editar: ['amaci:editar'] },
  asaas: { ver: ['asaas:ver'], editar: ['asaas:editar'] },
  transparencia: { ver: ['transparencia:ver'], editar: ['transparencia:editar'] },
  oraculo: { ver: ['oraculo:ver'], editar: ['oraculo:gerenciar'] },
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
  for (const k of ORDEM_PERMISSOES) {
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
  // A aba Curimba é um controle à parte. O Admin curimba também administra os vídeos.
  // As abas ASAAS e Transparência também não vêm com o Admin (são do root e do Admin financeiro).
  { chave: 'admin', nome: 'Admin', ordem: 1, abas: abasDe(Object.fromEntries(ABA_KEYS.filter((k) => !['curimba', 'videos', 'asaas', 'transparencia'].includes(k)).map((k) => [k, tudo(true, true)]))) },
  // Fotos: todos veem e enviam; os perfis de admin também apagam a foto de qualquer pessoa.
  // Amaci: todos veem (quando está visível para todos); administram o root e o Admin.
  { chave: 'usuario', nome: 'Usuário', ordem: 2, abas: abasDe({ gira: tudo(true), pessoas: tudo(true), hist: tudo(true), ervas: tudo(true), oferendas: tudo(true), guias: tudo(true), perfil: tudo(true), amaci: tudo(true), fotos: tudo(true) }) },
  // Ervas é uma sub-aba de Oferendas: o Admin oferendas administra as duas (o Admin ervas saiu na v133).
  { chave: 'admin_oferendas', nome: 'Admin oferendas', ordem: 3, abas: abasDe({ gira: tudo(true), alunos: tudo(true, true), hist: tudo(true), ervas: tudo(true, true), oferendas: tudo(true, true), guias: tudo(true), perfil: tudo(true), amaci: tudo(true), fotos: tudo(true, true) }) },
  { chave: 'admin_curimba', nome: 'Admin curimba', ordem: 5, abas: abasDe({ gira: tudo(true), perfil: tudo(true), curimba: tudo(true, true), videos: tudo(true, true), amaci: tudo(true), fotos: tudo(true, true) }) },
  // Admin do perfil: o que a corrente vê e, na aba Perfil, o perfil de todos e a Anamnese (perguntas e respostas).
  { chave: 'admin_perfil', nome: 'Admin perfil', ordem: 6, abas: abasDe({ gira: tudo(true), ervas: tudo(true), oferendas: tudo(true), guias: tudo(true), perfil: tudo(true, true), amaci: tudo(true), fotos: tudo(true, true) }) },
  // Admin financeiro: o que a corrente vê e a aba ASAAS só para olhar (o root marca Editar se quiser que ligue o Pix e cancele links).
  { chave: 'admin_financeiro', nome: 'Admin financeiro', ordem: 7, abas: abasDe({ gira: tudo(true), ervas: tudo(true), oferendas: tudo(true), guias: tudo(true), perfil: tudo(true), amaci: tudo(true), fotos: tudo(true, true), asaas: tudo(true), transparencia: tudo(true, true) }) },
  // Consulentes: quem se cadastrou pelo login e o admin pôs em Consulentes (turma escondida). O root escolhe no ⚙️ o
  // que ele vê, entre as abas de ABAS_CONSULENTE (a Geral sempre aparece).
  { chave: 'consulente', nome: 'Consulentes', ordem: 98, abas: abasDe({ perfil: tudo(true) }) },
  { chave: 'corrente', nome: 'Corrente', ordem: 99, abas: abasDe({ gira: tudo(true), ervas: tudo(true), oferendas: tudo(true), guias: tudo(true), perfil: tudo(true), amaci: tudo(true), fotos: tudo(true) }) },
];
// Perfis do sistema: não podem ser excluídos (o root e o acesso da corrente também não mudam de nome).
export const PERFIS_SISTEMA = PERFIS_PADRAO.map((p) => p.chave);

// Perfis que podem existir sem cadastro na corrente.
export const SEM_CADASTRO = ['root'];

// Palavras-passe antigas (acabaram): o login reconhece para dizer como entrar agora.
export const ACESSO_CORRENTE = 'corrente-cpj';
// Textos aceitos no campo de e-mail para o acesso da corrente.
export const ACESSOS_CORRENTE = [ACESSO_CORRENTE, 'cpj'];
export const ehAcessoCorrente = (email) => ACESSOS_CORRENTE.includes(String(email || '').trim().toLowerCase());
export const GRUPOS_ACESSO = ['alunos', 'curimba'];
export const grupoAcesso = (email) => {
  const valor = String(email || '').trim().toLowerCase();
  return GRUPOS_ACESSO.includes(valor) ? valor : ehAcessoCorrente(valor) ? 'cpj' : '';
};
// O que os acessos de grupo podem fazer: o aluno vê o próprio registro; os dois pedem na aba Compras (quando ela está visível para todos).
// O aluno também vê a aba Amaci (quando está visível para todos), só com os orixás liberados para a turma dele.
export const PERMISSOES_GRUPO = { alunos: ['alunos:ver', 'guias:pedir', 'amaci:ver'], curimba: ['guias:pedir'] };
// Consulente: só o "Ver" das abas que funcionam fora da corrente, escolhidas pelo root no perfil Consulentes. Sem os
// nomes da corrente (pessoas:ler) e sem a escala (giras:ler), que todo perfil da corrente tem.
export const ABAS_CONSULENTE = ['perfil', 'guias', 'amaci', 'videos'];
export function permissoesConsulente(abas) {
  const a = normalizarAbas(abas);
  return [...new Set(['alunos:ver', ...ABAS_CONSULENTE.filter((k) => a[k].ver).flatMap((k) => MAPA[k].ver)])];
}

// Grupo Oferenda (cadastro pelo login posto no grupo Oferenda, turma escondida): só a Geral e a aba Oferendas, sem doar
// (oferendas:ver lê as oferendas; doar exige oferendas:doar). O que o admin atribui aparece nos compromissos dele.
export const PERMISSOES_OFERENDA = ['alunos:ver', 'oferendas:ver'];

// Senha (PIN) de quem entra pelo acesso da corrente: só números, de 4 a 8 (as antigas continuam valendo).
export const PIN_VALIDO = /^\d{4,8}$/;
// Senha nova (criar, cadastrar ou o root definir): de 6 a 8 números.
export const PIN_NOVO = /^\d{6,8}$/;
export const PIN_NOVO_MSG = 'A senha precisa ter de 6 a 8 números.';

// Quem já foi identificado no backend (exigir) carrega a lista "permissoes".
export function pode(quem, permissao) {
  return !!quem && (quem.permissoes || []).includes(permissao);
}
