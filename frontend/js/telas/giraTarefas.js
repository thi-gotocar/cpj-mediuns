// Tarefas da corrente (aba Gira, depois de Quem não vem): a lista fixa da casa em blocos (Pré Gira, Pós Gira…), com o
// responsável de cada tarefa e a caixinha de feito, que vale só para a gira aberta (cada gira começa por fazer).
// Marca o responsável ou quem edita a Gira; só quem edita a Gira cadastra, ordena e cria blocos (botão Editar).
// Lido do servidor quando o bloco aparece (api/giras ?lista=tarefas), como o Vou ao amaci.

import { estado, pode, avisar, giraAtual } from '../estado.js';
import { esc, toast } from '../util.js';
import { api } from '../api.js';

const lendo = new Set();
let editando = false;
let editaTarefa = null;   // id da tarefa aberta para editar
let editaGrupo = null;    // id do bloco com o nome aberto para editar
let ocupado = false;

function ler(data) {
  if (lendo.has(data)) return;
  lendo.add(data);
  api('GET', `/giras?lista=tarefas&data=${data}`)
    .then((r) => { estado.tarefas = { ...(estado.tarefas || {}), [data]: r }; }, () => { estado.tarefas = { ...(estado.tarefas || {}), [data]: { erro: true } }; })
    .finally(() => { lendo.delete(data); avisar(); });
}

const podeMarcar = (t) => pode('giras:editar') || (!!t.responsavelId && t.responsavelId === estado.me?.pessoaId);

const opcoesResp = (sel) => `<option value="">Sem responsável</option>${[...estado.pessoas].filter((p) => !p.saida)
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  .map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;

function linha(t) {
  const meu = !!t.responsavelId && t.responsavelId === estado.me?.pessoaId;
  // Uma linha por tarefa: descrição à esquerda, responsável à direita (o próprio vira "Você"); quem marcou fica no title.
  const resp = meu ? '<b class="tf-voce">Você</b>' : t.responsavel ? esc(t.responsavel) : '';
  const titulo = [t.responsavel && `Responsável: ${t.responsavel}`, t.feito && t.por && `Feito por ${t.por}`].filter(Boolean).join(' · ');
  return `<label class="tf-l${t.feito ? ' feito' : ''}"${titulo ? ` title="${esc(titulo)}"` : ''}>
    <input type="checkbox" data-act="tfmarcar" data-id="${t.id}" ${t.feito ? 'checked' : ''} ${podeMarcar(t) ? '' : 'disabled'} aria-label="${esc(t.descricao)}: feito">
    <span class="tf-d">${esc(t.descricao)}</span>${resp ? `<small class="tf-r">${resp}</small>` : ''}</label>`;
}

function linhaEditar(t, grupos, i, n) {
  if (editaTarefa === t.id) {
    return `<div class="tf-form">
      <input type="text" id="tf-desc-${t.id}" maxlength="80" value="${esc(t.descricao)}" aria-label="Descrição">
      <select id="tf-resp-${t.id}" aria-label="Responsável">${opcoesResp(t.responsavelId)}</select>
      <select id="tf-grupo-${t.id}" aria-label="Bloco">${grupos.map((g) => `<option value="${g.id}" ${g.tarefas.includes(t) ? 'selected' : ''}>${esc(g.nome)}</option>`).join('')}</select>
      <div class="row"><button type="button" class="btn small" data-act="tfcancelar">Cancelar</button><button type="button" class="btn small primary" data-act="tfsalvar" data-id="${t.id}">Salvar</button></div></div>`;
  }
  const conf = estado.confirm === 'tf:' + t.id;
  return `<div class="tf-l tf-ed"><span class="tf-t"><span class="tf-d">${esc(t.descricao)}</span><small class="tf-r">${t.responsavel ? esc(t.responsavel) : '<span class="muted">sem responsável</span>'}</small></span>
    <span class="tf-bts">
      <button type="button" class="btn small" data-act="tfmover" data-id="${t.id}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${esc(t.descricao)}">↑</button>
      <button type="button" class="btn small" data-act="tfmover" data-id="${t.id}" data-v="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer ${esc(t.descricao)}">↓</button>
      <button type="button" class="btn small" data-act="tfeditar" data-id="${t.id}" aria-label="Editar ${esc(t.descricao)}">✎</button>
      <button type="button" class="btn small" data-act="askdel" data-k="tf:${t.id}" aria-label="Excluir ${esc(t.descricao)}">✕</button></span>
    ${conf ? `<div class="tf-conf">Excluir “${esc(t.descricao)}”? <button type="button" class="btn small" data-act="tfnao">Não</button> <button type="button" class="btn small danger" data-act="tfexcluir" data-id="${t.id}">Excluir</button></div>` : ''}</div>`;
}

function cabGrupo(g, i, n) {
  if (!editando) return `<h4 class="tf-g">${esc(g.nome)}</h4>`;
  if (editaGrupo === g.id) {
    return `<div class="tf-form tf-gform"><input type="text" id="tf-gnome-${g.id}" maxlength="40" value="${esc(g.nome)}" aria-label="Nome do bloco">
      <div class="row"><button type="button" class="btn small" data-act="tfcancelar">Cancelar</button><button type="button" class="btn small primary" data-act="tfgsalvar" data-id="${g.id}">Salvar</button></div></div>`;
  }
  const conf = estado.confirm === 'tfg:' + g.id;
  return `<div class="tf-gh"><h4 class="tf-g">${esc(g.nome)}</h4><span class="tf-bts">
      <button type="button" class="btn small" data-act="tfgmover" data-id="${g.id}" data-v="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir o bloco ${esc(g.nome)}">↑</button>
      <button type="button" class="btn small" data-act="tfgmover" data-id="${g.id}" data-v="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer o bloco ${esc(g.nome)}">↓</button>
      <button type="button" class="btn small" data-act="tfgeditar" data-id="${g.id}" aria-label="Renomear o bloco ${esc(g.nome)}">✎</button>
      <button type="button" class="btn small" data-act="askdel" data-k="tfg:${g.id}" aria-label="Excluir o bloco ${esc(g.nome)}">✕</button></span></div>
    ${conf ? `<div class="tf-conf">Excluir o bloco “${esc(g.nome)}”${g.tarefas.length ? ` e as ${g.tarefas.length} tarefas dele` : ''}? <button type="button" class="btn small" data-act="tfnao">Não</button> <button type="button" class="btn small danger" data-act="tfgexcluir" data-id="${g.id}">Excluir</button></div>` : ''}`;
}

const formNova = (g) => `<div class="tf-form tf-nova">
  <input type="text" id="tf-nova-${g.id}" maxlength="80" placeholder="Nova tarefa em ${esc(g.nome)}" aria-label="Nova tarefa em ${esc(g.nome)}">
  <select id="tf-nresp-${g.id}" aria-label="Responsável pela nova tarefa">${opcoesResp('')}</select>
  <button type="button" class="btn small" data-act="tfnova" data-g="${g.id}">＋ Adicionar</button></div>`;

export function blocoTarefas(g) {
  if (g.evento) return '';
  const r = estado.tarefas?.[g.data];
  if (!r) { ler(g.data); return ''; }
  if (r.erro) return '';
  const admin = pode('giras:editar');
  if (!r.length && !admin) return '';
  const todas = r.flatMap((x) => x.tarefas);
  const feitas = todas.filter((t) => t.feito).length;
  const grupos = r.map((x, i) => `<div class="tf-grupo">${cabGrupo(x, i, r.length)}
    ${x.tarefas.length ? x.tarefas.map((t, j) => (editando ? linhaEditar(t, r, j, x.tarefas.length) : linha(t))).join('') : '<p class="muted tf-vazio">Nenhuma tarefa neste bloco.</p>'}
    ${editando ? formNova(x) : ''}</div>`).join('');
  const novoGrupo = editando ? `<div class="tf-form tf-nova"><input type="text" id="tf-gnovo" maxlength="40" placeholder="Novo bloco (ex.: Pré Gira)" aria-label="Nome do novo bloco">
    <button type="button" class="btn small" data-act="tfgnovo">＋ Criar bloco</button></div>` : '';
  return `<div class="gn-sec gn-tarefas"><div class="gn-sec-h"><h3><span aria-hidden="true">✅</span> Tarefas da corrente</h3>
      <span class="tf-cab">${todas.length ? `<span class="muted">${feitas} de ${todas.length}</span>` : ''}
      ${admin ? `<button type="button" class="btn small" data-act="tfeditarlista" aria-pressed="${editando}">${editando ? 'Pronto' : 'Editar'}</button>` : ''}</span></div>
    ${r.length ? grupos : '<p class="muted tf-vazio">Nenhuma tarefa cadastrada. Toque em Editar para criar os blocos e as tarefas.</p>'}${novoGrupo}</div>`;
}

async function enviar(data, corpo, msg) {
  if (ocupado) return false;
  ocupado = true;
  try {
    estado.tarefas = { ...(estado.tarefas || {}), [data]: await api('POST', '/giras', { acao: 'tarefas', data, ...corpo }) };
    if (msg) toast(msg);
    return true;
  } catch (e) { toast(e.message); return false; } finally { ocupado = false; avisar(); }
}

const valor = (id) => (document.getElementById(id)?.value || '').replace(/\s+/g, ' ').trim();

const d = () => giraAtual().data;
export const cliquesTarefas = {
    tfeditarlista() { editando = !editando; editaTarefa = null; editaGrupo = null; estado.confirm = null; avisar(); },
    tfeditar(el) { editaTarefa = el.dataset.id; editaGrupo = null; avisar(); setTimeout(() => document.getElementById('tf-desc-' + el.dataset.id)?.focus(), 0); },
    tfgeditar(el) { editaGrupo = el.dataset.id; editaTarefa = null; avisar(); setTimeout(() => document.getElementById('tf-gnome-' + el.dataset.id)?.focus(), 0); },
    tfcancelar() { editaTarefa = null; editaGrupo = null; avisar(); },
    tfnao() { estado.confirm = null; avisar(); },
    async tfnova(el) {
      const g = el.dataset.g;
      const descricao = valor('tf-nova-' + g);
      if (!descricao) { toast('Escreva a tarefa.'); document.getElementById('tf-nova-' + g)?.focus(); return; }
      await enviar(d(), { op: 'tarefa', grupoId: g, descricao, responsavelId: valor('tf-nresp-' + g) }, 'Tarefa adicionada.');
    },
    async tfsalvar(el) {
      const id = el.dataset.id;
      const descricao = valor('tf-desc-' + id);
      if (!descricao) { toast('Escreva a tarefa.'); return; }
      if (await enviar(d(), { op: 'tarefa', id, grupoId: valor('tf-grupo-' + id), descricao, responsavelId: valor('tf-resp-' + id) }, 'Tarefa salva.')) { editaTarefa = null; avisar(); }
    },
    async tfexcluir(el) { estado.confirm = null; await enviar(d(), { op: 'tarefaExcluir', id: el.dataset.id }, 'Tarefa excluída.'); },
    tfmover(el) { enviar(d(), { op: 'mover', id: el.dataset.id, delta: Number(el.dataset.v) }); },
    async tfgnovo() {
      const nome = valor('tf-gnovo');
      if (!nome) { toast('Escreva o nome do bloco.'); document.getElementById('tf-gnovo')?.focus(); return; }
      await enviar(d(), { op: 'grupo', nome }, 'Bloco criado.');
    },
    async tfgsalvar(el) {
      const nome = valor('tf-gnome-' + el.dataset.id);
      if (!nome) { toast('Escreva o nome do bloco.'); return; }
      if (await enviar(d(), { op: 'grupo', id: el.dataset.id, nome }, 'Bloco renomeado.')) { editaGrupo = null; avisar(); }
    },
    async tfgexcluir(el) { estado.confirm = null; await enviar(d(), { op: 'grupoExcluir', id: el.dataset.id }, 'Bloco excluído.'); },
    tfgmover(el) { enviar(d(), { op: 'grupoMover', id: el.dataset.id, delta: Number(el.dataset.v) }); },
};

// A caixinha muda na hora; a resposta do servidor corrige. Sem a trava de "ocupado": dá para marcar várias seguidas.
export const mudancasTarefas = {
  async tfmarcar(t) {
    const data = d();
    const tarefa = (Array.isArray(estado.tarefas?.[data]) ? estado.tarefas[data] : []).flatMap((x) => x.tarefas).find((x) => x.id === t.dataset.id);
    const antes = tarefa && { feito: tarefa.feito, por: tarefa.por };
    if (tarefa) { tarefa.feito = t.checked; tarefa.por = t.checked ? estado.me?.nome || '' : ''; }
    avisar();
    try {
      estado.tarefas = { ...(estado.tarefas || {}), [data]: await api('POST', '/giras', { acao: 'tarefas', op: 'marcar', data, id: t.dataset.id, feito: t.checked }) };
    } catch (e) {
      if (tarefa) Object.assign(tarefa, antes);
      toast(e.message);
    }
    avisar();
  },
};
