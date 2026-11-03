-- Inspeção SOMENTE LEITURA do schema atual (não altera nada).
-- Rode no Supabase: SQL Editor > New query > cole tudo > Run.
-- Copie o JSON do resultado (uma única célula) e envie de volta.
select jsonb_pretty(jsonb_build_object(
  'colunas', (
    select jsonb_agg(jsonb_build_object(
      'tabela', c.table_name, 'coluna', c.column_name, 'tipo', c.data_type,
      'nulo', c.is_nullable, 'default', c.column_default) order by c.table_name, c.ordinal_position)
    from information_schema.columns c where c.table_schema = 'public'),
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      'tabela', conrelid::regclass::text, 'nome', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint where connamespace = 'public'::regnamespace),
  'indices', (
    select jsonb_agg(jsonb_build_object('tabela', tablename, 'def', indexdef))
    from pg_indexes where schemaname = 'public'),
  'rls', (
    select jsonb_agg(jsonb_build_object('tabela', relname, 'rls', relrowsecurity))
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'),
  'policies', (
    select jsonb_agg(jsonb_build_object(
      'tabela', tablename, 'nome', policyname, 'cmd', cmd, 'roles', roles,
      'using', qual, 'check', with_check))
    from pg_policies where schemaname in ('public', 'storage')),
  'funcoes', (
    select jsonb_agg(jsonb_build_object('nome', p.proname, 'args', pg_get_function_arguments(p.oid)))
    from pg_proc p where p.pronamespace = 'public'::regnamespace),
  'triggers', (
    select jsonb_agg(jsonb_build_object('tabela', event_object_table, 'nome', trigger_name,
      'acao', action_statement))
    from information_schema.triggers where trigger_schema = 'public'),
  'status_agendamentos', (
    select jsonb_agg(jsonb_build_object('status', status, 'qtd', n))
    from (select status, count(*) n from public.agendamentos group by status) s),
  'servicos_em_uso', (
    select jsonb_agg(jsonb_build_object('servico', servico, 'qtd', n, 'precos', precos))
    from (select servico, count(*) n, jsonb_agg(distinct preco) precos
          from public.agendamentos group by servico) s),
  'exemplo_data_hora', (
    select jsonb_agg(jsonb_build_object('data', data, 'hora', hora, 'pet', pet))
    from (select data, hora, pet from public.agendamentos order by created_at desc limit 5) s),
  'portes_em_uso', (
    select jsonb_agg(distinct porte) from public.pets),
  'buckets', (
    select jsonb_agg(jsonb_build_object('id', id, 'public', public)) from storage.buckets),
  'realtime', (
    select jsonb_agg(tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
  'tabelas_perfil', (
    select jsonb_agg(table_name) from information_schema.tables
    where table_schema = 'public' and table_name ilike any (array['%perfil%','%profile%','%cliente%','%usuario%']))
)) as schema;
