"use client"

import { use } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MessageCircle, PawPrint } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Carregando, Erro, PageHeader, Vazio } from "@/components/estados"
import { StatusAgendamentoBadge, StatusPedidoBadge } from "@/components/status-badge"
import { getSupabase } from "@/lib/supabase/client"
import { ok } from "@/lib/erros"
import { formatarData, formatarDataHora, formatarMoeda, formatarTelefone, linkWhatsApp, normalizarHora } from "@/lib/format"
import { normalizarPorte } from "@/lib/status"
import type { Agendamento, Endereco, Pedido, Pet } from "@/lib/database.types"

export default function ClienteDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = useQuery({
    queryKey: ["clientes", "detalhe", id],
    queryFn: async () => {
      const supabase = getSupabase()
      const [cliente, pets, agendamentos, pedidos, enderecos] = await Promise.all([
        ok(await supabase.rpc("clientes_resumo", { p_ids: [id] })),
        ok(await supabase.from("pets").select("*").eq("user_id", id).order("nome")),
        ok(await supabase.from("agendamentos").select("*").eq("user_id", id).order("data", { ascending: false }).limit(100)),
        ok(await supabase.from("pedidos").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(100)),
        ok(await supabase.from("enderecos").select("*").eq("user_id", id)),
      ])
      return {
        cliente: cliente?.[0] ?? null,
        pets: (pets ?? []) as Pet[],
        agendamentos: (agendamentos ?? []) as Agendamento[],
        pedidos: (pedidos ?? []) as Pedido[],
        enderecos: (enderecos ?? []) as Endereco[],
      }
    },
  })

  if (q.isLoading) return <Carregando linhas={8} />
  if (q.error) return <Erro erro={q.error} tentarNovamente={() => q.refetch()} />
  if (!q.data?.cliente) return <Vazio titulo="Cliente não encontrado" />

  const { cliente, pets, agendamentos, pedidos, enderecos } = q.data
  const whats = linkWhatsApp(cliente.telefone, `Olá ${cliente.nome?.split(" ")[0] ?? ""}!`)
  const totalServicos = agendamentos.filter((a) => a.status === "Concluído").reduce((s, a) => s + Number(a.preco ?? 0), 0)

  return (
    <>
      <Button variant="ghost" asChild className="mb-2 -ml-2">
        <Link href="/clientes">
          <ArrowLeft /> Clientes
        </Link>
      </Button>
      <PageHeader
        titulo={cliente.nome ?? "Cliente"}
        descricao={[cliente.email, formatarTelefone(cliente.telefone)].filter(Boolean).join(" · ")}
        acoes={
          whats && (
            <Button variant="outline" asChild>
              <a href={whats} target="_blank" rel="noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          )
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          ["Agendamentos", agendamentos.length],
          ["Pedidos", pedidos.length],
          ["Gasto em serviços", formatarMoeda(totalServicos)],
        ].map(([r, v]) => (
          <div key={r} className="bg-card shadow-soft rounded-2xl border p-4">
            <p className="text-muted-foreground text-xs">{r}</p>
            <p className="text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Pets</h2>
      {pets.length ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((p) => (
            <article key={p.id} className="bg-card shadow-soft flex gap-4 rounded-2xl border p-4">
              {p.foto && /^https?:/.test(p.foto) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto} alt={`Foto de ${p.nome}`} className="size-20 rounded-xl object-cover" />
              ) : (
                <div className="bg-accent grid size-20 place-items-center rounded-xl">
                  <PawPrint className="text-accent-foreground size-7" aria-hidden />
                </div>
              )}
              <div className="min-w-0 text-sm">
                <h3 className="font-semibold">{p.nome || "Sem nome"}</h3>
                <p className="text-muted-foreground">
                  {[p.especie, p.raca, normalizarPorte(p.porte), p.sexo].filter(Boolean).join(" · ")}
                </p>
                {p.nascimento && <p className="text-muted-foreground text-xs">Nascimento: {p.nascimento}</p>}
                {p.observacoes && <p className="mt-1 line-clamp-3">{p.observacoes}</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground mb-8 text-sm">Nenhum pet cadastrado.</p>
      )}

      {enderecos.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold">Endereços</h2>
          <ul className="mb-8 space-y-1 text-sm">
            {enderecos.map((e) => (
              <li key={e.id}>
                {e.principal && <strong>Principal: </strong>}
                {[e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.estado, e.cep].filter(Boolean).join(", ")}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Histórico de agendamentos</h2>
          <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
            {agendamentos.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Preço</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agendamentos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums">
                        {formatarData(a.data)} {normalizarHora(a.hora)}
                      </TableCell>
                      <TableCell>
                        {a.servico}
                        <span className="text-muted-foreground block text-xs">{a.pet}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(a.preco)}</TableCell>
                      <TableCell>
                        <StatusAgendamentoBadge status={a.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Vazio titulo="Sem agendamentos" />
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Histórico de pedidos</h2>
          <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
            {pedidos.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        #{p.numero}
                        <span className="text-muted-foreground block text-xs">{formatarDataHora(p.created_at)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(p.total)}</TableCell>
                      <TableCell>
                        <StatusPedidoBadge status={p.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Vazio titulo="Sem pedidos" />
            )}
          </div>
        </section>
      </div>
    </>
  )
}
