"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Search, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EstadoQuery, PageHeader, Vazio } from "@/components/estados"
import { getSupabase } from "@/lib/supabase/client"
import { ok } from "@/lib/erros"
import { formatarData, formatarTelefone } from "@/lib/format"

export default function ClientesPage() {
  const params = useSearchParams()
  const [busca, setBusca] = useState(params.get("q") ?? "")
  const [termo, setTermo] = useState(busca)

  useEffect(() => setBusca(params.get("q") ?? ""), [params])
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])

  const clientes = useQuery({
    queryKey: ["clientes", "lista", termo],
    queryFn: async () => ok(await getSupabase().rpc("listar_clientes", { p_busca: termo || null })) ?? [],
  })

  return (
    <>
      <PageHeader titulo="Clientes e pets" descricao="Clientes cadastrados no app, seus pets e histórico." />
      <div className="bg-card shadow-soft mb-4 rounded-2xl border p-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            aria-label="Buscar clientes"
            className="pl-9"
            placeholder="Nome, e-mail, telefone ou nome do pet…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>
      <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
        <EstadoQuery
          query={clientes}
          vazio={(d) => d.length === 0}
          vazioComponente={<Vazio icone={Users} titulo={termo ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"} />}
        >
          {(lista) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead className="text-right">Pets</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Agendamentos</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Pedidos</TableHead>
                  <TableHead className="hidden lg:table-cell">Último agendamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => (
                  <TableRow key={c.user_id}>
                    <TableCell>
                      <Link href={`/clientes/${c.user_id}`} className="font-medium hover:underline">
                        {c.nome ?? "Sem nome"}
                      </Link>
                      <p className="text-muted-foreground text-xs">{c.email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatarTelefone(c.telefone) || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.pets}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.agendamentos}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.pedidos}</TableCell>
                    <TableCell className="hidden lg:table-cell">{formatarData(c.ultimo_agendamento)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </EstadoQuery>
      </div>
    </>
  )
}
