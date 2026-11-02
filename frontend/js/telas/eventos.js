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
      <label class="field ev-data">Data<input type="text" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required value="${dataCurta(e.data)}/${e.data.slice(0, 4)}" placeholder="31/10"></label>
      ${seletorTipo(e.tipo)}
      <label class="field grow">Nome<input type="text" name="nome" maxlength="120" required value="${esc(e.nome)}"></label>
      <span class="row ev-bts"><button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="evcancelar">Cancelar</button></span></form>`;
  }
  const conf = estado.confirm === 'ev:' + e.id;
  return `<div class="ev-l${e.data === hoje() ? ' hoje' : ''}"><span class="ev-dia">${dia(e.data)}</span><span class="ev-nome">${esc(e.nome)} <span class="evs-tipo ${e.tipo || 'evento'}">${TIPO_EVENTO_LABEL[e.tipo] || 'Evento'}</span></span>
    ${editar ? `<span class="ev-acts"><button class="btn small" data-act="eveditar" data-id="${e.id}">Editar</button>
      ${conf ? `<button class="btn small danger" data-act="evexcluir" data-id="${e.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="ev:${e.id}">Excluir</button>`}</span>` : ''}</div>`;
}

// Um mês dentro do bloco "Eventos cadastrados": começa minimizado; tocar no nome expande.
function blocoMes(chave, lista, editar) {
  const [a, m] = chave.split('-');
  const aberto = (U().meses ||= new Set()).has(chave);
  return `<div class="ev-mes"><button class="ev-mes-h dobra" data-act="evmes" data-k="${chave}" aria-expanded="${aberto}"><b>${MESES[Number(m) - 1]}</b> <span class="muted ev-ano">${a}</span><span class="count">${lista.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
    ${aberto ? `<div class="ev-lista">${lista.map((e) => linha(e, editar)).join('')}</div>` : ''}</div>`;
}

// Blocos de eventos (ficam na aba Gira, abaixo do card 📅 Eventos): 1) cadastrar evento (admin); 2) eventos cadastrados, por mês.
// Os dois começam minimizados. Na lista aparecem até 3 meses; o resto rola dentro do bloco.
export function blocosEventos() {
  const editar = pode('eventos:editar');
  const evs = estado.eventos || [];
  const u = U();
  let h = '';
  if (editar) {
    const aberto = !!u.novo;
    h += `<div class="card adm"><button class="grp-h dobra" data-act="evnovo" aria-expanded="${aberto}"><h2>＋ Cadastrar evento</h2><span class="count"><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
      ${aberto ? `<form id="f-evento" class="ev-form" autocomplete="off">
        <label class="field ev-data">Data<input type="text" id="ev-data" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required placeholder="31/10"></label>
        ${seletorTipo(estado.evUi?.ultimoTipo)}
        <label class="field grow">Nome<input type="text" id="ev-nome" name="nome" maxlength="120" required placeholder="Ex.: Festa de Iemanjá"></label>
        <span class="row ev-bts"><button class="btn primary" type="submit">Cadastrar</button></span></form>
        <p class="muted" style="margin:0;font-size:.82rem">Digite só dia e mês (3110 vira 31/10). Se a data deste ano já passou há mais de 2 meses, fica para o ano que vem; para outro ano, continue digitando o ano (31/10/2027).</p>` : ''}</div>`;
  }
  const aberto = !!u.lista;
  h += `<div class="card"><button class="grp-h dobra" data-act="evlista" aria-expanded="${aberto}"><h2>📅 Eventos cadastrados</h2><span class="count">${evs.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  if (!evs.length) return h + '<p class="muted" style="margin:0">Nenhum evento cadastrado.</p></div>';
  // O mês atual e os próximos em cima; os que já passaram, no fim (escondidos).
  const mesAtual = hoje().slice(0, 7);
  const porMes = {};
  evs.forEach((e) => { (porMes[e.data.slice(0, 7)] ||= []).push(e); });
  const chaves = Object.keys(porMes);
  const futuros = chaves.filter((k) => k >= mesAtual).sort();
  const passados = chaves.filter((k) => k < mesAtual).sort().reverse();
  h += `<div class="rolar3" data-rolar="3">${futuros.map((k) => blocoMes(k, porMes[k], editar)).join('')}${u.passados ? passados.map((k) => blocoMes(k, porMes[k], editar)).join('') : ''}</div>`;
  if (!futuros.length && !u.passados) h += '<p class="muted" style="margin:0">Nenhum evento daqui para frente.</p>';
  if (passados.length) h += `<button class="btn link small" data-act="evpassados">${u.passados ? '▾ Esconder meses anteriores' : `▸ Meses anteriores (${passados.length})`}</button>`;
  return h + '</div>';
}

export function render() {
  return `<section class="panel">${blocosEventos()}</section>`;
}

// Campo de data no celular (teclado só de números): a barra entra sozinha.
// "3110" → "31/10" · "31102027" → "31/10/2027". Ao apagar, não põe a barra de volta.
export function mascaraData(el, apagando) {
  const d = el.value.replace(/\D/g, '').slice(0, 8);
  let v = d.slice(0, 2);
  if (d.length > 2 || (d.length === 2 && !apagando)) v += '/' + d.slice(2, 4);
  if (d.length > 4 || (d.length === 4 && !apagando)) v += '/' + d.slice(4, 8);
  el.value = v;
}

export const cliques = {
  evnovo(el) { U().novo = el.getAttribute('aria-expanded') !== 'true'; avisar(); if (U().novo) document.getElementById('ev-data')?.focus(); },
  evmes(el) {
    const s = (U().meses ||= new Set());
    if (s.has(el.dataset.k)) s.delete(el.dataset.k); else s.add(el.dataset.k);
    avisar();
  },
  evlista(el) { U().lista = el.getAttribute('aria-expanded') !== 'true'; avisar(); },
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
