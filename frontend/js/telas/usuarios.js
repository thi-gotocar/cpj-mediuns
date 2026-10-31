// Tela "Usuários" (só admin): quem acessa o app e com qual perfil.

import { SEM_CADASTRO, ABAS, PERFIS_SISTEMA, PIN_VALIDO, normalizarAbas } from '/shared/permissoes.js';
import { estado, pessoasOrd, carregarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, atualizarPessoa, acaoUsuarios, avisar } from '../estado.js';
import { esc, toast } from '../util.js';


// Perfis que podem ser dados a um usuário com e-mail (o "Corrente" é só do acesso pelo nome).
const papeis = () => (estado.perfisCfg || []).filter((f) => f.chave !== 'corrente');
const opcoesPapel = (atual) => papeis().map((f) => `<option value="${esc(f.chave)}" ${f.chave === atual ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');

// ---------- perfis: o que cada um vê e edita, por aba ----------
function cardPerfis() {
  const lista = estado.perfisCfg || [];
  const aberto = estado.perfisAberto ?? true;
  let h = `<div class="card"><button class="grp-h dobra" data-act="dobrarperfis" aria-expanded="${aberto}"><h2>Perfis e acessos</h2><span class="count">${lista.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  const sel = lista.find((f) => f.chave === estado.perfilSel) || lista.find((f) => f.chave === 'admin') || lista[0];
  h += `<p class="muted" style="margin:0;font-size:.85rem">Escolha o perfil e marque, em cada aba, se ele pode <b>Ver</b> e/ou <b>Editar</b>. Vale na hora para todos os usuários desse perfil (eles veem a mudança ao abrir o app de novo). A aba Usuários é sempre só do Admin root.</p>
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
  if (sel.chave === 'root') return h + `<p class="leitura" style="margin:0">O Admin root pode tudo, inclusive a aba Usuários, e não precisa estar no cadastro da corrente.</p></div>`;
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

// ---------- senhas: sempre começa minimizado ----------
function cardSenhas() {
  const aberto = !!estado.senhasAberto;
  const S = estado.senhas || [];
  const com = S.filter((x) => x.temSenha).length;
  let h = `<div class="card"><button class="grp-h dobra" data-act="dobrarsenhas" aria-expanded="${aberto}"><h2>🔒 Senhas</h2><span class="count">${com} com senha <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  const busca = (estado.senhaBusca || '').trim().toLowerCase();
  const usuarioDe = (pid) => (estado.usuarios || []).find((u) => u.pessoaId === pid);
  const linhas = S.filter((x) => !busca || x.nome.toLowerCase().includes(busca));
  const ed = estado.senhaEdit;
  const form = (tipo, id, nome) => `<form id="f-sn" class="sn-form" data-tipo="${tipo}" data-id="${id}" autocomplete="off">
      <input type="password" id="sn-in" ${tipo === 'pin' ? 'inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="Nova senha (4 a 8 números)"' : 'minlength="8" placeholder="Nova senha do e-mail (mín. 8)"'} autocomplete="new-password" required aria-label="Nova senha de ${esc(nome)}">
      <button class="btn small danger" type="submit">Confirmar alteração</button><button class="btn small" type="button" data-act="snfechar">Cancelar</button></form>`;
  h += `<p class="muted" style="margin:0;font-size:.85rem">As senhas ficam guardadas embaralhadas: nem o app consegue mostrá-las. Aqui você define uma nova senha para a pessoa (ela passa a valer na hora e encerra as sessões abertas). <b>Senha da corrente</b>: a de quem entra com a palavra-chave e o nome. <b>Senha do e-mail</b>: a de quem tem usuário.</p>
    <input type="text" id="sn-busca" placeholder="Procurar pelo nome…" value="${esc(estado.senhaBusca || '')}" autocomplete="off">
    <div class="sn-lista">${linhas.map((x) => {
      const u = usuarioDe(x.pessoaId);
      return `<div class="sn-l"><div class="sn-nome"><b>${esc(x.nome)}</b> <span class="badge ${x.temSenha ? 'sn-com' : 'sn-sem'}">${x.temSenha ? 'com senha' : 'sem senha'}</span>${u ? ` <span class="muted" style="font-size:.8rem">· ${esc(u.email)}</span>` : ''}</div>
        <div class="sn-bts"><button class="btn small" data-act="snabrir" data-tipo="pin" data-id="${x.pessoaId}">Senha da corrente</button>${u ? `<button class="btn small" data-act="snabrir" data-tipo="email" data-id="${u.id}">Senha do e-mail</button>` : ''}</div>
        ${ed && ((ed.tipo === 'pin' && ed.id === x.pessoaId) || (ed.tipo === 'email' && u && ed.id === u.id)) ? form(ed.tipo, ed.id, x.nome) : ''}</div>`;
    }).join('') || '<p class="muted" style="margin:0">Ninguém com esse nome.</p>'}</div>`;
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

// Entrada de cada pessoa na corrente (só o root): antes dessa data ela não conta nas giras.
const FUNC = { medium: 'Médium', cambone: 'Cambone', passe: 'Passe', extra: 'At. Extra', senha: 'Senha', curimba: 'Curimba' };
function cardEntrada() {
  const aberto = !!estado.entradaAberta;
  const ps = pessoasOrd();
  const com = ps.filter((p) => p.entrada).length;
  let h = `<div class="card"><button class="grp-h dobra" data-act="dobrarentrada" aria-expanded="${aberto}"><h2>Entrada na corrente</h2><span class="count">${com ? `${com} com data` : ''} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + `</div>`;
  const busca = (estado.entradaBusca || '').trim().toLowerCase();
  const lista = ps.filter((p) => !busca || p.nome.toLowerCase().includes(busca));
  h += `<p class="muted" style="margin:0;font-size:.85rem">A pessoa só conta nas giras a partir da data de entrada (presença, faltas, sorteio, limpeza e estatísticas). Sem data, conta em todas.</p>
    <input type="text" id="ent-busca" data-act="entradabusca" placeholder="Procurar pelo nome…" value="${esc(estado.entradaBusca || '')}" autocomplete="off">
    <div class="ppl">${lista.map((p) => `<div class="pp ent-l"><span class="nmcell"><span class="nm">${esc(p.nome)}</span><span class="muted" style="font-size:.82rem">${FUNC[p.funcao] || p.funcao}</span></span>
      <input type="date" id="ent-${p.id}" data-act="entrada" data-id="${p.id}" value="${p.entrada || ''}" aria-label="Entrada de ${esc(p.nome)} na corrente">
      ${p.entrada ? `<button class="btn small" data-act="limparentrada" data-id="${p.id}" aria-label="Tirar a data de ${esc(p.nome)}">✕</button>` : '<span></span>'}</div>`).join('') || '<p class="muted" style="margin:0">Ninguém com esse nome.</p>'}</div>`;
  return h + `</div>`;
}

export function render() {
  if (estado.usuarios === null) { carregarUsuarios(); return `<div class="loading">Carregando usuários…</div>`; }
  const livres = pessoasLivres();
  let h = `<section class="panel">
  <div class="card"><h2>Novo usuário</h2>
    <form id="f-user" class="row" autocomplete="off">
      <label class="field" style="flex:0 1 170px">Perfil<select id="u-papel" data-act="papelnovo">${opcoesPapel('usuario')}</select></label>
      <label class="field grow" id="u-pessoa-campo"><span id="u-pessoa-rotulo">Pessoa da corrente</span><select id="u-pessoa"><option value="">— escolha a pessoa —</option>${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="field grow" id="u-nome-campo" hidden>Nome<input type="text" id="u-nome" maxlength="80"></label>
      <label class="field grow">E-mail<input type="email" id="u-email" required></label>
      <label class="field" style="flex:1 1 140px">Senha inicial<input type="password" id="u-senha" required minlength="8" autocomplete="new-password"></label>
      <button class="btn primary" type="submit">Criar</button>
    </form>
    <p class="muted" style="margin:0;font-size:.85rem">O usuário é uma pessoa da corrente: o nome vem do cadastro em Pessoas (quem não está lá, cadastre antes). No <b>Admin root</b> a pessoa é opcional: sem ela, vale o nome digitado. Passe o e-mail e a senha inicial para a pessoa; ela pode trocar a senha depois.</p>
  </div>
  <div class="card"><div class="grp-h"><h2>Quem tem acesso</h2><span class="count">${estado.usuarios.length}</span></div><div>`;
  estado.usuarios.forEach((u) => {
    const eu = u.id === estado.me.id;
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
  h += `</div></div>${cardPerfis()}${cardEntrada()}${cardSenhas()}</section>`;
  return h;
}

export const cliques = {
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
  dobrarentrada() { estado.entradaAberta = !estado.entradaAberta; avisar(); },
  limparentrada(el) { atualizarPessoa(el.dataset.id, { entrada: null }); },
  dobrarperfis() { estado.perfisAberto = !(estado.perfisAberto ?? true); avisar(); },
  novoperfil() { estado.novoPerfil = true; avisar(); document.getElementById('pn-nome')?.focus(); },
  cancelanovoperfil() { estado.novoPerfil = false; avisar(); },
  async delperfil(el) {
    estado.confirm = null;
    if (await acaoUsuarios('excluirPerfil', { chave: el.dataset.chave })) { estado.perfilSel = 'admin'; toast('Perfil excluído.'); }
  },
  dobrarsenhas() { estado.senhasAberto = !estado.senhasAberto; estado.senhaEdit = null; avisar(); },
  snabrir(el) {
    estado.senhaEdit = { tipo: el.dataset.tipo, id: el.dataset.id };
    avisar();
    document.getElementById('sn-in')?.focus();
  },
  snfechar() { estado.senhaEdit = null; avisar(); },
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
  entrada(t) { atualizarPessoa(t.dataset.id, { entrada: t.value || null }); },
  papel(t) { atualizarUsuario(t.dataset.id, { papel: t.value }); },
  // Novo usuário: root pode ter só um nome; os outros escolhem a pessoa da corrente.
    papelnovo(t) {
    const root = semCadastro(t.value);
    document.getElementById('u-nome-campo').hidden = !root;
    document.getElementById('u-pessoa-rotulo').textContent = root ? 'Pessoa da corrente (opcional)' : 'Pessoa da corrente';
  },
};

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
