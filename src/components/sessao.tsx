"use client"

import { createContext, useContext } from "react"
import type { Admin } from "@/lib/database.types"

export type Sessao = { user: { id: string; email: string }; membro: Admin }

const SessaoContext = createContext<Sessao | null>(null)

export function SessaoProvider({ value, children }: { value: Sessao; children: React.ReactNode }) {
  return <SessaoContext.Provider value={value}>{children}</SessaoContext.Provider>
}

export function useSessao() {
  const s = useContext(SessaoContext)
  if (!s) throw new Error("useSessao fora do SessaoProvider")
  return { ...s, isAdmin: s.membro.papel === "admin" }
}
