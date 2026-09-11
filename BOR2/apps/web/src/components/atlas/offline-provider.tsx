"use client"

import { useEffect, useState } from "react"

import { instalarSincronizacao } from "@/lib/offline/sync"
import { medirEspaco, type Espaco } from "@/lib/offline/storage"

/**
 * Liga o offline quando o Atlas abre.
 *
 * Faz três coisas, e nenhuma delas bloqueia a tela: registra o Service Worker,
 * instala os gatilhos de sincronização, e mede o espaço uma vez para o resto do
 * app poder consultar sem medir de novo a cada pergunta.
 *
 * Fica num componente e não num efeito solto na página porque precisa viver
 * enquanto o Atlas estiver aberto, e desmontar limpo quando a pessoa sair para o
 * BOR: gatilho de `online` que sobrevive à navegação continua sincronizando uma
 * obra que ninguém está mais olhando.
 */
export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [espaco, setEspaco] = useState<Espaco | null>(null)

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
    const desligar = instalarSincronizacao()
    void medirEspaco().then(setEspaco)
    return desligar
  }, [])

  // O espaço é medido e guardado, mas nada é mostrado aqui. Quem mostra é a tela
  // que vai baixar, no momento em que a pergunta "cabe?" importa. Um indicador
  // permanente de armazenamento seria ruído em toda visita para uma informação
  // que só interessa duas vezes por mês.
  void espaco

  return <>{children}</>
}
