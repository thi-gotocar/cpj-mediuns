// Telas de entrada: login e instalação (primeiro acesso).

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

export function renderInstalacao(erro) {
  return `<div class="card login">
    <h2>Instalar o app</h2>
    <p class="muted" style="margin:0;font-size:.92rem">Primeiro acesso: crie o usuário admin da corrente. O código de instalação é o valor de <b>CODIGO_INSTALACAO</b> cadastrado na Vercel.</p>
    ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="f-instalar" autocomplete="off">
      <label class="field">Código de instalação<input type="password" id="i-codigo" required autocomplete="off"></label>
      <label class="field">Seu nome<input type="text" id="i-nome" required maxlength="80"></label>
      <label class="field">E-mail<input type="email" id="i-email" required autocomplete="username"></label>
      <label class="field">Senha (mínimo 8 caracteres)<input type="password" id="i-senha" required minlength="8" autocomplete="new-password"></label>
      <label class="field">Repita a senha<input type="password" id="i-senha2" required minlength="8" autocomplete="new-password"></label>
      <button class="btn primary" type="submit" id="i-btn">Criar admin e entrar</button>
    </form>
  </div>`;
}
