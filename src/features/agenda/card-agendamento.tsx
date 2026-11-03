import { cn } from "@/lib/utils"
import { normalizarHora } from "@/lib/format"
import { COR_STATUS_AGENDAMENTO, normalizarPorte, normalizarStatusAgendamento } from "@/lib/status"
import type { AgendamentoDetalhado } from "@/features/agendamentos/api"

export function CardAgendamento({
  ag,
  compacto,
  onClick,
}: {
  ag: AgendamentoDetalhado
  compacto?: boolean
  onClick: () => void
}) {
  const status = normalizarStatusAgendamento(ag.status)
  const cliente = ag.cliente?.nome ?? ag.cliente_nome ?? "Sem cadastro"
  const porte = normalizarPorte(ag.porte ?? ag.petInfo?.porte)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border text-left transition-shadow hover:shadow-soft focus-visible:ring-ring outline-none focus-visible:ring-2",
        COR_STATUS_AGENDAMENTO[status] ?? "bg-card",
        compacto ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
      )}
      aria-label={`${normalizarHora(ag.hora)} ${ag.servico} — ${ag.pet ?? ""} (${cliente}), ${status}`}
    >
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span className="truncate">
          {normalizarHora(ag.hora)} · {ag.servico}
        </span>
        {!compacto && <span className="text-xs font-medium opacity-80">{status}</span>}
      </div>
      {!compacto && (
        <p className="truncate opacity-90">
          {ag.pet ?? "Pet"}
          {porte ? ` (${porte})` : ""} — {cliente}
        </p>
      )}
    </button>
  )
}
