// Aba "Admin root" (só o admin root): Acessos e perfis (um bloco só, por perfil), Quem entrou nas abas, Versão do app e, do Histórico,
// Cadastrar gira antiga e Cadastrar escala e as Regras da casa. Os eventos da casa saíram daqui: o root cadastra no ＋ Evento
// do card 📅 Eventos da aba Geral.

import { SEM_CADASTRO, ABAS, ABAS_CONSULENTE, ABAS_ALUNO, PERFIS_SISTEMA, PIN_NOVO, PIN_NOVO_MSG, normalizarAbas } from '/shared/permissoes.js';
import { estado, pessoasOrd, carregarAlunos, carregarUsuarios, carregarVisitas, carregarPerfil, criarUsuario, atualizarUsuario, excluirUsuario, atualizarPessoa, acaoUsuarios, salvarApelidosEntidade, salvarConfigCasa, salvarRegrasCasa, avisar } from '../estado.js';
import { esc, toast, hoje } from '../util.js';
import { ICONE_WHATS } from './giraComum.js';
import { ABAS_VISITA, VISITAS_DIAS, agruparVisitas, textoVisitas } from '/shared/visitas.js';
import { emDemo } from '../auth.js';
import { api } from '../api.js';
import { renderAjustesPerfil, formSenha } from './perfil.js';
import { corpoBackup, cliquesBackup } from './historico.js';
import { LINHA_LABEL } from '/shared/regras.js';
import { CAMPOS_CONFIG, config, SEGUNDO_CAMBONE, LIMITES_REGRAS } from '/shared/config.js';
import { cardAdmin as cardEbook } from './ebook.js';

const secao = (titulo) => `<h3 class="root-secao">${titulo}</h3>`;
const paraBusca = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');


// Perfis que podem ser dados a um usuário com e-mail (Corrente e Consulentes são de quem entra pelo próprio cadastro).
const SEM_EMAIL = ['corrente', 'consulente', 'aluno'];
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
  // Consulentes e Alunos entram pelo próprio cadastro (não são da corrente): só o Ver, e só das abas que funcionam
  // para eles; as outras aparecem travadas, para a lista ser a mesma em todo perfil.
  const fora = f.chave === 'consulente' || f.chave === 'aluno';
  const livres = f.chave === 'consulente' ? ABAS_CONSULENTE : f.chave === 'aluno' ? ABAS_ALUNO : null;
  const texto = f.chave === 'consulente'
    ? 'Marque as abas que os consulentes podem <b>ver</b> (a Geral, com os eventos, sempre aparece). Eles nunca editam; as abas em cinza dependem de ser da corrente.'
    : f.chave === 'aluno'
      ? 'Marque as abas que os alunos podem <b>ver</b> (a Geral, o próprio Perfil e o próprio cadastro sempre aparecem). Eles nunca editam; as abas em cinza dependem de ser da corrente.'
      : 'Marque, em cada aba, se o perfil pode <b>Ver</b> e/ou <b>Editar</b>. Vale na hora para todos desse perfil (eles veem a mudança ao abrir o app de novo).';
  const linha = (x) => {
    const sempre = f.chave === 'aluno' && x.k === 'alunos';
    const travada = fora && !sempre && !livres.includes(x.k);
    const ver = sempre ? '<label class="pa-ck"><input type="checkbox" checked disabled aria-label="Sempre"></label>'
      : travada ? '<label class="pa-ck"><input type="checkbox" disabled aria-label="Não disponível"></label>'
        : `<label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(f.chave)}" data-k="${x.k}" data-t="ver" ${a[x.k].ver ? 'checked' : ''} aria-label="${esc(f.nome)}: ver ${x.nome}"></label>`;
    const editar = fora ? '<span></span>'
      : `<label class="pa-ck"><input type="checkbox" data-act="pfaba" data-chave="${esc(f.chave)}" data-k="${x.k}" data-t="editar" ${a[x.k].editar ? 'checked' : ''} aria-label="${esc(f.nome)}: editar ${x.nome}"></label>`;
    const nota = sempre ? 'Sempre: cada aluno vê o próprio cadastro.' : travada ? 'Não funciona para quem não é da corrente.' : `Ver: ${x.ver}${fora ? '' : `<br>Editar: ${x.editar}`}`;
    return `<div class="pa-tr${travada ? ' travada' : ''}" role="row"><span class="pa-aba"><b>${x.nome}</b><small class="muted">${nota}</small></span>${ver}${editar}</div>`;
  };
  let h = `<div class="pf-config">
    <p class="muted" style="margin:0;font-size:.85rem">${texto}</p>
    ${SEM_EMAIL.includes(f.chave) ? '' : `<form id="f-perfilnome" class="row" data-chave="${esc(f.chave)}" autocomplete="off" style="gap:6px;align-items:flex-end">
      <label class="field grow">Nome do perfil<input type="text" id="pf-nomecfg" maxlength="40" value="${esc(f.nome)}"></label>
      <button class="btn small" type="submit">Renomear</button></form>`}
    <div class="pa-tab" role="table" aria-label="Acessos do perfil ${esc(f.nome)}">
      <div class="pa-th" role="row"><span>Aba</span><span>Ver</span><span>${fora ? '' : 'Editar'}</span></div>
      ${ABAS.map(linha).join('')}
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
  let h = `<section class="panel">${cardAcessos()}${cardVisitas()}
    ${secao('Configurações da casa')}${cardConfig()}${cardRegras()}${cardEntidades()}${cardEbook(abertosRoot.has('ebook'), cabRoot('ebook', '📕 E-book', estado.ebookAdmin?.popup ? 'popup ligado' : ''))}
    ${secao('Pessoas e histórico')}${cardAjustesPerfil()}${cardBackup()}</section>`;
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

// Uma pessoa com acesso: nome (do cadastro), e-mail, troca de perfil, Nova senha e Excluir.
function linhaUsuario(u) {
  const eu = u.id === estado.me.id;
  const conf = estado.confirm === 'u:' + u.id;
  const nome = nomeDe(u);
  const faltaCadastro = !u.pessoaId && !semCadastro(u.papel);
  // Sem e-mail: entra pelo login da corrente, então precisa sempre de uma pessoa e não tem senha própria.
  const pelaCorrente = !u.email;
  const semNome = semCadastro(u.papel) && !pelaCorrente;
  let nomeHtml;
  if (estado.renomearUsuario === u.id) {
    nomeHtml = estado.renomearModo === 'nome'
      ? `<form id="f-uren" class="ren" data-id="${u.id}" data-modo="nome"><input type="text" id="uren-in" value="${esc(u.nome)}" maxlength="80" autocomplete="off" aria-label="Nome de ${esc(nome)}">
          <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelauren">Cancelar</button></form>`
      : `<form id="f-uren" class="ren" data-id="${u.id}" data-modo="pessoa"><select id="uren-in" aria-label="Pessoa da corrente de ${esc(nome)}">${semNome ? '' : '<option value="">— escolha a pessoa —</option>'}
          ${semNome ? `<option value="" ${u.pessoaId ? '' : 'selected'}>(sem cadastro: usar só o nome)</option>` : ''}
          ${pessoasLivres(u.pessoaId).map((p) => `<option value="${p.id}" ${p.id === u.pessoaId ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
          <button class="btn small primary" type="submit">Salvar</button><button class="btn small" type="button" data-act="cancelauren">Cancelar</button></form>`;
  } else {
    const botoes = [
      ...(!u.pessoaId && semNome ? [['nome', '✎ editar nome']] : []),
      ['pessoa', u.pessoaId ? '✎ trocar pessoa' : semNome ? '✎ ligar à pessoa (opcional)' : '✎ ligar à pessoa'],
    ].map(([m, t]) => `<button class="btn link small" data-act="uren" data-id="${u.id}" data-modo="${m}">${t}</button>`).join(' ');
    nomeHtml = `<div class="nm">${esc(nome)}${eu ? ' <span class="muted" style="font-weight:400">(você)</span>' : ''} ${botoes}</div>
      ${faltaCadastro ? '<span class="badge lic">sem cadastro na corrente: ligue a uma pessoa</span>' : ''}`;
  }
  return `<div class="us"><div style="min-width:0">${nomeHtml}<div class="em">${pelaCorrente ? 'entra pelo login da corrente' : esc(u.email)}</div></div>
    <select data-act="papel" data-id="${u.id}" aria-label="Perfil de ${esc(nome)}" title="Mudar de perfil" ${eu ? 'disabled title="Você não pode mudar o seu próprio perfil"' : ''}>${opcoesPapel(u.papel)}</select>
    <div class="acts" style="display:contents">${pelaCorrente ? '<span></span>' : `<button class="btn small" data-act="snabrir" data-tipo="email" data-id="${u.id}">Nova senha</button>`}
    ${eu ? '<span></span>' : conf ? `<button class="btn small danger" data-act="deluser" data-id="${u.id}">Confirmar</button>` : `<button class="btn small" data-act="askdel" data-k="u:${u.id}">Excluir</button>`}</div>
    ${estado.senhaEdit?.tipo === 'email' && estado.senhaEdit.id === u.id ? formSenha('email', u.id, nome) : ''}</div>`;
}

// ＋ Adicionar pessoa num perfil: o perfil já vem escolhido; só quem já está em Perfil → Pessoas. A pessoa entra como
// sempre (e-mail, celular ou CPF e a senha de números) e já abre com o perfil.
function formNovoUsuario(chave) {
  const livres = pessoasLivres();
  return `<form id="f-user" class="pf-novo" autocomplete="off">
    <input type="hidden" id="u-papel" value="${esc(chave)}">
    <label class="field">Pessoa da corrente<select id="u-pessoa" required><option value="">— escolha a pessoa —</option>${livres.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
    <p class="muted" style="margin:0;font-size:.82rem">Só quem já está em Perfil → Pessoas (quem não está, cadastre lá antes). A pessoa continua entrando como sempre, com e-mail, celular ou CPF e a senha dela, e já abre com este perfil.</p>
    <div class="row" style="gap:6px"><button class="btn primary small" type="submit" ${livres.length ? '' : 'disabled'}>Dar acesso</button><button class="btn small" type="button" data-act="pfnovocancelar">Cancelar</button></div>
  </form>`;
}

// Um perfil: as pessoas, o ＋ e o ⚙️. O Corrente não tem lista (é quem entra pela corrente), só o que ele pode fazer.
// Nomes da corrente e dos alunos (por turma), só para consulta: entram e saem pelo cadastro.
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const listaNomes = (l) => `<div class="pf-nomes" data-rolar="8">${l.map((x) => `<span>${esc(x.nome)}</span>`).join('')}</div>`;
function nomesCorrente() {
  const L = [...(estado.pessoas || [])].sort(porNome);
  return L.length ? listaNomes(L) : '<p class="muted" style="margin:0">Ninguém na corrente.</p>';
}
function nomesAlunos() {
  const A = estado.alunos;
  if (A === null) { estado.alunos = undefined; carregarAlunos(); }
  if (!A) return '<p class="muted" style="margin:0">Carregando os alunos…</p>';
  const turmas = [...A.turmas].sort(porNome);
  const ids = new Set(turmas.map((t) => t.id));
  const grupos = [...turmas.map((t) => [t.nome, A.alunos.filter((a) => a.turmaId === t.id)]), ['Sem turma', A.alunos.filter((a) => !ids.has(a.turmaId))]]
    .filter(([, l]) => l.length);
  return grupos.length ? grupos.map(([t, l]) => `<p class="pf-nomes-t">${esc(t)} <span class="muted">· ${l.length}</span></p>${listaNomes([...l].sort(porNome))}`).join('')
    : '<p class="muted" style="margin:0">Nenhum aluno cadastrado.</p>';
}

function grupoPerfil(f, usuarios, buscando) {
  const k = 'pf:' + f.chave;
  const aberto = buscando || abertosRoot.has(k);
  const corrente = SEM_EMAIL.includes(f.chave);
  const nCorrente = (estado.pessoas || []).length;
  const nAlunos = estado.alunos?.alunos?.length;
  const contagem = f.chave === 'corrente' ? `${nCorrente} pessoa${nCorrente === 1 ? '' : 's'}`
    : f.chave === 'aluno' ? (nAlunos === undefined ? 'todos os alunos' : `${nAlunos} aluno${nAlunos === 1 ? '' : 's'}`)
      : f.chave === 'consulente' ? 'cadastros pelo login' : `${usuarios.length} pessoa${usuarios.length === 1 ? '' : 's'}`;
  let h = `<div class="pf-grupo${aberto ? ' aberto' : ''}"><button class="grp-h dobra" data-act="dobrarroot" data-k="${k}" aria-expanded="${aberto}">
    <h2>${esc(f.nome)}</h2><span class="count">${contagem} <span class="seta" aria-hidden="true">${aberto ? '▾' : '▸'}</span></span></button>`;
  if (!aberto) return h + '</div>';
  if (corrente) {
    h += f.chave === 'corrente'
      ? `<p class="muted" style="margin:0;font-size:.85rem">Toda a corrente (Perfil → Pessoas): entra com e-mail, celular ou CPF e a senha de números. Quem tem outro perfil abre com ele.</p>${nomesCorrente()}`
      : f.chave === 'aluno'
        ? `<p class="muted" style="margin:0;font-size:.85rem">Todos os alunos das turmas (Perfil → Pessoas → Alunos): entram com e-mail, celular ou CPF e a senha. Consulentes e o grupo Oferenda têm acesso próprio.</p>${nomesAlunos()}`
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
  const achou = (u) => !termo || paraBusca(nomeDe(u) + ' ' + (u.email || '')).includes(termo);
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
      <label class="field">Máximo de pessoas no Suporte<select name="suporteMaximo"><option value="0" ${!r.suporteMaximo ? 'selected' : ''}>Sem limite</option>${numeros(1, LIMITES_REGRAS.suporteMaximo[1], r.suporteMaximo)}</select>
        <small class="muted">Passando disso, quem sobra vira 2º cambone de qualquer médium. O Suporte só passa do máximo com todo médium já com dois.</small></label>
      <label class="field">Quem recebe o 2º cambone primeiro<select name="segundoCambone">${SEGUNDO_CAMBONE.map(([k, t]) => `<option value="${k}" ${k === r.segundoCambone ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <small class="muted">Só quando sobra cambone depois de todo médium ter o seu. Nunca mais de dois por médium.</small></label>
      <label class="field">Turmas da limpeza<select name="turmasLimpeza">${numeros(tMin, tMax, r.turmasLimpeza)}</select>
        <small class="muted">O rodízio vai da turma 1 até esta. Para diminuir, tire antes as pessoas das turmas que vão sair.</small></label>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">Salvar regras</button></div>
    </form>`}</div>`;
}

export async function salvarRegras(form) {
  const regras = {
    suporteMinimo: Number(form.elements.suporteMinimo.value),
    suporteMaximo: Number(form.elements.suporteMaximo.value),
    segundoCambone: form.elements.segundoCambone.value,
    turmasLimpeza: Number(form.elements.turmasLimpeza.value),
  };
  if (regras.suporteMaximo && regras.suporteMaximo < regras.suporteMinimo) { toast('O máximo no Suporte não pode ser menor que o mínimo.'); return; }
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

export const cliques = {
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
  const pessoaId = val('u-pessoa');
  if (!pessoaId) { toast('Escolha a pessoa da corrente.'); return; }
  const nome = estado.pessoas.find((p) => p.id === pessoaId)?.nome || '';
  try {
    await criarUsuario({ papel, pessoaId });
    estado.novoUsuarioPerfil = null;
    toast(`${nome} agora tem este perfil. A pessoa entra como sempre, pelo login da corrente.`);
    avisar();
  } catch (e) { toast(e.message); avisar(); }
}
