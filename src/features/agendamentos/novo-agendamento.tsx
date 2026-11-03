"use client"

import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/estados"
import { getSupabase } from "@/lib/supabase/client"
import { ok } from "@/lib/erros"
import { isoDia } from "@/lib/format"
import { PORTES, normalizarPorte } from "@/lib/status"
import { useCriarAgendamento, useHorariosLivres, useServicos } from "./api"

const schema = z
  .object({
    user_id: z.string().optional(),
    cliente_nome: z.string().trim().max(120).optional(),
    cliente_telefone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Telefone com DDD"),
    pet: z.string().trim().min(1, "Informe o pet").max(80),
    porte: z.enum(PORTES, { message: "Escolha o porte" }),
    servico_id: z.string().min(1, "Escolha o serviço"),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    hora: z.string().regex(/^\d{2}:\d{2}$/, "Escolha o horário"),
    preco: z.coerce.number<number>().min(0, "Preço inválido").max(100000),
    status: z.enum(["Pendente", "Confirmado"]),
    observacoes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.user_id || (d.cliente_nome && d.cliente_nome.length >= 2), {
    path: ["cliente_nome"],
    message: "Escolha um cliente cadastrado ou informe o nome",
  })

type Dados = z.infer<typeof schema>

type ClienteEscolhido = { user_id: string; nome: string | null; telefone: string | null; email: string | null }
type PetCadastrado = { id: string; nome: string; porte: string | null }

function BuscaCliente({
  escolhido,
  onEscolher,
}: {
  escolhido: ClienteEscolhido | null
  onEscolher: (c: ClienteEscolhido | null, pet?: PetCadastrado) => void
}) {
  const [termo, setTermo] = useState("")
  const [atraso, setAtraso] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setAtraso(termo.trim()), 300)
    return () => clearTimeout(t)
  }, [termo])
  const res = useQuery({
    queryKey: ["clientes", "busca", atraso],
    enabled: atraso.length >= 2 && !escolhido,
    queryFn: async () => {
      const clientes = (ok(await getSupabase().rpc("listar_clientes", { p_busca: atraso })) ?? []).slice(0, 6)
      if (!clientes.length) return []
      // Já traz os pets de cada cliente para escolher cliente + pet num clique
      const pets =
        ok(
          await getSupabase()
            .from("pets")
            .select("id, nome, porte, user_id")
            .in("user_id", clientes.map((c) => c.user_id))
            .order("nome")
        ) ?? []
      return clientes.map((c) => ({ ...c, listaPets: pets.filter((p) => p.user_id === c.user_id) }))
    },
  })

  if (escolhido) {
    return (
      <div className="space-y-2">
        <Label>Cliente</Label>
        <div className="bg-accent/40 flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{escolhido.nome ?? "Sem nome"}</p>
            <p className="text-muted-foreground truncate text-xs">
              {[escolhido.telefone, escolhido.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setTermo("")
              onEscolher(null)
            }}
          >
            Trocar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="busca-cliente">Buscar cliente cadastrado no app</Label>
      <Input
        id="busca-cliente"
        placeholder="Nome, telefone, e-mail ou nome do pet…"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoComplete="off"
      />
      {atraso.length >= 2 &&
        (res.isFetching && !res.data ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner /> Buscando…
          </p>
        ) : res.data?.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Nenhum cliente encontrado. Preencha nome e telefone abaixo para cliente sem cadastro.
          </p>
        ) : res.data ? (
          <ul className="divide-y rounded-xl border" aria-label="Clientes encontrados">
            {res.data.map((c) => (
              <li key={c.user_id} className="px-3 py-2 text-sm">
                <button
                  type="button"
                  className="hover:text-primary w-full text-left outline-none focus-visible:underline"
                  onClick={() => onEscolher(c)}
                >
                  <span className="font-medium">{c.nome ?? "Sem nome"}</span>
                  <span className="text-muted-foreground block text-xs">
                    {[c.telefone, c.email].filter(Boolean).join(" · ")}
                  </span>
                </button>
                {c.listaPets.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.listaPets.map((p) => (
                      <Button
                        key={p.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-full px-2.5 text-xs"
                        onClick={() => onEscolher(c, p)}
                        aria-label={`Escolher ${c.nome ?? "cliente"} com o pet ${p.nome}`}
                      >
                        🐾 {p.nome}
                        {normalizarPorte(p.porte) && <span className="text-muted-foreground">· {normalizarPorte(p.porte)}</span>}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null)}
    </div>
  )
}

export function NovoAgendamento({ dataInicial }: { dataInicial?: string }) {
  const [aberto, setAberto] = useState(false)
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null)
  const [petNovo, setPetNovo] = useState(false)
  const servicos = useServicos()
  const criar = useCriarAgendamento()
  const form = useForm<Dados>({
    resolver: zodResolver(schema),
    defaultValues: { data: dataInicial ?? isoDia(new Date()), status: "Confirmado", preco: 0, pet: "", hora: "" },
  })
  const { register, handleSubmit, setValue, control, formState, reset } = form
  const [servicoId, porte, data, userId, hora, pet] = useWatch({
    control,
    name: ["servico_id", "porte", "data", "user_id", "hora", "pet"],
  })
  const livres = useHorariosLivres(aberto ? data : null)

  const pets = useQuery({
    queryKey: ["pets", userId],
    enabled: !!userId,
    queryFn: async () => ok(await getSupabase().from("pets").select("id, nome, porte").eq("user_id", userId!)),
  })

  // Preço sugerido pela tabela de preço por porte
  useEffect(() => {
    const s = servicos.data?.find((x) => x.id === servicoId)
    const p = s?.precos.find((x) => x.porte === porte)
    if (p) setValue("preco", Number(p.preco))
  }, [servicoId, porte, servicos.data, setValue])

  const enviar = handleSubmit(async (d) => {
    const servico = servicos.data?.find((s) => s.id === d.servico_id)
    await criar.mutateAsync({
      user_id: d.user_id || null,
      cliente_nome: d.user_id ? null : d.cliente_nome,
      cliente_telefone: d.cliente_telefone || null,
      pet: d.pet,
      pet_id: pets.data?.find((p) => p.nome === d.pet)?.id ?? null,
      porte: d.porte,
      servico: servico?.nome ?? "",
      servico_id: d.servico_id,
      data: d.data,
      hora: d.hora,
      preco: d.preco,
      status: d.status,
      observacoes: d.observacoes || null,
    })
    limpar()
    setAberto(false)
  })

  function limpar() {
    reset()
    setCliente(null)
    setPetNovo(false)
  }

  function escolherPet(p: PetCadastrado) {
    setPetNovo(false)
    setValue("pet", p.nome, { shouldValidate: true })
    const pt = normalizarPorte(p.porte)
    if (pt) setValue("porte", pt, { shouldValidate: true })
  }

  const erro = (campo: keyof Dados) =>
    formState.errors[campo] && <p className="text-destructive text-xs">{formState.errors[campo]?.message as string}</p>

  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus /> Novo agendamento
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v)
          if (!v) limpar()
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo agendamento</DialogTitle>
            <DialogDescription>Para clientes que ligaram ou vieram ao balcão.</DialogDescription>
          </DialogHeader>
          <form onSubmit={enviar} className="space-y-4" noValidate id="form-novo-agendamento">
            <BuscaCliente
              escolhido={cliente}
              onEscolher={(c, p) => {
                setCliente(c)
                setValue("user_id", c?.user_id ?? "")
                setValue("cliente_nome", c?.nome ?? "")
                setValue("cliente_telefone", c?.telefone ?? "")
                setValue("pet", "")
                setPetNovo(false)
                if (p) escolherPet(p)
              }}
            />
            {!userId && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cliente_nome">Nome do cliente</Label>
                  <Input id="cliente_nome" {...register("cliente_nome")} />
                  {erro("cliente_nome")}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cliente_telefone">Telefone</Label>
                  <Input id="cliente_telefone" inputMode="tel" placeholder="(00) 00000-0000" {...register("cliente_telefone")} />
                  {erro("cliente_telefone")}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pet">Pet</Label>
                {pets.data?.length && !petNovo ? (
                  <Select
                    value={pets.data.some((x) => x.nome === pet) ? pet : ""}
                    onValueChange={(v) => {
                      if (v === "__novo__") {
                        setPetNovo(true)
                        setValue("pet", "")
                        return
                      }
                      const p = pets.data?.find((x) => x.nome === v)
                      if (p) escolherPet(p)
                    }}
                  >
                    <SelectTrigger id="pet" className="w-full">
                      <SelectValue placeholder="Escolha o pet" />
                    </SelectTrigger>
                    <SelectContent>
                      {pets.data.map((p) => (
                        <SelectItem key={p.id} value={p.nome}>
                          {p.nome}
                        </SelectItem>
                      ))}
                      <SelectItem value="__novo__">+ Outro pet (não cadastrado)</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="pet" placeholder="Nome do pet" {...register("pet")} />
                )}
                {erro("pet")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="porte">Porte</Label>
                <Select value={porte} onValueChange={(v) => setValue("porte", v as Dados["porte"], { shouldValidate: true })}>
                  <SelectTrigger id="porte" className="w-full">
                    <SelectValue placeholder="Porte" />
                  </SelectTrigger>
                  <SelectContent>
                    {PORTES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {erro("porte")}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="servico_id">Serviço</Label>
              <Select value={servicoId} onValueChange={(v) => setValue("servico_id", v, { shouldValidate: true })}>
                <SelectTrigger id="servico_id" className="w-full">
                  <SelectValue placeholder={servicos.isLoading ? "Carregando…" : "Escolha o serviço"} />
                </SelectTrigger>
                <SelectContent>
                  {servicos.data
                    ?.filter((s) => s.ativo)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {servicos.data?.length === 0 && (
                <p className="text-muted-foreground text-xs">Cadastre serviços em “Serviços e preços”.</p>
              )}
              {erro("servico_id")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" {...register("data", { onChange: () => setValue("hora", "") })} />
                {erro("data")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="preco">Preço (R$)</Label>
                <Input id="preco" type="number" step="0.01" min="0" {...register("preco")} />
                {erro("preco")}
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Horário</legend>
              {livres.isLoading ? (
                <Spinner />
              ) : livres.data?.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {livres.data.map((h) => (
                    <Button
                      key={h.hora}
                      type="button"
                      size="sm"
                      variant={hora === h.hora ? "default" : "outline"}
                      aria-pressed={hora === h.hora}
                      onClick={() => setValue("hora", h.hora, { shouldValidate: true })}
                      title={`${h.vagas} vaga(s)`}
                    >
                      {h.hora}
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground text-xs">Sem grade de horários para esse dia — informe manualmente.</p>
                  <Input type="time" aria-label="Horário" {...register("hora")} />
                </>
              )}
              {erro("hora")}
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="status">Situação</Label>
              <Select
                defaultValue="Confirmado"
                onValueChange={(v) => setValue("status", v as Dados["status"])}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Confirmado">Confirmado</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" maxLength={500} {...register("observacoes")} />
            </div>
          </form>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                limpar()
                setAberto(false)
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" form="form-novo-agendamento" disabled={criar.isPending}>
              {criar.isPending && <Spinner />} Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
