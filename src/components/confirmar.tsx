"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/estados"

/**
 * Diálogo de confirmação para ações destrutivas.
 * Com `pedirMotivo`, exige um texto (mín. 3 caracteres) que é passado para `onConfirmar`.
 */
export function Confirmar({
  gatilho,
  titulo,
  descricao,
  textoConfirmar = "Confirmar",
  destrutivo = true,
  pedirMotivo,
  onConfirmar,
}: {
  gatilho: React.ReactNode
  titulo: string
  descricao?: React.ReactNode
  textoConfirmar?: string
  destrutivo?: boolean
  pedirMotivo?: string
  onConfirmar: (motivo: string) => Promise<unknown> | void
}) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const motivoInvalido = !!pedirMotivo && motivo.trim().length < 3

  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v)
        if (!v) setMotivo("")
      }}
    >
      <AlertDialogTrigger asChild>{gatilho}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        {pedirMotivo && (
          <div className="space-y-2">
            <Label htmlFor="motivo-confirmacao">{pedirMotivo}</Label>
            <Textarea
              id="motivo-confirmacao"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              autoFocus
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando || motivoInvalido}
            className={destrutivo ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={async (e) => {
              e.preventDefault()
              setEnviando(true)
              try {
                await onConfirmar(motivo.trim())
                setAberto(false)
                setMotivo("")
              } catch {
                // o chamador mostra o toast de erro
              } finally {
                setEnviando(false)
              }
            }}
          >
            {enviando && <Spinner />}
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
