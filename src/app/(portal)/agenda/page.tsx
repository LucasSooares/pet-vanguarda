"use client"

import { useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Carregando, Erro, PageHeader, Vazio } from "@/components/estados"
import { useSessao } from "@/components/sessao"
import { CardAgendamento } from "@/features/agenda/card-agendamento"
import { FaixaBloqueio, NovoBloqueio } from "@/features/agenda/bloqueios"
import { HorarioFuncionamentoDialog } from "@/features/agenda/horario-funcionamento"
import { useAgendamentos, useBloqueios, useHorarios, type AgendamentoDetalhado } from "@/features/agendamentos/api"
import { DetalheAgendamento } from "@/features/agendamentos/detalhe-agendamento"
import { NovoAgendamento } from "@/features/agendamentos/novo-agendamento"
import { isoDia, normalizarHora } from "@/lib/format"
import { statusOcupaVaga } from "@/lib/status"
import { cn } from "@/lib/utils"

type Visao = "dia" | "semana" | "mes"

function intervalo(visao: Visao, ref: Date) {
  if (visao === "dia") return { inicio: ref, fim: ref }
  if (visao === "semana") return { inicio: startOfWeek(ref, { weekStartsOn: 1 }), fim: endOfWeek(ref, { weekStartsOn: 1 }) }
  return {
    inicio: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }),
    fim: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }),
  }
}

/** Gera a grade de horários do dia a partir do horário de funcionamento. */
function gradeDoDia(
  dia: Date,
  horarios: ReturnType<typeof useHorarios>["data"],
  agendamentos: AgendamentoDetalhado[]
): string[] {
  const h = horarios?.find((x) => x.dia_semana === dia.getDay())
  const slots = new Set<string>()
  if (h?.ativo) {
    const [ah, am] = h.abre.split(":").map(Number)
    const [fh, fm] = h.fecha.split(":").map(Number)
    for (let m = ah * 60 + am; m < fh * 60 + fm; m += h.intervalo_min) {
      slots.add(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`)
    }
  }
  agendamentos.forEach((a) => slots.add(normalizarHora(a.hora)))
  return [...slots].sort()
}

export default function AgendaPage() {
  const { isAdmin } = useSessao()
  const [visao, setVisao] = useState<Visao>("semana")
  const [ref, setRef] = useState(() => new Date())
  const [selecionado, setSelecionado] = useState<AgendamentoDetalhado | null>(null)

  const { inicio, fim } = intervalo(visao, ref)
  const filtros = { inicio: isoDia(inicio), fim: isoDia(fim) }
  const agendamentos = useAgendamentos(filtros)
  const bloqueios = useBloqueios(filtros.inicio, filtros.fim)
  const horarios = useHorarios()

  const porDia = useMemo(() => {
    const m = new Map<string, AgendamentoDetalhado[]>()
    agendamentos.data?.forEach((a) => m.set(a.data, [...(m.get(a.data) ?? []), a]))
    return m
  }, [agendamentos.data])

  const capacidade = (dia: Date) => horarios.data?.find((x) => x.dia_semana === dia.getDay())?.capacidade_por_slot

  const mover = (dir: 1 | -1) =>
    setRef((r) => (visao === "dia" ? addDays(r, dir) : visao === "semana" ? addWeeks(r, dir) : addMonths(r, dir)))

  const titulo =
    visao === "dia"
      ? format(ref, "EEEE, dd 'de' MMMM", { locale: ptBR })
      : visao === "semana"
        ? `${format(inicio, "dd/MM")} – ${format(fim, "dd/MM/yyyy")}`
        : format(ref, "MMMM 'de' yyyy", { locale: ptBR })

  // Mantém o detalhe aberto sincronizado com dados atualizados (realtime)
  const detalhe = selecionado ? (agendamentos.data?.find((a) => a.id === selecionado.id) ?? selecionado) : null

  return (
    <>
      <PageHeader
        titulo="Agenda"
        descricao="Banho, tosa e atendimentos por horário."
        acoes={
          <>
            <NovoAgendamento dataInicial={isoDia(ref)} />
            <NovoBloqueio dataInicial={isoDia(ref)} />
            {isAdmin && <HorarioFuncionamentoDialog />}
          </>
        }
      />

      <div className="bg-card shadow-soft mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3">
        <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Anterior">
          <ChevronLeft />
        </Button>
        <Button variant="outline" onClick={() => setRef(new Date())}>
          Hoje
        </Button>
        <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Próximo">
          <ChevronRight />
        </Button>
        <h2 className="ml-2 text-lg font-semibold capitalize" aria-live="polite">
          {titulo}
        </h2>
        <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="dia">Dia</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {bloqueios.data && bloqueios.data.length > 0 && (
        <div className="mb-4 space-y-2">
          {bloqueios.data.map((b) => (
            <FaixaBloqueio key={b.id} b={b} />
          ))}
        </div>
      )}

      {agendamentos.isLoading ? (
        <div className="bg-card rounded-2xl border">
          <Carregando linhas={6} />
        </div>
      ) : agendamentos.error ? (
        <div className="bg-card rounded-2xl border">
          <Erro erro={agendamentos.error} tentarNovamente={() => agendamentos.refetch()} />
        </div>
      ) : visao === "dia" ? (
        <VisaoDia
          dia={ref}
          lista={porDia.get(isoDia(ref)) ?? []}
          grade={gradeDoDia(ref, horarios.data, porDia.get(isoDia(ref)) ?? [])}
          capacidade={capacidade(ref)}
          onAbrir={setSelecionado}
        />
      ) : visao === "semana" ? (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[56rem] grid-cols-7 gap-2">
            {eachDayOfInterval({ start: inicio, end: fim }).map((dia) => {
              const lista = (porDia.get(isoDia(dia)) ?? []).sort((a, b) => normalizarHora(a.hora).localeCompare(normalizarHora(b.hora)))
              return (
                <section
                  key={dia.toISOString()}
                  className={cn("bg-card shadow-soft flex min-h-64 flex-col rounded-2xl border p-2", isToday(dia) && "ring-primary ring-2")}
                  aria-label={format(dia, "EEEE dd/MM", { locale: ptBR })}
                >
                  <button
                    type="button"
                    className="hover:bg-accent mb-2 rounded-lg px-1 py-1 text-left"
                    onClick={() => {
                      setRef(dia)
                      setVisao("dia")
                    }}
                  >
                    <span className="text-muted-foreground block text-xs capitalize">{format(dia, "EEE", { locale: ptBR })}</span>
                    <span className="text-lg font-semibold">{format(dia, "dd")}</span>
                    <span className="text-muted-foreground ml-1 text-xs">{lista.filter((a) => statusOcupaVaga(a.status)).length} ag.</span>
                  </button>
                  <div className="flex flex-col gap-1.5">
                    {lista.map((a) => (
                      <CardAgendamento key={a.id} ag={a} onClick={() => setSelecionado(a)} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
          <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-xs font-medium">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {eachDayOfInterval({ start: inicio, end: fim }).map((dia) => {
              const lista = (porDia.get(isoDia(dia)) ?? []).filter((a) => statusOcupaVaga(a.status))
              const bloqueado = bloqueios.data?.some((b) => b.tipo === "bloqueio" && !b.hora_inicio && isSameDay(new Date(`${b.data}T00:00`), dia))
              return (
                <button
                  key={dia.toISOString()}
                  type="button"
                  onClick={() => {
                    setRef(dia)
                    setVisao("dia")
                  }}
                  className={cn(
                    "hover:bg-accent/60 min-h-20 border-r border-b p-1.5 text-left align-top sm:min-h-28",
                    !isSameMonth(dia, ref) && "text-muted-foreground/60 bg-muted/30",
                    bloqueado && "bg-rose-50"
                  )}
                  aria-label={`${format(dia, "dd 'de' MMMM", { locale: ptBR })}: ${lista.length} agendamentos`}
                >
                  <span
                    className={cn(
                      "inline-grid size-6 place-items-center rounded-full text-xs font-semibold",
                      isToday(dia) && "bg-primary text-primary-foreground"
                    )}
                  >
                    {format(dia, "d")}
                  </span>
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {lista.slice(0, 3).map((a) => (
                      <p key={a.id} className="truncate text-[11px]">
                        {normalizarHora(a.hora)} {a.servico}
                      </p>
                    ))}
                    {lista.length > 3 && <p className="text-muted-foreground text-[11px]">+{lista.length - 3}</p>}
                  </div>
                  {lista.length > 0 && (
                    <span className="bg-primary/10 text-primary mt-1 inline-block rounded-full px-1.5 text-[11px] font-semibold sm:hidden">
                      {lista.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <DetalheAgendamento agendamento={detalhe} onFechar={() => setSelecionado(null)} />
    </>
  )
}

function VisaoDia({
  dia,
  lista,
  grade,
  capacidade,
  onAbrir,
}: {
  dia: Date
  lista: AgendamentoDetalhado[]
  grade: string[]
  capacidade?: number
  onAbrir: (a: AgendamentoDetalhado) => void
}) {
  if (grade.length === 0)
    return (
      <div className="bg-card rounded-2xl border">
        <Vazio
          icone={CalendarDays}
          titulo="Sem agendamentos"
          descricao={`Nenhum atendimento em ${format(dia, "dd/MM")} e o petshop não tem expediente configurado para esse dia.`}
        />
      </div>
    )
  return (
    <ol className="bg-card shadow-soft divide-y rounded-2xl border">
      {grade.map((hora) => {
        const doHorario = lista.filter((a) => normalizarHora(a.hora) === hora)
        const ocupados = doHorario.filter((a) => statusOcupaVaga(a.status)).length
        const lotado = capacidade !== undefined && ocupados >= capacidade
        return (
          <li key={hora} className="flex gap-3 p-3">
            <div className="w-16 shrink-0">
              <p className="font-semibold tabular-nums">{hora}</p>
              {capacidade !== undefined && (
                <p className={cn("text-xs", lotado ? "text-rose-700" : "text-muted-foreground")}>
                  {ocupados}/{capacidade} {lotado ? "lotado" : "vagas"}
                </p>
              )}
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {doHorario.length ? (
                doHorario.map((a) => <CardAgendamento key={a.id} ag={a} onClick={() => onAbrir(a)} />)
              ) : (
                <p className="text-muted-foreground self-center text-sm">Livre</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
