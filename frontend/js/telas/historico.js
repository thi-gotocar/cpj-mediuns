// Tela "Histórico": giras salvas, quem já cambonou quem e backup.

import { recebe, ehCambone, ordRecebe, presente } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, girasLista, excluirGira, montarBackup, importarBackup, avisar } from '../estado.js';
import { esc, dLong, dShort, hoje, toast, baixar } from '../util.js';

export function render() {
  const gs = girasLista().sort((a, b) => b.data.localeCompare(a.data));
  const ps = pessoasOrd();
  let h = `<section class="panel"><div class="card"><h2>Giras salvas</h2>`;
  if (!gs.length) h += `<p class="muted">Nenhuma gira ainda.</p>`;
  else {
    h += `<div class="hist">`;
    gs.forEach((g) => {
      const np = ps.filter((p) => presente(p, g)).length;
      const conf = estado.confirm === 'g:' + g.data;
      h += `<div class="hi"><div><div class="d">${esc(dLong(g.data))} <span class="muted" style="font-weight:400">${dShort(g.data).slice(-4)}</span></div>
        <div class="muted" style="font-size:.9rem">${esc(g.entidade || 'Entidade não definida')} · ${(g.pares || []).length} duplas · ${np} presentes${g.encerrada ? ' · <span class="badge rep">encerrada</span>' : ''}</div></div>
        <div class="acts"><button class="btn small" data-act="abrir" data-d="${g.data}">Abrir</button>
        ${pode('giras:excluir') ? (conf ? `<button class="btn small danger" data-act="delgira" data-d="${g.data}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="g:${g.data}">Excluir</button>`) : ''}</div></div>`;
    });
    h += `</div>`;
  }
  h += `</div>`;

  const meds = ps.filter(recebe).sort(ordRecebe);
  const cams = ps.filter(ehCambone);
  if (meds.length && cams.length && gs.some((g) => (g.pares || []).length)) {
    const cnt = {};
    gs.forEach((g) => (g.pares || []).forEach((p) => { const k = p.m + '|' + p.c; cnt[k] = (cnt[k] || 0) + 1; }));
    const usados = cams.filter((c) => meds.some((m) => cnt[m.id + '|' + c.id]));
    h += `<div class="card"><h2>Quem já cambonou quem</h2><p class="muted" style="margin:0;font-size:.9rem">Vezes que cada cambone acompanhou cada médium, em todas as giras.</p>
      <div class="matrix"><table><thead><tr><th></th>${usados.map((c) => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead><tbody>
      ${meds.map((m) => `<tr><th class="rh">${esc(m.nome)}</th>${usados.map((c) => { const n = cnt[m.id + '|' + c.id] || 0; return `<td class="${n === 0 ? 'z' : n === 1 ? 'h1' : 'h2'}">${n || '·'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  }

  if (pode('dados:importar')) {
    h += `<div class="card"><h2>Backup</h2><p class="muted" style="margin:0;font-size:.9rem">Os dados ficam no banco da corrente. O backup é uma cópia extra em arquivo; “Restaurar” também importa o backup da versão anterior do app (a que salvava no aparelho).</p>
      <div class="row"><button class="btn" data-act="backup">Baixar backup</button>
      <label class="btn" for="f-import" style="cursor:pointer">Restaurar backup</label><input type="file" id="f-import" accept="application/json,.json" hidden></div></div>`;
  }
  return h + '</section>';
}

export const cliques = {
  abrir(el) { prefs.data = el.dataset.d; prefs.tab = 'gira'; salvarPrefs(); avisar(); window.scrollTo(0, 0); },
  delgira(el) { estado.confirm = null; excluirGira(el.dataset.d); },
  backup() {
    baixar(new Blob([JSON.stringify(montarBackup(), null, 1)], { type: 'application/json' }), 'sort-mediuns-backup-' + hoje() + '.json');
  },
};

export async function restaurar(arquivo) {
  try {
    const obj = JSON.parse(await arquivo.text());
    if (!obj || typeof obj.pessoas !== 'object' || typeof obj.giras !== 'object') throw new Error('formato');
    if (!confirm('Importar este backup? Pessoas que faltam serão criadas e as giras do arquivo substituem as de mesma data.')) return;
    const r = await importarBackup(obj);
    toast(`Importado: ${r.pessoasCriadas} pessoas novas e ${r.giras} giras.`);
  } catch (e) {
    toast(e.message === 'formato' || e instanceof SyntaxError ? 'Arquivo de backup inválido.' : e.message);
  }
}
