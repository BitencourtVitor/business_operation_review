"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { getQueryClient } from "@/lib/query-client"
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ThemeProvider } from "next-themes"
import { useEffect, useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  // O mesmo cliente que o offline semeia e guarda no aparelho.
  const [queryClient] = useState(getQueryClient)

  // O Safari do iPhone ignora `user-scalable=no` por acessibilidade, e o
  // `touch-action` do CSS não segura a pinça em todas as versões. O gesto nativo
  // de zoom chega como `gesturestart`, e cancelá-lo é o que de fato trava.
  // O visualizador de plano segue ampliando: o zoom dele vem de eventos de
  // ponteiro, que este bloqueio não toca.
  useEffect(() => {
    const bloquear = (e: Event) => e.preventDefault()
    document.addEventListener("gesturestart", bloquear, { passive: false })
    document.addEventListener("gesturechange", bloquear, { passive: false })
    return () => {
      document.removeEventListener("gesturestart", bloquear)
      document.removeEventListener("gesturechange", bloquear)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  )
}
