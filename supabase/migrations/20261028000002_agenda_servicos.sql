-- =============================================================================
-- 0002 — Serviços/preços por porte, horário de funcionamento, bloqueios,
--        anti-overbooking em agendamentos e RPC de horários livres.
-- Compatível com o app: agendamentos.hora continua TEXT ("HH:MM"),
-- status padrão continua 'Confirmado', policies "_own" intocadas.
-- =============================================================================

-- Serviços ---------------------------------------------------------------------
create table if not exists public.servicos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  ativo       boolean not null default true,
  duracao_min integer not null default 60,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists servicos_nome_key on public.servicos (lower(nome));

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicos_duracao_check') then
    alter table public.servicos add constraint servicos_duracao_check check (duracao_min between 5 and 600);
  end if;
end $$;

create table if not exists public.servicos_precos (
  servico_id uuid not null references public.servicos (id) on delete cascade,
  porte      text not null,
  preco      numeric(10, 2) not null,
  primary key (servico_id, porte)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'servicos_precos_porte_check') then
    alter table public.servicos_precos
      add constraint servicos_precos_porte_check check (porte in ('Pequeno', 'Médio', 'Grande'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servicos_precos_preco_check') then
    alter table public.servicos_precos add constraint servicos_precos_preco_check check (preco >= 0);
  end if;
end $$;

alter table public.servicos enable row level security;
alter table public.servicos_precos enable row level security;

drop policy if exists servicos_select on public.servicos;
create policy servicos_select on public.servicos
  for select to anon, authenticated using (ativo or public.is_staff());
drop policy if exists servicos_admin_write on public.servicos;
create policy servicos_admin_write on public.servicos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists servicos_precos_select on public.servicos_precos;
create policy servicos_precos_select on public.servicos_precos
  for select to anon, authenticated using (true);
drop policy if exists servicos_precos_admin_write on public.servicos_precos;
create policy servicos_precos_admin_write on public.servicos_precos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Auditoria de mudança de preço de serviço
create or replace function public.servicos_precos_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.preco is not distinct from old.preco then
    return new;
  end if;
  perform public.registrar_auditoria('servico.preco_alterado', 'servicos_precos',
    coalesce(new.servico_id, old.servico_id)::text,
    jsonb_build_object('porte', coalesce(new.porte, old.porte),
                       'de', case when tg_op <> 'INSERT' then old.preco end,
                       'para', case when tg_op <> 'DELETE' then new.preco end));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_servicos_precos_auditoria on public.servicos_precos;
create trigger trg_servicos_precos_auditoria
  after insert or update or delete on public.servicos_precos
  for each row execute function public.servicos_precos_auditoria();

-- Horário de funcionamento (0 = domingo … 6 = sábado) ------------------------
create table if not exists public.horarios_funcionamento (
  dia_semana          smallint primary key,
  abre                time not null default '08:00',
  fecha               time not null default '18:00',
  intervalo_min       integer not null default 30,
  capacidade_por_slot integer not null default 1,
  pausa_inicio        time,
  pausa_fim           time,
  ativo               boolean not null default true
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'horarios_funcionamento_check') then
    alter table public.horarios_funcionamento add constraint horarios_funcionamento_check check (
      dia_semana between 0 and 6 and fecha > abre and intervalo_min between 5 and 240
      and capacidade_por_slot between 0 and 50
      and (pausa_inicio is null) = (pausa_fim is null)
      and (pausa_inicio is null or pausa_fim > pausa_inicio));
  end if;
end $$;

alter table public.horarios_funcionamento enable row level security;

drop policy if exists horarios_select on public.horarios_funcionamento;
create policy horarios_select on public.horarios_funcionamento
  for select to anon, authenticated using (true);
drop policy if exists horarios_admin_write on public.horarios_funcionamento;
create policy horarios_admin_write on public.horarios_funcionamento
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bloqueios (folga/feriado) e liberações extras ------------------------------
-- hora_inicio/hora_fim nulos em um bloqueio = dia inteiro bloqueado.
create table if not exists public.bloqueios_agenda (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  hora_inicio time,
  hora_fim    time,
  motivo      text not null default '',
  tipo        text not null default 'bloqueio',
  capacidade  integer,
  criado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bloqueios_agenda_check') then
    alter table public.bloqueios_agenda add constraint bloqueios_agenda_check check (
      tipo in ('bloqueio', 'liberacao')
      and (hora_inicio is null) = (hora_fim is null)
      and (hora_inicio is null or hora_fim > hora_inicio)
      and (tipo = 'bloqueio' or hora_inicio is not null)
      and (capacidade is null or capacidade between 1 and 50));
  end if;
end $$;

create index if not exists bloqueios_agenda_data_idx on public.bloqueios_agenda (data);

alter table public.bloqueios_agenda enable row level security;

drop policy if exists bloqueios_select on public.bloqueios_agenda;
create policy bloqueios_select on public.bloqueios_agenda
  for select to authenticated using (true);
drop policy if exists bloqueios_staff_write on public.bloqueios_agenda;
create policy bloqueios_staff_write on public.bloqueios_agenda
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Agendamentos: colunas novas (todas opcionais — o app continua funcionando) --
alter table public.agendamentos add column if not exists servico_id uuid references public.servicos (id) on delete set null;
alter table public.agendamentos add column if not exists pet_id uuid references public.pets (id) on delete set null;
alter table public.agendamentos add column if not exists porte text;
alter table public.agendamentos add column if not exists observacoes text;
alter table public.agendamentos add column if not exists motivo_cancelamento text;
alter table public.agendamentos add column if not exists origem text not null default 'app';
alter table public.agendamentos add column if not exists cliente_nome text;
alter table public.agendamentos add column if not exists cliente_telefone text;
alter table public.agendamentos add column if not exists criado_por uuid default auth.uid();
alter table public.agendamentos add column if not exists updated_at timestamptz default now();

-- Agendamento manual (cliente que ligou) pode não ter conta no app.
-- Remover o NOT NULL não afeta o app: o default auth.uid() continua preenchendo.
alter table public.agendamentos alter column user_id drop not null;

create index if not exists agendamentos_data_hora_idx on public.agendamentos (data, hora);
create index if not exists agendamentos_user_id_idx on public.agendamentos (user_id);
create index if not exists agendamentos_status_idx on public.agendamentos (status);

-- Policies da equipe (somam-se às "_own" dos clientes)
drop policy if exists staff_all_agendamentos on public.agendamentos;
create policy staff_all_agendamentos on public.agendamentos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Helpers ----------------------------------------------------------------------
-- "14:00", "14:00:00", " 9:30 " → time; formato inválido → null (não quebra o app)
create or replace function public.hora_para_time(p text)
returns time
language plpgsql immutable
as $$
begin
  return trim(p)::time;
exception when others then
  return null;
end $$;

create or replace function public.status_ocupa_vaga(p_status text)
returns boolean
language sql immutable
as $$
  select lower(coalesce(p_status, '')) not in ('cancelado', 'cancelada', 'falta');
$$;

-- Capacidade de um horário: 0 = fechado/bloqueado; null = agenda não configurada
create or replace function public.capacidade_slot(p_data date, p_hora time)
returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare
  h public.horarios_funcionamento;
  v_cap integer;
  v_lib boolean;
begin
  if exists (
    select 1 from public.bloqueios_agenda b
    where b.data = p_data and b.tipo = 'bloqueio'
      and (b.hora_inicio is null or (p_hora >= b.hora_inicio and p_hora < b.hora_fim))
  ) then
    return 0;
  end if;

  select true, b.capacidade into v_lib, v_cap
  from public.bloqueios_agenda b
  where b.data = p_data and b.tipo = 'liberacao'
    and p_hora >= b.hora_inicio and p_hora < b.hora_fim
  order by b.created_at desc
  limit 1;

  select * into h from public.horarios_funcionamento where dia_semana = extract(dow from p_data);

  if v_lib then
    return coalesce(v_cap, nullif(h.capacidade_por_slot, 0), 1);
  end if;

  if h.dia_semana is null then
    -- Tabela vazia = agenda ainda não configurada → sem restrição (comportamento legado)
    if exists (select 1 from public.horarios_funcionamento) then
      return 0;
    end if;
    return null;
  end if;

  if not h.ativo or p_hora < h.abre or p_hora >= h.fecha
     or (h.pausa_inicio is not null and p_hora >= h.pausa_inicio and p_hora < h.pausa_fim) then
    return 0;
  end if;

  return h.capacidade_por_slot;
end $$;

-- Anti-overbooking + preenchimento automático ----------------------------------
create or replace function public.agendamentos_validar()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_hora time := public.hora_para_time(new.hora);
  v_cap integer;
  v_ocupados integer;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.servico_id is null then
      select s.id into new.servico_id from public.servicos s where lower(s.nome) = lower(trim(new.servico)) limit 1;
    end if;
    if new.pet_id is null and new.user_id is not null and new.pet is not null then
      select p.id into new.pet_id from public.pets p
      where p.user_id = new.user_id and (p.pet_key = new.pet or lower(p.nome) = lower(trim(new.pet)))
      limit 1;
    end if;
    if new.porte is null and new.pet_id is not null then
      select nullif(nullif(p.porte, ''), '""') into new.porte from public.pets p where p.id = new.pet_id;
    end if;
    if public.is_staff() and new.origem = 'app' then
      new.origem := 'balcao';
    end if;
  end if;

  -- Só valida a vaga quando o agendamento passa a ocupar um horário
  if v_hora is null or not public.status_ocupa_vaga(new.status) then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.data = old.data and new.hora = old.hora
     and public.status_ocupa_vaga(old.status) then
    return new;
  end if;

  -- Serializa reservas concorrentes do mesmo horário
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || new.data::text || ' ' || v_hora::text, 0));

  v_cap := public.capacidade_slot(new.data, v_hora);
  if v_cap is null then
    return new;
  end if;
  if v_cap = 0 then
    raise exception 'HORARIO_INDISPONIVEL: % às % não está disponível', to_char(new.data, 'DD/MM/YYYY'), to_char(v_hora, 'HH24:MI')
      using errcode = 'P0001';
  end if;

  select count(*) into v_ocupados
  from public.agendamentos a
  where a.data = new.data
    and public.hora_para_time(a.hora) = v_hora
    and public.status_ocupa_vaga(a.status)
    and a.id <> new.id;

  if v_ocupados >= v_cap then
    raise exception 'HORARIO_LOTADO: % às % já atingiu a capacidade (%)', to_char(new.data, 'DD/MM/YYYY'), to_char(v_hora, 'HH24:MI'), v_cap
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_agendamentos_validar on public.agendamentos;
create trigger trg_agendamentos_validar
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_validar();

-- Auditoria: cancelamentos, faltas e mudanças de preço
create or replace function public.agendamentos_auditoria()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and lower(new.status) in ('cancelado', 'falta') then
    perform public.registrar_auditoria(
      case when lower(new.status) = 'falta' then 'agendamento.falta' else 'agendamento.cancelado' end,
      'agendamentos', new.id::text,
      jsonb_build_object('de', old.status, 'motivo', new.motivo_cancelamento,
                         'data', new.data, 'hora', new.hora, 'servico', new.servico, 'pet', new.pet));
  end if;
  if new.preco is distinct from old.preco then
    perform public.registrar_auditoria('agendamento.preco_alterado', 'agendamentos', new.id::text,
      jsonb_build_object('de', old.preco, 'para', new.preco));
  end if;
  if (new.data, new.hora) is distinct from (old.data, old.hora) then
    perform public.registrar_auditoria('agendamento.remarcado', 'agendamentos', new.id::text,
      jsonb_build_object('de', jsonb_build_object('data', old.data, 'hora', old.hora),
                         'para', jsonb_build_object('data', new.data, 'hora', new.hora)));
  end if;
  return new;
end $$;

drop trigger if exists trg_agendamentos_auditoria on public.agendamentos;
create trigger trg_agendamentos_auditoria
  after update on public.agendamentos
  for each row execute function public.agendamentos_auditoria();

-- RPC: horários livres de um dia (para o app e o portal) ------------------------
create or replace function public.horarios_livres(p_data date, p_servico_id uuid default null)
returns table (hora text, capacidade integer, ocupados integer, vagas integer)
language plpgsql stable security definer
set search_path = public
as $$
declare
  h public.horarios_funcionamento;
  v_passo integer;
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  select * into h from public.horarios_funcionamento where dia_semana = extract(dow from p_data);
  v_passo := coalesce(h.intervalo_min, 30);

  return query
  with candidatos as (
    -- grade do dia da semana
    select gs::time as t
    from generate_series(p_data + h.abre, p_data + h.fecha - interval '1 minute', make_interval(mins => v_passo)) gs
    where h.dia_semana is not null and h.ativo
    union
    -- liberações extras
    select gs::time
    from public.bloqueios_agenda b,
         generate_series(p_data + b.hora_inicio, p_data + b.hora_fim - interval '1 minute', make_interval(mins => v_passo)) gs
    where b.data = p_data and b.tipo = 'liberacao'
  ),
  calc as (
    select c.t,
           coalesce(public.capacidade_slot(p_data, c.t), 0) as cap,
           (select count(*)::integer from public.agendamentos a
             where a.data = p_data and public.hora_para_time(a.hora) = c.t
               and public.status_ocupa_vaga(a.status)) as ocup
    from candidatos c
    where p_data + c.t > v_agora
  )
  select to_char(calc.t, 'HH24:MI'), calc.cap, calc.ocup, greatest(calc.cap - calc.ocup, 0)
  from calc
  where calc.cap > calc.ocup
  order by calc.t;
end $$;

revoke all on function public.horarios_livres(date, uuid) from public;
grant execute on function public.horarios_livres(date, uuid) to anon, authenticated;
revoke all on function public.capacidade_slot(date, time) from public, anon;
grant execute on function public.capacidade_slot(date, time) to authenticated;
