"use client"

import { useMemo, useState } from "react"
import { Package, Pencil, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EstadoQuery, PageHeader, Vazio } from "@/components/estados"
import { useAlternarProduto, useCategorias, useProdutos } from "@/features/produtos/api"
import { GerenciarCategorias } from "@/features/produtos/categorias"
import { FormProduto } from "@/features/produtos/form-produto"
import { ImportarCsv } from "@/features/produtos/importar-csv"
import { formatarMoeda } from "@/lib/format"
import type { Produto } from "@/lib/database.types"
import { cn } from "@/lib/utils"

const TODAS = "__todas"

export default function ProdutosPage() {
  const produtos = useProdutos()
  const categorias = useCategorias()
  const alternar = useAlternarProduto()
  const [busca, setBusca] = useState("")
  const [categoria, setCategoria] = useState(TODAS)
  const [editando, setEditando] = useState<Produto | null>(null)
  const [formAberto, setFormAberto] = useState(false)

  const nomeCategoria = useMemo(() => new Map(categorias.data?.map((c) => [c.id, c.nome])), [categorias.data])
  const filtrar = (lista: Produto[]) => {
    const t = busca.trim().toLowerCase()
    return lista.filter(
      (p) =>
        (categoria === TODAS || p.categoria_id === categoria) &&
        (!t || p.nome.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t))
    )
  }

  const abrir = (p: Produto | null) => {
    setEditando(p)
    setFormAberto(true)
  }

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Catálogo exibido no app. Somente administradores podem editar."
        acoes={
          <>
            <GerenciarCategorias />
            <ImportarCsv />
            <Button onClick={() => abrir(null)}>
              <Plus /> Novo produto
            </Button>
          </>
        }
      />

      <div className="bg-card shadow-soft mb-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input aria-label="Buscar produto" placeholder="Nome ou SKU…" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="sm:w-56" aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas as categorias</SelectItem>
            {categorias.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
        <EstadoQuery
          query={produtos}
          vazio={(d) => filtrar(d).length === 0}
          vazioComponente={
            <Vazio
              icone={Package}
              titulo={produtos.data?.length ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
              acao={
                !produtos.data?.length && (
                  <Button onClick={() => abrir(null)}>
                    <Plus /> Cadastrar o primeiro
                  </Button>
                )
              }
            />
          }
        >
          {(lista) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="hidden md:table-cell">Categoria</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrar(lista).map((p) => (
                  <TableRow key={p.id} className={cn(!p.ativo && "opacity-60")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {p.imagem_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imagem_url} alt="" className="size-10 rounded-lg object-cover" />
                        ) : (
                          <div className="bg-muted grid size-10 place-items-center rounded-lg">
                            <Package className="text-muted-foreground size-4" aria-hidden />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{p.nome}</p>
                          <p className="text-muted-foreground text-xs">{p.sku ?? "sem SKU"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{p.categoria_id ? nomeCategoria.get(p.categoria_id) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(p.preco)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.estoque_atual <= p.estoque_minimo && "font-semibold text-rose-700")}>
                      {p.estoque_atual}
                    </TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`${p.nome} ativo`}
                        checked={p.ativo}
                        onCheckedChange={(v) => alternar.mutate({ id: p.id, ativo: v })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" aria-label={`Editar ${p.nome}`} onClick={() => abrir(p)}>
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </EstadoQuery>
      </div>

      <FormProduto produto={editando} aberto={formAberto} onFechar={() => setFormAberto(false)} />
    </>
  )
}
