import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
import { createSupabaseServer } from "@/lib/supabase/server"
import type { Database } from "@/lib/database.types"

// Rota OPCIONAL: envia convite por e-mail usando a service_role (somente no servidor).
// Sem SUPABASE_SERVICE_ROLE_KEY ela responde 501 e o portal orienta a convidar pelo painel do Supabase.
const schema = z.object({
  email: z.email().trim().toLowerCase(),
  nome: z.string().trim().min(2).max(80),
  papel: z.enum(["admin", "atendente"]),
})

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 })
  const { data: ehAdmin } = await supabase.rpc("is_admin")
  if (!ehAdmin) return NextResponse.json({ erro: "Somente administradores podem convidar" }, { status: 403 })

  const corpo = schema.safeParse(await req.json().catch(() => null))
  if (!corpo.success) return NextResponse.json({ erro: "Dados inválidos" }, { status: 400 })

  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!chave) {
    return NextResponse.json(
      { erro: "Convite por e-mail não configurado (SUPABASE_SERVICE_ROLE_KEY ausente no servidor)." },
      { status: 501 }
    )
  }

  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const origem = new URL(req.url).origin
  const { data, error } = await admin.auth.admin.inviteUserByEmail(corpo.data.email, {
    data: { nome: corpo.data.nome },
    redirectTo: `${origem}/login`,
  })
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 })

  // Inserção feita como o admin logado (RLS: admins_insert exige is_admin()).
  const { error: e2 } = await supabase
    .from("admins")
    .upsert({ user_id: data.user.id, nome: corpo.data.nome, papel: corpo.data.papel }, { onConflict: "user_id" })
  if (e2) return NextResponse.json({ erro: e2.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
