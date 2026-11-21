// Tela Pessoas: alunos da CPJ (dados, turmas, UP CPJ, ex-alunos) e os cadastros pelo login. pessoas.js
// reexporta os salvamentos que o main.js chama pela tela (salvarAluno, salvarDadosCadastro, salvarTurma, salvarAlunosTurma).

import { estado, pode, carregarAlunos, acaoAlunos, avisar } from '../estado.js';
import { esc, toast, dDM } from '../util.js';
import { ICONE_WHATS } from './giraComum.js';
import { cabDobra, dBR } from './pessoas.js';

// ---------- dados do aluno: nome completo, CPF, celular e e-mail (quem edita Alunos) ----------
const soDig = (v) => String(v ?? '').replace(/\D/g, '');
const telBR = (n) => {
  const d = soDig(n);
  if (d.length < 10) return d;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};
// CPF à mostra (Mostrar, por 30 s): { id, cpf }.
const cpfBR = (d) => (d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
// Se o servidor recusou (CPF ou e-mail inválido), o redesenho volta com o que foi digitado (estado.alunoRasc).
export function camposAluno(pre, d0 = {}, id = '') {
  const r = estado.alunoRasc?.pre === pre ? estado.alunoRasc : null;
  const d = r ? { ...d0, nomeCompleto: r.nc, celular: r.cel, email: r.em } : d0;
  const tem = !!(id && d.temCpf);
  const visto = estado.alunoCpfVisto?.id === id ? cpfBR(estado.alunoCpfVisto.cpf) : '';
  const remover = id && estado.alunoCpfRemover === id;
  const cpfAtual = tem ? `<span class="al-cpf-atual">${remover ? '<s>' : ''}${esc(visto || d.cpf)}${remover ? '</s> · será removido' : ''}
      ${remover ? `<button type="button" class="btn link small" data-act="alcpfmanter" data-id="${id}">Manter</button>`
        : `<button type="button" class="btn link small" data-act="alcpfver" data-id="${id}">${visto ? 'Ocultar' : '👁 Mostrar'}</button><button type="button" class="btn link small" data-act="alcpfremover" data-id="${id}">Remover</button>`}</span>` : '';
  return `<div class="al-dados">
    <label class="field al-full">Nome completo<input type="text" id="${pre}-nc" maxlength="80" value="${esc(d.nomeCompleto || '')}" autocomplete="off"></label>
    <label class="field">CPF<input type="text" id="${pre}-cpf" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="${tem ? 'Novo CPF' : '000.000.000-00'}" value="${esc(r?.cpf || '')}"${remover ? ' disabled' : ''}>${cpfAtual}</label>
    <label class="field">Celular<input type="tel" id="${pre}-cel" inputmode="tel" maxlength="16" placeholder="(11) 99999-9999" value="${esc(telBR(d.celular || ''))}" autocomplete="off"></label>
    <label class="field al-full">E-mail<input type="email" id="${pre}-em" maxlength="120" value="${esc(d.email || '')}" autocomplete="off" placeholder="nome@exemplo.com"></label>
  </div>`;
}
// O que mudou nos campos (para criar, tudo o que foi preenchido). CPF: digitado grava; Remover apaga.
function lerCamposAluno(pre, d = {}, id = '') {
  const v = (s) => document.getElementById(`${pre}-${s}`)?.value ?? '';
  const out = {};
  const nc = v('nc').replace(/\s+/g, ' ').trim();
  if (nc !== (d.nomeCompleto || '')) out.nomeCompleto = nc;
  const cel = soDig(v('cel'));
  if (cel !== (d.celular || '')) out.celular = cel;
  const em = v('em').trim().toLowerCase();
  if (em !== (d.email || '')) out.email = em;
  if (id && estado.alunoCpfRemover === id) out.cpf = '';
  else if (soDig(v('cpf'))) out.cpf = v('cpf');
  estado.alunoRasc = { pre, nc: v('nc'), cel: soDig(v('cel')), em: v('em'), cpf: v('cpf') };
  return out;
}

// ---------- alunos da CPJ: um sub-bloco por turma ----------
// Lista da turma para o WhatsApp: título em negrito, total e um aluno por linha, numerados.
function textoTurma(g) {
  const n = g.lista.length;
  return `*🎓 Alunos · ${g.nome}*\n${n} aluno${n === 1 ? '' : 's'}\n\n${g.lista.map((a, i) => `${i + 1}. ${a.nome}`).join('\n')}`;
}

// Escolhendo quem promover (UP CPJ) nesta turma?
const promovendo = (g) => estado.alunosPromover?.turma === g.id;

// Turma aberta (quem edita Alunos): Adicionar alunos, UP CPJ, Editar turma e Remover turma numa linha; em Editar, o nome da turma.
// UP CPJ abre a escolha: uma caixinha em cada aluno e, aqui, Cancelar / Confirmar.
function acoesTurma(g, editar, podePromover) {
  if (!editar || !g.id) return '';
  const real = g.id !== 'sem';   // "Sem turma" não se edita nem recebe alunos novos
  if (promovendo(g)) {
    const { ids, enviando } = estado.alunosPromover;
    return `<div class="al-promover-bar"><p class="nota">Marque quem vai para a <b>Corrente CPJ</b> como Cambone. A senha, o CPF e os dados do cadastro continuam os mesmos.</p>
      <div class="pp-bts"><button class="btn small pp-bt" type="button" data-act="cancelarPromover"${enviando ? ' disabled' : ''}>Cancelar</button><button class="btn small primary pp-bt" type="button" data-act="confirmarPromover"${ids.length && !enviando ? '' : ' disabled'}>${enviando ? 'Promovendo…' : `Confirmar${ids.length ? ` (${ids.length})` : ''}`}</button></div></div>`;
  }
  if (real && estado.editTurma === g.id) {
    return `<form id="f-turma-ed" data-rascunho class="al-turma-ed" data-id="${g.id}" autocomplete="off"><input type="text" id="turma-nome" value="${esc(g.nome)}" maxlength="40" aria-label="Nome da turma">
      <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Salvar</button><button class="btn small pp-bt" type="button" data-act="cancelturma">Cancelar</button></span></form>`;
  }
  const add = real && estado.alunosAdicionarTurma === g.id;
  const up = podePromover && g.lista.length;
  const wa = g.lista.length ? `<a class="btn small pp-ico wa-bt al-wa" href="https://wa.me/?text=${encodeURIComponent(textoTurma(g))}" target="_blank" rel="noopener" aria-label="Compartilhar a lista de ${esc(g.nome)} no WhatsApp" title="Compartilhar no WhatsApp"><span class="wa-ico" aria-hidden="true">${ICONE_WHATS}</span></a>` : '';
  if (!real && !up && !wa) return '';
  return `<div class="al-acoes">${real && !add ? `<button class="btn small" type="button" data-act="abrirAddAlunosTurma" data-id="${g.id}">＋ Adicionar alunos</button>` : ''}${up ? `<button class="btn small al-promover" type="button" data-act="abrirPromover" data-id="${esc(g.id)}" aria-label="Promover alunos de ${esc(g.nome)} para a Corrente CPJ">↑ UP CPJ</button>` : ''}<span class="pp-bts">${wa}${real ? `<button class="btn small pp-ico" data-act="editturma" data-id="${g.id}" aria-label="Editar ${esc(g.nome)}" title="Editar turma"><span aria-hidden="true">✎</span></button><button class="btn small pp-ico pp-del" data-act="excluirask" data-tipo="turma" data-id="${g.id}" aria-label="Remover ${esc(g.nome)}" title="Remover turma"><span aria-hidden="true">🗑️</span></button>` : ''}</span></div>
    ${add ? `<form id="f-alunos-turma" data-rascunho class="al-add-form" data-id="${g.id}" autocomplete="off">
      <label class="field">Nome do aluno (ou vários separados por vírgula)<input type="text" id="alunos-turma-nomes" maxlength="4000" required autocomplete="off"></label>
      <p class="nota al-nota">Dados abaixo: opcionais e só quando é um aluno de cada vez.</p>
      ${camposAluno('ta')}
      <span class="pp-bts"><button class="btn small primary pp-bt" type="submit">Adicionar</button><button class="btn small pp-bt" type="button" data-act="cancelarAddAlunosTurma">Cancelar</button></span></form>` : ''}`;
}

function linhaAluno(a, turmas, editar, escolhendo) {
  if (!editar) return `<div class="pp al-l"><div class="pp-l1"><span class="nm">${esc(a.nome)}</span></div></div>`;
  // Escolhendo quem promover: a linha inteira marca/desmarca a caixinha; os outros botões somem.
  if (escolhendo) {
    const marcado = estado.alunosPromover.ids.includes(a.id);
    return `<label class="pp al-l al-sel"><span class="pp-l1"><input type="checkbox" data-act="promoverSel" data-id="${a.id}" ${marcado ? 'checked' : ''}${estado.alunosPromover.enviando ? ' disabled' : ''}><span class="nm">${esc(a.nome)}</span></span></label>`;
  }
  if (estado.editAluno === a.id) {
    const d = estado.alunos?.dados?.[a.id] || {};
    return `<form id="f-aluno" data-rascunho class="al-form" data-id="${a.id}" autocomplete="off">
      <div class="al-form-h"><b>Editar aluno</b></div>
      <div class="al-dados">
        <label class="field">Nome (acesso)<input type="text" id="al-nome" value="${esc(a.nome)}" maxlength="80" required></label>
        <label class="field">Turma<select id="al-turma">${!a.turmaId ? '<option value="" selected>Sem turma</option>' : ''}${turmas.map((t) => `<option value="${t.id}" ${t.id === a.turmaId ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>
      </div>
      ${camposAluno('al', d, a.id)}
      <label class="of-sw al-bloq"><input type="checkbox" role="switch" id="al-bloq" ${a.bloqueado ? 'checked' : ''}><span class="of-sw-t" aria-hidden="true"></span><span><b>Bloquear acesso ao app</b><small class="muted">Não entra; o cadastro continua.</small></span></label>
      <div class="al-form-bts"><button class="btn small" type="button" data-act="cancelaluno">Cancelar</button><button class="btn small primary" type="submit">Salvar</button></div></form>`;
  }
  const d = estado.alunos?.dados?.[a.id];
  const np = estado.alunos?.pendencias?.[a.id]?.length || 0;
  return `<div class="pp al-l${a.bloqueado ? ' al-bloqueado' : ''}"><div class="pp-l1"><span class="nm">${esc(a.nome)}${a.bloqueado ? ' <span class="badge re" title="Acesso ao app bloqueado">🚫 bloqueado</span>' : ''}${np ? ` <span class="badge re" title="Pagamentos em atraso">${np} em atraso</span>` : ''}${d?.nomeCompleto && d.nomeCompleto !== a.nome ? `<small class="muted al-nc">${esc(d.nomeCompleto)}</small>` : ''}</span>
    <span class="pp-bts">${pode('usuarios:gerenciar') ? `<button class="btn small pp-bt pp-ico" type="button" data-act="senhaaluno" data-id="${a.id}" data-nome="${esc(a.nome)}" aria-label="Definir senha de ${esc(a.nome)}" title="Definir senha"><span aria-hidden="true">🔑</span></button>` : ''}<button class="btn small pp-bt pp-ico" data-act="editaluno" data-id="${a.id}" aria-label="Editar ${esc(a.nome)}" title="Editar"><span aria-hidden="true">✎</span></button><button class="btn small pp-bt pp-ico pp-del" data-act="excluirask" data-tipo="al" data-id="${a.id}" aria-label="Excluir ${esc(a.nome)}" title="Excluir"><span aria-hidden="true">🗑️</span></button></span></div></div>`;
}

export function cardAlunos() {
  const A = estado.alunos;
  // Começa minimizado (a contagem fica no título).
  const aberto = !!estado.alunosAberto;
  const cab = `<div class="card pp-card fn-alunos">${cabDobra('dobraralunos', '🎓 Alunos', A ? `${A.alunos.length} aluno${A.alunos.length === 1 ? '' : 's'}` : '', aberto)}`;
  if (!aberto) return cab + '</div>';
  if (!A) return cab + `<div class="loading">Carregando alunos…</div></div>`;
  const editar = pode('alunos:editar');
  const podePromover = pode('pessoas:editar');
  // Uma turma por quadradinho e, no fim, "Sem turma" (quem não tem turma ou ficou sem ela ao remover a turma):
  // a soma dos quadradinhos é sempre o total do título.
  const grupos = [...A.turmas.map((t) => ({ id: t.id, nome: t.nome, lista: [] })), { id: 'sem', nome: 'Sem turma', lista: [] }];
  const porTurma = new Map(grupos.map((g) => [g.id, g]));
  for (const aluno of A.alunos) (porTurma.get(aluno.turmaId) || porTurma.get('sem')).lista.push(aluno);
  const aberta = grupos.some((g) => g.id === estado.alunosTurmaAberta) ? estado.alunosTurmaAberta : null;
  let h = `${cab}
    <div class="pf-of-totais auto">${grupos.map((g) => `<button type="button" class="pf-of-total fn-alunos${aberta === g.id ? ' selecionado' : ''}" data-act="alunosTurma" data-t="${esc(g.id)}" aria-expanded="${aberta === g.id}" aria-label="${esc(g.nome)}: ${g.lista.length} ${g.lista.length === 1 ? 'aluno' : 'alunos'}${aberta === g.id ? ', recolher lista' : ', expandir lista'}"${g.id === 'sem' && !g.lista.length ? ' disabled' : ''}><b>${g.lista.length}</b><span>${esc(g.nome)}</span></button>`).join('')}</div>`;
  const pendencias = editar ? blocoExAlunos(A) : '';
  if (!aberta) return h + pendencias + '</div>';
  const g = grupos.find((x) => x.id === aberta);
  h += `<div class="lista-aberta">${acoesTurma(g, editar, podePromover)}
      ${g.lista.length ? `<div class="ppl">${g.lista.map((a) => linhaAluno(a, A.turmas, editar, promovendo(g))).join('')}</div>` : '<p class="nota">Nenhum aluno nesta turma.</p>'}</div>`;
  return h + pendencias + '</div>';
}

// Ex-alunos (quem edita Alunos): quem foi excluído fica guardado aqui, com perfil, senha e CPF.
// ↩ Voltar devolve para os alunos; 🗑️ apaga de vez (pede confirmação).
function blocoExAlunos(A) {
  const lista = A.exAlunos || [];
  if (!lista.length) return '';
  const aberto = !!estado.exAlunosAberto;
  const turma = (id) => A.turmas.find((t) => t.id === id)?.nome || 'Sem turma';
  const linha = (a) => `<div class="pp al-l"><div class="pp-l1"><span class="nm">${esc(a.nome)}${a.nomeCompleto && a.nomeCompleto !== a.nome ? `<small class="muted al-nc">${esc(a.nomeCompleto)}</small>` : ''}<small class="muted al-nc">${esc(turma(a.turmaId))} · saiu em ${dBR(a.saida)}</small></span>
    <span class="pp-bts"><button class="btn small pp-bt" type="button" data-act="reativarAluno" data-id="${a.id}" aria-label="Voltar ${esc(a.nome)} para os alunos">↩ Voltar</button><button class="btn small pp-bt pp-ico pp-del" type="button" data-act="excluirask" data-tipo="exal" data-id="${a.id}" aria-label="Apagar ${esc(a.nome)} de vez" title="Apagar de vez"><span aria-hidden="true">🗑️</span></button></span></div></div>`;
  return `<div class="al-ex"><button type="button" class="btn small" data-act="exAlunosAbrir" aria-expanded="${aberto}">🗂️ Ex-alunos (${lista.length})</button>
    ${aberto ? `<p class="nota">Cadastro guardado (perfil, foto, senha e CPF), fora do login e das listas. <b>↩ Voltar</b> devolve para os alunos; <b>🗑️</b> apaga de vez.</p>
    <div class="ppl">${lista.map(linha).join('')}</div>` : ''}</div>`;
}

// ---------- Cadastros pelo login ----------
// Quem se cadastra pelo login entra sem destino (Novos). O admin decide para onde vai: uma turma de alunos, Consulentes,
// o grupo Oferenda ou a corrente (UP CPJ, como Cambone). Consulentes e Oferenda ficam nos outros quadradinhos e também
// podem mudar de destino.
const QUADROS_CADASTRO = [['novos', 'Novos', 'fn-cadnovos'], ['consulentes', 'Consulentes', 'fn-cadcons'], ['oferenda', 'Oferenda', 'fn-cadof']];
export function cardCadastrosLogin() {
  const C = estado.alunos?.cadastros;
  if (!pode('alunos:editar') || !C) return '';
  // Sempre aberto: os quadradinhos ficam à vista; tocar num deles abre a lista.
  const n = C.novos.length;
  let h = `<div class="card pp-card fn-cadastros"><div class="grp-h"><h2>🪪 Cadastros pelo login</h2>${n ? `<span class="count">${n} novo${n === 1 ? '' : 's'}</span>` : ''}</div>`;
  const sel = C[estado.cadQuadro] ? estado.cadQuadro : null;
  h += `<p class="muted" style="margin:0;font-size:.85rem">Quem se cadastrou pelo login (Criar cadastro). Decida para onde vai cada um: uma turma de alunos, Consulentes, Oferenda (só vê as oferendas; o admin põe a pessoa nelas) ou a corrente.</p>
    <div class="pf-of-totais auto">${QUADROS_CADASTRO.map(([k, t, cls]) => `<button type="button" class="pf-of-total ${cls}${sel === k ? ' selecionado' : ''}" data-act="cadquadro" data-q="${k}" aria-expanded="${sel === k}" aria-label="${t}: ${C[k].length}"${C[k].length ? '' : ' disabled'}><b>${C[k].length}</b><span>${t}</span></button>`).join('')}</div>`;
  if (!sel) return h + '</div>';
  const turmas = (estado.alunos.turmas || []).map((t) => `<option value="t:${t.id}">Aluno · ${esc(t.nome)}</option>`).join('');
  h += `<div class="cad-lista">${C[sel].map((c) => {
    // Os dados que a pessoa cadastrou (os mesmos do bloco Alunos): nome completo, celular, e-mail e o CPF mascarado.
    const d = estado.alunos?.dados?.[c.id] || { celular: c.celular, email: c.email };
    if (estado.cadEditar === c.id) {
      return `<form id="f-cad-dados" data-rascunho class="cad-l al-form" data-id="${c.id}" autocomplete="off">
        <div class="al-form-h"><b>Dados de ${esc(c.nome)}</b></div>
        ${camposAluno('cad', d, c.id)}
        <div class="al-form-bts"><button class="btn small" type="button" data-act="cadeditarfechar">Cancelar</button><button class="btn small primary" type="submit">Salvar</button></div></form>`;
    }
    const contato = [d.celular && formatarCel(d.celular), d.email].filter(Boolean).map(esc).join(' · ');
    const visto = estado.alunoCpfVisto?.id === c.id ? cpfBR(estado.alunoCpfVisto.cpf) : '';
    const cpf = d.temCpf ? `<div class="muted cad-contato">CPF: ${esc(visto || d.cpf)} <button type="button" class="btn link small" data-act="alcpfver" data-id="${c.id}">${visto ? 'Ocultar' : '👁 Mostrar'}</button></div>` : '';
    // Minimizada: nome e data; tocar abre os contatos, os botões e o "para onde vai" (uma pessoa aberta por vez).
    const aberta = estado.cadAberto === c.id;
    const cab = `<button type="button" class="cad-h" data-act="cadpessoa" data-id="${c.id}" aria-expanded="${aberta}"><span class="cad-h-n"><b>${esc(c.nome)}</b>${d.nomeCompleto && d.nomeCompleto !== c.nome ? `<small class="muted al-nc">${esc(d.nomeCompleto)}</small>` : ''}</span>
        <span class="cad-h-x">${c.em ? `<span class="muted cad-em">${dDM(c.em.slice(0, 10))}</span>` : ''}<span class="seta" aria-hidden="true">${aberta ? '▾' : '▸'}</span></span></button>`;
    if (!aberta) return `<div class="cad-l">${cab}</div>`;
    return `<div class="cad-l aberta">${cab}
      <div class="cad-l1">${contato ? `<div class="muted cad-contato">${contato}</div>` : '<span></span>'}
        <span class="cad-l1-d">${pode('usuarios:gerenciar') ? `<button class="btn small pp-bt pp-ico" type="button" data-act="senhaaluno" data-id="${c.id}" data-nome="${esc(c.nome)}" aria-label="Nova senha de ${esc(c.nome)}" title="Nova senha"><span aria-hidden="true">🔑</span></button>` : ''}
        <button class="btn small pp-bt pp-ico" type="button" data-act="cadeditar" data-id="${c.id}" aria-label="Editar os dados de ${esc(c.nome)}" title="Editar dados"><span aria-hidden="true">✎</span></button></span></div>
      ${cpf}
      <div class="cad-acao"><select id="cad-${c.id}" aria-label="Para onde vai ${esc(c.nome)}"><option value="">— para onde vai? —</option>${turmas}${sel !== 'consulentes' ? '<option value="consulente">Consulente</option>' : ''}${sel !== 'oferenda' ? '<option value="oferenda">Oferenda</option>' : ''}<option value="corrente">Corrente (Cambone)</option></select>
        <button class="btn small primary" data-act="cadmover" data-id="${c.id}" data-nome="${esc(c.nome)}">Mover</button></div></div>`;
  }).join('')}</div>`;
  return h + '</div>';
}
const formatarCel = (c) => { const d = String(c).replace(/\D/g, ''); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : c; };
// Cadastros pelo login → ✎: salva os dados da pessoa (nome completo, CPF, celular, e-mail), como no bloco Alunos.
export async function salvarDadosCadastro(form) {
  const id = form.dataset.id;
  const patch = lerCamposAluno('cad', estado.alunos?.dados?.[id] || {}, id);
  if (!Object.keys(patch).length) { estado.cadEditar = null; estado.alunoRasc = null; avisar(); return; }
  // Se der erro (CPF ou e-mail inválido), o formulário continua aberto com o que foi digitado.
  if (await acaoAlunos('aluno', { id, ...patch })) {
    estado.cadEditar = null;
    estado.alunoCpfRemover = null;
    estado.alunoCpfVisto = null;
    estado.alunoRasc = null;
    toast('Dados salvos.');
    carregarAlunos();   // contato e CPF da lista voltam atualizados
  }
}

// Aluno em Editar: salva o nome e a turma.
export async function salvarAluno(form) {
  const id = form.dataset.id;
  const a = (estado.alunos?.alunos || []).find((x) => x.id === id);
  const nome = document.getElementById('al-nome').value.replace(/\s+/g, ' ').trim();
  const turmaId = document.getElementById('al-turma').value;
  if (!nome) { toast('Digite o nome.'); return; }
  const patch = lerCamposAluno('al', estado.alunos?.dados?.[id] || {}, id);
  if (!a || nome !== a.nome) patch.nome = nome;
  if (!a || turmaId !== (a.turmaId || '')) patch.turmaId = turmaId;
  const bloqueado = !!document.getElementById('al-bloq')?.checked;
  if (!!a?.bloqueado !== bloqueado) patch.bloqueado = bloqueado;
  if (!Object.keys(patch).length) { estado.editAluno = null; estado.alunoCpfRemover = null; estado.alunoRasc = null; avisar(); return; }
  // Se der erro (CPF ou e-mail inválido), o formulário continua aberto com o que foi digitado.
  if (await acaoAlunos('aluno', { id, ...patch })) {
    estado.alunosTurmaAberta = turmaId || 'sem';
    estado.editAluno = null;
    estado.alunoCpfRemover = null;
    estado.alunoCpfVisto = null;
    estado.alunoRasc = null;
    toast('bloqueado' in patch ? (patch.bloqueado ? 'Acesso ao app bloqueado.' : 'Acesso ao app liberado.') : 'Aluno alterado.');
    avisar();
  }
}

// Confirmar do UP CPJ: promove os marcados um por um. Se um falhar (o erro aparece na tela), para ali e
// deixa marcados só os que faltaram, para tentar de novo.
export async function confirmarPromover() {
  const sel = estado.alunosPromover;
  if (!sel || sel.enviando || !sel.ids.length) return;
  sel.enviando = true;
  avisar();
  const feitos = [];
  for (const id of sel.ids) {
    const aluno = estado.alunos?.alunos.find((a) => a.id === id);
    if (!aluno) continue;
    if (!(await acaoAlunos('promoverAlunoCPJ', { id }))) {
      sel.ids = sel.ids.filter((x) => !feitos.some((f) => f.id === x));
      sel.enviando = false;
      avisar();
      return;
    }
    feitos.push(aluno);
  }
  estado.alunosPromover = null;
  avisar();
  if (feitos.length) toast(feitos.length === 1 ? `${feitos[0].nome} foi promovido(a) para a Corrente como Cambone.` : `${feitos.length} alunos promovidos para a Corrente como Cambone.`);
}

// Turma em Editar: salva o novo nome.
export async function salvarTurma(form) {
  const id = form.dataset.id;
  const t = (estado.alunos?.turmas || []).find((x) => x.id === id);
  const nome = document.getElementById('turma-nome').value.replace(/\s+/g, ' ').trim();
  if (!nome) { toast('Digite o nome da turma.'); return; }
  if (t && nome === t.nome) { estado.editTurma = null; avisar(); return; }
  if (await acaoAlunos('turma', { id, nome })) { estado.editTurma = null; toast('Turma renomeada.'); avisar(); }
}

export async function salvarAlunosTurma(form) {
  const turmaId = form.dataset.id;
  const inp = document.getElementById('alunos-turma-nomes');
  if (!inp?.value.trim()) { toast('Digite pelo menos um nome.'); return; }
  const r = await acaoAlunos('alunos', { nome: inp.value, turmaId, ...lerCamposAluno('ta') });
  if (!r) return;
  estado.alunoRasc = null;
  estado.alunosAdicionarTurma = null;
  estado.alunosTurmaAberta = turmaId;
  const turma = r.turmas.find((x) => x.id === turmaId);
  toast(r.criadas ? `${r.criadas} aluno${r.criadas > 1 ? 's' : ''} adicionado${r.criadas > 1 ? 's' : ''} ${turma ? `à ${turma.nome}` : 'à turma'}.` : 'Esses alunos já estão cadastrados.');
  avisar();
}