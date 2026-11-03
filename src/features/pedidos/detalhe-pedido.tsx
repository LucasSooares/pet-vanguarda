"use client"

import Link from "next/link"
import { ArrowRight, MessageCircle, Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Confirmar } from "@/components/confirmar"
import { Carregando, Spinner } from "@/components/estados"
import { StatusPedidoBadge } from "@/components/status-badge"
import { useConfiguracoes } from "@/features/configuracoes/api"
import { formatarDataHora, formatarMoeda, formatarTelefone, linkWhatsApp, preencherModelo } from "@/lib/format"
import { proximosStatusPedido } from "@/lib/status"
import { useMudarStatusPedido, usePedidoDetalhe, type PedidoComCliente } from "./api"

export function DetalhePedido({ pedido, onFechar }: { pedido: PedidoComCliente | null; onFechar: () => void }) {
  const detalhe = usePedidoDetalhe(pedido?.id ?? null)
  const mudar = useMudarStatusPedido()
  const config = useConfiguracoes()
  if (!pedido) return null

  const proximos = proximosStatusPedido(pedido.status, pedido.tipo_entrega)
  const avancos = proximos.filter((s) => s !== "Cancelado")
  const podeCancelar = proximos.includes("Cancelado")
  const nome = pedido.cliente?.nome ?? pedido.cliente_nome ?? "Cliente"
  const telefone = pedido.cliente?.telefone ?? pedido.cliente_telefone
  const chaveMsg = pedido.status === "Saiu para entrega" ? "pedido_saiu" : "pedido_pronto"
  const whats = linkWhatsApp(
    telefone,
    preencherModelo(config.data?.mensagens?.[chaveMsg] ?? "", { cliente: nome.split(" ")[0], numero: pedido.numero })
  )

  return (
    <Sheet open={!!pedido} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Pedido #{pedido.numero} <StatusPedidoBadge status={pedido.status} />
          </SheetTitle>
          <SheetDescription>{formatarDataHora(pedido.created_at)}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          <section className="space-y-1 text-sm">
            <p className="font-semibold">{nome}</p>
            <p className="text-muted-foreground">
              {formatarTelefone(telefone)} {pedido.cliente?.email && `· ${pedido.cliente.email}`}
            </p>
            <p>
              <strong>{pedido.tipo_entrega === "entrega" ? "Entrega" : "Retirada na loja"}</strong>
              {pedido.forma_pagamento && ` · Pagamento: ${pedido.forma_pagamento}`}
            </p>
            {pedido.endereco && <p className="text-muted-foreground">{pedido.endereco}</p>}
            {pedido.observacoes && <p className="bg-muted rounded-lg p-2">{pedido.observacoes}</p>}
            {pedido.motivo_cancelamento && <p className="text-rose-800">Motivo do cancelamento: {pedido.motivo_cancelamento}</p>}
          </section>

          {detalhe.isLoading ? (
            <Carregando linhas={3} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalhe.data?.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        {i.nome}
                        <span className="text-muted-foreground block text-xs">{formatarMoeda(i.preco_unit)} un.</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(i.preco_unit * i.quantidade)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(pedido.total)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              <section>
                <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
                <ol className="border-primary/30 space-y-2 border-l-2 pl-4 text-sm">
                  {detalhe.data?.historico.map((h) => (
                    <li key={h.id}>
                      <span className="font-medium">{h.status_novo}</span>
                      <span className="text-muted-foreground"> · {formatarDataHora(h.created_at)}</span>
                      {h.observacao && <p className="text-muted-foreground text-xs">{h.observacao}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            {avancos.map((s) => (
              <Button key={s} disabled={mudar.isPending} onClick={() => mudar.mutate({ id: pedido.id, status: s })}>
                {mudar.isPending ? <Spinner /> : <ArrowRight />} {s}
              </Button>
            ))}
            {podeCancelar && (
              <Confirmar
                gatilho={
                  <Button variant="outline" className="text-destructive">
                    <X /> Cancelar pedido
                  </Button>
                }
                titulo={`Cancelar o pedido #${pedido.numero}?`}
                descricao={
                  pedido.estoque_baixado
                    ? "Os itens voltarão para o estoque (estorno automático)."
                    : "O pedido ainda não baixou estoque."
                }
                pedirMotivo="Motivo do cancelamento"
                textoConfirmar="Cancelar pedido"
                onConfirmar={(motivo) => mudar.mutateAsync({ id: pedido.id, status: "Cancelado", motivo })}
              />
            )}
            <Button variant="outline" asChild>
              <Link href={`/pedidos/${pedido.id}/imprimir`} target="_blank">
                <Printer /> Imprimir
              </Link>
            </Button>
            {whats && (
              <Button variant="ghost" asChild>
                <a href={whats} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
