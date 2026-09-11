"use client"

import { onlineManager, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { instalarSincronizacao } from "@/lib/offline/sync"
import { persistirConsultas, restaurarConsultas } from "@/lib/query-client"

/**
 * Liga o offline quando o Atlas abre.
 *
 * Registra o Service Worker, instala os gatilhos de sincronização, e devolve ao
 * cache as consultas que o aparelho guardou.
 *
 * Fica num componente e não num efeito solto na página porque precisa viver
 * enquanto o Atlas estiver aberto, e desmontar limpo quando a pessoa sair para o
 * BOR: gatilho de `online` que sobrevive à navegação continua sincronizando uma
 * obra que ninguém está mais olhando.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  // As telas só montam depois da restauração. Montando antes, a consulta sem
  // rede não encontra dado, e a tela desenha "nada aqui" por um instante antes
  // do retrato chegar, ou para sempre se a consulta falhar primeiro.
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    // O registro é silencioso de propósito. Navegador sem suporte, contexto sem
    // HTTPS e usuário com service worker bloqueado são todos casos em que o app
    // continua funcionando com rede, e falar disso na tela seria alarmar sobre
    // algo que a pessoa não pode resolver ali.
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined)
      } else {
        // Em desenvolvimento o worker atrapalha mais do que ajuda: o servidor
        // recompila o arquivo sem mudar o nome, e qualquer cache no meio serve a
        // versão velha. Aqui ele não é registrado, e o que ficou de uma visita
        // anterior é desfeito.
        navigator.serviceWorker.getRegistrations()
          .then(rs => rs.forEach(r => r.unregister()))
          .catch(() => undefined)
      }
    }

    // O TanStack começa supondo que há rede e só muda de ideia no evento
    // `offline`. O app aberto já sem sinal nunca recebe esse evento: as consultas
    // tentavam, falhavam, e a tela trocava o dado guardado por erro. Dizendo a
    // verdade logo de início, a consulta sem rede fica em pausa e o dado fica.
    onlineManager.setOnline(navigator.onLine)

    let vivo = true
    let pararDeGravar = () => {}
    // Teto de espera: banco travado não pode prender o app numa tela em branco.
    const teto = new Promise<void>(r => setTimeout(r, 1500))
    void Promise.race([restaurarConsultas(qc), teto]).finally(() => {
      if (!vivo) return
      pararDeGravar = persistirConsultas(qc)
      setPronto(true)
    })
    const desligar = instalarSincronizacao()
    return () => {
      vivo = false
      desligar()
      pararDeGravar()
    }
  }, [qc])

  if (!pronto) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
