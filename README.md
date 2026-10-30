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
  js/telas/            gira, pessoas, histórico, usuários, login
api/                   Backend: funções da Vercel (Node)
  _lib/db.js           acesso ao Postgres (SQL por HTTP) e migração automática
  _lib/senhas.js       senhas (scrypt) e sessões (token assinado)
  _lib/sessao.js       quem está chamando e permissões
  auth/[acao].js       estado, instalar, entrar, trocar senha, me
  ervas/index.js       compra coletiva de ervas
  oferendas/index.js   oferendas: itens e doações
  importar.js  pessoas/  giras/  usuarios/
db/esquema.js          tabelas e funções do banco (aplicadas sozinhas)
shared/                Usado pelos dois lados
  regras.js            regras do sorteio, rodízio e remanejamento
  permissoes.js        o que cada perfil pode fazer
  ervas.js             cálculo dos pedidos, divisão do frete e exportação
  oferendas.js         situação dos itens e texto para compartilhar
scripts/               servidor local e build
test/                  testes do backend (Postgres local)
```

O backend é quem decide: valida o login, confere a permissão de cada chamada e roda o sorteio. O frontend só mostra e envia.

## Perfis

| | Admin | Usuário |
|---|---|---|
| Ver a corrente, a escala e o histórico | ✓ | ✓ |
| Copiar texto e gerar imagem para o WhatsApp | ✓ | ✓ |
| Cadastrar e editar pessoas | ✓ | |
| Presença, entidade, trocar e fixar duplas | ✓ | |
| Sortear e remanejar faltas | ✓ | |
| Excluir giras | ✓ | |
| Criar usuários, mudar perfil, redefinir senha | ✓ | |
| Backup e restauração | ✓ | |
| Escolher ervas | ✓ | ✓ |
| Cadastrar ervas, frete e exportar pedidos | ✓ | |

Para mudar, edite `shared/permissoes.js`. Vale para o backend e para a tela.

### Acesso da corrente (sem senha)

No login, quem digita **`corrente-cpj`** no campo de e-mail entra sem senha: o campo de senha vira **"Seu nome"**. Esse acesso vê só duas abas: **Gira**, com o resultado do sorteio (abre direto na próxima gira sorteada), e **Ervas**. O nome digitado é o que aparece nos pedidos. Entrar de novo com o mesmo nome continua o mesmo pedido. Para mudar o texto do acesso, edite `ACESSO_CORRENTE` em `shared/permissoes.js`.

### Ervas (compra coletiva)

- **Todos** (admin, usuário e corrente) escolhem as ervas e a quantidade na aba **Ervas**. Quem tem conta aparece sempre com o nome cadastrado.
- **Admin** cadastra ervas e preços (o preço é opcional: pode ficar "a definir" e ser preenchido no fim, para fechar o valor de cada um), define o **frete** (dividido por igual entre quem pediu), fecha/reabre a lista, vê os pedidos e tem dois botões de exportação (texto, WhatsApp e planilha `.csv`): **Pedido ao fornecedor** (cada erva com a quantidade total, sem valores) e **Cobrança** (quanto cada pessoa paga, liberada quando todas as ervas pedidas têm preço). **Nova compra** apaga os pedidos e reabre a lista.

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
| `GET /api/auth/estado` · `POST /api/auth/instalar` · `POST /api/auth/entrar` | pública |
| `POST /api/auth/senha` · `GET /api/auth/me` | logado |
| `GET /api/pessoas` · `POST /api/pessoas` | `pessoas:ler` · `pessoas:editar` |
| `PATCH/DELETE /api/pessoas/:id` | `pessoas:editar` |
| `GET /api/giras` · `GET /api/giras/:data` | `giras:ler` |
| `PUT /api/giras/:data` | `giras:editar` |
| `DELETE /api/giras/:data` | `giras:excluir` |
| `POST /api/giras/:data/sortear` · `/remanejar` | `giras:sortear` |
| `GET/POST /api/usuarios` · `PATCH/DELETE /api/usuarios/:id` | `usuarios:gerenciar` |
| `POST /api/importar` | `dados:importar` |
| `GET/PUT /api/ervas` · `POST /api/ervas` | `ervas:escolher` · `ervas:gerenciar` |
| `GET /api/oferendas` · `POST /api/oferendas` (doar · demais ações) | `oferendas:doar` · `oferendas:gerenciar` |

Plano Hobby: o projeto usa 12 funções, que é o limite do plano. Uma rota nova precisa reaproveitar um arquivo existente.

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

Os testes do backend usam um Postgres local no lugar do banco da Vercel, com o login real:

```bash
npm test
```

Veja `test/apoio.js` para os requisitos (Postgres local acessível pelo usuário `postgres`).

## Regras do sorteio

Estão em `shared/regras.js` e documentadas em `regras-sort-mediuns.md` no projeto do Claude.
