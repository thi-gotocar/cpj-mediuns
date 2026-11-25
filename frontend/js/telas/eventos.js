// Tela "Eventos": o admin cadastra os eventos da casa (data "31/10" e nome).
// Todos veem os dos próximos 7 dias no topo da aba Gira.

import { lerDataCurta, dataCurta, TIPOS_EVENTO, TIPOS_TODOS_ALUNOS, rotuloTipo } from '/shared/eventos.js';
import { estado, pode, acaoEventos, carregarEventosTipos, salvarEventoTipo, avisar } from '../estado.js';
import { esc, toast, hoje, wd, ajustarRolagem } from '../util.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const U = () => (estado.evUi ||= { novo: null, editar: null, passados: false });
// Tipos cadastrados (carregados ao abrir o cadastro de eventos); antes de chegarem, os quatro de sempre.
const listaTipos = () => estado.eventosTipos?.tipos?.map((t) => [t.chave, t.nome]) || TIPOS_EVENTO;
const seletorTipo = (atual = 'evento') => `<label class="field ev-tipo">Tipo<select name="tipo">${listaTipos().map(([k, l]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
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
  return `<div class="ev-l${e.data === hoje() ? ' hoje' : ''}"><span class="ev-dia">${dia(e.data)}</span><span class="ev-nome">${esc(e.nome)} <span class="evs-tipo ${e.tipo || 'evento'}">${esc(rotuloTipo(e))}</span></span>
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

// Blocos de eventos (no card 📅 Eventos da aba Geral, pelo ＋ Evento do root): 1) cadastrar evento (admin); 2) eventos cadastrados, por mês.
// Os dois começam minimizados. Na lista aparecem até 3 meses; o resto rola dentro do bloco.
// embutido: dentro de um bloco que já abre e fecha (o card da Geral), os dois vêm abertos, sem card próprio.
export function blocosEventos(embutido = false) {
  const editar = pode('usuarios:gerenciar');   // só o admin root (o servidor confere)
  if (editar && estado.eventosTipos === null) { estado.eventosTipos = undefined; carregarEventosTipos(); }
  const evs = estado.eventos || [];
  const u = U();
  const fim = embutido ? '' : '</div>';
  let h = '';
  if (editar) {
    const aberto = embutido || !!u.novo;
    h += `${embutido ? '' : `<div class="card adm"><button class="grp-h dobra" data-act="evnovo" aria-expanded="${aberto}"><h2>＋ Cadastrar evento</h2><span class="count"><span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`}
      ${aberto ? `<form id="f-evento" class="ev-form" autocomplete="off">
        <label class="field ev-data">Data<input type="text" id="ev-data" name="data" inputmode="numeric" maxlength="10" data-mascara="data" required placeholder="31/10"></label>
        ${seletorTipo(estado.evUi?.ultimoTipo)}
        <label class="field grow">Nome<input type="text" id="ev-nome" name="nome" maxlength="120" required placeholder="Ex.: Festa de Iemanjá"></label>
        <span class="row ev-bts"><button class="btn primary" type="submit">Cadastrar</button></span></form>
        <p class="muted ev-dica">Digite só dia e mês (3110 vira 31/10). Se a data deste ano já passou há mais de 2 meses, fica para o ano que vem; para outro ano, continue digitando o ano (31/10/2027).</p>` : ''}${fim}`;
  }
  const aberto = embutido || !!u.lista;
  h += embutido ? `<div class="ev-sec-h"><h3 class="root-sub">📅 Eventos cadastrados</h3><span class="count">${evs.length}</span></div>` : `<div class="card"><button class="grp-h dobra" data-act="evlista" aria-expanded="${aberto}"><h2>📅 Eventos cadastrados</h2><span class="count">${evs.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + fim;
  if (!evs.length) return h + '<p class="muted" style="margin:0">Nenhum evento cadastrado.</p>' + fim;
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
  return h + fim;
}

// Tipos de evento (no cadastro de eventos da aba Geral): o root cria e edita o nome e as turmas de alunos que veem.
// A corrente vê todos os tipos; gira e evento, todos os alunos.
function formTipo(t) {
  const todos = t && TIPOS_TODOS_ALUNOS.includes(t.chave);
  const turmas = estado.eventosTipos?.turmas || [];
  const marcadas = new Set(t?.turmas || []);
  const escolha = todos ? '<p class="muted evt-nota">Todos os alunos veem este tipo.</p>'
    : turmas.length ? `<fieldset class="evt-turmas"><legend>Turmas de alunos que veem</legend>${turmas.map((x) => `<label class="evt-ck"><input type="checkbox" name="turma" value="${x.id}" ${marcadas.has(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}</fieldset>`
      : '<p class="muted evt-nota">Nenhuma turma de alunos cadastrada: só a corrente vê este tipo.</p>';
  return `<form id="f-evtipo" class="ev-form" data-chave="${t?.chave || ''}" autocomplete="off">
    <label class="field grow">Nome do tipo<input type="text" name="nome" maxlength="40" required value="${esc(t?.nome || '')}" placeholder="Ex.: Festa"></label>
    ${escolha}
    <span class="row ev-bts"><button class="btn small primary" type="submit">${t ? 'Salvar' : 'Criar tipo'}</button><button class="btn small" type="button" data-act="evtipocancelar">Cancelar</button></span></form>`;
}

function quemVe(t) {
  if (TIPOS_TODOS_ALUNOS.includes(t.chave)) return 'Todos os alunos';
  const nomes = (estado.eventosTipos?.turmas || []).filter((x) => t.turmas.includes(x.id)).map((x) => x.nome);
  return nomes.length ? 'Alunos: ' + nomes.join(', ') : 'Só a corrente';
}

// Os quatro de sempre não têm Excluir (o app usa as chaves); o servidor também recusa tipo com eventos.
function botaoExcluirTipo(t) {
  if (TIPOS_EVENTO.some(([k]) => k === t.chave)) return '';
  return estado.confirm === 'evt:' + t.chave
    ? `<button class="btn small danger" data-act="evtipoexcluir" data-k="${t.chave}">Confirmar</button>`
    : `<button class="btn small" data-act="askdel" data-k="evt:${t.chave}">Excluir</button>`;
}

export function blocoTipos() {
  if (!pode('usuarios:gerenciar')) return '';
  const u = U();
  const et = estado.eventosTipos;
  // Começa minimizado; tocar no título expande e recolhe.
  const aberto = !!u.tipos;
  let h = `<button class="grp-h dobra ev-sec-h" data-act="evtipos" aria-expanded="${aberto}"><h3 class="root-sub">🏷️ Tipos de evento</h3>
    <span class="count">${et ? et.tipos.length : ''} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h;
  if (!et) return h + '<p class="muted" style="margin:0">Carregando…</p>';
  h += '<p class="muted evt-nota">A corrente vê todos os tipos. Gira e Evento aparecem para todos os alunos; os outros, só para as turmas marcadas no tipo.</p>';
  h += `<div class="ev-lista">${et.tipos.map((t) => (u.tipoEd === t.chave ? formTipo(t)
    : `<div class="ev-l evt-l"><span class="ev-nome"><span class="evs-tipo ${t.chave}">${esc(t.nome)}</span></span><span class="muted evt-quem">${esc(quemVe(t))}</span>
      <span class="ev-acts"><button class="btn small" data-act="evtipoeditar" data-k="${t.chave}">Editar</button>${botaoExcluirTipo(t)}</span></div>`)).join('')}</div>`;
  h += u.tipoEd === '' ? formTipo(null) : '<button class="btn small" data-act="evtiponovo">＋ Novo tipo</button>';
  return h;
}

export async function enviarTipo(form) {
  const nome = form.elements.nome.value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome do tipo.'); form.elements.nome.focus(); return; }
  const chave = form.dataset.chave || '';
  const turmas = [...form.querySelectorAll('input[name="turma"]:checked')].map((x) => x.value);
  if (await salvarEventoTipo({ chave, nome, turmas })) {
    U().tipoEd = null;
    toast(chave ? 'Tipo alterado.' : 'Tipo criado.');
    avisar();
  }
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
    setTimeout(ajustarRolagem, 0);
  },
  evlista(el) { U().lista = el.getAttribute('aria-expanded') !== 'true'; avisar(); },
  eveditar(el) { U().editar = el.dataset.id; avisar(); },
  evcancelar() { U().editar = null; avisar(); },
  evpassados() { U().passados = !U().passados; avisar(); },
  evtipos() { U().tipos = !U().tipos; avisar(); },
  evtiponovo() { U().tipoEd = ''; avisar(); },
  evtipoeditar(el) { U().tipoEd = el.dataset.k; avisar(); },
  evtipocancelar() { U().tipoEd = null; avisar(); },
  async evtipoexcluir(el) { estado.confirm = null; if (await salvarEventoTipo({ chave: el.dataset.k }, 'excluirEventoTipo')) toast('Tipo excluído.'); },
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
