import Papa from "papaparse"

/** Gera CSV (separador ";" + BOM, abre certo no Excel pt-BR) e baixa no navegador. */
export function baixarCsv(nomeArquivo: string, linhas: Record<string, unknown>[]) {
  const csv = Papa.unparse(linhas, { delimiter: ";" })
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Lê CSV com cabeçalho; detecta "," ou ";" automaticamente. */
export function lerCsv(texto: string) {
  const res = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) =>
      h
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, "_"),
  })
  return { linhas: res.data, erros: res.errors }
}

/** "1.234,56" | "1234.56" | "R$ 10,00" → número */
export function numeroBr(v: string | undefined | null): number | null {
  if (v == null) return null
  let s = String(v).replace(/[R$\s]/g, "")
  if (!s) return null
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".")
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
