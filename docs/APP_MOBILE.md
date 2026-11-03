# O que o app mobile (Kodular) precisa mudar

O banco continua **compatível** com a versão atual do app: nenhuma tabela, coluna ou policy usada por ele foi removida ou alterada de forma incompatível. Todas as mudanças abaixo são **evoluções recomendadas** para o app usar os recursos novos.

Todas as chamadas usam a API REST do Supabase:

```
Base:    https://tvpzzhinsfvyttlcxhzb.supabase.co/rest/v1
Headers: apikey: <ANON_KEY>
         Authorization: Bearer <access_token do usuário logado>
         Content-Type: application/json
```

> No Kodular: componente **Web** → `Url`, `RequestHeaders` (lista de pares) e `PostText`/`Get`. A resposta chega em `GotText` (`responseContent` em JSON).

---

## 1. Serviços e preços (em vez de preços fixos no app)

Listar os serviços ativos com o preço por porte:

```http
GET /rest/v1/servicos?select=id,nome,descricao,duracao_min,servicos_precos(porte,preco)&ativo=eq.true&order=nome
```

Resposta:

```json
[{ "id": "8f1c…", "nome": "Banho", "duracao_min": 60,
   "servicos_precos": [{ "porte": "Pequeno", "preco": 50 }, { "porte": "Médio", "preco": 65 }, { "porte": "Grande", "preco": 85 }] }]
```

Use o **porte do pet** (`Pequeno`, `Médio`, `Grande`) para escolher o preço. Hoje existem pets com `porte` vazio (`""` ou `"\"\""`). Peça o porte no cadastro do pet e trate como obrigatório.

## 2. Horários livres (RPC) antes de agendar

```http
POST /rest/v1/rpc/horarios_livres
{ "p_data": "2026-11-03" }
```

Resposta (somente horários com vaga, já sem os que passaram, as pausas e os bloqueios):

```json
[{ "hora": "08:00", "capacidade": 2, "ocupados": 0, "vagas": 2 },
 { "hora": "08:30", "capacidade": 2, "ocupados": 1, "vagas": 1 }]
```

- Lista vazia significa que o dia está fechado, bloqueado ou lotado.
- **Importante:** quando a equipe salvar o "Horário de funcionamento" no portal, o banco passa a **recusar** agendamentos fora da grade. O app deve então oferecer **apenas** os horários dessa RPC.

## 3. Criar agendamento (com os campos novos)

O `INSERT` atual continua funcionando. Recomendado enviar também `servico_id`, `pet_id` e `porte`:

```http
POST /rest/v1/agendamentos
Prefer: return=representation
{ "servico": "Banho", "servico_id": "8f1c…", "pet": "Rex", "pet_id": "uuid-do-pet",
  "porte": "Médio", "data": "2026-11-03", "hora": "08:30", "preco": 65, "status": "Pendente" }
```

- Formato da `hora`: **`"HH:MM"`** (ex.: `"08:30"`).
- Se o horário lotar entre a consulta e o envio, o banco responde **HTTP 400** com uma mensagem que começa por `HORARIO_LOTADO`. Para horário fechado, a mensagem começa por `HORARIO_INDISPONIVEL`. Mostre "Esse horário acabou de ser preenchido" e recarregue os horários.
- Se `servico_id`, `pet_id` ou `porte` não forem enviados, o banco tenta preencher sozinho pelo nome.

## 4. Status do agendamento

| Status | Quem define | Significado |
|---|---|---|
| `Pendente` | app (recomendado) | aguardando a equipe confirmar |
| `Confirmado` | equipe (padrão atual do banco) | confirmado |
| `Concluído` | equipe | atendimento realizado (entra no faturamento) |
| `Cancelado` | cliente ou equipe | cancelado (`motivo_cancelamento`) |
| `Falta` | equipe | cliente não compareceu |

- Hoje o padrão do banco é `Confirmado`, para não mudar o comportamento atual. Para usar a fila **"Pendentes de confirmação"** do portal, o app deve enviar `"status": "Pendente"`.
- Para o cliente cancelar o próprio agendamento:

```http
PATCH /rest/v1/agendamentos?id=eq.<id>
{ "status": "Cancelado", "motivo_cancelamento": "Cancelado pelo cliente" }
```

- O cliente pode acompanhar mudanças em tempo real pelo Realtime, ou recarregar a lista com `GET /rest/v1/agendamentos?select=*&order=data.desc`, que traz só os dele por causa da RLS.

## 5. Loja: produtos e pedidos

Catálogo:

```http
GET /rest/v1/produtos?select=id,nome,descricao,preco,imagem_url,estoque_atual,categorias(nome)&ativo=eq.true&order=nome
GET /rest/v1/categorias?select=id,nome&ativo=eq.true&order=ordem
```

Criar pedido. **Use sempre a RPC**: o preço e o total vêm do banco, então o cliente não consegue alterar valores.

```http
POST /rest/v1/rpc/criar_pedido
{ "p_itens": [{ "produto_id": "uuid", "quantidade": 2 }],
  "p_forma_pagamento": "pix", "p_tipo_entrega": "entrega",
  "p_endereco": "Rua X, 123 - Centro", "p_observacoes": "Portão azul" }
```

A resposta é o **id do pedido** (uuid). Erros possíveis:

| Erro | Quando acontece |
|---|---|
| `PEDIDO_VAZIO` | nenhum item enviado |
| `QUANTIDADE_INVALIDA` | quantidade fora do permitido |
| `PRODUTO_INDISPONIVEL` | produto inativo ou inexistente |
| `ESTOQUE_INSUFICIENTE` | quantidade maior que o saldo |
| `ENDERECO_OBRIGATORIO` | `p_tipo_entrega` é `entrega` sem endereço |

Meus pedidos e seus itens:

```http
GET /rest/v1/pedidos?select=id,numero,status,total,tipo_entrega,created_at,pedido_itens(nome,quantidade,preco_unit)&order=created_at.desc
```

Status do pedido: `Novo → Confirmado → Em separação → Pronto` (retirada) ou `Saiu para entrega` (entrega) `→ Entregue`, ou `Cancelado`.

O cliente pode cancelar enquanto o pedido estiver como `Novo`:

```http
POST /rest/v1/rpc/cancelar_meu_pedido
{ "p_pedido_id": "uuid", "p_motivo": "Desisti" }
```

## 6. Dados do petshop

```http
GET /rest/v1/configuracoes?select=nome,telefone,whatsapp,endereco,instagram&id=eq.1
```

## 7. Recomendações de segurança para o app

1. **Bucket `pets`:** hoje as policies permitem que **qualquer pessoa, mesmo sem login**, envie e apague fotos. Recomendo restringir `INSERT/UPDATE/DELETE` a `authenticated` e à pasta do próprio usuário. Exemplo:

   ```sql
   -- usar caminho "<user_id>/arquivo.jpg" no upload
   (bucket_id = 'pets' and (storage.foldername(name))[1] = auth.uid()::text)
   ```

   Antes, ajuste o app para enviar as fotos nesse caminho.
2. **`agendamentos_update_own`:** permite que o cliente altere qualquer coluna do próprio agendamento, inclusive `preco` e `status`. As mudanças de preço ficam na auditoria. Quando o app passar a só cancelar, vale trocar essa policy por uma RPC `cancelar_meu_agendamento`.
3. Nunca coloque a `service_role` no app. Use apenas a anon key e o token do usuário.
