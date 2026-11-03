"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addDays } from "date-fns"
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Download, History, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Carregando, EstadoQuery, PageHeader, Vazio } from "@/components/estados"
import { useMovimentacoes, useProdutos } from "@/features/produtos/api"
import { Movimentar, ROTULO_TIPO } from "@/features/produtos/movimentar"
import { baixarCsv } from "@/lib/csv"
import { ok } from "@/lib/erros"
import { formatarDataHora, isoDia } from "@/lib/format"
import { getSupabase } from "@/lib/supabase/client"
import type { Produto, TipoMovimentacao } from "@/lib/database.types"
import { cn } from "@/lib/utils"

function Historico({ produto, onFechar }: { produto: Produto | null; onFechar: () => void }) {
  const movs = useMovimentacoes(produto?.id ?? null)
  return (
    <Sheet open={!!produto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Histórico — {produto?.nome}</SheetTitle>
          <SheetDescription>Saldo atual: {produto?.estoque_atual}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {movs.isLoading ? (
            <Carregando />
          ) : movs.data?.length ? (
            <ol className="divide-y">
              {movs.data.map((m) => (
                <li key={m.id} className="py-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">
                      {ROTULO_TIPO[m.tipo]}{" "}
                      <span className={m.tipo === "entrada" ? "text-emerald-700" : m.tipo === "saida" ? "text-rose-700" : ""}>
                        {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "−" : "="}
                        {m.quantidade}
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {m.saldo_anterior} → {m.saldo_posterior}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {formatarDataHora(m.created_at)} · {m.motivo || "—"}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <Vazio titulo="Sem movimentações" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RelatorioGiro() {
  const [inicio, setInicio] = useState(isoDia(addDays(new Date(), -30)))
  const [fim, setFim] = useState(isoDia(new Date()))
  const giro = useQuery({
    queryKey: ["giro", inicio, fim],
    queryFn: async () => ok(await getSupabase().rpc("relatorio_giro_estoque", { p_inicio: inicio, p_fim: fim })) ?? [],
  })
  return (
    <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div className="space-y-1">
          <Label htmlFor="g-ini">De</Label>
          <Input id="g-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="g-fim">Até</Label>
          <Input id="g-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <Button
          variant="outline"
          className="ml-auto"
          disabled={!giro.data?.length}
          onClick={() =>
            baixarCsv(
              `giro_estoque_${inicio}_a_${fim}`,
              (giro.data ?? []).map((g) => ({
                Produto: g.nome,
                SKU: g.sku ?? "",
                Saldo: g.estoque_atual,
                Mínimo: g.estoque_minimo,
                Entradas: g.entradas,
                Saídas: g.saidas,
                Giro: g.giro ?? "",
                "Dias de cobertura": g.dias_cobertura ?? "",
              }))
            )
          }
        >
          <Download /> CSV
        </Button>
      </div>
      <EstadoQuery query={giro} vazio={(d) => d.length === 0}>
        {(lista) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Giro</TableHead>
                <TableHead className="text-right">Cobertura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((g) => (
                <TableRow key={g.produto_id}>
                  <TableCell>{g.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.estoque_atual}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.entradas}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.saidas}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.giro ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.dias_cobertura != null ? `${g.dias_cobertura} dias` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EstadoQuery>
      <p className="text-muted-foreground border-t px-4 py-2 text-xs">
        Giro = saídas no período ÷ saldo atual. Cobertura = quantos dias o saldo dura no ritmo de saída do período.
      </p>
    </div>
  )
}

export default function EstoquePage() {
  const produtos = useProdutos()
  const [mov, setMov] = useState<{ produto: Produto; tipo: TipoMovimentacao } | null>(null)
  const [historico, setHistorico] = useState<Produto | null>(null)
  const [soAlerta, setSoAlerta] = useState(false)
  const baixos = (produtos.data ?? []).filter((p) => p.ativo && p.estoque_atual <= p.estoque_minimo)

  return (
    <>
      <PageHeader titulo="Estoque" descricao="Saldo só muda por movimentação — nunca fica negativo." />

      {baixos.length > 0 && (
        <button
          type="button"
          onClick={() => setSoAlerta((v) => !v)}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-950"
          aria-pressed={soAlerta}
        >
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <span>
            <strong>{baixos.length} produto(s)</strong> no estoque mínimo ou abaixo. {soAlerta ? "Mostrar todos" : "Ver só esses"}
          </span>
        </button>
      )}

      <Tabs defaultValue="saldo">
        <TabsList className="mb-4">
          <TabsTrigger value="saldo">Saldo atual</TabsTrigger>
          <TabsTrigger value="giro">Relatório de giro</TabsTrigger>
        </TabsList>
        <TabsContent value="saldo">
          <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
            <EstadoQuery query={produtos} vazio={(d) => d.length === 0}>
              {(lista) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Mínimo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(soAlerta ? baixos : lista).map((p) => {
                      const baixo = p.estoque_atual <= p.estoque_minimo
                      return (
                        <TableRow key={p.id} className={cn(!p.ativo && "opacity-60")}>
                          <TableCell>
                            <p className="font-medium">{p.nome}</p>
                            <p className="text-muted-foreground text-xs">{p.sku ?? ""}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums",
                                baixo ? "bg-rose-100 text-rose-800" : "bg-emerald-50 text-emerald-800"
                              )}
                            >
                              {p.estoque_atual}
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{p.estoque_minimo}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setMov({ produto: p, tipo: "entrada" })} aria-label={`Entrada de ${p.nome}`}>
                                <ArrowDownToLine /> <span className="hidden md:inline">Entrada</span>
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setMov({ produto: p, tipo: "saida" })} aria-label={`Saída de ${p.nome}`}>
                                <ArrowUpFromLine /> <span className="hidden md:inline">Saída</span>
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setMov({ produto: p, tipo: "ajuste" })} aria-label={`Ajustar ${p.nome}`}>
                                <Scale /> <span className="hidden md:inline">Ajuste</span>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setHistorico(p)} aria-label={`Histórico de ${p.nome}`}>
                                <History />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </EstadoQuery>
          </div>
        </TabsContent>
        <TabsContent value="giro">
          <RelatorioGiro />
        </TabsContent>
      </Tabs>

      <Movimentar produto={mov?.produto ?? null} tipo={mov?.tipo ?? "entrada"} onFechar={() => setMov(null)} />
      <Historico
        produto={historico ? (produtos.data?.find((p) => p.id === historico.id) ?? historico) : null}
        onFechar={() => setHistorico(null)}
      />
    </>
  )
}
