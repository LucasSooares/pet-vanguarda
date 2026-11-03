"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { LogOut, Menu, PawPrint, Search } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useSessao } from "@/components/sessao"
import { NAVEGACAO } from "@/components/layout/navegacao"
import { useAlertasRealtime } from "@/features/realtime/use-alertas-realtime"
import { getSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2 font-semibold">
      <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
        <PawPrint className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        Pet Vanguarda
        <span className="text-muted-foreground block text-xs font-normal">Portal da equipe</span>
      </span>
    </Link>
  )
}

function Nav({ onNavegar }: { onNavegar?: () => void }) {
  const pathname = usePathname()
  const { isAdmin } = useSessao()
  const { pedidosNovos, agendamentosNovos } = useAlertasRealtime()
  const contadores: Record<string, number> = { "/pedidos": pedidosNovos, "/agendamentos": agendamentosNovos }

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-1">
      {NAVEGACAO.filter((i) => isAdmin || !i.somenteAdmin).map((item) => {
        const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
        const Icone = item.icone
        const qtd = contadores[item.href] ?? 0
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavegar}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              "focus-visible:ring-ring outline-none focus-visible:ring-2",
              ativo ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icone className="size-4.5" aria-hidden />
            <span className="flex-1">{item.rotulo}</span>
            {qtd > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  ativo ? "bg-white/20" : "bg-amber-400 text-amber-950"
                )}
                aria-label={`${qtd} novos`}
              >
                {qtd}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

function BuscaGlobal() {
  const router = useRouter()
  const params = useSearchParams()
  const [termo, setTermo] = useState(params.get("q") ?? "")
  return (
    <form
      role="search"
      className="relative hidden max-w-sm flex-1 sm:block"
      onSubmit={(e) => {
        e.preventDefault()
        if (termo.trim()) router.push(`/clientes?q=${encodeURIComponent(termo.trim())}`)
      }}
    >
      <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
      <Input
        aria-label="Buscar cliente, pet, e-mail ou telefone"
        placeholder="Buscar cliente, pet, telefone…"
        className="bg-background pl-9"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
      />
    </form>
  )
}

function MenuPerfil() {
  const { user, membro } = useSessao()
  const router = useRouter()
  const iniciais = membro.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  const sair = async () => {
    await getSupabase().auth.signOut()
    router.replace("/login")
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 rounded-full px-1.5 py-1" aria-label="Menu do perfil">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">{iniciais}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left text-sm leading-tight md:block">
            {membro.nome}
            <span className="text-muted-foreground block text-xs capitalize">{membro.papel}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{membro.nome}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={sair}>
          <LogOut className="size-4" aria-hidden /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const params = useSearchParams()

  useEffect(() => {
    if (params.get("erro") === "somente-admin") toast.error("Essa área é exclusiva para administradores.")
  }, [params])

  // Logout em outra aba / sessão expirada pelo Supabase
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") window.location.href = "/login"
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="focus:bg-primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-white">
        Pular para o conteúdo
      </a>
      <aside className="no-print bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r p-4 lg:flex">
        <Marca />
        <Nav />
      </aside>

      <div className="lg:pl-64 print:pl-0">
        <header className="bg-background/85 sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur no-print sm:px-6">
          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-6 p-4">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Marca />
              <Nav onNavegar={() => setMenuAberto(false)} />
            </SheetContent>
          </Sheet>
          <BuscaGlobal />
          <div className="ml-auto">
            <MenuPerfil />
          </div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
