// Sobe o app com Postgres local e Auth simulado, para testes no navegador.
import { prepararBanco, simularSupabase, criarUsuarioDireto } from './apoio.js';
import { criarServidor } from '../scripts/servidor.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_ANON_KEY = 'anon-teste';
prepararBanco();
simularSupabase();
criarUsuarioDireto('admin@corrente.org', 'Mãe Joana');
criarUsuarioDireto('user@corrente.org', 'Zé');
const srv = await criarServidor();
srv.listen(Number(process.env.PORT) || 4310, () => console.log('pronto'));
