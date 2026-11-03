import { cn } from "@/lib/utils"
import { COR_STATUS_AGENDAMENTO, COR_STATUS_PEDIDO, normalizarStatusAgendamento } from "@/lib/status"
import type { StatusPedido } from "@/lib/database.types"

const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"

export function StatusAgendamentoBadge({ status, className }: { status: string; className?: string }) {
  const s = normalizarStatusAgendamento(status)
  return <span className={cn(base, COR_STATUS_AGENDAMENTO[s] ?? "bg-muted", className)}>{s}</span>
}

export function StatusPedidoBadge({ status, className }: { status: StatusPedido; className?: string }) {
  return <span className={cn(base, COR_STATUS_PEDIDO[status], className)}>{status}</span>
}
