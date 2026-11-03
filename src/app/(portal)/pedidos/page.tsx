"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, ShoppingBag, Truck, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EstadoQuery, PageHeader, Vazio } from "@/components/estados"
import { StatusPedidoBadge } from "@/components/status-badge"
import { usePedidos, type PedidoComCliente } from "@/features/pedidos/api"
import { DetalhePedido } from "@/features/pedidos/detalhe-pedido"
import { useAlertasRealtime } from "@/features/realtime/use-alertas-realtime"
import { baixarCsv } from "@/lib/csv"
import { formatarDataHora, formatarMoeda } from "@/lib/format"
import { FLUXO_PEDIDO } from "@/lib/status"
import type { StatusPedido } from "@/lib/database.types"
import { cn } from "@/lib/utils"

const COLUNAS: { titulo: string; status: StatusPedido[] }[] = [
  { titulo: "Novos", status: ["Novo"] },
  { titulo: "Confirmados", status: ["Confirmado"] },
  { titulo: "Em separação", status: ["Em separação"] },
  { titulo: "Pronto / Saiu", status: ["Pronto", "Saiu para entrega"] },
]

function CardPedido({ p, onClick }: { p: PedidoComCliente; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card hover:shadow-soft focus-visible:ring-ring w-full rounded-xl border p-3 text-left outline-none focus-visible:ring-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">#{p.numero}</span>
        <StatusPedidoBadge status={p.status} />
      </div>
      <p className="mt-1 truncate text-sm">{p.cliente?.nome ?? p.cliente_nome ?? "Cliente"}</p>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          {p.tipo_entrega === "entrega" ? <Truck className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
          {p.tipo_entrega === "entrega" ? "Entrega" : "Retirada"} · {formatarDataHora(p.created_at)}
        </span>
        <span className="text-foreground font-semibold">{formatarMoeda(p.total)}</span>
      </div>
    </button>
  )
}

export default function PedidosPage() {
  const query = usePedidos()
  const [aba, setAba] = useState<"fila" | "finalizados">("fila")
  const [selecionado, setSelecionado] = useState<PedidoComCliente | null>(null)
  const { zerarPedidos } = useAlertasRealtime()
  useEffect(() => zerarPedidos(), [zerarPedidos])

  const finalizados = useMemo(
    () => (query.data ?? []).filter((p) => p.status === "Entregue" || p.status === "Cancelado"),
    [query.data]
  )
  const detalhe = selecionado ? (query.data?.find((p) => p.id === selecionado.id) ?? selecionado) : null

  return (
    <>
      <PageHeader
        titulo="Pedidos"
        descricao="Novo → Confirmado → Em separação → Pronto/Saiu para entrega → Entregue. Confirmar baixa o estoque; cancelar estorna."
        acoes={
          <Button
            variant="outline"
            disabled={!query.data?.length}
            onClick={() =>
              baixarCsv(
                "pedidos",
                (query.data ?? []).map((p) => ({
                  Número: p.numero,
                  Data: formatarDataHora(p.created_at),
                  Cliente: p.cliente?.nome ?? p.cliente_nome ?? "",
                  Status: p.status,
                  Entrega: p.tipo_entrega,
                  Pagamento: p.forma_pagamento ?? "",
                  Total: Number(p.total).toFixed(2).replace(".", ","),
                }))
              )
            }
          >
            <Download /> Exportar CSV
          </Button>
        }
      />

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)} className="mb-4">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="finalizados">Entregues e cancelados</TabsTrigger>
        </TabsList>
      </Tabs>

      <EstadoQuery query={query}>
        {(pedidos) =>
          aba === "fila" ? (
            pedidos.every((p) => !FLUXO_PEDIDO.slice(0, -1).includes(p.status)) ? (
              <div className="bg-card rounded-2xl border">
                <Vazio
                  icone={ShoppingBag}
                  titulo="Nenhum pedido em andamento"
                  descricao="Pedidos feitos pelo app aparecem aqui na hora, com aviso sonoro."
                />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {COLUNAS.map((col) => {
                  const lista = pedidos.filter((p) => col.status.includes(p.status)).reverse()
                  return (
                    <section key={col.titulo} className="bg-muted/50 rounded-2xl border p-3" aria-label={col.titulo}>
                      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold">
                        {col.titulo}
                        <span className={cn("rounded-full px-2 text-xs", lista.length ? "bg-primary text-white" : "bg-muted")}>
                          {lista.length}
                        </span>
                      </h2>
                      <div className="space-y-2">
                        {lista.length ? (
                          lista.map((p) => <CardPedido key={p.id} p={p} onClick={() => setSelecionado(p)} />)
                        ) : (
                          <p className="text-muted-foreground py-6 text-center text-xs">Vazio</p>
                        )}
                      </div>
                    </section>
                  )
                })}
              </div>
            )
          ) : finalizados.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {finalizados.map((p) => (
                <CardPedido key={p.id} p={p} onClick={() => setSelecionado(p)} />
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border">
              <Vazio titulo="Nenhum pedido finalizado" />
            </div>
          )
        }
      </EstadoQuery>

      <DetalhePedido pedido={detalhe} onFechar={() => setSelecionado(null)} />
    </>
  )
}
