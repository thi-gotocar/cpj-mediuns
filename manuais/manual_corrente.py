import sys
from manual_base import *

SAIDA = sys.argv[1]

entrar = bloco(
  P('O app da corrente funciona no navegador do celular (ou do computador). Não precisa baixar nada da loja de aplicativos.'),
  h3('Como entrar'),
  passos([
    'Abra o link do app que a administração mandou no grupo da corrente.',
    'No primeiro campo (onde normalmente vai o e-mail), escreva <b>cpj</b>.',
    'O segundo campo muda para <b>Seu nome</b>. Escreva o seu nome do jeito que ele está cadastrado na corrente.',
    f'Toque em {B("Entrar")}. Se aparecerem nomes parecidos, toque no seu.',
    'Se você criou uma senha, o app pede a senha (só números). Digite e pronto.',
  ]),
  caixa('dica', [
    'Deixe o app na tela inicial do celular, como se fosse um aplicativo:',
    '<b>Android (Chrome):</b> toque nos três pontinhos do navegador → <b>Adicionar à tela inicial</b> (ou <b>Instalar app</b>).',
    '<b>iPhone (Safari):</b> toque no botão de compartilhar → <b>Adicionar à Tela de Início</b>.',
  ]),
  h3('Criar a sua senha (opcional, mas recomendado)'),
  P(f'Enquanto você não tiver senha, aparece no topo o botão {B("Criar senha")}. Com a senha, ninguém consegue entrar no app com o seu nome.'),
  passos([
    f'Toque em {B("Criar senha")}.',
    'Escolha de <b>4 a 8 números</b> e digite de novo para confirmar.',
    'Pronto: daqui para frente o app pede essa senha toda vez que você entrar.',
  ]),
  caixa('atencao', 'Esqueceu a senha? Fale com a administração: ela consegue definir uma senha nova para você.'),
  KeepTogether(bloco(
    h3('As abas do app'),
    P('No alto da tela ficam as abas. Toque no nome da aba para trocar de tela.'),
    tabela(['Aba', 'Para que serve'], [
      ['<b>Gira</b>', 'Os eventos da semana, a sua função na gira, a escala e a sua presença no ano.'],
      ['<b>Perfil</b>', 'Os seus dados, as suas afinidades, os seus orixás e guias.'],
      ['<b>Oferendas</b>', 'Escolher o que você vai doar e acompanhar a sua oferenda.'],
      ['<b>Ervas</b>', 'Fazer o seu pedido na compra coletiva de ervas.'],
    ], [0.22, 0.78]),
    P(f'Para sair, toque em {B("Sair")}, no canto de cima.'),
  )),
)

gira = bloco(
  P('É a primeira tela do app. Os blocos aparecem sempre nesta ordem, de cima para baixo:'),
  tabela(['', 'Bloco', 'O que mostra'], [
    ['1', '<b>Eventos</b>', 'O que vem por aí na casa.'],
    ['2', '<b>Você nesta gira</b>', 'A sua função e com quem você trabalha.'],
    ['3', '<b>Sua presença no ano</b>', 'Quantas giras você foi neste ano.'],
    ['4', '<b>A gira</b>', 'Data, nome da gira, limpeza, quem está ausente e quem está de licença.'],
    ['5', '<b>A escala</b>', 'Todos os médiuns e cambones (depois de publicada).'],
  ], [0.07, 0.3, 0.63]),
  h3('1. Eventos'),
  P('Mostra as próximas giras (até 30 dias), os avisos e eventos da casa, o amaci da semana e os <b>aniversariantes da semana</b> (de domingo a sábado). O dia de hoje aparece destacado.'),
  h3('2. Você nesta gira'),
  P('Mostra o seu nome e a sua função. Antes do sorteio pode aparecer <b>“Possivelmente:”</b> antes da função, porque ela ainda pode mudar no dia (por exemplo, um médium de passe que vai cambonar). Quando a função do dia é diferente do cadastro, aparece <b>“hoje: …”</b> ao lado.'),
  P('Enquanto a escala não sai, aparece o aviso <b>“Sorteio de escala pendente da Michelle”</b>, com a data prevista. Depois que a escala é publicada, aparece com quem você trabalha:'),
  lista([
    '<b>Médium ou At. Extra:</b> o seu cambone (ou cambones) e o médium de passe, se houver.',
    '<b>Cambone:</b> o médium que você acompanha, o guia de atendimento dele, quem cambona junto e o médium de passe.',
    '<b>Médium de passe:</b> o médium com quem você vai e o cambone dele.',
    '<b>Limpeza:</b> “Hoje é sua turma de limpeza”; ou, se você faltou na sua turma na gira passada, que hoje você ajuda.',
    '<b>Outras situações:</b> de licença (com as datas), ausente, falta ou Suporte.',
  ]),
  h3('3. Sua presença no ano'),
  P('A porcentagem das giras do ano em que você esteve presente, com uma barra e a borda na cor da faixa:'),
  faixas_cor([
    (VERDE, 'Verde', '90% ou mais.'),
    (AMAR, 'Amarelo', 'de 50% a 89%.'),
    (VERM, 'Vermelho', 'abaixo de 50%.'),
  ]),
  P('Logo abaixo, a lista das suas faltas e ausências, com a data e a gira. <b>Licença e “Pendente” não entram na conta.</b>'),
  h3('4. A gira'),
  P(f'A data, o nome da gira (por exemplo, “Gira de Caboclo”) e o orixá. Use {B("‹ Gira anterior")}, {B("Próxima gira ›")} e o calendário para ver outras datas. Aqui também aparecem:'),
  lista([
    '<b>Limpeza</b> (borda laranja): a turma do dia e quem vai ajudar.',
    '<b>De licença</b> (borda vermelha): quem está de licença e até quando.',
  ]),
  h3('5. A escala'),
  P(f'Só aparece depois que a escala é publicada, com o título <b>“Sorteio realizado!”</b>. Toque em {B("Ver escala")} para ver cada médium com os seus cambones e passes, e quem faltou ou avisou ausência.'),
  caixa('dica', 'Se a escala ainda não apareceu, é porque ainda não foi publicada. Não precisa fazer nada: assim que sair, ela aparece aqui.'),
)

ausencia = bloco(
  P('Se você sabe que não vai conseguir ir numa gira, avise pelo app. Assim a escala já sai certa.'),
  h3('Passo a passo'),
  passos([
    f'Na aba <b>Gira</b>, vá até a data da gira (use {B("Próxima gira ›")} ou o calendário).',
    'No bloco <b>Você nesta gira</b>, em <b>Seu status</b>, troque <b>Pendente</b> por <b>Ausente</b>.',
    'Confirme na janela que aparece.',
  ]),
  caixa('atencao', [
    '<b>Só dá para avisar até a véspera</b> (o dia anterior à gira). No dia, só a Michelle altera.',
    'Só enquanto a Michelle ainda não marcou a sua presença.',
    'A gira precisa já estar criada no app.',
    '<b>Depois de confirmar, só a Michelle consegue mudar.</b>',
  ]),
  P('Quando aparece um cadeado com o motivo ao lado do status, não dá mais para mudar por aqui. Fale com a Michelle.'),
)

perfil = bloco(
  P('As suas informações ajudam a organizar a casa e deixam o sorteio mais justo. Os blocos começam fechados: <b>toque no título para abrir</b>.'),
  P('Ao lado do título de cada bloco aparece um selo:'),
  tabela(['Selo', 'Quer dizer'], [
    ['<font color="#9a6a10"><b>não preenchido</b></font>', 'Falta responder.'],
    ['<font color="#2c4ea3"><b>em andamento</b></font>', 'Você preencheu uma parte.'],
    ['<font color="#c2570c"><b>pendente oferenda de apresentação</b></font>', 'Tudo escolhido, mas falta marcar alguma oferenda.'],
    ['<font color="#24785a"><b>preenchido</b></font>', 'Tudo certo.'],
  ], [0.45, 0.55]),
  h3('Informações'),
  P('Nome, data de nascimento (dia/mês/ano), celular, e nome e telefone de alguém para contato. <b>Salva sozinho</b> enquanto você digita: aparece “Salvo”. A data de nascimento faz você aparecer nos aniversariantes da semana.'),
  h3('Afinidades (conforme a sua função)'),
  P('Aparecem os blocos <b>Atendimento extra</b> e/ou <b>Passe</b>. Marque as entidades com que você tem <b>100% de afinidade e segurança</b>. A opção <b>Todas</b> marca todas de uma vez.'),
  caixa('importante', [
    'Para quem é <b>At. Extra</b> ou <b>médium de passe</b>, as entidades marcadas valem para o sorteio:',
    'Na gira de uma entidade que você <b>não</b> marcou, você entra como <b>cambone</b>.',
    'Sem nenhuma marcada, você cambona em todas as giras com entidade.',
  ], 'Isso muda a sua função na gira'),
  h3('Orixás, guias e oferendas'),
  P('No mesmo bloco ficam os seus <b>Orixás</b> (de frente, ancestral e adjunto) e os seus <b>Guias</b> (chefe e de frente). Escolha cada um na lista. Quando a oferenda de apresentação já tiver sido feita, marque <b>Oferenda realizada</b> ao lado: ela fica verde, e o topo do bloco mostra quantas oferendas você já fez.'),
  h3('Guias de atendimento'),
  P('Escreva o nome do seu guia em cada linha. O cambone que trabalhar com você vê esse nome na escala.'),
  h3('Guias da corrente'),
  P('Uma lista com o guia chefe e o guia de frente de cada pessoa da corrente.'),
)

oferendas = bloco(
  P('Cada oferenda mostra a data, o título, o responsável e uma barra com a <b>porcentagem das doações</b>.'),
  lista([
    '<b>Seus compromissos:</b> logo no início, o que você se comprometeu a doar e quando entregar.',
    f'<b>Itens pendentes:</b> com a oferenda fechada, aparecem os itens que ainda faltam doadores (2 à vista; {B("Ver mais")} mostra os outros).',
    f'{B("Ver todos os itens")} abre a lista completa.',
  ]),
  h3('Como doar um item'),
  passos([
    'Encontre o item que você quer doar.',
    f'Em <b>Vou doar</b>, toque em {B("+")} uma vez para cada unidade. Para diminuir, toque em {B("−")} (voltar a 0 é desistir).',
    'Pronto: o seu nome aparece no item e em <b>Seus compromissos</b>.',
  ]),
  faixas_cor([
    (colors.HexColor('#e3b021'), 'Bolinha amarela', 'ainda faltam doadores.'),
    (colors.HexColor('#2f9e5b'), 'Bolinha verde', 'o item está completo.'),
  ]),
  P('Cada item diz quando entregar: <b>no dia do evento</b> ou numa data marcada.'),
  caixa('atencao', [
    'Quando a oferenda chega a <b>100%</b>, ainda dá para mudar por <b>1 dia</b>. Depois disso ela fecha: só o responsável altera.',
    'Oferenda <b>Bloqueada</b>: você vê a oferenda, mas sem a lista de itens.',
  ]),
  h3('Oferenda com uma linha para cada pessoa'),
  P('Em algumas oferendas, cada pessoa tem a própria linha, com duas situações:'),
  tabela(['', 'Situação'], [
    ['<b>Pagamento</b>', '<font color="#2c4ea3"><b>Pago</b></font> ou <font color="#a2423a"><b>Não pago</b></font>'],
    ['<b>Entrega</b>', '<font color="#24785a"><b>Entregue</b></font> ou <font color="#9a6a10"><b>Pendente</b></font>'],
  ], [0.3, 0.7]),
  P('Em <b>Seus compromissos</b> aparece a sua situação. No card, as barras de <b>Pagamento</b> e <b>Entrega</b> mostram a porcentagem da corrente; o <b>ícone de olho</b> ao lado de cada barra mostra quem ainda falta.'),
)

ervas = bloco(
  P('A casa faz uma compra coletiva de ervas e o valor é dividido entre quem pede.'),
  h3('Como pedir'),
  passos([
    'Abra a aba <b>Ervas</b>.',
    f'Em <b>Escolher ervas</b>, toque em {B("+")} nas ervas que quiser (e em {B("−")} para tirar).',
    'Embaixo, veja o resumo: o valor das ervas, o frete e o total.',
  ]),
  h3('Como o valor é dividido'),
  lista([
    'O custo de cada erva é dividido entre quem escolheu aquela erva, na proporção da quantidade. Se muita gente pedir, a casa compra mais porções e o custo sobe.',
    'O frete é dividido entre todos que pedirem.',
    'Por isso os valores mudam conforme mais pessoas pedem. O sinal <b>≈</b> quer dizer “aproximado”.',
    '<b>“preço a definir”</b>: a erva ainda está sem preço. O valor final sai quando a administração fechar os preços.',
  ]),
  caixa('atencao', 'Quando a lista é fechada, o pedido não pode mais ser alterado.'),
)

duvidas = bloco(
  tabela(['Pergunta', 'Resposta'], [
    ['Não encontro o meu nome ao entrar.', 'Escreva o nome como ele está cadastrado. Se mesmo assim não der, peça para a administração conferir o seu cadastro.'],
    ['Não vejo a escala.', 'Ela só aparece depois de publicada. Até lá aparece “Sorteio de escala pendente da Michelle”.'],
    ['Não consigo marcar Ausente.', 'Já é o dia da gira, ou a Michelle já marcou a sua presença, ou a gira ainda não foi criada. Fale com a Michelle.'],
    ['A minha função aparece diferente.', 'Na gira, a função do dia pode mudar (por exemplo, médium de passe que cambona). Aparece “hoje: …” ao lado.'],
    ['Esqueci a senha.', 'Fale com a administração: ela define uma senha nova.'],
    ['A minha presença no ano está errada.', 'Fale com a Michelle: a administração consegue corrigir o histórico.'],
  ], [0.36, 0.64]),
)

montar(SAIDA, 'Guia do App\nda Corrente', 'Tudo o que você precisa para usar o app, passo a passo',
       ['Quem faz parte da corrente e entra com a palavra-chave “cpj” e o próprio nome.',
        'Aqui você aprende a ver a sua função na gira, avisar ausência, preencher o perfil,',
        'participar das oferendas e pedir ervas.'],
       AZUL, legenda(), [
         ('Entrar no app', 'acesso, senha e as abas', AZUL, entrar),
         ('A aba Gira', 'a sua função, a escala e a sua presença', AZUL, gira),
         ('Avisar que não vai', 'como marcar ausência', AZUL, ausencia),
         ('O seu Perfil', 'dados, afinidades, orixás e guias', AZUL, perfil),
         ('Oferendas', 'escolher o que doar', AZUL, oferendas),
         ('Ervas', 'o pedido coletivo', AZUL, ervas),
         ('Dúvidas frequentes', None, AZUL, duvidas),
       ], 'Guia do App da Corrente  ·  Casa do Pai João')
print('ok', SAIDA)
