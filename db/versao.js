// Versão do esquema do banco. Fica fora de db/esquema.js para as funções da Vercel conferirem a versão sem carregar
// as migrações (centenas de KB de SQL): db/esquema.js só é carregado quando o banco está atrás (api/_lib/db.js).
// Ao acrescentar comandos no fim de MIGRACOES (db/esquema.js), aumente aqui.

export const VERSAO = 182;  // v182: oraculo_avisos aceita o jsonb do db.rpc (aviso de consulta paga)
