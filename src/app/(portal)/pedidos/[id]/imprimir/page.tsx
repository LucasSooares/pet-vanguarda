import { notFound } from "next/navigation"
import { createSupabaseServer } from "@/lib/supabase/server"
import { formatarDataHora, formatarMoeda, formatarTelefone } from "@/lib/format"
import { BotaoImprimir } from "./botao-imprimir"

export const metadata = { title: "Comprovante do pedido" }

export default async function ImprimirPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServer()
  const { data: pedido } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle()
  if (!pedido) notFound()
  const [{ data: itens }, { data: clientes }, { data: config }] = await Promise.all([
    supabase.from("pedido_itens").select("*").eq("pedido_id", id),
    pedido.user_id ? supabase.rpc("clientes_resumo", { p_ids: [pedido.user_id] }) : Promise.resolve({ data: [] }),
    supabase.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
  ])
  const cliente = clientes?.[0]
  const nome = cliente?.nome ?? pedido.cliente_nome ?? "Cliente"
  const telefone = cliente?.telefone ?? pedido.cliente_telefone

  return (
    <div className="mx-auto max-w-md bg-white p-6 font-mono text-sm text-black">
      <BotaoImprimir />
      <header className="border-b border-dashed border-black pb-3 text-center">
        <p className="text-lg font-bold">{config?.nome ?? "Pet Vanguarda"}</p>
        {config?.endereco && <p>{config.endereco}</p>}
        {config?.telefone && <p>{config.telefone}</p>}
        {config?.cnpj && <p>CNPJ {config.cnpj}</p>}
      </header>

      <section className="border-b border-dashed border-black py-3">
        <p className="text-2xl font-bold">PEDIDO #{pedido.numero}</p>
        <p>{formatarDataHora(pedido.created_at)}</p>
        <p>Status: {pedido.status}</p>
      </section>

      {/* Etiqueta: destinatário */}
      <section className="border-b border-dashed border-black py-3">
        <p className="font-bold uppercase">{pedido.tipo_entrega === "entrega" ? "Entregar para" : "Retirada na loja"}</p>
        <p className="text-base font-bold">{nome}</p>
        {telefone && <p>{formatarTelefone(telefone)}</p>}
        {pedido.endereco && <p className="whitespace-pre-line">{pedido.endereco}</p>}
        {pedido.forma_pagamento && <p>Pagamento: {pedido.forma_pagamento}</p>}
      </section>

      <table className="my-3 w-full">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qtd</th>
            <th className="py-1 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {itens?.map((i) => (
            <tr key={i.id} className="align-top">
              <td className="py-1">{i.nome}</td>
              <td className="py-1 text-right">{i.quantidade}</td>
              <td className="py-1 text-right">{formatarMoeda(i.preco_unit * i.quantidade)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-black pt-2 text-right text-lg font-bold">TOTAL {formatarMoeda(pedido.total)}</p>
      {pedido.observacoes && <p className="mt-3">Obs.: {pedido.observacoes}</p>}
      <p className="mt-6 text-center text-xs">Obrigado pela preferência! 🐾</p>
    </div>
  )
}
