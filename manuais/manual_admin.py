import sys
from manual_base import *

SAIDA = sys.argv[1]
C = OURO

acesso = bloco(
  P('Este guia é para quem administra o app. <b>Tudo o que está no Guia da Corrente vale para você também</b>; aqui estão as funções a mais.'),
  h3('Entrar'),
  passos([
    'Abra o app e entre com o seu <b>e-mail</b> e a sua <b>senha</b>.',
    f'Para trocar a senha, use {B("Trocar senha")}, no fim da página. Para sair, {B("Sair")}, no canto de cima.',
  ], C),
  caixa('dica', 'Tudo o que tem <b>moldura dourada</b> no app é função de administração: a corrente não vê.', 'Moldura dourada = admin'),
  h3('Perfis de acesso'),
  P('Cada usuário tem um perfil. O perfil define quais abas a pessoa vê e quais ela pode alterar.'),
  tabela(['Perfil', 'O que pode'], [
    ['<b>Admin root</b>', 'Tudo, inclusive a aba Usuários (criar usuários e perfis) e corrigir o histórico.'],
    ['<b>Admin</b>', 'Ver e alterar todas as abas (menos Usuários).'],
    ['<b>Admin oferendas</b>', 'Alterar Oferendas e Alunos; ver o resto.'],
    ['<b>Admin ervas</b>', 'Alterar Ervas; ver o resto.'],
    ['<b>Usuário</b>', 'Ver a escala completa, Pessoas e Histórico, sem alterar.'],
    ['<b>Corrente</b>', 'O acesso “cpj” + nome: Gira, Perfil, Ervas e Oferendas.'],
  ], [0.28, 0.72], C),
  P('O Admin root pode mudar o que cada perfil vê e altera, aba por aba (veja a seção <b>Usuários</b>).'),
)

ciclo = bloco(
  P('O caminho de uma gira no app, do começo ao fim. Cada passo está explicado nas próximas seções.'),
  passos([
    '<b>Criar a gira</b> na data.',
    '<b>Escolher</b> a entidade do dia, o orixá e a turma da limpeza.',
    '<b>Marcar a presença</b>: Ausente antes do dia; Presente e Falta no dia.',
    'Olhar a <b>Sugestão Mi/Mãe Vê</b> e fazer as trocas do dia.',
    f'{B("Sortear")}.',
    '<b>Ajustar</b>, se precisar: Remanejar faltas, Ajuste manual ou Falta.',
    f'{B("Publicar escala")}: a corrente passa a ver.',
    f'Mandar no grupo pelo {B("WhatsApp")} (texto ou imagem).',
    f'{B("Encerrar gira")} e informar os atendimentos.',
  ], C),
  caixa('importante', [
    'Até você publicar, <b>só os admins veem o sorteio</b>. A corrente vê “Sorteio de escala pendente da Michelle”.',
    'Pode sortear, ajustar e conferir com calma antes de publicar.',
  ], 'Nada aparece para a corrente antes de publicar'),
)

criar = bloco(
  h3('Criar a gira'),
  passos([
    f'Na aba <b>Gira</b>, vá até a data: {B("Próxima gira ›")}, {B("‹ Gira anterior")} ou o calendário.',
    f'Se ainda não há gira nessa data, aparece “Nenhuma gira nesta data”. Toque em {B("+ Adicionar evento")}.',
    'A <b>turma da limpeza</b> já vem preenchida com a próxima do rodízio.',
  ], C),
  h3('Escolher a entidade, o orixá e a limpeza'),
  lista([
    '<b>Gira / entidade do dia:</b> escolha na lista.',
    '<b>Orixá:</b> aparece quando a gira pede.',
    '<b>Turma da limpeza:</b> dá para trocar. Quem faltou na turma da gira anterior entra para ajudar.',
  ]),
  caixa('importante', 'Escolha a entidade <b>antes de sortear</b>. É ela que define quem atua como At. Extra ou Passe e quem cambona (pelas entidades marcadas no cadastro de cada um).'),
  h3('Reiniciar'),
  P(f'O botão {B("Reiniciar")}, ao lado da data, volta a gira ao início: todos ficam Pendente e saem a entidade, o orixá, a turma da limpeza e o sorteio. Só a data fica. Ele pede confirmação.'),
)

presenca = bloco(
  P('O bloco <b>Presença</b> (moldura dourada) já vem aberto, com a contagem no título (pendentes, presentes, faltas…) e a <b>caixa amarela</b> para marcar uma pessoa de cada vez.'),
  h3('Marcar uma pessoa (caixa amarela)'),
  passos([
    'Toque em <b>&lt;escolha a pessoa&gt;</b> e escolha o nome.',
    'Ao lado aparecem dois campos: o <b>status</b> (Pendente, Presente, Falta, Ausente) e a <b>função do dia</b>. Eles já vêm com o que a pessoa tem hoje.',
    f'Toque no {B("OK")} verde.',
    f'Confira na janela e toque em {B("Confirmar")}. O campo volta para “&lt;escolha a pessoa&gt;”, pronto para a próxima.',
  ], C),
  h3('A lista completa'),
  P(f'{B("+ Ver lista")} abre todo mundo, separado por função, com os mesmos dois campos em cada pessoa. No dia, {B("todos presentes")} marca o grupo inteiro de uma vez.'),
  caixa('atencao', [
    '<b>Antes do dia:</b> só Pendente ou Ausente. Presente e Falta, só no dia da gira.',
    'Ao tirar alguém de Pendente, o app pede confirmação.',
    'Quem está de licença aparece com “de licença até …” e não muda.',
    'Para encerrar a gira, <b>ninguém pode ficar Pendente</b>.',
  ]),
  h3('Função do dia (segundo campo)'),
  P('Serve para mudar o que a pessoa faz <b>só nesta gira</b>, sem mexer no cadastro:'),
  tabela(['Função no cadastro', 'Pode fazer no dia'], [
    ['Cambone', 'Cambone, Passe, Senha, Suporte'],
    ['Médium de passe', 'Passe, Cambone, At. Extra, Suporte'],
    ['Senha', 'Senha, Cambone, Passe, Suporte'],
    ['At. Extra', 'At. Extra, Passe, Suporte, Não atende'],
    ['Médium', 'Médium, Suporte, Não atende'],
  ], [0.35, 0.65], C),
  P('<b>Não atende</b> = está na gira, mas cambona. O nome fica <b>amarelo</b> quando a pessoa está numa função diferente do cadastro.'),
  h3('O seu próprio status'),
  P('No bloco <b>Você nesta gira</b>, em <b>Seu status</b>, você muda a sua presença direto (até o sorteio).'),
  h3('Sugestão Mi/Mãe Vê'),
  P('No fim da aba Gira (moldura dourada). Para a entidade do dia, mostra:'),
  lista([
    '<b>PASSE:</b> cambones com afinidade de passe nessa entidade e At. Extra que <b>não</b> marcaram essa entidade.',
    '<b>ATENDIMENTO EXTRA:</b> médiuns de passe com afinidade de atendimento extra nessa entidade.',
    'Não entra quem está de licença, faltou ou está ausente.',
    'Os rótulos <b>Guia chefe</b> e <b>Guia de frente</b> (do Perfil) marcam quem tem o guia na linha da gira: dê preferência a essas pessoas.',
  ]),
  caixa('dica', 'Use a sugestão para decidir as trocas do dia (segundo campo da presença) <b>antes de sortear</b>.'),
)

sorteio = bloco(
  h3('Sortear'),
  P(f'No bloco <b>Sorteio de escala</b>, toque em {B("Sortear")} e confirme. O app monta as duplas na hora e o título ganha o 🎱.'),
  P(f'Para desfazer, toque no quadrado {B("↻")} no canto do bloco e confirme: todas as duplas são apagadas (também as fixadas), a escala deixa de ficar publicada e volta o botão {B("Sortear")}.'),
  h3('Como o sorteio decide'),
  lista([
    '<b>Recebem cambone:</b> médiuns e At. Extra presentes, na função do dia.',
    '<b>Cambonam:</b> os cambones, quem está “Não atende” e At. Extra ou Passe fora da entidade do dia.',
    '<b>Médiuns de passe</b> vão para os médiuns marcados com a estrela (“+ médium de passe”).',
    '<b>Rodízio justo:</b> evita repetir quem trabalhou junto há pouco tempo e na última gira.',
    '<b>Pendente conta como presente</b> no sorteio.',
  ]),
  h3('Ajustar depois do sorteio'),
  tabela(['Botão', 'O que faz'], [
    [B('Remanejar faltas'), 'Refaz só as duplas de quem faltou ou mudou de status. As outras ficam como estão. Pede confirmação.'],
    [B('Ajuste manual'), f'Acrescenta ou tira cambones e médiuns de passe de cada médium. Um médium pode ter mais de um cambone. Toque em {B("Concluir ajuste")} no fim.'],
    [B('Falta'), 'Ao lado de cada pessoa na escala: marca falta e refaz a escala (como o Remanejar), depois de confirmar.'],
  ], [0.3, 0.7], C),
  P('Avisos amarelos mostram duplas com problema (alguém que faltou) ou médiuns de passe sem médium.'),
  caixa('atencao', [
    'Não existe “sortear tudo de novo”. Para recomeçar do zero, use <b>Reiniciar</b> (apaga a presença e a entidade).',
    'Em gira <b>passada</b>, o ajuste manual fica sempre ligado, para registrar como foi.',
  ]),
  h3('Publicar a escala'),
  P(f'{B("Publicar escala")} libera o sorteio para toda a corrente. Depois aparece “Escala publicada: todos veem o sorteio”, com o botão {B("Ocultar")} para esconder de novo.'),
  h3('WhatsApp'),
  P(f'O botão {B("WhatsApp")} fica no card da gira, logo abaixo de {B("Encerrar gira")}. Ele fica apagado até existir sorteio. Ao tocar, o painel abre logo abaixo:'),
  lista([
    'Escolha o formato: <b>Lista</b> ou <b>Tabela</b>.',
    f'{B("Copiar")} o texto ou {B("Abrir no WhatsApp")}.',
    f'{B("Gerar imagem")} da escala e depois {B("Compartilhar")} ou {B("Salvar imagem")}.',
  ]),
)

encerrar = bloco(
  passos([
    f'Toque em {B("Encerrar gira")}, no card da gira. Se ainda houver alguém Pendente, o app avisa e leva até a pessoa.',
    'Informe quantas pessoas foram atendidas: <b>Preferencial</b>, <b>Normal</b> e <b>Passe</b> (pode ser 0).',
    f'Toque em {B("Encerrar")}.',
  ], C),
  lista([
    'Quem ia cambonar e ficou sem médium, e médium de passe sem médium, vão para o <b>Suporte</b>.',
    'Depois de encerrada, a escala não muda mais.',
    f'{B("Reabrir gira")} desfaz o encerramento (quem foi para o Suporte volta para a lista).',
    'A gira encerrada mostra o resumo: presentes, porcentagem e atendimentos.',
  ]),
)

pessoas = bloco(
  P('A lista <b>CORRENTE CPJ</b>, separada por função.'),
  h3('+ Adicionar'),
  tabela(['Opção', 'Como usar'], [
    ['<b>Pessoas</b>', 'Escolha a função e escreva o nome. Dá para cadastrar várias de uma vez, separando por vírgula. Para aluno, escolha a turma.'],
    ['<b>Licença</b>', 'Escolha a pessoa, o início, o fim e o motivo (opcional). Logo abaixo aparece o histórico de licenças dela, com Editar.'],
    ['<b>Curimba</b>', 'Entra nas turmas da limpeza, mas não conta presença nem falta e não entra no sorteio.'],
  ], [0.22, 0.78], C),
  caixa('atencao', 'Quem está de licença fica fora do sorteio e aparece como “de licença” na gira. A licença sai da lista sozinha depois da data final.'),
  h3('Editar uma pessoa'),
  P(f'Toque em {B("Editar")}. Dá para mudar o nome, a função, a turma da limpeza, “+ médium de passe” (estrela) e as entidades. <b>Só grava ao tocar em</b> {B("Salvar")}. {B("Excluir")} pede confirmação.'),
  caixa('importante', [
    '<b>Entidades do At. Extra e do Passe:</b> “Todas” = atua em todas as giras.',
    'Nenhuma marcada = não está apto a nenhuma e <b>cambona</b> em toda gira com entidade.',
  ]),
  h3('Alunos'),
  P('Bloco <b>Alunos</b>: os alunos por turma. Quem tem permissão cadastra alunos e turmas.'),
)

oferendas = bloco(
  h3('Criar uma oferenda'),
  passos([
    f'Toque em {B("+ Nova oferenda")}.',
    'Preencha o título, a data e o responsável.',
    'Se cada pessoa vai ter a própria linha (pagamento e entrega), marque <b>Uma linha para cada pessoa</b> e escolha de quais grupos vêm as pessoas (Médiuns, Extras, Passe, Cambones, Senha, Curimba, Alunos).',
    f'Toque em {B("Criar")}.',
  ], C),
  h3('Situação da oferenda'),
  tabela(['Botão', 'O que acontece'], [
    [B('Publicar'), 'A corrente passa a ver e doar. Depois fica “Publicado”.'],
    [B('Bloquear'), 'A corrente vê a oferenda, mas sem a lista de itens. Desbloquear volta.'],
    [B('Encerrar'), 'A oferenda sai da lista da corrente. Tocar de novo volta.'],
  ], [0.25, 0.75], C),
  caixa('atencao', 'Um dia depois de chegar a 100%, a oferenda fecha: só o responsável altera.'),
  h3('Oferenda com itens'),
  lista([
    f'{B("+ Adicionar item")}: nome, quantidade e entrega (no dia do evento ou numa data).',
    'Em cada item: os doadores com − / + / X, e <b>“+ doação por alguém”</b> para registrar a doação de outra pessoa (corrente ou aluno).',
    f'{B("Ok, entregue")} libera na data da entrega. Também tem {B("Editar")} e {B("Excluir")}.',
  ]),
  h3('Oferenda com uma linha para cada pessoa'),
  lista([
    'Não tem “+ Adicionar item”.',
    'Em cada pessoa: os campos <b>Pagamento</b> (Pago / Não pago) e <b>Entrega</b> (Pendente / Entregue), e o X para tirar da lista.',
    '<b>“+ adicionar pessoa do cadastro”</b>: coloca alguém da corrente ou um aluno. Quem tinha sido tirado volta.',
    f'{B("Incluir novos cadastrados")}: escolha de quais listas puxar e toque em {B("Confirmar")}. Só acrescenta; quem foi tirado continua fora.',
    'No card, as barras de <b>Pagamento</b> e <b>Entrega</b> mostram a porcentagem; o <b>ícone de olho</b> mostra quem falta.',
  ]),
  h3('Rodapé da oferenda'),
  P(f'Quatro botões lado a lado: {B("Compartilhar lista")} (texto, WhatsApp e imagem), {B("Compartilhar imagem")}, {B("Editar")} e {B("Excluir")}.'),
)

ervas_eventos = bloco(
  h3('Ervas'),
  tabela(['Bloco', 'Para que serve'], [
    ['<b>Compra</b>', f'Nome da gira e data do pedido, as porções e o preço da porção de cada erva (o preço pode ficar “a definir”; as porções sobem sozinhas quando os pedidos passam do que a porção serve) e o frete (abaixo da última erva; começa em R$ 60,00), com a tabela do pedido (erva, quantidade pedida pela corrente, quantidade do pedido, valor unitário, valor e total). Toque em {B("Editar")} para liberar os campos e em {B("Salvar")} para gravar; durante a edição, {B("Editar")} vira {B("Cancelar")}, que desfaz o que foi mexido. Também ficam aqui {B("Fechar lista")} (pede confirmação e já guarda a compra no Histórico de compras como “compra atual”, atualizada se você reabrir e fechar de novo; se já houver no histórico uma compra com o mesmo nome de gira e a mesma data, ela é atualizada em vez de repetir; fechada, ninguém altera mais nada, nem o admin, até tocar em {B("Reabrir lista")}), <b>Pedido ao fornecedor</b> e <b>Cobrança</b> (texto, planilha e imagem; a Cobrança libera quando todas as ervas pedidas têm preço) e {B("Nova compra")}: confirme em “Tem certeza?” (avisa do pedido em andamento) e escolha {B("Encerrar e guardar")} (vai para o Histórico de compras) ou {B("Descartar")}; os pedidos e as quantidades são apagados e a lista reabre.'],
    ['<b>Cadastro de ervas</b>', 'Cadastrar, renomear e excluir as ervas, e dizer quantas pessoas uma porção serve (em branco, uma porção atende todos).'],
    ['<b>Pedido para outra pessoa</b>', 'Para quem não usa o app, ou para corrigir um pedido.'],
    ['<b>Pedidos da corrente</b>', 'O pedido de cada pessoa (editar, excluir) e o total por erva.'],
    ['<b>Histórico de compras</b>', 'As compras encerradas, da mais nova. Cada uma aparece minimizada, com o nome da gira, a data, o valor, quando foi encerrada e quantas pessoas; toque nela para ver a tabela do pedido e a cobrança de cada pessoa.'],
  ], [0.3, 0.7], C),
  h3('Eventos'),
  passos([
    f'Na aba <b>Gira</b>, logo abaixo do bloco 📅 Eventos, fica o bloco dourado <b>🗓️ Eventos</b> (só o admin vê). Toque em {B("+ Cadastrar evento")}.',
    'Preencha a data (dia/mês), o tipo (<b>Gira</b>, <b>Amaci</b>, <b>Aviso</b> ou <b>Evento</b>) e o nome.',
    f'Toque em {B("Cadastrar")}. Em “Eventos cadastrados” dá para editar e excluir.',
  ], C),
  P('Na aba Gira, o bloco Eventos mostra: as giras até 30 dias antes; avisos e eventos, todos os futuros; o amaci, só na semana.'),
)

historico = bloco(
  lista([
    '<b>Giras salvas:</b> todas as giras, para consultar.',
    f'{B("+ Cadastrar gira antiga")}: cole a mensagem “RESUMO DO EVENTO” e o app preenche a data, as ausências e as faltas. Serve para giras que já passaram.',
    '<b>Estatísticas:</b> presença, giras com mais atendimentos, giras que mais tivemos e, do Perfil, o guia chefe, o guia de frente e o orixá de frente com mais pessoas (top 3, com o percentual do cadastro).',
    '<b>Quem já cambonou quem.</b>',
    '<b>Backup:</b> salva uma cópia dos dados em arquivo e restaura quando precisar.',
    '<b>Admin root:</b> corrige a presença de qualquer gira (mesmo encerrada) em Estatísticas.',
  ]),
)

perfil = bloco(
  P('No alto da aba Perfil, dentro da moldura dourada <b>ADMIN</b>:'),
  tabela(['Bloco', 'Para que serve'], [
    ['<b>Ajustes</b>', 'Escolha a pessoa e o que ver: <b>Orixás e guias</b>. O Admin root também tem <b>Entrada na corrente</b> (a pessoa só conta nas giras a partir dessa data) e <b>Senha</b> (define uma nova senha da corrente ou do e-mail).'],
    ['<b>Informações da corrente</b>', f'Ver e alterar os dados de qualquer pessoa. Grava no {B("Salvar")}.'],
    ['<b>Respostas</b>', 'Quantas pessoas já responderam o perfil, e quem ainda falta.'],
    ['<b>Oferendas pendentes</b>', 'Quem respondeu, mas ainda não fez a oferenda de algum orixá.'],
  ], [0.3, 0.7], C),
  h3('Usuários (só Admin root)'),
  lista([
    '<b>Perfis e acessos:</b> escolha o perfil e marque, em cada aba, se ele pode <b>Ver</b> e/ou <b>Editar</b>. Dá para criar perfis novos.',
    '<b>Novo usuário:</b> perfil, a pessoa da corrente, e-mail e senha inicial. Passe o e-mail e a senha para a pessoa; ela troca depois.',
    '<b>Quem tem acesso:</b> a lista de usuários, para alterar ou excluir.',
  ]),
  caixa('dica', 'Alguém da corrente esqueceu a senha? <b>Perfil → Ajustes</b> → escolha a pessoa → <b>Senha</b> → <b>Senha da corrente</b>.'),
)

duvidas = bloco(
  tabela(['Situação', 'O que fazer'], [
    ['O app não deixa encerrar.', 'Ainda há alguém Pendente. Marque Presente, Falta ou Ausente.'],
    ['A corrente não vê a escala.', 'Falta publicar: “Publicar escala”.'],
    ['O WhatsApp está apagado.', 'Falta sortear.'],
    ['Alguém não consegue marcar Ausente.', 'Passou da véspera, ou você já marcou a presença dela. Marque você na caixa amarela.'],
    ['Quero refazer o sorteio.', 'Use Remanejar faltas ou Ajuste manual. Do zero, só com Reiniciar.'],
    ['Uma pessoa está cambonando e não devia.', 'Confira as entidades dela em Pessoas → Editar, ou mude a função do dia na presença.'],
    ['Presença errada numa gira antiga.', 'O Admin root corrige em Histórico → Estatísticas.'],
  ], [0.36, 0.64], C),
)

montar(SAIDA, 'Guia do\nAdministrador', 'Como montar a escala e cuidar da corrente no app',
       ['Quem administra o app: monta a escala da gira, cuida do cadastro da corrente,',
        'das oferendas, das ervas, dos eventos e dos acessos.',
        'Para o dia a dia da corrente, veja também o Guia do App da Corrente.'],
       C, legenda(), [
         ('Acesso e perfis', 'quem pode o quê', C, acesso),
         ('O ciclo da gira', 'o caminho do começo ao fim', C, ciclo),
         ('Criar a gira', 'data, entidade, orixá e limpeza', C, criar),
         ('Presença', 'caixa amarela, lista e função do dia', C, presenca),
         ('Sorteio, publicação e WhatsApp', None, C, sorteio),
         ('Encerrar a gira', 'atendimentos e Suporte', C, encerrar),
         ('Pessoas', 'cadastro, licenças e curimba', C, pessoas),
         ('Oferendas', 'criar, itens e lista por pessoa', C, oferendas),
         ('Ervas e Eventos', None, C, ervas_eventos),
         ('Histórico', 'giras, estatísticas e backup', C, historico),
         ('Perfil (admin) e Usuários', None, C, perfil),
         ('Dúvidas frequentes', None, C, duvidas),
       ], 'Guia do Administrador  ·  Casa do Pai João')
print('ok', SAIDA)
