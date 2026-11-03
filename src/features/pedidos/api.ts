"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro, ok } from "@/lib/erros"
import type { ClienteResumo, Pedido, PedidoItem, PedidoStatusHistorico, StatusPedido } from "@/lib/database.types"

export type PedidoComCliente = Pedido & { cliente: ClienteResumo | null }

export function usePedidos(filtros: { inicio?: string; fim?: string } = {}) {
  return useQuery({
    queryKey: ["pedidos", filtros],
    queryFn: async (): Promise<PedidoComCliente[]> => {
      const supabase = getSupabase()
      let q = supabase.from("pedidos").select("*").order("created_at", { ascending: false }).limit(500)
      if (filtros.inicio) q = q.gte("created_at", `${filtros.inicio}T00:00:00-03:00`)
      if (filtros.fim) q = q.lte("created_at", `${filtros.fim}T23:59:59-03:00`)
      const pedidos = (ok(await q) ?? []) as Pedido[]
      const ids = [...new Set(pedidos.map((p) => p.user_id).filter(Boolean))] as string[]
      const clientes = ids.length ? (ok(await supabase.rpc("clientes_resumo", { p_ids: ids })) ?? []) : []
      const mapa = new Map(clientes.map((c) => [c.user_id, c]))
      return pedidos.map((p) => ({ ...p, cliente: p.user_id ? (mapa.get(p.user_id) ?? null) : null }))
    },
  })
}

export function usePedidoDetalhe(id: string | null) {
  return useQuery({
    queryKey: ["pedidos", "detalhe", id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = getSupabase()
      const [itens, historico] = await Promise.all([
        ok(await supabase.from("pedido_itens").select("*").eq("pedido_id", id!)),
        ok(await supabase.from("pedido_status_historico").select("*").eq("pedido_id", id!).order("created_at")),
      ])
      return { itens: (itens ?? []) as PedidoItem[], historico: (historico ?? []) as PedidoStatusHistorico[] }
    },
  })
}

export function useMudarStatusPedido() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, motivo }: { id: string; status: StatusPedido; motivo?: string }) => {
      const campos: Partial<Pedido> = { status }
      if (status === "Cancelado") campos.motivo_cancelamento = motivo ?? null
      const { error } = await getSupabase().from("pedidos").update(campos).eq("id", id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      toast.success(
        v.status === "Confirmado"
          ? "Pedido confirmado — estoque baixado"
          : v.status === "Cancelado"
            ? "Pedido cancelado — estoque estornado quando aplicável"
            : `Pedido movido para “${v.status}”`
      )
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      qc.invalidateQueries({ queryKey: ["produtos"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}
