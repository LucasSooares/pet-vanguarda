"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro, ok } from "@/lib/erros"
import type { Agendamento, BloqueioAgenda, ClienteResumo, HorarioFuncionamento, Pet, Servico, ServicoPreco } from "@/lib/database.types"

export type FiltrosAgendamento = {
  inicio?: string
  fim?: string
  status?: string
  servico?: string
  busca?: string
}

export type AgendamentoDetalhado = Agendamento & {
  cliente: ClienteResumo | null
  petInfo: Pick<Pet, "id" | "nome" | "raca" | "porte" | "especie" | "foto" | "observacoes"> | null
}

/** Agendamentos + dados do cliente (via RPC) + pet (RLS de staff). */
export function useAgendamentos(filtros: FiltrosAgendamento) {
  return useQuery({
    queryKey: ["agendamentos", filtros],
    queryFn: async (): Promise<AgendamentoDetalhado[]> => {
      const supabase = getSupabase()
      let q = supabase.from("agendamentos").select("*").order("data").order("hora").limit(2000)
      if (filtros.inicio) q = q.gte("data", filtros.inicio)
      if (filtros.fim) q = q.lte("data", filtros.fim)
      if (filtros.status) q = q.ilike("status", filtros.status)
      if (filtros.servico) q = q.eq("servico", filtros.servico)
      const lista = ok(await q) ?? []

      const ids = [...new Set(lista.map((a) => a.user_id).filter(Boolean))] as string[]
      const [clientes, pets] = await Promise.all([
        ids.length ? (ok(await supabase.rpc("clientes_resumo", { p_ids: ids })) ?? []) : [],
        ids.length
          ? (ok(
              await supabase
                .from("pets")
                .select("id, user_id, pet_key, nome, raca, porte, especie, foto, observacoes")
                .in("user_id", ids)
            ) ?? [])
          : [],
      ])
      const mapaCli = new Map(clientes.map((c) => [c.user_id, c]))
      const encontrarPet = (a: Agendamento) =>
        pets.find((p) => p.id === a.pet_id) ??
        pets.find(
          (p) => p.user_id === a.user_id && (p.pet_key === a.pet || p.nome.toLowerCase() === (a.pet ?? "").trim().toLowerCase())
        ) ??
        null

      let res = lista.map((a) => ({
        ...a,
        cliente: a.user_id ? (mapaCli.get(a.user_id) ?? null) : null,
        petInfo: encontrarPet(a),
      }))

      if (filtros.busca) {
        const t = filtros.busca.toLowerCase()
        res = res.filter((a) =>
          [a.pet, a.cliente?.nome, a.cliente?.email, a.cliente?.telefone, a.cliente_nome, a.cliente_telefone, a.servico]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(t))
        )
      }
      return res
    },
  })
}

export function useServicos() {
  return useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      const supabase = getSupabase()
      const [servicos, precos] = await Promise.all([
        ok(await supabase.from("servicos").select("*").order("nome")),
        ok(await supabase.from("servicos_precos").select("*")),
      ])
      return (servicos as Servico[]).map((s) => ({
        ...s,
        precos: (precos as ServicoPreco[]).filter((p) => p.servico_id === s.id),
      }))
    },
  })
}

export function useHorarios() {
  return useQuery({
    queryKey: ["horarios"],
    queryFn: async () => ok(await getSupabase().from("horarios_funcionamento").select("*").order("dia_semana")) as HorarioFuncionamento[],
  })
}

export function useBloqueios(inicio: string, fim: string) {
  return useQuery({
    queryKey: ["bloqueios", inicio, fim],
    queryFn: async () =>
      ok(
        await getSupabase().from("bloqueios_agenda").select("*").gte("data", inicio).lte("data", fim).order("data")
      ) as BloqueioAgenda[],
  })
}

export function useHorariosLivres(data: string | null) {
  return useQuery({
    queryKey: ["horarios-livres", data],
    enabled: !!data,
    queryFn: async () => ok(await getSupabase().rpc("horarios_livres", { p_data: data! })),
  })
}

/** Atualiza campos de um agendamento (status, remarcação…) com toast e invalidação. */
export function useAtualizarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Agendamento> }) => {
      const { error } = await getSupabase().from("agendamentos").update(campos).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agendamentos"] })
      qc.invalidateQueries({ queryKey: ["horarios-livres"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function useCriarAgendamento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (novo: Partial<Agendamento> & Pick<Agendamento, "servico" | "data" | "hora">) => {
      const { error } = await getSupabase().from("agendamentos").insert({ ...novo, origem: "balcao" })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Agendamento criado")
      qc.invalidateQueries({ queryKey: ["agendamentos"] })
      qc.invalidateQueries({ queryKey: ["horarios-livres"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}
