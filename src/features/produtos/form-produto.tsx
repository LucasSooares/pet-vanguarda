"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/estados"
import { mensagemErro } from "@/lib/erros"
import { getSupabase } from "@/lib/supabase/client"
import type { Produto } from "@/lib/database.types"
import { enviarImagem, useCategorias, useSalvarProduto } from "./api"

const SEM = "__sem"
const TAMANHO_MAX = 3 * 1024 * 1024

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  descricao: z.string().trim().max(1000).optional(),
  preco: z.coerce.number<number>().min(0, "Preço inválido").max(100000),
  sku: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9._-]*$/, "Use letras, números, ponto, hífen ou _")
    .optional(),
  categoria_id: z.string().optional(),
  estoque_minimo: z.coerce
    .number<number>({ message: "Informe a quantidade" })
    .int("Use um número inteiro (sem vírgula)")
    .min(0, "Não pode ser negativo")
    .max(100000),
  estoque_inicial: z.coerce
    .number<number>({ message: "Informe a quantidade" })
    .int("Use um número inteiro (sem vírgula)")
    .min(0, "Não pode ser negativo")
    .max(100000)
    .optional(),
  ativo: z.boolean(),
})
type Dados = z.infer<typeof schema>

export function FormProduto({
  produto,
  aberto,
  onFechar,
}: {
  produto: Produto | null
  aberto: boolean
  onFechar: () => void
}) {
  const categorias = useCategorias()
  const salvar = useSalvarProduto()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState("")
  const [criandoCategoria, setCriandoCategoria] = useState(false)
  const qc = useQueryClient()
  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<Dados>({ resolver: zodResolver(schema) })

  async function criarCategoria() {
    const nome = novaCategoria.trim()
    if (nome.length < 2) return toast.error("Nome da categoria: mínimo 2 caracteres")
    setCriandoCategoria(true)
    try {
      const { data, error } = await getSupabase().from("categorias").insert({ nome }).select("id").single()
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ["categorias"] })
      setValue("categoria_id", data.id)
      setNovaCategoria("")
      toast.success("Categoria criada")
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setCriandoCategoria(false)
    }
  }

  useEffect(() => {
    if (!aberto) return
    reset({
      nome: produto?.nome ?? "",
      descricao: produto?.descricao ?? "",
      preco: produto?.preco ?? 0,
      sku: produto?.sku ?? "",
      categoria_id: produto?.categoria_id ?? SEM,
      estoque_minimo: produto?.estoque_minimo ?? 0,
      estoque_inicial: produto?.estoque_atual ?? 0,
      ativo: produto?.ativo ?? true,
    })
    setArquivo(null)
    setPreview(produto?.imagem_url ?? null)
  }, [aberto, produto, reset])

  const enviar = handleSubmit(async (d) => {
    let etapa: "imagem" | "salvar" | "ajuste" = "imagem"
    try {
      setEnviando(true)
      const imagem_url = arquivo ? await enviarImagem(arquivo) : (produto?.imagem_url ?? null)
      etapa = "salvar"
      await salvar.mutateAsync({
        id: produto?.id,
        dados: {
          nome: d.nome,
          descricao: d.descricao || null,
          preco: d.preco,
          sku: d.sku || null,
          categoria_id: d.categoria_id && d.categoria_id !== SEM ? d.categoria_id : null,
          estoque_minimo: d.estoque_minimo,
          ativo: d.ativo,
          imagem_url,
          estoque_inicial: produto ? undefined : d.estoque_inicial,
        },
      })
      // Saldo alterado na edição vira um "ajuste" (fica no histórico e na auditoria)
      if (produto && d.estoque_inicial != null && d.estoque_inicial !== produto.estoque_atual) {
        etapa = "ajuste"
        const { error } = await getSupabase().from("movimentacoes_estoque").insert({
          produto_id: produto.id,
          tipo: "ajuste",
          quantidade: d.estoque_inicial,
          motivo: "Ajuste pelo cadastro do produto",
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ["produtos"] })
        qc.invalidateQueries({ queryKey: ["movimentacoes"] })
      }
      onFechar()
    } catch (e) {
      // Erros do salvar já viram toast no hook; aqui ficam os do upload e do ajuste
      if (etapa !== "salvar") toast.error(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  })

  const erro = (c: keyof Dados) =>
    formState.errors[c] && <p className="text-destructive text-xs">{formState.errors[c]?.message as string}</p>

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{produto ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <form id="form-produto" onSubmit={enviar} className="space-y-4" noValidate>
          <div className="flex items-center gap-4">
            <label
              htmlFor="imagem"
              className="bg-muted hover:bg-accent grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Pré-visualização" className="size-full object-cover" />
              ) : (
                <ImagePlus className="text-muted-foreground size-6" aria-hidden />
              )}
            </label>
            <div className="space-y-1 text-sm">
              <Label htmlFor="imagem">Imagem</Label>
              <Input
                id="imagem"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > TAMANHO_MAX) return toast.error("Imagem maior que 3 MB")
                  setArquivo(f)
                  setPreview(URL.createObjectURL(f))
                }}
              />
              <p className="text-muted-foreground text-xs">PNG, JPG ou WEBP até 3 MB.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" {...register("nome")} />
            {erro("nome")}
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" {...register("descricao")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preco">Preço (R$)</Label>
              <Input id="preco" type="number" step="0.01" min="0" {...register("preco")} />
              {erro("preco")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">Código do produto (opcional)</Label>
              <Input id="sku" placeholder="Ex.: RAC-PREMIER-20KG" {...register("sku")} />              {erro("sku")}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoria</Label>
            <Select value={watch("categoria_id") ?? SEM} onValueChange={(v) => setValue("categoria_id", v)}>
              <SelectTrigger id="categoria" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem categoria</SelectItem>
                {categorias.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categorias.data?.length === 0 && (
              <p className="text-muted-foreground text-xs">Nenhuma categoria cadastrada ainda. Crie uma abaixo.</p>
            )}
            <div className="flex gap-2">
              <Input
                aria-label="Nova categoria"
                placeholder="Nova categoria (ex.: Rações)"
                value={novaCategoria}
                onChange={(e) => setNovaCategoria(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    criarCategoria()
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={criarCategoria} disabled={criandoCategoria}>
                {criandoCategoria ? <Spinner /> : <Plus />} Criar
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estoque_inicial">{produto ? "Quantidade em estoque" : "Quantidade inicial em estoque"}</Label>
              <Input id="estoque_inicial" type="number" min="0" step="1" inputMode="numeric" {...register("estoque_inicial")} />
              <p className="text-muted-foreground text-xs">Quantas unidades você tem agora.</p>
              {erro("estoque_inicial")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="estoque_minimo">Avisar quando chegar a</Label>
              <Input id="estoque_minimo" type="number" min="0" step="1" inputMode="numeric" {...register("estoque_minimo")} />
              <p className="text-muted-foreground text-xs">Estoque mínimo: abaixo disso aparece alerta.</p>
              {erro("estoque_minimo")}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="ativo" checked={watch("ativo")} onCheckedChange={(v) => setValue("ativo", v)} />
            <Label htmlFor="ativo">Ativo (visível no app)</Label>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" form="form-produto" disabled={enviando}>
            {enviando && <Spinner />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
