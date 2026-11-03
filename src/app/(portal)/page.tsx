"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { addDays } from "date-fns"
import { AlertTriangle, CalendarCheck, CalendarClock, Clock, ShoppingBag, Wallet, type LucideIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Carregando, Erro, PageHeader, Vazio } from "@/components/estados"
import { useSessao } from "@/components/sessao"
import { StatusAgendamentoBadge } from "@/components/status-badge"
import { useAgendamentos } from "@/features/agendamentos/api"
import { GraficoAgendamentos, GraficoVendas } from "@/features/dashboard/graficos"
import { getSupabase } from "@/lib/supabase/client"
import { ok } from "@/lib/erros"
import { formatarData, formatarMoeda, isoDia, normalizarHora } from "@/lib/format"
import type { DashboardResumo, Produto } from "@/lib/database.types"
import { cn } from "@/lib/utils"

function Indicador({
  rotulo,
  valor,
  icone: Icone,
  href,
  destaque,
}: {
  rotulo: string
  valor: React.ReactNode
  icone: LucideIcon
  href?: string
  destaque?: boolean
}) {
  const conteudo = (
    <div
      className={cn(
        "bg-card shadow-soft flex h-full items-center gap-4 rounded-2xl border p-4 transition-colors",
        href && "hover:border-primary/40",
        destaque && "border-amber-300 bg-amber-50"
      )}
    >
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", destaque ? "bg-amber-200 text-amber-900" : "bg-accent text-accent-foreground")}>
        <Icone className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="truncate text-2xl font-semibold tabular-nums">{valor}</p>
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="focus-visible:ring-ring rounded-2xl outline-none focus-visible:ring-2">
      {conteudo}
    </Link>
  ) : (
    conteudo
  )
}

export default function DashboardPage() {
  const { membro, isAdmin } = useSessao()
  const hoje = new Date()
  const resumo = useQuery({
    queryKey: ["dashboard", "resumo"],
    refetchInterval: 60_000,
    queryFn: async () => ok(await getSupabase().rpc("dashboard_resumo")) as DashboardResumo,
  })
  const serie = useQuery({
    queryKey: ["dashboard", "serie"],
    queryFn: async () =>
      ok(await getSupabase().rpc("serie_diaria", { p_inicio: isoDia(addDays(hoje, -29)), p_fim: isoDia(hoje) })) ?? [],
  })
  const proximos = useAgendamentos({ inicio: isoDia(hoje), fim: isoDia(addDays(hoje, 1)) })
  const baixos = useQuery({
    queryKey: ["dashboard", "estoque-baixo"],
    enabled: isAdmin,
    queryFn: async () => {
      const lista = (ok(await getSupabase().from("produtos").select("*").eq("ativo", true).order("estoque_atual")) ?? []) as Produto[]
      return lista.filter((p) => p.estoque_atual <= p.estoque_minimo).slice(0, 8)
    },
  })

  const r = resumo.data
  const v = (x: React.ReactNode) => (resumo.isLoading ? <Skeleton className="h-7 w-16" /> : x)
  const saudacao = hoje.getHours() < 12 ? "Bom dia" : hoje.getHours() < 18 ? "Boa tarde" : "Boa noite"

  return (
    <>
      <PageHeader titulo={`${saudacao}, ${membro.nome.split(" ")[0]}!`} descricao={formatarData(isoDia(hoje), "EEEE, dd 'de' MMMM 'de' yyyy")} />

      {resumo.error ? (
        <Erro erro={resumo.error} tentarNovamente={() => resumo.refetch()} />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Indicador rotulo="Agendamentos hoje" valor={v(r?.agendamentos_hoje)} icone={CalendarCheck} href="/agenda" />
          <Indicador rotulo="Amanhã" valor={v(r?.agendamentos_amanha)} icone={CalendarClock} href="/agenda" />
          <Indicador
            rotulo="Pendentes de confirmação"
            valor={v(r?.pendentes)}
            icone={Clock}
            href="/agendamentos"
            destaque={!!r?.pendentes}
          />
          <Indicador rotulo="Pedidos novos" valor={v(r?.pedidos_novos)} icone={ShoppingBag} href="/pedidos" destaque={!!r?.pedidos_novos} />
          {isAdmin && (
            <>
              <Indicador rotulo="Faturamento hoje" valor={v(formatarMoeda(r?.fat_dia))} icone={Wallet} />
              <Indicador rotulo="Faturamento na semana" valor={v(formatarMoeda(r?.fat_semana))} icone={Wallet} />
              <Indicador rotulo="Faturamento no mês" valor={v(formatarMoeda(r?.fat_mes))} icone={Wallet} href="/relatorios" />
              <Indicador
                rotulo="Abaixo do estoque mínimo"
                valor={v(r?.estoque_baixo)}
                icone={AlertTriangle}
                href="/estoque"
                destaque={!!r?.estoque_baixo}
              />
            </>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="bg-card shadow-soft rounded-2xl border p-4">
          <h2 className="mb-2 font-semibold">Agendamentos — últimos 30 dias</h2>
          {serie.isLoading ? <Skeleton className="h-60" /> : serie.data && <GraficoAgendamentos serie={serie.data} />}
        </section>
        {isAdmin && (
          <section className="bg-card shadow-soft rounded-2xl border p-4">
            <h2 className="mb-2 font-semibold">Faturamento — últimos 30 dias</h2>
            {serie.isLoading ? <Skeleton className="h-60" /> : serie.data && <GraficoVendas serie={serie.data} />}
          </section>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="bg-card shadow-soft rounded-2xl border lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Hoje e amanhã</h2>
            <Link href="/agenda" className="text-primary text-sm font-medium hover:underline">
              Abrir agenda
            </Link>
          </div>
          {proximos.isLoading ? (
            <Carregando linhas={4} />
          ) : proximos.error ? (
            <Erro erro={proximos.error} tentarNovamente={() => proximos.refetch()} />
          ) : proximos.data?.length ? (
            <ul className="divide-y">
              {proximos.data.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-20 shrink-0 tabular-nums">
                    <span className="text-muted-foreground block text-xs">{a.data === isoDia(hoje) ? "Hoje" : "Amanhã"}</span>
                    {normalizarHora(a.hora)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.servico}</span> · {a.pet}
                    <span className="text-muted-foreground block truncate text-xs">{a.cliente?.nome ?? a.cliente_nome}</span>
                  </span>
                  <StatusAgendamentoBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Vazio titulo="Nenhum agendamento para hoje ou amanhã" />
          )}
        </section>

        {isAdmin && (
          <section className="bg-card shadow-soft rounded-2xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-semibold">Estoque baixo</h2>
              <Link href="/estoque" className="text-primary text-sm font-medium hover:underline">
                Ver estoque
              </Link>
            </div>
            {baixos.isLoading ? (
              <Carregando linhas={3} />
            ) : baixos.data?.length ? (
              <ul className="divide-y">
                {baixos.data.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="truncate">{p.nome}</span>
                    <span className="rounded-full bg-rose-100 px-2 text-xs font-semibold text-rose-800 tabular-nums">
                      {p.estoque_atual}/{p.estoque_minimo}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio titulo="Tudo abastecido" />
            )}
          </section>
        )}
      </div>
    </>
  )
}
