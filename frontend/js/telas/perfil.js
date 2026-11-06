// Tela "Perfil": cada pessoa registra as suas informações, os seus orixás, guias e outros guias.
// O admin também acompanha a corrente: quem já respondeu, os guias de todos e as oferendas pendentes.

import { ORIXAS, LINHAS_CADASTRO, LINHA_KEYS } from '/shared/regras.js';
import { POSICOES_ORIXA, POSICOES_GUIA, GUIAS, NOME_GUIA_MAX, respondeu, lerNascimento, nascimentoBR, telefoneBR, soNumeros, blocosAfinidade, cadastraEspiritual,
  ANAMNESE_TIPOS, ANAMNESE_PERGUNTA_MAX, ANAMNESE_TEXTO_MAX, ANAMNESE_SIMNAO, ANAMNESE_TIPO_LABEL, anamnesePreenchida, respostasPorPessoa, textoAnamnese, valorAnamnese } from '/shared/perfil.js';
import { estado, pode, avisar, carregarPerfil, mudarPerfil, salvarAfinidade, carregarFoto, salvarFoto, carregarAnamnese, acaoAnamnese } from '../estado.js';
import { esc, toast, iniciais, baixar, hoje } from '../util.js';

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

// ---------- Admin root: Ajustes perfil ----------
// Exibe informações espirituais e gerencia data de entrada e senhas por pessoa.
export function renderAjustesPerfil(todos) {
  const A = (estado.ajUi ||= { pessoa: '', campo: '' });
  const root = pode('usuarios:gerenciar');
  if (!root) return '';
  const x = todos.find((t) => t.pessoaId === A.pessoa);
  // Curimba: sem orixás e guias.
  const CAMPOS = [...(!x || cadastraEspiritual(x.funcao) ? [['espiritual', 'Orixás e guias']] : []),
    ['entrada', 'Entrada na corrente'], ['senha', 'Senha']];
  if (!CAMPOS.some(([k]) => k === A.campo)) A.campo = '';
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
// Informações de contato da corrente: consulta rápida para ligação.
function infoContato(x) {
  const F = estado.fotosPessoa;
  if (F[x.pessoaId] === undefined) carregarFoto(x.pessoaId);
  const url = F[x.pessoaId];
  const nomeContato = x.contatoNome || '';
  const numeroContato = soNumeros(x.contatoTelefone || '');
  const telefone = telefoneBR(x.contatoTelefone);
  return `<div class="aj-contato">
    <div class="pf-foto-img">${url ? `<img src="${url}" alt="Foto de ${esc(x.nome)}">` : `<span aria-hidden="true">${esc(iniciais(x.nome))}</span>`}</div>
    <div class="aj-contato-dados">
      <h3>${esc(x.nome)}</h3>
      <div><span class="muted">Nome para contato</span><strong>${esc(nomeContato || 'Não informado')}</strong></div>
      <div><span class="muted">Telefone para contato</span>${numeroContato ? `<a href="tel:${numeroContato}">${esc(telefone)}</a>` : '<strong>Não informado</strong>'}</div>
    </div>
  </div>`;
}

// Qualquer pessoa da corrente pode consultar os dados de contato dos demais.
function cardInfoCorrente(contatos) {
  const sel = estado.infoPessoa || '';
  const x = contatos.find((t) => t.pessoaId === sel);
  const busca = normalizarBusca(estado.pfUi.infoBusca || '');
  const pessoas = contatos.filter((t) => t.pessoaId === sel || normalizarBusca(t.nome).includes(busca));
  return card('info-corrente', '<span aria-hidden="true">👤</span> Informações da corrente', '', false, () => `<div class="pf-info-escolha">
      <label class="field">Pessoa<select id="info-pessoa" data-act="infopessoa" aria-label="De quem são as informações">
        <option value="">— escolha a pessoa —</option>
        ${pessoas.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === sel ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
      <button class="btn pf-info-busca-bt" type="button" data-act="infobusca" aria-label="Buscar pessoa" title="Buscar pessoa">🔍</button>
    </div>
    <label class="pf-info-busca" id="info-busca" ${estado.pfUi.infoBuscaVisivel ? '' : 'hidden'}><span aria-hidden="true">🔍</span><input type="search" id="info-pessoa-busca" placeholder="Buscar pelo nome" aria-label="Buscar pessoa" value="${esc(estado.pfUi.infoBusca || '')}"></label>
    ${x ? infoContato(x) : '<p class="muted" style="margin:0;font-size:.88rem">Pesquise e escolha uma pessoa para ver os dados de contato.</p>'}`, false, false);
}

function normalizarBusca(texto) {
  return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
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
  if (A?.visivel === false && !admin()) return '';
  if (!A || A.erro) return card('anamnese', 'Anamnese', '', false, () => `<p class="muted" style="margin:0">${A?.erro ? esc(A.erro) : 'Carregando…'}</p>`, true);
  const ok = anamnesePreenchida(A.perguntas, A.minhas);
  const ed = !!U().anaEdit;
  const vals = ed ? U().anaRasc || {} : A.minhas || {};
  return card('anamnese', 'Anamnese', A.perguntas.length ? selo(ok ? true : 'apreencher') : '', false, () => (!A.perguntas.length
    ? '<p class="muted" style="margin:0">Nenhuma pergunta cadastrada ainda.</p>'
    : `<p class="ana-instr">Ficha para apoio em emergências. Contém dados pessoais e de saúde: só você e administradores do Perfil podem consultar as respostas. Preencha as perguntas obrigatórias (<b>*</b>); campos opcionais ou iniciados por “Se sim” podem ficar em branco quando não se aplicarem.</p>
      <div class="ana-lista">${A.perguntas.map((q, i) => campoAnamnese(q, i, vals[q.id] || '', ed)).join('')}</div>
      <div class="row ana-bts">${ed ? '<button class="btn primary" data-act="anasalvar">Salvar</button><button class="btn" data-act="anacancelar">Cancelar</button>'
        : '<button class="btn" data-act="anaeditar">Editar</button>'}</div>`), true);
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
function cardAnamneseAdmin(todos) {
  const A = estado.anamnese;
  if (!A || A.erro) return '';
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
  return card('anamnese-adm', `<span aria-hidden="true">🩺</span> Anamnese <span class="pf-cab-pct">${pct}%</span>`, `${responderam.length} de ${todos.length}`, false, () => `
    <label class="of-sw ana-vis-toggle"><input type="checkbox" role="switch" data-act="anavisibilidade" ${A.visivel !== false ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span>Exibir bloco para usuários</label>
    <div class="pf-of-totais pf-resp-totais" aria-label="Status das respostas da anamnese">
      <button class="pf-of-total pf-resp-total fn-respondeu${grupoAberto === 'responderam' ? ' selecionado' : ''}" type="button" data-act="pfanamnese" data-grupo="responderam" aria-expanded="${grupoAberto === 'responderam'}" aria-label="Responderam à anamnese: ${responderam.length} pessoas"${responderam.length ? '' : ' disabled'}><b>${responderam.length}</b><span>Responderam</span></button>
      <button class="pf-of-total pf-resp-total fn-faltam${grupoAberto === 'faltam' ? ' selecionado' : ''}" type="button" data-act="pfanamnese" data-grupo="faltam" aria-expanded="${grupoAberto === 'faltam'}" aria-label="Faltam responder à anamnese: ${faltam.length} pessoas"${faltam.length ? '' : ' disabled'}><b>${faltam.length}</b><span>Faltam</span></button>
    </div>
    ${listaAberta ? `<div class="pf-grupo"><div class="pf-gt">${tituloLista}<span class="count">${listaAberta.length}</span></div><ul class="pf-lista">${listaAberta.map((p) => `<li>${esc(p.nome)}</li>`).join('')}</ul></div>` : ''}
    <div class="ana-adm-h"><b>Perguntas</b> <span class="muted">(${A.perguntas.length})</span>
      ${u.anaNova || u.anaEditPergunta ? '' : '<button class="btn small" data-act="ananova"><span aria-hidden="true">＋</span> Adicionar pergunta</button>'}</div>
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
    <label class="field">Ver as respostas de<select data-act="anapessoa" aria-label="De quem são as respostas">
      <option value="">— escolha a pessoa —</option>
      ${todos.map((t) => `<option value="${t.pessoaId}" ${t.pessoaId === u.anaPessoa ? 'selected' : ''}>${esc(t.nome)}${anamnesePreenchida(A.perguntas, R[t.pessoaId]) ? ' ✓' : ''}</option>`).join('')}</select></label>
    ${x ? `<div class="ana-ver">${A.perguntas.map((q, i) => { const v = val(q, (R[x.pessoaId] || {})[q.id]); return `<div><span class="ana-q">${i + 1}. ${esc(q.texto)}</span><span class="${v ? 'ana-r' : 'muted'}">${esc(v || 'sem resposta')}</span></div>`; }).join('')}</div>` : ''}
    <p class="ana-instr">O arquivo contém informações pessoais e de saúde. Compartilhe apenas com pessoas autorizadas.</p>
    <button class="btn" data-act="anacompartilhar"><span aria-hidden="true">📄</span> Compartilhar todas as respostas (arquivo)</button>`, true, true);
}

// ---------- admin: a corrente ----------
function cardRespostas(todos) {
  const sim = todos.filter((x) => respondeu(x.perfil));
  const nao = todos.filter((x) => !respondeu(x.perfil));
  const pct = todos.length ? Math.round((sim.length / todos.length) * 100) : 0;
  const grupoAberto = U().respostaGrupo;
  const listaAberta = grupoAberto === 'responderam' ? sim : grupoAberto === 'faltam' ? nao : null;
  const tituloLista = grupoAberto === 'responderam' ? 'Responderam' : 'Ainda não responderam';
  return card('respostas', `<span aria-hidden="true">📝</span> Respostas <span class="pf-cab-pct">${pct}%</span>`, `${sim.length} de ${todos.length}`, true, () => `
    <div class="pf-of-totais pf-resp-totais" aria-label="Status das respostas">
      <button class="pf-of-total pf-resp-total fn-respondeu${grupoAberto === 'responderam' ? ' selecionado' : ''}" type="button" data-act="pfrespostas" data-grupo="responderam" aria-expanded="${grupoAberto === 'responderam'}" aria-label="Responderam: ${sim.length} pessoas"${sim.length ? '' : ' disabled'}><b>${sim.length}</b><span>Responderam</span></button>
      <button class="pf-of-total pf-resp-total fn-faltam${grupoAberto === 'faltam' ? ' selecionado' : ''}" type="button" data-act="pfrespostas" data-grupo="faltam" aria-expanded="${grupoAberto === 'faltam'}" aria-label="Ainda não responderam: ${nao.length} pessoas"${nao.length ? '' : ' disabled'}><b>${nao.length}</b><span>Faltam</span></button>
    </div>
    ${listaAberta ? `<div class="pf-grupo"><div class="pf-gt">${tituloLista}<span class="count">${listaAberta.length}</span></div><ul class="pf-lista">${listaAberta.map((x) => `<li>${esc(x.nome)}</li>`).join('')}</ul></div>` : ''}`, true, true);
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

export function render() {
  if (estado.perfil === null) { carregarPerfil(); return `<div class="loading">Carregando perfil…</div>`; }
  if (estado.perfil.erro) return `<div class="card"><h2>Perfil</h2><p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p></div>`;
  const { eu, todos } = estado.perfil;
  if (estado.anamnese === null) { estado.anamnese = undefined; carregarAnamnese(); }
  let h = cardInfoCorrente(estado.perfil.contatos || []);
  // Funções de admin juntas no topo, dentro da moldura dourada "ADMIN".
  if (admin()) {
    // Respostas e oferendas pendentes contam só quem cadastra orixás e guias (a curimba fica fora).
    const comOrixas = todos.filter((x) => cadastraEspiritual(x.funcao));
    h += `<div class="pf-adm-area" role="group" aria-label="Só para admin"><span class="pf-adm-rot">ADMIN</span>
      ${cardOferendas(comOrixas)}${cardRespostas(comOrixas)}${cardAnamneseAdmin(todos)}</div>`;
  }
  if (eu) h += meusCards(eu) + cardAnamnese();
  else if (!admin()) h += `<div class="card"><p class="muted" style="margin:0">Seu usuário não está ligado a uma pessoa da corrente, então não tem perfil próprio.</p></div>`;
  h += cardGuiasCorrente(estado.perfil.guias || []);
  return `<section class="panel pf-tela">${h}${janelaAnamnese()}</section>`;
}

export const cliques = {
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
  async pftirafoto(el) {
    if (!confirm('Remover a foto?')) return;
    if (await salvarFoto(el.dataset.id, null)) toast('Foto removida.');
  },
  pfdobra(el) {
    const k = el.dataset.k;
    if (k === 'respostas') {
      U().abertos[k] = true;
      U().respostaGrupo = null;
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
  pfrespostas(el) {
    U().respostaGrupo = U().respostaGrupo === el.dataset.grupo ? null : el.dataset.grupo;
    avisar();
  },
  pfanamnese(el) {
    U().anamneseGrupo = U().anamneseGrupo === el.dataset.grupo ? null : el.dataset.grupo;
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
  infopessoa(t) {
    estado.infoPessoa = t.value;
    U().infoBusca = '';
    U().infoBuscaVisivel = false;
    avisar();
  },
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
