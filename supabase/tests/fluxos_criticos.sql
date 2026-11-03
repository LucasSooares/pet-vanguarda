-- =============================================================================
-- Testes dos fluxos críticos — rodam DENTRO do banco e NÃO deixam rastro:
-- o bloco sempre termina com RAISE EXCEPTION, o que desfaz tudo (rollback).
--   Resultado esperado: erro "TODOS OS TESTES PASSARAM (...)".
--   Qualquer outra mensagem indica a verificação que falhou.
-- Rodar: SQL Editor do Supabase (cole e Run) ou `npm run test:db:sql`.
-- Pré-requisito: migrations 0001–0006 aplicadas.
-- =============================================================================
do $$
declare
  u_a uuid := gen_random_uuid();   -- cliente A
  u_b uuid := gen_random_uuid();   -- cliente B
  u_adm uuid := gen_random_uuid(); -- admin
  u_ate uuid := gen_random_uuid(); -- atendente
  v_dia date := date '2030-01-07'; -- segunda-feira
  v_ag_a uuid;
  v_ag_b uuid;
  v_prod uuid;
  v_ped uuid;
  v_ped2 uuid;
  n integer;
  v_txt text;
  v_ok integer := 0;
begin
  -- ---------- preparação (como postgres) ----------
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email,
         '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values (u_a, 'teste-a@teste.local'), (u_b, 'teste-b@teste.local'),
               (u_adm, 'teste-adm@teste.local'), (u_ate, 'teste-ate@teste.local')) as x (id, email);

  insert into public.admins (user_id, nome, papel) values (u_adm, 'Admin Teste', 'admin'), (u_ate, 'Atendente Teste', 'atendente');

  -- Segunda: 08–12, slots de 30 min, 1 vaga por slot, pausa 10:00–10:30 fica fora; usamos 09:00
  delete from public.bloqueios_agenda where data = v_dia;
  insert into public.horarios_funcionamento (dia_semana, abre, fecha, intervalo_min, capacidade_por_slot, pausa_inicio, pausa_fim, ativo)
  values (1, '08:00', '12:00', 30, 1, '10:00', '10:30', true)
  on conflict (dia_semana) do update set abre = excluded.abre, fecha = excluded.fecha, intervalo_min = 30,
    capacidade_por_slot = 1, pausa_inicio = excluded.pausa_inicio, pausa_fim = excluded.pausa_fim, ativo = true;

  -- ================= Cliente A =================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);

  insert into public.agendamentos (servico, pet, data, hora, preco, status)
  values ('Banho', 'Rex', v_dia, '09:00', 50, 'Pendente') returning id into v_ag_a;
  v_ok := v_ok + 1;

  assert not public.is_admin() and not public.is_staff(), 'cliente não pode ser staff';
  v_ok := v_ok + 1;

  begin
    insert into public.admins (user_id, nome, papel) values (u_a, 'Hacker', 'admin');
    raise exception 'FALHOU: cliente conseguiu se inserir em admins';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  select count(*) into n from public.audit_log;
  assert n = 0, 'FALHOU: cliente leu audit_log';
  v_ok := v_ok + 1;

  begin
    insert into public.produtos (nome, preco) values ('X', 1);
    raise exception 'FALHOU: cliente criou produto';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- ================= Cliente B =================
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);

  select count(*) into n from public.agendamentos where id = v_ag_a;
  assert n = 0, 'FALHOU: cliente B vê agendamento do cliente A';
  v_ok := v_ok + 1;

  update public.agendamentos set status = 'Cancelado' where id = v_ag_a;
  get diagnostics n = row_count;
  assert n = 0, 'FALHOU: cliente B alterou agendamento do cliente A';
  v_ok := v_ok + 1;

  -- anti-overbooking: 09:00 já tem 1/1
  begin
    insert into public.agendamentos (servico, pet, data, hora, preco) values ('Tosa', 'Mia', v_dia, '09:00', 60);
    raise exception 'FALHOU: overbooking permitido';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'HORARIO_LOTADO%', 'FALHOU: esperado HORARIO_LOTADO, veio ' || v_txt;
    v_ok := v_ok + 1;
  end;

  -- pausa (10:00) e fora do expediente (13:00) são indisponíveis
  begin
    insert into public.agendamentos (servico, pet, data, hora) values ('Tosa', 'Mia', v_dia, '10:00');
    raise exception 'FALHOU: agendou na pausa';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'HORARIO_INDISPONIVEL%', 'FALHOU: esperado HORARIO_INDISPONIVEL, veio ' || v_txt;
    v_ok := v_ok + 1;
  end;

  insert into public.agendamentos (servico, pet, data, hora, preco) values ('Tosa', 'Mia', v_dia, '09:30', 60)
  returning id into v_ag_b;

  -- RPC de horários livres não oferece 09:00 (lotado), 09:30 (lotado) nem 10:00 (pausa)
  select count(*) into n from public.horarios_livres(v_dia) where hora in ('09:00', '09:30', '10:00');
  assert n = 0, 'FALHOU: horarios_livres ofereceu horário lotado/pausa';
  select count(*) into n from public.horarios_livres(v_dia) where hora = '08:00' and vagas = 1;
  assert n = 1, 'FALHOU: horarios_livres não ofereceu 08:00';
  v_ok := v_ok + 1;

  -- ================= Atendente =================
  perform set_config('request.jwt.claims', json_build_object('sub', u_ate, 'role', 'authenticated')::text, true);
  assert public.is_staff() and not public.is_admin(), 'FALHOU: papel do atendente';

  select count(*) into n from public.agendamentos where id in (v_ag_a, v_ag_b);
  assert n = 2, 'FALHOU: atendente não vê todos os agendamentos';
  v_ok := v_ok + 1;

  update public.agendamentos set status = 'Confirmado' where id = v_ag_a;
  get diagnostics n = row_count;
  assert n = 1, 'FALHOU: atendente não confirmou';
  v_ok := v_ok + 1;

  update public.agendamentos set status = 'Cancelado', motivo_cancelamento = 'Cliente desistiu' where id = v_ag_a;
  select count(*) into n from public.audit_log
   where acao = 'agendamento.cancelado' and entidade_id = v_ag_a::text and user_id = u_ate;
  assert n = 1, 'FALHOU: cancelamento não auditado';
  v_ok := v_ok + 1;

  -- vaga liberada após cancelamento
  insert into public.agendamentos (user_id, servico, pet, data, hora, origem, cliente_nome)
  values (null, 'Banho', 'Thor', v_dia, '09:00', 'balcao', 'Cliente do telefone');
  v_ok := v_ok + 1;

  -- remarcar para horário lotado falha
  begin
    update public.agendamentos set hora = '09:00' where id = v_ag_b;
    raise exception 'FALHOU: remarcou para horário lotado';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'HORARIO_LOTADO%', 'FALHOU: remarcação, veio ' || v_txt;
    v_ok := v_ok + 1;
  end;

  -- atendente não mexe em produtos/preços
  begin
    insert into public.produtos (nome, preco) values ('X', 1);
    raise exception 'FALHOU: atendente criou produto';
  exception when insufficient_privilege then v_ok := v_ok + 1;
  end;

  -- ================= Admin: estoque =================
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);

  insert into public.produtos (nome, preco, sku, estoque_atual) values ('Produto Teste', 10, 'TESTE-XYZ-1', 999)
  returning id into v_prod;
  select estoque_atual into n from public.produtos where id = v_prod;
  assert n = 0, 'FALHOU: estoque inicial deveria ser forçado a 0';

  insert into public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo) values (v_prod, 'entrada', 5, 'teste');
  select estoque_atual into n from public.produtos where id = v_prod;
  assert n = 5, 'FALHOU: entrada não somou';
  v_ok := v_ok + 1;

  begin
    update public.produtos set estoque_atual = 100 where id = v_prod;
    raise exception 'FALHOU: alterou estoque direto';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'ESTOQUE_DIRETO%', 'FALHOU: ' || v_txt;
    v_ok := v_ok + 1;
  end;

  begin
    insert into public.movimentacoes_estoque (produto_id, tipo, quantidade) values (v_prod, 'saida', 6);
    raise exception 'FALHOU: estoque ficou negativo';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'ESTOQUE_INSUFICIENTE%', 'FALHOU: ' || v_txt;
    v_ok := v_ok + 1;
  end;

  update public.produtos set preco = 12 where id = v_prod;
  select count(*) into n from public.audit_log where acao = 'produto.preco_alterado' and entidade_id = v_prod::text;
  assert n = 1, 'FALHOU: mudança de preço não auditada';
  v_ok := v_ok + 1;

  -- ================= Pedidos: baixa e estorno =================
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  v_ped := public.criar_pedido(jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 3)), 'pix', 'retirada');
  select total::integer into n from public.pedidos where id = v_ped;
  assert n = 36, 'FALHOU: total do pedido (esperado 36), veio ' || n;
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.pedidos where id = v_ped;
  assert n = 0, 'FALHOU: cliente B vê pedido do cliente A';
  v_ok := v_ok + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u_ate, 'role', 'authenticated')::text, true);
  update public.pedidos set status = 'Confirmado' where id = v_ped;
  select estoque_atual into n from public.produtos where id = v_prod;
  assert n = 2, 'FALHOU: baixa ao confirmar (esperado 2), veio ' || n;
  v_ok := v_ok + 1;

  begin
    update public.pedidos set status = 'Entregue' where id = v_ped;
    raise exception 'FALHOU: pulou etapas do pedido';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'TRANSICAO_INVALIDA%', 'FALHOU: ' || v_txt;
    v_ok := v_ok + 1;
  end;

  update public.pedidos set status = 'Cancelado', motivo_cancelamento = 'teste' where id = v_ped;
  select estoque_atual into n from public.produtos where id = v_prod;
  assert n = 5, 'FALHOU: estorno ao cancelar (esperado 5), veio ' || n;
  select count(*) into n from public.pedido_status_historico where pedido_id = v_ped;
  assert n = 3, 'FALHOU: histórico do pedido (esperado 3), veio ' || n;
  v_ok := v_ok + 1;

  -- confirmar pedido sem estoque suficiente falha e não baixa nada
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  v_ped2 := public.criar_pedido(jsonb_build_array(jsonb_build_object('produto_id', v_prod, 'quantidade', 4)));
  perform set_config('request.jwt.claims', json_build_object('sub', u_adm, 'role', 'authenticated')::text, true);
  insert into public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo) values (v_prod, 'ajuste', 1, 'contagem');
  begin
    update public.pedidos set status = 'Confirmado' where id = v_ped2;
    raise exception 'FALHOU: confirmou pedido sem estoque';
  exception when raise_exception then
    get stacked diagnostics v_txt = message_text;
    assert v_txt like 'ESTOQUE_INSUFICIENTE%', 'FALHOU: ' || v_txt;
    v_ok := v_ok + 1;
  end;
  select estoque_atual into n from public.produtos where id = v_prod;
  assert n = 1, 'FALHOU: estoque mudou após confirmação recusada';
  select count(*) into n from public.audit_log where acao = 'estoque.ajuste' and entidade_id = v_prod::text;
  assert n = 1, 'FALHOU: ajuste de estoque não auditado';
  v_ok := v_ok + 1;

  -- ================= Anônimo =================
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from public.agendamentos;
  assert n = 0, 'FALHOU: anônimo vê agendamentos';
  select count(*) into n from public.pedidos;
  assert n = 0, 'FALHOU: anônimo vê pedidos';
  v_ok := v_ok + 1;

  execute 'reset role';

  select count(*) into n from pg_publication_tables
   where pubname = 'supabase_realtime' and tablename in ('agendamentos', 'pedidos');
  assert n = 2, 'FALHOU: realtime não habilitado';
  v_ok := v_ok + 1;

  raise exception 'TODOS OS TESTES PASSARAM (% verificações) — nada foi gravado', v_ok;
end $$;
