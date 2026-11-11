// Aba Gira: bloco "Você nesta gira" de quem está logado.

import { tituloGira, ehCurimba, orixaDaGira, limpezaDaGira, status, presencaDe, naGira, pessoaNaGira, pessoasDe, licencaEm, funcaoNaGira, podeDeclararAusencia, statusMarcado, guiaNaGira, podeEscolherEntidade, linhasParaEscolher, entidadeEscolhida } from '/shared/regras.js';
import { estado, pode, nome, girasLista, carregarFoto } from '../estado.js';
import { config } from '/shared/config.js';
import { esc, dDM, hoje, iniciais } from '../util.js';
import { htmlStatus } from './giraComum.js';

const ROTULO_FUNCAO = { medium: 'Médium', extra: 'At. Extra', cambone: 'Cambone', passe: 'Médium de passe', senha: 'Senha', curimba: 'Curimba' };
// Bloco de quem está logado: com quem trabalha nesta gira e se é da turma da limpeza.
export function blocoEu(g) {
  const cad = estado.me?.pessoaId && estado.pessoas.find((x) => x.id === estado.me.pessoaId);
  if (!cad) return '';
  // Gira encerrada: a pessoa como estava no retrato da gira (função, turma, licença daquele dia).
  const p = pessoaNaGira(cad, g);
  const foto = () => {
    const F = estado.fotosPessoa;
    if (F[p.id] === undefined) carregarFoto(p.id);
    return F[p.id]
      ? `<button type="button" class="eu-avatar" data-act="eufoto" data-id="${p.id}" aria-label="Ver sua foto de perfil"><img src="${F[p.id]}" alt=""></button>`
      : `<span class="eu-avatar" aria-hidden="true"><span>${esc(iniciais(p.nome))}</span></span>`;
  };
  const identidade = (convertido = '', possivel = false) => `<div class="eu-identidade">${foto()}<div class="eu-identidade-dados">
    <div class="eu-nome"><b>${esc(p.nome)}</b></div>
    <div class="eu-tags">${possivel ? '<span class="muted eu-poss">Possivelmente:</span>' : ''}<span class="tag">${ROTULO_FUNCAO[p.funcao] || p.funcao}</span>${convertido}</div>
  </div></div>`;
  // Título do bloco: o nome da gira (igual ao da aba Gira) à esquerda e a data à direita.
  const cabeca = `<div class="datehead eu-cab"><div class="grp-h eu-h"><span class="dia gira-nome">${esc(tituloGira(g))}</span><span class="eu-gira">${dDM(g.data)}</span></div>${orixaDaGira(g) ? `<span class="ent">Orixá: ${esc(orixaDaGira(g))}</span>` : ''}</div>`;
  if (!naGira(cad, g)) return `<div class="card eu">${cabeca}
    ${identidade()}<p class="eu-nota muted">${cad.entrada && cad.entrada > g.data ? `Sua entrada na corrente é em ${dDM(cad.entrada)}/${cad.entrada.slice(0, 4)}. Esta gira ainda não conta para você.` : 'Esta gira não conta para você.'}</p></div>`;
  const curimba = ehCurimba(p);
  const rootVinculado = estado.me?.papel === 'root' && p.id === estado.me.pessoaId;
  const st = curimba ? 'p' : status(p, g);
  const funcao = st === 'na' ? 'cambone' : funcaoNaGira(p, g);
  const pares = g.evento ? [] : g.pares || [], passes = g.evento ? [] : g.passes || [];
  const sorteado = pares.length > 0 || passes.length > 0;
  const camsDe = (m) => pares.filter((x) => x.m === m).map((x) => x.c);
  const passesDe = (m) => passes.filter((x) => x.m === m).map((x) => x.c);
  const L = [];
  const lin = (rot, val) => L.push(`<div class="eu-l"><span class="muted">${rot}:</span> <b>${val}</b></div>`);
  // Com quem você trabalha (médium, cambone, passe): foto pequena do Perfil, para saber quem é quem; tocar amplia.
  const comFoto = (rot, id) => {
    const F = estado.fotosPessoa;
    if (F[id] === undefined) carregarFoto(id);
    const n = pessoasDe(estado.pessoas, g).find((x) => x.id === id)?.nome || nome(id);   // encerrada: nome do retrato
    const av = F[id]
      ? `<button type="button" class="eu-av" data-act="eufoto" data-id="${id}" aria-label="Ver a foto de ${esc(n)}"><img src="${F[id]}" alt=""></button>`
      : `<span class="eu-av"><span aria-hidden="true">${esc(iniciais(n))}</span></span>`;
    L.push(`<div class="eu-l eu-pessoa">${av}<span><span class="muted">${rot}:</span> <b>${esc(n)}</b></span></div>`);
  };
  const aviso = (t) => L.push(`<p class="muted" style="margin:0">${t}</p>`);
  const fora = (t) => L.push(`<div class="eu-fora">${t}</div>`);
  // Abaixo do nome do médium: o guia de atendimento dele na linha desta gira (se cadastrou no Perfil).
  const guiaDe = (id) => { const gnome = guiaNaGira(estado.pessoas.find((x) => x.id === id), g); if (gnome) L.push(`<div class="eu-l eu-guia"><span class="muted">Guia de atendimento:</span> <b>${esc(gnome)}</b></div>`); };
  if (st === 'lic') {
    const l = licencaEm(p, g.data);
    fora(`📋 Você está <b>de licença</b>${l ? ` de ${dDM(l.inicio)} a ${dDM(l.fim)}` : ''}${l?.motivo ? ` · ${esc(l.motivo)}` : ''}.`);
  } else if (st === 'a') fora('❌ <b>Ausente</b> nesta gira.');
  else if (st === 'f') fora('🚫 <b>Falta</b> nesta gira.');
  else if (st === 'sup') aviso('Hoje você está no <b>Suporte</b>.');
  else if (curimba) lin('Função', 'Curimba');
  else if (funcao === 'senha') lin('Função', 'Senha');
  else if (!sorteado) { /* o aviso de sorteio pendente vai no fim do bloco */ }
  else if (funcao === 'medium' || funcao === 'extra') {
    const cs = camsDe(p.id);
    if (!cs.length) aviso('Você ainda está sem cambone.');
    cs.forEach((c, i) => comFoto(i ? `${i + 1}º cambone` : 'Cambone', c));
    if (funcao === 'medium') passesDe(p.id).forEach((c) => comFoto('Médium de passe', c));
  } else if (funcao === 'cambone') {
    const meus = pares.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você não está com nenhum médium nesta escala.');
    meus.forEach((m, i) => {
      comFoto(meus.length > 1 ? `Médium ${i + 1}` : 'Médium', m);
      guiaDe(m);
      camsDe(m).filter((c) => c !== p.id).forEach((c) => comFoto('Cambone junto', c));
      passesDe(m).forEach((c) => comFoto('Médium de passe', c));
    });
  } else if (funcao === 'passe') {
    const meus = passes.filter((x) => x.c === p.id).map((x) => x.m);
    if (!meus.length) aviso('Você ainda está sem médium.');
    meus.forEach((m) => {
      comFoto('Médium', m);
      guiaDe(m);
      camsDe(m).forEach((c) => comFoto('Cambone do médium', c));
    });
  }
  // Gira em aberto ainda sem sorteio: o aviso "Sorteio de escala pendente" fica dentro deste bloco.
  if (!g.evento && !sorteado && !g.encerrada && !['lic', 'a', 'f'].includes(st)) L.push('<div class="eu-pend">⏳ Sorteio de escala pendente</div>');
  const pr = presencaDe(p, g);
  // Quando a presença não muda aqui, ela vira um selo ao lado da função.
  const SELO = { p: ['new', 'Presente'], pend: ['hot', 'Pendente'] };
  let selo = '';
  const selar = () => { if (SELO[pr]) selo = ` <span class="badge ${SELO[pr][0]}">${SELO[pr][1]}</span>`; };
  // Depois do sorteio (publicado), não mostra mais o status para alterar nem o texto.
  if (sorteado) { /* nada */ } else if (!curimba && (estado.me?.corrente || rootVinculado)) {
    // O próprio usuário declara a ausência; para root, grava pela ação administrativa.
    // Pendente → Ausente só até a véspera e enquanto o admin não marcou; depois fica só o selo.
    const gs = estado.giras[g.data];
    if (podeDeclararAusencia(p, gs, hoje())) {
      const act = rootVinculado ? `data-act="status" data-id="${p.id}"` : 'data-act="ausencia"';
      L.push(`<div class="eu-aus-box"><select id="eu-aus" class="st-${pr}" ${act} aria-label="Sua participação nesta gira">${[['pend', 'Estarei presente 😊'], ['a', 'Não poderei ir']].map(([k, l]) => `<option value="${k}" ${k === pr ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <p class="muted eu-aus-aviso">Se não puder vir, avise até a véspera.</p></div>`);
    } else {
      selar();
      if (pr === 'pend' && !statusMarcado(p, gs) && gs && hoje() >= g.data) L.push(`<p class="muted eu-trava">🔒 No dia da gira, só a ${esc(config().responsavel)} altera.</p>`);
    }
  } else if (!curimba && pode('giras:editar') && estado.giras[g.data] && !g.encerrada && st !== 'lic') {
    // Admin ligado a uma pessoa: muda o próprio status aqui, com as mesmas opções da lista de presença.
    L.push(`<div class="eu-aus"><select id="eu-aus" class="st-${pr}" data-act="status" data-id="${p.id}" aria-label="Sua participação nesta gira">${htmlStatus(g, pr, st, g.pendentePadrao && g.data > hoje())}</select></div>`);
  } else if (!curimba && pr === 'pend') selar();
  // Turma da limpeza
  const Lp = g.evento ? null : limpezaDaGira(estado.pessoas, g, girasLista());
  if (Lp && st !== 'lic') {
    if (Number(p.limpeza) === Lp.turma) L.push(`<div class="eu-limp">🧹 Hoje é sua turma de limpeza.</div>`);
    else if (Lp.ajudantes.some((x) => x.id === p.id)) {
      L.push(`<div class="eu-limp">🧹 Hoje você ajuda essa turma, pois faltou na sua turma na gira passada.</div>`);
    }
  }
  // Gira com mais de uma linha: com qual entidade a pessoa vai trabalhar (aparece na escala e no guia de atendimento).
  const escolhida = entidadeEscolhida(p, g);
  const comboEntidade = estado.giras[g.data] && podeEscolherEntidade(p, g)
    ? `<label class="eu-aus eu-ent"><span class="muted">Qual entidade vai atender?</span>
        <select id="eu-ent" data-act="minhaentidade" aria-label="Entidade que você vai atender nesta gira"><option value="">— escolha —</option>${linhasParaEscolher(g).map(([k, l]) => `<option value="${k}" ${k === escolhida ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
    : '';
  const convertido = funcao !== p.funcao && st !== 'lic' ? ` <span class="badge rep">hoje: ${ROTULO_FUNCAO[funcao] || funcao}</span>` : '';
  return `<div class="card eu">${cabeca}
    ${identidade(convertido + selo, !sorteado && !['medium', 'cambone'].includes(p.funcao))}
    ${comboEntidade}
    ${(funcao === 'medium' || funcao === 'extra') && st !== 'lic' && guiaNaGira(p, g) ? `<div class="eu-l eu-guia"><span class="muted">Guia de atendimento:</span> <b>${esc(guiaNaGira(p, g))}</b></div>` : ''}
    ${L.join('')}</div>`;
}
