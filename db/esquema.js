// Esquema do banco (Postgres da Vercel / Neon).
//
// O backend aplica este esquema sozinho no primeiro acesso (api/_lib/db.js):
// não é preciso rodar SQL à mão. Cada item da lista é UM comando SQL, e todos
// são idempotentes (podem rodar de novo sem estragar nada).
//
// Para mudar o esquema: acrescente comandos no fim e aumente VERSAO.
//
// Estrutura: veja db/ESTRUTURA-ESQUEMA.md para o mapa de versões, domínios e
// quais migrações foram testadas no Postgres.

export const VERSAO = 98;  // v98: retrato do que foi encerrado; apagar de vez quem foi excluído

import { PERFIS_PADRAO } from '../shared/permissoes.js';

export const MIGRACOES = [
  // ---------------------------------------------------------------- sistema
  `create table if not exists sistema (
     chave  text primary key,
     valor  text not null
   )`,
  // Segredo que assina as sessões; gerado no próprio banco na instalação.
  `insert into sistema (chave, valor)
   values ('segredo_sessao', replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
   on conflict (chave) do nothing`,

  // --------------------------------------------------------------- usuários
  `create table if not exists usuarios (
     id             uuid primary key default gen_random_uuid(),
     nome           text not null check (length(btrim(nome)) between 1 and 80),
     email          text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
     papel          text not null check (papel in ('admin', 'usuario')),
     senha_hash     text not null,
     sessao_versao  integer not null default 1,
     criado_em      timestamptz not null default now()
   )`,
  `create unique index if not exists usuarios_email_unico on usuarios (email)`,
  `create table if not exists login_falhas (
     email          text primary key,
     tentativas     integer not null default 0,
     bloqueado_ate  timestamptz
   )`,

  // ---------------------------------------------------------------- corrente
  `create table if not exists pessoas (
     id          uuid primary key default gen_random_uuid(),
     nome        text not null check (length(btrim(nome)) between 1 and 80),
     funcao      text not null check (funcao in ('medium', 'cambone', 'passe', 'senha', 'extra')),
     experiente  boolean not null default false,
     criado_em   timestamptz not null default now()
   )`,
  `create unique index if not exists pessoas_nome_unico on pessoas (lower(btrim(nome)))`,
  // v26: curimba — entra nas turmas da limpeza, mas não na presença, no sorteio nem nas contagens
  `alter table pessoas drop constraint if exists pessoas_funcao_check`,
  `alter table pessoas add constraint pessoas_funcao_check check (funcao in ('medium', 'cambone', 'passe', 'senha', 'extra', 'curimba'))`,
  // v2: linhas em que Extra/Passe atuam na própria função (nas outras, cambonam)
  `alter table pessoas add column if not exists linhas text[] not null default '{}'`,
  // v23: turma da limpeza (1 a 7) da pessoa e a turma responsável pela gira
  `alter table pessoas add column if not exists limpeza smallint check (limpeza between 1 and 7)`,
  // v30: entrada na corrente: antes dessa data a pessoa não conta nas giras (vazio = sempre contou)
  `alter table pessoas add column if not exists entrada date`,
  // v17: o usuário é uma pessoa da corrente (o nome vem do cadastro); só o root pode não ter
  `alter table usuarios add column if not exists pessoa_id uuid references pessoas (id) on delete set null`,
  `create unique index if not exists usuarios_pessoa_unica on usuarios (pessoa_id) where pessoa_id is not null`,
  // v10: licenças (a pessoa fica fora das giras entre início e fim, inclusive)
  `create table if not exists licencas (
     id         uuid primary key default gen_random_uuid(),
     pessoa_id  uuid not null references pessoas (id) on delete cascade,
     inicio     date not null,
     fim        date not null,
     criado_em  timestamptz not null default now(),
     check (fim >= inicio)
   )`,
  `create index if not exists licencas_pessoa on licencas (pessoa_id)`,
  // v22: motivo da licença (aparece no resumo da gira)
  `alter table licencas add column if not exists motivo text not null default '' check (length(motivo) <= 200)`,

  // ------------------------------------------------------------------ giras
  `create table if not exists giras (
     data            date primary key,
     entidade        text not null default '' check (length(entidade) <= 120),
     atualizado_em   timestamptz not null default now(),
     atualizado_por  uuid references usuarios (id) on delete set null
   )`,
  `alter table giras add column if not exists limpeza smallint check (limpeza between 1 and 7)`,
  `alter table giras add column if not exists pendente_padrao boolean not null default false`,
  // v29: função do dia separada da presença: { pessoaId: 'sup' | 'na' }
  `alter table giras add column if not exists papeis jsonb not null default '{}'::jsonb`,
  // v25: orixá da gira (só nas giras das linhas; vazio = não definido)
  `alter table giras add column if not exists orixa text not null default '' check (length(orixa) <= 40)`,
  // v6: gira encerrada (ninguém altera até reabrir)
  `alter table giras add column if not exists encerrada boolean not null default false`,
  // v7: quem foi para o Suporte ao encerrar e o status que tinha antes (volta ao reabrir)
  `alter table giras add column if not exists suporte_auto jsonb not null default '{}'::jsonb`,
  // v10: quantas pessoas foram atendidas (informado ao encerrar): { preferencial, normal, passe }
  `alter table giras add column if not exists atendimentos jsonb`,
  // Status na gira. Sem linha = Presente. p, na (não atende), sup, f (falta), a (ausente)
  `create table if not exists presencas (
     gira_data  date not null references giras (data) on delete cascade,
     pessoa_id  uuid not null references pessoas (id) on delete cascade,
     status     text not null check (status in ('p', 'na', 'sup', 'f', 'a')),
     primary key (gira_data, pessoa_id)
   )`,
  // v27: "pendente" (presença ainda não confirmada). Nas giras novas é o padrão de quem não foi marcado;
  // nas antigas o padrão continua "presente".
  `alter table presencas drop constraint if exists presencas_status_check`,
  `alter table presencas add constraint presencas_status_check check (status in ('pend', 'p', 'na', 'sup', 'f', 'a'))`,
  // tipo 'cambone': pessoa_id cambona medium_id; tipo 'passe': pessoa_id é passe junto de medium_id
  `create table if not exists duplas (
     id          bigint generated always as identity primary key,
     gira_data   date not null references giras (data) on delete cascade,
     tipo        text not null check (tipo in ('cambone', 'passe')),
     medium_id   uuid not null references pessoas (id) on delete cascade,
     pessoa_id   uuid not null references pessoas (id) on delete cascade,
     fixo        boolean not null default false,
     remanejado  boolean not null default false
   )`,
  `create index if not exists duplas_por_gira on duplas (gira_data)`,

  // ===================================================== funções (p jsonb)
  // ---------------------------------------------------------------- sistema
  `create or replace function sistema_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('instalado', exists (select 1 from usuarios));
   $$`,
  `create or replace function sistema_segredo(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(valor) from sistema where chave = 'segredo_sessao';
   $$`,

  // --------------------------------------------------------------- usuários
  `create or replace function usuario_obter(p jsonb)
   returns jsonb language sql stable as $$
     select usuario_json(u) from usuarios u where u.id = (p ->> 'id')::uuid;
   $$`,
  // Uso interno do login: inclui o hash da senha e o bloqueio por tentativas.
  `create or replace function usuario_para_login(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'usuario', (select usuario_json(u) from usuarios u where u.email = lower(btrim(p ->> 'email'))),
       'senhaHash', (select senha_hash from usuarios where email = lower(btrim(p ->> 'email'))),
       'bloqueadoAte', (select bloqueado_ate from login_falhas
                         where email = lower(btrim(p ->> 'email')) and bloqueado_ate > now())
     );
   $$`,
  `create or replace function usuarios_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(usuario_json(u) order by lower(coalesce(pe.nome, u.nome))), '[]'::jsonb)
     from usuarios u left join pessoas pe on pe.id = u.pessoa_id;
   $$`,
  `create or replace function usuario_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v usuarios;
   begin
     insert into usuarios (nome, email, papel, senha_hash, pessoa_id)
     values (btrim(p ->> 'nome'), lower(btrim(p ->> 'email')), p ->> 'papel', p ->> 'senhaHash', nullif(p ->> 'pessoaId', '')::uuid)
     returning * into v;
     return usuario_json(v);
   exception when unique_violation then
     if exists (select 1 from usuarios where pessoa_id = nullif(p ->> 'pessoaId', '')::uuid) then
       raise exception 'Essa pessoa já tem um usuário.';
     end if;
     raise exception 'Já existe um usuário com esse e-mail.';
   end;
   $$`,
  // Instalação: cria o primeiro admin, só se ainda não houver nenhum usuário.
  `create or replace function usuario_criar_primeiro(p jsonb)
   returns jsonb language plpgsql as $$
   declare v usuarios;
   begin
     lock table usuarios in share row exclusive mode;
     if exists (select 1 from usuarios) then
       raise exception 'O app já foi instalado. Entre com o seu e-mail e senha.';
     end if;
     insert into usuarios (nome, email, papel, senha_hash)
     values (btrim(p ->> 'nome'), lower(btrim(p ->> 'email')), 'root', p ->> 'senhaHash')
     returning * into v;
     return usuario_json(v);
   end;
   $$`,
  `create or replace function usuario_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_atual text;
     v usuarios;
   begin
     select papel into v_atual from usuarios where id = v_id for update;
     if not found then raise exception 'Usuário não encontrado.'; end if;
     if p ? 'papel' and v_atual in ('admin', 'root') and (p ->> 'papel') not in ('admin', 'root')
        and (select count(*) from usuarios where papel in ('admin', 'root')) <= 1 then
       raise exception 'Precisa existir pelo menos um admin.';
     end if;
     if p ? 'pessoaId' and exists (select 1 from usuarios where pessoa_id = nullif(p ->> 'pessoaId', '')::uuid and id <> v_id) then
       raise exception 'Essa pessoa já tem um usuário.';
     end if;
     update usuarios set
       nome          = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
       pessoa_id     = case when p ? 'pessoaId' then nullif(p ->> 'pessoaId', '')::uuid else pessoa_id end,
       papel         = case when p ? 'papel' then p ->> 'papel' else papel end,
       senha_hash    = case when p ? 'senhaHash' then p ->> 'senhaHash' else senha_hash end,
       -- trocar a senha ou o perfil encerra as sessões abertas
       sessao_versao = case when p ? 'senhaHash' or (p ? 'papel' and p ->> 'papel' <> v_atual)
                            then sessao_versao + 1 else sessao_versao end
     where id = v_id
     returning * into v;
     return usuario_json(v);
   end;
   $$`,
  `create or replace function usuario_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_papel text;
   begin
     select papel into v_papel from usuarios where id = (p ->> 'id')::uuid for update;
     if not found then raise exception 'Usuário não encontrado.'; end if;
     if v_papel in ('admin', 'root') and (select count(*) from usuarios where papel in ('admin', 'root')) <= 1 then
       raise exception 'Precisa existir pelo menos um admin.';
     end if;
     delete from usuarios where id = (p ->> 'id')::uuid;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // Após 8 senhas erradas seguidas, o e-mail fica bloqueado por 15 minutos.
  `create or replace function login_falha(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_email text := lower(btrim(p ->> 'email'));
   begin
     insert into login_falhas (email, tentativas) values (v_email, 1)
     on conflict (email) do update set tentativas = login_falhas.tentativas + 1;
     update login_falhas set tentativas = 0, bloqueado_ate = now() + interval '15 minutes'
     where email = v_email and tentativas >= 8;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  `create or replace function login_ok(p jsonb)
   returns jsonb language sql as $$
     delete from login_falhas where email = lower(btrim(p ->> 'email'));
     select jsonb_build_object('ok', true);
   $$`,

  // ---------------------------------------------------------------- pessoas
  `create or replace function licenca_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into licencas (pessoa_id, inicio, fim, motivo)
     values ((p ->> 'pessoaId')::uuid, (p ->> 'inicio')::date, (p ->> 'fim')::date, coalesce(p ->> 'motivo', ''));
     return pessoas_listar('{"todas": true}'::jsonb);
   end;
   $$`,
  // v11: editar o período de uma licença
  `create or replace function licenca_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update licencas set inicio = (p ->> 'inicio')::date, fim = (p ->> 'fim')::date,
       motivo = case when p ? 'motivo' then coalesce(p ->> 'motivo', '') else motivo end where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Licença não encontrada.'; end if;
     return pessoas_listar('{"todas": true}'::jsonb);
   end;
   $$`,
  `create or replace function licenca_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from licencas where id = (p ->> 'id')::uuid;
     return pessoas_listar('{"todas": true}'::jsonb);
   end;
   $$`,

  // ------------------------------------------------------------------ giras
  `create or replace function giras_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(gira_json(data) order by data desc), '[]'::jsonb) from giras;
   $$`,
  `create or replace function gira_obter(p jsonb)
   returns jsonb language sql stable as $$
     select gira_json((p ->> 'data')::date);
   $$`,
  // Salva de uma vez; só substitui o que vier em p. Pessoas que não existem mais são ignoradas.
  `create or replace function gira_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_data date := (p ->> 'data')::date;
     v_user uuid := nullif(p ->> 'usuario', '')::uuid;
   begin
     -- Gira nova (não cadastrada já encerrada): quem não foi marcado fica "pendente".
     insert into giras (data, entidade, encerrada, atendimentos, limpeza, orixa, pendente_padrao, atualizado_em, atualizado_por)
     values (v_data, coalesce(p ->> 'entidade', ''), coalesce((p ->> 'encerrada')::boolean, false),
             nullif(p -> 'atendimentos', 'null'::jsonb), nullif(p ->> 'limpeza', '')::smallint, coalesce(p ->> 'orixa', ''),
             coalesce((p ->> 'pendentePadrao')::boolean, not coalesce((p ->> 'encerrada')::boolean, false)), now(), v_user)
     on conflict (data) do update set
       entidade       = case when p ? 'entidade' then coalesce(p ->> 'entidade', '') else giras.entidade end,
       encerrada      = case when p ? 'encerrada' then (p ->> 'encerrada')::boolean else giras.encerrada end,
       suporte_auto   = case when p ? 'suporteAuto' then coalesce(p -> 'suporteAuto', '{}'::jsonb) else giras.suporte_auto end,
       atendimentos   = case when p ? 'atendimentos' then nullif(p -> 'atendimentos', 'null'::jsonb) else giras.atendimentos end,
       limpeza        = case when p ? 'limpeza' then nullif(p ->> 'limpeza', '')::smallint else giras.limpeza end,
       orixa          = case when p ? 'orixa' then coalesce(p ->> 'orixa', '') else giras.orixa end,
       papeis         = case when p ? 'papeis' then coalesce(p -> 'papeis', '{}'::jsonb) else giras.papeis end,
       atualizado_em  = now(),
       atualizado_por = excluded.atualizado_por;

     if p ? 'presenca' then
       delete from presencas where gira_data = v_data;
       insert into presencas (gira_data, pessoa_id, status)
       select v_data, e.key::uuid, e.value #>> '{}'
       from jsonb_each(coalesce(p -> 'presenca', '{}'::jsonb)) e
       -- o status padrão da gira não precisa ser guardado
       where e.value #>> '{}' <> (select case when pendente_padrao then 'pend' else 'p' end from giras where data = v_data)
         and exists (select 1 from pessoas ps where ps.id = e.key::uuid);
     end if;

     if p ? 'pares' then
       delete from duplas where gira_data = v_data and tipo = 'cambone';
       insert into duplas (gira_data, tipo, medium_id, pessoa_id, fixo, remanejado)
       select v_data, 'cambone', (e ->> 'm')::uuid, (e ->> 'c')::uuid,
              coalesce((e ->> 'fixo')::boolean, false), coalesce((e ->> 'remanejado')::boolean, false)
       from jsonb_array_elements(coalesce(p -> 'pares', '[]'::jsonb)) e
       where exists (select 1 from pessoas ps where ps.id = (e ->> 'm')::uuid)
         and exists (select 1 from pessoas ps where ps.id = (e ->> 'c')::uuid);
     end if;

     if p ? 'passes' then
       delete from duplas where gira_data = v_data and tipo = 'passe';
       insert into duplas (gira_data, tipo, medium_id, pessoa_id, fixo, remanejado)
       select v_data, 'passe', (e ->> 'm')::uuid, (e ->> 'c')::uuid,
              coalesce((e ->> 'fixo')::boolean, false), coalesce((e ->> 'remanejado')::boolean, false)
       from jsonb_array_elements(coalesce(p -> 'passes', '[]'::jsonb)) e
       where exists (select 1 from pessoas ps where ps.id = (e ->> 'm')::uuid)
         and exists (select 1 from pessoas ps where ps.id = (e ->> 'c')::uuid);
     end if;

     return gira_json(v_data);
   end;
   $$`,
  `create or replace function gira_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from giras where data = (p ->> 'data')::date;
     return jsonb_build_object('ok', found);
   end;
   $$`,

  // ================================================== v3: compra de ervas
  `create table if not exists ervas (
     id         uuid primary key default gen_random_uuid(),
     nome       text not null check (length(btrim(nome)) between 1 and 60),
     preco      numeric(10, 2) check (preco >= 0 and preco <= 100000),  -- vazio = preço a definir
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists ervas_nome_unico on ervas (lower(btrim(nome)))`,
  // v5: o preço pode ficar para o fim da compra
  `alter table ervas alter column preco drop not null`,
  // Quem escolheu o quê. pessoa_chave: "u:<id do usuário>" ou "n:<nome>" (acesso da corrente)
  `create table if not exists ervas_escolhas (
     pessoa_chave   text not null check (length(pessoa_chave) between 3 and 120),
     pessoa_nome    text not null check (length(btrim(pessoa_nome)) between 1 and 80),
     erva_id        uuid not null references ervas (id) on delete cascade,
     quantidade     integer not null check (quantidade between 1 and 99),
     atualizado_em  timestamptz not null default now(),
     primary key (pessoa_chave, erva_id)
   )`,
  `insert into sistema (chave, valor) values ('ervas_frete', '0') on conflict (chave) do nothing`,
  `insert into sistema (chave, valor) values ('ervas_aberta', 'true') on conflict (chave) do nothing`,
  // v9: nome da gira e data do evento do pedido (só o admin altera)
  `insert into sistema (chave, valor) values ('ervas_gira', '') on conflict (chave) do nothing`,
  `insert into sistema (chave, valor) values ('ervas_data', '') on conflict (chave) do nothing`,
  `create or replace function erva_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from ervas where id = (p ->> 'id')::uuid;
     return ervas_estado();
   end;
   $$`,
  `create or replace function ervas_config(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if p ? 'frete' then
       update sistema set valor = ((p ->> 'frete')::numeric(10, 2))::text where chave = 'ervas_frete';
     end if;
     if p ? 'gira' then
       update sistema set valor = p ->> 'gira' where chave = 'ervas_gira';
     end if;
     if p ? 'data' then
       update sistema set valor = p ->> 'data' where chave = 'ervas_data';
     end if;
     if p ? 'aberta' then
       update sistema set valor = case when (p ->> 'aberta')::boolean then 'true' else 'false' end where chave = 'ervas_aberta';
     end if;
     return ervas_estado();
   end;
   $$`,
  // Substitui as escolhas de uma pessoa. Só com a lista aberta (o admin pode com ela fechada: forcar).
  // v8: admin monta o pedido de outra pessoa (forcar).
  `create or replace function ervas_escolher(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_chave text := p ->> 'chave';
   begin
     if not coalesce((p ->> 'forcar')::boolean, false)
        and (select valor from sistema where chave = 'ervas_aberta') <> 'true' then
       raise exception 'A lista de ervas está fechada. Fale com um admin.';
     end if;
     delete from ervas_escolhas where pessoa_chave = v_chave;
     insert into ervas_escolhas (pessoa_chave, pessoa_nome, erva_id, quantidade)
     select v_chave, btrim(p ->> 'nome'), (i ->> 'ervaId')::uuid, (i ->> 'quantidade')::integer
     from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) i
     where exists (select 1 from ervas e where e.id = (i ->> 'ervaId')::uuid)
     on conflict (pessoa_chave, erva_id) do update set quantidade = excluded.quantidade;
     return ervas_estado();
   end;
   $$`,

  // ================================================== v13: oferendas
  `create table if not exists oferendas (
     id         uuid primary key default gen_random_uuid(),
     titulo     text not null check (length(btrim(titulo)) between 1 and 120),
     data       date not null,
     criado_em  timestamptz not null default now()
   )`,
  // v19: situação da oferenda. Só "publicado" aparece para a corrente.
  // As que já existiam ficam publicadas (já estavam visíveis); as novas começam "aguardando publicação".
  `alter table oferendas add column if not exists status text`,
  `update oferendas set status = 'publicado' where status is null`,
  `alter table oferendas alter column status set default 'aguardando'`,
  `alter table oferendas alter column status set not null`,
  `alter table oferendas drop constraint if exists oferendas_status_check`,
  `alter table oferendas add constraint oferendas_status_check check (status in ('rascunho', 'aguardando', 'publicado', 'encerrado'))`,
  // v20: responsável pela oferenda (uma pessoa da corrente)
  `alter table oferendas add column if not exists responsavel_id uuid references pessoas (id) on delete set null`,
  // v21: depois de publicada, fica publicada (bloquear e desbloquear não tiram isso)
  `alter table oferendas add column if not exists publicada boolean not null default false`,
  `update oferendas set publicada = true where status = 'publicado' and not publicada`,
  // entrega vazia = no dia do evento
  `create table if not exists oferenda_itens (
     id           uuid primary key default gen_random_uuid(),
     oferenda_id  uuid not null references oferendas (id) on delete cascade,
     nome         text not null check (length(btrim(nome)) between 1 and 80),
     quantidade   integer not null check (quantidade between 1 and 10000),
     entrega      date,
     entregue     boolean not null default false,
     criado_em    timestamptz not null default now()
   )`,
  `create index if not exists oferenda_itens_oferenda on oferenda_itens (oferenda_id)`,
  `create table if not exists oferenda_doacoes (
     item_id        uuid not null references oferenda_itens (id) on delete cascade,
     pessoa_chave   text not null check (length(pessoa_chave) between 3 and 120),
     pessoa_nome    text not null check (length(btrim(pessoa_nome)) between 1 and 80),
     quantidade     integer not null check (quantidade between 1 and 10000),
     atualizado_em  timestamptz not null default now(),
     primary key (item_id, pessoa_chave)
   )`,
  `create or replace function oferenda_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from oferendas where id = (p ->> 'id')::uuid;
     return oferendas_estado();
   end;
   $$`,
  `create or replace function oferenda_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_doado int;
   begin
     if nullif(p ->> 'id', '') is null then
       insert into oferenda_itens (oferenda_id, nome, quantidade, entrega)
       values ((p ->> 'oferendaId')::uuid, btrim(p ->> 'nome'), (p ->> 'quantidade')::int, nullif(p ->> 'entrega', '')::date);
     else
       select coalesce(sum(quantidade), 0) into v_doado from oferenda_doacoes where item_id = (p ->> 'id')::uuid;
       if (p ->> 'quantidade')::int < v_doado then
         raise exception 'Já foram prometidos % deste item; a quantidade não pode ser menor.', v_doado;
       end if;
       update oferenda_itens set nome = btrim(p ->> 'nome'), quantidade = (p ->> 'quantidade')::int,
              entrega = nullif(p ->> 'entrega', '')::date
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return oferendas_estado();
   end;
   $$`,
  `create or replace function oferenda_item_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from oferenda_itens where id = (p ->> 'id')::uuid;
     return oferendas_estado();
   end;
   $$`,
  `create or replace function oferenda_item_entregue(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_itens set entregue = (p ->> 'entregue')::boolean where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Item não encontrado.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v14: perfis admin_oferendas e admin_ervas
  `alter table usuarios drop constraint if exists usuarios_papel_check`,
  // (v35: os perfis passaram para a tabela perfis; o check fixo saiu)

  // ================================================== v15: acesso da corrente ligado à pessoa cadastrada
  // Passa para a chave da pessoa ("p:<id>") o que foi preenchido com chaves antigas ("n:<nome>").
  `create or replace function corrente_vincular(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_chave text := p ->> 'chave';
     v_nome text := p ->> 'nome';
     v_antigas text[] := array(select jsonb_array_elements_text(coalesce(p -> 'antigas', '[]'::jsonb)));
   begin
     insert into ervas_escolhas (pessoa_chave, pessoa_nome, erva_id, quantidade)
     select v_chave, v_nome, erva_id, quantidade from ervas_escolhas where pessoa_chave = any(v_antigas)
     on conflict (pessoa_chave, erva_id) do nothing;
     delete from ervas_escolhas where pessoa_chave = any(v_antigas);
     insert into oferenda_doacoes (item_id, pessoa_chave, pessoa_nome, quantidade)
     select item_id, v_chave, v_nome, quantidade from oferenda_doacoes where pessoa_chave = any(v_antigas)
     on conflict (item_id, pessoa_chave) do nothing;
     delete from oferenda_doacoes where pessoa_chave = any(v_antigas);
     return jsonb_build_object('ok', true);
   end;
   $$`,

  // ================================================== v17: usuário ligado ao cadastro de pessoas
  // Liga quem tem o mesmo nome de uma pessoa da corrente (os outros o admin liga na aba Usuários).
  `update usuarios u set pessoa_id = pe.id
     from pessoas pe
    where u.pessoa_id is null and u.papel <> 'root'
      and lower(btrim(pe.nome)) = lower(btrim(u.nome))
      and not exists (select 1 from usuarios x where x.pessoa_id = pe.id)`,
  // Quem instalou o app (o primeiro admin, sem cadastro na corrente) vira o admin root.
  `update usuarios set papel = 'root'
    where id = (select id from usuarios where papel = 'admin' and pessoa_id is null order by criado_em limit 1)
      and not exists (select 1 from usuarios where papel = 'root')`,
  // O que o usuário preencheu com a conta passa para o cadastro da pessoa (o mesmo do acesso da corrente).
  `insert into ervas_escolhas (pessoa_chave, pessoa_nome, erva_id, quantidade)
   select 'p:' || u.pessoa_id, x.pessoa_nome, x.erva_id, x.quantidade
     from ervas_escolhas x join usuarios u on x.pessoa_chave = 'u:' || u.id::text
    where u.pessoa_id is not null
   on conflict (pessoa_chave, erva_id) do nothing`,
  `delete from ervas_escolhas x using usuarios u where x.pessoa_chave = 'u:' || u.id::text and u.pessoa_id is not null`,
  `insert into oferenda_doacoes (item_id, pessoa_chave, pessoa_nome, quantidade)
   select x.item_id, 'p:' || u.pessoa_id, x.pessoa_nome, x.quantidade
     from oferenda_doacoes x join usuarios u on x.pessoa_chave = 'u:' || u.id::text
    where u.pessoa_id is not null
   on conflict (item_id, pessoa_chave) do nothing`,
  `delete from oferenda_doacoes x using usuarios u where x.pessoa_chave = 'u:' || u.id::text and u.pessoa_id is not null`,

  // ================================================== v19
  `create or replace function oferenda_status(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferendas set status = p ->> 'status', publicada = publicada or (p ->> 'status') = 'publicado'
      where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Oferenda não encontrada.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v24: oferenda com uma linha para cada médium
  // Cada médium (Médium, Extra e Passe) tem uma situação: pendente, entregue, pago, não pago ou não vai.
  `alter table oferendas add column if not exists por_medium boolean not null default false`,
  `create table if not exists oferenda_mediuns (
     oferenda_id    uuid not null references oferendas (id) on delete cascade,
     pessoa_id      uuid not null references pessoas (id) on delete cascade,
     status         text not null default 'pendente' check (status in ('pendente', 'entregue', 'pago', 'nao_pago', 'nao_vai')),
     atualizado_em  timestamptz not null default now(),
     primary key (oferenda_id, pessoa_id)
   )`,
  // v31: médium tirado da lista da oferenda (continua marcado para não voltar com "Incluir novos médiuns")
  `alter table oferenda_mediuns add column if not exists excluido boolean not null default false`,
  `create or replace function oferenda_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid;
   begin
     if nullif(p ->> 'id', '') is null then
       insert into oferendas (titulo, data, responsavel_id, por_medium)
       values (btrim(p ->> 'titulo'), (p ->> 'data')::date, nullif(p ->> 'responsavelId', '')::uuid,
               coalesce((p ->> 'porMedium')::boolean, false))
       returning id into v_id;
       if coalesce((p ->> 'porMedium')::boolean, false) then
         insert into oferenda_mediuns (oferenda_id, pessoa_id)
         select v_id, id from pessoas;   -- v32: todos os cadastrados
       end if;
     else
       update oferendas set titulo = btrim(p ->> 'titulo'), data = (p ->> 'data')::date,
              responsavel_id = case when p ? 'responsavelId' then nullif(p ->> 'responsavelId', '')::uuid else responsavel_id end
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Oferenda não encontrada.'; end if;
     end if;
     return oferendas_estado();
   end;
   $$`,

  // v28: giras ainda em aberto, de hoje em diante, passam a usar "pendente" como padrão
  // (quem não foi marcado deixa de contar como presente até o admin confirmar).
  `update giras set pendente_padrao = true where not encerrada and not pendente_padrao and data >= current_date`,
  `create or replace function oferenda_medium_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_mediuns set excluido = true, atualizado_em = now()
     where oferenda_id = (p ->> 'oferendaId')::uuid and pessoa_id = (p ->> 'pessoaId')::uuid;
     if not found then raise exception 'Médium não está nesta oferenda.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // v33: perfil da pessoa (orixás, guias e outros guias) — só ela vê e edita, na aba Perfil.
  `alter table pessoas add column if not exists perfil jsonb not null default '{}'::jsonb`,
  `create or replace function perfil_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update pessoas set perfil = coalesce(p -> 'perfil', '{}'::jsonb) where id = (p ->> 'pessoaId')::uuid;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     return perfil_ler(p);
   end;
   $$`,

  // ================================================== v35: perfis no banco (o root cria e edita)
  `create table if not exists perfis (
     chave      text primary key check (chave ~ '^[a-z0-9_]{2,40}$'),
     nome       text not null check (length(btrim(nome)) between 1 and 40),
     abas       jsonb not null default '{}'::jsonb,
     ordem      integer not null default 50,
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists perfis_nome_unico on perfis (lower(btrim(nome)))`,
  ...PERFIS_PADRAO.map((p) => `insert into perfis (chave, nome, abas, ordem)
     values ('${p.chave}', '${p.nome}', '${JSON.stringify(p.abas)}'::jsonb, ${p.ordem}) on conflict do nothing`),
  `alter table usuarios drop constraint if exists usuarios_papel_check`,
  `alter table usuarios drop constraint if exists usuarios_papel_fk`,
  `alter table usuarios add constraint usuarios_papel_fk foreign key (papel) references perfis (chave)`,
  // O usuário leva junto as abas do perfil (o backend calcula as permissões).
  `create or replace function usuario_json(u usuarios)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', u.id, 'nome', coalesce((select nome from pessoas where id = u.pessoa_id), u.nome),
                               'pessoaId', u.pessoa_id, 'email', u.email, 'papel', u.papel,
                               'papelNome', (select nome from perfis where chave = u.papel),
                               'abas', (select abas from perfis where chave = u.papel),
                               'sessaoVersao', u.sessao_versao, 'criadoEm', u.criado_em);
   $$`,
  `create or replace function perfis_config(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('chave', f.chave, 'nome', f.nome, 'abas', f.abas,
                     'usuarios', (select count(*) from usuarios u where u.papel = f.chave)) order by f.ordem, lower(f.nome)), '[]'::jsonb)
     from perfis f
   $$`,
  `create or replace function perfil_config_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'chave', '') = '' then
       insert into perfis (chave, nome, abas, ordem)
       values ('p_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), btrim(p ->> 'nome'), coalesce(p -> 'abas', '{}'::jsonb), 50);
     else
       update perfis set
         nome = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
         abas = case when p ? 'abas' then p -> 'abas' else abas end
       where chave = p ->> 'chave';
       if not found then raise exception 'Perfil não encontrado.'; end if;
     end if;
     return perfis_config();
   exception when unique_violation then
     raise exception 'Já existe um perfil com esse nome.';
   end;
   $$`,
  `create or replace function perfil_config_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if exists (select 1 from usuarios where papel = p ->> 'chave') then
       raise exception 'Ainda há usuários com esse perfil. Troque o perfil deles antes.';
     end if;
     delete from perfis where chave = p ->> 'chave';
     if not found then raise exception 'Perfil não encontrado.'; end if;
     return perfis_config();
   end;
   $$`,

  // ================================================== v35: senha (PIN) de quem entra pelo acesso da corrente
  `alter table pessoas add column if not exists pin_hash text`,
  `alter table pessoas add column if not exists pin_versao integer not null default 0`,
  // Confere a sessão da corrente: a versão muda quando a senha é criada ou alterada.
  `create or replace function corrente_sessao(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('nome', pe.nome, 'pinVersao', pe.pin_versao, 'temSenha', pe.pin_hash is not null,
                               'abas', (select abas from perfis where chave = 'corrente'),
                               'papelNome', (select nome from perfis where chave = 'corrente'))
     from pessoas pe where pe.id = (p ->> 'pessoaId')::uuid
   $$`,
  `create or replace function pessoa_pin(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('pinHash', pe.pin_hash, 'pinVersao', pe.pin_versao,
                               'bloqueadoAte', (select bloqueado_ate from login_falhas where email = 'pin:' || pe.id::text and bloqueado_ate > now()))
     from pessoas pe where pe.id = (p ->> 'pessoaId')::uuid
   $$`,
  // p = { pessoaId, pinHash, soSeVazio }: cria (só se ainda não tiver) ou troca a senha.
  `create or replace function pin_definir(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_versao int;
   begin
     if coalesce((p ->> 'soSeVazio')::boolean, false)
        and exists (select 1 from pessoas where id = (p ->> 'pessoaId')::uuid and pin_hash is not null) then
       raise exception 'Você já tem senha.';
     end if;
     update pessoas set pin_hash = nullif(p ->> 'pinHash', ''), pin_versao = pin_versao + 1
     where id = (p ->> 'pessoaId')::uuid returning pin_versao into v_versao;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     delete from login_falhas where email = 'pin:' || (p ->> 'pessoaId');
     return jsonb_build_object('pinVersao', v_versao);
   end;
   $$`,

  // ================================================== v35: alunos da CPJ (fora da corrente: só o cadastro por turma)
  `create table if not exists turmas_alunos (
     id         uuid primary key default gen_random_uuid(),
     nome       text not null check (length(btrim(nome)) between 1 and 40),
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists turmas_alunos_nome_unico on turmas_alunos (lower(btrim(nome)))`,
  `insert into turmas_alunos (nome) values ('Turma 09'), ('Turma 10'), ('Turma 11') on conflict do nothing`,
  `create table if not exists alunos (
     id         uuid primary key default gen_random_uuid(),
     nome       text not null check (length(btrim(nome)) between 1 and 80),
     turma_id   uuid references turmas_alunos (id) on delete set null,
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists alunos_nome_unico on alunos (lower(btrim(nome)))`,
  `create or replace function aluno_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set
       nome     = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
       turma_id = case when p ? 'turmaId' then nullif(p ->> 'turmaId', '')::uuid else turma_id end
     where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     return alunos_estado();
   exception when unique_violation then
     raise exception 'Já existe um aluno com esse nome.';
   end;
   $$`,
  `create or replace function turma_aluno_criar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into turmas_alunos (nome) values (btrim(p ->> 'nome'));
     return alunos_estado();
   exception when unique_violation then
     raise exception 'Essa turma já existe.';
   end;
   $$`,

  // ================================================== v36: oferenda completa (100%) há mais de um dia: fecha as doações
  `alter table oferendas add column if not exists completa_em timestamptz`,
  // Marca quando todos os itens ficaram completos (e desmarca se voltar a faltar),
  // mas depois de fechada (um dia completa) continua fechada.
  `create or replace function oferenda_conferir_completa(v_of uuid)
   returns void language plpgsql as $$
   declare v_completa boolean;
   begin
     select exists (select 1 from oferenda_itens i where i.oferenda_id = v_of)
        and not exists (select 1 from oferenda_itens i where i.oferenda_id = v_of
                        and i.quantidade > coalesce((select sum(d.quantidade) from oferenda_doacoes d where d.item_id = i.id), 0))
       into v_completa;
     update oferendas set completa_em = case
         when completa_em is not null and completa_em <= now() - interval '1 day' then completa_em
         when v_completa then coalesce(completa_em, now())
         else null end
     where id = v_of;
   end;
   $$`,
  `create or replace function oferenda_completa_trg()
   returns trigger language plpgsql as $$
   declare v_of uuid;
   begin
     if tg_table_name = 'oferenda_itens' then
       v_of := case when tg_op = 'DELETE' then old.oferenda_id else new.oferenda_id end;
     else
       select oferenda_id into v_of from oferenda_itens
       where id = case when tg_op = 'DELETE' then old.item_id else new.item_id end;
     end if;
     if v_of is not null then perform oferenda_conferir_completa(v_of); end if;
     return null;
   end;
   $$`,
  `drop trigger if exists oferenda_doacoes_completa on oferenda_doacoes`,
  `create trigger oferenda_doacoes_completa after insert or update or delete on oferenda_doacoes
   for each row execute function oferenda_completa_trg()`,
  `drop trigger if exists oferenda_itens_completa on oferenda_itens`,
  `create trigger oferenda_itens_completa after insert or update of quantidade or delete on oferenda_itens
   for each row execute function oferenda_completa_trg()`,
  // As que já estavam completas: conta desde a última doação.
  `update oferendas o set completa_em = (select max(d.atualizado_em) from oferenda_doacoes d join oferenda_itens i on i.id = d.item_id where i.oferenda_id = o.id)
   where o.completa_em is null
     and exists (select 1 from oferenda_itens i where i.oferenda_id = o.id)
     and not exists (select 1 from oferenda_itens i where i.oferenda_id = o.id
                     and i.quantidade > coalesce((select sum(d.quantidade) from oferenda_doacoes d where d.item_id = i.id), 0))`,
  `create or replace function oferenda_doar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_item uuid := (p ->> 'itemId')::uuid;
     v_chave text := p ->> 'chave';
     v_qtd int := (p ->> 'quantidade')::int;
     v_total int; v_entregue boolean; v_outros int;
     v_completa timestamptz; v_resp uuid;
   begin
     select quantidade, entregue into v_total, v_entregue from oferenda_itens where id = v_item for update;
     if not found then raise exception 'Item não encontrado.'; end if;
     if not coalesce((p ->> 'forcar')::boolean, false)
        and (select o.status from oferendas o join oferenda_itens i on i.oferenda_id = o.id where i.id = v_item) <> 'publicado' then
       raise exception 'Esta oferenda não está aberta para doações.';
     end if;
     if v_entregue and not coalesce((p ->> 'forcar')::boolean, false) then raise exception 'Este item já foi entregue.'; end if;
     -- v36: completa há mais de um dia → só o responsável altera (o admin altera pelo "doação por alguém").
     if not coalesce((p ->> 'forcar')::boolean, false) then
       select o.completa_em, o.responsavel_id into v_completa, v_resp
       from oferendas o join oferenda_itens i on i.oferenda_id = o.id where i.id = v_item;
       if v_completa is not null and v_completa <= now() - interval '1 day' and v_chave is distinct from 'p:' || v_resp::text then
         raise exception 'Esta oferenda está completa há mais de um dia: as doações estão fechadas. Só o responsável%pode alterar.',
           coalesce(' (' || (select nome from pessoas where id = v_resp) || ') ', ' ');
       end if;
     end if;
     select coalesce(sum(quantidade), 0) into v_outros from oferenda_doacoes where item_id = v_item and pessoa_chave <> v_chave;
     if v_qtd > 0 and v_outros + v_qtd > v_total then
       if v_total - v_outros <= 0 then raise exception 'Este item já está completo.'; end if;
       raise exception 'Só faltam % deste item.', v_total - v_outros;
     end if;
     -- Uma alteração só (sem apagar e inserir), para não reiniciar a contagem do "completa há um dia".
     if v_qtd > 0 then
       insert into oferenda_doacoes (item_id, pessoa_chave, pessoa_nome, quantidade)
       values (v_item, v_chave, btrim(p ->> 'nome'), v_qtd)
       on conflict (item_id, pessoa_chave) do update set quantidade = excluded.quantidade, pessoa_nome = excluded.pessoa_nome, atualizado_em = now();
     else
       delete from oferenda_doacoes where item_id = v_item and pessoa_chave = v_chave;
     end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v37: a pessoa declara a própria ausência (só a presença dela muda)
  `create or replace function presenca_marcar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into presencas (gira_data, pessoa_id, status)
     values ((p ->> 'data')::date, (p ->> 'pessoaId')::uuid, p ->> 'status')
     on conflict (gira_data, pessoa_id) do update set status = excluded.status;
     update giras set atualizado_em = now() where data = (p ->> 'data')::date;
     return gira_obter(jsonb_build_object('data', p ->> 'data'));
   end;
   $$`,

  // ================================================== v38: eventos da casa (todos veem os da semana na aba Gira)
  `create table if not exists eventos (
     id         uuid primary key default gen_random_uuid(),
     data       date not null,
     nome       text not null check (length(btrim(nome)) between 1 and 120),
     criado_em  timestamptz not null default now()
   )`,
  `create index if not exists eventos_por_data on eventos (data)`,
  // O Admin já cuida da aba Eventos (os outros perfis, o root libera na aba Usuários).
  `update perfis set abas = abas || '{"eventos": {"ver": true, "editar": true}}'::jsonb where chave = 'admin' and not (abas ? 'eventos')`,
  `create or replace function evento_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from eventos where id = (p ->> 'id')::uuid;
     return eventos_listar();
   end;
   $$`,

  // ================================================== v39: oferenda por pessoa: pagamento (Pago/Não pago) e entrega (Pendente/Entregue) separados
  `alter table oferenda_mediuns add column if not exists pagamento text not null default 'nao_pago' check (pagamento in ('pago', 'nao_pago'))`,
  `alter table oferenda_mediuns add column if not exists entrega text not null default 'pendente' check (entrega in ('pendente', 'entregue'))`,
  `alter table oferenda_mediuns drop constraint if exists oferenda_mediuns_status_check`,
  // Passa a situação antiga (um status só) para as duas conferências, uma vez ("Não vai" sai da lista).
  `update oferenda_mediuns set
     pagamento = case when status = 'pago' then 'pago' else 'nao_pago' end,
     entrega   = case when status = 'entregue' then 'entregue' else 'pendente' end,
     excluido  = excluido or status = 'nao_vai',
     status    = 'v39'
   where status in ('pendente', 'entregue', 'pago', 'nao_pago', 'nao_vai')`,
  `alter table oferenda_mediuns alter column status set default 'v39'`,
  `create or replace function oferenda_medium_status(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_mediuns set
       pagamento = case when p ? 'pagamento' then p ->> 'pagamento' else pagamento end,
       entrega   = case when p ? 'entrega' then p ->> 'entrega' else entrega end,
       atualizado_em = now()
     where oferenda_id = (p ->> 'oferendaId')::uuid and pessoa_id = (p ->> 'pessoaId')::uuid;
     if not found then raise exception 'Pessoa não está nesta oferenda.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v40: tipo do evento
  `alter table eventos add column if not exists tipo text not null default 'evento' check (tipo in ('gira', 'amaci', 'aviso', 'evento'))`,
  `create or replace function eventos_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'nome', nome, 'tipo', tipo) order by data, lower(nome)), '[]'::jsonb) from eventos
   $$`,
  `create or replace function evento_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'id', '') = '' then
       insert into eventos (data, nome, tipo) values ((p ->> 'data')::date, btrim(p ->> 'nome'), coalesce(p ->> 'tipo', 'evento'));
     else
       update eventos set data = (p ->> 'data')::date, nome = btrim(p ->> 'nome'), tipo = coalesce(p ->> 'tipo', tipo) where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Evento não encontrado.'; end if;
     end if;
     return eventos_listar();
   end;
   $$`,

  // ================================================== v41: afinidade com as entidades (aba Perfil)
  // A da própria função fica em pessoas.linhas (Extra → atendimento extra; Passe → passe).
  // As outras: Passe marca também o atendimento extra; Cambone marca o passe.
  `alter table pessoas add column if not exists afinidade_extra text[] not null default '{}'`,
  `alter table pessoas add column if not exists afinidade_passe text[] not null default '{}'`,
  `create or replace function perfil_ler(p jsonb)
   returns jsonb language plpgsql as $$
   declare r jsonb;
   begin
     select jsonb_build_object('pessoaId', id, 'nome', nome, 'perfil', perfil, 'funcao', funcao, 'linhas', to_jsonb(linhas),
                               'afinidadeExtra', to_jsonb(afinidade_extra), 'afinidadePasse', to_jsonb(afinidade_passe)) into r
     from pessoas where id = (p ->> 'pessoaId')::uuid;
     if r is null then raise exception 'Pessoa não encontrada.'; end if;
     return r;
   end;
   $$`,
  `create or replace function afinidade_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_l text[] := array(select distinct jsonb_array_elements_text(coalesce(p -> 'linhas', '[]'::jsonb)) order by 1);
   begin
     if p ->> 'campo' = 'linhas' then update pessoas set linhas = v_l where id = (p ->> 'pessoaId')::uuid;
     elsif p ->> 'campo' = 'extra' then update pessoas set afinidade_extra = v_l where id = (p ->> 'pessoaId')::uuid;
     elsif p ->> 'campo' = 'passe' then update pessoas set afinidade_passe = v_l where id = (p ->> 'pessoaId')::uuid;
     else raise exception 'Campo inválido.'; end if;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     return perfil_ler(p);
   end;
   $$`,

  // ================================================== v42: escala publicada (até publicar, só quem edita a gira vê o sorteio)
  `alter table giras add column if not exists publicada boolean`,
  // As giras que já existiam continuam visíveis como antes (só roda uma vez: depois não há mais nulos).
  `update giras set publicada = true where publicada is null`,
  `alter table giras alter column publicada set default false`,
  `create or replace function gira_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update giras set publicada = coalesce((p ->> 'publicada')::boolean, true), atualizado_em = now() where data = (p ->> 'data')::date;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json((p ->> 'data')::date);
   end;
   $$`,
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'papeis', g.papeis,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,

  // ================================================== v43: a lista de pessoas leva o nome dos guias de atendimento (todos veem)

  // ================================================== v44: oferenda "uma linha por pessoa" com os grupos escolhidos
  // grupos: funções da corrente ('medium', 'extra', 'passe', 'cambone', 'senha', 'curimba') e/ou 'alunos'. Nulo = toda a corrente (as antigas).
  `alter table oferendas add column if not exists grupos text[]`,
  `create table if not exists oferenda_alunos (
     oferenda_id    uuid not null references oferendas (id) on delete cascade,
     aluno_id       uuid not null references alunos (id) on delete cascade,
     pagamento      text not null default 'nao_pago' check (pagamento in ('pago', 'nao_pago')),
     entrega        text not null default 'pendente' check (entrega in ('pendente', 'entregue')),
     excluido       boolean not null default false,
     atualizado_em  timestamptz not null default now(),
     primary key (oferenda_id, aluno_id)
   )`,
  `create or replace function oferenda_aluno_status(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_alunos set
       pagamento = case when p ? 'pagamento' then p ->> 'pagamento' else pagamento end,
       entrega   = case when p ? 'entrega' then p ->> 'entrega' else entrega end,
       atualizado_em = now()
     where oferenda_id = (p ->> 'oferendaId')::uuid and aluno_id = (p ->> 'alunoId')::uuid;
     if not found then raise exception 'Aluno não está nesta oferenda.'; end if;
     return oferendas_estado();
   end;
   $$`,
  `create or replace function oferenda_aluno_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_alunos set excluido = true, atualizado_em = now()
     where oferenda_id = (p ->> 'oferendaId')::uuid and aluno_id = (p ->> 'alunoId')::uuid;
     if not found then raise exception 'Aluno não está nesta oferenda.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v45: pessoas com afinidade (sugestão de passe/atendimento extra) e aniversário (só dia/mês)

  // ================================================== v46: na aba Pessoas, o admin também altera as afinidades
  `create or replace function pessoas_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     update pessoas set
       nome       = case when p ? 'nome'       then btrim(p ->> 'nome')            else nome end,
       funcao     = case when p ? 'funcao'     then p ->> 'funcao'                 else funcao end,
       experiente = case when p ? 'experiente' then (p ->> 'experiente')::boolean else experiente end,
       linhas     = case when p ? 'linhas'
                         then array(select distinct jsonb_array_elements_text(p -> 'linhas') order by 1)
                         else linhas end,
       afinidade_extra = case when p ? 'afinidadeExtra'
                         then array(select distinct jsonb_array_elements_text(p -> 'afinidadeExtra') order by 1)
                         else afinidade_extra end,
       afinidade_passe = case when p ? 'afinidadePasse'
                         then array(select distinct jsonb_array_elements_text(p -> 'afinidadePasse') order by 1)
                         else afinidade_passe end,
       limpeza    = case when p ? 'limpeza' then nullif(p ->> 'limpeza', '')::smallint else limpeza end,
       entrada    = case when p ? 'entrada' then nullif(p ->> 'entrada', '')::date else entrada end,
       saida      = case when p ? 'saida' then nullif(p ->> 'saida', '')::date else saida end
     where id = v_id;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     return (select to_jsonb(x) from (select id, nome, funcao, experiente, linhas, limpeza, entrada,
                                             afinidade_extra as "afinidadeExtra", afinidade_passe as "afinidadePasse" from pessoas where id = v_id) x);
   end;
   $$`,

  // ================================================== v47: Extra/Passe sem nenhuma linha marcada passa a ser "não apto a nenhuma".
  // Quem estava assim (antes valia "em todas as giras") ganha todas as linhas marcadas, uma vez só (marca em sistema).
  `do $$
   begin
     if not exists (select 1 from sistema where chave = 'v47_linhas_todas') then
       update pessoas set linhas = '{preto-velho,malandro,baiano,cigano,marinheiro,boiadeiro,eres,caboclo,mista,exu,pomba-gira,exu-mirim,exus-pombagira}'::text[]
        where funcao in ('extra', 'passe') and coalesce(array_length(linhas, 1), 0) = 0;
       insert into sistema (chave, valor) values ('v47_linhas_todas', 'ok');
     end if;
   end $$`,

  // ================================================== v48: "Incluir novos cadastrados" com a escolha dos grupos

  // ================================================== v49: oferenda por pessoa: acrescentar uma pessoa do cadastro (ou aluno) na lista
  `create or replace function oferenda_pessoa_incluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_of uuid := (p ->> 'oferendaId')::uuid;
   begin
     if not exists (select 1 from oferendas where id = v_of and por_medium) then raise exception 'Oferenda não encontrada.'; end if;
     if p ? 'alunoId' then
       if not exists (select 1 from alunos where id = (p ->> 'alunoId')::uuid) then raise exception 'Aluno não encontrado.'; end if;
       insert into oferenda_alunos (oferenda_id, aluno_id) values (v_of, (p ->> 'alunoId')::uuid)
       on conflict (oferenda_id, aluno_id) do update set excluido = false, atualizado_em = now();
     else
       if not exists (select 1 from pessoas where id = (p ->> 'pessoaId')::uuid) then raise exception 'Pessoa não encontrada.'; end if;
       insert into oferenda_mediuns (oferenda_id, pessoa_id) values (v_of, (p ->> 'pessoaId')::uuid)
       on conflict (oferenda_id, pessoa_id) do update set excluido = false, atualizado_em = now();
     end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v50: ervas: quantidade da compra (o admin monta o pedido no bloco Compra)
  // e quantas pessoas uma porção serve (vazio = uma porção atende todos). O preço passa a ser o de uma porção.
  `alter table ervas add column if not exists qtd_compra integer not null default 0 check (qtd_compra between 0 and 999)`,
  `alter table ervas add column if not exists pessoas_porcao integer check (pessoas_porcao between 1 and 999)`,
  // Salva o bloco Compra de uma vez: gira, data, frete e a quantidade/preço de cada erva.
  `create or replace function ervas_compra_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare i jsonb;
   begin
     perform ervas_config(p - 'itens' - 'aberta');
     for i in select * from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
       update ervas set qtd_compra = (i ->> 'quantidade')::integer, preco = (i ->> 'preco')::numeric
        where id = (i ->> 'id')::uuid;
     end loop;
     return ervas_estado();
   end;
   $$`,
  // Nova compra: apaga as escolhas, zera as quantidades da compra e reabre a lista (o catálogo, os preços e o frete ficam).
  `create or replace function ervas_nova_compra(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from ervas_escolhas;
     update ervas set qtd_compra = 0 where qtd_compra <> 0;
     update sistema set valor = 'true' where chave = 'ervas_aberta';
     return ervas_estado();
   end;
   $$`,

  // ================================================== v51: ervas: frete padrão de R$ 60,00
  // Só uma vez (marcador ervas_frete_padrao): quem ainda estava com frete 0 passa a 60; depois o admin muda à vontade.
  `update sistema set valor = '60.00' where chave = 'ervas_frete' and valor::numeric = 0
     and not exists (select 1 from sistema where chave = 'ervas_frete_padrao')`,
  `insert into sistema (chave, valor) values ('ervas_frete_padrao', '60') on conflict (chave) do nothing`,

  // ================================================== v53: ervas: histórico de compras (encerrar guarda o retrato da compra)
  `create table if not exists ervas_compras (
     id           uuid primary key default gen_random_uuid(),
     gira         text not null default '',
     data         text not null default '',             -- data do evento ('AAAA-MM-DD' ou vazio)
     resumo       jsonb not null,                       -- shared/ervas.js resumoCompra (valores em centavos)
     encerrada_em timestamptz not null default now()
   )`,

  // ================================================== v54: ervas: fechar a lista já guarda a compra atual no histórico
  // ervas_compra_atual: id da linha do histórico da compra em andamento ('' = ainda não guardada).
  // Fechar de novo atualiza a mesma linha; Encerrar grava a versão final; Descartar tira a linha do histórico.
  `insert into sistema (chave, valor) values ('ervas_compra_atual', '') on conflict (chave) do nothing`,
  `create or replace function ervas_historico(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'gira', c.gira, 'data', c.data, 'resumo', c.resumo, 'encerradaEm', c.encerrada_em,
                                                  'atual', c.id::text = (select valor from sistema where chave = 'ervas_compra_atual'))
                               order by c.encerrada_em desc), '[]'::jsonb)
     from ervas_compras c
   $$`,
  `create or replace function ervas_compra_encerrar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     perform ervas_compra_guardar(p);
     update sistema set valor = '' where chave = 'ervas_compra_atual';
     return ervas_nova_compra();
   end;
   $$`,
  `create or replace function ervas_compra_descartar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from ervas_compras where id::text = (select valor from sistema where chave = 'ervas_compra_atual');
     update sistema set valor = '' where chave = 'ervas_compra_atual';
     return ervas_nova_compra();
   end;
   $$`,

  // ================================================== v55: ervas: o histórico não repete nome de gira + data
  // Guardar (fechar a lista ou encerrar) procura no histórico uma compra com o mesmo nome de gira e a mesma data
  // (sem diferença de maiúscula) e atualiza essa linha — pode ser a mesma compra, reaberta e alterada.
  // Se a compra atual já tinha outra linha, ela some (fica uma só).
  `create or replace function ervas_compra_guardar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_atual uuid;
     v_id uuid;
     v_gira text := coalesce(p ->> 'gira', '');
     v_data text := coalesce(p ->> 'data', '');
   begin
     select c.id into v_atual from ervas_compras c
      where c.id::text = (select valor from sistema where chave = 'ervas_compra_atual');
     select c.id into v_id from ervas_compras c
      where lower(btrim(c.gira)) = lower(btrim(v_gira)) and c.data = v_data
      order by (c.id = v_atual) desc nulls last, c.encerrada_em desc limit 1;
     v_id := coalesce(v_id, v_atual);
     if v_id is null then
       insert into ervas_compras (gira, data, resumo) values (v_gira, v_data, p -> 'resumo') returning id into v_id;
     else
       update ervas_compras set gira = v_gira, data = v_data, resumo = p -> 'resumo', encerrada_em = now() where id = v_id;
       delete from ervas_compras where id = v_atual and id <> v_id;
     end if;
     update sistema set valor = v_id::text where chave = 'ervas_compra_atual';
     return ervas_estado();
   end;
   $$`,

  // ================================================== v56: trocar a data programada de uma gira
  // A data é a chave da gira e presenças/duplas apontam para ela (sem "on update cascade"): cria a gira na data
  // nova com a mesma linha (todas as colunas, sem precisar listá-las), passa presenças e duplas e apaga a antiga.
  // Quem chama confere antes que a gira existe, está em aberto e que a data nova está livre.
  `create or replace function gira_mudar_data(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_de date := (p ->> 'data')::date;
     v_para date := (p ->> 'para')::date;
   begin
     insert into giras
     select (jsonb_populate_record(null::giras, to_jsonb(g) || jsonb_build_object('data', v_para, 'atualizado_em', now()))).*
       from giras g where g.data = v_de;
     update presencas set gira_data = v_para where gira_data = v_de;
     update duplas set gira_data = v_para where gira_data = v_de;
     delete from giras where data = v_de;
     return gira_obter(jsonb_build_object('data', v_para));
   end;
   $$`,

  // ================================================== v57: aba Curimba (controle à parte: alunos, aulas e presença)
  // O aluno pode ser alguém da corrente (pessoa_id: o nome vem do cadastro) ou de fora (só o nome).
  `create table if not exists curimba_alunos (
     id         uuid primary key default gen_random_uuid(),
     nome       text not null check (length(btrim(nome)) between 1 and 80),
     pessoa_id  uuid references pessoas (id) on delete set null,
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists curimba_alunos_pessoa on curimba_alunos (pessoa_id) where pessoa_id is not null`,
  // Uma aula por dia.
  `create table if not exists curimba_aulas (
     id         uuid primary key default gen_random_uuid(),
     data       date not null unique,
     nome       text not null default '' check (length(nome) <= 120),
     criado_em  timestamptz not null default now()
   )`,
  `create table if not exists curimba_presencas (
     aula_id   uuid not null references curimba_aulas (id) on delete cascade,
     aluno_id  uuid not null references curimba_alunos (id) on delete cascade,
     status    text not null check (status in ('p', 'f')),
     primary key (aula_id, aluno_id)
   )`,
  `create or replace function curimba_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'alunos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', coalesce(pe.nome, a.nome), 'pessoaId', a.pessoa_id)
                                            order by lower(coalesce(pe.nome, a.nome)))
                           from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id), '[]'::jsonb),
       'aulas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data, 'nome', nome) order by data) from curimba_aulas), '[]'::jsonb),
       'presencas', coalesce((select jsonb_agg(jsonb_build_object('aulaId', aula_id, 'alunoId', aluno_id, 'status', status)) from curimba_presencas), '[]'::jsonb))
   $$`,
  // p = { pessoaId } (da corrente) ou { nome } (de fora).
  `create or replace function curimba_aluno_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_pessoa uuid := nullif(p ->> 'pessoaId', '')::uuid;
     v_nome text := btrim(coalesce(p ->> 'nome', ''));
   begin
     if v_pessoa is not null then
       select nome into v_nome from pessoas where id = v_pessoa;
       if not found then raise exception 'Pessoa não encontrada.'; end if;
       if exists (select 1 from curimba_alunos where pessoa_id = v_pessoa) then raise exception 'Essa pessoa já é aluna da curimba.'; end if;
     elsif exists (select 1 from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id
                    where lower(btrim(coalesce(pe.nome, a.nome))) = lower(v_nome)) then
       raise exception 'Já existe um aluno com esse nome.';
     end if;
     insert into curimba_alunos (nome, pessoa_id) values (v_nome, v_pessoa);
     return curimba_estado();
   end;
   $$`,
  `create or replace function curimba_aluno_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from curimba_alunos where id = (p ->> 'id')::uuid;
     return curimba_estado();
   end;
   $$`,
  `create or replace function curimba_aula_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'id', '') = '' then
       insert into curimba_aulas (data, nome) values ((p ->> 'data')::date, btrim(coalesce(p ->> 'nome', '')));
     else
       update curimba_aulas set data = (p ->> 'data')::date, nome = btrim(coalesce(p ->> 'nome', '')) where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Aula não encontrada.'; end if;
     end if;
     return curimba_estado();
   exception when unique_violation then
     raise exception 'Já existe uma aula nesta data.';
   end;
   $$`,
  `create or replace function curimba_aula_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from curimba_aulas where id = (p ->> 'id')::uuid;
     return curimba_estado();
   end;
   $$`,
  // p = { aulaId, alunoId, status: 'p' | 'f' | '' } — vazio tira a marcação.
  `create or replace function curimba_presenca(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'status', '') = '' then
       delete from curimba_presencas where aula_id = (p ->> 'aulaId')::uuid and aluno_id = (p ->> 'alunoId')::uuid;
     else
       insert into curimba_presencas (aula_id, aluno_id, status) values ((p ->> 'aulaId')::uuid, (p ->> 'alunoId')::uuid, p ->> 'status')
       on conflict (aula_id, aluno_id) do update set status = excluded.status;
     end if;
     return curimba_estado();
   end;
   $$`,
  // Aba Gira: as aulas de quem está logado (null se a pessoa não é aluna da curimba).
  `create or replace function curimba_minha(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('aulas', coalesce((select jsonb_agg(jsonb_build_object('data', au.data, 'nome', au.nome, 'status', cp.status) order by au.data)
                                                  from curimba_aulas au left join curimba_presencas cp on cp.aula_id = au.id and cp.aluno_id = a.id), '[]'::jsonb))
     from curimba_alunos a where a.pessoa_id = (p ->> 'pessoaId')::uuid
   $$`,

  // ================================================== v58: aba Vídeos (vídeos do YouTube das giras)
  // youtube = o código do vídeo (11 letras); classes = orixás/linhas marcados pelo admin, para a busca.
  `create table if not exists videos (
     id         uuid primary key default gen_random_uuid(),
     data       date not null,
     evento     text not null check (length(btrim(evento)) between 1 and 120),
     youtube    text not null check (youtube ~ '^[A-Za-z0-9_-]{11}$'),
     classes    text[] not null default '{}',
     criado_em  timestamptz not null default now()
   )`,
  `create index if not exists videos_por_data on videos (data)`,
  `create or replace function videos_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'data', data, 'evento', evento, 'youtube', youtube, 'classes', to_jsonb(classes))
                               order by data desc, criado_em desc), '[]'::jsonb)
     from videos
   $$`,
  // p = { id?, data, evento, youtube, classes: [..] } — sem id cria.
  `create or replace function video_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_classes text[] := array(select jsonb_array_elements_text(coalesce(p -> 'classes', '[]'::jsonb)));
   begin
     if coalesce(p ->> 'id', '') = '' then
       insert into videos (data, evento, youtube, classes) values ((p ->> 'data')::date, btrim(p ->> 'evento'), p ->> 'youtube', v_classes);
     else
       update videos set data = (p ->> 'data')::date, evento = btrim(p ->> 'evento'), youtube = p ->> 'youtube', classes = v_classes
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Vídeo não encontrado.'; end if;
     end if;
     return videos_listar();
   end;
   $$`,
  `create or replace function video_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from videos where id = (p ->> 'id')::uuid;
     return videos_listar();
   end;
   $$`,

  // ================================================== v59: aba Fotos (álbuns por gira/evento; os arquivos ficam no Cloudflare R2)
  // A aba entra nos perfis que já existem: todos veem; os perfis de admin também apagam qualquer foto.
  // Só mexe em quem ainda não tem a chave "fotos" (o que o root mudar depois fica).
  `update perfis set abas = abas || jsonb_build_object('fotos', jsonb_build_object('ver', true, 'editar', chave = 'root' or chave like 'admin%'))
   where not abas ? 'fotos'`,
  `create table if not exists fotos_albuns (
     id         uuid primary key default gen_random_uuid(),
     data       date not null,
     nome       text not null check (length(btrim(nome)) between 1 and 120),
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists fotos_albuns_unico on fotos_albuns (data, lower(btrim(nome)))`,
  // chave = caminho no R2 sem a extensão (a foto é chave.jpg e a miniatura, chave-p.jpg).
  // autor = 'p:<pessoa>' (quem tem cadastro na corrente) ou 'u:<usuário>': é quem pode apagar a própria foto.
  `create table if not exists fotos (
     id          uuid primary key default gen_random_uuid(),
     album_id    uuid not null references fotos_albuns (id) on delete cascade,
     chave       text not null unique,
     autor       text not null,
     autor_nome  text not null default '',
     tamanho     integer not null default 0,
     largura     integer not null default 0,
     altura      integer not null default 0,
     criado_em   timestamptz not null default now()
   )`,
  `create index if not exists fotos_por_album on fotos (album_id, criado_em)`,
  `create or replace function fotos_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'albuns', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data, 'nome', nome) order by data desc, lower(nome)) from fotos_albuns), '[]'::jsonb),
       'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'albumId', album_id, 'chave', chave, 'autor', autor, 'autorNome', autor_nome,
                                                             'largura', largura, 'altura', altura, 'criadoEm', criado_em) order by criado_em) from fotos), '[]'::jsonb),
       'usado', (select coalesce(sum(tamanho), 0) from fotos))
   $$`,
  // p = { id?, data, nome } → { id }. Sem id cria; se já existe um álbum com a mesma data e nome, devolve esse.
  `create or replace function foto_album_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid;
   begin
     if coalesce(p ->> 'id', '') = '' then
       select id into v_id from fotos_albuns where data = (p ->> 'data')::date and lower(btrim(nome)) = lower(btrim(p ->> 'nome'));
       if v_id is null then
         insert into fotos_albuns (data, nome) values ((p ->> 'data')::date, btrim(p ->> 'nome')) returning id into v_id;
       end if;
     else
       update fotos_albuns set data = (p ->> 'data')::date, nome = btrim(p ->> 'nome') where id = (p ->> 'id')::uuid returning id into v_id;
       if v_id is null then raise exception 'Álbum não encontrado.'; end if;
     end if;
     return jsonb_build_object('id', v_id);
   exception when unique_violation then
     raise exception 'Já existe um álbum com essa data e esse nome.';
   end;
   $$`,
  // Devolve as chaves das fotos que saíram (o servidor apaga os arquivos no R2).
  `create or replace function foto_album_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_chaves jsonb;
   begin
     select coalesce(jsonb_agg(chave), '[]'::jsonb) into v_chaves from fotos where album_id = (p ->> 'id')::uuid;
     delete from fotos_albuns where id = (p ->> 'id')::uuid;
     return v_chaves;
   end;
   $$`,
  `create or replace function foto_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from fotos_albuns where id = (p ->> 'albumId')::uuid) then raise exception 'Álbum não encontrado.'; end if;
     insert into fotos (album_id, chave, autor, autor_nome, tamanho, largura, altura)
     values ((p ->> 'albumId')::uuid, p ->> 'chave', p ->> 'autor', coalesce(p ->> 'autorNome', ''),
             (p ->> 'tamanho')::integer, (p ->> 'largura')::integer, (p ->> 'altura')::integer);
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // p = { id, autor, admin } — quem não é admin só apaga a própria foto. Devolve a chave (o servidor apaga no R2).
  `create or replace function foto_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_chave text;
   begin
     delete from fotos where id = (p ->> 'id')::uuid and (coalesce((p ->> 'admin')::boolean, false) or autor = p ->> 'autor')
     returning chave into v_chave;
     if v_chave is null then raise exception 'Foto não encontrada, ou você só pode apagar as fotos que enviou.'; end if;
     return to_jsonb(v_chave);
   end;
   $$`,

  // ================================================== v60: aba Vídeos publicada (toda a corrente vê) ou só para admin
  `insert into sistema (chave, valor) values ('videos_publicada', 'false') on conflict (chave) do nothing`,
  `create or replace function videos_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'videos_publicada'), false))
   $$`,
  `create or replace function videos_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('videos_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return videos_publicada();
   end;
   $$`,

  // ================================================== v61: ervas: preço estimado (cadastro), separado do preço real (bloco Compra)
  `alter table ervas add column if not exists preco_estimado numeric(10, 2) check (preco_estimado >= 0)`,
  // Uma vez só: quem já tinha preço começa com ele como estimado.
  `update ervas set preco_estimado = preco
    where preco is not null and preco_estimado is null
      and not exists (select 1 from sistema where chave = 'v61_preco_estimado')`,
  `insert into sistema (chave, valor) values ('v61_preco_estimado', 'ok') on conflict (chave) do nothing`,
  `create or replace function ervas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'frete', coalesce((select valor::numeric from sistema where chave = 'ervas_frete'), 0),
       'aberta', coalesce((select valor = 'true' from sistema where chave = 'ervas_aberta'), true),
       'gira', coalesce((select valor from sistema where chave = 'ervas_gira'), ''),
       'data', coalesce((select valor from sistema where chave = 'ervas_data'), ''),
       'ervas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'preco', e.preco, 'precoEstimado', e.preco_estimado,
                                                     'qtdCompra', e.qtd_compra, 'pessoasPorcao', e.pessoas_porcao) order by lower(e.nome))
                          from ervas e), '[]'::jsonb),
       -- Quem tem conta aparece sempre com o nome cadastrado atual.
       'escolhas', coalesce((select jsonb_agg(jsonb_build_object('chave', x.pessoa_chave,
                                                                 'nome', coalesce(u.nome, pe.nome, x.pessoa_nome),
                                                                 'ervaId', x.erva_id, 'quantidade', x.quantidade)
                                              order by lower(coalesce(u.nome, pe.nome, x.pessoa_nome)))
                             from ervas_escolhas x
                             left join usuarios u on x.pessoa_chave = 'u:' || u.id::text
                             left join pessoas pe on x.pessoa_chave = 'p:' || pe.id::text), '[]'::jsonb)
     );
   $$`,
  // Cadastro: nome, pessoas por porção e preço estimado (cada campo só muda se vier).
  `create or replace function erva_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if nullif(p ->> 'id', '') is null then
       insert into ervas (nome, preco, preco_estimado, pessoas_porcao)
       values (btrim(p ->> 'nome'), (p ->> 'preco')::numeric, (p ->> 'precoEstimado')::numeric, (p ->> 'pessoasPorcao')::integer);
     else
       update ervas set nome = btrim(p ->> 'nome'),
                        preco = case when p ? 'preco' then (p ->> 'preco')::numeric else preco end,
                        preco_estimado = case when p ? 'precoEstimado' then (p ->> 'precoEstimado')::numeric else preco_estimado end,
                        pessoas_porcao = case when p ? 'pessoasPorcao' then (p ->> 'pessoasPorcao')::integer else pessoas_porcao end
        where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Erva não encontrada.'; end if;
     end if;
     return ervas_estado();
   exception when unique_violation then
     raise exception 'Já existe uma erva com esse nome.';
   end;
   $$`,

  // ================================================== v62: oferenda por pessoa: alunos por turma
  // Grupos dos alunos: 'alunos' (todos), 'turma:<id>' (só aquela turma) e 'alunos:sem' (sem turma).
  `create or replace function aluno_no_grupo(t uuid, g text[])
   returns boolean language sql immutable as $$
     select coalesce('alunos' = any(g) or (t is null and 'alunos:sem' = any(g)) or (t is not null and ('turma:' || t::text) = any(g)), false)
   $$`,
  `create or replace function oferenda_mediuns_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_g text[];
   begin
     if p ? 'grupos' then
       update oferendas set por_medium = true, grupos = array(select jsonb_array_elements_text(p -> 'grupos')) where id = v_id;
     else
       update oferendas set por_medium = true where id = v_id;
     end if;
     if not found then raise exception 'Oferenda não encontrada.'; end if;
     select grupos into v_g from oferendas where id = v_id;
     if p ? 'grupos' then
       delete from oferenda_mediuns om using pessoas pe
       where om.oferenda_id = v_id and pe.id = om.pessoa_id and not (pe.funcao = any(v_g));
       delete from oferenda_alunos oa using alunos a
       where oa.oferenda_id = v_id and a.id = oa.aluno_id and not aluno_no_grupo(a.turma_id, v_g);
     end if;
     insert into oferenda_mediuns (oferenda_id, pessoa_id)
     select v_id, id from pessoas where saida is null and (v_g is null or funcao = any(v_g))
     on conflict do nothing;
     if v_g is not null then
       insert into oferenda_alunos (oferenda_id, aluno_id) select v_id, a.id from alunos a where a.saida is null and aluno_no_grupo(a.turma_id, v_g) on conflict do nothing;
     end if;
     return oferendas_estado();
   end;
   $$`,
  `create or replace function oferenda_mediuns_incluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_novos text[] := array(select jsonb_array_elements_text(p -> 'grupos'));
     v_g text[];
   begin
     select coalesce(grupos, array['medium', 'extra', 'passe', 'cambone', 'senha', 'curimba']) into v_g
       from oferendas where id = v_id and por_medium;
     if not found then raise exception 'Oferenda não encontrada.'; end if;
     update oferendas set grupos = v_g || array(select g from unnest(v_novos) g where not (g = any(v_g))) where id = v_id;
     insert into oferenda_mediuns (oferenda_id, pessoa_id)
     select v_id, id from pessoas where saida is null and funcao = any(v_novos)
     on conflict do nothing;
     insert into oferenda_alunos (oferenda_id, aluno_id)
     select v_id, a.id from alunos a where a.saida is null and aluno_no_grupo(a.turma_id, v_novos)
     on conflict do nothing;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v63: foto da pessoa (aba Perfil, bloco Informações)
  // Foto pequena (o celular reduz para um quadrado de 320 px antes de enviar), em base64: cabe no banco sem custo.
  `create table if not exists pessoas_fotos (
     pessoa_id     uuid primary key references pessoas (id) on delete cascade,
     foto          text not null,
     atualizado_em timestamptz not null default now()
   )`,
  `create or replace function pessoa_foto_ler(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(foto) from pessoas_fotos where pessoa_id = (p ->> 'pessoaId')::uuid
   $$`,
  // p = { pessoaId, foto } — foto vazia (ou ausente) apaga.
  `create or replace function pessoa_foto_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from pessoas where id = (p ->> 'pessoaId')::uuid) then raise exception 'Pessoa não encontrada.'; end if;
     if coalesce(p ->> 'foto', '') = '' then
       delete from pessoas_fotos where pessoa_id = (p ->> 'pessoaId')::uuid;
     else
       insert into pessoas_fotos (pessoa_id, foto) values ((p ->> 'pessoaId')::uuid, p ->> 'foto')
       on conflict (pessoa_id) do update set foto = excluded.foto, atualizado_em = now();
     end if;
     return pessoa_foto_ler(p);
   end;
   $$`,

  // ================================================== v64: orações (aba Gira, logo abaixo dos Eventos)
  // Qualquer pessoa logada pede uma oração; ela vale 7 dias e depois é apagada (a cada leitura da lista).
  // autor = 'p:<pessoa>' ou 'u:<usuário>': quem pediu pode excluir (o admin também).
  `create table if not exists oracoes (
     id         uuid primary key default gen_random_uuid(),
     texto      text not null check (length(btrim(texto)) between 1 and 200),
     autor      text not null,
     autor_nome text not null default '',
     criado_em  timestamptz not null default now()
   )`,
  `create or replace function oracao_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into oracoes (texto, autor, autor_nome) values (btrim(p ->> 'texto'), p ->> 'autor', coalesce(p ->> 'autorNome', ''));
     return oracoes_listar();
   end;
   $$`,
  // p = { id, autor, admin } — quem não é admin só exclui a própria.
  `create or replace function oracao_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from oracoes where id = (p ->> 'id')::uuid and (coalesce((p ->> 'admin')::boolean, false) or autor = p ->> 'autor');
     if not found then raise exception 'Oração não encontrada, ou só quem pediu pode excluir.'; end if;
     return oracoes_listar();
   end;
   $$`,

  // ================================================== v65: reação nas orações (🕯️ "acendi uma vela")
  // Uma por pessoa em cada oração; tocar de novo tira. Somem junto com a oração.
  `create table if not exists oracoes_reacoes (
     oracao_id uuid not null references oracoes(id) on delete cascade,
     autor     text not null,
     criado_em timestamptz not null default now(),
     primary key (oracao_id, autor)
   )`,
  // 'reacoes' = autores de quem reagiu (a API troca pela contagem e por "eu reagi").
  `create or replace function oracoes_listar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from oracoes where criado_em < now() - interval '7 days';
     return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'texto', o.texto, 'autor', o.autor,
                                                         'criadoEm', o.criado_em, 'expiraEm', o.criado_em + interval '7 days',
                                                         'reacoes', coalesce((select jsonb_agg(r.autor) from oracoes_reacoes r where r.oracao_id = o.id), '[]'::jsonb))
                                       order by o.criado_em desc)
                      from oracoes o), '[]'::jsonb);
   end;
   $$`,
  // p = { id, autor } — liga/desliga a reação de quem tocou.
  `create or replace function oracao_reagir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from oracoes where id = (p ->> 'id')::uuid) then raise exception 'Oração não encontrada.'; end if;
     delete from oracoes_reacoes where oracao_id = (p ->> 'id')::uuid and autor = p ->> 'autor';
     if not found then
       insert into oracoes_reacoes (oracao_id, autor) values ((p ->> 'id')::uuid, p ->> 'autor');
     end if;
     return oracoes_listar();
   end;
   $$`,

  // ================================================== v66: oferenda por pessoa segue o cadastro
  // A cada leitura, quem foi cadastrado depois (pessoa da função ou aluno da turma escolhida) entra sozinho
  // nas oferendas ainda não encerradas e de hoje em diante. Quem o admin tirou continua fora (a linha existe, excluída).
  `create or replace function oferendas_sincronizar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into oferenda_mediuns (oferenda_id, pessoa_id)
     select o.id, pe.id from oferendas o join pessoas pe on pe.funcao = any(o.grupos) and pe.saida is null
     where o.por_medium and o.status <> 'encerrado' and o.data >= (now() at time zone 'America/Sao_Paulo')::date
     on conflict do nothing;
     insert into oferenda_alunos (oferenda_id, aluno_id)
     select o.id, a.id from oferendas o join alunos a on a.saida is null and aluno_no_grupo(a.turma_id, o.grupos)
     where o.por_medium and o.status <> 'encerrado' and o.data >= (now() at time zone 'America/Sao_Paulo')::date
     on conflict do nothing;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v67: renomear turma dos alunos (as oferendas guardam o id, não o nome)
  `create or replace function turma_aluno_renomear(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update turmas_alunos set nome = btrim(p ->> 'nome') where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Turma não encontrada.'; end if;
     return alunos_estado();
   exception when unique_violation then
     raise exception 'Essa turma já existe.';
   end;
   $$`,

  // ================================================== v68: oferenda por pessoa "Exibir no resumo" (tabela do admin em Seus compromissos)
  `alter table oferendas add column if not exists no_resumo boolean not null default false`,
  // Igual à v44, com 'noResumo'.
  `create or replace function oferendas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', o.id, 'titulo', o.titulo, 'data', o.data, 'status', o.status, 'publicada', o.publicada,
       'responsavelId', o.responsavel_id, 'responsavel', (select nome from pessoas where id = o.responsavel_id),
       'porMedium', o.por_medium, 'noResumo', o.no_resumo,
       'completaEm', o.completa_em, 'fechada', o.completa_em is not null and o.completa_em <= now() - interval '1 day',
       'grupos', to_jsonb(o.grupos),
       'mediuns', coalesce((select jsonb_agg(x.j order by lower(x.nome)) from (
           select pe.nome, jsonb_build_object('pessoaId', pe.id::text, 'nome', pe.nome, 'pagamento', om.pagamento, 'entrega', om.entrega) as j
           from oferenda_mediuns om join pessoas pe on pe.id = om.pessoa_id
           where om.oferenda_id = o.id and not om.excluido
           union all
           select al.nome, jsonb_build_object('pessoaId', 'a:' || al.id::text, 'nome', al.nome, 'pagamento', oa.pagamento, 'entrega', oa.entrega, 'aluno', true)
           from oferenda_alunos oa join alunos al on al.id = oa.aluno_id
           where oa.oferenda_id = o.id and not oa.excluido) x), '[]'::jsonb),
       'itens', coalesce((select jsonb_agg(jsonb_build_object(
           'id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
           'doacoes', coalesce((select jsonb_agg(jsonb_build_object('chave', d.pessoa_chave, 'nome', coalesce(u.nome, pe.nome, al.nome, d.pessoa_nome),
                                                                    'quantidade', d.quantidade) order by d.atualizado_em)
                                from oferenda_doacoes d left join usuarios u on d.pessoa_chave = 'u:' || u.id::text
                                left join pessoas pe on d.pessoa_chave = 'p:' || pe.id::text
                                left join alunos al on d.pessoa_chave = 'a:' || al.id::text
                                where d.item_id = i.id), '[]'::jsonb)
         ) order by i.criado_em) from oferenda_itens i where i.oferenda_id = o.id), '[]'::jsonb)
     ) order by o.data, o.criado_em), '[]'::jsonb) from oferendas o;
   $$`,
  `create or replace function oferenda_resumo(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferendas set no_resumo = (p ->> 'noResumo')::boolean where id = (p ->> 'id')::uuid and por_medium;
     if not found then raise exception 'Oferenda não encontrada.'; end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v69: ausência antecipada (data futura ainda sem gira)
  // O admin marca quem não vai numa data em que a gira ainda não foi criada; ao criar a gira, essas pessoas
  // já entram como Ausente (e as linhas da data saem daqui).
  `create table if not exists ausencias_previas (
     data      date not null,
     pessoa_id uuid not null references pessoas (id) on delete cascade,
     criado_em timestamptz not null default now(),
     primary key (data, pessoa_id)
   )`,
  // De hoje em diante (as passadas não servem mais para nada).
  `create or replace function ausencias_previas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('data', data, 'pessoaId', pessoa_id) order by data), '[]'::jsonb)
     from ausencias_previas where data >= (now() at time zone 'America/Sao_Paulo')::date;
   $$`,
  // p = { data, pessoaId, ausente } — marca ou desmarca.
  `create or replace function ausencia_previa_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from pessoas where id = (p ->> 'pessoaId')::uuid) then raise exception 'Pessoa não encontrada.'; end if;
     if coalesce((p ->> 'ausente')::boolean, true) then
       insert into ausencias_previas (data, pessoa_id) values ((p ->> 'data')::date, (p ->> 'pessoaId')::uuid) on conflict do nothing;
     else
       delete from ausencias_previas where data = (p ->> 'data')::date and pessoa_id = (p ->> 'pessoaId')::uuid;
     end if;
     return ausencias_previas_listar();
   end;
   $$`,
  // Ao criar a gira: devolve quem tinha ausência antecipada na data e apaga essas linhas.
  `create or replace function ausencias_previas_usar(p jsonb)
   returns jsonb language sql as $$
     with d as (delete from ausencias_previas where data = (p ->> 'data')::date returning pessoa_id)
     select coalesce(jsonb_agg(pessoa_id), '[]'::jsonb) from d;
   $$`,

  // ================================================== v70: anamnese (aba Perfil)
  // Perguntas que o admin do perfil cadastra (texto numa linha; resposta em texto ou sim/não) e as respostas de cada pessoa.
  `create table if not exists anamnese_perguntas (
     id        uuid primary key default gen_random_uuid(),
     texto     text not null check (length(btrim(texto)) between 1 and 120),
     tipo      text not null check (tipo in ('texto', 'simnao')),
     criado_em timestamptz not null default now()
   )`,
  `create table if not exists anamnese_respostas (
     pessoa_id     uuid not null references pessoas (id) on delete cascade,
     pergunta_id   uuid not null references anamnese_perguntas (id) on delete cascade,
     resposta      text not null,
     atualizado_em timestamptz not null default now(),
     primary key (pessoa_id, pergunta_id)
   )`,
  `create or replace function anamnese_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'perguntas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'tipo', tipo) order by criado_em) from anamnese_perguntas), '[]'::jsonb),
       'respostas', coalesce((select jsonb_agg(jsonb_build_object('pessoaId', pessoa_id, 'perguntaId', pergunta_id, 'resposta', resposta)) from anamnese_respostas), '[]'::jsonb));
   $$`,
  `create or replace function anamnese_pergunta_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into anamnese_perguntas (texto, tipo) values (btrim(p ->> 'texto'), p ->> 'tipo');
     return anamnese_estado();
   end;
   $$`,
  `create or replace function anamnese_pergunta_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from anamnese_perguntas where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Pergunta não encontrada.'; end if;
     return anamnese_estado();
   end;
   $$`,
  // p = { pessoaId, respostas: { perguntaId: resposta } } — resposta vazia apaga.
  `create or replace function anamnese_responder(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_p uuid := (p ->> 'pessoaId')::uuid;
   begin
     delete from anamnese_respostas r using jsonb_each_text(coalesce(p -> 'respostas', '{}'::jsonb)) e
      where r.pessoa_id = v_p and r.pergunta_id = e.key::uuid and btrim(e.value) = '';
     insert into anamnese_respostas (pessoa_id, pergunta_id, resposta)
     select v_p, e.key::uuid, e.value from jsonb_each_text(coalesce(p -> 'respostas', '{}'::jsonb)) e
      where btrim(e.value) <> '' and exists (select 1 from anamnese_perguntas q where q.id = e.key::uuid)
     on conflict (pessoa_id, pergunta_id) do update set resposta = excluded.resposta, atualizado_em = now();
     return anamnese_estado();
   end;
   $$`,

  // ================================================== v71: perfil "Admin perfil" (já vem com o app)
  // Se o root já criou um perfil com esse nome, fica o dele (on conflict do nothing).
  ...PERFIS_PADRAO.filter((p) => p.chave === 'admin_perfil').map((p) => `insert into perfis (chave, nome, abas, ordem)
     values ('${p.chave}', '${p.nome}', '${JSON.stringify(p.abas)}'::jsonb, ${p.ordem}) on conflict do nothing`),

  // ================================================== v72: trava da escala (marcar falta ou ausência não muda a escala)
  `alter table giras add column if not exists travada boolean not null default false`,
  `create or replace function gira_travar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update giras set travada = coalesce((p ->> 'travada')::boolean, false), atualizado_em = now() where data = (p ->> 'data')::date;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json((p ->> 'data')::date);
   end;
   $$`,

  // ================================================== v73: recado do admin na gira (aparece para todos no evento em andamento)
  `alter table giras add column if not exists recado text not null default '' check (length(recado) <= 300)`,
  `create or replace function gira_recado(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update giras set recado = coalesce(p ->> 'recado', ''), atualizado_em = now() where data = (p ->> 'data')::date;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json((p ->> 'data')::date);
   end;
   $$`,
  // Igual à v42, com 'travada' e 'recado'.
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,

  // ================================================== v74: evento sem limpeza, escala ou sugestões
  `alter table giras add column if not exists evento boolean not null default false`,
  `create or replace function gira_evento(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_data date := (p ->> 'data')::date;
     v_evento boolean := (p ->> 'evento')::boolean;
   begin
     update giras set
       evento = v_evento,
       publicada = case when v_evento then false else publicada end,
       atualizado_em = now(),
       atualizado_por = nullif(p ->> 'usuario', '')::uuid
     where data = v_data;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json(v_data);
   end;
   $$`,
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'evento', g.evento,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,

  // ================================================== v75: remover turma de alunos; os alunos ficam sem turma
  `create or replace function turma_aluno_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from turmas_alunos where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Turma não encontrada.'; end if;
     return alunos_estado();
   end;
   $$`,

  // ================================================== v76: questionário da anamnese (opções, obrigatoriedade e respostas longas)
  `alter table anamnese_perguntas add column if not exists opcoes jsonb not null default '[]'::jsonb`,
  `alter table anamnese_perguntas add column if not exists obrigatoria boolean not null default true`,
  `alter table anamnese_perguntas drop constraint if exists anamnese_perguntas_texto_check`,
  `alter table anamnese_perguntas add constraint anamnese_perguntas_texto_check check (length(btrim(texto)) between 1 and 500)`,
  `alter table anamnese_perguntas drop constraint if exists anamnese_perguntas_tipo_check`,
  `alter table anamnese_perguntas add constraint anamnese_perguntas_tipo_check check (tipo in ('texto', 'data', 'simnao', 'opcao', 'multipla'))`,
  `create or replace function anamnese_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'perguntas', coalesce((select jsonb_agg(jsonb_build_object(
         'id', id, 'texto', texto, 'tipo', tipo, 'opcoes', opcoes, 'obrigatoria', obrigatoria) order by criado_em)
         from anamnese_perguntas), '[]'::jsonb),
       'respostas', coalesce((select jsonb_agg(jsonb_build_object('pessoaId', pessoa_id, 'perguntaId', pergunta_id, 'resposta', resposta))
         from anamnese_respostas), '[]'::jsonb));
   $$`,
  `create or replace function anamnese_pergunta_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into anamnese_perguntas (texto, tipo, opcoes, obrigatoria)
     values (btrim(p ->> 'texto'), p ->> 'tipo', coalesce(p -> 'opcoes', '[]'::jsonb), coalesce((p ->> 'obrigatoria')::boolean, true));
     return anamnese_estado();
   end;
   $$`,
  `do $$
   begin
     if not exists (select 1 from sistema where chave = 'v76_anamnese_forms_seed') then
       insert into anamnese_perguntas (texto, tipo, opcoes, obrigatoria)
       select v.texto, v.tipo, v.opcoes::jsonb, v.obrigatoria
       from (values
         ('Nome Completo', 'texto', '[]', true),
         ('Data de Nascimento', 'data', '[]', true),
         ('RG', 'texto', '[]', false),
         ('CPF', 'texto', '[]', false),
         ('Número Carteira do SUS', 'texto', '[]', false),
         ('Estado Civil', 'texto', '[]', false),
         ('Profissão', 'texto', '[]', true),
         ('Gênero / Identidade de Gênero', 'texto', '[]', true),
         ('Endereço Residencial', 'texto', '[]', true),
         ('Telefone', 'texto', '[]', true),
         ('E-mail', 'texto', '[]', true),
         ('Possui convênio?', 'simnao', '[]', true),
         ('Se sim, qual seu convênio?', 'texto', '[]', false),
         ('Nos informe 1 (um) contato de emergência (nome da pessoa; telefone; parentesco):', 'texto', '[]', true),
         ('Doenças Anteriores', 'texto', '[]', true),
         ('Já realizou alguma cirurgia (de qualquer porte)?', 'simnao', '[]', true),
         ('Cirurgias já realizadas (de qualquer porte):', 'texto', '[]', false),
         ('Alérgico(a) a algum medicamento?', 'simnao', '[]', true),
         ('Se sim, qual (quais)?', 'texto', '[]', false),
         ('Utiliza algum medicamento de forma contínua?', 'simnao', '[]', true),
         ('Se sim, qual (quais)?', 'texto', '[]', false),
         ('Sua família possui alguma doença hereditária (câncer, diabetes, entre outros)?', 'simnao', '[]', true),
         ('Se sim, qual (quais)?', 'texto', '[]', false),
         ('Ingere bebidas alcoólicas?', 'opcao', '["Sim, frequentemente.", "Sim, socialmente.", "Já experimentei, somente.", "Não mais.", "Nunca bebi."]', true),
         ('Se sim, qual (quais)?', 'texto', '[]', false),
         ('Fuma?', 'opcao', '["Sim, frequentemente.", "Sim, socialmente.", "Já experimentei, somente.", "Não mais.", "Nunca fumei."]', true),
         ('Se sim, qual (quais)?', 'texto', '[]', false),
         ('Vacinas em dia?', 'simnao', '[]', true),
         ('Possui alguma doença psicológica ou distúrbio do neurodesenvolvimento diagnosticada? Selecione quais se enquadram.', 'multipla', '["Sim, TDAH.", "Sim, Depressão.", "Sim, Transtorno do Espectro Autista.", "Sim, Ansiedade.", "Sim, Transtorno Obsessivo-Compulsivo (TOC).", "Sim, Transtorno Bipolar.", "Sim, Transtorno de Personalidade Borderline (TPB).", "Sim, Transtorno de Estresse Pós-Traumático (TEPT).", "Sim, Esquizofrenia.", "Sim, Transtorno de Pânico.", "Sim, Transtorno de Aprendizagem (como dislexia, discalculia).", "Sim, Transtorno Esquizoafetivo.", "Sim, Transtorno de Ansiedade Generalizada (TAG).", "Sim, Transtorno de Compulsão Alimentar.", "Sim, Fobia Social (Ansiedade Social).", "Sim, Anorexia ou Bulimia Nervosa.", "Só tenho suspeita.", "Estou realizando exames para descobrir.", "Não tenho certeza (nunca procurei saber).", "Nenhuma acima (assinale somente caso tenha confirmação médica)."]', true),
         ('Possui algum outro não listado acima? Se sim, qual?', 'texto', '[]', false),
         ('Já teve COVID?', 'opcao', '["Sim, com sequelas.", "Sim, não tive sequelas.", "Não, nunca tive."]', true),
         ('Se sim, com sequelas, quais?', 'texto', '[]', false),
         ('Possui dor frequente em alguma região do corpo?', 'simnao', '[]', true),
         ('Se sim, em qual região? (Especificar)', 'texto', '[]', false),
         ('Já foi internado?', 'simnao', '[]', true),
         ('Se sim, por qual motivo? (Especificar)', 'texto', '[]', false),
         ('Já teve lesão muscular, articular ou óssea?', 'simnao', '[]', true),
         ('Já teve entorse, fratura ou problema de coluna?', 'simnao', '[]', true),
         ('Possui histórico de pressão alta ou problemas cardíacos?', 'simnao', '[]', true),
         ('Caso haja alguma informação extra (surdez, hérnia, instabilidade nos joelhos, problemas motores, entre outros), informe abaixo:', 'texto', '[]', false)
       ) as v(texto, tipo, opcoes, obrigatoria)
       where not exists (select 1 from anamnese_perguntas q where lower(q.texto) = lower(v.texto));
       insert into sistema (chave, valor) values ('v76_anamnese_forms_seed', 'ok') on conflict (chave) do nothing;
     end if;
   end;
   $$`,
  // ================================================== v77: editar pergunta sem alterar respostas nem formato
  `create or replace function anamnese_pergunta_editar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update anamnese_perguntas set texto = btrim(p ->> 'texto') where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Pergunta não encontrada.'; end if;
     return anamnese_estado();
   end;
   $$`,
  // ================================================== v78: o admin do perfil controla a exibição para a corrente
  `insert into sistema (chave, valor) values ('anamnese_visivel', 'true') on conflict (chave) do nothing`,
  `create or replace function anamnese_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'perguntas', coalesce((select jsonb_agg(jsonb_build_object(
         'id', id, 'texto', texto, 'tipo', tipo, 'opcoes', opcoes, 'obrigatoria', obrigatoria) order by criado_em)
         from anamnese_perguntas), '[]'::jsonb),
       'respostas', coalesce((select jsonb_agg(jsonb_build_object('pessoaId', pessoa_id, 'perguntaId', pergunta_id, 'resposta', resposta))
         from anamnese_respostas), '[]'::jsonb),
       'visivel', coalesce((select valor = 'true' from sistema where chave = 'anamnese_visivel'), true));
   $$`,
  `create or replace function anamnese_visibilidade(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update sistema set valor = case when (p ->> 'visivel')::boolean then 'true' else 'false' end
      where chave = 'anamnese_visivel';
     if not found then raise exception 'Configuração de visibilidade da Anamnese não encontrada.'; end if;
     return anamnese_estado();
   end;
   $$`,
  // ================================================== v79: ordem persistida das perguntas
  `alter table anamnese_perguntas add column if not exists ordem integer`,
  `with ordenadas as (
     select id, row_number() over (order by criado_em, id)::integer as n from anamnese_perguntas
   )
   update anamnese_perguntas q set ordem = o.n from ordenadas o where q.id = o.id and q.ordem is null`,
  `alter table anamnese_perguntas alter column ordem set default 2147483647`,
  `alter table anamnese_perguntas alter column ordem set not null`,
  `create or replace function anamnese_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'perguntas', coalesce((select jsonb_agg(jsonb_build_object(
         'id', id, 'texto', texto, 'tipo', tipo, 'opcoes', opcoes, 'obrigatoria', obrigatoria) order by ordem, criado_em, id)
         from anamnese_perguntas), '[]'::jsonb),
       'respostas', coalesce((select jsonb_agg(jsonb_build_object('pessoaId', pessoa_id, 'perguntaId', pergunta_id, 'resposta', resposta))
         from anamnese_respostas), '[]'::jsonb),
       'visivel', coalesce((select valor = 'true' from sistema where chave = 'anamnese_visivel'), true));
   $$`,
  `create or replace function anamnese_pergunta_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into anamnese_perguntas (texto, tipo, opcoes, obrigatoria, ordem)
     values (btrim(p ->> 'texto'), p ->> 'tipo', coalesce(p -> 'opcoes', '[]'::jsonb),
       coalesce((p ->> 'obrigatoria')::boolean, true),
       coalesce((select max(ordem) from anamnese_perguntas), 0) + 1);
     return anamnese_estado();
   end;
   $$`,
  `create or replace function anamnese_perguntas_reordenar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_total integer;
     v_ids jsonb := p -> 'ids';
   begin
     if v_ids is null then raise exception 'Lista de perguntas inválida.'; end if;
     if jsonb_typeof(v_ids) <> 'array' then raise exception 'Lista de perguntas inválida.'; end if;
     if jsonb_array_length(v_ids) > 500 then raise exception 'Lista de perguntas inválida.'; end if;
     select count(*) into v_total from anamnese_perguntas;
     if jsonb_array_length(v_ids) <> v_total then raise exception 'A lista de perguntas mudou; atualize e tente novamente.'; end if;
     if (select count(distinct value) from jsonb_array_elements_text(v_ids)) <> v_total then
       raise exception 'A lista contém perguntas repetidas.';
     end if;
     if exists (
       select 1 from jsonb_array_elements_text(v_ids) e
       where not exists (select 1 from anamnese_perguntas q where q.id = e.value::uuid)
     ) then raise exception 'A lista contém uma pergunta que não existe.'; end if;
     update anamnese_perguntas q set ordem = e.pos
       from (select value::uuid as id, ordinality::integer as pos
         from jsonb_array_elements_text(v_ids) with ordinality) e
       where q.id = e.id;
     return anamnese_estado();
   end;
   $$`,
  // ================================================== v80: apelidos de entidade vinculados a linhas existentes
  `alter table giras add column if not exists entidade_nome text not null default '' check (length(entidade_nome) <= 120)`,
  `insert into sistema (chave, valor) values ('entidades_apelidos', '[]') on conflict (chave) do nothing`,
  `create or replace function entidades_apelidos_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce((select valor::jsonb from sistema where chave = 'entidades_apelidos'), '[]'::jsonb);
   $$`,
  `create or replace function entidades_apelidos_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update sistema set valor = coalesce(p -> 'apelidos', '[]'::jsonb)::text where chave = 'entidades_apelidos';
     if not found then raise exception 'Configuração de entidades não encontrada.'; end if;
     return entidades_apelidos_listar();
   end;
   $$`,
  `create or replace function gira_entidade_nome(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update giras set entidade_nome = coalesce(p ->> 'nome', ''), atualizado_em = now()
       where data = (p ->> 'data')::date;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json((p ->> 'data')::date);
   end;
   $$`,
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'entidadeNome', g.entidade_nome,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'evento', g.evento,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,
  // ================================================== v81: login limitado para alunos da CPJ e alunos de curimba
  `create or replace function aluno_acesso(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', a.id, 'nome', a.nome, 'turmaId', a.turma_id)
     from alunos a where a.id = (p ->> 'id')::uuid
   $$`,
  `create or replace function curimba_aluno_acesso(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', a.id, 'nome', coalesce(pe.nome, a.nome), 'pessoaId', a.pessoa_id)
     from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id
     where a.id = (p ->> 'id')::uuid
   $$`,
  `create or replace function curimba_minha(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('aulas', coalesce((select jsonb_agg(jsonb_build_object('data', au.data, 'nome', au.nome, 'status', cp.status) order by au.data)
                                                  from curimba_aulas au left join curimba_presencas cp on cp.aula_id = au.id and cp.aluno_id = a.id), '[]'::jsonb))
     from curimba_alunos a
     where (nullif(p ->> 'alunoId', '') is not null and a.id = (p ->> 'alunoId')::uuid)
        or (nullif(p ->> 'alunoId', '') is null and a.pessoa_id = (p ->> 'pessoaId')::uuid)
   $$`,
  // ================================================== v82: Admin curimba publica e administra os vídeos da casa
  `update perfis set abas = jsonb_set(coalesce(abas, '{}'::jsonb), '{videos}', '{"ver":true,"editar":true}'::jsonb, true)
    where chave = 'admin_curimba'`,
  // ================================================== v83: transferir aluno para a Corrente como Cambone sem perder histórico de oferendas
  `create or replace function aluno_transferir_cambone(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_nome text;
     v_pessoa_id uuid;
   begin
     select nome into v_nome from alunos where id = v_id for update;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     v_nome := coalesce(nullif(btrim(p ->> 'nome'), ''), v_nome);
     if length(v_nome) > 80 then raise exception 'Nome inválido.'; end if;
     if exists (select 1 from pessoas where lower(btrim(nome)) = lower(btrim(v_nome))) then
       raise exception 'Já existe uma pessoa da corrente com esse nome.';
     end if;

     insert into pessoas (nome, funcao) values (v_nome, 'cambone') returning id into v_pessoa_id;
     insert into oferenda_mediuns (oferenda_id, pessoa_id, pagamento, entrega, excluido, atualizado_em)
       select oferenda_id, v_pessoa_id, pagamento, entrega, excluido, atualizado_em
       from oferenda_alunos where aluno_id = v_id
       on conflict (oferenda_id, pessoa_id) do update set
         pagamento = excluded.pagamento, entrega = excluded.entrega,
         excluido = excluded.excluido, atualizado_em = excluded.atualizado_em;
     update oferenda_doacoes set pessoa_chave = 'p:' || v_pessoa_id::text
       where pessoa_chave = 'a:' || v_id::text;
     delete from alunos where id = v_id;

     return alunos_estado() || jsonb_build_object('pessoas', pessoas_listar());
   exception when unique_violation then
     raise exception 'Já existe uma pessoa da corrente com esse nome.';
   end;
   $$`,
  // ================================================== v84: promover aluno para CPJ como Cambone, mantendo o nome usado no acesso
  `create or replace function aluno_transferir_cambone(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_nome text;
     v_pessoa_id uuid;
   begin
     select nome into v_nome from alunos where id = v_id for update;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     if exists (select 1 from pessoas where lower(btrim(nome)) = lower(btrim(v_nome))) then
       raise exception 'Já existe uma pessoa da corrente com esse nome.';
     end if;

     insert into pessoas (nome, funcao) values (v_nome, 'cambone') returning id into v_pessoa_id;
     insert into oferenda_mediuns (oferenda_id, pessoa_id, pagamento, entrega, excluido, atualizado_em)
       select oferenda_id, v_pessoa_id, pagamento, entrega, excluido, atualizado_em
       from oferenda_alunos where aluno_id = v_id
       on conflict (oferenda_id, pessoa_id) do update set
         pagamento = excluded.pagamento, entrega = excluded.entrega,
         excluido = excluded.excluido, atualizado_em = excluded.atualizado_em;
     update oferenda_doacoes set pessoa_chave = 'p:' || v_pessoa_id::text
       where pessoa_chave = 'a:' || v_id::text;
     delete from alunos where id = v_id;

     return alunos_estado() || jsonb_build_object('pessoas', pessoas_listar());
   exception when unique_violation then
     raise exception 'Já existe uma pessoa da corrente com esse nome.';
   end;
   $$`,
  // ================================================== v85: total de participantes dos eventos (separado dos atendimentos)
  `alter table giras add column if not exists participantes integer check (participantes between 0 and 100000)`,
  `update giras set limpeza = null, publicada = false, travada = false where evento`,
  `delete from duplas where gira_data in (select data from giras where evento)`,
  `create or replace function gira_evento(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_data date := (p ->> 'data')::date;
     v_evento boolean := (p ->> 'evento')::boolean;
   begin
     update giras set
       evento = v_evento,
       limpeza = case when v_evento then null else limpeza end,
       publicada = case when v_evento then false else publicada end,
       travada = case when v_evento then false else travada end,
       atualizado_em = now(),
       atualizado_por = nullif(p ->> 'usuario', '')::uuid
     where data = v_data;
     if not found then raise exception 'Gira não encontrada.'; end if;
     if v_evento then delete from duplas where gira_data = v_data; end if;
     return gira_json(v_data);
   end;
   $$`,
  `create or replace function gira_participantes(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_data date := (p ->> 'data')::date;
   begin
     update giras set participantes = (p ->> 'participantes')::integer,
       atualizado_em = now(), atualizado_por = nullif(p ->> 'usuario', '')::uuid
     where data = v_data and evento;
     if not found then
       if not exists (select 1 from giras where data = v_data) then raise exception 'Gira não encontrada.'; end if;
       raise exception 'O total de participantes só pode ser registrado em um evento.';
     end if;
     return gira_json(v_data);
   end;
   $$`,
  // ================================================== v86: em gira com mais de uma linha, a entidade que cada pessoa vai atender
  // { pessoaId: linha }. Não entra em gira_salvar: quem grava é a própria pessoa, pela acao 'minhaEntidade'.
  `alter table giras add column if not exists atende jsonb not null default '{}'::jsonb`,
  `create or replace function gira_atende(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_data date := (p ->> 'data')::date;
   begin
     update giras set
       atende = case when coalesce(p ->> 'linha', '') = '' then atende - (p ->> 'pessoaId')
                     else atende || jsonb_build_object(p ->> 'pessoaId', p ->> 'linha') end,
       atualizado_em = now()
     where data = v_data;
     return gira_json(v_data);
   end;
   $$`,
  // Igual à v85, com 'atende'.
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'entidadeNome', g.entidade_nome,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'participantes', g.participantes,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'evento', g.evento,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atende', g.atende,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,
  // ================================================== v87: aba Ervas visível para todos ou só para quem administra (começa visível)
  `insert into sistema (chave, valor) values ('ervas_publicada', 'true') on conflict (chave) do nothing`,
  `create or replace function ervas_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'ervas_publicada'), true))
   $$`,
  `create or replace function ervas_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('ervas_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return ervas_publicada();
   end;
   $$`,
  // ================================================== v88: aba Iemanjá — evento com 5 grupos, sorteio das pessoas e itens assumidos
  // Não mexe no cadastro de ninguém: chave 'p:<pessoa>' ou 'a:<aluno>', como nas oferendas.
  `create table if not exists iemanja_eventos (
     id           uuid primary key default gen_random_uuid(),
     data         date not null,
     visivel      boolean not null default false,
     sorteado     boolean not null default false,
     fora         text[] not null default '{}',
     encerrado_em timestamptz,
     criado_em    timestamptz not null default now()
   )`,
  `create unique index if not exists iemanja_um_aberto on iemanja_eventos ((true)) where encerrado_em is null`,
  `create table if not exists iemanja_grupos (
     id             uuid primary key default gen_random_uuid(),
     evento_id      uuid not null references iemanja_eventos (id) on delete cascade,
     ordem          int not null check (ordem between 1 and 5),
     nome           text not null default '',
     responsavel_id uuid references pessoas (id) on delete set null,
     unique (evento_id, ordem)
   )`,
  `create table if not exists iemanja_membros (
     grupo_id uuid not null references iemanja_grupos (id) on delete cascade,
     chave    text not null,
     nome     text not null,
     fixo     boolean not null default false,
     primary key (grupo_id, chave)
   )`,
  `create table if not exists iemanja_itens (
     id         uuid primary key default gen_random_uuid(),
     grupo_id   uuid not null references iemanja_grupos (id) on delete cascade,
     nome       text not null check (length(btrim(nome)) between 1 and 80),
     quantidade int not null check (quantidade between 1 and 9999),
     criado_em  timestamptz not null default now()
   )`,
  `create table if not exists iemanja_doacoes (
     item_id    uuid not null references iemanja_itens (id) on delete cascade,
     chave      text not null,
     nome       text not null,
     quantidade int not null check (quantidade > 0),
     primary key (item_id, chave)
   )`,
  `create or replace function iemanja_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', e.id, 'data', e.data, 'visivel', e.visivel, 'sorteado', e.sorteado, 'encerradoEm', e.encerrado_em, 'fora', to_jsonb(e.fora),
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'ordem', g.ordem, 'nome', g.nome, 'responsavelId', g.responsavel_id,
           'responsavel', (select pe.nome from pessoas pe where pe.id = g.responsavel_id),
           'membros', (select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'fixo', m.fixo) order by lower(m.nome)), '[]'::jsonb)
                       from iemanja_membros m where m.grupo_id = g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nome', i.nome, 'quantidade', i.quantidade,
               'doacoes', (select coalesce(jsonb_agg(jsonb_build_object('chave', d.chave, 'nome', d.nome, 'quantidade', d.quantidade) order by lower(d.nome)), '[]'::jsonb)
                           from iemanja_doacoes d where d.item_id = i.id)) order by i.criado_em), '[]'::jsonb)
                     from iemanja_itens i where i.grupo_id = g.id)
         ) order by g.ordem), '[]'::jsonb) from iemanja_grupos g where g.evento_id = e.id)
     ) order by (e.encerrado_em is not null), e.encerrado_em desc nulls first, e.data desc), '[]'::jsonb)
     from iemanja_eventos e
   $$`,
  `create or replace function iemanja_evento_novo(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid;
   begin
     if exists (select 1 from iemanja_eventos where encerrado_em is null) then
       raise exception 'Já existe um evento em andamento. Encerre antes de criar outro.';
     end if;
     insert into iemanja_eventos (data) values ((p ->> 'data')::date) returning id into v_id;
     insert into iemanja_grupos (evento_id, ordem) select v_id, n from generate_series(1, 5) n;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_evento_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     update iemanja_eventos set
       data = case when p ? 'data' then (p ->> 'data')::date else data end,
       visivel = case when p ? 'visivel' then (p ->> 'visivel')::boolean else visivel end,
       fora = case when p ? 'fora' then array(select jsonb_array_elements_text(p -> 'fora')) else fora end,
       encerrado_em = case when (p ->> 'encerrar')::boolean then now() else encerrado_em end
     where id = v_id;
     update iemanja_grupos g set nome = x ->> 'nome', responsavel_id = nullif(x ->> 'responsavelId', '')::uuid
       from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) x
      where g.id = (x ->> 'id')::uuid and g.evento_id = v_id;
     return iemanja_estado();
   end;
   $$`,
  // Cada pessoa fica em um grupo só por evento; quem sai de um grupo deixa os itens que tinha assumido nele.
  `create or replace function iemanja_membro(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_grupo uuid := (p ->> 'grupoId')::uuid;
     v_chave text := p ->> 'chave';
     v_evento uuid := (select evento_id from iemanja_grupos where id = v_grupo);
   begin
     delete from iemanja_doacoes d using iemanja_itens i, iemanja_grupos g
      where d.item_id = i.id and i.grupo_id = g.id and g.evento_id = v_evento and d.chave = v_chave
        and (coalesce((p ->> 'remover')::boolean, false) or g.id <> v_grupo);
     delete from iemanja_membros m using iemanja_grupos g
      where m.grupo_id = g.id and g.evento_id = v_evento and m.chave = v_chave
        and (coalesce((p ->> 'remover')::boolean, false) or g.id <> v_grupo);
     if not coalesce((p ->> 'remover')::boolean, false) then
       insert into iemanja_membros (grupo_id, chave, nome, fixo) values (v_grupo, v_chave, p ->> 'nome', coalesce((p ->> 'fixo')::boolean, false))
       on conflict (grupo_id, chave) do update set fixo = excluded.fixo;
       update iemanja_eventos set fora = array_remove(fora, v_chave) where id = v_evento;
     end if;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into iemanja_itens (grupo_id, nome, quantidade) values ((p ->> 'grupoId')::uuid, p ->> 'nome', (p ->> 'quantidade')::int);
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_item_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from iemanja_itens where id = (p ->> 'id')::uuid;
     return iemanja_estado();
   end;
   $$`,
  // A trava da linha do item impede duas pessoas de passarem da quantidade pedida.
  `create or replace function iemanja_assumir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_item uuid := (p ->> 'itemId')::uuid;
     v_chave text := p ->> 'chave';
     v_qtd int := (p ->> 'quantidade')::int;
     v_pedido int;
   begin
     select quantidade into v_pedido from iemanja_itens where id = v_item for update;
     if v_qtd = 0 then
       delete from iemanja_doacoes where item_id = v_item and chave = v_chave;
     else
       if v_qtd + (select coalesce(sum(quantidade), 0) from iemanja_doacoes where item_id = v_item and chave <> v_chave) > v_pedido then
         raise exception 'Este item já tem responsável para toda a quantidade.';
       end if;
       insert into iemanja_doacoes (item_id, chave, nome, quantidade) values (v_item, v_chave, p ->> 'nome', v_qtd)
       on conflict (item_id, chave) do update set quantidade = excluded.quantidade;
     end if;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_sorteio_gravar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into iemanja_membros (grupo_id, chave, nome, fixo)
       select (g ->> 'id')::uuid, m ->> 'chave', m ->> 'nome', coalesce((m ->> 'fixo')::boolean, false)
       from jsonb_array_elements(p -> 'grupos') g, jsonb_array_elements(g -> 'membros') m
     on conflict (grupo_id, chave) do nothing;
     update iemanja_eventos set sorteado = true where id = (p ->> 'id')::uuid;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_sorteio_cancelar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     delete from iemanja_doacoes d using iemanja_itens i, iemanja_grupos g, iemanja_membros m
      where d.item_id = i.id and i.grupo_id = g.id and g.evento_id = v_id
        and m.grupo_id = g.id and m.chave = d.chave and not m.fixo;
     delete from iemanja_membros m using iemanja_grupos g where m.grupo_id = g.id and g.evento_id = v_id and not m.fixo;
     update iemanja_eventos set sorteado = false where id = v_id;
     return iemanja_estado();
   end;
   $$`,
  // O primeiro evento já vem criado (oculto), só uma vez.
  `do $$
   begin
     if not exists (select 1 from sistema where chave = 'v88_iemanja') then
       perform iemanja_evento_novo('{"data": "2026-12-12"}'::jsonb);
       insert into sistema (chave, valor) values ('v88_iemanja', 'ok');
     end if;
   end;
   $$`,
  // ================================================== v89: Iemanjá (nome, listas do sorteio, grupos variáveis, itens completos) e sub-abas de Oferendas
  `alter table iemanja_eventos add column if not exists nome text not null default 'Oferenda de Iemanjá'`,
  // listas: 'curimba' e ids de turmas que entram no sorteio; nulo = curimba, Turma 09 e Turma 10.
  `alter table iemanja_eventos add column if not exists listas text[]`,
  `alter table iemanja_grupos drop constraint if exists iemanja_grupos_ordem_check`,
  `alter table iemanja_itens add column if not exists entrega date`,
  `alter table iemanja_itens add column if not exists entregue boolean not null default false`,
  `create or replace function iemanja_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', e.id, 'nome', e.nome, 'data', e.data, 'visivel', e.visivel, 'sorteado', e.sorteado, 'encerradoEm', e.encerrado_em, 'fora', to_jsonb(e.fora), 'listas', to_jsonb(e.listas),
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'ordem', g.ordem, 'nome', g.nome, 'responsavelId', g.responsavel_id,
           'responsavel', (select pe.nome from pessoas pe where pe.id = g.responsavel_id),
           'membros', (select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'fixo', m.fixo) order by lower(m.nome)), '[]'::jsonb)
                       from iemanja_membros m where m.grupo_id = g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
               'doacoes', (select coalesce(jsonb_agg(jsonb_build_object('chave', d.chave, 'nome', d.nome, 'quantidade', d.quantidade) order by lower(d.nome)), '[]'::jsonb)
                           from iemanja_doacoes d where d.item_id = i.id)) order by i.criado_em), '[]'::jsonb)
                     from iemanja_itens i where i.grupo_id = g.id)
         ) order by g.ordem), '[]'::jsonb) from iemanja_grupos g where g.evento_id = e.id)
     ) order by (e.encerrado_em is not null), e.encerrado_em desc nulls first, e.data desc), '[]'::jsonb)
     from iemanja_eventos e
   $$`,
  `create or replace function iemanja_evento_novo(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid;
   begin
     if exists (select 1 from iemanja_eventos where encerrado_em is null) then
       raise exception 'Já existe um evento em andamento. Encerre antes de criar outro.';
     end if;
     insert into iemanja_eventos (data, nome)
       values ((p ->> 'data')::date, coalesce(nullif(btrim(p ->> 'nome'), ''), 'Oferenda de Iemanjá'))
       returning id into v_id;
     insert into iemanja_grupos (evento_id, ordem) select v_id, n from generate_series(1, 5) n;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_evento_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     update iemanja_eventos set
       nome = case when p ? 'nome' then p ->> 'nome' else nome end,
       data = case when p ? 'data' then (p ->> 'data')::date else data end,
       visivel = case when p ? 'visivel' then (p ->> 'visivel')::boolean else visivel end,
       fora = case when p ? 'fora' then array(select jsonb_array_elements_text(p -> 'fora')) else fora end,
       listas = case when p ? 'listas' then array(select jsonb_array_elements_text(p -> 'listas')) else listas end,
       encerrado_em = case when (p ->> 'encerrar')::boolean then now() else encerrado_em end
     where id = v_id;
     update iemanja_grupos g set nome = x ->> 'nome', responsavel_id = nullif(x ->> 'responsavelId', '')::uuid
       from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) x
      where g.id = (x ->> 'id')::uuid and g.evento_id = v_id;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_grupo_novo(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     insert into iemanja_grupos (evento_id, ordem)
       select v_id, coalesce(max(ordem), 0) + 1 from iemanja_grupos where evento_id = v_id;
     return iemanja_estado();
   end;
   $$`,
  // Membros, itens e doações do grupo saem junto (on delete cascade).
  `create or replace function iemanja_grupo_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from iemanja_grupos where id = (p ->> 'id')::uuid;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_doado int;
   begin
     if nullif(p ->> 'id', '') is null then
       insert into iemanja_itens (grupo_id, nome, quantidade, entrega)
       values ((p ->> 'grupoId')::uuid, p ->> 'nome', (p ->> 'quantidade')::int, nullif(p ->> 'entrega', '')::date);
     else
       select coalesce(sum(quantidade), 0) into v_doado from iemanja_doacoes where item_id = (p ->> 'id')::uuid;
       if (p ->> 'quantidade')::int < v_doado then
         raise exception 'Já foram assumidos % deste item; a quantidade não pode ser menor.', v_doado;
       end if;
       update iemanja_itens set nome = p ->> 'nome', quantidade = (p ->> 'quantidade')::int, entrega = nullif(p ->> 'entrega', '')::date
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_item_entregue(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update iemanja_itens set entregue = (p ->> 'entregue')::boolean where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Item não encontrado.'; end if;
     return iemanja_estado();
   end;
   $$`,
  // Sub-abas de Oferendas. As encerradas até esta versão vão para Caboclos; as demais, para Gerais.
  `create table if not exists oferenda_abas (
     id        uuid primary key default gen_random_uuid(),
     nome      text not null check (length(btrim(nome)) between 1 and 40),
     ordem     int not null,
     iemanja   boolean not null default false,
     criado_em timestamptz not null default now()
   )`,
  `create unique index if not exists oferenda_abas_nome on oferenda_abas (lower(nome))`,
  `alter table oferendas add column if not exists aba_id uuid references oferenda_abas (id)`,
  `do $$
   declare v_gerais uuid; v_caboclos uuid;
   begin
     if not exists (select 1 from sistema where chave = 'v89_abas') then
       insert into oferenda_abas (nome, ordem) values ('Gerais', 1) returning id into v_gerais;
       insert into oferenda_abas (nome, ordem, iemanja) values ('Iemanjá', 2, true);
       insert into oferenda_abas (nome, ordem) values ('Caboclos', 3) returning id into v_caboclos;
       update oferendas set aba_id = case when status = 'encerrado' then v_caboclos else v_gerais end where aba_id is null;
       insert into sistema (chave, valor) values ('v89_abas', 'ok');
     end if;
   end;
   $$`,
  `alter table oferendas alter column aba_id set not null`,
  `create or replace function oferenda_abas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'iemanja', iemanja) order by ordem), '[]'::jsonb) from oferenda_abas
   $$`,
  `create or replace function oferenda_aba_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if nullif(p ->> 'id', '') is null then
       insert into oferenda_abas (nome, ordem) select btrim(p ->> 'nome'), coalesce(max(ordem), 0) + 1 from oferenda_abas;
     else
       update oferenda_abas set nome = btrim(p ->> 'nome') where id = (p ->> 'id')::uuid and not iemanja;
       if not found then raise exception 'Sub-aba não encontrada.'; end if;
     end if;
     return oferenda_abas_listar();
   exception when unique_violation then
     raise exception 'Já existe uma sub-aba com esse nome.';
   end;
   $$`,
  `create or replace function oferenda_aba_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     if exists (select 1 from oferendas where aba_id = v_id) then
       raise exception 'Mova ou exclua as oferendas desta sub-aba antes.';
     end if;
     if (select count(*) from oferenda_abas where not iemanja) <= 1 then
       raise exception 'É preciso manter pelo menos uma sub-aba de oferendas.';
     end if;
     delete from oferenda_abas where id = v_id and not iemanja;
     if not found then raise exception 'Sub-aba não encontrada.'; end if;
     return oferenda_abas_listar();
   end;
   $$`,
  // Igual à v32, com a sub-aba: sem escolha, vai para a primeira; ao editar, sem escolha, fica onde está.
  `create or replace function oferenda_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid; v_aba uuid := nullif(p ->> 'abaId', '')::uuid;
   begin
     if nullif(p ->> 'id', '') is null then
       insert into oferendas (titulo, data, responsavel_id, por_medium, aba_id)
       values (btrim(p ->> 'titulo'), (p ->> 'data')::date, nullif(p ->> 'responsavelId', '')::uuid,
               coalesce((p ->> 'porMedium')::boolean, false),
               coalesce(v_aba, (select id from oferenda_abas where not iemanja order by ordem limit 1)))
       returning id into v_id;
       if coalesce((p ->> 'porMedium')::boolean, false) then
         insert into oferenda_mediuns (oferenda_id, pessoa_id)
         select v_id, id from pessoas where saida is null;
       end if;
     else
       update oferendas set titulo = btrim(p ->> 'titulo'), data = (p ->> 'data')::date,
              responsavel_id = case when p ? 'responsavelId' then nullif(p ->> 'responsavelId', '')::uuid else responsavel_id end,
              aba_id = coalesce(v_aba, aba_id)
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Oferenda não encontrada.'; end if;
     end if;
     return oferendas_estado();
   end;
   $$`,
  // Igual à v68, com 'abaId'.
  `create or replace function oferendas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', o.id, 'titulo', o.titulo, 'data', o.data, 'status', o.status, 'publicada', o.publicada, 'abaId', o.aba_id,
       'responsavelId', o.responsavel_id, 'responsavel', (select nome from pessoas where id = o.responsavel_id),
       'porMedium', o.por_medium, 'noResumo', o.no_resumo,
       'completaEm', o.completa_em, 'fechada', o.completa_em is not null and o.completa_em <= now() - interval '1 day',
       'grupos', to_jsonb(o.grupos),
       'mediuns', coalesce((select jsonb_agg(x.j order by lower(x.nome)) from (
           select pe.nome, jsonb_build_object('pessoaId', pe.id::text, 'nome', pe.nome, 'pagamento', om.pagamento, 'entrega', om.entrega) as j
           from oferenda_mediuns om join pessoas pe on pe.id = om.pessoa_id
           where om.oferenda_id = o.id and not om.excluido
           union all
           select al.nome, jsonb_build_object('pessoaId', 'a:' || al.id::text, 'nome', al.nome, 'pagamento', oa.pagamento, 'entrega', oa.entrega, 'aluno', true)
           from oferenda_alunos oa join alunos al on al.id = oa.aluno_id
           where oa.oferenda_id = o.id and not oa.excluido) x), '[]'::jsonb),
       'itens', coalesce((select jsonb_agg(jsonb_build_object(
           'id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
           'doacoes', coalesce((select jsonb_agg(jsonb_build_object('chave', d.pessoa_chave, 'nome', coalesce(u.nome, pe.nome, al.nome, d.pessoa_nome),
                                                                    'quantidade', d.quantidade) order by d.atualizado_em)
                                from oferenda_doacoes d left join usuarios u on d.pessoa_chave = 'u:' || u.id::text
                                left join pessoas pe on d.pessoa_chave = 'p:' || pe.id::text
                                left join alunos al on d.pessoa_chave = 'a:' || al.id::text
                                where d.item_id = i.id), '[]'::jsonb)
         ) order by i.criado_em) from oferenda_itens i where i.oferenda_id = o.id), '[]'::jsonb)
     ) order by o.data, o.criado_em), '[]'::jsonb) from oferendas o;
   $$`,
  // ================================================== v90: sub-aba de Oferendas com Visível para todos
  // As que já existem continuam visíveis; as criadas daqui em diante nascem ocultas.
  `alter table oferenda_abas add column if not exists visivel boolean not null default true`,
  `alter table oferenda_abas alter column visivel set default false`,
  `create or replace function oferenda_abas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'iemanja', iemanja, 'visivel', visivel) order by ordem), '[]'::jsonb) from oferenda_abas
   $$`,
  `create or replace function oferenda_aba_visivel(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_abas set visivel = (p ->> 'visivel')::boolean where id = (p ->> 'id')::uuid and not iemanja;
     if not found then raise exception 'Sub-aba não encontrada.'; end if;
     return oferenda_abas_listar();
   end;
   $$`,
  // ================================================== v91: perfil, foto e senha dos alunos (cada aluno só vê os próprios dados)
  `alter table alunos add column if not exists perfil jsonb not null default '{}'::jsonb`,
  `alter table alunos add column if not exists foto text`,
  `alter table alunos add column if not exists pin_hash text`,
  `alter table alunos add column if not exists pin_versao int not null default 0`,
  `create or replace function aluno_acesso(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', a.id, 'nome', a.nome, 'turmaId', a.turma_id, 'temSenha', a.pin_hash is not null, 'pinVersao', a.pin_versao)
     from alunos a where a.id = (p ->> 'id')::uuid
   $$`,
  `create or replace function aluno_pin(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('pinHash', a.pin_hash, 'pinVersao', a.pin_versao,
                               'bloqueadoAte', (select bloqueado_ate from login_falhas where email = 'pina:' || a.id::text and bloqueado_ate > now()))
     from alunos a where a.id = (p ->> 'alunoId')::uuid
   $$`,
  // p = { alunoId, pinHash, soSeVazio }: cria (só se ainda não tiver) ou troca a senha.
  `create or replace function aluno_pin_definir(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_versao int;
   begin
     if coalesce((p ->> 'soSeVazio')::boolean, false)
        and exists (select 1 from alunos where id = (p ->> 'alunoId')::uuid and pin_hash is not null) then
       raise exception 'Você já tem senha.';
     end if;
     update alunos set pin_hash = nullif(p ->> 'pinHash', ''), pin_versao = pin_versao + 1
     where id = (p ->> 'alunoId')::uuid returning pin_versao into v_versao;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     delete from login_falhas where email = 'pina:' || (p ->> 'alunoId');
     return jsonb_build_object('pinVersao', v_versao);
   end;
   $$`,
  `create or replace function aluno_perfil_ler(p jsonb)
   returns jsonb language sql stable as $$
     select perfil from alunos where id = (p ->> 'alunoId')::uuid
   $$`,
  `create or replace function aluno_perfil_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set perfil = coalesce(p -> 'perfil', '{}'::jsonb) where id = (p ->> 'alunoId')::uuid;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     return aluno_perfil_ler(p);
   end;
   $$`,
  `create or replace function aluno_foto_ler(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(foto) from alunos where id = (p ->> 'alunoId')::uuid
   $$`,
  `create or replace function aluno_foto_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set foto = nullif(p ->> 'foto', '') where id = (p ->> 'alunoId')::uuid;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     return aluno_foto_ler(p);
   end;
   $$`,
  // Igual à v84, levando o perfil, a foto e a senha para o cadastro da corrente.
  `create or replace function aluno_transferir_cambone(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_aluno alunos%rowtype;
     v_pessoa_id uuid;
   begin
     select * into v_aluno from alunos where id = v_id for update;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     if exists (select 1 from pessoas where lower(btrim(nome)) = lower(btrim(v_aluno.nome))) then
       raise exception 'Já existe uma pessoa da corrente com esse nome.';
     end if;

     insert into pessoas (nome, funcao, perfil, pin_hash, pin_versao, entrada)
       values (v_aluno.nome, 'cambone', v_aluno.perfil, v_aluno.pin_hash, v_aluno.pin_versao, (now() at time zone 'America/Sao_Paulo')::date)
       returning id into v_pessoa_id;
     if v_aluno.foto is not null then
       insert into pessoas_fotos (pessoa_id, foto) values (v_pessoa_id, v_aluno.foto);
     end if;
     insert into oferenda_mediuns (oferenda_id, pessoa_id, pagamento, entrega, excluido, atualizado_em)
       select oferenda_id, v_pessoa_id, pagamento, entrega, excluido, atualizado_em
       from oferenda_alunos where aluno_id = v_id
       on conflict (oferenda_id, pessoa_id) do update set
         pagamento = excluded.pagamento, entrega = excluded.entrega,
         excluido = excluded.excluido, atualizado_em = excluded.atualizado_em;
     update oferenda_doacoes set pessoa_chave = 'p:' || v_pessoa_id::text
       where pessoa_chave = 'a:' || v_id::text;
     delete from alunos where id = v_id;

     return alunos_estado() || jsonb_build_object('pessoas', pessoas_listar('{"todas": true}'::jsonb));
   exception when unique_violation then
     raise exception 'Já existe uma pessoa da corrente com esse nome.';
   end;
   $$`,
  // ================================================== v92: quem sai da corrente some das listas, mas o histórico fica
  // saida: a partir dessa data a pessoa não conta mais (a gira do próprio dia, se já encerrada, ainda conta: ver pessoas_excluir).
  `alter table pessoas add column if not exists saida date`,
  `alter table alunos add column if not exists saida date`,
  // Só quem está ativo, a não ser com { todas: true } (telas de histórico, que filtram pela data da gira).
  `create or replace function pessoas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.nome)), '[]'::jsonb) from (
       select pe.id, pe.nome, pe.funcao, pe.experiente, pe.linhas, pe.limpeza, pe.entrada, pe.saida,
              coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'inicio', l.inicio, 'fim', l.fim, 'motivo', l.motivo) order by l.inicio)
                        from licencas l where l.pessoa_id = pe.id), '[]'::jsonb) as licencas,
              coalesce(pe.perfil -> 'outros', '{}'::jsonb) as "guiasAtendimento",
              nullif(pe.perfil -> 'guias' -> 'chefe' ->> 'linha', '') as "guiaChefe",
              nullif(pe.perfil -> 'guias' -> 'frente' ->> 'linha', '') as "guiaFrente",
              pe.afinidade_extra as "afinidadeExtra", pe.afinidade_passe as "afinidadePasse",
              case when (pe.perfil -> 'info' ->> 'nascimento') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                   then substring(pe.perfil -> 'info' ->> 'nascimento' from 6 for 5) end as aniversario
       from pessoas pe
       where pe.saida is null or coalesce((p ->> 'todas')::boolean, false)
     ) x;
   $$`,
  `create or replace function perfis_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('pessoaId', id, 'nome', nome, 'funcao', funcao, 'perfil', perfil)
                               order by lower(nome)), '[]'::jsonb)
     from pessoas where saida is null
   $$`,
  `create or replace function senhas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('pessoaId', id, 'nome', nome, 'temSenha', pin_hash is not null)
                               order by lower(nome)), '[]'::jsonb)
     from pessoas where saida is null
   $$`,
  `create or replace function alunos_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'turmas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by lower(nome)) from turmas_alunos), '[]'::jsonb),
       'alunos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'turmaId', turma_id) order by lower(nome)) from alunos where saida is null), '[]'::jsonb))
   $$`,
  // p = { nomes: [...], funcao, entrada?, reativar? }. Nomes repetidos são ignorados.
  // reativar: quem tinha saído e é cadastrado de novo volta com o mesmo registro (o nome é único) e a função informada.
  `create or replace function pessoas_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_n int; v_volta int := 0;
   begin
     if coalesce((p ->> 'reativar')::boolean, false) then
       update pessoas set saida = null, funcao = p ->> 'funcao'
       where saida is not null
         and lower(btrim(nome)) in (select lower(btrim(n)) from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n);
       get diagnostics v_volta = row_count;
     end if;
     with novos as (
       select distinct on (lower(btrim(n))) btrim(n) as nome
       from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n
       where btrim(n) <> ''
     ), ins as (
       insert into pessoas (nome, funcao, experiente, entrada)
       select nome, p ->> 'funcao', false, nullif(p ->> 'entrada', '')::date from novos
       on conflict do nothing
       returning 1
     )
     select count(*) into v_n from ins;
     return jsonb_build_object('criadas', v_n + v_volta);
   end;
   $$`,
  // Excluir: o passado fica (giras encerradas, oferendas passadas ou encerradas); sai do que ainda vai acontecer.
  // Os dados pessoais (perfil, foto, Anamnese, senha) são apagados, como antes.
  `create or replace function pessoas_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
     v_saida date := v_hoje;
   begin
     -- A gira de hoje já encerrada continua contando para quem saiu hoje.
     if exists (select 1 from giras where data = v_hoje and encerrada) then v_saida := v_hoje + 1; end if;
     update pessoas set saida = v_saida, limpeza = null, perfil = '{}'::jsonb, pin_hash = null, pin_versao = pin_versao + 1
     where id = v_id and saida is null;
     if not found then return jsonb_build_object('ok', false); end if;
     delete from pessoas_fotos where pessoa_id = v_id;
     delete from anamnese_respostas where pessoa_id = v_id;
     delete from ausencias_previas where pessoa_id = v_id;
     update usuarios set pessoa_id = null where pessoa_id = v_id;
     update curimba_alunos set pessoa_id = null where pessoa_id = v_id;
     delete from presencas where pessoa_id = v_id and gira_data in (select data from giras where not encerrada and data >= v_saida);
     delete from duplas where v_id in (pessoa_id, medium_id) and gira_data in (select data from giras where not encerrada and data >= v_saida);
     update oferenda_mediuns om set excluido = true from oferendas o
     where om.pessoa_id = v_id and o.id = om.oferenda_id and o.status <> 'encerrado' and o.data >= v_hoje;
     update oferendas set responsavel_id = null where responsavel_id = v_id and status <> 'encerrado' and data >= v_hoje;
     update iemanja_grupos set responsavel_id = null
     where responsavel_id = v_id and evento_id in (select id from iemanja_eventos where encerrado_em is null);
     return jsonb_build_object('ok', true);
   end;
   $$`,
  `create or replace function alunos_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_n int; v_volta int;
   begin
     update alunos set saida = null, turma_id = nullif(p ->> 'turmaId', '')::uuid
     where saida is not null
       and lower(btrim(nome)) in (select lower(btrim(n)) from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n);
     get diagnostics v_volta = row_count;
     with novos as (
       select distinct on (lower(btrim(n))) btrim(n) as nome
       from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n where btrim(n) <> ''
     ), ins as (
       insert into alunos (nome, turma_id) select nome, nullif(p ->> 'turmaId', '')::uuid from novos
       on conflict do nothing returning 1
     )
     select count(*) into v_n from ins;
     return alunos_estado() || jsonb_build_object('criadas', v_n + v_volta);
   end;
   $$`,
  `create or replace function aluno_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
   begin
     update alunos set saida = v_hoje, perfil = '{}'::jsonb, foto = null, pin_hash = null, pin_versao = pin_versao + 1
     where id = v_id and saida is null;
     update oferenda_alunos oa set excluido = true from oferendas o
     where oa.aluno_id = v_id and o.id = oa.oferenda_id and o.status <> 'encerrado' and o.data >= v_hoje;
     return alunos_estado();
   end;
   $$`,
  // ================================================== v93: Configurações da casa (aba Admin root); o padrão de cada campo fica em shared/config.js
  `insert into sistema (chave, valor) values ('config_casa', '{}') on conflict (chave) do nothing`,
  `create or replace function config_casa(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce((select valor::jsonb from sistema where chave = 'config_casa'), '{}'::jsonb);
   $$`,
  `create or replace function config_casa_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update sistema set valor = coalesce(p -> 'config', '{}'::jsonb)::text where chave = 'config_casa';
     if not found then raise exception 'Configurações da casa não encontradas.'; end if;
     return config_casa();
   end;
   $$`,
  // ================================================== v94: nome da gira escrito pelo admin (vazio = nome automático, ver tituloGira em shared/regras.js)
  `alter table giras add column if not exists titulo text not null default '' check (length(titulo) <= 120)`,
  `create or replace function gira_titulo(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update giras set titulo = coalesce(p ->> 'titulo', ''), atualizado_em = now()
       where data = (p ->> 'data')::date;
     if not found then raise exception 'Gira não encontrada.'; end if;
     return gira_json((p ->> 'data')::date);
   end;
   $$`,
  // Igual à versão anterior, com 'titulo'.
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'entidadeNome', g.entidade_nome,
       'titulo', g.titulo,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'participantes', g.participantes,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'evento', g.evento,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atende', g.atende,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,
  // ================================================== v95: Gestão de Conduta e Risco (aba Geral, último bloco)
  // Qualquer pessoa logada abre relatos; só o admin root lê todos (com o nome). Quem abriu edita enquanto não foi lido.
  // O root marca como lido e escreve a resposta: fica como rascunho até publicar; publicada, só quem abriu vê e não muda mais.
  // autor = 'p:<pessoa>' ou 'u:<usuário>', como nas orações.
  `create table if not exists condutas (
     id            uuid primary key default gen_random_uuid(),
     texto         text not null check (length(btrim(texto)) between 1 and 1500),
     autor         text not null,
     autor_nome    text not null default '',
     criado_em     timestamptz not null default now(),
     editado_em    timestamptz,
     lido_em       timestamptz,
     resposta      text not null default '' check (length(resposta) <= 1500),
     publicada_em  timestamptz
   )`,
  `create or replace function condutas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'texto', c.texto, 'autor', c.autor, 'autorNome', c.autor_nome,
                                                  'criadoEm', c.criado_em, 'editadoEm', c.editado_em, 'lidoEm', c.lido_em,
                                                  'resposta', c.resposta, 'publicadaEm', c.publicada_em)
                               order by c.criado_em desc), '[]'::jsonb)
     from condutas c;
   $$`,
  // p = { id?, texto, autor, autorNome } — sem id abre um relato; com id, só quem abriu edita, e só antes de ser lido.
  `create or replace function conduta_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'id', '') = '' then
       insert into condutas (texto, autor, autor_nome) values (btrim(p ->> 'texto'), p ->> 'autor', coalesce(p ->> 'autorNome', ''));
     else
       update condutas set texto = btrim(p ->> 'texto'), editado_em = now()
         where id = (p ->> 'id')::uuid and autor = p ->> 'autor' and lido_em is null;
       if not found then raise exception 'Este relato já foi lido pela direção e não pode mais ser editado.'; end if;
     end if;
     return condutas_listar();
   end;
   $$`,
  // p = { id } — o root marca como lido (não volta a não lido).
  `create or replace function conduta_ler(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update condutas set lido_em = coalesce(lido_em, now()) where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Relato não encontrado.'; end if;
     return condutas_listar();
   end;
   $$`,
  // p = { id, resposta, publicar } — rascunho (publicar false) ou publicada; só depois de lido e antes de publicar.
  `create or replace function conduta_responder(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update condutas set resposta = btrim(coalesce(p ->> 'resposta', '')),
                         publicada_em = case when coalesce((p ->> 'publicar')::boolean, false) then now() end
       where id = (p ->> 'id')::uuid and lido_em is not null and publicada_em is null;
     if not found then raise exception 'Marque o relato como lido antes de responder (resposta publicada não muda mais).'; end if;
     return condutas_listar();
   end;
   $$`,
  // ================================================== v96: Gestão de Conduta e Risco: interruptor "Visível para todos"
  // Começa desligado: só o admin root vê o bloco até ligar. Desligar esconde de novo (os relatos ficam guardados).
  `insert into sistema (chave, valor) values ('conduta_ativa', 'false') on conflict (chave) do nothing`,
  `create or replace function conduta_ativa(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'conduta_ativa'), false))
   $$`,
  `create or replace function conduta_ativar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('conduta_ativa', case when (p ->> 'ativa')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return conduta_ativa();
   end;
   $$`,
  // ================================================== v97: Iemanjá: categorias (Elemento, Flores, Frutas…)
  // O evento tem a lista, que vale para todas as oferendas (grupos); cada item guarda a sua (vazio = sem categoria).
  // A tela agrupa os itens do grupo na ordem da lista. Evento novo herda a lista do último evento.
  `alter table iemanja_eventos add column if not exists categorias text[] not null default '{}'`,
  `alter table iemanja_itens add column if not exists categoria text not null default ''`,
  `create or replace function iemanja_evento_novo(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid;
   begin
     if exists (select 1 from iemanja_eventos where encerrado_em is null) then
       raise exception 'Já existe um evento em andamento. Encerre antes de criar outro.';
     end if;
     insert into iemanja_eventos (data, nome, categorias)
       values ((p ->> 'data')::date, coalesce(nullif(btrim(p ->> 'nome'), ''), 'Oferenda de Iemanjá'),
               coalesce((select categorias from iemanja_eventos order by data desc, criado_em desc limit 1), '{}'))
       returning id into v_id;
     insert into iemanja_grupos (evento_id, ordem) select v_id, n from generate_series(1, 5) n;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_evento_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     update iemanja_eventos set
       nome = case when p ? 'nome' then p ->> 'nome' else nome end,
       data = case when p ? 'data' then (p ->> 'data')::date else data end,
       visivel = case when p ? 'visivel' then (p ->> 'visivel')::boolean else visivel end,
       fora = case when p ? 'fora' then array(select jsonb_array_elements_text(p -> 'fora')) else fora end,
       listas = case when p ? 'listas' then array(select jsonb_array_elements_text(p -> 'listas')) else listas end,
       categorias = case when p ? 'categorias' then array(select jsonb_array_elements_text(p -> 'categorias')) else categorias end,
       encerrado_em = case when (p ->> 'encerrar')::boolean then now() else encerrado_em end
     where id = v_id;
     update iemanja_grupos g set nome = x ->> 'nome', responsavel_id = nullif(x ->> 'responsavelId', '')::uuid
       from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) x
      where g.id = (x ->> 'id')::uuid and g.evento_id = v_id;
     return iemanja_estado();
   end;
   $$`,
  `create or replace function iemanja_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', e.id, 'nome', e.nome, 'data', e.data, 'visivel', e.visivel, 'sorteado', e.sorteado, 'encerradoEm', e.encerrado_em, 'fora', to_jsonb(e.fora), 'listas', to_jsonb(e.listas), 'categorias', to_jsonb(e.categorias),
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'ordem', g.ordem, 'nome', g.nome, 'responsavelId', g.responsavel_id,
           'responsavel', (select pe.nome from pessoas pe where pe.id = g.responsavel_id),
           'membros', (select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'fixo', m.fixo) order by lower(m.nome)), '[]'::jsonb)
                       from iemanja_membros m where m.grupo_id = g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
               'doacoes', (select coalesce(jsonb_agg(jsonb_build_object('chave', d.chave, 'nome', d.nome, 'quantidade', d.quantidade) order by lower(d.nome)), '[]'::jsonb)
                           from iemanja_doacoes d where d.item_id = i.id)) order by i.criado_em), '[]'::jsonb)
                     from iemanja_itens i where i.grupo_id = g.id)
         ) order by g.ordem), '[]'::jsonb) from iemanja_grupos g where g.evento_id = e.id)
     ) order by (e.encerrado_em is not null), e.encerrado_em desc nulls first, e.data desc), '[]'::jsonb)
     from iemanja_eventos e
   $$`,
  `create or replace function iemanja_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_doado int;
   begin
     if nullif(p ->> 'id', '') is null then
       insert into iemanja_itens (grupo_id, nome, categoria, quantidade, entrega)
       values ((p ->> 'grupoId')::uuid, p ->> 'nome', coalesce(p ->> 'categoria', ''), (p ->> 'quantidade')::int, nullif(p ->> 'entrega', '')::date);
     else
       select coalesce(sum(quantidade), 0) into v_doado from iemanja_doacoes where item_id = (p ->> 'id')::uuid;
       if (p ->> 'quantidade')::int < v_doado then
         raise exception 'Já foram assumidos % deste item; a quantidade não pode ser menor.', v_doado;
       end if;
       update iemanja_itens set nome = p ->> 'nome', categoria = coalesce(p ->> 'categoria', ''), quantidade = (p ->> 'quantidade')::int,
                                entrega = nullif(p ->> 'entrega', '')::date
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return iemanja_estado();
   end;
   $$`,
  // ================================================== v98: o que foi encerrado não muda mais com o cadastro
  // Gira encerrada guarda o retrato de quem estava nela (shared/regras.js retratoDaGira): nome, função, linhas,
  // + médium de passe, turma da limpeza e a licença daquele dia. Reabrir apaga o retrato.
  `alter table giras add column if not exists retrato jsonb`,
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'entidadeNome', g.entidade_nome,
       'titulo', g.titulo,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
       'participantes', g.participantes,
       'limpeza', g.limpeza,
       'orixa', g.orixa,
       'evento', g.evento,
       'pendentePadrao', g.pendente_padrao,
       'publicada', coalesce(g.publicada, false),
       'travada', g.travada,
       'recado', g.recado,
       'papeis', g.papeis,
       'atende', g.atende,
       'retrato', g.retrato,
       'atualizadoEm', g.atualizado_em,
       'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                             from presencas pr where pr.gira_data = g.data), '{}'::jsonb),
       'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                 'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                          from duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
       'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                  'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                           from duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
     )
     from giras g where g.data = d;
   $$`,
  // Retrato pelo cadastro de hoje (o mesmo que shared/regras.js retratoDaGira monta): para as giras já encerradas
  // e para a gira antiga cadastrada (ou importada) já encerrada.
  `create or replace function gira_retrato_do_cadastro(d date)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_object_agg(pe.id::text, jsonb_build_object(
         'nome', pe.nome, 'funcao', pe.funcao, 'experiente', pe.experiente, 'linhas', to_jsonb(pe.linhas), 'limpeza', pe.limpeza,
         'licenca', (select jsonb_build_object('id', l.id, 'inicio', l.inicio, 'fim', l.fim, 'motivo', l.motivo)
                     from licencas l where l.pessoa_id = pe.id and l.inicio <= d and d <= l.fim order by l.inicio limit 1))), '{}'::jsonb)
     from pessoas pe
     where (pe.entrada is null or pe.entrada <= d) and (pe.saida is null or d < pe.saida)
   $$`,
  // p = { data, retrato } grava (com null, apaga) o retrato; { data, doCadastro: true } tira pelo cadastro de hoje.
  `create or replace function gira_retrato(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_data date := (p ->> 'data')::date;
   begin
     update giras set retrato = case when coalesce((p ->> 'doCadastro')::boolean, false) then gira_retrato_do_cadastro(v_data)
                                     else nullif(p -> 'retrato', 'null'::jsonb) end
     where data = v_data;
     return gira_json(v_data);
   end;
   $$`,
  `update giras set retrato = gira_retrato_do_cadastro(data) where encerrada and retrato is null`,

  // Oferenda encerrada guarda o nome de quem participou, do responsável e de quem doou: { "p:<id>" | "a:<id>" |
  // chave da doação | "responsavel": nome }. Pagamento, entrega e itens continuam na oferenda (podem ser acertados depois).
  `alter table oferendas add column if not exists retrato jsonb`,
  `create or replace function oferenda_retrato(p_id uuid)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) from (
       select 'p:' || pe.id::text as k, pe.nome as n
       from oferenda_mediuns om join pessoas pe on pe.id = om.pessoa_id where om.oferenda_id = p_id
       union
       select 'a:' || al.id::text, al.nome
       from oferenda_alunos oa join alunos al on al.id = oa.aluno_id where oa.oferenda_id = p_id
       union
       select 'p:' || pe.id::text, pe.nome
       from oferendas o join pessoas pe on pe.id = o.responsavel_id where o.id = p_id
       union
       -- também sem o id: apagar o responsável zera responsavel_id (on delete set null)
       select 'responsavel', pe.nome
       from oferendas o join pessoas pe on pe.id = o.responsavel_id where o.id = p_id
       union
       select d.pessoa_chave, coalesce(u.nome, pe.nome, al.nome, d.pessoa_nome)
       from oferenda_doacoes d join oferenda_itens i on i.id = d.item_id
       left join usuarios u on d.pessoa_chave = 'u:' || u.id::text
       left join pessoas pe on d.pessoa_chave = 'p:' || pe.id::text
       left join alunos al on d.pessoa_chave = 'a:' || al.id::text
       where i.oferenda_id = p_id
     ) x where x.n is not null
   $$`,
  `update oferendas set retrato = oferenda_retrato(id) where status = 'encerrado' and retrato is null`,
  // Nomes: o do retrato primeiro (encerrada); quem já foi apagado do cadastro continua pelo retrato.
  `create or replace function oferendas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', o.id, 'titulo', o.titulo, 'data', o.data, 'status', o.status, 'publicada', o.publicada, 'abaId', o.aba_id,
       'responsavelId', o.responsavel_id,
       'responsavel', case when o.responsavel_id is null then o.retrato ->> 'responsavel'
                           else coalesce(o.retrato ->> ('p:' || o.responsavel_id::text), (select nome from pessoas where id = o.responsavel_id)) end,
       'porMedium', o.por_medium, 'noResumo', o.no_resumo,
       'completaEm', o.completa_em, 'fechada', o.completa_em is not null and o.completa_em <= now() - interval '1 day',
       'grupos', to_jsonb(o.grupos),
       'mediuns', coalesce((select jsonb_agg(x.j order by lower(x.nome)) from (
           select n.nome, jsonb_build_object('pessoaId', om.pessoa_id::text, 'nome', n.nome, 'pagamento', om.pagamento, 'entrega', om.entrega) as j
           from oferenda_mediuns om left join pessoas pe on pe.id = om.pessoa_id
           cross join lateral (select coalesce(o.retrato ->> ('p:' || om.pessoa_id::text), pe.nome) as nome) n
           where om.oferenda_id = o.id and not om.excluido and n.nome is not null
           union all
           select n.nome, jsonb_build_object('pessoaId', 'a:' || oa.aluno_id::text, 'nome', n.nome, 'pagamento', oa.pagamento, 'entrega', oa.entrega, 'aluno', true)
           from oferenda_alunos oa left join alunos al on al.id = oa.aluno_id
           cross join lateral (select coalesce(o.retrato ->> ('a:' || oa.aluno_id::text), al.nome) as nome) n
           where oa.oferenda_id = o.id and not oa.excluido and n.nome is not null) x), '[]'::jsonb),
       'itens', coalesce((select jsonb_agg(jsonb_build_object(
           'id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
           'doacoes', coalesce((select jsonb_agg(jsonb_build_object('chave', d.pessoa_chave,
                                                                    'nome', coalesce(o.retrato ->> d.pessoa_chave, u.nome, pe.nome, al.nome, d.pessoa_nome),
                                                                    'quantidade', d.quantidade) order by d.atualizado_em)
                                from oferenda_doacoes d left join usuarios u on d.pessoa_chave = 'u:' || u.id::text
                                left join pessoas pe on d.pessoa_chave = 'p:' || pe.id::text
                                left join alunos al on d.pessoa_chave = 'a:' || al.id::text
                                where d.item_id = i.id), '[]'::jsonb)
         ) order by i.criado_em) from oferenda_itens i where i.oferenda_id = o.id), '[]'::jsonb)
     ) order by o.data, o.criado_em), '[]'::jsonb) from oferendas o;
   $$`,

  // Oferenda de Iemanjá: membros e doações já guardam o nome; o responsável do grupo fica guardado ao encerrar.
  `alter table iemanja_grupos add column if not exists responsavel_nome text`,
  `create or replace function iemanja_encerrar_trg()
   returns trigger language plpgsql as $$
   begin
     if new.encerrado_em is not null and old.encerrado_em is null then
       update iemanja_grupos g set responsavel_nome = (select nome from pessoas where id = g.responsavel_id) where g.evento_id = new.id;
     end if;
     return null;
   end;
   $$`,
  `drop trigger if exists iemanja_encerrar on iemanja_eventos`,
  `create trigger iemanja_encerrar after update of encerrado_em on iemanja_eventos
   for each row execute function iemanja_encerrar_trg()`,
  `update iemanja_grupos g set responsavel_nome = (select nome from pessoas where id = g.responsavel_id)
   from iemanja_eventos e where e.id = g.evento_id and e.encerrado_em is not null and g.responsavel_nome is null`,
  `create or replace function iemanja_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', e.id, 'nome', e.nome, 'data', e.data, 'visivel', e.visivel, 'sorteado', e.sorteado, 'encerradoEm', e.encerrado_em, 'fora', to_jsonb(e.fora), 'listas', to_jsonb(e.listas), 'categorias', to_jsonb(e.categorias),
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'ordem', g.ordem, 'nome', g.nome, 'responsavelId', g.responsavel_id,
           'responsavel', case when e.encerrado_em is not null then g.responsavel_nome
                               else (select pe.nome from pessoas pe where pe.id = g.responsavel_id) end,
           'membros', (select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'fixo', m.fixo) order by lower(m.nome)), '[]'::jsonb)
                       from iemanja_membros m where m.grupo_id = g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
               'doacoes', (select coalesce(jsonb_agg(jsonb_build_object('chave', d.chave, 'nome', d.nome, 'quantidade', d.quantidade) order by lower(d.nome)), '[]'::jsonb)
                           from iemanja_doacoes d where d.item_id = i.id)) order by i.criado_em), '[]'::jsonb)
                     from iemanja_itens i where i.grupo_id = g.id)
         ) order by g.ordem), '[]'::jsonb) from iemanja_grupos g where g.evento_id = e.id)
     ) order by (e.encerrado_em is not null), e.encerrado_em desc nulls first, e.data desc), '[]'::jsonb)
     from iemanja_eventos e
   $$`,

  // Apagar de vez quem foi excluído: o histórico (presença, duplas, linhas de oferenda) não some junto com o
  // cadastro — as encerradas têm o retrato. Tira as chaves estrangeiras com "on delete cascade" dessas tabelas.
  `do $$ declare r record;
   begin
     for r in select c.conname, t.relname from pg_constraint c join pg_class t on t.oid = c.conrelid
              where c.contype = 'f' and t.relname in ('presencas', 'duplas', 'oferenda_mediuns', 'oferenda_alunos')
                and c.confrelid in ('pessoas'::regclass, 'alunos'::regclass)
     loop
       execute format('alter table %I drop constraint %I', r.relname, r.conname);
     end loop;
   end $$`,
  // UP CPJ: as oferendas encerradas ficam como estavam (com o aluno, pelo retrato); só as outras passam para médiuns.
  `create or replace function aluno_transferir_cambone(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_aluno alunos%rowtype;
     v_pessoa_id uuid;
   begin
     select * into v_aluno from alunos where id = v_id for update;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     if exists (select 1 from pessoas where lower(btrim(nome)) = lower(btrim(v_aluno.nome))) then
       raise exception 'Já existe uma pessoa da corrente com esse nome.';
     end if;

     insert into pessoas (nome, funcao, perfil, pin_hash, pin_versao, entrada)
       values (v_aluno.nome, 'cambone', v_aluno.perfil, v_aluno.pin_hash, v_aluno.pin_versao, (now() at time zone 'America/Sao_Paulo')::date)
       returning id into v_pessoa_id;
     if v_aluno.foto is not null then
       insert into pessoas_fotos (pessoa_id, foto) values (v_pessoa_id, v_aluno.foto);
     end if;
     insert into oferenda_mediuns (oferenda_id, pessoa_id, pagamento, entrega, excluido, atualizado_em)
       select oa.oferenda_id, v_pessoa_id, oa.pagamento, oa.entrega, oa.excluido, oa.atualizado_em
       from oferenda_alunos oa join oferendas o on o.id = oa.oferenda_id
       where oa.aluno_id = v_id and o.status <> 'encerrado'
       on conflict (oferenda_id, pessoa_id) do update set
         pagamento = excluded.pagamento, entrega = excluded.entrega,
         excluido = excluded.excluido, atualizado_em = excluded.atualizado_em;
     delete from oferenda_alunos oa using oferendas o
       where oa.aluno_id = v_id and o.id = oa.oferenda_id and o.status <> 'encerrado';
     update oferenda_doacoes d set pessoa_chave = 'p:' || v_pessoa_id::text
       from oferenda_itens i join oferendas o on o.id = i.oferenda_id
       where d.item_id = i.id and o.status <> 'encerrado' and d.pessoa_chave = 'a:' || v_id::text;
     delete from alunos where id = v_id;

     return alunos_estado() || jsonb_build_object('pessoas', pessoas_listar('{"todas": true}'::jsonb));
   exception when unique_violation then
     raise exception 'Já existe uma pessoa da corrente com esse nome.';
   end;
   $$`,
  // Apaga a pessoa ou o aluno excluído que não está em nada ainda aberto: gira não encerrada da época em que
  // estava na corrente, oferenda não encerrada, Oferenda de Iemanjá não encerrada. Antes, tira as linhas
  // "excluído" dele das oferendas abertas. Licenças, foto, Anamnese e ausências antecipadas vão junto (cascade).
  `create or replace function apagar_excluidos(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   declare v_pessoas uuid[]; v_alunos uuid[];
   begin
     select coalesce(array_agg(pe.id), '{}') into v_pessoas from pessoas pe
     where pe.saida is not null
       and not exists (select 1 from giras g where not g.encerrada and g.data < pe.saida and (pe.entrada is null or g.data >= pe.entrada))
       and not exists (select 1 from presencas pr join giras g on g.data = pr.gira_data where pr.pessoa_id = pe.id and not g.encerrada)
       and not exists (select 1 from duplas du join giras g on g.data = du.gira_data where pe.id in (du.pessoa_id, du.medium_id) and not g.encerrada)
       and not exists (select 1 from oferenda_mediuns om join oferendas o on o.id = om.oferenda_id
                       where om.pessoa_id = pe.id and not om.excluido and o.status <> 'encerrado')
       and not exists (select 1 from oferendas o where o.responsavel_id = pe.id and o.status <> 'encerrado')
       and not exists (select 1 from iemanja_grupos g join iemanja_eventos e on e.id = g.evento_id
                       where g.responsavel_id = pe.id and e.encerrado_em is null)
       and not exists (select 1 from iemanja_membros m join iemanja_grupos g on g.id = m.grupo_id join iemanja_eventos e on e.id = g.evento_id
                       where m.chave = 'p:' || pe.id::text and e.encerrado_em is null);
     select coalesce(array_agg(a.id), '{}') into v_alunos from alunos a
     where a.saida is not null
       and not exists (select 1 from oferenda_alunos oa join oferendas o on o.id = oa.oferenda_id
                       where oa.aluno_id = a.id and not oa.excluido and o.status <> 'encerrado')
       and not exists (select 1 from iemanja_membros m join iemanja_grupos g on g.id = m.grupo_id join iemanja_eventos e on e.id = g.evento_id
                       where m.chave = 'a:' || a.id::text and e.encerrado_em is null);
     delete from oferenda_mediuns om using oferendas o
       where om.pessoa_id = any(v_pessoas) and o.id = om.oferenda_id and o.status <> 'encerrado';
     delete from oferenda_alunos oa using oferendas o
       where oa.aluno_id = any(v_alunos) and o.id = oa.oferenda_id and o.status <> 'encerrado';
     delete from pessoas where id = any(v_pessoas);
     delete from alunos where id = any(v_alunos);
     return jsonb_build_object('pessoas', cardinality(v_pessoas), 'alunos', cardinality(v_alunos));
   end;
   $$`,
  // Encerrar tira o retrato (já encerrada, mantém o que tinha); sair de encerrado apaga. Encerrar também libera
  // quem só faltava nela para ser apagado (apagar_excluidos).
  `create or replace function oferenda_status(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferendas set status = p ->> 'status', publicada = publicada or (p ->> 'status') = 'publicado',
       retrato = case when (p ->> 'status') = 'encerrado'
                      then coalesce(case when status = 'encerrado' then retrato end, oferenda_retrato(id)) end
      where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Oferenda não encontrada.'; end if;
     if (p ->> 'status') = 'encerrado' then perform apagar_excluidos(); end if;
     return oferendas_estado();
   end;
   $$`,
  `select apagar_excluidos()`,
];
