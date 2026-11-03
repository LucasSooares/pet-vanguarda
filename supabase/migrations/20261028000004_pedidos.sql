-- =============================================================================
-- 0004 — Pedidos, itens, histórico de status; baixa/estorno de estoque por trigger
-- Fluxo: Novo → Confirmado → Em separação → Pronto | Saiu para entrega → Entregue
--        (Cancelado a partir de qualquer etapa antes de Entregue)
-- =============================================================================

create table if not exists public.pedidos (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity,
  user_id             uuid references auth.users (id) on delete set null default auth.uid(),
  status              text not null default 'Novo',
  total               numeric(10, 2) not null default 0,
  forma_pagamento     text,
  tipo_entrega        text not null default 'retirada',
  endereco            text,
  observacoes         text,
  motivo_cancelamento text,
  cliente_nome        text,
  cliente_telefone    text,
  estoque_baixado     boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists pedidos_numero_key on public.pedidos (numero);
create index if not exists pedidos_status_idx on public.pedidos (status, created_at desc);
create index if not exists pedidos_user_idx on public.pedidos (user_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_status_check') then
    alter table public.pedidos add constraint pedidos_status_check check (status in
      ('Novo', 'Confirmado', 'Em separação', 'Pronto', 'Saiu para entrega', 'Entregue', 'Cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_tipo_entrega_check') then
    alter table public.pedidos add constraint pedidos_tipo_entrega_check
      check (tipo_entrega in ('retirada', 'entrega'));
  end if;
end $$;

create table if not exists public.pedido_itens (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references public.pedidos (id) on delete cascade,
  produto_id uuid references public.produtos (id) on delete set null,
  nome       text not null,
  preco_unit numeric(10, 2) not null,
  quantidade integer not null
);
create index if not exists pedido_itens_pedido_idx on public.pedido_itens (pedido_id);
create index if not exists pedido_itens_produto_idx on public.pedido_itens (produto_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pedido_itens_valores_check') then
    alter table public.pedido_itens add constraint pedido_itens_valores_check
      check (quantidade > 0 and preco_unit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimentacoes_pedido_fkey') then
    alter table public.movimentacoes_estoque add constraint movimentacoes_pedido_fkey
      foreign key (pedido_id) references public.pedidos (id) on delete set null;
  end if;
end $$;

create table if not exists public.pedido_status_historico (
  id              bigint generated always as identity primary key,
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  status_anterior text,
  status_novo     text not null,
  observacao      text,
  user_id         uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index if not exists pedido_historico_idx on public.pedido_status_historico (pedido_id, created_at);

-- RLS ---------------------------------------------------------------------------
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.pedido_status_historico enable row level security;

-- Cliente: lê só os próprios pedidos. Criação/cancelamento via RPC.
drop policy if exists pedidos_select_own on public.pedidos;
create policy pedidos_select_own on public.pedidos
  for select to authenticated using (user_id = auth.uid());
drop policy if exists staff_all_pedidos on public.pedidos;
create policy staff_all_pedidos on public.pedidos
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists pedido_itens_select_own on public.pedido_itens;
create policy pedido_itens_select_own on public.pedido_itens
  for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid()));
drop policy if exists staff_all_pedido_itens on public.pedido_itens;
create policy staff_all_pedido_itens on public.pedido_itens
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists pedido_historico_select on public.pedido_status_historico;
create policy pedido_historico_select on public.pedido_status_historico
  for select to authenticated
  using (public.is_staff()
         or exists (select 1 from public.pedidos p where p.id = pedido_id and p.user_id = auth.uid()));

-- Total sempre recalculado a partir dos itens ----------------------------------
create or replace function public.pedido_itens_recalcular_total()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set total = coalesce((select sum(preco_unit * quantidade) from public.pedido_itens where pedido_id = v_pedido), 0)
   where id = v_pedido;
  return null;
end $$;

drop trigger if exists trg_pedido_itens_total on public.pedido_itens;
create trigger trg_pedido_itens_total
  after insert or update or delete on public.pedido_itens
  for each row execute function public.pedido_itens_recalcular_total();

-- Itens só podem mudar enquanto o pedido está "Novo"
create or replace function public.pedido_itens_bloqueia_edicao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select status from public.pedidos where id = coalesce(new.pedido_id, old.pedido_id)) <> 'Novo' then
    raise exception 'PEDIDO_TRAVADO: itens só podem ser alterados com o pedido em "Novo"';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_pedido_itens_bloqueia on public.pedido_itens;
create trigger trg_pedido_itens_bloqueia
  before insert or update or delete on public.pedido_itens
  for each row execute function public.pedido_itens_bloqueia_edicao();

-- Transições de status, baixa/estorno de estoque, histórico e auditoria ---------
create or replace function public.pedido_transicao_valida(p_de text, p_para text)
returns boolean
language sql immutable
as $$
  select case p_de
    when 'Novo'              then p_para in ('Confirmado', 'Cancelado')
    when 'Confirmado'        then p_para in ('Em separação', 'Cancelado')
    when 'Em separação'      then p_para in ('Pronto', 'Saiu para entrega', 'Cancelado')
    when 'Pronto'            then p_para in ('Entregue', 'Cancelado')
    when 'Saiu para entrega' then p_para in ('Entregue', 'Cancelado')
    else false
  end;
$$;

create or replace function public.pedidos_mudar_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  it record;
begin
  new.updated_at := now();
  -- estoque_baixado é controlado só por este trigger
  new.estoque_baixado := old.estoque_baixado;
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not public.pedido_transicao_valida(old.status, new.status) then
    raise exception 'TRANSICAO_INVALIDA: de "%" para "%"', old.status, new.status using errcode = 'P0001';
  end if;

  -- Baixa ao confirmar
  if new.status = 'Confirmado' and not old.estoque_baixado then
    for it in select * from public.pedido_itens where pedido_id = new.id and produto_id is not null loop
      insert into public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, pedido_id)
      values (it.produto_id, 'saida', it.quantidade, 'Pedido #' || new.numero || ' confirmado', new.id);
    end loop;
    new.estoque_baixado := true;
  end if;

  -- Estorno ao cancelar (somente se já tinha baixado)
  if new.status = 'Cancelado' and old.estoque_baixado then
    for it in select * from public.pedido_itens where pedido_id = new.id and produto_id is not null loop
      insert into public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, pedido_id)
      values (it.produto_id, 'entrada', it.quantidade, 'Estorno do pedido #' || new.numero || ' cancelado', new.id);
    end loop;
    new.estoque_baixado := false;
  end if;

  insert into public.pedido_status_historico (pedido_id, status_anterior, status_novo, observacao)
  values (new.id, old.status, new.status,
          case when new.status = 'Cancelado' then new.motivo_cancelamento end);

  if new.status = 'Cancelado' then
    perform public.registrar_auditoria('pedido.cancelado', 'pedidos', new.id::text,
      jsonb_build_object('numero', new.numero, 'de', old.status, 'motivo', new.motivo_cancelamento,
                         'total', new.total, 'estornado', old.estoque_baixado));
  end if;

  return new;
end $$;

drop trigger if exists trg_pedidos_mudar_status on public.pedidos;
create trigger trg_pedidos_mudar_status
  before update on public.pedidos
  for each row execute function public.pedidos_mudar_status();

create or replace function public.pedidos_historico_inicial()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.pedido_status_historico (pedido_id, status_anterior, status_novo)
  values (new.id, null, new.status);
  return null;
end $$;

drop trigger if exists trg_pedidos_historico_inicial on public.pedidos;
create trigger trg_pedidos_historico_inicial
  after insert on public.pedidos
  for each row execute function public.pedidos_historico_inicial();

-- RPC para o app: criar pedido com preços vindos do banco ------------------------
-- p_itens: [{"produto_id": "uuid", "quantidade": 2}, ...]
create or replace function public.criar_pedido(
  p_itens jsonb,
  p_forma_pagamento text default null,
  p_tipo_entrega text default 'retirada',
  p_endereco text default null,
  p_observacoes text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido uuid;
  v_item jsonb;
  v_prod public.produtos;
  v_qtd integer;
begin
  if auth.uid() is null then
    raise exception 'NAO_AUTENTICADO' using errcode = '42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'PEDIDO_VAZIO';
  end if;
  if p_tipo_entrega = 'entrega' and coalesce(trim(p_endereco), '') = '' then
    raise exception 'ENDERECO_OBRIGATORIO';
  end if;

  insert into public.pedidos (user_id, forma_pagamento, tipo_entrega, endereco, observacoes)
  values (auth.uid(), p_forma_pagamento, coalesce(p_tipo_entrega, 'retirada'), p_endereco, p_observacoes)
  returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd <= 0 or v_qtd > 999 then
      raise exception 'QUANTIDADE_INVALIDA';
    end if;
    select * into v_prod from public.produtos where id = (v_item ->> 'produto_id')::uuid and ativo;
    if v_prod.id is null then
      raise exception 'PRODUTO_INDISPONIVEL: %', v_item ->> 'produto_id';
    end if;
    if v_prod.estoque_atual < v_qtd then
      raise exception 'ESTOQUE_INSUFICIENTE: "%" tem % em estoque', v_prod.nome, v_prod.estoque_atual;
    end if;
    insert into public.pedido_itens (pedido_id, produto_id, nome, preco_unit, quantidade)
    values (v_pedido, v_prod.id, v_prod.nome, v_prod.preco, v_qtd);
  end loop;

  return v_pedido;
end $$;

-- Cliente pode cancelar o próprio pedido enquanto ainda está "Novo"
create or replace function public.cancelar_meu_pedido(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.pedidos
     set status = 'Cancelado', motivo_cancelamento = coalesce(p_motivo, 'Cancelado pelo cliente')
   where id = p_pedido_id and user_id = auth.uid() and status = 'Novo';
  if not found then
    raise exception 'NAO_PERMITIDO: o pedido não existe ou já foi confirmado';
  end if;
end $$;

revoke all on function public.criar_pedido(jsonb, text, text, text, text), public.cancelar_meu_pedido(uuid, text) from public, anon;
grant execute on function public.criar_pedido(jsonb, text, text, text, text), public.cancelar_meu_pedido(uuid, text) to authenticated;
