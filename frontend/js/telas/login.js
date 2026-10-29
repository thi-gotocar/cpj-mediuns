// Tela de login.

import { esc } from '../util.js';

export function render(erro, email = '') {
  return `<div class="card login">
    <h2>Entrar</h2>
    <p class="muted" style="margin:0;font-size:.92rem">Use o e-mail e a senha que o admin da corrente cadastrou para você.</p>
    ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="f-login">
      <label class="field">E-mail<input type="email" id="l-email" autocomplete="username" required value="${esc(email)}"></label>
      <label class="field">Senha<input type="password" id="l-senha" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit" id="l-btn">Entrar</button>
    </form>
  </div>`;
}
