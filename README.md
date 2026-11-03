# Pet Vanguarda — Portal Admin

Portal web da equipe do petshop **Pet Vanguarda**. Ele usa o **mesmo projeto Supabase** do app mobile dos clientes (Kodular).

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (`@supabase/ssr`) · TanStack Query · react-hook-form + zod · date-fns (pt-BR) · recharts.

## Módulos

| Módulo | Quem acessa | O que faz |
|---|---|---|
| Dashboard | todos (faturamento e estoque só para admin) | agendamentos de hoje e amanhã, pendentes, pedidos novos, faturamento, estoque baixo, gráficos de 30 dias |
| Agenda | todos | visão dia/semana/mês; confirmar, cancelar (com motivo), concluir, remarcar, marcar falta; agendamento manual; bloquear e liberar horários |
| Agendamentos | todos | filtros, busca, exportar CSV, tempo real com aviso sonoro e visual |
| Pedidos | todos | fila por status, detalhe, histórico, impressão de comprovante/etiqueta, WhatsApp |
| Clientes e pets | todos | clientes do app, pets, endereços e histórico |
| Produtos | admin | CRUD, upload de imagem, categorias, ativar/desativar, importação CSV |
| Estoque | admin | saldo, alertas, entrada/saída/ajuste, histórico, relatório de giro |
| Serviços e preços | admin | serviços com preço por porte |
| Relatórios | admin | faturamento, serviços e produtos mais vendidos, cancelamentos e faltas, CSV |
| Configurações | admin | dados do petshop, equipe (convites e papéis), mensagens padrão, auditoria |

Ainda é admin quem edita o **horário de funcionamento e a capacidade**. A atendente gerencia bloqueios e liberações da agenda.

---

## 1. Configurar o ambiente

```bash
npm install
cp .env.example .env.local
```

Preencha o `.env.local` (Supabase → *Project Settings → API*):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

> 🔒 A `service_role` **nunca** vai para o navegador. Ela é opcional e serve apenas a rota de servidor `/api/equipe/convidar` (convite por e-mail). Para usar, defina `SUPABASE_SERVICE_ROLE_KEY`, sem o prefixo `NEXT_PUBLIC_`, somente nas variáveis de ambiente do servidor ou da Vercel. Sem ela, convide pelo painel do Supabase.

## 2. Aplicar as migrations

Os arquivos ficam em `supabase/migrations`. São numerados, idempotentes e não destrutivos: não removem nada do que o app usa.

| Arquivo | Conteúdo |
|---|---|
| `…0001_seguranca_admins_auditoria.sql` | `admins`, `is_admin()` / `is_staff()`, `audit_log`, leitura dos dados dos clientes pela equipe |
| `…0002_agenda_servicos.sql` | `servicos`, `servicos_precos`, `horarios_funcionamento`, `bloqueios_agenda`, anti-overbooking, RPC `horarios_livres` |
| `…0003_produtos_estoque.sql` | `categorias`, `produtos`, `movimentacoes_estoque` (trigger de saldo, nunca negativo) |
| `…0004_pedidos.sql` | `pedidos`, `pedido_itens`, histórico, baixa/estorno de estoque, RPC `criar_pedido` |
| `…0005_storage_realtime_config.sql` | bucket `produtos`, realtime em agendamentos/pedidos, `configuracoes` |
| `…0006_relatorios_clientes.sql` | funções de dashboard, relatórios e clientes |

**Opção A — SQL Editor (mais simples):** abra cada arquivo em ordem, cole no *SQL Editor* do Supabase e clique em **Run**. O aviso "destructive operations" aparece por causa dos `drop policy if exists`, que só recriam as policies novas.

**Opção B — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

**Seed opcional:** `supabase/seed.sql` traz os serviços Banho, Tosa, Banho + Tosa, Consulta veterinária e Vacinação, com preço por porte, além de horário de funcionamento, categorias e produtos de exemplo. Atenção: ao criar o horário de funcionamento, o banco passa a recusar agendamentos do app fora da grade.

> ✅ No projeto `Pets` (tvpzzhinsfvyttlcxhzb), as migrations 0001–0006 **já foram aplicadas** em 28/10/2026 e o teste SQL passou (29 verificações). O seed **não** foi aplicado.

## 3. Criar o primeiro admin

1. Supabase → *Authentication → Users → Add user*: crie o usuário com e-mail e senha e marque *Auto Confirm User*. Se a pessoa já usa o app, ela já tem conta.
2. No *SQL Editor*, rode:

```sql
insert into public.admins (user_id, nome, papel)
select id, 'Seu Nome', 'admin'
from auth.users
where email = 'seu-email@exemplo.com'
on conflict (user_id) do update set papel = 'admin', nome = excluded.nome;
```

Os próximos membros podem ser convidados pelo portal, em **Configurações → Equipe**.

## 4. Rodar

```bash
npm run dev        # http://localhost:3000
npm run build && npm start
```

## 5. Publicar na Vercel

1. Suba o repositório para o GitHub.
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório. O framework Next.js é detectado sozinho.
3. Em *Environment Variables*, defina `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. A `SUPABASE_SERVICE_ROLE_KEY` é opcional e fica só no servidor.
4. Faça o deploy. Depois, no Supabase, em *Authentication → URL Configuration*, adicione a URL da Vercel em **Site URL / Redirect URLs** (necessário para os convites por e-mail).

---

## Segurança

- **Login:** e-mail e senha pelo Supabase Auth. Só entra quem está em `public.admins`; os outros são deslogados com o aviso "Esta conta não faz parte da equipe".
- **Middleware** (`src/middleware.ts`):
  - protege todas as rotas;
  - renova a sessão;
  - expira o acesso após **4 h sem uso**;
  - bloqueia as rotas exclusivas de admin para atendentes.
- **RLS:** é a barreira real. As policies `*_own` do app continuam intactas, e as policies da equipe foram **somadas** a elas:
  - `is_staff()`: equipe lê e gerencia agenda e pedidos;
  - `is_admin()`: produtos, preços, estoque, horários, configurações e equipe.
- **Proteções extras:**
  - a tabela `admins` só pode ser alterada por admin, então um cliente não consegue se promover;
  - o último admin não pode ser removido;
  - todos os formulários são validados com zod.
- **Auditoria** (`audit_log`, visível em *Configurações → Auditoria*): cancelamentos, faltas, remarcações, mudanças de preço (serviço, produto e agendamento), entradas/saídas/ajustes de estoque e mudanças na equipe.
- **Anti-overbooking:** trigger com *advisory lock* por horário, que conta os agendamentos ativos contra a capacidade do horário e respeita pausas, bloqueios e liberações. Enquanto `horarios_funcionamento` estiver vazia, só não aplica a grade, para não quebrar o app.

## Testes

```bash
npm test                 # unitários (regras de status, estoque, CSV, formatação)
npm run test:integracao  # fluxos via API real — exige projeto Supabase de TESTE (TEST_SUPABASE_*)
npm run test:db          # teste SQL no banco (TEST_DATABASE_URL) — ou cole o arquivo no SQL Editor
```

O arquivo `supabase/tests/fluxos_criticos.sql` testa, dentro do banco:
- RLS (um cliente não vê nem altera dados de outro, cliente não vira admin, anônimo não lê nada);
- anti-overbooking, pausa e remarcação para horário lotado;
- confirmar e cancelar agendamento, com auditoria;
- baixa de estoque ao confirmar pedido e estorno ao cancelar;
- estoque nunca negativo e transições de status inválidas.

Ele **sempre termina em rollback**: a mensagem esperada é `TODOS OS TESTES PASSARAM (29 verificações)`.

## Tipos do banco

`src/lib/database.types.ts` descreve o schema. Para gerar a versão oficial pelo CLI:

```bash
npx supabase login
npm run gen:types   # gera src/lib/database.generated.ts
```

## App mobile

O que o app Kodular precisa mudar para usar serviços/preços, horários livres, pedidos e status, com exemplos de chamadas REST: **[docs/APP_MOBILE.md](docs/APP_MOBILE.md)**.

## Estrutura

```
src/
  app/(portal)/…        páginas protegidas (dashboard, agenda, pedidos, …)
  app/login             tela de login
  app/api/equipe        rota de servidor opcional (convite)
  features/<módulo>/    hooks de dados (TanStack Query) e componentes de cada módulo
  components/           layout, estados (loading/vazio/erro), confirmação, ui (shadcn)
  lib/                  supabase (client/server), tipos, formatação, status, CSV, erros
  middleware.ts         proteção de rotas e expiração de sessão
supabase/migrations     SQL numerado
supabase/seed.sql       dados de exemplo (opcional)
supabase/tests          teste SQL dos fluxos críticos
tests/                  vitest (unit + integração)
docs/APP_MOBILE.md      guia de integração do app
```
