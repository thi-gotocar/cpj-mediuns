// GET /api/config — dados públicos que o frontend precisa para o login.
import { rota, HttpError } from './_lib/http.js';

export default rota({
  GET: async () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw new HttpError(500, 'SUPABASE_URL e SUPABASE_ANON_KEY não configuradas.');
    return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey };
  },
});
