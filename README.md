# Sort Médiuns

Escala da gira: cadastro da corrente, presença, entidade do dia, sorteio de cambones e médiuns de passe com rodízio, remanejamento de faltas e exportação para o WhatsApp (texto e imagem).

Frontend e backend separados, no mesmo repositório e no mesmo projeto da Vercel. Dados no **Postgres da própria Vercel** (Neon, pela aba Storage). Login próprio, com perfis admin e usuário. **Sem dependências npm.**

## Estrutura

```
frontend/              Site (HTML, CSS e módulos JS que o navegador carrega direto)
  js/main.js           instalação, login, abas e eventos
  js/auth.js           login e sessão
  js/api.js            cliente do backend
  js/estado.js         estado da tela e chamadas à API
  js/exportar.js       texto para o WhatsApp
  js/imagem.js         imagem PNG da escala
  js/telas/            gira, pessoas, histórico, usuários, login, oferendas, ervas, curimba, perfil, fotos, vídeos
api/                   Backend: funções da Vercel (Node)
  _lib/db.js           acesso ao Postgres (SQL por HTTP), migração automática e transações
  _lib/senhas.js       senhas (scrypt) e sessões (token assinado)
  _lib/sessao.js       quem está chamando e permissões
  _lib/escala.js       ocultação de sorteio não publicado
  _lib/r2.js           assinatura de URLs para fotos no Cloudflare R2
  auth/[acao].js       estado, instalar, entrar, trocar senha, me, foto
  ervas/index.js       compra coletiva de ervas
  oferendas/index.js   oferendas: itens e doações
  pessoas/index.js     cadastro, edição, curimba
  usuarios/index.js    criação e gerenciamento de contas
  importar.js          restauração de backup
  giras/[data]/index.js giras: criar, editar, sortear, presença, escala e eventos
db/esquema.js          tabelas e funções do banco (aplicadas automaticamente)
shared/                Usado pelos dois lados
  regras.js            regras do sorteio, rodízio e remanejamento
  permissoes.js        o que cada perfil pode fazer e acessos de corrente
  perfil.js            papéis (medium, extra, passe, cambone, curimba, aluno)
  eventos.js           tipos de eventos
  ervas.js             cálculo dos pedidos, divisão do frete e exportação
  oferendas.js         situação dos itens e texto para compartilhar
  escalaTexto.js       leitura de escala em texto puro
scripts/               servidor local e build
test/                  testes do backend (Postgres local)
docs/                  Arquitetura, regras de negócio, instruções de trabalho
```

O backend é quem decide: valida o login, confere a permissão de cada chamada, executa as regras de sorteio e garante a consistência dos dados. O frontend mostra e envia requisições. As operações críticas (sorteio, encerrar gira) usam transações atômicas para evitar estado inconsistente.

## Perfis e Acessos

### Perfis de login (admin e controle)

| Recurso | Admin | Usuário | admin_oferendas | admin_ervas | admin_curimba | admin_perfil |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Gira** — ver escala e presença | ✓ | ✓ | | | | |
| **Gira** — editar e sortear | ✓ | | | | | |
| **Pessoas** — cadastro e editar | ✓ | | | | | |
| **Histórico** (giras passadas) | ✓ | ✓ | | | | |
| **Usuários** — criar e gerenciar | ✓ (root) | | | | | |
| **Ervas** — ver pedidos | ✓ | ✓ | | | | |
| **Ervas** — cadastro e gerenciar | ✓ | | | | ✓ | |
| **Oferendas** — ver e doar | ✓ | ✓ | ✓ | | | |
| **Oferendas** — gerenciar | ✓ | | ✓ | | | |
| **Perfil** — editar próprio perfil | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Perfil** — editar perfil de outros | ✓ (root) | | | | | ✓ |
| **Curimba** — aba administrativa | ✓ | | | | ✓ (admin_curimba) | |
| **Fotos** — ver | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Fotos** — apagar de outros | ✓ | | | | | |
| **Vídeos** — gerenciar | ✓ (root) | | | | | |

### Acessos de corrente (sem conta admin)

Além dos perfis acima, há três acessos em **grupo** para a corrente:

| Acesso | Login | Senha | Vê | Pode fazer |
|---|---|---|---|---|
| **CPJ** | `corrente-cpj` | nome digitado | Gira (próxima sorteada), Ervas, Histórico, Oferendas | Confirmar presença na próxima gira, escolher ervas, fazer oferendas |
| **Alunos** | `alunos` | senha da turma | Geral (eventos de outras turmas), oferendas da turma | Presença em eventos, oferendas |
| **Curimba** | `curimba` | senha da turma | Geral (eventos de curimba), presença individual em aulas | Marcar presença em aulas |

Ao entrar por acesso de grupo, o navegador pede escolher o nome (Pessoas da corrente para `cpj`, Alunos para `alunos` e `curimba`).

### Ervas (compra coletiva)

- **Todos** (admin, usuário, admin_ervas, corrente, alunos e curimba) escolhem as ervas e a quantidade na aba **Ervas**. Quem tem conta aparece sempre com o nome cadastrado; acesso de grupo usa o nome escolhido.
- **admin** ou **admin_ervas** cadastra as ervas e monta a **Compra**: nome da gira e data, as porções e o preço da porção de cada erva (o preço é opcional: pode ficar "a definir" e ser preenchido no fim). No cadastro, cada erva pode ter "porção serve N pessoas": com mais pedidos, as porções (e o custo dividido) sobem sozinhas e o **frete** (logo abaixo da última erva; começa em R$ 60,00 e é dividido por igual entre quem pediu). A tabela do pedido mostra erva, quantidade pedida pela corrente, quantidade do pedido, valor unitário, valor e o total. Os campos ficam travados: **Editar** libera (e vira **Cancelar**, que desfaz as mudanças) e **Salvar** grava. Na Compra também ficam **Fechar/Reabrir lista** (fechar pede confirmação e já guarda a compra no **Histórico de compras** como compra atual — reabrindo e fechando de novo, ela é atualizada lá; com a lista fechada ninguém altera nada, nem o admin: pedidos, Compra e cadastro ficam travados até reabrir — para pôr preço é preciso reabrir), os dois botões de exportação (texto, WhatsApp e planilha `.csv`) — **Pedido ao fornecedor** (as ervas com as porções da Compra, sem valores) e **Cobrança** (quanto cada pessoa paga, liberada quando todas as ervas pedidas têm preço) — e **Nova compra**: primeiro pergunta "Tem certeza?" (avisa que há um pedido em andamento) e depois se o pedido atual é **encerrado** (guardado no **Histórico de compras**, com a tabela do pedido e a cobrança de cada pessoa) ou **descartado**; depois apaga os pedidos, zera as quantidades da Compra e reabre a lista. Em **Pedidos da corrente** o admin vê e corrige o pedido de cada pessoa.

## Como colocar no ar

### 1. Banco de dados (na Vercel)

1. Abra o projeto na Vercel e vá na aba **Storage**.
2. **Create Database → Neon** → **Continue**. Escolha a região (Washington D.C. / `iad1` é a mesma das funções da Vercel e deixa o app mais rápido), o plano gratuito, dê um nome e crie.
3. Em **Storage → seu banco → Connect Project**, escolha o projeto **cpj-mediuns**, marque **Production** e **Preview**, deixe **Custom Prefix** vazio e não marque a criação de branch para Preview. Clique em **Connect**.

A Vercel cadastra a variável `DATABASE_URL` sozinha. As tabelas são criadas pelo próprio app no primeiro acesso.

### 2. Código de instalação

Em **Settings → Environment Variables**, cadastre:

- `CODIGO_INSTALACAO`: uma frase longa que só você conheça. Ela é pedida uma única vez, para criar o admin.

### 3. Publicar e instalar

1. Faça um **Redeploy** (Deployments → ⋯ no último deploy → Redeploy) ou um `git push`. Variáveis novas só valem num deploy novo.
2. Abra o site. Aparece a tela **Instalar o app**: informe o código de instalação, o seu nome, e-mail e senha. Você vira o admin.
3. Cadastre os demais na aba **Usuários**.

Depois da instalação, a tela de instalação some e o código não é mais aceito.

### Vindo da versão anterior

Na versão antiga, use **Histórico → Baixar backup**. Na nova, entre como admin e use **Histórico → Restaurar backup** com esse arquivo. As pessoas são casadas pelo nome.

## Rotas da API

Todas exigem `Authorization: Bearer <token>`, exceto `GET /api/auth/estado`, `POST /api/auth/instalar` e `POST /api/auth/entrar`.

| Método e rota | Permissão |
|---|---|
## Rotas da API

Todas exigem `Authorization: ......` exceto `GET /api/auth/estado`, `POST /api/auth/instalar` e `POST /api/auth/entrar`.

| Método e rota | Permissão | Ações/listas |
|---|---|---|
| `GET /api/auth/estado` · `POST /api/auth/instalar` · `POST /api/auth/entrar` | pública | — |
| `POST /api/auth/senha` · `GET /api/auth/me` · `POST /api/auth/foto` · `DELETE /api/auth/foto` | logado | — |
| `GET /api/pessoas` · `POST /api/pessoas` · `PATCH /api/pessoas/:id` · `DELETE /api/pessoas/:id` | `pessoas:ler` · `pessoas:editar` | `lista=curimba`, `lista=minhaCurimba`, `acao=curimba*` |
| `GET /api/giras` · `GET /api/giras/:data` | `giras:ler` | — |
| `PUT /api/giras/:data` | `giras:editar` | `acao=escala`, `acao=evento`, `acao=recado`, `acao=foto*`, `acao=video*` |
| `DELETE /api/giras/:data` | `giras:excluir` | — |
| `POST /api/giras/:data/sortear` · `/remanejar` | `giras:sortear` | `acao=sortear`, `acao=remanejar`, `acao=refazer`, `acao=cancelarSorteio` |
| `GET /api/usuarios` · `POST /api/usuarios` · `PATCH /api/usuarios/:id` · `DELETE /api/usuarios/:id` | `usuarios:gerenciar` | — |
| `POST /api/importar` | `dados:importar` | — |
| `GET /api/ervas` · `PUT /api/ervas` · `POST /api/ervas` | `ervas:escolher` · `ervas:gerenciar` | — |
| `GET /api/oferendas` · `POST /api/oferendas` | `oferendas:doar` · `oferendas:gerenciar` | `acao=doar`, `acao=editar`, `acao=remover`, `acao=cancelar` |

**Nota**: Plano Hobby (12 funções). Uma rota nova reutiliza um arquivo existente com `acao` ou `?lista=`.

## Segurança

- Senhas guardadas só como hash scrypt, nunca em texto.
- Sessão por token assinado (HMAC), válida por 30 dias. O segredo de assinatura é gerado no próprio banco na instalação.
- Trocar a senha ou o perfil de alguém encerra as sessões abertas dessa pessoa.
- Depois de 8 senhas erradas seguidas, o e-mail fica bloqueado por 15 minutos.
- Não é possível remover o último admin, nem tirar o seu próprio acesso de admin.
- O banco só é acessado pelo backend; a `DATABASE_URL` nunca vai para o navegador.

## Rodar no computador

Precisa do Node 20 ou mais novo.

```bash
cp .env.example .env      # no Windows: copy .env.example .env
# preencha DATABASE_URL (Vercel > Storage > seu banco > .env.local) e CODIGO_INSTALACAO
npm run dev
```

Abra http://localhost:3000. O servidor local imita a Vercel: serve o `frontend/` e roda as funções de `api/`.

## Testes

Os testes do backend rodam automaticamente via **GitHub Actions** a cada `push` ou `pull_request` para `main`. O workflow:

1. Inicia um container **Postgres 16** com banco vazio
2. Roda `npm run build` (valida bundle)
3. Roda `npm test` com variáveis de ambiente `DATABASE_URL` e `CODIGO_INSTALACAO`

Veja `.github/workflows/test.yml` para os detalhes. O CI também testa as ~30 migrações não validadas em Postgres real (v56–v85).

Para rodar localmente (requer Postgres 16+):

```bash
npm test
```

Veja `test/apoio.js` para os requisitos e como configurar o banco de testes local.

## Referências

- **Regras de negócio** (sorteio, presença, estado dos eventos): [docs/regras.md](docs/regras.md)
- **Arquitetura e stack**: [docs/arquitetura.md](docs/arquitetura.md)
- **Fluxo de desenvolvimento**: [docs/como-trabalhamos.md](docs/como-trabalhamos.md)
- **Roadmap e pendências**: [docs/visao.md](docs/visao.md)
- **Estrutura das migrações**: [db/ESTRUTURA-ESQUEMA.md](db/ESTRUTURA-ESQUEMA.md)
