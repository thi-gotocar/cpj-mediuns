// Perfis (tabela perfis) que podem ser dados a um usuário com e-mail.
// O "corrente" é só do acesso pelo nome, não vai para usuários.
import { db } from './db.js';

export async function papelValido(papel) {
  if (!papel || papel === 'corrente') return false;
  return (await db.rpc('perfis_config')).some((f) => f.chave === papel);
}
