// Regras puras (sem React) — usadas nos formulários e nos testes unitários.
import { z } from "zod"
import { numeroBr } from "@/lib/csv"

/** Regras espelhadas do banco: entrada/saída > 0, ajuste = novo saldo ≥ 0, saída ≤ saldo. */
export function schemaMovimentacao(saldoAtual: number) {
  return z
    .object({
      tipo: z.enum(["entrada", "saida", "ajuste"]),
      quantidade: z.coerce.number<number>().int("Número inteiro").min(0).max(100000),
      motivo: z.string().trim().min(3, "Informe o motivo").max(200),
    })
    .refine((d) => d.tipo === "ajuste" || d.quantidade > 0, { path: ["quantidade"], message: "Quantidade deve ser maior que zero" })
    .refine((d) => d.tipo !== "saida" || d.quantidade <= saldoAtual, {
      path: ["quantidade"],
      message: `Saída maior que o saldo (${saldoAtual})`,
    })
    .refine((d) => d.tipo !== "ajuste" || d.quantidade !== saldoAtual, { path: ["quantidade"], message: "O saldo já é esse" })
}

// ---------- Importação de produtos por CSV ----------
const linhaSchema = z.object({
  nome: z.string().trim().min(2, "nome obrigatório").max(120),
  preco: z.number({ message: "preço inválido" }).min(0),
  sku: z.string().trim().max(40).optional(),
  descricao: z.string().trim().max(1000).optional(),
  categoria: z.string().trim().max(60).optional(),
  estoque_minimo: z.number().int().min(0).optional(),
  estoque: z.number().int().min(0).optional(),
  ativo: z.boolean(),
})
type Linha = z.infer<typeof linhaSchema>
export type LinhaAnalisada = { n: number; dados?: Linha; erro?: string }

/** Converte uma linha do CSV (cabeçalhos normalizados) para o formato validado. */
export function analisarLinha(l: Record<string, string>, n: number): LinhaAnalisada {
  const int = (v?: string) => (v ? Math.round(numeroBr(v) ?? NaN) : undefined)
  const bruto = {
    nome: l.nome ?? "",
    preco: numeroBr(l.preco) ?? NaN,
    sku: l.sku || undefined,
    descricao: l.descricao || undefined,
    categoria: l.categoria || undefined,
    estoque_minimo: int(l.estoque_minimo),
    estoque: int(l.estoque ?? l.estoque_inicial),
    ativo: !/^(nao|não|n|false|0|inativo)$/i.test((l.ativo ?? "").trim()),
  }
  const r = linhaSchema.safeParse(bruto)
  return r.success ? { n, dados: r.data } : { n, erro: r.error.issues.map((i) => i.message).join(", ") }
}

