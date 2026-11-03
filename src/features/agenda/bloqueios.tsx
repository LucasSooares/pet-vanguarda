"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Ban, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Confirmar } from "@/components/confirmar"
import { Spinner } from "@/components/estados"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro } from "@/lib/erros"
import { formatarData, normalizarHora } from "@/lib/format"
import type { BloqueioAgenda } from "@/lib/database.types"

const schema = z
  .object({
    tipo: z.enum(["bloqueio", "liberacao"]),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    diaInteiro: z.boolean(),
    hora_inicio: z.string().optional(),
    hora_fim: z.string().optional(),
    capacidade: z.coerce.number<number>().int().min(1).max(50).optional(),
    motivo: z.string().trim().min(2, "Informe o motivo").max(200),
  })
  .refine((d) => (d.tipo === "bloqueio" && d.diaInteiro) || (d.hora_inicio && d.hora_fim && d.hora_fim > d.hora_inicio), {
    path: ["hora_fim"],
    message: "Informe início e fim (fim depois do início)",
  })
type Dados = z.infer<typeof schema>

function useSalvarBloqueio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: Dados) => {
      const dia = d.tipo === "bloqueio" && d.diaInteiro
      const { error } = await getSupabase()
        .from("bloqueios_agenda")
        .insert({
          tipo: d.tipo,
          data: d.data,
          hora_inicio: dia ? null : d.hora_inicio,
          hora_fim: dia ? null : d.hora_fim,
          capacidade: d.tipo === "liberacao" ? (d.capacidade ?? null) : null,
          motivo: d.motivo,
        })
      if (error) throw error
    },
    onSuccess: (_, d) => {
      toast.success(d.tipo === "bloqueio" ? "Horário bloqueado" : "Horário liberado")
      qc.invalidateQueries({ queryKey: ["bloqueios"] })
      qc.invalidateQueries({ queryKey: ["horarios-livres"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function useExcluirBloqueio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("bloqueios_agenda").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Removido")
      qc.invalidateQueries({ queryKey: ["bloqueios"] })
      qc.invalidateQueries({ queryKey: ["horarios-livres"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

export function NovoBloqueio({ dataInicial }: { dataInicial: string }) {
  const [aberto, setAberto] = useState(false)
  const salvar = useSalvarBloqueio()
  const { register, handleSubmit, watch, setValue, formState, reset } = useForm<Dados>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: "bloqueio", data: dataInicial, diaInteiro: true, motivo: "" },
  })
  const tipo = watch("tipo")
  const diaInteiro = watch("diaInteiro")

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          reset({ tipo: "bloqueio", data: dataInicial, diaInteiro: true, motivo: "" })
          setAberto(true)
        }}
      >
        <Ban /> Bloquear / liberar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear ou liberar horários</DialogTitle>
            <DialogDescription>
              Bloqueie folgas e feriados, ou libere horários extras fora do expediente normal.
            </DialogDescription>
          </DialogHeader>
          <form
            id="form-bloqueio"
            className="space-y-4"
            noValidate
            onSubmit={handleSubmit(async (d) => {
              await salvar.mutateAsync(d)
              setAberto(false)
            })}
          >
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
              {(["bloqueio", "liberacao"] as const).map((t) => (
                <Button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={tipo === t}
                  variant={tipo === t ? "default" : "outline"}
                  onClick={() => setValue("tipo", t)}
                >
                  {t === "bloqueio" ? "Bloquear" : "Liberar extra"}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="bl-data">Data</Label>
              <Input id="bl-data" type="date" {...register("data")} />
            </div>
            {tipo === "bloqueio" && (
              <div className="flex items-center gap-3">
                <Switch id="bl-dia" checked={diaInteiro} onCheckedChange={(v) => setValue("diaInteiro", v)} />
                <Label htmlFor="bl-dia">Dia inteiro</Label>
              </div>
            )}
            {(tipo === "liberacao" || !diaInteiro) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bl-ini">Início</Label>
                  <Input id="bl-ini" type="time" {...register("hora_inicio")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bl-fim">Fim</Label>
                  <Input id="bl-fim" type="time" {...register("hora_fim")} />
                </div>
              </div>
            )}
            {formState.errors.hora_fim && <p className="text-destructive text-xs">{formState.errors.hora_fim.message}</p>}
            {tipo === "liberacao" && (
              <div className="space-y-2">
                <Label htmlFor="bl-cap">Vagas por horário (opcional)</Label>
                <Input id="bl-cap" type="number" min={1} max={50} {...register("capacidade")} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bl-motivo">Motivo</Label>
              <Input id="bl-motivo" placeholder="Ex.: Feriado, folga da equipe, mutirão…" {...register("motivo")} />
              {formState.errors.motivo && <p className="text-destructive text-xs">{formState.errors.motivo.message}</p>}
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-bloqueio" disabled={salvar.isPending}>
              {salvar.isPending && <Spinner />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function FaixaBloqueio({ b }: { b: BloqueioAgenda }) {
  const excluir = useExcluirBloqueio()
  const horario = b.hora_inicio ? `${normalizarHora(b.hora_inicio)}–${normalizarHora(b.hora_fim)}` : "Dia inteiro"
  return (
    <div
      className={
        b.tipo === "bloqueio"
          ? "flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          : "flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
      }
    >
      <span>
        <strong>{b.tipo === "bloqueio" ? "Bloqueado" : "Liberado"}</strong> · {formatarData(b.data, "dd/MM")} · {horario} — {b.motivo}
      </span>
      <Confirmar
        gatilho={
          <Button size="icon" variant="ghost" className="size-7" aria-label="Remover bloqueio">
            <Trash2 className="size-4" />
          </Button>
        }
        titulo="Remover este bloqueio/liberação?"
        textoConfirmar="Remover"
        onConfirmar={() => excluir.mutateAsync(b.id)}
      />
    </div>
  )
}
