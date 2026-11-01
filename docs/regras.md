# Regras de negócio

Estado atual das regras da casa e do app. Código: `shared/regras.js` (e demais módulos de `shared/`).

## Pessoas

- Funções: `medium`, `extra` (At. Extra), `passe`, `cambone`, `senha`, `curimba` (fora da presença/sorteio), além de **alunos** (tabela separada, por turma).
- Médium pode ter **"+ médium de passe"** (`experiente`).
- **Linhas do cadastro** (`pessoas.linhas`, só Extra/Passe): entidades em que atua na própria função. **"Todas" = todas marcadas. Nenhuma marcada = não apto a nenhuma → cambona em toda gira com entidade.** (v47 deu "Todas" a quem estava vazio.)
- **Afinidades** (Perfil e aba Pessoas): `afinidade_passe` (Cambone e Extra) e `afinidade_extra` (Passe) — "100% de afinidade e segurança".
- Turma da limpeza 1–7 (rodízio automático por gira), data de entrada na corrente (só root), licenças (início, fim, motivo).
- Aba Pessoas: tudo só muda em **Editar** (nome, função, turma, + médium de passe, entidades) e grava no **Salvar**; Excluir abre janela de confirmação.

## Presença (status por gira)

`pend` Pendente · `p` Presente · `na` Não atende (cambona) · `sup` Suporte · `f` Falta · `a` Ausente · (`lic` derivado da licença).

- Antes do dia: só Pendente/Ausente. A **corrente** declara a própria ausência até a véspera, se o admin ainda não marcou.
- **Troca do dia** (2º combo da presença, `giras.papeis`): `cad` (função do cadastro), `sup`, `na` (Cambone/Não atende), `pas` → Passe (Extra, Cambone, Senha), `ext` → At. Extra (Passe), `sen` → Senha (Cambone). Ver `TROCAS_DIA`.

## Sorteio e escala

- Recebem cambone: médium e extra presentes (na função do dia). Cambonam: cambones, `na` e extras/passes fora da linha. Passes vão para médiuns `experiente`.
- Rodízio por custo (recência, repetição, última gira), 600 tentativas aleatórias.
- Depois do sorteio: **🔄 Remanejar faltas** (com confirmação; refaz só o afetado) e **✋ Ajuste manual**. "Sortear tudo de novo" foi removido.
- **Falta** direto na escala: marca falta e remaneja.
- **Publicar escala**: até publicar, só quem edita vê o sorteio (`ocultarSorteio`).
- Encerrar exige ninguém pendente + atendimentos (preferencial/normal/passe); quem sobrou vai para o Suporte. Reabrir desfaz.
- Root corrige presença de qualquer gira (mesmo encerrada) em Histórico → Estatísticas (`acao: 'corrigirPresenca'`).

## Aba Gira (visão)

- Topo: **Eventos** (gira 30 dias, evento/aviso futuros, amaci 7 dias) + **aniversariantes da semana** (dom–sáb) com 🎈🎂.
- **Você nesta gira**: função, duplas, guia de atendimento; "Sorteio de escala pendente da Michelle" dentro do bloco quando a gira está aberta e sem sorteio.
- Admin: **Sugestão Mi/Mãe Vê** — PASSE: cambones com afinidade de passe na entidade + At. Extra que **não** marcou a entidade; AT. EXTRA: passes com afinidade de extra. Exclui licença/falta/ausente. 5 nomes + rolagem.
- Botão **WhatsApp** (abaixo de Publicar) abre o painel de texto/imagem; fica desabilitado enquanto não houver sorteio.
- Fim da aba: **Sua presença no ano** (licença e pendente não contam), com borda grossa na cor da faixa: verde a partir de 90%, amarelo de 50% a 89%, vermelho abaixo de 50%.

## Perfil

- Informações (nome, nascimento, celular, contato), afinidades por função, Orixás, Guias, Guias de atendimento (nome do guia por linha), Guias da corrente.
- Admin (moldura ADMIN): Ajustes, Informações da corrente, Respostas, Oferendas pendentes.

## Outros

- Oferenda com uma linha por pessoa: **↻ Incluir novos cadastrados** pergunta de quais listas puxar (começa com os grupos da oferenda) e só inclui no **Confirmar**; só acrescenta (quem foi tirado continua fora) e as listas escolhidas passam a fazer parte da oferenda.
- Eventos (gira/amaci/aviso/evento), Oferendas (itens, doações, por médium com pagamento/entrega, grupos incluindo alunos), Ervas (compra coletiva com frete rateado), Histórico (giras, estatísticas, quem cambonou quem, backup).
- Login: e-mail+senha; **acesso da corrente** com `cpj` + nome (+ PIN de 4–8 dígitos se criado); instalação com `CODIGO_INSTALACAO`.

## Jornada (fluxo de uso)

```mermaid
flowchart TD
    A([Abrir o app]) --> B{Já instalado?}
    B -- não --> I[Instalar: código + 1º admin] --> L
    B -- sim --> L[Login]
    L -->|e-mail + senha| U[Usuário com perfil]
    L -->|cpj + nome| C{Tem PIN?}
    C -- sim --> P[Digita PIN] --> R[Corrente]
    C -- não --> R
    R -.opcional.-> CS[Criar senha PIN]

    U --> T[Abas conforme permissões]
    R --> T2[Gira · Perfil · Ervas · Oferendas]

    subgraph Ciclo da gira - admin
      G1[Criar gira na data] --> G2[Entidade, orixá, turma da limpeza]
      G2 --> G3[Presença: Pendente/Ausente antes do dia; Presente/Falta no dia; trocas do dia]
      G3 --> G4[Sugestão Mi/Mãe Vê]
      G4 --> G5[🎲 Sortear]
      G5 --> G6{Ajustes?}
      G6 -- falta --> G7[🔄 Remanejar faltas / Falta]
      G6 -- manual --> G8[✋ Ajuste manual]
      G7 --> G9
      G8 --> G9[📢 Publicar escala]
      G6 -- não --> G9
      G9 --> G10[WhatsApp: texto / imagem]
      G10 --> G11[Encerrar gira + atendimentos]
      G11 --> G12[Histórico e estatísticas]
      G11 -.reabrir.-> G3
    end

    T --> G1
    T2 --> V[Você nesta gira: pendente → escala publicada]
    V --> AU[Declarar ausência até a véspera]
    AU -.-> G3
    T2 --> PF[Perfil: informações, orixás, guias, afinidades]
    PF -.alimenta.-> G4
```

## Estados

**Gira**

```mermaid
stateDiagram-v2
    [*] --> SemGira
    SemGira --> Planejamento: criar (data futura, todos Pendente)
    Planejamento --> NoDia: chega a data
    Planejamento --> Sorteada: sortear
    NoDia --> Sorteada: sortear
    Sorteada --> Sorteada: remanejar / ajuste manual / falta
    Sorteada --> Publicada: publicar
    Publicada --> Sorteada: ocultar
    Publicada --> Encerrada: encerrar (sem pendentes + atendimentos)
    Sorteada --> Encerrada: encerrar
    Encerrada --> Sorteada: reabrir
    Planejamento --> SemGira: reiniciar
    Sorteada --> Planejamento: reiniciar
    Encerrada --> [*]: excluir
```

**Presença de uma pessoa numa gira**

```mermaid
stateDiagram-v2
    Pendente --> Ausente: admin ou a própria pessoa até a véspera
    Pendente --> Presente: admin no dia
    Pendente --> Falta: admin no dia
    Presente --> Falta: Falta na escala → remanejar
    Presente --> Suporte: papel sup / sobra no encerrar
    Presente --> NaoAtende: troca do dia (cambona)
    Suporte --> Presente: reabrir
    Falta --> Presente
    Ausente --> Presente
    state Licenca <<choice>>
    [*] --> Licenca
    Licenca --> DeLicenca: data dentro de uma licença
    Licenca --> Pendente: fora de licença (padrão)
```

**Função do dia (Extra/Passe com linhas)**

```mermaid
stateDiagram-v2
    [*] --> Cadastro
    Cadastro --> Troca: papel pas/ext/sen/na/sup definido
    Cadastro --> NaLinha: entidade marcada nas linhas
    Cadastro --> Cambone: entidade NÃO marcada (ou nenhuma marcada)
    Cadastro --> NaLinha: gira sem entidade (não converte)
    Cambone --> NaLinha: admin escolhe "cad" (mantém a função)
```

**Oferenda**

```mermaid
stateDiagram-v2
    [*] --> Rascunho
    Rascunho --> Aguardando
    Aguardando --> Publicado
    Publicado --> Encerrado
    Publicado --> Travada: 1 dia após 100% doado
    Travada --> Encerrado
    note right of Travada: só o responsável altera
```

