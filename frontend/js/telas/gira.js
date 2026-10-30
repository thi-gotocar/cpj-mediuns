// Tela "Gira": data, entidade, presença, duplas e exportação.

import { FUNCOES, STATUS, STATUS_KEYS, LINHAS, LINHA_LABEL, OPCOES_GIRA, giraEspecial, nomeGira, status, licencaEm, presente, cambonaHoje, paresPorMedium, custos, pessoasDaGira, funcaoNaGira, usaLinhas, linhaDaEntidade } from '/shared/regras.js';
import { estado, prefs, salvarPrefs, pode, pessoasOrd, nome, girasLista, giraAtual, editarGira, sortear, remanejar, encerrarGira, reabrirGira, avisar } from '../estado.js';
import { esc, dLong, dDM, toast, baixar, hoje } from '../util.js';
import { textoWhats, gruposExtras } from '../exportar.js';
import { gerarImagem } from '../imagem.js';

const classeStatus = (s) => (s === 'a' || s === 'f' || s === 'lic' ? 'aus' : s === 'na' ? 'na' : s === 'sup' ? 'nc' : '');
const ATEND = [['preferencial', 'Preferencial'], ['normal', 'Normal'], ['passe', 'Passe']];
function textoAtendimentos(a) {
  if (!a) return '';
  const total = ATEND.reduce((s, [k]) => s + (Number(a[k]) || 0), 0);
  return `Atendidos: ${ATEND.map(([k, t]) => `${t} <b>${Number(a[k]) || 0}</b>`).join(' · ')} · Total <b>${total}</b>`;
}

function chaveImg() {
  return textoWhats(estado.pessoas, giraAtual(), 'lista');
}
function podeCompartilhar() {
  try {
    return !!(estado.img && navigator.canShare && navigator.canShare({ files: [new File([estado.img.blob], estado.img.nome, { type: 'image/png' })] }));
  } catch { return false; }
}

// Lista das linhas; mantém um valor antigo (texto livre) se a gira já tinha um.
function seletorEntidade(atual) {
  const conhecida = linhaDaEntidade(atual);
  const especial = giraEspecial(atual);
  const valor = nomeGira(atual);
  const antigo = valor && !conhecida && !especial ? `<option value="${esc(valor)}" selected>${esc(valor)} (fora da lista)</option>` : '';
  return `<select id="f-ent"><option value="" ${!valor ? 'selected' : ''}>— escolha —</option>${antigo}
    ${OPCOES_GIRA.map((grp) => `<optgroup label="${grp.grupo}">${grp.itens.map(([, label]) => `<option ${label === valor ? 'selected' : ''}>${label}</option>`).join('')}</optgroup>`).join('')}
  </select>`;
}

// Avisa quando há Extra/Passe com linhas marcadas e a entidade do dia não está definida.
// A lista de quem cambona por causa da linha só aparece para o admin.
function avisoEntidade(ps, g, editar, admin) {
  const comLinhas = ps.filter(usaLinhas);
  if (!comLinhas.length) return '';
  if (giraEspecial(g.entidade)) {
    return admin ? `<p class="muted" style="margin:0;font-size:.88rem">${esc(nomeGira(g.entidade))}: extras e passes atuam na própria função, sem olhar as linhas.</p>` : '';
  }
  if (!linhaDaEntidade(g.entidade)) {
    return editar ? `<div class="warnbox">Escolha a entidade do dia: é ela que define quem atua como extra ou passe e quem cambona.</div>` : '';
  }
  const viram = comLinhas.filter((p) => funcaoNaGira(p, g) === 'cambone');
  return admin && viram.length
    ? `<p class="muted" style="margin:0;font-size:.88rem">Nesta gira de ${esc(LINHA_LABEL[linhaDaEntidade(g.entidade)])}, cambonam: ${viram.map((p) => esc(p.nome)).join(', ')}.</p>`
    : '';
}

// Faltas e ausentes: na tela, para todos conferirem (não entram no texto nem na imagem do evento).
// Antes, o total de presentes (quem está na gira), separado pelo que cada um faz no dia:
// médium, cambone (inclui quem "não atende" e extra/passe fora da linha), passe, extra, senha e suporte.
function blocosFora(ps, g) {
  const dia = pessoasDaGira(ps, g);
  const conta = {
    'Médium': dia.filter((p) => presente(p, g) && p.funcao === 'medium').length,
    'Cambone': dia.filter((p) => cambonaHoje(p, g)).length,
    'Passe': dia.filter((p) => presente(p, g) && p.funcao === 'passe').length,
    'Extra': dia.filter((p) => presente(p, g) && p.funcao === 'extra').length,
    'Senha': dia.filter((p) => presente(p, g) && p.funcao === 'senha').length,
    'Suporte': dia.filter((p) => status(p, g) === 'sup').length,
  };
  const naGira = Object.values(conta).reduce((a, n) => a + n, 0);
  const presentes = naGira ? `<div class="grp"><div class="grp-h"><h3>Presentes</h3><span class="count">${naGira}</span></div>
    <div class="presentes">${Object.entries(conta).map(([t, n]) => `<span><span class="muted">${t}</span> <b>${n}</b></span>`).join('')}</div></div>` : '';
  return presentes + [['f', 'Faltaram'], ['a', 'Ausentes'], ['lic', 'De licença']].map(([st, titulo]) => {
    const quem = ps.filter((p) => status(p, g) === st);
    return quem.length ? `<div class="grp fora"><div class="grp-h"><h3>${titulo}</h3><span class="count">${quem.length}</span></div><p style="margin:0">${quem.map((p) => esc(p.nome)).join(', ')}</p></div>` : '';
  }).join('');
}

// Só o resultado do sorteio (acesso da corrente).
function resultado(g) {
  const { lista, semPasse } = paresPorMedium(estado.pessoas, g);
  const comDuplas = lista.some((x) => x.cams.length || x.passes.length);
  if (!comDuplas) return `<div class="card empty"><h2>Sorteio ainda não feito</h2><p class="muted">A escala desta gira ainda não foi sorteada.</p></div>`;
  let h = `<div class="card"><h2>Médiuns e cambones</h2><div class="pairs">`;
  lista.forEach((x) => {
    h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)}</span><span></span><div class="cams">`;
    h += x.cams.length ? x.cams.map((p) => `<div class="camrow"><span class="tag cam">Cambone</span><span class="nmc">${esc(nome(p.c))}</span></div>`).join('') : '<span class="muted">Sem cambone</span>';
    h += x.passes.map((p) => `<div class="camrow"><span class="tag">Passe</span><span class="nmc">${esc(nome(p.c))}</span></div>`).join('');
    h += `</div></div>`;
  });
  h += `</div>`;
  if (semPasse.length) h += `<p class="muted" style="margin:0">Passe sem médium: ${semPasse.map(nome).map(esc).join(', ')}</p>`;
  gruposExtras(estado.pessoas, g).forEach(([t, nomes]) => {
    h += `<div class="grp"><h3>${t}</h3><p style="margin:0">${nomes.map(esc).join(', ')}</p></div>`;
  });
  h += blocosFora(pessoasOrd(), g);
  return h + `</div>`;
}

export function render() {
  const ps = pessoasOrd();
  const g = giraAtual();
  const admin = pode('giras:editar');
  const encerrada = !!g.encerrada;
  // Gira encerrada não muda até ser reaberta.
  const editar = admin && !encerrada;
  const sortearOk = pode('giras:sortear') && !encerrada;
  const existe = !!estado.giras[g.data];

  let h = `<section class="panel">
  <div class="card">
    <div class="datehead"><span class="eyebrow">Gira de</span><span class="dia">${esc(dLong(g.data))}</span>${g.entidade ? `<span class="ent">${esc(nomeGira(g.entidade))}</span>` : ''}</div>
    <div class="row">
      <label class="field" style="flex:0 1 170px">Data do evento<input type="date" id="f-data" value="${esc(g.data)}"></label>
      ${editar ? `<label class="field grow">Gira / entidade do dia${seletorEntidade(g.entidade)}</label>` : ''}
    </div>
    ${encerrada ? `<div class="infobox"><span><b>Gira encerrada.</b>${admin ? ' Para alterar a escala, reabra.' : ''}${g.atendimentos ? `<br>${textoAtendimentos(g.atendimentos)}` : ''}</span>${admin ? '<button class="btn small" data-act="reabrir">Reabrir gira</button>' : ''}</div>` : ''}
    ${avisoEntidade(ps, g, editar, admin)}
    ${!editar && pode('escala:completa') ? `<p class="leitura" style="margin:0">Você está no modo de consulta: vê a escala e pode exportar, mas não altera.</p>` : ''}
  </div>`;

  if (!ps.length) {
    return h + `<div class="card empty"><h2>Nenhuma pessoa cadastrada</h2><p class="muted">${pode('pessoas:editar') ? 'Cadastre a corrente na aba Pessoas.' : 'Um admin precisa cadastrar a corrente.'}</p>
      ${pode('pessoas:editar') ? '<button class="btn primary" data-act="goto" data-tab="pessoas">Cadastrar pessoas</button>' : ''}</div></section>`;
  }
  if (!editar && !existe) {
    const completa = pode('escala:completa');
    return h + `<div class="card empty"><h2>Escala ainda não montada</h2><p class="muted">Não há escala salva para esta data.${completa ? ' Escolha outra data ou veja as giras no Histórico.' : ' Escolha outra data.'}</p>
      ${completa ? '<button class="btn" data-act="goto" data-tab="hist">Ver histórico</button>' : ''}</div></section>`;
  }
  if (!pode('escala:completa')) return h + resultado(g) + '</section>';

  // presença
  const cont = (s) => ps.filter((p) => status(p, g) === s).length;
  h += `<div class="card"><div class="grp-h"><h2>Presença</h2><span class="count">${cont('p')} presentes · ${cont('na')} não atendem · ${cont('sup')} no suporte · ${cont('f')} faltas · ${cont('a')} ausentes${cont('lic') ? ` · ${cont('lic')} de licença` : ''}</span></div>`;
  if (editar) h += `<p class="muted" style="margin:0;font-size:.88rem">Escolha o status de cada pessoa. “Não atende” está na gira mas não atende: entra no sorteio como cambone. “Suporte” fica fora do sorteio.</p>`;
  FUNCOES.forEach((f) => {
    const gp = ps.filter((p) => p.funcao === f.k);
    if (!gp.length) return;
    const np = gp.filter((p) => presente(p, g)).length;
    h += `<div class="grp"><div class="grp-h"><h3>${f.pl}</h3><span class="count">${np}/${gp.length}
      ${editar ? `<button class="btn link" data-act="todos" data-f="${f.k}" data-v="${np === gp.length ? 'a' : 'p'}">${np === gp.length ? 'marcar ausentes' : 'todos presentes'}</button>` : ''}</span></div>
      <div class="plist">${gp.map((p) => {
        const s = status(p, g);
        const xp = p.experiente && p.funcao === 'medium' ? ' <span class="xp" title="Pode ter médium de passe junto" aria-label="Pode ter médium de passe junto">★</span>' : '';
        const hoje = funcaoNaGira(p, g) !== p.funcao ? ' <span class="badge rep" title="Esta entidade não está nas linhas da pessoa">hoje: cambone</span>' : '';
        const lic = licencaEm(p, g.data);
        const ctl = lic
          ? `<span class="badge lic" title="De licença de ${dDM(lic.inicio)} a ${dDM(lic.fim)}">de licença até ${dDM(lic.fim)}</span>`
          : editar
          ? `<select class="st" id="st-${p.id}" data-act="status" data-id="${p.id}" aria-label="Status de ${esc(p.nome)}">${STATUS_KEYS.map((k) => `<option value="${k}" ${k === s ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}</select>`
          : `<span class="st-txt">${STATUS[s]}</span>`;
        return `<div class="pres ${classeStatus(s)}"><span class="nm">${esc(p.nome)}${xp}${hoje}</span>${ctl}</div>`;
      }).join('')}</div></div>`;
  });
  h += `</div>`;

  // duplas
  const { lista, validos, passesV, semPasse, invalidos } = paresPorMedium(estado.pessoas, g);
  const map = custos(girasLista(), g.data, 'pares');
  const mapP = custos(girasLista(), g.data, 'passes');
  const psg = pessoasDaGira(ps, g);
  const camsPres = psg.filter((p) => cambonaHoje(p, g));
  const passPres = psg.filter((p) => presente(p, g) && p.funcao === 'passe');
  // Quem está no Suporte também pode ser posto como cambone (sai do Suporte).
  const doSuporte = psg.filter((p) => status(p, g) === 'sup');
  const grupoSup = (lista, fn) => (lista.length ? `<optgroup label="Do Suporte">${lista.map(fn).join('')}</optgroup>` : '');
  const selo = (e) => (!e ? `<span class="badge new">1ª vez juntos</span>`
    : e.recente ? `<span class="badge hot">repetiu da última</span>`
      : `<span class="badge rep">${e.n + 1}ª vez · última ${dDM(e.ultima)}</span>`);
  const passada = g.data < hoje();
  const linha = (k, p, idx, opts, mp, rotulo) => {
    const quem = editar
      ? `<select id="sel-${k}-${idx}" data-act="troca" data-k="${k}" data-i="${idx}" aria-label="Trocar">${opts.map((c) => `<option value="${c.id}" ${c.id === p.c ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}${k === 'pares' ? grupoSup(doSuporte, (c) => `<option value="${c.id}">${esc(c.nome)}</option>`) : ''}</select>`
      : `<span class="nmc">${esc(nome(p.c))}</span>`;
    const fixar = editar && !passada
      ? `<button class="lock" data-act="fixo" data-k="${k}" data-i="${idx}" aria-pressed="${!!p.fixo}" title="Manter no próximo sorteio">${p.fixo ? 'Fixada' : 'Fixar'}</button>`
      : p.fixo ? '<span class="badge rep">fixada</span>' : '';
    return `<div class="camrow">${rotulo ? `<span class="tag ${rotulo === 'Cambone' ? 'cam' : ''}">${rotulo}</span>` : ''}${quem}${selo(mp[p.m + '|' + p.c])}${p.remanejado ? '<span class="badge re">remanejado</span>' : ''}${fixar}</div>`;
  };
  const temDuplas = validos.length || passesV.length;
  // Ajuste manual: em gira passada fica sempre ligado (registrar como foi);
  // nas outras, o admin liga pelo botão.
  const manual = editar && (passada || estado.manual === g.data);
  const comQuem = (id, k) => (g[k] || []).filter((p) => p.c === id).map((p) => nome(p.m));
  const adicionar = (x) => {
    const naoCam = new Set(x.cams.map((p) => p.c));
    const cams = camsPres.filter((c) => c.id !== x.m.id && !naoCam.has(c.id));
    const sups = doSuporte.filter((c) => c.id !== x.m.id);
    const naoPas = new Set(x.passes.map((p) => p.c));
    const pas = passPres.filter((c) => !naoPas.has(c.id));
    const opt = (c, k, txt) => { const j = comQuem(c.id, k); return `<option value="${c.id}">${esc(c.nome)}${j.length ? ` (${txt} ${esc(j.join(', '))})` : ''}</option>`; };
    return `<div class="addrow">
      ${cams.length || sups.length ? `<select data-act="addcam" data-m="${x.m.id}" aria-label="Adicionar cambone a ${esc(x.m.nome)}"><option value="">+ cambone</option>${cams.map((c) => opt(c, 'pares', 'também com')).join('')}${grupoSup(sups, (c) => opt(c, 'pares', 'também com'))}</select>` : ''}
      ${pas.length ? `<select data-act="addpasse" data-m="${x.m.id}" aria-label="Adicionar médium de passe a ${esc(x.m.nome)}"><option value="">+ médium de passe</option>${pas.map((c) => opt(c, 'passes', 'sai de')).join('')}</select>` : ''}
    </div>`;
  };
  h += `<div class="card"><div class="grp-h"><h2>Médiuns e cambones</h2>
      <div class="row">${sortearOk ? (temDuplas
        ? '<button class="btn primary" data-act="remanejar">Remanejar faltas</button><button class="btn" data-act="sortear">Sortear tudo de novo</button>'
        : '<button class="btn primary" data-act="sortear">Sortear</button>') : ''}
      ${editar && !passada ? `<button class="btn" data-act="manual" aria-pressed="${manual}">${manual ? 'Concluir ajuste' : 'Ajuste manual'}</button>` : ''}
      ${editar && (temDuplas || existe) && estado.confirm !== 'enc:' + g.data ? `<button class="btn" data-act="askdel" data-k="enc:${g.data}">Encerrar gira</button>` : ''}</div></div>`;
  if (editar && estado.confirm === 'enc:' + g.data) {
    const a = g.atendimentos || {};
    h += `<div class="infobox enc"><span><b>Encerrar a gira.</b> Quantas pessoas foram atendidas? (pode ser 0)</span>
      <div class="row">${ATEND.map(([k, t]) => `<label class="field" style="flex:1 1 90px">${t}<input type="number" inputmode="numeric" min="0" step="1" id="at-${k}" value="${a[k] ?? 0}"></label>`).join('')}</div>
      <span class="muted" style="font-size:.85rem">Quem estava para cambonar e não ficou com nenhum médium, e médium de passe sem médium, vão para o <b>Suporte</b>. Depois disso a escala não muda até ser reaberta; ao reabrir, essas pessoas voltam para a lista.</span>
      <span class="row"><button class="btn small primary" data-act="encerrar">Encerrar</button><button class="btn small" data-act="cancelenc">Cancelar</button></span></div>`;
  }
  if (manual) h += `<p class="muted" style="margin:0;font-size:.88rem">${passada ? '<b>Gira passada:</b> registre como foi. ' : ''}Adicione ou tire cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone, e o médium de passe pode ir com qualquer médium.</p>`;
  if (invalidos && sortearOk) h += `<div class="warnbox">${invalidos} dupla(s) envolvem alguém que faltou ou mudou de status. Toque em <b>Remanejar faltas</b> para ajustar só essas, sem mexer nas outras.</div>`;
  if (validos.length && semPasse.length) h += `<div class="warnbox">${semPasse.map(nome).map(esc).join(', ')} ainda sem médium.${manual ? ' Adicione no médium com quem foi.' : sortearOk ? (ps.some((p) => p.funcao === 'medium' && p.experiente) ? ' Sorteie de novo.' : ' Marque na aba Pessoas quais médiuns podem ter passe junto.') : ''}</div>`;
  if (!lista.length) h += `<p class="muted">Nenhum médium presente.</p>`;
  else if (!temDuplas && !manual) h += `<p class="muted">${lista.length} médiuns e extras, ${camsPres.length} cambones e ${passPres.length} médiuns de passe presentes.${sortearOk ? ' Toque em sortear para montar as duplas.' : ' As duplas ainda não foram sorteadas.'}</p>`;
  else {
    const tirar = (k, i) => (manual ? `<button class="lock rm" data-act="remover" data-k="${k}" data-i="${i}" title="Tirar deste médium" aria-label="Tirar">✕</button>` : '');
    h += `<div class="pairs">`;
    lista.forEach((x) => {
      h += `<div class="pair"><span class="med"><span class="tag med-t">${x.m.funcao === 'extra' ? 'At. Extra' : 'Médium'}</span>${esc(x.m.nome)}</span><span class="muted" style="font-size:.85rem">${x.cams.length} cambone${x.cams.length === 1 ? '' : 's'}</span><div class="cams">`;
      x.cams.forEach((p) => { const i = (g.pares || []).indexOf(p); h += linha('pares', p, i, camsPres, map, 'Cambone').replace(/<\/div>$/, tirar('pares', i) + '</div>'); });
      if (!x.cams.length) h += `<span class="muted">Sem cambone.${manual ? '' : sortearOk ? ' Sorteie de novo.' : ''}</span>`;
      x.passes.forEach((p) => { const i = (g.passes || []).indexOf(p); h += linha('passes', p, i, passPres, mapP, 'Passe').replace(/<\/div>$/, tirar('passes', i) + '</div>'); });
      if (manual) h += adicionar(x);
      h += `</div></div>`;
    });
    h += `</div>`;
  }
  const sup = ps.filter((p) => status(p, g) === 'sup');
  if (sup.length) h += `<div class="grp"><div class="grp-h"><h3>Suporte</h3><span class="count">${sup.length}</span></div><p style="margin:0">${sup.map((p) => esc(p.nome)).join(', ')}</p></div>`;
  h += blocosFora(ps, g);
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
  encerrar() {
    const at = {};
    for (const [k, t] of ATEND) {
      const v = (document.getElementById('at-' + k)?.value || '').trim() || '0';   // em branco = 0
      if (!/^\d+$/.test(v)) { toast(`Número inválido em ${t}.`); document.getElementById('at-' + k)?.focus(); return; }
      at[k] = Number(v);
    }
    estado.confirm = null;
    encerrarGira(at);
  },
  reabrir: () => reabrirGira(),
  cancelenc() { estado.confirm = null; avisar(); },
  manual() {
    const d = giraAtual().data;
    estado.manual = estado.manual === d ? null : d;
    avisar();
  },
  remover(el) {
    const k = el.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).filter((_, i) => i !== +el.dataset.i) });
    avisar();
  },
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

// Quem estava no Suporte e foi posto como cambone volta para a gira:
// cambone (na função do dia) fica Presente; outra função fica "Não atende" (cambona).
function saiDoSuporte(g, id) {
  const p = pessoasDaGira(estado.pessoas, g).find((x) => x.id === id);
  if (!p || status(p, g) !== 'sup') return {};
  const presenca = { ...(g.presenca || {}) };
  if (p.funcao === 'cambone') delete presenca[id]; else presenca[id] = 'na';
  return { presenca };
}

export const mudancas = {
  entidade(t) { editarGira({ entidade: t.value }); avisar(); },
  data(t) { if (t.value) { prefs.data = t.value; salvarPrefs(); avisar(); } },
  status(t) {
    const g = giraAtual();
    const pr = { ...(g.presenca || {}) };
    if (t.value === 'p') delete pr[t.dataset.id]; else pr[t.dataset.id] = t.value;
    editarGira({ presenca: pr });
    avisar();
  },
  // Cambone pode acompanhar mais de um médium; médium de passe fica com um só (sai do anterior).
  addcam(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ pares: [...(g.pares || []), { m: t.dataset.m, c: t.value, fixo: false, remanejado: false }], ...saiDoSuporte(g, t.value) });
    avisar();
  },
  addpasse(t) {
    if (!t.value) return;
    const g = giraAtual();
    editarGira({ passes: [...(g.passes || []).filter((p) => p.c !== t.value), { m: t.dataset.m, c: t.value, fixo: false, remanejado: false }] });
    avisar();
  },
  troca(t) {
    const k = t.dataset.k;
    const g = giraAtual();
    editarGira({ [k]: (g[k] || []).map((p, i) => (i === +t.dataset.i ? { ...p, c: t.value } : p)), ...(k === 'pares' ? saiDoSuporte(g, t.value) : {}) });
    avisar();
  },
};
