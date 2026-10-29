// Esquema do banco (Postgres da Vercel / Neon).
//
// O backend aplica este esquema sozinho no primeiro acesso (api/_lib/db.js):
// não é preciso rodar SQL à mão. Cada item da lista é UM comando SQL, e todos
// são idempotentes (podem rodar de novo sem estragar nada).
//
// Para mudar o esquema: acrescente comandos no fim e aumente VERSAO.

export const VERSAO = 1;

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

  // ------------------------------------------------------------------ giras
  `create table if not exists giras (
     data            date primary key,
     entidade        text not null default '' check (length(entidade) <= 120),
     atualizado_em   timestamptz not null default now(),
     atualizado_por  uuid references usuarios (id) on delete set null
   )`,
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
  `create or replace function usuario_json(u usuarios)
   returns jsonb language sql immutable as $$
     select jsonb_build_object('id', u.id, 'nome', u.nome, 'email', u.email, 'papel', u.papel,
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
     select coalesce(jsonb_agg(usuario_json(u) order by lower(u.nome)), '[]'::jsonb) from usuarios u;
   $$`,
  `create or replace function usuario_criar(p jsonb)
   returns jsonb language plpgsql as $$
   declare v usuarios;
   begin
     insert into usuarios (nome, email, papel, senha_hash)
     values (btrim(p ->> 'nome'), lower(btrim(p ->> 'email')), p ->> 'papel', p ->> 'senhaHash')
     returning * into v;
     return usuario_json(v);
   exception when unique_violation then
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
     values (btrim(p ->> 'nome'), lower(btrim(p ->> 'email')), 'admin', p ->> 'senhaHash')
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
     if p ? 'papel' and v_atual = 'admin' and (p ->> 'papel') <> 'admin'
        and (select count(*) from usuarios where papel = 'admin') <= 1 then
       raise exception 'Precisa existir pelo menos um admin.';
     end if;
     update usuarios set
       nome          = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
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
     if v_papel = 'admin' and (select count(*) from usuarios where papel = 'admin') <= 1 then
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
       select id, nome, funcao, experiente from pessoas
     ) x;
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
       experiente = case when p ? 'experiente' then (p ->> 'experiente')::boolean else experiente end
     where id = v_id;
     if not found then raise exception 'Pessoa não encontrada.'; end if;
     return (select to_jsonb(x) from (select id, nome, funcao, experiente from pessoas where id = v_id) x);
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
     insert into giras (data, entidade, atualizado_em, atualizado_por)
     values (v_data, coalesce(p ->> 'entidade', ''), now(), v_user)
     on conflict (data) do update set
       entidade       = case when p ? 'entidade' then coalesce(p ->> 'entidade', '') else giras.entidade end,
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
];
