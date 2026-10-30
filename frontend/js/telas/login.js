// Telas de entrada: login e instalação (primeiro acesso).

import { esc } from '../util.js';

const LOGO = `<div class="logo-terreiro"><img src="/img/terreiro.png" width="200" height="200" alt="Casa do Pai João · Terreiro de Umbanda"></div>`;

export function render(erro, email = '', candidatos = null) {
  if (candidatos) {
    return `${LOGO}<div class="card login">
      <h2>Quem é você?</h2>
      <p class="muted" style="margin:0;font-size:.92rem">Não encontrei exatamente esse nome. Toque no seu nome como está cadastrado na corrente:</p>
      <div class="candidatos">${candidatos.map((n) => `<button class="btn" data-soueu="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <button class="btn link" data-soueu="">Não sou nenhum destes · digitar de novo</button>
    </div>`;
  }
  return `${LOGO}<div class="card login">
    <h2>Entrar</h2>
    <p class="muted" style="margin:0;font-size:.92rem">Use o e-mail e a senha que o admin da corrente cadastrou para você.</p>
    ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="f-login">
      <label class="field">E-mail<input type="text" inputmode="email" id="l-email" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(email)}"></label>
      <label class="field"><span id="l-senha-rotulo">Senha</span><input type="password" id="l-senha" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit" id="l-btn">Entrar</button>
    </form>
  </div>`;
}

export function renderInstalacao(erro) {
  return `${LOGO}<div class="card login">
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

// Com o acesso da corrente no campo de e-mail, o campo de senha vira "Seu nome".
export function ajustarCampoSenha(ehCorrente) {
  const rot = document.getElementById('l-senha-rotulo');
  const inp = document.getElementById('l-senha');
  if (!rot || !inp) return;
  if (ehCorrente && inp.type !== 'text') {
    rot.textContent = 'Seu nome';
    inp.type = 'text';
    inp.value = '';
    inp.autocomplete = 'name';
    inp.placeholder = 'Seu nome como está cadastrado na corrente';
  } else if (!ehCorrente && inp.type !== 'password') {
    rot.textContent = 'Senha';
    inp.type = 'password';
    inp.value = '';
    inp.autocomplete = 'current-password';
    inp.placeholder = '';
  }
}
