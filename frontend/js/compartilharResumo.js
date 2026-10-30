// Compartilhar o resumo de uma gira encerrada no WhatsApp: texto (copiar ou abrir o WhatsApp)
// ou imagem. Usado na aba Gira e na aba Histórico.

import { textoResumo, dadosResumo, linhaLicenca, limpezaResumo, LOCAL_PADRAO } from '/shared/resumoGira.js';
import { gerarImagemLista, compartilharImagem } from './imagemLista.js';
import { estado, avisar, girasLista } from './estado.js';
import { esc, toast, baixar, dShort } from './util.js';

const giraDe = (data) => estado.giras[data];

function dadosImagem(g) {
  const d = dadosResumo(estado.pessoas, g);
  const nomes = (l) => l.map((p) => p.nome).join(', ');
  const linhas = [
    { texto: 'Presentes', valor: String(d.presentes.length) },
    { texto: 'Ausentes', valor: String(d.ausentes.length), sub: nomes(d.ausentes) },
    { texto: 'Faltas', valor: String(d.faltas.length), sub: nomes(d.faltas) },
    { texto: 'Em licença', valor: String(d.licenca.length), sub: d.licenca.map(linhaLicenca).join(' · ') },
    { texto: 'Taxa de presença', valor: d.pct.presenca + '%', sub: `Ausência ${d.pct.ausencia}% · Licença ${d.pct.licenca}%` },
    { texto: 'Atendimentos', valor: String(d.total), sub: `Preferencial ${d.atendimentos.preferencial} · Normal ${d.atendimentos.normal} · Passe ${d.atendimentos.passe}` },
  ];
  const lp = limpezaResumo(estado.pessoas, g, girasLista());
  if (lp) {
    linhas.push({ texto: `Limpeza · Turma ${lp.turma}`, valor: '', sub: lp.membros.length ? lp.membros.map((x) => `${x.pessoa.nome} (${x.situacao.toLowerCase()})`).join(', ') : 'Ninguém cadastrado nesta turma' });
    if (lp.ajudantes.length) linhas.push({ texto: 'Ajudaram na limpeza', valor: '', sub: lp.ajudantes.map((x) => `${x.pessoa.nome} (${x.situacao.toLowerCase()})`).join(', ') });
  }
  return { rotulo: 'Resumo do evento', titulo: d.gira || 'Gira', subtitulo: `${dShort(g.data)} · ${LOCAL_PADRAO}`, linhas: linhas.map((l) => (l.sub ? l : { texto: l.texto, valor: l.valor })) };
}

// Botão que abre o painel (só para gira encerrada).
export const botaoResumo = (g) => (g && g.encerrada
  ? `<button class="btn small rs-btn" data-act="rsabrir" data-d="${g.data}">${estado.resumo?.data === g.data ? 'Fechar resumo' : '📤 Compartilhar resumo'}</button>` : '');

// Painel com as opções (aparece embaixo do botão da gira aberta).
export function painelResumo(g) {
  if (!g || !g.encerrada || estado.resumo?.data !== g.data) return '';
  const txt = textoResumo(estado.pessoas, g, LOCAL_PADRAO, girasLista());
  const img = estado.resumo.img;
  return `<div class="rs-painel">
    <b>Compartilhar no WhatsApp</b>
    <div class="row" style="gap:6px">
      <a class="btn small primary" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">Enviar texto no WhatsApp</a>
      <button class="btn small" data-act="rscopiar">Copiar texto</button>
      <button class="btn small" data-act="rsimg">${img ? 'Gerar de novo' : 'Gerar imagem'}</button>
    </div>
    ${img ? `<img class="rs-img" src="${img.url}" alt="Imagem do resumo da gira">
      <div class="row" style="gap:6px"><button class="btn small primary" data-act="rsshareimg">Compartilhar imagem</button><button class="btn small" data-act="rssaveimg">Salvar imagem</button></div>` : ''}
    <details><summary>Ver texto</summary><textarea id="rs-txt" readonly rows="14">${esc(txt)}</textarea></details>
  </div>`;
}

export const cliquesResumo = {
  rsabrir(el) {
    const d = el.dataset.d;
    if (estado.resumo?.img) URL.revokeObjectURL(estado.resumo.img.url);
    estado.resumo = estado.resumo?.data === d ? null : { data: d, img: null };
    avisar();
  },
  rscopiar() {
    const g = giraDe(estado.resumo?.data);
    if (!g) return;
    const txt = textoResumo(estado.pessoas, g, LOCAL_PADRAO, girasLista());
    const fb = () => {
      const t = document.getElementById('rs-txt');
      if (t) { t.closest('details').open = true; t.focus(); t.select(); }
      toast('Texto selecionado. Copie com o menu do aparelho.');
    };
    try { navigator.clipboard.writeText(txt).then(() => toast('Copiado. Cole no grupo do WhatsApp.'), fb); } catch { fb(); }
  },
  async rsimg() {
    const g = giraDe(estado.resumo?.data);
    if (!g) return;
    try {
      const blob = await gerarImagemLista(dadosImagem(g));
      if (estado.resumo.img) URL.revokeObjectURL(estado.resumo.img.url);
      estado.resumo.img = { blob, url: URL.createObjectURL(blob), nome: 'resumo-gira-' + g.data + '.png' };
      avisar();
    } catch (e) { toast(e.message); }
  },
  async rsshareimg() {
    const i = estado.resumo?.img;
    if (i && !(await compartilharImagem(i.blob, i.nome, 'Resumo da gira'))) toast('Este aparelho não compartilha imagens daqui. Use Salvar imagem.');
  },
  rssaveimg() { const i = estado.resumo?.img; if (i) baixar(i.url, i.nome); },
};
