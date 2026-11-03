"use client"

import { useEffect } from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BotaoImprimir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="no-print mb-4 flex justify-end">
      <Button onClick={() => window.print()}>
        <Printer /> Imprimir
      </Button>
    </div>
  )
}
