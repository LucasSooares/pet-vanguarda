"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro, ok } from "@/lib/erros"
import type { Categoria, MovimentacaoEstoque, Produto, TipoMovimentacao } from "@/lib/database.types"

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => (ok(await getSupabase().from("produtos").select("*").order("nome")) ?? []) as Produto[],
  })
}

export function useCategorias() {
  return useQuery({
    queryKey: ["categorias"],
    queryFn: async () =>
      (ok(await getSupabase().from("categorias").select("*").order("ordem").order("nome")) ?? []) as Categoria[],
  })
}

const invalidarProdutos = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["produtos"] })
  qc.invalidateQueries({ queryKey: ["movimentacoes"] })
  qc.invalidateQueries({ queryKey: ["dashboard"] })
}

/** Envia imagem ao bucket público "produtos" (policy: só admin escreve). */
export async function enviarImagem(arquivo: File): Promise<string> {
  const ext = arquivo.name.split(".").pop()?.toLowerCase() || "jpg"
  const caminho = `${crypto.randomUUID()}.${ext}`
  const supabase = getSupabase()
  const { error } = await supabase.storage.from("produtos").upload(caminho, arquivo, {
    cacheControl: "31536000",
    contentType: arquivo.type,
  })
  if (error) throw error
  return supabase.storage.from("produtos").getPublicUrl(caminho).data.publicUrl
}

export type ProdutoForm = Omit<Produto, "id" | "created_at" | "updated_at" | "estoque_atual"> & {
  estoque_inicial?: number
}

export function useSalvarProduto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: ProdutoForm }) => {
      const supabase = getSupabase()
      const { estoque_inicial, ...campos } = dados
      if (id) {
        const { error } = await supabase.from("produtos").update(campos).eq("id", id)
        if (error) throw error
        return
      }
      const { data, error } = await supabase.from("produtos").insert(campos).select("id").single()
      if (error) throw error
      if (estoque_inicial && estoque_inicial > 0) {
        const r = await supabase
          .from("movimentacoes_estoque")
          .insert({ produto_id: data.id, tipo: "entrada", quantidade: estoque_inicial, motivo: "Estoque inicial" })
        if (r.error) throw r.error
      }
    },
    onSuccess: (_, v) => {
      toast.success(v.id ? "Produto atualizado" : "Produto cadastrado")
      invalidarProdutos(qc)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function useAlternarProduto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await getSupabase().from("produtos").update({ ativo }).eq("id", id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      toast.success(v.ativo ? "Produto ativado" : "Produto desativado")
      invalidarProdutos(qc)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function useSalvarCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Partial<Categoria> & { nome: string }) => {
      const supabase = getSupabase()
      const { error } = c.id
        ? await supabase.from("categorias").update({ nome: c.nome, ativo: c.ativo, ordem: c.ordem }).eq("id", c.id)
        : await supabase.from("categorias").insert({ nome: c.nome, ordem: c.ordem ?? 0 })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Categoria salva")
      qc.invalidateQueries({ queryKey: ["categorias"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function useMovimentacoes(produtoId: string | null) {
  return useQuery({
    queryKey: ["movimentacoes", produtoId],
    enabled: !!produtoId,
    queryFn: async () =>
      (ok(
        await getSupabase()
          .from("movimentacoes_estoque")
          .select("*")
          .eq("produto_id", produtoId!)
          .order("created_at", { ascending: false })
          .limit(200)
      ) ?? []) as MovimentacaoEstoque[],
  })
}

export function useMovimentar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: { produto_id: string; tipo: TipoMovimentacao; quantidade: number; motivo: string }) => {
      const { error } = await getSupabase().from("movimentacoes_estoque").insert(m)
      if (error) throw error
    },
    onSuccess: (_, m) => {
      toast.success(m.tipo === "entrada" ? "Entrada registrada" : m.tipo === "saida" ? "Saída registrada" : "Estoque ajustado")
      invalidarProdutos(qc)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}
