// Aba "Admin root" (só o admin root): Acessos e perfis (um bloco só, por perfil), Quem entrou nas abas, Versão do app e, do Histórico,
// Cadastrar gira antiga e Cadastrar escala, as Regras da casa e os eventos da casa (cadastrar e eventos cadastrados).

import { SEM_CADASTRO, ABAS, ABAS_CONSULENTE, PERFIS_SISTEMA, PIN_NOVO, PIN_NOVO_MSG, normalizarAbas } from '/shared/permissoes.js';
import { estado, pessoasOrd, carregarUsuarios, carregarVisitas, carregarPerfil, criarUsuario, atualizarUsuario, excluirUsuario, atualizarPessoa, adicionarPessoas, acaoUsuarios, salvarApelidosEntidade, salvarConfigCasa, salvarRegrasCasa, avisar } from '../estado.js';
import { esc, toast, ajustarRolagem, hoje } from '../util.js';
import { ICONE_WHATS } from './giraComum.js';
import { ABAS_VISITA, VISITAS_DIAS, agruparVisitas, textoVisitas } from '/shared/visitas.js';
import { emDemo } from '../auth.js';
import { api } from '../api.js';
import { renderAjustesPerfil, formSenha } from './perfil.js';
import { blocosEventos, blocoTipos, cliques as cliquesEventos } from './eventos.js';
import { cardGiraAntiga, cliquesGiraAntiga, mudancasGiraAntiga, corpoBackup, cliquesBackup } from './historico.js';
import { cardEscala, cliquesEscala, mudancasEscala } from '../cadastrarEscala.js';
import { contaNaPresenca, LINHA_LABEL, FUNCOES, CURIMBA } from '/shared/regras.js';
import { CAMPOS_CONFIG, config, SEGUNDO_CAMBONE, LIMITES_REGRAS } from '/shared/config.js';

const PESSOA_NOVA = '__nova';
const secao = (titulo) => `<h3 class="root-secao">${titulo}</h3>`;
const paraBusca = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');


// Perfis que podem ser dados a um usuário com e-mail (Corrente e Consulentes são de quem entra pelo próprio cadastro).
const SEM_EMAIL = ['corrente', 'consulente'];
const papeis = () => (estado.perfisCfg || []).filter((f) => !SEM_EMAIL.includes(f.chave));
const opcoesPapel = (atual) => papeis().map((f) => `<option value="${esc(f.chave)}" ${f.chave === atual ? 'selected' : ''}>${esc(f.nome)}</option>`).join('');

// Todos os blocos da aba começam minimizados; tocar no título expande e recolhe (enquanto o app estiver aberto).
const abertosRoot = new Set();
const cabRoot = (k, titulo, count = '', ab = abertosRoot.has(k)) => `<button class="grp-h dobra" data-act="dobrarroot" data-k="${k}" aria-expanded="${ab}"><h2>${titulo}</h2><span class="count">${count} <span class="seta" aria-hidden="true">${ab ? '▾' : '▸'}</span></span></button>`;

// ---------- acessos: um bloco só, por perfil ----------
// Cada perfil é um grupo que minimiza, com as pessoas que têm acesso por e-mail nele, o ＋ para dar acesso a mais
// alguém já nesse perfil e, em ⚙️, o que o perfil pode ver e editar em cada aba (Renomear e Excluir perfil também).

// O que o perfil pode fazer: Ver/Editar por aba (vale na hora para todos do perfil), Renomear e Excluir.
function configPerfil(f) {
  if (f.chave === 'root') return '<p class="leitura" style="margin:0">O Admin root pode tudo, inclusive a aba Admin root, e não precisa estar no cadastro da corrente.</p>';
  const a = normalizarAbas(f.abas);
  const consulente = f.chave === 'consulente';
  const abas = consulente ? ABAS.filter((x) => ABAS_CONSULENTE.includes(x.k)) : ABAS;
  let h = `<div class="pf-config">
    <p class="muted" style="margin:0;font-size:.85rem">${consulente
      ? 'Marque as abas que os consulentes podem <b>ver</b> (a Geral, com os eventos, sempre aparece). Só aparecem aqui as abas que funcionam para quem não é da corrente; eles nunca editam.'
      : 'Marque, em cada aba, se o perfil pode <b>Ver</b> e/ou <b>Editar</b>. Vale na hora para todos desse perfil (eles veem a mudança ao abrir o app de novo).'}</p>
    ${SEM_EMAIL.includes(f.chave) ? '' : `<form id="f-perfilnome" class="row" data-chave="${esc(f.chave)}" autocomplete="off" style="gap:6px;align-items:flex-end">
      <label class="field grow">Nome do perfil<input type="text" id="pf-nomecfg" maxlength="40" value="${esc(f.nome)}"></label>
      <button class="btn small" type="submit">Renomear</button></form>`}
    <div class="pa-tab" role="table" aria-label="Acessos do perfil ${esc(f.nome)}">
      <div class="pa-th" role="row"><span>Aba</span><span>Ver</span><span>${consulente ? '' : 'Editar'}</span></div>
      ${abas.map((x) => `<div class="pa-tr" role="row">
        <span class="pa-aba"><b>${x.nome}</b><small class="muted">Ver: ${x.ver}${consulente ? '' : `<br>Editar: ${x.editar}`}</small></span>
        <label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(f.chave)}" data-k="${x.k}" data-t="ver" ${a[x.k].ver ? 'checked' : ''} aria-label="${esc(f.nome)}: ver ${x.nome}"></label>
        ${consulente ? '<span></span>' : `<label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(f.chave)}" data-k="${x.k}" data-t="editar" ${a[x.k].editar ? 'checked' : ''} aria-label="${esc(f.nome)}: editar ${x.nome}"></label>`}
      </div>`).join('')}
    </div>`;
  if (!PERFIS_SISTEMA.includes(f.chave)) {
    const conf = estado.confirm === 'pf:' + f.chave;
    h += `<div class="row" style="justify-content:flex-end">${conf ? `<button class="btn small danger" data-act="delperfil" data-chave="${esc(f.chave)}">Confirmar exclusão</button>` : `<button class="btn small" data-act="askdel" data-k="pf:${esc(f.chave)}">Excluir perfil</button>`}</div>`;
  }
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

export function render() {
  if (estado.usuarios === null) { carregarUsuarios(); return `<div class="loading">Carregando usuários…</div>`; }
  if (abertosRoot.has('ajperfil') && estado.perfil === null) { estado.perfil = undefined; carregarPerfil(); }
  let h = `<section class="panel">${cardAcessos()}${cardVisitas()}${cardVersoes()}
    ${secao('Configurações da casa')}${cardConfig()}${cardRegras()}${cardEntidades()}${cardEventos()}
    ${secao('Pessoas e histórico')}${cardAjustesPerfil()}${cardRegistros()}${cardBackup()}</section>`;
  return h;
}

// ---------- quem entrou nas abas ----------
// Últimos 3 dias, uma aba por vez (começa em Compras), agrupado pelo grupo do cadastro; o WhatsApp manda a lista.
let abaVisitas = 'guias';
function quandoVisita(iso) {
  const d = new Date(iso);
  const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  const ehOntem = dia === `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
  return `${dia === hoje() ? 'hoje' : ehOntem ? 'ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}
function cardVisitas() {
  const ab = abertosRoot.has('visitas');
  let h = `<div class="card adm root">${cabRoot('visitas', '<span aria-hidden="true">👀</span> Quem entrou nas abas', `últimos ${VISITAS_DIAS} dias`, ab)}`;
  if (!ab) return h + '</div>';
  if (estado.visitas === null) { estado.visitas = undefined; carregarVisitas(); }
  if (!Array.isArray(estado.visitas)) return h + '<div class="loading">Carregando…</div></div>';
  const pessoasNa = (k) => new Set(estado.visitas.filter((v) => v.aba === k).map((v) => v.chave)).size;
  const grupos = agruparVisitas(estado.visitas, abaVisitas);
  const total = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  const txt = textoVisitas(grupos, abaVisitas, quandoVisita);
  h += `<div class="vis-topo"><label class="field grow">Aba<select data-act="visaba">${ABAS_VISITA.map(([k, t]) => `<option value="${k}" ${k === abaVisitas ? 'selected' : ''}>${t} (${pessoasNa(k)})</option>`).join('')}</select></label>
    ${total ? `<a class="btn wa-bt vis-wa" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span> Exportar</a>` : ''}
    <button class="btn vis-atual" data-act="visatualizar" title="Atualizar a lista" aria-label="Atualizar a lista">↻</button></div>`;
  if (!total) return h + `<p class="muted" style="margin:0">Ninguém entrou nesta aba nos últimos ${VISITAS_DIAS} dias.</p></div>`;
  h += grupos.map((g) => `<div class="vis-grupo"><div class="grp-h"><h3>${esc(g.grupo)}</h3><span class="count">${g.pessoas.length}</span></div>
    ${g.pessoas.map((p) => `<div class="vis-linha"><span class="nm">${esc(p.nome)}</span><span class="muted">${quandoVisita(p.ultima)}${p.vezes > 1 ? ` · ${p.vezes}×` : ''}</span></div>`).join('')}</div>`).join('');
  return h + `<p class="muted" style="margin:0;font-size:.8rem">Hora da última entrada · × = quantas vezes abriu nos ${VISITAS_DIAS} dias. O root não entra na lista.</p></div>`;
}

// ---------- versão do app ----------
// A última versão com que cada pessoa abriu (ou voltou ao) app nos últimos 30 dias. A referência é a exigida ou, sem
// ela, a deste aparelho. Forçar atualização exige a versão deste aparelho: quem estiver em outra troca na hora, no
// próximo pedido ao servidor (quem está com o app fechado atualiza ao abrir, como sempre).
const versaoCurta = (v) => String(v || '').slice(0, 6);
async function lerVersoes() {
  try { estado.versoes = await api('GET', '/usuarios?lista=versoes'); } catch (e) { toast(e.message); estado.versoes = { exigida: '', pessoas: [] }; }
  avisar();
}
async function exigirVersao(versao) {
  try {
    estado.versoes = await api('POST', '/usuarios', { acao: 'versaoExigir', versao });
    toast(versao ? `Versão ${versaoCurta(versao)} exigida: quem estiver em outra atualiza no próximo uso.` : 'Parou de exigir a versão.');
  } catch (e) { toast(e.message); }
  avisar();
}
function cardVersoes() {
  const ab = abertosRoot.has('versoes');
  const minha = window.__smVersao || '';
  const V = estado.versoes;
  const ref = V?.exigida || minha;
  const outras = (V?.pessoas || []).filter((p) => ref && p.versao !== ref);
  let h = `<div class="card adm root">${cabRoot('versoes', '<span aria-hidden="true">📲</span> Versão do app', V ? (outras.length ? `${outras.length} em outra versão` : 'todos em dia') : '', ab)}`;
  if (!ab) return h + '</div>';
  if (V === null) { estado.versoes = undefined; lerVersoes(); }
  if (!V) return h + '<div class="loading">Carregando…</div></div>';
  const linha = (p) => `<div class="vis-linha"><span class="nm">${esc(p.nome || '(sem nome)')}</span><span class="muted">versão ${esc(versaoCurta(p.versao))} · ${quandoVisita(p.vistoEm)}</span></div>`;
  const naRef = V.pessoas.filter((p) => !ref || p.versao === ref);
  const forcar = !minha ? '<p class="muted" style="margin:0">Este aparelho não informa a versão (sem o app instalado pelo navegador). Use outro aparelho para exigir a versão.</p>'
    : estado.confirm === 'verex'
      ? `<div class="infobox"><span><b>Exigir a versão ${esc(versaoCurta(minha))}?</b> Quem estiver em outra versão atualiza na hora, no próximo uso do app.</span>
        <span class="row"><button class="btn small primary" data-act="verexigir">Exigir ${esc(versaoCurta(minha))}</button><button class="btn small" data-act="vervoltar">Voltar</button></span></div>`
      : `<span class="row"><button class="btn small primary" data-act="askdel" data-k="verex" ${V.exigida === minha ? 'disabled' : ''}>Forçar atualização para ${esc(versaoCurta(minha))}</button>
          ${V.exigida ? '<button class="btn small" data-act="verparar">Parar de exigir</button>' : ''}<button class="btn vis-atual" data-act="veratualizar" title="Atualizar a lista" aria-label="Atualizar a lista">↻</button></span>`;
  h += `<p style="margin:0">Este aparelho: <b>${minha ? `versão ${esc(versaoCurta(minha))}` : 'versão desconhecida'}</b> · Exigida: <b>${V.exigida ? `versão ${esc(versaoCurta(V.exigida))}` : 'nenhuma'}</b></p>
    <p class="muted" style="margin:0;font-size:.85rem">Antes de forçar, toque em <b>Atualizar app</b> no rodapé, para este aparelho estar na versão mais nova.</p>
    ${forcar}
    <div class="vis-grupo"><div class="grp-h"><h3>Em outra versão</h3><span class="count">${outras.length}</span></div>
      ${outras.length ? outras.map(linha).join('') : '<p class="muted" style="margin:0">Ninguém.</p>'}</div>
    <div class="vis-grupo"><div class="grp-h"><h3>Na versão ${esc(versaoCurta(ref))}</h3><span class="count">${naRef.length}</span></div>
      ${naRef.map(linha).join('')}</div>
    <p class="muted" style="margin:0;font-size:.8rem">A última versão com que cada pessoa abriu ou voltou ao app nos últimos 30 dias.</p>`;
  return h + '</div>';
}

// Uma pessoa com acesso: nome (do cadastro), e-mail, troca de perfil, Nova senha e Excluir.
function linhaUsuario(u) {
  const eu = u.id === estado.me.id;
  const conf = estado.confirm === 'u:' + u.id;
  const nome = nomeDe(u);
  const faltaCadastro = !u.pessoaId && !semCadastro(u.papel);
  let nomeHtml;
  if (estado.renomearUsuario === u.id) {
    nomeHtml = estado.renomearModo === 'nome'
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
  return `<div class="us"><div style="min-width:0">${nomeHtml}<div class="em">${esc(u.email)}</div></div>
    <select data-act="papel" data-id="${u.id}" aria-label="Perfil de ${esc(nome)}" title="Mudar de perfil" ${eu ? 'disabled title="Você não pode mudar o seu próprio perfil"' : ''}>${opcoesPapel(u.papel)}</select>
    <div class="acts" style="display:contents"><button class="btn small" data-act="snabrir" data-tipo="email" data-id="${u.id}">Nova senha</button>
    ${eu ? '<span></span>' : conf ? `<button class="btn small danger" data-act="deluser" data-id="${u.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="u:${u.id}">Excluir</button>`}</div>
    ${estado.senhaEdit?.tipo === 'email' && estado.senhaEdit.id === u.id ? formSenha('email', u.id, nome) : ''}</div>`;
}

// ＋ Adicionar pessoa num perfil: o perfil já vem escolhido. No Admin root a pessoa é opcional (vale o nome digitado).
function formNovoUsuario(chave) {
  const root = semCadastro(chave);
  return `<form id="f-user" class="pf-novo" autocomplete="off">
    <input type="hidden" id="u-papel" value="${esc(chave)}">
    <label class="field">${root ? 'Pessoa da corrente (opcional)' : 'Pessoa da corrente'}<select id="u-pessoa" data-act="pessoanova"><option value="">— escolha a pessoa —</option><option value="${PESSOA_NOVA}">＋ Cadastrar pessoa nova</option>${pessoasLivres().map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
    <label class="field" id="u-nova-nome" hidden>Nome da pessoa<input type="text" id="u-nova-n" maxlength="80"></label>
    <label class="field" id="u-nova-funcao" hidden>Função<select id="u-nova-f">${FUNCOES.map((f) => `<option value="${f.k}">${f.label}</option>`).join('')}<option value="${CURIMBA}">Curimba</option></select></label>
    ${root ? '<label class="field" id="u-nome-campo">Nome (sem pessoa da corrente)<input type="text" id="u-nome" maxlength="80"></label>' : ''}
    <label class="field">E-mail<input type="email" id="u-email" required autocomplete="off"></label>
    <label class="field">Senha inicial<input type="password" id="u-senha" required minlength="8" autocomplete="new-password"></label>
    <p class="muted" style="margin:0;font-size:.82rem">O nome vem do cadastro em Perfil → Pessoas (quem não está lá pode ser cadastrado aqui mesmo). Passe o e-mail e a senha inicial para a pessoa; ela pode trocar a senha depois.</p>
    <div class="row" style="gap:6px"><button class="btn primary small" type="submit">Dar acesso</button><button class="btn small" type="button" data-act="pfnovocancelar">Cancelar</button></div>
  </form>`;
}

// Um perfil: as pessoas, o ＋ e o ⚙️. O Corrente não tem lista (é quem entra pela corrente), só o que ele pode fazer.
function grupoPerfil(f, usuarios, buscando) {
  const k = 'pf:' + f.chave;
  const aberto = buscando || abertosRoot.has(k);
  const corrente = SEM_EMAIL.includes(f.chave);
  const contagem = f.chave === 'corrente' ? 'toda a corrente' : f.chave === 'consulente' ? 'cadastros pelo login' : `${usuarios.length} pessoa${usuarios.length === 1 ? '' : 's'}`;
  let h = `<div class="pf-grupo${aberto ? ' aberto' : ''}"><button class="grp-h dobra" data-act="dobrarroot" data-k="${k}" aria-expanded="${aberto}">
    <h2>${esc(f.nome)}</h2><span class="count">${contagem} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  if (corrente) {
    h += f.chave === 'corrente'
      ? '<p class="muted" style="margin:0;font-size:.85rem">O acesso da corrente: quem está em Perfil → Pessoas entra com e-mail, celular ou CPF e a senha de números.</p>'
      : '<p class="muted" style="margin:0;font-size:.85rem">Quem se cadastrou pelo login e foi posto em Consulentes (Perfil → Pessoas → Cadastros pelo login). Entra com e-mail, celular ou CPF e a senha.</p>';
  } else {
    h += usuarios.length ? `<div class="pf-pessoas">${usuarios.map(linhaUsuario).join('')}</div>` : '<p class="muted" style="margin:0;font-size:.88rem">Ninguém neste perfil.</p>';
    if (!buscando) {
      h += estado.novoUsuarioPerfil === f.chave ? formNovoUsuario(f.chave)
        : `<button class="btn small pf-mais" data-act="pfnovo" data-chave="${esc(f.chave)}">＋ Adicionar pessoa</button>`;
    }
  }
  if (!buscando) {
    const cfg = estado.perfilCfgAberto === f.chave;
    h += `<button class="btn link small pf-cfg-bt" data-act="pfcfg" data-chave="${esc(f.chave)}" aria-expanded="${cfg}"><span aria-hidden="true">⚙️</span> O que este perfil pode fazer <span aria-hidden="true">${cfg ? '▾' : '▸'}</span></button>`;
    if (cfg) h += configPerfil(f);
  }
  return h + '</div>';
}

function cardAcessos() {
  const lista = estado.perfisCfg || [];
  const semLigacao = estado.usuarios.filter((u) => !u.pessoaId && !semCadastro(u.papel)).length;
  let h = `<div class="card adm root acessos">${cabRoot('acessos', '<span aria-hidden="true">👥</span> Acessos e perfis', `${estado.usuarios.length}${semLigacao ? ` <span class="badge lic">${semLigacao} sem cadastro</span>` : ''}`)}`;
  if (!abertosRoot.has('acessos')) return h + '</div>';
  const termo = paraBusca(estado.usBusca).trim();
  const achou = (u) => !termo || paraBusca(nomeDe(u) + ' ' + u.email).includes(termo);
  h += `<p class="muted" style="margin:0;font-size:.85rem">Toque no perfil para ver quem tem acesso e dar acesso a mais alguém. Em <b>⚙️</b>, o que o perfil pode ver e editar.</p>
    <div class="acessos-topo"><input type="text" id="us-busca" value="${esc(estado.usBusca || '')}" placeholder="Buscar pessoa por nome ou e-mail" aria-label="Buscar pessoa com acesso" autocomplete="off">
      <button class="btn small" data-act="novoperfil">＋ Novo perfil</button></div>`;
  if (estado.novoPerfil) {
    h += `<form id="f-perfilnovo" class="pf-novo" autocomplete="off">
      <label class="field">Nome do novo perfil<input type="text" id="pn-nome" maxlength="40" required placeholder="Ex.: Admin giras"></label>
      <label class="field">Copiar acessos de<select id="pn-base"><option value="">— nenhum —</option>${lista.filter((f) => f.chave !== 'root').map((f) => `<option value="${esc(f.chave)}">${esc(f.nome)}</option>`).join('')}</select></label>
      <div class="row" style="gap:6px"><button class="btn small primary" type="submit">Criar</button><button class="btn small" type="button" data-act="cancelanovoperfil">Cancelar</button></div></form>`;
  }
  // Buscando: só os perfis com alguém achado, já abertos.
  const grupos = lista.map((f) => [f, estado.usuarios.filter((u) => u.papel === f.chave && achou(u))])
    .filter(([f, us]) => !termo || (us.length && !SEM_EMAIL.includes(f.chave)));
  if (termo && !grupos.length) h += '<p class="muted" style="margin:0">Ninguém encontrado.</p>';
  return h + `<div class="pf-grupos">${grupos.map(([f, us]) => grupoPerfil(f, us, !!termo)).join('')}</div></div>`;
}

// Nomes e textos da casa que antes ficavam fixos no app (shared/config.js).
function cardConfig() {
  const c = config();
  return `<div class="card adm root">${cabRoot('config', '🏠 Nomes e textos')}${!abertosRoot.has('config') ? '' : `
    <p class="muted" style="margin:0;font-size:.85rem">Campo em branco volta ao texto padrão.</p>
    <form id="f-config" class="cfg-form" autocomplete="off">
      ${CAMPOS_CONFIG.map(([k, rotulo, max, dica]) => `<label class="field">${rotulo}<input type="text" name="${k}" maxlength="${max}" value="${esc(c[k])}">${dica ? `<small class="muted">${dica}</small>` : ''}</label>`).join('')}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">Salvar</button></div>
    </form>`}</div>`;
}

export async function salvarConfig(form) {
  const dados = Object.fromEntries(CAMPOS_CONFIG.map(([k]) => [k, form.elements[k].value]));
  if (await salvarConfigCasa(dados)) toast('Configurações salvas.');
}

// Regras da casa: o jeito deste terreiro conduzir a escala e a limpeza (o sorteio e o Remanejar faltas seguem estas regras).
function cardRegras() {
  const r = config().regras;
  const [sMin, sMax] = LIMITES_REGRAS.suporteMinimo;
  const [tMin, tMax] = LIMITES_REGRAS.turmasLimpeza;
  const numeros = (min, max, atual) => Array.from({ length: max - min + 1 }, (_, i) => min + i)
    .map((n) => `<option value="${n}" ${n === atual ? 'selected' : ''}>${n}</option>`).join('');
  return `<div class="card adm root">${cabRoot('regras', '⚖️ Regras da casa')}${!abertosRoot.has('regras') ? '' : `
    <p class="muted" style="margin:0;font-size:.85rem">Valem no próximo sorteio ou Remanejar faltas. A escala já sorteada não muda.</p>
    <form id="f-regras" class="cfg-form" autocomplete="off">
      <label class="field">Mínimo de pessoas no Suporte<select name="suporteMinimo">${numeros(sMin, sMax, r.suporteMinimo)}</select>
        <small class="muted">Faltando gente no Suporte, cambones que sobram vão para lá antes do 2º cambone. Com 0, ninguém vai obrigado.</small></label>
      <label class="field">Quem recebe o 2º cambone<select name="segundoCambone">${SEGUNDO_CAMBONE.map(([k, t]) => `<option value="${k}" ${k === r.segundoCambone ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <small class="muted">Só quando sobra cambone depois de todo médium ter o seu. Nunca mais de dois por médium.</small></label>
      <label class="field">Turmas da limpeza<select name="turmasLimpeza">${numeros(tMin, tMax, r.turmasLimpeza)}</select>
        <small class="muted">O rodízio vai da turma 1 até esta. Para diminuir, tire antes as pessoas das turmas que vão sair.</small></label>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">Salvar regras</button></div>
    </form>`}</div>`;
}

export async function salvarRegras(form) {
  const regras = {
    suporteMinimo: Number(form.elements.suporteMinimo.value),
    segundoCambone: form.elements.segundoCambone.value,
    turmasLimpeza: Number(form.elements.turmasLimpeza.value),
  };
  const maior = Math.max(0, ...estado.pessoas.map((p) => Number(p.limpeza) || 0));
  if (regras.turmasLimpeza < maior) { toast(`Há gente na turma ${maior} da limpeza. Mude a turma dessas pessoas antes de diminuir.`); return; }
  if (await salvarRegrasCasa(regras)) toast('Regras salvas.');
}

function cardBackup() {
  return `<div class="card adm root">${cabRoot('backup', '💾 Backup')}${abertosRoot.has('backup') ? corpoBackup() : ''}</div>`;
}

function cardAjustesPerfil() {
  const aberto = abertosRoot.has('ajperfil');
  let corpo = '';
  if (aberto) {
    if (estado.perfil === undefined) corpo = '<div class="loading">Carregando dados do perfil…</div>';
    else if (estado.perfil?.erro) corpo = `<p class="muted" style="margin:0">${esc(estado.perfil.erro)}</p>`;
    else corpo = renderAjustesPerfil(estado.perfil?.todos || []);
  }
  return `<div class="card adm root">${cabRoot('ajperfil', '⚙️ Ajustes perfil')}${corpo}</div>`;
}

function cardEntidades() {
  const aberto = abertosRoot.has('entidades');
  const aliases = estado.entidadesApelidos || [];
  const ed = estado.entidadeApelidoEdit;
  const opcoes = Object.entries(LINHA_LABEL).map(([k, nome]) => `<option value="${esc(k)}" ${k === ed?.linha ? 'selected' : ''}>${esc(nome)}</option>`).join('');
  return `<div class="card adm root">${cabRoot('entidades', '🏷️ Entidades das giras', aliases.length)}${!aberto ? '' : `
    <p class="muted" style="margin:0;font-size:.88rem">Inclua nomes alternativos para uma linha existente. Eles aparecem nos cadastros de giras, mantendo as regras e afinidades da linha escolhida.</p>
    <form id="f-entidade-alias" class="row" data-index="${ed ? ed.index : ''}" autocomplete="off">
      <label class="field grow">Nome da entidade<input type="text" id="ea-nome" maxlength="80" required value="${esc(ed?.nome || '')}" placeholder="Ex.: nome usado pela casa"></label>
      <label class="field grow">Linha correspondente<select id="ea-linha" required><option value="">— escolha a linha —</option>${opcoes}</select></label>
      <span class="row"><button class="btn small primary" type="submit">${ed ? 'Salvar alteração' : '＋ Incluir nome'}</button>${ed ? '<button class="btn small" type="button" data-act="cancelaralias">Cancelar</button>' : ''}</span>
    </form>
    ${aliases.length ? `<div class="al-grupos">${aliases.map((x, i) => `<div class="sn-l">
      <span class="sn-nome"><b>${esc(x.nome)}</b><span class="muted"> · ${esc(LINHA_LABEL[x.linha] || x.linha)}</span></span>
      <span class="sn-bts">${estado.confirm === 'entalias:' + i
        ? `<button class="btn small danger" data-act="removeralias" data-index="${i}">Confirmar remoção</button><button class="btn small" data-act="cancelaralias">Cancelar</button>`
        : `<button class="btn small" data-act="editaralias" data-index="${i}">Editar</button><button class="btn small" data-act="askalias" data-index="${i}">Remover</button>`}</span>
    </div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum nome alternativo cadastrado.</p>'}
  `}</div>`;
}

// Eventos da casa (só o root cadastra, edita e exclui): Cadastrar evento e Eventos cadastrados.
// A corrente continua vendo os eventos da semana no card 📅 Eventos da aba Gira.
function cardEventos() {
  setTimeout(ajustarRolagem, 0);
  const ab = abertosRoot.has('eventos');
  return `<div class="card adm root ev-grupo">${cabRoot('eventos', '<span aria-hidden="true">🗓️</span> Eventos', (estado.eventos || []).length)}${ab ? blocosEventos(true) + blocoTipos() : ''}</div>`;
}

// Do Histórico: cadastrar gira antiga (já encerrada, só para o histórico) e cadastrar a escala de uma gira salva.
function cardRegistros() {
  // Com um cadastro em andamento, fica aberto.
  const ab = abertosRoot.has('registros') || !!estado.giraAntiga || !!estado.escalaTxt;
  let h = `<div class="card adm root">${cabRoot('registros', '<span aria-hidden="true">🗂️</span> Giras antigas e escalas', '', ab)}`;
  if (!ab) return h + '</div>';
  if (!estado.giraAntiga && !estado.escalaTxt) {
    h += '<div class="row"><button class="btn small" data-act="gaabrir">＋ Cadastrar gira antiga</button><button class="btn small" data-act="esabrir">＋ Cadastrar escala</button></div>';
  }
  if (estado.giraAntiga) h += cardGiraAntiga(pessoasOrd().filter(contaNaPresenca));
  if (estado.escalaTxt) h += cardEscala();
  return h + '</div>';
}

export const cliques = {
  veratualizar() { estado.versoes = null; avisar(); },
  vervoltar() { avisar(); },
  async verexigir() { await exigirVersao(window.__smVersao || ''); },
  async verparar() { await exigirVersao(''); },
  ...cliquesEventos,
  ...cliquesGiraAntiga,
  ...cliquesEscala,
  ...cliquesBackup,
  deluser(el) { estado.confirm = null; excluirUsuario(el.dataset.id); },
  uren(el) {
    estado.renomearUsuario = el.dataset.id;
    estado.renomearModo = el.dataset.modo || 'pessoa';
    avisar();
    const inp = document.getElementById('uren-in');
    if (inp) { inp.focus(); if (inp.tagName === 'INPUT') inp.select(); }
  },
  cancelauren() { estado.renomearUsuario = null; avisar(); },
  visatualizar() { estado.visitas = null; avisar(); },
  dobrarroot(el) { if (emDemo() && el.dataset.k !== 'visitas') { toast('Modo demonstração: os blocos do Admin root não abrem.'); return; } const k = el.dataset.k; if (abertosRoot.has(k)) abertosRoot.delete(k); else abertosRoot.add(k); avisar(); },
  editaralias(el) {
    const index = Number(el.dataset.index);
    const alias = estado.entidadesApelidos?.[index];
    if (!alias) return;
    estado.entidadeApelidoEdit = { ...alias, index };
    estado.confirm = null;
    avisar();
    document.getElementById('ea-nome')?.focus();
  },
  askalias(el) { estado.confirm = 'entalias:' + el.dataset.index; avisar(); },
  async removeralias(el) {
    const index = Number(el.dataset.index);
    const aliases = (estado.entidadesApelidos || []).filter((_, i) => i !== index);
    if (await salvarApelidosEntidade(aliases)) { estado.confirm = null; estado.entidadeApelidoEdit = null; toast('Nome alternativo removido.'); }
  },
  cancelaralias() { estado.confirm = null; estado.entidadeApelidoEdit = null; avisar(); },
  limparentrada(el) { atualizarPessoa(el.dataset.id, { entrada: null }); },
  snabrir(el) {
    estado.senhaEdit = { tipo: el.dataset.tipo, id: el.dataset.id };
    avisar();
    document.getElementById('sn-in')?.focus();
  },
  snfechar() { estado.senhaEdit = null; avisar(); },
  // Limpar a senha da corrente: a pessoa cria outra ao entrar (e-mail, celular ou CPF, confirmando o celular ou o e-mail do cadastro).
  async snlimpar(el) {
    if (!confirm(`Limpar a senha de ${el.dataset.nome}? A pessoa vai criar uma nova ao entrar.`)) return;
    if (await acaoUsuarios('pin', { pessoaId: el.dataset.id, limpar: true })) { estado.senhaEdit = null; toast('Senha limpa.'); avisar(); }
  },
  // Ajustes perfil → Sem senha: abre/fecha a lista; o nome leva para a Senha da pessoa.
  ajsemdobrar() { estado.ajUi.semAberto = !estado.ajUi.semAberto; avisar(); },
  ajsemsenha(el) { Object.assign(estado.ajUi, { pessoa: el.dataset.id, campo: 'senha' }); estado.senhaEdit = null; avisar(); },
  novoperfil() { estado.novoPerfil = true; avisar(); document.getElementById('pn-nome')?.focus(); },
  // ＋ Adicionar pessoa (um formulário aberto por vez) e ⚙️ O que este perfil pode fazer (um por vez).
  pfnovo(el) { estado.novoUsuarioPerfil = el.dataset.chave; avisar(); document.getElementById('u-pessoa')?.focus(); },
  pfnovocancelar() { estado.novoUsuarioPerfil = null; avisar(); },
  pfcfg(el) { estado.perfilCfgAberto = estado.perfilCfgAberto === el.dataset.chave ? null : el.dataset.chave; estado.confirm = null; avisar(); },
  cancelanovoperfil() { estado.novoPerfil = false; avisar(); },
  async delperfil(el) {
    estado.confirm = null;
    if (await acaoUsuarios('excluirPerfil', { chave: el.dataset.chave })) { estado.perfilCfgAberto = null; toast('Perfil excluído.'); }
  },
};

// Cria um perfil novo (sem nenhuma aba marcada) e já deixa selecionado.
export async function criarPerfil() {
  const nome = document.getElementById('pn-nome').value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome do perfil.'); return; }
  const antes = new Set((estado.perfisCfg || []).map((f) => f.chave));
  const base = (estado.perfisCfg || []).find((f) => f.chave === document.getElementById('pn-base').value);
  if (await acaoUsuarios('perfil', { nome, abas: base?.abas || {} })) {
    estado.novoPerfil = false;
    // O perfil novo já abre, com o ⚙️ aberto para marcar as abas.
    const chave = (estado.perfisCfg.find((f) => !antes.has(f.chave)) || {}).chave;
    if (chave) { abertosRoot.add('pf:' + chave); estado.perfilCfgAberto = chave; }
    toast(base ? `Perfil ${nome} criado com os acessos de ${base.nome}.` : `Perfil ${nome} criado. Marque as abas que ele pode ver e editar.`);
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
    if (!PIN_NOVO.test(v)) { toast(PIN_NOVO_MSG); return; }
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
  visaba(t) { abaVisitas = t.value; avisar(); },
  ...mudancasGiraAntiga,
  ...mudancasEscala,
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
  papel(t) { atualizarUsuario(t.dataset.id, { papel: t.value }); },
  ajpessoa(t) { estado.ajUi.pessoa = t.value; estado.senhaEdit = null; avisar(); },
  ajcampo(t) { estado.ajUi.campo = t.value; estado.senhaEdit = null; avisar(); },
  entrada(t) { atualizarPessoa(t.dataset.id, { entrada: t.value || null }); },
  pessoanova(t) {
    const nova = t.value === PESSOA_NOVA;
    document.getElementById('u-nova-nome').hidden = !nova;
    document.getElementById('u-nova-funcao').hidden = !nova;
    if (nova) document.getElementById('u-nova-n').focus();
  },
};

export async function salvarApelidoEntidade(form) {
  const nome = document.getElementById('ea-nome').value.replace(/\s+/g, ' ').trim();
  const linha = document.getElementById('ea-linha').value;
  if (!nome || !linha) { toast('Informe o nome e a linha correspondente.'); return; }
  const index = form.dataset.index === '' ? -1 : Number(form.dataset.index);
  const aliases = [...(estado.entidadesApelidos || [])];
  const item = { nome, linha };
  if (index >= 0 && aliases[index]) aliases[index] = item;
  else aliases.push(item);
  if (await salvarApelidosEntidade(aliases)) {
    estado.entidadeApelidoEdit = null;
    estado.confirm = null;
    toast(index >= 0 ? 'Nome alternativo atualizado.' : 'Nome alternativo incluído.');
    avisar();
  }
}

export async function enviarFormulario() {
  const val = (id) => document.getElementById(id).value;
  const papel = val('u-papel');
  const root = semCadastro(papel);
  let pessoaId = val('u-pessoa');
  const nova = pessoaId === PESSOA_NOVA;
  if (!root && !pessoaId) { toast('Escolha a pessoa da corrente.'); return; }
  const nomeNovo = nova ? val('u-nova-n').replace(/\s+/g, ' ').trim() : '';
  if (nova && (!nomeNovo || /[,;]/.test(nomeNovo))) { toast('Digite o nome da pessoa nova (um nome só, sem vírgula).'); return; }
  const funcaoNova = val('u-nova-f');
  const email = val('u-email').trim();
  const senha = val('u-senha');
  const nome = nova ? nomeNovo : pessoaId ? estado.pessoas.find((p) => p.id === pessoaId)?.nome : val('u-nome').trim();
  if (!nome) { toast('Digite o nome ou escolha a pessoa da corrente.'); return; }
  if (nova) {
    // Cadastrar redesenha a tela: e-mail e senha já foram lidos acima.
    try {
      if (!(await adicionarPessoas(nomeNovo, funcaoNova))) { toast('Essa pessoa já está cadastrada: escolha o nome na lista.'); return; }
    } catch (e) { toast(e.message); avisar(); return; }
    pessoaId = pessoasOrd().find((p) => p.nome.toLowerCase() === nomeNovo.toLowerCase())?.id;
  }
  try {
    await criarUsuario({ email, senha, papel, ...(pessoaId ? { pessoaId } : { nome }) });
    estado.novoUsuarioPerfil = null;
    toast(`${nome} agora tem acesso.`);
    avisar();
  } catch (e) { toast(nova ? `${nome} foi cadastrada em Perfil → Pessoas, mas o usuário não foi criado: ${e.message}` : e.message); avisar(); }
}
