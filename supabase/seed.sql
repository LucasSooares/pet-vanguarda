-- =============================================================================
-- Seed opcional (idempotente): serviços com preço por porte, horário de
-- funcionamento, categorias e produtos de exemplo com estoque inicial.
-- Ajuste os valores antes de rodar em produção.
-- =============================================================================

insert into public.servicos (nome, descricao, duracao_min) values
  ('Banho', 'Banho com shampoo neutro, secagem e perfume', 60),
  ('Tosa', 'Tosa higiênica ou na máquina', 60),
  ('Banho + Tosa', 'Banho completo com tosa', 90),
  ('Consulta veterinária', 'Consulta clínica geral', 30),
  ('Vacinação', 'Aplicação de vacina (valor da dose à parte)', 30)
on conflict ((lower(nome))) do nothing;

insert into public.servicos_precos (servico_id, porte, preco)
select s.id, v.porte, v.preco
from (values
  ('Banho', 'Pequeno', 50.00), ('Banho', 'Médio', 65.00), ('Banho', 'Grande', 85.00),
  ('Tosa', 'Pequeno', 60.00), ('Tosa', 'Médio', 75.00), ('Tosa', 'Grande', 95.00),
  ('Banho + Tosa', 'Pequeno', 95.00), ('Banho + Tosa', 'Médio', 120.00), ('Banho + Tosa', 'Grande', 150.00),
  ('Consulta veterinária', 'Pequeno', 120.00), ('Consulta veterinária', 'Médio', 120.00), ('Consulta veterinária', 'Grande', 120.00),
  ('Vacinação', 'Pequeno', 40.00), ('Vacinação', 'Médio', 40.00), ('Vacinação', 'Grande', 40.00)
) as v (servico, porte, preco)
join public.servicos s on lower(s.nome) = lower(v.servico)
on conflict (servico_id, porte) do nothing;

-- Seg–Sex 08–18 (almoço 12–13), Sáb 08–14, Dom fechado; 2 atendimentos por horário
insert into public.horarios_funcionamento (dia_semana, abre, fecha, intervalo_min, capacidade_por_slot, pausa_inicio, pausa_fim, ativo) values
  (0, '08:00', '12:00', 30, 2, null, null, false),
  (1, '08:00', '18:00', 30, 2, '12:00', '13:00', true),
  (2, '08:00', '18:00', 30, 2, '12:00', '13:00', true),
  (3, '08:00', '18:00', 30, 2, '12:00', '13:00', true),
  (4, '08:00', '18:00', 30, 2, '12:00', '13:00', true),
  (5, '08:00', '18:00', 30, 2, '12:00', '13:00', true),
  (6, '08:00', '14:00', 30, 2, null, null, true)
on conflict (dia_semana) do nothing;

insert into public.categorias (nome, ordem) values
  ('Rações', 1), ('Petiscos', 2), ('Higiene', 3), ('Brinquedos', 4), ('Acessórios', 5)
on conflict ((lower(nome))) do nothing;

insert into public.produtos (nome, descricao, preco, sku, categoria_id, estoque_minimo)
select v.nome, v.descricao, v.preco, v.sku, c.id, v.minimo
from (values
  ('Ração Premium Cães Adultos 15kg', 'Ração super premium para cães adultos', 219.90, 'RAC-CAO-15', 'Rações', 3),
  ('Ração Gatos Castrados 3kg', 'Ração para gatos castrados', 89.90, 'RAC-GAT-3', 'Rações', 5),
  ('Bifinho de Carne 500g', 'Petisco sabor carne', 24.90, 'PET-BIF-500', 'Petiscos', 10),
  ('Shampoo Neutro 500ml', 'Shampoo hipoalergênico', 32.50, 'HIG-SHA-500', 'Higiene', 6),
  ('Tapete Higiênico 30un', 'Tapete absorvente', 59.90, 'HIG-TAP-30', 'Higiene', 8),
  ('Bolinha de Borracha', 'Bolinha resistente', 14.90, 'BRI-BOL-01', 'Brinquedos', 5),
  ('Coleira Ajustável M', 'Coleira de nylon tamanho M', 29.90, 'ACE-COL-M', 'Acessórios', 4)
) as v (nome, descricao, preco, sku, categoria, minimo)
join public.categorias c on lower(c.nome) = lower(v.categoria)
where not exists (select 1 from public.produtos p where lower(p.sku) = lower(v.sku));

-- Estoque inicial só para produtos que nunca tiveram movimentação
insert into public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo)
select p.id, 'entrada', v.qtd, 'Estoque inicial (seed)'
from (values ('RAC-CAO-15', 12), ('RAC-GAT-3', 20), ('PET-BIF-500', 40), ('HIG-SHA-500', 15),
             ('HIG-TAP-30', 4), ('BRI-BOL-01', 25), ('ACE-COL-M', 10)) as v (sku, qtd)
join public.produtos p on lower(p.sku) = lower(v.sku)
where not exists (select 1 from public.movimentacoes_estoque m where m.produto_id = p.id);
