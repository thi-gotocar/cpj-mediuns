// O que cada perfil pode fazer. O backend é quem garante (devolve 403);
// o frontend só usa esta lista para esconder botões.
//
// Para mudar as permissões, altere este arquivo: vale para os dois lados.

export const PERMISSOES = {
  admin: [
    'pessoas:ler',
    'pessoas:editar',   // cadastrar, trocar função, marcar "pode ter passe", excluir
    'giras:ler',
    'giras:editar',     // entidade, presença, troca manual de duplas, fixar
    'giras:sortear',    // sortear e remanejar faltas
    'giras:excluir',
    'usuarios:gerenciar',
    'dados:importar',
  ],
  usuario: [
    'pessoas:ler',
    'giras:ler',        // ver a escala, o histórico e exportar (texto e imagem)
  ],
};

export const PAPEIS = { admin: 'Admin', usuario: 'Usuário' };

export function pode(papel, permissao) {
  return (PERMISSOES[papel] || []).includes(permissao);
}
