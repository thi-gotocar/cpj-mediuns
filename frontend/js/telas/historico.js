// Tela "Histórico": giras salvas, quem já cambonou quem e backup.

import { recebe, ehCambone, ordRecebe, status, FUNCOES, STATUS, STATUS_KEYS, LINHAS, licencaEm } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, girasLista, excluirGira, cadastrarGiraAntiga, montarBackup, importarBackup, avisar } from '../estado.js';
import { esc, dLong, dShort, hoje, toast, baixar } from '../util.js';

const ATEND = [['preferencial', 'Preferencial'], ['normal', 'Normal'], ['passe', 'Passe']];
const somaAt = (a) => ATEND.reduce((s, [k]) => s + (Number(a?.[k]) || 0), 0);
const linhaAt = (a) => `Atendidos: ${ATEND.map(([k, t]) => `${t} <b>${Number(a[k]) || 0}</b>`).join(' · ')} · Total <b>${somaAt(a)}</b>`;

// ---- Cadastrar gira antiga (só para alimentar o histórico: sem escala de médiuns)
function cardGiraAntiga(ps) {
  const F = estado.giraAntiga;
  if (!F) return `<div class="row"><button class="btn" data-act="gaabrir">+ Cadastrar gira antiga</button></div>`;
  const g = { data: F.data, presenca: F.presenca };
  let h = `<div class="card" id="card-ga"><h2>Cadastrar gira antiga</h2>
    <p class="muted" style="margin:0;font-size:.88rem">Só para o histórico: data, gira, presença e atendidos. Não tem escala de médiuns e não entra no rodízio. A gira fica salva como encerrada.</p>
    <div class="row">
      <label class="field" style="flex:0 1 170px">Data do evento<input type="date" id="ga-data" data-act="gacampo" data-k="data" value="${esc(F.data)}" max="${hoje()}"></label>
      <label class="field grow">Gira<select id="ga-ent" data-act="gacampo" data-k="entidade"><option value="">— escolha —</option>
        ${LINHAS.map((grp) => `<optgroup label="${grp.grupo}">${grp.itens.map(([, l]) => `<option ${l === F.entidade ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select></label>
    </div>`;
  const cont = (s) => ps.filter((p) => status(p, g) === s).length;
  h += `<div class="grp-h"><h3>Presença</h3><span class="count">${cont('p') + cont('na') + cont('sup')} presentes · ${cont('a')} ausentes · ${cont('f')} faltas
    <button class="btn link" data-act="gatodos" data-v="p">todos presentes</button> <button class="btn link" data-act="gatodos" data-v="a">todos ausentes</button></span></div>`;
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    h += `<div class="grp"><h3 style="font-size:.95rem">${f.pl}</h3><div class="plist">${gp.map((p) => {
      const lic = F.data && licencaEm(p, F.data);
      const s = status(p, g);
      return `<div class="pres ${s === 'a' || s === 'f' || s === 'lic' ? 'aus' : ''}"><span class="nm">${esc(p.nome)}</span>${lic
        ? '<span class="badge lic">de licença</span>'
        : `<select class="st" data-act="gastatus" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${STATUS_KEYS.map((k) => `<option value="${k}" ${k === s ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}</select>`}</div>`;
    }).join('')}</div></div>`;
  });
  h += `<h3 style="margin:0">Atendidos</h3><div class="row">${ATEND.map(([k, t]) => `<label class="field" style="flex:1 1 90px">${t}<input type="number" inputmode="numeric" min="0" step="1" data-act="gaat" data-k="${k}" value="${F.at[k]}"></label>`).join('')}</div>
    <div class="row"><button class="btn primary" data-act="gasalvar">Salvar gira</button><button class="btn" data-act="gacancelar">Cancelar</button></div></div>`;
  return h;
}

export function render() {
  const gs = girasLista().sort((a, b) => b.data.localeCompare(a.data));
  const ps = pessoasOrd();
  let h = `<section class="panel">`;
  if (pode('giras:editar')) h += cardGiraAntiga(ps);
  h += `<div class="card"><h2>Giras salvas</h2>`;
  // Soma dos atendidos de todas as giras que têm o registro.
  const comAt = gs.filter((g) => g.atendimentos);
  if (comAt.length) {
    const tot = Object.fromEntries(ATEND.map(([k]) => [k, comAt.reduce((s, g) => s + (Number(g.atendimentos[k]) || 0), 0)]));
    h += `<p class="muted" style="margin:0;font-size:.9rem">Em ${comAt.length} gira${comAt.length === 1 ? '' : 's'} · ${linhaAt(tot)}</p>`;
  }
  if (!gs.length) h += `<p class="muted">Nenhuma gira ainda.</p>`;
  else {
    h += `<div class="hist">`;
    gs.forEach((g) => {
      // Presentes = quem esteve na gira (presente, não atende ou suporte).
      const n = (...sts) => ps.filter((p) => sts.includes(status(p, g))).length;
      const nLic = n('lic');
      const conf = estado.confirm === 'g:' + g.data;
      h += `<div class="hi"><div><div class="d">${esc(dLong(g.data))} <span class="muted" style="font-weight:400">${dShort(g.data).slice(-4)}</span></div>
        <div class="muted" style="font-size:.9rem">${esc(g.entidade || 'Entidade não definida')} · ${n('p', 'na', 'sup')} presentes · ${n('a')} ausentes · ${n('f')} faltas${nLic ? ` · ${nLic} de licença` : ''}${g.encerrada ? ' · <span class="badge rep">encerrada</span>' : ''}</div>
        ${g.atendimentos ? `<div style="font-size:.9rem">${linhaAt(g.atendimentos)}</div>` : ''}</div>
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
  gaabrir() {
    estado.giraAntiga = { data: '', entidade: '', presenca: {}, at: { preferencial: 0, normal: 0, passe: 0 } };
    avisar();
  },
  gacancelar() { estado.giraAntiga = null; avisar(); },
  gatodos(el) {
    const F = estado.giraAntiga;
    F.presenca = {};
    if (el.dataset.v !== 'p') pessoasOrd().forEach((p) => { F.presenca[p.id] = el.dataset.v; });
    avisar();
  },
  async gasalvar() {
    const F = estado.giraAntiga;
    if (!F.data) { toast('Informe a data do evento.'); return; }
    if (F.data > hoje()) { toast('A data é no futuro. Use a aba Gira para giras que ainda vão acontecer.'); return; }
    if (estado.giras[F.data]) { toast(`Já existe uma gira em ${F.data.split('-').reverse().join('/')}. Abra pelo histórico para alterar.`); return; }
    if (!F.entidade) { toast('Escolha a gira.'); return; }
    const presenca = Object.fromEntries(Object.entries(F.presenca).filter(([, s]) => s !== 'p'));
    const ok = await cadastrarGiraAntiga(F.data, { entidade: F.entidade, presenca, atendimentos: F.at });
    if (ok) { toast('Gira antiga cadastrada.'); estado.giraAntiga = null; avisar(); }
  },
  abrir(el) { prefs.data = el.dataset.d; prefs.tab = 'gira'; salvarPrefs(); avisar(); window.scrollTo(0, 0); },
  delgira(el) { estado.confirm = null; excluirGira(el.dataset.d); },
  backup() {
    baixar(new Blob([JSON.stringify(montarBackup(), null, 1)], { type: 'application/json' }), 'sort-mediuns-backup-' + hoje() + '.json');
  },
};

export const mudancas = {
  gacampo(t) { estado.giraAntiga[t.dataset.k] = t.value; avisar(); },
  gastatus(t) {
    const F = estado.giraAntiga;
    if (t.value === 'p') delete F.presenca[t.dataset.id]; else F.presenca[t.dataset.id] = t.value;
    avisar();
  },
  gaat(t) { const n = parseInt(t.value, 10); estado.giraAntiga.at[t.dataset.k] = Number.isFinite(n) && n >= 0 ? n : 0; },
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
