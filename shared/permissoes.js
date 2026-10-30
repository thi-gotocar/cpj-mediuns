// O que cada perfil pode fazer. O backend é quem garante (devolve 403);
// o frontend só usa esta lista para esconder botões.
//
// Para mudar as permissões, altere este arquivo: vale para os dois lados.

export const PERMISSOES = {
  admin: [
    'escala:completa',  // presença, abas Pessoas e Histórico
    'pessoas:ler',
    'pessoas:editar',   // cadastrar, trocar função, marcar "pode ter passe", linhas, excluir
    'giras:ler',
    'giras:editar',     // entidade, presença, troca manual de duplas, fixar
    'giras:sortear',    // sortear e remanejar faltas
    'giras:excluir',
    'usuarios:gerenciar',
    'dados:importar',
    'ervas:escolher',
    'ervas:gerenciar',  // cadastrar ervas e preços, frete, fechar a lista, ver e exportar pedidos
    'oferendas:doar',
    'oferendas:gerenciar', // criar oferendas e itens, marcar item entregue
  ],
  usuario: [
    'escala:completa',
    'pessoas:ler',
    'giras:ler',        // ver a escala, o histórico e exportar (texto e imagem)
    'ervas:escolher',   // escolher as ervas que quer comprar
    'oferendas:doar',   // escolher o que vai doar nas oferendas
  ],
  // Quem entra com o acesso da corrente (sem senha, só com o nome):
  // só a aba Gira com o resultado do sorteio e a aba Ervas.
  corrente: [
    'pessoas:ler',      // os nomes, para mostrar as duplas
    'giras:ler',
    'ervas:escolher',
    'oferendas:doar',
  ],
};

// Perfis que podem ser dados a usuários cadastrados.
export const PAPEIS = { admin: 'Admin', usuario: 'Usuário' };
// Rótulo de cada perfil (inclui o acesso da corrente).
export const ROTULOS = { ...PAPEIS, corrente: 'Corrente' };

// No login, quem digita isto (ou só "cpj") no campo de e-mail entra sem senha, informando só o nome.
export const ACESSO_CORRENTE = 'corrente-cpj';
// Textos aceitos no campo de e-mail para o acesso da corrente.
export const ACESSOS_CORRENTE = [ACESSO_CORRENTE, 'cpj'];
export const ehAcessoCorrente = (email) => ACESSOS_CORRENTE.includes(String(email || '').trim().toLowerCase());

export function pode(papel, permissao) {
  return (PERMISSOES[papel] || []).includes(permissao);
}
