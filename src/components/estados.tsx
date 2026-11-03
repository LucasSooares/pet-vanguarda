"use client"

import { AlertTriangle, Inbox, Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { mensagemErro } from "@/lib/erros"
import { cn } from "@/lib/utils"

export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string
  descricao?: string
  acoes?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-muted-foreground mt-1 text-sm">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Vazio({
  titulo = "Nada por aqui",
  descricao,
  icone: Icone = Inbox,
  acao,
  className,
}: {
  titulo?: string
  descricao?: string
  icone?: LucideIcon
  acao?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-12 text-center", className)}>
      <div className="bg-accent text-accent-foreground mb-1 rounded-full p-3">
        <Icone className="size-6" aria-hidden />
      </div>
      <p className="font-medium">{titulo}</p>
      {descricao && <p className="text-muted-foreground max-w-sm text-sm">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}

export function Erro({ erro, tentarNovamente }: { erro: unknown; tentarNovamente?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="mb-1 rounded-full bg-orange-100 p-3 text-orange-700">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <p className="font-medium">Não foi possível carregar</p>
      <p className="text-muted-foreground max-w-md text-sm">{mensagemErro(erro)}</p>
      {tentarNovamente && (
        <Button variant="outline" size="sm" className="mt-2" onClick={tentarNovamente}>
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

export function Carregando({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />
}

/** Renderiza loading / erro / vazio / conteúdo a partir de uma query do TanStack. */
export function EstadoQuery<T>({
  query,
  vazio,
  vazioComponente,
  children,
  linhas,
}: {
  query: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }
  vazio?: (dados: T) => boolean
  vazioComponente?: React.ReactNode
  children: (dados: T) => React.ReactNode
  linhas?: number
}) {
  if (query.isLoading) return <Carregando linhas={linhas} />
  if (query.error) return <Erro erro={query.error} tentarNovamente={() => query.refetch()} />
  if (query.data === undefined) return null
  if (vazio?.(query.data)) return <>{vazioComponente ?? <Vazio />}</>
  return <>{children(query.data)}</>
}
