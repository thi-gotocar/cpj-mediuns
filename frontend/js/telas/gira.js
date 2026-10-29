// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, STATUS_KEYS, status, presente, cambonaHoje, paresPorMedium, custos } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, nome, girasLista, giraAtual, editarGira, sortear, remanejar, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar } from '../util.js';
import { textoWhats } from '../exportar.js';
import { gerarImagem } from '../imagem.js';

const classeStatus = (s) => (s === 'a' || s === 'f' ? 'aus' : s === 'na' ? 'na' : s === 'sup' ? 'nc' : '');

function chaveImg() {
  return textoWhats(estado.pessoas, giraAtual(), 'lista');
}
function podeCompartilhar() {
  try {
    return !!(estado.img && navigator.canShare && navigator.canShare({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })] }));
  } catch { return false; }
}

export function render() {
  const ps = pessoasOrd();
  const g = giraAtual();
  const editar = pode('giras:editar');
  const sortearOk = pode('giras:sortear');
  const ents = [...new Set(girasLista().map((x) => x.entidade).filter(Boolean))];
  const existe = !!estado.giras[g.data];

  let h = `<section class="panel">
  <div class="card">
    <div class="datehead"><span class="eyebrow">Gira de</span><span class="dia">${esc(dLong(g.data))}</span>${g.entidade ? `<span class="ent">${esc(g.entidade)}</span>` : ''}</div>
    <div class="row">
      <label class="field" style="flex:0 1 170px">Data do evento<input type="date" id="f-data" value="${esc(g.data)}"></label>
      ${editar ? `<label class="field grow">Entidade que trabalha no dia<input type="text" id="f-ent" list="ents" maxlength="120" placeholder="Ex.: Pretos Velhos" value="${esc(g.entidade || '')}"></label>
      <datalist id="ents">${ents.map((e) => `<option value="${esc(e)}">`).join('')}</datalist>` : ''}
    </div>
    ${!editar ? `<p class="leitura" style="margin:0">Você está no modo de consulta: vê a escala e pode exportar, mas não altera.</p>` : ''}
  </div>`;

  if (!ps.length) {
    return h + `<div class="card empty"><h2>Nenhuma pessoa cadastrada</h2><p class="muted">${pode('pessoas:editar') ? 'Cadastre a corrente na aba Pessoas.' : 'Um admin precisa cadastrar a corrente.'}</p>
      ${pode('pessoas:editar') ? '<button class="btn primary" data-act="goto" data-tab="pessoas">Cadastrar pessoas</button>' : ''}</div></section>`;
  }
  if (!editar && !existe) {
    return h + `<div class="card empty"><h2>Escala ainda não montada</h2><p class="muted">Não há escala salva para esta data. Escolha outra data ou veja as giras no Histórico.</p>
      <button class="btn" data-act="goto" data-tab="hist">Ver histórico</button></div></section>`;
  }

  // presença
  const cont = (s) => ps.filter((p) => status(p, g) === s).length;
  h += `<div class="card"><div class="grp-h"><h2>Presença</h2><span class="count">${cont('p')} presentes · ${cont('na')} não atendem · ${cont('sup')} no suporte · ${cont('f')} faltas · ${cont('a')} ausentes</span></div>`;
  if (editar) h += `<p class="muted" style="margin:0;font-size:.88rem">Escolha o status de cada pessoa. “Não atende” está na gira mas não atende: entra no sorteio como cambone. “Suporte” fica fora do sorteio.</p>`;
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    const np = gp.filter((p) => presente(p, g)).length;
    h += `<div class="grp"><div class="grp-h"><h3>${f.pl}</h3><span class="count">${np}/${gp.length}
      ${editar ? `<button class="btn link" data-act="todos" data-f="${f.k}" data-v="${np === gp.length ? 'a' : 'p'}">${np === gp.length ? 'marcar ausentes' : 'todos presentes'}</button>` : ''}</span></div>
      <div class="plist">${gp.map((p) => {
        const s = status(p, g);
        const xp = p.experiente && p.funcao === 'medium' ? ' <span class="xp" title="Pode ter médium de passe junto">P</span>' : '';
        const ctl = editar
          ? `<select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${STATUS_KEYS.map((k) => `<option value="${k}" ${k === s ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}</select>`
          : `<span class="st-txt">${STATUS[s]}</span>`;
        return `<div class="pres ${classeStatus(s)}"><span class="nm">${esc(p.nome)}${xp}</span>${ctl}</div>`;
      }).join('')}</div></div>`;
  });
  h += `</div>`;

  // duplas
  const { lista, validos, passesV, semPasse, invalidos } = paresPorMedium(estado.pessoas, g);
  const map = custos(girasLista(), g.data, 'pares');
  const mapP = custos(girasLista(), g.data, 'passes');
  const camsPres = ps.filter((p) => cambonaHoje(p, g));
  const passPres = ps.filter((p) => presente(p, g) && p.funcao === 'passe');
  const selo = (e) => (!e ? `<span class="badge new">1ª vez juntos</span>`
    : e.recente ? `<span class="badge hot">repetiu da última</span>`
      : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
  const linha = (k, p, idx, opts, mp, rotulo) => {
    const quem = editar
      ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`
      : `<span class="nmc">${esc(nome(p.c))}</span>`;
    const fixar = editar
      ? `<button class="lock" data-act="fixo" data-k="${k}" data-i="${idx}" aria-pressed="${!!p.fixo}" title="Manter no próximo sorteio">${p.fixo ? 'Fixada' : 'Fixar'}</button>`
      : p.fixo ? '<span class="badge rep">fixada</span>' : '';
    return `<div class="camrow">${rotulo ? `<span class="tag">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${fixar}</div>`;
  };
  const temDuplas = validos.length || passesV.length;
  h += `<div class="card"><div class="grp-h"><h2>Médiuns e cambones</h2>
      ${sortearOk ? `<div class="row">${temDuplas
        ? '<button class="btn primary" data-act="remanejar">Remanejar faltas</button><button class="btn" data-act="sortear">Sortear tudo de novo</button>'
        : '<button class="btn primary" data-act="sortear">Sortear</button>'}</div>` : ''}</div>`;
  if (invalidos && sortearOk) h += `<div class="warnbox">${invalidos} dupla(s) envolvem alguém que faltou ou mudou de status. Toque em <b>Remanejar faltas</b> para ajustar só essas, sem mexer nas outras.</div>`;
  if (validos.length && semPasse.length) h += `<div class="warnbox">${semPasse.map(nome).map(esc).join(', ')} ainda sem médium.${sortearOk ? (ps.some((p) => p.funcao === 'medium' && p.experiente) ? ' Sorteie de novo.' : ' Marque na aba Pessoas quais médiuns podem ter passe junto.') : ''}</div>`;
  if (!lista.length) h += `<p class="muted">Nenhum médium presente.</p>`;
  else if (!temDuplas) h += `<p class="muted">${lista.length} médiuns e extras, ${camsPres.length} cambones e ${passPres.length} médiuns de passe presentes.${sortearOk ? ' Toque em sortear para montar as duplas.' : ' As duplas ainda não foram sorteadas.'}</p>`;
  else {
    h += `<div class="pairs">`;
    lista.forEach((x) => {
      h += `<div class="pair"><span class="med">${esc(x.m.nome)}${x.m.funcao === 'extra' ? ' <span class="badge rep">Extra</span>' : ''}</span><span class="muted" style="font-size:.85rem">${x.cams.length} cambone${x.cams.length === 1 ? '' : 's'}</span><div class="cams">`;
      x.cams.forEach((p) => { h += linha('pares', p, (g.pares || []).indexOf(p), camsPres, map, ''); });
      if (!x.cams.length) h += `<span class="muted">Sem cambone.${sortearOk ? ' Sorteie de novo.' : ''}</span>`;
      x.passes.forEach((p) => { h += linha('passes', p, (g.passes || []).indexOf(p), passPres, mapP, 'Passe'); });
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  const sup = ps.filter((p) => status(p, g) === 'sup');
  if (sup.length) h += `<div class="grp"><div class="grp-h"><h3>Suporte</h3><span class="count">${sup.length}</span></div><p style="margin:0">${sup.map((p) => esc(p.nome)).join(', ')}</p></div>`;
  h += `<details><summary class="muted" style="cursor:pointer;font-size:.9rem">Como o sorteio decide</summary>
    <ul class="rule">
      <li>Médiuns e extras recebem cambone.</li>
      <li>Quem está como “Não atende” entra no sorteio como cambone, junto com os cambones presentes.</li>
      <li>Quem está em Suporte fica fora do sorteio.</li>
      <li><b>Remanejar faltas</b> não mexe nas duplas que continuam válidas. Só realoca quem foi afetado por uma falta: médium sem cambone recebe um cambone livre; se não houver, sai um cambone de um médium que tem dois; depois alguém do Suporte; por último, um cambone passa a acompanhar dois médiuns. Cambones que sobram vão para médiuns com um só cambone (máximo de dois por médium) e o excedente vai para o Suporte.</li>
      <li>Médiuns de passe não recebem cambone: cada um é sorteado para ficar com um médium marcado como “pode ter passe junto”, com o mesmo rodízio.</li>
      <li>Dupla que nunca trabalhou junta tem prioridade.</li>
      <li>A dupla da última gira do médium é evitada sempre que houver outra opção.</li>
      <li>Duplas antigas pesam menos que recentes; quanto mais vezes juntas, menor a chance.</li>
      <li>Os cambones são divididos por igual. Se faltar cambone, alguns acompanham dois médiuns; se sobrar, alguns médiuns ganham dois.</li>
      <li>Duplas fixadas ficam como estão. Entre opções empatadas, a escolha é aleatória.</li>
    </ul></details></div>`;

  // exportação
  const txt = textoWhats(estado.pessoas, g, prefs.fmt);
  const imgOk = estado.img && estado.img.data === g.data && estado.img.key === chaveImg();
  h += `<div class="card"><div class="grp-h"><h2>WhatsApp</h2>
    <div class="seg" role="group" aria-label="Formato"><button data-act="fmt" data-v="lista" aria-pressed="${prefs.fmt === 'lista'}">Lista</button><button data-act="fmt" data-v="tabela" aria-pressed="${prefs.fmt === 'tabela'}">Tabela</button></div></div>
    <textarea id="f-txt" readonly aria-label="Texto para o WhatsApp">${esc(txt)}</textarea>
    <div class="row"><button class="btn primary" data-act="copiar">Copiar texto</button>
    <a class="btn" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Abrir no WhatsApp</a></div>
    <div class="grp" style="border-top:1px solid var(--line);padding-top:14px"><div class="grp-h"><h3>Imagem da escala</h3>
      <button class="btn ${imgOk ? '' : 'primary'}" data-act="gerarimg">${estado.img && !imgOk ? 'Gerar de novo' : imgOk ? 'Atualizar' : 'Gerar imagem'}</button></div>`;
  if (estado.img && !imgOk) h += `<p class="muted" style="margin:0;font-size:.88rem">A escala mudou desde a última imagem. Gere de novo.</p>`;
  else if (!estado.img) h += `<p class="muted" style="margin:0;font-size:.88rem">Gera um PNG com a escala da gira, pronto para mandar no grupo.</p>`;
  if (imgOk) {
    const share = podeCompartilhar();
    h += `<img id="img-prev" class="prev" src="${estado.img.url}" alt="Imagem da escala da gira">
      <div class="row">${share ? '<button class="btn primary" data-act="shareimg">Compartilhar</button>' : ''}<button class="btn ${share ? '' : 'primary'}" data-act="saveimg">Salvar imagem</button></div>
      <p class="muted" style="margin:0;font-size:.88rem">No celular, também dá para tocar e segurar a imagem para salvar.</p>`;
  }
  h += `</div></div>`;
  return h + '</section>';
}

// ---------- ações ----------
export const cliques = {
  todos(el) {
    const g = giraAtual();
    const pr = { ...(g.presenca || {}) };
    pessoasOrd().filter((p) => p.funcao === el.dataset.f).forEach((p) => {
      if (el.dataset.v === 'p') delete pr[p.id]; else pr[p.id] = 'a';
    });
    editarGira({ presenca: pr });
    avisar();
  },
  sortear: () => sortear(),
  remanejar: () => remanejar(),
  fixo(el) {
    const k = el.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +el.dataset.i ? { ...p, fixo: !p.fixo } : p)) });
    avisar();
  },
  fmt(el) { prefs.fmt = el.dataset.v; salvarPrefs(); avisar(); },
  copiar() {
    const txt = textoWhats(estado.pessoas, giraAtual(), prefs.fmt);
    const fb = () => { const t = document.getElementById('f-txt'); t.focus(); t.select(); toast('Texto selecionado. Copie com o menu do aparelho.'); };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
  },
  async gerarimg() {
    try {
      const g = giraAtual();
      const blob = await gerarImagem(estado.pessoas, g);
      if (estado.img) URL.revokeObjectURL(estado.img.url);
      estado.img = { url: URL.createObjectURL(blob), blob, key: chaveImg(), data: g.data, nome: 'gira-' + g.data + '.png' };
      avisar();
      document.getElementById('img-prev')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) { toast(e.message); }
  },
  saveimg() { if (estado.img) baixar(estado.img.url, estado.img.nome); },
  shareimg() {
    if (!estado.img) return;
    navigator.share({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })], title: 'Escala da gira' })
      .catch((e) => { if (e?.name !== 'AbortError') toast('Não deu para compartilhar daqui. Use Salvar imagem.'); });
  },
};

export const mudancas = {
  data(t) { if (t.value) { prefs.data = t.value; salvarPrefs(); avisar(); } },
  status(t) {
    const g = giraAtual();
    const pr = { ...(g.presenca || {}) };
    if (t.value === 'p') delete pr[t.dataset.id]; else pr[t.dataset.id] = t.value;
    editarGira({ presenca: pr });
    avisar();
  },
  troca(t) {
    const k = t.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +t.dataset.i ? { ...p, c: t.value } : p)) });
    avisar();
  },
};

export function digitarEntidade(valor) {
  editarGira({ entidade: valor }, { atraso: 700 });
  const ta = document.getElementById('f-txt');
  if (ta) ta.value = textoWhats(estado.pessoas, giraAtual(), prefs.fmt);
  const head = document.querySelector('.datehead');
  if (head) {
    let s = head.querySelector('.ent');
    if (!s) { s = document.createElement('span'); s.className = 'ent'; head.appendChild(s); }
    s.textContent = valor;
  }
}

