-- Sort Médiuns: esquema inicial
-- Rode no Supabase em: SQL Editor > New query > cole este arquivo > Run.
--
-- Todo acesso aos dados passa pelo backend (/api), que conecta com o papel
-- "postgres" pela DATABASE_URL. Por isso o RLS fica LIGADO e SEM políticas:
-- a API pública do Supabase (chave anon) não consegue ler nem gravar nada.

-- ---------------------------------------------------------------------------
-- Perfis de acesso (um por usuário do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text not null default '',
  papel      text not null default 'usuario' check (papel in ('admin', 'usuario')),
  criado_em  timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário é criado no Auth.
-- O PRIMEIRO usuário criado vira admin. Os seguintes usam o papel definido
-- pelo backend em app_metadata.papel (que só a chave de serviço consegue
-- gravar), ou "usuario" se não vier nada.
create or replace function public.criar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text;
begin
  if not exists (select 1 from public.perfis where papel = 'admin') then
    v_papel := 'admin';
  else
    v_papel := coalesce(new.raw_app_meta_data ->> 'papel', 'usuario');
    if v_papel not in ('admin', 'usuario') then
      v_papel := 'usuario';
    end if;
  end if;

  insert into public.perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    v_papel
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- ---------------------------------------------------------------------------
-- Corrente
-- ---------------------------------------------------------------------------
create table if not exists public.pessoas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 80),
  funcao      text not null check (funcao in ('medium', 'cambone', 'passe', 'senha', 'extra')),
  experiente  boolean not null default false,  -- "pode ter médium de passe junto" (só médium)
  criado_em   timestamptz not null default now()
);
create unique index if not exists pessoas_nome_unico on public.pessoas (lower(btrim(nome)));

-- ---------------------------------------------------------------------------
-- Giras (uma por data)
-- ---------------------------------------------------------------------------
create table if not exists public.giras (
  data            date primary key,
  entidade        text not null default '' check (length(entidade) <= 120),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.perfis (id) on delete set null
);

-- Status de cada pessoa na gira. Sem linha = Presente.
--   p = Presente, na = Não atende, sup = Suporte, f = Falta, a = Ausente
create table if not exists public.presencas (
  gira_data  date not null references public.giras (data) on delete cascade,
  pessoa_id  uuid not null references public.pessoas (id) on delete cascade,
  status     text not null check (status in ('p', 'na', 'sup', 'f', 'a')),
  primary key (gira_data, pessoa_id)
);

-- Duplas sorteadas. tipo = 'cambone' (pessoa_id cambona medium_id)
--                   ou 'passe'   (pessoa_id é médium de passe junto de medium_id)
create table if not exists public.duplas (
  id          bigint generated always as identity primary key,
  gira_data   date not null references public.giras (data) on delete cascade,
  tipo        text not null check (tipo in ('cambone', 'passe')),
  medium_id   uuid not null references public.pessoas (id) on delete cascade,
  pessoa_id   uuid not null references public.pessoas (id) on delete cascade,
  fixo        boolean not null default false,
  remanejado  boolean not null default false
);
create index if not exists duplas_por_gira on public.duplas (gira_data);
create index if not exists duplas_por_par on public.duplas (tipo, medium_id, pessoa_id);

-- ---------------------------------------------------------------------------
-- Segurança: RLS ligado e sem políticas = nada passa pela API pública.
-- ---------------------------------------------------------------------------
alter table public.perfis    enable row level security;
alter table public.pessoas   enable row level security;
alter table public.giras     enable row level security;
alter table public.presencas enable row level security;
alter table public.duplas    enable row level security;
