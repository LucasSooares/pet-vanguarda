import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export const formatarMoeda = (v: number | string | null | undefined) => moeda.format(Number(v ?? 0))

/** "2026-10-28" → Date local (sem deslocamento de fuso) */
export const dataLocal = (iso: string) => parseISO(iso.length === 10 ? `${iso}T00:00:00` : iso)

export const formatarData = (iso: string | null | undefined, padrao = "dd/MM/yyyy") =>
  iso ? format(dataLocal(iso), padrao, { locale: ptBR }) : "—"

export const formatarDataHora = (iso: string | null | undefined) =>
  iso ? format(parseISO(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"

/** Date → "yyyy-MM-dd" no fuso local */
export const isoDia = (d: Date) => format(d, "yyyy-MM-dd")

/** "9:00", "09:00:00" → "09:00" */
export const normalizarHora = (h: string | null | undefined) => {
  if (!h) return ""
  const m = h.trim().match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : h.trim()
}

export const formatarTelefone = (t: string | null | undefined) => {
  const d = (t ?? "").replace(/\D/g, "")
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t ?? ""
}

export const linkWhatsApp = (telefone: string | null | undefined, texto: string) => {
  const d = (telefone ?? "").replace(/\D/g, "")
  if (!d) return null
  const numero = d.length <= 11 ? `55${d}` : d
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

export const preencherModelo = (modelo: string, valores: Record<string, string | number | null | undefined>) =>
  modelo.replace(/\{(\w+)\}/g, (_, k: string) => String(valores[k] ?? ""))
