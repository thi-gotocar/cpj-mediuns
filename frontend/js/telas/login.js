// Telas de entrada: login e instalação (primeiro acesso).

import { esc } from '../util.js';

const LOGO = `<div class="logo-terreiro"><img src="/img/terreiro.png" width="200" height="200" alt="Casa do Pai João · Terreiro de Umbanda"></div>`;

export function render(erro, email = '') {
  return `${LOGO}<div class="card login">
    <h2>Entrar</h2>
    ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="f-login">
      <label class="field">E-mail ou celular<input type="text" inputmode="email" id="l-email" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${esc(email)}"></label>
      <label class="field">Senha<input type="password" id="l-senha" autocomplete="current-password"></label>
      <button class="btn primary" type="submit" id="l-btn">Entrar</button>
    </form>
    <p class="muted" style="margin:0;font-size:.85rem">Primeiro acesso ou senha apagada pela administração? Digite o e-mail ou o celular, deixe a senha em branco e toque em Entrar. Não sabe o que está no seu cadastro? Toque em <b>Criar cadastro</b> e digite o seu CPF: se você já tem cadastro, o app acha.</p>
    <button class="btn link" data-conta="esqueci">Esqueci a senha</button>
    <button class="btn" data-conta="cadastro">Criar cadastro</button>
  </div>
  <a class="card login-fila" href="/fila"><span class="login-fila-ico" aria-hidden="true">🎟️</span>
    <span><b>Pegar senha da fila</b><small>Veio para a gira? Pegue a sua senha sem precisar de cadastro.</small></span>
    <span class="seta" aria-hidden="true">›</span></a>`;
}

// Quem entrou com e-mail ou celular e ainda não tem senha: confirma com o outro contato do cadastro e cria a senha.
export function renderCriarSenha(erro, contato, confirmar) {
  const cel = confirmar === 'celular';
  return `${LOGO}<div class="card login">
    <h2>Crie a sua senha</h2>
    <p class="muted" style="margin:0;font-size:.92rem">Você ainda não tem senha. Para confirmar que é você, digite o seu <b>${cel ? 'celular' : 'e-mail'}</b> como está no cadastro.</p>
    ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
    <form id="f-criarsenha" autocomplete="off">
      <label class="field">Entrando com<input type="text" value="${esc(contato)}" disabled></label>
      ${cel
        ? '<label class="field">Seu celular com DDD<input type="tel" id="cs-conf" data-mascara="tel" required inputmode="tel" autocomplete="tel-national" placeholder="(11) 91234-5678"></label>'
        : '<label class="field">Seu e-mail<input type="email" id="cs-conf" required maxlength="120" autocomplete="email" autocapitalize="none" spellcheck="false"></label>'}
      <label class="field">Nova senha<input type="password" id="cs-senha" required inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="new-password" placeholder="6 a 8 números"></label>
      <label class="field">Repita a senha<input type="password" id="cs-senha2" required inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="new-password"></label>
      <button class="btn primary" type="submit" id="cs-btn">Criar senha e entrar</button>
    </form>
    <button class="btn link" data-conta="voltarlogin">Voltar</button>
  </div>`;
}

// Sem envio de e-mail ou SMS por enquanto: quem esqueceu pede para a administração.
export function renderEsqueci() {
  return `${LOGO}<div class="card login">
    <h2>Esqueci a senha</h2>
    <p class="muted" style="margin:0;font-size:.92rem">Por enquanto, a senha é redefinida pela administração da casa. Fale com ela pelo WhatsApp; depois é só entrar e criar a senha nova.</p>
    <button class="btn link" data-conta="voltarlogin">Voltar</button>
  </div>`;
}

// Cadastro feito pela própria pessoa. Começa pelo CPF (cpfInfo null): se ele já tem cadastro (corrente ou aluno), a pessoa
// só entra com a senha ou, sem senha, cria a senha confirmando o celular (ou o e-mail) do cadastro; os dados ficam como estão.
// CPF novo: o resto do formulário, e a pessoa entra como aluno sem turma (a administração põe no lugar certo depois).
// cpfInfo = { cpf, existe, temSenha, confirmar }.
export function renderCadastro(erro, cpfInfo = null) {
  const err = erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : '';
  const senhaNova = (id) => `<label class="field">Senha<input type="password" id="${id}" required inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="new-password" placeholder="6 a 8 números"></label>
      <label class="field">Repita a senha<input type="password" id="${id}2" required inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" autocomplete="new-password"></label>`;
  const cpfFixo = cpfInfo ? `<label class="field">CPF<input type="text" value="${esc(cpfInfo.cpf)}" disabled></label>` : '';
  const trocar = '<button class="btn link" data-conta="trocarcpf">Trocar CPF</button>';
  const voltar = '<button class="btn link" data-conta="voltarlogin">Voltar para o Entrar</button>';
  let corpo;
  if (!cpfInfo) {
    corpo = `<p class="muted" style="margin:0;font-size:.92rem">Comece pelo CPF. Se você já tem cadastro (na corrente ou como aluno), o app acha e você só entra com a senha.</p>
    ${err}
    <form id="f-cadcpf">
      <label class="field">CPF<input type="text" id="c-cpf" required inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000.000.000-00"></label>
      <button class="btn primary" type="submit" id="c-btn">Continuar</button>
    </form>
    ${voltar}`;
  } else if (cpfInfo.existe && cpfInfo.temSenha) {
    corpo = `<p class="muted" style="margin:0;font-size:.92rem">Você já tem cadastro com este CPF. Digite a sua senha para entrar.</p>
    ${err}
    <form id="f-cadsenha" autocomplete="off">
      ${cpfFixo}
      <label class="field">Sua senha<input type="password" id="c-senha" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="current-password" placeholder="Só números"></label>
      <button class="btn primary" type="submit" id="c-btn">Entrar</button>
    </form>
    <button class="btn link" data-conta="esqueci">Esqueci a senha</button>
    ${trocar}`;
  } else if (cpfInfo.existe && cpfInfo.confirmar) {
    const cel = cpfInfo.confirmar === 'celular';
    corpo = `<p class="muted" style="margin:0;font-size:.92rem">Você já tem cadastro com este CPF, mas ainda não tem senha. Para confirmar que é você, digite o seu <b>${cel ? 'celular' : 'e-mail'}</b> como está no cadastro e crie a senha. Os seus dados continuam como estão.</p>
    ${err}
    <form id="f-cadcriar" autocomplete="off">
      ${cpfFixo}
      ${cel
        ? '<label class="field">Seu celular com DDD<input type="tel" id="c-conf" data-mascara="tel" required inputmode="tel" autocomplete="tel-national" placeholder="(11) 91234-5678"></label>'
        : '<label class="field">Seu e-mail<input type="email" id="c-conf" required maxlength="120" autocomplete="email" autocapitalize="none" spellcheck="false"></label>'}
      ${senhaNova('c-senha')}
      <button class="btn primary" type="submit" id="c-btn">Criar senha e entrar</button>
    </form>
    ${trocar}`;
  } else if (cpfInfo.existe) {
    corpo = `<p class="muted" style="margin:0;font-size:.92rem">Você já tem cadastro com este CPF, mas ele não tem celular nem e-mail para confirmar que é você. Fale com a administração para criar a sua senha.</p>
    ${err}
    ${trocar}`;
  } else {
    corpo = `<p class="muted" style="margin:0;font-size:.92rem">Você entra como aluno. Depois a administração coloca você na turma ou na corrente.</p>
    ${err}
    <form id="f-cadastro">
      ${cpfFixo}
      <label class="field">Nome e sobrenome<input type="text" id="c-nome" required minlength="3" maxlength="80" autocomplete="name"></label>
      <label class="field">Celular com DDD<input type="tel" id="c-celular" data-mascara="tel" required inputmode="tel" autocomplete="tel-national" placeholder="(11) 91234-5678"></label>
      <label class="field">E-mail<input type="email" id="c-email" required maxlength="120" autocomplete="email" autocapitalize="none" spellcheck="false"></label>
      ${senhaNova('c-senha')}
      <button class="btn primary" type="submit" id="c-btn">Criar cadastro e entrar</button>
    </form>
    ${trocar}`;
  }
  return `${LOGO}<div class="card login">
    <h2>Criar cadastro</h2>
    ${corpo}
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
