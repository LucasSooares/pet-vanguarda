import type { StatusPedido } from "@/lib/database.types"

// Agendamentos — compatível com o app: o padrão do banco continua "Confirmado".
export const STATUS_AGENDAMENTO = ["Pendente", "Confirmado", "Concluído", "Cancelado", "Falta"] as const
export type StatusAgendamento = (typeof STATUS_AGENDAMENTO)[number]

/** Normaliza variações vindas do app ("confirmado", "Concluido"...) */
export function normalizarStatusAgendamento(s: string | null | undefined): StatusAgendamento | string {
  const v = (s ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const mapa: Record<string, StatusAgendamento> = {
    pendente: "Pendente",
    confirmado: "Confirmado",
    agendado: "Confirmado",
    concluido: "Concluído",
    finalizado: "Concluído",
    cancelado: "Cancelado",
    cancelada: "Cancelado",
    falta: "Falta",
  }
  return mapa[v] ?? (s || "—")
}

export const statusOcupaVaga = (s: string) => !["Cancelado", "Falta"].includes(normalizarStatusAgendamento(s))

export const COR_STATUS_AGENDAMENTO: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-900 border-amber-200",
  Confirmado: "bg-emerald-100 text-emerald-900 border-emerald-200",
  Concluído: "bg-sky-100 text-sky-900 border-sky-200",
  Cancelado: "bg-zinc-100 text-zinc-600 border-zinc-200 line-through",
  Falta: "bg-rose-100 text-rose-900 border-rose-200",
}

// Pedidos — espelha public.pedido_transicao_valida() no banco
export const FLUXO_PEDIDO: StatusPedido[] = ["Novo", "Confirmado", "Em separação", "Pronto", "Saiu para entrega", "Entregue"]

export const TRANSICOES_PEDIDO: Record<StatusPedido, StatusPedido[]> = {
  Novo: ["Confirmado", "Cancelado"],
  Confirmado: ["Em separação", "Cancelado"],
  "Em separação": ["Pronto", "Saiu para entrega", "Cancelado"],
  Pronto: ["Entregue", "Cancelado"],
  "Saiu para entrega": ["Entregue", "Cancelado"],
  Entregue: [],
  Cancelado: [],
}

export function proximosStatusPedido(atual: StatusPedido, tipoEntrega: "retirada" | "entrega"): StatusPedido[] {
  return TRANSICOES_PEDIDO[atual].filter((s) =>
    atual === "Em separação" ? s === "Cancelado" || s === (tipoEntrega === "entrega" ? "Saiu para entrega" : "Pronto") : true
  )
}

export const COR_STATUS_PEDIDO: Record<StatusPedido, string> = {
  Novo: "bg-amber-100 text-amber-900 border-amber-200",
  Confirmado: "bg-emerald-100 text-emerald-900 border-emerald-200",
  "Em separação": "bg-violet-100 text-violet-900 border-violet-200",
  Pronto: "bg-sky-100 text-sky-900 border-sky-200",
  "Saiu para entrega": "bg-sky-100 text-sky-900 border-sky-200",
  Entregue: "bg-zinc-100 text-zinc-700 border-zinc-200",
  Cancelado: "bg-rose-100 text-rose-900 border-rose-200",
}

export const PORTES = ["Pequeno", "Médio", "Grande"] as const

export const normalizarPorte = (p: string | null | undefined) => {
  const v = (p ?? "").replace(/"/g, "").trim().toLowerCase()
  if (v.startsWith("peq")) return "Pequeno"
  if (v.startsWith("m")) return "Médio"
  if (v.startsWith("gr")) return "Grande"
  return null
}
