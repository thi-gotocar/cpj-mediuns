# Como trabalhamos neste repo

Processo, ambiente e convenções. O que o projeto **é** está em [visao.md](visao.md); como o sistema é montado, em [arquitetura.md](arquitetura.md); as regras da casa, em [regras.md](regras.md).

---

## Git e deploy

- Repositório: **`thi-gotocar/cpj-mediuns`** (branch `main`). Produção: **https://cpj-mediuns.vercel.app** — a Vercel publica sozinha a cada `git push` em `main`.
- Pasta de trabalho: **`C:\Users\Thi\OneDrive\Documentos\sort-mediuns`** — é a única cópia que vale.
- **Quem faz o `git push` é o usuário.** O assistente só faz commit, e só quando o usuário pede.
- Vercel: projeto `prj_w0Uv5orUUgrBYO3Lod32NusQGkDi`, time `team_zDUClDMlwzMyd5Xsw0oJ962a`. Variáveis: `DATABASE_URL` (Neon) e `CODIGO_INSTALACAO`.
- Logs de runtime da Vercel guardam só ~1 hora (Hobby).

### Fluxo de entrega

1. Alterar direto na pasta de trabalho e rodar os testes (ver abaixo).
2. Atualizar os docs da área (ver "Docs").
3. Quando o usuário pedir o commit: commitar direto na `main` (não criar branches), mensagem em português, curta, com o rodapé:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
4. Pedir ao usuário o `git push`.

### Docs

Os docs guardam só o que o código não mostra (o porquê, as regras da casa, as decisões). Contagens, listas de arquivos, colunas e números de versão ficam no código e no `git log`. No mesmo commit da mudança:

- [regras.md](regras.md) se mudou regra de negócio;
- [arquitetura.md](arquitetura.md) se mudou uma decisão de arquitetura ou a relação entre tabelas;
- [visao.md](visao.md) se fechou ou abriu uma pendência do roadmap.

**Guias em PDF** (`manuais/`): o Guia da Corrente e o Guia do Administrador, para distribuir às pessoas. O texto fica nos scripts `manual_corrente.py` e `manual_admin.py` (visual em `manual_base.py`). Quando uma tela mudar de um jeito que a pessoa percebe, ajuste o script e gere de novo (precisa de Python com `reportlab` e das fontes Segoe UI do Windows; não entram no deploy):

```bash
python manuais/manual_corrente.py "manuais/Guia da Corrente.pdf"
python manuais/manual_admin.py "manuais/Guia do Administrador.pdf"
```

## Segurança

- Nunca imprimir segredos, nunca decifrar variáveis da Vercel, nunca acessar o banco de produção direto: **mudança de dados só por migração no código**.
- Senhas e PINs ficam com hash (scrypt). O root **redefine** senhas, nunca as vê.

## Testes e conferência

> **Hoje os testes só rodam em Linux.** `test/apoio.js` chama o Postgres via `runuser -u postgres`, e esta máquina (Windows) não tem Postgres instalado. Os comandos abaixo são do ambiente Linux antigo; adaptar para Windows está no roadmap.

```bash
pg_ctlcluster 16 main start          # Postgres local
timeout 115 npm test                  # regras, api, ervas, resumo
node test/e2e-servidor.js             # servidor de teste na porta 4310 (banco sortm_teste)
```

- Não rodar `npm test` e o servidor e2e ao mesmo tempo (mesmo banco).
- Parar o servidor: `pkill -f "e2e-servido[r]"` em comando separado.
- Conferência visual: scripts Playwright (viewport 390 px) que instalam o app (`codigo-de-teste`), criam pessoas pela API e tiram screenshots.

---

## Convenções de código

### Banco / migrações (`db/esquema.js`)

- **Toda** a lista `MIGRACOES` roda de novo a cada aumento de `VERSAO` → todo comando precisa ser **idempotente** (`create … if not exists`, `create or replace function`, `alter … add column if not exists`).
- Coisa nova vai **no fim da lista**; uma função redefinida depois substitui a anterior.
- Backfill que só pode rodar uma vez usa marcador (ex.: `publicada is null`, ou chave na tabela `sistema` como em v47 `v47_linhas_todas`).
- Em template string JS, regex SQL **não** usa `\d` (vira `d`): usar `[0-9]`.

### Backend

- **Nunca criar arquivo novo em `api/`** (exceto `_lib/`): estamos no limite de 12 funções do Hobby. Funcionalidade nova entra como `acao` / `?lista=` num arquivo existente.
- Permissão sempre no backend: `exigir(req, 'perm')` / `pode(quem, 'perm')`.
- **Zero dependências npm.** Não adicionar pacotes.

### Frontend

- Cada tela exporta `render()` (string HTML), `cliques` (por `data-act`), `mudancas` (evento change por `data-act`) e handlers de submit roteados por `id` do form em `main.js`.
- Redesenho: `avisar()`. Para não perder foco/rascunho, guardar valores em `estado` antes de redesenhar ou atualizar em silêncio.
- `.card.adm` (borda dourada) = bloco só de admin. Na aba Perfil, os blocos de admin ficam dentro da moldura `.pf-adm-area` com o rótulo **ADMIN**.
- Confirmação de exclusão: janela `.modal-fundo/.modal` (Pessoas) ou caixa inline (`estado.confirm = 'chave'`).
- Layout mobile primeiro (390 px), sem rolagem horizontal; listas longas: 5 itens visíveis + rolagem.
- `pode('perm')` no frontend só esconde botões — não é segurança.
- Textos de tela em português do Brasil.

### Permissões

- Perfis ficam na tabela `perfis` com matriz `abas: { gira|pessoas|alunos|hist|ervas|oferendas|eventos|perfil: { ver, editar } }`.
- `permissoesDe(papel, abas)` gera as permissões; **root** tem todas + `usuarios:gerenciar`.
- Perfis padrão: root, admin, usuario, admin_oferendas, admin_ervas, corrente.
