# Visão, intenção e roadmap

## O que é

PWA da **Casa do Pai João (CPJ)** para organizar a corrente e as giras:

- cadastro da corrente (médiuns, extras, passes, cambones, senhas, curimba), alunos e licenças;
- presença, entidade do dia, **sorteio de cambones e médiuns de passe** com rodízio, remanejamento de faltas, ajuste manual, publicação da escala e exportação para o **WhatsApp** (texto e imagem PNG);
- perfil de cada pessoa (informações, orixás, guias, guias de atendimento, afinidades);
- eventos da casa, oferendas, compra coletiva de ervas, histórico e estatísticas.

## Para quem

- **Michelle** (admin) monta a escala: presença, sorteio, ajustes, publicação, encerramento.
- **A corrente** entra pelo acesso `cpj` + nome e vê o resultado: a própria função na gira, a escala publicada, eventos, aniversariantes; declara ausência, preenche o perfil, pede ervas e participa das oferendas.
- **Root** cuida de usuários, perfis e correções de histórico.

## Intenção (o que guia as decisões)

- **A escala sai pronta para o WhatsApp.** O fim do ciclo é a mensagem/imagem no grupo da corrente.
- **Sorteio justo e explicável:** rodízio por recência e repetição, respeitando quem está apto em cada linha e as afinidades de cada pessoa.
- **A admin decide no fim:** o sorteio sugere; remanejar, ajuste manual e publicar ficam na mão dela. Nada aparece para a corrente antes de publicar.
- **Celular primeiro:** tudo pensado para 390 px, usado durante a semana e no dia da gira.
- **Custo zero e manutenção mínima:** Vercel Hobby + Neon gratuito, sem framework, sem bundler, sem dependências npm.

## Roadmap

### Em aberto

- **Ação `reiniciar` sem botão.** O Reiniciar saiu do card da gira (refazer o sorteio do zero é pelo ↻); a ação continua em `api/giras/[data]` e nos testes. Remover?
- **Mudar a data da gira não foi testado no banco.** A migração v56 (`gira_mudar_data`) e os testes novos de `test/api.test.js` não rodaram (sem Postgres local).
- **Afinidade de passe do At. Extra** só existe na aba Pessoas (não no Perfil dele) e não entra na Sugestão Mi/Mãe Vê.
- **Testes no Windows.** `npm test` depende de Linux (`runuser`) e de Postgres local; na pasta atual não roda.
- O doc `claude/regras-sort-mediuns.md` do Project é antigo (out/2026); [regras.md](regras.md) é a referência atual.

### Próximos

_(a definir)_

## Histórico

O que mudou e quando está no `git log`.
