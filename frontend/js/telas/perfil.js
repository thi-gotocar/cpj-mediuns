// Tela "Perfil": cada pessoa registra as suas informações, os seus orixás, guias e outros guias.
// O admin também acompanha a corrente: quem já respondeu, os guias de todos e as oferendas pendentes.

import { ORIXAS, LINHAS_CADASTRO, LINHA_KEYS } from '/shared/regras.js';
import { POSICOES_ORIXA, POSICOES_GUIA, GUIAS, NOME_GUIA_MAX, respondeu, lerNascimento, nascimentoBR, telefoneBR, soNumeros, blocosAfinidade, cadastraEspiritual } from '/shared/perfil.js';
import { estado, pode, avisar, carregarPerfil, mudarPerfil, salvarInfoDe, salvarAfinidade, carregarUsuarios, atualizarPessoa, carregarFoto, salvarFoto } from '../estado.js';
import { esc, toast, iniciais } from '../util.js';

const GUIA_LABEL = Object.fromEntries(GUIAS);
const ROT_ORIXA = { frente: 'frente', ancestral: 'ancestral', adjunto: 'adjunto' };
const U = () => estado.pfUi;
const admin = () => pode('perfil:corrente') && Array.isArray(estado.perfil?.todos);

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

// ---------- admin: Ajustes (escolhe a pessoa e o que alterar) ----------
// Data de nascimento: admin. Entrada na corrente e senha: só o admin root (como era na aba Usuários).
function cardAjustes(todos) {
  const A = (estado.ajUi ||= { pessoa: '', campo: '' });
  const root = pode('usuarios:gerenciar');
  if (root && estado.usuarios === null) { estado.usuarios = undefined; carregarUsuarios(); }
  const x = todos.find((t) => t.pessoaId === A.pessoa);
  // Curimba: sem orixás e guias.
  const CAMPOS = [...(!x || cadastraEspiritual(x.funcao) ? [['espiritual', 'Orixás e guias']] : []),
    ...(root ? [['entrada', 'Entrada na corrente'], ['senha', 'Senha']] : [])];
  if (!CAMPOS.some(([k]) => k === A.campo)) A.campo = '';
  return card('ajustes', '⚙️ Ajustes', '', false, () => {
    let h = `<div class="aj-sel">
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
      // Igual era no bloco Senhas da aba Usuários: define uma nova senha, depois de confirmar.
      if (!estado.senhas || !Array.isArray(estado.usuarios)) return h + '<div class="loading">Carregando…</div>';
      const s = estado.senhas.find((y) => y.pessoaId === x.pessoaId);
      const u = estado.usuarios.find((y) => y.pessoaId === x.pessoaId);
      const ed = estado.senhaEdit;
      const form = (tipo, id) => `<form id="f-sn" class="sn-form" data-tipo="${tipo}" data-id="${id}" autocomplete="off">
        <input type="password" id="sn-in" ${tipo === 'pin' ? 'inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="Nova senha (4 a 8 números)"' : 'minlength="8" placeholder="Nova senha do e-mail (mín. 8)"'} autocomplete="new-password" required aria-label="Nova senha de ${esc(x.nome)}">
        <button class="btn small danger" type="submit">Confirmar alteração</button><button class="btn small" type="button" data-act="snfechar">Cancelar</button></form>`;
      h += `<div class="sn-l"><div class="sn-nome"><b>${esc(x.nome)}</b> <span class="badge ${s?.temSenha ? 'sn-com' : 'sn-sem'}">${s?.temSenha ? 'com senha' : 'sem senha'}</span>${u ? ` <span class="muted" style="font-size:.8rem">· ${esc(u.email)}</span>` : ''}</div>
        <div class="sn-bts"><button class="btn small" data-act="snabrir" data-tipo="pin" data-id="${x.pessoaId}">Senha da corrente</button>${u ? `<button class="btn small" data-act="snabrir" data-tipo="email" data-id="${u.id}">Senha do e-mail</button>` : ''}</div>
        ${ed && ((ed.tipo === 'pin' && ed.id === x.pessoaId) || (ed.tipo === 'email' && u && ed.id === u.id)) ? form(ed.tipo, ed.id) : ''}</div>
        <p class="muted" style="margin:0;font-size:.82rem">As senhas ficam guardadas embaralhadas: nem o app consegue mostrá-las. <b>Senha da corrente</b>: a de quem entra com a palavra-chave e o nome. <b>Senha do e-mail</b>: a de quem tem usuário.</p>`;
    }
    return h;
  }, true, true);
}

// Foto da pessoa no canto do bloco Informações: a própria pessoa troca ou tira; o admin, de qualquer um.
function blocoFoto(pessoaId, nome) {
  if (!pessoaId) return '';
  const F = estado.fotosPessoa;
  if (F[pessoaId] === undefined) carregarFoto(pessoaId);
  const url = F[pessoaId];
  return `<div class="pf-foto">
    <div class="pf-foto-img">${url ? `<img src="${url}" alt="Foto de ${esc(nome)}">` : `<span aria-hidden="true">${esc(iniciais(nome))}</span>`}</div>
    <label class="btn small pf-foto-bt">📷 ${url ? 'Trocar' : 'Pôr foto'}<input type="file" accept="image/*" data-act="pffoto" data-id="${pessoaId}" hidden></label>
    ${url ? `<button type="button" class="btn link pf-foto-tirar" data-act="pftirafoto" data-id="${pessoaId}">Remover</button>` : ''}
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

// Primeiro bloco: informações da pessoa (salva ao sair de cada campo).
// Informações de outra pessoa (admin): altera e grava ao tocar em Salvar.
function formInfoAdmin(x) {
  const I = x.perfil.info || {};
  const c = (k, rot, attrs, v) => `<label class="field">${rot}<input name="${k}" ${attrs} value="${esc(v || '')}"></label>`;
  return `<form id="f-ajinfo" class="aj-info" autocomplete="off" data-id="${x.pessoaId}">
    <div class="aj-foto">${blocoFoto(x.pessoaId, x.nome)}</div>
    ${c('nome', 'Nome', `type="text" maxlength="80" placeholder="${esc(x.nome)}"`, I.nome)}
    ${c('nascimento', 'Data de nascimento', 'type="text" inputmode="numeric" maxlength="10" data-mascara="data" placeholder="31/10/1990"', nascimentoBR(I.nascimento))}
    ${c('celular', 'Celular', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel" placeholder="preencher"', telefoneBR(I.celular))}
    ${c('contatoNome', 'Nome para contato', 'type="text" maxlength="80"', I.contatoNome)}
    ${c('contatoTelefone', 'Telefone para contato', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel" placeholder="preencher"', telefoneBR(I.contatoTelefone))}
    <div class="aj-bts"><button class="btn primary" type="submit">Salvar</button></div></form>`;
}

// Admin: informações de qualquer pessoa da corrente (escolhe no combo, altera e toca em Salvar).
function cardInfoAdmin(todos) {
  const sel = estado.infoPessoa || '';
  const x = todos.find((t) => t.pessoaId === sel);
  return card('info-corrente', 'Informações da corrente', '', false, () => `<label class="field">Pessoa<select data-act="infopessoa" aria-label="De quem são as informações">
      <option value="">— escolha a pessoa —</option>
      ${todos.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === sel ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
    ${x ? formInfoAdmin(x) : '<p class="muted" style="margin:0;font-size:.88rem">Escolha a pessoa para ver e alterar as informações.</p>'}`, true, true);
}

// Bloco Informações (o próprio perfil; salva enquanto digita): "Seus dados" e, numa caixinha, "Pessoa para contato".
function cardInfo(eu) {
  const I = eu.perfil.info || {};
  const campo = (k, rotulo, attrs, valor, cls = '') => `<label class="field pf-info-c${cls}">${rotulo}<input id="pf-i-${k}" data-act="pfinfo" data-k="${k}" ${attrs} value="${esc(valor || '')}"></label>`;
  const sv = estado.perfilSalvo;
  return `<div class="card pf-info-card"><div class="grp-h"><h2><span aria-hidden="true">👤</span> Informações</h2><span id="pf-salvo" class="pf-salvo ${sv || ''}">${sv === 'salvando' ? 'Salvando…' : sv === 'salvo' ? '✓ Salvo' : sv === 'erro' ? 'Não salvou' : ''}</span></div>
    <p class="pf-info-dica">Salva sozinho enquanto você digita.</p>
    <div class="pf-info-sec"><h3>Seus dados</h3><div class="pf-dados"><div class="pf-info pf-info-1">
      ${campo('nome', 'Nome', `type="text" maxlength="80" autocomplete="name" placeholder="${esc(eu.nome)}"`, I.nome, ' inteiro')}
      ${campo('nascimento', 'Data de nascimento', 'type="text" inputmode="numeric" maxlength="10" data-mascara="data" placeholder="31/10/1990" autocomplete="bday"', nascimentoBR(I.nascimento))}
      ${campo('celular', 'Celular', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel" placeholder="(11) 91234-5678" autocomplete="tel"', telefoneBR(I.celular))}
    </div>${blocoFoto(eu.pessoaId, eu.nome)}</div></div>
    <div class="pf-info-sec pf-info-contato"><h3><span aria-hidden="true">📞</span> Pessoa para contato</h3><div class="pf-info">
      ${campo('contatoNome', 'Nome', 'type="text" maxlength="80" placeholder="Quem chamar"', I.contatoNome)}
      ${campo('contatoTelefone', 'Telefone', 'type="tel" inputmode="numeric" maxlength="15" data-mascara="tel" placeholder="(11) 91234-5678"', telefoneBR(I.contatoTelefone))}
    </div></div></div>`;
}

// Selo ao lado do título: "não preenchido" (amarelo) ou "preenchido" (verde).
// ok: true/false, ou um estado: 'oferenda' (laranja) / 'andamento' (azul).
const SELOS = { true: ['ok', 'preenchido'], false: ['', 'não preenchido'], oferenda: ['oferenda', 'pendências'], andamento: ['andamento', 'em andamento'] };
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
function cardsAfinidade(eu) {
  return blocosAfinidade(eu.funcao).map(({ tipo, campo }) => {
    const A = AFIN[tipo];
    const ls = (campo === 'linhas' ? eu.linhas : campo === 'extra' ? eu.afinidadeExtra : eu.afinidadePasse) || [];
    // Começa minimizado; tocar no título expande.
    return card('afin-' + tipo, A.titulo, selo(ls.length > 0), false, () => `
      <p class="muted" style="margin:0;font-size:.9rem">${A.texto}</p>
      ${campo === 'linhas' ? `<p class="muted" style="margin:0;font-size:.82rem">Vale para o sorteio: nas giras das entidades que não estiverem marcadas, você entra como cambone. Marque “Todas” para atuar em todas. Sem nenhuma marcada, você não está apto a nenhuma e cambona.</p>` : ''}
      <label class="chip chip-todas"><input type="checkbox" id="af-${tipo}-todas" data-act="afintodas" data-tipo="${tipo}" ${LINHA_KEYS.every((k) => ls.includes(k)) ? 'checked' : ''}> Todas</label>
      ${LINHAS_CADASTRO.map((grp) => `<div class="lgrp"><span class="tag">${grp.grupo}</span><div class="lchips">${grp.itens.map(([k, label]) =>
        `<label class="chip"><input type="checkbox" id="af-${tipo}-${k}" data-act="afin" data-tipo="${tipo}" data-l="${k}" ${ls.includes(k) ? 'checked' : ''}> ${k === 'mista' ? 'Encontro das Linhas (Mista)' : label}</label>`).join('')}</div></div>`).join('')}`, true);
  }).join('');
}

// Uma posição (caixinha): rótulo, combo e "Oferenda realizada" ao lado (verde com ✓ quando marcada).
function linhaEscolha({ grupo, k, rotulo, valor, opcoes, oferenda }) {
  return `<div class="pf-linha pf-pos${valor && oferenda ? ' feita' : ''}">
    <label class="pf-rot" for="pf-${grupo}-${k}">${rotulo}</label>
    <div class="pf-campos">
      <select id="pf-${grupo}-${k}" data-act="pfsel" data-g="${grupo}" data-k="${k}">
        <option value="">Selecione…</option>
        ${opcoes.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <label class="chip pf-of${valor ? '' : ' off'}"><input type="checkbox" id="pf-of-${grupo}-${k}" data-act="pfof" data-g="${grupo}" data-k="${k}" ${oferenda ? 'checked' : ''} ${valor ? '' : 'disabled'}> Oferenda realizada</label>
    </div>
  </div>`;
}

// Bloco "Orixás, guias e oferendas": resumo das oferendas no topo e as seções Orixás e Guias dentro.
function cardEspiritual(P) {
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
  return card('espiritual', '<span aria-hidden="true">🕯️</span> Orixás, guias e oferendas', selo(okTudo), false, () => `
    <div class="pf-of-resumo"><div class="pf-of-resumo-h"><span>Oferendas realizadas</span><b>${feitas} de ${todas.length}</b></div>
      <div class="pf-barra${feitas === todas.length ? ' cheia' : ''}" role="img" aria-label="${feitas} de ${todas.length} oferendas realizadas"><span style="width:${pct}%"></span></div></div>
    ${secao('Orixás', okOrixas, POSICOES_ORIXA.map(([k, rotulo]) => linhaEscolha({ grupo: 'orixas', k, rotulo, valor: P.orixas[k].nome, opcoes: ORIXAS.map((o) => [o, o]), oferenda: P.orixas[k].oferenda })).join(''))}
    ${secao('Guias', okGuias, POSICOES_GUIA.map(([k, rotulo]) => linhaEscolha({ grupo: 'guias', k, rotulo, valor: P.guias[k].linha, opcoes: GUIAS, oferenda: P.guias[k].oferenda })).join(''))}`, true);
}

// ---------- meu perfil ----------
function meusCards(eu) {
  const P = eu.perfil;
  // Orixás e guias (num bloco só) e outros guias começam minimizados (para todos); tocar no título expande.
  const padrao = false;
  // Curimba: só as informações pessoais (não cadastra orixás, guias nem guias de atendimento).
  if (!cadastraEspiritual(eu.funcao)) return cardInfo(eu);
  const nOutros = GUIAS.filter(([k]) => (P.outros || {})[k]).length;
  const okOutros = nOutros === GUIAS.length ? true : nOutros ? 'andamento' : false;
  return cardInfo(eu) + cardsAfinidade(eu) + cardEspiritual(P)
  + card('outros', 'Guias de atendimento', selo(okOutros), padrao, () => `
    <p class="muted" style="margin:0 0 8px;font-size:.85rem">Escreva o nome do seu guia em cada linha.</p>
    ${GUIAS.map(([k, label]) => `<div class="pf-linha pf-outro">
      <label class="pf-rot" for="pf-outro-${k}">${esc(label)}</label>
      <input id="pf-outro-${k}" type="text" maxlength="${NOME_GUIA_MAX}" placeholder="Nome do guia" autocomplete="off" data-act="pfnome" data-k="${k}" value="${esc(P.outros[k] || '')}">
    </div>`).join('')}`, true);
}

// ---------- admin: a corrente ----------
function cardRespostas(todos) {
  const sim = todos.filter((x) => respondeu(x.perfil));
  const nao = todos.filter((x) => !respondeu(x.perfil));
  const pct = todos.length ? Math.round((sim.length / todos.length) * 100) : 0;
  return card('respostas', 'Respostas', `${sim.length} de ${todos.length}`, false, () => `
    <div class="pf-resp"><b>${pct}%</b><span>${sim.length} ${sim.length === 1 ? 'pessoa respondeu' : 'pessoas responderam'} · ${nao.length} ${nao.length === 1 ? 'falta' : 'faltam'}</span></div>
    <div class="pf-barra" role="img" aria-label="${pct}% responderam"><span style="width:${pct}%"></span></div>
    ${nao.length ? `<button class="btn link small pf-mais" data-act="pffaltam">${U().faltam ? '− Esconder' : `＋ Ver quem ainda não respondeu (${nao.length})`}</button>
      ${U().faltam ? `<ul class="pf-lista">${nao.map((x) => `<li>${esc(x.nome)}</li>`).join('')}</ul>` : ''}` : '<p class="muted" style="margin:6px 0 0">Todo mundo já respondeu. 🙌</p>'}`, true, true);
}

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

// Oferendas que faltam, só de quem já respondeu (quem não respondeu está no bloco Respostas).
function cardOferendas(todos) {
  const resp = todos.filter((x) => respondeu(x.perfil));
  const orixas = resp.map((x) => {
    const falta = POSICOES_ORIXA.filter(([k]) => !x.perfil.orixas[k].oferenda)
      .map(([k]) => (x.perfil.orixas[k].nome ? `${x.perfil.orixas[k].nome} (${ROT_ORIXA[k]})` : `${ROT_ORIXA[k]}: não informado`));
    return { nome: x.nome, falta };
  }).filter((x) => x.falta.length);
  const grupos = [['Orixás', orixas]];
  const total = new Set(grupos.flatMap(([, l]) => l.map((x) => x.nome))).size;
  return card('corrente-oferendas', 'Oferendas pendentes', total, false, () => (resp.length ? `
    ${grupos.map(([t, l]) => `<div class="pf-grupo"><div class="pf-gt">${t} <span class="count">${l.length}</span></div>
      ${l.length ? `<ul class="pf-lista">${l.map((x) => `<li><b>${esc(x.nome)}</b> <span class="muted">— ${x.falta.map(esc).join(', ')}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin:2px 0 0">Ninguém pendente.</p>'}
    </div>`).join('')}
    <p class="muted" style="margin:8px 0 0;font-size:.82rem">Só de quem já respondeu o perfil.</p>` : '<p class="muted" style="margin:0">Ninguém respondeu ainda.</p>'), true, true);
}

export function render() {
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const { eu, todos } = estado.perfil;
  let h = '';
  // Funções de admin juntas no topo, dentro da moldura dourada "ADMIN".
  if (admin()) {
    // Respostas e oferendas pendentes contam só quem cadastra orixás e guias (a curimba fica fora).
    const comOrixas = todos.filter((x) => cadastraEspiritual(x.funcao));
    h += `<div class="pf-adm-area" role="group" aria-label="Só para admin"><span class="pf-adm-rot">ADMIN</span>
      ${cardAjustes(todos)}${cardInfoAdmin(todos)}${cardRespostas(comOrixas)}${cardOferendas(comOrixas)}</div>`;
  }
  if (eu) h += meusCards(eu);
  else if (!admin()) h += `<div class="card"><p class="muted" style="margin:0">Seu usuário não está ligado a uma pessoa da corrente, então não tem perfil próprio.</p></div>`;
  h += cardGuiasCorrente(estado.perfil.guias || []);
  return `<section class="panel pf-tela">${h}</section>`;
}

export const cliques = {
  async pftirafoto(el) {
    if (!confirm('Remover a foto?')) return;
    if (await salvarFoto(el.dataset.id, null)) toast('Foto removida.');
  },
  pfdobra(el) {
    const k = el.dataset.k;
    U().abertos[k] = el.getAttribute('aria-expanded') !== 'true';
    avisar();
  },
  pffaltam() { U().faltam = !U().faltam; avisar(); },
  limparentrada(el) { atualizarPessoa(el.dataset.id, { entrada: null }); },
  snabrir(el) {
    estado.senhaEdit = { tipo: el.dataset.tipo, id: el.dataset.id };
    avisar();
    document.getElementById('sn-in')?.focus();
  },
  snfechar() { estado.senhaEdit = null; avisar(); },
};

// Ajustes: o admin salva as informações da pessoa escolhida.
export async function enviarInfo(form) {
  const f = form.elements;
  const nasc = f.nascimento.value.trim();
  const iso = nasc ? lerNascimento(nasc) : '';
  if (nasc && !iso) { toast('Data de nascimento inválida. Use dia/mês/ano, por exemplo 31/10/1990.'); return; }
  const tel = (campo, rot) => {
    const d = soNumeros(f[campo].value);
    if (d && d.length < 10) { toast(`${rot} incompleto: coloque o DDD e o número.`); return null; }
    return d;
  };
  const celular = tel('celular', 'Celular');
  if (celular === null) return;
  const contatoTelefone = tel('contatoTelefone', 'Telefone para contato');
  if (contatoTelefone === null) return;
  const limpo = (v) => v.replace(/\s+/g, ' ').trim();
  const info = { nome: limpo(f.nome.value), nascimento: iso, celular, contatoNome: limpo(f.contatoNome.value), contatoTelefone };
  if (await salvarInfoDe(form.dataset.id, info)) toast('Informações salvas.');
}

// Enquanto digita: guarda e salva sozinho (sem esperar sair do campo), se o valor já estiver completo.
export function digitando(el) {
  const k = el.dataset.k;
  let v = el.value.replace(/\s+/g, ' ').trim();
  if (el.dataset.act === 'pfnome') {
    mudarPerfil((P) => { if (v) P.outros[k] = v; else delete P.outros[k]; }, { silencioso: true });
    return;
  }
  if (k === 'nascimento' && v) { v = lerNascimento(v); if (!v) return; }
  if ((k === 'celular' || k === 'contatoTelefone') && v) { v = soNumeros(v); if (v.length < 10) return; }
  mudarPerfil((P) => { P.info = { ...(P.info || {}), [k]: v }; }, { silencioso: true });
}

export const mudancas = {
  // Foto: a escolhida no aparelho vira um quadrado pequeno e já é salva.
  async pffoto(t) {
    const arq = t.files && t.files[0];
    t.value = '';
    if (!arq) return;
    let b64;
    try { b64 = await reduzirFoto(arq); } catch { toast('Não consegui abrir essa imagem.'); return; }
    if (await salvarFoto(t.dataset.id, b64)) toast('Foto salva.');
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
  infopessoa(t) { estado.infoPessoa = t.value; avisar(); },
  ajpessoa(t) { estado.ajUi.pessoa = t.value; estado.senhaEdit = null; avisar(); },
  ajcampo(t) { estado.ajUi.campo = t.value; estado.senhaEdit = null; avisar(); },
  entrada(t) { atualizarPessoa(t.dataset.id, { entrada: t.value || null }); },
  pfsel(el) {
    const { g, k } = el.dataset;
    const campo = g === 'orixas' ? 'nome' : 'linha';
    mudarPerfil((P) => { P[g][k] = { [campo]: el.value, oferenda: el.value ? P[g][k].oferenda : false }; });
  },
  pfof(el) {
    const { g, k } = el.dataset;
    mudarPerfil((P) => { P[g][k].oferenda = el.checked; });
  },
  pfinfo(el) {
    const k = el.dataset.k;
    let v = el.value.replace(/\s+/g, ' ').trim();
    if (k === 'nascimento' && v) {
      v = lerNascimento(v);
      if (!v) { toast('Data de nascimento inválida. Use dia/mês/ano, por exemplo 31/10/1990.'); return; }
    }
    if ((k === 'celular' || k === 'contatoTelefone') && v) {
      v = soNumeros(v);
      if (v.length < 10) { toast('Telefone incompleto: coloque o DDD e o número.'); return; }
    }
    // Sem redesenhar a tela: no celular, redesenhar ao sair do campo tirava o foco do próximo
    // campo tocado (o que se digitava nele se perdia).
    mudarPerfil((P) => { P.info = { ...(P.info || {}), [k]: v }; }, { silencioso: true });
  },
  pfnome(el) {
    const v = el.value.replace(/\s+/g, ' ').trim();
    mudarPerfil((P) => { if (v) P.outros[el.dataset.k] = v; else delete P.outros[el.dataset.k]; }, { silencioso: true });
  },
};
