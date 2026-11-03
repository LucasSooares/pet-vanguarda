"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import { formatarData, normalizarHora } from "@/lib/format"
import type { Agendamento, Pedido } from "@/lib/database.types"

type Alertas = {
  agendamentosNovos: number
  pedidosNovos: number
  zerarAgendamentos: () => void
  zerarPedidos: () => void
  somAtivo: boolean
  alternarSom: () => void
}

const AlertasContext = createContext<Alertas | null>(null)

/** Bipe curto via Web Audio (sem arquivo de áudio). */
function tocarBipe() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime)
    ganho.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(ganho).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
    osc.onended = () => ctx.close()
  } catch {
    // navegador bloqueou áudio antes de interação do usuário
  }
}

/** Assina agendamentos e pedidos via Supabase Realtime (respeita RLS). */
export function AlertasRealtimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const [agendamentosNovos, setAg] = useState(0)
  const [pedidosNovos, setPed] = useState(0)
  const [somAtivo, setSomAtivo] = useState(true)
  const somRef = useRef(somAtivo)
  somRef.current = somAtivo

  useEffect(() => {
    try {
      setSomAtivo(localStorage.getItem("pv_som") !== "off")
    } catch {}
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    const canal = supabase
      .channel("portal-alertas")
      .on("postgres_changes", { event: "*", schema: "public", table: "agendamentos" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["agendamentos"] })
        qc.invalidateQueries({ queryKey: ["dashboard"] })
        if (payload.eventType === "INSERT") {
          const a = payload.new as Agendamento
          setAg((n) => n + 1)
          if (somRef.current) tocarBipe()
          toast.info("Novo agendamento", {
            description: `${a.servico}${a.pet ? ` · ${a.pet}` : ""} — ${formatarData(a.data)} às ${normalizarHora(a.hora)}`,
          })
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["pedidos"] })
        qc.invalidateQueries({ queryKey: ["dashboard"] })
        if (payload.eventType === "INSERT") {
          const p = payload.new as Pedido
          setPed((n) => n + 1)
          if (somRef.current) tocarBipe()
          toast.info(`Novo pedido #${p.numero}`, { description: "Confira a fila de pedidos." })
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [qc])

  const alternarSom = useCallback(() => {
    setSomAtivo((v) => {
      try {
        localStorage.setItem("pv_som", v ? "off" : "on")
      } catch {}
      return !v
    })
  }, [])

  return (
    <AlertasContext.Provider
      value={{
        agendamentosNovos,
        pedidosNovos,
        zerarAgendamentos: () => setAg(0),
        zerarPedidos: () => setPed(0),
        somAtivo,
        alternarSom,
      }}
    >
      {children}
    </AlertasContext.Provider>
  )
}

export function useAlertasRealtime() {
  const ctx = useContext(AlertasContext)
  if (!ctx) throw new Error("useAlertasRealtime fora do provider")
  return ctx
}
