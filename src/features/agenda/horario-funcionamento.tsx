"use client"

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Clock } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/estados"
import { useHorarios } from "@/features/agendamentos/api"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro } from "@/lib/erros"
import { normalizarHora } from "@/lib/format"
import type { HorarioFuncionamento } from "@/lib/database.types"

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

const hora = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida")
const linhaSchema = z
  .object({
    dia_semana: z.number().int().min(0).max(6),
    ativo: z.boolean(),
    abre: hora,
    fecha: hora,
    intervalo_min: z.number().int().min(5, "Mín. 5 min").max(240),
    capacidade_por_slot: z.number().int().min(0).max(50),
    pausa_inicio: hora.nullable(),
    pausa_fim: hora.nullable(),
  })
  .refine((l) => l.fecha > l.abre, { message: "Fechamento deve ser depois da abertura" })
  .refine((l) => (l.pausa_inicio === null) === (l.pausa_fim === null), { message: "Informe início e fim da pausa" })
  .refine((l) => !l.pausa_inicio || !l.pausa_fim || l.pausa_fim > l.pausa_inicio, { message: "Pausa inválida" })

type Linha = z.infer<typeof linhaSchema>

const padrao = (dia: number): Linha => ({
  dia_semana: dia,
  ativo: dia !== 0,
  abre: "08:00",
  fecha: dia === 6 ? "14:00" : "18:00",
  intervalo_min: 30,
  capacidade_por_slot: 1,
  pausa_inicio: null,
  pausa_fim: null,
})

const deBanco = (h: HorarioFuncionamento): Linha => ({
  ...h,
  abre: normalizarHora(h.abre),
  fecha: normalizarHora(h.fecha),
  pausa_inicio: h.pausa_inicio ? normalizarHora(h.pausa_inicio) : null,
  pausa_fim: h.pausa_fim ? normalizarHora(h.pausa_fim) : null,
})

export function HorarioFuncionamentoDialog() {
  const [aberto, setAberto] = useState(false)
  const horarios = useHorarios()
  const qc = useQueryClient()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [erros, setErros] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!aberto) return
    setLinhas(
      Array.from({ length: 7 }, (_, d) => {
        const h = horarios.data?.find((x) => x.dia_semana === d)
        return h ? deBanco(h) : padrao(d)
      })
    )
    setErros({})
  }, [aberto, horarios.data])

  const salvar = useMutation({
    mutationFn: async (dados: Linha[]) => {
      const { error } = await getSupabase().from("horarios_funcionamento").upsert(dados, { onConflict: "dia_semana" })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Horário de funcionamento salvo")
      qc.invalidateQueries({ queryKey: ["horarios"] })
      qc.invalidateQueries({ queryKey: ["horarios-livres"] })
      setAberto(false)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const alterar = (dia: number, campos: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l) => (l.dia_semana === dia ? { ...l, ...campos } : l)))

  const enviar = () => {
    const novosErros: Record<number, string> = {}
    linhas.forEach((l) => {
      const r = linhaSchema.safeParse(l)
      if (!r.success) novosErros[l.dia_semana] = r.error.issues[0].message
    })
    setErros(novosErros)
    if (Object.keys(novosErros).length === 0) salvar.mutate(linhas)
  }

  const nenhumConfigurado = horarios.data?.length === 0

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Clock /> Horário de funcionamento
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Horário de funcionamento e capacidade</DialogTitle>
            <DialogDescription>
              Define os horários oferecidos no app e quantos atendimentos cabem em cada horário (anti-overbooking).
              {nenhumConfigurado && (
                <strong className="mt-2 block text-amber-800">
                  Ainda não configurado: hoje o app aceita qualquer horário. Ao salvar, agendamentos fora destes horários
                  passam a ser recusados.
                </strong>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {linhas.map((l) => (
              <fieldset key={l.dia_semana} className="bg-muted/40 rounded-xl border p-3">
                <legend className="sr-only">{DIAS_SEMANA[l.dia_semana]}</legend>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex w-32 items-center gap-2 text-sm font-medium">
                    <Switch checked={l.ativo} onCheckedChange={(v) => alterar(l.dia_semana, { ativo: v })} />
                    {DIAS_SEMANA[l.dia_semana]}
                  </label>
                  {l.ativo && (
                    <>
                      <Campo rotulo="Abre">
                        <Input type="time" value={l.abre} onChange={(e) => alterar(l.dia_semana, { abre: e.target.value })} />
                      </Campo>
                      <Campo rotulo="Fecha">
                        <Input type="time" value={l.fecha} onChange={(e) => alterar(l.dia_semana, { fecha: e.target.value })} />
                      </Campo>
                      <Campo rotulo="Intervalo (min)">
                        <Input
                          type="number"
                          min={5}
                          className="w-20"
                          value={l.intervalo_min}
                          onChange={(e) => alterar(l.dia_semana, { intervalo_min: Number(e.target.value) })}
                        />
                      </Campo>
                      <Campo rotulo="Vagas/horário">
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={l.capacidade_por_slot}
                          onChange={(e) => alterar(l.dia_semana, { capacidade_por_slot: Number(e.target.value) })}
                        />
                      </Campo>
                      <Campo rotulo="Pausa (início–fim)">
                        <div className="flex gap-1">
                          <Input
                            type="time"
                            aria-label="Início da pausa"
                            value={l.pausa_inicio ?? ""}
                            onChange={(e) => alterar(l.dia_semana, { pausa_inicio: e.target.value || null })}
                          />
                          <Input
                            type="time"
                            aria-label="Fim da pausa"
                            value={l.pausa_fim ?? ""}
                            onChange={(e) => alterar(l.dia_semana, { pausa_fim: e.target.value || null })}
                          />
                        </div>
                      </Campo>
                    </>
                  )}
                </div>
                {erros[l.dia_semana] && <p className="text-destructive mt-2 text-xs">{erros[l.dia_semana]}</p>}
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={salvar.isPending || horarios.isLoading}>
              {salvar.isPending && <Spinner />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground block">{rotulo}</span>
      {children}
    </label>
  )
}
