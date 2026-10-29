# Sort Médiuns

Escala da gira: cadastro da corrente, presença, entidade do dia, sorteio de cambones e médiuns de passe com rodízio, remanejamento de faltas e exportação para o WhatsApp (texto e imagem).

Frontend e backend separados, no mesmo repositório e no mesmo projeto da Vercel. Dados e login no Supabase. **Sem dependências npm.**

## Estrutura

```
frontend/              Site (HTML, CSS e módulos JS que o navegador carrega direto)
  index.html
  css/estilo.css
  js/main.js           login, abas e eventos
  js/auth.js           login individual (Supabase Auth)
  js/api.js            cliente do backend
  js/estado.js         estado da tela e chamadas à API
  js/exportar.js       texto para o WhatsApp
  js/imagem.js         imagem PNG da escala
  js/telas/            gira, pessoas, histórico, usuários, login
api/                   Backend: funções da Vercel (Node)
  _lib/                http, sessão/permissões, acesso ao Supabase
  config.js  me.js  importar.js
  pessoas/  giras/  usuarios/
shared/                Usado pelos dois lados
  regras.js            regras do sorteio, rodízio e remanejamento
  permissoes.js        o que cada perfil pode fazer
supabase/migrations/   SQL do banco (tabelas, funções e segurança)
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

Para mudar, edite `shared/permissoes.js`. Vale para o backend e para a tela.

## Rotas da API

Todas exigem `Authorization: Bearer <token do Supabase>`, exceto `/api/config`.

| Método e rota | Permissão |
|---|---|
| `GET /api/config` | pública |
| `GET /api/me` | logado |
| `GET /api/pessoas` · `POST /api/pessoas` | `pessoas:ler` · `pessoas:editar` |
| `PATCH/DELETE /api/pessoas/:id` | `pessoas:editar` |
| `GET /api/giras` · `GET /api/giras/:data` | `giras:ler` |
| `PUT /api/giras/:data` | `giras:editar` |
| `DELETE /api/giras/:data` | `giras:excluir` |
| `POST /api/giras/:data/sortear` · `/remanejar` | `giras:sortear` |
| `GET/POST /api/usuarios` · `PATCH/DELETE /api/usuarios/:id` | `usuarios:gerenciar` |
| `POST /api/importar` | `dados:importar` |

## Como colocar no ar

### 1. Supabase

1. Crie um projeto em https://supabase.com.
2. **SQL Editor → New query**: cole e rode `supabase/migrations/001_inicial.sql`. Depois, numa nova query, `supabase/migrations/002_funcoes_api.sql`.
3. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up**. Só o admin cria usuários, pelo app.
4. **Authentication → Users → Add user → Create new user**: crie o seu usuário (e-mail e senha, marque *Auto Confirm User*). **O primeiro usuário criado vira admin automaticamente.**
5. Em **Project Settings → API** (ou **API Keys**), anote: a URL do projeto, a chave pública (`anon` ou `publishable`) e a chave de serviço (`service_role` ou `secret`).

### 2. Vercel

1. Suba o repositório no GitHub e importe na Vercel (**Add New → Project**).
2. As configurações de build já estão no `vercel.json`; não mude nada na tela de importação.
3. Em **Settings → Environment Variables**, cadastre:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. **Deploy** (ou **Redeploy**, se já tinha publicado antes das variáveis).
5. Abra o site, entre com o usuário admin e cadastre os demais na aba **Usuários**.

Plano Hobby: o projeto usa 11 funções (o limite é 12).

### Vindo da versão anterior (dados no aparelho)

Na versão antiga, use **Histórico → Baixar backup**. Na nova, entre como admin e use **Histórico → Restaurar backup** com esse arquivo. As pessoas são casadas pelo nome.

## Rodar no computador

Precisa do Node 20 ou mais novo.

```bash
cp .env.example .env      # no Windows: copy .env.example .env
# preencha o .env com os dados do Supabase
npm run dev
```

Abra http://localhost:3000. O servidor local imita a Vercel: serve o `frontend/` e roda as funções de `api/`.

## Testes

Os testes do backend usam um Postgres local (com as migrações) no lugar do Supabase:

```bash
npm test
```

Veja `test/apoio.js` para os requisitos (Postgres local acessível pelo usuário `postgres`).

## Segurança

- As tabelas têm RLS ligado e sem políticas, e as funções do banco só podem ser executadas pela chave de serviço. A chave pública não lê nem grava nada.
- A chave de serviço fica só nas variáveis de ambiente do backend.
- O perfil de cada usuário fica em `public.perfis`; o papel de quem é criado pelo app vai em `app_metadata`, que o próprio usuário não consegue alterar.
- Não é possível remover o último admin, nem tirar o seu próprio acesso de admin.

## Regras do sorteio

Estão em `shared/regras.js` e documentadas em `regras-sort-mediuns.md` no projeto do Claude.
