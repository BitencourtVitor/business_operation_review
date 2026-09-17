"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

// Saiu deploy e esta aba continua com o código antigo. Ela não é deslogada, mas
// também não segue: o que está na tela pode chamar rota que mudou de forma, e o
// erro apareceria longe da causa. Por isso o aviso cobre tudo.
//
// Só no Atlas: é o produto que fica aberto o dia inteiro no aparelho de campo.
const INTERVALO_MS = 5 * 60 * 1000

export function VersionGate() {
  const [desatualizado, setDesatualizado] = useState(false)

  useEffect(() => {
    const meu = process.env.NEXT_PUBLIC_BUILD_SHA ?? ""
    // Sem versão gravada (desenvolvimento) não há o que comparar.
    if (!meu) return

    let vivo = true
    async function conferir() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { sha } = (await res.json()) as { sha?: string }
        if (vivo && sha && sha !== meu) setDesatualizado(true)
      } catch {
        // Sem rede não se conclui nada: o aparelho de campo perde sinal o tempo
        // todo, e bloquear a tela por isso seria o oposto do que o offline faz.
      }
    }

    conferir()
    const timer = setInterval(conferir, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => {
      vivo = false
      clearInterval(timer)
      document.removeEventListener("visibilitychange", aoVoltar)
    }
  }, [])

  if (!desatualizado) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-center shadow-lg">
        <h2 className="flex items-center justify-center gap-2 text-base font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_black.png" alt="Premium" className="h-5 w-5 shrink-0 object-contain dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-5 w-5 shrink-0 object-contain dark:block" />
          New version available
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Refresh the page to continue.
        </p>
        <Button className="mt-4 w-full" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Refresh page
        </Button>
      </div>
    </div>
  )
}
