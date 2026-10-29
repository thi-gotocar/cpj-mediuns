// Tela "Usuários" (só admin): quem acessa o app e com qual perfil.

import { PERMISSOES, PAPEIS } from '/shared/permissoes.js';
import { estado, carregarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario, avisar } from '../estado.js';
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
  'ervas:gerenciar': 'Cadastrar ervas, frete e exportar pedidos',
};

export function render() {
  if (estado.usuarios === null) { carregarUsuarios(); return `<div class="loading">Carregando usuários…</div>`; }
  let h = `<section class="panel">
  <div class="card"><h2>Novo usuário</h2>
    <form id="f-user" class="row" autocomplete="off">
      <label class="field grow">Nome<input type="text" id="u-nome" required maxlength="80"></label>
      <label class="field grow">E-mail<input type="email" id="u-email" required></label>
      <label class="field" style="flex:1 1 140px">Senha inicial<input type="password" id="u-senha" required minlength="8" autocomplete="new-password"></label>
      <label class="field" style="flex:0 1 140px">Perfil<select id="u-papel">${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === 'usuario' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="btn primary" type="submit">Criar</button>
    </form>
    <p class="muted" style="margin:0;font-size:.85rem">Passe o e-mail e a senha inicial para a pessoa. Ela pode trocar a senha depois, no botão “Trocar senha”.</p>
  </div>
  <div class="card"><div class="grp-h"><h2>Quem tem acesso</h2><span class="count">${estado.usuarios.length}</span></div><div>`;
  estado.usuarios.forEach((u) => {
    const eu = u.id === estado.me.id;
    const conf = estado.confirm === 'u:' + u.id;
    h += `<div class="us"><div style="min-width:0"><div class="nm">${esc(u.nome)}${eu ? ' <span class="muted" style="font-weight:400">(você)</span>' : ''}</div><div class="em">${esc(u.email)}</div></div>
      <select data-act="papel" data-id="${u.id}" aria-label="Perfil de ${esc(u.nome)}" ${eu ? 'disabled title="Você não pode mudar o seu próprio perfil"' : ''}>${Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === u.papel ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="acts" style="display:contents"><button class="btn small" data-act="novasenha" data-id="${u.id}">Nova senha</button>
      ${eu ? '<span></span>' : conf ? `<button class="btn small danger" data-act="deluser" data-id="${u.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="u:${u.id}">Excluir</button>`}</div></div>`;
  });
  h += `</div></div>
  <div class="card"><h2>O que cada perfil pode fazer</h2><div class="perm">
    ${Object.entries(PAPEIS).map(([k, v]) => `<div><h3>${v}</h3><ul>${PERMISSOES[k].map((p) => `<li>${DESCRICAO[p] || p}</li>`).join('')}</ul></div>`).join('')}
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
};

export const mudancas = {
  papel(t) { atualizarUsuario(t.dataset.id, { papel: t.value }); },
};

export async function enviarFormulario() {
  const val = (id) => document.getElementById(id).value;
  const dados = { nome: val('u-nome').trim(), email: val('u-email').trim(), senha: val('u-senha'), papel: val('u-papel') };
  try {
    await criarUsuario(dados);
    toast(`Usuário ${dados.nome} criado.`);
  } catch (e) { toast(e.message); avisar(); }
}
