import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/lib/database.types"

// Sessão do portal expira após este tempo sem uso (o token do Supabase renova sozinho).
const INATIVIDADE_MAX_MS = 4 * 60 * 60 * 1000
const COOKIE_ATIVIDADE = "pv_ultima_atividade"

const ROTAS_PUBLICAS = ["/login"]
// Rotas exclusivas do papel "admin"
const ROTAS_ADMIN = ["/produtos", "/estoque", "/servicos", "/configuracoes", "/relatorios"]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const publica = ROTAS_PUBLICAS.some((r) => pathname.startsWith(r))

  const redirecionar = (destino: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ""
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v))
    const r = NextResponse.redirect(url)
    response.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  if (!user) {
    return publica ? response : redirecionar("/login", pathname !== "/" ? { volta: pathname } : undefined)
  }

  // Expiração por inatividade
  const ultima = Number(request.cookies.get(COOKIE_ATIVIDADE)?.value ?? 0)
  if (ultima && Date.now() - ultima > INATIVIDADE_MAX_MS) {
    await supabase.auth.signOut()
    const r = redirecionar("/login", { erro: "sessao-expirada" })
    r.cookies.delete(COOKIE_ATIVIDADE)
    return r
  }

  // Somente membros da equipe (tabela admins) entram
  const { data: membro } = await supabase.from("admins").select("papel").eq("user_id", user.id).maybeSingle()
  if (!membro) {
    await supabase.auth.signOut()
    return redirecionar("/login", { erro: "sem-acesso" })
  }

  if (publica) return redirecionar("/")

  if (membro.papel !== "admin" && ROTAS_ADMIN.some((r) => pathname.startsWith(r))) {
    return redirecionar("/", { erro: "somente-admin" })
  }

  response.cookies.set(COOKIE_ATIVIDADE, String(Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3)$).*)"],
}
