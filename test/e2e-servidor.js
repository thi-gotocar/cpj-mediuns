// Sobe o app com Postgres local, para testes no navegador.
import { prepararBanco, usarBancoLocal } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';

process.env.CODIGO_INSTALACAO ||= 'codigo-de-teste';
prepararBanco();
usarBancoLocal();
const srv = await criarServidor();
srv.listen(Number(process.env.PORT) || 4310, () => console.log('pronto'));
