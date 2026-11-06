# Estrutura das Migrações do Banco

Este documento mapeia cada migração (`MIGRACOES`) para seu domínio e versão.

## Por quê?

O arquivo `esquema.js` contém ~2335 linhas com 85+ migrações. Elas estão ordenadas historicamente (por quando foram adicionadas), não por domínio. Isso dificulta:
- Entender quais migrações pertencem a qual feature
- Testar migrações isoladamente
- Planejar futuras mudanças

## Estrutura Atual

As migrações estão divididas em **duas seções principais**:

### 1. Tabelas e índices (linhas 14-135)

Criação das tabelas principais, organizadas por domínio:
- **Sistema** (linhas 14-22): `sistema`
- **Usuários** (linhas 24-40): `usuarios`, `login_falhas`
- **Corrente** (linhas 42-75): `pessoas`, `licencas` + alterações de todas as versões
- **Giras** (linhas 77-135): `giras`, `presencas`, `duplas` + alterações de todas as versões

### 2. Funções PL/pgSQL (linhas 137-2335)

Funções de negócio, divididas por domínio e versão:
- **Funções de Sistema** (linhas 139-145): `sistema_estado`, `sistema_segredo`
- **Funções de Usuários** (linhas 147-400+): `usuario_*`, `usuarios_*`, `perfis_*`, `sessao_*`
- **Funções de Pessoas/Corrente** (linhas 400+): `pessoa_*`, `pessoas_*`, `licenca_*`, `alteracoes_*`
- **Funções de Giras** (linhas 600+): `gira_*`, `giras_*`
- **Funções de Ervas** (linhas 900+): `erva_*`, `ervas_*`
- **Funções de Oferendas** (linhas 1200+): `oferenda_*`, `oferendas_*`

## Mapa de Versões por Domínio

| Versão | Domínio | O que mudou | Testado |
|--------|---------|-----------|---------|
| v0-v1 | Base | Tabelas iniciais | ✓ |
| v2 | Pessoas | Campo `linhas` | ? |
| v3 | Ervas | Compra de ervas | ? |
| v5 | Giras | Presença + Duplas | ✓ |
| v6 | Giras | Campo `encerrada` | ? |
| v7 | Giras | Campo `suporte_auto` | ? |
| v10 | Giras/Pessoas | `licencas`, `atendimentos` | ? |
| v13 | Oferendas | Tabelas de oferendas | ? |
| v14 | Admin | Papéis admin_oferendas/admin_ervas | ? |
| v15 | Corrente | Vínculo chave->pessoa | ? |
| v17 | Usuários | Ligação usuario<->pessoa | ? |
| v19 | Oferendas | Função `oferenda_status` | ? |
| v22 | Pessoas | Campo `motivo` em licenças | ? |
| v23 | Pessoas | Campo `limpeza` | ? |
| v24 | Oferendas | Tabela `oferenda_mediuns` | ? |
| v25 | Giras | Campo `orixa` | ? |
| v26 | Pessoas | Tipo `curimba` | ? |
| v27 | Giras | Status `pend` (pendente) | ? |
| v29 | Giras | Campo `papeis` (função do dia) | ? |
| v30 | Pessoas | Campo `entrada` | ? |
| v31 | Oferendas | Campo `excluido` em oferenda_mediuns | ? |
| v32 | Oferendas | Inicializar mediuns ao criar | ? |
| v35 | Admin | Tabela `perfis` (migrado de campo) | ✓ |
| v56 | Giras | Função `gira_mudar_data` | ✗ |
| v57 | Pessoas | Aba Curimba | ✗ |
| v58 | Vídeos | Aba Vídeos | ✗ |
| v59 | Fotos | Fotos (R2) | ✗ |
| v61 | Ervas | `preco_estimado` | ✗ |
| v62 | Oferendas | `aluno_no_grupo` | ✗ |
| v63 | Pessoas | `pessoas_fotos` | ✗ |
| v66 | Oferendas | `oferendas_sincronizar` | ✗ |
| v67 | Oferendas | `turma_aluno_renomear` | ✗ |
| v68 | Oferendas | `no_resumo`, `oferenda_resumo` | ✗ |
| v69 | Giras | `ausencias_previas` | ✗ |
| v72 | Giras | `travada`, `gira_travar` | ✗ |
| v73 | Giras | `recado`, `gira_recado` | ✗ |
| v75-v84 | Vários | Migrações internas (alunos, transferências) | ✗ |
| v85 | Giras | `participantes` (total em eventos) | ✗ |

**Legenda:**
- ✓ Testado no Postgres (CI ou produção)
- ✗ Não testado (banco falso, sem Postgres local)
- ? Desconhecido

## Notas Importantes

1. **Ordem importa**: As migrações em `MIGRACOES` devem rodar na mesma ordem em qualquer instalação. Todas são **idempotentes** (`if not exists`, `on conflict`, etc.), então podem rodar múltiplas vezes sem erro, mas a ordem histórica deve ser preservada.

2. **Idempotência verificada**: Todas as alterações usam:
   - `create table/index/function if not exists`
   - `on conflict ... do nothing` ou `do update`
   - `alter table ... add column if not exists`
   - `drop constraint if exists` antes de `add constraint`

3. **Testes**: As migrações não testadas (✗) precisam ser validadas em ambiente com Postgres. Veja [docs/como-trabalhamos.md](../docs/como-trabalhamos.md) para rodar testes localmente.

4. **Adicionar nova migração**: Sempre adicione no final do array `MIGRACOES`, aumente `VERSAO`, e inclua um comentário `// v###: ...` explicando o que muda.

## Futura Reorganização

Quando houver CI (Tarefa #4), será possível **reorganizar logicamente** as migrações (todas de um domínio juntas) porque os testes garantirão que idempotência continua funcionando mesmo após a reorganização. Por enquanto, apenas comentários e documentação.
