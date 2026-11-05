# Visão, intenção e roadmap

## O que é

PWA da **Casa do Pai João (CPJ)** para organizar a corrente e as giras:

- cadastro da corrente (médiuns, extras, passes, cambones, senhas, curimba), alunos e licenças;
- presença, entidade do dia, **sorteio de cambones e médiuns de passe** com rodízio, remanejamento de faltas, ajuste manual, publicação da escala e exportação para o **WhatsApp** (texto e imagem PNG);
- perfil de cada pessoa (informações, orixás, guias, guias de atendimento, afinidades);
- eventos da casa, oferendas, compra coletiva de ervas, histórico e estatísticas;
- aulas de curimba (aba à parte): alunos da corrente ou de fora, aulas, presença e gráfico de presença;
- vídeos do YouTube das giras (aba Vídeos: o admin publica para toda a corrente ou deixa só para os admins), por mês e classificados por orixá/linha;
- álbum de fotos por gira/evento (aba Fotos): todos veem, quem entrou com senha envia; os arquivos ficam no Cloudflare R2 gratuito.

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
- **Aba Curimba não foi testada no banco.** A migração v57 e o teste de `test/api.test.js` não rodaram (sem Postgres local); conferir no app publicado.
- **Aba Fotos está desligada no código** (`FOTOS_ATIVA = false` em `shared/fotos.js`). Para ligar: criar o bucket no Cloudflare R2 e pôr as 4 variáveis `R2_*` na Vercel (ver `.env.example`) e trocar para `true`. A migração v59 não rodou no Postgres e o R2 de verdade não foi usado: os testes foram com banco e R2 falsos (a assinatura confere com os exemplos da AWS). O Guia da Corrente (PDF) ainda não fala da aba.
- **Preço estimado das ervas não foi testado no banco.** A migração v61 (`preco_estimado`, copiada uma vez do preço atual) não rodou no Postgres; a tela foi conferida com banco falso.
- **Alunos por turma nas oferendas não foi testado no banco.** A migração v62 (`aluno_no_grupo`) não rodou no Postgres; tela e validação conferidas com banco falso.
- **Foto da pessoa no Perfil não foi testada no banco.** A migração v63 (`pessoas_fotos`) não rodou no Postgres; tela e permissões conferidas com banco falso.
- **Trava da escala não foi testada no banco.** A migração v72 (`giras.travada`, `gira_travar`) não rodou no Postgres; tela e regras conferidas com banco falso, e o teste novo em `test/api.test.js` só roda no Linux.
- **Recado da gira não foi testado no banco.** A migração v73 (`giras.recado`, `gira_recado`) não rodou no Postgres; tela e regras conferidas com banco falso, e `test/api.test.js` só roda no Linux.
- **Anamnese não foi testada no banco.** As migrações v70 e v71 (perfil Admin perfil) (`anamnese_perguntas`, `anamnese_respostas`) não rodou no Postgres; tela e regras conferidas com banco falso, e o teste novo em `test/api.test.js` só roda no Linux. O compartilhar do arquivo (.txt) no WhatsApp não foi testado num celular.
- **Ausência antecipada não foi testada no banco.** A migração v69 (`ausencias_previas`) não rodou no Postgres; o fluxo foi conferido com banco falso e o teste novo em `test/api.test.js` só roda no Linux.
- **"Exibir no resumo" das oferendas não foi testado no banco.** A migração v68 (`no_resumo`, `oferenda_resumo` e `oferendas_estado` refeita) não rodou no Postgres.
- **Renomear turma dos alunos não foi testado no banco.** A migração v67 (`turma_aluno_renomear`) não rodou no Postgres.
- **Oferenda que segue o cadastro não foi testada no banco.** A migração v66 (`oferendas_sincronizar`, chamada a cada leitura das oferendas) não rodou no Postgres; o teste novo em `test/api.test.js` só roda no Linux.
- **Orações não foram testadas no banco.** As migrações v64 (`oracoes`, apagadas depois de 7 dias) e v65 (reação 🕯️, `oracoes_reacoes`) não rodaram no Postgres; tela e permissões conferidas com banco falso.
- **Guia da Corrente (PDF) desatualizado:** ainda fala de "Sua presença no ano" (saiu da aba Gira) e não fala das Orações.
- **Aba Vídeos não foi testada no banco.** A migração v58 não rodou (sem Postgres local); a tela foi conferida com uma API falsa. Conferir no app publicado.
- **Afinidade de passe do At. Extra** só existe na aba Pessoas (não no Perfil dele) e não entra na Sugestão Mi/Mãe Vê.
- **Testes no Windows.** `npm test` depende de Linux (`runuser`) e de Postgres local; na pasta atual não roda.
- O doc `claude/regras-sort-mediuns.md` do Project é antigo (out/2026); [regras.md](regras.md) é a referência atual.

### Próximos

_(a definir)_

## Histórico

O que mudou e quando está no `git log`.
