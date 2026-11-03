import { describe, expect, it } from "vitest"
import { analisarLinha, schemaMovimentacao } from "@/features/produtos/regras"
import { mensagemErro } from "@/lib/erros"
import { lerCsv, numeroBr } from "@/lib/csv"
import { normalizarHora, preencherModelo } from "@/lib/format"
import {
  normalizarPorte,
  normalizarStatusAgendamento,
  proximosStatusPedido,
  statusOcupaVaga,
  TRANSICOES_PEDIDO,
} from "@/lib/status"

describe("status de agendamento (compatível com o app)", () => {
  it("normaliza variações vindas do app", () => {
    expect(normalizarStatusAgendamento("confirmado")).toBe("Confirmado")
    expect(normalizarStatusAgendamento("Concluido")).toBe("Concluído")
    expect(normalizarStatusAgendamento("CANCELADA")).toBe("Cancelado")
  })
  it("cancelado e falta liberam a vaga (igual a public.status_ocupa_vaga)", () => {
    expect(statusOcupaVaga("Confirmado")).toBe(true)
    expect(statusOcupaVaga("Pendente")).toBe(true)
    expect(statusOcupaVaga("cancelado")).toBe(false)
    expect(statusOcupaVaga("Falta")).toBe(false)
  })
})

describe("fluxo de pedidos (espelha public.pedido_transicao_valida)", () => {
  it("não permite pular etapas nem reabrir finalizados", () => {
    expect(TRANSICOES_PEDIDO.Novo).toEqual(["Confirmado", "Cancelado"])
    expect(TRANSICOES_PEDIDO.Confirmado).not.toContain("Entregue")
    expect(TRANSICOES_PEDIDO.Entregue).toEqual([])
    expect(TRANSICOES_PEDIDO.Cancelado).toEqual([])
  })
  it("após separação, retirada vai para Pronto e entrega para Saiu para entrega", () => {
    expect(proximosStatusPedido("Em separação", "retirada")).toEqual(["Pronto", "Cancelado"])
    expect(proximosStatusPedido("Em separação", "entrega")).toEqual(["Saiu para entrega", "Cancelado"])
  })
})

describe("movimentação de estoque (validação do formulário)", () => {
  const s = schemaMovimentacao(5)
  it("bloqueia saída maior que o saldo", () => {
    expect(s.safeParse({ tipo: "saida", quantidade: 6, motivo: "venda" }).success).toBe(false)
    expect(s.safeParse({ tipo: "saida", quantidade: 5, motivo: "venda" }).success).toBe(true)
  })
  it("exige quantidade positiva em entrada e motivo", () => {
    expect(s.safeParse({ tipo: "entrada", quantidade: 0, motivo: "compra" }).success).toBe(false)
    expect(s.safeParse({ tipo: "entrada", quantidade: 3, motivo: "" }).success).toBe(false)
  })
  it("ajuste define o novo saldo (pode ser zero, não pode ser igual ao atual)", () => {
    expect(s.safeParse({ tipo: "ajuste", quantidade: 0, motivo: "inventário" }).success).toBe(true)
    expect(s.safeParse({ tipo: "ajuste", quantidade: 5, motivo: "inventário" }).success).toBe(false)
  })
})

describe("importação de produtos por CSV", () => {
  it("lê CSV com ; e cabeçalhos acentuados", () => {
    const { linhas } = lerCsv("﻿Nome;Preço;SKU;Estoque Mínimo\nRação;219,90;RAC-1;3\n")
    expect(linhas[0]).toEqual({ nome: "Ração", preco: "219,90", sku: "RAC-1", estoque_minimo: "3" })
  })
  it("converte números no formato brasileiro", () => {
    expect(numeroBr("1.234,56")).toBe(1234.56)
    expect(numeroBr("R$ 10,00")).toBe(10)
    expect(numeroBr("12.5")).toBe(12.5)
    expect(numeroBr("abc")).toBeNull()
  })
  it("valida linhas e aponta erros", () => {
    expect(analisarLinha({ nome: "Bolinha", preco: "14,90", ativo: "não" }, 2)).toMatchObject({
      dados: { nome: "Bolinha", preco: 14.9, ativo: false },
    })
    expect(analisarLinha({ nome: "", preco: "x" }, 3).erro).toBeTruthy()
  })
})

describe("utilitários", () => {
  it("normaliza horário do app", () => {
    expect(normalizarHora("9:00")).toBe("09:00")
    expect(normalizarHora("14:30:00")).toBe("14:30")
  })
  it("normaliza porte com lixo do app", () => {
    expect(normalizarPorte('""')).toBeNull()
    expect(normalizarPorte("medio")).toBe("Médio")
    expect(normalizarPorte("Grande")).toBe("Grande")
  })
  it("preenche mensagens padrão", () => {
    expect(preencherModelo("Olá {cliente}, pedido #{numero}", { cliente: "Ana", numero: 7 })).toBe("Olá Ana, pedido #7")
  })
  it("traduz erros do banco", () => {
    expect(mensagemErro({ message: "HORARIO_LOTADO: 07/01/2030 às 09:00 já atingiu a capacidade (1)" })).toMatch(/lotado/)
    expect(mensagemErro({ message: "new row violates row-level security policy", code: "42501" })).toMatch(/permissão/)
  })
})
