# Arquitetura

Visão geral e decisões. Detalhes (arquivos, colunas, funções SQL) ficam no código — este doc diz onde procurar.

## Stack e por quê

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + **ES modules sem framework e sem bundler**. PWA. **Modo escuro fixo para todos** (`data-theme="dark"` no `<html>`); a paleta clara continua no CSS, mas não é usada. |
| Backend | **Funções serverless da Vercel** (Node ≥ 20, ESM) em `api/`. |
| Banco | **Postgres da Vercel (Neon)**, SQL via HTTP. A lógica de dados fica em **funções SQL `jsonb`** chamadas por `db.rpc(nome, params)`. |
| Regras | `shared/` — o mesmo código roda no navegador e no backend. |
| Fotos | **Cloudflare R2** (bucket privado), pela API do S3 com a assinatura feita em `api/_lib/r2.js`. |
| npm | **Zero dependências.** Não adicionar pacotes. |

Tudo isso para caber no plano gratuito (Vercel Hobby + Neon) e não ter dependência para manter.

### Limites do plano

- **Vercel Hobby: máximo 12 funções.** Cada arquivo em `api/` fora de `_lib/` é uma função. Sortear e Remanejar faltas eram arquivos próprios e viraram `acao` da rota da gira para abrir 2 vagas; as vagas ficam guardadas, então não criar arquivo novo ali sem combinar: funcionalidade nova entra como `acao` / `?lista=` num arquivo existente.
- **Rota que vira ação continua respondendo.** Um aparelho pode estar uma versão atrás e chamar a rota antiga; o `rewrites` do `vercel.json` leva a rota antiga para a nova (ex.: `/api/giras/:data/sortear` → `/api/giras/:data?acao=sortear`, sem corpo). O `npm run dev` e os testes aplicam os mesmos rewrites (`scripts/servidor.js`).
- Logs de runtime da Vercel guardam só ~1 hora.

## Onde fica cada coisa

| Pasta | Papel |
|---|---|
| `frontend/js/telas/` | Uma tela por aba (ver padrão em [como-trabalhamos.md](como-trabalhamos.md)); a aba Gira separa composição e ações em `gira.js`, blocos informativos em `giraInformacoes.js` e outras peças em `gira*.js` (topo, "Você nesta gira", Sugestão e componentes comuns) |
| `frontend/js/` | `main.js` (boot, abas, roteamento de eventos), `estado.js` (estado + chamadas à API), exportação para WhatsApp (texto e PNG) |
| `api/` | Endpoints; `api/_lib/` tem banco, sessão/permissão, senhas, HTTP, `escala.js` (esconde escala não publicada) e a lógica que sai dos arquivos de rota grandes (`videos.js`, `oracoes.js`, `fotos.js`, usados por `api/giras`) |
| `db/esquema.js` | `VERSAO` + lista `MIGRACOES`: todas as tabelas e funções SQL |
| `shared/` | Regras de negócio: `regras.js` (sorteio, remanejar, encerrar, trocas do dia, sugestões), `permissoes.js`, `perfil.js`, eventos, oferendas, ervas, resumos |
| `scripts/` | Servidor local (`npm run dev`) e build |
| `test/` | Testes com Postgres local |

## Fluxo de dados

```mermaid
flowchart LR
    subgraph Navegador
      UI[telas/*.js render + data-act] --> ST[estado.js]
      ST --> AP[api.js fetch + token]
      SH1[shared/*.js] --- UI
    end
    AP -->|HTTPS JSON| VF
    subgraph Vercel
      VF[funções api/*] --> SE[_lib/sessao.js exigir permissão]
      SE --> RG[shared/regras.js sorteio, remanejar, encerrar]
      VF --> ES[_lib/escala.js ocultarSorteio]
      VF --> DB[_lib/db.js rpc + migração]
    end
    DB -->|SQL via HTTP| PG[(Neon Postgres funções jsonb)]
    PG -->|jsonb| DB
    VF -->|JSON| AP
```

O app abre só com o código da aba Geral; as outras abas são baixadas ao abrir (`SOB_DEMANDA` em `main.js`). O build pré-carrega os módulos da abertura e gera o `sw.js`, que guarda no aparelho os arquivos do app (nunca o que vem de `/api`). Sem rede, a estrutura do app abre, mas os dados continuam dependendo da conexão. A cada abertura, refresh ou volta do segundo plano (no máximo uma vez por minuto), o app pergunta ao servidor se há versão nova. Cada arquivo leva no `sw.js` a marca do próprio conteúdo: a versão nova baixa só os que mudaram (os iguais vêm do cache que o aparelho já tem; 6 downloads por vez) e fica **esperando pronta**. Ela só assume quando a própria página pede e recarrega em seguida, para a página aberta nunca misturar arquivos de duas versões (antes ela assumia no meio do uso e as abas ainda não abertas vinham da versão nova). Não depende de fechar o app (no iPhone, muita gente nunca fecha): ao abrir, ao voltar do segundo plano e quando a versão termina de baixar, a página troca e recarrega sozinha se a pessoa não mexeu em nada e não há o que salvar; senão aparece o aviso **Nova versão disponível · Atualizar**. Aparelho com o cache do formato anterior (sem as marcas) troca sozinho, como antes, porque o app antigo não sabe pedir. Se uma aba não carregar por ter vindo de versão mais nova que a página aberta, a página recarrega. A versão instalada aparece no fim da tela. Por isso um aparelho pode ficar uma versão atrás: a API precisa continuar aceitando o frontend anterior.

A abertura do app e a atualização ao voltar para ele usam um pedido só (`/api/auth/inicio`): uma conferência de sessão e **uma** consulta ao banco (`inicio_dados`), que devolve todas as listas e o que decide as abas, em vez de uma ida ao Neon por lista. Junto vem uma **versão dos dados** (contador que gatilhos sobem a cada linha gravada nas tabelas da abertura, mais o dia e quantas orações já venceram, para o que vence com o tempo). A chave `asaas2_atualizado` de `sistema` não sobe o contador: a leitura dos atrasos a grava até a cada 10 min e fazia todo mundo baixar tudo de novo. Antes a versão levava a hora, o que forçava um download completo por pessoa a cada hora. Coisa nova gravada com frequência em `sistema` (ou numa tabela com o gatilho) precisa entrar nessa exceção. Ao voltar ao app, ele manda a versão que tem; sem mudança, a resposta é só `{ semMudanca }` e nada é baixado de novo. Oferendas, ervas, Iemanjá e relatos ficam fora da versão; na volta ao app, só a aba Oferendas busca as dela de novo (os blocos de relatos, atrasos, ervas e compromissos de Geral e Gira vêm na abertura do app). As rotas de cada lista continuam para recarregar só uma parte.

**Neon: o que gasta é acordar o banco.** O plano grátis tem 100 CU-horas por mês, e o banco desliga 5 min depois do último pedido. Então o custo não é o número de consultas, e sim quantas vezes ao longo do dia algum pedido o acorda: cada acordada vale pelo menos 5 min ligado. Por isso a volta ao app busca no máximo a cada 5 min (antes, 15 s: trocar de app no celular acordava o banco toda hora) e nada roda sozinho em intervalo. Pedido automático novo (sem a pessoa pedir) deve pegar carona num que já vai ao banco, como as visitas abaixo.

**Ver como (root).** Na visão CPJ, Alunos ou Curimba, o root escolhe uma pessoa e o frontend manda o cabeçalho `X-Ver-Como: p:<pessoa>` ou `a:<aluno>` em todo pedido (`api.js`). `exigir` (`api/_lib/sessao.js`) só aceita o cabeçalho de quem tem `usuarios:gerenciar`: monta a pessoa como se ela tivesse entrado (as permissões dela) e recusa todo método que não seja GET. No frontend, `estado.me` vira o da pessoa e o do root fica em `estado.meRoot`, então as telas não precisam saber do modo.

**ASAAS: duas contas.** A conta A (`ASAAS_*`) recebe o Pix das Compras; a conta B (`ASAAS2_*`) tem as mensalidades e doações e, desde a v142, o Pix dos itens de doação das Compras. Cada cobrança (`asaas_cobrancas.conta`) e cada cliente (`asaas_clientes`, por pessoa e conta) sabe de qual conta é; o webhook de cada conta tem a própria URL (`?webhook=asaas` e `?webhook=asaas2`) e o próprio token, e confere o pagamento na conta certa antes de marcar como pago.

**Modo demonstração.** O login `teste@cpj.com` / `12345678` serve para apresentar o produto: `auth.js` reconhece o e-mail sem ir ao backend e guarda um token próprio; com ele, `api.js` desvia toda chamada para `frontend/js/demo.js`, que responde no próprio navegador com dados inventados, em memória (recarregar volta ao início). O usuário é Admin root, então vê todas as abas. A escala funciona de verdade (presença, sortear, remanejar, publicar, encerrar), com as mesmas regras de `shared/regras.js`; a aba Compras e a aba ASAAS também (`frontend/js/demoCompras.js`): Pedir gera um link Pix de mentira (QR desenhado no navegador) e o "Já paguei, atualizar" faz o papel do webhook do ASAAS, marcando como pago e registrando o evento; para isso o botão manda `&conferir=1`, que o backend ignora. Também têm exemplo a Oferenda de Iemanjá (a pessoa de teste num grupo, com itens assumidos, que aparecem em Seus compromissos), o Amaci (um orixá, Pai Oxalá, com o texto literal de `amaciDados.js` copiado para a demo: esse trecho fica legível no código público) e a Transparência (na visão da corrente, sem editar). As outras gravações respondem "Modo demonstração: esta ação não é salva."; a Anamnese do Perfil e os blocos do Admin root não abrem na demo (`emDemo()` em `perfil.js` e `usuarios.js`). Nada chega ao banco: o backend nem conhece esse login.

**Retrato do que foi encerrado.** Gira, oferenda e Oferenda de Iemanjá guardam ids, e o resto (nome, função, licença…) vinha do cadastro na hora de mostrar. Ao encerrar, gravam um retrato: `giras.retrato` (`shared/regras.js` `retratoDaGira`, gravado por `gira_retrato`; reabrir apaga), `oferendas.retrato` (nomes por chave `p:`/`a:`/chave da doação, em `oferenda_status`) e `iemanja_grupos.responsavel_nome` (trigger ao encerrar). Nas regras, `daGira`/`presencaDe`/`papelDe`/`funcaoNaGira` leem a pessoa do retrato quando a gira está encerrada, então as telas não precisam saber dele; quem percorre pessoa por pessoa usa `naGira`. Como todas as giras vão na abertura, a lista manda o retrato **compacto** (`compactarRetratos`: só o que difere do cadastro que vai junto) e o app completa ao receber (`expandirRetrato` em `definirGiras`). Com o histórico no retrato, presença, duplas e linhas de oferenda não têm mais chave estrangeira para o cadastro, e `apagar_excluidos()` apaga de vez quem foi excluído e não está em nada aberto.

## Entidades

Só as relações. Colunas: `db/esquema.js`. O significado dos campos de negócio (`linhas`, `experiente`, `papeis`, status de presença) está em [regras.md](regras.md).

```mermaid
erDiagram
    USUARIOS }o--|| PERFIS : papel
    USUARIOS |o--o| PESSOAS : pessoa_id
    PESSOAS ||--o{ LICENCAS : tem
    PESSOAS ||--o{ PRESENCAS : marca
    GIRAS ||--o{ PRESENCAS : registra
    GIRAS ||--o{ DUPLAS : escala
    PESSOAS ||--o{ DUPLAS : "medium_id / pessoa_id"
    TURMAS_ALUNOS ||--o{ ALUNOS : agrupa
    OFERENDAS ||--o{ OFERENDA_ITENS : itens
    OFERENDA_ITENS ||--o{ OFERENDA_DOACOES : doacoes
    OFERENDAS ||--o{ OFERENDA_MEDIUNS : por_medium
    PESSOAS ||--o{ OFERENDA_MEDIUNS : participa
    OFERENDAS ||--o{ OFERENDA_ALUNOS : por_aluno
    ALUNOS ||--o{ OFERENDA_ALUNOS : participa
    ERVAS ||--o{ ERVAS_ESCOLHAS : pedidos
    PESSOAS |o--o{ CURIMBA_ALUNOS : "pessoa_id (nulo = de fora)"
    CURIMBA_AULAS ||--o{ CURIMBA_PRESENCAS : registra
    CURIMBA_ALUNOS ||--o{ CURIMBA_PRESENCAS : marca
```

A curimba (aba Curimba) tem tabelas próprias, sem ligação com `giras`/`presencas`: é um controle à parte. A API fica em `api/pessoas` (`?lista=curimba`, `?lista=minhaCurimba` e ações `curimba*`), para não criar função nova.

As fotos (aba Fotos) ficam em `fotos_albuns` → `fotos` no banco (só os dados); os arquivos ficam no **Cloudflare R2**. Por quê: o Neon gratuito tem 1 GB para o app todo (fotos encheriam o banco e derrubariam o resto) e o R2 dá 10 GB grátis sem cobrar o download. O bucket é **privado**: a foto sobe pelo servidor (base64 no JSON, abaixo do limite de 4,5 MB da Vercel; o navegador reduz antes) e é mostrada por **link assinado** que vale 12 h. A data da assinatura é arredondada a blocos de 6 h para o link não mudar a cada consulta (o navegador reaproveita a foto já baixada). A API fica em `api/giras` (`?lista=fotos` e ações `foto*`).

A escala colada em texto (Histórico → Cadastrar escala) é lida no navegador (`shared/escalaTexto.js`) e gravada por `POST /api/giras/:data` com `acao: 'escala'`, que só grava em gira já salva (mesmo encerrada) e só troca duplas e função do dia — nunca cria gira nem presença.

A foto de cada pessoa (aba Perfil) fica no próprio banco (`pessoas_fotos`, JPEG em base64 de uns 25 KB): é pequena e não depende do R2 das fotos dos álbuns. Quem está logado vê (a aba Gira mostra a foto de com quem cada um trabalha); trocar ou tirar, só a própria pessoa e o admin do perfil (`/api/auth/foto`).

Os pedidos de guias (aba Compras) ficam em `guias_grupos` → `guias_itens` e `guias_pedidos` (número sequencial) → `guias_linhas`. A linha guarda descrição e valor da hora do pedido e só aponta para o item (`item_id`, nulo se o item for excluído), para o pedido não mudar depois. A foto do item é JPEG pequeno em base64 no próprio banco, como a do Perfil. A API fica em `api/oferendas` (`?lista=guias` e `acao: 'guias'`, lógica em `api/_lib/guias.js`), para não criar função nova.

A aba Amaci guarda no banco só o que o admin muda: `amaci_turmas` (orixás liberados por turma de alunos) e `amaci_orientacoes` (texto por orixá). O conteúdo da apostila fica em `api/_lib/amaciDados.js`, **no servidor e não em `shared/`**, para a API mandar ao aluno só os orixás da turma dele; os desenhos dos pontos riscados ficam em `frontend/img/amaci/`. A API fica em `api/pessoas` (`?lista=amaci` e `acao: 'amaci'`, lógica em `api/_lib/amaci.js`).

A aba **Diário** guarda um registro por pessoa e por dia em `diario` (chave da pessoa como nas ervas: `p:`, `a:`, `u:`; os dados do dia num `jsonb`). Os campos e a validação ficam em `shared/diario.js` (`normalizarDia`), usado pela tela e pelo servidor, que limpa tudo antes de gravar. A chave vem **sempre da sessão**: não existe rota para ler o diário de outra pessoa, e o "Ver como" do root é recusado, porque o conteúdo é íntimo. Gatilhos apagam o diário quando a pessoa, o aluno ou o usuário é apagado de vez. A visibilidade é `sistema.diario_publicada` (como a Transparência) e vem na abertura do app. A fase da lua é calculada no navegador (elongação Lua–Sol), sem serviço externo; o ditado usa a Web Speech API do navegador, quando existe. A API fica em `api/pessoas` (`?lista=diario` e `acao: 'diario'`, lógica em `api/_lib/diario.js`), para não criar função nova. A **Galeria de fotos** do Diário guarda as fotos **no banco** (`diario_fotos`, JPEG em base64 reduzido no aparelho, uma por pessoa) e não no R2, que segue desligado; são poucas e duram uma semana. A foto sai por `?lista=diarioFoto&id=` sem sessão (o `<img>` não manda o token; o id é sorteado), como as fotos das Compras. A limpeza de terça não usa agendamento: `diario_fotos_limpar` roda a cada leitura e envio e apaga o que é de antes da última terça 0h de Brasília. A versão de cada foto (o `v` do link, que deixa o navegador guardar a imagem) é uma coluna gerada, como nas Compras: calcular o md5 na listagem fazia o banco ler todas as fotos a cada abertura da galeria.

Quem entrou em cada aba fica em `visitas_abas`: uma linha por pessoa (mesma chave `p:`/`a:`/`u:`), aba e dia, com `vezes` e a `ultima` hora; cada registro novo apaga o que passou de 3 dias, então a tabela fica pequena. Ao desenhar a aba, o app só anota no aparelho (`localStorage`, junto com o fim do token, para não passar para quem entrar depois); as abas anotadas vão de carona no próximo `/api/auth/inicio` (`?visitas=`, na abertura ou na volta ao app), sem um pedido só para isso. Por isso a visita aparece com atraso e conta no dia em que chega; o aluno só manda ao abrir o app. `POST /api/auth/visita` continua para o aparelho uma versão atrás. O root lê em `GET /api/usuarios?lista=visitas`; o nome e o grupo saem do cadastro na hora da leitura. Nenhuma função nova na Vercel.

Os vídeos (aba Vídeos) ficam na tabela `videos`, sem ligação com `giras`/`eventos` (o evento é texto livre). A API fica em `api/giras` (`?lista=videos` e ações `video`/`excluirVideo`).

O **Pix da aba Compras** (ASAAS) segue confiança zero no navegador. O app nunca fala com o ASAAS e nunca manda valor: o **Pedir** (ou "gerar link do pedido nº N") só diz o item e a quantidade; o backend pega a pessoa da sessão, soma as linhas dela no banco (`asaas_cobranca_reservar`, que já prende as linhas na cobrança para um toque duplo não gerar dois Pix), cria a cobrança Pix no ASAAS e guarda link e QR. Se o ASAAS recusar, a reserva é desfeita, mas o pedido fica: a linha sem link pode gerar outro depois. **Só o webhook marca como pago**, e só depois de um `GET /payments/:id` no ASAAS confirmar situação e valor: o corpo do aviso sozinho não libera nada. Tudo fica em `api/oferendas` (`POST ?webhook=asaas`, `?lista=asaas`, `acao: 'asaas'` e `op: 'pix'` das Compras; lógica em `api/_lib/asaas.js`), para não criar função nova.

Link do Pix sem repetir: a cobrança nasce como reserva (`criando`) e o id dela vai como `externalReference` no ASAAS. Quando o ASAAS não responde, a reserva **não** é apagada (o ASAAS pode ter criado a cobrança); ela só se resolve buscando `GET /payments?externalReference=` — na hora, na próxima tentativa da pessoa ou ao abrir a aba, e só depois de 20 s (mais que o `maxDuration` de 15 s, para não pegar um pedido em andamento). O webhook também acha a reserva pela referência. Antes, a reserva era apagada e a pessoa gerava um segundo link, deixando a primeira cobrança solta no ASAAS.

Redesenho e o que foi digitado: a tela é redesenhada inteira (inclusive sozinha, ao voltar para o app, quando chega atualização do servidor). Formulário com `data-rascunho` guarda os campos que a pessoa mudou e ainda não salvou e devolve depois do redesenho (`guardarRascunhos`/`devolverRascunhos` em `frontend/js/util.js`), se for o mesmo formulário do mesmo registro (`data-id`). Formulário novo de cadastro/edição deve ter `data-rascunho`; o que fica aberto depois de salvar precisa de `form.reset()` para não devolver o que já foi salvo. Algumas telas mais antigas guardam o rascunho no próprio estado (Perfil, Compras, Amaci).

Dados dos alunos: o CPF do aluno fica cifrado em `alunos_cpf` (mesma chave e formato do da corrente, com o id do aluno como dado autenticado) e com um **hash** (HMAC da `CPF_CHAVE`). A leitura dos atrasos do ASAAS guarda o hash do CPF de cada cliente (`asaas2_atrasos.cpf_hash`), e `atrasos_validos()` liga atraso e aluno pelo hash na hora de ler — por isso a pendência aparece logo que o CPF é salvo, sem decifrar nada no banco e sem nova consulta ao ASAAS. A lógica fica em `api/_lib/alunos.js`.

Aba Compras leve: a foto do item continua guardada no banco (base64), mas não vai mais na resposta da aba — vai só a versão (`fotoV`, um pedaço do md5), e a imagem vem por `GET /api/oferendas?lista=guiaFoto&id=&v=`, com cache longo (o endereço muda quando a foto muda). Essa rota não pede sessão porque a tag `<img>` não manda o token; o id do item não dá para adivinhar e a foto é só a do produto. A abertura da aba lê tudo numa ida só ao banco (`guias_tela`); só volta ao banco e ao ASAAS quando há um link sem resposta para conferir. Antes eram 6 a 7 idas e todas as fotos a cada abertura e a cada ação. A versão da foto fica numa coluna gerada (`guias_itens.foto_v`), calculada só quando a foto muda: calcular o md5 na consulta fazia o banco ler todas as fotos a cada abertura. Quem não administra recebe do banco só os próprios pedidos e linhas (`guias_estado` com a `chave`), não o histórico de todos, que cresce a cada pedido; o admin continua recebendo tudo.

Abas que abrem na hora: ao voltar a uma aba (Oferendas, Ervas, Compras, ASAAS, Amaci, Transparência do mês atual, Perfil, Curimba, Vídeos, Admin root e o orixá de cabeça da Gira e do Histórico), ela mostra o que já está no aparelho e busca de novo por trás (`atualizarAoAbrir` em `estado.js`); só a primeira abertura mostra "Carregando". A resposta de trás só entra se ninguém mudou os dados enquanto isso (uma ação na tela, como doar ou salvar, já trouxe a versão mais nova; no pedido de ervas, a escolha que ainda vai ser salva) e se ainda é a mesma sessão; se a busca falhar, a tela continua com o que tinha. Fotos continua buscando do zero (os links das fotos expiram).

Menos idas ao banco em fila: na abertura do app, "a Transparência está visível?" vai junto com as listas, e o aluno busca as listas e o "me" ao mesmo tempo; a lista de alunos e os dados/pendências (de quem edita) vão juntos; o Admin root abre com uma chamada só (`/api/usuarios?lista=tudo`, no lugar de três, cada uma conferindo a sessão).

Aba Oferendas mais rápida: No servidor, a leitura das oferendas e a das sub-abas vão ao banco ao mesmo tempo, e o nome de quem doou é buscado pelo id da chave (`u:`, `p:`, `a:`), usando o índice, em vez de comparar texto, que obrigava o banco a percorrer usuários, pessoas e alunos a cada doação (v132). O que ainda pesa: a resposta traz todas as oferendas desde o início, inclusive as encerradas, com as listas completas; se continuar lento, o próximo passo é mandar as encerradas antigas só quando o admin abrir as anteriores.

Compras por grupo: o número do pedido continua único (`guias_pedidos`), e `guias_pedido_grupos` diz quais grupos cada pedido atende e quando cada um encerrou. Assim o pedido que já existia quando a regra mudou atende todos os grupos sem renumerar nada (os links do ASAAS e o histórico citam o número). A linha guarda o `grupo_id` porque o item pode ser excluído.

O webhook é a única rota sem sessão: quem prova a origem é o token do cabeçalho `asaas-access-token`, comparado com `ASAAS_WEBHOOK_TOKEN` antes de tocar no banco; sem a variável, a rota recusa tudo. O evento é gravado em `asaas_eventos` com o id do evento como chave, porque o ASAAS reenvia até receber 200: o repetido não faz nada. Se a conferência no ASAAS falhar, o evento não é gravado e a rota devolve erro, para o ASAAS reenviar. As chaves ficam só nas variáveis da Vercel (sem `ASAAS_API_URL`, usa o sandbox); o CPF vai direto para o ASAAS e o app guarda só o id do cliente (`asaas_clientes`). Contra excesso de cobranças, um limite simples no banco (20 links por pessoa por hora), sem serviço externo.

O **CPF do Perfil** fica fora do `perfil` (jsonb), na tabela `pessoas_cpf`, para nunca sair nas listas de perfis, no backup nem para o admin do Perfil. O backend cifra com AES-256-GCM (`node:crypto`, `api/_lib/cpf.js`) usando a chave da variável `CPF_CHAVE` (32 letras ou mais), que fica só na Vercel: quem tiver o banco ou um dump não lê o número. O id da pessoa entra como dado autenticado, então o texto cifrado de uma pessoa não abre na linha de outra. Sem a variável, a rota recusa (503). A leitura devolve só o número mascarado; o inteiro só com `ver=1`, quando a pessoa toca em Mostrar, e não fica no `estado` do frontend. Rota em `api/auth/cpf` (o `[acao]` que já existe), sem função nova. Trocar a `CPF_CHAVE` torna ilegíveis os CPFs já guardados.

Os **pagamentos em atraso** vêm de uma **segunda conta do ASAAS** (conta B, variáveis `ASAAS2_*`), separada da conta das Compras: `chamarAsaas(prefixo, …)` em `api/_lib/asaas.js` serve às duas, mudando só o prefixo das variáveis. As cobranças da conta B nascem fora do app, então não há webhook: `api/_lib/atrasos.js` lista as vencidas (`status=OVERDUE`) e os clientes delas, decifra em memória os CPFs do Perfil para ligar cliente e pessoa, e guarda o resultado em `asaas2_atrasos`, trocado inteiro a cada leitura. A leitura vale 10 minutos, para a aba Geral não chamar o ASAAS a cada abertura. A tela da pessoa recebe só as próprias linhas, sem nome nem telefone. Rota em `api/giras` (`?lista=atrasos`), sem função nova.

O **Painel da Transparência** guarda só o que é digitado: a configuração em `sistema` (chave `transparencia`, com os campos de débito e de crédito; o que faltar vale o padrão de `api/_lib/transparencia.js`) e os valores por mês (débitos, créditos digitados e aporte, por nome do campo) em `transparencia_meses` (mês sem linha herda o último anterior, para não precisar lançar todo mês). Os créditos vêm da conta B do ASAAS, lidos por mês (cobranças por vencimento e por data de pagamento) e guardados em `transparencia_asaas` (relidos no máximo 1 vez por dia, para não chamar o ASAAS a cada abertura); num pedido só, lê no máximo 3 meses, por causa do limite de 15 s da Vercel. A rota fica em `api/giras` (`?lista=transparencia` e `acao: 'transparencia'`, lógica em `api/_lib/transparencia.js`), sem função nova.

Outras tabelas: `sistema` (chave/valor: segredo de sessão, marcadores de migração), `login_falhas`, `eventos`.

O tipo do evento aponta para `eventos_tipos` pela `chave`, que nunca muda (renomear muda só o nome; os tipos novos ganham uma chave gerada). Os quatro de sempre mantêm as chaves antigas porque o frontend usa `gira` e `amaci` no prazo do card 📅 Eventos e nas cores do selo. Quem vê qual tipo é decidido no banco (`eventos_listar` com `aluno`/`turmaId`), por `api/_lib/eventos.js`, usado tanto em `?lista=eventos` quanto na abertura do app.
