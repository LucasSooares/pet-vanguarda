"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatarData, formatarMoeda } from "@/lib/format"
import type { SerieDiaria } from "@/lib/database.types"

const eixo = { fontSize: 11, fill: "var(--muted-foreground)" }
const dica = {
  contentStyle: { borderRadius: 12, border: "1px solid var(--border)", boxShadow: "var(--shadow-soft)", fontSize: 12 },
  labelFormatter: (d: unknown) => formatarData(String(d), "EEE dd/MM"),
}

export function GraficoAgendamentos({ serie }: { serie: SerieDiaria[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="dia" tickFormatter={(d) => formatarData(d, "dd/MM")} tick={eixo} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} tick={eixo} tickLine={false} axisLine={false} />
        <Tooltip {...dica} cursor={{ fill: "var(--accent)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="agendamentos" name="Agendamentos" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
        <Bar dataKey="cancelados" name="Cancelados/faltas" stackId="a" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function GraficoVendas({ serie }: { serie: SerieDiaria[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={serie} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="gServ" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="dia" tickFormatter={(d) => formatarData(d, "dd/MM")} tick={eixo} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={eixo} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} width={56} />
        <Tooltip {...dica} formatter={(v) => formatarMoeda(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="faturamento_servicos" name="Serviços" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gServ)" />
        <Area type="monotone" dataKey="faturamento_produtos" name="Produtos" stroke="var(--chart-2)" strokeWidth={2} fill="url(#gProd)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
