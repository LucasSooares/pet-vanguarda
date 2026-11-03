"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Pencil, Plus, Scissors } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { EstadoQuery, PageHeader, Spinner, Vazio } from "@/components/estados"
import { useServicos } from "@/features/agendamentos/api"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro } from "@/lib/erros"
import { formatarMoeda } from "@/lib/format"
import { PORTES } from "@/lib/status"
import { cn } from "@/lib/utils"

type ServicoComPrecos = NonNullable<ReturnType<typeof useServicos>["data"]>[number]

const preco = z.coerce.number<number>({ message: "Preço inválido" }).min(0, "Preço inválido").max(100000)
const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  descricao: z.string().trim().max(500).optional(),
  duracao_min: z.coerce.number<number>().int().min(5, "Mínimo 5 min").max(600),
  ativo: z.boolean(),
  Pequeno: preco,
  Médio: preco,
  Grande: preco,
})
type Dados = z.infer<typeof schema>

function FormServico({ servico, aberto, onFechar }: { servico: ServicoComPrecos | null; aberto: boolean; onFechar: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<Dados>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!aberto) return
    const p = (porte: string) => Number(servico?.precos.find((x) => x.porte === porte)?.preco ?? 0)
    reset({
      nome: servico?.nome ?? "",
      descricao: servico?.descricao ?? "",
      duracao_min: servico?.duracao_min ?? 60,
      ativo: servico?.ativo ?? true,
      Pequeno: p("Pequeno"),
      Médio: p("Médio"),
      Grande: p("Grande"),
    })
  }, [aberto, servico, reset])

  const salvar = useMutation({
    mutationFn: async (d: Dados) => {
      const supabase = getSupabase()
      const campos = { nome: d.nome, descricao: d.descricao || null, duracao_min: d.duracao_min, ativo: d.ativo }
      let id = servico?.id
      if (id) {
        const { error } = await supabase.from("servicos").update(campos).eq("id", id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from("servicos").insert(campos).select("id").single()
        if (error) throw error
        id = data.id
      }
      // Só grava preços que mudaram (cada mudança gera auditoria)
      const mudou = PORTES.filter((porte) => Number(servico?.precos.find((x) => x.porte === porte)?.preco ?? -1) !== d[porte])
      if (mudou.length) {
        const { error } = await supabase
          .from("servicos_precos")
          .upsert(mudou.map((porte) => ({ servico_id: id!, porte, preco: d[porte] })), { onConflict: "servico_id,porte" })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(servico ? "Serviço atualizado" : "Serviço criado")
      qc.invalidateQueries({ queryKey: ["servicos"] })
      onFechar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const erro = (c: keyof Dados) =>
    formState.errors[c] && <p className="text-destructive text-xs">{formState.errors[c]?.message as string}</p>

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{servico ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        </DialogHeader>
        <form id="form-servico" noValidate className="space-y-4" onSubmit={handleSubmit((d) => salvar.mutate(d))}>
          <div className="space-y-2">
            <Label htmlFor="s-nome">Nome</Label>
            <Input id="s-nome" {...register("nome")} />
            {erro("nome")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-desc">Descrição</Label>
            <Textarea id="s-desc" {...register("descricao")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-dur">Duração (min)</Label>
            <Input id="s-dur" type="number" min={5} {...register("duracao_min")} />
            {erro("duracao_min")}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Preço por porte (R$)</legend>
            <div className="grid grid-cols-3 gap-3">
              {PORTES.map((p) => (
                <div key={p} className="space-y-1">
                  <Label htmlFor={`s-${p}`} className="text-muted-foreground text-xs">
                    {p}
                  </Label>
                  <Input id={`s-${p}`} type="number" step="0.01" min={0} {...register(p)} />
                  {erro(p)}
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-3">
            <Switch id="s-ativo" checked={watch("ativo")} onCheckedChange={(v) => setValue("ativo", v)} />
            <Label htmlFor="s-ativo">Ativo (aparece no app)</Label>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-servico" disabled={salvar.isPending}>
            {salvar.isPending && <Spinner />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ServicosPage() {
  const servicos = useServicos()
  const qc = useQueryClient()
  const [editando, setEditando] = useState<ServicoComPrecos | null>(null)
  const [aberto, setAberto] = useState(false)
  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await getSupabase().from("servicos").update({ ativo }).eq("id", id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["servicos"] }),
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const abrir = (s: ServicoComPrecos | null) => {
    setEditando(s)
    setAberto(true)
  }

  return (
    <>
      <PageHeader
        titulo="Serviços e preços"
        descricao="Preço por porte do pet. Mudanças de preço ficam na auditoria."
        acoes={
          <Button onClick={() => abrir(null)}>
            <Plus /> Novo serviço
          </Button>
        }
      />
      <EstadoQuery
        query={servicos}
        vazio={(d) => d.length === 0}
        vazioComponente={
          <div className="bg-card rounded-2xl border">
            <Vazio
              icone={Scissors}
              titulo="Nenhum serviço cadastrado"
              descricao="Cadastre Banho, Tosa, Consulta… com preço por porte."
              acao={
                <Button onClick={() => abrir(null)}>
                  <Plus /> Novo serviço
                </Button>
              }
            />
          </div>
        }
      >
        {(lista) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((s) => (
              <article key={s.id} className={cn("bg-card shadow-soft rounded-2xl border p-5", !s.ativo && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{s.nome}</h2>
                    <p className="text-muted-foreground text-xs">{s.duracao_min} min</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch aria-label={`${s.nome} ativo`} checked={s.ativo} onCheckedChange={(v) => alternar.mutate({ id: s.id, ativo: v })} />
                    <Button size="icon" variant="ghost" aria-label={`Editar ${s.nome}`} onClick={() => abrir(s)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                </div>
                {s.descricao && <p className="text-muted-foreground mt-2 text-sm">{s.descricao}</p>}
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {PORTES.map((p) => {
                    const v = s.precos.find((x) => x.porte === p)
                    return (
                      <div key={p} className="bg-muted rounded-xl p-2">
                        <dt className="text-muted-foreground text-xs">{p}</dt>
                        <dd className="font-semibold tabular-nums">{v ? formatarMoeda(v.preco) : "—"}</dd>
                      </div>
                    )
                  })}
                </dl>
              </article>
            ))}
          </div>
        )}
      </EstadoQuery>
      <FormServico servico={editando} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  )
}
