/**
 * Testes de integração dos fluxos críticos, via API REST real (PostgREST + RLS).
 * Rodam contra um projeto Supabase de TESTE (nunca produção), com as migrations aplicadas:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY no .env.local
 * A service_role é usada SOMENTE aqui, para criar/apagar usuários de teste.
 * Sem as variáveis, a suíte é ignorada (skip).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import type { Database } from "@/lib/database.types"

config({ path: ".env.local" })
const URL = process.env.TEST_SUPABASE_URL
const ANON = process.env.TEST_SUPABASE_ANON_KEY
const SERVICE = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
const habilitado = !!(URL && ANON && SERVICE)

type Cliente = SupabaseClient<Database>
const SENHA = `Teste-${crypto.randomUUID()}`
const sufixo = Date.now()
const DIA = "2031-03-03" // segunda-feira, longe de dados reais

describe.skipIf(!habilitado)("fluxos críticos (integração)", () => {
  let admin: Cliente // service role
  const ids: string[] = []
  let clienteA: Cliente
  let clienteB: Cliente
  let atendente: Cliente
  let gerente: Cliente
  let produtoId: string
  let horarioOriginal: Database["public"]["Tables"]["horarios_funcionamento"]["Row"] | null = null

  async function criarUsuario(nome: string): Promise<Cliente> {
    const email = `${nome}-${sufixo}@teste.petvanguarda.local`
    const { data, error } = await admin.auth.admin.createUser({ email, password: SENHA, email_confirm: true })
    if (error) throw error
    ids.push(data.user.id)
    const c = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } })
    const r = await c.auth.signInWithPassword({ email, password: SENHA })
    if (r.error) throw r.error
    return c
  }
  const uid = async (c: Cliente) => (await c.auth.getUser()).data.user!.id

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } })
    clienteA = await criarUsuario("cliente-a")
    clienteB = await criarUsuario("cliente-b")
    atendente = await criarUsuario("atendente")
    gerente = await criarUsuario("admin")
    await admin.from("admins").insert([
      { user_id: await uid(atendente), nome: "Atendente Teste", papel: "atendente" },
      { user_id: await uid(gerente), nome: "Admin Teste", papel: "admin" },
    ])
    // Segunda-feira: 1 vaga por horário
    horarioOriginal = (await admin.from("horarios_funcionamento").select("*").eq("dia_semana", 1).maybeSingle()).data
    await admin.from("horarios_funcionamento").upsert({
      dia_semana: 1, abre: "08:00", fecha: "12:00", intervalo_min: 30, capacidade_por_slot: 1,
      pausa_inicio: null, pausa_fim: null, ativo: true,
    })
  })

  afterAll(async () => {
    if (!habilitado) return
    await admin.from("agendamentos").delete().eq("data", DIA)
    if (produtoId) {
      await admin.from("pedidos").delete().in("user_id", ids)
      await admin.from("produtos").delete().eq("id", produtoId)
    }
    if (horarioOriginal) await admin.from("horarios_funcionamento").upsert(horarioOriginal)
    else await admin.from("horarios_funcionamento").delete().eq("dia_semana", 1)
    await admin.from("admins").delete().in("user_id", ids)
    for (const id of ids) await admin.auth.admin.deleteUser(id)
  })

  it("RLS: cliente não vê nem altera agendamento de outro cliente", async () => {
    const { data, error } = await clienteA
      .from("agendamentos")
      .insert({ servico: "Banho", pet: "Rex", data: DIA, hora: "08:00", status: "Pendente" })
      .select("id")
      .single()
    expect(error).toBeNull()
    const lidoPorB = await clienteB.from("agendamentos").select("id").eq("id", data!.id)
    expect(lidoPorB.data).toEqual([])
    const upd = await clienteB.from("agendamentos").update({ status: "Cancelado" }).eq("id", data!.id).select()
    expect(upd.data).toEqual([])
  })

  it("RLS: cliente não consegue virar admin", async () => {
    const r = await clienteA.from("admins").insert({ user_id: await uid(clienteA), nome: "Hacker", papel: "admin" })
    expect(r.error?.code).toBe("42501")
    expect((await clienteA.rpc("is_admin")).data).toBe(false)
  })

  it("anti-overbooking: segundo agendamento no mesmo horário é recusado", async () => {
    const r = await clienteB.from("agendamentos").insert({ servico: "Tosa", pet: "Mia", data: DIA, hora: "08:00" })
    expect(r.error?.message).toMatch(/^HORARIO_LOTADO/)
    const livres = (await clienteB.rpc("horarios_livres", { p_data: DIA })).data ?? []
    expect(livres.map((h) => h.hora)).not.toContain("08:00")
    expect(livres.map((h) => h.hora)).toContain("08:30")
  })

  it("atendente confirma e cancela (com auditoria) e a vaga é liberada", async () => {
    const ag = (await atendente.from("agendamentos").select("id").eq("data", DIA).eq("hora", "08:00").single()).data!
    expect((await atendente.from("agendamentos").update({ status: "Confirmado" }).eq("id", ag.id)).error).toBeNull()
    expect(
      (await atendente.from("agendamentos").update({ status: "Cancelado", motivo_cancelamento: "teste" }).eq("id", ag.id)).error
    ).toBeNull()
    const log = await gerente.from("audit_log").select("acao").eq("entidade_id", ag.id)
    expect(log.data?.map((l) => l.acao)).toContain("agendamento.cancelado")
    const r = await clienteB.from("agendamentos").insert({ servico: "Tosa", pet: "Mia", data: DIA, hora: "08:00" })
    expect(r.error).toBeNull()
  })

  it("atendente não mexe em produtos; admin sim", async () => {
    expect((await atendente.from("produtos").insert({ nome: "X", preco: 1 })).error?.code).toBe("42501")
    const p = await gerente.from("produtos").insert({ nome: `Produto teste ${sufixo}`, preco: 10 }).select("id").single()
    expect(p.error).toBeNull()
    produtoId = p.data!.id
    await gerente.from("movimentacoes_estoque").insert({ produto_id: produtoId, tipo: "entrada", quantidade: 5, motivo: "teste" })
  })

  it("pedido: confirmar baixa o estoque e cancelar estorna", async () => {
    const saldo = async () => (await gerente.from("produtos").select("estoque_atual").eq("id", produtoId).single()).data!.estoque_atual
    const ped = await clienteA.rpc("criar_pedido", { p_itens: [{ produto_id: produtoId, quantidade: 3 }] })
    expect(ped.error).toBeNull()
    expect((await clienteB.from("pedidos").select("id").eq("id", ped.data!)).data).toEqual([])

    await atendente.from("pedidos").update({ status: "Confirmado" }).eq("id", ped.data!)
    expect(await saldo()).toBe(2)

    const pulo = await atendente.from("pedidos").update({ status: "Entregue" }).eq("id", ped.data!)
    expect(pulo.error?.message).toMatch(/^TRANSICAO_INVALIDA/)

    await atendente.from("pedidos").update({ status: "Cancelado", motivo_cancelamento: "teste" }).eq("id", ped.data!)
    expect(await saldo()).toBe(5)
  })

  it("estoque nunca fica negativo", async () => {
    const r = await gerente.from("movimentacoes_estoque").insert({ produto_id: produtoId, tipo: "saida", quantidade: 99, motivo: "x" })
    expect(r.error?.message).toMatch(/^ESTOQUE_INSUFICIENTE/)
    const direto = await gerente.from("produtos").update({ estoque_atual: 1000 }).eq("id", produtoId)
    expect(direto.error?.message).toMatch(/^ESTOQUE_DIRETO/)
  })
})
