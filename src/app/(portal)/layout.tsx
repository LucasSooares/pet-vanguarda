import { Suspense } from "react"
import { redirect } from "next/navigation"
import { AppShell } from "@/components/layout/app-shell"
import { SessaoProvider } from "@/components/sessao"
import { AlertasRealtimeProvider } from "@/features/realtime/use-alertas-realtime"
import { getSessaoEquipe } from "@/lib/supabase/server"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Defesa em profundidade: o middleware já barra quem não é da equipe.
  const sessao = await getSessaoEquipe()
  if (!sessao) redirect("/login?erro=sem-acesso")

  return (
    <SessaoProvider value={sessao}>
      <AlertasRealtimeProvider>
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </AlertasRealtimeProvider>
    </SessaoProvider>
  )
}
