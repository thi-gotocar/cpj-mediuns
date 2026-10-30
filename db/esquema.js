// Esquema do banco (Postgres da Vercel / Neon).
//
// O backend aplica este esquema sozinho no primeiro acesso (api/_lib/db.js):
// não é preciso rodar SQL à mão. Cada item da lista é UM comando SQL, e todos
// são idempotentes (podem rodar de novo sem estragar nada).
//
// Para mudar o esquema: acrescente comandos no fim e aumente VERSAO.

export const VERSAO = 22;  // v22: motivo da licença

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
  // v2: linhas em que Extra/Passe atuam na própria função (nas outras, cambonam)
  `alter table pessoas add column if not exists linhas text[] not null default '{}'`,
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
  // O nome do usuário é o do cadastro de pessoas (o root, sem cadastro, usa o próprio nome).
  `create or replace function usuario_json(u usuarios)
   returns jsonb language sql stable as $$
     select jsonb_build_object('id', u.id, 'nome', coalesce((select nome from pessoas where id = u.pessoa_id), u.nome),
                               'pessoaId', u.pessoa_id, 'email', u.email, 'papel', u.papel,
                               'sessaoVersao', u.sessao_versao, 'criadoEm', u.criado_em);
   $$`,
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
  `create or replace function pessoas_listar(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.nome)), '[]'::jsonb) from (
       select p.id, p.nome, p.funcao, p.experiente, p.linhas,
              coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'inicio', l.inicio, 'fim', l.fim, 'motivo', l.motivo) order by l.inicio)
                        from licencas l where l.pessoa_id = p.id), '[]'::jsonb) as licencas
       from pessoas p
     ) x;
   $$`,
  `create or replace function licenca_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     insert into licencas (pessoa_id, inicio, fim, motivo)
     values ((p ->> 'pessoaId')::uuid, (p ->> 'inicio')::date, (p ->> 'fim')::date, coalesce(p ->> 'motivo', ''));
     return pessoas_listar();
   end;
   $$`,
  // v11: editar o período de uma licença
  `create or replace function licenca_atualizar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     update licencas set inicio = (p ->> 'inicio')::date, fim = (p ->> 'fim')::date,
       motivo = case when p ? 'motivo' then coalesce(p ->> 'motivo', '') else motivo end where id = (p ->> 'id')::uuid;
     if not found then raise exception 'Licença não encontrada.'; end if;
     return pessoas_listar();
   end;
   $$`,
  `create or replace function licenca_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from licencas where id = (p ->> 'id')::uuid;
     return pessoas_listar();
   end;
   $$`,
  // p = { nomes: [...], funcao }. Nomes repetidos são ignorados.
  `create or replace function pessoas_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v_n int;
   begin
     with novos as (
       select distinct on (lower(btrim(n))) btrim(n) as nome
       from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n
       where btrim(n) <> ''
     ), ins as (
       insert into pessoas (nome, funcao, experiente)
       select nome, p ->> 'funcao', false from novos
       on conflict do nothing
       returning 1
     )
     select count(*) into v_n from ins;
     return jsonb_build_object('criadas', v_n);
   end;
   $$`,
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
                         else linhas end
     where id = v_id;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     return (select to_jsonb(x) from (select id, nome, funcao, experiente, linhas from pessoas where id = v_id) x);
   end;
   $$`,
  `create or replace function pessoas_excluir(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from pessoas where id = (p ->> 'id')::uuid;
     return jsonb_build_object('ok', found);
   end;
   $$`,

  // ------------------------------------------------------------------ giras
  `create or replace function gira_json(d date)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'data', g.data,
       'entidade', g.entidade,
       'encerrada', g.encerrada,
       'suporteAuto', g.suporte_auto,
       'atendimentos', g.atendimentos,
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
     insert into giras (data, entidade, encerrada, atendimentos, atualizado_em, atualizado_por)
     values (v_data, coalesce(p ->> 'entidade', ''), coalesce((p ->> 'encerrada')::boolean, false),
             nullif(p -> 'atendimentos', 'null'::jsonb), now(), v_user)
     on conflict (data) do update set
       entidade       = case when p ? 'entidade' then coalesce(p ->> 'entidade', '') else giras.entidade end,
       encerrada      = case when p ? 'encerrada' then (p ->> 'encerrada')::boolean else giras.encerrada end,
       suporte_auto   = case when p ? 'suporteAuto' then coalesce(p -> 'suporteAuto', '{}'::jsonb) else giras.suporte_auto end,
       atendimentos   = case when p ? 'atendimentos' then nullif(p -> 'atendimentos', 'null'::jsonb) else giras.atendimentos end,
       atualizado_em  = now(),
       atualizado_por = excluded.atualizado_por;

     if p ? 'presenca' then
       delete from presencas where gira_data = v_data;
       insert into presencas (gira_data, pessoa_id, status)
       select v_data, e.key::uuid, e.value #>> '{}'
       from jsonb_each(coalesce(p -> 'presenca', '{}'::jsonb)) e
       where e.value #>> '{}' <> 'p'
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
  `create or replace function ervas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select jsonb_build_object(
       'frete', coalesce((select valor::numeric from sistema where chave = 'ervas_frete'), 0),
       'aberta', coalesce((select valor = 'true' from sistema where chave = 'ervas_aberta'), true),
       'gira', coalesce((select valor from sistema where chave = 'ervas_gira'), ''),
       'data', coalesce((select valor from sistema where chave = 'ervas_data'), ''),
       'ervas', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'preco', e.preco) order by lower(e.nome))
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
  `create or replace function erva_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if nullif(p ->> 'id', '') is null then
       insert into ervas (nome, preco) values (btrim(p ->> 'nome'), (p ->> 'preco')::numeric);
     else
       update ervas set nome = btrim(p ->> 'nome'), preco = (p ->> 'preco')::numeric where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Erva não encontrada.'; end if;
     end if;
     return ervas_estado();
   exception when unique_violation then
     raise exception 'Já existe uma erva com esse nome.';
   end;
   $$`,
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
  // Nova compra: apaga todas as escolhas e reabre a lista (o catálogo e o frete ficam).
  `create or replace function ervas_nova_compra(p jsonb default '{}'::jsonb)
   returns jsonb language plpgsql as $$
   begin
     delete from ervas_escolhas;
     update sistema set valor = 'true' where chave = 'ervas_aberta';
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
  `create or replace function oferendas_estado(p jsonb default '{}'::jsonb)
   returns jsonb language sql stable as $$
     select coalesce(jsonb_agg(jsonb_build_object(
       'id', o.id, 'titulo', o.titulo, 'data', o.data, 'status', o.status, 'publicada', o.publicada,
       'responsavelId', o.responsavel_id, 'responsavel', (select nome from pessoas where id = o.responsavel_id),
       'itens', coalesce((select jsonb_agg(jsonb_build_object(
           'id', i.id, 'nome', i.nome, 'quantidade', i.quantidade, 'entrega', i.entrega, 'entregue', i.entregue,
           'doacoes', coalesce((select jsonb_agg(jsonb_build_object('chave', d.pessoa_chave, 'nome', coalesce(u.nome, pe.nome, d.pessoa_nome),
                                                                    'quantidade', d.quantidade) order by d.atualizado_em)
                                from oferenda_doacoes d left join usuarios u on d.pessoa_chave = 'u:' || u.id::text
                                left join pessoas pe on d.pessoa_chave = 'p:' || pe.id::text
                                where d.item_id = i.id), '[]'::jsonb)
         ) order by i.criado_em) from oferenda_itens i where i.oferenda_id = o.id), '[]'::jsonb)
     ) order by o.data, o.criado_em), '[]'::jsonb) from oferendas o;
   $$`,
  `create or replace function oferenda_salvar(p jsonb)
   returns jsonb language plpgsql as $$
   begin
     if nullif(p ->> 'id', '') is null then
       insert into oferendas (titulo, data, responsavel_id)
       values (btrim(p ->> 'titulo'), (p ->> 'data')::date, nullif(p ->> 'responsavelId', '')::uuid);
     else
       update oferendas set titulo = btrim(p ->> 'titulo'), data = (p ->> 'data')::date,
              responsavel_id = case when p ? 'responsavelId' then nullif(p ->> 'responsavelId', '')::uuid else responsavel_id end
       where id = (p ->> 'id')::uuid;
       if not found then raise exception 'Oferenda não encontrada.'; end if;
     end if;
     return oferendas_estado();
   end;
   $$`,
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
  // Doação de uma pessoa num item (0 = desiste). Não deixa passar da quantidade pedida.
  `create or replace function oferenda_doar(p jsonb)
   returns jsonb language plpgsql as $$
   declare
     v_item uuid := (p ->> 'itemId')::uuid;
     v_chave text := p ->> 'chave';
     v_qtd int := (p ->> 'quantidade')::int;
     v_total int; v_entregue boolean; v_outros int;
   begin
     select quantidade, entregue into v_total, v_entregue from oferenda_itens where id = v_item for update;
     if not found then raise exception 'Item não encontrado.'; end if;
     if not coalesce((p ->> 'forcar')::boolean, false)
        and (select o.status from oferendas o join oferenda_itens i on i.oferenda_id = o.id where i.id = v_item) <> 'publicado' then
       raise exception 'Esta oferenda não está aberta para doações.';
     end if;
     if v_entregue and not coalesce((p ->> 'forcar')::boolean, false) then raise exception 'Este item já foi entregue.'; end if;
     select coalesce(sum(quantidade), 0) into v_outros from oferenda_doacoes where item_id = v_item and pessoa_chave <> v_chave;
     if v_qtd > 0 and v_outros + v_qtd > v_total then
       if v_total - v_outros <= 0 then raise exception 'Este item já está completo.'; end if;
       raise exception 'Só faltam % deste item.', v_total - v_outros;
     end if;
     delete from oferenda_doacoes where item_id = v_item and pessoa_chave = v_chave;
     if v_qtd > 0 then
       insert into oferenda_doacoes (item_id, pessoa_chave, pessoa_nome, quantidade)
       values (v_item, v_chave, btrim(p ->> 'nome'), v_qtd);
     end if;
     return oferendas_estado();
   end;
   $$`,

  // ================================================== v14: perfis admin_oferendas e admin_ervas
  `alter table usuarios drop constraint if exists usuarios_papel_check`,
  `alter table usuarios add constraint usuarios_papel_check check (papel in ('root', 'admin', 'usuario', 'admin_oferendas', 'admin_ervas'))`,

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
];
