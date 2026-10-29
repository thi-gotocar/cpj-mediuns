-- Sort Médiuns: funções usadas pelo backend
-- Rode DEPOIS do 001_inicial.sql (SQL Editor > New query > cole > Run).
--
-- O backend chama estas funções pela API REST do Supabase (/rest/v1/rpc/<nome>)
-- com a chave de serviço. Cada função recebe um único parâmetro "p" (jsonb)
-- e devolve jsonb. Só o papel service_role pode executá-las.

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create or replace function public.perfil_obter(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(x) from (
    select id, nome, email, papel from public.perfis where id = (p ->> 'id')::uuid
  ) x;
$$;

create or replace function public.perfis_listar(p jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.nome), '[]'::jsonb) from (
    select id, nome, email, papel, criado_em as "criadoEm" from public.perfis
  ) x;
$$;

create or replace function public.perfil_atualizar(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_atual text;
begin
  select papel into v_atual from public.perfis where id = v_id for update;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  if p ? 'papel' and v_atual = 'admin' and (p ->> 'papel') <> 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'Precisa existir pelo menos um admin.';
  end if;

  update public.perfis set
    nome  = case when p ? 'nome'  then btrim(p ->> 'nome') else nome end,
    papel = case when p ? 'papel' then p ->> 'papel'       else papel end
  where id = v_id;

  return public.perfil_obter(jsonb_build_object('id', v_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------------
create or replace function public.pessoas_listar(p jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.nome)), '[]'::jsonb) from (
    select id, nome, funcao, experiente from public.pessoas
  ) x;
$$;

-- p = { nomes: ["Ana", "Bruno"], funcao: "medium" }. Nomes repetidos são ignorados.
create or replace function public.pessoas_criar(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_n int;
begin
  with novos as (
    select distinct on (lower(btrim(n))) btrim(n) as nome
    from jsonb_array_elements_text(coalesce(p -> 'nomes', '[]'::jsonb)) n
    where btrim(n) <> ''
  ), ins as (
    insert into public.pessoas (nome, funcao, experiente)
    select nome, p ->> 'funcao', false from novos
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  return jsonb_build_object('criadas', v_n);
end;
$$;

create or replace function public.pessoas_atualizar(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := (p ->> 'id')::uuid;
begin
  update public.pessoas set
    nome       = case when p ? 'nome'       then btrim(p ->> 'nome')              else nome end,
    funcao     = case when p ? 'funcao'     then p ->> 'funcao'                   else funcao end,
    experiente = case when p ? 'experiente' then (p ->> 'experiente')::boolean   else experiente end
  where id = v_id;
  if not found then
    raise exception 'Pessoa não encontrada.';
  end if;
  return (select to_jsonb(x) from (select id, nome, funcao, experiente from public.pessoas where id = v_id) x);
end;
$$;

create or replace function public.pessoas_excluir(p jsonb)
returns jsonb language plpgsql as $$
begin
  delete from public.pessoas where id = (p ->> 'id')::uuid;
  return jsonb_build_object('ok', found);
end;
$$;

-- ---------------------------------------------------------------------------
-- Giras
-- ---------------------------------------------------------------------------
create or replace function public.gira_json(d date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'data', g.data,
    'entidade', g.entidade,
    'atualizadoEm', g.atualizado_em,
    'presenca', coalesce((select jsonb_object_agg(pr.pessoa_id, pr.status)
                          from public.presencas pr where pr.gira_data = g.data), '{}'::jsonb),
    'pares', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                                           'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                       from public.duplas du where du.gira_data = g.data and du.tipo = 'cambone'), '[]'::jsonb),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('m', du.medium_id, 'c', du.pessoa_id,
                                                            'fixo', du.fixo, 'remanejado', du.remanejado) order by du.id)
                        from public.duplas du where du.gira_data = g.data and du.tipo = 'passe'), '[]'::jsonb)
  )
  from public.giras g where g.data = d;
$$;

create or replace function public.giras_listar(p jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(public.gira_json(data) order by data desc), '[]'::jsonb) from public.giras;
$$;

create or replace function public.gira_obter(p jsonb)
returns jsonb language sql stable as $$
  select public.gira_json((p ->> 'data')::date);
$$;

-- Salva a gira de uma vez (transação única). Só substitui o que vier em p:
--   p = { data, usuario?, entidade?, presenca?: {pessoaId: status}, pares?: [...], passes?: [...] }
-- Pessoas que não existem mais são ignoradas.
create or replace function public.gira_salvar(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_data date := (p ->> 'data')::date;
  v_user uuid := nullif(p ->> 'usuario', '')::uuid;
begin
  insert into public.giras (data, entidade, atualizado_em, atualizado_por)
  values (v_data, coalesce(p ->> 'entidade', ''), now(), v_user)
  on conflict (data) do update set
    entidade       = case when p ? 'entidade' then coalesce(p ->> 'entidade', '') else public.giras.entidade end,
    atualizado_em  = now(),
    atualizado_por = excluded.atualizado_por;

  if p ? 'presenca' then
    delete from public.presencas where gira_data = v_data;
    insert into public.presencas (gira_data, pessoa_id, status)
    select v_data, e.key::uuid, e.value #>> '{}'
    from jsonb_each(coalesce(p -> 'presenca', '{}'::jsonb)) e
    where e.value #>> '{}' <> 'p'
      and exists (select 1 from public.pessoas ps where ps.id = e.key::uuid);
  end if;

  if p ? 'pares' then
    delete from public.duplas where gira_data = v_data and tipo = 'cambone';
    insert into public.duplas (gira_data, tipo, medium_id, pessoa_id, fixo, remanejado)
    select v_data, 'cambone', (e ->> 'm')::uuid, (e ->> 'c')::uuid,
           coalesce((e ->> 'fixo')::boolean, false), coalesce((e ->> 'remanejado')::boolean, false)
    from jsonb_array_elements(coalesce(p -> 'pares', '[]'::jsonb)) e
    where exists (select 1 from public.pessoas ps where ps.id = (e ->> 'm')::uuid)
      and exists (select 1 from public.pessoas ps where ps.id = (e ->> 'c')::uuid);
  end if;

  if p ? 'passes' then
    delete from public.duplas where gira_data = v_data and tipo = 'passe';
    insert into public.duplas (gira_data, tipo, medium_id, pessoa_id, fixo, remanejado)
    select v_data, 'passe', (e ->> 'm')::uuid, (e ->> 'c')::uuid,
           coalesce((e ->> 'fixo')::boolean, false), coalesce((e ->> 'remanejado')::boolean, false)
    from jsonb_array_elements(coalesce(p -> 'passes', '[]'::jsonb)) e
    where exists (select 1 from public.pessoas ps where ps.id = (e ->> 'm')::uuid)
      and exists (select 1 from public.pessoas ps where ps.id = (e ->> 'c')::uuid);
  end if;

  return public.gira_json(v_data);
end;
$$;

create or replace function public.gira_excluir(p jsonb)
returns jsonb language plpgsql as $$
begin
  delete from public.giras where data = (p ->> 'data')::date;
  return jsonb_build_object('ok', found);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões: só o backend (service_role) executa estas funções.
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'perfil_obter(jsonb)', 'perfis_listar(jsonb)', 'perfil_atualizar(jsonb)',
    'pessoas_listar(jsonb)', 'pessoas_criar(jsonb)', 'pessoas_atualizar(jsonb)', 'pessoas_excluir(jsonb)',
    'gira_json(date)', 'giras_listar(jsonb)', 'gira_obter(jsonb)', 'gira_salvar(jsonb)', 'gira_excluir(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function public.%s from anon, authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end;
$$;
