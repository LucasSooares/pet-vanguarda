"use client"

import { useState } from "react"
import { z } from "zod"
import { Check, Pencil, Tags, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Confirmar } from "@/components/confirmar"
import { Spinner } from "@/components/estados"
import type { Categoria } from "@/lib/database.types"
import { useCategorias, useExcluirCategoria, useProdutos, useSalvarCategoria } from "./api"

const nomeSchema = z.string().trim().min(2, "Mínimo 2 caracteres").max(60)

function LinhaCategoria({ categoria: c, qtdProdutos }: { categoria: Categoria; qtdProdutos: number }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(c.nome)
  const [erro, setErro] = useState<string | null>(null)
  const salvar = useSalvarCategoria()
  const excluir = useExcluirCategoria()

  const renomear = async () => {
    const r = nomeSchema.safeParse(nome)
    if (!r.success) return setErro(r.error.issues[0].message)
    setErro(null)
    if (r.data !== c.nome) await salvar.mutateAsync({ ...c, nome: r.data })
    setEditando(false)
  }

  if (editando) {
    return (
      <li className="space-y-1 px-3 py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            renomear()
          }}
        >
          <Input aria-label="Nome da categoria" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <Button type="submit" size="icon" aria-label="Salvar nome" disabled={salvar.isPending}>
            {salvar.isPending ? <Spinner /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cancelar edição"
            onClick={() => {
              setNome(c.nome)
              setErro(null)
              setEditando(false)
            }}
          >
            <X />
          </Button>
        </form>
        {erro && <p className="text-destructive text-xs">{erro}</p>}
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <span className="min-w-0">
        <span className={c.ativo ? "" : "text-muted-foreground line-through"}>{c.nome}</span>
        <span className="text-muted-foreground block text-xs">
          {qtdProdutos} produto(s){!c.ativo && " · oculta no app"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Switch
          aria-label={`Categoria ${c.nome} ativa`}
          title={c.ativo ? "Ativa (aparece no app)" : "Inativa (oculta no app)"}
          checked={c.ativo}
          onCheckedChange={(v) => salvar.mutate({ ...c, ativo: v })}
        />
        <Button size="icon" variant="ghost" aria-label={`Renomear ${c.nome}`} onClick={() => setEditando(true)}>
          <Pencil />
        </Button>
        <Confirmar
          gatilho={
            <Button size="icon" variant="ghost" aria-label={`Excluir ${c.nome}`} className="text-destructive">
              <Trash2 />
            </Button>
          }
          titulo={`Excluir a categoria “${c.nome}”?`}
          descricao={
            qtdProdutos > 0
              ? `${qtdProdutos} produto(s) dessa categoria ficarão "Sem categoria". Os produtos não são apagados.`
              : "Nenhum produto usa essa categoria."
          }
          textoConfirmar="Excluir"
          onConfirmar={() => excluir.mutateAsync(c.id)}
        />
      </span>
    </li>
  )
}

export function GerenciarCategorias() {
  const [aberto, setAberto] = useState(false)
  const [nova, setNova] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const categorias = useCategorias()
  const produtos = useProdutos()
  const salvar = useSalvarCategoria()
  const contagem = new Map<string, number>()
  produtos.data?.forEach((p) => p.categoria_id && contagem.set(p.categoria_id, (contagem.get(p.categoria_id) ?? 0) + 1))

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Tags /> Categorias
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorias</DialogTitle>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const r = nomeSchema.safeParse(nova)
              if (!r.success) return setErro(r.error.issues[0].message)
              setErro(null)
              await salvar.mutateAsync({ nome: r.data, ordem: (categorias.data?.length ?? 0) + 1 })
              setNova("")
            }}
          >
            <Input aria-label="Nova categoria" placeholder="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} />
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Spinner />} Adicionar
            </Button>
          </form>
          {erro && <p className="text-destructive text-xs">{erro}</p>}
          <ul className="divide-y rounded-xl border">
            {categorias.data?.map((c) => (
              <LinhaCategoria key={c.id} categoria={c} qtdProdutos={contagem.get(c.id) ?? 0} />
            ))}
            {categorias.data?.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center text-sm">Nenhuma categoria</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
