// Tela "Usuários" (só admin): quem acessa o app e com qual perfil.

import { PERMISSOES, PAPEIS, SEM_CADASTRO } from '/shared/permissoes.js';
import { estado, pessoasOrd, carregarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, atualizarPessoa, avisar } from '../estado.js';
import { esc, toast } from '../util.js';

const DESCRICAO = {
  'pessoas:ler': 'Ver a corrente',
  'pessoas:editar': 'Cadastrar e editar pessoas',
  'giras:ler': 'Ver escalas, histórico e exportar',
  'giras:editar': 'Marcar presença, entidade e ajustar duplas',
  'giras:sortear': 'Sortear e remanejar faltas',
  'giras:excluir': 'Excluir giras',
  'usuarios:gerenciar': 'Gerenciar usuários',
  'dados:importar': 'Backup e restauração',
  'escala:completa': 'Ver presença, pessoas e histórico',
  'ervas:escolher': 'Escolher ervas',
  'ervas:gerenciar': 'Administrar a aba Ervas: ervas, preços, frete, pedidos e cobrança',
  'oferendas:doar': 'Escolher o que doar nas oferendas',
  'oferendas:gerenciar': 'Administrar a aba Oferendas: oferendas, itens e entregas',
};

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
      <label class="field" style="flex:0 1 170px">Perfil<select id="u-papel" data-act="papelnovo">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === 'usuario' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
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
      <select data-act="papel" data-id="${u.id}" aria-label="Perfil de ${esc(nome)}" ${eu ? 'disabled title="Você não pode mudar o seu próprio perfil"' : ''}>${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === u.papel ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="acts" style="display:contents"><button class="btn small" data-act="novasenha" data-id="${u.id}">Nova senha</button>
      ${eu ? '<span></span>' : conf ? `<button class="btn small danger" data-act="deluser" data-id="${u.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="u:${u.id}">Excluir</button>`}</div></div>`;
  });
  h += `</div></div>${cardEntrada()}
  <div class="card"><h2>O que cada perfil pode fazer</h2><div class="perm">
    ${Object.entries(PAPEIS).map(([k, v]) => `<div><h3>${v}</h3>${k === 'root' ? '<p class="muted" style="margin:0;font-size:.85rem">Igual ao Admin, e é o único que vê a aba Usuários. Não precisa ter cadastro na corrente.</p>' : ''}<ul>${PERMISSOES[k].map((p) => `<li>${DESCRICAO[p] || p}</li>`).join('')}</ul></div>`).join('')}
  </div></div></section>`;
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
};

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
