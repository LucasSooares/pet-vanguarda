"use client"

import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/lib/supabase/client"
import { ok } from "@/lib/erros"
import type { Configuracoes } from "@/lib/database.types"

export function useConfiguracoes() {
  return useQuery({
    queryKey: ["configuracoes"],
    staleTime: 5 * 60_000,
    queryFn: async () => ok(await getSupabase().from("configuracoes").select("*").eq("id", 1).maybeSingle()) as Configuracoes | null,
  })
}
