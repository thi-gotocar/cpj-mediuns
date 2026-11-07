# Instruções para o Copilot — Sort Médiuns

Responda e escreva textos de tela em português do Brasil. Antes de mexer no projeto, leia o [CLAUDE.md](../CLAUDE.md) e os docs em `docs/`: as regras de lá valem para você também.

## Git e deploy — regras que não se quebram

- **Nunca faça `git push`.** Quem faz push é o usuário. Cada push em `main` publica em produção (Vercel) e gasta a cota de deploys do plano gratuito.
- **Nunca teste em produção.** Nada de commit ou push de `debug:`, `console.log` temporário ou tentativa e erro para "ver se funciona no ar". Investigue e teste localmente (ver "Testes" em [docs/como-trabalhamos.md](../docs/como-trabalhamos.md)) e só entregue a correção pronta.
- Commit só quando o usuário pedir. Mensagem em português, curta e objetiva.
- Nunca acesse o banco de produção nem imprima ou decifre segredos/variáveis da Vercel. Dados de produção só mudam por migração em `db/esquema.js`.
