"use client"

import { useEffect, useMemo, useState } from "react"
import { addDays } from "date-fns"
import { BellOff, BellRing, Download, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EstadoQuery, PageHeader, Vazio } from "@/components/estados"
import { StatusAgendamentoBadge } from "@/components/status-badge"
import { useAgendamentos, useServicos, type AgendamentoDetalhado } from "@/features/agendamentos/api"
import { DetalheAgendamento } from "@/features/agendamentos/detalhe-agendamento"
import { NovoAgendamento } from "@/features/agendamentos/novo-agendamento"
import { useAlertasRealtime } from "@/features/realtime/use-alertas-realtime"
import { baixarCsv } from "@/lib/csv"
import { formatarData, formatarDataHora, formatarMoeda, formatarTelefone, isoDia, normalizarHora } from "@/lib/format"
import { STATUS_AGENDAMENTO, normalizarPorte, normalizarStatusAgendamento } from "@/lib/status"
import { cn } from "@/lib/utils"

const TODOS = "__todos"

export default function AgendamentosPage() {
  const hoje = new Date()
  const [inicio, setInicio] = useState(isoDia(addDays(hoje, -7)))
  const [fim, setFim] = useState(isoDia(addDays(hoje, 30)))
  const [status, setStatus] = useState(TODOS)
  const [servico, setServico] = useState(TODOS)
  const [busca, setBusca] = useState("")
  const [buscaAtrasada, setBuscaAtrasada] = useState("")
  const [selecionado, setSelecionado] = useState<AgendamentoDetalhado | null>(null)
  const [vistos, setVistos] = useState<Set<string> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtrasada(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])

  const query = useAgendamentos({
    inicio,
    fim,
    status: status === TODOS ? undefined : status,
    servico: servico === TODOS ? undefined : servico,
    busca: buscaAtrasada || undefined,
  })
  const servicos = useServicos()
  const { zerarAgendamentos, somAtivo, alternarSom } = useAlertasRealtime()

  // Ao abrir a página zera o contador; linhas que chegarem depois ficam destacadas
  useEffect(() => zerarAgendamentos(), [zerarAgendamentos])
  useEffect(() => {
    if (query.data && vistos === null) setVistos(new Set(query.data.map((a) => a.id)))
  }, [query.data, vistos])
  const novos = useMemo(
    () => new Set(vistos ? (query.data ?? []).filter((a) => !vistos.has(a.id)).map((a) => a.id) : []),
    [query.data, vistos]
  )

  const exportar = (lista: AgendamentoDetalhado[]) =>
    baixarCsv(
      `agendamentos_${inicio}_a_${fim}`,
      lista.map((a) => ({
        Data: formatarData(a.data),
        Hora: normalizarHora(a.hora),
        Serviço: a.servico,
        Pet: a.pet ?? "",
        Porte: normalizarPorte(a.porte ?? a.petInfo?.porte) ?? "",
        Cliente: a.cliente?.nome ?? a.cliente_nome ?? "",
        Telefone: a.cliente?.telefone ?? a.cliente_telefone ?? "",
        "E-mail": a.cliente?.email ?? "",
        Preço: Number(a.preco ?? 0).toFixed(2).replace(".", ","),
        Status: normalizarStatusAgendamento(a.status),
        Origem: a.origem,
        "Motivo cancelamento": a.motivo_cancelamento ?? "",
        "Criado em": formatarDataHora(a.created_at),
      }))
    )

  const detalhe = selecionado ? (query.data?.find((a) => a.id === selecionado.id) ?? selecionado) : null

  return (
    <>
      <PageHeader
        titulo="Agendamentos"
        descricao="Atualiza em tempo real quando um cliente agenda pelo app."
        acoes={
          <>
            <Button variant="outline" onClick={alternarSom} aria-pressed={somAtivo}>
              {somAtivo ? <BellRing /> : <BellOff />} Som {somAtivo ? "ligado" : "desligado"}
            </Button>
            <Button variant="outline" disabled={!query.data?.length} onClick={() => query.data && exportar(query.data)}>
              <Download /> Exportar CSV
            </Button>
            <NovoAgendamento />
          </>
        }
      />

      <div className="bg-card shadow-soft mb-4 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="busca">Buscar</Label>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
            <Input id="busca" className="pl-9" placeholder="Cliente, pet, telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="f-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {STATUS_AGENDAMENTO.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-servico">Serviço</Label>
          <Select value={servico} onValueChange={setServico}>
            <SelectTrigger id="f-servico" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {servicos.data?.map((s) => (
                <SelectItem key={s.id} value={s.nome}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="f-ini">De</Label>
            <Input id="f-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-fim">Até</Label>
            <Input id="f-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
        <EstadoQuery
          query={query}
          vazio={(d) => d.length === 0}
          vazioComponente={<Vazio titulo="Nenhum agendamento" descricao="Ajuste os filtros ou o período." />}
        >
          {(lista) => (
            <>
              <p className="text-muted-foreground border-b px-4 py-2 text-xs" aria-live="polite">
                {lista.length} agendamento(s) · {formatarMoeda(lista.reduce((s, a) => s + Number(a.preco ?? 0), 0))}
              </p>
              {/* Tabela no desktop */}
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Pet</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((a) => (
                    <TableRow
                      key={a.id}
                      className={cn("cursor-pointer", novos.has(a.id) && "bg-amber-50 animate-pulse")}
                      onClick={() => setSelecionado(a)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setSelecionado(a)}
                    >
                      <TableCell className="tabular-nums">
                        {formatarData(a.data)} <span className="text-muted-foreground">{normalizarHora(a.hora)}</span>
                        {novos.has(a.id) && <span className="ml-2 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold">NOVO</span>}
                      </TableCell>
                      <TableCell>{a.servico}</TableCell>
                      <TableCell>
                        {a.pet}
                        <span className="text-muted-foreground block text-xs">{normalizarPorte(a.porte ?? a.petInfo?.porte)}</span>
                      </TableCell>
                      <TableCell>
                        {a.cliente?.nome ?? a.cliente_nome ?? "—"}
                        <span className="text-muted-foreground block text-xs">
                          {formatarTelefone(a.cliente?.telefone ?? a.cliente_telefone)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(a.preco)}</TableCell>
                      <TableCell>
                        <StatusAgendamentoBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* Cards no celular */}
              <ul className="divide-y md:hidden">
                {lista.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(a)}
                      className={cn("w-full px-4 py-3 text-left", novos.has(a.id) && "bg-amber-50")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {formatarData(a.data, "dd/MM")} {normalizarHora(a.hora)} · {a.servico}
                        </span>
                        <StatusAgendamentoBadge status={a.status} />
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {a.pet} — {a.cliente?.nome ?? a.cliente_nome ?? "Sem cadastro"} · {formatarMoeda(a.preco)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </EstadoQuery>
      </div>

      <DetalheAgendamento agendamento={detalhe} onFechar={() => setSelecionado(null)} />
    </>
  )
}
