import { Suspense } from "react"
import type { Metadata } from "next"
import { PawPrint } from "lucide-react"
import { FormLogin } from "./form-login"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-2xl shadow-soft">
            <PawPrint className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Pet Vanguarda</h1>
            <p className="text-muted-foreground text-sm">Portal da equipe</p>
          </div>
        </div>
        <div className="bg-card shadow-soft rounded-2xl border p-6">
          <Suspense>
            <FormLogin />
          </Suspense>
        </div>
        <p className="text-muted-foreground mt-4 text-center text-xs">
          Acesso restrito à equipe. Clientes usam o app Pet Vanguarda.
        </p>
      </div>
    </main>
  )
}
