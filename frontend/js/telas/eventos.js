// Tela "Eventos": o admin cadastra os eventos da casa (data "31/10" e nome).
// Todos veem os dos próximos 7 dias no topo da aba Gira.

import { lerDataCurta, dataCurta, TIPOS_EVENTO, TIPO_EVENTO_LABEL } from '/shared/eventos.js';
import { estado, pode, acaoEventos, avisar } from '../estado.js';
import { esc, toast, hoje, wd } from '../util.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const U = () => (estado.evUi ||= { novo: null, editar: null, passados: false });
const seletorTipo = (atual = 'evento') => `<label class="field ev-tipo">Tipo<select name="tipo">${TIPOS_EVENTO.map(([k, l]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
const dia = (d) => `${wd(d).replace(/^./, (c) => c.toUpperCase())} ${dataCurta(d)}`;

function linha(e, editar) {
  const u = U();
  if (editar && u.editar === e.id) {
    return `<form id="f-evento-ed" class="ev-form" data-id="${e.id}" autocomplete="off">
      <label class="field ev-data">Data<input type="text" name="data" inputmode="numeric" maxlength="10" required value="${dataCurta(e.data)}/${e.data.slice(0, 4)}" placeholder="31/10"></label>
      ${seletorTipo(e.tipo)}
      <label class="field grow">Nome<input type="text" name="nome" maxlength="120" required value="${esc(e.nome)}"></label>
      <span class="row ev-bts"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="evcancelar">Cancelar</button></span></form>`;
  }
  const conf = estado.confirm === 'ev:' + e.id;
  return `<div class="ev-l${e.data === hoje() ? ' hoje' : ''}"><span class="ev-dia">${dia(e.data)}</span><span class="ev-nome">${esc(e.nome)} <span class="evs-tipo ${e.tipo || 'evento'}">${TIPO_EVENTO_LABEL[e.tipo] || 'Evento'}</span></span>
    ${editar ? `<span class="ev-acts"><button class="btn small" data-act="eveditar" data-id="${e.id}">Editar</button>
      ${conf ? `<button class="btn small danger" data-act="evexcluir" data-id="${e.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="ev:${e.id}">Excluir</button>`}</span>` : ''}</div>`;
}

function cardMes(chave, lista, editar) {
  const [a, m] = chave.split('-');
  return `<div class="card"><div class="grp-h"><h2>${MESES[Number(m) - 1]} <span class="muted ev-ano">${a}</span></h2><span class="count">${lista.length}</span></div>
    <div class="ev-lista">${lista.map((e) => linha(e, editar)).join('')}</div></div>`;
}

export function render() {
  const editar = pode('eventos:editar');
  const evs = estado.eventos || [];
  const u = U();
  let h = '<section class="panel">';
  if (editar) {
    const aberto = u.novo ?? !evs.length;
    h += `<div class="card"><button class="grp-h dobra" data-act="evnovo" aria-expanded="${aberto}"><h2>＋ Cadastrar evento</h2><span class="count"><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
      ${aberto ? `<form id="f-evento" class="ev-form" autocomplete="off">
        <label class="field ev-data">Data<input type="text" id="ev-data" name="data" inputmode="numeric" maxlength="10" required placeholder="31/10"></label>
        ${seletorTipo(estado.evUi?.ultimoTipo)}
        <label class="field grow">Nome<input type="text" id="ev-nome" name="nome" maxlength="120" required placeholder="Ex.: Festa de Iemanjá"></label>
        <span class="row ev-bts"><button class="btn primary" type="submit">Cadastrar</button></span></form>
        <p class="muted" style="margin:0;font-size:.82rem">Digite só dia e mês (31/10). Se a data deste ano já passou há mais de 2 meses, fica para o ano que vem; para outro ano, digite 31/10/2027.</p>` : ''}</div>`;
  }
  if (!evs.length) return h + `<div class="card empty"><p class="muted">Nenhum evento cadastrado.</p></div></section>`;
  // Um bloco por mês: o mês atual e os próximos em cima; os que já passaram, no fim.
  const mesAtual = hoje().slice(0, 7);
  const porMes = {};
  evs.forEach((e) => { (porMes[e.data.slice(0, 7)] ||= []).push(e); });
  const chaves = Object.keys(porMes);
  const futuros = chaves.filter((k) => k >= mesAtual).sort();
  const passados = chaves.filter((k) => k < mesAtual).sort().reverse();
  futuros.forEach((k) => { h += cardMes(k, porMes[k], editar); });
  if (passados.length) {
    h += `<button class="btn link small" data-act="evpassados">${u.passados ? '▾ Esconder meses anteriores' : `▸ Meses anteriores (${passados.length})`}</button>`;
    if (u.passados) passados.forEach((k) => { h += cardMes(k, porMes[k], editar); });
  }
  return h + '</section>';
}

export const cliques = {
  evnovo(el) { U().novo = el.getAttribute('aria-expanded') !== 'true'; avisar(); if (U().novo) document.getElementById('ev-data')?.focus(); },
  eveditar(el) { U().editar = el.dataset.id; avisar(); },
  evcancelar() { U().editar = null; avisar(); },
  evpassados() { U().passados = !U().passados; avisar(); },
  async evexcluir(el) { estado.confirm = null; if (await acaoEventos('excluirEvento', { id: el.dataset.id })) toast('Evento excluído.'); },
};

// Cadastrar (f-evento) ou salvar a edição (f-evento-ed).
export async function enviar(form) {
  const data = lerDataCurta(form.elements.data.value, hoje());
  const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
  if (!data) { toast('Data inválida. Use o formato 31/10.'); form.elements.data.focus(); return; }
  if (!nome) { toast('Digite o nome do evento.'); form.elements.nome.focus(); return; }
  const id = form.dataset.id || '';
  const tipo = form.elements.tipo.value;
  if (!id) U().ultimoTipo = tipo;
  if (await acaoEventos('evento', { id, data, nome, tipo })) {
    if (id) { U().editar = null; toast('Evento alterado.'); avisar(); return; }
    toast(`Evento cadastrado para ${dataCurta(data)}/${data.slice(0, 4)}.`);
    const d = document.getElementById('ev-data');
    const n = document.getElementById('ev-nome');
    if (d && n) { d.value = ''; n.value = ''; d.focus(); }
  }
}
