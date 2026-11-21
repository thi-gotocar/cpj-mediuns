// Esquema do banco (Postgres da Vercel / Neon).
//
// O backend aplica este esquema sozinho no primeiro acesso (api/_lib/db.js):
// não é preciso rodar SQL à mão. Cada item da lista é UM comando SQL, e todos
// são idempotentes (podem rodar de novo sem estragar nada).
//
// Para mudar o esquema: acrescente comandos no fim e aumente VERSAO. Ao redefinir uma função,
// apague a definição antiga se nenhum comando entre as duas a chama, nem por outra função (só a última vale).
// Convenções: docs/como-trabalhamos.md.

export const VERSAO = 161;  // v161: QR do Pix só pendente, oferendas sem gravar na leitura, giras em janela e versão própria

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

  // ================================================== v74: evento sem limpeza, escala ou sugestões
  `alter table giras add column if not exists evento boolean not null default false`,

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
  // ================================================== v81: login limitado para alunos da CPJ e alunos de curimba
  `create or replace function curimba_aluno_acesso(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', a.id, 'nome', coalesce(pe.nome, a.nome), 'pessoaId', a.pessoa_id)
     from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id
     where a.id = (p ->> 'id')::uuid
   $$`,
  // ================================================== v82: Admin curimba publica e administra os vídeos da casa
  `update perfis set abas = jsonb_set(coalesce(abas, '{}'::jsonb), '{videos}', '{"ver":true,"editar":true}'::jsonb, true)
    where chave = 'admin_curimba'`,
  // ================================================== v83: transferir aluno para a Corrente como Cambone sem perder histórico de oferendas
  // ================================================== v84: promover aluno para CPJ como Cambone, mantendo o nome usado no acesso
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
  `create or replace function iemanja_item_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from iemanja_itens where id = (p ->> 'id')::uuid;
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
  // ================================================== v90: sub-aba de Oferendas com Visível para todos
  // As que já existem continuam visíveis; as criadas daqui em diante nascem ocultas.
  `alter table oferenda_abas add column if not exists visivel boolean not null default true`,
  `alter table oferenda_abas alter column visivel set default false`,
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
  // ================================================== v92: quem sai da corrente some das listas, mas o histórico fica
  // saida: a partir dessa data a pessoa não conta mais (a gira do próprio dia, se já encerrada, ainda conta: ver pessoas_excluir).
  `alter table pessoas add column if not exists saida date`,
  `alter table alunos add column if not exists saida date`,
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
  // Aqui havia um "select apagar_excluidos()" (limpeza única, já feita). Saiu na v125: como a lista roda de novo a cada
  // versão com a definição antiga desta altura, ele apagaria os ex-alunos.

  // ================================================== v99: abertura do app em uma consulta e "nada mudou" ao voltar
  // Versão dos dados da abertura: um contador que sobe a cada gravação nas tabelas que vão em /auth/inicio,
  // mais a hora (o que vence com o tempo, como as orações de 7 dias, se renova pelo menos a cada hora).
  `create sequence if not exists versao_dados_seq`,
  `create or replace function versao_dados_subir()
   returns trigger language plpgsql as $$
   begin
     perform nextval('versao_dados_seq');
     return null;
   end;
   $$`,
  `do $$ declare t text;
   begin
     foreach t in array array['pessoas', 'licencas', 'giras', 'presencas', 'duplas', 'eventos', 'oracoes', 'oracoes_reacoes',
                              'curimba_aulas', 'curimba_presencas', 'curimba_alunos', 'sistema']
     loop
       if to_regclass(t) is not null then
         execute format('drop trigger if exists versao_dados on %I', t);
         -- Por linha: só sobe quando uma linha muda de fato (um delete que não apaga nada, como o das orações vencidas
         -- a cada abertura, não conta).
         execute format('create trigger versao_dados after insert or update or delete on %I for each row execute function versao_dados_subir()', t);
       end if;
     end loop;
   end $$`,
  // Iemanjá para decidir a aba (sem ler grupos, itens e doações): visível e quem é responsável em cada evento.
  `create or replace function iemanja_resumo(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('visivel', e.visivel,
       'responsaveis', coalesce((select jsonb_agg(g.responsavel_id) from iemanja_grupos g
                                 where g.evento_id = e.id and g.responsavel_id is not null), '[]'::jsonb))), '[]'::jsonb)
     from iemanja_eventos e
   $$`,
  // ================================================== v100: Detalhes de cada sub-aba de Oferendas (texto do admin para o pessoal)
  `alter table oferenda_abas add column if not exists detalhes text not null default ''`,
  `create or replace function oferenda_abas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'iemanja', iemanja, 'visivel', visivel, 'detalhes', detalhes) order by ordem), '[]'::jsonb) from oferenda_abas
   $$`,
  `create or replace function oferenda_aba_detalhes(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update oferenda_abas set detalhes = coalesce(p ->> 'detalhes', '') where id = (p ->> 'id')::uuid and not iemanja;
     if not found then raise exception 'Sub-aba não encontrada.'; end if;
     return oferenda_abas_listar();
   end;
   $$`,
  // ================================================== v101: Detalhes de cada evento da Iemanjá (evento novo começa vazio)
  `alter table iemanja_eventos add column if not exists detalhes text not null default ''`,
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
       detalhes = case when p ? 'detalhes' then coalesce(p ->> 'detalhes', '') else detalhes end,
       encerrado_em = case when (p ->> 'encerrar')::boolean then now() else encerrado_em end
     where id = v_id;
     update iemanja_grupos g set nome = x ->> 'nome', responsavel_id = nullif(x ->> 'responsavelId', '')::uuid
       from jsonb_array_elements(coalesce(p -> 'grupos', '[]'::jsonb)) x
      where g.id = (x ->> 'id')::uuid and g.evento_id = v_id;
     return iemanja_estado();
   end;
   $$`,
  // ================================================== v102: pessoas do grupo da Iemanjá com a lista de cada uma
  // ================================================== v103: aba Pedidos de Guias — grupos, itens à venda e pedidos numerados
  // A aba começa escondida (só quem administra vê) até o admin ligar "Visível para todos".
  `insert into sistema (chave, valor) values ('guias_publicada', 'false') on conflict (chave) do nothing`,
  `create or replace function guias_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'guias_publicada'), false))
   $$`,
  `create or replace function guias_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('guias_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return guias_publicada();
   end;
   $$`,
  // Todos os perfis veem a aba (menos o Admin curimba); só o root e o Admin administram. O que o root mudar depois fica.
  `update perfis set abas = abas || jsonb_build_object('guias', jsonb_build_object('ver', chave <> 'admin_curimba', 'editar', chave in ('root', 'admin')))
   where not abas ? 'guias'`,
  `create table if not exists guias_grupos (
     id         uuid primary key default gen_random_uuid(),
     descricao  text not null check (length(btrim(descricao)) between 1 and 80),
     visivel    boolean not null default true,
     criado_em  timestamptz not null default now()
   )`,
  // foto: JPEG pequeno em base64 (como a foto do Perfil); quantidade = o que ainda está disponível.
  `create table if not exists guias_itens (
     id          uuid primary key default gen_random_uuid(),
     grupo_id    uuid not null references guias_grupos(id) on delete cascade,
     descricao   text not null check (length(btrim(descricao)) between 1 and 120),
     foto        text,
     quantidade  int not null default 0 check (quantidade >= 0),
     valor       numeric(10, 2) not null default 0 check (valor >= 0),
     visivel     boolean not null default true,
     criado_em   timestamptz not null default now()
   )`,
  // Cada pedido tem um número sequencial; no máximo um aberto (encerrado_em nulo) recebe os pedidos.
  `create table if not exists guias_pedidos (
     numero        int primary key,
     criado_em     timestamptz not null default now(),
     encerrado_em  timestamptz
   )`,
  `insert into guias_pedidos (numero) values (1) on conflict (numero) do nothing`,
  // Linha = o que uma pessoa pediu de um item num pedido. Descrição e valor ficam gravados (o item pode mudar ou sair).
  `create table if not exists guias_linhas (
     id          uuid primary key default gen_random_uuid(),
     pedido      int not null references guias_pedidos(numero),
     item_id     uuid references guias_itens(id) on delete set null,
     descricao   text not null,
     valor       numeric(10, 2) not null,
     quantidade  int not null check (quantidade > 0),
     chave       text not null,
     nome        text not null,
     ok          boolean not null default false,
     criado_em   timestamptz not null default now()
   )`,
  `create index if not exists guias_linhas_pedido on guias_linhas (pedido)`,
  `create or replace function guia_item_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from guias_itens where id = (p ->> 'id')::uuid;
     return guias_estado();
   end;
   $$`,
  `create or replace function guia_linha_ok(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update guias_linhas set ok = (p ->> 'ok')::boolean where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Pedido não encontrado.'; end if;
     return guias_estado();
   end;
   $$`,
  // ================================================== v104: unidade do item das oferendas e da Iemanjá (vazio = sem unidade, como antes)
  `alter table oferenda_itens add column if not exists unidade text not null default ''`,
  `alter table iemanja_itens add column if not exists unidade text not null default ''`,
  // ================================================== v105: quantidade quebrada (kg e litro: 1,5 kg) e troca de pessoas entre grupos da Iemanjá
  // A quantidade do item e da doação passa a aceitar até 2 casas; a API só deixa fração nas unidades kg e litro.
  // O gatilho "update of quantidade" impede trocar o tipo da coluna: sai antes e volta depois.
  `drop trigger if exists oferenda_itens_completa on oferenda_itens`,
  `alter table oferenda_itens drop constraint if exists oferenda_itens_quantidade_check`,
  `alter table oferenda_itens alter column quantidade type numeric(10, 2)`,
  `alter table oferenda_itens add constraint oferenda_itens_quantidade_check check (quantidade > 0 and quantidade <= 10000)`,
  `alter table oferenda_doacoes drop constraint if exists oferenda_doacoes_quantidade_check`,
  `alter table oferenda_doacoes alter column quantidade type numeric(10, 2)`,
  `alter table oferenda_doacoes add constraint oferenda_doacoes_quantidade_check check (quantidade > 0 and quantidade <= 10000)`,
  `alter table iemanja_itens drop constraint if exists iemanja_itens_quantidade_check`,
  `alter table iemanja_itens alter column quantidade type numeric(10, 2)`,
  `alter table iemanja_itens add constraint iemanja_itens_quantidade_check check (quantidade > 0 and quantidade <= 9999)`,
  `alter table iemanja_doacoes drop constraint if exists iemanja_doacoes_quantidade_check`,
  `alter table iemanja_doacoes alter column quantidade type numeric(10, 2)`,
  `alter table iemanja_doacoes add constraint iemanja_doacoes_quantidade_check check (quantidade > 0)`,
  `create trigger oferenda_itens_completa after insert or update of quantidade or delete on oferenda_itens
   for each row execute function oferenda_completa_trg()`,
  // Troca duas pessoas de grupos diferentes do mesmo evento (cada uma vai para o grupo da outra).
  `create or replace function iemanja_trocar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_ga uuid; v_gb uuid;
   begin
     select m.grupo_id into v_ga from iemanja_membros m join iemanja_grupos g on g.id = m.grupo_id
      where g.evento_id = (p ->> 'id')::uuid and m.chave = p ->> 'a';
     select m.grupo_id into v_gb from iemanja_membros m join iemanja_grupos g on g.id = m.grupo_id
      where g.evento_id = (p ->> 'id')::uuid and m.chave = p ->> 'b';
     if v_ga is null or v_gb is null then raise exception 'Pessoa não encontrada nos grupos deste evento.'; end if;
     if v_ga = v_gb then raise exception 'Escolha pessoas de oferendas diferentes.'; end if;
     update iemanja_membros set grupo_id = case when grupo_id = v_ga then v_gb else v_ga end
      where (grupo_id = v_ga and chave = p ->> 'a') or (grupo_id = v_gb and chave = p ->> 'b');
     return iemanja_estado();
   end;
   $$`,
  // ================================================== v106: orações (até 4 dias; toda sexta a lista recomeça) e transporte da Iemanjá
  // A oração some no que vier primeiro: 4 dias depois de pedida ou à 0h da sexta seguinte ao dia em que foi pedida
  // (horário de Brasília) — a pedida numa sexta passa por aquela sexta e vai até a outra (ou os 4 dias).
  `create or replace function oracao_expira(t timestamptz)
   returns timestamptz language sql stable as $$
     select least(t + interval '4 days',
       ((t at time zone 'America/Sao_Paulo')::date
         + coalesce(nullif((5 - extract(isodow from t at time zone 'America/Sao_Paulo')::int + 7) % 7, 0), 7))::timestamp at time zone 'America/Sao_Paulo')
   $$`,
  `create or replace function oracoes_listar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from oracoes where now() >= oracao_expira(criado_em);
     return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'texto', o.texto, 'autor', o.autor,
                                                         'criadoEm', o.criado_em, 'expiraEm', oracao_expira(o.criado_em),
                                                         'reacoes', coalesce((select jsonb_agg(r.autor) from oracoes_reacoes r where r.oracao_id = o.id), '[]'::jsonb))
                                       order by o.criado_em desc)
                      from oracoes o), '[]'::jsonb);
   end;
   $$`,
  // Transporte da Iemanjá: cada evento pode ter transportes (descrição + responsável da corrente) com a lista de quem vai,
  // separada pelo cadastro (lista: Corrente, Curimba, turma, Avulsos). pago e pulseira: o admin marca.
  `create table if not exists iemanja_transportes (
     id               uuid primary key default gen_random_uuid(),
     evento_id        uuid not null references iemanja_eventos (id) on delete cascade,
     descricao        text not null check (length(btrim(descricao)) between 1 and 80),
     responsavel_id   uuid references pessoas (id) on delete set null,
     responsavel_nome text not null default '',
     criado_em        timestamptz not null default now()
   )`,
  `create table if not exists iemanja_transporte_pessoas (
     transporte_id uuid not null references iemanja_transportes (id) on delete cascade,
     chave         text not null,
     nome          text not null,
     lista         text not null default 'Corrente',
     pago          boolean not null default false,
     pulseira      boolean not null default false,
     criado_em     timestamptz not null default now(),
     primary key (transporte_id, chave)
   )`,
  `create or replace function iemanja_transportes_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'eventoId', t.evento_id, 'descricao', t.descricao,
       'responsavelId', t.responsavel_id, 'responsavel', coalesce((select pe.nome from pessoas pe where pe.id = t.responsavel_id), nullif(t.responsavel_nome, '')),
       'pessoas', (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nome', x.nome, 'lista', x.lista, 'pago', x.pago, 'pulseira', x.pulseira)
                     order by lower(x.nome)), '[]'::jsonb) from iemanja_transporte_pessoas x where x.transporte_id = t.id)
     ) order by t.criado_em), '[]'::jsonb)
     from iemanja_transportes t
   $$`,
  `create or replace function iemanja_transporte_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if nullif(p ->> 'id', '') is null then
       insert into iemanja_transportes (evento_id, descricao, responsavel_id, responsavel_nome)
       values ((p ->> 'eventoId')::uuid, p ->> 'descricao', nullif(p ->> 'responsavelId', '')::uuid, coalesce(p ->> 'responsavelNome', ''));
     else
       update iemanja_transportes set descricao = p ->> 'descricao', responsavel_id = nullif(p ->> 'responsavelId', '')::uuid,
              responsavel_nome = coalesce(p ->> 'responsavelNome', '')
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Transporte não encontrado.'; end if;
     end if;
     return iemanja_transportes_listar();
   end;
   $$`,
  `create or replace function iemanja_transporte_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from iemanja_transportes where id = (p ->> 'id')::uuid;
     return iemanja_transportes_listar();
   end;
   $$`,
  // p = { transporteId, pessoas: [{ chave, nome, lista }] } — quem já está na lista fica como está.
  `create or replace function iemanja_transporte_incluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into iemanja_transporte_pessoas (transporte_id, chave, nome, lista)
       select (p ->> 'transporteId')::uuid, x ->> 'chave', x ->> 'nome', coalesce(x ->> 'lista', 'Corrente')
       from jsonb_array_elements(coalesce(p -> 'pessoas', '[]'::jsonb)) x
     on conflict (transporte_id, chave) do nothing;
     return iemanja_transportes_listar();
   end;
   $$`,
  // p = { transporteId, chave, remover? | pago? | pulseira? }
  `create or replace function iemanja_transporte_pessoa(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce((p ->> 'remover')::boolean, false) then
       delete from iemanja_transporte_pessoas where transporte_id = (p ->> 'transporteId')::uuid and chave = p ->> 'chave';
     else
       update iemanja_transporte_pessoas set
         pago = case when p ? 'pago' then (p ->> 'pago')::boolean else pago end,
         pulseira = case when p ? 'pulseira' then (p ->> 'pulseira')::boolean else pulseira end
       where transporte_id = (p ->> 'transporteId')::uuid and chave = p ->> 'chave';
     end if;
     if not found then raise exception 'Pessoa não encontrada neste transporte.'; end if;
     return iemanja_transportes_listar();
   end;
   $$`,
  // ================================================== v107: Gestão de Conduta: cancelar o envio e excluir relato
  // p = { id, autor } — com autor: quem abriu cancela o envio, só antes de ser lido; autor vazio: o root exclui qualquer um.
  `create or replace function conduta_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'autor', '') = '' then
       delete from condutas where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Relato não encontrado.'; end if;
     else
       delete from condutas where id = (p ->> 'id')::uuid and autor = p ->> 'autor' and lido_em is null;
       if not found then raise exception 'Este relato já foi lido pela comissão e o envio não pode mais ser cancelado.'; end if;
     end if;
     return condutas_listar();
   end;
   $$`,
  // ================================================== v108: aba Amaci — orixás liberados por turma e orientação por orixá
  // A aba começa escondida (só quem administra vê) até o admin ligar "Visível para todos".
  `insert into sistema (chave, valor) values ('amaci_publicada', 'false') on conflict (chave) do nothing`,
  `create or replace function amaci_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'amaci_publicada'), false))
   $$`,
  // Todos os perfis veem a aba; só o root e o Admin administram. O que o root mudar depois fica.
  `update perfis set abas = abas || jsonb_build_object('amaci', jsonb_build_object('ver', true, 'editar', chave in ('root', 'admin')))
   where not abas ? 'amaci'`,
  // Orixás (chaves de shared/amaci.js) que cada turma de alunos já pode ver. Turma excluída leva junto a linha.
  `create table if not exists amaci_turmas (
     turma_id      uuid primary key references turmas_alunos (id) on delete cascade,
     orixas        jsonb not null default '[]'::jsonb,
     atualizado_em timestamptz not null default now()
   )`,
  // Orientação do admin, uma por orixá (igual para todas as turmas).
  `create table if not exists amaci_orientacoes (
     orixa         text primary key,
     texto         text not null default '',
     atualizado_em timestamptz not null default now()
   )`,
  // Toda turma cadastrada aparece (sem linha em amaci_turmas = nenhum orixá liberado).
  `create or replace function amaci_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('amaci_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return amaci_estado();
   end;
   $$`,
  // p = { turmaId, orixas: [..] } — a lista inteira da turma (o backend já validou as chaves).
  `create or replace function amaci_turma(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from turmas_alunos where id = (p ->> 'turmaId')::uuid) then raise exception 'Turma não encontrada.'; end if;
     insert into amaci_turmas (turma_id, orixas) values ((p ->> 'turmaId')::uuid, coalesce(p -> 'orixas', '[]'::jsonb))
     on conflict (turma_id) do update set orixas = excluded.orixas, atualizado_em = now();
     return amaci_estado();
   end;
   $$`,
  // p = { orixa, texto } — texto vazio apaga.
  `create or replace function amaci_orientacao(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'texto', '') = '' then
       delete from amaci_orientacoes where orixa = p ->> 'orixa';
     else
       insert into amaci_orientacoes (orixa, texto) values (p ->> 'orixa', p ->> 'texto')
       on conflict (orixa) do update set texto = excluded.texto, atualizado_em = now();
     end if;
     return amaci_estado();
   end;
   $$`,

  // ================================================== v109: ASAAS — Pix dos pedidos da aba Compras e aba ASAAS (root)
  // O root liga o Pix na aba ASAAS (começa desligado). Detalhes do fluxo: api/_lib/asaas.js.
  `insert into sistema (chave, valor) values ('asaas_ativo', 'false') on conflict (chave) do nothing`,
  `create or replace function asaas_ativo(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'asaas_ativo'), false))
   $$`,
  `create or replace function asaas_ativar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('asaas_ativo', case when (p ->> 'ativo')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return asaas_ativo();
   end;
   $$`,
  // Cliente do ASAAS de cada pessoa (chave como em guias_linhas). O CPF fica só no ASAAS.
  `create table if not exists asaas_clientes (
     chave       text primary key,
     cliente_id  text not null,
     criado_em   timestamptz not null default now()
   )`,
  // Uma cobrança Pix cobre linhas de um pedido de uma pessoa. 'criando' = linhas reservadas enquanto o ASAAS responde.
  `create table if not exists asaas_cobrancas (
     id          uuid primary key default gen_random_uuid(),
     chave       text not null,
     nome        text not null,
     pedido      int not null,
     valor       numeric(10, 2) not null check (valor > 0),
     status      text not null default 'criando' check (status in ('criando', 'pendente', 'paga', 'vencida', 'cancelada', 'estornada')),
     asaas_id    text unique,
     link        text,
     pix_payload text,
     pix_imagem  text,
     vencimento  date,
     criado_em   timestamptz not null default now(),
     pago_em     timestamptz
   )`,
  `create index if not exists asaas_cobrancas_chave on asaas_cobrancas (chave, criado_em desc)`,
  `alter table guias_linhas add column if not exists cobranca_id uuid references asaas_cobrancas(id) on delete set null`,
  `alter table guias_linhas add column if not exists pago_em timestamptz`,
  // Eventos recebidos do ASAAS, como vieram; o id do evento é a chave (o ASAAS reenvia até receber 200).
  `create table if not exists asaas_eventos (
     id           text primary key,
     evento       text not null,
     dados        jsonb not null,
     recebido_em  timestamptz not null default now()
   )`,
  `alter table asaas_eventos add column if not exists cobranca_id uuid`,
  `alter table asaas_eventos add column if not exists resultado text`,
  `create index if not exists asaas_eventos_recebido on asaas_eventos (recebido_em desc)`,
  // Cancelar: não cancela linha paga nem com Pix pendente (substitui a da v103).
  `create or replace function guia_linha_cancelar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v guias_linhas%rowtype;
   begin
     select * into v from guias_linhas where id = (p ->> 'id')::uuid for update;
     if not found then raise exception 'Pedido não encontrado.'; end if;
     if v.pago_em is not null then raise exception 'Este pedido já foi pago pelo Pix. Faça o estorno no ASAAS antes de cancelar.'; end if;
     if exists (select 1 from asaas_cobrancas where id = v.cobranca_id and status in ('criando', 'pendente')) then
       raise exception 'Este pedido tem um Pix pendente. Cancele a cobrança na aba ASAAS antes.';
     end if;
     delete from guias_linhas where id = v.id;
     if v.item_id is not null then update guias_itens set quantidade = quantidade + v.quantidade where id = v.item_id; end if;
     return guias_estado();
   end;
   $$`,
  // O ASAAS recusou: apaga a reserva (as linhas voltam a ficar livres pelo on delete set null).
  `create or replace function asaas_cobranca_desfazer(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from asaas_cobrancas where id = (p ->> 'id')::uuid and status = 'criando';
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // ================================================== v110: Pedir já gera o link de pagamento (ASAAS)
  // ================================================== v111: a linha do pedido guarda "Grupo · Item"
  // ================================================== v112: CPF no Perfil
  // Fica fora do perfil (jsonb), numa tabela só dele, e cifrado pelo backend (api/_lib/cpf.js):
  // não vai nas listas de perfis, no backup nem para quem administra o Perfil. O banco nunca vê o número.
  `create table if not exists pessoas_cpf (
     pessoa_id      uuid primary key references pessoas(id) on delete cascade,
     cifrado        text not null,
     atualizado_em  timestamptz not null default now(),
     atualizado_por text not null default ''
   )`,
  `create or replace function cpf_ler(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('cifrado', c.cifrado, 'atualizadoEm', c.atualizado_em)
       from pessoas_cpf c where c.pessoa_id = (p ->> 'pessoaId')::uuid
   $$`,
  // Excluir a pessoa (saida preenchida) apaga o CPF junto com o perfil, a foto e a senha.
  `create or replace function pessoas_cpf_saida()
   returns trigger language plpgsql as $$
   begin
     if new.saida is not null and old.saida is null then delete from pessoas_cpf where pessoa_id = new.id; end if;
     return new;
   end;
   $$`,
  `drop trigger if exists pessoas_cpf_saida on pessoas`,
  `create trigger pessoas_cpf_saida after update of saida on pessoas
   for each row execute function pessoas_cpf_saida()`,
  // ================================================== v113: item de Compras exclusivo da corrente (CPJ)
  // cpj = só quem está cadastrado na corrente vê e pede o item (quem filtra é api/_lib/guias.js). Nasce desligado.
  `alter table guias_itens add column if not exists cpj boolean not null default false`,
  // ================================================== v114: pagamentos em atraso da conta B do ASAAS (aba Geral)
  // Última leitura das cobranças vencidas da conta B (api/_lib/atrasos.js), trocada inteira a cada leitura.
  // pessoa_id vem do CPF do Perfil (null = cliente do ASAAS que não bate com ninguém da corrente).
  `create table if not exists asaas2_atrasos (
     id          text primary key,
     pessoa_id   uuid references pessoas(id) on delete set null,
     nome        text not null default '',
     telefone    text not null default '',
     valor       numeric(10, 2) not null default 0,
     vencimento  date,
     descricao   text not null default '',
     link        text not null default ''
   )`,
  // Os CPFs cifrados de quem está na corrente: o backend decifra para ligar cobrança e pessoa.
  `create or replace function cpf_todos(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('pessoaId', c.pessoa_id, 'cifrado', c.cifrado)), '[]'::jsonb)
       from pessoas_cpf c join pessoas pe on pe.id = c.pessoa_id where pe.saida is null
   $$`,
  // ================================================== v115: funções dos atrasos sem número no nome
  // db.rpc só aceita nomes com letras e _: as da v114 (asaas2_atrasos_*) nunca podiam ser chamadas; agora são atrasos_*.
  `drop function if exists asaas2_atrasos_salvar(jsonb)`,
  `drop function if exists asaas2_atrasos_ler(jsonb)`,

  // ================================================== v116: tipos de evento cadastrados pelo root, com as turmas de alunos que veem
  // A corrente vê todos os tipos. Alunos: gira e evento, todos; os outros tipos, só as turmas marcadas no tipo.
  `create table if not exists eventos_tipos (
     chave      text primary key,
     nome       text not null check (length(btrim(nome)) between 1 and 40),
     turmas     uuid[] not null default '{}',
     criado_em  timestamptz not null default now()
   )`,
  `create unique index if not exists eventos_tipos_nome_unico on eventos_tipos (lower(btrim(nome)))`,
  `insert into eventos_tipos (chave, nome) values ('gira', 'Gira'), ('amaci', 'Amaci'), ('aviso', 'Aviso'), ('evento', 'Evento') on conflict do nothing`,
  `alter table eventos drop constraint if exists eventos_tipo_check`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'eventos_tipo_fk') then
       alter table eventos add constraint eventos_tipo_fk foreign key (tipo) references eventos_tipos (chave);
     end if;
   end $$`,
  // Renomear um tipo muda o selo que a corrente vê: sobe a versão dos dados.
  `drop trigger if exists versao_dados on eventos_tipos`,
  `create trigger versao_dados after insert or update or delete on eventos_tipos for each row execute function versao_dados_subir()`,
  // p = { aluno?: true, turmaId? } — com aluno, só os tipos que a turma vê.
  `create or replace function eventos_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'data', e.data, 'nome', e.nome, 'tipo', e.tipo, 'tipoNome', t.nome)
                     order by e.data, lower(e.nome)), '[]'::jsonb)
       from eventos e join eventos_tipos t on t.chave = e.tipo
      where not coalesce((p ->> 'aluno')::boolean, false)
         or e.tipo in ('gira', 'evento')
         or nullif(p ->> 'turmaId', '')::uuid = any(t.turmas)
   $$`,
  // Para o root: os tipos (os quatro de sempre primeiro), as turmas de alunos e os eventos (o selo muda ao renomear).
  `create or replace function eventos_tipos_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'tipos', coalesce((select jsonb_agg(jsonb_build_object('chave', t.chave, 'nome', t.nome,
           'turmas', coalesce((select jsonb_agg(ta.id order by lower(ta.nome)) from turmas_alunos ta where ta.id = any(t.turmas)), '[]'::jsonb))
           order by array_position(array['gira', 'amaci', 'aviso', 'evento'], t.chave) nulls last, lower(t.nome))
         from eventos_tipos t), '[]'::jsonb),
       'turmas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by lower(nome)) from turmas_alunos), '[]'::jsonb),
       'eventos', eventos_listar())
   $$`,
  // p = { chave?, nome, turmas: [id..] } — sem chave cria. Turma que não existe é ignorada.
  `create or replace function evento_tipo_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_turmas uuid[] := array(select ta.id from turmas_alunos ta
                               where ta.id::text in (select jsonb_array_elements_text(coalesce(p -> 'turmas', '[]'::jsonb))));
   begin
     if coalesce(p ->> 'chave', '') = '' then
       insert into eventos_tipos (chave, nome, turmas)
       values ('t' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), btrim(p ->> 'nome'), v_turmas);
     else
       update eventos_tipos set nome = btrim(p ->> 'nome'), turmas = v_turmas where chave = p ->> 'chave';
       if not found then raise exception 'Tipo não encontrado.'; end if;
     end if;
     return eventos_tipos_estado();
   exception when unique_violation then
     raise exception 'Esse tipo já existe.';
   end;
   $$`,

  // ================================================== v117: excluir tipo de evento
  // Os quatro de sempre ficam (o app usa as chaves); tipo com eventos só sai depois de os eventos mudarem de tipo.
  `create or replace function evento_tipo_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_qtd int;
   begin
     if p ->> 'chave' in ('gira', 'amaci', 'aviso', 'evento') then raise exception 'Este tipo não pode ser excluído.'; end if;
     select count(*) into v_qtd from eventos where tipo = p ->> 'chave';
     if v_qtd > 0 then
       raise exception '% com este tipo: mude o tipo deles antes de excluir.', case when v_qtd = 1 then 'Há 1 evento' else 'Há ' || v_qtd || ' eventos' end;
     end if;
     delete from eventos_tipos where chave = p ->> 'chave';
     if not found then raise exception 'Tipo não encontrado.'; end if;
     return eventos_tipos_estado();
   end;
   $$`,

  // ================================================== v118: link do ASAAS sem repetir quando ele demora

  // ================================================== v119: Compras com pedido próprio por grupo
  // Cada grupo tem o seu pedido aberto, com Encerrar e Novo pedido próprios. O número continua único (Guias nº 8, Velas nº 9).
  // guias_pedido_grupos diz quais grupos cada pedido atende e se o grupo já encerrou nele; o pedido encerra quando
  // todos os grupos dele encerram. O pedido que estava aberto na troca atende todos os grupos (nenhum número muda).
  `alter table guias_linhas add column if not exists grupo_id uuid references guias_grupos(id) on delete set null`,
  `update guias_linhas l set grupo_id = i.grupo_id from guias_itens i where i.id = l.item_id and l.grupo_id is null`,
  // Linha cujo item saiu: o grupo pelo começo da descrição ("Grupo · Item").
  `update guias_linhas l set grupo_id = g.id from guias_grupos g where l.grupo_id is null and l.descricao like g.descricao || ' · %'`,
  `create table if not exists guias_pedido_grupos (
     pedido        int not null references guias_pedidos(numero) on delete cascade,
     grupo_id      uuid not null references guias_grupos(id) on delete cascade,
     criado_em     timestamptz not null default now(),
     encerrado_em  timestamptz,
     primary key (pedido, grupo_id)
   )`,
  `create index if not exists guias_pedido_grupos_grupo on guias_pedido_grupos (grupo_id) where encerrado_em is null`,
  // Uma vez só: os pedidos antigos ficam com os grupos que tiveram linhas; o aberto, com todos os grupos.
  `do $$ begin
     if not exists (select 1 from sistema where chave = 'v119_pedidos_por_grupo') then
       insert into guias_pedido_grupos (pedido, grupo_id, criado_em, encerrado_em)
       select distinct l.pedido, l.grupo_id, pe.criado_em, pe.encerrado_em
         from guias_linhas l join guias_pedidos pe on pe.numero = l.pedido where l.grupo_id is not null
       on conflict do nothing;
       insert into guias_pedido_grupos (pedido, grupo_id, criado_em)
       select pe.numero, g.id, pe.criado_em from guias_pedidos pe cross join guias_grupos g where pe.encerrado_em is null
       on conflict do nothing;
       insert into sistema (chave, valor) values ('v119_pedidos_por_grupo', now()::text);
     end if;
   end $$`,
  // O pedido aberto de um grupo (ou null).
  `create or replace function guia_pedido_do_grupo(p_grupo uuid)
   returns int language sql stable as $$
     select pedido from guias_pedido_grupos where grupo_id = p_grupo and encerrado_em is null order by pedido desc limit 1
   $$`,
  // Abre um pedido para o grupo: aproveita o pedido aberto que ainda não atende nenhum grupo (o nº 1 da instalação),
  // senão cria o próximo número.
  `create or replace function guia_pedido_abrir(p_grupo uuid)
   returns int language plpgsql as $$
   declare v int;
   begin
     select numero into v from guias_pedidos pe
      where pe.encerrado_em is null and not exists (select 1 from guias_pedido_grupos pg where pg.pedido = pe.numero)
        and not exists (select 1 from guias_linhas l where l.pedido = pe.numero)
      order by numero limit 1;
     if v is null then
       insert into guias_pedidos (numero) select coalesce(max(numero), 0) + 1 from guias_pedidos returning numero into v;
     end if;
     insert into guias_pedido_grupos (pedido, grupo_id) values (v, p_grupo);
     return v;
   end;
   $$`,
  // Pedir: entra no pedido aberto do grupo do item. Devolve também o número do pedido (para gerar o Pix dele).
  // p = { grupoId } — encerra o pedido aberto do grupo; o pedido encerra quando não sobra grupo aberto nele.
  `create or replace function guia_pedido_encerrar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   declare v int;
   begin
     update guias_pedido_grupos set encerrado_em = now()
      where grupo_id = (p ->> 'grupoId')::uuid and encerrado_em is null returning pedido into v;
     if v is null then raise exception 'Não há pedido aberto neste grupo.'; end if;
     update guias_pedidos set encerrado_em = now()
      where numero = v and encerrado_em is null and not exists (select 1 from guias_pedido_grupos where pedido = v and encerrado_em is null);
     return guias_estado();
   end;
   $$`,
  // p = { grupoId } — abre o próximo pedido do grupo (o anterior tem de estar encerrado).
  `create or replace function guia_pedido_novo(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   declare v int;
   begin
     if not exists (select 1 from guias_grupos where id = (p ->> 'grupoId')::uuid) then raise exception 'Grupo não encontrado.'; end if;
     v := guia_pedido_do_grupo((p ->> 'grupoId')::uuid);
     if v is not null then raise exception 'O pedido nº % deste grupo ainda está aberto. Encerre antes de começar outro.', v; end if;
     perform guia_pedido_abrir((p ->> 'grupoId')::uuid);
     return guias_estado();
   end;
   $$`,
  // Grupo novo já nasce com o seu pedido aberto.
  `create or replace function guia_grupo_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := nullif(p ->> 'id', '')::uuid;
   begin
     if v_id is null then
       insert into guias_grupos (descricao, visivel) values (p ->> 'descricao', coalesce((p ->> 'visivel')::boolean, true)) returning id into v_id;
       perform guia_pedido_abrir(v_id);
     else
       update guias_grupos set
         descricao = case when p ? 'descricao' then p ->> 'descricao' else descricao end,
         visivel = case when p ? 'visivel' then (p ->> 'visivel')::boolean else visivel end
       where id = v_id;
       if not found then raise exception 'Grupo não encontrado.'; end if;
     end if;
     return guias_estado();
   end;
   $$`,
  // Excluir o grupo: as linhas ficam (sem grupo) e o pedido que ficou sem grupo aberto encerra.
  `create or replace function guia_grupo_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from guias_grupos where id = (p ->> 'id')::uuid;
     update guias_pedidos pe set encerrado_em = now()
      where pe.encerrado_em is null
        and exists (select 1 from guias_linhas l where l.pedido = pe.numero)
        and not exists (select 1 from guias_pedido_grupos pg where pg.pedido = pe.numero and pg.encerrado_em is null);
     return guias_estado();
   end;
   $$`,
  // Aba ASAAS: o grupo de cada cobrança (pelas linhas) e, no retorno do webhook, o que foi comprado
  // (itens da cobrança) e a descrição que o ASAAS mandou, para saber do que se trata.

  // ================================================== v120: pagamentos atrasados também da conta A (Compras)
  // O mesmo bloco lê as vencidas das duas contas. Na conta A, a cobrança feita pelo app (referência = id da cobrança)
  // só conta enquanto ainda tem item por pagar ligado a ela: link vencido que a pessoa já trocou por outro, ou de
  // item cancelado ou pago, continua OVERDUE no ASAAS mas não é dívida.
  `alter table asaas2_atrasos add column if not exists conta text not null default 'B'`,
  `alter table asaas2_atrasos add column if not exists referencia text not null default ''`,
  `alter table asaas2_atrasos drop constraint if exists asaas2_atrasos_pkey`,
  `do $$ begin
     if not exists (select 1 from pg_constraint where conname = 'asaas2_atrasos_conta_id') then
       alter table asaas2_atrasos add constraint asaas2_atrasos_conta_id primary key (conta, id);
     end if;
   end $$`,

  // ================================================== v121: aba ASAAS nos perfis e o perfil "Admin financeiro"
  // A aba ASAAS passa a ser marcada por perfil (Ver / Editar). O Admin financeiro vem só com Ver; perfis que já existem
  // ficam sem a aba (o root marca na aba Admin root). Se o root já criou um perfil com esse nome, fica o dele.
  ...PERFIS_PADRAO.filter((p) => p.chave === 'admin_financeiro').map((p) => `insert into perfis (chave, nome, abas, ordem)
     values ('${p.chave}', '${p.nome}', '${JSON.stringify(p.abas)}'::jsonb, ${p.ordem}) on conflict do nothing`),

  // ================================================== v122: aba Compras mais leve
  // A foto do item sai da resposta (ia inteira, em base64, a cada abertura e a cada ação): vai só a versão (fotoV),
  // e a imagem vem por um link próprio, guardado em cache pelo celular (guia_foto). A abertura da aba lê tudo numa
  // ida só ao banco (guias_tela), e o Pix da pessoa também (asaas_pessoa).
  `create or replace function guia_foto(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(foto) from guias_itens where id = (p ->> 'id')::uuid and foto is not null
   $$`,
  // p = { chave } — o Pix da pessoa: se está ligado, o cliente no ASAAS e as cobranças.
  `create or replace function asaas_pessoa(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('ativo', asaas_ativo(), 'minhas', asaas_minhas(p))
   $$`,

  // ================================================== v123: dados dos alunos (CPF, nome completo, e-mail, celular) e pendências
  // Nome completo, celular e e-mail ficam no perfil do aluno (info.nome / info.celular / info.email, os mesmos que ele
  // preenche no Perfil); o CPF fica cifrado em alunos_cpf, como o da corrente, com um hash (HMAC da CPF_CHAVE) para
  // ligar o aluno às cobranças vencidas do ASAAS sem decifrar: o atraso guarda o hash do CPF do cliente.
  `create table if not exists alunos_cpf (
     aluno_id       uuid primary key references alunos (id) on delete cascade,
     cifrado        text not null,
     hash           text not null,
     atualizado_em  timestamptz not null default now(),
     por            text not null default ''
   )`,
  `create index if not exists alunos_cpf_hash on alunos_cpf (hash)`,
  `alter table asaas2_atrasos add column if not exists cpf_hash text not null default ''`,
  `alter table asaas2_atrasos add column if not exists aluno_id uuid references alunos (id) on delete set null`,
  // p = { id, nomeCompleto?, celular?, email? } — só muda o que vier.
  `create or replace function aluno_dados_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set
       perfil = coalesce(perfil, '{}'::jsonb) || jsonb_build_object('info', coalesce(perfil -> 'info', '{}'::jsonb)
                 || case when p ? 'nomeCompleto' then jsonb_build_object('nome', p ->> 'nomeCompleto') else '{}'::jsonb end
                 || case when p ? 'celular' then jsonb_build_object('celular', p ->> 'celular') else '{}'::jsonb end
                 || case when p ? 'email' then jsonb_build_object('email', p ->> 'email') else '{}'::jsonb end)
     where id = (p ->> 'id')::uuid and saida is null;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // p = { id, cifrado, hash, por } — cifrado '' apaga.
  `create or replace function aluno_cpf_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'cifrado', '') = '' then
       delete from alunos_cpf where aluno_id = (p ->> 'id')::uuid;
     else
       insert into alunos_cpf (aluno_id, cifrado, hash, por) values ((p ->> 'id')::uuid, p ->> 'cifrado', p ->> 'hash', coalesce(p ->> 'por', ''))
       on conflict (aluno_id) do update set cifrado = excluded.cifrado, hash = excluded.hash, por = excluded.por, atualizado_em = now();
     end if;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  `create or replace function aluno_cpf_ler(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(cifrado) from alunos_cpf where aluno_id = (p ->> 'id')::uuid
   $$`,
  `create or replace function atrasos_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_conta text := coalesce(nullif(p ->> 'conta', ''), 'B');
   begin
     delete from asaas2_atrasos where conta = v_conta;
     insert into asaas2_atrasos (conta, id, pessoa_id, aluno_id, nome, telefone, valor, vencimento, descricao, link, referencia, cpf_hash)
     select v_conta, x ->> 'id', nullif(x ->> 'pessoaId', '')::uuid,
            (select al.id from alunos al where al.id::text = nullif(x ->> 'alunoId', '')),
            coalesce(x ->> 'nome', ''), coalesce(x ->> 'telefone', ''),
            coalesce((x ->> 'valor')::numeric, 0), nullif(x ->> 'vencimento', '')::date, coalesce(x ->> 'descricao', ''), coalesce(x ->> 'link', ''),
            coalesce(x ->> 'referencia', ''), coalesce(x ->> 'cpfHash', '')
       from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) x
     on conflict (conta, id) do nothing;
     insert into sistema (chave, valor) values ('asaas2_atualizado', now()::text)
     on conflict (chave) do update set valor = excluded.valor;
     return jsonb_build_object('ok', true);
   end;
   $$`,

  // ================================================== v124: login por e-mail ou celular, 3 tentativas e autocadastro como aluno
  // Celular comparado por DDD + 8 últimos números (com ou sem o 9 da frente), como no Criar senha.
  `create or replace function celular_chave(t text)
   returns text language sql immutable as $$
     select case when length(d) between 10 and 11 then left(d, 2) || right(d, 8) else '' end
       from (select regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g') as d) x
   $$`,
  // 3 senhas erradas seguidas (num intervalo de 15 minutos) bloqueiam por 15 minutos. Devolve quantas restam.
  `alter table login_falhas add column if not exists ultima_em timestamptz`,
  `create or replace function login_falha(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_email text := lower(btrim(p ->> 'email')); v_t int;
   begin
     insert into login_falhas (email, tentativas, ultima_em) values (v_email, 1, now())
     on conflict (email) do update set
       tentativas = case when login_falhas.ultima_em is null or login_falhas.ultima_em < now() - interval '15 minutes' then 1
                         else login_falhas.tentativas + 1 end,
       ultima_em = now()
     returning tentativas into v_t;
     if v_t >= 3 then
       update login_falhas set tentativas = 0, bloqueado_ate = now() + interval '15 minutes' where email = v_email;
       return jsonb_build_object('restantes', 0);
     end if;
     return jsonb_build_object('restantes', 3 - v_t);
   end;
   $$`,
  // Cadastro feito pela própria pessoa na tela de login: entra como aluno sem turma (o admin depois põe no lugar certo).
  `alter table alunos add column if not exists autocadastro_em timestamptz`,

  // ================================================== v125: ex-alunos (excluir guarda o cadastro; apagar de vez é um segundo passo)
  // Excluir o aluno leva para Ex-alunos: sai das listas, do login e das próximas oferendas, mas perfil, foto, senha e
  // CPF ficam guardados (pode voltar). Excluir dos Ex-alunos apaga os dados na hora (apagado_em) e o registro some de vez
  // quando nada aberto depende dele (apagar_excluidos); o que foi encerrado continua pelo retrato.
  `alter table alunos add column if not exists apagado_em timestamptz`,
  `create or replace function aluno_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
   begin
     update alunos set saida = v_hoje, pin_versao = pin_versao + 1
     where id = v_id and saida is null;
     update oferenda_alunos oa set excluido = true from oferendas o
     where oa.aluno_id = v_id and o.id = oa.oferenda_id and o.status <> 'encerrado' and o.data >= v_hoje;
     return alunos_estado();
   end;
   $$`,
  // Ex-aluno volta para os alunos com tudo o que tinha (a turma de antes, se ainda existir).
  `create or replace function aluno_reativar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set saida = null where id = (p ->> 'id')::uuid and saida is not null and apagado_em is null;
     if not found then raise exception 'Ex-aluno não encontrado.'; end if;
     return alunos_estado();
   end;
   $$`,
  // Apagar de vez (só ex-aluno): perfil, foto, senha e CPF somem na hora; o nome é trocado para liberar o original
  // (é único) e o registro sai quando nada aberto depender dele.
  `create or replace function aluno_apagar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'id')::uuid;
   begin
     update alunos set apagado_em = now(), perfil = '{}'::jsonb, foto = null, pin_hash = null, pin_versao = pin_versao + 1,
                       nome = left(nome, 50) || ' (apagado ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YY HH24:MI:SS') || ')'
     where id = v_id and saida is not null and apagado_em is null;
     if not found then raise exception 'Só dá para apagar de vez quem está em Ex-alunos.'; end if;
     delete from alunos_cpf where aluno_id = v_id;
     update asaas2_atrasos set aluno_id = null where aluno_id = v_id;
     delete from login_falhas where email = 'pina:' || v_id::text;
     perform apagar_excluidos();
     return alunos_estado();
   end;
   $$`,
  // Igual à anterior, mas o aluno só é apagado depois de "apagar de vez" (o ex-aluno fica guardado).
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
     where a.saida is not null and a.apagado_em is not null
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
  // Cadastrar de novo o nome de um ex-aluno o traz de volta (com o que tinha); quem foi apagado de vez não volta.
  `create or replace function alunos_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_n int; v_volta int;
   begin
     update alunos set saida = null, turma_id = nullif(p ->> 'turmaId', '')::uuid
     where saida is not null and apagado_em is null
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
  // Autocadastro: o ex-aluno guarda dados e senha, então não volta por aqui (qualquer um poderia digitar o nome dele);
  // nome, e-mail, celular ou CPF de ex-aluno mandam falar com a administração, que traz de volta.
  `create or replace function aluno_autocadastro(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_nome text := btrim(p ->> 'nome');
     v_email text := lower(btrim(coalesce(p ->> 'email', '')));
     v_cel text := celular_chave(p ->> 'celular');
     v_id uuid; v_versao int;
     v_perfil jsonb := jsonb_build_object('info', jsonb_build_object('nome', btrim(p ->> 'nome'), 'celular', p ->> 'celular', 'email', v_email));
   begin
     if (select count(*) from alunos where autocadastro_em > now() - interval '1 hour') >= 20 then
       raise exception 'Muitos cadastros na última hora. Tente de novo mais tarde.';
     end if;
     if exists (select 1 from alunos where lower(btrim(nome)) = lower(v_nome) and saida is null) then
       raise exception 'Já existe um aluno com esse nome. Se for você, entre com o seu e-mail ou celular; senão, coloque o sobrenome.';
     end if;
     if exists (select 1 from alunos where lower(btrim(nome)) = lower(v_nome) and apagado_em is null)
        or (v_email <> '' and exists (select 1 from alunos where saida is not null and apagado_em is null
                                      and lower(btrim(perfil -> 'info' ->> 'email')) = v_email))
        or (v_cel <> '' and exists (select 1 from alunos where saida is not null and apagado_em is null
                                    and celular_chave(perfil -> 'info' ->> 'celular') = v_cel))
        or (coalesce(p ->> 'cpfHash', '') <> '' and exists (select 1 from alunos_cpf c join alunos a on a.id = c.aluno_id
                                                           where a.saida is not null and a.apagado_em is null and c.hash = p ->> 'cpfHash')) then
       raise exception 'Você já tem cadastro como ex-aluno. Fale com a administração para voltar.';
     end if;
     if v_email <> '' and (exists (select 1 from usuarios where email = v_email)
        or exists (select 1 from pessoas where saida is null and lower(btrim(perfil -> 'info' ->> 'email')) = v_email)
        or exists (select 1 from alunos where saida is null and lower(btrim(perfil -> 'info' ->> 'email')) = v_email)) then
       raise exception 'Já existe um cadastro com esse e-mail. Entre com ele ou fale com a administração.';
     end if;
     if v_cel <> '' and (exists (select 1 from pessoas where saida is null and celular_chave(perfil -> 'info' ->> 'celular') = v_cel)
        or exists (select 1 from alunos where saida is null and celular_chave(perfil -> 'info' ->> 'celular') = v_cel)) then
       raise exception 'Já existe um cadastro com esse celular. Entre com ele ou fale com a administração.';
     end if;
     if coalesce(p ->> 'cpfHash', '') <> '' and exists (select 1 from alunos_cpf c join alunos a on a.id = c.aluno_id and a.saida is null
                                                       where c.hash = p ->> 'cpfHash') then
       raise exception 'Já existe um cadastro com esse CPF. Fale com a administração.';
     end if;
     insert into alunos (id, nome, perfil, pin_hash, pin_versao, autocadastro_em)
     values ((p ->> 'id')::uuid, v_nome, v_perfil, p ->> 'pinHash', 1, now())
     returning id, pin_versao into v_id, v_versao;
     return jsonb_build_object('id', v_id, 'nome', v_nome, 'pinVersao', v_versao);
   exception when unique_violation then
     raise exception 'Já existe um cadastro com esse nome. Coloque o sobrenome ou fale com a administração.';
   end;
   $$`,
  // Para quem edita Alunos: também a lista de ex-alunos (nome, turma de antes e data em que saiu).
  `create or replace function alunos_extras(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'dados', coalesce((select jsonb_agg(jsonb_build_object('id', al.id, 'nomeCompleto', coalesce(al.perfil -> 'info' ->> 'nome', ''),
                   'celular', coalesce(al.perfil -> 'info' ->> 'celular', ''), 'email', coalesce(al.perfil -> 'info' ->> 'email', ''), 'cifrado', c.cifrado))
                 from alunos al left join alunos_cpf c on c.aluno_id = al.id where al.saida is null), '[]'::jsonb),
       'pendencias', coalesce((select jsonb_agg(jsonb_build_object('alunoId', x.aluno_id, 'itens', x.itens))
                 from (select a.aluno_id, jsonb_agg(jsonb_build_object('conta', a.conta, 'valor', a.valor::float8, 'vencimento', a.vencimento,
                         'descricao', a.descricao, 'link', a.link) order by a.vencimento nulls last) as itens
                         from atrasos_validos() a join alunos al on al.id = a.aluno_id and al.saida is null
                        where a.pessoa_id is null group by a.aluno_id) x), '[]'::jsonb),
       'exAlunos', coalesce((select jsonb_agg(jsonb_build_object('id', al.id, 'nome', al.nome, 'turmaId', al.turma_id, 'saida', al.saida,
                   'nomeCompleto', coalesce(al.perfil -> 'info' ->> 'nome', '')) order by lower(al.nome))
                 from alunos al where al.saida is not null and al.apagado_em is null), '[]'::jsonb),
       'atualizadoEm', (select to_char(valor::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from sistema where chave = 'asaas2_atualizado'))
   $$`,
  // ================================================== v126: UP CPJ leva o CPF; limite de consultas por IP no login e no Criar cadastro
  // O CPF do aluno é cifrado com o id do aluno; na corrente, com o id da pessoa. O backend decifra antes, gera o id da
  // pessoa e manda o CPF já cifrado para ela (p.pessoaId, p.cpfCifrado): tudo numa transação só, sem perder o CPF.
  `create or replace function aluno_transferir_cambone(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid := (p ->> 'id')::uuid;
     v_aluno alunos%rowtype;
     v_pessoa_id uuid := coalesce(nullif(p ->> 'pessoaId', '')::uuid, gen_random_uuid());
   begin
     select * into v_aluno from alunos where id = v_id and saida is null for update;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     if exists (select 1 from pessoas where lower(btrim(nome)) = lower(btrim(v_aluno.nome))) then
       raise exception 'Já existe uma pessoa da corrente com esse nome.';
     end if;

     insert into pessoas (id, nome, funcao, perfil, pin_hash, pin_versao, entrada)
       values (v_pessoa_id, v_aluno.nome, 'cambone', v_aluno.perfil, v_aluno.pin_hash, v_aluno.pin_versao, (now() at time zone 'America/Sao_Paulo')::date);
     if v_aluno.foto is not null then
       insert into pessoas_fotos (pessoa_id, foto) values (v_pessoa_id, v_aluno.foto);
     end if;
     if coalesce(p ->> 'cpfCifrado', '') <> '' then
       insert into pessoas_cpf (pessoa_id, cifrado, atualizado_em, atualizado_por) values (v_pessoa_id, p ->> 'cpfCifrado', now(), 'UP CPJ');
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
  // Limite de consultas sem login (Criar cadastro, e-mail/celular que não existe no login), por IP (guardado só o hash).
  // p = { chave, max, minutos }: conta mais uma; a janela começa na primeira consulta. Devolve { ok, restantes }.
  `create table if not exists consultas_limite (
     chave      text primary key,
     total      integer not null default 0,
     desde      timestamptz not null default now()
   )`,
  `create or replace function consulta_contar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_total int; v_max int := coalesce((p ->> 'max')::int, 10);
   begin
     delete from consultas_limite where desde < now() - interval '1 day';
     insert into consultas_limite (chave, total, desde) values (p ->> 'chave', 1, now())
     on conflict (chave) do update set
       total = case when consultas_limite.desde < now() - make_interval(mins => coalesce((p ->> 'minutos')::int, 60)) then 1
                    else consultas_limite.total + 1 end,
       desde = case when consultas_limite.desde < now() - make_interval(mins => coalesce((p ->> 'minutos')::int, 60)) then now()
                    else consultas_limite.desde end
     returning total into v_total;
     return jsonb_build_object('ok', v_total <= v_max, 'restantes', greatest(v_max - v_total, 0));
   end;
   $$`,
  // ================================================== v127: celular único; criar senha pelo login com e-mail ou celular
  // Para criar a senha sem estar logado: o e-mail confirma quem entrou pelo celular, e o celular quem entrou pelo e-mail.
  `create or replace function login_candidatos(p jsonb)
   returns jsonb language sql stable as $$
     with k as (select lower(btrim(coalesce(p ->> 'email', ''))) as email, coalesce(p ->> 'celular', '') as cel),
     c as (
       select 1 as ordem, 'usuario' as tipo, u.id, u.nome, u.senha_hash as hash, 0 as versao, u.email as chave,
              '' as cel_cad, u.email as email_cad
         from usuarios u, k where k.email <> '' and u.email = k.email
       union all
       select 2, 'corrente', pe.id, pe.nome, pe.pin_hash, pe.pin_versao, 'pin:' || pe.id::text,
              celular_chave(pe.perfil -> 'info' ->> 'celular'), lower(btrim(coalesce(pe.perfil -> 'info' ->> 'email', '')))
         from pessoas pe, k where pe.saida is null
          and ((k.email <> '' and lower(btrim(pe.perfil -> 'info' ->> 'email')) = k.email)
            or (k.cel <> '' and celular_chave(pe.perfil -> 'info' ->> 'celular') = k.cel))
       union all
       select 3, 'aluno', al.id, al.nome, al.pin_hash, al.pin_versao, 'pina:' || al.id::text,
              celular_chave(al.perfil -> 'info' ->> 'celular'), lower(btrim(coalesce(al.perfil -> 'info' ->> 'email', '')))
         from alunos al, k where al.saida is null
          and ((k.email <> '' and lower(btrim(al.perfil -> 'info' ->> 'email')) = k.email)
            or (k.cel <> '' and celular_chave(al.perfil -> 'info' ->> 'celular') = k.cel))
     )
     select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'id', c.id, 'nome', c.nome, 'hash', c.hash, 'versao', c.versao,
              'chave', c.chave, 'celular', c.cel_cad, 'email', c.email_cad,
              'bloqueado', exists (select 1 from login_falhas f where f.email = c.chave and f.bloqueado_ate > now()))
              order by c.ordem, lower(c.nome)), '[]'::jsonb)
       from c
   $$`,
  // Cada celular só pode estar em um cadastro: pessoa ativa da corrente, aluno ou ex-aluno (o ex-aluno guarda o cadastro).
  // Só confere quando o celular muda ou o cadastro volta a valer; repetidos de antes desta regra não travam outras edições.
  // A mesma pessoa no UP CPJ (mesmo nome nas duas tabelas, na transferência) não conta como repetida.
  `create or replace function celular_em_uso(v_cel text, v_pessoa uuid, v_aluno uuid, v_nome text)
   returns boolean language sql stable as $$
     select exists (select 1 from pessoas pe where pe.saida is null and celular_chave(pe.perfil -> 'info' ->> 'celular') = v_cel
                     and pe.id is distinct from v_pessoa and not (v_aluno is not null and lower(btrim(pe.nome)) = lower(btrim(v_nome))))
         or exists (select 1 from alunos al where al.apagado_em is null and celular_chave(al.perfil -> 'info' ->> 'celular') = v_cel
                     and al.id is distinct from v_aluno and not (v_pessoa is not null and lower(btrim(al.nome)) = lower(btrim(v_nome))))
   $$`,
  `create or replace function pessoas_celular_unico()
   returns trigger language plpgsql as $$
   declare v_cel text := celular_chave(new.perfil -> 'info' ->> 'celular');
   begin
     if v_cel = '' or new.saida is not null then return new; end if;
     if tg_op = 'UPDATE' and old.saida is null and celular_chave(old.perfil -> 'info' ->> 'celular') = v_cel then return new; end if;
     if celular_em_uso(v_cel, new.id, null, new.nome) then
       raise exception 'Este celular já está em outro cadastro. Cada celular só pode ter um cadastro.';
     end if;
     return new;
   end;
   $$`,
  `drop trigger if exists pessoas_celular_unico on pessoas`,
  `create trigger pessoas_celular_unico before insert or update of perfil, saida on pessoas
   for each row execute function pessoas_celular_unico()`,
  `create or replace function alunos_celular_unico()
   returns trigger language plpgsql as $$
   declare v_cel text := celular_chave(new.perfil -> 'info' ->> 'celular');
   begin
     if v_cel = '' or new.apagado_em is not null then return new; end if;
     if tg_op = 'UPDATE' and old.apagado_em is null and celular_chave(old.perfil -> 'info' ->> 'celular') = v_cel then return new; end if;
     if celular_em_uso(v_cel, null, new.id, new.nome) then
       raise exception 'Este celular já está em outro cadastro. Cada celular só pode ter um cadastro.';
     end if;
     return new;
   end;
   $$`,
  `drop trigger if exists alunos_celular_unico on alunos`,
  `create trigger alunos_celular_unico before insert or update of perfil, saida, apagado_em on alunos
   for each row execute function alunos_celular_unico()`,
  // ================================================== v128: aba Painel da Transparência
  // Configuração (root): visível para a corrente, mês de início do saldo, saldo inicial, valor da mensalidade e descrição
  // das doações (conta B) e os campos de débito e de crédito. O que faltar aqui vale o padrão de api/_lib/transparencia.js.
  `insert into sistema (chave, valor) values ('transparencia', '{"publicada":false}')
   on conflict (chave) do nothing`,
  // Valores de um mês: débitos e créditos digitados (linhas { nome, valor }, uma por campo) e o aporte da Mãe Vê.
  // Mês sem linha herda o último mês anterior que tem.
  `create table if not exists transparencia_meses (
     mes            text primary key check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
     debitos        jsonb not null default '[]'::jsonb,
     creditos       jsonb not null default '[]'::jsonb,
     aporte         numeric(12, 2) not null default 0,
     atualizado_em  timestamptz not null default now(),
     por            text not null default ''
   )`,
  // Leitura da conta B do ASAAS por mês (mensalidades e doações), guardada para não chamar o ASAAS a cada abertura.
  `create table if not exists transparencia_asaas (
     mes            text primary key check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
     dados          jsonb not null,
     atualizado_em  timestamptz not null default now()
   )`,
  `create or replace function transparencia_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select (valor::jsonb ->> 'publicada')::boolean from sistema where chave = 'transparencia'), false))
   $$`,
  // p = { config }: troca a configuração inteira (o backend já conferiu os campos).
  `create or replace function transparencia_config_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update sistema set valor = (p -> 'config')::text where chave = 'transparencia';
     return transparencia_estado();
   end;
   $$`,
  `create or replace function transparencia_mes_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into transparencia_meses (mes, debitos, creditos, aporte, atualizado_em, por)
     values (p ->> 'mes', coalesce(p -> 'debitos', '[]'::jsonb), coalesce(p -> 'creditos', '[]'::jsonb), coalesce((p ->> 'aporte')::numeric, 0),
             now(), coalesce(p ->> 'por', ''))
     on conflict (mes) do update set debitos = excluded.debitos, creditos = excluded.creditos, aporte = excluded.aporte,
             atualizado_em = now(), por = excluded.por;
     return transparencia_estado();
   end;
   $$`,
  `create or replace function transparencia_asaas_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into transparencia_asaas (mes, dados, atualizado_em) values (p ->> 'mes', p -> 'dados', now())
     on conflict (mes) do update set dados = excluded.dados, atualizado_em = now();
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // A aba entra nos perfis: o root e o Admin financeiro editam os valores (a configuração é só do root); os outros perfis
  // veem quando está visível para a corrente.
  `update perfis set abas = abas || jsonb_build_object('transparencia', jsonb_build_object('ver', chave in ('root', 'admin_financeiro'),
     'editar', chave in ('root', 'admin_financeiro')))
   where not abas ? 'transparencia'`,
  // ================================================== v129: Transparência sem "(média)" nos campos; contagem da corrente; renomear campo
  // Os campos "Luz (média)" e "Água (média)" passam a se chamar "Luz" e "Água", na configuração e nos meses já lançados.
  `update sistema set valor = replace(replace(valor, '"Luz (média)"', '"Luz"'), '"Água (média)"', '"Água"')
   where chave = 'transparencia' and (valor like '%"Luz (média)"%' or valor like '%"Água (média)"%')`,
  `update transparencia_meses set debitos = replace(replace(debitos::text, '"Luz (média)"', '"Luz"'), '"Água (média)"', '"Água"')::jsonb
   where debitos::text like '%"Luz (média)"%' or debitos::text like '%"Água (média)"%'`,
  // Campo renomeado pelo root (na edição da própria tela): o nome novo vai para os valores de todos os meses lançados.
  // p = { tipo: 'debitos' | 'creditos', de, para }.
  `create or replace function transparencia_renomear(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if p ->> 'tipo' = 'debitos' then
       update transparencia_meses set debitos = (
         select coalesce(jsonb_agg(case when e ->> 'nome' = p ->> 'de' then jsonb_set(e, '{nome}', to_jsonb(p ->> 'para')) else e end), '[]'::jsonb)
           from jsonb_array_elements(debitos) e)
       where debitos @> jsonb_build_array(jsonb_build_object('nome', p ->> 'de'));
     elsif p ->> 'tipo' = 'creditos' then
       update transparencia_meses set creditos = (
         select coalesce(jsonb_agg(case when e ->> 'nome' = p ->> 'de' then jsonb_set(e, '{nome}', to_jsonb(p ->> 'para')) else e end), '[]'::jsonb)
           from jsonb_array_elements(creditos) e)
       where creditos @> jsonb_build_array(jsonb_build_object('nome', p ->> 'de'));
     end if;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // ================================================== v130: Criar cadastro acha o cadastro pelo CPF
  // O CPF da corrente ganha um hash (HMAC da CPF_CHAVE, como o dos alunos) para achar o cadastro sem decifrar todos.
  // As linhas de antes (e as do UP CPJ) ficam com hash '': o backend preenche na busca (o banco não tem a chave).
  `alter table pessoas_cpf add column if not exists hash text not null default ''`,
  `create index if not exists pessoas_cpf_hash on pessoas_cpf (hash)`,
  // p = { pessoaId, cifrado, hash, por }; cifrado '' apaga.
  `create or replace function cpf_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := (p ->> 'pessoaId')::uuid;
   begin
     if not exists (select 1 from pessoas where id = v_id and saida is null) then
       raise exception 'Pessoa não encontrada.';
     end if;
     if coalesce(p ->> 'cifrado', '') = '' then
       delete from pessoas_cpf where pessoa_id = v_id;
     else
       insert into pessoas_cpf (pessoa_id, cifrado, hash, atualizado_em, atualizado_por)
       values (v_id, p ->> 'cifrado', coalesce(p ->> 'hash', ''), now(), coalesce(p ->> 'por', ''))
       on conflict (pessoa_id) do update set cifrado = excluded.cifrado, hash = excluded.hash,
         atualizado_em = now(), atualizado_por = excluded.atualizado_por;
     end if;
     return cpf_ler(p);
   end;
   $$`,
  `create or replace function cpf_sem_hash(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('pessoaId', pessoa_id, 'cifrado', cifrado)), '[]'::jsonb)
       from pessoas_cpf where hash = ''
   $$`,
  // p = { itens: [{ pessoaId, hash }] } — só preenche quem ainda está sem hash.
  `create or replace function cpf_hash_definir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update pessoas_cpf c set hash = x ->> 'hash'
       from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) x
      where c.pessoa_id = (x ->> 'pessoaId')::uuid and c.hash = '' and coalesce(x ->> 'hash', '') <> '';
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // Quem tem esse CPF (p = { hash }): pessoa ativa da corrente ou aluno ativo, no mesmo formato de login_candidatos.
  `create or replace function cadastro_por_cpf(p jsonb)
   returns jsonb language sql stable as $$
     with c as (
       select 2 as ordem, 'corrente' as tipo, pe.id, pe.nome, pe.pin_hash as hash, pe.pin_versao as versao, 'pin:' || pe.id::text as chave,
              celular_chave(pe.perfil -> 'info' ->> 'celular') as cel_cad, lower(btrim(coalesce(pe.perfil -> 'info' ->> 'email', ''))) as email_cad
         from pessoas_cpf x join pessoas pe on pe.id = x.pessoa_id
        where pe.saida is null and x.hash <> '' and x.hash = p ->> 'hash'
       union all
       select 3, 'aluno', al.id, al.nome, al.pin_hash, al.pin_versao, 'pina:' || al.id::text,
              celular_chave(al.perfil -> 'info' ->> 'celular'), lower(btrim(coalesce(al.perfil -> 'info' ->> 'email', '')))
         from alunos_cpf x join alunos al on al.id = x.aluno_id
        where al.saida is null and x.hash <> '' and x.hash = p ->> 'hash'
     )
     select coalesce(jsonb_agg(jsonb_build_object('tipo', c.tipo, 'id', c.id, 'nome', c.nome, 'hash', c.hash, 'versao', c.versao,
              'chave', c.chave, 'celular', c.cel_cad, 'email', c.email_cad,
              'bloqueado', exists (select 1 from login_falhas f where f.email = c.chave and f.bloqueado_ate > now()))
              order by c.ordem, lower(c.nome)), '[]'::jsonb)
       from c
   $$`,
  // ================================================== v131: alunos de curimba de fora da corrente viram alunos (turma Curimba)
  // Quem é da corrente continua ligado à pessoa (pessoa_id). Quem era "de fora" (só o nome, entrava pela palavra-passe
  // curimba, que acabou) vira aluno da turma Curimba em Alunos e entra como os outros alunos (e-mail, celular ou CPF).
  // As aulas e a presença continuam na mesma linha de curimba_alunos, agora ligada ao aluno (aluno_id).
  `alter table curimba_alunos add column if not exists aluno_id uuid references alunos (id) on delete set null`,
  `create unique index if not exists curimba_alunos_aluno on curimba_alunos (aluno_id) where aluno_id is not null`,
  // A turma Curimba: guardada pelo id (o admin pode renomear); se foi removida, é criada de novo quando precisar.
  `create or replace function turma_curimba()
   returns uuid language plpgsql as $$
   declare v uuid;
   begin
     select t.id into v from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_curimba';
     if v is null then
       select id into v from turmas_alunos where lower(btrim(nome)) = 'curimba';
       if v is null then insert into turmas_alunos (nome) values ('Curimba') returning id into v; end if;
       insert into sistema (chave, valor) values ('turma_curimba', v::text)
       on conflict (chave) do update set valor = excluded.valor;
     end if;
     return v;
   end;
   $$`,
  `select turma_curimba()`,
  // Aluno que entra na turma Curimba (cadastro, mudança de turma) vira aluno de curimba: liga à linha de mesmo nome
  // ainda sem cadastro (de antes desta versão) ou cria uma linha nova.
  `create or replace function alunos_turma_curimba()
   returns trigger language plpgsql as $$
   declare v_turma uuid;
   begin
     select t.id into v_turma from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_curimba';
     if v_turma is null or new.turma_id is distinct from v_turma or new.saida is not null then return new; end if;
     if tg_op = 'UPDATE' and old.turma_id is not distinct from new.turma_id then return new; end if;
     if exists (select 1 from curimba_alunos where aluno_id = new.id) then return new; end if;
     update curimba_alunos set aluno_id = new.id
      where id = (select id from curimba_alunos where aluno_id is null and pessoa_id is null
                   and lower(btrim(nome)) = lower(btrim(new.nome)) limit 1);
     if not found then insert into curimba_alunos (nome, aluno_id) values (new.nome, new.id); end if;
     return new;
   end;
   $$`,
  `drop trigger if exists alunos_turma_curimba on alunos`,
  `create trigger alunos_turma_curimba after insert or update of turma_id on alunos
   for each row execute function alunos_turma_curimba()`,
  // UP CPJ: o aluno vira pessoa da corrente com o mesmo nome; as aulas de curimba vão junto (a linha passa para a pessoa).
  `create or replace function pessoas_curimba_do_aluno()
   returns trigger language plpgsql as $$
   begin
     if not exists (select 1 from curimba_alunos where pessoa_id = new.id) then
       update curimba_alunos ca set pessoa_id = new.id
         from alunos al
        where ca.aluno_id = al.id and ca.pessoa_id is null and lower(btrim(al.nome)) = lower(btrim(new.nome));
     end if;
     return new;
   end;
   $$`,
  `drop trigger if exists pessoas_curimba_do_aluno on pessoas`,
  `create trigger pessoas_curimba_do_aluno after insert on pessoas
   for each row execute function pessoas_curimba_do_aluno()`,
  // Os de fora de antes: liga ao aluno de mesmo nome que já existir; os outros viram alunos da turma Curimba (o gatilho liga).
  `update curimba_alunos ca set aluno_id = al.id
     from alunos al
    where ca.pessoa_id is null and ca.aluno_id is null and lower(btrim(al.nome)) = lower(btrim(ca.nome))
      and not exists (select 1 from curimba_alunos x where x.aluno_id = al.id)`,
  `insert into alunos (nome, turma_id)
   select btrim(ca.nome), turma_curimba() from curimba_alunos ca
    where ca.pessoa_id is null and ca.aluno_id is null
   on conflict do nothing`,
  `create or replace function curimba_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'alunos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', coalesce(pe.nome, al.nome, a.nome), 'pessoaId', a.pessoa_id,
                                                               'alunoId', a.aluno_id)
                                            order by lower(coalesce(pe.nome, al.nome, a.nome)))
                           from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id left join alunos al on al.id = a.aluno_id
                          where al.id is null or al.saida is null), '[]'::jsonb),
       'aulas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data, 'nome', nome) order by data) from curimba_aulas), '[]'::jsonb),
       'presencas', coalesce((select jsonb_agg(jsonb_build_object('aulaId', aula_id, 'alunoId', aluno_id, 'status', status)) from curimba_presencas), '[]'::jsonb))
   $$`,
  // p = { pessoaId } (da corrente) ou { nome } (aluno: o de mesmo nome, ou um novo na turma Curimba).
  `create or replace function curimba_aluno_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_pessoa uuid := nullif(p ->> 'pessoaId', '')::uuid;
     v_nome text := btrim(coalesce(p ->> 'nome', ''));
     v_aluno uuid;
   begin
     if v_pessoa is not null then
       select nome into v_nome from pessoas where id = v_pessoa;
       if not found then raise exception 'Pessoa não encontrada.'; end if;
       if exists (select 1 from curimba_alunos where pessoa_id = v_pessoa) then raise exception 'Essa pessoa já é aluna da curimba.'; end if;
       insert into curimba_alunos (nome, pessoa_id) values (v_nome, v_pessoa);
       return curimba_estado();
     end if;
     if v_nome = '' then raise exception 'Digite o nome.'; end if;
     if exists (select 1 from curimba_alunos a left join pessoas pe on pe.id = a.pessoa_id left join alunos al on al.id = a.aluno_id
                 where lower(btrim(coalesce(pe.nome, al.nome, a.nome))) = lower(v_nome)) then
       raise exception 'Já existe um aluno com esse nome.';
     end if;
     if exists (select 1 from pessoas where saida is null and lower(btrim(nome)) = lower(v_nome)) then
       raise exception 'Essa pessoa é da corrente: escolha em "Da corrente".';
     end if;
     select id into v_aluno from alunos where lower(btrim(nome)) = lower(v_nome);
     if v_aluno is null then
       insert into alunos (nome, turma_id) values (v_nome, turma_curimba()) returning id into v_aluno;
     elsif exists (select 1 from alunos where id = v_aluno and saida is not null) then
       raise exception 'Esse nome é de um ex-aluno: traga de volta em Pessoas → Alunos → Ex-alunos e ponha na turma Curimba.';
     end if;
     insert into curimba_alunos (nome, aluno_id) select v_nome, v_aluno
      where not exists (select 1 from curimba_alunos where aluno_id = v_aluno);
     return curimba_estado();
   end;
   $$`,
  // As aulas de quem está logado: { alunoId } (linha de curimba_alunos), { aluno } (aluno de Alunos) ou { pessoaId }.
  `create or replace function curimba_minha(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('aulas', coalesce((select jsonb_agg(jsonb_build_object('data', au.data, 'nome', au.nome, 'status', cp.status) order by au.data)
                                                  from curimba_aulas au left join curimba_presencas cp on cp.aula_id = au.id and cp.aluno_id = a.id), '[]'::jsonb))
     from curimba_alunos a
     where case when nullif(p ->> 'alunoId', '') is not null then a.id = (p ->> 'alunoId')::uuid
                when nullif(p ->> 'aluno', '') is not null then a.aluno_id = (p ->> 'aluno')::uuid
                else a.pessoa_id = nullif(p ->> 'pessoaId', '')::uuid end
   $$`,
  // ================================================== v132: aba Oferendas mais leve
  // ================================================== v133: Ervas vira sub-aba de Oferendas; o perfil Admin ervas sai
  // O Admin oferendas passa a administrar as ervas e recebe quem era do Admin ervas; depois o Admin ervas é apagado.
  // Só enquanto o Admin ervas existir: se o root mudar o Admin oferendas depois, a migração não desfaz.
  `update perfis set abas = abas || jsonb_build_object('ervas', jsonb_build_object('ver', true, 'editar', true))
    where chave = 'admin_oferendas' and exists (select 1 from perfis where chave = 'admin_ervas')`,
  // A versão da sessão muda: quem estava logado com o perfil antigo entra de novo, já com o novo.
  `update usuarios set papel = 'admin_oferendas', sessao_versao = sessao_versao + 1 where papel = 'admin_ervas'`,
  `delete from perfis where chave = 'admin_ervas'`,
  // ================================================== v134: consulentes e Cadastros pelo login (aba Pessoas)
  // Quem se cadastra pelo login entra como aluno sem turma ("novo"). O admin decide para onde vai: uma turma de alunos,
  // Consulentes ou a corrente (UP CPJ). Consulente é o mesmo cadastro (login, senha, CPF, Perfil) numa turma escondida,
  // Consulentes: fica fora das listas de alunos, das oferendas e da Iemanjá. O que ele vê é o perfil Consulentes.
  `create or replace function turma_consulentes()
   returns uuid language plpgsql as $$
   declare v uuid;
   begin
     select t.id into v from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_consulentes';
     if v is null then
       select id into v from turmas_alunos where lower(btrim(nome)) = 'consulentes';
       if v is null then insert into turmas_alunos (nome) values ('Consulentes') returning id into v; end if;
       insert into sistema (chave, valor) values ('turma_consulentes', v::text)
       on conflict (chave) do update set valor = excluded.valor;
     end if;
     return v;
   end;
   $$`,
  `select turma_consulentes()`,
  `create or replace function turma_consulentes_id()
   returns uuid language sql stable as $$
     select t.id from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_consulentes'
   $$`,
  // ================================================== v135: presença dos alunos no amaci (aba Amaci)
  // Um registro por evento do tipo Amaci e aluno: 'p' presente, 'f' falta; sem registro = ausente.
  // O aluno marca a própria presença no dia, dentro do terreiro (a API confere); o admin root marca presença ou falta.
  `create table if not exists amaci_presencas (
     evento_id  uuid not null references eventos (id) on delete cascade,
     aluno_id   uuid not null references alunos (id) on delete cascade,
     status     text not null check (status in ('p', 'f')),
     por        text not null default '',
     em         timestamptz not null default now(),
     primary key (evento_id, aluno_id)
   )`,
  // p = { eventoId, alunoId, status: 'p'|'f'|null (apaga), por }
  `create or replace function amaci_presenca_marcar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p ->> 'status', '') = '' then
       delete from amaci_presencas where evento_id = (p ->> 'eventoId')::uuid and aluno_id = (p ->> 'alunoId')::uuid;
     else
       insert into amaci_presencas (evento_id, aluno_id, status, por)
       values ((p ->> 'eventoId')::uuid, (p ->> 'alunoId')::uuid, p ->> 'status', coalesce(p ->> 'por', ''))
       on conflict (evento_id, aluno_id) do update set status = excluded.status, por = excluded.por, em = now();
     end if;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // ================================================== v136: tipos de evento por turma (T09 - Amaci…) e turmas com acesso à aba
  // ================================================== v137: amaci que já passou, cadastrado pelo root na aba Amaci
  // O evento criado pelo root em Presenças → "Cadastrar amaci que já passou" fica marcado (retroativo): nele o aluno
  // marca a própria presença sem a localização. Os outros amacis passados (cadastro normal de Eventos) só o root marca.
  `alter table eventos add column if not exists retroativo boolean not null default false`,
  `create or replace function evento_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from eventos_tipos where chave = p ->> 'tipo') then raise exception 'Escolha o tipo do evento.'; end if;
     if coalesce(p ->> 'id', '') = '' then
       insert into eventos (data, nome, tipo, retroativo)
       values ((p ->> 'data')::date, btrim(p ->> 'nome'), p ->> 'tipo', coalesce((p ->> 'retroativo')::boolean, false));
     else
       update eventos set data = (p ->> 'data')::date, nome = btrim(p ->> 'nome'), tipo = p ->> 'tipo' where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Evento não encontrado.'; end if;
     end if;
     return eventos_listar();
   end;
   $$`,
  // p = { alunoId? } — os amacis (tipo com "Amaci" no nome; cada um com as turmas do tipo e se é retroativo) e as presenças.
  `create or replace function amaci_presencas_dados(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'eventos', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'data', e.data, 'nome', e.nome, 'tipoNome', t.nome, 'turmas', to_jsonb(t.turmas),
                                                                'retroativo', e.retroativo)
                                             order by e.data, lower(e.nome))
                            from eventos e join eventos_tipos t on t.chave = e.tipo
                           where t.chave = 'amaci' or t.nome ilike '%amaci%'), '[]'::jsonb),
       'presencas', coalesce((select jsonb_agg(jsonb_build_object('eventoId', x.evento_id, 'alunoId', x.aluno_id, 'status', x.status))
                              from amaci_presencas x
                             where nullif(p ->> 'alunoId', '') is null or x.aluno_id = (p ->> 'alunoId')::uuid), '[]'::jsonb))
   $$`,
  // ================================================== v138: Pgto atrasado com a turma do aluno
  // O bloco CPJ - Pgto atrasado (aba Geral) filtra por grupo: Corrente, cada turma de alunos, aluno sem turma e sem ligação.
  `create or replace function atrasos_ler(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'atualizadoEm', (select to_char(valor::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from sistema where chave = 'asaas2_atualizado'),
       'itens', coalesce((select jsonb_agg(jsonb_build_object(
           'id', a.id, 'conta', a.conta, 'pessoaId', a.pessoa_id, 'alunoId', al.id, 'ligado', pe.id is not null or al.id is not null,
           'turmaId', al.turma_id, 'turmaNome', t.nome,
           'nome', coalesce(pe.nome, al.nome, a.nome),
           'telefone', coalesce(nullif(pe.perfil -> 'info' ->> 'celular', ''), nullif(al.perfil -> 'info' ->> 'celular', ''), a.telefone),
           'valor', a.valor::float8, 'vencimento', a.vencimento, 'descricao', a.descricao, 'link', a.link)
           order by a.vencimento nulls last, lower(coalesce(pe.nome, al.nome, a.nome)))
         from atrasos_validos() a
         left join pessoas pe on pe.id = a.pessoa_id and pe.saida is null
         left join alunos al on al.id = a.aluno_id and al.saida is null and pe.id is null
         left join turmas_alunos t on t.id = al.turma_id), '[]'::jsonb))
   $$`,
  // Leitura do ASAAS mais leve: os dados dos clientes (nome, telefone, hash do CPF — nunca o CPF aberto — e a referência)
  // ficam guardados por 7 dias; cada leitura busca só as cobranças e os clientes novos (o Atualizar do root renova todos).
  // A pessoa é achada pelo hash do CPF do Perfil, sem decifrar os CPFs da corrente.
  `create table if not exists asaas_clientes_info (
     conta          text not null,
     id             text not null,
     nome           text not null default '',
     telefone       text not null default '',
     cpf_hash       text not null default '',
     referencia     text not null default '',
     atualizado_em  timestamptz not null default now(),
     primary key (conta, id)
   )`,
  // p = { conta, ids } — os clientes guardados há menos de 7 dias.
  `create or replace function asaas_clientes_info_ler(p jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'cpfHash', c.cpf_hash, 'referencia', c.referencia)), '[]'::jsonb)
       from asaas_clientes_info c
      where c.conta = p ->> 'conta' and c.atualizado_em > now() - interval '7 days'
        and c.id in (select jsonb_array_elements_text(coalesce(p -> 'ids', '[]'::jsonb)))
   $$`,
  // p = { conta, itens: [{ id, nome, telefone, cpfHash, referencia }] }
  `create or replace function asaas_clientes_info_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into asaas_clientes_info (conta, id, nome, telefone, cpf_hash, referencia)
     select p ->> 'conta', x ->> 'id', coalesce(x ->> 'nome', ''), coalesce(x ->> 'telefone', ''), coalesce(x ->> 'cpfHash', ''), coalesce(x ->> 'referencia', '')
       from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) x
     on conflict (conta, id) do update set nome = excluded.nome, telefone = excluded.telefone, cpf_hash = excluded.cpf_hash,
       referencia = excluded.referencia, atualizado_em = now();
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // Hash do CPF de cada pessoa ativa da corrente (para ligar a cobrança à pessoa sem decifrar).
  `create or replace function cpf_hashes(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('pessoaId', c.pessoa_id, 'hash', c.hash)), '[]'::jsonb)
       from pessoas_cpf c join pessoas pe on pe.id = c.pessoa_id where pe.saida is null and c.hash <> ''
   $$`,
  // ================================================== v139: bloquear o acesso do aluno ao app
  // Quem edita Alunos marca "Bloquear acesso ao app": o login recusa e a sessão aberta cai no próximo pedido.
  // O cadastro, as presenças e o resto ficam como estão; desmarcar devolve o acesso.
  `alter table alunos add column if not exists bloqueado boolean not null default false`,
  // p = { id, bloqueado }
  `create or replace function aluno_bloquear(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update alunos set bloqueado = coalesce((p ->> 'bloqueado')::boolean, false) where id = (p ->> 'id')::uuid and saida is null;
     if not found then raise exception 'Aluno não encontrado.'; end if;
     return alunos_estado();
   end;
   $$`,
  // ================================================== v140: Transparência — a curimba que está na corrente conta
  // O quadradinho Na corrente (e a lista de quem ficou fora das mensalidades) passa a contar a curimba que tem turma da
  // limpeza; a curimba sem turma da limpeza continua fora.
  `create or replace function transparencia_corrente(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', pe.id, 'nome', pe.nome,
              'temCpf', exists (select 1 from pessoas_cpf c where c.pessoa_id = pe.id)) order by lower(pe.nome)), '[]'::jsonb)
       from pessoas pe where pe.saida is null and (pe.funcao <> 'curimba' or pe.limpeza is not null)
   $$`,
  // Abertura mais leve: a leitura do ASAAS vem inteira (com as listas de nomes) só no mês pedido (p.mes); dos outros meses,
  // só os totais que o saldo usa e o formato (para saber se já foi lido).
  `create or replace function transparencia_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'config', coalesce((select valor::jsonb from sistema where chave = 'transparencia'), '{}'::jsonb),
       'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'debitos', debitos, 'creditos', creditos, 'aporte', aporte::float8,
                  'atualizadoEm', atualizado_em, 'por', por) order by mes) from transparencia_meses), '[]'::jsonb),
       'asaas', coalesce((select jsonb_agg(jsonb_build_object('mes', a.mes, 'atualizadoEm', a.atualizado_em, 'dados',
                  case when a.mes = coalesce(p ->> 'mes', '') then a.dados
                       else jsonb_build_object('formato', a.dados -> 'formato',
                              'mensalidades', jsonb_build_object('totalPago', a.dados -> 'mensalidades' -> 'totalPago'),
                              'doacoes', jsonb_build_object('total', a.dados -> 'doacoes' -> 'total'),
                              'aporte', case when a.dados ? 'aporte' then jsonb_build_object('total', a.dados -> 'aporte' -> 'total') end) end)
                  order by a.mes) from transparencia_asaas a), '[]'::jsonb))
   $$`,
  // ================================================== v141: sub-aba Pagamentos (aba Compras)
  // O histórico de cobranças do ASAAS de cada pessoa (pela chave dela: p:<pessoa> ou a:<aluno>), guardado para a próxima
  // abertura; e o interruptor "Visível para todos" do root.
  `create table if not exists asaas_historico (
     chave          text primary key,
     dados          jsonb not null default '[]'::jsonb,
     atualizado_em  timestamptz not null default now()
   )`,
  `create or replace function asaas_historico_ler(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('dados', dados, 'atualizadoEm', to_char(atualizado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
       from asaas_historico where chave = p ->> 'chave'
   $$`,
  `create or replace function asaas_historico_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into asaas_historico (chave, dados, atualizado_em) values (p ->> 'chave', coalesce(p -> 'dados', '[]'::jsonb), now())
     on conflict (chave) do update set dados = excluded.dados, atualizado_em = now();
     return asaas_historico_ler(jsonb_build_object('chave', p ->> 'chave'));
   end;
   $$`,
  `create or replace function pagamentos_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'pagamentos_publicada'), false))
   $$`,
  `create or replace function pagamentos_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('pagamentos_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return pagamentos_publicada();
   end;
   $$`,
  // ================================================== v142: item de doação nas Compras vai para a conta B do ASAAS
  // O item marcado "Doação (conta B)" é cobrado na conta B; os outros continuam na A. Um pedido com os dois vira duas
  // cobranças (uma por conta). O cliente do ASAAS passa a ser por pessoa e por conta. O que já existe fica na conta A.
  `alter table guias_itens add column if not exists doacao boolean not null default false`,
  `alter table asaas_cobrancas add column if not exists conta text not null default 'A'`,
  `alter table asaas_clientes add column if not exists conta text not null default 'A'`,
  `do $$ begin
     if exists (select 1 from pg_constraint where conname = 'asaas_clientes_pkey' and array_length(conkey, 1) = 1) then
       alter table asaas_clientes drop constraint asaas_clientes_pkey;
       alter table asaas_clientes add constraint asaas_clientes_pkey primary key (chave, conta);
     end if;
   end $$`,
  // Conta do ASAAS de uma linha de pedido: B se o item é doação; A nos outros casos (inclusive item excluído).
  `create or replace function guia_linha_conta(item uuid)
   returns text language sql stable as $$
     select case when coalesce((select doacao from guias_itens where id = item), false) then 'B' else 'A' end
   $$`,
  `create or replace function guia_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_id uuid := nullif(p ->> 'id', '')::uuid;
   begin
     if v_id is null then
       if not exists (select 1 from guias_grupos where id = (p ->> 'grupoId')::uuid) then raise exception 'Grupo não encontrado.'; end if;
       insert into guias_itens (grupo_id, descricao, foto, quantidade, valor, visivel, cpj, doacao)
       values ((p ->> 'grupoId')::uuid, p ->> 'descricao', nullif(p ->> 'foto', ''), (p ->> 'quantidade')::int, (p ->> 'valor')::numeric,
               coalesce((p ->> 'visivel')::boolean, true), coalesce((p ->> 'cpj')::boolean, false), coalesce((p ->> 'doacao')::boolean, false));
     else
       update guias_itens set
         descricao = case when p ? 'descricao' then p ->> 'descricao' else descricao end,
         foto = case when p ? 'foto' then nullif(p ->> 'foto', '') else foto end,
         quantidade = case when p ? 'quantidade' then (p ->> 'quantidade')::int else quantidade end,
         valor = case when p ? 'valor' then (p ->> 'valor')::numeric else valor end,
         visivel = case when p ? 'visivel' then (p ->> 'visivel')::boolean else visivel end,
         cpj = case when p ? 'cpj' then (p ->> 'cpj')::boolean else cpj end,
         doacao = case when p ? 'doacao' then (p ->> 'doacao')::boolean else doacao end
       where id = v_id;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return guias_estado();
   end;
   $$`,
  // p = { chave, conta, clienteId }
  `create or replace function asaas_cliente_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into asaas_clientes (chave, conta, cliente_id) values (p ->> 'chave', coalesce(nullif(p ->> 'conta', ''), 'A'), p ->> 'clienteId')
     on conflict (chave, conta) do update set cliente_id = excluded.cliente_id;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // p = { chave } — reservas da pessoa paradas há mais de 20 s (a função da Vercel não passa de 15 s), com a conta.
  `create or replace function asaas_reservas_paradas(p jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', id, 'pedido', pedido, 'conta', conta) order by criado_em), '[]'::jsonb) from asaas_cobrancas
      where chave = p ->> 'chave' and status = 'criando' and criado_em < now() - interval '20 seconds'
   $$`,
  // p = { chave, pedido } — as contas que têm algo a pagar no pedido (linhas não pagas, sem link pendente ou criando).
  `create or replace function asaas_contas_a_pagar(p jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(distinct guia_linha_conta(l.item_id)), '[]'::jsonb)
       from guias_linhas l left join asaas_cobrancas c on c.id = l.cobranca_id
      where l.pedido = (p ->> 'pedido')::int and l.chave = p ->> 'chave' and l.pago_em is null
        and (c.id is null or c.status in ('vencida', 'cancelada', 'estornada'))
   $$`,
  // p = { chave, nome, pedido, conta } — reserva, numa cobrança nova, as linhas não pagas da pessoa no pedido que são
  // daquela conta (inclusive de cobrança vencida ou cancelada) e devolve o valor somado no banco. No máximo 20 por hora.
  `create or replace function asaas_cobranca_reservar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_id uuid;
     v_valor numeric(10, 2);
     v_conta text := coalesce(nullif(p ->> 'conta', ''), 'A');
   begin
     if (select count(*) from asaas_cobrancas where chave = p ->> 'chave' and criado_em > now() - interval '1 hour') >= 20 then
       raise exception 'Muitos links de pagamento gerados em pouco tempo. Tente de novo mais tarde.';
     end if;
     perform 1 from guias_linhas where pedido = (p ->> 'pedido')::int and chave = p ->> 'chave' for update;
     select coalesce(sum(l.valor * l.quantidade), 0) into v_valor
       from guias_linhas l left join asaas_cobrancas c on c.id = l.cobranca_id
      where l.pedido = (p ->> 'pedido')::int and l.chave = p ->> 'chave' and l.pago_em is null and guia_linha_conta(l.item_id) = v_conta
        and (c.id is null or c.status in ('vencida', 'cancelada', 'estornada'));
     if v_valor <= 0 then
       if exists (select 1 from guias_linhas l join asaas_cobrancas c on c.id = l.cobranca_id
                   where l.pedido = (p ->> 'pedido')::int and l.chave = p ->> 'chave' and l.pago_em is null and c.status = 'criando') then
         raise exception 'O link deste pedido ainda está sendo gerado pelo ASAAS. Aguarde uns segundos e tente de novo.';
       end if;
       if exists (select 1 from guias_linhas l join asaas_cobrancas c on c.id = l.cobranca_id
                   where l.pedido = (p ->> 'pedido')::int and l.chave = p ->> 'chave' and l.pago_em is null and c.status = 'pendente') then
         raise exception 'O link de pagamento deste pedido já foi gerado. Use o que está na tela.';
       end if;
       raise exception 'Não há nada a pagar neste pedido.';
     end if;
     insert into asaas_cobrancas (chave, nome, pedido, valor, conta) values (p ->> 'chave', p ->> 'nome', (p ->> 'pedido')::int, v_valor, v_conta) returning id into v_id;
     update guias_linhas l set cobranca_id = v_id
      where l.pedido = (p ->> 'pedido')::int and l.chave = p ->> 'chave' and l.pago_em is null and guia_linha_conta(l.item_id) = v_conta
        and (l.cobranca_id is null or exists (select 1 from asaas_cobrancas c where c.id = l.cobranca_id and c.status in ('vencida', 'cancelada', 'estornada')));
     return jsonb_build_object('id', v_id, 'valor', v_valor);
   end;
   $$`,
  `create or replace function asaas_cobranca(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', c.id, 'status', c.status, 'asaasId', c.asaas_id, 'conta', c.conta) from asaas_cobrancas c where c.id = (p ->> 'id')::uuid
   $$`,
  // Pgto atrasado: a cobrança que o app criou (em qualquer conta) só conta enquanto tem item por pagar ligado a ela.
  `create or replace function atrasos_validos()
   returns table (conta text, id text, pessoa_id uuid, aluno_id uuid, nome text, telefone text, valor numeric, vencimento date, descricao text, link text)
   language sql stable as $$
     select a.conta, a.id, a.pessoa_id,
            coalesce(a.aluno_id, (select c.aluno_id from alunos_cpf c where a.cpf_hash <> '' and c.hash = a.cpf_hash limit 1)),
            a.nome, a.telefone, a.valor, a.vencimento, a.descricao, a.link
       from asaas2_atrasos a
      where not (exists (select 1 from asaas_cobrancas c where c.id::text = a.referencia)
                 and not exists (select 1 from guias_linhas l where l.cobranca_id::text = a.referencia and l.pago_em is null))
   $$`,
  // ================================================== v143: doação com o valor que a pessoa digita
  // Item de doação: a pessoa digita o valor (com centavos); vira uma linha nova com esse valor e quantidade 1, sem estoque
  // (doação não esgota). Os outros itens continuam com o preço do item e o estoque.
  `create or replace function guia_pedir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_pedido int;
     v_item guias_itens%rowtype;
     v_grupo text;
     v_qtd int := (p ->> 'quantidade')::int;
     v_linha uuid;
     v_valor numeric(10, 2);
   begin
     select i.* into v_item from guias_itens i join guias_grupos g on g.id = i.grupo_id
      where i.id = (p ->> 'itemId')::uuid and i.visivel and g.visivel for update of i;
     if not found then raise exception 'Este item não está disponível.'; end if;
     select descricao into v_grupo from guias_grupos where id = v_item.grupo_id;
     v_pedido := guia_pedido_do_grupo(v_item.grupo_id);
     if v_pedido is null then raise exception 'Os pedidos de % estão fechados no momento.', v_grupo; end if;
     if v_item.doacao then
       v_valor := nullif(p ->> 'valor', '')::numeric;
       if v_valor is null or v_valor <= 0 then raise exception 'Digite o valor da doação.'; end if;
       insert into guias_linhas (pedido, item_id, grupo_id, descricao, valor, quantidade, chave, nome)
       values (v_pedido, v_item.id, v_item.grupo_id, v_grupo || ' · ' || v_item.descricao, v_valor, 1, p ->> 'chave', p ->> 'nome');
       return guias_estado() || jsonb_build_object('pedidoFeito', v_pedido);
     end if;
     if v_item.quantidade < 1 then raise exception 'Este item esgotou.'; end if;
     if v_qtd < 1 or v_qtd > v_item.quantidade then raise exception 'Só restam % deste item.', v_item.quantidade; end if;
     update guias_itens set quantidade = quantidade - v_qtd where id = v_item.id;
     select id into v_linha from guias_linhas
      where pedido = v_pedido and item_id = v_item.id and chave = p ->> 'chave' and valor = v_item.valor
        and cobranca_id is null and pago_em is null limit 1;
     if v_linha is not null then
       update guias_linhas set quantidade = quantidade + v_qtd, nome = p ->> 'nome', ok = false where id = v_linha;
     else
       insert into guias_linhas (pedido, item_id, grupo_id, descricao, valor, quantidade, chave, nome)
       values (v_pedido, v_item.id, v_item.grupo_id, v_grupo || ' · ' || v_item.descricao, v_item.valor, v_qtd, p ->> 'chave', p ->> 'nome');
     end if;
     return guias_estado() || jsonb_build_object('pedidoFeito', v_pedido);
   end;
   $$`,
  // ================================================== v144: aba Compras mais leve
  // A versão da foto (fotoV) era um md5 da foto inteira, calculado a cada abertura e a cada ação: o banco lia todas as
  // fotos. Agora é uma coluna gerada, calculada só quando a foto muda (o mesmo valor de antes: os links não mudam).
  `alter table guias_itens add column if not exists foto_v text generated always as (substr(md5(foto), 1, 10)) stored`,
  `create index if not exists guias_linhas_chave on guias_linhas (chave)`,
  // p = { chave? } — com a chave (quem não administra), só os pedidos e as linhas da pessoa; sem ela, tudo (admin).
  `create or replace function guias_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'publicada', guias_publicada(),
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'descricao', g.descricao, 'visivel', g.visivel,
           'aberto', guia_pedido_do_grupo(g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'descricao', i.descricao,
                       'fotoV', i.foto_v, 'quantidade', i.quantidade,
                       'valor', i.valor, 'visivel', i.visivel, 'cpj', i.cpj, 'doacao', i.doacao) order by i.criado_em), '[]'::jsonb)
                     from guias_itens i where i.grupo_id = g.id)) order by g.criado_em), '[]'::jsonb)
                  from guias_grupos g),
       'pedidos', (select coalesce(jsonb_agg(jsonb_build_object('numero', pe.numero, 'criadoEm', pe.criado_em, 'encerradoEm', pe.encerrado_em,
           'grupos', (select coalesce(jsonb_agg(jsonb_build_object('grupoId', pg.grupo_id, 'criadoEm', pg.criado_em, 'encerradoEm', pg.encerrado_em)), '[]'::jsonb)
                      from guias_pedido_grupos pg where pg.pedido = pe.numero),
           'linhas', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'itemId', l.item_id, 'grupoId', l.grupo_id, 'descricao', l.descricao, 'valor', l.valor,
                       'quantidade', l.quantidade, 'chave', l.chave, 'nome', l.nome, 'ok', l.ok, 'criadoEm', l.criado_em,
                       'pago', l.pago_em is not null,
                       'pix', case when l.pago_em is not null then null when c.status = 'criando' then 'pendente' else c.status end) order by lower(l.nome), l.criado_em), '[]'::jsonb)
                      from guias_linhas l left join asaas_cobrancas c on c.id = l.cobranca_id
                     where l.pedido = pe.numero and (not (p ? 'chave') or l.chave = p ->> 'chave'))) order by pe.numero desc), '[]'::jsonb)
                   from guias_pedidos pe
                  where not (p ? 'chave') or exists (select 1 from guias_linhas l2 where l2.pedido = pe.numero and l2.chave = p ->> 'chave')))
   $$`,
  // p = { chave, admin? } — a abertura da aba; quem não administra recebe só as próprias linhas.
  `create or replace function guias_tela(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'publicada', e -> 'publicada',
       'ativo', asaas_ativo(),
       'paradas', exists (select 1 from asaas_cobrancas where chave = p ->> 'chave' and status = 'criando' and criado_em < now() - interval '20 seconds'),
       'estado', e,
       'minhas', asaas_minhas(p))
     from (select guias_estado(case when (p ->> 'admin')::boolean then '{}'::jsonb else jsonb_build_object('chave', p ->> 'chave') end) as e) x
   $$`,
  // ================================================== v145: aba Diário
  // Um registro por pessoa e por dia (chave como nas ervas: p:, a:, u:). Os dados do dia vêm limpos do servidor
  // (shared/diario.js normalizarDia); dia sem nada é apagado. Só a própria pessoa lê e grava.
  `create table if not exists diario (
     chave         text not null,
     data          date not null,
     dados         jsonb not null default '{}'::jsonb,
     atualizado_em timestamptz not null default now(),
     primary key (chave, data)
   )`,
  `create or replace function diario_listar(p jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('data', to_char(data, 'YYYY-MM-DD'), 'dados', dados) order by data), '[]'::jsonb)
       from diario where chave = p ->> 'chave'
   $$`,
  `create or replace function diario_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if coalesce(p -> 'dados', '{}'::jsonb) = '{}'::jsonb then
       delete from diario where chave = p ->> 'chave' and data = (p ->> 'data')::date;
     else
       insert into diario (chave, data, dados) values (p ->> 'chave', (p ->> 'data')::date, p -> 'dados')
       on conflict (chave, data) do update set dados = excluded.dados, atualizado_em = now();
     end if;
     return jsonb_build_object('data', p ->> 'data', 'dados', coalesce(p -> 'dados', '{}'::jsonb));
   end;
   $$`,
  `create or replace function diario_publicada(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'diario_publicada'), false))
   $$`,
  `create or replace function diario_publicar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('diario_publicada', case when (p ->> 'publicada')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return diario_publicada();
   end;
   $$`,
  // Cadastro apagado de vez (pessoa, aluno ou usuário): o diário dele vai junto.
  `create or replace function diario_apagar_trg()
   returns trigger language plpgsql as $$
   begin
     delete from diario where chave = tg_argv[0] || old.id::text;
     return old;
   end;
   $$`,
  `drop trigger if exists diario_pessoa_apagada on pessoas`,
  `create trigger diario_pessoa_apagada after delete on pessoas for each row execute function diario_apagar_trg('p:')`,
  `drop trigger if exists diario_aluno_apagado on alunos`,
  `create trigger diario_aluno_apagado after delete on alunos for each row execute function diario_apagar_trg('a:')`,
  `drop trigger if exists diario_usuario_apagado on usuarios`,
  `create trigger diario_usuario_apagado after delete on usuarios for each row execute function diario_apagar_trg('u:')`,
  // ================================================== v146: sub-aba Pedidos (Compras)
  // Cada linha das Compras ganha o andamento (confecção e entrega), que o admin das Compras muda na sub-aba Pedidos.
  // As doações ficam de fora (não têm o que confeccionar).
  `alter table guias_linhas add column if not exists andamento text not null default 'pendente'
     check (andamento in ('pendente', 'em_confeccao', 'falta_materia', 'concluido', 'entregue'))`,
  // p = { id, andamento }
  `create or replace function guia_linha_andamento(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update guias_linhas set andamento = p ->> 'andamento' where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Pedido não encontrado.'; end if;
     return guias_pedidos_andamento();
   end;
   $$`,
  // ================================================== v147: sub-aba Pedidos com a foto do item
  // ================================================== v148: sub-aba Pedidos sem o grupo Axé
  // ================================================== v149: Diário — Galeria de fotos da corrente
  // Uma foto por pessoa (chave p:/a:/u:), guardada no banco (JPEG em base64, reduzida no aparelho) e curtidas.
  // Toda terça-feira (horário de Brasília) as fotos da semana anterior são apagadas: a limpeza roda a cada leitura e
  // envio, então não precisa de agendamento.
  `create table if not exists diario_fotos (
     id        uuid primary key default gen_random_uuid(),
     chave     text not null unique,
     nome      text not null default '',
     descricao text not null default '',
     foto      text not null,
     criado_em timestamptz not null default now()
   )`,
  `create table if not exists diario_curtidas (
     foto_id uuid not null references diario_fotos(id) on delete cascade,
     chave   text not null,
     primary key (foto_id, chave)
   )`,
  // Começo da semana da galeria: a terça-feira mais recente, 0h em Brasília.
  `create or replace function diario_fotos_limpar()
   returns void language sql as $$
     delete from diario_fotos
      where (criado_em at time zone 'America/Sao_Paulo')
            < date_trunc('week', (now() at time zone 'America/Sao_Paulo') - interval '1 day') + interval '1 day'
   $$`,
  // p = { chave } → [{ id, nome, descricao, criadoEm, v, curtidas, curti, minha }] (mais nova primeiro)
  `create or replace function diario_fotos(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     perform diario_fotos_limpar();
     return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'descricao', f.descricao, 'criadoEm', f.criado_em,
              'v', substr(md5(f.foto), 1, 10),
              'curtidas', (select count(*) from diario_curtidas c where c.foto_id = f.id),
              'curti', exists (select 1 from diario_curtidas c where c.foto_id = f.id and c.chave = p ->> 'chave'),
              'minha', f.chave = p ->> 'chave') order by f.criado_em desc)
       from diario_fotos f), '[]'::jsonb);
   end;
   $$`,
  // p = { chave, nome, descricao, foto }
  `create or replace function diario_foto_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     perform diario_fotos_limpar();
     if exists (select 1 from diario_fotos where chave = p ->> 'chave') then
       raise exception 'Você já tem uma foto na galeria: exclua a sua para subir outra.';
     end if;
     insert into diario_fotos (chave, nome, descricao, foto) values (p ->> 'chave', coalesce(p ->> 'nome', ''), coalesce(p ->> 'descricao', ''), p ->> 'foto');
     return diario_fotos(p);
   end;
   $$`,
  // p = { id, chave, admin }: a própria pessoa apaga a sua; o root, qualquer uma.
  `create or replace function diario_foto_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from diario_fotos where id = (p ->> 'id')::uuid and (coalesce((p ->> 'admin')::boolean, false) or chave = p ->> 'chave');
     if not found then raise exception 'Foto não encontrada.'; end if;
     return diario_fotos(p);
   end;
   $$`,
  // p = { id, chave }: curte ou descurte.
  `create or replace function diario_foto_curtir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if not exists (select 1 from diario_fotos where id = (p ->> 'id')::uuid) then raise exception 'Foto não encontrada.'; end if;
     delete from diario_curtidas where foto_id = (p ->> 'id')::uuid and chave = p ->> 'chave';
     if not found then insert into diario_curtidas (foto_id, chave) values ((p ->> 'id')::uuid, p ->> 'chave'); end if;
     return diario_fotos(p);
   end;
   $$`,
  `create or replace function diario_foto(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(foto) from diario_fotos where id = (p ->> 'id')::uuid
   $$`,
  // Cadastro apagado de vez: o diário, a foto da galeria e as curtidas dele vão juntos.
  `create or replace function diario_apagar_trg()
   returns trigger language plpgsql as $$
   begin
     delete from diario where chave = tg_argv[0] || old.id::text;
     delete from diario_fotos where chave = tg_argv[0] || old.id::text;
     delete from diario_curtidas where chave = tg_argv[0] || old.id::text;
     return old;
   end;
   $$`,
  // Orientador do Diário (sugestão de banho no card Banho): o root liga e desliga; sem a chave, fica visível.
  `create or replace function diario_orientador(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(coalesce((select valor = 'true' from sistema where chave = 'diario_orientador'), true))
   $$`,
  `create or replace function diario_orientador_mudar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into sistema (chave, valor) values ('diario_orientador', case when (p ->> 'visivel')::boolean then 'true' else 'false' end)
     on conflict (chave) do update set valor = excluded.valor;
     return diario_orientador();
   end;
   $$`,
  // ================================================== v151: quem entrou em cada aba (bloco do Admin root)
  // Uma linha por pessoa (chave como a do diário: p:, a:, u:), aba e dia; guarda só os últimos 3 dias.
  `create table if not exists visitas_abas (
     chave   text not null,
     aba     text not null,
     dia     date not null,
     nome    text not null default '',
     vezes   integer not null default 1,
     ultima  timestamptz not null default now(),
     primary key (chave, aba, dia)
   )`,
  `create index if not exists visitas_abas_dia on visitas_abas (dia)`,
  // p = { chave, aba, nome }: soma uma entrada de hoje e apaga o que passou dos 3 dias.
  `create or replace function visita_registrar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
   begin
     insert into visitas_abas (chave, aba, dia, nome) values (p ->> 'chave', p ->> 'aba', v_hoje, coalesce(p ->> 'nome', ''))
     on conflict (chave, aba, dia) do update set vezes = visitas_abas.vezes + 1, ultima = now(), nome = excluded.nome;
     delete from visitas_abas where dia < v_hoje - 2;
     return '{}'::jsonb;
   end;
   $$`,
  // Últimos 3 dias, com o nome e o grupo de hoje no cadastro: Corrente CPJ ou Curimba (pessoas), a turma do aluno
  // (ou "Alunos sem turma") e "Outros" (usuário sem cadastro).
  `create or replace function visitas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
         'chave', v.chave, 'aba', v.aba, 'dia', v.dia, 'vezes', v.vezes, 'ultima', v.ultima,
         'nome', coalesce(pe.nome, al.nome, nullif(v.nome, ''), 'Sem nome'),
         'grupo', case when pe.id is not null then case when pe.funcao = 'curimba' then 'Curimba' else 'Corrente CPJ' end
                       when al.id is not null then coalesce(t.nome, 'Alunos sem turma')
                       else 'Outros' end
       ) order by v.ultima desc), '[]'::jsonb)
     from visitas_abas v
     left join pessoas pe on v.chave like 'p:%' and pe.id::text = substr(v.chave, 3)
     left join alunos al on v.chave like 'a:%' and al.id::text = substr(v.chave, 3)
     left join turmas_alunos t on t.id = al.turma_id
     where v.dia >= (now() at time zone 'America/Sao_Paulo')::date - 2
   $$`,

  // ================================================== v152: galeria do Diário mais leve
  // A versão da foto (v) era um md5 da foto inteira, calculado a cada listagem: o banco lia todas as fotos.
  // Agora é uma coluna gerada, calculada só quando a foto é gravada (o mesmo valor de antes: os links não mudam).
  `alter table diario_fotos add column if not exists foto_v text generated always as (substr(md5(foto), 1, 10)) stored`,
  `create or replace function diario_fotos(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     perform diario_fotos_limpar();
     return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'descricao', f.descricao, 'criadoEm', f.criado_em,
              'v', f.foto_v,
              'curtidas', (select count(*) from diario_curtidas c where c.foto_id = f.id),
              'curti', exists (select 1 from diario_curtidas c where c.foto_id = f.id and c.chave = p ->> 'chave'),
              'minha', f.chave = p ->> 'chave') order by f.criado_em desc)
       from diario_fotos f), '[]'::jsonb);
   end;
   $$`,
  // Sub-aba Pedidos (Compras): a mesma coisa, com a coluna que as Compras já têm desde a v144 (aqui tinha ficado o md5).
  `create or replace function guias_pedidos_andamento(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'pedido', l.pedido, 'descricao', l.descricao, 'quantidade', l.quantidade,
              'valor', l.valor::float8, 'chave', l.chave, 'nome', l.nome, 'pago', l.pago_em is not null, 'andamento', l.andamento, 'criadoEm', l.criado_em,
              'itemId', l.item_id, 'fotoV', i.foto_v,
              'grupoId', l.grupo_id, 'grupo', g.descricao)
              order by l.criado_em, lower(l.nome)), '[]'::jsonb)
       from guias_linhas l
       left join guias_itens i on i.id = l.item_id
       left join guias_grupos g on g.id = l.grupo_id
      where not coalesce(i.doacao, false)
        and translate(lower(btrim(coalesce(g.descricao, ''))), 'áàâãéêíóôõúç', 'aaaaeeiooouc') <> 'axe'
   $$`,

  // ================================================== v153: versão dos dados só muda quando algo muda de fato
  // A volta ao app quase nunca dava "sem mudança" e baixava tudo de novo (o banco montava todas as giras), por dois motivos:
  // 1) a leitura dos atrasos do ASAAS grava a hora em sistema ('asaas2_atualizado') até a cada 10 min, e sistema tem o
  //    gatilho da versão: agora essa chave não conta (os atrasos nem vão na abertura);
  // 2) a versão levava a hora, só por causa das orações que vencem: agora leva o dia e quantas orações já venceram
  //    (muda quando uma vence e de novo quando ela é apagada na leitura).
  `create or replace function versao_dados_subir()
   returns trigger language plpgsql as $$
   begin
     if tg_table_name = 'sistema' then
       if coalesce(new.chave, old.chave) = 'asaas2_atualizado' then return null; end if;
     end if;
     perform nextval('versao_dados_seq');
     return null;
   end;
   $$`,
  `create or replace function versao_dados()
   returns text language sql volatile as $$
     select (select last_value from versao_dados_seq)::text
         || '-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD')
         || '-' || (select count(*) from oracoes where now() >= oracao_expira(criado_em))::text;
   $$`,

  // ================================================== v154: foto das pessoas com versão
  // A foto pequena do "Você nesta gira" e do Perfil vinha do banco a cada abertura do app, uma ida por pessoa.
  // Agora a lista de pessoas leva a versão (fotoV, coluna gerada como nas Compras; nula = sem foto, nem busca) e o
  // endereço com ?v= fica guardado no aparelho. Trocar a foto sobe a versão dos dados, para a lista nova chegar.
  `alter table pessoas_fotos add column if not exists foto_v text generated always as (substr(md5(foto), 1, 10)) stored`,
  `drop trigger if exists versao_dados on pessoas_fotos`,
  `create trigger versao_dados after insert or update or delete on pessoas_fotos for each row execute function versao_dados_subir()`,

  // ================================================== v155: item "de todos" na oferenda por pessoa e o grupo Oferenda
  // 1) Na oferenda com uma linha por pessoa, o admin pode dar um item a Todos: cada pessoa da lista fica responsável por
  //    ele (sem quantidade por pessoa; o item é compartilhado). O item de todos conta como completo e não recebe doação.
  `alter table oferenda_itens add column if not exists todos boolean not null default false`,
  `create or replace function oferenda_conferir_completa(v_of uuid)
   returns void language plpgsql as $$
   declare v_completa boolean;
   begin
     select exists (select 1 from oferenda_itens i where i.oferenda_id = v_of)
        and not exists (select 1 from oferenda_itens i where i.oferenda_id = v_of and not i.todos
                        and i.quantidade > coalesce((select sum(d.quantidade) from oferenda_doacoes d where d.item_id = i.id), 0))
       into v_completa;
     update oferendas set completa_em = case
         when completa_em is not null and completa_em <= now() - interval '1 day' then completa_em
         when v_completa then coalesce(completa_em, now())
         else null end
     where id = v_of;
   end;
   $$`,
  `drop trigger if exists oferenda_itens_completa on oferenda_itens`,
  `create trigger oferenda_itens_completa after insert or update of quantidade, todos or delete on oferenda_itens
   for each row execute function oferenda_completa_trg()`,
  // p = { id, todos }. Todos apaga as doações do item (ele passa a ser de cada pessoa da lista).
  `create or replace function oferenda_item_todos(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_todos boolean := coalesce((p ->> 'todos')::boolean, false);
   begin
     if v_todos and not exists (select 1 from oferenda_itens i join oferendas o on o.id = i.oferenda_id
                                 where i.id = (p ->> 'id')::uuid and o.por_medium) then
       raise exception 'Todos só vale na oferenda com uma linha por pessoa.';
     end if;
     if v_todos then delete from oferenda_doacoes where item_id = (p ->> 'id')::uuid; end if;
     update oferenda_itens set todos = v_todos where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Item não encontrado.'; end if;
     return oferendas_estado();
   end;
   $$`,
  // Item de todos não recebe doação (nem pelo admin): para escolher uma pessoa, tire o Todos antes.
  `create or replace function oferenda_doar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_item uuid := (p ->> 'itemId')::uuid;
     v_chave text := p ->> 'chave';
     v_qtd numeric := (p ->> 'quantidade')::numeric;
     v_total numeric; v_entregue boolean; v_outros numeric; v_todos boolean;
     v_completa timestamptz; v_resp uuid;
   begin
     select quantidade, entregue, todos into v_total, v_entregue, v_todos from oferenda_itens where id = v_item for update;
     if not found then raise exception 'Item não encontrado.'; end if;
     if v_todos and v_qtd > 0 then raise exception 'Este item é de todos da lista.'; end if;
     if not coalesce((p ->> 'forcar')::boolean, false)
        and (select o.status from oferendas o join oferenda_itens i on i.oferenda_id = o.id where i.id = v_item) <> 'publicado' then
       raise exception 'Esta oferenda não está aberta para doações.';
     end if;
     if v_entregue and not coalesce((p ->> 'forcar')::boolean, false) then raise exception 'Este item já foi entregue.'; end if;
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
  // 2) Grupo Oferenda: quem se cadastrou pelo login e o admin pôs no grupo Oferenda (turma escondida, como Consulentes).
  //    Vê só a Geral e a aba Oferendas, não escolhe nada; o admin o põe nas oferendas. Fica fora das listas de alunos,
  //    dos grupos "Alunos"/"Alunos sem turma" das oferendas, da Iemanjá e do Amaci.
  `create or replace function turma_oferenda()
   returns uuid language plpgsql as $$
   declare v uuid;
   begin
     select t.id into v from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_oferenda';
     if v is null then
       select id into v from turmas_alunos where lower(btrim(nome)) = 'grupo oferenda';
       if v is null then insert into turmas_alunos (nome) values ('Grupo Oferenda') returning id into v; end if;
       insert into sistema (chave, valor) values ('turma_oferenda', v::text)
       on conflict (chave) do update set valor = excluded.valor;
     end if;
     return v;
   end;
   $$`,
  `select turma_oferenda()`,
  `create or replace function turma_oferenda_id()
   returns uuid language sql stable as $$
     select t.id from sistema s join turmas_alunos t on t.id::text = s.valor where s.chave = 'turma_oferenda'
   $$`,
  `create or replace function aluno_no_grupo(t uuid, g text[])
   returns boolean language sql stable as $$
     select coalesce((t is not null and ('turma:' || t::text) = any(g))
       or (t is distinct from turma_consulentes_id() and t is distinct from turma_oferenda_id()
           and ('alunos' = any(g) or (t is null and 'alunos:sem' = any(g)))), false)
   $$`,
  `create or replace function cadastros_login(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'turmaConsulentes', turma_consulentes_id(),
       'turmaOferenda', turma_oferenda_id(),
       'novos', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'em', a.autocadastro_em,
                   'celular', coalesce(a.perfil -> 'info' ->> 'celular', ''), 'email', coalesce(a.perfil -> 'info' ->> 'email', ''))
                   order by a.autocadastro_em desc)
                 from alunos a where a.saida is null and a.autocadastro_em is not null and a.turma_id is null), '[]'::jsonb),
       'consulentes', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'em', a.autocadastro_em,
                   'celular', coalesce(a.perfil -> 'info' ->> 'celular', ''), 'email', coalesce(a.perfil -> 'info' ->> 'email', ''))
                   order by lower(a.nome))
                 from alunos a where a.saida is null and a.turma_id = (select turma_consulentes_id())), '[]'::jsonb),
       'oferenda', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'em', a.autocadastro_em,
                   'celular', coalesce(a.perfil -> 'info' ->> 'celular', ''), 'email', coalesce(a.perfil -> 'info' ->> 'email', ''))
                   order by lower(a.nome))
                 from alunos a where a.saida is null and a.turma_id = (select turma_oferenda_id())), '[]'::jsonb))
   $$`,
  `create or replace function amaci_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'publicada', amaci_publicada(),
       'turmas', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'nome', t.nome, 'orixas', coalesce(a.orixas, '[]'::jsonb)) order by lower(t.nome))
                           from turmas_alunos t left join amaci_turmas a on a.turma_id = t.id
                          where t.id is distinct from (select turma_oferenda_id())
                            and (t.id is distinct from (select turma_consulentes_id())
                                 or coalesce((select (abas -> 'amaci' ->> 'ver')::boolean or (abas -> 'amaci' ->> 'editar')::boolean
                                              from perfis where chave = 'consulente'), false))), '[]'::jsonb),
       'orientacoes', coalesce((select jsonb_object_agg(o.orixa, o.texto) from amaci_orientacoes o where o.texto <> ''), '{}'::jsonb))
   $$`,
  // A lista do grupo Oferenda vai à parte (grupoOferenda), para o admin das oferendas pôr essas pessoas numa oferenda.
  `create or replace function alunos_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'turmas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by lower(nome)) from turmas_alunos
                           where id is distinct from (select turma_consulentes_id()) and id is distinct from (select turma_oferenda_id())), '[]'::jsonb),
       'alunos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'turmaId', turma_id, 'bloqueado', bloqueado) order by lower(nome)) from alunos
                           where saida is null and turma_id is distinct from (select turma_consulentes_id()) and turma_id is distinct from (select turma_oferenda_id())), '[]'::jsonb),
       'grupoOferenda', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by lower(nome)) from alunos
                           where saida is null and turma_id = (select turma_oferenda_id())), '[]'::jsonb))
   $$`,
  `create or replace function aluno_acesso(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', a.id, 'nome', a.nome, 'turmaId', a.turma_id, 'temSenha', a.pin_hash is not null, 'pinVersao', a.pin_versao,
                               'consulente', a.turma_id is not distinct from turma_consulentes_id() and a.turma_id is not null,
                               'grupoOferenda', a.turma_id is not distinct from turma_oferenda_id() and a.turma_id is not null,
                               'abasConsulente', (select abas from perfis where chave = 'consulente'), 'bloqueado', a.bloqueado)
     from alunos a where a.id = (p ->> 'id')::uuid and a.saida is null
   $$`,
  // ================================================== v156: responsável Todos no cadastro e na edição do item
  // p.todos (opcional, só na oferenda com uma linha por pessoa): true deixa o item de todos da lista (as doações saem),
  // false volta à escolha por pessoa; sem p.todos, o item fica como está. Tudo numa ida só ao banco.
  `create or replace function oferenda_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_doado numeric;
     v_id uuid := nullif(p ->> 'id', '')::uuid;
     v_todos boolean := (p ->> 'todos')::boolean;
   begin
     if v_todos and not exists (select 1 from oferendas o
                                 where o.por_medium and o.id = coalesce(nullif(p ->> 'oferendaId', '')::uuid,
                                                                       (select oferenda_id from oferenda_itens where id = v_id))) then
       raise exception 'Todos só vale na oferenda com uma linha por pessoa.';
     end if;
     if v_id is null then
       insert into oferenda_itens (oferenda_id, nome, quantidade, unidade, entrega, todos)
       values ((p ->> 'oferendaId')::uuid, btrim(p ->> 'nome'), (p ->> 'quantidade')::numeric, coalesce(p ->> 'unidade', ''),
               nullif(p ->> 'entrega', '')::date, coalesce(v_todos, false));
     else
       if v_todos then delete from oferenda_doacoes where item_id = v_id; end if;
       select coalesce(sum(quantidade), 0) into v_doado from oferenda_doacoes where item_id = v_id;
       if (p ->> 'quantidade')::numeric < v_doado then
         raise exception 'Já foram prometidos % deste item; a quantidade não pode ser menor.', v_doado;
       end if;
       update oferenda_itens set nome = btrim(p ->> 'nome'), quantidade = (p ->> 'quantidade')::numeric,
              unidade = coalesce(p ->> 'unidade', ''), entrega = nullif(p ->> 'entrega', '')::date,
              todos = coalesce(v_todos, todos)
       where id = v_id;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return oferendas_estado();
   end;
   $$`,
  // Iemanjá: o mesmo responsável Todos, valendo para cada pessoa do grupo (oferenda) do item.
  `alter table iemanja_itens add column if not exists todos boolean not null default false`,
  // Itens com o campo todos (igual à v104).
  `create or replace function iemanja_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', e.id, 'nome', e.nome, 'data', e.data, 'visivel', e.visivel, 'sorteado', e.sorteado, 'encerradoEm', e.encerrado_em, 'fora', to_jsonb(e.fora), 'listas', to_jsonb(e.listas), 'categorias', to_jsonb(e.categorias),
       'detalhes', e.detalhes,
       'grupos', (select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'ordem', g.ordem, 'nome', g.nome, 'responsavelId', g.responsavel_id,
           'responsavel', case when e.encerrado_em is not null then g.responsavel_nome
                               else (select pe.nome from pessoas pe where pe.id = g.responsavel_id) end,
           'membros', (select coalesce(jsonb_agg(jsonb_build_object('chave', m.chave, 'nome', m.nome, 'fixo', m.fixo,
               'lista', case when m.chave like 'a:%'
                               then coalesce((select t.nome from alunos a join turmas_alunos t on t.id = a.turma_id where a.id::text = substr(m.chave, 3)), 'Alunos sem turma')
                             when (select pe.funcao from pessoas pe where pe.id::text = substr(m.chave, 3)) = 'curimba' then 'Curimba'
                             else 'Corrente' end) order by lower(m.nome)), '[]'::jsonb)
                       from iemanja_membros m where m.grupo_id = g.id),
           'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'quantidade', i.quantidade, 'unidade', i.unidade, 'entrega', i.entrega, 'entregue', i.entregue, 'todos', i.todos,
               'doacoes', (select coalesce(jsonb_agg(jsonb_build_object('chave', d.chave, 'nome', d.nome, 'quantidade', d.quantidade) order by lower(d.nome)), '[]'::jsonb)
                           from iemanja_doacoes d where d.item_id = i.id)) order by i.criado_em), '[]'::jsonb)
                     from iemanja_itens i where i.grupo_id = g.id)
         ) order by g.ordem), '[]'::jsonb) from iemanja_grupos g where g.evento_id = e.id)
     ) order by (e.encerrado_em is not null), e.encerrado_em desc nulls first, e.data desc), '[]'::jsonb)
     from iemanja_eventos e
   $$`,
  `create or replace function iemanja_item_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_doado numeric;
     v_id uuid := nullif(p ->> 'id', '')::uuid;
     v_todos boolean := (p ->> 'todos')::boolean;
   begin
     if v_id is null then
       insert into iemanja_itens (grupo_id, nome, categoria, quantidade, unidade, entrega, todos)
       values ((p ->> 'grupoId')::uuid, p ->> 'nome', coalesce(p ->> 'categoria', ''), (p ->> 'quantidade')::numeric, coalesce(p ->> 'unidade', ''),
               nullif(p ->> 'entrega', '')::date, coalesce(v_todos, false));
     else
       if v_todos then delete from iemanja_doacoes where item_id = v_id; end if;
       select coalesce(sum(quantidade), 0) into v_doado from iemanja_doacoes where item_id = v_id;
       if (p ->> 'quantidade')::numeric < v_doado then
         raise exception 'Já foram assumidos % deste item; a quantidade não pode ser menor.', v_doado;
       end if;
       update iemanja_itens set nome = p ->> 'nome', categoria = coalesce(p ->> 'categoria', ''), quantidade = (p ->> 'quantidade')::numeric,
                                unidade = coalesce(p ->> 'unidade', ''), entrega = nullif(p ->> 'entrega', '')::date, todos = coalesce(v_todos, todos)
       where id = v_id;
       if not found then raise exception 'Item não encontrado.'; end if;
     end if;
     return iemanja_estado();
   end;
   $$`,
  // p = { id, todos }. Todos apaga quem tinha assumido o item.
  `create or replace function iemanja_item_todos(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_todos boolean := coalesce((p ->> 'todos')::boolean, false);
   begin
     if v_todos then delete from iemanja_doacoes where item_id = (p ->> 'id')::uuid; end if;
     update iemanja_itens set todos = v_todos where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Item não encontrado.'; end if;
     return iemanja_estado();
   end;
   $$`,
  // Item de todos do grupo não é assumido por ninguém (nem pelo admin): tire o Todos antes.
  `create or replace function iemanja_assumir(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_item uuid := (p ->> 'itemId')::uuid;
     v_chave text := p ->> 'chave';
     v_qtd numeric := (p ->> 'quantidade')::numeric;
     v_pedido numeric; v_todos boolean;
   begin
     select quantidade, todos into v_pedido, v_todos from iemanja_itens where id = v_item for update;
     if v_todos and v_qtd > 0 then raise exception 'Este item é de todos do grupo.'; end if;
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
  // ================================================== v157: quem gera link com cartão de crédito (aba ASAAS)
  // Lista de pessoas (corrente ou aluno, pela chave p:/a:) que, nas Compras (conta A), geram a cobrança com a forma
  // "cliente escolhe" do ASAAS (UNDEFINED): na fatura, Pix ou cartão de crédito (e o que mais estiver ligado na conta).
  // Os outros continuam só com Pix; doação (conta B) é sempre Pix. forma guarda como a cobrança foi gerada.
  `create table if not exists asaas_credito (
     chave  text primary key,
     nome   text not null default '',
     por    text not null default '',
     em     timestamptz not null default now()
   )`,
  `alter table asaas_cobrancas add column if not exists forma text not null default 'PIX'`,
  // p = { chave, por } inclui (a pessoa ativa da corrente ou o aluno ativo; o nome vem do cadastro); { chave, remover: true } tira.
  `create or replace function asaas_credito_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_nome text;
   begin
     if coalesce((p ->> 'remover')::boolean, false) then
       delete from asaas_credito where chave = p ->> 'chave';
       return jsonb_build_object('ok', true);
     end if;
     select nome into v_nome from pessoas where 'p:' || id::text = p ->> 'chave' and saida is null;
     if v_nome is null then select nome into v_nome from alunos where 'a:' || id::text = p ->> 'chave' and saida is null; end if;
     if v_nome is null then raise exception 'Pessoa não encontrada no cadastro.'; end if;
     insert into asaas_credito (chave, nome, por) values (p ->> 'chave', v_nome, coalesce(p ->> 'por', ''))
     on conflict (chave) do nothing;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  `create or replace function asaas_cobranca_criada(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update asaas_cobrancas set status = 'pendente', asaas_id = p ->> 'asaasId', link = p ->> 'link',
       pix_payload = p ->> 'payload', pix_imagem = p ->> 'imagem', vencimento = nullif(p ->> 'vencimento', '')::date,
       forma = coalesce(nullif(p ->> 'forma', ''), forma)
      where id = (p ->> 'id')::uuid and status = 'criando';
     return jsonb_build_object('ok', true);
   end;
   $$`,
  // ================================================== v158: cobrança cancelada cancela os itens dela
  // O Cancelar da aba ASAAS (ou a exclusão no painel do ASAAS) cancelava só o link: os itens continuavam pedidos e a
  // pessoa via "Gerar link de pagamento" no Falta pagar. Agora os itens não pagos da cobrança saem do pedido (como no ✕
  // do Painel) e o estoque volta. A cobrança guarda o que tinha (itens e grupos) para continuar legível na aba ASAAS.
  `alter table asaas_cobrancas add column if not exists itens_cancelados jsonb`,
  `alter table asaas_cobrancas add column if not exists grupos_cancelados jsonb`,
  `create or replace function asaas_cobranca_cancelar_itens(p_id uuid)
   returns void language plpgsql as $$
   begin
     update asaas_cobrancas c set
       itens_cancelados = coalesce(c.itens_cancelados, (select jsonb_agg(l.quantidade || 'x ' || l.descricao order by l.criado_em)
                                                         from guias_linhas l where l.cobranca_id = p_id and l.pago_em is null)),
       grupos_cancelados = coalesce(c.grupos_cancelados, (select jsonb_agg(distinct g.descricao) from guias_linhas l join guias_grupos g on g.id = l.grupo_id
                                                           where l.cobranca_id = p_id and l.pago_em is null))
      where c.id = p_id;
     update guias_itens i set quantidade = i.quantidade + x.q
       from (select item_id, sum(quantidade) as q from guias_linhas where cobranca_id = p_id and pago_em is null and item_id is not null group by item_id) x
      where i.id = x.item_id;
     delete from guias_linhas where cobranca_id = p_id and pago_em is null;
   end;
   $$`,
  `create or replace function asaas_cobranca_cancelar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update asaas_cobrancas set status = 'cancelada', pix_payload = null, pix_imagem = null where id = (p ->> 'id')::uuid and status = 'pendente';
     if found then perform asaas_cobranca_cancelar_itens((p ->> 'id')::uuid); end if;
     return jsonb_build_object('ok', true);
   end;
   $$`,
  `create or replace function asaas_evento_processar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_c asaas_cobrancas%rowtype;
     v_res text;
     v_n int;
   begin
     insert into asaas_eventos (id, evento, dados) values (p ->> 'id', p ->> 'evento', coalesce(p -> 'dados', '{}'::jsonb))
     on conflict (id) do nothing;
     if not found then return jsonb_build_object('repetido', true); end if;
     delete from asaas_eventos where recebido_em < now() - interval '180 days';
     select * into v_c from asaas_cobrancas where asaas_id = p ->> 'paymentId' for update;
     -- Reserva que ainda não recebeu a resposta do ASAAS (ele demorou): é a mesma cobrança, pela referência.
     if not found and p ->> 'paymentId' is not null and coalesce(p ->> 'referencia', '') ~ '^[0-9a-f-]{36}$' then
       update asaas_cobrancas set status = 'pendente', asaas_id = p ->> 'paymentId', link = p -> 'dados' -> 'payment' ->> 'invoiceUrl',
         vencimento = nullif(p -> 'dados' -> 'payment' ->> 'dueDate', '')::date
        where id = (p ->> 'referencia')::uuid and status = 'criando';
       select * into v_c from asaas_cobrancas where asaas_id = p ->> 'paymentId' for update;
     end if;
     if not found then
       v_res := 'ignorado (cobrança que não é do app)';
     elsif p ->> 'evento' in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
       if p -> 'conferido' is null then
         v_res := 'não conferido (sem ASAAS_API_KEY)';
       elsif coalesce(p -> 'conferido' ->> 'status', '') not in ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH') then
         v_res := 'não liberado: no ASAAS está ' || coalesce(p -> 'conferido' ->> 'status', '?');
       elsif (p -> 'conferido' ->> 'valor')::numeric is distinct from v_c.valor then
         v_res := 'não liberado: valor diferente (' || coalesce(p -> 'conferido' ->> 'valor', '?') || ')';
       elsif v_c.status = 'paga' then
         v_res := 'já estava paga';
       else
         update asaas_cobrancas set status = 'paga', pago_em = now(), pix_payload = null, pix_imagem = null where id = v_c.id;
         update guias_linhas set pago_em = now() where cobranca_id = v_c.id and pago_em is null;
         get diagnostics v_n = row_count;
         v_res := case when v_n > 0 then 'paga' else 'paga, mas os itens não estão mais nesta cobrança: conferir' end;
       end if;
     elsif p ->> 'evento' = 'PAYMENT_OVERDUE' then
       update asaas_cobrancas set status = 'vencida', pix_payload = null, pix_imagem = null where id = v_c.id and status = 'pendente';
       v_res := 'vencida';
     elsif p ->> 'evento' = 'PAYMENT_DELETED' then
       update asaas_cobrancas set status = 'cancelada', pix_payload = null, pix_imagem = null where id = v_c.id and status in ('pendente', 'vencida');
       -- Excluída no painel do ASAAS: os itens também saem (o Cancelar do app já fez isso antes do aviso chegar).
       if found then perform asaas_cobranca_cancelar_itens(v_c.id); end if;
       v_res := 'cancelada';
     elsif p ->> 'evento' in ('PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED') then
       update asaas_cobrancas set status = 'estornada' where id = v_c.id;
       update guias_linhas set pago_em = null where cobranca_id = v_c.id;
       v_res := 'estornada';
     else
       v_res := 'só registrado';
     end if;
     update asaas_eventos set cobranca_id = v_c.id, resultado = v_res where id = p ->> 'id';
     return jsonb_build_object('ok', true, 'resultado', v_res);
   end;
   $$`,
  `create or replace function asaas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'ativo', asaas_ativo(),
       -- Quem gera link com cartão de crédito e Pix (conta A), com o CPF cifrado para a API mostrar só o final.
       'credito', coalesce((select jsonb_agg(jsonb_build_object('chave', k.chave, 'nome', coalesce(pe.nome, al.nome, k.nome),
                       'aluno', k.chave like 'a:%', 'em', k.em, 'por', k.por,
                       'cifrado', case when pe.id is not null then (select pc.cifrado from pessoas_cpf pc where pc.pessoa_id = pe.id)
                                       else (select ac.cifrado from alunos_cpf ac where ac.aluno_id = al.id) end) order by lower(coalesce(pe.nome, al.nome, k.nome)))
                   from asaas_credito k
                   left join pessoas pe on k.chave = 'p:' || pe.id::text and pe.saida is null
                   left join alunos al on k.chave = 'a:' || al.id::text and al.saida is null), '[]'::jsonb),
       -- Para escolher no cadastro: a corrente e os alunos (sem os grupos escondidos), quem ainda não está na lista.
       'candidatos', coalesce((select jsonb_agg(x.j order by x.grupo, lower(x.nome)) from (
           select 1 as grupo, pe.nome, jsonb_build_object('chave', 'p:' || pe.id::text, 'nome', pe.nome, 'aluno', false) as j
             from pessoas pe where pe.saida is null and not exists (select 1 from asaas_credito k where k.chave = 'p:' || pe.id::text)
           union all
           select 2, al.nome, jsonb_build_object('chave', 'a:' || al.id::text, 'nome', al.nome, 'aluno', true)
             from alunos al where al.saida is null and al.turma_id is distinct from (select turma_consulentes_id())
              and al.turma_id is distinct from (select turma_oferenda_id())
              and not exists (select 1 from asaas_credito k where k.chave = 'a:' || al.id::text)) x), '[]'::jsonb),
       'cobrancas', coalesce((select jsonb_agg(x.j order by x.criado_em desc) from (
           select c.criado_em, jsonb_build_object('id', c.id, 'conta', c.conta, 'nome', c.nome, 'pedido', c.pedido, 'valor', c.valor, 'status', c.status, 'forma', c.forma,
                    'asaasId', c.asaas_id, 'link', c.link, 'vencimento', c.vencimento, 'criadoEm', c.criado_em, 'pagoEm', c.pago_em,
                    'grupos', coalesce((select jsonb_agg(distinct g.descricao) from guias_linhas l join guias_grupos g on g.id = l.grupo_id where l.cobranca_id = c.id), c.grupos_cancelados, '[]'::jsonb),
                    'itens', coalesce((select jsonb_agg(l.quantidade || 'x ' || l.descricao order by l.criado_em) from guias_linhas l where l.cobranca_id = c.id), c.itens_cancelados, '[]'::jsonb)) as j
             from asaas_cobrancas c where c.status <> 'criando' order by c.criado_em desc limit 100) x), '[]'::jsonb),
       'eventos', coalesce((select jsonb_agg(x.j order by x.recebido_em desc) from (
           select e.recebido_em, jsonb_build_object('id', e.id, 'evento', e.evento, 'recebidoEm', e.recebido_em, 'resultado', e.resultado,
                    'paymentId', e.dados -> 'payment' ->> 'id', 'valor', e.dados -> 'payment' ->> 'value',
                    'status', e.dados -> 'payment' ->> 'status', 'descricao', e.dados -> 'payment' ->> 'description',
                    'nome', c.nome, 'pedido', c.pedido, 'conta', c.conta,
                    'itens', coalesce((select jsonb_agg(l.quantidade || 'x ' || l.descricao order by l.criado_em) from guias_linhas l where l.cobranca_id = c.id), c.itens_cancelados, '[]'::jsonb)) as j
             from asaas_eventos e left join asaas_cobrancas c on c.id = e.cobranca_id order by e.recebido_em desc limit 50) x), '[]'::jsonb))
   $$`,
  `create or replace function asaas_minhas(p jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'cliente', (select cliente_id from asaas_clientes where chave = p ->> 'chave' and conta = 'A'),
       'clienteB', (select cliente_id from asaas_clientes where chave = p ->> 'chave' and conta = 'B'),
       'credito', exists (select 1 from asaas_credito where chave = p ->> 'chave'),
       'cobrancas', coalesce((select jsonb_agg(x.j order by x.ordem) from (
           select row_number() over (order by (c.status = 'pendente') desc, c.criado_em desc) as ordem,
                  jsonb_build_object('id', c.id, 'conta', c.conta, 'pedido', c.pedido, 'valor', c.valor, 'status', c.status, 'link', c.link, 'forma', c.forma,
                    'pixPayload', case when c.status = 'pendente' then c.pix_payload end,
                    'pixImagem', case when c.status = 'pendente' then c.pix_imagem end,
                    'vencimento', c.vencimento, 'criadoEm', c.criado_em, 'pagoEm', c.pago_em,
                    'itens', coalesce((select jsonb_agg(l.quantidade || 'x ' || l.descricao order by l.criado_em) from guias_linhas l where l.cobranca_id = c.id), c.itens_cancelados, '[]'::jsonb)) as j
             from asaas_cobrancas c where c.chave = p ->> 'chave' and c.status <> 'criando'
            order by (c.status = 'pendente') desc, c.criado_em desc limit 10) x), '[]'::jsonb))
   $$`,
  // As que já tinham sido canceladas: os itens que ficaram sem link (a pessoa não gerou outro) saem uma vez só.
  `do $$
   begin
     if not exists (select 1 from sistema where chave = 'v158_cancelados') then
       perform asaas_cobranca_cancelar_itens(c.id) from asaas_cobrancas c where c.status = 'cancelada';
       insert into sistema (chave, valor) values ('v158_cancelados', 'ok');
     end if;
   end $$`,

  // ================================================== v159: menos idas ao banco (sessão junto com os dados; ações da gira)
  // Ações da gira (publicar, travar, recado, cancelarSorteio, mudarData) com as conferências aqui: uma ida em vez de
  // ler a gira e depois gravar. O erro leva o status da resposta no código (SM404 → 404, SM409 → 409; api/_lib/http.js).
  // Os textos são os que a rota mostrava antes (api/giras/[data]/index.js).
  `create or replace function gira_acao(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_data date := (p ->> 'data')::date;
     v_acao text := p ->> 'acao';
     g giras%rowtype;
     v_escala boolean;
     v_encerrada constant text := 'Esta gira está encerrada. Toque em Reabrir para alterar.';
     v_publicada constant text := 'A escala já foi publicada. Para mudar isso, oculte a escala antes.';
   begin
     select * into g from giras where data = v_data for update;
     if not found then raise exception using errcode = 'SM404', message = 'Gira não encontrada.'; end if;
     v_escala := exists (select 1 from duplas where gira_data = v_data);
     if v_acao = 'publicar' then
       if g.evento then raise exception using errcode = 'SM409', message = 'Evento não tem escala para publicar.'; end if;
       return gira_publicar(jsonb_build_object('data', v_data, 'publicada', coalesce((p ->> 'publicada')::boolean, true)));
     end if;
     if g.encerrada then raise exception using errcode = 'SM409', message = v_encerrada; end if;
     if v_acao = 'travar' then
       if g.evento and coalesce((p ->> 'travada')::boolean, false) then
         raise exception using errcode = 'SM409', message = 'Evento não tem escala para travar.';
       end if;
       return gira_travar(jsonb_build_object('data', v_data, 'travada', coalesce((p ->> 'travada')::boolean, false)));
     elsif v_acao = 'recado' then
       return gira_recado(jsonb_build_object('data', v_data, 'recado', coalesce(p ->> 'recado', '')));
     elsif v_acao = 'cancelarSorteio' then
       if g.evento then raise exception using errcode = 'SM409', message = 'Evento não tem escala para cancelar.'; end if;
       if not v_escala then raise exception using errcode = 'SM409', message = 'Não há sorteio para cancelar.'; end if;
       if coalesce(g.publicada, false) then raise exception using errcode = 'SM409', message = v_publicada; end if;
       perform gira_publicar(jsonb_build_object('data', v_data, 'publicada', false));
       perform gira_travar(jsonb_build_object('data', v_data, 'travada', false));
       return gira_salvar(jsonb_build_object('data', v_data, 'usuario', p -> 'usuario', 'pares', '[]'::jsonb, 'passes', '[]'::jsonb));
     elsif v_acao = 'mudarData' then
       if coalesce(g.publicada, false) and v_escala then raise exception using errcode = 'SM409', message = v_publicada; end if;
       if (p ->> 'para')::date = v_data then return gira_json(v_data); end if;
       if exists (select 1 from giras where data = (p ->> 'para')::date) then
         raise exception using errcode = 'SM409', message = 'Já existe uma gira nesta data. Escolha outro dia.';
       end if;
       return gira_mudar_data(jsonb_build_object('data', v_data, 'para', p ->> 'para'));
     end if;
     raise exception 'Ação inválida.';
   end;
   $$`,

  // ================================================== v160: menos idas e menos dados lidos (visitas, uma pessoa, doar)
  // As abas abertas que pegam carona na abertura do app: uma chamada para todas, em vez de uma por aba.
  `create or replace function visitas_registrar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
   begin
     insert into visitas_abas (chave, aba, dia, nome)
     select p ->> 'chave', a, v_hoje, coalesce(p ->> 'nome', '')
       from (select distinct jsonb_array_elements_text(coalesce(p -> 'abas', '[]'::jsonb)) as a) x
     on conflict (chave, aba, dia) do update set vezes = visitas_abas.vezes + 1, ultima = now(), nome = excluded.nome;
     delete from visitas_abas where dia < v_hoje - 2;
     return '{}'::jsonb;
   end;
   $$`,
  // Igual à v154, com { id } para ler uma pessoa só (quem procurava uma pessoa lia a corrente inteira).
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
                   then substring(pe.perfil -> 'info' ->> 'nascimento' from 6 for 5) end as aniversario,
              (select f.foto_v from pessoas_fotos f where f.pessoa_id = pe.id) as "fotoV"
       from pessoas pe
       where (pe.saida is null or coalesce((p ->> 'todas')::boolean, false))
         and (nullif(p ->> 'id', '') is null or pe.id = (p ->> 'id')::uuid)
     ) x;
   $$`,
  // Sub-aba da oferenda de um item: o doar de quem não administra confere se ela está visível sem ler todas as oferendas.
  `create or replace function oferenda_item_aba(p jsonb)
   returns jsonb language sql stable as $$
     select to_jsonb(o.aba_id) from oferenda_itens i join oferendas o on o.id = i.oferenda_id where i.id = (p ->> 'itemId')::uuid;
   $$`,

  // ================================================== v161: menos dados guardados e lidos (QR do Pix, oferendas, giras)
  // A imagem do QR do Pix só aparece enquanto a cobrança aguarda pagamento: paga, vencida, cancelada ou estornada,
  // o banco apaga a imagem (o link e o código continuam). Uma limpeza única tira as que já tinham saído de pendente.
  `create or replace function asaas_cobranca_sem_qr()
   returns trigger language plpgsql as $$
   begin
     if new.status not in ('criando', 'pendente') then new.pix_imagem := null; end if;
     return new;
   end;
   $$`,
  `drop trigger if exists asaas_cobranca_sem_qr on asaas_cobrancas`,
  `create trigger asaas_cobranca_sem_qr before insert or update on asaas_cobrancas for each row execute function asaas_cobranca_sem_qr()`,
  `update asaas_cobrancas set pix_imagem = null where pix_imagem is not null and status not in ('criando', 'pendente')`,
  // Oferendas: quem entra na corrente (ou numa turma) entrava nas listas por pessoa a cada leitura da aba
  // (oferendas_sincronizar gravava em toda leitura). Agora entra quando o cadastro muda: gatilhos em pessoas, alunos
  // e oferendas chamam a mesma inclusão (só acrescenta; quem o admin tirou da lista continua fora).
  `create or replace function oferendas_incluir_novos()
   returns void language plpgsql as $$
   declare
     v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
     v_ocultas uuid[] := array_remove(array[turma_consulentes_id(), turma_oferenda_id()], null);
   begin
     insert into oferenda_mediuns (oferenda_id, pessoa_id)
     select o.id, pe.id from oferendas o join pessoas pe on pe.funcao = any(o.grupos) and pe.saida is null
     where o.por_medium and o.status <> 'encerrado' and o.data >= v_hoje
     on conflict do nothing;
     insert into oferenda_alunos (oferenda_id, aluno_id)
     select o.id, a.id from oferendas o join alunos a on a.saida is null
       and ((a.turma_id is not null and ('turma:' || a.turma_id::text) = any(o.grupos))
            or ((a.turma_id is null or a.turma_id <> all(v_ocultas))
                and ('alunos' = any(o.grupos) or (a.turma_id is null and 'alunos:sem' = any(o.grupos)))))
     where o.por_medium and o.status <> 'encerrado' and o.data >= v_hoje
     on conflict do nothing;
   end;
   $$`,
  `create or replace function oferendas_incluir_novos_gatilho()
   returns trigger language plpgsql as $$
   begin
     perform oferendas_incluir_novos();
     return null;
   end;
   $$`,
  `drop trigger if exists oferendas_incluir_pessoas on pessoas`,
  `create trigger oferendas_incluir_pessoas after insert or update of funcao, saida on pessoas
   for each statement execute function oferendas_incluir_novos_gatilho()`,
  `drop trigger if exists oferendas_incluir_alunos on alunos`,
  `create trigger oferendas_incluir_alunos after insert or update of turma_id, saida on alunos
   for each statement execute function oferendas_incluir_novos_gatilho()`,
  `drop trigger if exists oferendas_incluir_oferendas on oferendas`,
  `create trigger oferendas_incluir_oferendas after insert or update of grupos, status, por_medium, data on oferendas
   for each statement execute function oferendas_incluir_novos_gatilho()`,
  `select oferendas_incluir_novos()`,
  `create or replace function oferendas_sincronizar(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     perform oferendas_incluir_novos();
     return oferendas_estado(p);
   end;
   $$`,
  // Igual à anterior, sem as oferendas encerradas de antes de hoje (a aba mostra em "Oferendas anteriores", que o admin
  // abre); { anteriores: true } traz todas. As gravações devolvem oferendas_estado() sem elas.
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
           'id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'unidade', i.unidade, 'entrega', i.entrega, 'entregue', i.entregue, 'todos', i.todos,
           'doacoes', coalesce((select jsonb_agg(jsonb_build_object('chave', d.pessoa_chave,
                                                                    'nome', coalesce(o.retrato ->> d.pessoa_chave, u.nome, pe.nome, al.nome, d.pessoa_nome),
                                                                    'quantidade', d.quantidade) order by d.atualizado_em)
                                from oferenda_doacoes d
                                left join usuarios u on u.id = case when d.pessoa_chave ~ '^u:[0-9a-f-]{36}$' then substr(d.pessoa_chave, 3)::uuid end
                                left join pessoas pe on pe.id = case when d.pessoa_chave ~ '^p:[0-9a-f-]{36}$' then substr(d.pessoa_chave, 3)::uuid end
                                left join alunos al on al.id = case when d.pessoa_chave ~ '^a:[0-9a-f-]{36}$' then substr(d.pessoa_chave, 3)::uuid end
                                where d.item_id = i.id), '[]'::jsonb)
         ) order by i.criado_em) from oferenda_itens i where i.oferenda_id = o.id), '[]'::jsonb)
     ) order by o.data, o.criado_em), '[]'::jsonb) from oferendas o
     where coalesce((p ->> 'anteriores')::boolean, false) or o.status <> 'encerrado'
        or o.data >= (now() at time zone 'America/Sao_Paulo')::date;
   $$`,
  // Quantas encerradas de antes de hoje ficaram fora, por sub-aba ({ abaId: n }): o número de "Oferendas anteriores"
  // antes de o admin abrir.
  `create or replace function oferendas_anteriores_total(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_object_agg(x.aba, x.n), '{}'::jsonb) from (
       select coalesce(o.aba_id::text, '') as aba, count(*) as n from oferendas o
       where o.status = 'encerrado' and o.data < (now() at time zone 'America/Sao_Paulo')::date
       group by 1) x;
   $$`,
  // Giras: a abertura do app trazia todas as giras desde o início, e qualquer gravação (uma presença marcada) fazia
  // todo mundo baixar tudo de novo. Agora: { desde } nas giras (a abertura manda os últimos 12 meses; o histórico
  // inteiro vem por GET /api/giras quando a tela precisa) e uma versão só das giras (giras, presença e duplas), separada
  // da versão do resto: presença marcada reenvia só as giras, e uma pessoa editada não reenvia as giras.
  `create or replace function giras_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(gira_json(data) order by data desc), '[]'::jsonb) from giras
     where nullif(p ->> 'desde', '') is null or data >= (p ->> 'desde')::date;
   $$`,
  `create sequence if not exists versao_giras_seq`,
  `do $$ begin
     if not (select is_called from versao_giras_seq) then perform nextval('versao_giras_seq'); end if;
     if not (select is_called from versao_dados_seq) then perform nextval('versao_dados_seq'); end if;
   end $$`,
  `create or replace function versao_dados_subir()
   returns trigger language plpgsql as $$
   begin
     if tg_table_name in ('giras', 'presencas', 'duplas') then
       perform nextval('versao_giras_seq');
       return null;
     end if;
     if tg_table_name = 'sistema' then
       if coalesce(new.chave, old.chave) = 'asaas2_atualizado' then return null; end if;
     end if;
     perform nextval('versao_dados_seq');
     return null;
   end;
   $$`,
  `create or replace function versao_giras()
   returns text language sql volatile as $$
     select (select last_value from versao_giras_seq)::text;
   $$`,
  // Versão "<resto>~<giras>". Com p.parcial (o app atual), só a parte que mudou volta: giras dos últimos 12 meses
  // (girasDesde = início da janela), o resto (pessoas, config, eventos, orações, apelidos, curimba) ou os dois. Com giras,
  // as pessoas vêm sempre (o servidor compacta os retratos com elas), e pessoasMudou diz se o app troca a lista.
  // Sem p.parcial (aparelho uma versão atrás): tudo, com todas as giras, como antes. Versão sem "~": tudo.
  `create or replace function inicio_dados(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_resto text := versao_dados();
     v_giras text := versao_giras();
     v_versao text := v_resto || '~' || v_giras;
     v_cli text := coalesce(p ->> 'versao', '');
     v_parcial boolean := coalesce((p ->> 'parcial')::boolean, false);
     v_resto_mudou boolean := not v_parcial or position('~' in v_cli) = 0 or split_part(v_cli, '~', 1) <> v_resto;
     v_giras_mudou boolean := not v_parcial or position('~' in v_cli) = 0 or split_part(v_cli, '~', 2) <> v_giras;
     v_desde date := case when v_parcial then ((now() at time zone 'America/Sao_Paulo')::date - interval '12 months')::date end;
     v_pessoa text := coalesce(nullif(p ->> 'pessoaId', ''),
                               (select u.pessoa_id::text from usuarios u where u.id = nullif(p ->> 'usuarioId', '')::uuid));
     r jsonb;
   begin
     if v_cli = v_versao then
       return jsonb_build_object('versao', v_versao, 'semMudanca', true);
     end if;
     r := jsonb_build_object('versao', v_versao, 'pessoasMudou', v_resto_mudou);
     if v_resto_mudou or v_giras_mudou then
       r := r || jsonb_build_object('pessoas', pessoas_listar('{"todas": true}'::jsonb));
     end if;
     if v_giras_mudou then
       r := r || jsonb_build_object('giras', giras_listar(jsonb_build_object('desde', v_desde)), 'girasDesde', v_desde);
     end if;
     if v_resto_mudou then
       r := r || jsonb_build_object('config', config_casa('{}'::jsonb));
       begin r := r || jsonb_build_object('eventos', eventos_listar('{}'::jsonb)); exception when others then null; end;
       begin r := r || jsonb_build_object('oracoes', oracoes_listar('{}'::jsonb)); exception when others then null; end;
       begin r := r || jsonb_build_object('entidadesApelidos', entidades_apelidos_listar('{}'::jsonb)); exception when others then null; end;
       if v_pessoa is not null then
         begin r := r || jsonb_build_object('minhaCurimba', curimba_minha(jsonb_build_object('pessoaId', v_pessoa))); exception when others then null; end;
       end if;
     end if;
     if coalesce((p ->> 'me')::boolean, false) then
       r := r || jsonb_build_object('abasOferendas', oferenda_abas_listar('{}'::jsonb), 'videosPublicada', videos_publicada('{}'::jsonb),
                                    'ervasPublicada', ervas_publicada('{}'::jsonb), 'guiasPublicada', guias_publicada('{}'::jsonb),
                                    'amaciPublicada', amaci_publicada('{}'::jsonb),
                                    'iemanja', iemanja_resumo('{}'::jsonb));
     end if;
     return r;
   end;
   $$`,
];
