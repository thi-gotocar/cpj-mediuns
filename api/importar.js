// POST /api/importar — carrega um backup da versão anterior (arquivo .json baixado
// em Histórico > Backup). Pessoas são casadas pelo nome; as que não existem são criadas.
// As giras do arquivo substituem as giras de mesma data.
import { rota, corpo, validarData, HttpError } from './_lib/http.js';
import { exigir } from './_lib/sessao.js';
import { db } from './_lib/db.js';
import { FUNCAO_KEYS, LINHA_KEYS } from '../shared/regras.js';

// Status das versões anteriores: true = presente, false = ausente, 'nc' = suporte.
function statusAntigo(v) {
  if (v === true || v === 'p') return 'p';
  if (v === false || v === 'a') return 'a';
  if (v === 'nc' || v === 'sup') return 'sup';
  if (v === 'na' || v === 'f') return v;
  return null;
}

export default rota({
  POST: async (req) => {
    const perfil = await exigir(req, 'dados:importar');
    const b = corpo(req);
    const pessoasArq = b.pessoas && typeof b.pessoas === 'object' ? Object.entries(b.pessoas) : null;
    const girasArq = b.giras && typeof b.giras === 'object' ? Object.entries(b.giras) : null;
    if (!pessoasArq || !girasArq) throw new HttpError(400, 'Arquivo de backup inválido.');
    if (pessoasArq.length > 2000 || girasArq.length > 2000) throw new HttpError(400, 'Backup grande demais.');

    // 1) pessoas
    const porFuncao = {};
    for (const [, p] of pessoasArq) {
      const nome = String(p?.nome || '').trim();
      if (!nome || nome.length > 80 || !FUNCAO_KEYS.includes(p.funcao)) continue;
      (porFuncao[p.funcao] ||= []).push(nome);
    }
    let criadas = 0;
    for (const [funcao, nomes] of Object.entries(porFuncao)) {
      criadas += (await db.rpc('pessoas_criar', { nomes, funcao })).criadas;
    }
    const atuais = await db.rpc('pessoas_listar');
    const porNome = new Map(atuais.map((p) => [p.nome.trim().toLowerCase(), p]));
    const novoId = {};
    for (const [velho, p] of pessoasArq) {
      const atual = porNome.get(String(p?.nome || '').trim().toLowerCase());
      if (!atual) continue;
      novoId[velho] = atual.id;
      if (p.experiente && !atual.experiente) {
        await db.rpc('pessoas_atualizar', { id: atual.id, experiente: true });
        atual.experiente = true;
      }
      const linhas = Array.isArray(p.linhas) ? p.linhas.filter((l) => LINHA_KEYS.includes(l)) : [];
      if (linhas.length && !(atual.linhas || []).length) {
        await db.rpc('pessoas_atualizar', { id: atual.id, linhas });
        atual.linhas = linhas;
      }
    }

    // 2) giras
    const mapa = (lista) => (Array.isArray(lista) ? lista : [])
      .filter((d) => novoId[d?.m] && novoId[d?.c])
      .map((d) => ({ m: novoId[d.m], c: novoId[d.c], fixo: !!d.fixo, remanejado: !!d.remanejado }));
    let giras = 0;
    for (const [chave, g] of girasArq) {
      let data;
      try { data = validarData(g?.data || chave); } catch { continue; }
      const presenca = {};
      for (const [velho, v] of Object.entries(g.presenca || {})) {
        const st = statusAntigo(v);
        if (novoId[velho] && st) presenca[novoId[velho]] = st;
      }
      await db.rpc('gira_salvar', {
        data, usuario: perfil.id, entidade: String(g.entidade || '').slice(0, 120),
        presenca, pares: mapa(g.pares), passes: mapa(g.passes), encerrada: g.encerrada === true,
        ...(g.atendimentos && typeof g.atendimentos === 'object' ? { atendimentos: g.atendimentos } : {}),
      });
      giras++;
    }
    return { pessoasCriadas: criadas, pessoasNoArquivo: pessoasArq.length, giras };
  },
});
