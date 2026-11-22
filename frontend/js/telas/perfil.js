// Tela "Perfil": cada pessoa registra as suas informações, os seus orixás, guias e outros guias.
// Duas sub-abas (para quem tem a corrente para ver): **Meu perfil** — cabeçalho com foto e o que falta, Informações em
// modo leitura (Editar abre os campos) e os outros blocos numa lista, um aberto por vez — e **Corrente** — ver o perfil
// (ou o contato) de alguém, a Anamnese de todos e o bloco Pessoas.

import { ORIXAS, LINHAS_CADASTRO, LINHA_KEYS, FUNCOES } from '/shared/regras.js';
import { POSICOES_ORIXA, POSICOES_GUIA, GUIAS, NOME_GUIA_MAX, respondeu, lerNascimento, nascimentoBR, telefoneBR, soNumeros, emailValido, blocosAfinidade, cadastraEspiritual, cpfValido, cpfBR,
  ANAMNESE_TIPOS, ANAMNESE_PERGUNTA_MAX, ANAMNESE_TEXTO_MAX, ANAMNESE_SIMNAO, ANAMNESE_TIPO_LABEL, anamnesePreenchida, respostasPorPessoa, textoAnamnese, valorAnamnese } from '/shared/perfil.js';
import { estado, pode, visaoAtiva, vePessoas, avisar, carregarPerfil, mudarPerfil, salvarAfinidade, carregarFoto, salvarFoto, salvarInfoDe, carregarAnamnese, acaoAnamnese, lerCpf, salvarCpf } from '../estado.js';
import { esc, toast, iniciais, baixar, hoje } from '../util.js';
import { emDemo } from '../auth.js';
import { ICONE_WHATS } from './giraComum.js';

const GUIA_LABEL = Object.fromEntries(GUIAS);
const ROT_ORIXA = { frente: 'frente', ancestral: 'ancestral', adjunto: 'adjunto' };
const U = () => estado.pfUi;
const admin = () => pode('perfil:corrente') && Array.isArray(estado.perfil?.todos);
const soAluno = () => visaoAtiva() === 'alunos';
// Sub-aba Corrente: quem administra o Perfil, quem vê Pessoas e quem pode ver o contato de alguém da corrente.
const temCorrente = () => !soAluno() && (admin() || vePessoas() || (estado.perfil?.contatos || []).length > 1);

// Cabeçalho do card: toca para minimizar/expandir (os da corrente só para o admin; os meus, para todos).
function cab(k, titulo, count, aberto, dobra) {
  if (!dobra) return `<div class="grp-h"><h2>${titulo}</h2><span class="count">${count}</span></div>`;
  return `<button class="grp-h dobra" data-act="pfdobra" data-k="${k}" aria-expanded="${aberto}" aria-label="${aberto ? 'Minimizar' : 'Expandir'}">
    <h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
}
// adm: o card fica dentro da moldura dourada "ADMIN" (no topo da aba), sem borda própria.
function card(k, titulo, count, padrao, corpo, dobra = admin(), adm = false) {
  const ab = !dobra || (U().abertos[k] ?? padrao);
  return `<div class="card pf-c-${k}${adm ? ' pf-adm-card' : ''}">${cab(k, titulo, count, ab, dobra)}${ab ? corpo() : ''}</div>`;
}

// ---------- Pessoas (abaixo da moldura ADMIN PERFIL) ----------
// A antiga aba Pessoas (saiu do menu) dentro de um bloco que começa aberto, com a Corrente e as Oferendas pendentes
// (o resto no "Ver mais" da própria tela); aparece para quem tem permissão de ver Pessoas ou Alunos (vePessoas).
// Os toques e as mudanças dentro dele vão para a tela Pessoas (main.js, pelo data-tela).
let telaPessoas = null;
function cardPessoas() {
  if (!vePessoas()) return '';
  const aberto = U().abertos.pessoas ?? true;
  let corpo = '';
  if (aberto && !telaPessoas) {
    import('./pessoas.js').then((m) => { telaPessoas = m; avisar(); });
    corpo = '<div class="loading">Carregando…</div>';
  } else if (aberto) corpo = `<div class="pf-pessoas" data-tela="pessoas">${telaPessoas.render({ embutida: true })}</div>`;
  return `<div class="card pf-c-pessoas">${cab('pessoas', '<span aria-hidden="true">👥</span> Pessoas', '', aberto, true)}${corpo}</div>`;
}

// ---------- Admin root: Ajustes perfil ----------
// Exibe informações espirituais e gerencia data de entrada e senhas por pessoa.

// Quem ainda não criou a senha do acesso da corrente (sem ela, Perfil, CPF e pagamentos não abrem).
// Tocar no nome abre a Senha da pessoa logo abaixo; o WhatsApp leva um lembrete pronto (celular do Perfil).
function listaSemSenha(todos, A) {
  if (!estado.senhas) return '';
  const sem = estado.senhas.filter((s) => !s.temSenha);
  if (!sem.length) return '<p class="muted aj-sem-ok">✓ Todos da corrente já criaram a senha.</p>';
  const aberto = !!A.semAberto;
  const app = location.origin;
  const zap = (s) => {
    const tel = soNumeros(todos.find((t) => t.pessoaId === s.pessoaId)?.perfil?.info?.celular || '');
    if (tel.length < 10) return '';
    const txt = `Olá, ${s.nome.split(/\s+/)[0]}! Falta criar a sua senha no app da corrente: entre em ${app}, toque em Criar cadastro e digite o seu CPF (ou entre com o seu e-mail ou celular e a senha em branco) e crie a senha (6 a 8 números). Sem ela, o seu Perfil e os seus pagamentos não abrem.`;
    return `<a class="btn small wa-bt" href="https://wa.me/55${tel}?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener noreferrer" aria-label="Lembrar ${esc(s.nome)} no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span></a>`;
  };
  return `<div class="aj-sem"><button class="grp-h dobra" data-act="ajsemdobrar" aria-expanded="${aberto}"><h3>🔒 Sem senha</h3>
      <span class="count">${sem.length} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>
    ${aberto ? `<div class="aj-sem-lista">${sem.map((s) => `<div class="aj-sem-l"><button class="btn link" data-act="ajsemsenha" data-id="${s.pessoaId}">${esc(s.nome)}</button>${zap(s)}</div>`).join('')}</div>` : ''}</div>`;
}
export function renderAjustesPerfil(todos) {
  const A = (estado.ajUi ||= { pessoa: '', campo: '' });
  const root = pode('usuarios:gerenciar');
  if (!root) return '';
  const x = todos.find((t) => t.pessoaId === A.pessoa);
  // Curimba: sem orixás e guias.
  const CAMPOS = [...(!x || cadastraEspiritual(x.funcao) ? [['espiritual', 'Orixás e guias']] : []),
    ['entrada', 'Entrada na corrente'], ['senha', 'Senha']];
  if (!CAMPOS.some(([k]) => k === A.campo)) A.campo = '';
  let h = listaSemSenha(todos, A) + `<div class="aj-sel">
      <label class="field">Pessoa<select data-act="ajpessoa" aria-label="Pessoa"><option value="">— escolha a pessoa —</option>${todos.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === A.pessoa ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
      <label class="field">O que ver, incluir ou alterar<select data-act="ajcampo" aria-label="O que alterar" ${x ? '' : 'disabled'}><option value="">— escolha —</option>${CAMPOS.map(([k, l]) => `<option value="${k}" ${k === A.campo ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>`;
  if (!x || !A.campo) return h;
  if (A.campo === 'espiritual') {
      // Orixás e guias da pessoa (só para ver).
      const Pf = x.perfil;
      const linha = (rot, val, of) => `<div class="aj-v"><span class="muted">${rot}</span><b>${val ? esc(val) : '<span class="muted">—</span>'}</b>${val ? `<span class="aj-of ${of ? 'ok' : ''}">${of ? '✓ oferenda' : 'sem oferenda'}</span>` : ''}</div>`;
      const outros = GUIAS.filter(([k]) => Pf.outros[k]);
      h += `<div class="aj-ver">
        ${POSICOES_ORIXA.map(([k, rot]) => linha(rot, Pf.orixas[k].nome, Pf.orixas[k].oferenda)).join('')}
        ${POSICOES_GUIA.map(([k, rot]) => linha(rot, GUIA_LABEL[Pf.guias[k].linha], Pf.guias[k].oferenda)).join('')}
        ${outros.length ? `<div class="aj-v"><span class="muted">Guias de atendimento</span><b>${outros.map(([k, l]) => `${esc(l)}: ${esc(Pf.outros[k])}`).join(' · ')}</b></div>` : ''}
        ${respondeu(Pf) ? '' : '<p class="muted" style="margin:0">Ainda não respondeu os orixás e guias.</p>'}</div>`;
  } else if (A.campo === 'entrada') {
      // Igual era na aba Usuários: a pessoa só conta nas giras a partir dessa data.
      const p = estado.pessoas.find((y) => y.id === x.pessoaId);
      h += p ? `<p class="muted" style="margin:0;font-size:.85rem">A pessoa só conta nas giras a partir da data de entrada (presença, faltas, sorteio, limpeza e estatísticas). Sem data, conta em todas.</p>
        <div class="aj-form"><label class="field">Entrada na corrente<input type="date" id="ent-${p.id}" data-act="entrada" data-id="${p.id}" value="${p.entrada || ''}"></label>
        ${p.entrada ? `<button class="btn" data-act="limparentrada" data-id="${p.id}" aria-label="Tirar a data de entrada">✕ Tirar a data</button>` : ''}</div>` : '';
  } else if (A.campo === 'senha') {
      // Senha de números da corrente (entra com e-mail, celular ou CPF); a do e-mail fica em "Quem tem acesso".
      if (!estado.senhas) return h + '<div class="loading">Carregando…</div>';
      const s = estado.senhas.find((y) => y.pessoaId === x.pessoaId);
      const ed = estado.senhaEdit;
      h += `<div class="sn-l"><div class="sn-nome"><b>${esc(x.nome)}</b> <span class="badge ${s?.temSenha ? 'sn-com' : 'sn-sem'}">${s?.temSenha ? 'com senha' : 'sem senha'}</span></div>
        <div class="sn-bts"><button class="btn small" data-act="snabrir" data-tipo="pin" data-id="${x.pessoaId}">Senha da corrente</button>${s?.temSenha ? `<button class="btn small danger" data-act="snlimpar" data-id="${x.pessoaId}" data-nome="${esc(x.nome)}">Limpar senha</button>` : ''}</div>
        ${ed?.tipo === 'pin' && ed.id === x.pessoaId ? formSenha('pin', x.pessoaId, x.nome) : ''}</div>
        <p class="muted" style="margin:0;font-size:.82rem">As senhas ficam guardadas embaralhadas: nem o app consegue mostrá-las. Esta é a senha de números de quem entra com e-mail, celular ou CPF. <b>Limpar senha</b> apaga a senha: a pessoa cria outra ao entrar, confirmando o celular (ou o e-mail). A senha do e-mail se troca em <b>Quem tem acesso</b>.</p>`;
  }
  return h;
}

// Formulário de nova senha da aba Admin root; quem grava é confirmarSenha, em usuarios.js.
export const formSenha = (tipo, id, nome) => `<form id="f-sn" class="sn-form" data-tipo="${tipo}" data-id="${id}" autocomplete="off">
  <input type="password" id="sn-in" ${tipo === 'pin' ? 'inputmode="numeric" pattern="[0-9]{6,8}" minlength="6" maxlength="8" placeholder="Nova senha (6 a 8 números)"' : 'minlength="8" placeholder="Nova senha do e-mail (mín. 8)"'} autocomplete="new-password" required aria-label="Nova senha de ${esc(nome)}">
  <button class="btn small danger" type="submit">Confirmar alteração</button><button class="btn small" type="button" data-act="snfechar">Cancelar</button></form>`;

// Foto da pessoa no canto do bloco Informações: a própria pessoa troca ou tira; o admin, de qualquer um.
// Editando: mostra a foto escolhida, que só é gravada no Salvar.
function blocoFoto(pessoaId, nome, editando) {
  if (!pessoaId) return '';
  const F = estado.fotosPessoa;
  if (F[pessoaId] === undefined) carregarFoto(pessoaId);
  const rasc = editando ? U().infoFoto : undefined;
  const url = rasc ? (rasc.b64 ? 'data:image/jpeg;base64,' + rasc.b64 : '') : F[pessoaId];
  return `<div class="pf-foto">
    <div class="pf-foto-img">${url ? `<img src="${url}" alt="Foto de ${esc(nome)}">` : `<span aria-hidden="true">${esc(iniciais(nome))}</span>`}</div>
    ${editando ? `<label class="btn small pf-foto-bt">📷 ${url ? 'Trocar' : 'Pôr foto'}<input type="file" accept="image/*" data-act="pffoto" hidden></label>
    ${url ? '<button type="button" class="btn link pf-foto-tirar" data-act="pftirafoto">Remover</button>' : ''}` : ''}
  </div>`;
}

// A foto vira um quadrado de 320 px (corta o centro), em JPEG: fica pequena para o banco.
async function reduzirFoto(arquivo) {
  let img;
  try { img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch {
    const url = URL.createObjectURL(arquivo);
    try { img = new Image(); img.src = url; await img.decode(); } finally { URL.revokeObjectURL(url); }
  }
  const lado = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 320;
  c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 320, 320);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
  return new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = erro; r.readAsDataURL(blob); });
}

function normalizarBusca(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

// De quem são os dados do bloco Informações: a pessoa do combo (começa na própria).
// Quem não é admin só recebe o contato das outras pessoas (parcial).
const naCorrente = () => U().sub === 'corrente' && temCorrente();
function pessoaDoBloco(eu) {
  const id = naCorrente() ? estado.infoPessoa || '' : eu?.pessoaId || '';
  if (!id) return null;
  if (id === eu?.pessoaId) return { pessoaId: id, nome: eu.nome, info: eu.perfil.info || {}, propria: true };
  const t = admin() ? estado.perfil.todos.find((x) => x.pessoaId === id) : null;
  if (t) return { pessoaId: id, nome: t.nome, info: t.perfil.info || {} };
  const c = (estado.perfil.contatos || []).find((x) => x.pessoaId === id);
  return c ? { pessoaId: id, nome: c.nome, info: { contatoNome: c.contatoNome, contatoTelefone: c.contatoTelefone }, parcial: true } : null;
}
const podeEditarInfo = (x) => !!x && (x.propria || admin());

// Bloco Informações: a pessoa no combo; os campos só abrem em Editar e só gravam em Salvar (depois de confirmar).
function cardInfo(eu) {
  const contatos = estado.perfil.contatos || [];
  if (!eu && !contatos.length) return '';
  const x = pessoaDoBloco(eu);
  const u = U();
  const editando = !!x && u.infoEdit === x.pessoaId;
  const I = x?.info || {};
  const atual = { nome: x?.parcial ? x.nome : I.nome, nascimento: nascimentoBR(I.nascimento), celular: telefoneBR(I.celular), email: I.email, contatoNome: I.contatoNome, contatoTelefone: telefoneBR(I.contatoTelefone) };
  // Fora da edição: rótulo e valor (vazio, "—"); em Editar, os campos.
  const campo = (k, rotulo, attrs, dica, cls = '') => (editando
    ? `<label class="field pf-info-c${cls}">${rotulo}<input id="pf-i-${k}" data-act="pfinfo" data-k="${k}" ${attrs} placeholder="${esc(dica)}" value="${esc(u.infoRasc[k] || '')}"></label>`
    : `<div class="pf-lin"><span>${rotulo}</span><span${atual[k] ? '' : ' class="muted"'}>${esc(atual[k] || '—')}</span></div>`);
  const sv = estado.perfilSalvo;
  const sel = x?.pessoaId || '';
  const busca = normalizarBusca(u.infoBusca || '');
  const pessoas = contatos.filter((t) => t.pessoaId === sel || normalizarBusca(t.nome).includes(busca));
  const numeroContato = soNumeros(I.contatoTelefone || '');
  const escolha = `<div class="pf-info-escolha">
      <label class="field">Pessoa<select id="info-pessoa" data-act="infopessoa" aria-label="De quem são as informações" ${editando ? 'disabled' : ''}>
        ${x ? '' : '<option value="">— escolha a pessoa —</option>'}
        ${pessoas.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === sel ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
      <button class="btn pf-info-busca-bt" type="button" data-act="infobusca" aria-label="Buscar pessoa" title="Buscar pessoa" ${editando ? 'disabled' : ''}>🔍</button>
    </div>
    <label class="pf-info-busca" id="info-busca" ${u.infoBuscaVisivel ? '' : 'hidden'}><span aria-hidden="true">🔍</span><input type="search" id="info-pessoa-busca" placeholder="Buscar pelo nome" aria-label="Buscar pessoa" value="${esc(u.infoBusca || '')}"></label>`;
  const btEditar = x && podeEditarInfo(x) && !editando ? '<button class="btn small" data-act="pfinfoeditar">Editar</button>' : '';
  const cabeca = `<div class="grp-h"><h2>Informações</h2><span class="pf-info-h"><span id="pf-salvo" class="pf-salvo ${sv || ''}">${sv === 'salvando' ? 'Salvando…' : sv === 'salvo' ? '✓ Salvo' : sv === 'erro' ? 'Não salvou' : ''}</span>${btEditar}</span></div>`;
  // Na sub-aba Corrente: o combo para escolher a pessoa (o próprio perfil fica no Meu perfil).
  const combo = naCorrente() && !soAluno();
  if (!x) return combo ? `<div class="card pf-info-card"><div class="grp-h"><h2>${admin() ? 'Ver o perfil de alguém' : 'Contato de alguém'}</h2></div>${escolha}<p class="muted" style="margin:0;font-size:.88rem">${admin() ? 'Abre as informações, os orixás e guias, os guias de atendimento e a anamnese da pessoa.' : 'Mostra a pessoa para contato de alguém da corrente.'}</p></div>` : '';
  return `${combo ? `<div class="card pf-info-card pf-escolha-card"><div class="grp-h"><h2>${admin() ? 'Ver o perfil de alguém' : 'Contato de alguém'}</h2></div>${escolha}</div>` : ''}<div class="card pf-info-card" id="pf-info">${cabeca}
    <div class="pf-info-sec"><div class="pf-dados"><div class="pf-info pf-info-1">
      ${campo('nome', 'Nome completo', 'type="text" maxlength="80" autocomplete="name"', x.nome, ' inteiro')}
      ${x.parcial ? '' : campo('nascimento', 'Data de nascimento', 'type="text" inputmode="numeric" maxlength="10" data-mascara="data" autocomplete="bday"', '31/10/1990')}
      ${x.parcial ? '' : campo('celular', 'Celular', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel" autocomplete="tel"', '(11) 91234-5678')}
      ${x.parcial ? '' : campo('email', 'E-mail', 'type="email" inputmode="email" maxlength="120" autocomplete="email"', 'nome@exemplo.com', ' inteiro')}
    </div>${editando || !x.propria ? blocoFoto(x.pessoaId, x.nome, editando) : ''}</div></div>
    ${blocoCpf(x)}
    <div class="pf-info-sec pf-info-contato"><h3>Pessoa para contato</h3><div class="pf-info">
      ${campo('contatoNome', 'Nome', 'type="text" maxlength="80"', 'Quem chamar')}
      ${campo('contatoTelefone', 'Telefone', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel"', '(11) 91234-5678')}
    </div>${!editando && !x.propria && numeroContato ? `<a class="btn small pf-ligar" href="tel:${numeroContato}"><span aria-hidden="true">📞</span> Ligar</a>` : ''}</div>
    ${editando ? `<div class="pf-bts">
      <button class="btn" data-act="pfinfocancelar">Cancelar</button>
      <button class="btn primary" data-act="pfinfosalvar">Salvar</button>
    </div>` : ''}</div>`;
}

// ---------- CPF (dado sensível) ----------
// Só a própria pessoa e o admin root (o servidor confere). Fica fora do estado e do bloco Editar:
// a tela recebe só o número mascarado; o inteiro vem em Mostrar e some sozinho em 30 s.
const C = { pessoaId: '', dados: undefined, cpf: '', timer: 0, editando: false, rasc: '', conf: false, ocupado: false };
const MOSTRAR_MS = 30000;
const podeCpf = (x) => !!x && !x.parcial && !soAluno() && (x.propria || pode('usuarios:gerenciar'));
const mascaraCpf = (v) => String(v).replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d{1,3})?(\d{1,3})?(\d{1,2})?$/, (_, a, b, c, d) => a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : ''));
function esconderCpf() { clearTimeout(C.timer); C.cpf = ''; }
function resetCpf(pessoaId) { esconderCpf(); Object.assign(C, { pessoaId, dados: undefined, editando: false, rasc: '', conf: false, ocupado: false }); }
async function carregarCpf(pessoaId) {
  C.dados = null;
  const r = await lerCpf(pessoaId);
  if (C.pessoaId !== pessoaId) return;
  C.dados = r || { erro: true };
  avisar();
}

function blocoCpf(x) {
  if (!podeCpf(x)) return '';
  if (C.pessoaId !== x.pessoaId) resetCpf(x.pessoaId);
  if (C.dados === undefined) carregarCpf(x.pessoaId);
  const D = C.dados;
  const aviso = `<p class="muted pf-cpf-aviso">${x.propria ? 'Só você e o admin root veem.' : 'Só a pessoa e o admin root veem.'} Fica guardado cifrado.</p>`;
  let corpo;
  if (!D) corpo = '<span class="muted">Carregando…</span>';
  else if (D.erro) corpo = `<span class="muted">Não foi possível carregar.</span> <button type="button" class="btn small" data-act="pfcpftentar">Tentar de novo</button>`;
  else if (C.editando) {
    corpo = `<div class="pf-cpf-form">
      <label class="field">${D.tem ? 'Novo CPF' : 'CPF'}<input id="pf-cpf-in" data-act="pfcpf" type="text" inputmode="numeric" maxlength="14" autocomplete="off" spellcheck="false" placeholder="000.000.000-00" value="${esc(C.rasc)}"></label>
      <div class="pf-bts"><button type="button" class="btn" data-act="pfcpfcancelar" ${C.ocupado ? 'disabled' : ''}>✕ Cancelar</button>
      <button type="button" class="btn primary" data-act="pfcpfsalvar" ${C.ocupado ? 'disabled' : ''}>💾 Salvar</button></div>
      ${D.tem ? `<button type="button" class="btn link danger pf-cpf-remover" data-act="pfcpfremover" ${C.ocupado ? 'disabled' : ''}>Remover o CPF</button>` : ''}</div>`;
  } else {
    const valor = C.cpf ? `<b>${esc(cpfBR(C.cpf))}</b>` : D.tem ? `<b>${esc(D.mascarado)}</b>` : '<span class="muted">Não cadastrado</span>';
    corpo = `<div class="pf-cpf-l"><span class="pf-cpf-v">${valor}</span><span class="pf-cpf-bts">
      ${D.tem ? `<button type="button" class="btn small" data-act="${C.cpf ? 'pfcpfocultar' : 'pfcpfmostrar'}" ${C.ocupado ? 'disabled' : ''}>${C.cpf ? '🙈 Ocultar' : '👁 Mostrar'}</button>` : ''}
      <button type="button" class="btn small" data-act="pfcpfeditar">${D.tem ? '✏️ Alterar' : '＋ Cadastrar'}</button></span></div>`;
  }
  return `<div class="pf-info-sec pf-cpf"><h3><span aria-hidden="true">🔒</span> CPF</h3>${corpo}${aviso}</div>`;
}

function janelaCpf() {
  if (!C.conf) return '';
  const x = pessoaDoBloco(estado.perfil.eu);
  const remover = C.conf === 'remover';
  const texto = remover ? `O CPF ${x?.propria ? 'guardado' : `de <b>${esc(x?.nome || '')}</b>`} será apagado.`
    : `Confira: <b>${esc(cpfBR(cpfValido(C.rasc)))}</b>${x?.propria ? '' : ` será o CPF de <b>${esc(x?.nome || '')}</b>`}.`;
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="pf-cpf-t"><div class="modal">
    <h3 id="pf-cpf-t">${remover ? 'Remover o CPF?' : 'Salvar o CPF?'}</h3><p style="margin:0">${texto}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="pfcpfconfnao">Cancelar</button><button class="btn ${remover ? 'danger' : 'primary'}" data-act="pfcpfconfsim">Confirmar</button></div>
  </div></div>`;
}

const cliquesCpf = {
  pfcpftentar() { C.dados = undefined; avisar(); },
  async pfcpfmostrar() {
    if (C.ocupado) return;
    C.ocupado = true; avisar();
    const id = C.pessoaId;
    const r = await lerCpf(id, true);
    C.ocupado = false;
    if (C.pessoaId !== id) return;
    if (r?.cpf) {
      esconderCpf();
      C.cpf = r.cpf;
      C.timer = setTimeout(() => { C.cpf = ''; avisar(); }, MOSTRAR_MS);
    }
    avisar();
  },
  pfcpfocultar() { esconderCpf(); avisar(); },
  pfcpfeditar() { esconderCpf(); Object.assign(C, { editando: true, rasc: '' }); avisar(); document.getElementById('pf-cpf-in')?.focus(); },
  pfcpfcancelar() { Object.assign(C, { editando: false, rasc: '' }); avisar(); },
  pfcpfsalvar() {
    if (!cpfValido(C.rasc)) { toast('CPF inválido. Confira os 11 números.'); return; }
    C.conf = 'salvar'; avisar();
  },
  pfcpfremover() { C.conf = 'remover'; avisar(); },
  pfcpfconfnao() { C.conf = false; avisar(); },
  async pfcpfconfsim() {
    const remover = C.conf === 'remover';
    const id = C.pessoaId;
    C.conf = false; C.ocupado = true; avisar();
    const r = await salvarCpf(id, remover ? '' : cpfValido(C.rasc));
    if (C.pessoaId !== id) return;
    C.ocupado = false;
    if (r) { Object.assign(C, { dados: r, editando: false, rasc: '' }); toast(remover ? 'CPF removido.' : 'CPF salvo.'); }
    avisar();
  },
};

// Rascunho de Editar, pronto para gravar; avisa e devolve null se algum campo estiver inválido.
function lerInfoRasc() {
  const r = U().infoRasc || {};
  const limpo = (k) => String(r[k] || '').replace(/\s+/g, ' ').trim();
  const nascimento = limpo('nascimento') ? lerNascimento(limpo('nascimento')) : '';
  if (limpo('nascimento') && !nascimento) { toast('Data de nascimento inválida. Use dia/mês/ano, por exemplo 31/10/1990.'); return null; }
  const [celular, contatoTelefone] = [soNumeros(limpo('celular')), soNumeros(limpo('contatoTelefone'))];
  if ((celular && celular.length < 10) || (contatoTelefone && contatoTelefone.length < 10)) { toast('Telefone incompleto: coloque o DDD e o número.'); return null; }
  const email = emailValido(limpo('email'));
  if (limpo('email') && !email) { toast('E-mail inválido. Confira, por exemplo nome@exemplo.com.'); return null; }
  return { nome: limpo('nome'), nascimento, celular, email, contatoNome: limpo('contatoNome'), contatoTelefone };
}
const fecharEdicaoInfo = () => Object.assign(U(), { infoEdit: null, infoRasc: null, infoFoto: undefined, infoConf: false });

function janelaInfo() {
  if (!U().infoConf) return '';
  const x = pessoaDoBloco(estado.perfil.eu);
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="pf-info-t"><div class="modal">
    <h3 id="pf-info-t">Salvar as informações?</h3><p style="margin:0">${x?.propria ? 'Suas informações serão atualizadas.' : `As informações de <b>${esc(x?.nome || '')}</b> serão atualizadas.`}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="pfinfoconfnao">Cancelar</button><button class="btn primary" data-act="pfinfoconfsim">Confirmar</button></div>
  </div></div>`;
}

// Selo ao lado do título: "não preenchido" (amarelo) ou "preenchido" (verde).
// ok: true/false, ou um estado: 'oferenda' (laranja) / 'andamento' (azul).
const SELOS = { true: ['ok', 'preenchido'], false: ['', 'não preenchido'], oferenda: ['oferenda', 'pendências'], andamento: ['andamento', 'em andamento'], apreencher: ['', 'a preencher'] };
const selo = (ok) => { const [c, t] = SELOS[ok] || SELOS.false; return `<span class="selo-preench ${c}">${t}</span>`; };
// Orixás / Guias: todos escolhidos e todas as oferendas marcadas = preenchido;
// tudo escolhido mas falta alguma oferenda = pendências.
function situacaoOferendas(itens, campo) {
  if (!itens.every((x) => x[campo])) return false;
  return itens.every((x) => x.oferenda) ? true : 'oferenda';
}

// Blocos de afinidade com as entidades (logo abaixo de Informações), conforme a função da pessoa.
const AFIN = {
  extra: { titulo: 'Atendimento extra', texto: 'Marque as entidades que você tem 100% de afinidade e segurança para estar pronto para a escala de atendimento extra.', funcao: 'atendimento extra' },
  passe: { titulo: 'Passe', texto: 'Marque as entidades que você tem 100% de afinidade e segurança para estar pronto para a escala de atendimento Passe.', funcao: 'passe' },
};
function blocosAfin(eu) {
  return blocosAfinidade(eu.funcao).map(({ tipo, campo }) => {
    const A = AFIN[tipo];
    const ls = (campo === 'linhas' ? eu.linhas : campo === 'extra' ? eu.afinidadeExtra : eu.afinidadePasse) || [];
    const todas = LINHA_KEYS.every((k) => ls.includes(k));
    return { k: 'afin-' + tipo, titulo: A.titulo, resumo: todas ? 'Todas as linhas' : ls.length ? `${ls.length} ${ls.length === 1 ? 'linha marcada' : 'linhas marcadas'}` : 'Nenhuma linha marcada', ok: ls.length > 0, selo: selo(ls.length > 0), corpo: () => `
      <p class="muted" style="margin:0;font-size:.9rem">${A.texto}</p>
      ${campo === 'linhas' ? `<p class="muted" style="margin:0;font-size:.82rem">Vale para o sorteio: nas giras das entidades que não estiverem marcadas, você entra como cambone. Marque “Todas” para atuar em todas. Sem nenhuma marcada, você não está apto a nenhuma e cambona.</p>` : ''}
      <label class="chip chip-todas"><input type="checkbox" id="af-${tipo}-todas" data-act="afintodas" data-tipo="${tipo}" ${LINHA_KEYS.every((k) => ls.includes(k)) ? 'checked' : ''}> Todas</label>
      ${LINHAS_CADASTRO.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
        `<label class="chip"><input type="checkbox" id="af-${tipo}-${k}" data-act="afin" data-tipo="${tipo}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${k === 'mista' ? 'Encontro das Linhas (Mista)' : label}</label>`).join('')}</div></div>`).join('')}` };
  });
}

// Uma posição (caixinha): rótulo, combo e "Oferenda realizada" ao lado (verde com ✓ quando marcada).
// ver: só visualização (admin olhando outra pessoa): campos travados e sem ação.
function linhaEscolha({ grupo, k, rotulo, valor, opcoes, oferenda, ver }) {
  return `<div class="pf-linha pf-pos${valor && oferenda ? ' feita' : ''}">
    <label class="pf-rot" for="pf-${grupo}-${k}">${rotulo}</label>
    <div class="pf-campos">
      <select id="pf-${grupo}-${k}" ${ver ? 'disabled' : `data-act="pfsel" data-g="${grupo}" data-k="${k}"`}>
        <option value="">${ver ? '—' : 'Selecione…'}</option>
        ${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <label class="chip pf-of${valor ? '' : ' off'}"><input type="checkbox" id="pf-of-${grupo}-${k}" ${ver ? '' : `data-act="pfof" data-g="${grupo}" data-k="${k}"`} ${oferenda ? 'checked' : ''} ${valor && !ver ? '' : 'disabled'}> Oferenda realizada</label>
    </div>
  </div>`;
}

// Bloco "Orixás, guias e oferendas": resumo das oferendas no topo e as seções Orixás e Guias dentro.
function cardEspiritual(P, ver = false) {
  const orixas = POSICOES_ORIXA.map(([k]) => P.orixas[k]);
  const guias = POSICOES_GUIA.map(([k]) => P.guias[k]);
  const okOrixas = situacaoOferendas(orixas, 'nome');
  const okGuias = situacaoOferendas(guias, 'linha');
  // Selo geral: preenchido só com tudo escolhido e todas as oferendas feitas.
  const okTudo = okOrixas === true && okGuias === true ? true : okOrixas && okGuias ? 'oferenda' : false;
  const todas = [...orixas, ...guias];
  const feitas = todas.filter((x) => x.oferenda).length;
  const pct = Math.round((feitas / todas.length) * 100);
  const secao = (titulo, ok, linhas) => `<div class="pf-sec"><div class="pf-sec-h"><h3>${titulo}</h3>${selo(ok)}</div>${linhas}</div>`;
  const resumo = [P.orixas.frente?.nome || '', GUIA_LABEL[P.guias.chefe?.linha] || '', `${feitas} de ${todas.length} oferendas`].filter(Boolean).join(' · ');
  return { k: 'espiritual', titulo: 'Orixás, guias e oferendas', resumo, ok: okTudo === true, selo: selo(okTudo), corpo: () => `
    <div class="pf-of-resumo"><div class="pf-of-resumo-h"><span>Oferendas realizadas</span><b>${feitas} de ${todas.length}</b></div>
      <div class="pf-barra${feitas === todas.length ? ' cheia' : ''}" role="img" aria-label="${feitas} de ${todas.length} oferendas realizadas"><span style="width:${pct}%"></span></div></div>
    ${secao('Orixás', okOrixas, POSICOES_ORIXA.map(([k, rotulo]) => linhaEscolha({ grupo: 'orixas', k, rotulo, valor: P.orixas[k].nome, opcoes: ORIXAS.map((o) => [o, o]), oferenda: P.orixas[k].oferenda, ver })).join(''))}
    ${secao('Guias', okGuias, POSICOES_GUIA.map(([k, rotulo]) => linhaEscolha({ grupo: 'guias', k, rotulo, valor: P.guias[k].linha, opcoes: GUIAS, oferenda: P.guias[k].oferenda, ver })).join(''))}` };
}

// Guias de atendimento (nome do guia em cada linha). ver: só visualização.
function cardOutros(P, ver = false) {
  const nOutros = GUIAS.filter(([k]) => (P.outros || {})[k]).length;
  const okOutros = nOutros === GUIAS.length ? true : nOutros ? 'andamento' : false;
  return { k: 'outros', titulo: 'Guias de atendimento', resumo: `${nOutros} de ${GUIAS.length} com o nome do guia`, ok: okOutros === true, selo: selo(okOutros), corpo: () => `
    ${ver ? '' : '<p class="muted" style="margin:0 0 8px;font-size:.85rem">Escreva o nome do seu guia em cada linha.</p>'}
    ${GUIAS.map(([k, label]) => `<div class="pf-linha pf-outro">
      <label class="pf-rot" for="pf-outro-${k}">${esc(label)}</label>
      <input id="pf-outro-${k}" type="text" maxlength="${NOME_GUIA_MAX}" placeholder="${ver ? '—' : 'Nome do guia'}" autocomplete="off" ${ver ? 'disabled' : `data-act="pfnome" data-k="${k}"`} value="${esc(P.outros[k] || '')}">
    </div>`).join('')}` };
}

// ---------- meu perfil ----------
// Lista dos blocos (um card só): cada linha com título, resumo e selo; um aberto por vez (U().bloco).
function listaBlocos(itens) {
  const L = itens.filter(Boolean);
  if (!L.length) return '';
  const ab = U().bloco;
  return `<div class="card pf-blocos">${L.map((b) => `<div class="pf-bloco pf-c-${b.k}${ab === b.k ? ' aberto' : ''}" id="pf-b-${b.k}">
    <button class="pf-bloco-h" data-act="pfbloco" data-k="${b.k}" aria-expanded="${ab === b.k}"><span class="pf-bloco-t"><b>${b.titulo}</b><small>${esc(b.resumo || '')}</small></span>${b.selo || ''}<span class="seta" aria-hidden="true">${ab === b.k ? '▾' : '▸'}</span></button>
    ${ab === b.k ? `<div class="pf-bloco-c">${b.corpo()}</div>` : ''}</div>`).join('')}</div>`;
}
// Os meus blocos (curimba: só as informações pessoais, sem orixás, guias nem guias de atendimento).
function meusBlocos(eu) {
  if (!cadastraEspiritual(eu.funcao)) return [];
  return [...blocosAfin(eu), cardEspiritual(eu.perfil), cardOutros(eu.perfil)];
}
// Cabeçalho do Meu perfil: foto, nome, função e o que falta (uma pílula por bloco; tocar abre o bloco).
function cabecalho(eu, blocos) {
  const I = eu.perfil.info || {};
  const infoOk = !!(I.nome && I.nascimento && I.celular && I.contatoNome && I.contatoTelefone);
  const itens = [{ k: 'info', titulo: 'Informações', ok: infoOk }, ...blocos.filter(Boolean)];
  const feitos = itens.filter((b) => b.ok).length;
  const funcao = soAluno() ? 'Aluno' : FUNCOES.find((f) => f.k === eu.funcao)?.label || (eu.funcao === 'curimba' ? 'Curimba' : '');
  return `<div class="pf-cab">${blocoFoto(eu.pessoaId, eu.nome, false)}
    <div class="pf-cab-t"><h1>${esc(I.nome || eu.nome)}</h1>${funcao ? `<span class="pf-cab-f">${esc(funcao)}</span>` : ''}<small class="muted">Perfil ${feitos} de ${itens.length} completo</small></div></div>
    <div class="pf-cab-pills">${itens.map((b) => `<button type="button" class="pf-pill${b.ok ? ' ok' : ''}" data-act="pfirbloco" data-k="${b.k}">${b.ok ? '✓ ' : ''}${esc(b.titulo.replace(', guias e oferendas', ' e guias'))}</button>`).join('')}</div>`;
}

// Admin com outra pessoa no combo de Informações: as respostas dela, só para ver.
function cardsDeOutra(x) {
  const espiritual = cadastraEspiritual(x.funcao) ? [cardEspiritual(x.perfil, true), cardOutros(x.perfil, true)] : [];
  return `<p class="pf-vendo"><span aria-hidden="true">👁️</span> Respostas de <b>${esc(x.nome)}</b> · só visualização</p>${listaBlocos([...espiritual, cardAnamneseDe(x)])}`;
}

// ---------- Anamnese ----------
// Pessoa: as perguntas cadastradas. Fica travado; "Editar" libera os campos e "Salvar" grava
// (os dois pedem confirmação numa janela). O selo considera apenas perguntas obrigatórias.
function campoAnamnese(q, i, v, ed) {
  const rot = `<span class="ana-q">${i + 1}. ${esc(q.texto)}${q.obrigatoria === false ? ' <span class="muted">(opcional)</span>' : ' <span class="ana-obrig">*</span>'}</span>`;
  if (q.tipo === 'simnao' || q.tipo === 'opcao' || q.tipo === 'multipla') {
    const opcoes = q.tipo === 'simnao' ? ANAMNESE_SIMNAO : (q.opcoes || []).map((x) => [x, x]);
    let selecionadas = [];
    if (q.tipo === 'multipla') {
      if (Array.isArray(v)) selecionadas = v;
      else try { selecionadas = JSON.parse(v); } catch { selecionadas = []; }
    }
    const multi = q.tipo === 'multipla';
    const marcadas = multi ? selecionadas : [v];
    return `<fieldset class="ana-item"${multi ? ` data-multipla="${q.id}"` : ''}${ed ? '' : ' disabled'}><legend>${rot}</legend><span class="ana-sn">${opcoes.map(([k, l]) => `<label class="check"><input type="${multi ? 'checkbox' : 'radio'}" name="ana-${q.id}" value="${esc(k)}" data-act="anaresp" data-q="${q.id}" ${marcadas.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</span></fieldset>`;
  }
  if (q.tipo === 'data') return `<label class="ana-item">${rot}<input type="date" value="${esc(v)}" data-act="anaresp" data-q="${q.id}"${ed ? '' : ' disabled'}></label>`;
  return `<label class="ana-item">${rot}<textarea rows="4" maxlength="${ANAMNESE_TEXTO_MAX}" data-act="anaresp" data-q="${q.id}"${ed ? ' placeholder="Sua resposta (até 20 linhas)"' : ' readonly placeholder="—"'}>${esc(v)}</textarea></label>`;
}
function cardAnamnese() {
  const A = estado.anamnese;
  if (A?.visivel === false && !admin()) return null;
  if (!A || A.erro) return { k: 'anamnese', titulo: 'Anamnese', resumo: A?.erro ? 'Não carregou' : 'Carregando…', ok: false, selo: '', corpo: () => `<p class="muted" style="margin:0">${A?.erro ? esc(A.erro) : 'Carregando…'}</p>` };
  const ok = anamnesePreenchida(A.perguntas, A.minhas);
  const ed = !!U().anaEdit;
  const vals = ed ? U().anaRasc || {} : A.minhas || {};
  return { k: 'anamnese', titulo: 'Anamnese', resumo: 'Ficha para apoio em emergências', ok, selo: A.perguntas.length ? selo(ok ? true : 'apreencher') : '', corpo: () => (!A.perguntas.length
    ? '<p class="muted" style="margin:0">Nenhuma pergunta cadastrada ainda.</p>'
    : `<p class="ana-instr">Ficha para apoio em emergências. Contém dados pessoais e de saúde: só você e administradores do Perfil podem consultar as respostas. Preencha as perguntas obrigatórias (<b>*</b>); campos opcionais ou iniciados por “Se sim” podem ficar em branco quando não se aplicarem.</p>
      <div class="ana-lista">${A.perguntas.map((q, i) => campoAnamnese(q, i, vals[q.id] || '', ed)).join('')}</div>
      <div class="row ana-bts">${ed ? '<button class="btn primary" data-act="anasalvar">Salvar</button><button class="btn" data-act="anacancelar">Cancelar</button>'
        : '<button class="btn" data-act="anaeditar">Editar</button>'}</div>`) };
}
// Anamnese de outra pessoa (admin): as respostas dela, travadas, sem Editar.
function cardAnamneseDe(x) {
  const A = estado.anamnese;
  if (!A || A.erro) return { k: 'anamnese', titulo: 'Anamnese', resumo: A?.erro ? 'Não carregou' : 'Carregando…', selo: '', corpo: () => `<p class="muted" style="margin:0">${A?.erro ? esc(A.erro) : 'Carregando…'}</p>` };
  const R = respostasPorPessoa(A.todas)[x.pessoaId] || {};
  return { k: 'anamnese', titulo: 'Anamnese', resumo: 'Só visualização', selo: A.perguntas.length ? selo(anamnesePreenchida(A.perguntas, R) ? true : 'apreencher') : '', corpo: () => (!A.perguntas.length
    ? '<p class="muted" style="margin:0">Nenhuma pergunta cadastrada ainda.</p>'
    : `<div class="ana-lista">${A.perguntas.map((q, i) => campoAnamnese(q, i, R[q.id] || '', false)).join('')}</div>`) };
}
// Os valores que estão na tela (antes de abrir a janela de Salvar).
function lerAnamneseTela() {
  const r = { ...(U().anaRasc || {}) };
  document.querySelectorAll('.ana-lista textarea[data-q], .ana-lista input[type=date][data-q]').forEach((t) => { r[t.dataset.q] = t.value; });
  document.querySelectorAll('.ana-lista input[type=radio][data-q]:checked').forEach((t) => { r[t.dataset.q] = t.value; });
  const multiplas = new Map();
  document.querySelectorAll('.ana-lista [data-multipla]').forEach((grupo) => {
    multiplas.set(grupo.dataset.multipla,
      [...grupo.querySelectorAll('input[type=checkbox]:checked')].map((t) => t.value));
  });
  multiplas.forEach((xs, id) => { r[id] = xs; });
  return r;
}
function janelaAnamnese() {
  const c = U().anaConf;
  if (!c) return '';
  const [t, txt, bt] = c === 'editar'
    ? ['Editar a anamnese?', 'Os campos ficam liberados para alterar. Nada muda até tocar em Salvar.', 'Editar']
    : ['Salvar as respostas?', 'As respostas da sua anamnese serão gravadas.', 'Salvar'];
  return `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="ana-t"><div class="modal">
    <h3 id="ana-t">${t}</h3><p style="margin:0">${txt}</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="anaconfnao">Cancelar</button><button class="btn primary" data-act="anaconfsim">${bt}</button></div>
  </div></div>`;
}

// Admin: % de quem já preencheu, as perguntas (＋ Adicionar pergunta, excluir), as respostas de uma pessoa
// e o arquivo com todas as respostas para mandar no WhatsApp.
// Bloco Anamnese do admin (moldura ADMIN PERFIL): o resumo vai no título do bloco; corpo() é o conteúdo.
function anamneseAdmin(todos) {
  const A = estado.anamnese;
  if (!A || A.erro) return null;
  const R = respostasPorPessoa(A.todas);
  const responderam = todos.filter((x) => anamnesePreenchida(A.perguntas, R[x.pessoaId]));
  const faltam = todos.filter((x) => !anamnesePreenchida(A.perguntas, R[x.pessoaId]));
  const pct = todos.length && A.perguntas.length ? Math.round((responderam.length / todos.length) * 100) : 0;
  const u = U();
  const x = todos.find((t) => t.pessoaId === u.anaPessoa);
  const grupoAberto = u.anamneseGrupo;
  const listaAberta = grupoAberto === 'responderam' ? responderam : grupoAberto === 'faltam' ? faltam : null;
  const tituloLista = grupoAberto === 'responderam' ? 'Responderam' : 'Ainda não responderam';
  const val = valorAnamnese;
  return { pct, n: responderam.length, total: todos.length, corpo: () => `
    <div class="ana-adm-blocos">
    <section class="ana-adm-bloco">
      <div class="ana-adm-bloco-titulo">Acompanhamento</div>
      <label class="of-sw ana-vis-toggle"><input type="checkbox" role="switch" data-act="anavisibilidade" ${A.visivel !== false ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Exibir bloco para usuários</label>
      <div class="pf-of-totais pf-resp-totais" aria-label="Status das respostas da anamnese">
        <button class="pf-of-total pf-resp-total fn-respondeu${grupoAberto === 'responderam' ? ' selecionado' : ''}" type="button" data-act="pfanamnese" data-grupo="responderam" aria-expanded="${grupoAberto === 'responderam'}" aria-label="Responderam à anamnese: ${responderam.length} pessoas"${responderam.length ? '' : ' disabled'}><b>${responderam.length}</b><span>Responderam</span></button>
        <button class="pf-of-total pf-resp-total fn-faltam${grupoAberto === 'faltam' ? ' selecionado' : ''}" type="button" data-act="pfanamnese" data-grupo="faltam" aria-expanded="${grupoAberto === 'faltam'}" aria-label="Faltam responder à anamnese: ${faltam.length} pessoas"${faltam.length ? '' : ' disabled'}><b>${faltam.length}</b><span>Faltam</span></button>
      </div>
      ${listaAberta ? `<div class="pf-grupo"><div class="pf-gt">${tituloLista}<span class="count">${listaAberta.length}</span></div><ul class="pf-lista">${listaAberta.map((p) => `<li>${esc(p.nome)}</li>`).join('')}</ul></div>` : ''}
    </section>
    <section class="ana-adm-bloco">
      <div class="ana-adm-bloco-titulo">Respostas individuais</div>
      <label class="field">Ver as respostas de<select data-act="anapessoa" aria-label="De quem são as respostas">
        <option value="">— escolha a pessoa —</option>
        ${todos.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === u.anaPessoa ? 'selected' : ''}>${esc(t.nome)}${anamnesePreenchida(A.perguntas, R[t.pessoaId]) ? ' ✓' : ''}</option>`).join('')}</select></label>
      ${x ? `<div class="ana-ver">${A.perguntas.map((q, i) => { const v = val(q, (R[x.pessoaId] || {})[q.id]); return `<div><span class="ana-q">${i + 1}. ${esc(q.texto)}</span><span class="${v ? 'ana-r' : 'muted'}">${esc(v || 'sem resposta')}</span></div>`; }).join('')}</div>` : '<p class="muted" style="margin:0">Escolha uma pessoa para consultar as respostas.</p>'}
    </section>
    <section class="ana-adm-bloco">
    <div class="ana-adm-h"><b>Perguntas</b> <span class="muted">(${A.perguntas.length})</span>
      <button class="btn link small" type="button" data-act="anaperguntas" aria-expanded="${!!u.anamneseAdminAberta}" aria-controls="ana-adm-conteudo">${u.anamneseAdminAberta ? 'Ocultar perguntas' : 'Ver perguntas'}</button></div>
    <div id="ana-adm-conteudo" ${u.anamneseAdminAberta ? '' : 'hidden'}>
    ${u.anaNova || u.anaEditPergunta ? '' : '<div class="row" style="justify-content:flex-end"><button class="btn small" data-act="ananova"><span aria-hidden="true">＋</span> Adicionar pergunta</button></div>'}
    ${A.perguntas.length > 1 && !u.anaNova && !u.anaEditPergunta ? '<p class="ana-instr">Use as setas para mudar a ordem. Se preferir, também pode arrastar pelo ícone ⠿.</p>' : ''}
    ${u.anaNova ? `<div class="ana-nova">
      <label class="field">Pergunta<input type="text" id="ana-texto" maxlength="${ANAMNESE_PERGUNTA_MAX}" placeholder="Cabe numa linha" autocomplete="off"></label>
      <span class="ana-sn"><span class="muted">Resposta:</span>${ANAMNESE_TIPOS.map(([k, l], i) => `<label class="check"><input type="radio" name="ana-tipo" value="${k}" ${i ? '' : 'checked'}> ${l}</label>`).join('')}</span>
      <span class="row"><button class="btn small primary" data-act="anaperg">Salvar pergunta</button><button class="btn small" data-act="ananova">Cancelar</button></span></div>` : ''}
    ${A.perguntas.length ? `<ol class="ana-perg">${A.perguntas.map((q, i) => u.anaEditPergunta === q.id
      ? `<li class="ana-editando" data-pergunta-id="${q.id}"><label class="ana-edit-field">Pergunta<input type="text" id="ana-editar-texto" maxlength="${ANAMNESE_PERGUNTA_MAX}" value="${esc(q.texto)}"></label>
          <span class="row"><button class="btn small primary" data-act="anasalvarpergunta" data-id="${q.id}">Salvar</button><button class="btn small" data-act="anacancelareditar">Cancelar</button></span></li>`
      : `<li data-pergunta-id="${q.id}"><span class="ana-ordem"><button type="button" class="ana-mover" data-act="anamover" data-id="${q.id}" data-direcao="-1" aria-label="Mover pergunta ${i + 1} para cima" title="Mover para cima" ${i === 0 || u.anaReordenando ? 'disabled' : ''}>↑</button>
          <button type="button" class="ana-mover" data-act="anamover" data-id="${q.id}" data-direcao="1" aria-label="Mover pergunta ${i + 1} para baixo" title="Mover para baixo" ${i === A.perguntas.length - 1 || u.anaReordenando ? 'disabled' : ''}>↓</button></span>
          <button type="button" class="ana-arrastar" data-ana-arrastar aria-label="Arrastar para reordenar" title="Arraste para reordenar">⠿</button>
          <span>${esc(q.texto)} <span class="tag">${ANAMNESE_TIPO_LABEL[q.tipo] || 'Texto'}${q.obrigatoria === false ? ' · opcional' : ''}</span></span>
          ${estado.confirm === 'anaq:' + q.id ? `<button class="btn small danger" data-act="anaexcluir" data-id="${q.id}">Excluir</button>`
            : `<span class="ana-acoes"><button class="btn small" data-act="anaeditarpergunta" data-id="${q.id}" title="Editar pergunta" aria-label="Editar pergunta">Editar</button><button class="btn small lock-x" data-act="askdel" data-k="anaq:${q.id}" title="Excluir a pergunta (as respostas dela também saem)" aria-label="Excluir a pergunta">✕</button></span>`}</li>`).join('')}</ol>`
      : '<p class="muted" style="margin:0;font-size:.88rem">Nenhuma pergunta ainda.</p>'}
    <p class="ana-instr">O arquivo contém informações pessoais e de saúde. Compartilhe apenas com pessoas autorizadas.</p>
    <button class="btn" data-act="anacompartilhar"><span aria-hidden="true">📄</span> Compartilhar todas as respostas (arquivo)</button>
    </div>
    </section>
    </div>` };
}

// ---------- admin: a corrente ----------
// Guias da corrente: todos veem (só guia chefe e de frente de cada um); começa minimizado.
function cardGuiasCorrente(lista) {
  return card('corrente-guias', 'Guias da corrente', lista.length, false, () => (lista.length ? `
    <div class="pf-tab">
      <div class="pf-th"><span>Nome</span><span>Guia chefe</span><span>Guia de frente</span></div>
      ${lista.map((x) => `<div class="pf-tr"><span class="pf-nome">${esc(x.nome)}</span>${['chefe', 'frente'].map((k) => {
        const l = x[k];
        return `<span>${l ? esc(GUIA_LABEL[l]) : '<span class="muted">—</span>'}</span>`;
      }).join('')}</div>`).join('')}
    </div>` : '<p class="muted" style="margin:0">Ninguém informou os guias ainda.</p>'), true);
}

// Oferendas que faltam, só de quem já respondeu os orixás e guias.
function cardOferendas(todos) {
  const resp = todos.filter((x) => respondeu(x.perfil));
  const pendentes = resp.map((x) => {
    const falta = POSICOES_ORIXA.filter(([k]) => !x.perfil.orixas[k].oferenda)
      .map(([k]) => (x.perfil.orixas[k].nome ? `${x.perfil.orixas[k].nome} (${ROT_ORIXA[k]})` : `${ROT_ORIXA[k]}: não informado`));
    return { ...x, falta };
  }).filter((x) => x.falta.length);
  const ordem = ['medium', 'extra', 'passe', 'cambone', 'senha'];
  const titulo = { medium: 'Médiuns', extra: 'Médiuns At. Extra', passe: 'Médiuns de Passe', cambone: 'Cambones', senha: 'Senhas' };
  const tituloCurto = { medium: 'Médiuns', extra: 'At. Extra', passe: 'Passe', cambone: 'Cambones', senha: 'Senhas' };
  const porFuncao = ordem.map((funcao) => [funcao, pendentes.filter((x) => x.funcao === funcao)]);
  const total = pendentes.length;
  const funcaoAberta = U().oferendaFuncao;
  const grupoAberto = porFuncao.find(([funcao]) => funcao === funcaoAberta);
  return card('corrente-oferendas', '<span aria-hidden="true">🪔</span> Oferendas pendentes', total, true, () => `
    <div class="pf-of-totais" aria-label="Pessoas com oferendas pendentes por função">
      ${porFuncao.map(([funcao, pessoas]) => `<button class="pf-of-total fn-${funcao}${funcao === funcaoAberta ? ' selecionado' : ''}" type="button" data-act="pfofertas" data-funcao="${funcao}" aria-expanded="${funcao === funcaoAberta}" aria-label="${tituloCurto[funcao]}: ${pessoas.length} pessoas com oferendas pendentes"${pessoas.length ? '' : ' disabled'}><b>${pessoas.length}</b><span>${tituloCurto[funcao]}</span></button>`).join('')}
    </div>
    ${grupoAberto ? `<div class="pf-grupo" id="pf-of-lista"><div class="pf-gt">${titulo[grupoAberto[0]]} <span class="count">${grupoAberto[1].length}</span></div>
      <ul class="pf-lista">${grupoAberto[1].map((x) => `<li><b>${esc(x.nome)}</b> <span class="muted">— ${x.falta.map(esc).join(', ')}</span></li>`).join('')}</ul>
    </div>` : total ? '' : '<p class="muted" style="margin:0">Nenhuma oferenda pendente. 🙌</p>'}`, true, true);
}

// Aba Pessoas, dentro do bloco da Corrente (acima das licenças), sem moldura: só para quem recebe o perfil de todos.
let pedindoPerfil = false;
export function cardOferendasPendentes() {
  if (!pode('perfil:corrente')) return '';
  if (estado.perfil === null) {
    if (!pedindoPerfil) { pedindoPerfil = true; carregarPerfil().finally(() => { pedindoPerfil = false; }); }
    return '';
  }
  if (!admin()) return '';
  return cardOferendas(estado.perfil.todos.filter((x) => cadastraEspiritual(x.funcao)));
}

// Aluno: só o próprio bloco Informações e o de orixás, guias e oferendas, depois de criar a senha.
function renderAluno() {
  if (estado.me?.grupo === 'alunos' && !estado.me.temSenha) {
    return `<section class="panel pf-tela"><div class="card"><div class="grp-h"><h2><span aria-hidden="true">🔒</span> Perfil</h2></div><p class="muted" style="margin:0">Para abrir o seu perfil, crie a sua senha no botão <b>🔒 Criar senha</b>, no topo da tela.</p></div></section>`;
  }
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const { eu } = estado.perfil;
  if (!eu) return `<section class="panel pf-tela"><div class="card"><p class="muted" style="margin:0">Este usuário não tem perfil de aluno para mostrar nesta visão.</p></div></section>`;
  const blocos = [cardEspiritual(eu.perfil)];
  return `<section class="panel pf-tela">${cabecalho(eu, blocos)}${cardInfo(eu)}${listaBlocos(blocos)}${janelaInfo()}</section>`;
}

// Corrente (acesso cpj) sem senha: a aba aparece, mas o perfil só abre depois de criar a senha (aviso em janela).
function renderSemSenha() {
  const aviso = U().semSenhaFechado ? '' : `<div class="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="pf-ss-t"><div class="modal"><h3 id="pf-ss-t">🔒 Crie uma senha</h3>
    <p style="margin:0">Para ver o seu perfil, você precisa criar uma senha.</p>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="pfsemsenhafechar">Agora não</button><button class="btn primary" data-act="pfcriarsenha">Criar senha</button></div></div></div>`;
  return `<section class="panel pf-tela"><div class="card"><div class="grp-h"><h2><span aria-hidden="true">🔒</span> Perfil</h2></div><p class="muted" style="margin:0">Para abrir o seu perfil, crie a sua senha no botão <b>🔒 Criar senha</b>, no topo da tela.</p></div>${aviso}</section>`;
}

export function render() {
  if (soAluno()) return renderAluno();
  if (estado.me?.corrente && !estado.me.temSenha && visaoAtiva() !== 'root') return renderSemSenha();
  // Quem tem Pessoas/Alunos no perfil de acesso, mas não o Perfil: a aba abre só com o bloco Pessoas.
  if (!pode('perfil:ver')) return `<section class="panel pf-tela">${cardPessoas()}</section>`;
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const { eu, todos } = estado.perfil;
  if (estado.anamnese === null) { estado.anamnese = undefined; carregarAnamnese(); }
  const corrente = temCorrente();
  const naC = naCorrente();
  const barra = corrente ? `<div class="subabas pf-subabas" role="tablist" aria-label="Perfil"><button class="subaba" role="tab" data-act="pfsub" data-v="meu" aria-selected="${!naC}">Meu perfil</button><button class="subaba" role="tab" data-act="pfsub" data-v="corrente" aria-selected="${naC}">Corrente</button></div>` : '';
  let h = barra;
  if (naC) {
    // Corrente: o Adicionar (primeiro), ver o perfil (ou o contato) de alguém, o bloco Pessoas e a Anamnese de todos.
    if (vePessoas() && telaPessoas) {
      const add = telaPessoas.renderAdicionar();
      if (add) h += `<div class="pessoas-tela pf-pessoas pf-add" data-tela="pessoas">${add}</div>`;
    }
    h += cardInfo(eu);
    const outra = admin() && estado.infoPessoa && estado.infoPessoa !== eu?.pessoaId ? todos.find((x) => x.pessoaId === estado.infoPessoa) : null;
    if (outra) h += cardsDeOutra(outra);
    h += cardPessoas();
    if (admin()) {
      const ana = anamneseAdmin(todos);
      const abertaAdm = !!U().abertos['anamnese-adm'];
      h += `<div class="pf-adm-area" role="group" aria-label="Só para admin"><span class="pf-adm-rot">ADMIN PERFIL</span>
        <button class="grp-h dobra" data-act="pfdobra" data-k="anamnese-adm" aria-expanded="${abertaAdm}"><h2><span aria-hidden="true">🩺</span> Anamnese de todos${ana ? ` <span class="pf-cab-pct">${ana.pct}%</span>` : ''}</h2>
          <span class="count">${ana ? `${ana.n} de ${ana.total} ` : ''}<span class="seta" aria-hidden="true">${abertaAdm ? '▾' : '▸'}</span></span></button>
        ${abertaAdm ? (ana ? ana.corpo() : '<div class="loading">Carregando a anamnese…</div>') : ''}</div>`;
    }
  } else if (eu) {
    const blocos = [...meusBlocos(eu), cardAnamnese()];
    h += cabecalho(eu, blocos) + cardInfo(eu) + listaBlocos(blocos);
  } else {
    h += `<div class="card"><p class="muted" style="margin:0">Seu usuário não está ligado a uma pessoa da corrente, então não tem perfil próprio.${corrente ? ' Use a sub-aba Corrente.' : ''}</p></div>`;
  }
  if (!naC) h += cardGuiasCorrente(estado.perfil.guias || []);
  return `<section class="panel pf-tela">${h}${janelaAnamnese()}${janelaInfo()}${janelaCpf()}</section>`;
}

export const cliques = {
  ...cliquesCpf,
  pfsub(el) { if (U().infoEdit) fecharEdicaoInfo(); U().sub = el.dataset.v; avisar(); window.scrollTo(0, 0); },
  pfbloco(el) {
    const k = el.dataset.k;
    if (emDemo() && k === 'anamnese') { toast('Modo demonstração: a anamnese não abre.'); return; }
    U().bloco = U().bloco === k ? null : k;
    avisar();
  },
  // Pílula do cabeçalho: abre o bloco e rola até ele (Informações: só rola).
  pfirbloco(el) {
    const k = el.dataset.k;
    if (k !== 'info') { if (emDemo() && k === 'anamnese') { toast('Modo demonstração: a anamnese não abre.'); return; } U().bloco = k; avisar(); }
    setTimeout(() => document.getElementById(k === 'info' ? 'pf-info' : 'pf-b-' + k)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  },
  pfsemsenhafechar() { U().semSenhaFechado = true; avisar(); },
  pfcriarsenha() { U().semSenhaFechado = true; avisar(); document.querySelector('[data-conta="criarsenha"]')?.click(); },
  // Anamnese (pessoa): Editar e Salvar abrem a janela de confirmação.
  anaeditar() { U().anaConf = 'editar'; avisar(); },
  anasalvar() { U().anaRasc = lerAnamneseTela(); U().anaConf = 'salvar'; avisar(); },
  anacancelar() { U().anaEdit = false; U().anaRasc = null; avisar(); },
  anaconfnao() { U().anaConf = null; avisar(); },
  async anaconfsim() {
    const u = U();
    const A = estado.anamnese;
    if (u.anaConf === 'editar') {
      u.anaConf = null; u.anaEdit = true; u.anaRasc = { ...(A.minhas || {}) }; u.abertos.anamnese = true;
      avisar();
      return;
    }
    u.anaConf = null;
    const r = u.anaRasc || {};
    if (await acaoAnamnese('responder', { respostas: Object.fromEntries(A.perguntas.map((q) => [q.id, r[q.id] || ''])) })) {
      u.anaEdit = false; u.anaRasc = null;
      toast('Anamnese salva.');
      avisar();
    }
  },
  // Anamnese (admin): perguntas, respostas de uma pessoa e o arquivo para o WhatsApp.
  ananova() { U().anaNova = !U().anaNova; avisar(); if (U().anaNova) document.getElementById('ana-texto')?.focus(); },
  anaeditarpergunta(el) {
    U().anaNova = false;
    U().anaEditPergunta = el.dataset.id;
    avisar();
    document.getElementById('ana-editar-texto')?.focus();
  },
  anacancelareditar() { U().anaEditPergunta = null; avisar(); },
  async anasalvarpergunta(el) {
    const texto = (document.getElementById('ana-editar-texto')?.value || '').replace(/\s+/g, ' ').trim();
    if (!texto) { toast('Escreva a pergunta.'); return; }
    if (await acaoAnamnese('editarPergunta', { id: el.dataset.id, texto })) {
      U().anaEditPergunta = null;
      toast('Pergunta atualizada.');
      avisar();
    }
  },
  async anaperg() {
    const texto = (document.getElementById('ana-texto')?.value || '').replace(/\s+/g, ' ').trim();
    const tipo = document.querySelector('input[name=ana-tipo]:checked')?.value;
    if (!texto) { toast('Escreva a pergunta.'); return; }
    if (await acaoAnamnese('pergunta', { texto, tipo })) { U().anaNova = false; toast('Pergunta adicionada.'); avisar(); }
  },
  async anamover(el) {
    if (U().anaReordenando) return;
    const perguntas = estado.anamnese?.perguntas || [];
    const origem = perguntas.findIndex((q) => q.id === el.dataset.id);
    const destino = origem + Number(el.dataset.direcao);
    if (origem < 0 || destino < 0 || destino >= perguntas.length) return;
    const ids = perguntas.map((q) => q.id);
    [ids[origem], ids[destino]] = [ids[destino], ids[origem]];
    U().anaReordenando = true;
    avisar();
    try { await salvarOrdemAnamnese(ids); }
    finally { U().anaReordenando = false; avisar(); }
  },
  async anaexcluir(el) { estado.confirm = null; if (await acaoAnamnese('excluirPergunta', { id: el.dataset.id })) toast('Pergunta excluída.'); },
  // Um arquivo de texto com as respostas de todos: o celular oferece o WhatsApp; sem isso, baixa o arquivo.
  async anacompartilhar() {
    const A = estado.anamnese;
    const pessoas = (estado.perfil.todos || []).map((t) => ({ id: t.pessoaId, nome: t.nome }));
    const txt = textoAnamnese(A.perguntas, pessoas, respostasPorPessoa(A.todas), hoje());
    const nome = `anamnese-${hoje()}.txt`;
    try {
      const f = new File([txt], nome, { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Anamnese' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    baixar(new Blob([txt], { type: 'text/plain' }), nome);
    toast('Arquivo baixado: anexe no WhatsApp.');
  },
  pfinfoeditar() {
    const x = pessoaDoBloco(estado.perfil.eu);
    if (!podeEditarInfo(x)) return;
    const I = x.info;
    Object.assign(U(), { infoEdit: x.pessoaId, infoFoto: undefined, infoRasc: { nome: I.nome || '', nascimento: nascimentoBR(I.nascimento) || '', celular: telefoneBR(I.celular) || '', email: I.email || '', contatoNome: I.contatoNome || '', contatoTelefone: telefoneBR(I.contatoTelefone) || '' } });
    avisar();
  },
  pfinfocancelar() { fecharEdicaoInfo(); avisar(); },
  pfinfosalvar() { if (lerInfoRasc()) { U().infoConf = true; avisar(); } },
  pfinfoconfnao() { U().infoConf = false; avisar(); },
  async pfinfoconfsim() {
    const u = U();
    u.infoConf = false;
    const info = lerInfoRasc();
    const id = u.infoEdit;
    if (!info || !id) { avisar(); return; }
    // Se algo falhar, continua editando para tentar de novo.
    if (!(await salvarInfoDe(id, info))) return;
    if (u.infoFoto && !(await salvarFoto(id, u.infoFoto.b64))) return;
    fecharEdicaoInfo();
    toast('Informações salvas.');
    avisar();
  },
  pftirafoto() { U().infoFoto = { b64: null }; avisar(); },
  infobusca() {
    const busca = document.getElementById('info-pessoa-busca');
    const caixa = document.getElementById('info-busca');
    U().infoBuscaVisivel = !U().infoBuscaVisivel;
    if (!U().infoBuscaVisivel) {
      U().infoBusca = '';
      busca.value = '';
      buscarInfo(busca);
    }
    caixa.hidden = !U().infoBuscaVisivel;
    if (U().infoBuscaVisivel) busca.focus();
  },
  pfdobra(el) {
    const k = el.dataset.k;
    if (emDemo() && k.startsWith('anamnese')) { toast('Modo demonstração: a anamnese não abre.'); return; }
    if (k === 'anamnese-adm') {
      U().abertos[k] = el.getAttribute('aria-expanded') !== 'true';
      U().anamneseGrupo = null;
      U().anamneseAdminAberta = false;
      avisar();
      return;
    }
    if (k === 'corrente-oferendas') {
      U().abertos[k] = true;
      U().oferendaFuncao = null;
      avisar();
      return;
    }
    U().abertos[k] = el.getAttribute('aria-expanded') !== 'true';
    avisar();
  },
  pfanamnese(el) {
    U().anamneseGrupo = U().anamneseGrupo === el.dataset.grupo ? null : el.dataset.grupo;
    avisar();
  },
  anaperguntas() {
    U().anamneseAdminAberta = !U().anamneseAdminAberta;
    avisar();
  },
  pfofertas(el) {
    U().oferendaFuncao = U().oferendaFuncao === el.dataset.funcao ? null : el.dataset.funcao;
    avisar();
  },
};

export async function salvarOrdemAnamnese(ids) {
  if (await acaoAnamnese('reordenar', { ids })) toast('Ordem das perguntas atualizada.');
}

export function buscarInfo(el) {
  U().infoBusca = el.value;
  const select = document.getElementById('info-pessoa');
  const busca = normalizarBusca(el.value);
  for (const option of select.options) {
    if (option.value && option.value !== select.value) option.hidden = busca && !normalizarBusca(option.textContent).includes(busca);
  }
}

// Enquanto digita: guarda e salva sozinho (sem esperar sair do campo), se o valor já estiver completo.
export function digitando(el) {
  if (el.dataset.act === 'anaresp') { mudancas.anaresp(el); return; }
  const k = el.dataset.k;
  // Bloco Informações: só guarda o rascunho, para um redesenho não apagar; grava em Salvar.
  if (el.dataset.act === 'pfinfo') { if (U().infoRasc) U().infoRasc[k] = el.value; return; }
  if (el.dataset.act === 'pfcpf') { el.value = mascaraCpf(el.value); C.rasc = el.value; return; }
  const v = el.value.replace(/\s+/g, ' ').trim();
  mudarPerfil((P) => { if (v) P.outros[k] = v; else delete P.outros[k]; }, { silencioso: true });
}

export const mudancas = {
  async anavisibilidade(t) {
    if (await acaoAnamnese('visibilidade', { visivel: t.checked })) {
      toast(t.checked ? 'Anamnese exibida para os usuários.' : 'Anamnese ocultada dos usuários.');
    }
  },
  // Anamnese: guarda o que foi escolhido/digitado (sem redesenhar).
  anaresp(t) {
    if (!U().anaEdit) return;
    const r = (U().anaRasc ||= {});
    if (t.type === 'checkbox') {
      r[t.dataset.q] = [...document.querySelectorAll(`.ana-lista input[type=checkbox][data-q="${t.dataset.q}"]:checked`)].map((x) => x.value);
    } else r[t.dataset.q] = t.value;
  },
  anapessoa(t) { U().anaPessoa = t.value; avisar(); },
  // Foto: a escolhida no aparelho vira um quadrado pequeno; é gravada no Salvar.
  async pffoto(t) {
    const arq = t.files && t.files[0];
    t.value = '';
    if (!arq) return;
    let b64;
    try { b64 = await reduzirFoto(arq); } catch { toast('Não consegui abrir essa imagem.'); return; }
    U().infoFoto = { b64 };
    avisar();
  },
  afin(t) {
    const eu = estado.perfil.eu;
    const bloco = blocosAfinidade(eu.funcao).find((x) => x.tipo === t.dataset.tipo);
    if (!bloco) return;
    const atual = new Set((bloco.campo === 'linhas' ? eu.linhas : bloco.campo === 'extra' ? eu.afinidadeExtra : eu.afinidadePasse) || []);
    if (t.checked) atual.add(t.dataset.l); else atual.delete(t.dataset.l);
    salvarAfinidade(bloco.tipo, [...atual].sort());
  },
  // "Todas": marca (ou desmarca) todas as entidades. Nenhuma marcada = não está apto a nenhuma.
  afintodas(t) {
    const eu = estado.perfil.eu;
    const bloco = blocosAfinidade(eu.funcao).find((x) => x.tipo === t.dataset.tipo);
    if (!bloco) return;
    salvarAfinidade(bloco.tipo, t.checked ? [...LINHA_KEYS].sort() : []);
  },
  infopessoa(t) {
    estado.infoPessoa = t.value;
    U().infoBusca = '';
    U().infoBuscaVisivel = false;
    avisar();
  },
  pfsel(el) {
    const { g, k } = el.dataset;
    const campo = g === 'orixas' ? 'nome' : 'linha';
    mudarPerfil((P) => { P[g][k] = { [campo]: el.value, oferenda: el.value ? P[g][k].oferenda : false }; });
  },
  pfof(el) {
    const { g, k } = el.dataset;
    mudarPerfil((P) => { P[g][k].oferenda = el.checked; });
  },
  pfnome(el) {
    const v = el.value.replace(/\s+/g, ' ').trim();
    mudarPerfil((P) => { if (v) P.outros[el.dataset.k] = v; else delete P.outros[el.dataset.k]; }, { silencioso: true });
  },
};
