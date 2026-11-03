-- =============================================================================
-- 0003 — Categorias, produtos e movimentações de estoque
-- estoque_atual só muda via movimentacoes_estoque (trigger) e nunca fica negativo.
-- =============================================================================

create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ativo      boolean not null default true,
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists categorias_nome_key on public.categorias (lower(nome));

create table if not exists public.produtos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  descricao      text,
  preco          numeric(10, 2) not null default 0,
  sku            text,
  categoria_id   uuid references public.categorias (id) on delete set null,
  imagem_url     text,
  ativo          boolean not null default true,
  estoque_atual  integer not null default 0,
  estoque_minimo integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists produtos_sku_key on public.produtos (lower(sku)) where sku is not null and sku <> '';
create index if not exists produtos_categoria_idx on public.produtos (categoria_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_valores_check') then
    alter table public.produtos add constraint produtos_valores_check
      check (preco >= 0 and estoque_atual >= 0 and estoque_minimo >= 0);
  end if;
end $$;

create table if not exists public.movimentacoes_estoque (
  id             bigint generated always as identity primary key,
  produto_id     uuid not null references public.produtos (id) on delete cascade,
  tipo           text not null,
  quantidade     integer not null,
  saldo_anterior integer,
  saldo_posterior integer,
  motivo         text not null default '',
  pedido_id      uuid,
  user_id        uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists movimentacoes_produto_idx on public.movimentacoes_estoque (produto_id, created_at desc);
create index if not exists movimentacoes_pedido_idx on public.movimentacoes_estoque (pedido_id);

-- entrada/saida: quantidade > 0 (somada/subtraída). ajuste: quantidade = novo saldo (>= 0).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimentacoes_tipo_check') then
    alter table public.movimentacoes_estoque add constraint movimentacoes_tipo_check check (
      (tipo in ('entrada', 'saida') and quantidade > 0) or (tipo = 'ajuste' and quantidade >= 0));
  end if;
end $$;

-- RLS ---------------------------------------------------------------------------
alter table public.categorias enable row level security;
alter table public.produtos enable row level security;
alter table public.movimentacoes_estoque enable row level security;

drop policy if exists categorias_select on public.categorias;
create policy categorias_select on public.categorias
  for select to anon, authenticated using (ativo or public.is_staff());
drop policy if exists categorias_admin_write on public.categorias;
create policy categorias_admin_write on public.categorias
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists produtos_select on public.produtos;
create policy produtos_select on public.produtos
  for select to anon, authenticated using (ativo or public.is_staff());
drop policy if exists produtos_admin_write on public.produtos;
create policy produtos_admin_write on public.produtos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists movimentacoes_select on public.movimentacoes_estoque;
create policy movimentacoes_select on public.movimentacoes_estoque
  for select to authenticated using (public.is_staff());
drop policy if exists movimentacoes_admin_insert on public.movimentacoes_estoque;
create policy movimentacoes_admin_insert on public.movimentacoes_estoque
  for insert to authenticated with check (public.is_admin());
-- Sem UPDATE/DELETE: o histórico é imutável.

-- Protege estoque_atual de alterações diretas ------------------------------------
create or replace function public.produtos_protege_estoque()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.mov_estoque', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.estoque_atual := 0;
    elsif new.estoque_atual is distinct from old.estoque_atual then
      raise exception 'ESTOQUE_DIRETO: use uma movimentação de estoque para alterar o saldo';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_produtos_protege_estoque on public.produtos;
create trigger trg_produtos_protege_estoque
  before insert or update on public.produtos
  for each row execute function public.produtos_protege_estoque();

create or replace function public.produtos_auditoria_preco()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.preco is distinct from old.preco then
    perform public.registrar_auditoria('produto.preco_alterado', 'produtos', new.id::text,
      jsonb_build_object('nome', new.nome, 'de', old.preco, 'para', new.preco));
  end if;
  return new;
end $$;

drop trigger if exists trg_produtos_auditoria_preco on public.produtos;
create trigger trg_produtos_auditoria_preco
  after update on public.produtos
  for each row execute function public.produtos_auditoria_preco();

-- Aplica a movimentação no saldo (com lock da linha do produto) -------------------
create or replace function public.movimentacoes_aplicar()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_saldo integer;
  v_nome text;
  v_novo integer;
begin
  select estoque_atual, nome into v_saldo, v_nome
  from public.produtos where id = new.produto_id
  for update;

  if not found then
    raise exception 'PRODUTO_NAO_ENCONTRADO';
  end if;

  v_novo := case new.tipo
    when 'entrada' then v_saldo + new.quantidade
    when 'saida' then v_saldo - new.quantidade
    else new.quantidade
  end;

  if v_novo < 0 then
    raise exception 'ESTOQUE_INSUFICIENTE: "%" tem % em estoque, saída de %', v_nome, v_saldo, new.quantidade
      using errcode = 'P0001';
  end if;

  new.saldo_anterior := v_saldo;
  new.saldo_posterior := v_novo;

  perform set_config('app.mov_estoque', 'on', true);
  update public.produtos set estoque_atual = v_novo where id = new.produto_id;
  perform set_config('app.mov_estoque', 'off', true);

  if new.tipo = 'ajuste' or new.pedido_id is null then
    perform public.registrar_auditoria('estoque.' || new.tipo, 'produtos', new.produto_id::text,
      jsonb_build_object('nome', v_nome, 'quantidade', new.quantidade,
                         'de', v_saldo, 'para', v_novo, 'motivo', new.motivo));
  end if;

  return new;
end $$;

drop trigger if exists trg_movimentacoes_aplicar on public.movimentacoes_estoque;
create trigger trg_movimentacoes_aplicar
  before insert on public.movimentacoes_estoque
  for each row execute function public.movimentacoes_aplicar();

-- Relatório de giro: saídas no período x saldo atual
create or replace function public.relatorio_giro_estoque(p_inicio date, p_fim date)
returns table (produto_id uuid, nome text, sku text, estoque_atual integer, estoque_minimo integer,
               entradas bigint, saidas bigint, giro numeric, dias_cobertura numeric)
language plpgsql stable
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'ACESSO_NEGADO' using errcode = '42501';
  end if;
  return query
    select p.id, p.nome, p.sku, p.estoque_atual, p.estoque_minimo,
           coalesce(sum(m.quantidade) filter (where m.tipo = 'entrada'), 0),
           coalesce(sum(m.quantidade) filter (where m.tipo = 'saida'), 0),
           round(coalesce(sum(m.quantidade) filter (where m.tipo = 'saida'), 0)::numeric
                 / nullif(p.estoque_atual, 0), 2),
           round(p.estoque_atual / nullif(coalesce(sum(m.quantidade) filter (where m.tipo = 'saida'), 0)::numeric
                 / greatest(p_fim - p_inicio + 1, 1), 0), 1)
    from public.produtos p
    left join public.movimentacoes_estoque m
      on m.produto_id = p.id
     and m.created_at >= p_inicio
     and m.created_at < p_fim + 1
    group by p.id
    order by 7 desc, p.nome;
end $$;
