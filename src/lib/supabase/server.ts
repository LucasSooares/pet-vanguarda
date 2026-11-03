import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/database.types"
import { env } from "@/lib/env"

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o middleware já renova a sessão.
        }
      },
    },
  })
}

export async function getSessaoEquipe() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membro } = await supabase.from("admins").select("*").eq("user_id", user.id).maybeSingle()
  if (!membro) return null
  return { user: { id: user.id, email: user.email ?? "" }, membro }
}
