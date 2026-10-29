// O que cada perfil pode fazer. O backend é quem garante (devolve 403);
// o frontend só usa esta lista para esconder botões.
//
// Para mudar as permissões, altere este arquivo: vale para os dois lados.

export const PERMISSOES = {
  admin: [
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
  ],
  usuario: [
    'pessoas:ler',
    'giras:ler',        // ver a escala, o histórico e exportar (texto e imagem)
    'ervas:escolher',   // escolher as ervas que quer comprar
  ],
  // Quem entra com o acesso da corrente (sem senha, só com o nome).
  corrente: [
    'pessoas:ler',
    'giras:ler',
    'ervas:escolher',
  ],
};

// Perfis que podem ser dados a usuários cadastrados.
export const PAPEIS = { admin: 'Admin', usuario: 'Usuário' };
// Rótulo de cada perfil (inclui o acesso da corrente).
export const ROTULOS = { ...PAPEIS, corrente: 'Corrente' };

// No login, quem digita isto no campo de e-mail entra sem senha, informando só o nome.
export const ACESSO_CORRENTE = 'corrente-cpj';
export const ehAcessoCorrente = (email) => String(email || '').trim().toLowerCase() === ACESSO_CORRENTE;

export function pode(papel, permissao) {
  return (PERMISSOES[papel] || []).includes(permissao);
}
