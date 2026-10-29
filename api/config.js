// GET /api/config — dados públicos que o frontend precisa para o login.
import { rota, HttpError } from './_lib/http.js';

export default rota({
  GET: async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    // Só os NOMES das variáveis que faltam; nunca os valores.
    const faltando = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !process.env[n]);
    if (faltando.length) {
      throw new HttpError(503, 'Faltam variáveis de ambiente na Vercel: ' + faltando.join(', ') + '. Cadastre em Settings > Environment Variables e faça um Redeploy.');
    }
    return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey };
  },
});
