// Perfis (tabela perfis) que podem ser dados a um usuário com e-mail.
// O "corrente" é só do acesso pelo nome, não vai para usuários.
import { db } from './db.js';

export async function papelValido(papel) {
  // Corrente, Consulentes e Alunos são de quem entra pelo próprio cadastro: não vão para um usuário.
  if (!papel || papel === 'corrente' || papel === 'consulente' || papel === 'aluno') return false;
  return (await db.rpc('perfis_config')).some((f) => f.chave === papel);
}
