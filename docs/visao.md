# Visão, intenção e roadmap

## O que é

PWA da **Casa do Pai João (CPJ)** para organizar a corrente e as giras:

- cadastro da corrente (médiuns, extras, passes, cambones, senhas, curimba), alunos e licenças;
- presença, entidade do dia, **sorteio de cambones e médiuns de passe** com rodízio, remanejamento de faltas, ajuste manual, publicação da escala e exportação para o **WhatsApp** (texto e imagem PNG);
- perfil de cada pessoa (informações, orixás, guias, guias de atendimento, afinidades);
- eventos da casa, oferendas, compra coletiva de ervas, histórico e estatísticas;
- venda de guias (aba Compras): o admin cadastra grupos e itens com foto, estoque e valor; a corrente pede e o admin fecha cada pedido numerado, marca ok e exporta;
- aulas de curimba (aba à parte): alunos da corrente ou de fora, aulas, presença e gráfico de presença;
- amaci de cada orixá (aba Amaci), com o conteúdo da apostila de orixás; o admin libera os orixás por turma de alunos;
- vídeos do YouTube das giras (aba Vídeos: o admin publica para toda a corrente ou deixa só para os admins), por mês e classificados por orixá/linha;
- álbum de fotos por gira/evento (aba Fotos): todos veem, quem entrou com senha envia; os arquivos ficam no Cloudflare R2 gratuito.

## Para quem

- **Michelle** (admin) monta a escala: presença, sorteio, ajustes, publicação, encerramento.
- **A corrente** entra com e-mail, celular ou CPF e a senha e vê o resultado: a própria função na gira, a escala publicada, eventos, aniversariantes; declara ausência, preenche o perfil, pede ervas e participa das oferendas.
- **Root** cuida de usuários, perfis e correções de histórico.

## Intenção (o que guia as decisões)

- **A escala sai pronta para o WhatsApp.** O fim do ciclo é a mensagem/imagem no grupo da corrente.
- **Sorteio justo e explicável:** rodízio por recência e repetição, respeitando quem está apto em cada linha e as afinidades de cada pessoa.
- **A admin decide no fim:** o sorteio sugere; remanejar, ajuste manual e publicar ficam na mão dela. Nada aparece para a corrente antes de publicar.
- **Celular primeiro:** tudo pensado para 390 px, usado durante a semana e no dia da gira.
- **Custo zero e manutenção mínima:** Vercel Hobby + Neon gratuito, sem framework, sem bundler, sem dependências npm.

## Roadmap

### Em aberto

- **Compatibilidade com o app anterior, para remover a partir de 30/11/2026.** Antes, conferir em Admin root → 📲 Versão do app que ninguém está numa versão de antes de 22/11 (o "forçar atualização" só alcança quem já tem a v170). Sai: `POST /api/auth/visita`; os `rewrites` de `sortear`/`remanejar` e de `/api/importar` (com o `req.query.acao` dos POST); a resposta de `/auth/inicio` sem `parcial`; o "app antigo sem o campo celular" do `criarSenha`; o `skipWaiting` de transição do `sw-modelo.js`. Os testes que conferem esses caminhos saem junto.

- **Gestão de Conduta e Risco não foi conferida na tela.** O banco e as regras têm teste no CI; falta olhar o bloco no app publicado (corrente e root).
- **Aba Fotos está desligada no código** (`FOTOS_ATIVA = false` em `shared/fotos.js`). Para ligar: criar o bucket no Cloudflare R2 e pôr as 4 variáveis `R2_*` na Vercel (ver `.env.example`) e trocar para `true`. O R2 de verdade nunca foi usado: os testes foram com R2 falso (a assinatura confere com os exemplos da AWS). O Guia da Corrente (PDF) ainda não fala da aba.
- **Preço estimado das ervas não tem teste.** A migração v61 roda no CI; a regra (sugestão na Compra, ≈ Usar estimados) foi conferida só na tela, com banco falso.
- **Foto da pessoa no Perfil não tem teste.** A migração v63 roda no CI; tela e permissões foram conferidas com banco falso.
- **Anamnese: o compartilhar do arquivo (.txt) no WhatsApp não foi testado num celular.**
- **Guia da Corrente (PDF) desatualizado:** ainda fala de "Sua presença no ano" (saiu da aba Gira) e não fala das Orações.
- **Aba Vídeos não tem teste.** A migração v58 roda no CI; a tela foi conferida com uma API falsa.
- **Afinidade de passe do At. Extra** só existe na aba Pessoas (não no Perfil dele) e não entra na Sugestão Mi/Mãe Vê.
- **Aba Compras: a foto do item não foi testada num celular.**
- **Aba Amaci fora dos Guias.** O Guia da Corrente e o do Administrador (PDF) ainda não falam da aba.
- **Pix do ASAAS nunca rodou contra o ASAAS de verdade.** Os testes usam uma API falsa; falta testar no sandbox (gerar o Pix, pagar pelo painel do sandbox, ver o webhook chegar). Para ligar: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` e `ASAAS_API_URL` na Vercel (sandbox em Preview/Development, produção só em Production); no ASAAS, o webhook com a URL `https://cpj-mediuns.vercel.app/api/oferendas?webhook=asaas`, o mesmo token e os eventos de cobrança; reativar a fila; ligar **Pix visível nas Compras** na aba ASAAS. Os Guias em PDF ainda não falam do Pix nem da aba ASAAS.
- **Painel da Transparência (v128) não tem teste e nunca rodou contra o ASAAS de verdade.** A migração roda no CI; a lógica do saldo e a leitura das cobranças foram testadas no Node com banco e ASAAS falsos. Conferir no app publicado: se os filtros `dueDate[ge]`/`paymentDate[ge]` do ASAAS trazem as cobranças certas e se a descrição das doações por Pix é mesmo "Cobrança gerada automaticamente a partir de Pix recebido".
- **Celular único (v127) sem teste da recusa.** O login e o criar senha pelo e-mail/celular têm teste no CI, mas nenhum teste confere a mensagem "Este celular já está em outro cadastro". Celulares repetidos de antes da regra não foram procurados (não há acesso ao banco de produção).
- **UP CPJ levando o CPF (v126) não tem teste.** O UP CPJ e o limite por IP rodam no CI, mas nenhum teste passa um aluno com CPF para a corrente (a recifra foi testada só no Node).
- **Ex-alunos (v125): o ↩ Voltar não tem teste.** Excluir (vai para Ex-alunos) e apagar de vez têm teste no CI; trazer de volta (`aluno_reativar`) não. O bloco foi conferido só com dados falsos.
- **Redefinir senha por e-mail.** O Esqueci a senha só manda falar com a administração. Para enviar o link: escolher o provedor (Resend, com domínio próprio, ou Brevo, sem domínio e com risco de spam) e pôr a chave na Vercel. SMS grátis não existe.
- **Alunos de curimba (v131): quem veio de "de fora" não tem como entrar sozinho.** A migração e o fluxo (turma Curimba, aulas, UP CPJ) têm teste no CI. Esses alunos ficaram sem celular, e-mail, CPF nem senha: só entram depois que a administração cadastrar o celular ou o CPF (Pessoas → Alunos → Editar); o Criar cadastro recusa porque o nome já existe como aluno. Do acesso de grupo `curimba` sobram a recusa da sessão antiga (`lerSessao`) e a visão Curimba do root; as checagens de `eu.grupo === 'curimba'` no backend saíram (nunca eram verdadeiras).
- **Criar cadastro pelo CPF (v130): quem é da corrente sem CPF e sem celular/e-mail no cadastro não entra sozinho.** O fluxo tem teste no CI; a administração precisa cadastrar o CPF ou o celular dessas pessoas.
- **Fila de senhas (v164): pronta, falta testar de verdade.** Banco, regras e rotas com teste de API (`v164: fila de senhas`), que ainda não rodou (só no CI). O painel (sub-aba Fila da Gira) foi conferido na tela só com dados injetados no modo demonstração (o `demo.js` não tem a fila); falta usá-lo contra o backend de verdade. A página pública `/fila` foi conferida só na prévia, com API e localização simuladas. Falta testar num celular de verdade: o som (no iPhone precisa de um toque antes e a vibração não existe), a página em segundo plano (o navegador para as consultas; a pessoa precisa deixá-la aberta) e o pedido de localização. A tela de TV e o cartaz foram conferidos na prévia (o QR foi lido certo por um celular); falta abrir a TV na televisão da casa (tamanho e o som) e imprimir o cartaz. Ideia para depois: preencher os atendimentos do Encerrar com as contagens da fila.
- **Testes no Windows.** `npm test` depende de Linux (`runuser`) e de Postgres local; aqui não roda (o Docker Desktop não subiu). A suíte completa roda no CI do GitHub a cada push em `main`, com todas as migrações aplicadas duas vezes num Postgres novo.
- **Aba Diário (v145): primeira entrega (MVP).** Tem teste de API no CI e foi conferida na tela só no modo demonstração. Ficou para depois: **bloqueio por PIN/biometria** da aba; **cruzamento de padrões** (o Seu acompanhamento já avisa de 3 dias seguidos em vibração densa; falta sugerir firmeza do Anjo da Guarda ou descarrego leve antes da próxima gira); **histórico de ervas quentes** (alertar excesso e sugerir reposição); **busca nos conselhos** por linha ou palavra. A tabela de temperatura das ervas e os fundamentos do Orientador (`shared/diario.js`) precisam da revisão da Casa. O ditado (🎤) não foi testado num celular (no iPhone, o Safari pode não ter). Os Guias em PDF não falam da aba. **v149**: cuidados do dia, barra de energia, sensações neutras/difíceis e Galeria de fotos — conferidos só no modo demonstração. A leitura do conselho por **foto do papel** (Tesseract.js) ficou de fora.
- **Guias em PDF (Corrente e Administrador) mostram o layout antigo da aba Gira**, que saiu do app (a sub-aba Gira antiga foi apagada).
- O doc `claude/regras-sort-mediuns.md` do Project é antigo (out/2026); [regras.md](regras.md) é a referência atual.

### Próximos

_(a definir)_

## Histórico

O que mudou e quando está no `git log`.
