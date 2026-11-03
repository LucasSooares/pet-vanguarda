"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/estados"
import type { Produto, TipoMovimentacao } from "@/lib/database.types"
import type { z } from "zod"
import { useMovimentar } from "./api"
import { schemaMovimentacao } from "./regras"

export const ROTULO_TIPO: Record<TipoMovimentacao, string> = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" }

export function Movimentar({ produto, tipo, onFechar }: { produto: Produto | null; tipo: TipoMovimentacao; onFechar: () => void }) {
  const movimentar = useMovimentar()
  const schema = schemaMovimentacao(produto?.estoque_atual ?? 0)
  type Dados = z.infer<typeof schema>
  const { register, handleSubmit, reset, watch, formState } = useForm<Dados>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (produto) reset({ tipo, quantidade: tipo === "ajuste" ? produto.estoque_atual : 1, motivo: "" })
  }, [produto, tipo, reset])

  if (!produto) return null
  const qtd = Number(watch("quantidade") ?? 0)
  const novo = tipo === "entrada" ? produto.estoque_atual + qtd : tipo === "saida" ? produto.estoque_atual - qtd : qtd

  return (
    <Dialog open={!!produto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {ROTULO_TIPO[tipo]} de estoque — {produto.nome}
          </DialogTitle>
          <DialogDescription>
            Saldo atual: <strong>{produto.estoque_atual}</strong>. Toda movimentação fica no histórico e na auditoria.
          </DialogDescription>
        </DialogHeader>
        <form
          id="form-mov"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (d) => {
            await movimentar.mutateAsync({ produto_id: produto.id, ...d })
            onFechar()
          })}
        >
          <input type="hidden" {...register("tipo")} />
          <div className="space-y-2">
            <Label htmlFor="mov-qtd">{tipo === "ajuste" ? "Novo saldo (contagem física)" : "Quantidade"}</Label>
            <Input id="mov-qtd" type="number" min={0} {...register("quantidade")} autoFocus />
            {formState.errors.quantidade && <p className="text-destructive text-xs">{formState.errors.quantidade.message}</p>}
            {Number.isFinite(novo) && novo >= 0 && (
              <p className="text-muted-foreground text-xs">
                Saldo após: <strong>{novo}</strong>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mov-motivo">Motivo</Label>
            <Input
              id="mov-motivo"
              placeholder={tipo === "entrada" ? "Ex.: Compra NF 1234" : tipo === "saida" ? "Ex.: Avaria, uso interno" : "Ex.: Inventário mensal"}
              {...register("motivo")}
            />
            {formState.errors.motivo && <p className="text-destructive text-xs">{formState.errors.motivo.message}</p>}
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-mov" disabled={movimentar.isPending}>
            {movimentar.isPending && <Spinner />} Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
