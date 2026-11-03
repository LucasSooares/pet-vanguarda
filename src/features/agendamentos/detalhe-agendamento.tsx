"use client"

import { useState } from "react"
import { CalendarClock, Check, CheckCheck, MessageCircle, UserX, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Confirmar } from "@/components/confirmar"
import { Spinner } from "@/components/estados"
import { StatusAgendamentoBadge } from "@/components/status-badge"
import { useConfiguracoes } from "@/features/configuracoes/api"
import { useAtualizarAgendamento, useHorariosLivres, type AgendamentoDetalhado } from "./api"
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarTelefone,
  linkWhatsApp,
  normalizarHora,
  preencherModelo,
} from "@/lib/format"
import { normalizarPorte, normalizarStatusAgendamento } from "@/lib/status"

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium break-words">{children || "—"}</dd>
    </div>
  )
}

function Remarcar({ ag, onFeito }: { ag: AgendamentoDetalhado; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(ag.data)
  const [hora, setHora] = useState("")
  const livres = useHorariosLivres(aberto ? data : null)
  const atualizar = useAtualizarAgendamento()

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <CalendarClock /> Remarcar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remarcar agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remarcar-data">Nova data</Label>
              <Input
                id="remarcar-data"
                type="date"
                value={data}
                onChange={(e) => {
                  setData(e.target.value)
                  setHora("")
                }}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Horário livre</legend>
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
                      onClick={() => setHora(h.hora)}
                      aria-pressed={hora === h.hora}
                    >
                      {h.hora}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">
                    Nenhum horário livre configurado para esse dia. Informe manualmente:
                  </p>
                  <Input type="time" aria-label="Horário" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              )}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button
              disabled={!data || !hora || atualizar.isPending}
              onClick={() =>
                atualizar.mutate(
                  { id: ag.id, campos: { data, hora } },
                  {
                    onSuccess: () => {
                      toast.success(`Remarcado para ${formatarData(data)} às ${hora}`)
                      setAberto(false)
                      onFeito()
                    },
                  }
                )
              }
            >
              {atualizar.isPending && <Spinner />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DetalheAgendamento({
  agendamento: ag,
  onFechar,
}: {
  agendamento: AgendamentoDetalhado | null
  onFechar: () => void
}) {
  const atualizar = useAtualizarAgendamento()
  const config = useConfiguracoes()

  if (!ag) return null
  const status = normalizarStatusAgendamento(ag.status)
  const ativo = status === "Pendente" || status === "Confirmado"
  const nomeCliente = ag.cliente?.nome ?? ag.cliente_nome ?? "Cliente sem cadastro"
  const telefone = ag.cliente?.telefone ?? ag.cliente_telefone
  const porte = normalizarPorte(ag.porte ?? ag.petInfo?.porte)

  const mudar = (novo: string, msg: string, extra: Record<string, unknown> = {}) =>
    atualizar.mutateAsync({ id: ag.id, campos: { status: novo, ...extra } }).then(() => toast.success(msg))

  const mensagem = (chave: string, motivo = "") =>
    preencherModelo(config.data?.mensagens?.[chave] ?? "", {
      cliente: nomeCliente.split(" ")[0],
      servico: ag.servico,
      pet: ag.pet ?? "",
      data: formatarData(ag.data),
      hora: normalizarHora(ag.hora),
      motivo,
    })
  const whats = linkWhatsApp(telefone, mensagem(status === "Cancelado" ? "agendamento_cancelado" : "agendamento_confirmado", ag.motivo_cancelamento ?? ""))

  return (
    <Sheet open={!!ag} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {ag.servico} <StatusAgendamentoBadge status={ag.status} />
          </SheetTitle>
          <SheetDescription>
            {formatarData(ag.data, "EEEE, dd 'de' MMMM")} às {normalizarHora(ag.hora)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {ag.petInfo?.foto && /^https?:/.test(ag.petInfo.foto) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ag.petInfo.foto} alt={`Foto de ${ag.petInfo.nome}`} className="h-40 w-full rounded-xl object-cover" />
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold">Cliente</h3>
            <dl>
              <Linha rotulo="Nome">{nomeCliente}</Linha>
              <Linha rotulo="Telefone">{formatarTelefone(telefone)}</Linha>
              <Linha rotulo="E-mail">{ag.cliente?.email}</Linha>
              <Linha rotulo="Origem">{ag.origem === "balcao" ? "Balcão / telefone" : "App"}</Linha>
            </dl>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Pet</h3>
            <dl>
              <Linha rotulo="Nome">{ag.petInfo?.nome ?? ag.pet}</Linha>
              <Linha rotulo="Espécie / raça">
                {[ag.petInfo?.especie, ag.petInfo?.raca].filter(Boolean).join(" · ")}
              </Linha>
              <Linha rotulo="Porte">{porte}</Linha>
              <Linha rotulo="Observações do pet">{ag.petInfo?.observacoes}</Linha>
            </dl>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Atendimento</h3>
            <dl>
              <Linha rotulo="Preço">{formatarMoeda(ag.preco)}</Linha>
              <Linha rotulo="Observações">{ag.observacoes}</Linha>
              {ag.motivo_cancelamento && <Linha rotulo="Motivo">{ag.motivo_cancelamento}</Linha>}
              <Linha rotulo="Criado em">{formatarDataHora(ag.created_at)}</Linha>
            </dl>
          </section>

          <div className="flex flex-wrap gap-2">
            {status === "Pendente" && (
              <Button onClick={() => mudar("Confirmado", "Agendamento confirmado")} disabled={atualizar.isPending}>
                <Check /> Confirmar
              </Button>
            )}
            {ativo && (
              <Button variant="secondary" onClick={() => mudar("Concluído", "Atendimento concluído")} disabled={atualizar.isPending}>
                <CheckCheck /> Concluir
              </Button>
            )}
            {ativo && <Remarcar ag={ag} onFeito={onFechar} />}
            {ativo && (
              <Confirmar
                gatilho={
                  <Button variant="outline">
                    <UserX /> Marcar falta
                  </Button>
                }
                titulo="Marcar falta?"
                descricao="O cliente não compareceu. A falta fica registrada no histórico do cliente e no relatório de faltas."
                textoConfirmar="Marcar falta"
                onConfirmar={() => mudar("Falta", "Falta registrada")}
              />
            )}
            {ativo && (
              <Confirmar
                gatilho={
                  <Button variant="outline" className="text-destructive">
                    <X /> Cancelar
                  </Button>
                }
                titulo="Cancelar agendamento?"
                descricao="Se o horário ainda não passou, a vaga fica disponível para outro cliente. O cancelamento fica registrado na auditoria."
                textoConfirmar="Cancelar agendamento"
                pedirMotivo="Motivo do cancelamento"
                onConfirmar={(motivo) => mudar("Cancelado", "Agendamento cancelado", { motivo_cancelamento: motivo })}
              />
            )}
            {whats && (
              <Button variant="ghost" asChild>
                <a href={whats} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
