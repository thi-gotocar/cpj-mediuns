// Compartilhar o resumo de uma gira encerrada no WhatsApp: texto ou imagem.
// Usado na aba Gira e na aba Histórico.

import { textoResumo, dadosResumo, linhaLicenca, limpezaResumo, historicoAtendimentos, historicoFrequencia, LOCAL_PADRAO } from '/shared/resumoGira.js';
import { giraEspecial } from '/shared/regras.js';
import { config } from '/shared/config.js';
import { compartilharImagem } from './imagemLista.js';
import { gerarImagemResumo, COR_RESUMO } from './imagemResumo.js';
import { estado, avisar, girasLista } from './estado.js';
import { toast, baixar, dShort } from './util.js';

const giraDe = (data) => estado.giras[data];

// Dados da imagem do resumo: um cartão de presença e um de atendimentos (e a limpeza, se a gira teve turma).
function dadosImagem(g) {
  const d = dadosResumo(estado.pessoas, g);
  const CR = COR_RESUMO;
  const pilulas = (l) => l.map((p) => ({ texto: p.nome }));
  // Limpeza: quem esteve presente fica neutro; os outros mostram a situação, com a cor dela.
  const COR_SIT = { Falta: CR.falta, Ausente: CR.ausente };
  const naLimpeza = (l) => l.map((x) => (x.situacao === 'Presente' || x.situacao === 'Curimba'
    ? { texto: x.pessoa.nome } : { texto: `${x.pessoa.nome} · ${x.situacao.toLowerCase()}`, cor: COR_SIT[x.situacao] || CR.licenca }));
  const cartoes = [{
    titulo: 'PRESENÇA', estrela: true, direita: `${d.pct.presenca}% de presença`, cor: CR.ouro,
    quadros: [['Presentes', d.presentes.length, CR.presente], ['Ausentes', d.ausentes.length, CR.ausente], ['Faltas', d.faltas.length, CR.falta], ['Em licença', d.licenca.length, CR.licenca]],
    nota: `Ausência ${d.pct.ausencia}% · Licença ${d.pct.licenca}%`,
    grupos: [
      { titulo: `Ausentes · ${d.ausentes.length}`, cor: CR.ausente, pilulas: pilulas(d.ausentes) },
      { titulo: `Faltas · ${d.faltas.length}`, cor: CR.falta, pilulas: pilulas(d.faltas) },
      { titulo: `Em licença · ${d.licenca.length}`, cor: CR.licenca, linhas: d.licenca.map(linhaLicenca) },
    ],
  }, d.evento ? {
    titulo: 'PARTICIPANTES', direita: `Total ${d.participantes}`, cor: CR.presente,
    quadros: [['Participantes', d.participantes, CR.presente]],
  } : {
    titulo: 'ATENDIMENTOS', direita: `Total ${d.total}`, cor: CR.licenca,
    quadros: [['Preferencial', d.atendimentos.preferencial, CR.ouro], ['Normal', d.atendimentos.normal, CR.licenca], ['Passe', d.atendimentos.passe, CR.presente]],
  }];
  const lp = limpezaResumo(estado.pessoas, g, girasLista());
  if (lp) {
    cartoes.push({
      titulo: 'LIMPEZA', direita: `Turma ${lp.turma}`, cor: CR.limpeza,
      grupos: [
        lp.membros.length ? { titulo: 'Da turma', cor: CR.limpeza, pilulas: naLimpeza(lp.membros) } : { titulo: 'Da turma', cor: CR.limpeza, linhas: ['Ninguém cadastrado nesta turma'] },
        { titulo: 'Ajudaram na limpeza', cor: CR.limpeza, pilulas: naLimpeza(lp.ajudantes) },
      ],
    });
  }
  const frequencia = historicoFrequencia(girasLista(), estado.pessoas, g);
  if (frequencia) {
    const ultima = frequencia.giras[frequencia.giras.length - 1];
    cartoes.push({
      titulo: 'FREQUÊNCIA DO PESSOAL',
      direita: 'Últimas 6 giras',
      cor: CR.presente,
      quadros: [['Média de presença', `${frequencia.media}%`, CR.presente],
        ['Presentes na última', `${ultima.presentes}/${ultima.elegiveis}`, CR.licenca]],
      graficoFrequencia: frequencia.giras,
    });
  }
  const historico = historicoAtendimentos(girasLista(), g);
  if (historico) {
    cartoes.push({
      titulo: 'HISTÓRICO DA ENTIDADE',
      direita: 'Últimas 6 giras',
      cor: CR.presente,
      quadros: [['Giras · 12 meses', historico.quantidade, CR.presente], ['Atend. · 12 meses', historico.total, CR.licenca]],
      grafico: historico.giras,
    });
  }
  const nomeDaGira = d.gira ? (giraEspecial(g.entidade) ? d.gira : `Gira de ${d.gira}`) : 'Gira';
  return { rotulo: `RESUMO DO EVENTO - DIRIGENTE ${config().dirigente}`, titulo: nomeDaGira, subtitulo: `${d.orixa ? `Orixá ${d.orixa} · ` : ''}${dShort(g.data)}`, cartoes };
}

// Botão que abre o painel (só para gira encerrada).
export const botaoResumo = (g) => (g && g.encerrada
  ? `<button class="btn small rs-btn" data-act="rsabrir" data-d="${g.data}"><span aria-hidden="true">${estado.resumo?.data === g.data ? '✕' : '📤'}</span> ${estado.resumo?.data === g.data ? 'Fechar resumo' : 'Compartilhar resumo'}</button>` : '');

// Painel com as opções (aparece embaixo do botão da gira encerrada).
export function painelResumo(g) {
  if (!g || !g.encerrada || estado.resumo?.data !== g.data) return '';
  const txt = textoResumo(estado.pessoas, g, LOCAL_PADRAO, girasLista());
  const img = estado.resumo.img;
  return `<div class="rs-painel">
    <b>Compartilhar no WhatsApp</b>
    <div class="rs-acoes">
      <a class="btn primary rs-acao" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener"><span aria-hidden="true">📝</span> Enviar texto</a>
      <button class="btn rs-acao" data-act="rsimg" ${img ? '' : 'disabled'}><span aria-hidden="true">🖼️</span> ${img ? 'Enviar imagem' : estado.resumo.gerando ? 'Preparando imagem…' : 'Imagem indisponível'}</button>
    </div>
    ${img ? `<img class="rs-img" src="${img.url}" alt="Prévia da imagem do resumo da gira">` : ''}
  </div>`;
}

async function prepararImagem(data) {
  const resumo = estado.resumo;
  const g = giraDe(data);
  if (!resumo || resumo.data !== data || resumo.img || resumo.gerando || !g) return;
  resumo.gerando = true;
  avisar();
  try {
    const blob = await gerarImagemResumo(dadosImagem(g));
    if (estado.resumo !== resumo) return;
    resumo.img = { blob, url: URL.createObjectURL(blob), nome: 'resumo-gira-' + g.data + '.png' };
  } catch (e) {
    toast(e.message);
  } finally {
    if (estado.resumo === resumo) {
      resumo.gerando = false;
      avisar();
    }
  }
}

export const cliquesResumo = {
  rsabrir(el) {
    const d = el.dataset.d;
    if (estado.resumo?.data === d) {
      if (estado.resumo.img) URL.revokeObjectURL(estado.resumo.img.url);
      estado.resumo = null;
    } else {
      if (estado.resumo?.img) URL.revokeObjectURL(estado.resumo.img.url);
      estado.resumo = { data: d, img: null, gerando: false };
    }
    avisar();
    if (estado.resumo) void prepararImagem(d);
  },
  async rsimg() {
    const i = estado.resumo?.img;
    if (!i) return;
    if (!(await compartilharImagem(i.blob, i.nome, 'Resumo da gira'))) {
      baixar(i.url, i.nome);
      toast('A imagem foi baixada para você anexar no WhatsApp.');
    }
  },
};
