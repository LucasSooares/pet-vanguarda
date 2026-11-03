"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Confirmar } from "@/components/confirmar"
import { Carregando, EstadoQuery, PageHeader, Spinner } from "@/components/estados"
import { useSessao } from "@/components/sessao"
import { useConfiguracoes } from "@/features/configuracoes/api"
import { getSupabase } from "@/lib/supabase/client"
import { mensagemErro, ok } from "@/lib/erros"
import { formatarDataHora } from "@/lib/format"
import type { AuditLog, Configuracoes } from "@/lib/database.types"

// ---------- Dados do petshop ----------
const dadosSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  telefone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: z.union([z.email("E-mail inválido"), z.literal("")]).optional(),
  endereco: z.string().trim().max(200).optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || v.replace(/\D/g, "").length === 14, "CNPJ deve ter 14 dígitos"),
  instagram: z.string().trim().max(60).optional(),
})
type DadosPetshop = z.infer<typeof dadosSchema>

function useSalvarConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (campos: Partial<Configuracoes>) => {
      const { error } = await getSupabase().from("configuracoes").update(campos).eq("id", 1)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Configurações salvas")
      qc.invalidateQueries({ queryKey: ["configuracoes"] })
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })
}

function DadosPetshopForm() {
  const config = useConfiguracoes()
  const salvar = useSalvarConfig()
  const { register, handleSubmit, reset, formState } = useForm<DadosPetshop>({ resolver: zodResolver(dadosSchema) })
  useEffect(() => {
    if (config.data)
      reset({
        nome: config.data.nome,
        telefone: config.data.telefone ?? "",
        whatsapp: config.data.whatsapp ?? "",
        email: config.data.email ?? "",
        endereco: config.data.endereco ?? "",
        cnpj: config.data.cnpj ?? "",
        instagram: config.data.instagram ?? "",
      })
  }, [config.data, reset])
  if (config.isLoading) return <Carregando />

  const campos: [keyof DadosPetshop, string][] = [
    ["nome", "Nome do petshop"],
    ["telefone", "Telefone"],
    ["whatsapp", "WhatsApp"],
    ["email", "E-mail"],
    ["cnpj", "CNPJ"],
    ["instagram", "Instagram"],
  ]
  return (
    <form
      noValidate
      className="bg-card shadow-soft grid gap-4 rounded-2xl border p-5 sm:grid-cols-2"
      onSubmit={handleSubmit((d) => salvar.mutate(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v || null])) as Partial<Configuracoes>))}
    >
      {campos.map(([c, rotulo]) => (
        <div key={c} className="space-y-2">
          <Label htmlFor={`cfg-${c}`}>{rotulo}</Label>
          <Input id={`cfg-${c}`} {...register(c)} />
          {formState.errors[c] && <p className="text-destructive text-xs">{formState.errors[c]?.message}</p>}
        </div>
      ))}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="cfg-endereco">Endereço</Label>
        <Input id="cfg-endereco" {...register("endereco")} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending && <Spinner />} Salvar
        </Button>
      </div>
    </form>
  )
}

// ---------- Mensagens padrão ----------
const MENSAGENS: [string, string][] = [
  ["agendamento_confirmado", "Agendamento confirmado"],
  ["agendamento_cancelado", "Agendamento cancelado"],
  ["lembrete", "Lembrete (véspera)"],
  ["pedido_pronto", "Pedido pronto para retirada"],
  ["pedido_saiu", "Pedido saiu para entrega"],
]

function MensagensForm() {
  const config = useConfiguracoes()
  const salvar = useSalvarConfig()
  const [msgs, setMsgs] = useState<Record<string, string>>({})
  useEffect(() => {
    if (config.data) setMsgs(config.data.mensagens ?? {})
  }, [config.data])
  if (config.isLoading) return <Carregando />
  return (
    <form
      className="bg-card shadow-soft space-y-4 rounded-2xl border p-5"
      onSubmit={(e) => {
        e.preventDefault()
        const r = z.record(z.string(), z.string().max(500, "Máximo 500 caracteres")).safeParse(msgs)
        if (!r.success) return toast.error(r.error.issues[0].message)
        salvar.mutate({ mensagens: r.data })
      }}
    >
      <p className="text-muted-foreground text-sm">
        Usadas no botão de WhatsApp. Variáveis: <code>{"{cliente} {pet} {servico} {data} {hora} {motivo} {numero}"}</code>
      </p>
      {MENSAGENS.map(([chave, rotulo]) => (
        <div key={chave} className="space-y-2">
          <Label htmlFor={`msg-${chave}`}>{rotulo}</Label>
          <Textarea
            id={`msg-${chave}`}
            maxLength={500}
            value={msgs[chave] ?? ""}
            onChange={(e) => setMsgs((m) => ({ ...m, [chave]: e.target.value }))}
          />
        </div>
      ))}
      <Button type="submit" disabled={salvar.isPending}>
        {salvar.isPending && <Spinner />} Salvar mensagens
      </Button>
    </form>
  )
}

// ---------- Equipe ----------
const membroSchema = z.object({
  email: z.email("E-mail inválido").trim().toLowerCase(),
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  papel: z.enum(["admin", "atendente"]),
})
type Membro = z.infer<typeof membroSchema>

function Equipe() {
  const { user } = useSessao()
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const equipe = useQuery({
    queryKey: ["equipe"],
    queryFn: async () => ok(await getSupabase().rpc("listar_equipe")) ?? [],
  })
  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<Membro>({
    resolver: zodResolver(membroSchema),
    defaultValues: { papel: "atendente" },
  })
  const invalidar = () => qc.invalidateQueries({ queryKey: ["equipe"] })

  const convidar = useMutation({
    mutationFn: async (d: Membro) => {
      // 1) Se o usuário já existe no Auth, só adiciona à equipe
      const existente = await getSupabase().rpc("adicionar_membro_equipe", { p_email: d.email, p_nome: d.nome, p_papel: d.papel })
      if (!existente.error) return "adicionado"
      if (!/USUARIO_NAO_ENCONTRADO/.test(existente.error.message)) throw existente.error
      // 2) Senão, tenta enviar convite pela rota de servidor (requer service_role configurada)
      const r = await fetch("/api/equipe/convidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      })
      const corpo = await r.json().catch(() => ({}))
      if (r.status === 501)
        throw new Error(
          "Esse e-mail ainda não tem conta. Convide pelo Supabase (Authentication → Users → Invite user) e depois adicione aqui."
        )
      if (!r.ok) throw new Error(corpo.erro ?? "Falha ao convidar")
      return "convidado"
    },
    onSuccess: (r) => {
      toast.success(r === "convidado" ? "Convite enviado por e-mail" : "Membro adicionado à equipe")
      invalidar()
      reset({ papel: "atendente", email: "", nome: "" })
      setAberto(false)
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const alterarPapel = useMutation({
    mutationFn: async ({ id, papel }: { id: string; papel: "admin" | "atendente" }) => {
      const { error } = await getSupabase().from("admins").update({ papel }).eq("user_id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Papel atualizado")
      invalidar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from("admins").delete().eq("user_id", id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success("Removido da equipe")
      invalidar()
    },
    onError: (e) => toast.error(mensagemErro(e)),
  })

  return (
    <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
      <div className="flex items-center justify-between border-b p-4">
        <p className="text-muted-foreground text-sm">
          <strong>Admin</strong>: tudo. <strong>Atendente</strong>: agenda, agendamentos, pedidos e clientes.
        </p>
        <Button onClick={() => setAberto(true)}>
          <UserPlus /> Convidar
        </Button>
      </div>
      <EstadoQuery query={equipe}>
        {(lista) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="hidden md:table-cell">Último acesso</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>
                    <p className="font-medium">{m.nome}</p>
                    <p className="text-muted-foreground text-xs">{m.email}</p>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.papel}
                      onValueChange={(v) => alterarPapel.mutate({ id: m.user_id, papel: v as Membro["papel"] })}
                      disabled={m.user_id === user.id}
                    >
                      <SelectTrigger className="w-36" aria-label={`Papel de ${m.nome}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="atendente">Atendente</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatarDataHora(m.ultimo_login)}</TableCell>
                  <TableCell>
                    {m.user_id !== user.id && (
                      <Confirmar
                        gatilho={
                          <Button size="icon" variant="ghost" aria-label={`Remover ${m.nome}`}>
                            <Trash2 className="size-4" />
                          </Button>
                        }
                        titulo={`Remover ${m.nome} da equipe?`}
                        descricao="A pessoa perde o acesso ao portal imediatamente. A conta no app continua existindo."
                        textoConfirmar="Remover"
                        onConfirmar={() => remover.mutateAsync(m.user_id)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EstadoQuery>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar para a equipe</DialogTitle>
            <DialogDescription>
              Se o e-mail já tem conta, a pessoa é adicionada na hora. Senão, enviamos um convite (se o servidor estiver configurado).
            </DialogDescription>
          </DialogHeader>
          <form id="form-membro" noValidate className="space-y-4" onSubmit={handleSubmit((d) => convidar.mutate(d))}>
            <div className="space-y-2">
              <Label htmlFor="m-nome">Nome</Label>
              <Input id="m-nome" {...register("nome")} />
              {formState.errors.nome && <p className="text-destructive text-xs">{formState.errors.nome.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-email">E-mail</Label>
              <Input id="m-email" type="email" {...register("email")} />
              {formState.errors.email && <p className="text-destructive text-xs">{formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-papel">Papel</Label>
              <Select value={watch("papel")} onValueChange={(v) => setValue("papel", v as Membro["papel"])}>
                <SelectTrigger id="m-papel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atendente">Atendente</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-membro" disabled={convidar.isPending}>
              {convidar.isPending && <Spinner />} Convidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Auditoria ----------
const ROTULO_ACAO: Record<string, string> = {
  "agendamento.cancelado": "Agendamento cancelado",
  "agendamento.falta": "Falta registrada",
  "agendamento.preco_alterado": "Preço de agendamento alterado",
  "agendamento.remarcado": "Agendamento remarcado",
  "pedido.cancelado": "Pedido cancelado",
  "produto.preco_alterado": "Preço de produto alterado",
  "servico.preco_alterado": "Preço de serviço alterado",
  "estoque.ajuste": "Ajuste de estoque",
  "estoque.entrada": "Entrada de estoque",
  "estoque.saida": "Saída de estoque",
  "equipe.membro_salvo": "Equipe alterada",
}

function Auditoria() {
  const log = useQuery({
    queryKey: ["auditoria"],
    queryFn: async () => {
      const supabase = getSupabase()
      const linhas = (ok(await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300)) ??
        []) as AuditLog[]
      const equipe = ok(await supabase.rpc("listar_equipe")) ?? []
      const nomes = new Map(equipe.map((m) => [m.user_id, m.nome]))
      return linhas.map((l) => ({ ...l, quem: l.user_id ? (nomes.get(l.user_id) ?? "Cliente (app)") : "Sistema" }))
    },
  })
  return (
    <div className="bg-card shadow-soft overflow-hidden rounded-2xl border">
      <EstadoQuery query={log} vazio={(d) => d.length === 0}>
        {(lista) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>O quê</TableHead>
                <TableHead className="hidden md:table-cell">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatarDataHora(l.created_at)}</TableCell>
                  <TableCell>{l.quem}</TableCell>
                  <TableCell>{ROTULO_ACAO[l.acao] ?? l.acao}</TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md truncate font-mono text-xs md:table-cell">
                    {JSON.stringify(l.dados)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </EstadoQuery>
    </div>
  )
}

export default function ConfiguracoesPage() {
  return (
    <>
      <PageHeader titulo="Configurações" descricao="Dados do petshop, equipe, mensagens e auditoria." />
      <Tabs defaultValue="dados">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="dados">Petshop</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="mensagens">Mensagens padrão</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <DadosPetshopForm />
        </TabsContent>
        <TabsContent value="equipe">
          <Equipe />
        </TabsContent>
        <TabsContent value="mensagens">
          <MensagensForm />
        </TabsContent>
        <TabsContent value="auditoria">
          <Auditoria />
        </TabsContent>
      </Tabs>
    </>
  )
}
