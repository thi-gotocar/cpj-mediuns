# CLAUDE.md — Sort Médiuns (Casa do Pai João)

PWA da Casa do Pai João (CPJ) para organizar a corrente e as giras: cadastro, presença, **sorteio de cambones e médiuns de passe**, publicação da escala e envio para o WhatsApp. A **Michelle** (admin) monta a escala; a corrente entra pelo acesso `cpj` e vê o resultado.

Responda e escreva textos de tela **em português do Brasil**.

## Onde está cada coisa

Leia o doc certo antes de mexer na área:

| Doc | Quando ler |
|---|---|
| [docs/como-trabalhamos.md](docs/como-trabalhamos.md) | Git, deploy, fluxo de entrega, testes, convenções de código e de migração |
| [docs/arquitetura.md](docs/arquitetura.md) | Stack, as 12 funções de `api/`, estrutura de pastas, fluxo de dados, modelo de dados |
| [docs/regras.md](docs/regras.md) | Regras de negócio: pessoas, presença, sorteio, escala, Gira, Perfil; jornada e diagramas de estado |
| [docs/visao.md](docs/visao.md) | Para quem é, intenção, roadmap/pendências e histórico de versões |

## Regras que não se quebram

- **Vercel Hobby: 12 funções e já estamos em 12.** Nunca criar arquivo novo em `api/` (exceto `_lib/`); funcionalidade nova vira `acao` / `?lista=` num arquivo existente.
- **Zero dependências npm.** Sem framework, sem bundler.
- **Migrações idempotentes** em `db/esquema.js`: toda a lista roda de novo a cada `VERSAO`; coisa nova vai no fim.
- **Dados de produção só mudam por migração no código.** Nunca acessar o banco de produção, nunca imprimir segredos nem decifrar variáveis da Vercel.
- **Permissão é checada no backend** (`exigir` / `pode`); no frontend só esconde botões.
- **Quem faz o `git push` é o usuário.** A Vercel publica sozinha a cada push em `main`.
- Mobile primeiro (390 px), sem rolagem horizontal.

## Comandos

Pasta de trabalho: `C:\Users\Thi\Documents\sort-mediuns` (Windows). **`npm test` ainda não roda aqui** (depende de Linux + Postgres local) — detalhes em [docs/como-trabalhamos.md](docs/como-trabalhamos.md).

## Manter os docs vivos

- No mesmo commit da mudança, atualizar o doc da área: regra de negócio → `regras.md`; decisão de arquitetura → `arquitetura.md`; pendência aberta/fechada → `visao.md`.
- Docs guardam só o que o código não mostra. Não escrever contagens, listas de arquivos, colunas ou números de versão — isso está no código e no `git log`.
