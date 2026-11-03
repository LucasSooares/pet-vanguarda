-- =============================================================================
-- 0005 — Storage (bucket "produtos"), Realtime, configurações do petshop
-- =============================================================================

-- Bucket público de imagens de produtos; escrita só por admin --------------------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists produtos_imagens_leitura on storage.objects;
create policy produtos_imagens_leitura on storage.objects
  for select to anon, authenticated using (bucket_id = 'produtos');

drop policy if exists produtos_imagens_admin_insert on storage.objects;
create policy produtos_imagens_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'produtos' and public.is_admin());

drop policy if exists produtos_imagens_admin_update on storage.objects;
create policy produtos_imagens_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'produtos' and public.is_admin())
  with check (bucket_id = 'produtos' and public.is_admin());

drop policy if exists produtos_imagens_admin_delete on storage.objects;
create policy produtos_imagens_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'produtos' and public.is_admin());

-- Realtime (respeita RLS: cliente recebe só as próprias linhas) ------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamentos') then
    alter publication supabase_realtime add table public.agendamentos;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos') then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;

-- Configurações (linha única) -------------------------------------------------
create table if not exists public.configuracoes (
  id         smallint primary key default 1,
  nome       text not null default 'Pet Vanguarda',
  telefone   text,
  whatsapp   text,
  email      text,
  endereco   text,
  cnpj       text,
  instagram  text,
  mensagens  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint configuracoes_linha_unica check (id = 1)
);

insert into public.configuracoes (id, mensagens)
values (1, jsonb_build_object(
  'agendamento_confirmado', 'Olá {cliente}! O agendamento de {servico} para {pet} em {data} às {hora} está confirmado. Até lá! 🐾',
  'agendamento_cancelado', 'Olá {cliente}, o agendamento de {servico} em {data} às {hora} foi cancelado. Motivo: {motivo}.',
  'lembrete', 'Olá {cliente}! Lembrete: {pet} tem {servico} amanhã ({data}) às {hora}.',
  'pedido_pronto', 'Olá {cliente}! Seu pedido #{numero} está pronto para retirada.',
  'pedido_saiu', 'Olá {cliente}! Seu pedido #{numero} saiu para entrega.'))
on conflict (id) do nothing;

alter table public.configuracoes enable row level security;

drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes
  for select to anon, authenticated using (true);
drop policy if exists configuracoes_admin_update on public.configuracoes;
create policy configuracoes_admin_update on public.configuracoes
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
