# Base visual dos manuais (reportlab): fontes, cores, capa, seções, passos e caixas.
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
                                KeepTogether, PageBreak, Flowable, NextPageTemplate)

F = r'C:\Windows\Fonts'
pdfmetrics.registerFont(TTFont('Segoe', F + r'\segoeui.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-B', F + r'\segoeuib.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-I', F + r'\segoeuii.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-BI', F + r'\segoeuiz.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-L', F + r'\segoeuil.ttf'))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('Segoe', normal='Segoe', bold='Segoe-B', italic='Segoe-I', boldItalic='Segoe-BI')

AZUL = colors.HexColor('#2c4ea3'); AZUL_S = colors.HexColor('#e6ecfa')
OURO = colors.HexColor('#a8771c'); OURO_S = colors.HexColor('#f7eedb')
VERDE = colors.HexColor('#24785a'); VERDE_S = colors.HexColor('#e1f2ea')
AMAR = colors.HexColor('#9a6a10'); AMAR_S = colors.HexColor('#f8efd9')
VERM = colors.HexColor('#a2423a'); VERM_S = colors.HexColor('#f8e6e4')
LARANJA = colors.HexColor('#c2570c')
TINTA = colors.HexColor('#18212f'); CINZA = colors.HexColor('#5b6678'); LINHA = colors.HexColor('#dde3ec')

W, H = A4
MARG = 18 * mm
LARG = W - 2 * MARG

st = {
  'p': ParagraphStyle('p', fontName='Segoe', fontSize=10.5, leading=15.5, textColor=TINTA, spaceAfter=5),
  'pc': ParagraphStyle('pc', fontName='Segoe', fontSize=10.5, leading=15.5, textColor=TINTA),
  'peq': ParagraphStyle('peq', fontName='Segoe', fontSize=9, leading=13, textColor=CINZA),
  'h3': ParagraphStyle('h3', fontName='Segoe-B', fontSize=12.5, leading=17, textColor=AZUL, spaceBefore=9, spaceAfter=4, keepWithNext=1),
  'sec': ParagraphStyle('sec', fontName='Segoe-B', fontSize=17, leading=21, textColor=colors.white),
  'secsub': ParagraphStyle('secsub', fontName='Segoe', fontSize=10, leading=13, textColor=colors.white),
  'num': ParagraphStyle('num', fontName='Segoe-B', fontSize=11, leading=13, textColor=colors.white, alignment=TA_CENTER),
  'caixa_t': ParagraphStyle('caixa_t', fontName='Segoe-B', fontSize=10.5, leading=14, spaceAfter=2),
  'th': ParagraphStyle('th', fontName='Segoe-B', fontSize=10, leading=13, textColor=colors.white),
  'td': ParagraphStyle('td', fontName='Segoe', fontSize=10, leading=14, textColor=TINTA),
  'sum': ParagraphStyle('sum', fontName='Segoe', fontSize=12, leading=20, textColor=TINTA),
}

# Texto de botão como aparece no app: fundo azul claro, negrito.
def B(t):
  return f'<font backColor="#e6ecfa" color="#1f3a80"><b>&nbsp;{t}&nbsp;</b></font>'

def P(t, s='p'):
  return Paragraph(t, st[s])

class Num(Flowable):
  """Bolinha com o número do passo."""
  def __init__(self, n, cor=AZUL, d=7 * mm):
    super().__init__(); self.n, self.cor, self.d = n, cor, d
  def wrap(self, *a): return self.d, self.d
  def draw(self):
    c = self.canv; r = self.d / 2
    c.setFillColor(self.cor); c.circle(r, r, r, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont('Segoe-B', 11)
    c.drawCentredString(r, r - 4, str(self.n))

def passos(itens, cor=AZUL):
  """Passo a passo numerado."""
  linhas = [[Num(i + 1, cor), P(t, 'pc')] for i, t in enumerate(itens)]
  t = Table(linhas, colWidths=[10 * mm, LARG - 10 * mm])
  t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                         ('BOTTOMPADDING', (0, 0), (-1, -1), 5), ('TOPPADDING', (1, 0), (1, -1), 2)]))
  return [t, Spacer(1, 4)]

def lista(itens):
  linhas = [[P('•', 'pc'), P(t, 'pc')] for t in itens]
  t = Table(linhas, colWidths=[6 * mm, LARG - 6 * mm])
  t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0),
                         ('BOTTOMPADDING', (0, 0), (-1, -1), 3), ('TOPPADDING', (0, 0), (-1, -1), 0)]))
  return [t, Spacer(1, 4)]

CAIXAS = {'dica': ('Dica', VERDE, VERDE_S), 'atencao': ('Atenção', AMAR, AMAR_S), 'importante': ('Importante', VERM, VERM_S),
          'info': ('Para que serve', AZUL, AZUL_S), 'admin': ('Só para admin', OURO, OURO_S)}

def caixa(tipo, corpo, titulo=None):
  """Caixa colorida com faixa à esquerda (Dica, Atenção...). corpo: texto ou lista de textos."""
  nome, cor, fundo = CAIXAS[tipo]
  ts = ParagraphStyle('ct', parent=st['caixa_t'], textColor=cor)
  conteudo = [Paragraph(titulo or nome, ts)]
  for t in (corpo if isinstance(corpo, list) else [corpo]):
    conteudo.append(P(t, 'pc'))
  t = Table([[conteudo]], colWidths=[LARG])
  t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), fundo), ('LINEBEFORE', (0, 0), (0, -1), 4, cor),
                         ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                         ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
  return [Spacer(1, 3), t, Spacer(1, 8)]

def tabela(cab, linhas, larguras, cor=AZUL):
  dados = [[P(c, 'th') for c in cab]] + [[P(c, 'td') for c in l] for l in linhas]
  t = Table(dados, colWidths=[LARG * x for x in larguras], repeatRows=1)
  estilo = [('BACKGROUND', (0, 0), (-1, 0), cor), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, LINHA), ('LEFTPADDING', (0, 0), (-1, -1), 7),
            ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]
  for i in range(1, len(dados)):
    if i % 2 == 0: estilo.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f5f7fb')))
  t.setStyle(TableStyle(estilo))
  return [t, Spacer(1, 8)]

def faixas_cor(linhas):
  """Tabela com uma bolinha de cor em cada linha: [(cor, título, texto)]."""
  dados = []
  for cor, tit, txt in linhas:
    dados.append([Num('', cor, 5 * mm), P(f'<b>{tit}</b> — {txt}', 'pc')])
  t = Table(dados, colWidths=[9 * mm, LARG - 9 * mm])
  t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
  return [t, Spacer(1, 6)]

def secao(n, titulo, sub, cor=AZUL):
  """Faixa colorida de abertura de seção, com o número."""
  conteudo = [Paragraph(titulo, st['sec'])] + ([Paragraph(sub, st['secsub'])] if sub else [])
  t = Table([[Paragraph(str(n), ParagraphStyle('n', parent=st['sec'], fontSize=26, leading=30, alignment=TA_CENTER)), conteudo]],
            colWidths=[18 * mm, LARG - 18 * mm])
  t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), cor), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                         ('LINEAFTER', (0, 0), (0, 0), 1, colors.white),
                         ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                         ('LEFTPADDING', (1, 0), (1, 0), 12)]))
  return t

def h3(t): return P(t, 'h3')

def legenda():
  """Como ler o guia: o que é cada caixa e como aparecem os botões."""
  return bloco(
    P('<b>Como ler este guia</b>', 'h3'),
    P(f'Os nomes de botões aparecem assim: {B("Exemplo de botão")}. É só procurar o mesmo texto na tela do app.'),
    P('Os passos numerados mostram o caminho, na ordem:'),
    passos(['Primeiro isto…', '…depois isto.']),
    P('E estas caixas aparecem ao longo do guia:'),
    caixa('dica', 'Um atalho ou um jeito mais fácil de fazer.'),
    caixa('atencao', 'Uma regra do app que é bom saber antes de fazer.'),
    caixa('importante', 'Algo que muda o resultado (por exemplo, o sorteio).'),
  )

def bloco(*partes):
  """Junta flowables (e listas de flowables) numa lista só."""
  out = []
  for x in partes:
    out.extend(x if isinstance(x, list) else [x])
  return out

def montar(arquivo, titulo, subtitulo, publico, cor_capa, sumario, secoes, rodape):
  """secoes: [(titulo, sub, cor, [flowables])]. Cada seção começa em página nova, com a faixa."""
  doc = BaseDocTemplate(arquivo, pagesize=A4, leftMargin=MARG, rightMargin=MARG, topMargin=16 * mm, bottomMargin=16 * mm,
                        title=titulo, author='Casa do Pai João', subject=subtitulo)
  frame = Frame(MARG, 16 * mm, LARG, H - 32 * mm, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)

  def capa(c, d):
    c.saveState()
    c.setFillColor(cor_capa); c.rect(0, H * 0.42, W, H * 0.58, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont('Segoe-L', 14); c.drawString(MARG, H - 40 * mm, 'Sort Médiuns  ·  Casa do Pai João')
    c.setFont('Segoe-B', 34); y = H - 70 * mm
    for linha in titulo.split('\n'):
      c.drawString(MARG, y, linha); y -= 40
    c.setFont('Segoe', 15); c.drawString(MARG, y - 6, subtitulo)
    c.setFillColor(TINTA); c.setFont('Segoe-B', 13); c.drawString(MARG, H * 0.42 - 22 * mm, 'Para quem é este guia')
    c.setFont('Segoe', 12); c.setFillColor(CINZA)
    yy = H * 0.42 - 31 * mm
    for linha in publico:
      c.drawString(MARG, yy, linha); yy -= 17
    c.setFont('Segoe', 9); c.drawString(MARG, 14 * mm, rodape)
    c.restoreState()

  def pagina(c, d):
    c.saveState()
    c.setStrokeColor(LINHA); c.line(MARG, 12 * mm, W - MARG, 12 * mm)
    c.setFont('Segoe', 8.5); c.setFillColor(CINZA)
    c.drawString(MARG, 8 * mm, rodape)
    c.drawRightString(W - MARG, 8 * mm, f'página {d.page}')
    c.restoreState()

  doc.addPageTemplates([PageTemplate('capa', frames=[frame], onPage=capa), PageTemplate('corpo', frames=[frame], onPage=pagina)])
  story = [NextPageTemplate('corpo'), Spacer(1, 1), PageBreak()]
  # Sumário
  story.append(P('<b>Neste guia</b>', 'h3'))
  for i, (t, s, _, _) in enumerate(secoes):
    story.append(P(f'<font color="#2c4ea3"><b>{i + 1}.</b></font>&nbsp;&nbsp;<b>{t}</b>' + (f' <font color="#5b6678">— {s}</font>' if s else ''), 'sum'))
  story.append(Spacer(1, 10))
  story += sumario
  for i, (t, s, cor, corpo) in enumerate(secoes):
    story.append(PageBreak())
    story.append(secao(i + 1, t, s, cor))
    story.append(Spacer(1, 10))
    story += corpo
  # Confere se a fonte tem todos os caracteres usados (senão viram quadradinhos).
  import re
  cmap = pdfmetrics.getFont('Segoe').face.charToGlyph
  txt = re.sub(r'<[^>]+>', '', textos(story) + titulo + subtitulo + ''.join(publico) + rodape).replace('&nbsp;', ' ')
  faltam = sorted({ch for ch in txt if ord(ch) > 126 and ord(ch) not in cmap})
  if faltam: raise SystemExit(f'Caracteres sem glifo na fonte: {faltam}')
  doc.build(story)

def textos(story):
  """Todo o texto dos parágrafos (para conferir se a fonte tem todos os caracteres)."""
  out = []
  def vis(f):
    if isinstance(f, Paragraph): out.append(f.text)
    elif isinstance(f, Table):
      for row in f._cellvalues:
        for c in row:
          for x in (c if isinstance(c, list) else [c]): vis(x)
  for f in story: vis(f)
  return ''.join(out)
