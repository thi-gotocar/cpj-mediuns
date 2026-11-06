// Aba "Admin root" (só o admin root): quem acessa o app e com qual perfil, os perfis e, do Histórico,
// Cadastrar gira antiga e Cadastrar escala, e os eventos da casa (cadastrar e eventos cadastrados).

import { SEM_CADASTRO, ABAS, PERFIS_SISTEMA, PIN_VALIDO, normalizarAbas } from '/shared/permissoes.js';
import { estado, meAtivo, pessoasOrd, carregarUsuarios, carregarPerfil, criarUsuario, atualizarUsuario, excluirUsuario, atualizarPessoa, acaoUsuarios, salvarApelidosEntidade, avisar } from '../estado.js';
import { esc, toast, ajustarRolagem } from '../util.js';
import { renderAjustesPerfil } from './perfil.js';
import { blocosEventos, cliques as cliquesEventos } from './eventos.js';
import { cardGiraAntiga, cliquesGiraAntiga, mudancasGiraAntiga } from './historico.js';
import { cardEscala, cliquesEscala, mudancasEscala } from '../cadastrarEscala.js';
import { contaNaPresenca, LINHA_LABEL } from '/shared/regras.js';


// Perfis que podem ser dados a um usuário com e-mail (o "Corrente" é só do acesso pelo nome).
const papeis = () => (estado.perfisCfg || []).filter((f) => f.chave !== 'corrente');
const opcoesPapel = (atual) => papeis().map((f) => `<option value="${esc(f.chave)}" ${f.chave === atual ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');

// Todos os blocos da aba começam minimizados; tocar no título expande e recolhe (enquanto o app estiver aberto).
const abertosRoot = new Set();
const cabRoot = (k, titulo, count = '', ab = abertosRoot.has(k)) => `<button class="grp-h dobra" data-act="dobrarroot" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;

// ---------- perfis: o que cada um vê e edita, por aba ----------
function cardPerfis() {
  const lista = estado.perfisCfg || [];
  const aberto = abertosRoot.has('perfis');
  let h = `<div class="card adm root">${cabRoot('perfis', 'Perfis e acessos', lista.length)}`;
  if (!aberto) return h + '</div>';
  const sel = lista.find((f) => f.chave === estado.perfilSel) || lista.find((f) => f.chave === 'admin') || lista[0];
  h += `<p class="muted" style="margin:0;font-size:.85rem">Escolha o perfil e marque, em cada aba, se ele pode <b>Ver</b> e/ou <b>Editar</b>. Vale na hora para todos os usuários desse perfil (eles veem a mudança ao abrir o app de novo). A aba Admin root é sempre só do Admin root.</p>
    <div class="row" style="gap:6px;align-items:flex-end">
      <label class="field grow">Perfil<select data-act="perfilsel">${lista.map((f) => `<option value="${esc(f.chave)}" ${f === sel ? 'selected' : ''}>${esc(f.nome)}${f.usuarios ? ` (${f.usuarios})` : ''}</option>`).join('')}</select></label>
      <button class="btn small" data-act="novoperfil">＋ Novo perfil</button>
    </div>`;
  if (estado.novoPerfil) {
    h += `<form id="f-perfilnovo" class="row" autocomplete="off" style="gap:6px;align-items:flex-end">
      <label class="field grow">Nome do novo perfil<input type="text" id="pn-nome" maxlength="40" required placeholder="Ex.: Admin giras"></label>
      <button class="btn small primary" type="submit">Criar</button><button class="btn small" type="button" data-act="cancelanovoperfil">Cancelar</button></form>`;
  }
  if (!sel) return h + '</div>';
  if (sel.chave === 'root') return h + `<p class="leitura" style="margin:0">O Admin root pode tudo, inclusive a aba Admin root, e não precisa estar no cadastro da corrente.</p></div>`;
  const a = normalizarAbas(sel.abas);
  const fixo = sel.chave === 'corrente';
  h += `${fixo ? '<p class="muted" style="margin:0;font-size:.85rem">Este é o acesso de quem entra com a palavra-chave da corrente e o próprio nome.</p>' : `<form id="f-perfilnome" class="row" data-chave="${esc(sel.chave)}" autocomplete="off" style="gap:6px;align-items:flex-end">
      <label class="field grow">Nome<input type="text" id="pf-nomecfg" maxlength="40" value="${esc(sel.nome)}"></label>
      <button class="btn small" type="submit">Renomear</button></form>`}
    <div class="pa-tab" role="table" aria-label="Acessos do perfil ${esc(sel.nome)}">
      <div class="pa-th" role="row"><span>Aba</span><span>Ver</span><span>Editar</span></div>
      ${ABAS.map((x) => `<div class="pa-tr" role="row">
        <span class="pa-aba"><b>${x.nome}</b><small class="muted">Ver: ${x.ver}<br>Editar: ${x.editar}</small></span>
        <label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(sel.chave)}" data-k="${x.k}" data-t="ver" ${a[x.k].ver ? 'checked' : ''} aria-label="${sel.nome}: ver ${x.nome}"></label>
        <label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(sel.chave)}" data-k="${x.k}" data-t="editar" ${a[x.k].editar ? 'checked' : ''} aria-label="${sel.nome}: editar ${x.nome}"></label>
      </div>`).join('')}
    </div>`;
  if (!PERFIS_SISTEMA.includes(sel.chave)) {
    const conf = estado.confirm === 'pf:' + sel.chave;
    h += `<div class="row" style="justify-content:flex-end">${conf ? `<button class="btn small danger" data-act="delperfil" data-chave="${esc(sel.chave)}">Confirmar exclusão</button>` : `<button class="btn small" data-act="askdel" data-k="pf:${esc(sel.chave)}">Excluir perfil</button>`}</div>`;
  }
  return h + '</div>';
}

// Nome do usuário: sempre o do cadastro de pessoas (o root sem cadastro tem nome próprio).
const nomeDe = (u) => (u.pessoaId && estado.pessoas.find((p) => p.id === u.pessoaId)?.nome) || u.nome;
const semCadastro = (papel) => SEM_CADASTRO.includes(papel);
// Pessoas da corrente que ainda não têm usuário (mais a do próprio usuário, ao trocar).
const pessoasLivres = (manter = null) => {
  const ocupadas = new Set(estado.usuarios.map((u) => u.pessoaId).filter((id) => id && id !== manter));
  return pessoasOrd().filter((p) => !ocupadas.has(p.id));
};

export function render() {
  if (estado.usuarios === null) { carregarUsuarios(); return `<div class="loading">Carregando usuários…</div>`; }
  if (abertosRoot.has('ajperfil') && estado.perfil === null) { estado.perfil = undefined; carregarPerfil(); }
  const livres = pessoasLivres();
  let h = `<section class="panel">
  <div class="card adm root">${cabRoot('novo', 'Novo usuário')}${!abertosRoot.has('novo') ? '' : `
    <form id="f-user" class="row" autocomplete="off">
      <label class="field" style="flex:0 1 170px">Perfil<select id="u-papel" data-act="papelnovo">${opcoesPapel('usuario')}</select></label>
      <label class="field grow" id="u-pessoa-campo"><span id="u-pessoa-rotulo">Pessoa da corrente</span><select id="u-pessoa"><option value="">— escolha a pessoa —</option>${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="field grow" id="u-nome-campo" hidden>Nome<input type="text" id="u-nome" maxlength="80"></label>
      <label class="field grow">E-mail<input type="email" id="u-email" required></label>
      <label class="field" style="flex:1 1 140px">Senha inicial<input type="password" id="u-senha" required minlength="8" autocomplete="new-password"></label>
      <button class="btn primary" type="submit">Criar</button>
    </form>
    <p class="muted" style="margin:0;font-size:.85rem">O usuário é uma pessoa da corrente: o nome vem do cadastro em Pessoas (quem não está lá, cadastre antes). No <b>Admin root</b> a pessoa é opcional: sem ela, vale o nome digitado. Passe o e-mail e a senha inicial para a pessoa; ela pode trocar a senha depois.</p>`}
  </div>
  <div class="card adm root">${cabRoot('acesso', 'Quem tem acesso', estado.usuarios.length)}<div>`;
  if (abertosRoot.has('acesso')) estado.usuarios.forEach((u) => {
    const eu = u.id === meAtivo()?.id;
    const conf = estado.confirm === 'u:' + u.id;
    const nome = nomeDe(u);
    const faltaCadastro = !u.pessoaId && !semCadastro(u.papel);
    let nomeHtml;
    const modo = estado.renomearModo;
    if (estado.renomearUsuario === u.id) {
      nomeHtml = modo === 'nome'
        ? `<form id="f-uren" class="ren" data-id="${u.id}" data-modo="nome"><input type="text" id="uren-in" value="${esc(u.nome)}" maxlength="80" autocomplete="off" aria-label="Nome de ${esc(nome)}">
            <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelauren">Cancelar</button></form>`
        : `<form id="f-uren" class="ren" data-id="${u.id}" data-modo="pessoa"><select id="uren-in" aria-label="Pessoa da corrente de ${esc(nome)}">${semCadastro(u.papel) ? '' : '<option value="">— escolha a pessoa —</option>'}
            ${semCadastro(u.papel) ? `<option value="" ${u.pessoaId ? '' : 'selected'}>(sem cadastro: usar só o nome)</option>` : ''}
            ${pessoasLivres(u.pessoaId).map((p) => `<option value="${p.id}" ${p.id === u.pessoaId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
            <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelauren">Cancelar</button></form>`;
    } else {
      const botoes = [
        ...(!u.pessoaId && semCadastro(u.papel) ? [['nome', '✎ editar nome']] : []),
        ['pessoa', u.pessoaId ? '✎ trocar pessoa' : semCadastro(u.papel) ? '✎ ligar à pessoa (opcional)' : '✎ ligar à pessoa'],
      ].map(([m, t]) => `<button class="btn link small" data-act="uren" data-id="${u.id}" data-modo="${m}">${t}</button>`).join(' ');
      nomeHtml = `<div class="nm">${esc(nome)}${eu ? ' <span class="muted" style="font-weight:400">(você)</span>' : ''} ${botoes}</div>
        ${faltaCadastro ? '<span class="badge lic">sem cadastro na corrente: ligue a uma pessoa</span>' : ''}`;
    }
    h += `<div class="us"><div style="min-width:0">${nomeHtml}<div class="em">${esc(u.email)}</div></div>
      <select data-act="papel" data-id="${u.id}" aria-label="Perfil de ${esc(nome)}" ${eu ? 'disabled title="Você não pode mudar o seu próprio perfil"' : ''}>${opcoesPapel(u.papel)}</select>
      <div class="acts" style="display:contents"><button class="btn small" data-act="novasenha" data-id="${u.id}">Nova senha</button>
      ${eu ? '<span></span>' : conf ? `<button class="btn small danger" data-act="deluser" data-id="${u.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="u:${u.id}">Excluir</button>`}</div></div>`;
  });
  h += `</div></div>${cardPerfis()}${cardEntidades()}${cardAjustesPerfil()}${cardEventos()}${cardRegistros()}</section>`;
  return h;
}

function cardAjustesPerfil() {
  const aberto = abertosRoot.has('ajperfil');
  let corpo = '';
  if (aberto) {
    if (estado.perfil === undefined) corpo = '<div class="loading">Carregando dados do perfil…</div>';
    else if (estado.perfil?.erro) corpo = `<p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p>`;
    else corpo = renderAjustesPerfil(estado.perfil?.todos || []);
  }
  return `<div class="card adm root">${cabRoot('ajperfil', '⚙️ Ajustes perfil')}${corpo}</div>`;
}

function cardEntidades() {
  const aberto = abertosRoot.has('entidades');
  const aliases = estado.entidadesApelidos || [];
  const ed = estado.entidadeApelidoEdit;
  const opcoes = Object.entries(LINHA_LABEL).map(([k, nome]) => `<option value="${esc(k)}" ${k === ed?.linha ? 'selected' : ''}>${esc(nome)}</option>`).join('');
  return `<div class="card adm root">${cabRoot('entidades', '🏷️ Entidades das giras', aliases.length)}${!aberto ? '' : `
    <p class="muted" style="margin:0;font-size:.88rem">Inclua nomes alternativos para uma linha existente. Eles aparecem nos cadastros de giras, mantendo as regras e afinidades da linha escolhida.</p>
    <form id="f-entidade-alias" class="row" data-index="${ed ? ed.index : ''}" autocomplete="off">
      <label class="field grow">Nome da entidade<input type="text" id="ea-nome" maxlength="80" required value="${esc(ed?.nome || '')}" placeholder="Ex.: nome usado pela casa"></label>
      <label class="field grow">Linha correspondente<select id="ea-linha" required><option value="">— escolha a linha —</option>${opcoes}</select></label>
      <span class="row"><button class="btn small primary" type="submit">${ed ? 'Salvar alteração' : '＋ Incluir nome'}</button>${ed ? '<button class="btn small" type="button" data-act="cancelaralias">Cancelar</button>' : ''}</span>
    </form>
    ${aliases.length ? `<div class="al-grupos">${aliases.map((x, i) => `<div class="sn-l">
      <span class="sn-nome"><b>${esc(x.nome)}</b><span class="muted"> · ${esc(LINHA_LABEL[x.linha] || x.linha)}</span></span>
      <span class="sn-bts">${estado.confirm === 'entalias:' + i
        ? `<button class="btn small danger" data-act="removeralias" data-index="${i}">Confirmar remoção</button><button class="btn small" data-act="cancelaralias">Cancelar</button>`
        : `<button class="btn small" data-act="editaralias" data-index="${i}">Editar</button><button class="btn small" data-act="askalias" data-index="${i}">Remover</button>`}</span>
    </div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum nome alternativo cadastrado.</p>'}
  `}</div>`;
}

// Eventos da casa (só o root cadastra, edita e exclui): Cadastrar evento e Eventos cadastrados.
// A corrente continua vendo os eventos da semana no card 📅 Eventos da aba Gira.
function cardEventos() {
  setTimeout(ajustarRolagem, 0);
  const ab = abertosRoot.has('eventos');
  return `<div class="card adm root ev-grupo">${cabRoot('eventos', '<span aria-hidden="true">🗓️</span> Eventos', (estado.eventos || []).length)}${ab ? blocosEventos() : ''}</div>`;
}

// Do Histórico: cadastrar gira antiga (já encerrada, só para o histórico) e cadastrar a escala de uma gira salva.
function cardRegistros() {
  // Com um cadastro em andamento, fica aberto.
  const ab = abertosRoot.has('registros') || !!estado.giraAntiga || !!estado.escalaTxt;
  let h = `<div class="card adm root">${cabRoot('registros', '<span aria-hidden="true">🗂️</span> Giras antigas e escalas', '', ab)}`;
  if (!ab) return h + '</div>';
  if (!estado.giraAntiga && !estado.escalaTxt) {
    h += '<div class="row"><button class="btn small" data-act="gaabrir">＋ Cadastrar gira antiga</button><button class="btn small" data-act="esabrir">＋ Cadastrar escala</button></div>';
  }
  if (estado.giraAntiga) h += cardGiraAntiga(pessoasOrd().filter(contaNaPresenca)).replace('<div class="card adm" id="card-ga">', '<div class="ga-box" id="card-ga">');
  if (estado.escalaTxt) h += cardEscala();
  return h + '</div>';
}

export const cliques = {
  ...cliquesEventos,
  ...cliquesGiraAntiga,
  ...cliquesEscala,
  novasenha(el) {
    const u = estado.usuarios.find((x) => x.id === el.dataset.id);
    const s = prompt(`Nova senha para ${u?.nome || 'o usuário'} (mínimo 8 caracteres):`);
    if (s === null) return;
    if (s.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.'); return; }
    atualizarUsuario(el.dataset.id, { senha: s });
  },
  deluser(el) { estado.confirm = null; excluirUsuario(el.dataset.id); },
  uren(el) {
    estado.renomearUsuario = el.dataset.id;
    estado.renomearModo = el.dataset.modo || 'pessoa';
    avisar();
    const inp = document.getElementById('uren-in');
    if (inp) { inp.focus(); if (inp.tagName === 'INPUT') inp.select(); }
  },
  cancelauren() { estado.renomearUsuario = null; avisar(); },
  dobrarroot(el) { const k = el.dataset.k; if (abertosRoot.has(k)) abertosRoot.delete(k); else abertosRoot.add(k); avisar(); },
  editaralias(el) {
    const index = Number(el.dataset.index);
    const alias = estado.entidadesApelidos?.[index];
    if (!alias) return;
    estado.entidadeApelidoEdit = { ...alias, index };
    estado.confirm = null;
    avisar();
    document.getElementById('ea-nome')?.focus();
  },
  askalias(el) { estado.confirm = 'entalias:' + el.dataset.index; avisar(); },
  async removeralias(el) {
    const index = Number(el.dataset.index);
    const aliases = (estado.entidadesApelidos || []).filter((_, i) => i !== index);
    if (await salvarApelidosEntidade(aliases)) { estado.confirm = null; estado.entidadeApelidoEdit = null; toast('Nome alternativo removido.'); }
  },
  cancelaralias() { estado.confirm = null; estado.entidadeApelidoEdit = null; avisar(); },
  limparentrada(el) { atualizarPessoa(el.dataset.id, { entrada: null }); },
  snabrir(el) {
    estado.senhaEdit = { tipo: el.dataset.tipo, id: el.dataset.id };
    avisar();
    document.getElementById('sn-in')?.focus();
  },
  snfechar() { estado.senhaEdit = null; avisar(); },
  novoperfil() { estado.novoPerfil = true; avisar(); document.getElementById('pn-nome')?.focus(); },
  cancelanovoperfil() { estado.novoPerfil = false; avisar(); },
  async delperfil(el) {
    estado.confirm = null;
    if (await acaoUsuarios('excluirPerfil', { chave: el.dataset.chave })) { estado.perfilSel = 'admin'; toast('Perfil excluído.'); }
  },
};

// Cria um perfil novo (sem nenhuma aba marcada) e já deixa selecionado.
export async function criarPerfil() {
  const nome = document.getElementById('pn-nome').value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome do perfil.'); return; }
  const antes = new Set((estado.perfisCfg || []).map((f) => f.chave));
  if (await acaoUsuarios('perfil', { nome, abas: {} })) {
    estado.novoPerfil = false;
    estado.perfilSel = (estado.perfisCfg.find((f) => !antes.has(f.chave)) || {}).chave || estado.perfilSel;
    toast(`Perfil ${nome} criado. Marque as abas que ele pode ver e editar.`);
    avisar();
  }
}
export async function renomearPerfil(form) {
  const nome = document.getElementById('pf-nomecfg').value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome do perfil.'); return; }
  if (await acaoUsuarios('perfil', { chave: form.dataset.chave, nome })) toast('Perfil renomeado.');
}
// Root troca a senha de alguém (depois de tocar em "Confirmar alteração").
export async function confirmarSenha(form) {
  const v = document.getElementById('sn-in').value.trim();
  const { tipo, id } = form.dataset;
  if (tipo === 'pin') {
    if (!PIN_VALIDO.test(v)) { toast('A senha precisa ter de 4 a 8 números.'); return; }
    if (await acaoUsuarios('pin', { pessoaId: id, senha: v })) { estado.senhaEdit = null; toast('Senha da corrente alterada.'); avisar(); }
  } else {
    if (v.length < 8) { toast('A senha do e-mail precisa ter pelo menos 8 caracteres.'); return; }
    estado.senhaEdit = null;
    await atualizarUsuario(id, { senha: v });
  }
}

// Salva o nome (root sem cadastro) ou a pessoa da corrente ligada ao usuário.
export async function renomear(form) {
  const id = form.dataset.id;
  const v = document.getElementById('uren-in').value;
  estado.renomearUsuario = null;
  if (form.dataset.modo === 'pessoa') {
    const u0 = estado.usuarios.find((x) => x.id === id);
    if (!v && !semCadastro(u0?.papel)) { toast('Escolha a pessoa.'); estado.renomearUsuario = id; return; }
    if ((v || null) === (u0?.pessoaId || null)) { avisar(); return; }
    await atualizarUsuario(id, { pessoaId: v });
  } else {
    const nome = v.replace(/\s+/g, ' ').trim();
    if (!nome) { toast('Digite o nome.'); estado.renomearUsuario = id; return; }
    await atualizarUsuario(id, { nome });
  }
  const u = estado.usuarios.find((x) => x.id === id);
  if (id === estado.me.id && u) { estado.me = { ...estado.me, nome: nomeDe(u), pessoaId: u.pessoaId || null }; avisar(); }
}

export const mudancas = {
  ...mudancasGiraAntiga,
  ...mudancasEscala,
  perfilsel(t) { estado.perfilSel = t.value; estado.confirm = null; avisar(); },
  // Editar inclui ver; tirar o ver tira o editar.
  pfaba(t) {
    const f = (estado.perfisCfg || []).find((x) => x.chave === t.dataset.chave);
    if (!f) return;
    const a = normalizarAbas(f.abas);
    const x = a[t.dataset.k];
    if (t.dataset.t === 'editar') { x.editar = t.checked; if (t.checked) x.ver = true; } else { x.ver = t.checked; if (!t.checked) x.editar = false; }
    f.abas = a;
    avisar();
    acaoUsuarios('perfil', { chave: f.chave, abas: a });
  },
  papel(t) { atualizarUsuario(t.dataset.id, { papel: t.value }); },
  ajpessoa(t) { estado.ajUi.pessoa = t.value; estado.senhaEdit = null; avisar(); },
  ajcampo(t) { estado.ajUi.campo = t.value; estado.senhaEdit = null; avisar(); },
  entrada(t) { atualizarPessoa(t.dataset.id, { entrada: t.value || null }); },
  // Novo usuário: root pode ter só um nome; os outros escolhem a pessoa da corrente.
    papelnovo(t) {
    const root = semCadastro(t.value);
    document.getElementById('u-nome-campo').hidden = !root;
    document.getElementById('u-pessoa-rotulo').textContent = root ? 'Pessoa da corrente (opcional)' : 'Pessoa da corrente';
  },
};

export async function salvarApelidoEntidade(form) {
  const nome = document.getElementById('ea-nome').value.replace(/\s+/g, ' ').trim();
  const linha = document.getElementById('ea-linha').value;
  if (!nome || !linha) { toast('Informe o nome e a linha correspondente.'); return; }
  const index = form.dataset.index === '' ? -1 : Number(form.dataset.index);
  const aliases = [...(estado.entidadesApelidos || [])];
  const item = { nome, linha };
  if (index >= 0 && aliases[index]) aliases[index] = item;
  else aliases.push(item);
  if (await salvarApelidosEntidade(aliases)) {
    estado.entidadeApelidoEdit = null;
    estado.confirm = null;
    toast(index >= 0 ? 'Nome alternativo atualizado.' : 'Nome alternativo incluído.');
    avisar();
  }
}

export async function enviarFormulario() {
  const val = (id) => document.getElementById(id).value;
  const papel = val('u-papel');
  const root = semCadastro(papel);
  const pessoaId = val('u-pessoa');
  if (!root && !pessoaId) { toast('Escolha a pessoa da corrente.'); return; }
  const nome = pessoaId ? estado.pessoas.find((p) => p.id === pessoaId)?.nome : val('u-nome').trim();
  if (!nome) { toast('Digite o nome ou escolha a pessoa da corrente.'); return; }
  const dados = { email: val('u-email').trim(), senha: val('u-senha'), papel, ...(pessoaId ? { pessoaId } : { nome }) };
  try {
    await criarUsuario(dados);
    toast(`Usuário ${nome} criado.`);
  } catch (e) { toast(e.message); avisar(); }
}
