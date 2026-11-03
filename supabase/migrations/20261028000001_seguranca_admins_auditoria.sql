-- =============================================================================
-- 0001 — Equipe (admins), funções de papel e log de auditoria
-- Idempotente. Não altera nem remove policies existentes dos clientes.
-- =============================================================================

-- Equipe do petshop ----------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  papel      text not null default 'atendente',
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'admins_papel_check') then
    alter table public.admins
      add constraint admins_papel_check check (papel in ('admin', 'atendente'));
  end if;
end $$;

alter table public.admins enable row level security;

-- Funções de papel (security definer: leem admins sem depender da RLS) --------
create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and papel = 'admin');
$$;

create or replace function public.meu_papel()
returns text
language sql stable security definer
set search_path = public
as $$
  select papel from public.admins where user_id = auth.uid();
$$;

revoke all on function public.is_staff(), public.is_admin(), public.meu_papel() from public;
grant execute on function public.is_staff(), public.is_admin(), public.meu_papel() to anon, authenticated;

-- Policies de admins: cada um vê a si mesmo; equipe vê a equipe; só admin altera
drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists admins_update on public.admins;
create policy admins_update on public.admins
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_delete on public.admins;
create policy admins_delete on public.admins
  for delete to authenticated
  using (public.is_admin());

-- Nunca deixar o sistema sem nenhum admin
create or replace function public.admins_protege_ultimo_admin()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.papel = 'admin'
     and (tg_op = 'DELETE' or new.papel <> 'admin')
     and (select count(*) from public.admins where papel = 'admin') <= 1 then
    raise exception 'ULTIMO_ADMIN: não é possível remover ou rebaixar o último admin';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_admins_ultimo_admin on public.admins;
create trigger trg_admins_ultimo_admin
  before update or delete on public.admins
  for each row execute function public.admins_protege_ultimo_admin();

-- Log de auditoria ------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid default auth.uid(),
  acao        text not null,
  entidade    text not null,
  entidade_id text,
  dados       jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entidade_idx on public.audit_log (entidade, entidade_id);

alter table public.audit_log enable row level security;

-- Somente leitura para a equipe; escrita apenas via triggers (security definer)
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.is_staff());

create or replace function public.registrar_auditoria(
  p_acao text, p_entidade text, p_entidade_id text, p_dados jsonb
) returns void
language sql security definer
set search_path = public
as $$
  insert into public.audit_log (user_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), p_acao, p_entidade, p_entidade_id, p_dados);
$$;

revoke all on function public.registrar_auditoria(text, text, text, jsonb) from public, anon, authenticated;

-- Equipe pode LER os dados dos clientes (policies adicionais; as "_own" continuam).
-- Tabelas do app que não existirem são ignoradas.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'enderecos', 'pets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'staff_select_' || t, t);
      execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())',
                     'staff_select_' || t, t);
    end if;
  end loop;

  if to_regclass('public.pets') is not null then
    drop policy if exists staff_update_pets on public.pets;
    create policy staff_update_pets on public.pets
      for update to authenticated using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

-- Equipe: listagem e gestão -----------------------------------------------------
create or replace function public.listar_equipe()
returns table (user_id uuid, nome text, papel text, email text, created_at timestamptz, ultimo_login timestamptz)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;
  return query
    select a.user_id, a.nome, a.papel, u.email::text, a.created_at, u.last_sign_in_at
    from public.admins a join auth.users u on u.id = a.user_id
    order by a.nome;
end $$;

-- Adiciona à equipe um usuário que já existe no Auth (criado/convidado no Supabase)
create or replace function public.adicionar_membro_equipe(p_email text, p_nome text, p_papel text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;
  if p_papel not in ('admin', 'atendente') then
    raise exception 'PAPEL_INVALIDO';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'USUARIO_NAO_ENCONTRADO: crie ou convide o usuário no Supabase Auth primeiro';
  end if;
  insert into public.admins (user_id, nome, papel) values (v_id, p_nome, p_papel)
  on conflict (user_id) do update set nome = excluded.nome, papel = excluded.papel;
  perform public.registrar_auditoria('equipe.membro_salvo', 'admins', v_id::text,
    jsonb_build_object('email', p_email, 'papel', p_papel));
  return v_id;
end $$;

revoke all on function public.listar_equipe(), public.adicionar_membro_equipe(text, text, text) from public, anon;
grant execute on function public.listar_equipe(), public.adicionar_membro_equipe(text, text, text) to authenticated;
