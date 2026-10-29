# Sort Médiuns

Escala da gira: cadastro da corrente, presença, entidade do dia, sorteio de cambones e de médiuns de passe com rodízio, remanejamento de faltas e exportação para o WhatsApp (texto ou imagem).

Site estático: um único `index.html`, sem build e sem dependências.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O app inteiro (HTML, CSS e JavaScript). |
| `manifest.webmanifest`, `icon*.png`, `icon.svg` | Permitem "Adicionar à tela inicial" no celular, com ícone próprio. |
| `vercel.json` | Configuração da Vercel (URLs limpas e cabeçalhos). |

## Subir na Vercel

### Opção 1: pelo site, arrastando a pasta

1. Entre em https://vercel.com e faça login.
2. **Add New… → Project**.
3. Arraste a pasta `sort-mediuns` (ou importe de um repositório do GitHub, opção 2).
4. Em **Framework Preset**, deixe **Other**. Não precisa de Build Command nem de Output Directory.
5. Clique em **Deploy**.

### Opção 2: pelo GitHub (recomendado, atualiza sozinho)

1. Crie um repositório no GitHub e envie estes arquivos:
   ```bash
   cd sort-mediuns
   git init
   git add .
   git commit -m "Sort Médiuns"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/sort-mediuns.git
   git push -u origin main
   ```
2. Na Vercel: **Add New… → Project → Import** o repositório.
3. **Framework Preset: Other** → **Deploy**.
4. Cada `git push` publica uma versão nova.

### Opção 3: pela linha de comando

```bash
npm i -g vercel
cd sort-mediuns
vercel          # primeira vez: responde as perguntas, aceita os padrões
vercel --prod   # publica em produção
```

## Testar no computador antes de subir

```bash
cd sort-mediuns
npx serve .
# ou: python3 -m http.server 8000
```

Abra o endereço mostrado no terminal.

## Onde ficam os dados

Os dados ficam salvos **no navegador de cada aparelho** (localStorage). Não há servidor nem banco de dados. Isso significa:

- Cada aparelho tem a sua própria corrente e histórico.
- Limpar os dados do navegador apaga tudo.

Por isso, use a aba **Histórico → Backup**:

- **Baixar backup** gera um arquivo `.json` com pessoas e giras.
- **Restaurar backup** carrega esse arquivo em outro aparelho (substitui os dados que estavam lá).

Para a corrente toda usar os mesmos dados ao mesmo tempo, é preciso ligar um banco de dados (por exemplo Supabase ou Vercel KV). O código de armazenamento está isolado nas funções `loadLocal`, `saveLocal`, `setPessoa`, `setGira`, `delPessoa` e `delGira` do `index.html`.

## Instalar no celular

Abra o site no celular e use **Compartilhar → Adicionar à Tela de Início** (iPhone) ou **⋮ → Instalar app / Adicionar à tela inicial** (Android).

## Regras

As regras de negócio (status, sorteio, rodízio, remanejamento, exportação) estão no documento `regras-sort-mediuns.md` do projeto.
