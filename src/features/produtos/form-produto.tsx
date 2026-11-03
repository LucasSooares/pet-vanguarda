"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ImagePlus } from "lucide-react"
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
  estoque_minimo: z.coerce.number<number>().int("Número inteiro").min(0).max(100000),
  estoque_inicial: z.coerce.number<number>().int("Número inteiro").min(0).max(100000).optional(),
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
  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<Dados>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!aberto) return
    reset({
      nome: produto?.nome ?? "",
      descricao: produto?.descricao ?? "",
      preco: produto?.preco ?? 0,
      sku: produto?.sku ?? "",
      categoria_id: produto?.categoria_id ?? SEM,
      estoque_minimo: produto?.estoque_minimo ?? 0,
      estoque_inicial: 0,
      ativo: produto?.ativo ?? true,
    })
    setArquivo(null)
    setPreview(produto?.imagem_url ?? null)
  }, [aberto, produto, reset])

  const enviar = handleSubmit(async (d) => {
    try {
      setEnviando(true)
      const imagem_url = arquivo ? await enviarImagem(arquivo) : (produto?.imagem_url ?? null)
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
      onFechar()
    } catch (e) {
      if (arquivo) toast.error(mensagemErro(e))
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
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register("sku")} />
              {erro("sku")}
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
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="estoque_minimo">Estoque mínimo</Label>
              <Input id="estoque_minimo" type="number" min="0" {...register("estoque_minimo")} />
              {erro("estoque_minimo")}
            </div>
            {!produto && (
              <div className="space-y-2">
                <Label htmlFor="estoque_inicial">Estoque inicial</Label>
                <Input id="estoque_inicial" type="number" min="0" {...register("estoque_inicial")} />
                {erro("estoque_inicial")}
              </div>
            )}
          </div>
          {produto && (
            <p className="text-muted-foreground text-xs">
              Saldo atual: <strong>{produto.estoque_atual}</strong>. Para alterar, use a tela de Estoque (entrada, saída ou ajuste).
            </p>
          )}
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
