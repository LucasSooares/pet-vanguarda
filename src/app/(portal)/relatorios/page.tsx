"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { addDays, endOfMonth, startOfMonth, subMonths } from "date-fns"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Carregando, Erro, PageHeader, Vazio } from "@/components/estados"
import { GraficoVendas } from "@/features/dashboard/graficos"
import { baixarCsv } from "@/lib/csv"
import { ok } from "@/lib/erros"
import { formatarData, formatarMoeda, isoDia } from "@/lib/format"
import { getSupabase } from "@/lib/supabase/client"

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—")
const br = (n: number) => n.toFixed(2).replace(".", ",")

export default function RelatoriosPage() {
  const hoje = new Date()
  const [inicio, setInicio] = useState(isoDia(startOfMonth(hoje)))
  const [fim, setFim] = useState(isoDia(hoje))

  const dados = useQuery({
    queryKey: ["relatorios", inicio, fim],
    enabled: !!inicio && !!fim && inicio <= fim,
    queryFn: async () => {
      const s = getSupabase()
      const args = { p_inicio: inicio, p_fim: fim }
      const [serie, servicos, produtos] = await Promise.all([
        s.rpc("serie_diaria", args).then(ok),
        s.rpc("relatorio_servicos", args).then(ok),
        s.rpc("relatorio_produtos", args).then(ok),
      ])
      return { serie: serie ?? [], servicos: servicos ?? [], produtos: produtos ?? [] }
    },
  })

  const atalhos: [string, Date, Date][] = [
    ["Este mês", startOfMonth(hoje), hoje],
    ["Mês passado", startOfMonth(subMonths(hoje, 1)), endOfMonth(subMonths(hoje, 1))],
    ["Últimos 7 dias", addDays(hoje, -6), hoje],
    ["Últimos 90 dias", addDays(hoje, -89), hoje],
  ]

  const d = dados.data
  const totServ = d?.servicos.reduce((s, x) => s + Number(x.faturamento), 0) ?? 0
  const totProd = d?.produtos.reduce((s, x) => s + Number(x.faturamento), 0) ?? 0
  const qtdAg = d?.servicos.reduce((s, x) => s + Number(x.quantidade), 0) ?? 0
  const canc = d?.servicos.reduce((s, x) => s + Number(x.cancelados), 0) ?? 0
  const faltas = d?.servicos.reduce((s, x) => s + Number(x.faltas), 0) ?? 0

  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao="Serviços contam quando concluídos; produtos, quando o pedido é confirmado (e não cancelado)."
        acoes={
          <Button
            variant="outline"
            disabled={!d}
            onClick={() =>
              d &&
              baixarCsv(
                `faturamento_${inicio}_a_${fim}`,
                d.serie.map((x) => ({
                  Dia: formatarData(x.dia),
                  Agendamentos: x.agendamentos,
                  "Cancelados/faltas": x.cancelados,
                  "Faturamento serviços": br(Number(x.faturamento_servicos)),
                  Pedidos: x.pedidos,
                  "Faturamento produtos": br(Number(x.faturamento_produtos)),
                }))
              )
            }
          >
            <Download /> Faturamento CSV
          </Button>
        }
      />

      <div className="bg-card shadow-soft mb-4 flex flex-wrap items-end gap-3 rounded-2xl border p-4">
        <div className="space-y-1">
          <Label htmlFor="r-ini">De</Label>
          <Input id="r-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="r-fim">Até</Label>
          <Input id="r-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {atalhos.map(([r, a, b]) => (
            <Button
              key={r}
              variant="ghost"
              size="sm"
              onClick={() => {
                setInicio(isoDia(a))
                setFim(isoDia(b))
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      {inicio > fim ? (
        <Vazio titulo="Período inválido" descricao="A data inicial deve ser anterior à final." />
      ) : dados.isLoading ? (
        <Carregando linhas={8} />
      ) : dados.error ? (
        <Erro erro={dados.error} tentarNovamente={() => dados.refetch()} />
      ) : (
        d && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Faturamento total", formatarMoeda(totServ + totProd)],
                ["Serviços", formatarMoeda(totServ)],
                ["Produtos", formatarMoeda(totProd)],
                ["Taxa de cancelamento", pct(canc, qtdAg)],
                ["Taxa de falta", pct(faltas, qtdAg)],
              ].map(([r, v]) => (
                <div key={r} className="bg-card shadow-soft rounded-2xl border p-4">
                  <p className="text-muted-foreground text-xs">{r}</p>
                  <p className="text-xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            <section className="bg-card shadow-soft mb-4 rounded-2xl border p-4">
              <h2 className="mb-2 font-semibold">Faturamento por dia</h2>
              <GraficoVendas serie={d.serie} />
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
              <section className="bg-card shadow-soft overflow-hidden rounded-2xl border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="font-semibold">Serviços mais vendidos</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!d.servicos.length}
                    onClick={() =>
                      baixarCsv(
                        `servicos_${inicio}_a_${fim}`,
                        d.servicos.map((x) => ({
                          Serviço: x.servico,
                          Agendados: x.quantidade,
                          Concluídos: x.concluidos,
                          Cancelados: x.cancelados,
                          Faltas: x.faltas,
                          Faturamento: br(Number(x.faturamento)),
                        }))
                      )
                    }
                  >
                    <Download /> CSV
                  </Button>
                </div>
                {d.servicos.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serviço</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Canc./faltas</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.servicos.map((x) => (
                        <TableRow key={x.servico}>
                          <TableCell>{x.servico}</TableCell>
                          <TableCell className="text-right tabular-nums">{x.quantidade}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Number(x.cancelados) + Number(x.faltas)} ({pct(Number(x.cancelados) + Number(x.faltas), Number(x.quantidade))})
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(x.faturamento)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Vazio titulo="Sem agendamentos no período" />
                )}
              </section>

              <section className="bg-card shadow-soft overflow-hidden rounded-2xl border">
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <h2 className="font-semibold">Produtos mais vendidos</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!d.produtos.length}
                    onClick={() =>
                      baixarCsv(
                        `produtos_${inicio}_a_${fim}`,
                        d.produtos.map((x) => ({ Produto: x.nome, Quantidade: x.quantidade, Faturamento: br(Number(x.faturamento)) }))
                      )
                    }
                  >
                    <Download /> CSV
                  </Button>
                </div>
                {d.produtos.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.produtos.map((x) => (
                        <TableRow key={x.produto_id ?? x.nome}>
                          <TableCell>{x.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{x.quantidade}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(x.faturamento)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Vazio titulo="Sem vendas no período" />
                )}
              </section>
            </div>
          </>
        )
      )}
    </>
  )
}
