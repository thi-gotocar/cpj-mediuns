// Versão do esquema do banco. Fica fora de db/esquema.js para as funções da Vercel conferirem a versão sem carregar
// as migrações (centenas de KB de SQL): db/esquema.js só é carregado quando o banco está atrás (api/_lib/db.js).
// Ao acrescentar comandos no fim de MIGRACOES (db/esquema.js), aumente aqui.

export const VERSAO = 185;  // v185: sub-aba Eventos (listas de convidados); a aba Oferendas passa a se chamar Eventos
