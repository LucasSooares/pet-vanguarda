"use client"

import { useState } from "react"
import { z } from "zod"
import { Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/estados"
import { useCategorias, useSalvarCategoria } from "./api"

const nomeSchema = z.string().trim().min(2, "Mínimo 2 caracteres").max(60)

export function GerenciarCategorias() {
  const [aberto, setAberto] = useState(false)
  const [nova, setNova] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const categorias = useCategorias()
  const salvar = useSalvarCategoria()

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
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className={c.ativo ? "" : "text-muted-foreground line-through"}>{c.nome}</span>
                <Switch
                  aria-label={`Categoria ${c.nome} ativa`}
                  checked={c.ativo}
                  onCheckedChange={(v) => salvar.mutate({ ...c, ativo: v })}
                />
              </li>
            ))}
            {categorias.data?.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center text-sm">Nenhuma categoria</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
