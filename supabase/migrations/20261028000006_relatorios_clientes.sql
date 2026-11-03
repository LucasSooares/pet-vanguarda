-- =============================================================================
-- 0006 — Funções de leitura do portal: dashboard, relatórios e clientes
-- Faturamento: serviços = agendamentos "Concluído"; produtos = pedidos que
-- passaram de "Novo" e não foram cancelados.
-- =============================================================================

create or replace function public.exigir_staff()
returns void
language plpgsql stable
as $$
begin
  if not public.is_staff() then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;
end $$;

create or replace function public.hoje_sp()
returns date
language sql stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create or replace function public.pedido_fatura(p_status text)
returns boolean
language sql immutable
as $$ select p_status in ('Confirmado', 'Em separação', 'Pronto', 'Saiu para entrega', 'Entregue'); $$;

-- Cartões do dashboard -----------------------------------------------------------
create or replace function public.dashboard_resumo()
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_hoje date := public.hoje_sp();
  v_res jsonb;
begin
  perform public.exigir_staff();

  with serv as (
    select (created_at at time zone 'America/Sao_Paulo')::date as dia_criacao, data, preco, status
    from public.agendamentos
  ), vend as (
    select (created_at at time zone 'America/Sao_Paulo')::date as dia, total, status
    from public.pedidos
  )
  select jsonb_build_object(
    'agendamentos_hoje',  (select count(*) from serv where data = v_hoje and public.status_ocupa_vaga(status)),
    'agendamentos_amanha',(select count(*) from serv where data = v_hoje + 1 and public.status_ocupa_vaga(status)),
    'pendentes',          (select count(*) from serv where lower(status) = 'pendente' and data >= v_hoje),
    'pedidos_novos',      (select count(*) from vend where status = 'Novo'),
    'estoque_baixo',      (select count(*) from public.produtos where ativo and estoque_atual <= estoque_minimo),
    'fat_dia',    (select coalesce(sum(preco), 0) from serv where status = 'Concluído' and data = v_hoje)
                + (select coalesce(sum(total), 0) from vend where public.pedido_fatura(status) and dia = v_hoje),
    'fat_semana', (select coalesce(sum(preco), 0) from serv where status = 'Concluído' and data >= date_trunc('week', v_hoje)::date and data <= v_hoje)
                + (select coalesce(sum(total), 0) from vend where public.pedido_fatura(status) and dia >= date_trunc('week', v_hoje)::date),
    'fat_mes',    (select coalesce(sum(preco), 0) from serv where status = 'Concluído' and data >= date_trunc('month', v_hoje)::date and data <= v_hoje)
                + (select coalesce(sum(total), 0) from vend where public.pedido_fatura(status) and dia >= date_trunc('month', v_hoje)::date)
  ) into v_res;

  return v_res;
end $$;

-- Série diária para gráficos e relatório de faturamento ------------------------
create or replace function public.serie_diaria(p_inicio date, p_fim date)
returns table (dia date, agendamentos bigint, cancelados bigint, faturamento_servicos numeric,
               pedidos bigint, faturamento_produtos numeric)
language plpgsql stable
set search_path = public
as $$
begin
  perform public.exigir_staff();
  return query
    with dias as (select generate_series(p_inicio, p_fim, interval '1 day')::date as d),
    a as (
      select data as d,
             count(*) filter (where public.status_ocupa_vaga(status)) as qtd,
             count(*) filter (where lower(status) in ('cancelado', 'falta')) as canc,
             coalesce(sum(preco) filter (where status = 'Concluído'), 0) as fat
      from public.agendamentos where data between p_inicio and p_fim group by data
    ),
    p as (
      select (created_at at time zone 'America/Sao_Paulo')::date as d,
             count(*) filter (where public.pedido_fatura(status)) as qtd,
             coalesce(sum(total) filter (where public.pedido_fatura(status)), 0) as fat
      from public.pedidos
      where (created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      group by 1
    )
    select dias.d, coalesce(a.qtd, 0), coalesce(a.canc, 0), coalesce(a.fat, 0),
           coalesce(p.qtd, 0), coalesce(p.fat, 0)
    from dias left join a on a.d = dias.d left join p on p.d = dias.d
    order by dias.d;
end $$;

create or replace function public.relatorio_servicos(p_inicio date, p_fim date)
returns table (servico text, quantidade bigint, concluidos bigint, cancelados bigint, faltas bigint, faturamento numeric)
language plpgsql stable
set search_path = public
as $$
begin
  perform public.exigir_staff();
  return query
    select a.servico, count(*),
           count(*) filter (where a.status = 'Concluído'),
           count(*) filter (where lower(a.status) = 'cancelado'),
           count(*) filter (where lower(a.status) = 'falta'),
           coalesce(sum(a.preco) filter (where a.status = 'Concluído'), 0)
    from public.agendamentos a
    where a.data between p_inicio and p_fim
    group by a.servico
    order by 2 desc;
end $$;

create or replace function public.relatorio_produtos(p_inicio date, p_fim date)
returns table (produto_id uuid, nome text, quantidade bigint, faturamento numeric)
language plpgsql stable
set search_path = public
as $$
begin
  perform public.exigir_staff();
  return query
    select i.produto_id, max(i.nome), sum(i.quantidade)::bigint, sum(i.quantidade * i.preco_unit)
    from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
    where public.pedido_fatura(p.status)
      and (p.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    group by i.produto_id
    order by 3 desc;
end $$;

-- Clientes (Auth + profiles) -----------------------------------------------------
create or replace function public.listar_clientes(p_busca text default null)
returns table (user_id uuid, nome text, email text, telefone text, criado_em timestamptz,
               pets bigint, agendamentos bigint, pedidos bigint, ultimo_agendamento date)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform public.exigir_staff();
  return query
    select u.id,
           coalesce(nullif(pr.nome, ''), u.raw_user_meta_data ->> 'nome', u.raw_user_meta_data ->> 'name')::text,
           u.email::text,
           coalesce(nullif(pr.telefone, ''), u.raw_user_meta_data ->> 'telefone', u.phone)::text,
           u.created_at,
           (select count(*) from public.pets x where x.user_id = u.id),
           (select count(*) from public.agendamentos x where x.user_id = u.id),
           (select count(*) from public.pedidos x where x.user_id = u.id),
           (select max(x.data) from public.agendamentos x where x.user_id = u.id)
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where not exists (select 1 from public.admins a where a.user_id = u.id)
      and (p_busca is null or p_busca = ''
           or u.email ilike '%' || p_busca || '%'
           or pr.nome ilike '%' || p_busca || '%'
           or pr.telefone ilike '%' || p_busca || '%'
           or u.raw_user_meta_data ->> 'nome' ilike '%' || p_busca || '%'
           or exists (select 1 from public.pets x where x.user_id = u.id and x.nome ilike '%' || p_busca || '%'))
    order by u.created_at desc;
end $$;

-- Nome/telefone de um conjunto de clientes (para cards da agenda e pedidos)
create or replace function public.clientes_resumo(p_ids uuid[])
returns table (user_id uuid, nome text, email text, telefone text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  perform public.exigir_staff();
  return query
    select u.id,
           coalesce(nullif(pr.nome, ''), u.raw_user_meta_data ->> 'nome', split_part(u.email::text, '@', 1))::text,
           u.email::text,
           coalesce(nullif(pr.telefone, ''), u.raw_user_meta_data ->> 'telefone', u.phone)::text
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where u.id = any (p_ids);
end $$;

revoke all on function public.listar_clientes(text), public.clientes_resumo(uuid[]),
  public.dashboard_resumo(), public.serie_diaria(date, date), public.relatorio_servicos(date, date),
  public.relatorio_produtos(date, date), public.relatorio_giro_estoque(date, date) from public, anon;
grant execute on function public.listar_clientes(text), public.clientes_resumo(uuid[]),
  public.dashboard_resumo(), public.serie_diaria(date, date), public.relatorio_servicos(date, date),
  public.relatorio_produtos(date, date), public.relatorio_giro_estoque(date, date) to authenticated;
