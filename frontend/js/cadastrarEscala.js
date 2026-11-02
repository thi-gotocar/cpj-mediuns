// Histórico → Giras salvas → Cadastrar escala: cola o texto da escala de atendimentos, confere e grava
// quem cambonou quem (e os médiuns de passe) numa gira que já foi. Tudo o que ficou em dúvida aparece
// em vermelho com um combo para escolher e o botão Aceitar; só grava depois de aceitar todos.

import { lerEscala, nomesDaEscala, montarEscala } from '/shared/escalaTexto.js';
import { casarNomes } from '/shared/resumo.js';
import { OPCOES_GIRA, ORIXAS, nomeGira, linhaDaEntidade, giraEspecial, temOrixa, contaNaPresenca, naCorrenteEm, licencaEm } from '/shared/regras.js';
import { estado, pessoasOrd, cadastrarEscala, avisar } from './estado.js';
import { esc, toast, hoje } from './util.js';

const E = () => estado.escalaTxt;
const pessoas = () => pessoasOrd().filter(contaNaPresenca);
const dataBR = (d) => d.split('-').reverse().join('/');

function pendentes(x) {
  if (!x.lido) return 0;
  return x.nomes.filter((n) => n.duvida && !n.aceito).length + x.int.filter((i) => !i.aceito).length
    + (x.lido.semAno && !x.dataOk ? 1 : 0) + (x.lido.gira && !x.giraReconhecida && !x.giraOk ? 1 : 0);
}

const opcoesPessoa = (escolhido, candidatos, ps, vazio) => `<option value="" ${escolhido ? '' : 'selected'}>${vazio}</option>
  ${candidatos.length ? `<optgroup label="Parecidos">${candidatos.map((nm) => { const p = ps.find((y) => y.nome === nm); return p ? `<option value="${p.id}" ${escolhido === p.id ? 'selected' : ''}>${esc(p.nome)}</option>` : ''; }).join('')}</optgroup>` : ''}
  <optgroup label="Todos">${ps.map((p) => `<option value="${p.id}" ${escolhido === p.id && !candidatos.includes(p.nome) ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</optgroup>`;

function conferencia(x, ps) {
  const falta = pendentes(x);
  let h = `<div class="ga-rel"><div class="grp-h"><b>Escala lida</b><span class="count">${falta ? `<span class="dv-n">${falta} para conferir</span>` : '<span class="ok-n">tudo conferido</span>'}</span></div>`;
  if (x.lido.semAno) {
    h += `<div class="dv ${x.dataOk ? 'ok' : ''}"><span>A data veio sem o ano: considerei <b>${dataBR(x.data)}</b>. Se não for, corrija a data acima.</span>
      <button class="btn small" data-act="esaceitar" data-k="data">${x.dataOk ? 'Aceito ✓' : 'Aceitar'}</button></div>`;
  }
  if (x.lido.gira && !x.giraReconhecida) {
    h += `<div class="dv ${x.giraOk ? 'ok' : ''}"><span>Não reconheci a gira “${esc(x.lido.gira)}”. Escolha a gira acima (ou deixe sem).</span>
      <button class="btn small" data-act="esaceitar" data-k="gira">${x.giraOk ? 'Aceito ✓' : 'Aceitar'}</button></div>`;
  }
  x.nomes.forEach((n, i) => {
    if (!n.duvida) return;
    const motivo = n.provavelId ? 'reconhecido por aproximação' : n.candidatos.length ? 'mais de uma pessoa parecida' : 'não achei na corrente';
    h += `<div class="dv ${n.aceito ? 'ok' : ''}"><label class="field ga-map"><span>“${esc(n.lido)}” · <i>${motivo}</i></span>
      <select data-act="esmap" data-i="${i}">${opcoesPessoa(n.escolhido, n.candidatos, ps, '— ignorar (não marcar ninguém) —')}</select></label>
      <button class="btn small" data-act="esaceitar" data-k="nome" data-i="${i}">${n.aceito ? 'Aceito ✓' : 'Aceitar'}</button></div>`;
  });
  x.int.forEach((it, i) => {
    h += `<div class="dv ${it.aceito ? 'ok' : ''}"><label class="field ga-map"><span>Cambone de <b>${esc(it.medium)}</b> não informado (“?”)</span>
      <select data-act="esint" data-i="${i}">${opcoesPessoa(it.escolhido, [], ps, '— ninguém —')}</select></label>
      <button class="btn small" data-act="esaceitar" data-k="int" data-i="${i}">${it.aceito ? 'Aceito ✓' : 'Aceitar'}</button></div>`;
  });
  return h + '</div>';
}

// Como vai ficar, com os nomes do cadastro (o que foi ignorado aparece riscado).
function previa(x, ps) {
  const nome = (lido) => {
    const n = x.nomes.find((y) => y.lido === lido);
    const p = n?.escolhido && ps.find((y) => y.id === n.escolhido);
    return p ? esc(p.nome) : `<s class="muted">${esc(lido)}</s>`;
  };
  const linha = (it) => {
    const cs = [...it.cambones.map(nome), ...x.int.filter((y) => y.medium === it.nome).map((y) => (y.escolhido ? esc(ps.find((p) => p.id === y.escolhido)?.nome || '') : '<span class="muted">?</span>'))];
    return `<div class="es-l"><span class="es-m">${nome(it.nome)}</span><span>${it.naoAtende ? '<span class="muted">não atende</span>' : cs.length ? cs.join(', ') : '<span class="muted">sem cambone</span>'}</span></div>`;
  };
  const L = x.lido;
  let h = '<details class="es-prev"><summary>Ver a escala como vai ser gravada</summary>';
  if (L.senha) h += `<p style="margin:0">Senha: <b>${nome(L.senha)}</b></p>`;
  if (L.passes.length) h += `<h4>Médium de passe</h4>${L.passes.map((p) => `<div class="es-l"><span class="es-m">${nome(p.medium)}</span><span>${nome(p.passe)}</span></div>`).join('')}`;
  if (L.cambones.length) h += `<h4>Cambones</h4>${L.cambones.map(linha).join('')}`;
  if (L.extras.length) h += `<h4>At. Extras</h4>${L.extras.map(linha).join('')}`;
  if (L.suporte.length) h += `<h4>Suporte</h4><p style="margin:0">${L.suporte.map(nome).join(', ')}</p>`;
  return h + '</details>';
}

export function cardEscala() {
  const x = E();
  const ps = pessoas();
  let h = `<div class="ga-box"><h2>Cadastrar escala</h2>
    <p class="muted" style="margin:0;font-size:.88rem">Cole o texto da escala de atendimentos. Grava quem cambonou quem e os médiuns de passe de uma gira que já foi (entra no rodízio).</p>
    <details class="ga-colar"${x.lido ? '' : ' open'}><summary>Colar o texto da escala</summary>
      <textarea id="es-msg" rows="8" placeholder="Informações Gerais&#10;* Orixá / Gira do dia: Exus Mirins&#10;* Data: 28/out&#10;…&#10;Quem Cambonou Quem&#10;* Erika: Amanda T8 e Akeline T8">${esc(x.msg || '')}</textarea>
      <button class="btn primary" data-act="esler">Ler escala</button>
    </details>`;
  if (!x.lido) return h + '<div class="row"><button class="btn" data-act="escancelar">Cancelar</button></div></div>';
  h += `<div class="row">
    <label class="field" style="flex:0 1 170px">Data da gira<input type="date" data-act="escampo" data-k="data" value="${esc(x.data)}" max="${hoje()}"></label>
    <label class="field grow">Gira<select data-act="escampo" data-k="entidade"><option value="">— sem gira —</option>
      ${OPCOES_GIRA.map((grp) => `<optgroup label="${grp.grupo}">${grp.itens.map(([, l]) => `<option ${l === x.entidade ? 'selected' : ''}>${l}</option>`).join('')}</optgroup>`).join('')}</select></label>
    ${temOrixa(x) ? `<label class="field" style="flex:0 1 160px">Orixá<select data-act="escampo" data-k="orixa"><option value="">— escolha —</option>${ORIXAS.map((o) => `<option ${o === x.orixa ? 'selected' : ''}>${o}</option>`).join('')}</select></label>` : ''}
  </div>`;
  h += conferencia(x, ps);
  const existe = x.data && estado.giras[x.data];
  h += existe
    ? `<p class="es-aviso">Já existe uma gira salva em ${dataBR(x.data)}: grava só as duplas e a função do dia. A presença e os atendidos ficam como estão.</p>`
    : `<label class="field">Quem não está na escala<select data-act="escampo" data-k="ausentes">
        <option value="a" ${x.ausentes === 'a' ? 'selected' : ''}>Fica como Ausente</option><option value="p" ${x.ausentes === 'p' ? 'selected' : ''}>Fica como Presente</option></select></label>`;
  h += previa(x, ps);
  return h + `<div class="row"><button class="btn primary" data-act="essalvar">Salvar escala</button><button class="btn" data-act="escancelar">Cancelar</button></div></div>`;
}

export const cliquesEscala = {
  esabrir() { estado.escalaTxt = { msg: '' }; avisar(); document.getElementById('es-msg')?.focus(); },
  escancelar() { estado.escalaTxt = null; avisar(); },
  esler() {
    const x = E();
    x.msg = document.getElementById('es-msg').value;
    const r = lerEscala(x.msg, hoje());
    if (!r.cambones.length && !r.extras.length && !r.passes.length) { toast('Não reconheci a escala. Cole o texto com as seções (ex.: “Quem Cambonou Quem”).'); return; }
    const ps = pessoas();
    x.nomes = casarNomes(nomesDaEscala(r), ps).map((c) => {
      const duvida = !c.pessoa || !!c.provavel;
      if (c.provavel && c.pessoa && !c.candidatos.includes(c.pessoa.nome)) c.candidatos = [c.pessoa.nome, ...c.candidatos];
      return { lido: c.lido, candidatos: c.candidatos, duvida, aceito: !duvida, provavelId: c.provavel ? c.pessoa.id : null, escolhido: c.pessoa ? c.pessoa.id : '' };
    });
    x.int = [...r.cambones, ...r.extras].flatMap((it) => Array.from({ length: it.desconhecidos }, (_, i) => ({ chave: `${it.nome}#${i}`, medium: it.nome, escolhido: '', aceito: false })));
    x.lido = r;
    x.data = r.data || '';
    x.dataOk = false;
    // Gira e orixá: "Exus Mirins" vira a gira; um orixá escrito no lugar da gira vira o orixá.
    const giraTxt = r.gira.split(/[/,]/).map((t) => t.trim());
    const ent = giraTxt.find((t) => linhaDaEntidade(t) || giraEspecial(t));
    x.entidade = ent ? nomeGira(ent) : '';
    x.giraReconhecida = !!ent || !r.gira;
    x.giraOk = false;
    x.orixa = ORIXAS.find((o) => giraTxt.some((t) => t.localeCompare(o, 'pt-BR', { sensitivity: 'base' }) === 0)) || '';
    x.ausentes ||= 'a';
    const dv = pendentes(x);
    toast(`Lido: ${r.data ? dataBR(r.data) : 'sem data'} · ${x.nomes.length} nomes${dv ? `, ${dv} para conferir (em vermelho)` : ''}.`);
    avisar();
  },
  // Aceita um ponto em dúvida. Tocar de novo desfaz.
  esaceitar(el) {
    const x = E();
    const k = el.dataset.k;
    if (k === 'nome') x.nomes[+el.dataset.i].aceito = !x.nomes[+el.dataset.i].aceito;
    else if (k === 'int') x.int[+el.dataset.i].aceito = !x.int[+el.dataset.i].aceito;
    else if (k === 'data') x.dataOk = !x.dataOk;
    else x.giraOk = !x.giraOk;
    avisar();
  },
  async essalvar() {
    const x = E();
    const falta = pendentes(x);
    if (falta) { toast(`Confira e aceite os ${falta} ponto${falta > 1 ? 's' : ''} em vermelho antes de gravar.`); document.querySelector('.ga-box .dv:not(.ok)')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!x.data) { toast('Informe a data da gira.'); return; }
    if (x.data > hoje()) { toast('Essa gira ainda não aconteceu. Use a aba Gira para montar a escala.'); return; }
    const ps = pessoas();
    const idDe = (lido) => x.nomes.find((n) => n.lido === lido)?.escolhido || '';
    const int = Object.fromEntries(x.int.map((i) => [i.chave, i.escolhido]));
    const m = montarEscala(x.lido, idDe, int, estado.pessoas);
    const existe = !!estado.giras[x.data];
    const presenca = {};
    if (!existe && x.ausentes === 'a') {
      ps.filter((p) => naCorrenteEm(p, x.data) && !licencaEm(p, x.data) && !m.presentes.includes(p.id)).forEach((p) => { presenca[p.id] = 'a'; });
    }
    const nAus = Object.keys(presenca).length;
    if (!confirm(`Gravar a escala de ${dataBR(x.data)}?\n${m.pares.length} duplas de cambone e ${m.passes.length} de médium de passe.${existe ? '\nA gira já existe: a presença e os atendidos ficam como estão.' : `\nGira nova, já encerrada${nAus ? `, com ${nAus} ausente${nAus > 1 ? 's' : ''} (quem não está na escala)` : ''}.`}`)) return;
    const ok = await cadastrarEscala(x.data, { entidade: x.entidade, orixa: temOrixa(x) ? x.orixa : '', presenca, papeis: m.papeis, pares: m.pares, passes: m.passes });
    if (ok) { estado.escalaTxt = null; avisar(); }
  },
};

export const mudancasEscala = {
  escampo(t) { E()[t.dataset.k] = t.value; avisar(); },
  esmap(t) { const n = E().nomes[+t.dataset.i]; n.escolhido = t.value || ''; n.aceito = false; avisar(); },
  esint(t) { const it = E().int[+t.dataset.i]; it.escolhido = t.value || ''; it.aceito = false; avisar(); },
};
