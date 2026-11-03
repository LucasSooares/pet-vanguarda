"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { FileUp } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Spinner } from "@/components/estados"
import { baixarCsv, lerCsv } from "@/lib/csv"
import { mensagemErro } from "@/lib/erros"
import { formatarMoeda } from "@/lib/format"
import { getSupabase } from "@/lib/supabase/client"
import { useCategorias, useProdutos } from "./api"
import { analisarLinha, type LinhaAnalisada } from "./regras"

export function ImportarCsv() {
  const [aberto, setAberto] = useState(false)
  const [linhas, setLinhas] = useState<LinhaAnalisada[]>([])
  const [importando, setImportando] = useState(false)
  const produtos = useProdutos()
  const categorias = useCategorias()
  const qc = useQueryClient()
  const validas = linhas.filter((l) => l.dados)

  const ler = async (f: File) => {
    const { linhas: brutas } = lerCsv(await f.text())
    setLinhas(brutas.map((l, i) => analisarLinha(l, i + 2)))
  }

  const importar = async () => {
    setImportando(true)
    const supabase = getSupabase()
    let criados = 0
    let atualizados = 0
    const falhas: string[] = []
    try {
      // Cria categorias que ainda não existem
      const mapaCat = new Map((categorias.data ?? []).map((c) => [c.nome.toLowerCase(), c.id]))
      const novas = [...new Set(validas.map((l) => l.dados!.categoria).filter((c): c is string => !!c))].filter(
        (c) => !mapaCat.has(c.toLowerCase())
      )
      if (novas.length) {
        const { data, error } = await supabase.from("categorias").insert(novas.map((nome) => ({ nome }))).select("id, nome")
        if (error) throw error
        data.forEach((c) => mapaCat.set(c.nome.toLowerCase(), c.id))
      }
      const porSku = new Map((produtos.data ?? []).filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]))

      for (const { n, dados: d } of validas) {
        const campos = {
          nome: d!.nome,
          preco: d!.preco,
          sku: d!.sku ?? null,
          descricao: d!.descricao ?? null,
          categoria_id: d!.categoria ? (mapaCat.get(d!.categoria.toLowerCase()) ?? null) : null,
          estoque_minimo: d!.estoque_minimo ?? 0,
          ativo: d!.ativo,
        }
        const existente = d!.sku ? porSku.get(d!.sku.toLowerCase()) : undefined
        if (existente) {
          const { error } = await supabase.from("produtos").update(campos).eq("id", existente.id)
          if (error) falhas.push(`Linha ${n}: ${mensagemErro(error)}`)
          else atualizados++
          continue
        }
        const { data, error } = await supabase.from("produtos").insert(campos).select("id").single()
        if (error) {
          falhas.push(`Linha ${n}: ${mensagemErro(error)}`)
          continue
        }
        criados++
        if (d!.estoque) {
          const r = await supabase
            .from("movimentacoes_estoque")
            .insert({ produto_id: data.id, tipo: "entrada", quantidade: d!.estoque, motivo: "Importação CSV" })
          if (r.error) falhas.push(`Linha ${n} (estoque): ${mensagemErro(r.error)}`)
        }
      }
      toast.success(`Importação concluída: ${criados} criado(s), ${atualizados} atualizado(s)`, {
        description: falhas.length ? `${falhas.length} falha(s): ${falhas.slice(0, 3).join(" | ")}` : undefined,
      })
      qc.invalidateQueries({ queryKey: ["produtos"] })
      qc.invalidateQueries({ queryKey: ["categorias"] })
      if (!falhas.length) {
        setAberto(false)
        setLinhas([])
      }
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setImportando(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <FileUp /> Importar CSV
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar produtos por CSV</DialogTitle>
            <DialogDescription>
              Colunas: <code>nome; preco; sku; descricao; categoria; estoque_minimo; estoque; ativo</code>. Produtos com SKU já
              cadastrado são atualizados (o estoque desses não muda — use a tela de Estoque).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label="Arquivo CSV"
              className="max-w-xs"
              onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])}
            />
            <Button
              variant="link"
              onClick={() =>
                baixarCsv("modelo_produtos", [
                  {
                    nome: "Ração Premium 15kg",
                    preco: "219,90",
                    sku: "RAC-15",
                    descricao: "Ração para cães adultos",
                    categoria: "Rações",
                    estoque_minimo: 3,
                    estoque: 10,
                    ativo: "sim",
                  },
                ])
              }
            >
              Baixar modelo
            </Button>
          </div>
          {linhas.length > 0 && (
            <>
              <p className="text-sm">
                {validas.length} linha(s) válida(s){" "}
                {linhas.length - validas.length > 0 && (
                  <span className="text-destructive">· {linhas.length - validas.length} com erro (serão ignoradas)</span>
                )}
              </p>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Linha</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((l) => (
                      <TableRow key={l.n}>
                        <TableCell>{l.n}</TableCell>
                        <TableCell>{l.dados?.nome ?? "—"}</TableCell>
                        <TableCell>{l.dados?.sku ?? "—"}</TableCell>
                        <TableCell className="text-right">{l.dados ? formatarMoeda(l.dados.preco) : "—"}</TableCell>
                        <TableCell className={l.erro ? "text-destructive text-xs" : "text-xs text-emerald-700"}>
                          {l.erro ??
                            (l.dados?.sku && produtos.data?.some((p) => p.sku?.toLowerCase() === l.dados!.sku!.toLowerCase())
                              ? "Atualizar"
                              : "Criar")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={!validas.length || importando} onClick={importar}>
              {importando && <Spinner />} Importar {validas.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
