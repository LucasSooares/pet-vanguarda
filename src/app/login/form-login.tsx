"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/estados"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro } from "@/lib/erros"

const schema = z.object({
  email: z.email("Informe um e-mail válido").trim().toLowerCase(),
  senha: z.string().min(6, "A senha tem pelo menos 6 caracteres"),
})
type Dados = z.infer<typeof schema>

const AVISOS: Record<string, string> = {
  "sem-acesso": "Esta conta não faz parte da equipe do petshop.",
  "sessao-expirada": "Sua sessão expirou por inatividade. Entre novamente.",
}

export function FormLogin() {
  const router = useRouter()
  const params = useSearchParams()
  const [erro, setErro] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Dados>({ resolver: zodResolver(schema) })

  useEffect(() => {
    const aviso = params.get("erro")
    if (aviso && AVISOS[aviso]) setErro(AVISOS[aviso])
  }, [params])

  const entrar = handleSubmit(async ({ email, senha }) => {
    setErro(null)
    const supabase = getSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) return setErro(mensagemErro(error))

    const { data: membro } = await supabase.from("admins").select("papel").eq("user_id", data.user.id).maybeSingle()
    if (!membro) {
      await supabase.auth.signOut()
      return setErro(AVISOS["sem-acesso"])
    }
    const volta = params.get("volta")
    router.replace(volta && volta.startsWith("/") && !volta.startsWith("//") ? volta : "/")
    router.refresh()
  })

  return (
    <form onSubmit={entrar} className="space-y-4" noValidate>
      {erro && (
        <div role="alert" className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {erro}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!formState.errors.email} {...register("email")} />
        {formState.errors.email && <p className="text-destructive text-xs">{formState.errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!formState.errors.senha}
          {...register("senha")}
        />
        {formState.errors.senha && <p className="text-destructive text-xs">{formState.errors.senha.message}</p>}
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={formState.isSubmitting}>
        {formState.isSubmitting && <Spinner />}
        Entrar
      </Button>
    </form>
  )
}
